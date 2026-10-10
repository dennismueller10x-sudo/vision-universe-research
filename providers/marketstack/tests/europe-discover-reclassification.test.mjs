import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyDiscoverIdentity, reclassifyDiscoverCandidates, readDiscoverMetadataEvidence, readDiscoverOfficialReference, readExtraDiscoverIssuer, readOfficialOrdIssuerDomicle, readOfficialClassIssuerBridge, validIsin, validLei, parseOfficialCsv } from '../../../scripts/marketstack/europe-discover-reclassification.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const isin = 'DE0007164600', lei = '529900T8BM49AURSDO55';
const official = (patch = {}) => ({ isin, mic: 'XETR', nativeTicker: 'SAP', instrumentName: 'SAP SE', type: 'CS', active: true, nativeUnique: true,
  officialNameUnique: true, primaryMarketMic: 'XFRA', currency: 'EUR', issuer: { lei, issuerName: 'SAP SE', issuerCountry: 'DE', source: { sha256: 'c'.repeat(64) } },
  provenance: { source: { sha256: 'b'.repeat(64) } }, ...patch });
const raw = (patch = {}) => ({ symbol: 'SAP.DE', isin, name: 'SAP SE', item_type: 'equity', stock_exchange: { mic: 'XETR' }, ...patch });
const op = (body = raw(), patch = {}) => ({ listingKey: 'marketstack:XETR:SAP.DE', operation: { kind: 'metadata', symbol: 'SAP.DE', mic: 'XETR', expectedIsin: isin, ...patch },
  observations: [{ raw: body, provenance: { rawSha256: 'a'.repeat(64), retrievedAt: '2026-10-09T12:00:00Z' } }], responses: [{ retrievedAt: '2026-10-09T12:00:00Z' }] });
