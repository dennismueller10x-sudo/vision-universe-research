import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePreviousFiscalPeriod} from '../research/certification/fiscal-period-links.mjs';

const DAY = 86400000;
const cutoff = {formationCutoffUTC: '2025-06-30T20:00:00Z'};
const sha256 = 'a'.repeat(64);
const evidence = accession => ({url: `https://www.sec.gov/Archives/edgar/data/123456/${accession.replaceAll('-', '')}/filing.htm`, sha256, locator: 'Original DEI and current annual context'});
const security = links => ({id: 'SYNTHETIC_SECURITY', issuerCik: '0000123456', fiscalPeriodLinks: links});
const duration = (start, end) => (Date.parse(end) - Date.parse(start)) / DAY + 1;
function link(current, previous, currentFiscalYear = 2024) {
  const currentStart = new Date(Date.parse(previous + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
  const previousStart = new Date(Date.parse(previous + 'T00:00:00Z') - 364 * DAY).toISOString().slice(0, 10);
  return {securityId: 'SYNTHETIC_SECURITY', issuerCik: '0000123456', currentPeriodEnd: current, previousPeriodEnd: previous,
    currentFiscalYear, previousFiscalYear: currentFiscalYear - 1,
    currentAccession: `0000123456-${String(currentFiscalYear + 1).slice(-2)}-000001`,
    previousAccession: `0000123456-${String(currentFiscalYear).slice(-2)}-000001`,
    currentAcceptedAt: `${currentFiscalYear + 1}-03-01T12:00:00Z`, previousAcceptedAt: `${currentFiscalYear}-03-01T12:00:00Z`,
    knownFrom: `${currentFiscalYear + 1}-03-01T12:00:00Z`, currentPeriodStart: currentStart, previousPeriodStart: previousStart,
    currentForm: '10-K', previousForm: '10-K', currentDocumentPeriodEnd: current, previousDocumentPeriodEnd: previous,
    currentFiscalPeriodId: `ORIGINAL_FY_${currentFiscalYear}`, previousFiscalPeriodId: `ORIGINAL_FY_${currentFiscalYear - 1}`,
    source: {current: evidence(`0000123456-${String(currentFiscalYear + 1).slice(-2)}-000001`), previous: evidence(`0000123456-${String(currentFiscalYear).slice(-2)}-000001`)}, certification: {originalAnnual: true, fiscalLineageVerified: true,
      fiscalYearMethod: 'DEI_CURRENT_REPORT_FOCUS_ONLY', currentDurationDays: duration(currentStart, current), previousDurationDays: duration(previousStart, previous)}};
}

test('actual consecutive fiscal periods support 53-week and leap-year ends without renamed dates', () => {
  for (const [current, previous, fiscalYear = 2024] of [['2024-12-28', '2023-12-30'], ['2024-02-29', '2023-02-28'], ['2024-12-31', '2023-12-31'], ['2022-12-31', '2021-12-25', 2022]]) {
    const item = link(current, previous, fiscalYear), input = security([item]), before = structuredClone(input);
    const result = resolvePreviousFiscalPeriod(input, current, cutoff);
    assert.equal(result.status, 'CERTIFIED'); assert.equal(result.periodEnd, previous);
    assert.deepEqual(input, before); assert.deepEqual(result.links[0], item);
  }
});

test('two-step previous FY chain preserves original report and actual fiscal boundaries', () => {
  const parent = link('2024-12-28', '2023-12-30'), child = link('2023-12-30', '2022-12-31', 2023);
  parent.previousPeriodStart = child.currentPeriodStart;
  parent.certification.previousDurationDays = child.certification.currentDurationDays;
  const input = security([parent, child]);
  assert.equal(resolvePreviousFiscalPeriod(input, parent.currentPeriodEnd, {...cutoff, steps: 2}).periodEnd, '2022-12-31');
  child.currentAccession = '0000123456-24-000002';
  child.source.current = evidence(child.currentAccession);
  assert.equal(resolvePreviousFiscalPeriod(input, parent.currentPeriodEnd, {...cutoff, steps: 2}).reason, 'FISCAL_LINK_CHAIN_SOURCE_CONFLICT');
});

test('unknown lineage never falls back to subtracting a calendar year or a nearest date', () => {
  assert.equal(resolvePreviousFiscalPeriod(security([]), '2024-12-31', cutoff).reason, 'FISCAL_PERIOD_LINK_UNSUPPORTED');
  const input = security([link('2024-12-28', '2023-12-30')]);
  assert.equal(resolvePreviousFiscalPeriod(input, '2024-12-31', cutoff).status, 'BLOCKED');
  assert.equal(resolvePreviousFiscalPeriod(input, '2024-12-28', {...cutoff, steps: 2}).status, 'BLOCKED');
});

test('explicit formation cutoff rejects date-only and future acceptance, retaining actual timestamps', () => {
  const item = link('2024-12-31', '2023-12-31'), input = security([item]);
  for (const formationCutoffUTC of ['2025-06-30', '2025-06-30T24:00:00Z', '2025-06-30T20:00:00']) {
    assert.equal(resolvePreviousFiscalPeriod(input, item.currentPeriodEnd, {formationCutoffUTC}).reason, 'EXPLICIT_UTC_FORMATION_CUTOFF_REQUIRED');
  }
  const before = {...cutoff, formationCutoffUTC: '2025-03-01T11:59:59Z'};
  assert.equal(resolvePreviousFiscalPeriod(input, item.currentPeriodEnd, before).status, 'BLOCKED');
  assert.equal(resolvePreviousFiscalPeriod(input, item.currentPeriodEnd, {formationCutoffUTC: item.currentAcceptedAt}).status, 'CERTIFIED');
  item.knownFrom = '2024-12-31T12:00:00Z';
  assert.equal(resolvePreviousFiscalPeriod(input, item.currentPeriodEnd, cutoff).reason, 'FISCAL_LINK_ACCEPTANCE_OR_KNOWN_FROM_INVALID');
});

test('future contradictory amendments cannot poison or backfill historical lineage', () => {
  const original = link('2024-12-31', '2023-12-31');
  const future = {...structuredClone(original), currentAcceptedAt: '2025-07-01T12:00:00Z', knownFrom: '2025-07-01T12:00:00Z',
    previousFiscalYear: 1999, currentForm: '10-K/A'};
  const input = security([original]), result = resolvePreviousFiscalPeriod(input, original.currentPeriodEnd, cutoff);
  input.fiscalPeriodLinks.push(future);
  assert.deepEqual(resolvePreviousFiscalPeriod(input, original.currentPeriodEnd, cutoff), result);
  assert.equal(resolvePreviousFiscalPeriod(input, original.currentPeriodEnd, {formationCutoffUTC: future.knownFrom}).status, 'BLOCKED');
});

test('visible conflicting originals, source mismatch, unknown identity and undocumented annual labels block', () => {
  const original = link('2024-12-31', '2023-12-31');
  const duplicate = security([original, structuredClone(original)]);
  assert.equal(resolvePreviousFiscalPeriod(duplicate, original.currentPeriodEnd, cutoff).status, 'CERTIFIED');
  duplicate.fiscalPeriodLinks[1].currentAccession = '0000123456-25-000002';
  duplicate.fiscalPeriodLinks[1].source.current = evidence(duplicate.fiscalPeriodLinks[1].currentAccession);
  assert.equal(resolvePreviousFiscalPeriod(duplicate, original.currentPeriodEnd, cutoff).reason, 'FISCAL_LINK_VISIBLE_ORIGINAL_CONFLICT');
  for (const edit of [x => {x.issuerCik = '999999';}, x => {x.securityId = 'OTHER';},
    x => {x.currentDocumentPeriodEnd = '2023-12-31';}, x => {x.certification.fiscalYearMethod = 'COMPARATIVE_COMPANYFACTS_FY';},
    x => {x.certification.originalAnnual = false;}, x => {x.currentForm = '10-K/A';},
    x => {x.source.current.sha256 = '';}, x => {x.source.current.url = 'https://marketing.example/filing';},
    x => {x.source.current.url = x.source.current.url.replace('/123456/', '/999999/');},
    x => {x.source.previous.url = x.source.current.url;}]) {
    const changed = structuredClone(original); edit(changed);
    assert.equal(resolvePreviousFiscalPeriod(security([changed]), changed.currentPeriodEnd, cutoff).status, 'BLOCKED');
  }
  assert.equal(resolvePreviousFiscalPeriod({...security([original]), issuerCikConflict: true}, original.currentPeriodEnd, cutoff).status, 'BLOCKED');
});

test('stub/transition years and unsupported chain lengths cannot be silently interpreted as full fiscal years', () => {
  for (const previous of ['2024-06-30', '2022-12-31']) {
    const item = link('2024-12-31', previous);
    assert.equal(resolvePreviousFiscalPeriod(security([item]), item.currentPeriodEnd, cutoff).reason, 'FISCAL_LINK_NOT_CONSECUTIVE_OR_STUB');
  }
  assert.equal(resolvePreviousFiscalPeriod(security([]), '2024-12-31', {...cutoff, steps: 3}).reason, 'FISCAL_LINK_STEPS_UNSUPPORTED');
});

test('later original-period conflict marker blocks only after its actual publication', () => {
  const original = link('2024-12-31', '2023-12-31');
  const marker = {securityId: 'SYNTHETIC_SECURITY', issuerCik: '0000123456', currentPeriodEnd: original.currentPeriodEnd,
    knownFrom: '2025-07-01T12:00:00Z', status: 'BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT',
    certification: {originalAnnual: false, fiscalLineageVerified: false}};
  const input = security([original, marker]);
  assert.equal(resolvePreviousFiscalPeriod(input, original.currentPeriodEnd, cutoff).status, 'CERTIFIED');
  assert.equal(resolvePreviousFiscalPeriod(input, original.currentPeriodEnd, {formationCutoffUTC: marker.knownFrom}).reason, 'BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT');
});
