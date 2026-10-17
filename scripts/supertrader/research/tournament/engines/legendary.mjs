/** Research-only daily-close equity adaptations. No live registry or shared sizing defaults. */
const TURTLE_SOURCE = 'https://www.tradingblox.com/originalturtles/originalturtlerules.pdf';
const WEINSTEIN_SOURCE = 'https://thepatternsite.com/TradingWeinstein.html';
const WEINSTEIN_STOPS = 'https://thepatternsite.com/WeinsteinStops.html';
const TURTLE_CANONICAL = 'scripts/supertrader/fidelity/canonical/turtle.json';
const WEINSTEIN_CANONICAL = 'scripts/supertrader/fidelity/canonical/weinstein.json';
const rule = (id, classification, description, source) => ({ id, classification, description, source });
const policy = () => ({ mode: 'STATEFUL_DAILY', execution: 'NEXT_SESSION_OPEN', maxPositions: 10, maxWeight: 0.1, maxWeightAppliesAt: 'ENTRY_ONLY', maxExposure: 1, leverage: false, shorts: false, rebalancing: 'HOLD_CURRENT_WEIGHTS_UNTIL_EXIT', tieBreak: 'SECURITY_ID_ASCENDING', provenance: 'VU_FORMALIZATION' });

export const LEGENDARY_METHODS = [
  {
    id: 'TURTLE_S2_EQUITY_DAILY', name: 'Turtle S2 inspired equity daily adaptation', family: 'Trend Following',
    fidelity: 'VU_ADAPTATION', replicationClaimAllowed: false, confidence: 'MEDIUM', execution: 'NEXT_SESSION_OPEN',
    portfolioPolicy: policy(), portfolioSemantics: policy(),
    params: { entrySessions: 55, exitSessions: 20, nSessions: 20, riskUnitFraction: 0.01, initialStopN: 2, maxPositions: 10, maxWeight: 0.1, maxExposure: 1 },
    sourceEra: '1983–1988 original futures program; publicly documented original rules 2003; research daily equity adaptation',
    provenance: [
      rule('TUR-F-S2-ENTRY', 'SOURCE_DEFINED', '55 prior-session highest high; source takes intraday price break, this engine evaluates closing price strictly above prior high.', `${TURTLE_SOURCE} printed p.19; ${TURTLE_CANONICAL}`),
      rule('TUR-F-EXIT-S2', 'SOURCE_DEFINED', '20 prior-session lowest low exit-channel concept.', `${TURTLE_SOURCE} printed p.26; ${TURTLE_CANONICAL}`),
      rule('TUR-F-N-01', 'SOURCE_DEFINED', 'N20 seeds with 20 true ranges then updates (19*N+TR)/20.', `${TURTLE_SOURCE} printed pp.12–13; ${TURTLE_CANONICAL}`),
      rule('TUR-F-UNIT-01', 'SOURCE_DEFINED', 'One source unit risks 1% equity for a 1N move: share unit = 0.01*equity/N.', `${TURTLE_SOURCE} printed pp.14–15; ${TURTLE_CANONICAL}`),
      rule('TUR-F-STOP-2N', 'SOURCE_DEFINED', 'Initial stop concept is actual execution fill minus 2 pre-signal N, not a future-day low.', `${TURTLE_SOURCE} printed pp.21–22; ${TURTLE_CANONICAL}`),
      rule('TUR-E-DAILY', 'VU_FORMALIZATION', 'Closed daily signals execute at next session open; stop only closes below known level, no intraday orders.', 'Tournament protocol / explicit adaptation'),
      rule('TUR-E-SIZE', 'VU_FORMALIZATION', 'Use prior-day N daily and signal-close reference price for planned weight; cap each ticker at 10%, maximum ten, cash-only. Actual fill may change realized initial risk.', 'Tournament protocol / explicit adaptation'),
      rule('TUR-E-PORT', 'VU_FORMALIZATION', 'Long-only equities; one unit with no pyramid, no correlated-market limits, no annual notional-account drawdown haircut; deterministic security-id ordering.', 'Tournament protocol / explicit adaptation'),
    ],
    missingSourceComponents: ['Original futures asset universe and both directions', 'Intraday channel execution', 'Half-N pyramiding up to four units', 'Weekly sizing sheet', 'Correlated-market unit limits', 'Dennis discretionary notional capital and drawdown cuts', 'Source strength selection when signals compete'],
    evaluate: evaluateTurtle,
  },
  {
    id: 'WEINSTEIN_STAGE_DAILY', name: 'Weinstein inspired daily stage adaptation', family: 'Stage Analysis',
    fidelity: 'VU_ADAPTATION', replicationClaimAllowed: false, confidence: 'LOW', execution: 'NEXT_SESSION_OPEN',
    portfolioPolicy: policy(), portfolioSemantics: policy(),
    params: { averageSessions: 150, slopeSessions: 20, entrySessions: 50, maxBaseWidth: 0.3, volumeSessions: 20, volumeMultiple: 1.5, relativeStrengthSessions: 63, stopBuffer: 0.01, fixedWeight: 0.1, maxPositions: 10, maxWeight: 0.1, maxExposure: 1 },
    sourceEra: '1988 stage-analysis investor concepts; public secondary book excerpts; research daily equity adaptation',
    provenance: [
      rule('WEI-C-ST-01', 'SOURCE_PRINCIPLE_SECONDARY', 'Stage 2 means price above a rising 30-week average; avoid buying below a falling average.', `${WEINSTEIN_SOURCE}; ${WEINSTEIN_CANONICAL}`),
      rule('WEI-C-ENTRY-01', 'SOURCE_PRINCIPLE_SECONDARY', 'Resistance break supported by volume and relative strength; market direction matters.', `${WEINSTEIN_SOURCE}; ${WEINSTEIN_CANONICAL}`),
      rule('WEI-C-STOP-01', 'SOURCE_PRINCIPLE_SECONDARY', 'Source chart-dependent support stops are not a fixed universal percent or basis low.', `${WEINSTEIN_STOPS}; ${WEINSTEIN_CANONICAL}`),
      rule('WEI-E-STAGE', 'VU_FORMALIZATION', '150-session daily SMA substitutes 30 weeks; rising means current SMA above SMA20 sessions earlier, for stock and supplied market.', 'Tournament protocol / explicit adaptation'),
      rule('WEI-E-ENTRY', 'VU_FORMALIZATION', 'Close strictly above prior50-session high; prior-base width <=30%; signal-day volume >=1.5*prior20 average.', 'Tournament protocol / explicit adaptation'),
      rule('WEI-E-RS', 'VU_FORMALIZATION', 'Stock63-session close-price return exceeds same-date market return; this is not source Mansfield RS.', 'Tournament protocol / explicit adaptation'),
      rule('WEI-E-STOP', 'VU_FORMALIZATION', 'Initial stop level 1% below prior50-session lowest low; close below known stop or daily SMA150 triggers next-open exit; no trailing swing logic.', 'Tournament protocol / explicit adaptation'),
      rule('WEI-E-PORT', 'VU_FORMALIZATION', 'Fixed10% each, maximum ten, cash-only, no short side, half-position pullback or industry selection; deterministic security-id ordering.', 'Tournament protocol / explicit adaptation'),
    ],
    missingSourceComponents: ['Own book text not inspected in canonical audit', 'Completed-week source calculations', 'Mansfield RS and 52-week average', 'Source market breadth and strongest-industry selection', 'Half-position plus pullback', 'Chart-defined swing stops and trailing stops', 'Source portfolio sizing policy'],
    evaluate: evaluateWeinstein,
  },
];

