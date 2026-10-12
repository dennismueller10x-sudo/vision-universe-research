/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/data-freshness.js
   DATENSTAND-RICHTLINIE FUER KUNDENSICHTBARE TECHNISCHE THESEN (data-freshness-1.0.0)

   Eine regelkonforme Elliott-These ist keine aktuelle Kundenthese, wenn die Kursreihe darunter wesentlich veraltet ist.
   Das Modul ist rein und deterministisch (kein Netz, keine Uhr ausser dem uebergebenen Bezugstag) und aendert keine Analyse:
   es ordnet die letzte Bar eines Titels dem Bezugstag des Marktes zu und liefert einen Zustand.

   ZUSTAENDE
     FRESH        letzte Bar hoechstens 1 Handelstag vor dem Bezugstag (normale Veroeffentlichungsverzoegerung) – unveraendert.
     DELAYED      2 bis 5 Handelstage – nutzbar, der Kunde sieht den Hinweis "Kursdaten verzoegert · letzter Stand …".
     STALE        mehr als 5 Handelstage – die laufende These wird zurueckgehalten; die Historie bleibt erhalten.
     NON_TRADING  der Wertpapierstamm fuehrt den Titel als nicht mehr gehandelt (inaktiv/delisted) UND die Reihe ist nicht frisch –
                  ebenfalls zurueckgehalten, aber mit eigener Begruendung.

   SCHWELLEN (aus der Bestandsaufnahme des Produktuniversums, 2026-10-12: 4.979 von 5.035 Titeln mit Alter 0, danach eine Luecke;
   die uebrigen 56 Titel liegen bei 2 bis 41 Handelstagen):
     * FRESH <= 1: das Produkt wird nach Boersenschluss gebaut; ein Handelstag Verzug ist die normale Veroeffentlichungslage.
     * DELAYED <= 5: gleiche Grenze wie die bestehende Datenpruefung (quant/engines/market-quality.js, maxStaleTradingDays = 5);
       bis dahin fehlt hoechstens eine Wochenbar der Wochenanalyse.
     * Darueber beschreibt die Kursreihe eine abgeschlossene Vergangenheit, keine laufende Lage.
   Die Schwellen sind keine Ticker-Ausnahmen und nicht auf einzelne Beispiele abgestimmt.

   HANDELSKALENDER: New Yorker Boersen (NYSE/Nasdaq/NYSE American/NYSE Arca). Alle Titel des Produktuniversums sind dort notiert.
   Regelbasiert (Feiertage, Beobachtungsregeln, Karfreitag); bekannte Sonderschliessungen stehen in AD_HOC_CLOSURES.
   Fuer unbekannte Boersen faellt die Zaehlung auf Wochentage zurueck (calendar = "WEEKDAYS").
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "data-freshness-1.0.0";
  var POLICY = Object.freeze({ version: VERSION, freshMaxTradingDays: 1, delayedMaxTradingDays: 5, sessionCompleteUtcHour: 22, calendar: "US_EQUITY" });
  var STATES = Object.freeze({ FRESH: "FRESH", DELAYED: "DELAYED", STALE: "STALE", NON_TRADING: "NON_TRADING" });
  var WITHHELD_STATES = Object.freeze({ STALE: true, NON_TRADING: true });
  var AD_HOC_CLOSURES = Object.freeze({ "2025-01-09": "Staatstrauertag (J. Carter)" });
  var US_VENUES = Object.freeze({ NASDAQ: 1, NYSE: 1, AMEX: 1, "NYSE MKT": 1, "NYSE ARCA": 1, "NYSE AMERICAN": 1, BATS: 1, CBOE: 1, IEX: 1 });
  var DAY = 864e5;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function parse(s) { return new Date(String(s).slice(0, 10) + "T00:00:00Z"); }
  function nthWeekday(y, m, wd, n) { var d = new Date(Date.UTC(y, m, 1)); var delta = (wd - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, m, 1 + delta + (n - 1) * 7)); }
  function lastWeekday(y, m, wd) { var d = new Date(Date.UTC(y, m + 1, 0)); return new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7))); }
  /* Feiertag, der auf Sa/So faellt: NYSE-Regel – Sonntag → Montag, Samstag → Freitag davor (ausser Neujahr: Samstag entfaellt) */
  function observed(d, isNewYear) {
    var w = d.getUTCDay();
    if (w === 0) return new Date(d.getTime() + DAY);
    if (w === 6) return isNewYear ? null : new Date(d.getTime() - DAY);
    return d;
  }
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  var holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    var out = {}, add = function (d) { if (d) out[iso(d)] = 1; };
    add(observed(new Date(Date.UTC(y, 0, 1)), true));
    add(nthWeekday(y, 0, 1, 3));                                   // Martin Luther King Jr. Day
    add(nthWeekday(y, 1, 1, 3));                                   // Presidents' Day
    add(new Date(easter(y).getTime() - 2 * DAY));                  // Karfreitag
    add(lastWeekday(y, 4, 1));                                     // Memorial Day
    if (y >= 2022) add(observed(new Date(Date.UTC(y, 5, 19)), false));   // Juneteenth
    add(observed(new Date(Date.UTC(y, 6, 4)), false));             // Independence Day
    add(nthWeekday(y, 8, 1, 1));                                   // Labor Day
    add(nthWeekday(y, 10, 4, 4));                                  // Thanksgiving
    add(observed(new Date(Date.UTC(y, 11, 25)), false));           // Christmas
    holidayCache[y] = out; return out;
  }

  /** Ist der Tag ein Handelstag? calendar: "US_EQUITY" (Standard) oder "WEEKDAYS". */
  function isTradingDay(dateStr, calendar) {
    var d = parse(dateStr), w = d.getUTCDay();
    if (w === 0 || w === 6) return false;
    if (calendar === "WEEKDAYS") return true;
    return !holidays(d.getUTCFullYear())[iso(d)] && !AD_HOC_CLOSURES[iso(d)];
  }

  /** Anzahl Handelstage nach `from` bis einschliesslich `to` (0, wenn to <= from). */
  function tradingDaysBetween(from, to, calendar) {
    if (!from || !to || to <= from) return 0;
    var n = 0, d = new Date(parse(from).getTime() + DAY), end = parse(to);
    while (d <= end) { if (isTradingDay(iso(d), calendar)) n++; d = new Date(d.getTime() + DAY); }
    return n;
  }

  /** Letzte abgeschlossene Handelssitzung zum Zeitpunkt `nowIso` (UTC). Die Sitzung gilt ab 22:00 UTC (nach US-Schluss in Sommer- und Winterzeit) als abgeschlossen. */
  function lastCompletedSession(nowIso, calendar) {
    var t = new Date(nowIso), day = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    if (!(t.getUTCHours() >= POLICY.sessionCompleteUtcHour && isTradingDay(iso(day), calendar))) day = new Date(day.getTime() - DAY);
    while (!isTradingDay(iso(day), calendar)) day = new Date(day.getTime() - DAY);
    return iso(day);
  }

  function calendarFor(venue) { return venue && !US_VENUES[String(venue).toUpperCase()] ? "WEEKDAYS" : "US_EQUITY"; }

  var REASONS = {
    SECURITY_INACTIVE: "Der Wertpapierstamm führt den Titel als nicht mehr gehandelt.",
    NO_NEWER_BARS: "Der Datenanbieter liefert nach der letzten Bar keine weiteren Kurse (z. B. Übernahme, Handelsaussetzung, Delisting oder Abdeckungslücke); die Ursache ist aus den Daten nicht zu bestimmen.",
    REFRESH_STOPPED: "Die Kursreihe wird seit der letzten Bar nicht mehr aktualisiert; die Ursache ist aus den Daten nicht zu bestimmen.",
    NO_BAR: "Es liegt keine Kursbar vor."
  };

  /**
   * Zustand eines Titels.
   * @param in { lastBar: 'YYYY-MM-DD', reference: 'YYYY-MM-DD' (letzte abgeschlossene Sitzung), venue, active (false = inaktiv), delistedAt, refreshedAt: 'YYYY-MM-DD'|null }
   * @returns { version, state, lastBar, reference, ageTradingDays, calendar, withheld, reason:{code,known,text}|null }
   *   `reason.known` ist true nur, wenn der Wertpapierstamm den Grund belegt (SECURITY_INACTIVE); sonst false → zur Untersuchung ausweisen.
   */
  function classify(inp) {
    inp = inp || {};
    var cal = inp.calendar || calendarFor(inp.venue);
    var base = { version: VERSION, lastBar: inp.lastBar || null, reference: inp.reference || null, calendar: cal };
    if (!inp.lastBar || !inp.reference) return Object.assign(base, { state: STATES.STALE, ageTradingDays: null, withheld: true, reason: { code: "NO_BAR", known: false, text: REASONS.NO_BAR } });
    var age = tradingDaysBetween(inp.lastBar, inp.reference, cal), inactive = inp.active === false || !!inp.delistedAt, state;
    if (age <= POLICY.freshMaxTradingDays) state = STATES.FRESH;
    else if (inactive) state = STATES.NON_TRADING;
    else if (age <= POLICY.delayedMaxTradingDays) state = STATES.DELAYED;
    else state = STATES.STALE;
    var reason = null;
    if (state !== STATES.FRESH) {
      if (inactive) reason = { code: "SECURITY_INACTIVE", known: true, text: REASONS.SECURITY_INACTIVE };
      else if (inp.refreshedAt && tradingDaysBetween(inp.lastBar, inp.refreshedAt, cal) >= POLICY.delayedMaxTradingDays) reason = { code: "NO_NEWER_BARS", known: false, text: REASONS.NO_NEWER_BARS };
      else reason = { code: "REFRESH_STOPPED", known: false, text: REASONS.REFRESH_STOPPED };
    }
    return Object.assign(base, { state: state, ageTradingDays: age, withheld: !!WITHHELD_STATES[state], reason: reason });
  }

  /** Kompakte Form fuer Index, Shards und Register ({st,age,last,ref,rc}); gleiche Felder an allen Stellen. */
  function compact(f) { return { st: f.state, age: f.ageTradingDays, last: f.lastBar, ref: f.reference, rc: f.reason ? f.reason.code : null }; }

  /** Kundentexte (Deutsch). */
  function labels(f) {
    var d = f.lastBar ? f.lastBar.slice(8, 10) + "." + f.lastBar.slice(5, 7) + "." + f.lastBar.slice(0, 4) : "–";
    if (f.state === STATES.DELAYED) return { badge: "Kursdaten verzögert · letzter Stand " + d, line: "Datenstand: " + d + " · verzögert", title: null, text: null };
    if (f.state === STATES.STALE) return { badge: "Zurückgehalten – Kursdaten veraltet", line: "Datenstand: " + d, title: "Analyse zurückgehalten", text: "Die Kursreihe ist nicht aktuell genug für eine laufende technische These." };
    if (f.state === STATES.NON_TRADING) return { badge: "Zurückgehalten – Titel nicht mehr gehandelt", line: "Datenstand: " + d, title: "Analyse zurückgehalten", text: "Der Titel wird laut Wertpapierstamm nicht mehr gehandelt. Die Kursreihe beschreibt keine laufende Lage." };
    return { badge: null, line: null, title: null, text: null };
  }

  var api = { VERSION: VERSION, POLICY: POLICY, STATES: STATES, WITHHELD_STATES: WITHHELD_STATES, isTradingDay: isTradingDay, tradingDaysBetween: tradingDaysBetween,
              lastCompletedSession: lastCompletedSession, calendarFor: calendarFor, classify: classify, compact: compact, labels: labels, isWithheld: function (st) { return !!WITHHELD_STATES[st]; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.DataFreshness = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
