import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Der Verlauf des Ladezeit-Monitors zaehlt nur Laeufe vom Default-Branch;
   PR-Laeufe und Dispatches von Arbeitszweigen verzerren den Vergleich sonst. */
test('ladezeit-Verlauf filtert Artefakte auf head_branch == main', () => {
  const yml = fs.readFileSync(new URL('../../../.github/workflows/monitor.yml', import.meta.url), 'utf8');
  const zeile = yml.split('\n').find((l) => l.includes('artifacts?name=ladezeit'));
  assert.ok(zeile, 'Verlaufs-Abruf nicht gefunden');
  assert.match(zeile, /\.workflow_run\.head_branch == "main"/);
  assert.match(zeile, /\.expired == false/);
  assert.match(zeile, /per_page=30/, 'genug Artefakte holen, damit nach dem Filter noch 7 bleiben');
});
