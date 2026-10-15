/**
 * V4 oracle-matched stock constructions on the canonical VU dataset (monthly close-to-close total return).
 *
 * Each construction mirrors the published definition of its French Data Library oracle as far as VU data allow.
 * Every deliberate difference is listed in CONSTRUCTION_CONTRACT_V4.deviations and reported, never hidden:
 * the comparison class is MATCHED_UNIVERSE_APPROXIMATION, not EXACT_REFERENCE_REPLICATION.
 *
 * Holding month m: formation at F = last session of month m-1, end E = last session of month m.
 * Security return = TR(last valid bar <= min(E, terminal date)) / TR(F) * terminal factor - 1, where the
 * terminal factor and the stale/unavailable rules come from measurement-policy-v4.mjs. A security that
 * is eligible at F therefore always has a return (as CRSP includes delisting returns); categories are counted.
 */
import { MEASUREMENT_POLICY_V4, terminalFactorV4, isDataEvent } from '../measurement/measurement-policy-v4.mjs';
import { exchangeOf } from '../measurement/price-sanity-v4.mjs';

export const CONSTRUCTION_CONTRACT_V4 = Object.freeze({
  schema: 'supertrader-v4-oracle-constructions-1.0.0',
  registeredBeforeV4Measurement: true,
  window: { fromMonth: '2018-01', toMonth: '2026-08', reason: 'FROZEN_V3_REFERENCE_OVERLAP_WINDOW; FRENCH_FILES_END_2026_08' },
  universe: {
    instrumentType: 'EQUITY_COMMON',
    exchanges: ['NYSE', 'NASDAQ', 'NYSE MKT', 'NYSE AMERICAN', 'AMEX'],
    breakpointExchange: 'NYSE',
    minimumBreakpointNames: 100,
    priceFloor: null,
    reason: 'FRENCH/CRSP SHARE CODES 10-11 ON NYSE/AMEX/NASDAQ WITH NYSE BREAKPOINTS; NO PRICE FLOOR IN THE ORACLE',
  },
  constructions: {
    EW_MARKET: { oracle: 'FRENCH_ME_EW_FIRM_COUNT_WEIGHTED', eligibility: 'BAR_AT_FORMATION_AND_AT_LAST_JUNE_MONTH_END (French size portfolios are formed each June)' },
    MOM_12_2_EW_DECILES: { oracle: 'FRENCH_10_PORTFOLIOS_PRIOR_12_2_EW', signal: 'TR(end of month m-2) / TR(end of month m-13) - 1', buckets: 10 },
    VAR_60D_EW_QUINTILES: { oracle: 'FRENCH_PORTFOLIOS_FORMED_ON_VAR_EW', signal: 'variance of daily total returns over the 60 sessions ending at F, at least 20 returns', buckets: 5 },
  },
  percentileMethod: 'LINEAR_INTERPOLATION_TYPE7',
  bucketRule: 'FIRST_BUCKET_K_WITH_VALUE_LE_BREAKPOINT_K; TOP_BUCKET_OTHERWISE',
  returnBasis: 'MONTHLY_CLOSE_TO_CLOSE_TOTAL_RETURN_INDEX; NO_COSTS',
  terminalPolicy: MEASUREMENT_POLICY_V4.id,
  deviations: [
    'UNIVERSE: Tiingo observed listings (active and delisted store), not the CRSP population; listing generations dropped by the canonical core are absent',
    'EXCHANGE: current/listing exchange from the listing id, not CRSP historical exchange codes',
    'SHARE_CLASS: VU instrument class EQUITY_COMMON approximates CRSP share codes 10/11',
    'DELISTING: unknown proceeds use the frozen protocol scenario (-30 %) instead of CRSP delisting returns',
    'MARKET_EQUITY: no PIT shares, so the EW market eligibility uses a bar at the June month-end instead of positive June ME',
  ],
});

const US = new Set(CONSTRUCTION_CONTRACT_V4.universe.exchanges);
const monthOf = (d) => d.slice(0, 7);
function prevMonth(m, k = 1) { const n = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 - k, y = Math.floor(n / 12); return `${y}-${String(n - y * 12 + 1).padStart(2, '0')}`; }
function indexAtOrBefore(bars, date) { let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) lo = m + 1; else hi = m; } return lo - 1; }
function indexAt(bars, date) { const i = indexAtOrBefore(bars, date); return i >= 0 && bars[i].date === date ? i : -1; }
const validTR = (b) => b && Number.isFinite(b.totalReturnIndex) && b.totalReturnIndex > 0;

