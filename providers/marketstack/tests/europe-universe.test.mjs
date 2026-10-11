import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEuropeEquityUniverse, classifyEquity, normalizeDirectoryObservation, validIsin, validLei, readGermanIdentityEvidence, EUROPE_EXCHANGE_PLAN } from '../../../scripts/marketstack/europe-universe.mjs';
const require = createRequire(import.meta.url);
const Identity = require('../../../core/identity.js');
const sap = 'DE0007164600', siemens = 'DE0007236101';
const row = (symbol = 'SAP', mic = 'XETR', isin = sap, extra = {}) => ({
  row: { symbol, stock_exchange: { mic }, name: 'Example AG', isin, type: 'common stock', active: true, ...extra },
  provenance: { endpoint: `/exchanges/${mic}/tickers`, fetchedAt: '2026-10-08T10:00:00Z', rawSha256: 'fixture-sha' }
});
const issuer = (isin = sap, extra = {}) => ({ isin, verified: true, issuerId: 'issuer-1', issuerIdNamespace: 'official-fixture',
  issuerCountry: 'DE', primaryMic: 'XETR', source: 'official-register-fixture', ...extra });
const build = (rows, evidence = [issuer()], extra = {}) => buildEuropeEquityUniverse(rows, { identityEvidence: evidence, ...extra });

test('ordinary classes require explicit type; funds, warrants, receipts and ambiguous stocks do not enter', () => {
  assert.equal(classifyEquity({ type: 'ordinary shares' }).status, 'ACCEPTED');
  assert.equal(classifyEquity({ type: 'preferred shares' }).kind, 'PREFERRED');
  for (const type of ['ETF', 'fund', 'warrant', 'certificate', 'rights', 'unit', 'bond', 'ADR']) assert.equal(classifyEquity({ type }).status, 'REJECTED');
  assert.equal(classifyEquity({ type: 'stock', name: 'Example AG' }).status, 'REVIEW');
  assert.equal(classifyEquity({ type: 'common stock', name: 'Example UCITS ETF' }).status, 'REVIEW');
});

test('corrected normalized connector row retains unknown raw fields and does not treat acronym as MIC', () => {
  const input = { raw: { symbol: 'SAP', future_provider_field: { value: 7 }, active: true },
    normalized: { providerTicker: 'SAP', providerExchange: 'XETR', isin: sap }, provenance: { endpoint: '/tickers/SAP' } };
  const n = normalizeDirectoryObservation(input);
  assert.equal(n.mic, 'XETR'); assert.equal(n.providerTicker, 'SAP');
  assert.deepEqual(n.raw.future_provider_field, { value: 7 });
  input.raw.future_provider_field.value = 9; assert.equal(n.raw.future_provider_field.value, 7);
  assert.equal(normalizeDirectoryObservation({ symbol: 'SAP', stock_exchange: { acronym: 'XETR' } }).mic, null);
  assert.equal(normalizeDirectoryObservation({ providerTicker: 'SAP', exchangeMic: 'XETR', stockExchange: { mic: 'XFRA' } }).micConflict, true);
});

test('ISIN checksum proves security identity, never issuer, country or share-class type', () => {
  assert.equal(validIsin(sap), true); assert.equal(validIsin('DE0007164601'), false);
  const u = build([row()], []);
  assert.equal(u.summary.accepted, 0); assert.equal(u.candidates[0].status, 'REVIEW');
  assert.ok(u.candidates[0].reasons.includes('ISSUER_IDENTITY_MISSING'));
  assert.ok(u.candidates[0].reasons.includes('ISSUER_COUNTRY_MISSING'));
  assert.equal(u.candidates[0].securityKey, `ISIN:${sap}`);
});

