/**
 * Diagnostic performance metrics of a research run (mandate section 15). Pure; every result carries
 * certification DIAGNOSTIC_NOT_CERTIFIED. Conventions (declared, identical for every method):
 *  - 252 sessions per year; returns are daily equity returns of the research-v1 curve;
 *  - Sharpe / Sortino excess over a constant 2 % risk-free rate (PORTFOLIO_DEFAULTS.riskFreeRate of engine/backtest.mjs);
 *  - turnover = traded notional (buys + sells) / mean equity / years; cost burden = costs / mean equity / years;
 *  - SPY distance = CAGR minus SPY total-return CAGR over the same dates (snapshot spyTR).
 */
export const METRICS_VERSION = 'sf-metrics-1.0.0';
const Y = 252;

export function cagr(curve, key = 'equity') {
  if (curve.length < 2) return null;
  const a = curve[0][key], b = curve.at(-1)[key], years = (Date.parse(curve.at(-1).date) - Date.parse(curve[0].date)) / (365.25 * 864e5);
  return a > 0 && b > 0 && years > 0 ? (b / a) ** (1 / years) - 1 : null;
}
export function maxDrawdown(curve, key = 'equity') {
  let peak = -Infinity, dd = 0;
  for (const p of curve) { peak = Math.max(peak, p[key]); if (peak > 0) dd = Math.min(dd, p[key] / peak - 1); }
  return dd;
}
const dailyReturns = (curve) => { const r = []; for (let i = 1; i < curve.length; i++) if (curve[i - 1].equity > 0) r.push(curve[i].equity / curve[i - 1].equity - 1); return r; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function computeDiagnosticMetrics({ curve, trades, ledger, costs, spyTR = null, riskFreeRate = 0.02, splitPeriods = [] }) {
  const r = dailyReturns(curve), rf = (1 + riskFreeRate) ** (1 / Y) - 1, ex = r.map((x) => x - rf);
  const vol = sd(r), down = r.filter((x) => x < rf).map((x) => (x - rf) ** 2);
  const downDev = down.length ? Math.sqrt(down.reduce((a, b) => a + b, 0) / r.length) : null;
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0);
  const years = curve.length > 1 ? (Date.parse(curve.at(-1).date) - Date.parse(curve[0].date)) / (365.25 * 864e5) : null;
  const meanEq = mean(curve.map((p) => p.equity));
  const traded = ledger.filter((x) => x.side === 'BUY' || x.side === 'SELL').reduce((a, x) => a + Math.abs(x.gross), 0);
  const c = cagr(curve);
  let spy = null;
  if (spyTR && curve.length > 1) { const s = spyTR.filter((p) => p.date >= curve[0].date && p.date <= curve.at(-1).date); spy = cagr(s, 'value'); }
  const periodCagr = (from, to) => cagr(curve.filter((p) => p.date >= from && p.date <= to));
  const annual = {};
  for (const p of curve) { const y = p.date.slice(0, 4); (annual[y] ||= { first: p.equity, last: p.equity }).last = p.equity; }
  const ys = Object.keys(annual).sort(); let prev = null;
  const annualReturns = Object.fromEntries(ys.map((y) => { const base = prev ?? annual[y].first; prev = annual[y].last; return [y, base > 0 ? annual[y].last / base - 1 : null]; }));
  return {
    version: METRICS_VERSION,
    certification: 'DIAGNOSTIC_NOT_CERTIFIED',
    cagr: c,
    maxDrawdown: maxDrawdown(curve),
    volatility: vol === null ? null : vol * Math.sqrt(Y),
    sharpe: vol ? (mean(ex) / vol) * Math.sqrt(Y) : null,
    sortino: downDev ? (mean(ex) / downDev) * Math.sqrt(Y) : null,
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    profitFactor: losses.length ? wins.reduce((a, t) => a + t.pnl, 0) / -losses.reduce((a, t) => a + t.pnl, 0) : null,
    exposure: mean(curve.map((p) => p.exposure ?? 0)),
    turnover: years && meanEq ? traded / meanEq / years : null,
    medianHoldingSessions: median(trades.map((t) => t.heldSessions).filter(Number.isFinite)),
    costBurden: years && meanEq ? costs / meanEq / years : null,
    spyCagr: spy,
    spyDistance: c !== null && spy !== null ? c - spy : null,
    annualReturns,
    periods: splitPeriods.map(([a, b]) => ({ from: a, to: b, cagr: periodCagr(a, b) })),
  };
}
