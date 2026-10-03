/* =========================================================================
   VISION UNIVERSE — canonical-total-return.js

   EIGENE GESAMTRENDITE AUS ROHDATEN   (Owner-Entscheidung 03.10.2026, Option a)

   Bisher war die Gesamtrendite die adjustedClose-Spalte des Anbieters. Wo
   die eine Ausschuettung oder einen Split nicht mitgemacht hatte, gab es
   keine Gesamtrendite - und das bei rund 14 % der Titel. Diese Datei
   rechnet sie selbst, aus genau den Spalten, die jede Tageskerze ohnehin
   traegt:

     close        roher Schlusskurs des Tages (unbereinigt)
     splitFactor  neue Aktien je alter Aktie am Ex-Tag (1 = kein Split)
     dividend     Bardividende je Aktie am Ex-Tag, in Aktien DIESES Tages
     date         Handelstag

   Keine neue Datenquelle, keine Schaetzung. adjustedClose dient nur noch
   als GEGENPROBE (CROSS_CHECK), nie als Quelle.

   SEMANTIK (verbindlich, keine Mischbasis)

     PRICE_RETURN  splitbereinigte Kursentwicklung ohne Ausschuettungen
                   g_t = s_t * close_t / close_{t-1}
     TOTAL_RETURN  splitbereinigte Kursentwicklung mit Ausschuettungen,
                   am Ex-Tag zum Schlusskurs reinvestiert
                   g_t = s_t * (close_t + D_t) / close_{t-1}

   Der Index wird rueckwaerts normiert: der letzte Wert ist der letzte
   rohe Schlusskurs, jeder fruehere I_{t-1} = I_t / g_t. Renditen haengen
   nur an Verhaeltnissen; die Normierung macht den Index mit der
   bereinigten Spalte des Anbieters vergleichbar.

   CORPORATE-ACTION-VERTRAG  (corporate-action-contract-1.0.0)

     Split            s_t > 1 am Ex-Tag. Ab diesem Tag gilt der neue Kurs;
                      wer eine Aktie hielt, haelt s_t Aktien.
     Reverse Split    s_t < 1, dieselbe Formel.
     Bardividende     D_t > 0 am Ex-Tag, reinvestiert zum Schluss des Ex-Tags.
     Sonderdividende  dieselbe Formel. Als SPECIAL markiert ab einer
                      Ausschuettung von 10 % des Vortagesschlusses - nur
                      gezaehlt, nicht anders gerechnet.
     Split + Dividende am selben Tag: D_t gilt je NEUER Aktie,
                      g_t = s_t * (close_t + D_t) / close_{t-1}.
     Fehlende Corporate Action
                      Fehlt das Feld (null), ist die Reihe nicht
                      rekonstruierbar: TOTAL_RETURN_UNAVAILABLE. Bewegt
                      sich die Anbieterspalte an einem Tag ohne erfasstes
                      Ereignis wie eine Ausschuettung oder ein Split, fehlt
                      uns ein Ereignis: TOTAL_RETURN_UNAVAILABLE.
     Fehlende Handelstage
                      Die Rendite laeuft ueber die Luecke (Kurs vor und
                      nach). Ohne Gegenprobe kann eine Ausschuettung in
                      der Luecke nicht ausgeschlossen werden: dann
                      TOTAL_RETURN_UNAVAILABLE. Luecken ueber 365 Tage sind
                      ein neues Listing (Listing-Regel) und keine Luecke.
     Finaler Listing-Tag / Delisting
                      Der Index endet mit der letzten Kerze. Ein
                      Abfindungs- oder Liquidationserloes steht nicht in
                      den Daten und wird nicht geschaetzt
                      (terminal: DELISTING_PROCEEDS_UNKNOWN).

   Widerspruechliche Angaben (Split <= 0 oder ausserhalb 1:1000..1000:1,
   negative Dividende, Dividende ueber dem Vortageskurs, Ereignistag mit
   einer Bruttorendite ausserhalb 0,4..2,5) sind kein Ereignis, sondern ein
   Datenfehler: TOTAL_RETURN_UNAVAILABLE.

   GEGENPROBE GEGEN DEN ANBIETER

   Der Anbieterfaktor f_t = adjustedClose_t / close_t aendert sich nur an
   Ereignistagen. Erwartet wird f_{t-1}/f_t = (1 - s_t*D_t/close_{t-1}) / s_t.
     - Ereignistag, Anbieter passt          -> Paritaet
     - Ereignistag, Anbieter passt nicht    -> PROVIDER_MISSED (Kanon gewinnt)
     - kein Ereignis, Anbieter springt wie ein Split und der Rohkurs mit
                                            -> SPLIT_MISSING (unser Input fehlt)
     - kein Ereignis, Anbieter senkt den Faktor (Ausschuettungsrichtung)
                                            -> DIVIDEND_MISSING, ausser eine
                                               unerklaerte eigene Dividende
                                               liegt hoechstens 3 Kerzen
                                               daneben (DATE_SHIFT)
     - viele kleine Schritte unter der Rauschschwelle, zusammen ueber 0,5 %
       Abschlag                             -> DIVIDEND_MISSING (CUMULATIVE_DRIFT)
     - kein Ereignis, Anbieter hebt den Faktor
                                            -> PROVIDER_STITCH (Anbieterspalte
                                               aus zwei Abrufen, Kanon gewinnt)
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var VERSION = "canonical-total-return-1.0.0";
  var CORPORATE_ACTION_CONTRACT = "corporate-action-contract-1.0.0";
  var BENCHMARK_CONTRACT = "benchmark-contract-1.0.0";

  var CONFIG = {
    splitMin: 1 / 1000, splitMax: 1000,
    eventGrossMin: 0.4, eventGrossMax: 2.5,
    specialDividendShare: 0.10,
    maxGapWeekdays: 5,
    listingGapDays: 365,
    factorNoise: 0.001,            // Faktorbewegung, die als Rauschen gilt
    splitParityTolerance: 0.01,
    dividendBand: 0.40,            // beobachteter Schritt 0,6..1,4 des erwarteten
    dividendAbsTolerance: 0.0005,
    splitLikeMove: 0.25,           // Rohkurs bewegt sich mindestens so stark
    splitLikeMatch: 0.04,          // Anbieterfaktor folgt dem Rohkurs so genau
    suspectedSplitMove: 0.30,
    splitRatios: [2, 3, 4, 5, 6, 7, 8, 10, 20, 1.5],
    shiftWindow: 3,
    maxUnexplainedDrift: 0.005     // kumuliert, unter der Rauschschwelle
  };

  var REASON_BUCKET = {
    DIVIDEND_MISSING: "REJECTED_DIVIDEND_GAP",
    DIVIDEND_FIELD_MISSING: "REJECTED_DIVIDEND_GAP",
    SPLIT_MISSING: "REJECTED_SPLIT_GAP",
    SPLIT_SUSPECTED: "REJECTED_SPLIT_GAP",
    SPLIT_FACTOR_FIELD_MISSING: "REJECTED_SPLIT_GAP",
    IDENTITY_UNCERTAIN: "REJECTED_IDENTITY",
    LISTING_DISCONTINUITY: "REJECTED_IDENTITY"
  };
  function bucketOf(reason) { return reason ? (REASON_BUCKET[reason] || "REJECTED_OTHER") : null; }

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return String(d).slice(0, 10); }
  function round(v, d) { if (!isNum(v)) return null; var f = Math.pow(10, d == null ? 6 : d); return Math.round(v * f) / f; }

  function weekdaysBetween(a, b) {
    var t = Date.parse(a + "T00:00:00Z") + 864e5, end = Date.parse(b + "T00:00:00Z"), n = 0;
    for (; t < end; t += 864e5) { var w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }

  function looksLikeSplit(ratio) {
    for (var i = 0; i < CONFIG.splitRatios.length; i++) {
      var r = CONFIG.splitRatios[i];
      if (Math.abs(ratio - r) / r <= 0.04) return true;
      if (Math.abs(ratio - 1 / r) * r <= 0.04) return true;
    }
    return false;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
  }

  /**
   * Rekonstruiert die Gesamtrendite einer Reihe.
   *
   * @param {Array}  bars     aufsteigend: {date, close, splitFactor, dividend, adjustedClose?}
   * @param {object} options  {identity: {state, reason}, role, delisted, asOf, maxStaleDays}
   *   identity.state muss CONFIRMED sein. Ohne Angabe gilt die Identitaet
   *   als ungeprueft - und eine ungepruefte Identitaet ergibt keine
   *   Gesamtrendite.
   * @returns {object} {contract, state, reason, bucket, tr, events, crossCheck, ...}
   */
  function reconstruct(bars, options) {
    options = options || {};
    var role = options.role || "STUDY_SECURITY";
    var head = { contract: VERSION, corporateActionContract: CORPORATE_ACTION_CONTRACT, role: role };
    if (role === "BENCHMARK_REFERENCE") head.benchmarkContract = BENCHMARK_CONTRACT;
    var unavailable = function (reason, extra) {
      return Object.assign({}, head, { state: "TOTAL_RETURN_UNAVAILABLE", reconstructed: false, reason: reason,
                                       bucket: bucketOf(reason), tr: null }, extra || {});
    };

    var identity = options.identity || { state: "UNVERIFIED" };
    if (identity.state !== "CONFIRMED") return unavailable("IDENTITY_UNCERTAIN", { identity: identity });
    if (!Array.isArray(bars) || bars.length < 2) return unavailable("NO_BARS");

    var n = bars.length, i;
    for (i = 0; i < n; i++) {
      var b = bars[i];
      if (!b || !isNum(b.close) || b.close <= 0) return unavailable("RAW_CLOSE_MISSING", { date: b ? day(b.date) : null });
      if (b.splitFactor === null || b.splitFactor === undefined) return unavailable("SPLIT_FACTOR_FIELD_MISSING", { date: day(b.date) });
      if (b.dividend === null || b.dividend === undefined) return unavailable("DIVIDEND_FIELD_MISSING", { date: day(b.date) });
      if (!isNum(b.splitFactor) || !isNum(b.dividend)) return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: day(b.date), detail: "NOT_NUMERIC" });
      if (i && !(day(b.date) > day(bars[i - 1].date))) return unavailable("UNSORTED", { date: day(b.date) });
    }
    var last = day(bars[n - 1].date);
    if (options.asOf && isNum(options.maxStaleDays)) {
      var lag = Math.round((Date.parse(options.asOf) - Date.parse(last)) / 864e5);
      if (lag > options.maxStaleDays) return unavailable("STALE", { last: last, lagDays: lag });
    }

    /* 1. Ereignisse pruefen und Bruttorenditen bilden. */
    var gross = new Float64Array(n), price = new Float64Array(n);
    var events = { splits: 0, reverseSplits: 0, dividends: 0, specialDividends: 0, splitWithDividend: 0 };
    var gaps = [];
    gross[0] = 1; price[0] = 1;
    for (i = 1; i < n; i++) {
      var cur = bars[i], prev = bars[i - 1], d = day(cur.date);
      var s = cur.splitFactor, D = cur.dividend;
      var gapDays = (Date.parse(d) - Date.parse(day(prev.date))) / 864e5;
      if (gapDays > CONFIG.listingGapDays) return unavailable("LISTING_DISCONTINUITY", { date: d, gapDays: gapDays });
      var wd = weekdaysBetween(day(prev.date), d);
      if (wd > CONFIG.maxGapWeekdays) gaps.push({ from: day(prev.date), to: d, missingWeekdays: wd });
      if (!(s > 0) || s < CONFIG.splitMin || s > CONFIG.splitMax) return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: d, detail: "SPLIT_FACTOR_OUT_OF_RANGE", splitFactor: s });
      if (D < 0) return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: d, detail: "NEGATIVE_DIVIDEND" });
      var isSplit = Math.abs(s - 1) > 1e-9, isDiv = D > 0;
      if (isDiv && D * s >= prev.close) return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: d, detail: "DIVIDEND_ABOVE_PRICE" });
      if (!isSplit) s = 1;
      /* Ein Split muss sich im Rohkurs zeigen: erklaert "kein Split" die
         Bewegung besser als der gemeldete Faktor, widerspricht der Faktor
         dem Kurs. Erst ab 1,25:1 pruefbar - darunter (Aktiendividende)
         ist der Sprung nicht von Marktbewegung zu trennen. */
      if (isSplit && Math.abs(Math.log(s)) >= Math.log(1.25) &&
          Math.abs(Math.log(s * cur.close / prev.close)) > Math.abs(Math.log(cur.close / prev.close))) {
        return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: d, detail: "SPLIT_NOT_IN_RAW_PRICE", splitFactor: s });
      }
      var g = s * (cur.close + D) / prev.close;
      if ((isSplit || isDiv) && (g < CONFIG.eventGrossMin || g > CONFIG.eventGrossMax)) {
        return unavailable("CORPORATE_ACTION_CONTRADICTED", { date: d, detail: "EVENT_GROSS_OUT_OF_BAND", gross: round(g, 4) });
      }
      if (isSplit) { if (s > 1) events.splits++; else events.reverseSplits++; }
      if (isDiv) { events.dividends++; if (D * s / prev.close >= CONFIG.specialDividendShare) events.specialDividends++; }
      if (isSplit && isDiv) events.splitWithDividend++;
      gross[i] = g;
      price[i] = s * cur.close / prev.close;
    }

    /* 2. Gegenprobe gegen die Anbieterspalte. */
    var cc = crossCheck(bars, gross);
    if (cc.blocking) return unavailable(cc.blocking.reason, { date: cc.blocking.date, events: events, crossCheck: cc.summary });
    if (!cc.summary.available && gaps.length) return unavailable("TRADING_GAP_UNVERIFIED", { gaps: gaps.length, firstGap: gaps[0], events: events });
    if (!cc.summary.available) {
      /* Ohne Anbieterspalte bleibt nur der Rohkurs: springt er wie ein
         Split ohne erfassten Split, fehlt vermutlich der Faktor. */
      for (i = 1; i < n; i++) {
        if (Math.abs(bars[i].splitFactor - 1) > 1e-9) continue;
        var r = bars[i].close / bars[i - 1].close;
        if (Math.abs(r - 1) >= CONFIG.suspectedSplitMove && looksLikeSplit(r)) {
          return unavailable("SPLIT_SUSPECTED", { date: day(bars[i].date), rawRatio: round(r, 4), events: events });
        }
      }
    }

    /* 3. Index rueckwaerts normiert auf den letzten Rohkurs. */
    var tr = new Float64Array(n), pr = new Float64Array(n);
    tr[n - 1] = bars[n - 1].close; pr[n - 1] = bars[n - 1].close;
    for (i = n - 1; i > 0; i--) { tr[i - 1] = tr[i] / gross[i]; pr[i - 1] = pr[i] / price[i]; }

    return Object.assign({}, head, {
      state: "TOTAL_RETURN_RECONSTRUCTED", reconstructed: true, reason: null, bucket: null,
      tr: tr, priceReturnIndex: pr,
      first: day(bars[0].date), last: last, bars: n,
      events: events, tradingGaps: gaps.length,
      terminal: options.delisted ? "DELISTING_PROCEEDS_UNKNOWN" : "OPEN",
      identity: identity,
      crossCheck: cc.summary
    });
  }

  /**
   * Gegenprobe. Liefert {summary, blocking}; blocking ist gesetzt, wenn
   * der Anbieter ein Ereignis zeigt, das unseren Inputs fehlt.
   */
  function crossCheck(bars, gross) {
    var n = bars.length, i;
    var f = new Array(n), avail = 0;
    for (i = 0; i < n; i++) {
      var a = bars[i].adjustedClose;
      f[i] = isNum(a) && a > 0 ? a / bars[i].close : null;
      if (f[i] !== null) avail++;
    }
    var summary = { available: avail >= 2, days: 0, medianAbsDailyDiff: null, p95AbsDailyDiff: null, maxAbsDailyDiff: null,
                    maxLevelDiff: null, dividendEvents: 0, dividendParity: 0, splitEvents: 0, splitParity: 0,
                    providerMissed: 0, providerStitch: 0, providerAnomaly: 0, dateShift: 0, state: "NOT_AVAILABLE" };
    if (!summary.available) return { summary: summary, blocking: null };

    var diffs = [], unexplained = [], unmatchedOwn = [], drift = 0;
    for (i = 1; i < n; i++) {
      if (f[i] === null || f[i - 1] === null) continue;
      var cur = bars[i], prev = bars[i - 1];
      var s = Math.abs(cur.splitFactor - 1) > 1e-9 ? cur.splitFactor : 1, D = cur.dividend;
      var rp = cur.adjustedClose / prev.adjustedClose;
      diffs.push(Math.abs(gross[i] / rp - 1));
      var mObs = f[i - 1] / f[i];
      var isSplit = s !== 1, isDiv = D > 0;
      if (isSplit || isDiv) {
        var delta = s * D / prev.close;
        var mExp = (1 - delta) / s;
        /* Eine Toleranz fuer beide Ereignisarten: der Dividendenanteil im
           Band (0,6..1,4 des erwarteten Schritts), der Splitanteil 1 %. */
        var tol = (isDiv ? Math.max(CONFIG.dividendBand * delta, CONFIG.dividendAbsTolerance) : 0) +
                  (isSplit ? CONFIG.splitParityTolerance : 0);
        var ok = Math.abs(mObs / mExp - 1) <= tol;
        if (isDiv) { summary.dividendEvents++; if (ok) summary.dividendParity++; }
        if (isSplit) { summary.splitEvents++; if (ok) summary.splitParity++; }
        if (!ok) { summary.providerMissed++; if (isDiv && !isSplit) unmatchedOwn.push(i); }
        continue;
      }
      var step = 1 - mObs;
      if (Math.abs(step) <= CONFIG.factorNoise) { drift += Math.log(mObs); continue; }
      var raw = cur.close / prev.close;
      if (Math.abs(raw - 1) >= CONFIG.splitLikeMove && Math.abs(mObs / raw - 1) <= CONFIG.splitLikeMatch) {
        return { summary: summary, blocking: { reason: "SPLIT_MISSING", date: day(cur.date) } };
      }
      if (step > 0 && step < 0.5) unexplained.push(i);
      else if (step < 0) summary.providerStitch++;
      else summary.providerAnomaly++;
    }
    /* Viele kleine Schritte unter der Rauschschwelle in Ausschuettungs-
       richtung (etwa kleine Monatsausschuettungen, die uns fehlen) summieren
       sich: ueber 0,5 % unerklaerter Abschlag ist eine fehlende Dividende. */
    summary.unexplainedDrift = round(drift, 6);
    if (drift < Math.log(1 - CONFIG.maxUnexplainedDrift)) {
      return { summary: summary, blocking: { reason: "DIVIDEND_MISSING", date: null, detail: "CUMULATIVE_DRIFT" } };
    }
    /* Ein unerklaerter Ausschuettungsschritt gleich neben einer eigenen
       Dividende, die der Anbieter nicht getroffen hat, ist dieselbe
       Ausschuettung mit verschobenem Datum - kein fehlendes Ereignis. */
    for (var k = 0; k < unexplained.length; k++) {
      var at = unexplained[k], j = -1;
      for (var m = 0; m < unmatchedOwn.length; m++) {
        if (unmatchedOwn[m] !== null && Math.abs(unmatchedOwn[m] - at) <= CONFIG.shiftWindow) { j = m; break; }
      }
      if (j < 0) return { summary: summary, blocking: { reason: "DIVIDEND_MISSING", date: day(bars[at].date) } };
      unmatchedOwn[j] = null; summary.dateShift++;
    }

    diffs.sort(function (x, y) { return x - y; });
    summary.days = diffs.length;
    summary.medianAbsDailyDiff = round(quantile(diffs, 0.5), 6);
    summary.p95AbsDailyDiff = round(quantile(diffs, 0.95), 6);
    summary.maxAbsDailyDiff = round(diffs.length ? diffs[diffs.length - 1] : null, 6);
    /* Niveau: kanonischer Index gegen Anbieterspalte, beide am letzten Tag
       auf den letzten Rohkurs normiert. */
    var tr = bars[n - 1].close, lastAdj = isNum(bars[n - 1].adjustedClose) && bars[n - 1].adjustedClose > 0 ? bars[n - 1].adjustedClose : null;
    var maxLevel = 0;
    if (lastAdj !== null) {
      for (i = n - 1; i >= 0; i--) {
        if (i < n - 1) tr = tr / gross[i + 1];
        var a = bars[i].adjustedClose;
        if (isNum(a) && a > 0) { var dev = Math.abs((tr / bars[n - 1].close) / (a / lastAdj) - 1); if (dev > maxLevel) maxLevel = dev; }
      }
      summary.maxLevelDiff = round(maxLevel, 6);
    }
    var conflicts = summary.providerMissed - summary.dateShift + summary.providerStitch + summary.providerAnomaly;
    /* MATCH heisst: jedes Ereignis beidseitig gleich verbucht, kein
       unerklaerter Anbieterschritt. Die Tagesabweichung wird gemessen,
       entscheidet aber nicht - an einem Ex-Tag unterscheiden sich die
       Konventionen (Reinvestition (P+D)/P_vor gegen Anbieterfaktor
       P/(P_vor-D)) um etwa (D/P)^2, das ist kein Widerspruch. */
    summary.state = conflicts <= 0 ? "MATCH" : "CONFLICT_CANONICAL_WINS";
    return { summary: summary, blocking: null };
  }

  /**
   * Fasst viele Ergebnisse zur Abdeckung und zur Anbieter-Abweichung
   * zusammen. confirmedBefore zaehlt die alte Regel (Anbieterspalte
   * bestanden), die der Aufrufer je Titel mitgibt.
   */
  function summarize(results) {
    var out = { contract: VERSION, corporateActionContract: CORPORATE_ACTION_CONTRACT, titles: results.length,
                TOTAL_RETURN_RECONSTRUCTED: 0, REJECTED_DIVIDEND_GAP: 0, REJECTED_SPLIT_GAP: 0, REJECTED_IDENTITY: 0, REJECTED_OTHER: 0,
                reasons: {}, crossCheck: { compared: 0, matchingTitles: 0, conflictingTitles: 0, notAvailable: 0,
                  medianAbsError: null, p95AbsError: null, maxAbsError: null, levelP95: null, levelMax: null,
                  dividendEvents: 0, dividendParity: 0, dividendParityShare: null, splitEvents: 0, splitParity: 0, splitParityShare: null },
                events: { splits: 0, reverseSplits: 0, dividends: 0, specialDividends: 0, splitWithDividend: 0 } };
    var med = [], p95 = [], mx = [], lvl = [];
    results.forEach(function (r) {
      if (r.reconstructed) out.TOTAL_RETURN_RECONSTRUCTED++;
      else { out[r.bucket]++; out.reasons[r.reason] = (out.reasons[r.reason] || 0) + 1; }
      if (r.events) Object.keys(out.events).forEach(function (k) { out.events[k] += r.events[k] || 0; });
      var c = r.crossCheck;
      if (!r.reconstructed || !c) return;
      if (!c.available) { out.crossCheck.notAvailable++; return; }
      out.crossCheck.compared++;
      if (c.state === "MATCH") out.crossCheck.matchingTitles++; else out.crossCheck.conflictingTitles++;
      ["dividendEvents", "dividendParity", "splitEvents", "splitParity"].forEach(function (k) { out.crossCheck[k] += c[k]; });
      if (isNum(c.medianAbsDailyDiff)) med.push(c.medianAbsDailyDiff);
      if (isNum(c.p95AbsDailyDiff)) p95.push(c.p95AbsDailyDiff);
      if (isNum(c.maxAbsDailyDiff)) mx.push(c.maxAbsDailyDiff);
      if (isNum(c.maxLevelDiff)) lvl.push(c.maxLevelDiff);
    });
    var srt = function (a) { return a.sort(function (x, y) { return x - y; }); };
    srt(med); srt(p95); srt(mx); srt(lvl);
    /* Je Titel die typische, die p95- und die groesste Tagesabweichung;
       ueber alle Titel davon der Median. maxAbsError ist die groesste
       Tagesabweichung im ganzen Universum. */
    out.crossCheck.medianAbsError = round(quantile(med, 0.5), 6);
    out.crossCheck.p95AbsError = round(quantile(p95, 0.5), 6);
    out.crossCheck.p95OfTitleMax = round(quantile(mx, 0.95), 6);
    out.crossCheck.maxAbsError = round(mx.length ? mx[mx.length - 1] : null, 6);
    out.crossCheck.levelP95 = round(quantile(lvl, 0.95), 6);
    out.crossCheck.levelMax = round(lvl.length ? lvl[lvl.length - 1] : null, 6);
    out.crossCheck.dividendParityShare = out.crossCheck.dividendEvents ? round(out.crossCheck.dividendParity / out.crossCheck.dividendEvents, 4) : null;
    out.crossCheck.splitParityShare = out.crossCheck.splitEvents ? round(out.crossCheck.splitParity / out.crossCheck.splitEvents, 4) : null;
    out.share = results.length ? round(out.TOTAL_RETURN_RECONSTRUCTED / results.length, 4) : null;
    return out;
  }

  /** Der Teil des Methodik-Fingerabdrucks, den diese Datei verantwortet. */
  function contractVersions() {
    return { totalReturn: VERSION, corporateActions: CORPORATE_ACTION_CONTRACT, benchmark: BENCHMARK_CONTRACT };
  }

  var api = { VERSION: VERSION, CORPORATE_ACTION_CONTRACT: CORPORATE_ACTION_CONTRACT, BENCHMARK_CONTRACT: BENCHMARK_CONTRACT,
              CONFIG: CONFIG, REASON_BUCKET: REASON_BUCKET, bucketOf: bucketOf,
              reconstruct: reconstruct, summarize: summarize, contractVersions: contractVersions };
  if (isNode) module.exports = api;
  else global.VUCanonicalTotalReturn = api;
})(typeof window !== "undefined" ? window : globalThis);
