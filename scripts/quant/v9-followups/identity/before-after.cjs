#!/usr/bin/env node
/* V9 follow-up (identity): before/after evidence for the opt-in research identity registry.
 *
 *  1. Default-path parity: every weekly series id is loaded with the BASELINE adapter source (--baseline-adapter,
 *     e.g. `git show origin/main:quant/engines/weekly-real-adapter.cjs`, compiled in place of the engine so its
 *     relative requires resolve identically) and with the research wrapper's createResearchLoader(root) (default
 *     off). The full JSON output (or the error message) is hashed per id; all hashes must be identical. The
 *     productive adapter file itself must equal the baseline byte for byte.
 *  2. Qualification counts: default vs { identityEvidence: true } vs
 *     { identityEvidence: true, identityEvidenceAllowCoverPageOnly: true }, with per-id reasons for every bound id.
 * Read-only; writes only --out.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const baselinePath = opt('--baseline-adapter'), out = opt('--out'), baselineRef = opt('--baseline-ref') || null;
if (!baselinePath || !out) { console.error('usage: --baseline-adapter <adapter source of the base commit> [--baseline-ref <sha>] --out <json>'); process.exit(2); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const enginePath = path.join(root, 'quant/engines/weekly-real-adapter.cjs');
function compileBaseline(file) {
  const filename = path.join(root, 'quant/engines/weekly-real-adapter.baseline.cjs'); // never written; only the require base
  const m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(fs.readFileSync(file, 'utf8'), filename);
  return m.exports;
}
const Baseline = compileBaseline(baselinePath);
const Current = require(enginePath);
const Research = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const Registry = require(path.join(root, 'quant/engines/research-identity-evidence.cjs'));
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_[A-Za-z0-9_.-]+\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const reason = e => String(e && e.message || e).split(':')[0];
const run = (loader, id) => { try { const r = loader(id); return { ok: true, r, digest: sha(JSON.stringify(r)) }; } catch (e) { return { ok: false, reason: reason(e), digest: sha('ERR:' + e.message) }; } };
const modes = {
  baselineDefault: Baseline.createLoader(root),
  default: Research.createResearchLoader(root),
  optIn: Research.createResearchLoader(root, { identityEvidence: true }),
  optInCoverPageOnly: Research.createResearchLoader(root, { identityEvidence: true, identityEvidenceAllowCoverPageOnly: true })
};
const counts = Object.fromEntries(Object.keys(modes).map(k => [k, {}]));
const aggregate = Object.fromEntries(Object.keys(modes).map(k => [k, crypto.createHash('sha256')]));
const parityMismatches = [], changedVsDefault = { optIn: [], optInCoverPageOnly: [] }, perBound = {};
const bound = new Set(Registry.records.map(r => r.securityId));
for (const id of ids) {
  const res = {};
  for (const [k, loader] of Object.entries(modes)) {
    res[k] = run(loader, id);
    const label = res[k].ok ? 'QUALIFIED' : res[k].reason;
    counts[k][label] = (counts[k][label] || 0) + 1;
    aggregate[k].update(id + '\t' + res[k].digest + '\n');
  }
  if (res.baselineDefault.digest !== res.default.digest) parityMismatches.push(id);
  for (const k of ['optIn', 'optInCoverPageOnly']) if (res[k].digest !== res.default.digest) changedVsDefault[k].push(id);
  if (bound.has(id)) perBound[id] = Object.fromEntries(Object.entries(res).map(([k, x]) => [k, x.ok ? {
    reason: 'QUALIFIED', listingId: x.r.listingId, from: x.r.points[0][0], to: x.r.points.at(-1)[0], bars: x.r.points.length,
    corporateActionQuality: x.r.corporateActionQuality.status, binding: x.r.identityEvidenceBinding ? {
      evidenceLevel: x.r.identityEvidenceBinding.evidenceLevel, validFrom: x.r.identityEvidenceBinding.validFrom, coverAgeDays: x.r.identityEvidenceBinding.coverAgeDays,
      lastConfirmedCover: x.r.identityEvidenceBinding.lastConfirmedCover.accession } : null,
    addedWarnings: x.r.warnings.filter(w => w === 'SOURCE_RESOLVED_IDENTITY_BINDING' || w === 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL')
  } : { reason: x.reason }]));
}
const qualified = k => counts[k].QUALIFIED || 0;
const report = {
  schemaVersion: 'v9-followup-identity-before-after-1.0.0', productionApproved: false,
  baseline: { ref: baselineRef, adapterSha256: sha(fs.readFileSync(baselinePath)) },
  current: { adapterSha256: sha(fs.readFileSync(enginePath)), adapterIdenticalToBaseline: sha(fs.readFileSync(enginePath)) === sha(fs.readFileSync(baselinePath)),
    researchLoaderSha256: sha(fs.readFileSync(path.join(root, 'quant/engines/research-weekly-loader.cjs'))), registrySha256: sha(fs.readFileSync(path.join(root, 'quant/engines/research-identity-evidence.cjs'))),
    registrySchemaVersion: Registry.schemaVersion, boundSecurityIds: [...bound].sort() },
  inputs: { masterHash: modes.default.masterHash, seriesIds: ids.length,
    seriesDirectorySha256: sha(ids.map(id => id + '\t' + sha(fs.readFileSync(path.join(dir, id + '.json')))).join('\n')) },
  codeSha256: sha(fs.readFileSync(__filename)), runtime: Current.calculationRuntime(),
  defaultPathParity: {
    method: 'sha256(JSON.stringify(loader output)) or sha256("ERR:"+message) per id; baseline adapter createLoader(root) vs research-weekly-loader createResearchLoader(root), default off',
    ids: ids.length, identical: ids.length - parityMismatches.length, mismatches: parityMismatches,
    aggregateBaseline: aggregate.baselineDefault.digest('hex'), aggregateCurrent: aggregate.default.digest('hex')
  },
  counts,
  qualified: { baselineDefault: qualified('baselineDefault'), default: qualified('default'), optIn: qualified('optIn'), optInCoverPageOnly: qualified('optInCoverPageOnly') },
  changedVsDefault, perBoundId: perBound,
  note: 'Opt-in modes exist only in quant/engines/research-weekly-loader.cjs, which no productive caller imports; weekly-real-adapter.cjs is unchanged. Bound ids pass the unchanged validate() on their sourced interval.'
};
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ parity: report.defaultPathParity.identical + '/' + ids.length, qualified: report.qualified, changedVsDefault }, null, 1));
