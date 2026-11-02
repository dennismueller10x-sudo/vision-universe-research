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
  ROOT, DOC_PATH, PATHS, STATUS, DIMENSIONS, STATUS_DIMENSIONS, BLOCK_BEGIN, BLOCK_END, BLOCK_CLASSES, TECH_KINDS, HIST_COVERAGE,
  buildDocument, buildModel, checkDocument, splitDocument, testIdsOf, fileSha256, parseMatrixBlockers, matrixRowDimensions,
  classifyBlocker, countModel,
} from '../source-faithful/evidence/build-evidence-matrix.mjs';
import { loadPlan, runPlanTests } from '../source-faithful/certification/cert-prep-top5.mjs';

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
  const edited = BUILT.text.replace('| **BLOCKIERT**, Klasse', '| **BELEGT**, Klasse');
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

// ---------------------------------------------------------------- Einordnung 1.1.0: Klassen 1–4, Auswertung, Branch-Nachweise
const dimOf = (model, cid, id) => model.methods.find((m) => m.cid === cid).dims.find((d) => d.id === id);

test('MC3-EV-CLASSES: jeder BLOCKIERT-Punkt trägt Klasse 1, 2 oder 4 mit Ursache; OFFEN nur mit technisch lösbarem Blocker; Zählung im Dokument', () => {
  const cnt = countModel(BUILT.model);
  assert.equal(Object.values(cnt.now).reduce((a, b) => a + b, 0), 130);
  assert.equal(Object.values(cnt.base).reduce((a, b) => a + b, 0), 130);
  for (const { cid, d } of cnt.pts) {
    for (const b of d.blockers) {
      assert.ok(b.klass ? [1, 2, 4].includes(b.klass) : Object.keys(TECH_KINDS).includes(b.tech), `${cid} ${d.id} ${b.id}: weder Klasse noch technische Art`);
      assert.ok(b.why, `${cid} ${d.id} ${b.id}: Begründung fehlt`);
    }
    if (d.status === STATUS.BLOCKIERT) { assert.ok([1, 2, 4].includes(d.blockClass), `${cid} ${d.id}`); assert.ok(d.blockers.includes(d.cause), `${cid} ${d.id}: Ursache ist kein offener Blocker`); }
    else assert.equal(d.blockClass, undefined, `${cid} ${d.id}`);
    if (d.status === STATUS.OFFEN) assert.ok(d.blockers.some((b) => !b.klass), `${cid} ${d.id}: OFFEN ohne technisch lösbaren Blocker`);
    // nie schlechter belegt als nach 1.0.0; ein Statuswechsel nur durch Auswertung oder Einordnung OFFEN → BLOCKIERT
    if (d.statusBase === STATUS.BELEGT) assert.equal(d.status, STATUS.BELEGT, `${cid} ${d.id}`);
    if (d.status !== d.statusBase) assert.ok(d.reclassified || BUILT.model.evaluations.some((e) => e.cid === cid && e.dim === d.id), `${cid} ${d.id}: Statuswechsel ohne Auswertung`);
  }
  assert.equal(cnt.classesNow['3'], 0, 'Klasse 3 wird ausgewertet, nicht als Rest geführt');
  assert.equal(Object.values(cnt.classesNow).reduce((a, b) => a + b, 0), cnt.now.BLOCKIERT);
  assert.equal(Object.values(cnt.classesBase).reduce((a, b) => a + b, 0), cnt.base.BLOCKIERT);
  assert.ok(DOC.includes(`Ausgangsstand nach den Regeln 1.0.0: ${Object.values(STATUS).map((s) => `${s} ${cnt.base[s]}`).join(', ')}`));
  for (const [k, v] of Object.entries(BLOCK_CLASSES)) assert.ok(DOC.includes(`| ${k} | ${v} | ${cnt.classesBase[k]} | ${cnt.classesNow[k]} |`), `Klasse ${k} im Dokument`);
  // Gegenproben: unbekannter Blocker bricht ab; CC-5 ist immer Klasse 2, CC-8 immer Klasse 4
  assert.throws(() => classifyBlocker('C01', 'D1', { id: 'C01-NEU', closes: 'x' }, { merged: {}, refCode: {}, prs: {} }), /BLOCKER_CLASS_UNKNOWN/);
  for (const { d } of cnt.pts) for (const b of d.blockers) { if (/-(X-)?CC-?5$/.test(b.id)) assert.equal(b.klass, 2, b.id); if (/-(X-)?CC-?8$/.test(b.id)) assert.equal(b.klass, 4, b.id); }
});

