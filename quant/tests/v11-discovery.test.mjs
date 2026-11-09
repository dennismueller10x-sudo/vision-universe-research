import crypto from 'node:crypto';
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
const require = createRequire(import.meta.url);
const L = require('../../scripts/quant/v11/discovery/lib.cjs');
const R = require('../../scripts/quant/v11/discovery/rules.cjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DOCS = 'docs/quant-recovery/v11/discovery/';

function weeks(n, start = Date.UTC(2000, 0, 7)) { const out = []; for (let i = 0; i < n; i++) out.push(new Date(start + i * 7 * 86400000).toISOString().slice(0, 10)); return out; }
function series(seed, n, drift = 0.002) { let s = seed, p = 20; const out = []; for (let i = 0; i < n; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; p *= 1 + drift + (s / 4294967296 - 0.5) * 0.12; out.push(Math.round(p * 1e4) / 1e4); } return out; }
// Synthetic context: 30 listings, one ends early (series end -> forced exit), weekly calendar, SPY.
function synthetic() {
  const T = 260, cal = weeks(T), listings = [];
  for (let i = 0; i < 30; i++) {
    const cal0 = i % 5 === 0 ? 10 : 0, last = i === 7 ? 150 : T - 1;
    const closes = Float64Array.from(series(1000 + i * 77, last - cal0 + 1, 0.001 + i * 0.0001));
    listings.push({ i, id: 'ref_S' + i, listingId: 'tiingo:NASDAQ:S' + i + ':1990-01-01', mic: 'XNAS', listingStart: cal[0], cal0, n: closes.length, last, closes, rawFactor: new Float64Array(closes.length).fill(1), lifecycle: i === 7 ? { terminalKind: 'UNKNOWN' } : null });
  }
  const spy = Float64Array.from(series(4242, T, 0.0015));
  const byDate = new Map(cal.map((d, k) => [d, spy[k]]));
  return { cal, T, calIndex: new Map(cal.map((d, i) => [d, i])), spy, listings, byId: new Map(listings.map(l => [l.id, l])), bench: { byDate, provenance: { sourceBytesHash: 'a'.repeat(64) } }, manifestHash: 'b'.repeat(64) };
}

test('protocol hash file matches the protocol (R1-R6 binding)', () => {
  assert.equal(L.protocolHash(), '1ff32b61853a1c19ca96b36a9e045a55bbec5f1ae60d1b5a14e9f9a7bc200a69');
});

test('simulator equals research-portfolio ledger (FULL, BUFFER, RUN, forced exit at series end)', () => {
  const ctx = synthetic();
  for (const spec of [{ family: 'PRICE', ranks: [['r12_1', 1, 1]], positions: 5, rebalanceWeeks: 4, holding: 'FULL', weighting: 'EW' },
    { family: 'PRICE', ranks: [['r6', 1, 1], ['r1', -1, 0.5]], positions: 5, rebalanceWeeks: 4, holding: 'BUFFER', keepRankPct: 0.8, weighting: 'INVVOL' },
    { family: 'PRICE', ranks: [['slope_r2', 1, 1]], positions: 6, rebalanceWeeks: 4, holding: 'RUN', entryRankPct: 0.8, exitRankPct: 0.4, trendExit: true }]) {
    const sch = R.schedule(ctx, spec, ctx.cal[60], ctx.cal[220]);
    const sim = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base });
    const e = L.runEngine(ctx, sim, L.COSTS.base, sch.decisions[0], sch.endExec);
    assert.ok(e.parity.identicalWithin1e9, JSON.stringify(e.parity));
    assert.ok(sim.equity.every(x => x.value > 0));
  }
});

test('forced exit at the series end and delisting bounds', () => {
  const ctx = synthetic();
  const spec = { family: 'PRICE', ranks: [], positions: 30, rebalanceWeeks: 4, holding: 'FULL', weighting: 'EW', selectAll: true };
  const sch = R.schedule(ctx, spec, ctx.cal[60], ctx.cal[220]);
  const a = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base });
  const b = L.simulate(ctx, R.makeStrategy(ctx, spec), { ...sch, costs: L.COSTS.base, delistValue: 'MINUS_100' });
  assert.equal(a.exits.filter(x => x.forced).length, 1);
  assert.ok(b.equity.at(-1).value < a.equity.at(-1).value);
});

