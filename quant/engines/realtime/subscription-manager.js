/* =========================================================================
   VISION UNIVERSE — realtime/subscription-manager.js

   EINE Anbieterverbindung, viele Zuschauer.

   DAS PROBLEM

   Hundert Leute sehen NVDA an. Naiv gebaut sind das hundert Abonnements
   beim Anbieter - hundertmal dieselbe Zahl, hundertmal bezahlt. Diese
   Datei macht daraus eines: sie zaehlt mit, wer welches Symbol gerade
   braucht, und haelt die Tickerliste der EINEN Verbindung genau so gross
   wie noetig.

   Der Firehose-Nachweis vom 16.09.2026 hat gezeigt, warum das nicht nur
   sparsam, sondern notwendig ist: das ganze Band sind 1.022 Ereignisse
   je Sekunde, und das kostenlose Kontingent traegt 85. Die Tickerliste
   auf Stufe 6 ist gemessen - eine Anmeldung mit ["NVDA"] lieferte
   ausschliesslich NVDA. Also wird abonniert, was jemand ansieht, und
   sonst nichts.

   ZWEI BETRIEBSARTEN, UND WARUM BEIDE EXISTIEREN

     dynamic     Die offene Verbindung nimmt Nachmeldungen entgegen.
                 Ein Titelwechsel kostet eine Nachricht.
     reconnect   Sie tut es nicht. Ein Titelwechsel kostet einen
                 Neuaufbau mit der neuen Liste.

   Welche gilt, ist eine MESSUNG und keine Annahme (§1 des Auftrags vom
   17.09.2026). Solange sie aussteht, laeuft der Manager in "reconnect" -
   der Modus, der immer funktioniert. Faellt die Messung guenstig aus,
   ist es ein Schalter und kein Umbau.

   WAS DIESE DATEI NICHT TUT

   Sie kennt keinen Anbieter, keinen Schluessel, kein Cloudflare und kein
   WebSocket. Sie bekommt eine Verbindung (link) hineingereicht, so wie
   transport.js seinen Verbindungsaufbau hineingereicht bekommt. Damit
   laesst sie sich in Node vollstaendig pruefen: Grace Period, Ausfall,
   Budgetgrenze und Titelwechsel in Millisekunden statt in Boersentagen.

   Sie entscheidet auch nicht, ob etwas angezeigt werden darf. Das bleibt
   bei data-status.js und freshness.js - ein zweiter Ort, an dem "LIVE"
   entstehen kann, waere genau der Ort, an dem es irgendwann faelschlich
   entsteht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "subscription-manager-1.0.0";

  /* Wie lange ein Symbol nach dem letzten Zuschauer noch abonniert
     bleibt. Wer eine Aktienseite schliesst und zehn Sekunden spaeter
     zurueckkommt, soll nicht auf einen Verbindungsaufbau warten - und
     ein Abonnement, das im Sekundentakt kommt und geht, kostet mehr
     Nachrichten als eines, das eine Minute stehen bleibt. */
  var DEFAULT_GRACE_MS = 60000;
  /* Mehrere Aenderungen in kurzer Folge werden zu einer zusammengefasst.
     Beim Durchwischen des Feeds sind das sonst zwanzig Neuaufbauten in
     zwanzig Sekunden. */
  var DEFAULT_SETTLE_MS = 400;

  var MODES = ["dynamic", "reconnect"];

  function noop() {}

  function defaultTimers() {
    return {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { return clearTimeout(id); },
      now: function () { return Date.now(); }
    };
  }

  function normSymbol(s) { return String(s || "").trim().toUpperCase(); }

  /**
   * @param {object} opts
   *   link      Pflicht. Die eine Anbieterverbindung:
   *               open(tickers, handlers)   -> void, ruft handlers.onOpen/onTick/...
   *               update(add, remove)       -> true, wenn die offene Verbindung
   *                                            die Aenderung uebernommen hat;
   *                                            false, wenn nicht (dann Neuaufbau)
   *               close()                   -> void
   *               isOpen()                  -> boolean
   *   mode      "dynamic" | "reconnect"  (Standard: "reconnect")
   *   graceMs   Nachlauf je Symbol (Standard 60 s)
   *   settleMs  Sammelfenster fuer Aenderungen (Standard 400 ms)
   *   maxSymbols  harte Obergrenze; darueber wird abgelehnt statt gekauft
   *   budget    optional: { mayAdd(symbol, aktiveAnzahl) -> {allow, verdict, reason} }
   *   session   optional: () -> "REGULAR"|"PRE"|"AFTER"|"CLOSED"|... ;
   *             ausserhalb der erlaubten Sitzungen wird nicht verbunden
   *   allowedSessions  Standard ["REGULAR"]
   *   timers    fuer Tests
   *   onTick(tick)      ein Kursereignis, bereits geparst
   *   onStatus(status)  jede Zustandsaenderung des Managers
   */
  function create(opts) {
    opts = opts || {};
    var link = opts.link;
    if (!link || typeof link.open !== "function") {
      throw new Error("subscription-manager: ohne link gibt es nichts zu verwalten.");
    }
    var timers = opts.timers || defaultTimers();
    var graceMs = opts.graceMs === undefined ? DEFAULT_GRACE_MS : opts.graceMs;
    var settleMs = opts.settleMs === undefined ? DEFAULT_SETTLE_MS : opts.settleMs;
    var maxSymbols = opts.maxSymbols === undefined ? 50 : opts.maxSymbols;
    var mode = MODES.indexOf(opts.mode) === -1 ? "reconnect" : opts.mode;
    var budget = opts.budget || null;
    var sessionOf = typeof opts.session === "function" ? opts.session : null;
    var allowedSessions = opts.allowedSessions || ["REGULAR"];
    var onTick = opts.onTick || noop;
    var onStatus = opts.onStatus || noop;

    /* symbol -> { clients:Set, expiresAt:null|number } */
    var eintraege = new Map();
    /* Was beim Anbieter TATSAECHLICH angemeldet ist. Getrennt von den
       Eintraegen gefuehrt, und das ist kein Luxus: laeuft der Nachlauf
       eines Titels ab, verschwindet sein Eintrag - die Anmeldung beim
       Anbieter besteht dann aber weiter, und ohne dieses Set wuesste
       niemand mehr, dass sie abzubestellen ist. Genau dieser Fehler ist
       im ersten Entwurf passiert: der Titel blieb stumm abonniert. */
    var angemeldet = new Set();
    /* clientId -> Set<symbol>, damit ein Abbruch alles auf einmal loesen kann */
    var proClient = new Map();

    var settleTimer = null;
    var graceTimer = null;
    /* Womit zuletzt geoeffnet wurde - erst die Bestaetigung des Links
       macht daraus eine Anmeldung. */
    var zuletztGeoeffnet = [];
    var zustand = "IDLE";         /* IDLE | CONNECTING | LIVE | DEGRADED | BLOCKED */
    var letzterGrund = null;
    /* Warum der Modus heute so ist, wie er ist. Das haftet am Modus und
       nicht am Zustand: ein Zustandswechsel eine Zeile spaeter wuerde die
       Auskunft sonst ueberschreiben, und dann waere nicht mehr zu sehen,
       dass der Anbieter die Nachmeldung abgelehnt hat. */
    var modusGrund = null;
    var stats = {
      acquires: 0, releases: 0, opens: 0, closes: 0, updates: 0,
      reconnects: 0, ticks: 0, refusedByBudget: 0, refusedByLimit: 0,
      graceExpiries: 0, providerErrors: 0, lastOpenAt: null, lastChangeAt: null
    };

    function sessionErlaubt() {
      if (!sessionOf) return true;
      var s = sessionOf();
      return allowedSessions.indexOf(s) !== -1;
    }

    /* Die Symbole, die der Anbieter gerade liefern soll: alles mit
       Zuschauern, plus alles, dessen Nachlauf noch laeuft. */
    function gewuenschteSymbole() {
      var raus = [];
      eintraege.forEach(function (e, sym) {
        if (e.clients.size > 0 || e.expiresAt !== null) raus.push(sym);
      });
      raus.sort();
      return raus;
    }
    function liveSymbole() {
      var raus = [];
      angemeldet.forEach(function (sym) { raus.push(sym); });
      raus.sort();
      return raus;
    }

    function setzeZustand(neu, grund) {
      if (zustand === neu && letzterGrund === grund) return;
      zustand = neu;
      letzterGrund = grund || null;
      onStatus(status());
    }

    function status() {
      return {
        state: zustand,
        reason: letzterGrund,
        mode: mode,
        modeReason: modusGrund,
        symbols: liveSymbole(),
        wanted: gewuenschteSymbole(),
        clients: proClient.size,
        linkOpen: !!link.isOpen && link.isOpen(),
        sessionAllowed: sessionErlaubt(),
        stats: JSON.parse(JSON.stringify(stats))
      };
    }

    /* ------------------------------------------------------ Handhabung */

    var handlers = {
      onOpen: function () {
        stats.lastOpenAt = timers.now();
        /* Was beim Oeffnen mitgegeben wurde, ist jetzt angemeldet. */
        angemeldet = new Set(zuletztGeoeffnet);
        setzeZustand("LIVE", null);
      },
      onTick: function (tick) {
        stats.ticks++;
        /* Ein Tick fuer ein Symbol, das niemand mehr will, wird nicht
           weitergereicht. Er kann im Nachlauf oder kurz nach einer
           Abmeldung noch eintreffen; ihn durchzulassen hiesse, einen
           Chart zu bewegen, den niemand abonniert hat. */
        var sym = normSymbol(tick && tick.symbol);
        var e = eintraege.get(sym);
        if (!e || e.clients.size === 0) return;
        onTick(tick);
      },
      onError: function (err) {
        stats.providerErrors++;
        setzeZustand("DEGRADED", (err && err.reason) || "providerError");
      },
      onClose: function () {
        angemeldet.clear();
        if (gewuenschteSymbole().length) setzeZustand("DEGRADED", "closed");
        else setzeZustand("IDLE", null);
      }
    };

    /* Die Liste beim Anbieter mit der gewuenschten in Einklang bringen.
       Genau EIN Weg hierher, damit es keinen zweiten Ort gibt, an dem
       eine Verbindung entsteht. */
    function abgleichen() {
      var wollen = gewuenschteSymbole();
      var haben = liveSymbole();

      if (!wollen.length) {
        if (link.isOpen && link.isOpen()) { link.close(); stats.closes++; }
        setzeZustand("IDLE", null);
        return;
      }
      if (!sessionErlaubt()) {
        if (link.isOpen && link.isOpen()) { link.close(); stats.closes++; }
        setzeZustand("IDLE", "sessionClosed");
        return;
      }

      if (!link.isOpen || !link.isOpen()) {
        stats.opens++;
        setzeZustand("CONNECTING", null);
        zuletztGeoeffnet = wollen.slice();
        link.open(wollen, handlers);
        stats.lastChangeAt = timers.now();
        return;
      }

      var dazu = wollen.filter(function (s) { return haben.indexOf(s) === -1; });
      var weg = haben.filter(function (s) { return wollen.indexOf(s) === -1; });
      if (!dazu.length && !weg.length) return;

      if (mode === "dynamic" && typeof link.update === "function") {
        var ok = link.update(dazu, weg);
        if (ok) {
          stats.updates++;
          stats.lastChangeAt = timers.now();
          dazu.forEach(function (s) { angemeldet.add(s); });
          weg.forEach(function (s) { angemeldet.delete(s); });
          return;
        }
        /* Der Anbieter hat die Nachmeldung nicht angenommen. Kein
           Drama und kein stiller Fehler: ab jetzt wird neu aufgebaut,
           und die Auskunft sagt, warum. */
        mode = "reconnect";
        modusGrund = "dynamicUpdateRejected";
      }

      /* Neuaufbau mit der vollstaendigen Liste. */
      stats.reconnects++;
      link.close();
      stats.closes++;
      angemeldet.clear();
      stats.opens++;
      setzeZustand("CONNECTING", null);
      zuletztGeoeffnet = wollen.slice();
      link.open(wollen, handlers);
      stats.lastChangeAt = timers.now();
    }

    /* Aenderungen sammeln statt jede einzeln auszufuehren. */
    function planeAbgleich() {
      if (settleTimer !== null) timers.clearTimeout(settleTimer);
      settleTimer = timers.setTimeout(function () {
        settleTimer = null;
        abgleichen();
      }, settleMs);
    }

    /* Der Nachlauf: ein Wecker fuer den naechsten Ablauf, nicht einer je
       Symbol. Bei fuenfzig Symbolen waeren das sonst fuenfzig Wecker. */
    function planeGrace() {
      if (graceTimer !== null) { timers.clearTimeout(graceTimer); graceTimer = null; }
      var naechster = null;
      eintraege.forEach(function (e) {
        if (e.expiresAt === null) return;
        if (naechster === null || e.expiresAt < naechster) naechster = e.expiresAt;
      });
      if (naechster === null) return;
      var inMs = Math.max(0, naechster - timers.now());
      graceTimer = timers.setTimeout(function () {
        graceTimer = null;
        var jetzt = timers.now();
        var gefallen = false;
        eintraege.forEach(function (e, sym) {
          if (e.expiresAt !== null && e.expiresAt <= jetzt && e.clients.size === 0) {
            eintraege.delete(sym);
            stats.graceExpiries++;
            gefallen = true;
          }
        });
        planeGrace();
        if (gefallen) planeAbgleich();
      }, inMs);
    }

    /* ---------------------------------------------------------- Aussen */

    /**
     * Ein Client will ein Symbol sehen.
     * @returns {{allowed:boolean, reason:string|null, symbols:number}}
     */
    function acquire(symbol, clientId) {
      var sym = normSymbol(symbol);
      if (!sym) return { allowed: false, reason: "emptySymbol", symbols: eintraege.size };
      stats.acquires++;

      var e = eintraege.get(sym);
      var neu = !e;

      if (neu) {
        /* Eine harte Obergrenze, bevor irgendetwas geoeffnet wird. Sie
           schuetzt das kostenlose Kontingent - die Antwort auf zu viele
           Titel ist Ablehnung mit Grund, nicht eine Rechnung. */
        if (eintraege.size >= maxSymbols) {
          stats.refusedByLimit++;
          return { allowed: false, reason: "symbolLimitReached", symbols: eintraege.size };
        }
        if (budget && typeof budget.mayAdd === "function") {
          var urteil = budget.mayAdd(sym, eintraege.size);
          if (urteil && urteil.allow === false) {
            stats.refusedByBudget++;
            setzeZustand("BLOCKED", (urteil.reason) || "budget");
            return { allowed: false, reason: urteil.reason || "budget", symbols: eintraege.size };
          }
        }
        e = { clients: new Set(), expiresAt: null };
        eintraege.set(sym, e);
      }

      e.clients.add(clientId);
      /* Wer im Nachlauf war und wieder gebraucht wird, bleibt einfach. */
      if (e.expiresAt !== null) { e.expiresAt = null; planeGrace(); }

      var meins = proClient.get(clientId);
      if (!meins) { meins = new Set(); proClient.set(clientId, meins); }
      meins.add(sym);

      if (neu || !angemeldet.has(sym)) planeAbgleich();
      return { allowed: true, reason: null, symbols: eintraege.size };
    }

    /** Ein Client sieht ein Symbol nicht mehr an. */
    function release(symbol, clientId) {
      var sym = normSymbol(symbol);
      var e = eintraege.get(sym);
      if (!e) return false;
      stats.releases++;
      e.clients.delete(clientId);
      var meins = proClient.get(clientId);
      if (meins) { meins.delete(sym); if (!meins.size) proClient.delete(clientId); }
      if (e.clients.size === 0) {
        e.expiresAt = timers.now() + graceMs;
        planeGrace();
      }
      return true;
    }

    /** Ein Client ist weg - alles auf einmal. */
    function releaseClient(clientId) {
      var meins = proClient.get(clientId);
      if (!meins) return 0;
      var n = 0;
      meins.forEach(function (sym) {
        var e = eintraege.get(sym);
        if (!e) return;
        e.clients.delete(clientId);
        if (e.clients.size === 0) e.expiresAt = timers.now() + graceMs;
        n++;
      });
      proClient.delete(clientId);
      planeGrace();
      return n;
    }

    /** Sitzungswechsel, Budgetwechsel: neu bewerten. */
    function reevaluate() { planeAbgleich(); }

    /** Alles zu. Nach einem Ausfall oder am Handelsschluss. */
    function shutdown(grund) {
      if (settleTimer !== null) { timers.clearTimeout(settleTimer); settleTimer = null; }
      if (graceTimer !== null) { timers.clearTimeout(graceTimer); graceTimer = null; }
      eintraege.clear();
      proClient.clear();
      angemeldet.clear();
      if (link.isOpen && link.isOpen()) { link.close(); stats.closes++; }
      setzeZustand("IDLE", grund || null);
    }

    /* Damit Tests nicht auf echte Zeit warten muessen. */
    function flush() {
      if (settleTimer !== null) { timers.clearTimeout(settleTimer); settleTimer = null; abgleichen(); }
    }

    function setMode(neu, grund) {
      if (MODES.indexOf(neu) === -1) return false;
      mode = neu;
      modusGrund = grund || null;
      return true;
    }

    return {
      VERSION: VERSION,
      acquire: acquire,
      release: release,
      releaseClient: releaseClient,
      reevaluate: reevaluate,
      shutdown: shutdown,
      flush: flush,
      setMode: setMode,
      mode: function () { return mode; },
      symbols: liveSymbole,
      wanted: gewuenschteSymbole,
      clientCount: function () { return proClient.size; },
      refCount: function (symbol) {
        var e = eintraege.get(normSymbol(symbol));
        return e ? e.clients.size : 0;
      },
      status: status,
      stats: function () { return JSON.parse(JSON.stringify(stats)); }
    };
  }

  var api = {
    VERSION: VERSION, MODES: MODES,
    DEFAULT_GRACE_MS: DEFAULT_GRACE_MS, DEFAULT_SETTLE_MS: DEFAULT_SETTLE_MS,
    defaultTimers: defaultTimers, create: create
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.SubscriptionManager = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
