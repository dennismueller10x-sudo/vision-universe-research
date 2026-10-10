/** Private Europe foundation gates. No provider calls, publication or price repair.
 * Calendar evidence is supplied by the caller; the US calendar is never reused.
 * All original rows, including quarantined rows, remain available unchanged.
 */
import { createRequire } from 'node:module';
import { reconcileEuropeActions } from './europe-actions.mjs';
import { EUROPE_EXCHANGE_PLAN } from './europe-universe.mjs';
const require = createRequire(import.meta.url);
const Canonical = require('../../quant/engines/technical/canonical-bars.js');
const Features = require('../../quant/engines/technical/feature-store.js');
const RS = require('../../quant/engines/technical/relative-strength-engine.js');

export const QUALITY_VERSION = 'marketstack-europe-quality-1';
const DAY = 86400000;
const number = value => typeof value === 'number' && Number.isFinite(value);
const valueOrNull = value => number(value) ? value : null;
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)
    || value.length > 10 && !Number.isFinite(Date.parse(value))) return null;
  const date = value.slice(0, 10), time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? date : null;
}
function normalizeRow(raw, index, listing) {
  const normalized = raw?.normalized ?? raw;
  const providerRaw = raw?.raw ?? raw;
  const reportedMics = [...new Set([providerRaw?.exchange, providerRaw?.stock_exchange?.mic, providerRaw?.stock_exchange?.exchange_mic,
    raw?.normalized?.providerExchange].filter(value => typeof value === 'string' && /^[A-Z0-9]{4}$/.test(value)))];
  const reportedSymbols = [...new Set([providerRaw?.symbol, providerRaw?.ticker, raw?.normalized?.providerTicker].filter(value => typeof value === 'string' && value))];
  const reportedCurrencies = [...new Set([providerRaw?.currency, providerRaw?.price_currency, raw?.normalized?.currency,
    raw?.normalized?.priceCurrency, raw?.normalized?.price_currency].filter(value => value !== null && value !== undefined))];
  return { date: day(normalized?.date ?? normalized?.timestamp ?? normalized?.tradingDate ?? normalized?.marketTimestamp), open: normalized?.open, high: normalized?.high,
    low: normalized?.low, close: normalized?.close, volume: normalized?.volume ?? null,
    currency: normalized?.currency ?? normalized?.priceCurrency ?? normalized?.price_currency ?? listing.currency ?? null,
    exchange: normalized?.exchange ?? normalized?.providerExchange ?? listing.exchange ?? listing.mic ?? null,
    providerSymbol: normalized?.symbol ?? normalized?.providerTicker ?? listing.providerTicker ?? listing.providerSymbol ?? null,
    reportedMics, reportedSymbols, reportedCurrencies, rawIndex: index, raw, providerRaw };
}
const US_MICS = new Set(['XNAS', 'XNYS', 'ARCX', 'BATS', 'IEXG', 'XASE']);
const EUROPE_MICS = new Set(EUROPE_EXCHANGE_PLAN.flatMap(exchange => exchange.mics));
function calendarBound(calendar, listing = {}) {
  const mic = listing.mic ?? listing.exchange;
  return Boolean(calendar.verified === true && calendar.source && mic && calendar.mic === mic && !US_MICS.has(mic)
    && (!calendar.expectedSessions || Array.isArray(calendar.expectedSessions) && calendar.expectedSessions.every(value => day(value) === value)));
}

/** Invalid observations are quarantined, never averaged, filled, or overwritten.
 * Abnormal returns are review flags: a genuine move is not automatically invalid.
 * expectedSessions must be a verified, complete exchange-specific calendar slice.
 */
