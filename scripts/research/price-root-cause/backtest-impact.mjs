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

export const SCENARIOS = ['A_ORIGINAL', 'B1_A5_TIMING', 'B_VU_BUGS', 'C_INDEPENDENT', 'C2_STRICT', 'C3_STRICT_NORMALIZE_ONLY', 'D_UNRESOLVED_CUT', 'E_WHOLE_SERIES', 'F_V4_FORENSIC_SANITY'];

/* strict variant (review IR-03/04/05): only strictly confirmed events; C3 applies stated-ratio normalisations only (no
   ex-post cut at an unexecutable pre-event close, review IR-09) */
const strictDecision = (ev) => (ev.label.strictCls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE' ? null : ev.kind === 'UNDECLARED_RAW_JUMP_10X' && K.finite(ev.label.statedRatio) ? 'NORMALIZE' : 'CUT');
const strictNormalizeOnly = (ev) => (strictDecision(ev) === 'NORMALIZE' ? 'NORMALIZE' : null);
const independentDecision = (ev) => (ev.label.cls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE' ? null
  : ev.kind === 'UNDECLARED_RAW_JUMP_10X' && K.finite(ev.label.statedRatio) ? 'NORMALIZE' : 'CUT');

/** Scenario datasets in a fixed order; each returns {runner, data, audit}. Pure apart from source features. */
export function scenarioData(M, prepared, census, id) {
  const causal = (d) => M.policy.applyCausalTerminals(d).data;
  switch (id) {
    case 'A_ORIGINAL': return { runner: 'V3', data: prepared, audit: null };
    case 'B1_A5_TIMING': { const c = M.policy.applyCausalTerminals(prepared); return { runner: 'V3', data: c.data, audit: c.audit }; }
    case 'B_VU_BUGS': { const c = M.policy.applyCausalTerminals(prepared); return { runner: 'V4', data: c.data, audit: c.audit }; }
    case 'C2_STRICT': { const x = K.applyEvents(prepared, census, strictDecision); return { runner: 'V4', data: causal(x.data), audit: x.audit }; }
    case 'C3_STRICT_NORMALIZE_ONLY': { const x = K.applyEvents(prepared, census, strictNormalizeOnly); return { runner: 'V4', data: causal(x.data), audit: x.audit }; }
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
/* coarse gap to SPY (review IR-16): only the bucket, never the value */
const bucket = (x, spy) => { if (!K.finite(x) || !K.finite(spy)) return 'UNKNOWN'; const g = 100 * (x - spy); return g >= 0 ? 'AT_OR_ABOVE_SPY' : g > -1 ? 'BELOW_0_TO_1PP' : g > -5 ? 'BELOW_1_TO_5PP' : 'BELOW_MORE_THAN_5PP'; };
const dir = (x, spy) => (!K.finite(x) || !K.finite(spy) ? 'UNKNOWN' : x > spy ? 'ABOVE_SPY' : x < spy ? 'BELOW_SPY' : 'EQUAL_SPY');
/** Public view: no absolute performance number, only differences (percentage points, 0.1) and directions. */
export function publicView(res) {
  const A = res.rows.A_ORIGINAL?.metrics, B = res.rows.B_VU_BUGS?.metrics, Cm = res.rows.C_INDEPENDENT?.metrics, C2 = res.rows.C2_STRICT?.metrics, spy = res.benchmark.cagr;
  const scenarios = {};
  for (const [id, r] of Object.entries(res.rows)) {
    const m = r.metrics, e = r.exposure;
    scenarios[id] = { runner: r.runner, securities: r.securities, audit: r.audit,
      cagrVsSpy: dir(m.cagr, spy), deltaVsA: { cagrPp: pp(m.cagr, A?.cagr), maxDrawdownPp: pp(m.maxDrawdown, A?.maxDrawdown), excessVsSpyPp: pp(m.cagr - spy, A?.cagr - spy), meanExposurePp: pp(m.meanExposure, A?.meanExposure), trades: m.trades - (A?.trades ?? 0) },
      deltaVsB: B ? { cagrPp: pp(m.cagr, B.cagr), maxDrawdownPp: pp(m.maxDrawdown, B.maxDrawdown), trades: m.trades - (B.trades ?? 0) } : null,
      deltaVsC: Cm ? { cagrPp: pp(m.cagr, Cm.cagr), maxDrawdownPp: pp(m.maxDrawdown, Cm.maxDrawdown) } : null,
      deltaVsC2: C2 ? { cagrPp: pp(m.cagr, C2.cagr), maxDrawdownPp: pp(m.maxDrawdown, C2.maxDrawdown) } : null,
      cagrGapToSpyBucket: bucket(m.cagr, spy), sharpeVsSpy: dir(m.sharpe, res.benchmark.sharpe).replace('SPY', 'SPY_SHARPE'),
      tradeExposure: { tradeRecords: e.tradeRecords, inEventSecurities: e.inEventSecurities, spanningEvent: e.spanningEvent, enteredWithin252AfterEvent: e.enteredWithin252AfterEvent,
        distinctEventSecuritiesTraded: e.distinctEventSecuritiesTraded, eventMonthsHeld: e.eventMonthsHeld, byClass: e.byClass, byStrictClassChannelDirection: e.byStrictClass,
        pnlSpanningShareOfFinalEquityPp: K.finite(m.finalEquity) && m.finalEquity > 0 ? K.r1(100 * e.pnlSpanning / m.finalEquity) : null },
      seconds: r.seconds };
  }
  return { methodId: res.methodId, scenarios, performanceNumbersPublished: 'DELTAS_AND_DIRECTIONS_ONLY' };
}

export function censusSummary(census) {
  const s = { events: 0, securities: census.size, byKind: {}, byClass: {}, byStrictClass: {}, byKindAndClass: {}, byChannel: {}, residualOfStatedRatio: {}, residualOfShareCount: {}, strictByKindChannelDirection: {}, normalizable: 0, normalizableStrict: 0, strictConfirmedSecurities: 0, strictConfirmedUndeclaredUp: 0 };
  const strictSec = new Set();
  for (const [id, evs] of census) for (const e of evs) {
    s.events++; K.inc(s.byKind, e.kind); K.inc(s.byClass, e.label.cls); K.inc(s.byStrictClass, e.label.strictCls); K.inc(s.byKindAndClass, e.kind + ':' + e.label.cls);
    if (e.label.channel) K.inc(s.byChannel, e.label.channel + (e.label.channel === 'FINRA' ? '_SYMBOL_MATCH_ONLY' : ''));
    if (K.finite(e.label.sharesResidual)) K.inc(s.residualOfShareCount, e.label.sharesResidual <= 1.25 ? 'LE_1.25' : e.label.sharesResidual <= 2 ? '1.25_TO_2' : 'GT_2');
    K.inc(s.strictByKindChannelDirection, e.kind + '|' + e.label.strictCls + '|' + (e.label.channel ?? 'NONE') + '|' + e.label.direction);
    if (e.label.strictCls === 'CONFIRMED_BY_INDEPENDENT_SOURCE' && e.kind === 'UNDECLARED_RAW_JUMP_10X' && e.label.direction === 'UP') s.strictConfirmedUndeclaredUp++;
    if (K.finite(e.label.residual)) K.inc(s.residualOfStatedRatio, e.label.residual <= 1.25 ? 'LE_1.25' : e.label.residual <= 2 ? '1.25_TO_2' : 'GT_2');
    if (independentDecision(e) === 'NORMALIZE') s.normalizable++; if (strictDecision(e) === 'NORMALIZE') s.normalizableStrict++;
    if (e.label.strictCls === 'CONFIRMED_BY_INDEPENDENT_SOURCE') strictSec.add(id);
  }
  s.strictConfirmedSecurities = strictSec.size;
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = K.args(process.argv.slice(2));
  (async () => {
    const M = await K.loadModules(path.resolve(o['base-root']), path.resolve(o['v3-root']));
    const { raw, prepared } = K.loadCapture(M, o.capture);
    K.expectFingerprint(o['expect-fingerprint'], raw);
    const sec = K.loadSec(o.sec), finra = K.loadFinra(o.finra, M.FDL);
    const census = K.labelledCensus(M, prepared, sec, finra);
    const res = measureMethod(M, prepared, o.method, census, { log: (x) => process.stdout.write(JSON.stringify(x) + '\n') });
    const bytes = Buffer.from(JSON.stringify({ schema: 'vu-root-cause-backtest-private-1.0.0', ...res }));
    const sealed = K.sealForOwner(M, bytes, path.join(o['sealed-dir'], `BACKTEST-IMPACT-${o.method}.owner.sealed.json`));
    K.writeJson(o['public-out'], { schema: 'vu-root-cause-backtest-public-1.0.0', version: K.VERSION, kind: 'DIAGNOSTIC_REPLAY_NOT_CERTIFYING', runId: process.env.GITHUB_RUN_ID ?? null,
      sourceDataFingerprint: raw.fingerprint, inputs: { secAvailable: sec.available, finraAvailable: finra.available, vendorUsed: false }, census: censusSummary(census), ...publicView(res), sealed });
  })().catch((e) => { process.stderr.write(JSON.stringify({ phase: 'ROOT_CAUSE_BACKTEST', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
