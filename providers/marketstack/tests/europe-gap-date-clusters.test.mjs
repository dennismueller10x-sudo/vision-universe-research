import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { classifyGapDates, buildRouteProbePlan, writeOutputs, POLICY } from '../../../scripts/marketstack/europe-gap-date-clusters.mjs';
const require = createRequire(import.meta.url);
const { documentedCoverage, actionEndpointCoverage } = require('../endpoint-coverage.js');

const sec = (n, mic, first = '2020-01-02') => ({ securityId: `ref_S${n}_${mic}`, ticker: `S${n}.X`, mic, firstRawDate: first, lastRawDate: '2026-10-09' });
const missing = (id, date, from = '2023-06-12', classification = 'PROVIDER_MISSING_DAY') => ({ securityId: id, gaps: [{ from, to: '2023-06-14', causes: [{ date, classification }] }] });
function fixture() {
  const inventory = { rows: [...Array.from({ length: 10 }, (_, i) => sec(i, 'XETR')), ...Array.from({ length: 2 }, (_, i) => sec(i, 'XSTO')),
    ...Array.from({ length: 5 }, (_, i) => sec(i, 'XPAR'))] };
  const rows = [];
  // XETR 2023-06-13: 9 of 10 absent -> market-wide, one security delivered.
  for (let i = 0; i < 9; i++) rows.push(missing(`ref_S${i}_XETR`, '2023-06-13'));
  // XPAR 2023-06-13: all five absent -> market-wide but calendar recheck.
  for (let i = 0; i < 5; i++) rows.push(missing(`ref_S${i}_XPAR`, '2023-06-13'));
  // XETR 2024-02-01: one security -> security specific.
  rows.push({ securityId: 'ref_S9_XETR', gaps: [{ from: '2024-01-31', to: '2024-02-02', causes: [{ date: '2024-02-01', classification: 'PROVIDER_MISSING_DAY' }] }] });
  // XSTO with two securities is too small to judge.
  rows.push(missing('ref_S0_XSTO', '2023-06-13'));
  // Quarantine is retained as another cause, never counted as provider-absent.
  rows.push({ securityId: 'ref_S9_XETR', gaps: [{ from: '2023-06-12', to: '2023-06-14', causes: [{ date: '2023-06-13', classification: 'QUARANTINED_SINGLE_BAR' }] }] });
  return { gaps: { rows }, inventory };
}

test('provider-absent sessions are split by market-wide share and reconcile exactly', () => {
  const r = classifyGapDates(fixture());
  assert.equal(r.providerAbsentSessions, 16);
  assert.deepEqual(Object.fromEntries(Object.entries(r.summary).map(([k, v]) => [k, v.sessions])), {
    MARKET_WIDE_PROVIDER_DATE_OMISSION: 14, SECURITY_SPECIFIC_PROVIDER_OMISSION: 1, SMALL_MIC_UNDETERMINED: 1 });
  const xetr = r.clusters.find(c => c.mic === 'XETR' && c.date === '2023-06-13');
  assert.equal(xetr.eligible, 10); assert.equal(xetr.otherRecordedGapCause, 1); assert.equal(xetr.calendarRecheck, true);
  assert.equal(xetr.marketWideMicsSameDate, 2);
  const xpar = r.clusters.find(c => c.mic === 'XPAR');
  assert.equal(xpar.calendarRecheck, true);
  for (const k of ['recoveredSessions', 'syntheticBars', 'quarantineReleased']) assert.equal(r[k], 0);
  assert.equal(r.causeEstablished, false);
});

test('a security outside its returned raw span is not eligible on that date', () => {
  const f = fixture(); f.inventory.rows[0].firstRawDate = '2024-01-01';
  const r = classifyGapDates(f);
  assert.equal(r.clusters.find(c => c.mic === 'XETR' && c.date === '2023-06-13').eligible, 9);
});