export function validateEodBars(rawBars = [], options = {}) {
  if (!Array.isArray(rawBars)) throw new TypeError('bars must be an array');
  const listing = options.listing ?? {};
  const calendar = options.calendar ?? {};
  const nowDate = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : null;
  if (nowDate && !Number.isFinite(nowDate.getTime())) throw new TypeError('INVALID_EVALUATION_TIME');
  const today = nowDate ? nowDate.toISOString().slice(0, 10) : null;
  const completedSession = calendarBound(calendar, listing) ? day(calendar.expectedLastCompletedSession) : null;
  const range = options.requestRange ?? {};
  for (const bound of ['from', 'to']) if (range[bound] !== undefined && range[bound] !== null && day(range[bound]) !== range[bound]) throw new TypeError('INVALID_REQUEST_RANGE');
  if (range.from && range.to && range.from > range.to) throw new TypeError('INVALID_REQUEST_RANGE');
  const identityFrom = listing.identityValidFrom, identityTo = listing.identityValidTo;
  for (const bound of [identityFrom, identityTo]) if (bound !== undefined && bound !== null && day(bound) !== bound) throw new TypeError('INVALID_LISTING_IDENTITY_INTERVAL');
  if (identityFrom && identityTo && identityFrom > identityTo) throw new TypeError('INVALID_LISTING_IDENTITY_INTERVAL');
  const rows = rawBars.map((row, index) => normalizeRow(row, index, listing));
  const dateCounts = new Map();
  for (const row of rows) if (row.date) dateCounts.set(row.date, (dateCounts.get(row.date) ?? 0) + 1);
  const currencies = [...new Set(rows.map(row => row.currency).filter(Boolean))];
  const expectedCurrency = options.currency ?? listing.currency ?? (currencies.length === 1 ? currencies[0] : null);
  const validBars = [], quarantine = [], warnings = [];
  for (const row of rows) {
    const reasons = [];
    const expectedMic = listing.mic ?? listing.exchange;
    const expectedSymbol = listing.providerTicker ?? listing.providerSymbol;
    if (expectedSymbol && row.reportedSymbols.some(symbol => !new Set([expectedSymbol, ...(listing.verifiedAliases ?? [])]).has(symbol))) reasons.push('PROVIDER_SYMBOL_MISMATCH');
    if (row.reportedMics.length > 1 || expectedMic && row.reportedMics.some(mic => mic !== expectedMic) || row.reportedMics.some(mic => US_MICS.has(mic))) reasons.push('PROVIDER_MIC_MISMATCH');
    if (!row.date) reasons.push('INVALID_DATE');
    if (row.date && today && row.date > today) reasons.push('FUTURE_EOD_DATE');
    if (row.date && completedSession && row.date > completedSession) reasons.push('UNCOMPLETED_SESSION_EOD');
    if (row.date && (range.from && row.date < range.from || range.to && row.date > range.to)) reasons.push('OUTSIDE_REQUESTED_RANGE');
    if (row.date && (identityFrom && row.date < identityFrom || identityTo && row.date > identityTo)) reasons.push('OUTSIDE_LISTING_IDENTITY_INTERVAL');
    if (row.date && dateCounts.get(row.date) > 1) reasons.push('DUPLICATE_DATE');
    if (['open', 'high', 'low', 'close'].some(key => !number(row[key]))) reasons.push('NON_NUMERIC_OHLC');
    else {
      if (['open', 'high', 'low', 'close'].some(key => row[key] <= 0)) reasons.push('NON_POSITIVE_PRICE');
      if (row.high < Math.max(row.open, row.close, row.low) || row.low > Math.min(row.open, row.close, row.high)) reasons.push('IMPOSSIBLE_OHLC');
    }
    if (row.volume !== null && (!number(row.volume) || row.volume < 0)) reasons.push('INVALID_VOLUME');
    if (row.reportedCurrencies.some(currency => typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))) reasons.push('INVALID_CURRENCY_DECLARATION');
    if (row.reportedCurrencies.length > 1 || row.currency && ((expectedCurrency && (row.currency !== expectedCurrency || row.reportedCurrencies.some(currency => currency !== expectedCurrency))) || (!expectedCurrency && currencies.length > 1))) reasons.push('CURRENCY_INCONSISTENT');
    if (reasons.length) quarantine.push({ ...row, reasons });
    else {
      validBars.push(row);
      if (row.volume === null) warnings.push({ date: row.date, code: 'VOLUME_MISSING' });
      if (row.volume === 0) warnings.push({ date: row.date, code: 'ZERO_VOLUME' });
      if (!row.currency) warnings.push({ date: row.date, code: 'CURRENCY_MISSING' });
      if (expectedSymbol && !row.reportedSymbols.length) warnings.push({ date: row.date, code: 'PROVIDER_SYMBOL_NOT_REPORTED' });
      if (expectedMic && !row.reportedMics.length) warnings.push({ date: row.date, code: 'PROVIDER_MIC_NOT_REPORTED' });
    }
  }
  validBars.sort((a, b) => a.date.localeCompare(b.date));
  const gaps = [];
  for (let i = 1; i < validBars.length; i++) {
    const previous = validBars[i - 1], current = validBars[i];
    const change = current.close / previous.close - 1;
    if (Math.abs(change) > (options.abnormalReturnThreshold ?? 0.5)) warnings.push({ code: 'ABNORMAL_PRICE_GAP', date: current.date, previousDate: previous.date, rawReturn: change });
    const calendarDays = (Date.parse(current.date) - Date.parse(previous.date)) / DAY;
    if (calendarDays > (options.calendarGapThreshold ?? 7)) gaps.push({ from: previous.date, to: current.date, calendarDays, code: 'OBSERVATION_GAP_REVIEW' });
  }
  const observed = new Set(validBars.map(row => row.date));
  const missingDates = calendarBound(calendar, listing) && Array.isArray(calendar.expectedSessions)
    ? calendar.expectedSessions.map(day).filter(date => date && !observed.has(date)) : null;
  return { version: QUALITY_VERSION, rawBars, validBars, quarantine, warnings, gaps, missingDates,
    calendarSource: calendar.source ?? null, currency: expectedCurrency,
    counts: { raw: rawBars.length, valid: validBars.length, quarantined: quarantine.length },
    volumeVerified: validBars.length > 0 && validBars.every(row => number(row.volume) && row.volume > 0),
    status: !validBars.length ? 'INVALID' : quarantine.length || warnings.length || gaps.length || missingDates?.length ? 'REVIEW' : 'VALID' };
}

