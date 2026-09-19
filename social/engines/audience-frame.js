/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/audience-frame.js

   ZWISCHEN GELEGENHEIT UND TEXT GEHOERT EINE FRAGE

   -------------------------------------------------------------------------
   WARUM DIESE STUFE FEHLTE
   -------------------------------------------------------------------------

   Bisher ging es direkt von der Gelegenheit ins Schreiben. Der Brief
   trug Evidenz, Bogen und Grenzen - und keine einzige Zeile darueber,
   FUER WEN das geschrieben wird.

   Das Ergebnis war ein Hook, der jedes Tor bestand und drei Dinge
   voraussetzte, die ein breites Publikum nicht hat. Der Agent hat
   nichts falsch gemacht: er hat beantwortet, was gefragt war.

   Die Frage fehlte.

   -------------------------------------------------------------------------
   BOOTSTRAP IST EINE EHRLICHE ANTWORT
   -------------------------------------------------------------------------

   Es gibt noch keine Publikumsdaten - kein veroeffentlichter Beitrag,
   keine Messung, keine Segmentierung. Ein Rahmen, der so taete, als
   gaebe es sie, waere erfundene Zielgruppenforschung.

   Deshalb traegt jeder Rahmen sein `basis`-Feld: BOOTSTRAP heisst, er
   stammt aus der Struktur des Themas und aus den Vorgaben des Owners,
   nicht aus Messung. Wenn Messung dazukommt, aendert sich der Wert -
   und man sieht, dass er sich geaendert hat.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var BASIS = {
    BOOTSTRAP: "BOOTSTRAP",   /* aus Struktur und Owner-Vorgabe */
    MEASURED: "MEASURED"      /* aus realen Publikumsdaten */
  };

  /* -------------------------------------------------------------------
     WER GEMEINT IST

     Der Owner hat es vorgegeben: ein breites deutschsprachiges
     Investment-Publikum, vom interessierten Einsteiger bis zum
     erfahrenen Anleger. NICHT: Quant Trader, Analysten, Leute die
     interne Scores kennen.

     Das ist eine Owner-Vorgabe und keine Messung - deshalb steht es
     hier als Konstante und nicht als Ergebnis.
     ------------------------------------------------------------------- */
  var ZIELPUBLIKUM = "Breites deutschsprachiges Investment-Publikum, vom " +
    "interessierten Einsteiger bis zum erfahrenen Anleger.";

  var VORWISSEN = "Grundbegriffe wie Aktie, Kurs, Gewinn und Dividende. " +
    "NICHT vorausgesetzt: Vision-Universe-Kenntnis, Tickersymbole, " +
    "interne Scores, Quant-Methodik.";

  /* Was in der Story erklaert werden DARF, aber nicht im Einstieg
     stehen soll. Die Liste wird hineingereicht, wo eine vorhanden ist -
     sonst gilt diese. */
  var INTERN_NICHT_IM_HOOK = [
    "Technical Opportunity Score", "Setup-Rang", "Perzentil", "z-Score",
    "TREND_STRUCTURE", "VOLATILITY", "MOMENTUM", "ATR", "SMA",
    "methodischer Rang", "Trendwert", "Faktorprämie"
  ];

  /* -------------------------------------------------------------------
     DIE MENSCHLICHE FRAGE JE FAMILIE

     Nicht die Frage, die die Daten beantworten - die, mit der jemand
     ueberhaupt erst hinsieht. Sie ist bewusst schlicht: ein Einstieg,
     der klug klingen will, verliert den, der noch nicht weiss, ob ihn
     das angeht.
     ------------------------------------------------------------------- */
  var KERNFRAGE = {
    RANKING:              "Welche Unternehmen erfuellen das gerade — und was haben sie gemeinsam?",
    COMPARISON:           "Was unterscheidet die beiden wirklich?",
    MEGATREND:            "Wer verdient an dieser Entwicklung tatsaechlich Geld?",
    EDUCATION:            "Was muss ich davon wirklich verstanden haben?",
    EVERGREEN:            "Warum geht das immer wieder schief — und was hilft?",
    MARKET_EXPLAINER:     "Was bedeutet das fuer mein Depot?",
    STOCK_STORY:          "Was ist bei diesem Unternehmen gerade los?",
    ETF_PRODUCT:          "Was steckt da drin — und fuer wen passt das?",
    NEWS_NOW:             "Was ist passiert, und ist das wichtig?",
    EARNINGS:             "Waren die Zahlen gut — gemessen woran?",
    DIVIDEND:             "Wie verlaesslich ist diese Ausschuettung?",
    DATA_STORY:           "Was sagen die Zahlen, das man sonst nicht sieht?",
    MAGAZINE_STORY:       "Was ist die eine Sache, die man daraus mitnimmt?",
    REPORT_STORY:         "Lohnt sich ein genauerer Blick auf dieses Unternehmen?",
    VU_ORIGINAL_RESEARCH: "Was haben wir gefunden, das sonst niemand zeigt?"
  };

  /* Welche Hook-Strategie zu welcher Familie passt. VORSCHLAG, nicht
     Entscheidung: die kanonische Auswahl trifft Vision Universe
     spaeter anhand der Tore. */
  var HOOK_VORSCHLAG = {
    RANKING:              "list_tension",
    COMPARISON:           "contrast",
    MEGATREND:            "who_profits",
    EDUCATION:            "misconception",
    EVERGREEN:            "common_mistake",
    MARKET_EXPLAINER:     "so_what",
    STOCK_STORY:          "value_first",
    ETF_PRODUCT:          "whats_inside",
    NEWS_NOW:             "what_happened",
    EARNINGS:             "beat_or_miss",
    DIVIDEND:             "reliability",
    DATA_STORY:           "hidden_number",
    MAGAZINE_STORY:       "one_takeaway",
    REPORT_STORY:         "worth_a_look",
    VU_ORIGINAL_RESEARCH: "exclusive_finding"
  };

  /* Bildstrategie aus der Form des Themas - nicht aus dem Thema.
     Mehrere Entitaeten verlangen eine Vergleichs- oder Listenform;
     ein Erklaerstueck traegt kein Kursbild. */
  function visualVorschlag(topic) {
    var n = (topic.entities || []).length;
    if (topic.family === "COMPARISON") return "COMPARISON";
    if (topic.family === "RANKING" || n > 3) return "RANKING";
    if (topic.family === "EDUCATION" || topic.family === "EVERGREEN" ||
        topic.family === "MARKET_EXPLAINER") return "CONCEPT";
    if (topic.family === "MEGATREND") return "GENERATIVE";
    if (topic.family === "EARNINGS" || topic.family === "DATA_STORY") return "CHART";
    if (n === 1) return "SCORE";
    return "DATA_CARD";
  }

  /**
   * Der Rahmen zu einem Thema.
   *
   * Erfindet keine Zielgruppenforschung: alles hier kommt entweder aus
   * der Struktur des Themas oder aus einer ausdruecklichen
   * Owner-Vorgabe, und `basis` sagt welches.
   */
  function frame(topic, spec) {
    spec = spec || {};
    var t = topic || {};
    var namen = spec.names || {};

    /* Klarnamen fuer den oeffentlichen Gebrauch. Wo ein Kuerzel
       durchgerutscht ist, wird hier der Name danebengestellt - das
       Audience-Tor beanstandet ihn sonst spaeter im Hook. */
    var oeffentlich = (t.entities || []).map(function (e) {
      return namen[e] || e;
    });

    var kuerzelDrin = (t.entities || []).filter(function (e) {
      return !!namen[e];
    });

    return {
      topicId: t.topicId || null,
      basis: spec.basis || BASIS.BOOTSTRAP,
      targetAudience: spec.targetAudience || ZIELPUBLIKUM,
      assumedKnowledge: spec.assumedKnowledge || VORWISSEN,

      /* Der erste Entwurf setzte hier t.note ein - und schrieb damit
         "Die Datenlage ist frisch (Eine Ausgabe kann mehrere Social
         Stories tragen.)". Eine Notiz ist kein Datum. Wo kein Stand
         vorliegt, steht das da. */
      whyNow: t.asOf
        ? "Stand der Datenlage: " + String(t.asOf).slice(0, 10) + "."
        : (t.timeSensitivity === "TIMELY"
            ? "Als tagesaktuell markiert, aber ohne Datumsangabe in der Quelle - " +
              "die Aktualitaet ist damit nicht belegt."
            : "Kein tagesaktueller Anlass - das Thema traegt auch ohne Ereignis."),

      whyCare: KERNFRAGE[t.family]
        ? "Es beantwortet eine Frage, die sich jemand ohnehin stellt: " +
          KERNFRAGE[t.family]
        : "Kein hinterlegter Publikumsnutzen fuer " + t.family +
          " - das ist eine Luecke, keine Aussage.",

      coreQuestion: KERNFRAGE[t.family] || null,

      publicEntityNames: oeffentlich,
      /* Ausdruecklich benannt, damit der Agent nicht raten muss. */
      internalTermsToExplain: spec.internalTermsToExplain || [],
      internalTermsNotSuitableForHook:
        spec.internalTermsNotSuitableForHook || INTERN_NICHT_IM_HOOK,

      suggestedHookStrategy: HOOK_VORSCHLAG[t.family] || null,
      suggestedVisualStrategy: visualVorschlag(t),

      /* Woertlich: ein Rahmen sagt nichts ueber Wirkung. */
      predictsPerformance: false,

      findings: (oeffentlich.filter(function (e) {
        /* Eine Entitaet, die aussieht wie eine Kennung und zu der kein
           Klarname bekannt ist, wird im Einstieg stolpern. Besser hier
           auffallen als im Hook. */
        return /^[a-z0-9_-]+$/.test(String(e)) || /^[A-Z]{2,5}$/.test(String(e));
      }).map(function (e) {
        return { id: "noPlainName",
          message: "Zu \"" + e + "\" ist kein Klarname bekannt. Im " +
            "oeffentlichen Einstieg braucht es einen - sonst weiss der Leser " +
            "nicht, wovon die Rede ist." };
      })).concat(kuerzelDrin.length
        ? [{ id: "tickerInEntities",
             message: "Das Thema fuehrt " + kuerzelDrin.join(", ") +
               " als Kuerzel, obwohl Klarnamen bekannt sind. Im " +
               "oeffentlichen Einstieg gehoert der Name." }]
        : [])
    };
  }

  /**
   * Darf auf Grundlage dieses Rahmens geschrieben werden?
   *
   * Ein Rahmen ohne Kernfrage ist kein Rahmen - dann weiss der Agent
   * nicht, FUER WEN er schreibt, und genau das war der Ausgangsfehler.
   */
  function ready(f) {
    var fehlt = [];
    if (!f || !f.coreQuestion) fehlt.push("coreQuestion");
    if (!f || !f.targetAudience) fehlt.push("targetAudience");
    if (!f || !f.suggestedHookStrategy) fehlt.push("suggestedHookStrategy");
    return {
      ok: fehlt.length === 0,
      missing: fehlt,
      explanation: fehlt.length === 0
        ? "Der Rahmen traegt: Publikum, Kernfrage und Hook-Richtung stehen."
        : "Ohne " + fehlt.join(", ") + " weiss der Agent nicht, fuer wen er " +
          "schreibt. Genau diese Frage hat vorher gefehlt."
    };
  }

  var api = {
    BASIS: BASIS,
    ZIELPUBLIKUM: ZIELPUBLIKUM,
    VORWISSEN: VORWISSEN,
    KERNFRAGE: KERNFRAGE,
    HOOK_VORSCHLAG: HOOK_VORSCHLAG,
    INTERN_NICHT_IM_HOOK: INTERN_NICHT_IM_HOOK,
    visualVorschlag: visualVorschlag,
    frame: frame,
    ready: ready
  };

  if (isNode) module.exports = api;
  else global.VUSocialAudienceFrame = api;
})(typeof window !== "undefined" ? window : globalThis);
