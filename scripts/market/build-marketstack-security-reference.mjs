// Official FIRDS facets classify securities independently of provider ticker/name hints.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Exact reviewed operating-venue entities observed as FIRDS-only issuer proxies.
// Listed exchange parent companies and direct ANNA/GLEIF ISIN links are unaffected.
export const REPORTING_VENUE_PROXY_LEIS = Object.freeze([
  '391200OUOEWDQSEJ0Y74', '391200Z7ZWISADXEGZ47', '213800D1EI4B9WTWWD28', '969500HMVSZ0TCV65D58',
  '254900ERRPSKE7UZH711', '213800EEC95PRUCEUP63', '959800UYJM40XUGVGG78', '213800R54EFFINMY1P02'
]);

export function buildSecurityReference(captured, options = {}) {
  if (!Array.isArray(captured?.batches) || !Array.isArray(captured?.records)) throw Error('FIRDS_CAPTURE_REQUIRED');
  const sourceBySHA = new Map(captured.batches.map(batch => {
    if (!/^https:\/\/registers\.esma\.europa\.eu\/solr\/esma_registers_firds\/select\?/.test(batch.url) || !/^[a-f0-9]{64}$/.test(batch.sha256) || !Number.isFinite(Date.parse(batch.retrievedAt))) throw Error('FIRDS_PROVENANCE_REQUIRED');
    const query = new URL(batch.url);
    if (query.searchParams.get('facet.limit') !== '-1' || !query.searchParams.get('q')?.includes('latest_received_flag:1') || !query.searchParams.get('q')?.includes('never_published_flag:0')) throw Error('FIRDS_CURRENT_UNTRUNCATED_FACETS_REQUIRED');
    return [batch.sha256, batch];
  }));
  const seen = new Set();
  const records = captured.records.map(row => {
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin) || seen.has(row.isin)) throw Error('FIRDS_ISIN_CONFLICT'); seen.add(row.isin);
    const batch = sourceBySHA.get(row.responseSHA256);
    if (!batch || !batch.requestedISINs.includes(row.isin)) throw Error('FIRDS_SOURCE_ISIN_MISMATCH');
    const refs = row.cfiReferences.map(ref => {
      if (!/^[A-Z]{6}$/.test(ref.cfi) || !Number.isSafeInteger(ref.observations) || ref.observations < 1) throw Error('INVALID_FIRDS_CFI');
      for (const l of ref.leiObservations) if (!/^[A-Z0-9]{20}$/.test(l.lei) || !Number.isSafeInteger(l.observations) || l.observations < 1) throw Error('INVALID_FIRDS_ISSUER');
      return { cfi: ref.cfi, observations: ref.observations, leiObservations: ref.leiObservations.slice().sort((a, b) => a.lei.localeCompare(b.lei, 'en')) };
    }).sort((a, b) => a.cfi.localeCompare(b.cfi, 'en'));
    const leis = [...new Set(refs.flatMap(r => r.leiObservations.map(l => l.lei)))].sort();
    return { isin: row.isin, observations: row.observations, cfiReferences: refs, issuerLEICandidates: leis,
      issuerConflict: leis.length > 1, responseSHA256: row.responseSHA256, retrievedAt: row.retrievedAt };
  }).sort((a, b) => a.isin.localeCompare(b.isin, 'en'));
  return { schemaVersion: 'marketstack-regulatory-security-reference-1.0.0', generatedAt: options.generatedAt || captured.batches.map(b => b.retrievedAt).sort().at(-1),
    scope: 'STRICT_EQUITY_AND_OFFICIAL_OPERATOR_CANDIDATE_ISINS',
    sources: captured.batches.map(({ requestedISINs, ...batch }) => batch),
    counts: { requestedISINs: new Set(captured.batches.flatMap(b => b.requestedISINs)).size, observedISINs: records.length,
      uniqueIssuerLEIs: new Set(records.flatMap(r => r.issuerLEICandidates)).size, issuerConflicts: records.filter(r => r.issuerConflict).length,
      publicReferenceHTTPRequests: captured.batches.length, MarketstackCreditsUsed: 0 }, records,
    limitations: ['FIRDS latest-received published reference facets describe exact ISIN security type and reported issuer LEI, not recent exchange trading.',
      'CFI conflicts and absent CFI/issuer fields remain explicit. Facet counts are reporting-reference observations, not listing or company counts.',
      'Generic cash-stock provider/reference types never override a regulatory fund/depositary CFI.',
      'CFI classes ES ordinary, EP preferred and ED depositary distinguish legal instrument type; voting/other rights are not invented.',
      'CFI instrument class does not establish ETF status, UCITS authorization, issuer domicile, active stock status or price compatibility.'] };
}
export function extendIssuerReference(reference, securities, capturedLEIs, options = {}) {
  const gleif = new Map(capturedLEIs.records.map(r => [r.id, r]));
  const batchByLEI = new Map(capturedLEIs.batches.flatMap(b => b.requestedLEIs.map(lei => [lei, b])));
  const secByISIN = new Map(securities.records.map(r => [r.isin, r]));
  const records = reference.records.map(row => {
    const sec = secByISIN.get(row.isin), leis = sec?.issuerLEICandidates || [];
    if (row.lei && leis.length && (leis.length !== 1 || leis[0] !== row.lei)) return { ...row, status: 'REGULATORY_ISSUER_CONFLICT', issuerConflict: true, conflictingRegulatoryIssuerLEIs: leis };
    if (!row.lei && leis.length === 1 && REPORTING_VENUE_PROXY_LEIS.includes(leis[0])) {
      const operator = options.reportingVenueProxyReference;
      const registrations = operator?.records?.filter(r => r.LEI === leis[0]) || [];
      if (!registrations.length || !/^[a-f0-9]{64}$/.test(operator.responseSHA256)) throw Error('REPORTING_VENUE_PROXY_REFERENCE_REQUIRED');
      return { ...row, status: 'REGULATORY_REPORTING_VENUE_ISSUER_AMBIGUOUS', leiCandidates: leis, issuerConflict: true,
        reportingVenueCandidate: { lei: leis[0], legalName: gleif.get(leis[0])?.attributes?.entity?.legalName?.name || null,
          registeredMICs: registrations.map(r => r.MIC).sort(), registrationSourceURL: operator.sourceURL, registrationResponseSHA256: operator.responseSHA256, registrationRetrievedAt: operator.retrievedAt },
        regulatorySourceEvidence: { responseSHA256: sec.responseSHA256, retrievedAt: sec.retrievedAt }, issuerRejectionReason: 'FIRDS_ONLY_OPERATING_VENUE_LEI_PROXY_NOT_VERIFIED_SECURITY_ISSUER' };
    }
    if (row.lei || leis.length !== 1 || !gleif.has(leis[0])) return { ...row, ...(sec ? { regulatorySourceEvidence: { responseSHA256: sec.responseSHA256, retrievedAt: sec.retrievedAt } } : {}) };
    const lei = leis[0], r = gleif.get(lei), e = r.attributes.entity, b = batchByLEI.get(lei);
    if (!b) throw Error('ESMA_ISSUER_LEGAL_REFERENCE_SOURCE_MISSING');
    return { isin: row.isin, status: 'EXACT_ESMA_ISIN_LEI_REFERENCE', lei, companyId: 'LEI:' + lei, legalName: e.legalName?.name || null,
      domicileCountry: e.legalAddress?.country || null, domicileBasis: 'GLEIF_LEGAL_ADDRESS_COUNTRY', jurisdiction: e.jurisdiction || null,
      headquartersCountry: e.headquartersAddress?.country || null, entityStatus: e.status || null, registrationStatus: r.attributes.registration?.status || null,
      registrationAuthority: e.registeredAt?.id || null, registeredAs: e.registeredAs || null,
      sourceEvidence: { sourceSystem: 'ESMA_FIRDS_EXACT_ISIN_ISSUER_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE', regulatoryResponseSHA256: sec.responseSHA256,
        regulatoryRetrievedAt: sec.retrievedAt, leiBatchResponseSHA256: b.sha256, leiRecordURL: 'https://api.gleif.org/api/v1/lei-records/' + lei, retrievedAt: b.retrievedAt } };
  });
  return { ...reference, generatedAt: options.generatedAt || [...capturedLEIs.batches.map(b => b.retrievedAt), securities.generatedAt, options.reportingVenueProxyReference?.retrievedAt].filter(Boolean).sort().at(-1),
    scope: 'STRICT_EQUITY_AND_OFFICIAL_OPERATOR_CANDIDATE_ISINS', sources: { ...reference.sources,
      leiRecordBatches: capturedLEIs.batches.map(({ requestedLEIs, ...b }) => b), reportingVenueProxyReference: options.reportingVenueProxyReference ? { sourceURL: options.reportingVenueProxyReference.sourceURL, responseSHA256: options.reportingVenueProxyReference.responseSHA256, retrievedAt: options.reportingVenueProxyReference.retrievedAt } : null, regulatorySecurityReference: { schemaVersion: securities.schemaVersion, generatedAt: securities.generatedAt, sources: securities.sources } },
    counts: { requestedISINs: records.length, mappedISINs: records.filter(r => r.lei && !r.issuerConflict).length,
      directGLEIFMappedISINs: records.filter(r => r.status === 'EXACT_GLEIF_ISIN_LEI_REFERENCE').length,
      supplementalESMAMappedISINs: records.filter(r => r.status === 'EXACT_ESMA_ISIN_LEI_REFERENCE').length,
      uniqueVerifiedIssuerLEIs: new Set(records.filter(r => !r.issuerConflict).map(r => r.lei).filter(Boolean)).size,
      unmappedISINs: records.filter(r => !r.lei).length, mappingConflicts: records.filter(r => r.status === 'MAPPING_CONFLICT' || r.status === 'REGULATORY_ISSUER_CONFLICT').length, reportingVenueIssuerProxies: records.filter(r => r.status === 'REGULATORY_REPORTING_VENUE_ISSUER_AMBIGUOUS').length,
      publicReferenceHTTPRequests: capturedLEIs.batches.length + securities.sources.length + 1 + (options.reportingVenueProxyReference ? 1 : 0), MarketstackCreditsUsed: 0 }, records };
}

