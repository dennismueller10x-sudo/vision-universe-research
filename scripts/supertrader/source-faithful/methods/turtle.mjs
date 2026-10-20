/**
 * Original Turtles System 1 / System 2 - source-faithful mechanical rules, long-only equity adaptation.
 * Contract: contracts/turtle.mjs (C01 / C02). Source: #709 W-TUR (The Original Turtle Trading Rules, printed pp. 13-30).
 *
 * Differences to the existing VU paths, all closing #709 / #712 findings:
 *  - pyramiding: up to 4 units at 1/2 N from the previous ACTUAL fill (VU DONCHIAN_TURTLE had one unit);
 *  - per-unit stops: each unit 2N below its own fill, earlier units raised by 1/2 N per add, each unit stopped out on
 *    its own (closes #712 V41-F1: the frozen V4 engine put every unit 2N below the newest fill);
 *  - System 2 as its own system (55 / 20, no filter);
 *  - the System 1 filter counts hypothetical breakouts in both directions (short breakouts too).
 * The original futures system (short side, contract months, rolls, correlation groups) is not replicated here.
 *
 * Accounting: research-v1 (validation/accounting-contract.mjs): orders only on real source bars, stale valuation limit,
 * data events settled at the last valid close, economic delistings by the portfolio.mjs scenarios, exact unit sales
 * (whole-share units, so no dust), ledger with a cash replay check.
 * Intrabar convention on daily bars (CONVENTION, counted): for a held position the level nearer to the open is reached
 * first (unit stops above the channel exit before it); no add on a bar on which a unit was stopped; after adds or an
 * entry, a low at or below a (raised) stop is assumed to come after them (pessimistic); the same holds for the
 * channel exit level on the entry bar (sf-turtle-1.1.0, counted as sameBarEntryChannelExits).
 *
 * Correlation limits (TUR-LIMIT6 / TUR-LIMIT10) are enforced when the caller supplies a point-in-time group provider
 * `groupsOf(securityId, date) -> { closely, loosely } | null`. The frozen research snapshot has no such groups, so the
 * runner passes none and every result states correlationLimits = NOT_EVALUATED_NO_PIT_GROUPS (DATA_BLOCKED binding).
 */
import * as AC from '../../validation/accounting-contract.mjs';
import { SCENARIOS } from '../../validation/portfolio.mjs';
import { trueRangeAt, priorHigh, priorLow, priorLowAvailable, priorHighAvailable, rawTickAdjusted, eligibleAtPriorSession, RESEARCH_UNIVERSE, fin } from '../common/series.mjs';

export const TURTLE_VERSION = 'sf-turtle-1.1.0';
export const PARAMS = Object.freeze({
  S1: Object.freeze({ entry: 20, exit: 10, filter: true, failsafe: 55 }),   // TUR-S1ENT, TUR-S1EX, TUR-S1SKIP, TUR-FAILSAFE
  S2: Object.freeze({ entry: 55, exit: 20, filter: false, failsafe: null }), // TUR-S2ENT, TUR-S2EX, TUR-S2NOSKIP
  nPeriod: 20,              // TUR-N
  unitRiskFraction: 0.01,   // TUR-UNIT
  stopN: 2,                 // TUR-STOP
  addStepN: 0.5,            // TUR-ADD, TUR-STOPADD
  maxUnitsPerMarket: 4,     // TUR-LIMIT4
  maxUnitsLong: 12,         // TUR-LIMIT12
  maxUnitsClosely: 6,       // TUR-LIMIT6 (per direction, closely correlated group)
  maxUnitsLoosely: 10,      // TUR-LIMIT10 (per direction, loosely correlated group)
  filterBreakout: 20,       // TUR-S1SKIP (hypothetical 20-day breakouts)
  filterExit: 10,           // TUR-S1LOSER (profitable 10-day exit)
  notionalLossStep: 0.10,   // TUR-DRAWDOWN
  notionalCut: 0.20,        // TUR-DRAWDOWN
  rankLookbackSessions: 63, // TUR-RANK / TUR-RANKVAR: 3 months (derivation)
  rawTick: 0.01,            // one tick, raw price (derivation)
});

