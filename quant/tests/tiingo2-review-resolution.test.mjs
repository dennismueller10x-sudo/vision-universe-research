import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReviewCandidates, reviewIssuerNameKey, officialSecurityForm, clusterReviewRows } from '../../scripts/market/tiingo2-review-resolution.mjs';

const today = '2026-10-02';
function fixture({ ticker = 'CATL', name = 'Catalyst Acquisition Corp - Class A', officialName = 'Catalyst Acquisition Corp. - Class A Ordinary Share', actions = true, providerVenue = 'NASDAQ', venue = 'NASDAQ' } = {}) {
  const identity = { resolved: false, state: 'NEW_SECURITY', symbolCollision: false, staleAlias: false, wrongExchange: false, providerSymbolMatched: true, listingPeriodMatched: true, nameAgreement: true, explicitShareForm: false };
  const row = { ticker, securityId: `ref_${ticker}`, company_id: 'KEEP_COMPANY', shareClass: 'A', exchange: venue, startDate: '2026-09-17', active: true, instrument_type: 'SPAC', evidence: { identity, price: { historyValid: true, latestValid: true, latestDate: '2026-10-01', corporateActionValid: actions }, sec: { cik: '0001234567', available: false, pitValid: false }, factors: { materialized: false } } };
  return { candidateRows: [row], priorReviewRows: [{ ticker, decision: 'MANUAL_REVIEW', companyName: name, identity, reasonCodes: ['IDENTITY_UNRESOLVED', ...(!actions ? ['CORPORATE_ACTION_GATE_FAILED'] : [])], checks: { active: true, historyValid: true, latestValid: true, secMapped: true } }], officialRows: [{ ticker, name: officialName, exchange: venue, test: 'N', etf: 'N' }], providerMetadata: [{ ticker, name, exchangeCode: providerVenue, startDate: row.startDate }], asOf: today };
}

test('singular share technical resolution preserves every canonical identity and never publishes', () => {
  const input = fixture(), before = structuredClone(input);
  const result = resolveReviewCandidates(input);
  assert.equal(result.counts.autoResolved, 1);
  assert.equal(result.acceptedCandidates[0].securityId, before.candidateRows[0].securityId);
  assert.equal(result.acceptedCandidates[0].company_id, 'KEEP_COMPANY');
  assert.equal(result.acceptedCandidates[0].shareClass, 'A');
  assert.equal(result.rows[0].quantCanonicalReady, false);
  assert.equal(result.rows[0].corporateActionGateWaived, false);
  assert.deepEqual(input, before);
});

test('precise plural ADS form resolves without classifying domestic depositary shares as ADR', () => {
  const input = fixture({ ticker: 'BRBI', name: 'BRBI BR Partners S.A.', officialName: 'BRBI BR Partners S.A. - ADSs' });
  const r = resolveReviewCandidates(input);
  assert.equal(r.counts.autoResolved, 1);
  assert.equal(r.acceptedCandidates[0].instrument_type, 'ADR');
  assert.equal(officialSecurityForm({ ...input.officialRows[0], name: 'WaFd Inc - Depositary Shares' }).eligible, false);
  assert.equal(officialSecurityForm({ ...input.officialRows[0], name: 'Preferred Bank Common Stock' }).eligible, true);
  assert.equal(officialSecurityForm({ ...input.officialRows[0], name: 'Preferred Bank Preferred Stock' }).reject, true);
});

test('corporate-action failure, old listing generation and real issuer rename remain review', () => {
  const failed = fixture({ actions: false });
  assert.equal(resolveReviewCandidates(failed).rows[0].decision, 'MANUAL_REVIEW');
  assert.equal(resolveReviewCandidates(failed).overlays[0].candidate.evidence.price.corporateActionValid, false);
  const old = fixture(); old.providerMetadata[0].startDate = '2010-01-02';
  assert.equal(resolveReviewCandidates(old).counts.autoResolved, 0);
  const different = fixture(); different.providerMetadata[0].name = 'Different Mining Company';
  assert.equal(resolveReviewCandidates(different).counts.autoResolved, 0);
  const reused = fixture(); reused.candidateRows[0].evidence.identity.state = 'MANUAL_REVIEW';
  assert.equal(resolveReviewCandidates(reused).counts.autoResolved, 0);
});

test('recognized AMEX venue spelling can resolve; cross-venue or missing evidence cannot', () => {
  const equivalent = fixture({ providerVenue: 'NYSE AMERICAN', venue: 'AMEX' });
  assert.equal(resolveReviewCandidates(equivalent).counts.autoResolved, 1);
  assert.equal(resolveReviewCandidates(fixture({ providerVenue: 'NYSE' })).counts.autoResolved, 0);
  const missing = fixture(); missing.providerMetadata = [];
  assert.equal(resolveReviewCandidates(missing).counts.autoResolved, 0);
});

test('technical metadata correction cannot accept a colliding canonical ID or collapse share classes', () => {
  const input = fixture();
  input.baselineRows = [{ ticker: 'OTHER', securityId: input.candidateRows[0].securityId, shareClass: 'B' }];
  const result = resolveReviewCandidates(input);
  assert.equal(result.counts.autoResolved, 0);
  assert.ok(result.rows[0].reasonCodes.includes('SECURITY_ID_COLLISION'));
  assert.equal(result.overlays[0].candidate.shareClass, 'A');
});

