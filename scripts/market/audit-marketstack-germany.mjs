/** Offline German listing audit. No API calls, universe mutation or product admission.
 * Official venue instrument type is independent of issuer domicile and share rights.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), Canonical = require('../../quant/engines/global-market.js');
const Marketstack = require('../../providers/marketstack/adapter.js');

const countBy = (rows, key) => rows.reduce((counts, row) => {
  const value = key(row) ?? 'UNKNOWN'; counts[value] = (counts[value] || 0) + 1; return counts;
}, {});
const TYPES = Object.freeze({ CS: 'EQUITY', ETF: 'ETF', BOND: 'BOND', FUN: 'FUND', ETN: 'ETN', ETC: 'ETC', WAR: 'WARRANT', SR: 'RIGHT', OTHER: 'OTHER' });

/** Reconcile bounded/resumed directory pages; missing offsets stay explicit. */
export function collectGermanDirectoryPages(entries, requestedMics) {
  if (!Array.isArray(entries) || !Array.isArray(requestedMics)) throw new Error('Directory pages and requested MICs required');
  return requestedMics.map(mic => {
    const rows = [], batches = [], errors = [];
    for (const entry of entries.filter(e => e.endpoint?.replace(/^\//, '') === `exchanges/${mic}/tickers`)) {
      if (!entry.ok) { errors.push({ reason: entry.reason || 'ENDPOINT_ERROR', checkedAt: entry.checkedAt,
        httpStatus: entry.status ?? null, providerErrorType: entry.providerErrorType || null,
        providerErrorCode: entry.providerErrorCode || null, offset: entry.params?.offset ?? 0 }); continue; }
      const raw = Array.isArray(entry.data) ? entry.data : Array.isArray(entry.data?.data) ? entry.data.data : entry.data?.data?.tickers;
      const nestedPagination = entry.data?.pagination;
      const pagination = nestedPagination || entry.pagination;
      if (!Array.isArray(raw)) { errors.push({ reason: 'DIRECTORY_SHAPE_INVALID', checkedAt: entry.checkedAt }); continue; }
      // Legacy aggregate cursors may survive cached page splitting. The explicit
      // per-page payload owns its count/offset; a run-progress cursor is not end.
      const start = Number(entry.params?.offset ?? 0), end = start + raw.length;
      const total = pagination?.total;
      const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end - start === raw.length &&
        Number.isInteger(total) && end <= total && (!nestedPagination ||
          (Number(nestedPagination.offset) === start && (nestedPagination.count == null || Number(nestedPagination.count) === raw.length)));
      batches.push({ start, end, total, valid, rows: raw.length, checkedAt: entry.checkedAt, seeded: entry.seeded || false,
        legacyCursorIgnored: entry.nextOffset != null && entry.nextOffset !== end });
      if (valid) rows.push(...raw);
    }
    const totals = [...new Set(batches.map(b => b.total).filter(n => Number.isInteger(n)))];
    const reportedTotal = totals.length === 1 ? totals[0] : null;
    let cursor = 0; const gaps = [];
    for (const batch of batches.filter(b => b.valid).sort((a, b) => a.start - b.start)) {
      if (batch.start > cursor) gaps.push({ from: cursor, to: batch.start });
      cursor = Math.max(cursor, batch.end);
    }
    if (reportedTotal !== null && cursor < reportedTotal) gaps.push({ from: cursor, to: reportedTotal });
    return { mic, rows, complete: reportedTotal !== null && cursor === reportedTotal && gaps.length === 0 && batches.every(b => b.valid),
      reportedTotal, source: { batches, errors, gaps, inconsistentTotals: totals.length > 1 } };
  });
}

/** T7 semicolon CSV supports escaped quotes; this audit rejects malformed records. */
export function parseT7InstrumentMaster(text, provenance = {}) {
  if (typeof text !== 'string') throw new Error('T7 reference text required');
  const records = []; let cells = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') { cells.push(cell); cell = ''; }
    else if (ch === '\n') { cells.push(cell.replace(/\r$/, '')); if (cells.some(Boolean)) records.push(cells); cells = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('Unterminated T7 CSV quote');
  if (cell || cells.length) { cells.push(cell.replace(/\r$/, '')); records.push(cells); }
  if (records[0]?.[0]?.replace(/^\uFEFF/, '') !== 'Market:' || records[1]?.[0] !== 'Date Last Update:')
    throw new Error('Missing T7 market/update provenance');
  const mic = records[0][1], date = records[1][1];
  if (!/^[A-Z0-9]{4}$/.test(mic) || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) throw new Error('Invalid T7 market/update');
  const updatedAt = date.split('.').reverse().join('-');
  if (!Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString().slice(0, 10) !== updatedAt) throw new Error('Invalid T7 reference date');
  const header = records[2] || [];
  for (const required of ['Product Status', 'Instrument Status', 'Instrument', 'ISIN', 'Mnemonic', 'MIC Code', 'Instrument Type', 'Currency'])
    if (!header.includes(required)) throw new Error('Missing T7 column: ' + required);
  if (new Set(header).size !== header.length) throw new Error('Duplicate T7 reference column');
  const rows = records.slice(3).map(values => {
    if (values.length !== header.length) throw new Error('Malformed T7 reference row');
    const raw = Object.fromEntries(header.map((key, index) => [key, values[index].trim()]));
    if (raw['MIC Code'] !== mic) throw new Error('Reference row venue conflicts with T7 market');
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(raw.ISIN)) throw new Error('Reference ISIN missing');
    // Many valid Frankfurt bonds have no exchange mnemonic. Keep their identity
    // and type; they cannot participate in the provider-symbol exact join.
    return { mic, mnemonic: raw.Mnemonic || null, isin: raw.ISIN, name: raw.Instrument,
      officialInstrumentType: raw['Instrument Type'], assetType: TYPES[raw['Instrument Type']] || 'UNKNOWN',
      active: raw['Product Status'] === 'Active' && raw['Instrument Status'] === 'Active',
      productStatus: raw['Product Status'], instrumentStatus: raw['Instrument Status'],
      tradingCurrency: raw.Currency || null, settlementCurrency: raw['Settlement Currency'] || null,
      wkn: raw.WKN || null, primaryListingMIC: raw['Primary Market MIC Code'] || null,
      countryOfIssue: raw['Country Of Issue'] || null,
      preferredNameHint: raw['Instrument Type'] === 'CS' && /\b(?:VZO|VZ\.?|VORZUG)\b/i.test(raw.Instrument),
      issuerCountry: null, listingType: 'UNKNOWN' };
  });
  return { mic, updatedAt, source: { ...provenance, sourceLastUpdate: updatedAt, sha256: createHash('sha256').update(text).digest('hex') },
    rows, counts: { total: rows.length, active: rows.filter(r => r.active).length, byOfficialType: countBy(rows, r => r.officialInstrumentType) } };
}

/** Exact mnemonic plus the same venue only. Multiple references never pick a winner.
 * Caller supplies suffixes proven by provider metadata, not inferred from country.
 */
export function classifyGermanDirectory(directory, references, options = {}) {
  if (!directory?.mic || !Array.isArray(directory.rows) || !Array.isArray(references)) throw new Error('Directory/reference rows required');
  if (options.listingCountry !== 'DE') throw new Error('Verified German venue country required');
  const suffixes = options.providerSuffixes || ['.' + directory.mic];
  if (!suffixes.length || suffixes.some(s => typeof s !== 'string' || !s.startsWith('.'))) throw new Error('Explicit provider suffixes required');
  const byMnemonic = new Map();
  for (const ref of references.filter(r => r.mic === directory.mic)) {
    const values = byMnemonic.get(ref.mnemonic) || []; values.push(ref); byMnemonic.set(ref.mnemonic, values);
  }
  const bySymbol = new Map(); let invalidRows = 0;
  for (const raw of directory.rows) {
    if (typeof raw?.symbol !== 'string' || !raw.symbol.trim()) { invalidRows++; continue; }
    const values = bySymbol.get(raw.symbol) || []; values.push(raw); bySymbol.set(raw.symbol, values);
  }
  const listings = [];
  for (const [symbol, rawRows] of bySymbol) {
    const matchingSuffixes = suffixes.filter(suffix => symbol.endsWith(suffix));
    const mnemonic = matchingSuffixes.length === 1 ? symbol.slice(0, -matchingSuffixes[0].length) : null;
    const matches = mnemonic ? byMnemonic.get(mnemonic) || [] : [];
    const names = [...new Set(rawRows.map(r => r.name).filter(Boolean))];
    const eod = [...new Set(rawRows.map(r => r.has_eod).filter(v => typeof v === 'boolean'))];
    const intraday = [...new Set(rawRows.map(r => r.has_intraday).filter(v => typeof v === 'boolean'))];
    const providerMICs = [...new Set(rawRows.map(r => r.stock_exchange?.mic || r.mic).filter(Boolean))];
    const venueConflict = providerMICs.some(mic => mic !== directory.mic);
    const ref = matches.length === 1 ? matches[0] : null;
    const providerISINs = [...new Set(rawRows.map(r => r.isin || r.ISIN).filter(Boolean).map(v => String(v).trim().toUpperCase()))];
    const providerCurrencies = [...new Set(rawRows.map(r => r.trading_currency || r.tradingCurrency || r.price_currency || r.currency)
      .filter(Boolean).map(v => String(v).trim()).map(v => v === 'GBp' ? 'GBX' : v.toUpperCase()))];
    const identityConflict = Boolean(ref && (providerISINs.some(isin => isin !== ref.isin) ||
      providerCurrencies.some(currency => currency !== ref.tradingCurrency)));
    const status = venueConflict ? 'PROVIDER_VENUE_CONFLICT' : !mnemonic ? 'SYMBOL_SUFFIX_UNVERIFIED' :
      matches.length > 1 ? 'AMBIGUOUS_REFERENCE' : !ref ? 'REFERENCE_UNRESOLVED' : identityConflict ? 'PROVIDER_REFERENCE_IDENTITY_CONFLICT' : !ref.active ? 'OFFICIAL_INACTIVE' :
      ref.assetType === 'UNKNOWN' ? 'TYPE_UNKNOWN' : ['EQUITY', 'ETF'].includes(ref.assetType) ? 'CLASSIFIED_CANDIDATE' : 'EXCLUDED_NON_EQUITY_ETF';
    listings.push({ providerSymbol: symbol, providerNames: names, mic: directory.mic, listingCountry: 'DE',
      status, referenceIdentity: ref && !venueConflict && !identityConflict ? { isin: ref.isin, mnemonic: ref.mnemonic, officialName: ref.name,
        officialInstrumentType: ref.officialInstrumentType, active: ref.active, tradingCurrency: ref.tradingCurrency,
        settlementCurrency: ref.settlementCurrency, wkn: ref.wkn, primaryListingMIC: ref.primaryListingMIC,
        countryOfIssue: ref.countryOfIssue } : null,
      assetType: ref && !venueConflict && !identityConflict ? ref.assetType : 'UNKNOWN', listingType: 'UNKNOWN',
      preferredNameHint: ref && !venueConflict && !identityConflict ? ref.preferredNameHint : false,
      providerISINs, providerCurrencies, identityConflict,
      issuerCountry: null, germanISINNamespace: ref && !venueConflict && !identityConflict ? ref.isin.startsWith('DE') : null,
      eodDirectoryFlag: eod.length === 1 ? eod[0] : null, intradayDirectoryFlag: intraday.length === 1 ? intraday[0] : null,
      duplicateProviderRows: rawRows.length - 1, metadataConflict: eod.length > 1 || intraday.length > 1 || names.length > 1,
      historyValidation: 'UNCHECKED', corporateActionBasis: 'UNVERIFIED', fundamentalsCoverage: 'UNKNOWN',
      consumerEligibility: 'NOT_GRANTED', productionActivated: false });
  }
  const complete = directory.complete === true && Number.isInteger(directory.reportedTotal) &&
    bySymbol.size === directory.reportedTotal && invalidRows === 0;
  const equities = listings.filter(r => r.status === 'CLASSIFIED_CANDIDATE' && r.assetType === 'EQUITY');
  return { mic: directory.mic, source: directory.source || null, directoryComplete: complete,
    counts: { reportedInstruments: directory.reportedTotal ?? null, observedProviderRows: directory.rows.length,
      uniqueProviderSymbols: bySymbol.size, invalidProviderRows: invalidRows, duplicateProviderRows: directory.rows.length - invalidRows - bySymbol.size,
      byStatus: countBy(listings, r => r.status), classifiedEquityListingCandidates: equities.length,
      classifiedETFListingCandidates: listings.filter(r => r.status === 'CLASSIFIED_CANDIDATE' && r.assetType === 'ETF').length,
      equityPreferredNameHints: equities.filter(r => r.preferredNameHint).length,
      independentlyVerifiedCommonEquities: null, independentlyVerifiedPreferredEquities: null,
      germanIssuerEquities: null, equityGermanISINNamespace: equities.filter(r => r.germanISINNamespace).length },
    listings, limitations: ['Venue country, ISIN namespace, primary listing MIC and country of issue do not establish issuer domicile.',
      'CS proves the broad equity type, not common/preferred share rights. Preferred names are hints only.',
      'Directory flags and reference identity never grant history, corporate-action or consumer eligibility.'] };
}

/** Counts the proven subset, preserving unknown complete domestic/common totals. */
export function summarizeGermanyUniverse(audits, options = {}) {
  if (!Array.isArray(audits) || new Set(audits.map(a => a.mic)).size !== audits.length) throw new Error('One audit per venue required');
  const rows = audits.flatMap(a => a.listings || []);
  const equities = rows.filter(r => r.status === 'CLASSIFIED_CANDIDATE' && r.assetType === 'EQUITY');
  const classified = rows.filter(r => r.status === 'CLASSIFIED_CANDIDATE');
  const identityKey = row => [row.assetType, row.referenceIdentity.isin, row.mic, row.referenceIdentity.tradingCurrency].join('\0');
  const distinctClassified = [...new Map(classified.map(row => [identityKey(row), row])).values()];
  const distinctEquityListings = distinctClassified.filter(row => row.assetType === 'EQUITY');
  const byISIN = new Map();
  for (const row of equities) {
    const values = byISIN.get(row.referenceIdentity.isin) || []; values.push(row); byISIN.set(row.referenceIdentity.isin, values);
  }
  const requested = options.requestedVenues || audits.map(a => a.mic);
  const allDirectoriesObserved = requested.length > 0 && requested.every(mic => audits.find(a => a.mic === mic)?.directoryComplete === true);
  return { schemaVersion: 'germany-marketstack-universe-1.0.0', generatedAt: new Date().toISOString(),
    scope: 'SECURITIES_LISTED_ON_VERIFIED_GERMAN_VENUES', state: 'CLASSIFIED_SUBSET_NOT_FULL_DOMESTIC_EQUITY_UNIVERSE',
    requestedVenueCodes: requested, allRequestedDirectoriesObserved: allDirectoriesObserved,
    sources: options.sources || null,
    counts: { directoryRowsObserved: audits.reduce((n, a) => n + a.counts.observedProviderRows, 0),
      uniqueDirectoryListings: rows.length, classifiedEquityListingCandidates: equities.length,
      distinctEquityListingIdentities: distinctEquityListings.length,
      equityProviderAliasSurplus: equities.length - distinctEquityListings.length,
      distinctClassifiedListingIdentitiesByAssetType: countBy(distinctClassified, row => row.assetType),
      classifiedProviderAliasSurplusByAssetType: Object.fromEntries(['EQUITY', 'ETF'].map(type => [type,
        classified.filter(row => row.assetType === type).length - distinctClassified.filter(row => row.assetType === type).length])),
      distinctEquityISINs: byISIN.size, equityISINsOnMultipleVenues: [...byISIN.values()].filter(rs => new Set(rs.map(r => r.mic)).size > 1).length,
      preferredNameHints: equities.filter(r => r.preferredNameHint).length,
      equityGermanISINNamespace: equities.filter(r => r.germanISINNamespace).length,
      germanIssuerEquities: null, independentlyVerifiedCommonEquities: null,
      independentlyVerifiedPreferredEquities: null, completeAllVenueEquityUniverse: null,
      completeGermanDomesticEquityUniverse: null,
      unresolvedDirectoryListings: rows.filter(r => !['CLASSIFIED_CANDIDATE', 'EXCLUDED_NON_EQUITY_ETF', 'OFFICIAL_INACTIVE'].includes(r.status)).length,
      excludedNonEquityETFListings: rows.filter(r => r.status === 'EXCLUDED_NON_EQUITY_ETF').length,
      officialInactiveListings: rows.filter(r => r.status === 'OFFICIAL_INACTIVE').length,
      byAssetType: countBy(rows.filter(r => r.status === 'CLASSIFIED_CANDIDATE'), r => r.assetType),
      equityQuoteCurrencies: countBy(equities, r => r.referenceIdentity.tradingCurrency),
      equityHistoryUnchecked: equities.filter(r => r.historyValidation === 'UNCHECKED').length },
    venues: audits.map(({ listings, ...summary }) => summary),
    equityListings: equities,
    sharedSecurityListings: [...byISIN].filter(([, rs]) => rs.length > 1).map(([isin, rs]) => ({ isin,
      listings: rs.map(r => ({ mic: r.mic, providerSymbol: r.providerSymbol, tradingCurrency: r.referenceIdentity.tradingCurrency })) })),
    limitations: ['The equity count is an exact venue/reference-classified subset, not every German-domiciled issuer.',
      'ISIN prefix and primary-listing MIC are not issuer domicile. Company count and verified common/preferred counts remain unknown.',
      'Unresolved directory records are retained as unknown, never guessed from names or discarded as unsupported equities.',
      'Multiple venues of the same ISIN do not create additional companies or automatically become preferred consumer listings.',
      'Provider aliases are retained as evidence; distinct listing identities deduplicate asset type, ISIN, MIC and trading currency.',
      'Classification and directory coverage do not grant history, adjustment, technical or product eligibility.'] };
}

/** Metadata-only canonical foundation for central review; never writes/publishes.
 * IDs use the accepted importer convention. Existing listing/security IDs win.
 * Every new price/history capability is NONE; no candle or price is synthesized.
 */
export function buildGermanyIdentityFoundation(audits, referenceSources = [], existing = [], options = {}) {
  if (!Array.isArray(audits) || !Array.isArray(existing) || !Array.isArray(referenceSources)) throw new Error('Foundation inputs required');
  const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
  const groups = new Map(), decisions = [], listings = [];
  for (const row of audits.flatMap(a => a.listings || [])) {
    if (row.status !== 'CLASSIFIED_CANDIDATE' || !['EQUITY', 'ETF'].includes(row.assetType)) continue;
    if (row.metadataConflict) { decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'PROVIDER_METADATA_CONFLICT' }); continue; }
    const ref = row.referenceIdentity;
    if (!ref?.isin || !ref.mnemonic || !/^[A-Z]{3}$/.test(ref.tradingCurrency || '')) {
      decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'OFFICIAL_IDENTITY_OR_QUOTE_CURRENCY_MISSING' }); continue;
    }
    const key = [ref.isin, row.mic, ref.tradingCurrency].join('\0');
    const values = groups.get(key) || []; values.push(row); groups.set(key, values);
  }
  for (const values of [...groups.values()].sort((a, b) => a[0].providerSymbol.localeCompare(b[0].providerSymbol, 'en'))) {
    const row = values.slice().sort((a, b) => a.providerSymbol.localeCompare(b.providerSymbol, 'en'))[0], ref = row.referenceIdentity;
    const samePriorTicker = existing.filter(p => p.mic === row.mic && values.some(v => v.referenceIdentity.mnemonic === p.ticker));
    if (samePriorTicker.some(p => p.tradingCurrency && p.tradingCurrency !== ref.tradingCurrency)) {
      decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'EXISTING_LISTING_CURRENCY_CONFLICT' }); continue;
    }
    const matchingPrior = existing.filter(p => p.mic === row.mic && (p.ticker === ref.mnemonic || p.isin === ref.isin) &&
      (!p.tradingCurrency || p.tradingCurrency === ref.tradingCurrency));
    if (matchingPrior.length > 1 || values.some(v => v.assetType !== row.assetType) ||
      matchingPrior.some(p => (p.isin && p.isin !== ref.isin) || p.assetType !== row.assetType ||
        (p.ticker && !values.some(v => v.referenceIdentity.mnemonic === p.ticker)))) {
      decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'EXISTING_OR_REFERENCE_IDENTITY_AMBIGUOUS' }); continue;
    }
    const prior = matchingPrior[0], ticker = prior?.ticker || ref.mnemonic, key = ticker + '@' + row.mic;
    const knownSecurities = [...new Set(existing.filter(p => p.isin === ref.isin && p.assetType === row.assetType).map(p => p.securityId).filter(Boolean))];
    if (knownSecurities.length > 1) { decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'EXISTING_ISIN_SECURITY_ID_CONFLICT' }); continue; }
    const originalSource = referenceSources.find(s => (s.mic || s.market) === row.mic) || null;
    // Public metadata carries source URLs/dates/hashes, never local artifact paths.
    const allowedSourceKeys = ['mic', 'source_system', 'sourceSystem', 'source_url', 'sourceURL', 'discovery_url', 'discoveryURL',
      'source_last_update', 'sourceLastUpdate', 'retrieved_at', 'retrievedAt', 'sha256'];
    const source = originalSource ? Object.fromEntries(allowedSourceKeys.filter(k => originalSource[k] != null).map(k => [k, originalSource[k]])) : null;
    if (!source || !/^https:\/\//.test(source.source_url || source.sourceURL || '')) {
      decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: 'OFFICIAL_REFERENCE_PROVENANCE_MISSING' }); continue;
    }
    const audit = audits.find(a => a.mic === row.mic);
    const checkedAt = [audit?.source?.checkedAt, ...(audit?.source?.batches || []).map(b => b.checkedAt)]
      .filter(d => d && Number.isFinite(Date.parse(d))).sort().at(-1);
    const updatedAt = checkedAt || source?.retrieved_at || source?.retrievedAt;
    if (!updatedAt) throw new Error('Foundation observation provenance missing');
    const listing = { listingId: prior?.listingId || prior?.instrumentId || 'vu_' + hash(key),
      securityId: prior?.securityId || knownSecurities[0] || 'sec_isin_' + ref.isin,
      companyId: row.assetType === 'EQUITY' ? prior?.companyId || null : null,
      fundId: row.assetType === 'ETF' ? prior?.fundId || 'fund_' + hash(ref.isin) : null,
      ticker, name: ref.officialName, companyName: row.assetType === 'EQUITY' ? ref.officialName : null,
      aliases: [...new Set(values.flatMap(v => [v.providerSymbol, ...v.providerNames, v.referenceIdentity.mnemonic]).concat(prior?.aliases || []))],
      assetType: row.assetType, listingType: prior?.listingType || (row.preferredNameHint ? 'PREFERRED_HINT' : 'UNKNOWN'), preferredNameHint: row.preferredNameHint,
      isin: ref.isin, issuerLEI: prior?.issuerLEI || null, wkn: ref.wkn?.length === 9 && ref.wkn.startsWith('000') ? ref.wkn.slice(3) : ref.wkn,
      mic: row.mic, exchange: options.exchangeNames?.[row.mic] || row.mic, listingCountry: 'DE', listingRegion: 'EUROPE',
      country: prior?.country || null, region: prior?.region || null, reportingCurrency: prior?.reportingCurrency || null,
      tradingCurrency: ref.tradingCurrency, displayCurrency: ref.tradingCurrency, primaryListing: prior?.primaryListing ?? null,
      universeTier: 'EUROPE', adrRatio: prior?.adrRatio ?? null, adrRatioSource: prior?.adrRatioSource || null,
      active: true, activeBasis: 'OFFICIAL_T7_ACTIVE_PRODUCT_AND_INSTRUMENT', providerSymbol: prior?.providerSymbol || row.providerSymbol,
      providerAliases: values.map(v => v.providerSymbol), providerExchange: row.mic,
      classificationSource: 'AUTHENTICATED_DIRECTORY_EXACT_MIC_MNEMONIC_OFFICIAL_T7_TYPE',
      currencySource: source, identitySource: source, source: 'marketstack', sourceUpdatedAt: updatedAt,
      identityStatus: prior?.companyId ? 'EXISTING_ISSUER_LINK' : 'ISSUER_UNLINKED',
      identityConfidence: 'EXACT_DIRECTORY_REFERENCE_JOIN_PROVIDER_ISIN_NOT_INDEPENDENTLY_VERIFIED',
      corporateActionBasis: 'UNVERIFIED', quality: { status: 'METADATA_ONLY', priceBasis: 'UNAVAILABLE' },
      coverage: { price_eod: 'NONE', price_history: 'NONE', intraday: 'UNKNOWN', realtime: 'UNKNOWN',
        corporate_actions: 'UNKNOWN', fundamentals: 'NONE', technical: 'NONE', etf_holdings: row.assetType === 'ETF' ? 'UNKNOWN' : 'NONE' },
      branchPrepared: true, productionActivated: false };
    try { Canonical.validateListing(listing); }
    catch (error) { decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, status: 'BLOCKED', reason: error.message }); continue; }
    listings.push(listing);
    decisions.push({ providerSymbol: row.providerSymbol, mic: row.mic, listingId: listing.listingId, status: 'METADATA_PREPARED',
      retainedExistingListingId: Boolean(prior), providerAliasCount: values.length, historyAdmission: 'NONE' });
  }
  const layer = { schemaVersion: Canonical.VERSION, generatedAt: options.generatedAt || new Date().toISOString(), listings };
  Canonical.validate(layer);
  return { layer, decisions, counts: { listings: listings.length, equities: listings.filter(r => r.assetType === 'EQUITY').length,
    etfs: listings.filter(r => r.assetType === 'ETF').length, existingIDsRetained: decisions.filter(d => d.retainedExistingListingId).length,
    blocked: decisions.filter(d => d.status === 'BLOCKED').length, priceCoverageGranted: 0 },
    publication: 'CENTRAL_REVIEW_REQUIRED_NO_PUBLIC_WRITES',
    limitations: ['Metadata-only coverage never overwrites existing real histories during the central merge.',
      'Unknown issuer domicile and company identity stay null; no fund/company conflation or generated prices.',
      'Preferred name hints do not prove legal share rights; neither absence of a hint nor CS grants common-equity status.'] };
}

