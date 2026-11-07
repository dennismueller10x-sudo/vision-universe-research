import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleDiscover, KEEP_SEPARATE } from '../../mobile/bundle-discover.mjs';
import { stageProduction } from '../production-release.mjs';

// 07.11.2026: Seit E5 steckte rollout.js im Discover-Buendel. stageProduction schreibt aber nur
// die Einzeldatei um (Generation bzw. Kill-Switch) - die Seite lief mit veralteter erwarteter
// Generation ("derzeit nicht verfuegbar", Gate fail-closed) bzw. trotz geschlossenem Gate weiter.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CI_MODULES = ['company-intelligence/config/rollout.js', 'company-intelligence/api/contract.js', 'company-intelligence/ui/stock-section.js', 'discover/ui/detail.js'];

function release() {
  const out = mkdtempSync(join(tmpdir(), 'ci-release-bundle-'));
  for (const p of ['discover/index.html', ...CI_MODULES, 'company-intelligence/ui/stock-section.css']) {
    mkdirSync(dirname(join(out, p)), { recursive: true });
    copyFileSync(join(ROOT, p), join(out, p));
  }
  return out;
}

test('RB-1 · die echte Discover-Seite buendelt keine Company-Intelligence-Consumer-Module und nicht detail.js', async () => {
  const out = release();
  try {
    const chunks = await bundleDiscover({ root: ROOT, output: out });
    assert.ok(chunks.length > 0, 'es entstehen weiterhin Buendel');
    for (const c of chunks) for (const p of CI_MODULES) assert.ok(!c.inputs.includes(p), c.path + ' enthaelt ' + p);
    const html = readFileSync(join(out, 'discover/index.html'), 'utf8');
    for (const p of CI_MODULES) assert.match(html, new RegExp('<script src="/' + p.replace(/[./]/g, (m) => '\\' + m) + '"'), p + ' bleibt eigenes Skript');
    for (const p of CI_MODULES) assert.ok(KEEP_SEPARATE.test('/' + p));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('RB-2 · nach dem Buendeln erreicht der Kill-Switch von stageProduction den Rollout und stempelt das Tag', async () => {
  const out = release();
  try {
    await bundleDiscover({ root: ROOT, output: out });
    const result = await stageProduction(null, out, { enabled: false });
    assert.equal(result.status, 'PRODUCTION_GATE_CLOSED');
    assert.match(readFileSync(join(out, 'company-intelligence/config/rollout.js'), 'utf8'), /const config = \{stage:0,productionOff:true,/);
    assert.match(readFileSync(join(out, 'discover/index.html'), 'utf8'), /<script src="\/company-intelligence\/config\/rollout\.js\?v=[a-f0-9]+"/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
