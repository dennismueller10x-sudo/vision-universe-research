// Synthetic canonical dataset for V4 calibration tests. No provider data; deterministic PRNG.
export function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

export function weekdays(from, to) {
  const out = []; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); }
  return out;
}

export function makeBars(dates, rnd, { start = 50, drift = 0.0003, vol = 0.02, beta = 1, market = null, dividendEvery = 63, dividendYield = 0.005 } = {}) {
  const bars = []; let close = start, tr = 1;
  dates.forEach((date, i) => {
    const m = market ? market[i] : 0, e = (rnd() - 0.5) * 2 * vol * Math.sqrt(3);
    const prev = close; close = Math.max(0.5, prev * (1 + drift + beta * m + e));
    const dividend = dividendEvery && i && i % dividendEvery === 0 ? close * dividendYield : 0;
    if (i) tr *= (close + dividend) / prev;
    const open = prev * (1 + (rnd() - 0.5) * 0.004), high = Math.max(open, close) * 1.005, low = Math.min(open, close) * 0.995;
    bars.push({ date, open, high, low, close, volume: 1e6, rawOpen: open, rawHigh: high, rawLow: low, rawClose: close, rawVolume: 1e6, dividend, splitFactor: 1, totalReturnIndex: tr, splitAdjustmentFactor: 1 });
  });
  return bars;
}

export function syntheticData({ n = 220, seed = 7, from = '2015-01-02', to = '2026-09-30' } = {}) {
  const rnd = prng(seed), calendar = weekdays(from, to), market = calendar.map(() => (rnd() - 0.5) * 0.02);
  const benchmark = { bars: makeBars(calendar, prng(seed + 1), { vol: 0.0001, market, dividendEvery: 0 }) };
  const securities = [];
  for (let k = 0; k < n; k++) {
    const ex = k % 2 ? 'NASDAQ' : 'NYSE', ticker = `T${String(k).padStart(3, '0')}`;
    const vol = 0.005 + 0.03 * (k % 10) / 10, drift = 0.0006 * ((k % 7) - 3) / 3;
    const bars = makeBars(calendar, prng(seed + 100 + k), { start: 20 + k, vol, drift, market });
    securities.push({ id: `tiingo:${ex}:${ticker}:2014-01-02`, ticker, listing: { id: `tiingo:${ex}:${ticker}:2014-01-02`, startDate: '2014-01-02', endDate: null, active: true, reusedLater: false, instrumentType: 'EQUITY_COMMON' }, bars, terminal: null, dataQuarantine: null });
  }
  return { calendar: calendar.filter((d) => d >= '2018-01-02'), benchmark, spyBars: benchmark.bars, securities, coverage: {}, fingerprint: 'synthetic' };
}

/** Oracle that equals the VU construction (identity oracle) for PASS-path tests. */
export function identityOracle(months) {
  return {
    EW_MARKET: months.map((m) => ({ month: m.month, ret: m.EW_MARKET.ret, firms: m.EW_MARKET.count })),
    MOM_12_2_EW_DECILES: months.map((m) => ({ month: m.month, buckets: m.MOM_12_2_EW_DECILES.buckets, firms: m.MOM_12_2_EW_DECILES.counts })),
    VAR_60D_EW_QUINTILES: months.map((m) => ({ month: m.month, buckets: m.VAR_60D_EW_QUINTILES.buckets, firms: m.VAR_60D_EW_QUINTILES.counts })),
  };
}
