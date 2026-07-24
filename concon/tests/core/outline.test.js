import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateOutline } from '../../extension/src/core/outline.js';

function u({ id, order, text, observedAt }) {
  return {
    id,
    order,
    text,
    observedAt: observedAt ?? order * 1000,
    role: 'user',
    conversationId: 'c1',
  };
}

test('updateOutline returns { topics, updatedAt }', () => {
  const outline = updateOutline(null, [
    u({ id: 'a', order: 1, text: 'first topic about testing something new' }),
  ]);
  assert.ok(Array.isArray(outline.topics));
  assert.equal(typeof outline.updatedAt, 'number');
});

test('updateOutline preserves confirmed labels across re-segmentation', () => {
  const messages = [
    u({ id: 'a', order: 1, text: 'first topic about testing something new' }),
  ];
  const first = updateOutline(null, messages);
  first.topics[0].labelConfirmed = true;
  first.topics[0].label = 'my custom label';

  // Add a merged continuation — same topic still leads with turn 'a'.
  messages.push(u({ id: 'b', order: 2, text: 'go on' }));
  const second = updateOutline(first, messages);

  assert.equal(second.topics.length, 1);
  assert.equal(second.topics[0].label, 'my custom label');
  assert.equal(second.topics[0].labelConfirmed, true);
});

test('updateOutline does not preserve confirmed label when leading turn changes', () => {
  const first = updateOutline(null, [
    u({ id: 'a', order: 1, text: 'first topic about testing something new' }),
  ]);
  first.topics[0].labelConfirmed = true;
  first.topics[0].label = 'my custom label';

  // A shift cue creates a new topic; the new leading turn is 'b'.
  const second = updateOutline(first, [
    u({ id: 'a', order: 1, text: 'first topic about testing something new' }),
    u({
      id: 'b',
      order: 2,
      text: 'Switching gears — tell me about avocado toast farming logistics.',
    }),
  ]);
  assert.equal(second.topics.length, 2);
  assert.equal(second.topics[0].labelConfirmed, true);
  assert.equal(second.topics[0].label, 'my custom label');
  assert.equal(second.topics[1].labelConfirmed, false);
});
