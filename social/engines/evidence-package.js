/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/evidence-package.js

   DAS KANONISCHE EVIDENZPAKET

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Der erste Kandidat sagte: "XOM, 76 im Technical Opportunity Score."
   Mehr ging nicht, weil mehr nicht da war: der Signalsammler hatte aus
   dem technischen Bundle genau eine Zahl herausgezogen.

   76 wovon bis wovon? Woraus setzt sich der Wert zusammen? Ist er eine
   Wahrscheinlichkeit? Der Leser konnte es nicht wissen, und ein
   Creative Agent haette es sich ausgedacht.

   Im Bundle stand das alles. Es wurde nur nie mitgenommen:

     score 76, interpretation "methodology_rank", isProbability FALSE
     Band "Konstruktiv" ab 60
     Beitraege je Familie samt Maximum
     Trend BULLISH, 82.3 — mit fertig formulierten Belegsaetzen
     Momentum STRONG_POSITIVE, 12M +47.6 %
     Volatilitaet NORMAL, ATR 2.14 % (Perzentil 43)
     Volumen NORMAL, relativ 0.83x
     Relative Staerke UNAVAILABLE — "Benchmark nicht verfuegbar"
     Disclaimer: "Keine Wahrscheinlichkeit, keine Renditeerwartung."

   -------------------------------------------------------------------------
   WAS DIESES PAKET IST
   -------------------------------------------------------------------------

   Eine kanonische, versionierte Sammlung von Evidence Objects zwischen
   Signal/Gelegenheit und Authoring Brief. Jedes Objekt traegt seinen
   Wert, seinen Satz, seine Quelle, seinen Stand und seinen Zustand.

   Und — genauso wichtig — die NICHT verfuegbaren Dimensionen stehen
   ausdruecklich drin, mit Grund. Ein Autor, der nur sieht, was da ist,
   haelt das Fehlende fuer nicht existent und fuellt es.

   -------------------------------------------------------------------------
   WAS ES NICHT IST
   -------------------------------------------------------------------------

   Keine zweite Datenquelle. Es liest, was die Quant-Schicht erzeugt
   hat, und rechnet nichts nach. Wo dort UNAVAILABLE steht, steht hier
   UNAVAILABLE — und nicht ein Ersatzwert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  /* Die Dimensionen, nach denen ein Beitrag erzaehlen kann. Jede ist
     entweder belegt oder ausdruecklich nicht — ein Dazwischen gibt es
     nicht. */
  var DIMENSIONS = [
    "SCORE", "TREND", "MOMENTUM", "RELATIVE_STRENGTH", "VOLATILITY",
    "VOLUME", "STRUCTURE", "PRICE", "SETUP"
  ];

  function pct(x, stellen) {
    if (x === null || x === undefined || !isFinite(x)) return null;
    var f = Math.pow(10, stellen === undefined ? 1 : stellen);
    return Math.round(x * 100 * f) / f;
  }

  function ev(spec) {
    return {
      id: spec.id,
      dimension: spec.dimension,
      statement: spec.statement,
      value: spec.value === undefined ? null : spec.value,
      unit: spec.unit || null,
      entity: spec.entity || null,
      metric: spec.metric || null,
      source: spec.source || null,
      observedAt: spec.observedAt || null,
      state: spec.state || "VERIFIED",
      /* Woher genau im Bundle — damit sich jede Aussage zurueckverfolgen
         laesst, ohne das Bundle zu durchsuchen. */
      pointer: spec.pointer || null
    };
  }

  /**
   * Baut das Paket aus einem technischen Bundle.
   *
   * @param bundle    quant/data/technical/instruments/<SYM>.json .bundle
   * @param options   { entity, source, now }
   */
  function fromTechnicalBundle(bundle, options) {
    options = options || {};
    if (!bundle) {
      return { ok: false, reason: "noBundle",
        message: "Kein technisches Bundle. Ohne Bundle gibt es keine Evidenz." };
    }

    var entity = options.entity || bundle.instrumentId || null;
    var source = options.source || bundle.source || "vu.technical";
    var asOf = bundle.dataCutoff || bundle.analysisTime || null;

    var evidence = [];
    var unavailable = [];

    /* ------------------------------------------------------- SCORE */
    var os = bundle.opportunityScore || null;
    if (os && typeof os.score === "number") {
      evidence.push(ev({
        id: "score", dimension: "SCORE", entity: entity,
        metric: "Technical Opportunity Score", value: os.score, unit: null,
        source: source, observedAt: asOf, pointer: "/opportunityScore/score",
        statement: "Technical Opportunity Score " + os.score + " von 100" +
          (os.band && os.band.label ? " (Band „" + os.band.label + "“ ab " +
            os.band.min + ")" : "") + "."
      }));

      /* Die Bedeutung der Zahl. Sie ist der Unterschied zwischen einer
         Kennzahl und einer Prozentzahl, die wie eine Chance aussieht. */
      if (os.disclaimer) {
        evidence.push(ev({
          id: "score-meaning", dimension: "SCORE", entity: entity,
          metric: "Bedeutung des Scores", value: null,
          source: source, observedAt: asOf, pointer: "/opportunityScore/disclaimer",
          statement: os.disclaimer
        }));
      }
      if (os.isProbability === false) {
        evidence.push(ev({
          id: "score-not-probability", dimension: "SCORE", entity: entity,
          metric: "Interpretation", value: null,
          source: source, observedAt: asOf, pointer: "/opportunityScore/interpretation",
          statement: "Der Wert ist ein methodischer Rang (" +
            (os.interpretation || "methodology_rank") +
            "), keine Wahrscheinlichkeit und keine Renditeerwartung."
        }));
      }

      /* Woraus er sich zusammensetzt. Ohne das ist eine Punktzahl eine
         Meinung mit Nachkommastelle. */
      var beitraege = os.contributions || {};
      var maxima = os.maxContribution || {};
      Object.keys(beitraege).forEach(function (fam) {
        evidence.push(ev({
          id: "score-contribution-" + fam.toLowerCase(),
          dimension: "SCORE", entity: entity,
          metric: "Beitrag " + fam, value: beitraege[fam], unit: "Punkte",
          source: source, observedAt: asOf,
          pointer: "/opportunityScore/contributions/" + fam,
          statement: fam + " traegt " + beitraege[fam] +
            (maxima[fam] ? " von " + maxima[fam] : "") + " Punkten bei."
        }));
      });

      (os.notes || []).forEach(function (n, i) {
        evidence.push(ev({
          id: "score-note-" + (i + 1), dimension: "SCORE", entity: entity,
          metric: "Hinweis", value: null, source: source, observedAt: asOf,
          pointer: "/opportunityScore/notes/" + i, statement: n
        }));
      });
    } else {
      unavailable.push({ dimension: "SCORE", reason: "Kein Opportunity Score im Bundle." });
    }

    /* ------------------------------------------------------- PREIS */
    var lb = bundle.lastBar || null;
    if (lb && typeof lb.close === "number") {
      evidence.push(ev({
        id: "price-close", dimension: "PRICE", entity: entity,
        metric: "Schlusskurs", value: lb.close, unit: bundle.currency || null,
        source: source, observedAt: lb.timestamp || asOf, pointer: "/lastBar/close",
        statement: "Schlusskurs " + lb.close + " " + (bundle.currency || "") +
          " am " + (lb.timestamp || asOf) + "."
      }));
    } else {
      unavailable.push({ dimension: "PRICE", reason: "Kein Schlusskurs im Bundle." });
    }

    /* ------------------------------------------------------- TREND */
    var t = bundle.trend || null;
    if (t && t.direction && typeof t.trendScore === "number") {
      evidence.push(ev({
        id: "trend", dimension: "TREND", entity: entity,
        metric: "Trend", value: t.trendScore, unit: null,
        source: source, observedAt: asOf, pointer: "/trend/trendScore",
        statement: "Trendrichtung " + t.direction + ", Trendwert " + t.trendScore + "."
      }));
      /* Die fertig formulierten Belegsaetze der Engine. Sie neu zu
         formulieren hiesse, eine zweite Lesart derselben Zahl zu
         erzeugen. */
      (t.evidence || []).slice(0, 4).forEach(function (e, i) {
        if (!e || !e.statement) return;
        evidence.push(ev({
          id: "trend-" + (e.key || i), dimension: "TREND", entity: entity,
          metric: e.key || "Trendbeleg", value: e.value, source: source,
          observedAt: asOf, pointer: "/trend/evidence/" + i, statement: e.statement
        }));
      });
    } else {
      unavailable.push({ dimension: "TREND", reason: "Kein Trendbefund im Bundle." });
    }

    /* ---------------------------------------------------- MOMENTUM */
    var m = bundle.momentum || null;
    if (m && m.state && typeof m.momentumScore === "number") {
      evidence.push(ev({
        id: "momentum", dimension: "MOMENTUM", entity: entity,
        metric: "Momentum", value: m.momentumScore, unit: null,
        source: source, observedAt: asOf, pointer: "/momentum/momentumScore",
        statement: "Momentum " + m.state + ", Wert " + m.momentumScore + "."
      }));
      var h = m.horizons || {};
      ["1M", "3M", "12M"].forEach(function (k) {
        if (!h[k] || typeof h[k].return !== "number") return;
        evidence.push(ev({
          id: "momentum-" + k.toLowerCase(), dimension: "MOMENTUM", entity: entity,
          metric: k + "-Rendite", value: pct(h[k].return), unit: "%",
          source: source, observedAt: asOf, pointer: "/momentum/horizons/" + k + "/return",
          statement: k + "-Entwicklung " + pct(h[k].return) + " %" +
            (typeof h[k].z === "number" ? " (z=" + h[k].z + ")" : "") + "."
        }));
      });
    } else {
      unavailable.push({ dimension: "MOMENTUM", reason: "Kein Momentumbefund im Bundle." });
    }

    /* -------------------------------------------- RELATIVE STAERKE */
    var rs = bundle.relativeStrength || null;
    if (rs && rs.state === "UNAVAILABLE") {
      /* AUSDRUECKLICH. Ein Autor, der nur sieht, was da ist, haelt das
         Fehlende fuer nicht existent — und fuellt es. */
      unavailable.push({ dimension: "RELATIVE_STRENGTH",
        reason: rs.reason || "Relative Staerke nicht verfuegbar.",
        pointer: "/relativeStrength/reason" });
    } else if (rs && typeof rs.rsScore === "number") {
      evidence.push(ev({
        id: "relative-strength", dimension: "RELATIVE_STRENGTH", entity: entity,
        metric: "Relative Staerke", value: rs.rsScore,
        source: source, observedAt: asOf, pointer: "/relativeStrength/rsScore",
        statement: "Relative Staerke " + rs.rsScore + "."
      }));
    } else {
      unavailable.push({ dimension: "RELATIVE_STRENGTH",
        reason: "Kein Befund zur relativen Staerke." });
    }

    /* ------------------------------------------------- VOLATILITAET */
    var vol = bundle.volatility || null;
    if (vol && vol.regime && vol.metrics && typeof vol.metrics.atrPct === "number") {
      evidence.push(ev({
        id: "volatility", dimension: "VOLATILITY", entity: entity,
        metric: "Volatilitaetsregime", value: pct(vol.metrics.atrPct, 2), unit: "%",
        source: source, observedAt: asOf, pointer: "/volatility/metrics/atrPct",
        statement: "Volatilitaet " + vol.regime + ", ATR " +
          pct(vol.metrics.atrPct, 2) + " % des Kurses" +
          (typeof vol.metrics.atrPctPercentile === "number"
            ? " (Perzentil " + Math.round(vol.metrics.atrPctPercentile) + ")" : "") + "."
      }));
    } else {
      unavailable.push({ dimension: "VOLATILITY", reason: "Kein Volatilitaetsbefund." });
    }

    /* ------------------------------------------------------ VOLUMEN */
    var v = bundle.volume || null;
    if (v && v.state && v.metrics && typeof v.metrics.relativeVolume === "number") {
      evidence.push(ev({
        id: "volume", dimension: "VOLUME", entity: entity,
        metric: "Relatives Volumen", value: v.metrics.relativeVolume, unit: "x",
        source: source, observedAt: asOf, pointer: "/volume/metrics/relativeVolume",
        statement: "Volumen " + v.state + ", relativ " + v.metrics.relativeVolume +
          "× zum Median."
      }));
    } else {
      unavailable.push({ dimension: "VOLUME", reason: "Kein Volumenbefund." });
    }

    /* ---------------------------------------------------- STRUKTUR */
    var st = bundle.structure || null;
    if (st && st.state && st.state.trend) {
      evidence.push(ev({
        id: "structure", dimension: "STRUCTURE", entity: entity,
        metric: "Marktstruktur", value: null,
        source: source, observedAt: asOf, pointer: "/structure/state/trend",
        statement: "Marktstruktur " + st.state.trend + "."
      }));
    } else {
      unavailable.push({ dimension: "STRUCTURE", reason: "Kein Strukturbefund." });
    }

    /* Die Datengrundlage selbst ist eine Aussage. */
    if (bundle.analysisLookback && bundle.analysisLookback.bars) {
      evidence.push(ev({
        id: "data-basis", dimension: "SCORE", entity: entity,
        metric: "Datengrundlage", value: bundle.analysisLookback.bars, unit: "Handelstage",
        source: source, observedAt: asOf, pointer: "/analysisLookback/bars",
        statement: "Grundlage sind " + bundle.analysisLookback.bars +
          " Handelstage seit " + bundle.analysisLookback.from + "."
      }));
    }

    var paket = {
      packageVersion: "evidence-package-1.0.0",
      entity: entity,
      asOf: asOf,
      source: source,
      sourceRevision: options.sourceRevision || null,
      methodologyVersion: bundle.methodologyVersion || null,
      dataVersion: bundle.dataVersion || null,
      evidence: evidence,
      unavailable: unavailable,
      dimensionsAvailable: Array.from(new Set(evidence.map(function (e) {
        return e.dimension; }))),
      generatedAt: options.now || null
    };

    paket.packageId = Hash.prefixedHash("evp", {
      entity: entity, asOf: asOf, dataVersion: bundle.dataVersion || null,
      ids: evidence.map(function (e) { return e.id + ":" + e.value; })
    });

    return Object.assign({ ok: true, reason: null }, paket);
  }

  /* -------------------------------------------------------------------
     STORY SUFFICIENCY

     Eine Gelegenheit mit hohem Score ist NICHT automatisch
     veroeffentlichungswuerdig. Ein Beitrag braucht genug voneinander
     unabhaengige belegte Aussagen, um etwas zu erzaehlen — sonst
     entsteht wieder eine Karte mit einer Zahl darauf.

     Geprueft wird die BREITE (wie viele Dimensionen), die TIEFE (wie
     viele belegte Saetze) und die EINORDNUNG (weiss der Leser, was die
     Leitzahl bedeutet?). Die letzte ist die wichtigste: eine Zahl ohne
     ihre Bedeutung ist der Anfang jeder Fehlinterpretation.
     ------------------------------------------------------------------- */
  var SUFFICIENCY_DEFAULTS = {
    minDimensions: 3,
    minStatements: 5,
    requireInterpretation: true,
    requireDatedAnchor: true
  };

  function assessSufficiency(paket, options) {
    var regeln = Object.assign({}, SUFFICIENCY_DEFAULTS, options || {});
    var gruende = [];

    var dims = (paket && paket.dimensionsAvailable) || [];
    var saetze = ((paket && paket.evidence) || []).filter(function (e) {
      return e.statement && String(e.statement).trim(); });

    if (dims.length < regeln.minDimensions) {
      gruende.push("Nur " + dims.length + " belegte Dimension(en); verlangt sind " +
        regeln.minDimensions + ". Aus einer Dimension wird eine Zahl, keine Geschichte.");
    }
    if (saetze.length < regeln.minStatements) {
      gruende.push("Nur " + saetze.length + " belegte Aussage(n); verlangt sind " +
        regeln.minStatements + ".");
    }

    if (regeln.requireInterpretation) {
      var hatBedeutung = saetze.some(function (e) {
        return e.id === "score-meaning" || e.id === "score-not-probability"; });
      if (!hatBedeutung) {
        gruende.push("Die Leitzahl hat keine Einordnung. Eine Zahl ohne ihre " +
          "Bedeutung ist der Anfang jeder Fehlinterpretation.");
      }
    }

    if (regeln.requireDatedAnchor) {
      var hatAnker = saetze.some(function (e) {
        return e.value !== null && e.value !== undefined && e.observedAt; });
      if (!hatAnker) {
        gruende.push("Keine datierte Zahl. Ohne Stand ist jede Angabe zeitlos — " +
          "und damit falsch, sobald sie alt wird.");
      }
    }

    return {
      sufficient: gruende.length === 0,
      dimensions: dims.length,
      statements: saetze.length,
      unavailable: ((paket && paket.unavailable) || []).map(function (u) {
        return u.dimension; }),
      reasons: gruende,
      explanation: gruende.length === 0
        ? "Ausreichend belegt: " + dims.length + " Dimensionen, " + saetze.length +
          " Aussagen" +
          (((paket && paket.unavailable) || []).length
            ? "; nicht verfuegbar: " + paket.unavailable.map(function (u) {
                return u.dimension; }).join(", ") : "") + "."
        : gruende.join(" ")
    };
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    SUFFICIENCY_DEFAULTS: SUFFICIENCY_DEFAULTS,
    fromTechnicalBundle: fromTechnicalBundle,
    assessSufficiency: assessSufficiency
  };

  if (isNode) module.exports = api;
  else global.VUSocialEvidencePackage = api;
})(typeof window !== "undefined" ? window : globalThis);
