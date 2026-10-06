/* =========================================================================
   VISION UNIVERSE — subscription-tiers.js   (Tiingo Commercial, §20, §28)

   Wer bekommt einen Echtzeitstrom, und wer nicht.

   DAS PROBLEM, DAS DIESE DATEI LOEST

   Ein Universum von einigen tausend Titeln laesst sich nicht dauerhaft
   abonnieren. Nicht, weil es zu teuer waere - sondern weil niemand weiss,
   ob es geht: die Abo-Grenzen des Zugangs sind ungemessen. Wer trotzdem
   2.000 Abos oeffnet, erfaehrt die Grenze in dem Moment, in dem ein Kunde
   auf ein Chart schaut.

   Die Antwort ist keine Zahl, sondern eine Ordnung:

     HOT    Titel, die jemand gerade offen hat. Strom.
     WARM   Watchlists und haeufig aufgerufene Titel. Kursabfrage.
     COLD   der Rest. Tagesschluss, bei Bedarf Intraday-Letztstand.

   Ein Titel wandert zwischen den Stufen, waehrend Leute ihn oeffnen und
   schliessen. Diese Datei entscheidet, wohin - und meldet, was dabei
   nicht mehr hineinpasst, statt es stillschweigend fallen zu lassen.

   WAS SIE NICHT TUT

   Sie oeffnet keine Verbindung und kennt keinen Schluessel. Sie ist
   reine Zuteilung: Eingabe Nachfrage, Ausgabe Plan. Damit laesst sie sich
   pruefen, ohne dass eine Boerse offen sein muss.

   UND SIE ERFINDET KEINE KAPAZITAET

   maxStreamSubscriptions steht standardmaessig auf null - ungemessen.
   Mit null gilt die vorsichtigste Annahme: nur HOT bekommt Strom, und
   die Zuteilung meldet, dass die Grenze nicht bekannt ist. Eine geratene
   Zahl waere schlimmer als keine, weil sie sich wie eine gemessene liest.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "subscription-tiers-1.0.0";

  var TIERS = ["HOT", "WARM", "COLD"];

  var TRANSPORT_BY_TIER = {
    HOT: "REALTIME_STREAM",
    WARM: "REALTIME_QUOTE",
    COLD: "EOD"
  };

  var DEFAULTS = {
    /* Ungemessen. Siehe Kopf. */
    maxStreamSubscriptions: null,
    maxConnections: null,
    /* Wie viele Titel pro Stromverbindung angemeldet werden. Tiingos
       IEX-Strom nimmt mehrere Ticker in einer Anmeldung; wie viele,
       ist ebenfalls ungemessen. Der Wert steuert nur die Rechnung
       "wie viele Verbindungen braeuchte dieser Plan". */
    tickersPerConnection: 100,
    /* Ohne gemessene Grenze: wie viele Stroeme wagt die Zuteilung? Der
       Wert ist bewusst klein. Er ist kein Kapazitaetsversprechen,
       sondern die Zahl, mit der ein erster Betrieb anfaengt, ohne dass
       ein Ausfall Kunden trifft. */
    conservativeStreamBudget: 25,
    /* Ab welcher Zugriffszahl im Beobachtungsfenster ein Titel WARM
       wird. Eine Watchlist zaehlt immer, unabhaengig davon. */
    warmMinViews: 3,
    /* Wie lange ein geschlossener Titel noch HOT bleibt. Wer ein Chart
       schliesst und zehn Sekunden spaeter wieder oeffnet, soll nicht auf
       einen Verbindungsaufbau warten. */
    hotLingerMs: 60000
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Teilt Titel auf Stufen auf.
   *
   * @param {object} demand
   *   open        [ticker]           gerade geoeffnete Titel
   *   recentlyOpen [{ticker, closedAtMs}]  kuerzlich geschlossene
   *   watchlists  [ticker]           auf mindestens einer Watchlist
   *   views       {ticker: count}    Aufrufe im Beobachtungsfenster
   *   universe    [ticker]           alles uebrige
   * @param {object} [limits]  wie DEFAULTS
   * @param {object} [opts]    {now}
   * @returns {object} Zuteilungsplan
   */
  function assign(demand, limits, opts) {
    demand = demand || {};
    opts = opts || {};
    var cfg = Object.assign({}, DEFAULTS, limits || {});
    var now = opts.now === undefined ? Date.now() : opts.now;

    var tier = Object.create(null);
    var reason = Object.create(null);

    function put(ticker, t, why) {
      if (!ticker) return;
      var key = String(ticker).toUpperCase();
      /* Die hoehere Stufe gewinnt: ein geoeffneter Titel, der auch auf
         einer Watchlist steht, ist HOT und nicht WARM. */
      if (tier[key] && TIERS.indexOf(tier[key]) <= TIERS.indexOf(t)) return;
      tier[key] = t;
      reason[key] = why;
    }

    (demand.universe || []).forEach(function (t) {
      put(t, "COLD", "Teil des Universums, keine aktuelle Nachfrage.");
    });
    Object.keys(demand.views || {}).forEach(function (t) {
      if ((demand.views[t] || 0) >= cfg.warmMinViews) {
        put(t, "WARM", "Haeufig aufgerufen (" + demand.views[t] + " Zugriffe im Fenster).");
      } else {
        put(t, "COLD", "Selten aufgerufen (" + demand.views[t] + ").");
      }
    });
    (demand.watchlists || []).forEach(function (t) {
      put(t, "WARM", "Auf mindestens einer Watchlist.");
    });
    (demand.recentlyOpen || []).forEach(function (entry) {
      var ticker = entry && (entry.ticker || entry);
      var closedAt = entry && isNum(entry.closedAtMs) ? entry.closedAtMs : null;
      if (closedAt !== null && now - closedAt <= cfg.hotLingerMs) {
        put(ticker, "HOT", "Vor weniger als " + Math.round(cfg.hotLingerMs / 1000) +
                           " s geschlossen; die Verbindung bleibt kurz bestehen.");
      } else {
        put(ticker, "WARM", "Kuerzlich geoeffnet, Nachlauffrist abgelaufen.");
      }
    });
    (demand.open || []).forEach(function (t) {
      put(t, "HOT", "Aktuell geoeffnet.");
    });

    var byTier = { HOT: [], WARM: [], COLD: [] };
    Object.keys(tier).forEach(function (t) { byTier[tier[t]].push(t); });
    TIERS.forEach(function (t) { byTier[t].sort(); });

    /* ------------------------------------------------- Kapazitaet

       Nur HOT bekommt Strom. Selbst wenn Platz waere: WARM ueber den
       Strom zu bedienen hiesse, Kapazitaet fuer Titel zu binden, die
       niemand ansieht - und sie genau dann nicht zu haben, wenn jemand
       einen davon oeffnet. */
    var measured = isNum(cfg.maxStreamSubscriptions);
    var budget = measured ? cfg.maxStreamSubscriptions : cfg.conservativeStreamBudget;

    var streamed = byTier.HOT.slice(0, budget);
    var deferred = byTier.HOT.slice(budget);

    var plan = {
      version: VERSION,
      generatedAt: new Date(now).toISOString(),
      tiers: byTier,
      counts: { HOT: byTier.HOT.length, WARM: byTier.WARM.length, COLD: byTier.COLD.length,
                total: Object.keys(tier).length },
      reasons: reason,
      transports: TRANSPORT_BY_TIER,
      capacity: {
        maxStreamSubscriptions: measured ? cfg.maxStreamSubscriptions : null,
        capacitySource: measured ? "MEASURED" : "UNMEASURED",
        budgetUsed: budget,
        budgetBasis: measured
          ? "Gemessene Abo-Grenze des Zugangs."
          : "Die Abo-Grenze dieses Zugangs ist ungemessen. Die Zuteilung laeuft gegen ein " +
            "bewusst kleines Budget von " + cfg.conservativeStreamBudget + " Stroemen. Das ist " +
            "kein Kapazitaetsversprechen, sondern der Betrieb, der ohne Messung vertretbar ist.",
        streamed: streamed.length,
        deferred: deferred.length,
        connectionsNeeded: Math.ceil(streamed.length / Math.max(1, cfg.tickersPerConnection)),
        maxConnections: isNum(cfg.maxConnections) ? cfg.maxConnections : null
      },
      /* Was NICHT als Strom bedient wird, faellt nicht aus - es faellt
         zurueck. Ein Titel ohne Strom bekommt die Kursabfrage; das ist
         langsamer und ausdruecklich benannt, statt als Stille zu
         erscheinen. */
      streamed: streamed,
      deferredToQuote: deferred,
      deferredReason: deferred.length
        ? "Ueber dem Strombudget. Diese Titel werden per Kursabfrage bedient - langsamer, " +
          "aber nicht stumm. Wer sie im Strom haben will, braucht eine gemessene Abo-Grenze."
        : null,
      browserConnectsDirectly: false,
      browserNote: "Der Browser verbindet sich nie mit dem Anbieter. Der Schluessel liegt " +
                   "serverseitig; das Backend haelt die Stroeme und verteilt sie."
    };
    return plan;
  }

  /**
   * Was ein Plan an Anfragen pro Stunde kostet.
   *
   * Die Frage aus §28: was passiert, wenn dieses Modell laeuft. Sie wird
   * hier gerechnet und nicht geschaetzt - aus dem Plan und den
   * Abrufabstaenden, die tatsaechlich eingestellt sind.
   */
  function estimateLoad(plan, intervals) {
    intervals = Object.assign({ REALTIME_QUOTE: 60000, EOD: 6 * 3600000 }, intervals || {});
    var warmPerHour = plan.counts.WARM * (3600000 / intervals.REALTIME_QUOTE);
    var coldPerHour = plan.counts.COLD * (3600000 / intervals.EOD);
    var deferredPerHour = plan.deferredToQuote.length * (3600000 / intervals.REALTIME_QUOTE);
    return {
      requestsPerHour: {
        warmPolling: Math.round(warmPerHour),
        coldPolling: Math.round(coldPerHour),
        deferredHotPolling: Math.round(deferredPerHour),
        total: Math.round(warmPerHour + coldPerHour + deferredPerHour)
      },
      streamSubscriptions: plan.streamed.length,
      connections: plan.capacity.connectionsNeeded,
      note: "Stroeme zaehlen nicht als Anfragen pro Stunde - sie sind eine stehende " +
            "Verbindung. Genau deshalb ist HOT die guenstigste Stufe fuer Titel, die " +
            "wirklich jemand ansieht, und die teuerste fuer alle anderen."
    };
  }

  var api = {
    VERSION: VERSION,
    TIERS: TIERS,
    DEFAULTS: DEFAULTS,
    TRANSPORT_BY_TIER: TRANSPORT_BY_TIER,
    assign: assign,
    estimateLoad: estimateLoad
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.SubscriptionTiers = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
