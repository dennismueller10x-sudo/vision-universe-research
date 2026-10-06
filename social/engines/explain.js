/* =========================================================================
   VISION UNIVERSE SOCIAL — explain.js
   ERKLAERBARKEIT (§32)

   Fuer jede automatische Entscheidung muss eine verstaendliche Erklaerung
   moeglich sein.

   WAS DAS NICHT HEISST

   Keine Score-Wueste im UI. "Trend 80 · Opportunity 81 · Brand 100 ·
   Fatigue 0.31" beantwortet die Frage nicht, die der Owner stellt. Die
   Frage lautet:

       WARUM DIESER BEITRAG?

   und die Antwort ist ein Absatz in ganzen Saetzen.

   DIE ARBEITSTEILUNG

   Jede Engine liefert ihre Teilbegruendung als Satz. Diese Datei setzt
   sie zusammen, in der Reihenfolge, in der ein Mensch sie braucht:

     1. Was ist der Anlass
     2. Warum jetzt
     3. Warum wir
     4. Warum dieses Format
     5. Was dagegen spricht
     6. Was wir daraus gelernt haben

   Punkt 5 steht bewusst NICHT am Ende und nicht im Kleingedruckten. Eine
   Erklaerung, die nur Argumente dafuer sammelt, ist eine Verkaufsseite.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  function sentence(text) {
    if (!text) return null;
    var s = String(text).trim();
    if (!s) return null;
    return /[.!?]$/.test(s) ? s : s + ".";
  }

  /**
   * Die Erklaerung zu einem geplanten oder veroeffentlichten Beitrag.
   *
   * @param input {
   *   opportunity,      Ergebnis von opportunity.score()
   *   trend,            Ergebnis von trend-score.score()
   *   strategy,         Ergebnis von strategy.decide()
   *   fact,             Ergebnis von fact-check.check()
   *   brand,            Ergebnis von brand.check()
   *   fatigue,          Ergebnis von fatigue.check()
   *   visual,           Ergebnis von visual.selectVisual()
   *   autonomy,         Ergebnis von autonomy.effectiveLevel()
   *   killSwitch,       Ergebnis von killSwitch.allows()
   *   learning,         [{ note }] relevante Beobachtungen
   *   package           das Content Package
   * }
   */
  function whyThisPost(input) {
    input = input || {};
    var sections = [];

    /* 1. Anlass. */
    var occasion = [];
    if (input.package && input.package.topic) {
      occasion.push("Thema: " + input.package.topic + ".");
    }
    if (input.trend && input.trend.available && input.trend.drivers && input.trend.drivers.length) {
      occasion.push(sentence(input.trend.drivers[0].reason));
    } else if (input.trend && !input.trend.available) {
      occasion.push("Es liegt kein belastbarer externer Trend vor — der Anlass ist intern.");
    }
    if (occasion.length) sections.push({ id: "occasion", title: "Der Anlass", text: occasion.join(" ") });

    /* 2. Warum jetzt. */
    var timing = [];
    if (input.opportunity && input.opportunity.components) {
      var f = input.opportunity.components.freshness;
      if (f && f.available) timing.push(sentence(f.reason));
    }
    if (input.strategy && input.strategy.timingReason) timing.push(sentence(input.strategy.timingReason));
    if (timing.length) sections.push({ id: "timing", title: "Warum jetzt", text: timing.join(" ") });

    /* 3. Warum wir. */
    var ours = [];
    if (input.opportunity && input.opportunity.components) {
      ["vuSignal", "audienceInterest", "contentGap"].forEach(function (k) {
        var c = input.opportunity.components[k];
        if (c && c.available) ours.push(sentence(c.reason));
      });
    }
    if (ours.length) sections.push({ id: "relevance", title: "Warum Vision Universe", text: ours.join(" ") });

    /* 4. Format. */
    var format = [];
    if (input.strategy) {
      if (input.strategy.archetypeReason) format.push(sentence(input.strategy.archetypeReason));
      if (input.strategy.mode === "EXPLORE") format.push(sentence(input.strategy.modeReason));
    }
    if (input.visual && input.visual.explanation) format.push(sentence(input.visual.explanation));
    if (format.length) sections.push({ id: "format", title: "Warum dieses Format", text: format.join(" ") });

    /* 5. Was dagegen spricht. Immer vorhanden — notfalls als
       ausdrueckliches "nichts gefunden". */
    var against = [];
    if (input.fact && input.fact.state !== "VERIFIED") against.push(sentence(input.fact.explanation));
    if (input.brand && input.brand.warnings && input.brand.warnings.length) {
      against.push(input.brand.warnings.map(function (w) { return w.message; }).join(" "));
    }
    if (input.fatigue && (!input.fatigue.passed || (input.fatigue.warnings || []).length)) {
      against.push(sentence(input.fatigue.explanation));
    }
    if (input.opportunity && input.opportunity.missing && input.opportunity.missing.length) {
      against.push("Ungemessen blieb: " +
        input.opportunity.missing.map(function (m) { return m.label; }).join(", ") + ".");
    }
    sections.push({
      id: "against", title: "Was dagegen spricht",
      text: against.length ? against.join(" ") : "Keine Einwaende aus Faktenpruefung, Marke oder Wiederholung."
    });

    /* 6. Gelerntes. */
    var learned = (input.learning || [])
      .filter(function (o) { return o && o.note; })
      .slice(0, 3)
      .map(function (o) { return sentence(o.note); });
    if (learned.length) sections.push({ id: "learning", title: "Was wir gelernt haben", text: learned.join(" ") });

    /* Die Handlung. */
    var action = [];
    if (input.killSwitch && !input.killSwitch.allowed) {
      action.push("Es wird nichts veroeffentlicht: " + input.killSwitch.reason);
    } else if (input.autonomy) {
      action.push("Autonomiestufe " + input.autonomy.effective + " (" + input.autonomy.info.label + "): " +
        (input.autonomy.effective >= 4
          ? "die Veroeffentlichung laeuft ohne Einzelfreigabe."
          : "die Veroeffentlichung braucht eine Freigabe."));
      if (input.autonomy.capped) action.push(input.autonomy.explanation);
    }
    if (action.length) sections.push({ id: "action", title: "Was jetzt passiert", text: action.join(" ") });

    return {
      sections: sections,
      /* Die Kurzform fuer die Liste — ein Satz, der allein steht. */
      summary: buildSummary(input),
      /* Die Langform als Fliesstext. */
      prose: sections.map(function (s) { return s.text; }).join(" ")
    };
  }

  function buildSummary(input) {
    var parts = [];
    var topic = input.package && input.package.topic;
    var opp = input.opportunity;
    var trend = input.trend;

    if (!topic) return "Kein Thema angegeben.";

    parts.push("\"" + topic + "\"");
    if (trend && trend.available) parts.push("beschleunigt sich aussen");
    if (opp && opp.components && opp.components.vuSignal && opp.components.vuSignal.available) {
      parts.push("und trifft ein eigenes VU-Signal");
    }
    if (opp && opp.components && opp.components.historicalPerformance &&
        opp.components.historicalPerformance.available) {
      parts.push("; vergleichbare Beitraege liefen ueberdurchschnittlich");
    }
    if (input.fatigue && input.fatigue.passed) parts.push("; zuletzt nicht behandelt");
    return parts.join(" ") + ".";
  }

  /**
   * Die Erklaerung zu einem Ergebnis: "warum lief das so?"
   * Dieselbe Haltung, andere Richtung — hier zaehlt, was schwach war.
   */
  function whyThisResult(input) {
    input = input || {};
    var perf = input.performance;
    if (!perf || !perf.available) {
      return {
        summary: "Kein Ergebnis auswertbar.",
        prose: (perf && perf.explanation) || "Es liegen keine ausreichenden Kennzahlen vor."
      };
    }
    var parts = [];
    parts.push(sentence(perf.explanation));
    if (perf.capped) {
      parts.push("Der Deckel ist wichtiger als die Zahl darunter: " + sentence(perf.capped.reason));
    }
    (perf.weakest || []).forEach(function (w) { parts.push(sentence("Schwach: " + w.reason)); });
    if (input.observation && input.observation.note) {
      parts.push("Fuer das Lernen heisst das: " + sentence(input.observation.note));
    }
    return {
      summary: "Performance Score " + perf.score + (perf.capped ? " (gedeckelt)" : "") + ".",
      prose: parts.filter(Boolean).join(" ")
    };
  }

  var api = { whyThisPost: whyThisPost, whyThisResult: whyThisResult, sentence: sentence };

  if (isNode) module.exports = api;
  else global.VUSocialExplain = api;
})(typeof window !== "undefined" ? window : globalThis);
