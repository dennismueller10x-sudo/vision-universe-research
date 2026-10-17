#!/usr/bin/env node
/**
 * Builds the twelve public artifacts of the root-cause / backtest-impact audit from one diagnostic run directory
 * (docs/data-quality/root-cause-audit/run-<id>/) plus the static, cited evidence. Public content only: counts,
 * correlations, deltas, directions, enums and provenance. Usage:
 *   node build-artifacts.mjs --run <run dir> --out <docs/data-quality/root-cause-audit>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './lib.mjs';
import { PR_EVIDENCE, LAYERS, PRODUCT_LINEAGE, PROVIDER_FACTS, VU_FINDINGS, DETERMINISTIC } from './static-evidence.mjs';

export const METHODS = ['cross_sectional_momentum', '52_week_high_effect', 'LOW_VOLATILITY', 'TURTLE_S2_EQUITY_DAILY', 'WEINSTEIN_STAGE_DAILY', 'KULLAMAGI_DAILY_ADAPTATION'];
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
/** Frozen tournament / V4 input fingerprint and its documented size (#721 BEFORE capture, freeze V4-beae51ae1b07768b). */
export const FROZEN = { dataFingerprint: '318c051ff71e9f405d4bf9733284151f15c55bd8658384cce45e7b34a3c372d5', securities: 9408, bars: 14374702, source: '#721 docs/data-quality/price-integrity/QUANT-PRICE-INTEGRITY-POPULATION.json; #722 report section 3' };

export function build(runDir) {
  const pop = readJson(path.join(runDir, 'POPULATION.json'));
  const methods = Object.fromEntries(METHODS.map((m) => [m, readJson(path.join(runDir, `BACKTEST-IMPACT-${m}.json`))]));
  const v3audit = readJson(path.join(runDir, 'CORPORATE-ACTION-V3-AUDIT.json'));
  const prep = readJson(path.join(runDir, 'PREPARE.json'));
  const capture = readJson(path.join(runDir, 'capture.json')) || readJson(path.join(runDir, `capture-${METHODS[0]}.json`));
  const runId = path.basename(runDir).replace(/^run-/, '');
  const fp = capture?.inputs?.dataFingerprint ?? null;
  const provenance = { auditVersion: K.VERSION, runId, workflow: '.github/workflows/research-price-root-cause-audit.yml', captureFingerprint: fp, frozenTournamentFingerprint: FROZEN.dataFingerprint,
    captureEqualsFrozenTournamentInput: fp === FROZEN.dataFingerprint, pinned: { base: '547d604d (#705 head)', v3: 'f8644cf1 (#758 head)', v2: '0d8e2755 (#737 head)', mergedSecFinraInputs: 'run 39019906367' },
    vendorUsed: false, certifying: false, performanceNumbers: 'DELTAS_AND_DIRECTIONS_ONLY; absolute metrics owner-sealed' };
  return { pop, methods, v3audit, prep, capture, provenance };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = K.args(process.argv.slice(2));
  const b = build(path.resolve(o.run));
  process.stdout.write(JSON.stringify({ provenance: b.provenance, population: !!b.pop, methods: Object.fromEntries(Object.entries(b.methods).map(([k, v]) => [k, !!v])) }, null, 2) + '\n');
}
export { PR_EVIDENCE, LAYERS, PRODUCT_LINEAGE, PROVIDER_FACTS, VU_FINDINGS, DETERMINISTIC };
