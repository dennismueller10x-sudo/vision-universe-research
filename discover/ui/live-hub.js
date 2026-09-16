/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/live-hub.js

   EIN STROM JE TITEL - UND NUR FUER DAS, WAS MAN SIEHT

   Die Eingangsflaeche, die Karten und die Aktienseite zeigen denselben
   Tagesverlauf. Sie holen ihn nicht dreimal: dieser Hub haelt je Titel
   und Sitzung genau einen Snapshot (quant/data/market/intraday/), teilt
   ihn an alle Abonnenten aus und erneuert ihn, solange die Boerse offen
   ist und die Seite sichtbar.

   Was "live" auf GitHub Pages heisst: kein WebSocket, kein Server, kein
   Schluessel im Browser (docs/TIINGO_LIVE_ARCHITECTURE.md). Ein Workflow
   holt die Snapshots im Sitzungstakt (development-preview.json,
   intraday.refreshMinutes); der Hub fragt in demselben Takt nach, ob es
   einen neueren Stand gibt - erst das Verzeichnis (eine kleine Datei),
   dann nur die Snapshots, deren Stand sich geaendert hat. Die Karte
   nennt den Stand mit Uhrzeit. Nichts wird animiert, nichts
   fortgeschrieben, nichts interpoliert.

   Abonnements haengen an der Sichtbarkeit: eine Karte abonniert, wenn sie
   in den Bildschirm kommt, und kuendigt, wenn sie ihn verlaesst. Ohne
   Abonnenten laeuft kein Timer; ein verstecktes Fenster haelt an.
   Das ist die Antwort auf "keine 7.000 Streams": es gibt nie mehr
   Abonnements als Karten im Bild.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "discover-live-hub-1.3.0";
  var MIN_POLL_MS = 60000;
  var MAX_TIMEOUT_MS = 2147483647;

  function fresh() {
    return {
      enabled: false, meta: null, calendar: null, now: function () { return new Date(); },
      index: null, indexPromise: null,
      snapshots: Object.create(null), inflight: Object.create(null), subs: Object.create(null),
      timer: null, rollover: null, visible: true, bound: false,
      stats: { indexLoads: 0, snapshotRequests: 0, snapshotHits: 0, refreshes: 0, notifications: 0,
               subscriptions: 0, unsubscriptions: 0, failures: 0, rollovers: 0 }
    };
  }
  var st = fresh();

  function TS() { return global.VURealtime && global.VURealtime.TradingSession; }
  function Snap() { return global.VURealtime && global.VURealtime.IntradaySnapshot; }
  function FR() { return global.VURealtime && global.VURealtime.Freshness; }

  function laden(path, frisch) {
    var f = st.fetch || global.fetch;
    return f(path, { cache: frisch ? "no-cache" : "default" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
      return r.json();
    });
  }

  /**
   * @param {object} opts {realtime: meta.realtime, calendar, now, fetch}
   */
  function init(opts) {
    opts = opts || {};
    st.meta = opts.realtime || null;
    st.calendar = opts.calendar || null;
    if (opts.now) st.now = opts.now;
    if (opts.fetch) st.fetch = opts.fetch;
    st.enabled = !!(st.meta && st.meta.available === true && st.meta.intraday && st.meta.intraday.index && TS() && Snap());
    bind();
    return api;
  }

  function bind() {
    if (st.bound || !global.document || !global.document.addEventListener) return;
    st.bound = true;
    global.document.addEventListener("visibilitychange", function () {
      st.visible = global.document.visibilityState !== "hidden";
      if (st.visible) { if (anySubs()) { tick(); startPolling(); } }
      else stopPolling();
    });
    global.addEventListener("pagehide", function () { stopPolling(); });
  }

  function resolution() { return TS().resolve(st.now(), { calendar: st.calendar }); }
  function anySubs() {
    var keys = Object.keys(st.subs);
    for (var i = 0; i < keys.length; i++) if (st.subs[keys[i]].length) return true;
    return false;
  }
  function subscriberCount() {
    return Object.keys(st.subs).reduce(function (n, k) { return n + st.subs[k].length; }, 0);
  }

  /** Das Verzeichnis: welche Titel haben fuer welche Sitzung einen Snapshot. */
  function loadIndex(frisch) {
    if (!st.enabled) return Promise.resolve(null);
    if (st.index && !frisch) return Promise.resolve(st.index);
    if (st.indexPromise) return st.indexPromise;
    st.stats.indexLoads++;
    st.indexPromise = laden(st.meta.intraday.index, !!frisch).then(function (idx) {
      st.index = idx && idx.entries ? idx : { entries: {}, sessions: {}, missing: true };
      st.indexPromise = null;
      return st.index;
    }).catch(function () {
      st.stats.failures++;
      st.indexPromise = null;
      /* Ohne Verzeichnis gibt es keine Snapshots - und keinen Fehler auf
         der Karte: sie zeigt dann die Tagesreihe. */
      if (!st.index) st.index = { entries: {}, sessions: {}, missing: true };
      return st.index;
    });
    return st.indexPromise;
  }

  function entryFor(symbol) {
    return st.index && st.index.entries ? (st.index.entries[symbol] || null) : null;
  }

  /* Titel ausserhalb des Discover-Umfangs (Aktienseite, Kategorie): das
     Verzeichnis fuehrt sie nur als Kuerzel je Sitzung; der Eintrag wird
     aus Sitzung, Muster und Ausnahmen gebaut - ohne Abruf, ohne 404. */
  function resolveEntry(symbol) {
    var e = entryFor(symbol);
    if (e || !st.index || !st.index.available) return e;
    var dates = Object.keys(st.index.available).sort();
    for (var i = dates.length - 1; i >= 0; i--) {
      var liste = st.index.available[dates[i]];
      if (liste && liste.indexOf(symbol) !== -1) {
        var id = (st.index.idExceptions && st.index.idExceptions[symbol]) ||
                 String(st.index.idPattern || "ref_<symbol>").replace("<symbol>", symbol);
        var path = String(st.index.pathPattern || "/quant/data/market/intraday/<sessionDate>/<securityId>.json")
          .replace("<sessionDate>", dates[i]).replace("<securityId>", id);
        return { securityId: id, sessionDate: dates[i], asOf: null, asOfLocal: null, points: null,
                 regularComplete: null, path: path, derived: true };
      }
    }
    return null;
  }

  function loadSnapshot(path, frisch) {
    if (st.snapshots[path] && !frisch) { st.stats.snapshotHits++; return Promise.resolve(st.snapshots[path]); }
    if (st.inflight[path]) return st.inflight[path];
    st.stats.snapshotRequests++;
    st.inflight[path] = laden(path, !!frisch).then(function (snap) {
      delete st.inflight[path];
      var v = Snap().validate(snap);
      if (!v.ok) throw new Error("Snapshot abgelehnt: " + v.findings[0]);
      var prev = st.snapshots[path];
      var m = prev ? Snap().merge(prev, snap) : { chosen: snap };
      st.snapshots[path] = m.chosen;
      return m.chosen;
    }).catch(function (err) {
      delete st.inflight[path];
      st.stats.failures++;
      throw err;
    });
    return st.inflight[path];
  }

  /* Der Freshness-Vertrag (quant/engines/realtime/freshness.js) entscheidet,
     ob ein Snapshot der Stand ist, den er behauptet: LIVE, LAST_SESSION,
     STALE oder UNAVAILABLE - und liefert die Beschriftung. Ein Snapshot vom
     Freitag heisst am Dienstag "Stand Fr., 11.09. · nicht aktuell", nicht
     "Letzter Handelstag · Freitag". Ohne den Vertrag (aeltere Seite) bleibt
     die Beschriftung des Resolvers. */
  function freshness(snap, r) {
    if (!FR()) return null;
    var cfg = st.meta && st.meta.intraday ? st.meta.intraday : {};
    var f = cfg.freshness || {};
    return FR().assess({ resolution: r, series: snap || null, kind: "intraday", now: st.now(), calendar: st.calendar,
                         options: { refreshMinutes: cfg.refreshMinutes || 10, graceMinutes: f.graceMinutes, graceHours: f.graceHours } });
  }

  function payload(symbol, snap) {
    var r = resolution();
    var fr = freshness(snap, r);
    var label = fr ? fr.label : (snap ? TS().describe(r, snap) : TS().describe(r, null));
    if (fr && label && !label.timezoneNote) label.timezoneNote = "Uhrzeiten in New Yorker Zeit";
    return { symbol: symbol, snapshot: snap || null, resolution: r, freshness: fr,
             label: label, entry: resolveEntry(symbol) };
  }

  function deliver(symbol, cb) {
    var e = resolveEntry(symbol);
    if (!e) { cb(payload(symbol, null)); return; }
    loadSnapshot(e.path, false).then(function (s) {
      st.stats.notifications++;
      cb(payload(symbol, s));
    }).catch(function () { cb(payload(symbol, null)); });
  }

  /**
   * Abonniert den Tagesverlauf eines Titels. Der Rueckruf bekommt sofort,
   * was da ist (oder null), und danach jede Aenderung.
   * @returns {function} kuendigen
   */
  function subscribe(symbol, cb) {
    if (!st.enabled) { cb({ symbol: symbol, snapshot: null, resolution: null, label: null, entry: null }); return function () {}; }
    st.stats.subscriptions++;
    (st.subs[symbol] = st.subs[symbol] || []).push(cb);
    loadIndex(false).then(function () {
      if (st.subs[symbol] && st.subs[symbol].indexOf(cb) !== -1) deliver(symbol, cb);
    });
    startPolling();
    return function () {
      var l = st.subs[symbol];
      if (!l) return;
      var i = l.indexOf(cb);
      if (i !== -1) { l.splice(i, 1); st.stats.unsubscriptions++; }
      if (!l.length) delete st.subs[symbol];
      if (!anySubs()) stopPolling();
    };
  }

  /** Vorladen ohne Abonnement: die naechste Karte beim Wischen. */
  function prefetch(symbol) {
    if (!st.enabled) return;
    loadIndex(false).then(function () {
      var e = resolveEntry(symbol);
      if (e && !st.snapshots[e.path] && !st.inflight[e.path]) loadSnapshot(e.path, false).catch(function () {});
    });
  }

  function peek(symbol) {
    var e = resolveEntry(symbol);
    return e && st.snapshots[e.path] ? st.snapshots[e.path] : null;
  }

  /* Wann lohnt sich Nachfragen? Nur bei offener Boerse - oder wenn das
     Verzeichnis dem Kalender hinterherhinkt (die Sitzung ist gerade
     gewechselt oder eben zu Ende gegangen, der Workflow holt noch auf). */
  function shouldPoll() {
    if (!st.enabled || !st.visible || !anySubs()) return false;
    var r = resolution();
    if (r.marketState === "OPEN") return true;
    var ds = r.displaySession, idx = st.index && st.index.displaySession;
    if (ds && idx && idx.sessionDate) {
      if (idx.sessionDate < ds.sessionDate) return true;
      if (idx.sessionDate === ds.sessionDate && !idx.isComplete && ds.isComplete) return true;
    }
    /* Das Verzeichnis kennt die letzte abgeschlossene Sitzung nicht (der
       Workflow holt nach, oder er ist ausgefallen): nachfragen, damit die
       Seite den Nachzug ohne Neuladen bekommt. */
    var last = r.lastCompletedSession, idxLast = st.index && st.index.lastCompletedSession;
    if (last && idxLast && idxLast.sessionDate && idxLast.sessionDate < last.sessionDate) return true;
    return false;
  }

  function tick() {
    if (!shouldPoll()) { stopInterval(); return Promise.resolve(false); }
    st.stats.refreshes++;
    return loadIndex(true).then(function () {
      var jobs = [];
      Object.keys(st.subs).forEach(function (sym) {
        var e = resolveEntry(sym);
        if (!e) return;
        var cached = st.snapshots[e.path];
        /* Abgeleitete Eintraege tragen keinen Stand: nachgefragt wird dort
           nur, wenn der Pfad noch nicht geladen ist. */
        if (cached && (e.derived || (cached.asOf === e.asOf && cached.regularComplete === !!e.regularComplete))) return;
        jobs.push(loadSnapshot(e.path, true).then(function (s) {
          (st.subs[sym] || []).slice().forEach(function (cb) { st.stats.notifications++; cb(payload(sym, s)); });
        }).catch(function () {}));
      });
      return Promise.all(jobs).then(function () { return true; });
    });
  }

  /* Der Sitzungswechsel um 09:30 (und der Schluss um 16:00) aendern die
     Beschriftung, auch wenn kein neuer Snapshot kommt: "Letzter
     Handelstag · Freitag" wird zu "Heute". Ein Zeitgeber auf die
     naechste Grenze, neu gestellt nach jedem Wechsel. */
  function scheduleRollover() {
    if (st.rollover) { global.clearTimeout(st.rollover); st.rollover = null; }
    if (!st.enabled || !anySubs()) return;
    var r = resolution();
    if (!r.nextChangeAt) return;
    var ms = Math.min(MAX_TIMEOUT_MS, Math.max(1000, Date.parse(r.nextChangeAt) - st.now().getTime() + 1000));
    st.rollover = global.setTimeout(function () {
      st.rollover = null;
      st.stats.rollovers++;
      Object.keys(st.subs).forEach(function (sym) {
        var snap = peek(sym);
        (st.subs[sym] || []).slice().forEach(function (cb) { st.stats.notifications++; cb(payload(sym, snap)); });
      });
      tick();
      startPolling();
    }, ms);
  }

  /* Der Takt laeuft nur, wenn Nachfragen etwas bringen kann (shouldPoll);
     sonst gibt es keinen Timer - bei geschlossener Boerse fragt niemand
     alle zehn Minuten nach einem Stand, der sich nicht aendert. Der
     Sitzungswechsel (scheduleRollover) startet ihn wieder. */
  function startPolling() {
    if (!st.enabled) return;
    scheduleRollover();
    if (st.timer || !shouldPoll()) return;
    /* V4.1 §4: bei offener Boerse alle drei Minuten nachfragen (die
       Auslieferung kommt alle ~6 Minuten; wer die Seite offen hat, sieht
       den neuen Stand innerhalb weniger Minuten statt erst nach zehn).
       Das Verzeichnis ist ein Abruf mit Revalidierung, kein Datenstrom. */
    var minuten = st.meta.intraday.refreshMinutes || 10;
    var r = resolution();
    if (r && r.marketState === "OPEN") minuten = Math.min(minuten, 3);
    var ms = Math.max(MIN_POLL_MS, minuten * 60000);
    st.timer = global.setInterval(function () { tick(); }, ms);
  }
  function stopInterval() {
    if (st.timer) { global.clearInterval(st.timer); st.timer = null; }
  }
  function stopPolling() {
    stopInterval();
    if (st.rollover) { global.clearTimeout(st.rollover); st.rollover = null; }
  }

  var api = {
    MODULE_VERSION: MODULE_VERSION,
    init: init,
    enabled: function () { return st.enabled; },
    subscribe: subscribe, prefetch: prefetch, peek: peek, entryFor: entryFor, resolveEntry: resolveEntry,
    loadIndex: loadIndex, resolution: function () { return st.enabled ? resolution() : null; },
    describe: function (snap) {
      if (!TS()) return null;
      var r = resolution(), fr = freshness(snap || null, r);
      return fr ? fr.label : TS().describe(r, snap || null);
    },
    freshness: function (snap) { return st.enabled ? freshness(snap || null, resolution()) : null; },
    index: function () { return st.index; },
    tick: tick, shouldPoll: shouldPoll,
    stats: function () {
      var out = {};
      Object.keys(st.stats).forEach(function (k) { out[k] = st.stats[k]; });
      out.polling = !!st.timer; out.subscribers = subscriberCount();
      out.subscribedSymbols = Object.keys(st.subs).length;
      out.cachedSnapshots = Object.keys(st.snapshots).length;
      return out;
    },
    reset: function () { stopPolling(); st = fresh(); }
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.LiveHub = api;
})(window);
