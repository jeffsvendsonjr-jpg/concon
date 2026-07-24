// Shadow-DOM panel renderer.
//
// v0.1 step 4: renders the Commitment Ledger. Entries are interleaved
// chronologically in a single column with strong role markers. The docs'
// "two columns" concept lives on as two lifecycles (human proposed→confirmed,
// assistant asserted→acknowledged/contested), not as two side-by-side lists.
// Rationale: at 340 px panel width, side-by-side is cramped, and interleaved
// chronological actually shows divergence patterns better because
// human-proposes → assistant-asserts sequences are visually adjacent.
//
// The panel exposes callbacks (onTransition, onJump, onToggleView) that
// mount.js wires to the store. This module contains no store references,
// no message ingest logic, and no navigation logic — pure view.

import { groupByTopic } from '../core/ledger.js';
import { searchLedger, countTranscriptOnly, highlightMatch } from '../core/search.js';

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .root {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    display: flex;
    flex-direction: column;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    background: #f6f2ea;
    color: #1c1a17;
    border-left: 1px solid #d9d1c0;
    box-shadow: -8px 0 24px rgba(28, 26, 23, 0.08);
    z-index: 2147483647;
    -webkit-font-smoothing: antialiased;
  }
  .header {
    padding: 14px 18px 10px;
    border-bottom: 1px solid #e5dfd0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .brand {
    font-size: 20px;
    font-weight: 600;
  }
  .brand-dot { color: #b0632d; }
  .tag {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .toolbar {
    padding: 10px 18px 12px;
    border-bottom: 1px solid #e5dfd0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #f2ecdd;
  }
  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .search-row {
    position: relative;
  }
  .search-input {
    all: unset;
    display: block;
    width: 100%;
    padding: 6px 28px 6px 10px;
    border: 1px solid #d9d1c0;
    border-radius: 4px;
    background: #fbfaf7;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    font-size: 13px;
    color: #1c1a17;
    box-sizing: border-box;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .search-input::placeholder { color: #a89b7d; font-style: italic; }
  .search-input:focus {
    border-color: #b0632d;
    background: #ffffff;
  }
  .search-clear {
    all: unset;
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    color: #7a715f;
    border-radius: 999px;
  }
  .search-clear.visible { display: flex; }
  .search-clear:hover { background: #ebe5d3; color: #1c1a17; }
  .search-summary {
    display: none;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.04em;
    padding: 0 2px;
  }
  .search-summary.visible { display: block; }
  .search-summary .count { color: #1c1a17; font-weight: 600; }
  .search-hit {
    background: rgba(176, 99, 45, 0.22);
    border-radius: 2px;
    padding: 0 1px;
  }
  .status {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.04em;
  }
  .status .count { color: #1c1a17; font-weight: 600; font-variant-numeric: tabular-nums; }
  .view-toggle {
    display: inline-flex;
    border: 1px solid #d9d1c0;
    border-radius: 999px;
    background: #fbfaf7;
    overflow: hidden;
  }
  .view-toggle button {
    all: unset;
    padding: 4px 10px;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7a715f;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .view-toggle button.active {
    background: #1c1a17;
    color: #f6f2ea;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 14px 20px;
  }
  .empty {
    padding: 20px;
    color: #4a453b;
    font-size: 13px;
    line-height: 1.6;
    border: 1px dashed #c9bfa9;
    border-radius: 4px;
    background: rgba(255, 253, 248, 0.6);
  }
  .empty strong { font-weight: 600; color: #1c1a17; }
  .topic-header {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7a715f;
    padding: 10px 4px 6px;
    border-bottom: 1px solid #ebe5d3;
    margin-top: 10px;
  }
  .topic-header:first-child { margin-top: 0; }
  .entry {
    padding: 10px 12px 10px 14px;
    border-left: 3px solid transparent;
    margin: 8px 0;
    background: #fdfbf6;
    border-radius: 2px;
    transition: opacity 0.2s ease, background 0.15s ease;
  }
  .entry.role-user     { border-left-color: #b0632d; }
  .entry.role-assistant { border-left-color: #6a8a75; }
  .entry-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7a715f;
    margin-bottom: 5px;
  }
  .role-label { font-weight: 600; }
  .role-label.role-user      { color: #8c4d20; }
  .role-label.role-assistant { color: #4d6a58; }
  .state-badge {
    font-size: 9px;
    letter-spacing: 0.1em;
  }
  .state-badge.state-proposed,
  .state-badge.state-asserted { color: #7a715f; }
  .state-badge.state-confirmed,
  .state-badge.state-acknowledged { color: #3d6b46; }
  .state-badge.state-dismissed,
  .state-badge.state-contested { color: #94402d; }
  .entry-body {
    font-size: 13px;
    line-height: 1.55;
    color: #1c1a17;
    cursor: pointer;
    padding: 2px 0;
  }
  .entry-body:hover { color: #000; text-decoration: underline; text-decoration-color: #d9d1c0; text-underline-offset: 3px; }
  .entry.inferred .entry-body {
    font-style: italic;
    color: #4a453b;
  }
  .entry.resolved-neg .entry-body {
    text-decoration: line-through;
    text-decoration-color: #94402d;
    opacity: 0.55;
  }
  .entry.resolved-neg { opacity: 0.75; }
  .hedge-note {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    color: #a89b7d;
    letter-spacing: 0.06em;
    margin-left: 4px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .actions button {
    all: unset;
    padding: 3px 10px;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid #d9d1c0;
    border-radius: 999px;
    cursor: pointer;
    color: #4a453b;
    background: #f6f2ea;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .actions button:hover { background: #ebe5d3; }
  .actions button.affirm:hover  { border-color: #3d6b46; color: #3d6b46; }
  .actions button.negate:hover  { border-color: #94402d; color: #94402d; }
  .footer {
    padding: 10px 18px;
    border-top: 1px solid #e5dfd0;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
`;

// -----------------------------------------------------------------------------
// State labels (per role)
// -----------------------------------------------------------------------------
const LABELS = {
  user: {
    proposed:  { badge: 'proposed',  affirm: 'confirm', negate: 'dismiss', showActions: true },
    confirmed: { badge: 'confirmed', showActions: false },
    dismissed: { badge: 'dismissed', showActions: false, resolvedNeg: true },
  },
  assistant: {
    asserted:     { badge: 'asserted',     affirm: 'acknowledge', negate: 'contest', showActions: true },
    acknowledged: { badge: 'acknowledged', showActions: false },
    contested:    { badge: 'contested',    showActions: false,    resolvedNeg: true },
  },
};

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

export function renderPanel(shadowRoot, callbacks = {}) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadowRoot.appendChild(style);

  const root = document.createElement('div');
  root.className = 'root';
  root.setAttribute('data-testid', 'concon-panel');
  root.innerHTML = `
    <div class="header">
      <span class="brand" data-testid="concon-brand">ConCon<span class="brand-dot">.</span></span>
      <span class="tag" data-testid="concon-phase">v0.1 · ledger</span>
    </div>
    <div class="toolbar">
      <div class="toolbar-row">
        <div class="status" data-testid="concon-status">
          <span class="count" data-testid="turn-count">0</span> turns ·
          <span class="count" data-testid="topic-count">0</span> topics ·
          <span class="count" data-testid="entry-count">0</span> ledger
        </div>
        <div class="view-toggle" data-testid="view-toggle" role="tablist">
          <button data-view="chronological" class="active" data-testid="view-chronological-btn">chrono</button>
          <button data-view="topic" data-testid="view-topic-btn">topic</button>
        </div>
      </div>
      <div class="toolbar-row search-row">
        <input
          type="text"
          class="search-input"
          placeholder="search this conversation…"
          data-testid="search-input"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="search-clear" data-testid="search-clear-btn" aria-label="clear search">&times;</button>
      </div>
      <div class="search-summary" data-testid="search-summary"></div>
    </div>
    <div class="body" data-testid="ledger-body">
      <div class="empty" data-testid="ledger-empty">
        <strong>Ledger is live.</strong> As commitments and assertions are
        detected in this conversation, they will appear here. Each entry
        starts as inferred and requires an explicit gesture to become part
        of shared state. Nothing consequential silently merges.
      </div>
    </div>
    <div class="footer" data-testid="concon-footer">local · offline · no telemetry</div>
  `;
  shadowRoot.appendChild(root);

  // Wire the view-mode toggle.
  const toggleEl = root.querySelector('[data-testid="view-toggle"]');
  toggleEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-view]');
    if (!btn) return;
    const view = btn.getAttribute('data-view');
    if (callbacks.onToggleView) callbacks.onToggleView(view);
  });

  // Wire the search input and clear button.
  const searchInput = root.querySelector('[data-testid="search-input"]');
  const searchClear = root.querySelector('[data-testid="search-clear-btn"]');
  searchInput.addEventListener('input', (ev) => {
    if (callbacks.onSearchChange) callbacks.onSearchChange(ev.target.value);
  });
  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      searchInput.value = '';
      if (callbacks.onSearchChange) callbacks.onSearchChange('');
    }
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    if (callbacks.onSearchChange) callbacks.onSearchChange('');
    searchInput.focus();
  });

  // Delegated click handlers for entries: action buttons + click-to-jump.
  const body = root.querySelector('[data-testid="ledger-body"]');
  body.addEventListener('click', (ev) => {
    const actionBtn = ev.target.closest('button[data-action]');
    if (actionBtn) {
      const entryId = actionBtn.getAttribute('data-entry-id');
      const newState = actionBtn.getAttribute('data-action');
      if (callbacks.onTransition) callbacks.onTransition(entryId, newState);
      return;
    }
    const jumpEl = ev.target.closest('[data-jump-target]');
    if (jumpEl) {
      const sourceId = jumpEl.getAttribute('data-jump-target');
      if (callbacks.onJump) callbacks.onJump(sourceId);
    }
  });

  return { root, shadowRoot };
}

// -----------------------------------------------------------------------------
// Update — called on every store event.
// -----------------------------------------------------------------------------

export function updatePanel(shadowRoot, { conversation, viewMode = 'chronological', searchQuery = '' } = {}) {
  if (!shadowRoot) return;
  const { messages = [], outline = null, ledger = null } = conversation || {};
  const turnCount = messages.length;
  const topicCount = outline?.topics?.length || 0;
  const entryCount = ledger?.entries?.length || 0;

  const t = shadowRoot.querySelector('[data-testid="turn-count"]');
  const p = shadowRoot.querySelector('[data-testid="topic-count"]');
  const e = shadowRoot.querySelector('[data-testid="entry-count"]');
  if (t) t.textContent = String(turnCount);
  if (p) p.textContent = String(topicCount);
  if (e) e.textContent = String(entryCount);

  // View toggle visual state.
  for (const btn of shadowRoot.querySelectorAll('[data-testid="view-toggle"] button')) {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewMode);
  }

  // Search UI state.
  const searchClear = shadowRoot.querySelector('[data-testid="search-clear-btn"]');
  const searchSummary = shadowRoot.querySelector('[data-testid="search-summary"]');
  if (searchClear) searchClear.classList.toggle('visible', !!searchQuery);
  if (searchSummary) {
    if (searchQuery) {
      const filtered = searchLedger(ledger, searchQuery);
      const transcriptOnly = countTranscriptOnly(ledger, messages, searchQuery);
      searchSummary.classList.add('visible');
      searchSummary.innerHTML = `<span class="count">${filtered.matches.length}</span> in ledger · <span class="count">${transcriptOnly}</span> more in transcript`;
    } else {
      searchSummary.classList.remove('visible');
      searchSummary.textContent = '';
    }
  }

  const body = shadowRoot.querySelector('[data-testid="ledger-body"]');
  if (!body) return;

  // Empty state.
  if (!ledger || ledger.entries.length === 0) {
    body.innerHTML = `
      <div class="empty" data-testid="ledger-empty">
        <strong>Ledger is live.</strong> As commitments and assertions are
        detected in this conversation, they will appear here. Each entry
        starts as inferred and requires an explicit gesture to become part
        of shared state. Nothing consequential silently merges.
      </div>
    `;
    return;
  }

  // Filter within the ledger by search query (if any).
  const { matches } = searchLedger(ledger, searchQuery);
  const hasSearch = !!searchQuery;
  const visibleEntries = hasSearch ? matches : ledger.entries;

  if (hasSearch && visibleEntries.length === 0) {
    body.innerHTML = `
      <div class="empty" data-testid="ledger-empty-search">
        No ledger entries match this search. Any transcript matches are
        counted in the badge above; the ledger only contains
        commitment-shaped statements, so plain mentions live outside it.
      </div>
    `;
    return;
  }

  // In chronological view: render the visible entries in order.
  // In by-topic view: group the FULL ledger first (so topic membership is
  // computed with full context), then filter each group's entries.
  const html = viewMode === 'topic'
    ? renderByTopic(ledger, outline, visibleEntries, searchQuery)
    : renderChronological({ entries: visibleEntries }, searchQuery);
  body.innerHTML = html;
}

// -----------------------------------------------------------------------------
// Rendering helpers.
// -----------------------------------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEntry(entry, searchQuery = '') {
  const role = entry.role;
  const labelSet = LABELS[role]?.[entry.state] || {};
  const isInferred = entry.state === 'proposed' || entry.state === 'asserted';
  const isResolvedNeg = !!labelSet.resolvedNeg;
  const classes = [
    'entry',
    `role-${role}`,
    isInferred ? 'inferred' : '',
    isResolvedNeg ? 'resolved-neg' : '',
  ].filter(Boolean).join(' ');

  const actionsHtml = labelSet.showActions
    ? `
      <div class="actions">
        <button class="affirm" data-action="${role === 'user' ? 'confirmed' : 'acknowledged'}" data-entry-id="${esc(entry.id)}" data-testid="ledger-affirm-${esc(entry.id)}">
          ${labelSet.affirm}
        </button>
        <button class="negate" data-action="${role === 'user' ? 'dismissed' : 'contested'}" data-entry-id="${esc(entry.id)}" data-testid="ledger-negate-${esc(entry.id)}">
          ${labelSet.negate}
        </button>
      </div>
    `
    : '';

  const hedgeHtml = entry.hedged
    ? `<span class="hedge-note" data-testid="ledger-hedge-marker">(hedged)</span>`
    : '';

  // Highlight the search hit within the sentence, if any.
  let sentenceHtml;
  if (searchQuery) {
    const { pre, match, post } = highlightMatch(entry.sentence, searchQuery);
    sentenceHtml = match
      ? `${esc(pre)}<span class="search-hit" data-testid="search-hit">${esc(match)}</span>${esc(post)}`
      : esc(entry.sentence);
  } else {
    sentenceHtml = esc(entry.sentence);
  }

  return `
    <div class="${classes}" data-testid="ledger-entry" data-entry-id="${esc(entry.id)}">
      <div class="entry-header">
        <span class="role-label role-${role}">${role === 'user' ? 'you' : 'assistant'}</span>
        <span class="state-badge state-${entry.state}" data-testid="ledger-state-${esc(entry.id)}">${esc(labelSet.badge || entry.state)}</span>
      </div>
      <div class="entry-body" data-jump-target="${esc(entry.sourceMessageId)}">
        ${sentenceHtml}${hedgeHtml}
      </div>
      ${actionsHtml}
    </div>
  `;
}

function renderChronological(ledger, searchQuery = '') {
  return ledger.entries.map((e) => renderEntry(e, searchQuery)).join('');
}

function renderByTopic(fullLedger, outline, visibleEntries, searchQuery = '') {
  const groups = groupByTopic(fullLedger, outline);
  if (!groups.length) return renderChronological({ entries: visibleEntries }, searchQuery);
  const visibleIds = new Set(visibleEntries.map((e) => e.id));
  const parts = [];
  for (const g of groups) {
    const kept = g.entries.filter((e) => visibleIds.has(e.id));
    if (kept.length === 0) continue;
    const label = g.topic ? g.topic.label : 'unclassified';
    parts.push(`<div class="topic-header" data-testid="ledger-topic-header">${esc(label)}</div>`);
    parts.push(kept.map((e) => renderEntry(e, searchQuery)).join(''));
  }
  return parts.join('');
}

// -----------------------------------------------------------------------------
// Back-compat: some callers still use updatePanelCounts. Keep it around.
// -----------------------------------------------------------------------------

export function updatePanelCounts(shadowRoot, { turnCount, topicCount } = {}) {
  if (!shadowRoot) return;
  const t = shadowRoot.querySelector('[data-testid="turn-count"]');
  const p = shadowRoot.querySelector('[data-testid="topic-count"]');
  if (t) t.textContent = String(turnCount ?? 0);
  if (p) p.textContent = String(topicCount ?? 0);
}

export function destroyPanel(shadowRoot) {
  if (!shadowRoot) return;
  while (shadowRoot.firstChild) shadowRoot.removeChild(shadowRoot.firstChild);
}
