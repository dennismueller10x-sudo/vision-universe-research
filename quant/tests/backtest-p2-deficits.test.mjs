// P2 (Master Completion 3.1): Research-Werkzeuge gegen Zertifizierungsdefizite, ohne Gate-, Schwellen- oder Runner-
// Aenderung. Synthetische Eingaben ueber die Test-Naht des Runners (options.deps); nichts hier ist echte Marktdaten.
//   survivorship-sensitivity.cjs (P3.1), pattern-total-return.mjs (P4.1), catalog-private-recheck.cjs (FV-4),
//   setup-independence-readings.cjs (FV-1), pit-snapshot-integrity.cjs --alarm-detail/--fail-on-missing-month (FV-8)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { syntheticWorld, baseSpec, NEAR_HIGH, TICKERS } from './helpers/backtest-runner-fixtures.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const SS = require('../../scripts/quant/research/survivorship-sensitivity.cjs');
const CR = require('../../scripts/quant/research/catalog-private-recheck.cjs');
const SI = require('../../scripts/quant/research/setup-independence-readings.cjs');
const PI = require('../../scripts/quant/research/pit-snapshot-integrity.cjs');
const PTR = await import('../../scripts/quant/research/pattern-total-return.mjs');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));

/* Synthetische Welt mit Ueberlebenden (F0) und delisteten Listings (nur im Profil V13_DELISTED_F1). */
function worldWithDelisted() {
  const W = syntheticWorld();
  const dl = new Map();
  ['X1', 'X2', 'X3'].forEach((t, k) => {
    const id = 'dl_' + t.toLowerCase() + 'synthetic', end = ['2017-06-30', '2018-03-30', '2019-09-27'][k];
    const points = W.calendar.filter(d => d >= '2003-01-03' && d <= end).map((d, i) => [d, Math.round(30 * (1 + 0.25 * Math.sin(i / (6 + k))) * Math.exp(-0.0008 * i * (k + 1)) * 1e4) / 1e4]);
    dl.set(id, { securityId: id, ticker: t, listingId: 'v13delisted:NYSE:' + t, listingStart: '2003-01-03', mic: 'XNYS', identityHash: sha('dl|' + id), masterGeneratedAt: '2026-10-01T00:00:00Z', asOf: end,
      points, listingLifecycle: { status: 'DELISTED', lastTradeDate: end, terminal: { kind: 'MERGER' } }, corporateActionQuality: { status: 'CLEAN', items: [] }, corporateActions: { splits: [] }, warnings: ['SYNTHETIC_TEST_FIXTURE'] });
  });
  const base = W.population();
  const population = (profile) => {
    if (profile !== 'V13_DELISTED_F1') return base;
    const ids = [...base.summary.frameIds, ...dl.keys()].sort();
    const summary = { ...base.summary, frameIds: ids, frameSize: ids.length, populationHash: sha('f1|' + ids.join(',')) };
    const docOf = id => dl.get(id) || base.docOf(id);
    return { summary, frameSet: new Set(ids), docOf, tryLoad: id => { try { return { doc: docOf(id) }; } catch (e) { return { error: 'SERIES_FILE_MISSING' }; } } };
  };
  return { W, dl, deps: { population, benchmark: W.benchmark } };
}
const patternBase = () => ({ ...baseSpec('PATTERN_EVIDENCE', { engine: { pattern: NEAR_HIGH, cooldownBars: 13, horizonBars: 13 } }), id: 'tpl-pattern', methods: { MARKET_REGIME: {} } });
const signalBase = () => ({ ...baseSpec('SIGNAL_BACKTEST', { engine: { ruleIds: ['NEW_52W_HIGH', 'TREND_UP'], horizonBars: 13, funded: { rule: 'NEW_52W_HIGH', maxPositions: 2, holdingWeeks: 13 } } }), id: 'tpl-signal', methods: { PORTFOLIO_REBALANCING: {} } });

