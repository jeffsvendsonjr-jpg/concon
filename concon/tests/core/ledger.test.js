import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  updateLedger,
  transitionEntry,
  groupByTopic,
  HUMAN_STATES,
  ASSISTANT_STATES,
} from '../../extension/src/core/ledger.js';

function msg({ id, order, role, text }) {
  return { id, order, role, text, conversationId: 'c1', observedAt: order * 1000 };
}

test('updateLedger returns entries for extracted commitments', () => {
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "I will ship the ledger first." }),
    msg({ id: 'b', order: 2, role: 'assistant', text: "I'll write the extractor tonight." }),
    msg({ id: 'c', order: 3, role: 'user', text: "What if it takes longer?" }),
  ];
  const ledger = updateLedger(null, messages);
  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[0].role, 'user');
  assert.equal(ledger.entries[0].state, HUMAN_STATES.PROPOSED);
  assert.equal(ledger.entries[1].role, 'assistant');
  assert.equal(ledger.entries[1].state, ASSISTANT_STATES.ASSERTED);
});

test('entries are sorted chronologically by sourceOrder', () => {
  const messages = [
    msg({ id: 'a', order: 3, role: 'user', text: "I will do X." }),
    msg({ id: 'b', order: 1, role: 'user', text: "I will do Y." }),
    msg({ id: 'c', order: 2, role: 'assistant', text: "I'll handle it." }),
  ];
  const ledger = updateLedger(null, messages);
  const orders = ledger.entries.map((e) => e.sourceOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('transitionEntry moves user entry proposed → confirmed', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will do X." })];
  const ledger = updateLedger(null, messages);
  const entryId = ledger.entries[0].id;
  const next = transitionEntry(ledger, entryId, HUMAN_STATES.CONFIRMED);
  assert.equal(next.entries[0].state, HUMAN_STATES.CONFIRMED);
  assert.notEqual(next, ledger, 'transitionEntry returns a new object');
});

test('transitionEntry moves assistant entry asserted → contested', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'assistant', text: "I'll ship X." })];
  const ledger = updateLedger(null, messages);
  const entryId = ledger.entries[0].id;
  const next = transitionEntry(ledger, entryId, ASSISTANT_STATES.CONTESTED);
  assert.equal(next.entries[0].state, ASSISTANT_STATES.CONTESTED);
});

test('transitionEntry refuses cross-role state transitions', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will do X." })];
  const ledger = updateLedger(null, messages);
  const entryId = ledger.entries[0].id;
  // 'contested' is only valid for assistant entries.
  const next = transitionEntry(ledger, entryId, 'contested');
  assert.equal(next.entries[0].state, HUMAN_STATES.PROPOSED);
});

test('transitionEntry is a no-op on unknown entryId', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will do X." })];
  const ledger = updateLedger(null, messages);
  const next = transitionEntry(ledger, 'nonexistent', HUMAN_STATES.CONFIRMED);
  assert.equal(next, ledger);
});

test('updateLedger preserves user state on re-computation', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will do X." })];
  const first = updateLedger(null, messages);
  const confirmed = transitionEntry(first, first.entries[0].id, HUMAN_STATES.CONFIRMED);

  // Add a new message. The old entry must remain confirmed.
  messages.push(msg({ id: 'b', order: 2, role: 'user', text: "I will do Y." }));
  const second = updateLedger(confirmed, messages);

  assert.equal(second.entries.length, 2);
  const preserved = second.entries.find((e) => e.sourceMessageId === 'a');
  assert.equal(preserved.state, HUMAN_STATES.CONFIRMED);
});

test('updateLedger preserves contested state across re-computation', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'assistant', text: "I'll do X." })];
  const first = updateLedger(null, messages);
  const contested = transitionEntry(first, first.entries[0].id, ASSISTANT_STATES.CONTESTED);
  const second = updateLedger(contested, messages);
  assert.equal(second.entries[0].state, ASSISTANT_STATES.CONTESTED);
});

test('groupByTopic buckets entries by outline topic', () => {
  const outline = {
    topics: [
      { id: 't1', label: 'first', firstTurnOrder: 1, turnIds: ['a'] },
      { id: 't2', label: 'second', firstTurnOrder: 2, turnIds: ['c'] },
    ],
  };
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "I will do X." }),
    msg({ id: 'c', order: 2, role: 'user', text: "I will do Y." }),
  ];
  const ledger = updateLedger(null, messages);
  const groups = groupByTopic(ledger, outline);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].topic.id, 't1');
  assert.equal(groups[0].entries.length, 1);
  assert.equal(groups[0].entries[0].sourceMessageId, 'a');
});

test('groupByTopic falls back to a single group without outline', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will do X." })];
  const ledger = updateLedger(null, messages);
  const groups = groupByTopic(ledger, null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].topic, null);
  assert.equal(groups[0].entries.length, 1);
});

test('groupByTopic makes assistant entries inherit the preceding user topic', () => {
  const outline = {
    topics: [
      { id: 't1', label: 'first', firstTurnOrder: 1, turnIds: ['a'] },
      { id: 't2', label: 'second', firstTurnOrder: 3, turnIds: ['c'] },
    ],
  };
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "I will do X." }),
    msg({ id: 'b', order: 2, role: 'assistant', text: "I'll help with that." }),
    msg({ id: 'c', order: 3, role: 'user', text: "Let's talk about Y." }),
    msg({ id: 'd', order: 4, role: 'assistant', text: "The plan is to ship Y." }),
  ];
  const ledger = updateLedger(null, messages);
  const groups = groupByTopic(ledger, outline);
  assert.equal(groups.length, 2);
  // Topic 1 should contain the user entry from 'a' and the assistant entry from 'b'.
  const t1 = groups.find((g) => g.topic?.id === 't1');
  assert.ok(t1);
  const t1SourceIds = new Set(t1.entries.map((e) => e.sourceMessageId));
  assert.ok(t1SourceIds.has('a'));
  assert.ok(t1SourceIds.has('b'));
  // Topic 2 should contain the user entry from 'c' and the assistant entry from 'd'.
  const t2 = groups.find((g) => g.topic?.id === 't2');
  assert.ok(t2);
  const t2SourceIds = new Set(t2.entries.map((e) => e.sourceMessageId));
  assert.ok(t2SourceIds.has('c'));
  assert.ok(t2SourceIds.has('d'));
});
