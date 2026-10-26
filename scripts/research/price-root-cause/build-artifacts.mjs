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


const MLABEL = { cross_sectional_momentum: 'Cross-sectional Momentum', '52_week_high_effect': '52-week-high effect', LOW_VOLATILITY: 'Low Volatility', TURTLE_S2_EQUITY_DAILY: 'Turtle Equity Adaptation (S2 daily)', WEINSTEIN_STAGE_DAILY: 'Weinstein Stage Daily Adaptation', KULLAMAGI_DAILY_ADAPTATION: 'Kullamägi Daily Adaptation' };
export const SC = ['A_ORIGINAL', 'B1_A5_TIMING', 'B_VU_BUGS', 'C_INDEPENDENT', 'C2_STRICT', 'C3_STRICT_NORMALIZE_ONLY', 'D_UNRESOLVED_CUT', 'E_WHOLE_SERIES', 'F_V4_FORENSIC_SANITY'];
const SC_DEF = { A_ORIGINAL: 'original V3 construction replayed on the current capture (not the sealed original result)', B1_A5_TIMING: 'A plus causal terminal timing only (V3 runner)',
  B_VU_BUGS: 'confirmed VU accounting fixes A4/A5/A8 (V4 runner, causal terminals; includes the V4 order floor change)', C_INDEPENDENT: 'B plus corrections for events labelled CONFIRMED by any independent channel (lenient, superseded by C2)',
  C2_STRICT: 'B plus corrections only for strictly confirmed events (stated ratio explains the move within 25 %, no SEC share contradiction, no declared split within 200 days): normalise with stated ratio, else cut',
  C3_STRICT_NORMALIZE_ONLY: 'B plus only the normalisations of C2 (no cuts)', D_UNRESOLVED_CUT: 'stress scenario: C plus a cut at every unresolved event (ex-post knowledge, exit price not executable); not a bound',
  E_WHOLE_SERIES: 'B with every quarantined security removed entirely (survivorship-style policy sensitivity)', F_V4_FORENSIC_SANITY: 'B after the V4 forensic price-sanity quarantine' };
const d1 = (a, b) => (K.finite(a) && K.finite(b) ? K.r1(a - b) : null);

