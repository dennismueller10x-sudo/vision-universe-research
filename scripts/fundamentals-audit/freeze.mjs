// Data-Freeze des korrigierten Fundamental-Layers.
//   v1 FUNDAMENTAL-DATA-FREEZE.json     Stand 1.11.0, gegen den der Data-Holdout lief (unveraendert, nicht ueberschreiben)
//   v2 FUNDAMENTAL-DATA-FREEZE-v2.json  Stand 1.12.0 (E9, gefunden in der Consumer-Wirkungsanalyse nach dem Holdout; unveraendert)
//   v3 FUNDAMENTAL-DATA-FREEZE-v3.json  Stand 1.15.0 + Registry 1.8.0 (Red-Team-Korrektur; unveraendert)
//   v4 FUNDAMENTAL-DATA-FREEZE-v4.json  Stand 1.19.0 + Registry 1.9.0 + Umsatzbelege 1.1.0 (TTM-Integritaet, Belege, Sichten)
// node scripts/fundamentals-audit/freeze.mjs --write --commit <sha> [--reason <text>] | --check [--freeze v1|v2|v3|v4]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const FREEZE_V1_PATH = path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE.json');
export const FREEZE_PATHS = { v1: FREEZE_V1_PATH, v2: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v2.json'), v3: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v3.json'), v4: path.join(here, 'artifacts', 'FUNDAMENTAL-DATA-FREEZE-v4.json') };
export const FREEZE_PATH = FREEZE_PATHS.v4;
const PREVIOUS_FREEZE = FREEZE_PATHS.v3;
export const CODE = ['scripts/quant/sec/provider.py', 'scripts/quant/sec/normalize.py', 'scripts/quant/sec/fiscal.py', 'scripts/quant/sec/periods.py', 'scripts/quant/sec/restatements.py', 'scripts/quant/sec/derived.py', 'scripts/quant/sec/registry.py', 'scripts/quant/sec/consumer.py', 'scripts/quant/sec/canonical.py', 'scripts/quant/sec/version.py'];
export const MAPPING = ['quant/config/sec-metric-registry.json', 'quant/config/sec-revenue-statement-evidence.json'];
export const AUDIT = ['scripts/fundamentals-audit/sec-ground-truth.mjs', 'scripts/fundamentals-audit/compare.mjs', 'scripts/fundamentals-audit/error-rates.mjs', 'scripts/fundamentals-audit/quant_core_dump.py', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-HOLDOUT-PREREG.json',
  'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT-PREREG.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-TTM-HOLDOUT-RESULT.json', 'scripts/fundamentals-audit/ttm_holdout_eval.py', 'scripts/fundamentals-audit/ttm_holdout_failures.py',
  'scripts/fundamentals-audit/build_revenue_evidence.py', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-CONSUMER-VIEW-CONTRACTS.json', 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-GROUND-TRUTH.json'];
