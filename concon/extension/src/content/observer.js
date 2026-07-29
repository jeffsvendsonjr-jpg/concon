// MutationObserver-based turn observation.
//
// Observes ChatGPT's chat scroll root. For each new or mutated message
// container we schedule a debounced ingest with a 750 ms stability window
// so streaming messages are only committed after their text stops changing.
//
// Also feeds the coverage tracker two signals:
//   1. Each observed turn index (from data-testid="conversation-turn-N"),
//      so gaps caused by ChatGPT virtualization become detectable.
//   2. A scroll snapshot on each scroll event, so the coverage tracker
//      can witness the moment scrollTop reaches zero (proof the top of
//      the conversation was in view at least once during this session).
//
// KNOWN GAP (v0.1 substrate, arch review §3.4):
//   Regenerate handling. When ChatGPT re-generates an assistant reply, a
//   new element with a new data-message-id is inserted. The substrate
//   currently ingests it as an independent message. Linking the new
//   message to its predecessor via `regeneratesId` and having the outline
//   treat the visible branch as authoritative is deferred to the phase
//   where the commitment ledger lands, because that's the phase where
//   branch-following starts to matter for the ledger's correctness.

import { selectors, extractRole, extractText, extractTurnIndex } from './selectors.js';
import { ingest } from '../core/store.js';
import { recordTurnObserved, recordScrollSnapshot } from '../core/coverage.js';

const STABILITY_MS = 750;

let observer = null;
let root = null;
let scrollTarget = null;
let scrollHandler = null;
let ctx = null;
const pending = new Map(); // messageId → { timerId }

function schedule(messageId, el) {
  if (!messageId || !ctx) return;
  const existing = pending.get(messageId);
  if (existing) clearTimeout(existing.timerId);
  const timerId = setTimeout(() => {
    pending.delete(messageId);
    const text = extractText(el);
    const role = extractRole(el);
    if (!role) return;
    // Coverage: remember the turn index for this ingested message so
    // we can later detect gaps virtualization would otherwise hide.
    const turnIndex = extractTurnIndex(el);
    if (turnIndex !== null) {
      recordTurnObserved(ctx.conversationId, turnIndex);
    }
    ingest({
      conversationId: ctx.conversationId,
      id: messageId,
      role,
      text,
      observedAt: Date.now(),
    });
  }, STABILITY_MS);
  pending.set(messageId, { timerId });
}

function scanNode(node) {
  if (!node || node.nodeType !== 1 /* ELEMENT_NODE */) return;
  const messageEls = node.matches?.(selectors.messageContainer)
    ? [node]
    : Array.from(node.querySelectorAll?.(selectors.messageContainer) || []);
  for (const el of messageEls) {
    const id = el.getAttribute('data-message-id');
    if (id) schedule(id, el);
  }
}

function snapshotScroll() {
  if (!ctx || !scrollTarget) return;
  // Any turn mounted right now? If not, don't record — a scrollTop of 0
  // on an empty container tells us nothing.
  const anyTurnMounted = !!document.querySelector(selectors.turnArticle);
  const scrollTop = typeof scrollTarget.scrollTop === 'number' ? scrollTarget.scrollTop : null;
  if (scrollTop === null) return;
  recordScrollSnapshot(ctx.conversationId, { scrollTop, anyTurnMounted });
}

export function attachObserver({ conversationId }) {
  detachObserver();
  ctx = { conversationId };
  root = document.querySelector(selectors.chatScrollRoot) || document.body;

  // ChatGPT's actual scrollable element isn't always <main> itself — the
  // scroll often lives on an inner container. We attach the listener to
  // window as well as the root so we catch either case.
  scrollTarget = root;
  scrollHandler = () => snapshotScroll();
  root.addEventListener?.('scroll', scrollHandler, { passive: true });
  window.addEventListener?.('scroll', scrollHandler, { passive: true });

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) scanNode(node);
      } else if (m.type === 'characterData') {
        // Streaming text updates: find the enclosing message and reschedule.
        const parent = m.target?.parentElement;
        if (parent) scanNode(parent.closest(selectors.messageContainer) || parent);
      } else if (m.type === 'attributes') {
        if (m.target?.nodeType === 1) scanNode(m.target);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-message-id', 'data-message-author-role'],
  });
  // Initial sweep for messages already present.
  scanNode(root);
  // Initial scroll snapshot — if the user landed on a brand-new
  // conversation the scroll root is at 0 and the top anchor is already
  // witnessed on the very first observation.
  snapshotScroll();
}

export function detachObserver() {
  if (observer) observer.disconnect();
  if (scrollTarget && scrollHandler) {
    scrollTarget.removeEventListener?.('scroll', scrollHandler);
  }
  if (scrollHandler) {
    window.removeEventListener?.('scroll', scrollHandler);
  }
  observer = null;
  root = null;
  scrollTarget = null;
  scrollHandler = null;
  ctx = null;
  for (const { timerId } of pending.values()) clearTimeout(timerId);
  pending.clear();
}
