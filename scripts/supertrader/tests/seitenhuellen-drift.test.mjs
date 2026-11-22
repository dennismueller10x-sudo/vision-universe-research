// Vorlagen-Drift der Supertrader-Aktienseiten (22.11.2026): ausgelieferte Hüllen (supertrader/stock/<SYM>/index.html) müssen
// dem entsprechen, was der Erzeuger heute schreibt. Gebaut wird nach --out in ein Temp-Verzeichnis (kein Produktivartefakt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const STOCK = path.join(ROOT, 'supertrader', 'stock');

test('Seitenhüllen: jede ausgelieferte Aktienseite entspricht der Vorlage des Erzeugers (--pages-only)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-huellen-'));
  try {
    fs.symlinkSync(path.join(ROOT, 'supertrader', 'data'), path.join(tmp, 'data'));
    const syms = fs.readdirSync(STOCK, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    assert.ok(syms.length > 100, 'Hüllen vorhanden');
    for (const s of syms) fs.mkdirSync(path.join(tmp, 'stock', s), { recursive: true });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/supertrader/build.mjs'), '--pages-only', '--out=' + tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const abweichend = syms.filter((s) => {
      const neu = path.join(tmp, 'stock', s, 'index.html');
      return !fs.existsSync(neu) || fs.readFileSync(neu, 'utf8') !== fs.readFileSync(path.join(STOCK, s, 'index.html'), 'utf8');
    });
    assert.deepEqual(abweichend.slice(0, 20), [], abweichend.length + ' Hüllen weichen von der Vorlage ab: node scripts/supertrader/build.mjs --pages-only');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Seitenhüllen: alle tragen das dunkle Standard-Theme (data-theme per Skript, Vorgabe dark)', () => {
  const hell = fs.readdirSync(STOCK, { withFileTypes: true }).filter((e) => e.isDirectory())
    .filter((e) => /var w="light"/.test(fs.readFileSync(path.join(STOCK, e.name, 'index.html'), 'utf8'))).map((e) => e.name);
  assert.deepEqual(hell.slice(0, 20), [], hell.length + ' Hüllen mit hellem Standard-Theme');
});
