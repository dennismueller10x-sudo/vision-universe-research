// Echte, nachpruefbare SEC-Beispiele auf dem gebauten Datensatz quant/data/sec/sic-history.
// Jede Accession ist unter https://www.sec.gov/Archives/edgar/data/<cik>/<acc ohne Striche>/<acc>.hdr.sgml abrufbar.
// Liest nur, schreibt nichts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadSicHistory, DEFAULT_DIR } from '../../scripts/core/load-sic-history.mjs';

const require = createRequire(import.meta.url);
const IC = require('../industry-classification.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AMZN = '0001018724', SUNRUN = '0001469367', SENTI = '0001854270', DIONICS = '0000029006', META = '0001326801', ALPHABET = '0001652044';
const api = loadSicHistory({ ciks: [AMZN, SUNRUN, SENTI, DIONICS, META, ALPHABET] });

test('Amazon: 1998 als Buchverlag (2731) klassifiziert, 5961 erst mit dem 10-K von 1999 - die heutige SIC wird nicht rueckdatiert', () => {
  const y1998 = api.getIndustryClassification(AMZN, '1998-06-30');
  assert.equal(y1998.status, 'OBSERVED');
  assert.equal(y1998.sic, '2731');
  assert.equal(y1998.observation.accession, '0000891020-98-000448');
  assert.equal(y1998.observation.precision, 'DAY');
  assert.equal(api.getIndustryClassification(AMZN, '1998-03-30').status, 'UNKNOWN_BEFORE_FIRST_OBSERVATION');
  // 10-K eingereicht 05.03.1999, Header erzeugt 08.03.1999, keine Acceptance-Zeit: sichtbar erst nach dem 08.03.
  assert.equal(api.getIndustryClassification(AMZN, '1999-03-08').sic, '2731');
  assert.equal(api.getIndustryClassification(AMZN, '1999-03-09').sic, '5961');
  const h = api.history(AMZN);
  assert.equal(h.view, 'HINDSIGHT_AUDIT_ONLY');
  assert.equal(h.runs[0].sic, '2731');
  assert.equal(h.runs[0].changeWindowAfter.kind, 'UNKNOWN_CHANGE_TIME');
});

test('Sunrun: SIC-Wechsel 3430 -> 3690, beide Seiten durch Filing-Header belegt', () => {
  const before = api.getIndustryClassification(SUNRUN, '2022-01-31');
  assert.equal(before.sic, '3430');
  assert.equal(before.observation.source, 'FILING_HEADER');
  const after = api.getIndustryClassification(SUNRUN, '2022-02-18');
  assert.equal(after.sic, '3690');
  assert.equal(after.observation.accession, '0001469367-22-000033');
});

test('Senti Biosciences: Blank-Check-SIC 6770 bis zur De-SPAC-Fusion, danach 2836 - dieselbe CIK', () => {
  assert.equal(api.getIndustryClassification(SENTI, '2022-02-28').sic, '6770');
  assert.equal(api.getIndustryClassification(SENTI, '2022-03-08').sic, '2836');
});

test('Dionics: 10-Q angenommen 16:00:31 ET - am selben Datum (Schluss 16:00) unsichtbar', () => {
  const sameDay = api.getIndustryClassification(DIONICS, '2012-05-15');
  assert.notEqual(sameDay.observation?.accession, '0001052918-12-000246');
  assert.equal(api.getIndustryClassification(DIONICS, '2012-05-15T20:00:31Z').observation.accession, '0001052918-12-000246');
  assert.equal(api.getIndustryClassification(DIONICS, '2012-05-15T20:00:30Z').observation?.accession === '0001052918-12-000246', false);
});

test('Meta: Namens- und Tickerwechsel (FB -> META) aendern weder CIK noch SIC', () => {
  const h = api.history(META);
  assert.deepEqual(h.names, ['FACEBOOK INC', 'META PLATFORMS, INC.']);
  assert.equal(api.getIndustryClassification(META, '2021-06-30').sic, '7370');
  assert.equal(api.getIndustryClassification(META, '2022-12-30').sic, '7370');
});

test('Alphabet: mehrere Aktiengattungen (GOOG / GOOGL) teilen eine CIK und damit eine Klassifikation', () => {
  const dir = join(ROOT, 'quant', 'data', 'universe', 'instruments');
  const listings = [];
  for (const f of readdirSync(dir)) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const x of Array.isArray(j) ? j : (j.instruments || Object.values(j))) if (x && IC.normalizeCik(x.cik || '') === ALPHABET) listings.push(x.symbol);
  }
  assert.ok(listings.includes('GOOG') && listings.includes('GOOGL'), listings.join(','));
  const r = api.getIndustryClassification(IC.resolveIssuer(listings.map((s) => ({ cik: ALPHABET, evidence: s })), '2024-06-28').cik, '2024-06-28');
  assert.equal(r.sic, '7370');
});

test('Lookahead-Schutz auf echten Daten: Ergebnis zu t ist identisch mit dem auf t abgeschnittenen Datensatz', () => {
  const dates = ['1998-12-31', '2013-11-15', '2016-06-30', '2022-02-17', '2026-01-30'];
  const shard = JSON.parse(gunzipSync(readFileSync(join(DEFAULT_DIR, 'issuers', '367.json.gz'))).toString('utf8')).issuers;
  const full = IC.create({ issuers: shard });
  for (const d of dates) {
    const cut = IC.cutoffOf(d).cutoffMs;
    const truncated = IC.create({ issuers: Object.fromEntries(Object.entries(shard).map(([c, r]) => [c, { observations: r.observations.filter((o) => Date.parse(o[0]) <= cut) }])) });
    for (const cik of Object.keys(shard)) {
      const a = full.getIndustryClassification(cik, d), b = truncated.getIndustryClassification(cik, d);
      assert.equal(a.sic, b.sic, `${cik} ${d}`);
      assert.equal(a.status === 'UNKNOWN_NO_OBSERVATIONS' ? 'UNKNOWN_BEFORE_FIRST_OBSERVATION' : a.status,
        b.status === 'UNKNOWN_NO_OBSERVATIONS' ? 'UNKNOWN_BEFORE_FIRST_OBSERVATION' : b.status, `${cik} ${d}`);
    }
  }
});

test('Datensatz: Index-Semantik, sortierte Beobachtungen, Verdachtsfenster nur mit Bestaetigung', () => {
  const index = JSON.parse(readFileSync(join(DEFAULT_DIR, 'index.json'), 'utf8'));
  assert.equal(index.schemaVersion, IC.SCHEMA);
  assert.deepEqual(index.fsdsSuspectQuarters, ['2013q3', '2013q4', '2014q1', '2014q2']);
  for (const q of Object.keys(index.crosscheck.disagreeByQuarter)) assert.ok(index.fsdsSuspectQuarters.includes(q), 'Abweichung ausserhalb des Fensters: ' + q);
  assert.match(index.semantics.currentSic, /nie rueckdatiert/);
  const shard = JSON.parse(gunzipSync(readFileSync(join(DEFAULT_DIR, 'issuers', '724.json.gz'))).toString('utf8')).issuers;
  for (const r of Object.values(shard)) for (let i = 1; i < r.observations.length; i++) assert.ok(r.observations[i - 1][0] <= r.observations[i][0]);
});
