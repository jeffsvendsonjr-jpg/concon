// Panel mount, SPA-navigation handling, store event wiring.
//
// Responsibilities in v0.1 (substrate phase):
//   1. Mount a shadow-DOM host on the right edge of the page.
//   2. Detect the current ChatGPT conversationId from the URL.
//   3. Attach the MutationObserver against ChatGPT's chat scroll root.
//   4. Re-mount on SPA navigation between conversations.
//   5. Refresh panel counts on store events.
//
// This module is shared by the extension and the dev harness — no direct
// chrome.* calls. The bootstrap file is what makes it chrome-aware.

import { attachObserver, detachObserver } from './observer.js';
import { renderPanel, updatePanelCounts } from '../panel/panel.js';
import { on, getConversation, loadConversation } from '../core/store.js';

const HOST_ID = 'concon-panel-host';

let currentConversationId = null;
let shadowRoot = null;
let unsubscribe = null;
let navWatched = false;

function parseConversationId(url = location.href) {
  const m = url.match(/\/c\/([a-zA-Z0-9-]{8,})/);
  return m ? m[1] : null;
}

function ensurePanelHost() {
  let host = document.getElementById(HOST_ID);
  if (host) {
    if (!shadowRoot) shadowRoot = host.shadowRoot;
    return host;
  }
  host = document.createElement('div');
  host.id = HOST_ID;
  // The host itself carries no layout; the panel inside its shadow root
  // handles positioning. `all: initial` protects against any inherited
  // ChatGPT styles bleeding in.
  host.style.cssText = 'all: initial;';
  document.documentElement.appendChild(host);
  shadowRoot = host.attachShadow({ mode: 'open' });
  renderPanel(shadowRoot);
  return host;
}

function refreshCounts() {
  if (!shadowRoot || !currentConversationId) return;
  const conv = getConversation(currentConversationId);
  updatePanelCounts(shadowRoot, {
    turnCount: conv.messages.length,
    topicCount: conv.outline?.topics?.length || 0,
  });
}

async function onConversationChange() {
  const newId = parseConversationId();
  if (newId === currentConversationId) return;
  currentConversationId = newId;
  detachObserver();
  if (typeof unsubscribe === 'function') {
    unsubscribe();
    unsubscribe = null;
  }
  if (!newId) return;
  ensurePanelHost();
  await loadConversation(newId);
  unsubscribe = on('turn:updated', ({ conversationId }) => {
    if (conversationId === currentConversationId) refreshCounts();
  });
  attachObserver({ conversationId: newId });
  refreshCounts();
}

function watchNavigation() {
  if (navWatched) return;
  navWatched = true;
  const wrap = (orig) => function wrapped(...args) {
    const r = orig.apply(this, args);
    // schedule after the URL change has actually taken effect
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
