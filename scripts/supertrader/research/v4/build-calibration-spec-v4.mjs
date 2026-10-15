/**
 * Writes SUPERTRADER-V4-CALIBRATION-SPEC.json from the frozen code constants (no hand-maintained duplicate).
 * The spec is bound by the V4 freeze; a test checks that the committed file equals this output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEASUREMENT_POLICY_V4 } from './measurement/measurement-policy-v4.mjs';
import { CONSTRUCTION_CONTRACT_V4 } from './oracle/constructions-v4.mjs';
import { ORACLE_TOLERANCES_V4, INTERNAL_RECONCILIATION_TOLERANCE_V4 } from './oracle/compare-v4.mjs';
import { CERTIFICATION_LEVELS_V4, EXPECTED_ORACLES_V4 } from './completion-v4.mjs';
import { DUST_VALUE_LIMIT, DUST_BOOK_VALUE_CAP, MIN_ORDER_VALUE, RECONCILIATION_ABSOLUTE_FLOOR, RECONCILIATION_FLOW_ULPS } from './measurement/accounting-v4.mjs';
import { ADJUSTED_LEVEL_THRESHOLD, SPLIT_CONSISTENCY_BAND, UNIT_JUMP_RATIO, GENUINE_RAW_NOMINAL_FLOOR, PRICE_SANITY_CLASSES } from './measurement/price-sanity-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.join(HERE, 'SUPERTRADER-V4-CALIBRATION-SPEC.json');

export function calibrationSpecV4() {
  return {
    schema: 'supertrader-v4-calibration-spec-1.0.0',
    generation: 'CALIBRATION_V4',
    postHoc: true,
    registeredBeforeV4Measurement: true,
    question: 'Can VU measure a simple stock strategy correctly? (not: does a trader method work)',
    v3Relationship: 'V3 freezes, verdicts and results are historical evidence and are not changed; V4 is a new post-hoc generation with its own freeze',
    referenceValuesSeenBeforeMeasurement: 'The oracle files were downloaded and parsed on 2026-10-15 to verify format and hashes; three reference means were printed once after the tolerances were fixed in code. No VU construction result existed at that time.',
    oracleClassification: {
      EW_MARKET: 'MATCHED_UNIVERSE_APPROXIMATION',
      MOM_12_2_EW_DECILES: 'MATCHED_UNIVERSE_APPROXIMATION',
      VAR_60D_EW_QUINTILES: 'MATCHED_UNIVERSE_APPROXIMATION',
      CAL_JT1993_6_6: 'DIRECTIONAL_REPLICATION (no public series; not measured in V4)',
      CAL_GH2004_52WH: 'INTERNAL_CONTROL_ONLY (no public series; not measured in V4)',
      EXACT_REFERENCE_REPLICATION: 'not attempted: requires the CRSP panel',
    },
    constructions: CONSTRUCTION_CONTRACT_V4,
    measurementPolicy: MEASUREMENT_POLICY_V4,
    accounting: { dustValueLimit: DUST_VALUE_LIMIT, dustBookValueCap: DUST_BOOK_VALUE_CAP, minimumOrderValue: MIN_ORDER_VALUE, reconciliationAbsoluteFloor: RECONCILIATION_ABSOLUTE_FLOOR, reconciliationFlowUlps: RECONCILIATION_FLOW_ULPS },
    priceSanity: { threshold: ADJUSTED_LEVEL_THRESHOLD, splitConsistencyBand: SPLIT_CONSISTENCY_BAND, unitJumpRatio: UNIT_JUMP_RATIO, genuineRawNominalFloor: GENUINE_RAW_NOMINAL_FLOOR, classes: PRICE_SANITY_CLASSES, treatment: 'classify, quarantine only proven defects, sensitivity without all affected' },
    comparisonMetrics: ['direction', 'monthly correlation', 'mean return', 'annualized return', 'volatility', 'max drawdown', 'rank spread (high-minus-low)', 'holding count (informational)', 'turnover (VU only, oracle unavailable)', 'exposure (structural)', 'rebalance dates (month-end both)'],
    tolerances: { external: ORACLE_TOLERANCES_V4, internal: INTERNAL_RECONCILIATION_TOLERANCE_V4, noPostResultChange: true },
    books: { CLOSE: 'internal two-path oracle (formation close fill adapter, zero cost)', NEXT_OPEN: 'frozen tournament convention, informational execution effect' },
    review: ['reconciliation (gross-flow tolerance)', 'R8b dividends recomputed', 'dust value cap', 'curve finite/non-negative', 'ending position freshness', 'A7 truncation + independent scorer (first, last, every 9th month)', 'off-calendar census'],
    sensitivities: ['EXCLUDE_ALL_ADJUSTED_LEVEL_ABOVE_1E6', 'DATA_EVENTS_MINUS_30_PERCENT', 'ECONOMIC_LAST_OBSERVED_PRICE', 'ECONOMIC_DISTRESS_ZERO'],
    certification: { levels: CERTIFICATION_LEVELS_V4, expectedOracles: EXPECTED_ORACLES_V4, rules: 'completion-v4.mjs certifyV4 (PASS is never CERTIFIED)' },
    performanceRunGate: 'Only after V4 certification CERTIFIED or PARTIALLY_CERTIFIED with the EW control externally passed; only IMPLEMENT_NOW methods; separate performance freeze before measurement; old VU adaptations stay separate (A/B)',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SPEC_PATH, JSON.stringify(calibrationSpecV4(), null, 2) + '\n');
  process.stdout.write('written ' + path.basename(SPEC_PATH) + '\n');
}
