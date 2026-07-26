# ConCon — Roadmap

Living document. Priorities reflect the 2026-07-25 strategy sidebar that
introduced Curator Principle, vigilance modes, ConCon Check, and pricing.

## Now (in flight)

- **v0.2.0 dock reflow verification** on live ChatGPT in split-screen.
  Blocker on advancing to Step 5.5.

## Next

### Step 5.5 — ConCon Check (heuristic version) · **P0**

On-demand surfacing of open loops in the current conversation. This is
the product's elevator pitch: every ChatGPT user has felt "did we ever
settle X?" — ConCon Check answers it in one tap.

- Button in the panel header + keyboard shortcut (Cmd/Ctrl+Shift+K).
- Impromptu only. Never proactive. Proactive belongs to Wary vigilance.
- Result view lists four categories in priority order:
  1. Assistant asked, user didn't answer (highest drift risk).
  2. User asked, assistant sidestepped.
  3. Proposals still in "proposed" state, sorted by staleness.
  4. Referents introduced but never bound (activates with Step 7).
- Each item tappable → jumps to the source turn.
- v1 detection: content-word overlap heuristic (80% accuracy target).
  Upgraded to NLI-backed detection in Step 8.5.
- Doctrine fit: user-initiated, evidence-surfacing, never automated
  ratification.

### Step 6 — Bundled local model runtime · **P0**

- `ml/runtime.js` — transformers.js lazy loader, hash verification, warm-up.
- `ml/models/README.md` — model IDs, versions, licenses, SHA-256 hashes.
- `ml/commitment-classifier.js` — NLI zero-shot wrapper replacing heuristic
  labels. User-set state preserved.
- `ml/embeddings.js` — MiniLM sentence embeddings for dedup, referent
  scoring, and assertion-drift detection.

### Step 7 — Referent tracker · **P1**

- `core/referent-scan.js` — pronoun / definite-NP detection, candidate
  scoring, auto-bind vs. pin popover.
- Feeds ConCon Check category #4.

### Step 8 — Divergence detection + Inline Drift Markers · **P1**

- `core/divergence.js` — the four divergence types (unconfirmed premise,
  contested basis, referent mismatch, assertion drift).
- **Inline Drift Markers** — colored gutter stripes on the ChatGPT turn
  in the host DOM itself. This is the killer surface of the feature: you
  scroll your own chat and rogue turns call out to you. No need to open
  the panel. Palette (letterpress-aligned):
  - Rogue begin: deep amber (`#b0632d`) — assistant asserts something the
    human never explicitly confirmed.
  - Contested basis: rust red (`#a13a2b`) — assistant proceeds from a
    contested premise.
  - Ambiguous referent: ochre (`#c99a3a`) — new "the X"/"that"/pronoun
    without a binding.
  - Silent topic pivot: slate (`#6b7280`) — segmenter detected a shift
    the assistant didn't acknowledge.
  Rendering: 3px stripe on the turn's left edge + small dot in the
  top-left corner; hover-tooltip explains the signal. Never mutates
  ChatGPT's text — added-adjacent only.
- **Vigilance-gated:** Explicit → no markers. Balanced → high-confidence
  rogue-begin + contested-basis only. Wary → all four types + proactive
  toast pings in the panel when a new divergence fires.
- Divergence flags also appear in the panel next to the source turn and
  the ledger entry.

### Step 8.5 — ConCon Check NLI upgrade · **P1**

Once the local model runtime is available, replace content-word overlap
in Step 5.5 with entailment scoring. Accuracy jumps from ~80% to ~95%.

## Later — v1.0 launch surface

### Vigilance modes UI · **P1**

Three-mode toggle in the panel header (Explicit / Balanced / Wary).
Per-conversation persistence, same pattern as collapse state.

### Persistent cross-conversation memory · **P1** (paid tier)

IndexedDB-backed ledger that survives refresh and can be referenced from
subsequent conversations. Requires a "workspace" concept that stays
local-only.

### Exports · **P2** (paid tier)

Markdown and JSON export of the confirmed shared state, per conversation.

### Regenerate authority · **P2**

Link via `regeneratesId`, follow the visible branch. Currently every
regenerate produces a phantom turn.

## Distribution / positioning

### v0.x — free, MIT, open source

No paywall, no accounts. The mental model needs word of mouth to spread.
Every user is a distribution channel.

### v1.0 — dual tier

- **Free forever:** single-conversation session ledger, heuristic
  extractor, ConCon Check (heuristic), Explicit + Balanced vigilance.
  Never crippled.
- **Pro $6/mo or $48/yr:** cross-conversation memory, local model runtime,
  Wary vigilance, exports, keyboard shortcuts, and the ongoing service of
  keeping selectors current when ChatGPT ships DOM changes.
- **Lifetime $79** one-time, capped at ~1000 seats first year for
  price-anchoring.

### v2.0 — team tier ($15/user/mo, min 3 seats)

Only if pulled by real demand. Requires a backend, which breaks doctrine
unless carefully designed as a sync-only relay with client-side crypto.
Cross that bridge only when the market pulls.

## iOS strategy — deferred until Chrome traction

Everything in `extension/src/core/` is runtime-agnostic and portable.

1. **Safari Web Extension port** — cheap fast follow (~2 weeks), covers
   only Safari-tab usage on iOS. Small share of iOS ChatGPT usage.
2. **Companion iOS app + Share Sheet** — user shares a message from the
   ChatGPT app into ConCon. On-device inference via Core ML. Different
   UX (separate view, not inline rail) but this is the real iOS product.
3. **Keyboard extension** — v3+ experiment. Not v1.

Do not design for iOS until Chrome has validated the mental model. Keep
`core/` chrome-free so path 1/2 remain cheap.

## Doctrine invariants (never violate)

- No backend, no accounts, no telemetry, no external AI API.
- The human ratifies; the tool never decides.
- Local models propose; they never confirm.
- Vigilance controls proposal rate, never ratification threshold.
- ConCon Check stays user-initiated; proactive lives in Wary vigilance.
