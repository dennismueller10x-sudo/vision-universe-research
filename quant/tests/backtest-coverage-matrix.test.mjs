// Q1: Backtesting-Coverage-Matrix (scripts/quant/research/backtest-coverage-matrix.cjs). Das committete Dokument
// docs/quant/BACKTEST_COVERAGE_MATRIX.md muss dem Erzeuger entsprechen (--check), die Zaehlungen muessen stimmen
// (6 Arten, 7 Methoden, 21 Auswahlen, 0 zertifiziert laut Artefakt), und ein Blocker ohne Begruendung bricht ab.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = 'scripts/quant/research/backtest-coverage-matrix.cjs';
const M = require('../../scripts/quant/research/backtest-coverage-matrix.cjs');
const Kinds = require('../engines/backtest-kinds.cjs');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const doc = fs.readFileSync(path.join(ROOT, M.DOC), 'utf8');
const section = (letter) => { const a = doc.indexOf('\n## ' + letter + '. '); const b = doc.indexOf('\n## ', a + 4); return doc.slice(a, b < 0 ? undefined : b); };
const tableRows = (text) => text.split('\n').filter(l => l.startsWith('| ') && !/^\|[-:|]+\|$/.test(l)).slice(1);

test('committetes Dokument entspricht dem Erzeuger (--check)', () => {
  const r = spawnSync(process.execPath, [CLI, '--check', M.DOC], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(M.build(), doc);
});

test('Zaehlungen: 6 Arten, 7 Methoden, 21 Auswahlen, 0 zertifiziert laut Artefakt', () => {
  const cert = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant/backtest-catalog/catalog.json'), 'utf8'));
  assert.equal(Kinds.KINDS.length, 6); assert.equal(Kinds.METHODS.length, 7); assert.equal(catalog.entries.length, 21);
  assert.equal(cert.kinds.filter(k => k.status === 'CERTIFIED').length, 0);
  assert.deepEqual(cert.measures.CERTIFIED_KINDS, []);
  assert.match(doc, /\| Backtest-Arten \| 6 \|/);
  assert.match(doc, /\| Zusatzmethoden \| 7 \|/);
  assert.match(doc, /\| Katalog-Auswahlen \| 21 \(Zustand A: 20, B: 1, C: 0\) \|/);
  assert.match(doc, /\| zertifizierte Arten laut Artefakt \| 0 von 6 \|/);
  // (a) 6 Zeilen x 7 Methodenspalten, "ja" genau dort, wo METHOD_FIT zulaesst
  const a = tableRows(section('A'));
  assert.equal(a.length, 6);
  for (const [i, k] of Kinds.KINDS.entries()) {
    const cells = a[i].split(' | ').slice(1);
    assert.equal(cells.length, 7, a[i]);
    Kinds.METHODS.forEach((m, j) => assert.equal(cells[j].replace(/ \|$/, '').startsWith('ja'), R.METHOD_FIT[m].includes(k), k + ':' + m));
  }
  const supported = Kinds.METHODS.reduce((n, m) => n + R.METHOD_FIT[m].length, 0);
  assert.match(doc, new RegExp('\\| zugelassene Kombinationen Art × Methode \\| ' + supported + ' von 42 \\|'));
  assert.equal((section('A').match(/^- `/gm) || []).length, 42 - supported, 'jede nicht zugelassene Kombination hat einen Grund');
  // (b) 21 Auswahlen mit Kennzahlen-Hash; (c) eine Unterueberschrift je Art; (d) eine Zeile je Art
  assert.equal(tableRows(section('B')).length, 21);
  for (const k of Kinds.KINDS) assert.ok(section('C').includes('### ' + k + ' · '), k);
  assert.equal(tableRows(section('D')).length, 6);
  assert.ok(tableRows(section('E')).length >= 10);
  assert.ok(section('F').includes('Integrität gesamt: **PASS**'));
  assert.ok(section('H').includes('**FV-1 · '));
});

test('jeder Blocker des Artefakts hat einen Loesungsweg aus den drei Arten (oder BEFUND)', () => {
  const cert = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
  for (const k of cert.kinds) for (const b of k.blockers) {
    const s = M.SOLVABILITY[k.id + ':' + b.id + ':' + b.reason];
    assert.ok(s, k.id + ':' + b.id + ':' + b.reason);
    assert.ok(['TECHNISCH', 'OWNER', 'ZEIT_DATEN', 'BEFUND'].includes(s[0]));
    assert.ok(s[1].length > 20);
  }
});

test('fail closed: ein neuer Blocker ohne Zuordnung bricht den Bau ab', () => {
  const src = M.sources();
  const cert = JSON.parse(JSON.stringify(src.cert));
  const k = cert.kinds.find(x => x.id === 'STRATEGY_BACKTEST');
  k.blockers.push({ id: 'neuesGate', category: 'QUALITY', reason: 'NEW_REASON', value: null, required: null });
  assert.throws(() => M.build({ ...src, cert }), /SOLVABILITY_MAPPING_MISSING:STRATEGY_BACKTEST:neuesGate:NEW_REASON/);
  const cert2 = JSON.parse(JSON.stringify(src.cert));
  cert2.kinds = cert2.kinds.filter(x => x.id !== 'SETUP_BACKTEST');
  assert.throws(() => M.build({ ...src, cert: cert2 }), /CERTIFICATION_KIND_MISSING:SETUP_BACKTEST/);
});

test('CLI: ohne --out nach stdout, --out schreibt nur die Datei, --check meldet Abweichung mit Exit 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-matrix-'));
  try {
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const out = execFileSync(process.execPath, [CLI], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(out, doc);
    const f = path.join(dir, 'm.md');
    execFileSync(process.execPath, [CLI, '--out', f], { cwd: ROOT });
    assert.equal(fs.readFileSync(f, 'utf8'), doc);
    fs.writeFileSync(f, doc.replace('| Backtest-Arten | 6 |', '| Backtest-Arten | 7 |'));
    const r = spawnSync(process.execPath, [CLI, '--check', f], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stderr, /weicht ab ab Zeile/);
    assert.equal(spawnSync(process.execPath, [CLI, '--bogus'], { cwd: ROOT }).status, 2);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
