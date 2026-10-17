#!/usr/bin/env node
/**
 * Diagnostic replay of ONE frozen historical tournament method under separated data/processing scenarios.
 * Not a calibration, not a certification, no rule or parameter change: method.evaluate, signal timing and execution
 * are the frozen tournament code of the pinned #705 checkout.
 *
 *   A_ORIGINAL        runner-certified-v3 on the tournament data exactly as measured (run 38685897684 code path)
 *   B1_A5_TIMING      A + only the causal quarantine date (V4 finding A5, first half)
 *   B_VU_BUGS         V4 infrastructure: A4 stale limit, A5 timing and data-event factor 1, A8 value-aware dust
 *   C_INDEPENDENT     B + only corrections an independent source states: a FINRA/SEC 8-K ratio is applied as a split,
 *                     an event confirmed only by the SEC share count (or a confirmed declared-split residual) is cut
 *   D_UNRESOLVED_CUT  C + every remaining census event cut (upper bound of the unresolved sensitivity)
 *   E_WHOLE_SERIES    B with every quarantined history removed (whole-series policy instead of the valid prefix)
 *   F_V4_FORENSIC_SANITY  B + the V4 price-sanity quarantine (VU's own forensic classifier, not independent evidence)
 *
 * Public output: deltas against A and B, directions against SPY, trade-exposure counts. Absolute metrics are sealed to
 * the owner key. Usage:
 *   node backtest-impact.mjs --base-root <#705> --v3-root <v3> --capture <dir> --sec <sec-events.json> --finra <finra-rows.json>
 *        --method <id> --public-out <file> --sealed-dir <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './lib.mjs';

export const SCENARIOS = ['A_ORIGINAL', 'B1_A5_TIMING', 'B_VU_BUGS', 'C_INDEPENDENT', 'D_UNRESOLVED_CUT', 'E_WHOLE_SERIES', 'F_V4_FORENSIC_SANITY'];

const independentDecision = (ev) => (ev.label.cls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE' ? null
  : ev.kind === 'UNDECLARED_RAW_JUMP_10X' && K.finite(ev.label.statedRatio) ? 'NORMALIZE' : 'CUT');

/** Scenario datasets in a fixed order; each returns {runner, data, audit}. Pure apart from source features. */
export function scenarioData(M, prepared, census, id) {
  const causal = (d) => M.policy.applyCausalTerminals(d).data;
  switch (id) {
    case 'A_ORIGINAL': return { runner: 'V3', data: prepared, audit: null };
    case 'B1_A5_TIMING': return { runner: 'V3', data: causal(prepared), audit: null };
    case 'B_VU_BUGS': return { runner: 'V4', data: causal(prepared), audit: null };
    case 'C_INDEPENDENT': { const x = K.applyEvents(prepared, census, independentDecision); return { runner: 'V4', data: causal(x.data), audit: x.audit }; }
    case 'D_UNRESOLVED_CUT': { const x = K.applyEvents(prepared, census, (ev) => independentDecision(ev) || 'CUT'); return { runner: 'V4', data: causal(x.data), audit: x.audit }; }
    case 'E_WHOLE_SERIES': { const x = K.dropQuarantined(causal(prepared)); return { runner: 'V4', data: x.data, audit: x.audit }; }
    case 'F_V4_FORENSIC_SANITY': { const c = M.sanity.priceSanityCensus(prepared.securities), x = M.sanity.applyPriceSanityQuarantine(prepared, c);
      return { runner: 'V4', data: causal(x.data), audit: { ...x.audit, affected: c.affected, defectQuarantined: c.defectQuarantined } }; }
    default: throw new Error('UNKNOWN_SCENARIO');
  }
}

export function measureMethod(M, prepared, methodId, census, { scenarios = SCENARIOS, log = () => {} } = {}) {
  const method = M.methods.historicalParticipants.find((m) => m.id === methodId);
  if (!method) throw new Error('ORIGINAL_HISTORICAL_METHOD_REQUIRED');
  const calendar = (prepared.benchmark?.bars || prepared.spyBars || []).map((b) => b.date);
  const bench = K.benchmarkMetrics(M, prepared), rows = {};
  for (const id of scenarios) {
    const t0 = Date.now(), sc = scenarioData(M, prepared, census, id);
    M.methods.prepareSourceFeatures(sc.data);
    const runner = sc.runner === 'V3' ? M.r3m : M.r4m;
    const run = runner.runMethod(sc.data, method, M.protocol, { measureSignals: false });
    if (run.reconciliation?.pass !== true) throw new Error('ACCOUNTING_RECONCILIATION_FAILED:' + id);
    rows[id] = { runner: sc.runner, metrics: K.runMetrics(M, run, sc.data), exposure: K.tradeExposure(run, census, calendar), audit: sc.audit, securities: sc.data.securities.length, seconds: Math.round((Date.now() - t0) / 1000) };
    log({ phase: 'SCENARIO_DONE', method: methodId, scenario: id, seconds: rows[id].seconds });
  }
  return { methodId, benchmark: bench, rows };
}

