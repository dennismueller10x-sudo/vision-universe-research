/** Isolated research prototype. No product imports this module and no result is
 * an admission decision. Inputs must describe their price, volume and action basis. */
const finite = n => typeof n === 'number' && Number.isFinite(n);
const day = x => String(x || '').slice(0, 10);
const validDay = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const ohlc = ['open', 'high', 'low', 'close'];
const provenance = x => x && typeof x === 'object' && typeof x.sha256 === 'string' && /^[a-f0-9]{64}$/.test(x.sha256) && typeof x.reference === 'string' && x.reference.length > 0;

/** Number of new shares for one old share, applied only before effective date. */
export function splitAdjustmentFactors(bars, actions, anchor) {
  return bars.map(bar => actions.filter(a => a.type === 'SPLIT' && day(bar.date) < a.date && a.date <= anchor)
    .reduce((factor, action) => factor / action.factor, 1));
}

/** True close-to-close cash reinvestment index, normalized to the final close.
 * This is deliberately distinct from the common (previousClose-dividend)/
 * previousClose vendor back-adjustment convention. */
export function totalReturnReinvestmentFactors(splitBars, cashByDate) {
  const factors = Array(splitBars.length).fill(1);
  for (let i = splitBars.length - 1; i > 0; i--) {
    const dividend = cashByDate.get(day(splitBars[i].date)) || 0;
    factors[i - 1] = factors[i] * splitBars[i].close / (splitBars[i].close + dividend);
  }
  return factors;
}

