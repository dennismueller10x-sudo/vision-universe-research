#!/usr/bin/env node
/* V10 POPULATION: QUALIFIED counts default vs. every option vs. all options, plus the full default-path parity proof
 * (createResearchLoader(root) vs. the unchanged adapter loader over all ids, output hashes compared).
 *   node scripts/quant/v10/population/before-after.cjs --reasons <private>/reasons.json --out docs/quant-recovery/v10/population/before-after.json
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const root = path.resolve(path.join(__dirname, '../../../..'));
const A = require(path.join(root, 'quant/engines/weekly-real-adapter.cjs'));
const R = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const reasons = JSON.parse(fs.readFileSync(arg('--reasons'), 'utf8'));
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const adapter = A.createLoader(root), dflt = R.createResearchLoader(root);
let identical = 0; const diffs = [];
for (const id of ids) {
  let a, b;
  try { a = A.hash(JSON.stringify(adapter(id))); } catch (e) { a = 'ERR:' + e.message; }
  try { b = A.hash(JSON.stringify(dflt(id))); } catch (e) { b = 'ERR:' + e.message; }
  if (a === b) identical++; else diffs.push(id);
}
const rowsOf = name => new Map(reasons.configs[name].rows.map(r => [r.securityId, r]));
const D = rowsOf('default');
const configs = {};
for (const [name, c] of Object.entries(reasons.configs)) {
  const rows = rowsOf(name), gained = [], lost = [];
  for (const id of ids) {
    const was = D.get(id).reason === 'QUALIFIED', now = rows.get(id).reason === 'QUALIFIED';
    if (!was && now) gained.push(id); if (was && !now) lost.push({ securityId: id, reason: rows.get(id).reason });
  }
  const cut = [...rows.values()].filter(r => r.lifecycle).length;
  configs[name] = { options: c.options, qualified: c.counts.QUALIFIED || 0, deltaVsDefault: (c.counts.QUALIFIED || 0) - (D.size ? reasons.configs.default.counts.QUALIFIED : 0),
    counts: c.counts, gainedVsDefault: gained, lostVsDefault: lost, qualifiedWithLifecycleCut: cut };
}
const out = { schemaVersion: 'v10-population-before-after-1.0.0', total: ids.length,
  defaultParity: { compared: ids.length, identicalOutputs: identical, differing: diffs, rule: 'sha256(JSON.stringify(result or error)) of the unchanged adapter loader vs createResearchLoader(root) with no option' },
  configs };
fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ parity: identical + '/' + ids.length, qualified: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, v.qualified])) }));
