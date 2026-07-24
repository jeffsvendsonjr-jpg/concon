// In-memory conversation store + debounced IndexedDB persistence + tiny event bus.
//
// The store is the source of truth for which messages exist. ChatGPT's DOM
// virtualizes scroll and unmounts off-screen turns, so we cannot ask the DOM
// what exists — we must have kept it.
//
// IndexedDB persistence is per-conversationId. In non-browser contexts
// (Node tests), the indexedDB global is absent and persistence is skipped.

import { makeMessageRecord } from './message-model.js';
import { updateOutline } from './outline.js';
import { updateLedger, transitionEntry } from './ledger.js';

const state = {
  // conversationId → { messages: Map<messageId, MessageRecord>, order: number, outline: OutlineState|null }
  byConversation: new Map(),
};

const PERSIST_DEBOUNCE_MS = 500;
let persistTimer = null;

function getConv(conversationId) {
  let c = state.byConversation.get(conversationId);
  if (!c) {
    c = { messages: new Map(), order: 0, outline: null, ledger: null };
    state.byConversation.set(conversationId, c);
  }
  return c;
}

export function ingest({ conversationId, id, role, text, observedAt }) {
  const conv = getConv(conversationId);
  const existing = conv.messages.get(id);
  if (existing) {
    if (existing.text === text) return existing;
    existing.text = text;
    existing.observedAt = observedAt ?? existing.observedAt;
  } else {
    const rec = makeMessageRecord({
      id,
      conversationId,
      role,
      text,
      observedAt,
      order: ++conv.order,
    });
    conv.messages.set(id, rec);
  }
  conv.outline = updateOutline(conv.outline, Array.from(conv.messages.values()));
  conv.ledger = updateLedger(conv.ledger, Array.from(conv.messages.values()));
  schedulePersist();
  emit('turn:updated', { conversationId, id });
  return conv.messages.get(id);
}

export function transitionLedgerEntry(conversationId, entryId, newState) {
  const conv = getConv(conversationId);
  const next = transitionEntry(conv.ledger, entryId, newState);
  if (next !== conv.ledger) {
    conv.ledger = next;
    schedulePersist();
    emit('ledger:updated', { conversationId, entryId, newState });
  }
  return conv.ledger;
}

export function getConversation(conversationId) {
  const conv = getConv(conversationId);
  return {
    messages: Array.from(conv.messages.values()).sort((a, b) => a.order - b.order),
    outline: conv.outline,
    ledger: conv.ledger,
  };
}

// ---------- persistence ----------

const DB_NAME = 'concon';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'conversationId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function schedulePersist() {
  if (!hasIndexedDB()) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistAll, PERSIST_DEBOUNCE_MS);
}

async function persistAll() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const os = tx.objectStore(STORE_NAME);
    for (const [conversationId, conv] of state.byConversation.entries()) {
      os.put({
        conversationId,
        messages: Array.from(conv.messages.values()),
        outline: conv.outline,
        ledger: conv.ledger,
        updatedAt: Date.now(),
      });
    }
    await new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.error('[ConCon] persist failed:', err);
  }
}

export async function loadConversation(conversationId) {
  if (!hasIndexedDB()) return null;
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(conversationId);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return res(null);
        const conv = getConv(conversationId);
        for (const m of row.messages) conv.messages.set(m.id, m);
        conv.outline = row.outline || null;
        conv.order = Math.max(0, ...row.messages.map((m) => m.order || 0));
        res(row);
      };
      req.onerror = () => rej(req.error);
    });
  } catch (err) {
    console.error('[ConCon] load failed:', err);
    return null;
  }
}

// ---------- events ----------

const listeners = new Map();

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);
}

function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(payload);
    } catch (err) {
      console.error('[ConCon] listener error:', err);
    }
  }
}

// ---------- test helpers ----------

export function _resetStore() {
  state.byConversation.clear();
  listeners.clear();
  clearTimeout(persistTimer);
  persistTimer = null;
}
