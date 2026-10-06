// Supertrader — Backtest-Portfolio und Kennzahlen.
//
// Die Trades kommen aus simulator.mjs (identische Regeln wie live). Hier
// werden sie chronologisch in ein Portfolio mit Kapital, Positionslimit und
// maximaler Auslastung uebersetzt. Gleichzeitig ausgeloeste Trades werden
// deterministisch nach Symbol sortiert - nie nach ihrem spaeteren Ergebnis.
import { simulate } from './simulator.mjs';

export const PORTFOLIO_DEFAULTS = Object.freeze({
  initialEquity: 100000,
  riskPerTrade: 0.005,     // KK-RISK-01 Mitte der Spanne 0.3-0.5 %, VU-Formel
  maxPositionPct: 0.20,
  maxPositions: 10,
  maxExposure: 1.0,
  riskFreeRate: 0.02,
});

// Laeuft eine Strategie ueber alle Kontexte (ein Kontext je Symbol).
export function collectTrades(strategy, contexts, opts = {}) {
  const trades = [];
  for (const ctx of contexts) {
    const res = simulate(strategy, ctx, { ...opts, from: opts.from ?? 0 });
    for (const s of res.finished) if (s.entry && s.exits.length) trades.push({ symbol: ctx.symbol, signal: s });
  }
  return trades;
}

export function runPortfolio(trades, priceOf, calendar, cfg = PORTFOLIO_DEFAULTS) {
  const byEntry = new Map();
  for (const tr of trades) {
    const d = tr.signal.entry.date;
    if (!byEntry.has(d)) byEntry.set(d, []);
    byEntry.get(d).push(tr);
  }
  for (const list of byEntry.values()) list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  let cash = cfg.initialEquity;
  const open = [];
  const equity = [], taken = [], skipped = [];
  let traded = 0;
  for (const date of calendar) {
    // Ausstiege dieses Tages
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i];
      for (const x of p.signal.exits) if (x.date === date && !x._done) {
        const q = p.shares * x.fraction / p.remainingFraction;
        cash += q * x.price; traded += q * x.price;
        p.shares -= q; p.remainingFraction -= x.fraction; x._done = true;
      }
      if (p.remainingFraction <= 1e-9) open.splice(i, 1);
    }
    // Einstiege dieses Tages
    for (const tr of byEntry.get(date) || []) {
      const s = tr.signal;
      const eq = cash + open.reduce((a, p) => a + p.shares * (priceOf(p.symbol, date) ?? p.signal.entry.price), 0);
      const risk = s.entry.price - s.initialStop;
      if (open.length >= cfg.maxPositions || !(risk > 0)) { skipped.push({ id: s.id, reason: open.length >= cfg.maxPositions ? 'MAX_POSITIONS' : 'NO_RISK' }); continue; }
      let shares = (eq * cfg.riskPerTrade) / risk;
      shares = Math.min(shares, (eq * cfg.maxPositionPct) / s.entry.price, cash / s.entry.price);
      const invested = eq - cash;
      shares = Math.min(shares, Math.max(0, eq * cfg.maxExposure - invested) / s.entry.price);
      if (!(shares > 0)) { skipped.push({ id: s.id, reason: 'NO_CASH' }); continue; }
      cash -= shares * s.entry.price; traded += shares * s.entry.price;
      open.push({ symbol: tr.symbol, signal: s, shares, remainingFraction: 1 });
      taken.push(s);
      // Same-Bar-Ausstieg am Einstiegstag
      for (const x of s.exits) if (x.date === date && !x._done) {
        const p = open[open.length - 1];
        const q = p.shares * x.fraction / p.remainingFraction;
        cash += q * x.price; p.shares -= q; p.remainingFraction -= x.fraction; x._done = true;
        if (p.remainingFraction <= 1e-9) open.pop();
      }
    }
    const mv = open.reduce((a, p) => a + p.shares * (priceOf(p.symbol, date) ?? p.signal.entry.price), 0);
    equity.push({ date, equity: cash + mv, exposure: (cash + mv) > 0 ? mv / (cash + mv) : 0 });
  }
  for (const tr of trades) for (const x of tr.signal.exits) delete x._done;
  return { equity, taken, skipped, turnoverNotional: traded };
}