export function buildCanonicalRegulatoryConflicts(canonical, accepted, securities) {
  const sec = new Map(securities.records.map(r => [r.isin, r])), base = new Set(accepted.listings.map(r => r.listingId));
  const conflicts = canonical.listings.filter(r => r.assetType === 'EQUITY' && sec.has(r.isin)).flatMap(r => {
    const ref = sec.get(r.isin), categories = [...new Set(ref.cfiReferences.map(x => x.cfi[0]))];
    if (!categories.length || categories.length === 1 && categories[0] === 'E') return [];
    return [{ listingId: r.listingId, securityId: r.securityId, isin: r.isin, symbol: r.ticker, mic: r.mic,
      CFICodes: ref.cfiReferences.map(x => x.cfi), referenceResponseSHA256: ref.responseSHA256, retrievedAt: ref.retrievedAt,
      hasDeliveredHistory: ['FULL','PARTIAL'].includes(r.coverage?.price_history), coverage: r.coverage,
      legacyAccepted58: base.has(r.listingId), decision: 'LEGAL_INSTRUMENT_ROLE_REVIEW_NO_AUTOMATIC_ETF_OR_FUND_CONVERSION' }];
  });
  return { schemaVersion: 'marketstack-canonical-security-class-conflicts-1.0.0', generatedAt: securities.generatedAt,
    currentReferenceFilter: 'latest_received_flag:1 AND never_published_flag:0; current published security reference facets, not recent-trade certification',
    conflicts, counts: { listings: conflicts.length, accepted58: conflicts.filter(r => r.legacyAccepted58).length, withHistory: conflicts.filter(r => r.hasDeliveredHistory).length }, productionMutation: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = key => process.argv.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3);
  const captured = JSON.parse(readFileSync(arg('captured'), 'utf8')), securities = buildSecurityReference(captured, { generatedAt: arg('generated-at') });
  writeFileSync(arg('out'), JSON.stringify(securities, null, 2) + '\n');
  if (arg('canonical') && arg('accepted-baseline') && arg('conflicts-out')) {
    const canonical = JSON.parse(readFileSync(arg('canonical'), 'utf8')), accepted = JSON.parse(readFileSync(arg('accepted-baseline'), 'utf8'));
    const conflicts = buildCanonicalRegulatoryConflicts(canonical, accepted, securities);
    conflicts.securityReferenceArtifact = arg('out'); conflicts.securityReferenceSHA256 = createHash('sha256').update(readFileSync(arg('out'))).digest('hex');
    writeFileSync(arg('conflicts-out'), JSON.stringify(conflicts, null, 2) + '\n');
  }
  if (arg('issuer-reference')) {
    const issuer = JSON.parse(readFileSync(arg('issuer-reference'), 'utf8')), lei = JSON.parse(readFileSync(arg('lei-record-index'), 'utf8'));
    writeFileSync(arg('issuer-out'), JSON.stringify(extendIssuerReference(issuer, securities, lei, { generatedAt: arg('generated-at'), reportingVenueProxyReference: arg('operator-reference') ? JSON.parse(readFileSync(arg('operator-reference'), 'utf8')) : undefined }), null, 2) + '\n');
  }
}
