/**
 * Turtle System 1 / System 2 — source-faithful long-only equity translation (V4, post-hoc, research).
 *
 * Source contract: scripts/supertrader/fidelity/canonical/turtle.json (The Original Turtle Trading Rules, PDF,
 * page-cited, HIGH). Every rule below carries its source id(s). Numbers without a source id are declared VU
 * translations (TRANSLATION) or measurement conventions (CONVENTION) and are listed in TURTLE_RULES_V4.
 * Scope: VU_EQUITY_ADAPTATION, long side only. The ORIGINAL_FUTURES_REPLICATION is DATA_BLOCKED (no futures data).
 *
 * This engine is separate from the old VU adaptation (DONCHIAN_TURTLE / TURTLE_S2_EQUITY_DAILY), which is kept
 * unchanged for A/B comparison. No parameter was searched or tuned.
 */
import { MEASUREMENT_POLICY_V4, terminalFactorV4, isDataEvent } from '../measurement/measurement-policy-v4.mjs';

export const TURTLE_SOURCE_VERSION = 'turtle-source-v4-1.1.0';

export const TURTLE_RULES_V4 = [
  { ruleId: 'T4-N', sourceIds: ['TUR-F-N-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'TR = max(H-L, H-PDC, PDC-L); N = (19*PDN + TR)/20, seeded with the 20-day mean TR', code: 'turtleN', tests: ['N recursion and seed'], scope: 'all systems' },
  { ruleId: 'T4-S1-ENTRY', sourceIds: ['TUR-F-S1-ENTRY', 'TUR-F-BO-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'buy one unit when price exceeds the prior 20-day high by one tick, intraday at the breakout, at the open on a gap', code: 'entryTrigger/fillAbove', tests: ['golden S1 buy after losing breakout', 'golden gap fill at open'], scope: 'S1' },
  { ruleId: 'T4-S1-FILTER', sourceIds: ['TUR-F-S1-FILTER', 'TUR-E-SHORT-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'skip an S1 breakout if the last breakout (taken or not, long or short) was not a losing breakout; losing = price moved 2N against it before a profitable 10-day exit', code: 'createBreakoutTracker', tests: ['golden skip after winning breakout', 'golden short breakout counts in filter', 'filter path order'], scope: 'S1', interpretation: 'LITERAL: a 10-day exit at a loss without a prior 2N adverse move is not a losing breakout (counted NON_LOSER). Path-consistent intrabar order (the level nearer to the open is hit first). An unresolved (open) previous breakout counts as not losing (source silent; conservative, fewer entries). A stop inside the hypothetical breakout bar does not resolve it (conservative for the filter; counted)' },
  { ruleId: 'T4-FAILSAFE', sourceIds: ['TUR-F-FAILSAFE-55'], kind: 'SOURCE', confidence: 'HIGH', rule: 'if an S1 breakout was skipped, enter at the 55-day breakout', code: 'entryTrigger', tests: ['golden failsafe 55'], scope: 'S1', interpretation: 'exit of failsafe positions follows S1 (source silent; labelled interpretation, R15 TUR-F-FAILSAFE-55)' },
  { ruleId: 'T4-S2-ENTRY', sourceIds: ['TUR-F-S2-ENTRY'], kind: 'SOURCE', confidence: 'HIGH', rule: 'buy one unit one tick above the 55-day high; no filter', code: 'entryTrigger', tests: ['golden S2 buy without filter'], scope: 'S2' },
  { ruleId: 'T4-UNIT', sourceIds: ['TUR-F-UNIT-01', 'TUR-F-UNIT-02'], kind: 'SOURCE', confidence: 'HIGH', rule: 'unit = 1 % of the notional account / N (dollar volatility per share = N)', code: 'unitShares', tests: ['unit size'], scope: 'all', translation: 'N updated daily (source: weekly sheet) - LOW deviation already declared in R15' },
  { ruleId: 'T4-NOTIONAL', sourceIds: ['TUR-F-NOTIONAL-01', 'TUR-E-NOTIONAL-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'notional account = equity at the first session of the year; each loss of 10 % of the current notional cuts it by 20 % (1M -> 0.8M -> 0.64M; thresholds 10 %, 18 %, 24.4 % ... of the year start); the cut holds until the year start is regained; at a 50 % yearly loss no new units (TUR-E-NOTIONAL-01)', code: 'createNotionalAccount', tests: ['notional cuts compound with hysteresis'], scope: 'all', translation: 'year start = actual equity at first session (Dennis set it subjectively)' },
  { ruleId: 'T4-ADD', sourceIds: ['TUR-F-ADD-01', 'TUR-E-PYR-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'add one unit every 1/2 N above the previous unit fill, up to 4 units, several per day possible', code: 'processAdds', tests: ['golden pyramid to 4 units'], scope: 'all', interpretation: 'N for add spacing and stops = N at the initial entry (worked example in the source keeps N constant)' },
  { ruleId: 'T4-STOP', sourceIds: ['TUR-F-STOP-2N', 'TUR-F-STOP-ADD'], kind: 'SOURCE', confidence: 'HIGH', rule: 'stop 2N below the last unit fill; adds raise the stop of all units to 2N below the newest unit', code: 'processExits', tests: ['golden stop raised by adds', 'golden stop exit'], scope: 'all' },
  { ruleId: 'T4-EXIT-S1', sourceIds: ['TUR-F-EXIT-S1'], kind: 'SOURCE', confidence: 'HIGH', rule: 'exit all units when price trades below the prior 10-day low', code: 'processExits', tests: ['golden 10-day exit'], scope: 'S1 and failsafe' },
  { ruleId: 'T4-EXIT-S2', sourceIds: ['TUR-F-EXIT-S2'], kind: 'SOURCE', confidence: 'HIGH', rule: 'exit all units when price trades below the prior 20-day low', code: 'processExits', tests: ['golden S2 exit'], scope: 'S2' },
  { ruleId: 'T4-LIMIT', sourceIds: ['TUR-F-LIM-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'at most 4 units per market and 12 units per direction', code: 'canAddUnit', tests: ['limit 12'], scope: 'all', deviation: '6/10-unit correlated-group limits not applied: no point-in-time industry data (DATA_PARTIAL); TUR-E-CORR-01' },
  { ruleId: 'T4-RANK', sourceIds: ['TUR-F-RANK-01', 'TUR-F-SIM-01', 'TUR-E-RANK-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'simultaneous signals: buy the strongest first; strength = (close - close 3 months ago) / N', code: 'rankCandidates', tests: ['rank order'], scope: 'all', translation: '3 months = 63 sessions; ties by security id' },
  { ruleId: 'T4-CONSISTENCY', sourceIds: ['TUR-F-CONS-01', 'TUR-E-CONS-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'take every signal; no VU lifecycle (no proximity, expiry or cooldown)', code: 'runTurtleSource', tests: ['gap breakout far from prior close is taken'], scope: 'all' },
  { ruleId: 'T4-NO-REGIME', sourceIds: ['TUR-F-REGIME-01', 'TUR-F-FUND-01'], kind: 'SOURCE', confidence: 'HIGH', rule: 'no market-regime, index or fundamental filter', code: 'runTurtleSource', tests: ['no regime input'], scope: 'all' },
  { ruleId: 'T4-LONG-ONLY', sourceIds: ['TUR-F-LS-01', 'TUR-E-SHORT-01'], kind: 'TRANSLATION', confidence: 'HIGH', rule: 'short side omitted (no borrow data); short breakouts still feed the S1 filter', code: 'createBreakoutTracker', tests: ['golden short breakout counts in filter'], scope: 'all', deviation: 'declared: net long beta; not the original risk profile' },
  { ruleId: 'T4-NO-LEVERAGE', sourceIds: ['TUR-E-LEV-01'], kind: 'TRANSLATION', confidence: 'HIGH', rule: 'cash account, gross exposure <= 100 %: a unit is bought only if its full cost fits in cash, otherwise REJECT_NO_CASH (counted)', code: 'canAddUnit', tests: ['no cash rejection'], scope: 'all', deviation: 'with 1 %/N units only a few units fit; declared' },
  { ruleId: 'T4-UNIVERSE', sourceIds: ['TUR-F-MKT-01'], kind: 'TRANSLATION', confidence: 'MEDIUM', rule: 'liquid markets only -> frozen common tournament universe (raw close >= 5, 20-day dollar volume >= 1M, common equity classes), evaluated on the prior session', code: 'eligibleYesterday', tests: ['eligibility uses prior session'], scope: 'all', deviation: 'equities instead of ~20 futures; universe numbers are the frozen protocol, not source numbers' },
  { ruleId: 'T4-TICK', sourceIds: ['TUR-F-S1-ENTRY'], kind: 'TRANSLATION', confidence: 'HIGH', rule: 'one tick = 0.01 in raw price, converted to the split-adjusted basis', code: 'tickAdjusted', tests: ['tick conversion'], scope: 'all' },
  { ruleId: 'T4-INTRABAR', sourceIds: [], kind: 'CONVENTION', confidence: 'N/A', rule: 'daily bars: exits before adds/entries for held positions, the exit level nearer to the open triggers first (gap through both: open); after same-bar adds or an entry, a bar low at or below the (raised) stop is assumed hit after the adds (pessimistic); fills at max(open, trigger) for buys and min(open, level) for sells', code: 'processExits/processAdds', tests: ['golden same-bar stop and add is pessimistic', 'raised stop re-checked on the add bar'], scope: 'all', deviation: 'measurement convention for daily bars; not externally calibrated (MEASUREMENT_PARTIAL)' },
  { ruleId: 'T4-COSTS', sourceIds: ['TUR-F-ORD-01'], kind: 'CONVENTION', confidence: 'N/A', rule: 'frozen protocol costs: 10 bp slippage and 1 bp commission per side; gross variant reported separately', code: 'fillPrice', tests: ['costs'], scope: 'all' },
  { ruleId: 'T4-TERMINALS', sourceIds: [], kind: 'CONVENTION', confidence: 'N/A', rule: 'V4 measurement policy: stale limit, data events at last valid close, economic delisting scenarios; no entry on or after the terminal date', code: 'settleTerminal', tests: ['no entry on the terminal bar'], scope: 'all' },
  { ruleId: 'T4-LEDGER', sourceIds: [], kind: 'CONVENTION', confidence: 'N/A', rule: 'every fill, fee and dividend is written to a ledger that an independent replay (review/turtle-replay-v4.mjs) re-values daily; the run fails if the replay differs', code: 'runTurtleSource', tests: ['ledger replay'], scope: 'all' },
];

export const TURTLE_PARAMS = Object.freeze({
  S1: { entry: 20, exit: 10, filter: true, failsafe: 55 },
  S2: { entry: 55, exit: 20, filter: false, failsafe: null },
  filterBreakout: 20, filterExit: 10, nPeriod: 20, unitRiskFraction: 0.01, stopN: 2, addStepN: 0.5,
  maxUnitsPerMarket: 4, maxUnitsDirection: 12, rankLookback: 63, notionalLossStep: 0.10, notionalCutStep: 0.20, rawTick: 0.01,
});

/** T4-N */
export function turtleN(bars, period = TURTLE_PARAMS.nPeriod) {
  const N = new Array(bars.length).fill(null), tr = bars.map((b, i) => (i ? Math.max(b.high - b.low, b.high - bars[i - 1].close, bars[i - 1].close - b.low) : b.high - b.low));
  if (bars.length < period) return N;
  let n = tr.slice(0, period).reduce((a, x) => a + x, 0) / period; N[period - 1] = n;
  for (let i = period; i < bars.length; i++) { n = ((period - 1) * n + tr[i]) / period; N[i] = n; }
  return N;
}
/** Prior-n-day high (index i uses bars i-n .. i-1, never bar i); null without n prior bars. Computed on demand. */
export function priorHigh(bars, i, n) { if (i < n) return null; let v = bars[i - n].high; for (let k = i - n + 1; k < i; k++) if (bars[k].high > v) v = bars[k].high; return v; }
export function priorLow(bars, i, n) { if (i < n) return null; let v = bars[i - n].low; for (let k = i - n + 1; k < i; k++) if (bars[k].low < v) v = bars[k].low; return v; }
/** Array form (tests and audits). */
export function channel(bars, n, field) { return bars.map((_, i) => (field === 'high' ? priorHigh(bars, i, n) : priorLow(bars, i, n))); }
export const tickAdjusted = (bar) => TURTLE_PARAMS.rawTick / (bar.splitAdjustmentFactor || 1);

/**
 * T4-S1-FILTER / T4-LONG-ONLY: hypothetical 20-day breakout trades in both directions (taken or not).
 * step(i) must be called once per bar in order; lastOutcome() is the outcome of the last resolved breakout.
 */
export function createBreakoutTracker(bars, N) {
  const P = TURTLE_PARAMS;
  let active = null, last = null; const counts = { WINNER: 0, LOSER: 0, NON_LOSER_UNPROFITABLE_EXIT: 0, AMBIGUOUS_BOTH_DIRECTIONS: 0, HYPOTHETICAL_ENTRY_BAR_STOP_NOT_RESOLVED: 0 };
  function resolve(outcome) { last = outcome; counts[outcome === 'NON_LOSER' ? 'NON_LOSER_UNPROFITABLE_EXIT' : outcome]++; active = null; }
  return {
    counts,
    lastOutcome: () => last,
    /** V4.1: an unresolved previous breakout is OPEN (treated as not losing by the filter). */
    isOpen: () => active !== null,
    /** Path-consistent: the exit or stop level nearer to the open is reached first; a gap through both fills at the open. */
    resolve(i) {
      const b = bars[i];
      if (!active || i <= active.start) return;
      const t = tickAdjusted(b);
      if (active.dir > 0) {
        const l10 = priorLow(bars, i, P.filterExit), exitLevel = l10 === null ? -Infinity : l10 - t;
        if (b.open <= active.stop) return resolve('LOSER');
        if (exitLevel >= active.stop) { if (b.low <= exitLevel) { const px = Math.min(b.open, exitLevel); return resolve(px > active.entry ? 'WINNER' : 'NON_LOSER'); } }
        if (b.low <= active.stop) return resolve('LOSER');
      } else {
        const h10 = priorHigh(bars, i, P.filterExit), exitLevel = h10 === null ? Infinity : h10 + t;
        if (b.open >= active.stop) return resolve('LOSER');
        if (exitLevel <= active.stop) { if (b.high >= exitLevel) { const px = Math.max(b.open, exitLevel); return resolve(px < active.entry ? 'WINNER' : 'NON_LOSER'); } }
        if (b.high >= active.stop) return resolve('LOSER');
      }
    },
    start(i) {
      const b = bars[i];
      if (active || N[i - 1] == null || i < P.filterBreakout) return null;
      const hh20 = priorHigh(bars, i, P.filterBreakout), ll20 = priorLow(bars, i, P.filterBreakout);
      const t = tickAdjusted(b), up = b.high >= hh20 + t, down = b.low <= ll20 - t;
      if (!up && !down) return null;
      let dir = up ? 1 : -1;
      if (up && down) { counts.AMBIGUOUS_BOTH_DIRECTIONS++; dir = Math.abs(b.open - hh20) <= Math.abs(b.open - ll20) ? 1 : -1; }
      const entry = dir > 0 ? Math.max(b.open, hh20 + t) : Math.min(b.open, ll20 - t), n = N[i - 1];
      active = { dir, start: i, entry, stop: entry - dir * TURTLE_PARAMS.stopN * n };
      // V4.1 (review R3): a stop inside the hypothetical breakout bar is not resolved (conservative for the filter)
      if (dir > 0 ? b.low <= active.stop : b.high >= active.stop) counts.HYPOTHETICAL_ENTRY_BAR_STOP_NOT_RESOLVED++;
      return dir;
    },
    step(i) { this.resolve(i); return this.start(i); },
  };
}

/** T4-NOTIONAL (V4.1, review R2): compounding cuts with hysteresis, per the source example on printed p.17. */
export function createNotionalAccount(maxCuts = 60) {
  let yearStart = null, cuts = 0;
  return {
    newYear(equity) { yearStart = equity; cuts = 0; },
    update(equity) {
      if (!(yearStart > 0)) return 0;
      if (equity >= yearStart) { cuts = 0; return yearStart; }
      const loss = yearStart - equity;
      while (cuts < maxCuts && loss >= 0.5 * yearStart * (1 - (1 - TURTLE_PARAMS.notionalCutStep) ** (cuts + 1)) - 1e-9) cuts++;
      if (loss >= 0.5 * yearStart) return 0; // TUR-E-NOTIONAL-01: no new units from a 50 % yearly loss
      return yearStart * (1 - TURTLE_PARAMS.notionalCutStep) ** cuts;
    },
    get cuts() { return cuts; },
  };
}
/** Stateless view for a fresh year (tests/docs): equity path assumed monotone from the year start. */
export function notionalAccount(yearStart, equity) { const a = createNotionalAccount(); a.newYear(yearStart); return a.update(equity); }
/** T4-UNIT */
export const unitShares = (notional, n) => (n > 0 ? (TURTLE_PARAMS.unitRiskFraction * notional) / n : 0);

/** T4-UNIVERSE: frozen tournament eligibility evaluated on the prior session (no same-day information). */
export function eligibleYesterday(bars, i, universe) {
  const j = i - 1, n = universe.dollarVolumeSessions;
  if (j < n - 1 || !(bars[j].rawClose >= universe.priceFloorRaw)) return false;
  let dv = 0; for (let k = j - n + 1; k <= j; k++) dv += bars[k].rawClose * (bars[k].rawVolume ?? bars[k].volume);
  return dv / n >= universe.dollarVolumeFloor;
}

/**
 * Portfolio simulation for one system. data: canonical V4 dataset (split-adjusted OHLC, dividends, terminals).
 * Returns curve, trades, signals and counts. `system`: 'S1' | 'S2'.
 */
export function runTurtleSource(data, { system = 'S1', initialCapital = 100000, slippageBpsPerSide = 10, commissionBpsPerSide = 1, universe, from, to, scenario = 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT', dataEventScenario, policy = MEASUREMENT_POLICY_V4, includeInstrument = (s) => true } = {}) {
  const P = TURTLE_PARAMS[system]; if (!P) throw new Error('TURTLE_SYSTEM_REQUIRED');
  if (!universe) throw new Error('FROZEN_UNIVERSE_REQUIRED');
  const calendar = (data.benchmark?.bars || data.spyBars).map((b) => b.date).filter((d) => d >= from && d <= to);
  const prepared = data.securities.filter((s) => includeInstrument(s) && s.bars.length > P.entry && s.bars.at(-1).date >= from && s.bars[0].date <= to).map((s) => {
    const b = s.bars, N = Float64Array.from(turtleN(b), (x) => (x === null ? NaN : x));
    return { s, b, N: Array.prototype.map.call(N, (x) => (Number.isNaN(x) ? null : x)), cursor: 0, tracker: null };
  });
  for (const p of prepared) p.tracker = P.filter ? createBreakoutTracker(p.b, p.N) : null;
  // monotone per-security date cursor (calendar dates strictly increase)
  const at = (p, date) => { while (p.cursor < p.b.length && p.b[p.cursor].date < date) p.cursor++; return p.b[p.cursor]?.date === date ? p.cursor : -1; };
  const byId = new Map(prepared.map((p) => [p.s.id, p]));
  const sBuy = 1 + slippageBpsPerSide / 1e4, sSell = 1 - slippageBpsPerSide / 1e4, fee = commissionBpsPerSide / 1e4;
  let cash = initialCapital, year = null; const notionalState = createNotionalAccount(); const ledger = [];
  const positions = new Map(), trades = [], signals = [], curve = [], counts = { sameBarAddStops: 0, terminalBarEntriesBlocked: 0, openBreakoutSkips: 0, entries: 0, adds: 0, skippedByFilter: 0, failsafeEntries: 0, rejectNoCash: 0, rejectUnitLimit: 0, stopExits: 0, channelExits: 0, sameBarStops: 0, terminalSettlements: 0, unavailableSettlements: 0, dividends: 0, costs: 0 };
  const lastClose = new Map(), staleRun = new Map();
  const unitsLong = () => [...positions.values()].reduce((a, p) => a + p.units.length, 0);
  const equityNow = () => cash + [...positions.values()].reduce((a, p) => a + p.shares * (lastClose.get(p.id) ?? p.units.at(-1).fill), 0);
  function sell(pos, price, date, reason) {
    const px = price * sSell, gross = pos.shares * px, f = gross * fee;
    cash += gross - f; counts.costs += pos.shares * price * (1 - sSell) + f;
    ledger.push({ date, id: pos.id, side: 'SELL', shares: pos.shares, price: px, fee: f });
    trades.push({ id: pos.id, system: pos.path, entryDate: pos.units[0].date, exitDate: date, units: pos.units.length, shares: pos.shares, cost: pos.cost, proceeds: gross - f, dividends: pos.dividends, pnl: gross - f + pos.dividends - pos.cost, r: (gross - f + pos.dividends - pos.cost) / (pos.units.length * pos.riskPerUnit), reason, mfe: pos.mfe, mae: pos.mae });
    positions.delete(pos.id); staleRun.delete(pos.id);
  }
  function buy(p, i, price, n, notional, pathLabel, date) {
    const shares = unitShares(notional, n); if (!(shares > 0)) return false;
    const px = price * sBuy, cost = shares * px * (1 + fee);
    if (unitsLong() >= TURTLE_PARAMS.maxUnitsDirection) { counts.rejectUnitLimit++; return false; }
    if (cost > cash) { counts.rejectNoCash++; return false; }
    cash -= cost; counts.costs += shares * price * (sBuy - 1) + shares * px * fee;
    ledger.push({ date, id: p.s.id, side: 'BUY', shares, price: px, fee: shares * px * fee });
    let pos = positions.get(p.s.id);
    if (!pos) { pos = { id: p.s.id, path: pathLabel, units: [], shares: 0, cost: 0, dividends: 0, entryN: n, riskPerUnit: shares * TURTLE_PARAMS.stopN * n, mfe: 0, mae: 0 }; positions.set(p.s.id, pos); }
    pos.units.push({ date, fill: px, rawTrigger: price, shares }); pos.shares += shares; pos.cost += cost;
    pos.stop = pos.units.at(-1).rawTrigger - TURTLE_PARAMS.stopN * pos.entryN;
    return true;
  }
  for (const date of calendar) {
    if (date.slice(0, 4) !== year) { year = date.slice(0, 4); notionalState.newYear(equityNow()); }
    const notional = notionalState.update(equityNow());
    // 1) dividends, terminals, stale settlement for held positions
    for (const pos of [...positions.values()]) {
      const p = byId.get(pos.id), i = at(p, date), bar = i >= 0 ? p.b[i] : null;
      if (bar && bar.dividend > 0) { const d = pos.shares * bar.dividend; cash += d; pos.dividends += d; counts.dividends += d; ledger.push({ date, id: pos.id, side: 'DIVIDEND', amount: d }); }
      const term = p.s.terminal && p.s.terminal.date === date ? p.s.terminal : null;
      if (term) { const px = (bar?.close ?? lastClose.get(pos.id)) * terminalFactorV4(term, scenario, { distress: (bar?.rawClose ?? Infinity) < 1, ...(dataEventScenario ? { dataEventScenario } : {}) }); if (!bar && !isDataEvent(term.kind)) throw new Error('TERMINAL_WITHOUT_BAR'); sell(pos, px / sSell, date, 'TERMINAL_' + term.kind); counts.terminalSettlements++; continue; }
      const fresh = bar && !(bar.volume === 0 && lastClose.get(pos.id) === bar.close);
      staleRun.set(pos.id, fresh ? 0 : (staleRun.get(pos.id) ?? 0) + 1);
      if (staleRun.get(pos.id) > policy.staleCarryMaxSessions) { sell(pos, lastClose.get(pos.id) * terminalFactorV4({ kind: 'SECURITY_UNAVAILABLE' }, scenario, dataEventScenario ? { dataEventScenario } : {}) / sSell, date, 'SECURITY_UNAVAILABLE'); counts.unavailableSettlements++; continue; }
      if (!bar) continue;
      // 2) exits before adds (T4-INTRABAR), stop priority over channel exit
      pos.mfe = Math.max(pos.mfe, bar.high / pos.units[0].fill - 1); pos.mae = Math.min(pos.mae, bar.low / pos.units[0].fill - 1);
      const lx = priorLow(p.b, i, P.exit), exitLevel = lx === null ? -Infinity : lx - tickAdjusted(bar), exitReason = P.exit === 10 ? 'EXIT_10D' : 'EXIT_20D';
      // path-consistent: the level nearer to the open (the higher one for a long) is hit first
      const hit = exitLevel > pos.stop ? { level: exitLevel, reason: exitReason, ch: true } : { level: pos.stop, reason: 'STOP_2N', ch: false };
      if (bar.low <= hit.level) { sell(pos, Math.min(bar.open, hit.level), date, hit.reason); if (hit.ch) counts.channelExits++; else counts.stopExits++; continue; }
      // 3) adds (T4-ADD, T4-STOP)
      let level = pos.units.at(-1).rawTrigger + TURTLE_PARAMS.addStepN * pos.entryN, first = true;
      while (pos.units.length < TURTLE_PARAMS.maxUnitsPerMarket && bar.high >= level) {
        const px = first ? Math.max(bar.open, level) : level; first = false;
        if (!buy(p, i, px, pos.entryN, notional, pos.path, date)) break; counts.adds++;
        level = px + TURTLE_PARAMS.addStepN * pos.entryN;
      }
      // V4.1 (review R4): the raised stop is re-checked on the add bar (pessimistic: low after the adds)
      if (positions.has(pos.id) && pos.units.at(-1).date === date && bar.low <= pos.stop) { sell(pos, pos.stop, date, 'STOP_2N_ADD_BAR'); counts.sameBarAddStops++; }
    }
    // 4) new entries: breakout trackers advance for every security with a bar today (filter state is causal)
    const candidates = [];
    for (const p of prepared) {
      const i = at(p, date); if (i < 1) continue;
      if (p.tracker) p.tracker.resolve(i);
      const before = p.tracker ? (p.tracker.isOpen() ? 'OPEN' : p.tracker.lastOutcome()) : null;
      if (p.tracker) p.tracker.start(i);
      if (positions.has(p.s.id) || p.N[i - 1] == null || !eligibleYesterday(p.b, i, universe)) continue;
      if (p.s.terminal && p.s.terminal.date <= date) { counts.terminalBarEntriesBlocked++; continue; }
      const bar = p.b[i], t = tickAdjusted(bar);
      let trigger = null, pathLabel = system;
      const hE = priorHigh(p.b, i, P.entry);
      if (hE !== null && bar.high >= hE + t) {
        if (P.filter && before !== null && before !== 'LOSER') { counts.skippedByFilter++; if (before === 'OPEN') counts.openBreakoutSkips++; const h55 = priorHigh(p.b, i, P.failsafe); if (h55 !== null && bar.high >= h55 + t) { trigger = h55 + t; pathLabel = 'FAILSAFE_55'; } }
        else trigger = hE + t;
      }
      if (trigger === null) continue;
      const k = i - 1 - TURTLE_PARAMS.rankLookback;
      const strength = k >= 0 ? (p.b[i - 1].close - p.b[k].close) / p.N[i - 1] : -Infinity;
      candidates.push({ p, i, trigger, pathLabel, strength });
    }
    candidates.sort((a, b) => b.strength - a.strength || (a.p.s.id < b.p.s.id ? -1 : 1));
    for (const c of candidates) {
      const bar = c.p.b[c.i], n = c.p.N[c.i - 1], price = Math.max(bar.open, c.trigger);
      signals.push({ id: c.p.s.id, date, path: c.pathLabel, trigger: c.trigger, fill: price, strength: c.strength });
      if (!buy(c.p, c.i, price, n, notional, c.pathLabel, date)) continue;
      counts.entries++; if (c.pathLabel === 'FAILSAFE_55') counts.failsafeEntries++;
      const pos = positions.get(c.p.s.id);
      // pessimistic same-bar stop on the entry day; otherwise same-day adds (fast market)
      if (bar.low <= pos.stop) { sell(pos, pos.stop, date, 'STOP_2N_ENTRY_BAR'); counts.sameBarStops++; continue; }
      let level = price + TURTLE_PARAMS.addStepN * n;
      while (pos.units.length < TURTLE_PARAMS.maxUnitsPerMarket && bar.high >= level) { if (!buy(c.p, c.i, level, n, notional, pos.path, date)) break; counts.adds++; level += TURTLE_PARAMS.addStepN * n; }
      if (pos.units.length > 1 && bar.low <= pos.stop) { sell(pos, pos.stop, date, 'STOP_2N_ADD_BAR'); counts.sameBarAddStops++; }
    }
    // 5) mark to close
    for (const p of prepared) { const i = at(p, date); if (i >= 0) lastClose.set(p.s.id, p.b[i].close); }
    const mv = [...positions.values()].reduce((a, pos) => a + pos.shares * (lastClose.get(pos.id) ?? pos.units.at(-1).fill), 0);
    curve.push({ date, equity: cash + mv, exposure: (cash + mv) > 0 ? mv / (cash + mv) : 0, n: positions.size, units: unitsLong() });
    if (cash < -1e-6) throw new Error('TURTLE_NEGATIVE_CASH');
  }
  // reconciliation identity: equity = initial + realized + open unrealized + dividends(open)
  const realized = trades.reduce((a, t) => a + t.pnl, 0), open = [...positions.values()].reduce((a, pos) => a + pos.shares * (lastClose.get(pos.id) ?? 0) + pos.dividends - pos.cost, 0);
  const expected = initialCapital + realized + open, actual = curve.at(-1)?.equity ?? initialCapital;
  const filterCounts = prepared.reduce((acc, p) => { for (const [k, v] of Object.entries(p.tracker?.counts ?? {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
  return { version: TURTLE_SOURCE_VERSION, system, initialCapital, curve, trades, signals, counts, filterCounts, ledger, openPositions: positions.size,
    reconciliation: { expected, actual, absoluteDifference: Math.abs(expected - actual), pass: Math.abs(expected - actual) <= 1e-6 + 1e-12 * (initialCapital + trades.reduce((a, t) => a + t.cost + t.proceeds, 0)) } };
}
