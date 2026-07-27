import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, formatStatusHeadline } from '../../extension/src/core/concon-check.js';
import { updateLedger, transitionEntry } from '../../extension/src/core/ledger.js';

function msg({ id, order, role, text }) {
  return { id, order, role, text, conversationId: 'c1', observedAt: order * 1000 };
}

function buildLedgerFrom(messages) {
  return updateLedger(null, messages);
}

test('runCheck with empty ledger returns partial (coverage unknown)', () => {
  const report = runCheck({ messages: [], ledger: null, coverage: 'unknown' });
  assert.equal(report.status, 'partial');
  assert.equal(report.coverage, 'unknown');
  assert.equal(report.turnCount, 0);
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.unresolvedCount, 0);
  assert.deepEqual(report.findings, []);
});

test('runCheck returns pass only when coverage is full AND all entries resolved', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I will ship it." })];
  let ledger = buildLedgerFrom(messages);
  ledger = transitionEntry(ledger, ledger.entries[0].id, 'confirmed');

  // Coverage unknown → cannot pass.
  const partial = runCheck({ messages, ledger, coverage: 'unknown' });
  assert.equal(partial.status, 'partial');

  // Coverage full + all resolved → pass.
  const full = runCheck({ messages, ledger, coverage: 'full' });
  assert.equal(full.status, 'pass');
  assert.equal(full.confirmedCount, 1);
  assert.equal(full.unresolvedCount, 0);
});

test('runCheck reports review when unresolved entries exist', () => {
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "I will ship it." }),
    msg({ id: 'b', order: 2, role: 'assistant', text: "I'll write the extractor tonight." }),
  ];
  const ledger = buildLedgerFrom(messages);
  const report = runCheck({ messages, ledger, coverage: 'full' });
  assert.equal(report.status, 'review');
  assert.equal(report.unresolvedCount, 2);
  assert.equal(report.confirmedCount, 0);
});

test('stale-open findings are flagged past the threshold and sorted first', () => {
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "I will ship the ledger." }),
    ...Array.from({ length: 6 }, (_, i) =>
      msg({ id: 'x' + i, order: 2 + i, role: 'user', text: "unrelated line " + i + "." })
    ),
    msg({ id: 'z', order: 20, role: 'user', text: "I want to add caching." }),
  ];
  const ledger = buildLedgerFrom(messages);
  const report = runCheck({ messages, ledger, coverage: 'full' });
  assert.ok(report.staleOpenCount >= 1, 'the old proposal should be stale');
  // First finding should be the oldest stale one.
  assert.equal(report.findings[0].kind, 'stale-open');
});

test('contested entries are counted and appear in findings', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'assistant', text: "The plan is to use GraphQL." })];
  let ledger = buildLedgerFrom(messages);
  ledger = transitionEntry(ledger, ledger.entries[0].id, 'contested');
  const report = runCheck({ messages, ledger, coverage: 'full' });
  assert.equal(report.contestedCount, 1);
  assert.equal(report.status, 'review');
  assert.ok(report.findings.some((f) => f.kind === 'contested'));
});

test('hedged entries are counted separately', () => {
  const messages = [msg({ id: 'a', order: 1, role: 'user', text: "I want to include Facebook if technically possible." })];
  const ledger = buildLedgerFrom(messages);
  const report = runCheck({ messages, ledger, coverage: 'full' });
  assert.equal(report.hedgedCount, 1, 'the conditional hedge should be recognised');
});

test('formatStatusHeadline never claims semantic alignment', () => {
  const passHeadline = formatStatusHeadline({
    status: 'pass', coverage: 'full', turnCount: 5,
    confirmedCount: 3, unresolvedCount: 0, staleOpenCount: 0, contestedCount: 0, hedgedCount: 0, findings: [],
  });
  // Doctrine: never say "no drift", never say "aligned".
  assert.doesNotMatch(passHeadline, /aligned/i);
  assert.doesNotMatch(passHeadline, /no drift/i);
  assert.match(passHeadline, /clean/i);

  const partialHeadline = formatStatusHeadline({
    status: 'partial', coverage: 'unknown', turnCount: 5,
    confirmedCount: 0, unresolvedCount: 0, staleOpenCount: 0, contestedCount: 0, hedgedCount: 0, findings: [],
  });
  assert.match(partialHeadline, /partial/i);
  assert.match(partialHeadline, /unknown/i);
});
