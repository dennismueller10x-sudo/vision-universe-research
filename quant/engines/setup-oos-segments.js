/* =========================================================================
   SETUP OOS SEGMENTS (setup-oos-segments-1.0.0) - A4 und Messbarkeit.

   Ergaenzt den Auswerter quant/engines/setup-oos.cjs (setup-oos-1.0.0) um
   die beiden Teile der Entscheidungsvorlage
   docs/quant/SETUP_OOS_DECISION_A1_A6.md, die dort noch fehlten:

     A4  Auswertung je Ereignisart (evaluateByEventKind): jede freigegebene
         Ereignisart (z. B. SETUP_NEW und SETUP_CONFIRMED) wird fuer sich
         mit dem unveraenderten Auswerter geprueft (Einstiegsvariante und
         Horizont aus der Segmentierung). Das Gate besteht nur, wenn jede
         Art besteht. A1/A2/A3/A5 bleiben im Auswerter (Schnitt, Embargo,
         Kriterium, countBy), A6 im Zeilenexport von build-setup-outcomes.mjs.
     Messbarkeit (projectReadiness): wann die Segmente einer Segmentierung
         aus den ECHTEN Ereignistagen bis heute plus einer offen benannten
         Annahme fuer die Zukunft fruehestens messbar sind.

   Setzt keine Norm:
     - Ohne population in einer FREIGEGEBENEN Segmentierung
       (segmentationFromMethodology) gibt es keine Auswertung je Art; der
       Zertifizierungs-Builder rechnet dann wie bisher.
     - Keine Schwelle, kein Standardschnitt, kein Standardkriterium.
       oosMinPerSegment kommt aus dem Vertrag.
     - Die Projektion ist eine Schaetzung (ein Ereignistag je Wochentag,
       ohne Feiertage, also eher zu frueh; Reife eines Ergebnisses nach
       maturityDays Kalendertagen, Standard 183 wie die Builder-ETA
       firstCompletedM6). Sie speist kein Gate.

   UMD: globalThis.VUSetupOosSegments im Browser, module.exports in Node.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Oos = isNode ? require("./setup-oos.cjs") : global.VUSetupOos;

  var VERSION = "setup-oos-segments-1.0.0";
  var DAY = 86400000;
  var EVENT_KINDS = ["SETUP_NEW", "SETUP_CONFIRMED"];
  var VARIANTS = ["NEXT_CLOSE", "SIGNAL_CLOSE"];
  var HORIZONS = ["m1", "m3", "m6", "m12"];
  /* Reihenfolge der Auswertung im Auswerter: die frueheste Stufe, an der
     eine Art scheitert, bestimmt den Gesamtgrund. */
  var REASON_ORDER = ["OOS_MIN_PER_SEGMENT_INVALID", "OOS_NOT_MEASURABLE_YET", "OOS_SEGMENT_DEFINITION_MISSING", "OOS_SEGMENT_DEFINITION_INVALID",
    "OOS_ROWS_NOT_EXPORTED", "OOS_SEGMENT_TOO_SMALL", "OOS_DIRECTION_NOT_REPLICATED"];

  function isDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var t = Date.parse(s + "T00:00:00Z");
    return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
  }
  function ms(s) { return Date.parse(s + "T00:00:00Z"); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(s, n) { return iso(ms(s) + n * DAY); }
  function isWeekday(s) { var d = new Date(ms(s)).getUTCDay(); return d !== 0 && d !== 6; }

  /** population = { eventKinds, entryVariant, horizon }; null wenn ungueltig. */
  function validPopulation(p) {
    if (!p || typeof p !== "object") return false;
    if (!Array.isArray(p.eventKinds) || !p.eventKinds.length) return false;
    if (new Set(p.eventKinds).size !== p.eventKinds.length) return false;
    for (var i = 0; i < p.eventKinds.length; i++) if (EVENT_KINDS.indexOf(p.eventKinds[i]) < 0) return false;
    return VARIANTS.indexOf(p.entryVariant) >= 0 && HORIZONS.indexOf(p.horizon) >= 0;
  }

  /** Nur die Felder, die der Auswerter kennt (ohne population/approval). */
  function evaluatorSegmentation(s) {
    var out = { id: s.id, method: s.method, embargoDays: s.embargoDays, criterion: s.criterion };
    if (s.cutDate !== undefined) out.cutDate = s.cutDate;
    if (s.countBy !== undefined) out.countBy = s.countBy;
    return out;
  }

  function rowsFor(rowsDoc, kind, p) {
    var r = rowsDoc && rowsDoc.rows && rowsDoc.rows[kind] && rowsDoc.rows[kind][p.entryVariant] && rowsDoc.rows[kind][p.entryVariant][p.horizon];
    return Array.isArray(r) ? r : null;
  }

  /**
   * A4: Auswertung je Ereignisart.
   * input { segmentation (mit population), rowsDoc (setup-oos-rows-1.0.0) | null,
   *         completedByKind { SETUP_NEW: n, ... } (nur ohne rowsDoc), minPerSegment }
   * Ausgabe wie evaluateSetupOos (status, reasonCode, segmentation, ...) plus
   * byKind { <Art>: Ergebnis des Auswerters } und population.
   */
  function evaluateByEventKind(input) {
    var inp = input || {};
    var s = inp.segmentation;
    var base = { schemaVersion: VERSION, evaluator: Oos.VERSION, minPerSegment: Number.isSafeInteger(inp.minPerSegment) ? inp.minPerSegment : null,
      segmentation: s && typeof s.id === "string" ? s.id : null, population: null, byKind: null };
    if (!Number.isSafeInteger(inp.minPerSegment) || inp.minPerSegment < 1) return Object.assign(base, { status: "FAIL", reasonCode: "OOS_MIN_PER_SEGMENT_INVALID" });
    if (s === null || s === undefined) return Object.assign(base, { status: "FAIL", reasonCode: "OOS_SEGMENT_DEFINITION_MISSING" });
    if (!validPopulation(s.population)) return Object.assign(base, { status: "FAIL", reasonCode: "OOS_SEGMENT_DEFINITION_INVALID" });
    var p = s.population, seg = evaluatorSegmentation(s), byKind = {}, worst = null, allPass = true;
    if (inp.rowsDoc !== null && inp.rowsDoc !== undefined && inp.rowsDoc.schemaVersion !== "setup-oos-rows-1.0.0") throw Error("SETUP_OOS_ROWS_SCHEMA_UNKNOWN");
    for (var i = 0; i < p.eventKinds.length; i++) {
      var k = p.eventKinds[i];
      var completed = inp.completedByKind && Number.isSafeInteger(inp.completedByKind[k]) ? inp.completedByKind[k] : 0;
      var r = Oos.evaluateSetupOos({ rows: rowsFor(inp.rowsDoc, k, p), completedCount: completed, minPerSegment: inp.minPerSegment, segmentation: seg });
      byKind[k] = r;
      if (r.status !== "PASS") {
        allPass = false;
        if (worst === null || REASON_ORDER.indexOf(r.reasonCode) < REASON_ORDER.indexOf(worst)) worst = r.reasonCode;
      }
    }
    return Object.assign(base, { status: allPass ? "PASS" : "FAIL", reasonCode: allPass ? null : worst,
      population: { eventKinds: p.eventKinds.slice(), entryVariant: p.entryVariant, horizon: p.horizon }, byKind: byKind });
  }

  /** Fortschreibung: Ereignistage ab from (einschliesslich) bis to (ausschliesslich, null = offen). */
  function nthProjectedDay(from, to, n) {
    if (n <= 0) return null;
    var d = from, c = 0;
    for (var guard = 0; guard < 40000; guard++) {
      if (to !== null && d >= to) return null;
      if (isWeekday(d) && ++c === n) return d;
      d = addDays(d, 1);
    }
    return null;
  }

  /**
   * Fruehester Messzeitpunkt einer Segmentierung mit festem Schnitt.
   * input { eventDates: [YYYY-MM-DD] (echte Ereignistage einer Art, Duplikate
   *         erlaubt = Zeilen), asOf, segmentation (FIXED_CALENDAR_CUT),
   *         minPerSegment, maturityDays (Standard 183) }
   * Gezaehlt wird wie countBy der Segmentierung (EVENT_DAY: Tage; sonst
   * Zeilen, fortgeschrieben mit dem Median der Zeilen je beobachtetem Tag).
   */
  function projectReadiness(input) {
    var inp = input || {};
    var s = inp.segmentation, min = inp.minPerSegment, asOf = inp.asOf;
    var maturity = Number.isSafeInteger(inp.maturityDays) && inp.maturityDays > 0 ? inp.maturityDays : 183;
    var out = { schemaVersion: VERSION, basis: "ESTIMATE_ONE_EVENT_DAY_PER_WEEKDAY_NO_HOLIDAYS", maturityDays: maturity, asOf: asOf || null };
    if (!Number.isSafeInteger(min) || min < 1 || !isDate(asOf)) return Object.assign(out, { state: "INPUT_INVALID" });
    if (!s || s.method !== "FIXED_CALENDAR_CUT" || !isDate(s.cutDate) || !Number.isSafeInteger(s.embargoDays) || s.embargoDays < 0)
      return Object.assign(out, { state: "NOT_PROJECTABLE", note: "nur fuer einen festen Kalenderschnitt (A1 b) berechenbar" });
    var countBy = s.countBy === "EVENT_DAY" ? "EVENT_DAY" : "ROWS";
    var dates = (inp.eventDates || []).filter(function (d) { return isDate(d) && d <= asOf; }).sort();
    var perDay = {};
    dates.forEach(function (d) { perDay[d] = (perDay[d] || 0) + 1; });
    var days = Object.keys(perDay).sort();
    var counts = days.map(function (d) { return perDay[d]; }).sort(function (a, b) { return a - b; });
    var rowsPerDay = counts.length ? (counts.length % 2 ? counts[counts.length >> 1] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2) : 0;
    var unit = function (d) { return countBy === "EVENT_DAY" ? 1 : perDay[d]; };
    var perProjected = countBy === "EVENT_DAY" ? 1 : rowsPerDay;
    var cut = s.cutDate;
    /* Lernsegment: date + embargo < cut, also date < trainEnd. */
    var trainEnd = addDays(cut, -s.embargoDays);
    var next = addDays(asOf, 1);

    function segment(from, to) {
      var obs = days.filter(function (d) { return d >= from && (to === null || d < to); });
      var have = 0, reached = null;
      for (var i = 0; i < obs.length; i++) { have += unit(obs[i]); if (reached === null && have >= min) reached = obs[i]; }
      var res = { from: from, to: to, observed: { eventDays: obs.length, count: have, first: obs[0] || null, last: obs[obs.length - 1] || null } };
      if (reached === null) {
        if (!perProjected) return Object.assign(res, { minReachedOn: null, measurableFrom: null, state: "NO_EVENTS_TO_PROJECT" });
        var start = from > next ? from : next;
        reached = nthProjectedDay(start, to, Math.ceil((min - have) / perProjected));
        if (reached === null) return Object.assign(res, { minReachedOn: null, measurableFrom: null, state: "CANNOT_REACH_MIN" });
        res.projected = true;
      } else res.projected = false;
      var m = addDays(reached, maturity);
      return Object.assign(res, { minReachedOn: reached, measurableFrom: m, state: m <= asOf ? "MATURE" : res.projected ? "PROJECTED" : "WAITING_FOR_MATURITY" });
    }
    var first = days[0] || null;
    var train = segment(first || "0000-01-01", trainEnd), test = segment(cut, null);
    var earliest = train.measurableFrom && test.measurableFrom ? (train.measurableFrom > test.measurableFrom ? train.measurableFrom : test.measurableFrom) : null;
    return Object.assign(out, { countBy: countBy, minPerSegment: min, cutDate: cut, embargoDays: s.embargoDays, trainEventsBefore: trainEnd, rowsPerEventDay: rowsPerDay,
      train: train, test: test, earliestMeasurable: earliest,
      state: earliest === null ? "CANNOT_REACH_MIN" : earliest <= asOf ? "MEASURABLE" : "INSUFFICIENT_HISTORY" });
  }

  var api = { VERSION: VERSION, EVENT_KINDS: EVENT_KINDS, VARIANTS: VARIANTS, HORIZONS: HORIZONS, REASON_ORDER: REASON_ORDER,
    validPopulation: validPopulation, evaluateByEventKind: evaluateByEventKind, projectReadiness: projectReadiness };
  if (isNode) module.exports = api;
  else global.VUSetupOosSegments = api;
})(typeof window !== "undefined" ? window : globalThis);