test('P3.1 Spezifikationen: Population aus dem Rahmen, gleiche Stichprobe, ohne Titel, Methoden und finanzierte Variante', () => {
  const { survivors, delisted } = SS.sensitivitySpecs(signalBase(), { sample: 7, seed: 's' });
  assert.deepEqual(survivors.population, { profile: 'V10_LIFECYCLE', sample: { size: 7, seed: 's' } });
  assert.deepEqual(delisted.population, { profile: 'V13_DELISTED_F1', sample: { size: 7, seed: 's' }, privateInputs: ['delistedSeries'] });
  for (const s of [survivors, delisted]) { assert.equal(s.methods, undefined); assert.equal(s.engine.funded, undefined); assert.equal(s.population.tickers, undefined); }
  assert.equal(SS.sensitivitySpecs(patternBase(), { frame: 'F1W' }).delisted.population.profile, 'V13B_DELISTED_F1W');
  assert.throws(() => SS.sensitivitySpecs({ ...patternBase(), kind: 'STRATEGY_BACKTEST' }), /KIND_NOT_SUPPORTED/);
  assert.throws(() => SS.sensitivitySpecs(patternBase(), { frame: 'F9' }), /FRAME_UNKNOWN/);
});

test('P3.1 mit privaten Reihen: beide Laeufe A, delistete Ereignisse getrennt ausgewiesen, Differenz = mit minus ohne', () => {
  const { deps } = worldWithDelisted();
  const dir = tmp('p31-dl-');
  try {
    for (const base of [patternBase(), signalBase()]) {
      const c = SS.runCase(base, { sample: 9, seed: 'fixture' }, { privateDirs: { delistedSeries: dir }, deps });
      assert.equal(c.state, 'RESEARCH_EXECUTED', base.kind);
      assert.equal(c.survivors.population.delistedListings, 0);
      assert.equal(c.withDelisted.population.delistedListings, 3);
      assert.equal(c.survivors.population.listings, 6); // nur 6 Ueberlebende im Rahmen
      assert.equal(c.withDelisted.population.listings, 9);
      assert.deepEqual(c.survivors.contractViolations, []); assert.deepEqual(c.withDelisted.contractViolations, []);
      assert.equal(c.withDelisted.population.survivorship, 'INCLUDES_PRIVATE_DELISTED_SERIES');
      assert.ok(c.withDelisted.fromDelistedSeries.occurrences > 0, base.kind);
      assert.equal(c.delta.meanNetReturn, c.withDelisted.perEvent.mean - c.survivors.perEvent.mean);
      const text = JSON.stringify(c);
      assert.ok(!text.includes('"points"') && !text.includes('"qa"') && !text.includes('netReturn":0.'), 'keine Reihen, keine Ereigniszeilen');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P3.1 Stichprobe: die Ueberlebenden des Delisted-Laufs sind ein Anfang der Ueberlebenden-Stichprobe', () => {
  const { deps } = worldWithDelisted();
  const dir = tmp('p31-sample-');
  try {
    const { survivors, delisted } = SS.sensitivitySpecs(patternBase(), { sample: 5, seed: 'fixture' });
    const a = R.runBacktest(survivors, { deps }), b = R.runBacktest(delisted, { deps, privateDirs: { delistedSeries: dir } });
    const sa = a.population.listings.map(l => l.securityId), sb = b.population.listings.map(l => l.securityId);
    assert.equal(sa.length, 5); assert.equal(sb.length, 5);
    const survivorsInB = sb.filter(x => x.startsWith('ref_'));
    assert.deepEqual(survivorsInB, sa.slice(0, survivorsInB.length));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P3.1 ohne private Reihen: Ueberlebende A, Delisted-Lauf B, Bericht PREPARED_PRIVATE_INPUT_MISSING mit Freigabeweg', () => {
  const { deps } = worldWithDelisted();
  const c = SS.runCase(patternBase(), { sample: 6 }, { deps });
  assert.equal(c.state, 'PREPARED_PRIVATE_INPUT_MISSING');
  assert.equal(c.survivors.state, 'RESEARCH_EXECUTED');
  assert.equal(c.withDelisted.state, 'PREPARED_DATA_LIMITED');
  assert.match(c.withDelisted.missing.join(' '), /PRIVATE_DATA_UNAVAILABLE:delistedSeries/);
  assert.equal(c.delta, null);
  const rep = SS.report([c], { frame: 'F1', sample: 6 });
  assert.equal(rep.state, 'PREPARED_PRIVATE_INPUT_MISSING');
  assert.equal(rep.gateInput, false); assert.equal(rep.productionApproved, false);
  assert.match(rep.freigabe.privateInput, /V13_ARCHIVE_PRIVATE_KEY/);
  const { reportHash, ...body } = rep;
  assert.equal(reportHash, sha(R.canonical(body)));
});

test('P3.1 CLI: --out Pflicht, nie unter quant/data, unbekannte Vorlage bricht ab', () => {
  assert.throws(() => SS.parse([]), /OUT_REQUIRED/);
  assert.throws(() => SS.parse(['--out', 'quant/data/x.json']), /OUT_INSIDE_GENERATED_DATA/);
  assert.throws(() => SS.parse(['--out', '/tmp/x.json', '--frame', 'F2']), /FRAME_UNKNOWN/);
  assert.throws(() => SS.main(['--out', path.join(os.tmpdir(), 'p31-x.json'), '--template', 'no-such-template'], { log() {} }), /TEMPLATE_UNKNOWN/);
});

/* P4.1: synthetische Tagesreihen mit Ausschuettung (Gesamtrendite waechst je Woche um 0,05 % schneller). */
function trWorld() {
  const W = syntheticWorld();
  const population = { calendar: W.calendar, docOf: id => W.population().docOf(id) };
  const daily = id => {
    if (id === 'ref_SYNF') return null;
    const d = W.docs.get(id); if (!d) return null;
    if (id === 'ref_SYNE') return { source: 'FIXTURE', dates: d.points.map(p => p[0]), close: Float64Array.from(d.points.map(p => p[1])), tr: null, totalReturn: false, trVerdict: { confirmed: false, state: 'REJECTED', reason: 'DIVIDEND_MISSING' } };
    const dates = d.points.map(p => p[0]), close = Float64Array.from(d.points.map(p => p[1]));
    return { source: 'FIXTURE', dates, close, tr: Float64Array.from(close.map((c, i) => c * Math.pow(1.0005, i))), totalReturn: true, trBasis: 'CANONICAL_TOTAL_RETURN', trVerdict: { confirmed: true, state: 'TOTAL_RETURN_RECONSTRUCTED', reason: null } };
  };
  const runner = s => R.runBacktest(s, { deps: { population: W.population, benchmark: W.benchmark } });
  const spec = { ...baseSpec('PATTERN_EVIDENCE', { engine: { pattern: NEAR_HIGH, cooldownBars: 13, horizonBars: 13 } }), benchmark: 'NONE' };
  return { W, population, daily, runner, spec };
}

test('P4.1 Gesamtrendite neben Kursrendite: Paritaet mit dem Runner, Ausschluesse mit Grund, Zerlegung der Differenz', () => {
  const { population, daily, runner, spec } = trWorld();
  const rep = PTR.compute({ spec, population, daily, runner });
  assert.equal(rep.parity.mismatches, 0); assert.ok(rep.parity.eventsCompared > 0);
  assert.equal(rep.cohort.requested, TICKERS.length); assert.equal(rep.cohort.included, TICKERS.length - 2);
  assert.deepEqual(rep.cohort.excluded.map(x => [x.ticker, x.reason]).sort(), [['SYNE', 'TOTAL_RETURN_NOT_CONFIRMED:DIVIDEND_MISSING'], ['SYNF', 'NO_DAILY_HISTORY_WITH_DISTRIBUTIONS']]);
  assert.equal(rep.priceReturn.returnBasis, 'PRICE_RETURN'); assert.equal(rep.totalReturn.returnBasis, 'TOTAL_RETURN');
  assert.equal(rep.priceReturn.events.occurrences, rep.totalReturn.events.occurrences, 'dasselbe Muster auf Kursen: gleiche Ereignisse');
  assert.ok(rep.paired.pairs > 0);
  assert.ok(rep.paired.decomposition.distributions.min > 0, 'Ausschuettungen erhoehen jede Ereignisrendite');
  assert.equal(rep.paired.decomposition.weeklySeriesSource.max, 0); assert.equal(rep.paired.decomposition.weeklySeriesSource.min, 0);
  assert.equal(rep.gateInput, false); assert.equal(rep.productionApproved, false);
  const g = PTR.gateReading(rep, null);
  assert.equal(g.readsThisReport, false); assert.match(g.today, /STUDY_RETURN_BASIS_NOT_TOTAL_RETURN/);
  assert.equal(JSON.stringify(rep).includes('"events":['), false, 'keine Ereigniszeilen im Bericht');
});

test('P4.1 fail closed: abweichender Runner, Benchmark SPY, keine Gesamtrendite', () => {
  const { population, daily, runner, spec } = trWorld();
  const tampered = s => { const r = runner(s); r.qa.events[0] = { ...r.qa.events[0], netReturn: r.qa.events[0].netReturn + 0.01 }; return r; };
  assert.throws(() => PTR.compute({ spec, population, daily, runner: tampered }), /PARITY_WITH_RUNNER_FAILED/);
  assert.throws(() => PTR.compute({ spec: { ...spec, benchmark: 'SPY' }, population, daily, runner }), /BENCHMARK_MUST_BE_NONE/);
  assert.throws(() => PTR.compute({ spec, population, daily: () => null, runner }), /NO_TITLE_WITH_CONFIRMED_TOTAL_RETURN/);
  assert.throws(() => PTR.main(['--out', 'quant/data/x.json']), /OUT_INSIDE_GENERATED_DATA/);
});

test('P4.1 Vorlage: Muster, Horizont und Kosten aus der registrierten Vorlage, Benchmark NONE, Golden-Preview-Titel', () => {
  const spec = PTR.specFor({});
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant/backtest-demos/specs/pattern-2015-sideways.json'), 'utf8'));
  assert.deepEqual(spec.engine, tpl.engine); assert.deepEqual(spec.costs, tpl.costs);
  assert.equal(spec.benchmark, 'NONE'); assert.equal(spec.methods, undefined);
  assert.deepEqual(spec.population.tickers, fs.readdirSync(path.join(ROOT, PTR.GOLDEN_DIR)).filter(f => /^ref_.+\.json$/.test(f)).map(f => f.slice(4, -5)).sort());
});

test('FV-4 Erwartung der privaten Katalogfaelle: 5 Faelle, Vergleich mit sich selbst PASS, Abbruchgruende greifen', () => {
  const exp = CR.expectation();
  assert.equal(exp.privateCases, 5); assert.equal(exp.publicCases, 16); assert.equal(exp.run.mark, '[v13-archive:catalog]');
  assert.deepEqual(exp.cases.map(c => c.privateInputs.join('+')).sort(), ['delistedSeries', 'delistedSeries', 'factorPanel', 'factorPanel', 'factorPanel']);
  for (const c of exp.cases) { assert.ok(c.verify && c.verify.passed > 0 && c.verify.failed === 0, c.label); assert.ok(c.privateInputHashes && Object.keys(c.privateInputHashes).length, c.label); }
  const dir = tmp('fv4-');
  try {
    fs.cpSync(path.join(ROOT, 'docs/quant/backtest-catalog'), dir, { recursive: true });
    const verify = JSON.parse(fs.readFileSync(path.join(dir, 'verify-report.json'), 'utf8'));
    assert.equal(CR.compare(exp, dir, verify).verdict, 'PASS');
    const entry = exp.cases.find(c => c.kind === 'FACTOR_RANKING_BACKTEST'), f = path.join(dir, 'results', entry.specHash + '.json');
    const orig = fs.readFileSync(f, 'utf8'), r = JSON.parse(orig);
    // anderes Zertifizierungsdatum: nur Hinweis
    r.envelope.status.certificationSource = r.envelope.status.certificationSource.replace(/@\d{4}-\d{2}-\d{2}$/, '@2027-01-04');
    fs.writeFileSync(f, JSON.stringify(r));
    const dated = CR.compare(exp, dir, verify);
    assert.equal(dated.verdict, 'PASS'); assert.ok(dated.notes.some(n => n.expectedChange.includes('certificationDate')));
    // geaenderte Kennzahl: Abbruch
    r.envelope.metrics.perEvent = { ...(r.envelope.metrics.perEvent || {}), n: 999999 };
    fs.writeFileSync(f, JSON.stringify(r));
    assert.ok(CR.compare(exp, dir, verify).findings.some(x => x.code === 'METRICS_CHANGED'));
    // anderes Faktorpanel: Abbruch
    const r2 = JSON.parse(orig); r2.inputHashes.private.factorPanel = '0'.repeat(64);
    fs.writeFileSync(f, JSON.stringify(r2));
    assert.ok(CR.compare(exp, dir, verify).findings.some(x => x.code === 'PRIVATE_INPUT_DRIFT'));
    // Gegenrechnung mit Abweichungen: Abbruch
    fs.writeFileSync(f, orig);
    const bad = JSON.parse(JSON.stringify(verify)); bad.failures = 1; const k = Object.keys(bad.cases[entry.specHash])[0]; bad.cases[entry.specHash][k].failed = 1;
    assert.ok(CR.compare(exp, dir, bad).findings.some(x => x.code === 'VERIFY_FAILED'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.throws(() => CR.main(['--expect', '--out', 'quant/data/x.json']), /OUT_INSIDE_GENERATED_DATA/);
  assert.throws(() => CR.main(['--out', '/tmp/x.json']), /USAGE/);
});

test('FV-1 Lesarten: ISO-Wochen korrekt, Monate wie der Builder, beide Daten zum Stichtag der Matrix', () => {
  assert.deepEqual(SI.isoWeek('2026-01-01'), { key: '2026-W01', monday: '2025-12-29' });
  assert.deepEqual(SI.isoWeek('2024-12-30'), { key: '2025-W01', monday: '2024-12-30' });
  assert.deepEqual(SI.isoWeek('2027-01-03'), { key: '2026-W53', monday: '2026-12-28' });
  const r = SI.readings({ asOf: '2026-10-31' });
  const outcomes = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/setup-outcomes-v1.json'), 'utf8'));
  assert.equal(r.readingA.have, new Set(outcomes.events.filter(e => e[2] <= '2026-10-31').map(e => e[2].slice(0, 7))).size);
  assert.equal(r.threshold.value, 20);
  assert.equal(r.readingA.independenceBinds, true, 'unter A bindet das Gate');
  assert.equal(r.readingB.independenceBinds, false, 'unter B binden die Ergebnisgates');
  assert.ok(r.readingB.earliest < r.readingA.earliest + '-01');
  assert.ok(r.readingB.setupTimeGatesEarliest < r.readingA.setupTimeGatesEarliest);
  assert.ok(r.prior.every(p => /NOT_APPROVED/.test(p.status || '')), 'keine fruehere Vorlage ist freigegeben');
});

test('FV-8 Alarmtext und --fail-on-missing-month: ein fehlender Monat einer gezaehlten Reihe macht rot', () => {
  const rep = PI.report({ asOf: '2026-10-31' });
  assert.deepEqual(PI.alarmFindings(rep), []);
  assert.match(PI.alarmText(rep), /GRUEN/);
  const gap = JSON.parse(JSON.stringify(rep));
  gap.series.find(s => s.id === 'FACTOR_SNAPSHOTS').missingMonths = ['2026-11'];
  gap.series.find(s => s.id === 'MEMBERSHIP_NDX').missingMonths = ['2026-11'];
  const f = PI.alarmFindings(gap);
  assert.equal(f.length, 1, 'NDX ist nur Information'); assert.match(f[0], /FACTOR_SNAPSHOTS: fehlende Monate 2026-11/);
  assert.match(PI.alarmText(gap), /ROT/);
  const dir = tmp('fv8-');
  try {
    const detail = path.join(dir, 'detail.txt');
    const r = spawnSync(process.execPath, ['scripts/quant/research/pit-snapshot-integrity.cjs', '--as-of', '2026-10-31', '--out', path.join(dir, 'r.json'), '--alarm-detail', detail, '--fail-on-missing-month'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(detail, 'utf8'), /^PIT-Historien \(pit-snapshot-integrity, Stichtag 2026-10-31\): GRUEN/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('committete Research-Berichte unter docs/quant/research: Hash stimmt, kein Gate-Eingang, keine Produktfreigabe', () => {
  const dir = path.join(ROOT, 'docs/quant/research');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 4, files.join(','));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (r.reportHash) { const { reportHash, gate, dailySource, ...body } = r; assert.equal(reportHash, sha(R.canonical(body)), f); }
    if ('productionApproved' in r) assert.equal(r.productionApproved, false, f);
    if ('gateInput' in r) assert.equal(r.gateInput, false, f);
    assert.equal(JSON.stringify(r).includes('"points"'), false, f + ': keine Kursreihen');
  }
});
