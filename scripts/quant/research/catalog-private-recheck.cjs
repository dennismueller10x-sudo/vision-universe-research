#!/usr/bin/env node
'use strict';
// Gegenrechnung der privaten Katalogfaelle vorbereiten und auswerten (FV-4, catalog-private-recheck-1.0.0).
// Fuehrt nichts aus und liest kein privates Archiv: Es schreibt die Erwartung aus dem committeten Katalog und vergleicht
// spaeter den heruntergeladenen Ausgabeordner eines Laufs [v13-archive:catalog] (Artefakt v13-archive-catalog-<run>)
// mit ihr. Der Lauf selbst braucht das Secret V13_ARCHIVE_PRIVATE_KEY und ist eine Owner-Freigabe.
//
//   node scripts/quant/research/catalog-private-recheck.cjs --expect --out <erwartung.json>
//   node scripts/quant/research/catalog-private-recheck.cjs --compare <catalog-ordner> [--verify-report <verify-report.json>]
//        [--expectation <erwartung.json>] --out <befund.json>
// Erwartung je privatem Fall: specHash, resultHash, envelopeHash, inputHash, Kennzahlen-Hash (backtest-metrics-hash.cjs),
// die privaten Eingabe-Hashes (Faktorpanel-sha256 bzw. Delisted-Register und Reihen-Hash je Listing), die Code-Hashes
// des Runners und die Pruefzahl der Python-Gegenrechnung (verify-report.json).
// Abbruchkriterien beim Vergleich (Exit 1, Befund ABORT):
//   CATALOG_INTEGRITY            catalogViolations() des Ausgabeordners nicht leer
//   CASE_MISSING / STATE_CHANGED Fall fehlt oder hat einen anderen Zustand (A/B)
//   SPEC_CHANGED                 specHash weicht ab (anderes Raster)
//   PRIVATE_INPUT_DRIFT          Faktorpanel- oder Reihen-Hash weicht ab (Archiv entspricht nicht dem Katalogstand)
//   METRICS_CHANGED              Kennzahlen-Hash weicht ab, auch nach Angleichen des Zertifizierungsdatums
//   VERIFY_FAILED                Python-Gegenrechnung mit Abweichungen oder weniger Pruefungen als erwartet
// Erwartete, zulaessige Abweichungen (nur gemeldet): Code-Hashes (Zweck des Laufs nach einer Code-Aenderung),
// resultHash/envelopeHash/inputHash (binden Code und das taeglich neue Zertifizierungsartefakt), Zertifizierungsdatum.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MH = require('./backtest-metrics-hash.cjs');
const C = require('./build-backtest-catalog.cjs');
const VERSION = 'catalog-private-recheck-1.0.0';
const CATALOG_DIR = 'docs/quant/backtest-catalog';
const MARK = '[v13-archive:catalog]';
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];

function fail(code, detail) { const e = new Error(code + (detail !== undefined ? ':' + detail : '')); e.code = code; throw e; }
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const CERT_SOURCE_DATE = /@\d{4}-\d{2}-\d{2}$/;

/** Kennzahlen-Hash mit angeglichenem Zertifizierungsdatum (status.certificationSource endet auf @JJJJ-MM-TT). */
function metricsHashDateless(result) {
  const r = JSON.parse(JSON.stringify(result));
  if (r.envelope && r.envelope.status && typeof r.envelope.status.certificationSource === 'string') r.envelope.status.certificationSource = r.envelope.status.certificationSource.replace(CERT_SOURCE_DATE, '@DATE');
  return MH.metricsHash(r);
}
function verifyCounts(report, specHash) {
  const c = report && report.cases ? report.cases[specHash] : null;
  if (!c) return null;
  let passed = 0, failed = 0;
  for (const x of Object.values(c)) { passed += x.passed || 0; failed += x.failed || 0; }
  return { checkGroups: Object.keys(c).length, passed, failed };
}

function expectation(dir = path.join(ROOT, CATALOG_DIR)) {
  const catalog = json(path.join(dir, 'catalog.json'));
  const verify = fs.existsSync(path.join(dir, 'verify-report.json')) ? json(path.join(dir, 'verify-report.json')) : null;
  const cases = [];
  catalog.entries.forEach((e, i) => {
    if (!(e.privateInputs || []).length) return;
    const r = json(path.join(dir, 'results', e.specHash + '.json'));
    cases.push({ index: i + 1, label: e.label, template: e.template, kind: e.kind, state: e.state, privateInputs: e.privateInputs,
      specHash: e.specHash, resultHash: e.resultHash, envelopeHash: e.envelopeHash, inputHash: e.inputHash,
      metricsHash: MH.metricsHash(r), metricsHashDateless: metricsHashDateless(r), certificationSource: r.envelope.status.certificationSource,
      privateInputHashes: r.inputHashes.private, codeHashesRoot: sha(JSON.stringify(r.inputHashes.code)), verify: verifyCounts(verify, e.specHash) });
  });
  return { schemaVersion: VERSION, catalog: CATALOG_DIR, catalogHash: catalog.catalogHash, runner: catalog.runner, entries: catalog.entries.length,
    privateCases: cases.length, publicCases: catalog.entries.length - cases.length, run: { mark: MARK, workflow: '.github/workflows/quant-v13-archive.yml', secret: 'V13_ARCHIVE_PRIVATE_KEY (+ VU_HISTORY_S3_*)', artifact: 'v13-archive-catalog-<run_id> (catalog/, verify-report.json)' },
    verifyBaseline: verify ? { results: verify.results, checks: verify.checks, failures: verify.failures, python: verify.python, tolerance: verify.tolerance } : null, cases };
}

