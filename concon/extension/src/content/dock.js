// Dock controller — page reservation for the ConCon panel.
//
// Three modes (state marker set on <html data-concon-layout="…">):
//   docked-expanded   viewport ≥ 1150 px, user hasn't collapsed:
//                      reserves 340 px via padding-right on ChatGPT's `main`.
//   docked-collapsed  viewport ≥ 1150 px, user has collapsed:
//                      reserves 48 px; panel renders as a thin rail.
//   overlay           viewport < 1150 px, OR `main` container not found:
//                      no page reservation; panel floats on top.
//
// Why padding on `main` and not `body { margin-right }`:
//   - ChatGPT's shell doesn't necessarily derive its width from body;
//     applying padding on the specific main-content container reflows
//     the conversation column without affecting the left nav, header,
//     modals, or fixed composer.
//   - No !important needed; ChatGPT's own layout math handles the rest.
//   - Failure falls back to overlay cleanly rather than crushing the app.

import { selectors } from './selectors.js';

const BREAKPOINT_PX = 1150;
const EXPANDED_WIDTH = 340;
const COLLAPSED_WIDTH = 48;

const state = {
  mode: 'overlay',
  collapsed: false,
  container: null,
  mediaQuery: null,
  resizeTimer: null,
  attached: false,
};

const listeners = new Set();

function findMainContainer() {
  return document.querySelector(selectors.chatScrollRoot) || null;
}

function stashOriginalPadding(el) {
  if (!el || el.hasAttribute('data-concon-original-padding-right')) return;
  el.setAttribute('data-concon-original-padding-right', el.style.paddingRight || '');
}

function restoreOriginalPadding(el) {
  if (!el) return;
  if (el.hasAttribute('data-concon-original-padding-right')) {
    el.style.paddingRight = el.getAttribute('data-concon-original-padding-right') || '';
    el.removeAttribute('data-concon-original-padding-right');
  }
}

function setPadding(el, px) {
  if (!el) return;
  stashOriginalPadding(el);
  el.style.transition = 'padding-right 0.18s ease';
  el.style.paddingRight = px ? `${px}px` : '';
}

function computeMode() {
  const viewportOk = window.innerWidth >= BREAKPOINT_PX;
  if (!viewportOk) return 'overlay';
  return state.collapsed ? 'docked-collapsed' : 'docked-expanded';
}

function notify() {
  for (const cb of listeners) {
    try { cb({ mode: state.mode, collapsed: state.collapsed }); }
    catch (err) { console.error('[ConCon] dock listener error:', err); }
  }
}

function apply() {
  // Restore any prior padding on the previous container.
  if (state.container) restoreOriginalPadding(state.container);

  let nextMode = computeMode();
  const container = findMainContainer();
  state.container = container;

  if (nextMode === 'docked-expanded') {
    if (container) setPadding(container, EXPANDED_WIDTH);
    else nextMode = 'overlay';
  } else if (nextMode === 'docked-collapsed') {
    if (container) setPadding(container, COLLAPSED_WIDTH);
    else nextMode = 'overlay';
  }

  state.mode = nextMode;
  document.documentElement.setAttribute('data-concon-layout', nextMode);
  notify();
}

function onResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(apply, 80);
}

export function attachDock() {
  if (state.attached) return;
  state.attached = true;
  state.mediaQuery = window.matchMedia(`(min-width: ${BREAKPOINT_PX}px)`);
  state.mediaQuery.addEventListener('change', apply);
  window.addEventListener('resize', onResize);
  apply();
}

export function detachDock() {
  if (!state.attached) return;
  if (state.mediaQuery) state.mediaQuery.removeEventListener('change', apply);
  window.removeEventListener('resize', onResize);
  clearTimeout(state.resizeTimer);
  restoreOriginalPadding(state.container);
  document.documentElement.removeAttribute('data-concon-layout');
  state.mediaQuery = null;
  state.container = null;
  state.attached = false;
}

export function refreshDock() {
  if (state.attached) apply();
}

export function toggleCollapsed() {
  state.collapsed = !state.collapsed;
  apply();
}

export function setCollapsed(next) {
  state.collapsed = !!next;
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
  state.collapsed = false;
  state.mode = 'overlay';
  listeners.clear();
}
