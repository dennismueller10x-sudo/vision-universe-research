// Synthetic tests for the root-cause / backtest-impact diagnostics. They need the pinned research checkouts:
// ROOT_CAUSE_BASE_ROOT (#705 head) and ROOT_CAUSE_V3_ROOT (#758 head). Without them the tests are skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as K from '../lib.mjs';
import { scenarioData, measureMethod, publicView, censusSummary, SCENARIOS } from '../backtest-impact.mjs';

const BASE = process.env.ROOT_CAUSE_BASE_ROOT, V3 = process.env.ROOT_CAUSE_V3_ROOT;
const ready = BASE && V3 && fs.existsSync(path.join(BASE, 'scripts/supertrader/research/tournament/methods.mjs'));
const skip = ready ? false : 'pinned research checkouts not provided';

async function fixture() {
  const M = await K.loadModules(BASE, V3);
  const { syntheticData } = await import(pathToFileURL(path.join(BASE, 'scripts/supertrader/tests/v4-fixtures.mjs')).href);
  const data = syntheticData({ n: 24 });
  /* security 3: undeclared 1:10 reverse split on day 900, SEC share count drops 10x across it (independent confirmation) */
  const s = data.securities[3], k = 900, d = s.bars[k].date;
  s.bars = s.bars.map((b, j) => (j < k ? b : { ...b, rawClose: b.rawClose * 10, rawOpen: b.rawOpen * 10, rawHigh: b.rawHigh * 10, rawLow: b.rawLow * 10, close: b.close * 10, open: b.open * 10, high: b.high * 10, low: b.low * 10,
    totalReturnIndex: b.totalReturnIndex * 10, rawVolume: b.rawVolume / 10, volume: b.volume / 10 }));
  s.fundamentals = [{ key: 'shares_outstanding', value: 5e7, availableAt: s.bars[k - 40].date, periodEnd: s.bars[k - 40].date }, { key: 'shares_outstanding', value: 5e6, availableAt: s.bars[k + 40].date, periodEnd: s.bars[k + 40].date }];
  /* security 5: undeclared x12 jump without any independent channel */
  const u = data.securities[5], k2 = 1200;
  u.bars = u.bars.map((b, j) => (j < k2 ? b : { ...b, rawClose: b.rawClose * 12, close: b.close * 12, open: b.open * 12, high: b.high * 12, low: b.low * 12, rawOpen: b.rawOpen * 12, totalReturnIndex: b.totalReturnIndex * 12 }));
  return { M, data, eventDate: d, ids: [s.id, u.id] };
}

test('census finds both injected jumps and labels them from independent channels only', { skip }, async () => {
  const { M, data, eventDate, ids } = await fixture();
  const census = K.labelledCensus(M, data, { byCik: {} }, { bySym: new Map(), available: false });
  assert.deepEqual([...census.keys()].sort(), [...ids].sort());
  const a = census.get(ids[0])[0], b = census.get(ids[1])[0];
  assert.equal(a.date, eventDate); assert.equal(a.kind, 'UNDECLARED_RAW_JUMP_10X');
  assert.equal(a.label.cls, 'CONFIRMED_BY_INDEPENDENT_SOURCE'); assert.equal(a.label.shares, 'CONFIRMS'); assert.equal(a.label.statedRatio, null);
  assert.equal(b.label.cls, 'INSUFFICIENT_EVIDENCE');
  const sum = censusSummary(census); assert.equal(sum.events, 2); assert.equal(sum.normalizable, 0);
});

test('normalization with a stated ratio removes the jump exactly like a declared split', { skip }, async () => {
  const { data, ids } = await fixture();
  const s = data.securities.find((x) => x.id === ids[0]), k = s.bars.findIndex((b) => b.totalReturnIndex / (s.bars[s.bars.indexOf(b) - 1]?.totalReturnIndex ?? b.totalReturnIndex) > 5);
  const n = K.normalizeAt(s, k, 0.1);
  const g = n.bars[k].totalReturnIndex / n.bars[k - 1].totalReturnIndex, p = n.bars[k].close / n.bars[k - 1].close;
  assert.ok(Math.abs(Math.log(g)) < Math.log(1.2)); assert.ok(Math.abs(Math.log(p)) < Math.log(1.2));
  assert.equal(n.bars[k - 1].rawClose, s.bars[k - 1].rawClose, 'raw columns stay raw');
  assert.equal(n.bars[k].totalReturnIndex, s.bars[k].totalReturnIndex, 'bars from the event on are untouched');
});

