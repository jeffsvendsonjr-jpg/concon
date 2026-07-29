// selectors.js
//
// Single source of truth for the ChatGPT DOM selectors ConCon depends on.
// If ChatGPT changes its DOM, this is the file to hotfix — nothing else in
// the codebase should reference these attribute names directly.
//
// Verified against chatgpt.com as of Jan 2026.

export const selectors = {
  // Wrapper for each turn (user or assistant). ChatGPT emits
  // data-testid="conversation-turn-<N>". As of 2026-07 the wrapper is a
  // <section>, not <article> — we intentionally don't lock the tag name.
  turnArticle: '[data-testid^="conversation-turn-"]',

  // The element carrying the canonical message id from the backend.
  messageContainer: '[data-message-id]',

  // Role attribute on (or inside) the message container.
  authorRole: '[data-message-author-role]',

  // Chat scroll root. Falls back to document.body if not found.
  chatScrollRoot: 'main',

  // Tailwind `w-screen` = width: 100vw. This is ChatGPT's top-level app
  // shell. Reflowing anything inside this without shrinking it first is
  // pointless — the shell is glued to the raw viewport width.
  appShell: '.w-screen',
};

export function extractRole(el) {
  const container = el?.closest?.(selectors.messageContainer);
  if (!container) return null;
  if (container.hasAttribute('data-message-author-role')) {
    return container.getAttribute('data-message-author-role');
  }
  const inner = container.querySelector?.(selectors.authorRole);
  return inner ? inner.getAttribute('data-message-author-role') : null;
}

export function extractText(el) {
  const container = el?.closest?.(selectors.messageContainer);
  if (!container) return '';
  // innerText respects rendered whitespace; textContent does not. We prefer
  // innerText, but fall back to textContent for non-DOM contexts (jsdom).
  return (container.innerText ?? container.textContent ?? '').trim();
}

// Extract the turn index from ChatGPT's `data-testid="conversation-turn-N"`.
// Used by coverage tracking to detect gaps in observed turns. Returns null
// if the enclosing turn wrapper is missing or the testid is malformed.
export function extractTurnIndex(el) {
  if (!el) return null;
  const turnEl = el.closest?.(selectors.turnArticle);
  if (!turnEl) return null;
  const testid = turnEl.getAttribute?.('data-testid') || '';
  const m = testid.match(/^conversation-turn-(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
