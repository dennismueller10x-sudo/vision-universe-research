/**
 * V4 final performance run (inside the protected runner only). Runs ONLY if the V4 calibration summary carries
 * CERTIFIED or PARTIALLY_CERTIFIED with the EW control externally passed, and ONLY for IMPLEMENT_NOW methods.
 * Old VU adaptations run separately on the same V4 infrastructure (A/B), never overwritten.
 *
 * Public output: directions and classifications (rule 46: counts, classifications, hashes); exact metrics are
 * sealed to the owner/session keys.
 *
 * Usage: node run-performance-v4.mjs --perf-freeze <file> --calibration-summary <file> --input-dir <private>
 *          --out <private dir> --public-out <summary.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCanonicalData } from '../certification/canonical-input.mjs';
import { prepareRerunData } from '../certification/run-rerun.mjs';
import { computeContentBinding } from '../calibration/capture-v3-inrunner.mjs';
import { portfolioMetrics, signalMetrics } from '../tournament/metrics.mjs';
import { historicalParticipants, prepareSourceFeatures } from '../tournament/methods.mjs';
import * as Listing from '../../validation/lib.mjs';
import { applyCausalTerminals, terminalFactorV4 } from './measurement/measurement-policy-v4.mjs';
import { priceSanityCensus, applyPriceSanityQuarantine } from './measurement/price-sanity-v4.mjs';
import { runTurtleSource, TURTLE_SOURCE_VERSION } from './methods/turtle-source-v4.mjs';
import { runMethod, benchmarkCurve } from './methods/runner-v4.mjs';
import { verifyPerformanceFreezeV4 } from './freeze-performance-v4.mjs';
import { replayTurtleLedger } from './review/turtle-replay-v4.mjs';
import { verifyFreezePinned } from './freeze-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const demand = (ok, code) => { if (!ok) throw new Error(code); };
const PROTOCOL = JSON.parse(fs.readFileSync(path.join(HERE, '../tournament/protocol.json')));
const INCLUDED = new Set(['EQUITY_COMMON', 'ADR', 'REIT']);
export const PERFORMANCE_GATE_LEVELS = ['CERTIFIED', 'PARTIALLY_CERTIFIED'];

export function performanceGate(summary) {
  const c = summary?.certification;
  const ok = PERFORMANCE_GATE_LEVELS.includes(c?.level) && (c.externallyValidatedSlices ?? []).includes('EW_MARKET');
  return { open: ok, level: c?.level ?? null, reason: ok ? 'V4_MEASUREMENT_SUFFICIENTLY_CERTIFIED' : 'V4_CALIBRATION_GATE_CLOSED' };
}

/** Forward outcomes of Turtle signals: signal-day close to close after h sessions vs SPY, total return basis. */
export function turtleForward(signals, data, horizons = PROTOCOL.signals.horizonsSessions, scenario = PROTOCOL.delisting.baseline) {
  const cal = (data.benchmark?.bars || data.spyBars), pos = new Map(cal.map((b, i) => [b.date, i])), byId = new Map(data.securities.map((s) => [s.id, s]));
  const idx = (bars, d) => { let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].date < d) lo = m + 1; else hi = m; } return bars[lo]?.date === d ? lo : -1; };
  return signals.map((sg) => {
    const s = byId.get(sg.id), i0 = idx(s.bars, sg.date), c0 = pos.get(sg.date), forward = {};
    for (const h of horizons) {
      const endDate = cal[c0 + h]?.date; if (i0 < 0 || !endDate) { forward[h] = { censored: true, reason: 'WINDOW' }; continue; }
      const term = s.terminal && s.terminal.date > sg.date && s.terminal.date <= endDate ? s.terminal : null;
      let j = idx(s.bars, term ? term.date : endDate); if (j < 0) { let lo = 0, hi = s.bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s.bars[m].date <= (term ? term.date : endDate)) lo = m + 1; else hi = m; } j = lo - 1; }
      if (j <= i0) { forward[h] = { censored: true, reason: 'PRICE_DATA_GAP' }; continue; }
      const f = term ? terminalFactorV4(term, scenario, { distress: s.bars[j].rawClose < 1 }) : 1;
      const r = s.bars[j].totalReturnIndex / s.bars[i0].totalReturnIndex * f - 1, b = cal[c0 + h].totalReturnIndex / cal[c0].totalReturnIndex - 1;
      const ex = s.bars.slice(i0, j + 1).map((x) => x.totalReturnIndex / s.bars[i0].totalReturnIndex - 1);
      forward[h] = { return: r, excess: r - b, benchmarkReturn: b, mfe: Math.max(0, ...ex), mae: Math.min(0, ...ex, r), censored: false };
    }
    return { ...sg, forward };
  });
}

