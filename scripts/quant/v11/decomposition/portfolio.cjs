#!/usr/bin/env node
'use strict';
// V11 DECOMPOSITION - A3 (portfolio construction of the funded strategy) and A4 (funded cost break-even).
// Every path runs through the unchanged quant/engines/research-portfolio.cjs with the V10 fundedInput (numeraire 1);
// only the schedule (positions N, weighting, tie-break key) varies. The HASH_V10/N10/EQUAL path must reproduce V10.
// Usage: node portfolio.cjs --out <private dir> [--rules A,B] [--workers 3]
const fs = require('node:fs'), path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const K = require('../../v10/studies/common.cjs');
const SS = require('../../v10/studies/signal-study.cjs');
const P = require(K.ROOT + '/quant/engines/research-portfolio.cjs');
const { readRegistration } = require('./register.cjs');
const V10_LIFECYCLE_MANIFEST = '2c27039fd782cccced62ac28cebfb808eea07670ba2c79e58e373824bcc0b679';

const ledgerId = listingId => /^[A-Za-z0-9_:./-]{1,160}$/.test(listingId) ? listingId : 'ledger:' + K.sha(listingId).slice(0, 32);

function buildCtx(R) {
  const fr = K.buildFrame(R.population.loaderOptions), manifestHash = K.V.hash(K.sourceManifest(fr));
  if (manifestHash !== V10_LIFECYCLE_MANIFEST) throw Error('FRAME_DIFFERS_FROM_V10_LIFECYCLE_RUN');
  const ctx = { fr, panel: K.buildPanel(fr), benchmark: K.loadBenchmark(), manifestHash };
  ctx.studyCalendar = fr.calendar.filter(d => d >= R.signalWindow[0] && d <= R.signalWindow[1]);
  return ctx;
}
// Outcome-free preparation identical to V10 fundedSchedule (universe, signals by calendar index).
function prepare(ctx, rule, H) {
  const cal = ctx.fr.calendar, ci = new Map(cal.map((d, i) => [d, i]));
  const jFirst = ci.get(ctx.studyCalendar[0]), jLast = ci.get(ctx.studyCalendar.at(-1)), lastSession = jLast + 1 + H;
  const universe = ctx.panel.filter(p => p.gap[p.closes.length] === 0 && p.cal[p.closes.length - 1] >= lastSession);
  const signals = new Map(); let signalCount = 0;
  for (const p of universe) for (const k of K.Signal.detectEvents(Array.from(p.closes), K.Signal.RULE_BY_ID[rule])) {
    const j = p.cal[k]; if (j < jFirst || j > jLast || p.dates[k] < p.listingStart) continue;
    if (!signals.has(j)) signals.set(j, []); signals.get(j).push(p); signalCount++;
  }
  return { rule, H, cal, jFirst, jLast, lastSession, universe, signals, signalCount };
}
function sigma26(p, j) {
  const k = j - p.cal[0]; if (k < 26) return null;
  const r = []; for (let i = k - 25; i <= k; i++) r.push(Math.log(p.closes[i] / p.closes[i - 1]));
  const m = K.mean(r); const s = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)); return s > 0 ? s : null;
}
function weightsFor(held, N, weighting, j) {
  const list = [...held.values()];
  if (weighting === 'EQUAL') return list.map(e => [ledgerId(e.p.listingId), 1 / N]);
  if (weighting === 'FULLY_INVESTED') return list.map(e => [ledgerId(e.p.listingId), 1 / list.length]);
  // VOL_INVERSE: 1/sigma, sum = held/N, cap 2/N, excess stays cash; missing sigma -> equal slot weight
  const inv = list.map(e => { const s = sigma26(e.p, j); return s ? 1 / s : null; });
  const known = inv.filter(x => x !== null), fill = known.length ? K.mean(known) : 1;
  const raw = inv.map(x => x === null ? fill : x), tot = raw.reduce((a, b) => a + b, 0), budget = list.length / N, cap = 2 / N;
  return list.map((e, i) => [ledgerId(e.p.listingId), Math.min(cap, raw[i] / tot * budget)]);
}
function schedule(pr, N, weighting, keyFn) {
  const held = new Map(), targets = [], episodes = []; let skippedNoSlot = 0;
  for (let j = pr.jFirst; j < pr.lastSession; j++) {
    const exec = j + 1; let changed = false;
    for (const [id, e] of [...held]) if (e.entryExec + pr.H === exec) { held.delete(id); changed = true; e.ep.exitExec = exec; }
    if (j <= pr.jLast) {
      const cands = (pr.signals.get(j) || []).filter(p => !held.has(p.id)).map(p => ({ p, key: keyFn(p.id, pr.cal[j]) })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      const free = N - held.size;
      cands.slice(0, Math.max(0, free)).forEach(({ p }) => { const ep = { securityId: p.id, listingId: p.listingId, signalDate: pr.cal[j], entryExec: exec, exitExec: null }; episodes.push(ep); held.set(p.id, { entryExec: exec, p, ep }); changed = true; });
      skippedNoSlot += Math.max(0, cands.length - Math.max(0, free));
    }
    if (changed) targets.push({ decision: j, exec, weights: Object.fromEntries(weightsFor(held, N, weighting, j).sort((a, b) => a[0] < b[0] ? -1 : 1)) });
  }
  if (held.size) throw Error('FUNDED_POSITIONS_NOT_CLOSED');
  return { jFirst: pr.jFirst, jLast: pr.jLast, lastSession: pr.lastSession, universe: pr.universe, targets, episodes, skippedNoSlot, signalCount: pr.signalCount };
}
const keyFor = tie => tie === 'HASH_V10' ? (id, d) => K.sha('V10-STUDIES-FUNDED-1.0.0|' + id + '|' + d) : (id, d) => K.sha('V11-DECOMPOSITION-TIEBREAK-1.0.0|seed=' + tie + '|' + id + '|' + d);
function sharpe(rets) { const m = K.mean(rets), s = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1)); return s > 0 ? m / s * Math.sqrt(52) : null; }
// Replica of the research-portfolio rebalance arithmetic (target weights at the execution close, bisection for the
// post-cost equity, costs per side on traded notional, uninvested weight as cash without interest). Used ONLY where the
// engine refuses the input by its operation budget (listings x sessions > 2,000,000: N = 20/50); parity with the engine is
// measured on every engine-feasible HASH path (N 5/10) and reported.
function replicaLedger(ctx, pr, sch, costs) {
  const cal = ctx.fr.calendar, rate = (costs.feeBps + costs.slippageBps) / 10000, byLedger = new Map(pr.universe.map(p => [ledgerId(p.listingId), p]));
  const px = (p, s) => p.closes[s - p.cal[0]];
  const tByExec = new Map(sch.targets.map(t => [t.exec, t.weights]));
  let cash = 1, turnover = 0, fees = 0; const hold = new Map(), equity = [], rebalances = [];
  for (let s = sch.jFirst; s <= sch.lastSession; s++) {
    const marked = new Map([...hold].map(([k, u]) => [k, u * px(byLedger.get(k), s)]));
    const before = cash + [...marked.values()].reduce((a, b) => a + b, 0), w = tByExec.get(s);
    if (w) {
      const keys = [...new Set([...hold.keys(), ...Object.keys(w)])].sort();
      const costAt = v => keys.reduce((a, k) => a + Math.abs((w[k] || 0) * v - (marked.get(k) || 0)), 0) * rate;
      let lo = 0, hi = before; for (let j = 0; j < 80; j++) { const mid = (lo + hi) / 2; if (mid + costAt(mid) > before) hi = mid; else lo = mid; }
      const after = (lo + hi) / 2; let traded = 0, c = 0;
      for (const k of keys) {
        const delta = (w[k] || 0) * after - (marked.get(k) || 0); if (Math.abs(delta) <= 1e-12) continue;
        const pr0 = px(byLedger.get(k), s); cash -= delta + Math.abs(delta) * rate; traded += Math.abs(delta); c += Math.abs(delta) * rate;
        if (!(w[k] > 0)) hold.delete(k); else hold.set(k, (hold.get(k) || 0) + delta / pr0);
      }
      turnover += before > 0 ? traded / (2 * before) : 0; fees += c; rebalances.push({ fees: c, slippage: 0, targetEquity: after });
    }
    const value = cash + [...hold].reduce((a, [k, u]) => a + u * px(byLedger.get(k), s), 0);
    equity.push({ date: cal[s], value, cash, benchmark: ctx.benchmark.byDate.get(cal[s]) / ctx.benchmark.byDate.get(cal[sch.jFirst]) });
  }
  const years = (Date.parse(equity.at(-1).date) - Date.parse(equity[0].date)) / (365.25 * 86400000); // engine convention
  let peak = 1, mdd = 0; for (const e of equity) { peak = Math.max(peak, e.value); mdd = Math.min(mdd, e.value / peak - 1); }
  return { equity, rebalances, resultHash: null, metrics: { cagr: equity.at(-1).value ** (1 / years) - 1, cumulativeReturn: equity.at(-1).value - 1, maxDrawdown: mdd, oneWayTurnoverSum: turnover, fees } };
}
function runJob(ctx, preps, job, F) {
  const pr = preps[job.rule], sch = schedule(pr, job.N, job.weighting, keyFor(job.tie));
  let r, ledger = 'RESEARCH_PORTFOLIO_ENGINE', parity = null;
  try { r = P.runPortfolio(SS.fundedInput(ctx, sch, job.costs, F)); }
  catch (e) { if (e.code !== 'PORTFOLIO_OPERATION_BUDGET') throw e; r = replicaLedger(ctx, pr, sch, job.costs); ledger = 'REPLICA_ENGINE_BUDGET_EXCEEDED'; }
  if (job.parity && ledger === 'RESEARCH_PORTFOLIO_ENGINE') { const q = replicaLedger(ctx, pr, sch, job.costs); parity = { cagrAbsDiff: Math.abs(q.metrics.cagr - r.metrics.cagr), maxEquityRelDiff: Math.max(...q.equity.map((e, i) => Math.abs(e.value / r.equity[i].value - 1))) }; }
  const values = [1, ...r.equity.map(e => e.value)], spy = [1, ...r.equity.map(e => e.benchmark)];
  const rs = values.slice(1).map((v, i) => v / values[i] - 1), rb = spy.slice(1).map((v, i) => v / spy[i] - 1);
  const cmp = K.B.compare(ctx.benchmark, r.equity.map(e => ({ date: e.date, value: e.value })), { totalReturn: r.metrics.cumulativeReturn, cagr: r.metrics.cagr }, 'USD', 1);
  const years = (Date.parse(r.equity.at(-1).date) - Date.parse(r.equity[0].date)) / 86400000 / 365.2425;
  const costDrag = r.rebalances.reduce((a, b) => a + (b.targetEquity > 0 ? (b.fees + b.slippage) / b.targetEquity : 0), 0) / years;
  const out = { ...job, ledger, replicaParity: parity, cagr: r.metrics.cagr, spyCagr: cmp.cagr, excessCagr: cmp.excessCagr, maxDrawdown: r.metrics.maxDrawdown, sharpe: sharpe(rs), spySharpe: sharpe(rb),
    averageInvestedShare: K.mean(r.equity.map(e => e.value > 0 ? (e.value - e.cash) / e.value : 0)), oneWayTurnoverPerYear: r.metrics.oneWayTurnoverSum / years, costDragPerYear: costDrag,
    episodes: sch.episodes.length, signals: sch.signalCount, skippedShare: sch.skippedNoSlot / sch.signalCount, sessions: r.equity.length, from: r.equity[0].date, to: r.equity.at(-1).date, resultHash: r.resultHash };
  // invested-only weekly return (strategy return / previous invested share) - cash drag diagnostic
  const inv = r.equity.map(e => e.value > 0 ? (e.value - e.cash) / e.value : 0);
  const rsInv = rs.map((x, i) => (i > 0 && inv[i - 1] > 0.05 ? x / inv[i - 1] : null)).filter(x => x !== null);
  out.investedOnlyMeanWeekly = K.mean(rsInv); out.meanWeeklyStrategy = K.mean(rs); out.meanWeeklySpy = K.mean(rb);
  if (job.inference) {
    const rows = r.equity.map((e, i) => ({ id: e.date, date: e.date, value: rs[i] - rb[i] }));
    const b = K.blockInference(r.equity.map(e => e.date), rows, 52);
    out.weeklyDifference = { n: b.n, estimate: b.estimate, ci: b.ci, pValue: b.pValue, blockLength: 52, sdWeekly: Math.sqrt(rows.reduce((a, x) => a + (x.value - b.estimate) ** 2, 0) / (rows.length - 1)) };
    out.sessionsIdenticalToSpy = cmp.state === 'AVAILABLE' && cmp.points.length === r.equity.length && cmp.points.every((p, i) => p.date === r.equity[i].date);
  }
  return out;
}

