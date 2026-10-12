/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/ai-tools.js
   KI-WERKZEUGE FUERS CHARTBILD (VU Ask)

   Die KI erklaert, sie rechnet nicht. Jedes Werkzeug liefert die
   praekomputierte, abschliessende Faktenliste (ti/explain.js facts) plus
   die Szenario-Geometrie — mit der ausdruecklichen Regel, keine Zahl,
   Welle oder Quote hinzuzufuegen. Kein Werkzeug startet eine Berechnung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "ti-ai-tools-1.1.0";
  var RULE = "Nur diese Fakten verwenden. Keine Zahl, Welle, Wahrscheinlichkeit oder Trefferquote ergaenzen. Szenarien sind Bedingungen, keine Vorhersagen.";
  var DISCLAIMER = "Das Chartbild beschreibt die aktuelle Lage und ein Szenario mit Bedingungen. Es ist keine Prognose, keine Wahrscheinlichkeit und keine Anlageberatung oder Kauf- bzw. Verkaufsempfehlung.";
  var ELLIOTT_NOTE = "Elliott-Wellen sind ein experimentelles Strukturmodell: nicht von Experten validiert, ohne Gewicht im Ausblick. Für die meisten Titel gibt es keine belastbare Zählung.";
  /* Wortlaut wie im Chartbild (ti/explain.js) */
  var LABELS = {
    outlook: { BULLISH: "Aufwärts", BEARISH: "Abwärts", NEUTRAL: "Seitwärts", MIXED: "Gemischt" },
    structure: { UPTREND_ADVANCING: "Aufwärtstrend intakt", CORRECTION_IN_UPTREND: "Rücksetzer im Aufwärtstrend", DOWNTREND_ADVANCING: "Abwärtstrend intakt",
                 RALLY_IN_DOWNTREND: "Erholung im Abwärtstrend", SIDEWAYS_RANGE: "Seitwärtsphase", NO_CLEAR_TREND: "Kein klarer Trend" },
    level: { HIGH: "Hoch", MODERATE: "Mittel", LOW: "Niedrig" }
  };

  /* Datenstand-Richtlinie (ti/data-freshness.js, data-freshness-1.0.0): gleiche Worte wie im Chartbild; Test ti-freshness-texts prueft die Gleichheit */
  function dateDe(d) { return d ? String(d).slice(8, 10) + "." + String(d).slice(5, 7) + "." + String(d).slice(0, 4) : "–"; }
  function freshnessInfo(fr, row) {
    if (!fr) return null;
    var d = dateDe(fr.last || (row && row.asOf));
    var t = fr.st === "DELAYED" ? { badge: "Kursdaten verzögert · letzter Stand " + d, title: null, text: null }
          : fr.st === "STALE" ? { badge: "Zurückgehalten – Kursdaten veraltet", title: "Analyse zurückgehalten", text: "Die Kursreihe ist nicht aktuell genug für eine laufende technische These." }
          : fr.st === "NON_TRADING" ? { badge: "Zurückgehalten – Titel nicht mehr gehandelt", title: "Analyse zurückgehalten", text: "Der Titel wird laut Wertpapierstamm nicht mehr gehandelt. Die Kursreihe beschreibt keine laufende Lage." }
          : { badge: null, title: null, text: null };
    return { state: fr.st, lastBar: fr.last || null, ageTradingDays: typeof fr.age === "number" ? fr.age : null, reference: fr.ref || null, reasonCode: fr.rc || null, badge: t.badge, title: t.title, text: t.text };
  }
  function isWithheld(row) { return !!(row && (row.withheld || (row.fr && (row.fr.st === "STALE" || row.fr.st === "NON_TRADING")))); }

  function definitions() {
    var sym = { symbol: { type: "string", required: true } };
    return [
      { name: "getChartbild", category: "technical", description: "Chartbild einer Aktie: Ausblick, Lage, Hauptszenario mit Zonen und Ungueltig-Linie, Begruendung, historische Evidenz mit Zufallsvergleich. Abschliessende Faktenliste.", parameters: sym },
      { name: "getChartbildAlternatives", category: "technical", description: "Alternative und Randszenario sowie alternative Elliott-Zaehlungen mit Regelgrenzen.", parameters: sym },
      { name: "getChartbildLage", category: "technical", readOnly: true, description: "Kompakte Chartlage einer Aktie aus dem veroeffentlichten Chartbild-Index: Ausblick, Kursstruktur, Hauptszenario (Zone, Ungueltig-Linie, Bestaetigung, Zielzone 1) und Elliott-Anwendbarkeit inklusive Enthaltung. Ohne Trefferquoten.", parameters: sym }
    ];
  }

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function pair(v) { return Array.isArray(v) && v.length === 2 && num(v[0]) !== null && num(v[1]) !== null ? [v[0], v[1]] : null; }
  function labeled(map, v) { return v ? { value: v, label: map[v] || null } : null; }
  function elliottEngine(index) {
    try { return JSON.parse(index.methodologyKey).elliott || null; } catch (e) { return null; }
  }

  /**
   * Chartlage aus einer Zeile von index.json.gz (vu-ti-api-3). Rein, ohne
   * Netz; dieselbe Funktion bedient VU Ask im Browser und die Tests.
   * Die Elliott-Zaehlung wird nur genannt, wenn das Modell sich nicht
   * enthaelt (Anwendbarkeit HIGH oder MODERATE) - und dann als experimentell.
   * Empirische Trefferquoten und Chance-Risiko-Verhaeltnis bleiben bewusst
   * draussen: keine Wahrscheinlichkeiten in einer KI-Antwort.
   * @param row    Indexzeile oder null
   * @param ctx    { symbol, index (fuer Methodik-Schluessel), meta (meta.json), latestAsOf, maxAgeDays }
   */
  function situation(row, ctx) {
    ctx = ctx || {};
    var meta = ctx.meta || {}, ew = meta.elliott || {};
    var status = {
      layer: "TECHNICAL_INTELLIGENCE", schemaVersion: (ctx.index && ctx.index.schemaVersion) || meta.schemaVersion || null,
      evidence: row && row.evidence || null, calibrated: false, isForecast: false, isProbability: false, isAdvice: false
    };
    if (!row) return { tool: "getChartbildLage", found: false, symbol: ctx.symbol || null, reason: "NOT_COVERED", status: status, disclaimer: DISCLAIMER };
    /* Zurueckgehaltener Titel: keine laufende These, nur Zustand und Hinweis (die Analyse bleibt in der Historie, wird aber nicht als aktuell beschrieben) */
    var fresh = freshnessInfo(row.fr, row);
    if (isWithheld(row)) {
      return { tool: "getChartbildLage", found: true, symbol: row.t, asOf: row.asOf || null, timeframe: row.tf || null, withheld: true, stale: true, freshness: fresh, close: num(row.close),
               outlook: null, structure: null, confidence: null, primaryScenario: null,
               elliott: { status: "EXPERIMENTAL", modelStatus: ew.status || "EXPERIMENTAL_STRUCTURE_MODEL", expertValidated: false, confluenceWeight: 0, engine: null, applicability: null, abstained: true, count: null, note: ELLIOTT_NOTE },
               notice: fresh ? fresh.title + ". " + fresh.text + " Letzter Stand: " + dateDe(fresh.lastBar) + "." : "Analyse zurückgehalten.", status: status, rule: RULE, disclaimer: DISCLAIMER };
    }
    var applicable = row.elliottApplicable === "HIGH" || row.elliottApplicable === "MODERATE" ? row.elliottApplicable : null;
    var a = row.alerts && row.alerts.levels || {};
    /* Plausibilitaet: Ein Kursniveau <= 0 oder mehr als Faktor 10 vom
       Schlusskurs entfernt ist ein Rechenartefakt (im Index v3 u. a. negative
       Zielzonen bei Pennystocks). Es wird nicht genannt, sondern benannt. */
    var close = num(row.close), withheld = [];
    function lvl(name, v) {
      var x = num(v);
      if (x === null) return null;
      if (x <= 0 || (close && (x > close * 10 || x < close / 10))) { withheld.push(name); return null; }
      return x;
    }
    function zone(name, v) { var z = pair(v); if (!z) return null; var lo = lvl(name, z[0]), hi = lo === null ? null : lvl(name, z[1]); if (lo === null || hi === null) { if (withheld.indexOf(name) < 0) withheld.push(name); return null; } return [lo, hi]; }
    var maxAge = ctx.maxAgeDays || 28;
    var stale = !!(ctx.latestAsOf && row.asOf && (Date.parse(ctx.latestAsOf) - Date.parse(row.asOf)) > maxAge * 864e5);
    return {
      tool: "getChartbildLage", found: true, symbol: row.t, asOf: row.asOf || null, timeframe: row.tf || null, stale: stale || !!(fresh && fresh.state === "DELAYED"),
      freshness: fresh, delayed: !!(fresh && fresh.state === "DELAYED"), notice: fresh && fresh.state === "DELAYED" ? fresh.badge : null,
      close: close,
      outlook: labeled(LABELS.outlook, row.outlook),
      structure: labeled(LABELS.structure, row.structure),
      confidence: labeled(LABELS.level, row.confidence),
      primaryScenario: row.direction ? {
        direction: row.direction, template: row.template || null, status: row.status || null,
        entryZone: zone("entryZone", row.entry), invalidation: lvl("invalidation", row.invalidation), confirmation: lvl("confirmation", a.confirmation), target1: zone("target1", row.t1),
        withheld: withheld,
        rule: "Gilt, solange die Ungültig-Linie nicht per Schlusskurs verletzt wird. Bedingung, keine Vorhersage."
      } : null,
      elliott: {
        status: "EXPERIMENTAL", modelStatus: ew.status || "EXPERIMENTAL_STRUCTURE_MODEL", expertValidated: false,
        confluenceWeight: typeof ew.confluenceWeight === "number" ? ew.confluenceWeight : 0,
        engine: ctx.index ? elliottEngine(ctx.index) : null,
        applicability: labeled(LABELS.level, row.elliottApplicable || null),
        abstained: !applicable,
        count: applicable ? row.elliott || null : null,
        note: ELLIOTT_NOTE
      },
      status: status, rule: RULE, disclaimer: DISCLAIMER
    };
  }

  function register(registry, access) {
    var defs = {}; definitions().forEach(function (d) { defs[d.name] = d; });
    function withA(symbol, fn) {
      return Promise.resolve(access.getAnalysis(symbol)).then(function (r) {
        if (r && r.state === "AVAILABLE" && r.analysis && r.analysis.withheld) {
          var fz = r.analysis.freshness || {};
          return { found: true, symbol: symbol, withheld: true, rule: RULE, asOf: r.analysis.asOf, freshness: { state: fz.state, lastBar: fz.lastBar, ageTradingDays: fz.ageTradingDays, reasonCode: fz.reason ? fz.reason.code : null },
                   notice: (fz.title || "Analyse zurückgehalten") + ". " + (fz.text || "") + " Letzter Stand: " + dateDe(fz.lastBar) + ".", isProbability: false };
        }
        if (r && r.state === "AVAILABLE") {
          var out = fn(r.analysis), dz = r.analysis.freshness;
          /* verzoegerte Kursdaten: gleicher Hinweis wie im Chartbild */
          if (out && out.found && dz && dz.state === "DELAYED") { out.freshness = { state: dz.state, lastBar: dz.lastBar, ageTradingDays: dz.ageTradingDays }; out.notice = dz.badge; }
          return out;
        }
        return { found: false, symbol: symbol, reason: (r && r.reason) || "NOT_AVAILABLE" };
      });
    }
    registry.register(defs.getChartbild, function (a) {
      return withA(a.symbol, function (x) {
        return { found: true, rule: RULE, asOf: x.asOf, timeframe: x.timeframe, facts: x.explain.facts, summaryText: x.explain.summary, evidence: x.explain.evidence, isProbability: false };
      });
    });
    if (access.getIndexRow) registry.register(defs.getChartbildLage, function (a) {
      return Promise.resolve(access.getIndexRow(a.symbol)).then(function (r) {
        return situation(r && r.row || null, { symbol: a.symbol, index: r && r.index, meta: r && r.meta, latestAsOf: r && r.latestAsOf });
      });
    });
    registry.register(defs.getChartbildAlternatives, function (a) {
      return withA(a.symbol, function (x) {
        var E = x.pro && x.pro.elliott;
        return { found: true, rule: RULE, asOf: x.asOf,
                 scenarios: x.scenarios.filter(function (s) { return s.kind !== "PRIMARY"; }).map(function (s) { return { kind: s.kind, direction: s.direction, template: s.template, entry: s.entryZone ? [s.entryZone.zoneLow, s.entryZone.zoneHigh] : null, invalidation: s.invalidation ? s.invalidation.price : null, targets: (s.targets || []).map(function (z) { return [z.zoneLow, z.zoneHigh]; }) }; }),
                 elliott: E && E.primary ? { primary: { pattern: E.primary.patternName, wave: E.primary.currentWave.label, invalidation: E.primary.invalidation }, alternatives: (E.alternatives || []).map(function (c) { return { pattern: c.patternName, wave: c.currentWave.label, invalidation: c.invalidation }; }), clarity: E.clarityLevel } : null };
      });
    });
  }

  var api = { VERSION: VERSION, RULE: RULE, DISCLAIMER: DISCLAIMER, ELLIOTT_NOTE: ELLIOTT_NOTE, LABELS: LABELS, definitions: definitions, register: register, situation: situation, freshnessInfo: freshnessInfo };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIAITools = api; }
})(typeof window !== "undefined" ? window : globalThis);