export const TESTS = ['scripts/quant/tests/test_sec_ground_truth_regressions.py', 'scripts/quant/tests/test_sec_ttm_integrity.py', 'scripts/quant/tests/test_normalize_periods.py', 'core/tests/fundamental-cross-consumer.test.mjs'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const group = (list) => { const files = Object.fromEntries(list.map((p) => [p, sha(p)])); return { files, hash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') }; };

export function verify(freezePath = FREEZE_PATH) {
  if (!fs.existsSync(freezePath)) return { ok: false, reason: 'NO_FREEZE' };
  const f = JSON.parse(fs.readFileSync(freezePath, 'utf8'));
  const changed = [];
  for (const k of ['code', 'mapping', 'audit', 'tests']) for (const [p, h] of Object.entries(f[k].files)) if (sha(p) !== h) changed.push(p);
  return changed.length ? { ok: false, reason: 'CHANGED', changed } : { ok: true, codeHash: f.code.hash, mappingHash: f.mapping.hash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) { const r = verify(argv.includes('--freeze') ? FREEZE_PATHS[argv[argv.indexOf('--freeze') + 1]] : FREEZE_PATH); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); }
  const commit = argv[argv.indexOf('--commit') + 1];
  const reg = JSON.parse(fs.readFileSync(path.join(root, MAPPING[0]), 'utf8'));
  const ver = fs.readFileSync(path.join(root, 'scripts/quant/sec/version.py'), 'utf8');
  const gt = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-GROUND-TRUTH.json'), 'utf8'));
  const out = {
    schema: 'vu-fundamental-data-freeze-1.0.0', status: 'FROZEN', frozenAt: new Date().toISOString(), commit,
    dataVersion: { normalizationLogic: /NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(ver)[1], registryMapping: reg.mapping_version, consumerSchema: 'vu-consumer-fundamentals-1.0.0 (unveraendert)', label: `vu-fundamentals-core-${/NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(ver)[1]}+registry-${reg.mapping_version}` },
    code: group(CODE), mapping: group(MAPPING), audit: group(AUDIT), tests: group(TESTS),
    supersedes: { file: path.relative(root, PREVIOUS_FREEZE), hash: crypto.createHash('sha256').update(fs.readFileSync(PREVIOUS_FREEZE)).digest('hex'), note: 'fruehere Freezes bleiben unveraendert; der Data-Holdout ist gegen v1 gelaufen' },
    reason: argv.includes('--reason') ? argv[argv.indexOf('--reason') + 1] : null,
    parent: 'v3 (FUNDAMENTAL-DATA-FREEZE-v3.json, Kern 1.15.0, Registry 1.8.0)',
    revenueEvidence: (() => { const e = JSON.parse(fs.readFileSync(path.join(root, MAPPING[1]), 'utf8')); return { version: e.version, summary: e.summary, filings: Object.keys(e.decisions).length }; })(),
    ttmDefinition: {
      EPS_TTM: 'Summe von vier GEMELDETEN Dreimonats-EPS (keine Q4-Ableitung), Enden verschieden und 12-17 Wochen auseinander, keine Zelle mit zwei Perioden, Fenster nicht vor dem juengsten veroeffentlichten Geschaeftsjahr, eine Einheit, eine Konzeptklasse (gesamt; fortgefuehrt allein = kein EPS-TTM), eine Aktienbasis (kein Sprung >= 1,5 oder um ein Splitverhaeltnis), EPS konsistent mit Ergebnis/Aktien',
      basicDiluted: 'getrennt: eps_diluted / eps_basic, nie gemischt', fallback: 'nie EPS_FY als TTM; Bundle-Felder eps.ttmDiluted/ttmBasic VERIFIED|NOT_AVAILABLE(+Grund), fy*/latestQuarter* mit Konzeptklasse',
      additive: 'Umsatz/Ergebnis: Konzeptwechsel nur ohne Unterschiedsbeleg oder im gemeinsamen Konzept (ALT)', reconstruction: 'keine EPS_TTM_RECONSTRUCTED (Q4-Ableitung verfehlt das Genauigkeitsziel; Eigentuemer-Option)'},
    revenueAmbiguityPolicy: 'Revenues kleiner als ein anderes Umsatzkonzept derselben Zelle: Beleg der Einreichung entscheidet (TOTAL / OTHER:<Konzept>), sonst leer (AMBIGUOUS > GUESSED)',
    views: { bundle: 'LATEST_RESTATED', ttm: 'CURRENT_TTM', resolver: 'PIT_TTM(as_of) = PeriodResolver.ttm/ttm_ending(as_of)', notInBundle: 'AS_REPORTED_AT_TIME' },
    ttmHoldout: (() => { const r = JSON.parse(fs.readFileSync(path.join(here, 'artifacts', 'FUNDAMENTAL-TTM-HOLDOUT-RESULT.json'), 'utf8')); return { verdict: r.verdict, gates: r.gates, candidate: r.candidate, postHoldoutChanges: ['1.18.0 F-TTM-1', '1.19.0 Red-Team HIGH-1..4, MEDIUM-5..7'], note: 'Holdout gegen 1.16.0 gelaufen; Aenderungen danach sind nicht holdout-validiert' }; })(),
    consumerContracts: 'scripts/fundamentals-audit/artifacts/FUNDAMENTAL-CONSUMER-VIEW-CONTRACTS.json',
    groundTruthCoreV4: gt.coreV4 ? { development: gt.coreV4.development, holdout: gt.coreV4.holdout } : null,
    regressionSuite: { files: TESTS.slice(0, 2), cases: ['E1 TNDM', 'E2 AMT', 'E3 DE', 'E3b CERN', 'E4 REPL', 'E9 CECO', 'E2-R FLS, PESI, AMT, UPST', 'E10 NTRS, NVDA', 'E11 FUBO', 'E12 CSWC', 'TTM PEP, MUR, PIPR, CLIR, CSWC', 'F-TTM-1 VFC', 'Red Team NEOG, WBHC, VFC, HOV, CHDN, VSYS, ESCA, OSK'] },
    groundTruthCoreFinal: gt.coreFinal ? { version: gt.coreFinal.version, devRates: gt.coreFinal.devRates, holdoutRates: gt.coreFinal.holdoutRates, stepEffects: gt.coreFinal.stepEffects } : null,
    groundTruthResult: { label: gt.label, beforeAfterQuant: gt.beforeAfterQuant, quantRatesAfter: Object.fromEntries(Object.entries(gt.rates.byPipelineMetric).filter(([k]) => k.startsWith('QUANT|')).map(([k, v]) => [k, { fact: v.factAccuracy, value: v.valueAccuracy, pit: v.pitAccuracy, falseMissing: v.falseMissingRate, falseAvailable: v.falseAvailableRate, wrong: v.wrongValueRate }])) },
    rule: 'Nach diesem Freeze keine Aenderung an Kern-Code, Mapping, Ground-Truth-Methode oder Gates. Consumer-Impact und Data-Holdout nur gegen diesen Stand. Builds anderer Staende gelten als STALE_BUILD.',
    gitClean: execFileSync('git', ['status', '--porcelain', '--', ...CODE, ...MAPPING, ...TESTS], { cwd: root }).toString().trim() === '',
  };
  fs.writeFileSync(FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('frozen', out.code.hash.slice(0, 12), out.mapping.hash.slice(0, 12), 'clean', out.gitClean);
}