function invalid(message, definition, asOf = null) {
  return { methodId: definition.id, status: 'DATA_GAP', asOf, targets: [], signals: [], ruleTrace: [{ status: 'DATA_GAP', reason: message }], state: null };
}
function positionMap(input) {
  const result = new Map();
  const positions = Array.isArray(input) ? input : input && typeof input === 'object' ? Object.entries(input).map(([id,p]) => ({ ...p, id: p.id ?? id })) : [];
  for (const p of positions) {
    if (!p || p.id == null || !Number.isFinite(p.weight) || p.weight < 0 || result.has(String(p.id))) throw Error('Invalid or duplicate position');
    if (p.weight > 0) {
      if (!Number.isFinite(p.stop) || p.stop <= 0) throw Error('Held position requires actual fill-based known stop');
      result.set(String(p.id), { ...p, id: String(p.id) });
    }
  }
  return result;
}
// Pure bounded memoization of immutable ISO date strings; trading rules are unchanged.
const dateValidityCache = new Map();
const DATE_VALIDITY_CACHE_LIMIT = 4096;
function dateValid(date) {
  // Preserve the original false/throw behavior for non-ISO inputs and invalid dates.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return uncachedDateValid(date);
  if (dateValidityCache.has(date)) return dateValidityCache.get(date);
  const valid = uncachedDateValid(date); // Original exceptions propagate; never cache a thrown result.
  if (dateValidityCache.size >= DATE_VALIDITY_CACHE_LIMIT) dateValidityCache.delete(dateValidityCache.keys().next().value);
  dateValidityCache.set(date, valid);
  return valid;
}
function uncachedDateValid(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0,10) === s; }
function history(rows, asOf, requireOHLCV = true) {
  if (!Array.isArray(rows)) throw Error('Missing price history');
  if (rows.some(b => typeof b?.date !== 'string')) throw Error('Undated bars cannot be assigned point-in-time');
  // Filter before validation: future rows cannot change either decisions or data-gap status.
  const known = rows.filter(b => typeof b?.date === 'string' && b.date <= asOf);
  for (let i = 0; i < known.length; i++) {
    const b = known[i];
    if (!dateValid(b.date) || (i && known[i - 1].date >= b.date)) throw Error('Price dates must be valid, unique and ordered');
    if (!Number.isFinite(b.close) || b.close <= 0) throw Error('Missing or nonpositive close');
    if (requireOHLCV && (!Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(b.volume) || b.low <= 0 || b.high < b.low || b.close > b.high || b.close < b.low || b.volume < 0)) throw Error('Missing or incoherent OHLCV');
  }
  if (!known.length || known.at(-1).date !== asOf) throw Error('Missing closed bar on asOf date');
  return known;
}
function prepare(context, definition) {
  if (!context || !dateValid(context.asOf) || !Array.isArray(context.securities)) throw Error('Valid asOf and securities required');
  const positions = positionMap(context.positions);
  const seen = new Set();
  const securities = context.securities.map(s => {
    if (s.id == null || !s.ticker || seen.has(String(s.id))) throw Error('Unique security IDs and tickers required');
    const id = String(s.id); seen.add(id);
    try { return { id, ticker: s.ticker, bars: history(s.bars, context.asOf), preSignalN: s.preSignalN }; }
    catch (error) {
      if (positions.has(id)) throw error;
      return { id, ticker: s.ticker, bars: [], dataGap: error.message };
    }
  }).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const id of positions.keys()) if (!seen.has(id)) throw Error('Held security price history unavailable');
  if (positions.size > definition.portfolioPolicy.maxPositions || [...positions.values()].reduce((a,p) => a + p.weight,0) > 1 + 1e-12) throw Error('Existing holdings violate cash/position policy');
  return { securities, positions };
}
const mean = values => values.reduce((a,b) => a+b, 0) / values.length;
const max = rows => Math.max(...rows.map(b => b.high));
const min = rows => Math.min(...rows.map(b => b.low));
const sma = (rows, n, offset = 0) => mean(rows.slice(rows.length - offset - n, rows.length - offset).map(b => b.close));

