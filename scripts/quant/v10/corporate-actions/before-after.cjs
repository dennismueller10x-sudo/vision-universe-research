#!/usr/bin/env node
/* V10 corporate actions: before/after QUALIFIED counts of createResearchLoader with the baseline CA registry (main, protocol 1.0.0)
 * and the current registry (protocol 1.1.1). The baseline registry source is compiled into require.cache under the registry's own
 * path while the "before" loaders are created (the loader reads the registry once at creation), then the current file is loaded.
 * Read-only; writes only --out.
 *   node before-after.cjs --baseline-registry <research-ca-evidence.cjs of main> --baseline-ref <sha> --out <json>
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const baselinePath = opt('--baseline-registry'), out = opt('--out'), baselineRef = opt('--baseline-ref');
if (!baselinePath || !out) { console.error('usage: --baseline-registry <cjs> [--baseline-ref <sha>] --out <json>'); process.exit(2); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const regPath = require.resolve(path.join(root, 'quant/engines/research-ca-evidence.cjs'));
const Research = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const Adapter = require(path.join(root, 'quant/engines/weekly-real-adapter.cjs'));

function withRegistry(src, fn) {
  const m = new Module(regPath, module); m.filename = regPath; m.paths = Module._nodeModulePaths(path.dirname(regPath)); m._compile(src, regPath); m.loaded = true;
  require.cache[regPath] = m;
  try { return fn(m.exports); } finally { delete require.cache[regPath]; }
}
const baseSrc = fs.readFileSync(baselinePath, 'utf8'), curSrc = fs.readFileSync(regPath, 'utf8');
const modes = { adapter: Adapter.createLoader(root), default: Research.createResearchLoader(root), identity: Research.createResearchLoader(root, { identityEvidence: true }) };
const baseReg = withRegistry(baseSrc, reg => { modes.identityCaBefore = Research.createResearchLoader(root, { identityEvidence: true, corporateActionEvidence: true }); modes.caOnlyBefore = Research.createResearchLoader(root, { corporateActionEvidence: true }); return reg; });
const curReg = withRegistry(curSrc, reg => { modes.identityCaAfter = Research.createResearchLoader(root, { identityEvidence: true, corporateActionEvidence: true }); modes.caOnlyAfter = Research.createResearchLoader(root, { corporateActionEvidence: true }); return reg; });
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_[A-Za-z0-9_.-]+\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const reason = e => String(e && e.message || e).split(':')[0];
const run = (loader, id) => { try { const r = loader(id); return { ok: true, r, digest: sha(JSON.stringify(r)) }; } catch (e) { return { ok: false, reason: reason(e), digest: sha('ERR:' + e.message) }; } };
const counts = Object.fromEntries(Object.keys(modes).map(k => [k, {}]));
const parity = [], changed = [], newly = [], lost = [];
const curIds = new Set(curReg.records.map(r => r.securityId)), baseIds = new Set(baseReg.records.map(r => r.securityId));
for (const id of ids) {
  const res = {};
  for (const [k, loader] of Object.entries(modes)) { res[k] = run(loader, id); const label = res[k].ok ? 'QUALIFIED' : res[k].reason; counts[k][label] = (counts[k][label] || 0) + 1; }
  if (res.adapter.digest !== res.default.digest) parity.push(id);
  if (res.identityCaBefore.digest !== res.identityCaAfter.digest) changed.push(id);
  const b = res.identityCaBefore, a = res.identityCaAfter;
  if (!b.ok && a.ok) {
    const pts = a.r.points;
    newly.push({ securityId: id, before: b.reason, returnBasis: a.r.returnBasis, bars: pts.length, from: pts[0][0], to: pts.at(-1)[0],
      barsFrom2000: pts.filter(p => p[0] >= '2000-01-01').length,
      events: curReg.records.filter(r => r.securityId === id).map(r => ({ week: r.week, class: r.class, era: r.era, weeklyRatio: +r.weeklyRatio.toFixed(6), cik: r.cik, sources: r.sources.length })) });
  }
  if (b.ok && !a.ok) lost.push({ securityId: id, after: a.reason, inBaselineRegistry: baseIds.has(id) });
}
const q = k => counts[k].QUALIFIED || 0;
const report = {
  schemaVersion: 'v10-ca-before-after-1.0.0', productionApproved: false, certificationStatus: 'NOT_CERTIFIED',
  baseline: { ref: baselineRef, registrySha256: sha(baseSrc), protocolSha256: baseReg.protocolSha256, records: baseReg.records.length, series: baseIds.size },
  current: { registrySha256: sha(curSrc), protocolSha256: curReg.protocolSha256, records: curReg.records.length, series: curIds.size,
    adapterSha256: sha(fs.readFileSync(path.join(root, 'quant/engines/weekly-real-adapter.cjs'))), corporateActionEvidenceJsSha256: sha(fs.readFileSync(path.join(root, 'quant/engines/corporate-action-evidence.js'))),
    researchLoaderSha256: sha(fs.readFileSync(path.join(root, 'quant/engines/research-weekly-loader.cjs'))) },
  inputs: { masterHash: modes.default.masterHash, seriesIds: ids.length, seriesDirectorySha256: sha(ids.map(id => id + '\t' + sha(fs.readFileSync(path.join(dir, id + '.json')))).join('\n')) },
  codeSha256: sha(fs.readFileSync(__filename)), runtime: { node: process.version },
  defaultPathParity: { ids: ids.length, identical: ids.length - parity.length, mismatches: parity },
  counts, qualified: Object.fromEntries(Object.keys(modes).map(k => [k, q(k)])),
  identityCaDelta: q('identityCaAfter') - q('identityCaBefore'),
  changedIdentityCa: changed, newlyQualified: newly, lostQualification: lost,
  note: 'QUALIFIED = createResearchLoader returns without error. Opt-in modes exist only in research-weekly-loader.cjs; adapter and corporate-action-evidence.js unchanged.'
};
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ parity: report.defaultPathParity.identical + '/' + ids.length, qualified: report.qualified, delta: report.identityCaDelta, newly: newly.length, lost: lost.length }, null, 1));
