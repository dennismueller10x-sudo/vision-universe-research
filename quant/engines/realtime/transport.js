/* =========================================================================
   VISION UNIVERSE — realtime/transport.js

   Vier Wege, an aktuelle Kurse zu kommen (§10):

     A  WebSocket-Strom     Push, Tick fuer Tick
     B  Kursabfrage         Polling auf den letzten Kurs
     C  Intraday-Bars       Polling auf die letzte Bar
     D  Tagesschluss        einmal am Tag, kein Transport im engeren Sinn

   Alle vier sehen von aussen gleich aus. Das ist der Punkt: die
   Fallback-Engine entscheidet ueber Datenklassen, nicht ueber Protokolle,
   und der Chart weiss nicht, ob seine Bar aus einem Socket oder aus einer
   HTTP-Antwort kam.

   WAS HIER NICHT PASSIERT

   Kein Transport erzeugt Daten. Es gibt keinen Simulationsmodus, keinen
   Demo-Tick, keinen "so saehe es aus, wenn wir Realtime haetten". Ein
   Transport ohne Quelle startet nicht - er meldet, warum. Die Versuchung
   ist real: ein simulierter Tick macht die Entwicklung angenehmer, und
   genau ein vergessener Schalter spaeter zeigt eine oeffentliche Seite
   erfundene Kurse.

   Zeitgeber und Verbindungsaufbau werden hineingereicht, nicht importiert.
   Ein Test kann damit acht Stunden Handel in Millisekunden durchspielen -
   und die Datei kennt weder setTimeout noch WebSocket namentlich.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var TRANSPORT_KINDS = ["websocket", "quotePolling", "barPolling", "eod", "none"];

  function noop() {}

  function handlersOf(h) {
    h = h || {};
    return {
      onOpen: h.onOpen || noop,
      onBar: h.onBar || noop,
      onTick: h.onTick || noop,
      onError: h.onError || noop,
      onClose: h.onClose || noop,
      onIdle: h.onIdle || noop
    };
  }

  /* Standard-Zeitgeber. Wird in Tests ersetzt. */
  function defaultTimers() {
    return {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { return clearTimeout(id); },
      now: function () { return Date.now(); }
    };
  }

  /**
   * Ein Transport, der nichts kann - und sagt, warum.
   *
   * Die ehrlichste Bauform in dieser Datei. Er existiert, damit eine nicht
   * verfuegbare Datenklasse trotzdem einen Platz in der Transporttabelle
   * hat und die Fallback-Engine einen Grund bekommt statt eines
   * fehlenden Eintrags.
   */
  function createNullTransport(spec) {
    spec = spec || {};
    return {
      id: spec.id || "null",
      kind: "none",
      dataClass: spec.dataClass || null,
      reason: spec.reason || "transportUnavailable",
      message: spec.message || null,
      isRunning: function () { return false; },
      start: function (h) {
        var hs = handlersOf(h);
        hs.onError({ reason: spec.reason || "transportUnavailable",
                     message: spec.message || "Kein Abrufweg fuer diese Datenklasse.",
                     fatal: true });
        return false;
      },
      stop: function () { return false; },
      stats: function () { return { started: 0, updates: 0, errors: 0 }; }
    };
  }

  /**
   * Polling-Transport (B und C).
   *
   * @param {object} spec
   *   id, dataClass, kind
   *   poll()        -> Promise<{available, data, reason, message, provenance}>
   *   toBars(data)  -> [Bar]      optional, sonst data.bars
   *   toTicks(data) -> [Tick]     optional
   *   intervalMs    Abstand zwischen Abrufen
   *   maxConsecutiveErrors  danach meldet der Transport fatal
   *   timers
   */
  function createPollingTransport(spec) {
    spec = spec || {};
    if (typeof spec.poll !== "function") {
      return createNullTransport({ id: spec.id, dataClass: spec.dataClass,
                                   reason: "transportUnavailable",
                                   message: "Kein Abrufweg uebergeben." });
    }
    var timers = spec.timers || defaultTimers();
    var interval = spec.intervalMs || 15000;
    var maxErrors = spec.maxConsecutiveErrors === undefined ? 3 : spec.maxConsecutiveErrors;

    var running = false;
    var timer = null;
    var hs = handlersOf(null);
    var stats = { started: 0, polls: 0, updates: 0, errors: 0, consecutiveErrors: 0,
                  lastPollAt: null, lastSuccessAt: null, lastReason: null };

    function schedule(ms) {
      if (!running) return;
      timer = timers.setTimeout(tick, ms === undefined ? interval : ms);
    }

    function tick() {
      if (!running) return;
      stats.polls++;
      stats.lastPollAt = timers.now();
      var p;
      try { p = spec.poll(); }
      catch (err) { return fail("transportFailed", err && err.message); }
      if (!p || typeof p.then !== "function") return fail("transportFailed", "poll() lieferte kein Promise.");
      p.then(function (res) {
        if (!running) return;
        if (!res || res.available !== true) {
          return fail((res && res.reason) || "transportFailed", res && res.message);
        }
        stats.consecutiveErrors = 0;
        stats.lastSuccessAt = timers.now();
        stats.lastReason = null;
        var bars = spec.toBars ? spec.toBars(res.data) : (res.data && res.data.bars) || [];
        var ticks = spec.toTicks ? spec.toTicks(res.data) : [];
        if (bars && bars.length) { stats.updates++; hs.onBar(bars, res); }
        if (ticks && ticks.length) { stats.updates++; ticks.forEach(function (t) { hs.onTick(t, res); }); }
        if ((!bars || !bars.length) && (!ticks || !ticks.length)) hs.onIdle(res);
        schedule();
      }, function (err) {
        if (!running) return;
        fail("transportFailed", err && err.message);
      });
    }

    function fail(reason, message) {
      stats.errors++;
      stats.consecutiveErrors++;
      stats.lastReason = reason;
      var fatal = maxErrors > 0 && stats.consecutiveErrors >= maxErrors;
      hs.onError({ reason: reason, message: message || null, fatal: fatal,
                   consecutiveErrors: stats.consecutiveErrors });
      if (fatal) { running = false; return; }
      /* Ein Kontingentfehler wird nicht im selben Takt wiederholt - das
         ist der sicherste Weg, das Kontingent endgueltig zu verlieren. */
      schedule(reason === "rateLimited" || reason === "quotaExceeded"
        ? Math.max(interval, 60000) : interval);
    }

    return {
      id: spec.id || "polling",
      kind: spec.kind || "quotePolling",
      dataClass: spec.dataClass || null,
      isRunning: function () { return running; },
      start: function (h) {
        if (running) return false;
        hs = handlersOf(h);
        running = true;
        stats.started++;
        hs.onOpen({ transport: spec.id || "polling", kind: spec.kind || "quotePolling" });
        /* Sofort einmal abrufen: ein Chart, der nach dem Start erst
           fuenfzehn Sekunden leer bleibt, sieht kaputt aus. */
        tick();
        return true;
      },
      stop: function () {
        if (!running) return false;
        running = false;
        if (timer !== null) { timers.clearTimeout(timer); timer = null; }
        hs.onClose({ reason: "stopped" });
        return true;
      },
      stats: function () { return JSON.parse(JSON.stringify(stats)); }
    };
  }

  /**
   * WebSocket-Transport (A).
   *
   * `connect()` liefert ein Socket-aehnliches Objekt. Es wird
   * hineingereicht und nicht hier gebaut, aus zwei Gruenden:
   *
   *   - Der Schluessel. Eine Tiingo-Verbindung authentifiziert sich mit
   *     einem Token in der ersten Nachricht. Diese Datei darf davon nichts
   *     wissen; der Aufrufer sitzt serverseitig und kennt es.
   *   - Die Pruefbarkeit. Ein Test uebergibt ein Objekt mit denselben
   *     Methoden und kann Abbruch, Verzoegerung und Muell durchspielen.
   */
  function createWebSocketTransport(spec) {
    spec = spec || {};
    if (typeof spec.connect !== "function") {
      return createNullTransport({ id: spec.id, dataClass: spec.dataClass || "REALTIME_STREAM",
                                   reason: "transportUnavailable",
                                   message: "Kein Verbindungsaufbau uebergeben." });
    }
    var timers = spec.timers || defaultTimers();
    var heartbeatMs = spec.heartbeatMs || 0;

    var running = false;
    var socket = null;
    var heartbeat = null;
    var hs = handlersOf(null);
    var stats = { started: 0, messages: 0, updates: 0, errors: 0, dropped: 0,
                  lastMessageAt: null, openedAt: null };

    function armHeartbeat() {
      if (!heartbeatMs || !running) return;
      if (heartbeat !== null) timers.clearTimeout(heartbeat);
      heartbeat = timers.setTimeout(function () {
        if (!running) return;
        /* Kein Byte seit heartbeatMs. Das ist noch kein Abbruch - der
           Socket meldet sich nicht als tot -, aber es ist der Moment, in
           dem die Anzeige es erfahren muss. */
        hs.onError({ reason: "heartbeatMissed", message: null, fatal: false,
                     silentMs: heartbeatMs });
        armHeartbeat();
      }, heartbeatMs);
    }

    return {
      id: spec.id || "websocket",
      kind: "websocket",
      dataClass: spec.dataClass || "REALTIME_STREAM",
      isRunning: function () { return running; },
      start: function (h) {
        if (running) return false;
        hs = handlersOf(h);
        running = true;
        stats.started++;
        try { socket = spec.connect(); }
        catch (err) {
          running = false;
          hs.onError({ reason: "transportFailed", message: err && err.message, fatal: true });
          return false;
        }
        if (!socket) {
          running = false;
          hs.onError({ reason: "transportFailed", message: "Kein Socket erhalten.", fatal: true });
          return false;
        }

        socket.onopen = function (ev) {
          stats.openedAt = timers.now();
          if (typeof spec.onOpenSend === "function" && typeof socket.send === "function") {
            /* Die Anmeldenachricht baut der Aufrufer. Sie enthaelt bei
               Tiingo den Schluessel - er darf diese Datei nie beruehren. */
            try { socket.send(spec.onOpenSend()); } catch (err) { /* meldet der Socket */ }
          }
          armHeartbeat();
          hs.onOpen({ transport: spec.id || "websocket", kind: "websocket", event: null });
        };

        socket.onmessage = function (ev) {
          if (!running) return;
          stats.messages++;
          stats.lastMessageAt = timers.now();
          armHeartbeat();
          var parsed;
          try { parsed = spec.parse ? spec.parse(ev) : (ev && ev.data); }
          catch (err) {
            stats.dropped++;
            hs.onError({ reason: "parseError", message: err && err.message, fatal: false });
            return;
          }
          if (!parsed) { stats.dropped++; return; }
          if (parsed.tick) { stats.updates++; hs.onTick(parsed.tick, parsed); }
          if (parsed.bar) { stats.updates++; hs.onBar([parsed.bar], parsed); }
          if (parsed.bars && parsed.bars.length) { stats.updates++; hs.onBar(parsed.bars, parsed); }
        };

        socket.onerror = function (ev) {
          stats.errors++;
          hs.onError({ reason: "transportFailed",
                       message: (ev && ev.message) || "Socketfehler.", fatal: false });
        };

        socket.onclose = function (ev) {
          var wasRunning = running;
          running = false;
          if (heartbeat !== null) { timers.clearTimeout(heartbeat); heartbeat = null; }
          if (wasRunning) {
            hs.onClose({ reason: "socketClosed",
                         code: ev && ev.code, message: ev && ev.reason });
          }
        };
        return true;
      },
      stop: function () {
        if (!running) return false;
        running = false;
        if (heartbeat !== null) { timers.clearTimeout(heartbeat); heartbeat = null; }
        try { if (socket && typeof socket.close === "function") socket.close(); }
        catch (err) { /* ein Socket, der beim Schliessen wirft, ist geschlossen genug */ }
        socket = null;
        hs.onClose({ reason: "stopped" });
        return true;
      },
      stats: function () { return JSON.parse(JSON.stringify(stats)); }
    };
  }

  var api = {
    TRANSPORT_KINDS: TRANSPORT_KINDS,
    defaultTimers: defaultTimers,
    createNullTransport: createNullTransport,
    createPollingTransport: createPollingTransport,
    createWebSocketTransport: createWebSocketTransport
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.Transport = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
