/* EMA Cluster Intelligence. Backend-only; no consumer is registered automatically.
 * Contract and research conventions: docs/technical/EMA_CLUSTER.md.
 * Input: canonical split-adjusted, completed bars; EMA primitive: feature-store.js. */
(function (global) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const F = node ? require('./feature-store.js') : global.VUTechnical.Features;
  const H = node ? require('../hash.js') : global.VUHash;
  const VERSION = 'ema-cluster-1.0.0';
  const DEFAULTS = Object.freeze({
    fast: Object.freeze([3, 5, 8, 10, 12, 15]), slow: Object.freeze([30, 35, 40, 45, 50, 60]),
    slopeBars: 5, slopeFloor: 0.0001, compressionFast: 0.005, compressionSlow: 0.01,
    expansionRatio: 1.2, pullbackMaxBars: 20, stabilityBars: 20
  });
  const EVENTS = Object.freeze(['BULLISH_ARRANGEMENT', 'BEARISH_ARRANGEMENT', 'COMPRESSION', 'EXPANSION',
    'COMPRESSION_BREAKOUT_UP', 'COMPRESSION_BREAKOUT_DOWN', 'PULLBACK_FAST', 'PULLBACK_SLOW',
    'RESUME_UP', 'RESUME_DOWN', 'DOWN_TO_UP', 'UP_TO_DOWN']);
  function configuration(input = {}) {
    for (const k of Object.keys(input)) if (!(k in DEFAULTS)) throw new Error('UNKNOWN_CLUSTER_PARAMETER:' + k);
    const c = { ...DEFAULTS, ...input };
    for (const g of ['fast', 'slow']) {
      if (!Array.isArray(c[g]) || !c[g].length || c[g].some(p => !Number.isSafeInteger(p) || p < 2 || p > 1000) || new Set(c[g]).size !== c[g].length) throw new Error('INVALID_EMA_GROUP:' + g);
      c[g] = [...c[g]].sort((a, b) => a - b);
    }
    if (Math.max(...c.fast) >= Math.min(...c.slow)) throw new Error('EMA_GROUP_PERIODS_MUST_NOT_OVERLAP');
    for (const k of ['slopeBars', 'pullbackMaxBars', 'stabilityBars']) if (!Number.isSafeInteger(c[k]) || c[k] < 1) throw new Error('INVALID_CLUSTER_PARAMETER:' + k);
    for (const k of ['slopeFloor', 'compressionFast', 'compressionSlow']) if (!Number.isFinite(c[k]) || c[k] <= 0) throw new Error('INVALID_CLUSTER_PARAMETER:' + k);
    if (!Number.isFinite(c.expansionRatio) || c.expansionRatio <= 1) throw new Error('INVALID_CLUSTER_PARAMETER:expansionRatio');
    return c;
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  function calculate({ bars, asOf, timeframe = '1D', config = {} }) {
    if (!dateOK(asOf) || !['1D', '1W', '1M'].includes(timeframe) || !Array.isArray(bars)) throw new Error('INVALID_CLUSTER_INPUT');
    const c = configuration(config), configHash = H.hashValue(c), periods = [...c.fast, ...c.slow];
    // Truncate before inspecting or computing; future values cannot affect an earlier snapshot.
    const source = bars.filter(b => b.date <= asOf);
    let previousDate = '';
    source.forEach(b => {
      if (!dateOK(b.date) || b.date <= previousDate || !(Number.isFinite(b.close) && b.close > 0)) throw new Error('INVALID_CLUSTER_BAR');
      if (b.availableAt && (!Number.isFinite(Date.parse(b.availableAt)) || b.availableAt.slice(0, 10) < b.date || b.availableAt.slice(0, 10) > asOf)) throw new Error('CLUSTER_BAR_NOT_AVAILABLE');
      if (b.complete === false) throw new Error('INCOMPLETE_CLUSTER_BAR');
      if ((b.high !== undefined || b.low !== undefined) && !(Number.isFinite(b.high) && Number.isFinite(b.low) && b.low > 0 && b.low <= b.close && b.close <= b.high)) throw new Error('INVALID_CLUSTER_OHLC');
      previousDate = b.date;
    });
    const close = source.map(b => b.close);
    const emas = Object.fromEntries(periods.map(p => [p, F.settledEma(close, p).values]));
    const rows = [], events = []; let orderBars = 0, compressionBars = 0, lastTrend = null;
    let pending = { fast: null, slow: null };
    function group(ps, i) {
      const values = ps.map(p => emas[p][i]);
      if (!values.every(Number.isFinite)) return null;
      return { min: Math.min(...values), max: Math.max(...values), mean: mean(values), values };
    }
    for (let i = 0; i < source.length; i++) {
      const b = source[i], fast = group(c.fast, i), slow = group(c.slow, i), prev = rows.at(-1);
      if (!fast || !slow) {
        rows.push({ date: b.date, quality: 'WARMUP', trend: null, arrangement: null, dynamics: null, metrics: null });
        continue;
      }
      const earlierFast = group(c.fast, i - c.slopeBars), earlierSlow = group(c.slow, i - c.slopeBars);
      const fastSlope = earlierFast ? (fast.mean - earlierFast.mean) / b.close / c.slopeBars : null;
      const slowSlope = earlierSlow ? (slow.mean - earlierSlow.mean) / b.close / c.slopeBars : null;
      const fastWidth = (fast.max - fast.min) / b.close, slowWidth = (slow.max - slow.min) / b.close;
      const width = fastWidth + slowWidth, gap = (fast.mean - slow.mean) / b.close;
      const arrangement = fast.min > slow.max ? 'BULLISH' : fast.max < slow.min ? 'BEARISH' : 'OVERLAPPING';
      orderBars = prev?.arrangement === arrangement ? orderBars + 1 : 1;
      const compressed = fastWidth <= c.compressionFast && slowWidth <= c.compressionSlow;
      compressionBars = compressed ? compressionBars + 1 : 0;
      const earlier = rows[i - c.slopeBars]?.metrics;
      const widthChange = earlier ? width - earlier.width : null;
      const widthRatio = earlier?.width > 0 ? width / earlier.width : null;
      const dynamics = compressed ? 'COMPRESSION' : widthRatio !== null && widthRatio >= c.expansionRatio ? 'EXPANSION' : 'NEUTRAL';
      const trend = fastSlope === null || slowSlope === null ? null
        : arrangement === 'BULLISH' && fastSlope > c.slopeFloor && slowSlope > c.slopeFloor ? 'UP'
        : arrangement === 'BEARISH' && fastSlope < -c.slopeFloor && slowSlope < -c.slopeFloor ? 'DOWN'
        : compressed && Math.abs(fastSlope) <= c.slopeFloor && Math.abs(slowSlope) <= c.slopeFloor ? 'SIDEWAYS' : 'TRANSITION';
      const distance = g => b.close < g.min ? (b.close - g.min) / b.close : b.close > g.max ? (b.close - g.max) / b.close : 0;
      const metrics = { fastWidth, slowWidth, width, gap, fastSlope, slowSlope, widthChange, widthRatio,
        distanceFast: distance(fast), distanceSlow: distance(slow), orderBars, stability: Math.min(1, orderBars / c.stabilityBars), compressionBars,
        // Descriptive 0..1 index, never probability or expected return.
        strength: fastSlope === null || slowSlope === null ? null : Math.min(1, Math.abs(gap) / 0.03) * Math.min(1, Math.abs(slowSlope) / 0.002) * Math.min(1, orderBars / c.stabilityBars) };
      const row = { date: b.date, quality: trend === null ? 'WARMUP' : 'READY', trend, arrangement, dynamics, fast, slow, metrics };
      const emit = (type, direction = null, extra = {}) => events.push({ type, direction, date: b.date,
        // Use actual session availability when supplied. Otherwise day-end, conservatively.
        availableAt: b.availableAt || b.date + 'T23:59:59.999Z', timeframe, configHash, ...extra });
      if (row.quality === 'READY') {
        if ((prev?.quality !== 'READY' || arrangement !== prev.arrangement) && arrangement !== 'OVERLAPPING') emit(arrangement + '_ARRANGEMENT', arrangement === 'BULLISH' ? 'UP' : 'DOWN');
        if (compressed && prev?.dynamics !== 'COMPRESSION') emit('COMPRESSION');
        if (dynamics === 'EXPANSION' && prev?.dynamics !== 'EXPANSION') emit('EXPANSION', trend === 'UP' || trend === 'DOWN' ? trend : null);
        if (prev?.dynamics === 'COMPRESSION' && !compressed && ['UP', 'DOWN'].includes(trend)) emit('COMPRESSION_BREAKOUT_' + trend, trend, { compressionBars: prev.metrics.compressionBars });
        if (['UP', 'DOWN'].includes(trend)) {
          if (lastTrend && lastTrend !== trend) emit(lastTrend + '_TO_' + trend, trend);
          lastTrend = trend;
        }
        for (const name of ['fast', 'slow']) {
          let p = pending[name];
          if (p && (i - p.index > c.pullbackMaxBars || (p.direction === 'UP' ? arrangement === 'BEARISH' : arrangement === 'BULLISH'))) pending[name] = p = null;
          const g = row[name], touches = (b.low ?? b.close) <= g.max && (b.high ?? b.close) >= g.min;
          const direction = prev?.trend;
          if (!p && ['UP', 'DOWN'].includes(direction) && (direction === 'UP' ? arrangement !== 'BEARISH' : arrangement !== 'BULLISH') && touches && (direction === 'UP' ? prev.metrics['distance' + (name === 'fast' ? 'Fast' : 'Slow')] > 0 : prev.metrics['distance' + (name === 'fast' ? 'Fast' : 'Slow')] < 0)) {
            pending[name] = { index: i, direction, date: b.date };
            emit('PULLBACK_' + name.toUpperCase(), direction);
          } else if (p && i > p.index && (p.direction === 'UP' ? b.close > fast.max && fastSlope > 0 : b.close < fast.min && fastSlope < 0)) {
            emit('RESUME_' + p.direction, p.direction, { cluster: name, pullbackDate: p.date }); pending[name] = null;
          }
        }
      }
      rows.push(row);
    }
    return { schemaVersion: VERSION, config: c, configHash, timeframe, asOf, priceBasis: 'SPLIT_ADJUSTED_PRICE', rows, events };
  }
  const api = { VERSION, DEFAULTS, EVENTS, configuration, calculate };
  if (node) module.exports = api; else (global.VUTechnical = global.VUTechnical || {}).EmaCluster = api;
})(typeof window !== 'undefined' ? window : globalThis);
