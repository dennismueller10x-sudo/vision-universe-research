/* =========================================================================
   VISION UNIVERSE — realtime/feed.js

   Der Live-Feed: die Stelle, an der die Einzelteile zusammenarbeiten.

     Verhandlung   was darf und kann dieser Zugang?      capability-negotiation
     Auswahl       welche Klasse zeichnen wir jetzt?     fallback-engine
     Transport     wie kommen die Daten herein?          transport
     Zusammenfuehrung  wie werden sie eine Reihe?        bar-merge
     Verfall       ist der Stand noch aktuell?           staleness
     Verbindung    in welchem Zustand sind wir?          connection-state
     Anzeige       was steht ueber dem Chart?            data-status

   Sieben Module, sieben Aufgaben, und dieses hier hat nur eine: die
   Reihenfolge. Es rechnet nichts selbst.

   DIE ABLAEUFE, DIE DIESE DATEI GARANTIERT

   Aufstieg nach Abbruch (§11):
     Der Echtzeitpfad wird nicht einfach wieder eingeschaltet. Erst werden
     die fehlenden Bars nachgeladen, dann zusammengefuehrt (mit
     Entdopplung), und erst wenn ein frischer Datenstand vorliegt, steht
     wieder LIVE ueber dem Chart. Die Reihenfolge ist der ganze Punkt:
     umgekehrt zeigt der Chart eine Luecke und nennt sie live.

   Abstieg (§22):
     Jeder Abstieg aendert das Etikett. Es gibt in dieser Datei keinen
     Pfad, auf dem der Zustand sich aendert und die Anzeige nicht.

   Der Feed haelt den letzten belastbaren Datenstand fest. Ein Ausfall
   loescht nichts (§21 I) - er aendert nur, was ueber den Daten steht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var DataClass = isNode ? require("./data-class.js") : global.VURealtime.DataClass;
  var Fallback = isNode ? require("./fallback-engine.js") : global.VURealtime.FallbackEngine;
  var Staleness = isNode ? require("./staleness.js") : global.VURealtime.Staleness;
  var MarketHours = isNode ? require("./market-hours.js") : global.VURealtime.MarketHours;
  var Connection = isNode ? require("./connection-state.js") : global.VURealtime.ConnectionState;
  var BarMerge = isNode ? require("./bar-merge.js") : global.VURealtime.BarMerge;
  var DataStatus = isNode ? require("./data-status.js") : global.VURealtime.DataStatus;
  var Transport = isNode ? require("./transport.js") : global.VURealtime.Transport;
  var SessionPolicy = isNode ? require("./session-policy.js") : global.VURealtime.SessionPolicy;

  var FEED_VERSION = "live-feed-1.0.0";

  /**
   * @param {object} opts
   *   negotiation   Pflicht - Ergebnis aus capability-negotiation.js
   *   transports    {KLASSE: transport} - fehlende Klassen gelten als
   *                 ohne Abrufweg
   *   series        Reihenpuffer aus bar-merge.js (wird sonst erzeugt)
   *   backfill(range) -> Promise<{available, data:{bars}}>   optional
   *   calendar, exchange, thresholds, interval
   *   timers        {setTimeout, clearTimeout, now}
   *   watchdogMs    Takt der Verfallspruefung
   *   onStatus(status, feed)  Rueckruf bei jeder Statusaenderung
   */
  function createLiveFeed(opts) {
    opts = opts || {};
    var negotiation = opts.negotiation;
    if (!negotiation) throw new Error("createLiveFeed: negotiation fehlt.");

    var timers = opts.timers || Transport.defaultTimers();
    var now = function () { return timers.now(); };
    var calendar = opts.calendar || MarketHours.BUILTIN_CALENDAR;
    var exchange = opts.exchange || MarketHours.DEFAULT_EXCHANGE;
    var thresholds = opts.thresholds || null;
    var interval = opts.interval || "5min";
    var watchdogMs = opts.watchdogMs === undefined ? 5000 : opts.watchdogMs;

    var series = opts.series || BarMerge.createSeries({
      timeframe: opts.timeframe || "5m", interval: interval,
      adjustmentStatus: opts.adjustmentStatus, calendar: calendar,
      exchange: exchange, now: now
    });

    var transports = opts.transports || {};
    var machine = Connection.createMachine({
      now: now,
      backoffMs: opts.backoffMs,
      maxReconnectAttempts: opts.maxReconnectAttempts,
      retryRealtimeAfterMs: opts.retryRealtimeAfterMs
    });

    /* Laufzeitzustand je Datenklasse. Er ist der Unterschied zwischen
       "kann der Zugang das" (Verhandlung, aendert sich selten) und
       "geht es gerade" (hier, aendert sich staendig). */
    var runtime = {};
    var selection = null;
    var activeClass = null;
    var activeTransport = null;
    var lastStatus = null;
    var lastSuccessfulUpdate = null;
    var lastSession = null;
    var watchdog = null;
    var stopped = true;
    var backfillInFlight = false;

    var diag = {
      selections: 0, downgrades: 0, upgrades: 0, backfills: 0,
      barsApplied: 0, ticksApplied: 0, statusChanges: 0,
      sessionTransitions: 0, lastSessionTransition: null,
      lastFallbackReason: null, lastError: null
    };

    /* ------------------------------------------------------------ Auswahl */

    function inventory() {
      var inv = {};
      /* Nur die aktive Klasse hat einen belegten Bestand. Fuer die
         uebrigen wird nicht auf Bestand geprueft - sonst schiede jede
         Klasse aus, aus der noch nie abgerufen wurde, und der Chart
         blieb auf der letzten stehen, die einmal lief. */
      if (activeClass) inv[activeClass] = { bars: series.length() };
      return inv;
    }

    /* Erwarten wir in der laufenden Sitzung ueberhaupt neue Daten?
       
       Die Frage entscheidet, ob ein stiller Kurs ein Befund ist. Sie an
       einem festen Schalter haengen zu lassen war falsch: waehrend der
       Nachboerse wurde dann nie etwas erwartet - auch dann nicht, wenn
       der Zugang nachweislich Echtzeit in erweiterten Zeiten liefert.
       Die Folge war ein Feed, der Daten bekam, sie einsortierte und
       trotzdem "BOERSE GESCHLOSSEN" darueber schrieb.
       
       Richtig ist die Kopplung an die Faehigkeit: wir erwarten in einer
       erweiterten Sitzung genau dann Aktualisierungen, wenn der Zugang
       belegt hat, dass er sie dort liefert. Ist das ungeprueft, gibt es
       keine Erwartung - und damit auch keinen falschen Alarm. */
    function expectsExtendedUpdates() {
      if (opts.includeExtended === true) return true;
      if (opts.includeExtended === false) return false;
      return SessionPolicy.allowsLiveLabel(
        currentSession().session,
        negotiation.capabilities || opts.capabilities || null);
    }

    function currentStaleness(dataClass) {
      return Staleness.evaluate({
        dataClass: dataClass || activeClass || DataClass.TERMINAL_CLASS,
        timestamp: series.lastTimestamp(),
        receivedAt: series.lastReceivedAt(),
        now: now(), interval: interval,
        calendar: calendar, exchange: exchange,
        /* Den bereits ermittelten Sitzungsbefund weiterreichen, statt ihn
           dort ein zweites Mal berechnen zu lassen. */
        session: currentSession(),
        thresholds: thresholds,
        includeExtended: expectsExtendedUpdates()
      });
    }

    /* Die laufende Sitzung, in Produktschreibweise.

       Je Minute gemerkt, aus demselben Grund wie der Zeiteimer in
       bar-merge.js und mit derselben Begruendung: eine Sitzungsgrenze
       liegt immer auf einer vollen Minute, und Zeitzonen versetzen um
       volle Minuten - der Schluessel ist damit exakt und nicht genaehert.

       Ohne den Merker kostete jeder Tick drei Kalenderabfragen: eine fuer
       die Sitzung, eine fuer die Erwartungshaltung der Verfallspruefung,
       eine in der Verfallspruefung selbst. Gemessen waren das 22 statt 9
       Mikrosekunden je Tick - fuer dreimal dieselbe Antwort. */
    var sessionMemoKey = null;
    var sessionMemoValue = null;
    function currentSession() {
      var key = Math.floor(now() / 60000);
      if (key !== sessionMemoKey) {
        sessionMemoKey = key;
        sessionMemoValue = SessionPolicy.sessionAt(now(), { calendar: calendar, exchange: exchange });
      }
      return sessionMemoValue;
    }

    /* Welche Sprossen faellt die aktuelle Sitzung weg?
       Das Ergebnis geht als `suppress` in dieselbe Auswahl wie ein
       Netzfehler - die Fallback-Engine bleibt die eine Stelle, an der
       entschieden wird, welche Datenklasse gezeichnet wird. */
    function sessionRestriction(session) {
      if (opts.extendedHours === "ignore") return { suppress: [], reason: null };
      return SessionPolicy.restrict(
        (session || currentSession()).session,
        negotiation.capabilities || opts.capabilities || null);
    }

    function reselect(reasonLabel) {
      var st = {};
      if (activeClass) st[activeClass] = currentStaleness(activeClass);
      var session = currentSession();
      var restriction = sessionRestriction(session);
      var next = Fallback.select({
        negotiation: negotiation, runtime: runtime,
        inventory: inventory(), staleness: st,
        suppress: restriction.suppress
      });
      next.session = session;
      next.sessionReason = restriction.reason;
      var cmp = Fallback.compare(selection, next);
      selection = next;
      diag.selections++;
      if (cmp.changed && cmp.direction === "downgrade") {
        diag.downgrades++;
        diag.lastFallbackReason = reasonLabel || cmp.reason || null;
      }
      if (cmp.changed && cmp.direction === "upgrade") diag.upgrades++;
      return { selection: next, comparison: cmp };
    }

    /* --------------------------------------------------------- Transporte */

    function stopActiveTransport() {
      if (activeTransport && activeTransport.isRunning()) activeTransport.stop();
      activeTransport = null;
    }

    /**
     * Startet den Abrufweg einer Datenklasse.
     *
     * `backfillFirst` ist der Weg zurueck nach oben (§11): wer den
     * Echtzeitpfad nach einem Rueckfall wieder aufnimmt, hat eine Luecke
     * in der Reihe. Sie wird geschlossen, BEVOR der Strom laeuft - sonst
     * zeigte der Chart ein Loch und nennte es live.
     */
    function startFor(dataClass, options) {
      options = options || {};
      if (options.backfillFirst && DataClass.isRealtimeClass(dataClass)) {
        runBackfill(dataClass, function () { startFor(dataClass); });
        return;
      }
      stopActiveTransport();
      activeClass = dataClass;

      if (dataClass === DataClass.TERMINAL_CLASS) {
        machine.unavailable("noDataAvailable");
        publish();
        return;
      }

      var t = transports[dataClass];
      if (!t) {
        runtime[dataClass] = { ok: false, reason: "transportUnavailable",
          message: "Fuer " + dataClass + " ist kein Abrufweg eingerichtet." };
        return degradeTo("transportUnavailable");
      }

      if (DataClass.isRealtimeClass(dataClass)) machine.connect("selected:" + dataClass);
      else machine.fallback(dataClass, diag.lastFallbackReason || "selected:" + dataClass);
      publish();

      activeTransport = t;
      t.start({
        onOpen: function () { publish(); },
        onBar: function (bars, res) { onBars(bars, res, dataClass); },
        onTick: function (tick) { onTick(tick, dataClass); },
        onIdle: function () { publish(); },
        onError: function (err) { onTransportError(err, dataClass); },
        onClose: function (info) { onTransportClose(info, dataClass); }
      });
    }

    /* Ein Schritt die Leiter hinunter. Nie zwei auf einmal: jede Stufe
       bekommt ihre eigene Chance, und jeder Abstieg ist eine eigene
       Statusaenderung, die der Nutzer sieht. */
    function degradeTo(reason) {
      var res = reselect(reason);
      if (res.selection.selected === activeClass &&
          res.selection.selected !== DataClass.TERMINAL_CLASS) {
        /* Nichts Besseres und nichts Schlechteres - der Zustand bleibt,
           die Anzeige nicht: sie sagt jetzt, dass es hakt. */
        publish();
        return;
      }
      startFor(res.selection.selected);
    }

    /* -------------------------------------------------------- Datenzulauf */

    function onBars(bars, res, dataClass) {
      var origin = dataClass === "EOD" ? "EOD"
                 : dataClass === "INTRADAY" ? "INTRADAY"
                 : "REALTIME_CONFIRMED";
      var summary = series.applyBars(bars.map(function (b) {
        return withMeta(b, dataClass, res);
      }), origin);
      diag.barsApplied += (summary.appended || 0) + (summary.inserted || 0) + (summary.replaced || 0);
      if ((summary.appended || summary.inserted || summary.replaced)) {
        lastSuccessfulUpdate = now();
      }
      runtime[dataClass] = { ok: true };
      settle(dataClass);
    }

    function onTick(tick, dataClass) {
      var r = series.applyTick(withMeta(tick, dataClass, null));
      if (r.action === "appended" || r.action === "updated") {
        diag.ticksApplied++;
        lastSuccessfulUpdate = now();
      }
      runtime[dataClass] = { ok: true };
      settle(dataClass);
    }

    function withMeta(o, dataClass, res) {
      var out = {};
      Object.keys(o).forEach(function (k) { out[k] = o[k]; });
      if (out.receivedAt === undefined) out.receivedAt = now();
      out.dataClass = dataClass;
      if (res && res.provenance && !out.source) out.source = res.provenance.provider || null;
      return out;
    }

    /* Nach jedem Datenpunkt: reicht der Stand fuer das Etikett, das wir
       gerade fuehren? Nur hier entsteht LIVE. */
    function settle(dataClass) {
      var st = currentStaleness(dataClass);
      if (DataClass.isRealtimeClass(dataClass)) {
        if (st.level === "FRESH") {
          if (machine.state !== "LIVE") machine.live("freshData");
        } else if (st.level === "MARKET_CLOSED") {
          /* Geschlossene Boerse ist kein Fehler. Der Zustand bleibt, das
             Etikett wird es sagen. */
          if (machine.state === "LIVE") machine.degrade("marketClosed");
        } else if (st.level === "DEGRADED" || st.level === "STALE") {
          if (machine.state === "LIVE") machine.degrade(st.reason || "dataAging");
        }
      }
      publish();
    }

    function onTransportError(err, dataClass) {
      diag.lastError = (err && err.reason) || "transportFailed";
      runtime[dataClass] = { ok: !err.fatal, reason: err.reason || "transportFailed",
                             message: err.message || null };
      if (!err.fatal) {
        if (DataClass.isRealtimeClass(dataClass) && machine.state === "LIVE") {
          machine.degrade(err.reason || "transportDegraded");
        }
        publish();
        return;
      }
      if (DataClass.isRealtimeClass(dataClass)) {
        var lost = machine.lost(err.reason || "transportFailed", err.message);
        publish();
        if (lost.exhausted) {
          runtime[dataClass] = { ok: false, reason: err.reason || "transportFailed",
                                 message: err.message || null };
          degradeTo("reconnectExhausted");
        } else {
          scheduleReconnect(dataClass, lost.waitMs);
        }
        return;
      }
      degradeTo(err.reason || "transportFailed");
    }

    function onTransportClose(info, dataClass) {
      if (stopped) return;
      if (info && info.reason === "stopped") return;
      onTransportError({ reason: info && info.reason ? info.reason : "connectionLost",
                         message: info && info.message, fatal: false }, dataClass);
      /* Ein geschlossener Socket ist immer ein Verbindungsverlust, auch
         wenn kein Fehler kam. */
      var lost = machine.lost("connectionLost");
      publish();
      if (lost.exhausted) {
        runtime[dataClass] = { ok: false, reason: "connectionLost" };
        degradeTo("reconnectExhausted");
      } else {
        scheduleReconnect(dataClass, lost.waitMs);
      }
    }

    function scheduleReconnect(dataClass, waitMs) {
      if (stopped) return;
      timers.setTimeout(function () {
        if (stopped) return;
        if (machine.state !== "RECONNECTING") return;
        var t = transports[dataClass];
        if (!t) { degradeTo("transportUnavailable"); return; }
        activeTransport = t;
        activeClass = dataClass;
        t.start({
          onOpen: function () { publish(); },
          onBar: function (bars, res) { afterReconnect(dataClass, bars, res); },
          onTick: function (tick) { afterReconnectTick(dataClass, tick); },
          onIdle: function () { publish(); },
          onError: function (err) { onTransportError(err, dataClass); },
          onClose: function (info) { onTransportClose(info, dataClass); }
        });
      }, waitMs || 1000);
    }

    /* §11: erst nachladen, dann zusammenfuehren, dann LIVE. */
    function afterReconnect(dataClass, bars, res) {
      runBackfill(dataClass, function () { onBars(bars, res, dataClass); });
    }
    function afterReconnectTick(dataClass, tick) {
      runBackfill(dataClass, function () { onTick(tick, dataClass); });
    }

    function runBackfill(dataClass, then) {
      if (backfillInFlight || typeof opts.backfill !== "function") { then(); return; }
      var gap = series.gapSince(lastSuccessfulUpdate || now());
      backfillInFlight = true;
      diag.backfills++;
      var p;
      try { p = opts.backfill({ fromMs: gap.fromMs, toMs: gap.toMs,
                                from: gap.from, to: gap.to, dataClass: dataClass }); }
      catch (err) { backfillInFlight = false; then(); return; }
      if (!p || typeof p.then !== "function") { backfillInFlight = false; then(); return; }
      p.then(function (res) {
        backfillInFlight = false;
        if (res && res.available && res.data && res.data.bars) {
          series.applyBars(res.data.bars.map(function (b) {
            return withMeta(b, "INTRADAY", res);
          }), "INTRADAY");
        }
        then();
      }, function () { backfillInFlight = false; then(); });
    }

    /* ---------------------------------------------------------- Wachhund */

    function tickWatchdog() {
      if (stopped) return;

      /* Ein Sitzungswechsel folgt aus keinem Datenpunkt: um 16:00 New
         Yorker Zeit kommt nichts herein, es hoert nur etwas auf. Ohne
         diese Pruefung stuende "LIVE · REGULAR" noch um 22:30 deutscher
         Zeit da - und genau das ist der Fehler, den dieser Workstream
         verhindern soll. */
      var session = currentSession();
      var wechsel = SessionPolicy.transition(lastSession, session);
      lastSession = session;
      if (wechsel) {
        diag.sessionTransitions++;
        diag.lastSessionTransition = wechsel.from + "->" + wechsel.to;
        var neu = reselect("sessionChange:" + wechsel.to);
        if (neu.selection.selected !== activeClass) {
          startFor(neu.selection.selected);
        } else {
          publish();
        }
      }

      if (activeClass && activeClass !== DataClass.TERMINAL_CLASS) {
        var st = currentStaleness(activeClass);
        if (Staleness.shouldFallback(st)) {
          runtime[activeClass] = { ok: false, reason: "stale",
                                   message: "Der Stand ist ueber der Rueckfallschwelle." };
          degradeTo("stale");
        } else if (st.level === "STALE" || st.level === "DEGRADED") {
          if (machine.state === "LIVE") machine.degrade(st.reason || "dataAging");
          publish();
        } else {
          publish();
        }
      }
      /* Wiederaufstieg: nach dem Rueckfall wird der Echtzeitpfad in
         Abstaenden erneut versucht - aber nur, wenn die Verhandlung ihn
         ueberhaupt hergibt. Ein ungeprueft Realtime-Zugang wird nicht
         alle zwei Minuten angeklopft. */
      if (machine.realtimeRetryDue()) {
        var candidates = ["REALTIME_STREAM", "REALTIME_QUOTE"].filter(function (c) {
          var f = negotiation.classes[c];
          return f && f.usable && transports[c];
        });
        if (candidates.length) {
          candidates.forEach(function (c) { delete runtime[c]; });
          var res = reselect("realtimeRetry");
          if (DataClass.isRealtimeClass(res.selection.selected)) {
            machine.retryRealtime("scheduledRetry");
            startFor(res.selection.selected, { backfillFirst: true });
          }
        }
      }
      arm();
    }

    function arm() {
      if (stopped || !watchdogMs) return;
      watchdog = timers.setTimeout(tickWatchdog, watchdogMs);
    }

    /* ----------------------------------------------------------- Anzeige */

    function buildStatus() {
      var st = currentStaleness(activeClass);
      var session = currentSession();
      return DataStatus.derive({
        connection: machine.snapshot(),
        selection: selection || { selected: activeClass || DataClass.TERMINAL_CLASS },
        negotiation: negotiation,
        staleness: st,
        session: session,
        /* Ob in dieser Sitzung ueberhaupt "LIVE" stehen darf, entscheidet
           die Sitzungsrichtlinie - nicht die Anzeige. Waehrend der
           Nachboerse ohne belegte Echtzeit ist die Antwort nein, auch
           wenn Daten hereinkommen. */
        sessionAllowsLive: SessionPolicy.allowsLiveLabel(
          session.session, negotiation.capabilities || opts.capabilities || null),
        lastTimestamp: series.lastTimestamp(),
        timezone: opts.displayTimezone
      });
    }

    function publish() {
      var status = buildStatus();
      var changed = !lastStatus || lastStatus.text !== status.text ||
                    lastStatus.code !== status.code;
      lastStatus = status;
      if (changed) {
        diag.statusChanges++;
        if (typeof opts.onStatus === "function") opts.onStatus(status, api);
      }
      return status;
    }

    /* -------------------------------------------------------------- API */

    var api = {
      version: FEED_VERSION,

      /** Setzt die Historie. Vor start() aufzurufen. */
      seed: function (bars, origin) {
        var n = series.seed(bars, origin || "HISTORICAL");
        if (n) lastSuccessfulUpdate = now();
        return n;
      },

      start: function () {
        stopped = false;
        lastSession = currentSession();
        var res = reselect("start");
        startFor(res.selection.selected);
        arm();
        return api.status();
      },

      stop: function () {
        stopped = true;
        stopActiveTransport();
        if (watchdog !== null) { timers.clearTimeout(watchdog); watchdog = null; }
        return true;
      },

      /** Der Wachhund von aussen - fuer Tests mit eigener Uhr. */
      pump: function () { tickWatchdog(); return api.status(); },

      status: function () { return lastStatus || publish(); },
      bars: function () { return series.bars(); },

      /* Der Weg fuer die Chartschicht: ein Fenster statt der ganzen
         Reihe, dazu die beiden Zaehler, mit denen sich ein unveraenderter
         Stand ohne Vergleich erkennen laesst (§23). */
      tail: function (n) { return series.tail(n); },
      renderContext: function () {
        return { revision: series.revision(),
                 structuralRevision: series.structuralRevision() };
      },
      series: function () { return series; },
      selection: function () { return selection; },
      connection: function () { return machine.snapshot(); },
      machine: function () { return machine; },
      staleness: function () { return currentStaleness(activeClass); },
      activeDataClass: function () { return activeClass; },
      session: function () { return currentSession(); },

      /** §24 - Diagnose. Enthaelt keinen Schluessel und keine Kurse. */
      diagnostics: function () {
        var snap = machine.snapshot();
        var st = currentStaleness(activeClass);
        return {
          feedVersion: FEED_VERSION,
          connectionState: snap.state,
          providerCapability: negotiation.classes
            ? Object.keys(negotiation.classes).reduce(function (acc, k) {
                acc[k] = negotiation.classes[k].state; return acc;
              }, {})
            : {},
          activeDataClass: activeClass,
          selectedDataClass: selection ? selection.selected : null,
          lastRealtimeTimestamp: lastTimestampOf(["REALTIME_STREAM", "REALTIME_QUOTE"]),
          lastIntradayTimestamp: lastTimestampOf(["INTRADAY"]),
          lastEodTimestamp: lastTimestampOf(["EOD"]),
          lastSuccessfulUpdate: lastSuccessfulUpdate === null
            ? null : new Date(lastSuccessfulUpdate).toISOString(),
          fallbackReason: snap.fallbackReason || diag.lastFallbackReason,
          retryCount: snap.retryCount,
          lastError: snap.lastError || diag.lastError,
          stalenessLevel: st.level,
          ageMs: st.ageMs,
          sessionPhase: st.session ? st.session.phase : null,
          session: lastSession ? lastSession.session : null,
          sessionIsExtended: lastSession ? lastSession.isExtended : null,
          sessionRestriction: selection ? selection.sessionReason || null : null,
          mergeStats: series.stats(),
          requiresReload: series.requiresReload(),
          counters: JSON.parse(JSON.stringify(diag)),
          transportStats: Object.keys(transports).reduce(function (acc, k) {
            acc[k] = transports[k].stats ? transports[k].stats() : null; return acc;
          }, {})
        };
      },

      internalProvenance: function () {
        return DataStatus.internalProvenance({
          selection: selection, negotiation: negotiation,
          connection: machine.snapshot(), staleness: currentStaleness(activeClass),
          adjustmentStatus: series.adjustmentStatus(),
          lastTimestamp: series.lastTimestamp(),
          lastSuccessfulUpdate: lastSuccessfulUpdate
        });
      },

      publicProvenance: function (permission) {
        return DataStatus.publicProvenance({
          selection: selection, negotiation: negotiation,
          connection: machine.snapshot(), staleness: currentStaleness(activeClass),
          adjustmentStatus: series.adjustmentStatus(),
          lastTimestamp: series.lastTimestamp(),
          status: api.status()
        }, permission);
      }
    };

    function lastTimestampOf(classes) {
      var all = series.bars();
      for (var i = all.length - 1; i >= 0; i--) {
        if (classes.indexOf(all[i].dataClass) !== -1) {
          return new Date(all[i].timestamp).toISOString();
        }
      }
      return null;
    }

    return api;
  }

  var api = { FEED_VERSION: FEED_VERSION, createLiveFeed: createLiveFeed };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.Feed = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
