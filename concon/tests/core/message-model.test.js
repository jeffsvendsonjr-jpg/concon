import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessageRecord, isSameContent } from '../../extension/src/core/message-model.js';

test('makeMessageRecord requires id', () => {
  assert.throws(() => makeMessageRecord({ conversationId: 'c1', role: 'user', text: 'hi' }));
});

test('makeMessageRecord requires conversationId', () => {
  assert.throws(() => makeMessageRecord({ id: 'm1', role: 'user', text: 'hi' }));
});

test('makeMessageRecord rejects invalid role', () => {
  assert.throws(() =>
    makeMessageRecord({ id: 'm1', conversationId: 'c1', role: 'bot', text: 'hi' })
  );
});

test('makeMessageRecord accepts a valid record', () => {
  const r = makeMessageRecord({
    id: 'm1',
    conversationId: 'c1',
    role: 'user',
    text: 'hi',
    observedAt: 1234,
    order: 5,
  });
  assert.equal(r.id, 'm1');
  assert.equal(r.conversationId, 'c1');
  assert.equal(r.role, 'user');
  assert.equal(r.text, 'hi');
  assert.equal(r.observedAt, 1234);
  assert.equal(r.order, 5);
  assert.equal(r.extractedAt, null);
  assert.equal(r.extractionModelVersion, null);
});

test('makeMessageRecord defaults observedAt to now-ish', () => {
  const before = Date.now();
  const r = makeMessageRecord({ id: 'm1', conversationId: 'c1', role: 'user', text: 'hi' });
  const after = Date.now();
  assert.ok(r.observedAt >= before && r.observedAt <= after);
});

test('isSameContent compares id and text', () => {
  const a = { id: 'x', text: 'hello' };
  assert.equal(isSameContent(a, { id: 'x', text: 'hello' }), true);
  assert.equal(isSameContent(a, { id: 'x', text: 'hello!' }), false);
  assert.equal(isSameContent(a, { id: 'y', text: 'hello' }), false);
  assert.equal(isSameContent(null, a), false);
  assert.equal(isSameContent(a, null), false);
});
