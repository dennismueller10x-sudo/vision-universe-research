import test from 'node:test';
import assert from 'node:assert/strict';
import {pickStore, secureStore, memoryStore} from '../www/js/token-store.js';

test('Browser/Test: Arbeitsspeicher, nie ein Web-Speicher', async () => {
  const globalObject = {localStorage: {setItem() { throw new Error('localStorage verboten'); }, getItem() { throw new Error('localStorage verboten'); }}};
  const s = pickStore(globalObject);
  assert.equal(s.kind, 'memory');
  await s.set({refreshToken: 'x'}); assert.deepEqual(await s.get(), {refreshToken: 'x'});
  await s.clear(); assert.equal(await s.get(), null);
});

test('nativ mit Plugin: Keychain-Speicher', () => {
  const plugin = {get: async () => null, set: async () => {}, remove: async () => {}};
  const s = pickStore({Capacitor: {isNativePlatform: () => true}, VUNative: {SecureStorage: plugin}});
  assert.equal(s.kind, 'keychain');
});

test('nativ ohne Plugin: faellt NICHT auf Web-Speicher zurueck', () => {
  assert.equal(pickStore({Capacitor: {isNativePlatform: () => true}}).kind, 'memory');
});

test('Keychain-Speicher: Rundlauf, defekte Daten = keine Sitzung', async () => {
  const mem = new Map();
  let usedAccess = null;
  const plugin = {get: async k => mem.get(k) ?? null, set: async (k, v, c, sy, ac) => { usedAccess = ac; mem.set(k, v); }, remove: async k => { mem.delete(k); }};
  const s = secureStore(plugin, {access: 'whenUnlockedThisDeviceOnly'});
  await s.set({refreshToken: 'rt', accessToken: 'at'});
  assert.equal((await s.get()).refreshToken, 'rt');
  assert.equal(usedAccess, 'whenUnlockedThisDeviceOnly');
  mem.set([...mem.keys()][0], '{kaputt');
  assert.equal(await s.get(), null);
  await s.clear(); assert.equal(await s.get(), null);
});
