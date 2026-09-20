/* =========================================================================
   VISION UNIVERSE SOCIAL — evidence-regime.js
   WELCHE ZIELDIMENSIONEN DIE DATEN HEUTE TRAGEN

   -------------------------------------------------------------------------
   DAS PROBLEM
   -------------------------------------------------------------------------

   Das kanonische Zielmodell hat neun Dimensionen. Ein junges Konto liefert
   zwei davon. Daraus folgen zwei falsche Wege und ein richtiger:

     FALSCH  Die fehlenden Dimensionen als 0 verrechnen. Dann lernt das
             System, dass jeder Beitrag schlecht war — aus der Tatsache,
             dass niemand ihn gespeichert hat, weil dieses Konto ueberhaupt
             keine Speicherungen hat.

     FALSCH  Die Mindestabdeckung senken, bis die vorhandenen Daten
             genuegen. Das schafft das mehrdimensionale Modell ab und
             behaelt den Namen.

     RICHTIG Ausdruecklich sagen, welche Dimensionen die Datenlage traegt,
             warum die uebrigen ausgeschlossen sind, und jede Bewertung
             mit diesem Befund etikettieren.

   -------------------------------------------------------------------------
   WAS DIESES MODUL IST UND WAS NICHT
   -------------------------------------------------------------------------

   Es bewertet nichts. Es entscheidet, WORAN bewertet werden darf, und
   uebergibt das Ergebnis als Methodik an `performance.score` — dieselbe
   Engine wie zuvor, mit anderen Gewichten. Eine zweite Bewertungslogik
   waere der Ort, an dem dieselbe Regel spaeter zweimal steht und einmal
   davon falsch.

   Es ist ausserdem keine Regel ueber die 26 Beitraege von heute. Es misst
   und entscheidet selbst: Stichprobengroesse, Streuung, Medientyp. Waechst
   das Konto, waechst das Modell mit — ohne dass jemand ein Datum eintraegt.

   -------------------------------------------------------------------------
   KOHORTEN: EIN REEL IST KEIN BILDBEITRAG
   -------------------------------------------------------------------------

   Verweildauer gibt es bei Reels und nicht bei Bildern. Reichweite bedeutet
   bei beiden etwas anderes. Deshalb wird JE MEDIENTYP entschieden und
   verglichen — ein Reel gegen Reels, ein Bild gegen Bilder. Ein gemeinsamer
   Median waere eine Zahl, die keinen der beiden beschreibt.

   -------------------------------------------------------------------------
   WARUM REGIME-WECHSEL NICHT RUECKWIRKEND GELTEN
   -------------------------------------------------------------------------

   Ein Wert, der unter BOOTSTRAP entstand, ist nicht mit einem aus MATURE
   vergleichbar: es sind verschiedene Groessen mit demselben Namen. Jede
   Bewertung traegt deshalb ihr Regime mit sich, und die Learning Engine
   darf nur innerhalb eines Regimes vergleichen. Historische
   Strategieversionen werden nicht umgeschrieben — sie bleiben gueltig
   FUER IHR REGIME.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var Performance = isNode ? require("./performance.js") : global.VUSocialPerformance;

  /* Woraus eine Dimension gespeist wird. `metrics` heisst: steht im
     Schnappschuss. `context` heisst: kommt aus der eigenen Bewertung und
     existiert nur fuer Beitraege, die dieses System erzeugt hat. */
  var DIMENSION_SOURCE = {
    reach:              { kind: "metrics", fields: ["reach", "impressions"] },
    engagement:         { kind: "metrics", fields: ["engagementRate"] },
    retention:          { kind: "metrics", fields: ["completionRate", "watchTimeSeconds"] },
    shares:             { kind: "metrics", fields: ["shares"] },
    saves:              { kind: "metrics", fields: ["saves"] },
    followerConversion: { kind: "metrics", fields: ["followersGained"] },
    quality:            { kind: "context", fields: ["qualityScore"] },
    brandFit:           { kind: "context", fields: ["brandScore"] },
    strategicValue:     { kind: "context", fields: ["strategicValue"] }
  };

  var STATES = ["ACTIVE", "INSUFFICIENT_EVIDENCE", "DEGENERATE",
                "NOT_APPLICABLE", "NO_INPUT"];

  var DEFAULTS = {
    /* Dieselbe Schwelle wie die Vergleichsbasis in performance.js. Zwei
       verschiedene Mindestzahlen fuer dieselbe Frage waeren eine
       Einladung, die kleinere zu zitieren. */
    minimumSamplesPerDimension: 5,
    /* Eine Dimension, deren Werte alle gleich sind, unterscheidet nichts.
       Ihr Median ist als Bezugsgroesse unbrauchbar, und bei Median 0 ist
       kein Verhaeltnis bildbar. */
    requirePositiveMedian: true,
    /* Innerhalb der ZUGELASSENEN Gewichte muss ein Beitrag weiterhin
       belegt sein. Sonst haette ein Beitrag ohne jede Zahl in einem
       BOOTSTRAP-Regime einen Score. */
    minimumCoverageWithinRegime: 0.6,
    regimes: [
      { id: "MATURE",    minActiveWeight: 0.85, minSample: 50 },
      { id: "GROWING",   minActiveWeight: 0.45, minSample: 20 },
      { id: "BOOTSTRAP", minActiveWeight: 0,    minSample: 0 }
    ]
  };

  /** Welcher Kohorte gehoert ein Beitrag an? */
  function cohortOf(row) {
    var t = String((row && row.mediaType) || "").toUpperCase();
    if (t === "VIDEO" || t === "REELS" || t === "REEL") return "REEL";
    if (t === "CAROUSEL_ALBUM" || t === "CAROUSEL") return "CAROUSEL";
    if (t === "IMAGE") return "IMAGE";
    /* Der Permalink verraet es auch, wenn der Typ fehlt. Raten waere das
       Falsche; ablesen ist es nicht. */
    if (/\/reel\//.test(String((row && row.permalink) || ""))) return "REEL";
    return "UNKNOWN";
  }

  function werte(rows, source) {
    var out = [];
    rows.forEach(function (r) {
      var quelle = source.kind === "metrics"
        ? ((r.snapshot && r.snapshot.metrics) || {})
        : (r.context || {});
      for (var i = 0; i < source.fields.length; i += 1) {
        var v = quelle[source.fields[i]];
        if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
          out.push(Number(v));
          return;
        }
      }
    });
    return out;
  }

  function median(xs) {
    if (!xs.length) return null;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /**
   * Der Zustand EINER Dimension in EINER Kohorte.
   *
   * Die Reihenfolge der Pruefungen ist die Aussage: erst ob die Groesse
   * fuer diesen Medientyp ueberhaupt existiert, dann ob genug gemessen
   * wurde, dann ob das Gemessene unterscheidet. Andersherum bekaeme ein
   * Bildbeitrag "zu wenig Daten" fuer die Verweildauer — und jemand
   * wuerde anfangen, mehr Bilder zu messen.
   */
  function assessDimension(dimension, rows, options) {
    var source = DIMENSION_SOURCE[dimension];
    if (!source) {
      return { state: "NO_INPUT", reason: "Unbekannte Dimension.", sampleSize: 0, median: null };
    }

    var vals = werte(rows, source);

    if (source.kind === "context" && vals.length === 0) {
      return {
        state: "NO_INPUT", sampleSize: 0, median: null,
        reason: "Interne Bewertung, die nur fuer selbst erzeugte Beitraege vorliegt. " +
          "Fuer uebernommene Bestandsbeitraege gibt es sie nicht — das ist kein Messfehler."
      };
    }

    if (vals.length === 0) {
      return {
        state: "NOT_APPLICABLE", sampleSize: 0, median: null,
        reason: "Die Plattform meldet diese Groesse fuer diesen Medientyp nicht."
      };
    }

    if (vals.length < options.minimumSamplesPerDimension) {
      return {
        state: "INSUFFICIENT_EVIDENCE", sampleSize: vals.length, median: median(vals),
        reason: "Nur " + vals.length + " Messwerte; ab " + options.minimumSamplesPerDimension +
          " entsteht eine Vergleichsbasis."
      };
    }

    var med = median(vals);
    var alleGleich = vals.every(function (v) { return v === vals[0]; });

    if (alleGleich) {
      return {
        state: "DEGENERATE", sampleSize: vals.length, median: med,
        reason: "Alle " + vals.length + " Werte sind " + vals[0] +
          ". Eine Groesse, die nicht unterscheidet, kann keinen Beitrag von einem " +
          "anderen trennen — als 0-Leistung gelesen wuerde sie jeden abwerten."
      };
    }

    if (options.requirePositiveMedian && !(med > 0)) {
      return {
        state: "DEGENERATE", sampleSize: vals.length, median: med,
        reason: "Der Median ist " + med + ". Der Score misst Verhaeltnisse zur Basis, " +
          "und gegen 0 ist kein Verhaeltnis bildbar."
      };
    }

    return {
      state: "ACTIVE", sampleSize: vals.length, median: med,
      reason: vals.length + " Messwerte, Median " + med + "."
    };
  }

  /**
   * Der Befund fuer eine Kohorte: welche Dimensionen tragen, welche
   * Methodik folgt daraus, und welche Vergleichsbasis gilt.
   */
  function assessCohort(cohort, rows, options) {
    var kanonisch = Performance.DEFAULT_METHODOLOGY.weights;
    var dimensions = {};
    var aktiv = [];
    var ausgeschlossen = [];
    var aktivesGewicht = 0;
    var gesamtGewicht = 0;

    Object.keys(kanonisch).forEach(function (d) {
      var w = kanonisch[d] || 0;
      gesamtGewicht += w;
      var befund = assessDimension(d, rows, options);
      befund.canonicalWeight = w;
      dimensions[d] = befund;
      if (befund.state === "ACTIVE") {
        aktiv.push(d);
        aktivesGewicht += w;
      } else {
        ausgeschlossen.push({ dimension: d, state: befund.state, reason: befund.reason,
                              canonicalWeight: w });
      }
    });

    var anteil = gesamtGewicht === 0 ? 0 : aktivesGewicht / gesamtGewicht;

    /* Die zugelassenen Gewichte werden auf 1 normiert. Ohne das waere die
       Coverage-Pruefung in performance.score gegen die kanonische Summe
       gerechnet und schluege immer fehl — die Dimensionen fehlen ja
       absichtlich. */
    var weights = {};
    aktiv.forEach(function (d) { weights[d] = kanonisch[d] / (aktivesGewicht || 1); });

    var regime = options.regimes.filter(function (r) {
      return anteil >= r.minActiveWeight && rows.length >= r.minSample;
    })[0] || options.regimes[options.regimes.length - 1];

    return {
      cohort: cohort,
      sampleSize: rows.length,
      dimensions: dimensions,
      activeDimensions: aktiv,
      excludedDimensions: ausgeschlossen,
      activeWeightShare: Math.round(anteil * 1000) / 1000,
      regime: regime.id,
      regimeReason: "Von der kanonischen Gewichtung sind " + Math.round(anteil * 100) +
        " % belegt, bei " + rows.length + " Beitraegen. " +
        (regime.id === "MATURE"
          ? "Das kanonische Modell traegt."
          : "Fuer " + regime.id + " genuegt das; fuer die naechste Stufe fehlen " +
            naechsteStufe(regime, anteil, rows.length, options)),
      /* Die Methodik, die performance.score bekommt. Dieselbe Engine,
         andere Gewichte — keine zweite Bewertungslogik. */
      methodology: {
        version: Performance.DEFAULT_METHODOLOGY.version + "+" + regime.id.toLowerCase() +
                 "." + cohort.toLowerCase(),
        weights: weights,
        caps: Performance.DEFAULT_METHODOLOGY.caps,
        minimumBaselineSample: Performance.DEFAULT_METHODOLOGY.minimumBaselineSample,
        minimumCoverage: options.minimumCoverageWithinRegime
      },
      baseline: Performance.buildBaseline(rows.map(function (r) { return r.snapshot; }))
    };
  }

  function naechsteStufe(regime, anteil, n, options) {
    var i = options.regimes.indexOf(regime);
    var ziel = options.regimes[i - 1];
    if (!ziel) return "nichts mehr.";
    var fehlt = [];
    if (anteil < ziel.minActiveWeight) {
      fehlt.push("Gewichtung " + Math.round(anteil * 100) + " % von " +
                 Math.round(ziel.minActiveWeight * 100) + " %");
    }
    if (n < ziel.minSample) fehlt.push("Stichprobe " + n + " von " + ziel.minSample);
    return fehlt.join(" und ") + " (Ziel: " + ziel.id + ").";
  }

  /**
   * Der Gesamtbefund ueber alle Kohorten.
   *
   * Das Regime der Anlage ist das NIEDRIGSTE der belegten Kohorten. Das
   * ist absichtlich vorsichtig: eine Anlage, die sich MATURE nennt, weil
   * eine von drei Kohorten reif ist, wuerde die anderen zwei mit einer
   * Zuversicht behandeln, die es dort nicht gibt.
   */
  function assess(rows, options) {
    options = Object.assign({}, DEFAULTS, options || {});
    var brauchbar = (rows || []).filter(function (r) {
      return r && r.snapshot && r.snapshot.state !== "UNAVAILABLE";
    });

    var nachKohorte = {};
    brauchbar.forEach(function (r) {
      var c = cohortOf(r);
      (nachKohorte[c] = nachKohorte[c] || []).push(r);
    });

    var cohorts = {};
    Object.keys(nachKohorte).forEach(function (c) {
      cohorts[c] = assessCohort(c, nachKohorte[c], options);
    });

    var reihenfolge = options.regimes.map(function (r) { return r.id; });
    var niedrigstes = Object.keys(cohorts).reduce(function (acc, c) {
      var i = reihenfolge.indexOf(cohorts[c].regime);
      return i > acc.i ? { i: i, id: cohorts[c].regime } : acc;
    }, { i: -1, id: reihenfolge[reihenfolge.length - 1] });

    return {
      assessedAt: options.now || null,
      sampleSize: brauchbar.length,
      unusable: (rows || []).length - brauchbar.length,
      regime: Object.keys(cohorts).length ? niedrigstes.id : "BOOTSTRAP",
      cohorts: cohorts,
      /* Was in der Strategie-Version landet. Ohne diesen Block liesse
         sich spaeter nicht sagen, WORAN eine Entscheidung gemessen
         wurde — und eine Strategie, deren Massstab unbekannt ist, ist
         nicht nachvollziehbar, nur alt. */
      record: {
        evidenceRegime: Object.keys(cohorts).length ? niedrigstes.id : "BOOTSTRAP",
        assessedAt: options.now || null,
        sampleSize: brauchbar.length,
        cohorts: Object.keys(cohorts).map(function (c) {
          return {
            cohort: c,
            regime: cohorts[c].regime,
            sampleSize: cohorts[c].sampleSize,
            activeDimensions: cohorts[c].activeDimensions.slice(),
            activeWeightShare: cohorts[c].activeWeightShare,
            excluded: cohorts[c].excludedDimensions.map(function (e) {
              return { dimension: e.dimension, state: e.state, reason: e.reason };
            }),
            baselineSufficient: cohorts[c].baseline.sufficient,
            methodologyVersion: cohorts[c].methodology.version,
            reason: cohorts[c].regimeReason
          };
        })
      }
    };
  }

  /** Die Kohorte eines einzelnen Beitrags, damit der Zyklus sie nicht raet. */
  function cohortFor(row) { return cohortOf(row); }

  var api = {
    assess: assess,
    assessCohort: assessCohort,
    assessDimension: assessDimension,
    cohortFor: cohortFor,
    DIMENSION_SOURCE: DIMENSION_SOURCE,
    STATES: STATES,
    DEFAULTS: DEFAULTS
  };

  if (isNode) module.exports = api;
  else global.VUSocialEvidenceRegime = api;
})(typeof window !== "undefined" ? window : globalThis);
