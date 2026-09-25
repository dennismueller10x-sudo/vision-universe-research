/* =========================================================================
   VISION UNIVERSE — providers/nikkei/adapter.js   (Multi-Asset Core, Gegenprobe)

   NIKKEI INC. - DIE OFFIZIELLE TAGESDATEI DES NIKKEI 225.

   Gemessen (index-source-probe.json): die Datei liefert Schlusskurse ab
   2023 (Kopf "Date of Data,Close,Open,High,Low"). Die Nutzungsbedingungen
   der Nikkei-Indexseiten waren vom Runner aus nicht lesbar (403/404) -
   die Lizenz ist damit UNKNOWN. Deshalb wird diese Datei NICHT
   ausgeliefert, sondern dient nur als Gegenprobe der ausgelieferten
   FRED-Reihe: gleicher Tag, gleicher Schluss.

   Nur Node. URL und Parser; der Abruf liegt im Ingest.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "nikkei";
const DAILY_CSV = "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv";

/** CSV -> {header, points: [[date, close]]}. Datumsformat 2026/09/24. */
function parseDailyCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  const header = lines.length ? lines[0].replace(/"/g, "") : null;
  if (!header || !/^Date of Data,Close\b/i.test(header)) return { header, points: [] };
  const points = [];
  for (const line of lines.slice(1)) {
    const c = line.replace(/"/g, "").split(",");
    const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(c[0]).trim());
    const v = parseFloat(c[1]);
    if (m && isFinite(v)) points.push([`${m[1]}-${m[2]}-${m[3]}`, v]);
  }
  points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { header, points };
}

/** Gegenprobe: je gemeinsamem Tag die relative Abweichung. */
function crossCheck(points, reference, { lastN = 60, tolerance = 0.0005 } = {}) {
  const ref = new Map(reference);
  const common = points.filter((p) => ref.has(p[0])).slice(-lastN);
  let worst = 0, worstDate = null;
  for (const [d, v] of common) {
    const dev = Math.abs(v - ref.get(d)) / ref.get(d);
    if (dev > worst) { worst = dev; worstDate = d; }
  }
  return { comparedDays: common.length, maxRelativeDeviation: +worst.toFixed(6), worstDate, tolerance,
           ok: common.length > 0 && worst <= tolerance };
}

module.exports = { PROVIDER_ID, DAILY_CSV, parseDailyCsv, crossCheck };
