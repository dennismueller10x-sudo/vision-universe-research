// Minervini Canonical Replication – Messgroessen (nur Messung, keine Rueckwirkung auf die Engine).
// Portfolioqualitaet (Depotkurve) und Signalqualitaet (alle ausgeloesten Setups ohne Kapitalgrenze) getrennt.

const TRADING_DAYS = 252; // Annualisierungskonvention der Messung
const YEAR_MS = 365.25 * 864e5;

export function curveStats(curve) {
  if (!curve.length) return null;
  const e0 = curve[0].equity, e1 = curve[curve.length - 1].equity;
  const years = (Date.parse(curve[curve.length - 1].date) - Date.parse(curve[0].date)) / YEAR_MS;
  const rets = [];
  for (let i = 1; i < curve.length; i++) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  let peak = -Infinity, mdd = 0;
  for (const p of curve) { peak = Math.max(peak, p.equity); mdd = Math.min(mdd, p.equity / peak - 1); }
  const exp = curve.map((p) => p.exposure);
  return {
    totalReturn: e1 / e0 - 1,
    cagr: years > 0 ? (e1 / e0) ** (1 / years) - 1 : null,
    maxDrawdown: mdd,
    volatility: sd * Math.sqrt(TRADING_DAYS),
    sharpeRf0: sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : null,
    exposureMean: exp.reduce((a, b) => a + b, 0) / exp.length,
    exposureMedian: exp.slice().sort((a, b) => a - b)[Math.floor(exp.length / 2)],
    daysInvested: exp.filter((x) => x > 0).length / exp.length,
    positionsMean: curve.reduce((a, p) => a + p.positions, 0) / curve.length,
    positionsMax: Math.max(...curve.map((p) => p.positions)),
    daysAtInitialCeiling: curve.filter((p) => p.ceiling < 1).length / curve.length,
    years,
  };
}

export function tradeStats(trades) {
  const done = trades.filter((t) => Number.isFinite(t.returnPct));
  const wins = done.filter((t) => t.returnPct > 0), losses = done.filter((t) => t.returnPct <= 0);
  const avg = (xs, f) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : null);
  const byRule = {};
  for (const t of done) for (const x of t.exits || []) { const k = typeof x === 'string' ? x : x.ruleId; byRule[k] = (k in byRule ? byRule[k] : 0) + 1; }
  return {
    count: done.length, winRate: done.length ? wins.length / done.length : null,
    avgReturn: avg(done, (t) => t.returnPct), avgWin: avg(wins, (t) => t.returnPct), avgLoss: avg(losses, (t) => t.returnPct),
    avgR: avg(done, (t) => t.rMultiple), avgMfe: avg(done, (t) => t.mfe), avgMae: avg(done, (t) => t.mae),
    avgHold: avg(done.filter((t) => Number.isFinite(t.holdSessions)), (t) => t.holdSessions),
    exitRuleCounts: byRule,
    openAtEnd: done.filter((t) => t.kind === 'OPEN_AT_END' || t.open).length,
  };
}

// Umschlag: gehandeltes Volumen (Kauf + Verkauf) je Jahr / mittleres Kapital.
export function turnover(trades, curve) {
  const traded = trades.reduce((a, t) => a + t.entryPrice * t.shares0 + t.exits.reduce((s, x) => s + x.price * x.shares, 0), 0);
  const meanEq = curve.reduce((a, p) => a + p.equity, 0) / curve.length;
  const years = (Date.parse(curve[curve.length - 1].date) - Date.parse(curve[0].date)) / YEAR_MS;
  return years > 0 ? traded / meanEq / years : null;
}

// SPY-Gesamtrendite ueber dieselben Tage: spyTR = [{date, value}] (validation/analyze-methods.mjs#loadPitData).
export function benchmarkStats(spyTR, from, to) {
  const xs = spyTR.filter((p) => p.date >= from && p.date <= to);
  if (xs.length < 2) return null;
  return curveStats(xs.map((p) => ({ date: p.date, equity: p.value, exposure: 1, positions: 1, ceiling: 1 })));
}

// Signalqualitaet gegen SPY ueber dieselbe Haltedauer.
export function signalVsSpy(signals, spyByDate) {
  const ex = [];
  for (const s of signals) {
    const a = spyByDate.get(s.entryDate), b = spyByDate.get(s.exitDate);
    if (a > 0 && b > 0) ex.push(s.returnPct - (b / a - 1));
  }
  ex.sort((x, y) => x - y);
  return { n: ex.length, meanExcess: ex.length ? ex.reduce((p, q) => p + q, 0) / ex.length : null, medianExcess: ex.length ? ex[Math.floor(ex.length / 2)] : null, shareAboveSpy: ex.length ? ex.filter((x) => x > 0).length / ex.length : null };
}
