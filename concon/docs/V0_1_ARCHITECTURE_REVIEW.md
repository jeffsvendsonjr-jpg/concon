# ConCon v0.1 architecture review

Response to `docs/V0_1_BRIEF.md` (realigned). No significant code has been
written since the realignment. The ten sections below match the review
requirements in the brief.

Where this document contradicts the earlier outline-first review (Jan 2026),
this document supersedes it.

---

## 1. Proposed file structure

```
concon/
├── AGENTS.md
├── README.md
├── .gitignore
├── docs/
│   ├── V0_1_BRIEF.md
│   └── V0_1_ARCHITECTURE_REVIEW.md            ← this file
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── content/
│   │   │   ├── observer.js                    MutationObserver → core
│   │   │   ├── selectors.js                   single source of truth for DOM selectors
│   │   │   └── panel-mount.js                 shadow-DOM right-side panel host
│   │   ├── panel/
│   │   │   ├── index.html
│   │   │   ├── panel.js                       ledger + referent + divergence UI
│   │   │   └── panel.css                      scoped inside shadow root
│   │   ├── core/                              pure JS, no DOM, unit-testable in Node
│   │   │   ├── message-model.js               MessageRecord, TurnRecord, ID rules
│   │   │   ├── segmenter.js                   internal outline / topic grouping
│   │   │   ├── outline.js                     builds/updates outline substrate
│   │   │   ├── commitment-extract.js          heuristics + local classifier bridge
│   │   │   ├── referent-scan.js               NP/pronoun detection + candidate scoring
│   │   │   ├── divergence.js                  confirmed-set vs. assistant-turn compare
│   │   │   ├── ledger.js                      ledger state, transitions, persistence hooks
│   │   │   ├── redact.js                      label-only PII/secret scrubbing
│   │   │   └── store.js                       in-memory + IndexedDB persistence
│   │   ├── ml/                                bundled local-model runtime (Path B)
│   │   │   ├── runtime.js                     transformers.js loader, warm-up, lifecycle
│   │   │   ├── commitment-classifier.js       NLI zero-shot wrapper
│   │   │   ├── embeddings.js                  sentence embeddings for referent scoring
│   │   │   └── models/                        checked-in ONNX weights + tokenizers
│   │   │       └── README.md                  model IDs, versions, licenses, hashes
│   │   └── background/
│   │       └── service-worker.js              MV3 stub; no logic in v0.1
│   └── assets/
│       └── icons/                             16/48/128
```

Rationale (deltas from the outline-first review):

- New top-level `ml/` folder inside `src/`. Isolating the model runtime from
  `core/` keeps `core/` pure JS and unit-testable without loading any model.
  `core/commitment-extract.js` and `core/referent-scan.js` call *into* `ml/`
  through narrow interfaces; they never `import` model files directly.
- `ml/models/README.md` is doctrinally significant. Every bundled model is
  named, versioned, licensed, and hashed here. Model updates are reviewed;
  they are not routine dependency bumps.
- The old topic-segmenter (`segmenter.js`, `outline.js`) is retained as
  **substrate**. It groups turns by topic so the ledger can be organized
  under topic headers when the conversation is long. It is no longer the
  visible product.

---

## 2. Technical architecture

Per open ChatGPT tab:

1. **Content script** injects at `document_idle` on `https://chatgpt.com/*`.
   Mounts the shadow-DOM panel; starts the `MutationObserver` against
   ChatGPT's chat scroll container.
2. **Observer** emits `{event, messageId, turnIndex, role, text}` into
   `core/`.
3. **Core** (message model → outline → commitment-extract → referent-scan →
   ledger → divergence) is pure JS in the content script's isolated world.
   It:
   - assigns/verifies stable IDs,
   - maintains the outline substrate,
   - extracts commitment-shaped statements,
   - detects referring expressions and scores their candidates,
   - maintains the ledger state (proposed / confirmed / asserted /
     acknowledged / contested),
   - computes divergence on each new assistant turn.
4. **ML runtime** lives in `ml/`. It is lazy-loaded on first need (not at
   extension install, not at page load). Once loaded it stays warm for the
   lifetime of the tab. Two model roles:
   - **Commitment classifier.** Zero-shot NLI over sentence fragments,
     labels `{commitment, proposal, question, statement, hedge}`. Used by
     `commitment-extract.js` after fast heuristic pre-filtering.
   - **Sentence embeddings.** A small MiniLM-class model producing
     384-dim vectors. Used by `referent-scan.js` to score candidate
     bindings for pronouns / definite noun phrases against prior turns.
