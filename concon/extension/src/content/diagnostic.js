// Diagnostic logger for ConCon docking. Runs once after the panel mounts
// and dumps a labeled report to the console so we can identify the actual
// width-owning container in ChatGPT's live DOM.
//
// v0.1.2: logs flat JSON strings (survives copy/paste) + probes fallback
// turn selectors + retries turn detection.

const TAG = '[ConCon Diag]';

function box(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName,
    id: el.id || '',
    cls: (typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')).slice(0, 140),
    testid: el.getAttribute?.('data-testid') || '',
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
    right: Math.round(r.right),
    display: cs.display,
    overflowX: cs.overflowX,
    position: cs.position,
    paddingRight: cs.paddingRight,
  };
}

function line(label, obj) {
  console.log(`${TAG} ${label}: ${JSON.stringify(obj)}`);
}

function findWidthOwners() {
  const vw = window.innerWidth;
  return Array.from(document.querySelectorAll('body *'))
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

// Try a few selectors that ChatGPT has used historically for turn wrappers.
const TURN_SELECTOR_CANDIDATES = [
  'article[data-testid^="conversation-turn-"]',
  '[data-testid^="conversation-turn-"]',
  '[data-message-id]',
  '[data-message-author-role]',
  'div.group\\/conversation-turn',
];

function probeTurnSelectors() {
  return TURN_SELECTOR_CANDIDATES.map((sel) => {
    let count = 0;
    try { count = document.querySelectorAll(sel).length; } catch (_) {}
    return { sel, count };
  });
}

function dump(reason) {
  const layoutAttr = document.documentElement.getAttribute('data-concon-layout');
  const styleEl = document.getElementById('concon-dock-stylesheet');
  console.log(`${TAG} === snapshot (${reason}) @ ${new Date().toISOString()} ===`);
  console.log(`${TAG} url: ${location.href}`);
  console.log(`${TAG} viewport: ${window.innerWidth}x${window.innerHeight}`);
  console.log(`${TAG} html[data-concon-layout]: ${layoutAttr}`);
  console.log(`${TAG} injected stylesheet: ${JSON.stringify(styleEl?.textContent?.trim() || '(none)')}`);

  const mainEl = document.querySelector('main');
  line('main', box(mainEl));

  const probes = probeTurnSelectors();
  console.log(`${TAG} turn-selector probes: ${JSON.stringify(probes)}`);

  const owners = findWidthOwners();
  console.log(`${TAG} full-width candidates (count=${owners.length}):`);
  owners.forEach((el, i) => line(`  cand[${i}]`, box(el)));

  // First hit from whichever selector returned >0 turns.
  let firstTurn = null;
  for (const { sel, count } of probes) {
    if (count > 0) {
      try { firstTurn = document.querySelector(sel); } catch (_) {}
      if (firstTurn) break;
    }
  }
  if (firstTurn) {
    line('firstTurn', box(firstTurn));
    console.log(`${TAG} ancestor chain of first turn:`);
    ancestorsOf(firstTurn).forEach((a, i) => line(`  anc[${i}]`, box(a)));
  } else {
    console.log(`${TAG} no turns matched any candidate selector — either not on a chat URL or ChatGPT changed its DOM.`);
  }

  console.log(`${TAG} === end snapshot ===`);
}

export function runDockDiagnostic() {
  // Fire two dumps: one quick (2s) and one late (6s) so we catch cases where
  // ChatGPT streams the turn list in slowly on a slow connection or a
  // heavy chat.
  setTimeout(() => { try { dump('early'); } catch (e) { console.error(TAG, e); } }, 2000);
  setTimeout(() => { try { dump('late'); } catch (e) { console.error(TAG, e); } }, 6000);
}
