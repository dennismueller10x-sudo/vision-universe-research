import {resolvePreviousFiscalPeriod} from './fiscal-period-links.mjs';
// Research-only, frozen source-derived long sleeves. Never imported by live engines.
const SOURCE_MAP = {
  eq_gp_2012: { id: 'eq_gp_2012', url: 'https://mysimon.rochester.edu/novy-marx/research/OSoV.pdf', locator: 'June 2012 manuscript, section 2 / table 2' },
  eq_piotroski_paper: { id: 'eq_piotroski_paper', url: 'https://www.chicagobooth.edu/~/media/FE874EE65F624AAEBD0166B1974FD74D', locator: 'Selected Paper 84, sections 2.3 and 3; body turnover definition' },
  eq_piotroski_review: { id: 'eq_piotroski_review', url: 'https://www.chicagobooth.edu/review/separating-winners-losers', locator: 'Original high-book-to-market conditioning' },
  eq_magic_faq: { id: 'eq_magic_faq', url: 'https://www.magicformulainvesting.com/Home/Faqs', locator: 'Equal dollars; annual holding; financial/utility exclusions' },
  eq_magic_work: { id: 'eq_magic_work', url: 'https://www.magicformulainvesting.com/Home/HowItWorks', locator: 'Diversification, annual replacement' },
  eq_magic_interview: { id: 'eq_magic_interview', url: 'https://images.forbes.com/media/pdfs/2010/04/Joel_Greenblatt_Briefing_Book.pdf', locator: 'January 22, 2010 interview, pp. 3–6; combined rank' },
  vm2013: { id: 'vm2013', url: 'https://spinup-000d1a-wp-offload-media.s3.amazonaws.com/faculty/wp-content/uploads/sites/3/2019/09/ValueandMomentumEverywhere.pdf', locator: 'Journal of Finance 68 (2013), sections I.B and I.D, equations 1–3' },
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const FUNDAMENTAL_EVALUATOR_VERSION = 'EVALUATOR_BUGFIX_FISCAL_LINEAGE_V2';
export const FUNDAMENTAL_EVALUATOR_IMPLEMENTATION = deepFreeze({
  version: FUNDAMENTAL_EVALUATOR_VERSION,
  originalModule: '../tournament/engines/fundamental.mjs',
  originalModuleSha256: 'e6d481fd18411cb321ea7033c927d3d8d121dcc0461d99c339f226b603e1b816',
  mechanicalChange: 'PIOTROSKI_CERTIFIED_ACTUAL_PREVIOUS_FISCAL_PERIODS_ONLY',
  unchangedRulebookCount: 4, originalRulebooksChanged: false,
  calendarFallbackAllowed: false, noParameterTuning: true,
});

export const FUNDAMENTAL_RULES = deepFreeze({
  gross_profitability_novy_marx: {
    formula: '(revenue - cogs) / assets', quantile: 0.8,
    weighting: 'PIT market equity', rebalance: 'ANNUAL_JUNE', holdMonths: 12,
    annualPolicy: 'Prior-calendar-year fiscal statements; original vintage available at signal time',
    adaptations: ['VU reference-universe quintiles replace NYSE breakpoints', 'US equities long sleeve only'],
    sources: ['eq_gp_2012'],
  },
  piotroski_value_fscore: {
    bookToMarketQuantile: 0.8, minimumFScore: 8, weighting: 'EQUAL_DOLLAR',
    turnoverDenominator: 'BEGINNING_ASSETS', rebalance: 'ANNUAL_JUNE', holdMonths: 12,
    adaptations: ['June batch replaces issuer fifth-month annual cohorts', 'VU reference universe', 'US equities long sleeve only', 'Source body beginning-assets turnover chosen over conflicting table'],
    sources: ['eq_piotroski_paper', 'eq_piotroski_review'],
  },
  greenblatt_magic_formula: {
    minimumPositions: 20, maximumPositions: 30, weighting: 'EQUAL_DOLLAR',
    earningsYield: 'EBIT / (market equity + total interest-bearing debt - cash)',
    returnOnCapital: 'EBIT / (current assets - cash - current liabilities + current debt + net PPE)',
    rebalance: 'ANNUAL_BATCH', holdMonths: 12,
    adaptations: ['Explicit VU accounting normalization; unread original appendix prevents exact replication', 'Annual batch; no discretionary name removal or tax optimization', 'No quarterly Formula Investing cohort inheritance'],
    sources: ['eq_magic_faq', 'eq_magic_work', 'eq_magic_interview'],
  },
  value_plus_momentum: {
    bookLagMonths: 6, momentum: 'MOM2–12_TOTAL_RETURN', weighting: '0.5 VALUE_LONG + 0.5 MOMENTUM_LONG',
    rankWeighting: 'Positive part of cross-sectional rank minus mean rank; each sleeve normalized independently',
    rebalance: 'MONTHLY', holdMonths: 1,
    adaptations: ['VU PIT universe replaces original large/liquid universe', 'Two positive long sleeves; no short legs or factor-return inheritance'],
    sources: ['vm2013'],
  },
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function day(value) {
  if (typeof value !== 'string') return null;
  const result = value.slice(0, 10);
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return DAY.test(result) && Number.isFinite(parsed) && new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) === result ? result : null;
}
function instant(value, endOfDay = false) {
  return day(value) ? Date.parse(value.length === 10 ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value) : NaN;
}
function sourcePresent(source) {
  return typeof source === 'string' ? source.trim().length > 0 : !!source && typeof source === 'object' && !!(source.id || source.url || source.accession || source.provider);
}
function keyOf(fact) { return fact.key ?? fact.concept ?? fact.metric ?? fact.name; }
function periodOf(fact) { return day(fact.periodEnd ?? fact.period_end ?? fact.annualperiod?.end ?? fact.annualperiod); }
function availableOf(fact) { return fact.availableAt ?? fact.filedAt ?? fact.filed ?? fact.date; }
function isCurrentLatest(fact) {
  return fact.latest === true || fact.isLatest === true || fact.currentLatest === true || /^(latest|currentlatest|current_latest)$|current[_ -]?latest|latest[_ -]?snapshot/i.test(String(fact.origin ?? fact.scope ?? fact.kind ?? ''));
}
function annual(fact) {
  return /^(annual|fy|fiscal_year)$/i.test(String(fact.frequency ?? fact.periodType ?? '')) || fact.annualperiod != null;
}
function certified(fact) {
  const key = keyOf(fact), unit = fact.unit;
  // Adapters must certify the exact economic concept and normalized denomination.
  // Currency alone cannot certify whether a raw number is USD or USD millions.
  const expected = ['sic', 'SIC'].includes(key) ? 'CODE' : key === 'noCommonEquityIssued' ? 'BOOLEAN' :
    ['sharesOutstanding', 'CommonStockSharesOutstanding'].includes(key) ? 'SHARES' : 'USD';
  return fact.certification?.normalized === true && fact.certification?.concept === key && unit === expected &&
    (expected !== 'USD' || typeof fact.value === 'number' && Number.isFinite(fact.value)) &&
    (expected !== 'CODE' || Number.isInteger(fact.value) && fact.value >= 0 && fact.value <= 9999) &&
    (expected !== 'BOOLEAN' || typeof fact.value === 'boolean') &&
    (expected !== 'SHARES' || fact.certification?.basis === 'ACTUAL_POINT_IN_TIME');
}

/** Only explicitly dated original facts; never reads security.currentlatest. */
export function selectPITFact(security, key, asOf, options = {}) {
  const cutoff = instant(asOf, true);
  if (!Number.isFinite(cutoff)) return null;
  const keys = Array.isArray(key) ? key : [key];
  const matches = (Array.isArray(security.fundamentals) ? security.fundamentals : []).filter(fact => {
    const period = periodOf(fact), available = instant(availableOf(fact), true);
    return keys.includes(keyOf(fact)) && !isCurrentLatest(fact) && period &&
      Number.isFinite(available) && available <= cutoff && instant(period) <= cutoff &&
      sourcePresent(fact.source) && certified(fact) && (typeof fact.value === 'boolean' || typeof fact.value === 'number' && Number.isFinite(fact.value)) &&
      (!options.annual || annual(fact)) && (!options.periodEnd || period === options.periodEnd) &&
      (!options.maxPeriodEnd || period <= options.maxPeriodEnd) &&
      (!options.periodYear || Number(period.slice(0, 4)) === options.periodYear);
  });
  matches.sort((a, b) => periodOf(b).localeCompare(periodOf(a)) || instant(availableOf(b), true) - instant(availableOf(a), true));
  if (!matches.length) return null;
  const latest = matches[0];
  // Equal-time contradictory facts have no defensible ordering.
  if (matches.some(f => periodOf(f) === periodOf(latest) && instant(availableOf(f), true) === instant(availableOf(latest), true) && f.value !== latest.value)) return null;
  return { key: keyOf(latest), value: latest.value, periodEnd: periodOf(latest), availableAt: availableOf(latest), source: latest.source, unit: latest.unit, certification: latest.certification, frequency: annual(latest) ? 'ANNUAL' : latest.frequency ?? 'INSTANT' };
}

const KEYS = {
  revenue: ['revenue', 'revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'],
  cogs: ['cogs', 'costOfGoodsSold', 'CostOfGoodsAndServicesSold'],
  assets: ['assets', 'totalAssets', 'Assets'], bookEquity: ['bookEquity', 'commonEquity'],
  income: ['incomeBeforeExtraordinaryItems', 'netIncomeBeforeExtraordinaryItems'],
  cfo: ['operatingCashFlow', 'cashFlowFromOperations', 'NetCashProvidedByUsedInOperatingActivities'],
  currentAssets: ['currentAssets', 'AssetsCurrent'], currentLiabilities: ['currentLiabilities', 'LiabilitiesCurrent'],
  longDebt: ['longTermDebt', 'LongTermDebtNoncurrent'], cash: ['cash', 'cashAndEquivalents', 'CashAndCashEquivalentsAtCarryingValue'],
  currentDebt: ['currentDebt', 'currentInterestBearingDebt'], totalDebt: ['totalDebt', 'totalInterestBearingDebt'],
  netPPE: ['netPPE', 'PropertyPlantAndEquipmentNet'], ebit: ['ebit', 'EBIT'],
  noIssue: ['noCommonEquityIssued'], grossIssue: ['grossCommonEquityIssued', 'commonEquityIssuanceGrossProceeds'],
  marketEquity: ['marketEquity', 'marketCap'], shares: ['sharesOutstanding', 'CommonStockSharesOutstanding'], sic: ['sic', 'SIC'],
};
function identifier(security) { return security.id ?? security.ticker; }
function rejection(security, reason, missing = []) { return { id: identifier(security), ticker: security.ticker ?? identifier(security), reason, missing }; }
function trace(rule, facts, sourceIds, details = {}) {
  return { rule, sourceIds, data: facts.filter(Boolean), ...details };
}
function requireFacts(security, asOf, fields, options) {
  const facts = {}, missing = [];
  for (const field of fields) {
    const fact = selectPITFact(security, KEYS[field], asOf, options);
    if (!fact || typeof fact.value !== 'number') missing.push(field);
    else facts[field] = fact;
  }
  const units = new Set(Object.values(facts).map(f => f.unit).filter(Boolean));
  if (units.size > 1) missing.push('CONSISTENT_NORMALIZED_MONETARY_UNITS');
  return { facts, missing };
}
function currentBar(security, asOf, maxDate = day(asOf)) {
  const bars = (security.bars ?? []).filter(b => day(b.date) && b.date.slice(0, 10) <= maxDate && instant(b.date) <= instant(asOf, true) &&
    Number.isFinite(instant(b.availableAt ?? day(b.date), true)) && instant(b.availableAt ?? day(b.date), true) <= instant(asOf, true));
  return [...bars].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}
function marketEquity(security, asOf, periodEnd = null) {
  const direct = selectPITFact(security, KEYS.marketEquity, asOf, periodEnd ? { periodEnd } : {});
  if (direct && direct.value > 0 && (periodEnd || (instant(asOf) - instant(direct.periodEnd)) / 86400000 <= 7)) return { value: direct.value, evidence: [direct] };
  // No shares-times-price fallback: filing shares and provider closes can have
  // different split bases; weighted-average shares are not point-in-time shares.
  return null;
}
function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * fraction;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}
function ranks(rows, field, descending = false) {
  const sorted = [...rows].sort((a, b) => descending ? b[field] - a[field] : a[field] - b[field]);
  const result = new Map();
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j][field] === sorted[i][field]) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) result.set(sorted[k].id, rank);
    i = j;
  }
  return result;
}
function result(id, context, targets, eligible, rejections, reason = null) {
  const unavailable = reason || eligible.length === 0;
  return {
    strategyId: id, asOf: context.asOf, targets: unavailable ? [] : targets,
    status: unavailable ? 'BLOCKED_DATA' : 'OK',
    eligibility: { inputCount: context.securities?.length ?? 0, eligibleCount: eligible.length, selectedCount: unavailable ? 0 : targets.length, eligibleIds: eligible.map(r => r.id), dataGate: reason, partialCoverage: rejections.some(r => r.reason === 'MISSING_PIT_FACTS') },
    rejections, fidelity: 'VU_ADAPTATION', researchOnly: true,
    adaptations: FUNDAMENTAL_RULES[id].adaptations, provenance: { sources: FUNDAMENTAL_RULES[id].sources, paperReturnsInherited: false, execution: 'Strictly later session than asOf; runner owns calendar and costs' },
  };
}
function annualOptions(context) { return { annual: true, periodYear: Number(day(context.asOf)?.slice(0, 4)) - 1 }; }
function target(row, weight, score, ruleTrace) { return { id: row.id, ticker: row.ticker, weight, score, ruleTrace }; }