test('arbitrary issuer hyphens cannot collapse distinct issuers into an identity agreement', () => {
  assert.notEqual(reviewIssuerNameKey('Alpha - Mining Corp'), reviewIssuerNameKey('Alpha - Biomedical Inc'));
  const input = fixture({ name: 'Alpha - Mining Corp', officialName: 'Alpha - Biomedical Inc - Common Stock' });
  input.candidateRows[0].evidence.identity.nameAgreement = false;
  assert.equal(resolveReviewCandidates(input).counts.autoResolved, 0);
  assert.equal(reviewIssuerNameKey('Catalyst Corp - Class A Ordinary Share'), reviewIssuerNameKey('Catalyst Corporation - Class A'));
});

test('conflicting duplicate candidate, exchange and provider rows fail closed regardless of input order', () => {
  for (const field of ['candidateRows', 'officialRows', 'providerMetadata']) {
    const input = fixture();
    const duplicate = structuredClone(input[field][0]);
    if (field === 'candidateRows') duplicate.startDate = '2010-01-02';
    else duplicate.name = 'Different Issuer Inc - Common Stock';
    input[field].push(duplicate);
    const a = resolveReviewCandidates(input);
    input[field].reverse();
    const b = resolveReviewCandidates(input);
    assert.deepEqual(a, b, field);
    for (const r of [a, b]) {
      assert.equal(r.counts.autoResolved, 0, field);
      assert.equal(r.rows[0].decision, 'MANUAL_REVIEW', field);
      assert.ok(r.rows[0].reasonCodes.includes('CONFLICTING_DUPLICATE_REVIEW_INPUT'), field);
      assert.equal(r.overlays.length, 0, field);
    }
  }
});

test('issuer words Rights, Preferred and ADR do not override an explicit common-stock descriptor', () => {
  const o = name => officialSecurityForm({ name, test: 'N', etf: 'N' });
  for (const name of ['Human Rights Corp Common Stock', 'ADR Industries Inc Common Stock', 'Preferred Apartment Communities Common Stock']) {
    assert.deepEqual(o(name), { eligible: true, type: 'EQUITY_COMMON', reason: 'EXPLICIT_COMMON_SHARE_SECURITY' }, name);
  }
  assert.equal(o('Issuer Corp - Warrants').reject, true);
  assert.equal(o('Issuer Corp Preferred Stock').reject, true);
  assert.equal(o('Issuer Corp - ADSs').type, 'ADR');
});

test('official debt and corporate units fail common policy without taking any existing member away', () => {
  for (const officialName of ['Abacus Global Management Inc 9.875% Fixed Rate Senior Notes due 2028', 'PPL Corporation Corporate Units']) {
    const input = fixture({ name: 'Abacus Global Management Inc', officialName });
    const result = resolveReviewCandidates(input);
    assert.equal(result.rows[0].decision, 'REJECT_WITH_REASON');
    assert.equal(result.acceptedCandidates.length, 0);
    assert.equal(result.overlays[0].candidate.securityId, input.candidateRows[0].securityId);
  }
});

test('reviewed closed-end wrapper requires exact listing and issuer bound primary evidence', () => {
  const input = fixture({ ticker: 'RVI', name: 'Robinhood Ventures Fund I', officialName: 'Robinhood Ventures Fund I Common Shares of Beneficial Interest' });
  input.reviewedSecurityForms = [{ ticker: 'RVI', issuerName: input.providerMetadata[0].name, exchange: 'NASDAQ', startDate: '2026-09-17', source: 'ISSUER_PRIMARY', reviewed: true, asOf: today, url: 'https://www.robinhood.com/', instrumentType: 'CEF' }];
  assert.equal(resolveReviewCandidates(input).rows[0].decision, 'REJECT_WITH_REASON');
  input.reviewedSecurityForms[0].startDate = '2010-01-02';
  assert.equal(resolveReviewCandidates(input).rows[0].decision, 'MANUAL_REVIEW');
  input.reviewedSecurityForms = [];
  input.candidateRows[0].evidence.identity.resolved = true;
  assert.equal(resolveReviewCandidates(input).rows[0].decision, 'MANUAL_REVIEW');
});

test('148-style report remains complete and deterministic with absent private evidence', () => {
  const rows = Array.from({ length: 148 }, (_, i) => ({ ticker: `X${i}`, decision: 'MANUAL_REVIEW', reasonCodes: ['CORPORATE_ACTION_GATE_FAILED'], identity: { resolved: true }, checks: {} }));
  const result = resolveReviewCandidates({ priorReviewRows: rows, asOf: today });
  assert.equal(result.counts.reviewed, 148);
  assert.equal(result.counts.manualReview, 148);
  assert.equal(result.rows.every(r => r.reasonCodes.includes('PRIVATE_CANDIDATE_EVIDENCE_REQUIRED')), true);
  assert.equal(clusterReviewRows(rows)[0].count, 148);
  assert.deepEqual(result, resolveReviewCandidates({ priorReviewRows: [...rows].reverse(), asOf: today }));
  assert.notEqual(reviewIssuerNameKey('MAKO Surgical Corp'), reviewIssuerNameKey('Mako Mining Corp'));
});
