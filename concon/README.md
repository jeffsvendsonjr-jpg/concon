# ConCon

**Bridge the human/LLM communication gap. Local, offline, no telemetry.**

ConCon is a Chrome extension that turns any ChatGPT conversation into a
ledger of what you and the model have *actually* agreed to. It watches
turns as they appear, extracts commitment-shaped statements, and lets
you ratify or contest each one. Everything runs on your device — no
accounts, no servers, no API calls, no telemetry.

If you've ever had a long ChatGPT chat drift so far from what you
originally said that you gave up and started a new session, ConCon is
built for exactly that failure mode.

## Install (developer mode)

1. Download the latest [`concon-extension.zip`](../../releases) from the Releases page.
2. Unzip it somewhere permanent.
3. Open `chrome://extensions`, toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the unzipped folder.
5. Open any ChatGPT conversation. A slim rail appears on the right — click it to expand.

Chrome Web Store submission is on the roadmap; until then, this is the
canonical distribution channel.

## What it does today

- **Reads every turn** in a ChatGPT conversation via a MutationObserver
  on the shadow-DOM-isolated panel. Zero interference with ChatGPT's own UI.
- **Extracts commitment-shaped statements** — "I'll ship it Friday",
  "Add retry logic", "Reduce false positives" — using deterministic
  heuristics tuned against real conversations. Local model runtime
  (transformers.js WASM) lands in Step 6 and upgrades this to NLI.
- **Marks each entry as proposed / confirmed / contested / dismissed.**
  You decide the state — the tool never auto-promotes anything.
- **Groups by topic** via a lightweight segmenter that detects topic
  pivots in the conversation.
- **Full-text search** across the conversation and the ledger. Jumps
  you to the source turn on click.
- **ConCon Check** — impromptu state-integrity audit. Reports unresolved
  proposals, stale open items, contested entries, and hedged commitments.
  Honest scope: this is a *deterministic* audit of the ledger, not a
  semantic drift detector. That capability arrives in Steps 7–8.
- **Docks into ChatGPT's layout without breaking it.** Reflows the app
  shell instead of floating over the chat. Works at every viewport width.
  Slim rail by default; expand when you need the ledger, collapse to reclaim
  chat width.
- **Persists across refresh.** Per-conversation ledger and collapse state
  survive reloads via IndexedDB. Everything stays on your device.

## What it does NOT do (by design)

- **No external API calls.** Not to ConCon servers, not to OpenAI, not to
  any LLM provider, not to any analytics service. Full stop. There is no
  server to send data to; the extension has none.
- **No accounts.** Nothing to sign up for.
- **No telemetry.** We don't count installs, opens, or usage in any way
  that reaches us.
- **No fact-checking.** ConCon can tell you when the model contradicts
  what *you* said. It cannot tell you when the model is wrong about the
  world — that requires external knowledge, which requires network access,
  which we don't do. See [ROADMAP.md](docs/ROADMAP.md#scope-claim-what-concon-does-and-does-not-eliminate)
  for the honest scope claim.

## Core doctrine

The full doctrine lives in [`AGENTS.md`](AGENTS.md). The condensed
version:

1. **The gap is bidirectional.** Humans misread models; models misread humans.
2. **Proposal is not agreement.** Inference is not confirmation.
3. **Silence is not consent.** Absence of pushback is unsurfaced divergence.
4. **Fluency is not comprehension.** A confident reply is not evidence of shared understanding.
5. **The Curator Principle: the human ratifies, the tool never decides.**
   Every ledger transition requires an explicit user action. The tool
   surfaces evidence; it never speaks for the user.
6. **Anti-sycophancy.** ConCon is for people who want an adversarial
   collaborator, not a validator. Congratulatory language is banned from
   the product copy — this includes any future in-product AI features.

## Architecture

