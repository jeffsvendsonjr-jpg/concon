// Dev harness — mounts ConCon against a mock ChatGPT DOM.
//
// Loads the real extension modules from ../extension/src/ so the harness
// exercises the same code Chrome will run. No chrome.* APIs are touched;
// bootstrap.js is the only file that talks to chrome.*, and this harness
// invokes mount() directly.

import { mount } from '../extension/src/content/mount.js';
import { _resetStore } from '../extension/src/core/store.js';

// A fixture designed to exercise commitment extraction, topic segmentation,
// and the ledger UI. Contains explicit commitment cues (let's, we should,
// I'll, the plan is), definite assertions, one hedge, one shift cue.
const FIXTURE = [
  { role: 'user',      text: "Let's target Chrome MV3 for the extension." },
  { role: 'assistant', text: "MV3 is a good choice for our constraints. I'll draft the manifest first." },
  { role: 'user',      text: "We should skip Firefox for the v0.1 milestone." },
  { role: 'assistant', text: "The plan is to target Chrome MV3 only. Firefox is deferred to v0.2." },
  { role: 'user',      text: "What about the local model? I'm on the fence." },
  { role: 'assistant', text: "I'll bundle a small NLI classifier. transformers.js is the right runtime." },
  { role: 'user',      text: "Switching gears — let's design the ledger UI with dedicated confirm buttons." },
  { role: 'assistant', text: "Dedicated buttons are the correct choice. I'll wire the callbacks tomorrow." },
];

function fakeConversationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function ensureConversationUrl() {
  if (!/\/c\//.test(location.pathname)) {
    const id = fakeConversationId();
    history.pushState({}, '', `/c/${id}`);
  }
}

const chatRoot = document.getElementById('chat-root');
let turnCounter = 0;

function addTurn({ role, text }) {
  turnCounter += 1;
  const empty = chatRoot.querySelector('.empty-state');
  if (empty) empty.remove();
  const article = document.createElement('article');
  article.setAttribute('data-testid', `conversation-turn-${turnCounter}`);
  const roleLabel = document.createElement('div');
  roleLabel.className = 'role';
  roleLabel.textContent = role;
  const msgContainer = document.createElement('div');
  msgContainer.setAttribute('data-message-id', crypto.randomUUID());
  msgContainer.setAttribute('data-message-author-role', role);
  msgContainer.textContent = text;
  article.appendChild(roleLabel);
  article.appendChild(msgContainer);
  chatRoot.appendChild(article);
  return msgContainer;
}

function currentConversationId() {
  const m = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return m ? m[1] : null;
}

function refreshPanelCounts() {
  // No-op in step 4 — the panel now subscribes to store events directly
  // via mount.js and re-renders itself. Kept as a stub for backward compat
  // with any inline calls in the harness controls.
}

async function loadFixture() {
  for (const turn of FIXTURE) {
    addTurn(turn);
    // Give the observer's stability window (750ms) time to fire.
    await new Promise((r) => setTimeout(r, 850));
    refreshPanelCounts();
  }
}

async function streamNext() {
  const idx = turnCounter % FIXTURE.length;
  const turn = FIXTURE[idx];
  const container = addTurn({ role: turn.role, text: '' });
  for (const ch of turn.text) {
    container.textContent += ch;
    await new Promise((r) => setTimeout(r, 18));
  }
  await new Promise((r) => setTimeout(r, 850));
  refreshPanelCounts();
}

function regenerate() {
  const last = chatRoot.querySelector('article:last-of-type [data-message-id]');
  if (!last) return;
  last.setAttribute('data-message-id', crypto.randomUUID());
  last.textContent = `${last.textContent} [regenerated]`;
  setTimeout(refreshPanelCounts, 900);
}

function reset() {
  chatRoot.innerHTML = '<div class="empty-state" data-testid="empty-state">Click "Load fixture" to start a mock conversation.</div>';
  turnCounter = 0;
  _resetStore();
  const host = document.getElementById('concon-panel-host');
  if (host) host.remove();
  const newId = fakeConversationId();
  history.replaceState({}, '', `/c/${newId}`);
  mount();
}

ensureConversationUrl();
mount();

document.getElementById('load-fixture').addEventListener('click', loadFixture);
document.getElementById('stream-next').addEventListener('click', streamNext);
document.getElementById('regenerate').addEventListener('click', regenerate);
document.getElementById('reset').addEventListener('click', reset);
