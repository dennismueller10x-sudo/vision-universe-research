// Supertrader Master Completion 3.0 – Evidenznachweis der 13 Methoden: Dokument = Erzeuger, 13 Methoden, keine
// Zertifizierung ohne Beleg der Quelle, jeder Nachweispfad existiert. Gelesen wird nur; geschrieben nur in ein
// temporäres Verzeichnis außerhalb des Repositorys.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT, DOC_PATH, PATHS, STATUS, DIMENSIONS, STATUS_DIMENSIONS, BLOCK_BEGIN, BLOCK_END,
  buildDocument, buildModel, checkDocument, splitDocument, testIdsOf, fileSha256, parseMatrixBlockers, matrixRowDimensions,
} from '../source-faithful/evidence/build-evidence-matrix.mjs';

const GEN = path.join(ROOT, 'scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs');
const BUILT = await buildDocument();
const DOC = fs.readFileSync(path.join(ROOT, DOC_PATH), 'utf8');
const CIDS = Array.from({ length: 13 }, (_, k) => `C${String(k + 1).padStart(2, '0')}`);

test('MC3-EV-DOC-EQUALS-GENERATOR: das Dokument ist die Ausgabe des Erzeugers (nur der Datenstand darf neuer sein)', () => {
  const r = checkDocument(DOC, BUILT);
  assert.ok(['MATCH', 'DATA_STATE_NEWER'].includes(r.status), `${DOC_PATH} weicht vom Erzeuger ab: ${JSON.stringify(r)} – neu erzeugen mit node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs --out ${DOC_PATH}`);
});

test('MC3-EV-CHECK-PROBES: Gegenproben der Prüfung – fester Teil geändert = MISMATCH, nur Datenstand neuer = DATA_STATE_NEWER', () => {
  assert.equal(checkDocument(BUILT.text, BUILT).status, 'MATCH');
  // eine Statuszelle von Hand geändert
  const edited = BUILT.text.replace('| **BLOCKIERT** |', '| **BELEGT** |');
  assert.notEqual(edited, BUILT.text);
  assert.equal(checkDocument(edited, BUILT).status, 'MISMATCH');
  // Datenstand älter dokumentiert (wie nach einer neuen Veröffentlichung): zulässig
  const { block, meta } = splitDocument(BUILT.text);
  assert.ok(block && meta && meta.asOf && meta.master && meta.names);
  const older = BUILT.text.replace(block, block.replace(JSON.stringify(meta), JSON.stringify({ ...meta, asOf: '2026-01-02' })).replace(/Stichtag `asOf` [0-9.]+/, 'Stichtag `asOf` 02.01.2026'));
  assert.equal(checkDocument(older, BUILT).status, 'DATA_STATE_NEWER');
  // ein Datenstand aus der Zukunft ist nie zulässig
  const newer = BUILT.text.replace(block, block.replace(JSON.stringify(meta), JSON.stringify({ ...meta, asOf: '2099-01-02' })).replace(/Stichtag `asOf` [0-9.]+/, 'Stichtag `asOf` 02.01.2099'));
  assert.equal(checkDocument(newer, BUILT).status, 'MISMATCH');
  // ein entfernter Datenstand-Block ist nie zulässig
  assert.equal(checkDocument(BUILT.text.replace(block, ''), BUILT).status, 'MISMATCH');
  assert.ok(BUILT.text.includes(BLOCK_BEGIN) && BUILT.text.includes(BLOCK_END));
});

test('MC3-EV-13-METHODS: genau C01–C13, je 10 Prüfdimensionen und 8 Statusdimensionen, im Modell und im Dokument', () => {
  assert.deepEqual(BUILT.model.methods.map((m) => m.cid), CIDS);
  for (const m of BUILT.model.methods) {
    assert.deepEqual(m.dims.map((d) => d.id), DIMENSIONS.map((d) => d.id), m.cid);
    for (const d of m.dims) assert.ok(Object.values(STATUS).includes(d.status), `${m.cid} ${d.id}: ${d.status}`);
    assert.deepEqual(Object.keys(m.status), STATUS_DIMENSIONS, m.cid);
    assert.equal((DOC.match(new RegExp(`^### ${m.cid} – `, 'gm')) ?? []).length, 1, m.cid);
  }
  assert.equal(BUILT.model.methods.flatMap((m) => m.dims).length, 130);
});

