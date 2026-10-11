/** Isolated, preregistered daily VU adaptation. Never an original-method replication. */
const sourceUrl = 'https://qullamaggie.com/my-3-timeless-setups-that-have-made-me-tens-of-millions/';
const parameters = Object.freeze({ momentumSessions: [21, 63, 126], leaderFraction: 0.02,
  baseSessions: 20, impulseSessions: 63, minimumImpulse: 0.30, maximumBaseWidth: 0.15,
  tighteningSessions: 5, maximumRangeRatio: 0.8, averageSessions: 10, trendSessions: 20,
  slopeSessions: 5, atrSessions: 20, partialAfterSessions: 4, sellFraction: 1 / 3,
  riskFraction: 0.005, maxWeight: 0.1, maxPositions: 10, maxExposure: 1 });
Object.freeze(parameters.momentumSessions);
const vu = 'Explicit frozen VU tournament specification, not attributed to trader';
const rule = (id, classification, description, source = vu) => Object.freeze({ id, classification, description, source });
const rules = Object.freeze([
  rule('KK-S-LEADER', 'SOURCE_PRINCIPLE', 'Recent 1/3/6-month leaders, prior impulse, orderly tighter consolidation, then breakout.', sourceUrl + ' Breakouts'),
  rule('KK-S-DAILY', 'SOURCE_DEFINED_OPTION', 'Author expressly permits daily-chart entry instead of an intraday chart.', sourceUrl + ' How do you trade this setup? item2'),
  rule('KK-S-STOP', 'SOURCE_PRINCIPLE', 'Day-low stop and distance bounded by ATR or ADR; source intraday behavior is not reproduced.', sourceUrl + ' item3'),
  rule('KK-S-SELL', 'SOURCE_DEFINED_RANGE', 'Sell 1/3–1/2 after3–5days, move stop to breakeven and trail remainder with10/20-day close.', sourceUrl + ' item4'),
  rule('KK-S-RISK', 'SOURCE_DEFINED_RANGE', 'Most trade risk0.25–1%, most positions10–20%; smaller-account era differs.', sourceUrl + ' Position sizing and risk'),
  rule('KK-V-LEADER', 'VU_FORMALIZATION', 'Prior completed21/63/126-session close returns; topceil(2%*eligible cross-section) on any window, positive return; ties by security id.'),
  rule('KK-V-BASE', 'VU_FORMALIZATION', 'Prior20-session high/low width<=15%; last5 mean daily ranges<=0.8*first5; last5 minimum low>first5 minimum low; prior MA10 rising over5 sessions, last prior close>=MA20.'),
  rule('KK-V-IMPULSE', 'VU_FORMALIZATION', 'The63-session close return ending immediately before the20-session base must be>=30%.'),
  rule('KK-V-EXECUTION', 'VU_FORMALIZATION', 'Signal close strictly above prior base high; next-session open only. Initial stop is known SIGNAL-day low, never future execution-day low. Reject actual fill<=stop or fill-stop>prior ATR20.'),
  rule('KK-V-ATR', 'VU_FORMALIZATION', 'Simple mean of prior20 true ranges, excluding signal day; choose ATR instead of ADR.'),
  rule('KK-V-SELL', 'VU_FORMALIZATION', 'Partial after heldSessions>=4: sell1/3 at next open; executor then marks partialDone and raises stop to entryPrice. After successful partial, close below SMA10 triggers next-open full exit. Known-stop close exit takes precedence.'),
  rule('KK-V-PORTFOLIO', 'VU_FORMALIZATION', '0.5% planned trade risk, entry10% weight cap, ten positions,100% total, unlevered long only; actual fill risk sizing uses fixed known stop. Hold current weights; no hidden market filter, pyramiding or anticipation.'),
]);
const portfolioSemantics = Object.freeze({ rebalance: 'DAILY', mode: 'STATEFUL_DAILY',
  targetWeightScope: 'STATEFUL', execution: 'NEXT_SESSION_OPEN', maxPositions: 10,
  maxWeight: 0.1, maxWeightAppliesAt: 'ENTRY_ONLY', maxExposure: 1, leverage: false,
  shorts: false, rebalancing: 'HOLD_CURRENT_WEIGHTS_UNTIL_EXIT_OR_PARTIAL',
  stopExecution: 'CLOSE_SIGNAL_NEXT_OPEN', marketFilter: 'NONE',
  partialStateUpdate: 'ONLY_AFTER_SUCCESSFUL_EXECUTION', tieBreak: 'SCORE_DESC_SECURITY_ID_ASC',
  initialStopBasis: 'KNOWN_SIGNAL_DAY_LOW', entryFillValidation: 'validateKullamagiEntryFill',
  provenance: 'VU_FORMALIZATION' });

