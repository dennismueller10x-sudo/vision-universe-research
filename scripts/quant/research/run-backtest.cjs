#!/usr/bin/env node
'use strict';
// Offline CLI for the research backtest runner (no provider fetch, no product path, no workflow).
//   node scripts/quant/research/run-backtest.cjs --spec <spec.json> --out <result.json>
//        [--cache <private dir outside the repository>] [--private-delisted <dir>] [--private-factor-panel <panel.jsonl.gz>]
//        [--no-qa]   (drops the QA block: per-event rows / portfolio schedule used by the independent Python check)
// Writes only --out (and, when given, the private cache directory). Prints a one-line summary with runtime and memory.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];
function parse(argv) {
  const o = { qa: true }, flags = { '--spec': 'spec', '--out': 'out', '--cache': 'cache', '--private-delisted': 'delisted', '--private-factor-panel': 'factorPanel' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-qa') { o.qa = false; continue; }
    const k = flags[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[++i];
  }
  if (!o.spec || !o.out) throw Error('SPEC_AND_OUT_REQUIRED');
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) throw Error('OUT_INSIDE_GENERATED_DATA:' + rel);
  return o;
}
function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const spec = JSON.parse(fs.readFileSync(o.spec, 'utf8'));
  const result = R.runBacktest(spec, { cacheDir: o.cache || null, privateDirs: { delistedSeries: o.delisted || process.env.VU_PRIVATE_DELISTED_SERIES || null, factorPanel: o.factorPanel || process.env.VU_PRIVATE_FACTOR_PANEL || null } });
  const out = o.qa ? result : { ...result, qa: null };
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify({ id: spec.id, kind: result.kind, state: result.state, envelopeHash: result.envelopeHash, resultHash: result.resultHash, ...result.diagnostics, certification: 'NOT_CERTIFIED', productionApproved: false }));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { main, parse };
