// E9 Weg 6: lueckenbewusster Forschungs-Backtest Deutschland (Pilot).
// Regeln: docs/research/europe-gap-aware/PROTOKOLL.md (SHA-256 unten gepinnt).
// Forschung, nicht zertifiziert. Liest nur committete Daten, ruft keinen
// Anbieter auf, schreibt nur nach --out. Oeffentlich nur Zaehlungen; Kennzahlen
// ausschliesslich versiegelt (scripts/supertrader/validation/results-public-key.pem).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { simulate } from '../../supertrader/engine/simulator.mjs';
import { computeIndicators } from '../../supertrader/engine/indicators.mjs';
import { runPortfolio, PORTFOLIO_DEFAULTS } from '../../supertrader/engine/backtest.mjs';
import { DEFAULT_EXECUTION } from '../../supertrader/engine/execution.mjs';
import donchian from '../../supertrader/engine/strategies/donchian.mjs';

export const VERSION = 'vu-europe-gap-aware-pilot-1';
export const PROTOCOL_PATH = 'docs/research/europe-gap-aware/PROTOKOLL.md';
export const PROTOCOL_SHA256 = 'f4651e39da24138f1cdd3abda517d30eb11712c8ed102506d33c56a3a0dc2e04';
export const RULES = Object.freeze({ warmSessions: 200, coverageWindow: 252, minCoverage: 0.98, momentumSessions: 253,
  from: '2011-01-01', to: '2025-12-31', expectedUniverse: 149, jumpRatio: 1.6 });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const INV = 'docs/reports/europe-continuity-449-20261012/europe_449_gap_inventory.json';
const CAL = 'docs/reports/europe-continuity-449-20261012/europe_449_calendar_audit.json';
const IMPACT = 'docs/reports/europe-marketstack-support-report-20261103/europe_gap_impact_report.json';
const sha = b => createHash('sha256').update(b).digest('hex');
const check = (ok, code) => { if (!ok) throw new Error(code); };

