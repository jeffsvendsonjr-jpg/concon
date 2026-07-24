# ConCon v0.1 architecture review

Response to `docs/V0_1_BRIEF.md`. No significant code has been written. The eight
sections below are ordered to match the brief.

---

## 1. Proposed file structure

```
concon/
├── AGENTS.md
├── README.md
├── .gitignore
├── docs/
│   ├── V0_1_BRIEF.md
│   └── V0_1_ARCHITECTURE_REVIEW.md          ← this file
└── extension/
    ├── manifest.json                        MV3 manifest, minimal permissions
    ├── src/
    │   ├── content/
    │   │   ├── observer.js                  MutationObserver → core
    │   │   ├── selectors.js                 single source of truth for DOM selectors
    │   │   └── panel-mount.js               injects the shadow-DOM right-side panel
    │   ├── panel/
    │   │   ├── index.html
    │   │   ├── panel.js                     outline UI, search, click-to-jump
    │   │   └── panel.css                    scoped inside shadow root
    │   ├── core/                            pure JS, no DOM, unit-testable in Node
    │   │   ├── message-model.js             MessageRecord, TopicRecord, ID rules
    │   │   ├── segmenter.js                 deterministic topic-boundary rules
    │   │   ├── outline.js                   builds/updates the living outline tree
    │   │   ├── redact.js                    label-only PII/secret scrubbing
    │   │   └── store.js                     in-memory + IndexedDB persistence
    │   └── background/
    │       └── service-worker.js            MV3 stub only; no logic in v0.1
    └── assets/
        └── icons/                           16/48/128
```

Rationale:

- No `src/lib/` grab-bag. Every folder is a responsibility.
- `selectors.js` is intentionally isolated so a ChatGPT UI change is a
  one-file hotfix.
- `core/` is pure JS with no DOM references, so segmentation/outline logic can
  be exercised from Node without a browser.
- **No build step in v0.1.** Plain ES modules loaded by the manifest. A
  bundler is one more thing to break the morning of a demo; add it when we
  actually need TypeScript or dependency graphs.

---

## 2. Technical architecture

Runtime picture, per open ChatGPT tab:

1. **Content script** injects at `document_idle` on `https://chatgpt.com/*`.
   Two responsibilities:
   - Mount the panel container (a fixed-position `<div>` on the right edge,
     rendered inside a **shadow DOM** so ChatGPT's Tailwind cannot bleed into
     our CSS and vice versa).
   - Start the `MutationObserver` against ChatGPT's chat scroll container.
2. **Observer** emits `{type, messageId, ...}` events into `core/`.
3. **Core** (message model → segmenter → outline → store) is pure JS in the
   content script's isolated world. It:
   - assigns/verifies stable IDs,
   - runs deterministic topic segmentation,
   - maintains the outline tree,
   - persists debounced snapshots to IndexedDB.
4. **Panel** lives in the shadow root and receives outline diffs via a
   same-world event bus (no `postMessage` needed because content script and
   panel share the isolated world). It renders:
   - a nested (v0.1: flat) list of topics,
   - a search input,
   - a "You are here" marker driven by an `IntersectionObserver` on the
     currently-visible turn.
5. **Persistence** is IndexedDB keyed by ChatGPT `conversationId` (parsed
   from the URL: `chatgpt.com/c/<uuid>`).
