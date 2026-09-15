/* =========================================================================
   VISION UNIVERSE SOCIAL — strategy.js
   CONTENT STRATEGY ENGINE (§7) UND EXPLORATION/EXPLOITATION (§22)

   Die Engine beantwortet nicht "worueber posten wir heute", sondern:

     Warum jetzt? Fuer wen? Auf welcher Plattform? Welches Format?
     Welche Hook-Form? Welche Tiefe? Welcher Zeitpunkt?
     Einzelbeitrag oder Serie? Zeitkritisch oder Evergreen?

   DER WICHTIGSTE MECHANISMUS: DIE ENGINE DARF NICHT NUR KOPIEREN

   Eine Auswahl, die immer das Beste von gestern nimmt, hoert auf zu
   lernen: sie sammelt nur noch Belege fuer das, was sie ohnehin waehlt.
   Der Fachbegriff ist Exploitation-Falle, der Alltagsname
   Betriebsblindheit.

   Deshalb die getrennte Entscheidung:

     ERST   wird gewuerfelt, ob dieser Beitrag eine Erkundung ist
     DANN   wird innerhalb dieser Entscheidung gewaehlt

   Nicht umgekehrt. Wer zuerst den Besten waehlt und dann "manchmal einen
   anderen nimmt", erkundet nicht — er weicht ab.

   DER WUERFEL IST DETERMINISTISCH (§40)

   Er zieht seinen Seed aus der Gelegenheit. Derselbe Lauf mit denselben
   Daten trifft dieselbe Entscheidung — sonst waere ein Ergebnis nicht
   reproduzierbar und ein Fehler nicht nachvollziehbar.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;

  /* Welcher Archetyp zu welcher Art Anlass passt. Das ist Startwissen,
     keine Wahrheit: die Learning Engine darf die Gewichte bewegen (§21),
     die Zuordnung selbst bleibt menschliche Entscheidung. */
  var ARCHETYPE_FIT = {
    BREAKING_MARKET_INSIGHT: { timeSensitivity: ["BREAKING"], needsNumber: true,  depth: "shallow" },
    EXPLAIN_THE_MOVE:        { timeSensitivity: ["BREAKING", "TIMELY"], needsNumber: true, depth: "medium" },
    FUTURE_TECHNOLOGY:       { timeSensitivity: ["TIMELY", "EVERGREEN"], needsNumber: false, depth: "medium" },
    STOCK_STORY:             { timeSensitivity: ["TIMELY", "EVERGREEN"], needsNumber: true,  depth: "deep" },
    DATA_STORY:              { timeSensitivity: ["TIMELY"], needsNumber: true,  depth: "medium" },
    MYTH_VS_REALITY:         { timeSensitivity: ["EVERGREEN"], needsNumber: true,  depth: "medium" },
    OPPORTUNITY_RISK:        { timeSensitivity: ["TIMELY"], needsNumber: true,  depth: "deep" },
    EDUCATIONAL:             { timeSensitivity: ["EVERGREEN"], needsNumber: false, depth: "medium" },
    MARKET_CONTEXT:          { timeSensitivity: ["TIMELY"], needsNumber: true,  depth: "medium" },
    CONTRARIAN_INSIGHT:      { timeSensitivity: ["TIMELY"], needsNumber: true,  depth: "deep" },
    VISUAL_DATA_STORY:       { timeSensitivity: ["TIMELY", "EVERGREEN"], needsNumber: true, depth: "shallow" },
    COMPANY_DEEP_DIVE:       { timeSensitivity: ["EVERGREEN"], needsNumber: true,  depth: "deep" },
    WEEKLY_THEME:            { timeSensitivity: ["EVERGREEN"], needsNumber: false, depth: "medium" },
    TREND_EXPLAINER:         { timeSensitivity: ["TIMELY"], needsNumber: false, depth: "medium" }
  };

  var DEFAULT_PARAMETERS = {
    version: "1.0.0",
    /* §22: 70–90 % bewaehrt, 10–30 % Erkundung. Der Startwert liegt bewusst
       am oberen Rand der Erkundung: am Anfang weiss das System am wenigsten,
       und der Bestand, den es schuetzen muesste, ist am kleinsten. */
    explorationRate: 0.25,
    /* Untergrenze: auch ein gut eingelaufenes System erkundet weiter.
       Ohne sie laeuft die Rate gegen 0, und das Lernen hoert auf. */
    minExplorationRate: 0.10,
    maxExplorationRate: 0.30,
    /* Mindeststichprobe, ab der ein Archetyp als "bewaehrt" gilt. Darunter
       ist er ein Kandidat fuer Erkundung, kein Favorit. */
    minimumSampleForExploit: 5,
    /* Bevorzugte Zeitfenster je Plattform, wenn keine eigenen Daten
       vorliegen. Startwerte — die Learning Engine ersetzt sie durch
       gemessene. */
    defaultWindows: {
      instagram: [{ hour: 7, weight: 0.8 }, { hour: 12, weight: 0.7 }, { hour: 18, weight: 1.0 }],
      linkedin:  [{ hour: 7, weight: 1.0 }, { hour: 11, weight: 0.8 }, { hour: 16, weight: 0.6 }]
    }
  };

  /* ------------------------------------------------------------------ */
  /* Exploration oder Exploitation                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Der Wuerfel. Deterministisch aus der Gelegenheit — dieselbe
   * Gelegenheit fuehrt in jedem Lauf zur selben Entscheidung.
   */
  function decideMode(opportunityId, parameters, options) {
    options = options || {};
    var rate = Math.max(parameters.minExplorationRate,
               Math.min(parameters.maxExplorationRate, parameters.explorationRate));
    var rand = Hash.mulberry32(Hash.seedFromString(String(opportunityId) + "|" + (options.salt || "mode")));
    var draw = rand();
    var explore = draw < rate;
    return {
      mode: explore ? "EXPLORE" : "EXPLOIT",
      explorationRate: rate,
      draw: Math.round(draw * 1000) / 1000,
      reason: explore
        ? "Erkundung (Ziehung " + Math.round(draw * 100) + " < Rate " + Math.round(rate * 100) + " %). " +
          "Ein Teil der Beitraege muss bewusst anders sein, sonst lernt das System nur noch, " +
          "was es ohnehin glaubt."
        : "Bewaehrte Wahl (Ziehung " + Math.round(draw * 100) + " >= Rate " + Math.round(rate * 100) + " %)."
    };
  }

  /* ------------------------------------------------------------------ */
  /* Auswahl                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Waehlt einen Archetyp.
   *
   * @param opportunity  { opportunityId, timeSensitivity, hasNumbers, entities }
   * @param knowledge    { archetype: { mean, sampleSize } }  aus der Learning Engine
   * @param recentUsage  { archetype: count }  aus dem Gedaechtnis
   */
  function selectArchetype(opportunity, knowledge, recentUsage, parameters, mode) {
    parameters = Object.assign({}, DEFAULT_PARAMETERS, parameters || {});
    knowledge = knowledge || {};
    recentUsage = recentUsage || {};

    /* 1. Harte Eignung: was passt ueberhaupt zum Anlass? */
    var sensitivity = opportunity.timeSensitivity || "TIMELY";
    var eligible = Schema.CONTENT_ARCHETYPES.filter(function (a) {
      var fit = ARCHETYPE_FIT[a];
      if (!fit) return false;
      if (fit.timeSensitivity.indexOf(sensitivity) === -1) return false;
      /* Ein Archetyp, der Zahlen braucht, ohne Zahlen im Anlass, erzeugt
         entweder einen leeren Beitrag oder eine erfundene Zahl (§27). */
      if (fit.needsNumber && !opportunity.hasNumbers) return false;
      return true;
    });

    if (eligible.length === 0) {
      return {
        archetype: null,
        reason: "Kein Archetyp passt zu Dringlichkeit '" + sensitivity + "'" +
                (opportunity.hasNumbers ? "" : " ohne belegte Zahlen") + ".",
        candidates: []
      };
    }

    var candidates = eligible.map(function (a) {
      var k = knowledge[a] || {};
      var n = Number(k.sampleSize) || 0;
      var proven = n >= parameters.minimumSampleForExploit;
      return {
        archetype: a,
        mean: proven ? Number(k.mean) : null,
        sampleSize: n,
        proven: proven,
        recentUses: recentUsage[a] || 0
      };
    });

    var chosen;
    if (mode === "EXPLORE") {
      /* Erkundung waehlt, worueber am wenigsten bekannt ist — nicht
         zufaellig. Zufall waere billiger und lernt langsamer. */
      chosen = candidates.slice().sort(function (a, b) {
        if (a.sampleSize !== b.sampleSize) return a.sampleSize - b.sampleSize;
        return a.recentUses - b.recentUses;
      })[0];
      chosen.selectionReason = "Erkundung: " + chosen.archetype + " hat mit n=" + chosen.sampleSize +
        " die duennste Datenlage unter den passenden Formaten.";
    } else {
      var proven = candidates.filter(function (c) { return c.proven && c.mean !== null; });
      if (proven.length === 0) {
        /* Nichts ist bewaehrt. Dann ist auch die "bewaehrte" Wahl eine
           Erkundung — und das wird gesagt, nicht kaschiert. */
        chosen = candidates.slice().sort(function (a, b) { return a.recentUses - b.recentUses; })[0];
        chosen.selectionReason = "Kein passendes Format hat bislang genug Daten (ab n=" +
          parameters.minimumSampleForExploit + "). Gewaehlt wurde das zuletzt am seltensten genutzte.";
      } else {
        chosen = proven.slice().sort(function (a, b) {
          if (b.mean !== a.mean) return b.mean - a.mean;
          return a.recentUses - b.recentUses;
        })[0];
        chosen.selectionReason = chosen.archetype + " liegt bei n=" + chosen.sampleSize +
          " vergleichbaren Beitraegen im Mittel bei " + Math.round(chosen.mean * 100) + " % der Zielleistung.";
      }
    }

    return {
      archetype: chosen.archetype,
      depth: ARCHETYPE_FIT[chosen.archetype].depth,
      reason: chosen.selectionReason,
      candidates: candidates
    };
  }

  /**
   * Waehlt den Zeitpunkt.
   *
   * Gemessene Fenster schlagen Standardfenster — aber nur ab einer
   * Mindeststichprobe. Ein "bestes Zeitfenster" aus drei Beitraegen ist
   * ein Zufall mit Uhrzeit.
   */
  function selectTiming(platform, knowledge, parameters, options) {
    parameters = Object.assign({}, DEFAULT_PARAMETERS, parameters || {});
    options = options || {};
    var minSample = parameters.minimumSampleForExploit;

    var measured = (knowledge && knowledge.hourly) || null;
    var windows;
    var source;

    if (measured) {
      var usable = Object.keys(measured)
        .map(function (h) { return { hour: Number(h), mean: measured[h].mean, sampleSize: measured[h].sampleSize }; })
        .filter(function (w) { return Number.isFinite(w.hour) && w.sampleSize >= minSample; });
      if (usable.length > 0) {
        windows = usable.map(function (w) { return { hour: w.hour, weight: w.mean, sampleSize: w.sampleSize }; });
        source = "gemessen";
      }
    }
    if (!windows) {
      windows = (parameters.defaultWindows[platform] || parameters.defaultWindows.instagram || [])
        .map(function (w) { return { hour: w.hour, weight: w.weight, sampleSize: 0 }; });
      source = "Startwert";
    }
    if (windows.length === 0) {
      return { hour: null, reason: "Kein Zeitfenster hinterlegt fuer " + platform + ".", source: null };
    }

    /* Zeitkritische Beitraege gehen sofort — ein optimales Fenster in sechs
       Stunden ist bei "Breaking" kein Vorteil, sondern ein verpasster Anlass. */
    if (options.timeSensitivity === "BREAKING") {
      return {
        hour: options.currentHour === undefined ? null : options.currentHour,
        reason: "Zeitkritischer Anlass: die Veroeffentlichung wartet auf kein Zeitfenster.",
        source: "Dringlichkeit"
      };
    }

    var best = windows.slice().sort(function (a, b) { return b.weight - a.weight; })[0];
    return {
      hour: best.hour,
      reason: "Zeitfenster " + best.hour + ":00 (" + source +
        (best.sampleSize ? ", n=" + best.sampleSize : "") + ").",
      source: source,
      windows: windows
    };
  }

  /**
   * Die vollstaendige Strategieentscheidung fuer eine Gelegenheit.
   * Sie gibt NICHT nur das Ergebnis zurueck, sondern jede Teilbegruendung —
   * das ist die Grundlage der Erklaerung im Command Center (§32).
   */
  function decide(opportunity, context, options) {
    options = options || {};
    var parameters = Object.assign({}, DEFAULT_PARAMETERS, options.parameters || {});
    context = context || {};

    var mode = decideMode(opportunity.opportunityId, parameters, options);
    var archetype = selectArchetype(opportunity, context.archetypeKnowledge,
                                    context.recentArchetypeUsage, parameters, mode.mode);
    var platform = opportunity.platform || context.defaultPlatform || "instagram";
    var timing = selectTiming(platform, context.timingKnowledge, parameters, {
      timeSensitivity: opportunity.timeSensitivity,
      currentHour: options.currentHour
    });

    return {
      opportunityId: opportunity.opportunityId,
      mode: mode.mode,
      modeReason: mode.reason,
      explorationRate: mode.explorationRate,
      platform: platform,
      archetype: archetype.archetype,
      depth: archetype.depth || null,
      archetypeReason: archetype.reason,
      archetypeCandidates: archetype.candidates,
      timingHour: timing.hour,
      timingReason: timing.reason,
      timeSensitivity: opportunity.timeSensitivity || "TIMELY",
      parametersVersion: parameters.version,
      /* Eine Entscheidung ohne Archetyp ist keine Entscheidung. Sie wird
         als solche gemeldet und nicht mit einem Standardwert kaschiert. */
      decidable: archetype.archetype !== null,
      explanation: archetype.archetype === null
        ? "Keine Strategie: " + archetype.reason
        : [mode.reason, archetype.reason, timing.reason].join(" ")
    };
  }

  var api = {
    ARCHETYPE_FIT: ARCHETYPE_FIT,
    DEFAULT_PARAMETERS: DEFAULT_PARAMETERS,
    decideMode: decideMode,
    selectArchetype: selectArchetype,
    selectTiming: selectTiming,
    decide: decide
  };

  if (isNode) module.exports = api;
  else global.VUSocialStrategy = api;
})(typeof window !== "undefined" ? window : globalThis);
