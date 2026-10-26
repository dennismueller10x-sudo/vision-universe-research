/**
 * Supertrader 7.0 – code coverage of the recorded fingerprints (LOW finding of docs/SUPERTRADER_7_FULL_COMPLETION_REPORT.md
 * §6 / SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md §6): the 6.0 runners run-sf6-validation.mjs and run-sf6-integrity.mjs
 * record validationCodeSha256 / integrityCodeSha256 over their own file lists, which do not contain
 * research/lifecycle-engine.mjs and research/minervini-execution.mjs. Changing those lists would move the recorded 6.0
 * fingerprints (sf6-run-facts.mjs) and is therefore not done. Solved ADDITIVELY here:
 *  - importClosure: the static import closure of a runner (relative imports, transitively);
 *  - coverageOf: for every file of the closure the recorded fingerprint lists that contain it (AG-3 engine, sf5, sf4,
 *    sf6 validation / integrity, KK). A file in no list is a code dependency whose change no recorded fingerprint sees;
 *  - sf6EngineFilesSha256: one supplementary fingerprint over the two engine files named in the finding, pinned in the
 *    test sf-sf7-execution-validation (SF7-VAL-CODE-COVERAGE) at the code of the 7.0 identity runs.
 * Nothing here is written into a receipt; no pinned fingerprint changes. The lists are read from the source text of the
 * runners because only some of them are exported (changing a runner to export its list would move its own fingerprint).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ST = path.resolve(HERE, '..', '..'); // scripts/supertrader
const REPO = path.resolve(ST, '..', '..');
const rel = (abs) => path.relative(REPO, abs).split(path.sep).join('/');

/** Static relative imports of one module, resolved to absolute paths (dynamic `await import()` is not followed). */
export function staticImports(abs) {
  const src = fs.readFileSync(abs, 'utf8'), out = new Set();
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"`;]*?\sfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) out.add(path.resolve(path.dirname(abs), m[1]));
  for (const m of src.matchAll(/^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) out.add(path.resolve(path.dirname(abs), m[1]));
  return [...out];
}
/**
 * Transitive static import closure of a module (repository-relative paths, sorted, the module itself included). leaves:
 * modules whose own imports are not followed (they are imported for one self-contained helper only, see IMPORT_ONLY).
 */
export function importClosure(file, { leaves = [] } = {}) {
  const stop = new Set(leaves.map((f) => path.resolve(f))), seen = new Set(), todo = [path.resolve(file)];
  while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f); if (stop.has(f)) continue; for (const g of staticImports(f)) if (!seen.has(g)) todo.push(g); }
  return [...seen].map(rel).sort();
}
/**
 * Modules the runners import for one helper that uses none of the module's imports: runner/run-research.mjs#codeSha256
 * (fs / crypto over CODE_FILES) and research/run-sf3-research.mjs#attachSecPit (copies sec-pit fields). Their other
 * imports (contracts, registry, #709 extract, Turtle correlation, breadth, context evidence, run facts) are metadata or
 * research components the references never execute. Both modules are themselves in a recorded list (AG3_ENGINE, SF4_RESEARCH).
 */
export const IMPORT_ONLY = Object.freeze(['source-faithful/runner/run-research.mjs', 'source-faithful/research/run-sf3-research.mjs']);
export const executedClosure = (file) => importClosure(file, { leaves: IMPORT_ONLY.map((f) => path.join(ST, f)) });

/** a string-array literal assigned to `name` in a source file (Object.freeze([...]) or [...]) */
function listFrom(file, name) {
  const src = fs.readFileSync(file, 'utf8'), m = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*(?:Object\\.freeze\\()?\\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`FINGERPRINT_LIST_NOT_FOUND:${rel(file)}:${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const R = (f) => path.join(HERE, f);
/** The recorded fingerprint lists: id, the receipt field that carries it, the files (repository-relative). */
export function fingerprintLists() {
  const fromResearch = (files) => files.map((f) => rel(path.resolve(HERE, f)));
  return [
    { id: 'AG3_ENGINE', field: 'engineCodeSha256 (runner/run-research.mjs#codeSha256)', files: listFrom(path.join(ST, 'source-faithful/runner/run-research.mjs'), 'CODE_FILES').map((f) => rel(path.join(ST, f))) },
    { id: 'SF5_RESEARCH', field: 'researchCodeSha256 (run-sf5-lifecycle.mjs)', files: fromResearch(listFrom(R('run-sf5-lifecycle.mjs'), 'SF5_RESEARCH_FILES')) },
    { id: 'SF4_RESEARCH', field: 'researchCodeSha256 (run-sf4-lifecycle.mjs)', files: fromResearch(listFrom(R('run-sf4-lifecycle.mjs'), 'FILES')) },
    { id: 'SF6_VALIDATION', field: 'validationCodeSha256 (run-sf6-validation.mjs)', files: fromResearch(listFrom(R('run-sf6-validation.mjs'), 'FILES')) },
    { id: 'SF6_INTEGRITY', field: 'integrityCodeSha256 (run-sf6-integrity.mjs)', files: fromResearch(listFrom(R('run-sf6-integrity.mjs'), 'FILES')) },
    { id: 'KK_RESEARCH', field: 'researchCodeSha256 (run-kk-intraday.mjs)', files: fromResearch(listFrom(R('run-kk-intraday.mjs'), 'KK_RESEARCH_FILES')) },
  ];
}

/** For a runner: every closure file with the fingerprint lists that contain it; own = the lists its receipt carries. */
export function coverageOf(runner, ownIds) {
  const lists = fingerprintLists(), closure = executedClosure(R(runner));
  const rows = closure.map((f) => ({ file: f, coveredBy: lists.filter((l) => l.files.includes(f)).map((l) => l.id) }));
  return { runner, closure: closure.length, notInOwnReceipt: rows.filter((r) => !r.coveredBy.some((id) => ownIds.includes(id))).map((r) => r.file), uncovered: rows.filter((r) => !r.coveredBy.length).map((r) => r.file), rows };
}
export const SF6_RUNNERS = Object.freeze([
  Object.freeze({ runner: 'run-sf6-validation.mjs', own: Object.freeze(['AG3_ENGINE', 'SF6_VALIDATION']) }),
  Object.freeze({ runner: 'run-sf6-integrity.mjs', own: Object.freeze(['AG3_ENGINE', 'SF6_INTEGRITY']) }),
]);

/** Supplementary fingerprint over the two engine files named in the finding (not part of any receipt). */
export const SF6_ENGINE_FILES = Object.freeze(['lifecycle-engine.mjs', 'minervini-execution.mjs']);
export function sf6EngineFilesSha256() {
  const h = crypto.createHash('sha256');
  for (const f of SF6_ENGINE_FILES) { h.update(f); h.update(fs.readFileSync(R(f))); }
  return h.digest('hex');
}
