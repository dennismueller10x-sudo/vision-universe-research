// compare-backtest-demos.cjs: Feldvergleich zweier Demo-Ergebnissätze (synthetisch in tmp, schreibt nichts im Repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../../scripts/quant/research/compare-backtest-demos.cjs');

function set(results) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-cmp-')); fs.mkdirSync(path.join(d, 'results'));
  for (const [id, doc] of Object.entries(results)) fs.writeFileSync(path.join(d, 'results', id + '.json'), JSON.stringify(doc));
  return d;
}
const base = () => ({ kind: 'SIGNAL_BACKTEST', state: 'RESEARCH_EXECUTED', inputHashes: { code: { 'a.cjs': 'h1' }, certification: 'c1' }, resultHash: 'r1',
  envelope: { metrics: { hitRate: 0.5, perEvent: { n: 10 } }, status: { state: 'RESEARCH_EXECUTED' } }, population: { frameSize: 5 } });

test('identisch, nur Eingänge, Ergebnis, Zustand und fehlende Fälle werden getrennt erkannt', () => {
  const a = set({ same: base(), inp: base(), res: base(), st: base(), gone: base() });
  const inp = base(); inp.inputHashes.code['a.cjs'] = 'h2'; inp.resultHash = 'r2';
  const res = base(); res.envelope.metrics.hitRate = 0.51;
  const st = base(); st.state = 'PREPARED_DATA_LIMITED'; st.envelope.status.state = 'PREPARED_DATA_LIMITED';
  const b = set({ same: base(), inp, res, st });
  const r = C.compare(a, b);
  const by = Object.fromEntries(r.cases.map((c) => [c.id, c]));
  assert.equal(r.schemaVersion, C.SCHEMA);
  assert.equal(by.same.status, 'IDENTICAL');
  assert.equal(by.inp.status, 'INPUT_CHANGED_RESULT_SAME'); assert.deepEqual(by.inp.inputDiffs.map((x) => x.path), ['inputHashes.code.a.cjs']);
  assert.equal(by.res.status, 'RESULT_CHANGED'); assert.equal(by.res.resultDiffs[0].path, 'envelope.metrics.hitRate'); assert.ok(Math.abs(by.res.resultDiffs[0].delta - 0.01) < 1e-12);
  assert.equal(by.st.status, 'STATE_CHANGED');
  assert.equal(by.gone.status, 'MISSING'); assert.equal(by.gone.missingIn, 'b');
  assert.match(C.markdown(r), /\| res \| SIGNAL_BACKTEST \|/);
});
