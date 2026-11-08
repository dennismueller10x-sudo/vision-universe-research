'use strict';
// Research utilities only; not an engine adapter or a certification of input curves.
const crypto = require('node:crypto');
const PROTOCOL_SHA256 = '9d4c41e36418e1d4df4d020ec4c7fb015bbc91a7df8bb193eb629e397da6e818';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function variants() {
  const out = [];
  for (const method of ['C01', 'C02', 'C03', 'C08', 'C12', 'TOP5'])
    for (const filter of [false, true]) out.push({ id: `ST-${method}-F${+filter}`, family: 'supertrader', method, filter });
  for (const profileId of ['quality-compounder', 'momentum-leader', 'quality-momentum', 'garp', 'future-leader', 'defensive-quality', 'value-momentum'])
    for (const n of [10, 15, 20]) for (const weeks of [13, 26]) for (const filter of [false, true])
      out.push({ id: `Q-${profileId}-N${n}-W${weeks}-F${+filter}`, family: 'quant', profileId, n, weeks, filter,
        standard: { minPositions: n, maxPositions: n, targetPositions: n, maxPositionWeight: Math.max(.08, 1 / n) } });
  return out;
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function sharpe(r) {
  const m = mean(r), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return sd > 0 ? m / sd * Math.sqrt(52) : null;
}
function metrics(levels, dates) {
  if (levels.length < 3 || levels.length !== dates.length || levels.some(x => !Number.isFinite(x) || x <= 0)) throw Error('INVALID_LEVELS');
  for (let i = 1; i < dates.length; i++) if (!(dates[i] > dates[i - 1]) || !Number.isFinite(Date.parse(dates[i]))) throw Error('INVALID_DATES');
  const years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / 86400000 / 365.25;
  if (!(years > 0)) throw Error('INVALID_WINDOW');
  const returns = levels.slice(1).map((v, i) => v / levels[i] - 1);
  let peak = levels[0], maxDrawdown = 0;
  for (const v of levels) { peak = Math.max(peak, v); maxDrawdown = Math.min(maxDrawdown, v / peak - 1); }
  const m = mean(returns);
  return { totalReturn: levels.at(-1) / levels[0] - 1, cagr: (levels.at(-1) / levels[0]) ** (1 / years) - 1,
    volatility: Math.sqrt(returns.reduce((s, x) => s + (x - m) ** 2, 0) / (returns.length - 1) * 52), sharpe: sharpe(returns), maxDrawdown };
}
function holm(ps) {
  if (!ps.length || ps.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw Error('INVALID_P_VALUES');
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i), out = [];
  let prev = 0;
  order.forEach(({ p, i }, k) => { prev = Math.max(prev, Math.min(1, p * (ps.length - k))); out[i] = prev; });
  return out;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function pairedTest(a, b, { count = 9999, block = 13, seed = 20261105 } = {}) {
  if (a.length !== b.length || a.length < 52 || [...a, ...b].some(x => !Number.isFinite(x) || x <= -1)) throw Error('INVALID_PAIRED_RETURNS');
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(block) || block < 1) throw Error('INVALID_BOOTSTRAP');
  const effect = (x, y) => mean(x.map((r, i) => Math.log1p(r) - Math.log1p(y[i])));
  const observed = effect(a, b), sa = sharpe(a), sb = sharpe(b), ds = sa === null || sb === null ? null : sa - sb;
  const random = rng(seed); let logCount = 0, sharpeCount = 0;
  for (let k = 0; k < count; k++) {
    const x = [], y = [];
    while (x.length < a.length) {
      const start = Math.floor(random() * a.length);
      for (let j = 0; j < block && x.length < a.length; j++) { const i = (start + j) % a.length; x.push(a[i]); y.push(b[i]); }
    }
    if (effect(x, y) - observed >= observed) logCount++;
    const sx = sharpe(x), sy = sharpe(y);
    // Undefined resample statistics count against significance.
    if (ds === null || sx === null || sy === null || sx - sy - ds >= ds) sharpeCount++;
  }
  return { logEffect: observed, sharpeEffect: ds, pLog: observed > 0 ? (1 + logCount) / (count + 1) : 1,
    pSharpe: ds !== null && ds > 0 ? (1 + sharpeCount) / (count + 1) : 1 };
}
function verdict(m, spy, pLog, pSharpe) {
  if (!m || !spy) return 'nicht bestimmbar (blockiert)';
  if (m.totalReturn > spy.totalReturn && Number.isFinite(pLog) && pLog >= 0 && pLog <= .05) return 'schlägt';
  if (m.sharpe !== null && spy.sharpe !== null && m.sharpe > spy.sharpe && Number.isFinite(pSharpe) && pSharpe >= 0 && pSharpe <= .05 && m.maxDrawdown >= spy.maxDrawdown) return 'nur risikobereinigt';
  return 'schlägt nicht';
}
module.exports = { PROTOCOL_SHA256, sha, variants, metrics, holm, pairedTest, verdict };