5. **Panel** (shadow DOM) renders three surfaces:
   - **Ledger** (two columns; entry lifecycle rules in §6).
   - **Referent Tracker** (contextual popover on the source turn when a
     referring expression has multiple candidates).
   - **Divergence marker** (a colored dot beside the assistant turn in the
     transcript scroll; a corresponding entry in the panel).
6. **Persistence** = IndexedDB keyed by ChatGPT `conversationId`. Stores
   `{messages[], outline, ledgerEntries[], referentBindings[], divergences[],
     updatedAt}`. Everything else (embeddings, model warm state) is
   ephemeral per tab.
7. **Background service worker** = MV3 stub. No logic, no fetches, no
   cross-tab coordination in v0.1.

Manifest (target shape):

```json
{
  "manifest_version": 3,
  "name": "ConCon",
  "version": "0.1.0",
  "host_permissions": ["https://chatgpt.com/*"],
  "permissions": ["storage"],
  "content_scripts": [{
    "matches": ["https://chatgpt.com/*"],
    "js": ["src/content/panel-mount.js", "src/content/observer.js"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["src/ml/models/*", "src/ml/runtime.js"],
    "matches": ["https://chatgpt.com/*"]
  }],
  "background": { "service_worker": "src/background/service-worker.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'"
  }
}
```

What is absent — and doctrinally must remain absent: no `<all_urls>`, no
`webRequest`, no `declarativeNetRequest`, no remote hosts in `host_permissions`,
no `optional_host_permissions`, no `connect-src` beyond `'self'`. The
`wasm-unsafe-eval` directive is required for the local-model runtime; it
does *not* grant network access. The extension is technically incapable of
exfiltration. This is verifiable in `chrome://extensions` → details.

---

## 3. Observing and uniquely tracking ChatGPT messages

Unchanged in substance from the outline-first review. Summarized here for
completeness.

**Available DOM signals (Jan 2026):** `data-message-id` (UUID from
ChatGPT), `data-message-author-role`, `data-testid="conversation-turn-<N>"`.
All accessed via `selectors.js` so a single-file hotfix handles UI changes.

**Stable identity:** we use `data-message-id` verbatim. We never invent
IDs. Messages without one are dropped, not synthesized.

**Handled edge cases:** streaming (750 ms stability window before offering
to core), regenerate (new ID, linked via `regeneratesId`), user edit-fork
(follow visible branch, mark fork point), virtualized scroll (store is
source of truth; DOM is not), SPA navigation (`history.pushState` /
`popstate` triggers remount against the new `conversationId`).

The message model is extended by one field for the ledger:

```
TurnRecord {
  ...MessageRecord,
  extractedAt: number | null,   // when commitment-extract last ran
  extractionModelVersion: string | null
}
```

Turns are re-extracted if the bundled commitment classifier is updated
between conversations; this is why the model version is stored per turn.

---

## 4. Commitment-shaped statement extraction

Pipeline per turn (both human and assistant):

**Stage 1 — sentence split.** Deterministic, in-JS, no model. Simple
splitter with clause-level fallback (`. ! ?` respecting quotes, code
fences, and abbreviations). Code blocks are excluded from extraction; they
are not treated as prose commitments.

**Stage 2 — fast heuristic filter.** Cheap pattern match to identify
sentences plausibly commitment-shaped. Only these sentences enter Stage 3;
everything else is tagged `statement` and skipped.

Human-column cues:
`I will`, `I'll`, `I'm going to`, `I've decided`, `let's`, `we should`,
`I want to`, `I need to`, `I'm going to`, `plan is`, `going with`,
imperatives at sentence start (`Do`, `Use`, `Skip`, `Ship`, …).

Assistant-column cues:
`I'll`, `I have`, `I've`, `the plan is`, `going to`, `we'll`, `next step`,
`I recommend`, `I've done`, `the answer is`, definite assertions
(`X is Y`, `X requires Y`, `X will Y`).

