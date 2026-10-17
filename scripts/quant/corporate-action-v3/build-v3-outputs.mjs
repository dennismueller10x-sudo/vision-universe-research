#!/usr/bin/env node
/**
 * Builds the protocol 3.0.0 output files from the PUBLIC counts of the audit runs (no private data): source manifest, PIT
 * validation, blinded control set, course-only holds, downward jumps, D2 regression, extreme-move classification and the
 * calibration readiness. The consumer readiness and the adversarial review are written by hand and only read here.
 *
 * Usage: node build-v3-outputs.mjs --final-run <run dir> --label-request-run <run dir> --first-run <run dir> [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..');
const DIR = path.join(ROOT, 'docs/data-quality/corporate-action-v3');
const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const OUT = args.out || DIR;
const runDir = (d) => path.isAbsolute(d) ? d : path.join(ROOT, d);
const fin = runDir(args['final-run']), first = runDir(args['first-run']), req = runDir(args['label-request-run']);
const A = J(path.join(fin, 'CORPORATE-ACTION-V3-AUDIT.json')), SEL = J(path.join(fin, 'CORPORATE-ACTION-V3-SELECT.json')), PREP = J(path.join(fin, 'CORPORATE-ACTION-V3-PREPARE.json'));
const A1 = J(path.join(first, 'CORPORATE-ACTION-V3-AUDIT.json'));
const PROTOCOL = J(path.join(DIR, 'CORPORATE-ACTION-PROTOCOL-V3.json')), STATIC = J(path.join(DIR, 'source-manifest-static.json'));
const REVIEW = J(path.join(DIR, 'CORPORATE-ACTION-V3-ADVERSARIAL-REVIEW.json')), CONSUMER = J(path.join(DIR, 'PARTIAL-SERIES-CONSUMER-READINESS-V3.json'));
const PRE = J(path.join(DIR, 'VERDICT-PRECOMMIT.json'));
const acc = A.acceptance;
const meta = { protocol: PROTOCOL.version, protocolSha256: A.protocolSha256, finalRun: A.runId, finalCodeCommit: A.codeCommit, versions: A.versions,
  runs: { first: A1.runId, labelRequest: path.basename(req).replace('run-', ''), final: A.runId }, vendorMode: A.vendorMode, performanceCalculated: false, calibrationRun: false };
const write = (name, body) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify({ schema: name.replace(/\.json$/, '').toLowerCase() + '-1.0.0', ...meta, ...body }, null, 2) + '\n'); console.log('wrote', name); };
const share = (k, n) => (n ? Math.round((k / n) * 1e4) / 1e4 : null);

/* 1 source manifest */
const ve = A.sources.vendor;
write('CORPORATE-ACTION-SOURCE-MANIFEST-V3.json', {
  principle: 'A corporate action normalizes a canonical series only with an independent, dated, effective statement (SEC 8-K/6-K or FINRA Daily List) that the price shows, plus a second confirmation independent of the triggering statement. Price alone never repairs (HOLD). Validation-only sources never enter the core.',
  priorityOrderRequested: STATIC.priorityOrderRequested,
  sources: STATIC.sources.map((s) => {
    const m = s.id === 'SEC_EDGAR_CURRENT_REPORTS' ? { collection: A.sources.sec.stats, ciksWithEvents: A.sources.sec.ciksWithEvents, segmentsWithIssuerCik: PREP.universe.withIssuerCik, segments: PREP.universe.segments, sha256: A.sources.sec.sha256 }
      : s.id === 'FINRA_OTC_DAILY_LIST' ? { collection: A.sources.finra.stats, rows: A.sources.finra.observations, splitRowsWithoutParsableRatio: acc.secondSourceIntegrated.value.finraRatioParseFailures,
        joinedToUniverse: A.impact.finra, segments: PREP.universe.segments, segmentsWithAnyFinraRow: A.impact.finra.segmentsWithObservations, segmentShare: share(A.impact.finra.segmentsWithObservations, PREP.universe.segments), sha256: A.sources.finra.sha256 }
      : s.id === 'SECOND_VENDOR_YAHOO_CHART' ? { collection: ve, identityOfSegments: SEL.vendorIdentity, inRunnerAttempt: { run: A1.runId, result: A1.sources.vendor.stats } }
      : s.id === 'EDGAR_SUBMISSIONS_ACCEPTANCE_TIME' ? { collection: A.sources.edgarAcceptance } : {};
    return { ...s, measured: m };
  }),
  consideredNotIntegrated: STATIC.consideredNotIntegrated,
  independence: {
    labelSourceNotValidationSource: PROTOCOL.labels.labelSourceExclusion,
    labelChannelsBlankedPerDecision: A.labelChannelsExcluded,
    note: 'FINRA is a core input, so FINRA- and share-count-based events are reported but do not gate the false-negative rate; the second vendor is the engine-independent source.'
  }
});

