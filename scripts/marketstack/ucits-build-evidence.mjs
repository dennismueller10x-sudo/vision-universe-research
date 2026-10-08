/** Private offline compiler. Reads fresh ingestion evidence, never calls providers. */
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validIsin, normalizeDirectoryObservation, EUROPE_EXCHANGE_PLAN } from './europe-universe.mjs';
import { analyzeUcitsHoldings, analyzeUcitsMetadata, buildEtfIdentity, ucitsProductReadiness } from './ucits-quality.mjs';
import { evaluateEuropePriceSeries, validateEodBars, evaluateFreshness, assessHistory, assessPriceReadiness } from './europe-quality.mjs';
const require = createRequire(import.meta.url);
const { createAuditAdapter } = require('../../providers/marketstack/audit-adapter.js');

const hash = text => createHash('sha256').update(text).digest('hex');
const outside = path => path === '..' || path.startsWith('../') || isAbsolute(path);
const mics = new Set(EUROPE_EXCHANGE_PLAN.flatMap(row => row.mics));
const key = row => `${row.mic || row.exchangeMic || ''}:${row.providerTicker || row.providerSymbol || row.symbol || ''}`;
const sourceOf = entry => ({ sourceManifestId: hash(JSON.stringify([entry.sourceEvidence?.normalizedPath || null, entry.sourceEvidence?.normalizedSha256 || null, entry.ordinal, entry.operation])),
  operation: entry.operation, ordinal: entry.ordinal, normalizedPath: entry.sourceEvidence?.normalizedPath || null,
  normalizedSha256: entry.sourceEvidence?.normalizedSha256 || null, rawHashesVerified: entry.sourceEvidence?.rawHashesVerified ?? null });
const aliasEvidenceRefs = candidate => (candidate.providerDirectoryAliasEvidence || []).map(evidence => ({ source: evidence.source,
  reportedIdentity: { symbol: evidence.observation.normalized?.providerTicker || null, mic: evidence.observation.normalized?.providerExchange || null,
    isin: evidence.observation.normalized?.isin || null, currency: evidence.observation.normalized?.currency || null },
  rawFieldRefs: ['symbol', 'ticker', 'isin', 'ISIN', 'stock_exchange.mic', 'exchange', 'currency', 'price_currency'] }));