test('duplicate sessions and unknown securities are refused', () => {
  const f = fixture(); f.gaps.rows.push(missing('ref_S0_XETR', '2023-06-13'));
  assert.throws(() => classifyGapDates(f), /DUPLICATE_GAP_SESSION/);
  const g = fixture(); g.gaps.rows.push(missing('ref_UNKNOWN', '2023-06-13'));
  assert.throws(() => classifyGapDates(g), /GAP_SECURITY_OUTSIDE_INVENTORY/);
});

test('probe plan stays under the request cap, pairs every target with a positive control and never executes', () => {
  const plan = buildRouteProbePlan(classifyGapDates(fixture()));
  assert.ok(plan.requests <= POLICY.maxProbeRequests);
  assert.equal(plan.executed, false); assert.equal(plan.providerRequests, 0);
  for (const c of plan.clusterProbes) {
    assert.equal(c.requests.filter(r => r.purpose === 'GAP_ROUTE_TARGET').length, 3);
    assert.equal(c.requests.filter(r => r.purpose === 'GAP_ROUTE_POSITIVE_CONTROL').length, 3);
    assert.ok(c.controlDate < c.date);
    for (const r of c.requests) assert.ok(!/eod$/.test(r.endpoint) || r.params.date_from === undefined, 'only untried date-scoped routes');
  }
  assert.equal(plan.followUpIfConfirmed.sessions, 14);
  assert.equal(plan.followUpIfConfirmed.requests, 2);
});

test('outputs go only to an explicit directory outside repository data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-gap-clusters-'));
  try {
    const f = fixture();
    writeFileSync(join(dir, 'g.json'), JSON.stringify(f.gaps)); writeFileSync(join(dir, 'i.json'), JSON.stringify(f.inventory));
    const out = join(dir, 'out');
    const { manifest } = writeOutputs({ gapsPath: join(dir, 'g.json'), inventoryPath: join(dir, 'i.json'), out });
    assert.equal(Object.keys(manifest).length, 2);
    assert.ok(existsSync(join(out, 'europe_gap_route_probe_plan.json')));
    const again = writeOutputs({ gapsPath: join(dir, 'g.json'), inventoryPath: join(dir, 'i.json'), out: join(dir, 'out2') }).manifest;
    assert.deepEqual(again, manifest, 'deterministic bytes');
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    assert.throws(() => writeOutputs({ gapsPath: join(dir, 'g.json'), inventoryPath: join(dir, 'i.json'), out: join(repo, 'discover/data/europe/x') }), /OUTPUT_INSIDE_REPOSITORY_DATA_REFUSED/);
    assert.throws(() => writeOutputs({ gapsPath: join(dir, 'g.json'), inventoryPath: join(dir, 'i.json'), out: 'relative' }), /ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED/);
    assert.ok(JSON.parse(readFileSync(join(out, 'europe_gap_date_clusters.json'), 'utf8')).sources.gapsSha256);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('documented coverage: European MICs are outside /splits and /dividends, silence stays UNDOCUMENTED', () => {
  assert.equal(actionEndpointCoverage('splits', 'XETR').state, 'DOCUMENTED_NOT_COVERED');
  assert.equal(actionEndpointCoverage('dividends', 'XPAR').state, 'DOCUMENTED_NOT_COVERED');
  assert.equal(actionEndpointCoverage('splits', 'XNAS').state, 'UNDOCUMENTED');
  assert.equal(documentedCoverage('/tickers/{symbol}/splits', 'XETR').state, 'UNDOCUMENTED');
  assert.equal(documentedCoverage('/nope', 'XETR').reason, 'ENDPOINT_NOT_IN_CONTRACT');
  const c = actionEndpointCoverage('splits', 'XETR');
  assert.equal(c.absenceProven, false); assert.equal(c.coverageCertified, false);
  assert.match(c.quote, /NASDAQ, NYSE, NYSE ARCA, PINK, SHG, OTCQB, and BATS/);
});