export function sessionCalendar(data) {
  const cal = (data.benchmark?.bars || data.spyBars || []).map((b) => b.date);
  if (!cal.length || cal.some((d, i) => i && cal[i - 1] >= d)) throw new Error('SESSION_CALENDAR_REQUIRED');
  return cal;
}
export function monthEnds(calendar) { const m = new Map(); for (const d of calendar) m.set(monthOf(d), d); return m; }
export function holdingMonths(contract = CONSTRUCTION_CONTRACT_V4) {
  const out = []; let m = contract.window.fromMonth;
  while (m <= contract.window.toMonth) { out.push(m); m = prevMonth(m, -1); }
  return out;
}

export function oracleUniverseMember(s, contract = CONSTRUCTION_CONTRACT_V4) {
  const ex = exchangeOf(s);
  return s.listing?.instrumentType === contract.universe.instrumentType && Boolean(ex) && US.has(ex);
}

/** Month-end bar of a calendar month: the last bar of that month on or before its last session (none if the month has no bar). */
function monthEndBar(s, month, ends) {
  const end = ends.get(month); if (!end) return null;
  const i = indexAtOrBefore(s.bars, end);
  return i >= 0 && monthOf(s.bars[i].date) === month && validTR(s.bars[i]) ? s.bars[i] : null;
}

/**
 * Return of one security over (F, E] with the V4 terminal/stale policy. Requires a valid bar exactly at F.
 * category: FRESH | STALE_WITHIN_LIMIT | UNAVAILABLE_BEYOND_LIMIT | TERMINAL_<KIND>
 */
