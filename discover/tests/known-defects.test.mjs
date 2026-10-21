/* Register bekannter, unveraenderter Datenfehler im Discover-Browser-Gate (scripts/discover/known-defects.mjs).
   Die Ausnahme ist eng: nur exakte Signatur, nur eingetragene Route, ohne Seitenfehler, nur bei unveraendertem
   Fingerabdruck. Diese Tests belegen vor allem, wann sie NICHT greift. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fingerprint, loadRegister, activeDefects, matchKnown, createRecorder} from '../../scripts/discover/known-defects.mjs';
import {SPECS, verdict, fullSpec} from '../../scripts/discover/direct-link-lib.mjs';

const root = new URL('../../', import.meta.url).pathname;
const register = loadRegister();
const rhm = register.find(d => d.id === 'rheinmetall-europe-unavailable');
const active = [{...rhm, active: true}];
const CAUSE = 'h1 "Aktie derzeit nicht verfügbar" passt nicht zu /Rheinmetall/';
const SEEN = [CAUSE, 'Hauptbereich zu kurz: 103 < 800 Zeichen', 'kein sichtbarer Kursblock mit Preis'];

test('Register: jeder Eintrag ist vollstaendig belegt (Vorgang, Nachweis, Route, Signatur, Pfade, Fingerabdruck)', () => {
  assert.ok(register.length >= 1);
  for (const d of register) {
    for (const k of ['id', 'title', 'issue', 'owner', 'since', 'evidence', 'route', 'fingerprint']) assert.ok(d[k], d.id + ': ' + k);
    assert.ok(SPECS[d.route], d.id + ': Route ' + d.route + ' ist eine Gate-Route');
    assert.match(d.fingerprint, /^[0-9a-f]{64}$/);
    assert.ok(d.scope.length && d.scope.every(p => existsSync(join(root, p))), d.id + ': alle Pfade existieren');
    assert.ok(d.signature.cause && Array.isArray(d.signature.consequences));
  }
});

test('Signatur entspricht dem Text, den der Gate-Pruefer (verdict) fuer die nicht verfuegbare Aktie erzeugt', () => {
  const problems = verdict({hasMain: true, busy: 'false', h1: ['Aktie derzeit nicht verfügbar'], textLength: 103, strictHits: [], includesMissing: [],
    textReHit: true, priceOk: false, coreCount: 1, coreBad: '', coreSkeletons: 0, charts: []}, fullSpec(SPECS.rheinmetall));
  assert.ok(problems.length > 0);
  assert.ok(matchKnown(active, 'rheinmetall', problems, []), 'genau dieser Zustand ist der bekannte Fehler: ' + problems.join(' | '));
});

test('greift fuer den beobachteten Zustand (Lauf 39380525123)', () => {
  assert.equal(matchKnown(active, 'rheinmetall', SEEN, []).id, 'rheinmetall-europe-unavailable');
});

test('greift NICHT: andere Route, Seitenfehler, zusaetzliches Problem, fehlende Ursache, leere Liste', () => {
  assert.equal(matchKnown(active, 'nvda', SEEN, []), null, 'nur die eingetragene Route');
  assert.equal(matchKnown(active, 'rheinmetall', SEEN, ['TypeError: x']), null, 'Seitenfehler bleiben Fehler');
  assert.equal(matchKnown(active, 'rheinmetall', [...SEEN, 'aria-busy=true'], []), null, 'jedes weitere Problem bleibt Fehler');
  assert.equal(matchKnown(active, 'rheinmetall', [...SEEN, 'Ladefehler der Oberflaeche: "x"'], []), null);
  assert.equal(matchKnown(active, 'rheinmetall', ['Hauptbereich zu kurz: 103 < 800 Zeichen', 'kein sichtbarer Kursblock mit Preis'], []), null, 'ohne die Ursache keine Ausnahme');
  assert.equal(matchKnown(active, 'rheinmetall', ['h1 "Gerade nicht erreichbar" passt nicht zu /Rheinmetall/'], []), null, 'anderer Zustand ist ein neuer Fehler');
  assert.equal(matchKnown(active, 'rheinmetall', [], []), null);
});

test('greift NICHT, sobald sich Daten oder Code im Bereich aendern (Fingerabdruck)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vu-known-'));
  try {
    await mkdir(join(dir, 'data'), {recursive: true});
    await writeFile(join(dir, 'data/a.json'), '{"v":1}');
    await writeFile(join(dir, 'code.js'), 'x');
    const scope = ['data', 'code.js'], before = fingerprint(scope, dir);
    const defect = {...rhm, scope, fingerprint: before};
    assert.equal(activeDefects({defects: [defect], root: dir})[0].active, true);
    await writeFile(join(dir, 'data/a.json'), '{"v":2}');
    const after = activeDefects({defects: [defect], root: dir})[0];
    assert.equal(after.active, false, 'Daten geaendert -> Ausnahme inaktiv');
    assert.equal(matchKnown([after], 'rheinmetall', SEEN, []), null, 'inaktive Ausnahme absorbiert nichts');
    await writeFile(join(dir, 'data/a.json'), '{"v":1}');
    await writeFile(join(dir, 'data/b.json'), '{}');
    assert.equal(activeDefects({defects: [defect], root: dir})[0].active, false, 'neue Datei im Bereich -> inaktiv');
    await rm(join(dir, 'data/b.json'));
    await rm(join(dir, 'code.js'));
    assert.equal(activeDefects({defects: [defect], root: dir})[0].active, false, 'entfernte Datei -> inaktiv');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('Bericht macht den bekannten Fehler sichtbar und zaehlt die betroffenen Ladevorgaenge', () => {
  const recorder = createRecorder(active);
  assert.equal(recorder.absorb('rheinmetall', SEEN, []), true);
  assert.equal(recorder.absorb('rheinmetall', [...SEEN, 'aria-busy=true'], []), false);
  const [s] = recorder.summary();
  assert.deepEqual([s.id, s.issue, s.active, s.absorbedLoads], ['rheinmetall-europe-unavailable', '#778', true, 1]);
});