Hedge cues (down-weight, never fully drop):
`maybe`, `might`, `could`, `perhaps`, `I think`, `probably`, `if you want`,
`one option`, `optionally`.

Stage 2 recall target: ≥ 90% (we accept over-generation; Stage 3 filters).

**Stage 3 — local classifier (Path B).** Each Stage 2 candidate is passed
to the bundled zero-shot NLI classifier with the label set:

```
{ commitment, proposal, question, statement, hedge, meta }
```

Classification runs on the sentence *and* a small window of preceding
context (previous 1–2 sentences of the same turn) to disambiguate hedges.
The classifier's confidence score is stored on the ledger entry so the UI
can render low-confidence entries with additional dimming.

**Stage 4 — ledger placement.** Each classified sentence produces an entry:

Human column:
- `commitment` → **proposed** (default). Awaits explicit confirm/dismiss.
- `proposal` → **proposed**, additionally tagged `explicitly_provisional`.
- `question` → dropped (questions do not enter the ledger).
- `statement`, `hedge`, `meta` → dropped.

Assistant column:
- `commitment` or definite `statement` about a fact → **asserted**.
- `proposal`, `hedge` → dropped, but retained in the outline substrate
  so referent-scan can still see them if a pronoun refers back.
- `question` → dropped.

**Stage 5 — deduplication.** If a new extracted entry is a paraphrase of an
existing one (cosine similarity of embeddings ≥ 0.85 within the same
conversation), the new one is linked to the existing entry, not created
anew. This prevents ledger bloat over long conversations where the same
commitment recurs.

Deterministic-only fallback: if the model runtime fails to load, Stage 3
is skipped and Stage 2's heuristic label is used directly. The ledger UI
marks such entries with a small "heuristic-only" indicator. This is the
Path A degradation path and it exists so a broken model does not disable
the ledger.

---

## 5. Referent detection and resolution

Referring expressions the tracker cares about in v0.1:

- **Pronouns:** `it`, `they`, `them`, `this`, `that`, `these`, `those`,
  `he`, `she` (rare in this domain but included).
- **Definite noun phrases (short list):** `the plan`, `the project`,
  `the constraint`, `the goal`, `the approach`, `the fix`, `the bug`,
  `the file`, `the extension`, `the task`, `the doc`, `the design`,
  `the decision`. This list is extensible per user in a later phase; in
  v0.1 it is a fixed vocabulary.

Detection: heuristic pattern match on tokenized turn text. Deterministic.

**Candidate scoring.** For each referring expression `r` in turn `t`:

1. **Recency window.** Take turns `[t-8, t-1]` as the candidate window.
   Turns older than 8 back are considered only if pinned earlier.
2. **Candidate set.** Extract head nouns and previously-tagged ledger
   entries from the window. Each candidate is a `(entity_text, source_turn)`
   pair.
3. **Score.** `score(r, c) = w1 * recency + w2 * grammatical_role_fit +
   w3 * embedding_similarity(context(r), context(c))`.
   - `recency`: exponential decay over turn distance.
   - `grammatical_role_fit`: does the candidate's grammatical role in its
     source turn match the expected role of `r` in `t` (subject/object)?
     Deterministic heuristic.
   - `embedding_similarity`: cosine similarity of MiniLM embeddings over a
     small text window around each. This is where the local embedding model
     earns its keep.
4. **Threshold behavior:**
   - Top candidate score > 0.75 AND margin over second > 0.15: **auto-bind**,
     rendered unobtrusively (small underline on hover).
   - Top candidate ambiguous (< 0.15 margin) OR top score < 0.75:
     **surface for pinning** in the tracker popover. The human clicks the
     intended candidate; the binding is stored.
5. **Pinned bindings feed forward.** If the same `(referring_expression,
     candidate)` recurs later in the same conversation, the pinned binding is
   preferred unless the local model produces a strong signal (> 0.85) that a
   rebinding has occurred.

Deterministic-only fallback (Path A degradation): if embeddings are
unavailable, `w3` is set to 0 and scoring uses recency + grammatical role
only. Auto-bind threshold rises to 0.85 so the tool errs toward surfacing
for pinning rather than silently binding wrong.

---

## 6. Divergence computation

Divergence is set-theoretic, computed on each new assistant turn. No model
is required for the comparison itself; the model's role was to populate the
inputs (extraction and referent binding).

