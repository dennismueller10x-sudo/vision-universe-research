// Technical (canonical-bars.fromPriceBars) und Core (return-series.splitFactors) sind
// dieselbe Split-Definition: Faktor eines Tages = Produkt aller Splits NACH diesem Tag.
// Technical bekommt die Splits als Corporate Actions; alle Produzenten bilden sie
// identisch aus bar.splitFactor (exDate = Bar-Datum). Dieser Test haelt beides fest,
// damit keine zweite Wahrheit entsteht, ohne die Technical-Engine umzubauen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const Canonical = require('../engines/technical/canonical-bars.js');
const RS = require('../engines/return-series.js');

const round6 = (v) => Math.round(v * 1e6) / 1e6;
function actionsOf(bars) {
  const a = [];
  for (const b of bars) if (b.splitFactor !== 1) a.push({type: 'split', exDate: b.date, ratio: b.splitFactor});
  return a;
}
function bars(n, splits, seed = 7) {
  let x = seed, px = 100;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  for (let i = 0; i < n; i++) {
    px *= 1 + (rnd() - 0.5) * 0.06;
    const c = round6(px), h = round6(c * (1 + rnd() * 0.02)), l = round6(c * (1 - rnd() * 0.02));
    const d = new Date(Date.UTC(2024, 0, 2) + i * 864e5).toISOString().slice(0, 10);
    out.push({date: d, open: c, high: h, low: l, close: c, adjustedClose: c, volume: 1000 + i, splitFactor: splits[i] ?? 1});
  }
  return out;
}
const CASES = {
  'kein Split': {},
  '4:1 in der Mitte': {50: 4},
  'Reverse 1:10': {30: 0.1},
  'Split am ersten Tag': {0: 2},
  'Split am letzten Tag': {99: 3},
  'mehrere inkl. 1.05': {10: 2, 40: 1.05, 41: 3, 80: 0.5}
};

for (const [name, splits] of Object.entries(CASES)) {
  test(`gleiche Geometrie: ${name}`, () => {
    const b = bars(100, splits);
    const sa = Canonical.fromPriceBars(b, actionsOf(b)).SPLIT_ADJUSTED;
    const f = RS.splitFactors(b);
    const cols = sa;
    for (const field of ['close', 'high', 'low']) {
      const core = RS.splitAdjustedColumn(b, field).map(round6);
      assert.deepEqual(Array.from(cols[field]), core, field);
    }
    assert.deepEqual(Array.from(cols.adjustmentFactor), f);
  });
}

test('alle Produzenten bilden Split-Actions gleich aus bar.splitFactor (exDate = Bar-Datum)', () => {
  const files = ['scripts/technical/materialize-product-intelligence.mjs', 'scripts/quant/lib/daily-prices.mjs', 'scripts/quant/replay-setup-history.mjs'];
  for (const f of files) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.match(src, /splitFactor !== 1\) actions\.push\(\{ type: "split", exDate: (bar|b)\.date, ratio: (bar|b)\.splitFactor \}\)/, f);
  }
});