const count = (rows, field) => rows.reduce((out, row) => { const value = row[field] ?? 'UNKNOWN'; out[value] = (out[value] || 0) + 1; return out; }, {});
const reportRows = result => Array.isArray(result?.data) ? result.data : [];
const officialMatch = (candidate, rows) => {
  const matches = rows.filter(row => row['Instrument Type'] === 'ETF' && row['Instrument Status'] === 'Active' && row.Mnemonic === candidate.nativeTicker && row['MIC Code'] === candidate.mic);
  return matches.length === 1 && matches[0].ISIN === candidate.isin ? matches : [];
};
function observationMatches(observation, candidate, expectedCurrency = null, allowMissingIsin = false) {
  const n = observation.normalized || {}, raw = observation.raw || {};
  if (raw.active === false || raw.is_active === false || /^(INACTIVE|DELISTED)$/i.test(raw.status || '')) return false;
  const declared = value => value !== null && value !== undefined && value !== '';
  const symbols = [n.providerTicker, raw.symbol, raw.ticker].filter(declared);
  const isins = [n.isin, raw.isin, raw.ISIN].filter(declared);
  const venues = [n.providerExchange, typeof raw.exchange === 'string' ? raw.exchange : null, raw.mic, raw.exchange_mic, raw.stock_exchange?.mic].filter(Boolean);
  const currencies = [n.currency, n.priceCurrency, raw.currency, raw.price_currency, raw.fund_currency].filter(value => value !== null && value !== undefined);
  return symbols.length > 0 && symbols.every(value => value === candidate.providerTicker) && (isins.length > 0 || allowMissingIsin) && isins.every(value => validIsin(value) && (!candidate.isin || value === candidate.isin)) &&
    venues.every(value => value === candidate.mic) && (venues.includes(candidate.mic) || (raw.stock_exchanges || []).some(exchange => exchange.mic === candidate.mic)) &&
    new Set(currencies).size <= 1 && (!expectedCurrency || currencies.every(value => value === expectedCurrency));
}
function officialReferencePolicy(candidate, officialReference, now) {
  const source = officialReference.source || {}, retrieved = Date.parse(source.retrievedAt), age = Date.parse(now) - retrieved;
  const referenceCurrency = candidate.officialReference?.raw.Currency;
  const currencyAuthorized = referenceCurrency === 'EUR' || referenceCurrency === 'USD' && candidate.isin === 'LU2451511526' && candidate.nativeTicker === '0NS' && candidate.providerTicker === '0NS.DE';
  return candidate.mic === 'XETR' && candidate.nativeTicker && candidate.providerTicker === candidate.nativeTicker + '.DE' &&
    !candidate.identityConflicts?.length && candidate.officialReference?.raw.ISIN === candidate.isin && validIsin(candidate.isin) &&
    currencyAuthorized && candidate.officialReference?.raw.Mnemonic === candidate.nativeTicker &&
    officialReference.sourceEvidence?.rawHashesVerified === true && source.httpStatus === 200 && /^[a-f0-9]{64}$/.test(source.sha256 || '') &&
    /^https:\/\/www\.cashmarket\.deutsche-boerse\.com\//.test(source.url || '') && Number.isFinite(age) && age >= 0 && age <= 7 * 86400000;
}
function officialAliasPolicy(candidate, officialReference, now) {
  const evidence = (candidate.providerDirectoryAliasEvidence || []).filter(evidence => evidence.source.rawHashesVerified === true && evidence.source.operation.kind === 'directory' && evidence.source.operation.mic === 'XETR');
  return officialReferencePolicy(candidate, officialReference, now) && evidence.length > 0 && evidence.every(evidence => {
    const raw = evidence.observation.raw || {}, n = evidence.observation.normalized || {};
    const types = [raw.item_type, raw.asset_type, raw.security_type, raw.type, n.assetType].filter(Boolean);
    return !types.some(type => /WARRANT|CERTIFICATE|RIGHTS?|BOND|ETN|ETC|PREFERRED|ORDINARY|COMMON|DEPOSITARY|\bADR\b|\bGDR\b/i.test(String(type))) &&
      observationMatches(evidence.observation, candidate, candidate.officialReference.raw.Currency, true);
  });
}
function reportedCurrencies(row) {
  const n = row.normalized || row, raw = row.raw || row;
  return [n.currency, n.priceCurrency, n.price_currency, raw.currency, raw.price_currency].filter(value => value !== null && value !== undefined);
}
function applyCurrencyEvidence(quality, referenceEvidence, expectedCurrency) {
  const valid = [], canonicalReferenceRows = [];
  for (const row of quality.validBars) {
    const declarations = reportedCurrencies(row.raw);
    const reason = declarations.some(value => typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) ? 'INVALID_PROVIDER_CURRENCY'
      : declarations.some(value => expectedCurrency && value !== expectedCurrency) ? 'CURRENCY_INCONSISTENT'
      : !declarations.length && !referenceEvidence ? 'MISSING_PROVIDER_CURRENCY_WITHOUT_VERIFIED_REFERENCE' : null;
    if (reason) quality.quarantine.push({ ...row, reasons: [reason] });
    else {
      valid.push(row);
      if (!declarations.length) canonicalReferenceRows.push({ date: row.date, rawIndex: row.rawIndex, currency: referenceEvidence.currency, provenanceRef: 'currencyEvidence' });
    }
  }
  quality.validBars = valid;
  quality.counts = { ...quality.counts, valid: valid.length, quarantined: quality.quarantine.length };
  quality.volumeVerified = valid.length > 0 && valid.every(row => Number.isFinite(row.volume) && row.volume > 0);
  if (!valid.length) quality.status = 'INVALID'; else if (quality.quarantine.length) quality.status = 'REVIEW';
  return canonicalReferenceRows;
}
function holdingsBound(result, candidate) {
  const declarations = { symbol: candidate.providerTicker, ticker: candidate.providerTicker, providerSymbol: candidate.providerTicker, providerTicker: candidate.providerTicker,
    mic: candidate.mic, exchange: candidate.mic, exchangeMic: candidate.mic, isin: candidate.isin, ISIN: candidate.isin };
  if (Object.entries(declarations).some(([field, expected]) => result[field] !== undefined && result[field] !== null && result[field] !== expected)) return false;
  const attributes = result.data?.attributes || [];
  return attributes.length > 0 && attributes.every(row => row?.ticker === candidate.providerTicker && Object.entries(declarations).every(([field, expected]) => row[field] === undefined || row[field] === null || row[field] === expected));
}
function refersToCandidate(operation, candidate) {
  if (['holdings', 'tickerInfo'].includes(operation.kind)) {
    if (operation.mic !== null && operation.mic !== undefined && operation.mic !== candidate.mic ||
      operation.nativeTicker !== null && operation.nativeTicker !== undefined && operation.nativeTicker !== candidate.nativeTicker) return false;
    if (operation.listingRef !== null && operation.listingRef !== undefined &&
      (operation.listingRef.providerTicker !== candidate.providerTicker || operation.listingRef.mic !== candidate.mic || operation.listingRef.isin !== candidate.isin)) return false;
  }
  if (operation.kind === 'latestBatch') return operation.mic === candidate.mic && operation.symbols.includes(candidate.providerTicker);
  if ((operation.symbol || operation.listing?.providerTicker) === candidate.providerTicker) return (!operation.mic || operation.mic === candidate.mic) && (!operation.listing || operation.listing.mic === candidate.mic);
  if (operation.kind === 'tickerInfo' && operation.symbol === candidate.nativeTicker && operation.mic === candidate.mic) return true;
  const reference = operation.listingRef;
  return ['holdings', 'tickerInfo'].includes(operation.kind) && reference?.providerTicker === candidate.providerTicker && reference.mic === candidate.mic &&
    reference.isin === candidate.isin && operation.symbol === candidate.nativeTicker && (operation.nativeTicker === null || operation.nativeTicker === undefined || operation.nativeTicker === candidate.nativeTicker);
}
function supplementaryMetadata(entry, candidate, allowOfficialAlias) {
  const native = entry.operation.symbol !== candidate.providerTicker;
  if (entry.result.ok !== true || !refersToCandidate(entry.operation, candidate) || native && !allowOfficialAlias) return { eligible: false, reason: 'UNBOUND_OPERATION', observations: [] };
  const observations = entry.result.observations || [];
  if (observations.length !== 1) return { eligible: false, reason: 'AMBIGUOUS_OR_MISSING_METADATA', observations };
  const observation = observations[0], raw = observation.raw || {}, n = observation.normalized || {};
  const declared = value => value !== null && value !== undefined && value !== '';
  const symbols = [raw.symbol, raw.ticker, n.providerTicker].filter(declared), isins = [raw.isin, raw.ISIN, n.isin].filter(declared);
  const venues = [raw.mic, raw.exchange_mic, raw.stock_exchange?.mic, n.providerExchange, typeof raw.exchange === 'string' && /^[A-Z0-9]{4}$/.test(raw.exchange) ? raw.exchange : null].filter(Boolean);
  const types = [raw.item_type, raw.asset_type, raw.security_type, raw.type, n.assetType].filter(Boolean);
  const currencies = [raw.price_currency, raw.currency, raw.fund_currency, n.currency, n.priceCurrency, n.price_currency].filter(value => value !== null && value !== undefined);
  if (!symbols.length || symbols.some(symbol => symbol !== entry.operation.symbol) || isins.some(isin => !validIsin(isin) || isin !== candidate.isin) ||
    venues.some(mic => mic !== candidate.mic) || types.some(type => !/^ETF$/i.test(String(type))) || currencies.some(currency => currency !== candidate.officialReference?.raw.Currency) ||
    typeof raw.exchange === 'string' && !/^(XETR|XETRA)$/i.test(raw.exchange)) return { eligible: false, reason: 'CONTRADICTORY_REPORTED_IDENTITY', observations };
  if (native && !isins.length) return { eligible: false, reason: 'NATIVE_TICKER_ONLY_SHARE_CLASS_UNKNOWN', observations };
  return { eligible: true, reason: null, observations, binding: native ? 'EXACT_REPORTED_SHARE_CLASS_ISIN' : 'OBSERVED_QUALIFIED_PROVIDER_ALIAS' };
}