6. **Background service worker** does nothing in v0.1 beyond existing so MV3
   is happy. No cross-tab coordination, no alarms, no fetches.

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
  "background": { "service_worker": "src/background/service-worker.js" }
}
```

Notice what is **absent**: no `<all_urls>`, no `webRequest`, no
`declarativeNetRequest`, no remote hosts, no `optional_host_permissions`. The
extension is technically incapable of exfiltration; this is the manifest-level
guarantee behind the AGENTS.md doctrine ("no telemetry").

Deferred but documented alternative: a page-world script
(`chrome.scripting.executeScript` with `world: "MAIN"`) that patches `fetch`
to read ChatGPT's SSE `/backend-api/conversation` stream. That path yields
canonical message JSON without DOM parsing and is our fallback if OpenAI ever
strips `data-message-id` from the DOM. **Not built in v0.1**, because (a)
MutationObserver is currently sufficient and (b) monkey-patching `fetch` on
chatgpt.com invites more scrutiny than we want in a v0.1.

---

## 3. Observing and uniquely tracking ChatGPT messages

### 3.1 Available DOM signals (as of Jan 2026)

- `<article data-testid="conversation-turn-<N>">` per turn.
- `<div data-message-id="<uuid>">` per message.
- `<div data-message-author-role="user" | "assistant" | "system">`.

All three go through `selectors.js`; if any change we patch one file.

### 3.2 Stable identity

`data-message-id` is a UUID emitted by ChatGPT's backend. It survives
re-renders and scroll virtualization, which is exactly what we need. We use
it verbatim as our `MessageRecord.id`. **We never invent IDs.** Messages
without a `data-message-id` (e.g. system placeholders) are dropped rather
than assigned a synthetic ID; inventing IDs would let stale system nodes leak
into the outline.

### 3.3 `MessageRecord` shape

```
{
  id:              string,           // ChatGPT data-message-id
  conversationId:  string,           // parsed from URL
  role:            "user" | "assistant",
  text:            string,           // plaintext extraction
  createdAt:       number,           // ms, first observed locally
  order:           number,           // monotonic per conversation
  regeneratesId?:  string,           // link to prior assistant message
  domRef?:         WeakRef<Element>  // may be gone after virtualization
}
```

### 3.4 Edge cases that must be handled by v0.1

- **Streaming.** During assistant streaming the text mutates continuously.
  A message is not offered to the segmenter until it is stable for **750 ms**
  or ChatGPT's streaming-complete indicator disappears — whichever fires
  first.
- **Regenerate.** ChatGPT issues a new `data-message-id` for the regenerated
  assistant reply. We store both, link the new one via `regeneratesId`, and
  the outline treats the *currently visible* branch as authoritative.
- **User edit of a prior turn.** ChatGPT forks the conversation server-side;
  the edited turn and everything downstream get new IDs. We follow the
  visible branch and flag the fork point as a topic-boundary *candidate*
  (not a forced split).
- **Virtualized scroll.** ChatGPT unmounts off-screen turns. Consequence:
  the DOM is not the source of truth for which messages exist — the **store
  is**. `domRef` may become dead; on click-to-jump we scroll to the ancestor
  turn if it exists, then re-attach when the observer re-sees the target.
- **SPA navigation between conversations.** The path changes but the tab
  does not reload. `panel-mount.js` listens to `history.pushState` /
  `popstate` and remounts against the new `conversationId`.

---

## 4. Topic-boundary detection in v0.1

The brief's example outline is **user-turn-driven** (the user's own turns
shift topic; the assistant elaborates). v0.1 leans on this: assistant text is
stored and searchable but does **not** generate topic boundaries.

### 4.1 Deterministic rule set

For each new user turn `u_n` with running-topic centroid `T`:

1. **Baseline.** Every user turn is a topic *candidate*.
2. **Merge `u_n` into current topic** if any of:
   - `cosine(tfidf(u_n), tfidf(T)) > 0.35`, or
   - `u_n` has fewer than 12 tokens **and** contains a pronoun with no new
     noun phrase (`"go on"`, `"why?"`, `"and then?"`), or
   - `u_n` opens with a continuation cue (`so | also | and | but | then | ok |
     right | wait | no | yes`) **and** no capitalized noun phrase appears in
     the first 8 tokens.
3. **Split to new topic** if any of:
   - Explicit topic-shift cue in the first 20 tokens: `let's talk about`,
     `switching gears`, `different topic`, `on another note`, `new question`,
     `unrelated`, `moving on`, `back to`.
   - `cosine(tfidf(u_n), tfidf(T)) < 0.15` **and** `u_n` has ≥ 12 tokens.
   - Wall-clock gap since previous message > 30 minutes (session boundary).
4. **Label** = longest non-stopword noun phrase in the topic's first user
   turn; fallback = first 6 non-stopword tokens.
5. **Nesting is deferred.** v0.1 ships a flat list. The brief's nested
   example (`ConCon → Congruence / Receipts / Forks`) is an aspirational
   target for v0.2 and is an *accepted* gap in v0.1.