/** Full chronological prefix recurrence; never reseed N on a sliding history window. */
export function turtleNSeries(rows) {
  const series = Array(rows.length).fill(null);
  const trs = rows.map((b,i) => Math.max(b.high - b.low, i ? Math.abs(b.high - rows[i-1].close) : 0, i ? Math.abs(b.low - rows[i-1].close) : 0));
  if (rows.length < 20) return series;
  series[19] = mean(trs.slice(0,20));
  for (let i = 20; i < rows.length; i++) series[i] = (19*series[i-1] + trs[i])/20;
  return series;
}
export function turtleN(rows) { return turtleNSeries(rows).at(-1) ?? null; }
function certifiedPreSignalN(s, priorDate) {
  if (s.preSignalN == null) return null;
  const certificate = s.preSignalN;
  if (typeof certificate !== 'object' || certificate.method !== 'TURTLE_N20_FULL_PREFIX' || certificate.asOf !== priorDate || !Number.isFinite(certificate.value) || certificate.value <= 0) {
    throw Error('INVALID_TURTLE_FULL_PREFIX_N_CERTIFICATE');
  }
  return certificate.value;
}

function finish(context, definition, holdings, candidates, signals, traces) {
  const targets = [...holdings];
  let exposure = targets.reduce((s,t) => s+t.weight, 0);
  for (const c of candidates) {
    const room = Math.max(0, definition.portfolioPolicy.maxExposure - exposure);
    if (targets.length >= definition.portfolioPolicy.maxPositions || room <= 1e-12) {
      signals.push({ id: c.id, ticker: c.ticker, action: 'REJECT', reason: 'VU_PORTFOLIO_CAP' });
      continue;
    }
    const weight = Math.min(c.weight, room);
    if (weight <= 0) continue;
    targets.push({ ...c.targetMetadata, id: c.id, ticker: c.ticker, weight });
    signals.push({ ...c.signal, id: c.id, ticker: c.ticker, action: 'ENTER', weight });
    exposure += weight;
  }
  targets.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { methodId: definition.id, status: 'READY', asOf: context.asOf, targets, signals, ruleTrace: traces, state: { stopInitialization: 'EXECUTOR_AT_ACTUAL_FILL', execution: definition.execution } };
}

