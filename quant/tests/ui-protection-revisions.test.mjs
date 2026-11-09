// Versionierte UI-Byte-Sperre: Basis bleibt eingefroren (SMF-1), Revisionen einzeln, verkettet und fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { effectiveLock, REVISIONS_FILE } from '../../scripts/quality/ui-protection.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const REV = JSON.parse(readFileSync(join(ROOT, REVISIONS_FILE), 'utf8'));

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
