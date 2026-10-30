'use strict';
// Research-only, pure backtest metrics from an equity/cash/trade path (opt-in; no product path reads this module).
// Works on the output of research-portfolio.cjs#runPortfolio (fromPortfolio) and on simple ledgers. Nothing here
// changes a ledger, selects a strategy or certifies a result: every output carries certification NOT_CERTIFIED.
// An independent Python re-implementation lives in scripts/quant/verify-backtest-metrics.py (parity tests).
//
// computeMetrics(ledger, options) -> metrics document
//   ledger  = { initialCapital?, rows: [{date, value, cash?, receivables?, benchmark?, positions?: [{listingId, units, price}]}],
//               trades?: [{date, listingId, side: 'BUY'|'SELL', notional, fee?, slippage?, units?, reason?}] }
//   options = { periodsPerYear: 52 (WEEKLY), riskFree: {annualRate: 0, label}, benchmark?: [{date, value}] (else rows[].benchmark) }
// Conventions (documented in docs/quant/RESEARCH_POPULATION_AND_PORTFOLIO.md):
//   - the path starts at (rows[0].date, initialCapital); without initialCapital at rows[0].value;
//   - period returns are row-to-row (r_i = v_i / v_{i-1} - 1, i >= 1); the initial-capital stub (entry costs) enters total
//     return, CAGR, calendar years and drawdown, but not the period statistics (volatility, Sharpe, beta, tracking error);
//   - volatility uses the sample standard deviation (n - 1) times sqrt(periodsPerYear);
//   - Sharpe = (mean(r) - rf_period) / sd(r) * sqrt(periodsPerYear), rf_period = (1 + annualRate)^(1/periodsPerYear) - 1;
//     the risk-free rate is an explicit, labelled assumption (default 0, ASSUMPTION_ZERO_DEFAULT);
//   - a trade (round trip) is a position episode of one listing: opened by a BUY when not held, closed when the listing is no
//     longer held. P&L = sell notional - buy notional - fees - slippage. Episodes opened or closed without a trade (spin-off
//     units, successor units, terminal events) are counted but excluded from the hit rate (not attributable from trades);
//   - turnover per date = traded notional / (2 x pre-trade equity), pre-trade equity = row value + that date's costs (the
//     research-portfolio.cjs definition); cash distributions are not part of trade P&L.
const crypto = require('node:crypto');

const VERSION = 'backtest-metrics-1.0.0';
const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }
function finite(x, code, min = -Infinity) { if (typeof x !== 'number' || !Number.isFinite(x) || x < min) fail(code); return x; }
function isDate(x) { return typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x; }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { finite(x, 'NONFINITE_INPUT'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  fail('NON_JSON_INPUT');
}
const sha = x => crypto.createHash('sha256').update(canonical(x)).digest('hex');
const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
function cov(a, b) { if (a.length < 2) return null; const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); }

function normalizeOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_OPTIONS');
  for (const k of Object.keys(options)) if (!['periodsPerYear', 'riskFree', 'benchmark', 'benchmarkLabel'].includes(k)) fail('INVALID_OPTIONS', k);
  const periodsPerYear = options.periodsPerYear === undefined ? 52 : finite(options.periodsPerYear, 'INVALID_PERIODS_PER_YEAR', Number.MIN_VALUE);
  const rf = options.riskFree === undefined ? { annualRate: 0, label: 'ASSUMPTION_ZERO_DEFAULT' } : options.riskFree;
  if (!rf || typeof rf !== 'object') fail('INVALID_RISK_FREE');
  finite(rf.annualRate, 'INVALID_RISK_FREE', -0.99);
  if (typeof rf.label !== 'string' || !rf.label) fail('RISK_FREE_LABEL_REQUIRED');
  return { periodsPerYear, riskFree: { annualRate: rf.annualRate, label: rf.label }, benchmark: options.benchmark ?? null, benchmarkLabel: options.benchmarkLabel ?? null };
}
function normalizeLedger(ledger) {
  if (!ledger || !Array.isArray(ledger.rows) || !ledger.rows.length) fail('ROWS_REQUIRED');
  const rows = ledger.rows.map((r, i) => {
    if (!isDate(r.date) || (i && r.date <= ledger.rows[i - 1].date)) fail('INVALID_ROW_DATE', String(r.date));
    finite(r.value, 'INVALID_VALUE', 0);
    const out = { date: r.date, value: r.value };
    if (r.cash !== undefined) out.cash = finite(r.cash, 'INVALID_CASH');
    if (r.receivables !== undefined) out.receivables = finite(r.receivables, 'INVALID_RECEIVABLES');
    if (r.benchmark !== undefined && r.benchmark !== null) out.benchmark = finite(r.benchmark, 'INVALID_BENCHMARK', Number.MIN_VALUE);
    if (r.positions !== undefined) {
      if (!Array.isArray(r.positions)) fail('INVALID_POSITIONS');
      out.positions = r.positions.map(p => ({ listingId: String(p.listingId), units: finite(p.units, 'INVALID_UNITS'), price: finite(p.price, 'INVALID_PRICE', 0) }));
    }
    return out;
  });
  const initialCapital = ledger.initialCapital === undefined || ledger.initialCapital === null ? null : finite(ledger.initialCapital, 'INVALID_INITIAL_CAPITAL', Number.MIN_VALUE);
  const dateSet = new Set(rows.map(r => r.date));
  const trades = (ledger.trades || []).map(t => {
    if (!isDate(t.date) || !dateSet.has(t.date)) fail('TRADE_DATE_NOT_A_ROW', String(t.date));
    if (t.side !== 'BUY' && t.side !== 'SELL') fail('INVALID_SIDE');
    const out = { date: t.date, listingId: String(t.listingId), side: t.side, notional: finite(t.notional, 'INVALID_NOTIONAL', 0), fee: t.fee === undefined ? 0 : finite(t.fee, 'INVALID_FEE', 0), slippage: t.slippage === undefined ? 0 : finite(t.slippage, 'INVALID_SLIPPAGE', 0) };
    if (t.units !== undefined) out.units = finite(t.units, 'INVALID_UNITS', 0);
    if (t.reason !== undefined) out.reason = String(t.reason);
    return out;
  });
  return { initialCapital, rows, trades };
}

/** Adapter: runPortfolio result -> ledger (rows with cash, receivables, positions, benchmark; trades with costs and reasons). */
function fromPortfolio(result) {
  if (!result || !Array.isArray(result.equity) || !Array.isArray(result.trades)) fail('PORTFOLIO_RESULT_REQUIRED');
  return {
    initialCapital: result.initialCapital,
    rows: result.equity.map(e => ({ date: e.date, value: e.value, cash: e.cash, receivables: e.receivables, benchmark: e.benchmark, positions: e.positions.map(p => ({ listingId: p.listingId, units: p.units, price: p.price })) })),
    trades: result.trades.map(t => ({ date: t.date, listingId: t.listingId, side: t.side, notional: t.notional, fee: t.fee, slippage: t.slippage, units: t.units, ...(t.reason ? { reason: t.reason } : {}) })),
  };
}