test('features read closes up to the decision week only (no look-ahead)', () => {
  const ctx = synthetic(), j = 120;
  const f1 = L.featuresAt(ctx, j).find(r => r.id === 'ref_S3');
  const l = ctx.byId.get('ref_S3'); const saved = Float64Array.from(l.closes);
  for (let k = j + 1 - l.cal0; k < l.closes.length; k++) l.closes[k] *= 3; ctx._feat = new Map();
  const f2 = L.featuresAt(ctx, j).find(r => r.id === 'ref_S3');
  l.closes.set(saved);
  for (const k of ['r12_1', 'r6', 'r3', 'r1', 'vol', 'r2', 'slope', 'hi52', 'sma40', 'beta']) assert.equal(f1[k], f2[k], k);
});

test('pctRank uses midranks and direction', () => {
  const r = L.pctRank([{ x: 1 }, { x: 2 }, { x: 2 }, { x: 5 }], 'x');
  assert.deepEqual(Array.from(r), [0.125, 0.5, 0.5, 0.875]);
  assert.deepEqual(Array.from(L.pctRank([{ x: 1 }, { x: 5 }], 'x', -1)), [0.75, 0.25]);
});

test('oracle uses future returns only inside its labelled family', () => {
  const ctx = synthetic();
  const rows = R.eligibleRows(ctx, { family: 'ORACLE_LOOKAHEAD', rebalanceWeeks: 4, filters: [] }, 100);
  assert.ok(rows.every(r => Number.isFinite(r.fwd)));
  assert.ok(R.eligibleRows(ctx, { family: 'PRICE', ranks: [['r12_1', 1, 1]] }, 100).every(r => r.fwd === undefined));
});

test('freeze chronology: registration < candidates frozen < validation < final frozen < test (R2/R3)', () => {
  // Hash-bound record (works in shallow CI checkouts): frozen and result files are byte-unchanged and the recorded
  // first-commit times are strictly ordered.
  const chrono = JSON.parse(fs.readFileSync(path.join(ROOT, DOCS, 'chronology-1.0.1.json'), 'utf8'));
  // 1.0.1 only re-points commit SHAs after the V13 history cleanup; files, hashes and times equal 1.0.0.
  const prev = JSON.parse(fs.readFileSync(path.join(ROOT, DOCS, 'chronology-1.0.0.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, DOCS, 'chronology-1.0.0.json'))).digest('hex'), chrono.supersedes.sha256);
  assert.deepEqual(chrono.records.map(r => [r.file, r.sha256, r.firstCommitTime, r.preRewriteCommit]), prev.records.map(r => [r.file, r.sha256, r.firstCommitTime, r.firstCommit]));
  const files = ['registration-1.0.0.json', 'candidates-frozen-1.0.0.json', 'validation-results-1.0.0.json', 'final-hypotheses-frozen-1.0.0.json', 'test-results-1.0.0.json'];
  assert.deepEqual(chrono.records.map(r => r.file), files);
  for (const r of chrono.records) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, DOCS, r.file))).digest('hex'), r.sha256, r.file);
  for (let k = 1; k < files.length; k++) assert.ok(Date.parse(chrono.records[k].firstCommitTime) > Date.parse(chrono.records[k - 1].firstCommitTime), 'order ' + k);
  // With full history the record itself is checked against git (commit identity and ancestry).
  const shallow = cp.execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim() === 'true';
  const known = c => { try { cp.execFileSync('git', ['cat-file', '-e', c + '^{commit}'], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
  if (shallow || !chrono.records.every(r => known(r.firstCommit))) return;
  const first = f => cp.execFileSync('git', ['log', '--format=%H', '--', DOCS + f], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').at(-1);
  for (const r of chrono.records) assert.equal(first(r.file), r.firstCommit, r.file);
  const anc = (a, b) => { try { cp.execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: ROOT }); return true; } catch { return false; } };
  for (let k = 1; k < files.length; k++) assert.ok(anc(chrono.records[k - 1].firstCommit, chrono.records[k].firstCommit), 'ancestry ' + k);
});

test('frozen sets respect R2/R3 limits and evidence flags', () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, DOCS, 'candidates-frozen-1.0.0.json'), 'utf8'));
  for (const f of Object.values(c.families)) assert.ok(f.candidates.length <= 12);
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, DOCS, 'final-hypotheses-frozen-1.0.0.json'), 'utf8'));
  assert.ok(h.hypotheses.length <= 3);
  for (const f of ['validation-results-1.0.0.json', 'test-results-1.0.0.json', 'attribution-1.0.0.json', 'oracle-test-1.0.0.json']) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, DOCS, f), 'utf8'));
    assert.equal(d.certificationStatus, 'NOT_CERTIFIED'); assert.equal(d.productionApproved, false);
  }
});
