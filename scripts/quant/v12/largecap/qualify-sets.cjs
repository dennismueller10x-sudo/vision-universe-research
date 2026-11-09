#!/usr/bin/env node
/* V12 LARGECAP effect step 1: QUALIFIED series under three research-loader option sets (base3, v10, v12), in the format of
 * scripts/quant/v12/indexpop/qualify.cjs (private qualified-<tag>.json, input of build-outputs.cjs), plus the repository
 * before/after summary. Read-only on repository data.
 *   node scripts/quant/v12/largecap/qualify-sets.cjs --private-dir <dir> --out docs/quant-recovery/v12/largecap/before-after-1.0.0.json */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PRIV = arg('--private-dir'), OUT = arg('--out');
if (!PRIV || !OUT) { console.error('usage: --private-dir <dir> --out <json>'); process.exit(2); }
if (path.resolve(PRIV).startsWith(ROOT + path.sep)) throw Error('PRIVATE_OUTPUT_REQUIRED');
const { createResearchLoader } = require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs'));
const BASE3 = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const SETS = { base3: BASE3, v10: { ...BASE3, identityEvidenceProtocolV10: true }, v12: { ...BASE3, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true } };
const dir = path.join(ROOT, 'quant/data/market/discover-series-long');
const files = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).sort();
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json'), 'utf8'));
const scope = [...P.scope.corporateAction, ...P.scope.identity];
const res = {};
for (const [tag, opts] of Object.entries(SETS)) {
  const loader = createResearchLoader(ROOT, opts), series = {}, reasons = {};
  for (const f of files) {
    const id = f.slice(0, -5);
    try {
      const r = loader(id);
      series[id] = { q: 1, first: r.points[0][0], last: r.points.at(-1)[0], n: r.points.length, lc: r.listingLifecycle ? r.listingLifecycle.status : null,
        binding: r.identityEvidenceBinding ? r.identityEvidenceBinding.schemaVersion + ':' + (r.identityEvidenceBinding.masterRowAction || 'REPLACE_MISBOUND_ROW') : null };
      reasons.QUALIFIED = (reasons.QUALIFIED || 0) + 1;
    } catch (e) {
      const k = String(e.message).split(':')[0];
      series[id] = { q: 0, reason: k };
      reasons[k] = (reasons[k] || 0) + 1;
    }
  }
  const doc = { schemaVersion: 'v12-indexpop-qualified-1.0.0', loaderOptions: opts, masterHash: loader.masterHash, files: files.length, reasons, series };
  fs.writeFileSync(path.join(PRIV, 'qualified-' + tag + '.json'), JSON.stringify(doc));
  res[tag] = doc;
  console.log(tag, JSON.stringify(reasons));
}
const diff = (a, b) => Object.keys(res[b].series).filter(id => res[b].series[id].q && !res[a].series[id].q).sort()
  .map(id => ({ securityId: id, before: res[a].series[id].reason, first: res[b].series[id].first, last: res[b].series[id].last, bars: res[b].series[id].n, binding: res[b].series[id].binding }));
const lost = (a, b) => Object.keys(res[b].series).filter(id => !res[b].series[id].q && res[a].series[id].q).sort();
const changed = (a, b) => Object.keys(res[b].series).filter(id => res[b].series[id].q && res[a].series[id].q && JSON.stringify(res[a].series[id]) !== JSON.stringify(res[b].series[id])).sort();
const out = {
  schemaVersion: 'v12-largecap-before-after-1.0.0', protocol: 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
  loaderSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs'))).digest('hex'),
  identityRegistrySha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'quant/engines/research-identity-evidence.cjs'))).digest('hex'),
  optionSets: SETS, files: files.length,
  qualified: Object.fromEntries(Object.entries(res).map(([t, d]) => [t, d.series ? Object.values(d.series).filter(s => s.q).length : null])),
  reasons: Object.fromEntries(Object.entries(res).map(([t, d]) => [t, d.reasons])),
  newlyQualified: { v10_vs_base3: diff('base3', 'v10'), v12_vs_v10: diff('v10', 'v12') },
  lostQualification: { v10_vs_base3: lost('base3', 'v10'), v12_vs_v10: lost('v10', 'v12') },
  changedOutputAmongQualified: { v12_vs_v10: changed('v10', 'v12') },
  scope: Object.fromEntries(scope.map(id => [id, Object.fromEntries(Object.entries(res).map(([t, d]) => [t, d.series[id].q ? 'QUALIFIED ' + d.series[id].first + '..' + d.series[id].last + ' (' + d.series[id].n + ' bars)' : d.series[id].reason]))])),
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.qualified), 'new v12:', out.newlyQualified.v12_vs_v10.map(x => x.securityId).join(','));
