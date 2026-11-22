// Merkmals-Atlas: Auswertung auf erfundenen French-Dateien mit bekanntem Ergebnis. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, COMBOS, analyzeAtlas, atlasReport } from './atlas.mjs';

const months = Array.from({ length: 12 * 70 }, (_, i) => String(1950 + Math.floor(i / 12)) + String((i % 12) + 1).padStart(2, '0'));
const csv = (cols, f) => 'Kopf\n\n  Value Weight Returns -- Monthly\n,' + cols.join(',') + '\n' + months.map((m, i) => m + ',' + cols.map((c) => f(c, i).toFixed(2)).join(',')).join('\n') + '\n\n';

test('Atlas: gute Seite mit +1 % je Monat mehr als der Markt liegt vorn, auch nach der Veröffentlichung', () => {
  const texts = { 'F-F_Research_Data_Factors': csv(['Mkt-RF', 'SMB', 'HML', 'RF'], (c) => (c === 'Mkt-RF' ? 0.5 : c === 'RF' ? 0.2 : 0)) };
  for (const [, file, good, bad] of FEATURES) {
    const cols = texts[file] ? null : [...new Set(FEATURES.filter((f) => f[1] === file).flatMap((f) => [f[2], f[3]]))];
    if (cols) texts[file] = csv(cols, (c) => (FEATURES.some((f) => f[1] === file && f[2] === c && f[0] !== 'Größte Firmen (wie S&P 500)') ? 1.7 : 0.7));
  }
  const res = analyzeAtlas(texts);
  assert.equal(res.rows.length, FEATURES.length + COMBOS.length);
  const combo = res.rows.find((r) => r.name === COMBOS[0][0]);
  assert.ok(combo.decadesComplete > 0 && combo.decadesAhead === combo.decadesComplete, 'Kombination zweier guter Seiten liegt in jedem Jahrzehnt vorn');
  const mom = res.rows.find((r) => r.name.startsWith('Momentum'));
  assert.ok(mom.excess > 0.1 && mom.afterPublication.cagr > mom.afterPublication.market && mom.rel10y.winShare === 1);
  assert.match(atlasReport(res), /Merkmals-Atlas/);
});
