// FP-ST-03: PIT-Branchengruppen je Wertpapier (SIC aus SEC EDGAR, Fama-French-49). Kein Netz; Ausgaben nur in tmpdir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseSiccodes49, createFf49, loadFf49, FF49_STATUS } from '../source-faithful/groups/ff49.mjs';
import { deriveIntervals, buildDataset, createPitSicSource, identityFromInstruments, STATUS, IDENTITY_EVIDENCE } from '../source-faithful/groups/pit-sic-groups.mjs';
import { run, parseArgs, monthEnds } from '../source-faithful/groups/build-pit-sic-groups.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const FIXTURE = join(HERE, 'fixtures', 'pit-sic');
const FF49_TABLE = JSON.parse(readFileSync(join(ROOT, 'scripts/supertrader/source-faithful/groups/ff49-siccodes.json'), 'utf8'));

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pit-sic-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function fixtureSource() {
  return withTmp((dir) => {
    const out = join(dir, 'groups.json');
    const { dataset } = run(parseArgs(['--fixture', FIXTURE, '--out', out, '--coverage-from', '2015-01', '--coverage-to', '2021-12']));
    return { dataset, src: createPitSicSource(dataset, FF49_TABLE) };
  });
}
const realShard = (cik) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'quant/data/sec/sic-history/issuers', cik.slice(-3) + '.json.gz'))).toString('utf8')).issuers[cik];

test('FF49: gepinnte Tabelle, 49 Branchen, bekannte Zuordnungen, UNMAPPED ist nicht "Other"', () => {
  assert.equal(FF49_TABLE.source.sha256, '5d0c29b0325078ac3a51829840569af2d12eaed537328f979b6c56447c24827f');
  assert.equal(FF49_TABLE.industries.length, 49);
  assert.equal(FF49_TABLE.unmappedPolicy, 'UNMAPPED_IS_NOT_OTHER');
  const f = loadFf49();
  const id = (s) => f.of(s).industry?.short;
  assert.equal(id('2834'), 'Drugs');
  assert.equal(id('3571'), 'Hardw');
  assert.equal(id('3674'), 'Chips');
  assert.equal(id('7372'), 'Softw');
  assert.equal(id('5961'), 'Rtail');
  assert.equal(id('2731'), 'Books');
  assert.equal(id('4955'), 'Other');
  assert.equal(f.of('9995').status, FF49_STATUS.UNMAPPED);
  assert.equal(f.of('9995').industry, null);
  assert.equal(f.of(null).status, FF49_STATUS.NO_SIC);
});

test('FF49: Parser fuehrt doppelte Bloecke zusammen und weist Ueberlappungen ab', () => {
  const lines = [];
  for (let i = 1; i <= 49; i++) lines.push(`${String(i).padStart(2)} I${i}  Industry ${i}`, `          ${String(1000 + i * 10).padStart(4, '0')}-${String(1000 + i * 10 + 5).padStart(4, '0')} range`, '');
  lines.push('49 I49  Industry 49', '          9000-9001 second block', '');
  const parsed = parseSiccodes49(lines.join('\r\n'));
  assert.equal(parsed.industries[48].ranges.length, 2);
  const f = createFf49({ schema: 'supertrader-ff49-siccodes/1.0.0', industries: parsed.industries });
  assert.equal(f.of('9001').industry.id, 49);
  const overlap = lines.join('\n').replace('1020-1025', '1015-1025');
  assert.throws(() => parseSiccodes49(overlap), /FF49_OVERLAP/);
});

