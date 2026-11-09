// P2.1/P2.2: Integritaetsbericht der PIT-Historien und Prognose je HISTORY-Gate
// (scripts/quant/research/pit-snapshot-integrity.cjs). Nur lesen; Schwellen aus der Methodik.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const I = require('../../scripts/quant/research/pit-snapshot-integrity.cjs');
const PB = require('../engines/profile-backtest.js');
const CLI = 'scripts/quant/research/pit-snapshot-integrity.cjs';

test('Monats- und Handelstagsrechnung', () => {
  assert.equal(I.addMonths('2026-10', 22), '2028-08');
  assert.equal(I.addMonths('2026-12', 1), '2027-01');
  // Stand im laufenden Monat: der naechste zaehlende Monat ist der Folgemonat
  assert.equal(I.monthForecast(2, 24, '2026-10-30', '2026-10-31').earliestMonth, '2028-08');
  // laufender Monat noch ohne Stand: er kann noch zaehlen
  assert.equal(I.monthForecast(2, 24, '2026-10-30', '2026-11-02').earliestMonth, '2028-08');
  assert.equal(I.monthForecast(2, 3, '2026-10-30', '2026-10-31').earliestMonth, '2026-11');
  assert.equal(I.monthForecast(24, 24, '2028-08-01', '2028-08-02').met, true);
  const cal = I.calendar();
  assert.equal(I.nthTradingDayAfter(cal, '2026-11-25', 1), '2026-11-27', 'Thanksgiving 2026-11-26 ist kein Handelstag');
  assert.equal(I.nthTradingDayAfter(cal, '2026-10-30', 1), '2026-11-02', 'Wochenende');
  assert.deepEqual(I.tradingDays(cal, '2026-12-24', '2026-12-28'), ['2026-12-24', '2026-12-28']);
});

test('Repository zum Stichtag der Matrix: Integritaet PASS, Zaehlung wie der Zertifizierungs-Builder', () => {
  const rep = I.report({ asOf: '2026-10-31' });
  assert.equal(rep.schemaVersion, 'pit-snapshot-integrity-1.0.0');
  assert.equal(rep.integrity, 'PASS', JSON.stringify(rep.series.flatMap(s => s.problems)));
  const factor = rep.series.find(s => s.id === 'FACTOR_SNAPSHOTS');
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/factor-evidence-history/index.json'), 'utf8'));
  const dates = idx.series[rep.factorVersion].filter(d => d <= '2026-10-31');
  const cov = PB.historyCoverage(dates, '2026-10-31');
  assert.equal(factor.months, cov.months); assert.equal(factor.snapshots, cov.snapshots); assert.equal(factor.maxGapDays, cov.maxGapDays);
  assert.equal(factor.contentHash.verified, factor.snapshots);
  const g = (k, id) => rep.gates.find(x => x.kind === k && x.gate === id);
  const req = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/methodology/backtest-certification-v1.json'), 'utf8')).kinds;
  assert.equal(g('STRATEGY_BACKTEST', 'factorHistory').required, req.STRATEGY_BACKTEST.requirements.factorSnapshotsMonthly);
  assert.equal(g('SETUP_BACKTEST', 'historyDates').required, req.SETUP_BACKTEST.requirements.historyDates);
  assert.equal(g('STRATEGY_BACKTEST', 'factorHistory').earliestMonth, '2028-08');
  assert.equal(g('SETUP_BACKTEST', 'oos').earliestDate, null);
  assert.ok(rep.kinds.find(k => k.kind === 'SETUP_BACKTEST').notForecastable.includes('oos'));
});

function fixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pit-integrity-'));
  const cp = (rel) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel)); };
  cp('quant/config/market-calendar.json'); cp('quant/methodology/backtest-certification-v1.json');
  const put = (rel, doc, gz) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const b = Buffer.from(JSON.stringify(doc)); fs.writeFileSync(f, gz ? zlib.gzipSync(b) : b); };
  const hashed = (doc, len) => ({ ...doc, contentHash: crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, len) });
  const fDates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02'];
  put('quant/data/product/factor-evidence-history/index.json', { series: { 'vu-factor-evidence-2.0.0': [...fDates, '2026-10-05'] } });
  for (const d of fDates) put('quant/data/product/factor-evidence-history/vu-factor-evidence-2.0.0/' + d + '.json.gz', hashed({ asOf: d, rows: [] }, 16), true);
  // ein veraenderter Stand: contentHash passt nicht mehr
  put('quant/data/product/factor-evidence-history/vu-factor-evidence-2.0.0/2026-09-29.json.gz', { ...hashed({ asOf: '2026-09-29', rows: [] }, 16), rows: [1] }, true);
  for (const ix of ['SP500', 'NDX', 'DJIA']) for (const d of ['2026-09-26', '2026-10-03', '2026-10-24']) put('quant/data/market/index-membership/history/' + ix + '/' + d + '.json', { asOf: d === '2026-10-24' && ix === 'SP500' ? '2026-10-23' : d });
  const sDates = ['2026-09-30', '2026-10-01'];
  put('quant/data/product/setup-observation-history/index.json', { series: { 'setup-mapping-1.0.0': sDates } });
  for (const d of sDates) put('quant/data/product/setup-observation-history/setup-mapping-1.0.0/' + d + '.json.gz', hashed({ asOf: d, rows: {} }, 32), true);
  put('quant/data/product/setup-outcomes-v1.json', { events: [['AAA', 'SETUP_NEW', '2026-10-01'], ['BBB', 'SETUP_NEW', '2026-11-03']] });
  return dir;
}

test('Fixture: veraenderter Stand, Index ohne Datei, asOf gegen Dateiname, fehlende Handelstage und Wochen werden gemeldet', () => {
  const dir = fixtureRoot();
  try {
    const rep = I.report({ asOf: '2026-10-31', root: dir });
    assert.equal(rep.integrity, 'FAIL');
    const f = rep.series.find(s => s.id === 'FACTOR_SNAPSHOTS');
    assert.deepEqual(f.problems.map(p => p.date + ':' + p.code).sort(), ['2026-09-29:CONTENT_HASH_MISMATCH', '2026-10-05:IN_INDEX_NOT_ON_DISK']);
    assert.deepEqual(f.missingSlots.missing, ['2026-10-01']);
    assert.equal(f.contentHash.verified, 3);
    const m = rep.series.find(s => s.id === 'MEMBERSHIP_SP500');
    assert.deepEqual(m.problems.map(p => p.code), ['AS_OF_DIFFERS_FROM_FILE_NAME']);
    assert.deepEqual(m.missingSlots.missing, ['2026-10-03..2026-10-24 (21 Tage)']);
    assert.equal(rep.series.find(s => s.id === 'SETUP_OBSERVATIONS').integrity, 'PASS');
    // Ereignisse nach dem Stichtag zaehlen nicht
    assert.equal(rep.gates.find(g => g.gate === 'completedOutcomes').eventsToDate.SETUP_NEW, 1);
    // Stichtag vor dem veraenderten Stand: der Abschnitt bleibt PASS
    const early = I.report({ asOf: '2026-09-28', root: dir });
    assert.equal(early.series.find(s => s.id === 'FACTOR_SNAPSHOTS').integrity, 'PASS');
    // CLI: --out schreibt nur die Datei; Integritaetsfehler = Exit 1
    const out = path.join(dir, 'r.json');
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(spawnSync(process.execPath, [CLI, '--as-of', '2026-10-31', '--out', out], { cwd: ROOT }).status, 0);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).asOf, '2026-10-31');
    assert.equal(spawnSync(process.execPath, [CLI, '--as-of', '2026-13-01'], { cwd: ROOT }).status, 2);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
