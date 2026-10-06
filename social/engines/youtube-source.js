/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/youtube-source.js

   HUNDERT SUCHEN AM TAG — UND DAS IST EINE ANZAHL, KEIN PREIS

   -------------------------------------------------------------------------
   DIE KORREKTUR, DIE DIE GANZE FORM UMDREHT
   -------------------------------------------------------------------------

   Diese Datei rechnete zuerst mit einem Modell, das seit dem
   2026-06-01 nicht mehr gilt: `search.list` koste 100 Einheiten aus
   einem gemeinsamen Topf von 10.000.

   Tatsaechlich gibt es seither ZWEI getrennte Toepfe:

     SUCHE        100 `search.list`-Aufrufe je Tag, jeder kostet 1 in
                  SEINEM Topf. Er zieht NICHTS aus dem allgemeinen.
     ALLGEMEIN    10.000 Einheiten je Tag fuer alles andere.
                  `videos.list`, `channels.list`, `playlistItems.list`
                  kosten dort je 1.

   Die beiden sind unabhaengig. Neuntausend freie Einheiten im
   allgemeinen Topf helfen nichts, wenn die hundertste Suche gelaufen
   ist: die hunderterste antwortet 403 `quotaExceeded`.

   Was sich dadurch aendert, ist nicht eine Zahl, sondern die
   Knappheit selbst:

     ALT   Suchen waren TEUER. Acht Suchen kosteten 800 von 10.000 -
           man rechnete in Prozent eines grossen Topfes.
     NEU   Suchen sind GEZAEHLT. Hundert am Tag, Punkt. Der Preis je
           Suche ist bedeutungslos geworden; die ANZAHL ist alles.

   Damit ist die knappe Ressource hier dieselbe Sorte wie beim
   Instagram-Hashtag-Budget: ein PLATZ, kein Preis. Und daraus folgt
   dieselbe Form - ein Portfolio, das seine Plaetze verteilt, statt
   einer Liste, die sie verbraucht. Das steht in
   `youtube-query-portfolio.js`.

   Die Detailabrufe sind dagegen praktisch frei: 10.000 Einheiten am
   Tag, je 1 je Abruf, und niemand hier braucht zehntausend. Eine Suche
   findet also wenig und kostet einen von hundert Plaetzen; das
   Nachsehen darauf ist umsonst. Wenige Suchen, viele Details - die
   Empfehlung bleibt, aber der GRUND ist ein anderer.

   -------------------------------------------------------------------------
   DIESE DATEI RUFT NICHTS AUF
   -------------------------------------------------------------------------

   Sie plant und rechnet. Der Aufruf selbst braucht einen API-Schluessel,
   den es noch nicht gibt - das ist ein Owner-Schritt. Bis dahin ist
   `state` AWAITING_OWNER_SOURCE, und das ist keine Fehlermeldung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     WIE DIESE ZAHLEN ZUSTANDE KAMEN — UND WIE NICHT

     Der Auftrag verlangt eine Pruefung an der AKTUELLEN offiziellen
     Dokumentation und verbietet hartcodierte historische Annahmen.

     Der direkte Abruf von developers.google.com ist aus dieser
     Umgebung nicht moeglich - der Egress-Proxy beantwortet CONNECT mit
     403. Das ist erneut geprueft worden und unveraendert.

     Die Zahlen sind deshalb ueber die Websuche an mehreren
     unabhaengigen Quellen aus 2026 bestaetigt, nicht an der
     Primaerquelle abgelesen. `verification.primarySourceRead` ist
     false und bleibt es, bis jemand die Seite wirklich liest.

     Genau dieser Weg hat allerdings soeben gezeigt, wozu er taugt: die
     ALTE Annahme (100 Einheiten aus 10.000) stammte aus demselben Weg
     und war seit Juni 2026 falsch. Eine Sekundaerquelle kann eine
     Aenderung verpassen - sie hat es getan. Der Befund steht deshalb
     nicht als Fussnote, sondern als Zustand: `pruefungFaellig()` bleibt
     faellig, und der erste echte Aufruf ist die eigentliche Pruefung.
     ------------------------------------------------------------------- */
  var KONTINGENT = {
    verifiedAt: "2026-09-19",
    modelValidFrom: "2026-06-01",
    verification: {
      primarySourceRead: false,
      primarySource: "https://developers.google.com/youtube/v3/determine_quota_cost",
      blockedBy: "PRIMARY_SOURCE_UNREACHABLE_FROM_THIS_ENVIRONMENT " +
        "(Egress-Proxy antwortet 403 auf CONNECT)",
      method: "Websuche, mehrere unabhaengige Quellen aus 2026",
      recheckBefore: "Erster echter Aufruf mit YOUTUBE_API_KEY",
      supersededModel: "search.list = 100 Einheiten aus dem allgemeinen " +
        "10.000er-Topf. Galt bis 2026-06-01 und wurde hier zunaechst " +
        "weiterverwendet."
    },

    /* -----------------------------------------------------------------
       ZWEI TOEPFE, UNABHAENGIG VONEINANDER

       `unit` sagt, WORIN gezaehlt wird - und der Unterschied ist der
       ganze Punkt: der Suchtopf zaehlt AUFRUFE, der allgemeine zaehlt
       EINHEITEN. Wer beide als "Units" fuehrt, rechnet sie irgendwann
       zusammen, und dann stimmt nichts mehr. */
    buckets: {
      search: {
        id: "SEARCH_QUERIES",
        unit: "calls",
        dailyLimit: 100,
        costPerCall: 1,
        methods: ["search.list"],
        purchasable: false,
        note: "Eigener Topf seit 2026-06-01. Zieht nichts aus dem " +
          "allgemeinen Kontingent."
      },
      general: {
        id: "GENERAL",
        unit: "units",
        dailyLimit: 10000,
        methods: ["videos.list", "channels.list", "playlistItems.list"],
        purchasable: false,
        note: "Alles ausser Suche und Upload."
      }
    },

    /* Kosten JE METHODE, jeweils in der Waehrung ihres Topfes. */
    costs: {
      "search.list": { bucket: "search", cost: 1 },
      "videos.list": { bucket: "general", cost: 1 },
      "channels.list": { bucket: "general", cost: 1 },
      "playlistItems.list": { bucket: "general", cost: 1 }
    },
    minimumChargePerRequest: 1,
    resetsAt: "Mitternacht Pacific Time",
    exhaustedResponse: "HTTP 403 quotaExceeded",
    purchasable: false,
    note: "Zusaetzliches Kontingent laesst sich nicht kaufen, nur in " +
      "einem manuellen Verfahren beantragen (Audit- und " +
      "Quota-Extension-Formular, ohne zugesicherte Frist). Das waere " +
      "ein eigenes Owner-Gate."
  };

  var STATE = {
    AWAITING_OWNER_SOURCE: "AWAITING_OWNER_SOURCE",
    READY: "READY"
  };

  /**
   * Ist die Kontingentannahme noch benutzbar?
   *
   * Zwei Gruende, warum sie es nicht waere: sie ist alt, oder sie wurde
   * nie an der Primaerquelle gelesen. Der zweite Grund verjaehrt nicht -
   * und genau er hat das alte Modell neun Monate lang ueberleben lassen.
   */
  function pruefungFaellig(spec) {
    spec = spec || {};
    var maxTage = spec.maxAgeDays === undefined ? 30 : spec.maxAgeDays;
    var jetzt = spec.now ? Date.parse(spec.now) : Date.now();
    var alter = Math.floor((jetzt - Date.parse(KONTINGENT.verifiedAt)) / 86400000);
    var gruende = [];
    if (!KONTINGENT.verification.primarySourceRead) {
      gruende.push("Die Primaerquelle wurde nie gelesen (" +
        KONTINGENT.verification.blockedBy + ").");
    }
    if (alter > maxTage) {
      gruende.push("Die Annahme ist " + alter + " Tage alt; erlaubt sind " +
        maxTage + ".");
    }
    return {
      due: gruende.length > 0,
      ageDays: alter,
      primarySource: KONTINGENT.verification.primarySource,
      modelValidFrom: KONTINGENT.modelValidFrom,
      reasons: gruende,
      explanation: gruende.length
        ? "Vor einem echten Aufruf neu pruefen: " + gruende.join(" ")
        : "Die Kontingentannahme ist frisch und an der Primaerquelle belegt."
    };
  }

  /**
   * Was eine Menge Aufrufe kostet — JE TOPF.
   *
   * Gibt bewusst kein einzelnes Gesamt zurueck. Eine Summe ueber beide
   * Toepfe waere eine Zahl ohne Bedeutung: Aufrufe und Einheiten sind
   * verschiedene Waehrungen, und ihr Kurs ist nicht definiert.
   */
  function kosten(aufrufe) {
    var summe = { search: 0, general: 0 };
    var unbekannt = [];
    Object.keys(aufrufe || {}).forEach(function (m) {
      var n = aufrufe[m] || 0;
      var eintrag = KONTINGENT.costs[m];
      if (!eintrag) {
        /* Unbekannt heisst nicht gratis. Auch eine fehlerhafte Anfrage
           wird berechnet - die Schaetzung muss nach oben irren. Ein
           unbekannter Endpunkt gehoert in den allgemeinen Topf; nur
           Suche und Upload haben eigene. */
        unbekannt.push(m);
        summe.general += KONTINGENT.minimumChargePerRequest * n;
        return;
      }
      summe[eintrag.bucket] += eintrag.cost * n;
    });
    return { search: summe.search, general: summe.general,
      unknownMethods: unbekannt };
  }

  /**
   * Ein Tagesplan, der BEIDE Grenzen einhaelt.
   *
   * Gibt zurueck, was moeglich ist - nicht, was man sich wuenscht.
   */
  function tagesplan(spec) {
    spec = spec || {};
    var s = KONTINGENT.buckets.search;
    var g = KONTINGENT.buckets.general;

    var suchGrenze = Math.min(
      spec.dailySearchCalls === undefined ? s.dailyLimit : spec.dailySearchCalls,
      s.dailyLimit);
    var suchVerbraucht = spec.searchCallsUsedToday || 0;
    var suchFrei = Math.max(0, suchGrenze - suchVerbraucht);

    var allgGrenze = Math.min(
      spec.dailyUnits === undefined ? g.dailyLimit : spec.dailyUnits,
      g.dailyLimit);
    var allgVerbraucht = spec.unitsUsedToday || 0;
    var allgFrei = Math.max(0, allgGrenze - allgVerbraucht);

    /* -----------------------------------------------------------------
       RESERVE IM SUCHTOPF, NICHT IM ALLGEMEINEN

       Der Auftrag ist ausdruecklich: nicht automatisch alle hundert
       Aufrufe fest verplanen. Zurueckbleiben muss etwas fuer neue
       Themen, ereignisgetriebene Entdeckung, Erkundung und
       Nachfassen - also fuer alles, was sich vorher nicht aufschreiben
       laesst.

       Im allgemeinen Topf braucht es keine Reserve: zehntausend
       Einheiten fuer Detailabrufe, die je 1 kosten, sind fuer diesen
       Zweck praktisch unbegrenzt. Eine Reserve dort waere Zierde. */
    var reserve = spec.reserveSearchCalls === undefined ? 30 : spec.reserveSearchCalls;
    var maxProLauf = spec.maxSearchesPerRun === undefined ? 12 : spec.maxSearchesPerRun;
    var verfuegbar = Math.max(0, Math.min(maxProLauf, suchFrei - reserve));

    var gewuenscht = spec.searches === undefined ? verfuegbar : spec.searches;
    var suchen = Math.max(0, Math.min(gewuenscht, verfuegbar));

    /* Detailabrufe: je Suche bis zu `maxResults` Treffer, danach
       gebuendeltes Nachsehen. Was hier steht, ist eine Obergrenze und
       keine Vorhersage. */
    var jeSuche = spec.resultsPerSearch === undefined ? 10 : spec.resultsPerSearch;
    var details = Math.min(suchen * jeSuche, allgFrei);

    var plan = { "search.list": suchen, "channels.list": details };
    var k = kosten(plan);

    return {
      quotaVerifiedAt: KONTINGENT.verifiedAt,
      modelValidFrom: KONTINGENT.modelValidFrom,
      search: {
        unit: s.unit, dailyLimit: suchGrenze, usedToday: suchVerbraucht,
        free: suchFrei, reserve: reserve, availableThisRun: verfuegbar,
        planned: suchen, cost: k.search
      },
      general: {
        unit: g.unit, dailyLimit: allgGrenze, usedToday: allgVerbraucht,
        free: allgFrei, planned: details, cost: k.general
      },
      calls: plan,
      /* Beide Grenzen, einzeln geprueft. Ein gemeinsames "withinQuota"
         haette verdeckt, welche der beiden reisst. */
      withinSearchQuota: k.search <= suchFrei,
      withinGeneralQuota: k.general <= allgFrei,
      withinQuota: k.search <= suchFrei && k.general <= allgFrei,
      explanation: suchen + " von " + suchFrei + " freien Suchaufrufen " +
        "(Tagesgrenze " + suchGrenze + ", " + reserve + " bleiben fuer " +
        "Unvorhergesehenes zurueck) und bis zu " + details + " Detailabrufe " +
        "aus " + allgFrei + " freien Einheiten. Die Toepfe sind getrennt: " +
        "freie Einheiten helfen nicht, wenn die Suchen aufgebraucht sind - " +
        "dann antwortet die Plattform " + KONTINGENT.exhaustedResponse + "."
    };
  }

  /**
   * Der Zustand der Quelle.
   *
   * Ohne Schluessel ist sie nicht "kaputt", sondern wartet auf eine
   * Owner-Entscheidung.
   */
  function capability(spec) {
    spec = spec || {};
    var hatSchluessel = !!spec.apiKey;
    return {
      sourceId: "youtube.data_api",
      state: hatSchluessel ? STATE.READY : STATE.AWAITING_OWNER_SOURCE,
      official: true,
      cost: 0,
      /* Der freigegebene Default-Pfad verlangt keine Zahlungsmethode.
         Das steht hier, damit niemand vorsichtshalber Billing
         einschaltet - das waere eine Kostenentscheidung ohne Anlass. */
      billingRequired: false,
      quota: KONTINGENT,
      quotaCheck: pruefungFaellig(spec),
      ownerStepRequired: hatSchluessel ? null : {
        what: "Ein Google-Cloud-Projekt und ein API-Schluessel fuer die " +
          "YouTube Data API v3.",
        cost: "Keine. Das kostenlose Kontingent verlangt keine " +
          "Zahlungsmethode fuer die Data API.",
        secretName: "YOUTUBE_API_KEY",
        where: "GitHub Repository Secrets",
        oneTime: true
      },
      explanation: hatSchluessel
        ? "Schluessel vorhanden - die Quelle ist benutzbar."
        : "Kein API-Schluessel. Das ist kein Fehler, sondern der offene " +
          "Owner-Schritt: ohne Projekt gibt es keinen Schluessel."
    };
  }

  var api = {
    KONTINGENT: KONTINGENT,
    STATE: STATE,
    kosten: kosten,
    pruefungFaellig: pruefungFaellig,
    tagesplan: tagesplan,
    capability: capability
  };

  if (isNode) module.exports = api;
  else global.VUSocialYouTubeSource = api;
})(typeof window !== "undefined" ? window : globalThis);
