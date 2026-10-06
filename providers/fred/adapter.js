/* =========================================================================
   VISION UNIVERSE — providers/fred/adapter.js   (Multi-Asset Core, Indexstaende)

   FRED (FEDERAL RESERVE BANK OF ST. LOUIS) ALS LIZENZIERTER SPIEGEL.

   FRED traegt je Reihe eine Lizenzklasse. Gemessen (index-source-probe.json,
   Seite fred.stlouisfed.org/legal):
     "Copyrighted: Citation required - ... you may use these data series
      with proper attribution of the source and acknowledgment that you
      obtained the data from FRED ... when displaying or publishing it."
     "Copyrighted: Pre-approval required - ... may only be used for
      non-commercial educational or personal use."

   Nur Reihen der ersten Klasse werden hier gefuehrt. SP500, DJIA und
   NASDAQ100 tragen die zweite Klasse und stehen bewusst NICHT in SERIES -
   eine gemessene Reihe ist keine erlaubte Reihe.

   Fehlende Tage stehen in der CSV mit "." (Feiertag). Sie werden
   ausgelassen, nicht aufgefuellt.

   Nur Node. URL und Parser; der Abruf liegt im Ingest.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "fred";
const LICENSE_CLASS = {
  CITATION_REQUIRED: "https://fred.stlouisfed.org/legal/#copyright-citation-required",
  PRE_APPROVAL_REQUIRED: "https://fred.stlouisfed.org/legal/#copyright-pre-approval"
};
/* Symbol -> {series, licenseClass}. Die Lizenzklasse ist gemessen, nicht
   angenommen; der Ingest prueft sie bei jedem Lauf erneut (licenseOf). */
const SERIES = {
  N225: { series: "NIKKEI225", licenseClass: "CITATION_REQUIRED" }
};

function seriesUrl(id) { return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`; }
function seriesPageUrl(id) { return `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`; }

/** CSV (observation_date,<ID>) -> {points: [[date, value]]} */
function parseCsv(text) {
  const points = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const c = line.split(",");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0])) continue;
    const v = parseFloat(c[1]);
    if (c[1] !== "." && c[1] !== "" && isFinite(v)) points.push([c[0], v]);
  }
  points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { points };
}

/** Lizenzklasse aus der Reihenseite (schema.org "license"). null = nicht lesbar. */
function licenseOf(html) {
  const m = /"license"\s*:\s*"([^"]+)"/.exec(String(html || ""));
  if (!m) return null;
  for (const [k, url] of Object.entries(LICENSE_CLASS)) if (m[1] === url) return k;
  return "OTHER";
}

module.exports = { PROVIDER_ID, LICENSE_CLASS, SERIES, seriesUrl, seriesPageUrl, parseCsv, licenseOf };