test('cut reproduces the tournament quarantine shape and the causal terminal follows it', { skip }, async () => {
  const { M, data, ids } = await fixture();
  const census = K.labelledCensus(M, data, { byCik: {} }, { bySym: new Map(), available: false });
  const x = K.applyEvents(data, census, () => 'CUT');
  const s = x.data.securities.find((y) => y.id === ids[1]), ev = census.get(ids[1])[0];
  assert.equal(s.bars.at(-1).date < ev.date, true); assert.equal(s.dataQuarantine.from, ev.date); assert.equal(s.terminal.kind, 'DATA_QUARANTINE');
  const c = M.policy.applyCausalTerminals(x.data).data.securities.find((y) => y.id === ids[1]);
  assert.equal(c.terminal.date, ev.date);
  assert.equal(x.audit.cut, 2);
});

test('every scenario runs, reconciles, and the public view carries no absolute performance number', { skip }, async () => {
  const { M, data } = await fixture();
  const census = K.labelledCensus(M, data, { byCik: {} }, { bySym: new Map(), available: false });
  for (const id of SCENARIOS) assert.ok(scenarioData(M, data, census, id).data.securities.length > 0);
  const res = measureMethod(M, data, 'cross_sectional_momentum', census);
  const pub = publicView(res);
  assert.deepEqual(Object.keys(pub.scenarios), SCENARIOS);
  assert.equal(pub.scenarios.A_ORIGINAL.deltaVsA.cagrPp, 0);
  const text = JSON.stringify(pub);
  for (const r of Object.values(res.rows)) { assert.equal(text.includes(String(r.metrics.cagr)), false); assert.equal(text.includes(String(r.metrics.finalEquity)), false); }
  assert.match(pub.scenarios.A_ORIGINAL.cagrVsSpy, /SPY/);
});