function drawdown(points) { // points: [{date, value}] starting with the initial point
  let peak = points[0], best = { maxDrawdown: 0, peakDate: points[0].date, troughDate: points[0].date, peakIndex: 0, troughIndex: 0 };
  let peakIndex = 0;
  points.forEach((p, i) => {
    if (p.value > peak.value) { peak = p; peakIndex = i; }
    const dd = peak.value > 0 ? p.value / peak.value - 1 : 0;
    if (dd < best.maxDrawdown) best = { maxDrawdown: dd, peakDate: peak.date, troughDate: p.date, peakIndex, troughIndex: i };
  });
  if (best.maxDrawdown === 0) return { maxDrawdown: 0, peakDate: null, troughDate: null, recoveryDate: null, peakToTroughPeriods: 0, peakToTroughDays: 0, durationPeriods: 0, durationDays: 0, recovered: true };
  const peakValue = points[best.peakIndex].value;
  let rec = null;
  for (let i = best.troughIndex + 1; i < points.length; i++) if (points[i].value >= peakValue) { rec = i; break; }
  const endIndex = rec === null ? points.length - 1 : rec;
  return { maxDrawdown: best.maxDrawdown, peakDate: best.peakDate, troughDate: best.troughDate, recoveryDate: rec === null ? null : points[rec].date,
    peakToTroughPeriods: best.troughIndex - best.peakIndex, peakToTroughDays: days(best.peakDate, best.troughDate),
    durationPeriods: endIndex - best.peakIndex, durationDays: days(best.peakDate, points[endIndex].date), recovered: rec !== null };
}
function calendarYears(points) { // points start with the initial point
  const out = [], lastByYear = new Map();
  points.forEach((p, i) => { if (i) lastByYear.set(p.date.slice(0, 4), p); });
  let prev = points[0];
  const years = [...lastByYear.keys()].sort();
  years.forEach(y => {
    const end = lastByYear.get(y);
    out.push({ year: Number(y), from: prev.date, to: end.date, startValue: prev.value, endValue: end.value, return: prev.value > 0 ? end.value / prev.value - 1 : null,
      // partial: the measured span does not run from the turn of the year (start in the prior year or by Jan 7) to Dec 24 or later
      partial: !(prev.date < y + '-01-08') || end.date < y + '-12-24' });
    prev = end;
  });
  return out;
}
function pathStats(points, periodsPerYear, rfPeriod) {
  const first = points[0], last = points.at(-1), years = days(first.date, last.date) / 365.25;
  const r = []; for (let i = 2; i < points.length; i++) r.push(points[i].value / points[i - 1].value - 1); // row-to-row; points[0] is the initial stub
  const s = sd(r), m = mean(r);
  return { startValue: first.value, endValue: last.value, totalReturn: first.value > 0 ? last.value / first.value - 1 : null,
    cagr: years > 0 && first.value > 0 && last.value > 0 ? Math.pow(last.value / first.value, 1 / years) - 1 : (years > 0 && last.value === 0 ? -1 : null), years,
    periods: r.length, meanPeriodReturn: m, annualizedVolatility: s === null ? null : s * Math.sqrt(periodsPerYear),
    sharpe: s ? (m - rfPeriod) / s * Math.sqrt(periodsPerYear) : null, drawdown: drawdown(points), calendarYears: calendarYears(points), returns: r };
}
function heldSets(rows, trades) {
  if (rows.every(r => Array.isArray(r.positions))) return { source: 'POSITIONS', held: rows.map(r => new Set(r.positions.filter(p => p.units > 0).map(p => p.listingId))) };
  if (trades.some(t => t.units === undefined)) return null;
  const units = new Map(), peak = new Map(), byDate = new Map();
  for (const t of trades) { if (!byDate.has(t.date)) byDate.set(t.date, []); byDate.get(t.date).push(t); }
  return { source: 'TRADE_UNITS', held: rows.map(r => {
    for (const t of byDate.get(r.date) || []) {
      const u = (units.get(t.listingId) || 0) + (t.side === 'BUY' ? t.units : -t.units);
      peak.set(t.listingId, Math.max(peak.get(t.listingId) || 0, Math.abs(u)));
      units.set(t.listingId, Math.abs(u) <= 1e-9 * (peak.get(t.listingId) || 1) ? 0 : u);
    }
    return new Set([...units].filter(([, u]) => u > 0).map(([k]) => k));
  }) };
}
function episodes(rows, trades) {
  const hs = heldSets(rows, trades);
  if (!hs) return { state: 'UNITS_OR_POSITIONS_REQUIRED', list: [] };
  const byDate = new Map(); for (const t of trades) { if (!byDate.has(t.date)) byDate.set(t.date, []); byDate.get(t.date).push(t); }
  const open = new Map(), list = [];
  rows.forEach((r, i) => {
    const today = byDate.get(r.date) || [], held = hs.held[i];
    for (const t of today) {
      let e = open.get(t.listingId);
      if (!e) { e = { listingId: t.listingId, openDate: r.date, openIndex: i, openedBy: t.side === 'BUY' ? 'BUY' : 'NO_BUY_TRADE', buy: 0, sell: 0, costs: 0, trades: 0, lastSide: null, lastReason: null }; open.set(t.listingId, e); }
      if (t.side === 'BUY') e.buy += t.notional; else e.sell += t.notional;
      e.costs += t.fee + t.slippage; e.trades++; e.lastSide = t.side; e.lastReason = t.reason || null;
    }
    for (const k of held) if (!open.has(k)) open.set(k, { listingId: k, openDate: r.date, openIndex: i, openedBy: 'NO_BUY_TRADE', buy: 0, sell: 0, costs: 0, trades: 0, lastSide: null, lastReason: null });
    for (const [k, e] of [...open]) {
      if (held.has(k)) continue;
      const soldToday = today.some(t => t.listingId === k && t.side === 'SELL');
      e.closeDate = r.date; e.closeIndex = i; e.closedBy = soldToday && e.lastSide === 'SELL' ? 'SELL' : 'NO_SELL_TRADE';
      list.push(e); open.delete(k);
    }
  });
  const last = rows.at(-1);
  for (const e of open.values()) {
    const pos = (last.positions || []).find(p => p.listingId === e.listingId);
    e.closeDate = null; e.closeIndex = null; e.closedBy = 'OPEN_AT_END'; e.markValue = pos ? pos.units * pos.price : null;
    list.push(e);
  }
  list.forEach(e => {
    e.attributable = e.openedBy === 'BUY' && e.closedBy === 'SELL';
    e.pnl = e.attributable ? e.sell - e.buy - e.costs : (e.closedBy === 'OPEN_AT_END' && e.openedBy === 'BUY' && e.markValue !== null ? e.markValue + e.sell - e.buy - e.costs : null);
    e.return = e.pnl !== null && e.buy > 0 ? e.pnl / e.buy : null;
    if (e.closeIndex !== null) { e.holdingPeriods = e.closeIndex - e.openIndex; e.holdingDays = days(e.openDate, e.closeDate); }
  });
  list.sort((a, b) => a.openDate < b.openDate ? -1 : a.openDate > b.openDate ? 1 : a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0);
  return { state: 'RECONSTRUCTED_FROM_' + hs.source, list };
}

