#!/usr/bin/env node
'use strict';
// Builds the internal backtest preview read model (backtest-preview-1.0.0) from committed runner results.
//   node scripts/quant/research/build-backtest-preview.cjs --out <file>
//        [--demos docs/quant/backtest-demos] [--certification quant/data/product/backtest-certification-v1.json]
//        [--extra-result <runner-result.json>]...   (offline output of run-backtest.cjs, added as further case)
// Offline, no fetch, no runner execution, no product path, no workflow. Reads only; writes only --out.
// Refuses --out under quant/data, discover/data, supertrader/data, social/data (OUT_INSIDE_GENERATED_DATA).
const fs = require('node:fs');
const path = require('node:path');
const Preview = require('../../../quant/api/backtest-preview-service.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];
const DEFAULTS = { demos: 'docs/quant/backtest-demos', certification: 'quant/data/product/backtest-certification-v1.json' };

function parse(argv) {
  const o = { extra: [] }, flags = { '--demos': 'demos', '--certification': 'certification', '--out': 'out' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--extra-result' && argv[i + 1]) { o.extra.push(argv[++i]); continue; }
    const k = flags[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[++i];
  }
  if (!o.out) throw Error('OUT_REQUIRED');
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) throw Error('OUT_INSIDE_GENERATED_DATA:' + rel);
  return { demos: o.demos || DEFAULTS.demos, certification: o.certification || DEFAULTS.certification, out: o.out, extra: o.extra };
}
const readJson = f => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));
const label = f => { const rel = path.relative(ROOT, path.resolve(ROOT, f)); return rel.startsWith('..') ? 'PRIVATE:' + path.basename(f) : rel.split(path.sep).join('/'); };

function build(o) {
  const cases = readJson(path.join(o.demos, 'cases.json'));
  const summary = readJson(path.join(o.demos, 'summary.json'));
  const results = {};
  const metas = cases.cases.map(c => { results[c.id] = readJson(path.join(o.demos, 'results', c.id + '.json')); return { id: c.id, kind: c.kind, scenarios: c.scenarios, privateData: c.privateData, purpose: c.purpose }; });
  for (const f of o.extra) {
    const r = readJson(f);
    const id = r && r.spec && r.spec.id;
    if (!id || results[id]) throw Error('EXTRA_RESULT_ID_MISSING_OR_DUPLICATE:' + f);
    results[id] = r;
    metas.push({ id, kind: r.kind, scenarios: ['OFFLINE_RUNNER_RESULT'], privateData: null, purpose: r.spec.description || null });
  }
  return Preview.buildPreview({
    cases: metas, results, summary, certification: readJson(o.certification),
    sources: { demos: label(o.demos), runner: cases.runner, certification: label(o.certification), extraResults: o.extra.map(label) }
  });
}

function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const doc = build(o);
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ out: o.out, schemaVersion: doc.schemaVersion, previewHash: doc.previewHash,
    kinds: Object.fromEntries(doc.kinds.map(k => [k.kind, k.stateCode + ' (' + k.cases.length + ')'])), certification: 'NOT_CERTIFIED', productionApproved: false }));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { main, parse, build };