For each new assistant turn `a`:

1. **Extract** commitment-shaped statements from `a` per §4.
2. **Resolve** referring expressions in `a` per §5.
3. **Compare** against the current ledger state. Divergence flags:

- **Type A — Unconfirmed premise.** Any assertion in `a` that presupposes
  a human-column entry currently in `proposed` state (never confirmed).
  Example: user proposed "let's use SQLite for the store"; assistant now
  says "I've written the SQLite schema." → the assistant is treating the
  proposal as committed. Flag: **yellow, low urgency**.
- **Type B — Contested-basis operation.** Any assertion in `a` that
  presupposes an entry the human has marked `contested`. Flag: **red,
  high urgency.**
- **Type C — Referent mismatch.** Any referring expression in `a` bound
  to a candidate different from what the human previously pinned for the
  same expression in this conversation. Flag: **orange.**
- **Type D — Assertion drift.** Any assistant assertion whose paraphrase
  match exists in the ledger with a *different* wording that changes truth
  conditions (e.g. earlier "we'll try X"; later "we chose X"). Detected by
  embedding similarity ≥ 0.85 combined with a modal-verb change detector
  (deterministic). Flag: **yellow, low urgency.**

Every divergence entry links to (a) the source ledger entry, (b) the
assistant turn that produced the divergence, (c) the specific span within
that turn. The panel shows a running list; each is clickable to jump.

