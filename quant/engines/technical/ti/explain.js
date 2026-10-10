/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/explain.js
   VERSTAENDLICHE SPRACHE AUS STRUKTURIERTEN DATEN (deterministisch)

   Die Erklaerung ist die LETZTE Schicht: sie formuliert, rechnet nicht.
   Jede Zahl im Text stammt aus dem Ergebnisobjekt (facts). Ein LLM darf
   dieselben facts umformulieren (VU Ask), aber keine Zahl, Welle oder
   Quote hinzufuegen — facts ist dafuer die vollstaendige, abschliessende
   Liste. Sprache: Szenario, Zone, Bedingung — nie Gewissheit.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "ti-explain-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function fmt(v, step) {
    if (!isNum(v)) return "–";
    var d = v < 10 ? 2 : !step ? (v < 100 ? 1 : 0) : step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    /* Keine Scheingenauigkeit: Nachkommastellen nur, wo der Wert sie hat (95 statt 95,0). */
    return v.toLocaleString("de-DE", { minimumFractionDigits: v < 10 ? d : 0, maximumFractionDigits: d });
  }
  function zone(z, cur) { return z ? fmt(z.zoneLow, z.displayStep) + "–" + fmt(z.zoneHigh, z.displayStep) + (cur ? " " + cur : "") : "–"; }
  function pct(v) { return isNum(v) ? Math.round(v * 100) + " %" : "–"; }

  var OUTLOOK = { BULLISH: "Aufwärts", BEARISH: "Abwärts", NEUTRAL: "Seitwärts", MIXED: "Gemischt" };
  var STRUCTURE = {
    UPTREND_ADVANCING: "Aufwärtstrend intakt", CORRECTION_IN_UPTREND: "Rücksetzer im Aufwärtstrend",
    DOWNTREND_ADVANCING: "Abwärtstrend intakt", RALLY_IN_DOWNTREND: "Erholung im Abwärtstrend",
    SIDEWAYS_RANGE: "Seitwärtsphase", NO_CLEAR_TREND: "Kein klarer Trend"
  };
  var CONF = { HIGH: "Hoch", MODERATE: "Mittel", LOW: "Niedrig" };
  var TEMPLATE = {
    PULLBACK: "Rücksetzer in eine Unterstützungszone, danach Fortsetzung",
    CONTINUATION: "Trendfortsetzung — interessant bei Rücklauf in die Zone",
    BREAKOUT_RETEST: "Ausbruch mit Rücktest des Ausbruchsniveaus",
    RANGE: "Seitwärtsspanne — erst ein Schluss außerhalb entscheidet",
    DEEPER_CORRECTION: "Tiefere Korrektur bis zur nächsten größeren Zone",
    EXTENDED_MOVE: "Ausgedehnte Bewegung bis in die äußerste Zielzone"
  };
  var FAMILY = { TREND: "Trend", MOMENTUM: "Bewegungsstärke", STRUCTURE: "Hochs und Tiefs", HIGHER_TIMEFRAME: "Wochenchart", VOLUME: "Volumen", PATTERN: "Chartformation", ELLIOTT: "Wellenstruktur", WYCKOFF: "Wyckoff-Phase", VOLATILITY: "Schwankung" };

  /** Vereinfachte Wellensprache fuer Einsteiger (Profi-Ansicht zeigt die Notation). */
  function waveConsumer(p) {
    if (!p) return null;
    if (p.complete) return p.family === "MOTIVE" ? (p.direction === "UP" ? "Aufwärtsbewegung abgeschlossen – Korrektur möglich" : "Abwärtsbewegung abgeschlossen – Gegenbewegung möglich") : "Korrektur abgeschlossen – Trend kann fortsetzen";
    var w = p.currentWave;
    if (p.family === "MOTIVE") {
      if (w.wave === 5) return "Möglicherweise letzter Schub der Bewegung";
      if (w.role === "CORRECTIVE") return "Zwischenkorrektur innerhalb einer größeren Bewegung";
      if (w.wave === 3) return "Kräftigster Teil einer Bewegung möglich";
      return "Frühe Phase einer neuen Bewegung";
    }
    if (p.pattern === "TRIANGLE") return "Seitliche Verdichtung vor dem nächsten Schub";
    return w.label === "C" || w.label === "Y" || w.label === "Y·c" ? "Letzter Abschnitt einer Korrektur" : "Korrektur läuft";
  }

  /** Vollstaendige, abschliessende Faktenliste (auch fuer ein LLM). */
  function facts(r, currency) {
    var p = r.primaryScenario, cur = currency || "$";
    var f = { symbol: r.symbol, asOf: r.asOf, timeframe: r.timeframe, close: r.price.close, outlook: r.outlook.label, structure: r.outlook.structure, confidence: r.confidence.overall,
              agreement: r.confluence.level, supporting: r.confluence.supporting, opposing: r.confluence.opposing, why: r.evidence.why, against: r.evidence.against,
              primary: p ? { direction: p.direction, template: p.template, status: p.status, entry: p.entryZone ? [p.entryZone.zoneLow, p.entryZone.zoneHigh] : null,
                             invalidation: p.invalidation ? p.invalidation.price : null, invalidationRule: p.invalidation ? p.invalidation.rule : null,
                             targets: (p.targets || []).map(function (z) { return [z.zoneLow, z.zoneHigh]; }), confirmation: p.confirmation ? p.confirmation.price : null } : null,
              empirical: r.confidence.empirical && r.confidence.empirical.status === "OK" ? { n: r.confidence.empirical.n, hitRate: r.confidence.empirical.t1HitRate, baseline: r.confidence.empirical.baselineRate,
                         medianBarsToT1: r.confidence.empirical.medianBarsToT1, p25: r.confidence.empirical.p25BarsToT1, p75: r.confidence.empirical.p75BarsToT1 } : null,
              weekly: r.timeframes.weekly ? r.timeframes.weekly.outlook : null, alignment: r.timeframes.alignment, currency: cur,
              rules: "Keine Zahl, Welle oder Quote ergaenzen. Keine Gewissheit formulieren. Begriffe: Szenario, Zone, Bedingung." };
    return f;
  }

  function summary(r, currency) {
    var p = r.primaryScenario, cur = currency || "$", out = [];
    var st = STRUCTURE[r.outlook.structure] || "";
    if (r.outlook.structure === "UPTREND_ADVANCING" || r.outlook.structure === "CORRECTION_IN_UPTREND") out.push("Der übergeordnete Aufwärtstrend ist intakt" + (r.outlook.structure === "CORRECTION_IN_UPTREND" ? ", aktuell läuft ein Rücksetzer." : "."));
    else if (r.outlook.structure === "DOWNTREND_ADVANCING" || r.outlook.structure === "RALLY_IN_DOWNTREND") out.push("Der übergeordnete Trend zeigt abwärts" + (r.outlook.structure === "RALLY_IN_DOWNTREND" ? ", aktuell läuft eine Erholung." : "."));
    else out.push(st + ".");
    if (r.outlook.label === "MIXED") out.push("Die Verfahren widersprechen sich – das Bild ist gemischt.");
    if (p && p.entryZone && p.direction !== "NEUTRAL") {
      var src = (p.entryZone.confluence || 1) >= 2 ? "Mehrere Verfahren bündeln sich" : "Die nächste markante Zone liegt";
      out.push(src + " zwischen " + fmt(p.entryZone.zoneLow, p.entryZone.displayStep) + " und " + fmt(p.entryZone.zoneHigh, p.entryZone.displayStep) + " " + cur + ".");
      if (p.invalidation) out.push("Solange " + fmt(p.invalidation.price) + " " + cur + " nicht per Schlusskurs " + (p.invalidation.direction === "below" ? "unterschritten" : "überschritten") + " wird, bleibt das Szenario gültig.");
      if (p.targets && p.targets[0]) out.push("Die erste Zielzone liegt bei " + zone(p.targets[0], cur) + ".");
    } else if (p && p.template === "RANGE") {
      out.push("Der Kurs bewegt sich zwischen " + fmt(p.range.support.zoneHigh) + " und " + fmt(p.range.resistance.zoneLow) + " " + cur + "; erst ein Schluss außerhalb gibt eine Richtung vor.");
    }
    return out.join(" ");
  }

  function evidenceLine(r) {
    var e = r.confidence.empirical;
    if (!e) return null;
    if (e.status !== "OK") return { status: e.status, text: e.status === "INSUFFICIENT_SAMPLE" ? "Für diese Konstellation gibt es bisher zu wenige vergleichbare Fälle (" + e.n + ") für eine belastbare Aussage." : "Für diese Konstellation liegen keine vergleichbaren historischen Fälle vor." };
    var unit = r.timeframe === "1W" ? "Wochen" : "Handelstage";
    return { status: "OK", n: e.n, hitRate: e.t1HitRate, baseline: e.baselineRate, lift: e.lift, liftCiLow: e.liftCiLow,
             window: isNum(e.p25BarsToT1) && isNum(e.p75BarsToT1) ? Math.round(e.p25BarsToT1) + "–" + Math.round(e.p75BarsToT1) + " " + unit : null,
             edge: isNum(e.liftCiLow) && e.liftCiLow > 0 ? "BETTER_THAN_RANDOM" : isNum(e.lift) && e.lift > 0 ? "SLIGHTLY_BETTER_UNCERTAIN" : "NO_EDGE",
             text: "Ähnliche Lagen erreichten Zielzone 1 in " + pct(e.t1HitRate) + " der Fälle; zufällige Einstiege mit gleichem Abstand zu Ziel und Grenze in " + pct(e.baselineRate) + "." };
  }

  var api = { VERSION: VERSION, OUTLOOK: OUTLOOK, STRUCTURE: STRUCTURE, CONF: CONF, TEMPLATE: TEMPLATE, FAMILY: FAMILY, waveConsumer: waveConsumer, facts: facts, summary: summary, evidenceLine: evidenceLine, fmt: fmt, zone: zone, pct: pct };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIExplain = api; }
})(typeof window !== "undefined" ? window : globalThis);
