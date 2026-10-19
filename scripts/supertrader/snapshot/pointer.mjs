#!/usr/bin/env node
// Supertrader Research Snapshot — Zeiger auf den zuletzt geprueften Snapshot (nur ID, Datum, Laeufe).
// Der Zeiger aendert keinen Snapshot; er sagt Restore-Laeufen und Konsumenten, welche ID gemeint ist.
//   --read --mode <m>          gibt die Snapshot-ID aus
//   --mode <m> --run <dir>     traegt den Lauf aus <dir> (capture.json / restore-*.json) ein
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const mode = arg('--mode') || '';
const file = path.join(here, /smoke/.test(mode) ? 'SNAPSHOT-POINTER-SMOKE.json' : 'SNAPSHOT-POINTER.json');
const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
if (argv.includes('--read')) {
  if (!cur?.snapshotId) { console.error('INPUT_INTEGRITY_FAILURE: SNAPSHOT_NOT_FOUND (kein Zeiger)'); process.exit(3); }
  process.stdout.write(cur.snapshotId);
} else {
  const dir = arg('--run');
  const read = (n) => (fs.existsSync(path.join(dir, n)) ? JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) : null);
  const cap = read('capture.json'), a = read('restore-a.json'), b = read('restore-b.json'), par = read('parallel-consistency.json');
  if (!a || !b || !par?.identical) { console.error('INPUT_INTEGRITY_FAILURE: PARALLEL_INPUT_DIVERGENCE'); process.exit(3); }
  const id = cap?.snapshotId || a.snapshotId;
  if (a.snapshotId !== id || b.snapshotId !== id || (!cap && cur?.snapshotId !== id)) { console.error('INPUT_INTEGRITY_FAILURE: PARALLEL_INPUT_DIVERGENCE (Snapshot-IDs)'); process.exit(3); }
  const base = cap || cur?.snapshotId !== id ? { snapshotId: id, asOfDate: cap?.asOfDate ?? cur?.asOfDate ?? null, captureRunId: cap?.provenance?.runId ?? cur?.captureRunId ?? null, restores: [] } : cur;
  base.restores = [...(base.restores || []), { runId: a.runId, jobs: [a.job, b.job], datasetSha256: a.datasetSha256, replaySha256: a.replaySha256, independentOfCapture: a.independentOfCapture && b.independentOfCapture }];
  fs.writeFileSync(file, JSON.stringify(base, null, 1) + '\n');
  console.log(`Zeiger ${path.basename(file)} -> ${id} (${base.restores.length} Wiederherstellungslaeufe)`);
}