export function compileUcitsEvidence({ selected = {}, discoveryEntries = [], foundationEntries = [], officialReference = {}, now = new Date().toISOString(), calendars = {} } = {}) {
  if (typeof now !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(Date.parse(now))) throw Error('INVALID_NOW');
  const candidates = new Map(), global = [];
  const add = (listing, evidence) => {
    const id = key(listing);
    if (!candidates.has(id)) candidates.set(id, { ...listing, sources: [], officialReference: null });
    else if (validIsin(listing.isin) && validIsin(candidates.get(id).isin) && listing.isin !== candidates.get(id).isin)
      (candidates.get(id).identityConflicts ||= []).push({ reason: 'CONFLICTING_LISTING_ISIN', reportedIsin: listing.isin, evidence });
    candidates.get(id).sources.push(evidence);
  };
  for (const selectedEtf of selected.etfs || []) {
    const matched = officialMatch(selectedEtf, officialReference.rows || []);
    add({ ...selectedEtf, candidateOrigin: 'SELECTED_OFFICIAL_XETRA_ETF', officialReference: null }, { source: 'SELECTED_CANDIDATES', ...selected.sourceEvidence });
    if (matched.length === 1 && validIsin(selectedEtf.isin) && candidates.get(key(selectedEtf)).isin === selectedEtf.isin) candidates.get(key(selectedEtf)).officialReference = { raw: matched[0], provenance: officialReference.sourceEvidence || null };
  }
  for (const entry of discoveryEntries) {
    if (entry.operation.kind === 'etfs') {
      for (const [rawRowIndex, row] of reportRows(entry.result).entries()) global.push({ providerSymbol: row.ticker || row.symbol || null, identityStatus: 'REVIEW', ucits: null, mic: null, rawRowIndex, source: sourceOf(entry) });
    } else if (['directory', 'search'].includes(entry.operation.kind)) {
      for (const observation of reportRows(entry.result)) {
        const n = normalizeDirectoryObservation(observation);
        const preselected = candidates.get(key(n));
        if (preselected?.candidateOrigin === 'SELECTED_OFFICIAL_XETRA_ETF' && entry.operation.kind === 'directory')
          (preselected.providerDirectoryAliasEvidence ||= []).push({ observation, source: sourceOf(entry) });
        const type = String(n.row.security_type || n.row.asset_type || n.row.item_type || n.row.type || '').toUpperCase();
        const cue = /\b(?:ETF|UCITS)\b/i.test(n.name || '');
        if (!mics.has(n.mic) || !(/ETF/.test(type) || cue) || /WARRANT|CERTIFICATE|RIGHTS?|BOND|ETN|ETC/.test(type)) continue;
        const directoryCandidate = { providerTicker: n.providerTicker, mic: n.mic, name: n.name, isin: n.isin, candidateOrigin: /ETF/.test(type) ? 'PROVIDER_EXPLICIT_ETF_TYPE' : 'PROVIDER_NAME_CUE_ONLY' };
        add(directoryCandidate, sourceOf(entry));
        if (entry.operation.kind === 'directory' && preselected?.candidateOrigin !== 'SELECTED_OFFICIAL_XETRA_ETF') {
          const target = candidates.get(key(directoryCandidate));
          (target.providerDirectoryAliasEvidence ||= []).push({ observation, source: sourceOf(entry) });
        }
      }
    }
  }
  const all = [...candidates.values()], metadataRows = [], holdingsRows = [], readinessRows = [], listingRows = [];
  // Thousands of discovery-only candidates have no bars. Reuse the same empty
  // quality/calendar evaluation for a venue/currency instead of revalidating
  // its complete multi-year session calendar for every absent series.
  const emptySeries = new Map(), emptyLatestQuality = new Map(), missingFreshness = new Map();
  for (const candidate of all) {
    const entries = foundationEntries.filter(entry => refersToCandidate(entry.operation, candidate));
    const metaEntries = entries.filter(entry => entry.operation.kind === 'metadata');
    const metadataEntry = metaEntries.at(-1), observations = metadataEntry?.result?.observations || [];
    const allowOfficialAlias = officialAliasPolicy(candidate, officialReference, now);
    const matches = observations.filter(observation => observationMatches(observation, candidate, candidate.officialReference?.raw.Currency, allowOfficialAlias));
    const aliasTypeValid = observation => {
      const rawTypes = [observation.raw?.item_type, observation.raw?.asset_type, observation.raw?.security_type, observation.raw?.type].filter(Boolean);
      return rawTypes.length > 0 && [...rawTypes, observation.normalized?.assetType].filter(Boolean).every(type => /^ETF$/i.test(String(type)));
    };
    const externalAlias = allowOfficialAlias && matches.length === 1 && aliasTypeValid(matches[0]) &&
      ![matches[0].raw?.isin, matches[0].raw?.ISIN, matches[0].normalized?.isin].some(Boolean);
    const matched = matches.length === 1 && metadataEntry.result.ok === true && (metadataEntry.result.ingestionIdentityMatched === true || externalAlias) ? matches[0] : null;
    const identityReady = !!candidate.officialReference && !!matched && validIsin(candidate.isin) && !candidate.identityConflicts?.length;
    const rawMetadata = matched?.raw || {}, metadata = analyzeUcitsMetadata(rawMetadata, { retrievedAt: metadataEntry?.result?.retrievedAt });
    const tickerInfoEntries = entries.filter(entry => entry.operation.kind === 'tickerInfo');
    metadata.supplementalObservedMetadata = [];
    for (const entry of tickerInfoEntries) {
      const binding = supplementaryMetadata(entry, candidate, allowOfficialAlias);
      const observed = (entry.result.observations || []).map(observation => analyzeUcitsMetadata(observation.raw, { retrievedAt: entry.result.retrievedAt }));
      metadata.supplementalObservedMetadata.push({ ...binding, observed, sourceEvidence: sourceOf(entry) });
      if (!identityReady || !binding.eligible || observed.length !== 1) continue;
      const supplement = observed[0];
      for (const [field, value] of Object.entries(supplement.fields)) {
        if (value === null) continue;
        if (metadata.fields[field] === null && metadata.statuses[field] !== 'CONFLICTING_PROVIDER_OBSERVATIONS') {
          metadata.fields[field] = value; metadata.statuses[field] = supplement.statuses[field];
          metadata.provenance[field] = { ...supplement.provenance[field], binding: binding.binding, sourceEvidence: sourceOf(entry) };
        } else if (metadata.fields[field] !== value) {
          metadata.fields[field] = null; metadata.statuses[field] = 'CONFLICTING_PROVIDER_OBSERVATIONS'; metadata.provenance[field] = { conflict: true, sourceEvidence: sourceOf(entry) };
        }
      }
    }
    for (const field of ['navDate', 'inception']) if (metadata.fields[field] && metadata.fields[field] > now.slice(0, 10)) { metadata.fields[field] = null; metadata.statuses[field] = 'INVALID_FUTURE_DATE'; }
    if (metadata.fields.nav !== null && (!metadata.fields.navDate || metadata.fields.navDate > now.slice(0, 10))) { metadata.fields.nav = null; metadata.statuses.nav = 'INVALID_DATE_BASIS'; }
    // Preserve expense ratio separately; it cannot be called TER without issuer evidence.
    if (/expense/i.test(metadata.provenance.ter?.field || '')) {
      metadata.expenseRatioObservation = { value: metadata.fields.ter, provenance: metadata.provenance.ter, unit: metadata.fields.terUnit };
      metadata.fields.ter = null; metadata.fields.terFraction = null; metadata.statuses.ter = 'MISSING'; metadata.statuses.terFraction = 'MISSING';
    }
    metadata.coverage = Object.values(metadata.statuses).filter(status => status === 'OBSERVED').length / Object.keys(metadata.statuses).length;
    const currencies = [...new Set([candidate.officialReference?.raw.Currency, matched?.normalized?.currency].filter(Boolean))];
    const currency = currencies.length === 1 ? currencies[0] : null;
    const currencyEvidence = currency && officialReferencePolicy(candidate, officialReference, now) ? {
      status: 'CANONICAL_REFERENCE_CURRENCY', currency, field: 'Currency', rawFieldValue: candidate.officialReference.raw.Currency,
      sameListing: { isin: candidate.isin, nativeMnemonic: candidate.nativeTicker, mic: candidate.mic, providerTicker: candidate.providerTicker, instrumentType: 'ETF', instrumentStatus: 'Active' },
      source: officialReference.source, officialArtifact: officialReference.sourceEvidence, providerRawChanged: false, providerNormalizedChanged: false, fxApplied: false
    } : null;
    const identity = { identityStatus: identityReady && currencies.length <= 1 ? 'MAPPED_SHARE_CLASS' : 'REVIEW', isin: candidate.isin || matched?.normalized?.isin || null,
      fundId: null, shareClassId: validIsin(candidate.isin) ? candidate.isin : null, listingId: null,
      providerSymbol: candidate.providerTicker, exchangeMic: candidate.mic, currency, currencyProvenance: currencyEvidence,
      identityProvenance: externalAlias ? { policy: 'OFFICIAL_XETRA_ETF_OBSERVED_DOT_DE_ALIAS', isinBasis: 'OFFICIAL_XETRA_REFERENCE', currencyBasis: 'OFFICIAL_XETRA_REFERENCE',
        providerReportedIsin: matched?.normalized?.isin || null, providerReportedCurrency: matched?.normalized?.currency || null,
        officialSource: officialReference.source, officialArtifact: officialReference.sourceEvidence, directoryEvidence: aliasEvidenceRefs(candidate) } : null };
    identity.reasons = [!candidate.officialReference && 'OFFICIAL_ETF_NATIVE_IDENTITY_UNRESOLVED_OR_AMBIGUOUS',
      !matched && 'PROVIDER_IDENTITY_UNRESOLVED', !allowOfficialAlias && observations.length && !observations.some(row => row.normalized?.isin || row.raw?.isin || row.raw?.ISIN) && 'MISSING_ISIN_WITHOUT_VERIFIED_OFFICIAL_ALIAS',
      currencies.length > 1 && 'CONFLICTING_LISTING_CURRENCY', ...(candidate.identityConflicts || []).map(conflict => conflict.reason)].filter(Boolean);
    const historyEntries = entries.filter(entry => entry.operation.kind === 'history');
    const latestEntries = entries.filter(entry => ['latest', 'latestBatch'].includes(entry.operation.kind));
    const lastHistory = historyEntries.at(-1), historyBars = reportRows(lastHistory?.result);
    const latestBars = latestEntries.flatMap(entry => reportRows(entry.result)).filter(row => (row.normalized?.providerTicker || row.symbol) === candidate.providerTicker && (row.normalized?.providerExchange || row.exchange) === candidate.mic);
    const listing = { providerTicker: candidate.providerTicker, mic: candidate.mic, currency };
    const calendar = calendars[candidate.mic] || {};
    const requestRange = lastHistory ? { ...(lastHistory.operation.from ? { from: lastHistory.operation.from } : {}), ...(lastHistory.operation.to ? { to: lastHistory.operation.to } : {}) } : {};
    const emptyKey = JSON.stringify([candidate.mic, currency]);
    let series;
    if (!historyBars.length && emptySeries.has(emptyKey)) series = emptySeries.get(emptyKey);
    else {
      series = evaluateEuropePriceSeries({ bars: historyBars, listing, now, calendar, requestRange, maxHistoryComplete: false });
      const previousValidCount = series.quality.validBars.length;
      const referenceRows = applyCurrencyEvidence(series.quality, currencyEvidence, currency);
      series.referenceCurrencyRows = referenceRows;
      if (series.quality.validBars.length !== previousValidCount) {
        series.history = assessHistory(series.quality.validBars, { calendar, listing, maxHistoryComplete: false });
        series.freshness = evaluateFreshness({ latestDate: series.quality.validBars.at(-1)?.date, now, calendar, listing });
        series.readiness = assessPriceReadiness({ quality: series.quality, freshness: series.freshness, adjustment: series.adjustment, corporateActions: series.corporateActions, listing });
      }
      if (!historyBars.length) emptySeries.set(emptyKey, series);
    }
    let latestQuality;
    if (!latestBars.length && emptyLatestQuality.has(emptyKey)) latestQuality = emptyLatestQuality.get(emptyKey);
    else {
      latestQuality = validateEodBars(latestBars, { listing, now, calendar });
      latestQuality.referenceCurrencyRows = applyCurrencyEvidence(latestQuality, currencyEvidence, currency);
      if (!latestBars.length) emptyLatestQuality.set(emptyKey, latestQuality);
    }
    const latest = latestQuality.validBars.at(-1) || series.quality.validBars.at(-1) || null;
    let freshness;
    if (!latest && missingFreshness.has(candidate.mic)) freshness = missingFreshness.get(candidate.mic);
    else {
      freshness = evaluateFreshness({ latestDate: latest?.date, now, calendar, listing });
      if (!latest) missingFreshness.set(candidate.mic, freshness);
    }
    const price = { valid: !!latest && identityReady && !!currency && !latestQuality.quarantine.length, freshness: freshness.status,
      latest: latest ? { date: latest.date, open: latest.open, high: latest.high, low: latest.low, close: latest.close, volume: latest.volume, currency: latest.currency,
        currencyBasis: reportedCurrencies(latest.raw).length ? 'PROVIDER_REPORTED' : 'CANONICAL_REFERENCE_CURRENCY' } : null,
      currencyEvidence,
      freshnessEvidence: freshness, history: { ...series.history, requestedRange: lastHistory ? { from: lastHistory.operation.from || null, to: lastHistory.operation.to || null, transferComplete: lastHistory.result.complete === true } : null },
      historyQuality: { status: series.quality.status, counts: series.quality.counts, warnings: series.quality.warnings, gaps: series.quality.gaps,
        currencyQuarantine: series.quality.quarantine.filter(row => row.reasons.some(reason => /CURRENCY/.test(reason))).map(row => ({ date: row.date, rawIndex: row.rawIndex, reasons: row.reasons })),
        canonicalReferenceCurrencyRows: series.referenceCurrencyRows || [] },
      adjustment: series.adjustment, chart: ['DELAYED', 'STALE'].includes(freshness.status) && series.readiness.chart === 'CHART_READY' ? 'CHART_LIMITED' : series.readiness.chart,
      latestQuality: { counts: latestQuality.counts, quarantine: latestQuality.quarantine.map(row => ({ date: row.date, rawIndex: row.rawIndex, reasons: row.reasons })), canonicalReferenceCurrencyRows: latestQuality.referenceCurrencyRows || [] },
      sourceEvidence: [...historyEntries, ...latestEntries].map(sourceOf) };
    const holdingEntries = entries.filter(entry => entry.operation.kind === 'holdings');
    const holdingEntry = holdingEntries.at(-1);
    // Replication must be an observed structured field; name prose is insufficient.
    const structure = metadata.fields.replication && /^(physical|full_physical|physical_full|sampling|physical_sampling)$/i.test(metadata.fields.replication) ? metadata.fields.replication : null;
    const holdings = analyzeUcitsHoldings(holdingEntry?.result || {}, { now, ...(structure ? { fundStructure: structure } : {}) });
    const nativeHoldings = holdingEntry && holdingEntry.operation.symbol !== candidate.providerTicker;
    const nativeCandidate = nativeHoldings ? { ...candidate, providerTicker: candidate.nativeTicker } : candidate;
    const nativeReportIsinsBound = (holdingEntry?.result?.data?.attributes || []).every(row => {
      const isins = [row?.isin, row?.ISIN].filter(Boolean);
      return isins.length > 0 && isins.every(isin => validIsin(isin) && isin === candidate.isin);
    });
    const holdingsIdentityBound = holdingEntry && holdingsBound(holdingEntry.result, nativeCandidate) && (!nativeHoldings || allowOfficialAlias && nativeReportIsinsBound);
    holdings.providerObservedStatus = holdingEntry ? holdings.status : null;
    holdings.binding = !holdingEntry ? 'NOT_PROBED' : holdingsIdentityBound ? nativeHoldings ? 'EXACT_REPORTED_SHARE_CLASS_ISIN' : 'EXACT_QUALIFIED_PROVIDER_SYMBOL' : nativeHoldings ? 'NATIVE_TICKER_ONLY_SHARE_CLASS_UNKNOWN' : 'UNBOUND';
    if (holdingEntry && (!holdingsIdentityBound || holdingEntry.result.ok !== true)) {
      holdings.reasons.push(holdingsIdentityBound ? 'HOLDINGS_OPERATION_FAILED' : 'HOLDINGS_IDENTITY_UNBOUND');
      if (holdings.holdingsCount && holdings.status !== 'GATEWAY_ERROR') holdings.status = 'PARTIAL';
      holdings.sufficientComplete = false; holdings.xrayReady = false; holdings.underlyingCoverage = 'UNKNOWN';
    }
    if (!holdingEntry) {
      holdings.reasons.push('NOT_PROBED_THIS_RUN');
      // An absent probe is missing evidence, not provider unavailability.
      holdings.status = null;
      holdings.underlyingCoverage = 'UNKNOWN';
    }
    const readiness = ucitsProductReadiness({ identity, holdings, metadata, price, rights: {} });
    // The Vorsorge facade additionally requires signed producer evidence and an existing canonical fund/class binding.
    readiness.vorsorgeEvidenceReady = readiness.vorsorgeReady;
    readiness.vorsorgeReady = false;
    readiness.vorsorgeFacadeReady = false;
    readiness.producerAttestation = 'MISSING';
    readiness.blockedReasons.push('AUTHENTICATED_PRODUCER_AND_EXISTING_FUND_BINDING_REQUIRED');
    const admission = identity.identityStatus === 'MAPPED_SHARE_CLASS' ? 'ACCEPTED_PRIVATE_IDENTITY' : 'REVIEW';
    listingRows.push({ ...candidate, providerDirectoryAliasEvidence: aliasEvidenceRefs(candidate), identity, admission, price, ucits: metadata.fields.ucits, ucitsNameCue: metadata.ucitsNameCue, sourceEvidence: entries.map(sourceOf) });
    metadataRows.push({ listingKey: key(candidate), identity, ...metadata, attempts: metaEntries.map(entry => ({ ok: entry.result.ok, reason: entry.result.reason, sourceEvidence: sourceOf(entry) })) });
    holdingsRows.push({ listingKey: key(candidate), identity, ...holdings, probeState: holdingEntry ? 'PROBED_THIS_RUN' : 'NOT_PROBED', attempts: holdingEntries.map(entry => {
      const observed = analyzeUcitsHoldings(entry.result, { now, ...(structure ? { fundStructure: structure } : {}) });
      return { querySymbol: entry.operation.symbol, queryNamespace: entry.operation.symbol === candidate.providerTicker ? 'QUALIFIED_LISTING' : 'NATIVE_MNEMONIC',
        status: entry.result.status || null, ok: entry.result.ok, reason: entry.result.reason, complete: entry.result.complete,
        httpStatuses: (entry.sourceEvidence?.rawResponses || []).map(response => response.status), rawResponseCount: entry.sourceEvidence?.rawResponses?.length || 0,
        providerObservedStatus: observed.status, providerHoldingsCount: observed.holdingsCount, providerAsOf: observed.asOf, providerSumWeights: observed.sumWeights,
        sourceEvidence: sourceOf(entry) };
    }) });
    readinessRows.push({ listingKey: key(candidate), identity, admission, readiness, price, metadataCoverage: metadata.coverage, holdingsStatus: holdings.status });
  }
  const identities = buildEtfIdentity(listingRows.map(row => ({ ...row.identity, mic: row.identity.exchangeMic, symbol: row.providerTicker, isin: row.identity.isin })));
  const envelope = { schemaVersion: 'marketstack-ucits-evidence-1', generatedAt: now, publicationAllowed: false, mode: 'PRIVATE_RESEARCH', productionWrites: 0,
    sourceInputs: { selected: selected.sourceEvidence || null, officialReference: officialReference.sourceEvidence ? { ...officialReference.sourceEvidence, rawSource: officialReference.source || null } : null,
      discoveryOperations: discoveryEntries.length, foundationOperations: foundationEntries.length,
      evidenceManifest: [...discoveryEntries, ...foundationEntries].map(entry => ({ ...sourceOf(entry), rawResponses: entry.sourceEvidence?.rawResponses || [] })) } };
  const summary = { europeanEtfCandidates: listingRows.length, acceptedPrivateIdentity: listingRows.filter(row => row.admission === 'ACCEPTED_PRIVATE_IDENTITY').length,
    selectedOfficialEtfCandidates: listingRows.filter(row => row.candidateOrigin === 'SELECTED_OFFICIAL_XETRA_ETF' && row.officialReference).length,
    acceptedShareClasses: new Set(listingRows.filter(row => row.admission === 'ACCEPTED_PRIVATE_IDENTITY').map(row => row.identity.isin)).size,
    review: listingRows.filter(row => row.admission === 'REVIEW').length, shareClasses: identities.counts.shareClasses,
    confirmedFunds: identities.counts.funds, unresolvedFundListings: identities.unresolvedFundListings,
    confirmedUcitsListings: listingRows.filter(row => row.ucits === true).length, ucitsUnknownListings: listingRows.filter(row => row.ucits === null).length,
    globalDirectoryUnclassifiedCandidates: global.length, globalDirectoryComplete: discoveryEntries.filter(entry => entry.operation.kind === 'etfs').every(entry => entry.result.complete === true) && discoveryEntries.some(entry => entry.operation.kind === 'etfs'),
    holdingsStatus: count(holdingsRows, 'status'), holdingsFull: holdingsRows.filter(row => row.status === 'FULL').length, holdingsPartial: holdingsRows.filter(row => row.status === 'PARTIAL').length,
    holdingsProbed: holdingsRows.filter(row => row.probeState === 'PROBED_THIS_RUN').length, holdingsNotProbed: holdingsRows.filter(row => row.probeState === 'NOT_PROBED').length,
    probedHoldingsStatus: count(holdingsRows.filter(row => row.probeState === 'PROBED_THIS_RUN'), 'status'),
    holdingsGatewayError: holdingsRows.filter(row => row.status === 'GATEWAY_ERROR').length,
    terCoverage: metadataRows.filter(row => row.fields.terFraction !== null).length, aumCoverage: metadataRows.filter(row => row.fields.aum !== null).length,
    expenseRatioObservationCoverage: metadataRows.filter(row => row.expenseRatioObservation?.value !== null && row.expenseRatioObservation?.value !== undefined).length,
    navCoverage: metadataRows.filter(row => row.fields.nav !== null).length, vorsorgeReady: readinessRows.filter(row => row.readiness.vorsorgeReady).length,
    vorsorgeEvidenceReady: readinessRows.filter(row => row.readiness.vorsorgeEvidenceReady).length,
    vorsorgeFacadeReady: 0, xrayReady: readinessRows.filter(row => row.readiness.xrayReady).length };
  const holdingsByListing = new Map(holdingsRows.map(row => [row.listingKey, row])), metadataByListing = new Map(metadataRows.map(row => [row.listingKey, row])),
    readinessByListing = new Map(readinessRows.map(row => [row.listingKey, row])), listingByKey = new Map(listingRows.map(row => [key(row), row]));
  const compactRows = listingRows.map(row => {
    const id = key(row), holding = holdingsByListing.get(id), meta = metadataByListing.get(id), ready = readinessByListing.get(id);
    return { listingKey: id, providerTicker: row.providerTicker, mic: row.mic, isin: row.identity.isin, currency: row.identity.currency, admission: row.admission,
      identityStatus: row.identity.identityStatus, latestDate: row.price.latest?.date || null, priceValid: row.price.valid, freshness: row.price.freshness,
      identityPolicy: row.identity.identityProvenance?.policy || null, identityReasons: row.identity.reasons,
      quoteCurrencyBasis: row.price.latest?.currencyBasis || row.identity.currencyProvenance?.status || null,
      quoteCurrencySourceRef: row.identity.currencyProvenance ? { sourceInputs: 'officialReference.rawSource', field: 'Currency', currency: row.identity.currencyProvenance.currency,
        isin: row.identity.isin, nativeMnemonic: row.nativeTicker, mic: row.mic } : null,
      canonicalReferenceCurrencyHistoryRows: row.price.historyQuality.canonicalReferenceCurrencyRows.length,
      canonicalReferenceCurrencyLatestRows: row.price.latestQuality.canonicalReferenceCurrencyRows.length,
      providerDirectoryAliasObservations: row.providerDirectoryAliasEvidence.length,
      historyObservations: row.price.history.observations, historyFirst: row.price.history.first, historyLast: row.price.history.last, chart: row.price.chart,
      holdingsProbeState: holding.probeState, holdingsStatus: holding.status, holdingsCount: holding.holdingsCount, holdingsAsOf: holding.asOf, holdingsSumWeights: holding.sumWeights,
      holdingsBinding: holding.binding, holdingsProviderObservedStatus: holding.providerObservedStatus,
      ucits: meta.fields.ucits, terFraction: meta.fields.terFraction, expenseRatioObservation: meta.expenseRatioObservation || null,
      aum: meta.fields.aum, nav: meta.fields.nav, vorsorgeReady: ready.readiness.vorsorgeReady, vorsorgeEvidenceReady: ready.readiness.vorsorgeEvidenceReady,
      xrayReady: ready.readiness.xrayReady, sources: row.sourceEvidence };
  });
  const acceptedInventory = compactRows.filter(row => row.admission === 'ACCEPTED_PRIVATE_IDENTITY');
  const holdingsQueryInventory = holdingsRows.flatMap(row => row.attempts.map(attempt => ({ listingKey: row.listingKey, canonicalProviderTicker: row.identity.providerSymbol,
    mic: row.identity.exchangeMic, isin: row.identity.isin, ...attempt, underlyingCoverage: 'UNKNOWN' })));
  return {
    marketstack_ucits_universe: { ...envelope, summary, listings: listingRows, identities, globalDirectoryUnclassifiedCandidates: global,
      constraints: ['GLOBAL_ETFLIST_IS_NOT_UCITS_COVERAGE', 'NO_FUND_NAME_COLLAPSE', 'ETF_IS_NOT_AUTOMATICALLY_UCITS', 'NO_EXISTING_FUND_ID_FABRICATED'] },
    marketstack_ucits_holdings_status: { ...envelope, summary: { statuses: summary.holdingsStatus, probedStatuses: summary.probedHoldingsStatus, probed: summary.holdingsProbed, notProbed: summary.holdingsNotProbed }, rows: holdingsRows },
    marketstack_ucits_metadata_status: { ...envelope, summary: { terCoverage: summary.terCoverage, expenseRatioObservationCoverage: summary.expenseRatioObservationCoverage, aumCoverage: summary.aumCoverage, navCoverage: summary.navCoverage }, rows: metadataRows },
    marketstack_vorsorge_readiness: { ...envelope, summary: { vorsorgeReady: summary.vorsorgeReady, vorsorgeEvidenceReady: summary.vorsorgeEvidenceReady, vorsorgeFacadeReady: 0, xrayReady: summary.xrayReady }, rows: readinessRows },
    marketstack_ucits_summary: { ...envelope, summary: { ...summary, acceptedFreshness: count(acceptedInventory, 'freshness'),
      acceptedLatestPriceCoverage: acceptedInventory.filter(row => row.priceValid).length, acceptedHistoryCoverage: acceptedInventory.filter(row => row.historyObservations > 0).length,
      acceptedChartStatus: count(acceptedInventory, 'chart'), holdingsQueries: holdingsQueryInventory.length, holdingsQueriesByNamespace: count(holdingsQueryInventory, 'queryNamespace'),
      holdingsBusinessReasonsByNamespace: Object.fromEntries(['QUALIFIED_LISTING', 'NATIVE_MNEMONIC'].map(namespace => [namespace, count(holdingsQueryInventory.filter(row => row.queryNamespace === namespace), 'reason')])) }, acceptedListingInventory: acceptedInventory,
      selectedOfficialEtfInventory: compactRows.filter(row => listingByKey.get(row.listingKey).candidateOrigin === 'SELECTED_OFFICIAL_XETRA_ETF'),
      probedHoldingsInventory: compactRows.filter(row => row.holdingsProbeState === 'PROBED_THIS_RUN'), holdingsQueryInventory }
  };
}