Thresholds (0.35 / 0.15 / 30 min / 750 ms) are picked to be tunable, not
final. They will be calibrated on one long reference conversation before we
call v0.1 done. The point of using cheap deterministic rules is that when
segmentation feels wrong the user (and we) can see exactly which rule fired
and adjust it.

### 4.2 Rendering under the doctrine

Every topic label produced by these rules is **inferred**. Per AGENTS.md
("Inference is not confirmation"):

- Inferred labels render in **dim italic**.
- Double-clicking a label opens an inline rename; on save the label switches
  to **normal weight** and is stored as `confirmed: true`.
- Confirmed labels are never overwritten by re-segmentation. Inferred labels
  are freely replaced as the topic grows.

This is the smallest visible surface of the ConCon thesis and it costs almost
nothing to build.

---

## 5. Deterministic/local vs. needs model intelligence

### 5.1 Fully deterministic and local in v0.1

- Message observation and ID tracking (DOM attributes).
- Persistence (IndexedDB, per profile).
- Search (case-insensitive literal substring + token match).
- Topic segmentation per §4.
- Topic labeling via longest-noun-phrase heuristic.
- Click-to-jump navigation and "You are here" tracking.
- Label redaction (regex-only; §6.5).

### 5.2 Would benefit from a model — deferred beyond v0.1

- **Human-readable topic labels** (`"AI aftermarket"` vs.
  `"aftermarket for AI"`). A small local embedding model + noun-phrase
  reranking could produce these, but the smallest usable model adds
  ~15–25 MB and a WASM runtime. Not v0.1.
- **Nested topic hierarchy.** Requires clustering embeddings over the
  conversation. Deferred to v0.2.
- **Congruence / drift detection.** The core v0.2+ thesis; explicitly out of
  scope for v0.1 per AGENTS.md.
- **Cross-conversation topic linking.** Out of scope.

### 5.3 Principle

> Anything that operates on **structure** ships in v0.1.
> Anything that requires interpretation of **meaning** is deferred.

This also keeps v0.1 honest with the doctrine: with almost no inference,
there is almost nothing that could silently masquerade as confirmed state.

---

## 6. Privacy risks

Enumerated with mitigations.

1. **Exfiltration by ConCon itself.** The content script reads every
   ChatGPT message the user sees.
   *Mitigation:* manifest declares no host permission outside
   `chatgpt.com`, no `webRequest`, no outbound `fetch` in code. Verifiable
   by any user in `chrome://extensions` → details.
2. **Exfiltration by an injected third-party script.**
   *Mitigation:* all JS is bundled in the extension package. No remote
   `<script>`, no CDN, no analytics SDK — ever. CSP in `index.html` for
   the panel forbids remote sources.
3. **ChatGPT ToS.** Reading the DOM of a page the user is logged into,
   from a user-installed extension, on their own machine, for their own
   use, is standard extension behavior. v0.1 does **not** call ChatGPT's
   backend API and does **not** scrape shared conversations.
4. **Data at rest.** IndexedDB is per-origin and unencrypted. A malicious
   extension on the same profile could read it. This is a Chrome trust
   boundary we cannot fix; it is disclosed in the README. Mitigation: store
   the minimum needed. Assistant text is stored (needed for search); if
   post-v0.1 telemetry shows most users never search assistant text we
   drop it.
5. **Sensitive content in topic labels.** A pasted secret could become a
   topic label. `core/redact.js` runs a regex pass on **labels only** (not
   stored text): long hex/base64 tokens, `sk-...` API-key patterns, JWTs,
   and email addresses are replaced with `[redacted]` before display.
   Underlying message text is untouched.
6. **Right to be forgotten per conversation.** The panel has a
   "clear this conversation's outline" affordance — one click, no
   double-negative confirmation dialog.
7. **Screen-share leakage.** The panel shows topic labels while the user
   screen-shares. Not a code issue, but the README calls it out; the panel
   is collapsible for exactly this case.

---

## 7. Smallest implementation sequence

Each step is independently demoable and independently reversible.

1. **Skeleton (0.5 day).** MV3 manifest, `panel-mount.js` injects an empty
   shadow-DOM panel on `chatgpt.com`. Verify: extension loads, ChatGPT
   unaffected, panel survives SPA navigation between conversations.