function evaluateGross(context) {
  const id = 'gross_profitability_novy_marx', eligible = [], rejections = [];
  for (const security of context.securities ?? []) {
    const assets = selectPITFact(security, KEYS.assets, context.asOf, annualOptions(context));
    const sic = selectPITFact(security, KEYS.sic, context.asOf);
    const { facts, missing } = requireFacts(security, context.asOf, ['revenue', 'cogs', 'assets'], { annual: true, periodEnd: assets?.periodEnd ?? 'UNAVAILABLE' });
    const market = marketEquity(security, context.asOf);
    if (!sic) missing.push('PIT_SIC');
    if (!market) missing.push('PIT_MARKET_EQUITY');
    if (missing.length) { rejections.push(rejection(security, 'MISSING_PIT_FACTS', missing)); continue; }
    if (sic.value >= 6000 && sic.value < 7000) { rejections.push(rejection(security, 'FINANCIAL_EXCLUDED')); continue; }
    if (!(facts.assets.value > 0)) { rejections.push(rejection(security, 'NONPOSITIVE_ASSETS')); continue; }
    eligible.push({ id: identifier(security), ticker: security.ticker ?? identifier(security), score: (facts.revenue.value - facts.cogs.value) / facts.assets.value, market: market.value,
      ruleTrace: [trace('Annual gross-profitability ratio', [...Object.values(facts), sic, ...market.evidence], FUNDAMENTAL_RULES[id].sources)] });
  }
  if (eligible.length < 5) return result(id, context, [], eligible, rejections, 'INSUFFICIENT_QUINTILE_REFERENCE_UNIVERSE');
  const cutoff = quantile(eligible.map(r => r.score), 0.8), selected = eligible.filter(r => r.score >= cutoff), total = selected.reduce((n, r) => n + r.market, 0);
  return result(id, context, selected.map(r => target(r, r.market / total, r.score, [...r.ruleTrace, trace('VU upper-quintile long sleeve', [], FUNDAMENTAL_RULES[id].sources, { cutoff, referenceCount: eligible.length })])), eligible, rejections);
}

