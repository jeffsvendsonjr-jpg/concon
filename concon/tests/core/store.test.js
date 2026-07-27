// Guards the P0 ledger-restoration fix in store.loadConversation.
//
// The bug (fixed in v0.3.1): loadConversation() restored `messages` and
// `outline` but not `ledger`. Because ingest() short-circuits on identical
// text, subsequent re-observations of already-saved messages would NOT
// rebuild the ledger — so the panel showed zero entries after every
// reload until a new turn arrived.
//
// Since store.js uses IndexedDB (unavailable in Node), we install a
// minimal in-memory IndexedDB shim that supports just the calls the
// store makes: open → transaction → objectStore → put / get.

import { test } from 'node:test';
import assert from 'node:assert/strict';

function installFakeIDB() {
  const backing = new Map(); // key = conversationId → row

  const makeReq = (executor) => {
    const req = { onsuccess: null, onerror: null, result: undefined, error: null };
    queueMicrotask(() => {
      try {
        req.result = executor();
        req.onsuccess?.();
      } catch (err) {
        req.error = err;
        req.onerror?.();
      }
    });
    return req;
  };

  const store = {
    put: (row) => makeReq(() => { backing.set(row.conversationId, row); return row.conversationId; }),
    get: (id)  => makeReq(() => backing.get(id) || undefined),
  };

  const tx = {
    objectStore: () => store,
    oncomplete: null,
    onerror: null,
  };
  // Fire oncomplete on the next tick after each transaction.
  const wrapTx = () => {
    const t = { ...tx };
    queueMicrotask(() => t.oncomplete?.());
    return t;
  };

  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => wrapTx(),
    createObjectStore: () => store,
  };

  globalThis.indexedDB = {
    open: () => {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
      queueMicrotask(() => { req.onsuccess?.(); });
      return req;
    },
  };
  return backing;
}

test('loadConversation restores the ledger from the persisted row', async () => {
  const backing = installFakeIDB();
  const { _resetStore, ingest, loadConversation, getConversation, transitionLedgerEntry } =
    await import('../../extension/src/core/store.js?fresh=' + Math.random());
  _resetStore();

  // Simulate a first session: user commits, entry is confirmed.
  const cid = 'conv-restore-1';
  ingest({ conversationId: cid, id: 'm1', role: 'user', text: "I will ship the ledger.", observedAt: 1000 });
  await new Promise((r) => setTimeout(r, 20)); // allow ingest chain

  const before = getConversation(cid);
  assert.ok(before.ledger && before.ledger.entries.length === 1, 'first-session ledger populated');
  const entryId = before.ledger.entries[0].id;
  transitionLedgerEntry(cid, entryId, 'confirmed');

  // Flush the debounced persist into our fake IDB.
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(backing.has(cid), 'row was persisted');

  // Reset the in-memory store to simulate a page reload.
  _resetStore();

  // Reload from IDB.
  const row = await loadConversation(cid);
  assert.ok(row, 'load returned a row');

  const after = getConversation(cid);
  assert.equal(after.messages.length, 1, 'messages restored');
  assert.ok(after.ledger, 'ledger restored (not null)');
  assert.equal(after.ledger.entries.length, 1, 'exactly one entry restored');
  assert.equal(after.ledger.entries[0].state, 'confirmed', 'user-set confirmed state preserved');
});

test('loadConversation rebuilds ledger from messages when persisted row lacks one', async () => {
  const backing = installFakeIDB();
  const cid = 'conv-restore-2';

  // Simulate an older persisted row that pre-dates the ledger fix — the
  // stored row has messages+outline but no ledger.
  backing.set(cid, {
    conversationId: cid,
    messages: [
      { id: 'x1', conversationId: cid, role: 'user', text: "I will ship the ledger.", order: 1, observedAt: 1000 },
    ],
    outline: null,
    ledger: null,
    updatedAt: Date.now(),
  });

  const { _resetStore, loadConversation, getConversation } =
    await import('../../extension/src/core/store.js?fresh=' + Math.random());
  _resetStore();

  await loadConversation(cid);
  const after = getConversation(cid);
  assert.ok(after.ledger, 'ledger rebuilt from restored messages');
  assert.equal(after.ledger.entries.length, 1, 'rebuild produced the expected entry');
  assert.equal(after.ledger.entries[0].state, 'proposed', 'rebuilt entry starts as proposed');
});
