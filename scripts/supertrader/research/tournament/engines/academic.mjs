/** Isolated tournament research. Targets are formation instructions, never executions. */
const DAY = 86_400_000;
const finitePositive = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function monthsBefore(date, months) {
  const input = new Date(`${date}T00:00:00Z`);
  const end = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth() - months + 1, 0));
  // Formation uses monthly return boundaries, even when asOf is a Friday before calendar month-end.
  if (months === 0) return date;
  return end.toISOString().slice(0, 10);
}
const ageDays = (a, b) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
function anchor(bars, cutoff) { return bars.findLast((b) => b.date <= cutoff); }
function fail(code, detail) { return { code, detail }; }
function prepare(security, asOf) {
  if (!security || typeof security.id !== 'string' || !security.id || typeof security.ticker !== 'string') return fail('INVALID_IDENTITY', 'Stable id and ticker required.');
  if (!Array.isArray(security.bars)) return fail('MISSING_BARS', 'Historical bars required.');
  if (security.bars.some((b) => !b || !validDate(b.date))) return fail('INVALID_BAR_DATE', 'Bar dates must be valid ISO calendar dates.');
  const bars = security.bars.filter((b) => b.date <= asOf).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (bars.some((b, i) => i && b.date === bars[i - 1].date)) return fail('DUPLICATE_BAR_DATE', 'Multiple observations on the same date are ambiguous.');
  if (!bars.length) return fail('NO_ASOF_HISTORY', 'No bar available on or before asOf.');
  if (ageDays(asOf, bars.at(-1).date) > 7) return fail('STALE_HISTORY', 'Last observation exceeds the declared 7-calendar-day data guard.');
  return { bars };
}
function momentum(security, bars, asOf) {
  const endpoints = [];
  for (let m = 6; m >= 0; m--) {
    const cutoff = monthsBefore(asOf, m);
    const bar = anchor(bars, cutoff);
    if (!bar || ageDays(cutoff, bar.date) > 7) return fail('MISSING_MONTHLY_ANCHOR', `Missing contemporaneous endpoint for ${cutoff}.`);
    if (!finitePositive(bar.totalReturnIndex)) return fail('MISSING_TOTAL_RETURN', `Canonical positive totalReturnIndex required at ${bar.date}; close is not a fallback.`);
    endpoints.push(bar);
  }
  const score = endpoints.at(-1).totalReturnIndex / endpoints[0].totalReturnIndex - 1;
  return { score, trace: [{ ruleId: 'JT_FORMATION_6M_NO_SKIP', sourceId: 'jt1993', startDate: endpoints[0].date, endDate: endpoints.at(-1).date, monthlyEndpointDates: endpoints.map((b) => b.date), rawValue: score }] };
}
function highProximity(security, bars, asOf) {
  const cutoff = monthsBefore(asOf, 12);
  const start = anchor(bars, cutoff);
  if (!start || ageDays(cutoff, start.date) > 7) return fail('INSUFFICIENT_52W_HISTORY', 'A full trailing 12-calendar-month history is required.');
  const window = bars.filter((b) => b.date > cutoff);
  if (!window.length || window.some((b) => !finitePositive(b.close))) return fail('MISSING_ADJUSTED_CLOSE', 'Positive split-adjusted closes required throughout the trailing window.');
  // A data-coverage guard, explicitly not a published trading filter.
  const dates = [start, ...window];
  if (dates.some((b, i) => i && ageDays(b.date, dates[i - 1].date) > 10)) return fail('HISTORY_GAP', 'Trailing history has a gap exceeding the declared 10-calendar-day guard.');
  const high = Math.max(...window.map((b) => b.close));
  const latest = window.at(-1);
  const score = latest.close / high;
  return { score, trace: [{ ruleId: 'GH_52W_PROXIMITY', sourceId: 'gh2004', startDate: window[0].date, endDate: latest.date, priceField: 'split-adjusted close', trailingMaximum: high, latestPrice: latest.close, rawValue: score }] };
}
function weekKey(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function lowVolatility(security, bars, asOf) {
  const cutoff = monthsBefore(asOf, 36);
  const start = anchor(bars, cutoff);
  if (!start || ageDays(cutoff, start.date) > 7) return fail('INSUFFICIENT_3Y_HISTORY', 'Three calendar years of total-return history required.');
  const weekly = new Map();
  for (const b of bars.filter((b) => b.date > cutoff)) weekly.set(weekKey(b.date), b);
  const endpoints = [start, ...weekly.values()];
  if (endpoints.some((b) => !finitePositive(b.totalReturnIndex))) return fail('MISSING_TOTAL_RETURN', 'Canonical positive totalReturnIndex required at every weekly endpoint; no close fallback.');
  if (endpoints.some((b, i) => i && ageDays(b.date, endpoints[i - 1].date) > 10)) return fail('HISTORY_GAP', 'Weekly endpoint history has a gap exceeding the declared 10-calendar-day guard.');
  const returns = endpoints.slice(1).map((b, i) => Math.log(b.totalReturnIndex / endpoints[i].totalReturnIndex));
  if (returns.length < 2) return fail('INSUFFICIENT_WEEKLY_RETURNS', 'Sample standard deviation needs at least two weekly returns.');
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1));
  return { score: volatility === 0 ? 0 : -volatility, trace: [{ ruleId: 'LV_3Y_WEEKLY_VOLATILITY', sourceId: 'LV-PAPER', startDate: start.date, endDate: endpoints.at(-1).date, weeklyObservations: returns.length, logReturns: true, riskFreeSubtraction: false, sampleDdof: 1, rawValue: volatility, adaptation: 'Weekly log total returns, without local risk-free subtraction.' }] };
}
function evaluate(definition, scorer, context) {
  if (!context || !validDate(context.asOf) || !Array.isArray(context.securities)) {
    return { targets: [], eligibility: { eligible: 0, examined: 0 }, rejections: [fail('INVALID_CONTEXT', 'asOf ISO date and securities array are required.')], status: 'INVALID_CONTEXT' };
  }
  const { asOf, securities } = context;
  const duplicateIds = new Set(securities.filter((s, i) => securities.findIndex((x) => x?.id === s?.id) !== i).map((s) => s?.id));
  const eligible = [], rejections = [];
  for (const security of securities) {
    const id = security?.id ?? null, ticker = security?.ticker ?? null;
    const prepared = duplicateIds.has(id) ? fail('DUPLICATE_ID', 'Universe identity occurs more than once.') : prepare(security, asOf);
    const result = prepared.code ? prepared : scorer(security, prepared.bars, asOf);
    if (result.code || !Number.isFinite(result.score)) rejections.push({ id, ticker, ruleId: 'DATA_ELIGIBILITY', ...result.code ? result : fail('NONFINITE_SCORE', 'Score is not finite.') });
    else eligible.push({ id, ticker, score: result.score, ruleTrace: result.trace });
  }
  eligible.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
  const selectedCount = Math.ceil(eligible.length * definition.parameters.selectionFraction);
  const selected = eligible.slice(0, selectedCount);
  for (const s of eligible.slice(selectedCount)) rejections.push({ id: s.id, ticker: s.ticker, ruleId: definition.selectionRuleId, code: 'OUTSIDE_SELECTION_QUANTILE', score: s.score });
  const targets = selected.map((s, i) => ({ ...s, weight: 1 / selectedCount, ruleTrace: [...s.ruleTrace, { ruleId: definition.selectionRuleId, sourceId: definition.sources[0].id, eligibleCount: eligible.length, selectedCount, rank: i + 1, selectionFraction: definition.parameters.selectionFraction }, { ruleId: 'COHORT_EQUAL_WEIGHT', weight: 1 / selectedCount, fidelity: 'VU_ADAPTATION' }] }));
  const dataRejections = rejections.filter((r) => r.code !== 'OUTSIDE_SELECTION_QUANTILE');
  return { targets, eligibility: { examined: securities.length, eligible: eligible.length, selected: targets.length, entries: eligible.map(({ id, ticker, score }) => ({ id, ticker, score })) }, rejections, status: !eligible.length ? 'DATA_UNAVAILABLE' : dataRejections.length ? 'PARTIAL' : 'READY', asOf, portfolioSemantics: definition.portfolioSemantics };
}
const jtSource = { id: 'jt1993', url: 'https://www.bauer.uh.edu/rsusmel/phd/jegadeesh-titman93.pdf', locator: 'Section I, printed pp.68–69; representative 6/6 no-skip variant.' };
const ghSource = { id: 'gh2004', url: 'https://www.bauer.uh.edu/TGeorge/papers/gh4-paper.pdf', locator: 'Tables I–III, printed pp.2148–2152.' };
const lvSource = { id: 'LV-PAPER', url: 'https://repub.eur.nl/pub/10460/ERS-2007-044-F%26A.pdf', locator: 'II Data and methodology, printed pp.3–4; April 2007 inner version.' };
const cohort = { rebalance: 'MONTHLY_FORMATION', targetWeightScope: 'NEW_COHORT', cohortMonths: 6, cohortCapitalFraction: 1 / 6, capitalRampUp: 'UNFORMED_COHORT_SLEEVES_REMAIN_CASH', retainedCohorts: 'RUNNER_PRESERVES_PREVIOUS_SELECTIONS_UNTIL_EXPIRY_AND_EQUAL_WEIGHTS_WITHIN_EACH', execution: 'NEXT_SESSION_OPEN_BY_RUNNER', stopLoss: null, leverage: 1, longOnly: true };
function definition(id, name, source, parameters, semantics, selectionRuleId, scorer, rules, adaptations) {
  const d = { id, name, fidelity: 'VU_ADAPTATION', era: source.locator, sources: [source], parameters, portfolioSemantics: semantics, selectionRuleId, rules, adaptations, dataContract: { asOf: 'YYYY-MM-DD; formation date supplied by monthly runner', historicalCutoffs: 'END_OF_TARGET_CALENDAR_MONTH; last available session on/before cutoff', close: 'split-adjusted historical close', totalReturnIndex: 'canonical point-in-time total-return index; no fallback', futureBars: 'IGNORED', invalidOrDuplicateDates: 'REJECT_SECURITY', maximumEndpointStalenessCalendarDays: 7, maximumHistoryGapCalendarDays: 10, universe: 'PIT VU universe supplied by runner; no liquidity defaults in strategy' } };
  d.evaluate = (context) => evaluate(d, scorer, context);
  return freeze(d);
}
export const academicMethods = freeze([
  definition('cross_sectional_momentum', 'JT1993 six/six long cohort', jtSource, { formationMonths: 6, holdingMonths: 6, skipDays: 0, selectionFraction: 0.1, cohortEqualWeight: true, tieBreak: 'STABLE_ID_ASCENDING', quantileRounding: 'CEIL' }, { ...cohort }, 'JT_TOP_DECILE', momentum,
    [{ id: 'JT_FORMATION_6M_NO_SKIP', provenance: 'SOURCE_VARIANT', description: 'Six-month total return; representative 6/6 no-skip paper variant.' }, { id: 'JT_TOP_DECILE', provenance: 'SOURCE', description: 'Highest prior-return decile.' }, { id: 'COHORT_EQUAL_WEIGHT', provenance: 'SOURCE_LONG_SLEEVE', description: 'Equal weights within each monthly cohort; cohort expires after six months.' }],
    ['VU PIT US universe and long sleeve; original short leg omitted.', 'Six-month variant frozen before performance; no optimization.', 'Ceil quantile counts and stable-id ties are declared VU discrete-universe conventions.', 'Next-open execution, cash ramp-up and explicit data guards are operational VU choices.']),
  definition('52_week_high_effect', 'George–Hwang proximity long cohort', ghSource, { formationMonths: 12, holdingMonths: 6, selectionFraction: 0.3, priceField: 'close', cohortEqualWeight: true, tieBreak: 'STABLE_ID_ASCENDING', quantileRounding: 'CEIL' }, { ...cohort }, 'GH_TOP_30_PERCENT', highProximity,
    [{ id: 'GH_52W_PROXIMITY', provenance: 'SOURCE_WITH_PRICE_CONVENTION', description: 'Latest split-adjusted close divided by maximum split-adjusted close over trailing twelve calendar months.' }, { id: 'GH_TOP_30_PERCENT', provenance: 'SOURCE', description: 'Highest 30 percent price-proximity ranks, no breakout trigger.' }, { id: 'COHORT_EQUAL_WEIGHT', provenance: 'SOURCE_LONG_SLEEVE', description: 'Monthly equal-weight cohorts retained for six months.' }],
    ['VU PIT US universe and long sleeve; original short leg omitted.', 'Daily split-adjusted close and twelve-calendar-month cutoff explicitly fix source highest-price convention.', 'Ceil quantile counts, stable-id ties, next-open fills and cash ramp-up are operational VU choices.']),
  definition('LOW_VOLATILITY', 'Blitz–van Vliet low-volatility US long sleeve', lvSource, { lookbackMonths: 36, weeklySampling: 'LAST_OBSERVED_SESSION_OF_ISO_WEEK_INCLUDING_ASOF_PARTIAL_WEEK', returns: 'LOG_TOTAL_RETURN', riskFreeSubtraction: false, volatilityDdof: 1, selectionFraction: 0.1, annualizeScore: false, tieBreak: 'STABLE_ID_ASCENDING', quantileRounding: 'CEIL' }, { rebalance: 'MONTHLY', targetWeightScope: 'FULL_PORTFOLIO', cohortMonths: 1, cohortCapitalFraction: 1, execution: 'NEXT_SESSION_OPEN_BY_RUNNER', stopLoss: null, leverage: 1, longOnly: true }, 'LV_BOTTOM_VOLATILITY_DECILE', lowVolatility,
    [{ id: 'LV_3Y_WEEKLY_VOLATILITY', provenance: 'SOURCE_WITH_EXPLICIT_ADAPTATIONS', description: 'Three-calendar-year sample volatility of weekly log total returns; risk-free subtraction omitted explicitly.' }, { id: 'LV_BOTTOM_VOLATILITY_DECILE', provenance: 'SOURCE', description: 'Lowest volatility decile; equal weights refreshed monthly.' }, { id: 'COHORT_EQUAL_WEIGHT', provenance: 'SOURCE', description: 'Full-portfolio equal weight monthly.' }],
    ['US VU PIT universe instead of historical FTSE World Developed members.', 'Paper uses local excess log returns; VU ranking uses log total returns without risk-free subtraction.', 'Paper does not fix weekly weekday or sample denominator; ISO last-session/partial-week and ddof1 are frozen VU conventions.', 'No later Conservative Formula, beta sizing or liquidity rule is imported.']),
]);
export const academicPrerequisites = freeze([
  { id: 'residual_momentum', status: 'DATA_UNAVAILABLE_UNTIL_CERTIFIED', sourceIds: ['residual2011'], requirements: ['36 complete monthly canonical total returns per stock', 'PIT aligned monthly FF3 mktRF/smb/hml/rf series, with units and vintage contract', 'Standardized 12−1 residuals excluding estimated alpha', 'Exact source holding horizon freeze'], reason: 'Factor availability is not established by raw prices; no market/industry proxy permitted.' },
  { id: 'industry_momentum', status: 'DATA_UNAVAILABLE_UNTIL_CERTIFIED', sourceIds: ['mg1999'], requirements: ['PIT two-digit SIC classification and exact original 20-group mapping', 'PIT market capitalization for value weights within industry', 'Six-month industry returns; three winning industries; equal industry sleeves'], reason: 'Current sector labels cannot reconstruct historical SIC membership; no sector-ETF proxy.' },
  { id: 'value_plus_momentum', status: 'DATA_UNAVAILABLE_UNTIL_CERTIFIED', sourceIds: ['vm2013'], requirements: ['PIT book equity with source six-month lag', 'PIT market equity/share count', 'Canonical 2−12 momentum returns', 'Separate source-defined value and momentum sleeves combined50/50; weighting variant freeze'], reason: 'A cheap-winner intersection is not the source portfolio; no EPS/PE/book-value substitute.' },
]);
export function assessAcademicPrerequisites(context = {}) {
  // A certification must be prepared by the data audit, never inferred from some field being present.
  return academicPrerequisites.map((method) => ({ ...method, status: 'DATA_UNAVAILABLE', suppliedInputHints: { factors: Array.isArray(context.factors) && context.factors.length > 0, fundamentals: context.fundamentals != null, securities: Array.isArray(context.securities) ? context.securities.length : 0 }, targets: [], note: 'These methods are not implemented; required field semantics, timestamps, source universe and completeness need independent certification.' }));
}
export default academicMethods;
