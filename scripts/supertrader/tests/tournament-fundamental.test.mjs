import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNDAMENTAL_RULES, fundamentalMethods, selectPITFact, screenFundamental } from '../research/tournament/engines/fundamental.mjs';

const ASOF = '2025-06-30';
const source = { provider: 'synthetic-independent-fixture', accession: 'fixture-original-filing' };
const fact = (key, value, periodEnd = '2024-12-31', extra = {}) => ({ key, value, periodEnd, frequency: 'ANNUAL', availableAt: `${Number(periodEnd.slice(0, 4)) + 1}-03-15`, source, unit: 'USD', certification: { concept: key, normalized: true }, ...extra });
const market = (value, periodEnd = ASOF) => fact('marketEquity', value, periodEnd, { frequency: 'INSTANT', availableAt: periodEnd });
const sic = value => fact('sic', value, '2024-12-31', { frequency: 'INSTANT', unit: 'CODE' });
const security = (id, fundamentals) => ({ id, ticker: id, fundamentals });

function grossFixture() {
  return [100, 150, 200, 300, 300].map((revenue, i) => security(`G${i + 1}`, [fact('revenue', revenue), fact('cogs', 50), fact('assets', 100), market((i + 1) * 20), sic(2000)]));
}
function goodFScoreFacts() {
  const facts = [];
  for (const row of [
    ['2022-12-31', { assets: 100, revenue: 100, cogs: 60, incomeBeforeExtraordinaryItems: 10, longTermDebt: 50, currentAssets: 50, currentLiabilities: 50 }],
    ['2023-12-31', { assets: 120, revenue: 120, cogs: 60, incomeBeforeExtraordinaryItems: 12, longTermDebt: 40, currentAssets: 50, currentLiabilities: 40 }],
    ['2024-12-31', { assets: 140, revenue: 160, cogs: 60, incomeBeforeExtraordinaryItems: 20, operatingCashFlow: 30, longTermDebt: 30, currentAssets: 60, currentLiabilities: 30 }],
  ]) for (const [key, value] of Object.entries(row[1])) facts.push(fact(key, value, row[0]));
  facts.push(fact('noCommonEquityIssued', true, '2024-12-31', { unit: 'BOOLEAN' }));
  return facts;
}
function piotroskiFixture() {
  return [10, 20, 30, 40, 100].map((book, i) => security(`P${i + 1}`, [...goodFScoreFacts(), fact('bookEquity', book), market(100, '2024-12-31')]));
}
function magicFixture(count = 20) {
  return Array.from({ length: count }, (_, i) => security(`M${String(i + 1).padStart(2, '0')}`, [
    fact('ebit', 50), fact('totalDebt', 20), fact('cash', 10), fact('currentAssets', 50), fact('currentLiabilities', 20), fact('currentDebt', 10), fact('netPPE', 40), market(100 + i * 10), sic(2000),
  ]));
}
function comboFixture() {
  const momentum = [4, 3, 2, 1];
  return [10, 20, 30, 40].map((book, i) => ({
    ...security(`V${i + 1}`, [fact('bookEquity', book), market(100)]),
    priceSource: source,
    bars: [
      { date: '2024-06-28', close: 100, totalReturnIndex: 100 },
      { date: '2025-05-30', close: 100 + momentum[i] * 10, totalReturnIndex: 100 + momentum[i] * 10 },
      // Skipped June month reverses all rankings if mistakenly included.
      { date: ASOF, close: 1000 - i * 200, totalReturnIndex: 1000 - i * 200 },
    ],
  }));
}

test('source rules are immutable; each method declares source, fidelity and runner-owned schedule', () => {
  assert.equal(fundamentalMethods.length, 4);
  assert.throws(() => { FUNDAMENTAL_RULES.piotroski_value_fscore.minimumFScore = 5; }, TypeError);
  for (const method of fundamentalMethods) {
    assert.equal(method.fidelity.classification, 'VU_ADAPTATION');
    assert.equal(method.fidelity.paperReturnsInherited, false);
    assert(method.sources.every(s => s.url.startsWith('https://') && s.locator));
    assert.equal(method.portfolioSemantics.execution, 'NEXT_SESSION_OR_LATER');
    assert.equal(method.portfolioSemantics.runnerEnforcesCalendar, true);
  }
});