/** Rule 41: portfolio vs SPY, invested capital, exposure-normalized behaviour, signal quality kept apart. */
export function fairBenchmark(curve, benchmark, initialCapital) {
  const bm = new Map(benchmark.map((p) => [p.date, p.equity]));
  let matched = initialCapital; const matchedCurve = [];
  for (let i = 0; i < curve.length; i++) { if (i) { const r = bm.get(curve[i].date) / bm.get(curve[i - 1].date) - 1; matched *= 1 + curve[i - 1].exposure * r; } matchedCurve.push({ date: curve[i].date, equity: matched, exposure: curve[i].exposure, n: 1 }); }
  const pm = portfolioMetrics(curve, { initialCapital }), bmm = portfolioMetrics(benchmark.filter((p) => p.date >= curve[0].date && p.date <= curve.at(-1).date), { initialCapital: benchmark.find((p) => p.date === curve[0].date)?.equity ?? initialCapital }), mm = portfolioMetrics(matchedCurve, { initialCapital });
  let invested = 0, pnl = curve.at(-1).equity - initialCapital; for (const p of curve) invested += p.exposure * p.equity; invested /= curve.length;
  return { portfolio: pm, spy: bmm, exposureMatchedSpy: mm, cashDrag: 1 - pm.averageExposure, returnOnAverageInvestedCapital: invested > 0 ? pnl / invested : null,
    directions: { vsSpyCagr: Math.sign(pm.cagr - bmm.cagr), vsExposureMatchedCagr: Math.sign(pm.cagr - mm.cagr), sharpeVsSpy: Math.sign((pm.sharpe ?? 0) - (bmm.sharpe ?? 0)) } };
}

function tradeTails(trades) {
  const r = trades.map((t) => t.pnl / t.cost).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => (r.length ? r[Math.min(r.length - 1, Math.max(0, Math.round((r.length - 1) * p)))] : null);
  return { n: r.length, winRate: r.length ? r.filter((x) => x > 0).length / r.length : null, leftTail05: q(0.05), median: q(0.5), rightTail95: q(0.95), mfeMean: trades.length ? trades.reduce((a, t) => a + (t.mfe ?? 0), 0) / trades.length : null, maeMean: trades.length ? trades.reduce((a, t) => a + (t.mae ?? 0), 0) / trades.length : null };
}
function signalQuality(sm) {
  const h = sm.horizons?.[63];
  return { signals: sm.totalSignals, hitRate63: h?.excess?.hitRate ?? null, leftTail63: h?.excess?.leftTail ?? null, rightTail63: h?.excess?.rightTail ?? null, mfe63: h?.mfe?.mean ?? null, mae63: h?.mae?.mean ?? null, excess21: sm.horizons?.[21]?.excess?.mean ?? null, excess63: h?.excess?.mean ?? null, excess126: sm.horizons?.[126]?.excess?.mean ?? null, hacT63: h?.monthCluster?.excess?.hac?.t ?? null };
}
const dir = (x) => (!Number.isFinite(x) ? 'UNAVAILABLE' : x > 0 ? 'POSITIVE' : x < 0 ? 'NEGATIVE' : 'ZERO');

