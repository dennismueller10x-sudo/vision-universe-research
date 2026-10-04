/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-analytics.js   (etf-analytics-1.0.0)

   Performance- und Risiko-Engine fuer ETF-Kursreihen.

   EINGABE  points = [[ "YYYY-MM-DD", wert ], ...]  aufsteigend, Wert > 0
            basis  = "PRICE_RETURN" | "TOTAL_RETURN"

   Die ausgelieferten Tiingo-Reihen sind split-bereinigte Schlusskurse ohne
   Ausschuettungen. Die Engine nennt das Ergebnis deshalb "Kursentwicklung"
   und spricht nur dann von Gesamtrendite (Total Return), wenn die Reihe
   ausdruecklich als TOTAL_RETURN gekennzeichnet ist.

   Fehlende Historie ergibt null - nie eine Hochrechnung. Eine Kennzahl, die
   auf einer zu kurzen Reihe beruht, wird mit ihrem Status zurueckgegeben.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "etf-analytics-1.0.0";
  var DAY = 86400000;

  function t(d) { return Date.parse(d + "T00:00:00Z"); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }

  /** Bereinigt eine Reihe: sortiert, ohne Duplikate, nur endliche positive Werte. */
  function clean(points) {
    if (!Array.isArray(points)) return [];
    var seen = {}, out = [];
    points.forEach(function (p) {
      if (!Array.isArray(p) || typeof p[0] !== "string") return;
      var v = Number(p[1]);
      if (!Number.isFinite(v) || v <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(p[0])) return;
      seen[p[0]] = v;
    });
    Object.keys(seen).sort().forEach(function (d) { out.push([d, seen[d]]); });
    return out;
  }

  /** Erkennt die Koernung: median Abstand in Tagen. */
  function grainOf(points) {
    if (points.length < 3) return "unknown";
    var gaps = [];
    for (var i = 1; i < points.length; i++) gaps.push((t(points[i][0]) - t(points[i - 1][0])) / DAY);
    gaps.sort(function (a, b) { return a - b; });
    var med = gaps[Math.floor(gaps.length / 2)];
    if (med <= 3) return "daily";
    if (med <= 8) return "weekly";
    if (med <= 32) return "monthly";
    return "sparse";
  }

  /** Letzter Wert an oder vor einem Datum (Index), -1 wenn die Reihe spaeter beginnt. */
  function indexAtOrBefore(points, ms) {
    var lo = 0, hi = points.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (t(points[mid][0]) <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function shiftDate(ms, unit, n) {
    var d = new Date(ms);
    if (unit === "D") d.setUTCDate(d.getUTCDate() - n);
    else if (unit === "M") d.setUTCMonth(d.getUTCMonth() - n);
    else if (unit === "Y") d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.getTime();
  }

  var WINDOWS = [
    { id: "1D", needs: "daily" }, { id: "1W", unit: "D", n: 7 }, { id: "1M", unit: "M", n: 1 },
    { id: "3M", unit: "M", n: 3 }, { id: "6M", unit: "M", n: 6 }, { id: "YTD" },
    { id: "1Y", unit: "Y", n: 1 }, { id: "3Y", unit: "Y", n: 3, annualize: true },
    { id: "5Y", unit: "Y", n: 5, annualize: true }, { id: "10Y", unit: "Y", n: 10, annualize: true }, { id: "MAX", annualize: true }
  ];

  /**
   * Performance je Zeitfenster.
   * Toleranz: der Referenzpunkt darf hoechstens 10 Tage (woechentlich) bzw.
   * 5 Tage (taeglich) vor dem Zieldatum liegen - sonst fehlt Historie.
   */
  function performance(rawPoints, opts) {
    opts = opts || {};
    var points = clean(rawPoints);
    var grain = grainOf(points);
    var out = { version: VERSION, basis: opts.basis || "PRICE_RETURN", grain: grain, asOf: null, windows: {} };
    if (points.length < 2) {
      WINDOWS.forEach(function (w) { out.windows[w.id] = { value: null, status: "NO_HISTORY" }; });
      return out;
    }
    var last = points[points.length - 1], lastMs = t(last[0]);
    out.asOf = last[0];
    var tol = (grain === "daily" ? 5 : grain === "weekly" ? 10 : 35) * DAY;
    WINDOWS.forEach(function (w) {
      var refIdx, status = "CALCULATED";
      if (w.id === "1D") {
        if (grain !== "daily") { out.windows[w.id] = { value: null, status: "NEEDS_DAILY_DATA" }; return; }
        refIdx = points.length - 2;
      } else if (w.id === "MAX") {
        refIdx = 0;
      } else {
        var target = w.id === "YTD" ? Date.UTC(new Date(lastMs).getUTCFullYear(), 0, 1) - DAY : shiftDate(lastMs, w.unit, w.n);
        if (w.id === "1W" && grain !== "daily" && grain !== "weekly") { out.windows[w.id] = { value: null, status: "NEEDS_DAILY_DATA" }; return; }
        refIdx = indexAtOrBefore(points, target);
        if (refIdx < 0) { out.windows[w.id] = { value: null, status: "INSUFFICIENT_HISTORY" }; return; }
        if (target - t(points[refIdx][0]) > tol) status = "APPROXIMATE_REFERENCE";
      }
      var ref = points[refIdx];
      var total = last[1] / ref[1] - 1;
      var years = (lastMs - t(ref[0])) / (365.25 * DAY);
      var res = { value: total, status: status, from: ref[0], to: last[0] };
      if (w.annualize && years >= 1) res.annualized = Math.pow(1 + total, 1 / years) - 1;
      out.windows[w.id] = res;
    });
    return out;
  }

  function periodReturns(points) {
    var r = [];
    for (var i = 1; i < points.length; i++) r.push(points[i][1] / points[i - 1][1] - 1);
    return r;
  }
  function stdev(xs) {
    if (xs.length < 2) return null;
    var m = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    var v = xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (xs.length - 1);
    return Math.sqrt(v);
  }

  /** Letzter Wert je Kalendermonat bzw. -jahr. */
  function bucketLast(points, keyLen) {
    var map = {}, order = [];
    points.forEach(function (p) {
      var k = p[0].slice(0, keyLen);
      if (!(k in map)) order.push(k);
      map[k] = p;
    });
    return order.map(function (k) { return { key: k, point: map[k] }; });
  }

  /**
   * Maximaler Rueckgang mit Hoch, Tief und Erholung.
   * recoveryDays = Tage vom Tief bis der alte Hochpunkt wieder erreicht ist;
   * null, wenn bis zum Ende der Reihe nicht erholt.
   */
  function maxDrawdown(rawPoints) {
    var points = clean(rawPoints);
    if (points.length < 2) return { value: null, status: "NO_HISTORY" };
    var peak = points[0], best = { dd: 0, peak: peak, trough: peak };
    points.forEach(function (p) {
      if (p[1] > peak[1]) peak = p;
      var dd = p[1] / peak[1] - 1;
      if (dd < best.dd) best = { dd: dd, peak: peak, trough: p };
    });
    var recovery = null;
    if (best.dd < 0) {
      var ti = indexAtOrBefore(points, t(best.trough[0]));
      for (var i = ti + 1; i < points.length; i++) {
        if (points[i][1] >= best.peak[1]) { recovery = points[i]; break; }
      }
    }
    return {
      value: best.dd, status: "CALCULATED", peakDate: best.peak[0], troughDate: best.trough[0],
      recoveredDate: recovery ? recovery[0] : null,
      recoveryDays: recovery ? Math.round((t(recovery[0]) - t(best.trough[0])) / DAY) : null,
      recoveryMonths: recovery ? Math.round((t(recovery[0]) - t(best.trough[0])) / DAY / 30.44) : null,
      durationDays: Math.round((t(best.trough[0]) - t(best.peak[0])) / DAY),
      recovered: best.dd === 0 ? true : !!recovery
    };
  }

  /**
   * Risiko-Kennzahlen. Volatilitaet annualisiert nach Koernung
   * (taeglich sqrt(252), woechentlich sqrt(52), monatlich sqrt(12)).
   * Nur vollstaendige Kalenderjahre gehen in bestes/schlechtestes Jahr ein.
   */
  function risk(rawPoints, opts) {
    opts = opts || {};
    var points = clean(rawPoints);
    var grain = grainOf(points);
    var factor = grain === "daily" ? 252 : grain === "weekly" ? 52 : grain === "monthly" ? 12 : null;
    var out = { version: VERSION, grain: grain, observations: points.length };
    var rets = periodReturns(points);
    var minObs = grain === "daily" ? 60 : grain === "weekly" ? 26 : 12;
    var sd = rets.length >= minObs ? stdev(rets) : null;
    out.volatility = sd !== null && factor ? { value: sd * Math.sqrt(factor), status: "CALCULATED", basis: grain }
      : { value: null, status: "INSUFFICIENT_HISTORY" };
    out.maxDrawdown = maxDrawdown(points);

    var months = bucketLast(points, 7);
    var mRets = [];
    for (var i = 1; i < months.length; i++) {
      mRets.push({ key: months[i].key, value: months[i].point[1] / months[i - 1].point[1] - 1 });
    }
    // der erste Monat ist unvollstaendig, der letzte evtl. auch (laufend)
    if (mRets.length && opts.asOf && months[months.length - 1].key === opts.asOf.slice(0, 7)) mRets.pop();
    function extreme(list, cmp) {
      if (!list.length) return { value: null, status: "INSUFFICIENT_HISTORY" };
      var b = list.reduce(function (a, c) { return cmp(c.value, a.value) ? c : a; });
      return { value: b.value, period: b.key, status: "CALCULATED" };
    }
    out.bestMonth = extreme(mRets, function (a, b) { return a > b; });
    out.worstMonth = extreme(mRets, function (a, b) { return a < b; });

    var years = bucketLast(points, 4), yRets = [];
    var lastYear = points.length ? points[points.length - 1][0].slice(0, 4) : null;
    var lastIsYearEnd = points.length && points[points.length - 1][0].slice(5) >= "12-24";
    for (var j = 1; j < years.length; j++) {
      if (years[j].key === lastYear && !lastIsYearEnd) continue;
      yRets.push({ key: years[j].key, value: years[j].point[1] / years[j - 1].point[1] - 1 });
    }
    out.bestYear = extreme(yRets, function (a, b) { return a > b; });
    out.worstYear = extreme(yRets, function (a, b) { return a < b; });
    out.monthlyReturns = mRets;
    out.yearlyReturns = yRets;
    return out;
  }

  /**
   * Rollierende Renditen ueber `years` Jahre (Endpunkt je Beobachtung).
   * Liefert Verteilung: schlechteste, Median, beste, Anteil positiver Zeitraeume.
   */
  function rolling(rawPoints, years) {
    var points = clean(rawPoints), out = [];
    if (points.length < 3) return { status: "NO_HISTORY", count: 0 };
    var span = years * 365.25 * DAY, tol = 10 * DAY;
    for (var i = 0; i < points.length; i++) {
      var target = t(points[i][0]) - span;
      if (target < t(points[0][0]) - tol) continue;
      var j = indexAtOrBefore(points, target);
      if (j < 0) continue;
      if (target - t(points[j][0]) > tol) continue;
      var r = points[i][1] / points[j][1] - 1;
      out.push(years > 1 ? Math.pow(1 + r, 1 / years) - 1 : r);
    }
    if (out.length < 12) return { status: "INSUFFICIENT_HISTORY", count: out.length };
    var sorted = out.slice().sort(function (a, b) { return a - b; });
    return { status: "CALCULATED", count: out.length, years: years, annualized: years > 1,
      worst: sorted[0], median: sorted[Math.floor(sorted.length / 2)], best: sorted[sorted.length - 1],
      positiveShare: out.filter(function (x) { return x > 0; }).length / out.length };
  }

  /** Abwaertsschwankung: annualisierte Standardabweichung nur der negativen Periodenrenditen (Ziel 0). */
  function downsideDeviation(rawPoints) {
    var points = clean(rawPoints), grain = grainOf(points);
    var factor = grain === "daily" ? 252 : grain === "weekly" ? 52 : grain === "monthly" ? 12 : null;
    var r = periodReturns(points);
    if (!factor || r.length < (grain === "daily" ? 60 : 26)) return { status: "INSUFFICIENT_HISTORY", value: null };
    var sq = r.reduce(function (a, x) { return a + (x < 0 ? x * x : 0); }, 0) / r.length;
    return { status: "CALCULATED", value: Math.sqrt(sq) * Math.sqrt(factor) };
  }

  /** Trend: Abstand zum gleitenden Durchschnitt (200 Tage bzw. 40 Wochen). */
  function trend(rawPoints) {
    var points = clean(rawPoints);
    var grain = grainOf(points);
    var len = grain === "daily" ? 200 : grain === "weekly" ? 40 : null;
    if (!len || points.length < len) return { status: "INSUFFICIENT_HISTORY", value: null };
    var slice = points.slice(-len);
    var avg = slice.reduce(function (a, p) { return a + p[1]; }, 0) / len;
    var last = points[points.length - 1][1];
    var dist = last / avg - 1;
    return { status: "CALCULATED", value: dist, above: dist >= 0, window: grain === "daily" ? "200T" : "40W" };
  }

  /** Woechentliche Reihe aus taeglicher (letzter Handelstag je ISO-Woche). */
  function toWeekly(rawPoints) {
    var points = clean(rawPoints), map = {}, order = [];
    points.forEach(function (p) {
      var d = new Date(t(p[0]));
      var day = (d.getUTCDay() + 6) % 7;
      var monday = iso(t(p[0]) - day * DAY);
      if (!(monday in map)) order.push(monday);
      map[monday] = p;
    });
    return order.map(function (k) { return map[k]; });
  }

  /**
   * Verbindet eine lange woechentliche Reihe mit einer kurzen taeglichen:
   * vor Beginn der taeglichen Reihe gilt die woechentliche. Beide muessen
   * dieselbe Preisbasis haben (split-bereinigt); ein Stoss an der Naht
   * wird geprueft und gemeldet, nicht geglaettet.
   */
  function splice(weekly, daily) {
    var w = clean(weekly), d = clean(daily);
    if (!d.length) return { points: w, seamGap: null };
    if (!w.length) return { points: d, seamGap: null };
    var start = d[0][0];
    var before = w.filter(function (p) { return p[0] < start; });
    var gap = null;
    if (before.length) gap = d[0][1] / before[before.length - 1][1] - 1;
    return { points: before.concat(d), seamGap: gap };
  }

  /** Relative Staerke gegenueber einer Vergleichsreihe ueber n Monate. */
  function relativeStrength(a, b, months) {
    var pa = performance(a).windows, pb = performance(b).windows;
    var key = months === 12 ? "1Y" : months === 6 ? "6M" : months === 3 ? "3M" : "1Y";
    if (!pa[key] || !pb[key] || pa[key].value === null || pb[key].value === null) return { value: null, status: "INSUFFICIENT_HISTORY" };
    return { value: (1 + pa[key].value) / (1 + pb[key].value) - 1, status: "CALCULATED", window: key };
  }

  /** Korrelation zweier Reihen auf gemeinsamen Daten (Periodenrenditen). */
  function correlation(a, b) {
    var A = clean(a), B = clean(b), mapB = {};
    B.forEach(function (p) { mapB[p[0]] = p[1]; });
    var common = A.filter(function (p) { return p[0] in mapB; });
    if (common.length < 20) return { value: null, status: "INSUFFICIENT_OVERLAP", observations: common.length };
    var ra = [], rb = [];
    for (var i = 1; i < common.length; i++) {
      ra.push(common[i][1] / common[i - 1][1] - 1);
      rb.push(mapB[common[i][0]] / mapB[common[i - 1][0]] - 1);
    }
    var ma = ra.reduce(function (x, y) { return x + y; }, 0) / ra.length;
    var mb = rb.reduce(function (x, y) { return x + y; }, 0) / rb.length;
    var cov = 0, va = 0, vb = 0;
    for (var k = 0; k < ra.length; k++) { cov += (ra[k] - ma) * (rb[k] - mb); va += (ra[k] - ma) * (ra[k] - ma); vb += (rb[k] - mb) * (rb[k] - mb); }
    if (va === 0 || vb === 0) return { value: null, status: "NO_VARIANCE" };
    return { value: cov / Math.sqrt(va * vb), status: "CALCULATED", observations: ra.length };
  }

  /**
   * Portfolio-Reihe mit festen Gewichten (periodisch auf Zielgewicht
   * zurueckgesetzt). Nur Daten, an denen alle Bestandteile einen Wert haben.
   */
  function portfolioSeries(components) {
    var valid = (components || []).filter(function (c) { return c && c.weight > 0 && c.points && c.points.length > 1; });
    if (!valid.length) return { points: [], status: "NO_DATA" };
    var total = valid.reduce(function (a, c) { return a + c.weight; }, 0);
    var maps = valid.map(function (c) { var m = {}; clean(c.points).forEach(function (p) { m[p[0]] = p[1]; }); return m; });
    var dates = Object.keys(maps[0]).filter(function (d) { return maps.every(function (m) { return d in m; }); }).sort();
    if (dates.length < 2) return { points: [], status: "INSUFFICIENT_OVERLAP" };
    var v = 100, out = [[dates[0], v]];
    for (var i = 1; i < dates.length; i++) {
      var r = 0;
      for (var k = 0; k < valid.length; k++) r += (valid[k].weight / total) * (maps[k][dates[i]] / maps[k][dates[i - 1]] - 1);
      v = v * (1 + r);
      out.push([dates[i], v]);
    }
    return { points: out, status: "CALCULATED", from: dates[0], to: dates[dates.length - 1] };
  }

  var api = {
    VERSION: VERSION, WINDOWS: WINDOWS.map(function (w) { return w.id; }),
    clean: clean, grainOf: grainOf, performance: performance, risk: risk, rolling: rolling, downsideDeviation: downsideDeviation,
    maxDrawdown: maxDrawdown, trend: trend, toWeekly: toWeekly, splice: splice,
    relativeStrength: relativeStrength, correlation: correlation, portfolioSeries: portfolioSeries
  };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Analytics = api; }
})(typeof window !== "undefined" ? window : globalThis);
