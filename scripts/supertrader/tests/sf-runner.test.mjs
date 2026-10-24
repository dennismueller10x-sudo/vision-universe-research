// Source-faithful research runner: gates (research-v1, snapshot, readiness), scenario set, sealed / public split,
// diagnostic metrics. Synthetic dataset only; the snapshot path itself is covered by snapshot.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runMethod, assertBacktestReady, publicView, SCENARIO_SET, codeSha256 } from '../source-faithful/runner/run-research.mjs';
import { computeDiagnosticMetrics, cagr, maxDrawdown } from '../source-faithful/runner/metrics.mjs';
import { FOUNDATION } from '../source-faithful/contract.mjs';

const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 }));
const flat = (n) => Array.from({ length: n }, () => [100, 105, 95, 100]);
const up = Array.from({ length: 30 }, (_, k) => [107 + k * 0.5, 108 + k * 0.5, 106 + k * 0.5, 107.5 + k * 0.5]);
const ds = () => { const b = bars([...flat(60), [100, 108, 104, 107], ...up, [117, 117.5, 115, 115.5]]); return { calendar: b.map((x) => x.date), securities: [{ id: 'A', bars: b, terminal: null }], spyTR: b.map((x, k) => ({ date: x.date, value: 1 + k * 0.001 })) }; };
const opts = { snapshotId: FOUNDATION.snapshotId, datasetSha256: 'd'.repeat(64), accounting: 'RESEARCH_V1', from: day(0), to: day(200) };

test('SF-RUN-GATES: research-v1 is mandatory; only DIAGNOSTIC_READY methods run', () => {
  assert.throws(() => runMethod('SF_TURTLE_S1', ds(), { ...opts, accounting: 'LEGACY' }), /RESEARCH_ACCOUNTING_REQUIRED/);
  assert.throws(() => assertBacktestReady('SF_DARVAS_BOX'), /METHOD_NOT_BACKTEST_READY/);
  assert.throws(() => assertBacktestReady('NOPE'), /UNKNOWN_METHOD/);
  assert.doesNotThrow(() => assertBacktestReady('SF_TURTLE_S1'));
  assert.doesNotThrow(() => assertBacktestReady('SF_TURTLE_S2'));
});

