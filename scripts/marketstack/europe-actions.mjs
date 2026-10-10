/** Corporate-action foundation. Provider observations alone are not proof of
 * absence, complete event history, or adjustment semantics. No paid IO. */
import { createRequire } from 'node:module';
import { validateEodBars } from './europe-quality.mjs';
const require = createRequire(import.meta.url);
const Returns = require('../../quant/engines/return-series.js');
const Published = require('../../quant/engines/published-close.js');
const Canonical = require('../../quant/engines/technical/canonical-bars.js');
export const ACTIONS_VERSION = 'marketstack-europe-actions-1';
const numeric = value => typeof value === 'number' && Number.isFinite(value);
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const result = value.slice(0, 10), parsed = Date.parse(`${result}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === result ? result : null;
}
function micsOf(row, normalized) {
  return [...new Set([row.exchange, row.stock_exchange?.mic, row.stock_exchange?.exchange_mic, normalized.providerExchange]
    .filter(value => typeof value === 'string' && /^[A-Z0-9]{4}$/.test(value)))];
}

/** eventKind comes from the requested endpoint, never inferred from a label
 * alone. Unknown fields, event envelopes and provider venue labels are retained.
 */
export function normalizeEuropeActions(observations = [], { listing = {}, eventKind = null } = {}) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const aliases = new Set([listing.providerTicker, ...(listing.verifiedAliases ?? [])].filter(Boolean));
  const events = observations.map((observation, index) => {
    const raw = observation?.raw ?? observation ?? {}, normalized = observation?.normalized ?? raw;
    let type = String(raw.type ?? raw.event_type ?? eventKind ?? '').toUpperCase().replaceAll(' ', '_');
    const ratio = normalized.splitFactor ?? raw.split_factor ?? raw.ratio ?? null;
    const amount = normalized.dividend ?? raw.dividend ?? raw.amount ?? null;
    if (!type && ratio !== null) type = 'SPLIT';
    if (!type && amount !== null) type = 'DIVIDEND';
    if (type === 'SPLIT' && numeric(ratio) && ratio < 1) type = 'REVERSE_SPLIT';
    const eventDate = date(raw.ex_date ?? raw.exDate ?? raw.date ?? normalized.tradingDate ?? normalized.marketTimestamp);
    const symbol = normalized.providerTicker ?? raw.symbol ?? raw.ticker ?? null;
    const mics = micsOf(raw, normalized);
    const mic = mics.length === 1 ? mics[0] : null;
    const reasons = [];
    if (!eventDate) reasons.push('INVALID_EVENT_DATE');
    if (!['SPLIT', 'REVERSE_SPLIT', 'DIVIDEND', 'SPECIAL_DIVIDEND', 'SYMBOL_CHANGE'].includes(type)) reasons.push('UNKNOWN_EVENT_TYPE');
    if (['SPLIT', 'REVERSE_SPLIT'].includes(type) && (!numeric(ratio) || ratio <= 0 || ratio === 1)) reasons.push('INVALID_SPLIT_FACTOR');
    if (['DIVIDEND', 'SPECIAL_DIVIDEND'].includes(type) && (!numeric(amount) || amount < 0)) reasons.push('INVALID_DIVIDEND_AMOUNT');
    const oldSymbol = raw.old_symbol ?? raw.oldSymbol ?? null, newSymbol = raw.new_symbol ?? raw.newSymbol ?? null;
    if (type === 'SYMBOL_CHANGE' && (!oldSymbol || !newSymbol || oldSymbol === newSymbol)) reasons.push('INVALID_SYMBOL_CHANGE');
    if (!symbol) reasons.push('EVENT_SYMBOL_NOT_REPORTED');
    else if (!aliases.has(symbol)) reasons.push('EVENT_SYMBOL_MISMATCH');
    if (!mics.length) reasons.push('EVENT_VENUE_NOT_REPORTED');
    else if (mics.length > 1 || !listing.mic || mic !== listing.mic) reasons.push('EVENT_VENUE_MISMATCH');
    const invalid = reasons.some(reason => reason.startsWith('INVALID_') || reason.endsWith('_MISMATCH'));
    return { index, type, date: eventDate, symbol, mic, ratio: ['SPLIT', 'REVERSE_SPLIT'].includes(type) ? ratio : null,
      amount: ['DIVIDEND', 'SPECIAL_DIVIDEND'].includes(type) ? amount : null,
      currency: normalized.currency ?? raw.currency ?? raw.price_currency ?? null,
      oldSymbol, newSymbol, status: invalid ? 'INVALID' : reasons.length ? 'UNKNOWN' : 'PROVIDER_MATCHED',
      reasons, raw: observation, providerRaw: raw };
  });
  const seen = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.type, event.date, event.symbol, event.mic, event.ratio, event.amount, event.oldSymbol, event.newSymbol]);
    if (seen.has(key)) {
      if (event.status !== 'INVALID') event.status = 'UNKNOWN';
      event.reasons.push('DUPLICATE_EVENT');
      const previous = seen.get(key);
      if (previous.status !== 'INVALID') previous.status = 'UNKNOWN';
      if (!previous.reasons.includes('DUPLICATE_EVENT')) previous.reasons.push('DUPLICATE_EVENT');
    } else seen.set(key, event);
  }
  return { version: ACTIONS_VERSION, events, rawObservations: observations,
    status: events.some(event => event.status === 'INVALID') ? 'INVALID' : events.length && events.every(event => event.status === 'PROVIDER_MATCHED') ? 'PROVIDER_MATCHED' : 'UNKNOWN',
    absenceEstablished: false };
}

/** Documented independent evidence must cover the exact symbol/MIC and entire
 * historical interval. Reported no-event rows are not absence certification.
 */
export function reconcileEuropeActions({ actions = [], bars = [], listing = {}, evidence = {} } = {}) {
  const normalized = Array.isArray(actions) ? normalizeEuropeActions(actions, { listing }) : actions;
  const quality = validateEodBars(bars, { listing });
  const rows = quality.validBars, first = rows[0]?.date, last = rows.at(-1)?.date;
  const issues = [], correlations = [];
  for (const event of normalized.events) {
    if (event.status !== 'PROVIDER_MATCHED') { issues.push({ index: event.index, date: event.date, code: 'ACTION_NOT_IDENTITY_VERIFIED', reasons: event.reasons }); continue; }
    if (event.currency && listing.currency && event.currency !== listing.currency && ['DIVIDEND', 'SPECIAL_DIVIDEND'].includes(event.type)) issues.push({ date: event.date, code: 'DIVIDEND_CURRENCY_MISMATCH' });
    if (!first || event.date < first || event.date > last) { correlations.push({ date: event.date, type: event.type, status: 'OUTSIDE_HISTORY' }); continue; }
    const rowIndex = rows.findIndex(row => row.date === event.date);
    if (rowIndex < 0) { issues.push({ date: event.date, code: 'ACTION_SESSION_MISSING' }); continue; }
    const bar = rows[rowIndex], prior = rows[rowIndex - 1];
    const raw = bar.providerRaw ?? bar.raw;
    if (['SPLIT', 'REVERSE_SPLIT'].includes(event.type)) {
      const inlineFactor = bar.raw?.normalized?.splitFactor ?? raw.split_factor ?? raw.splitFactor;
      const rawJumpRatio = prior ? prior.close / bar.close : null;
      const residualRatio = prior ? rawJumpRatio / event.ratio : null;
      const status = !prior ? 'BOUNDARY_NOT_OBSERVABLE' : Math.abs(Math.log(residualRatio)) <= Math.log(1.5) ? 'CONSISTENT' : 'REVIEW';
      correlations.push({ date: event.date, type: event.type, ratio: event.ratio, inlineFactor: inlineFactor ?? null, rawJumpRatio, residualRatio, status });
      if (inlineFactor !== undefined && inlineFactor !== null && inlineFactor !== event.ratio) issues.push({ date: event.date, code: 'SPLIT_FACTOR_CONFLICT' });
      if (status === 'REVIEW') issues.push({ date: event.date, code: 'RAW_SPLIT_JUMP_INCONSISTENT' });
    } else if (['DIVIDEND', 'SPECIAL_DIVIDEND'].includes(event.type)) {
      const inlineDividend = bar.raw?.normalized?.dividend ?? raw.dividend;
      if (inlineDividend !== undefined && inlineDividend !== null && inlineDividend !== event.amount) issues.push({ date: event.date, code: 'DIVIDEND_AMOUNT_CONFLICT' });
      correlations.push({ date: event.date, type: event.type, amount: event.amount, rawChange: prior ? bar.close / prior.close - 1 : null,
        status: 'OBSERVED_NOT_CAUSALLY_ATTRIBUTED' });
    } else correlations.push({ date: event.date, type: event.type, oldSymbol: event.oldSymbol, newSymbol: event.newSymbol, status: 'CONTINUITY_EVIDENCE_REQUIRED' });
  }
  const splitDates = new Map();
  for (const event of normalized.events.filter(event => ['SPLIT', 'REVERSE_SPLIT'].includes(event.type))) splitDates.set(event.date, (splitDates.get(event.date) ?? 0) + 1);
  for (const [eventDate, count] of splitDates) if (count > 1) issues.push({ date: eventDate, code: 'MULTIPLE_SPLITS_SAME_DATE' });
  for (const bar of rows) {
    const raw = bar.providerRaw ?? bar.raw, factor = bar.raw?.normalized?.splitFactor ?? raw.split_factor ?? raw.splitFactor;
    if (factor !== undefined && factor !== null && (!numeric(factor) || factor <= 0)) issues.push({ date: bar.date, code: 'INVALID_INLINE_SPLIT_FACTOR' });
    else if (numeric(factor) && factor !== 1 && !normalized.events.some(event => event.date === bar.date && ['SPLIT', 'REVERSE_SPLIT'].includes(event.type) && event.ratio === factor)) issues.push({ date: bar.date, code: 'INLINE_SPLIT_WITHOUT_MATCHED_EVENT' });
    const dividend = bar.raw?.normalized?.dividend ?? raw.dividend;
    if (dividend !== undefined && dividend !== null && (!numeric(dividend) || dividend < 0)) issues.push({ date: bar.date, code: 'INVALID_INLINE_DIVIDEND' });
    else if (numeric(dividend) && dividend > 0 && !normalized.events.some(event => event.date === bar.date && ['DIVIDEND', 'SPECIAL_DIVIDEND'].includes(event.type) && event.amount === dividend)) issues.push({ date: bar.date, code: 'INLINE_DIVIDEND_WITHOUT_MATCHED_EVENT' });
  }
  const documentation = Boolean(evidence.verified === true && evidence.independent === true && evidence.complete === true && evidence.source && evidence.document
    && evidence.providerTicker === listing.providerTicker && evidence.mic === listing.mic && evidence.ratioConvention === 'NEW_SHARES_PER_OLD_SHARE'
    && date(evidence.from) && date(evidence.to) && first && date(evidence.from) <= first && date(evidence.to) >= last);
  const unknownContinuity = normalized.events.some(event => event.type === 'SYMBOL_CHANGE') && !(evidence.symbolContinuityVerified === true && evidence.symbolContinuitySource);
  if (unknownContinuity) issues.push({ code: 'SYMBOL_CONTINUITY_UNVERIFIED' });
  const validated = quality.quarantine.length === 0 && rows.length > 0
    && !quality.warnings.some(warning => ['PROVIDER_SYMBOL_NOT_REPORTED', 'PROVIDER_MIC_NOT_REPORTED', 'CURRENCY_MISSING'].includes(warning.code))
    && normalized.events.every(event => event.status === 'PROVIDER_MATCHED') && issues.length === 0;
  return { version: ACTIONS_VERSION, normalized, quality, correlations, issues, evidence,
    status: normalized.status === 'INVALID' || quality.quarantine.length ? 'INVALID' : documentation && validated ? 'VERIFIED' : 'UNKNOWN',
    absenceEstablished: documentation && validated && normalized.events.length === 0,
    adjustmentStatus: documentation && validated ? 'INDEPENDENT_BASIS_DOCUMENTED' : 'ADJUSTMENT_UNKNOWN',
    providerAdjustedCertified: false };
}

/** Applies existing split geometry only after independent evidence gates. This
 * is a private canonical candidate, never a production write or publication.
 */
export function buildVerifiedEuropeCanonicalSeries(options = {}) {
  const result = reconcileEuropeActions(options), listing = options.listing ?? {};
  const blocked = reason => ({ ...result, canonicalSeries: null, adjustmentEvidence: null, priceBasis: 'RAW', chart: result.quality.validBars.length ? 'CHART_LIMITED' : 'CHART_BLOCKED',
    backtest: 'BLOCKED', reason, productionReady: false });
  if (result.status !== 'VERIFIED') return blocked('CORPORATE_ACTION_BASIS_UNVERIFIED');
  if (!listing.instrumentId || !listing.currency || !listing.mic) return blocked('CANONICAL_IDENTITY_INCOMPLETE');
  const rows = result.quality.validBars.map(bar => ({ ...bar, splitFactor: result.normalized.events.find(event => ['SPLIT', 'REVERSE_SPLIT'].includes(event.type) && event.date === bar.date)?.ratio ?? 1 }));
  const factors = Returns.splitFactors(rows);
  const close = Returns.splitAdjustedColumn(rows, 'close');
  const open = Returns.splitAdjustedColumn(rows, 'open');
  const high = Returns.splitAdjustedColumn(rows, 'high');
  const low = Returns.splitAdjustedColumn(rows, 'low');
  if (factors.some(factor => !numeric(factor) || factor <= 0)) return blocked('INVALID_CUMULATIVE_SPLIT_FACTOR');
  const canonicalSeries = Canonical.createSeries({ instrumentId: listing.instrumentId, exchange: listing.mic, currency: listing.currency,
    priceSeriesType: 'SPLIT_ADJUSTED', source: 'marketstack', timeframe: '1D', meta: { actionsEvidence: options.evidence, privateCandidate: true } },
  { timestamps: rows.map(row => row.date), open, high, low, close,
    volume: rows.map((row, i) => numeric(row.volume) ? row.volume * factors[i] : null),
    adjustmentFactor: factors.map(factor => 1 / factor),
    corporateActionFlags: rows.map(row => result.normalized.events.filter(event => event.date === row.date).map(event => event.type)) });
  if (!Canonical.validateSeries(canonicalSeries).valid) return blocked('CANONICAL_SERIES_INVALID');
  return { ...result, canonicalSeries, priceBasis: 'SPLIT_ADJUSTED',
    adjustmentEvidence: { verified: true, independent: true, source: options.evidence.source, document: options.evidence.document,
      basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: canonicalSeries.dataHash },
    candidateLatestClose: { date: rows.at(-1).date, close: Published.roundClose(close.at(-1)), currency: listing.currency,
      source: 'marketstack', basis: 'SPLIT_ADJUSTED', publicDisplay: false },
    engines: { returnSeries: Returns.ENGINE_VERSION, canonical: Canonical.MODEL_VERSION },
    chart: 'CHART_INPUT_READY', backtest: 'ADDITIONAL_BENCHMARK_HISTORY_VOLUME_GATES_REQUIRED', productionReady: false };
}