test('MC3-EV-REFCODE: Turtle-Engine auf diesem Stand = gepinnter Referenz-Fingerabdruck und die Regeltreue-Tests von C01/C02 sind MET; Gegenprobe', () => {
  for (const cid of ['C01', 'C02']) assert.equal(BUILT.src.refCode[cid].state, 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT', cid);
  const plan = loadPlan();
  const r = runPlanTests({ ...plan, methods: plan.methods.filter((m) => ['C01', 'C02'].includes(m.candidateId)) });
  for (const cid of ['C01', 'C02']) { assert.equal(r[cid].acceptance, 'MET', `${cid}: ${JSON.stringify(r[cid].other)}`); assert.equal(r[cid].other.length, 0); }
  assert.ok(!dimOf(BUILT.model, 'C02', 'D1').blockers.some((b) => b.id === 'PS-C02-CONFORMANCE'));
  // Gegenprobe: weicht der Fingerabdruck ab, bleibt der Blocker (Klasse 1) und C02 Regeltreue TEILWEISE
  const differ = Object.fromEntries(Object.entries(BUILT.src.refCode).map(([k, v]) => [k, { ...v, state: 'HEAD_DIFFERS_FROM_PINNED_REFERENCE_FINGERPRINT' }]));
  const d = dimOf(buildModel({ ...BUILT.src, refCode: differ }), 'C02', 'D1');
  assert.equal(d.status, STATUS.TEILWEISE);
  assert.equal(d.blockers.find((b) => b.id === 'PS-C02-CONFORMANCE')?.klass, 1);
  // SF5-Lebenszyklen: kein Referenzwert gepinnt, Blocker bleibt
  for (const cid of ['C03', 'C08', 'C12']) assert.ok(dimOf(BUILT.model, cid, 'D1').blockers.some((b) => b.id === `PS-${cid}-CONFORMANCE` && b.klass === 1), cid);
});

test('MC3-EV-SAMPLE: statistische Aussagekraft TEILWEISE nur mit ausgewiesener Stichprobe und Hash-Gleichheit; Gegenprobe', () => {
  for (const e of BUILT.model.evaluations.filter((x) => x.id === 'E-SAMPLE')) {
    const d = dimOf(BUILT.model, e.cid, 'D10');
    assert.equal(d.statusBase, STATUS.OFFEN); assert.equal(d.status, STATUS.TEILWEISE);
    assert.ok(d.blockers.some((b) => b.id === `${e.cid}-ROBUSTNESS`), `${e.cid}: Robustheit bleibt offen`);
  }
  const readiness = structuredClone(BUILT.src.readiness);
  readiness.candidates.find((c) => c.candidateId === 'C03').dimensions.BACKTEST_REPRODUCIBILITY.e6.tradeStability = 'NOT_EVIDENCED';
  const d = dimOf(buildModel({ ...BUILT.src, readiness }), 'C03', 'D10');
  assert.equal(d.status, STATUS.BLOCKIERT, 'ohne Beleg und ohne technischen Anteil: BLOCKIERT');
});

test('MC3-EV-BRANCH-EVIDENCE: Nachweise aus #1233/#1234/#1235 zählen erst auf main; mit dem Stand von #1233 entfällt der Blocker', () => {
  const wf = ['.github', 'workflows', 'supertrader-st9-v13-study.yml'].join('/');
  assert.deepEqual(BUILT.src.merged, { all13: fs.existsSync(path.join(ROOT, 'scripts/supertrader/source-faithful/certification/CERT-PREP-ALL13-PLAN.json')), turtleStops: HIST_COVERAGE.V1_1.test(BUILT.src.histExecSrc), v13Workflow: fs.existsSync(path.join(ROOT, wf)) });
  const tagged = BUILT.model.methods.flatMap((m) => m.dims.flatMap((d) => d.blockers.filter((b) => b.tech === 'AUF_BRANCH')));
  for (const b of tagged) assert.match(b.why, /auf Branch, noch nicht gemergt/);
  if (!BUILT.src.merged.turtleStops) {
    assert.ok(dimOf(BUILT.model, 'C01', 'D5').blockers.some((b) => b.id === 'C01-HIST-UNIT-STOPS' && b.tech === 'AUF_BRANCH' && b.pr === '#1233'));
    // Stand von #1233 (auditRun 1.1.0): kein Blocker mehr, Stopps/Slippage/Kosten für C01/C02 BELEGT (CC-7 erfüllt)
    const v11 = BUILT.src.histExecSrc.replace(HIST_COVERAGE.V1_0, "missedStopCheck: lc ? 'SF5_CHECK_LIFECYCLE_RUN' : key.startsWith('MINERVINI_') ? 'MINERVINI_EVENT_PATH' : key.startsWith('TURTLE_') ? 'TURTLE_INDEPENDENT_N_UNIT_STOPS' : 'NOT_CHECKED_LEVEL_UNKNOWN'");
    assert.ok(HIST_COVERAGE.V1_1.test(v11));
    const m = buildModel({ ...BUILT.src, histExecSrc: v11, merged: { ...BUILT.src.merged, turtleStops: true } });
    for (const cid of ['C01', 'C02']) { const d = dimOf(m, cid, 'D5'); assert.ok(!d.blockers.some((b) => /HIST-UNIT-STOPS/.test(b.id)), cid); assert.equal(d.status, STATUS.BELEGT, cid); }
  }
  // ALL13 auf main: Blocker bleibt, aber als „auf main, noch nicht ausgewertet“ (kein stilles Anheben)
  const m13 = buildModel({ ...BUILT.src, merged: { ...BUILT.src.merged, all13: true } });
  assert.equal(dimOf(m13, 'C06', 'D1').blockers.find((x) => x.id === 'C06-CERT-PREP').tech, 'AUF_MAIN_NICHT_AUSGEWERTET');
  assert.equal(dimOf(m13, 'C06', 'D1').status, STATUS.OFFEN);
  // geänderte Prüfabdeckung ohne bekannte Fassung bricht ab
  assert.throws(() => buildModel({ ...BUILT.src, histExecSrc: BUILT.src.histExecSrc.replace(HIST_COVERAGE.V1_0, 'missedStopCheck: x') }), /HIST_EXECUTION_COVERAGE_CHANGED/);
});
