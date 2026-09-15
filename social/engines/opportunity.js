/* =========================================================================
   VISION UNIVERSE SOCIAL — opportunity.js
   VU CONTENT OPPORTUNITY SCORE (§6)

   Nicht jeder Trend wird Content.

   Der Trend Score beantwortet: "passiert da gerade etwas?"
   Dieser Score beantwortet: "sollen WIR etwas dazu sagen, jetzt, hier?"

   Das sind verschiedene Fragen. Ein Thema kann heiss sein und trotzdem
   nichts fuer uns: kein eigener Blickwinkel, kein Bezug zum Publikum,
   gestern schon gesagt, oder auf dieser Plattform am falschen Ort.

   WAS HIER ZUSAETZLICH ZAEHLT

     Trend Score              das Aussen
     VU-Signal                das Innen — haben wir eigene Daten dazu
     Publikumsinteresse       fragt unser Publikum danach
     Historische Leistung     wie liefen vergleichbare Beitraege
     Plattformpassung         Format und Ort
     Content Gap              was fehlt im eigenen Bestand
     Brand Fit                koennen wir es in unserem Register sagen

   DIESELBE WEIGERUNG WIE BEIM TREND SCORE

   Ohne Trend Score und ohne VU-Signal gibt es keine Gelegenheit. Ein
   Beitrag, dem beides fehlt, waere ein Beitrag ohne Anlass und ohne
   eigenen Beitrag — genau das, was §57 ausschliesst.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DIMENSIONS = [
    "trend", "vuSignal", "audienceInterest", "historicalPerformance",
    "platformFit", "freshness", "contentGap", "brandFit"
  ];

  var DIMENSION_LABELS = {
    trend:                 "externer Trend",
    vuSignal:              "eigenes Vision-Universe-Signal",
    audienceInterest:      "Interesse des eigenen Publikums",
    historicalPerformance: "Leistung vergleichbarer Beitraege",
    platformFit:           "Passung zur Plattform",
    freshness:             "Aktualitaet des Anlasses",
    contentGap:            "Luecke im eigenen Bestand",
    brandFit:              "Passung zum Markenregister"
  };

  var DEFAULT_METHODOLOGY = {
    version: "1.0.0",
    weights: {
      trend: 0.18, vuSignal: 0.22, audienceInterest: 0.14,
      historicalPerformance: 0.12, platformFit: 0.10,
      freshness: 0.10, contentGap: 0.08, brandFit: 0.06
    },
    /* Die Mindestabdeckung.
       Sie ist auf 0.55 gesetzt und nicht auf 0.6, und das ist eine
       bewusste Entscheidung mit einem Grund, der sich aendern wird:

       Ein System ohne Publikumssignale und ohne eigene Historie kann
       audienceInterest (0.14) und historicalPerformance (0.12) nicht
       messen — nicht aus Nachlaessigkeit, sondern weil es noch nichts
       veroeffentlicht hat. Erreichbar sind im Kaltstart hoechstens
       vuSignal + freshness + contentGap + platformFit + brandFit = 0.56.

       Eine Schwelle von 0.6 waere damit nicht streng, sondern
       unerfuellbar: sie wuerde JEDE Gelegenheit ablehnen, unabhaengig von
       ihrer Guete, und die Ablehnung saehe aus wie ein Urteil ueber das
       Thema. 0.55 verlangt dagegen alles, was ein Kaltstart-System
       tatsaechlich wissen kann — und lehnt eine Gelegenheit ab, der auch
       nur eine dieser Dimensionen fehlt.

       SOBALD Analytics und Publikumssignale laufen, gehoert diese
       Schwelle hinauf. Sie steht deshalb in der Methodik und nicht im
       Code-Fluss: die Aenderung ist dann eine Zeile mit Begruendung. */
    minimumCoverage: 0.55,
    /* Ohne eine dieser beiden Dimensionen entsteht keine Gelegenheit.
       "trend" allein waere Nachplappern, "vuSignal" allein waere ein
       Beitrag ohne Anlass. Verlangt ist MINDESTENS eine von beiden — und
       das ist eine ODER-Bedingung, kein UND. */
    requiresAnyOf: ["trend", "vuSignal"],
    /* Unterhalb dieser Schwelle wird nicht vorgeschlagen. Die Schwelle ist
       Konfiguration, damit die Learning Engine sie bewegen darf (§21). */
    proposalThreshold: 55,
    /* Unterhalb dieser Schwelle wird auch auf Stufe 4 nicht ohne Mensch
       veroeffentlicht. Sie liegt hoeher: autonom handeln darf man nur bei
       klaren Faellen. */
    autonomousThreshold: 72
  };

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function measured(value, reason) { return { available: true, value: clamp01(value), reason: reason }; }
  function unmeasured(reason) { return { available: false, value: null, reason: reason }; }

  function fromInput(input, key, label, transform) {
    if (!input || input[key] === null || input[key] === undefined) {
      return unmeasured("Keine Messung fuer " + label + ".");
    }
    var raw = Number(input[key]);
    if (!Number.isFinite(raw)) return unmeasured(label + " ist keine Zahl.");
    var value = transform ? transform(raw) : raw;
    return measured(value, label + ": " + (transform ? Math.round(value * 100) + " %" : Math.round(raw * 100) + " %"));
  }

  /**
   * @param input {
   *   trendScore            0..100 oder null (Ergebnis von trend-score.js)
   *   vuSignalStrength      0..1   Staerke des internen Signals
   *   audienceInterest      0..1
   *   historicalPerformance 0..1
   *   historicalSampleSize  Anzahl vergleichbarer Beitraege
   *   platformFit           0..1
   *   hoursSinceTrigger     Stunden seit dem ausloesenden Ereignis
   *   contentGap            0..1
   *   brandFit              0..1
   * }
   */
  function score(input, options) {
    options = options || {};
    var methodology = Object.assign({}, DEFAULT_METHODOLOGY, options.methodology || {});
    input = input || {};

    var components = {};

    components.trend = (input.trendScore === null || input.trendScore === undefined)
      ? unmeasured("Kein Trend Score vorhanden — die Trend-Engine hat sich enthalten.")
      : measured(Number(input.trendScore) / 100, "Trend Score " + Math.round(Number(input.trendScore)) + ".");

    components.vuSignal = fromInput(input, "vuSignalStrength", "internes VU-Signal");
    components.audienceInterest = fromInput(input, "audienceInterest", "Publikumsinteresse");

    /* Historische Leistung OHNE Stichprobengroesse ist eine Anekdote.
       §19: Korrelation ist nicht Kausalitaet, und n=2 ist nicht einmal
       Korrelation. Unter der Mindestzahl gilt sie als nicht gemessen —
       nicht als schlecht. */
    var minSample = options.minimumSample || 5;
    var n = Number(input.historicalSampleSize);
    if (input.historicalPerformance === null || input.historicalPerformance === undefined) {
      components.historicalPerformance = unmeasured("Keine Leistungsdaten vergleichbarer Beitraege.");
    } else if (!Number.isFinite(n) || n < minSample) {
      components.historicalPerformance = unmeasured(
        "Nur " + (Number.isFinite(n) ? n : 0) + " vergleichbare Beitraege; ab " + minSample +
        " wird daraus eine Aussage.");
    } else {
      components.historicalPerformance = measured(Number(input.historicalPerformance),
        "Vergleichbare Beitraege (n=" + n + ") liegen bei " +
        Math.round(Number(input.historicalPerformance) * 100) + " % der Zielleistung.");
    }

    components.platformFit = fromInput(input, "platformFit", "Plattformpassung");

    /* Aktualitaet des ANLASSES — nicht des Signals. Ein 52-Wochen-Hoch von
       vor drei Tagen ist kein Anlass mehr. */
    if (input.hoursSinceTrigger === null || input.hoursSinceTrigger === undefined) {
      components.freshness = unmeasured("Zeitpunkt des Anlasses unbekannt.");
    } else {
      var hours = Math.max(0, Number(input.hoursSinceTrigger));
      var v = Math.pow(0.5, hours / 24);
      components.freshness = measured(v, "Der Anlass liegt " + Math.round(hours) + " h zurueck.");
    }

    components.contentGap = fromInput(input, "contentGap", "Luecke im eigenen Bestand");
    components.brandFit = fromInput(input, "brandFit", "Markenpassung");

    /* Gewichtete Abdeckung. */
    var totalWeight = 0, availableWeight = 0, weighted = 0;
    DIMENSIONS.forEach(function (dim) {
      var w = methodology.weights[dim] || 0;
      totalWeight += w;
      if (!components[dim].available) return;
      availableWeight += w;
      weighted += w * components[dim].value;
    });
    var coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight;

    var anyOf = (methodology.requiresAnyOf || []).some(function (dim) {
      return components[dim].available;
    });
    if (!anyOf) {
      return refuse(components, coverage, methodology,
        "Weder ein externer Trend noch ein internes VU-Signal liegt vor. Ohne Anlass und ohne " +
        "eigenen Beitrag entsteht keine Gelegenheit.");
    }
    if (coverage < methodology.minimumCoverage) {
      return refuse(components, coverage, methodology,
        "Nur " + Math.round(coverage * 100) + " % der Gewichtung sind belegt; verlangt sind " +
        Math.round(methodology.minimumCoverage * 100) + " %.");
    }

    var value = Math.round((weighted / availableWeight) * 100);

    var ranked = DIMENSIONS
      .filter(function (d) { return components[d].available; })
      .map(function (d) {
        return { dimension: d, label: DIMENSION_LABELS[d],
                 contribution: (methodology.weights[d] || 0) * components[d].value,
                 value: components[d].value, reason: components[d].reason };
      })
      .sort(function (a, b) { return b.contribution - a.contribution; });

    var missing = DIMENSIONS.filter(function (d) { return !components[d].available; });

    return {
      available: true,
      state: "VERIFIED",
      score: value,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: ranked.slice(0, 3),
      missing: missing.map(function (d) { return { dimension: d, label: DIMENSION_LABELS[d], reason: components[d].reason }; }),
      /* Die drei Schwellen, an denen sich die Handlung entscheidet. */
      proposable: value >= methodology.proposalThreshold,
      autonomous: value >= methodology.autonomousThreshold,
      explanation: buildExplanation(value, ranked, missing, components, methodology)
    };
  }

  /**
   * Die Erklaerung in Prosa (§32). Sie nennt Grund, Beleg und Vorbehalt —
   * keine Score-Wueste.
   */
  function buildExplanation(value, ranked, missing, components, methodology) {
    var parts = [];
    parts.push("Opportunity Score " + value + " von 100.");
    if (ranked[0]) parts.push("Wichtigster Grund: " + ranked[0].reason);
    if (ranked[1]) parts.push("Dazu: " + ranked[1].reason);
    if (value < methodology.proposalThreshold) {
      parts.push("Das liegt unter der Vorschlagsschwelle von " + methodology.proposalThreshold +
                 "; die Gelegenheit wird nicht vorgeschlagen.");
    } else if (value < methodology.autonomousThreshold) {
      parts.push("Das reicht fuer einen Vorschlag, aber nicht fuer eine Veroeffentlichung ohne Freigabe " +
                 "(Schwelle " + methodology.autonomousThreshold + ").");
    } else {
      parts.push("Das liegt ueber der Schwelle fuer autonomes Handeln.");
    }
    if (missing.length) {
      parts.push("Ungemessen blieb: " + missing.map(function (m) { return m.label; }).join(", ") + ".");
    }
    return parts.join(" ");
  }

  function refuse(components, coverage, methodology, reason) {
    return {
      available: false,
      state: "UNAVAILABLE",
      score: null,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: [],
      missing: DIMENSIONS.filter(function (d) { return !components[d].available; })
        .map(function (d) { return { dimension: d, label: DIMENSION_LABELS[d], reason: components[d].reason }; }),
      proposable: false,
      autonomous: false,
      explanation: "Keine Gelegenheit: " + reason
    };
  }

  /**
   * Priorisierung mehrerer Gelegenheiten. Sortiert nach Score, aber mit
   * einer Regel dazu: zwei Gelegenheiten zum selben Thema sind eine.
   * Ohne diese Regel fuellt ein einziges Ereignis die ganze Tagesplanung.
   */
  function prioritize(opportunities, options) {
    options = options || {};
    var limit = options.limit || 10;
    var perTopic = options.maxPerTopic || 1;

    var seen = Object.create(null);
    return (opportunities || [])
      .filter(function (o) { return o && o.score !== null && o.proposable !== false; })
      .slice()
      .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
      .filter(function (o) {
        var key = String(o.topic || "").toLowerCase().trim();
        seen[key] = (seen[key] || 0) + 1;
        return seen[key] <= perTopic;
      })
      .slice(0, limit);
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    DIMENSION_LABELS: DIMENSION_LABELS,
    DEFAULT_METHODOLOGY: DEFAULT_METHODOLOGY,
    score: score,
    prioritize: prioritize
  };

  if (isNode) module.exports = api;
  else global.VUSocialOpportunity = api;
})(typeof window !== "undefined" ? window : globalThis);
