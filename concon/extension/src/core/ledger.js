// Ledger state, transitions, and re-computation that preserves user actions.
//
// The ledger is derived from the current messages via commitment-extract.
// On every message change we re-derive; but any entry whose state was
// changed by an explicit human action is preserved as long as its source
// (messageId + sentence) still exists.
//
// State machine per role:
//   human:      proposed   → confirmed | dismissed
//   assistant:  asserted   → acknowledged | contested
//
// Doctrine: state transitions require an explicit human gesture. The
// re-computation on every message change never overwrites a state the
// human chose.

import { extractFromMessages } from './commitment-extract.js';

export const HUMAN_STATES = Object.freeze({
  PROPOSED: 'proposed',
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
});

export const ASSISTANT_STATES = Object.freeze({
  ASSERTED: 'asserted',
  ACKNOWLEDGED: 'acknowledged',
  CONTESTED: 'contested',
});

const VALID_HUMAN = new Set(Object.values(HUMAN_STATES));
const VALID_ASSISTANT = new Set(Object.values(ASSISTANT_STATES));

function keyFor(ex) {
  // Stable identifier over (source turn, sentence content).
  return `${ex.sourceMessageId}::${ex.startOffset}::${hash32(ex.sentence)}`;
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

function initialStateFor(role) {
  return role === 'user' ? HUMAN_STATES.PROPOSED : ASSISTANT_STATES.ASSERTED;
}

/**
 * updateLedger(prev, messages) → LedgerState
 *
 * LedgerState shape:
 *   { entries: LedgerEntry[], updatedAt: number }
 *
 * LedgerEntry shape:
 *   { id, role, sourceMessageId, sourceOrder, sentence,
 *     startOffset, endOffset, classification, hedged, confidence,
 *     state, createdAt, updatedAt }
 */
export function updateLedger(prev, messages) {
  const extractions = extractFromMessages(messages || []);
  const prevByKey = new Map();
  if (prev && Array.isArray(prev.entries)) {
    for (const e of prev.entries) {
      prevByKey.set(e.id, e);
    }
  }
  const now = Date.now();
  const entries = extractions.map((ex) => {
    const id = keyFor(ex);
    const prevEntry = prevByKey.get(id);
    if (prevEntry) {
      return {
        ...prevEntry,
        // Refresh derived fields; preserve user-managed state.
        sourceOrder: ex.sourceOrder,
        confidence: ex.confidence,
        hedged: ex.hedged,
        classification: ex.classification,
        updatedAt: now,
      };
    }
    return {
      id,
      ...ex,
      state: initialStateFor(ex.role),
      createdAt: now,
      updatedAt: now,
    };
  });
  // Sort chronologically by source order, then by startOffset within a turn.
  entries.sort((a, b) => {
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return (a.startOffset ?? 0) - (b.startOffset ?? 0);
  });
  return { entries, updatedAt: now };
}

/**
 * transitionEntry(ledger, entryId, newState) → LedgerState
 *
 * Returns a new ledger object. Invalid transitions return the input
 * unchanged (fail closed, per doctrine — the tool never silently rewrites
 * user-set state on bad input).
 */
export function transitionEntry(ledger, entryId, newState) {
  if (!ledger || !Array.isArray(ledger.entries)) return ledger;
  let changed = false;
  const entries = ledger.entries.map((e) => {
    if (e.id !== entryId) return e;
    const valid = e.role === 'user' ? VALID_HUMAN : VALID_ASSISTANT;
    if (!valid.has(newState)) return e;
    changed = true;
    return { ...e, state: newState, updatedAt: Date.now() };
  });
  if (!changed) return ledger;
  return { entries, updatedAt: Date.now() };
}

/**
 * groupByTopic(ledger, outline) → Array<{ topic, entries }>
 *
 * Used by the panel when the "by topic" view is active. Topics come from
 * the outline substrate (which segments only user turns). Assistant
 * entries inherit the topic of the most recent preceding user entry, so
 * an assistant's response appears under the topic the user opened.
 */
export function groupByTopic(ledger, outline) {
  if (!ledger?.entries?.length) return [];
  if (!outline?.topics?.length) {
    return [{ topic: null, entries: ledger.entries.slice() }];
  }
  const userTurnTopic = new Map();
  for (const t of outline.topics) {
    for (const tid of t.turnIds) userTurnTopic.set(tid, t);
  }
  const sorted = [...ledger.entries].sort((a, b) => {
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return (a.startOffset ?? 0) - (b.startOffset ?? 0);
  });
  const groups = new Map();
  const orphaned = [];
  let lastTopic = null;
  for (const e of sorted) {
    let t = userTurnTopic.get(e.sourceMessageId) || null;
    if (t) {
      lastTopic = t;
    } else if (e.role === 'assistant') {
      t = lastTopic;
    }
    if (!t) {
      orphaned.push(e);
      continue;
    }
    if (!groups.has(t.id)) groups.set(t.id, { topic: t, entries: [] });
    groups.get(t.id).entries.push(e);
  }
  const result = Array.from(groups.values());
  result.sort((a, b) => a.topic.firstTurnOrder - b.topic.firstTurnOrder);
  if (orphaned.length) result.push({ topic: null, entries: orphaned });
  return result;
}