/** expectedLastCompletedSession is evidence, not a weekday approximation.
 * CURRENT is today's completed session; LAST_VALID_SESSION is the verified
 * prior completed session (including exchange holidays and pre-close checks).
 */
export function evaluateFreshness({ latestDate, now = new Date().toISOString(), calendar = {}, listing = {}, maxUnverifiedAgeDays = 7 } = {}) {
  const latest = day(latestDate), today = day(now instanceof Date ? now.toISOString() : now);
  const result = { latestDate: latest, evaluatedAt: now instanceof Date ? now.toISOString() : now,
    expectedLastCompletedSession: day(calendar.expectedLastCompletedSession),
    calendarSource: calendar.source ?? null, calendarVerified: calendarBound(calendar, listing),
    uncertainty: null, status: 'MISSING' };
  if (!latest) { result.status = latestDate ? 'INVALID' : 'MISSING'; return result; }
  if (!today || latest > today) { result.status = 'INVALID'; result.uncertainty = 'INVALID_OR_FUTURE_DATE'; return result; }
  const expected = result.expectedLastCompletedSession;
  if (!result.calendarVerified || !expected) {
    result.uncertainty = 'EXCHANGE_CALENDAR_UNVERIFIED';
    result.status = (Date.parse(today) - Date.parse(latest)) / DAY > maxUnverifiedAgeDays ? 'STALE' : 'DELAYED';
    return result;
  }
  if (expected > today || latest > expected) { result.status = 'INVALID'; result.uncertainty = 'UNCOMPLETED_SESSION_BAR_OR_INVALID_CALENDAR'; return result; }
  if (latest === expected) { result.status = latest === today ? 'CURRENT' : 'LAST_VALID_SESSION'; return result; }
  const sessions = (calendar.expectedSessions ?? []).map(day).filter(date => date && date > latest && date <= expected);
  result.missedVerifiedSessions = sessions.length || null;
  result.status = sessions.length === 1 ? 'DELAYED' : 'STALE';
  return result;
}