function safeFile(path, root = dirname(resolve(path))) {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('INPUT_SYMLINK_OR_NOT_REGULAR');
  const real = realpathSync(path), distance = relative(realpathSync(root), real);
  if (!distance || outside(distance)) throw Error('INPUT_PATH_OUTSIDE_ROOT');
  let cursor = resolve(path);
  while (cursor !== resolve(root)) { if (lstatSync(cursor).isSymbolicLink()) throw Error('INPUT_SYMLINK_OR_NOT_REGULAR'); cursor = dirname(cursor); }
  return real;
}
function readJson(path) { return JSON.parse(readFileSync(safeFile(path), 'utf8')); }
function fileEvidence(path) { return { path: resolve(path), sha256: hash(readFileSync(path)), verified: true }; }
function verifyOfficialReference(reference, referencePath) {
  if (!reference.source?.path) return false;
  const path = safeFile(reference.source.path, dirname(resolve(referencePath))), raw = readFileSync(path);
  if (hash(raw) !== reference.source.sha256) throw Error('OFFICIAL_REFERENCE_RAW_HASH_MISMATCH');
  const text = raw.toString('utf8'), records = []; let record = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index++; } else quoted = !quoted; }
    else if (char === ';' && !quoted) { record.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(field); records.push(record); record = []; field = '';
    } else field += char;
  }
  if (quoted) throw Error('OFFICIAL_REFERENCE_INVALID_CSV');
  if (record.length || field) { record.push(field); records.push(record); }
  const headerIndex = records.findIndex(row => row.includes('Instrument Type') && row.includes('ISIN') && row.includes('Mnemonic'));
  if (headerIndex < 0) throw Error('OFFICIAL_REFERENCE_INVALID_CSV');
  const fields = ['Instrument Type', 'Instrument Status', 'MIC Code', 'ISIN', 'Mnemonic', 'Currency'], header = records[headerIndex];
  const indexes = fields.map(field => header.indexOf(field));
  if (indexes.some(index => index < 0)) throw Error('OFFICIAL_REFERENCE_INVALID_CSV');
  const evidenceRows = new Set(records.slice(headerIndex + 1).map(row => JSON.stringify(indexes.map(index => row[index]))));
  if ((reference.rows || []).some(row => !evidenceRows.has(JSON.stringify(fields.map(field => row[field]))))) throw Error('OFFICIAL_REFERENCE_NORMALIZATION_MISMATCH');
  return records.slice(headerIndex + 1).filter(row => row.length === header.length).map(row => Object.fromEntries(header.map((field, index) => [field, row[index]])));
}
function providerFailure(body) {
  // Mirror the corrected transport's business-error conversion while retaining
  // the original response in the private source evidence.
  const failure = body?.error || (body && Number(body.code) >= 400 && String(body.message || '').toLowerCase() === 'error'
    ? { code: Number(body.code), type: Number(body.code) === 404 ? 'data_not_available' : Number(body.code) >= 500 ? 'internal_error' : 'provider_error' } : null);
  if (!failure) return null;
  const type = String(failure.type || failure.code || 'providerError');
  const reason = ({ data_not_available: 'dataUnavailable', no_ticker_or_exchange_found: 'dataUnavailable', not_found_error: 'dataUnavailable', '404_not_found': 'dataUnavailable',
    internal_error: 'internalError', maintenance: 'internalError', invalid_access_key: 'authError', inactive_user: 'authError', function_access_restricted: 'entitlementRestricted',
    rate_limit_reached: 'rateLimited', usage_limit_reached: 'quotaExceeded' })[type] || 'providerError';
  return { failure, reason };
}
function replayPagination(responses, extract) {
  const successful = responses.filter(response => response.meta.status === 200 && !response.decodeError && !providerFailure(response.body)), rawPages = successful.map(response => response.body), data = [];
  let offset = 0, total = null, pagination = null, valid = true; const seen = new Set();
  for (const body of rawPages) {
    const rows = extract ? extract(body) : Array.isArray(body.data) ? body.data : body.data?.tickers;
    pagination = body.pagination || null;
    if (!Array.isArray(rows)) { valid = false; break; }
    if (pagination) {
      const integer = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
      if (!integer(pagination.offset) || Number(pagination.offset) !== offset || !integer(pagination.count) || Number(pagination.count) !== rows.length || !integer(pagination.total) || Number(pagination.total) < offset + rows.length || total !== null && total !== Number(pagination.total)) valid = false;
      total = Number(pagination.total);
    } else valid = false;
    const signature = JSON.stringify(rows); if (rows.length && seen.has(signature)) valid = false; seen.add(signature);
    data.push(...rows); offset += rows.length;
  }
  const last = responses.at(-1), failure = providerFailure(last?.body), transportOk = last?.meta.status === 200 && !last?.decodeError && !failure;
  const complete = transportOk && valid && total !== null && offset === total;
  return { ok: transportOk && (complete || total === null), status: transportOk ? null : last?.meta.status || null, data, rawPages, complete,
    pagination, pages: rawPages.length, reason: last?.decodeError ? 'invalidResponse' : failure ? failure.reason : !transportOk ? 'httpError' : complete ? null : 'paginationUnverified',
    providerError: failure?.failure || null, retrievedAt: last?.meta.retrievedAt || null };
}
async function replayOperation(operation, responses) {
  if (!responses.length) return { ok: false, complete: false, skipped: true, reason: 'NO_AUTHENTICATED_RAW_RESPONSE', data: null };
  const expectedEndpoint = operation.kind === 'metadata' ? '/tickers/' + encodeURIComponent(operation.symbol) : operation.kind === 'tickerInfo' ? '/tickerinfo' : operation.kind === 'directory' ? '/exchanges/' + operation.mic + '/tickers'
    : ({ etfs: '/etflist', search: '/tickerslist', holdings: '/etfholdings', history: '/eod', latest: '/eod/latest', latestBatch: '/eod/latest' })[operation.kind];
  if (!expectedEndpoint || responses.some(response => response.meta.endpoint !== expectedEndpoint)) throw Error('RAW_OPERATION_ENDPOINT_MISMATCH');
  for (const response of responses) {
    const params = response.meta.params || {};
    if (['history', 'latest', 'latestBatch'].includes(operation.kind)) {
      const expectedMic = operation.mic || operation.listing?.mic, symbols = typeof params.symbols === 'string' ? params.symbols.split(',').filter(Boolean) : [];
      const requested = new Set(operation.symbols || [operation.listing?.providerTicker]);
      if (params.exchange !== expectedMic || !symbols.length || symbols.some(symbol => !requested.has(symbol))) throw Error('RAW_PRICE_QUERY_SCOPE_MISMATCH');
      if (operation.kind === 'history' && (operation.from && params.date_from !== operation.from || operation.to && params.date_to !== operation.to)) throw Error('RAW_HISTORY_RANGE_MISMATCH');
    }
    if (operation.kind === 'holdings' && params.ticker !== operation.symbol) throw Error('RAW_HOLDINGS_QUERY_SCOPE_MISMATCH');
    if (operation.kind === 'tickerInfo' && params.ticker !== operation.symbol) throw Error('RAW_TICKER_INFO_QUERY_SCOPE_MISMATCH');
  }
  const client = { request: async () => { const last = responses.at(-1), failure = providerFailure(last.body), ok = last.meta.status === 200 && !last.decodeError && !failure; return { ok, status: ok ? null : last.meta.status,
    data: last.body, providerError: failure?.failure || null, reason: last.decodeError ? 'invalidResponse' : failure ? failure.reason : last.meta.status === 200 ? null : 'httpError', retrievedAt: last.meta.retrievedAt }; }, paginate: async (_, __, options = {}) => replayPagination(responses, options.extract) };
  const adapter = createAuditAdapter({ client });
  if (operation.kind === 'metadata') {
    const result = await adapter.getTicker(operation.symbol);
    const matches = (result.observations || []).filter(observation => observationMatches(observation, { providerTicker: operation.symbol, mic: operation.mic, isin: operation.expectedIsin }));
    return { ...result, ingestionIdentityMatched: matches.length === 1 };
  }
  if (operation.kind === 'tickerInfo') return adapter.getTickerInfo(operation.symbol);
  if (operation.kind === 'directory') return adapter.listExchangeTickers(operation.mic);
  if (operation.kind === 'search') return adapter.searchTicker(operation.query || operation.search || '');
  if (operation.kind === 'etfs') return adapter.listETFs();
  if (operation.kind === 'holdings') return adapter.getETFHoldings(operation.symbol);
  if (operation.kind === 'history') return adapter.getHistoricalEOD(operation.listing);
  if (operation.kind === 'latest') return adapter.getLatestEOD(operation.listing);
  if (operation.kind === 'latestBatch') {
    const response = replayPagination(responses);
    const { normalizeObservation } = require('../../providers/marketstack/audit-adapter.js');
    const observations = response.data.map(raw => normalizeObservation(raw, { kind: 'EOD', retrievedAt: response.retrievedAt }));
    return { ...response, data: observations.filter(row => operation.symbols.includes(row.normalized.providerTicker) && row.normalized.providerExchange === operation.mic) };
  }
  throw Error('UNSUPPORTED_REPLAY_OPERATION');
}
export async function readIngestionEvidence(directory, keep, project = result => result) {
  if (lstatSync(directory).isSymbolicLink()) throw Error('INPUT_SYMLINK_OR_NOT_REGULAR');
  const root = realpathSync(directory), summary = readJson(join(root, 'summary.json')), manifest = readJson(join(root, 'raw-manifest.json'));
  const byId = new Map(manifest.map(row => [row.id, row]));
  if (byId.size !== manifest.length) throw Error('DUPLICATE_RAW_MANIFEST_ID');
  const entries = [];
  for (const row of summary.results.filter(row => keep(row.operation))) {
    if (!/^normalized\/\d{6}\.json$/.test(row.resultPath || '')) throw Error('INVALID_NORMALIZED_PATH');
    const normalizedPath = safeFile(join(root, row.resultPath), root), entry = readJson(normalizedPath);
    if (entry.ordinal !== row.ordinal || JSON.stringify(entry.operation) !== JSON.stringify(row.operation)) throw Error('OPERATION_MANIFEST_MISMATCH');
    if (row.responseIds && JSON.stringify(row.responseIds) !== JSON.stringify(entry.responseIds || [])) throw Error('RESPONSE_IDS_MANIFEST_MISMATCH');
    if (new Set(entry.responseIds || []).size !== (entry.responseIds || []).length) throw Error('DUPLICATE_OPERATION_RESPONSE_ID');
    const responses = (entry.responseIds || []).map(id => {
      if (!/^\d{6}$/.test(id) || !byId.has(id)) throw Error('RAW_RESPONSE_NOT_IN_MANIFEST');
      const meta = byId.get(id), path = safeFile(join(root, 'raw', id + '.json'), root);
      if (meta.apiVersion !== 'v2' || meta.host !== 'api.marketstack.com') throw Error('RAW_PROVIDER_OR_VERSION_MISMATCH');
      const rawBytes = readFileSync(path);
      if (hash(rawBytes) !== meta.sha256) throw Error('RAW_RESPONSE_HASH_MISMATCH');
      let body = null, decodeError = false;
      try { body = JSON.parse(rawBytes); } catch { decodeError = true; }
      return { meta, body, decodeError, evidence: { path, sha256: meta.sha256, endpoint: meta.endpoint, params: meta.params || {}, status: meta.status,
        rawFormat: decodeError ? 'NON_JSON' : 'JSON', retrievedAt: meta.retrievedAt } };
    });
    const replayed = await replayOperation(entry.operation, responses);
    entries.push({ ...entry, result: project(replayed), sourceEvidence: { normalizedPath, normalizedSha256: hash(readFileSync(normalizedPath)), rawResponses: responses.map(response => response.evidence), rawHashesVerified: responses.length > 0, normalizedFromVerifiedRaw: true } });
  }
  return entries;
}

