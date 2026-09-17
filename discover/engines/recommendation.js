/* =========================================================================
   VISION UNIVERSE DISCOVER — recommendation.js

   DER EMPFEHLUNGS-VERTRAG (VORBEREITUNG, KEINE BEHAUPTUNG)

   "Für dich", "Weil du NVIDIA angesehen hast", "Mehr aus deinen Themen":
   das sind die Flaechen, die eine Streaming-Plattform aus dem Verhalten
   ihrer Nutzer baut. Vision Universe hat heute kein Konto und keinen
   Server, der Verhalten sieht. Es gibt genau eine ehrliche Grundlage:
   das Geraetegedaechtnis (engines/memory.js) - was auf DIESEM Geraet
   geoeffnet wurde, welche Sammlungen, welche Position.

   Dieses Modul ist der Vertrag dafuer. Es sagt, WELCHE Flaechen aus
   WELCHEN Signalen entstehen duerfen, und es rechnet sie deterministisch
   aus dem, was vorliegt. Es behauptet keine Vorliebe, die niemand gemessen
   hat: jede Flaeche traegt ihre Begruendung (reason) und ihre Quelle
   (basis: "device").

   Signale (Session Signals):
     recent[]          zuletzt geoeffnete Titel (symbol, universeId, world, companyName)
     collections{}     wie oft eine Sammlung geoeffnet wurde
   Kandidaten:
     discoverNext      die Nachbarn eines Titels, im Build gerechnet
     rows              die Reihen der Startseite (rowId -> Karten)

   Ausgabe (Recommendation Contract):
     { version, basis: "device", surfaces: [{ id, kind, title, reason, from, symbols[] }] }

   Was ein spaeterer Server tun koennte, steht in docs/VU_DISCOVER_V3_NETFLIX_BUILD.md
   (Personalisierungs-Hooks). Dieses Modul aendert sich dann nicht - nur
   seine Eingaben.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var CONTRACT_VERSION = "discover-recommendation-1.0.0";
  var KINDS = ["because_you_viewed", "more_from_your_collections", "continue_discovering"];

  /**
   * @param {object} signals   { recent: [...], collections: {rowId: count} }
   * @param {object} catalog   { next: {symbol: discoverNext}, rows: {rowId: {title, cards[]}} }
   * @param {object} [opts]    { limit }
   */
  function recommend(signals, catalog, opts) {
    signals = signals || {}; catalog = catalog || {}; opts = opts || {};
    var limit = opts.limit || 10;
    var recent = Array.isArray(signals.recent) ? signals.recent : [];
    var seen = {};
    recent.forEach(function (r) { seen[r.symbol] = true; });
    var surfaces = [];

    /* 1. Weil du X angesehen hast: die Nachbarn des zuletzt geoeffneten Titels. */
    var last = recent[0];
    var next = last && catalog.next && catalog.next[last.symbol];
    if (last && next && next.similar && next.similar.cards && next.similar.cards.length) {
      var symbols = next.similar.cards.map(function (c) { return c.symbol; })
        .filter(function (s) { return !seen[s]; }).slice(0, limit);
      if (symbols.length) {
        surfaces.push({ id: "because-" + last.symbol, kind: "because_you_viewed",
          title: "Weil du " + (last.companyName || last.symbol) + " angesehen hast",
          reason: "Nachbarn nach Kursverhalten, Wachstum, Marge und Bewertung (" + next.similar.rule + ")",
          from: { symbol: last.symbol, basis: "device" }, symbols: symbols });
      }
    }

    /* 2. Mehr aus deinen Sammlungen: die am haeufigsten geoeffnete Reihe,
          ohne die schon gesehenen Titel. */
    var counts = signals.collections || {};
    var beste = Object.keys(counts).filter(function (k) { return catalog.rows && catalog.rows[k]; })
      .sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); })[0];
    if (beste) {
      var row = catalog.rows[beste];
      var sy = (row.cards || []).map(function (c) { return c.symbol; }).filter(function (s) { return !seen[s]; }).slice(0, limit);
      if (sy.length) {
        surfaces.push({ id: "more-" + beste, kind: "more_from_your_collections",
          title: "Mehr aus " + row.title, reason: "Diese Sammlung wurde auf diesem Gerät " + counts[beste] + "× geöffnet",
          from: { rowId: beste, basis: "device" }, symbols: sy });
      }
    }

    /* 3. Weiter entdecken: die zuletzt gesehenen Titel selbst, als Rueckweg. */
    if (recent.length) {
      surfaces.push({ id: "continue", kind: "continue_discovering", title: "Weiter entdecken",
        reason: "Zuletzt auf diesem Gerät geöffnet", from: { basis: "device" },
        symbols: recent.slice(0, limit).map(function (r) { return r.symbol; }) });
    }
    return { version: CONTRACT_VERSION, basis: "device", surfaces: surfaces };
  }

  /** Ein gueltiger Vertrag: jede Flaeche hat Art, Titel, Grund, Quelle und Titel-Symbole. */
  function validate(payload) {
    var findings = [];
    if (!payload || payload.version !== CONTRACT_VERSION) findings.push("version");
    if (!payload || payload.basis !== "device") findings.push("basis");
    (payload && payload.surfaces || []).forEach(function (s, i) {
      if (KINDS.indexOf(s.kind) === -1) findings.push("surface[" + i + "].kind");
      if (!s.title || !s.reason || !s.from || !Array.isArray(s.symbols) || !s.symbols.length) findings.push("surface[" + i + "].shape");
    });
    return { ok: findings.length === 0, findings: findings };
  }

  var api = { CONTRACT_VERSION: CONTRACT_VERSION, KINDS: KINDS, recommend: recommend, validate: validate };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Recommendation = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
