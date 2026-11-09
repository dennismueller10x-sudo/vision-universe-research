import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendOverrides, SIGNATURES } from '../bundle-routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('BR-1 · jede Signatur steht in ihrem Quellmodul (sonst wuerde ein Buendel mit dem Modul nicht erkannt)', () => {
  for (const [path, sig] of Object.entries(SIGNATURES)) {
    assert.ok(readFileSync(join(ROOT, path), 'utf8').includes(sig), path + ' enthaelt ' + sig);
  }
});

test('BR-2 · angehaengt wird nur an Buendel mit dem Modul; die spaetere Definition gilt', () => {
  const bundle = 'globalThis.VUCompanyIntelligenceRollout={stage:1,expectedGeneration:"prod"};globalThis.other=1;';
  const { code, appended } = appendOverrides(bundle, {
    'company-intelligence/config/rollout.js': 'globalThis.VUCompanyIntelligenceRollout={stage:1,expectedGeneration:"candidate"};',
    'discover/ui/detail.js': 'globalThis.detailOverride=true;'
  });
  assert.deepEqual(appended, ['company-intelligence/config/rollout.js']);
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx);
  assert.equal(ctx.VUCompanyIntelligenceRollout.expectedGeneration, 'candidate');
  assert.equal(ctx.detailOverride, undefined, 'kein Anhang an ein Buendel ohne das Modul');
  assert.ok(code.startsWith(bundle), 'Original bleibt bytegleich am Anfang');
});

test('BR-3 · ohne Treffer unveraendert; unbekanntes Modul ist ein Fehler', () => {
  assert.deepEqual(appendOverrides('x=1;', { 'discover/ui/detail.js': 'y' }), { code: 'x=1;', appended: [] });
  assert.throws(() => appendOverrides('x', { 'discover/ui/other.js': 'y' }), /UNKNOWN_OVERRIDE_MODULE/);
});
