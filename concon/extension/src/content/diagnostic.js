// Diagnostic logger for ConCon docking. Runs once after the panel mounts
// and dumps a labeled report to the console so we can identify the actual
// width-owning container in ChatGPT's live DOM.
//
// This is a temporary v0.1.0-diag helper. Delete once dock selectors are
// verified against live ChatGPT.

const TAG = '[ConCon Diag]';

function box(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName,
    id: el.id || '',
    cls: (typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')).slice(0, 120),
    dataTestid: el.getAttribute?.('data-testid') || '',
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
    right: Math.round(r.right),
    display: cs.display,
    overflowX: cs.overflowX,
    overflowY: cs.overflowY,
    position: cs.position,
    paddingRight: cs.paddingRight,
    marginRight: cs.marginRight,
  };
}

function findWidthOwners() {
  const vw = window.innerWidth;
  const all = Array.from(document.querySelectorAll('body *'));
  return all
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > vw * 0.4 &&
        r.right > vw - 60 &&
        r.height > 300 &&
        r.top < 400
      );
    })
    .slice(0, 15);
}

function ancestorsOf(el, stopAt = document.body) {
  const chain = [];
  let cur = el;
  while (cur && cur !== stopAt && chain.length < 20) {
    chain.push(cur);
    cur = cur.parentElement;
  }
  return chain;
}

export function runDockDiagnostic({ delay = 1500 } = {}) {
  setTimeout(() => {
    try {
      const layoutAttr = document.documentElement.getAttribute('data-concon-layout');
      const styleEl = document.getElementById('concon-dock-stylesheet');
      console.groupCollapsed(`${TAG} snapshot @ ${new Date().toISOString()}`);
      console.log('viewport:', window.innerWidth, 'x', window.innerHeight);
      console.log('html[data-concon-layout]:', layoutAttr);
      console.log('injected stylesheet content:', styleEl?.textContent?.trim() || '(none)');

      const mainEl = document.querySelector('main');
      console.log('main present:', !!mainEl);
      if (mainEl) {
        console.log('main box:', box(mainEl));
      }

      console.groupCollapsed(`${TAG} full-width candidates (top 15)`);
      const owners = findWidthOwners();
      owners.forEach((el, i) => console.log(i, box(el)));
      console.groupEnd();

      const turns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
      console.log(`turns detected: ${turns.length}`);
      if (turns.length > 0) {
        const first = turns[0];
        console.log('first turn box:', box(first));
        console.groupCollapsed(`${TAG} ancestor chain of first turn`);
        ancestorsOf(first).forEach((a, i) => console.log(i, box(a)));
        console.groupEnd();
      }

      console.log(`${TAG} → copy this ENTIRE group and paste it back to ConCon.`);
      console.groupEnd();
    } catch (err) {
      console.error(TAG, 'diagnostic failed:', err);
    }
  }, delay);
}
