// Dock controller — page reservation for the ConCon panel.
//
// v0.2 changes vs. v0.1:
//   - Three responsive modes instead of two:
//       wide     (>=1150px)   panel 340 / rail 48
//       narrow   (700–1149px) panel 300 / rail 40  ← split-screen sweet spot
//       overlay  (<700px)     panel floats, no reflow
//   - Default state is COLLAPSED at every viewport width. Progressive
//     disclosure: the rail is always visible ("I'm here"), expansion is
//     a deliberate act.
//   - Collapse preference persists per conversation via localStorage.
//   - Reflow no longer assumes `main` is the width owner. We dynamically
//     locate ChatGPT's conversation column by walking ancestors of the
//     first turn and tag it with data-concon-target. The injected
//     stylesheet targets [data-concon-target] AND body as a safety net.
//   - A MutationObserver re-tags if React strips the attribute.
//
// Public API unchanged: attachDock, detachDock, refreshDock, toggleCollapsed,
// setCollapsed, isCollapsed, getMode, onLayoutChange, _resetDock.
// New: setConversationId(id) — enables per-conversation persistence.

import { selectors } from './selectors.js';

const WIDE_BREAKPOINT = 1150;
const NARROW_BREAKPOINT = 700;

const MODES = {
  wide:    { panelWidth: 340, railWidth: 48 },
  narrow:  { panelWidth: 300, railWidth: 40 },
  overlay: { panelWidth: 300, railWidth: 40 },
};

const STYLE_EL_ID = 'concon-dock-stylesheet';
const TARGET_ATTR = 'data-concon-target';
const STORAGE_PREFIX = 'concon:collapsed:';

const state = {
  mode: 'overlay',           // wide | narrow | overlay
  collapsed: true,           // b1: default collapsed everywhere
  conversationId: null,
  attached: false,
  container: null,
  containerObserver: null,
  mediaQuery: null,
  resizeTimer: null,
};

const listeners = new Set();

// -------- persistence --------
function persistedKey(convId) { return STORAGE_PREFIX + (convId || 'global'); }