export function assessSnapshot(snapshot, { now = new Date().toISOString(), semanticsEvidence = null, listing = {}, maxAgeMinutes = 30 } = {}) {
  const observation = snapshot?.normalized ?? snapshot;
  const timestamp = observation?.timestamp ?? observation?.marketTimestamp ?? observation?.trade_last ?? observation?.date;
  const parsed = Date.parse(timestamp), nowMs = Date.parse(now);
  const price = observation?.price ?? observation?.close ?? observation?.last;
  if (!snapshot) return { status: 'EOD_ONLY', provenance: null };
  const provenance = { timestamp: timestamp ?? null, source: snapshot.source ?? 'marketstack', semanticsEvidence, raw: snapshot };
  if (!number(price) || price <= 0 || !Number.isFinite(parsed) || !Number.isFinite(nowMs) || parsed > nowMs) return { status: 'UNAVAILABLE', provenance };
  const observed = normalizeRow(snapshot, 0, {}), mic = listing.mic ?? listing.exchange, symbol = listing.providerTicker ?? listing.providerSymbol;
  const acceptedSymbols = new Set([symbol, ...(listing.verifiedAliases ?? [])]);
  const symbolMatched = Boolean(symbol && observed.reportedSymbols.length && observed.reportedSymbols.every(reported => acceptedSymbols.has(reported)));
  const micMatched = Boolean(mic && observed.reportedMics.length === 1 && observed.reportedMics[0] === mic && !US_MICS.has(mic));
  if (symbol && observed.reportedSymbols.length && !symbolMatched || mic && observed.reportedMics.length && !micMatched) return { status: 'UNAVAILABLE', reason: 'SNAPSHOT_IDENTITY_MISMATCH', provenance };
  if (observed.reportedCurrencies.length > 1 || listing.currency && observed.reportedCurrencies.some(currency => currency !== listing.currency)) return { status: 'UNAVAILABLE', reason: 'SNAPSHOT_CURRENCY_MISMATCH', provenance };
  const currencyMatched = Boolean(listing.currency && observed.reportedCurrencies.length === 1 && observed.reportedCurrencies[0] === listing.currency);
  if (typeof timestamp !== 'string' || !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp)) return { status: 'SNAPSHOT_DELAY_UNKNOWN', reason: 'TIMESTAMP_TIMEZONE_UNKNOWN', provenance };
  const ageMinutes = (nowMs - parsed) / 60000;
  if (ageMinutes > maxAgeMinutes) return { status: 'SNAPSHOT_DELAY_UNKNOWN', ageMinutes, provenance };
  const realtimeVerified = symbolMatched && micMatched && currencyMatched && semanticsEvidence?.verified === true && semanticsEvidence?.source && semanticsEvidence?.realtime === true
    && semanticsEvidence.mic === mic && semanticsEvidence.providerTicker === symbol;
  return { status: realtimeVerified ? 'REALTIME_OBSERVED' : !micMatched || !symbolMatched || !currencyMatched ? 'SNAPSHOT_DELAY_UNKNOWN' : 'SNAPSHOT_CURRENT', ageMinutes,
    currencyVerification: currencyMatched ? 'MATCHED' : 'UNKNOWN',
    delaySemantics: semanticsEvidence?.verified ? semanticsEvidence : 'UNKNOWN', provenance };
}

export function assessCorporateActions(actions = [], bars = [], evidence = {}, listing = {}) {
  const result = reconcileEuropeActions({ actions, bars: bars.map(bar => bar.raw ?? bar), evidence, listing });
  return { ...result, rawActions: actions, invalid: result.issues, crossChecks: result.correlations };
}

/** Explicit independent certification is required. Presence of adj_* fields,
 * a constant adjustment factor, or an empty actions response proves nothing.
 */
