/** Read-only analysis of already downloaded evidence. No provider calls,
 * production writes, reconstructed prices or Quant-admission decisions. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { probeResponseProvenance } from './marketstack-evidence-provenance.mjs';

export const GLOBAL_SELECT = Object.freeze([
  { company: 'Samsung Electronics', localSymbol: '005930.KS', mic: 'XKRX', preferredUS: null },
  { company: 'SK Hynix', localSymbol: '000660.KS', mic: 'XKRX', preferredUS: null },
  { company: 'Toyota', localSymbol: '7203.T', mic: 'XJPX', preferredUS: 'TM' },
  { company: 'Sony', localSymbol: '6758.T', mic: 'XJPX', preferredUS: 'SONY' },
  { company: 'Nintendo', localSymbol: '7974.T', mic: 'XJPX', preferredUS: null },
  { company: 'Keyence', localSymbol: '6861.T', mic: 'XJPX', preferredUS: null },
  { company: 'Tokyo Electron', localSymbol: '8035.T', mic: 'XJPX', preferredUS: null },
  { company: 'Tencent', localSymbol: '0700.HK', mic: 'XHKG', preferredUS: null },
  { company: 'BYD', localSymbol: '1211.HK', mic: 'XHKG', preferredUS: null },
  { company: 'MediaTek', localSymbol: '2454.TW', mic: 'XTAI', preferredUS: null },
  { company: 'Hon Hai / Foxconn', localSymbol: '2317.TW', mic: 'XTAI', preferredUS: null },
  { company: 'Reliance Industries', localSymbol: 'RELIANCE.NS', mic: 'XNSE', preferredUS: null },
  { company: 'MercadoLibre', localSymbol: 'MELI', mic: 'XNAS', preferredUS: 'MELI' }
]);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const ratio = (a, b) => finite(a) && finite(b) && b !== 0 ? a / b : null;
const unique = values => [...new Set(values)].sort();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Replayed JSON can reorder object keys without changing provider evidence.
// Arrays retain order; different price values remain distinct observations.
export function canonicalPriceEvidenceValue(value) {
  if (Array.isArray(value)) return value.map(canonicalPriceEvidenceValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonicalPriceEvidenceValue(value[key])]));
  return value;
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function priceIssues(row, adjusted = false) {
  const p = ['open', 'high', 'low', 'close'].map(field => row[adjusted ? 'adj_' + field : field]);
  if (p.some(value => !finite(value) || value <= 0)) return adjusted ? 'ADJUSTED_OHLC_MISSING_OR_INVALID' : 'RAW_OHLC_INVALID';
  return p[1] < Math.max(p[0], p[2], p[3]) || p[2] > Math.min(p[0], p[1], p[3]) ?
    adjusted ? 'ADJUSTED_OHLC_IMPOSSIBLE' : 'RAW_OHLC_IMPOSSIBLE' : null;
}
function extrema(values) {
  const usable = values.filter(finite);
  return { count: usable.length, min: usable.length ? Math.min(...usable) : null, max: usable.length ? Math.max(...usable) : null };
}
function splitSignature(observed, factor, tolerance) {
  if (!finite(factor) || factor <= 0 || factor === 1 || observed === null) return 'UNRESOLVED';
  if (Math.abs(observed / factor - 1) <= tolerance) return 'UNADJUSTED_SPLIT_GAP_SIGNATURE';
  if (Math.abs(observed - 1) <= tolerance) return 'CONTINUOUS_REPORTED_PRICE_SIGNATURE';
  return 'UNRESOLVED';
}

export function analyzeAdjustmentWindow(rows, options = {}) {
  if (!Array.isArray(rows)) throw Error('PRICE_ROWS_REQUIRED');
  const sorted = rows.map(row => ({ ...row })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const issues = [], seen = new Set(), splits = [], dividends = [], closeRatios = [], volumeRatios = [];
  const adjacentCloseRatios = [], adjacentAdjustedCloseRatios = [];
  let rawInvalid = 0, adjustedInvalid = 0, identicalAdjustedCloses = 0, adjustedCloses = 0;
  let outOfBoundsCandles = 0;
  let identityMismatchCandles = 0;
  const inWindow = date => (!options.requestedFrom || date >= options.requestedFrom) && (!options.requestedTo || date <= options.requestedTo);
  const inIdentity = row => (!options.requestedSymbols?.length || options.requestedSymbols.includes(row.symbol)) &&
    (!options.requestedExchange || row.exchange === options.requestedExchange);
  for (const row of sorted) {
    const date = String(row.date || '').slice(0, 10), flags = [];
    if (!validDate(date)) flags.push('INVALID_DATE');
    if (validDate(date) && !inWindow(date)) { flags.push('REQUESTED_DATE_WINDOW_OUT_OF_BOUNDS'); outOfBoundsCandles++; }
    if (!inIdentity(row)) { flags.push('REQUESTED_LISTING_IDENTITY_MISMATCH'); identityMismatchCandles++; }
    if (seen.has(date)) flags.push('DUPLICATE_CANDLE'); seen.add(date);
    const rawProblem = priceIssues(row), adjustedProblem = priceIssues(row, true);
    if (rawProblem) { flags.push(rawProblem); rawInvalid++; }
    if (adjustedProblem) { flags.push(adjustedProblem); adjustedInvalid++; }
    if (finite(row.adj_close) && finite(row.close) && row.close > 0) {
      adjustedCloses++; if (row.adj_close === row.close) identicalAdjustedCloses++;
      closeRatios.push(row.adj_close / row.close);
    }
    if (finite(row.adj_volume) && finite(row.volume) && row.volume > 0) volumeRatios.push(row.adj_volume / row.volume);
    if (!rawProblem && !adjustedProblem) {
      const factors = ['open', 'high', 'low', 'close'].map(field => row['adj_' + field] / row[field]);
      if (Math.max(...factors) / Math.min(...factors) - 1 > (options.adjustmentFactorTolerance ?? 0.001)) flags.push('ADJUSTMENT_FACTOR_INCONSISTENT_ACROSS_OHLC');
    }
    if (row.volume !== null && row.volume !== undefined && (!finite(row.volume) || row.volume < 0)) flags.push('VOLUME_INVALID');
    if (row.split_factor !== null && row.split_factor !== undefined && (!finite(row.split_factor) || row.split_factor <= 0)) flags.push('SPLIT_FACTOR_INVALID');
    if (validDate(date) && inWindow(date) && inIdentity(row) && finite(row.split_factor) && row.split_factor > 0 && row.split_factor !== 1) splits.push({ date, factor: row.split_factor });
    if (row.dividend !== null && row.dividend !== undefined && (!finite(row.dividend) || row.dividend < 0)) flags.push('DIVIDEND_INVALID');
    if (validDate(date) && inWindow(date) && inIdentity(row) && finite(row.dividend) && row.dividend > 0) dividends.push({ date, amount: row.dividend });
    if (flags.length) issues.push({ date, flags: unique(flags) });
  }
  const usable = sorted.filter(row => validDate(String(row.date || '').slice(0, 10)) && inWindow(row.date.slice(0, 10)) && inIdentity(row) && !priceIssues(row));
  for (let i = 1; i < usable.length; i++) {
    adjacentCloseRatios.push(ratio(usable[i - 1].close, usable[i].close));
    adjacentAdjustedCloseRatios.push(ratio(usable[i - 1].adj_close, usable[i].adj_close));
  }
  const signature = [];
  if (dividends.length && adjustedCloses === sorted.length && identicalAdjustedCloses === sorted.length) signature.push('NO_DIVIDEND_ADJUSTMENT_VISIBLE_IN_REPORTED_ADJ_CLOSE');
  if (!volumeRatios.length) signature.push('ADJUSTED_VOLUME_UNAVAILABLE');
  const event = options.event || null;
  const tolerance = options.splitSignatureTolerance ?? 0.15;
  const providerSplitDiagnostics = splits.map(split => {
    const before = usable.filter(row => row.date.slice(0, 10) < split.date).at(-1);
    const after = usable.find(row => row.date.slice(0, 10) === split.date);
    const observed = ratio(before?.close, after?.close);
    const basisSignature = splitSignature(observed, split.factor, tolerance);
    if (basisSignature === 'CONTINUOUS_REPORTED_PRICE_SIGNATURE') signature.push('DOUBLE_ADJUSTMENT_RISK_REVIEW');
    return { ...split, beforeDate: before?.date.slice(0, 10) || null,
      closeRatioBeforeAfter: observed, adjustedCloseRatioBeforeAfter: ratio(before?.adj_close, after?.adj_close),
      volumeRatioBeforeAfter: ratio(before?.volume, after?.volume), basisSignature,
      dateBasis: 'PROVIDER_REPORTED_ONLY_NOT_OFFICIAL_EX_DATE_VERIFICATION' };
  });
  const splitGapCandidates = [];
  if (event?.verification === 'VERIFIED_OFFICIAL_SOURCE' && finite(event.factor) && event.factor > 0 && event.factor !== 1) {
    for (let i = 1; i < usable.length; i++) {
      const before = usable[i - 1], after = usable[i], observed = ratio(before.close, after.close);
      if (splitSignature(observed, event.factor, tolerance) !== 'UNADJUSTED_SPLIT_GAP_SIGNATURE') continue;
      const date = after.date.slice(0, 10), adjusted = ratio(before.adj_close, after.adj_close);
      splitGapCandidates.push({ beforeDate: before.date.slice(0, 10), date, closeRatioBeforeAfter: observed,
        adjustedCloseRatioBeforeAfter: adjusted, expectedOfficialFactor: event.factor });
      if (validDate(event.marketDate) && date !== event.marketDate) signature.push('SPLIT_PRICE_GAP_DATE_DIFFERS_FROM_OFFICIAL_MARKET_DATE');
      if (splitSignature(adjusted, event.factor, tolerance) === 'UNADJUSTED_SPLIT_GAP_SIGNATURE') signature.push('REPORTED_ADJ_CLOSE_RETAINS_SPLIT_GAP');
    }
    if (splits.filter(split => split.factor === event.factor).length > 1) signature.push('MULTIPLE_PROVIDER_SPLIT_DATES_FOR_ONE_OFFICIAL_EVENT_WINDOW');
  }
  let eventObservation = null;
  if (event) {
    // Legal effective/record dates need not equal the exchange ex-date.
    // Use an explicit verified marketDate only; do not fabricate one.
    const marketDate = event.marketDate || null;
    if (event.verification !== 'VERIFIED_OFFICIAL_SOURCE' || !event.sourceUrl || !validDate(marketDate)) {
      eventObservation = { state: 'EVENT_MARKET_DATE_UNVERIFIED', effectiveDate: event.effectiveDate || null };
    } else {
      const before = usable.filter(row => row.date.slice(0, 10) < marketDate).at(-1);
      const after = usable.find(row => row.date.slice(0, 10) >= marketDate);
      const observed = ratio(before?.close, after?.close);
      const factor = event.factor;
      const basisSignature = splitSignature(observed, factor, tolerance);
      eventObservation = { state: before && after ? 'OBSERVED_DIAGNOSTIC_ONLY' : 'EVENT_WINDOW_INCOMPLETE',
        eventType: event.type, marketDate, effectiveDate: event.effectiveDate || null,
        beforeDate: before?.date.slice(0, 10) || null, afterDate: after?.date.slice(0, 10) || null,
        closeRatioBeforeAfter: observed, adjustedCloseRatioBeforeAfter: ratio(before?.adj_close, after?.adj_close),
        volumeRatioBeforeAfter: ratio(before?.volume, after?.volume), expectedSplitFactor: finite(factor) ? factor : null,
        basisSignature, providerSplitObservations: splits, sourceUrl: event.sourceUrl };
      if (basisSignature === 'CONTINUOUS_REPORTED_PRICE_SIGNATURE' && splits.some(s => s.factor === factor)) signature.push('DOUBLE_ADJUSTMENT_RISK_REVIEW');
    }
  }
  const issueCountsByFlag = {};
  for (const issue of issues) for (const flag of issue.flags) issueCountsByFlag[flag] = (issueCountsByFlag[flag] || 0) + 1;
  const details = options.maxIssueDetails === undefined ? issues : issues.slice(0, options.maxIssueDetails);
  return { bars: sorted.length, firstDate: usable[0]?.date.slice(0, 10) || null,
    lastDate: usable.at(-1)?.date.slice(0, 10) || null, maximumHistoryDepthEstablished: false,
    requestedWindow: { from: options.requestedFrom || null, to: options.requestedTo || null }, outOfBoundsCandles,
    identityMismatchCandles,
    rawInvalid, adjustedInvalid, validRawCandles: usable.length, adjustedCloses, identicalAdjustedCloses,
    adjustedCloseToClose: extrema(closeRatios), adjustedVolumeToVolume: extrema(volumeRatios),
    adjacentCloseRatios: extrema(adjacentCloseRatios), adjacentAdjustedCloseRatios: extrema(adjacentAdjustedCloseRatios),
    dividendObservations: dividends, splitObservations: splits, providerSplitDiagnostics, splitGapCandidates,
    currenciesObserved: unique(sorted.map(row => row.price_currency).filter(Boolean)),
    missingCurrencyCandles: sorted.filter(row => !row.price_currency).length,
    exchangesObserved: unique(sorted.map(row => row.exchange).filter(Boolean)),
    issues: details, issueCount: issues.length, issueCountsByFlag, issueDetailsTruncated: details.length < issues.length,
    signatures: unique(signature), eventObservation,
    adjustmentStatus: 'UNVERIFIED', technicalAdmission: 'BLOCKED_UNVERIFIED_PRICE_BASIS',
    evidenceSha256: hash(rows) };
}

export function collectPriceEvidence(probes) {
  // Scale probes include cached seed responses. Retain their original dated
  // provenance when the source probe is supplied; do not count them twice or
  // relabel an old observation as a fresh provider request.
  const byObservation = new Map();
  for (const probe of probes) for (const e of probe.endpoints || []) {
    const params = Object.fromEntries(Object.entries(e.params || {}).sort(([a], [b]) => a.localeCompare(b)));
    const key = hash(canonicalPriceEvidenceValue([e.endpoint, params, e.checkedAt || null, e.data || null]));
    const provenance = probeResponseProvenance(e, probe);
    const runId = provenance.sourceRunId;
    const observed = { ...e, runId, sourceRunAttribution: provenance.sourceRunAttribution };
    if (!byObservation.has(key) || (!byObservation.get(key).runId && runId)) byObservation.set(key, observed);
  }
  return [...byObservation.values()];
}

export function buildScaleAudit(probes, options = {}) {
  const entries = collectPriceEvidence(probes);
  const windows = entries.filter(e => /^\/?eod(?:\/latest)?$/.test(e.endpoint) && e.ok && Array.isArray(e.data?.data)).flatMap(e => {
    // Multi-symbol pages contain repeated trading dates across instruments.
    // Partition by exact returned identity before candle/action diagnostics.
    const instruments = new Map();
    for (const row of e.data.data) {
      const symbol = row.symbol || (e.params?.symbols && !e.params.symbols.includes(',') ? e.params.symbols : null);
      const mic = row.exchange || e.params?.exchange || null;
      const key = JSON.stringify([symbol, mic]);
      if (!instruments.has(key)) instruments.set(key, { symbol, mic, rows: [] });
      instruments.get(key).rows.push(row);
    }
    return [...instruments.values()].map(({ symbol, mic, rows }) => {
    const event = (options.events || []).find(event => event.providerSymbol === symbol &&
      (!event.exchange || event.exchange === mic) &&
      (!e.params.date_from || !event.to || e.params.date_from <= event.to) &&
      (!e.params.date_to || !event.from || e.params.date_to >= event.from) &&
      (!e.params.date_from || !event.marketDate || e.params.date_from <= event.marketDate) &&
      (!e.params.date_to || !event.marketDate || e.params.date_to >= event.marketDate));
    return { runId: e.runId, sourceRunAttribution: e.sourceRunAttribution,
      endpoint: e.endpoint, params: e.params, label: e.label || null,
      providerSymbol: symbol, providerExchange: mic, checkedAt: e.checkedAt || null,
      analysis: analyzeAdjustmentWindow(rows, { event, requestedFrom: e.params?.date_from, requestedTo: e.params?.date_to,
        requestedSymbols: String(e.params?.symbols || '').split(',').filter(Boolean), requestedExchange: e.params?.exchange,
        maxIssueDetails: options.maxIssueDetails ?? 20 }) };
    });
  });
  const listings = options.listings || [];
  const decisions = options.decisions || [];
  const priceRequestOutcomes = entries.filter(e => /^\/?eod(?:\/latest)?$/.test(e.endpoint)).map(e => {
    const rows = Array.isArray(e.data?.data) ? e.data.data : [];
    const returnedDates = unique(rows.map(row => String(row.date || '').slice(0, 10)).filter(validDate));
    const symbols = String(e.params?.symbols || '').split(',').filter(Boolean);
    const usableDates = unique(rows.filter(row => !priceIssues(row) && (!symbols.length || symbols.includes(row.symbol)) &&
      (!e.params?.exchange || row.exchange === e.params.exchange)).map(row => String(row.date || '').slice(0, 10))
      .filter(date => validDate(date) && (!e.params?.date_from || date >= e.params.date_from) && (!e.params?.date_to || date <= e.params.date_to)));
    const dateSequence = rows.map(row => String(row.date || '').slice(0, 10));
    const ascendingPage = dateSequence.every((date, index) => validDate(date) && (!index || date >= dateSequence[index - 1]));
    return {
    runId: e.runId, sourceRunAttribution: e.sourceRunAttribution,
    endpoint: e.endpoint, params: e.params, label: e.label || null,
    checkedAt: e.checkedAt || null, ok: !!e.ok, reason: e.reason || null,
    returnedBars: Array.isArray(e.data?.data) ? e.data.data.length : null,
    rawReturnedDateMin: returnedDates[0] || null, rawReturnedDateMax: returnedDates.at(-1) || null,
    validRawDateMinWithinRequestedWindow: usableDates[0] || null,
    ascendingSingleRowControl: e.params?.sort === 'ASC' && Number(e.params?.limit) === 1,
    ascendingControl: e.params?.sort === 'ASC', ascendingOrderVerifiedWithinReturnedPage: e.params?.sort === 'ASC' ? ascendingPage : null,
    earliestReturnedAscendingSample: e.params?.sort === 'ASC' && ascendingPage ? usableDates[0] || null : null,
    state: !e.ok ? 'REQUEST_UNSUCCESSFUL' : !rows.length ? 'EMPTY_RESPONSE_FOR_TESTED_SCOPE' :
      !usableDates.length ? 'NO_VALID_IN_SCOPE_RAW_PRICE_ROWS' : 'BOUNDED_VALID_ROWS_RETURNED',
    establishedEarliestAvailableDate: false
  }; });
  const actionChecks = entries.filter(e => /(?:^|\/)(splits|dividends)$/.test(e.endpoint) && e.ok && Array.isArray(e.data?.data)).map(e => {
    const type = /splits$/.test(e.endpoint) ? 'SPLIT' : 'DIVIDEND';
    const symbol = e.params?.symbols || e.params?.ticker || null;
    const data = e.data.data, key = type === 'SPLIT' ? 'factor' : 'amount';
    const observed = data.filter(row => !row.symbol || row.symbol === symbol).map(row => ({
      date: String(row.date || '').slice(0, 10),
      [key]: type === 'SPLIT' ? row.split_factor ?? row.splitFactor : row.dividend ?? row.amount
    })).filter(row => validDate(row.date) && finite(row[key]));
    const from = e.params?.date_from, to = e.params?.date_to;
    const matchingWindows = windows.filter(w => w.providerSymbol === symbol &&
      (!e.params?.exchange || w.providerExchange === e.params.exchange));
    const observations = matchingWindows.flatMap(w => type === 'SPLIT' ? w.analysis.splitObservations : w.analysis.dividendObservations)
      .filter(row => (!from || row.date >= from) && (!to || row.date <= to));
    const canonical = list => new Map(list.map(row => [row.date, row[key]]));
    const ep = canonical(observed), daily = canonical(observations);
    return { runId: e.runId, sourceRunAttribution: e.sourceRunAttribution,
      endpoint: e.endpoint, params: e.params, type, providerSymbol: symbol,
      returned: data.length, validDateAndValueRows: observed.length,
      paginationComplete: !e.data.pagination || !finite(e.data.pagination.total) ? null : e.data.pagination.total <= data.length,
      matchingEodWindows: matchingWindows.length,
      endpointEventsAbsentFromEod: [...ep.keys()].filter(date => !daily.has(date)).sort(),
      eodEventsAbsentFromEndpoint: [...daily.keys()].filter(date => !ep.has(date)).sort(),
      sameDateValueMismatches: [...ep.keys()].filter(date => daily.has(date) && ep.get(date) !== daily.get(date)).sort(),
      sourceRelation: 'SAME_PROVIDER_ENDPOINT_CONSISTENCY_ONLY', verifiedCorporateActionBasis: false };
  });
  const globalRows = GLOBAL_SELECT.map(scope => {
    const history = windows.filter(w => w.providerSymbol === scope.localSymbol && w.providerExchange === scope.mic);
    const prices = history.map(w => w.analysis);
    const priceAttempts = entries.filter(e => /^\/?eod(?:\/latest)?$/.test(e.endpoint) &&
      String(e.params?.symbols || '').split(',').includes(scope.localSymbol) &&
      (!e.params?.exchange || e.params.exchange === scope.mic));
    const intradayAttempts = entries.filter(e => /^\/?intraday(?:\/latest)?$/.test(e.endpoint) &&
      String(e.params?.symbols || '').split(',').includes(scope.localSymbol) &&
      (!e.params?.exchange || e.params.exchange === scope.mic));
    const metadata = entries.filter(e => /tickerinfo|tickerslist|tickers\//.test(e.endpoint) &&
      (e.params?.ticker === scope.localSymbol || e.params?.search === scope.company || e.endpoint.endsWith('/' + scope.localSymbol)));
    const matchingMetadata = metadata.filter(e => {
      if (!e.ok) return false;
      const data = e.data?.data ?? e.data;
      const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
      return rows.some(row => (row.ticker || row.symbol) === scope.localSymbol &&
        (!row.stock_exchange?.mic || row.stock_exchange.mic === scope.mic));
    });
    const metadataVenueVerified = matchingMetadata.some(e => {
      const data = e.data?.data ?? e.data;
      const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
      return rows.some(row => (row.ticker || row.symbol) === scope.localSymbol && row.stock_exchange?.mic === scope.mic);
    });
    const listing = listings.find(row => row.providerSymbol === scope.localSymbol &&
      (row.providerExchange || row.mic) === scope.mic);
    const us = scope.preferredUS ? decisions.find(row => row.ticker === scope.preferredUS && row.product_eligibility !== 'EXCLUDED') : null;
    const usLatest = (options.usLatestRows || []).find(row => row.providerSymbol === scope.localSymbol && row.mic === scope.mic);
    return { ...scope, scopeType: 'NAMED_VALIDATION_COMPANY_NOT_UNIVERSE_DEFINITION',
      canonicalListingId: listing?.listingId || null, companyId: listing?.companyId || null,
      issuerLinked: !!listing?.companyId, preferredConsumerListing: us ? scope.preferredUS : listing?.listingId || null,
      preferredBasis: us ? 'PROTECTED_EXISTING_US_LISTING' : listing ? 'VERIFIED_ADDITIVE_LOCAL_LISTING' : 'UNRESOLVED',
      metadataRequestsObserved: metadata.length, metadataAccessible: matchingMetadata.length > 0,
      metadataVenueVerified,
      priceRequestsObserved: priceAttempts.length, returnedWindows: history.length,
      returnedBars: prices.reduce((sum, p) => sum + p.bars, 0),
      validRawCandles: prices.reduce((sum, p) => sum + p.validRawCandles, 0),
      unsuccessfulOrEmptyPriceRequests: priceAttempts.filter(e => !e.ok || !e.data?.data?.length).length,
      testedFrom: unique(prices.map(p => p.firstDate).filter(Boolean))[0] || null,
      testedTo: unique(prices.map(p => p.lastDate).filter(Boolean)).at(-1) || null,
      historyCoverage: prices.some(p => p.validRawCandles) ? 'PARTIAL' : 'UNKNOWN',
      usBenchmarkLatestStatus: usLatest?.status || null,
      usBenchmarkLatestValid: usLatest?.validLatest === true,
      usBenchmarkLatestTradingDate: usLatest?.tradingDate || null,
      intraday: 'UNKNOWN', realtime: 'UNKNOWN', corporateActionBasis: 'UNVERIFIED',
      intradayAudit: { requestsObserved: intradayAttempts.length,
        returnedBars: intradayAttempts.reduce((sum, e) => sum + (Array.isArray(e.data?.data) ? e.data.data.length : 0), 0),
        successfulEmptyResponses: intradayAttempts.filter(e => e.ok && Array.isArray(e.data?.data) && !e.data.data.length).length,
        unsuccessfulRequests: intradayAttempts.filter(e => !e.ok).length,
        checkedAt: unique(intradayAttempts.map(e => e.checkedAt).filter(Boolean)), realtimeProven: false },
      fundamentals: listing?.coverage?.fundamentals || 'UNKNOWN', quantAdmission: false,
      sourceRunIds: unique(history.map(w => w.runId).filter(Boolean)) };
  });
  const generatedAt = options.generatedAt || new Date().toISOString();
  const officialDividendCrosschecks = (options.dividendControls || []).map(control => {
    const verified = control.verification === 'VERIFIED_OFFICIAL_SOURCE' && !!control.sourceUrl && finite(control.amount);
    const observed = windows.filter(w => w.providerSymbol === control.providerSymbol && w.providerExchange === control.exchange)
      .flatMap(w => w.analysis.dividendObservations);
    const matching = unique(observed.filter(row => row.amount === control.amount).map(row => row.date));
    return { ...control, providerAmountMatchingObservationDates: matching,
      officialAmountCorrespondence: verified && matching.length > 0,
      officialExDateCorrespondence: verified && validDate(control.marketDate) ? matching.includes(control.marketDate) : null,
      adjustmentCorrectnessVerified: false,
      sourceRelation: 'OFFICIAL_ISSUER_DIVIDEND_REFERENCE_VS_PROVIDER_OBSERVATIONS' };
  });
  return {
    adjustments: { schemaVersion: 'marketstack-scale-adjustments-1.0.0', generatedAt,
      scope: 'BOUNDED_PROVIDER_REPORTED_PRICE_AND_ACTION_DIAGNOSTICS', windows,
      priceRequestOutcomes,
      sourceRunIds: unique(entries.map(e => e.runId).filter(Boolean)),
      actionEndpointCrosschecks: actionChecks,
      officialDividendCrosschecks,
      summary: { windows: windows.length, windowsWithInvalidRawOHLC: windows.filter(w => w.analysis.rawInvalid).length,
        windowsWithInvalidAdjustedOHLC: windows.filter(w => w.analysis.adjustedInvalid).length,
        windowsWithDividendButAllAdjustedCloseIdentical: windows.filter(w => w.analysis.signatures.includes('NO_DIVIDEND_ADJUSTMENT_VISIBLE_IN_REPORTED_ADJ_CLOSE')).length },
      events: options.events || [], productionChanged: false, adjustmentVerified: false,
      providerReplacementDecision: 'DEFERRED',
      limitations: ['Adjacent price/volume ratios are diagnostics, not proof of adjustment correctness.',
        'Issue counts cover every returned candle; detailed issue dates are a bounded sample of the first 20 per window.',
        'Spinoffs, capital returns and special dividends require action-specific official evidence.',
        'Legal effective date is not automatically the exchange ex-date.',
        'No Quant/technical strategy admission or second corporate-action adjustment is performed.'] },
    globalSelect: { schemaVersion: 'global-select-marketstack-coverage-1.0.0', generatedAt,
      scope: 'THIRTEEN_NAMED_VALIDATION_COMPANIES', rows: globalRows,
      counts: { companiesAssessed: globalRows.length, withBoundedReturnedHistory: globalRows.filter(r => r.returnedBars).length,
        canonicalLocalListings: globalRows.filter(r => r.canonicalListingId).length,
        preferredExistingUS: globalRows.filter(r => r.preferredBasis === 'PROTECTED_EXISTING_US_LISTING').length },
      productionChanged: false, limitations: ['Provider catalog symbols/MICs require verified venue and currency mappings before ingestion.',
        'Missing metadata requests are unknown coverage, not confirmed provider absence.',
        'Source-company identity is not inferred from ticker or provider name.',
        'OTC aliases are not automatically preferred over local listings.',
        'A bounded returned history is not complete depth, realtime or corporate-action certification.'] }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), values = name => args.filter(a => a.startsWith('--' + name + '=')).map(a => a.slice(name.length + 3));
  const files = values('probe'); if (!files.length) throw Error('PROBE_INPUT_REQUIRED');
  const read = path => JSON.parse(readFileSync(path));
  const layer = values('listings')[0] ? read(values('listings')[0]) : { listings: [] };
  const baseline = values('baseline')[0] ? read(values('baseline')[0]) : { decisions: [] };
  const controls = values('official-controls')[0] ? read(values('official-controls')[0]) : {};
  const events = values('events')[0] ? read(values('events')[0]) : controls.events || [];
  const usLatest = values('us-latest')[0] ? read(values('us-latest')[0]) : null;
  const dividendControls = values('dividend-controls')[0] ? read(values('dividend-controls')[0]) : controls.dividendControls || [];
  const probes = files.map(read);
  const generatedAt = values('generated-at')[0] || unique(probes.map(p => p.generatedAt).filter(Boolean)).at(-1);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) throw Error('DETERMINISTIC_EVIDENCE_TIMESTAMP_REQUIRED');
  const result = buildScaleAudit(probes, { generatedAt, listings: layer.listings, decisions: baseline.decisions, events, usLatestRows: usLatest?.rows, dividendControls });
  const out = resolve(values('out')[0] || 'reports/marketstack'); mkdirSync(out, { recursive: true });
  for (const [file, data] of [['marketstack_scale_adjustments.json', result.adjustments], ['global_select_marketstack_coverage.json', result.globalSelect]]) {
    writeFileSync(resolve(out, file), JSON.stringify(data, null, 2) + '\n');
  }
  console.log(JSON.stringify({ adjustments: result.adjustments.summary, globalSelect: result.globalSelect.counts }));
}
