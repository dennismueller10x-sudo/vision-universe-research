// V12 MCAP: corrected PIT market cap (quant/engines/research-pit-market-cap.cjs) - fast, synthetic, no production data written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const M = require('../engines/research-pit-market-cap.cjs');
const ROOT = new URL('../../', import.meta.url);

const fact = (c, end, val, accn, filed, start = null) => ({ c, end, start, val, accn, filed, unit: 'shares' });
function ctxOf(facts, validated = [], splits = []) {
  const byAccn = new Map();
  for (const f of facts) { if (!byAccn.has(f.accn)) byAccn.set(f.accn, []); byAccn.get(f.accn).push(f); }
  const accns = [...byAccn.keys()].map(a => ({ accn: a, filed: byAccn.get(a)[0].filed })).sort((a, b) => (a.filed < b.filed ? -1 : 1));
  return {
    byAccn,
    basis: (from, to) => M.basisFactor(splits, from, to),
    priorAccns: filed => accns.filter(a => a.filed < filed).reverse().map(a => ({ ...a, facts: byAccn.get(a.accn) })),
    previousObservations: (filed, n) => validated.filter(v => v.filed < filed).slice(-n).reverse()
  };
}
const obs = (code, v, E, accn, filed, price = 10) => ({ code, v, E, accn, filed, maxPriceBasisD: () => price, minPriceBasisD: () => price });

test('splitShaped separates split ratios from spin-off factors', () => {
  for (const f of [2, 0.5, 1.5, 0.1, 1 / 25, 3, 4 / 3]) assert.equal(M.splitShaped(f), true, String(f));
  for (const f of [1.281, 1.253, 1.046, 1.388, 0.807]) assert.equal(M.splitShaped(f), false, String(f));
});

test('basisFactor converts by date: a split dated s affects reports with date >= s', () => {
  const s = [['2011-05-09', 0.1]];
  assert.equal(M.basisFactor(s, '2011-03-31', '2011-07-31'), 0.1);
  assert.equal(M.basisFactor(s, '2011-05-09', '2011-07-31'), 1);
  assert.ok(Math.abs(M.basisFactor(s, '2011-07-31', '2011-03-31') - 10) < 1e-12);
});

test('cover count x1e6 with a correct balance-sheet count and a validated prior -> SCALE_ERROR tier A (ON 2012 pattern)', () => {
  const facts = [fact('ECSO', '2012-07-26', 455571966e6, 'A2', '2012-08-03'), fact('CSSO', '2012-06-29', 455115270, 'A2', '2012-08-03')];
  const r = M.classifyFact(obs('ECSO', 455571966e6, '2012-06-30', 'A2', '2012-08-03', 6), ctxOf(facts, [{ c: 'ECSO', accn: 'A1', end: '2012-04-26', val: 451e6, filed: '2012-05-04' }]));
  assert.equal(r.status, 'CORRECTED'); assert.equal(r.class, 'SCALE_ERROR'); assert.equal(r.scaleExponent, 6); assert.equal(r.tier, 'A');
  assert.equal(r.vPrime, 455571966); assert.equal(r.D, '2012-07-26');
});

test('correct cover count against statement tables in thousands without prior -> never corrected (MSEX/AAP pattern, 1.0.7)', () => {
  const facts = [fact('ECSO', '2011-08-02', 15618317, 'B1', '2011-08-04'), fact('CSSO', '2011-06-30', 15611, 'B1', '2011-08-04'),
    fact('WASO_B', '2011-06-30', 15587, 'B1', '2011-08-04', '2011-04-01')];
  const r = M.classifyFact(obs('ECSO', 15618317, '2011-06-30', 'B1', '2011-08-04', 18), ctxOf(facts));
  assert.notEqual(r.status, 'CORRECTED');
  assert.equal(r.status, 'EXCLUDED');
});

test('statement tables in thousands but validated prior agrees with the cover count -> OK (ALTERNATIVE_CONCEPT_DEVIATES)', () => {
  const facts = [fact('ECSO', '2012-07-31', 15733286, 'B3', '2012-08-02'), fact('CSSO', '2012-06-30', 15730, 'B3', '2012-08-02')];
  const r = M.classifyFact(obs('ECSO', 15733286, '2012-06-30', 'B3', '2012-08-02', 18), ctxOf(facts, [{ c: 'ECSO', accn: 'B2', end: '2012-04-30', val: 15710293, filed: '2012-05-04' }]));
  assert.equal(r.status, 'OK'); assert.equal(r.class, 'ALTERNATIVE_CONCEPT_DEVIATES');
});

