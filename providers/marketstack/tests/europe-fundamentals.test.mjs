import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { evaluateIdentityEvidence, evaluateFundamentals, evaluateQuantReadiness, validISIN, validLEI } from '../../../scripts/marketstack/europe-fundamentals.mjs';
const { securityIdForTicker } = createRequire(import.meta.url)('../../../core/identity.js');
const mapping = { companyId: 'fixture-company', issuerId: 'fixture-issuer', lei: 'IOG4E947OATN0KJYSD45', securityId: securityIdForTicker('MC.PA'),
  isin: 'FR0000121014', shareClassId: 'fixture-common', listingId: 'fixture-listing', mic: 'XPAR', listingCurrency: 'EUR',
  reportingEntityId: 'fixture-reporting', reportingEntityLei: 'IOG4E947OATN0KJYSD45', reportingCurrency: 'EUR' };
// Resolver attestations are synthetic tests, not production proof.
const proof = () => ({ id: 'fixture-proof', kind: 'ESEF', verified: true, url: 'https://example.org/official-fixture', sha256: 'a'.repeat(64), retrievedAt: '2026-10-01T12:00:00Z' });
const identityEvidence = () => ({ mapping: { ...mapping }, proofs: [{ ...proof(), fields: [...Object.keys(mapping), 'reportingRelationship'] }],
  reportingRelationship: { verified: true, kind: 'SAME_ENTITY', issuerLei: mapping.lei, reportingEntityLei: mapping.lei, proofId: 'fixture-proof' } });
const evidence = () => ({ identity: identityEvidence(), filings: [{ source: proof(), issuerLei: mapping.lei, reportingEntityLei: mapping.lei, reportingEntityId: mapping.reportingEntityId,
  isin: mapping.isin, shareClassId: mapping.shareClassId, reportingCurrency: 'EUR', periodEnd: '2025-12-31', filed: '2026-03-20', availableAt: '2026-03-20', policy: 'AS_REPORTED',
  metrics: { revenue: { value: 100, unit: 'EUR', concept: 'ifrs-full:Revenue', contextId: 'fixture-context', validated: true } } }],
  sharesBasis: { verified: true, proof: proof(), issuerLei: mapping.lei, securityId: mapping.securityId, isin: mapping.isin, shareClassId: mapping.shareClassId, basis: 'LOCAL_SHARE_CLASS', value: 10, asOf: '2025-12-31' },
  currencyBasis: { verified: true, basis: 'SAME_CURRENCY', reportingCurrency: 'EUR', priceCurrency: 'EUR' },
  engineInputCertificate: { verified: true, engine: 'fundamental-inputs-1.0.0', schema: 'vu-consumer-fundamentals-1.0.0', proof: proof(), securityId: mapping.securityId,
    isin: mapping.isin, shareClassId: mapping.shareClassId, requiredInputs: ['fixtureEngineInput'], rawInputs: { fixtureEngineInput: 2 }, missingInputs: [], asOf: '2026-10-01', periodEnd: '2025-12-31' } });
const options = { asOf: '2026-10-08' };
const ready = () => ({ identity: evaluateIdentityEvidence(mapping, identityEvidence()), prices: { valid: true, securityId: mapping.securityId, listingId: mapping.listingId, currency: 'EUR', freshness: 'CURRENT', adjustmentStatus: 'ADJUSTMENT_CERTIFIED' }, technical: { status: 'TECHNICAL_READY', securityId: mapping.securityId, listingId: mapping.listingId, currency: 'EUR', benchmarkValid: true, benchmarkRegion: 'EUROPE', benchmarkProvenance: { verified: true, provider: 'fixture-provider', sourceId: 'fixture-europe-benchmark' } } });