test('deriveIntervals: Wechsel, keine SIC, Widerspruch am selben knownAt; Beginn nie belegt', () => {
  const iv = deriveIntervals([
    ['2019-01-01T21:00:00Z', null, 'a1', 'S-1', 'H', 'S', ''],
    ['2019-02-01T21:00:00Z', '6770', 'a2', '10-Q', 'F', 'M', ''],
    ['2019-03-01T21:00:00Z', '6770', 'a3', '10-Q', 'F', 'M', ''],
    ['2019-04-01T21:00:00Z', '6770', 'a4', '10-Q', 'F', 'M', ''],
    ['2019-04-01T21:00:00Z', '6799', 'a5', '10-Q/A', 'F', 'M', ''],
    ['2019-05-01T21:00:00Z', '2836', 'a6', '10-Q', 'F', 'M', ''],
  ]);
  assert.deepEqual(iv.map((x) => [x.state, x.sic, x.validFrom, x.validTo]), [
    ['NO_SIC_ASSIGNED', null, '2019-01-01T21:00:00Z', '2019-02-01T21:00:00Z'],
    ['SIC', '6770', '2019-02-01T21:00:00Z', '2019-04-01T21:00:00Z'],
    ['CONFLICT', null, '2019-04-01T21:00:00Z', '2019-05-01T21:00:00Z'],
    ['SIC', '2836', '2019-05-01T21:00:00Z', null],
  ]);
  assert.equal(iv[0].start, 'FIRST_OBSERVATION');
  assert.equal(iv[1].start, 'OBSERVED_CHANGE');
  assert.equal(iv[1].priorLastObservedAt, '2019-01-01T21:00:00Z');
  assert.ok(iv.every((x) => x.trueStartKnown === false));
  assert.deepEqual(iv[1].observedAt, ['2019-02-01T21:00:00Z', '2019-03-01T21:00:00Z']);
  assert.throws(() => deriveIntervals([['2019-02-01T00:00:00Z', '1'], ['2019-01-01T00:00:00Z', '1']]), /NOT_SORTED/);
});

test('sicAt: vor der ersten Beobachtung UNBEKANNT, nie die spaetere SIC rueckdatiert; 16:00-ET-Schnitt', () => {
  const { src } = fixtureSource();
  // Erstes 10-K angenommen 16:10:05 ET: am selben Tag noch unbekannt, am naechsten bekannt
  assert.equal(src.sicAt('ref_ALFA', '2015-02-27').status, STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION);
  assert.equal(src.sicAt('ref_ALFA', '2015-02-27').sic, null);
  assert.equal(src.sicAt('ref_ALFA', '2015-03-02').status, STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION);
  const r = src.sicAt('ref_ALFA', '2015-03-03');
  assert.equal(r.status, STATUS.OBSERVED);
  assert.equal(r.sic, '7372');
  assert.equal(r.sic3, '737');
  assert.equal(r.ff49.short, 'Softw');
  assert.equal(r.identityEvidence, IDENTITY_EVIDENCE.CURRENT_TICKER_MAPPING_ASSUMED_SINCE_FIRST_TRADE);
  // Wechsel 7372 -> 3674 nach Handelsschluss (16:30 EDT): gilt ab dem naechsten Datum
  assert.equal(src.sicAt('ref_ALFA', '2020-05-04').sic, '7372');
  const after = src.sicAt('ref_ALFA', '2020-05-05');
  assert.equal(after.sic, '3674');
  assert.equal(after.ff49.short, 'Chips');
  assert.equal(after.interval.start, 'OBSERVED_CHANGE');
  assert.equal(after.interval.priorLastObservedAt, '2016-03-01T20:59:59Z');
  assert.equal(after.interval.trueStartKnown, false);
  // exakter Zeitstempel: eine Sekunde vor / nach der Annahme
  assert.equal(src.sicAt('ref_ALFA', '2020-05-04T20:29:59Z').sic, '7372');
  assert.equal(src.sicAt('ref_ALFA', '2020-05-04T20:30:00Z').sic, '3674');
});

test('sicAt: validTo (Rueckblick) wird nie herausgegeben', () => {
  const { src, dataset } = fixtureSource();
  assert.equal(dataset.issuers['0000000101'].intervals[0].validTo, '2020-05-04T20:30:00Z');
  for (const d of ['2015-06-30', '2019-12-31', '2020-05-04', '2021-06-30']) {
    const r = src.sicAt('ref_ALFA', d);
    assert.equal(r.interval.validTo, null);
    assert.equal(r.interval.openAsOf, true);
    assert.ok(Date.parse(r.knownAt) <= Date.parse(r.cutoff));
    assert.ok(!JSON.stringify(r).includes('2020-05-04T20:30:00Z') || d >= '2020-05-05');
  }
});

test('sicAt: keine SIC zugewiesen, SPAC-Wechsel, Widerspruch, Alter und STALE nur mit Grenze', () => {
  const { src } = fixtureSource();
  assert.equal(src.sicAt('ref_BETA', '2019-07-01').status, STATUS.NO_SIC_ASSIGNED);
  assert.equal(src.sicAt('ref_BETA', '2020-01-02').ff49.short, 'Fin');
  assert.equal(src.sicAt('ref_BETA', '2021-08-16').sic, '6770');
  assert.equal(src.sicAt('ref_BETA', '2021-08-17').sic, '2836');
  assert.equal(src.sicAt('ref_GAMA', '2018-05-02').status, STATUS.CONFLICT);
  assert.equal(src.sicAt('ref_GAMA', '2018-05-02').sic, null);
  assert.equal(src.sicAt('ref_GAMA', '2018-08-02').sic, '4911');
  const old = src.sicAt('ref_ALFA', '2019-12-31');
  assert.equal(old.status, STATUS.OBSERVED);
  assert.ok(old.ageDays > 1300);
  assert.equal(old.carryForward.declared, false);
  const stale = src.sicAt('ref_ALFA', '2019-12-31', { maxAgeDays: 400, assumptionRef: 'TEST' });
  assert.equal(stale.status, STATUS.STALE);
  assert.equal(stale.carryForward.declared, true);
});

