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
  var VERSION = "ti-ai-tools-1.0.0";
  var RULE = "Nur diese Fakten verwenden. Keine Zahl, Welle, Wahrscheinlichkeit oder Trefferquote ergaenzen. Szenarien sind Bedingungen, keine Vorhersagen.";

  function definitions() {
    var sym = { symbol: { type: "string", required: true } };
    return [
      { name: "getChartbild", category: "technical", description: "Chartbild einer Aktie: Ausblick, Lage, Hauptszenario mit Zonen und Ungueltig-Linie, Begruendung, historische Evidenz mit Zufallsvergleich. Abschliessende Faktenliste.", parameters: sym },
      { name: "getChartbildAlternatives", category: "technical", description: "Alternative und Randszenario sowie alternative Elliott-Zaehlungen mit Regelgrenzen.", parameters: sym }
    ];
  }

  function register(registry, access) {
    var defs = {}; definitions().forEach(function (d) { defs[d.name] = d; });
    function withA(symbol, fn) {
      return Promise.resolve(access.getAnalysis(symbol)).then(function (r) {
        return r && r.state === "AVAILABLE" ? fn(r.analysis) : { found: false, symbol: symbol, reason: (r && r.reason) || "NOT_AVAILABLE" };
      });
    }
    registry.register(defs.getChartbild, function (a) {
      return withA(a.symbol, function (x) {
        return { found: true, rule: RULE, asOf: x.asOf, timeframe: x.timeframe, facts: x.explain.facts, summaryText: x.explain.summary, evidence: x.explain.evidence, isProbability: false };
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

  var api = { VERSION: VERSION, RULE: RULE, definitions: definitions, register: register };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIAITools = api; }
})(typeof window !== "undefined" ? window : globalThis);