/** TUR-TR / TUR-N: N = (19 x N_prev + TR) / 20, seeded with the 20-day mean TR. */
export function turtleN(bars, period = PARAMS.nPeriod) {
  const N = new Array(bars.length).fill(null);
  let n = null, s = 0, c = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRangeAt(bars, i);
    if (tr === null) { N[i] = n; continue; }
    if (n === null) { s += tr; c++; if (c === period) { n = s / period; N[i] = n; } continue; }
    n = ((period - 1) * n + tr) / period; N[i] = n;
  }
  return N;
}
export const trueRange = trueRangeAt;

/** TUR-UNIT / TUR-DOLLAR: whole units; equities: dollars per point = 1 per share. */
export function unitSize(notional, N, dollarsPerPoint = 1, riskFraction = PARAMS.unitRiskFraction) {
  const dv = N * dollarsPerPoint;
  return dv > 0 && notional > 0 ? Math.floor((riskFraction * notional) / dv + 1e-9) : 0;
}

/** TUR-STOP / TUR-STOPADD: stops of all units after a sequence of actual fills (long). */
export function unitStops(fills, N, { stopN = PARAMS.stopN, raiseN = PARAMS.addStepN } = {}) {
  const stops = [];
  for (const f of fills) { for (let k = 0; k < stops.length; k++) stops[k] += raiseN * N; stops.push(f - stopN * N); }
  return stops;
}

/** TUR-NOTIONAL / TUR-DRAWDOWN: yearly notional with compounding 20 % cuts per 10 % loss, hysteresis to the year start. */
export function createNotionalAccount(maxCuts = 60) {
  let yearStart = null, cuts = 0;
  return {
    newYear(equity) { yearStart = equity; cuts = 0; },
    update(equity) {
      if (!(yearStart > 0)) return 0;
      if (equity >= yearStart) { cuts = 0; return yearStart; }
      // thresholds: 10 % of the current notional each, i.e. 10 %, 18 %, 24.4 % ... of the year start
      for (;;) {
        let th = 0, acct = yearStart;
        for (let j = 0; j <= cuts; j++) { th += PARAMS.notionalLossStep * acct; acct *= 1 - PARAMS.notionalCut; }
        if (cuts < maxCuts && yearStart - equity >= th - 1e-9) cuts++; else break;
      }
      return yearStart * (1 - PARAMS.notionalCut) ** cuts;
    },
    get cuts() { return cuts; },
  };
}

/**
 * TUR-S1SKIP / TUR-S1LOSER / TUR-S1DIR: hypothetical 20-day breakouts in both directions, taken or not.
 * resolve(i) then start(i) once per bar in order. outcome(): 'WINNER' | 'LOSER' | 'NON_LOSER' | 'OPEN' | null.
 * Loser = price moved 2N against the breakout before a profitable 10-day exit. A 10-day exit at a loss without a
 * prior 2N move is NON_LOSER: not a loser by TUR-S1LOSER, but not profitable either, so TUR-S1SKIP (skip only after a
 * profitable breakout) does not skip (differs from the #705 reading, which skipped). An open breakout counts as not
 * losing (source silent; fewer entries).
 * A stop inside the hypothetical breakout bar is not resolved on that bar (counted).
 */
