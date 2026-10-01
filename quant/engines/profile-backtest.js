/* =========================================================================
   VISION UNIVERSE QUANT — PROFILE BACKTEST (profile-backtest-1.0.0)

   Backtest der Anlagestile (strategy-profiles-v1) und Faktor-Quintile nach
   quant/methodology/strategy-backtest-contract-v1.json.

   Point-in-Time ist hier keine Absicht, sondern Code:
   - Zu jedem Termin R gilt der letzte Stand STRIKT VOR R (Zugehoerigkeit
     und Faktoren). Ein spaeterer Stand ist fuer R unsichtbar.
   - Fehlt ein ausreichend frischer Zugehoerigkeitsstand, bricht der Lauf ab
     (MEMBERSHIP_STALE). Es gibt keinen Rueckgriff auf das heutige Universum.
   - Ein Titel ohne Wert erfuellt keine Bedingung (keine Ersatzwerte).
   Ergebnisse rechnen mit Gesamtrendite; Kosten je Szenario auf den Umsatz.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "profile-backtest-1.0.0";
  var DAY = 86400000;

  function latestBefore(list, date) {
    var hit = null;
    for (var i = 0; i < list.length; i++) { if (list[i].asOf < date) hit = list[i]; else break; }
    return hit;
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }
  function sorted(list) { return list.slice().sort(function (a, b) { return a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0; }); }

  /* Termine: erster Handelstag jedes Monats im Kalender der Benchmark. */
  function monthlyDates(calendar, from, to) {
    var out = [], last = "";
    calendar.forEach(function (d) { if (d >= from && d <= to && d.slice(0, 7) !== last) { out.push(d); last = d.slice(0, 7); } });
    return out;
  }

  function meets(row, cond) {
    var v = row ? row[cond.id] : undefined;
    if (typeof v !== "number" || !isFinite(v)) return false;
    if (cond.operator === "gte") return v >= cond.value;
    if (cond.operator === "gt") return v > cond.value;
    if (cond.operator === "lte") return v <= cond.value;
    if (cond.operator === "lt") return v < cond.value;
    throw new Error("unknown operator " + cond.operator);
  }

  function select(profile, members, rows, maxPositions) {
    var picks = [];
    members.forEach(function (t) {
      var row = rows[t];
      if (!profile.conditions.every(function (c) { return meets(row, c); })) return;
      var score = profile.conditions.reduce(function (s, c) { return s + (c.weight || 0) * row[c.id]; }, 0);
      picks.push({ ticker: t, score: score });
    });
    picks.sort(function (a, b) { return b.score - a.score || (a.ticker < b.ticker ? -1 : 1); });
    return picks.slice(0, maxPositions).map(function (p) { return p.ticker; });
  }

  function priceAt(series, date, maxCarry) {
    /* letzter Kurs an oder vor date, hoechstens maxCarry Handelstage alt */
    var idx = series.index[date];
    if (idx !== undefined) return { price: series.tr[idx], carried: 0 };
    var lo = 0, hi = series.dates.length - 1, pos = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (series.dates[mid] <= date) { pos = mid; lo = mid + 1; } else hi = mid - 1; }
    if (pos < 0) return null;
    return { price: series.tr[pos], carried: 1, lastDate: series.dates[pos], ended: pos === series.dates.length - 1 };
  }
  function indexSeries(s) { var idx = {}; s.dates.forEach(function (d, i) { idx[d] = i; }); return { dates: s.dates, tr: s.tr, index: idx }; }

  function run(options) {
    var c = options.contract, profile = options.profile;
    var membership = sorted(options.membership), snapshots = sorted(options.snapshots);
    var bench = indexSeries(options.benchmark);
    var prices = {};
    Object.keys(options.prices).forEach(function (t) { prices[t] = indexSeries(options.prices[t]); });
    var scenario = c.costs.scenarios.filter(function (s) { return s.id === (options.costScenario || "BASE"); })[0];
    var rt = (scenario.commissionBps + scenario.spreadBps + scenario.slippageBps) / 10000;
    var dates = bench.dates.filter(function (d) { return d >= options.from && d <= options.to; });
    var rebal = monthlyDates(dates, options.from, options.to);
    var holdings = {}, cash = 1, equity = [], turnoverSum = 0, rebalCount = 0, delistedExits = 0, holdCounts = [];
    var nextRebal = 0, maxCarryDays = 7;
    for (var di = 0; di < dates.length; di++) {
      var d = dates[di];
      /* Bewertung; eine beendete Kursreihe (Delisting, Datenende) wird nach
         hoechstens maxCarryDays Kalendertagen zum letzten Kurs in Cash
         ueberfuehrt und gezaehlt. */
      var value = cash;
      Object.keys(holdings).forEach(function (t) {
        var p = prices[t] ? priceAt(prices[t], d) : null;
        if (!p || (p.lastDate && daysBetween(p.lastDate, d) > maxCarryDays)) {
          cash += holdings[t].shares * (p ? p.price : 0); value += holdings[t].shares * (p ? p.price : 0);
          delistedExits++; delete holdings[t]; return;
        }
        value += holdings[t].shares * p.price;
      });
      if (nextRebal < rebal.length && d === rebal[nextRebal]) {
        var m = latestBefore(membership, d), f = latestBefore(snapshots, d);
        if (!m || daysBetween(m.asOf, d) > c.universe.maxMembershipStaleDays) throw new Error("MEMBERSHIP_STALE at " + d);
        if (!f || daysBetween(f.asOf, d) > c.signals.maxFactorStaleDays) throw new Error("FACTOR_STALE at " + d);
        var members = m.members.filter(function (t) { return prices[t] && priceAt(prices[t], d) && prices[t].index[d] !== undefined; });
        var picks = select(profile, members, f.rows, c.selection.maxPositions);
        var target = {}, w = picks.length ? 1 / picks.length : 0;
        picks.forEach(function (t) { target[t] = w; });
        var traded = 0;
        var all = {}; Object.keys(holdings).forEach(function (t) { all[t] = 1; }); picks.forEach(function (t) { all[t] = 1; });
        Object.keys(all).forEach(function (t) {
          var p = priceAt(prices[t], d).price;
          var cur = holdings[t] ? holdings[t].shares * p / value : 0;
          traded += Math.abs((target[t] || 0) - cur);
        });
        var cost = traded * value * rt / 2;
        var investable = value - cost;
        holdings = {};
        picks.forEach(function (t) { var p = priceAt(prices[t], d).price; holdings[t] = { shares: investable * w / p, entry: p }; });
        cash = picks.length ? 0 : investable;
        value = investable;
        turnoverSum += traded / 2; rebalCount++; holdCounts.push(picks.length); nextRebal++;
      }
      equity.push([d, value]);
    }
    return { engineVersion: VERSION, profileId: profile.profileId, costScenario: scenario.id, equity: equity, rebalances: rebalCount, avgTurnover: rebalCount ? turnoverSum / rebalCount : 0,
      avgHoldings: holdCounts.length ? holdCounts.reduce(function (a, b) { return a + b; }, 0) / holdCounts.length : 0, delistedExits: delistedExits,
      metrics: metrics(equity, bench) };
  }

  function metrics(equity, bench) {
    if (equity.length < 2) return null;
    var v = equity.map(function (e) { return e[1]; }), days = equity.length;
    var years = daysBetween(equity[0][0], equity[equity.length - 1][0]) / 365.25;
    var cagr = years > 0 ? Math.pow(v[v.length - 1] / v[0], 1 / years) - 1 : null;
    var rets = []; for (var i = 1; i < v.length; i++) rets.push(v[i] / v[i - 1] - 1);
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, rets.length - 1));
    var peak = v[0], mdd = 0; v.forEach(function (x) { if (x > peak) peak = x; mdd = Math.min(mdd, x / peak - 1); });
    var b0 = bench.tr[bench.index[equity[0][0]]], b1 = bench.tr[bench.index[equity[equity.length - 1][0]]];
    var bcagr = b0 > 0 && b1 > 0 && years > 0 ? Math.pow(b1 / b0, 1 / years) - 1 : null;
    return { cagr: cagr, volatility: sd * Math.sqrt(252), sharpe: sd > 0 ? mean / sd * Math.sqrt(252) : null, maxDrawdown: mdd, benchmarkCagr: bcagr, excessCagr: cagr !== null && bcagr !== null ? cagr - bcagr : null, days: days };
  }

  /* Faktor-Quintile: je Snapshot (PIT, Termin = erster Handelstag nach dem
     Stand) Mitglieder nach Faktorwert in Quintile, Gesamtrendite ueber den
     Horizont. */
  function quintiles(options) {
    var c = options.contract, B = c.factorRanking.buckets, h = c.factorRanking.horizonTradingDays;
    var membership = sorted(options.membership), snapshots = sorted(options.snapshots);
    var bench = indexSeries(options.benchmark), prices = {};
    Object.keys(options.prices).forEach(function (t) { prices[t] = indexSeries(options.prices[t]); });
    var periods = [], prevTop = null, topTurnover = [];
    snapshots.forEach(function (s) {
      var di = bench.dates.findIndex(function (d) { return d > s.asOf; });
      if (di < 0 || di + h >= bench.dates.length) return;
      var d0 = bench.dates[di], d1 = bench.dates[di + h];
      var m = latestBefore(membership, d0);
      if (!m || daysBetween(m.asOf, d0) > c.universe.maxMembershipStaleDays) throw new Error("MEMBERSHIP_STALE at " + d0);
      var rows = m.members.map(function (t) { var v = s.rows[t] && s.rows[t][options.factorId]; var p = prices[t]; var a = p && p.index[d0] !== undefined ? p.tr[p.index[d0]] : null, b = p && p.index[d1] !== undefined ? p.tr[p.index[d1]] : null;
        return typeof v === "number" && isFinite(v) && a > 0 && b > 0 ? { t: t, v: v, r: b / a - 1 } : null; }).filter(Boolean);
      if (rows.length < B * 5) return;
      rows.sort(function (a, b) { return a.v - b.v || (a.t < b.t ? -1 : 1); });
      var q = [];
      for (var k = 0; k < B; k++) { var part = rows.slice(Math.floor(k * rows.length / B), Math.floor((k + 1) * rows.length / B)); q.push(part.reduce(function (s2, x) { return s2 + x.r; }, 0) / part.length); }
      var top = rows.slice(Math.floor((B - 1) * rows.length / B)).map(function (x) { return x.t; });
      if (prevTop) { var keep = top.filter(function (t) { return prevTop.indexOf(t) >= 0; }).length; topTurnover.push(1 - keep / top.length); }
      prevTop = top;
      var br = bench.tr[bench.index[d1]] / bench.tr[bench.index[d0]] - 1;
      periods.push({ asOf: s.asOf, entry: d0, exit: d1, n: rows.length, buckets: q, topMinusBottom: q[B - 1] - q[0], benchmark: br });
    });
    return { engineVersion: VERSION, factorId: options.factorId, periods: periods,
      meanTopMinusBottom: periods.length ? periods.reduce(function (s, p) { return s + p.topMinusBottom; }, 0) / periods.length : null,
      topTurnover: topTurnover.length ? topTurnover.reduce(function (a, b) { return a + b; }, 0) / topTurnover.length : null };
  }

  /* Gate: wie weit ist die Historie? Monate mit mindestens einem Stand,
     groesste Luecke. */
  function historyCoverage(dates, asOf) {
    var list = dates.slice().sort();
    var months = {}; list.forEach(function (d) { months[d.slice(0, 7)] = 1; });
    var gaps = list.slice(1).map(function (d, i) { return daysBetween(list[i], d); });
    return { snapshots: list.length, months: Object.keys(months).length, earliest: list[0] || null, latest: list[list.length - 1] || null,
      maxGapDays: gaps.length ? Math.max.apply(null, gaps) : null, medianGapDays: gaps.length ? gaps.slice().sort(function (a, b) { return a - b; })[Math.floor(gaps.length / 2)] : null,
      staleDays: list.length && asOf ? daysBetween(list[list.length - 1], asOf) : null };
  }

  var api = { VERSION: VERSION, latestBefore: latestBefore, monthlyDates: monthlyDates, select: select, run: run, quintiles: quintiles, historyCoverage: historyCoverage, meets: meets };
  if (isNode) module.exports = api; else global.VUProfileBacktest = api;
})(typeof window !== "undefined" ? window : globalThis);
