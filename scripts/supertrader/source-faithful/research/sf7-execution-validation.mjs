/**
 * Supertrader 7.0 – registered validation variants and snapshot protocol of the execution validation
 * (docs/SUPERTRADER_7_EXECUTION_VALIDATION.md; checks in research/sf7-execution-checks.mjs; tests sf-sf7-execution-validation).
 * Pinned before any snapshot result (test SF7-VAL-REGISTRY). Sealed metrics never choose a variant (E6).
 */
import crypto from 'node:crypto';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { makeWeinsteinAdapter } from './weinstein-lifecycle.mjs';
import { SF7_CHECKS_VERSION } from './sf7-execution-checks.mjs';

export * from './sf7-execution-checks.mjs';
export const SF7_VALIDATION_VERSION = 'sf7-execution-validation-1.0.0';
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

/**
 * Versioned reading for a declared mismatch (Supertrader 7.0, LOW in docs/SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md §6):
 * the model assumption MA-WEIN-TRAIL says "a weekly high AT OR ABOVE that high" raises the stop; the reference code asks
 * for a weekly high strictly ABOVE the peak. The reference is not changed (sf5 registry, adapter version and hashes stay);
 * the declared reading runs as its own variant beside REF and is reported by counts.
 */
export const SF7_VALIDATION_REVISIONS = Object.freeze([
  Object.freeze({ id: 'EX7-WEIN-TRAIL-AT-OR-ABOVE', finding: 'SF7-V1', kind: 'DECLARATION_CODE_MISMATCH', class: 'MODEL_ASSUMPTION_READING_NOT_A_SOURCE_RULE', phase: 'POSITION_MANAGEMENT', rule: 'MA-WEIN-TRAIL as declared: a completed weekly high at or above the peak since the entry ends the correction (raise when the correction reached the threshold)', why: 'the declared model assumption says "at or above"; the reference code uses ">" (an equal weekly high continues the correction). Source wording ("return near the prior high", WEIN-TRAIL1/2, WEIN-TR-TRAIL) has no number, so neither is a source rule', appliesTo: 'SF7 validation variants only; the references keep ">"' }),
]);
const lcOf = (key) => SF5_LIFECYCLES.find((l) => l.key === key);
function weinVariant(key, kind) {
  const lc = lcOf(key), a = makeWeinsteinAdapter(kind, { trailAtOrAbove: true });
  return Object.freeze({ key, id: 'SF7-WEIN-TRAIL-AT-OR-ABOVE', compareTo: 'REF', revision: 'EX7-WEIN-TRAIL-AT-OR-ABOVE', adapter: Object.freeze({ ...a, version: `${lc.adapter.version}+${SF7_VALIDATION_VERSION}` }), config: lc.variants.find((v) => v.id === 'REF').config });
}
export const SF7_VALIDATION_VARIANTS = Object.freeze([weinVariant('WEINSTEIN_INVESTOR', 'INVESTOR'), weinVariant('WEINSTEIN_TRADER', 'TRADER')]);

/** Pre-registered parameters of the snapshot diagnostics (fixed before the run; test SF7-VAL-REGISTRY pins them). */
export const SF7_VALIDATION_PROTOCOL = Object.freeze({
  invariants: 'every sf5 variant and every SF7 execution / validation variant of the run',
  pitCorruption: Object.freeze({ cutQuantile: 0.5, keepSessions: 20, seed: 709, scope: 'REF of every lifecycle; bars after the cut replaced (same dates), decisions through the cut must be identical' }),
  stability: Object.freeze({ leaveOut: 3, choice: 'most trades, then sha256 order of the security id', startShift: 1, scope: 'REF of every lifecycle; counts only' }),
});

export function sf7ValidationSha256() {
  return sha({ version: SF7_VALIDATION_VERSION, checks: SF7_CHECKS_VERSION, revisions: SF7_VALIDATION_REVISIONS, protocol: SF7_VALIDATION_PROTOCOL, variants: SF7_VALIDATION_VARIANTS.map((v) => ({ key: v.key, id: v.id, compareTo: v.compareTo, revision: v.revision, adapter: v.adapter.version, config: v.config })) });
}
