/**
 * Builds the V4 Source / Data / Measurement acceptance and the method eligibility from one reviewed table.
 *
 * Source basis, in this order of authority:
 *  1. Repository primary-source contracts (R15 canonical rulebooks with page-cited or own-article sources).
 *  2. The owner's summary of the completed Primary Source Reconstruction (13 books, 4,232 pages, 785 findings,
 *     287 behavioral cases). IMPORTANT: that reconstruction's artifacts (docs/SUPERTRADER_PRIMARY_SOURCE_RECONSTRUCTION.md
 *     and its JSON/CSV) are NOT present on any branch of this repository (checked 2026-10-15, 592 remote heads).
 *     Its conclusions are used as OWNER-ATTESTED findings (ids OSR-*) only; they can downgrade a VU rule but cannot
 *     by themselves make a rule SOURCE_ACCEPTED, because no source id, page or quote is verifiable here.
 *
 * Measurement acceptance is computed from the V4 certification result (pass --calibration <public summary>);
 * without it every method is MEASUREMENT_PENDING_V4_CALIBRATION.
 *
 * Usage: node build-acceptance-v4.mjs [--calibration <SUPERTRADER-V4-CALIBRATION-SUMMARY.json>] [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');

export const OWNER_SUMMARY_FINDINGS = [
  { id: 'OSR-MIN-01', trader: 'Minervini', finding: 'SEPA is a process (Trend Template, extra screens, historical leader profiles, relative prioritisation, manual single-stock review, fundamentals, technical structure, market environment, price/volume, liquidity, catalysts, analyst revisions, earnings/sales surprises), not a VCP detector' },
  { id: 'OSR-MIN-02', trader: 'Minervini', finding: 'no universal GAAP-EPS-25% AND gate; turnarounds are a separate family' },
  { id: 'OSR-MIN-03', trader: 'Minervini', finding: 'Power Play has its own exception characteristics' },
  { id: 'OSR-MIN-04', trader: 'Minervini', finding: 'VCP numbers are typical shapes, not universal hard limits' },
  { id: 'OSR-MIN-05', trader: 'Minervini', finding: '3R is not universally mandatory; start exposure is adaptive, not a fixed 25/50/75/100 ladder' },
  { id: 'OSR-MIN-06', trader: 'Minervini', finding: 'MA50 is contextual, not a blanket full sell; sell into strength is real; price confirmation of the fundamental thesis is central' },
  { id: 'OSR-WEI-01', trader: 'Weinstein', finding: 'not source-faithful: RS>0 as universal buy gate, every MA30 close break as full sell, missing support-based stops, mixing investor and trader paths' },
  { id: 'OSR-WEI-02', trader: 'Weinstein', finding: 'source-faithful: stage analysis, MA30, price/volume structure, RS as context, group strength, separate investor/trader/short paths' },
  { id: 'OSR-DAR-01', trader: 'Darvas', finding: 'later precise box rules, 3-day boundary confirmation, buy stop above the box, stops at box structure' },
  { id: 'OSR-DAR-02', trader: 'Darvas', finding: 'VU gaps: bottom-touch reset, extra VU thresholds, foreign TraderFox rules, foreign risk logic, missing adds' },
  { id: 'OSR-TUR-01', trader: 'Turtles', finding: 'published core highly reproducible; VU is a long-only equity adaptation; missing adds, short skip, correlation limits, full S2, futures architecture' },
  { id: 'OSR-KK-01', trader: 'Kullamagi', finding: 'separate families Common Breakout, Episodic Pivot, Parabolic Short; low-of-day stop must not be replaced by an ADR clamp' },
  { id: 'OSR-ONL-01', trader: "O'Neil", finding: 'only partially source-covered; later IBD teaching must not silently replace original O\'Neil; full CAN SLIM needs new design scope' },
];

// Data categories: ACCEPTED = canonical, PIT-safe history in VU; PARTIAL = exists but not PIT/complete/certified; BLOCKED = absent.
export const DATA_CATEGORIES = {
  price: { status: 'DATA_ACCEPTED', basis: 'canonical daily OHLC (Tiingo active + delisted store), split/dividend total-return core; external calibration in V4' },
  volume: { status: 'DATA_ACCEPTED', basis: 'canonical daily volume (split-adjusted and raw)' },
  intraday: { status: 'DATA_PARTIAL', basis: 'IEX 1-minute bars fetched live per trigger day only (intraday-prefetch.mjs); no historical intraday panel -> historical backtests BLOCKED' },
  fundamentals: { status: 'DATA_PARTIAL', basis: 'SEC EDGAR first-filing EPS/revenue/shares (legacy derivation, partial annual-fact certification); margins, balance sheet, cash flow history missing' },
  estimates: { status: 'DATA_BLOCKED', basis: 'no analyst estimate history' },
  surprises: { status: 'DATA_BLOCKED', basis: 'no consensus, therefore no earnings/sales surprise' },
  guidance: { status: 'DATA_BLOCKED', basis: 'no guidance history' },
  industry: { status: 'DATA_PARTIAL', basis: 'current classification only, not point-in-time' },
  institutional: { status: 'DATA_BLOCKED', basis: 'no 13F/sponsorship panel' },
  float: { status: 'DATA_PARTIAL', basis: 'SEC shares outstanding (not free float), not certified PIT' },
  shortInterest: { status: 'DATA_BLOCKED', basis: 'none' },
  borrow: { status: 'DATA_BLOCKED', basis: 'no locate/borrow fee/hard-to-borrow history' },
  futures: { status: 'DATA_BLOCKED', basis: 'no futures chains, contract values, rolls' },
  options: { status: 'DATA_BLOCKED', basis: 'none' },
  catalystsNews: { status: 'DATA_BLOCKED', basis: 'no point-in-time news/catalyst feed' },
};

// Measurement components and which V4 slice can validate them.
export const MEASUREMENT_COMPONENTS = {
  TR_ARITHMETIC_AND_CORPORATE_ACTIONS: { externalSlice: 'EW_MARKET' },
  TERMINALS_AND_MISSING_BARS: { externalSlice: 'EW_MARKET' },
  CROSS_SECTIONAL_RANKING: { externalSlice: ['MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES'] },
  NEXT_OPEN_EXECUTION_BOOK: { externalSlice: null, internal: 'V4 NEXT_OPEN book reconciliation + R8b + review' },
  STOP_TRIGGER_FILLS_ON_DAILY_BARS: { externalSlice: null, internal: 'method golden cases (fill = max(trigger, open) on the trigger bar)' },
  WEEKLY_AGGREGATION: { externalSlice: null, internal: 'not built in V4' },
  INTRADAY_EXECUTION: { externalSlice: null, internal: null },
  SHORT_BORROW_LEDGER: { externalSlice: null, internal: null },
  FUTURES_ROLL_LEDGER: { externalSlice: null, internal: null },
};

const R15 = 'scripts/supertrader/fidelity/canonical/';
export const METHODS = [
  { id: 'TURTLE_S1_SOURCE', name: 'Turtle System 1', family: 'TURTLE', scope: 'VU_EQUITY_ADAPTATION (long-only translation of the published rules)', originalScope: 'ORIGINAL_FUTURES_REPLICATION',
    source: 'SOURCE_ACCEPTED', sourceBasis: [`${R15}turtle.json TUR-F-* (Original Turtle Trading Rules PDF, page-cited, HIGH)`, 'OSR-TUR-01'],
    sourceNotes: 'Every entry, filter, failsafe, N, unit, add, stop, exit and limit rule has a page-cited primary source. Equity translation choices are declared deviations (TUR-E-*).',
    data: ['price', 'volume'], originalData: ['futures', 'borrow'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'TERMINALS_AND_MISSING_BARS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: false },
  { id: 'TURTLE_S2_SOURCE', name: 'Turtle System 2', family: 'TURTLE', scope: 'VU_EQUITY_ADAPTATION (long-only translation of the published rules)', originalScope: 'ORIGINAL_FUTURES_REPLICATION',
    source: 'SOURCE_ACCEPTED', sourceBasis: [`${R15}turtle.json TUR-F-S2-ENTRY, TUR-F-EXIT-S2 and shared TUR-F-*`, 'OSR-TUR-01'],
    sourceNotes: 'S2 = 55-day breakout, 20-day exit, no filter; shares N/unit/add/stop/limit rules with S1.',
    data: ['price', 'volume'], originalData: ['futures', 'borrow'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'TERMINALS_AND_MISSING_BARS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: false },
  { id: 'DARVAS_LATER_QA', name: 'Darvas later Q&A box rules', family: 'DARVAS', scope: 'BOX_STATE_MACHINE',
    source: 'SOURCE_PARTIAL', sourceBasis: ['OSR-DAR-01', 'OSR-DAR-02', `${R15}darvas.json DAR-C-* (TIME 1959/1960 HIGH; book not read in repo, MEDIUM)`],
    sourceNotes: 'The precise later box rules (3-day confirmation, buy stop above box, box stops) are attested only by the owner summary; the book reconstruction with quotes/pages is not in the repository, so thresholds cannot be traced to a verifiable source id.',
    data: ['price', 'volume'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: false },
  { id: 'WEINSTEIN_STAGE2_INVESTOR', name: 'Weinstein Stage 2 Investor', family: 'WEINSTEIN', scope: 'WEEKLY_STAGE_ANALYSIS_INVESTOR_PATH',
    source: 'SOURCE_MANUAL_REQUIRED', sourceBasis: ['OSR-WEI-01', 'OSR-WEI-02', `${R15}weinstein.json (secondary sources with book quotes; book not read in repo)`],
    sourceNotes: 'Stage identification, resistance, support-based stops and group strength are chart judgments in the source; investor and trader paths differ.',
    data: ['price', 'volume'], manualData: ['industry'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'WEEKLY_AGGREGATION', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: true },
  { id: 'WEINSTEIN_STAGE2_TRADER', name: 'Weinstein Stage 2 Trader', family: 'WEINSTEIN', scope: 'WEEKLY_STAGE_ANALYSIS_TRADER_PATH',
    source: 'SOURCE_MANUAL_REQUIRED', sourceBasis: ['OSR-WEI-01', 'OSR-WEI-02', `${R15}weinstein.json`],
    sourceNotes: 'Trader path (earlier entries, tighter stops) is a separate rule set; same judgment layer.',
    data: ['price', 'volume'], manualData: ['industry'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'WEEKLY_AGGREGATION', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: true },
  { id: 'MINERVINI_SEPA_VCP', name: 'Minervini SEPA / VCP', family: 'MINERVINI', scope: 'MACHINE_SCREEN -> RANKING -> MANUAL/AI REVIEW -> FINAL CANDIDATE',
    source: 'SOURCE_MANUAL_REQUIRED', sourceBasis: ['OSR-MIN-01', 'OSR-MIN-02', 'OSR-MIN-04', 'OSR-MIN-05', 'OSR-MIN-06', `${R15}minervini.json (book notes, interviews; books not read in repo)`],
    sourceNotes: 'Convergence of evidence and relative prioritisation with manual single-stock review; must not be one Boolean gate.',
    data: ['price', 'volume'], manualData: ['fundamentals', 'estimates', 'surprises', 'industry', 'institutional', 'catalystsNews'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: true },
  { id: 'MINERVINI_POWER_PLAY', name: 'Minervini Power Play', family: 'MINERVINI', scope: 'SEPARATE_EXCEPTION_FAMILY',
    source: 'SOURCE_MANUAL_REQUIRED', sourceBasis: ['OSR-MIN-03', `${R15}minervini.json`],
    sourceNotes: 'Own exception characteristics (owner summary); exact thresholds not verifiable in repository; entry needs pivot judgment.',
    data: ['price', 'volume'], manualData: ['catalystsNews'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: true },
  { id: 'KULLAMAGI_COMMON_BREAKOUT', name: 'Kullamägi Common Breakout', family: 'KULLAMAGI', scope: 'SEPARATE_ENGINE',
    source: 'SOURCE_ACCEPTED', sourceBasis: ['OSR-KK-01', `${R15}kullamagi.json BREAKOUT (own article, HIGH)`],
    sourceNotes: 'Scan, prior move, orderly base and stop rules are documented by the trader; entry is the opening-range high on intraday bars and the stop the low of the entry day; base quality is a chart judgment.',
    data: ['price', 'volume'], manualData: ['intraday'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING', 'INTRADAY_EXECUTION'], manual: true },
  { id: 'KULLAMAGI_EPISODIC_PIVOT', name: 'Kullamägi Episodic Pivot', family: 'KULLAMAGI', scope: 'SEPARATE_ENGINE',
    source: 'SOURCE_ACCEPTED', sourceBasis: ['OSR-KK-01', `${R15}kullamagi.json EPISODIC_PIVOT (own article, HIGH)`],
    sourceNotes: 'Catalyst-driven gap with surprise; catalyst quality is a judgment; intraday entry.',
    data: ['price', 'volume', 'intraday', 'surprises', 'catalystsNews', 'estimates'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'INTRADAY_EXECUTION'], manual: true },
  { id: 'KULLAMAGI_PARABOLIC_SHORT', name: 'Kullamägi Parabolic Short', family: 'KULLAMAGI', scope: 'SEPARATE_ENGINE',
    source: 'SOURCE_ACCEPTED', sourceBasis: ['OSR-KK-01', `${R15}kullamagi.json PARABOLIC (own article, HIGH)`],
    sourceNotes: 'Short side with intraday triggers (opening range low, VWAP failure).',
    data: ['price', 'volume', 'intraday', 'borrow', 'shortInterest'], measurement: ['INTRADAY_EXECUTION', 'SHORT_BORROW_LEDGER'], manual: true },
  { id: 'MORALES_KACHER_POCKET_PIVOT', name: 'Morales/Kacher Pocket Pivot', family: 'OWL', scope: 'SIGNAL_DETECTOR_WITH_CONTEXT',
    source: 'SOURCE_PARTIAL', sourceBasis: ['owner summary lists it as an implementation candidate; no rulebook, quote or page in the repository'],
    sourceNotes: 'Volume rule and base/moving-average context must come from the book reconstruction artifact, which is absent.',
    data: ['price', 'volume', 'fundamentals'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS'], manual: true },
  { id: 'MORALES_KACHER_BUYABLE_GAP_UP', name: 'Morales/Kacher Buyable Gap-Up', family: 'OWL', scope: 'SIGNAL_DETECTOR_WITH_CONTEXT',
    source: 'SOURCE_PARTIAL', sourceBasis: ['owner summary lists it as an implementation candidate; no rulebook, quote or page in the repository'],
    sourceNotes: 'Gap/volume thresholds and catalyst context are not verifiable in the repository.',
    data: ['price', 'volume', 'catalystsNews'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: true },
  { id: 'RASCHKE_HOLY_GRAIL', name: 'Raschke Holy Grail', family: 'RASCHKE', scope: 'SHORT_TERM_PULLBACK_SETUP',
    source: 'SOURCE_PARTIAL', sourceBasis: ['owner summary lists it as an implementation candidate; no rulebook, quote or page in the repository; not covered by the owner fidelity summary'],
    sourceNotes: 'Indicator thresholds would be source-less magic numbers without the reconstruction artifact.',
    data: ['price', 'volume'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], manual: false },
  { id: 'ONEIL_CAN_SLIM', name: "O'Neil CAN SLIM", family: 'ONEIL', scope: 'OUT_OF_MAIN_SCOPE (rule 29)',
    source: 'SOURCE_PARTIAL', sourceBasis: ['OSR-ONL-01'], sourceNotes: 'Original O\'Neil only partially covered; later IBD teaching must not replace it.',
    data: ['price', 'volume', 'fundamentals', 'estimates', 'institutional', 'industry'], measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING'], manual: true },
];

export const OLD_VU_ENGINES = [
  { id: 'DONCHIAN_TURTLE 2.0.2 / TURTLE_S2_EQUITY_DAILY', r15Fidelity: 'LOW', sourceFaithful: false, why: 'no adds, alphabetical instead of strength ranking, VU lifecycle (3 % proximity, 10-session expiry, 5-session cooldown) suppresses original signals, S1 filter ignores short breakouts, no unit heat, no notional account', repair: 'REBUILD_AS_SEPARATE_SOURCE_ENGINE (TURTLE_S1_SOURCE / TURTLE_S2_SOURCE); old engine kept as VU adaptation for A/B' },
  { id: 'DARVAS_BOX 3.0.2', r15Fidelity: 'LOW', sourceFaithful: false, why: 'VU/TraderFox numbers, momentum percentile gate, market light, foreign risk logic, bottom-touch reset, no adds (OSR-DAR-02)', repair: 'REBUILD_BOX_STATE_MACHINE_WHEN_SOURCE_ARTIFACT_AVAILABLE; local correction of thresholds is not possible without source ids' },
  { id: 'WEINSTEIN_STAGES 4.0.0 / WEINSTEIN_STAGE_DAILY', r15Fidelity: 'LOW', sourceFaithful: false, why: 'RS>0 universal gate, MA30 close break as full sell, no support stops, investor/trader mixed (OSR-WEI-01), foreign sizing', repair: 'REBUILD_AS_THREE_PATHS (investor, trader, stage-4 short) WITH MANUAL STAGE REVIEW' },
  { id: 'MINERVINI_VCP 2.0.0', r15Fidelity: 'LOW', sourceFaithful: false, why: 'Trend Template + VU VCP as Boolean gate; universal EPS hard filters too strict; no SEPA review, no sell into strength (OSR-MIN-01..06)', repair: 'LOCAL_CORRECTION_POSSIBLE for the machine screen (remove universal hard gates, keep Trend Template as screen) + NEW MANUAL REVIEW LAYER' },
  { id: 'MOMENTUM_BREAKOUT 3.2.0 / KULLAMAGI_DAILY_ADAPTATION', r15Fidelity: 'MEDIUM', sourceFaithful: false, why: 'breakout core close to source but daily-bar entry and ADR clamp replace opening-range high and low-of-day stop (OSR-KK-01); EP and parabolic short missing', repair: 'LOCAL_CORRECTION for the daily screen; source-faithful entry needs intraday data; EP and PS are new engines' },
  { id: 'CAN_SLIM', r15Fidelity: 'NOT_AUDITED_R15', sourceFaithful: false, why: 'original coverage partial (OSR-ONL-01)', repair: 'NEW_DESIGN_SCOPE' },
  { id: 'VU_TREND_52W 1.0.0', r15Fidelity: 'MEDIUM', sourceFaithful: null, why: 'VU-native, not a trader method', repair: 'NONE (VU method, not measured against a trader source)' },
];

/** Pre-registered eligibility rule (rule 21). */
export const ELIGIBILITY_RULE = {
  IMPLEMENT_NOW: 'SOURCE_ACCEPTED and every required data category DATA_ACCEPTED for the declared scope and MEASUREMENT_ACCEPTED, or MEASUREMENT_PARTIAL where the external base (TR arithmetic/corporate actions via EW) passed and every non-external component has deterministic golden tests; and no manual layer',
  MANUAL_LAYER_REQUIRED: 'source requires discretion (SOURCE_MANUAL_REQUIRED or manual elements); machine screen may produce candidates, never BUY',
  DATA_BLOCKED: 'a required data category is DATA_BLOCKED for the source-faithful scope',
  RESEARCH_ONLY: 'source partial (not traceable to verifiable source ids) or measurement blocked',
  EDUCATIONAL_ONLY: 'not reproducible and not a candidate for systematic research',
  claimReady: 'requires MEASUREMENT_ACCEPTED (every component externally validated), adequate PIT, robust benchmark and no unresolved HIGH finding',
};