test('MC3-EV-NO-CERTIFICATION-WITHOUT-SOURCE: keine Methode ist ZERTIFIZIERT, solange die Readiness es nicht belegt; Gegenproben', () => {
  const r = BUILT.src.readiness;
  for (const m of BUILT.model.methods) {
    const c = r.candidates.find((x) => x.candidateId === m.cid);
    const proven = c.certification !== 'DIAGNOSTIC_NOT_CERTIFIED' && (r.summary.certificationCandidates ?? []).includes(m.cid) && Object.values(c.certificationCriteria).every(Boolean);
    assert.equal(m.status.ZERTIFIZIERT.startsWith('JA'), proven, m.cid);
    if (!proven) assert.match(m.status.ZERTIFIZIERT, /^NEIN/, m.cid);
    assert.match(m.status.PRODUKTREIF, c.liveReadiness === 'LIVE_NOT_APPROVED' ? /^NEIN/ : /^JA/, m.cid);
  }
  // heute: keine Zertifizierung, keine Produktreife, keine fachliche Validierung (Stand der Quelle)
  assert.equal(r.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
  assert.ok(BUILT.model.methods.every((m) => /^NEIN/.test(m.status.ZERTIFIZIERT) && /^NEIN/.test(m.status.PRODUKTREIF) && /^NEIN/.test(m.status['FACHLICH VALIDIERT'])));
  assert.doesNotMatch(DOC, /\| ZERTIFIZIERT \| JA|zertifiziert: JA/i);
  // Gegenprobe 1: nur das Feld certification geändert, CC und Kandidatenliste nicht -> weiter NEIN
  const mut = (fn) => { const readiness = structuredClone(r); fn(readiness); return buildModel({ ...BUILT.src, readiness }).methods.find((m) => m.cid === 'C02'); };
  assert.match(mut((x) => { x.candidates.find((c) => c.candidateId === 'C02').certification = 'CERTIFIED'; }).status.ZERTIFIZIERT, /^NEIN/);
  // Gegenprobe 2: vollständiger Beleg (Feld, Kandidatenliste, CC-1..CC-8) -> JA; das Dokument folgt der Quelle
  const full = mut((x) => { const c = x.candidates.find((k) => k.candidateId === 'C02'); c.certification = 'CERTIFIED'; for (const k of Object.keys(c.certificationCriteria)) c.certificationCriteria[k] = true; x.summary.certificationCandidates = ['C02']; });
  assert.match(full.status.ZERTIFIZIERT, /^JA/);
});

test('MC3-EV-EVIDENCE-PATHS: jeder Nachweis- und Quellpfad existiert, jede Test-ID steht in ihrer Testdatei', () => {
  let files = 0, tests = 0;
  const exists = (f, where) => assert.ok(fs.existsSync(path.join(ROOT, f)), `${where}: ${f} fehlt`);
  for (const m of BUILT.model.methods) for (const d of m.dims) {
    for (const r of d.evidence) {
      if (r.kind === 'file') { exists(r.file, `${m.cid} ${d.id}`); files++; }
      if (r.kind === 'test') { exists(r.file, `${m.cid} ${d.id}`); assert.ok(testIdsOf(r.file).has(r.id), `${m.cid} ${d.id}: ${r.id} nicht in ${r.file}`); tests++; }
      if (r.kind === 'run') assert.match(String(r.id), /^\d{10,12}$/, `${m.cid} ${d.id}: Lauf-ID`);
    }
    for (const b of d.blockers) {
      assert.ok(b.text && b.closes && b.who.length && b.source, `${m.cid} ${d.id}: Blocker unvollständig`);
      for (const p of b.source.match(/(?:docs|scripts|supertrader|core|quant)\/[\w./-]+\.(?:md|mjs|json|js)/g) ?? []) exists(p, `${m.cid} ${d.id} Quelle`);
    }
    if (d.status !== STATUS.BELEGT) assert.ok(d.blockers.length > 0, `${m.cid} ${d.id}: ${d.status} ohne Blocker`);
    else assert.equal(d.blockers.length, 0, `${m.cid} ${d.id}: BELEGT mit offenem Blocker`);
  }
  assert.ok(files > 100 && tests > 50, `zu wenige Nachweise (Dateien ${files}, Tests ${tests})`);
  for (const p of DOC.match(/`((?:docs|scripts|supertrader|core|quant)\/[\w./-]+\.(?:md|mjs|json|js))`/g) ?? []) exists(p.slice(1, -1), 'Dokument');
  for (const f of Object.values(PATHS).flat()) exists(f, 'PATHS');
});

test('MC3-EV-SOURCES-PINNED: die gepinnte Readiness-Matrix ist unverändert; Matrix-Blocker vollständig zugeordnet', () => {
  assert.equal(fileSha256(PATHS.matrixDoc), BUILT.src.plan.dependsOn.sha256);
  const mb = parseMatrixBlockers(BUILT.src.matrixText);
  assert.deepEqual(Object.keys(mb), CIDS);
  for (const [cid, b] of Object.entries(mb)) { assert.ok(b.rows.length > 0, cid); for (const r of b.rows) assert.ok(matrixRowDimensions(r.blocker).dims.length > 0, `${cid} ${r.blocker}`); }
  assert.throws(() => matrixRowDimensions('Neuer Blocker'), /MATRIX_BLOCKER_KEY_UNKNOWN/);
});

test('MC3-EV-CLI: schreibt nur mit --out, --check liefert MATCH für frische Ausgabe und Exit 1 bei Abweichung', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-mc3-ev-'));
  try {
    const out = path.join(dir, 'ev.md');
    const before = fs.readFileSync(path.join(ROOT, DOC_PATH));
    const a = spawnSync(process.execPath, [GEN], { cwd: dir, encoding: 'utf8' });
    assert.equal(a.status, 0, a.stderr);
    assert.deepEqual(fs.readdirSync(dir), [], 'ohne --out wird nichts geschrieben');
    assert.ok(a.stdout.startsWith('# Supertrader – Evidenznachweis der 13 Methoden'));
    const b = spawnSync(process.execPath, [GEN, '--out', out], { encoding: 'utf8' });
    assert.equal(b.status, 0, b.stderr);
    const c = spawnSync(process.execPath, [GEN, '--check', out], { encoding: 'utf8' });
    assert.equal(c.status, 0); assert.equal(JSON.parse(c.stdout).status, 'MATCH');
    fs.writeFileSync(out, fs.readFileSync(out, 'utf8').replace('BLOCKIERT', 'BELEGT'));
    const d = spawnSync(process.execPath, [GEN, '--check', out], { encoding: 'utf8' });
    assert.equal(d.status, 1); assert.equal(JSON.parse(d.stdout).status, 'MISMATCH');
    assert.deepEqual(fs.readFileSync(path.join(ROOT, DOC_PATH)), before, 'das committete Dokument bleibt unberührt');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('MC3-EV-DETERMINISTIC: zwei Läufe ergeben dasselbe Dokument; keine Zeitstempel des Laufs', async () => {
  const again = await buildDocument();
  assert.equal(again.text, BUILT.text);
  // kein Laufzeitstempel: die einzigen ISO-Zeitstempel sind die Erzeugungszeitpunkte der Stammdaten
  const stamps = [...new Set(BUILT.text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ?? [])].sort();
  assert.deepEqual(stamps, [...new Set([BUILT.src.master.generatedAt, BUILT.src.names.generatedAt])].sort());
});
