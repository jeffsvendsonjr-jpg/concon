# ConCon — Product Requirements Document

**Status:** v0.2.0 shipped — three-mode responsive dock, default collapsed
everywhere, per-conversation collapse persistence, dynamic container
detection. Live-ChatGPT reflow verification pending (user testing on
split-screen setup).

## Original problem statement

User is building ConCon (Conversational Congruence), a browser-extension
tool to bridge the human/LLM communication gap. Realigned from an
outline-only framing to a bridge / divergence-surfacing / commitment-ledger
framing. Building at `/app/concon/`, not in Codex.

## Mission

Bridge the human/LLM communication gap. In long AI conversations, human
and model drift apart in structurally predictable ways (reference drift,
commitment asymmetry, silence-as-consent, exploration/decision blur).
ConCon is an external instrument that makes drift visible to both sides
in real time. It is a mirror, not a third participant.

Full doctrine in `/app/concon/AGENTS.md`.

## User personas

- **Primary:** power user of ChatGPT running long, multi-turn, high-stakes
  work (product design, technical debugging, decision-making, drafting).
- **Secondary:** professional/regulated users where "the AI acted like we
  agreed to X" has real consequences (legal, journalism, engineering).

## Core requirements (static)

- Chrome MV3 extension, right-side shadow-DOM panel.
- Local, offline, no telemetry, no external AI API.
- Manifest makes exfiltration technically impossible (no host permission
  beyond `chatgpt.com`, no outbound fetch, CSP `connect-src 'self'`).
- Path B chosen: bundled local model runtime (transformers.js via WASM)
  arrives in later phases. Hash-verified, versioned, license-declared.
- All model outputs render as **inferred** (proposed/asserted); never as
  confirmed shared state. Promotion requires explicit human action.

## What's been implemented

### 2026-07-25 · v0.2.0 dock rework + strategy sidebar

**Dock (steps completed):**
- Three responsive modes replace the previous two: `wide` (≥1150px,
  340/48), `narrow` (700–1149px, 300/40 slim rail — split-screen sweet
  spot), `overlay` (<700px, no reflow).
- Default state is **collapsed at every viewport width**. Progressive
  disclosure. The rail is always visible; expansion is a deliberate act.
- Collapse preference persists per conversation via localStorage
  (`concon:collapsed:<conversationId>`).
- Dynamic container detection: dock walks ancestors of the first
  ChatGPT turn and tags the widest full-width one with
  `data-concon-target`. Injected stylesheet applies `padding-right` to
  that element *and* to `body` as a safety net. A MutationObserver
  re-tags if React strips the attribute.
- CSS custom properties (`--concon-panel-width`,
  `--concon-panel-collapsed-width`) cascade from `:root` into the
  shadow-DOM panel via `:host` variable inheritance, so panel width
  auto-matches the dock's chosen mode.
- Version 0.2.0, packaged at `/app/frontend/public/concon-extension.zip`.

**Strategy decisions (locked into `AGENTS.md` and `docs/ROADMAP.md`):**
- **The Curator Principle** added to doctrine: the human ratifies, the
  tool never decides. The "continuity positive feedback loop" is the
  product's core mechanic; positive feedback amplifies errors as readily
  as truths, so the contest affordance must equal the confirm affordance.
- **Vigilance modes** — three named states (Explicit / Balanced / Wary),
  per-conversation. Vigilance controls proposal rate, never ratification.
  Wary is where proactive divergence pings live.
- **ConCon Check** — impromptu, user-initiated view of open loops
  (assistant asked/user didn't answer; user asked/assistant sidestepped;
  stale proposals; unbound referents). Now **P0**, sequenced ahead of
  Step 6 as the product's elevator pitch demonstrator.
- **Pricing model** — v0.x MIT-licensed free; v1.0 dual-tier ($6/mo or
  $48/yr Pro, $79 lifetime capped); no team tier until pulled by demand;
  never gate the core ledger insight.
- **iOS strategy** — deferred until Chrome traction. `core/` stays
  runtime-agnostic to keep Safari extension and Core ML companion app
  paths cheap.

### 2026-01-24 · steps 1–5 (substrate + ledger + search)

**Substrate (steps 1–3):**
- Realigned three founding docs (`AGENTS.md`, `V0_1_BRIEF.md`,
  `V0_1_ARCHITECTURE_REVIEW.md`) to the bridge framing.
- Portable extension repo at `/app/concon/`. Zero runtime dependencies.
- Extension chassis: MV3 manifest (`chatgpt.com` only, CSP `connect-src 'self'`,
  no outbound fetch), content-script bootstrap + dynamic ESM import,
  shadow-DOM panel host, `MutationObserver` with 750 ms streaming stability
  window, `selectors.js` as single-file DOM contract, SPA-navigation aware,
  IndexedDB persistence with debounced writes.
- Pure `core/` modules: `message-model`, `store` (in-memory + IDB + event bus),
  `segmenter` (cosine + continuation + shift cues + 30-min session gap,
  precedence-ordered), `outline` (labelConfirmed persistence).

**Ledger (step 4):**
- `core/commitment-extract.js` — Stage 1 (char-scan sentence splitter that
  respects `.js`, `v0.1`, decimals, URLs) + Stage 2 (heuristic commitment
  cue matching for human and assistant, hedge down-weighting, imperative-lead
  detection, question rejection).
- `core/ledger.js` — ledger state machine (user: proposed → confirmed |
  dismissed; assistant: asserted → acknowledged | contested), stable
  entry IDs, user-action preservation across re-derivation, `groupByTopic`
  with assistant-inherits-preceding-user-topic behavior.