function dataStatus(m) {
  const rows = m.data.map((k) => ({ category: k, ...DATA_CATEGORIES[k] }));
  const manualRows = (m.manualData ?? []).map((k) => ({ category: k, ...DATA_CATEGORIES[k], layer: 'MANUAL_REVIEW_ONLY' }));
  const worst = rows.some((r) => r.status === 'DATA_BLOCKED') ? 'DATA_BLOCKED' : rows.some((r) => r.status === 'DATA_PARTIAL') ? 'DATA_PARTIAL' : 'DATA_ACCEPTED';
  return { status: worst, categories: rows, manualLayerCategories: manualRows, historicalManualLayerBacktest: manualRows.some((r) => r.status !== 'DATA_ACCEPTED') ? 'DATA_BLOCKED_OR_PARTIAL' : 'AVAILABLE', originalScope: m.originalData ? { scope: m.originalScope, status: 'DATA_BLOCKED', missing: m.originalData } : null };
}

export function measurementStatus(m, cert) {
  if (!cert) return { status: 'MEASUREMENT_PENDING_V4_CALIBRATION', components: m.measurement };
  const ext = new Set(cert.externallyValidatedSlices ?? []);
  const rows = m.measurement.map((c) => {
    const def = MEASUREMENT_COMPONENTS[c], slices = [def.externalSlice].flat().filter(Boolean);
    if (slices.length && slices.some((s) => ext.has(s))) return { component: c, status: 'EXTERNALLY_VALIDATED' };
    if (def.internal) return { component: c, status: 'INTERNAL_ONLY', basis: def.internal };
    return { component: c, status: 'NO_MEASUREMENT_PATH' };
  });
  const baseOk = ext.has('EW_MARKET') && cert.level !== 'NOT_CERTIFIED';
  const status = rows.some((r) => r.status === 'NO_MEASUREMENT_PATH') || !baseOk ? 'MEASUREMENT_BLOCKED'
    : rows.every((r) => r.status === 'EXTERNALLY_VALIDATED') ? 'MEASUREMENT_ACCEPTED' : 'MEASUREMENT_PARTIAL';
  return { status, components: rows, certificationLevel: cert.level };
}