function piotroskiScore(security, asOf, periodEnd, formationCutoffUTC) {
  const fields = ['revenue', 'cogs', 'assets', 'income', 'cfo', 'currentAssets', 'currentLiabilities', 'longDebt'];
  const current = requireFacts(security, asOf, fields, { annual: true, periodEnd });
  const priorPeriod = resolvePreviousFiscalPeriod(security, periodEnd, { formationCutoffUTC, steps: 1 });
  if (priorPeriod.status !== 'CERTIFIED') return { missing: ['CERTIFIED_PREVIOUS_FISCAL_PERIOD'], blockReason: priorPeriod.reason };
  const olderPeriod = resolvePreviousFiscalPeriod(security, periodEnd, { formationCutoffUTC, steps: 2 });
  if (olderPeriod.status !== 'CERTIFIED') return { missing: ['CERTIFIED_OLDER_FISCAL_PERIOD'], blockReason: olderPeriod.reason };
  const prior = requireFacts(security, asOf, ['revenue', 'cogs', 'assets', 'income', 'currentAssets', 'currentLiabilities', 'longDebt'], { annual: true, periodEnd: priorPeriod.periodEnd });
  const older = selectPITFact(security, KEYS.assets, asOf, { annual: true, periodEnd: olderPeriod.periodEnd });
  const noIssue = selectPITFact(security, KEYS.noIssue, asOf, { annual: true, periodEnd });
  const grossIssue = selectPITFact(security, KEYS.grossIssue, asOf, { annual: true, periodEnd });
  const missing = [...current.missing.map(k => `current.${k}`), ...prior.missing.map(k => `prior.${k}`)];
  const units = new Set([...Object.values(current.facts), ...Object.values(prior.facts), older].filter(Boolean).map(f => f.unit).filter(Boolean));
  if (units.size > 1) missing.push('CONSISTENT_CROSS_YEAR_MONETARY_UNITS');
  if (!older || !(older.value > 0)) missing.push('older.assets');
  if (!(noIssue && typeof noIssue.value === 'boolean') && !(grossIssue && typeof grossIssue.value === 'number' && grossIssue.value >= 0)) missing.push('GROSS_COMMON_EQUITY_ISSUANCE_EVIDENCE');
  if (noIssue && grossIssue && noIssue.value !== (grossIssue.value === 0)) missing.push('CONFLICTING_COMMON_EQUITY_ISSUANCE_EVIDENCE');
  if (missing.length) return { missing };
  const c = Object.fromEntries(Object.entries(current.facts).map(([k, f]) => [k, f.value]));
  const p = Object.fromEntries(Object.entries(prior.facts).map(([k, f]) => [k, f.value]));
  if (!(c.assets > 0 && p.assets > 0 && c.revenue > 0 && p.revenue > 0 && c.currentLiabilities > 0 && p.currentLiabilities > 0)) return { missing: ['POSITIVE_ACCOUNTING_DENOMINATORS'] };
  const flags = {
    positiveROA: c.income / p.assets > 0,
    positiveCFO: c.cfo / p.assets > 0,
    improvingROA: c.income / p.assets > p.income / older.value,
    cashExceedsIncome: c.cfo > c.income,
    decliningLeverage: c.longDebt / ((c.assets + p.assets) / 2) < p.longDebt / ((p.assets + older.value) / 2),
    improvingLiquidity: c.currentAssets / c.currentLiabilities > p.currentAssets / p.currentLiabilities,
    noCommonEquityIssued: noIssue ? noIssue.value : grossIssue.value === 0,
    improvingGrossMargin: (c.revenue - c.cogs) / c.revenue > (p.revenue - p.cogs) / p.revenue,
    improvingTurnover: c.revenue / p.assets > p.revenue / older.value,
  };
  return { score: Object.values(flags).filter(Boolean).length, flags, evidence: [...Object.values(current.facts), ...Object.values(prior.facts), older, noIssue ?? grossIssue] };
}
function evaluatePiotroski(context) {
  const id = 'piotroski_value_fscore', reference = [], rejections = [];
  for (const security of context.securities ?? []) {
    const book = selectPITFact(security, KEYS.bookEquity, context.asOf, annualOptions(context));
    const market = book && marketEquity(security, context.asOf, book.periodEnd);
    if (!book || !market) { rejections.push(rejection(security, 'MISSING_PIT_FACTS', ['ANNUAL_BOOK_EQUITY_AND_FISCAL_MARKET_EQUITY'])); continue; }
    if (!(book.value > 0)) { rejections.push(rejection(security, 'NONPOSITIVE_BOOK_EQUITY')); continue; }
    reference.push({ id: identifier(security), ticker: security.ticker ?? identifier(security), security, book, market, bm: book.value / market.value });
  }
  if (reference.length < 5) return result(id, context, [], reference, rejections, 'INSUFFICIENT_VALUE_REFERENCE_UNIVERSE');
  const cutoff = quantile(reference.map(r => r.bm), 0.8), highBM = reference.filter(r => r.bm >= cutoff), eligible = [], selected = [];
  for (const row of highBM) {
    const scored = piotroskiScore(row.security, context.asOf, row.book.periodEnd, context.formationCutoffUTC);
    if (scored.missing) { rejections.push(rejection(row.security, scored.blockReason ?? 'MISSING_PIT_FACTS', scored.missing)); continue; }
    eligible.push(row);
    if (scored.score >= 8) selected.push({ ...row, scored });
    else rejections.push(rejection(row.security, 'FSCORE_BELOW_8'));
  }
  for (const row of reference.filter(r => r.bm < cutoff)) rejections.push(rejection(row.security, 'OUTSIDE_HIGH_BOOK_TO_MARKET_QUINTILE'));
  return result(id, context, selected.map(r => target(r, 1 / selected.length, r.scored.score, [
    trace('Value condition BEFORE score completeness filtering', [r.book, ...r.market.evidence], FUNDAMENTAL_RULES[id].sources, { bookToMarket: r.bm, cutoff, referenceCount: reference.length }),
    trace('Nine original F-score signals; body turnover definition', r.scored.evidence, FUNDAMENTAL_RULES[id].sources, { flags: r.scored.flags }),
  ])), eligible, rejections, eligible.length ? null : 'NO_COMPLETE_HIGH_VALUE_FSCORE_FACTS');
}