function compare(expect, outDir, verifyReport = null) {
  const findings = [], notes = [];
  const viol = C.catalogViolations(outDir);
  if (viol.length) findings.push({ code: 'CATALOG_INTEGRITY', detail: viol.slice(0, 10) });
  const idx = json(path.join(outDir, 'catalog.json'));
  const byTemplateLabel = new Map(idx.entries.map(e => [e.label, e]));
  const cases = expect.cases.map(x => {
    const e = byTemplateLabel.get(x.label);
    if (!e) { findings.push({ code: 'CASE_MISSING', case: x.label }); return { label: x.label, verdict: 'ABORT' }; }
    const own = [];
    if (e.state !== x.state) own.push('STATE_CHANGED');
    if (e.specHash !== x.specHash) own.push('SPEC_CHANGED');
    const r = json(path.join(outDir, 'results', e.specHash + '.json'));
    if (JSON.stringify(r.inputHashes.private) !== JSON.stringify(x.privateInputHashes)) own.push('PRIVATE_INPUT_DRIFT');
    const m = MH.metricsHash(r), md = metricsHashDateless(r);
    if (md !== x.metricsHashDateless) own.push('METRICS_CHANGED');
    const v = verifyReport ? verifyCounts(verifyReport, e.specHash) : null;
    if (verifyReport && (!v || v.failed || (x.verify && v.passed < x.verify.passed))) own.push('VERIFY_FAILED');
    for (const c of own) findings.push({ code: c, case: x.label });
    const changed = ['resultHash', 'envelopeHash', 'inputHash'].filter(k => e[k] !== x[k]);
    if (changed.length) notes.push({ case: x.label, expectedChange: changed });
    if (sha(JSON.stringify(r.inputHashes.code)) !== x.codeHashesRoot) notes.push({ case: x.label, expectedChange: ['code'] });
    if (m !== x.metricsHash && md === x.metricsHashDateless) notes.push({ case: x.label, expectedChange: ['certificationDate'] });
    return { label: x.label, kind: x.kind, verdict: own.length ? 'ABORT' : 'PASS', metricsHash: m, metricsHashDateless: md, verify: v };
  });
  if (verifyReport && verifyReport.failures) findings.push({ code: 'VERIFY_FAILED', detail: 'failures=' + verifyReport.failures });
  return { schemaVersion: VERSION, expectationCatalogHash: expect.catalogHash, comparedCatalogHash: idx.catalogHash, verdict: findings.length ? 'ABORT' : 'PASS', findings, notes, cases };
}

function guardOut(out) {
  const rel = path.relative(ROOT, path.resolve(out));
  if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) fail('OUT_INSIDE_GENERATED_DATA', rel);
}
function main(argv = process.argv.slice(2), io = { log: s => console.log(s) }) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect') { o.expect = true; continue; }
    const k = { '--out': 'out', '--compare': 'compare', '--verify-report': 'verify', '--expectation': 'expectation' }[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) fail('INVALID_ARGUMENTS', argv[i]);
    o[k] = argv[++i];
  }
  if (!o.out || (!!o.expect === !!o.compare)) fail('USAGE', '--expect --out <datei> | --compare <ordner> --out <datei>');
  guardOut(o.out);
  if (o.expect) {
    const e = expectation();
    fs.writeFileSync(o.out, JSON.stringify(e, null, 1) + '\n');
    io.log('[catalog-private-recheck] Erwartung: ' + e.privateCases + ' private Faelle · ' + o.out);
    return 0;
  }
  const exp = o.expectation ? json(o.expectation) : expectation();
  const res = compare(exp, o.compare, o.verify ? json(o.verify) : null);
  fs.writeFileSync(o.out, JSON.stringify(res, null, 1) + '\n');
  io.log('[catalog-private-recheck] ' + res.verdict + ' · ' + res.findings.length + ' Abbruchgruende · ' + o.out);
  return res.verdict === 'PASS' ? 0 : 1;
}
if (require.main === module) { try { process.exitCode = main(); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; } }
module.exports = { VERSION, MARK, expectation, compare, metricsHashDateless, verifyCounts, main };