export function classifyAdjustment(bars = [], { evidence = {}, corporateActions = {}, canonicalSeries = null } = {}) {
  const invalid = [];
  const fields = ['adj_open', 'adj_high', 'adj_low', 'adj_close'];
  const observedFields = Object.fromEntries([...fields, 'adj_volume'].map(field => [field, 0]));
  let present = 0, partialRows = 0, completeRows = 0, numericStringFields = 0;
  // Parsing here validates recorded provider representations only. These
  // values never become canonical prices, adjustment factors or engine input.
  const observedNumber = value => number(value) ? value : typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
    && Number.isFinite(Number(value)) ? Number(value) : null;
  for (const bar of bars) {
    const raw = bar.providerRaw ?? bar.raw ?? bar;
    const supplied = fields.filter(key => raw[key] !== undefined && raw[key] !== null);
    for (const field of [...fields, 'adj_volume']) if (raw[field] !== undefined && raw[field] !== null) {
      observedFields[field]++;
      if (typeof raw[field] === 'string' && observedNumber(raw[field]) !== null) numericStringFields++;
    }
    if (supplied.length) {
      present++;
      if (supplied.length < fields.length) partialRows++; else completeRows++;
      const values = Object.fromEntries(supplied.map(field => [field, observedNumber(raw[field])]));
      const invalidFields = supplied.filter(field => values[field] === null || values[field] <= 0);
      if (invalidFields.length || supplied.length === fields.length && (values.adj_high < Math.max(values.adj_open, values.adj_close, values.adj_low)
        || values.adj_low > Math.min(values.adj_open, values.adj_close, values.adj_high))) invalid.push({ date: bar.date, reason: 'INVALID_ADJUSTED_OHLC', invalidFields });
    }
    if (raw.adj_volume !== undefined && raw.adj_volume !== null && (observedNumber(raw.adj_volume) === null || observedNumber(raw.adj_volume) < 0)) invalid.push({ date: bar.date, reason: 'INVALID_ADJUSTED_VOLUME' });
  }
  const matched = canonicalSeries && Canonical.validateSeries(canonicalSeries).valid && canonicalSeries.priceSeriesType === 'SPLIT_ADJUSTED'
    && Canonical.computeDataHash(canonicalSeries) === canonicalSeries.dataHash
    && bars.length > 0 && canonicalSeries.length === bars.length && evidence.canonicalSeriesHash === canonicalSeries.dataHash
    && canonicalSeries.timestamps.every((timestamp, i) => day(typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp) === bars[i].date);
  const certified = matched && evidence.verified === true && evidence.source && evidence.document && evidence.independent === true && evidence.basis === 'SPLIT_ADJUSTED' && evidence.seriesMatched === true && corporateActions.status === 'VERIFIED';
  return { status: invalid.length || evidence.invalid === true || corporateActions.status === 'INVALID' ? 'ADJUSTMENT_INVALID'
    : certified ? 'ADJUSTMENT_CERTIFIED' : partialRows || observedFields.adj_volume && !present || evidence.verified === true && evidence.source ? 'ADJUSTMENT_PARTIAL' : 'ADJUSTMENT_UNKNOWN',
    providerAdjustedRows: present, coverage: { completeOhlcRows: completeRows, partialOhlcRows: partialRows, observedFields, numericStringFields,
      missingSiblingsAreInvalid: false, providerBasisCertified: false }, invalid, evidence, useProviderAdjusted: false };
}

export function assessHistory(bars = [], { calendar = {}, listing = {}, maxHistoryComplete = false } = {}) {
  const first = bars[0]?.date ?? null, last = bars.at(-1)?.date ?? null;
  const spanDays = first && last ? (Date.parse(last) - Date.parse(first)) / DAY : 0;
  const horizons = {};
  for (const years of [1, 3, 5, 10]) horizons[`${years}Y`] = { status: spanDays >= 365.25 * years - 10 ? 'SPAN_AVAILABLE' : 'LIMITED', observationCount: bars.length,
    completeness: calendarBound(calendar, listing) && Array.isArray(calendar.expectedSessions) ? 'CALENDAR_CHECKABLE' : 'UNKNOWN' };
  horizons.max = { status: maxHistoryComplete ? 'PROVIDER_MAX_FETCHED' : 'UNKNOWN', observationCount: bars.length };
  return { first, last, spanDays, observations: bars.length, horizons };
}

/** Private research projection only. A clean trailing RAW segment can support
 * descriptive price calculations without certifying corporate-action basis.
 * Defaults, formulae and warm-up periods belong to the existing feature engine.
 */
