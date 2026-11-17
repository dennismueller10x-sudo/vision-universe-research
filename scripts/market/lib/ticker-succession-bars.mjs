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
 * @returns {{ payload: object|null, joined: object|null }}
 */
export function withPredecessor(payload, security, succ, readPredecessor) {
  const entry = succ.TS.predecessorOf(security.securityId, succ.map);
  if (!entry) return { payload, joined: null };
  const pred = readPredecessor(entry);
  if (!pred || !Array.isArray(pred.bars) || !pred.bars.length) return { payload, joined: { from: entry.from, predecessorBars: 0 } };
  const j = succ.TS.joinBars(pred.bars, (payload && payload.bars) || [], entry.effective);
  const base = payload || pred;
  return { payload: { ...base, bars: j.bars },
           joined: { from: entry.from, effective: entry.effective, predecessorBars: j.predecessorBars, successorBars: j.successorBars,
                     lastPredecessor: j.lastPredecessor, firstSuccessor: j.firstSuccessor } };
}