export function createBreakoutTracker(bars, N, P = PARAMS) {
  let active = null, last = null;
  const counts = { WINNER: 0, LOSER: 0, NON_LOSER: 0, AMBIGUOUS_BOTH_DIRECTIONS: 0, ENTRY_BAR_RESOLVED_PESSIMISTIC: 0 };
  const done = (o, atOpen = false) => { last = o; counts[o]++; active = null; return { outcome: o, atOpen }; };
  return {
    counts,
    outcome: () => (active ? 'OPEN' : last),
    resolve(i) {
      if (!active || i <= active.start) return null;
      const b = bars[i], t = rawTickAdjusted(b, P.rawTick);
      if (active.dir > 0) {
        const l = priorLowAvailable(bars, i, P.filterExit), exitLevel = l === null ? -Infinity : l - t;
        if (b.open <= active.stop) return done('LOSER', true);
        if (exitLevel >= active.stop && b.low <= exitLevel) { const px = Math.min(b.open, exitLevel); return done(px > active.entry ? 'WINNER' : 'NON_LOSER', b.open <= exitLevel); }
        if (b.low <= active.stop) return done('LOSER');
        if (b.low <= exitLevel) { const px = Math.min(b.open, exitLevel); return done(px > active.entry ? 'WINNER' : 'NON_LOSER', b.open <= exitLevel); }
      } else {
        const h = priorHighAvailable(bars, i, P.filterExit), exitLevel = h === null ? Infinity : h + t;
        if (b.open >= active.stop) return done('LOSER', true);
        if (exitLevel <= active.stop && b.high >= exitLevel) { const px = Math.max(b.open, exitLevel); return done(px < active.entry ? 'WINNER' : 'NON_LOSER', b.open >= exitLevel); }
        if (b.high >= active.stop) return done('LOSER');
        if (b.high >= exitLevel) { const px = Math.max(b.open, exitLevel); return done(px < active.entry ? 'WINNER' : 'NON_LOSER', b.open >= exitLevel); }
      }
      return null;
    },
    start(i) {
      if (active || i < P.filterBreakout || !fin(N[i - 1])) return null;
      const b = bars[i], hh = priorHigh(bars, i, P.filterBreakout), ll = priorLow(bars, i, P.filterBreakout);
      if (hh === null || ll === null) return null;
      const t = rawTickAdjusted(b, P.rawTick), up = b.high >= hh + t, down = b.low <= ll - t;
      if (!up && !down) return null;
      let dir = up ? 1 : -1;
      if (up && down) { counts.AMBIGUOUS_BOTH_DIRECTIONS++; dir = Math.abs(b.open - hh) <= Math.abs(b.open - ll) ? 1 : -1; }
      const entry = dir > 0 ? Math.max(b.open, hh + t) : Math.min(b.open, ll - t);
      active = { dir, start: i, entry, stop: entry - dir * P.stopN * N[i - 1] };
      // the same pessimistic entry-bar convention as the real position (sf-turtle-1.1.0, review R2-02): a range through
      // the stop or the 10-day exit after the breakout resolves the hypothetical trade on this bar; the level nearer to
      // the entry is reached first (stop -> LOSER, exit without a 2N move -> NON_LOSER)
      if (dir > 0) {
        const l = priorLowAvailable(bars, i, P.filterExit), xl = l === null ? -Infinity : l - t;
        if (b.low <= Math.max(active.stop, xl)) { counts.ENTRY_BAR_RESOLVED_PESSIMISTIC++; done(active.stop >= xl ? 'LOSER' : 'NON_LOSER'); }
      } else {
        const h = priorHighAvailable(bars, i, P.filterExit), xh = h === null ? Infinity : h + t;
        if (b.high >= Math.min(active.stop, xh)) { counts.ENTRY_BAR_RESOLVED_PESSIMISTIC++; done(active.stop <= xh ? 'LOSER' : 'NON_LOSER'); }
      }
      return dir;
    },
  };
}

/**
 * TUR-SF-ENTRY / TUR-SF-FAILSAFE / TUR-SF-S1-FILTER: entry trigger of bar i given the filter outcome before bar i.
 * Returns { trigger, path } or null. Long side only (equity adaptation).
 */
export function entryTrigger(bars, i, system, outcomeBefore, P = PARAMS) {
  const S = P[system], b = bars[i], t = rawTickAdjusted(b, P.rawTick);
  const hE = priorHigh(bars, i, S.entry);
  if (hE === null || !(b.high >= hE + t)) return null;
  // TUR-S1SKIP skips only after a profitable last breakout; an open (unresolved) one counts as not losing (derivation)
  if (S.filter && (outcomeBefore === 'WINNER' || outcomeBefore === 'OPEN')) {
    const h55 = priorHigh(bars, i, S.failsafe);
    if (h55 !== null && b.high >= h55 + t) return { trigger: h55 + t, path: 'FAILSAFE_55', skipped: true };
    return { trigger: null, path: 'SKIPPED_BY_FILTER', skipped: true };
  }
  return { trigger: hE + t, path: system, skipped: false };
}