export function projectEuropeRawResearch({ quality, listing = {}, calendar = {} } = {}) {
  const mic = listing.mic ?? listing.exchange;
  const blocked = reason => ({ status: 'RAW_RESEARCH_BLOCKED', technical: 'TECHNICAL_BLOCKED', scope: 'PRIVATE_RAW_RESEARCH',
    securityId: listing.securityId ?? null, listingId: listing.listingId ?? null, currency: quality?.currency ?? null,
    asOf: null, priceBasis: 'RAW_UNADJUSTED', engineProjection: false, reason,
    metrics: { sma20: null, sma50: null, sma200: null, high52w: null, momentum12M: null, momentum: null, volatility: null, drawdown: null, RS: null, relativeStrength: null, breakout: null },
    adjustmentCertified: false, rsStatus: 'RS_BLOCKED', quantReady: false, supertraderReady: false, backtestReady: false, publicationReady: false });
  if (!quality || !EUROPE_MICS.has(mic) || !calendarBound(calendar, listing) || !Array.isArray(calendar.expectedSessions)
    || !calendar.expectedSessions.length || !quality.currency || day(calendar.expectedLastCompletedSession) !== calendar.expectedLastCompletedSession)
    return blocked('EXACT_EUROPEAN_CALENDAR_AND_CURRENCY_REQUIRED');
  const sessions = calendar.expectedSessions, indices = new Map(sessions.map((date, index) => [date, index]));
  if (indices.size !== sessions.length || sessions.some((date, index) => index > 0 && date <= sessions[index - 1])) return blocked('INVALID_CALENDAR_SESSION_ORDER');
  if (quality.quarantine.some(bar => !bar.date)) return blocked('UNLOCATABLE_QUARANTINED_OBSERVATION');
  const boundaries = [...quality.quarantine.map(bar => bar.date),
    ...quality.warnings.filter(warning => ['ABNORMAL_PRICE_GAP', 'PROVIDER_SYMBOL_NOT_REPORTED', 'PROVIDER_MIC_NOT_REPORTED', 'CURRENCY_MISSING'].includes(warning.code)).map(warning => warning.date)];
  const cutoff = boundaries.sort().at(-1);
  let trailing = [];
  for (const bar of quality.validBars) {
    if (cutoff && bar.date <= cutoff) continue;
    const identityValid = bar.reportedMics?.length === 1 && bar.reportedMics[0] === mic && bar.reportedSymbols?.length > 0
      && bar.reportedSymbols.every(symbol => [listing.providerTicker ?? listing.providerSymbol, ...(listing.verifiedAliases ?? [])].includes(symbol))
      && bar.currency === quality.currency && indices.has(bar.date) && bar.date <= calendar.expectedLastCompletedSession;
    if (!identityValid) { trailing = []; continue; }
    if (trailing.length && indices.get(bar.date) !== indices.get(trailing.at(-1).date) + 1) trailing = [];
    trailing.push(bar);
  }
  if (trailing.length < 2) return blocked('INSUFFICIENT_CLEAN_CONTIGUOUS_TRAILING_HISTORY');
  const columns = { timestamps: trailing.map(bar => bar.date), open: trailing.map(bar => bar.open), high: trailing.map(bar => bar.high),
    low: trailing.map(bar => bar.low), close: trailing.map(bar => bar.close), volume: trailing.map(bar => bar.volume) };
  const series = Canonical.createSeries({ instrumentId: listing.securityId ?? listing.instrumentId ?? null, exchange: mic, currency: quality.currency,
    source: 'marketstack', priceSeriesType: 'RAW', timeframe: '1D', sessionType: 'REGULAR',
    meta: { scope: 'PRIVATE_RAW_RESEARCH', providerAdjustedUsed: false } }, columns);
  if (!Canonical.validateSeries(series).valid) return blocked('RAW_CANONICAL_STRUCTURE_INVALID');
  const features = Features.computeFeatures(series), last = features.last();
  return { status: 'RAW_RESEARCH_ONLY', technical: 'TECHNICAL_PARTIAL', scope: 'PRIVATE_RAW_RESEARCH',
    securityId: listing.securityId ?? null, listingId: listing.listingId ?? null, currency: quality.currency, asOf: trailing.at(-1).date,
    priceBasis: 'RAW_UNADJUSTED', engineProjection: true, priceSeriesType: 'RAW', seriesHash: series.dataHash,
    seriesIdentity: { instrumentId: series.instrumentId, mic, currency: series.currency, providerSymbol: listing.providerTicker ?? listing.providerSymbol ?? null },
    methodology: { featureVersion: features.featureVersion, parametersHash: features.parametersHash, parameters: structuredClone(features.params),
      source: 'quant/engines/technical/feature-store.js', parametersSource: 'UNCHANGED_ENGINE_DEFAULTS',
      momentumBasis: 'EXISTING_12M_LOG_RETURN', volatilityBasis: 'EXISTING_ANNUALIZED_REALIZED_VOL', drawdownBasis: 'EXISTING_RUNNING_CLOSE_HIGH',
      productMetricMapping: { momentum: 'momentum12M', relativeStrength: 'RS_BLOCKED' },
      seriesHashBasis: 'EXISTING_CANONICAL_PRODUCER_HASH_NOT_PROVIDER_AUTHENTICATION' },
    metrics: { sma20: last.sma20, sma50: last.sma50, sma200: last.sma200, high52w: last.high52w,
      momentum12M: last.momentum12M, momentum: last.momentum12M, volatility: last.realizedVol, drawdown: last.drawdown, RS: null, relativeStrength: null, breakout: null },
    quality: { observations: trailing.length, from: trailing[0].date, to: trailing.at(-1).date, contiguousVerifiedSessions: true,
      discardedValidPrefix: quality.validBars.length - trailing.length, quarantinedObservations: quality.quarantine.length, missingValuesRemainNull: true },
    provenance: { calendar: { mic, source: calendar.source, expectedLastCompletedSession: calendar.expectedLastCompletedSession, provenance: calendar.provenance ?? null },
      observations: trailing.map(bar => ({ date: bar.date, rawIndex: bar.rawIndex, source: bar.raw?.provenance ?? null })) },
    adjustmentCertified: false, rsStatus: 'RS_BLOCKED', quantReady: false, supertraderReady: false, backtestReady: false, publicationReady: false };
}

