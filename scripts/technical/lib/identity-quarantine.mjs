/* =========================================================================
   VISION UNIVERSE TECHNICAL — lib/identity-quarantine.mjs
   Belegte Ticker-Wiederverwendungen (quant/config/ticker-reuse-quarantine.json)

   Unter 13 Tickern handelt heute ein ETF, waehrend Name, Stamm und securityId
   noch das alte Unternehmen beschreiben (IDENTITY_QUARANTINED). Technical darf
   diese Titel nicht unter der falschen Identitaet zeigen: Screener und
   Technical Intelligence lassen sie aus und zaehlen sie.

   Keine eigene Identitaets- oder Registerlogik: Laden und Pruefen uebernimmt
   scripts/market/universe-source.mjs#loadTickerReuseQuarantine (dieselbe
   Quelle wie das Produktuniversum), die securityId kommt aus core/identity.js.
   Fehlt die Datei, wird nichts ausgelassen; ist sie fehlerhaft, bricht der
   Bau ab (wie die Aufloesung des Produktuniversums).
   ========================================================================= */
import { loadTickerReuseQuarantine } from "../../market/universe-source.mjs";

export const QUARANTINE_REASON = "IDENTITY_QUARANTINED";

/** Register lesen -> { file, sha256, ids: Set<securityId>, has(securityId) }. */
export function loadIdentityQuarantine(root) {
  const q = loadTickerReuseQuarantine(root);
  const ids = new Set(q ? q.records.keys() : []);
  return { file: q ? q.file : null, sha256: q ? q.sha256 : null, ids, has: (securityId) => ids.has(securityId) };
}
