// Dock controller — page reservation for the ConCon panel.
//
// v0.3:
//   - Two responsive modes (overlay dropped intentionally):
//       wide     (>=1150px)   panel 340 / rail 48
//       narrow   (<1150px)    panel 300 / rail 40
//   - Reflow at every viewport width. The user decides how much space
//     chat gets by collapsing/expanding the rail; the tool does not
//     gate on our behalf. Curator Principle: don't decide *for* the
//     user what's readable at their viewport.
//   - Default state is COLLAPSED at every viewport width. Progressive
//     disclosure: the rail is always visible, expansion is deliberate.
//   - Collapse preference persists per conversation via localStorage.
//   - Reflow strategy: locate ChatGPT's `.w-screen` app shell and
//     shrink it via CSS `width: calc(100vw - Xpx) !important`. Body
//     padding-right has no effect on `.w-screen` because that shell is
//     sized against the raw viewport, not its parent's box.
//   - A MutationObserver re-tags the shell/container if React strips
//     the attribute during a rerender.
//
// Public API: attachDock, detachDock, refreshDock, toggleCollapsed,
// setCollapsed, isCollapsed, getMode, onLayoutChange, setConversationId,
// _resetDock.

import { selectors } from './selectors.js';

const WIDE_BREAKPOINT = 1150;

const MODES = {
  wide:    { panelWidth: 340, railWidth: 48 },
  narrow:  { panelWidth: 300, railWidth: 40 },
};

const STYLE_EL_ID = 'concon-dock-stylesheet';
const TARGET_ATTR = 'data-concon-target';
const SHELL_ATTR = 'data-concon-shell';
const STORAGE_PREFIX = 'concon:collapsed:';

const state = {
  mode: 'narrow',            // wide | narrow
  collapsed: true,           // default collapsed at every width
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
  } catch (_) { /* noop */ }
  return true; // default collapsed
}

function savePersistedCollapsed(convId, val) {
  try { localStorage.setItem(persistedKey(convId), val ? '1' : '0'); } catch (_) { /* noop */ }
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
    } catch (_) { /* noop */ }
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

// Locate ChatGPT's app shell — the top-level .w-screen element. This is
// the only element whose width we can actually shrink to reflow the chat
// column; padding on body has no effect because .w-screen = 100vw ignores
// its parent's box.
function locateAndTagShell() {
  // Try selector first (fast path, works with current Tailwind class).
  let shell = document.querySelector(selectors.appShell);
  // Fallback: any element whose computed width equals the viewport width.
  if (!shell) {
    const vw = window.innerWidth;
    shell = Array.from(document.querySelectorAll('body > * , body > * > *'))
      .find((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= vw - 4 && r.width <= vw + 4 && r.height > vw * 0.2;
      }) || null;
  }
  if (!shell) return null;
  // Clear stale shell tags.
  document.querySelectorAll(`[${SHELL_ATTR}]`).forEach((n) => {
    if (n !== shell) n.removeAttribute(SHELL_ATTR);
  });
  shell.setAttribute(SHELL_ATTR, 'true');
  return shell;
}

function startContainerObserver() {
  stopContainerObserver();
  state.containerObserver = new MutationObserver(() => {
    // Re-tag opportunistically. Cheap because we only touch DOM if our
    // tagged element is gone or we haven't tagged anything yet (e.g.,
    // turns hadn't rendered at first apply).
    const container = document.querySelector(`[${TARGET_ATTR}="true"]`);
    if (!container || !document.body.contains(container)) {
      const fresh = locateAndTagContainer();
      if (fresh) state.container = fresh;
    }
    const shell = document.querySelector(`[${SHELL_ATTR}="true"]`);
    if (!shell || !document.body.contains(shell)) {
      locateAndTagShell();
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
  const dims = MODES[mode] || MODES.narrow;
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

  // Reflow strategy: shrink the app shell (.w-screen) by ${activeWidth}px.
  // Padding on body has no effect on ChatGPT's chat column because the
  // shell is a Tailwind `w-screen` div (width: 100vw), which ignores its
  // parent's box. Overriding its width via `!important` beats Tailwind's
  // utility. `max-width` is set together to defeat any subsequent
  // width-clamping utility.
  //
  // We reflow at all viewport widths; the user decides how much space
  // chat gets by collapsing/expanding the rail (Curator Principle:
  // don't decide for the user what's readable at their viewport).
  el.textContent = `
    ${rootVars}
    html[data-concon-layout="docked"] [${SHELL_ATTR}="true"] {
      width: calc(100vw - ${activeWidth}px) !important;
      max-width: calc(100vw - ${activeWidth}px) !important;
      min-width: 0 !important;
      transition: width 0.18s ease, max-width 0.18s ease;
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
  return 'narrow';
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

  // Tag both the app shell (for the actual reflow) and the conversation
  // container (as a safety-net secondary target). Cheap; keeps us honest
  // as ChatGPT rerenders.
  locateAndTagShell();
  const owner = locateAndTagContainer();
  state.container = owner;

  document.documentElement.setAttribute('data-concon-layout', 'docked');
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
  state.mediaQuery = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
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
  document.querySelectorAll(`[${SHELL_ATTR}]`).forEach((n) => n.removeAttribute(SHELL_ATTR));
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
  state.mode = 'narrow';
  state.conversationId = null;
  listeners.clear();
}
