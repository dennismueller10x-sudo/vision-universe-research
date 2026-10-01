// Read-only normalization of official GLEIF/ANNA identity evidence. No provider calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function buildIssuerReference(mapping, captured, options = {}) {
  if (!Array.isArray(mapping?.isins) || !mapping.mappings || !Array.isArray(captured?.records) || !Array.isArray(captured?.batches)) throw Error('ISSUER_REFERENCE_INPUT_REQUIRED');
  const records = new Map();
  for (const record of captured.records) {
    if (!/^[A-Z0-9]{20}$/.test(record.id) || record.attributes?.lei !== record.id) throw Error('INVALID_GLEIF_LEI');
    if (records.has(record.id) && JSON.stringify(records.get(record.id)) !== JSON.stringify(record)) throw Error('CONFLICTING_LEI_RECORD');
    records.set(record.id, record);
  }
  const batchByLEI = new Map();
  for (const batch of captured.batches) {
    if (!Array.isArray(batch.requestedLEIs) || !/^https:\/\/api\.gleif\.org\/api\/v1\/lei-records\?/.test(batch.url) || !/^[a-f0-9]{64}$/.test(batch.sha256) || !Number.isFinite(Date.parse(batch.retrievedAt))) throw Error('GLEIF_SOURCE_PROVENANCE_REQUIRED');
    for (const lei of batch.requestedLEIs) batchByLEI.set(lei, batch);
  }
  const rows = [...new Set(mapping.isins)].sort().map(isin => {
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw Error('INVALID_ISIN');
    const leis = [...new Set(mapping.mappings[isin] || [])].sort();
    if (leis.length !== 1 || !records.has(leis[0])) return { isin, status: !leis.length ? 'UNMAPPED' : leis.length > 1 ? 'MAPPING_CONFLICT' : 'LEI_RECORD_UNAVAILABLE', leiCandidates: leis };
    const lei = leis[0], record = records.get(lei), entity = record.attributes.entity, batch = batchByLEI.get(lei);
    if (!batch) throw Error('LEI_SOURCE_MISSING');
    return { isin, status: 'EXACT_GLEIF_ISIN_LEI_REFERENCE', lei, companyId: 'LEI:' + lei, legalName: entity.legalName?.name || null,
      domicileCountry: entity.legalAddress?.country || null, domicileBasis: 'GLEIF_LEGAL_ADDRESS_COUNTRY', jurisdiction: entity.jurisdiction || null,
      headquartersCountry: entity.headquartersAddress?.country || null, entityStatus: entity.status || null,
      registrationStatus: record.attributes.registration?.status || null, registrationAuthority: entity.registeredAt?.id || null, registeredAs: entity.registeredAs || null,
      sourceEvidence: { sourceSystem: 'GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE', mappingZipSHA256: mapping.zipSHA256,
        leiBatchResponseSHA256: batch.sha256, leiRecordURL: 'https://api.gleif.org/api/v1/lei-records/' + lei, retrievedAt: batch.retrievedAt } };
  });
  const generatedAt = options.generatedAt || [...captured.batches].map(b => b.retrievedAt).sort().at(-1);
  if (!Number.isFinite(Date.parse(generatedAt))) throw Error('REFERENCE_TIMESTAMP_REQUIRED');
  return { schemaVersion: 'marketstack-issuer-reference-1.0.0', scope: 'EUROPE_STRICT_EQUITY_CANDIDATE_ISINS', generatedAt,
    sources: { isinToLEI: { sourceURL: options.mappingURL || 'https://mapping.gleif.org/api/v2/isin-lei/e97d8029-a1af-4784-92d5-1eefbb456278/download',
      discoveryURL: 'https://www.gleif.org/en/lei-data/lei-mapping/download-isin-to-lei-relationship-files', sourceDate: options.sourceDate || '2026-10-01',
      zipSHA256: mapping.zipSHA256, csvName: mapping.csvName, totalSourceMappingRows: mapping.totalMappingRows },
      leiRecordBatches: captured.batches.map(({ requestedLEIs, ...batch }) => batch) },
    counts: { requestedISINs: rows.length, mappedISINs: rows.filter(r => r.status === 'EXACT_GLEIF_ISIN_LEI_REFERENCE').length,
      uniqueVerifiedIssuerLEIs: new Set(rows.map(r => r.lei).filter(Boolean)).size, unmappedISINs: rows.filter(r => r.status === 'UNMAPPED').length,
      mappingConflicts: rows.filter(r => r.status === 'MAPPING_CONFLICT').length, unavailableLEIRecords: rows.filter(r => r.status === 'LEI_RECORD_UNAVAILABLE').length,
      publicReferenceHTTPRequests: captured.batches.length + 1, MarketstackCreditsUsed: 0 }, records: rows,
    limitations: ['Issuer legal-address country, legal jurisdiction and headquarters country are separate fields.',
      'ACTIVE legal entity and ISSUED LEI registration do not prove active instrument trading.',
      'ISIN-to-LEI issuer does not automatically identify the economic underlying company of a depositary receipt.',
      'No company identity inferred from ISIN prefix, venue geography, names or group parent.',
      'Records are analytical identity evidence; existing canonical company/security/listing IDs are not rewritten.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = key => process.argv.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3);
  const mapping = JSON.parse(readFileSync(arg('mapping-subset'), 'utf8')), captured = JSON.parse(readFileSync(arg('lei-record-index'), 'utf8'));
  writeFileSync(arg('out'), JSON.stringify(buildIssuerReference(mapping, captured, { generatedAt: arg('generated-at') }), null, 2) + '\n');
}
