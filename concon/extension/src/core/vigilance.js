// Vigilance — the human side of the Curator Principle.
//
// Three modes control (a) which extracted entries auto-confirm without
// user tap, and (b) how loud the tool is allowed to be.
//
//   trust     — firm commitments auto-confirm silently. The user's
//               choice of Trust IS the ratification (meta-consent).
//               No interruption. Contest still available.
//   balanced  — non-hedged commitments auto-confirm; hedged or
//               ambiguous entries stay proposed for a manual tap.
//   wary      — nothing auto-confirms. Every entry awaits a tap.
//               Proactive divergence pings (Step 8) fire here.
//
// Storage:
//   concon:vigilance:global       → default across all conversations
//   concon:vigilance:<convId>     → per-conversation override

export const MODES = ['trust', 'balanced', 'wary'];
export const DEFAULT_MODE = 'balanced';

const GLOBAL_KEY = 'concon:vigilance:global';
const PER_CONV_PREFIX = 'concon:vigilance:';
const FTU_PICKED_KEY = 'concon:vigilance:ftu-picked';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
}
function normalize(mode) {
  return MODES.includes(mode) ? mode : null;
}

export function getGlobalVigilance() {
  return normalize(safeGet(GLOBAL_KEY)) || DEFAULT_MODE;
}
export function setGlobalVigilance(mode) {
  const m = normalize(mode);
  if (!m) return false;
  return safeSet(GLOBAL_KEY, m);
}
export function getConversationVigilance(convId) {
  if (!convId) return null;
  return normalize(safeGet(PER_CONV_PREFIX + convId));
}
export function setConversationVigilance(convId, mode) {
  if (!convId) return false;
  const m = normalize(mode);
  if (!m) return false;
  return safeSet(PER_CONV_PREFIX + convId, m);
}
// The mode that should be applied to a given conversation right now:
// per-conversation override wins over the global default.
export function getEffectiveVigilance(convId) {
  return getConversationVigilance(convId) || getGlobalVigilance();
}

export function hasPickedFTU() {
  return safeGet(FTU_PICKED_KEY) === '1';
}
export function markFTUPicked() {
  return safeSet(FTU_PICKED_KEY, '1');
}

// Given an extracted ledger entry and a vigilance mode, return the state
// that should be applied. Only the freshly-extracted state matters here —
// this function does not touch entries the user has already interacted
// with (that's handled at the caller layer).
//
// The rule is deliberately conservative:
//   trust     → confirm every extracted entry (commitment + statement).
//               The user asked for silence; deliver silence.
//   balanced  → confirm firm unhedged commitments AND anything matched
//               by a user-taught custom rule (user-declared confidence
//               is treated as maximum). Everything else stays proposed.
//   wary      → confirm nothing automatically. Doctrine invariant:
//               Wary is the user asking for maximum friction, so we
//               respect it even for custom-rule matches.
export function autoStateFor(entry, mode) {
  const m = normalize(mode) || DEFAULT_MODE;
  if (!entry) return null;
  if (m === 'wary') return null;
  if (m === 'trust') return entry.role === 'assistant' ? 'acknowledged' : 'confirmed';
  // balanced
  const customRule = entry.source === 'custom-rule';
  const firmCommitment = entry.classification === 'commitment' && !entry.hedged;
  if (customRule || firmCommitment) {
    return entry.role === 'assistant' ? 'acknowledged' : 'confirmed';
  }
  return null;
}
