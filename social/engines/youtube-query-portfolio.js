/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/youtube-query-portfolio.js

   HUNDERT SUCHEN AM TAG — WER BEKOMMT SIE?

   -------------------------------------------------------------------------
   WARUM DAS NICHT DIESELBE AUFGABE IST WIE BEIM HASHTAG-BUDGET
   -------------------------------------------------------------------------

   Beide Budgets sind Plaetze und keine Preise. Aber sie verfallen
   anders, und daraus folgen entgegengesetzte Strategien:

     HASHTAG   30 EINZIGARTIGE je sieben Tage. Ein einmal geoeffneter
               Hashtag ist die Woche ueber GRATIS nachzusehen.
               -> Oeffnen ist teuer, Wiederholen ist umsonst.

     SUCHE     100 AUFRUFE je Tag. Morgen sind es wieder hundert, und
               dieselbe Suche kostet morgen wieder einen.
               -> Oeffnen ist billig, WIEDERHOLEN ist die Ausgabe.

   Wer die Hashtag-Logik hierher uebertraegt, baut eine Kernliste, die
   taeglich laeuft, und wundert sich, dass nichts mehr uebrig ist. Beim
   Hashtag kostet der Kern EINMAL je Fenster; hier kostet er JEDEN TAG.

   Die Aufteilung folgt daraus:

     CORE MONITORING       wenige Suchen, TAEGLICH. Sie kosten jeden Tag
                           und liefern dafuer das Einzige, was nur
                           Wiederholung liefert: eine Zeitreihe.
     ROTATING EXPLORATION  viele Kandidaten, jeder SELTEN. Wer heute
                           nicht drankommt, kommt morgen dran - und
                           genau deshalb darf die Liste lang sein.
     EVENT-DRIVEN          Suchen, die es gestern nicht gab, weil das
                           Thema gestern nicht da war. Sie haben
                           Vorrang vor der Rotation: ein Anlass, der
                           drei Tage wartet, ist kein Anlass mehr.

   -------------------------------------------------------------------------
   KEINE STARRE LISTE
   -------------------------------------------------------------------------

   Welche Phrasen ueberhaupt in Frage kommen, leitet
   `creator-universe.js` aus dem Content Universe ab. Diese Datei
   entscheidet nur, WER HEUTE DRANKOMMT - und lernt dabei, welche
   Suchen sich wiederholen lohnen.

   Gelernt wird an einer einzigen Groesse: bringt diese Suche NEUE
   Kanaele? Das ist eine Aussage ueber unseren Entdeckungsstand, nicht
   ueber die Qualitaet der Treffer. Eine Suche, die nichts Neues mehr
   findet, ist nicht schlecht - sie ist ausgeschoepft.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var ROLLEN = {
    CORE: "CORE_MONITORING",
    EXPLORATION: "ROTATING_EXPLORATION",
    EVENT: "EVENT_DRIVEN"
  };

  /* Gruende, die sich nicht durch Wiederholen beheben lassen. */
  var TERMINAL = ["quotaExceeded", "keyInvalid", "accessNotConfigured",
    "forbidden"];

  function normalisiere(s) {
    return String(s === undefined || s === null ? "" : s)
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  function tage(a, b) {
    var x = Date.parse(a), y = Date.parse(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (y - x) / 86400000;
  }

  /**
   * Ein neuer, leerer Eintrag.
   *
   * `newChannelsLastRun` ist bewusst null und nicht 0: "noch nie
   * gelaufen" ist kein Befund ueber die Ausbeute.
   */
  function eintrag(query, spec) {
    spec = spec || {};
    return {
      query: normalisiere(query),
      role: spec.role || ROLLEN.EXPLORATION,
      firstRunAt: null,
      lastRunAt: null,
      runCount: 0,
      topicMapping: (spec.topicIds || []).slice(),
      contentFamilyMapping: (spec.families || []).slice(),
      channelsSeen: 0,
      newChannelsLastRun: null,
      emptyRuns: 0,
      attempts: [],
      lastAttemptFailed: false,
      provenance: []
    };
  }

  /* -------------------------------------------------------------------
     DER PLAN

     Er verteilt die Suchen dieses Laufs auf die drei Rollen und sagt
     zu jeder, WARUM sie drankommt. Ein Plan ohne Begruendung je Zeile
     ist spaeter nicht nachvollziehbar - und genau dann wird er
     stillschweigend zur starren Liste.
     ------------------------------------------------------------------- */
  function plan(spec) {
    spec = spec || {};
    var bestand = spec.state || {};
    var now = spec.now || new Date().toISOString();
    var kandidaten = spec.candidates || [];
    var budget = Math.max(0, spec.searchBudget === undefined ? 0 : spec.searchBudget);

    /* -----------------------------------------------------------------
       NICHT IN DIESELBE WAND HINEIN

       Dieselbe Regel wie im Hashtag-Portfolio, aus demselben Grund:
       ein Budget auszugeben, wenn feststeht, dass nichts zurueckkommt,
       ist keine Erkundung. Terminale Gruende brauchen einen Menschen. */
    var blockierend = [];
    Object.keys(bestand).forEach(function (q) {
      var e = bestand[q];
      if (!e.lastAttemptFailed) return;
      var letzter = (e.attempts || [])[(e.attempts || []).length - 1];
      if (!letzter || TERMINAL.indexOf(letzter.reason) === -1) return;
      /* Ein Befund von gestern gilt heute nicht mehr: `quotaExceeded`
         loest sich um Mitternacht Pacific Time von selbst. Alles
         andere haelt laenger, aber auch nicht ewig. */
      var alter = tage(letzter.at, now);
      var haltbar = letzter.reason === "quotaExceeded" ? 1 : 7;
      if (alter !== null && alter >= haltbar) return;
      blockierend.push({ query: q, reason: letzter.reason, at: letzter.at,
        message: letzter.message || null });
    });
    if (blockierend.length) {
      return {
        blockedByTerminalFailure: true,
        blockingFailures: blockierend,
        searchBudget: budget,
        selected: [],
        byRole: { CORE_MONITORING: 0, ROTATING_EXPLORATION: 0, EVENT_DRIVEN: 0 },
        ownerActionRequired: blockierend[0].reason !== "quotaExceeded" ? {
          reason: blockierend[0].reason,
          affected: blockierend.length,
          what: "Die letzten Suchen scheiterten mit \"" +
            blockierend[0].reason + "\". Ein weiterer Lauf verbraucht " +
            "Aufrufe, ohne etwas zu finden."
        } : null,
        explanation: "GESPERRT: " + blockierend.length + " Suche(n) scheiterten " +
          "zuletzt mit \"" + blockierend[0].reason + "\". Es wird nichts " +
          "gesucht, solange die Ursache besteht."
      };
    }

    /* Aufteilung des Budgets. Owner-Groessen, keine Naturkonstanten -
       aber die Reihenfolge ist keine Geschmacksfrage: ein Anlass, der
       wartet, ist keiner mehr. */
    var anteilCore = spec.coreShare === undefined ? 0.4 : spec.coreShare;
    var anteilEvent = spec.eventShare === undefined ? 0.25 : spec.eventShare;

    var bekannt = {};
    Object.keys(bestand).forEach(function (q) { bekannt[q] = bestand[q]; });

    /* ---------------------------------------------------- EVENT-DRIVEN
       Eine Phrase, die es im Bestand noch gar nicht gibt, gehoert zu
       einem Thema, das neu ist. Sie bekommt Vorrang - nicht, weil sie
       besser waere, sondern weil sie verderblich ist. */
    var neuePhrasen = kandidaten.filter(function (k) {
      return !bekannt[normalisiere(k.query)];
    });

    /* ---------------------------------------------------------- CORE
       Taeglich, weil nur Wiederholung eine Zeitreihe ergibt. Wer den
       Kern zusammenstellt, gibt jeden Tag dasselbe aus - deshalb ist er
       klein. */
    var kernPhrasen = kandidaten.filter(function (k) {
      var e = bekannt[normalisiere(k.query)];
      return e && e.role === ROLLEN.CORE;
    });

    /* -------------------------------------------------- EXPLORATION
       Rotierend: wer am laengsten nicht dran war, kommt zuerst. Das
       ist eine Reihenfolge und keine Wertung - eine Suche, die gestern
       nichts fand, kann heute etwas finden. */
    var erkundung = kandidaten.filter(function (k) {
      var e = bekannt[normalisiere(k.query)];
      return e && e.role !== ROLLEN.CORE;
    }).sort(function (a, b) {
      var ea = bekannt[normalisiere(a.query)], eb = bekannt[normalisiere(b.query)];
      /* Ausgeschoepfte nach hinten - aber nicht heraus. */
      if ((ea.emptyRuns || 0) !== (eb.emptyRuns || 0)) {
        return (ea.emptyRuns || 0) - (eb.emptyRuns || 0);
      }
      var la = ea.lastRunAt ? Date.parse(ea.lastRunAt) : 0;
      var lb = eb.lastRunAt ? Date.parse(eb.lastRunAt) : 0;
      return la - lb;
    });

    /* -----------------------------------------------------------------
       DIE ANTEILE SIND UNTERGRENZEN, KEINE DECKEL

       Der erste Entwurf rechnete sie als Deckel: bei einem Budget von
       drei bekam das Ereignis round(3 * 0.25) = 1, der Kern war leer,
       und die Erkundung fand keine BEKANNTEN Phrasen, weil am ersten
       Tag nichts bekannt ist. Ergebnis: eine Suche von drei, zwei
       Aufrufe verfallen.

       Genau das, wogegen der Kommentar daneben argumentierte -
       ungenutztes Budget ist kein gespartes Budget, es verfaellt um
       Mitternacht.

       Die Anteile sichern jetzt jeder Rolle ihren Mindestanteil, und
       was danach frei bleibt, wird in der Vorrangfolge aufgefuellt:
       Ereignis vor Kern vor Erkundung. Verderblich zuerst. */
    /* -----------------------------------------------------------------
       EIN ERSTLAUF IST KEIN EREIGNIS

       Am ersten Tag ist der Bestand leer, also ist JEDE Phrase "neu",
       und alle bekamen die Begruendung "Ein Anlass, der drei Tage
       wartet, ist kein Anlass mehr". Das las sich, als waere gerade
       etwas passiert. Passiert war: wir fangen an.

       Die Vorrangfolge stimmt in beiden Faellen - Unbekanntes zuerst.
       Nur die Begruendung darf nicht dasselbe behaupten. */
    var erstlauf = Object.keys(bestand).length === 0;

    function alsEvent(k) {
      return { query: normalisiere(k.query), role: ROLLEN.EVENT,
        topicIds: k.topicIds || [], families: k.families || [],
        coldStart: erstlauf,
        reason: erstlauf
          ? "Erstlauf: der Bestand ist leer, also ist alles unbekannt. " +
            "Das ist ein Anfang und kein Ereignis."
          : "Neu im Programm: zu dieser Phrase wurde noch nie gesucht. " +
            "Ein Anlass, der drei Tage wartet, ist kein Anlass mehr." };
    }
    function alsKern(k) {
      return { query: normalisiere(k.query), role: ROLLEN.CORE,
        topicIds: k.topicIds || [], families: k.families || [],
        reason: "Kernbeobachtung. Sie kostet jeden Tag einen Aufruf und " +
          "liefert dafuer das Einzige, was nur Wiederholung liefert: " +
          "eine Zeitreihe." };
    }
    function alsErkundung(k) {
      var e = bekannt[normalisiere(k.query)] || {};
      return { query: normalisiere(k.query), role: ROLLEN.EXPLORATION,
        topicIds: k.topicIds || [], families: k.families || [],
        reason: e.lastRunAt
          ? "Rotation: zuletzt am " + e.lastRunAt.slice(0, 10) + " gelaufen" +
            ((e.emptyRuns || 0) ? ", " + e.emptyRuns + " Lauf(e) ohne neue Kanaele." : ".")
          : "Rotation: noch nie gelaufen." };
    }

    var toepfe = [
      { liste: neuePhrasen, mache: alsEvent,
        mindest: Math.min(neuePhrasen.length, Math.round(budget * anteilEvent)) },
      { liste: kernPhrasen, mache: alsKern,
        mindest: Math.min(kernPhrasen.length, Math.round(budget * anteilCore)) },
      { liste: erkundung, mache: alsErkundung, mindest: erkundung.length }
    ];

    var gewaehlt = [];
    var genommen = [0, 0, 0];
    /* Erst die gesicherten Mindestanteile, in der Vorrangfolge. */
    toepfe.forEach(function (t, i) {
      while (genommen[i] < t.mindest && gewaehlt.length < budget) {
        gewaehlt.push(t.mache(t.liste[genommen[i]]));
        genommen[i] += 1;
      }
    });
    /* Dann auffuellen, was uebrig ist - wieder in der Vorrangfolge. */
    toepfe.forEach(function (t, i) {
      while (genommen[i] < t.liste.length && gewaehlt.length < budget) {
        gewaehlt.push(t.mache(t.liste[genommen[i]]));
        genommen[i] += 1;
      }
    });

    var jeRolle = { CORE_MONITORING: 0, ROTATING_EXPLORATION: 0, EVENT_DRIVEN: 0 };
    gewaehlt.forEach(function (g) { jeRolle[g.role] += 1; });

    return {
      blockedByTerminalFailure: false,
      blockingFailures: [],
      ownerActionRequired: null,
      searchBudget: budget,
      selected: gewaehlt,
      byRole: jeRolle,
      candidatesTotal: kandidaten.length,
      deferred: kandidaten.length - gewaehlt.length,
      withinBudget: gewaehlt.length <= budget,
      explanation: gewaehlt.length + " Suche(n) aus " + kandidaten.length +
        " Kandidaten: " + jeRolle.EVENT_DRIVEN + " ereignisgetrieben, " +
        jeRolle.CORE_MONITORING + " Kern, " + jeRolle.ROTATING_EXPLORATION +
        " Erkundung. " + (kandidaten.length - gewaehlt.length) +
        " warten auf einen naechsten Lauf - taeglich gibt es wieder " +
        "Aufrufe, anders als beim Hashtag-Fenster."
    };
  }

  /* -------------------------------------------------------------------
     FESTHALTEN, WAS EIN LAUF ERGAB

     Dieselbe Trennung wie im Hashtag-Portfolio, aus derselben Lehre:
     ein gescheiterter Aufruf ist KEINE Beobachtung von null Kanaelen.
     ------------------------------------------------------------------- */
  function record(bestand, ergebnisse, nowIso, options) {
    options = options || {};
    var neu = JSON.parse(JSON.stringify(bestand || {}));
    (ergebnisse || []).forEach(function (r) {
      var q = normalisiere(r.query);
      if (!q) return;
      var e = neu[q] || eintrag(q, { role: r.role, topicIds: r.topicIds,
        families: r.families });

      if (e.firstRunAt === null) e.firstRunAt = nowIso;
      e.lastRunAt = nowIso;
      e.runCount = (e.runCount || 0) + 1;
      if (r.role) e.role = r.role;
      (r.topicIds || []).forEach(function (t) {
        if (e.topicMapping.indexOf(t) === -1) e.topicMapping.push(t);
      });
      (r.families || []).forEach(function (f) {
        if (e.contentFamilyMapping.indexOf(f) === -1) e.contentFamilyMapping.push(f);
      });

      if (r.ok === false) {
        /* Kein `newChannelsLastRun`, keine Erhoehung von `emptyRuns`.
           Wer nicht gefragt werden konnte, hat nichts gefunden - das
           ist kein Befund ueber die Suche. */
        e.attempts = (e.attempts || []).concat([{ at: nowIso, ok: false,
          reason: r.reason || null, message: r.message || null }]);
        e.lastAttemptFailed = true;
        e.provenance.push({ at: nowIso, outcome: "ATTEMPT_FAILED",
          reason: r.reason || null });
        neu[q] = e;
        return;
      }

      e.lastAttemptFailed = false;
      var neueKanaele = typeof r.newChannels === "number" ? r.newChannels : null;
      e.newChannelsLastRun = neueKanaele;
      if (typeof r.channels === "number") e.channelsSeen = r.channels;
      if (neueKanaele === 0) e.emptyRuns = (e.emptyRuns || 0) + 1;
      else if (neueKanaele !== null) e.emptyRuns = 0;
      e.provenance.push({ at: nowIso, outcome: "OK", role: e.role,
        newChannels: neueKanaele });
      neu[q] = e;
    });
    return neu;
  }

  /* -------------------------------------------------------------------
     LERNEN: WER GEHOERT IN DEN KERN?

     Eine Groesse, und sie handelt von UNS: bringt diese Suche noch
     neue Kanaele?

       Erkundung, die wiederholt Neues findet   -> in den Kern.
       Kern, der nichts Neues mehr findet       -> zurueck in die
                                                   Rotation.

     Keine der beiden Bewegungen ist ein Urteil ueber die Treffer. Eine
     ausgeschoepfte Suche ist nicht schlecht - wir kennen nur schon,
     was sie findet. Und deshalb wird sie auch nicht geloescht: die
     Rotation kommt in ein paar Tagen wieder vorbei, und bis dahin kann
     sich das geaendert haben.
     ------------------------------------------------------------------- */
  function lernen(bestand, options) {
    options = options || {};
    var hoch = options.promoteAfterProductiveRuns === undefined
      ? 2 : options.promoteAfterProductiveRuns;
    var runter = options.demoteAfterEmptyRuns === undefined
      ? 3 : options.demoteAfterEmptyRuns;
    /* -----------------------------------------------------------------
       DER KERN HAT EINE OBERGRENZE, UND SIE IST DER GANZE PUNKT

       Ohne sie wanderte jede ergiebige Suche in den Kern, und der Kern
       laeuft TAEGLICH. Beim ersten Durchspielen war nach zwei Tagen
       alles Kern - die Rotation hatte nichts mehr, und das Budget ging
       jeden Tag an dieselben Phrasen.

       Beim Hashtag-Budget waere das harmlos: dort kostet der Kern
       einmal je Fenster. Hier kostet er jeden Tag, und ein Kern, der
       das ganze Tagesbudget frisst, ist kein Kern, sondern die starre
       Liste, die der Auftrag ausschliesst.

       Die Grenze gehoert deshalb zur Rolle und nicht zur Guete: wer
       nicht hineinpasst, ist nicht schlechter - es ist nur kein Platz.
       Gemessen wird an der Ergiebigkeit, und wer drin ist, kann
       verdraengt werden. */
    var maxKern = options.maxCore === undefined ? 8 : options.maxCore;
    var neu = JSON.parse(JSON.stringify(bestand || {}));
    var aenderungen = [];

    function ergiebigkeit(e) {
      return (e.provenance || []).filter(function (p) {
        return p.outcome === "OK" && typeof p.newChannels === "number" &&
          p.newChannels > 0;
      }).length;
    }

    /* Erst absteigen: ausgeschoepfte Kernsuchen machen Platz, bevor
       ueber Aufstiege entschieden wird. Sonst haengt das Ergebnis an
       der Reihenfolge der Schluessel. */
    Object.keys(neu).forEach(function (q) {
      var e = neu[q];
      if (e.role === ROLLEN.CORE && (e.emptyRuns || 0) >= runter) {
        e.role = ROLLEN.EXPLORATION;
        aenderungen.push({ query: q, from: ROLLEN.CORE, to: ROLLEN.EXPLORATION,
          reason: e.emptyRuns + " Laeufe ohne neue Kanaele. Zurueck in die " +
            "Rotation: die Suche ist ausgeschoepft, nicht schlecht - und " +
            "ein taeglicher Aufruf dafuer ist eine Ausgabe ohne Ertrag." });
      }
    });

    var imKern = Object.keys(neu).filter(function (q) {
      return neu[q].role === ROLLEN.CORE;
    });
    var platz = Math.max(0, maxKern - imKern.length);

    var anwaerter = Object.keys(neu).filter(function (q) {
      var e = neu[q];
      return e.role !== ROLLEN.CORE && ergiebigkeit(e) >= hoch &&
        (e.emptyRuns || 0) === 0;
    }).sort(function (a, b) {
      return ergiebigkeit(neu[b]) - ergiebigkeit(neu[a]);
    });

    anwaerter.slice(0, platz).forEach(function (q) {
      neu[q].role = ROLLEN.CORE;
      aenderungen.push({ query: q, from: ROLLEN.EXPLORATION, to: ROLLEN.CORE,
        reason: ergiebigkeit(neu[q]) + " Laeufe mit neuen Kanaelen. Sie kommt " +
          "in den Kern, weil Wiederholung hier etwas bringt - das ist eine " +
          "Aussage ueber unseren Entdeckungsstand, keine Bewertung der " +
          "Treffer." });
    });

    var abgewiesen = anwaerter.slice(platz);

    return { state: neu, changes: aenderungen,
      changed: aenderungen.length > 0,
      coreSize: Object.keys(neu).filter(function (q) {
        return neu[q].role === ROLLEN.CORE; }).length,
      coreLimit: maxKern,
      /* Wer nur am Platz scheiterte, wird benannt - sonst sieht es
         spaeter aus, als haette er die Schwelle nicht erreicht. */
      promotionDeferredForSpace: abgewiesen,
      explanation: aenderungen.length
        ? aenderungen.length + " Rollenwechsel." +
          (abgewiesen.length ? " " + abgewiesen.length + " Aufstieg(e) " +
            "zurueckgestellt: der Kern ist voll (" + maxKern + ")." : "")
        : "Keine Rollenwechsel - der Bestand traegt sich." +
          (abgewiesen.length ? " " + abgewiesen.length + " Aufstieg(e) " +
            "zurueckgestellt: der Kern ist voll (" + maxKern + ")." : "") };
  }

  var api = {
    ROLLEN: ROLLEN,
    TERMINAL: TERMINAL,
    normalisiere: normalisiere,
    eintrag: eintrag,
    plan: plan,
    record: record,
    lernen: lernen
  };

  if (isNode) module.exports = api;
  else global.VUSocialYouTubeQueryPortfolio = api;
})(typeof window !== "undefined" ? window : globalThis);