function evaluateMagic(context) {
  const id = 'greenblatt_magic_formula', eligible = [], rejections = [];
  for (const security of context.securities ?? []) {
    const ebit = selectPITFact(security, KEYS.ebit, context.asOf, annualOptions(context));
    const { facts, missing } = requireFacts(security, context.asOf, ['ebit', 'totalDebt', 'cash', 'currentAssets', 'currentLiabilities', 'currentDebt', 'netPPE'], { annual: true, periodEnd: ebit?.periodEnd ?? 'UNAVAILABLE' });
    const sic = selectPITFact(security, KEYS.sic, context.asOf), market = marketEquity(security, context.asOf);
    if (!sic) missing.push('PIT_SIC');
    if (!market) missing.push('PIT_MARKET_EQUITY');
    if (missing.length) { rejections.push(rejection(security, 'MISSING_PIT_FACTS', missing)); continue; }
    if (sic.value >= 6000 && sic.value < 7000 || sic.value >= 4900 && sic.value < 5000) { rejections.push(rejection(security, 'FINANCIAL_OR_UTILITY_EXCLUDED')); continue; }
    const v = Object.fromEntries(Object.entries(facts).map(([k, f]) => [k, f.value]));
    const ev = market.value + v.totalDebt - v.cash, capital = v.currentAssets - v.cash - v.currentLiabilities + v.currentDebt + v.netPPE;
    if (!(ev > 0 && capital > 0 && v.ebit > 0)) { rejections.push(rejection(security, 'NONPOSITIVE_EBIT_EV_OR_TANGIBLE_CAPITAL')); continue; }
    eligible.push({ id: identifier(security), ticker: security.ticker ?? identifier(security), ey: v.ebit / ev, roc: v.ebit / capital,
      ruleTrace: [trace('Explicit VU accounting-normalization adaptation', [...Object.values(facts), sic, ...market.evidence], FUNDAMENTAL_RULES[id].sources, { enterpriseValue: ev, tangibleCapital: capital, confidence: 'LOW', unreadAppendix: true })] });
  }
  if (eligible.length < 20) return result(id, context, [], eligible, rejections, 'MINIMUM_20_DIVERSIFIED_POSITIONS_NOT_AVAILABLE');
  const ey = ranks(eligible, 'ey', true), roc = ranks(eligible, 'roc', true);
  const selected = eligible.map(r => ({ ...r, score: ey.get(r.id) + roc.get(r.id) })).sort((a, b) => a.score - b.score || String(a.id).localeCompare(String(b.id))).slice(0, 30);
  return result(id, context, selected.map(r => target(r, 1 / selected.length, r.score, [...r.ruleTrace, trace('Sum of separate earnings-yield and return-on-capital ranks', [], FUNDAMENTAL_RULES[id].sources, { eyRank: ey.get(r.id), rocRank: roc.get(r.id) })])), eligible, rejections);
}

