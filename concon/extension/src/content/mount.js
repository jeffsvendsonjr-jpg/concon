// Panel mount, SPA-navigation handling, store event wiring, ledger callbacks.
//
// Responsibilities in v0.1:
//   1. Mount a shadow-DOM host on the right edge of the page.
//   2. Detect the current ChatGPT conversationId from the URL.
//   3. Attach the MutationObserver against ChatGPT's chat scroll root.
//   4. Re-mount on SPA navigation between conversations.
//   5. Subscribe to store events and re-render the panel on any change.
//   6. Wire panel callbacks (transition, jump, view toggle) to the store
//      and to ChatGPT's DOM.
//
// This module is shared by the extension and the dev harness — no direct
// chrome.* calls. bootstrap.js is what makes it chrome-aware.

import { attachObserver, detachObserver } from './observer.js';
import { attachDock, detachDock, refreshDock, toggleCollapsed, isCollapsed, onLayoutChange, setConversationId } from './dock.js';
import { renderPanel, updatePanel, resetPanelViews } from '../panel/panel.js';
import {
  on,
  getConversation,
  loadConversation,
  transitionLedgerEntry,
  reExtractConversation,
} from '../core/store.js';
import { resetCoverage } from '../core/coverage.js';
import { refreshMarkers, clearAllMarkers } from './drift-markers.js';

const HOST_ID = 'concon-panel-host';

let currentConversationId = null;
let shadowRoot = null;
let unsubscribeTurns = null;
let unsubscribeLedger = null;
let navWatched = false;
let viewMode = 'chronological';
let searchQuery = '';
let currentPanelCallbacks = null;

function parseConversationId(url = location.href) {
  const m = url.match(/\/c\/([a-zA-Z0-9-]{8,})/);
  return m ? m[1] : null;
}

function jumpToTurn(messageId) {
  if (!messageId) return;
  const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Brief visual highlight so the user can see where they landed.
  const prevOutline = el.style.outline;
  const prevTransition = el.style.transition;
  el.style.transition = 'outline-color 0.4s ease';
  el.style.outline = '2px solid rgba(176, 99, 45, 0.9)';
  el.style.outlineOffset = '4px';
  setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.transition = prevTransition;
  }, 1400);
}

// Find ChatGPT's actual scrollable container. `main` is the semantic
// anchor but the real scroll often lives on an inner div. Walk up from
// the first turn element until we find an ancestor whose scrollHeight
// exceeds its clientHeight — that's the container.
function findChatScrollContainer() {
  const anyTurn = document.querySelector('[data-testid^="conversation-turn-"]');
  if (!anyTurn) return null;
  let el = anyTurn.parentElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowsY = /(auto|scroll)/.test(style.overflowY);
    if (overflowsY && el.scrollHeight > el.clientHeight + 4) {
      return el;
    }
    el = el.parentElement;
  }
  // Fallback to the scrolling element (window/documentElement).
  return document.scrollingElement || document.documentElement;
}

// Backfill: scroll ChatGPT to the top so it renders older (virtualized)
// turns into the DOM, wait for it to settle, then restore the user's
// original scroll position. Doctrine: user-initiated, non-destructive.
// We never touch the composer, never navigate, never persist anything
// we couldn't have seen by scrolling manually ourselves.
async function backfillCurrentConversation() {
  const container = findChatScrollContainer();
  if (!container) return;
  const originalScroll = container.scrollTop;
  const startTurnCount = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;

  // Nudge scroll up in stages so ChatGPT's virtualization has time to
  // materialise older turns. A single scrollTo(0) can race the loader.
  const MAX_PASSES = 12;
  const PASS_WAIT_MS = 350;
  let lastCount = startTurnCount;
  let stableStreak = 0;
  for (let i = 0; i < MAX_PASSES; i++) {
    container.scrollTop = 0;
    await new Promise((r) => setTimeout(r, PASS_WAIT_MS));
    const currentCount = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
    if (currentCount === lastCount) {
      stableStreak++;
      // Two consecutive passes with no new turns → we've reached the top.
      if (stableStreak >= 2) break;
    } else {
      stableStreak = 0;
      lastCount = currentCount;
    }
  }

  // Give the observer one final beat to ingest whatever just mounted
  // before we scroll the user back to where they were.
  await new Promise((r) => setTimeout(r, 400));
  container.scrollTo({ top: originalScroll, behavior: 'smooth' });
}