/* 2 PIT */
write('INDEPENDENT-PIT-VALIDATION-V3.json', {
  method: PROTOCOL.pitOracle.method, independence: PROTOCOL.pitOracle.independence, sample: { seed: PROTOCOL.pitOracle.seed, maxSegments: PROTOCOL.pitOracle.maxSegments, segmentsChecked: A.pit.segmentsChecked, viewsCompared: A.pit.viewsCompared },
  engineVsTruncationOracle: { mismatchKinds: A.pit.mismatchKinds, barsAfterAsOf: A.pit.barsAfterAsOf, role: 'consistency check (review P3-06)' },
  observedAt: { checked: A.pit.observedAtChecked, tooEarly: A.pit.observedAtTooEarly, late: A.pit.observedAtLate, skippedNotABarDate: A.pit.observedAtSkipped, revisionsAfterObserved: A.pit.revisionsAfterObserved, basis: A.pit.observedAtBasis, lagSessions: A.pit.lagSessions },
  edgarAcceptance: { universe: { observations: A.pit.timestamps.secObservations, withAcceptance: A.pit.timestamps.withAcceptance, filedBeforeAcceptanceDay: A.pit.timestamps.filedBeforeAcceptance, lagDaysFiledMinusAccepted: A.pit.timestamps.lagDays },
    decisionObservations: A.pit.timestamps.decisionObservations },
  labelSourceVsValidationSource: { label: 'SEC EFTS file_date (visibleAt) and FINRA dailyListDatetime', validation: 'truncation outside the engine; EDGAR submissions acceptanceDateTime (different SEC system); FINRA: single timestamp, truncation only' },
  acceptance: { pitViolations: acc.pitViolations, pitTimestampCoverage: acc.pitTimestampCoverage },
  verdict: acc.pitViolations.pass && acc.pitTimestampCoverage.pass ? 'PASS' : 'FAIL',
  finding: A.pit.timestamps.filedBeforeAcceptance ? `${A.pit.timestamps.filedBeforeAcceptance} SEC observations carry an EFTS filing date before their EDGAR acceptance day (US/Eastern). None is behind a decision, but an as-of view on the acceptance day could see them: the evidence model must take visibleAt = max(filing date, acceptance day) - a rule change for the next protocol, not applied here.` : null
});

/* 3 blinded control */
write('BLINDED-CONTROL-SET-V3.json', {
  design: PROTOCOL.blindedControlSet, selection: { commitment: { membersSha256: SEL.membersSha256, independentEventsSha256: SEL.independentEventsSha256, writtenBefore: 'stage evaluate' },
    inSampleExcluded: SEL.inSampleExcluded, v2ControlMembersExcluded: SEL.v2ControlMembersExcluded, eligible: SEL.eligible, coreFlaggedStratum: SEL.coreFlaggedStratum, distinctMembers: SEL.distinctMembers, categories: SEL.categories, vendorIdentity: SEL.vendorIdentity, independentEvents: SEL.independentEvents },
  results: A.blindedControl,
  acceptance: { blindedFalsePositiveRatePooled: acc.blindedFalsePositiveRatePooled, blindedFalsePositiveRatePerCategory: acc.blindedFalsePositiveRatePerCategory, blindedInterventionFalseShare: acc.blindedInterventionFalseShare,
    blindedFalseNegativeRate: acc.blindedFalseNegativeRate, blindedLabelableShare: acc.blindedLabelableShare },
  knownV4CasesUse: 'excluded from the set; regression only (D2-REGRESSION-V3.json)'
});

/* 4 course-only holds */
write('COURSE-ONLY-HOLD-VALIDATION-V3.json', {
  definition: PROTOCOL.labels.courseOnlyHold, falsePositives: A.courseOnlyHolds, allCorporateActionHolds: A.allCaHolds, coreDataContractHoldsNotLabelled: A.coreDataContractHolds,
  falseNegatives: { gatePopulation: A.falseNegatives.gatePopulation, courseOnly: A.falseNegatives.courseOnly, courseOnlyDownward: A.falseNegatives.courseOnlyDownward, universe: A.falseNegatives.universe, sourceDependent: A.falseNegatives.sourceDependent, bySource: A.falseNegatives.bySource },
  resumedBarsByBreakLabel: A.resumedBarsByBreakLabel,
  noPostHocRule: 'no hold rule was changed after any result; the rules are those of the pre-registered protocol (P3 changes were made before the first run)',
  acceptance: { courseOnlyHoldFalseShare: acc.courseOnlyHoldFalseShare, courseOnlyFalseNegativeRate: acc.courseOnlyFalseNegativeRate, falseNegativeRateUniverse: acc.falseNegativeRateUniverse, normalizeFalseShare: acc.normalizeFalseShare },
  normalizations: A.normalizations, invalidRanges: A.invalidRanges
});

