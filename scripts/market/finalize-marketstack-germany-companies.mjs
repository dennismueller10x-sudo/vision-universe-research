// Analytical Company -> Security -> Listing census. No canonical or routing mutation.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), globalEquities = require('../../quant/engines/global-equities.js');
export function assessGermanPolicyReadiness(candidate, policy, observedHistoryBars) {
  const historyBars = Number.isFinite(observedHistoryBars) ? observedHistoryBars : Number.isFinite(candidate?.historyBars) ? candidate.historyBars : null;
  const gates = [];
  if (candidate?.coverage?.price !== 'VERIFIED') gates.push('EXISTING_VERIFIED_PRICE_COVERAGE_NOT_ESTABLISHED');
  if (!Number.isFinite(candidate?.avgDailyTurnoverUSD)) gates.push('EXISTING_USD_TURNOVER_UNVERIFIED_NO_FX_SYNTHESIS');
  else if (candidate.avgDailyTurnoverUSD < policy.minDailyTurnoverUSD) gates.push('EXISTING_USD_TURNOVER_THRESHOLD_NOT_MET');
  if (historyBars === null) gates.push('EXISTING_HISTORY_LENGTH_UNVERIFIED');
  else if (historyBars < policy.minHistoryBars) gates.push('EXISTING_MINIMUM_HISTORY_NOT_MET');
  if (candidate?.primaryListing !== true && !(candidate?.listingType === 'ADR' && candidate?.listingCountry === 'US')) gates.push('EXISTING_PRIMARY_OR_US_ADR_SELECTION_NOT_ESTABLISHED');
  if (candidate?.corporateActionBasis !== 'VERIFIED') gates.push('ADJUSTMENT_SAFETY_UNVERIFIED');
  const engineSelected = Boolean(candidate && globalEquities.selectPreferred([{ ...candidate, historyBars }], policy));
  return { existingEngineSelected: engineSelected, verifiedEligible: engineSelected && gates.length === 0, actualEligibility: null, observedHistoryBars: historyBars, avgDailyTurnoverUSD: Number.isFinite(candidate?.avgDailyTurnoverUSD) ? candidate.avgDailyTurnoverUSD : null, reasons: gates };
}
const sorted = values => [...new Set(values)].sort();
const counts = (rows, field) => Object.fromEntries(sorted(rows.map(r => r[field] || 'UNKNOWN')).map(key => [key, rows.filter(r => (r[field] || 'UNKNOWN') === key).length]));
export function classifyCFI(reference) {
  const prefixes = sorted((reference?.cfiReferences || []).map(r => r.cfi?.slice(0, 2)).filter(Boolean));
  if (!prefixes.length) return 'UNKNOWN';
  if (prefixes.length !== 1) return 'CONFLICTING_CFI';
  return ({ ES: 'ORDINARY_SHARE', EP: 'PREFERRED_SHARE', ED: 'DEPOSITARY_RECEIPT', EC: 'CONVERTIBLE_SHARE', EF: 'PREFERRED_CONVERTIBLE_SHARE' })[prefixes[0]] || (prefixes[0].startsWith('E') ? 'OTHER_EQUITY' : 'NON_EQUITY_CFI');
}
export function finalizeGermanCompanies(universe, issuers, validation, canonical, volumeObservations = [], options = {}) {
  if (!Array.isArray(universe?.equityListings) || !Array.isArray(issuers?.records) || !Array.isArray(validation?.listings) || !Array.isArray(canonical?.listings)) throw Error('GERMAN_COMPANY_INPUT_REQUIRED');
  const generatedAt = options.generatedAt || [universe.generatedAt, issuers.generatedAt, validation.generatedAt].filter(Boolean).sort().at(-1);
  if (!Number.isFinite(Date.parse(generatedAt))) throw Error('SNAPSHOT_TIMESTAMP_REQUIRED');
  const policy = options.existingPolicy || { minHistoryBars: 250, minDailyTurnoverUSD: 5000000 };
  if (!Number.isFinite(policy.minHistoryBars) || !Number.isFinite(policy.minDailyTurnoverUSD)) throw Error('EXISTING_GLOBAL_UNIVERSE_POLICY_REQUIRED');
  const issuerByISIN = new Map(issuers.records.map(r => [r.isin, r]));
  if (issuerByISIN.size !== issuers.records.length) throw Error('DUPLICATE_ISSUER_ISIN');
  const typeByISIN = new Map((options.securityReferences?.records || []).map(r => [r.isin, r]));
  const validationByIdentity = new Map(validation.listings.map(r => [[r.isin, r.mic].join('|'), r]));
  const canonicalByIdentity = new Map(canonical.listings.filter(r => r.assetType === 'EQUITY').map(r => [[r.isin, r.mic, r.tradingCurrency].join('|'), r]));
  const volumes = new Map();
  for (const row of volumeObservations) {
    if (!row.symbol || row.exchange !== 'XETR' || !Number.isFinite(row.volume) || row.volume < 0 || !Number.isFinite(Date.parse(row.date))) continue;
    const values = volumes.get(row.symbol) || []; values.push({ date: row.date.slice(0, 10), volume: row.volume }); volumes.set(row.symbol, values);
  }
  const groups = new Map();
  for (const row of universe.equityListings) {
    if (row.status !== 'CLASSIFIED_CANDIDATE' || row.assetType !== 'EQUITY' || !row.referenceIdentity?.isin) throw Error('GERMAN_CLASSIFIED_EQUITY_REQUIRED');
    const key = [row.referenceIdentity.isin, row.mic, row.referenceIdentity.tradingCurrency].join('|');
    const group = groups.get(key) || []; group.push(row); groups.set(key, group);
  }
  const listings = [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, aliases]) => {
    aliases.sort((a, b) => a.providerSymbol.localeCompare(b.providerSymbol, 'en'));
    const row = aliases[0], ref = row.referenceIdentity, issuer = issuerByISIN.get(ref.isin), sec = typeByISIN.get(ref.isin), c = canonicalByIdentity.get(key), v = validationByIdentity.get([ref.isin, row.mic].join('|'));
    const verifiedIssuer = ['EXACT_GLEIF_ISIN_LEI_REFERENCE','EXACT_ESMA_ISIN_LEI_REFERENCE'].includes(issuer?.status) && /^[A-Z0-9]{20}$/.test(issuer?.lei || '') && issuer?.companyId === 'LEI:' + issuer?.lei && /^[A-Z]{2}$/.test(issuer?.domicileCountry || '') && issuer?.domicileBasis === 'GLEIF_LEGAL_ADDRESS_COUNTRY' && !issuer?.issuerConflict && ['GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE','ESMA_FIRDS_EXACT_ISIN_ISSUER_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE'].includes(issuer?.sourceEvidence?.sourceSystem) && /^[a-f0-9]{64}$/.test(issuer?.sourceEvidence?.leiBatchResponseSHA256 || '') && issuer?.sourceEvidence?.leiRecordURL === 'https://api.gleif.org/api/v1/lei-records/' + issuer?.lei;
    const geography = verifiedIssuer ? issuer.domicileCountry === 'DE' ? 'GERMAN_DOMICILED_ISSUER' : 'FOREIGN_DOMICILED_ISSUER' : 'AMBIGUOUS_ISSUER_DOMICILE';
    const shareType = classifyCFI(sec), sample = (volumes.get(v?.providerSymbol) || []).sort((a, b) => a.date.localeCompare(b.date, 'en'));
    const positiveVolumeBars = sample.filter(r => r.volume > 0).length;
    const maxCalendarAgeDays = 3;
    const reasons = [];
    if (geography === 'AMBIGUOUS_ISSUER_DOMICILE') reasons.push('ISSUER_DOMICILE_UNVERIFIED');
    else if (geography === 'FOREIGN_DOMICILED_ISSUER') reasons.push('FOREIGN_ISSUER_OUTSIDE_GERMAN_CONSUMER_SCOPE');
    if (issuer?.entityStatus && issuer.entityStatus !== 'ACTIVE') reasons.push('ISSUER_LEGAL_ENTITY_NOT_ACTIVE');
    if (ref.active !== true) reasons.push(ref.active === false ? 'OFFICIAL_LISTING_INACTIVE' : 'LISTING_ACTIVE_STATUS_UNKNOWN');
    if (!['ORDINARY_SHARE', 'PREFERRED_SHARE'].includes(shareType)) reasons.push('SHARE_TYPE_REQUIRES_REVIEW');
    if (v?.metadataStatus === 'QUARANTINED' || sec?.issuerConflict || issuer?.issuerConflict) reasons.push('PROVIDER_OR_REGULATORY_IDENTITY_CONFLICT');
    if (!v || v.metadataStatus !== 'EXACT_IDENTITY_VERIFIED') reasons.push('PROVIDER_ISIN_IDENTITY_UNVERIFIED');
    if (!v || v.currentPriceStatus !== 'VALID') reasons.push('NO_VALIDATED_RECENT_OHLC_SAMPLE');
    if (v?.currentPriceStatus === 'VALID' && (!Number.isFinite(v.calendarAgeDays) || v.calendarAgeDays > maxCalendarAgeDays)) reasons.push('PRICE_FRESHNESS_GATE_FAILED');
    if (!sample.length) reasons.push('RECENT_VOLUME_UNAVAILABLE'); else if (!positiveVolumeBars) reasons.push('NO_POSITIVE_RECENT_TRADING_VOLUME');
    return { listingIdentityKey: key, listingId: c?.listingId || null, securityId: c?.securityId || 'sec_isin_' + ref.isin,
      analyticalCompanyId: verifiedIssuer ? issuer.companyId : null, canonicalCompanyId: c?.companyId || null,
      issuerLEI: verifiedIssuer ? issuer.lei : null, isin: ref.isin, providerSymbol: v?.providerSymbol || row.providerSymbol,
      providerAliases: sorted(aliases.map(r => r.providerSymbol)), mic: row.mic, tradingCurrency: ref.tradingCurrency,
      officialName: ref.officialName, legalName: verifiedIssuer ? issuer.legalName : null, issuerDomicileClassification: geography,
      domicileCountry: verifiedIssuer ? issuer.domicileCountry : null, incorporationJurisdiction: verifiedIssuer ? issuer.jurisdiction : null,
      headquartersCountry: verifiedIssuer ? issuer.headquartersCountry : null, issuerEntityStatus: verifiedIssuer ? issuer.entityStatus : null,
      instrumentActive: ref.active === true ? true : ref.active === false ? false : null, shareType,
      shareTypeEvidence: sec ? { cfiCodes: sorted(sec.cfiReferences.map(r => r.cfi)), sourceResponseSHA256: sec.responseSHA256 || null } : null,
      subtypeNameHints: { preferred: aliases.some(r => r.preferredNameHint), depositary: /\b(?:ADR|GDR|ADS|SPONSORED|DEPOSITARY)\b/i.test(ref.officialName) },
      isMultipleVenueSecurity: false, isAdditionalShareClassOfIssuer: false,
      providerIdentityStatus: v?.metadataStatus || 'NOT_TESTED', priceValidationStatus: v?.currentPriceStatus || 'NOT_TESTED',
      latestValidatedDate: v?.latestValidTradingDate || null, candleSampleCount: v?.candlesAdmittedForPriceValidation || 0,
      liquidityEvidence: { confidence: 'PARTIAL', basis: 'BOUNDED_OBSERVED_VOLUME_NOT_LONG_TERM_LIQUIDITY_CERTIFICATION', bars: sample.length, positiveVolumeBars,
        zeroVolumeBars: sample.filter(r => r.volume === 0).length, medianObservedVolume: sample.length ? sample.map(r => r.volume).sort((a, b) => a - b)[Math.floor(sample.length / 2)] : null },
      consumerDecision: reasons.length ? 'EXCLUDED_OR_PENDING_EVIDENCE' : 'ELIGIBLE_BOUNDED_EOD_CANDIDATE', primaryDecisionReason: reasons[0] || 'VALIDATED_GERMAN_ISSUER_IDENTITY_RECENT_PRICE_AND_TRADING', decisionReasons: reasons,
      existingUniversePolicyReadiness: assessGermanPolicyReadiness(c, policy, options.historyBarsByListing?.[c?.listingId]), selectedConsumerListing: false, technicalActivation: false, quantActivation: false, backtestActivation: false, productionActivated: false };
  });
  const bySecurity = new Map(), byCompany = new Map();
  for (const row of listings) {
    const ss = bySecurity.get(row.isin) || []; ss.push(row); bySecurity.set(row.isin, ss);
    if (row.analyticalCompanyId) { const cs = byCompany.get(row.analyticalCompanyId) || []; cs.push(row); byCompany.set(row.analyticalCompanyId, cs); }
  }
  for (const rows of bySecurity.values()) for (const row of rows) row.isMultipleVenueSecurity = new Set(rows.map(r => r.mic)).size > 1;
  const germanCompanies = [];
  for (const [id, rows] of [...byCompany].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    for (const row of rows) row.isAdditionalShareClassOfIssuer = new Set(rows.map(r => r.isin)).size > 1;
    if (rows[0].issuerDomicileClassification !== 'GERMAN_DOMICILED_ISSUER') continue;
    const eligible = rows.filter(r => r.consumerDecision === 'ELIGIBLE_BOUNDED_EOD_CANDIDATE').sort((a, b) =>
      (a.mic === 'XETR' ? 0 : 1) - (b.mic === 'XETR' ? 0 : 1) ||
      b.liquidityEvidence.medianObservedVolume - a.liquidityEvidence.medianObservedVolume || a.listingIdentityKey.localeCompare(b.listingIdentityKey, 'en'));
    if (eligible[0]) eligible[0].selectedConsumerListing = true;
    germanCompanies.push({ analyticalCompanyId: id, canonicalCompanyIds: sorted(rows.map(r => r.canonicalCompanyId).filter(Boolean)), issuerLEI: rows[0].issuerLEI,
      legalName: rows[0].legalName, domicileCountry: rows[0].domicileCountry, incorporationJurisdiction: rows[0].incorporationJurisdiction,
      headquartersCountry: rows[0].headquartersCountry, issuerEntityStatus: rows[0].issuerEntityStatus,
      uniqueSecurities: new Set(rows.map(r => r.isin)).size, uniqueListings: rows.length, securityISINs: sorted(rows.map(r => r.isin)),
      selectedConsumerListing: eligible[0]?.listingIdentityKey || null, eligibleSecurityCount: new Set(eligible.map(r => r.isin)).size,
      reasonsIfNotSelected: eligible.length ? [] : sorted(rows.flatMap(r => r.decisionReasons)) });
  }
  const german = listings.filter(r => r.issuerDomicileClassification === 'GERMAN_DOMICILED_ISSUER');
  const active = german.filter(r => r.instrumentActive === true && r.issuerEntityStatus === 'ACTIVE' && ['ORDINARY_SHARE', 'PREFERRED_SHARE', 'CONVERTIBLE_SHARE', 'PREFERRED_CONVERTIBLE_SHARE', 'OTHER_EQUITY'].includes(r.shareType));
  const observedEligible = german.filter(r => r.consumerDecision === 'ELIGIBLE_BOUNDED_EOD_CANDIDATE');
  return { schemaVersion: 'germany-company-listing-finalization-1.0.0', generatedAt, marketDataSnapshotAsOf: validation.generatedAt, scope: 'OBSERVED_EXACT_CLASSIFIED_GERMAN_VENUE_LISTINGS',
    countInterpretation: 'VERIFIED_SUBSET_LOWER_BOUNDS_UNMAPPED_ISSUERS_REMAIN_UNKNOWN',
    counts: { rawEquityProviderObservations: universe.equityListings.length, distinctEquityListingIdentities: listings.length, providerAliasSurplus: universe.equityListings.length - listings.length,
      uniqueSecurityISINs: bySecurity.size, securityISINsOnMultipleGermanVenues: [...bySecurity.values()].filter(rs => new Set(rs.map(r => r.mic)).size > 1).length,
      GermanDomiciledLegalSecurityIssuersVerified: germanCompanies.length, GermanDomiciledCompaniesVerified: new Set(german.filter(r => ['ORDINARY_SHARE', 'PREFERRED_SHARE'].includes(r.shareType)).map(r => r.issuerLEI)).size, GermanIncorporatedCompaniesVerified: new Set(german.filter(r => r.incorporationJurisdiction === 'DE' && ['ORDINARY_SHARE', 'PREFERRED_SHARE'].includes(r.shareType)).map(r => r.issuerLEI)).size,
      GermanDomiciledActiveEquitySecuritiesVerified: new Set(active.map(r => r.isin)).size, GermanDomiciledActiveEquityListingsVerified: active.length,
      GermanDomiciledBroadCashEquityListingCandidates: german.length, GermanDomiciledOrdinaryOrPreferredListingIdentitiesVerified: german.filter(r => ['ORDINARY_SHARE', 'PREFERRED_SHARE'].includes(r.shareType)).length, ForeignBroadCashEquityCandidatesTradedOnGermanVenuesVerified: listings.filter(r => r.issuerDomicileClassification === 'FOREIGN_DOMICILED_ISSUER').length, ForeignEquitiesTradedOnGermanVenuesVerified: listings.filter(r => r.issuerDomicileClassification === 'FOREIGN_DOMICILED_ISSUER' && ['ORDINARY_SHARE','PREFERRED_SHARE','CONVERTIBLE_SHARE','PREFERRED_CONVERTIBLE_SHARE','OTHER_EQUITY'].includes(r.shareType)).length,
      ForeignIssuerCompaniesVerified: [...byCompany.values()].filter(rs => rs[0].issuerDomicileClassification === 'FOREIGN_DOMICILED_ISSUER' && rs.some(r => ['ORDINARY_SHARE','PREFERRED_SHARE'].includes(r.shareType))).length,
      ambiguousIssuerListingIdentities: listings.filter(r => r.issuerDomicileClassification === 'AMBIGUOUS_ISSUER_DOMICILE').length,
      eligibleGermanEquitySecuritiesInBoundedSample: new Set(observedEligible.map(r => r.isin)).size, uniquePrimarySelectedConsumerListings: listings.filter(r => r.selectedConsumerListing).length, strictExistingPolicyVerifiedEligibleCompanies: new Set(german.filter(r => r.consumerDecision === 'ELIGIBLE_BOUNDED_EOD_CANDIDATE' && r.existingUniversePolicyReadiness.verifiedEligible).map(r => r.issuerLEI)).size, authoritativeExistingPolicyActualEligibleCompanies: null, researchProposalsWithObservedMedianVolumeUnder100Shares: listings.filter(r => r.selectedConsumerListing && r.liquidityEvidence.medianObservedVolume < 100).length,
      GermanCompaniesWithoutConsumerAdmissionEvidence: germanCompanies.filter(r => !r.selectedConsumerListing && r.securityISINs.some(isin => ['ORDINARY_SHARE','PREFERRED_SHARE'].includes(classifyCFI(typeByISIN.get(isin))))).length,
      authoritativeCompleteGermanCompanyTotal: null,
      shareTypesAllListings: counts(listings, 'shareType'), shareTypesGermanListings: counts(german, 'shareType'), uniqueGermanSecurityISINsByShareType: Object.fromEntries(sorted(german.map(r => r.shareType)).map(type => [type, new Set(german.filter(r => r.shareType === type).map(r => r.isin)).size])), byDomicileClassification: counts(listings, 'issuerDomicileClassification'),
      officialInactiveListingIdentities: listings.filter(r => r.instrumentActive === false).length, decisions: counts(listings, 'primaryDecisionReason') },
    existingUniversePolicy: { policySHA256: options.policySHA256 || null, schemaVersion: policy.schemaVersion || null, minHistoryBars: policy.minHistoryBars, minDailyTurnoverUSD: policy.minDailyTurnoverUSD, source: 'quant/config/global-equities.json', engine: 'quant/engines/global-equities.js#selectPreferred', requirementScope: 'APPLIES_TO_ALL_GLOBAL_CONSUMER_SELECTION_CANDIDATES', rawCurrencyConversionPerformed: false },
    selectionPolicy: { inheritedPriceFreshnessCalendarDays: 3, minimumMarketCap: null, productionActivation: false,
      companyDedupKey: 'EXACT_VERIFIED_ISSUER_LEI', securityDedupKey: 'ISIN', listingDedupKey: 'ISIN_MIC_TRADING_CURRENCY',
      selectionOrder: ['ELIGIBILITY_GATES', 'XETRA_PREFERENCE', 'HIGHER_OBSERVED_MEDIAN_VOLUME', 'DETERMINISTIC_LISTING_IDENTITY_KEY'],
      liquidityThreshold: 'AT_LEAST_ONE_POSITIVE_VOLUME_BAR_IN_EXISTING_VALIDATED_BOUNDED_SAMPLE',
      note: 'Positive short-sample volume rejects demonstrably dead samples; it does not certify long-term liquidity. No market-cap threshold or inferred company identity.' },
    germanCompanies, selectedConsumerListings: listings.filter(r => r.selectedConsumerListing), listings,
    limitations: ['Company counts identify legal security issuers, not economic groups or assumed depositary-underlying parents.',
      'German domicile means independently verified legal-address country DE; incorporation jurisdiction and headquarters remain separate.',
      'German company count covers verified ordinary/preferred share issuers. Broad cash-equity legal issuer count separately retains receipts and fund-class references.',
      'Non-E CFI means fund/other class requires role review, not automatically ETF; legal REIT companies can have collective-instrument CFI.',
      'Unknown domicile cannot be counted as German or foreign. Complete domestic totals remain null where issuer evidence is absent.',
      'Generic T7 CS means equity instrument, not a proven ordinary share. Share rights require exact regulatory CFI evidence.',
      'ACTIVE legal entity, LEI registration and active venue reference do not prove recent trading, history completeness or adjustment safety.',
      'Existing production selection requires the protected minimum250 history bars and5mUSD average daily turnover plus verified price/primary-listing coverage. Research proposals do not bypass these requirements.',
      'Selected entries are proposals with PARTIAL long-term-liquidity confidence, analytical bounded EOD candidates; no canonical, consumer runtime, technical, Quant, SuperTrader or backtest activation.',
      'One selected listing per verified company avoids multi-venue/share-class inflation; other securities remain represented in the audit.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = key => process.argv.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3), read = key => JSON.parse(readFileSync(arg(key), 'utf8'));
  const probe = read('probe'), observations = probe.endpoints.filter(r => r.ok && r.label === 'germany-full-equity-latest-week').flatMap(r => r.data?.data || []);
  const inputs = ['universe', 'issuers', 'validation', 'canonical', 'security-references', 'probe'];
  const policyPath = arg('policy') || 'quant/config/global-equities.json', policyBytes = readFileSync(policyPath), existingPolicy = JSON.parse(policyBytes), historyBarsByListing = {}, historyInputs = [];
  for (const row of read('canonical').listings) {
    if (!/^[A-Za-z0-9_-]+$/.test(row.listingId)) throw Error('UNSAFE_CANONICAL_LISTING_ID');
    const file = join(dirname(arg('canonical')), 'history', row.listingId + '.json');
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file), history = JSON.parse(bytes);
    if (history.listingId !== row.listingId || history.currency !== row.tradingCurrency || !Array.isArray(history.bars)) throw Error('POLICY_HISTORY_IDENTITY_MISMATCH');
    historyBarsByListing[row.listingId] = history.bars.length; historyInputs.push({ inputPath: file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const out = finalizeGermanCompanies(read('universe'), read('issuers'), read('validation'), read('canonical'), observations,
    { securityReferences: read('security-references'), generatedAt: arg('generated-at'), existingPolicy, policySHA256: createHash('sha256').update(policyBytes).digest('hex'), historyBarsByListing });
  out.existingUniversePolicy.historyInputProvenance = historyInputs;
  out.inputProvenance = inputs.map(key => ({ role: key, inputPath: arg(key), sha256: createHash('sha256').update(readFileSync(arg(key))).digest('hex') }));
  writeFileSync(arg('out'), JSON.stringify(out, null, 2) + '\n');
  if (arg('consumer-out')) writeFileSync(arg('consumer-out'), JSON.stringify({ schemaVersion: 'germany-consumer-selection-1.0.0', generatedAt: out.generatedAt, counts: out.counts, selectionPolicy: out.selectionPolicy, companies: out.germanCompanies, selectedConsumerListings: out.selectedConsumerListings, limitations: out.limitations, inputProvenance: out.inputProvenance, existingUniversePolicy: out.existingUniversePolicy }, null, 2) + '\n');
}
