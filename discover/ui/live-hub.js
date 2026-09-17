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

   ZUSATZ V1: EIN STROM, WENN EINE AKTIENSEITE OFFEN IST

   Seit Zero-Cost Realtime V1 gibt es einen zweiten, freiwilligen Weg:
   live(symbol, cb). Er ist eine ERGAENZUNG, kein Ersatz.

     - Er beginnt mit demselben Snapshot wie subscribe(). Der Chart ist
       nie leer, auch wenn kein Strom zustande kommt.
     - Erst danach oeffnet er einen WebSocket zum Vision-Universe-Worker
       (EINER, fuer alle betrachteten Titel zusammen) und schreibt die
       laufende Kerze fort.
     - Faellt der Worker aus, ist abgeschaltet, nicht erreichbar oder das
       kostenlose Kontingent erschoepft, bleibt genau der Zustand
       zurueck, den es vorher gab: der Snapshot-Pfad mit seiner
       Beschriftung. Nichts wird schlechter, nichts wird stiller.

   Die Karten und der Feed benutzen ihn NICHT. Sie bleiben auf dem
   Snapshot-Pfad - hundert sichtbare Karten waeren hundert abonnierte
   Titel, und genau das ist die Rechnung, die dieses Produkt nicht
   aufmachen will.

   Was der Strom NICHT darf: behaupten, er sei ein Abschluss. Tiingos
   Stufe 6 liefert eine Kursreferenz aus einem Teilmarkt; sie heisst hier
   REALTIME_REFERENCE und nirgends "Last Trade". Und "Markt geoeffnet ·
   Live" steht nur dann, wenn der letzte Tick wirklich frisch ist -
   sonst gilt weiter die Beschriftung des Snapshots.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "discover-live-hub-1.4.0";
  var MIN_POLL_MS = 60000;
  var MAX_TIMEOUT_MS = 2147483647;

  /* Wie jung ein Tick sein muss, damit er die Beschriftung bestimmen
     darf. Ein illiquider Titel handelt minutenlang nicht - das ist kein
     Ausfall, und der Snapshot bleibt dann die Auskunft. */
  var LIVE_FRESH_MS = 90000;
  /* Wiederanlauf nach einem Abriss. Verdoppelnd, gedeckelt, und nur
     solange ueberhaupt jemand zusieht und die Boerse offen ist. */
  var LIVE_RETRY_BASE_MS = 1000;
  var LIVE_RETRY_MAX_MS = 30000;
  var LIVE_PING_MS = 25000;

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

  /* Der Strom hat seinen eigenen Zustand. Getrennt gefuehrt, damit ein
     reset() des Snapshot-Pfads ihn nicht halb stehen laesst - und damit
     man in einem Test beides einzeln ansehen kann. */
  function frischLive() {
    return {
      cfg: null, socket: null, state: "IDLE", reason: null, seit: null,
      subs: Object.create(null),        /* SYMBOL -> [cb] */
      werte: Object.create(null),       /* SYMBOL -> {price, at, o,h,l,c, receivedAt} */
      abgelehnt: Object.create(null),   /* SYMBOL -> Grund */
      angemeldet: Object.create(null),  /* was der Worker bestaetigt hat */
      hello: null, versuche: 0, retry: null, ping: null, verfall: null,
      stats: { opens: 0, closes: 0, errors: 0, messages: 0, ticks: 0, denied: 0,
               retries: 0, subscribes: 0, unsubscribes: 0, notifications: 0,
               lastMessageAt: null, lastTickAt: null }
    };
  }
  var lv = frischLive();

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
    /* Der Strom ist ein eigenes Tor. Er ist aus, solange die Auslieferung
       ihn nicht ausdruecklich einschaltet (meta.realtime.stream.available)
       - eine nicht ausgerollte Adresse waere sonst ein Verbindungsversuch
       auf jeder Aktienseite. */
    lv.cfg = (st.meta && st.meta.stream) || null;
    if (opts.socketFactory) lv.factory = opts.socketFactory;
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
      /* Ein verstecktes Fenster streamt nicht. Das ist nicht nur hoeflich:
         jede Nachricht in den Hintergrund kostet aus dem kostenlosen
         Kontingent, das jemand anderes gerade sehen will. */
      stromPflegen();
    });
    global.addEventListener("pagehide", function () { stopPolling(); stromSchliessen("pagehide"); });
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


  /* =======================================================================
     DER STROM (Zero-Cost Realtime V1, Variante C)

     Eine Verbindung je Browserfenster, nicht je Titel. Sie traegt alle
     Titel, die gerade offen sind - in der Regel einen.
     ======================================================================= */

  function stromKonfig() { return lv.cfg || {}; }
  function frischMs() { return stromKonfig().freshSeconds ? stromKonfig().freshSeconds * 1000 : LIVE_FRESH_MS; }
  function stromFabrik() { return lv.factory || global.WebSocket || null; }

  /** Ist der Strom ueberhaupt vorgesehen? (Konfiguration, nicht Lage.) */
  function stromVerfuegbar() {
    var c = stromKonfig();
    return !!(st.enabled && c.available === true && c.url && stromFabrik());
  }

  function marktOffen() {
    if (!st.enabled || !TS()) return false;
    var r = resolution();
    return !!(r && r.marketState === "OPEN");
  }

  function stromSymbole() { return Object.keys(lv.subs).filter(function (k) { return lv.subs[k].length; }); }

  /**
   * Soll gerade eine Verbindung bestehen?
   *
   * Vier Bedingungen, und jede einzelne ist ein Grund, es zu lassen:
   * niemand sieht zu, das Fenster ist versteckt, die Boerse ist zu, oder
   * der Strom ist gar nicht eingerichtet. Nur wenn alle vier dafuer
   * sprechen, wird verbunden.
   */
  function stromGewuenscht() {
    return stromVerfuegbar() && st.visible && marktOffen() && stromSymbole().length > 0;
  }

  function setzeStrom(zustand, grund) {
    if (lv.state === zustand && lv.reason === (grund || null)) return;
    lv.state = zustand;
    lv.reason = grund || null;
    if (zustand === "OPEN") lv.seit = st.now().toISOString();
    stromSymbole().forEach(meldeStrom);
  }

  function stromPflegen() {
    if (!stromGewuenscht()) {
      if (lv.socket || lv.retry) stromSchliessen(marktOffen() ? "idle" : "marketClosed");
      return;
    }
    if (!lv.socket && !lv.retry) stromOeffnen();
    else if (lv.state === "OPEN") stromAbgleichen();
  }

  function stromOeffnen() {
    var Sock = stromFabrik();
    if (!Sock) return;
    setzeStrom("CONNECTING", null);
    var ws;
    try { ws = new Sock(stromKonfig().url); }
    catch (err) { lv.stats.errors++; stromWiederholen("connectFailed"); return; }
    lv.socket = ws;
    lv.angemeldet = Object.create(null);

    ws.onopen = function () {
      lv.stats.opens++;
      lv.versuche = 0;
      setzeStrom("OPEN", null);
      stromAbgleichen();
      stromPing();
    };
    ws.onmessage = function (ev) {
      lv.stats.messages++;
      lv.stats.lastMessageAt = st.now().toISOString();
      var n = null;
      try { n = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch (e) { return; }
      if (n) stromNachricht(n);
    };
    ws.onerror = function () { lv.stats.errors++; };
    ws.onclose = function (ev) {
      lv.stats.closes++;
      lv.socket = null;
      stromPingAus();
      /* Ein Abriss ist kein Fehler des Nutzers und keine Meldung wert -
         aber er darf nicht als "live" durchgehen. Der Snapshot-Pfad
         laeuft ohnehin weiter; er wird jetzt wieder die Auskunft. */
      if (stromGewuenscht()) stromWiederholen((ev && ev.code === 1000) ? "closed" : "disconnected");
      else setzeStrom("IDLE", lv.reason);
    };
  }

  function stromWiederholen(grund) {
    setzeStrom("RECONNECTING", grund);
    if (lv.retry) return;
    var ms = Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * Math.pow(2, lv.versuche));
    lv.versuche++;
    lv.stats.retries++;
    lv.retry = global.setTimeout(function () {
      lv.retry = null;
      if (stromGewuenscht()) stromOeffnen();
      else setzeStrom("IDLE", null);
    }, ms);
  }

  function stromSchliessen(grund) {
    if (lv.retry) { global.clearTimeout(lv.retry); lv.retry = null; }
    if (lv.verfall) { global.clearTimeout(lv.verfall); lv.verfall = null; }
    stromPingAus();
    var ws = lv.socket;
    lv.socket = null;
    lv.angemeldet = Object.create(null);
    if (ws) { try { ws.close(1000, "vu"); } catch (e) { /* schon zu */ } }
    setzeStrom("IDLE", grund || null);
  }

  function stromPing() {
    stromPingAus();
    lv.ping = global.setInterval(function () {
      if (lv.socket && lv.state === "OPEN") stromSenden({ op: "ping" });
    }, LIVE_PING_MS);
  }
  function stromPingAus() { if (lv.ping) { global.clearInterval(lv.ping); lv.ping = null; } }

  function stromSenden(objekt) {
    if (!lv.socket) return false;
    try { lv.socket.send(JSON.stringify(objekt)); return true; }
    catch (err) { lv.stats.errors++; return false; }
  }

  /** Was fehlt, nachmelden; was niemand mehr ansieht, abmelden. */
  function stromAbgleichen() {
    if (lv.state !== "OPEN") return;
    var will = stromSymbole();
    var neu = will.filter(function (s2) { return !lv.angemeldet[s2]; });
    var weg = Object.keys(lv.angemeldet).filter(function (s2) { return will.indexOf(s2) === -1; });
    if (neu.length) { stromSenden({ op: "subscribe", symbols: neu }); neu.forEach(function (s2) { lv.angemeldet[s2] = true; }); }
    if (weg.length) { stromSenden({ op: "unsubscribe", symbols: weg }); weg.forEach(function (s2) { delete lv.angemeldet[s2]; }); }
  }

  function stromNachricht(n) {
    if (n.op === "u" && Array.isArray(n.v)) {
      var jetzt = st.now().getTime();
      var betroffen = [];
      n.v.forEach(function (z) {
        if (!Array.isArray(z) || z.length < 2) return;
        var sym = String(z[0]).toUpperCase();
        lv.werte[sym] = { price: z[1], at: z[2] || jetzt, open: z[3], high: z[4], low: z[5], close: z[6],
                          receivedAt: jetzt };
        delete lv.abgelehnt[sym];
        lv.stats.ticks++;
        betroffen.push(sym);
      });
      lv.stats.lastTickAt = new Date(jetzt).toISOString();
      betroffen.forEach(meldeStrom);
      planeVerfall();
      return;
    }
    if (n.op === "hello") { lv.hello = n; return; }
    if (n.op === "denied") {
      lv.stats.denied++;
      var sym2 = String(n.symbol || "").toUpperCase();
      lv.abgelehnt[sym2] = n.reason || "denied";
      delete lv.angemeldet[sym2];
      meldeStrom(sym2);
      return;
    }
    if (n.op === "budget") {
      /* Das Kontingent ist der Grund, warum dieses Produkt nichts
         kostet. Ist die Schutzschwelle erreicht, wird zurueckgefallen -
         nicht weitergestreamt und nicht abgerechnet.

         PROTECT und nicht erst EXHAUSTED: zwischen 85 und 100 Prozent
         waere der Strom zwar noch moeglich, aber sein Ende dann ein
         Abbruch mitten im Handel statt eines geordneten Rueckfalls. */
      if (n.verdict === "PROTECT" || n.verdict === "EXHAUSTED") {
        stromSchliessen(n.verdict === "PROTECT" ? "budgetProtect" : "budgetExhausted");
      }
      return;
    }
    if (n.op === "session") {
      if (n.session !== "REGULAR") stromSchliessen("marketClosed");
      else stromPflegen();
      return;
    }
    if (n.op === "status") {
      if (n.state && n.state !== "LIVE") setzeStrom(lv.socket ? "DEGRADED" : "IDLE", n.reason || null);
      else if (lv.socket) setzeStrom("OPEN", null);
      return;
    }
    if (n.op === "subscribed" && Array.isArray(n.symbols)) {
      lv.angemeldet = Object.create(null);
      n.symbols.forEach(function (s2) { lv.angemeldet[String(s2).toUpperCase()] = true; });
    }
  }

  /**
   * Der Befund zum Strom fuer genau einen Titel - und, wenn er frisch
   * genug ist, die daraus abgeleitete Beschriftung.
   *
   * Der Snapshot wird dabei NICHT angefasst. Beurteilt wird eine
   * abgeleitete Sicht, deren Stand der Tick ist; das Original bleibt das
   * Original, und wer beides vergleichen will, findet die urspruengliche
   * Bewertung unter snapshotFreshness.
   */
  function anreichern(p, sym) {
    var w = lv.werte[sym] || null;
    var alter = w ? (st.now().getTime() - w.receivedAt) : null;
    var offen = !!(p.resolution && p.resolution.marketState === "OPEN");
    var frisch = !!(w && offen && alter !== null && alter <= frischMs());
    p.live = {
      available: stromVerfuegbar(),
      state: lv.state,
      reason: lv.abgelehnt[sym] || lv.reason || null,
      fresh: frisch,
      price: w ? w.price : null,
      at: w ? new Date(w.at).toISOString() : null,
      ageMs: alter,
      open: w ? w.open : null, high: w ? w.high : null, low: w ? w.low : null, close: w ? w.close : null,
      /* Stufe 6 von Tiingo ist eine Kursreferenz aus einem Teilmarkt.
         Kein Abschluss, kein offizieller Schlusskurs - und hier steht
         es, damit es niemand woanders erfinden muss. */
      priceType: "REALTIME_REFERENCE",
      source: "TIINGO_IEX_LEVEL6",
      note: "Kursreferenz aus einem Teilmarkt (IEX). Kein offizieller Abschluss."
    };
    if (frisch && p.snapshot) {
      var sicht = {};
      Object.keys(p.snapshot).forEach(function (k) { sicht[k] = p.snapshot[k]; });
      sicht.asOf = p.live.at;
      sicht.lastBarTimestamp = p.live.at;
      var fr = freshness(sicht, p.resolution);
      if (fr) {
        p.snapshotFreshness = p.freshness;
        p.freshness = fr;
        if (fr.label) {
          p.label = fr.label;
          if (!p.label.timezoneNote) p.label.timezoneNote = "Uhrzeiten in New Yorker Zeit";
        }
      }
    }
    return p;
  }

  /**
   * Ein Etikett, das "Live" sagt, muss sich selbst widerrufen koennen.
   *
   * Ohne das bliebe "Markt geoeffnet · Live" stehen, bis der
   * Snapshot-Pfad das naechste Mal nachfragt - bei einem abgerissenen
   * Strom also minutenlang. Der Zeitgeber laeuft genau bis zu dem
   * Moment, in dem der juengste Tick zu alt wird, und meldet dann neu.
   */
  function planeVerfall() {
    if (lv.verfall) { global.clearTimeout(lv.verfall); lv.verfall = null; }
    var syms = stromSymbole();
    if (!syms.length) return;
    var juengster = 0;
    syms.forEach(function (s2) {
      var w = lv.werte[s2];
      if (w && w.receivedAt > juengster) juengster = w.receivedAt;
    });
    if (!juengster) return;
    var rest = juengster + frischMs() - st.now().getTime();
    lv.verfall = global.setTimeout(function () {
      lv.verfall = null;
      stromSymbole().forEach(meldeStrom);
      planeVerfall();
    }, Math.max(250, rest + 250));
  }

  function meldeStrom(sym) {
    var liste = lv.subs[sym];
    if (!liste || !liste.length) return;
    /* Solange weder Snapshot noch Tick vorliegen, gibt es nichts zu
       sagen - und eine Meldung mit leerem Snapshot waere genau der
       leere Chart, den V1 ausschliesst. Der Snapshot-Pfad meldet sich
       von selbst, sobald er da ist. */
    if (!peek(sym) && !lv.werte[sym]) return;
    var p = anreichern(payload(sym, peek(sym)), sym);
    liste.slice().forEach(function (cb) { lv.stats.notifications++; cb(p); });
  }

  /**
   * Abonniert einen Titel MIT Strom - fuer die Aktienseite.
   *
   * Der Rueckruf bekommt zuerst den Snapshot (wie subscribe()), danach
   * jede Aenderung: neuer Snapshot, neuer Tick, neue Lage des Stroms.
   * Kommt kein Strom zustande, verhaelt sich das hier wie subscribe() -
   * dieselben Daten, dieselbe Beschriftung, nur ein zusaetzliches Feld
   * live, das die Lage benennt.
   *
   * @returns {function} kuendigen
   */
  function live(symbol, cb) {
    var sym = String(symbol || "").trim().toUpperCase();
    if (!sym) return function () {};
    var liste = lv.subs[sym] || (lv.subs[sym] = []);
    liste.push(cb);
    lv.stats.subscribes++;

    /* Der Boden zuerst: derselbe Snapshot-Pfad wie ueberall sonst. */
    var abSnapshot = subscribe(sym, function (p) { cb(anreichern(p, sym)); });
    stromPflegen();

    return function () {
      abSnapshot();
      var i = liste.indexOf(cb);
      if (i !== -1) { liste.splice(i, 1); lv.stats.unsubscribes++; }
      if (!liste.length) {
        delete lv.subs[sym];
        delete lv.werte[sym];
        delete lv.abgelehnt[sym];
        if (lv.state === "OPEN") stromAbgleichen();
      }
      stromPflegen();
    };
  }

  var api = {
    MODULE_VERSION: MODULE_VERSION,
    init: init,
    enabled: function () { return st.enabled; },
    subscribe: subscribe, prefetch: prefetch, peek: peek, entryFor: entryFor, resolveEntry: resolveEntry,
    /* Der Strom. Alles darunter ist Auskunft, nichts davon Steuerung -
       ausser liveClose(), das ein Test oder ein Seitenwechsel braucht. */
    live: live,
    liveAvailable: stromVerfuegbar,
    liveWanted: stromGewuenscht,
    liveState: function () {
      return { state: lv.state, reason: lv.reason, since: lv.seit, url: (lv.cfg && lv.cfg.url) || null,
               symbols: stromSymbole(), subscribed: Object.keys(lv.angemeldet),
               hello: lv.hello, connected: !!lv.socket };
    },
    liveValue: function (symbol) { return lv.werte[String(symbol || "").toUpperCase()] || null; },
    liveClose: stromSchliessen,
    liveStats: function () {
      var out = {};
      Object.keys(lv.stats).forEach(function (k) { out[k] = lv.stats[k]; });
      out.state = lv.state; out.reason = lv.reason;
      out.symbols = stromSymbole().length;
      out.connected = !!lv.socket;
      return out;
    },
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
    reset: function () {
      stopPolling();
      stromSchliessen("reset");
      var fabrik = lv.factory;
      lv = frischLive();
      lv.factory = fabrik;
      st = fresh();
    }
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.LiveHub = api;
})(window);
