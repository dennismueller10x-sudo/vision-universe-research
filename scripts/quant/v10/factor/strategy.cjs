#!/usr/bin/env node
'use strict';
// V10 FACTOR (RECONSTRUCTION): registered long-only Top-50 strategy on the reconstructed composite,
// through the existing ledger quant/engines/research-portfolio.cjs (HISTORICAL_PRICE_SIMULATION, PRICE_RETURN).
// Usage: node strategy.cjs <private_dir> [--loader-options '<json>'] [--out <evidence_dir>]
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('./common.cjs'), X = require('./factors.cjs');
const P = require(F.ROOT + '/quant/engines/research-portfolio.cjs');
const V = require(F.ROOT + '/quant/engines/research-validation.cjs');
const Study = require('./study.cjs');
const C = F.C;

const TOP_N = 50, CANDIDATE_POOL = 100, VALUATION_END = '2026-01-31', INITIAL = 100000;
const COSTS = { BASE: { feeBps: 2.5, slippageBps: 12.5 }, LOW: { feeBps: 0, slippageBps: 5 }, HIGH: { feeBps: 5, slippageBps: 25 } };
const REG_PATH = path.join(F.ROOT, 'docs/quant-recovery/v10/factor/registration-1.0.0.json');
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const closeAt = d => d + 'T21:00:00.000Z';

