// Konfiguration der App. Nur OEFFENTLICHE Werte; keine Schluessel, die etwas freischalten.
// supabaseUrl/supabasePublishableKey: oeffentlich (der Publishable Key erlaubt nur, was RLS zulaesst).
// Beide setzt `npm run build:www` aus der Umgebung in www/js/runtime-config.js (nicht eingecheckt); im Repository bleiben sie leer.
// KEIN Service-/Secret-Key, KEIN Stripe-Schluessel, KEIN Store-Schluessel gehoert in diese Datei.
export const DEFAULT_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: '',
  accountApi: 'https://konto.visionuniverse.de',
  contentOrigin: 'https://research.visionuniverse.de',
  // 'supabase': direkt bei Supabase Auth (Stand heute, braucht den Publishable Key in der App).
  // 'worker':   ueber die Konto-API (/v1/auth/app/*): gleiches Tempolimit wie im Web, kein Supabase-Schluessel in der App.
  //             Der Worker-Teil ist ein VORSCHLAG (docs/mobile/SECURITY_LOGIN.md), noch nicht vorhanden.
  authTransport: 'supabase',
  refreshMarginSeconds: 60,
});

export function readConfig(globalObject = globalThis) {
  const o = globalObject.VU_APP_CONFIG || {};
  const cfg = {...DEFAULT_CONFIG};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (o[k] !== undefined && o[k] !== '') cfg[k] = o[k];
  for (const k of ['supabaseUrl', 'accountApi', 'contentOrigin']) cfg[k] = String(cfg[k] || '').replace(/\/+$/, '');
  if (!['supabase', 'worker'].includes(cfg.authTransport)) cfg.authTransport = 'supabase';
  cfg.configured = cfg.authTransport === 'worker' ? Boolean(cfg.accountApi) : Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey);
  return cfg;
}
