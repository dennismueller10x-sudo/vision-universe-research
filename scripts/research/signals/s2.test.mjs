// E4/S2: Die registrierte Stichprobe ist aus den committeten Listen reproduzierbar und enthält keine Vorzugsaktien.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registered = JSON.parse(readFileSync(join(ROOT, 'docs/research/signals/s2/sample.json'), 'utf8'));
// Die Quelllisten sind Erzeuger-Artefakte und ändern sich später; die Registrierung ist an ihre Hashes gebunden.
const sourcesUnchanged = Object.entries(registered.sources).every(([f, h]) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex') === h);

test('S2-Stichprobe: Neubau mit Seed ergibt exakt die registrierte Datei', { skip: !sourcesUnchanged && 'Quelllisten seit der Registrierung neu erzeugt' }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 's2-')), 'sample.json');
  execFileSync(process.execPath, [join(ROOT, 'scripts/research/signals/s2-sample.mjs'), '--size', String(registered.size), '--seed', String(registered.seed), '--out', out]);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(ROOT, 'docs/research/signals/s2/sample.json'), 'utf8'));
});

test('S2-Stichprobe: 1.000 eindeutige Titel, Schichtung im Universumsverhältnis, keine Vorzugsaktien', () => {
  assert.equal(registered.size, 1000);
  assert.equal(new Set(registered.ids).size, 1000);
  const dl = registered.ids.filter(i => i.startsWith('dl_')).length;
  assert.equal(dl, registered.drawn.delisted);
  assert.equal(dl, Math.round(1000 * registered.population.delisted / (registered.population.current + registered.population.delisted)));
  const u = JSON.parse(readFileSync(join(ROOT, 'quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json'), 'utf8'));
  const tick = new Map(u.securities.map(s => [s.securityId, s.ticker]));
  for (const id of registered.ids.filter(i => !i.startsWith('dl_'))) assert.ok(!/-P(-|$)/.test(tick.get(id) || id.replace(/^ref_/, '').replace(/_/g, '-')), id);
});
