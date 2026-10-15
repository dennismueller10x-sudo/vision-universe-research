/**
 * Supertrader V4 data-fix artifacts (V4-D1 / V4-D2). Builds the six required JSON files from
 *  - the public Quant audit outputs (docs/data-quality/price-integrity/, runs 38766580165 and 38772238376),
 *  - the decrypted private case file of the 1.2.0 audit (sealed in scripts/quant/price-integrity/sealed/; only
 *    counts leave this builder, the plaintext hash binds them),
 *  - the independent review (public part).
 * No calibration, no performance, no strategy measurement. Policy and detection live in quant/engines (canonical
 * core), not in Supertrader code.
 *
 * Usage: node build-data-fix-v4.mjs --private <decrypted json> --review <review-public.json> [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../../../..');
const QDIR = path.join(ROOT, 'docs/data-quality/price-integrity');
const PI = require(path.join(ROOT, 'quant/engines/price-integrity.js'));
const CTR = require(path.join(ROOT, 'quant/engines/canonical-total-return.js'));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const inc = (o, k, n = 1) => ((o[k] = (o[k] || 0) + n), o);
const tally = (rows, f) => rows.reduce((a, r) => inc(a, f(r)), {});

/**
 * Final classification layer (documented, post-run, explanation only - it changes no data): an UNRESOLVED
 * forensic verdict is refined with evidence the core does not have:
 *  - SEC share count falls by ~1/k (+-50 %)                         -> UNDECLARED_REVERSE_SPLIT (SEC-confirmed)
 *  - session volume >= 100x the median and no core signature        -> GENUINE_PRICE_MOVE (heavy-volume squeeze)
 *  - >= 100x overnight (open within 25 % of the close ratio)         -> CURRENCY_OR_UNIT (scale defect)
 */
export function finalCause(c) {
  if (c.rootCause !== 'UNRESOLVED') return c.rootCause;
  const e = c.evidence || {}, k = e.nearestConventionalRatio, sh = e.secSharesRatio, r = e.rawRatio || 1, o = e.openRatio, vd = e.volumeRatioDay;
  if (sh && k && Math.abs(Math.log(sh * k)) <= Math.log(1.5)) return 'UNDECLARED_REVERSE_SPLIT';
  if (vd != null && vd >= 100 && !e.coreSignature) return 'GENUINE_PRICE_MOVE';
  if (r >= 100 && o && Math.abs(Math.log(o / r)) <= Math.log(1.25)) return 'CURRENCY_OR_UNIT';
  return 'UNRESOLVED';
}
const LOCUS = { ...PI.CAUSE_LOCUS, CORPORATE_ACTION_MISMATCH: 'VU_NORMALIZATION' };
const secLabel = (e, k) => { const sh = e?.secSharesRatio; if (!sh || !k) return 'NO_SEC_EVIDENCE'; if (Math.abs(Math.log(sh * k)) <= Math.log(1.5)) return 'SEC_CONFIRMS_SPLIT'; if (Math.abs(Math.log(sh)) <= Math.log(1.25)) return 'SEC_CONTRADICTS_SPLIT'; return 'SEC_INCONCLUSIVE'; };

