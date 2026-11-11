// Versionierte UI-Byte-Sperre: Basis bleibt eingefroren (SMF-1), Revisionen einzeln, verkettet und fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { effectiveLock, loadRevisions, REVISIONS_FILE, REVISIONS_DIR, LEGACY_COUNT } from '../../scripts/quality/ui-protection.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const REV = loadRevisions(ROOT);
const LEGACY = JSON.parse(readFileSync(join(ROOT, REVISIONS_FILE), 'utf8'));

test('UIP-1 · Basis unveraendert und im Freeze-Manifest; jede Revision einzeln mit PR und Owner-Freigabe', () => {
  const baseBytes = readFileSync(join(ROOT, REV.base.file));
  assert.equal(sha(baseBytes), REV.base.sha256);
  const freeze = JSON.parse(readFileSync(join(ROOT, 'docs/data/security-master/v130-quant-freeze.json'), 'utf8'));
  assert.equal(freeze.frozen.files[REV.base.file], REV.base.sha256, 'Basis = eingefrorener V5.1-Nachweis');
  const lock = effectiveLock(ROOT);
  const base = JSON.parse(baseBytes);
  assert.deepEqual(Object.keys(lock.files).sort(), Object.keys(base.files).sort(), 'keine Datei hinzugefuegt oder entfernt');
  const changed = Object.keys(base.files).filter((f) => base.files[f] !== lock.files[f]);
  assert.deepEqual(changed.sort(), [...new Set(REV.revisions.map((r) => r.file))].sort(), 'nur die Dateien der Revisionen weichen ab');
  for (const r of REV.revisions) { assert.ok(Number.isInteger(r.pr) && r.pr > 0); assert.match(r.ownerApproval, /Owner/); }
});

test('UIP-2 · fail closed: Basis geaendert, Kette gebrochen, ungesperrte Datei, Pflichtfeld fehlt, doppelte Revision', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uip-'));
  try {
    mkdirSync(join(tmp, dirname(REV.base.file)), { recursive: true });
    cpSync(join(ROOT, REV.base.file), join(tmp, REV.base.file));
    const r0 = REV.revisions[0];
    assert.throws(() => effectiveLock(tmp, { ...REV, revisions: [{ ...r0, from: 'a'.repeat(64) }] }), /CHAIN_BROKEN/);
    assert.throws(() => effectiveLock(tmp, { ...REV, revisions: [{ ...r0, file: 'gibt/es/nicht.js' }] }), /FILE_NOT_LOCKED/);
    assert.throws(() => effectiveLock(tmp, { ...REV, revisions: [{ ...r0, ownerApproval: '' }] }), /FIELD_MISSING:ownerApproval/);
    assert.throws(() => effectiveLock(tmp, { ...REV, revisions: [r0, { ...r0, from: r0.to, to: 'b'.repeat(64) }] }), /DUPLICATE/);
    assert.throws(() => effectiveLock(tmp, { ...REV, schemaVersion: 'x' }), /REVISIONS_INVALID/);
    const base = JSON.parse(readFileSync(join(tmp, REV.base.file), 'utf8')); base.rule += ' '; writeFileSync(join(tmp, REV.base.file), JSON.stringify(base));
    assert.throws(() => effectiveLock(tmp, REV), /BASE_CHANGED/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('UIP-3 · alte Revisionen eingefroren; neue je Datei ohne Nummer, Kette unabhaengig von der Reihenfolge', () => {
  assert.equal(LEGACY.revisions.length, LEGACY_COUNT, 'neue Revisionen als Datei in ' + REVISIONS_DIR + ', nicht in ' + REVISIONS_FILE);
  assert.equal(LEGACY.revisions.at(-1).id, 'UIP-R179');
  const tmp = mkdtempSync(join(tmpdir(), 'uip-'));
  try {
    mkdirSync(join(tmp, dirname(REV.base.file)), { recursive: true });
    cpSync(join(ROOT, REV.base.file), join(tmp, REV.base.file));
    const file = Object.keys(JSON.parse(readFileSync(join(tmp, REV.base.file), 'utf8')).files)[0];
    const h0 = JSON.parse(readFileSync(join(tmp, REV.base.file), 'utf8')).files[file];
    const mk = (id, from, to) => ({ id, date: '2026-11-11', pr: 1, ownerApproval: 'Owner im Chat', file, from, to, scope: 'x' });
    const a = mk('a', h0, 'a'.repeat(64)), b = mk('b', 'a'.repeat(64), 'b'.repeat(64));
    const base = { schemaVersion: REV.schemaVersion, base: REV.base };
    // spaetere Revision steht vor der frueheren: Kette loest sich trotzdem auf
    assert.equal(effectiveLock(tmp, { ...base, revisions: [b, a] }).files[file], 'b'.repeat(64));
    // zwei Revisionen mit demselben "from" (parallele PRs auf dieselbe Datei) brechen die Kette
    assert.throws(() => effectiveLock(tmp, { ...base, revisions: [a, mk('c', h0, 'c'.repeat(64))] }), /CHAIN_BROKEN/);
    // Datei im Ordner: id = Dateiname
    mkdirSync(join(tmp, 'docs/quality'), { recursive: true });
    writeFileSync(join(tmp, REVISIONS_FILE), JSON.stringify({ ...base, purpose: 'x', revisions: [] }));
    mkdirSync(join(tmp, REVISIONS_DIR));
    const { id, ...ohneId } = a;
    writeFileSync(join(tmp, REVISIONS_DIR, 'meine-aenderung.json'), JSON.stringify(ohneId));
    const lock = effectiveLock(tmp);
    assert.deepEqual(lock.revisions, ['meine-aenderung']);
    assert.equal(lock.files[file], 'a'.repeat(64));
    writeFileSync(join(tmp, REVISIONS_DIR, 'Ungueltig Nummer.json'), JSON.stringify(ohneId));
    assert.throws(() => effectiveLock(tmp), /SLUG_INVALID/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
