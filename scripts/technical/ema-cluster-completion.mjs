// Completion of the existing fixed study, not a new hypothesis or independent holdout.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { decryptSealed, encryptForOwner } from '../supertrader/validation/lib.mjs';
import { ORIGINAL, archiveBytes } from './ema-cluster-archive.mjs';
import { sha256 } from '../supertrader/snapshot/contract.mjs';
const require = createRequire(import.meta.url), S = require('../../quant/engines/research-studies.cjs');
export async function restoreBaseline(store, wrappedKey, privateKey, dir) {
  const archive = await store.getObject(ORIGINAL.artifactSha256), file = path.join(dir, 'baseline-artifact.private.zip');
  fs.writeFileSync(file, archive, { mode: 0o600 });
  const envelope = JSON.parse(execFileSync('unzip', ['-p', file, 'result.reviewer.sealed.json'], { maxBuffer: 64 * 1024 * 1024 }));
  // Existing per-file AES key, rewrapped for the existing private archive key; cipher body stays unchanged.
  envelope.wrappedKey = wrappedKey;
  const result = JSON.parse(decryptSealed(privateKey, JSON.stringify(envelope)));
  const { resultHash, ...body } = result, { selectionHash, ...selection } = result.selection;
  if (resultHash !== ORIGINAL.resultHash || S.hash(body) !== resultHash || selectionHash !== ORIGINAL.selectionHash || S.hash(selection) !== selectionHash) throw new Error('BASELINE_HASH_MISMATCH');
  return result;
}
export function verifyCompletion(baseline, report) {
  const primary = cells => cells.map(({ walkForward, ...body }) => body);
  if (S.hash(baseline.selection) !== S.hash(report.selection) || baseline.configHash !== report.configHash || baseline.events !== report.events) throw new Error('FIXED_STUDY_SCOPE_CHANGED');
  if (S.hash(primary(baseline.cells)) !== S.hash(primary(report.cells))) throw new Error('PRIMARY_RESULTS_CHANGED');
  if (baseline.receipts.length !== report.receipts.length || baseline.receipts.some((r, i) => r.inputHash !== report.receipts[i].inputHash)) throw new Error('RECONSTRUCTED_INPUT_CHANGED');
  const previous = baseline.cells.filter(c => c.walkForward.state === 'EXECUTED');
  if (previous.some(c => S.hash(c.walkForward) !== S.hash(report.cells.find(x => x.eventType === c.eventType && x.horizonTradingDays === c.horizonTradingDays)?.walkForward))) throw new Error('PREVIOUS_WALK_FORWARD_CHANGED');
  const completed = report.cells.filter(c => c.walkForward.state === 'EXECUTED').length;
  return { kind: 'SUBSEQUENT_WALK_FORWARD_COMPLETION_OF_FIXED_STUDY', baselineResultHash: baseline.resultHash,
    originalSourceCommit: ORIGINAL.sourceCommit, primaryResultsUnchanged: true, reconstructedInputsUnchanged: true,
    previousWalkForwardUnchanged: previous.length, completedCells: completed, newlyCompletedCells: completed - previous.length,
    engineReceiptsIncludingRuntimeMatch: baseline.receipts.every((r, i) => S.hash(r.engineResults) === S.hash(report.receipts[i].engineResults)),
    independentHoldout: false };
}
export async function archiveLedger(store, ownerKey, text, eventType, horizonTradingDays) {
  const bytes = Buffer.from(encryptForOwner(ownerKey, Buffer.from(text)));
  return { eventType, horizonTradingDays, plaintextSha256: sha256(text), ...await archiveBytes(store, bytes, sha256(bytes)) };
}
