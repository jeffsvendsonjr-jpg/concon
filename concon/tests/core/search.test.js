import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchLedger,
  searchTranscript,
  countTranscriptOnly,
  highlightMatch,
  normalizeQuery,
} from '../../extension/src/core/search.js';

const ledger = {
  entries: [
    { id: 'e1', sourceMessageId: 'm1', role: 'user',      sentence: "Let's target Chrome MV3." },
    { id: 'e2', sourceMessageId: 'm2', role: 'assistant', sentence: "I'll draft the manifest first." },
    { id: 'e3', sourceMessageId: 'm2', role: 'assistant', sentence: "MV3 is a good choice." },
  ],
};
const messages = [
  { id: 'm1', role: 'user',      text: "Let's target Chrome MV3." },
  { id: 'm2', role: 'assistant', text: "I'll draft the manifest first. MV3 is a good choice." },
  { id: 'm3', role: 'user',      text: "What about Firefox extensions?" },
];

test('normalizeQuery trims and lowercases', () => {
  assert.equal(normalizeQuery('  Hello  '), 'hello');
  assert.equal(normalizeQuery(null), '');
});

test('searchLedger returns hasQuery=false on empty query', () => {
  const r = searchLedger(ledger, '');
  assert.equal(r.hasQuery, false);
  assert.deepEqual(r.matches, []);
});

test('searchLedger is case-insensitive', () => {
  const r = searchLedger(ledger, 'mv3');
  assert.equal(r.hasQuery, true);
  assert.equal(r.matches.length, 2);
});

test('searchLedger returns empty matches when no hit', () => {
  const r = searchLedger(ledger, 'unicorn');
  assert.equal(r.hasQuery, true);
  assert.equal(r.matches.length, 0);
});

test('searchTranscript returns matching messages', () => {
  const r = searchTranscript(messages, 'firefox');
  assert.equal(r.hasQuery, true);
  assert.equal(r.turns.length, 1);
  assert.equal(r.turns[0].id, 'm3');
});

test('countTranscriptOnly excludes turns whose sentences already match in the ledger', () => {
  // 'MV3' appears in m1, m2 (ledger has entries from both) — no transcript-only matches.
  assert.equal(countTranscriptOnly(ledger, messages, 'MV3'), 0);
});

test('countTranscriptOnly counts turns whose ledger entries do not match', () => {
  // 'Firefox' appears only in m3, which has no ledger entry.
  assert.equal(countTranscriptOnly(ledger, messages, 'firefox'), 1);
});

test('highlightMatch returns pre/match/post around first occurrence', () => {
  const r = highlightMatch("I'll target Chrome MV3 later.", 'chrome');
  assert.equal(r.pre, "I'll target ");
  assert.equal(r.match, 'Chrome');
  assert.equal(r.post, ' MV3 later.');
});

test('highlightMatch on no match returns the whole string in pre', () => {
  const r = highlightMatch("nothing here", 'xyz');
  assert.equal(r.pre, 'nothing here');
  assert.equal(r.match, '');
  assert.equal(r.post, '');
});

test('highlightMatch is case-insensitive but preserves original case', () => {
  const r = highlightMatch("The FIRE alarm sounded.", 'fire');
  assert.equal(r.match, 'FIRE');
});