test('population stage joins populations, reads the provider locus and runs the French variants on synthetic inputs', { skip }, async () => {
  const os = await import('node:os'), zlib = await import('node:zlib');
  const { runPopulation, providerLocus } = await import('../population.mjs');
  const { M, data, ids } = await fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-')), ca = path.join(dir, 'ca'); fs.mkdirSync(path.join(ca, 'raw'), { recursive: true });
  const U = data.securities.map((s) => ({ id: s.id, ticker: s.ticker, securityId: 'ref_' + s.ticker, cik: null, listing: s.listing }));
  const scan = data.securities.map((s, i) => {
    /* provider store: raw close and an adjustedClose that moves with the raw close (no event in either column) */
    const rb = s.bars.map((b) => ({ date: b.date, close: b.rawClose, open: b.rawOpen, volume: b.rawVolume, splitFactor: 1, dividend: 0, adjustedClose: b.rawClose }));
    fs.writeFileSync(path.join(ca, 'raw', `${i}.json.gz`), zlib.gzipSync(JSON.stringify(rb)));
    return { i, bars: rb.length };
  });
  const evDate = K.censusOf(data.securities.find((s) => s.id === ids[0]))[0].date;
  fs.writeFileSync(path.join(ca, 'universe.json'), JSON.stringify({ universe: U }));
  fs.writeFileSync(path.join(ca, 'population.json'), JSON.stringify({ extreme: [{ id: ids[0], month: evDate.slice(0, 7), cls: 'UNDECLARED_RAW_JUMP_10X', in83: true }], highIds: [] }));
  fs.writeFileSync(path.join(ca, 'scan.json'), JSON.stringify(scan));
  fs.writeFileSync(path.join(ca, 'evaluate.json'), JSON.stringify({ k83: [{ key: ids[0] + '|' + evDate.slice(0, 7), cls: 'UNDECLARED_RAW_JUMP_10X', cause: 'UNDECLARED_REVERSE_SPLIT', defect: true, dominantDay: evDate, v3ValidReturn: false, v3StillExtreme: false }],
    d2: [], extreme272: [{ segmentId: ids[0], date: evDate, dir: 'UP', ratio: 10, independent: 'CONFIRMED_EVENT', v3: 'NOT_IN_VALID_RETURN' }], holds: [] }));
  const months = M.cons.buildConstructions(data, {}).months;
  const oracle = { EW_MARKET: months.map((m) => ({ month: m.month, ret: m.EW_MARKET.ret, firms: m.EW_MARKET.count })),
    MOM_12_2_EW_DECILES: months.filter((m) => m.MOM_12_2_EW_DECILES.status === 'READY').map((m) => ({ month: m.month, buckets: m.MOM_12_2_EW_DECILES.buckets, firms: m.MOM_12_2_EW_DECILES.counts })),
    VAR_60D_EW_QUINTILES: months.filter((m) => m.VAR_60D_EW_QUINTILES.status === 'READY').map((m) => ({ month: m.month, buckets: m.VAR_60D_EW_QUINTILES.buckets, firms: m.VAR_60D_EW_QUINTILES.counts })) };
  const pub = await runPopulation({ 'base-root': BASE, 'v3-root': V3, ca, 'public-out': path.join(dir, 'pub.json'), 'sealed-dir': path.join(dir, 'sealed'), _loaded: { raw: { fingerprint: 'synthetic', coverage: {} }, prepared: data }, _oracle: oracle });
  assert.equal(pub.populations.V4_83_SECURITY_MONTHS.securityMonths, 1);
  assert.equal(pub.populations.TOURNAMENT_CENSUS_EVENTS.segmentsListings, 2);
  assert.equal(pub.overlaps['V4_83_SECURITY_MONTHS&V2_272_EXTREME_MOVES'], 1);
  assert.equal(pub.eventStats.byProviderLocus.PROVIDER_NO_EVENT_IN_EITHER_COLUMN, 2);
  assert.equal(pub.cases83.byCauseAndIndependent['UNDECLARED_REVERSE_SPLIT|CONFIRMED_BY_INDEPENDENT_SOURCE'], 1);
  assert.ok(pub.french.ewExclusionVariants.BASELINE.correlation > 0.99, 'identity oracle');
  assert.ok(fs.existsSync(path.join(dir, 'sealed', 'POPULATION-CASES.owner.sealed.json')));
  assert.equal(JSON.stringify(pub).includes(data.securities[3].ticker), false, 'no identities in the public file');
  assert.equal(providerLocus([{ date: 'a', close: 1, adjustedClose: 1 }, { date: 'b', close: 10, adjustedClose: 1 }], 'b'), 'PROVIDER_COLUMNS_DISAGREE_ADJ_CONTINUOUS');
});

test('rank table: higher CAGR/Sharpe and shallower drawdown rank first; changes are detected', async () => {
  const { rankTable } = await import('../ranking.mjs');
  const row = (cagr, sharpe, maxDrawdown) => ({ metrics: { cagr, sharpe, maxDrawdown } });
  const results = { m1: { benchmark: { cagr: 0.1 }, rows: { A_ORIGINAL: row(0.05, 0.3, -0.4), B_VU_BUGS: row(0.05, 0.3, -0.4), C_INDEPENDENT: row(0.05, 0.3, -0.4) } },
    m2: { benchmark: { cagr: 0.1 }, rows: { A_ORIGINAL: row(0.02, 0.5, -0.2), B_VU_BUGS: row(0.02, 0.5, -0.2), C_INDEPENDENT: row(0.12, 0.5, -0.2) } } };
  const t = rankTable(results);
  assert.deepEqual(t.A_ORIGINAL.cagr, { m1: 1, m2: 2 }); assert.deepEqual(t.A_ORIGINAL.maxDrawdown, { m2: 1, m1: 2 });
  assert.equal(t.changes.cagr.A_to_B, false); assert.equal(t.changes.cagr.A_to_C, true); assert.equal(t.C_INDEPENDENT.aboveSpy.m2, true);
});