test('company, share classes and listings are counted separately; same-ISIN secondary aliases share the primary ID', () => {
  const u = build([row(), row('SAP', 'XFRA'), row('SIE', 'XETR', siemens)], [issuer(), issuer(siemens)]);
  assert.deepEqual([u.summary.companies, u.summary.securities, u.summary.listings], [1, 2, 3]);
  const s = u.securities.find(s => s.isin === sap);
  assert.equal(s.securityId, Identity.securityIdForTicker('SAP.XETR'));
  assert.equal(s.listings.length, 2); assert.ok(s.aliases.includes('SAP.XFRA'));
  assert.equal(u.listings.find(l => l.mic === 'XFRA').securityId, s.securityId);
  assert.equal(u.publicationAllowed, false);
});

test('same display name and German exchange never fabricate German issuer identity', () => {
  const unknown = row('UNK', 'XETR', sap, { country: 'Germany' });
  assert.equal(build([unknown], []).germany.summary.candidates, 0);
  const nl = build([row()], [issuer(sap, { issuerCountry: 'NL' })]);
  assert.equal(nl.summary.companies, 1); assert.equal(nl.germany.summary.companies, 0);
  const nonEurope = build([row()], [issuer(sap, { issuerCountry: 'US' })]);
  assert.equal(nonEurope.candidates[0].status, 'REJECTED');
});

test('unknown active and primary status or unverified evidence always require review', () => {
  assert.equal(build([row('SAP', 'XETR', sap, { active: undefined })]).candidates[0].status, 'REVIEW');
  assert.equal(build([row()], [issuer(sap, { primaryMic: undefined })]).candidates[0].status, 'REVIEW');
  assert.equal(build([row()], [issuer(sap, { verified: false })]).candidates[0].companyKey, null);
  assert.equal(build([row()], [issuer(sap, { source: undefined })]).candidates[0].companyKey, null);
  assert.equal(build([row('SAP', 'XETR', sap, { active: false })]).candidates[0].status, 'REJECTED');
});

test('preferred classes need relevance evidence and ISIN/class separation', () => {
  const preferred = row('SAP', 'XETR', sap, { type: 'preferred stock' });
  assert.equal(build([preferred]).candidates[0].status, 'REVIEW');
  assert.equal(build([preferred], [issuer(sap, { preferredRelevant: true })]).candidates[0].status, 'ACCEPTED');
});

test('raw duplicate observations survive and conflicting identities fail closed', () => {
  const clean = build([row(), row()]);
  assert.equal(clean.inputObservationCount, 2); assert.equal(clean.summary.candidates, 1);
  assert.equal(clean.candidates[0].observations.length, 2);
  const conflicted = build([row(), row('SAP', 'XETR', siemens)], [issuer(), issuer(siemens)]);
  assert.equal(conflicted.summary.accepted, 0);
  assert.ok(conflicted.candidates[0].reasons.includes('CONFLICTING_SHARE_CLASS_IDENTITY'));
});

test('US IDs and separator-normalization collisions cannot create published price IDs', () => {
  const blocked = build([row()], [issuer()], { protectedSecurityIds: [Identity.securityIdForTicker('SAP.XETR')] });
  assert.equal(blocked.summary.accepted, 0); assert.equal(blocked.candidates[0].securityId, null);
  const collision = build([row('A.B'), row('A-B', 'XETR', siemens)], [issuer(), issuer(siemens)]);
  assert.equal(collision.summary.accepted, 0);
  assert.ok(collision.candidates.every(c => c.reasons.includes('CANONICAL_ID_COLLISION')));
});

test('discovery has no old 817 cap and is Germany first with 13 target countries', () => {
  const u = build(Array.from({ length: 900 }, (_, i) => row(`S${i}`, 'XETR', null)), []);
  assert.equal(u.summary.candidates, 900); assert.equal(u.summary.review, 900);
  assert.equal(EUROPE_EXCHANGE_PLAN.length, 13); assert.equal(EUROPE_EXCHANGE_PLAN[0].country, 'DE');
});