export function canonicalAdjustmentPrototype(input) {
  const issues = [], add = (code, detail = null) => issues.push({ code, detail });
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const identity = record(input?.identity) ? input.identity : {}, coverage = record(input?.coverage) ? input.coverage : {},
    fieldBasis = record(input?.fieldBasis) ? input.fieldBasis : {}, mode = input?.mode ?? 'SPLIT_ADJUSTED';
  const bars = Array.isArray(input?.bars) ? input.bars.map(b => {
    if (!record(b)) { add('INVALID_BAR_RECORD'); return {date:''}; }
    return { ...b, date: day(b.date) };
  }).sort((a,b) => a.date.localeCompare(b.date)) : [];
  const actions = Array.isArray(input?.actions) ? input.actions : [];
  if (!['SPLIT_ADJUSTED', 'TOTAL_RETURN'].includes(mode)) add('UNSUPPORTED_MODE');
  if (!identity.listingId || !identity.symbol || !identity.mic || !/^[A-Z]{3}$/.test(identity.currency || '') || identity.verified !== true || !provenance(identity.source)) add('UNVERIFIED_IDENTITY_OR_QUOTE_UNIT');
  if (!bars.length) add('EMPTY_HISTORY');
  const anchor = day(coverage.to);
  if (!validDay(coverage.from) || !validDay(anchor) || coverage.from > anchor || coverage.calendarVerified !== true || !provenance(coverage.calendarSource)) add('UNVERIFIED_COVERAGE_OR_CALENDAR');
  if (fieldBasis.price !== 'AS_TRADED' || fieldBasis.priceVerified !== true || !provenance(fieldBasis.priceSource)) add('UNVERIFIED_AS_TRADED_PRICE_BASIS');
  if (!['AS_TRADED', 'SPLIT_ADJUSTED_TO_ANCHOR'].includes(fieldBasis.volume) || fieldBasis.volumeVerified !== true || !provenance(fieldBasis.volumeSource)) add('UNVERIFIED_VOLUME_BASIS');
  if (fieldBasis.volume === 'SPLIT_ADJUSTED_TO_ANCHOR' && fieldBasis.volumeAnchor !== anchor) add('VOLUME_ANCHOR_MISMATCH');
  if (coverage.splitsComplete !== true || coverage.actionsCompleteThrough !== anchor || !provenance(coverage.actionSource)) add('INCOMPLETE_SPLIT_ACTION_COVERAGE');
  if (mode === 'TOTAL_RETURN' && coverage.dividendsComplete !== true) add('INCOMPLETE_DIVIDEND_COVERAGE');
  const dates = new Set();
  for (const b of bars) {
    if (!validDay(b.date) || b.date < coverage.from || b.date > anchor) add('OUT_OF_SCOPE_BAR', b.date);
    if (dates.has(b.date)) add('DUPLICATE_BAR', b.date); dates.add(b.date);
    if (b.symbol !== identity.symbol || b.exchange !== identity.mic || b.currency !== identity.currency) add('BAR_IDENTITY_OR_CURRENCY_MISMATCH', b.date);
    if (!ohlc.every(k => finite(b[k]) && b[k] > 0) || b.high < Math.max(b.open,b.low,b.close) || b.low > Math.min(b.open,b.high,b.close)) add('INVALID_OHLC', b.date);
    if (!finite(b.volume) || b.volume < 0) add('INVALID_VOLUME', b.date);
  }
  if (bars.length && (bars[0].date !== coverage.from || bars.at(-1).date !== anchor)) add('COVERAGE_ENDPOINT_MISMATCH');
  const requiredSessions = coverage.expectedSessions;
  if (!Array.isArray(requiredSessions) || !requiredSessions.length || requiredSessions.some(d => !validDay(d)) || new Set(requiredSessions).size !== requiredSessions.length || requiredSessions.some(d => !dates.has(d)) || dates.size !== requiredSessions.length) add('UNVERIFIED_OR_MISSING_SESSIONS');
  const actionKeys = new Set();
  for (const a of actions) {
    if (!record(a)) { add('INVALID_ACTION_RECORD'); continue; }
    if (!['SPLIT', 'CASH_DIVIDEND'].includes(a.type)) add('UNSUPPORTED_CORPORATE_ACTION', a.type);
    if (!validDay(a.date) || a.date <= coverage.from || a.date > anchor || !dates.has(a.date)) add('ACTION_DATE_OUTSIDE_COMPLETE_WINDOW', a.date);
    if (a.symbol !== identity.symbol || a.mic !== identity.mic || a.currency !== identity.currency || a.verified !== true || !provenance(a.source)) add('UNVERIFIED_ACTION_IDENTITY', a.date);
    if (a.type === 'SPLIT' && (!finite(a.factor) || a.factor <= 0 || a.factor === 1)) add('INVALID_SPLIT_FACTOR', a.date);
    if (a.type === 'CASH_DIVIDEND' && (!finite(a.amount) || a.amount < 0 || a.shareBasis !== 'POST_EVENT_SHARES')) add('INVALID_DIVIDEND_OR_SHARE_BASIS', a.date);
    const key = `${a.date}:${a.type}`; if (actionKeys.has(key)) add('DUPLICATE_OR_COMPOUND_ACTION_REQUIRES_REVIEW', key); actionKeys.add(key);
  }
  const semantics = { mode, anchor, price: mode === 'TOTAL_RETURN' ? 'CLOSE_TO_CLOSE_CASH_REINVESTMENT_INDEX_OHLC_SCALED_BY_DAILY_INDEX_FACTOR' : 'SPLIT_ADJUSTED_PRICE_RETURN',
    volume: 'SPLIT_ADJUSTED_SHARE_VOLUME_TO_ANCHOR_NO_DIVIDEND_ADJUSTMENT', currency: identity.currency || null,
    dividends: mode === 'TOTAL_RETURN' ? 'CASH_REINVESTED_AT_EX_DATE_CLOSE_BEFORE_FEES_AND_TAX' : 'NOT_REINVESTED',
    historicalActionUse: 'EX_POST_ADJUSTED_HISTORY_NOT_POINT_IN_TIME_ACTION_KNOWLEDGE', ohlcExecution: 'ADJUSTED_OHLC_ARE_INDICATOR_INPUTS_NOT_AS_TRADED_EXECUTION_PRICES' };
  const base = { status: issues.length ? 'BLOCKED' : 'READY_WITH_VU_ADJUSTMENT', issues, semantics, productionAdmission: false, researchOnly: true };
  if (issues.length) return { ...base, bars: [] };
  const splitFactors = splitAdjustmentFactors(bars, actions, anchor);
  const splitBars = bars.map((b,i) => ({ ...b, ...Object.fromEntries(ohlc.map(k => [k,b[k]*splitFactors[i]])),
    volume: fieldBasis.volume === 'AS_TRADED' ? b.volume / splitFactors[i] : b.volume }));
  const cashByDate = new Map();
  for (const a of actions.filter(a => a.type === 'CASH_DIVIDEND')) {
    const i = bars.findIndex(b => b.date === a.date);
    cashByDate.set(a.date, a.amount * splitFactors[i]);
  }
  const cashFactors = mode === 'TOTAL_RETURN' ? totalReturnReinvestmentFactors(splitBars, cashByDate) : bars.map(() => 1);
  const adjusted = splitBars.map((b,i) => ({ ...b, ...Object.fromEntries(ohlc.map(k => [k,b[k]*cashFactors[i]])),
    splitAdjustmentFactor: splitFactors[i], cashReinvestmentFactor: cashFactors[i],
    raw: Object.fromEntries([...ohlc,'volume'].map(k => [k,bars[i][k]])) }));
  if (adjusted.some(b => !ohlc.every(k => finite(b[k]) && b[k] > 0) || !finite(b.volume))) return { ...base, status:'BLOCKED', issues:[{code:'ADJUSTMENT_NUMERIC_OVERFLOW'}],bars:[] };
  return { ...base, bars: adjusted, actionProvenance: actions.map(a => ({ type:a.type,date:a.date,source:a.source })) };
}
