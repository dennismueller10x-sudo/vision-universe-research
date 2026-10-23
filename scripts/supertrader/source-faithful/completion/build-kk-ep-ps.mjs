#!/usr/bin/env node
/**
 * Readiness of the Kullamaegi Episodic Pivot (C09) and Parabolic Short (C10) chart-first research models
 * (research/kk-ep-lifecycle.mjs, research/kk-ps-study.mjs, research/run-kk-intraday.mjs). Writes
 * artifacts/STRATEGY-KK-EP-PS-CHART.json. The contract rule statuses and the measurement classes of the original methods
 * do not change: a chart setup is never an original EP, a hypothetical short is never an executable short. The only
 * hand-entered facts are the snapshot runs (public counts of the workflow log).
 *
 *   node scripts/supertrader/source-faithful/completion/build-kk-ep-ps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KK_EPISODIC_PIVOT, KK_PARABOLIC_SHORT } from '../contracts/kullamagi.mjs';
import { deriveImplementationStatus } from '../contract.mjs';
import { EP_CLASS, EP_ORIGINAL_CLASS_ASSIGNABLE, EP_LABEL, EP_MODEL_ASSUMPTIONS, EP_REFERENCE_CONFIG, EP_RUN_VARIANTS, KK_EP_LIFECYCLE_VERSION, epVariantRegistrySha256 } from '../research/kk-ep-lifecycle.mjs';
import { PS_CLASS, PS_EXECUTABLE_CLASS_ASSIGNABLE, PS_LABEL, PS_MODEL_ASSUMPTIONS, PS_REFERENCE_CONFIG, PS_RUN_VARIANTS, PS_COSTS, KK_PS_STUDY_VERSION, psVariantRegistrySha256 } from '../research/kk-ps-study.mjs';
import { KK_INTRADAY_VERSION } from '../research/kk-intraday.mjs';

const SF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KK_EP_PS_SCHEMA = 'supertrader-kk-ep-ps-chart-readiness-1.0.0';

/** Phase 1 (budgeted probes, public ratios only; raw data sealed). */
export const KK_INTRADAY_PROBES = Object.freeze([
  Object.freeze({ runId: '39931778756', requests: 88, cases: 17, withMinutes: 17, findings: Object.freeze(['IEX 1- and 5-minute bars for all 17 EP / PS days (2020-2024, incl. delisted TWTR), 390 minutes each; SNAP IPO day 281 minutes', '5-minute bars equal aggregated 1-minute bars (prices and volume)', 'IEX volume share of the consolidated daily volume 1.0-4.8 %', 'IEX high / low vs consolidated daily bar mostly <= 0.1 %, at most 1.7 % (GME 2021-01-28 low); first IEX print vs official open <= 0.8 %', 'opening range 5 / 15 / 30, IEX VWAP (inside the daily range) and relative IEX opening volume computable', 'Tiingo "consolidated" beta endpoint: same prices as IEX, no volume field (as R10)']) }),
  Object.freeze({ runId: '39933893419', requests: 3, cases: 1, withMinutes: 0, findings: Object.freeze(['IEX range request NVDA 2023-04-24..2023-05-24: resampleFreq=1day rejected (400, "Min or Hour only")', '4hour: 23 bars for 23 sessions, all with IEX volume; 1hour: 138 bars, 23 sessions -> the 20-session IEX volume baseline costs one request (4hour, fallback 1hour)']) }),
]);
/** Candidate counts of the daily screens (count-only run, no intraday request; widest screen of all variants). */
export const KK_CANDIDATE_COUNTS = Object.freeze({ runId: '39935841797', commit: '86bf26d9af', snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', ep: Object.freeze({ total: 14995, inIexHistory: 13769 }), ps: Object.freeze({ total: 76491, inIexHistory: 65216 }), consequence: 'all IEX candidate days would need about 93 000 requests (EP: minutes + baseline, PS: minutes); a run fetches at most 6 000, two thirds for EP, as a deterministic hash-order sample (sha256 of TICKER|date), resumable via the private cache' });
/** Snapshot runs of run-kk-intraday.mjs (public counts of the workflow log). */
export const KK_SNAPSHOT_RUNS = Object.freeze([]);

const blockersEp = ['catalyst identity and timestamp (KK-015 / -038 / -039 / -040): DATA_BLOCKED by owner decision (no news database)', 'consolidated intraday volume: only the IEX venue (1-5 %) is available; KK-016 / -037 read on IEX only', 'intraday history before 2017 (IEX starts 2017): candidates 2016 are screened, never simulated', 'minute cache is private and not frozen in the research snapshot: reproducible via its sha256 in the sealed receipt, not certifiable', 'request budget: one run covers a deterministic hash-order sample of the candidate days, not all of them (no mass download)'];
const blockersPs = ['borrow availability, locates and fees (KK-030): DATA_BLOCKED, every short is hypothetical', 'no short book on the shared engine: trade-level study only, no portfolio return', 'consolidated intraday prices and volume: IEX venue only; VWAP is an IEX VWAP', 'intraday history before 2017', 'request budget: PS gets the third of a run budget left after EP, a deterministic hash-order sample of 65 216 days'];

export function buildKkEpPs() {
  const runs = (key) => KK_SNAPSHOT_RUNS.filter((r) => r.strategies?.includes(key));
  const ep = {
    strategyId: KK_EPISODIC_PIVOT.strategyId, candidateId: 'C09', version: KK_EP_LIFECYCLE_VERSION, intraday: KK_INTRADAY_VERSION, label: EP_LABEL,
    contract: { implementationStatus: deriveImplementationStatus(KK_EPISODIC_PIVOT), ruleStatuses: Object.fromEntries(KK_EPISODIC_PIVOT.rules.filter((r) => r.id.startsWith('KK-SF-EP')).map((r) => [r.id, r.status])), measurementClassOfTheOriginalMethod: 'NOT_MEASURABLE (unchanged)' },
    classes: [{ id: EP_CLASS.CHART, layer: 'A_DAILY_SCREEN', assignable: true }, { id: EP_CLASS.INTRADAY_CONFIRMED, layer: 'B_INTRADAY_IEX', assignable: true }, { id: EP_CLASS.ORIGINAL, layer: 'CATALYST', assignable: EP_ORIGINAL_CLASS_ASSIGNABLE, why: 'no verified catalyst data (owner decision 2026-10-23)' }],
    layers: { A_DAILY_SCREEN: 'frozen research snapshot, all history, decided at the official open of the gap day', B_INTRADAY_IEX: 'REAL Tiingo IEX minutes 2017+, decided in time order; no minute derived from a daily bar' },
    researchStage: runs('EP').length ? 'CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE' : 'CHART_EP_IMPLEMENTED_SNAPSHOT_RUN_PENDING',
    engine: 'shared research engine (research-v1), order type INTRADAY_RESOLVED', reference: EP_REFERENCE_CONFIG, variants: EP_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })), variantRegistrySha256: epVariantRegistrySha256(), modelAssumptions: EP_MODEL_ASSUMPTIONS, blockers: blockersEp, runs: runs('EP'),
    liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED',
  };
  const ps = {
    strategyId: KK_PARABOLIC_SHORT.strategyId, candidateId: 'C10', version: KK_PS_STUDY_VERSION, intraday: KK_INTRADAY_VERSION, label: PS_LABEL,
    contract: { implementationStatus: deriveImplementationStatus(KK_PARABOLIC_SHORT), ruleStatuses: Object.fromEntries(KK_PARABOLIC_SHORT.rules.filter((r) => r.id.startsWith('KK-SF-PS')).map((r) => [r.id, r.status])), measurementClassOfTheOriginalMethod: 'NOT_MEASURABLE (unchanged)' },
    classes: [{ id: PS_CLASS.CHART, layer: 'A_DAILY_SCREEN', assignable: true }, { id: PS_CLASS.INTRADAY_CONFIRMED, layer: 'B_INTRADAY_IEX', assignable: true }, { id: PS_CLASS.EXECUTABLE, layer: 'BORROW', assignable: PS_EXECUTABLE_CLASS_ASSIGNABLE, why: 'no historical borrow / locate / fee data' }],
    layers: { A_DAILY_SCREEN: 'frozen research snapshot, all history, decided at the close before the trade day', B_INTRADAY_IEX: 'REAL Tiingo IEX minutes 2017+, decided in time order; no minute derived from a daily bar' },
    researchStage: runs('PS').length ? 'CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE' : 'CHART_PS_IMPLEMENTED_SNAPSHOT_RUN_PENDING',
    engine: 'trade-level short study (no portfolio, no borrow cost)', costs: PS_COSTS, reference: PS_REFERENCE_CONFIG, variants: PS_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })), variantRegistrySha256: psVariantRegistrySha256(), modelAssumptions: PS_MODEL_ASSUMPTIONS, blockers: blockersPs, runs: runs('PS'),
    liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED',
  };
  return { schema: KK_EP_PS_SCHEMA, ownerDecision: 'chart-first 2026-10-23: no news / catalyst database, no new data provider, IEX minutes of the existing Tiingo access only', probes: KK_INTRADAY_PROBES, candidateCounts: KK_CANDIDATE_COUNTS, strategies: { C09: ep, C10: ps } };
}

export function writeKkEpPs(outDir = path.join(SF, 'artifacts')) {
  const a = buildKkEpPs();
  fs.writeFileSync(path.join(outDir, 'STRATEGY-KK-EP-PS-CHART.json'), JSON.stringify(a, null, 1) + '\n');
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const a = writeKkEpPs(); console.log(`kk ep/ps: C09 ${a.strategies.C09.researchStage}, C10 ${a.strategies.C10.researchStage}`); }