```
extension/
├── manifest.json              Chrome MV3 manifest
├── src/
│   ├── content/               Chrome-specific: DOM observer, dock, mount
│   │   ├── bootstrap.js       Entry point injected by manifest
│   │   ├── mount.js           Panel host + lifecycle
│   │   ├── observer.js        MutationObserver → ingest()
│   │   ├── selectors.js       ChatGPT DOM targets (updated when they change)
│   │   └── dock.js            App-shell reflow controller
│   ├── core/                  Runtime-agnostic: pure JS, no browser API deps
│   │   ├── message-model.js
│   │   ├── store.js           In-memory conversation state + IDB persistence
│   │   ├── segmenter.js       Topic segmentation
│   │   ├── outline.js         Topic listing
│   │   ├── commitment-extract.js  Heuristic extractor (Stage 1)
│   │   ├── ledger.js          Ledger entry lifecycle
│   │   ├── search.js          Ledger + transcript search
│   │   └── concon-check.js    State-integrity audit
│   ├── panel/                 Shadow-DOM UI
│   │   └── panel.js
│   └── background/            MV3 service worker
│       └── service-worker.js
tests/                         Node.js unit tests (70 passing)
docs/
├── ROADMAP.md                 Living roadmap + doctrine scope claims
├── PHASE_A.md                 Docking architecture notes
├── PORTABILITY.md             iOS/Safari portability discipline
└── V0_1_ARCHITECTURE_REVIEW.md
dev-harness/                   Mock ChatGPT DOM for isolated iteration
```

**Layering discipline:** everything in `core/` is pure JavaScript with
zero Chrome API dependencies. This is what keeps a Safari port and an
iOS companion app cheap in the future — only `content/` and
`background/` are Chrome-specific.

## Development

```bash
# Run the full test suite (Node.js native test runner, no dependencies).
node --test tests/**/*.test.js

# Rebuild the shippable zip.
cd extension && zip -r ../concon-extension.zip . -x "*.DS_Store"
```

Expect 70 tests passing across `core/`, extractor patterns, segmentation,
ledger state transitions, search, and the Check report generator.

## Roadmap

Full roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md). Immediate priorities:

- **Coverage detection** — teach ConCon Check to report `full` vs.
  `partial` observation honestly instead of the current `unknown`
  fallback.
- **Step 6: bundled local model runtime** (transformers.js WASM) —
  MiniLM embeddings + DistilBERT-MNLI. Replaces heuristics with real
  NLP. Doctrine intact: no external calls, model weights bundled.
- **Step 7: referent tracker** — detect ambiguous pronouns / definite NPs,
  auto-bind clear cases, prompt user for pins on unclear ones.
- **Step 8: inline drift markers** — colored gutter stripes on the
  ChatGPT DOM itself so you can scroll and spot rogue turns without
  opening the panel.

## Distribution / pricing

- **v0.x — free, MIT-licensed, open source.** Optimize for spread.
- **v1.0 — two tiers.**
  - Free forever: current session ledger, heuristic extractor, ConCon
    Check, Explicit + Balanced vigilance modes.
  - Pro ($6/mo or $48/yr, $79 lifetime): cross-conversation memory,
    local model runtime, Wary vigilance, exports, and the ongoing service
    of keeping selectors current when ChatGPT changes its DOM.

The core ledger insight is never gated. That's a doctrine, not a
pricing decision.

## License

MIT. See [`LICENSE`](LICENSE).

## Contributing

If you find that ChatGPT's DOM has drifted and ConCon stops detecting
turns, open an issue with (a) the URL where it broke and (b) the output
of `document.querySelector('[data-testid^="conversation-turn-"]')?.tagName`
run in the console. Selector maintenance is the single most-recurring
issue and PRs against `extension/src/content/selectors.js` are welcome.

For architectural / feature contributions, read `AGENTS.md` first. Any
change that violates the Curator Principle or introduces external
network calls will be closed regardless of implementation quality — the
doctrine is what makes ConCon *ConCon*.