/** Ranked selection per rank date: composite descending, listingId ascending on ties. */
function selections(panel) {
  return panel.dates.map(s => {
    const ranked = s.rows.filter(r => X.finite(r.scores.composite)).sort((a, b) => b.scores.composite - a.scores.composite || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { date: s.date, scored: ranked.length, population: s.rows.length, top: ranked.slice(0, TOP_N).map(r => r.id), pool: ranked.slice(0, CANDIDATE_POOL).map(r => r.id), all: ranked.map(r => r.id) };
  });
}

function buildInput(frame, spy, sel, costs) {
  const sessions = frame.calendar.filter(d => d >= sel[0].date && d <= VALUATION_END).map(d => ({ date: d, closeAt: closeAt(d) }));
  const idx = new Map(sessions.map((s, k) => [s.date, k]));
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const spyMap = new Map(spy.bars.map(b => [b.date, b.close]));
  const needed = new Map(); // listingId -> Set(dates) where an exact price is required (held / traded)
  const targets = [], memberships = [];
  sel.forEach((s, k) => {
    const exec = sessions[idx.get(s.date) + 1]; if (!exec) return;
    const next = k + 1 < sel.length ? sessions[idx.get(sel[k + 1].date) + 1] : sessions.at(-1);
    const hash = C.hash({ date: s.date, pool: s.pool });
    memberships.push({ effectiveAt: closeAt(s.date), availableAt: closeAt(s.date), sourceHash: hash, members: s.pool });
    const weights = Object.fromEntries(s.top.map(id => [id, 1 / TOP_N]));
    targets.push({ decisionDate: s.date, executionDate: exec.date, availableAt: closeAt(s.date), membershipHash: hash, weights });
    for (const id of s.top) {
      if (!needed.has(id)) needed.set(id, new Set());
      for (let j = idx.get(exec.date); j <= idx.get(next.date); j++) needed.get(id).add(sessions[j].date);
    }
    // Positions sold at this execution need its price too (previous holdings).
    if (k > 0) for (const id of sel[k - 1].top) { if (!needed.has(id)) needed.set(id, new Set()); needed.get(id).add(exec.date); }
  });
  const members = new Set(memberships.flatMap(m => m.members));
  const listings = [...members].sort().map(id => {
    const l = byId.get(id), pts = new Map(l.points), want = needed.get(id) || new Set();
    const bars = [...want].sort().map(d => { if (!pts.has(d)) throw Error('PRICE_MISSING_FOR_HELD_LISTING:' + id + '@' + d); return { date: d, close: pts.get(d), availableAt: closeAt(d) }; });
    return { listingId: id, issuerId: l.cik || id, firstTradeDate: l.points[0][0], lastTradeDate: null, mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', bars, events: [] };
  });
  const benchmark = { currency: 'USD', returnBasis: 'PRICE_RETURN', costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', sourceHash: spy.provenance.sourceBytesHash,
    levels: sessions.map(s => { if (!spyMap.has(s.date)) throw Error('SPY_MISSING:' + s.date); return { date: s.date, level: spyMap.get(s.date) }; }) };
  return { sessions, initialCapital: INITIAL, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: C.hash(frame.listings.map(l => [l.securityId, l.sourceBytesHash])), priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', ...costs }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45, listings, memberships, factorSnapshots: [], targets, benchmark };
}

function metrics(result, sel) {
  const eq = result.equity, values = eq.map(e => e.value), bench = eq.map(e => e.benchmark);
  const rets = values.slice(1).map((v, k) => v / values[k] - 1), brets = bench.slice(1).map((v, k) => v / bench[k] - 1);
  const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const years = (Date.parse(eq.at(-1).date) - Date.parse(eq[0].date)) / (365.25 * 86400000);
  const ann = (a, end, start) => (end / start) ** (1 / years) - 1;
  const dd = a => { let p = a[0], m = 0, trough = null, peakDate = null, cur = eq[0].date; a.forEach((v, k) => { if (v > p) { p = v; cur = eq[k].date; } const d = v / p - 1; if (d < m) { m = d; trough = eq[k].date; peakDate = cur; } }); return { maxDrawdown: m, peak: peakDate, trough }; };
  const vol = sd(rets) * Math.sqrt(52), bvol = sd(brets) * Math.sqrt(52);
  const cagr = ann(values, values.at(-1), values[0]), bcagr = ann(bench, bench.at(-1), bench[0]);
  // Rebalance-interval (monthly) returns vs SPY for block inference.
  const execDates = result.rebalances.map(r => r.date), pos = new Map(eq.map((e, k) => [e.date, k])), monthly = [];
  for (let k = 0; k < execDates.length; k++) {
    const a = pos.get(execDates[k]), b = k + 1 < execDates.length ? pos.get(execDates[k + 1]) : eq.length - 1;
    if (b > a) monthly.push({ date: result.rebalances[k].decisionDate, strat: values[b] / values[a] - 1, spy: bench[b] / bench[a] - 1 });
  }
  const ex = monthly.map(m => m.strat - m.spy);
  const bb = V.inferTemporalBlockMean({ calendar: monthly.map(m => m.date), blockLength: 12, minimumBlockLength: 6, replicates: 1999, seed: 20261028, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' },
    monthly.map(m => ({ id: m.date, date: m.date, value: m.strat - m.spy })));
  const yearly = {}; eq.forEach(e => { yearly[e.date.slice(0, 4)] = yearly[e.date.slice(0, 4)] || { first: null, last: null }; });
  const byYear = {}; let prevV = values[0], prevB = bench[0], prevY = eq[0].date.slice(0, 4);
  eq.forEach((e, k) => { const y = e.date.slice(0, 4); if (y !== prevY) { byYear[prevY] = { strategy: values[k - 1] / prevV - 1, spy: bench[k - 1] / prevB - 1 }; prevV = values[k - 1]; prevB = bench[k - 1]; prevY = y; } });
  byYear[prevY] = { strategy: values.at(-1) / prevV - 1, spy: bench.at(-1) / prevB - 1, partial: true };
  return { from: eq[0].date, to: eq.at(-1).date, years, endCapital: values.at(-1), cagr, volatility: vol, sharpe: (rets.reduce((s, x) => s + x, 0) / rets.length * 52) / vol, ...dd(values),
    turnoverPerYear: result.metrics.oneWayTurnoverSum / years, fees: result.metrics.fees, slippage: result.metrics.slippage, rebalances: result.rebalances.length,
    avgPositions: eq.reduce((s, e) => s + e.positions.length, 0) / eq.length, avgCashShare: eq.reduce((s, e) => s + e.cash / e.value, 0) / eq.length,
    spy: { cagr: bcagr, volatility: bvol, sharpe: (brets.reduce((s, x) => s + x, 0) / brets.length * 52) / bvol, ...dd(bench), endCapital: bench.at(-1) },
    excessCagr: cagr - bcagr, monthlyExcess: { n: ex.length, mean: bb.estimate, pValueBlock: bb.pValue, ci95Block: bb.ci, nw: Study.neweyWest(ex, 4), hitRate: ex.filter(x => x > 0).length / ex.length },
    calendarYears: byYear };
}

/** Equal-weighted rank population (all listings with a composite), next-week entry to next execution, no costs - descriptive. */
function equalWeightPopulation(frame, sel) {
  const cal = new Map(frame.calendar.map((d, k) => [d, k])), byId = new Map(frame.listings.map(l => [l.securityId, new Map(l.points)]));
  let level = 1; const path = [];
  sel.forEach((s, k) => {
    const a = frame.calendar[cal.get(s.date) + 1], b = k + 1 < sel.length ? frame.calendar[cal.get(sel[k + 1].date) + 1] : frame.calendar.filter(d => d <= VALUATION_END).at(-1);
    const r = s.all.map(id => { const m = byId.get(id); return m.has(a) && m.has(b) ? m.get(b) / m.get(a) - 1 : null; }).filter(x => x !== null);
    const m = r.reduce((x, y) => x + y, 0) / r.length; level *= 1 + m; path.push({ date: s.date, n: r.length, missing: s.all.length - r.length, ret: m });
  });
  const years = (Date.parse(VALUATION_END) - Date.parse(frame.calendar[cal.get(sel[0].date) + 1])) / (365.25 * 86400000);
  return { cagrApprox: level ** (1 / years) - 1, endLevel: level, missingOutcomes: path.reduce((s, p) => s + p.missing, 0), path };
}

function main() {
  const privateDir = F.privateDir(process.argv[2]);
  const loaderOptions = F.parseLoaderOptions(arg('--loader-options'));
  const outDir = path.resolve(arg('--out') || path.join(F.ROOT, 'docs/quant-recovery/v10/factor'));
  const t0 = Date.now();
  const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
  const panel = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(privateDir, 'panel.json.gz'))));
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const sel = selections(panel).filter(s => s.top.length > 0);
  const runs = {}, ledgers = {};
  for (const [name, costs] of Object.entries(COSTS)) {
    const input = buildInput(frame, spy, sel, costs);
    const r = P.runPortfolio(input);
    runs[name] = { inputHash: r.inputHash, resultHash: r.resultHash, generation: r.generation, limitations: r.limitations, metrics: metrics(r, sel) };
    ledgers[name] = { equity: r.equity.map(e => [e.date, e.value, e.benchmark, e.cash, e.positions.map(p => [p.listingId, p.units, p.price])]), trades: r.trades.length, rebalances: r.rebalances };
    if (name === 'BASE') ledgers.input = { targets: input.targets.map(t => [t.decisionDate, t.executionDate, Object.keys(t.weights)]), costs: input.costs };
  }
  const ew = equalWeightPopulation(frame, sel);
  const doc = { schemaVersion: 'v10-factor-strategy-1.0.0', studyId: reg.studyId + ':' + reg.strategy.id, evidenceKind: 'RECONSTRUCTION', registrationHash: C.hash(reg), rule: reg.strategy.rule,
    engine: 'quant/engines/research-portfolio.cjs ' + P.VERSION + ' (HISTORICAL_PRICE_SIMULATION)', loaderOptions,
    engineMembership: 'Je Stichtag die 100 bestplatzierten Listings des rekonstruierten Gesamtrangs aus der vollen Rangpopulation (Engine-Budget: Listings x Sitzungen <= 2 Mio.); Ziele (Top 50) sind Teilmenge.',
    sparseBars: 'Der Engine werden exakte Wochenschluesse nur an Sitzungen uebergeben, an denen der Titel gehalten oder gehandelt wird (Budget 250.000 Balken); fehlt ein solcher Kurs, bricht der Lauf ab.',
    selection: { rankDates: sel.length, firstDecision: sel[0].date, lastDecision: sel.at(-1).date, scoredPerDate: { min: Math.min(...sel.map(s => s.scored)), median: sel.map(s => s.scored).sort((a, b) => a - b)[Math.floor(sel.length / 2)], max: Math.max(...sel.map(s => s.scored)) },
      datesWithFewerThanTopN: sel.filter(s => s.top.length < TOP_N).length, distinctListingsSelected: new Set(sel.flatMap(s => s.top)).size },
    returnBasis: 'PRICE_RETURN', benchmark: 'SPY PRICE_RETURN (weekly-benchmark, ohne Kosten)', costs: COSTS, runs,
    equalWeightPopulation: { note: 'gleichgewichtete Rangpopulation, deskriptiv, ohne Kosten', cagrApprox: ew.cagrApprox, endLevel: ew.endLevel, missingOutcomes: ew.missingOutcomes },
    survivorship: 'Population = heutige Survivors (CONDITIONAL_FIXED_CURRENT_COHORT); kein Titel des Frames endet vor dem Bewertungsende, Delisting-Abgaenge kommen deshalb nicht vor. Das ist Selektion, kein Ergebnis.',
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false, activeContractsAffected: [], seconds: Math.round((Date.now() - t0) / 1000) };
  doc.reproHash = C.hash({ runs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.inputHash])), code: ['strategy.cjs', 'factors.cjs', 'common.cjs'].map(f => C.shaFile(path.join(__dirname, f))), engine: C.shaFile(F.ROOT + '/quant/engines/research-portfolio.cjs') });
  fs.writeFileSync(path.join(privateDir, 'strategy-ledgers.json.gz'), zlib.gzipSync(JSON.stringify(ledgers)));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'strategy-1.0.0.json'), JSON.stringify(doc, null, 1) + '\n');
  for (const [k, v] of Object.entries(runs)) { const m = v.metrics; console.log(k, JSON.stringify({ cagr: m.cagr, vol: m.volatility, sharpe: m.sharpe, mdd: m.maxDrawdown, turn: m.turnoverPerYear, spy: { cagr: m.spy.cagr, mdd: m.spy.maxDrawdown, sharpe: m.spy.sharpe }, ex: m.monthlyExcess })); }
  console.log(JSON.stringify({ ew: doc.equalWeightPopulation, sel: doc.selection, seconds: doc.seconds }));
}
if (require.main === module) main();
module.exports = { selections, buildInput, TOP_N, CANDIDATE_POOL, COSTS };
