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
  const relabeled = opts.relabel ? pred.bars.map((b) => ("securityId" in b ? { ...b, securityId: security.securityId } : b)) : pred.bars;
  const r = rebaseAdjusted(relabeled, (payload && payload.bars) || [], entry.effective);
  const j = succ.TS.joinBars(r.bars, (payload && payload.bars) || [], entry.effective);
  const base = payload || pred;
  const ident = opts.relabel ? { securityId: security.securityId, ticker: security.ticker } : {};
  return { payload: { ...base, ...ident, bars: j.bars },
           joined: { from: entry.from, effective: entry.effective, predecessorBars: j.predecessorBars, successorBars: j.successorBars,
                     lastPredecessor: j.lastPredecessor, firstSuccessor: j.firstSuccessor, adjustmentRebase: r.factor } };
}

const ADJ_PRICE = ["adjustedOpen", "adjustedHigh", "adjustedLow", "adjustedClose"];
const day = (b) => String(b && b.date).slice(0, 10);
const ratio = (b) => (b && b.close > 0 && b.adjustedClose > 0 ? b.adjustedClose / b.close : null);

/**
 * Anpassungsniveau an der Naht (24.11.2026, CASK/FCDH): Der Anbieter rechnet Dividenden und Splits des Nachfolgers nur noch
 * in dessen eigene Reihe ein; die Arbeitsablage-Bars des Vorgaengers werden nach seinem Abgang nicht mehr nachgefuehrt.
 * An der Naht springt dann adjustedClose/close (CASK x0,993 nach der Dividende vom 13.11., FCDH x5 nach einer Zusammenlegung)
 * und die Qualitaetspruefung sperrt den Titel (unexplained_adjustment_step). Die angepassten Felder des Vorgaengers werden
 * deshalb mit k = (adj/close des ersten Nachfolger-Bars ab Stichtag) / (adj/close des letzten Vorgaenger-Bars davor)
 * skaliert, adjustedVolume mit 1/k. Rohe Schlusskurse (close, open, high, low) bleiben unveraendert - sie sind die
 * veroeffentlichte Preiswahrheit (ADR-002); geaendert wird nur das Anpassungsniveau der verbundenen Historie.
 * Ohne gueltiges Verhaeltnis auf beiden Seiten bleibt alles, wie es ist.
 */
export function rebaseAdjusted(predecessorBars, successorBars, effective) {
  const before = (predecessorBars || []).filter((b) => day(b) < effective);
  const after = (successorBars || []).filter((b) => day(b) >= effective);
  const rp = ratio(before[before.length - 1]), rs = ratio(after[0]);
  if (!rp || !rs) return { bars: predecessorBars, factor: null };
  const k = rs / rp;
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-9) return { bars: predecessorBars, factor: 1 };
  const bars = predecessorBars.map((b) => {
    const o = { ...b };
    for (const f of ADJ_PRICE) if (typeof o[f] === "number") o[f] = o[f] * k;
    if (typeof o.adjustedVolume === "number") o.adjustedVolume = o.adjustedVolume / k;
    return o;
  });
  return { bars, factor: Number(k.toFixed(10)) };
}