export function eligibility(m, src, data, meas) {
  if (src === 'EDUCATIONAL_ONLY') return { status: 'EDUCATIONAL_ONLY' };
  if (src === 'SOURCE_PARTIAL' || src === 'SOURCE_BLOCKED') return { status: 'RESEARCH_ONLY', reason: 'SOURCE_NOT_TRACEABLE_TO_VERIFIABLE_SOURCE_IDS' };
  if (data.status === 'DATA_BLOCKED') return { status: 'DATA_BLOCKED', manualReview: m.manual };
  if (src === 'SOURCE_MANUAL_REQUIRED' || m.manual) return { status: 'MANUAL_LAYER_REQUIRED', machineScreenAllowed: true, buyDeclarationAllowed: false, manualLayerData: (m.manualData ?? []).map((k) => ({ category: k, ...DATA_CATEGORIES[k] })) };
  if (meas.status === 'MEASUREMENT_PENDING_V4_CALIBRATION') return { status: 'PENDING_V4_CALIBRATION' };
  if (meas.status === 'MEASUREMENT_BLOCKED') return { status: 'RESEARCH_ONLY', reason: 'MEASUREMENT_BLOCKED' };
  return { status: 'IMPLEMENT_NOW', claimReady: false, claimReadyRequires: ELIGIBILITY_RULE.claimReady };
}