export function evaluateTurtle(context) {
  const definition = LEGENDARY_METHODS[0];
  try {
    const { securities, positions } = prepare(context, definition);
    const holdings = [], candidates = [], signals = [], traces = [];
    for (const s of securities) {
      if (s.dataGap || s.bars.length < 56) {
        const reason = s.dataGap ?? 'INSUFFICIENT_TURTLE_HISTORY';
        if (positions.has(s.id)) throw Error(`${reason}: held ${s.id}`);
        traces.push({ id:s.id, date:context.asOf, decision:'REJECT', reason });
        signals.push({ id:s.id, ticker:s.ticker, action:'REJECT', reason });
        continue;
      }
      const latest = s.bars.at(-1), prior = s.bars.slice(0,-1);
      let certifiedN;
      try { certifiedN = certifiedPreSignalN(s, prior.at(-1).date); }
      catch (error) {
        if (positions.has(s.id)) throw error;
        traces.push({ id:s.id, date:context.asOf, decision:'REJECT', reason:error.message });
        signals.push({ id:s.id, ticker:s.ticker, action:'REJECT', reason:error.message });
        continue;
      }
      const entryChannel = max(prior.slice(-55)), exitChannel = min(prior.slice(-20)), n = certifiedN ?? turtleN(prior);
      if (!(n > 0) || !Number.isFinite(n)) {
        if (positions.has(s.id)) throw Error(`Invalid Turtle N for held ${s.id}`);
        traces.push({ id:s.id, date:context.asOf, decision:'REJECT', reason:'INVALID_TURTLE_N' });
        signals.push({ id:s.id, ticker:s.ticker, action:'REJECT', reason:'INVALID_TURTLE_N' });
        continue;
      }
      const p = positions.get(s.id);
      const trace = { id: s.id, date: context.asOf, entryChannel, exitChannel, preSignalN: n, preSignalNSource: certifiedN == null ? 'SUPPLIED_KNOWN_HISTORY_PREFIX' : 'TURTLE_N20_FULL_PREFIX', observedClose: latest.close, ruleIds: ['TUR-F-S2-ENTRY','TUR-F-EXIT-S2','TUR-E-DAILY','TUR-E-SIZE'] };
      if (p) {
        const reason = latest.close < p.stop ? 'KNOWN_STOP_CLOSE' : latest.close < exitChannel ? 'CHANNEL_CLOSE' : null;
        trace.decision = reason ? 'EXIT' : 'HOLD'; trace.knownStop = p.stop;
        if (reason) signals.push({ id: s.id, ticker: s.ticker, action: 'EXIT', reason, knownStop: p.stop });
        else holdings.push({ id: s.id, ticker: s.ticker, weight: p.weight });
      } else if (latest.close > entryChannel) {
        trace.decision = 'ENTRY_CANDIDATE';
        const initialStopDistance = 2 * n;
        if (initialStopDistance >= latest.close) { trace.decision = 'REJECT_INVALID_STOP_DISTANCE'; }
        else candidates.push({ id: s.id, ticker: s.ticker, weight: Math.min(0.1, 0.01 * latest.close / n), targetMetadata: { initialStopDistance, initialRiskUnit: n }, signal: { observedClose: latest.close, initialStopDistance, initialRiskUnit: n, stopBasis: 'EXECUTION_FILL_MINUS_PRE_SIGNAL_DISTANCE', execution: definition.execution, reason: 'CLOSE_ABOVE_PRIOR55_HIGH' } });
      } else trace.decision = 'NO_ENTRY';
      traces.push(trace);
    }
    return finish(context, definition, holdings, candidates, signals, traces);
  } catch (error) { return invalid(error.message, definition, context?.asOf); }
}

