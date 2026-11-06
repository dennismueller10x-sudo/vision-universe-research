// Persistenz und Biometrie bleiben ausschliesslich in nativen Plugins.
import {memoryStore} from './token-store.js';
export function biometricStore({store, plugin, preferences}) {
  const memory = memoryStore();
  let settings = {};
  const save = () => preferences.set(settings);
  const verify = () => plugin.verifyIdentity({reason: 'Bei Vision Universe anmelden', title: 'Anmeldung',
    subtitle: 'Identität bestätigen', useFallback: false});
  return {
    kind: store.kind,
    async init() { settings = await preferences.get() || {}; },
    async available() { try { return Boolean((await plugin?.isAvailable()).isAvailable); } catch { return false; } },
    enabled: () => settings.enabled === true,
    asked: () => settings.asked === true,
    async choose(enabled) {
      if (enabled) await verify();
      settings = {...settings, asked: true, enabled};
      await save();
      if (enabled) { const s = await memory.get(); if (s) await store.set(s); }
      else await store.clear();
    },
    async get() {
      if (!settings.enabled) { await store.clear(); return memory.get(); }
      try { await verify(); return await store.get(); }
      catch { return null; } // Abbruch/Sperre: Passwortmaske, keine Sitzung freigeben
    },
    async set(s) { await memory.set(s); if (settings.enabled) await store.set(s); },
    async clear() { await memory.clear(); await store.clear(); },
  };
}
export function nativePreferences(native, key) {
  return {
    async get() { try { return JSON.parse(await native.SecureStorage.get(key, false)); } catch { return null; } },
    async set(value) { await native.SecureStorage.set(key, JSON.stringify(value), false, false, native.KeychainAccess?.whenUnlockedThisDeviceOnly); },
  };
}