function monthEnd(asOf, offset) {
  const date = new Date(`${day(asOf)}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0)).toISOString().slice(0, 10);
}
function monthsBefore(asOf, count) {
  const date = new Date(`${day(asOf)}T00:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth() - count;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentMonthLastDay = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate();
  const targetDay = date.getUTCDate() === currentMonthLastDay ? lastDay : Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, targetDay)).toISOString().slice(0, 10);
}
function momentumSignal(security, asOf) {
  const endDate = monthEnd(asOf, -1), startDate = monthEnd(asOf, -12);
  const start = currentBar(security, asOf, startDate), end = currentBar(security, asOf, endDate);
  const source = security.priceSource;
  if (!start || !end || !(start.totalReturnIndex > 0) || !(end.totalReturnIndex > 0) ||
    !sourcePresent(start.source ?? source) || !sourcePresent(end.source ?? source) ||
    (instant(startDate) - instant(start.date)) / 86400000 > 7 || (instant(endDate) - instant(end.date)) / 86400000 > 7) return null;
  return { value: end.totalReturnIndex / start.totalReturnIndex - 1, evidence: [start, end].map(b => ({ key: 'totalReturnIndex', value: b.totalReturnIndex, periodEnd: day(b.date), availableAt: b.availableAt ?? `${day(b.date)}T23:59:59.999Z`, source: b.source ?? source })) };
}
function evaluateValueMomentum(context) {
  const id = 'value_plus_momentum', eligible = [], rejections = [];
  for (const security of context.securities ?? []) {
    const book = selectPITFact(security, KEYS.bookEquity, context.asOf, { annual: true, maxPeriodEnd: monthsBefore(context.asOf, 6) });
    const market = marketEquity(security, context.asOf), momentum = momentumSignal(security, context.asOf);
    if (!book || !market || !momentum) { rejections.push(rejection(security, 'MISSING_PIT_FACTS', [!book && 'SIX_MONTH_LAGGED_ANNUAL_BOOK', !market && 'PIT_MARKET_EQUITY', !momentum && 'MOM2_12_TOTAL_RETURN_HISTORY'].filter(Boolean))); continue; }
    if (!(book.value > 0)) { rejections.push(rejection(security, 'NONPOSITIVE_BOOK_EQUITY')); continue; }
    eligible.push({ id: identifier(security), ticker: security.ticker ?? identifier(security), valueSignal: book.value / market.value, momentumSignal: momentum.value, evidence: [book, ...market.evidence, ...momentum.evidence] });
  }
  if (eligible.length < 2) return result(id, context, [], eligible, rejections, 'INSUFFICIENT_SLEEVE_REFERENCE_UNIVERSE');
  const valueRanks = ranks(eligible, 'valueSignal'), momentumRanks = ranks(eligible, 'momentumSignal'), meanRank = (eligible.length + 1) / 2;
  const sumValue = eligible.reduce((n, r) => n + Math.max(0, valueRanks.get(r.id) - meanRank), 0);
  const sumMomentum = eligible.reduce((n, r) => n + Math.max(0, momentumRanks.get(r.id) - meanRank), 0);
  if (!(sumValue > 0 && sumMomentum > 0)) return result(id, context, [], eligible, rejections, 'DEGENERATE_CENTERED_RANK_SLEEVE');
  const targets = eligible.map(r => {
    const valueWeight = Math.max(0, valueRanks.get(r.id) - meanRank) / sumValue;
    const momentumWeight = Math.max(0, momentumRanks.get(r.id) - meanRank) / sumMomentum;
    return target(r, (valueWeight + momentumWeight) / 2, { value: r.valueSignal, momentum: r.momentumSignal }, [trace('Separate positive centered-rank long sleeves; 50/50 COMBO', r.evidence, FUNDAMENTAL_RULES[id].sources, { valueWeight, momentumWeight, meanRank, valueRank: valueRanks.get(r.id), momentumRank: momentumRanks.get(r.id) })]);
  }).filter(r => r.weight > 0);
  return result(id, context, targets, eligible, rejections);
}

