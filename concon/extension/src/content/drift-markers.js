// Inline drift markers — colored strips injected into ChatGPT's DOM
// alongside each turn to surface ledger status while scrolling.
//
// Doctrine:
//   - Non-destructive. Every marker is an element we own, tagged with a
//     unique attribute; we can walk the DOM and remove them all cleanly
//     on detach. We never touch ChatGPT's own nodes.
//   - Read-only against the ledger — we render what's already there,
//     never mutate.
//   - No CSS injection into the page stylesheet. All styles live on the
//     marker element itself as inline styles, so ChatGPT's stylesheet
//     never sees ConCon rules and cascading conflicts stay impossible.
//
// Palette:
//   deep amber (#b0632d)  — your pending proposal(s) sitting unresolved
//   rust red   (#a13a2b)  — assistant claim(s) unresolved, OR contested
//   moss green (#3e6d4a)  — every entry for this turn is resolved-affirm
//   cool grey  (#7a715f)  — every entry is resolved-neg (dropped/contested)
//
// Priority (a turn with multiple entries picks the highest-urgency color):
//   rust red > deep amber > cool grey > moss green
//
// The marker element is a thin left-edge strip with a tooltip listing
// what's in it.

const MARKER_ATTR = 'data-concon-drift-marker';
const TURN_TAGGED_ATTR = 'data-concon-marker-turn';

const COLORS = {
  'unresolved-assistant': '#a13a2b',
  'contested':            '#a13a2b',
  'unresolved-human':     '#b0632d',
  'resolved-neg':         '#7a715f',
  'resolved-affirm':      '#3e6d4a',
};

const PRIORITY = ['unresolved-assistant', 'contested', 'unresolved-human', 'resolved-neg', 'resolved-affirm'];

// Reduce a set of ledger entries for a single turn to one marker kind.
function kindFor(entries) {
  const kinds = new Set();
  for (const e of entries) {
    if (e.state === 'asserted') kinds.add('unresolved-assistant');
    else if (e.state === 'contested' || e.state === 'dismissed') kinds.add('contested');
    else if (e.state === 'proposed') kinds.add('unresolved-human');
    else if (e.state === 'confirmed' || e.state === 'acknowledged') kinds.add('resolved-affirm');
  }
  // Contested/dismissed only shows "resolved-neg" grey if there's nothing
  // more urgent. We handled it as 'contested' (rust red) above; kept for
  // future extension if we differentiate.
  for (const p of PRIORITY) {
    if (kinds.has(p)) return p;
  }
  return null;
}

function buildTooltip(entries, kind) {
  const label = {
    'unresolved-assistant': 'Assistant claim awaiting your yes/no',
    'contested':            'You pushed back on something here',
    'unresolved-human':     'You said something that still needs a yes/no',
    'resolved-neg':         'Everything here was dropped or pushed back',
    'resolved-affirm':      'Every entry here is confirmed',
  }[kind] || 'Ledger activity';
  return `${label} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
}

// Attach a marker element to a turn wrapper, or update the existing one.
function ensureMarker(turnEl, kind, tooltip) {
  let marker = turnEl.querySelector(`[${MARKER_ATTR}]`);
  if (!marker) {
    marker = document.createElement('div');
    marker.setAttribute(MARKER_ATTR, '1');
    marker.style.cssText = [
      'position: absolute',
      'left: -2px',
      'top: 8px',
      'bottom: 8px',
      'width: 3px',
      'border-radius: 2px',
      'pointer-events: auto',
      'z-index: 1',
      'transition: background-color 0.2s ease, box-shadow 0.2s ease',
    ].join(';');
    // The turn wrapper needs to be a positioning context so our
    // absolute-positioned marker anchors to it. Only touch position if
    // it's currently 'static' — respect anything explicit ChatGPT set.
    const cs = getComputedStyle(turnEl);
    if (cs.position === 'static') {
      turnEl.style.position = 'relative';
      turnEl.setAttribute(TURN_TAGGED_ATTR, '1');
    }
    turnEl.appendChild(marker);
  }
  const color = COLORS[kind] || '#c9bfa9';
  marker.style.backgroundColor = color;
  marker.style.boxShadow = `0 0 6px ${color}66`;
  marker.setAttribute('title', tooltip);
  marker.setAttribute('data-concon-marker-kind', kind);
}

function removeMarkerFrom(turnEl) {
  const marker = turnEl.querySelector(`[${MARKER_ATTR}]`);
  if (marker) marker.remove();
  if (turnEl.getAttribute(TURN_TAGGED_ATTR) === '1') {
    turnEl.style.position = '';
    turnEl.removeAttribute(TURN_TAGGED_ATTR);
  }
}

/**
 * Update markers based on the current ledger. Idempotent — safe to
 * call after every ledger:updated event.
 *
 * conversation shape: { messages, ledger, outline }
 */
export function refreshMarkers(conversation) {
  const entries = conversation?.ledger?.entries || [];
  const messages = conversation?.messages || [];

  // Build a map: sourceMessageId → array of ledger entries.
  const byMessage = new Map();
  for (const e of entries) {
    if (!e.sourceMessageId) continue;
    if (!byMessage.has(e.sourceMessageId)) byMessage.set(e.sourceMessageId, []);
    byMessage.get(e.sourceMessageId).push(e);
  }

  // Map messageId → turn wrapper element in the DOM.
  // ChatGPT's turn wrapper contains the message container via
  // data-message-id; walk from each message container up to its
  // conversation-turn ancestor.
  const turnByMessage = new Map();
  for (const m of messages) {
    const msgEl = document.querySelector(`[data-message-id="${CSS.escape(m.id)}"]`);
    if (!msgEl) continue;
    const turnEl = msgEl.closest('[data-testid^="conversation-turn-"]');
    if (turnEl) turnByMessage.set(m.id, turnEl);
  }

  // Track which turn elements we're currently marking so we can clear
  // stale markers on turns that no longer have ledger entries.
  const shouldHaveMarker = new Set();

  for (const [messageId, msgEntries] of byMessage) {
    const turnEl = turnByMessage.get(messageId);
    if (!turnEl) continue;
    const kind = kindFor(msgEntries);
    if (!kind) continue;
    ensureMarker(turnEl, kind, buildTooltip(msgEntries, kind));
    shouldHaveMarker.add(turnEl);
  }

  // Clear markers from turns that no longer have any tracked entries.
  const existing = document.querySelectorAll(`[${MARKER_ATTR}]`);
  for (const m of existing) {
    const parentTurn = m.closest('[data-testid^="conversation-turn-"]');
    if (parentTurn && !shouldHaveMarker.has(parentTurn)) {
      removeMarkerFrom(parentTurn);
    }
  }
}

/**
 * Remove every marker we placed. Called on conversation change or
 * detach. Leaves ChatGPT's DOM exactly as we found it.
 */
export function clearAllMarkers() {
  const markers = document.querySelectorAll(`[${MARKER_ATTR}]`);
  for (const m of markers) {
    const parentTurn = m.closest('[data-testid^="conversation-turn-"]');
    if (parentTurn) removeMarkerFrom(parentTurn);
    else m.remove();
  }
  // Also clean up any position: relative we set on turns whose markers
  // may have been removed above without walking through the turn.
  const tagged = document.querySelectorAll(`[${TURN_TAGGED_ATTR}]`);
  for (const el of tagged) {
    el.style.position = '';
    el.removeAttribute(TURN_TAGGED_ATTR);
  }
}
