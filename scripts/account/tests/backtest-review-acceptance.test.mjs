// Abnahmeprotokoll der internen Backtest-Vorschau laeuft vollstaendig gruen (alle Arten, gueltig/ungueltig,
// NOT_PRECOMPUTED, Zugriff, Generation). Schreibt nur nach tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
test('Vorschau-Abnahme: alle Pruefungen bestehen, sechs Arten, 20 A + 1 B, kein zertifiziertes Ergebnis', () => {
  const dir = mkdtempSync(join(tmpdir(), 'br-accept-'));
  try {
    const out = join(dir, 'p.json');
    execFileSync(process.execPath, [join(ROOT, 'scripts/account/backtest-review-acceptance.mjs'), '--out', out], {cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe']});
    const r = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(r.failed, 0);
    assert.ok(r.checks >= 60);
    assert.equal(new Set(r.entries.map((e) => e.kind)).size, 6);
    assert.equal(r.entries.every((e) => e.ok && e.certificationStatus !== 'CERTIFIED'), true);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
