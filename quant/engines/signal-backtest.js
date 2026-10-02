/* =========================================================================
   VISION UNIVERSE QUANT — SIGNAL BACKTEST v1 (Wochenraster)

   Frage: Was geschah historisch, nachdem ein Radar-Signal auftrat - ueber
   viele Aktien und Jahrzehnte, ohne Rueckschau und ohne Optimierung?

   Grundsaetze, je als Pruefung und nicht als Prosa:

   - Jede Regel ist vor dem Lauf festgelegt (dieselbe Definition wie das
     Tagessignal, auf das Wochenraster uebertragen) und versioniert. Es gibt
     keine Parametersuche; Nachbarparameter werden nur gemessen, um zu
     zeigen, ob ein Befund an genau einer Einstellung haengt.
   - Ein Signal liest nur Schlusskurse bis einschliesslich Woche t. Der
     Einstieg liegt strikt danach (Standard: Schluss der Folgewoche). Der
     Build prueft das an echten Faellen, indem er die Zukunft abschneidet.
   - Jede Zahl traegt ihre Renditebasis. Die Wochenreihen sind
     splitbereinigt (SPLIT_ADJUSTED_PRICE), also Kursrendite ohne
     Dividenden. Ein Backtest verlangt laut return-semantics TOTAL_RETURN;
     solange die Gesamtrendite fehlt, bleibt das Vertrauen begrenzt.
   - Vergleich ist immer die Marktbasis derselben Woche (Median aller Titel)
     und der SPY-Kurs ueber dasselbe Fenster. Eine Rendite ohne Vergleich
     sagt nichts ueber das Signal.
   - Vertrauen ist eine Folge gemessener Pruefungen (TRUST_RULE), keine
     Einschaetzung. Ohne harte Belege gibt es keine hohe Stufe.

   Kein Prognosewert, keine Empfehlung, keine Gesamtnote.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var VERSION = "signal-backtest-2.0.0";
  var STUDY_SCHEMA = "signal-backtest-study-2.0.0";
  var RETURN_TYPE = "SPLIT_ADJUSTED_PRICE";
  var REQUIRED_RETURN_TYPE = "TOTAL_RETURN";

  var HORIZONS = [
    { id: "m1", weeks: 4, label: "1 Monat" },
    { id: "m3", weeks: 13, label: "3 Monate" },
    { id: "m6", weeks: 26, label: "6 Monate" },
    { id: "m12", weeks: 52, label: "12 Monate" }
  ];

  /* Reibung je Runde (Kauf + Verkauf), uebernommen aus pattern-research-v1
     frictions: 20 bps Kosten + 10 bps Slippage. */
  var FRICTIONS = { roundTripBps: 20, slippageBps: 10 };
  /* Kostenszenarien je Runde (Kommission + Spread + Slippage), identisch mit
     setup-backtest-contract-v1. BASE = FRICTIONS. Marktbasis und SPY sind
     passive Vergleiche und tragen keine Kosten - die Kosten belasten nur das
     Signal. */
  var COST_SCENARIOS = { LOW: 10, BASE: 30, HIGH: 60 };

  var COOLDOWN_WEEKS = 13;
  var WARMUP_WEEKS = 53;
  var TOUCH_THRESHOLD = 0.10;
  var REGIME = { version: "spy-trend-26w-1.0.0", weeks: 26, band: 0.05,
    plain: "Marktphase aus der SPY-Kursentwicklung über 26 Wochen: über +5 % steigend, unter −5 % fallend, dazwischen seitwärts." };

  /* Versionierte Einstiegs- und Ausstiegssemantik. Ein Zustand
     NOT_DEFINED_BY_CONTRACT heisst: der Signal- oder Setup-Vertrag legt die
     Regel nicht eindeutig fest, also wird sie nicht erfunden. */
  var SEMANTICS = {
    version: "entry-exit-1.0.0",
    signal: {
      entries: [
        { id: "NEXT_CLOSE", state: "SUPPORTED", isDefault: true, plain: "Einstieg zum Schluss der Woche nach dem Signal" },
        { id: "CLOSE", state: "SUPPORTED", plain: "Einstieg zum Schluss der Signalwoche (leicht optimistisch, nur zum Vergleich)" },
        { id: "INTRADAY", state: "NOT_AVAILABLE", reason: "INTRADAY_HISTORY_MISSING", plain: "Keine Intraday-Historie über Jahrzehnte" },
        { id: "BREAKOUT", state: "NOT_DEFINED_BY_CONTRACT", reason: "SIGNAL_HAS_NO_TRIGGER_LEVEL", plain: "Das Signal hat keine Ausbruchsmarke" }
      ],
      exits: [
        { id: "TIME_EXIT", state: "SUPPORTED", isDefault: true, plain: "Ausstieg nach festem Zeitraum (1, 3, 6, 12 Monate)" },
        { id: "OPPOSITE_SIGNAL", state: "SUPPORTED", plain: "Ausstieg beim Gegensignal, spätestens nach 12 Monaten" },
        { id: "STOP", state: "NOT_DEFINED_BY_CONTRACT", reason: "SIGNAL_HAS_NO_STOP", plain: "Das Signal legt keinen Stop fest" },
        { id: "INVALIDATION", state: "NOT_DEFINED_BY_CONTRACT", reason: "SIGNAL_HAS_NO_INVALIDATION", plain: "Das Signal legt keine Invalidierung fest" },
        { id: "TARGET", state: "NOT_DEFINED_BY_CONTRACT", reason: "SIGNAL_HAS_NO_TARGET", plain: "Das Signal legt kein Ziel fest" },
        { id: "TRAILING", state: "NOT_DEFINED_BY_CONTRACT", reason: "NO_TRAILING_RULE", plain: "Kein Nachziehen eines Stops im Vertrag" }
      ]
    },
    setup: {
      entries: [
        { id: "NEXT_CLOSE", state: "SUPPORTED", isDefault: true, plain: "Einstieg zum Schluss des Tages nach dem bestätigten Setup" },
        { id: "CLOSE", state: "SUPPORTED", plain: "Einstieg zum Schluss des Bestätigungstags" },
        { id: "BREAKOUT", state: "NOT_DEFINED_BY_CONTRACT", reason: "TRIGGER_IS_A_ZONE_NOT_AN_ORDER", plain: "Der Auslöser ist eine Zone, keine Order" },
        { id: "INTRADAY", state: "NOT_AVAILABLE", reason: "INTRADAY_HISTORY_MISSING", plain: "Keine Intraday-Historie" }
      ],
      exits: [
        { id: "TIME_EXIT", state: "SUPPORTED", isDefault: true, plain: "Ausstieg nach festem Zeitraum" },
        { id: "INVALIDATION", state: "SUPPORTED", plain: "Schluss unter der Invalidierungsmarke der technischen Auswertung" },
        { id: "TARGET", state: "SUPPORTED", plain: "Erste Zielzone der technischen Auswertung erreicht (Tageshoch)" },
        { id: "STOP", state: "NOT_DEFINED_BY_CONTRACT", reason: "STOP_EQUALS_INVALIDATION", plain: "Ein eigener Stop neben der Invalidierung ist nicht festgelegt" },
        { id: "TRAILING", state: "NOT_DEFINED_BY_CONTRACT", reason: "NO_TRAILING_RULE", plain: "Kein Nachziehen im Vertrag" },
        { id: "OPPOSITE_SIGNAL", state: "NOT_DEFINED_BY_CONTRACT", reason: "PATH_STATES_CLOSED", plain: "Pfadzustände der Setup-Engine sind geschlossen" }
      ]
    }
  };

  function finite(v) { return typeof v === "number" && v === v && v !== Infinity && v !== -Infinity; }
  function valid(v) { return finite(v) && v > 0; }

  function retOver(c, i, weeks) {
    var j = i - weeks;
    if (j < 0 || !valid(c[i]) || !valid(c[j])) return null;
    return c[i] / c[j] - 1;
  }
  function smaAt(c, i, weeks) {
    if (i - weeks + 1 < 0) return null;
    var s = 0;
    for (var k = i - weeks + 1; k <= i; k++) { if (!valid(c[k])) return null; s += c[k]; }
    return s / weeks;
  }
  function priorMax(c, i, weeks) {
    if (i - weeks < 0) return null;
    var m = -Infinity, seen = 0;
    for (var k = i - weeks; k < i; k++) if (valid(c[k])) { seen++; if (c[k] > m) m = c[k]; }
    return seen >= weeks * 0.8 ? m : null;
  }

  /* Regeln. detect(c, i, p) liest nur c[0..i]. */
  var RULES = [
    { id: "MOMENTUM_IMPROVED", version: "1.0.0", family: "momentum", opposite: "MOMENTUM_DETERIORATED",
      dailyDefinition: "positive-momentum ENTERED: Kursentwicklung über 6 Monate ≥ 0 %",
      plain: "Die Kursentwicklung über 26 Wochen wechselt von negativ auf null oder positiv.",
      params: { weeks: 26 }, neighbours: [{ weeks: 22 }, { weeks: 30 }],
      detect: function (c, i, p) { var a = retOver(c, i, p.weeks), b = retOver(c, i - 1, p.weeks); return a !== null && b !== null && a >= 0 && b < 0; } },
    { id: "MOMENTUM_DETERIORATED", version: "1.0.0", family: "momentum", opposite: "MOMENTUM_IMPROVED",
      dailyDefinition: "positive-momentum EXITED: Kursentwicklung über 6 Monate fällt unter 0 %",
      plain: "Die Kursentwicklung über 26 Wochen wechselt von null oder positiv auf negativ.",
      params: { weeks: 26 }, neighbours: [{ weeks: 22 }, { weeks: 30 }],
      detect: function (c, i, p) { var a = retOver(c, i, p.weeks), b = retOver(c, i - 1, p.weeks); return a !== null && b !== null && a < 0 && b >= 0; } },
    { id: "TREND_UP", version: "1.0.0", family: "trend", opposite: "TREND_DOWN",
      dailyDefinition: "above-long-trend ENTERED: Kurs an oder über dem 200-Tage-Durchschnitt",
      plain: "Der Wochenschluss steigt an oder über den 40-Wochen-Durchschnitt (≈ 200 Handelstage).",
      params: { weeks: 40 }, neighbours: [{ weeks: 36 }, { weeks: 44 }],
      detect: function (c, i, p) { var s = smaAt(c, i, p.weeks), t = smaAt(c, i - 1, p.weeks); return s !== null && t !== null && c[i] >= s && c[i - 1] < t; } },
    { id: "TREND_DOWN", version: "1.0.0", family: "trend", opposite: "TREND_UP",
      dailyDefinition: "above-long-trend EXITED: Kurs unter dem 200-Tage-Durchschnitt",
      plain: "Der Wochenschluss fällt unter den 40-Wochen-Durchschnitt (≈ 200 Handelstage).",
      params: { weeks: 40 }, neighbours: [{ weeks: 36 }, { weeks: 44 }],
      detect: function (c, i, p) { var s = smaAt(c, i, p.weeks), t = smaAt(c, i - 1, p.weeks); return s !== null && t !== null && c[i] < s && c[i - 1] >= t; } },
    { id: "NEW_52W_HIGH", version: "1.0.0", family: "high", opposite: null,
      dailyDefinition: "market-factors newHigh52w: Tageshoch ≥ höchstes Hoch der letzten 252 Handelstage",
      plain: "Der Wochenschluss liegt über allen Wochenschlüssen der 52 Wochen davor, und in der Vorwoche war das nicht so (Schlusskurs-Variante des Tagessignals).",
      params: { weeks: 52 }, neighbours: [{ weeks: 48 }, { weeks: 56 }],
      detect: function (c, i, p) {
        var m = priorMax(c, i, p.weeks), mPrev = priorMax(c, i - 1, p.weeks);
        if (m === null || mPrev === null || !valid(c[i]) || !valid(c[i - 1])) return false;
        return c[i] > m && !(c[i - 1] > mPrev);
      } }
  ];
  var RULE_BY_ID = {};
  RULES.forEach(function (r) { RULE_BY_ID[r.id] = r; });

  /* Radar-Ereignisarten, die (noch) keine lange Historie haben. Der Grund
     ist gemessen und steht im Artefakt. */
  var WITHOUT_HISTORY = {
    SETUP_FORMING: "SETUP_HISTORY_TOO_SHORT", SETUP_NEW: "SETUP_HISTORY_TOO_SHORT", SETUP_CONFIRMED: "SETUP_HISTORY_TOO_SHORT",
    SETUP_WEAKENED: "SETUP_HISTORY_TOO_SHORT", SETUP_INVALIDATED: "PATH_STATES_CLOSED",
    RISK_RISING: "FACTOR_HISTORY_TOO_SHORT", FACTOR_CHANGED: "FACTOR_HISTORY_TOO_SHORT",
    STRATEGY_MATCH_NEW: "MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT", STRATEGY_MATCH_LOST: "MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT",
    PATTERN_MATCH_NEW: "PATTERN_MATCH_HISTORY_TOO_SHORT"
  };

  /* Ereignisse einer Reihe, mit Abkuehlzeit gegen Flackern. */
  function detectEvents(c, rule, params) {
    var p = params || rule.params, out = [], last = -Infinity;
    for (var i = Math.max(1, WARMUP_WEEKS); i < c.length; i++) {
      if (!rule.detect(c, i, p)) continue;
      if (i - last >= COOLDOWN_WEEKS) out.push(i);
      last = i;
    }
    return out;
  }

  function frictionFactor() { return 1 - (FRICTIONS.roundTripBps + FRICTIONS.slippageBps) / 10000; }

  /* Ergebnis ab Einstiegsindex e ueber h Wochen. Liest nur nach e. */
  function outcome(c, e, h) {
    var end = e + h;
    if (end >= c.length || !valid(c[e]) || !valid(c[end])) return null;
    var entry = c[e], peak = entry, maxDd = 0, mae = 0, mfe = 0, seen = 0;
    for (var k = e + 1; k <= end; k++) {
      if (!valid(c[k])) continue;
      seen++;
      var r = c[k] / entry - 1;
      if (r < mae) mae = r;
      if (r > mfe) mfe = r;
      if (c[k] > peak) peak = c[k];
      var dd = c[k] / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
    if (seen < h * 0.8) return null;
    return { ret: (c[end] / entry) * frictionFactor() - 1, grossRet: c[end] / entry - 1, maxDrawdown: maxDd, mae: mae, mfe: mfe };
  }

  /* Was wird zuerst erreicht: +10 % oder −10 %, innerhalb von 52 Wochen. */
  function firstTouch(c, e, maxWeeks) {
    if (!valid(c[e])) return null;
    var end = Math.min(c.length - 1, e + maxWeeks);
    for (var k = e + 1; k <= end; k++) {
      if (!valid(c[k])) continue;
      var r = c[k] / c[e] - 1;
      if (r >= TOUCH_THRESHOLD) return { first: "UP", weeks: k - e };
      if (r <= -TOUCH_THRESHOLD) return { first: "DOWN", weeks: k - e };
    }
    return e + maxWeeks < c.length ? { first: "NONE", weeks: maxWeeks } : null;
  }

  /* Ausstieg beim Gegensignal (erkannt in Woche k, verkauft zum Schluss
     k + 1), spaetestens nach maxWeeks. */
  function oppositeExit(c, e, rule, maxWeeks) {
    var opp = rule.opposite ? RULE_BY_ID[rule.opposite] : null;
    if (!opp || !valid(c[e])) return null;
    for (var k = e + 1; k <= e + maxWeeks && k + 1 < c.length; k++) {
      if (opp.detect(c, k, opp.params) && valid(c[k + 1])) return { ret: (c[k + 1] / c[e]) * frictionFactor() - 1, weeks: k + 1 - e, exit: "OPPOSITE_SIGNAL" };
    }
    var end = e + maxWeeks;
    if (end >= c.length || !valid(c[end])) return null;
    return { ret: (c[end] / c[e]) * frictionFactor() - 1, weeks: maxWeeks, exit: "TIME_EXIT" };
  }

  function sortedCopy(values) { var s = Float64Array.from(values); s.sort(); return s; }
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function median(values) { return values.length ? quantile(sortedCopy(values), 0.5) : null; }
  function mean(values) { if (!values.length) return null; var s = 0; for (var i = 0; i < values.length; i++) s += values[i]; return s / values.length; }

  function wilson(successes, total) {
    if (!total) return null;
    var z = 1.96, p = successes / total, z2 = z * z, denom = 1 + z2 / total;
    var centre = (p + z2 / (2 * total)) / denom;
    var half = (z / denom) * Math.sqrt(p * (1 - p) / total + z2 / (4 * total * total));
    return [round(Math.max(0, centre - half), 4), round(Math.min(1, centre + half), 4)];
  }

  function round(v, d) { if (!finite(v)) return null; var f = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * f) / f; }

  /* Verteilung einer Renditeliste in festen, offen gelegten Klassen. */
  var BINS = [-Infinity, -0.5, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 1, Infinity];
  function histogram(values) {
    var counts = new Array(BINS.length - 1).fill(0);
    for (var i = 0; i < values.length; i++) {
      for (var b = 0; b < BINS.length - 1; b++) if (values[i] >= BINS[b] && values[i] < BINS[b + 1]) { counts[b]++; break; }
    }
    return BINS.slice(0, -1).map(function (lo, b) { return { from: finite(lo) ? lo : null, to: finite(BINS[b + 1]) ? BINS[b + 1] : null, count: counts[b] }; });
  }

  function summarize(rets) {
    var s = sortedCopy(rets), n = s.length, pos = 0, wins = [], losses = [];
    for (var i = 0; i < n; i++) { if (s[i] > 0) { pos++; wins.push(s[i]); } else losses.push(s[i]); }
    return {
      n: n, positiveShare: n ? round(pos / n) : null, positiveInterval: wilson(pos, n),
      median: round(quantile(s, 0.5)), mean: round(mean(rets)),
      p10: round(quantile(s, 0.1)), p25: round(quantile(s, 0.25)), p75: round(quantile(s, 0.75)), p90: round(quantile(s, 0.9)),
      avgWin: round(mean(wins)), avgLoss: round(mean(losses))
    };
  }

  /* ---------------------------------------------------------------------
     TRUST ENGINE. Pruefungen mit gemessenem Wert, daraus eine Stufe nach
     einer festen Regel. PIT und Look-ahead sind P0: faellt eine davon,
     ist die Stufe NOT_READY, egal wie gross die Stichprobe ist.
     --------------------------------------------------------------------- */
  var TRUST_STATES = ["NOT_READY", "LIMITED", "USABLE", "ROBUST"];
  var TRUST_LABEL = { NOT_READY: "nicht bereit", LIMITED: "eingeschränkt", USABLE: "belastbar", ROBUST: "robust" };
  var TRUST_CHECKS = [
    { id: "pit", label: "Point-in-Time", hard: true },
    { id: "lookahead", label: "Kein Blick in die Zukunft", hard: true },
    { id: "sample", label: "Stichprobe" },
    { id: "oos", label: "Prüfung außerhalb des Lernzeitraums" },
    { id: "walkForward", label: "Walk-Forward" },
    { id: "survivorship", label: "Überlebende-Kontrolle" },
    { id: "returnBasis", label: "Gesamtrendite (inkl. Dividenden)" },
    { id: "costs", label: "Kosten" },
    { id: "slippage", label: "Ausführungsabschlag" },
    { id: "benchmark", label: "Vergleich mit Markt und Index" },
    { id: "regimeDiversity", label: "Verschiedene Marktphasen" },
    { id: "independence", label: "Unabhängigkeit der Fälle" },
    { id: "parameterStability", label: "Parameter-Stabilität" },
    { id: "completeness", label: "Vollständigkeit" }
  ];
  var TRUST_RULE = {
    version: "trust-rule-1.0.0",
    sample: { LIMITED: { n: 100, titles: 20 }, USABLE: { n: 1000, titles: 100 }, ROBUST: { n: 3000, titles: 300 } },
    NOT_READY: "pit oder lookahead nicht bestanden, oder Stichprobe unter dem Minimum für eingeschränkt",
    USABLE: ["sample", "oos", "walkForward", "survivorship", "returnBasis", "costs", "slippage", "benchmark", "completeness", "independence"],
    ROBUST: TRUST_CHECKS.map(function (c) { return c.id; }),
    plain: "Eine Stufe gilt nur, wenn jede für sie verlangte Prüfung bestanden ist. Ohne Überlebende-Kontrolle und ohne Gesamtrendite bleibt jede Auswertung eingeschränkt."
  };

  /* Cluster-robuste Schaetzung eines Mittelwerts (z. B. Trefferquote minus
     Base Rate derselben Woche). Faelle derselben Periode (Quartal) sind
     nicht unabhaengig; die Streuung wird ueber Cluster-Summen geschaetzt. */
  function clusterMean(values, clusters) {
    var n = values.length, sums = {}, counts = {}, total = 0;
    if (!n) return null;
    for (var i = 0; i < n; i++) { var c = clusters[i]; sums[c] = (sums[c] || 0) + values[i]; counts[c] = (counts[c] || 0) + 1; total += values[i]; }
    var mean = total / n, keys = Object.keys(sums), C = keys.length;
    var vc = 0, viid = 0;
    keys.forEach(function (k) { var d = sums[k] - counts[k] * mean; vc += d * d; });
    vc = C > 1 ? (C / (C - 1)) * vc / (n * n) : null;
    for (var j = 0; j < n; j++) viid += (values[j] - mean) * (values[j] - mean);
    viid = n > 1 ? viid / (n - 1) / n : null;
    var se = vc === null ? null : Math.sqrt(vc);
    var maxShare = Math.max.apply(null, keys.map(function (k) { return counts[k]; })) / n;
    return { mean: round(mean), se: round(se), ci: se === null ? null : [round(mean - 1.96 * se), round(mean + 1.96 * se)], clusters: C, maxClusterShare: round(maxShare, 3),
      designEffect: vc && viid ? round(vc / viid, 2) : null, effectiveN: vc && viid ? Math.round(n / (vc / viid)) : null };
  }

  function sampleLevel(n, titles) {
    var s = TRUST_RULE.sample;
    if (n >= s.ROBUST.n && titles >= s.ROBUST.titles) return "ROBUST";
    if (n >= s.USABLE.n && titles >= s.USABLE.titles) return "USABLE";
    if (n >= s.LIMITED.n && titles >= s.LIMITED.titles) return "LIMITED";
    return "NOT_READY";
  }

  /* checks: { id: { state: "PASS"|"FAIL", value, reason } }, sample: {n, titles} */
  function trustState(checks, sample) {
    function pass(id) { return checks[id] && checks[id].state === "PASS"; }
    var level = sampleLevel(sample.n, sample.titles);
    if (!pass("pit") || !pass("lookahead") || level === "NOT_READY") return "NOT_READY";
    var usable = TRUST_RULE.USABLE.every(function (id) { return id === "sample" ? level !== "LIMITED" : pass(id); });
    if (!usable) return "LIMITED";
    var robust = level === "ROBUST" && TRUST_RULE.ROBUST.every(function (id) { return id === "sample" || pass(id); });
    return robust ? "ROBUST" : "USABLE";
  }

  function trustReasons(checks) {
    return TRUST_CHECKS.filter(function (c) { return !checks[c.id] || checks[c.id].state !== "PASS"; })
      .map(function (c) { return { id: c.id, label: c.label, reason: checks[c.id] ? checks[c.id].reason || null : "NOT_MEASURED" }; });
  }

  /* Eine Methodik kann Ausgangszahlen zusaetzlich sperren, bis sie
     zertifiziert ist (setup-state-v1 requirements.backtestCertification).
     Dann zeigt auch eine ausreichende Vertrauensstufe nichts. */
  function displayAllowed(trust, certification) {
    if (certification !== undefined && certification !== null && certification !== "CERTIFIED") return false;
    return trust === "LIMITED" || trust === "USABLE" || trust === "ROBUST";
  }

  /* Satz fuer Karten und Seiten. Keine Prognose, keine Empfehlung. */
  function observedSentence(n, subject) {
    return (subject || "Dieses Signal") + " wurde " + Number(n).toLocaleString("de-DE") + "-mal historisch beobachtet.";
  }

  var FORBIDDEN_KEYS = ["probability", "successRate", "expectedReturn", "targetPrice", "winRate", "hitRate", "confidenceOfSuccess", "score", "forecast", "recommendation", "rating"];

  function scanForbidden(node, path, errors) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(function (v, i) { scanForbidden(v, path + "[" + i + "]", errors); }); return; }
    Object.keys(node).forEach(function (k) {
      if (FORBIDDEN_KEYS.indexOf(k) >= 0) errors.push("forbidden field '" + path + "." + k + "'");
      scanForbidden(node[k], path + "." + k, errors);
    });
  }

  /* Ein Studienartefakt ist nur veroeffentlichbar, wenn jede Regel ihre
     Renditebasis, ihre Pruefungen und eine regelkonforme Stufe traegt. */
  function studyViolations(study) {
    var errors = [];
    if (!study || study.schemaVersion !== STUDY_SCHEMA) return ["unexpected schemaVersion"];
    scanForbidden(study, "study", errors);
    (study.rules || []).forEach(function (r) {
      if (r.returnType !== RETURN_TYPE && r.returnType !== REQUIRED_RETURN_TYPE) errors.push(r.id + ": returnType missing");
      if (!r.checks || TRUST_CHECKS.some(function (c) { return !r.checks[c.id]; })) errors.push(r.id + ": a trust check is not measured");
      if (TRUST_STATES.indexOf(r.trust) < 0) errors.push(r.id + ": unknown trust state");
      if (r.checks && r.sample && r.trust !== trustState(r.checks, r.sample)) errors.push(r.id + ": trust does not follow TRUST_RULE");
      if (r.returnType !== REQUIRED_RETURN_TYPE && (r.trust === "USABLE" || r.trust === "ROBUST")) errors.push(r.id + ": high trust without TOTAL_RETURN");
      /* Die Renditebasis wird nicht behauptet, sondern geprueft: TOTAL_RETURN
         nur mit bestandenem returnBasis-Check, und umgekehrt. */
      if (r.checks && r.checks.returnBasis && ((r.returnType === REQUIRED_RETURN_TYPE) !== (r.checks.returnBasis.state === "PASS"))) errors.push(r.id + ": returnType and returnBasis check disagree");
      if (study.returnType && r.returnType !== study.returnType) errors.push(r.id + ": rule returnType differs from study returnType");
      /* Base Rate und Signal auf derselben Basis - keine Mischbasis
         (Owner-Programm 02.10.2026, §14). Die Signal-Studie muss die Basis
         ihrer Base Rate ausweisen. */
      if (study.basisContract && !r.baseRateReturnType) errors.push(r.id + ": base rate return basis not recorded");
      if (r.baseRateReturnType && r.baseRateReturnType !== r.returnType) errors.push(r.id + ": base rate return basis differs from signal return basis");
      if (r.checks && r.checks.survivorship && r.checks.survivorship.state !== "PASS" && (r.trust === "USABLE" || r.trust === "ROBUST")) errors.push(r.id + ": high trust without survivorship control");
      if (r.display && r.display.allowed !== displayAllowed(r.trust, study.certification)) errors.push(r.id + ": display gate does not follow trust and certification");
    });
    var z = study.survivorshipSensitivity;
    if (z && z.computed && z.returnType !== study.returnType) errors.push("survivorship sensitivity uses a different return basis than the study");
    return errors;
  }

  var api = {
    VERSION: VERSION, STUDY_SCHEMA: STUDY_SCHEMA, RETURN_TYPE: RETURN_TYPE, REQUIRED_RETURN_TYPE: REQUIRED_RETURN_TYPE,
    HORIZONS: HORIZONS, FRICTIONS: FRICTIONS, COST_SCENARIOS: COST_SCENARIOS, clusterMean: clusterMean, COOLDOWN_WEEKS: COOLDOWN_WEEKS, WARMUP_WEEKS: WARMUP_WEEKS, TOUCH_THRESHOLD: TOUCH_THRESHOLD,
    REGIME: REGIME, SEMANTICS: SEMANTICS, RULES: RULES, RULE_BY_ID: RULE_BY_ID, WITHOUT_HISTORY: WITHOUT_HISTORY,
    TRUST_STATES: TRUST_STATES, TRUST_LABEL: TRUST_LABEL, TRUST_CHECKS: TRUST_CHECKS, TRUST_RULE: TRUST_RULE, FORBIDDEN_KEYS: FORBIDDEN_KEYS,
    retOver: retOver, smaAt: smaAt, priorMax: priorMax, detectEvents: detectEvents, outcome: outcome, firstTouch: firstTouch, oppositeExit: oppositeExit,
    frictionFactor: frictionFactor, quantile: quantile, median: median, mean: mean, wilson: wilson, round: round, histogram: histogram, summarize: summarize,
    sampleLevel: sampleLevel, trustState: trustState, trustReasons: trustReasons, displayAllowed: displayAllowed, observedSentence: observedSentence,
    studyViolations: studyViolations
  };

  if (isNode) module.exports = api;
  else global.VUSignalBacktest = api;
})(typeof window !== "undefined" ? window : globalThis);
