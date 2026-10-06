#!/usr/bin/env node
// Minervini Canonical Replication – Source-to-Code-Artefakt (reproduzierbar aus Regelbuch, Code und Tests).
//
//   node scripts/supertrader/replication/minervini/artifacts.mjs --write   schreibt fidelity/MINERVINI-SOURCE-TO-CODE.json
//   node scripts/supertrader/replication/minervini/artifacts.mjs --check   vergleicht mit der eingecheckten Datei
//
// Kette je Regel: SOURCE -> INTERPRETATION -> DATA -> FORMALIZATION -> CODE -> TEST -> FIDELITY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULEBOOK, PARAM_TABLE } from './params.mjs';
import { classify } from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
export const OUT_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-SOURCE-TO-CODE.json');
export const TEST_PATH = path.join(root, 'scripts/supertrader/tests/minervini-replication.test.mjs');

export function testIdsInSuite(src = fs.readFileSync(TEST_PATH, 'utf8')) {
  const ids = new Set();
  for (const m of src.matchAll(/test\('([^']+)'/g)) for (const id of m[1].split(':')[0].split('/').map((x) => x.trim())) ids.add(id.replace(/\s*\(.*\)$/, ''));
  return ids;
}

export async function build() {
  const sources = new Map(RULEBOOK.sources.map((s) => [s.id, s]));
  const suite = testIdsInSuite();
  const chains = [];
  for (const r of RULEBOOK.rules) {
    const impl = r.implementation;
    let exported = null;
    if (impl.module) {
      const mod = await import(path.join(root, impl.module));
      exported = typeof mod[impl.function] === 'function';
    }
    chains.push({
      ruleId: r.id, category: r.category, layer: r.layer,
      source: { refs: r.sources.map((id) => ({ id, type: sources.get(id)?.type || null, primary: sources.get(id)?.primary ?? null })), confidence: r.sourceConfidence },
      interpretation: { provenanceClass: r.provenanceClass, reproducibility: r.reproducibility, canonical: r.canonicalDescription },
      data: { required: r.requiredData, available: r.availableData },
      formalization: { text: r.formalization.text, parameters: Object.keys(r.formalization.parameters).map((name) => ({ name, value: PARAM_TABLE[name].value, provenance: PARAM_TABLE[name].provenance })) },
      code: impl.module ? { status: impl.status, module: impl.module, function: impl.function, exported } : { status: impl.status },
      tests: r.test.map((id) => ({ id, present: suite.has(id) })),
      expectedBehavior: r.formalization.text.split(/(?<=\.)\s/)[0],
      fidelity: r.fidelity,
    });
  }
  const c = classify();
  return {
    schema: 'vu-minervini-source-to-code-1.0.0', rulebookVersion: RULEBOOK.rulebookVersion, engine: RULEBOOK.engine,
    principle: 'SOURCE -> RULE -> DATA -> FORMALIZATION -> CODE -> TEST -> FIDELITY FREEZE -> BACKTEST',
    classification: c,
    summary: {
      rules: chains.length,
      implemented: chains.filter((x) => x.code.status === 'IMPLEMENTED').length,
      recordedOnly: chains.filter((x) => x.code.status === 'RECORDED_ONLY').length,
      notImplemented: chains.filter((x) => x.code.status === 'NOT_IMPLEMENTED').length,
      byProvenance: chains.reduce((a, x) => { const k = x.interpretation.provenanceClass; a[k] = (k in a ? a[k] : 0) + 1; return a; }, {}),
      byReproducibility: chains.reduce((a, x) => { const k = x.interpretation.reproducibility; a[k] = (k in a ? a[k] : 0) + 1; return a; }, {}),
    },
    chains,
  };
}

async function main() {
  const out = JSON.stringify(await build(), null, 2) + '\n';
  if (process.argv.includes('--write')) { fs.writeFileSync(OUT_PATH, out); console.log('geschrieben: ' + path.relative(root, OUT_PATH)); return; }
  const cur = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
  if (cur !== out) { console.error('MINERVINI-SOURCE-TO-CODE.json ist nicht aktuell (--write).'); process.exit(1); }
  console.log('aktuell');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
