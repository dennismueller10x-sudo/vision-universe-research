import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildEuropeFundamentalsMapping, resolveHistoricalReportingEntities, PINNED_RESEARCH_PARSER_SHA256 } from '../../../scripts/marketstack/europe-fundamentals-mapping.mjs';
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
const run = f => buildEuropeFundamentalsMapping(f.universe, f.evidence, { asOf });
test('exact official issuer and current fiscal company fact stay partial without local class/shares proof', () => {
  const result = run(fixture());
  assert.equal(result.rows[0].status, 'FUNDAMENTALS_PARTIAL');
  assert.equal(result.rows[0].latestFiscalPeriod, '2025-12-31');
  assert.equal(result.rows[0].companyFacts[0].value, 80807);
  assert.equal(result.rows[0].currencyBasis, 'SAME_CURRENCY_OBSERVED');
  assert.equal(result.summary.FUNDAMENTALS_FULL, 0);
  assert.equal(result.rows[0].quantFinancialInputReady, false);
  assert.equal(result.publicationAllowed, false);
});
test('raw hash corruption and foreign issuer identifiers block identity', () => {
  for (const change of [f => { f.evidence.identities[0].rawBytes += ' '; }, f => { f.universe.listings[0].companyKey = 'LEI:5299003VKVDCUPSS5X23'; }, f => { f.universe.listings[0].issuerCountry = 'DE'; }, f => { f.universe.listings[0].isAdr = true; }]) {
    const f = fixture(); change(f); assert.equal(run(f).rows[0].status, 'FUNDAMENTALS_IDENTITY_BLOCKED');
  }
});
test('dated official identity remains explicitly dated and never becomes a current observation', () => {
  const f = fixture(); f.evidence.identities[0].source.retrievedAt = '2026-10-08T09:00:00Z';
  assert.equal(run(f).rows[0].identityStatus, 'ISSUER_VERIFIED_DATED_OBSERVATION');
});
test('official filing metadata without parsed facts is NONE, never fabricated coverage', () => {
  const f = fixture(); f.evidence.factBundles = [];
  const row = run(f).rows[0]; assert.equal(row.status, 'FUNDAMENTALS_NONE'); assert.equal(row.officialFilings.length, 1); assert.equal(row.reportingCurrency, null);
});
test('unbound package, producer, normalized hash or publication timing withholds facts', () => {
  for (const mutate of [d => { d.documentSha256 = 'f'.repeat(64); }, d => { d.parserSourceSha256 = 'f'.repeat(64); }, d => { d.availableAt = '2026-03-30T23:59:59Z'; }, d => { d.facts[0].filedAt = '2026-03-30'; }]) {
    const f = fixture(), e = f.evidence.factBundles[0].normalized, d = JSON.parse(e.rawBytes); mutate(d); e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
    assert.equal(run(f).rows[0].status, 'FUNDAMENTALS_NONE');
  }
});
test('issuer EPS cannot leak onto a local share class; sign/normalization mismatches are quarantined', () => {
  const f = fixture(), e = f.evidence.factBundles[0].normalized, d = JSON.parse(e.rawBytes);
  const eps = { ...d.facts[0], metricId: 'epsDiluted', unit: 'currency', value: 21.42 };
  d.facts.push(eps); d.provenance['epsDiluted|2025-12-31|FY'] = { ...d.provenance['revenue|2025-12-31|FY'], originalConcept: '{https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full}DilutedEarningsLossPerShare', normalizedValue: 21.42, reportedValue: '21.42', unit: 'EUR/shares' };
  d.provenance['revenue|2025-12-31|FY'].reportedValue = '-80807000000';
  e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
  const row = run(f).rows[0]; assert.equal(row.companyFacts.length, 0);
  assert.deepEqual(row.withheldFacts.map(x => x.reason), ['INVALID_OR_UNBOUND_STANDARD_FACT', 'LOCAL_SHARE_CLASS_EPS_OR_SHARES_UNVERIFIED']);
});
test('metric/concept mismatch, negative assets and wrong fiscal year never become company facts', () => {
  for (const mutate of [d => { d.provenance['revenue|2025-12-31|FY'].originalConcept = '{https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full}Assets'; }, d => {
    d.facts[0].metricId = 'totalAssets'; d.facts[0].value = -80807;
    d.provenance['totalAssets|2025-12-31|FY'] = { ...d.provenance['revenue|2025-12-31|FY'], originalConcept: '{https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full}Assets', normalizedValue: -80807, reportedValue: '-80807000000', contextId: 'instantFY2025', periodStart: null };
  }, d => { d.facts[0].fiscalYear = 1900; }]) {
    const f = fixture(), e = f.evidence.factBundles[0].normalized, d = JSON.parse(e.rawBytes); mutate(d); e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
    assert.equal(run(f).rows[0].companyFacts.length, 0); assert.equal(run(f).rows[0].withheldFacts[0].reason, 'INVALID_OR_UNBOUND_STANDARD_FACT');
  }
});
test('actual package context dimensions, period or issuer cannot be replaced by a normalized contextId', () => {
  for (const xml of [report('<xbrli:segment>dimension</xbrli:segment>'), report().replace('2025-01-01', '2025-07-01'), report().replace(lei, '5299003VKVDCUPSS5X23')]) {
    const f = fixture(), b = f.evidence.factBundles[0], d = JSON.parse(b.normalized.rawBytes);
    b.package.rawBytes = zip(xml); b.package.source.sha256 = hash(b.package.rawBytes); d.documentSha256 = b.package.source.sha256;
    b.normalized.rawBytes = JSON.stringify(d); b.normalized.source.sha256 = hash(b.normalized.rawBytes);
    assert.equal(run(f).rows[0].companyFacts.length, 0);
  }
});
test('rehashed normalized value cannot override the official source numeric observation', () => {
  const f = fixture(), e = f.evidence.factBundles[0].normalized, d = JSON.parse(e.rawBytes);
  d.facts[0].value = 999; d.provenance['revenue|2025-12-31|FY'].normalizedValue = 999; d.provenance['revenue|2025-12-31|FY'].reportedValue = '999000000';
  e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
  assert.equal(run(f).rows[0].companyFacts.length, 0);
});
test('source EUR observations cannot be relabelled USD in normalized company facts', () => {
  const f = fixture(), e = f.evidence.factBundles[0].normalized, d = JSON.parse(e.rawBytes);
  d.facts[0].currency = 'USD'; d.provenance['revenue|2025-12-31|FY'].currency = 'USD';
  e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
  assert.equal(run(f).rows[0].companyFacts.length, 0);
});
test('exact decimal source scale replay avoids rejecting an authentic comma-decimal observation', () => {
  const f = fixture(), b = f.evidence.factBundles[0], d = JSON.parse(b.normalized.rawBytes);
  const xml = report().replace('<html ', '<html xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16" ').replace('unitRef="EUR">80807000000', 'unitRef="EUR" format="ixt:num-comma-decimal" scale="6">43\u00a0486,8');
  b.package.rawBytes = zip(xml); b.package.source.sha256 = hash(b.package.rawBytes); d.documentSha256 = b.package.source.sha256;
  d.facts[0].value = 43486800000 * 1e-6; d.provenance['revenue|2025-12-31|FY'].reportedValue = '43486800000'; d.provenance['revenue|2025-12-31|FY'].normalizedValue = d.facts[0].value;
  b.normalized.rawBytes = JSON.stringify(d); b.normalized.source.sha256 = hash(b.normalized.rawBytes);
  assert.equal(run(f).rows[0].companyFacts[0].value, d.facts[0].value);
});
test('valid single-quoted XML attributes preserve exact source facts', () => {
  const f = fixture(), b = f.evidence.factBundles[0], d = JSON.parse(b.normalized.rawBytes);
  b.package.rawBytes = zip(report().replace(/"([^"<>]*)"/g, "'$1'")); b.package.source.sha256 = hash(b.package.rawBytes); d.documentSha256 = b.package.source.sha256;
  b.normalized.rawBytes = JSON.stringify(d); b.normalized.source.sha256 = hash(b.normalized.rawBytes);
  assert.equal(run(f).rows[0].companyFacts[0].value, 80807);
});
test('ambiguous source unit IDs and duplicate context dates stay unsupported', () => {
  for (const xml of [report().replace('</html>', '<xbrli:unit id="EUR"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></html>'), report().replace('<xbrli:endDate>2025-12-31</xbrli:endDate>', '<xbrli:endDate>2025-12-31</xbrli:endDate><xbrli:endDate>2025-11-30</xbrli:endDate>')]) {
    const f = fixture(), b = f.evidence.factBundles[0], d = JSON.parse(b.normalized.rawBytes); b.package.rawBytes = zip(xml); b.package.source.sha256 = hash(b.package.rawBytes); d.documentSha256 = b.package.source.sha256;
    b.normalized.rawBytes = JSON.stringify(d); b.normalized.source.sha256 = hash(b.normalized.rawBytes); assert.equal(run(f).rows[0].companyFacts.length, 0);
  }
});
test('historical duplicate LEI bridge requires current explicit successor and identical registry identity', () => {
  const old = '9695007ZQTEMPGIL5N67', current = 'F5WCUMTUM4RKZ1MAIE39';
  const issuer = { lei: current, currentDayObserved: true, registeredAs: '572093920', registerAuthorityId: 'RA000189', legalJurisdiction: 'FR', provenance: { kind: 'GLEIF' } };
  const e = envelope({ data: { id: old, attributes: { lei: old, registration: { status: 'DUPLICATE' }, entity: { status: 'NULL', category: 'GENERAL', jurisdiction: 'FR', registeredAs: '572093920', registeredAt: { id: 'RA000189' }, successorEntities: [{ lei: current }] } } } }, `https://api.gleif.org/api/v1/lei-records/${old}`);
  assert.equal(resolveHistoricalReportingEntities(issuer, [e], asOf).length, 1);
  assert.equal(resolveHistoricalReportingEntities({ ...issuer, currentDayObserved: false }, [e], asOf).length, 0);
  assert.equal(resolveHistoricalReportingEntities({ ...issuer, registeredAs: 'different' }, [e], asOf).length, 0);
  const d = JSON.parse(e.rawBytes); d.data.attributes.entity.successorEntities[0].lei = lei; e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes);
  assert.equal(resolveHistoricalReportingEntities(issuer, [e], asOf).length, 0);
});
test('pagination incompleteness, foreign URL and future evidence fail closed', () => {
  for (const change of [f => { const e = f.evidence.identities[0], d = JSON.parse(e.rawBytes); d.meta.pagination.total = 2; e.rawBytes = JSON.stringify(d); e.source.sha256 = hash(e.rawBytes); }, f => { f.evidence.identities[0].source.url = `https://untrusted.example/api/v1/lei-records?filter[isin]=${isin}`; }, f => { f.evidence.identities[0].source.retrievedAt = '2026-10-10T09:00:00Z'; }, f => { f.evidence.identities[0].source.retrievedAt = '2026-10-09T23:59:59-12:00'; }]) {
    const f = fixture(); change(f); assert.equal(run(f).rows[0].status, 'FUNDAMENTALS_IDENTITY_BLOCKED');
  }
});
test('source inputs remain unchanged and duplicate canonical securities are rejected', () => {
  const f = fixture(), before = JSON.stringify(f); run(f); assert.equal(JSON.stringify(f), before);
  f.universe.listings.push({ ...f.universe.listings[0], listingKey: 'another' }); assert.throws(() => run(f), /DUPLICATE_CANONICAL_SECURITY/);
});
test('verified primary and secondary listings share one financial-security row while currencies remain local', () => {
  const f = fixture(); f.universe.listings[0].isPrimary = true;
  f.universe.listings.push({ ...f.universe.listings[0], listingKey: 'marketstack:XETR:MOH.DE', mic: 'XETR', isPrimary: false, currency: 'EUR' });
  const result = run(f); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].listings.length, 2);
  assert.equal(result.rows[0].listingId, 'marketstack:XPAR:MC.PA'); assert.equal(result.rows[0].status, 'FUNDAMENTALS_PARTIAL'); assert.equal(result.rows[0].quantFinancialInputReady, false);
});
