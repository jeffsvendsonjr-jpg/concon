// Shadow-DOM panel renderer.
//
// v0.1 substrate phase: the panel is intentionally near-empty. It shows a
// header, live counts for turns and topics observed, and a footer stating
// the doctrine invariants. The commitment ledger, referent tracker, and
// divergence indicator arrive in later steps.

const STYLE = `
  :host { all: initial; }
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
    padding: 16px 18px 12px;
    border-bottom: 1px solid #e5dfd0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .brand {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.005em;
    color: #1c1a17;
  }
  .brand-dot {
    color: #b0632d;
  }
  .tag {
    font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
  }
  .status {
    font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #7a715f;
    margin-bottom: 16px;
    letter-spacing: 0.02em;
  }
  .count {
    font-variant-numeric: tabular-nums;
    color: #1c1a17;
    font-weight: 600;
  }
  .empty {
    padding: 20px;
    color: #4a453b;
    font-size: 14px;
    line-height: 1.6;
    border: 1px dashed #c9bfa9;
    border-radius: 4px;
    background: rgba(255, 253, 248, 0.6);
  }
  .empty strong {
    font-weight: 600;
    color: #1c1a17;
  }
  .footer {
    padding: 10px 18px;
    border-top: 1px solid #e5dfd0;
    font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: #7a715f;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
`;

export function renderPanel(shadowRoot) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadowRoot.appendChild(style);

  const root = document.createElement('div');
  root.className = 'root';
  root.setAttribute('data-testid', 'concon-panel');
  root.innerHTML = `
    <div class="header">
      <span class="brand" data-testid="concon-brand">ConCon<span class="brand-dot">.</span></span>
      <span class="tag" data-testid="concon-phase">v0.1 · substrate</span>
    </div>
    <div class="body">
      <div class="status" data-testid="concon-status">
        <span class="count" data-testid="turn-count">0</span> turns observed
        &nbsp;·&nbsp;
        <span class="count" data-testid="topic-count">0</span> topics
      </div>
      <div class="empty" data-testid="concon-empty">
        <strong>Substrate is live.</strong> ConCon is silently indexing this
        conversation and grouping user turns into topics. The commitment
        ledger, referent tracker, and divergence indicator arrive in the
        next phase.
      </div>
    </div>
    <div class="footer" data-testid="concon-footer">local · offline · no telemetry</div>
  `;
  shadowRoot.appendChild(root);
  return { root, shadowRoot };
}

export function updatePanelCounts(shadowRoot, { turnCount, topicCount }) {
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
