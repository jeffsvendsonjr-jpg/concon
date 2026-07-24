import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../../extension/src/core/segmenter.js';

function userTurn({ id, order, text, observedAt }) {
  return {
    id,
    order,
    text,
    observedAt: observedAt ?? order * 1000,
    role: 'user',
    conversationId: 'c1',
  };
}

test('empty input yields no topics', () => {
  assert.deepEqual(segment([]), []);
});

test('single user turn yields one topic', () => {
  const topics = segment([
    userTurn({ id: 'a', order: 1, text: 'Tell me about ShieldVault traction status.' }),
  ]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].turnIds.length, 1);
  assert.equal(topics[0].firstTurnId, 'a');
  assert.equal(topics[0].labelConfirmed, false);
});

test('explicit shift cue starts a new topic', () => {
  const topics = segment([
    userTurn({ id: 'a', order: 1, text: 'ShieldVault traction plan. What is the fastest path?' }),
    userTurn({ id: 'b', order: 2, text: 'Switching gears, tell me about the AI aftermarket instead.' }),
  ]);
  assert.equal(topics.length, 2);
});

test('short continuation is merged into current topic', () => {
  const topics = segment([
    userTurn({ id: 'a', order: 1, text: 'Explain conversational congruence and why it matters here.' }),
    userTurn({ id: 'b', order: 2, text: 'go on' }),
    userTurn({ id: 'c', order: 3, text: 'and then?' }),
  ]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].turnIds.length, 3);
});

test('long unrelated turn starts a new topic', () => {
  const topics = segment([
    userTurn({
      id: 'a',
      order: 1,
      text: 'ShieldVault traction plan for first ten customers pipeline enterprise DLP.',
    }),
    userTurn({
      id: 'b',
      order: 2,
      text: 'Completely different question about avocado toast farming, produce distribution, seasonal pricing, and cooperative logistics arrangements across regions.',
    }),
  ]);
  assert.equal(topics.length, 2);
});

test('large time gap starts a new topic', () => {
  const topics = segment([
    userTurn({
      id: 'a',
      order: 1,
      text: 'What is ShieldVault traction status this week?',
      observedAt: 0,
    }),
    userTurn({
      id: 'b',
      order: 2,
      text: 'What is ShieldVault traction status this week?',
      observedAt: 60 * 60 * 1000,
    }),
  ]);
  assert.equal(topics.length, 2);
});

test('assistant messages are ignored by segmentation', () => {
  const topics = segment([
    userTurn({ id: 'a', order: 1, text: 'User asks about ShieldVault traction next steps.' }),
    {
      id: 'b',
      order: 2,
      text: 'Assistant explains ShieldVault traction thoroughly with new content.',
      role: 'assistant',
      conversationId: 'c1',
      observedAt: 2000,
    },
    userTurn({ id: 'c', order: 3, text: 'follow up on that plan' }),
  ]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].turnIds.length, 2);
});

test('topics carry a non-empty label', () => {
  const topics = segment([
    userTurn({ id: 'a', order: 1, text: 'Talk to me about the ConCon commitment ledger design.' }),
  ]);
  assert.ok(topics[0].label && topics[0].label.length > 0);
  // Stopwords should not dominate the label.
  assert.ok(!/^the$/i.test(topics[0].label));
});
