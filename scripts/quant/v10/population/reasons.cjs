#!/usr/bin/env node
/* V10 POPULATION: per-id qualification reasons of createResearchLoader for several loader configurations.
 * Read-only on the repository; writes only --out.
 *   node scripts/quant/v10/population/reasons.cjs --out <file> [--configs '{"default":null,"all":{...}}'] [--root <dir>]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const out = arg('--out');
if (!out) { console.error('usage: --out <file> [--configs <json>] [--root <dir>]'); process.exit(2); }
const root = path.resolve(arg('--root') || path.join(__dirname, '../../../..'));
const { createResearchLoader } = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const { hash } = require(path.join(root, 'quant/engines/weekly-real-adapter.cjs'));
const DEFAULT_CONFIGS = {
  default: null,
  identity: { identityEvidence: true },
  identityV10: { identityEvidence: true, identityEvidenceProtocolV10: true },
  ca: { corporateActionEvidence: true },
  lifecycle: { listingLifecycleEvidence: true },
  identityCa: { identityEvidence: true, corporateActionEvidence: true },
  all: { identityEvidence: true, identityEvidenceProtocolV10: true, corporateActionEvidence: true, listingLifecycleEvidence: true },
};
const configs = arg('--configs') ? JSON.parse(arg('--configs')) : DEFAULT_CONFIGS;
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const result = { schemaVersion: 'v10-population-reasons-1.0.0', total: ids.length, configs: {} };
for (const [name, opts] of Object.entries(configs)) {
  let loader;
  try { loader = createResearchLoader(root, opts === null ? undefined : opts); } catch (e) { result.configs[name] = { options: opts, error: e.message }; continue; }
  const counts = {}, rows = [];
  const t0 = Date.now();
  for (const id of ids) {
    let reason = 'QUALIFIED', extra = null;
    try {
      const r = loader(id);
      extra = { from: r.points[0][0], to: r.points.at(-1)[0], bars: r.points.length, listingId: r.listingId,
        lifecycle: r.listingLifecycle ? r.listingLifecycle.status : null, outHash: hash(JSON.stringify(r)) };
    } catch (e) { reason = String(e.message).split(':')[0]; }
    counts[reason] = (counts[reason] || 0) + 1;
    rows.push({ securityId: id, reason, ...(extra || {}) });
  }
  result.configs[name] = { options: opts, counts, ms: Date.now() - t0, rows };
  console.error(name, JSON.stringify(counts));
}
fs.writeFileSync(out, JSON.stringify(result));
