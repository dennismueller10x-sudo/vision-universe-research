/* =========================================================================
   VISION UNIVERSE — realtime/market-hours.js

   Laeuft gerade Handel?

   Die Frage klingt nebensaechlich und entscheidet ueber den haeufigsten
   Fehlalarm eines Live-Charts: Samstag um zehn bewegt sich kein Kurs, und
   ein System ohne Kalender haelt das fuer einen abgerissenen Stream. Es
   zeigt dann eine Stoerung, wo nur Wochenende ist - und schult den Nutzer
   darauf, Warnungen zu ignorieren.

   Umgekehrt genauso wichtig: um 15:30 an einem Dienstag ist ein zwanzig
   Minuten alter Kurs sehr wohl ein Problem, und dieselbe Anzeige muss das
   dann auch sagen.

   ZEITZONEN

   Boersenzeiten sind Ortszeiten. "09:30" ist im Januar 14:30 UTC und im
   Juli 13:30 UTC - dieselbe Boersenzeit, eine Stunde Unterschied. Wer
   feste UTC-Offsets einbaut, hat zweimal im Jahr fuer ein paar Wochen
   einen Chart, der eine Stunde zu frueh oder zu spaet aufmacht.

   Deshalb rechnet dieses Modul ausschliesslich ueber Intl mit einer
   benannten Zeitzone. Die Umstellung ist damit kein Sonderfall, sondern
   der Normalfall, den die Bibliothek ohnehin kennt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DEFAULT_EXCHANGE = "XNYS";

  /* Die Sitzungsphasen. NONE steht fuer "kein Handel" und traegt den
     Grund als eigenes Feld - Wochenende und Feiertag sind fuer den Nutzer
     verschiedene Auskuenfte. */
  var PHASES = ["PRE", "REGULAR", "AFTER", "CLOSED"];

  /* Der Fallback-Kalender. Er wird nur benutzt, wenn kein Kalender
     uebergeben wurde, und er sagt das dann auch: calendarCoverage ist
     false, und keine Aussage aus ihm gilt als gesichert. */
  var BUILTIN = {
    calendarId: "builtin-fallback",
    coverage: { from: null, to: null },
    exchanges: {
      XNYS: {
        timezone: "America/New_York",
        sessions: {
          PRE: { start: "04:00", end: "09:30" },
          REGULAR: { start: "09:30", end: "16:00" },
          AFTER: { start: "16:00", end: "20:00" }
        },
        weekdays: [1, 2, 3, 4, 5],
        holidays: [],
        earlyCloses: {}
      }
    }
  };

  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  /* Wandelt einen Zeitpunkt in die Ortszeit der Boerse.
     Intl liefert die Bestandteile bereits umgestellt; hier wird nichts
     addiert und nichts angenommen. */
  var partsCache = Object.create(null);
  function formatterFor(timezone) {
    if (!partsCache[timezone]) {
      partsCache[timezone] = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        weekday: "short"
      });
    }
    return partsCache[timezone];
  }

  var WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function localParts(when, timezone) {
    var d = when instanceof Date ? when : new Date(when);
    if (isNaN(d.getTime())) return null;
    var parts = formatterFor(timezone).formatToParts(d);
    var out = {};
    parts.forEach(function (p) { if (p.type !== "literal") out[p.type] = p.value; });
    /* "24" statt "00" ist eine bekannte Eigenheit von hour12:false. */
    var hour = parseInt(out.hour, 10) % 24;
    return {
      date: out.year + "-" + out.month + "-" + out.day,
      hour: hour,
      minute: parseInt(out.minute, 10),
      second: parseInt(out.second, 10),
      weekday: WEEKDAY_INDEX[out.weekday],
      minutesOfDay: hour * 60 + parseInt(out.minute, 10),
      clock: pad2(hour) + ":" + out.minute + ":" + out.second
    };
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function withinCoverage(calendar, isoDate) {
    var c = calendar && calendar.coverage;
    if (!c || !c.from || !c.to) return false;
    return isoDate >= c.from && isoDate <= c.to;
  }

  /**
   * Der Sitzungsbefund zu einem Zeitpunkt.
   *
   * @param {Date|number|string} when
   * @param {object} opts {calendar, exchange, includeExtended}
   * @returns {object}
   *   phase            "PRE" | "REGULAR" | "AFTER" | "CLOSED"
   *   isOpen           laeuft regulaerer Handel?
   *   isTradingDay     ist heute ueberhaupt ein Handelstag?
   *   closedReason     "weekend" | "holiday" | "outsideSession" | null
   *   localDate/localTime  Ortszeit der Boerse
   *   earlyClose       Uhrzeit eines verkuerzten Schlusses oder null
   *   calendarCoverage deckt der Kalender diesen Tag ab?
   */
  function sessionAt(when, opts) {
    opts = opts || {};
    var calendar = opts.calendar || BUILTIN;
    var exchangeId = opts.exchange || DEFAULT_EXCHANGE;
    var ex = (calendar.exchanges && calendar.exchanges[exchangeId]) ||
             BUILTIN.exchanges[DEFAULT_EXCHANGE];
    var tz = ex.timezone || "America/New_York";

    var lp = localParts(when, tz);
    if (!lp) {
      return {
        phase: "CLOSED", isOpen: false, isTradingDay: false,
        closedReason: "invalidTimestamp", exchange: exchangeId, timezone: tz,
        localDate: null, localTime: null, earlyClose: null,
        calendarCoverage: false, calendarId: calendar.calendarId || null
      };
    }

    var coverage = withinCoverage(calendar, lp.date);
    var weekdays = ex.weekdays || [1, 2, 3, 4, 5];
    var holidays = ex.holidays || [];
    var earlyCloses = ex.earlyCloses || {};

    var base = {
      exchange: exchangeId, timezone: tz,
      localDate: lp.date, localTime: lp.clock, localWeekday: lp.weekday,
      earlyClose: earlyCloses[lp.date] || null,
      calendarCoverage: coverage,
      calendarId: calendar.calendarId || null
    };

    if (weekdays.indexOf(lp.weekday) === -1) {
      return assign(base, { phase: "CLOSED", isOpen: false, isTradingDay: false,
                            closedReason: "weekend" });
    }
    /* Ein Feiertag ausserhalb der Abdeckung ist kein Feiertag, den wir
       kennen - die Liste ist dort schlicht leer. Der Befund sagt das
       ueber calendarCoverage, statt eine Vollstaendigkeit zu behaupten. */
    if (holidays.indexOf(lp.date) !== -1) {
      return assign(base, { phase: "CLOSED", isOpen: false, isTradingDay: false,
                            closedReason: "holiday" });
    }

    var sessions = ex.sessions || BUILTIN.exchanges.XNYS.sessions;
    var regularStart = minutesOf(sessions.REGULAR.start);
    var regularEnd = base.earlyClose ? minutesOf(base.earlyClose)
                                     : minutesOf(sessions.REGULAR.end);
    var m = lp.minutesOfDay;

    if (m >= regularStart && m < regularEnd) {
      return assign(base, { phase: "REGULAR", isOpen: true, isTradingDay: true,
                            closedReason: null });
    }
    if (sessions.PRE && m >= minutesOf(sessions.PRE.start) && m < regularStart) {
      return assign(base, { phase: "PRE", isOpen: false, isTradingDay: true,
                            closedReason: null });
    }
    if (sessions.AFTER && m >= regularEnd && m < minutesOf(sessions.AFTER.end)) {
      return assign(base, { phase: "AFTER", isOpen: false, isTradingDay: true,
                            closedReason: null });
    }
    return assign(base, { phase: "CLOSED", isOpen: false, isTradingDay: true,
                          closedReason: "outsideSession" });
  }

  function assign(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  /**
   * Zaehlt die Klasse einer Sitzung fuer die Staleness-Bewertung.
   *
   * REGULAR erwartet Bewegung. PRE und AFTER erwarten sie nur, wenn der
   * Zugang erweiterte Zeiten ueberhaupt liefert - und CLOSED erwartet
   * keine. Deshalb ist "nichts passiert" nur in einem dieser Faelle ein
   * Befund und in den anderen der Normalzustand.
   */
  /**
   * Wie viele Handelstage liegen zwischen zwei Zeitpunkten?
   *
   * Der Grund fuer diese Funktion ist ein Befund aus dem echten Betrieb:
   * ein Tagesschluss vom Freitag ist am Dienstag danach 108
   * Kalenderstunden alt und trotzdem taufrisch, wenn dazwischen ein
   * Wochenende und der Labor Day lagen. Wer EOD-Verfall in Stunden misst,
   * meldet nach jedem langen Wochenende einen Ausfall, den es nicht gibt -
   * und schult den Nutzer darauf, die Warnung zu ignorieren.
   *
   * Gezaehlt werden die Handelstage NACH `fromMs` bis einschliesslich des
   * Tages von `toMs`. Ein Schluss von gestern ergibt damit 1, einer von
   * heute 0.
   */
  function tradingDaysBetween(fromMs, toMs, opts) {
    opts = opts || {};
    var calendar = opts.calendar || BUILTIN;
    var exchangeId = opts.exchange || DEFAULT_EXCHANGE;
    var ex = (calendar.exchanges && calendar.exchanges[exchangeId]) ||
             BUILTIN.exchanges[DEFAULT_EXCHANGE];
    var tz = ex.timezone || "America/New_York";
    var weekdays = ex.weekdays || [1, 2, 3, 4, 5];
    var holidays = ex.holidays || [];

    /* Ein Handelstag ist ein Datum, kein Zeitpunkt. Wer ihn als
       "YYYY-MM-DD" uebergibt, meint genau diesen Tag - und er wird NICHT
       durch eine Zeitzone geschickt. Sonst wird aus dem Schlusskurs vom
       4. September der vom 3.: Mitternacht UTC ist in New York der
       Vorabend. Genau dieser Fehler ist beim Anbinden an echte Daten
       aufgefallen. */
    var vonDatum = typeof fromMs === "string" && /^\d{4}-\d{2}-\d{2}/.test(fromMs)
      ? fromMs.slice(0, 10)
      : (localParts(fromMs, tz) || {}).date;
    var bisDatum = typeof toMs === "string" && /^\d{4}-\d{2}-\d{2}T/.test(toMs)
      ? (localParts(toMs, tz) || {}).date
      : (typeof toMs === "string" && /^\d{4}-\d{2}-\d{2}$/.test(toMs)
          ? toMs
          : (localParts(toMs, tz) || {}).date);
    if (!vonDatum || !bisDatum) return null;
    if (bisDatum <= vonDatum) return 0;
    var von = { date: vonDatum };
    var bis = { date: bisDatum };

    /* Tageweise vorwaerts. Der Abstand, um den es geht, ist klein - ein
       Tagesschluss, der Hunderte Handelstage alt ist, hat sein Urteil
       laengst. Die Obergrenze verhindert nur, dass ein kaputter
       Zeitstempel eine Endlosschleife ergibt. */
    var count = 0;
    var d = new Date(von.date + "T12:00:00Z");
    for (var i = 0; i < 400; i++) {
      d.setUTCDate(d.getUTCDate() + 1);
      var iso = d.toISOString().slice(0, 10);
      if (iso > bis.date) break;
      var wd = d.getUTCDay();
      if (weekdays.indexOf(wd) !== -1 && holidays.indexOf(iso) === -1) count++;
    }
    return count;
  }

  function expectsUpdates(session, includeExtended) {
    if (!session) return false;
    if (session.phase === "REGULAR") return true;
    if (includeExtended === true && (session.phase === "PRE" || session.phase === "AFTER")) return true;
    return false;
  }

  var api = {
    PHASES: PHASES,
    DEFAULT_EXCHANGE: DEFAULT_EXCHANGE,
    BUILTIN_CALENDAR: BUILTIN,
    localParts: localParts,
    sessionAt: sessionAt,
    tradingDaysBetween: tradingDaysBetween,
    expectsUpdates: expectsUpdates
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.MarketHours = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