export const kullamagiMethods = [{ id: 'KULLAMAGI_DAILY_ADAPTATION', version: '1.0.0',
  name: 'VU Daily Momentum Consolidation — Kullamägi inspired', family: 'Momentum / Breakout',
  fidelity: 'VU_ADAPTATION', replicationClaimAllowed: false, confidence: 'MEDIUM',
  parameters, params: parameters, rules, provenance: rules,
  sources: [{ url: sourceUrl, author: 'Kristjan Kullamägi', era: 'January/April2021 public article',
    accessStatus: 'PRIMARY_BODY_INSPECTED', accessedDate: '2026-10-11' }],
  execution: 'NEXT_SESSION_OPEN', portfolioSemantics, portfolioPolicy: portfolioSemantics,
  missingSourceComponents: ['Subjective visual setup selection', 'Intraday ORH and day-low stop execution',
    'Choice among exit and sizing ranges', 'Original portfolio leverage and personal account verification'],
  validateEntryFill: validateKullamagiEntryFill, evaluate: evaluateKullamagi }];

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const high = bs => Math.max(...bs.map(b => b.high));
const low = bs => Math.min(...bs.map(b => b.low));
const sma = (bs, n, offset = 0) => mean(bs.slice(bs.length - n - offset, bs.length - offset).map(b => b.close));
const idCompare = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
function knownBars(bars, asOf) {
  if (!Array.isArray(bars) || bars.some(b => typeof b?.date !== 'string')) throw Error('Dated price history required');
  const known = bars.filter(b => b.date <= asOf); // Future values never affect validation or decisions.
  for (let i = 0; i < known.length; i++) {
    const b = known[i];
    if (!validDate(b.date) || (i && known[i - 1].date >= b.date)) throw Error('Price dates must be valid, unique and ordered');
    if (![b.close, b.high, b.low, b.volume].every(Number.isFinite) || b.low <= 0 || b.high < b.low
      || b.close < b.low || b.close > b.high || b.volume < 0) throw Error('Invalid OHLCV');
  }
  if (!known.length || known.at(-1).date !== asOf) throw Error('Missing closed signal-date bar');
  return known;
}
function atr20(prior) {
  const last = prior.slice(-20);
  const start = prior.length - last.length;
  return mean(last.map((b, i) => Math.max(b.high - b.low,
    Math.abs(b.high - prior[start + i - 1].close), Math.abs(b.low - prior[start + i - 1].close))));
}
/** Executor must call at actual next-open fill; never infer its intraday low. */
export function validateKullamagiEntryFill(signal, executionPrice) {
  const stopLevel = signal?.stopLevel, distance = executionPrice - stopLevel;
  if (!Number.isFinite(executionPrice) || executionPrice <= 0 || !Number.isFinite(stopLevel) || stopLevel <= 0
    || distance <= 0 || !Number.isFinite(signal?.maxInitialStopDistance) || distance > signal.maxInitialStopDistance) {
    return { accepted: false, reason: 'INVALID_FILL_OR_STOP_DISTANCE' };
  }
  return { accepted: true, stopLevel, initialStopDistance: distance,
    maximumEntryWeight: Math.min(parameters.maxWeight, parameters.riskFraction * executionPrice / distance) };
}

