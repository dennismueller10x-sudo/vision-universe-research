/* Regression: Supertrader-Charts luden die 2-Zeichen-Scherben technical-signals-v1/<AA>.json.gz,
   die das Release seit #616 nicht mehr ausliefert (Produktion: 404, "Chart nicht gezeichnet").
   st-chart.js muss wie Quant zuerst by-ticker/<T> laden, die Scherbe nur als Rueckfall. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(join(ROOT, 'supertrader', 'assets', 'st-chart.js'), 'utf8');
const TECH = '/quant/data/product/technical-signals-v1/';

function doc(sym) {
  return { generatedAt: 'x', instruments: { [sym]: { priceSeriesType: 'ADJ', bars: { timestamps: ['2026-10-12T00:00:00Z'], open: [1], high: [2], low: [0.5], close: [1.5], volume: [10] } } } };
}

function load(available) {
  const calls = [];
  const ctx = {
    document: { addEventListener() {} },
    fetch: async (path) => {
      calls.push(path);
      const body = available[path];
      if (!body) return { ok: false, status: 404 };
      return { ok: true, status: 200, arrayBuffer: async () => gzipSync(JSON.stringify(body)) };
    },
    Response, Blob, DecompressionStream,
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { STChart: ctx.STChart, calls };
}

test('loadBars nutzt by-ticker und fragt die Scherbe nicht ab', async () => {
  const { STChart, calls } = load({ [TECH + 'by-ticker/AAPL.json.gz']: doc('AAPL') });
  const bars = await STChart.loadBars('AA', 'AAPL');
  assert.deepEqual(Array.from(bars.close), [1.5]);
  assert.deepEqual(calls, [TECH + 'by-ticker/AAPL.json.gz']);
});

test('loadBars faellt auf die Scherbe zurueck, wenn by-ticker fehlt', async () => {
  const { STChart, calls } = load({ [TECH + 'AA.json.gz']: doc('AAPL') });
  const bars = await STChart.loadBars('AA', 'AAPL');
  assert.deepEqual(Array.from(bars.close), [1.5]);
  assert.deepEqual(calls, [TECH + 'by-ticker/AAPL.json.gz', TECH + 'AA.json.gz']);
});

test('loadBars: ungueltiges Symbol geht nicht in den Pfad, nur Scherbe', async () => {
  const { STChart, calls } = load({});
  await assert.rejects(STChart.loadBars('AA', '../x'));
  assert.deepEqual(calls, [TECH + 'AA.json.gz']);
});
