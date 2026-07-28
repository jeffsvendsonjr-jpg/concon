// Commitment-shaped statement extraction.
//
// v0.1 Path A (heuristic-only). Path B (bundled classifier) is a Stage 3
// that will slot in later without changing this file's shape.
//
// Pipeline:
//   Stage 1  — sentence split (deterministic, no model)
//   Stage 2  — heuristic filter (deterministic, no model)  ← ships in v0.1
//   Stage 3  — classifier (Path B, later)
//   Stage 4  — ledger placement (in ledger.js)
//   Stage 5  — dedup (in ledger.js; embedding-backed dedup arrives with Path B)

// -------------------------------------------------------------------------
// Human column cues (arch review §4).
// A human sentence that matches is a candidate 'commitment'.
// -------------------------------------------------------------------------

const HUMAN_COMMIT_CUES = [
  /\bI['\u2019]ll\b/i,
  /\bI will\b/i,
  /\bI['\u2019]m going to\b/i,
  /\bI['\u2019]ve decided\b/i,
  /\bI want to\b/i,
  /\bI want\b/i,             // bare "I want X" (X may be a noun, not an infinitive)
  /\bI['\u2019]d like\b/i,
  /\bI need to\b/i,
  /\bI need\b/i,
  /\blet['\u2019]s\b/i,
  /\bwe should\b/i,
  /\bwe['\u2019]ll\b/i,
  /\bthe plan is\b/i,
  /\bgoing with\b/i,
  /\bI['\u2019]m planning to\b/i,
];

const HUMAN_IMPERATIVE_LEAD = new Set([
  'do', 'use', 'skip', 'ship', 'send', 'make', 'build', 'write',
  'delete', 'remove', 'add', 'change', 'fix', 'update', 'create',
  'implement', 'try', 'stop', 'keep', 'give', 'show', 'tell',
  'draft', 'refactor', 'rename', 'move', 'commit', 'push',
  'reduce', 'harden', 'expand', 'certify', 'publish', 'verify',
  'audit', 'gate', 'block', 'enforce', 'require', 'confirm',
  'include', 'exclude', 'allow', 'disable', 'enable', 'retry',
  'log', 'ignore', 'route', 'redirect', 'wrap',
]);

// -------------------------------------------------------------------------
// Assistant column cues (arch review §4).
// Assistant sentences matching a commit cue are 'commitment'; sentences
// matching the definite-assertion pattern are 'statement' (still enters the
// ledger as an assertion the human may need to acknowledge or contest).
// -------------------------------------------------------------------------

const ASSISTANT_COMMIT_CUES = [
  /\bI['\u2019]ll\b/i,
  /\bI have\b/i,
  /\bI['\u2019]ve\b/i,
  /\bthe plan is\b/i,
  /\bwe['\u2019]ll\b/i,
  /\bnext step\b/i,
  /\bI recommend\b/i,
  /\bI['\u2019]ve done\b/i,
  /\bthe answer is\b/i,
  /\bmy recommendation\b/i,
];

// Very light "X is/are/will/requires Y" pattern for the assistant. Deliberately
// conservative so we don't drown the ledger — Stage 3 (Path B) will do this
// much better later.
const ASSISTANT_ASSERTION = /\b[A-Z]?\w+\s+(is|are|was|were|requires?|will|must|means)\s+\w+/;

// -------------------------------------------------------------------------
// Hedge cues (arch review §4). Hedged commitments still enter the ledger;
// they render distinctly and start with lower confidence.
// -------------------------------------------------------------------------

const HEDGE_CUES = [
  /\bmaybe\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\bperhaps\b/i,
  /\bI think\b/i,
  /\bprobably\b/i,
  /\bif you want\b/i,
  /\bone option\b/i,
  /\boptionally\b/i,
  /\bpossibly\b/i,
  /\bmay\b/i,
  /\bsort of\b/i,
  // Conditional hedges — "if X", "when possible", "as long as", "provided
  // that", etc. Any of these downgrade an otherwise-firm commitment to
  // conditional. Critical distinction: a real requirement stays firm, a
  // conditional one carries its own escape clause.
  /\bif\s+(technically\s+|reasonably\s+|actually\s+)?possible\b/i,
  /\bif\s+it['\u2019]?s\s+possible\b/i,
  /\bif\s+feasible\b/i,
  /\bif\s+we\s+can\b/i,
  /\bif\s+you\s+can\b/i,
  /\bwhen\s+possible\b/i,
  /\bwhere\s+possible\b/i,
  /\bas\s+long\s+as\b/i,
  /\bprovided\s+that\b/i,
  /\bassuming\b/i,
  /\bideally\b/i,
];

// -------------------------------------------------------------------------
// Stage 1: sentence split.
//
// We deliberately drop fenced code blocks and inline `code` — code isn't
// prose commitment. The splitter respects `. ! ?` as sentence terminals and
// preserves char offsets so the panel can highlight the source span later.
// -------------------------------------------------------------------------

export function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip code fences and inline code without changing overall length —
  // replace with spaces so offsets remain roughly meaningful.
  const stripped = text
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));

  // Char-by-char scan. A run of terminating punctuation is a real sentence
  // boundary only when it's followed by whitespace or end-of-string. This
  // keeps `transformers.js`, `v0.1`, `e.g.`, `i.e.`, URLs, and decimal
  // numbers inside a single sentence. Newlines are treated as unconditional
  // boundaries — this is how bullet lists (which lack terminal punctuation)
  // get split into individual items.
  const sentences = [];
  const len = stripped.length;
  const isTerm = (c) => c === '.' || c === '!' || c === '?';
  let start = 0;
  for (let i = 0; i < len; i++) {
    const c = stripped[i];
    if (c === '\n') {
      const raw = stripped.slice(start, i);
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        sentences.push({ text: trimmed, startOffset: start, endOffset: i });
      }
      start = i + 1;
      continue;
    }
    if (!isTerm(c)) continue;
    // Consume any additional terminators (e.g. "!!!", "?!").
    let j = i;
    while (j + 1 < len && isTerm(stripped[j + 1])) j++;
    const after = j + 1 < len ? stripped[j + 1] : null;
    const boundary = after === null || /\s/.test(after);
    if (boundary) {
      const raw = stripped.slice(start, j + 1);
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        sentences.push({ text: trimmed, startOffset: start, endOffset: j + 1 });
      }
      start = j + 1;
    }
    i = j;
  }
  const rest = stripped.slice(start).trim();
  if (rest.length > 0) {
    sentences.push({ text: rest, startOffset: start, endOffset: len });
  }
  return sentences;
}

// -------------------------------------------------------------------------
// Stage 2: heuristic filter.
// -------------------------------------------------------------------------

function hasHedge(text) {
  return HEDGE_CUES.some((re) => re.test(text));
}

function matchesAny(text, patterns) {
  return patterns.some((re) => re.test(text));
}

function isImperativeLead(text) {
  // Strip leading bullet markers ("-", "*", "•", "1.", "1)") so bullet-list
  // items are classified by their first *content* word, not their marker.
  const cleaned = String(text || '')
    .trim()
    .replace(/^[-*•·▪▫◦]+\s+/, '')
    .replace(/^\d+[.)]\s+/, '');
  const first = cleaned
    .split(/\s+/, 1)[0]
    ?.toLowerCase()
    ?.replace(/[^\w']/g, '') || '';
  return HUMAN_IMPERATIVE_LEAD.has(first);
}

function isQuestion(text) {
  return /\?\s*$/.test(String(text || '').trim());
}

import { matchRule } from './custom-rules.js';

function classify(sentence, role) {
  if (isQuestion(sentence)) return null;
  if (role === 'user') {
    if (matchesAny(sentence, HUMAN_COMMIT_CUES)) return 'commitment';
    if (isImperativeLead(sentence)) return 'commitment';
  } else if (role === 'assistant') {
    if (matchesAny(sentence, ASSISTANT_COMMIT_CUES)) return 'commitment';
    // Assistant imperative-lead — matches bullet-shaped recommendations
    // ("Fix X", "Reduce Y", "Add Z"). Classified as 'statement' because
    // it's a proposal from the assistant, not a commitment the assistant
    // is personally making; the human still needs to ratify.
    if (isImperativeLead(sentence)) return 'statement';
    if (ASSISTANT_ASSERTION.test(sentence)) return 'statement';
  }
  // Custom user-taught rules — applied only when the built-in
  // classifier didn't match. Doctrine: built-ins are the primary
  // signal, user rules *extend* rather than *override*.
  const custom = matchRule(sentence, role);
  if (custom) return custom.classification;
  return null;
}

// -------------------------------------------------------------------------
// Public API.
// -------------------------------------------------------------------------

/**
 * extractFromMessage(message) → Array<Extraction>
 *
 * Extraction shape:
 *   {
 *     role, sourceMessageId, sourceOrder,
 *     sentence, startOffset, endOffset,
 *     classification: 'commitment' | 'statement',
 *     hedged: boolean,
 *     confidence: number,          // heuristic-only; Path B replaces this
 *   }
 */
export function extractFromMessage(message) {
  if (!message || !message.text) return [];
  const role = message.role;
  if (role !== 'user' && role !== 'assistant') return [];
  const sentences = splitSentences(message.text);
  const out = [];
  for (const s of sentences) {
    const cls = classify(s.text, role);
    if (!cls) continue;
    const hedged = hasHedge(s.text);
    out.push({
      role,
      sourceMessageId: message.id,
      sourceOrder: message.order ?? 0,
      sentence: s.text,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      classification: cls,
      hedged,
      confidence: hedged ? 0.5 : 0.8,
    });
  }
  return out;
}

export function extractFromMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    for (const e of extractFromMessage(m)) out.push(e);
  }
  return out;
}
