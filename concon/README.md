# ConCon

**Conversational Congruence** — an instrument for bridging the human/LLM communication gap.

## Why this exists

In a long AI conversation, human and model drift apart in structurally
predictable ways. The human proposes something and the model treats it as
committed. The model uses "it" and binds it to a referent the human did not
mean. The model asserts a fact based on a premise the human never confirmed.
Neither party can see the drift while it's happening.

ConCon is a browser extension that mounts a right-side panel on
`chatgpt.com`. It quietly indexes the conversation, extracts commitment-shaped
statements from each turn, tracks ambiguous referents, and marks divergence
when the assistant appears to be operating on something the human never
confirmed. It is a mirror, not a third participant.

## Doctrine

Read `AGENTS.md` first. If you don't buy the doctrine, this repo will not
make sense — it looks like a table-of-contents extension and it isn't.

## Status

v0.1 — architecture-first prototype. Working from
`docs/V0_1_BRIEF.md` and `docs/V0_1_ARCHITECTURE_REVIEW.md`.

## Repo layout

```
concon/
├── AGENTS.md                      the doctrine
├── README.md                      this file
├── docs/
│   ├── V0_1_BRIEF.md              current milestone spec
│   ├── V0_1_ARCHITECTURE_REVIEW.md  what the code implements
│   └── PORTABILITY.md             how to lift this repo anywhere
├── extension/                     the shippable Chrome MV3 extension
│   ├── manifest.json
│   └── src/
│       ├── content/               content script + DOM observer
│       ├── panel/                 shadow-DOM right-side panel
│       ├── core/                  pure JS: model, store, segmenter, outline
│       └── background/            MV3 service worker stub
├── dev-harness/                   local harness: mock ChatGPT DOM, no browser install
├── tests/                         Node-native unit tests for core/
└── package.json                   dev-only; not part of the extension
```

## Local development

Prereqs: Node ≥ 18.

```bash
# Unit tests for the pure core modules
node --test tests/

# Dev harness (mock ChatGPT DOM in a static page)
python3 -m http.server 8000
# then open http://localhost:8000/dev-harness/
```

## Loading the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Open a ChatGPT conversation — the panel mounts on the right.

## Portability

See `docs/PORTABILITY.md`. Nothing in this repo depends on the environment it
was authored in. The bundled local model runtime that arrives in later phases
is checked into the repo, versioned, and hash-verified.

## Non-negotiables

- No backend.
- No accounts.
- No telemetry.
- No network calls at runtime.
- No external AI API.
- The manifest declares no host permission outside `chatgpt.com`.

These are doctrine, not preferences. See `AGENTS.md`.