export function evaluateWeinstein(context) {
  const definition = LEGENDARY_METHODS[1];
  try {
    const { securities, positions } = prepare(context, definition);
    const market = history(context.market?.bars, context.asOf, false);
    if (market.length < 170) throw Error('Insufficient market stage history');
    const marketUp = market.at(-1).close > sma(market,150) && sma(market,150) > sma(market,150,20);
    const marketDates = new Map(market.map(b => [b.date, b.close]));
    const holdings = [], candidates = [], signals = [], traces = [];
    for (const s of securities) {
      if (s.dataGap || s.bars.length < 170) {
        const reason = s.dataGap ?? 'INSUFFICIENT_WEINSTEIN_HISTORY';
        if (positions.has(s.id)) throw Error(`${reason}: held ${s.id}`);
        traces.push({ id:s.id, date:context.asOf, decision:'REJECT', reason });
        signals.push({ id:s.id, ticker:s.ticker, action:'REJECT', reason });
        continue;
      }
      const latest = s.bars.at(-1), prior = s.bars.slice(0,-1), base = prior.slice(-50);
      const average = sma(s.bars,150), earlierAverage = sma(s.bars,150,20);
      const entryChannel = max(base), baseLow = min(base), baseWidth = entryChannel/baseLow - 1;
      const avgVolume = mean(prior.slice(-20).map(b => b.volume));
      const past = s.bars.at(-64), pastMarket = marketDates.get(past.date), presentMarket = marketDates.get(latest.date);
      if (!(pastMarket > 0 && presentMarket > 0)) {
        if (positions.has(s.id)) throw Error(`Missing aligned market history for held ${s.id}`);
        traces.push({ id:s.id, date:context.asOf, decision:'REJECT', reason:'MISSING_ALIGNED_MARKET_HISTORY' });
        signals.push({ id:s.id, ticker:s.ticker, action:'REJECT', reason:'MISSING_ALIGNED_MARKET_HISTORY' });
        continue;
      }
      const relativeStrength = latest.close/past.close - presentMarket/pastMarket;
      const p = positions.get(s.id);
      const trace = { id: s.id, date: context.asOf, average150: average, average150Prior20: earlierAverage, entryChannel, baseLow, baseWidth, priorVolume20: avgVolume, relativeStrength63: relativeStrength, marketUp, ruleIds: ['WEI-E-STAGE','WEI-E-ENTRY','WEI-E-RS','WEI-E-STOP','WEI-E-PORT'] };
      if (p) {
        const reason = latest.close < p.stop ? 'KNOWN_STOP_CLOSE' : latest.close < average ? 'VU_DAILY_AVERAGE_CLOSE' : null;
        trace.decision = reason ? 'EXIT' : 'HOLD'; trace.knownStop = p.stop;
        if (reason) signals.push({ id: s.id, ticker: s.ticker, action: 'EXIT', reason, knownStop: p.stop });
        else holdings.push({ id: s.id, ticker: s.ticker, weight: p.weight });
      } else if (marketUp && latest.close > average && average > earlierAverage && latest.close > entryChannel && baseWidth <= 0.3 && avgVolume > 0 && latest.volume >= 1.5*avgVolume && relativeStrength > 0) {
        trace.decision = 'ENTRY_CANDIDATE';
        const stopLevel = baseLow * 0.99;
        candidates.push({ id: s.id, ticker: s.ticker, weight: 0.1, targetMetadata: { stopLevel }, signal: { observedClose: latest.close, stopLevel, stopBasis: 'PRIOR_BASE_LOW_WITH_VU_BUFFER', execution: definition.execution, reason: 'VU_STAGE_BREAKOUT' } });
      } else trace.decision = 'NO_ENTRY';
      traces.push(trace);
    }
    return finish(context, definition, holdings, candidates, signals, traces);
  } catch (error) { return invalid(error.message, definition, context?.asOf); }
}

export const legendaryMethods = LEGENDARY_METHODS;
export function evaluateLegendary(methodId, context) {
  const method = LEGENDARY_METHODS.find(m => m.id === methodId);
  if (!method) throw Error(`Unknown legendary research method: ${methodId}`);
  return method.evaluate(context);
}