/** Writes the twelve artifacts. `extra` = {populationRerun, ranking, review, answers}. */
export function writeArtifacts(b, outDir, extra = {}) {
  const P = extra.populationRerun || b.pop, R = extra.ranking || null, mfp = [...new Set(METHODS.map((m) => b.methods[m]?.sourceDataFingerprint).filter(Boolean))];
  const prov = { ...b.provenance, populationRunId: P?.runId ?? null, rankingRunId: R?.runId ?? null, fingerprints: { population: P?.sourceDataFingerprint ?? null, ranking: R?.sourceDataFingerprint ?? null, methods: mfp },
    allJobsSameCapture: [P?.sourceDataFingerprint, R?.sourceDataFingerprint, ...mfp].filter(Boolean).every((f) => f === b.provenance.captureFingerprint) };
  /* every number in the artifacts compares scenarios of one capture; a run whose jobs saw a drifting store is not comparable */
  if (!prov.allJobsSameCapture && !extra.allowMixedCaptures) throw new Error('JOBS_SAW_DIFFERENT_CAPTURES');
  const head = (schema) => ({ schema, version: '1.0.0', generatedAt: extra.generatedAt || null, provenance: prov, publicContent: 'COUNTS_CORRELATIONS_DELTAS_DIRECTIONS_ONLY', certifying: false });
  const w = (name, obj) => K.writeJson(path.join(outDir, name), obj);
  const hist = { V4_83: { securityMonths: 83, source: '#705 diagnostic run 38724718674' }, V4_74: { securities: 74, source: '#705/#721' }, D2_11: { securities: 11, source: '#722 review R5' },
    V2V3_272: { moves: 272, source: '#737/#758' }, V3_194_UNRESOLVED: { moves: 194, source: '#758 vendor-labelled', reproducibleWithoutVendor: false } };

  w('DATA-ISSUE-UNIFIED-POPULATION.json', { ...head('vu-root-cause-unified-population-1.0.0'), historicalPopulations: hist, denominators: P.denominators,
    frozenInputComparison: { frozen: FROZEN, current: { dataFingerprint: b.provenance.captureFingerprint, securities: P.denominators.tournamentSecurities, bars: P.denominators.tournamentCanonicalBars },
      differences: { securities: P.denominators.tournamentSecurities - FROZEN.securities, bars: P.denominators.tournamentCanonicalBars - FROZEN.bars } },
    populationsByLevel: P.populations, overlapsSegments: P.overlaps, joinedEvents: { distinct: P.eventStats.distinctEvents, bySourceCombination: P.eventStats.bySourceCombination },
    securitiesWithEvents: P.eventStats.securitiesWithEvents, unionOfEventPopulations: P.eventStats.unionOfIssuePopulations, unionOfEventPopulationsDefinition: P.eventStats.unionOfEventPopulationsDefinition ?? '83 + 74 + D2 + 272 + census',
    unionIncludingHoldsAndQuarantines: P.eventStats.unionIncludingHoldsAndQuarantines ?? null, levelNote: 'securityId = ticker-derived identity (core/identity.js); not a permaticker', dedupeKeys: { security: 'securityId', listing: 'segment id tiingo:EX:TICKER:START', company: 'issuer CIK', event: 'segment|date', securityMonth: 'segment|YYYY-MM' },
    reproduction: { v4_83: P.populations.V4_83_SECURITY_MONTHS.securityMonths === 83, v4_74: P.populations.V4_74_HIGH_LEVEL.rows === 74, d2_11: P.populations.D2_DEFECT_SECURITIES.rows === 11, v2_272: P.extreme272.reproducesV3Count, v3_194: 'NOT_REPRODUCIBLE_WITHOUT_SEALED_VENDOR_LABELS' } });

  w('PROVIDER-COMPARISON-MATRIX.json', { ...head('vu-root-cause-provider-matrix-1.0.0'), providers: PROVIDER_FACTS,
    tiingoVsMarketstack: { status: 'NOT_COMPARABLE', reason: 'no overlapping security/listing/day: Marketstack is Europe-only, US venues refused in code, no US Marketstack data stored', liveQueriesMade: 0,
      fields: Object.fromEntries(['rawOpen', 'rawHigh', 'rawLow', 'rawClose', 'adjustedClose', 'adjustedOHLC', 'volume', 'splitFactor', 'splitEffectiveDate', 'dividend', 'currency', 'exchange', 'listingIdentity', 'delistingStatus']
        .map((f) => [f, { tiingo: ['currency', 'exchange', 'listingIdentity', 'delistingStatus'].includes(f) ? 'METADATA_OR_RESEARCH_LISTING_TABLE' : 'PER_BAR', marketstack: 'NO_US_DATA', comparison: 'NOT_POSSIBLE' }])) },
    tiingoInternalLocusAtEventDays: P.eventStats.byProviderLocus, locusMeaning: 'where a defect would sit IF the event is a defect; not evidence that it is one (review IR-01)', tiingoLocusOf272: P.extreme272.byLocus, minimalLiveNeed: { tiingoPermaTickerCheck: 'about one metadata request per event security (~245), within subscription', marketstackUs: 'out of scope (plan/licence decision)' } });

  w('PROVIDER-VS-VU-ROOT-CAUSES.json', { ...head('vu-root-cause-classes-1.0.0'),
    classes: { A_PROVIDER_DEFECT: { lenientEvents: P.populations.TOURNAMENT_CENSUS_CONFIRMED.rows, lenientSecurities: P.populations.TOURNAMENT_CENSUS_CONFIRMED.securityIds,
        strictEvents: b.methods[METHODS[0]]?.census?.byStrictClass?.CONFIRMED_BY_INDEPENDENT_SOURCE ?? null, strictSecurities: b.methods[METHODS[0]]?.census?.strictConfirmedSecurities ?? null,
        note: 'tournament-prefix census events confirmed by an independent channel and absent from both Tiingo columns; strict = ratio match, no SEC contradiction, no nearby declared split. A lower bound under the covered channels only.',
        providerColumnsDisagreeSeparately: { columnsDisagree: P.eventStats.byProviderLocus.PROVIDER_COLUMNS_DISAGREE_ADJ_CONTINUOUS || 0, note: 'separate basis: adjClose continuous while raw jumps without split factor; not added to the confirmed count. Declared split days with continuous adjClose are correct provider behaviour and not counted.' } },
      B_VU_DEFECT: VU_FINDINGS.filter((f) => /BUG/.test(f.classification)).map((f) => f.id), C_SHARED: 'same events as A: provider omission accepted by core 1.0.0 without independent validation (VU-01)',
      D_GENUINE_MOVE: { confirmed: 0, reason: 'no second price provider used; SEC share count unchanged is counter-evidence against a split, not proof of a genuine move' }, E_UNDECIDABLE: { definition: 'UNRESOLVED + INSUFFICIENT_EVIDENCE + CONFLICTING; the impact-relevant majority; cause (provider omission, genuine move, unit error) open' } },
    strictClasses: b.methods[METHODS[0]]?.census?.byStrictClass ?? null, ratioResidual: b.methods[METHODS[0]]?.census?.residualOfStatedRatio ?? null,
    cases83: P.cases83, d2: P.d2, extreme272: P.extreme272, vuFindings: VU_FINDINGS, deterministicExamples: DETERMINISTIC, providerVsVuShare: 'NOT_REPORTED (overlapping causes; A and C are the same events)' });

  w('CORPORATE-ACTION-VERIFICATION.json', { ...head('vu-root-cause-ca-verification-1.0.0'), sources: { secEdgar8K: 'merged inputs of run 39019906367 (70,395 documents)', finraOtcDailyList: 'same merged inputs (OTC scope)', secShareCounts: 'canonical capture fundamentals', secondPriceVendor: 'NOT_USED', xbrlShareCounts: 'via capture fundamentals (shares_outstanding)' },
    censusThresholds: K.CENSUS, independentClassesOfAllEvents: P.eventStats.byIndependentNoVendor, byConfirmationChannel: P.eventStats.byConfirmationChannel ?? null, censusByKindAndChannel: P.eventStats.censusByKindAndChannel ?? null,
    v3HoldsReproduced: P.holds, v3VendorLabelledComparison: { v3: { CONFIRMED_EVENT: 21, BAD_DATA: 4, LEGITIMATE_MOVE: 53, UNRESOLVED: 194 }, thisAuditWithoutVendor: P.extreme272.byIndependentNoVendor } });

  const strictSec = b.methods[METHODS[0]]?.census?.strictConfirmedSecurities ?? null;
  w('SECURITY-AFFECTED-COUNT.json', { ...head('vu-root-cause-security-count-1.0.0'), universe: P.denominators.universe, withAnyIssue: P.eventStats.unionOfIssuePopulations, withEvents: P.eventStats.securitiesWithEvents,
    lenientConfirmedInTournamentPrefix: P.populations.TOURNAMENT_CENSUS_CONFIRMED, strictlyConfirmedSecurities: strictSec, evidenceCoverage: P.eventStats.evidenceCoverage ?? null, confirmedIsLowerBound: 'under covered channels only (CIK, SEC window, FINRA OTC scope)',
    shares: { anyIssue: K.r4(P.eventStats.unionOfIssuePopulations.securityIds / P.denominators.universe.securityIds), strictlyConfirmed: K.finite(strictSec) ? K.r4(strictSec / P.denominators.universe.securityIds) : null, lenientConfirmed: K.r4(P.populations.TOURNAMENT_CENSUS_CONFIRMED.securityIds / P.denominators.universe.securityIds) },
    onlyUnresolvedUpperBound: K.finite(strictSec) ? P.eventStats.unionOfIssuePopulations.securityIds - strictSec : null, byPriorRawPrice: P.eventStats.byPriorRawPrice, byExchange: P.eventStats.byExchange, byYear: P.eventStats.byYear });

  w('PRICE-BAR-AFFECTED-COUNT.json', { ...head('vu-root-cause-bar-count-1.0.0'), denominators: { tournamentCanonicalBars: P.denominators.tournamentCanonicalBars, inMeasurementWindow: P.denominators.tournamentCanonicalBarsInMeasurementWindow, storeBarsTournamentSpan: P.denominators.storeBarsTournamentSpan },
    bars: P.bars, securityMonths: { flagged83: 83, ewSecurityMonthsV4: P.french?.ewSecurityMonths ?? null, note: 'one event counts once as a return day; level-shifted bars are reported separately, not as independent errors' } });

  w('PRODUCT-DATA-LINEAGE.json', { ...head('vu-root-cause-lineage-1.0.0'), layers: LAYERS, products: PRODUCT_LINEAGE, researchVsProductPath: 'tournament reads R2 via tournament/data.mjs (PR branches only); products read .market-cache and published series; exception scripts/supertrader/house/live.mjs', v3ConsumerReadiness: '#758 docs/data-quality/corporate-action-v3/PARTIAL-SERIES-CONSUMER-READINESS-V3.json' });

  const matrix = {}, attribution = {};
  for (const m of METHODS) {
    const x = b.methods[m]; if (!x) { matrix[m] = null; continue; }
    const s = x.scenarios;
    const have = SC.filter((id) => s[id]);
    matrix[m] = { label: MLABEL[m], scenarios: Object.fromEntries(have.map((id) => [id, { cagrVsSpy: s[id].cagrVsSpy, cagrGapToSpyBucket: s[id].cagrGapToSpyBucket ?? null, sharpeVsSpy: s[id].sharpeVsSpy ?? null, deltaVsA: s[id].deltaVsA, deltaVsB: s[id].deltaVsB, deltaVsC2: s[id].deltaVsC2 ?? null, securities: s[id].securities, audit: s[id].audit, tradeExposure: s[id].tradeExposure }])) };
    /* each step from the unrounded comparator the runner published (review IR-06), never from differences of rounded deltas */
    const vs = (id, key) => s[id]?.[key]?.cagrPp ?? null;
    attribution[m] = { label: MLABEL[m], cagrStepsPp: { A5_TIMING_B1_vs_A: vs('B1_A5_TIMING', 'deltaVsA'), VU_ACCOUNTING_B_vs_A: vs('B_VU_BUGS', 'deltaVsA'), VU_ACCOUNTING_B_vs_B1: d1(vs('B_VU_BUGS', 'deltaVsA'), vs('B1_A5_TIMING', 'deltaVsA')),
      STRICT_CORRECTIONS_C2_vs_B: vs('C2_STRICT', 'deltaVsB'), STRICT_NORMALISE_ONLY_C3_vs_B: vs('C3_STRICT_NORMALIZE_ONLY', 'deltaVsB'), LENIENT_CORRECTIONS_C_vs_B: vs('C_INDEPENDENT', 'deltaVsB'),
      UNRESOLVED_STRESS_D_vs_C: vs('D_UNRESOLVED_CUT', 'deltaVsC'), WHOLE_SERIES_POLICY_E_vs_B: vs('E_WHOLE_SERIES', 'deltaVsB'), V4_FORENSIC_SANITY_F_vs_B: vs('F_V4_FORENSIC_SANITY', 'deltaVsB') },
      directTradeExposureA: s.A_ORIGINAL.tradeExposure, interaction: 'steps are pairwise differences, not additive shares. B bundles A4, A5 factor, A8 dust and the V4 order floor; single-fix attribution beyond B1 is not isolated.' };
  }
  const allBelow = METHODS.every((m) => b.methods[m] && SC.every((id) => !b.methods[m].scenarios[id] || b.methods[m].scenarios[id].cagrVsSpy === 'BELOW_SPY'));
  w('BACKTEST-IMPACT-MATRIX.json', { ...head('vu-root-cause-backtest-matrix-1.0.0'), scenarioDefinitions: SC_DEF, verdictDefinition: 'CAGR below SPY total return on capture ' + (b.provenance.captureFingerprint || '').slice(0, 8) + '; no small-cap benchmark used', scenarioANote: 'replay of the original construction on the current capture, not the sealed original result', methods: matrix,
    census: b.methods[METHODS[0]]?.census ?? null, outperformanceQuestion: allBelow ? 'UNDERPERFORMANCE_REMAINS' : 'SEE_METHODS', ranking: R ? R.ranks : 'PENDING_OR_UNAVAILABLE' });
  w('STRATEGY-IMPACT-ATTRIBUTION.json', { ...head('vu-root-cause-attribution-1.0.0'), methods: attribution, isolatedCauses: ['A5 timing', 'VU accounting A4/A5/A8', 'independently confirmed CA corrections', 'unresolved-event sensitivity', 'quarantine/whole-series policy', 'V4 forensic sanity'],
    notIsolated: { identity: 'no identity defect found among the cases (#722); not varied', orderExecution: 'frozen next-open execution unchanged; not varied', universeConstruction: 'covered only through E (whole-series) and the French count ratio' } });
  w('FRENCH-ORACLE-DISCREPANCY.json', { ...head('vu-root-cause-french-1.0.0'), history: { originalEwCorrelation: 0.145, diagnosticWithout83: 0.992, source: '#705 runs 38722939085 / 38724718674' }, reproduced: P.french, interpretation: {
    confirmedCorrectionsOnly: P.french?.ewExclusionVariants?.EXCLUDE_83_INDEPENDENTLY_CONFIRMED_ONLY?.correlation ?? null, unconfirmedExcluded: P.french?.ewExclusionVariants?.EXCLUDE_83_NOT_INDEPENDENTLY_CONFIRMED?.correlation ?? null,
    strictlyConfirmedOnly: P.french?.ewExclusionVariants?.EXCLUDE_83_STRICTLY_CONFIRMED_ONLY?.correlation ?? null, notStrictlyConfirmedExcluded: P.french?.ewExclusionVariants?.EXCLUDE_83_NOT_STRICTLY_CONFIRMED?.correlation ?? null,
    universeDifference: 'VU holds about 1.34x the French firm count; a residual level difference remains in every variant (magnitude sealed, review IR-20)', notACertification: true, noExclusionRuleDerived: true } });
  if (extra.review) w('INDEPENDENT-REVIEW.json', { ...head('vu-root-cause-review-1.0.0'), ...extra.review });
  if (extra.verdict) w('FINAL-EXECUTIVE-VERDICT.json', { ...head('vu-root-cause-verdict-1.0.0'), ...extra.verdict });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = K.args(process.argv.slice(2));
  const b = build(path.resolve(o.run));
  const extra = { generatedAt: o['generated-at'] || null, populationRerun: o['population-run'] ? readJson(path.join(o['population-run'], 'POPULATION.json')) : null,
    ranking: o['ranking-run'] ? readJson(path.join(o['ranking-run'], 'RANKING.json')) : null, review: o.review ? readJson(o.review) : null, verdict: o.verdict ? readJson(o.verdict) : null };
  writeArtifacts(b, path.resolve(o.out), extra);
  process.stdout.write(JSON.stringify({ provenance: b.provenance }) + '\n');
}
export { PR_EVIDENCE, LAYERS, PRODUCT_LINEAGE, PROVIDER_FACTS, VU_FINDINGS, DETERMINISTIC };