export function evaluateKullamagi(context) {
  try {
    if (!validDate(context?.asOf) || !Array.isArray(context.securities)) throw Error('Valid asOf and securities required');
    if (context.positions != null && !Array.isArray(context.positions)) throw Error('Positions must be an array');
    const positions = new Map();
    for (const p of context.positions ?? []) {
      if (p?.id == null || !Number.isFinite(p.weight) || p.weight < 0 || positions.has(String(p.id))) throw Error('Invalid or duplicate position');
      if (!p.weight) continue;
      if (!(p.entryPrice > 0 && Number.isFinite(p.entryPrice) && p.stop > 0 && Number.isFinite(p.stop))
        || !Number.isInteger(p.heldSessions) || p.heldSessions < 0 || typeof p.partialDone !== 'boolean') throw Error('Held position requires known stop, fill price and partial state');
      positions.set(String(p.id), { ...p, id: String(p.id) });
    }
    if (positions.size > parameters.maxPositions || [...positions.values()].reduce((a, p) => a + p.weight, 0) > 1 + 1e-12) throw Error('Held portfolio violates cash or position cap');
    const seen = new Set();
    const securities = context.securities.map(s => {
      if (s?.id == null || !s.ticker || seen.has(String(s.id))) throw Error('Unique security ids/tickers required');
      const id = String(s.id); seen.add(id);
      const bars = knownBars(s.bars, context.asOf), prior = bars.slice(0, -1);
      const returns = prior.length >= 127 ? parameters.momentumSessions.map(n => prior.at(-1).close / prior.at(-1 - n).close - 1) : null;
      return { id, ticker: s.ticker, bars, prior, returns, leader: false };
    }).sort(idCompare);
    for (const id of positions.keys()) if (!seen.has(id)) throw Error('Held security history missing');
    const ranked = securities.filter(s => s.returns);
    for (let window = 0; window < 3; window++) {
      const order = [...ranked].sort((a, b) => b.returns[window] - a.returns[window] || idCompare(a, b));
      for (const s of order.slice(0, Math.ceil(order.length * parameters.leaderFraction))) if (s.returns[window] > 0) s.leader = true;
    }
    const targets = [], signals = [], ruleTrace = [], candidates = [];
    for (const s of securities) {
      const latest = s.bars.at(-1), p = positions.get(s.id), trace = { id: s.id, date: context.asOf,
        observedClose: latest.close, ruleIds: rules.map(r => r.id), momentumReturns: s.returns, leader: s.leader };
      if (p) {
        if (s.bars.length < 10) throw Error('Held security needs10 closed bars for trailing policy');
        const average10 = sma(s.bars, 10), stop = p.partialDone ? Math.max(p.stop, p.entryPrice) : p.stop;
        const reason = latest.close < stop ? 'KNOWN_STOP_CLOSE' : p.partialDone && latest.close < average10 ? 'MA10_CLOSE' : null;
        Object.assign(trace, { knownStop: stop, average10, heldSessions: p.heldSessions, partialDone: p.partialDone });
        if (reason) {
          trace.decision = 'EXIT'; signals.push({ id: s.id, ticker: s.ticker, action: 'EXIT', reason, execution: 'NEXT_SESSION_OPEN' });
        } else if (!p.partialDone && p.heldSessions >= parameters.partialAfterSessions) {
          trace.decision = 'PARTIAL';
          const metadata = { sellFraction: parameters.sellFraction, moveStopToBreakEven: true,
            stopAfterSuccessfulPartial: Math.max(p.stop, p.entryPrice), partialDoneAfterSuccessfulExecution: true };
          targets.push({ id: s.id, ticker: s.ticker, weight: p.weight * (1 - parameters.sellFraction), score: 0, ruleTrace: trace, stopLevel: stop, ...metadata });
          signals.push({ id: s.id, ticker: s.ticker, action: 'PARTIAL', reason: 'VU_FOUR_HELD_SESSIONS', execution: 'NEXT_SESSION_OPEN', ...metadata });
        } else {
          trace.decision = 'HOLD'; targets.push({ id: s.id, ticker: s.ticker, weight: p.weight, score: 0, ruleTrace: trace, stopLevel: stop });
        }
      } else if (!s.returns) trace.decision = 'INSUFFICIENT_ENTRY_HISTORY';
      else {
        const base = s.prior.slice(-20), first = base.slice(0, 5), last = base.slice(-5);
        const baseHigh = high(base), baseWidth = baseHigh / low(base) - 1;
        const firstRange = mean(first.map(b => b.high - b.low)), lastRange = mean(last.map(b => b.high - b.low));
        const impulse = s.prior.at(-21).close / s.prior.at(-84).close - 1;
        const trend = sma(s.prior, 10) > sma(s.prior, 10, 5) && s.prior.at(-1).close >= sma(s.prior, 20);
        const atr = atr20(s.prior), stopLevel = latest.low, distance = latest.close - stopLevel;
        Object.assign(trace, { baseHigh, baseWidth, firstRange, lastRange, impulse, trend, preSignalATR20: atr, signalDayLow: stopLevel });
        if (s.leader && impulse >= 0.30 && baseWidth <= 0.15 && firstRange > 0 && lastRange <= firstRange * 0.8
          && low(last) > low(first) && trend && latest.close > baseHigh && distance > 0 && distance <= atr) {
          trace.decision = 'ENTRY_CANDIDATE';
          const score = Math.max(...s.returns);
          candidates.push({ id: s.id, ticker: s.ticker, weight: Math.min(0.1, 0.005 * latest.close / distance),
            score, stopLevel, initialStopDistance: distance, maxInitialStopDistance: atr,
            minExecutionPriceExclusive: stopLevel, stopBasis: 'KNOWN_SIGNAL_DAY_LOW',
            riskFraction: 0.005, maxEntryWeight: 0.1, execution: 'NEXT_SESSION_OPEN',
            requiresEntryFillValidation: true, ruleTrace: trace });
        } else trace.decision = 'NO_ENTRY';
      }
      ruleTrace.push(trace);
    }
    let exposure = targets.reduce((sum, p) => sum + p.weight, 0);
    for (const c of candidates.sort((a, b) => b.score - a.score || idCompare(a, b))) {
      const room = Math.max(0, 1 - exposure);
      if (targets.length >= 10 || room <= 1e-12) {
        c.ruleTrace.decision = 'REJECT_PORTFOLIO_CAP'; signals.push({ id: c.id, ticker: c.ticker, action: 'REJECT', reason: 'VU_PORTFOLIO_CAP' });
      } else {
        c.weight = Math.min(c.weight, room); c.ruleTrace.decision = 'ENTER'; targets.push(c);
        signals.push({ ...c, action: 'ENTER', reason: 'VU_DAILY_CONSOLIDATION_BREAKOUT' }); exposure += c.weight;
      }
    }
    targets.sort(idCompare);
    return { methodId: kullamagiMethods[0].id, status: 'READY', asOf: context.asOf, targets, signals, ruleTrace,
      state: { execution: 'NEXT_SESSION_OPEN', futureExecutionBarRead: false, portfolioStateOwnedByExecutor: true } };
  } catch (error) {
    return { methodId: 'KULLAMAGI_DAILY_ADAPTATION', status: 'DATA_GAP', asOf: context?.asOf ?? null,
      targets: [], signals: [], ruleTrace: [{ status: 'DATA_GAP', reason: error.message }], state: null };
  }
}
