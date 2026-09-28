/* =========================================================================
   HISTORISCHE VERGLEICHSFÄLLE — historical-cases-1.0.0

   FRAGE, DIE DIESE DATEI BEANTWORTET
   "Wann galt bei DIESEM Titel schon einmal dieselbe Lage, und was geschah
   danach?" - nicht "was wird passieren".

   WAS SIE IST UND WAS NICHT
   Dies ist KEINE neue Quant-Engine und KEINE neue Methodik. Gerechnet wird
   mit `pattern-research.js`, denselben Funktionen `featuresAt` und
   `outcomeAfter`, mit denen die marktweite Studie entstanden ist, samt
   ihrem geprüften Leckage-Vertrag. Neu sind hier ausschliesslich die
   Darstellungs- und Schwellenregeln, und genau die trägt die eigene
   Version.

   DIE DREI EBENEN, DIE DAS PRODUKT UNTERSCHEIDET
   1 SAME_STOCK       diese Datei: die eigene Wochenhistorie des Titels.
   2 SAME_STOCK_LOOSE diese Datei: dieselbe Historie, aber nur die
                      Preisbedingungen, nicht die vollständige Lage.
   3 MARKET_WIDE      `pattern-match-v1`: die Grundgesamtheit aller Titel.
                      Sie wird hier NICHT berechnet, nur eingeordnet.

   WARUM NUR PREISBEDINGUNGEN
   Die Studie kennt 29 Begriffe: 14 aus dem Kurs, 15 aus den Fundamentals.
   Fundamentale Begriffe brauchen Point-in-Time-Fundamentaldaten je Woche
   der Vergangenheit; die gibt es je Titel nicht. Eine Lage ohne sie
   nachzubauen und trotzdem "dieselbe Lage" zu nennen wäre falsch -
   deshalb sagt das Ergebnis ausdrücklich, dass es die Kurslage vergleicht.

   WARUM EPISODEN UND NICHT WOCHEN
   Eine Bedingung, die zwölf Wochen am Stück gilt, ist EIN Ereignis und
   nicht zwölf. Ungebündelt hätte ACGL 945 "Fälle" statt 28 - eine Zahl,
   die nur misst, wie lange ein Zustand anhielt. Gezählt wird deshalb die
   erste Woche jeder zusammenhängenden Folge.

   WARUM ZEHN
   Gemessen an einer Stichprobe von 300 Titeln erreichen 33,7 % zehn
   abgeschlossene Zwölf-Monats-Episoden, 48,3 % erreichen fünf. Unterhalb
   von zehn ist ein Median aus überlappenden Fenstern ein Rauschwert:
   MSFT käme auf sechs Episoden und -4,6 % - das ist keine Eigenschaft von
   Microsoft. Unter der Schwelle wird deshalb die Anzahl genannt und sonst
   nichts gerechnet. Fail closed.

   WAS DIESE ZAHLEN NICHT KÖNNEN, UND ES SAGEN
   - Wochenraster: ein Rückschlag innerhalb einer Woche ist unsichtbar.
   - Überlappende Fenster: zwei Episoden im Abstand von Wochen teilen sich
     fast denselben Zwölf-Monats-Ausgang. Unabhängig sind sie nicht.
   - Überlebenden-Auswahl: ein Titel mit langer Historie ist per
     Konstruktion einer, der lange genug existiert hat.
   - Kein Gesamtertrag: Ausschüttungen sind nicht enthalten.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var PatternResearch = isNode ? require("./pattern-research.js") : global.VUPatternResearch;

  var VERSION = "historical-cases-1.0.0";
  /* Die Zeitfenster in Wochen. Sie folgen der Studie: 13/26/52 Wochen. */
  var HORIZONS = [
    { id: "m3", weeks: 13, label: "3 Monate" },
    { id: "m6", weeks: 26, label: "6 Monate" },
    { id: "m12", weeks: 52, label: "12 Monate" }
  ];
  var MIN_EPISODES = 10;
  /* Vor Woche 52 kennt `featuresAt` kein Jahreshoch und keine Volatilität.
     Frueher zu beginnen hiesse, Bedingungen auf halben Fenstern zu pruefen. */
  var WARMUP_WEEKS = 52;
  var LIMITS = [
    "Wochenraster: Rückschläge innerhalb einer Woche sind nicht sichtbar.",
    "Die Zeitfenster überlappen sich; die Fälle sind nicht unabhängig voneinander.",
    "Nur Kursbedingungen - die Geschäftslage der Vergangenheit fliesst nicht ein.",
    "Ein Titel mit langer Historie ist per Konstruktion einer, der sie erlebt hat.",
    "Kursentwicklung ohne Ausschüttungen."
  ];

  function finite(v) { return typeof v === "number" && Number.isFinite(v); }
  function median(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* ---------------------------------------------------------------------
     Das Begriffs-Wörterbuch aus einem Pattern-Match-Bündel. Die Findings
     tragen ihre Begriffe als ID-Teile und als Terme in gleicher Reihenfolge;
     daraus entsteht die Zuordnung Begriff -> {feature, operator, value}.
     Sie wird ABGELEITET und nicht dupliziert: eine zweite Liste hier würde
     bei der nächsten Studienversion still auseinanderlaufen.
     --------------------------------------------------------------------- */
  function vocabulary(bundle) {
    var out = {};
    var findings = (bundle && bundle.findings) || [];
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      var parts = String(f.id || "").split("+");
      if (!Array.isArray(f.terms) || parts.length !== f.terms.length) continue;
      for (var k = 0; k < parts.length; k++) {
        if (!Object.prototype.hasOwnProperty.call(out, parts[k])) {
          out[parts[k]] = { id: parts[k], term: f.terms[k], family: f.family || null };
        }
      }
    }
    return out;
  }

  function holdsTerm(features, term) {
    var v = features[term.feature];
    if (v === null || v === undefined) return null;
    if (term.operator === "gte") return v >= term.value;
    if (term.operator === "lte") return v <= term.value;
    if (term.operator === "gt") return v > term.value;
    if (term.operator === "lt") return v < term.value;
    if (term.operator === "eq") return v === term.value;
    return null;
  }
  function allHold(features, terms) {
    for (var i = 0; i < terms.length; i++) if (holdsTerm(features, terms[i]) !== true) return false;
    return terms.length > 0;
  }

  /* ---------------------------------------------------------------------
     Der Kern. `bars` ist die veröffentlichte Wochenreihe des Titels
     ([{date, close}], aufsteigend), `holds` die Begriffe, die HEUTE gelten,
     `vocab` das Wörterbuch aus dem Pattern-Bündel.
     --------------------------------------------------------------------- */
  function assess(input) {
    var bars = (input && input.bars) || [];
    var vocab = (input && input.vocabulary) || {};
    var holds = (input && input.holds) || [];

    var priceTerms = [], conditionIds = [];
    for (var i = 0; i < holds.length; i++) {
      var entry = vocab[holds[i]];
      if (entry && entry.family === "PRICE" && entry.term) { priceTerms.push(entry.term); conditionIds.push(holds[i]); }
    }
    var base = {
      schemaVersion: VERSION,
      methodologyVersion: PatternResearch ? PatternResearch.METHODOLOGY_VERSION : null,
      level: "SAME_STOCK_PRICE_CONDITIONS",
      conditions: conditionIds,
      minEpisodes: MIN_EPISODES,
      limits: LIMITS.slice(),
      weeks: bars.length,
      from: bars.length ? bars[0].date : null,
      to: bars.length ? bars[bars.length - 1].date : null
    };
    if (!PatternResearch) return Object.assign(base, { state: "UNAVAILABLE", reason: "PATTERN_ENGINE_MISSING" });
    if (!priceTerms.length) return Object.assign(base, { state: "UNAVAILABLE", reason: "NO_PRICE_CONDITION_TODAY" });
    if (bars.length < WARMUP_WEEKS + HORIZONS[0].weeks + 2) {
      return Object.assign(base, { state: "UNAVAILABLE", reason: "SERIES_TOO_SHORT" });
    }

    var closes = [], dates = [];
    for (var b = 0; b < bars.length; b++) { closes.push(bars[b].close); dates.push(bars[b].date); }
    var context = { runningMax: PatternResearch.runningMaxOf(closes) };

    /* Die letzte Woche ist die Gegenwart und ist kein Vergleichsfall:
       ihr Ausgang liegt in der Zukunft. Sie wird nicht mitgezählt. */
    var hits = [];
    for (var t = WARMUP_WEEKS; t < closes.length - 1; t++) {
      var features = PatternResearch.featuresAt(closes, t, context);
      if (features && allHold(features, priceTerms)) hits.push(t);
    }
    var episodes = [], previous = -99;
    for (var h = 0; h < hits.length; h++) { if (hits[h] - previous > 1) episodes.push(hits[h]); previous = hits[h]; }

    var horizons = {}, anyMeasured = false;
    for (var q = 0; q < HORIZONS.length; q++) {
      var horizon = HORIZONS[q], returns = [], drawdowns = [], open = 0, lastIndex = null;
      for (var e = 0; e < episodes.length; e++) {
        var outcome = PatternResearch.outcomeAfter(closes, episodes[e], horizon.weeks);
        if (outcome.state !== "AVAILABLE") { open += 1; continue; }
        returns.push(outcome.forwardReturn);
        if (finite(outcome.maxDrawdownWithinHorizon)) drawdowns.push(outcome.maxDrawdownWithinHorizon);
        lastIndex = episodes[e];
      }
      var enough = returns.length >= MIN_EPISODES;
      if (enough) anyMeasured = true;
      var positive = 0;
      for (var r = 0; r < returns.length; r++) if (returns[r] > 0) positive += 1;
      horizons[horizon.id] = {
        label: horizon.label, weeks: horizon.weeks,
        completed: returns.length, open: open,
        sufficient: enough,
        /* Unter der Schwelle wird NICHT gerechnet. Ein zurückgehaltener
           Median, der trotzdem im Objekt steht, findet seinen Weg auf die
           Oberfläche - frueher oder spaeter. */
        medianReturn: enough ? median(returns) : null,
        positive: enough ? positive : null,
        medianDrawdown: enough && drawdowns.length ? median(drawdowns) : null,
        lastCaseDate: enough && lastIndex !== null ? dates[lastIndex] : null
      };
    }

    return Object.assign(base, {
      state: episodes.length ? "AVAILABLE" : "UNAVAILABLE",
      reason: episodes.length ? null : "NO_COMPARABLE_CASE",
      episodes: episodes.length,
      rawWeeks: hits.length,
      firstEpisodeDate: episodes.length ? dates[episodes[0]] : null,
      lastEpisodeDate: episodes.length ? dates[episodes[episodes.length - 1]] : null,
      horizons: horizons,
      measured: anyMeasured
    });
  }

  var api = {
    VERSION: VERSION,
    HORIZONS: HORIZONS.map(function (h) { return { id: h.id, weeks: h.weeks, label: h.label }; }),
    MIN_EPISODES: MIN_EPISODES,
    WARMUP_WEEKS: WARMUP_WEEKS,
    LIMITS: LIMITS.slice(),
    vocabulary: vocabulary,
    holdsTerm: holdsTerm,
    assess: assess
  };
  if (isNode) module.exports = api;
  else global.VUHistoricalCases = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