function fullEvidence() {
  const e = evidence(), years = [2020, 2021, 2022, 2023, 2024, 2025];
  const annual = Object.fromEntries(Object.entries({ revenue: 1000, eps_diluted: 1, free_cash_flow: 100, operating_income: 200,
    income_tax_expense: 40, pretax_income: 160, total_debt: 300, stockholders_equity: 700, cash_and_equivalents: 100,
    total_assets: 1500, net_income: 120, operating_cash_flow: 200 }).map(([metric, value]) => [metric, years.map((y, i) => [y, 'FY', `${y}-12-31`, value * (1 + i / 10), `${y + 1}-03-20`, 'fixture-acc', 0])]));
  const ends = ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31'];
  const quarterly = Object.fromEntries(Object.entries({ revenue: 300, gross_profit: 150, free_cash_flow: 30 }).map(([metric, value]) => [metric, ends.map((end, i) => [Number(end.slice(0, 4)), `Q${i % 4 + 1}`, end, value + i, '2026-03-20', 'fixture-acc', 0])]));
  const ttm = Object.fromEntries(Object.entries({ revenue: 1500, net_income: 180, operating_cash_flow: 300, gross_profit: 750, free_cash_flow: 150, operating_income: 300,
    income_tax_expense: 60, pretax_income: 240, total_debt: 450, cash_and_equivalents: 150, net_debt: 300, ebitda: 360, total_assets: 2250,
    stockholders_equity: 1050, shares_outstanding: 10 }).map(([metric, value]) => [metric, { end: '2025-12-31', v: value, filed: '2026-03-20', unit: metric === 'shares_outstanding' ? 'shares' : 'EUR', kind: 'TTM', fp: 'TTM' }]));
  const units = Object.fromEntries([...new Set([...Object.keys(annual), ...Object.keys(quarterly), ...Object.keys(ttm)])].map(metric => [metric, metric === 'shares_outstanding' ? 'shares' : metric === 'eps_diluted' ? 'EUR/shares' : 'EUR']));
  const consumerDocument = { schema: 'vu-consumer-fundamentals-1.0.0', dataSource: { provider: 'official-filings', isMock: false }, units, annual, quarterly, ttm };
  e.engineInputCertificate = { ...e.engineInputCertificate, consumerDocument, normalizedDocumentSha256: createHash('sha256').update(JSON.stringify(consumerDocument)).digest('hex'),
    documentIdentity: { ...mapping }, documentMappingVerified: true, profile: 'GENERIC', profileVerified: true, marketCap: 10000,
    marketCapBasis: { verified: true, securityId: mapping.securityId, listingId: mapping.listingId, currency: 'EUR', shares: 10, shareClassId: mapping.shareClassId, asOf: '2026-10-01' } };
  return e;
}

