#!/usr/bin/env node
/**
 * Compares the known canonical capture states from their public receipts only (hashes and counts; no plaintext, no
 * identities) and checks that all jobs of one run read identical inputs. Usage:
 *   node data-states.mjs --out <file> --state <label>=<receipt.json>[,<receipt.json>...] [--state ...]
 * A state's receipts must agree on every input hash; per-object, per-security and per-bar differences are not
 * derivable from receipts (the object receipts and the captures themselves stay in the runner).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './lib.mjs';

/* raw manifest and part hashes embed capture-time fields; only these bindings are content claims */
export const INPUT_KEYS = ['dataFingerprint', 'readReceiptSetSha256', 'sourceObjectSetSha256', 'listingSourceSha256', 'normalizedPartListSha256', 'normalizedManifestSha256', 'normalizedInputsSha256'];

export function bindingOf(r) {
  const i = r.inputs || {}, cb = r.contentBinding || {}, c = r.counts || {};
  return { hashes: Object.fromEntries(INPUT_KEYS.map((k) => [k, cb[k] ?? i[k] ?? null])),
    counts: { inputSegments: c.inputSegments, usableSegments: c.usableSegments, verifiedSecurities: c.verifiedSecurities, readReceipts: i.readReceipts,
      sourceObjectsAvailable: i.sourceObjects?.available, providerSupportedListingRecords: c.providerSupportedListingRecords, observedListingGenerations: c.observedListingGenerations,
      issuerCik: r.overlay?.issuerCikDiagnostics ?? null, rejections: r.rejections?.reasons ?? {} },
    capturedAt: r.provenance?.capturedAt ?? null, runId: r.provenance?.workflowRunId ?? null };
}

export function compareStates(states) {
  const out = {};
  for (const [label, receipts] of Object.entries(states)) {
    const b = receipts.map(bindingOf);
    const mismatched = INPUT_KEYS.filter((k) => new Set(b.map((x) => x.hashes[k])).size > 1);
    out[label] = { receipts: b.length, runs: [...new Set(b.map((x) => x.runId))], capturedAt: [...new Set(b.map((x) => x.capturedAt))].sort(),
      allJobsIdenticalInputs: mismatched.length === 0, mismatchedKeys: mismatched, hashes: b[0].hashes, counts: b[0].counts };
  }
  const labels = Object.keys(out), steps = [];
  for (let k = 1; k < labels.length; k++) {
    const a = out[labels[k - 1]], z = out[labels[k]];
    steps.push({ from: labels[k - 1], to: labels[k], changedHashes: INPUT_KEYS.filter((h) => a.hashes[h] !== z.hashes[h]),
      countDeltas: Object.fromEntries(Object.keys(a.counts).filter((c) => typeof a.counts[c] === 'number').map((c) => [c, z.counts[c] - a.counts[c]])) });
  }
  return { states: out, steps };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), states = {};
  let outFile = null;
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--out') outFile = argv[i + 1];
    else if (argv[i] === '--state') { const [label, files] = argv[i + 1].split('='); states[label] = files.split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))); }
  }
  K.writeJson(outFile, { schema: 'vu-root-cause-data-states-1.0.0', version: K.VERSION, basis: 'public capture receipts only (hashes and counts)', ...compareStates(states),
    notDerivable: ['per-security, per-bar and per-corporate-action differences: object receipts and captures are not persisted outside the runner', 'which listing row Tiingo dropped'],
    reproducibility: 'a state is reproducible only while the R2 objects, the live Tiingo supported-ticker list and the capture date are unchanged; none of the earlier captures is persisted' });
}
