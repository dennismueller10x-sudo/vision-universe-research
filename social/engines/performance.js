/* =========================================================================
   VISION UNIVERSE SOCIAL — performance.js
   MEHRDIMENSIONALER PERFORMANCE SCORE (§26) — DIE ANTI-VIRALITY-SPERRE

   Das Problem, gegen das diese Datei gebaut ist:

   Ein System, das Engagement maximiert, findet Empoerung. Empoerung
   erzeugt Kommentare, Kommentare erzeugen Reichweite, Reichweite sieht
   nach Erfolg aus — und die Learning Engine lernt, mehr davon zu machen.
   Der Mechanismus ist nicht boshaft, er ist arithmetisch.

   DESHALB IST ENGAGEMENT HIER NUR EINE VON NEUN DIMENSIONEN

     Reichweite, Interaktion, Verweildauer, Shares, Saves,
     Follower-Konversion, Qualitaet, Markenpassung, strategischer Wert

   und zwei davon koennen den Score SENKEN, egal wie gut die anderen sind.

   SAVES UND SHARES WIEGEN MEHR ALS LIKES

   Ein Like kostet nichts. Ein Save ist die Aussage "das will ich
   wiederfinden", ein Share "dafuer lege ich meinen Namen ein". Fuer ein
   Research-Produkt sind das die ehrlicheren Signale.

   OHNE VERGLEICHSBASIS KEIN SCORE

   Jede Dimension wird gegen eine Basis normiert (Median der letzten N
   Beitraege). Ohne Basis gibt es keine Zahl — 1200 Impressions sind
   weder gut noch schlecht, solange niemand weiss, was normal ist.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DIMENSIONS = ["reach", "engagement", "retention", "shares", "saves",
                    "followerConversion", "quality", "brandFit", "strategicValue"];

  var DIMENSION_LABELS = {
    reach:             "Reichweite",
    engagement:        "Interaktion",
    retention:         "Verweildauer",
    shares:            "Weiterleitungen",
    saves:             "Speicherungen",
    followerConversion:"Follower-Gewinn",
    quality:           "Inhaltsqualitaet",
    brandFit:          "Markenpassung",
    strategicValue:    "strategischer Wert"
  };

  var DEFAULT_METHODOLOGY = {
    version: "1.0.0",
    weights: {
      reach: 0.12, engagement: 0.12, retention: 0.10,
      shares: 0.16, saves: 0.18,
      followerConversion: 0.12, quality: 0.08,
      brandFit: 0.08, strategicValue: 0.04
    },
    /* Dimensionen, die den Score deckeln koennen. Sie wirken nicht als
       Gewicht, sondern als Obergrenze: ein Beitrag, der der Marke
       geschadet hat, ist kein Erfolg mit Abzug. Er ist kein Erfolg. */
    caps: {
      brandFit: { below: 0.4, capScore: 35,
                  reason: "Der Beitrag passt nicht zur Marke. Reichweite macht das nicht wett." },
      sentiment: { below: 0.3, capScore: 30,
                   reason: "Die Reaktion war ueberwiegend negativ. Aufmerksamkeit ist hier kein Erfolg." }
    },
    minimumBaselineSample: 5,
    minimumCoverage: 0.5
  };

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function measured(value, reason) { return { available: true, value: clamp01(value), reason: reason }; }
  function unmeasured(reason) { return { available: false, value: null, reason: reason }; }

  /** Median — robuster als der Mittelwert, wenn ein einziger Beitrag viral ging. */
  function median(values) {
    var v = values.filter(function (x) { return x !== null && x !== undefined && Number.isFinite(x); })
                  .slice().sort(function (a, b) { return a - b; });
    if (v.length === 0) return null;
    var mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  /**
   * Baut die Vergleichsbasis aus frueheren Schnappschuessen.
   * Sie ist die Voraussetzung fuer jeden Score.
   */
  function buildBaseline(snapshots, options) {
    options = options || {};
    var methodology = Object.assign({}, DEFAULT_METHODOLOGY, options.methodology || {});
    var rows = (snapshots || []).filter(function (s) { return s && s.metrics; });

    var baseline = {};
    ["impressions", "reach", "likes", "comments", "shares", "saves",
     "followersGained", "engagementRate", "completionRate"].forEach(function (m) {
      baseline[m] = median(rows.map(function (s) { return s.metrics[m]; }));
    });

    return {
      sampleSize: rows.length,
      sufficient: rows.length >= methodology.minimumBaselineSample,
      medians: baseline,
      reason: rows.length >= methodology.minimumBaselineSample
        ? rows.length + " Beitraege als Vergleichsbasis."
        : "Nur " + rows.length + " Beitraege; ab " + methodology.minimumBaselineSample +
          " entsteht eine belastbare Basis."
    };
  }

  /**
   * Verhaeltnis zur Basis, gestaucht.
   *
   * Das Stauchen ist der Kern der Anti-Virality-Sperre: das Zehnfache des
   * Medians ergibt nicht das Zehnfache des Wertes. Ohne Stauchung
   * dominiert ein einzelner viraler Ausreisser jede Lernstichprobe.
   */
  function relative(value, base, label) {
    if (value === null || value === undefined) return unmeasured(label + " wurde nicht gemeldet.");
    if (base === null || base === undefined || base <= 0) {
      return unmeasured("Keine Vergleichsbasis fuer " + label + ".");
    }
    var ratio = value / base;
    /* 0.5x -> 0.25, 1x -> 0.5, 2x -> 0.75, 4x -> ~0.9. */
    var v = ratio / (ratio + 1);
    return measured(v, label + " " + Math.round(ratio * 100) + " % des Medians.");
  }

  /**
   * @param snapshot   der zu bewertende MetricSnapshot
   * @param baseline   Ergebnis von buildBaseline()
   * @param context    { brandFitScore 0..1, qualityScore 0..1,
   *                     sentiment 0..1, strategicValue 0..1,
   *                     videoLengthSeconds }
   */
  function score(snapshot, baseline, context, options) {
    options = options || {};
    var methodology = Object.assign({}, DEFAULT_METHODOLOGY, options.methodology || {});
    context = context || {};
    var metrics = (snapshot && snapshot.metrics) || {};
    var medians = (baseline && baseline.medians) || {};

    if (!baseline || !baseline.sufficient) {
      return {
        available: false, state: "UNAVAILABLE", score: null,
        components: {}, capped: null,
        explanation: "Kein Performance Score: " + ((baseline && baseline.reason) ||
          "es gibt keine Vergleichsbasis.") + " Eine Zahl ohne Basis waere eine Behauptung."
      };
    }

    var components = {
      reach:      relative(metrics.reach !== null ? metrics.reach : metrics.impressions,
                           medians.reach !== null ? medians.reach : medians.impressions, "Reichweite"),
      engagement: relative(metrics.engagementRate, medians.engagementRate, "Interaktionsrate"),
      retention:  metrics.completionRate === null
                    ? unmeasured("Keine Verweildauer gemeldet (nur bei Video).")
                    : relative(metrics.completionRate, medians.completionRate, "Abschlussrate"),
      shares:     relative(metrics.shares, medians.shares, "Weiterleitungen"),
      saves:      relative(metrics.saves, medians.saves, "Speicherungen"),
      followerConversion: relative(metrics.followersGained, medians.followersGained, "Follower-Gewinn"),
      quality:    context.qualityScore === undefined || context.qualityScore === null
                    ? unmeasured("Keine Qualitaetsbewertung uebergeben.")
                    : measured(Number(context.qualityScore), "Qualitaetsbewertung " +
                        Math.round(Number(context.qualityScore) * 100) + " %."),
      brandFit:   context.brandFitScore === undefined || context.brandFitScore === null
                    ? unmeasured("Keine Markenbewertung uebergeben.")
                    : measured(Number(context.brandFitScore), "Markenpassung " +
                        Math.round(Number(context.brandFitScore) * 100) + " %."),
      strategicValue: context.strategicValue === undefined || context.strategicValue === null
                    ? unmeasured("Kein strategischer Wert uebergeben.")
                    : measured(Number(context.strategicValue), "Strategischer Wert " +
                        Math.round(Number(context.strategicValue) * 100) + " %.")
    };

    var totalWeight = 0, availableWeight = 0, weighted = 0;
    DIMENSIONS.forEach(function (d) {
      var w = methodology.weights[d] || 0;
      totalWeight += w;
      if (!components[d].available) return;
      availableWeight += w;
      weighted += w * components[d].value;
    });
    var coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight;

    if (coverage < methodology.minimumCoverage) {
      return {
        available: false, state: "UNAVAILABLE", score: null,
        components: components, coverage: Math.round(coverage * 1000) / 1000, capped: null,
        explanation: "Kein Performance Score: nur " + Math.round(coverage * 100) +
          " % der Gewichtung sind belegt (verlangt: " + Math.round(methodology.minimumCoverage * 100) + " %)."
      };
    }

    var raw = Math.round((weighted / availableWeight) * 100);

    /* DIE DECKEL. Sie wirken NACH der Gewichtung und ersetzen den Wert,
       statt ihn zu mindern. Ein markenschaedlicher Beitrag mit grosser
       Reichweite soll nicht "gut mit Abzug" heissen. */
    var capped = null;
    var value = raw;
    Object.keys(methodology.caps).forEach(function (key) {
      var cap = methodology.caps[key];
      var observed = key === "sentiment" ? context.sentiment
                   : (components[key] ? components[key].value : null);
      if (observed === null || observed === undefined) return;
      if (Number(observed) < cap.below && value > cap.capScore) {
        value = cap.capScore;
        capped = { dimension: key, observed: Number(observed), threshold: cap.below,
                   capScore: cap.capScore, reason: cap.reason };
      }
    });

    var ranked = DIMENSIONS
      .filter(function (d) { return components[d].available; })
      .map(function (d) {
        return { dimension: d, label: DIMENSION_LABELS[d],
                 contribution: (methodology.weights[d] || 0) * components[d].value,
                 value: components[d].value, reason: components[d].reason };
      })
      .sort(function (a, b) { return b.contribution - a.contribution; });

    return {
      available: true,
      state: "VERIFIED",
      score: value,
      rawScore: raw,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: ranked.slice(0, 3),
      weakest: ranked.slice(-2).reverse(),
      capped: capped,
      baselineSampleSize: baseline.sampleSize,
      explanation: capped
        ? "Performance Score auf " + value + " begrenzt (ungedeckelt waere es " + raw + "). " + capped.reason
        : "Performance Score " + value + " von 100 gegen eine Basis aus " + baseline.sampleSize +
          " Beitraegen. Staerkster Beitrag: " + (ranked[0] ? ranked[0].reason : "keiner") +
          (ranked.length > 1 ? " Schwaechster: " + ranked[ranked.length - 1].reason : "")
    };
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    DIMENSION_LABELS: DIMENSION_LABELS,
    DEFAULT_METHODOLOGY: DEFAULT_METHODOLOGY,
    median: median,
    buildBaseline: buildBaseline,
    score: score
  };

  if (isNode) module.exports = api;
  else global.VUSocialPerformance = api;
})(typeof window !== "undefined" ? window : globalThis);
