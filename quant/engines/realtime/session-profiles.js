/* =========================================================================
   VISION UNIVERSE — realtime/session-profiles.js   (Multi-Asset Core §26, §31, §39)

   WELCHE UHR GILT FUER DIESES INSTRUMENT?

   market-hours.js und trading-session.js beantworten die Frage fuer eine
   Boerse. Nicht jedes Instrument hat eine: Bitcoin handelt rund um die
   Uhr, Devisen von Sonntagabend bis Freitagabend, Gold am OTC-Markt mit
   einer taeglichen Pause, eine US-Rendite erscheint einmal am Tag, ein
   Leitzins aendert sich nur an Beschlusstagen.

   Diese Datei ist KEINE zweite Kalender-Engine. Sie waehlt je Profil die
   bestehende Antwort:

     EXCHANGE       -> trading-session.js mit der Heimatboerse des
                       Instruments (XNYS, XETR, XLON, ...) aus
                       quant/config/market-calendar.json
     FX_CORE        -> fx-freshness.js#marketPhase (Currency Core) -
                       dieselbe Devisenwoche wie jede EUR-Umrechnung
     WEEKLY_WINDOW  -> eine Wochenregel in einer benannten Zeitzone, mit
                       taeglicher Pause (OTC-Metalle, CME Globex)
     CONTINUOUS     -> immer offen
     PUBLICATION    -> kein Handel; welcher Veroeffentlichungstag
                       zuletzt faellig war
     EVENT          -> kein Handel; der Wert gilt bis zum naechsten
                       Beschluss

   Das Ergebnis traegt immer `calendarCoverage`. Wo kein gepruefter
   Feiertagskalender vorliegt (Wochenfenster, asiatische Boersen), ist es
   false - und keine Aussage daraus gilt als gesichert.

   Laeuft in Node und im Browser.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js") : (global.VURealtime && global.VURealtime.MarketHours);
  var TradingSession = isNode ? require("./trading-session.js") : (global.VURealtime && global.VURealtime.TradingSession);
  var FxFreshness = isNode ? require("../fx/fx-freshness.js") : (global.VUFx && global.VUFx.Freshness);

  var VERSION = "session-profiles-1.0.0";
  var DAY_MS = 86400000;

  /* Die Wochenfenster. Beide Zeiten in New Yorker Ortszeit, weil der
     Markt dort seine Grenzen setzt (CME: 17:00 Chicago = 18:00 New York).
     Die Sommerzeit rechnet Intl, nicht diese Tabelle. */
  var WEEKLY_WINDOWS = {
    METALS_OTC_24_5: {
      timezone: "America/New_York", openWeekday: 0, open: "18:00", closeWeekday: 5, close: "17:00",
      dailyBreak: { start: "17:00", end: "18:00" },
      source: "Konvention des OTC-Edelmetallhandels (Wochenbeginn Sonntagabend New York, taegliche Pause 17-18 Uhr). Kein Feiertagskalender."
    },
    COMMODITY_FUTURES: {
      timezone: "America/New_York", openWeekday: 0, open: "18:00", closeWeekday: 5, close: "17:00",
      dailyBreak: { start: "17:00", end: "18:00" },
      source: "CME Globex Energie/Metalle (So. 17:00 - Fr. 16:00 Chicago, taegliche Pause 16-17 Uhr Chicago). Feiertagssitzungen der CME sind NICHT modelliert."
    }
  };

  var EXCHANGE_PROFILES = { US_EQUITY: true, INDEX_US: true, INDEX_EU: true, INDEX_ASIA: true };

  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function ms(v) { return v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v); }
  function dayMs(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function isoOf(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(iso, n) { return isoOf(dayMs(iso) + n * DAY_MS); }
  function weekdayOf(iso) { return new Date(dayMs(iso)).getUTCDay(); }
  function utcAt(isoDate, hhmm, tz) { return Date.parse(TradingSession.localToUtc(isoDate, hhmm, tz)); }

  /* ------------------------------------------------------------ Boerse */
  function exchangeState(profile, when, opts) {
    var calendar = opts.calendar;
    var exchange = opts.exchange || "XNYS";
    var r = TradingSession.resolve(when, { calendar: calendar, exchange: exchange });
    var ex = (calendar && calendar.exchanges && calendar.exchanges[exchange]) || null;
    var marketState = r.marketState;
    var phase = r.phase;
    /* Ein Index wird waehrend der regulaeren Sitzung berechnet. Vor- und
       Nachboerse gibt es fuer ihn nicht - dort gilt er als geschlossen,
       nicht als "Vorboerse". */
    if (profile !== "US_EQUITY" && (marketState === "PRE_MARKET" || marketState === "AFTER_HOURS")) {
      marketState = "CLOSED"; phase = "CLOSED";
    }
    /* Mittagspause asiatischer Boersen: eine echte Handelsunterbrechung,
       kein Schluss. */
    var lunch = ex && ex.sessions && ex.sessions.LUNCH;
    if (lunch && marketState === "OPEN") {
      var lp = MarketHours.localParts(when, r.timezone);
      if (lp && lp.minutesOfDay >= minutesOf(lunch.start) && lp.minutesOfDay < minutesOf(lunch.end)) {
        marketState = "DAILY_BREAK"; phase = "BREAK";
      }
    }
    var last = r.lastCompletedSession;
    return {
      kind: "EXCHANGE", exchange: exchange, timezone: r.timezone,
      isOpen: marketState === "OPEN", marketState: marketState, phase: phase,
      closedReason: marketState === "OPEN" ? null : (r.closedReason || (marketState === "DAILY_BREAK" ? "dailyBreak" : "outsideSession")),
      localDate: r.localDate, localTime: r.localTime,
      calendarCoverage: !!r.calendarCoverage,
      currentSessionDate: r.currentSession ? r.currentSession.sessionDate : null,
      lastSessionDate: last ? last.sessionDate : null,
      lastCloseAt: last ? last.close : null,
      nextOpenAt: r.nextOpen || null,
      resolution: r
    };
  }

  /* ------------------------------------------------------- Wochenfenster */
  function weeklyState(profile, when, opts) {
    var w = (opts && opts.window) || WEEKLY_WINDOWS[profile];
    var t = ms(when);
    var lp = MarketHours.localParts(t, w.timezone);
    var wd = lp.weekday, m = lp.minutesOfDay;
    var openM = minutesOf(w.open), closeM = minutesOf(w.close);
    var brS = w.dailyBreak ? minutesOf(w.dailyBreak.start) : null, brE = w.dailyBreak ? minutesOf(w.dailyBreak.end) : null;

    var state, reason = null;
    if (wd === 6 || (wd === w.openWeekday && m < openM) || (wd === w.closeWeekday && m >= closeM)) {
      state = "WEEKEND"; reason = "weekend";
    } else if (brS !== null && m >= brS && m < brE && wd !== w.openWeekday) {
      state = "DAILY_BREAK"; reason = "dailyBreak";
    } else {
      state = "OPEN";
    }

    /* Wann endete die letzte Handelsperiode? In der Pause: heute um den
       Pausenbeginn. Am Wochenende: der letzte Wochenschluss. Offen: null. */
    var lastCloseAt = null;
    if (state === "DAILY_BREAK") lastCloseAt = utcAt(lp.date, w.dailyBreak.start, w.timezone);
    if (state === "WEEKEND") {
      var d = lp.date;
      for (var i = 0; i < 8 && weekdayOf(d) !== w.closeWeekday; i++) d = addDays(d, -1);
      if (weekdayOf(d) === w.closeWeekday && d === lp.date && m < closeM) d = addDays(d, -7);
      lastCloseAt = utcAt(d, w.close, w.timezone);
    }
    return {
      kind: "WEEKLY_WINDOW", timezone: w.timezone,
      isOpen: state === "OPEN", marketState: state, phase: state === "OPEN" ? "REGULAR" : state === "DAILY_BREAK" ? "BREAK" : "CLOSED",
      closedReason: reason, localDate: lp.date, localTime: lp.clock,
      calendarCoverage: false,
      lastCloseAt: lastCloseAt ? new Date(lastCloseAt).toISOString() : null,
      windowSource: w.source
    };
  }

  /* ------------------------------------------------------------ Devisen */
  function fxState(when) {
    var p = FxFreshness.marketPhase(when);
    var t = ms(when);
    return {
      kind: "FX_CORE", timezone: "UTC",
      isOpen: !!p.isOpen, marketState: p.isOpen ? "OPEN" : "WEEKEND", phase: p.isOpen ? "REGULAR" : "CLOSED",
      closedReason: p.isOpen ? null : p.reason,
      localDate: isoOf(t), localTime: new Date(t).toISOString().slice(11, 19),
      calendarCoverage: false,
      lastCloseAt: p.isOpen ? null : new Date(FxFreshness.lastMarketClose(t)).toISOString(),
      delegate: "quant/engines/fx/fx-freshness.js#marketPhase"
    };
  }

  /* ------------------------------------------------------ Veroeffentlichung */
  function isBusinessDay(iso, pub, calendar) {
    if ((pub.businessDays || [1, 2, 3, 4, 5]).indexOf(weekdayOf(iso)) === -1) return false;
    var ex = pub.holidayExchange && calendar && calendar.exchanges && calendar.exchanges[pub.holidayExchange];
    return !(ex && (ex.holidays || []).indexOf(iso) !== -1);
  }

  /**
   * Welcher Beobachtungstag muesste heute spaetestens vorliegen?
   * Ein Tag gilt als veroeffentlicht, wenn seine Veroeffentlichungszeit
   * (publishedAfterLocal) in der Zeitzone des Herausgebers vorbei ist.
   */
  function expectedPublication(when, pub, calendar) {
    var lp = MarketHours.localParts(when, pub.timezone);
    var d = lp.date;
    var after = minutesOf(pub.publishedAfterLocal || "18:00");
    if (!(isBusinessDay(d, pub, calendar) && lp.minutesOfDay >= after)) {
      d = addDays(d, -1);
      for (var i = 0; i < 15 && !isBusinessDay(d, pub, calendar); i++) d = addDays(d, -1);
    }
    return d;
  }

  /** Geschaeftstage zwischen zwei Tagen (a < b), nach dem Herausgeberkalender. */
  function businessDaysBetween(a, b, pub, calendar) {
    if (!a || !b || a >= b) return 0;
    var n = 0, d = a;
    for (var i = 0; i < 400 && d < b; i++) { d = addDays(d, 1); if (isBusinessDay(d, pub, calendar)) n++; }
    return n;
  }

  function publicationState(profile, when, opts) {
    var pub = opts.publisher || { timezone: "UTC", businessDays: [1, 2, 3, 4, 5], publishedAfterLocal: "18:00" };
    var lp = MarketHours.localParts(when, pub.timezone);
    var cov = false;
    if (pub.holidayExchange && opts.calendar && opts.calendar.exchanges && opts.calendar.exchanges[pub.holidayExchange]) {
      var ex = opts.calendar.exchanges[pub.holidayExchange];
      var c = Object.prototype.hasOwnProperty.call(ex, "coverage") ? ex.coverage : opts.calendar.coverage;
      cov = !!(c && c.from && c.to && lp.date >= c.from && lp.date <= c.to);
    }
    return {
      kind: profile === "POLICY_EVENT" ? "EVENT" : "PUBLICATION", timezone: pub.timezone,
      isOpen: false, marketState: profile === "POLICY_EVENT" ? "NOT_APPLICABLE" : "PUBLICATION_SCHEDULE",
      phase: "NONE", closedReason: null, localDate: lp.date, localTime: lp.clock,
      calendarCoverage: cov,
      expectedObservationDate: profile === "REFERENCE_MONTHLY" ? null : expectedPublication(when, pub, opts.calendar),
      publisher: pub
    };
  }

  /**
   * Der Sitzungs-/Veroeffentlichungszustand eines Profils zu einem Zeitpunkt.
   *
   * @param {string} profile  US_EQUITY | INDEX_US | INDEX_EU | INDEX_ASIA |
   *                          METALS_OTC_24_5 | COMMODITY_FUTURES | FX_24_5 |
   *                          CRYPTO_24_7 | REFERENCE_DAILY | REFERENCE_MONTHLY |
   *                          POLICY_EVENT
   * @param {Date|string|number} when
   * @param {object} opts {calendar, exchange, publisher}
   */
  function stateAt(profile, when, opts) {
    opts = opts || {};
    var t = when === undefined ? Date.now() : when;
    var out;
    if (EXCHANGE_PROFILES[profile]) out = exchangeState(profile, t, opts);
    else if (WEEKLY_WINDOWS[profile]) out = weeklyState(profile, t, opts);
    else if (profile === "FX_24_5") out = fxState(t);
    else if (profile === "CRYPTO_24_7") {
      var ct = ms(t);
      out = { kind: "CONTINUOUS", timezone: "UTC", isOpen: true, marketState: "OPEN", phase: "REGULAR",
              closedReason: null, localDate: isoOf(ct), localTime: new Date(ct).toISOString().slice(11, 19),
              calendarCoverage: true, lastCloseAt: null };
    }
    else if (profile === "REFERENCE_DAILY" || profile === "REFERENCE_MONTHLY" || profile === "POLICY_EVENT") out = publicationState(profile, t, opts);
    else out = { kind: "UNRESOLVED", isOpen: false, marketState: "UNKNOWN", phase: "NONE", closedReason: "unresolvedProfile", calendarCoverage: false };
    out.profile = profile;
    out.engineVersion = VERSION;
    out.now = new Date(ms(t)).toISOString();
    return out;
  }

  /** Deutsches Wort fuer den Zustand - fuer Karten, ohne Anbieternamen. */
  var WORDS = {
    OPEN: "Handel läuft", CLOSED: "Geschlossen", PRE_MARKET: "Vorbörse", AFTER_HOURS: "Nachbörse",
    HOLIDAY: "Feiertag", WEEKEND: "Wochenende", DAILY_BREAK: "Handelspause",
    PUBLICATION_SCHEDULE: "Tageswert", NOT_APPLICABLE: "Beschluss", UNKNOWN: "Unbekannt"
  };
  function word(state) { return state && WORDS[state.marketState] || WORDS.UNKNOWN; }

  var api = {
    VERSION: VERSION, WEEKLY_WINDOWS: WEEKLY_WINDOWS, stateAt: stateAt, word: word,
    expectedPublication: expectedPublication, businessDaysBetween: businessDaysBetween, isBusinessDay: isBusinessDay
  };

  if (isNode) module.exports = api;
  else { global.VURealtime = global.VURealtime || {}; global.VURealtime.SessionProfiles = api; }
})(typeof window !== "undefined" ? window : globalThis);
