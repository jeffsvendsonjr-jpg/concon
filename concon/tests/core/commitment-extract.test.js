import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitSentences,
  extractFromMessage,
  extractFromMessages,
} from '../../extension/src/core/commitment-extract.js';

function msg({ id, order, role, text }) {
  return { id, order, role, text, conversationId: 'c1', observedAt: order * 1000 };
}

// -------------------- splitSentences --------------------

test('splitSentences returns empty on empty input', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(null), []);
});

test('splitSentences splits on . ! ?', () => {
  const s = splitSentences('One. Two! Three?');
  assert.equal(s.length, 3);
  assert.equal(s[0].text, 'One.');
  assert.equal(s[1].text, 'Two!');
  assert.equal(s[2].text, 'Three?');
});

test('splitSentences preserves trailing sentence without terminator', () => {
  const s = splitSentences('Hello. Rest goes here');
  assert.equal(s.length, 2);
  assert.equal(s[1].text, 'Rest goes here');
});

test('splitSentences strips fenced code blocks', () => {
  const s = splitSentences('Look at this: ```const x = 1;``` I will use it.');
  const joined = s.map((x) => x.text).join(' | ');
  assert.ok(!joined.includes('const x'));
  assert.ok(joined.toLowerCase().includes('i will use it'));
});

test('splitSentences strips inline code', () => {
  const s = splitSentences('The `foo` variable is important.');
  assert.ok(!s.some((x) => x.text.includes('foo')));
});

test('splitSentences keeps periods inside identifiers (e.g., transformers.js)', () => {
  const s = splitSentences("I'll bundle a small NLI classifier. transformers.js is the right runtime.");
  assert.equal(s.length, 2);
  assert.ok(s[1].text.includes('transformers.js'));
});

test('splitSentences keeps periods inside version numbers (v0.1)', () => {
  const s = splitSentences("We should skip Firefox for the v0.1 milestone.");
  assert.equal(s.length, 1);
  assert.ok(s[0].text.includes('v0.1 milestone'));
});

// -------------------- extractFromMessage: human --------------------

test('extracts a plain human commitment', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'user',
    text: "I will ship the dock fix by tomorrow.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
  assert.equal(out[0].role, 'user');
  assert.equal(out[0].hedged, false);
});

test('extracts a "let\'s ..." human commitment', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'user',
    text: "Let's use MutationObserver for turn detection.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('extracts an imperative-lead human commitment', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'user',
    text: "Ship the ledger view first; the referent tracker can wait.",
  }));
  assert.ok(out.length >= 1);
  assert.equal(out[0].classification, 'commitment');
});

test('flags a hedged human commitment as hedged', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'user',
    text: "I think I will maybe try the classifier route.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].hedged, true);
  assert.equal(out[0].confidence, 0.5);
});

test('ignores human questions', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'user',
    text: "Should we ship the ledger view first?",
  }));
  assert.equal(out.length, 0);
});

// -------------------- extractFromMessage: assistant --------------------

test('extracts an assistant "I\'ll ..." commitment', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'assistant',
    text: "I'll write the ledger module and add tests.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('extracts an assistant "the plan is ..." commitment', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'assistant',
    text: "The plan is to ship Path A first and add Path B later.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('extracts an assistant definite assertion as statement', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'assistant',
    text: "MutationObserver is the right choice for turn detection here.",
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'statement');
});

test('ignores assistant questions', () => {
  const out = extractFromMessage(msg({
    id: 'm1', order: 1, role: 'assistant',
    text: "Should I use MutationObserver or an SSE interceptor?",
  }));
  assert.equal(out.length, 0);
});

// -------------------- source metadata --------------------

test('extraction carries sourceMessageId and sourceOrder through', () => {
  const out = extractFromMessage(msg({
    id: 'm42', order: 7, role: 'user',
    text: "I will refactor the segmenter tonight.",
  }));
  assert.equal(out[0].sourceMessageId, 'm42');
  assert.equal(out[0].sourceOrder, 7);
});

test('extractFromMessages walks all messages', () => {
  const messages = [
    msg({ id: 'a', order: 1, role: 'user', text: "Let's target Chrome MV3." }),
    msg({ id: 'b', order: 2, role: 'assistant', text: "I'll draft the manifest first." }),
    msg({ id: 'c', order: 3, role: 'user', text: "What about Firefox?" }),
  ];
  const out = extractFromMessages(messages);
  assert.equal(out.length, 2);
  assert.equal(out[0].sourceMessageId, 'a');
  assert.equal(out[1].sourceMessageId, 'b');
});

test('unknown roles are ignored', () => {
  const out = extractFromMessage({ id: 'x', order: 1, role: 'system', text: "I will do something." });
  assert.equal(out.length, 0);
});


// -------------------- v0.3 extractor gap fixes --------------------

test('extracts bare "I want X" (no infinitive)', () => {
  // Human review flagged: "I want Facebook included if technically possible"
  // was missed by the previous extractor which required "I want to ...".
  const out = extractFromMessage(
    msg({ id: 'g1', order: 1, role: 'user', text: "I want Facebook included if technically possible." })
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
  assert.equal(out[0].hedged, true, 'conditional "if technically possible" must hedge');
});

test('extracts "I need X" without infinitive', () => {
  const out = extractFromMessage(
    msg({ id: 'g2', order: 1, role: 'user', text: "I need Facebook desktop support." })
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('extracts "I\'d like ..." as a commitment', () => {
  const out = extractFromMessage(
    msg({ id: 'g3', order: 1, role: 'user', text: "I'd like a warning banner when nothing is detected." })
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].classification, 'commitment');
});

test('recognizes conditional hedges beyond "maybe/might"', () => {
  const cases = [
    "Ship it if feasible.",
    "Add caching when possible.",
    "Include Facebook if we can.",
    "Enforce lint provided that CI is green.",
  ];
  for (const text of cases) {
    const out = extractFromMessage(msg({ id: 'h', order: 1, role: 'user', text }));
    assert.ok(out.length > 0, `should extract from: ${text}`);
    assert.equal(out[0].hedged, true, `conditional hedge should register on: ${text}`);
  }
});
