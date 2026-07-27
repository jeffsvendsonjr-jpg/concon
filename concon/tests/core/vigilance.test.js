import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, DEFAULT_MODE,
  getGlobalVigilance, setGlobalVigilance,
  getConversationVigilance, setConversationVigilance,
  getEffectiveVigilance,
  hasPickedFTU, markFTUPicked,
  autoStateFor,
} from '../../extension/src/core/vigilance.js';

// Minimal in-memory localStorage shim so the module runs in Node.
function installFakeStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  return store;
}

test('MODES exports the three vigilance modes and Balanced is default', () => {
  assert.deepEqual(MODES, ['trust', 'balanced', 'wary']);
  assert.equal(DEFAULT_MODE, 'balanced');
});

test('getGlobalVigilance defaults to balanced and setGlobal persists', () => {
  installFakeStorage();
  assert.equal(getGlobalVigilance(), 'balanced');
  setGlobalVigilance('wary');
  assert.equal(getGlobalVigilance(), 'wary');
});

test('setGlobalVigilance rejects invalid modes', () => {
  installFakeStorage();
  const ok = setGlobalVigilance('paranoid');
  assert.equal(ok, false);
  assert.equal(getGlobalVigilance(), 'balanced');
});

test('per-conversation vigilance overrides global default', () => {
  installFakeStorage();
  setGlobalVigilance('trust');
  setConversationVigilance('conv-abc', 'wary');
  assert.equal(getEffectiveVigilance('conv-abc'), 'wary');
  assert.equal(getEffectiveVigilance('conv-xyz'), 'trust', 'fall back to global when no per-conv override');
});

test('FTU pick flag is unset by default and set by markFTUPicked', () => {
  installFakeStorage();
  assert.equal(hasPickedFTU(), false);
  markFTUPicked();
  assert.equal(hasPickedFTU(), true);
});

// -------------------- autoStateFor --------------------

const firmUser = { role: 'user', classification: 'commitment', hedged: false };
const hedgedUser = { role: 'user', classification: 'commitment', hedged: true };
const asstStmt = { role: 'assistant', classification: 'statement', hedged: false };

test('trust mode: every extracted entry auto-confirms', () => {
  assert.equal(autoStateFor(firmUser, 'trust'), 'confirmed');
  assert.equal(autoStateFor(hedgedUser, 'trust'), 'confirmed');
  assert.equal(autoStateFor(asstStmt, 'trust'), 'acknowledged');
});

test('balanced mode: only firm unhedged commitments auto-confirm', () => {
  assert.equal(autoStateFor(firmUser, 'balanced'), 'confirmed');
  assert.equal(autoStateFor(hedgedUser, 'balanced'), null, 'hedged stays proposed');
  assert.equal(autoStateFor(asstStmt, 'balanced'), null, 'assistant statement is not a firm commitment');
});

test('wary mode: nothing auto-confirms', () => {
  assert.equal(autoStateFor(firmUser, 'wary'), null);
  assert.equal(autoStateFor(hedgedUser, 'wary'), null);
  assert.equal(autoStateFor(asstStmt, 'wary'), null);
});

test('autoStateFor tolerates undefined mode by falling back to default (balanced)', () => {
  assert.equal(autoStateFor(firmUser, undefined), 'confirmed');
  assert.equal(autoStateFor(hedgedUser, undefined), null);
});
