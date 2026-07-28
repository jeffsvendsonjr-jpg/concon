// Custom Rules — user-taught patterns for the commitment extractor.
//
// Doctrine anchor: rules never leave the device. They are the user
// teaching *their* ConCon what counts, not contributing to a shared
// model. Storage is a single localStorage key with a JSON array of
// rule objects. No sync, no cloud, no export unless the user
// explicitly exports (see share/export features).
//
// Rule shape:
//   {
//     id: string,           // stable id for delete/update
//     phrase: string,       // case-insensitive substring match
//     classification: 'commitment' | 'statement',
//     role: 'user' | 'assistant' | 'any',
//     createdAt: number,    // epoch ms
//   }

const STORAGE_KEY = 'concon:custom-rules';

function safeGet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
function safeSet(rules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    return true;
  } catch (_) { return false; }
}

function normalisePhrase(s) {
  return String(s || '').trim();
}
function normaliseClass(c) {
  return c === 'statement' ? 'statement' : 'commitment';
}
function normaliseRole(r) {
  if (r === 'user' || r === 'assistant') return r;
  return 'any';
}

// Public API ----------------------------------------------------------------

export function getRules() {
  return safeGet();
}

export function addRule({ phrase, classification = 'commitment', role = 'any' } = {}) {
  const clean = normalisePhrase(phrase);
  if (!clean) return null;
  const rule = {
    id: 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    phrase: clean,
    classification: normaliseClass(classification),
    role: normaliseRole(role),
    createdAt: Date.now(),
  };
  const rules = safeGet();
  // Reject exact-duplicate phrase+role+classification to keep the list clean.
  const dup = rules.find(
    (r) => r.phrase.toLowerCase() === clean.toLowerCase()
        && r.role === rule.role
        && r.classification === rule.classification,
  );
  if (dup) return dup;
  rules.push(rule);
  safeSet(rules);
  return rule;
}

export function removeRule(id) {
  if (!id) return false;
  const rules = safeGet();
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  safeSet(next);
  return true;
}

export function clearAllRules() {
  return safeSet([]);
}

// Given a sentence + role, return the first matching rule (or null).
// Case-insensitive substring match. Applied AFTER the built-in extractor
// has failed to classify — the built-ins remain the primary signal;
// custom rules extend rather than override.
export function matchRule(sentence, role) {
  const rules = safeGet();
  if (rules.length === 0) return null;
  const lower = String(sentence || '').toLowerCase();
  if (!lower) return null;
  for (const r of rules) {
    if (r.role !== 'any' && r.role !== role) continue;
    if (lower.includes(r.phrase.toLowerCase())) return r;
  }
  return null;
}
