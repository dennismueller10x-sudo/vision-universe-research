/* =========================================================================
   VISION UNIVERSE — providers/eia/adapter.js   (Multi-Asset Core, Energie-Spotpreise)

   DIE U.S. ENERGY INFORMATION ADMINISTRATION ALS PRIMAERQUELLE.

   Tiingo fuehrt weder WTI noch Brent noch Erdgas (gemessen: kein
   Rohstoffsymbol auf dem FX-Endpunkt, keine Future-Reihe). Die EIA
   veroeffentlicht taegliche SPOTPREISE:

     RWTC     WTI, Cushing (Oklahoma), Spot FOB, USD je Barrel
     RBRTE    Brent, Europe, Spot FOB, USD je Barrel
     RNGWHHD  Henry Hub, Spot, USD je Million Btu

   Das sind Referenz-Spotpreise, keine Futures - subType SPOT_REFERENCE.
   Kein Rollen, keine Kontraktverkettung, keine eigene Roll-Methodik
   (§43 bleibt damit ohne Owner-Eskalation).

   Die EIA aktualisiert diese Tageswerte im Wochenrhythmus. Ein Wert, der
   einige Tage alt ist, ist deshalb nicht veraltet - das Profil US_EIA in
   multi-asset.json traegt die Karenz.

   Die API verlangt einen Schluessel (gemessen: HTTP 403 ohne). Die
   schluessellosen Historientabellen sind .xls; scripts/market/
   eia-xls-to-csv.py wandelt sie in CSV im Arbeitsstand. Dieser Adapter
   liest nur dieses CSV.
   ========================================================================= */
"use strict";

const PROVIDER_ID = "eia";
const DATA_SOURCE_ID = "ds_eia_spot_prices";
const SERIES = {
  WTI: { series: "RWTC", unit: "PRICE_PER_BARREL", venue: "Cushing, OK - Spot FOB (EIA)" },
  BRENT: { series: "RBRTE", unit: "PRICE_PER_BARREL", venue: "Europe Brent - Spot FOB (EIA)" },
  NATGAS: { series: "RNGWHHD", unit: "PRICE_PER_MMBTU", venue: "Henry Hub, LA - Spot (EIA)" }
};

function parseCsv(text) {
  const points = [];
  for (const line of String(text || "").split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    const n = parseFloat(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && isFinite(n)) points.push([d, n]);
  }
  points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return points;
}

module.exports = { PROVIDER_ID, DATA_SOURCE_ID, SERIES, parseCsv };
