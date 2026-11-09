/* =========================================================================
   VISION UNIVERSE TECHNICAL — ui/shapes.js
   Musterbilder (Konzept „Der Chart in drei Sätzen“, Entscheidung 4, Folie K1):
   jedes Muster hat ein kleines Bild, gleich auf Start, Befunden, Musterseite und in Lektionen.
   Die acht Pfade der Vorlage (docs/design/technical-2026-11/deck-tc.js, SH) sind unverändert übernommen;
   die übrigen Formen sind in derselben Strichsprache ergänzt (HANDOVER „Entscheidungen beim Bauen“).
   Muster ohne eigenes Bild bekommen das neutrale Bild „neutral“. Nur Darstellung, keine Erkennung.
   Browser: globalThis.VUTechnicalShapes; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUTechnicalShapes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  /* Zeichenfläche 36 × 24. */
  var SH = {
    /* aus der Vorlage */
    dreieck: "M3 6 L33 13 L3 20 M3 6 L3 20",
    range: "M3 8 H33 M3 18 H33 M6 13 L11 9 L16 17 L21 9 L26 17 L31 9",
    doppelboden: "M3 4 L10 18 L17 9 L24 18 L33 4",
    doppeltop: "M3 20 L10 6 L17 15 L24 6 L33 20",
    kopf: "M2 20 L8 11 L12 15 L18 3 L24 15 L28 11 L34 20",
    luecke_dn: "M3 5 L14 9 M20 15 L33 19",
    luecke_up: "M3 19 L14 15 M20 9 L33 5",
    flagge: "M3 21 L12 5 L20 9 L27 7 L33 11",
    /* ergänzt */
    flagge_dn: "M3 3 L12 19 L20 15 L27 17 L33 13",
    kopf_inv: "M2 4 L8 13 L12 9 L18 21 L24 9 L28 13 L34 4",
    ausbruch: "M3 16 H24 M5 20 L10 17 L15 20 L20 17 L24 18 L33 4",
    keil_up: "M3 20 L33 6 M3 14 L33 4",
    keil_dn: "M3 4 L33 18 M3 10 L33 20",
    kanal_up: "M3 14 L33 4 M3 22 L33 12",
    kanal_dn: "M3 2 L33 12 M3 10 L33 20",
    linie_up: "M3 21 L33 9 M6 16 L11 12 L16 17 L22 10 L27 13 L32 6",
    linie_dn: "M3 3 L33 15 M6 8 L11 12 L16 7 L22 14 L27 11 L32 18",
    tasse: "M3 5 C 6 22, 22 22, 25 7 L28 10 L33 5",
    kontraktion: "M3 4 L8 20 L13 7 L18 17 L23 10 L28 15 L33 12",
    linie200: "M3 12 H33 M3 20 L10 14 L16 16 L23 6 L33 4",
    kreuz: "M3 18 C 12 16, 22 8, 33 6 M3 8 C 12 10, 22 14, 33 15",
    schwung: "M3 16 C 8 4, 12 4, 17 12 S 27 20, 33 8",
    handel: "M5 21 V15 M11 21 V12 M17 21 V16 M23 21 V6 M29 21 V13",
    neutral: "M3 15 L10 9 L16 14 L23 7 L33 12"
  };
  /* Formationstyp (technical-query.js, FORMATION_TYPES) → Bild */
  var OF_TYPE = {
    SYMMETRICAL_TRIANGLE: "dreieck", ASCENDING_TRIANGLE: "dreieck", DESCENDING_TRIANGLE: "dreieck",
    RECTANGLE: "range", RANGE_BREAKOUT: "range", RESISTANCE_BREAKOUT: "ausbruch",
    DOUBLE_BOTTOM: "doppelboden", DOUBLE_TOP: "doppeltop",
    HEAD_AND_SHOULDERS: "kopf", INVERSE_HEAD_AND_SHOULDERS: "kopf_inv",
    GAP_UP: "luecke_up", GAP_DOWN: "luecke_dn",
    BULL_FLAG: "flagge", BULL_PENNANT: "flagge", BEAR_FLAG: "flagge_dn", BEAR_PENNANT: "flagge_dn",
    RISING_WEDGE: "keil_up", FALLING_WEDGE: "keil_dn", ASCENDING_CHANNEL: "kanal_up", DESCENDING_CHANNEL: "kanal_dn",
    SUPPORT_TRENDLINE: "linie_up", RESISTANCE_TRENDLINE: "linie_dn", CUP_WITH_HANDLE: "tasse", VOLATILITY_CONTRACTION: "kontraktion"
  };
  /* Indikator-Befunde (model.js#findings, id) → Bild */
  var OF_FINDING = { sma200: "linie200", cross: "kreuz", rsi: "schwung", volume: "handel" };
  function keyOf(x) {
    if (!x) return "neutral";
    if (SH[x]) return x;
    if (OF_TYPE[x]) return OF_TYPE[x];
    if (x.formation && OF_TYPE[x.formation.type]) return OF_TYPE[x.formation.type];
    if (x.type && OF_TYPE[x.type]) return OF_TYPE[x.type];
    if (x.kind === "indicator" && OF_FINDING[x.id]) return OF_FINDING[x.id];
    return "neutral";
  }
  /** SVG-Text eines Musterbilds; size = Breite in px (Höhe 2/3). */
  function svg(x, size) {
    var s = size || 36, k = keyOf(x);
    return '<svg class="tc-shape" width="' + s + '" height="' + Math.round(s * 0.66) + '" viewBox="0 0 36 24" aria-hidden="true" focusable="false"><path d="' + SH[k] +
      '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  return { SH: SH, OF_TYPE: OF_TYPE, OF_FINDING: OF_FINDING, keyOf: keyOf, svg: svg };
});
