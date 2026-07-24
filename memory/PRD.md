# ConCon — Product Requirements Document

**Status:** v0.1 substrate + ledger + search complete (steps 1–5 of arch review §9).

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

### P0 — steps 6–7 (Path B: bundled local model)

- `ml/runtime.js` — transformers.js lazy loader, hash verification, warm-up.
- `ml/models/README.md` — model IDs, versions, licenses, SHA-256 hashes.
- `ml/commitment-classifier.js` — NLI zero-shot wrapper. Replaces heuristic
  labels with classifier labels (Stage 3), preserves user-set state.
- `ml/embeddings.js` — MiniLM-class sentence embeddings for dedup +
  referent scoring + assertion-drift detection.

### P1 — step 7 (referent tracker)

- `core/referent-scan.js` — pronoun/definite-NP detection, candidate
  scoring, auto-bind vs. pin popover.

### P1 — step 8 (divergence indicator)

- `core/divergence.js` — the 4 divergence types (unconfirmed premise,
  contested basis, referent mismatch, assertion drift).
- Divergence flags in the panel next to the source turn and the ledger entry.

### P2 — deferred structural work

- **Regenerate handling** — link via `regeneratesId`, follow visible branch.
- **Real-Chrome verification pass** — load `extension/` in Chrome against
  a live long ChatGPT conversation, verify selectors, docking, SPA nav.
  Fix in `selectors.js` if the current attributes have moved.

### Open questions (blockers for later steps)

- Q3 — reference conversation for calibrating thresholds (used in steps 7–9).
- Q4 — propose specific model IDs autonomously, or wait for user pick.
- Q5 — divergence noise tolerance (recommend over-flag in v0.1).

### Deferred (v0.2+)

- Nested topic hierarchy.
- Confidence surfacing on assistant claims.
- Feeding confirmed shared state back into the model's context.
- Cross-conversation ledger transport.
- Firefox parity.
- Chrome Web Store submission.

## Next actions

1. User loads the extension in real Chrome, verifies against a live
   long ChatGPT conversation, reports any DOM-selector or docking issues.
2. Consider "Save to GitHub" so the repo is durable independent of this
   session.
3. Main agent proceeds to steps 6–7 (Path B model runtime + referent
   tracker) — non-blocking on Chrome verification.