test('PIT picks the original visible vintage and only admits an amendment after publication', () => {
  const original = fact('assets', 100), amended = fact('assets', 900, '2024-12-31', { availableAt: '2025-07-01' });
  const s = security('A', [amended, original]);
  assert.equal(selectPITFact(s, 'assets', ASOF).value, 100);
  assert.equal(selectPITFact(s, 'assets', '2025-07-01').value, 900);
  assert.equal(selectPITFact(s, 'assets', '2025-03-14'), null);
});

test('PIT rejects undated, unproven, currentlatest, future-period and same-time contradictory facts', () => {
  for (const broken of [
    { availableAt: undefined, date: undefined, filedAt: undefined }, { source: null }, { periodEnd: undefined },
    { origin: 'currentlatest' }, { latest: true }, { periodEnd: '2026-12-31' }, { availableAt: '2025-07-01' },
  ]) assert.equal(selectPITFact(security('A', [fact('assets', 100, '2024-12-31', broken)]), 'assets', ASOF), null);
  assert.equal(selectPITFact(security('A', [fact('assets', 100), fact('assets', 200)]), 'assets', ASOF), null);
  assert.equal(selectPITFact(security('A', [fact('assets', 100)]), 'assets', '2025-02-31'), null);
});

test('PIT requires certified economic concept and exact normalized units; currency is insufficient', () => {
  for (const broken of [
    { certification: undefined }, { certification: { concept: 'revenue', normalized: true } },
    { certification: { concept: 'assets', normalized: false } }, { unit: undefined, currency: 'USD' },
    { unit: 'USD_MILLIONS' }, { unit: 'EUR' }, { value: true },
  ]) assert.equal(selectPITFact(security('A', [fact('assets', 100, '2024-12-31', broken)]), 'assets', ASOF), null);
  assert.equal(selectPITFact(security('A', [sic(2000)]), 'sic', ASOF).unit, 'CODE');
  assert.equal(selectPITFact(security('A', [sic(2000.5)]), 'sic', ASOF), null);
  assert.equal(selectPITFact(security('A', [fact('noCommonEquityIssued', 1, '2024-12-31', { unit: 'BOOLEAN' })]), 'noCommonEquityIssued', ASOF), null);
  const selected = selectPITFact(security('A', [fact('assets', 100)]), 'assets', ASOF);
  assert.deepEqual(selected.certification, { concept: 'assets', normalized: true });
});

test('date-only publication is conservatively unavailable intraday, while exact amendment timestamps remain causal', () => {
  const original = fact('assets', 100, '2024-12-31', { availableAt: '2025-03-15' });
  const amendment = fact('assets', 200, '2024-12-31', { availableAt: '2025-03-16T16:30:00Z' });
  const s = security('A', [original, amendment]);
  assert.equal(selectPITFact(s, 'assets', '2025-03-15T16:00:00Z'), null);
  assert.equal(selectPITFact(s, 'assets', '2025-03-15').value, 100);
  assert.equal(selectPITFact(s, 'assets', '2025-03-16T16:29:59Z').value, 100);
  assert.equal(selectPITFact(s, 'assets', '2025-03-16T16:30:00Z').value, 200);
});

test('latest consumer objects never supply historical features', () => {
  const securities = Array.from({ length: 25 }, (_, i) => ({ id: `L${i}`, ticker: `L${i}`, currentlatest: { revenue: 100, cogs: 20, assets: 200, bookEquity: 100, fScore: 9, ebit: 50, marketCap: 100 } }));
  for (const method of fundamentalMethods) {
    const result = method.evaluate({ asOf: ASOF, securities });
    assert.equal(result.status, 'BLOCKED_DATA');
    assert.deepEqual(result.targets, []);
  }
});

test('gross profitability uses independent upper-quintile selection and PIT market weights', () => {
  const result = screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities: grossFixture() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.targets.map(t => t.id), ['G4', 'G5']);
  assert.equal(result.targets[0].score, 2.5);
  assert.equal(result.targets[0].weight, 4 / 9);
  assert.equal(result.targets[1].weight, 5 / 9);
  assert(result.targets.every(t => t.ruleTrace[0].data.every(f => f.source && f.availableAt <= ASOF)));
});

test('gross blocks unmatched accounting periods, future COGS and mixed monetary units', () => {
  for (const edit of [
    f => { f.periodEnd = '2023-12-31'; },
    f => { f.availableAt = '2025-07-01'; },
    f => { f.unit = 'USD_MILLIONS'; },
  ]) {
    const securities = grossFixture();
    securities.forEach(s => edit(s.fundamentals.find(f => f.key === 'cogs')));
    const result = screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities });
    assert.equal(result.status, 'BLOCKED_DATA');
    assert.equal(result.eligibility.selectedCount, 0);
  }
});