Divergences are never auto-dismissed by re-analysis. They are dismissed
only by the human explicitly (`dismiss`, `now confirmed`, or by promoting
the underlying ledger entry). This is the doctrine ("silence is not
consent") applied to the tool's own output.

---

## 7. Deterministic/local vs. needs the bundled model

### Fully deterministic and local

- Message observation and ID tracking.
- Outline substrate segmentation (per the earlier review's rules).
- Sentence splitting.
- Heuristic Stage 2 filtering.
- Referent expression detection (pronouns, fixed definite NPs).
- Divergence comparison logic.
- Persistence, search, click-to-jump, "You are here" marker.
- Redaction (label-only regex scrubbing).
- Ledger state transitions and persistence.

### Requires the bundled model

- Commitment classification (Stage 3) — NLI zero-shot classifier,
  ~30–40 MB compressed.
- Referent candidate scoring — MiniLM sentence embeddings, ~25 MB
  quantized. Same model instance also serves dedup in §4 Stage 5 and
  assertion-drift detection in §6 Type D.

### Explicitly deferred beyond v0.1

- Implicit-premise extraction (what the assistant appears to *presume*
  without stating). Requires larger model or LLM prompting.
- Confidence surfacing on assistant claims (grounded / inferred /
  unsourced). Requires model interrogation.
- Feeding confirmed shared state back into the model's context as a
  system-message preamble. This is the endgame from the "bridge" thesis
  and it is v0.3+.
- Cross-conversation transport of ledger entries.

### Model runtime specifics

- Framework: **transformers.js** (Xenova) via WASM. Runs entirely in
  the extension's isolated world. No network. Model weights loaded from
  `chrome-extension://.../src/ml/models/` at first-need.
- Warm-up: ~1.5–3 seconds on typical hardware for both models
  combined; runs in the background after panel mount so first extraction
  does not block the UI. Until warm, Stage 3 falls back to heuristic
  labeling (Path A degradation).
- Model IDs and versions are declared in `src/ml/models/README.md` along
  with their licenses and SHA-256 hashes. Swapping a model is a doctrine
  decision.

---

## 8. Privacy risks

Enumerated with mitigations. The realignment introduces one new risk class
(model hallucination as inference) which is called out first.

1. **Model hallucination misread as confirmation.** The bundled classifier
   or embedder will produce wrong labels or wrong referent bindings.
   *Mitigation:* every model output is rendered as **inference**, never as
   confirmed shared state. Ledger entries produced by the model start in
   `proposed` / `asserted` and require explicit human action to promote.
   Referent bindings below the auto-bind threshold are surfaced for
   pinning, not silently applied. Model confidence is stored on every
   entry and made visible in the UI (dimming, tooltip on hover).

2. **Exfiltration by ConCon itself.** The content script reads every
   ChatGPT message the user sees, and now also holds a model that
   processes them.
   *Mitigation:* manifest declares no host permission outside
   `chatgpt.com`, no `webRequest`, no outbound `fetch` in code, CSP
   `connect-src 'self'`. Verifiable in `chrome://extensions` → details.
   The bundled model runs locally; it does not transmit its inputs.

3. **Model weights as untrusted code.** A compromised model file could
   contain adversarial weights that produce misleading outputs.
   *Mitigation:* model files are checked into the repository with
   SHA-256 hashes in `models/README.md`. `ml/runtime.js` verifies the
   hash of every weight file before loading. Load fails closed if hash
   mismatches (Path A degradation kicks in).

4. **Exfiltration by an injected third-party script.**
   *Mitigation:* no remote `<script>`, no CDN, no analytics SDK, ever.
   CSP forbids remote sources.

5. **ChatGPT ToS.** Reading the DOM of a user-authenticated page from a
   user-installed extension is standard behavior. v0.1 does not call
   ChatGPT's backend API and does not scrape shared conversations.

6. **Data at rest.** IndexedDB is per-origin, unencrypted. A malicious
   extension on the same profile could read it. This is a Chrome trust
   boundary. Store the minimum needed; disclose in README.

7. **Sensitive content in ledger entries.** A pasted secret could
   become part of a ledger entry.
   *Mitigation:* `core/redact.js` applies regex scrubbing to any string
   that will be *displayed* in the panel (labels, entry previews):
   long hex/base64, `sk-...` API-key shapes, JWTs, email addresses →
   `[redacted]`. Full underlying text is untouched in storage; only the
   panel view is scrubbed. Search still operates over unredacted text
   because the user is searching their own data on their own machine.

8. **Right to be forgotten per conversation.** One-click clear of a
   conversation's ledger + outline + referent bindings. No
   double-negative confirmation.

9. **Screen-share leakage.** Panel is collapsible to a 48 px rail; hard
   collapse hides ledger and referent surfaces. Documented in README.

10. **Model behavior drift across versions.** When a bundled model is
    updated, extraction results may change. Turns store their
    `extractionModelVersion`. On version change, the ledger is *not*
    automatically re-derived — this would silently rewrite the human's
    confirmed set. Instead the UI offers a "re-analyze with new model"
    action, and any confirmed entries survive re-analysis unchanged.

---

## 9. Smallest implementation sequence

Each step is independently demoable and reversible. Steps are ordered so
that the demo is *coherent* at every checkpoint — never in a half-broken
state where a promised surface is empty.

1. **Skeleton.** MV3 manifest, `panel-mount.js` injects the shadow-DOM
   panel on `chatgpt.com`. Empty panel, but survives SPA navigation.
   *Verify:* ChatGPT unaffected; panel remounts across conversation
   switches.

2. **Observation & store.** MutationObserver + `selectors.js`; every
   observed turn is stored in-memory and debounce-persisted to IndexedDB.
   Log to console; still no UI content. *Verify:* streaming, regenerate,
   edit-fork, virtualized scroll all produce clean turn records.

3. **Outline substrate (silent).** `segmenter.js` + `outline.js` run
   internally. No panel UI yet. *Verify:* by console; the outline is
   correct on the reference conversation.

4. **Heuristic-only ledger (Path A demo point).** `commitment-extract.js`
   with Stage 1 + Stage 2 only, no model. Panel renders the two-column
   ledger, all entries in `proposed` / `asserted`. Confirm/dismiss actions
   work and persist. Click-to-jump works. **After step 4, ConCon is
   already demoable as a working ledger.**

5. **Literal search.** Substring across stored turns; highlight and
   scroll. Cheap; ship it.

6. **Model runtime (`ml/`).** Load transformers.js + both bundled models
   lazily on first-need. Warm-up in background. Verify hash-check works
   and falls back to Path A on failure. *Verify:* model loads and warms
   without blocking the UI.

7. **Classifier-backed ledger (Path B).** Stage 3 wired in. Entries now
   have classifier confidence; low-confidence entries visually dimmer.
   *Verify:* on the reference conversation, classifier meaningfully
   improves precision over Stage 2 alone.

8. **Referent tracker.** `referent-scan.js` end to end. Auto-bind above
   threshold; pin popover otherwise. Pinned bindings persist.
   *Verify:* on a conversation with several `it`/`the plan` references,
   the tracker surfaces at least one genuine ambiguity.

9. **Divergence indicator.** `divergence.js` wired to each new assistant
   turn. Colored dots on the transcript; divergence list in the panel.
   *Verify:* on the reference conversation, at least one Type A divergence
   is correctly surfaced.

10. **Confirm-on-promote persistence + redaction.** Every ledger promote
    persists across reloads. Redaction pass over any string that reaches
    the panel. *Verify:* pasted fake secret does not appear in the panel;
    stored transcript is untouched.

11. **Polish + selector-break drill.** Practice hotfixing `selectors.js`
    under time pressure. Verify graceful degradation (empty ledger, no
    crash) when selectors miss.

Steps 1–5 are Path A (heuristic-only, ~3 days). Steps 6–11 add Path B
(~3 more days). Total: ~6 focused days.

**After step 4 there is a working demo.** After step 9 there is the
realigned v0.1 demo — the one where a user can point at the panel and say
"the model has been operating as if I committed to X, and I never did."

Explicitly not in v0.1: nested topic hierarchy, confidence surfacing,
feedback-into-model-context, cross-conversation transport, Firefox parity,
Chrome Web Store submission.

---

## 10. Assumptions

1. **Target = Chrome MV3 only.** Firefox parity deferred to v0.2.
2. **Path B chosen.** A bundled local model runtime ships in v0.1. No
   external AI API. No network calls of any kind.
3. **Model choice.** transformers.js (Xenova) as the runtime; a small NLI
   classifier for commitment tagging; MiniLM-class for sentence embeddings.
   Specific model IDs, versions, and licenses are declared in
   `src/ml/models/README.md` before code is written for §4 Stage 3 or §5
   scoring.
4. **Bundled models are treated as inference, never as confirmation.**
   Their outputs render as `proposed` / `asserted` and require explicit
   human action to promote.
5. **ChatGPT's DOM (Jan 2026) exposes `data-message-id` and
   `data-message-author-role`.** If these disappear, we fall back to the
   documented (not built) SSE interception path.
6. **Distribution = unpacked developer-mode.** No Chrome Web Store in
   v0.1.
7. **Storage is per browser profile.** No sync, no export, no
   cross-device.
8. **The living outline is substrate, not product.** The visible surfaces
   are the ledger, the referent tracker, and the divergence indicator.
9. **Path A degradation is a first-class code path**, not an afterthought.
   Every model-backed surface has a documented fallback that works with
   heuristics only, so a broken model never disables the tool.
10. **Doctrine expression in v0.1** is concentrated in:
    (a) manifest permissions minimal enough to *prove* nothing leaves the
    machine,
    (b) inferred vs. confirmed visually distinct at every ledger surface,
    (c) divergence flags never auto-dismissed by re-analysis.

---

## Open questions for the author before code begins for the new surfaces

Steps 1–3 in §9 can proceed against the realigned brief without additional
input (they are substrate work). Before starting step 4 (heuristic-only
ledger), please confirm:

1. **Ledger organization.** Chronological by turn, grouped by topic, or
   toggleable? (Recommendation: toggleable; default chronological.)
2. **Confirm/dismiss gesture.** Single-click, double-click, or dedicated
   confirm/dismiss buttons per entry? (Recommendation: dedicated buttons.
   The gesture is doctrinally significant — it is the human's explicit
   act of promoting proposal to shared state — and it should not be
   collateral damage from a mis-aimed click.)
3. **Reference conversation.** Which long ChatGPT conversation do we
   calibrate against? All thresholds in §4, §5, §6 are placeholders until
   they meet real data.
4. **Reference model IDs.** I have candidates for the NLI classifier and
   the embedding model but I want to name specific IDs in
   `models/README.md` before writing any `ml/` code. Do you want me to
   propose specific model IDs (with sizes, licenses, and hashes) in a
   follow-up before step 6, or pick them autonomously?
5. **Divergence noise tolerance.** In §6 the thresholds will produce some
   false-positive flags. Are we comfortable erring toward *over-flagging*
   (the human dismisses noise, but no true divergence is missed) or
   *under-flagging* (fewer alerts, some genuine drift not surfaced)?
   (Recommendation: over-flag in v0.1, tune down in v0.2.)

Once these are answered, work on step 4 can begin.
