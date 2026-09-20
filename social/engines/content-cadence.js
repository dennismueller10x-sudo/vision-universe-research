/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-cadence.js

   WIE OFT EIN BEITRAG ENTSTEHEN DARF

   -------------------------------------------------------------------------
   DREI FREQUENZEN, DIE NICHT DIESELBE SIND
   -------------------------------------------------------------------------

     SCHEDULER FREQUENCY    Wie oft geprueft wird.
                            Steht im Zeitplan des Workflows.
                            Darf hoch sein: Pruefen ist billig.

     CONTENT CREATION       Wie oft ein Kandidat entsteht.
     FREQUENCY              Steht hier.

     PUBLISHING FREQUENCY   Wie oft ein Beitrag oeffentlich wird.
                            Steht in cadence.json unter publishing und
                            bleibt unveraendert. Dazwischen steht der
                            Owner.

   Diese drei wurden verwechselt, und die Verwechslung war nicht
   theoretisch: eine harte 24 stand als `minHoursBetweenCandidates` im
   Code der Orchestrator-Engine, waehrend in der Konfiguration eine 20
   fuer Beitraege stand. Zwei Zahlen fuer zwei verschiedene Fragen, von
   denen nur eine einen Namen hatte - und die ohne Namen war die, die
   den Betrieb bestimmte.

   Aus haeufigerem Pruefen folgt kein haeufigeres Senden. Wer das
   koppelt, leitet eine Posting-Quote aus einer Cron-Zeile ab.

   -------------------------------------------------------------------------
   TAGESABSICHT IST KEINE QUOTE
   -------------------------------------------------------------------------

     0 Beitraege   begruendete Ausnahme
     1 Beitrag     normale Absicht
     2 Beitraege   zulaessig, wenn zwei eigenstaendige starke
                   Gelegenheiten bestehen

   Diese Engine erzeugt NIE Bedarf. Sie beantwortet nur: DARF jetzt
   einer entstehen? Ob einer entstehen SOLL, entscheidet die Qualitaet
   der Gelegenheit - und ein schwacher Beitrag, der ein Tagesziel
   erfuellt, ist schlechter als keiner.

   Deshalb gibt `dailyIntentMin` hier kein Recht und keinen Zwang. Es
   steht in der Antwort als ABSICHT, damit ein Bericht sagen kann "heute
   noch keiner, und das war die Absicht" statt "heute keiner, warum
   auch".

   -------------------------------------------------------------------------
   WAS DIESE ENGINE NICHT TUT
   -------------------------------------------------------------------------

   Sie veroeffentlicht nichts, sie gibt nichts frei, und sie ruehrt
   keinen Autopublish-Schalter an. Sie rechnet auch die Publishing-
   Grenzen nicht nach: die pruefen frequenzbefund() in
   make-publish-candidate.mjs, und zwei Rechnungen fuer dieselbe Frage
   gehen auseinander.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Die drei Ebenen, benannt. Ein Test haelt fest, dass sie getrennt
     bleiben. */
  var EBENEN = {
    SCHEDULER: "SCHEDULER_FREQUENCY",
    CREATION: "CONTENT_CREATION_FREQUENCY",
    PUBLISHING: "PUBLISHING_FREQUENCY"
  };

  /* -------------------------------------------------------------------
     DIE GRUENDE, AUS DENEN HEUTE KEINER ENTSTEHT

     Jeder ist eine eigene Aussage. Sie zu einem "NO_ACTION"
     zusammenzuziehen hiesse, dem Owner die Frage "warum" mit "eben
     nicht" zu beantworten.
     ------------------------------------------------------------------- */
  var GRUND = {
    ACTIVE_APPROVAL_QUEUE_NOT_EMPTY: "ACTIVE_APPROVAL_QUEUE_NOT_EMPTY",
    CREATIVE_JOB_IN_FLIGHT:          "CREATIVE_JOB_IN_FLIGHT",
    DAILY_CONTENT_CAP_REACHED:       "DAILY_CONTENT_CAP_REACHED",
    MINIMUM_SPACING_NOT_REACHED:     "MINIMUM_SPACING_NOT_REACHED",
    NO_OPPORTUNITY_PASSED_QUALITY:   "NO_OPPORTUNITY_PASSED_QUALITY",
    INSUFFICIENT_EVIDENCE:           "INSUFFICIENT_EVIDENCE",
    PORTFOLIO_SATURATION:            "PORTFOLIO_SATURATION",
    CONTENT_REPETITION:              "CONTENT_REPETITION",
    OWNER_HELD_STATE:                "OWNER_HELD_STATE",
    OPERATIONAL_BLOCKER:             "OPERATIONAL_BLOCKER"
  };

  /* -------------------------------------------------------------------
     UND DIE, DIE ALLEIN NICHT GENUEGEN

     Ein fehlendes Marktsignal ist kein leerer Content-Tag. Vision
     Universe hat bewusst ein breites Content Universe; dass heute
     keine Kursbewegung traegt, heisst nur, dass die Suche weitergehen
     muss - nicht, dass sie zu Ende ist.

     Diese Liste steht hier und nicht in einem Kommentar, damit ein
     Test sie halten kann.
     ------------------------------------------------------------------- */
  var NIE_ALLEIN = ["NO_MARKET_SIGNAL", "NO_QUANT_SIGNAL", "NO_BREAKING_NEWS",
    "NO_SINGLE_STOCK_SIGNAL"];

  function zahl(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Der Kalendertag in UTC. Ein Tag ist eine Owner-Groesse, kein Fenster. */
  function tag(iso) {
    var s = String(iso || "");
    return s.length >= 10 ? s.slice(0, 10) : null;
  }

  function stunden(vonIso, bisIso) {
    var a = Date.parse(vonIso), b = Date.parse(bisIso);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return (b - a) / 3600000;
  }

  /** Das Regime aus der Konfiguration - mit benannten Vorgaben. */
  function regime(config) {
    var c = (config && config.contentCreation) || {};
    return {
      ebene: EBENEN.CREATION,
      dailyIntentMin: zahl(c.dailyIntentMin, 1),
      dailyIntentMax: zahl(c.dailyIntentMax, 2),
      minHoursBetweenCandidates: zahl(c.minHoursBetweenCandidates, 5),
      regime: c.regime || "SAFETY_EXPLORATION"
    };
  }

  /**
   * Darf jetzt ein Kandidat entstehen?
   *
   * @param zustand {
   *   now                    Zeitpunkt
   *   candidatesToday        [isoZeitpunkte] heute erzeugte Kandidaten
   *   lastCandidateAt        wann zuletzt einer entstand (iso)
   *   activeApprovalQueue    wie viele auf den Owner warten
   *   openCreativeJobs       wie viele Creative Jobs offen sind
   *   halted / haltReason    Kill Switch
   *   ownerHold              ein Owner-Haltezustand
   * }
   *
   * Gibt IMMER einen Grund zurueck, auch bei "darf". Eine Erlaubnis
   * ohne Begruendung laesst sich spaeter nicht nachvollziehen.
   */
  function entscheide(zustand, config) {
    var z = zustand || {};
    var r = regime(config);
    var now = z.now || new Date().toISOString();
    var heute = tag(now);

    var heuteErzeugt = (z.candidatesToday || []).filter(function (t) {
      return tag(t) === heute;
    }).length;

    var seitLetztem = z.lastCandidateAt ? stunden(z.lastCandidateAt, now) : null;

    /* Die Antwort traegt ihren Zustand mit, auch wenn sie "nein" ist -
       sonst muss der Aufrufer ihn ein zweites Mal ermitteln. */
    var lage = {
      ebene: EBENEN.CREATION,
      tag: heute,
      heuteErzeugt: heuteErzeugt,
      tagesabsicht: { min: r.dailyIntentMin, max: r.dailyIntentMax },
      ordinal: heuteErzeugt + 1,
      abstand: {
        stundenSeitLetztem: seitLetztem === null ? null
          : Math.round(seitLetztem * 10) / 10,
        mindestens: r.minHoursBetweenCandidates,
        erfuellt: seitLetztem === null || seitLetztem >= r.minHoursBetweenCandidates
      },
      warteschlange: zahl(z.activeApprovalQueue, 0),
      offeneCreativeJobs: zahl(z.openCreativeJobs, 0),
      regime: r.regime
    };

    function nein(grund, satz) {
      return {
        darfErzeugen: false, grund: grund, erklaerung: satz,
        lage: lage, naechsteFruehestens: fruehestens(lage, now)
      };
    }

    /* HALT schlaegt alles. */
    if (z.halted) {
      return nein(GRUND.OPERATIONAL_BLOCKER,
        "Angehalten: " + (z.haltReason || "kein Grund vermerkt") + ".");
    }
    if (z.ownerHold) {
      return nein(GRUND.OWNER_HELD_STATE,
        "Ein Owner-Haltezustand steht. Eine Maschine hebt ihn nicht auf.");
    }

    /* -----------------------------------------------------------------
       DIE WARTESCHLANGE IST TEIL DER FREQUENZENTSCHEIDUNG

       Mehr Content darf nicht zu einer Kandidatenflut werden. Wartet
       schon einer auf den Owner, ist der naechste nicht mehr Angebot,
       sondern Stapel - und Stapel abzubauen ist genau die Arbeit, die
       dieser Betrieb dem Owner abnehmen soll.

       Im Startregime ist das konservativ: EIN wartender Kandidat
       genuegt, um die Erzeugung anzuhalten. */
    if (lage.warteschlange > 0) {
      return nein(GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY,
        lage.warteschlange + " Beitrag/Beitraege warten bereits auf deine Freigabe. " +
        "Es entsteht kein weiterer, bevor du entschieden hast.");
    }

    if (lage.offeneCreativeJobs > 0) {
      return nein(GRUND.CREATIVE_JOB_IN_FLIGHT,
        "Ein Creative Job laeuft bereits. Systemweit ist genau einer zugelassen.");
    }

    /* ---------------------------------------------- Die Tagesobergrenze */
    if (heuteErzeugt >= r.dailyIntentMax) {
      return nein(GRUND.DAILY_CONTENT_CAP_REACHED,
        "Heute wurden bereits " + heuteErzeugt + " Beitr" +
        (heuteErzeugt === 1 ? "ag" : "aege") + " vorbereitet. Das ist die " +
        "Obergrenze des aktuellen Startregimes.");
    }

    /* ------------------------------------------------------ Der Abstand */
    if (!lage.abstand.erfuellt) {
      var fehlt = Math.max(0, r.minHoursBetweenCandidates - seitLetztem);
      return nein(GRUND.MINIMUM_SPACING_NOT_REACHED,
        "Der letzte Beitrag entstand vor " + lage.abstand.stundenSeitLetztem +
        " Stunden. Der Mindestabstand ist " + r.minHoursBetweenCandidates +
        " Stunden — noch " + (Math.round(fehlt * 10) / 10) + " Stunden.");
    }

    /* -----------------------------------------------------------------
       ERLAUBT - UND AUSDRUECKLICH KEIN AUFTRAG

       `darfErzeugen` heisst: die Frequenzregeln stehen nicht im Weg.
       Ob wirklich einer entsteht, entscheiden Evidenz, Audience Fit,
       Portfolio und die Qualitaetstore. Diese Engine kennt sie nicht
       und soll sie nicht kennen. */
    return {
      darfErzeugen: true,
      grund: null,
      erklaerung: heuteErzeugt === 0
        ? "Heute noch kein Beitrag vorbereitet. Die Absicht ist " +
          r.dailyIntentMin + " pro Tag — sie ist eine Absicht und keine Quote."
        : "Heute wurde bereits " + heuteErzeugt + " Beitrag vorbereitet. Ein " +
          "zweiter entsteht nur, wenn eine eigenstaendige Gelegenheit die " +
          "Qualitaets- und Portfolio-Tore besteht.",
      /* Der zweite Beitrag des Tages ist eine eigene Frage - siehe
         zweiterZulaessig(). Hier steht nur, dass die Uhr ihn zulaesst. */
      zweiterDesTages: heuteErzeugt >= 1,
      lage: lage,
      naechsteFruehestens: null
    };
  }

  /** Wann die Frequenzregeln den naechsten fruehestens zulassen. */
  function fruehestens(lage, now) {
    if (lage.heuteErzeugt >= lage.tagesabsicht.max) {
      /* Morgen. Der naechste Kalendertag beginnt um Mitternacht UTC. */
      var d = new Date(Date.parse(now));
      d.setUTCHours(24, 0, 0, 0);
      return d.toISOString();
    }
    if (!lage.abstand.erfuellt && lage.abstand.stundenSeitLetztem !== null) {
      var fehlt = lage.abstand.mindestens - lage.abstand.stundenSeitLetztem;
      return new Date(Date.parse(now) + fehlt * 3600000).toISOString();
    }
    /* Haengt an einer Owner-Entscheidung oder einem Job, nicht an der
       Uhr. Einen Zeitpunkt zu nennen waere eine Zusage, die niemand
       einloest. */
    return null;
  }

  /**
   * Darf der ZWEITE Beitrag des Tages entstehen?
   *
   * Getrennt von entscheide(), weil hier etwas anderes gefragt wird:
   * nicht "erlaubt die Uhr es", sondern "traegt die Gelegenheit
   * eigenstaendig". Eine Quote aufzufuellen ist ausdruecklich kein
   * Grund.
   *
   * @param pruefung {
   *   eigenstaendigeGelegenheit  bool
   *   wiederholtErsten           bool
   *   themenvielfaltAusreichend  bool
   *   familieGesaettigt          bool
   *   evidenzAusreichend         bool
   *   audienceFit                bool
   *   qualitaetstoreBestanden    bool
   *   creativeBudgetFrei         bool
   *   abstandErfuellt            bool
   * }
   *
   * Jede fehlende Angabe blockiert. `undefined` ist nicht `true`:
   * eine Pruefung, die nicht stattgefunden hat, ist keine bestandene.
   */
  function zweiterZulaessig(pruefung) {
    var p = pruefung || {};
    var offen = [], gegen = [];

    function fordere(feld, grund, satz) {
      if (p[feld] === undefined || p[feld] === null) { offen.push(feld); return; }
      if (p[feld] !== true) gegen.push({ feld: feld, grund: grund, satz: satz });
    }
    function verbiete(feld, grund, satz) {
      if (p[feld] === undefined || p[feld] === null) { offen.push(feld); return; }
      if (p[feld] === true) gegen.push({ feld: feld, grund: grund, satz: satz });
    }

    fordere("eigenstaendigeGelegenheit", GRUND.NO_OPPORTUNITY_PASSED_QUALITY,
      "Keine eigenstaendige zweite Gelegenheit.");
    verbiete("wiederholtErsten", GRUND.CONTENT_REPETITION,
      "Die Geschichte wiederholte den ersten Beitrag.");
    fordere("themenvielfaltAusreichend", GRUND.PORTFOLIO_SATURATION,
      "Die Themenvielfalt reicht fuer einen zweiten Beitrag nicht.");
    verbiete("familieGesaettigt", GRUND.PORTFOLIO_SATURATION,
      "Die Content Family ist fuer heute gesaettigt.");
    fordere("evidenzAusreichend", GRUND.INSUFFICIENT_EVIDENCE,
      "Die Evidenz traegt die zweite Geschichte nicht.");
    fordere("audienceFit", GRUND.NO_OPPORTUNITY_PASSED_QUALITY,
      "Der Beitrag passt nicht zum Publikum.");
    fordere("qualitaetstoreBestanden", GRUND.NO_OPPORTUNITY_PASSED_QUALITY,
      "Ein Qualitaetstor ist nicht bestanden.");
    fordere("creativeBudgetFrei", GRUND.CREATIVE_JOB_IN_FLIGHT,
      "Kein freies Creative-Budget.");
    fordere("abstandErfuellt", GRUND.MINIMUM_SPACING_NOT_REACHED,
      "Der Mindestabstand ist nicht erreicht.");

    if (offen.length) {
      return {
        zulaessig: false,
        grund: GRUND.NO_OPPORTUNITY_PASSED_QUALITY,
        /* Ungeprueft ist nicht bestanden. Der Unterschied steht in der
           Antwort, damit ihn niemand spaeter zu "nicht bestanden"
           glaettet - das waere eine Aussage ueber die Gelegenheit,
           und es gab keine. */
        ungeprueft: offen,
        gegen: gegen.map(function (g) { return g.grund; }),
        erklaerung: "Fuer einen zweiten Beitrag wurde nicht alles geprueft: " +
          offen.join(", ") + "."
      };
    }
    if (gegen.length) {
      return {
        zulaessig: false, grund: gegen[0].grund, ungeprueft: [],
        gegen: gegen.map(function (g) { return g.grund; }),
        erklaerung: gegen.map(function (g) { return g.satz; }).join(" ")
      };
    }
    return {
      zulaessig: true, grund: null, ungeprueft: [], gegen: [],
      erklaerung: "Eine eigenstaendige zweite Gelegenheit besteht und alle " +
        "Tore sind bestanden. Es wird keine Quote aufgefuellt."
    };
  }

  /**
   * Ist dieser Grund als ALLEINIGE Tagesentscheidung zulaessig?
   *
   * Der Fall, den das verhindert: die Opportunity Engine findet kein
   * Kursereignis, meldet NO_MARKET_SIGNAL, und der Tag ist vorbei -
   * obwohl vierzehn weitere Content Families nie gefragt wurden.
   */
  function grundZulaessig(grund) {
    var g = String(grund || "");
    if (NIE_ALLEIN.indexOf(g) !== -1) {
      return {
        zulaessig: false,
        erklaerung: g + " ist kein ausreichender alleiniger Grund fuer einen " +
          "leeren Content-Tag. Vision Universe hat ein breites Content " +
          "Universe; ein fehlendes Marktsignal verlangt, weitere Familien zu " +
          "pruefen, und beendet den Tag nicht."
      };
    }
    var bekannt = Object.keys(GRUND).indexOf(g) !== -1;
    return {
      zulaessig: bekannt,
      erklaerung: bekannt ? null
        : "Unbekannter Grund: " + g + ". Eine Tagesentscheidung braucht einen " +
          "benannten Grund, keinen erfundenen."
    };
  }

  /**
   * Wo Erzeugungsabsicht und Veroeffentlichungsdach auseinandergehen.
   *
   * -------------------------------------------------------------------
   * WARUM DAS HIER STEHT UND NICHT AUFGELOEST WIRD
   * -------------------------------------------------------------------
   *
   * Die Tagesabsicht (bis zu 2 Kandidaten) und die Publishing-Grenzen
   * (4 Beitraege in 7 Tagen) sind zwei Owner-Entscheidungen zu zwei
   * verschiedenen Fragen. Sie widersprechen sich nicht - zwischen
   * ihnen steht der Owner, der nicht jeden Kandidaten freigeben muss.
   *
   * Aber sie SPANNEN: wer taeglich zwei vorbereitet und woechentlich
   * vier senden darf, hat rechnerisch zehn Kandidaten zu viel. Das
   * faellt im Betrieb nicht als Fehler auf, sondern als eine Reihe von
   * Ablehnungen, die wie Qualitaetsurteile aussehen und keine sind.
   *
   * Diese Funktion LOEST NICHTS. Sie rechnet keine der beiden Zahlen
   * klein und aendert keine Konfiguration. Sie benennt die Spannung,
   * damit sie eine Owner-Entscheidung bleibt und nicht als stille
   * Klemme im Betrieb erscheint.
   */
  function spannung(config) {
    var c = config || {};
    var erzeugung = zahl((c.contentCreation || {}).dailyIntentMax, 2);
    var dachWoche = zahl(c.maxPostsPer7Days,
      zahl((c.publishing || {}).maxPostsPer7Days, null));

    if (dachWoche === null) {
      return {
        gemessen: false,
        erklaerung: "Kein Publishing-Dach in der Konfiguration. Die Spannung " +
          "laesst sich nicht messen und wird nicht geschaetzt."
      };
    }

    var erzeugungWoche = erzeugung * 7;
    var gespannt = erzeugungWoche > dachWoche;

    return {
      gemessen: true,
      gespannt: gespannt,
      erzeugungProWoche: erzeugungWoche,
      publishingDachProWoche: dachWoche,
      ueberhang: gespannt ? erzeugungWoche - dachWoche : 0,
      erklaerung: gespannt
        ? "Die Erzeugung laesst bis zu " + erzeugungWoche + " Kandidaten je Woche " +
          "zu, das Publishing-Dach " + dachWoche + ". Das ist kein Fehler — " +
          "zwischen beiden steht der Owner, und nicht jeder Kandidat muss " +
          "freigegeben werden. Es heisst aber, dass die Publishing-Grenze " +
          "frueher greift als die Erzeugungsgrenze, und eine dort abgewiesene " +
          "Freigabe ist eine Frequenzentscheidung und kein Qualitaetsurteil."
        : "Erzeugung (" + erzeugungWoche + "/Woche) und Publishing-Dach (" +
          dachWoche + "/Woche) stehen nicht im Widerspruch."
    };
  }

  var api = {
    EBENEN: EBENEN,
    spannung: spannung,
    GRUND: GRUND,
    NIE_ALLEIN: NIE_ALLEIN,
    regime: regime,
    entscheide: entscheide,
    zweiterZulaessig: zweiterZulaessig,
    grundZulaessig: grundZulaessig
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentCadence = api;
})(typeof window !== "undefined" ? window : globalThis);
