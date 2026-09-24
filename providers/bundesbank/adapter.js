/* =========================================================================
   VISION UNIVERSE — providers/bundesbank/adapter.js   (Multi-Asset Core, Bund-Renditen)

   DIE DEUTSCHE BUNDESBANK ALS PRIMAERQUELLE FUER BUND-RENDITEN.

   Gemessen (multi-asset-probe.json): die Reihe BBSIS ... R10XX traegt den
   Titel "Term structure of interest rates on listed Federal securities
   (method by Svensson) / residual maturity of 10.0 years / daily data".
   Das ist eine GESCHAETZTE Rendite fuer eine Restlaufzeit von genau zehn
   Jahren aus allen boersennotierten Bundeswertpapieren - nicht die
   Rendite der aktuellen zehnjaehrigen Benchmark-Anleihe. Deshalb
   subType GOVERNMENT_BOND_YIELD_TERM_STRUCTURE.

   Wochenenden stehen in der Reihe mit "." (kein Wert). Sie werden
   ausgelassen, nicht aufgefuellt.

   Nur Node. URL und Parser; der Abruf liegt im Ingest.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "bundesbank";
const DATA_SOURCE_ID = "ds_bundesbank_bbsis_term_structure";
const SERIES = {
  DE2Y: "BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R02XX.R.A.A._Z._Z.A",
  DE10Y: "BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
  DE30Y: "BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R30XX.R.A.A._Z._Z.A"
};

function seriesUrl(key, from) {
  return `https://api.statistiken.bundesbank.de/rest/data/${key}?format=csv&lang=en` + (from ? `&startPeriod=${from}` : "");
}

/** CSV -> {title, points: [[date, percent]]} */
function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/);
  let title = null;
  const points = [];
  for (const line of lines) {
    const cells = line.split(",").map((c) => c.replace(/"/g, "").trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) {
      const v = parseFloat(cells[1]);
      if (cells[1] !== "." && cells[1] !== "" && isFinite(v)) points.push([cells[0], v]);
    } else if (!title && cells[0] === "" && cells[1] && /residual maturity/i.test(cells[1])) {
      title = cells[1];
    }
  }
  points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { title, points };
}

module.exports = { PROVIDER_ID, DATA_SOURCE_ID, SERIES, seriesUrl, parseCsv };
