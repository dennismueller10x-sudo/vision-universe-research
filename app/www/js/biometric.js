// Persistenz und Biometrie bleiben ausschliesslich in nativen Plugins.
// Ohne Opt-in verhaelt sich der Speicher wie vor E4: die Sitzung liegt im Keychain/Keystore und bleibt ueber
// einen Neustart erhalten. Biometrie kommt nur zusaetzlich dazu: mit Opt-in gibt get() die Sitzung erst nach
// erfolgreicher Identitaetspruefung frei. Abschalten loescht nichts, es entfaellt nur die Abfrage.
export function biometricStore({store, plugin, preferences}) {
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
    },
    async get() {
      if (!settings.enabled) return store.get();
      try { await verify(); return await store.get(); }
      catch { return null; } // Abbruch/Sperre: Passwortmaske, keine Sitzung freigeben
    },
    async set(s) { await store.set(s); },
    async clear() { await store.clear(); },
  };
}
export function nativePreferences(native, key) {
  return {
    async get() { try { return JSON.parse(await native.SecureStorage.get(key, false)); } catch { return null; } },
    async set(value) { await native.SecureStorage.set(key, JSON.stringify(value), false, false, native.KeychainAccess?.whenUnlockedThisDeviceOnly); },
  };
}
