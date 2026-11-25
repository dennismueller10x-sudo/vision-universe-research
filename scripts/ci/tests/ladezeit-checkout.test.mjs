import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(resolve(wurzel, '.github/workflows/monitor.yml'), 'utf8');

/* Der Job "ladezeit" checkt nur Teilverzeichnisse aus. Importiert measure.mjs oder live-ladezeit.mjs
 * ein Modul ausserhalb davon, fehlt es auf dem Runner (ERR_MODULE_NOT_FOUND, Lauf 45367666287). */
test('ladezeit-Job: Sparse-Checkout deckt alle relativen Importe des Messers ab', () => {
  const i = workflow.indexOf('\n  ladezeit:');
  assert.ok(i > 0, 'Job ladezeit fehlt');
  const rest = workflow.slice(i + 1);
  const ende = rest.search(/\n  [A-Za-z0-9_-]+:\n/u);
  const job = ende > 0 ? rest.slice(0, ende + 1) : rest;
  const m = job.match(/sparse-checkout: \|\n((?:\s+\S+\n)+)/u);
  assert.ok(m, 'sparse-checkout fehlt');
  const ordner = m[1].split('\n').map((z) => z.trim()).filter(Boolean);
  for (const datei of ['scripts/mobile/measure.mjs', 'scripts/mobile/live-ladezeit.mjs', 'scripts/mobile/gate-diagnose.mjs']) {
    const text = readFileSync(resolve(wurzel, datei), 'utf8');
    for (const [, ziel] of text.matchAll(/from\s+'(\.[^']+)'/gu)) {
      const abs = resolve(dirname(resolve(wurzel, datei)), ziel).slice(wurzel.length + 1);
      assert.ok(ordner.some((o) => abs === o || abs.startsWith(o + '/')), datei + ' importiert ' + abs + ', nicht im Sparse-Checkout: ' + ordner.join(', '));
    }
  }
});