test('future facts appended to an asOf portfolio do not change selection, scores or provenance', () => {
  const securities = grossFixture(), baseline = screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities });
  for (const s of securities) s.fundamentals.push(fact('revenue', 999999, '2024-12-31', { availableAt: '2025-07-01' }));
  assert.deepEqual(screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities }), baseline);
});

test('Piotroski retains original value condition before evaluating independent nine-signal score', () => {
  const result = screenFundamental('piotroski_value_fscore', { asOf: ASOF, securities: piotroskiFixture() });
  assert.equal(result.status, 'OK');
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].id, 'P5');
  assert.equal(result.targets[0].score, 9);
  assert.equal(result.targets[0].weight, 1);
  assert.equal(result.targets[0].ruleTrace[0].referenceCount, 5);
  assert.equal(result.rejections.filter(r => r.reason === 'OUTSIDE_HIGH_BOOK_TO_MARKET_QUINTILE').length, 4);
});

test('missing high-value F-score does not promote fully scored cheapness outsiders', () => {
  const securities = piotroskiFixture();
  securities[4].fundamentals = securities[4].fundamentals.filter(f => f.key !== 'operatingCashFlow');
  const result = screenFundamental('piotroski_value_fscore', { asOf: ASOF, securities });
  assert.equal(result.status, 'BLOCKED_DATA');
  assert.deepEqual(result.targets, []);
  assert.equal(result.rejections.filter(r => r.reason === 'OUTSIDE_HIGH_BOOK_TO_MARKET_QUINTILE').length, 4);
});

test('Piotroski declines score7 and reports an empty valid sleeve rather than inventing trades', () => {
  const securities = piotroskiFixture();
  const currentCFO = securities[4].fundamentals.find(f => f.key === 'operatingCashFlow');
  currentCFO.value = 20; // equality fails the strict CFO > income test
  securities[4].fundamentals.find(f => f.key === 'noCommonEquityIssued').value = false;
  const result = screenFundamental('piotroski_value_fscore', { asOf: ASOF, securities });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.targets, []);
  assert(result.rejections.some(r => r.id === 'P5' && r.reason === 'FSCORE_BELOW_8'));
});

test('share-count dilution and latest net income cannot substitute missing original F-score facts', () => {
  const securities = piotroskiFixture(), s = securities[4];
  s.fundamentals = s.fundamentals.filter(f => !['noCommonEquityIssued', 'incomeBeforeExtraordinaryItems'].includes(f.key));
  s.fundamentals.push(fact('sharesOutstanding', 10), fact('netIncome', 20));
  const result = screenFundamental('piotroski_value_fscore', { asOf: ASOF, securities });
  assert.equal(result.status, 'BLOCKED_DATA');
  assert(result.rejections.find(r => r.id === 'P5').missing.includes('GROSS_COMMON_EQUITY_ISSUANCE_EVIDENCE'));
});

test('Magic Formula enforces diversification and deterministic separate combined ranks', () => {
  assert.equal(screenFundamental('greenblatt_magic_formula', { asOf: ASOF, securities: magicFixture(19) }).status, 'BLOCKED_DATA');
  const result = screenFundamental('greenblatt_magic_formula', { asOf: ASOF, securities: magicFixture(35) });
  assert.equal(result.status, 'OK');
  assert.equal(result.targets.length, 30);
  assert.equal(result.targets[0].id, 'M01');
  assert.equal(result.targets[29].id, 'M30');
  assert(result.targets.every(t => t.weight === 1 / 30));
  assert(result.targets.every(t => t.ruleTrace[0].unreadAppendix && t.ruleTrace[0].confidence === 'LOW'));
});

test('Magic Formula never treats missing debt/cash as zero and excludes financials/utilities', () => {
  const securities = magicFixture();
  securities[0].fundamentals = securities[0].fundamentals.filter(f => f.key !== 'totalDebt');
  securities[1].fundamentals.find(f => f.key === 'sic').value = 6100;
  securities[2].fundamentals.find(f => f.key === 'sic').value = 4911;
  const result = screenFundamental('greenblatt_magic_formula', { asOf: ASOF, securities });
  assert.equal(result.status, 'BLOCKED_DATA');
  assert(result.rejections.some(r => r.id === 'M01' && r.missing.includes('totalDebt')));
  assert.equal(result.rejections.filter(r => r.reason === 'FINANCIAL_OR_UTILITY_EXCLUDED').length, 2);
});

