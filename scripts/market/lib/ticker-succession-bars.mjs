/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/ticker-succession-bars.mjs

   TICKERWECHSEL IN DEN KURSREIHEN (ADR-009, Marktdaten-Domaene)

   Fuer einen Titel, der im Register quant/config/ticker-successions.json als
   Nachfolger steht, verbinden Discover-Reihe und Wochenreihe die gespeicherten
   Bars des Vorgaengers (vor dem Stichtag) mit den eigenen (ab dem Stichtag).
   Gelesen wird nur; der Speicher beider IDs bleibt unberuehrt. Ohne Eintrag
   kommt die Nutzlast unveraendert zurueck (dasselbe Objekt).
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Register laden und pruefen (fail closed ueber core/ticker-succession.js). */
export function loadSuccessions(root) {
  const TS = require(join(root, "core", "ticker-succession.js"));
  const doc = JSON.parse(readFileSync(join(root, "quant", "config", "ticker-successions.json"), "utf8"));
  return { TS, map: TS.tickerSuccessions(doc) };
}

/**
 * Verbindet die Nutzlast eines Nachfolgers mit der seines Vorgaengers.
 * @param {object|null} payload      Nutzlast des Titels ({ bars: [...] }) oder null
 * @param {object} security          { securityId, ticker }
 * @param {object} succ              Ergebnis von loadSuccessions
 * @param {(entry) => object|null} readPredecessor  liefert die Vorgaenger-Nutzlast
 * @param {{ relabel?: boolean }} [opts]  relabel: Vorgaenger-Bars tragen danach die securityId des Nachfolgers (dasselbe
 *        Wertpapier unter neuem Kuerzel), und die Nutzlast nennt Nachfolger-ID und -Ticker. Fuer Leser, die jede Bar
 *        gegen die eigene ID pruefen (Technical-Materialisierung).
 * @returns {{ payload: object|null, joined: object|null }}
 */
export function withPredecessor(payload, security, succ, readPredecessor, opts = {}) {
  const entry = succ.TS.predecessorOf(security.securityId, succ.map);
  if (!entry) return { payload, joined: null };
  const pred = readPredecessor(entry);
  if (!pred || !Array.isArray(pred.bars) || !pred.bars.length) return { payload, joined: { from: entry.from, predecessorBars: 0 } };
  const predBars = opts.relabel ? pred.bars.map((b) => ("securityId" in b ? { ...b, securityId: security.securityId } : b)) : pred.bars;
  const j = succ.TS.joinBars(predBars, (payload && payload.bars) || [], entry.effective);
  const base = payload || pred;
  const ident = opts.relabel ? { securityId: security.securityId, ticker: security.ticker } : {};
  return { payload: { ...base, ...ident, bars: j.bars },
           joined: { from: entry.from, effective: entry.effective, predecessorBars: j.predecessorBars, successorBars: j.successorBars,
                     lastPredecessor: j.lastPredecessor, firstSuccessor: j.firstSuccessor } };
}