test('whole filing x1e6 with comparatives against a confirmed earlier value -> SCALE_ERROR tier B (CB 2010 pattern)', () => {
  const facts = [fact('ECSO', '2010-02-15', 336524657, 'K1', '2010-02-25'), fact('CSSO', '2009-12-31', 336524657, 'K1', '2010-02-25'),
    fact('ECSO', '2010-03-31', 338610718e6, 'Q1', '2010-05-07'), fact('CSSO', '2010-03-31', 338610718e6, 'Q1', '2010-05-07'), fact('CSSO', '2009-12-31', 336524657e6, 'Q1', '2010-05-07')];
  const r = M.classifyFact(obs('CSSO', 338610718e6, '2010-03-31', 'Q1', '2010-05-07', 50), ctxOf(facts, [{ c: 'ECSO', accn: 'K1', end: '2010-02-15', val: 336524657, filed: '2010-02-25' }]));
  assert.equal(r.status, 'CORRECTED'); assert.equal(r.tier, 'B'); assert.equal(r.scaleExponent, 6);
});

test('a factor of 10 is never corrected (1.0.8)', () => {
  const facts = [fact('ECSO', '2012-11-30', 152210038, 'C2', '2012-12-05'), fact('CSSO', '2012-09-30', 15209038, 'C2', '2012-12-05')];
  const r = M.classifyFact(obs('ECSO', 152210038, '2012-09-30', 'C2', '2012-12-05', 2), ctxOf(facts, [{ c: 'ECSO', accn: 'C1', end: '2012-08-10', val: 15203538, filed: '2012-08-14' }]));
  assert.equal(r.status, 'EXCLUDED'); assert.equal(r.class, 'DECIMAL_SCALE_SUSPECTED');
});

test('genuine capital action: prior deviates > 5x, the filing confirms the value -> OK', () => {
  const facts = [fact('ECSO', '2021-03-08', 318449966, 'D2', '2021-03-16'), fact('CSSO', '2020-12-31', 318425182, 'D2', '2021-03-16')];
  const r = M.classifyFact(obs('ECSO', 318449966, '2020-12-31', 'D2', '2021-03-16', 12), ctxOf(facts, [{ c: 'ECSO', accn: 'D1', end: '2020-10-22', val: 45e6, filed: '2020-11-10' }]));
  assert.equal(r.status, 'OK'); assert.equal(r.class, 'GENUINE_CAPITAL_ACTION');
});

test('split continuity: spin-off factor, real split, contradicted split; restated comparatives are not a before value', () => {
  const ge = [fact('ECSO', '2022-10-20', 1092668140, 'G1', '2022-10-25'), fact('ECSO', '2023-01-31', 1089286553, 'G2', '2023-02-10')];
  assert.equal(M.classifySplitEvent('2023-01-04', 1.281, ge).class, 'NOT_A_SPLIT');
  const real = [fact('ECSO', '2021-06-30', 8781303049, 'H1', '2021-07-27'), fact('ECSO', '2021-09-30', 1098137128, 'H2', '2021-10-26')];
  assert.equal(M.classifySplitEvent('2021-08-02', 0.125, real).class, 'REAL_SPLIT');
  const contra = [fact('ECSO', '2012-05-31', 25275390, 'Z1', '2012-07-03'), fact('ECSO', '2012-08-31', 25312516, 'Z2', '2012-10-01')];
  assert.equal(M.classifySplitEvent('2012-07-31', 2, contra).class, 'CONTRADICTED_SPLIT');
  const restated = [fact('CSSO', '2010-12-31', 24758480, 'R1', '2011-08-04'), fact('CSSO', '2011-06-30', 24670026, 'R1', '2011-08-04')];
  assert.equal(M.classifySplitEvent('2011-06-14', 1.5, restated).class, 'UNRESOLVED');
  assert.equal(M.classifySplitEvent('2021-11-04', 1.046, ge).class, 'SMALL_FACTOR_ACCEPTED');
});

function registerOf(facts, splits) {
  return M.indexRegister({ schemaVersion: M.REGISTER_SCHEMA, ruleVersion: M.RULE.version, factColumns: ['accn', 'concept', 'v', 'status', 'class', 'D', 'vPrime', 'E', 'filed', 'scaleExponent', 'tier', 'evidence'],
    splitColumns: ['date', 'factor', 'class', 'availableAt', 'ratio', 'before', 'after', 'source'], facts, splits });
}
const shares = (v, end, accn, concept = 'dei:EntityCommonStockSharesOutstanding') => ({ ttm: { shares_outstanding: { v, end, filed: '2000-01-01', accn, concept } } });
const args = (doc, t, close, fI, splits, id = 'ref_X', cik = '0000000001') => ({ securityId: id, cik, splits, doc, cutoff: t, dates: [t], closes: [close], factors: [fI], i: 0 });