test('Identitaet: core/identity.js, Fenster, Mehrdeutigkeit, keine CIK, Evidenzfilter', () => {
  const { src, dataset } = fixtureSource();
  assert.ok(dataset.securities.ref_BRK_Z, 'BRK.Z -> ref_BRK_Z ueber securityIdForTicker');
  assert.equal(src.sicAt('ref_ALFA', '2014-12-31').reason, 'OUTSIDE_EVIDENCED_WINDOW');
  assert.equal(src.sicAt('ref_DLTA', '2017-06-30').cik, '0000000404');
  const amb = src.sicAt('ref_DLTA', '2018-09-28');
  assert.equal(amb.status, STATUS.IDENTITY_HOLD);
  assert.equal(amb.reason, 'AMBIGUOUS_CIK');
  const later = src.sicAt('ref_DLTA', '2019-06-28');
  assert.equal(later.cik, '0000001404');
  assert.equal(later.ff49Status, FF49_STATUS.UNMAPPED);
  assert.equal(src.sicAt('ref_NOCK', '2020-01-02').reason, 'NO_CIK');
  assert.equal(src.sicAt('NOCK', '2020-01-02').reason, 'INVALID_SECURITY_ID');
  assert.equal(src.sicAt('ref_ALFA', '2020-01-02', { acceptedIdentityEvidence: [IDENTITY_EVIDENCE.NAME_EXACT_XBRL_IN_LISTING_WINDOW] }).reason, 'IDENTITY_EVIDENCE_NOT_ACCEPTED');
  const { rejected } = identityFromInstruments([{ symbol: 'ABC', cik: '1', legacyIds: ['ref_ABD'] }, { symbol: 'X', cik: null }]);
  assert.deepEqual(rejected, { NO_CIK: 1, INVALID_TICKER: 0, LEGACY_ID_MISMATCH: 1 });
});