export function dateRange(a, b) {
  const out = [];
  for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(b + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Expected sessions and observed closes (null = gap) for one title. */
export function buildSeries(dates, closeByDate) {
  return { dates, close: dates.map(d => closeByDate.has(d) ? closeByDate.get(d) : null) };
}

/** run[i] = number of consecutive observed sessions ending at i (0 at a gap). */
export function runLengths(close) {
  const run = new Array(close.length).fill(0);
  for (let i = 0; i < close.length; i++) run[i] = close[i] === null ? 0 : (i > 0 ? run[i - 1] : 0) + 1;
  return run;
}

/** Protocol admission at i, from sessions up to i only. */
export function admittedAt(close, run, i, r = RULES) {
  if (close[i] === null || run[i] < r.warmSessions + 1) return false;
  const lo = i - r.coverageWindow + 1;
  if (lo < 0) return false;
  let obs = 0; for (let k = lo; k <= i; k++) if (close[k] !== null) obs++;
  return obs / r.coverageWindow >= r.minCoverage;
}

/** Maximal contiguous observed segments [start, end]. */
export function segments(close) {
  const out = []; let s = -1;
  for (let i = 0; i <= close.length; i++) {
    const ok = i < close.length && close[i] !== null;
    if (ok && s < 0) s = i;
    if (!ok && s >= 0) { out.push([s, i - 1]); s = -1; }
  }
  return out;
}

/** T1: Donchian 1.1.0 unchanged, once per contiguous segment (no state across a gap). */
export function runTurtle(symbol, series, r = RULES, strategy = donchian) {
  const { dates, close } = series, run = runLengths(close);
  const out = { closed: [], censored: [], notExecuted: 0, segmentsRun: 0, admittedDays: 0 };
  for (const [s, e] of segments(close)) {
    let from = -1;
    for (let i = s; i <= e; i++) if (dates[i] >= r.from && dates[i] <= r.to && admittedAt(close, run, i, r)) { from = i; break; }
    if (from < 0) continue;
    let to = e; while (to >= from && dates[to] > r.to) to--;
    if (to < from) continue;
    // Within a segment admission is monotone (older gaps only leave the window).
    for (let i = from; i <= to; i++) out.admittedDays++;
    const c = close.slice(s, e + 1);
    const bars = { date: dates.slice(s, e + 1), open: c.slice(), high: c.slice(), low: c.slice(), close: c.slice(), volume: c.map(() => null) };
    const ind = computeIndicators(bars);
    // DON-LIQ-VU: Dollarvolumen und ADR ohne Volumen/Hoch/Tief nicht auswertbar (Protokoll).
    ind.dollarVol20 = c.map(() => Number.MAX_VALUE); ind.adr20 = c.map(() => Number.MAX_VALUE);
    const res = simulate(strategy, { symbol, bars, ind }, { from: from - s, to: to - s });
    out.segmentsRun++;
    for (const sig of res.finished) if (sig.entry && sig.exits.length && sig.remaining <= 1e-9) out.closed.push({ symbol, signal: sig });
    const open = res.state.signal;
    if (open && open.entry) {
      const reason = to < e ? 'STUDY_END' : e === close.length - 1 ? 'SERIES_END' : 'GAP';
      const last = c[to - s];
      out.censored.push({ symbol, reason, entryDate: open.entry.date, lastDate: bars.date[to - s], exitOrderPending: !!open.order,
        partialExits: open.exits.length, returnToLastObservation: last / open.entry.price - 1 });
    } else if (open && open.order && open.order.kind === 'BUY') out.notExecuted++;
  }
  return out;
}

/** Q1 and EW benchmark episodes for one rebalance period. */
export function episode(series, run, i, j, r = RULES) {
  // i: rebalance index, j: next rebalance index; entry at i+1, exit at j+1.
  const { close } = series, a = i + 1, b = j + 1;
  if (a >= close.length || close[a] === null) return { kind: 'NOT_EXECUTED' };
  for (let k = a + 1; k <= Math.min(b, close.length - 1); k++) {
    if (close[k] === null) return { kind: 'CENSORED_GAP', ret: close[k - 1] / close[a] - 1 };
  }
  if (b >= close.length) return { kind: 'CENSORED_STUDY_END', ret: close[close.length - 1] / close[a] - 1 };
  return { kind: 'CLOSED', ret: close[b] / close[a] - 1 };
}

export function momentum(close, run, i, r = RULES) {
  if (run[i] < r.momentumSessions) return null;
  return close[i - 21] / close[i - 252] - 1;
}

function loadInputs(root) {
  const inv = JSON.parse(readFileSync(join(root, INV), 'utf8'));
  const cal = JSON.parse(readFileSync(join(root, CAL), 'utf8')).calendars;
  const impact = JSON.parse(readFileSync(join(root, IMPACT), 'utf8'));
  const status = new Map(impact.rows.map(x => [x.securityId, x.catalogIdentity]));
  const closed = new Set(cal.XETR.closures.map(x => x.date));
  return { inv, closed, status };
}

/** Candidate universe exactly as E9 measured it (98 %, XETR, VERIFIED). */
export function candidates(inv, closed, status, r = RULES) {
  const out = [];
  for (const row of inv.rows) {
    if (row.mic !== 'XETR' || status.get(row.securityId) !== 'VERIFIED') continue;
    const missing = new Set(row.allGaps.flatMap(g => g.missingDates));
    let ok = false;
    for (let y = 2011; y <= 2025 && !ok; y++) {
      const days = dateRange(`${y}-01-01`, `${y}-12-31`).filter(d => !closed.has(d));
      if (!(row.displayedStart <= days[0] && row.displayedEnd >= days.at(-1))) continue;
      const avail = days.filter(d => !missing.has(d)).length;
      const brk = row.priceOrIdentityBreaks.some(b => b.from <= days.at(-1) && b.to >= days[0]);
      if (avail >= 200 && avail / days.length >= r.minCoverage && !brk) ok = true;
    }
    if (ok) out.push(row);
  }
  return out;
}

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function stats(rets) {
  if (!rets.length) return { n: 0 };
  const s = [...rets].sort((a, b) => a - b);
  return { n: rets.length, mean: mean(rets), median: s[Math.floor(s.length / 2)], hitRate: rets.filter(x => x > 0).length / rets.length, min: s[0], max: s.at(-1) };
}
function chain(periods) {
  let v = 1; const byYear = {};
  for (const p of periods) { if (p.ret === null) continue; v *= 1 + p.ret; const y = p.date.slice(0, 4); byYear[y] = (byYear[y] ?? 1) * (1 + p.ret); }
  const years = (Date.parse(periods.at(-1).date) - Date.parse(periods[0].date)) / (365.25 * 864e5);
  return { totalReturn: v - 1, cagr: years > 0 ? v ** (1 / years) - 1 : null, byYear: Object.fromEntries(Object.entries(byYear).map(([y, x]) => [y, x - 1])) };
}

export async function runPilot({ out, root = ROOT, seal = true } = {}) {
  check(out, 'USAGE: --out <dir>');
  const protocol = readFileSync(join(root, PROTOCOL_PATH));
  check(sha(protocol) === PROTOCOL_SHA256, 'PROTOCOL_HASH_MISMATCH');
  let protocolCommit = null;
  try { protocolCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', PROTOCOL_PATH], { cwd: root, encoding: 'utf8' }).trim() || null; } catch { /* outside git */ }
  const { inv, closed, status } = loadInputs(root);
  const universe = candidates(inv, closed, status);
  check(universe.length === RULES.expectedUniverse, 'UNIVERSE_SIZE_' + universe.length);
  const titles = [];
  for (const row of universe) {
    const p = join(root, 'discover/data/europe/series-long', row.securityId + '.json');
    const pts = new Map(JSON.parse(readFileSync(p, 'utf8')).points);
    const dates = dateRange(row.displayedStart, row.displayedEnd).filter(d => !closed.has(d));
    const series = buildSeries(dates, pts);
    const observed = series.close.filter(x => x !== null).length;
    titles.push({ id: row.securityId, symbol: row.ticker, series, run: runLengths(series.close), observedMatchesInventory: observed === row.displayedBarCount, seriesSha256: sha(readFileSync(p)) });
  }
  // ---- T1 ----
  const t1 = { closed: [], censored: [], notExecuted: 0, segmentsRun: 0, admittedDays: 0 };
  for (const t of titles) {
    const r = runTurtle(t.symbol, t.series);
    t1.closed.push(...r.closed); t1.censored.push(...r.censored); t1.notExecuted += r.notExecuted; t1.segmentsRun += r.segmentsRun; t1.admittedDays += r.admittedDays;
  }
  const calendar = dateRange(RULES.from, RULES.to).filter(d => !closed.has(d));
  const priceMap = new Map(titles.map(t => [t.symbol, new Map(t.series.dates.map((d, i) => [d, t.series.close[i]]))]));
  const priceOf = (sym, d) => priceMap.get(sym)?.get(d) ?? null;
  const pf = runPortfolio(t1.closed, priceOf, calendar, PORTFOLIO_DEFAULTS);
  const tradeRets = t1.closed.map(x => x.signal.result.returnPct);
  const jumpTrades = t1.closed.filter(x => {
    const s = priceMap.get(x.symbol), d0 = x.signal.entry.date, d1 = x.signal.exits.at(-1).date;
    const ds = [...s.keys()].filter(d => d >= d0 && d <= d1 && s.get(d) !== null);
    return ds.some((d, k) => k > 0 && (s.get(d) / s.get(ds[k - 1]) > RULES.jumpRatio || s.get(ds[k - 1]) / s.get(d) > RULES.jumpRatio));
  }).length;
  // ---- Q1 + EW ----
  const rebal = [];
  for (const d of calendar) if (!rebal.length || rebal.at(-1).slice(0, 7) !== d.slice(0, 7)) rebal.push(d);
  const idx = t => new Map(t.series.dates.map((d, i) => [d, i]));
  const index = new Map(titles.map(t => [t.id, idx(t)]));
  const q1 = { periods: [], episodes: { CLOSED: 0, CENSORED_GAP: 0, CENSORED_STUDY_END: 0, NOT_EXECUTED: 0 }, censoredRets: [] };
  const ew = { periods: [], episodes: { CLOSED: 0, CENSORED_GAP: 0, CENSORED_STUDY_END: 0, NOT_EXECUTED: 0 }, censoredRets: [] };
  for (let k = 0; k + 1 < rebal.length; k++) {
    const d = rebal[k], dn = rebal[k + 1];
    const elig = [];
    for (const t of titles) {
      const ix = index.get(t.id), i = ix.get(d), j = ix.get(dn);
      if (i === undefined || j === undefined) continue;
      if (!admittedAt(t.series.close, t.run, i)) continue;
      const m = momentum(t.series.close, t.run, i);
      if (m === null) continue;
      elig.push({ t, i, j, m });
    }
    const top = [...elig].sort((a, b) => b.m - a.m || a.t.id.localeCompare(b.t.id)).slice(0, Math.ceil(elig.length / 5));
    const cost = 2 * (DEFAULT_EXECUTION.slippageBps + DEFAULT_EXECUTION.commissionBps) / 10000;
    for (const [book, set] of [[q1, top], [ew, elig]]) {
      const rets = [];
      for (const e of set) {
        const ep = episode(e.t.series, e.t.run, e.i, e.j);
        book.episodes[ep.kind]++;
        if (ep.kind === 'CLOSED') rets.push(ep.ret - cost); else if (ep.ret !== undefined) book.censoredRets.push(ep.ret);
      }
      book.periods.push({ date: d, n: set.length, closed: rets.length, ret: rets.length ? mean(rets) : null });
    }
  }
  // ---- outputs ----
  const count = (xs, f) => xs.reduce((a, x) => (a[f(x)] = (a[f(x)] || 0) + 1, a), {});
  const pub = {
    schema: VERSION, label: 'Forschung, nicht zertifiziert', protocol: { path: PROTOCOL_PATH, sha256: PROTOCOL_SHA256, commit: protocolCommit },
    inputs: [INV, CAL, IMPACT].map(f => ({ path: f, sha256: sha(readFileSync(join(root, f))) })),
    seriesSha256Combined: sha(titles.map(t => t.id + ':' + t.seriesSha256).join('\n')),
    universe: { candidates: titles.length, observedCountsMatchInventory: titles.filter(t => t.observedMatchesInventory).length, selectionBias: 'Kandidatenkreis aus heutigem Bestand, heutiger Identitaet und Jahresabdeckung' },
    window: { from: RULES.from, to: RULES.to },
    t1: { strategy: donchian.id + '@' + donchian.version, segmentsRun: t1.segmentsRun, admittedTitleDays: t1.admittedDays,
      closedTrades: t1.closed.length, portfolioTakenTrades: pf.taken.length, portfolioSkipped: pf.skipped.length,
      censoredEpisodes: t1.censored.length, censoredByReason: count(t1.censored, x => x.reason), censoredWithPendingExitOrder: t1.censored.filter(x => x.exitOrderPending).length,
      entryOrdersNotExecutedAtGap: t1.notExecuted, closedTradesSpanningJumpOver60pct: jumpTrades },
    q1: { rule: 'momentum12m1m top quintile, monthly', periods: q1.periods.length, periodsWithClosedEpisodes: q1.periods.filter(p => p.ret !== null).length, episodes: q1.episodes },
    benchmark: { kind: 'EQUAL_WEIGHT_UNIVERSE', reason: 'kein DAX-Index oder DAX-ETF in vorhandenen Daten', periods: ew.periods.length, episodes: ew.episodes },
    providerRequests: 0, pricesInterpolated: 0, pricesPublished: 0, productionDataChanged: false,
  };
  const sealed = { schema: VERSION + '-sealed', protocolSha256: PROTOCOL_SHA256, protocolCommit, at: new Date().toISOString(),
    t1: { tradeStats: stats(tradeRets), byYearTrades: count(t1.closed, x => x.signal.exits.at(-1).date.slice(0, 4)),
      portfolio: (() => { const eq = pf.equity; const v = eq.at(-1).equity / eq[0].equity; const yrs = (Date.parse(eq.at(-1).date) - Date.parse(eq[0].date)) / (365.25 * 864e5);
        let peak = 0, mdd = 0; for (const x of eq) { peak = Math.max(peak, x.equity); mdd = Math.min(mdd, x.equity / peak - 1); }
        const byYear = {}; let prev = eq[0].equity; for (const x of eq) { const y = x.date.slice(0, 4); byYear[y] = x.equity; } const yrsK = Object.keys(byYear);
        const yearly = Object.fromEntries(yrsK.map(y => { const r = byYear[y] / prev - 1; prev = byYear[y]; return [y, r]; }));
        return { totalReturn: v - 1, cagr: v ** (1 / yrs) - 1, maxDrawdown: mdd, meanExposure: mean(eq.map(x => x.exposure)), yearly }; })(),
      censoredReturnToLastObservation: stats(t1.censored.map(x => x.returnToLastObservation)) },
    q1: { ...chain(q1.periods), episodeCensoredRetStats: stats(q1.censoredRets) },
    benchmarkEqualWeight: { ...chain(ew.periods), episodeCensoredRetStats: stats(ew.censoredRets) },
    note: 'Forschung, nicht zertifiziert. Nicht veroeffentlichen; keine Aussage ueber Rendite oder Vorteil.' };
  const outDir = resolve(out);
  mkdirSync(outDir, { recursive: true });
  const pubText = JSON.stringify(pub, null, 1) + '\n';
  check(!/"(cagr|totalReturn|sharpe|maxDrawdown|returns|equity|mean|median|ret)"/.test(pubText), 'PUBLIC_OUTPUT_HAS_METRICS');
  writeFileSync(join(outDir, 'pilot-public.json'), pubText);
  if (seal) {
    const L = await import('../../supertrader/validation/lib.mjs');
    const pem = readFileSync(join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
    writeFileSync(join(outDir, 'pilot.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  }
  return { pub, sealed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  check(i > 0 && process.argv[i + 1], 'USAGE: --out <dir>');
  const { pub } = await runPilot({ out: process.argv[i + 1] });
  console.log(JSON.stringify({ universe: pub.universe, t1: pub.t1, q1: pub.q1, benchmark: pub.benchmark }, null, 1));
}
