#!/usr/bin/env node
/**
 * Rebuilds every source-faithful artifact and generated document in the order that converges (review SF2-R4-08):
 * contracts -> artifacts -> completion artifacts -> docs -> golden record (runs the sf tests) -> completion artifacts
 * and docs again (they embed the golden record) -> golden record once more. Run after any contract, method or test change.
 *
 *   node scripts/supertrader/source-faithful/completion/rebuild-all.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const step = (f) => { const r = spawnSync(process.execPath, [path.join(SF, f)], { stdio: 'inherit' }); return r.status ?? 1; };
step('build-artifacts.mjs');
for (let k = 0; k < 2; k++) { step('completion/build-completion.mjs'); step('completion/build-readiness-sf3.mjs'); step('completion/build-minervini-lifecycle.mjs'); step('completion/build-sf5-lifecycle.mjs'); step('completion/build-kk-ep-ps.mjs'); step('completion/build-minervini-source-inventory.mjs'); step('completion/build-completion-docs.mjs'); step('build-docs.mjs'); step('record-golden-results.mjs'); }
step('completion/build-completion.mjs'); step('completion/build-readiness-sf3.mjs'); step('completion/build-minervini-lifecycle.mjs'); step('completion/build-sf5-lifecycle.mjs'); step('completion/build-kk-ep-ps.mjs'); step('completion/build-minervini-source-inventory.mjs'); step('completion/build-completion-docs.mjs'); step('build-docs.mjs');
// Supertrader 3.0: the six-dimension readiness (build-readiness-sf3.mjs) follows every completion build, before the golden record;
// Supertrader 4.0: the Minervini lifecycle artifact (build-minervini-lifecycle.mjs) right after it;
// Supertrader 5.0: the engine lifecycles artifact (build-sf5-lifecycle.mjs) after that
process.exitCode = step('record-golden-results.mjs');