function loadPersistedCollapsed(convId) {
  try {
    const v = localStorage.getItem(persistedKey(convId));
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (_) {}
  return true; // default collapsed
}

function savePersistedCollapsed(convId, val) {
  try { localStorage.setItem(persistedKey(convId), val ? '1' : '0'); } catch (_) {}
}

// -------- container detection --------
const TURN_SELECTORS = [
  'article[data-testid^="conversation-turn-"]',
  '[data-testid^="conversation-turn-"]',
  '[data-message-id]',
  '[data-message-author-role]',
];

function findFirstTurn() {
  for (const sel of TURN_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

// Walk from a turn upward; return the topmost ancestor that spans (a) most
// of the viewport width and (b) reaches the right edge (within 80px). This
// is the "column that reflows if we take space from the right."
function pickWidthOwner(turn) {
  const vw = window.innerWidth;
  let bestOwner = null;
  let cur = turn;
  let depth = 0;
  while (cur && cur !== document.body && depth < 20) {
    const r = cur.getBoundingClientRect();
    const reachesRight = r.right > vw - 80;
    const wideEnough = r.width > vw * 0.5;
    if (reachesRight && wideEnough) bestOwner = cur;
    cur = cur.parentElement;
    depth++;
  }
  return bestOwner;
}

function tagContainer(el) {
  if (!el) return null;
  // Clear any previously-tagged element that's not this one.
  const stale = document.querySelectorAll(`[${TARGET_ATTR}]`);
  stale.forEach((n) => { if (n !== el) n.removeAttribute(TARGET_ATTR); });
  el.setAttribute(TARGET_ATTR, 'true');
  return el;
}

function locateAndTagContainer() {
  const turn = findFirstTurn();
  if (!turn) return null;
  const owner = pickWidthOwner(turn);
  if (!owner) return null;
  return tagContainer(owner);
}

function startContainerObserver() {
  stopContainerObserver();
  state.containerObserver = new MutationObserver(() => {
    // Re-tag opportunistically. Cheap because we only touch DOM if our
    // tagged element is gone or a fresh turn appears.
    const tagged = document.querySelector(`[${TARGET_ATTR}="true"]`);
    if (!tagged || !document.body.contains(tagged)) {
      const fresh = locateAndTagContainer();
      if (fresh) state.container = fresh;
    }
  });
  state.containerObserver.observe(document.body, { childList: true, subtree: true });
}

function stopContainerObserver() {
  if (state.containerObserver) {
    state.containerObserver.disconnect();
    state.containerObserver = null;
  }
}

// -------- CSS injection --------
function ensureStyleEl() {
  let el = document.getElementById(STYLE_EL_ID);
  if (el) return el;
  el = document.createElement('style');
  el.id = STYLE_EL_ID;
  document.documentElement.appendChild(el);
  return el;
}

function writeCss(mode, collapsed) {
  const el = ensureStyleEl();
  const dims = MODES[mode] || MODES.overlay;
  const activeWidth = collapsed ? dims.railWidth : dims.panelWidth;

  // Custom properties cascade into the shadow-DOM panel's :host via CSS
  // variable inheritance — that's how the panel reads its width.
  const rootVars = `
    :root {
      --concon-panel-width: ${dims.panelWidth}px;
      --concon-panel-collapsed-width: ${dims.railWidth}px;
      --concon-panel-active-width: ${activeWidth}px;
    }
  `;

  if (mode === 'overlay') {
    el.textContent = rootVars;
    return;
  }

  // Reflow rule: apply padding-right to BOTH the detected column container
  // AND body. Body catches sites where the tagged container isn't the
  // width owner; the tagged container catches sites where body is a fixed
  // shell. Belt-and-suspenders because ChatGPT rewrites its DOM often.
  el.textContent = `
    ${rootVars}
    html[data-concon-layout="docked"] body {
      padding-right: ${activeWidth}px !important;
      box-sizing: border-box !important;
      transition: padding-right 0.18s ease;
    }
    html[data-concon-layout="docked"] [${TARGET_ATTR}="true"] {
      padding-right: ${activeWidth}px !important;
      box-sizing: border-box !important;
      transition: padding-right 0.18s ease;
    }
  `;
}

function clearCss() {
  const el = document.getElementById(STYLE_EL_ID);
  if (el) el.textContent = '';
}

// -------- mode compute + apply --------
function computeMode() {
  const w = window.innerWidth;
  if (w >= WIDE_BREAKPOINT) return 'wide';
  if (w >= NARROW_BREAKPOINT) return 'narrow';
  return 'overlay';
}

function notify() {
  for (const cb of listeners) {
    try { cb({ mode: state.mode, collapsed: state.collapsed }); }
    catch (err) { console.error('[ConCon] dock listener error:', err); }
  }
}

function apply() {
  const mode = computeMode();
  state.mode = mode;

  // Tag container fresh each apply — cheap and keeps us honest as ChatGPT
  // rerenders. If turns aren't there yet, container stays null and body
  // padding still does the reflow.
  const owner = locateAndTagContainer();
  state.container = owner;

  const layoutAttr = mode === 'overlay' ? 'overlay' : 'docked';
  document.documentElement.setAttribute('data-concon-layout', layoutAttr);
  document.documentElement.setAttribute('data-concon-mode', mode);
  document.documentElement.setAttribute('data-concon-collapsed', state.collapsed ? 'true' : 'false');

  writeCss(mode, state.collapsed);
  notify();
}

function onResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(apply, 80);
}

// -------- public API --------
export function attachDock() {
  if (state.attached) return;
  state.attached = true;
  state.collapsed = loadPersistedCollapsed(state.conversationId);
  state.mediaQuery = window.matchMedia(`(min-width: ${NARROW_BREAKPOINT}px)`);
  state.mediaQuery.addEventListener('change', apply);
  window.addEventListener('resize', onResize);
  startContainerObserver();
  apply();
}

export function detachDock() {
  if (!state.attached) return;
  if (state.mediaQuery) state.mediaQuery.removeEventListener('change', apply);
  window.removeEventListener('resize', onResize);
  clearTimeout(state.resizeTimer);
  stopContainerObserver();
  document.querySelectorAll(`[${TARGET_ATTR}]`).forEach((n) => n.removeAttribute(TARGET_ATTR));
  clearCss();
  document.documentElement.removeAttribute('data-concon-layout');
  document.documentElement.removeAttribute('data-concon-mode');
  document.documentElement.removeAttribute('data-concon-collapsed');
  state.mediaQuery = null;
  state.container = null;
  state.attached = false;
}

export function refreshDock() {
  if (state.attached) apply();
}

export function setConversationId(id) {
  if (state.conversationId === id) return;
  state.conversationId = id;
  if (state.attached) {
    state.collapsed = loadPersistedCollapsed(id);
    apply();
  }
}

export function toggleCollapsed() {
  state.collapsed = !state.collapsed;
  savePersistedCollapsed(state.conversationId, state.collapsed);
  apply();
}

export function setCollapsed(next) {
  state.collapsed = !!next;
  savePersistedCollapsed(state.conversationId, state.collapsed);
  apply();
}

export function isCollapsed() { return state.collapsed; }
export function getMode() { return state.mode; }

export function onLayoutChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Test-only helper.
export function _resetDock() {
  detachDock();
  state.collapsed = true;
  state.mode = 'overlay';
  state.conversationId = null;
  listeners.clear();
}
