/* =========================================================================
   VISION UNIVERSE — realtime/connection-state.js

   Der Zustand der Verbindung - als Automat, nicht als Sammlung von Flags.

   Ein Live-Chart hat mindestens acht Zustaende, und die interessanten sind
   die zwischen "laeuft" und "kaputt". Wer das mit booleschen Feldern baut
   (connected, reconnecting, degraded, usingFallback), bekommt vier
   Variablen mit sechzehn Kombinationen, von denen acht unmoeglich sind -
   und irgendwann steht "verbunden und im Rueckfall und offline"
   gleichzeitig da. Das ist keine hypothetische Sorge: genau diese
   Kombination ist der Grund, warum ein Chart "LIVE" zeigt, waehrend er
   Tagesschlusskurse zeichnet.

   Ein Automat kann nur in einem Zustand sein. Uebergaenge, die es nicht
   gibt, finden nicht statt.

   DIE REGEL, DIE DIESER AUTOMAT DURCHSETZT:

     Ein Verlassen von LIVE ist immer sichtbar.

   Es gibt keinen Uebergang, der LIVE still verlaesst und die alten Daten
   weiter als aktuell ausgibt. Wer den Zustand wechselt, wechselt auch die
   Anzeige - dafuer traegt jeder Uebergang seinen Grund mit sich.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var STATES = [
    "IDLE",               // noch nichts versucht
    "CONNECTING",         // erster Verbindungsaufbau
    "LIVE",               // Echtzeitdaten, frisch, verifiziert
    "DEGRADED",           // Echtzeitpfad steht, Daten altern
    "RECONNECTING",       // Verbindung weg, Wiederaufbau laeuft
    "FALLBACK_INTRADAY",  // Echtzeit aufgegeben, Intraday laeuft
    "FALLBACK_EOD",       // auch Intraday weg, Tagesschluss laeuft
    "OFFLINE",            // kein Abruf moeglich, letzter Stand bleibt sichtbar
    "UNAVAILABLE"         // es gibt keinen Datenstand
  ];

  /* Welcher Zustand zeichnet welche Datenklasse. Die Zuordnung steht hier
     und nicht in der Anzeige: sonst gaebe es zwei Meinungen darueber, was
     gerade zu sehen ist. */
  var STATE_DATA_CLASS = {
    IDLE: null,
    CONNECTING: null,
    LIVE: "REALTIME",                 // STREAM oder QUOTE, der Feed weiss welche
    DEGRADED: "REALTIME",
    RECONNECTING: null,               // zeigt weiter, was zuletzt da war
    FALLBACK_INTRADAY: "INTRADAY",
    FALLBACK_EOD: "EOD",
    OFFLINE: null,
    UNAVAILABLE: "UNAVAILABLE"
  };

  /* Erlaubte Uebergaenge. Was hier fehlt, ist verboten - und ein
     verbotener Uebergang ist ein Fehler im Aufrufer, kein stiller No-op:
     er wird gezaehlt und gemeldet. */
  var TRANSITIONS = {
    IDLE:              ["CONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "UNAVAILABLE", "OFFLINE"],
    CONNECTING:        ["LIVE", "RECONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "UNAVAILABLE", "OFFLINE"],
    LIVE:              ["DEGRADED", "RECONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "OFFLINE", "UNAVAILABLE"],
    DEGRADED:          ["LIVE", "RECONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "OFFLINE", "UNAVAILABLE"],
    RECONNECTING:      ["LIVE", "RECONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "OFFLINE", "UNAVAILABLE"],
    FALLBACK_INTRADAY: ["CONNECTING", "LIVE", "FALLBACK_EOD", "OFFLINE", "UNAVAILABLE", "FALLBACK_INTRADAY"],
    FALLBACK_EOD:      ["CONNECTING", "LIVE", "FALLBACK_INTRADAY", "OFFLINE", "UNAVAILABLE", "FALLBACK_EOD"],
    OFFLINE:           ["CONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "UNAVAILABLE", "OFFLINE"],
    UNAVAILABLE:       ["CONNECTING", "FALLBACK_INTRADAY", "FALLBACK_EOD", "OFFLINE", "UNAVAILABLE"]
  };

  /* Die Zustaende, in denen ein Echtzeitpfad aktiv ist. Nur aus ihnen
     heraus darf ueberhaupt "LIVE" entstehen. */
  var REALTIME_STATES = ["CONNECTING", "LIVE", "DEGRADED", "RECONNECTING"];

  var DEFAULTS = {
    /* Wartezeiten des Wiederaufbaus. Exponentiell mit Deckel: der Sinn
       eines Backoffs ist, einen ueberlasteten Anbieter nicht weiter zu
       ueberlasten - und ein Deckel verhindert, dass die Verbindung nach
       einer Stunde Stille erst in zwei Stunden wiederkommt. */
    backoffMs: [1000, 2000, 4000, 8000, 15000, 30000],
    /* Nach so vielen erfolglosen Versuchen wird der Echtzeitpfad
       aufgegeben und zurueckgefallen. Nicht "nie aufgeben": ein Chart, der
       zehn Minuten lang RECONNECTING zeigt, obwohl Intraday-Bars
       bereitstehen, ist schlechter als einer, der zurueckfaellt und es
       sagt. */
    maxReconnectAttempts: 5,
    /* Nach dem Rueckfall wird der Echtzeitpfad in diesem Abstand erneut
       versucht. Null schaltet den Wiederaufstieg ab. */
    retryRealtimeAfterMs: 120000
  };

  function canTransition(from, to) {
    var allowed = TRANSITIONS[from];
    return !!allowed && allowed.indexOf(to) !== -1;
  }

  /**
   * Erzeugt einen Automaten.
   *
   * @param {object} opts {now, initial, backoffMs, maxReconnectAttempts,
   *                       retryRealtimeAfterMs, onTransition}
   */
  function createMachine(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var cfg = {
      backoffMs: opts.backoffMs || DEFAULTS.backoffMs,
      maxReconnectAttempts: opts.maxReconnectAttempts === undefined
        ? DEFAULTS.maxReconnectAttempts : opts.maxReconnectAttempts,
      retryRealtimeAfterMs: opts.retryRealtimeAfterMs === undefined
        ? DEFAULTS.retryRealtimeAfterMs : opts.retryRealtimeAfterMs
    };

    var state = opts.initial && STATES.indexOf(opts.initial) !== -1 ? opts.initial : "IDLE";
    var since = now();
    var history = [];
    var diag = {
      retryCount: 0,
      totalReconnects: 0,
      rejectedTransitions: 0,
      fallbackReason: null,
      lastError: null,
      lastErrorAt: null,
      leftLiveAt: null,
      enteredLiveAt: null,
      lastRealtimeAttemptAt: null
    };

    function record(from, to, reason, detail) {
      var at = now();
      var entry = {
        from: from, to: to, reason: reason || null,
        at: new Date(at).toISOString(),
        durationMs: at - since
      };
      if (detail) entry.detail = detail;
      history.push(entry);
      /* Der Verlauf ist ein Ringpuffer. Eine Sitzung ueber acht Stunden
         mit Reconnects darf nicht unbemerkt Speicher fressen. */
      if (history.length > 200) history.splice(0, history.length - 200);
      since = at;
      return entry;
    }

    function go(to, reason, detail) {
      var from = state;
      if (from === to && to !== "RECONNECTING" &&
          to !== "FALLBACK_INTRADAY" && to !== "FALLBACK_EOD") {
        return { changed: false, state: state, reason: "sameState" };
      }
      if (!canTransition(from, to)) {
        diag.rejectedTransitions++;
        return {
          changed: false, state: state, reason: "forbiddenTransition",
          message: "Uebergang " + from + " -> " + to + " ist nicht vorgesehen."
        };
      }
      if (from === "LIVE") diag.leftLiveAt = now();
      if (to === "LIVE") { diag.enteredLiveAt = now(); diag.retryCount = 0; }
      if (to === "FALLBACK_INTRADAY" || to === "FALLBACK_EOD") diag.fallbackReason = reason || null;
      if (to === "LIVE" || to === "CONNECTING") diag.fallbackReason = null;

      state = to;
      var entry = record(from, to, reason, detail);
      if (typeof opts.onTransition === "function") opts.onTransition(entry, snapshot());
      return { changed: true, state: state, reason: reason || null, entry: entry };
    }

    function snapshot() {
      return {
        state: state,
        dataClassHint: STATE_DATA_CLASS[state],
        since: new Date(since).toISOString(),
        retryCount: diag.retryCount,
        totalReconnects: diag.totalReconnects,
        rejectedTransitions: diag.rejectedTransitions,
        fallbackReason: diag.fallbackReason,
        lastError: diag.lastError,
        lastErrorAt: diag.lastErrorAt,
        isRealtimePath: REALTIME_STATES.indexOf(state) !== -1,
        allowsLiveLabel: state === "LIVE"
      };
    }

    var api = {
      get state() { return state; },
      snapshot: snapshot,
      history: function () { return history.slice(); },
      can: function (to) { return canTransition(state, to); },

      /** Verbindungsaufbau beginnt. */
      connect: function (reason) { return go("CONNECTING", reason || "connectRequested"); },

      /** Verbindung steht und liefert brauchbare Daten. */
      live: function (reason) { return go("LIVE", reason || "streamHealthy"); },

      /** Verbindung steht, Daten altern. Kein Rueckfall - noch nicht. */
      degrade: function (reason) { return go("DEGRADED", reason || "dataAging"); },

      /**
       * Verbindung verloren. Liefert die Wartezeit bis zum naechsten
       * Versuch und sagt, ob weitere Versuche vorgesehen sind.
       */
      lost: function (reason, error) {
        if (error) {
          diag.lastError = String(error && error.message ? error.message : error);
          diag.lastErrorAt = new Date(now()).toISOString();
        }
        diag.retryCount++;
        diag.totalReconnects++;
        var exhausted = diag.retryCount > cfg.maxReconnectAttempts;
        var res = go("RECONNECTING", reason || "connectionLost",
                     { attempt: diag.retryCount, exhausted: exhausted });
        res.attempt = diag.retryCount;
        res.exhausted = exhausted;
        res.waitMs = backoffFor(diag.retryCount);
        return res;
      },

      /** Rueckfall auf eine schlechtere Klasse. */
      fallback: function (dataClass, reason) {
        var target = dataClass === "INTRADAY" ? "FALLBACK_INTRADAY"
                   : dataClass === "EOD" ? "FALLBACK_EOD"
                   : "UNAVAILABLE";
        return go(target, reason || "fallback:" + dataClass);
      },

      /** Es gibt gar nichts mehr zu zeigen. */
      unavailable: function (reason) { return go("UNAVAILABLE", reason || "noDataAvailable"); },

      /** Kein Abruf moeglich, der letzte Stand bleibt stehen. */
      offline: function (reason, error) {
        if (error) {
          diag.lastError = String(error && error.message ? error.message : error);
          diag.lastErrorAt = new Date(now()).toISOString();
        }
        return go("OFFLINE", reason || "transportUnavailable");
      },

      /** Erneuter Versuch des Echtzeitpfads nach einem Rueckfall. */
      retryRealtime: function (reason) {
        diag.lastRealtimeAttemptAt = now();
        return go("CONNECTING", reason || "realtimeRetry");
      },

      /** Ist ein erneuter Echtzeitversuch faellig? */
      realtimeRetryDue: function () {
        if (!cfg.retryRealtimeAfterMs) return false;
        if (state !== "FALLBACK_INTRADAY" && state !== "FALLBACK_EOD") return false;
        var last = diag.lastRealtimeAttemptAt || since;
        return (now() - last) >= cfg.retryRealtimeAfterMs;
      },

      backoffFor: backoffFor,
      config: function () { return JSON.parse(JSON.stringify(cfg)); },
      resetRetries: function () { diag.retryCount = 0; }
    };

    function backoffFor(attempt) {
      var list = cfg.backoffMs;
      if (!list.length) return 0;
      var i = Math.min(Math.max(1, attempt), list.length) - 1;
      return list[i];
    }

    return api;
  }

  var api = {
    STATES: STATES,
    TRANSITIONS: TRANSITIONS,
    STATE_DATA_CLASS: STATE_DATA_CLASS,
    REALTIME_STATES: REALTIME_STATES,
    DEFAULTS: DEFAULTS,
    canTransition: canTransition,
    createMachine: createMachine
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.ConnectionState = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