function std(a) { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); }

export function computeMetrics(equity, trades, benchmark, cfg = PORTFOLIO_DEFAULTS) {
  const n = equity.length;
  if (n < 2) return null;
  const e0 = equity[0].equity, e1 = equity[n - 1].equity;
  const days = (new Date(equity[n - 1].date) - new Date(equity[0].date)) / 86400000;
  const years = days / 365.25;
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(equity[i].equity / equity[i - 1].equity - 1);
  const vol = std(rets) * Math.sqrt(252);
  const rfD = cfg.riskFreeRate / 252;
  const ex = rets.map((r) => r - rfD);
  const meanEx = ex.reduce((s, v) => s + v, 0) / ex.length;
  const down = ex.filter((r) => r < 0);
  const downDev = down.length ? Math.sqrt(down.reduce((s, v) => s + v * v, 0) / ex.length) * Math.sqrt(252) : null;
  let peak = -Infinity, mdd = 0;
  for (const p of equity) { peak = Math.max(peak, p.equity); mdd = Math.min(mdd, p.equity / peak - 1); }
  const cagr = years > 0 ? (e1 / e0) ** (1 / years) - 1 : null;
  const tr = trades.map((s) => s.result.returnPct).filter(Number.isFinite);
  const wins = tr.filter((r) => r > 0), losses = tr.filter((r) => r <= 0);
  let streak = 0, maxStreak = 0;
  for (const r of tr) { streak = r <= 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); }
  const sorted = [...tr].sort((a, b) => a - b);
  const tailN = Math.max(1, Math.floor(sorted.length * 0.05));
  const annual = {};
  let prev = equity[0];
  for (let i = 1; i < n; i++) {
    const y = equity[i].date.slice(0, 4);
    if (i === n - 1 || equity[i + 1].date.slice(0, 4) !== y) { annual[y] = equity[i].equity / prev.equity - 1; prev = equity[i]; }
  }
  const bench = benchmark && benchmark.length > 1 ? benchmark[benchmark.length - 1].value / benchmark[0].value - 1 : null;
  const benchCagr = bench !== null && years > 0 ? (1 + bench) ** (1 / years) - 1 : null;
  return {
    period: { from: equity[0].date, to: equity[n - 1].date, years },
    totalReturn: e1 / e0 - 1, cagr, benchmarkReturn: bench, benchmarkCagr: benchCagr,
    excessCagr: cagr !== null && benchCagr !== null ? cagr - benchCagr : null,
    volatility: vol, sharpe: vol > 0 ? (meanEx * 252) / vol : null, sortino: downDev ? (meanEx * 252) / downDev : null,
    maxDrawdown: mdd, calmar: mdd < 0 && cagr !== null ? cagr / -mdd : null,
    trades: tr.length, hitRate: tr.length ? wins.length / tr.length : null,
    avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
    expectancy: tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : null,
    profitFactor: losses.length && losses.reduce((a, b) => a + b, 0) < 0 ? wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0) : null,
    avgHoldingSessions: trades.length ? trades.reduce((a, s) => a + s.result.sessionsHeld, 0) / trades.length : null,
    exposure: equity.reduce((a, p) => a + p.exposure, 0) / n,
    maxLosingStreak: maxStreak,
    tailLoss5pct: sorted.length ? sorted.slice(0, tailN).reduce((a, b) => a + b, 0) / tailN : null,
    annualReturns: annual,
  };
}

// Zeitliche Teilung: In-Sample (Parameterdefinition), Out-of-Sample
// (unveraendert), Walk-forward-Fenster je Kalenderjahr.
export function splitPeriods(calendar, isShare = 0.6) {
  const cut = Math.floor(calendar.length * isShare);
  const years = [...new Set(calendar.map((d) => d.slice(0, 4)))];
  return {
    inSample: { from: calendar[0], to: calendar[cut - 1] },
    outOfSample: { from: calendar[cut], to: calendar[calendar.length - 1] },
    walkForward: years.map((y) => ({ year: y, from: calendar.find((d) => d.startsWith(y)), to: [...calendar].reverse().find((d) => d.startsWith(y)) })),
  };
}