function computeMetrics(ledgerIn, optionsIn) {
  const options = normalizeOptions(optionsIn), ledger = normalizeLedger(ledgerIn), rows = ledger.rows, warnings = [];
  const ppy = options.periodsPerYear, rfPeriod = Math.pow(1 + options.riskFree.annualRate, 1 / ppy) - 1;
  const initial = ledger.initialCapital === null ? rows[0].value : ledger.initialCapital;
  if (ledger.initialCapital === null) warnings.push('INITIAL_CAPITAL_NOT_GIVEN_FIRST_ROW_USED');
  const points = [{ date: rows[0].date, value: initial }, ...rows.map(r => ({ date: r.date, value: r.value }))];
  if (rows.length > 2) {
    const gaps = rows.slice(1).map((r, i) => days(rows[i].date, r.date)).sort((a, b) => a - b), med = gaps[gaps.length >> 1];
    if (ppy === 52 && (med < 5 || med > 9)) warnings.push('PERIODICITY_MISMATCH_WEEKLY_ASSUMED_MEDIAN_GAP_' + med + 'D');
  }
  const strat = pathStats(points, ppy, rfPeriod);
  // Exposure
  const cashShares = rows.filter(r => r.cash !== undefined && r.value > 0).map(r => r.cash / r.value);
  const recShares = rows.filter(r => r.receivables !== undefined && r.value > 0).map(r => r.receivables / r.value);
  // Costs and turnover
  const byDate = new Map();
  for (const t of ledger.trades) { const x = byDate.get(t.date) || { notional: 0, costs: 0, fees: 0, slippage: 0, n: 0 }; x.notional += t.notional; x.costs += t.fee + t.slippage; x.fees += t.fee; x.slippage += t.slippage; x.n++; byDate.set(t.date, x); }
  let turnoverSum = 0, fees = 0, slippage = 0;
  for (const r of rows) { const x = byDate.get(r.date); if (!x) continue; const pre = r.value + x.costs; if (pre > 0) turnoverSum += x.notional / (2 * pre); fees += x.fees; slippage += x.slippage; }
  // Trades
  const ep = episodes(rows, ledger.trades), closed = ep.list.filter(e => e.closeIndex !== null), attributable = closed.filter(e => e.attributable), openAtEnd = ep.list.filter(e => e.closeIndex === null);
  const wins = attributable.filter(e => e.pnl > 0).length;
  const reasons = {}; for (const t of ledger.trades) if (t.reason) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  // Benchmark (same dates only; nothing is filled)
  let bench;
  const series = options.benchmark ? new Map(options.benchmark.map(b => [b.date, finite(b.value, 'INVALID_BENCHMARK', Number.MIN_VALUE)])) : (rows.every(r => r.benchmark !== undefined) ? new Map(rows.map(r => [r.date, r.benchmark])) : null);
  if (!series) bench = { state: 'BENCHMARK_NOT_SUPPLIED' };
  else {
    const missing = rows.filter(r => !series.has(r.date)).map(r => r.date);
    if (missing.length) bench = { state: 'BENCHMARK_DATES_INCOMPLETE', missingDates: missing.length, firstMissing: missing[0] };
    else {
      const bpoints = [{ date: rows[0].date, value: series.get(rows[0].date) }, ...rows.map(r => ({ date: r.date, value: series.get(r.date) }))];
      const b = pathStats(bpoints, ppy, rfPeriod), rs = strat.returns, rb = b.returns, ex = rs.map((x, i) => x - rb[i]);
      const te = sd(ex), vb = cov(rb, rb), c = cov(rs, rb), ss = sd(rs), sb = sd(rb);
      bench = { state: 'SAME_DATES', label: options.benchmarkLabel, totalReturn: b.totalReturn, cagr: b.cagr, annualizedVolatility: b.annualizedVolatility, sharpe: b.sharpe, maxDrawdown: b.drawdown.maxDrawdown,
        calendarYears: b.calendarYears.map(y => ({ year: y.year, return: y.return })), excessTotalReturn: strat.totalReturn - b.totalReturn,
        excessCagr: strat.cagr !== null && b.cagr !== null ? strat.cagr - b.cagr : null,
        meanPeriodExcess: mean(ex), trackingError: te === null ? null : te * Math.sqrt(ppy), informationRatio: te ? mean(ex) / te * Math.sqrt(ppy) : null,
        beta: vb ? c / vb : null, correlation: ss && sb ? c / (ss * sb) : null, periods: ex.length };
    }
  }
  const limitations = ['PERIOD_STATISTICS_ROW_TO_ROW_INITIAL_STUB_EXCLUDED', 'SAMPLE_STANDARD_DEVIATION_N_MINUS_1', 'TRADE_PNL_EXCLUDES_CASH_DISTRIBUTIONS_AND_TERMINAL_CONSIDERATION', 'RISK_FREE_RATE_IS_AN_ASSUMPTION', 'DESCRIPTIVE_NO_INFERENCE_NO_CERTIFICATION'];
  const doc = {
    schemaVersion: VERSION, certification: 'NOT_CERTIFIED', productionApproved: false,
    assumptions: { periodsPerYear: ppy, periodicityLabel: ppy === 52 ? 'WEEKLY' : 'CUSTOM', riskFree: options.riskFree, riskFreePerPeriod: rfPeriod, startPoint: ledger.initialCapital === null ? 'FIRST_ROW_VALUE' : 'INITIAL_CAPITAL_AT_FIRST_ROW_DATE' },
    period: { from: rows[0].date, to: rows.at(-1).date, rows: rows.length, years: strat.years },
    returns: { initialCapital: initial, endValue: strat.endValue, totalReturn: strat.totalReturn, cagr: strat.cagr, calendarYears: strat.calendarYears },
    risk: { periods: strat.periods, meanPeriodReturn: strat.meanPeriodReturn, annualizedVolatility: strat.annualizedVolatility, sharpe: strat.sharpe, sharpeRiskFreeLabel: options.riskFree.label, ...strat.drawdown },
    exposure: { averageCashShare: mean(cashShares), averageReceivablesShare: mean(recShares), rowsWithCash: cashShares.length },
    costs: { fees, slippage, total: fees + slippage, shareOfInitialCapital: (fees + slippage) / initial },
    turnover: { oneWayTurnoverSum: turnoverSum, annualizedOneWayTurnover: strat.years > 0 ? turnoverSum / strat.years : null, tradeDates: byDate.size },
    trades: { fills: ledger.trades.length, fillsByReason: reasons, reconstruction: ep.state, roundTrips: attributable.length, closedEpisodes: closed.length, nonAttributableClosed: closed.length - attributable.length, openAtEnd: openAtEnd.length,
      hitRate: attributable.length ? wins / attributable.length : null, winners: wins, averageRoundTripReturn: mean(attributable.map(e => e.return).filter(x => x !== null)),
      averageHoldingPeriods: mean(closed.map(e => e.holdingPeriods)), averageHoldingDays: mean(closed.map(e => e.holdingDays)), totalRoundTripPnl: attributable.reduce((s, e) => s + e.pnl, 0) },
    benchmark: bench, warnings, limitations,
  };
  doc.inputHash = sha({ ledger, options: { periodsPerYear: ppy, riskFree: options.riskFree, benchmark: options.benchmark, benchmarkLabel: options.benchmarkLabel } });
  doc.resultHash = sha(doc);
  return doc;
}
/** Per-episode list (for audits and the Python parity check). */
function tradeEpisodes(ledgerIn) { const l = normalizeLedger(ledgerIn); return episodes(l.rows, l.trades); }

module.exports = { VERSION, computeMetrics, fromPortfolio, tradeEpisodes, canonical, hash: sha };