const evaluators = { gross_profitability_novy_marx: evaluateGross, piotroski_value_fscore: evaluatePiotroski, greenblatt_magic_formula: evaluateMagic, value_plus_momentum: evaluateValueMomentum };
export function screenFundamental(strategyId, context) {
  if (!evaluators[strategyId]) throw new Error(`Unknown fundamental strategy: ${strategyId}`);
  if (!day(context?.asOf)) return result(strategyId, context ?? {}, [], [], [], 'INVALID_ASOF');
  const ids = (context.securities ?? []).map(identifier);
  if (ids.some(id => id == null) || new Set(ids).size !== ids.length) return result(strategyId, context, [], [], [], 'INVALID_OR_DUPLICATE_SECURITY_IDS');
  return evaluators[strategyId](context);
}

export const fundamentalMethods = Object.entries(FUNDAMENTAL_RULES).map(([id, rules]) => deepFreeze({
  id, parameters: rules, rules, sources: rules.sources.map(sourceId => SOURCE_MAP[sourceId]),
  fidelity: { classification: 'VU_ADAPTATION', originalReplication: false, paperReturnsInherited: false, confidence: id === 'greenblatt_magic_formula' ? 'LOW' : 'SOURCE_DEFINED_WITH_EXPLICIT_ADAPTATIONS', adaptations: rules.adaptations },
  portfolioSemantics: { rebalance: rules.rebalance, holdMonths: rules.holdMonths, signalAt: 'ASOF_CLOSE', execution: 'NEXT_SESSION_OR_LATER', longOnly: true, leverage: 1, noPriceStopsInvented: true, unconditionalSnapshot: true, runnerEnforcesCalendar: true },
  evaluate: context => screenFundamental(id, context),
}));

export default fundamentalMethods;