function ensurePanelHost() {
  let host = document.getElementById(HOST_ID);
  if (host) {
    if (!shadowRoot) shadowRoot = host.shadowRoot;
    return host;
  }
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial;';
  document.documentElement.appendChild(host);
  shadowRoot = host.attachShadow({ mode: 'open' });
  const panelCallbacks = {
    onTransition: (entryId, newState) => {
      if (!currentConversationId) return;
      transitionLedgerEntry(currentConversationId, entryId, newState);
    },
    onJump: (messageId) => jumpToTurn(messageId),
    onToggleView: (mode) => {
      viewMode = mode === 'topic' ? 'topic' : 'chronological';
      refreshPanel();
    },
    onSearchChange: (query) => {
      searchQuery = String(query || '');
      refreshPanel();
    },
    onToggleCollapse: () => {
      toggleCollapsed();
    },
    // Panel view flags (report/rules) are toggled inside panel.js on
    // click, but the render is our responsibility — without these
    // hooks CHECK and RULES set the flag and nothing else happens.
    onOpenCheck:  () => refreshPanel(),
    onCloseCheck: () => refreshPanel(),
    onOpenRules:  () => refreshPanel(),
    onCloseRules: () => refreshPanel(),
    // Vigilance-aware panel needs to know which conversation it's in so it
    // can save per-conversation mode overrides.
    getConversationId: () => currentConversationId,
    onVigilanceChange: () => refreshPanel(),
    onRulesChange: () => {
      if (currentConversationId) reExtractConversation(currentConversationId);
      refreshPanel();
    },
    // Backfill: user asked ConCon to see earlier turns. Scroll the chat
    // to the top, let virtualization materialise them, then restore the
    // user's scroll position. Refresh the panel afterward so the
    // coverage strip reflects the newly-observed turns.
    onBackfill: async () => {
      await backfillCurrentConversation();
      refreshPanel();
    },
  };
  renderPanel(shadowRoot, panelCallbacks);
  // Stash for later invocation from onConversationChange.
  currentPanelCallbacks = panelCallbacks;
  attachDock();
  onLayoutChange(refreshPanel);
  return host;
}

function refreshPanel() {
  if (!shadowRoot || !currentConversationId) return;
  const conversation = getConversation(currentConversationId);
  updatePanel(shadowRoot, {
    conversation,
    viewMode,
    searchQuery,
    collapsed: isCollapsed(),
    conversationId: currentConversationId,
  });
  // Inline drift markers on ChatGPT's turns. Kept in sync with the
  // ledger on every panel refresh. Doctrine: non-destructive; markers
  // are ConCon-owned elements attached to ChatGPT's turn wrappers and
  // torn down on nav / detach.
  refreshMarkers(conversation);
}

async function onConversationChange() {
  const newId = parseConversationId();
  if (newId === currentConversationId) return;
  const previousId = currentConversationId;
  currentConversationId = newId;
  // A new conversation means transient panel views (Check report, rules
  // editor) should not carry over. Otherwise a report generated for
  // conversation A can render against B's data on the next refresh.
  resetPanelViews();
  // Coverage for the previous conversation is now stale — we're no
  // longer observing it, so anything we knew about which turns we saw
  // shouldn't influence a future audit of it.
  if (previousId) resetCoverage(previousId);
  // Drift markers are inline in the previous conversation's DOM. Clear
  // them before we detach so we leave ChatGPT's DOM as we found it.
  clearAllMarkers();
  detachObserver();
  if (typeof unsubscribeTurns === 'function') { unsubscribeTurns(); unsubscribeTurns = null; }
  if (typeof unsubscribeLedger === 'function') { unsubscribeLedger(); unsubscribeLedger = null; }
  if (!newId) {
    const host = document.getElementById(HOST_ID);
    if (host) host.style.display = 'none';
    detachDock();
    return;
  }
  const host = document.getElementById(HOST_ID);
  if (host) host.style.display = '';
  ensurePanelHost();
  setConversationId(newId);
  await loadConversation(newId);
  // Navigation race: the user may have moved to a different conversation
  // while loadConversation was awaiting. If they did, `currentConversationId`
  // now points at the newer id and this handler must bail — otherwise it
  // would attach an observer keyed to the stale id.
  if (currentConversationId !== newId) return;
  if (currentPanelCallbacks?._refreshChip) currentPanelCallbacks._refreshChip();
  unsubscribeTurns = on('turn:updated', ({ conversationId }) => {
    if (conversationId === currentConversationId) refreshPanel();
  });
  unsubscribeLedger = on('ledger:updated', ({ conversationId }) => {
    if (conversationId === currentConversationId) refreshPanel();
  });
  attachObserver({ conversationId: newId });
  if (!document.documentElement.hasAttribute('data-concon-layout')) {
    attachDock();
  } else {
    refreshDock();
  }
  refreshPanel();
}

function watchNavigation() {
  if (navWatched) return;
  navWatched = true;
  const wrap = (orig) => function wrapped(...args) {
    const r = orig.apply(this, args);
    queueMicrotask(onConversationChange);
    return r;
  };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', onConversationChange);
}

export function mount() {
  watchNavigation();
  onConversationChange();
}
