// Data-Freeze des korrigierten Fundamental-Layers (vor Consumer-Impact und Data-Holdout).
// node scripts/fundamentals-audit/freeze.mjs --write --commit <sha> | --check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const FREEZE_PATH = path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE.json');
export const CODE = ['scripts/quant/sec/provider.py', 'scripts/quant/sec/normalize.py', 'scripts/quant/sec/fiscal.py', 'scripts/quant/sec/periods.py', 'scripts/quant/sec/restatements.py', 'scripts/quant/sec/derived.py', 'scripts/quant/sec/registry.py', 'scripts/quant/sec/consumer.py', 'scripts/quant/sec/canonical.py', 'scripts/quant/sec/version.py'];
export const MAPPING = ['quant/config/sec-metric-registry.json'];
export const AUDIT = ['scripts/fundamentals-audit/sec-ground-truth.mjs', 'scripts/fundamentals-audit/compare.mjs', 'scripts/fundamentals-audit/error-rates.mjs', 'scripts/fundamentals-audit/quant_core_dump.py', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-HOLDOUT-PREREG.json'];
export const TESTS = ['scripts/quant/tests/test_sec_ground_truth_regressions.py'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const group = (list) => { const files = Object.fromEntries(list.map((p) => [p, sha(p)])); return { files, hash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') }; };

export function verify() {
  if (!fs.existsSync(FREEZE_PATH)) return { ok: false, reason: 'NO_FREEZE' };
  const f = JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8'));
  const changed = [];
  for (const k of ['code', 'mapping', 'audit', 'tests']) for (const [p, h] of Object.entries(f[k].files)) if (sha(p) !== h) changed.push(p);
  return changed.length ? { ok: false, reason: 'CHANGED', changed } : { ok: true, codeHash: f.code.hash, mappingHash: f.mapping.hash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) { const r = verify(); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); }
  const commit = argv[argv.indexOf('--commit') + 1];
  const reg = JSON.parse(fs.readFileSync(path.join(root, MAPPING[0]), 'utf8'));
  const ver = fs.readFileSync(path.join(root, 'scripts/quant/sec/version.py'), 'utf8');
  const gt = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-GROUND-TRUTH.json'), 'utf8'));
  const out = {
    schema: 'vu-fundamental-data-freeze-1.0.0', status: 'FROZEN', frozenAt: new Date().toISOString(), commit,
    dataVersion: { normalizationLogic: /NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(ver)[1], registryMapping: reg.mapping_version, consumerSchema: 'vu-consumer-fundamentals-1.0.0 (unveraendert)', label: 'vu-fundamentals-core-1.11.0+registry-1.7.0' },
    code: group(CODE), mapping: group(MAPPING), audit: group(AUDIT), tests: group(TESTS),
    regressionSuite: { file: TESTS[0], cases: ['E1 TNDM', 'E2 AMT', 'E3 DE', 'E3b CERN', 'E4 REPL (gemeldet + ohne Q4-Meldung)'] },
    groundTruthResult: { label: gt.label, beforeAfterQuant: gt.beforeAfterQuant, quantRatesAfter: Object.fromEntries(Object.entries(gt.rates.byPipelineMetric).filter(([k]) => k.startsWith('QUANT|')).map(([k, v]) => [k, { fact: v.factAccuracy, value: v.valueAccuracy, pit: v.pitAccuracy, falseMissing: v.falseMissingRate, falseAvailable: v.falseAvailableRate, wrong: v.wrongValueRate }])) },
    rule: 'Nach diesem Freeze keine Aenderung an Kern-Code, Mapping, Ground-Truth-Methode oder Gates. Consumer-Impact und Data-Holdout nur gegen diesen Stand. Builds anderer Staende gelten als STALE_BUILD.',
    gitClean: execFileSync('git', ['status', '--porcelain', '--', ...CODE, ...MAPPING, ...TESTS], { cwd: root }).toString().trim() === '',
  };
  fs.writeFileSync(FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('frozen', out.code.hash.slice(0, 12), out.mapping.hash.slice(0, 12), 'clean', out.gitClean);
}
