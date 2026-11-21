// Backtest 2.0 – Rechenworker: bekommt Marktmodell und Signale als SharedArrayBuffer, rechnet Jahreskennzahlen je Kombination.
import { parentPort, workerData } from 'node:worker_threads';
import { attach } from './market.mjs';
import { yearStats } from './search.mjs';

const m = attach(workerData.market);
const sigs = Object.fromEntries(Object.entries(workerData.signals).map(([k, v]) => [k, { offsets: new Int32Array(v.offsets), items: new Int32Array(v.items) }]));
const out = new Float64Array(workerData.out);
const { t0, t1, nYears, fields } = workerData;
for (const c of workerData.combos) {
  out.set(yearStats(m, sigs[c.source], c, t0, t1, nYears), c.id * nYears * fields);
  parentPort.postMessage({ done: 1 });
}
parentPort.postMessage({ finished: true });