/** Current official constituent snapshot, joined by security ISIN and explicit venue.
 * retrievedAt is observation provenance and never becomes historical availability.
 */
export function compareGermanIndexCoverage(snapshot, audits, options = {}) {
  if (!Array.isArray(snapshot?.indices) || !snapshot.indices.length || !Array.isArray(audits)) throw new Error('Index snapshot/audits required');
  const listings = audits.flatMap(a => a.listings || []).filter(r => r.status === 'CLASSIFIED_CANDIDATE' && r.assetType === 'EQUITY');
  const byIdentity = new Map();
  for (const row of listings) {
    const key = row.referenceIdentity.isin + '\0' + row.mic; const values = byIdentity.get(key) || [];
    values.push(row); byIdentity.set(key, values);
  }
  return { generatedAt: new Date().toISOString(), sourceSystem: snapshot.sourceSystem, sourceURL: snapshot.sourceURL,
    snapshotSHA256: snapshot.snapshotSHA256 || null, compositionEffectiveAt: snapshot.compositionEffectiveAt || null,
    historicalMembershipAvailability: 'UNKNOWN', coverageLevel: 'OFFICIAL_CURRENT_SNAPSHOT_DIRECTORY_MATCH_NOT_HISTORY',
    indices: snapshot.indices.map(index => {
      if (!Array.isArray(index.components) || !index.retrievedAt || !index.officialPage) throw new Error('Index components/provenance required');
      const keys = index.components.map(row => row.isin + '\0' + row.mic);
      if (index.components.some(r => !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r.isin) || !/^[A-Z0-9]{4}$/.test(r.mic))) throw new Error('Explicit constituent ISIN/MIC required');
      if (new Set(keys).size !== keys.length) throw new Error('Duplicate index constituent identity');
      const complete = Number.isInteger(index.recordsTotal) && index.recordsTotal === index.components.length;
      const components = index.components.map(row => {
        const matches = byIdentity.get(row.isin + '\0' + row.mic) || [];
        const venue = audits.find(a => a.mic === row.mic);
        const officialSymbols = new Set((options.referenceRows || []).filter(ref => ref.active && ref.mic === row.mic && ref.isin === row.isin && ref.mnemonic)
          .flatMap(ref => (options.providerSuffixes?.[ref.mic] || []).map(suffix => ref.mnemonic + suffix)));
        for (const alias of options.providerAliasCandidates || []) if (alias.expectedISIN === row.isin && alias.mic === row.mic) officialSymbols.add(alias.providerSymbol);
        const directIdentityProbes = (options.identityProbes || []).filter(probe => /^tickers\/[^/]+$/.test(probe.endpoint || '')).flatMap(probe => {
          const requestedSymbol = probe.endpoint.slice('tickers/'.length), returned = probe.data;
          const exactReturnedIdentity = probe.ok === true && returned?.isin === row.isin && returned?.stock_exchange?.mic === row.mic;
          if (!officialSymbols.has(requestedSymbol) && !exactReturnedIdentity) return [];
          const symbolConflict = probe.ok === true && returned?.symbol !== requestedSymbol;
          const identityMatch = exactReturnedIdentity && !symbolConflict;
          return [{ requestedSymbol, checkedAt: probe.checkedAt || probe.retrievedAt || null,
            status: identityMatch ? 'EXACT_ISIN_VENUE_METADATA_MATCH' : probe.ok === true ? 'RETURNED_IDENTITY_MISMATCH' :
              probe.status === 404 ? 'REQUESTED_SYMBOL_NOT_FOUND' : 'REQUEST_UNAVAILABLE',
            httpStatus: probe.status || (probe.ok === true ? 200 : null), providerErrorCode: probe.providerErrorCode || null,
            returnedSymbol: returned?.symbol || null, returnedISIN: returned?.isin || null, returnedMIC: returned?.stock_exchange?.mic || null }];
        });
        return { ...row, directoryStatus: matches.length ? 'EXACT_ISIN_VENUE_MATCH' :
          venue?.directoryComplete ? 'ABSENT_CLASSIFIED_COMPLETE_DIRECTORY' : 'UNMATCHED_PARTIAL_DIRECTORY',
          providerSymbols: matches.map(r => r.providerSymbol), directIdentityProbes,
          directIdentityStatus: directIdentityProbes.some(p => p.status === 'EXACT_ISIN_VENUE_METADATA_MATCH') ? 'VERIFIED' :
            directIdentityProbes.length ? 'TESTED_WITHOUT_EXACT_MATCH' : 'UNMEASURED',
          historyValidation: 'NOT_ESTABLISHED_BY_MEMBERSHIP',
          consumerEligibility: 'NOT_GRANTED' };
      });
      return { index: index.index, indexISIN: index.indexISIN || null, officialPage: index.officialPage,
        retrievedAt: index.retrievedAt, compositionEffectiveAt: null, completeSnapshot: complete,
        observedComponents: components.length, reportedComponents: index.recordsTotal ?? null,
        exactISINVenueMatches: components.filter(c => c.directoryStatus === 'EXACT_ISIN_VENUE_MATCH').length,
        directMetadataIdentityMatches: components.filter(c => c.directIdentityStatus === 'VERIFIED').length,
        exactDirectoryOrMetadataIdentityMatches: components.filter(c => c.directoryStatus === 'EXACT_ISIN_VENUE_MATCH' || c.directIdentityStatus === 'VERIFIED').length,
        unmatchedComponentsDirectlyTested: components.filter(c => c.directoryStatus !== 'EXACT_ISIN_VENUE_MATCH' && c.directIdentityProbes.length).length,
        unmatchedObservedComponents: components.filter(c => c.directoryStatus !== 'EXACT_ISIN_VENUE_MATCH').length,
        fullIndexDirectoryCoverage: complete ? components.every(c => c.directoryStatus === 'EXACT_ISIN_VENUE_MATCH') : null,
        components };
    }), limitations: ['The snapshot is current as retrieved, with no constituent-effective date or historical PIT membership claim.',
      'Missing exact joins may reflect a stale directory, changed security/symbol or absent coverage; direct identity probes are required.',
      'A 404 establishes absence of the requested provider symbol at observation time, not every possible provider alias.',
      'US ADRs and another venue never substitute for the index constituent security/listing.'] };
}

