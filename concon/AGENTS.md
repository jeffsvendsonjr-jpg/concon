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

## The Curator Principle

The human ratifies. The tool never decides.

ConCon extracts commitment-shaped statements, detects ambiguous referents,
and surfaces divergence between what the assistant asserts and what the
human confirmed. It never promotes an entry to confirmed shared state
without an explicit human tap. It never resolves an ambiguous referent
without a human pin. It never contests an assistant assertion without a
human challenge.

The value of ConCon is a **continuity positive feedback loop**: user
ratifies → ledger records → panel surfaces → user references in the next
turn → assistant sees the shared state stated back → drift reduced. This
loop stabilizes long conversations that would otherwise degrade into
noise. But positive feedback loops amplify errors as readily as truths;
therefore:

- The "contest" affordance must be as prominent as "confirm." Cheap
  unwinding matters as much as cheap ratification.
- Latent state is never confirmed state. Extractors and local models
  propose; they do not decide. A commitment cannot cross from proposed to
  confirmed without a human action.
- Vigilance modes (see below) control the *proposal rate*, not the
  ratification threshold. The user calibrates how much noise the tool is
  allowed to make, but the tool never speaks *for* the user.

## Target user and the anti-sycophancy stance

ConCon has an implicit target user: someone who wants an
**adversarial-collaborator dynamic** with the model, not a validation
dynamic. Someone who prefers being told an idea won't work over being
told it's brilliant. Someone whose creative process depends on adversarial
pressure to filter volume down to quality — the "one brilliant idea in
100,000, fine by me" temperament.

RLHF-trained models tend toward sycophancy — pattern-matched agreement,
praise, mirror-language — because reward-model training implicitly
optimizes for user-preferred responses, and users unconsciously prefer
being agreed with. This produces a devastating combination for people
actually trying to make something: confidence in the ideator rises while
the quality signal falls. Bad ideas held with high conviction.

ConCon exists in service of users who explicitly reject that dynamic.
The tool must therefore embody the same value in its own behavior:

- No congratulatory framing in surfaced entries ("great question," "nice
  point," etc. are banned from the copy).
- Divergence markers are neutral, not encouraging. Rogue-begin is a
  signal, not a scold.
- The panel copy states what is, not how the user feels about what is.
- Any future in-product AI (local model runtime) inherits the same
  discipline: propose candidates, mark confidence, never editorialize.

There is a very large user segment that prefers sycophantic interaction
patterns. ConCon has nothing to offer them, and should not try. Products
that try to serve everyone serve no one.

## Vigilance modes

Different conversations warrant different scrutiny. Casual brainstorming
and legal-adjacent drafting cannot share one threshold. ConCon exposes
three named modes (never a raw slider — users don't know where to put a
number), stored per-conversation:

- **Explicit only.** Ledger records commitments with clear illocutionary
  force ("I will X", "we agreed X"). Ignores hedges. Ignores referents.
  Silent unless the assistant asserts something the human explicitly said.
- **Balanced (default).** Current heuristics. Moderate confidence floor.
  Referent ambiguity surfaced when it crosses threshold.
- **Wary.** Everything above, plus proactive divergence pings when the
  assistant asserts "as you mentioned" / "you agreed" and the referenced
  content is not in the confirmed set. Wary is the human's declaration
  that this conversation matters and interruption is preferable to drift.

Vigilance is the human side of the Curator Principle. The user still
ratifies every entry; vigilance only shapes what gets proposed for
ratification.

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
