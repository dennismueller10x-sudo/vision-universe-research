/* =========================================================================
   VISION UNIVERSE — providers/nyfed/adapter.js   (Multi-Asset Core, Leitzins USA)

   DIE FEDERAL RESERVE BANK OF NEW YORK ALS PRIMAERQUELLE.

   Die New York Fed ist Administrator der Effective Federal Funds Rate und
   veroeffentlicht mit jedem Tageswert das an diesem Tag geltende FOMC-
   Zielband (targetRateFrom / targetRateTo). Gemessen: beide Felder sind
   da, die Historie reicht bis 2000-07-03 (multi-asset-probe.json).

   ZWEI INSTRUMENTE, NICHT EINES

     FED_TARGET  das beschlossene Zielband - eine Stufenserie
     US_EFFR     der tatsaechliche Tagesgeldsatz - ein Marktwert

   Sie werden nicht vermischt: die EFFR ist kein Leitzins, sie liegt im
   Band.

   Nur Node. URL und Parser; der Abruf liegt im Ingest.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "nyfed";
const DATA_SOURCE_ID = "ds_nyfed_reference_rates";
const EARLIEST = "2000-07-03";

function effrSearchUrl(from, to) {
  return `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${from}&endDate=${to}`;
}

/**
 * @returns {{effr: Array, target: Array}}
 *   effr   [[date, percent]]
 *   target [[date, lower, upper]]  (nur Tage mit beiden Grenzen)
 */
function parseEffr(json) {
  const rows = json && Array.isArray(json.refRates) ? json.refRates : [];
  const effr = [], target = [];
  for (const r of rows) {
    const d = String(r.effectiveDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (typeof r.percentRate === "number" && isFinite(r.percentRate)) effr.push([d, r.percentRate]);
    if (typeof r.targetRateFrom === "number" && typeof r.targetRateTo === "number") target.push([d, r.targetRateFrom, r.targetRateTo]);
  }
  const byDate = (a, b) => (a[0] < b[0] ? -1 : 1);
  return { effr: effr.sort(byDate), target: target.sort(byDate) };
}

/** Tagesreihe des Bandes -> Beschluss-Stufen [[effectiveDate, lower, upper]]. */
function toSteps(target) {
  const steps = [];
  for (const t of target) {
    const last = steps[steps.length - 1];
    if (!last || last[1] !== t[1] || last[2] !== t[2]) steps.push(t.slice());
  }
  return steps;
}

module.exports = { PROVIDER_ID, DATA_SOURCE_ID, EARLIEST, effrSearchUrl, parseEffr, toSteps };
