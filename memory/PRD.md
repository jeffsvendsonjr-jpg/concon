# ConCon — Product Requirements Document

**Status:** v0.1 substrate complete (steps 1–3 of arch review §9).

## Original problem statement

User is building ConCon (Conversational Congruence), a browser-extension
tool to bridge the human/LLM communication gap. Realigned from an
outline-only framing to a bridge / divergence-surfacing / commitment-ledger
framing. Building here at `/app/concon/`, not in Codex.

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

### 2026-01-24 · v0.1 substrate (steps 1–3 of arch review §9)

- Realigned three founding docs (`AGENTS.md`, `V0_1_BRIEF.md`,
  `V0_1_ARCHITECTURE_REVIEW.md`) to the bridge framing.
- Portable extension repo at `/app/concon/`. Zero dependencies at runtime,
  Node ≥ 18 only for tests.
- **Extension source (`extension/`):**
  - `manifest.json` — MV3, `chatgpt.com`-only host permission, no fetch,
    CSP `connect-src 'self'`.
  - `src/content/bootstrap.js` — content-script entry, dynamic-imports mount.
  - `src/content/mount.js` — shadow-DOM panel host, SPA-navigation aware,
    conversationId lifecycle.
  - `src/content/observer.js` — MutationObserver + 750 ms streaming
    stability window.
  - `src/content/selectors.js` — single source of truth for ChatGPT DOM
    selectors (one-file hotfix on DOM change).
  - `src/core/message-model.js` — `MessageRecord` factory + validation.
  - `src/core/store.js` — in-memory + debounced IndexedDB persistence + tiny
    event bus.
  - `src/core/segmenter.js` — deterministic topic segmentation over user
    turns (cosine + continuation cues + shift cues + 30-min session gap).
  - `src/core/outline.js` — outline state, preserves labelConfirmed across
    re-segmentation.
  - `src/panel/panel.js` — shadow-DOM panel: header, turn/topic counts,
    empty state, footer.
  - `src/background/service-worker.js` — MV3 stub, no logic.
- **Dev harness (`dev-harness/`):** static HTML that mocks ChatGPT's DOM,
  loadable fixture, streamable turn simulator, regenerate + reset. Loads
  the actual extension modules; no chrome.* required.
- **Tests (`tests/`):** 17 Node-native unit tests covering
  message-model, segmenter (including cosine-based merge/split,
  continuation cues, shift cues, session gap, label preservation),
  and outline (label-confirmed persistence). All 17 pass.
- **Docs:** `README.md` (root), `docs/PORTABILITY.md` (lift-and-run
  anywhere), `docs/V0_1_BRIEF.md`, `docs/V0_1_ARCHITECTURE_REVIEW.md`.

### Verified (dev harness under Playwright, 1440×800 viewport)

- Panel mounts on load; survives SPA navigation between conversationIds.
- 8-turn fixture ingests correctly (streaming stability window respected).
- Segmenter produces 3 topics for the fixture (ShieldVault traction /
  AI aftermarket / equity structure); short "ok, go on" merged correctly.
- Character-by-character streamed turn ingests without producing partial
  records.
- SPA navigation resets counts to 0/0 as expected.

### Known gaps documented in code

- **Regenerate handling** (`observer.js` header comment): current
  substrate treats a new `data-message-id` as a new message, producing a
  phantom turn on regenerate. Linking via `regeneratesId` and following
  the visible branch is deferred to the ledger phase.

## Prioritized backlog

### P0 — before step 4 (heuristic-only ledger)

- Answer 5 open questions from arch review §10:
  1. Ledger organization (recommendation: toggleable, chronological default).
  2. Confirm/dismiss gesture (recommendation: dedicated buttons).
  3. Reference conversation for calibration.
  4. Whether to propose specific model IDs autonomously.
  5. Divergence noise tolerance (recommendation: over-flag in v0.1).

### P1 — step 4 (heuristic-only ledger, Path A demo point)

- `core/commitment-extract.js` — Stage 1 (sentence split) + Stage 2
  (heuristic filter). Human and assistant cue lists per arch review §4.
- Ledger UI in `panel/panel.js`: two-column layout, per-entry state
  (proposed / confirmed / dismissed / asserted / acknowledged / contested),
  click-to-jump.
- `core/ledger.js` — ledger state, persistence integration.

### P1 — step 5 (literal search)

- Substring across stored turns; highlight and scroll.

### P2 — steps 6–9 (Path B)

- `ml/runtime.js` — transformers.js lazy loader, hash verification, warm-up.
- `ml/models/README.md` — model IDs, versions, licenses, SHA-256 hashes.
- `ml/commitment-classifier.js` — NLI zero-shot wrapper.
- `ml/embeddings.js` — MiniLM-class sentence embeddings.
- `core/commitment-extract.js` — Stage 3 (classifier-backed).
- `core/referent-scan.js` — pronoun/definite-NP detection, candidate
  scoring, auto-bind vs. pin popover.
- `core/divergence.js` — 4 divergence types (unconfirmed premise,
  contested basis, referent mismatch, assertion drift).

### P2 — regenerate handling

- Detect regenerate patterns; link via `regeneratesId`; follow visible
  branch.

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
2. User answers arch review §10 open questions (at least Q1 + Q2).
3. Main agent proceeds to step 4 (heuristic-only ledger).
