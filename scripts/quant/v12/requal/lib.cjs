'use strict';
// V12 REQUAL - shared building blocks (pure functions + data access). Registration: docs/quant-recovery/v12/requal/registration-1.0.0.json.
// Reuses: research-index-population (opt-in), V10 frame (scripts/quant/v10/studies/common.cjs), research-validation (holm, block inference).
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const IP = require(ROOT + '/quant/engines/research-index-population.cjs');

const SPAN = ['2009-09-30', '2026-06-30'];
const SIGNAL_MAX_STALE_DAYS = 35;
const SCENARIOS = ['ZERO', 'LOWER'];
// 1.1.0 (correction after the independent V12 review, REQUAL MAJOR 2): two further scenarios for the bounded cases, used by P5a.
//   FATE  = exits by their documented fate: takeover (ACQUIRED_*, IDENTITY_BREAK) -> typical premium of documented cash/observed
//           takeovers (takeoverPremium().median); delisting/bankruptcy -> -100 %; index change (STILL_REPORTING_INDEX_EXIT,
//           TEMPORARY_ABSENCE) -> the population's period return (EW of the observed/estimated members); unknown fate
//           (NO_CIK, NO_SEC_EVIDENCE, CIK_NAME_MISMATCH, NOT_FATED) -> 0 % (point convention, weight reported); ambiguous CA -> midpoint.
//   UPPER = every bounded exit at max(premium p75, population period return); ambiguous CA at its upper bound.
// Reading for the survivorship term EW_WITH_H - EW_ALL: LOWER (exits -100 %) gives its UPPER bound, UPPER gives its lower end,
// ZERO is a point convention (no bound), FATE the evidence-based point estimate.
const SCENARIOS_P5A = ['ZERO', 'LOWER', 'FATE', 'UPPER'];
const FATE_CLASS = Object.freeze({ ACQUIRED_OR_MERGED: 'TAKEOVER', ACQUIRED_OR_MERGED_NO_25_15: 'TAKEOVER', IDENTITY_BREAK: 'TAKEOVER', DELISTED_OTHER: 'DELISTING', DELISTED_BANKRUPTCY: 'DELISTING',
  BANKRUPTCY_NO_25_15: 'DELISTING', STILL_REPORTING_INDEX_EXIT: 'INDEX_CHANGE', TEMPORARY_ABSENCE: 'INDEX_CHANGE', NO_SEC_EVIDENCE: 'UNKNOWN', NO_CIK: 'UNKNOWN', CIK_NAME_MISMATCH: 'UNKNOWN', NOT_FATED: 'UNKNOWN' });
const finite = v => typeof v === 'number' && Number.isFinite(v);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const DAY = 86400000;
const toT = d => Date.parse(d + 'T00:00:00Z');
const days = (a, b) => (toT(b) - toT(a)) / DAY;
const addDays = (d, n) => new Date(toT(d) + n * DAY).toISOString().slice(0, 10);
const years = (a, b) => days(a, b) / 365.25;
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const shaFile = f => sha256(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f)));
const r6 = x => finite(x) ? Math.round(x * 1e6) / 1e6 : x;

/** Index of the last element of sorted `dates` that is <= d (and >= d - maxGap days if given); -1 if none. */
function lastIdx(dates, d, maxGap = Infinity) {
  let lo = 0, hi = dates.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return -1;
  return days(dates[k], d) <= maxGap ? k : -1;
}

// ---------------------------------------------------------------- daily series (SPY, EFFR)
function dailySeries(file) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const pts = doc.points.filter(p => finite(p[1])).sort((a, b) => a[0] < b[0] ? -1 : 1);
  return { dates: pts.map(p => p[0]), values: pts.map(p => p[1]), sha256: shaFile(file) };
}
function makeSpy() {
  const s = dailySeries('quant/data/market/multi-asset/series/SPY.json');
  const at = d => { const k = lastIdx(s.dates, d, 7); return k < 0 ? null : s.values[k]; };
  return { ...s, at, ret: (a, b) => { const x = at(a), y = at(b); return x && y ? y / x - 1 : null; } };
}
/** Cash growth factor over (a, b]: prod over calendar days of (1 + EFFR/100/360), EFFR = last observation <= day. */
function makeCash() {
  const s = dailySeries('quant/data/market/multi-asset/series/US_EFFR.json');
  const growth = (a, b) => {
    let g = 1, k = lastIdx(s.dates, a);
    for (let t = toT(a) + DAY; t <= toT(b); t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10);
      while (k + 1 < s.dates.length && s.dates[k + 1] <= d) k++;
      if (k < 0) throw Error('EFFR_MISSING:' + d);
      g *= 1 + s.values[k] / 100 / 360;
    }
    return g;
  };
  return { ...s, growth, ret: (a, b) => growth(a, b) - 1 };
}