2. **Observation (1 day).** `MutationObserver` + `selectors.js`. Every
   observed message is logged as `{id, role, text[:80]}` to the console.
   Verify against a long conversation covering streaming, regenerate, edit,
   virtualized scroll.
3. **Store (0.5 day).** In-memory `Map<conversationId, MessageRecord[]>`,
   debounced snapshot to IndexedDB. Verify: reload restores state.
4. **Flat outline (0.5 day).** One outline item per user turn, label = first
   6 words. Click → scroll to `[data-message-id="..."]`.
   **After step 4 the extension is already demoable.**
5. **Segmenter v1 (1 day).** Implement §4 rules; replace one-turn-per-item
   with merged topics. Calibrate thresholds on one long reference
   conversation.
6. **Search (0.5 day).** Literal substring across stored messages; on match,
   highlight and scroll to the message.
7. **"You are here" marker (0.5 day).** `IntersectionObserver` on the
   currently visible turn; marker in the panel tracks it live.
8. **Label redaction + confirm-on-rename (0.5 day).** Inferred labels in dim
   italic; double-click to rename → confirmed weight, persisted. This is
   the smallest visible instance of the ConCon doctrine.
9. **Polish + selector-break drill (0.5 day).** Practice hotfixing
   `selectors.js` under time pressure. Verify the extension degrades to
   "empty outline" rather than crashing ChatGPT when selectors miss.

Total: ~5.5 focused days. Steps 1–4 alone are already a coherent demo; every
step after that is a strict upgrade.

Explicitly **not** in v0.1: nested topics, embeddings, congruence/drift,
receipts, forks, multi-conversation view, export, sync, sharing, Chrome Web
Store submission.

---

## 8. Assumptions

1. **Target = Chrome MV3 only.** Firefox parity deferred to v0.2. Reason:
   ChatGPT's DOM is a moving target and supporting two extension runtimes
   doubles the surface area before we have validated the core hypothesis.
2. **Topic detection is fully local and deterministic in v0.1.** No
   external AI API, no bundled model. Reasons: (a) AGENTS.md forbids
   external AI APIs without review, (b) local-only makes "no backend / no
   telemetry" true by construction, (c) it forces us to learn how far cheap
   signals go before reaching for a model.
3. **ChatGPT's DOM (Jan 2026) exposes `data-message-id` and
   `data-message-author-role`.** If they disappear we fall back to the SSE
   interception path (documented in §2, not built in v0.1).
4. **Distribution = unpacked developer-mode extension.** No Chrome Web
   Store submission in v0.1 — the review cycle would block iteration and
   demos. Reconsider before v0.2.
5. **"You are here" = the last message currently intersecting the viewport**,
   not the last message in the conversation. Reason: users care where their
   eye is, not where the tail is.
6. **Topic nesting is aspirational, not v0.1.** The brief's example outline
   shows nesting; v0.1 ships flat and this gap is accepted, not hidden.
7. **Storage is per browser profile.** No sync, no export, no cross-device.
8. **Doctrine expression in v0.1** is limited to:
   (a) manifest permissions minimal enough to *prove* nothing leaves the
   machine, and (b) inferred labels visually distinct from confirmed labels.
   Deeper receipts UI is v0.2+.

---

## Open questions for the author before code begins

These were **not** answered by the brief and I do not want to silently pick
defaults for them.

1. **Distribution.** Confirm v0.1 is unpacked-only, or is Chrome Web Store
   submission a v0.1 requirement (adds review-cycle latency)?
2. **Confirmed-label persistence.** Persist across reloads (recommended —
   cheap, and makes the doctrine visible over time), or in-memory only?
3. **Panel footprint.** ~280 px right rail always visible, or collapsible to
   a thin edge tab? Collapsible costs ~0.5 day.
4. **Demo date, if any.** If there is a target date (build-athon?) I would
   reverse-engineer the sequence in §7 from it and cut steps 6–8 first.
5. **Reference conversation.** Which specific long ChatGPT conversation
   should the segmenter thresholds be calibrated against? Calibration is
   only meaningful against real data.

Once these are answered I can proceed to step 1 of §7.
