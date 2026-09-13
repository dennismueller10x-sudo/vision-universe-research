/* =========================================================================
   VISION UNIVERSE — realtime/trading-session.js

   WELCHE SITZUNG GEHOERT IN DEN CHART?

   market-hours.js beantwortet "laeuft gerade Handel?". Diese Datei
   beantwortet die Frage, die ein Chart danach stellt: WELCHEN Tag zeige
   ich - und bis wann bleibt das so?

     Boerse offen          -> die laufende Sitzung, sie waechst mit echten
                              Punkten
     nach Schluss          -> die heutige Sitzung, vollstaendig
     Vorboerse, Wochenende,
     Feiertag, Nacht       -> die letzte abgeschlossene Sitzung

   "Boerse geschlossen -> kein Chart" ist FALSCH. Ein Titel mit echten
   Kursdaten hat immer einen Chart-Zustand: die letzte abgeschlossene
   Sitzung bleibt sichtbar, bis um 09:30 New Yorker Zeit die naechste
   beginnt. Der Wechsel passiert an der Sitzungsgrenze, nicht um
   Mitternacht und nicht in deutscher Zeit.

   Alles hier rechnet ueber Intl mit benannter Zeitzone (market-hours.js
   liefert die Ortszeit); Feiertage, Wochenenden und verkuerzte Tage
   kommen aus quant/config/market-calendar.json. Kein Datum wird
   geraten, kein Offset fest eingebaut.

   Dasselbe Modul laeuft in Node (Ingest, Tests) und im Browser
   (Karten, Aktienseite): eine Antwort fuer beide Seiten.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js")
                           : (global.VURealtime && global.VURealtime.MarketHours);

  var ENGINE_VERSION = "trading-session-1.0.0";
  var STATES = ["PRE_MARKET", "OPEN", "AFTER_HOURS", "CLOSED", "HOLIDAY"];
  var DEFAULT_EXCHANGE = "XNYS";
  var DAY_MS = 86400000;
  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function exchangeOf(calendar, exchangeId) {
    var cal = calendar || MarketHours.BUILTIN_CALENDAR;
    var id = exchangeId || DEFAULT_EXCHANGE;
    var ex = (cal.exchanges && cal.exchanges[id]) || MarketHours.BUILTIN_CALENDAR.exchanges[DEFAULT_EXCHANGE];
    return {
      id: id, timezone: ex.timezone || "America/New_York",
      sessions: ex.sessions || MarketHours.BUILTIN_CALENDAR.exchanges.XNYS.sessions,
      weekdays: ex.weekdays || [1, 2, 3, 4, 5],
      holidays: ex.holidays || [], earlyCloses: ex.earlyCloses || {},
      coverage: cal.coverage || { from: null, to: null }, calendarId: cal.calendarId || null
    };
  }

  /* Kalenderrechnung auf ISO-Tagen. Ein Tag ist hier ein Boersentag in
     Ortszeit, deshalb reicht UTC-Arithmetik auf dem Datum selbst. */
  function dayMs(isoDate) {
    return Date.UTC(parseInt(isoDate.slice(0, 4), 10), parseInt(isoDate.slice(5, 7), 10) - 1,
                    parseInt(isoDate.slice(8, 10), 10));
  }
  function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(isoDate, n) { return isoOf(dayMs(isoDate) + n * DAY_MS); }
  function weekdayOf(isoDate) { return new Date(dayMs(isoDate)).getUTCDay(); }

  function isTradingDay(isoDate, ex) {
    if (ex.weekdays.indexOf(weekdayOf(isoDate)) === -1) return false;
    return ex.holidays.indexOf(isoDate) === -1;
  }
  function previousTradingDay(isoDate, ex) {
    var d = isoDate;
    for (var i = 0; i < 40; i++) { d = addDays(d, -1); if (isTradingDay(d, ex)) return d; }
    return null;
  }
  function nextTradingDay(isoDate, ex) {
    var d = isoDate;
    for (var i = 0; i < 40; i++) { d = addDays(d, 1); if (isTradingDay(d, ex)) return d; }
    return null;
  }

  /**
   * Ortszeit -> Zeitpunkt. Zwei Iterationen ueber Intl: die erste
   * Schaetzung nimmt UTC, die Differenz zur Ortszeit ist der Offset -
   * einschliesslich Sommerzeit, ohne eigene Regel.
   */
  function localToUtc(isoDate, hhmm, timezone) {
    var target = dayMs(isoDate) + minutesOf(hhmm) * 60000;
    var guess = target;
    for (var i = 0; i < 2; i++) {
      var lp = MarketHours.localParts(guess, timezone);
      var asUtc = dayMs(lp.date) + lp.minutesOfDay * 60000;
      var offset = asUtc - guess;          /* Ortszeit minus UTC, z. B. -4h im Sommer */
      guess = target - offset;
    }
    return guess;
  }

  /** Die Sitzung eines Handelstags: Grenzen als Zeitpunkte und Ortszeit. */
  function sessionFor(isoDate, ex) {
    var s = ex.sessions;
    var closeLocal = ex.earlyCloses[isoDate] || s.REGULAR.end;
    var afterCloseLocal = s.AFTER ? (ex.earlyCloses[isoDate] ? s.AFTER.end : s.AFTER.end) : closeLocal;
    var out = {
      sessionDate: isoDate, weekday: weekdayOf(isoDate), weekdayName: WOCHENTAGE[weekdayOf(isoDate)],
      timezone: ex.timezone, exchange: ex.id,
      openLocal: s.REGULAR.start, closeLocal: closeLocal,
      preOpenLocal: s.PRE ? s.PRE.start : s.REGULAR.start,
      afterCloseLocal: afterCloseLocal,
      earlyClose: !!ex.earlyCloses[isoDate],
      regularMinutes: minutesOf(closeLocal) - minutesOf(s.REGULAR.start)
    };
    out.open = new Date(localToUtc(isoDate, out.openLocal, ex.timezone)).toISOString();
    out.close = new Date(localToUtc(isoDate, out.closeLocal, ex.timezone)).toISOString();
    out.preOpen = new Date(localToUtc(isoDate, out.preOpenLocal, ex.timezone)).toISOString();
    out.afterClose = new Date(localToUtc(isoDate, out.afterCloseLocal, ex.timezone)).toISOString();
    return out;
  }

  function withState(session, nowMs, kind) {
    if (!session) return null;
    var out = {};
    Object.keys(session).forEach(function (k) { out[k] = session[k]; });
    var openMs = Date.parse(session.open), closeMs = Date.parse(session.close);
    out.hasStarted = nowMs >= openMs;
    out.isRunning = nowMs >= openMs && nowMs < closeMs;
    out.isComplete = nowMs >= closeMs;
    out.kind = kind;
    /* Wie viel der Sitzung ist vergangen - fuer die Zeitachse eines
       laufenden Charts (0..1). */
    out.progress = nowMs <= openMs ? 0 : nowMs >= closeMs ? 1 : (nowMs - openMs) / (closeMs - openMs);
    return out;
  }

  /**
   * Der Befund zu einem Zeitpunkt.
   *
   * @param {Date|number|string} when
   * @param {object} opts {calendar, exchange}
   * @returns {object}
   *   marketState           PRE_MARKET | OPEN | AFTER_HOURS | CLOSED | HOLIDAY
   *   closedReason          weekend | holiday | outsideSession | null
   *   currentSession        heutige Sitzung (Handelstag) oder null
   *   lastCompletedSession  juengste Sitzung, deren Schluss vorbei ist
   *   displaySession        die Sitzung, die ein Chart zeigt (kind current|last)
   *   nextOpen              naechster Sitzungsbeginn (ISO)
   *   nextChangeAt          naechster Zeitpunkt, an dem sich der Befund aendert
   */
  function resolve(when, opts) {
    opts = opts || {};
    var ex = exchangeOf(opts.calendar, opts.exchange);
    var s = MarketHours.sessionAt(when, { calendar: opts.calendar, exchange: opts.exchange });
    var nowMs = when instanceof Date ? when.getTime() : typeof when === "number" ? when : Date.parse(when);
    var base = {
      engineVersion: ENGINE_VERSION, exchange: ex.id, timezone: ex.timezone,
      now: new Date(nowMs).toISOString(), localDate: s.localDate, localTime: s.localTime,
      phase: s.phase, closedReason: s.closedReason, calendarCoverage: s.calendarCoverage,
      calendarId: ex.calendarId
    };
    if (!s.localDate) {
      return assign(base, { marketState: "CLOSED", currentSession: null, lastCompletedSession: null,
                            displaySession: null, nextOpen: null, nextChangeAt: null });
    }

    var current = null, last = null, state, nextOpen, nextChange;
    if (s.isTradingDay) {
      current = withState(sessionFor(s.localDate, ex), nowMs, "current");
      if (!current.hasStarted) {
        state = s.phase === "PRE" ? "PRE_MARKET" : "CLOSED";
        last = withState(sessionFor(previousTradingDay(s.localDate, ex), ex), nowMs, "last");
        nextOpen = current.open;
        /* Naechste Aenderung: Beginn der Vorboerse oder der Sitzung. */
        nextChange = s.phase === "PRE" ? current.open : current.preOpen;
      } else if (current.isRunning) {
        state = "OPEN";
        last = withState(sessionFor(previousTradingDay(s.localDate, ex), ex), nowMs, "last");
        nextOpen = sessionFor(nextTradingDay(s.localDate, ex), ex).open;
        nextChange = current.close;
      } else {
        state = s.phase === "AFTER" ? "AFTER_HOURS" : "CLOSED";
        last = withState(sessionFor(s.localDate, ex), nowMs, "last");
        nextOpen = sessionFor(nextTradingDay(s.localDate, ex), ex).open;
        nextChange = s.phase === "AFTER" ? current.afterClose
                                          : sessionFor(nextTradingDay(s.localDate, ex), ex).preOpen;
      }
    } else {
      state = s.closedReason === "holiday" ? "HOLIDAY" : "CLOSED";
      last = withState(sessionFor(previousTradingDay(s.localDate, ex), ex), nowMs, "last");
      var naechster = sessionFor(nextTradingDay(s.localDate, ex), ex);
      nextOpen = naechster.open;
      nextChange = naechster.preOpen;
    }
    var display = (current && current.hasStarted) ? current : last;
    return assign(base, {
      marketState: state, isOpen: state === "OPEN",
      currentSession: current, lastCompletedSession: last, displaySession: display,
      nextOpen: nextOpen, nextChangeAt: nextChange
    });
  }

  function assign(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  /* ---------------------------------------------------------- Sprache */

  var STATE_WORT = { PRE_MARKET: "Vorbörse", OPEN: "Geöffnet", AFTER_HOURS: "Nachbörse",
                     CLOSED: "Geschlossen", HOLIDAY: "Feiertag" };

  function datumKurz(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }

  /**
   * Die Beschriftung eines Intraday-Charts - in der Sprache der Seite,
   * ohne technische Codes.
   *
   *   laufend, Strom      "Heute · live"
   *   laufend, Snapshot   "Heute · Stand 15:42"
   *   heute, Schluss      "Heute · Schluss 16:00"
   *   frueher             "Letzter Handelstag · Freitag"  (bis 6 Tage)
   *                       "Letzter Handelstag · 04.09."   (aelter)
   *
   * @param {object} resolution  Ergebnis von resolve()
   * @param {object} snapshot    {sessionDate, asOfLocal, isLive, regularComplete} oder null
   */
  function describe(resolution, snapshot) {
    var ds = resolution && resolution.displaySession;
    if (!ds) return { label: "Kein Handelstag bekannt", state: null, sessionDate: null };
    var sessionDate = snapshot && snapshot.sessionDate ? snapshot.sessionDate : ds.sessionDate;
    var heute = resolution.localDate === sessionDate;
    var label;
    if (heute && resolution.marketState === "OPEN" && sessionDate === ds.sessionDate) {
      if (snapshot && snapshot.isLive === true) label = "Heute · live";
      else if (snapshot && snapshot.asOfLocal) label = "Heute · Stand " + snapshot.asOfLocal.slice(0, 5);
      else label = "Heute · Stand " + resolution.localTime.slice(0, 5);
    } else if (heute) {
      var schluss = (snapshot && snapshot.closeLocal) || ds.closeLocal || "16:00";
      label = "Heute · Schluss " + schluss + (ds.earlyClose && ds.sessionDate === sessionDate ? " (verkürzt)" : "");
    } else {
      var abstand = Math.round((dayMs(resolution.localDate) - dayMs(sessionDate)) / DAY_MS);
      var tag = abstand >= 1 && abstand <= 6 ? WOCHENTAGE[weekdayOf(sessionDate)]
              : datumKurz(sessionDate);
      label = "Letzter Handelstag · " + tag;
    }
    return { label: label, state: STATE_WORT[resolution.marketState] || "Geschlossen",
             sessionDate: sessionDate, isToday: heute, timezoneNote: "Uhrzeiten in New Yorker Zeit" };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, STATES: STATES, WOCHENTAGE: WOCHENTAGE,
    resolve: resolve, describe: describe, sessionFor: function (isoDate, opts) {
      opts = opts || {}; return sessionFor(isoDate, exchangeOf(opts.calendar, opts.exchange));
    },
    isTradingDay: function (isoDate, opts) { opts = opts || {}; return isTradingDay(isoDate, exchangeOf(opts.calendar, opts.exchange)); },
    previousTradingDay: function (isoDate, opts) { opts = opts || {}; return previousTradingDay(isoDate, exchangeOf(opts.calendar, opts.exchange)); },
    nextTradingDay: function (isoDate, opts) { opts = opts || {}; return nextTradingDay(isoDate, exchangeOf(opts.calendar, opts.exchange)); },
    localToUtc: function (isoDate, hhmm, timezone) { return new Date(localToUtc(isoDate, hhmm, timezone || "America/New_York")).toISOString(); },
    minutesOf: minutesOf
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.TradingSession = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