// ---------------------------------------------------------------- SPY total-return reference (N-30D distributions)
function spyDistributions() {
  const f = 'docs/quant-recovery/v11/decomposition/benchmark-reference-check.json';
  const fy = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).spyDividends.fiscalYears;
  return { byFy: new Map(Object.entries(fy).map(([k, v]) => [k, v.distributionsPerUnit])), sha256: shaFile(f) };
}
const quarterEnd = (y, q) => [y + '-03-31', y + '-06-30', y + '-09-30', y + '-12-31'][q];
/** Fiscal-year end (Sep 30) containing the quarter ending qEnd. */
function fiscalYearOf(qEnd) { const y = +qEnd.slice(0, 4), m = +qEnd.slice(5, 7); return (m >= 10 ? y + 1 : y) + '-09-30'; }
/** TR reference over [t0, t1] (both quarter ends). Returns {tr, price, divYield, carried}. */
function spyTotalReturn(spy, dist, t0, t1) {
  let g = 1, carried = false, dy = 0;
  let y = +t0.slice(0, 4), q = [3, 6, 9, 12].indexOf(+t0.slice(5, 7));
  if (q < 0) throw Error('TR_NOT_QUARTER_END:' + t0);
  let a = t0;
  for (;;) { q++; if (q > 3) { q = 0; y++; } const b = quarterEnd(y, q); if (b > t1) break;
    let fy = fiscalYearOf(b), D = dist.byFy.get(fy);
    if (!finite(D)) { const keys = [...dist.byFy.keys()].filter(k => k < fy).sort(); D = dist.byFy.get(keys.at(-1)); carried = true; }
    const pa = spy.at(a), pr = spy.at(b) / pa - 1, yq = D / 4 / pa;
    g *= 1 + pr + yq; dy += yq; a = b; if (b === t1) break; }
  return { tr: g - 1, price: spy.ret(t0, t1), divYield: dy, carried };
}

// ---------------------------------------------------------------- takeover premium (FATE/UPPER scenarios)
const quant = (a, p) => { const x = a.slice().sort((u, v) => u - v); if (!x.length) return null; const h = (x.length - 1) * p, lo = Math.floor(h); return x[lo] + (x[Math.min(lo + 1, x.length - 1)] - x[lo]) * (h - lo); };
/** Documented takeover returns from the last known valuation to the exit: (a) V10 lifecycle register CASH_MERGER (SEC-sourced cash per
 *  share) against our weekly close at the last calendar quarter end before the last trading day; (b) population exits of PIT_SP500 and
 *  PIT_NDX (span) with fate ACQUIRED_* and an estimated/observed return (EST_CASH, EST_SERIES_END, OBS_SERIES). */
function takeoverPremium(pop) {
  const LC = require(ROOT + '/quant/engines/research-listing-lifecycle.cjs').records, cases = [];
  const qEndBefore = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7), q = Math.floor((m - 1) / 3) * 3; return q === 0 ? (y - 1) + '-12-31' : y + '-' + String(q).padStart(2, '0') + '-' + (q === 3 ? '31' : '30'); };
  for (const r of LC) {
    if (!r.terminal || r.terminal.kind !== 'CASH_MERGER' || !(r.terminal.cashPerShare > 0)) continue;
    const f = path.join(ROOT, 'quant/data/market/discover-series-long', r.securityId + '.json'); if (!fs.existsSync(f)) continue;
    const pts = JSON.parse(fs.readFileSync(f, 'utf8')).points, q0 = qEndBefore(r.lastTradeDate), k = lastIdx(pts.map(p => p[0]), q0, 7);
    if (k < 0) continue;
    cases.push({ source: 'V10_LIFECYCLE_CASH_MERGER', id: r.securityId, t0: q0, r: r.terminal.cashPerShare / pts[k][1] - 1 });
  }
  for (const id of ['PIT_SP500', 'PIT_NDX']) for (const p of pop.periods(id)) {
    if (p.t0 < SPAN[0] || p.t1 > SPAN[1]) continue;
    for (const m of pop.members(id, p.t0).members) if (/^ACQUIRED/.test(m.fate || '') && ['EST_CASH', 'EST_SERIES_END', 'OBS_SERIES'].includes(m.status)) cases.push({ source: id + ':' + m.status, id: m.securityId || m.name, t0: p.t0, r: m.observedOrEstimatedReturn });
  }
  // the same takeover seen in two funds (e.g. ANSYS in SPY and QQQ) counts once
  const seen = new Set(); cases.splice(0, cases.length, ...cases.filter(c => { const k = c.id + '|' + c.t0; if (seen.has(k)) return false; seen.add(k); return true; }));
  const rs = cases.map(c => c.r);
  return { n: cases.length, median: quant(rs, 0.5), p25: quant(rs, 0.25), p75: quant(rs, 0.75), cases: cases.map(c => ({ ...c, r: r6(c.r) })) };
}