/* 5 downward jumps */
write('DOWNWARD-JUMP-VALIDATION-V3.json', {
  semantics: { engine: 'quant/engines/discontinuity-semantics.js', causes: ['FORWARD_SPLIT', 'SPECIAL_DISTRIBUTION', 'CURRENCY_OR_UNIT', 'LISTING_CHANGE', 'BAD_TICK', 'DATA_STALENESS', 'GENUINE_MOVE', 'UNRESOLVED'],
    channels: 'event-day share and dollar volume against the prior 20-bar median, persistence of the share-volume scaling over the next 10 sessions, reversion within 2 sessions, stale run before, calendar gap, FINRA listing events, provider dividend; no return threshold decides a cause (3:1 only selects candidates, 10:1 only decides whether an unexplained candidate is held)' },
  census: A.downward, upwardForComparison: A.upward,
  falseNegatives: { downward: A.falseNegatives.downward, courseOnlyDownward: A.falseNegatives.courseOnlyDownward },
  acceptance: { downwardFalseNegativeRate: acc.downwardFalseNegativeRate, downwardHoldFalseShare: acc.downwardHoldFalseShare }
});

/* 6 D2 regression */
write('D2-REGRESSION-V3.json', {
  use: 'REGRESSION ONLY: the 11 D2 defects (#721/#722 forensic cause on the 74 adjusted-level > 1e6 securities, not quarantined by canonical-total-return-1.2.0) are recomputed in the runner from the same code (price-integrity.js#explainHighLevel); no v3 rule, threshold or ratio was set from them',
  d2: A.d2, known83: A.known83,
  acceptance: { knownD2ValidRangeDefects: acc.knownD2ValidRangeDefects },
  diagnosis: 'see CANONICAL_CORPORATE_ACTION_PROTOCOL_V3.md section 6 (counts only; per-case rows sealed)'
});

/* 7 extreme movements */
write('EXTREME-MOVEMENT-CLASSIFICATION-V3.json', {
  population: 'the v2 >= 10x overnight moves without provider event inside the v2 valid range, neither normalized nor held (recomputed with the v2 engine on the same capture)',
  classes: { CONFIRMED_EVENT: PROTOCOL.labels.event, BAD_DATA: PROTOCOL.labels.badData, LEGITIMATE_MOVE: PROTOCOL.labels.genuine, UNRESOLVED: 'none of these' },
  newIndependentEvidence: ['second vendor (engine-independent)', 'FINRA OTC Daily List', 'SEC share counts'],
  result: A.extremeV2Unresolved,
  extremeInsideValidV3: { total: A.impact.severe.extremeInsideValid, contradictedByIndependentEvidence: A.impact.severe.extremeInsideValidWrong, unexplained: A.impact.severe.extremeInsideValidUnresolved },
  semanticExtremeByCause: A.impact.semanticExtremeByCause,
  noRuleFromDistribution: 'no rule was derived from this distribution; the v3 rules were fixed before the first run',
  acceptance: { severeExtremeInsideValidWrong: acc.severeExtremeInsideValidWrong, severeExtremeInsideValidUnresolvedShare: acc.severeExtremeInsideValidUnresolvedShare }
});

/* 8 readiness */
const reviewOpen = (REVIEW.openHighCritical || []);
const failed = Object.entries(acc).filter(([k, v]) => k !== 'pass' && v.pass !== true).map(([k, v]) => ({ criterion: k, value: v.value ?? null, threshold: v.threshold ?? null }));
const ready = acc.pass === true && reviewOpen.length === 0;
write('SUPERTRADER-CORPORATE-ACTION-V3-CALIBRATION-READINESS.json', {
  verdict: ready ? 'READY_FOR_PREREGISTERED_CALIBRATION' : 'NOT_READY',
  verdictPrecommitted: { file: 'docs/data-quality/corporate-action-v3/VERDICT-PRECOMMIT.json', verdict: PRE.verdict, sha256: sha(path.join(DIR, 'VERDICT-PRECOMMIT.json')) },
  readyConditions: {
    pitIndependentlyValidated: acc.pitViolations.pass && acc.pitTimestampCoverage.pass,
    fpFnIndependentlyMeasured: [acc.blindedFalsePositiveRatePooled, acc.blindedFalseNegativeRate, acc.courseOnlyHoldFalseShare, acc.courseOnlyFalseNegativeRate, acc.falseNegativeRateUniverse].every((x) => x.pass),
    downwardJumpsCovered: acc.downwardFalseNegativeRate.pass && acc.downwardHoldFalseShare.pass,
    d2DefectsOutOfValidRange: acc.knownD2ValidRangeDefects.pass,
    secondIndependentSourceIntegrated: acc.secondSourceIntegrated.pass,
    noHighCriticalOpen: reviewOpen.length === 0
  },
  acceptance: acc, failedCriteria: failed, openHighCritical: reviewOpen,
  consumerReadiness: CONSUMER.summary,
  mayStartPreregisteredCalibration: ready,
  noCalibrationNoPerformance: true
});
