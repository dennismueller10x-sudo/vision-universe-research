import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PINNED_RESEARCH_PARSER_SHA256 } from '../../marketstack/europe-fundamentals-mapping.mjs';
import { buildEuropeOfficialFilingsFollowUp } from '../europe-follow-up.mjs';
const asOf = '2026-10-09', isin = 'FR0000121014', lei = 'IOG4E947OATN0KJYSD45';
const hash = x => createHash('sha256').update(x).digest('hex');
const envelope = (doc, url, date = '2026-10-09T09:00:00Z') => {
  const rawBytes = typeof doc === 'string' || doc instanceof Uint8Array ? doc : JSON.stringify(doc);
  return { rawBytes, source: { url, sha256: hash(rawBytes), httpStatus: 200, retrievedAt: date } };
};
function zip(xml) {
  const name = Buffer.from('fixture/reports/fixture.xhtml'), data = Buffer.from(xml);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
const report = (extra = '') => `<html xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:ifrs-full="https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"><xbrli:context id="consolidatedFY2025"><xbrli:entity><xbrli:identifier scheme="http://standards.iso.org/iso/17442">${lei}</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context><xbrli:context id="instantFY2025"><xbrli:entity><xbrli:identifier scheme="http://standards.iso.org/iso/17442">${lei}</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context><xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit><ix:nonFraction name="ifrs-full:Revenue" contextRef="consolidatedFY2025" unitRef="EUR">80807000000</ix:nonFraction><xbrli:unit id="EURshares"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit><ix:nonFraction name="ifrs-full:DilutedEarningsLossPerShare" contextRef="consolidatedFY2025" unitRef="EURshares">21.42</ix:nonFraction></html>`;
function fixture() {
  const candidate = { status: 'ACCEPTED', companyKey: `LEI:${lei}`, isin, securityId: 'ref_MC_PA_XPAR', listingKey: 'marketstack:XPAR:MC.PA', mic: 'XPAR', issuerCountry: 'FR', currency: 'EUR' };
  const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D=${isin}`;
  const identities = [envelope({ meta: { pagination: { total: 1 }, goldenCopy: { publishDate: '2026-10-09T00:00:00Z' } }, links: { first: url, last: url }, data: [{ id: lei, attributes: { lei, entity: { legalName: { name: 'LVMH' }, jurisdiction: 'FR', status: 'ACTIVE', category: 'GENERAL' } } }] }, url)];
  const packageUrl = 'https://fr.ftp.opendatasoft.com/datadila/INFOFI/156/8888/01/FC156622038_20260331.xbri';
  const id = 'FR-OAM-622038_20260331';
  const filingRecords = [envelope({ results: [{ identificationsociete_iso_cd_isi: isin, identificationsociete_iso_cd_lei: lei, uin_idt_uin: '622038_20260331', uin_dat_amf: '2026-03-31T14:26:22Z', url_de_recuperation: packageUrl, informationdeposee_inf_tit_inf: '2025 annual registration' }] }, 'https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records?limit=100')];
  const packageEvidence = envelope(zip(report()), packageUrl);
  const fact = { securityId: `vu_lei_${lei}`, metricId: 'revenue', fiscalYear: 2025, fiscalPeriod: 'FY', periodEnd: '2025-12-31', value: 80807, currency: 'EUR', unit: 'currency_m', sourceFilingId: id, filedAt: '2026-03-31', availableAt: '2026-03-31T23:59:59Z' };
  const p = { originalConcept: '{https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full}Revenue', mappingStatus: 'VERIFIED_STANDARD', normalizedValue: 80807, reportedValue: '80807000000', unit: 'EUR', currency: 'EUR', periodEnd: '2025-12-31', periodStart: '2025-01-01', contextId: 'consolidatedFY2025', documentId: id, sourceDocument: packageUrl };
  const normalized = envelope({ schemaVersion: 'official-filing-1.0.0', sourceSystem: 'ESEF', lei, isin, companyId: `vu_lei_${lei}`, documentSha256: packageEvidence.source.sha256, sourceDocument: packageUrl, parserSourceSha256: PINNED_RESEARCH_PARSER_SHA256, privateHarness: 'PINNED_PR324_PARSER_CURRENT_MAIN_SEC_REGISTRY_IO_SHIM_ONLY', researchOnly: true, publicationAllowed: false, filing: { filingId: id }, availableAt: fact.availableAt, facts: [fact], provenance: { 'revenue|2025-12-31|FY': p }, issues: [] }, packageUrl);
  return { universe: { listings: [candidate] }, evidence: { identities, filingRecords, factBundles: [{ package: packageEvidence, normalized }] } };
}
function input() {
  const f = fixture(), primary = { ...f.universe.listings[0], identityAdmission: 'IDENTITY_READY', kind: 'EQUITY_SHARE_CLASS', active: true, isPrimary: true };
  return { officialInputs: f.evidence, asOf, catalog: { schema: 'vu-europe-discover-identity-reclassification-2', generatedAt: '2026-10-09T10:00:00Z', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    companies: [{ companyKey: primary.companyKey, issuerCountry: 'FR', issuerIdentityLevel: 'VERIFIED_LEGAL_ENTITY' }],
    securities: [{ securityId: primary.securityId, isin, companyKey: primary.companyKey, primaryListingId: primary.listingKey }], listings: [primary] } };
}
function run(f) {
  const { catalog, ...args } = f, catalogBytes = JSON.stringify(catalog);
  return buildEuropeOfficialFilingsFollowUp({ ...args, catalogBytes, expectedCatalogSha256: hash(catalogBytes) });
}
test('exact official annual fact is follow-up PARTIAL while Discover and Quant admission remain independent', () => {
  const f = input(), before = JSON.stringify(f), result = run(f), row = result.rows[0];
  assert.equal(row.status, 'FUNDAMENTALS_PARTIAL'); assert.equal(row.official.companyFacts[0].value, 80807);
  assert.equal(result.catalogBinding.sha256, hash(JSON.stringify(f.catalog)));
  assert.equal(row.discoverAdmissionDependency, false); assert.equal(row.quantFinancialInputReady, false);
  assert.equal(result.summary.full, 0); assert.equal(row.official.shares, null); assert.equal(result.publicationAllowed, false);
  assert.equal(JSON.stringify(f), before);
});
test('missing official financial issuer proof does not remove a Discover security', () => {
  const f = input(); f.officialInputs.identities = [];
  const result = run(f); assert.equal(result.summary.securities, 1); assert.equal(result.rows[0].status, 'OFFICIAL_IDENTITY_REQUIRED');
  assert.equal(f.catalog.listings[0].identityAdmission, 'IDENTITY_READY'); assert.equal(result.rows[0].official.companyFacts.length, 0);
});
test('exact source resolves an issuer for follow-up without consolidating security-scoped catalog company', () => {
  const f = input(), key = 'SECURITY_ISSUER:' + isin;
  for (const row of [f.catalog.companies[0], f.catalog.securities[0], f.catalog.listings[0]]) row.companyKey = key;
  f.catalog.companies[0].issuerIdentityLevel = 'SECURITY_SCOPED_OFFICIAL_LABEL';
  const row = run(f).rows[0]; assert.equal(row.companyKey, key); assert.equal(row.sourceResolvedIssuer.lei, lei);
  assert.equal(row.status, 'FUNDAMENTALS_PARTIAL'); assert.equal(row.canonicalCompanyIdentityMutated, false);
});
test('catalog bytes and private publication boundary require the pinned original catalog', () => {
  const f = input(), bytes = JSON.stringify(f.catalog);
  assert.throws(() => buildEuropeOfficialFilingsFollowUp({ catalogBytes: bytes + ' ', expectedCatalogSha256: hash(bytes), asOf }), /CATALOG_HASH_MISMATCH/);
  f.catalog.publicationAllowed = true; assert.throws(() => run(f), /AUTHENTICATED_DISCOVER_CATALOG_REQUIRED/);
});
test('unreferenced company objects cannot inflate financial coverage', () => {
  const f = input(); f.catalog.companies.push({ companyKey: 'orphan', issuerCountry: 'FR' });
  assert.throws(() => run(f), /CATALOG_COMPANY_WITHOUT_SECURITY/);
});
test('ADR, foreign jurisdiction, protected IDs and class identity contradictions are refused', () => {
  for (const mutate of [f => { f.catalog.listings[0].isAdr = true; }, f => { f.catalog.companies[0].issuerCountry = 'US'; },
    f => { f.protectedSecurityIds = [f.catalog.listings[0].securityId]; }, f => { f.catalog.listings[0].isin = 'DE0006595101'; },
    f => { f.catalog.listings[0].issuerCountry = 'DE'; }, f => { f.catalog.securities[0].primaryListingId = 'different'; },
    f => { f.catalog.generatedAt = '2026-10-10T00:00:00Z'; }]) {
    const f = input(); mutate(f); assert.throws(() => run(f), /CATALOG|ISSUER_COUNTRY|PROTECTED/);
  }
});
test('financial reporting currency does not replace secondary local quote currency', () => {
  const f = input(); f.catalog.listings.push({ ...f.catalog.listings[0], listingKey: 'marketstack:XLON:MC', mic: 'XLON', currency: 'GBP', isPrimary: false });
  const row = run(f).rows[0]; assert.equal(row.official.reportingCurrency, 'EUR'); assert.equal(row.listingCurrency, 'EUR');
  assert.deepEqual(row.official.listings.map(l => l.listingCurrency), ['EUR', 'GBP']); assert.equal(row.quantFinancialInputReady, false);
});
test('rehashed normalized fact cannot override the original official ZIP observation', () => {
  const f = input(), e = f.officialInputs.factBundles[0].normalized, d = JSON.parse(e.rawBytes);
  d.facts[0].value = 999; d.provenance['revenue|2025-12-31|FY'].normalizedValue = 999; d.provenance['revenue|2025-12-31|FY'].reportedValue = '999000000';
  e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
  const row = run(f).rows[0]; assert.equal(row.status, 'FUNDAMENTALS_NONE'); assert.equal(row.official.companyFacts.length, 0);
});
test('Marketstack supplement preserves original fields but never supplies official facts or engine inputs', () => {
  const f = input(), l = f.catalog.listings[0]; f.officialInputs.factBundles = [];
  const rawBytes = JSON.stringify({ revenue: 999, opaqueNested: { preserved: true } });
  f.optionalSupplements = [{ rawBytes, sha256: hash(rawBytes), scope: { provider: 'MARKETSTACK', securityId: l.securityId, companyKey: l.companyKey, isin,
    listingId: l.listingKey, mic: l.mic, currency: l.currency } }];
  const row = run(f).rows[0]; assert.equal(row.status, 'FUNDAMENTALS_NONE'); assert.equal(row.optionalSupplement.status, 'OPTIONAL_SUPPLEMENT');
  assert.equal(row.optionalSupplement.accepted[0].raw.opaqueNested.preserved, true); assert.equal(row.optionalSupplement.usedAsPrimary, false);
  assert.equal(row.official.companyFacts.length, 0); assert.equal(row.quantFinancialInputReady, false);
  f.optionalSupplements[0].scope.listingId = 'foreign'; assert.equal(run(f).rows[0].optionalSupplement.status, 'REJECTED');
});