export async function compileUcitsFromDirectories({ discoveryDir, foundationDir, completionDir, selectedPath, officialReferencePath, outDir, now, calendars = {} }) {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  let existingAncestor = resolve(outDir);
  while (!existsSync(existingAncestor)) existingAncestor = dirname(existingAncestor);
  const resolvedOutput = resolve(realpathSync(existingAncestor), relative(existingAncestor, resolve(outDir)));
  const relativeOutput = relative(repo, resolvedOutput);
  if (!relativeOutput || !outside(relativeOutput)) throw Error('PRIVATE_OUTSIDE_REPOSITORY_REQUIRED');
  if (foundationDir && !existsSync(foundationDir)) throw Error('FOUNDATION_EVIDENCE_NOT_FOUND');
  if (completionDir && !existsSync(completionDir)) throw Error('COMPLETION_EVIDENCE_NOT_FOUND');
  const selected = readJson(selectedPath); selected.sourceEvidence = fileEvidence(selectedPath);
  const officialReference = readJson(officialReferencePath), verifiedReferenceRows = verifyOfficialReference(officialReference, officialReferencePath);
  officialReference.sourceEvidence = { ...fileEvidence(officialReferencePath), rawHashesVerified: Array.isArray(verifiedReferenceRows) };
  if (Array.isArray(verifiedReferenceRows)) officialReference.rows = verifiedReferenceRows;
  const selectedKeys = new Set((selected.etfs || []).map(key)), selectedSymbols = new Set((selected.etfs || []).map(row => row.providerTicker));
  const discoveryEntries = await readIngestionEvidence(discoveryDir, op => ['etfs', 'directory', 'search'].includes(op.kind), result => {
    const projected = { ...result, raw: undefined, rawPages: undefined };
    if (Array.isArray(result.data) && result.data.some(row => row.normalized)) projected.data = result.data.filter(row => {
      const n = normalizeDirectoryObservation(row), type = String(n.row.security_type || n.row.asset_type || n.row.item_type || n.row.type || '').toUpperCase();
      return selectedKeys.has(key(n)) || /ETF/.test(type) || /\b(?:ETF|UCITS)\b/i.test(n.name || '');
    });
    return projected;
  });
  const selectedNativeSymbols = new Set((selected.etfs || []).map(row => row.nativeTicker));
  const keepFoundation = op => op.kind === 'latestBatch' ? op.symbols.some(symbol => selectedKeys.has(op.mic + ':' + symbol))
    : ['metadata', 'holdings', 'history', 'latest', 'tickerInfo'].includes(op.kind) && (selectedSymbols.has(op.symbol || op.listing?.providerTicker)
      || op.kind === 'holdings' && selectedKeys.has(key(op.listingRef || {})) && selectedNativeSymbols.has(op.symbol)
      || op.kind === 'tickerInfo' && op.mic === 'XETR' && selectedNativeSymbols.has(op.symbol));
  const foundationEntries = foundationDir ? await readIngestionEvidence(foundationDir, keepFoundation) : [];
  if (completionDir) foundationEntries.push(...await readIngestionEvidence(completionDir, keepFoundation));
  const result = compileUcitsEvidence({ selected, discoveryEntries, foundationEntries, officialReference, now, calendars: calendars.calendars || calendars });
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const output = realpathSync(outDir), inside = relative(repo, output);
  if (!inside || !outside(inside)) throw Error('PRIVATE_OUTSIDE_REPOSITORY_REQUIRED');
  for (const [name, value] of Object.entries(result)) {
    const target = join(output, name + '.json');
    let stat = null; try { stat = lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw Error('OUTPUT_SYMLINK_OR_NOT_REGULAR');
    writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'w' });
  }
  return { summary: result.marketstack_ucits_universe.summary, files: Object.keys(result).map(name => join(output, name + '.json')) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const position = arg.indexOf('='); if (!arg.startsWith('--') || position < 0) throw Error('EXPECTED_NAMED_ARGUMENT'); return [arg.slice(2, position), arg.slice(position + 1)]; }));
  for (const required of ['discovery', 'selected', 'official-reference', 'out']) if (!args[required]) throw Error('MISSING_' + required.toUpperCase());
  const result = await compileUcitsFromDirectories({ discoveryDir: args.discovery, foundationDir: args.foundation, completionDir: args.completion, selectedPath: args.selected,
    officialReferencePath: args['official-reference'], outDir: args.out, now: args.now, calendars: args.calendars ? readJson(args.calendars) : {} });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