/**
 * TUR-LIMIT6 / TUR-LIMIT10: would one more long unit of `candidateId` break a correlation-group limit?
 * held: [{ id, units }]; groupsOf(id, date) -> { closely, loosely } | null, membership known at `date` (the engine passes
 * the PRIOR session date; point in time, caller-supplied). Group ids are compared with ===; null / undefined = no group.
 * Returns null (allowed) or 'LIMIT6' / 'LIMIT10'. A security without a group is limited only by LIMIT4 / LIMIT12.
 */
export function correlationLimitBreach(held, candidateId, date, groupsOf, P = PARAMS) {
  const g = groupsOf(candidateId, date);
  if (!g) return null;
  let closely = 0, loosely = 0;
  for (const h of held) {
    const hg = groupsOf(h.id, date);
    if (!hg) continue;
    if (g.closely != null && hg.closely === g.closely) closely += h.units;
    if (g.loosely != null && hg.loosely === g.loosely) loosely += h.units;
  }
  if (g.closely != null && closely + 1 > P.maxUnitsClosely) return 'LIMIT6';
  if (g.loosely != null && loosely + 1 > P.maxUnitsLoosely) return 'LIMIT10';
  return null;
}

const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
/** Liquidity diagnostic of the fills (no gate: the source names no participation limit for liquid markets). */
export function liquiditySummary(rows) {
  const s = (k) => { const v = rows.map((r) => r[k]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return { n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), p99: q(v, 0.99), max: v.length ? v.at(-1) : null }; };
  return { fills: rows.length, participationOfBarVolume: s('bar'), participationOfAdv20: s('adv20'), note: 'entries and adds only (exits are not measured): shares of a fill / volume of the fill bar and / mean volume of the 20 prior sessions; diagnostic only, no gate; a value above 1 means the fill exceeds the bar volume' };
}

/**
 * Portfolio simulation of one system on a frozen dataset.
 * data: { calendar: [date], securities: [{ id, bars, terminal: { date, cause, distress, delistClass } | null }] }
 * opts: { system, initialCapital, from, to, scenario, dataEventScenario, slippageBps, commissionBps, universe, groupsOf,
 *         failsafeExit: '10D' (default) | '20D' (reading of the ambiguous failsafe exit) }
 */
