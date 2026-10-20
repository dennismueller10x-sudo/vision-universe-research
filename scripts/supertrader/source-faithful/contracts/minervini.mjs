/**
 * C06 Mark Minervini SEPA / VCP with manual ranking interface, C07 Power Play family (#709 B12 Trade Like a Stock
 * Market Wizard 2013, Indonesian machine-like translation; B07 Momentum Masters 2015, Indonesian; B03 Think & Trade
 * Like a Champion 2017, Vietnamese). Every Minervini rule in #709 has MEDIUM confidence and unchecked English wording;
 * HARD rules carry clearance REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION. Nothing here is therefore SOURCE_EXACT.
 * SEPA is a multi-stage process with a MANUAL relative priority review (MIN-PROCESS-04); the machine may only screen.
 * No hard fundamental filter (#709: the GAAP EPS 25 % AND gate, fixed VCP counts and a 3R obligation are false hard
 * rules of earlier VU versions and are not repeated).
 */
import { defineContract, EXCLUDE, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/minervini.mjs`;
const T = 'scripts/supertrader/tests/sf-minervini.test.mjs';
const TRANSL = 'B12 is a machine-like translation: the threshold is used as printed in #709, flagged translationUnverified, and the record goes to review; it is not certified source-exact';

const SOURCES = [
  { sourceId: 'B12', edition: 'Trade Like a Stock Market Wizard (2013), Indonesian machine-like translation', role: 'primary content via translation; modal wording not checked against the English edition' },
  { sourceId: 'B07', edition: 'Momentum Masters (2015 original), 2021 Indonesian translation file', role: 'Minervini answers (risk, stops, sizing, IPO)' },
  { sourceId: 'B03', edition: 'Think & Trade Like a Champion, Vietnamese licensed edition (copyright 2017)', role: 'sizing and sell rules' },
];

const tt = (id, psr, rule, extra = {}) => ({ id, kind: 'FILTER', gate: true, psr709: psr, status: 'SOURCE_DERIVED', translationUnverified: true, rule, derivation: TRANSL, code: `${CODE}#trendTemplate`, tests: [`${T}: GC-MIN-TT-${id.split('-').at(-1)}`], ...extra });

const RISK_EXIT_EXCLUSIONS = {
  'MIN-MM-SIZE-02': 'reviewer context', 'MIN-MM-SIZE-03': 'reviewer context (risk range 1.25-2.5 %)', 'MIN-MM-SIZE-04': 'reviewer context (risk 0.75-1.25 %, max 2.5 %)',
  'MIN-MM-EARN-HOLD': 'reviewer (earnings holding)',
  'MIN-TTC-AVGLOSS': 'guide, not a stop rule', 'MIN-TTC-ROTATION': EXCLUDE.optionalVariant, 'MIN-TTC-EARLY': 'reviewer (sell rules)', 'MIN-TTC-TRAIL': 'reviewer (sell rules)', 'MIN-TTC-FREEROLL': EXCLUDE.optionalVariant, 'MIN-TTC-BACKSTOP': 'reviewer (sell rules)', 'MIN-TTC-CONCENTRATION': 'portfolio preference',
};

export const MINERVINI_SEPA = defineContract({
  implemented: true,
  plannedIn: 'PR 6 Minervini',
  strategyId: 'SF_MINERVINI_SEPA_VCP',
  candidateId: 'C06',
  trader: 'Mark Minervini',
  method: 'SEPA: Trend Template qualification and VCP evidence as a machine screen, then manual relative-priority review',
  sources: SOURCES,
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'Trend Template criteria 1-7 (translation-unverified), VCP evidence', MANUAL: 'relative priority, fundamentals and earnings quality, pivot, entry, stop, sizing, sell rules', DATA_BLOCKED: 'IBD RS rating (proprietary), estimates / surprises / guidance history' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'the daily close on which all machine Trend Template criteria hold', earliestExecutable: 'a reviewer decision after the close; never back-filled into history', decisionData: 'daily bars up to the close' },
  entryConditions: ['MIN-SF-PIVOT (manual pivot, price over the pivot with rising volume)'],
  exitConditions: ['MIN-SF-SELL (manual)'],
  stops: ['MIN-SF-STOP (reviewer stop before entry; machine flags a stop more than 10 % below the entry)'],
  positionSizing: ['MIN-SF-SIZE (manual; risk ranges are context, no fixed start exposure)'],
  requiredData: ['daily split-adjusted OHLCV (>= 200 sessions + 1 month)', 'IBD RS rating (not available)', 'PIT quarterly EPS / sales / margins (partial)', 'estimates, surprises, guidance (missing)'],
  manualReviewFlags: [
    { id: 'MIN-MR-PRIORITY', psr709: ['MIN-PROCESS-04', 'MIN-PROCESS-05', 'MIN-PROCESS-06', 'MIN-PROCESS-07', 'MIN-PROCESS-08', 'MIN-PROCESS-09', 'MIN-PROCESS-10', 'MIN-PROCESS-11'], question: 'relative priority of the remaining names (results, surprises, guidance, industry position, peers, catalysts)', blocksAutomation: true },
    { id: 'MIN-MR-QUALITY', psr709: ['MIN-QUALITY-01', 'MIN-QUALITY-02', 'MIN-QUALITY-03', 'MIN-EPS-01', 'MIN-EPS-02'], question: 'earnings quality (core vs one-off), recent and prior quarters; 20-25 % is a common minimum, not a SEPA constant', blocksAutomation: true },
    { id: 'MIN-MR-VCP', psr709: ['MIN-VCP-01', 'MIN-VCP-02', 'MIN-VCP-03', 'MIN-VCP-04', 'MIN-VCP-05'], question: 'is there a valid contraction pattern (counts and halving are typical, not limits; flat bases / boxes allowed)?', blocksAutomation: true },
    { id: 'MIN-MR-RS', psr709: ['MIN-TT-08'], question: 'IBD RS rating >= 70 cannot be computed; the VU RS percentile is shown as a proxy, not as the IBD rating', blocksAutomation: true },
  ],
  knownLimitations: [
    'translation-only source wording: no rule is SOURCE_EXACT',
    'Trend Template criterion 8 (IBD RS >= 70) is DATA_BLOCKED; a VU percentile is not the IBD rating',
    'SEPA selection is manual by design (MIN-PROCESS-04); the full method cannot be measured on history',
  ],
  exclusions: {
    'MIN-TT-03P': 'preference (4-5 months rising MA200) reported as evidence',
    'MIN-TT-07P': 'preference reported as evidence (distance to the 52-week high)',
    'MIN-TT-08P': 'preference (RS in the 80s / 90s), DATA_BLOCKED with MIN-TT-08',
    'MIN-PROCESS-02': 'reviewer context', 'MIN-PROCESS-03': 'reviewer context', 'MIN-PROCESS-12': 'reviewer context', 'MIN-PROCESS-13': 'reviewer context', 'MIN-PROCESS-14': 'reviewer context', 'MIN-PROCESS-16': 'reviewer context',
    'MIN-EPS-03': 'reviewer context', 'MIN-EPS-04': 'reviewer context', 'MIN-EPS-05': 'reviewer context', 'MIN-EPS-06': 'reviewer context', 'MIN-EPS-07': 'reviewer context', 'MIN-EPS-08': 'reviewer context', 'MIN-EPS-09': 'reviewer context', 'MIN-EPS-10': 'reviewer context', 'MIN-EPS-11': 'reviewer context',
    'MIN-QUALITY-04': 'reviewer context', 'MIN-QUALITY-05': 'reviewer context', 'MIN-QUALITY-06': 'reviewer context', 'MIN-QUALITY-07': 'reviewer context', 'MIN-QUALITY-08': 'reviewer context', 'MIN-QUALITY-09': 'reviewer context', 'MIN-QUALITY-10': 'reviewer context',
    'MIN-CODE33-01': 'reviewer context (ideal, preference)', 'MIN-LEAD-01': 'reviewer context', 'MIN-LEAD-02': 'reviewer context', 'MIN-LEAD-03': 'reviewer context',
    'MIN-BASE-02': 'frequency statement, not a limit', 'MIN-BASE-03': 'frequency statement, not a limit', 'MIN-BASE-04': 'footprint reported as evidence',
    'MIN-VCP-06': 'evidence (last contraction volume vs 50-day mean)', 'MIN-VCP-08': 'reviewer context', 'MIN-VCP-09': 'reviewer context', 'MIN-VCP-10': 'evidence (up vs down volume)',
    'MIN-RISK-02': 'exposure management, reviewer', 'MIN-RISK-03': 'exposure management, reviewer', 'MIN-RISK-04': 'exposure management, reviewer', 'MIN-RISK-06': 'sell in strength, reviewer', 'MIN-RISK-07': 'reviewer context', 'MIN-RISK-08': 'reviewer context', 'MIN-RISK-09': 'portfolio preference', 'MIN-RISK-10': 'portfolio preference',
    'MIN-ADD-01': 'reviewer (add only after proof of profit)',
    'MIN-TURN-01': 'separate turnaround family; reviewer', 'MIN-TURN-02': 'separate turnaround family; reviewer', 'MIN-TURN-03': 'separate turnaround family; reviewer',
    'MIN-MM-LIQ-01': 'reviewer (exit liquidity)', 'MIN-MM-PRC-01': 'preference reported as evidence (raw price)', 'MIN-MM-BOT-01': 'reviewer context', 'MIN-MM-FUND-EX': 'reviewer (fundamental exception)',
    'MIN-MM-VOL-EX': EXCLUDE.executionJudgment, 'MIN-MM-VOL-RET': 'reviewer (sell rules)', 'MIN-MM-VOL-NUM': 'evidence (50-day volume mean); +50 % is not his own rule',
    ...RISK_EXIT_EXCLUSIONS,
    'MIN-MM-REEN-01': 'reviewer', 'MIN-MM-REEN-02': 'reviewer', 'MIN-MM-PULL-01': EXCLUDE.optionalVariant, 'MIN-MM-PULL-02': 'reviewer', 'MIN-MM-ADD-02': EXCLUDE.optionalVariant, 'MIN-MM-ADD-03': 'reviewer',
    'MIN-CHEAT-01': EXCLUDE.optionalVariant + ' (cheat / 3C pivot)', 'MIN-CHEAT-02': 'cheat variant', 'MIN-CHEAT-03': 'cheat variant', 'MIN-CHEAT-04': 'cheat variant (uses the Trend Template MA200 rule)',
    'MIN-MM-IPO-01': 'IPO scope: names with less than 200 + 21 sessions are reported as INSUFFICIENT_HISTORY_IPO_SCOPE, not rejected as failing',
  },
  rules: [
    { id: 'MIN-SF-SIMPLE', kind: 'SETUP', essential: false, gate: false, psr709: ['MIN-PROCESS-15'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'prefer simple separate screens; too many AND criteria eliminate good candidates', derivation: 'honoured by design: the machine screen is the Trend Template alone; fundamentals, VCP and RS proxy are evidence, never additional AND gates', code: `${CODE}#sepaScreen`, tests: [`${T}: GC-MIN-SEPA-NO-FUNDAMENTAL-GATE`] },
    { id: 'MIN-SF-PROCESS', kind: 'SETUP', psr709: ['MIN-PROCESS-01'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'the Trend Template is the upstream qualification for SEPA candidates', derivation: TRANSL, code: `${CODE}#sepaScreen`, tests: [`${T}: GC-MIN-SEPA-CANDIDATE`] },
    tt('MIN-SF-TT-1', ['MIN-TT-01'], 'close above MA150 and MA200'),
    tt('MIN-SF-TT-2', ['MIN-TT-02'], 'MA150 above MA200'),
    tt('MIN-SF-TT-3', ['MIN-TT-03'], 'MA200 rising for at least one month', { derivation: TRANSL + '; one month = 21 sessions, MA200 today above MA200 21 sessions ago' }),
    tt('MIN-SF-TT-4', ['MIN-TT-04'], 'MA50 above MA150 and MA200'),
    tt('MIN-SF-TT-5', ['MIN-TT-05'], 'close above MA50'),
    tt('MIN-SF-TT-6', ['MIN-TT-06'], 'close at least 30 % above the 52-week low', { derivation: TRANSL + '; 52 weeks = 252 sessions of daily lows' }),
    tt('MIN-SF-TT-7', ['MIN-TT-07'], 'close at most 25 % below the 52-week high', { derivation: TRANSL + '; 52 weeks = 252 sessions of daily highs' }),
    { id: 'MIN-SF-TT-8', kind: 'FILTER', psr709: ['MIN-TT-08'], status: 'DATA_BLOCKED', rule: 'IBD RS rating at least 70', reason: 'the IBD rating is proprietary and not in the snapshot; a VU cross-sectional percentile is reported as a proxy and never gates (#709: "Ein VU-Perzentil mit ähnlicher Skala ist kein identischer IBD-Rang")', code: `${CODE}#rsProxy`, tests: [`${T}: GC-MIN-RS-PROXY-NOT-GATE`] },
    { id: 'MIN-SF-PRIORITY', kind: 'SETUP', psr709: ['MIN-PROCESS-04', 'MIN-PROCESS-05', 'MIN-PROCESS-06', 'MIN-PROCESS-07', 'MIN-PROCESS-08', 'MIN-PROCESS-09', 'MIN-PROCESS-10', 'MIN-PROCESS-11'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'manual relative-priority review of the remaining names' },
    { id: 'MIN-SF-FUNDAMENTALS', kind: 'FILTER', psr709: ['MIN-EPS-01', 'MIN-EPS-02', 'MIN-QUALITY-01', 'MIN-QUALITY-02', 'MIN-QUALITY-03'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'earnings and sales growth and quality; no fixed percentage gate' },
    { id: 'MIN-SF-VCP', kind: 'SETUP', psr709: ['MIN-VCP-01', 'MIN-VCP-02', 'MIN-VCP-03', 'MIN-VCP-04', 'MIN-VCP-05', 'MIN-BASE-01'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'volatility contraction from left to right in a Stage 2 base; the machine reports the footprint (base length, largest and last correction, range contraction) as evidence', code: `${CODE}#vcpEvidence`, tests: [`${T}: GC-MIN-VCP-EVIDENCE-NOT-GATE`] },
    { id: 'MIN-SF-PIVOT', kind: 'ENTRY', psr709: ['MIN-VCP-07', 'MIN-PRICE-01'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'buy over the pivot with increasing volume; the fundamental thesis needs price confirmation' },
    { id: 'MIN-SF-STOP', kind: 'STOP', psr709: ['MIN-RISK-01', 'MIN-MM-STOP-01', 'MIN-MM-STOP-02', 'MIN-RISK-05'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'loss exit set before the entry, executed regardless of volume, at most 10 % (usually sooner); about 3R almost always to break-even (no absolute 3R obligation); the machine flags a reviewer stop wider than 10 %', code: `${CODE}#stopCheck`, tests: [`${T}: GC-MIN-STOP-10PCT-FLAG`] },
    { id: 'MIN-SF-SIZE', kind: 'SIZING', psr709: ['MIN-TTC-SIZING', 'MIN-MM-SIZE-01'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'size from the accepted equity risk and the stop distance; at most 25 % per position (2015 answer)' },
    { id: 'MIN-SF-SELL', kind: 'EXIT', psr709: ['MIN-MM-SELL-01', 'MIN-MM-SELL-02', 'MIN-MM-SELL-03', 'MIN-MM-SELL-04'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'sell into strength, keep a remainder of early leaders with MA50 as an additional guide; no universal target' },
  ],
});

export const MINERVINI_POWER_PLAY = defineContract({
  implemented: true,
  plannedIn: 'PR 6 Minervini',
  strategyId: 'SF_MINERVINI_POWER_PLAY',
  candidateId: 'C07',
  trader: 'Mark Minervini',
  method: 'Power Play: >= 100 % in under eight weeks starting on strong volume, then a tight consolidation that corrects no more than 20-25 %',
  sources: SOURCES,
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'run-up, correction and tightness measurements (translation-unverified thresholds)', MANUAL: 'strong initial volume, pattern, entry, stop, sizing' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'the daily close on which the measured run-up and consolidation criteria hold', earliestExecutable: 'a reviewer decision after the close', decisionData: 'daily bars up to the close' },
  entryConditions: ['MIN-SF-PP-ENTRY (manual pivot)'],
  exitConditions: ['MIN-SF-PP-EXIT (manual)'],
  stops: ['MIN-SF-PP-STOP (manual, <= 10 % guide flagged)'],
  positionSizing: ['MIN-SF-PP-SIZE (manual)'],
  requiredData: ['daily split-adjusted OHLCV'],
  manualReviewFlags: [
    { id: 'MIN-MR-PP-VOLUME', psr709: ['MIN-PP-02'], question: 'did the run-up begin with strong volume? (the machine reports the volume ratio of the run-up start)', blocksAutomation: true },
    { id: 'MIN-MR-PP-CORR', psr709: ['MIN-PP-04'], question: 'correction between 20 % and 25 %: within the printed 20-25 % range or not?', blocksAutomation: true },
  ],
  knownLimitations: ['all Power Play thresholds are translation-only (REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION); #712 rated the method SOURCE_PARTIAL', 'no minimum consolidation length: 3-6 weeks is typical and twelve days is printed (MIN-PP-03)'],
  exclusions: { ...RISK_EXIT_EXCLUSIONS },
  rules: [
    { id: 'MIN-SF-PP-NOFUND', kind: 'SETUP', essential: false, gate: false, psr709: ['MIN-PP-01'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'a Power Play can be bought without already visible strong earnings and sales', derivation: 'honoured by design: the Power Play screen has no fundamental input', code: `${CODE}#powerPlayScreen`, tests: [`${T}: GC-MIN-PP-CANDIDATE`] },
    { id: 'MIN-SF-PP-DURATION', kind: 'SETUP', essential: false, gate: false, psr709: ['MIN-PP-03'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'consolidation usually 3-6 weeks; breakouts after twelve days are printed', derivation: 'no minimum consolidation length is enforced; the duration is reported as evidence', code: `${CODE}#powerPlayScreen`, tests: [`${T}: GC-MIN-PP-SHORT-CONSOLIDATION`] },
    { id: 'MIN-SF-PP-RUNUP', kind: 'SETUP', gate: true, psr709: ['MIN-PP-02'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'at least +100 % in less than eight weeks', derivation: TRANSL + '; eight weeks = 40 sessions: some close / prior low ratio within fewer than 40 sessions >= 2.0 (lowest low to highest high of the run)', code: `${CODE}#powerPlayScreen`, tests: [`${T}: GC-MIN-PP-CANDIDATE`, `${T}: GC-MIN-PP-SLOW-RUN`] },
    { id: 'MIN-SF-PP-CORRECTION', kind: 'SETUP', gate: true, psr709: ['MIN-PP-04'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'the consolidation corrects no more than 20-25 %', derivation: TRANSL + '; the gate uses the outer bound 25 %; corrections in (20 %, 25 %] are flagged for review (printed range, not a point)', code: `${CODE}#powerPlayScreen`, tests: [`${T}: GC-MIN-PP-DEEP-CORRECTION`, `${T}: GC-MIN-PP-CORRECTION-RANGE-FLAG`] },
    { id: 'MIN-SF-PP-TIGHT', kind: 'SETUP', gate: true, psr709: ['MIN-PP-05'], status: 'SOURCE_DERIVED', translationUnverified: true, rule: 'very tight price action of at most 10 % or VCP characteristics', derivation: TRANSL + '; machine: the whole consolidation (run-up high to the lowest low since) spans <= 10 % -> TIGHT; otherwise VCP_CHARACTERISTICS_REVIEW (the OR branch is a reviewer judgment); no extra window is introduced', code: `${CODE}#powerPlayScreen`, tests: [`${T}: GC-MIN-PP-CANDIDATE`, `${T}: GC-MIN-PP-WIDE-REVIEW`] },
    { id: 'MIN-SF-PP-ENTRY', kind: 'ENTRY', psr709: ['MIN-VCP-07'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'pivot entry decided by the reviewer' },
    { id: 'MIN-SF-PP-STOP', kind: 'STOP', psr709: ['MIN-RISK-01', 'MIN-MM-STOP-01', 'MIN-MM-STOP-02'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'loss exit before entry, at most 10 %', code: `${CODE}#stopCheck`, tests: [`${T}: GC-MIN-STOP-10PCT-FLAG`] },
    { id: 'MIN-SF-PP-SIZE', kind: 'SIZING', psr709: ['MIN-MM-SIZE-01', 'MIN-TTC-SIZING'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'reviewer sizing, at most 25 % per position' },
    { id: 'MIN-SF-PP-EXIT', kind: 'EXIT', psr709: ['MIN-MM-SELL-01'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'reviewer sell rules' },
  ],
});
