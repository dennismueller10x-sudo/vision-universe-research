/* =========================================================================
   VISION UNIVERSE — providers/us-treasury/adapter.js   (Multi-Asset Core, Renditen)

   DAS US-FINANZMINISTERIUM ALS PRIMAERQUELLE FUER US-RENDITEN.

   Tiingo fuehrt keine Renditen (gemessen: multi-asset-probe.json - die
   Suche nach "10 year treasury" liefert nur Anleihe-ETFs). Nach §12/§13
   gilt dann die offizielle Primaerquelle: die Daily Treasury Par Yield
   Curve Rates, ein Wert je Laufzeit und Geschaeftstag.

   WAS DIESE ZAHL IST

   Eine Par-Rendite einer Constant-Maturity-Kurve, vom Treasury aus
   Geldkursen am Sekundaermarkt gegen 15:30 New York interpoliert. Keine
   laufend gehandelte Rendite, kein Schlusskurs einer Anleihe. Deshalb
   subType GOVERNMENT_BOND_YIELD_CMT und Profil REFERENCE_DAILY.

   LUECKEN SIND ECHT

   Die 30-Jahres-Laufzeit wurde von Februar 2002 bis Februar 2006 nicht
   begeben - in diesen Jahren fehlt die Spalte. Das bleibt eine Luecke.

   Nur Node. Liest nichts selbst - URL und Parser, der Abruf liegt im
   Ingest (scripts/market/ingest-multi-asset.mjs).
   ========================================================================= */
"use strict";

const PROVIDER_ID = "us-treasury";
const DATA_SOURCE_ID = "ds_us_treasury_par_yield_curve";
const EARLIEST_YEAR = 1990;
const TENOR_COLUMNS = { US2Y: "2 Yr", US5Y: "5 Yr", US10Y: "10 Yr", US30Y: "30 Yr" };

function yearUrl(year) {
  return "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/" +
    year + "/all?type=daily_treasury_yield_curve&field_tdr_date_value=" + year + "&page&_format=csv";
}

function isoFromUs(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * CSV eines Jahres -> {symbol: [[date, percent]]}. Leere Zellen bleiben
 * weg; es wird nichts interpoliert.
 */
function parseYearCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return {};
  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const out = {};
  for (const [symbol, col] of Object.entries(TENOR_COLUMNS)) {
    const idx = header.indexOf(col);
    out[symbol] = [];
    if (idx === -1) continue;
    for (const line of lines.slice(1)) {
      const cells = line.split(",").map((c) => c.replace(/"/g, "").trim());
      const date = isoFromUs(cells[0]);
      const v = parseFloat(cells[idx]);
      if (date && cells[idx] !== "" && isFinite(v)) out[symbol].push([date, v]);
    }
    out[symbol].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return out;
}

module.exports = { PROVIDER_ID, DATA_SOURCE_ID, EARLIEST_YEAR, TENOR_COLUMNS, yearUrl, parseYearCsv, isoFromUs };
