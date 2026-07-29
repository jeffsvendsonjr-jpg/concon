// Coverage tracker — did the observer actually witness the whole
// conversation, or only a virtualized slice ChatGPT rendered?
//
// This is doctrinally load-bearing: ConCon Check refuses to return
// `pass` unless coverage is `full`. Getting this wrong in the
// permissive direction (claiming `full` when we didn't see the top)
// would let CHECK claim clean paperwork over half a conversation. So
// the rule is: be conservative, under-claim, never over-claim.
//
// Two independent signals are combined:
//
//   1. topAnchorWitnessed — at some point during this session we saw
//      the scroll root at (or very near) scrollTop = 0 while turns
//      were mounted in the DOM. That is definitive proof the top of
//      the conversation was in view.
//
//   2. observedTurns is contiguous — we have every integer turn
//      index from min(observed) to max(observed). If ChatGPT
//      virtualization unmounted turns before we could observe them,
//      there will be a gap.
//
// Both must be true for `full`. If we've observed nothing at all,
// coverage is `unknown` (honest — we can't distinguish empty chat
// from "not yet loaded"). Everything else is `partial`.
//
// Storage is intentionally in-memory. Coverage is a property of the
// observation session, not of persisted state. When the tab closes,
// coverage resets to `unknown`, which is the honest answer.

const SCROLL_TOP_EPSILON = 20; // px — allow for minor bounce/spring.

const state = new Map(); // conversationId → { observedTurns: Set<number>, topAnchorWitnessed: boolean }

function ensure(conversationId) {
  if (!conversationId) return null;
  let s = state.get(conversationId);
  if (!s) {
    s = { observedTurns: new Set(), topAnchorWitnessed: false };
    state.set(conversationId, s);
  }
  return s;
}

/**
 * Record that we observed (ingested text for) a specific turn index.
 * Turn indices come from ChatGPT's `data-testid="conversation-turn-N"`.
 * We only accept finite non-negative integers.
 */
export function recordTurnObserved(conversationId, turnIndex) {
  const s = ensure(conversationId);
  if (!s) return;
  if (!Number.isInteger(turnIndex) || turnIndex < 0) return;
  s.observedTurns.add(turnIndex);
}

/**
 * Record a scroll snapshot. If the scroll root is at (or very near)
 * the top AND at least one turn is currently mounted, we mark the
 * top anchor as witnessed. This is a monotonic flag — once set, it
 * stays set for the lifetime of this session's coverage record.
 */
export function recordScrollSnapshot(conversationId, { scrollTop, anyTurnMounted }) {
  const s = ensure(conversationId);
  if (!s) return;
  if (s.topAnchorWitnessed) return;
  if (!anyTurnMounted) return;
  if (typeof scrollTop !== 'number') return;
  if (scrollTop <= SCROLL_TOP_EPSILON) {
    s.topAnchorWitnessed = true;
  }
}

/**
 * Discard everything we knew about a conversation. Called on
 * navigation to a different conversation so state can't bleed.
 */
export function resetCoverage(conversationId) {
  if (!conversationId) return;
  state.delete(conversationId);
}

/**
 * Test-only helper: wipe the entire tracker.
 */
export function _resetAllCoverage() {
  state.clear();
}

/**
 * Compute coverage for the current conversation.
 *   - 'unknown': we haven't observed any turns yet.
 *   - 'full':    top anchor witnessed AND observedTurns has no gaps
 *                between its min and max.
 *   - 'partial': anything else (turns observed but either top not
 *                yet seen, or observed indices have gaps because
 *                virtualization unmounted turns we didn't reach).
 */
export function assessCoverage(conversationId) {
  const s = state.get(conversationId);
  if (!s || s.observedTurns.size === 0) return 'unknown';
  if (!s.topAnchorWitnessed) return 'partial';
  const indices = Array.from(s.observedTurns).sort((a, b) => a - b);
  const lo = indices[0];
  const hi = indices[indices.length - 1];
  const expected = hi - lo + 1;
  if (indices.length !== expected) return 'partial';
  return 'full';
}

/**
 * Diagnostic snapshot — used by the panel's coverage chip so the
 * user can see *why* coverage is partial without having to guess.
 */
export function getCoverageDiagnostics(conversationId) {
  const s = state.get(conversationId);
  if (!s || s.observedTurns.size === 0) {
    return { coverage: 'unknown', observedCount: 0, topAnchorWitnessed: false, gapCount: 0 };
  }
  const indices = Array.from(s.observedTurns).sort((a, b) => a - b);
  const lo = indices[0];
  const hi = indices[indices.length - 1];
  const gapCount = (hi - lo + 1) - indices.length;
  return {
    coverage: assessCoverage(conversationId),
    observedCount: indices.length,
    topAnchorWitnessed: s.topAnchorWitnessed,
    gapCount,
    minTurn: lo,
    maxTurn: hi,
  };
}
