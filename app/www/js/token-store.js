// Ablage der Sitzung. Regel: KEIN localStorage, KEIN sessionStorage, KEIN Cookie fuer Token.
//  - nativ:  iOS Keychain (Android Keystore) ueber @aparajita/capacitor-secure-storage
//  - Browser (nur Entwicklung/Test): nur im Arbeitsspeicher, geht beim Neuladen verloren
// Gespeichert wird genau ein Eintrag: {accessToken, refreshToken, expiresAt(ms), user:{id,email}}.
const KEY = 'vu.session.v1';

export function memoryStore() {
  let value = null;
  return {kind: 'memory', async get() { return value; }, async set(v) { value = v; }, async clear() { value = null; }};
}

// access: Keychain-Zugriffsklasse. Vorgabe: nur bei entsperrtem Geraet, nur dieses Geraet (kein iCloud-Abgleich, kein Backup-Transfer).
export function secureStore(plugin, {access} = {}) {
  return {
    kind: 'keychain',
    async get() {
      const raw = await plugin.get(KEY, false).catch(() => null); // false: nicht als JSON parsen, Fehler = keine Sitzung
      if (!raw || typeof raw !== 'string') return null;
      try { const v = JSON.parse(raw); return v && typeof v.refreshToken === 'string' ? v : null; } catch { return null; }
    },
    async set(v) { await plugin.set(KEY, JSON.stringify(v), false, false, access); },
    async clear() { await plugin.remove(KEY).catch(() => {}); },
  };
}

// Waehlt den Speicher. Ohne native Plattform bleibt es der Arbeitsspeicher.
export function pickStore(globalObject = globalThis) {
  const native = globalObject.VUNative;   // gesetzt von www/vendor/native.js (nur nativ)
  if (globalObject.Capacitor?.isNativePlatform?.() && native?.SecureStorage) {
    return secureStore(native.SecureStorage, {access: native.KeychainAccess?.whenUnlockedThisDeviceOnly});
  }
  return memoryStore();
}