// ---------------------------------------------------------------- index population (scenarios)
function makePopulation() {
  const z = IP.createIndexPopulation({ optIn: true, allowUnqualified: true, boundedAs: 'ZERO' });
  const l = IP.createIndexPopulation({ optIn: true, allowUnqualified: true, boundedAs: 'LOWER' });
  const premium = takeoverPremium(z);
  const periods = z.periods('PIT_SP500').filter(p => p.t0 >= SPAN[0] && p.t1 <= SPAN[1]);
  const cache = new Map();
  function members(t0) {
    if (cache.has(t0)) return cache.get(t0);
    const a = z.members('PIT_SP500', t0), b = l.members('PIT_SP500', t0);
    const covered = a.members.filter(m => m.group !== 'bounded'), popRet = mean(covered.map(m => m.observedOrEstimatedReturn));
    const out = a.members.map((m, i) => {
      const mb = b.members[i];
      if (mb.chainId !== m.chainId) throw Error('SCENARIO_MEMBER_ORDER');
      let zero = m.return, lower = mb.return, fate = zero, upper = zero, fateClass = null;
      if (m.status === 'BOUNDED_AMBIGUOUS_CA') { zero = (m.lower + m.upper) / 2; fate = zero; upper = m.upper; fateClass = 'AMBIGUOUS_CA'; }
      else if (m.status === 'BOUNDED_EXIT_SERIES_DELISTED') { fateClass = FATE_CLASS[m.fate] || 'UNKNOWN'; fate = fateClass === 'DELISTING' ? -1 : m.return; upper = m.upper; }
      else if (m.group === 'bounded') {
        fateClass = FATE_CLASS[m.fate] || 'UNKNOWN';
        fate = fateClass === 'TAKEOVER' ? premium.median : fateClass === 'DELISTING' ? -1 : fateClass === 'INDEX_CHANGE' ? popRet : 0;
        upper = Math.max(premium.p75, popRet);
      }
      if (![zero, lower, fate, upper].every(finite)) throw Error('SCENARIO_RETURN_MISSING:' + t0 + ':' + m.chainId);
      return { chainId: m.chainId, name: m.name, cik: m.cik, securityId: m.securityId, weight: m.weight, status: m.status, group: m.group, fate: m.fate, fateClass, ret: { ZERO: zero, LOWER: lower, FATE: fate, UPPER: upper } };
    });
    const r = { t0, t1: a.t1, qualification: a.qualification, members: out };
    cache.set(t0, r); return r;
  }
  return { periods, members, ruleVersion: z.ruleVersion, dataSha256: z.dataSha256, premium };
}

