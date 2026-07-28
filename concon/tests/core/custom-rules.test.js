import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRules, addRule, removeRule, clearAllRules, matchRule,
} from '../../extension/src/core/custom-rules.js';
import { extractFromMessage } from '../../extension/src/core/commitment-extract.js';

function installFakeStorage() {
  const s = new Map();
  globalThis.localStorage = {
    getItem: (k) => (s.has(k) ? s.get(k) : null),
    setItem: (k, v) => { s.set(k, String(v)); },
    removeItem: (k) => { s.delete(k); },
    clear: () => { s.clear(); },
  };
}

function msg(text, role = 'user') {
  return { id: 'm1', order: 1, role, text, conversationId: 'c1', observedAt: 1000 };
}

test('addRule persists and getRules returns it', () => {
  installFakeStorage();
  const r = addRule({ phrase: 'MUST', classification: 'commitment', role: 'user' });
  assert.ok(r?.id);
  assert.equal(getRules().length, 1);
  assert.equal(getRules()[0].phrase, 'MUST');
});

test('addRule normalises invalid inputs', () => {
  installFakeStorage();
  const r = addRule({ phrase: '  keep  ', classification: 'weirdclass', role: 'notarole' });
  assert.equal(r.phrase, 'keep');
  assert.equal(r.classification, 'commitment');
  assert.equal(r.role, 'any');
});

test('addRule rejects empty phrases', () => {
  installFakeStorage();
  const r = addRule({ phrase: '   ' });
  assert.equal(r, null);
  assert.equal(getRules().length, 0);
});

test('addRule dedupes exact matches', () => {
  installFakeStorage();
  const a = addRule({ phrase: 'must', role: 'user' });
  const b = addRule({ phrase: 'MUST', role: 'user' });
  assert.equal(a.id, b.id, 'case-insensitive dedupe returns original');
  assert.equal(getRules().length, 1);
});

test('removeRule deletes by id', () => {
  installFakeStorage();
  const r = addRule({ phrase: 'foo' });
  const ok = removeRule(r.id);
  assert.equal(ok, true);
  assert.equal(getRules().length, 0);
});

test('clearAllRules empties the list', () => {
  installFakeStorage();
  addRule({ phrase: 'foo' });
  addRule({ phrase: 'bar' });
  clearAllRules();
  assert.equal(getRules().length, 0);
});

test('matchRule returns first matching rule case-insensitively', () => {
  installFakeStorage();
  addRule({ phrase: 'MUST', role: 'user' });
  const m = matchRule('This function MUST return 42.', 'user');
  assert.ok(m);
  assert.equal(m.phrase, 'MUST');
});

test('matchRule respects role scoping', () => {
  installFakeStorage();
  addRule({ phrase: 'ship it', role: 'user' });
  assert.ok(matchRule('ship it Friday', 'user'));
  assert.equal(matchRule('ship it Friday', 'assistant'), null);
});

test('role=any matches both roles', () => {
  installFakeStorage();
  addRule({ phrase: '// TODO', role: 'any' });
  assert.ok(matchRule('leave a // TODO comment', 'user'));
  assert.ok(matchRule('add a // TODO here', 'assistant'));
});

// -------------------- extractor integration --------------------

test('extractor picks up custom rules when built-ins do not match', () => {
  installFakeStorage();
  addRule({ phrase: 'canonical', classification: 'commitment', role: 'user' });
  const out = extractFromMessage(msg('The canonical layout is required.', 'user'));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('built-in classification wins when both would match', () => {
  installFakeStorage();
  // A custom rule that would fire on "I will", but the built-ins already
  // classify this as a commitment. Result should still be commitment
  // (no double-classification), and no crash.
  addRule({ phrase: 'I will', classification: 'statement', role: 'user' });
  const out = extractFromMessage(msg('I will ship the feature.', 'user'));
  assert.equal(out.length, 1);
  // Built-in path returns 'commitment' first (order in classify()).
  assert.equal(out[0].classification, 'commitment');
});
