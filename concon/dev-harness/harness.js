// Dev harness — mounts ConCon against a mock ChatGPT DOM.
//
// Loads the real extension modules from ../extension/src/ so the harness
// exercises the same code Chrome will run. No chrome.* APIs are touched;
// bootstrap.js is the only file that talks to chrome.*, and this harness
// invokes mount() directly.

import { mount } from '../extension/src/content/mount.js';
import { getConversation, _resetStore } from '../extension/src/core/store.js';
import { updatePanelCounts } from '../extension/src/panel/panel.js';

// A small fixture designed to exercise the segmenter: three distinct topics
// with a shift cue, plus intra-topic follow-ups.
const FIXTURE = [
  { role: 'user',      text: "Let's talk about ShieldVault traction. What's the fastest path to first ten customers?" },
  { role: 'assistant', text: "Warm intros through your beachhead vertical will convert faster than cold outreach." },
  { role: 'user',      text: "ok, go on" },
  { role: 'assistant', text: "Rank prospects by an existing DLP budget and a champion who has felt paste-leak pain." },
  { role: 'user',      text: "Switching gears — I'm thinking about the AI aftermarket. What niches look underserved?" },
  { role: 'assistant', text: "Model-observability and prompt-versioning are hot but crowded. Conversation-audit tooling is genuinely open." },
  { role: 'user',      text: "Different topic: how do I structure equity for a two-cofounder split with staged vesting?" },
  { role: 'assistant', text: "Start 50/50, add a 4-year vest with a 1-year cliff, and make the acceleration triggers explicit." },
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
  const host = document.getElementById('concon-panel-host');
  if (!host?.shadowRoot) return;
  const id = currentConversationId();
  if (!id) return;
  const conv = getConversation(id);
  updatePanelCounts(host.shadowRoot, {
    turnCount: conv.messages.length,
    topicCount: conv.outline?.topics?.length || 0,
  });
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