/** Readiness is private calculation readiness, never permission to publish.
 * The existing feature/RS engines retain all their original parameters.
 * Caller-supplied canonical series must be independently matched and certified.
 */
export function assessPriceReadiness({ quality, freshness, adjustment, corporateActions, listing = {}, calendar = {}, canonicalSeries = null, benchmark = null } = {}) {
  const bars = quality.validBars;
  const clean = quality.quarantine.length === 0 && quality.gaps.length === 0 && !quality.missingDates?.length
    && !quality.warnings.some(w => ['ABNORMAL_PRICE_GAP', 'PROVIDER_SYMBOL_NOT_REPORTED', 'PROVIDER_MIC_NOT_REPORTED', 'CURRENCY_MISSING'].includes(w.code));
  const current = ['CURRENT', 'LAST_VALID_SESSION'].includes(freshness.status);
  const chart = !bars.length ? 'CHART_BLOCKED' : bars.length >= 2 && clean ? 'CHART_READY' : 'CHART_LIMITED';
  let features = null, relativeStrength = null;
  const expectedExchange = listing.mic ?? listing.exchange;
  const seriesValid = canonicalSeries && Canonical.validateSeries(canonicalSeries).valid && canonicalSeries.length === bars.length
    && Canonical.computeDataHash(canonicalSeries) === canonicalSeries.dataHash
    && quality.currency && canonicalSeries.currency === quality.currency
    && (!expectedExchange || canonicalSeries.exchange === expectedExchange)
    && (!listing.instrumentId || canonicalSeries.instrumentId === listing.instrumentId)
    && adjustment.evidence.canonicalSeriesHash === canonicalSeries.dataHash
    && canonicalSeries.timestamps.every((timestamp, i) => day(typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp) === bars[i].date);
  const basisVerified = Boolean(seriesValid && canonicalSeries.priceSeriesType === 'SPLIT_ADJUSTED' && adjustment.status === 'ADJUSTMENT_CERTIFIED');
  const benchmarkVerified = Boolean(benchmark?.verified === true && benchmark?.independent === true && benchmark?.source && benchmark?.document && benchmark?.region === 'EUROPE'
    && EUROPE_MICS.has(benchmark.mic) && benchmark?.series && Canonical.validateSeries(benchmark.series).valid
    && benchmark.series.exchange === benchmark.mic && benchmark.series.currency === quality.currency
    && benchmark.adjustmentStatus === 'ADJUSTMENT_CERTIFIED' && benchmark.series.priceSeriesType === 'SPLIT_ADJUSTED'
    && Canonical.computeDataHash(benchmark.series) === benchmark.series.dataHash && benchmark.seriesHash === benchmark.series.dataHash);
  if (basisVerified && clean) {
    features = Features.computeFeatures(canonicalSeries);
    if (benchmarkVerified) relativeStrength = RS.analyzeRelativeStrength(canonicalSeries, benchmark.series);
  }
  const rsReady = relativeStrength?.vsBenchmark?.status === 'OK' && relativeStrength?.rsScore !== null;
  const calculationReady = Boolean(basisVerified && clean);
  const inputRequirements = { SMA20: 20, SMA50: 50, SMA200: 200, '52W_HIGH': 252, MOMENTUM: 253, VOLATILITY: 21, DRAWDOWN: 252, BREAKOUT: 252 };
  const indicators = Object.fromEntries(Object.entries(inputRequirements).map(([name, count]) => [name,
    { status: calculationReady && bars.length >= count ? 'INPUT_READY' : bars.length >= count ? 'BASIS_BLOCKED' : 'HISTORY_BLOCKED', minimumObservations: count }]));
  indicators.RS = { status: rsReady ? 'RS_READY' : 'RS_BLOCKED', reason: benchmarkVerified ? 'COMMON_HISTORY_OR_BASIS_REQUIRED' : 'VERIFIED_EUROPEAN_BENCHMARK_REQUIRED' };
  const technical = !bars.length || adjustment.status === 'ADJUSTMENT_INVALID' ? 'TECHNICAL_BLOCKED'
    : calculationReady && bars.length >= 253 && rsReady && current ? 'TECHNICAL_READY' : 'TECHNICAL_PARTIAL';
  const strict = technical === 'TECHNICAL_READY' && quality.volumeVerified && corporateActions.status === 'VERIFIED' && freshness.calendarVerified && quality.missingDates !== null;
  return { chart, technical, indicators, relativeStrength, basisVerified, benchmarkVerified,
    researchTechnical: projectEuropeRawResearch({ quality, listing, calendar }),
    supertrader: strict ? 'SUPERTRADER_INPUT_READY' : 'SUPERTRADER_BLOCKED',
    backtest: strict ? 'BACKTEST_INPUT_READY' : bars.length > 1 && clean ? 'RESEARCH_ONLY' : 'BLOCKED',
    productionReady: false, publication: 'RIGHTS_AND_PRODUCT_GATES_REQUIRED',
    engineEvidence: features ? { featureVersion: features.featureVersion ?? Features.FEATURE_VERSION, parametersHash: features.parametersHash,
      latest: Object.fromEntries(Object.entries(features.columns).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, valueOrNull(value.at(-1))])) } : null,
    listing };
}

export function evaluateEuropePriceSeries({ bars = [], listing = {}, now = new Date().toISOString(), calendar = {}, requestRange = {}, corporateActions = [], corporateActionEvidence = {}, adjustmentEvidence = {}, canonicalSeries = null, benchmark = null, snapshot = null, snapshotSemantics = null, maxHistoryComplete = false } = {}) {
  const quality = validateEodBars(bars, { listing, calendar, now, requestRange });
  const freshness = evaluateFreshness({ latestDate: quality.validBars.at(-1)?.date, now, calendar, listing });
  const actions = assessCorporateActions(corporateActions, quality.validBars, corporateActionEvidence, listing);
  const adjustment = classifyAdjustment(quality.validBars, { evidence: adjustmentEvidence, corporateActions: actions, canonicalSeries });
  return { version: QUALITY_VERSION, quality, freshness, adjustment, corporateActions: actions,
    history: assessHistory(quality.validBars, { calendar, listing, maxHistoryComplete }),
    snapshot: assessSnapshot(snapshot, { now, listing, semanticsEvidence: snapshotSemantics }),
    readiness: assessPriceReadiness({ quality, freshness, adjustment, corporateActions: actions, listing, calendar, canonicalSeries, benchmark }) };
}