test('index membership needs dated exact ISIN evidence; ticker/name membership is not inferred', () => {
  const u = build([row()], [issuer()], { indexMembership: [
    { index: 'DAX', isin: sap, asOf: '2026-10-08', source: 'official-fixture' },
    { index: 'MDAX', symbol: 'SAP', asOf: '2026-10-08', source: 'fixture' },
    { index: 'SDAX', isin: sap, source: 'fixture' }
  ] });
  assert.deepEqual(u.candidates[0].indexMembership.map(m => m.index), ['DAX']);
});

test('LEI checksum prevents invented issuer identity', () => {
  assert.equal(validLei('529900T8BM49AURSDO55'), true);
  assert.equal(validLei('529900T8BM49AURSDO56'), false);
  const n = row('SAP', 'XETR', sap, { lei: '529900T8BM49AURSDO55', issuer_country: 'DE' });
  const u = build([n], []);
  assert.equal(u.candidates[0].companyKey, 'LEI:529900T8BM49AURSDO55');
  assert.equal(u.candidates[0].status, 'REVIEW'); // No primary proof from LEI alone.
});

test('fresh verified tradable-listing evidence can establish active status, without treating issuer ACTIVE as listing evidence', () => {
  const u = build([row('SAP', 'XETR', sap, { active: undefined })], [issuer(sap, { active: true, mic: 'XETR' })]);
  assert.equal(u.candidates[0].status, 'ACCEPTED'); assert.equal(u.candidates[0].active, true);
  assert.equal(build([row('SAP', 'XETR', sap, { active: undefined })], [issuer(sap, { entityStatus: 'ACTIVE' })]).candidates[0].status, 'REVIEW');
  const secondary = build([row(), row('SAP', 'XFRA', sap, { active: undefined })], [issuer(sap, { active: true, mic: 'XETR' })]);
  assert.equal(secondary.candidates.find(c => c.mic === 'XFRA').status, 'REVIEW');
});

test('same ISIN cannot silently have ordinary and preferred classes or inconsistent nominated primary venues', () => {
  const u = build([row(), row('SAP', 'XFRA', sap, { type: 'preferred stock' })], [issuer(sap, { preferredRelevant: true })]);
  assert.equal(u.summary.accepted, 0);
  assert.ok(u.candidates.every(c => c.reasons.includes('SHARE_CLASS_TYPE_CONFLICT')));
  const evidence = [issuer(null, { mic: 'XETR', providerSymbol: 'SAP', primaryMic: 'XETR' }),
    issuer(null, { mic: 'XFRA', providerSymbol: 'SAP', primaryMic: 'XLON' })];
  assert.equal(build([row(), row('SAP', 'XFRA')], evidence).summary.accepted, 0);
});

test('verified ordinary metadata cannot override explicitly preferred provider class', () => {
  const u = build([row('SAP', 'XETR', sap, { type: 'preferred stock' })], [issuer(sap, { securityType: 'common stock' })]);
  assert.equal(u.summary.accepted, 0); assert.ok(u.candidates[0].reasons.includes('CONFLICTING_INSTRUMENT_TYPE'));
});

test('duplicate listing currencies conflict and invalid or future index dates cannot imply coverage', () => {
  assert.ok(build([row('SAP', 'XETR', sap, { currency: 'EUR' }), row('SAP', 'XETR', sap, { currency: 'USD' })])
    .candidates[0].reasons.includes('CONFLICTING_LISTING_CURRENCY'));
  const u = build([row()], [issuer()], { generatedAt: '2026-10-08T10:00:00Z', indexMembership: [
    { isin: sap, source: 'official', asOf: 'banana' }, { isin: sap, source: 'official', asOf: '2026-02-30' },
    { isin: sap, source: 'official', asOf: '2026-10-09' }
  ] });
  assert.deepEqual(u.candidates[0].indexMembership, []);
});