if (!isMainThread) {
  const R = workerData.R, F = workerData.F, ctx = buildCtx(R), preps = Object.fromEntries(workerData.rules.map(r => [r, prepare(ctx, r, F.holdingWeeks)]));
  parentPort.on('message', job => { if (job === null) process.exit(0); try { parentPort.postMessage({ ok: true, res: runJob(ctx, preps, job, F) }); } catch (e) { parentPort.postMessage({ ok: false, job, error: String(e.stack || e) }); } });
  parentPort.postMessage({ ready: true });
}

function jobsFor(R, rules) {
  const A = R.analyses.A3_PORTFOLIO, base = R.costs.base, jobs = [];
  for (const rule of rules) {
    for (const [name, paths] of Object.entries(A.randomPaths)) {
      const [weighting, n] = name.split('_N'), N = Number(n);
      jobs.push({ rule, N, weighting, tie: 'HASH_V10', costs: base, inference: true, parity: true, group: name });
      for (let s = 1; s <= 3; s++) jobs.push({ rule, N, weighting, tie: s, costs: base, inference: false, parity: true, group: name + '_PARITY' });
      for (let s = 1; s <= paths; s++) jobs.push({ rule, N, weighting, tie: s, costs: base, inference: false, group: name });
    }
    for (const [f, sl] of R.analyses.A4_COSTS.costGridPerSideBps) jobs.push({ rule, N: 10, weighting: 'EQUAL', tie: 'HASH_V10', costs: { feeBps: f, slippageBps: sl }, inference: true, group: 'COST_GRID' });
  }
  return jobs;
}
async function main() {
  const argv = process.argv.slice(2), o = { out: null, rules: null, workers: 3 };
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--out') o.out = argv[++i]; else if (argv[i] === '--rules') o.rules = argv[++i].split(','); else if (argv[i] === '--workers') o.workers = Number(argv[++i]); else throw Error('UNKNOWN_ARGUMENT:' + argv[i]); }
  const out = K.privateDir(o.out), reg = readRegistration(), R = reg.registration, A = R.analyses.A3_PORTFOLIO, t0 = Date.now();
  const rules = o.rules || A.rules; for (const r of rules) if (!A.rules.includes(r)) throw Error('RULE_NOT_REGISTERED:' + r);
  const F = { holdingWeeks: A.holdingWeeks, initialCapital: 100000 };
  const jobs = jobsFor(R, rules), results = []; let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let alive = o.workers;
    for (let w = 0; w < o.workers; w++) {
      const wk = new Worker(__filename, { workerData: { R, F, rules } });
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else { wk.postMessage(null); } };
      wk.on('message', m => { if (m.ready) return feed(); if (!m.ok) return reject(Error(m.error)); results.push(m.res); if (++done % 25 === 0) console.error('jobs', done, '/', jobs.length, (Date.now() - t0) / 1000); feed(); });
      wk.on('error', reject); wk.on('exit', () => { if (--alive === 0) resolve(); });
    }
  });
  if (results.length !== jobs.length) throw Error('JOBS_INCOMPLETE');
  const file = path.join(out, 'portfolio-' + rules.join('-') + '.json');
  K.writeJson(file, { schemaVersion: 'v11-decomposition-portfolio-1.0.0', registrationHash: reg.registrationHash, rules, jobs: jobs.length, results, seconds: (Date.now() - t0) / 1000, gitHead: K.gitHead(), runtime: K.C.runtime(),
    code: K.codeHashes(['scripts/quant/v11/decomposition/portfolio.cjs', 'scripts/quant/v10/studies/signal-study.cjs']) });
  console.error('done', file, (Date.now() - t0) / 1000);
}
if (isMainThread && require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { prepare, schedule, keyFor, weightsFor, sigma26, ledgerId, replicaLedger, runJob, buildCtx };