test('identifier checksums reject syntactically plausible corrupt identifiers', () => {
  assert.equal(validISIN(mapping.isin), true); assert.equal(validLEI(mapping.lei), true);
  assert.equal(validISIN('FR0000121015'), false); assert.equal(validLEI('IOG4E947OATN0KJYSD46'), false);
});
test('audited candidate fields cannot self-certify identity', () => {
  const r = evaluateIdentityEvidence(mapping); assert.equal(r.status, 'PARTIAL'); assert.equal(r.listingIdentityVerified, false);
  assert.equal(evaluateFundamentals(mapping, {}, options).status, 'UNKNOWN');
});
test('proof-backed company, class, listing and reporting identity is required', () => {
  assert.equal(evaluateIdentityEvidence(mapping, identityEvidence()).status, 'VERIFIED');
  const e = identityEvidence(); e.proofs[0].fields = e.proofs[0].fields.filter(f => f !== 'shareClassId');
  const r = evaluateIdentityEvidence(mapping, e); assert.equal(r.status, 'PARTIAL'); assert.equal(r.listingIdentityVerified, false);
});
test('issuer conflict, wrong checksum and ADR mapping block financial identity', () => {
  assert.equal(evaluateIdentityEvidence({ ...mapping, lei: '5493001KJTIIGC8Y1R12' }, identityEvidence()).status, 'BLOCKED');
  const e = identityEvidence(); e.mapping.isin = 'FR0000121015'; assert.equal(evaluateIdentityEvidence({}, e).status, 'BLOCKED');
  assert.equal(evaluateIdentityEvidence({ ...mapping, isAdr: true }, identityEvidence()).status, 'BLOCKED');
});
test('caller-chosen single engine input cannot certify full inputs or ranking admission', () => {
  const f = evaluateFundamentals(mapping, evidence(), options); assert.equal(f.status, 'PARTIAL'); assert.equal(f.engineInputsValid, false);
  const q = evaluateQuantReadiness({ ...ready(), fundamentals: f }); assert.equal(q.status, 'QUANT_PARTIAL');
  assert.equal(q.admittedToRanking, false); assert.equal(q.usPopulationModified, false); assert.equal(q.scoreProduced, false); assert.equal(f.pitEligibility, 'NOT_CERTIFIED');
});
test('source-certified canonical facts execute the actual existing engine before full readiness', () => {
  const f = evaluateFundamentals(mapping, fullEvidence(), options);
  assert.equal(f.engineInputsValid, true, JSON.stringify(f.missingEngineInputs)); assert.equal(f.status, 'VALIDATED');
  const q = evaluateQuantReadiness({ ...ready(), fundamentals: f }); assert.equal(q.status, 'QUANT_FULL'); assert.equal(q.admittedToRanking, false);
  const e = fullEvidence(); e.engineInputCertificate.consumerDocument.ttm.income_tax_expense.v = null;
  // A modified normalized document does not retain its original certificate.
  assert.equal(evaluateFundamentals(mapping, e, options).engineInputsValid, false);
  e.engineInputCertificate.normalizedDocumentSha256 = createHash('sha256').update(JSON.stringify(e.engineInputCertificate.consumerDocument)).digest('hex');
  assert.equal(evaluateFundamentals(mapping, e, options).engineInputsValid, false, 'actual missing ROIC inputs cannot be claimed back through certificate.rawInputs');
});
test('missing shares or wrong price currency preserves partial official facts', () => {
  const e = evidence(); delete e.sharesBasis;
  let f = evaluateFundamentals(mapping, e, options); assert.equal(f.status, 'PARTIAL'); assert.equal(f.validFilingCount, 1);
  assert.equal(evaluateQuantReadiness({ ...ready(), fundamentals: f }).status, 'QUANT_PARTIAL');
  const e2 = evidence(); e2.currencyBasis.priceCurrency = 'USD'; f = evaluateFundamentals(mapping, e2, options); assert.equal(f.status, 'PARTIAL'); assert.equal(f.currencyBasisValid, false);
});
test('provider financial facts, future availability and mixed entities are quarantined without altering raw facts', () => {
  const e = evidence(); e.filings[0].source.kind = 'MARKETSTACK'; const before = structuredClone(e);
  const f = evaluateFundamentals(mapping, e, options); assert.equal(f.validFilingCount, 0); assert.equal(f.quarantineCount, 1); assert.deepEqual(e, before); assert.deepEqual(f.quarantinedFilings[0].filing, e.filings[0]);
  const e2 = evidence(); e2.filings[0].availableAt = '2026-10-09'; assert.equal(evaluateFundamentals(mapping, e2, options).validFilingCount, 0);
  const e3 = evidence(); e3.filings[0].reportingEntityLei = '5493001KJTIIGC8Y1R12'; assert.equal(evaluateFundamentals(mapping, e3, options).validFilingCount, 0);
});
test('SEC sources require verified actual filer and local share class', () => {
  const e = evidence(); e.filings[0].source = { ...proof(), kind: 'SEC', cik: '0000000001' }; e.filings[0].cik = '0000000001';
  assert.equal(evaluateFundamentals(mapping, e, options).validFilingCount, 0);
  const candidate = { ...mapping, actualSecFiler: true, cik: '0000000001' };
  assert.equal(evaluateFundamentals(candidate, e, options).validFilingCount, 0);
  e.filings[0].securityBasis = 'LOCAL_SHARE_CLASS_VERIFIED'; assert.equal(evaluateFundamentals(candidate, e, options).validFilingCount, 1);
});
test('no fundamentals permits technical-only readiness with certified local price inputs', () => {
  const q = evaluateQuantReadiness({ ...ready(), fundamentals: evaluateFundamentals(mapping, {}, options) }); assert.equal(q.status, 'QUANT_TECHNICAL_ONLY');
  for (const field of ['identity', 'prices', 'technical']) { const input = ready(); input[field] = {}; assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED'); }
  const input = ready(); input.technical.benchmarkValid = false; assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED');
  input.technical.benchmarkValid = true; input.prices.adjustmentStatus = 'ADJUSTMENT_UNKNOWN'; assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED');
});
test('invalid dates, missing values and stale filings cannot certify full readiness', () => {
  assert.equal(evaluateFundamentals(mapping, evidence(), { asOf: '2026-02-30' }).status, 'INVALID');
  const e = evidence(); e.filings[0].metrics.revenue.value = null; assert.equal(evaluateFundamentals(mapping, e, options).validFilingCount, 0);
  const old = evidence(); old.filings[0].periodEnd = '2023-12-31'; old.sharesBasis.asOf = '2023-12-31'; old.engineInputCertificate.periodEnd = '2023-12-31';
  const f = evaluateFundamentals(mapping, old, options); assert.equal(f.status, 'PARTIAL'); assert.ok(f.reasons.includes('FUNDAMENTALS_STALE'));
});
test('proof hash, retrieval time, secure URL and official verification are mandatory', () => {
  for (const patch of [{ sha256: '' }, { verified: false }, { url: 'http://example.org/source' }, { retrievedAt: '2099-01-01T00:00:00Z' }]) {
    const e = identityEvidence(); Object.assign(e.proofs[0], patch); assert.equal(evaluateIdentityEvidence(mapping, e).status, 'PARTIAL');
  }
});
test('another company or share class cannot promote the requested listing to full or partial Quant', () => {
  const f = evaluateFundamentals(mapping, evidence(), options); const input = { ...ready(), fundamentals: f };
  input.identity.mapping = { ...input.identity.mapping, securityId: securityIdForTicker('FIXTURE') };
  input.prices.securityId = input.identity.mapping.securityId; input.technical.securityId = input.identity.mapping.securityId; const q = evaluateQuantReadiness(input); assert.equal(q.status, 'QUANT_TECHNICAL_ONLY'); assert.ok(q.reasons.includes('FUNDAMENTALS_LISTING_MISMATCH'));
});
test('cross-security price and technical inputs or a US benchmark never authorize European Quant', () => {
  for (const field of ['prices', 'technical']) {
    const input = ready(); input[field].securityId = securityIdForTicker('OTHER'); assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED');
    const wrongCurrency = ready(); wrongCurrency[field].currency = 'USD'; assert.equal(evaluateQuantReadiness(wrongCurrency).status, 'QUANT_BLOCKED');
  }
  const input = ready(); input.technical.benchmarkRegion = 'US'; assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED');
  input.technical.benchmarkRegion = 'EUROPE'; input.technical.benchmarkProvenance.verified = false; assert.equal(evaluateQuantReadiness(input).status, 'QUANT_BLOCKED');
});
test('canonical normalization rejects duplicated periods, wrong units and unknown industry profile', () => {
  const duplicate = fullEvidence(); duplicate.engineInputCertificate.consumerDocument.annual.revenue.push(duplicate.engineInputCertificate.consumerDocument.annual.revenue[0]);
  duplicate.engineInputCertificate.normalizedDocumentSha256 = createHash('sha256').update(JSON.stringify(duplicate.engineInputCertificate.consumerDocument)).digest('hex');
  assert.equal(evaluateFundamentals(mapping, duplicate, options).engineInputsValid, false);
  const fx = fullEvidence(); fx.engineInputCertificate.consumerDocument.units.revenue = 'USD';
  fx.engineInputCertificate.normalizedDocumentSha256 = createHash('sha256').update(JSON.stringify(fx.engineInputCertificate.consumerDocument)).digest('hex');
  assert.equal(evaluateFundamentals(mapping, fx, options).engineInputsValid, false);
  const bank = fullEvidence(); bank.engineInputCertificate.profile = 'BANK'; assert.equal(evaluateFundamentals(mapping, bank, options).engineInputsValid, false);
});