test('explicit German liquid-local product primary policy keeps regulatory primary MIC separate', () => {
  const policy = issuer(sap, { productPrimaryPolicy: 'GERMANY_LIQUID_LOCAL_XETRA', mic: 'XETR', primaryMic: 'XETR',
    primaryMarketMic: 'XFRA', active: true, regulatoryLiquid: true });
  const u = build([row('SAP', 'XETR', sap, { active: undefined })], [policy]);
  assert.equal(u.candidates[0].status, 'ACCEPTED');
  assert.equal(u.candidates[0].primaryMic, 'XETR'); assert.equal(u.candidates[0].primaryMarketMic, 'XFRA');
  const unknownLiquid = build([row()], [{ ...policy, regulatoryLiquid: undefined }]);
  assert.equal(unknownLiquid.candidates[0].status, 'REVIEW');
  assert.ok(unknownLiquid.candidates[0].reasons.includes('PRODUCT_PRIMARY_POLICY_UNVERIFIED'));
});

test('official reader retains incomplete-run metadata and validates exact query, jurisdiction and raw source evidence', () => {
  const out = mkdtempSync(join(tmpdir(), 'vu-marketstack-identity-'));
  try {
    const r = issuer(sap, { lei: '529900T8BM49AURSDO55', issuerCountryBasis: 'GLEIF_ENTITY_JURISDICTION', legalJurisdiction: 'DE',
      provenance: { source: 'GLEIF_EXACT_ISIN_QUERY_PLUS_OFFICIAL_XETRA',
        gleif: { url: 'https://api.gleif.org/fixture', httpStatus: 200, queryIsin: sap, sha256: 'a'.repeat(64) },
        xetra: { url: 'https://deutsche-boerse.example/fixture', sha256: 'b'.repeat(64) } } });
    const path = join(out, 'evidence.json');
    writeFileSync(path, JSON.stringify({ schema: 'marketstack-germany-official-identity-evidence-1.0.0', complete: false,
      candidateCount: 171, completed: 2, rows: [r, { ...r, isin: siemens }] }));
    const read = readGermanIdentityEvidence(path);
    assert.equal(read.identityEvidence.length, 1); assert.equal(read.quarantined.length, 1);
    assert.equal(read.manifest.complete, false); assert.equal(read.manifest.candidateCount, 171);
    assert.deepEqual(read.identityEvidence[0].provenance, r.provenance);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('official German liquid CS policy admits an identified cash equity class without claiming ordinary/preferred', () => {
  const evidence = issuer(sap, { lei: '529900T8BM49AURSDO55', securityType: 'equity',
    productPrimaryPolicy: 'GERMANY_LIQUID_LOCAL_XETRA', mic: 'XETR', primaryMic: 'XETR', primaryMarketMic: 'XFRA',
    active: true, regulatoryLiquid: true, officialInstrumentType: 'CS', typeSource: 'XETRA_REFERENCE',
    issuerCountryBasis: 'GLEIF_ENTITY_JURISDICTION', legalJurisdiction: 'DE', provenance: { source: 'GLEIF_PLUS_XETRA',
      gleif: { httpStatus: 200, queryIsin: sap, url: 'https://api.gleif.org/fixture', sha256: 'b'.repeat(64) },
      xetra: { sha256: 'a'.repeat(64), url: 'https://deutsche-boerse.example/fixture' } } });
  const input = row('SAP', 'XETR', sap, { type: 'equity', active: undefined });
  const u = build([input], [evidence]);
  assert.equal(u.candidates[0].status, 'ACCEPTED'); assert.equal(u.candidates[0].kind, 'EQUITY_SHARE_CLASS');
  assert.equal(u.securities[0].shareClassDetail, 'UNKNOWN'); assert.equal(u.publicationAllowed, false);
  for (const field of ['officialInstrumentType', 'typeSource']) {
    assert.equal(build([input], [{ ...evidence, [field]: undefined }]).candidates[0].status, 'REVIEW');
  }
  assert.equal(build([row('SAP', 'XFRA', sap, { type: 'equity' })], [evidence]).candidates[0].status, 'REVIEW');
});