// ---------------------------------------------------------------- weekly frame helpers
/** Series return between the last bar <= t0 and the last bar <= t1 (each within 7 days, registration 1.0.1), with lifecycle fallback. */
function seriesReturn(p, t0, t1) {
  const k0 = lastIdx(p.dates, t0, 7); if (k0 < 0 || p.dates[k0] < p.listingStart) return null;
  const c0 = p.closes[k0], k1 = lastIdx(p.dates, t1, 7);
  if (k1 >= 0 && k1 >= k0) return { r: p.closes[k1] / c0 - 1, kind: 'SERIES', d0: p.dates[k0], d1: p.dates[k1] };
  const last = p.closes.length - 1;
  if (p.dates[last] >= t1) return null; // gap inside the series around t1 (not an ended series)
  const t = p.lifecycle && p.lifecycle.terminal;
  if (t && t.kind === 'CASH_MERGER' && finite(t.cashPerShare) && t.cashPerShare > 0) return { r: t.cashPerShare / c0 - 1, kind: 'TERMINAL_CASH', d0: p.dates[k0], d1: p.dates[last] };
  return { r: p.closes[last] / c0 - 1, kind: 'LAST_CLOSE', d0: p.dates[k0], d1: p.dates[last] };
}
function hasBarAt(p, t0) { const k = lastIdx(p.dates, t0, 7); return k >= 0 && p.dates[k] >= p.listingStart; }

// ---------------------------------------------------------------- regimes (registered R1/R2)
function regimeR1(spy, periods) {
  const out = []; let prev = null;
  for (const p of periods) {
    const k0 = lastIdx(spy.dates, p.t0, 7), k1 = lastIdx(spy.dates, p.t1, 7);
    const R = spy.values[k1] / spy.values[k0] - 1;
    let peak = spy.values[k0], dd = 0;
    for (let k = k0 + 1; k <= k1; k++) { peak = Math.max(peak, spy.values[k]); dd = Math.min(dd, spy.values[k] / peak - 1); }
    let hi = 0; for (let k = Math.max(0, k0 - 251); k <= k0; k++) hi = Math.max(hi, spy.values[k]);
    const dd52 = spy.values[k0] / hi - 1, months = IP.monthsBetween(p.t0, p.t1);
    let label;
    if (dd <= -0.10 || R <= -0.05) label = 'CRASH_BEAR';
    else if ((prev === 'CRASH_BEAR' || dd52 <= -0.10) && R > 0) label = 'RECOVERY';
    else if (Math.abs(R) <= 0.025 * Math.sqrt(months / 3)) label = 'SIDEWAYS';
    else label = 'BULL';
    out.push({ t0: p.t0, t1: p.t1, R: r6(R), DDin: r6(dd), DD52: r6(dd52), label }); prev = label;
  }
  return out;
}
function regimeR2(reg, periods) {
  const cal = reg.regimes.R2_OWNER_CALENDAR;
  return periods.map(p => {
    const mid = new Date((toT(p.t0) + toT(p.t1)) / 2).toISOString().slice(0, 10);
    let label = 'OTHER';
    for (const k of ['CRASH_BEAR', 'RECOVERY', 'SIDEWAYS']) if (cal[k].some(([a, b]) => mid >= a && mid <= b)) { label = k; break; }
    return { t0: p.t0, t1: p.t1, mid, label };
  });
}

// ---------------------------------------------------------------- inference
function bartlettLrv(x, bw) { const n = x.length, m = mean(x); const d = x.map(v => v - m); let s = d.reduce((a, v) => a + v * v, 0) / n;
  for (let l = 1; l <= bw && l < n; l++) { let c = 0; for (let t = l; t < n; t++) c += d[t] * d[t - l]; s += 2 * (1 - l / (bw + 1)) * c / n; } return s; }
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
function neweyWest(x, bw = 2) {
  const n = x.length; if (n < 8) return { n, mean: mean(x), se: null, t: null, p: null, bandwidth: bw };
  const lrv = bartlettLrv(x, bw), se = lrv > 0 ? Math.sqrt(lrv / n) : null, m = mean(x), t = se ? m / se : null;
  return { n, mean: m, se, t, p: t === null ? null : erfc(Math.abs(t) / Math.SQRT2), bandwidth: bw };
}
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Circular block bootstrap of the mean, centred (H0: mean 0); two-sided p and percentile CI. */
function blockBootstrap(x, { block = 4, replicates = 9999, seed = 20261029 } = {}) {
  const n = x.length; if (n < 2 * block) return { n, mean: mean(x), p: null, ci: null, blocks: n / block, state: 'TOO_FEW_PERIODS' };
  const rnd = mulberry32(seed), m = mean(x), nb = Math.ceil(n / block), stats = new Float64Array(replicates);
  for (let r = 0; r < replicates; r++) { let s = 0, c = 0; for (let b = 0; b < nb; b++) { const st = Math.floor(rnd() * n); for (let j = 0; j < block && c < n; j++, c++) s += x[(st + j) % n]; } stats[r] = s / n; }
  let ext = 0; for (let r = 0; r < replicates; r++) if (Math.abs(stats[r] - m) >= Math.abs(m)) ext++;
  const sorted = Array.from(stats).sort((a, b) => a - b);
  return { n, mean: m, p: (ext + 1) / (replicates + 1), ci: [sorted[Math.floor(0.025 * replicates)], sorted[Math.floor(0.975 * replicates)]], blocks: n / block, block, replicates, seed, state: 'NOT_ROBUST_FEW_BLOCKS' };
}
function holm(ps) { const idx = ps.map((p, i) => [p, i]).filter(x => finite(x[0])).sort((a, b) => a[0] - b[0]); const out = ps.map(() => null); let run = 0;
  idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (idx.length - k) * p)); out[i] = run; }); return out; }

