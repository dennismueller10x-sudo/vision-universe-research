#!/usr/bin/env node
/* V9 follow-up (corporate-action registry): before/after evidence for the opt-in corporateActionEvidence loader option.
 *  1. Default-path parity: baseline adapter (--baseline-adapter, source of the main commit) createLoader(root) vs
 *     createResearchLoader(root), all weekly series ids, sha256 of the full JSON output or the error message.
 *  2. QUALIFIED counts: default / { identityEvidence } / { identityEvidence, corporateActionEvidence } (and the CA option alone),
 *     newly qualified ids with class, and the proof that no other id changes output.
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
if (!baselinePath || !out) { console.error('usage: --baseline-adapter <adapter source of main> [--baseline-ref <sha>] --out <json>'); process.exit(2); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const file = rel => fs.readFileSync(path.join(root, rel));
function compileBaseline(f) {
  const filename = path.join(root, 'quant/engines/weekly-real-adapter.baseline.cjs'); // never written; only the require base
  const m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(fs.readFileSync(f, 'utf8'), filename);
  return m.exports;
}
const Baseline = compileBaseline(baselinePath);
const Research = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const Registry = require(path.join(root, 'quant/engines/research-ca-evidence.cjs'));
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_[A-Za-z0-9_.-]+\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const reason = e => String(e && e.message || e).split(':')[0];
const run = (loader, id) => { try { const r = loader(id); return { ok: true, r, digest: sha(JSON.stringify(r)) }; } catch (e) { return { ok: false, reason: reason(e), digest: sha('ERR:' + e.message) }; } };
const modes = {
  baselineDefault: Baseline.createLoader(root),
  default: Research.createResearchLoader(root),
  identity: Research.createResearchLoader(root, { identityEvidence: true }),
  caOnly: Research.createResearchLoader(root, { corporateActionEvidence: true }),
  identityCa: Research.createResearchLoader(root, { identityEvidence: true, corporateActionEvidence: true })
};
const counts = Object.fromEntries(Object.keys(modes).map(k => [k, {}]));
const parityMismatches = [], changed = { caOnlyVsDefault: [], identityCaVsIdentity: [] }, newly = [];
const registryIds = new Set(Registry.records.map(r => r.securityId));
for (const id of ids) {
  const res = {};
  for (const [k, loader] of Object.entries(modes)) {
    res[k] = run(loader, id);
    const label = res[k].ok ? 'QUALIFIED' : res[k].reason;
    counts[k][label] = (counts[k][label] || 0) + 1;
  }
  if (res.baselineDefault.digest !== res.default.digest) parityMismatches.push(id);
  if (res.caOnly.digest !== res.default.digest) changed.caOnlyVsDefault.push(id);
  if (res.identityCa.digest !== res.identity.digest) changed.identityCaVsIdentity.push(id);
  if (registryIds.has(id)) {
    const x = res.identityCa;
    newly.push({ securityId: id, before: res.identity.ok ? 'QUALIFIED' : res.identity.reason, after: x.ok ? 'QUALIFIED' : x.reason,
      returnBasis: x.ok ? x.r.returnBasis : null, bars: x.ok ? x.r.points.length : null,
      events: Registry.records.filter(r => r.securityId === id).map(r => ({ week: r.week, class: r.class, weeklyRatio: +r.weeklyRatio.toFixed(6), cik: r.cik, providerReason: r.providerReason })),
      resolvedItems: x.ok ? x.r.corporateActionQuality.items.filter(i => i.status === 'RESOLVED_SOURCE_VERIFIED').length : 0 });
  }
}
const q = k => counts[k].QUALIFIED || 0;
const report = {
  schemaVersion: 'v9-followup-ca-before-after-1.0.0', productionApproved: false,
  baseline: { ref: baselineRef, adapterSha256: sha(fs.readFileSync(baselinePath)) },
  current: { adapterSha256: sha(file('quant/engines/weekly-real-adapter.cjs')), adapterIdenticalToBaseline: sha(file('quant/engines/weekly-real-adapter.cjs')) === sha(fs.readFileSync(baselinePath)),
    corporateActionEvidenceJsSha256: sha(file('quant/engines/corporate-action-evidence.js')),
    researchLoaderSha256: sha(file('quant/engines/research-weekly-loader.cjs')), registrySha256: sha(file('quant/engines/research-ca-evidence.cjs')),
    registrySchemaVersion: Registry.schemaVersion, protocolSha256: Registry.protocolSha256, registryRecords: Registry.records.length, registrySeries: registryIds.size },
  inputs: { masterHash: modes.default.masterHash, seriesIds: ids.length,
    seriesDirectorySha256: sha(ids.map(id => id + '\t' + sha(fs.readFileSync(path.join(dir, id + '.json')))).join('\n')) },
  codeSha256: sha(fs.readFileSync(__filename)), runtime: Baseline.calculationRuntime(),
  defaultPathParity: { ids: ids.length, identical: ids.length - parityMismatches.length, mismatches: parityMismatches },
  counts, qualified: Object.fromEntries(Object.keys(modes).map(k => [k, q(k)])),
  changed, newlyQualified: newly,
  note: 'Opt-in modes exist only in quant/engines/research-weekly-loader.cjs, which no productive caller imports; weekly-real-adapter.cjs and corporate-action-evidence.js are unchanged.'
};
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ parity: report.defaultPathParity.identical + '/' + ids.length, qualified: report.qualified, changed: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.length])) }, null, 1));