export function buildAcceptance({ calibration = null } = {}) {
  const cert = calibration?.certification ?? null;
  const rows = METHODS.map((m) => { const data = dataStatus(m), meas = measurementStatus(m, cert); return { m, data, meas, elig: eligibility(m, m.source, data, meas) }; });
  const meta = { generation: 'V4', postHoc: true, createdFor: 'research/supertrader-source-measurement-acceptance-v4', primarySourceReconstructionArtifact: 'NOT_IN_REPOSITORY_OWNER_ATTESTED_SUMMARY_ONLY' };
  return {
    source: { schema: 'supertrader-v4-source-acceptance-1.0.0', ...meta, ownerSummaryFindings: OWNER_SUMMARY_FINDINGS, methods: rows.map(({ m }) => ({ id: m.id, name: m.name, family: m.family, scope: m.scope, verdict: m.source, sourceBasis: m.sourceBasis, notes: m.sourceNotes, manualLayer: m.manual })), oldVuEngines: OLD_VU_ENGINES },
    data: { schema: 'supertrader-v4-data-acceptance-1.0.0', ...meta, categories: DATA_CATEGORIES, methods: rows.map(({ m, data }) => ({ id: m.id, verdict: data.status, categories: data.categories, manualLayerCategories: data.manualLayerCategories, historicalManualLayerBacktest: data.historicalManualLayerBacktest, originalScope: data.originalScope })) },
    measurement: { schema: 'supertrader-v4-measurement-acceptance-1.0.0', ...meta, calibrationSummary: calibration ? { freezeId: calibration.freezeId, runId: calibration.runId, level: cert.level } : null, components: MEASUREMENT_COMPONENTS, methods: rows.map(({ m, meas }) => ({ id: m.id, verdict: meas.status, components: meas.components })) },
    eligibility: { schema: 'supertrader-v4-method-eligibility-1.0.0', ...meta, rule: ELIGIBILITY_RULE, methods: rows.map(({ m, data, meas, elig }) => ({ id: m.id, source: m.source, data: data.status, measurement: meas.status, eligibility: elig.status, ...elig })) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const calibration = get('--calibration') ? JSON.parse(fs.readFileSync(get('--calibration'), 'utf8')) : null;
  const out = get('--out') ? path.resolve(get('--out')) : OUT;
  const r = buildAcceptance({ calibration });
  const write = (name, v) => fs.writeFileSync(path.join(out, name), JSON.stringify(v, null, 2) + '\n');
  write('SUPERTRADER-V4-SOURCE-ACCEPTANCE.json', r.source);
  write('SUPERTRADER-V4-DATA-ACCEPTANCE.json', r.data);
  write('SUPERTRADER-V4-MEASUREMENT-ACCEPTANCE.json', r.measurement);
  write('SUPERTRADER-V4-METHOD-ELIGIBILITY.json', r.eligibility);
  process.stdout.write(JSON.stringify(r.eligibility.methods.map((x) => [x.id, x.eligibility])) + '\n');
}
