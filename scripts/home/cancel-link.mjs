// Kuendigungslink im Footer der Startseite (§ 312k BGB, "Verträge hier kündigen").
// Erscheint erst, wenn Konten freigeschaltet sind: einziger Schalter ist der
// Endpunkt in konto/config.js (leer = Konten aus, kein Link). Steht unauffaellig
// in der bestehenden Spalte "Rechtliches"; die Menuestruktur bleibt unveraendert.
import { runInNewContext } from 'node:vm';

export function accountsEnabled(configSource) {
  const ctx = {}; ctx.globalThis = ctx;
  runInNewContext(configSource, ctx);
  return /^https:\/\/[a-z0-9.-]+$/.test(String(ctx.VU_ACCOUNT_CONFIG?.endpoint || ''));
}

// Wird unmittelbar hinter dem letzten Eintrag eingesetzt; ohne Konten leer, damit
// /index.html Byte fuer Byte gleich bleibt.
export function cancelLinkItem(configSource) {
  return accountsEnabled(configSource) ? '\n        <li><a href="/konto/kuendigen/">Verträge hier kündigen</a></li>' : '';
}