test('SF-RUN-RESULT: every scenario runs, reconciles and carries DIAGNOSTIC_NOT_CERTIFIED and a receipt', () => {
  const r = runMethod('SF_TURTLE_S1', ds(), opts);
  assert.equal(r.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
  assert.deepEqual(Object.keys(r.runs), SCENARIO_SET.map((s) => s.id));
  for (const v of Object.values(r.runs)) { assert.equal(v.reconciliation.pass, true); assert.equal(v.metrics.certification, 'DIAGNOSTIC_NOT_CERTIFIED'); }
  assert.equal(r.receipt.snapshotId, FOUNDATION.snapshotId);
  assert.equal(r.receipt.accounting, 'RESEARCH_V1');
  assert.equal(r.receipt.codeSha256, codeSha256());
  // double costs never improve the base result
  assert.ok(r.runs.COST2_S1.metrics.cagr <= r.runs.DELIST_S1_MINUS_30.metrics.cagr + 1e-12);
  // deterministic: the same inputs give the same receipt and ledgers
  const r2 = runMethod('SF_TURTLE_S1', ds(), opts);
  assert.equal(r2.receipt.receiptSha256, r.receipt.receiptSha256);
  assert.equal(r2.runs.BASE_S0.ledgerSha256, r.runs.BASE_S0.ledgerSha256);
});

test('SF-RUN-PUBLIC: the public view carries hashes, counts and flags only (no prices, no metrics)', () => {
  const p = publicView(runMethod('SF_TURTLE_S2', ds(), opts));
  const text = JSON.stringify(p);
  assert.doesNotMatch(text, /cagr|sharpe|equity|price|drawdown|return/i);
  assert.match(p.receiptSha256, /^[0-9a-f]{64}$/);
});

test('SF-METRICS: CAGR, drawdown, Sharpe / Sortino, win rate, profit factor, turnover and cost burden on a known curve', () => {
  const curve = [{ date: '2020-01-01', equity: 100, exposure: 1 }, { date: '2020-07-01', equity: 120, exposure: 1 }, { date: '2021-01-01', equity: 90, exposure: 0 }, { date: '2022-01-01', equity: 121, exposure: 0.5 }];
  assert.ok(Math.abs(maxDrawdown(curve) - (90 / 120 - 1)) < 1e-12);
  const years = (Date.parse('2022-01-01') - Date.parse('2020-01-01')) / (365.25 * 864e5);
  assert.ok(Math.abs(cagr(curve) - ((121 / 100) ** (1 / years) - 1)) < 1e-12);
  const m = computeDiagnosticMetrics({ curve, trades: [{ pnl: 30, heldSessions: 5 }, { pnl: -10, heldSessions: 3 }, { pnl: 10, heldSessions: 9 }], ledger: [{ side: 'BUY', gross: 100 }, { side: 'SELL', gross: 110 }, { side: 'DIVIDEND', gross: 1 }], costs: 2 });
  assert.equal(m.winRate, 2 / 3);
  assert.equal(m.profitFactor, 4);
  assert.equal(m.medianHoldingSessions, 5);
  assert.ok(Math.abs(m.turnover - 210 / 107.75 / years) < 1e-9);
  assert.ok(Math.abs(m.costBurden - 2 / 107.75 / years) < 1e-9);
  assert.ok(Number.isFinite(m.sharpe) && Number.isFinite(m.sortino));
  assert.equal(m.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
});

test('SF-RUN-WORKFLOW: sf-research runs only with a snapshot and research-v1 and seals its result', async () => {
  const fs = await import('node:fs');
  const y = fs.readFileSync(new URL('../../../.github/workflows/supertrader-validation.yml', import.meta.url), 'utf8');
  assert.match(y, /SF_RESEARCH_REQUIRES_SNAPSHOT_AND_RESEARCH_V1/);
  assert.match(y, /run-research\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  assert.match(y, /sf-research\|sf-research-smoke\|sf3-research\|sf3-research-smoke\|sf4-lifecycle\|sf4-lifecycle-smoke\|sf5-lifecycle\|sf5-lifecycle-smoke\|sf6-integrity\|sf6-integrity-smoke\|kk-intraday\|kk-intraday-count\|kk-intraday-smoke\) ;;/);
  // Supertrader 3.0 research runner, 4.0 and 5.0 lifecycle runners: same fail-closed conditions, sealed result
  assert.match(y, /case "\$MODE" in sf-research\|sf-research-smoke\|sf3-research\|sf3-research-smoke\|sf4-lifecycle\|sf4-lifecycle-smoke\|sf5-lifecycle\|sf5-lifecycle-smoke\|sf6-integrity\|sf6-integrity-smoke\|kk-intraday\|kk-intraday-count\|kk-intraday-smoke\)\n\s+if \[ -z "\$snap" \] \|\| \[ "\$acc" != research-v1 \]/);
  // Kullamaegi EP / PS chart-first runner: same fail-closed snapshot conditions, request budget capped, sealed result
  assert.match(y, /run-kk-intraday\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  assert.match(y, /KK_MAX_REQUESTS_ABOVE_6000/);
  const rk = fs.readFileSync(new URL('../source-faithful/research/run-kk-intraday.mjs', import.meta.url), 'utf8');
  assert.match(rk, /requireRestoreReceipt: true/); assert.match(rk, /encryptForOwner/);
  assert.match(y, /run-sf5-lifecycle\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  // Supertrader 6.0 V4-D1 containment runner: same fail-closed snapshot conditions, sealed result
  assert.match(y, /run-sf6-integrity\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  const ri = fs.readFileSync(new URL('../source-faithful/research/run-sf6-integrity.mjs', import.meta.url), 'utf8');
  assert.match(ri, /requireRestoreReceipt: true/); assert.match(ri, /encryptForOwner/);
  const r5 = fs.readFileSync(new URL('../source-faithful/research/run-sf5-lifecycle.mjs', import.meta.url), 'utf8');
  assert.match(r5, /requireRestoreReceipt: true/); assert.match(r5, /encryptForOwner/);
  assert.match(y, /run-sf3-research\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  assert.match(y, /run-sf4-lifecycle\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  const r4 = fs.readFileSync(new URL('../source-faithful/research/run-sf4-lifecycle.mjs', import.meta.url), 'utf8');
  assert.match(r4, /requireRestoreReceipt: true/);
  assert.match(r4, /encryptForOwner/);
  const r3 = fs.readFileSync(new URL('../source-faithful/research/run-sf3-research.mjs', import.meta.url), 'utf8');
  assert.match(r3, /requireRestoreReceipt: true/);
  assert.match(r3, /encryptForOwner/);
  const r = fs.readFileSync(new URL('../source-faithful/runner/run-research.mjs', import.meta.url), 'utf8');
  assert.match(r, /requireRestoreReceipt: true/);
  assert.match(r, /encryptForOwner/);
});

test('SF-RUN-COMPONENT: Darvas runs only as a component signal study, labelled as not a method return', async () => {
  const { componentStudy, assertComponentStudy } = await import('../source-faithful/runner/run-research.mjs');
  assert.throws(() => assertBacktestReady('SF_DARVAS_BOX'), /METHOD_NOT_BACKTEST_READY/);
  assert.doesNotThrow(() => assertComponentStudy('SF_DARVAS_BOX'));
  assert.throws(() => assertComponentStudy('SF_TURTLE_S1'), /METHOD_NOT_COMPONENT_STUDY/);
  const hl = (h, l) => [(h + l) / 2, h, l, (h + l) / 2];
  const rows = [...Array.from({ length: 25 }, () => hl(10.5, 9.5)), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(11.8, 10.9), hl(11.9, 11), hl(11.2, 10.5), hl(11.4, 10.7), hl(11.3, 10.6), hl(11.6, 10.8), [12, 12.5, 12.05, 12.4], hl(12.6, 12.1), hl(12, 11.5)];
  const b = rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 2e5, rawClose: c, rawVolume: 2e5, splitAdj: 1, dividend: 0 }));
  const r = componentStudy('SF_DARVAS_BOX', { calendar: b.map((x) => x.date), securities: [{ id: 'X', bars: b }] }, opts);
  assert.equal(r.label, 'COMPONENT_SIGNAL_STUDY_NOT_A_METHOD_RETURN');
  assert.equal(r.stats.signals, 1);
  assert.ok(r.stats.base.mean < 0); // stopped at 11.99 after entry at 12.01, net of costs
  assert.deepEqual(r.stats.endStates, { CLOSED: 1 });
  assert.ok(r.dataFindings[0].startsWith('V4-D1'));
  assert.throws(() => componentStudy('SF_DARVAS_BOX', { calendar: [], securities: [] }, { ...opts, datasetSha256: null }), /DATASET_SHA_REQUIRED/);
  assert.doesNotMatch(JSON.stringify(publicView(r)), /"(mean|median|hitRate|stats|ret|p05|p95)"/);
});

test('SF-RUN-COMPONENT-DELISTING: a component trade open at an inactive listing is settled by the delisting scenario (review SF-R3-03)', async () => {
  const { componentStudy } = await import('../source-faithful/runner/run-research.mjs');
  const hl = (h, l) => [(h + l) / 2, h, l, (h + l) / 2];
  const rows = [...Array.from({ length: 25 }, () => hl(10.5, 9.5)), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(11.8, 10.9), hl(11.9, 11), hl(11.2, 10.5), hl(11.4, 10.7), hl(11.3, 10.6), hl(11.6, 10.8), [12, 12.5, 12.05, 12.4], hl(12.6, 12.1)];
  const b = rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 2e5, rawClose: c, rawVolume: 2e5, splitAdj: 1, dividend: 0 }));
  const r = componentStudy('SF_DARVAS_BOX', { calendar: b.map((x) => x.date), securities: [{ id: 'X', bars: b, terminal: { date: b.at(-1).date, cause: 'LISTING_INACTIVE' } }] }, opts);
  assert.deepEqual(r.stats.endStates, { OPEN_AT_DELISTING: 1 });
  assert.ok(r.stats.delistingMinus30.mean < r.stats.base.mean);
});
