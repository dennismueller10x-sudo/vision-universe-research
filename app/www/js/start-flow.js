// Startablauf der Shell (Strang AA): erst die Sitzung klaeren, dann die erste Ansicht waehlen.
// Ohne gueltige Sitzung in der App kommt zuerst die native Anmeldemaske (das "Tor"); mit Sitzung (Face ID/Keychain) die Willkommensseite.
// Die Website im Rahmen wird erst danach geladen, damit nie zuerst eine Web-Anmeldeseite zu sehen ist.

// Capacitor setzt appendUserAgent "VUApp/1" (capacitor.config.json): auch ohne Capacitor-Global gilt das als App.
export function isNativeApp(g = globalThis) {
  return Boolean(g.Capacitor?.isNativePlatform?.()) || /VUApp\/1/.test(g.navigator?.userAgent || '');
}

export async function startFlow({native, auth, biometricEnabled = false, timeoutMs = 4000}) {
  let timer;
  try {
    // Ohne Biometrie darf ein haengender Speicher den Start nicht blockieren; mit Biometrie werden Pruefung und Refresh abgewartet.
    if (biometricEnabled) await auth.restore({forceRefresh: true});
    else await Promise.race([auth.restore(), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
  } catch { /* ohne gespeicherte Sitzung weiter */ } finally { clearTimeout(timer); }
  const signedIn = auth.state().signedIn;
  const gate = Boolean(native) && !signedIn;
  return {signedIn, gate, view: gate ? 'account' : 'start'};
}
