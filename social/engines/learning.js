/* =========================================================================
   VISION UNIVERSE SOCIAL — learning.js
   LEARNING ENGINE (§19) UND SELBSTOPTIMIERUNG (§21)
   MIT DER INVARIANTEN SICHERHEITSGRENZE (§51)

   Die Engine lernt, welche Themen, Hooks, Formate, Visuals, Zeitpunkte
   und Tiefen fuer Vision Universe funktionieren.

   -------------------------------------------------------------------------
   DER SATZ, DER DIESE DATEI REGIERT
   -------------------------------------------------------------------------

   Korrelation ist nicht Kausalitaet — und n=3 ist nicht einmal
   Korrelation.

   Jede Beobachtung traegt ihre Stichprobengroesse und ein
   Konfidenzintervall. Eine Beobachtung, deren Intervall die Null
   enthaelt, ist KEIN Ergebnis. Sie darf nichts veraendern, egal wie
   ueberzeugend der Mittelwert aussieht.

   Das ist keine Vorsicht, sondern Notwendigkeit: bei zwoelf Dimensionen
   und woechentlichen Auswertungen findet man rein zufaellig staendig
   "Effekte". Wer sie uebernimmt, optimiert Rauschen.

   -------------------------------------------------------------------------
   WAS DIE ENGINE AENDERN DARF
   -------------------------------------------------------------------------

   Score-Gewichte, Themenprioritaeten, Formatwahl, Hook-Wahl, Timing,
   Plattformwahl, Content-Mix, Explorationsrate, Strategieparameter.

   Versioniert, erklaerbar, reversibel, messbar.

   -------------------------------------------------------------------------
   WAS SIE NIEMALS AENDERN DARF (§51 — INVARIANT)
   -------------------------------------------------------------------------

   Sicherheitsregeln, Compliance, Kill Switch, Secret Handling, Tests,
   Provenance-Anforderungen, Publishing-Rechte.

   Diese Grenze ist hier NICHT als Kommentar umgesetzt, sondern als
   Sperrliste, die jede Aenderung passieren muss. Eine Engine, die sich
   selbst optimiert, wird irgendwann feststellen, dass die Faktenpruefung
   Durchsatz kostet. Sie soll dann nicht diskutieren koennen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;
  var Hash   = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  /* ------------------------------------------------------------------ */
  /* DIE INVARIANTE GRENZE                                                */
  /* ------------------------------------------------------------------ */

  /* Parameterpfade, die die Learning Engine veraendern DARF. Eine
     Erlaubnisliste, keine Verbotsliste: was hier nicht steht, ist
     gesperrt. Eine Verbotsliste waere unvollstaendig, sobald jemand einen
     neuen Parameter einfuehrt. */
  var MUTABLE_PARAMETERS = [
    "explorationRate",
    "topicPriorities",
    "archetypeWeights",
    "hookStyleWeights",
    "visualWeights",
    "timingWindows",
    "platformWeights",
    "contentMix",
    "trendScoreWeights",
    "opportunityWeights",
    "proposalThreshold"
  ];

  /* Ausdrueckliche Sperrliste — redundant zur Erlaubnisliste, und das ist
     Absicht: sie dokumentiert, WORUM es geht, und faengt den Fall, dass
     jemand die Erlaubnisliste erweitert, ohne nachzudenken. */
  var FORBIDDEN_PARAMETERS = [
    "killSwitch", "autopublish", "autonomyLevel",
    "factCheck", "factValidation", "provenanceRequired", "minimumProvenance",
    "brandBlockingTerms", "secrets", "tokenHandling", "permissions", "scopes",
    "tests", "testCoverage", "safetyRules", "compliance", "publishingPermissions"
  ];

  /* Harte Grenzen fuer die Parameter, die geaendert werden duerfen. Eine
     Explorationsrate von 0 waere formal eine erlaubte Optimierung — und
     das Ende des Lernens. */
  var PARAMETER_BOUNDS = {
    explorationRate: { min: 0.05, max: 0.40 },
    proposalThreshold: { min: 30, max: 90 }
  };

  function isMutable(path) {
    var root = String(path).split(".")[0];
    if (FORBIDDEN_PARAMETERS.indexOf(root) !== -1) return false;
    return MUTABLE_PARAMETERS.indexOf(root) !== -1;
  }

  /* ------------------------------------------------------------------ */
  /* Statistik                                                            */
  /* ------------------------------------------------------------------ */

  function mean(values) {
    if (!values.length) return null;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  function stdDev(values) {
    if (values.length < 2) return null;
    var m = mean(values);
    var variance = values.reduce(function (acc, v) { return acc + (v - m) * (v - m); }, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Welch-t-Intervall fuer die Differenz zweier Mittelwerte, 95 %.
   *
   * Bewusst Welch und nicht Student: die Gruppen haben unterschiedliche
   * Groessen und Streuungen, und die Annahme gleicher Varianzen ist hier
   * nichts als eine Bequemlichkeit, die das Intervall zu eng macht.
   *
   * Der kritische Wert ist auf 1.96 gesetzt (Normalapproximation) und fuer
   * kleine Stichproben durch einen konservativen Aufschlag ersetzt — eine
   * vollstaendige t-Verteilung waere hier mehr Genauigkeit, als die Daten
   * tragen.
   */
  function differenceInterval(groupA, groupB) {
    var nA = groupA.length, nB = groupB.length;
    if (nA < 2 || nB < 2) return null;
    var mA = mean(groupA), mB = mean(groupB);
    var sA = stdDev(groupA), sB = stdDev(groupB);
    var se = Math.sqrt((sA * sA) / nA + (sB * sB) / nB);
    if (!Number.isFinite(se) || se === 0) return null;

    var dfNum = Math.pow((sA * sA) / nA + (sB * sB) / nB, 2);
    var dfDen = Math.pow((sA * sA) / nA, 2) / (nA - 1) + Math.pow((sB * sB) / nB, 2) / (nB - 1);
    var df = dfDen === 0 ? (nA + nB - 2) : dfNum / dfDen;

    /* Konservative kritische Werte statt einer t-Tabelle. */
    var critical = df >= 30 ? 1.96 : (df >= 20 ? 2.09 : (df >= 10 ? 2.23 : (df >= 5 ? 2.57 : 3.18)));

    var diff = mA - mB;
    var margin = critical * se;
    return {
      difference: diff,
      lower: diff - margin,
      upper: diff + margin,
      standardError: se,
      degreesOfFreedom: Math.round(df * 10) / 10,
      critical: critical,
      /* Das Intervall enthaelt die Null -> kein Ergebnis. */
      significant: (diff - margin) * (diff + margin) > 0
    };
  }

  /* ------------------------------------------------------------------ */
  /* Beobachtungen                                                        */
  /* ------------------------------------------------------------------ */

  var DEFAULT_OPTIONS = {
    minimumSampleSize: 5,
    /* Mindestabstand, damit ein Effekt praktisch bedeutsam ist. Ein
       statistisch signifikanter Unterschied von 1,2 Punkten ist wahr und
       trotzdem irrelevant. */
    minimumEffect: 0.05,
    learningRate: 0.2,
    maxRelativeChange: 0.25
  };

  /**
   * Wertet eine Dimension aus: fuer jede Auspraegung ein Vergleich gegen
   * alle anderen.
   *
   * @param records  [{ dimensionValue, performanceScore }]
   */
  function observe(dimension, records, options) {
    options = Object.assign({}, DEFAULT_OPTIONS, options || {});
    var rows = (records || []).filter(function (r) {
      return r && r.value !== null && r.value !== undefined &&
             Number.isFinite(Number(r.performanceScore));
    });

    var groups = Object.create(null);
    rows.forEach(function (r) {
      var key = String(r.value);
      (groups[key] = groups[key] || []).push(Number(r.performanceScore) / 100);
    });

    var keys = Object.keys(groups);
    var observations = keys.map(function (key) {
      var inGroup = groups[key];
      var outGroup = keys.filter(function (k) { return k !== key; })
        .reduce(function (acc, k) { return acc.concat(groups[k]); }, []);

      var interval = differenceInterval(inGroup, outGroup);
      var effect = interval ? interval.difference : null;
      var sufficient = inGroup.length >= options.minimumSampleSize &&
                       outGroup.length >= options.minimumSampleSize &&
                       interval !== null && interval.significant &&
                       Math.abs(effect) >= options.minimumEffect;

      var note;
      if (inGroup.length < options.minimumSampleSize) {
        note = "Nur " + inGroup.length + " Beitraege; ab " + options.minimumSampleSize +
               " wird daraus eine Aussage. Bis dahin ist der Mittelwert eine Anekdote.";
      } else if (!interval) {
        note = "Die Streuung laesst sich nicht bestimmen.";
      } else if (!interval.significant) {
        note = "Das 95-%-Intervall [" + round(interval.lower) + ", " + round(interval.upper) +
               "] enthaelt die Null. Der beobachtete Unterschied von " + round(effect) +
               " ist mit Zufall vereinbar.";
      } else if (Math.abs(effect) < options.minimumEffect) {
        note = "Der Unterschied von " + round(effect) + " ist belastbar, aber zu klein, " +
               "um eine Aenderung zu rechtfertigen (Schwelle " + options.minimumEffect + ").";
      } else {
        note = (effect > 0 ? "Besser" : "Schlechter") + " als der Rest um " + round(Math.abs(effect)) +
               " (95-%-Intervall [" + round(interval.lower) + ", " + round(interval.upper) + "], n=" +
               inGroup.length + ").";
      }

      return Schema.learningObservation({
        observationId: Hash.prefixedHash("obs", { dimension: dimension, value: key, n: inGroup.length }),
        createdAt: options.now || new Date().toISOString(),
        dimension: dimension,
        value: key,
        sampleSize: inGroup.length,
        effect: effect,
        confidenceInterval: interval ? [interval.lower, interval.upper] : null,
        sufficient: sufficient,
        note: note
      });
    });

    return observations.sort(function (a, b) { return (b.effect || 0) - (a.effect || 0); });
  }

  function round(x) { return Math.round(x * 1000) / 1000; }

  /* ------------------------------------------------------------------ */
  /* Strategieaenderung                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Schlaegt eine neue Strategieversion vor.
   *
   * DREI SPERREN, in dieser Reihenfolge:
   *   1. Nur belastbare Beobachtungen (sufficient === true)
   *   2. Nur veraenderbare Parameter (die invariante Grenze, §51)
   *   3. Nur begrenzte Schritte (maxRelativeChange)
   *
   * Die dritte ist die unterschaetzte: eine einzelne gute Woche darf die
   * Strategie nicht umdrehen. Lernen in kleinen Schritten ist langsamer
   * und ueberlebt schlechte Stichproben.
   */
  function proposeStrategyUpdate(currentVersion, observations, options) {
    options = Object.assign({}, DEFAULT_OPTIONS, options || {});
    currentVersion = currentVersion || { versionId: "strategy_initial", parameters: {} };

    var usable = (observations || []).filter(function (o) { return o.sufficient === true; });
    var rejected = (observations || []).filter(function (o) { return o.sufficient !== true; });

    if (usable.length === 0) {
      return {
        changed: false,
        version: currentVersion,
        applied: [],
        rejected: rejected.map(function (o) {
          return { dimension: o.dimension, value: o.value, reason: o.note };
        }),
        blocked: [],
        explanation: "Keine Strategieaenderung: von " + (observations || []).length +
          " Beobachtungen war keine belastbar. Das ist der Normalfall bei kleinen Stichproben " +
          "und kein Fehler."
      };
    }

    var parameters = JSON.parse(JSON.stringify(currentVersion.parameters || {}));
    var applied = [];
    var blocked = [];

    usable.forEach(function (o) {
      var path = dimensionToParameter(o.dimension);
      if (!path) {
        blocked.push({ dimension: o.dimension, value: o.value,
          reason: "Fuer die Dimension '" + o.dimension + "' ist kein Strategieparameter vorgesehen." });
        return;
      }
      if (!isMutable(path)) {
        /* §51. Der Fall wird protokolliert, nicht verschwiegen: eine
           Engine, die wiederholt an derselben Grenze rueckt, ist ein
           Befund. */
        blocked.push({ dimension: o.dimension, value: o.value, parameter: path,
          reason: "INVARIANT: '" + path + "' darf von der Learning Engine nicht veraendert werden (§51)." });
        return;
      }

      var root = path.split(".")[0];
      parameters[root] = parameters[root] || {};
      var before = parameters[root][o.value];
      if (before === undefined || before === null) before = 1;

      /* Begrenzter Schritt in Richtung des Effekts. */
      var delta = options.learningRate * o.effect;
      var maxDelta = Math.abs(before) * options.maxRelativeChange;
      if (Math.abs(delta) > maxDelta) delta = Math.sign(delta) * maxDelta;
      var after = before + delta;

      var bounds = PARAMETER_BOUNDS[root];
      if (bounds) after = Math.max(bounds.min, Math.min(bounds.max, after));

      parameters[root][o.value] = Math.round(after * 10000) / 10000;
      applied.push({
        parameter: root + "." + o.value,
        before: before, after: parameters[root][o.value],
        effect: o.effect, sampleSize: o.sampleSize,
        observationId: o.observationId,
        reason: o.note
      });
    });

    if (applied.length === 0) {
      return {
        changed: false, version: currentVersion, applied: [],
        rejected: rejected.map(function (o) { return { dimension: o.dimension, value: o.value, reason: o.note }; }),
        blocked: blocked,
        explanation: "Keine Strategieaenderung: alle belastbaren Beobachtungen betrafen Parameter, " +
          "die nicht veraendert werden duerfen."
      };
    }

    var newVersion = Schema.strategyVersion({
      versionId: Hash.prefixedHash("strat", { parent: currentVersion.versionId, parameters: parameters }),
      createdAt: options.now || new Date().toISOString(),
      parentVersionId: currentVersion.versionId,
      parameters: parameters,
      observationIds: applied.map(function (a) { return a.observationId; }),
      rationale: applied.map(function (a) {
        return a.parameter + ": " + a.before + " -> " + a.after + " (" + a.reason + ")";
      }).join(" | "),
      reversible: true
    });

    return {
      changed: true,
      version: newVersion,
      applied: applied,
      rejected: rejected.map(function (o) { return { dimension: o.dimension, value: o.value, reason: o.note }; }),
      blocked: blocked,
      explanation: applied.length + " Parameter angepasst auf Basis von " + usable.length +
        " belastbaren Beobachtungen; " + rejected.length + " Beobachtungen verworfen" +
        (blocked.length ? ", " + blocked.length + " Aenderung(en) durch die Sicherheitsgrenze gestoppt" : "") + "."
    };
  }

  function dimensionToParameter(dimension) {
    var map = {
      archetype: "archetypeWeights",
      visualType: "visualWeights",
      topic: "topicPriorities",
      platform: "platformWeights",
      hookStyle: "hookStyleWeights",
      hour: "timingWindows"
    };
    return map[dimension] || null;
  }

  /**
   * Rollback. Er ist kein Notfallwerkzeug, sondern Teil des normalen
   * Betriebs: eine Aenderung, die nicht zurueckgenommen werden kann, ist
   * keine Optimierung, sondern ein Risiko (§21).
   */
  function rollback(versions, targetVersionId) {
    var target = (versions || []).filter(function (v) { return v.versionId === targetVersionId; })[0];
    if (!target) {
      return { ok: false, reason: "Version " + targetVersionId + " ist nicht bekannt." };
    }
    if (target.reversible === false) {
      return { ok: false, reason: "Version " + targetVersionId + " ist als nicht umkehrbar markiert." };
    }
    return {
      ok: true,
      version: target,
      reason: "Zurueck auf " + targetVersionId + " vom " + String(target.createdAt).slice(0, 10) + "."
    };
  }

  var api = {
    MUTABLE_PARAMETERS: MUTABLE_PARAMETERS,
    FORBIDDEN_PARAMETERS: FORBIDDEN_PARAMETERS,
    PARAMETER_BOUNDS: PARAMETER_BOUNDS,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    isMutable: isMutable,
    mean: mean,
    stdDev: stdDev,
    differenceInterval: differenceInterval,
    observe: observe,
    proposeStrategyUpdate: proposeStrategyUpdate,
    rollback: rollback,
    dimensionToParameter: dimensionToParameter
  };

  if (isNode) module.exports = api;
  else global.VUSocialLearning = api;
})(typeof window !== "undefined" ? window : globalThis);