const classify = (body, ref = official(), patch = {}) => classifyDiscoverIdentity({ ...op(body), officialClasses: [ref], ...patch });
test('Discover identity ignores unavailableLEI/fundamentals/liquidity/volume/adjusted/technical and uncertifiedprimary', () => {
  const result = classify(raw()); assert.equal(result.identityAdmission, 'IDENTITY_READY'); assert.equal(result.primaryCertification, 'UNKNOWN');
  assert.equal(result.kind, 'EQUITY_SHARE_CLASS'); assert.equal(result.shareClassDetail, 'UNKNOWN');
  const noLei = classify(raw(), official({ issuer: { issuerName: null, issuerCountry: 'DE', source: { sha256: 'c'.repeat(64) } } })); assert.equal(noLei.identityAdmission, 'IDENTITY_READY');
  assert.equal(noLei.legalName, null); assert.equal(noLei.issuerCountry, 'DE'); assert.equal(noLei.companyResolution, 'SECURITY_SCOPED_ISSUER');
});
test('invalid and contradictory type/ISIN/MIC/activity declarations stayclosed', () => {
  assert.equal(classify(raw({ item_type: 'ETF' })).identityAdmission, 'REJECTED');
  for (const patch of [{ isin: false }, { isin: 0 }, { isin: 'DE0007164601' }, { active: false }, { stock_exchange: { mic: 'XNAS' }, stock_exchanges: [{ mic: 'XETR' }] }])
    assert.equal(classify(raw(patch)).identityAdmission, 'REVIEW', JSON.stringify(patch));
  assert.equal(classify(raw(), official({ issuer: { issuerName: 'US issuer', issuerCountry: 'US', lei } })).identityAdmission, 'REVIEW');
});
test('missingISIN officialnative bridge is exact and never overrides declaredidentity', () => {
  assert.equal(classify(raw({ isin: null })).identityAdmission, 'IDENTITY_READY');
  assert.equal(classify(raw({ isin: null }), official({ nativeTicker: 'SAPE' })).identityAdmission, 'REVIEW');
  assert.equal(classify(raw({ isin: null }), official({ nativeUnique: false })).identityAdmission, 'REVIEW');
  const other = official({ isin: 'DE0008404005', nativeTicker: 'SAP' });
  assert.equal(classify(raw(), other).identityAdmission, 'REVIEW');
});
test('officialclass stale/inactive/noncash evidence and name collisions do not grantidentity', () => {
  for (const patch of [{ active: false }, { type: 'ETF' }, { issuer: null, officialNameUnique: false }, { issuer: null, instrumentName: 'Different issuer' }, { issuer: null, primaryMarketMic: 'XNYS' }])
    assert.equal(classify(raw(), official(patch)).identityAdmission, 'REVIEW');
});
test('localforeignEuropean listing is distinct from certifiedprimary and currency nevertransfersvenue', () => {
  const x = op(raw({ symbol: 'SAP.PA', stock_exchange: { mic: 'XPAR' }, price_currency: null }), { symbol: 'SAP.PA', mic: 'XPAR' });
  const result = classifyDiscoverIdentity({ ...x, officialClasses: [official()] }); assert.equal(result.identityAdmission, 'IDENTITY_READY');
  assert.equal(result.currency, null); assert.equal(result.primaryCertification, 'UNKNOWN');
});
test('sameclass acrossvenues shares oneID; previousID survives chartmissing and unknownprimary', () => {
  const paris = op(raw({ symbol: 'SAP.PA', stock_exchange: { mic: 'XPAR' } }), { symbol: 'SAP.PA', mic: 'XPAR' }); paris.listingKey = 'marketstack:XPAR:SAP.PA';
  const result = reclassifyDiscoverCandidates({ operations: [op(), paris], officialClasses: [official()], previousUniverse: { listings: [{ isin, securityId: 'ref_SAP_STABLE' }] }, generatedAt: '2026-10-10T06:00:00Z' });
  assert.equal(result.securities.length, 1); assert.equal(result.listings.length, 2); assert.equal(result.securities[0].securityId, 'ref_SAP_STABLE');
  assert.ok(result.listings.every(l => l.securityId === 'ref_SAP_STABLE')); assert.equal(result.listings[0].admissionProof.securityId, 'ref_SAP_STABLE');
});
test('class-scoped same names do not fabricate legalcompany or mergeISIN classes', () => {
  const second = official({ isin: 'DE0008404005', nativeTicker: 'ALV', issuer: { issuerName: null, issuerCountry: 'DE', source: { sha256: 'c'.repeat(64) } }, instrumentName: 'ALV SE' });
  const alv = op(raw({ symbol: 'ALV.DE', isin: second.isin, name: second.instrumentName }), { symbol: 'ALV.DE', expectedIsin: second.isin }); alv.listingKey = 'marketstack:XETR:ALV.DE';
  const result = reclassifyDiscoverCandidates({ operations: [op(), alv], officialClasses: [official(), second] });
  assert.equal(result.securities.length, 2); assert.equal(result.counts.verifiedLegalEntityCompanies, 1); assert.equal(result.counts.unresolvedSecurityScopedIssuerGroups, 1);
});
test('protectedUS collisions closeadmission without alteringpreviousIDs', () => {
  assert.ok(classify(raw(), official(), { protectedSecurityIds: ['ref_SAP_DE_XETR'] }).reasons.includes('PROTECTED_US_ID_COLLISION'));
});
test('optionalLEI absence passes; explicitly invalid or conflictingissuer assertion blocks and retains priorreferenceID', () => {
  assert.equal(classify(raw({ lei: '' })).identityAdmission, 'IDENTITY_READY');
  assert.equal(classify(raw({ lei: 'invalid' })).identityAdmission, 'REVIEW');
  const conflict = op(raw({ lei: '5299007ZHUSGAJRMWH73' }));
  const result = reclassifyDiscoverCandidates({ operations: [conflict], officialClasses: [official()], previousUniverse: { listings: [{ isin, securityId: 'ref_SAP_STABLE', listingKey: conflict.listingKey, providerSymbol: 'SAP.DE', mic: 'XETR', companyKey: 'LEI:' + lei }] } });
  assert.equal(result.listings.length, 0); assert.equal(result.knownReferenceGraph.securities[0].securityId, 'ref_SAP_STABLE');
  assert.equal(result.knownReferenceGraph.listings[0].discoverEligible, false); assert.equal(result.knownReferenceGraph.listings[0].identityBlocked, true);
});
test('sameISIN/MIC nativealiases resolve to one listing and one result, preservingallrawsourcealiases', () => {
  const alias = op(raw({ symbol: 'SAP.XETR' }), { symbol: 'SAP.XETR' }); alias.listingKey = 'marketstack:XETR:SAP.XETR';
  const result = reclassifyDiscoverCandidates({ operations: [op(), alias], officialClasses: [official()] });
  assert.equal(result.counts.identityReadyQueryKeys, 2); assert.equal(result.counts.identityReadyListings, 1); assert.equal(result.securities.length, 1);
  assert.deepEqual(result.securities[0].aliases, ['SAP.DE', 'SAP.XETR']); assert.equal(result.listings[0].aliasEvidence.length, 2);
});
test('candidate accounting partitions every priorreview key across trueidentity/type/uncertainty outcomes', () => {
  const etf = op(raw({ symbol: 'FUND.DE', item_type: 'ETF' }), { symbol: 'FUND.DE' }); etf.listingKey = 'marketstack:XETR:FUND.DE';
  const missing = op(); missing.listingKey = 'marketstack:XETR:NONE.DE'; missing.operation.symbol = 'NONE.DE'; missing.observations = [];
  const result = reclassifyDiscoverCandidates({ operations: [op(), etf, missing], officialClasses: [official()], previousUniverse: { candidates: [op(), etf, missing].map(x => ({ listingKey: x.listingKey, status: 'REVIEW' })) } });
  assert.deepEqual(result.candidateAccounting.priorReview, { total: 3, identityReady: 1, review: 1, rejected: 1 });
  assert.equal(Object.values(result.candidateAccounting.primaryCounts).reduce((a, b) => a + b, 0), 3);
});
test('checksums and quotedofficialCSV are interpreted accurately', () => {
  assert.equal(validIsin(isin), true); assert.equal(validIsin('DE0007164601'), false); assert.equal(validLei(lei), true); assert.equal(validLei(lei.slice(0, -1) + '6'), false);
  assert.equal(parseOfficialCsv('Market:;XETR\nISIN;MIC Code;Instrument\n'+isin+';XETR;"SAP; SE"\n')[0].Instrument, 'SAP; SE');
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vu-discover-raw-')); mkdirSync(join(root, 'raw')); mkdirSync(join(root, 'normalized'));
  const body = JSON.stringify(raw()), manifest = [{ id: '000001', sha256: sha(body), status: 200, endpoint: '/tickers/SAP.DE', retrievedAt: '2026-10-09T12:00:00Z' }];
  const operation = op().operation, normalized = { operation, responseIds: ['000001'], result: { observations: [{ normalized: { isin: 'FR0000121014', providerExchange: 'XNAS' } }] } };
  const summary = { version: 'marketstack-europe-ingestion-1', results: [{ operation, responseIds: ['000001'], resultPath: 'normalized/000000.json' }] };
  writeFileSync(join(root, 'raw/000001.json'), body); writeFileSync(join(root, 'normalized/000000.json'), JSON.stringify(normalized));
  const m = JSON.stringify(manifest), s = JSON.stringify(summary); writeFileSync(join(root, 'raw-manifest.json'), m); writeFileSync(join(root, 'summary.json'), s);
  return { root, input: { path: root, manifestSha256: sha(m), summarySha256: sha(s) } };
}
test('metadata identity is rederivedfromraw; normalizedISIN/MIC tampering cannot promoteanotherclass', () => {
  const f = fixture(); try { const result = readDiscoverMetadataEvidence(f.input); assert.equal(result.operations[0].observations[0].normalized.isin, isin);
    assert.equal(result.operations[0].observations[0].normalized.singular[0], 'XETR'); } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('rawbody and summaries are individually hashbound and allscopedrawrows survive cardinality review', () => {
  const f = fixture(); try { writeFileSync(join(f.root, 'raw/000001.json'), JSON.stringify(raw({ isin: 'FR0000121014' }))); assert.throws(() => readDiscoverMetadataEvidence(f.input), /INPUT_HASH_MISMATCH/); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('reader refuses symlink source substitution', () => {
  const f = fixture(); try { const path = join(f.root, 'raw/000001.json'); rmSync(path); symlinkSync(join(f.root, 'normalized/000000.json'), path); assert.throws(() => readDiscoverMetadataEvidence(f.input), /SYMLINK_INPUT_FORBIDDEN/); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('officialnormalizedclass assertions neveroverride actualCSV; raw issuer query/id/pagination contradictions do notverify legalcompany', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-discover-official-')); try {
    const csv = 'Market:;XETR\nISIN;MIC Code;Instrument;Mnemonic;Instrument Type;Product Status;Instrument Status;Primary Market MIC Code;Currency\n'+isin+';XETR;SAP SE;SAP;CS;Active;Active;XFRA;EUR\n';
    const csvPath = join(root, 'official.csv'); writeFileSync(csvPath, csv);
    const query = 'https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D='+isin;
    const data = { links: { first: query, last: query }, meta: { pagination: { total: 1 } }, data: [{ id: lei, attributes: { lei, entity: { status: 'ACTIVE', category: 'GENERAL', jurisdiction: 'DE', legalName: { name: 'SAP SE' } } } }] };
    const rawPath = join(root, 'issuer.json'), documentPath = join(root, 'document.json');
    const read = body => { const bytes = JSON.stringify(body); writeFileSync(rawPath, bytes); const g = { path: rawPath, sha256: sha(bytes), url: query, httpStatus: 200 };
      const doc = { source: { path: csvPath, sha256: sha(csv), url: 'https://www.cashmarket.deutsche-boerse.com/resource/blob/x/data/t7-xetr-allTradableInstruments.csv', httpStatus: 200 }, rows: [{ isin, provenance: { gleif: g }, verified: true, officialInstrumentType: 'ETF' }] };
      const db = JSON.stringify(doc); writeFileSync(documentPath, db); return { result: readDiscoverOfficialReference(documentPath, sha(db)), source: { ...g, queryIsin: isin } }; };
    const good = read(data); assert.equal(good.result.classes[0].type, 'CS'); assert.equal(good.result.classes[0].issuer.lei, lei); assert.equal(readExtraDiscoverIssuer(good.source).lei, lei);
    for (const mutate of [d => d.links.last = query.replace(isin, 'DE0008404005'), d => d.data[0].id = '5299007ZHUSGAJRMWH73', d => d.meta.pagination.total = 2]) {
      const altered = structuredClone(data); mutate(altered); const result = read(altered); assert.equal(result.result.classes[0].issuer, null); assert.equal(readExtraDiscoverIssuer(result.source), null);
    }
    writeFileSync(csvPath, csv.replace(';CS;', ';ETF;')); assert.throws(() => readDiscoverOfficialReference(documentPath, sha(JSON.stringify(JSON.parse(requireDocument(documentPath))))), /INPUT_HASH_MISMATCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('issuer-ownedORD reference supplies onlyexactordinaryclass domicile, neverADRidentity or guessedLEI', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-discover-ord-')); try {
    const path = join(root, 'issuer.html'), source = { kind: 'NORDEA_OFFICIAL_ORD_CLASS_DOMICILE', path, url: 'https://www.nordea.com/en/investors/american-depositary-receipts-adr', httpStatus: 200 };
    const html = '<h3>DR Program Information</h3><div><table><tbody>'+[['Company name', 'Nordea Bank ABP'], ['ORD ISIN', 'FI4000297767'], ['DR ISIN', 'US65558R1095'], ['ORD Ticker', 'NDA FH'], ['Country', 'Finland']].map(([k,v])=>'<tr><td>'+k+'</td><td>'+v+'</td></tr>').join('')+'</tbody></table></div>';
    writeFileSync(path, html); const admitted = readOfficialOrdIssuerDomicle({ ...source, sha256: sha(html) });
    assert.equal(admitted.isin, 'FI4000297767'); assert.equal(admitted.issuerCountry, 'FI'); assert.equal(admitted.issuerName, null); assert.equal(admitted.lei, undefined);
    assert.ok(admitted.source.excludedFields.includes('DR ISIN'));
    const bad = html.replace('FI4000297767', 'US65558R1095'); writeFileSync(path, bad);
    assert.throws(() => readOfficialOrdIssuerDomicle({ ...source, sha256: sha(bad) }), /ORD_CLASS_ISSUER_DOMICILE_UNRESOLVED/);
    assert.throws(() => readOfficialOrdIssuerDomicle({ ...source, url: 'https://example.com/nordea', sha256: sha(bad) }), /SCOPED_OFFICIAL_ORD/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('datedissuer notice plus currentexactLEI provesclassissuer withoutinventing a GLEIF-ISIN relationship', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-discover-issuer-bridge-')); try {
    const releasePath = join(root, 'release.html'), entityPath = join(root, 'entity.json');
    const notice = '<p>Espoo – Nokia Oyj (LEI: 549300A0JPRWG1KI7U06) on 05.03.2025 hankkinut omia osakkeitaan (ISIN FI0009000681) omistukseensa seuraavasti:</p>';
    const record = { data: { id: '549300A0JPRWG1KI7U06', attributes: { lei: '549300A0JPRWG1KI7U06', entity: { status: 'ACTIVE', category: 'GENERAL', jurisdiction: 'FI', legalName: { name: 'Nokia Oyj' } } } } };
    const source = body => { const bytes = JSON.stringify(body); writeFileSync(entityPath, bytes); writeFileSync(releasePath, notice);
      return { release: { kind: 'NOKIA_OFFICIAL_CLASS_NOTIFICATION', url: 'https://www.nokia.com/newsroom/fi-fi/nokia-oyj-omien-osakkeiden-takaisinosto-05032025/', path: releasePath, sha256: sha(notice), httpStatus: 200 },
        entity: { url: 'https://api.gleif.org/api/v1/lei-records/549300A0JPRWG1KI7U06', path: entityPath, sha256: sha(bytes), httpStatus: 200 } }; };
    const good = readOfficialClassIssuerBridge(source(record)); assert.equal(good.isin, 'FI0009000681'); assert.equal(good.issuerCountry, 'FI');
    assert.equal(good.relationshipAsOf, '2025-03-05'); assert.equal(good.source.gleifIsinRelationshipClaimed, false);
    const scriptCopy = source(record), withMetadata = notice + '<script type="application/ld+json">'+notice+'</script>'; writeFileSync(releasePath, withMetadata);
    assert.equal(readOfficialClassIssuerBridge({ ...scriptCopy, release: { ...scriptCopy.release, sha256: sha(withMetadata) } }).isin, 'FI0009000681');
    const onlyMetadata = '<script type="application/ld+json">'+notice+'</script>'; writeFileSync(releasePath, onlyMetadata);
    assert.throws(() => readOfficialClassIssuerBridge({ ...scriptCopy, release: { ...scriptCopy.release, sha256: sha(onlyMetadata) } }), /EXACT_ISSUER_CLASS_RELATIONSHIP_REQUIRED/);
    for (const mutate of [r => r.data.id = lei, r => r.data.attributes.entity.jurisdiction = 'US', r => r.data.attributes.entity.status = 'INACTIVE', r => r.data.attributes.entity.legalName.name = 'Another issuer']) {
      const bad = structuredClone(record); mutate(bad); assert.throws(() => readOfficialClassIssuerBridge(source(bad)), /CURRENT_ENTITY_CLASS_ISSUER_CONFLICT/);
    }
    const input = source(record); const wrongClass = notice.replace('FI0009000681', 'FI0009005987'); writeFileSync(releasePath, wrongClass);
    assert.throws(() => readOfficialClassIssuerBridge({ ...input, release: { ...input.release, sha256: sha(wrongClass) } }), /EXACT_ISSUER_CLASS_RELATIONSHIP_REQUIRED/);
    const upm = '<p>Issuer: UPM-Kymmene Corporation LEI: 213800EC6PW5VU4J9U64 Notification type: INITIAL NOTIFICATION</p><p>Transaction date: 2026-04-30 Venue: NASDAQ HELSINKI LTD (XHEL) Instrument type: SHARE ISIN: FI0009005987</p>';
    const upmRecord = { data: { id: '213800EC6PW5VU4J9U64', attributes: { lei: '213800EC6PW5VU4J9U64', entity: { status: 'ACTIVE', category: 'GENERAL', jurisdiction: 'FI', legalName: { name: 'UPM-KYMMENE OYJ' }, otherNames: [{ name: 'UPM-KYMMENE CORPORATION' }] } } } };
    writeFileSync(releasePath, upm); const upmBytes = JSON.stringify(upmRecord); writeFileSync(entityPath, upmBytes);
    const upmSource = { release: { kind: 'UPM_OFFICIAL_CLASS_NOTIFICATION', path: releasePath, sha256: sha(upm), httpStatus: 200,
      url: 'https://www.upm.com/news-and-stories/releases/2026/04/upm-kymmene-corporation-managers-transactions-ehrnrooth/' },
      entity: { path: entityPath, sha256: sha(upmBytes), httpStatus: 200, url: 'https://api.gleif.org/api/v1/lei-records/213800EC6PW5VU4J9U64' } };
    assert.equal(readOfficialClassIssuerBridge(upmSource).relationshipAsOf, '2026-04-30');
    const derivative = upm.replace('Instrument type: SHARE', 'Instrument type: DERIVATIVE'); writeFileSync(releasePath, derivative);
    assert.throws(() => readOfficialClassIssuerBridge({ ...upmSource, release: { ...upmSource.release, sha256: sha(derivative) } }), /EXACT_ISSUER_CLASS_RELATIONSHIP_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function requireDocument(path) { return readFileSync(path, 'utf8'); }
