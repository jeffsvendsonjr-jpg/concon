// ConCon Check — state-integrity audit over the current conversation.
//
// v0 SCOPE: this is a DETERMINISTIC report of what the ledger already knows.
// It reports counts, staleness, and administrative cleanliness. It does NOT
// (yet) reason about semantic drift, referent binding, or divergence between
// what the assistant asserted and what the human confirmed — those require
// Steps 7 (referent tracker) and 8 (divergence detector), which sit on
// top of the local model runtime (Step 6).
//
// Doctrine anchor: this module reports evidence. It never confirms alignment
// or contests an entry on the user's behalf. It never claims "no drift
// exists" — it can only claim "the recorded state is administratively
// clean." The distinction is doctrinally load-bearing.

const STALE_TURN_THRESHOLD = 5;

/**
 * runCheck({ messages, ledger, outline, coverage }) → CheckReport
 *
 * CheckReport shape:
 *   {
 *     status: 'pass' | 'review' | 'partial',
 *     coverage: 'full' | 'partial' | 'unknown',
 *     turnCount: number,
 *     confirmedCount: number,
 *     contestedCount: number,
 *     unresolvedCount: number,
 *     staleOpenCount: number,
 *     hedgedCount: number,
 *     findings: Array<Finding>,
 *   }
 *
 * Finding shape:
 *   {
 *     kind: 'unresolved-human'
 *         | 'unresolved-assistant'
 *         | 'stale-open'
 *         | 'contested',
 *     entryId: string,
 *     sourceMessageId: string,
 *     sentence: string,
 *     ageInTurns: number,
 *     hedged: boolean,
 *   }
 */
export function runCheck({ messages = [], ledger = null, coverage = 'unknown' } = {}) {
  const turnCount = messages.length;
  const entries = (ledger && ledger.entries) || [];
  const latestOrder = messages.reduce((m, x) => Math.max(m, x.order || 0), 0);

  let confirmedCount = 0;
  let contestedCount = 0;
  let unresolvedCount = 0;
  let staleOpenCount = 0;
  let hedgedCount = 0;
  const findings = [];

  for (const entry of entries) {
    if (entry.hedged) hedgedCount++;

    // Confirmed lifecycle-terminal states.
    if (entry.state === 'confirmed' || entry.state === 'acknowledged') {
      confirmedCount++;
      continue;
    }
    // Explicit user pushback.
    if (entry.state === 'contested' || entry.state === 'dismissed') {
      contestedCount++;
      findings.push({
        kind: 'contested',
        entryId: entry.id,
        sourceMessageId: entry.sourceMessageId,
        sentence: entry.sentence,
        role: entry.role,
        ageInTurns: ageOf(entry, messages, latestOrder),
        hedged: !!entry.hedged,
      });
      continue;
    }
    // Everything else is inferred-and-unresolved: proposed (human) or
    // asserted (assistant). These are the entries a ConCon Check exists
    // to surface.
    if (entry.state === 'proposed' || entry.state === 'asserted') {
      unresolvedCount++;
      const age = ageOf(entry, messages, latestOrder);
      const stale = age >= STALE_TURN_THRESHOLD;
      if (stale) staleOpenCount++;
      findings.push({
        kind: stale
          ? 'stale-open'
          : (entry.role === 'user' ? 'unresolved-human' : 'unresolved-assistant'),
        entryId: entry.id,
        sourceMessageId: entry.sourceMessageId,
        sentence: entry.sentence,
        role: entry.role,
        ageInTurns: age,
        hedged: !!entry.hedged,
      });
    }
  }

  // Ordering the findings: staleness first (oldest = most urgent), then by
  // role (human proposals slightly ahead of assistant assertions because
  // the human's own words are the higher-stakes accountability surface).
  findings.sort((a, b) => {
    if (a.kind !== b.kind) {
      const rank = { 'stale-open': 0, 'contested': 1, 'unresolved-human': 2, 'unresolved-assistant': 3 };
      return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
    }
    return b.ageInTurns - a.ageInTurns;
  });

  // Status is a strict function of the counts + coverage. This is the
  // doctrine hardpoint — the tool must never claim "pass" while coverage
  // is anything other than 'full', and must never claim "pass" while any
  // entry is unresolved. "pass" means: everything the tool observed is
  // resolved. Not "everything is aligned."
  let status;
  if (coverage !== 'full') {
    status = 'partial';
  } else if (unresolvedCount === 0 && contestedCount === 0) {
    status = 'pass';
  } else {
    status = 'review';
  }

  return {
    status,
    coverage,
    turnCount,
    confirmedCount,
    contestedCount,
    unresolvedCount,
    staleOpenCount,
    hedgedCount,
    findings,
  };
}

function ageOf(entry, messages, latestOrder) {
  const source = messages.find((m) => m.id === entry.sourceMessageId);
  const order = source?.order ?? entry.sourceOrder ?? latestOrder;
  return Math.max(0, latestOrder - order);
}

// Human-readable status headline for the panel.
export function formatStatusHeadline(report) {
  if (!report) return '—';
  const { status, coverage, unresolvedCount, staleOpenCount, contestedCount, turnCount } = report;
  if (status === 'partial') {
    return `PARTIAL — recorded ${turnCount} turns${coverage === 'unknown' ? ' (coverage unknown)' : ' (partial observation)'}`;
  }
  if (status === 'pass') {
    return `PASS — recorded state is administratively clean`;
  }
  // review
  const bits = [];
  if (staleOpenCount > 0) bits.push(`${staleOpenCount} stale`);
  if (unresolvedCount > 0) bits.push(`${unresolvedCount} unresolved`);
  if (contestedCount > 0) bits.push(`${contestedCount} contested`);
  return `REVIEW — ${bits.join(' · ')}`;
}
