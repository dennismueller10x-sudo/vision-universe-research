/* =========================================================================
   VISION UNIVERSE QUANT — emerging-leaders.js  (emerging-leaders-1.0.0)

   WO ENTSTEHT GERADE NEUE MARKTFUEHRERSCHAFT?

   Die Engine rechnet je Titel und Stichtag die vorregistrierten Merkmale
   (quant/methodology/emerging-leaders-v1.json), daraus Querschnittsraenge,
   Gruppenwerte, Modellwerte und einen von sechs objektiven Zustaenden.
   Dieselben Funktionen nutzt die historische Studie
   (scripts/quant/build-emerging-leaders-study.mjs) und der taegliche Lauf
   (scripts/quant/build-emerging-leaders.mjs) - eine Definition, zwei Leser.

   LOOK-AHEAD

   seriesFeatures(s, i) liest ausschliesslich Indizes <= i. Das ist nicht
   nur Vorsatz: alle Zugriffe laufen ueber at(arr, k), das bei k > i wirft
   (guard). Ein Merkmal, das versehentlich in die Zukunft greift, bricht den
   Lauf ab, statt still bessere Zahlen zu liefern.

   KEINE PROGNOSE

   Ein Zustand beschreibt, was im Kursverlauf objektiv vorliegt. Er ist
   keine Wahrscheinlichkeit und kein Kursziel. Ob ein Zustand oder ein
   Modellwert historisch etwas bedeutet hat, misst die Studie; der Status
   (VALIDATED/PARTIAL/EXPERIMENTAL) steht in jedem Artefakt.
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "emerging-leaders-1.0.0";
  var STATES = ["S0_NONE", "S1_EARLY_ACCUMULATION", "S2_MOMENTUM_EMERGING", "S3_BREAKOUT_CANDIDATE",
                "S4_BREAKOUT_CONFIRMED", "S5_ESTABLISHED_LEADER"];
  var GROUPS = {
    A: ["rsAccel", "rsImprove", "pRS_20"],
    B: ["inflect", "trendStart", "sma20over50"],
    C: ["udv50", "accDays", "relVol"],
    D: ["-volRatio", "-bbwPct", "-rangeRatio", "nearPivot"],
    E: ["revenueAccel", "revenueGrowthYoy", "netMarginChange", "fcfMargin"]
  };
  var RS_LAGS = [5, 20, 60, 120];

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* --------------------------------------------------------------- guard */
  function guard(i) {
    return function at(arr, k) {
      if (k > i) throw new Error("LOOK_AHEAD: Index " + k + " > Stichtag " + i);
      if (k < 0 || !arr) return NaN;
      var v = arr[k];
      return isNum(v) ? v : NaN;
    };
  }

  function mean(at, arr, from, to) {
    var s = 0, n = 0;
    for (var k = from; k <= to; k++) { var v = at(arr, k); if (isNum(v)) { s += v; n++; } }
    return n ? s / n : NaN;
  }
  function sd(xs) {
    var n = xs.length; if (n < 2) return NaN;
    var m = 0; for (var j = 0; j < n; j++) m += xs[j]; m /= n;
    var q = 0; for (var j2 = 0; j2 < n; j2++) q += (xs[j2] - m) * (xs[j2] - m);
    return Math.sqrt(q / (n - 1));
  }
  function rets(at, c, from, to) {
    var out = [];
    for (var k = Math.max(1, from); k <= to; k++) {
      var a = at(c, k - 1), b = at(c, k);
      if (a > 0 && b > 0) out.push(b / a - 1);
    }
    return out;
  }
  function maxOf(at, arr, from, to) { var m = -Infinity; for (var k = from; k <= to; k++) { var v = at(arr, k); if (v > m) m = v; } return m === -Infinity ? NaN : m; }
  function minOf(at, arr, from, to) { var m = Infinity; for (var k = from; k <= to; k++) { var v = at(arr, k); if (v < m) m = v; } return m === Infinity ? NaN : m; }

  /**
   * Gleitende Mittel und Bandbreiten einmal je Reihe (Praefixsummen). Jeder
   * Wert am Index k haengt nur von Indizes <= k ab; seriesFeatures liest sie
   * ueber denselben Waechter.
   */
  function rolling(x, n) {
    var out = new Float64Array(x.length).fill(NaN), sum = 0, cnt = 0;
    for (var k = 0; k < x.length; k++) {
      var v = x[k]; if (isNum(v)) { sum += v; cnt++; }
      if (k >= n) { var o = x[k - n]; if (isNum(o)) { sum -= o; cnt--; } }
      if (k >= n - 1 && cnt === n) out[k] = sum / n;
    }
    return out;
  }
  function rollingBbw(x, n) {
    var out = new Float64Array(x.length).fill(NaN), s1 = 0, s2 = 0, cnt = 0;
    for (var k = 0; k < x.length; k++) {
      var v = x[k]; if (isNum(v)) { s1 += v; s2 += v * v; cnt++; }
      if (k >= n) { var o = x[k - n]; if (isNum(o)) { s1 -= o; s2 -= o * o; cnt--; } }
      if (k >= n - 1 && cnt === n) {
        var m = s1 / n, varr = Math.max(0, (s2 - n * m * m) / (n - 1));
        out[k] = m > 0 ? 4 * Math.sqrt(varr) / m : NaN;
      }
    }
    return out;
  }
  function prepare(s) {
    if (s.pre) return s;
    var c = s.close, v = s.volume;
    s.pre = { sma20: rolling(c, 20), sma50: rolling(c, 50), sma100: rolling(c, 100), sma150: rolling(c, 150), sma200: rolling(c, 200),
              bbw: rollingBbw(c, 20),
              v20: v ? rolling(v, 20) : null, v50: v ? rolling(v, 50) : null, v60: v ? rolling(v, 60) : null, v120: v ? rolling(v, 120) : null,
              rv20: s.rawVolume ? rolling(s.rawVolume, 20) : null };
    return s;
  }

  /**
   * Merkmale eines Titels am Index i.
   * s: {close, high, low, volume, rawClose, rawVolume, bench} - gleich lange
   *    Arrays (Index = Handelstag des Titels); bench = SPY-Schluss am selben
   *    Datum (NaN, wo es fehlt). close/high/low/volume split-bereinigt.
   * Rueckgabe: rohe Merkmale (ohne Querschnitt) oder null bei zu wenig Historie.
   */
  function seriesFeatures(s, i, opts) {
    opts = opts || {};
    var minHist = isNum(opts.minHistory) ? opts.minHistory : 252;
    if (i < minHist) return null;
    var at = guard(i);
    prepare(s);
    var P = s.pre;
    var c = s.close, h = s.high || s.close, l = s.low || s.close, v = s.volume, b = s.bench;
    var C = at(c, i);
    if (!(C > 0)) return null;
    var f = { close: C };

    /* A: relative Staerke gegen SPY */
    for (var q = 0; q < RS_LAGS.length; q++) {
      var k = RS_LAGS[q];
      var c0 = at(c, i - k), b0 = at(b, i - k), b1 = at(b, i);
      f["rs_" + k] = c0 > 0 && b0 > 0 && b1 > 0 ? Math.log(C / c0) - Math.log(b1 / b0) : NaN;
    }

    /* Gleitende Durchschnitte */
    var SMA = { 20: P.sma20, 50: P.sma50, 100: P.sma100, 150: P.sma150, 200: P.sma200 };
    function sma(n, end) { return at(SMA[n], end); }
    var s20 = sma(20, i), s50 = sma(50, i), s150 = sma(150, i), s200 = sma(200, i);
    f.sma20 = s20; f.sma50 = s50; f.sma150 = s150; f.sma200 = s200;
    var s50_10 = sma(50, i - 10), s50_30 = sma(50, i - 30), s50_40 = sma(50, i - 40);
    f.slope50 = s50 / s50_10 - 1;
    f.inflect = f.slope50 - (s50_30 / s50_40 - 1);
    f.sma20over50 = s20 / s50 - 1;
    var recent = 0, recentN = 0, prior = 0, priorN = 0;
    for (var d = i - 19; d <= i; d++) { var m200 = sma(200, d); if (isNum(m200)) { recentN++; if (at(c, d) > m200) recent++; } }
    for (var d2 = i - 80; d2 <= i - 21; d2++) { var m200b = sma(200, d2); if (isNum(m200b)) { priorN++; if (at(c, d2) > m200b) prior++; } }
    f.trendStart = recentN && priorN ? recent / recentN - prior / priorN : NaN;
    var s200_21 = sma(200, i - 21);
    f.sma200Rising = isNum(s200_21) ? s200 > s200_21 : false;
    var golden = 0; for (var d3 = i - 59; d3 <= i; d3++) { if (sma(50, d3) > sma(200, d3)) golden++; }
    f.sma50over200Days60 = golden;

    /* C: Volumen */
    if (v) {
      var v20 = at(P.v20, i), v50 = at(P.v50, i), v120 = at(P.v120, i);
      f.relVol = v20 / v120;
      var up = 0, dn = 0;
      for (var d4 = i - 49; d4 <= i; d4++) {
        var r = at(c, d4) / at(c, d4 - 1) - 1, vol = at(v, d4);
        if (!isNum(r) || !isNum(vol)) continue;
        if (r > 0) up += vol; else if (r < 0) dn += vol;
      }
      f.udv50 = up > 0 && dn > 0 ? Math.log(up / dn) : NaN;
      var acc = 0;
      for (var d5 = i - 24; d5 <= i; d5++) {
        var r2 = at(c, d5) / at(c, d5 - 1) - 1, vol2 = at(v, d5);
        if (!isNum(r2) || !isNum(vol2) || !(vol2 > v50)) continue;
        if (r2 > 0) acc++; else if (r2 < 0) acc--;
      }
      f.accDays = acc;
      f.avgVolume50 = v50;
    } else { f.relVol = NaN; f.udv50 = NaN; f.accDays = NaN; f.avgVolume50 = NaN; }

    /* D: Kompression */
    var r20 = rets(at, c, i - 19, i), r120 = rets(at, c, i - 119, i);
    f.volRatio = sd(r20) / sd(r120);
    var bbw = [];
    for (var d6 = Math.max(0, i - 251); d6 <= i; d6++) { var bw = at(P.bbw, d6); if (isNum(bw)) bbw.push(bw); }
    if (bbw.length >= 60) {
      var cur = bbw[bbw.length - 1], below = 0;
      for (var z = 0; z < bbw.length; z++) if (bbw[z] < cur) below++;
      f.bbwPct = below / (bbw.length - 1 || 1);
    } else f.bbwPct = NaN;
    var hi20 = maxOf(at, h, i - 19, i), lo20 = minOf(at, l, i - 19, i), hi120 = maxOf(at, h, i - 119, i), lo120 = minOf(at, l, i - 119, i);
    f.rangeRatio = hi120 > lo120 ? (hi20 - lo20) / (hi120 - lo120) : NaN;
    var hi60 = maxOf(at, h, i - 59, i);
    f.high60 = hi60;
    f.nearPivot = C / hi60 - 1;
    f.high252 = maxOf(at, h, i - 251, i);
    f.low252 = minOf(at, l, i - 251, i);

    /* Ausbruch in den letzten 5 Sitzungen (S4) */
    f.breakout = null;
    if (v) {
      for (var e = i; e >= i - 4; e--) {
        var piv = maxOf(at, h, e - 60, e - 1), ce = at(c, e), ve = at(v, e), v50e = at(P.v50, e - 1);
        if (ce > piv && ve >= 1.5 * v50e) { f.breakout = { daysAgo: i - e, pivot: piv }; break; }
      }
    }

    /* Renditen (Baselines, Leadership-Nachbildung, Emerging-Population) */
    function ret(k3) { var a3 = at(c, i - k3); return a3 > 0 ? C / a3 - 1 : NaN; }
    function bret(k4) { var a4 = at(b, i - k4), b4 = at(b, i); return a4 > 0 && b4 > 0 ? b4 / a4 - 1 : NaN; }
    f.ret21 = ret(21); f.ret63 = ret(63); f.ret126 = ret(126); f.ret252 = ret(252);
    f.mom12_1 = at(c, i - 21) / at(c, i - 252) - 1;
    f.rel21 = f.ret21 - bret(21); f.rel63 = f.ret63 - bret(63); f.rel126 = f.ret126 - bret(126); f.rel252 = f.ret252 - bret(252);
    f.distanceTo52wHigh = C / f.high252 - 1;
    var peak = -Infinity, mdd = 0;
    for (var d7 = i - 251; d7 <= i; d7++) { var x7 = at(c, d7); if (!isNum(x7)) continue; if (x7 > peak) peak = x7; var dd = x7 / peak - 1; if (dd < mdd) mdd = dd; }
    f.maxDrawdown252d = mdd;
    var s100 = sma(100, i);
    f.trendAlignment = [s20, s50, s100, s200].filter(isNum).length
      ? [s20, s50, s100, s200].filter(isNum).filter(function (mm) { return C > mm; }).length / [s20, s50, s100, s200].filter(isNum).length : NaN;
    f.volumeRatio20over60 = v ? at(P.v20, i) / at(P.v60, i) : NaN;

    /* Zulaessigkeit (Rohkurs, Rohumsatz am Tag t) */
    var rc = s.rawClose ? at(s.rawClose, i) : C, rv = s.rawVolume;
    f.rawClose = rc;
    f.dollarVolume20 = rv ? at(P.rv20, i) * rc : NaN;
    return f;
  }

  /* --------------------------------------------------------- Querschnitt */
  /** Perzentil 0..1 je Wert (Mittelrang bei Bindungen); NaN bleibt NaN. */
  function pctRanks(values) {
    var idx = [];
    for (var j = 0; j < values.length; j++) if (isNum(values[j])) idx.push(j);
    idx.sort(function (a, b) { return values[a] - values[b]; });
    var out = new Array(values.length).fill(NaN), n = idx.length;
    var p = 0;
    while (p < n) {
      var q = p; while (q + 1 < n && values[idx[q + 1]] === values[idx[p]]) q++;
      var r = n > 1 ? ((p + q) / 2) / (n - 1) : 0.5;
      for (var t = p; t <= q; t++) out[idx[t]] = r;
      p = q + 1;
    }
    return out;
  }

  /**
   * Querschnitt eines Stichtags.
   * rows: [{id, f (seriesFeatures), fund (Fundamentalmerkmale|null), prior: {pRS_60, pRS_120}|null}]
   * Schreibt in jede Zeile: p (Perzentile), groups {A..E}, models {M1..M4},
   * baselines, emerging (bool), state. groupWeights fuer M3, merge fuer
   * korrelierte Gruppen (aus der Methodik/DEV).
   */
  function crossSection(rows, opts) {
    opts = opts || {};
    var n = rows.length;
    function col(fn) { return rows.map(fn); }
    var pRS = {};
    RS_LAGS.forEach(function (k) { pRS[k] = pctRanks(col(function (r) { return r.f["rs_" + k]; })); });
    var pRS252 = pctRanks(col(function (r) { return r.f.rel252; }));
    var feats = {
      pRS_20: pRS[20].map(function (x) { return x * 100; }),
      rsAccel: rows.map(function (r, j) { return (pRS[20][j] - pRS[120][j]) * 100; }),
      rsImprove: rows.map(function (r, j) { return r.prior && isNum(r.prior.pRS_60) ? pRS[60][j] * 100 - r.prior.pRS_60 : NaN; }),
      inflect: col(function (r) { return r.f.inflect; }),
      trendStart: col(function (r) { return r.f.trendStart; }),
      sma20over50: col(function (r) { return r.f.sma20over50; }),
      udv50: col(function (r) { return r.f.udv50; }),
      accDays: col(function (r) { return r.f.accDays; }),
      relVol: col(function (r) { return r.f.relVol; }),
      "-volRatio": col(function (r) { return -r.f.volRatio; }),
      "-bbwPct": col(function (r) { return -r.f.bbwPct; }),
      "-rangeRatio": col(function (r) { return -r.f.rangeRatio; }),
      nearPivot: col(function (r) { return r.f.nearPivot; }),
      revenueAccel: col(function (r) { return r.fund ? r.fund.revenueAccel : NaN; }),
      revenueGrowthYoy: col(function (r) { return r.fund ? r.fund.revenueGrowthYoy : NaN; }),
      netMarginChange: col(function (r) { return r.fund ? r.fund.netMarginChange : NaN; }),
      fcfMargin: col(function (r) { return r.fund ? r.fund.fcfMargin : NaN; })
    };
    var ranks = {};
    Object.keys(feats).forEach(function (k) { ranks[k] = pctRanks(feats[k]); });

    var merge = opts.merge || [];               /* z. B. [["A","B"]] */
    var weights = opts.weights || null;         /* M3 */
    var mom = pctRanks(col(function (r) { return r.f.mom12_1; }));
    var lead = pctRanks(col(function (r) { return isNum(r.leadershipScore) ? r.leadershipScore : NaN; }));

    rows.forEach(function (r, j) {
      r.p = { pRS_5: pRS[5][j] * 100, pRS_20: pRS[20][j] * 100, pRS_60: pRS[60][j] * 100, pRS_120: pRS[120][j] * 100, pRS_252: pRS252[j] * 100 };
      r.feat = { rsAccel: feats.rsAccel[j], rsImprove: feats.rsImprove[j] };
      var groups = {};
      Object.keys(GROUPS).forEach(function (g) {
        var items = GROUPS[g], vals = [];
        items.forEach(function (it) { var x = ranks[it][j]; if (isNum(x)) vals.push(x); });
        var need = g === "E" ? 2 : Math.ceil(items.length / 2);
        groups[g] = vals.length >= need ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : NaN;
      });
      merge.forEach(function (pair) {
        var a = groups[pair[0]], b = groups[pair[1]];
        var m = isNum(a) && isNum(b) ? (a + b) / 2 : isNum(a) ? a : b;
        groups[pair[0]] = m; groups[pair[1]] = NaN;
      });
      r.groups = groups;
      function avg(keys) { var vs = keys.map(function (k) { return groups[k]; }).filter(isNum); return vs.length >= Math.ceil(keys.filter(function (k) { return !merge.some(function (p) { return p[1] === k; }); }).length / 2) && vs.length ? vs.reduce(function (a, b) { return a + b; }, 0) / vs.length : NaN; }
      var tech = avg(["A", "B", "C", "D"]);
      r.emerging = isNum(r.f.ret252) && r.f.ret252 < 1 && !!r.prior && isNum(r.prior.pRS_120) && r.prior.pRS_120 <= 70;
      var m3 = NaN;
      if (weights) {
        var s = 0, w = 0;
        Object.keys(weights).forEach(function (g) { if (weights[g] > 0 && isNum(groups[g])) { s += weights[g] * groups[g]; w += weights[g]; } });
        m3 = w > 0 ? s / w : NaN;
      }
      r.models = {
        M1_TECH_EQUAL: tech,
        M2_TECH_FUND_EQUAL: isNum(groups.E) ? avg(["A", "B", "C", "D", "E"]) : tech,
        M3_DEV_IC_WEIGHTED: m3,
        M4_EMERGING_TECH: r.emerging ? tech : NaN
      };
      r.baselines = {
        MOM_12_1: mom[j],
        RS_6M: pRS[120][j],
        LEADERSHIP_VU: lead[j],
        TREND_TEMPLATE: trendTemplate(r.f, r.p.pRS_252) ? 1 : NaN
      };
      r.state = classify(r.f, r.p, r.feat);
    });
    return rows;
  }

  function trendTemplate(f, pRS252) {
    return f.close > f.sma50 && f.sma50 > f.sma150 && f.sma150 > f.sma200 && f.sma200Rising &&
           f.close >= 1.3 * f.low252 && f.close >= 0.75 * f.high252 && pRS252 >= 70;
  }

  /** Objektiver Zustand (Methodik: states). p: Perzentile 0..100, feat: rsImprove. */
  function classify(f, p, feat) {
    if (!f || !p) return "S0_NONE";
    if (p.pRS_120 >= 90 && f.close >= 0.85 * f.high252 && f.sma50over200Days60 >= 60) return "S5_ESTABLISHED_LEADER";
    if (f.breakout && f.close >= 0.97 * f.breakout.pivot) return "S4_BREAKOUT_CONFIRMED";
    if ((f.volRatio <= 0.8 || f.bbwPct <= 0.25) && f.close >= 0.94 * f.high60 && f.close > f.sma50 && f.slope50 > 0) return "S3_BREAKOUT_CANDIDATE";
    if (feat && feat.rsImprove >= 20 && p.pRS_60 >= 60 && f.close > f.sma50 && f.slope50 > 0) return "S2_MOMENTUM_EMERGING";
    if (f.udv50 >= Math.log(1.25) && f.accDays >= 2 && f.close >= 0.95 * f.sma200 && p.pRS_120 <= 70) return "S1_EARLY_ACCUMULATION";
    return "S0_NONE";
  }

  /** Begruendung eines Zustands in Klartext-Bausteinen (fuer die Oberflaeche). */
  function reasons(row) {
    var f = row.f, p = row.p, out = [];
    function pct(x) { return (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1).replace(".", ",") + " %"; }
    if (row.feat && isNum(row.feat.rsImprove) && row.feat.rsImprove >= 10) out.push({ id: "rsImprove", text: "Relative Stärke 3 Monate: Rang um " + Math.round(row.feat.rsImprove) + " Punkte verbessert" });
    if (isNum(p.pRS_20) && isNum(p.pRS_120) && p.pRS_20 - p.pRS_120 >= 15) out.push({ id: "rsAccel", text: "Kurzfristig stärker als langfristig (Rang 1 Monat " + Math.round(p.pRS_20) + " vs. 6 Monate " + Math.round(p.pRS_120) + ")" });
    if (f.breakout) out.push({ id: "breakout", text: "Ausbruch über das 60-Tage-Hoch mit erhöhtem Volumen vor " + f.breakout.daysAgo + " Sitzung(en)" });
    if (f.volRatio <= 0.8) out.push({ id: "compression", text: "Schwankung 20 Tage nur " + Math.round(f.volRatio * 100) + " % der 120-Tage-Schwankung" });
    if (isNum(f.udv50) && f.udv50 >= Math.log(1.25)) out.push({ id: "accumulation", text: "Volumen an Aufwärtstagen " + Math.exp(f.udv50).toFixed(2).replace(".", ",") + "× so hoch wie an Abwärtstagen (50 Tage)" });
    if (f.trendStart >= 0.5) out.push({ id: "trendStart", text: "Erst kürzlich über die 200-Tage-Linie gestiegen" });
    if (isNum(f.nearPivot) && f.nearPivot >= -0.06) out.push({ id: "nearPivot", text: "Nur " + pct(f.nearPivot) + " vom 60-Tage-Hoch entfernt" });
    return out.slice(0, 4);
  }

  /* ------------------------------------------------------------ Statistik */
  function meanArr(xs) { var a = xs.filter(isNum); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; }
  function medianArr(xs) { var a = xs.filter(isNum).sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; }
  /** Newey-West-t des Mittels einer Zeitreihe (lag L). */
  function neweyWestT(xs, lag) {
    var a = xs.filter(isNum), n = a.length;
    if (n < 3) return { mean: meanArr(a), t: NaN, n: n };
    var m = meanArr(a), e = a.map(function (x) { return x - m; });
    var g0 = e.reduce(function (s, x) { return s + x * x; }, 0) / n, s2 = g0;
    for (var L = 1; L <= Math.min(lag, n - 1); L++) {
      var g = 0; for (var t = L; t < n; t++) g += e[t] * e[t - L];
      g /= n; s2 += 2 * (1 - L / (lag + 1)) * g;
    }
    var se = Math.sqrt(Math.max(s2, 1e-18) / n);
    return { mean: m, t: m / se, n: n, se: se };
  }
  function spearman(x, y) {
    var px = [], py = [];
    for (var j = 0; j < x.length; j++) if (isNum(x[j]) && isNum(y[j])) { px.push(x[j]); py.push(y[j]); }
    if (px.length < 10) return NaN;
    var rx = pctRanks(px), ry = pctRanks(py), mx = meanArr(rx), my = meanArr(ry), sxy = 0, sxx = 0, syy = 0;
    for (var k = 0; k < rx.length; k++) { sxy += (rx[k] - mx) * (ry[k] - my); sxx += (rx[k] - mx) * (rx[k] - mx); syy += (ry[k] - my) * (ry[k] - my); }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  /** OLS mit Achsenabschnitt; X: Array von Spalten. Rueckgabe Koeffizienten (ohne Achse). */
  function ols(y, X) {
    var rows = [];
    for (var j = 0; j < y.length; j++) {
      if (!isNum(y[j])) continue;
      var ok = true, r = [1];
      for (var c = 0; c < X.length; c++) { if (!isNum(X[c][j])) { ok = false; break; } r.push(X[c][j]); }
      if (ok) rows.push({ y: y[j], x: r });
    }
    var k = X.length + 1;
    if (rows.length < k + 10) return null;
    var A = [], bvec = new Array(k).fill(0);
    for (var a = 0; a < k; a++) A.push(new Array(k).fill(0));
    rows.forEach(function (r) { for (var p = 0; p < k; p++) { bvec[p] += r.x[p] * r.y; for (var q = 0; q < k; q++) A[p][q] += r.x[p] * r.x[q]; } });
    /* Gauss-Elimination */
    for (var col = 0; col < k; col++) {
      var piv = col; for (var rr = col + 1; rr < k; rr++) if (Math.abs(A[rr][col]) > Math.abs(A[piv][col])) piv = rr;
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      var tmp = A[col]; A[col] = A[piv]; A[piv] = tmp; var tb = bvec[col]; bvec[col] = bvec[piv]; bvec[piv] = tb;
      for (var r2 = 0; r2 < k; r2++) {
        if (r2 === col) continue;
        var fct = A[r2][col] / A[col][col];
        for (var c2 = col; c2 < k; c2++) A[r2][c2] -= fct * A[col][c2];
        bvec[r2] -= fct * bvec[col];
      }
    }
    var beta = []; for (var z = 0; z < k; z++) beta.push(bvec[z] / A[z][z]);
    return beta.slice(1);
  }
  /** Deterministischer Zufall (mulberry32) fuer die Zufalls-Baseline. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  var api = {
    VERSION: VERSION, STATES: STATES, GROUPS: GROUPS, RS_LAGS: RS_LAGS,
    guard: guard, prepare: prepare, seriesFeatures: seriesFeatures, pctRanks: pctRanks, crossSection: crossSection,
    classify: classify, trendTemplate: trendTemplate, reasons: reasons,
    stats: { mean: meanArr, median: medianArr, neweyWestT: neweyWestT, spearman: spearman, ols: ols, rng: rng }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUQuant = global.VUQuant || {}; global.VUQuant.EmergingLeaders = api; }
})(typeof window !== "undefined" ? window : globalThis);