const pp = (a, b) => (K.finite(a) && K.finite(b) ? K.r1(100 * (a - b)) : null);
const dir = (x, spy) => (!K.finite(x) || !K.finite(spy) ? 'UNKNOWN' : x > spy ? 'ABOVE_SPY' : x < spy ? 'BELOW_SPY' : 'EQUAL_SPY');
/** Public view: no absolute performance number, only differences (percentage points, 0.1) and directions. */
export function publicView(res) {
  const A = res.rows.A_ORIGINAL?.metrics, B = res.rows.B_VU_BUGS?.metrics, spy = res.benchmark.cagr;
  const scenarios = {};
  for (const [id, r] of Object.entries(res.rows)) {
    const m = r.metrics, e = r.exposure;
    scenarios[id] = { runner: r.runner, securities: r.securities, audit: r.audit,
      cagrVsSpy: dir(m.cagr, spy), deltaVsA: { cagrPp: pp(m.cagr, A?.cagr), maxDrawdownPp: pp(m.maxDrawdown, A?.maxDrawdown), excessVsSpyPp: pp(m.cagr - spy, A?.cagr - spy), meanExposurePp: pp(m.meanExposure, A?.meanExposure), trades: m.trades - (A?.trades ?? 0) },
      deltaVsB: B ? { cagrPp: pp(m.cagr, B.cagr), maxDrawdownPp: pp(m.maxDrawdown, B.maxDrawdown) } : null,
      tradeExposure: { tradeRecords: e.tradeRecords, inEventSecurities: e.inEventSecurities, spanningEvent: e.spanningEvent, enteredWithin252AfterEvent: e.enteredWithin252AfterEvent,
        distinctEventSecuritiesTraded: e.distinctEventSecuritiesTraded, eventMonthsHeld: e.eventMonthsHeld, byClass: e.byClass,
        pnlSpanningShareOfFinalEquityPp: K.finite(m.finalEquity) && m.finalEquity > 0 ? K.r1(100 * e.pnlSpanning / m.finalEquity) : null },
      seconds: r.seconds };
  }
  return { methodId: res.methodId, scenarios, performanceNumbersPublished: 'DELTAS_AND_DIRECTIONS_ONLY' };
}

export function censusSummary(census) {
  const s = { events: 0, securities: census.size, byKind: {}, byClass: {}, byKindAndClass: {}, normalizable: 0 };
  for (const evs of census.values()) for (const e of evs) { s.events++; K.inc(s.byKind, e.kind); K.inc(s.byClass, e.label.cls); K.inc(s.byKindAndClass, e.kind + ':' + e.label.cls); if (independentDecision(e) === 'NORMALIZE') s.normalizable++; }
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = K.args(process.argv.slice(2));
  (async () => {
    const M = await K.loadModules(path.resolve(o['base-root']), path.resolve(o['v3-root']));
    const { raw, prepared } = K.loadCapture(M, o.capture);
    const sec = K.loadSec(o.sec), finra = K.loadFinra(o.finra, M.FDL);
    const census = K.labelledCensus(M, prepared, sec, finra);
    const res = measureMethod(M, prepared, o.method, census, { log: (x) => process.stdout.write(JSON.stringify(x) + '\n') });
    const bytes = Buffer.from(JSON.stringify({ schema: 'vu-root-cause-backtest-private-1.0.0', ...res }));
    const sealed = K.sealForOwner(M, bytes, path.join(o['sealed-dir'], `BACKTEST-IMPACT-${o.method}.owner.sealed.json`));
    K.writeJson(o['public-out'], { schema: 'vu-root-cause-backtest-public-1.0.0', version: K.VERSION, kind: 'DIAGNOSTIC_REPLAY_NOT_CERTIFYING', runId: process.env.GITHUB_RUN_ID ?? null,
      sourceDataFingerprint: raw.fingerprint, inputs: { secAvailable: sec.available, finraAvailable: finra.available, vendorUsed: false }, census: censusSummary(census), ...publicView(res), sealed });
  })().catch((e) => { process.stderr.write(JSON.stringify({ phase: 'ROOT_CAUSE_BACKTEST', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
