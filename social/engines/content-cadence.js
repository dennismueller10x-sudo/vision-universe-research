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
    OPERATIONAL_BLOCKER:             "OPERATIONAL_BLOCKER",
    /* -----------------------------------------------------------------
       KEINE FAMILIE TRUG HEUTE EIN THEMA

       Nicht dasselbe wie "kein Thema bestand die Qualitaet": dort gab
       es etwas zu pruefen, hier nicht. Der Unterschied ist der ganze
       Nachweis - wer beides gleich nennt, kann spaeter nicht mehr
       sagen, ob gesucht oder aufgegeben wurde.

       Dieser Grund ist nur dann eine ausreichende Tagesentscheidung,
       wenn die Leiter WIRKLICH jede Stufe gefragt hat. no-post.js
       prueft das; hier steht nur der Name. */
    NO_TOPIC_IN_ANY_FAMILY:          "NO_TOPIC_IN_ANY_FAMILY",

    /* -----------------------------------------------------------------
       WIE VIELE JOBS OFFEN SIND, WEISS GERADE NIEMAND

       Nicht dasselbe wie "keiner ist offen", und der Unterschied ist
       genau der, an dem MAX_OPEN_CREATIVE_JOBS = 1 haengt.

       Die erste Fassung las `zahl(z.openCreativeJobs, 0)`. Ein
       fehlendes Feld, ein `null`, ein nicht lesbares Register - alles
       wurde zu NULL OFFENEN JOBS, und null offene Jobs heisst: bau
       einen neuen. Der Deckel war dann genau in dem Moment offen, in
       dem man am wenigsten wusste.

       Unbekannt haelt an. Das ist keine Vorsicht, sondern die einzige
       Lesart, die nicht behauptet, was niemand gezaehlt hat. */
    CREATIVE_JOB_COUNT_UNKNOWN:      "CREATIVE_JOB_COUNT_UNKNOWN"
  };

  /* -------------------------------------------------------------------
     ZWEI GROESSEN, DIE VERWECHSELT WURDEN

     CONTENT SUPPLY ist bei Vision Universe reichlich: das Content
     Universe traegt fuenfzehn Familien, die Leiter fragt sie in
     Stufen, und die letzte Stufe ist eine Frage, keine Fundstelle.
     Ideen sind nicht knapp.

     PUBLISHING CAPACITY ist beschraenkt, und zwar absichtlich: ein
     offener Creative Job, eine wartende Freigabe, ein Mindestabstand,
     ein Wochendach. Das sind Owner-Entscheidungen.

     Ein leerer Tag aus BESCHRAENKTER KAPAZITAET ist ein Betriebs-
     zustand. Ein leerer Tag aus ANGEBLICH FEHLENDEM ANGEBOT ist ein
     Befund - denn das Angebot ist da; was fehlte, war die Suche.

     Und dazwischen liegt eine dritte Klasse, die weder das eine noch
     das andere ist: es WURDE etwas gefunden, gemessen und fuer zu
     schwach befunden. Das darf einen Tag beenden, und zwar ohne
     schlechtes Gewissen - eine schwache Geschichte zu senden, um eine
     Quote zu fuellen, waere der teurere Fehler.

     Diese drei in zwei zu pressen waere ein Tor, das zu weit gebaut
     ist. Deshalb drei.
     ------------------------------------------------------------------- */
  var KLASSE = {
    KAPAZITAET: "PUBLISHING_CAPACITY",
    QUALITAET:  "CONTENT_QUALITY",
    ANGEBOT:    "CONTENT_SUPPLY"
  };

  /* Ob ein Grund ALLEIN einen Tag beenden darf. Drei Antworten, nicht
     zwei: die mittlere ist die, an der sich "gesucht" von
     "aufgehoert" unterscheidet. */
  var ALLEIN = {
    JA:                "ALLEIN_GENUG",
    NEIN:              "NIE_ALLEIN",
    NUR_NACH_SUCHE:    "NUR_NACH_VOLLSTAENDIGER_SUCHE"
  };

  /* -------------------------------------------------------------------
     EINE TABELLE, EIN EINTRAG JE GRUND

     Die erste Fassung hatte eine Liste NIE_ALLEIN NEBEN der Liste
     GRUND. Zwei Register fuer dieselbe Tatsache - dieselbe Familie
     von Fehlern, die den Creative Slot eine Woche lang blockiert hat,
     weil nur eines von beiden fortgeschrieben wurde.

     Jetzt steht jede Aussage ueber einen Grund an genau einer Stelle,
     und NIE_ALLEIN wird daraus ABGELEITET statt daneben gepflegt.

     Die Tabelle umfasst mehr Namen als GRUND: die Opportunity Engine
     meldet eigene Codes (NO_MARKET_SIGNAL und Verwandte), und die
     Frage "darf das einen Tag beenden" muss auch fuer sie beantwortet
     sein. Ein Grund ohne Eintrag ist ein unbekannter Grund.
     ------------------------------------------------------------------- */
  var GRUND_KLASSE = {
    /* --- Beschraenkte Kapazitaet: benannt, gewollt, allein genug --- */
    ACTIVE_APPROVAL_QUEUE_NOT_EMPTY: { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    CREATIVE_JOB_IN_FLIGHT:          { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    CREATIVE_JOB_COUNT_UNKNOWN:      { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    DAILY_CONTENT_CAP_REACHED:       { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    MINIMUM_SPACING_NOT_REACHED:     { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    OWNER_HELD_STATE:                { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },
    OPERATIONAL_BLOCKER:             { klasse: KLASSE.KAPAZITAET, allein: ALLEIN.JA },

    /* --- Gefunden und gemessen, und es trug nicht --------------------
       Diese Gruende senken keine Schwelle; sie halten eine. */
    NO_OPPORTUNITY_PASSED_QUALITY:   { klasse: KLASSE.QUALITAET, allein: ALLEIN.JA },
    INSUFFICIENT_EVIDENCE:           { klasse: KLASSE.QUALITAET, allein: ALLEIN.JA },
    CONTENT_REPETITION:              { klasse: KLASSE.QUALITAET, allein: ALLEIN.JA },
    PORTFOLIO_SATURATION:            { klasse: KLASSE.QUALITAET, allein: ALLEIN.JA },

    /* --- Behauptungen ueber ein leeres Angebot ----------------------
       "Keine Familie trug ein Thema" ist gegen die Leiter NACHPRUEFBAR
       und darf deshalb nach VOLLSTAENDIGER Suche stehen bleiben.

       Alle anderen hier sind Aussagen ueber EINE Familie oder ueber
       Geschmack. Sie beenden den Tag nie allein - auch nicht mit
       Suchnachweis, denn sie messen die Suche gar nicht. */
    NO_TOPIC_IN_ANY_FAMILY:  { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NUR_NACH_SUCHE },
    NO_MARKET_SIGNAL:        { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN },
    NO_QUANT_SIGNAL:         { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN },
    NO_BREAKING_NEWS:        { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN },
    NO_SINGLE_STOCK_SIGNAL:  { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN },
    NO_IDEA:                 { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN },
    NO_INTERESTING_TOPIC:    { klasse: KLASSE.ANGEBOT, allein: ALLEIN.NEIN }
  };

  /* -------------------------------------------------------------------
     UND DIE, DIE ALLEIN NICHT GENUEGEN

     Ein fehlendes Marktsignal ist kein leerer Content-Tag. Vision
     Universe hat bewusst ein breites Content Universe; dass heute
     keine Kursbewegung traegt, heisst nur, dass die Suche weitergehen
     muss - nicht, dass sie zu Ende ist.

     Der Name bleibt, weil Aufrufer und Tests ihn benutzen. Der INHALT
     kommt jetzt aus der Tabelle oben und wird nicht mehr daneben
     gepflegt.
     ------------------------------------------------------------------- */
  var NIE_ALLEIN = Object.keys(GRUND_KLASSE).filter(function (g) {
    return GRUND_KLASSE[g].allein === ALLEIN.NEIN;
  });

  /* Null, undefined und Leerstring sind KEINE Zahlen - auch wenn
     `Number()` aus zweien davon eine 0 macht. Wo der Unterschied
     zwischen "null" und "unbekannt" etwas entscheidet, wird diese
     Funktion gebraucht und nicht `zahl()`. */
  function ganzeZahlOderNull(v) {
    /* -----------------------------------------------------------------
       FEHLT DAS FELD, ODER FEHLT DIE ZAHL?

       Zwei verschiedene Saetze, und nur der zweite ist ein Befund:

         undefined   der Aufrufer redet ueber diese Groesse nicht.
                     Ein Test zur Reihenfolge von Messen und Vorbereiten
                     hat mit Creative Jobs nichts zu tun; ihn deshalb
                     anzuhalten waere ein Tor, das im Weg steht, wo
                     niemand durchwollte.

         null        der Aufrufer hat gezaehlt und konnte es nicht.
                     DAS ist unbekannt, und unbekannt haelt an.

       Der Unterschied laesst sich hier nicht erraten - er ist nur dort
       bekannt, wo die Datei gelesen wird. scripts/social/run-orchestrator.mjs
       setzt deshalb ausdruecklich `null`, wenn das Register da ist und
       sich nicht lesen laesst, und die Zahl, wenn es sich lesen laesst.
       ----------------------------------------------------------------- */
    if (v === undefined) return 0;
    if (v === null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

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
      /* `null` statt einer erfundenen Null: siehe CREATIVE_JOB_COUNT_UNKNOWN.

         Und NICHT ueber `zahl()`: dort steht `Number(v)`, und
         `Number(null)` ist 0. Der Fehler, den dieser Grund verhindern
         soll, sass beim ersten Anlauf in der Zeile, die ihn verhindern
         sollte. */
      offeneCreativeJobs: ganzeZahlOderNull(z.openCreativeJobs),
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

    if (lage.offeneCreativeJobs === null) {
      return nein(GRUND.CREATIVE_JOB_COUNT_UNKNOWN,
        "Wie viele Creative Jobs gerade offen sind, laesst sich nicht feststellen. " +
        "Solange das so ist, entsteht kein neuer — sonst waere die Obergrenze von " +
        "einem Job genau dann aufgehoben, wenn niemand nachzaehlen kann.");
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
   *
   * -------------------------------------------------------------------
   * DER ZWEITE PARAMETER IST FAIL-CLOSED, UND ZWAR ABSICHTLICH
   * -------------------------------------------------------------------
   *
   * `nachweis.vollstaendigGesucht` beantwortet die einzige Frage, die
   * einen Angebotsgrund tragen kann: hat die Leiter WIRKLICH jede
   * Stufe gefragt? Wer ihn nicht uebergibt, bekommt fuer
   * NO_TOPIC_IN_ANY_FAMILY ein Nein.
   *
   * Das ist keine Strenge um ihrer selbst willen. Ein fehlender
   * Parameter, der als `true` gelesen wird, ist genau die Form von
   * "unbekannt als ja", die den Creative Slot schon einmal geoeffnet
   * hat, als niemand gezaehlt hatte.
   *
   * @param nachweis { vollstaendigGesucht: true|false } - optional
   */
  function grundZulaessig(grund, nachweis) {
    var g = String(grund || "");
    var eintrag = Object.prototype.hasOwnProperty.call(GRUND_KLASSE, g)
      ? GRUND_KLASSE[g] : null;

    if (!eintrag) {
      return {
        zulaessig: false, klasse: null, allein: null, verlangt: null,
        erklaerung: "Unbekannter Grund: " + g + ". Eine Tagesentscheidung " +
          "braucht einen benannten Grund, keinen erfundenen."
      };
    }

    if (eintrag.allein === ALLEIN.NEIN) {
      return {
        zulaessig: false, klasse: eintrag.klasse, allein: eintrag.allein,
        verlangt: null,
        /* OHNE den Code im Satz. Er stand hier vorn, und ein Test hielt
           genau zwei Codes davon ab, im Owner-Text zu erscheinen - die
           uebrigen kamen durch. Was der Owner liest, ist ein Satz; der
           Code steht daneben im Feld `klasse` und in `grund`. */
        erklaerung: "Das ist kein ausreichender alleiniger Grund fuer einen " +
          "leeren Content-Tag. Vision Universe hat ein breites Content " +
          "Universe; ein fehlendes Marktsignal verlangt, weitere Familien zu " +
          "pruefen, und beendet den Tag nicht."
      };
    }

    if (eintrag.allein === ALLEIN.NUR_NACH_SUCHE) {
      var voll = !!(nachweis && nachweis.vollstaendigGesucht === true);
      if (!voll) {
        return {
          zulaessig: false, klasse: eintrag.klasse, allein: eintrag.allein,
          verlangt: "VOLLSTAENDIGE_SUCHE",
          erklaerung: "Dieser Grund sagt etwas ueber das ANGEBOT, und das " +
            "Angebot ist bei Vision Universe breit. Er traegt einen Tag nur, " +
            "wenn die Leiter jede Stufe bis zur letzten gefragt hat und auch " +
            "redaktionell nichts mehr offen stand. Solange das nicht " +
            "nachgewiesen ist, heisst der Befund: die Suche hat aufgehoert, " +
            "nicht das Angebot."
        };
      }
      return {
        zulaessig: true, klasse: eintrag.klasse, allein: eintrag.allein,
        verlangt: null, erklaerung: null
      };
    }

    return {
      zulaessig: true, klasse: eintrag.klasse, allein: eintrag.allein,
      verlangt: null, erklaerung: null
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

  /**
   * Die Verfassung des leeren Tages, als Messung statt als Behauptung.
   *
   * -------------------------------------------------------------------
   * WARUM DAS EINE EIGENE ANTWORT IST
   * -------------------------------------------------------------------
   *
   * "Heute kein Beitrag" ist bisher EIN Satz gewesen, und ein Satz
   * kann zwei voellig verschiedene Lagen meinen:
   *
   *   Der Freigabe-Slot ist belegt          -> Kapazitaet, gewollt
   *   Kein Thema in keiner Familie          -> Angebot, und das waere
   *                                            bei fuenfzehn Familien
   *                                            ein Befund
   *
   * Wer beides gleich meldet, kann den Unterschied spaeter nicht mehr
   * lesen. Diese Funktion schreibt ihn in den Bericht.
   *
   * SIE RECHNET NICHTS NEU. Die Zahlen kommen von dort, wo sie
   * gemessen werden - der Leiter, dem Job-Register, der Konfiguration.
   * Fehlt eine, steht `null` und nicht 0: die Verwechslung von
   * "unbekannt" mit "keins" hat hier schon genug gekostet.
   *
   * @param eingabe {
   *   leiterStufen       wie viele Stufen die Leiter hat
   *   familien           wie viele Content Families es gibt
   *   ideationStufe      die Stufe, auf der redaktionell gefragt wird
   *   maxOpenCreativeJobs, offeneCreativeJobs,
   *   aktiveFreigaben, dailyIntentMax, maxPostsPer7Days
   * }
   */
  function verfassung(eingabe) {
    var e = eingabe || {};
    var stufen = ganzeZahlOderNull(e.leiterStufen);
    var familien = ganzeZahlOderNull(e.familien);
    var ideation = ganzeZahlOderNull(e.ideationStufe);

    /* Reichlich ist keine Stimmung, sondern eine Eigenschaft der
       Leiter: sie endet auf einer Stufe, die IMMER eine Frage hat.
       Ist diese Stufe nicht da, ist die Aussage nicht belegt - und
       dann sagt sie das, statt sie trotzdem zu behaupten. */
    var letzteStufeIstIdeation =
      stufen !== null && ideation !== null && ideation === stufen;

    return {
      contentSupply: {
        modell: "ABUNDANT",
        belegt: letzteStufeIstIdeation && familien !== null && familien > 0,
        leiterStufen: stufen,
        familien: familien,
        letzteStufe: ideation,
        letzteStufeIstIdeation: letzteStufeIstIdeation,
        erklaerung: letzteStufeIstIdeation
          ? "Die Leiter endet auf einer Stufe, die immer eine Frage hat. " +
            "Ein leerer Tag kann deshalb nicht mit fehlenden Ideen begruendet " +
            "werden - hoechstens mit fehlender Evidenz fuer eine Idee."
          : "Die letzte Leiterstufe stellt keine redaktionelle Frage. Solange " +
            "das so ist, laesst sich 'Ideen sind reichlich' nicht messen, " +
            "sondern nur behaupten."
      },
      publishingCapacity: {
        modell: "BOUNDED",
        maxOpenCreativeJobs: ganzeZahlOderNull(e.maxOpenCreativeJobs),
        offeneCreativeJobs: ganzeZahlOderNull(e.offeneCreativeJobs),
        aktiveFreigaben: ganzeZahlOderNull(e.aktiveFreigaben),
        dailyIntentMax: ganzeZahlOderNull(e.dailyIntentMax),
        maxPostsPer7Days: ganzeZahlOderNull(e.maxPostsPer7Days),
        erklaerung: "Kapazitaet ist absichtlich knapp: ein offener Creative " +
          "Job, eine wartende Freigabe, ein Mindestabstand, ein Wochendach. " +
          "Ein leerer Tag aus diesen Gruenden ist ein Betriebszustand und " +
          "kein Mangel."
      },
      /* Der Satz, um dessentwillen die ganze Funktion existiert. */
      erklaerung: "CONTENT SUPPLY = ABUNDANT, PUBLISHING CAPACITY = BOUNDED. " +
        "Die beiden werden getrennt gemeldet, damit ein leerer Tag sagen " +
        "kann, WELCHE der beiden Groessen ihn erklaert."
    };
  }

  var api = {
    EBENEN: EBENEN,
    spannung: spannung,
    verfassung: verfassung,
    GRUND: GRUND,
    KLASSE: KLASSE,
    ALLEIN: ALLEIN,
    GRUND_KLASSE: GRUND_KLASSE,
    NIE_ALLEIN: NIE_ALLEIN,
    regime: regime,
    ganzeZahlOderNull: ganzeZahlOderNull,
    entscheide: entscheide,
    zweiterZulaessig: zweiterZulaessig,
    grundZulaessig: grundZulaessig
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentCadence = api;
})(typeof window !== "undefined" ? window : globalThis);
