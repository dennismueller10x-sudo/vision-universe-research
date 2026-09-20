/* =========================================================================
   VISION UNIVERSE SOCIAL — experiments.js
   EXPERIMENTATION ENGINE (§20)

   Ein Experiment ist kein "wir probieren mal was anderes". Es hat eine
   Hypothese, genau EINE veraenderte Variable, eine Kontrollgruppe, eine
   vorher festgelegte Stichprobengroesse und eine Entscheidung.

   DIE REGEL, DIE §20 WOERTLICH VERLANGT

   Nicht gleichzeitig zehn Variablen aendern und anschliessend behaupten,
   eine einzelne habe gewonnen.

   Diese Datei setzt das durch: `declare()` lehnt ein Experiment ab, das
   mehr als eine Variable veraendert. Der Test dazu ist Pflicht — ohne ihn
   waere die Regel eine Bitte.

   VORHER FESTLEGEN, NACHHER AUSWERTEN

   Die Stichprobengroesse steht VOR dem ersten Beitrag fest. Wer waehrend
   des Laufs auswertet und beendet, sobald das Ergebnis gefaellt, findet
   immer etwas — das ist kein Experiment, sondern eine Suche nach
   Bestaetigung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Learning = isNode ? require("./learning.js") : global.VUSocialLearning;
  var Hash     = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  var STATES = ["DECLARED", "RUNNING", "READY_FOR_DECISION", "DECIDED", "ABANDONED"];

  /* Variablen, die ein Experiment veraendern darf. Ein Experiment ueber
     die Faktenpruefung gibt es nicht (§51). */
  var TESTABLE_VARIABLES = [
    "hookStyle", "visualType", "captionLength", "questionVsStatement",
    "archetype", "postingHour", "ctaStyle", "carouselLength", "thumbnailStyle"
  ];

  var DEFAULT_OPTIONS = {
    /* Mindeststichprobe JE ARM. Sie ist bewusst klein genug, um in einem
       realistischen Posting-Rhythmus erreichbar zu sein, und gross genug,
       dass ein Ergebnis nicht aus zwei guten Tagen besteht. */
    minimumSamplePerArm: 8,
    minimumEffect: 0.05,
    maxDurationDays: 45
  };

  function fail(m) { throw new Error("VUSocialExperiments: " + m); }

  /**
   * Erklaert ein Experiment. Lehnt alles ab, was nicht auswertbar waere.
   */
  function declare(spec, options) {
    options = Object.assign({}, DEFAULT_OPTIONS, options || {});
    spec = spec || {};
    var problems = [];

    if (!spec.hypothesis) problems.push("Ohne Hypothese ist es kein Experiment, sondern eine Variation.");
    if (!spec.variable) problems.push("Keine Variable angegeben.");
    else if (TESTABLE_VARIABLES.indexOf(spec.variable) === -1) {
      problems.push("Die Variable '" + spec.variable + "' ist nicht testbar. Erlaubt: " +
                    TESTABLE_VARIABLES.join(", ") + ".");
    }
    if (!spec.control) problems.push("Keine Kontrollgruppe angegeben.");
    if (!spec.variant) problems.push("Keine Variante angegeben.");
    if (spec.control && spec.variant && String(spec.control) === String(spec.variant)) {
      problems.push("Kontrolle und Variante sind identisch.");
    }

    /* DIE KERNREGEL: genau eine Variable. */
    var additional = Array.isArray(spec.additionalChanges) ? spec.additionalChanges : [];
    if (additional.length > 0) {
      problems.push("Ein Experiment veraendert genau eine Variable. Zusaetzlich veraendert: " +
                    additional.join(", ") + ". Das Ergebnis liesse sich keiner Ursache zuordnen.");
    }

    var plannedSample = Number(spec.plannedSamplePerArm) || options.minimumSamplePerArm;
    if (plannedSample < options.minimumSamplePerArm) {
      problems.push("Geplante Stichprobe von " + plannedSample + " je Arm ist zu klein (mindestens " +
                    options.minimumSamplePerArm + ").");
    }

    if (problems.length) {
      return { ok: false, experiment: null, problems: problems,
               explanation: "Experiment nicht angenommen: " + problems.join(" ") };
    }

    var experiment = {
      experimentId: Hash.prefixedHash("exp", {
        variable: spec.variable, control: spec.control, variant: spec.variant,
        hypothesis: spec.hypothesis
      }),
      state: "DECLARED",
      hypothesis: String(spec.hypothesis),
      variable: spec.variable,
      control: String(spec.control),
      variant: String(spec.variant),
      /* Vorher festgelegt und danach unveraenderlich. */
      plannedSamplePerArm: plannedSample,
      minimumEffect: options.minimumEffect,
      declaredAt: options.now || new Date().toISOString(),
      maxDurationDays: options.maxDurationDays,
      observations: { control: [], variant: [] },
      decision: null
    };

    return { ok: true, experiment: experiment, problems: [],
             explanation: "Experiment angenommen: " + experiment.hypothesis +
               " (eine Variable: " + experiment.variable + ", " + plannedSample + " je Arm geplant)." };
  }

  /** Traegt ein Ergebnis ein. */
  function record(experiment, arm, performanceScore) {
    if (!experiment) fail("record() ohne Experiment");
    if (["control", "variant"].indexOf(arm) === -1) fail("unbekannter Arm: " + arm);
    if (experiment.state === "DECIDED" || experiment.state === "ABANDONED") {
      return { ok: false, reason: "Das Experiment ist abgeschlossen (" + experiment.state + ")." };
    }
    /* Number(null) ist 0, und 0 ist endlich. Ohne diese Zeile zaehlt ein
       Beitrag ohne Score als Beitrag mit dem schlechtesten Score. */
    var value = (performanceScore === null || performanceScore === undefined || performanceScore === "")
      ? NaN : Number(performanceScore);
    if (!Number.isFinite(value)) {
      /* Ein Beitrag ohne Performance Score zaehlt nicht mit. Ihn mit 0 zu
         fuehren waere eine Aussage ueber Daten, die es nicht gibt. */
      return { ok: false, reason: "Kein Performance Score — der Beitrag zaehlt nicht in die Auswertung." };
    }
    experiment.observations[arm].push(value / 100);
    experiment.state = "RUNNING";

    var ready = experiment.observations.control.length >= experiment.plannedSamplePerArm &&
                experiment.observations.variant.length >= experiment.plannedSamplePerArm;
    if (ready) experiment.state = "READY_FOR_DECISION";

    return { ok: true, state: experiment.state,
             counts: { control: experiment.observations.control.length,
                       variant: experiment.observations.variant.length } };
  }

  /**
   * Wertet aus — aber erst, wenn die geplante Stichprobe erreicht ist.
   *
   * Ein frueher Blick ist erlaubt (`peek: true`), liefert aber
   * ausdruecklich KEINE Entscheidung. Der Unterschied ist die ganze
   * Disziplin dieser Datei.
   */
  function evaluate(experiment, options) {
    options = Object.assign({}, DEFAULT_OPTIONS, options || {});
    if (!experiment) fail("evaluate() ohne Experiment");

    var c = experiment.observations.control;
    var v = experiment.observations.variant;
    var reached = c.length >= experiment.plannedSamplePerArm && v.length >= experiment.plannedSamplePerArm;

    if (!reached && !options.peek) {
      return {
        decided: false,
        state: experiment.state,
        counts: { control: c.length, variant: v.length },
        needed: experiment.plannedSamplePerArm,
        explanation: "Noch keine Entscheidung: " + c.length + "/" + experiment.plannedSamplePerArm +
          " Kontrolle und " + v.length + "/" + experiment.plannedSamplePerArm + " Variante. " +
          "Vorzeitig auszuwerten hiesse, so lange zu schauen, bis das Ergebnis gefaellt."
      };
    }

    var interval = Learning.differenceInterval(v, c);
    if (!interval) {
      return {
        decided: false, state: experiment.state,
        counts: { control: c.length, variant: v.length },
        explanation: "Die Streuung laesst sich nicht bestimmen; eine Aussage ist nicht moeglich."
      };
    }

    var effect = interval.difference;
    var significant = interval.significant;
    var relevant = Math.abs(effect) >= experiment.minimumEffect;

    var decision;
    if (!significant) {
      decision = "NO_DIFFERENCE";
    } else if (!relevant) {
      decision = "NEGLIGIBLE";
    } else {
      decision = effect > 0 ? "ADOPT_VARIANT" : "KEEP_CONTROL";
    }

    var explanation;
    switch (decision) {
      case "ADOPT_VARIANT":
        explanation = "Die Variante liegt um " + round(effect) + " ueber der Kontrolle " +
          "(95-%-Intervall [" + round(interval.lower) + ", " + round(interval.upper) + "], n=" +
          v.length + " gegen " + c.length + "). Die Variante wird uebernommen.";
        break;
      case "KEEP_CONTROL":
        explanation = "Die Variante liegt um " + round(Math.abs(effect)) + " UNTER der Kontrolle " +
          "(95-%-Intervall [" + round(interval.lower) + ", " + round(interval.upper) + "]). " +
          "Die Kontrolle bleibt.";
        break;
      case "NEGLIGIBLE":
        explanation = "Der Unterschied von " + round(effect) + " ist belastbar, aber kleiner als die " +
          "vorab festgelegte Relevanzschwelle von " + experiment.minimumEffect + ". Nichts aendert sich.";
        break;
      default:
        explanation = "Kein Unterschied nachweisbar: das 95-%-Intervall [" + round(interval.lower) +
          ", " + round(interval.upper) + "] enthaelt die Null. Das ist ein gueltiges Ergebnis, " +
          "kein gescheitertes Experiment.";
    }

    var result = {
      decided: !options.peek,
      decision: decision,
      effect: effect,
      confidenceInterval: [interval.lower, interval.upper],
      significant: significant,
      relevant: relevant,
      counts: { control: c.length, variant: v.length },
      degreesOfFreedom: interval.degreesOfFreedom,
      explanation: options.peek ? "VORLAEUFIG (kein Entscheid): " + explanation : explanation
    };

    if (!options.peek) {
      experiment.state = "DECIDED";
      experiment.decision = result;
    }
    return result;
  }

  function round(x) { return Math.round(x * 1000) / 1000; }

  /** Ein Experiment, das zu lange laeuft, wird beendet — nicht vergessen. */
  function checkExpiry(experiment, nowIso) {
    if (!experiment.declaredAt) return { expired: false };
    var days = (Date.parse(nowIso || new Date().toISOString()) - Date.parse(experiment.declaredAt)) /
               (24 * 3600 * 1000);
    if (days <= experiment.maxDurationDays) return { expired: false, days: Math.round(days) };
    return {
      expired: true, days: Math.round(days),
      reason: "Das Experiment laeuft seit " + Math.round(days) + " Tagen (Grenze " +
        experiment.maxDurationDays + "). Es erreicht die geplante Stichprobe nicht und wird beendet."
    };
  }

  var api = {
    STATES: STATES,
    TESTABLE_VARIABLES: TESTABLE_VARIABLES,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    declare: declare,
    record: record,
    evaluate: evaluate,
    checkExpiry: checkExpiry
  };

  if (isNode) module.exports = api;
  else global.VUSocialExperiments = api;
})(typeof window !== "undefined" ? window : globalThis);