/** Full captured candidate snapshot validation. Read-only; no public raw OHLC,
 * price publication, adjustment verification or technical admission. */
export function validateGermanEquityMarketData(audits, entries, options = {}) {
  if (!Array.isArray(audits) || !Array.isArray(entries)) throw new Error('Captured audits/entries required');
  const maxCalendarAgeDays = options.maxCalendarAgeDays ?? 7;
  if (!Number.isInteger(maxCalendarAgeDays) || maxCalendarAgeDays < 0) throw new Error('Explicit nonnegative freshness bound required');
  const candidates = audits.flatMap(audit => audit.listings || []).filter(row => row.mic === (options.mic || 'XETR') && row.assetType === 'EQUITY' && row.status === 'CLASSIFIED_CANDIDATE');
  if (new Set(candidates.map(row => row.providerSymbol)).size !== candidates.length) throw new Error('Unique candidate provider symbols required');
  const symbols = new Set(candidates.map(row => row.providerSymbol));
  const metadataEntries = entries.filter(entry => /^tickers\/[^/]+$/.test(entry.endpoint || '') && symbols.has(entry.endpoint.slice('tickers/'.length)));
  const priceEntries = entries.filter(entry => entry.label === (options.priceLabel || 'germany-full-equity-latest-week'));
  const metadataBySymbol = new Map(), pricesBySymbol = new Map(), batchIdentityProblems = new Map();
  for (const entry of metadataEntries) {
    if (!/^tickers\/[^/]+$/.test(entry.endpoint || '')) continue;
    const symbol = entry.endpoint.slice('tickers/'.length), rows = metadataBySymbol.get(symbol) || [];
    rows.push(entry); metadataBySymbol.set(symbol, rows);
  }
  const unrequestedReturnedSymbols = new Set();
  for (const entry of priceEntries) {
    const requested = String(entry.params?.symbols || '').split(',').filter(Boolean);
    const data = Array.isArray(entry.data) ? entry.data : entry.data?.data;
    if (!entry.ok || !Array.isArray(data)) continue;
    for (const raw of data) {
      if (!symbols.has(raw?.symbol) || !requested.includes(raw.symbol)) {
        unrequestedReturnedSymbols.add(String(raw?.symbol || '<missing>'));
        for (const symbol of requested.filter(symbol => symbols.has(symbol))) batchIdentityProblems.set(symbol, 'UNREQUESTED_OR_MISSING_RETURNED_SYMBOL');
        continue;
      }
      const rows = pricesBySymbol.get(raw.symbol) || []; rows.push({ raw, entry }); pricesBySymbol.set(raw.symbol, rows);
    }
  }
  const listings = candidates.map(candidate => {
    const symbol = candidate.providerSymbol, expected = candidate.referenceIdentity;
    const metadata = metadataBySymbol.get(symbol) || [], observations = pricesBySymbol.get(symbol) || [];
    const reasons = new Set(), issues = [], metadataEvidence = [];
    let exactMetadata = false, duplicateCandles = 0, currencyFilledFromOfficial = 0;
    for (const entry of metadata) {
      const row = entry.data?.data || entry.data;
      const evidence = { checkedAt: entry.checkedAt || entry.retrievedAt || null, httpStatus: entry.status || (entry.ok ? 200 : null),
        providerErrorCode: entry.providerErrorCode || null, returnedSymbol: row?.symbol || null,
        returnedISIN: row?.isin || null, returnedMIC: row?.stock_exchange?.mic || null, returnedAssetType: row?.item_type || row?.asset_type || null };
      metadataEvidence.push(evidence);
      if (!entry.ok || !row || Array.isArray(row)) continue;
      if (row.symbol !== symbol) reasons.add('METADATA_SYMBOL_MISMATCH');
      if (row.isin && row.isin !== expected.isin) reasons.add('METADATA_ISIN_MISMATCH');
      if (row.stock_exchange?.mic && row.stock_exchange.mic !== candidate.mic) reasons.add('METADATA_MIC_MISMATCH');
      const type = row.item_type || row.asset_type;
      if (type && Marketstack.assetType(type) !== 'equity') reasons.add('METADATA_ASSET_TYPE_MISMATCH');
      for (const key of ['price_currency', 'trading_currency', 'tradingCurrency', 'currency']) {
        if (row[key] && Marketstack.normalizeCurrency(row[key]) !== expected.tradingCurrency) reasons.add('METADATA_CURRENCY_MISMATCH');
      }
      if (row.symbol === symbol && row.isin === expected.isin && row.stock_exchange?.mic === candidate.mic) exactMetadata = true;
    }
    if (batchIdentityProblems.has(symbol)) reasons.add(batchIdentityProblems.get(symbol));
    const seen = new Map(), valid = [];
    for (const { raw, entry } of observations) {
      const checkedAt = entry.checkedAt || entry.retrievedAt || null;
      const mapping = { symbol, exchange: candidate.mic, mic: candidate.mic, currency: expected.tradingCurrency, assetType: 'equity' };
      const checked = Marketstack.normalizeBar(symbol, raw, mapping, { retrievedAt: checkedAt, adjustmentVerified: false });
      let problem = checked.ok ? null : checked.reason;
      if (!raw.exchange) problem = 'exchangeMissing';
      const date = checked.ok ? checked.bar.date : String(raw.date || '').slice(0, 10);
      if (!problem && ((entry.params?.date_from && date < entry.params.date_from) ||
        (entry.params?.date_to && date > entry.params.date_to) || !checkedAt || date > checkedAt.slice(0, 10))) problem = 'dateOutsideObservedRequest';
      if (problem) {
        issues.push({ date: date || null, reason: problem });
        if (['symbolMismatch', 'currencyMismatch', 'exchangeMismatch', 'exchangeMissing', 'assetTypeMismatch'].includes(problem)) reasons.add('PRICE_' + problem.toUpperCase());
        continue;
      }
      if (!raw.price_currency && !raw.currency) currencyFilledFromOfficial++;
      const fingerprint = JSON.stringify([raw.open, raw.high, raw.low, raw.close, raw.volume, raw.adj_open, raw.adj_high, raw.adj_low,
        raw.adj_close, raw.adj_volume, raw.split_factor, raw.dividend, raw.exchange, raw.price_currency || raw.currency || expected.tradingCurrency]);
      if (seen.has(date)) {
        duplicateCandles++;
        if (seen.get(date) !== fingerprint) reasons.add('CONTRADICTORY_DUPLICATE_CANDLE');
        continue;
      }
      seen.set(date, fingerprint); valid.push({ date, checkedAt });
    }
    valid.sort((a, b) => a.date.localeCompare(b.date));
    const latest = valid.at(-1), ageDays = latest ? Math.floor((Date.parse(latest.checkedAt.slice(0, 10)) - Date.parse(latest.date)) / 86400000) : null;
    const metadataStatus = reasons.size ? 'QUARANTINED' : exactMetadata ? 'EXACT_IDENTITY_VERIFIED' : metadata.length ? 'UNVERIFIED_RESPONSE' : 'UNMEASURED';
    const observedPriceQualityStatus = !valid.length ? (issues.length ? 'QUALITY_REJECTED' : 'MISSING') :
      ageDays > maxCalendarAgeDays ? 'STALE' : issues.length ? 'VALID_WITH_QUALITY_GAPS' : 'VALID';
    const currentPriceStatus = reasons.size ? 'QUARANTINED' : !exactMetadata ? 'IDENTITY_UNVERIFIED' : !valid.length ?
      (issues.length ? 'QUALITY_REJECTED' : 'MISSING') : ageDays > maxCalendarAgeDays ? 'STALE' : issues.length ? 'VALID_WITH_QUALITY_GAPS' : 'VALID';
    return { providerSymbol: symbol, isin: expected.isin, mic: candidate.mic, tradingCurrency: expected.tradingCurrency,
      metadataStatus, metadataEvidence, currentPriceStatus, observedPriceQualityStatus, quarantineReasons: [...reasons],
      candlesObserved: observations.length, candlesValidBeforeListingQuarantine: valid.length,
      candlesAdmittedForPriceValidation: exactMetadata && !reasons.size ? valid.length : 0,
      qualityRejectedCandles: issues.length, duplicateCandles, currencyFilledFromOfficial,
      latestValidTradingDate: reasons.size || !exactMetadata ? null : latest?.date || null,
      calendarAgeDays: reasons.size || !exactMetadata ? null : ageDays, qualityIssues: issues,
      historyDepth: 'NOT_ESTABLISHED_BY_WEEKLY_SAMPLE', adjustmentBasis: 'UNVERIFIED', technicalActivation: false, productionActivated: false };
  });
  return { schemaVersion: 'germany-marketstack-full-equity-validation-1.0.0', generatedAt: new Date().toISOString(),
    mic: options.mic || 'XETR', scope: 'ALL_OFFICIAL_REFERENCE_CLASSIFIED_DIRECTORY_EQUITY_CANDIDATES',
    freshness: { maxCalendarAgeDays, reference: 'PER_REQUEST_PROVIDER_CHECKED_AT', holidayCalendarInferred: false },
    counts: { candidates: listings.length, metadataRequestsObserved: metadataEntries.length, priceBatchesObserved: priceEntries.length,
      metadataFullAuditLabelObserved: metadataEntries.filter(entry => entry.label === (options.metadataLabel || 'germany-full-equity-metadata-validation')).length,
      metadataReusedEarlierLabelsObserved: metadataEntries.filter(entry => entry.label !== (options.metadataLabel || 'germany-full-equity-metadata-validation')).length,
      byMetadataStatus: countBy(listings, row => row.metadataStatus), byCurrentPriceStatus: countBy(listings, row => row.currentPriceStatus),
      byObservedPriceQualityStatus: countBy(listings, row => row.observedPriceQualityStatus),
      candlesObserved: listings.reduce((n, row) => n + row.candlesObserved, 0),
      candlesAdmittedForPriceValidation: listings.reduce((n, row) => n + row.candlesAdmittedForPriceValidation, 0),
      qualityRejectedCandles: listings.reduce((n, row) => n + row.qualityRejectedCandles, 0) },
    unrequestedReturnedSymbols: [...unrequestedReturnedSymbols], listings,
    limitations: ['No public raw OHLC, production activation or technical eligibility is granted by this read-only audit.',
      'Native currency is taken from the exact same-venue official instrument only when provider currency is absent; contradictions quarantine the listing.',
      'Seven calendar-day freshness is a configurable observation-age bound, not proof of a complete trading calendar or history.',
      'A failed or mismatched fresh metadata response never gains admission from directory membership alone.'] };
}