// ---------------------------------------------------------------- performance
/** rs: [{t0, t1, r, cash?, bench?}] chain-linked */
function perf(rows, { cashKey = 'cash' } = {}) {
  if (!rows.length) return null;
  const Y = years(rows[0].t0, rows.at(-1).t1), n = rows.length;
  let eq = 1, peak = 1, mdd = 0; const curve = [];
  for (const x of rows) { eq *= 1 + x.r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); curve.push(r6(eq)); }
  const lr = rows.map(x => Math.log(1 + x.r) / Math.sqrt(years(x.t0, x.t1)));
  const vol = sd(lr);
  const ex = rows.filter(x => finite(x[cashKey])).map(x => (Math.log(1 + x.r) - Math.log(1 + x[cashKey])));
  const exScaled = rows.filter(x => finite(x[cashKey])).map(x => (Math.log(1 + x.r) - Math.log(1 + x[cashKey])) / Math.sqrt(years(x.t0, x.t1)));
  const sharpe = ex.length === n && sd(exScaled) > 0 ? (ex.reduce((s, v) => s + v, 0) / Y) / sd(exScaled) : null;
  return { periods: n, from: rows[0].t0, to: rows.at(-1).t1, years: r6(Y), total: r6(eq - 1), cagr: r6(eq ** (1 / Y) - 1), volAnn: r6(vol), sharpe: r6(sharpe), maxDD: r6(mdd), curve };
}
/** Excess statistics of a vs b (aligned rows with r). */
function excessStats(a, b, opts = {}) {
  const Y = years(a[0].t0, a.at(-1).t1), n = a.length;
  const x = a.map((r, i) => { if (r.t0 !== b[i].t0) throw Error('EXCESS_MISALIGNED'); return Math.log(1 + r.r) - Math.log(1 + b[i].r); });
  const z = x.map(v => v * n / Y);
  const pa = perf(a), pb = perf(b);
  return { cagrDiff: r6(pa.cagr - pb.cagr), meanPeriodDiffPp: r6(mean(a.map((r, i) => r.r - b[i].r)) * 100), annLogExcess: r6(mean(z)), nw: neweyWest(z, 2), bootstrap: opts.bootstrap === false ? null : blockBootstrap(z, opts.boot) };
}

function writeJson(file, x, gz = false) { fs.mkdirSync(path.dirname(file), { recursive: true }); const s = JSON.stringify(x, null, gz ? 0 : 1) + '\n'; fs.writeFileSync(file, gz ? zlib.gzipSync(s, { level: 9 }) : s); return sha256(gz ? fs.readFileSync(file) : s); }
function args(argv, spec) { const o = { ...spec }; for (let i = 0; i < argv.length; i++) { const k = argv[i].replace(/^--/, ''); if (!(k in spec)) throw Error('UNKNOWN_ARGUMENT:' + argv[i]); o[k] = argv[++i]; } return o; }

module.exports = { ROOT, IP, SPAN, SIGNAL_MAX_STALE_DAYS, SCENARIOS, SCENARIOS_P5A, FATE_CLASS, takeoverPremium, quant, finite, mean, sd, days, addDays, years, sha256, shaFile, r6, lastIdx, dailySeries, makeSpy, makeCash,
  spyDistributions, fiscalYearOf, spyTotalReturn, makePopulation, seriesReturn, hasBarAt, regimeR1, regimeR2, bartlettLrv, neweyWest, mulberry32, blockBootstrap, holm, perf, excessStats, writeJson, args };
