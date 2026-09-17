/* =========================================================================
   VISION UNIVERSE — realtime/free-budget.js

   Die Nullkostenschranke fuer den Realtime-Pfad.

   SIE IST DIE ZWEITE IHRER ART, UND DAS MIT ABSICHT

   quant/engines/zero-cost-guard.js macht dasselbe fuer die Ablage (R2):
   ausrechnen, BEVOR das erste Byte hinausgeht, gegen Sicherheitsgrenzen
   statt gegen die Klippe, und im Zweifel ablehnen. Diese Datei uebernimmt
   die Haltung und setzt sie auf andere Groessen: Anfragen und Laufzeit
   eines Durable Object, nicht Objekte und Bytes eines Eimers.

   Getrennt, weil die Einheiten getrennt sind. Ein gemeinsames Modul
   muesste beide Modelle kennen und waere an keiner Stelle mehr scharf.

   DIE ZAHLEN, GEGEN DIE GERECHNET WIRD

   Cloudflare, kostenloser Tarif, Stand 17.09.2026 aus der Dokumentation:

     Durable Objects   100.000 Anfragen am Tag
                        13.000 GB-s am Tag
     WebSocket          20 eingehende Nachrichten = 1 Anfrage
                        ausgehende Nachrichten kostenlos
                        1 Anfrage je neuer Verbindung
     Ueberschreitung    weitere Operationen dieser Art schlagen FEHL.

   Der letzte Satz ist der Grund, warum es diese Datei gibt. Der
   kostenlose Tarif schickt keine Rechnung - er schaltet ab. Ein
   Realtime-Chart, der um 15:40 stumm wird, weil niemand mitgezaehlt
   hat, ist schlimmer als einer, der um 15:00 ehrlich auf den
   Snapshot-Pfad zurueckfaellt.

   GERECHNET WIRD VORHER

   Ein neues Symbol kostet nicht einmal etwas, sondern bis zum
   Handelsschluss. Deshalb fragt mayAdd() nicht "ist noch Platz?",
   sondern "reicht es bis zum Schluss, wenn dieses Symbol dazukommt?".
   Die angenommene Rate je Symbol ist die GEMESSENE Hoechstrate
   (1,7 Ereignisse je Sekunde, XLK am 16.09.2026) - nicht der Median.
   Wer mit dem Median plant, plant fuer den ruhigen Titel und wird vom
   lebhaften ueberrascht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "free-budget-1.0.0";

  /* Die Freigrenzen des Anbieters. Daten, keine Konstanten im Code:
     sie koennen sich aendern und werden dann an EINER Stelle geaendert. */
  var FREE_TIER = {
    provider: "cloudflare-durable-objects",
    requestsPerDay: 100000,
    durationGBsPerDay: 13000,
    memoryMBPerObject: 128,
    websocketIncomingRatio: 20,
    outgoingFree: true,
    resetAt: "00:00 UTC",
    quelle: "developers.cloudflare.com/durable-objects/platform/pricing, " +
            "abgerufen 2026-09-17"
  };

  /* DIE RESERVE - UND WAS SIE SEIT DEM 17.09.2026 AUSSERDEM TRAGEN MUSS

     Urspruenglich deckte sie, was neben den Anbieternachrichten anfaellt:
     Clientverbindungen, Abonnementwechsel, Wecker. Das tut sie weiter.

     Dazu kommt eine Annahme, die ausdruecklich benannt gehoert, weil sie
     der einzige verbliebene Vorbehalt gegen die Nullkostenzusage ist:

       DIE FREIGRENZEN GELTEN JE KONTO, NICHT JE WORKER.

     Im Cloudflare-Konto von Vision Universe liegt bereits ein weiteres
     Worker-Skript (gemessen am 17.09.2026,
     quant/data/market/commercial/cloudflare-scope-probe.json). Es
     verbraucht aus denselben 100.000 Anfragen je Tag. Dieser Waechter
     SIEHT DIESEN VERBRAUCH NICHT - er zaehlt nur den eigenen.

     Owner-Entscheidung vom 17.09.2026: fuer V1 wird der andere Worker
     durch die verbleibende Sicherheitsreserve abgedeckt. Kein
     zusaetzliches Account Analytics:Read, kein Messen seines
     Verbrauchs.

     Was das praktisch heisst, ohne Beschoenigung:

       - 10.000 Anfragen am Tag sind fuer vu-live nicht verplant.
       - Verbraucht der andere Worker weniger als das, haelt die Zusage
         mit Sicherheitsabstand.
       - Verbraucht er mehr, kann die Kontogrenze fallen, BEVOR dieser
         Waechter PROTECT meldet - denn er sieht ja nur seine eigenen
         85 Prozent.
       - Der Ausgang ist auch dann kein Kostenfall, sondern ein
         Ausfall: der kostenlose Tarif schickt keine Rechnung, er
         schaltet ab, und der Browser faellt auf den Snapshot-Pfad
         zurueck.

     Die Annahme ist also kostenseitig sicher und verfuegbarkeitsseitig
     eine Wette. Sie steht hier, damit sie beim naechsten Zwischenfall
     nicht gesucht werden muss. */
  var DEFAULT_RESERVE_REQUESTS = 10000;

  /* Was die Reserve laut Owner-Entscheidung mitdeckt. Steht im
     Schnappschuss, damit jeder Bericht die Annahme mitfuehrt statt sie
     in einer Kommentarzeile zu verstecken. */
  var RESERVE_RATIONALE = {
    decidedBy: "Owner",
    decidedAt: "2026-09-17",
    covers: ["Clientverbindungen", "Abonnementwechsel", "Wecker",
             "den Verbrauch des anderen Workers im selben Konto"],
    accountWideLimits: true,
    otherWorkersMeasured: false,
    note: "Die Freigrenzen gelten je Konto, nicht je Worker. Dieser Waechter zaehlt nur den " +
          "eigenen Verbrauch; der andere Worker im Konto wird durch die Reserve abgedeckt, " +
          "sein tatsaechlicher Verbrauch ist nicht gemessen (kein Account Analytics:Read).",
    risk: "Verbraucht der andere Worker mehr als die Reserve, kann die Kontogrenze fallen, bevor " +
          "dieser Waechter PROTECT meldet. Der Ausgang ist dann ein Ausfall mit Rueckfall auf den " +
          "Snapshot-Pfad, keine Rechnung - der kostenlose Tarif schaltet ab, statt abzurechnen."
  };

  /* Gemessen am 16.09.2026: der lebhafteste Titel des Bandes. */
  var MEASURED_MAX_EVENTS_PER_SECOND = 1.7;

  var VERDICTS = ["OK", "WARNING", "PROTECT", "EXHAUSTED"];

  function tagesschluessel(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  /**
   * @param {object} opts
   *   limits        ueberschreibt FREE_TIER (fuer Tests und spaetere Tarife)
   *   warnAt        Anteil, ab dem gewarnt wird (Standard 0,70)
   *   protectAt     Anteil, ab dem nichts Neues mehr dazukommt (Standard 0,85)
   *   reserveRequests  Reserve fuer Clients und Wecker
   *   assumedEventsPerSecond  Annahme je Symbol (Standard: gemessene Hoechstrate)
   *   sessionRemainingSeconds()  wie lange die Sitzung noch laeuft
   *   now()         Uhr
   *   onVerdict(v)  Rueckruf bei jedem Wechsel des Urteils
   */
  function create(opts) {
    opts = opts || {};
    var limits = Object.assign({}, FREE_TIER, opts.limits || {});
    var warnAt = opts.warnAt === undefined ? 0.70 : opts.warnAt;
    var protectAt = opts.protectAt === undefined ? 0.85 : opts.protectAt;
    var reserve = opts.reserveRequests === undefined ? DEFAULT_RESERVE_REQUESTS
                                                     : opts.reserveRequests;
    var annahme = opts.assumedEventsPerSecond === undefined
      ? MEASURED_MAX_EVENTS_PER_SECOND : opts.assumedEventsPerSecond;
    var restSekunden = typeof opts.sessionRemainingSeconds === "function"
      ? opts.sessionRemainingSeconds : function () { return 0; };
    var now = typeof opts.now === "function" ? opts.now : function () { return Date.now(); };
    var onVerdict = typeof opts.onVerdict === "function" ? opts.onVerdict : function () {};

    var tag = tagesschluessel(now());
    var verbrauch = leer();
    var letztesUrteil = "OK";

    function leer() {
      return {
        providerMessages: 0,      /* eingehend vom Anbieter */
        clientMessages: 0,        /* eingehend von Browsern */
        connections: 0,           /* neue WebSocket-Verbindungen */
        alarms: 0,
        activeSeconds: 0,         /* Laufzeit des Objekts */
        objects: 1,
        peakSymbols: 0,
        peakClients: 0
      };
    }

    /* Der Tag wechselt um 00:00 UTC. Ohne diesen Schnitt zaehlt der
       Waechter ewig weiter und schaltet am zweiten Tag grundlos ab. */
    function tagPruefen() {
      var jetzt = tagesschluessel(now());
      if (jetzt !== tag) { tag = jetzt; verbrauch = leer(); letztesUrteil = "OK"; }
    }

    /* Anfragen aus dem Verbrauch. Die 20:1-Regel gilt nur fuer
       eingehende Nachrichten; ausgehende sind frei. */
    function anfragen(v) {
      var ratio = limits.websocketIncomingRatio;
      return Math.ceil((v.providerMessages + v.clientMessages) / ratio) +
             v.connections + v.alarms;
    }

    function dauerGBs(v) {
      return v.objects * (limits.memoryMBPerObject / 1000) * v.activeSeconds;
    }

    function urteilAus(anteil) {
      if (anteil >= 1) return "EXHAUSTED";
      if (anteil >= protectAt) return "PROTECT";
      if (anteil >= warnAt) return "WARNING";
      return "OK";
    }

    function anteile() {
      var a = anfragen(verbrauch) / Math.max(1, limits.requestsPerDay - reserve);
      var d = dauerGBs(verbrauch) / limits.durationGBsPerDay;
      return { requests: a, duration: d, worst: Math.max(a, d) };
    }

    function urteil() {
      tagPruefen();
      var u = urteilAus(anteile().worst);
      if (u !== letztesUrteil) { letztesUrteil = u; onVerdict(snapshot()); }
      return u;
    }

    /* ---------------------------------------------------------- Zaehlen */
    function noteProviderMessages(n) { tagPruefen(); verbrauch.providerMessages += (n || 1); urteil(); }
    function noteClientMessages(n) { tagPruefen(); verbrauch.clientMessages += (n || 1); urteil(); }
    function noteConnection(n) { tagPruefen(); verbrauch.connections += (n || 1); urteil(); }
    function noteAlarm(n) { tagPruefen(); verbrauch.alarms += (n || 1); urteil(); }
    function noteActiveSeconds(s) { tagPruefen(); verbrauch.activeSeconds += (s || 0); urteil(); }
    function noteSymbols(n) { if (n > verbrauch.peakSymbols) verbrauch.peakSymbols = n; }
    function noteClients(n) { if (n > verbrauch.peakClients) verbrauch.peakClients = n; }

    /* ------------------------------------------------------- Vorausschau
       Was kostet es, wenn ab jetzt `symbole` Titel bis zum Sitzungsende
       laufen? Das ist die Frage, die vor jedem neuen Symbol steht. */
    function vorausschau(symbole) {
      var rest = Math.max(0, restSekunden());
      var nachrichten = symbole * annahme * rest;
      var zusaetzlicheAnfragen = Math.ceil(nachrichten / limits.websocketIncomingRatio);
      var geplanteAnfragen = anfragen(verbrauch) + zusaetzlicheAnfragen;
      var geplanteDauer = dauerGBs(verbrauch) +
        verbrauch.objects * (limits.memoryMBPerObject / 1000) * rest;
      var a = geplanteAnfragen / Math.max(1, limits.requestsPerDay - reserve);
      var d = geplanteDauer / limits.durationGBsPerDay;
      return {
        symbols: symbole, remainingSeconds: rest,
        projectedMessages: Math.round(nachrichten),
        projectedRequests: geplanteAnfragen,
        projectedDurationGBs: Math.round(geplanteDauer),
        requestShare: Math.round(a * 1000) / 1000,
        durationShare: Math.round(d * 1000) / 1000,
        verdict: urteilAus(Math.max(a, d))
      };
    }

    /**
     * Darf ein weiteres Symbol dazukommen?
     * Geprueft wird die Vorausschau MIT diesem Symbol, nicht der
     * Verbrauch von eben.
     */
    function mayAdd(symbol, aktiveAnzahl) {
      tagPruefen();
      var jetzt = urteil();
      if (jetzt === "EXHAUSTED") {
        return { allow: false, reason: "budgetExhausted", verdict: jetzt,
                 projection: vorausschau((aktiveAnzahl || 0) + 1) };
      }
      var sicht = vorausschau((aktiveAnzahl || 0) + 1);
      if (sicht.verdict === "PROTECT" || sicht.verdict === "EXHAUSTED") {
        return { allow: false, reason: "budgetProtect", verdict: sicht.verdict,
                 projection: sicht };
      }
      return { allow: true, reason: null, verdict: sicht.verdict, projection: sicht };
    }

    /** Soll Realtime insgesamt noch laufen? */
    function realtimeAllowed() {
      var u = urteil();
      return u === "OK" || u === "WARNING";
    }

    function snapshot() {
      tagPruefen();
      var a = anteile();
      return {
        version: VERSION,
        day: tag,
        verdict: urteilAus(a.worst),
        thresholds: { warnAt: warnAt, protectAt: protectAt },
        limits: {
          requestsPerDay: limits.requestsPerDay,
          usableRequestsPerDay: limits.requestsPerDay - reserve,
          reserveRequests: reserve,
          durationGBsPerDay: limits.durationGBsPerDay
        },
        used: {
          providerMessages: verbrauch.providerMessages,
          clientMessages: verbrauch.clientMessages,
          connections: verbrauch.connections,
          alarms: verbrauch.alarms,
          requests: anfragen(verbrauch),
          activeSeconds: Math.round(verbrauch.activeSeconds),
          durationGBs: Math.round(dauerGBs(verbrauch)),
          peakSymbols: verbrauch.peakSymbols,
          peakClients: verbrauch.peakClients
        },
        share: {
          requests: Math.round(a.requests * 1000) / 1000,
          duration: Math.round(a.duration * 1000) / 1000
        },
        assumedEventsPerSecondPerSymbol: annahme,
        reserveRationale: RESERVE_RATIONALE,
        source: limits.quelle
      };
    }

    function reset() { verbrauch = leer(); letztesUrteil = "OK"; tag = tagesschluessel(now()); }

    return {
      VERSION: VERSION,
      noteProviderMessages: noteProviderMessages,
      noteClientMessages: noteClientMessages,
      noteConnection: noteConnection,
      noteAlarm: noteAlarm,
      noteActiveSeconds: noteActiveSeconds,
      noteSymbols: noteSymbols,
      noteClients: noteClients,
      mayAdd: mayAdd,
      realtimeAllowed: realtimeAllowed,
      forecast: vorausschau,
      verdict: urteil,
      snapshot: snapshot,
      reset: reset
    };
  }

  var api = {
    VERSION: VERSION, FREE_TIER: FREE_TIER, VERDICTS: VERDICTS,
    DEFAULT_RESERVE_REQUESTS: DEFAULT_RESERVE_REQUESTS,
    RESERVE_RATIONALE: RESERVE_RATIONALE,
    MEASURED_MAX_EVENTS_PER_SECOND: MEASURED_MAX_EVENTS_PER_SECOND,
    create: create
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.FreeBudget = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
