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
import { runCheck, formatStatusHeadline, formatReportAsMarkdown } from '../core/concon-check.js';
import { getEffectiveVigilance, setConversationVigilance, setGlobalVigilance, hasPickedFTU, markFTUPicked, MODES as VIGILANCE_MODES } from '../core/vigilance.js';

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .root {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--concon-panel-width, 340px);
    display: flex;
    flex-direction: column;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    background: #f6f2ea;
    color: #1c1a17;
    border-left: 1px solid #d9d1c0;
    /* Deep panel elevation: floats over ChatGPT's flat surface. Inset
       highlight on the top-left simulates a raised edge catching light. */
    box-shadow:
      -18px 0 44px rgba(28, 26, 23, 0.16),
      -2px 0 6px rgba(28, 26, 23, 0.06),
      inset 1px 0 0 rgba(255, 253, 248, 0.9);
    z-index: 2147483647;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  /* Letterpress: subtle 1px light shadow under serif characters mimics
     ink pressed into cream paper. Applied to all serif text; skipped for
     monospace where it reads muddled. */
  .brand,
  .empty,
  .entry-body,
  .topic-header {
    text-shadow: 0 1px 0 rgba(255, 253, 248, 0.85);
  }
  .header {
    padding: 14px 14px 10px 18px;
    border-bottom: 1px solid #e5dfd0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .header-titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .collapse-toggle {
    all: unset;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    color: #7a715f;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .collapse-toggle:hover { background: #ebe5d3; color: #1c1a17; }
  /* --- Collapsed rail --- */
  .root.collapsed {
    width: var(--concon-panel-collapsed-width, 48px);
  }
  .root.collapsed .header {
    padding: 12px 6px;
    justify-content: center;
    border-bottom: 1px solid #e5dfd0;
  }
  .root.collapsed .header-titles,
  .root.collapsed .toolbar,
  .root.collapsed .body,
  .root.collapsed .footer {
    display: none;
  }
  .root.collapsed .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 12px;
    flex: 1;
  }
  .root:not(.collapsed) .rail { display: none; }
  .rail-brand {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: #1c1a17;
    text-shadow: 0 1px 0 rgba(255, 253, 248, 0.85);
    user-select: none;
  }
  .rail-count {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    color: #7a715f;
    text-transform: uppercase;
  }
  .rail-count .n { color: #1c1a17; font-weight: 600; }
  .rail-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #b0632d;
    opacity: 0.6;
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
  .empty p { margin: 0 0 10px 0; }
  .empty p:last-child { margin-bottom: 0; }
  .empty ul { margin: 6px 0 10px 0; padding-left: 18px; }
  .empty li { margin: 4px 0; }
  .empty .k {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: #1c1a17;
    background: #ebe5d3;
    padding: 1px 5px;
    border-radius: 3px;
  }
  /* --- Help overlay: opens on ? click. Dismisses on click outside, Esc,
     or "close" button. First-run version has slightly different copy. */
  .overlay {
    position: absolute;
    inset: 0;
    background: rgba(28, 26, 23, 0.32);
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 14px 14px;
    z-index: 10;
  }
  .overlay.visible { display: flex; }
  .overlay-card {
    background: #f6f2ea;
    border: 1px solid #d9d1c0;
    border-radius: 6px;
    padding: 18px 20px 16px;
    max-width: 100%;
    width: 100%;
    box-shadow: 0 12px 32px rgba(28, 26, 23, 0.22);
    font-size: 13px;
    line-height: 1.55;
    color: #1c1a17;
    max-height: calc(100% - 20px);
    overflow-y: auto;
  }
  .overlay-card h4 {
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 8px 0;
    text-shadow: 0 1px 0 rgba(255, 253, 248, 0.85);
  }
  .overlay-card h5 {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7a715f;
    margin: 14px 0 4px 0;
  }
  .overlay-card p { margin: 0 0 8px 0; }
  .overlay-card ul { margin: 4px 0 8px 0; padding-left: 16px; }
  .overlay-card li { margin: 3px 0; }
  .overlay-card li strong { color: #1c1a17; font-weight: 600; }
  /* Vigilance picker — three tap-able cards inside the overlay. */
  .mode-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0 4px;
  }
  .mode-option {
    all: unset;
    display: block;
    padding: 10px 12px;
    border: 1px solid #d9d1c0;
    border-radius: 4px;
    background: #fbfaf7;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .mode-option:hover { background: #f2ecdd; }
  .mode-option.selected {
    border-color: #b0632d;
    background: #faedde;
  }
  .mode-option-title {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    color: #1c1a17;
    margin-bottom: 3px;
  }
  .mode-option-desc {
    font-size: 12px;
    line-height: 1.45;
    color: #4a453b;
  }
  .overlay-card .mode-hint {
    margin-top: 8px;
    font-size: 11px;
    color: #7a715f;
    font-style: italic;
  }
  .overlay-card .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .overlay-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .overlay-btn {
    all: unset;
    padding: 6px 14px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f6f2ea;
    background: #1c1a17;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .overlay-btn:hover { background: #3a342a; }
  .help-btn {
    all: unset;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 999px;
    border: 1px solid #d9d1c0;
    color: #7a715f;
    font-family: 'Iowan Old Style', Georgia, serif;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .help-btn:hover { background: #ebe5d3; color: #1c1a17; border-color: #b0632d; }
  /* Vigilance mode chip in header. Always visible so the current mode
     is never a hidden setting. Colour-coded by mode. */
  .mode-chip {
    all: unset;
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 999px;
    border: 1px solid #d9d1c0;
    color: #4a453b;
    background: #fbfaf7;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .mode-chip:hover { background: #ebe5d3; }
  .mode-chip[data-mode="trust"]    { color: #4a453b; border-color: #c9bfa9; background: #f2ecdd; }
  .mode-chip[data-mode="balanced"] { color: #4a453b; border-color: #b0632d; background: #faedde; }
  .mode-chip[data-mode="wary"]     { color: #f6f2ea; border-color: #a13a2b; background: #a13a2b; }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  /* Hide the view toggle until it's meaningful (2+ topics AND some entries). */
  .view-toggle.hidden { display: none; }
  /* CHECK button — impromptu state-integrity audit. Lives in the toolbar
     next to the view toggle. Prominent because Check is the elevator-pitch
     surface for the whole product. */
  .check-btn {
    all: unset;
    padding: 4px 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f6f2ea;
    background: #1c1a17;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .check-btn:hover { background: #3a342a; }
  /* Report view — replaces the ledger body while Check is active. */
  .report {
    padding: 4px 4px 14px;
  }
  .report-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 10px;
  }
  .report-back {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7a715f;
    cursor: pointer;
    border-radius: 4px;
  }
  .report-back:hover { color: #1c1a17; background: #ebe5d3; }
  .report-share {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f6f2ea;
    background: #1c1a17;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .report-share:hover { background: #3a342a; }
  .report-share.copied { background: #7a8f5a; }
  .report-share.copied::after { content: ' ✓'; }
  .report-headline {
    padding: 12px 14px;
    border-radius: 4px;
    border: 1px solid #d9d1c0;
    background: #fbfaf7;
    margin-bottom: 12px;
  }
  .report-headline.status-pass { border-color: #7a8f5a; background: #f0f5e6; }
  .report-headline.status-review { border-color: #b0632d; background: #faedde; }
  .report-headline.status-partial { border-color: #a89b7d; background: #f2ecdd; }
  .report-status {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1c1a17;
    font-weight: 600;
  }
  .report-timestamp {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: lowercase;
    color: #7a715f;
    margin-top: 4px;
  }
  .report-headline p {
    margin: 6px 0 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: #4a453b;
  }
  .report-counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 4px;
    background: #ebe5d3;
    margin-bottom: 12px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: #4a453b;
  }
  .report-counts .n {
    font-weight: 600;
    color: #1c1a17;
    font-variant-numeric: tabular-nums;
  }
  .report-h5 {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7a715f;
    margin: 12px 0 6px;
  }
  .report-empty {
    padding: 12px;
    color: #4a453b;
    font-size: 12px;
    line-height: 1.5;
    font-style: italic;
    border: 1px dashed #c9bfa9;
    border-radius: 4px;
  }
  .finding {
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid #d9d1c0;
    background: #fbfaf7;
    margin-bottom: 8px;
    cursor: pointer;
  }
  .finding:hover { background: #f6f2ea; border-color: #b0632d; }
  .finding-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.04em;
    color: #7a715f;
    margin-bottom: 4px;
  }
  .finding-kind {
    text-transform: uppercase;
    font-weight: 600;
    color: #1c1a17;
  }
  .finding-kind.kind-stale-open { color: #a13a2b; }
  .finding-kind.kind-unresolved-human { color: #b0632d; }
  .finding-kind.kind-unresolved-assistant { color: #6b7280; }
  .finding-kind.kind-contested { color: #a13a2b; }
  .finding-age {
    color: #7a715f;
  }
  .finding-body {
    font-size: 12px;
    line-height: 1.5;
    color: #1c1a17;
  }
  .finding-hedge {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    color: #7a715f;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-left: 4px;
  }
  .report-scope-note {
    margin-top: 14px;
    padding: 10px 12px;
    border-left: 2px solid #d9d1c0;
    font-size: 11px;
    color: #7a715f;
    line-height: 1.55;
    font-style: italic;
  }
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
    padding: 12px 14px 12px 16px;
    border-left: 3px solid transparent;
    margin: 10px 0;
    background: #fdfbf6;
    border-radius: 4px;
    /* Subtle card lift so entries clearly sit above the toolbar background. */
    box-shadow:
      0 1px 2px rgba(28, 26, 23, 0.06),
      0 0 0 1px rgba(217, 209, 192, 0.4);
    transition: opacity 0.2s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .entry.role-user     { border-left-color: #b0632d; }
  .entry.role-assistant { border-left-color: #6a8a75; }
  /* Pending entries stay bright cream; resolved ones fade back so the eye
     lands on what still needs attention. */
  .entry.resolved-affirm {
    background: rgba(245, 242, 234, 0.75);
    box-shadow:
      0 0 0 1px rgba(61, 107, 70, 0.15);
  }
  .entry.resolved-neg {
    background: rgba(245, 242, 234, 0.6);
    box-shadow:
      0 0 0 1px rgba(148, 64, 45, 0.15);
    opacity: 0.75;
  }
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
    font-size: 10px;
    letter-spacing: 0.12em;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 253, 248, 0.7);
    border: 1px solid rgba(217, 209, 192, 0.6);
  }
  .state-badge.state-proposed,
  .state-badge.state-asserted { color: #7a715f; }
  .state-badge.state-confirmed,
  .state-badge.state-acknowledged {
    color: #2f5c3a;
    background: rgba(61, 107, 70, 0.10);
    border-color: rgba(61, 107, 70, 0.35);
  }
  .state-badge.state-dismissed,
  .state-badge.state-contested {
    color: #7a2d1e;
    background: rgba(148, 64, 45, 0.10);
    border-color: rgba(148, 64, 45, 0.35);
  }
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
    opacity: 0.7;
  }
  .entry-body {
    font-size: 13px;
    line-height: 1.55;
    color: #1c1a17;
    cursor: pointer;
    padding: 2px 0;
    border-bottom: 1px dotted transparent;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .entry-body:hover {
    color: #000;
    border-bottom-color: #b0632d;
  }
  .entry.inferred .entry-body {
    font-style: italic;
    color: #4a453b;
  }
  .hedge-note {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8c4d20;
    background: rgba(176, 99, 45, 0.12);
    border: 1px solid rgba(176, 99, 45, 0.3);
    border-radius: 999px;
    vertical-align: middle;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
  .actions button {
    all: unset;
    padding: 4px 12px;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    border: 1px solid;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .actions button.affirm {
    color: #3d6b46;
    border-color: rgba(61, 107, 70, 0.45);
    background: rgba(61, 107, 70, 0.06);
  }
  .actions button.affirm:hover {
    background: #3d6b46;
    color: #f6f2ea;
    border-color: #3d6b46;
  }
  .actions button.negate {
    color: #94402d;
    border-color: rgba(148, 64, 45, 0.4);
    background: rgba(148, 64, 45, 0.05);
  }
  .actions button.negate:hover {
    background: #94402d;
    color: #f6f2ea;
    border-color: #94402d;
  }
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
    confirmed: { badge: 'confirmed', showActions: false, resolvedAffirm: true },
    dismissed: { badge: 'dismissed', showActions: false, resolvedNeg: true },
  },
  assistant: {
    asserted:     { badge: 'asserted',     affirm: 'acknowledge', negate: 'contest', showActions: true },
    acknowledged: { badge: 'acknowledged', showActions: false, resolvedAffirm: true },
    contested:    { badge: 'contested',    showActions: false,   resolvedNeg: true },
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
      <div class="header-titles">
        <span class="brand" data-testid="concon-brand">ConCon<span class="brand-dot">.</span></span>
      </div>
      <div class="header-actions">
        <button class="mode-chip" data-testid="mode-chip" title="vigilance mode — tap to change" aria-label="vigilance mode">
          <span class="mode-chip-label" data-testid="mode-chip-label">balanced</span>
        </button>
        <button class="help-btn" data-testid="help-btn" title="what is this?" aria-label="what is this?">?</button>
        <button class="collapse-toggle" data-testid="collapse-toggle" title="collapse panel" aria-label="collapse panel">&rsaquo;</button>
      </div>
    </div>
    <div class="rail" data-testid="concon-rail">
      <button class="collapse-toggle" data-testid="expand-toggle" title="expand panel" aria-label="expand panel">&lsaquo;</button>
      <span class="rail-brand">CONCON</span>
      <span class="rail-count"><span class="n" data-testid="rail-entry-count">0</span> LEDGER</span>
      <div class="rail-dot" data-testid="rail-pending-indicator" style="display:none"></div>
    </div>
    <div class="toolbar">
      <div class="toolbar-row">
        <div class="status" data-testid="concon-status">
          <span class="count" data-testid="turn-count">0</span> turns ·
          <span class="count" data-testid="entry-count">0</span> in ledger<span class="topic-suffix" data-testid="topic-suffix" style="display:none"> · <span class="count" data-testid="topic-count">0</span> topics</span>
        </div>
        <div class="view-toggle hidden" data-testid="view-toggle" role="tablist">
          <button data-view="chronological" class="active" data-testid="view-chronological-btn">chrono</button>
          <button data-view="topic" data-testid="view-topic-btn">topic</button>
        </div>
        <button class="check-btn" data-testid="check-btn" title="run a state-integrity check">check</button>
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
        <p><strong>Watching this conversation for drift.</strong></p>
        <p>When you or ChatGPT commit to something, it lands here as a proposed entry. You decide what actually counts:</p>
        <ul>
          <li><strong>Confirm</strong> — lock it into the shared record.</li>
          <li><strong>Contest</strong> — flag it as wrong or unwanted.</li>
        </ul>
        <p>Everything stays on your device. Tap the <span class="k">?</span> above for more.</p>
      </div>
    </div>
    <div class="overlay" data-testid="help-overlay">
      <div class="overlay-card" data-testid="overlay-card">
        <!-- Content is written by openHelp() / openModePicker(). -->
      </div>
    </div>
    <div class="footer" data-testid="concon-footer">local · offline · no telemetry</div>
  `;
  shadowRoot.appendChild(root);

  // Wire collapse/expand toggles.
  const collapseHandler = () => {
    if (callbacks.onToggleCollapse) callbacks.onToggleCollapse();
  };
  const collapseBtn = root.querySelector('[data-testid="collapse-toggle"]');
  const expandBtn = root.querySelector('[data-testid="expand-toggle"]');
  if (collapseBtn) collapseBtn.addEventListener('click', collapseHandler);
  if (expandBtn) expandBtn.addEventListener('click', collapseHandler);

  // Overlay controller. Two content modes:
  //   'help'    — the four-concept explainer + privacy blurb + "got it".
  //   'picker'  — mandatory vigilance mode selection. Cannot be dismissed
  //               without picking; there is no × or backdrop-close.
  const overlay = root.querySelector('[data-testid="help-overlay"]');
  const overlayCard = root.querySelector('[data-testid="overlay-card"]');
  const helpBtn = root.querySelector('[data-testid="help-btn"]');
  const modeChip = root.querySelector('[data-testid="mode-chip"]');
  const modeChipLabel = root.querySelector('[data-testid="mode-chip-label"]');

  // The panel has a getCurrentConversationId() callback so it knows which
  // conversation to save a per-conversation vigilance override to.
  const getConvId = () => (callbacks.getConversationId?.() || null);

  const setChipTo = (mode) => {
    if (modeChip) modeChip.setAttribute('data-mode', mode);
    if (modeChipLabel) modeChipLabel.textContent = mode;
  };

  const openHelp = () => {
    if (!overlay || !overlayCard) return;
    overlayCard.innerHTML = HELP_HTML;
    overlay.classList.add('visible');
    overlay.setAttribute('data-mode', 'help');
  };

  const openModePicker = ({ mandatory = false, firstRun = false } = {}) => {
    if (!overlay || !overlayCard) return;
    const currentMode = getEffectiveVigilance(getConvId());
    overlayCard.innerHTML = pickerHtml({ mandatory, firstRun, currentMode });
    overlay.classList.add('visible');
    overlay.setAttribute('data-mode', mandatory ? 'picker-mandatory' : 'picker');
  };

  const closeOverlay = () => {
    if (overlay) overlay.classList.remove('visible');
  };

  // The overlay-card is regenerated on each open, so click handling has
  // to be delegated to the overlay itself.
  overlay?.addEventListener('click', (ev) => {
    if (ev.target === overlay) {
      // Backdrop click — only closes if the overlay is not mandatory.
      if (overlay.getAttribute('data-mode') === 'picker-mandatory') return;
      closeOverlay();
      return;
    }
    const helpClose = ev.target.closest('[data-testid="help-close-btn"]');
    if (helpClose) {
      closeOverlay();
      return;
    }
    const modeOption = ev.target.closest('[data-mode-option]');
    if (modeOption) {
      const mode = modeOption.getAttribute('data-mode-option');
      const convId = getConvId();
      // First-run pick sets global default; per-conversation picks after
      // first run only set the per-conversation override.
      if (!hasPickedFTU()) {
        setGlobalVigilance(mode);
        markFTUPicked();
      } else if (convId) {
        setConversationVigilance(convId, mode);
      } else {
        setGlobalVigilance(mode);
      }
      setChipTo(mode);
      closeOverlay();
      if (callbacks.onVigilanceChange) callbacks.onVigilanceChange(mode);
      return;
    }
  });

  // Escape closes the overlay unless it's mandatory.
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!overlay?.classList.contains('visible')) return;
    if (overlay.getAttribute('data-mode') === 'picker-mandatory') return;
    closeOverlay();
  });

  if (helpBtn) helpBtn.addEventListener('click', openHelp);
  if (modeChip) modeChip.addEventListener('click', () => openModePicker({ mandatory: false }));

  // Initialise chip to current effective mode.
  setChipTo(getEffectiveVigilance(getConvId()));

  // Expose a chip-refresher on the callbacks object so mount.js can sync
  // it when the current conversation changes (per-conversation override
  // may differ from the global default).
  callbacks._refreshChip = () => setChipTo(getEffectiveVigilance(getConvId()));
  callbacks._openModePicker = openModePicker;

  // First run: fire the mandatory mode picker once per install.
  if (!hasPickedFTU()) {
    setTimeout(() => openModePicker({ mandatory: true, firstRun: true }), 400);
  }

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

  // CHECK button — open the state-integrity report view.
  const checkBtn = root.querySelector('[data-testid="check-btn"]');
  if (checkBtn) checkBtn.addEventListener('click', () => {
    reportOpen = true;
    if (callbacks.onOpenCheck) callbacks.onOpenCheck();
  });

  // Delegated click handlers for entries: action buttons + click-to-jump.
  const body = root.querySelector('[data-testid="ledger-body"]');
  body.addEventListener('click', (ev) => {
    // Report "back" button — return to the ledger view.
    const backBtn = ev.target.closest('[data-testid="report-back-btn"]');
    if (backBtn) {
      reportOpen = false;
      if (callbacks.onCloseCheck) callbacks.onCloseCheck();
      return;
    }
    // Report "share" button — copy the current report as Markdown.
    // User-initiated. Nothing leaves the device except via the user's
    // own paste action. Doctrine intact.
    const shareBtn = ev.target.closest('[data-testid="report-share-btn"]');
    if (shareBtn) {
      const md = formatReportAsMarkdown(lastReport, {
        url: (typeof location !== 'undefined' && location.href) || null,
      });
      copyToClipboard(md).then((ok) => {
        shareBtn.classList.add('copied');
        shareBtn.textContent = ok ? 'copied' : 'copy failed';
        setTimeout(() => {
          shareBtn.classList.remove('copied');
          shareBtn.textContent = 'share';
        }, 1600);
      });
      return;
    }
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
// Static overlay HTML — help panel + vigilance mode picker.
// -----------------------------------------------------------------------------

const HELP_HTML = `
  <h4 data-testid="help-title">What ConCon does</h4>
  <p>ConCon is a ledger of what you and ChatGPT have actually agreed to in this conversation. It reads each turn as it appears and pulls out commitment-shaped statements. You decide what counts.</p>

  <h5>Four concepts</h5>
  <ul>
    <li><strong>Commitment</strong> — something you or the assistant said would happen. "I'll ship it Friday." "Add retry logic."</li>
    <li><strong>Confirm</strong> — you lock it into the shared record. The assistant can rely on it in later turns.</li>
    <li><strong>Contest</strong> — you flag it as wrong or unwanted. The record shows the disagreement.</li>
    <li><strong>Drift</strong> — the assistant assumes something you never confirmed. Coming soon: colored markers on the chat itself so you can spot it while scrolling.</li>
  </ul>

  <h5>Vigilance modes</h5>
  <p>Set how much scrutiny you want per conversation via the mode chip in the header. Trust auto-confirms firm commitments, Balanced auto-confirms only unhedged ones, Wary requires a tap for everything. You can always contest an entry regardless of mode.</p>

  <h5>Where your data lives</h5>
  <p>On this device only. ConCon stores observed turns and your ledger in your browser (IndexedDB) so both survive a refresh. Nothing is sent to ConCon, OpenAI, or any external service. There are no accounts, no telemetry, no API calls. To wipe everything, clear the extension's site data or uninstall it.</p>

  <div class="overlay-actions">
    <button class="overlay-btn" data-testid="help-close-btn">got it</button>
  </div>
`;

const MODE_META = {
  trust: {
    label: 'Trust',
    desc: 'Watch quietly. Firm commitments auto-confirm; the tool never interrupts. You can still contest anything after the fact.',
  },
  balanced: {
    label: 'Balanced',
    desc: 'Default. Firm unhedged commitments auto-confirm; hedged or ambiguous entries wait for your tap.',
  },
  wary: {
    label: 'Wary',
    desc: 'High-stakes. Every entry waits for your tap. Divergence alerts fire when the assistant references something you never confirmed. (Alerts land in a later release.)',
  },
};

function pickerHtml({ mandatory = false, firstRun = false, currentMode = 'balanced' } = {}) {
  const title = firstRun
    ? 'Welcome. Pick a vigilance mode to start.'
    : (mandatory ? 'Pick a vigilance mode' : 'Vigilance mode');
  const preamble = firstRun
    ? `<p>Your choice of mode is itself an act of ratification — it tells the tool how much tapping you want to do. You can change this later per conversation via the mode chip in the header.</p>`
    : `<p>This choice applies to <em>this conversation</em>. Your global default stays unchanged.</p>`;
  const options = VIGILANCE_MODES.map((m) => {
    const selected = m === currentMode ? ' selected' : '';
    const meta = MODE_META[m];
    return `
      <button class="mode-option${selected}" data-mode-option="${m}" data-testid="mode-option-${m}">
        <div class="mode-option-title">${meta.label}</div>
        <div class="mode-option-desc">${meta.desc}</div>
      </button>
    `;
  }).join('');
  return `
    <h4 data-testid="picker-title">${title}</h4>
    ${preamble}
    <div class="mode-picker" data-testid="mode-picker" role="radiogroup">${options}</div>
    <div class="mode-hint">Tap an option to select and continue.</div>
  `;
}

// -----------------------------------------------------------------------------
// Update — called on every store event.
// -----------------------------------------------------------------------------

// Whether the panel is currently showing the ConCon Check report instead
// of the ledger. Module-level because the panel is re-rendered on every
// store event and we want the report to persist across those renders
// until the user explicitly returns to the ledger.
let reportOpen = false;
// The most recent report object, kept so the share button can serialise
// it without re-running the check.
let lastReport = null;

export function isReportOpen() { return reportOpen; }

export function updatePanel(shadowRoot, { conversation, viewMode = 'chronological', searchQuery = '', collapsed = false } = {}) {
  if (!shadowRoot) return;
  const { messages = [], outline = null, ledger = null } = conversation || {};
  const turnCount = messages.length;
  const topicCount = outline?.topics?.length || 0;
  const entryCount = ledger?.entries?.length || 0;

  // Root collapsed class + rail metrics.
  const rootEl = shadowRoot.querySelector('[data-testid="concon-panel"]');
  if (rootEl) rootEl.classList.toggle('collapsed', !!collapsed);
  const railEntryCount = shadowRoot.querySelector('[data-testid="rail-entry-count"]');
  if (railEntryCount) railEntryCount.textContent = String(entryCount);
  const railDot = shadowRoot.querySelector('[data-testid="rail-pending-indicator"]');
  if (railDot) {
    const pending = (ledger?.entries || []).some(
      (e) => e.state === 'proposed' || e.state === 'asserted'
    );
    railDot.style.display = pending ? 'block' : 'none';
  }

  const t = shadowRoot.querySelector('[data-testid="turn-count"]');
  const p = shadowRoot.querySelector('[data-testid="topic-count"]');
  const e = shadowRoot.querySelector('[data-testid="entry-count"]');
  if (t) t.textContent = String(turnCount);
  if (p) p.textContent = String(topicCount);
  if (e) e.textContent = String(entryCount);

  // Topic-count suffix appears only once there are 2+ topics; before that
  // the counter is noise. Same for the view toggle — no point offering
  // "chrono / topic" until there's actual topic diversity to organise.
  const topicSuffix = shadowRoot.querySelector('[data-testid="topic-suffix"]');
  if (topicSuffix) topicSuffix.style.display = topicCount >= 2 ? '' : 'none';
  const viewToggle = shadowRoot.querySelector('[data-testid="view-toggle"]');
  if (viewToggle) viewToggle.classList.toggle('hidden', !(entryCount > 0 && topicCount >= 2));

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

  // Report view — replaces the ledger while the user is running a Check.
  if (reportOpen) {
    const report = runCheck({
      messages,
      ledger,
      outline,
      // Coverage detection is honest-scope for v0: we cannot verify we
      // observed the entire conversation (ChatGPT virtualizes long chats
      // and only rendered turns hit our MutationObserver). Report 'unknown'
      // until we build proper coverage detection.
      coverage: 'unknown',
    });
    lastReport = report;
    body.innerHTML = renderReport(report);
    return;
  }

  // Empty state.
  if (!ledger || ledger.entries.length === 0) {
    body.innerHTML = `
      <div class="empty" data-testid="ledger-empty">
        <p><strong>Watching this conversation for drift.</strong></p>
        <p>When you or ChatGPT commit to something, it lands here as a proposed entry. You decide what actually counts:</p>
        <ul>
          <li><strong>Confirm</strong> — lock it into the shared record.</li>
          <li><strong>Contest</strong> — flag it as wrong or unwanted.</li>
        </ul>
        <p>Everything stays on your device. Tap the <span class="k">?</span> above for more.</p>
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
        <p>No ledger entries match this search.</p>
        <p>The counter above shows how many plain mentions appear in the transcript. Those live outside the ledger — the ledger only holds commitment-shaped statements.</p>
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
  const isResolvedAffirm = !!labelSet.resolvedAffirm;
  const isResolvedNeg = !!labelSet.resolvedNeg;
  const classes = [
    'entry',
    `role-${role}`,
    isInferred ? 'inferred' : '',
    isResolvedAffirm ? 'resolved-affirm' : '',
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
// ConCon Check report rendering.
// -----------------------------------------------------------------------------

const FINDING_LABELS = {
  'stale-open':             'stale (unresolved for 5+ turns)',
  'unresolved-human':       'your proposal — awaiting your ratification',
  'unresolved-assistant':   'assistant assertion — awaiting your response',
  'contested':              'contested — recorded disagreement',
};

function renderReport(report) {
  const headline = formatStatusHeadline(report);
  const cls = `status-${report.status}`;
  // Local-time timestamp for the on-screen header. Formatted long-form so
  // it reads cleanly in screenshots. The Markdown export uses ISO-8601
  // separately for cross-timezone portability.
  const now = new Date();
  const timeLabel = now.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const scopeNote = `
    <div class="report-scope-note" data-testid="report-scope-note">
      This is a state-integrity audit — a report of what the ledger already
      knows. It does not yet reason about semantic drift between what the
      assistant asserted and what you confirmed. Referent binding and
      automatic divergence detection ship in a later phase; until then,
      a "clean" report means <em>administratively</em> clean, not
      <em>semantically</em> aligned.
    </div>
  `;

  const partialNote = report.status === 'partial' ? `
    <p>Coverage is <strong>${esc(report.coverage)}</strong>. ChatGPT
    virtualizes long conversations — the extension may only have observed
    the currently rendered section. Scroll through the full chat before
    trusting a green result.</p>
  ` : '';

  const counts = `
    <div class="report-counts" data-testid="report-counts">
      <div><span class="n">${report.turnCount}</span> turns observed</div>
      <div><span class="n">${report.confirmedCount}</span> confirmed</div>
      <div><span class="n">${report.unresolvedCount}</span> unresolved</div>
      <div><span class="n">${report.staleOpenCount}</span> stale</div>
      <div><span class="n">${report.contestedCount}</span> contested</div>
      <div><span class="n">${report.hedgedCount}</span> hedged</div>
    </div>
  `;

  const findingsHtml = report.findings.length === 0 ? `
    <div class="report-empty" data-testid="report-empty">
      Nothing outstanding. Every observed commitment or assertion has been
      resolved.
    </div>
  ` : report.findings.map(renderFinding).join('');

  return `
    <div class="report" data-testid="report">
      <div class="report-topbar">
        <button class="report-back" data-testid="report-back-btn" aria-label="back to ledger">&lsaquo; back to ledger</button>
        <button class="report-share" data-testid="report-share-btn" aria-label="copy report as markdown" title="copy report as markdown">share</button>
      </div>
      <div class="report-headline ${cls}" data-testid="report-headline">
        <div class="report-status" data-testid="report-status">${esc(headline)}</div>
        <div class="report-timestamp" data-testid="report-timestamp">run at ${esc(timeLabel)}</div>
        ${partialNote}
      </div>
      ${counts}
      <div class="report-h5">Findings</div>
      ${findingsHtml}
      ${scopeNote}
    </div>
  `;
}

function renderFinding(f) {
  const kindLabel = FINDING_LABELS[f.kind] || f.kind;
  const ageLabel = f.ageInTurns === 0 ? 'this turn' : `${f.ageInTurns} turn${f.ageInTurns === 1 ? '' : 's'} ago`;
  return `
    <div class="finding" data-testid="finding" data-jump-target="${esc(f.sourceMessageId)}">
      <div class="finding-meta">
        <span class="finding-kind kind-${esc(f.kind)}">${esc(kindLabel)}</span>
        <span class="finding-age">${esc(ageLabel)}</span>
      </div>
      <div class="finding-body">${esc(f.sentence)}${f.hedged ? '<span class="finding-hedge">(hedged)</span>' : ''}</div>
    </div>
  `;
}

// Clipboard writer with a textarea fallback for contexts where the async
// Clipboard API is blocked (e.g. certain shadow-DOM/focus edge cases).
// Everything happens in the page's own process — nothing crosses to
// ConCon; there is no ConCon endpoint to cross to.
async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
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
