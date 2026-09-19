/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/youtube-source.js

   HUNDERT SUCHEN AM TAG, ODER ZEHNTAUSEND DETAILS

   -------------------------------------------------------------------------
   DAS KONTINGENT IST DIE ARCHITEKTUR
   -------------------------------------------------------------------------

   Stand 2026-09-19, ueber die Websuche an mehreren unabhaengigen
   Quellen bestaetigt und NICHT an der Primaerquelle abgelesen (siehe
   `KONTINGENT.verification`): 10.000 Einheiten je Tag und
   Google-Cloud-Projekt. `search.list` kostet 100, `videos.list` und
   `channels.list` je 1. Auch eine fehlerhafte Anfrage kostet
   mindestens 1.

   Daraus folgt die Form der Nutzung von selbst, und sie ist nicht
   intuitiv: SUCHEN ist teuer, NACHSEHEN ist fast gratis. Hundert
   Suchen leeren den Tag; zehntausend Detailabrufe auch, aber sie
   liefern hundertmal mehr.

   Wer das ignoriert, verbraucht das Tagesbudget vormittags mit
   Suchanfragen und erfaehrt ueber die Treffer nichts.

   Die richtige Form ist deshalb: WENIGE Suchen als Einstieg, dann
   VIELE billige Detailabrufe auf die gefundenen Kanaele und Videos.

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
     Beides ist hier nur teilweise erfuellt, und das steht in den Daten
     und nicht bloss in einem Kommentar:

     Der direkte Abruf von developers.google.com ist aus dieser
     Umgebung nicht moeglich — der Egress-Proxy beantwortet CONNECT mit
     403 (dieselbe Sperre, die auch social.visionuniverse.de trifft).
     Die Zahlen sind deshalb ueber die Websuche an mehreren
     unabhaengigen Quellen aus 2026 bestaetigt, nicht an der
     Primaerquelle abgelesen.

     Das ist ein Unterschied, der zaehlt: eine Sekundaerquelle kann eine
     Aenderung verpassen. `verification` traegt den Unterschied mit, und
     `verification.primarySourceRead` ist false. Wer mit diesem Modul
     echtes Kontingent verbraucht, muss vorher die Primaerquelle gelesen
     haben — dafuer gibt es `pruefungFaellig()`.

     Nicht "geprueft am" also, sondern: SO geprueft, DAS fehlt.
     ------------------------------------------------------------------- */
  var KONTINGENT = {
    verifiedAt: "2026-09-19",
    verification: {
      primarySourceRead: false,
      primarySource: "https://developers.google.com/youtube/v3/determine_quota_cost",
      blockedBy: "EGRESS_BLOCKED (Proxy antwortet 403 auf CONNECT)",
      method: "Websuche, mehrere unabhaengige Quellen aus 2026",
      recheckBefore: "Erster echter Aufruf mit YOUTUBE_API_KEY"
    },
    dailyUnits: 10000,
    costs: { "search.list": 100, "videos.list": 1, "channels.list": 1,
             "playlistItems.list": 1 },
    minimumChargePerRequest: 1,
    resetsAt: "Mitternacht Pacific Time",
    purchasable: false,
    note: "Zusaetzliches Kontingent laesst sich nicht kaufen, nur in " +
      "einem manuellen Verfahren beantragen (Audit- und " +
      "Quota-Extension-Formular, ohne zugesicherte Frist)."
  };

  /**
   * Ist die Kontingentannahme noch benutzbar?
   *
   * Zwei Gruende, warum sie es nicht waere: sie ist alt, oder sie wurde
   * nie an der Primaerquelle gelesen. Der zweite Grund verjaehrt nicht.
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
      reasons: gruende,
      explanation: gruende.length
        ? "Vor einem echten Aufruf neu pruefen: " + gruende.join(" ")
        : "Die Kontingentannahme ist frisch und an der Primaerquelle belegt."
    };
  }

  var STATE = {
    AWAITING_OWNER_SOURCE: "AWAITING_OWNER_SOURCE",
    READY: "READY"
  };

  function kosten(aufrufe) {
    var summe = 0;
    Object.keys(aufrufe || {}).forEach(function (m) {
      var stueck = KONTINGENT.costs[m];
      if (stueck === undefined) stueck = KONTINGENT.minimumChargePerRequest;
      summe += stueck * (aufrufe[m] || 0);
    });
    return summe;
  }

  /**
   * Ein Tagesplan, der das Kontingent einhaelt.
   *
   * Gibt zurueck, was moeglich ist - nicht, was man sich wuenscht.
   */
  function tagesplan(spec) {
    spec = spec || {};
    var budget = Math.min(spec.dailyUnits || KONTINGENT.dailyUnits,
      KONTINGENT.dailyUnits);
    var verbraucht = spec.usedToday || 0;
    var frei = Math.max(0, budget - verbraucht);

    var suchen = Math.max(0, Math.min(spec.searches === undefined ? 8 : spec.searches,
      Math.floor(frei / KONTINGENT.costs["search.list"])));
    var nachSuche = frei - suchen * KONTINGENT.costs["search.list"];

    /* Eine Reserve, damit ein unerwarteter Bedarf am selben Tag noch
       moeglich ist. Dieselbe Ueberlegung wie beim Hashtag-Budget: ein
       Kontingent, das mittags leer ist, kann auf nichts reagieren. */
    var reserve = spec.reserveUnits === undefined ? 1000 : spec.reserveUnits;
    var details = Math.max(0, nachSuche - reserve);

    var plan = { "search.list": suchen, "videos.list": Math.floor(details * 0.7),
      "channels.list": Math.floor(details * 0.3) };
    var summe = kosten(plan);

    return {
      quotaVerifiedAt: KONTINGENT.verifiedAt,
      dailyUnits: budget,
      usedToday: verbraucht,
      free: frei,
      reserveUnits: reserve,
      calls: plan,
      estimatedCost: summe,
      withinQuota: summe <= frei,
      explanation: suchen + " Suchen (je " + KONTINGENT.costs["search.list"] +
        " Einheiten) und " + (plan["videos.list"] + plan["channels.list"]) +
        " Detailabrufe (je 1) = " + summe + " von " + frei + " freien Einheiten. " +
        "Suchen ist teuer, Nachsehen fast gratis - deshalb wenige Suchen als " +
        "Einstieg und viele Detailabrufe darauf."
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
      quota: KONTINGENT,
      /* Ein Schluessel allein macht die Quelle nicht benutzbar, wenn die
         Kontingentannahme ungeprueft ist. Der Zustand sagt das, statt
         es im Verbrauch herauszufinden. */
      quotaCheck: pruefungFaellig(spec),
      ownerStepRequired: hatSchluessel ? null : {
        what: "Ein Google-Cloud-Projekt und ein API-Schluessel fuer die " +
          "YouTube Data API v3.",
        cost: "Keine. Das kostenlose Kontingent verlangt keine " +
          "Zahlungsmethode fuer die Data API.",
        secretName: "YOUTUBE_API_KEY",
        where: "GitHub Repository Secrets"
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
