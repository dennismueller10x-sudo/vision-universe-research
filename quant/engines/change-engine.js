/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — CHANGE ENGINE v1

   The product question is not "how high is momentum" but "what is moving
   right now". This engine answers that from observations that already
   exist, and only from those.

   Hard rule: change is measured on inputs, never on scores. A score
   trajectory ("Momentum rose from 68 to 82 over six weeks") requires an
   ordered history of published factor snapshots. That history does not
   exist yet, so scoreMomentum stays UNAVAILABLE with a typed reason
   rather than being reconstructed from today's data — a reconstruction
   would be look-ahead by another name.

   Every classification threshold below is part of the versioned contract
   vu-change-1.0.0. They describe how a change is *labelled*; they are not
   entry rules and carry no backtest claim.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var METHODOLOGY_VERSION = "vu-change-1.0.0";
  var SCHEMA_VERSION = "change-product-1.0.0";

  var DIRECTIONS = ["IMPROVING", "DETERIORATING", "STABLE"];
  var ITEM_STATES = ["AVAILABLE", "UNAVAILABLE"];
  var ITEM_REASONS = [
    "INPUT_NOT_MATERIALIZED",
    "INSUFFICIENT_HISTORY",
    "BLOCKED_EXTERNAL",
    "FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED",
    "FUNDAMENTALS_UNAVAILABLE"
  ];

  /* Classification thresholds. Versioned, explicit, and identical for
     every title; a per-title threshold would be a fitted parameter. */
  var THRESHOLDS = {
    momentumPaceAbsolute: 0.02,        /* 2 percentage points of monthly pace */
    relativeStrengthPaceAbsolute: 0.02,
    volatilityCompressionRatio: 0.80,  /* 20d vs 252d */
    volatilityExpansionRatio: 1.25,
    volumeExpansionRatio: 1.20,        /* 20d vs 60d average volume */
    volumeContractionRatio: 0.80,
    highProximityPct: 0.05,            /* within 5 % of the 52-week high */
    marginChangeAbsolute: 0.01,        /* 1 percentage point */
    growthAccelerationAbsolute: 0.02   /* 2 percentage points of YoY growth */
  };

  var WINDOWS = [
    { id: "6W", label: "6 Wochen", sessions: 30 },
    { id: "3M", label: "3 Monate", sessions: 63 },
    { id: "6M", label: "6 Monate", sessions: 126 },
    { id: "1Y", label: "1 Jahr", sessions: 252 }
  ];

  var REASON_TEXT = {
    INPUT_NOT_MATERIALIZED: "Der benötigte Eingabewert ist in der bestehenden Datenplattform noch nicht materialisiert.",
    INSUFFICIENT_HISTORY: "Die vorhandene Beobachtungsreihe ist für diesen Vergleich zu kurz.",
    BLOCKED_EXTERNAL: "Es liegt keine lizenzierte, zeitpunktgenaue Datenquelle vor. Ein Ersatz wäre erfunden und wird nicht gebildet.",
    FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED: "Ein Verlauf der Faktorwerte benötigt eine geordnete Historie veröffentlichter Faktor-Snapshots. Diese Historie beginnt erst mit dieser Methodik und wird nicht rückwirkend rekonstruiert.",
    FUNDAMENTALS_UNAVAILABLE: "Für diesen Titel liegt keine zeitpunktsichere Geschäftszahlen-Beobachtung vor."
  };

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function round(value, digits) { return finite(value) ? Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits) : null; }

  function unavailable(id, meaning, reason) {
    return {
      id: id, label: meaning.label, question: meaning.question, plain: meaning.plain,
      state: "UNAVAILABLE", reason: reason, reasonText: REASON_TEXT[reason] || REASON_TEXT.INPUT_NOT_MATERIALIZED,
      direction: null, window: meaning.window || null, from: null, to: null, magnitude: null, evidence: [], interpretation: null
    };
  }

  function item(id, meaning, direction, from, to, magnitude, evidence, interpretation) {
    return {
      id: id, label: meaning.label, question: meaning.question, plain: meaning.plain,
      state: "AVAILABLE", reason: null, reasonText: null,
      direction: direction, window: meaning.window || null,
      from: from, to: to, magnitude: round(magnitude, 6),
      evidence: evidence || [], interpretation: interpretation || null
    };
  }

  function classify(delta, threshold) {
    if (!finite(delta)) return null;
    if (delta >= threshold) return "IMPROVING";
    if (delta <= -threshold) return "DETERIORATING";
    return "STABLE";
  }

  var MEANING = {
    momentumPace: {
      label: "Kurstempo", window: "1 Monat gegen 3 Monate",
      question: "Zieht der Kurs gerade an oder verliert er an Tempo?",
      plain: "Verglichen wird die Entwicklung des letzten Monats mit dem durchschnittlichen Monatstempo der letzten drei Monate."
    },
    relativeStrengthPace: {
      label: "Stärke gegenüber dem Markt", window: "1 Monat gegen 6 Monate",
      question: "Läuft der Titel gerade besser oder schlechter als der breite Markt?",
      plain: "Verglichen wird der Vorsprung gegenüber dem Vergleichsindex im letzten Monat mit dem durchschnittlichen Monatsvorsprung der letzten sechs Monate."
    },
    volatilityRegime: {
      label: "Schwankungsbreite", window: "20 Tage gegen 252 Tage",
      question: "Beruhigt sich der Kurs oder wird er unruhiger?",
      plain: "Verglichen wird die Schwankungsbreite der letzten 20 Handelstage mit der des letzten Jahres."
    },
    volumeRegime: {
      label: "Handelsvolumen", window: "20 Tage gegen 60 Tage",
      question: "Nimmt die Handelsaktivität zu?",
      plain: "Verglichen wird das durchschnittliche Handelsvolumen der letzten 20 Handelstage mit dem der letzten 60."
    },
    trendStructure: {
      label: "Trendstruktur", window: "20 / 50 / 100 / 200 Tage",
      question: "Liegt der Kurs über seinen wichtigen Durchschnittslinien?",
      plain: "Gezählt wird, über wie vielen der vier gebräuchlichen Durchschnittslinien der letzte Kurs liegt."
    },
    highProximity: {
      label: "Nähe zum Jahreshoch", window: "52 Wochen",
      question: "Wie weit ist der Kurs vom höchsten Stand des letzten Jahres entfernt?",
      plain: "Gemessen wird der Abstand des letzten Kurses zum höchsten Schlusskurs der letzten 52 Wochen."
    },
    revenueAcceleration: {
      label: "Umsatztempo", window: "zwei Geschäftsjahre",
      question: "Wächst der Umsatz schneller oder langsamer als im Jahr davor?",
      plain: "Verglichen wird das Umsatzwachstum des letzten Geschäftsjahres mit dem des Vorjahres."
    },
    grossMarginChange: {
      label: "Bruttomarge", window: "letzte 12 Monate gegen Vorjahreszeitraum",
      question: "Bleibt pro Euro Umsatz mehr oder weniger übrig?",
      plain: "Verglichen wird die Bruttomarge der letzten vier Quartale mit der der vier Quartale davor."
    },
    fcfMarginChange: {
      label: "Free-Cashflow-Marge", window: "letzte 12 Monate gegen Vorjahreszeitraum",
      question: "Erwirtschaftet das Unternehmen mehr frei verfügbaren Zahlungsfluss?",
      plain: "Verglichen wird der freie Zahlungsfluss im Verhältnis zum Umsatz über die letzten vier Quartale mit dem Vorjahreszeitraum."
    },
    revisionsTrend: {
      label: "Erwartungstrend", window: "3 Monate",
      question: "Heben oder senken Analysten ihre Gewinnschätzungen?",
      plain: "Gemessen würde die Veränderung der Konsensschätzungen in den letzten drei Monaten."
    },
    scoreMomentum: {
      label: "Verlauf der Faktorwerte", window: "30 / 60 Tage",
      question: "Verbessern oder verschlechtern sich die Faktorwerte selbst?",
      plain: "Gemessen würde, wie sich die veröffentlichten Faktorwerte über die letzten Wochen verändert haben."
    }
  };

  function measure(label, value, unit) { return { label: label, value: finite(value) ? round(value, 6) : null, unit: unit }; }

  /* ---------------------------------------------------------------------
     build(input) -> change model

     input.price      certified price-factor values (market-factors-1.0.0)
     input.priceStatus matching fieldStatus block
     input.fundamentals derived PIT-safe change inputs, or null
     --------------------------------------------------------------------- */
  function build(input) {
    input = input || {};
    var price = input.price || null,
      status = input.priceStatus || {},
      fundamentals = input.fundamentals || null,
      items = [];

    function priceReady(field) {
      var value = status[field];
      return value === "CALCULATED";
    }

    /* 1. Kurstempo */
    if (price && finite(price.momentumAcceleration) && priceReady("momentumAcceleration")) {
      var pace3m = finite(price.returns && price.returns["3M"]) ? price.returns["3M"] / 3 : null,
        last1m = finite(price.returns && price.returns["1M"]) ? price.returns["1M"] : null;
      items.push(item("momentumPace", MEANING.momentumPace,
        classify(price.momentumAcceleration, THRESHOLDS.momentumPaceAbsolute),
        measure("Durchschnittstempo 3 Monate", pace3m, "ratio"),
        measure("Letzter Monat", last1m, "ratio"),
        price.momentumAcceleration,
        [measure("Kursentwicklung 3 Monate", price.returns && price.returns["3M"], "ratio"),
         measure("Kursentwicklung 12 Monate", price.returns && price.returns["12M"], "ratio")],
        "Ein anziehendes Tempo beschreibt die jüngste Entwicklung. Es sagt nichts über die weitere Entwicklung aus."));
    } else items.push(unavailable("momentumPace", MEANING.momentumPace, "INSUFFICIENT_HISTORY"));

    /* 2. Relative Stärke */
    var rs = price && price.relativeStrength;
    if (rs && finite(rs["1M"]) && finite(rs["6M"])) {
      var rsPace = rs["1M"] - rs["6M"] / 6;
      items.push(item("relativeStrengthPace", MEANING.relativeStrengthPace,
        classify(rsPace, THRESHOLDS.relativeStrengthPaceAbsolute),
        measure("Durchschnittlicher Monatsvorsprung 6 Monate", rs["6M"] / 6, "ratio"),
        measure("Vorsprung letzter Monat", rs["1M"], "ratio"),
        rsPace,
        [measure("Vorsprung 3 Monate", rs["3M"], "ratio"), measure("Vorsprung 12 Monate", rs["12M"], "ratio")],
        "Gemessen gegen den hinterlegten breiten Vergleichsindex. Ein Vorsprung ist kein Qualitätsurteil."));
    } else items.push(unavailable("relativeStrengthPace", MEANING.relativeStrengthPace, "INSUFFICIENT_HISTORY"));

    /* 3. Schwankungsbreite. Eine Beruhigung ist hier "IMPROVING", weil
       weniger Schwankung weniger beobachtetes Risiko bedeutet - nicht,
       weil sie ein gutes Zeichen fuer den Kurs waere. */
    if (price && finite(price.volatility20d) && finite(price.volatility252d) && price.volatility252d > 0) {
      var ratio = price.volatility20d / price.volatility252d,
        volatilityDirection = ratio <= THRESHOLDS.volatilityCompressionRatio ? "IMPROVING"
          : ratio >= THRESHOLDS.volatilityExpansionRatio ? "DETERIORATING" : "STABLE";
      items.push(item("volatilityRegime", MEANING.volatilityRegime, volatilityDirection,
        measure("Schwankungsbreite 1 Jahr", price.volatility252d, "ratio"),
        measure("Schwankungsbreite 20 Tage", price.volatility20d, "ratio"),
        ratio - 1,
        [measure("Schwankungsbreite 60 Tage", price.volatility60d, "ratio"),
         measure("Größter Rückgang im Jahr", price.maxDrawdown252d, "ratio")],
        "Eine engere Schwankungsbreite bedeutet ruhigere Kurse in den letzten Wochen, keine Sicherheit."));
    } else items.push(unavailable("volatilityRegime", MEANING.volatilityRegime, "INSUFFICIENT_HISTORY"));

    /* 4. Handelsvolumen */
    if (price && finite(price.volumeRatio20over60)) {
      var volumeDirection = price.volumeRatio20over60 >= THRESHOLDS.volumeExpansionRatio ? "IMPROVING"
        : price.volumeRatio20over60 <= THRESHOLDS.volumeContractionRatio ? "DETERIORATING" : "STABLE";
      items.push(item("volumeRegime", MEANING.volumeRegime, volumeDirection,
        measure("Durchschnittsvolumen 60 Tage", price.avgVolume60d, "shares"),
        measure("Durchschnittsvolumen 20 Tage", price.avgVolume20d, "shares"),
        price.volumeRatio20over60 - 1,
        [measure("Volumen des letzten Tages gegen 20-Tage-Schnitt", price.volumeSpikeRatio, "ratio")],
        "Mehr Handelsaktivität zeigt gestiegenes Interesse. Die Richtung des Interesses ist damit nicht bestimmt."));
    } else items.push(unavailable("volumeRegime", MEANING.volumeRegime, "INSUFFICIENT_HISTORY"));

    /* 5. Trendstruktur */
    var flags = ["priceAboveSMA20", "priceAboveSMA50", "priceAboveSMA100", "priceAboveSMA200"],
      known = price ? flags.filter(function (field) { return typeof price[field] === "boolean"; }) : [];
    if (known.length === flags.length) {
      var above = known.filter(function (field) { return price[field]; }).length;
      items.push(item("trendStructure", MEANING.trendStructure,
        above === 4 ? "IMPROVING" : above === 0 ? "DETERIORATING" : "STABLE",
        measure("Durchschnittslinien gesamt", 4, "count"),
        measure("Davon unterschritten bzw. überschritten", above, "count"),
        above - 2,
        flags.map(function (field, index) { return measure("Über " + [20, 50, 100, 200][index] + "-Tage-Linie", price[field] ? 1 : 0, "boolean"); }),
        "Die Lage zu Durchschnittslinien beschreibt die bisherige Kursstruktur, keine Prognose."));
    } else items.push(unavailable("trendStructure", MEANING.trendStructure, "INSUFFICIENT_HISTORY"));

    /* 6. Naehe zum Jahreshoch. distanceTo52wHigh ist im Artefakt negativ
       oder null (Kurs unter oder am Hoch). */
    if (price && finite(price.distanceTo52wHigh)) {
      var gap = Math.abs(price.distanceTo52wHigh);
      items.push(item("highProximity", MEANING.highProximity,
        gap <= THRESHOLDS.highProximityPct ? "IMPROVING" : gap >= 0.25 ? "DETERIORATING" : "STABLE",
        measure("Abstand zum Jahreshoch", price.distanceTo52wHigh, "ratio"),
        measure("Abstand zum Jahrestief", price.distanceTo52wLow, "ratio"),
        -gap,
        [measure("Neues 52-Wochen-Hoch", price.newHigh52w ? 1 : 0, "boolean"),
         measure("Innerhalb von 5 % zum Hoch", price.within5PctOf52wHigh ? 1 : 0, "boolean")],
        "Nähe zum Jahreshoch beschreibt die Kursposition. Sie ist weder Kauf- noch Verkaufsgrund."));
    } else items.push(unavailable("highProximity", MEANING.highProximity, "INSUFFICIENT_HISTORY"));

    /* 7-9. Geschaeftsentwicklung. Nur aus zeitpunktsicheren Beobachtungen. */
    if (fundamentals && finite(fundamentals.revenueGrowthAcceleration)) {
      items.push(item("revenueAcceleration", MEANING.revenueAcceleration,
        classify(fundamentals.revenueGrowthAcceleration, THRESHOLDS.growthAccelerationAbsolute),
        measure("Umsatzwachstum Vorjahr", fundamentals.revenueGrowthPrior, "ratio"),
        measure("Umsatzwachstum aktuell", fundamentals.revenueGrowthCurrent, "ratio"),
        fundamentals.revenueGrowthAcceleration, [],
        "Beide Werte stammen aus veröffentlichten Geschäftsberichten und waren zum jeweiligen Meldedatum bekannt."));
    } else items.push(unavailable("revenueAcceleration", MEANING.revenueAcceleration,
      fundamentals ? "INSUFFICIENT_HISTORY" : "FUNDAMENTALS_UNAVAILABLE"));

    [["grossMarginChange", "grossMargin"], ["fcfMarginChange", "fcfMargin"]].forEach(function (pair) {
      var id = pair[0], key = pair[1];
      if (fundamentals && finite(fundamentals[key + "Ttm"]) && finite(fundamentals[key + "PriorTtm"])) {
        var delta = fundamentals[key + "Ttm"] - fundamentals[key + "PriorTtm"];
        items.push(item(id, MEANING[id], classify(delta, THRESHOLDS.marginChangeAbsolute),
          measure("Vorjahreszeitraum", fundamentals[key + "PriorTtm"], "ratio"),
          measure("Letzte 12 Monate", fundamentals[key + "Ttm"], "ratio"),
          delta, [],
          "Berechnet aus vier aufeinanderfolgenden Einzelquartalen gegen die vier Quartale davor."));
      } else items.push(unavailable(id, MEANING[id], fundamentals ? "INSUFFICIENT_HISTORY" : "FUNDAMENTALS_UNAVAILABLE"));
    });

    /* 10. Erwartungstrend bleibt extern blockiert. */
    items.push(unavailable("revisionsTrend", MEANING.revisionsTrend, "BLOCKED_EXTERNAL"));

    /* 11. Verlauf der Faktorwerte. Bewusst geschlossen: siehe Kopf. */
    items.push(unavailable("scoreMomentum", MEANING.scoreMomentum, "FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED"));

    var available = items.filter(function (entry) { return entry.state === "AVAILABLE"; }),
      improving = available.filter(function (entry) { return entry.direction === "IMPROVING"; }),
      deteriorating = available.filter(function (entry) { return entry.direction === "DETERIORATING"; });

    return {
      schemaVersion: SCHEMA_VERSION,
      methodologyVersion: METHODOLOGY_VERSION,
      state: available.length ? "AVAILABLE" : "UNAVAILABLE",
      asOf: input.asOf || null,
      basis: input.basis || null,
      items: items,
      counts: { total: items.length, available: available.length, improving: improving.length, deteriorating: deteriorating.length },
      thresholds: Object.assign({}, THRESHOLDS)
    };
  }

  /* ---------------------------------------------------------------------
     Wire format. The wording of an item is the same for every security, so
     it travels once in the artifact head and not 6,404 times. compact()
     keeps only what actually differs; hydrate() puts the meaning back.
     --------------------------------------------------------------------- */
  function compact(model) {
    return {
      state: model.state, asOf: model.asOf, basis: model.basis, counts: model.counts,
      items: model.items.map(function (entry) {
        return entry.state === "AVAILABLE"
          ? { id: entry.id, d: entry.direction, f: entry.from, t: entry.to, m: entry.magnitude, e: entry.evidence }
          : { id: entry.id, r: entry.reason };
      })
    };
  }

  function hydrate(packed) {
    if (!packed) return { state: "UNAVAILABLE", items: [], counts: { total: 0, available: 0, improving: 0, deteriorating: 0 } };
    var items = (packed.items || []).map(function (entry) {
      var meaning = MEANING[entry.id] || { label: entry.id, question: "", plain: "", window: null };
      if (entry.r) return unavailable(entry.id, meaning, entry.r);
      return {
        id: entry.id, label: meaning.label, question: meaning.question, plain: meaning.plain,
        state: "AVAILABLE", reason: null, reasonText: null,
        direction: entry.d, window: meaning.window || null,
        from: entry.f || null, to: entry.t || null, magnitude: entry.m,
        evidence: entry.e || [], interpretation: null
      };
    });
    return {
      schemaVersion: SCHEMA_VERSION, methodologyVersion: METHODOLOGY_VERSION,
      state: packed.state, asOf: packed.asOf || null, basis: packed.basis || null,
      items: items, counts: packed.counts || { total: items.length, available: 0, improving: 0, deteriorating: 0 },
      thresholds: Object.assign({}, THRESHOLDS)
    };
  }

  /* One readable sentence for the hero area. Built only from measured
     items; it names what moved and stays silent about what did not. */
  function headline(model) {
    if (!model || model.state !== "AVAILABLE") return "Derzeit ist keine belegte Veränderung auswertbar.";
    var improving = model.items.filter(function (entry) { return entry.direction === "IMPROVING"; }),
      deteriorating = model.items.filter(function (entry) { return entry.direction === "DETERIORATING"; });
    if (!improving.length && !deteriorating.length) return "In den gemessenen Bereichen hat sich zuletzt nichts wesentlich verändert.";
    var parts = [];
    if (improving.length) parts.push("Verbessert: " + improving.slice(0, 3).map(function (entry) { return entry.label; }).join(", "));
    if (deteriorating.length) parts.push("Verschlechtert: " + deteriorating.slice(0, 3).map(function (entry) { return entry.label; }).join(", "));
    return parts.join(" · ") + ".";
  }

  var api = {
    METHODOLOGY_VERSION: METHODOLOGY_VERSION,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DIRECTIONS: DIRECTIONS.slice(),
    ITEM_STATES: ITEM_STATES.slice(),
    ITEM_REASONS: ITEM_REASONS.slice(),
    THRESHOLDS: Object.assign({}, THRESHOLDS),
    WINDOWS: WINDOWS.map(function (entry) { return Object.assign({}, entry); }),
    MEANING: JSON.parse(JSON.stringify(MEANING)),
    REASON_TEXT: Object.assign({}, REASON_TEXT),
    build: build,
    compact: compact,
    hydrate: hydrate,
    headline: headline
  };

  if (isNode) module.exports = api;
  else global.VUChangeEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