/** Pure core used by tests and the runner. */
export const PERFORMANCE_METHOD_IDS = ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE', 'TURTLE_S2_EQUITY_DAILY_OLD_VU'];
export function performV4(data, { window = PROTOCOL.window, only = PERFORMANCE_METHOD_IDS } = {}) {
  if (only.some((m) => !PERFORMANCE_METHOD_IDS.includes(m))) throw new Error('UNKNOWN_PERFORMANCE_METHOD');
  const ic = PROTOCOL.execution.initialCapital, benchmark = benchmarkCurve(data, ic);
  const common = { universe: PROTOCOL.universe, from: window.from, to: window.to, initialCapital: ic, includeInstrument: (s) => INCLUDED.has(s.listing?.instrumentType) };
  const variants = [
    { id: 'BASELINE_NET', opts: {} },
    { id: 'GROSS', opts: { slippageBpsPerSide: 0, commissionBpsPerSide: 0 } },
    { id: 'DOUBLE_COST', opts: { slippageBpsPerSide: 20, commissionBpsPerSide: 2 } },
    { id: 'ECONOMIC_LAST_OBSERVED_PRICE', opts: { scenario: 'LAST_OBSERVED_PRICE' } },
    { id: 'ECONOMIC_DISTRESS_ZERO', opts: { scenario: 'DISTRESS_ZERO_OTHER_MINUS_30' } },
    { id: 'DATA_EVENTS_MINUS_30', opts: { dataEventScenario: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT' } },
  ];
  const methods = {};
  for (const system of ['S1', 'S2']) {
    const id = `TURTLE_${system}_SOURCE`, runs = {};
    if (!only.includes(id)) continue;
    for (const v of variants) {
      const r = runTurtleSource(data, { ...common, system, ...v.opts });
      demand(r.reconciliation.pass, 'TURTLE_RECONCILIATION_FAILED:' + id + ':' + v.id);
      const replay = replayTurtleLedger(r, data);
      demand(replay.status === 'PASS', 'TURTLE_LEDGER_REPLAY_FAILED:' + id + ':' + v.id);
      const signals = v.id === 'BASELINE_NET' ? turtleForward(r.signals, data) : null;
      runs[v.id] = { replay, fair: fairBenchmark(r.curve, benchmark, ic), trades: tradeTails(r.trades), counts: r.counts, filterCounts: r.filterCounts, ...(signals ? { signal: signalQuality(signalMetrics(signals)), signalMetrics: signalMetrics(signals) } : {}), curve: r.curve, tradeLedger: r.trades };
    }
    methods[id] = { track: 'ORIGINAL_SOURCE_FAITHFUL_EQUITY_TRANSLATION', version: TURTLE_SOURCE_VERSION, measurement: 'MEASUREMENT_PARTIAL: own stop-trigger ledger (bookkeeping proven by independent replay; fill model not externally calibrated)', executionConvention: 'INTRADAY_STOP_TRIGGER_ON_DAILY_BARS', runs };
  }
  if (!only.includes('TURTLE_S2_EQUITY_DAILY_OLD_VU')) return { benchmark, methods };
  // A/B: old VU adaptation on the same V4 infrastructure (method definition unchanged)
  prepareSourceFeatures(data);
  const old = historicalParticipants.find((m) => m.id === 'TURTLE_S2_EQUITY_DAILY');
  const oldRuns = {};
  for (const [vid, opt] of [['BASELINE_NET', {}], ['DOUBLE_COST', { costMultiplier: PROTOCOL.execution.costSensitivityMultiplier }]]) {
    const r = runMethod(data, old, PROTOCOL, { ...opt, measureSignals: vid === 'BASELINE_NET' });
    demand(r.reconciliation.pass, 'OLD_ADAPTATION_RECONCILIATION_FAILED');
    oldRuns[vid] = { fair: fairBenchmark(r.curve, benchmark, ic), trades: tradeTails(r.trades.map((t) => ({ ...t, mfe: null, mae: null }))), ...(vid === 'BASELINE_NET' ? { signal: signalQuality(signalMetrics(r.signals)), signalMetrics: signalMetrics(r.signals) } : {}), curve: r.curve };
  }
  methods.TURTLE_S2_EQUITY_DAILY_OLD_VU = { track: 'OLD_VU_ADAPTATION', measurement: 'accounting-v4 next-open book (same infrastructure as the V4 calibration NEXT_OPEN book)', executionConvention: 'NEXT_SESSION_OPEN_TARGET_WEIGHTS', runs: oldRuns };
  return { benchmark, methods };
}

export function publicView(result) {
  const out = {};
  for (const [id, m] of Object.entries(result.methods)) {
    const b = m.runs.BASELINE_NET;
    out[id] = { track: m.track, measurement: m.measurement, executionConvention: m.executionConvention, ledgerReplay: b.replay ? b.replay.status : 'NOT_APPLICABLE_ACCOUNTING_V4',
      baseline: { vsSpyCagr: dir(b.fair.directions.vsSpyCagr), vsExposureMatchedSpyCagr: dir(b.fair.directions.vsExposureMatchedCagr), sharpeVsSpy: dir(b.fair.directions.sharpeVsSpy), absoluteReturn: dir(b.fair.portfolio.totalReturn),
        signal63Excess: dir(b.signal?.excess63), signal63HacSignificant: Number.isFinite(b.signal?.hacT63) ? Math.abs(b.signal.hacT63) >= 1.96 : null, averageExposureBand: b.fair.portfolio.averageExposure < 0.25 ? 'LOW' : b.fair.portfolio.averageExposure < 0.75 ? 'MID' : 'HIGH', trades: b.trades.n, signals: b.signal?.signals ?? null },
      sensitivities: Object.fromEntries(Object.entries(m.runs).filter(([k]) => k !== 'BASELINE_NET').map(([k, r]) => [k, { vsSpyCagr: dir(r.fair.directions.vsSpyCagr), absoluteReturn: dir(r.fair.portfolio.totalReturn) }])),
      counts: b.counts ?? null, filterCounts: b.filterCounts ?? null };
  }
  return out;
}

export async function runPerformanceV4(args) {
  const freezePath = path.resolve(args['--perf-freeze']), freeze = JSON.parse(fs.readFileSync(freezePath));
  verifyPerformanceFreezeV4(freeze);
  const pinned = verifyFreezePinned(freezePath);
  const calBytes = fs.readFileSync(args['--calibration-summary']), cal = JSON.parse(calBytes);
  demand(sha(calBytes) === freeze.calibrationSummarySha256, 'CALIBRATION_SUMMARY_DIFFERS_FROM_PERFORMANCE_FREEZE');
  const gate = performanceGate(cal); demand(gate.open, 'PERFORMANCE_GATE_CLOSED');
  const inputDir = path.resolve(args['--input-dir']), out = path.resolve(args['--out']);
  demand(inputDir.startsWith('/workspace/private/') && out.startsWith('/workspace/private/'), 'PRIVATE_PATHS_REQUIRED');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const binding = computeContentBinding(inputDir);
  for (const k of ['normalizedPartListSha256', 'normalizedManifestSha256', 'normalizedInputsSha256', 'dataFingerprint']) demand(binding[k] === freeze.dataContract[k], 'CANONICAL_CONTENT_DIFFERS_FROM_FREEZE:' + k);
  const raw = await loadCanonicalData(inputDir, { sourceProvenanceOverlay: true, expectedSourceMetadataSha256: sha(fs.readFileSync(path.join(inputDir, 'data-certification-inputs.json'))) });
  const prepared = prepareRerunData(raw, PROTOCOL).data;
  const census = priceSanityCensus(prepared.securities), data = applyCausalTerminals(applyPriceSanityQuarantine(prepared, census).data).data; // V4.1 order (review R7b)
  const only = args['--method'] ? [args['--method']] : PERFORMANCE_METHOD_IDS;
  const result = performV4(data, { only });
  const summary = { schema: 'supertrader-v4-performance-public-summary-1.0.0', generation: 'V4', methodsRun: only, postHoc: true, perfFreezeId: freeze.freezeId, perfFreezeCommit: pinned.freezeCommit, calibrationFreezeId: cal.freezeId, calibrationLevel: cal.certification.level, gate,
    methods: publicView(result), claimReadiness: 'RESEARCH_ONLY (stop-trigger fills internal only; MEASUREMENT_PARTIAL)', abNote: 'A/B compares method plus execution convention: source-faithful intraday stop triggers vs the old next-open target-weight adaptation; same data, universe, costs, terminal policy, calendar and metrics', performanceNumbersPublished: false };
  const bytes = Buffer.from(JSON.stringify({ schema: 'supertrader-v4-performance-private-1.0.0', perfFreezeId: freeze.freezeId, result }));
  const keys = [['owner', 'scripts/supertrader/validation/results-public-key.pem'], ['session', 'scripts/supertrader/research/tournament/session-public-key.pem']];
  summary.sealed = { plaintextSha256: sha(bytes), envelopes: keys.map(([aud, p]) => { const f = path.join(out, `SUPERTRADER-V4-PERFORMANCE-${only.join('+')}-PRIVATE.${aud}.sealed.json`), s = Listing.encryptForOwner(fs.readFileSync(path.join(ROOT, p), 'utf8'), bytes); fs.writeFileSync(f, s, { mode: 0o600, flag: 'wx' }); return { audience: aud, file: path.basename(f), sha256: sha(Buffer.from(s)) }; }) };
  fs.writeFileSync(args['--public-out'], JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), args = {}; for (let i = 0; i < a.length; i += 2) args[a[i]] = a[i + 1];
  runPerformanceV4(args).then((s) => process.stdout.write(JSON.stringify({ perfFreezeId: s.perfFreezeId, gate: s.gate, methods: Object.fromEntries(Object.entries(s.methods).map(([k, m]) => [k, m.baseline])) }) + '\n'))
    .catch((e) => { process.stderr.write(JSON.stringify({ phase: 'V4_PERFORMANCE', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', name: e.name, hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
