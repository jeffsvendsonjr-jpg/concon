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
import { attachDock, detachDock, refreshDock, toggleCollapsed, isCollapsed, onLayoutChange } from './dock.js';
import { runDockDiagnostic } from './diagnostic.js';
import { renderPanel, updatePanel } from '../panel/panel.js';
import {
  on,
  getConversation,
  loadConversation,
  transitionLedgerEntry,
} from '../core/store.js';

const HOST_ID = 'concon-panel-host';

let currentConversationId = null;
let shadowRoot = null;
let unsubscribeTurns = null;
let unsubscribeLedger = null;
let navWatched = false;
let viewMode = 'chronological';
let searchQuery = '';

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
  renderPanel(shadowRoot, {
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
  });
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
  });
}

async function onConversationChange() {
  const newId = parseConversationId();
  if (newId === currentConversationId) return;
  currentConversationId = newId;
  detachObserver();
  if (typeof unsubscribeTurns === 'function') { unsubscribeTurns(); unsubscribeTurns = null; }
  if (typeof unsubscribeLedger === 'function') { unsubscribeLedger(); unsubscribeLedger = null; }
  if (!newId) {
    // Off any conversation route (e.g., homepage, /gpts, /settings).
    // Hide the panel and release the dock reservation so ChatGPT
    // reclaims its full width. The host DOM node stays in place so
    // re-entering a conversation route re-uses it without a remount.
    const host = document.getElementById(HOST_ID);
    if (host) host.style.display = 'none';
    detachDock();
    return;
  }
  const host = document.getElementById(HOST_ID);
  if (host) host.style.display = '';
  ensurePanelHost();
  await loadConversation(newId);
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
  runDockDiagnostic();
}
