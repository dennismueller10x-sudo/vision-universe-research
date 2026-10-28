// V10 FACTOR (RECONSTRUCTION): unit tests for the reconstruction helpers. Synthetic inputs only;
// nothing under */data is written. The full study runs only through its CLI with a private directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const X = require(join(ROOT, 'scripts/quant/v10/factor/factors.cjs'));
const Study = require(join(ROOT, 'scripts/quant/v10/factor/study.cjs'));
const Panel = require(join(ROOT, 'scripts/quant/v10/factor/panel.cjs'));
const Common = require(join(ROOT, 'scripts/quant/v10/factor/common.cjs'));
const C = require(join(ROOT, 'quant/engines/research-contract.cjs'));

function weeklyDates(n, start = '2015-01-02') {
  const out = []; let t = Date.parse(start + 'T00:00:00Z');
  for (let k = 0; k < n; k++) { out.push(new Date(t).toISOString().slice(0, 10)); t += 7 * 86400000; }
  return out;
}

test('weekly momentum and risk components follow the registered windows', () => {
  const dates = weeklyDates(60), closes = dates.map((_, k) => 100 * 1.01 ** k), spy = new Map(dates.map((d, k) => [d, 50 * 1.005 ** k]));
  const i = 59, c = X.priceComponents(dates, closes, i, spy);
  assert.ok(Math.abs(c.priceReturn12m1m - (closes[55] / closes[7] - 1)) < 1e-12);
  assert.ok(Math.abs(c.priceReturn6m - (closes[59] / closes[33] - 1)) < 1e-12);
  assert.ok(Math.abs(c.priceReturn3m - (closes[59] / closes[46] - 1)) < 1e-12);
  assert.ok(Math.abs(c.relativeStrength12m1m - (Math.log(closes[55] / closes[7]) - Math.log(spy.get(dates[55]) / spy.get(dates[7])))) < 1e-12);
  assert.equal(c.distanceTo52wHigh, 0); // monotone rising series sits at its high
  assert.equal(c.maxDrawdown252d, 0);
  assert.ok(c.realizedVolatility252d < 1e-9 && c.downsideVolatility252d === 0);
  // Beta against a wiggling benchmark: OLS slope of weekly simple returns over the last 52 weeks.
  const wig = new Map(dates.map((d, k) => [d, 50 + Math.sin(k)]));
  const xs = [], ys = [];
  for (let k = 8; k <= 59; k++) { ys.push(closes[k] / closes[k - 1] - 1); xs.push(wig.get(dates[k]) / wig.get(dates[k - 1]) - 1); }
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const beta = xs.reduce((s, x, k) => s + (x - mx) * (ys[k] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  assert.ok(Math.abs(X.priceComponents(dates, closes, i, wig).beta252d - beta) < 1e-12);
  // Too short histories: no momentum below 56 bars, no risk below 53.
  assert.equal(X.priceComponents(dates, closes, 54, spy).priceReturn12m1m, undefined);
  assert.ok(X.priceComponents(dates, closes, 54, spy).maxDrawdown252d !== undefined);
  assert.equal(X.priceComponents(dates, closes, 51, spy).maxDrawdown252d, undefined);
});

test('split factors (ADR-002) and split-consistent PIT market capitalization', () => {
  const dates = weeklyDates(10);
  const f = X.weeklySplitFactors(dates, [[dates[5], 2]]); // 2:1 split effective in week 5
  assert.deepEqual(f, [2, 2, 2, 2, 2, 1, 1, 1, 1, 1]);
  const closes = dates.map(() => 50); // split-adjusted closes (today's share basis)
  const doc = { schema: 'vu-consumer-fundamentals-1.0.0', units: { revenue: 'USD' }, annual: {}, quarterly: {},
    ttm: { shares_outstanding: { v: 1000, end: dates[2], filed: dates[3], kind: 'INSTANT', concept: 'dei:EntityCommonStockSharesOutstanding' } } };
  // Shares reported before the split, decision after it: 1000 old shares x 50 x 2 = raw cap 100,000.
  const after = X.marketCapAt({ doc, cutoff: dates[8], dates, closes, factors: f, i: 8, issuerListings: 1 });
  assert.equal(after.value, 100000); assert.equal(after.splitBetween, true);
  const before = X.marketCapAt({ doc, cutoff: dates[4], dates, closes, factors: f, i: 4, issuerListings: 1 });
  assert.equal(before.value, 1000 * 50 * 2); assert.equal(before.splitBetween, false);
  assert.equal(X.marketCapAt({ doc, cutoff: dates[2], dates, closes, factors: f, i: 2, issuerListings: 1 }).reason, 'NO_PIT_SHARE_COUNT'); // filed after cutoff
  assert.equal(X.marketCapAt({ doc, cutoff: dates[8], dates, closes, factors: f, i: 8, issuerListings: 2 }).reason, 'SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING');
  const issued = { ...doc, ttm: { shares_outstanding: { ...doc.ttm.shares_outstanding, concept: 'us-gaap:CommonStockSharesIssued' } } };
  assert.equal(X.marketCapAt({ doc: issued, cutoff: dates[8], dates, closes, factors: f, i: 8, issuerListings: 1 }).reason, 'SHARE_COUNT_NOT_OUTSTANDING');
});

test('availability: a fact filed on the rank date is not visible (cutoff = day before)', () => {
  assert.equal(Common.dayBefore('2015-03-06'), '2015-03-05');
  const versions = [{ from: '2015-01-30', asOf: '2015-01-29' }, { from: '2015-03-06', asOf: '2015-03-05' }];
  assert.equal(Panel.docAt(versions, '2015-02-27').from, '2015-01-30');
  assert.equal(Panel.docAt(versions, '2015-03-06').from, '2015-03-06');
  assert.equal(Panel.docAt(versions, '2015-01-02'), null);
  const FI = require(join(ROOT, 'quant/engines/fundamental-inputs.js'));
  const doc = { schema: 'vu-consumer-fundamentals-1.0.0', annual: { total_assets: [[2014, 'FY', '2014-12-31', 10, '2015-03-06', 'a', 0]], stockholders_equity: [[2014, 'FY', '2014-12-31', 4, '2015-03-06', 'a', 0]] }, quarterly: {}, ttm: {} };
  assert.equal(FI.compute(doc, Common.dayBefore('2015-03-06'), null).raws.equityToAssets, undefined);
  assert.equal(FI.compute(doc, Common.dayBefore('2015-03-13'), null).raws.equityToAssets, 0.4);
});

test('cross-sectional scores: universe minimum, templates, composite needs all six factors', () => {
  const n = 240, rows = [];
  for (let k = 0; k < n; k++) {
    const raws = {};
    for (const id of X.COMPONENT_IDS) raws[id] = Math.sin(k * 7 + id.length) * 10 + k / 10;
    rows.push({ id: 'ref_T' + k, raws, template: k === 0 });
  }
  const s = X.scoreCrossSection(rows);
  assert.equal(s[0].quality, null); assert.equal(s[0].value, null); assert.ok(X.finite(s[0].growth)); assert.equal(s[0].composite, null);
  const w = X.COMPOSITE_WEIGHTS, tot = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(tot - 0.85) < 1e-12);
  const expect = X.FACTORS.reduce((a, f) => a + w[f] * s[5][f], 0) / tot;
  assert.ok(Math.abs(s[5].composite - expect) < 1e-9);
  for (const r of s.slice(1)) for (const f of X.FACTORS) assert.ok(r[f] >= 0 && r[f] <= 100);
  // Below 200 valid values a component has no universe percentile -> factors close.
  const few = X.scoreCrossSection(rows.slice(0, 150));
  assert.ok(few.every(r => r.momentum === null && r.composite === null));
  // Mandatory component: momentum without priceReturn12m1m stays closed.
  const noMom = rows.map(r => ({ ...r, raws: { ...r.raws, priceReturn12m1m: null } }));
  assert.ok(X.scoreCrossSection(noMom).every(r => r.momentum === null));
});

test('Newey-West helper and normal tail', () => {
  assert.ok(Math.abs(Study.erfc(0) - 1) < 1e-7);
  assert.ok(Math.abs(Study.erfc(1.959964 / Math.SQRT2) - 0.05) < 1e-6);
  const v = Array.from({ length: 100 }, (_, k) => (k % 2 ? 1 : -1) * 0.1 + 0.02);
  const nw = Study.neweyWest(v, 4);
  assert.ok(Math.abs(nw.mean - 0.02) < 1e-12 && nw.se > 0 && nw.p < 1);
  assert.deepEqual([4, 13, 26, 52].map(Study.blockLength), [12, 12, 12, 24]);
  assert.deepEqual([4, 13, 26, 52].map(Study.nwBandwidth), [4, 6, 12, 24]);
});

test('PIT documents: the SEC pipeline at as_of hides filings made later (python3 -I)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v10-factor-'));
  const payload = { cik: 1234567, entityName: 'TEST', facts: { 'us-gaap': {
    Assets: { units: { USD: [{ end: '2013-12-31', val: 100, accn: '0001234567-14-000001', fy: 2013, fp: 'FY', form: '10-K', filed: '2014-03-01' }, { end: '2014-12-31', val: 120, accn: '0001234567-15-000001', fy: 2014, fp: 'FY', form: '10-K', filed: '2015-03-02' }] } },
    StockholdersEquity: { units: { USD: [{ end: '2013-12-31', val: 50, accn: '0001234567-14-000001', fy: 2013, fp: 'FY', form: '10-K', filed: '2014-03-01' }, { end: '2014-12-31', val: 66, accn: '0001234567-15-000001', fy: 2014, fp: 'FY', form: '10-K', filed: '2015-03-02' }] } } } } };
  writeFileSync(join(dir, 'p.json'), JSON.stringify(payload));
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts'))}); sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts/quant/v10/factor'))})
import pit_docs
from quant.sec.registry import MetricRegistry
from quant.sec.provider import SECProvider, PERIODIC_FORMS
from quant.sec.fiscal import FiscalCalendar
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
payload = json.load(open(${JSON.stringify(join(dir, 'p.json'))}))
reg = MetricRegistry.load(); raw = list(SECProvider.iter_raw_facts(SECProvider.__new__(SECProvider), payload, availability={}, forms=PERIODIC_FORMS))
res = normalize_company('0001234567', raw, reg, profile=None, filing_metadata=None, calendar=FiscalCalendar.from_raw_facts('0001234567', raw), industry=None)
r = PeriodResolver(res.factbook, reg); years = res.factbook.fiscal_years()
out = {}
for asof in ('2015-03-01', '2015-03-02'):
    doc, _ = pit_docs.build_doc(r, reg, years, asof)
    out[asof] = [row[3] for row in doc['annual'].get('total_assets', [])]
