# ConCon v0.1 brief

## Hypothesis

A long AI conversation contains, at every moment, a specific structural
disagreement between what the human has actually confirmed and what the LLM is
operating on. That disagreement is invisible to both parties today. If we
render it — as a real-time ledger of commitments, referents, and unsurfaced
assumptions, controlled by the human, running entirely on the human's machine
— then reconciliation becomes possible, and the class of failure known
loosely as "the model drifted" becomes a class of failure the human can
actually see, name, and fix.

## What the gap is, precisely

v0.1 targets the following mismatches:

1. **Reference drift.** The human says "the project" or "it" and the LLM
   binds it to something the human did not mean.
2. **Commitment asymmetry.** The human proposes; the LLM treats the proposal
   as a working assumption. The LLM asserts; the human hears a commitment
   where the model produced a probabilistic surface.
3. **Silence-as-consent.** The LLM proceeds on an assumption the human did
   not confirm. Absence of pushback is not agreement.
4. **Exploration/decision blur.** Humans think out loud; LLMs treat
   thinking-out-loud as decisions.

Later phases will target further mismatches (confidence asymmetry, implicit
context, memory asymmetry across sessions). v0.1 stays on the four above
because they are the ones a browser-side instrument can meaningfully address
without model interrogation.

## First success criteria

On one long, real ChatGPT conversation, the extension panel shows:

1. **A Commitment Ledger, two columns.**
   - **Human column:** each commitment-shaped statement extracted from the
     human's turns. Every entry begins in *proposed* state and renders
     visually as inferred (dim, italic). The human confirms or dismisses.
     Confirmed entries render as the human's committed shared state for this
     conversation.
   - **Assistant column:** each commitment-shaped statement extracted from
     the assistant's turns. Every entry begins in *asserted* state. The
     human may mark as *acknowledged* (I saw this and accept it) or
     *contested* (the assistant is treating this as settled and I did not
     agree).

2. **A Referent Tracker.** When the assistant uses a pronoun or a definite
   noun phrase ("it", "the plan", "that constraint") that could plausibly
   bind to more than one prior turn, the panel surfaces the candidates and
   lets the human pin the correct one. Pinned referents feed forward: the
   next time the same expression appears, ConCon reuses the pinned binding
   unless the local model detects a rebinding.

3. **A Divergence Indicator.** When the assistant's most recent reply
   appears to operate on a proposition that is not in the human's confirmed
   set (or is in the contested set), the panel raises a marker next to that
   turn. Not an alarm — a marker. The human decides whether the next reply
   needs to correct it.

4. **Click-to-jump** on every ledger entry and every referent, in both
   directions (ledger → source turn, source turn → ledger entries derived
   from it).

5. **Literal search** across the transcript, unchanged from prior scope.

6. **The living outline exists as internal substrate.** Turns are indexed
   and topic-grouped so the ledger can be reorganized by topic when the
   conversation is very long. The outline itself is not the visible product.

## Success looks like

On one real conversation, a user can look at the panel and say:
"The model has been operating as if I committed to X since turn 24, but the
ledger shows I only proposed X — I never confirmed it." They then click the
ledger entry, jump to turn 24, correct the model in their next reply, and
promote (or explicitly dismiss) the entry in the ledger.

That single interaction — visible drift, jumped to source, corrected in the
next turn — is v0.1's demo and v0.1's proof.

## Non-goals for v0.1

- Nested topic hierarchy in the outline (flat is fine; outline is substrate,
  not product).
- Confidence surfacing on assistant claims (needs model interrogation).
- Feeding confirmed shared state back into the model's context as a system
  message. This is genuinely interesting and it is v0.3+.
- Cross-conversation memory or ledger transport between conversations.
- Any UI that judges the assistant. ConCon renders; it does not scold.
- Chrome Web Store submission. v0.1 is unpacked developer-mode only.

## Architecture review required before coding

Before further significant code, produce or update `V0_1_ARCHITECTURE_REVIEW.md`
covering:

1. proposed file structure (must reflect the ledger, not just the outline),
2. technical architecture including the bundled local-model runtime,
3. how ChatGPT messages will be observed and uniquely tracked,
4. how commitment-shaped statements will be extracted (heuristics + local
   model split),
5. how referent candidates will be detected and resolved (local model),
6. how divergence between "assistant is operating on X" and "human confirmed
   set" will be computed,
7. what remains deterministic/local vs. what needs the bundled model,
8. privacy risks — including the new class introduced by shipping a local
   model (model hallucination as *inference*, not as confirmation),
9. smallest implementation sequence, ordered so each step is independently
   demoable,
10. assumptions, declared explicitly.

Do not write significant code for the ledger or the referent tracker until
this review is complete and approved.