test('runtime: split timing by the raw date (Citigroup 2011 pattern) and exclusion', () => {
  const splits = [['2011-05-09', 0.1]];
  const reg = registerOf({ '0000000001': [['A', 'ECSO', 2917949115, 'OK', 'OK', '2011-07-29', null, '2011-03-31', '2011-08-05', null, null, []],
    ['B', 'ECSO', 22863947, 'EXCLUDED', 'UNRESOLVED', '2009-09-30', null, '2009-09-30', '2009-11-06', null, null, []]] }, {});
  const r = M.marketCapAt(args(shares(2917949115, '2011-03-31', 'A'), '2011-08-26', 29.84, 1, splits), { value: 2917949115 * 29.84 * 0.1 }, reg);
  assert.equal(r.status, 'CORRECTED'); assert.deepEqual(r.classes, ['SPLIT_TIMING']);
  assert.ok(Math.abs(r.value / (2917949115 * 29.84) - 1) < 1e-12);
  const x = M.marketCapAt(args(shares(22863947, '2009-09-30', 'B'), '2010-01-29', 33.2, 0.1, splits), { value: 1 }, reg);
  assert.equal(x.status, 'EXCLUDED'); assert.equal(x.value, null);
});

test('runtime: spin-off factor removed only once its source is available; unresolved factor excludes', () => {
  const splits = [['2023-01-04', 1.281]];
  const reg = registerOf({}, { ref_X: [['2023-01-04', 1.281, 'NOT_A_SPLIT', '2023-01-04', 1, null, null, ['acc']]] });
  const base = { value: 1e9 * 1.281 * 70 };
  const after = M.marketCapAt(args(shares(1e9, '2022-09-30', 'Q'), '2023-01-27', 70, 1, splits), base, reg);
  assert.equal(after.status, 'CORRECTED'); assert.deepEqual(after.classes, ['SPINOFF_AS_SPLIT']); assert.ok(Math.abs(after.value / 7e10 - 1) < 1e-12);
  const same = M.marketCapAt(args(shares(1e9, '2022-09-30', 'Q'), '2023-01-04', 70, 1, splits), base, reg); // cutoff 2023-01-04 not after availableAt? equal -> known
  assert.equal(same.status, 'CORRECTED');
  const early = M.marketCapAt({ ...args(shares(1e9, '2022-09-30', 'Q'), '2023-01-06', 70, 1, splits), cutoff: '2023-01-03' }, base, reg);
  assert.equal(early.status, 'EXCLUDED'); assert.equal(early.reason, 'SPLIT_BASIS_UNRESOLVED');
  const unres = M.marketCapAt(args(shares(1e9, '2022-09-30', 'Q'), '2023-01-27', 70, 1, splits), base, registerOf({}, {}));
  assert.equal(unres.status, 'EXCLUDED');
});

test('committed register: rule hash, version and the cases named before rule 1.0.0', () => {
  const reg = M.loadRegister();
  const ruleText = readFileSync(new URL('docs/quant-recovery/v12/mcap/rule-' + M.RULE.version + '.json', ROOT), 'utf8');
  assert.equal(reg.meta.ruleSha256, createHash('sha256').update(ruleText).digest('hex'));
  assert.equal(JSON.parse(ruleText).ruleVersion, M.RULE.version);
  const get = (cik, accn, c, v) => reg.facts.get([cik, accn, c, v].join('|'));
  const st = r => r[reg.columns.indexOf('status')], vp = r => r[reg.columns.indexOf('vPrime')];
  const eeft = get('0001029199', '0001213900-21-010724', 'ECSO', 52752851000000000);
  assert.equal(st(eeft), 'CORRECTED'); assert.equal(vp(eeft), 52752851);
  assert.equal(st(get('0001097864', '0001193125-12-332540', 'ECSO', 455571966000000)), 'CORRECTED');
  assert.equal(st(get('0000896159', '0001193125-10-111376', 'CSSO', 338610718000000)), 'CORRECTED');
  assert.equal(st(get('0000831001', '0001047469-09-009754', 'CSSO', 22863947)), 'EXCLUDED');
  const ge = reg.splits.get('ref_GE');
  assert.equal(ge.get('2023-01-04|1.281')[reg.splitColumns.indexOf('class')], 'NOT_A_SPLIT');
  assert.equal(reg.splits.get('ref_IBM').get('2021-11-04|1.046')[reg.splitColumns.indexOf('class')], 'NOT_A_SPLIT');
});
