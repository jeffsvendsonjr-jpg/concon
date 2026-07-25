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

// Applies dock reservation via an injected <style> element rather than
// inline styles on `main`. Rationale: ChatGPT is a React app; React
// aggressively re-writes inline styles on the DOM elements it owns, which
// silently strips our padding-right and leaves the panel overlaying the
// conversation. A stylesheet rule survives rerenders because React doesn't
// touch document-level <style> nodes.
//
// The `!important` here is scoped narrowly to our own selector
// (`html[data-concon-layout="…"] main`), not applied to body — the
// PHASE_A.md objection to Codex's `body { margin-right !important }` was
// about global body-level side effects, not about scoped rules on the
// specific layout hook we chose.

const STYLE_EL_ID = 'concon-dock-stylesheet';

function ensureStyleEl() {
  let el = document.getElementById(STYLE_EL_ID);
  if (el) return el;
  el = document.createElement('style');
  el.id = STYLE_EL_ID;
  document.documentElement.appendChild(el);
  return el;
}

function writeDockCss(mode) {
  const el = ensureStyleEl();
  if (mode === 'docked-expanded') {
    el.textContent = `
      html[data-concon-layout="docked-expanded"] main {
        padding-right: 340px !important;
        transition: padding-right 0.18s ease;
      }
    `;
  } else if (mode === 'docked-collapsed') {
    el.textContent = `
      html[data-concon-layout="docked-collapsed"] main {
        padding-right: 48px !important;
        transition: padding-right 0.18s ease;
      }
    `;
  } else {
    el.textContent = '';
  }
}

function clearDockCss() {
  const el = document.getElementById(STYLE_EL_ID);
  if (el) el.textContent = '';
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
  let nextMode = computeMode();
  const container = findMainContainer();
  state.container = container;

  if (nextMode === 'docked-expanded' || nextMode === 'docked-collapsed') {
    if (!container) nextMode = 'overlay';
  }

  state.mode = nextMode;
  document.documentElement.setAttribute('data-concon-layout', nextMode);
  writeDockCss(nextMode);
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
  clearDockCss();
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