export function build({ priv, review, plaintextSha }) {
  const pop11 = J(path.join(QDIR, 'run-38766580165-core-1.1.0/QUANT-PRICE-INTEGRITY-POPULATION.json')), reb11 = J(path.join(QDIR, 'run-38766580165-core-1.1.0/QUANT-PRICE-INTEGRITY-REBUILD.json'));
  const pop = J(path.join(QDIR, 'QUANT-PRICE-INTEGRITY-POPULATION.json')), reb = J(path.join(QDIR, 'QUANT-PRICE-INTEGRITY-REBUILD.json')), sealed = J(path.join(QDIR, 'QUANT-PRICE-INTEGRITY-SEALED.json'));
  const P = priv.population, R = priv.rebuild;
  const fate = new Map(R.beforeCaseFate.map((f) => [f.key, f]));
  const cases = P.extremeCases.map((c) => { const f = fate.get(`${c.segmentId}|${c.month}`); const cause = finalCause(c);
    return { in83: c.in83, diagnosticClass: c.diagnosticClass, forensicCause: c.rootCause, cause, confidence: c.confidence, locus: LOCUS[cause] ?? 'UNKNOWN', outcome: (PI.POLICY_BY_CLASS[PI.CAUSE_TO_POLICY[cause]] || {}).outcome ?? 'ACCEPT',
      resolvedBy: f?.resolvedBy ?? 'NONE', stillExtreme: f?.stillExtreme ?? null, providerFactor: c.evidence?.providerFactorStep == null ? 'NO_PROVIDER_COLUMN' : Math.abs(c.evidence.providerFactorStep - 1) <= 0.01 ? 'UNCHANGED' : 'MOVED' }; });
  const c83 = cases.filter((c) => c.in83);
  const meta = { generation: 'V4-DATA-FIX', postHoc: true, canonicalCore: CTR.contractVersions(), priceIntegrity: PI.VERSION, privateEvidence: { plaintextSha256: plaintextSha, sealedPlaintextSha256: sealed.plaintextSha256, bound: plaintextSha === sealed.plaintextSha256, envelopes: sealed.envelopes },
    runs: { preRegistered_1_1_0: { runId: pop11.runId, codeCommit: pop11.codeCommit }, final_1_2_0: { runId: pop.runId, codeCommit: pop.codeCommit } }, performanceCalculated: false, calibrationRun: false };

  const rootCauses = {
    schema: 'supertrader-v4-d1-d2-root-causes-1.0.0', ...meta,
    population: { reproducedExactly: pop.capture.sameCanonicalContentAsV4Freeze, v4Freeze: 'V4-beae51ae1b07768b', canonicalCapture: pop.capture, extremeSecurityMonths: pop.diagnosticReproduction.extremeSecurityMonths, byDiagnosticClass: pop.diagnosticReproduction.outliersByDiagnosticClass },
    V4_D1: {
      definition: 'the 83 security-months of the #705 diagnostic: UNDECLARED_RAW_JUMP_10X (55) + DECLARED_SPLIT_IN_MONTH (28)',
      cases: c83.length, byCause: tally(c83, (c) => c.cause), byLocus: tally(c83, (c) => c.locus), byCauseAndDiagnosticClass: tally(c83, (c) => `${c.diagnosticClass}|${c.cause}`),
      byCauseAndFate: tally(c83, (c) => `${c.cause}|${c.resolvedBy}`), providerAdjustedColumnOnDefectDay: tally(c83.filter((c) => !c.cause.startsWith('GENUINE')), (c) => `${c.cause}|${c.providerFactor}`),
      rootCause: {
        provider: 'Tiingo carried no splitFactor for the reverse split AND its adjustedClose moved with the raw quote (provider factor unchanged on every undeclared-split day): the provider corporate-action feed missed the event',
        vuNormalization: 'canonical-total-return 1.0.0 detected a missing split only through the provider adjusted column (SPLIT_MISSING) or, without that column, through a ratio list up to 20 (SPLIT_SUSPECTED); when the provider column moved with the raw quote, a 10x-5000x overnight jump was accepted as a market move. The V4 price-sanity classifier only examined adjusted levels above 1e6.',
        entryPoint: 'quant/engines/canonical-total-return.js#reconstruct (crossCheck) -> scripts/supertrader/research/tournament/data.mjs#firstCanonicalFailure accepted the series as VALID',
        identityListing: 'no case of the 83 is an identity or listing defect: segments break at gaps > 30 days (data.mjs) before returns are formed; 61 listing-change jumps exist in the daily census and stay outside returns',
      },
      evidenceLabel: 'cause = forensic root cause (quant/engines/price-integrity.js#explainDay on the raw store series) refined by finalCause() (SEC share count, volume) - explanation only',
    },
    V4_D2: {
      definition: 'price plausibility: the 74 securities with a split-adjusted level above 1e6 (#705 census) and the remaining extreme security-months',
      adjustedLevelGt1e6: { securities: pop.adjustedLevelGt1e6.securities, byV4SanityClass: pop.adjustedLevelGt1e6.byV4SanityClass, byCause: pop.adjustedLevelGt1e6.byCause, firstUndeclaredJumpCause: pop.adjustedLevelGt1e6.firstUndeclaredJumpCause,
        legitimate: pop.adjustedLevelGt1e6.byCause.ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS ?? 0, legitimateHighNominal: pop.adjustedLevelGt1e6.byCause.LEGITIMATE_HIGH_NOMINAL_PRICE ?? 0,
        note: 'a split-adjusted level above 1e6 is the arithmetic of consistent, declared serial reverse splits on penny stocks (returns are correct); no blanket price cap' },
      allExtremeSecurityMonths: { cases: cases.length, byCause: tally(cases, (c) => c.cause), byLocus: tally(cases, (c) => c.locus) },
      originalV4D2NotAPriceDefect: '#705 V4-D2 (VU EW population ~1.34x the CRSP size-portfolio population) is a universe-definition finding, not a price defect; it is not changed by this fix and stays open',
    },
  };

  const census = {
    schema: 'supertrader-v4-price-sanity-classification-1.0.0', ...meta,
    adjustedLevelGt1e6: { ...rootCauses.V4_D2.adjustedLevelGt1e6, after: reb.highLevel },
    dailyRawJumpCensus: { scope: 'every session with a raw ratio >= 3 (either direction) without a declared split inside the BEFORE canonical bars', ...pop.dailyRawJumpCensus },
    classes: { GENUINE_PRICE_MOVE: 'market move without data signature (incl. intraday squeezes on >= 100x volume)', UNDECLARED_REVERSE_SPLIT: 'overnight jump at a conventional ratio with split evidence (core signature, exact ratio, SEC share count)', CURRENCY_OR_UNIT: '>= 100x overnight scale change or unit ratio without inverse volume', PROVIDER_SPIKE: 'single reverted bad tick', STALE_PRICE: 'jump after a run of stale quotes', LISTING_CHANGE: 'jump after a gap > 30 days (segment boundary)', DECLARED_SPLIT_INCONSISTENT: 'declared factor does not explain the raw move', DECLARED_SPLIT_DATE_SHIFT: 'declared factor recorded on a neighbouring day', UNDECLARED_FORWARD_SPLIT_POSSIBLE: 'downward overnight move at a split ratio; not separable from a crash without a corporate-action record', UNRESOLVED: 'no explanation; counted' },
    noPriceCap: true,
  };

  const policy = { schema: 'supertrader-v4-corporate-action-policy-1.0.0', ...meta, scope: 'canonical (quant/engines), applies to every consumer of canonical-total-return, not only Supertrader',
    outcomes: ['ACCEPT', 'NORMALIZE', 'QUARANTINE', 'HOLD', 'REJECT'], policy: PI.POLICY, causeToPolicy: PI.CAUSE_TO_POLICY, causeLocus: PI.CAUSE_LOCUS,
    undeclaredSplit: { outcome: 'HOLD', reasonCode: 'SPLIT_SUSPECTED_UNDECLARED', silentCorrection: false, release: 'only by a corporate-action record (provider or exchange) that confirms the event; then the declared factor normalizes the series (CONFIRMED_SPLIT)', detection: CTR.CONFIG.undeclaredSplitRatios && { ratios: CTR.CONFIG.undeclaredSplitRatios, tolerance: CTR.CONFIG.undeclaredSplitTolerance, exact: CTR.CONFIG.undeclaredSplitExact, outOfRange: CTR.CONFIG.undeclaredSplitOutOfRange, volumeActivity: CTR.CONFIG.undeclaredSplitActivity, volumeBase: CTR.CONFIG.undeclaredSplitVolumeBase }, neverFromReturnSizeAlone: true },
    history: [{ version: 'corporate-action-contract-1.1.0', status: 'REJECTED_AFTER_AUDIT', run: pop11.runId, reason: `false-positive check failed: SEC share count contradicts the split for most k = 2/3 holds (${reb11.newHolds.total} holds, ${reb11.newHolds.falsePositiveCandidates} false-positive candidates)` },
      { version: 'corporate-action-contract-1.2.0', status: 'CURRENT_POST_HOC', run: pop.runId, change: 'k >= 5; exact-ratio overnight path; >= 100x overnight with falling volume; tolerances unchanged; no correlation or performance used' }] };

  const holds = R.newHolds.map((h) => { const e = h.evidence || {}, s = e.coreSignature || {}; return { reason: h.reason, path: s.path ?? null, forensic: h.forensicCause, fp: h.falsePositiveCandidate, sec: h.reason === 'SPLIT_SUSPECTED_UNDECLARED' ? secLabel(e, s.conventionalRatio) : 'N/A' }; });
  const regression = { schema: 'supertrader-v4-data-quality-regression-1.0.0', ...meta,
    tests: { file: 'quant/tests/price-integrity.test.mjs', required: ['normal forward split (PI1)', 'normal reverse split (PI2)', 'undeclared reverse split (PI3, PI4, PI22, PI23)', 'conflicting split metadata (PI6)', 'legitimate high nominal price (PI11)', 'missing corporate action (PI5, PI17)', 'ticker/listing transition (PI14)', 'stale bar (PI15)', 'acquisition/delisting (PI16)', 'adjusted/raw consistency (PI13)'], goldenFromRealCases: ['G-D1-EXACT-40X', 'G-D1-EXACT-20X', 'G-D1-VOLUME-60X', 'G-D1-OUT-OF-RANGE-2000X', 'G-FP-SUBPENNY-TICK', 'G-FP-SQUEEZE', 'G-FP-SQUEEZE-2', 'G-KNOWN-FN-10.3X', 'G-KNOWN-FN-152X', 'G-D2-ADJUSTED-LEVEL', 'G-D1-DECLARED-SPLIT-MONTH'] },
    rebuild: { before: { capture: pop.capture, coverage: reb.coverage.before, extremeSecurityMonths: pop.diagnosticReproduction.extremeSecurityMonths, byDiagnosticClass: pop.diagnosticReproduction.outliersByDiagnosticClass },
      after: { capture: reb.capture, coverage: reb.coverage.after, extremeSecurityMonths: reb.extremeSecurityMonths.after, byDiagnosticClass: reb.extremeSecurityMonths.afterByDiagnosticClass },
      sameSourceObjects: reb.capture.sameSourceObjectsAsBefore },
    known83: { resolved: reb.known83.resolvedBy, byFinalCauseAndFate: rootCauses.V4_D1.byCauseAndFate },
    newHolds: { total: reb.newHolds.total, byReason: reb.newHolds.byReason, byPath: tally(holds, (h) => `${h.reason}|${h.path}`), byForensicCause: reb.newHolds.byForensicCause, secShareCountLabel: tally(holds.filter((h) => h.sec !== 'N/A'), (h) => h.sec),
      falsePositiveCandidates: reb.newHolds.falsePositiveCandidates, falsePositiveDefinition: 'forensics cannot show a defect (no split signature with persistence or SEC confirmation, no reverted spike); most are themselves stale or sub-penny garbage quotes, see review' },
    v1_1_0: { newHolds: reb11.newHolds, rejected: true },
    highLevelPreserved: { legitimate: reb.highLevel.legitimateTotal, notNewlyHeld: reb.highLevel.legitimateTotal - (R.highLevelFate.filter((h) => ['ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS', 'LEGITIMATE_HIGH_NOMINAL_PRICE'].includes(h.cause) && h.afterQuarantine && ['SPLIT_SUSPECTED_UNDECLARED', 'PRICE_SPIKE_REVERTED'].includes(h.afterQuarantine.reason)).length) },
    corporateActionConsistency: { undeclaredRawJump10xSecurityMonths: { before: pop.diagnosticReproduction.outliersByDiagnosticClass.UNDECLARED_RAW_JUMP_10X, after: reb.extremeSecurityMonths.afterByDiagnosticClass.UNDECLARED_RAW_JUMP_10X }, securityMonthsAbove1000pct: { before: pop.diagnosticReproduction.extremeSecurityMonths.gt1000pct, after: reb.extremeSecurityMonths.after.gt1000pct }, undeclared10xSessionsInsideCanonicalBarsAfter: reb.corporateActionConsistency.undeclared10xJumpsInsideCanonicalBars.after } };

  const remainingDefects83 = c83.filter((c) => c.stillExtreme && !c.cause.startsWith('GENUINE'));
  const reviewBlocking = (review?.findings ?? []).filter((f) => (['HIGH', 'CRITICAL'].includes(f.severity) || f.blocksCalibration) && f.status !== 'CLOSED');
  const blockers = [
    { id: 'DF-B1', title: 'residual undeclared discontinuities that price-only evidence cannot prove', evidence: `${remainingDefects83.length} of the 83 security-months still carry a data defect after the fix (${JSON.stringify(tally(remainingDefects83, (c) => c.cause))}); ${reb.corporateActionConsistency.undeclaredJumps10x ?? reb.corporateActionConsistency.undeclared10xJumpsInsideCanonicalBars.after} undeclared >= 10x sessions remain inside canonical bars; ${reb.extremeSecurityMonths.afterByDiagnosticClass.UNDECLARED_RAW_JUMP_10X} security-months still classify as UNDECLARED_RAW_JUMP_10X`, remedy: 'an independent corporate-action source in the canonical core (provider split history, exchange notices, or SEC share-count reconciliation as a second evidence path); not obtainable from the bars alone', kind: 'DATA_SOURCE' },
    { id: 'DF-B2', title: 'the fix is not merged; a calibration must run on the merged core with a fresh capture', evidence: 'canonical-total-return-1.2.0 lives on the Draft Quant PR; the AFTER dataset was built in an audit runner by overlay', remedy: 'merge decision by the owner, then a new pre-registered calibration on a capture whose manifest records canonical-total-return-1.2.0', kind: 'PROCESS' },
    { id: 'DF-B3', title: '#705 V4-D2 universe population (~1.34x CRSP) is not a price defect and is unchanged', evidence: 'POST-RESULT-FINDINGS V4-D2 (MAJOR, OPEN)', remedy: 'separate universe-definition work (share class, ADR, OTC/non-NYSE/AMEX/NASDAQ handling) before the EW control can pass', kind: 'UNIVERSE' },
    ...reviewBlocking.map((f) => ({ id: `REVIEW-${f.id}`, severity: f.severity, title: f.area, finding: f.finding, evidence: f.evidence, remedy: f.recommendation,
      kind: f.blocksCalibration ? 'REVIEW_CALIBRATION_BLOCKER' : 'REVIEW_MERGE_BLOCKER', status: 'OPEN_DOCUMENTED_BLOCKER' })),
  ];
  const readiness = { schema: 'supertrader-v4-data-fix-calibration-readiness-1.0.0', ...meta,
    verdict: 'NOT_READY', mayStartNewPreregisteredCalibration: false,
    canonicalDataStatus: { core: CTR.contractVersions(), priceIntegrity: PI.VERSION, d1: 'PARTIALLY_FIXED', d2: 'CLASSIFIED_PRICE_PART_FIXED_UNIVERSE_PART_OPEN', datasetAfterFix: reb.capture, coverageAfterFix: reb.coverage.after, knownResidualDefects: blockers[0].evidence },
    remainingBlockers: blockers,
    exactDataset: { status: 'AUDIT_REBUILD_NOT_A_CALIBRATION_INPUT', dataFingerprint: reb.capture.dataFingerprint, normalizedPartListSha256: reb.capture.normalizedPartListSha256, normalizedManifestSha256: reb.capture.normalizedManifestSha256, normalizedInputsSha256: reb.capture.normalizedInputsSha256, sourceObjectSetSha256: reb.capture.sourceObjectSetSha256, securities: reb.capture.securities, buildRun: reb.runId, buildCommit: reb.codeCommit, pipeline: 'pinned #705 capture (547d604) with quant/engines/canonical-total-return.js 1.2.0 overlaid' },
    note: 'No calibration was started, no strategy measured, no claim produced.' };
  return { rootCauses, census, policy, regression, readiness, review };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const bytes = fs.readFileSync(get('--private')), priv = JSON.parse(bytes), plaintextSha = sha(bytes), review = get('--review') ? J(get('--review')) : null;
  const out = path.resolve(get('--out') ?? HERE);
  const r = build({ priv, review, plaintextSha });
  const w = (f, v) => fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n');
  w('SUPERTRADER-V4-D1-D2-ROOT-CAUSES.json', r.rootCauses);
  w('SUPERTRADER-V4-PRICE-SANITY-CLASSIFICATION.json', r.census);
  w('SUPERTRADER-V4-CORPORATE-ACTION-POLICY.json', r.policy);
  w('SUPERTRADER-V4-DATA-QUALITY-REGRESSION.json', r.regression);
  if (review) w('SUPERTRADER-V4-DATA-FIX-REVIEW.json', { schema: 'supertrader-v4-data-fix-review-1.0.0', ...review });
  w('SUPERTRADER-V4-DATA-FIX-CALIBRATION-READINESS.json', r.readiness);
  process.stdout.write(JSON.stringify({ verdict: r.readiness.verdict, d1: r.rootCauses.V4_D1.byCause, bound: r.rootCauses.privateEvidence.bound }) + '\n');
}
