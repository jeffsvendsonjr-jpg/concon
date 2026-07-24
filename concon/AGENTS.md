# ConCon working rules

## Mission

ConCon exists to bridge the human/LLM communication gap.

In a long AI conversation, human and model drift apart in structurally
predictable ways — over referents, over what has been committed to versus only
proposed, over what has been confirmed versus only inferred — and neither party
can see the drift happening. ConCon is an external instrument, controlled by
the human, that makes the drift visible to both sides in real time so it can be
reconciled — or explicitly kept open — rather than silently accumulating.

ConCon is a shared instrument, not an auditor. It renders divergence; it does
not resolve it. Reconciliation is always the participants' work.

## Core doctrine

- The gap is bidirectional. Humans misread models; models misread humans.
  Neither party is the correct one by default.
- Proposal is not agreement.
- Inference is not confirmation.
- Exploration is not decision.
- Fluency is not comprehension. A confident-sounding reply is not evidence of
  shared understanding.
- Silence is not consent. Absence of pushback is unsurfaced divergence, not
  agreement.
- Neither party's memory is truth. The LLM's context window and the human's
  recollection can each be wrong; only surfaced-and-confirmed shared state
  counts.
- Nothing consequential silently merges into shared state.
- Conversation is evidence. Evidence includes what each party can be seen to
  believe, not only what each party literally said.
- The tool is a mirror, not a third participant.
- The tool must have no opaque state of its own. A bridge with its own hidden
  agenda is not a bridge.

## Current scope

This repository is an architecture-first prototype. The v0.1 goal is a
right-side browser-extension panel that, on a live ChatGPT conversation,
renders a **Commitment & Referent Ledger** and a **Divergence Indicator**,
backed by an internal living outline of the conversation.

The living outline is the substrate. The ledger is the visible product. The
outline alone is not sufficient for v0.1 — outline structure is not the
communication gap.

### Do not

- add a backend,
- add accounts,
- add telemetry or analytics,
- add payments or licensing,
- send any data to any host other than `chatgpt.com` (the manifest must make
  this impossible, not merely policy),
- introduce an external AI API. If you believe one is necessary, stop and
  raise it for review.

### Local, bundled models are permitted

Local, offline, bundled models (e.g. spaCy for coreference / referent
resolution, small classifiers for commitment tagging, small transformers
compiled to WASM/ONNX) are permitted in v0.1 and are the intended
implementation path. They are subject to the same doctrine as the rest of the
tool:

- they must run entirely inside the extension, with no network calls,
- their outputs are **inferred** and must render as inferred — never as
  confirmed shared state — until the human promotes them,
- their model files, versions, and licenses are checked into the repository
  and inspectable,
- swapping or updating a bundled model is a doctrinal decision, not a routine
  dependency bump.

## Before significant coding

Inspect the target environment and propose the smallest robust architecture.
Do not begin implementation of a new phase without an architecture pass that
covers, at minimum:

1. what surface the phase adds to the ledger,
2. what part of the gap it targets,
3. whether the phase can be done deterministically or requires a local model,
4. the privacy consequences of the new surface,
5. how the phase degrades gracefully if ChatGPT's DOM changes.