test('value+momentum combines disjoint long sleeves; it does not require intersection', () => {
  const result = screenFundamental('value_plus_momentum', { asOf: ASOF, securities: comboFixture() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.targets.map(t => t.id), ['V1', 'V2', 'V3', 'V4']);
  assert.deepEqual(result.targets.map(t => t.weight), [0.375, 0.125, 0.125, 0.375]);
  assert.equal(result.targets[0].ruleTrace[0].valueWeight, 0);
  assert.equal(result.targets[0].ruleTrace[0].momentumWeight, 0.75);
  assert.equal(result.targets[3].ruleTrace[0].valueWeight, 0.75);
  assert.equal(result.targets[3].ruleTrace[0].momentumWeight, 0);
});

test('six-month value lag is respected midmonth and price-only history never masquerades as total return', () => {
  const securities = comboFixture();
  assert.equal(screenFundamental('value_plus_momentum', { asOf: '2025-06-15', securities }).status, 'BLOCKED_DATA');
  securities.forEach(s => s.bars.forEach(b => { delete b.totalReturnIndex; }));
  const result = screenFundamental('value_plus_momentum', { asOf: ASOF, securities });
  assert.equal(result.status, 'BLOCKED_DATA');
  assert(result.rejections.every(r => r.missing.includes('MOM2_12_TOTAL_RETURN_HISTORY')));
});

test('duplicate securities cannot receive two allocations and future prices cannot supply market equity', () => {
  assert.equal(screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities: [...grossFixture(), grossFixture()[0]] }).status, 'BLOCKED_DATA');
  const securities = grossFixture();
  for (const s of securities) {
    s.fundamentals = s.fundamentals.filter(f => f.key !== 'marketEquity');
    s.fundamentals.push(fact('sharesOutstanding', 10, '2025-06-01', { frequency: 'INSTANT', availableAt: '2025-06-01', unit: 'shares' }));
    s.priceSource = source;
    s.bars = [{ date: ASOF, close: 100, availableAt: '2025-07-01' }];
  }
  assert.equal(screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities }).status, 'BLOCKED_DATA');
});

test('all share-times-price proxies remain blocked, including adjusted closes, stale shares and weighted-average concepts', () => {
  for (const sharesExtra of [
    { periodEnd: '2024-03-31', certification: { concept: 'sharesOutstanding', normalized: true, basis: 'ACTUAL_POINT_IN_TIME' } },
    { periodEnd: ASOF, certification: { concept: 'sharesOutstanding', normalized: true, basis: 'WEIGHTED_AVERAGE' } },
    { periodEnd: ASOF, certification: { concept: 'sharesOutstanding', normalized: true, basis: 'ACTUAL_POINT_IN_TIME' } },
  ]) {
    const securities = grossFixture();
    for (const s of securities) {
      s.fundamentals = s.fundamentals.filter(f => f.key !== 'marketEquity');
      s.fundamentals.push(fact('sharesOutstanding', 10, ASOF, { frequency: 'INSTANT', availableAt: ASOF, unit: 'SHARES', ...sharesExtra }));
      s.priceSource = source;
      s.bars = [{ date: ASOF, close: 100, priceBasis: 'SPLIT_ADJUSTED', source }];
    }
    assert.equal(screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities }).status, 'BLOCKED_DATA');
  }
  const weighted = fact('sharesOutstanding', 10, ASOF, { availableAt: ASOF, unit: 'SHARES', certification: { concept: 'sharesOutstanding', normalized: true, basis: 'WEIGHTED_AVERAGE' } });
  assert.equal(selectPITFact(security('A', [weighted]), 'sharesOutstanding', ASOF), null);
});

test('uncertified or wrongly denominated direct market equity never supplies a portfolio', () => {
  for (const change of [{ certification: undefined }, { unit: undefined }, { unit: 'USD_MILLIONS' }, { certification: { normalized: true, concept: 'weightedAverageShares' } }]) {
    const securities = grossFixture();
    securities.forEach(s => Object.assign(s.fundamentals.find(f => f.key === 'marketEquity'), change));
    assert.equal(screenFundamental('gross_profitability_novy_marx', { asOf: ASOF, securities }).status, 'BLOCKED_DATA');
  }
});