print(json.dumps(out))`;
  const out = JSON.parse(execFileSync('python3', ['-I', '-c', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop());
  assert.deepEqual(out['2015-03-01'], [100]);
  assert.deepEqual(out['2015-03-02'], [100, 120]);
});

test('registration precedes results and evidence is never certified', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'docs/quant-recovery/v10/factor/registration-1.0.0.json'), 'utf8'));
  assert.equal(reg.status, 'REGISTERED_BEFORE_OUTCOMES'); assert.equal(reg.evidenceKind, 'RECONSTRUCTION');
  assert.equal(reg.productionApproved, false); assert.deepEqual(reg.activeContractsAffected, []);
  for (const f of ['factor-study-1.0.0.json', 'strategy-1.0.0.json']) {
    const p = join(ROOT, 'docs/quant-recovery/v10/factor', f);
    if (!existsSync(p)) continue;
    const e = JSON.parse(readFileSync(p, 'utf8'));
    assert.equal(e.registrationHash, C.hash(reg), f + ' must be bound to the committed registration');
    assert.equal(e.certificationStatus, 'NOT_CERTIFIED'); assert.equal(e.productionApproved, false); assert.equal(e.evidenceKind, 'RECONSTRUCTION');
    assert.deepEqual(e.activeContractsAffected, []);
  }
});
