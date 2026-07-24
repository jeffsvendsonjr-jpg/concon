// Deterministic topic segmentation over user turns.
//
// v0.1 role: internal substrate for the ledger. NOT the visible product.
// Rules from V0_1_ARCHITECTURE_REVIEW §4 (original outline-first review,
// preserved here as substrate).

const CONTINUATION_CUES = new Set([
  'so', 'also', 'and', 'but', 'then', 'ok', 'okay', 'right', 'wait', 'no', 'yes',
]);

const SHIFT_CUES = [
  "let's talk about",
  'switching gears',
  'different topic',
  'on another note',
  'new question',
  'unrelated',
  'moving on',
  'back to',
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'to', 'of', 'in',
  'on', 'for', 'is', 'are', 'was', 'were', 'be', 'been', 'i',
  'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would',
  'can', 'could', 'should', 'my', 'your', 'our', 'their', 'me',
  'at', 'by', 'from', 'with', 'about', 'as', 'into', 'like',
]);

const SESSION_GAP_MS = 30 * 60 * 1000;
const MERGE_COSINE = 0.35;
const SPLIT_COSINE = 0.15;
const SHORT_TURN_TOKENS = 12;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function termCounts(tokens) {
  const counts = new Map();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function cosine(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function startsWithContinuationCue(text) {
  const first = String(text || '')
    .trim()
    .split(/\s+/, 1)[0]
    ?.toLowerCase()
    ?.replace(/[^\w']/g, '') || '';
  return CONTINUATION_CUES.has(first);
}

function hasShiftCue(text) {
  const head = String(text || '').toLowerCase().slice(0, 200);
  return SHIFT_CUES.some((cue) => head.includes(cue));
}

function labelFor(text) {
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t));
  if (tokens.length === 0) {
    return String(text || '').trim().slice(0, 40) || 'untitled';
  }
  return tokens.slice(0, 6).join(' ');
}

/**
 * segment(messages) → Array<Topic>
 *
 * Topic shape:
 *   {
 *     id, label, labelConfirmed,
 *     firstTurnId, firstTurnOrder,
 *     lastObservedAt,
 *     turnIds: [id, ...]
 *   }
 *
 * Only user turns drive segmentation. Assistant turns are ignored here
 * (they will feed the commitment ledger in later phases).
 */
export function segment(messages) {
  const userTurns = (messages || [])
    .filter((m) => m && m.role === 'user')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (userTurns.length === 0) return [];

  const topics = [];
  let centroidTokens = [];

  for (const turn of userTurns) {
    const tokens = tokenize(turn.text);
    const tokenCount = tokens.length;
    const turnVec = termCounts(tokens);
    const centroidVec = termCounts(centroidTokens);
    const sim = topics.length === 0 ? 0 : cosine(turnVec, centroidVec);
    const timeGap =
      topics.length === 0
        ? 0
        : (turn.observedAt ?? 0) - (topics[topics.length - 1].lastObservedAt ?? 0);

    // Precedence:
    //   1. First turn always creates a topic.
    //   2. Session-gap (wall-clock) always splits — a return after 30 min is
    //      a new topic regardless of textual similarity.
    //   3. Explicit shift cue in the turn text always splits.
    //   4. Merge cues (high cosine, or short continuation with cue) merge.
    //   5. Low-cosine + long-turn heuristic splits.
    //   6. Default: merge.
    let split = false;
    if (topics.length === 0) {
      split = true;
    } else if (timeGap > SESSION_GAP_MS) {
      split = true;
    } else if (hasShiftCue(turn.text)) {
      split = true;
    } else if (sim > MERGE_COSINE) {
      split = false;
    } else if (tokenCount < SHORT_TURN_TOKENS && startsWithContinuationCue(turn.text)) {
      split = false;
    } else if (sim < SPLIT_COSINE && tokenCount >= SHORT_TURN_TOKENS) {
      split = true;
    }

    if (split) {
      topics.push({
        id: `topic-${topics.length + 1}`,
        label: labelFor(turn.text),
        labelConfirmed: false,
        firstTurnId: turn.id,
        firstTurnOrder: turn.order ?? 0,
        lastObservedAt: turn.observedAt ?? 0,
        turnIds: [turn.id],
      });
      centroidTokens = tokens.slice();
    } else {
      const cur = topics[topics.length - 1];
      cur.turnIds.push(turn.id);
      cur.lastObservedAt = turn.observedAt ?? cur.lastObservedAt;
      centroidTokens = centroidTokens.concat(tokens);
    }
  }

  return topics;
}