export function runTurtle(data, { system = 'S1', initialCapital = 100000, from, to, scenario = 'S0_LAST_PRICE', dataEventScenario, slippageBps = 10, commissionBps = 1, universe = RESEARCH_UNIVERSE, groupsOf = null, failsafeExit = '10D', P = PARAMS } = {}) {
  const S = P[system]; if (!S) throw new Error('TURTLE_SYSTEM_REQUIRED');
  if (!['10D', '20D'].includes(failsafeExit)) throw new Error('UNKNOWN_FAILSAFE_EXIT');
  // TUR-SF-FAILSAFE-EXIT is SOURCE_AMBIGUOUS: default = the System 1 10-day exit; the 20-day (System 2) exit is the
  // second reading, run as the sensitivity scenario FAILSAFE_EXIT_20D (review R1-03)
  const exitSessionsOf = (path) => (path === 'FAILSAFE_55' && failsafeExit === '20D' ? 20 : S.exit);
  if (!SCENARIOS[scenario]) throw new Error('UNKNOWN_SCENARIO');
  const slip = slippageBps / 1e4, fee = commissionBps / 1e4, dataFactor = AC.dataEventFactor(dataEventScenario);
  const calendar = data.calendar.filter((d) => (!from || d >= from) && (!to || d <= to));
  const sec = data.securities.filter((s) => s.bars.length > S.entry + 1).map((s) => {
    const N = turtleN(s.bars, P.nPeriod), idx = new Map(s.bars.map((b, i) => [b.date, i]));
    const tracker = S.filter ? createBreakoutTracker(s.bars, N, P) : null;
    // warm the filter on the history before the window (causal: only bars before `from`)
    if (tracker) for (let i = 1; i < s.bars.length && s.bars[i].date < (calendar[0] ?? ''); i++) { tracker.resolve(i); tracker.start(i); }
    return { s, N, idx, tracker };
  });
  const byId = new Map(sec.map((x) => [x.s.id, x]));
  const stale = AC.createStaleTracker();
  let cash = initialCapital, year = null, grossFlows = 0;
  const notional = createNotionalAccount();
  const positions = new Map(), lastClose = new Map();
  const fillLiquidity = [];
  const ledger = [], unitTrades = [], positionTrades = [], signals = [], curve = [], rejections = [];
  const counts = { entries: 0, adds: 0, failsafeEntries: 0, skippedByFilter: 0, rejectNoCash: 0, rejectZeroUnit: 0, rejectUnitLimit12: 0, rejectCorrelationLimit6: 0, rejectCorrelationLimit10: 0, unitStopExits: 0, channelExits: 0, sameBarEntryChannelExits: 0, sameBarEntryStops: 0, sameBarAddStops: 0, noAddAfterStopSameBar: 0, terminalSettlements: 0, unavailableSettlements: 0, filterResolvedIntrabar: 0, reentrySameBarAsExit: 0, correlationGroupMissing: 0, dividends: 0, costs: 0 };
  const unitsLong = () => { let n = 0; for (const p of positions.values()) n += p.units.length; return n; };
  const mv = () => { let v = 0; for (const p of positions.values()) for (const u of p.units) v += u.shares * (lastClose.get(p.id) ?? u.fill); return v; };
  const book = (row) => { ledger.push(row); grossFlows += Math.abs(row.gross || 0) + Math.abs(row.fee || 0); };

  function closeUnit(pos, k, price, date, reason, slipRate = slip) {
    const u = pos.units[k], px = price * (1 - slipRate), gross = u.shares * px, f = gross * fee;
    cash += gross - f; counts.costs += u.shares * price * slipRate + f;
    book({ date, id: pos.id, side: 'SELL', unit: u.n, shares: u.shares, price: px, gross, fee: f, reason });
    unitTrades.push({ id: pos.id, path: pos.path, unit: u.n, entryDate: u.date, entryFill: u.fill, exitDate: date, exitPrice: px, shares: u.shares, pnl: gross - f - u.cost, reason });
    pos.realized += gross - f - u.cost; pos.units.splice(k, 1);
    if (reason.startsWith('STOP_2N')) pos.unitStopped = true;
    if (!pos.units.length) { finishPosition(pos, date, reason); exitedToday.add(pos.id); }
  }
  function finishPosition(pos, date, reason) {
    positionTrades.push({ id: pos.id, path: pos.path, entryDate: pos.entryDate, exitDate: date, maxUnits: pos.maxUnits, pnl: pos.realized + pos.dividends, cost: pos.costTotal, returnPct: (pos.realized + pos.dividends) / pos.costTotal, heldSessions: pos.sessions, reason });
    positions.delete(pos.id); stale.forget(pos.id);
  }
  /** Sells every remaining unit at a NET price; slipRate = the slippage the caller already applied (counted as cost). */
  function settleAll(pos, netPrice, date, reason, slipRate = slip) {
    while (pos.units.length) closeUnit(pos, pos.units.length - 1, netPrice / (1 - slipRate), date, reason, slipRate);
  }
  /** Buys one unit; returns the unit or null (rejections counted). */
  function buyUnit(x, i, price, date, nSize, nStop, pathLabel) {
    const shares = unitSize(notionalNow, nSize, 1, P.unitRiskFraction);
    if (!(shares > 0)) { counts.rejectZeroUnit++; return null; }
    if (unitsLong() >= P.maxUnitsLong) { counts.rejectUnitLimit12++; return null; }
    if (!AC.isExecutableBar(x.s.bars[i], 'open')) { rejections.push({ id: x.s.id, date, reason: 'ORDER_WITHOUT_SOURCE_BAR' }); return null; }
    if (groupsOf) {
      // groups as known at the PRIOR session (review R2-06); a held position's blocked add is counted once per unit level
      const asOf = x.s.bars[i - 1]?.date ?? date;
      if (groupsOf(x.s.id, asOf) == null) counts.correlationGroupMissing++;
      const breach = correlationLimitBreach([...positions.values()].map((p) => ({ id: p.id, units: p.units.length })), x.s.id, asOf, groupsOf, P);
      if (breach) {
        const held = positions.get(x.s.id), key = held ? held.nextUnit : 0;
        if (!held || held.corrRejectedUnit !== key) counts[breach === 'LIMIT6' ? 'rejectCorrelationLimit6' : 'rejectCorrelationLimit10']++;
        if (held) held.corrRejectedUnit = key;
        return null;
      }
    }
    const px = price * (1 + slip), gross = shares * px, f = gross * fee;
    if (gross + f > cash) { counts.rejectNoCash++; return null; }
    cash -= gross + f; counts.costs += shares * price * slip + f;
    let pos = positions.get(x.s.id);
    if (!pos) { pos = { id: x.s.id, path: pathLabel, entryDate: date, entryN: nStop, units: [], realized: 0, dividends: 0, costTotal: 0, maxUnits: 0, sessions: 0, nextUnit: 1, lastFill: null, unitStopped: false }; positions.set(x.s.id, pos); }
    for (const u of pos.units) u.stop += P.addStepN * pos.entryN; // TUR-STOPADD
    const u = { n: pos.nextUnit++, date, fill: price, fillWithSlippage: px, shares, cost: gross + f, stop: price - P.stopN * pos.entryN };
    pos.units.push(u); pos.lastFill = price; pos.costTotal += gross + f; pos.maxUnits = Math.max(pos.maxUnits, pos.units.length);
    book({ date, id: x.s.id, side: 'BUY', unit: u.n, shares, price: px, gross, fee: f, reason: pathLabel });
    let adv = 0, an = 0; for (let k = Math.max(0, i - 20); k < i; k++) if (fin(x.s.bars[k].volume)) { adv += x.s.bars[k].volume; an++; }
    const bv = x.s.bars[i].volume;
    fillLiquidity.push({ bar: fin(bv) && bv > 0 ? shares / bv : null, adv20: an === 20 && adv > 0 ? shares / (adv / an) : null });
    return u;
  }
  /**
   * TUR-ADD on bar i: levels from the last ACTUAL fill (pos.lastFill, also when that unit was stopped out since);
   * first add of the bar at max(open, level). After any unit stop-out the position takes no further adds: a re-add
   * would be the optional Whipsaw re-entry (TUR-WHIPRE, not implemented) (review SF-R1-01, derivation).
   */
  function addUnits(x, pos, i, date, nSize) {
    const b = x.s.bars[i]; let first = true, added = 0;
    if (pos.unitStopped) return 0;
    for (;;) {
      if (pos.units.length >= P.maxUnitsPerMarket) break;
      const level = pos.lastFill + P.addStepN * pos.entryN;
      if (!(b.high >= level)) break;
      const px = first ? Math.max(b.open, level) : level; first = false;
      if (!buyUnit(x, i, px, date, nSize, pos.entryN, pos.path)) break;
      counts.adds++; added++;
    }
    return added;
  }
  /**
   * Pessimistic same-bar check after adds / entry: units whose (raised) stop is at or above the low exit at the stop.
   * With a channel level `above`, only stops above it are reached before the channel exit (the caller exits the rest).
   */
  function sameBarStops(pos, b, date, counter, above = -Infinity) {
    for (let k = pos.units.length - 1; k >= 0 && positions.has(pos.id); k--) if (pos.units[k].stop > above && b.low <= pos.units[k].stop) { closeUnit(pos, k, pos.units[k].stop, date, 'STOP_2N_SAME_BAR'); counts[counter]++; }
  }
  let notionalNow = 0;

  const exitedToday = new Set();
  for (const date of calendar) {
    exitedToday.clear();
    const equityStart = cash + mv();
    if (date.slice(0, 4) !== year) { year = date.slice(0, 4); notional.newYear(equityStart); }
    notionalNow = notional.update(equityStart);
    // 1) held positions: dividends, exits (per-unit stops and channel), adds
    for (const pos of [...positions.values()]) {
      const x = byId.get(pos.id), i = x.idx.get(date), b = i === undefined ? null : x.s.bars[i];
      if (!b) continue;
      pos.sessions++;
      if (fin(b.dividend) && b.dividend > 0 && pos.entryDate < date) { let sh = 0; for (const u of pos.units) sh += u.shares; const d = sh * b.dividend; cash += d; pos.dividends += d; counts.dividends += d; book({ date, id: pos.id, side: 'DIVIDEND', shares: sh, price: b.dividend, gross: d, fee: 0, reason: 'EX_DATE_HELD_PREVIOUS_CLOSE' }); }
      if (!AC.isExecutableBar(b, 'open')) continue;
      const exitN = exitSessionsOf(pos.path), l = priorLowAvailable(x.s.bars, i, exitN), exitLevel = l === null ? -Infinity : l - rawTickAdjusted(b, P.rawTick);
      const exitReason = `EXIT_${exitN}D`;
      let stopped = false;
      // unit stops above the channel level are reached first (descending)
      const order = pos.units.map((u, k) => ({ u, k })).sort((a, c) => c.u.stop - a.u.stop);
      for (const { u } of order) {
        if (!(u.stop > exitLevel)) break;
        if (b.low <= u.stop) { closeUnit(pos, pos.units.indexOf(u), Math.min(b.open, u.stop), date, 'STOP_2N_UNIT'); counts.unitStopExits++; stopped = true; if (!positions.has(pos.id)) break; } else break;
      }
      if (positions.has(pos.id) && b.low <= exitLevel) { settleAll(pos, Math.min(b.open, exitLevel) * (1 - slip), date, exitReason); counts.channelExits++; continue; }
      if (!positions.has(pos.id)) continue;
      if (stopped) { counts.noAddAfterStopSameBar++; continue; }
      if (addUnits(x, pos, i, date, x.N[i - 1] ?? pos.entryN)) sameBarStops(pos, b, date, 'sameBarAddStops');
    }
    // 2) new entries: every security advances its filter; strongest first (TUR-RANK)
    const cands = [];
    for (const x of sec) {
      const i = x.idx.get(date); if (i === undefined || i < 1) continue;
      let before = null;
      if (x.tracker) {
        // the filter state is the one before bar i; a resolution on bar i counts only if it happened at the open
        // (intrabar order of this bar's breakout high and resolving low is unknown; review SF-R3-04, counted)
        const pre = x.tracker.outcome(), res = x.tracker.resolve(i);
        before = res && res.atOpen ? res.outcome : pre;
        if (res && !res.atOpen) counts.filterResolvedIntrabar++;
        x.tracker.start(i);
      }
      if (positions.has(x.s.id) || !fin(x.N[i - 1])) continue;
      if (!eligibleAtPriorSession(x.s.bars, i, universe)) continue;
      const e = entryTrigger(x.s.bars, i, system, before, P);
      if (!e) continue;
      if (e.skipped) counts.skippedByFilter++;
      if (e.trigger === null) continue;
      const k = i - 1 - P.rankLookbackSessions, b0 = x.s.bars[i - 1];
      const strength = k >= 0 ? (b0.close - x.s.bars[k].close) / x.N[i - 1] : -Infinity;
      cands.push({ x, i, e, strength });
    }
    cands.sort((a, b) => b.strength - a.strength || (a.x.s.id < b.x.s.id ? -1 : a.x.s.id > b.x.s.id ? 1 : 0));
    for (const c of cands) {
      const b = c.x.s.bars[c.i], price = Math.max(b.open, c.e.trigger), n = c.x.N[c.i - 1];
      signals.push({ id: c.x.s.id, date, path: c.e.path, trigger: c.e.trigger, fill: price, strength: c.strength });
      if (!buyUnit(c.x, c.i, price, date, n, n, c.e.path)) continue;
      counts.entries++; if (c.e.path === 'FAILSAFE_55') counts.failsafeEntries++;
      const pos = positions.get(c.x.s.id);
      // the channel exit level is a resting stop as well: a low through it on the entry bar is assumed after the
      // entry (pessimistic, the same convention as the unit stops; whichever level is higher is reached first;
      // sf-turtle-1.1.0)
      // order on the entry bar: entry -> high (adds) -> low (unit stops, channel), as declared (review R2-01)
      const exitN = exitSessionsOf(c.e.path), l = priorLowAvailable(c.x.s.bars, c.i, exitN), lvl = l === null ? -Infinity : l - rawTickAdjusted(b, P.rawTick);
      if (exitedToday.has(pos.id)) counts.reentrySameBarAsExit++;
      addUnits(c.x, pos, c.i, date, n);
      sameBarStops(pos, b, date, 'sameBarEntryStops', lvl);
      if (positions.has(pos.id) && b.low <= lvl) { settleAll(pos, lvl * (1 - slip), date, `EXIT_${exitN}D_SAME_BAR`); counts.sameBarEntryChannelExits++; }
    }
    // 3) terminals (research-v1, as validation/portfolio.mjs): only the end of an inactive listing is an economic
    // delisting, settled on its last bar by scenario. A data gap or window end is no delisting; a position without
    // further bars is settled by the stale limit (step 4) at the last valid close.
    for (const pos of [...positions.values()]) {
      const x = byId.get(pos.id), t = x.s.terminal;
      if (!t || t.date !== date || t.cause !== 'LISTING_INACTIVE') continue;
      const i = x.idx.get(date), last = i === undefined ? lastClose.get(pos.id) : x.s.bars[i].close;
      const net = SCENARIOS[scenario]({ lastClose: last, distress: t.distress, delistClass: t.delistClass }, slip);
      // S0 (and classified acquisitions) include slippage; the haircut scenarios do not (validation/portfolio.mjs)
      settleAll(pos, net, date, 'TERMINAL_DELISTED', Math.abs(net - last * (1 - slip)) <= 1e-12 * Math.max(1, last) ? slip : 0); counts.terminalSettlements++;
    }
    // 4) marks, stale limit (A4)
    const seen = new Map();
    for (const x of sec) { const i = x.idx.get(date); if (i !== undefined && fin(x.s.bars[i].close)) { lastClose.set(x.s.id, x.s.bars[i].close); if (positions.has(x.s.id)) seen.set(x.s.id, { close: x.s.bars[i].close, volume: x.s.bars[i].volume }); } }
    for (const id of stale.observe([...positions.keys()], seen)) { const pos = positions.get(id); settleAll(pos, lastClose.get(id) * dataFactor * (1 - slip), date, 'SECURITY_UNAVAILABLE'); counts.unavailableSettlements++; }
    const m = mv();
    if (cash < -AC.reconciliationTolerance(grossFlows, initialCapital)) throw new Error('TURTLE_NEGATIVE_CASH');
    curve.push({ date, equity: cash + m, exposure: cash + m > 0 ? m / (cash + m) : 0, positions: positions.size, units: unitsLong(), notional: notionalNow });
  }
  // replay: cash from the ledger alone must equal the simulated cash
  let replay = initialCapital;
  for (const r of ledger) replay += r.side === 'BUY' ? -(r.gross + r.fee) : r.gross - r.fee;
  const tol = AC.reconciliationTolerance(grossFlows, initialCapital);
  const filterCounts = sec.reduce((acc, x) => { for (const [k, v] of Object.entries(x.tracker?.counts ?? {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
  return {
    version: TURTLE_VERSION, system, initialCapital, universe: universe.id, scenario, dataEventScenario: dataEventScenario ?? AC.POLICY.dataEventScenarios.baseline,
    curve, unitTrades, positionTrades, signals, counts, filterCounts, ledger, rejections, wholeUnitsNoDust: true, staleCounts: { ...stale.counts },
    correlationLimits: !groupsOf ? 'NOT_EVALUATED_NO_PIT_GROUPS' : counts.correlationGroupMissing ? 'ENFORCED_PARTIAL_GROUP_COVERAGE' : 'ENFORCED_WITH_CALLER_GROUPS', failsafeExit, liquidity: liquiditySummary(fillLiquidity),
    openAtEnd: [...positions.values()].map((p) => ({ id: p.id, units: p.units.length, value: p.units.reduce((a, u) => a + u.shares * (lastClose.get(p.id) ?? u.fill), 0) })),
    endingPositionCheck: AC.endingPositionCheck([...positions.keys()], stale),
    reconciliation: { ledgerCash: replay, cash, absoluteDifference: Math.abs(replay - cash), tolerance: tol, pass: Math.abs(replay - cash) <= tol },
  };
}