test('groupKeyAt: verlangt deklarierte Fortschreibung; FF49/SIC-Schluessel; unbekannt bleibt null', () => {
  const { src } = fixtureSource();
  assert.throws(() => src.groupKeyAt('ref_ALFA', '2020-06-30', 'FF49'), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
  assert.throws(() => src.groupKeyAt('ref_ALFA', '2020-06-30', 'GICS', { maxAgeDays: 400, assumptionRef: 'T' }), (e) => e.code === 'MODEL_ASSUMPTION_REQUIRED');
  const o = { maxAgeDays: 400, assumptionRef: 'TEST-REF' };
  assert.equal(src.groupKeyAt('ref_ALFA', '2020-06-30', 'FF49', o).key, 'FF49:37');
  assert.equal(src.groupKeyAt('ref_ALFA', '2020-06-30', 'SIC3', o).key, 'SIC3:367');
  assert.equal(src.groupKeyAt('ref_ALFA', '2020-06-30', 'SIC2', o).key, 'SIC2:36');
  assert.equal(src.groupKeyAt('ref_ALFA', '2015-02-27', 'FF49', o).key, null);
  assert.equal(src.groupKeyAt('ref_ALFA', '2015-02-27', 'FF49', o).reason, STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION);
  assert.equal(src.groupKeyAt('ref_DLTA', '2019-06-28', 'FF49', { maxAgeDays: 1000, assumptionRef: 'TEST-REF' }).reason, 'FF49_UNMAPPED');
  assert.equal(src.groupKeyAt('ref_ALFA', '2019-12-31', 'FF49', o).reason, STATUS.STALE);
});

test('eine Wahrheit: sicAt antwortet wie core/industry-classification.js (Fixtur und echte SEC-Scherben)', () => {
  const ciks = ['0000320193', '0001018724', '0001326801'];
  const issuers = Object.fromEntries(ciks.map((c) => [c, realShard(c)]));
  const fx = fixtureSource().dataset;
  for (const c of Object.keys(fx.issuers)) {
    const sh = JSON.parse(readFileSync(join(FIXTURE, 'sic-history/issuers', c.slice(-3) + '.json'), 'utf8'));
    issuers[c] = sh.issuers[c];
  }
  const identity = new Map(Object.keys(issuers).map((c, i) => [`ref_T${i}`, [{ cik: c, evidence: IDENTITY_EVIDENCE.UNSPECIFIED, validFrom: null, validTo: null }]]));
  const src = createPitSicSource(buildDataset({ issuers, identity }), FF49_TABLE);
  const ic = IC.create({ issuers });
  let compared = 0;
  const dates = [...monthEnds('2008-12', '2026-10'), '2015-03-02', '2015-03-03', '2020-05-04', '2020-05-05', '2018-05-02', '2021-08-16', '2021-08-17'];
  for (const [id, [{ cik }]] of identity) {
    for (const d of dates) {
      for (const opts of [{}, { maxAgeDays: 120, assumptionRef: 'T' }]) {
        const a = src.sicAt(id, d, opts), b = ic.getIndustryClassification(cik, d, opts);
        assert.equal(a.status, b.status, `${cik} ${d}`);
        assert.equal(a.sic, b.sic, `${cik} ${d}`);
        assert.equal(a.knownAt, b.knownAt, `${cik} ${d}`);
        assert.equal(a.ageDays, b.ageDays, `${cik} ${d}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 2000);
});

test('Lookahead: Ergebnis zu t = Ergebnis auf dem bei t abgeschnittenen Datensatz (echte Scherbe Amazon)', () => {
  const cik = '0001018724', rec = realShard(cik);
  const identity = new Map([['ref_AMZN', [{ cik, evidence: IDENTITY_EVIDENCE.UNSPECIFIED, validFrom: null, validTo: null }]]]);
  const full = createPitSicSource(buildDataset({ issuers: { [cik]: rec }, identity }), FF49_TABLE);
  for (const d of ['2009-06-30', '2012-01-31', '2016-12-30', '2021-03-31', '2025-10-31']) {
    const cut = IC.cutoffOf(d).cutoffMs;
    const truncated = { [cik]: { ...rec, observations: rec.observations.filter((o) => Date.parse(o[0]) <= cut) } };
    const part = createPitSicSource(buildDataset({ issuers: truncated, identity }), FF49_TABLE);
    assert.deepEqual(full.sicAt('ref_AMZN', d), part.sicAt('ref_AMZN', d), d);
  }
});

test('Erzeuger: nur --out, deterministisch, --limit, verweigert erzeugergebundene Datenbaeume', () => {
  withTmp((dir) => {
    const a = run(parseArgs(['--fixture', FIXTURE, '--out', join(dir, 'a.json'), '--coverage-from', '2015-01', '--coverage-to', '2021-12']));
    const b = run(parseArgs(['--fixture', FIXTURE, '--out', join(dir, 'b.json.gz'), '--coverage-from', '2015-01', '--coverage-to', '2021-12']));
    assert.equal(a.datasetSha256, b.datasetSha256);
    assert.equal(createHash('sha256').update(gunzipSync(readFileSync(join(dir, 'b.json.gz')))).digest('hex'), b.datasetSha256);
    assert.equal(a.report.securities, 5);
    assert.equal(a.report.identityRejected.NO_CIK, 1);
    assert.ok(a.report.byStatus.OBSERVED > 0 && a.report.byStatus.UNKNOWN_BEFORE_FIRST_OBSERVATION > 0);
    const lim = run(parseArgs(['--fixture', FIXTURE, '--out', join(dir, 'c.json'), '--limit', '2']));
    assert.deepEqual(Object.keys(lim.dataset.securities), ['ref_ALFA', 'ref_BETA']);
    const t = run(parseArgs(['--fixture', FIXTURE, '--out', join(dir, 'd.json'), '--tickers', 'BRK.Z']));
    assert.deepEqual(Object.keys(t.dataset.securities), ['ref_BRK_Z']);
  });
  assert.throws(() => parseArgs(['--fixture', FIXTURE]), /--out fehlt/);
  assert.throws(() => run(parseArgs(['--fixture', FIXTURE, '--out', join(ROOT, 'quant/data/sec/x.json')])), /OUT_IN_PRODUCER_OWNED_TREE/);
  assert.throws(() => run(parseArgs(['--fixture', FIXTURE, '--out', join(ROOT, 'supertrader/data/x.json')])), /OUT_IN_PRODUCER_OWNED_TREE/);
});