export function holdingReturn(s, F, E, calendarIndex, { scenario = 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT', dataEventScenario, policy = MEASUREMENT_POLICY_V4 } = {}) {
  const fi = indexAt(s.bars, F); if (fi < 0 || !validTR(s.bars[fi])) return null;
  const start = s.bars[fi], term = s.terminal && s.terminal.date > F && s.terminal.date <= E ? s.terminal : null;
  const li = indexAtOrBefore(s.bars, term ? term.date : E), last = s.bars[li];
  if (!validTR(last)) return null;
  let category, factor = 1;
  if (term) {
    const distress = last.rawClose < 1 || (li >= 60 && last.close / s.bars[li - 60].close - 1 <= -0.5);
    factor = terminalFactorV4(term, scenario, { distress, ...(dataEventScenario ? { dataEventScenario } : {}) });
    category = 'TERMINAL_' + term.kind;
  } else {
    const gap = calendarIndex.get(E) - calendarIndex.get(last.date);
    if (gap === 0) category = 'FRESH';
    else if (gap <= policy.staleCarryMaxSessions) category = 'STALE_WITHIN_LIMIT';
    else { category = 'UNAVAILABLE_BEYOND_LIMIT'; factor = terminalFactorV4({ kind: 'SECURITY_UNAVAILABLE' }, scenario, dataEventScenario ? { dataEventScenario } : {}); }
  }
  return { ret: (last.totalReturnIndex / start.totalReturnIndex) * factor - 1, category };
}

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export function breakpoints(values, buckets) {
  const s = values.slice().sort((a, b) => a - b);
  return Array.from({ length: buckets - 1 }, (_, k) => percentile(s, (k + 1) / buckets));
}
export function bucketOf(value, bps) { for (let k = 0; k < bps.length; k++) if (value <= bps[k]) return k; return bps.length; }

/** Independent-scorer friendly signal functions (each uses only bars dated <= F). */
export function momentumSignal(s, holdingMonth, ends) {
  const a = monthEndBar(s, prevMonth(holdingMonth, 13), ends), b = monthEndBar(s, prevMonth(holdingMonth, 2), ends);
  return a && b ? b.totalReturnIndex / a.totalReturnIndex - 1 : null;
}
export function varianceSignal(s, F, calendar, calendarIndex) {
  const fi = calendarIndex.get(F); if (fi === undefined || fi < 60) return null;
  const rets = [];
  for (let k = fi - 59; k <= fi; k++) {
    const i = indexAt(s.bars, calendar[k]), j = i > 0 && s.bars[i - 1].date === calendar[k - 1] ? i - 1 : -1;
    if (i >= 0 && j >= 0 && validTR(s.bars[i]) && validTR(s.bars[j])) rets.push(s.bars[i].totalReturnIndex / s.bars[j].totalReturnIndex - 1);
  }
  if (rets.length < 20) return null;
  const mu = rets.reduce((a, x) => a + x, 0) / rets.length;
  return rets.reduce((a, x) => a + (x - mu) ** 2, 0) / (rets.length - 1);
}

function categoriesAdd(acc, c) { acc[c] = (acc[c] || 0) + 1; }

/**
 * Builds all three constructions in one pass. Returns public-safe aggregates per month plus private
 * membership (ids) used by the independent review and the close-execution book.
 */
export function buildConstructions(data, { contract = CONSTRUCTION_CONTRACT_V4, scenario, dataEventScenario, keepMembership = true } = {}) {
  const calendar = sessionCalendar(data), ends = monthEnds(calendar), calendarIndex = new Map(calendar.map((d, i) => [d, i]));
  const universe = data.securities.filter((s) => oracleUniverseMember(s, contract));
  const months = [], blocked = [];
  for (const m of holdingMonths(contract)) {
    const F = ends.get(prevMonth(m)), E = ends.get(m);
    if (!F || !E) { blocked.push({ month: m, reason: 'MONTH_END_SESSION_MISSING' }); continue; }
    const june = ends.get(`${Number(m.slice(5, 7)) >= 7 ? m.slice(0, 4) : Number(m.slice(0, 4)) - 1}-06`);
    const rows = [];
    for (const s of universe) {
      if (s.terminal && s.terminal.date <= F) continue;
      const r = holdingReturn(s, F, E, calendarIndex, { scenario, dataEventScenario });
      if (!r) continue;
      rows.push({ s, ...r });
    }
    const ew = rows.filter((x) => june && indexAt(x.s.bars, june) >= 0);
    const ewCats = {}; for (const x of ew) categoriesAdd(ewCats, x.category);
    const out = { month: m, formation: F, end: E, EW_MARKET: { ret: ew.length ? ew.reduce((a, x) => a + x.ret, 0) / ew.length : null, count: ew.length, categories: ewCats } };
    for (const [key, signalOf, nb] of [
      ['MOM_12_2_EW_DECILES', (s) => momentumSignal(s, m, ends), 10],
      ['VAR_60D_EW_QUINTILES', (s) => varianceSignal(s, F, calendar, calendarIndex), 5],
    ]) {
      const scored = rows.map((x) => ({ ...x, signal: signalOf(x.s) })).filter((x) => Number.isFinite(x.signal));
      const nyse = scored.filter((x) => exchangeOf(x.s) === contract.universe.breakpointExchange).map((x) => x.signal);
      if (nyse.length < contract.universe.minimumBreakpointNames) { out[key] = { status: 'BLOCKED_BREAKPOINT_SAMPLE', nyseNames: nyse.length }; continue; }
      const bps = breakpoints(nyse, nb), members = Array.from({ length: nb }, () => []);
      for (const x of scored) members[bucketOf(x.signal, bps)].push(x);
      out[key] = { status: 'READY', nyseNames: nyse.length, buckets: members.map((g) => (g.length ? g.reduce((a, x) => a + x.ret, 0) / g.length : null)), counts: members.map((g) => g.length),
        ...(keepMembership ? { privateMembership: members.map((g) => g.map((x) => x.s.id)) } : {}) };
    }
    if (keepMembership) out.EW_MARKET.privateMembership = ew.map((x) => x.s.id);
    months.push(out);
  }
  return { contract: contract.schema, universeSize: universe.length, months, blocked };
}

/** Membership turnover per construction leg (VU only; the oracle publishes no turnover). */
export function membershipTurnover(months, key, bucket) {
  const series = [];
  for (let i = 1; i < months.length; i++) {
    const pick = (m) => (key === 'EW_MARKET' ? m.EW_MARKET.privateMembership : m[key]?.privateMembership?.[bucket]);
    const a = new Set(pick(months[i - 1]) || []), b = pick(months[i]) || [];
    if (!a.size || !b.length) continue;
    series.push(1 - b.filter((id) => a.has(id)).length / b.length);
  }
  return series.length ? series.reduce((x, y) => x + y, 0) / series.length : null;
}
export { isDataEvent };