- Panel UI: interleaved chronological single column with role-colored left
  borders (burnt orange for human, forest green for assistant), inferred-italic
  vs. resolved rendering, dedicated confirm/dismiss/acknowledge/contest
  buttons, chronological ↔ by-topic view toggle.
- `mount.js` wires panel callbacks to store (transition, jump, view mode,
  search); click-to-jump does `scrollIntoView` on the target message with a
  brief outline highlight.

**Search (step 5):**
- `core/search.js` — pure `searchLedger`, `searchTranscript`,
  `countTranscriptOnly`, `highlightMatch`, `normalizeQuery`. Case-insensitive
  substring; no dependencies.
- Panel search input in the toolbar (second row), clear button, Escape-to-clear.
- Summary badge shows `N in ledger · M more in transcript`, distinguishing
  ledger-matching entries from turns whose text mentions the query but never
  crossed the extractor's cue set.
- Query hit highlighted inline within entries (warm-orange background).
- By-topic view respects search correctly: groups are computed against the
  full ledger (assistant entries retain topic inheritance), then filtered
  by visible entry IDs, so a filtered assistant entry still lands under its
  originating user topic instead of "unclassified".
- Empty-search-hit state has explanatory copy: "The ledger only contains
  commitment-shaped statements; plain mentions live outside it."

**Tests:** 57 Node-native unit tests, all passing (message-model,
segmenter, outline, commitment-extract, ledger, search). Lint clean across
the whole tree.

### Verified via dev-harness under Playwright

- Panel mounts on load; survives SPA navigation between conversationIds.
- 8-turn fixture ingests → 2 topics, 11 ledger entries.
- Confirm-a-user-entry, contest-an-assistant-entry both transition state
  and re-render correctly (inferred-italic → normal weight for confirmed;
  strikethrough dim for dismissed/contested).
- Chronological ↔ by-topic view toggle works.
- Search across `MV3` finds 3 ledger matches, highlights the query span
  in each. Search across `fence` finds 0 ledger matches + 1 transcript
  match (per the summary badge). Search in by-topic view correctly groups
  the filtered entries under their real topics (no phantom UNCLASSIFIED).
- Sentence splitter no longer breaks on `transformers.js` or `v0.1`.
- Click-to-jump highlights the source turn in the mock DOM.
- SPA navigation resets counts to 0 for a new conversationId.

### Known gaps documented in code

- **Regenerate handling** (`observer.js` header comment): a new
  `data-message-id` is currently ingested as a new message, producing a
  phantom turn on regenerate. Linking via `regeneratesId` and following
  the visible branch is deferred to a later phase.
- **Two-column layout** (`panel.js` header comment): docs say "two columns";
  implementation ships interleaved chronological single-column. Deviation
  logged as deliberate — interleaved reveals divergence better and fits 340 px.

## Prioritized backlog

See `/app/concon/docs/ROADMAP.md` for the living roadmap. Priority
snapshot as of v0.2.0:

### P0 — Step 5.5 · ConCon Check (heuristic)

On-demand "open loops" view. Button + Cmd/Ctrl+Shift+K keyboard shortcut.
Four categories: assistant-asked-user-didn't-answer, user-asked-assistant-
sidestepped, stale proposals, unbound referents. Impromptu only.
Sequenced ahead of the local model because it's the elevator pitch.

### P0 — Step 6 · Bundled local model runtime

- `ml/runtime.js` — transformers.js lazy loader, hash verification, warm-up.
- `ml/models/README.md` — model IDs, versions, licenses, SHA-256 hashes.
- `ml/commitment-classifier.js` — NLI zero-shot wrapper. Replaces heuristic
  labels with classifier labels (Stage 3), preserves user-set state.
- `ml/embeddings.js` — MiniLM-class sentence embeddings for dedup +
  referent scoring + assertion-drift detection.

### P1 — Step 7 · Referent tracker

- `core/referent-scan.js` — pronoun/definite-NP detection, candidate
  scoring, auto-bind vs. pin popover. Feeds ConCon Check category #4.

### P1 — Step 8 · Divergence detection + Wary vigilance

- `core/divergence.js` — the 4 divergence types.
- Wary vigilance mode: proactive divergence pings.
- Divergence flags in the panel next to the source turn and ledger entry.

### P1 — Step 8.5 · ConCon Check NLI upgrade

Replace content-word overlap with entailment scoring now that the local
model runtime is available. Accuracy jumps ~80% → ~95%.

### P1 — Vigilance modes UI

Three-mode toggle (Explicit / Balanced / Wary) in panel header,
per-conversation persistence.

### P2 — deferred structural work

- **Regenerate handling** — link via `regeneratesId`, follow visible branch.
- **Cross-conversation memory** (paid tier) — IndexedDB-backed ledger
  across `/c/…` routes.
- **Exports** (paid tier) — Markdown / JSON export of confirmed shared state.

### Open questions (blockers for later steps)

- Q3 — reference conversation for calibrating thresholds (used in steps 7–9).
- Q4 — propose specific model IDs autonomously, or wait for user pick.
- Q5 — divergence noise tolerance (recommend over-flag in v0.1).

### Deferred (v2.0+)

- Team tier ($15/user/mo, min 3 seats) if pulled by demand.
- Safari Web Extension port.
- Companion iOS app + Share Sheet + Core ML.
- Firefox parity.
- Chrome Web Store submission.

## Next actions

1. **User verification of v0.2.0** on live ChatGPT in split-screen setup.
   Confirm: rail visible by default, no text overlap, expansion reflows
   cleanly, collapse state persists across refresh.
2. **Step 5.5 — ConCon Check (heuristic)** implementation.
3. **Step 6 — bundled local model runtime.**
4. **Save to GitHub** so the repo is durable independent of this session.
