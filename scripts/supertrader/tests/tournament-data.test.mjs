import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { prepareHistoricalData, featuresAtDate, scannerInputs, fundamentalRows, loadHistoricalData, loadRawHistoricalPayload, preserveRawBars, loadCurrentScannerInputs, privateDataConfigured } from '../research/tournament/data.mjs';
const TotalReturn = createRequire(import.meta.url)('../../../quant/engines/canonical-total-return.js');

const dates = ['2020-01-02', '2020-01-03', '2020-01-06'];
const bar = (date, price, extra = {}) => ({ date, open: price, high: price + 1, low: price - 1, close: price, volume: 100, dividend: 0, splitFactor: 1, ...extra });
function fixture({ delisted = false, raw, active = true, fund, listingExtra = {} } = {}) {
  const id = 'tiingo:NASDAQ:ABC:2010-01-01';
  return { listings: [{ id, ticker: 'ABC', exchange: 'NASDAQ', startDate: '2010-01-01', active, storeClass: 'EQUITY_COMMON', ...listingExtra }],
    segs: [{ id, cls: 'EQUITY_COMMON', delisted, raw: raw || dates.map((d, i) => bar(d, 100 + i)), fund }], calendar: dates };
}
const window = { warmupFrom: '2019-01-01', from: '2020-01-02', to: '2020-01-06' };

test('canonical split and dividend accounting; no future split changes historical absolute price', () => {
  const raw = [bar(dates[0], 100), bar(dates[1], 100), bar(dates[2], 50, { splitFactor: 2, dividend: 1 })];
  const data = prepareHistoricalData(fixture({ raw }), window);
  const sec = data.securities[0];
  assert.equal(sec.bars[0].close, 50);
  assert.ok(Math.abs(sec.bars[2].totalReturnIndex / sec.bars[1].totalReturnIndex - 1.02) < 1e-10);
  assert.equal(featuresAtDate(sec, dates[1]).bars[0].close, 100);
  assert.equal(featuresAtDate(sec, dates[1]).bars[0].volume, 100);
  assert.equal(featuresAtDate(sec, dates[1]).bars.length, 2);
  assert.equal(featuresAtDate(sec, dates[1]).bars[0].totalReturnIndex, 1);
  assert.equal(featuresAtDate(sec, dates[1]).bars[1].totalReturnIndex, 1);
});

test('missing corporate action fields fail closed instead of silently defaulting', () => {
  const raw = dates.map((d) => bar(d, 100)); delete raw[1].dividend;
  const data = prepareHistoricalData(fixture({ raw }), window);
  assert.equal(data.state, 'BLOCKED');
  assert.equal(data.coverage.rejected.DIVIDEND_FIELD_MISSING, 1);
});

test('unsorted bars and duplicate listing identities cannot be stitched silently', () => {
  assert.throws(() => prepareHistoricalData(fixture({ raw: [bar(dates[1], 100), bar(dates[0], 100)] }), window), /BARS_NOT_ORDERED/);
  const p = fixture(); p.listings.push(p.listings[0]);
  assert.throws(() => prepareHistoricalData(p, window), /DUPLICATE_LISTING_ID/);
});

test('series respect original listing lifetime and terminal remains an explicit unknown', () => {
  const data = prepareHistoricalData(fixture({ delisted: true, active: false, listingExtra: { listEnd: dates[1], reusedLater: true } }), window);
  assert.equal(data.securities[0].bars.length, 2);
  assert.equal(data.securities[0].terminal.proceedsKnown, false);
  assert.equal(scannerInputs(data, dates[1]).length, 0);
  const current = prepareHistoricalData(fixture(), window);
  assert.equal(scannerInputs(current, dates[2]).length, 1);
});

test('real SEC first-filing dates enforce strictly next-day visibility; quality stays missing', () => {
  const p = fixture({ fund: { eps: [['2019-09-30', 2, '2020-01-03']], rev: [['2019-09-30', 200, '2020-01-06']], shares: [['2019-09-30', 10, '2020-01-03', 'dei']] } });
  const data = prepareHistoricalData(p, window), sec = data.securities[0];
  assert.equal(featuresAtDate(sec, '2020-01-03').fundamentals.length, 0);
  assert.deepEqual(featuresAtDate(sec, '2020-01-06').fundamentals.map((f) => f.key).sort(), ['eps', 'shares_outstanding']);
  assert.ok(sec.fundamentalsMissing.includes('historical_balance_sheet'));
  assert.equal(fundamentalRows({ eps: [['2020-01-06', 1, '2020-01-03']] }).length, 0);
});

test('full-input fingerprint changes on earlier-bar revision, not only endpoint', () => {
  const p = fixture(), a = prepareHistoricalData(p, window);
  p.segs[0].raw[0].volume++;
  const b = prepareHistoricalData(p, window);
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test('historical injection has no stdout and does not leak provider exception contents', async () => {
  const original = console.log; let prints = 0; console.log = () => { prints++; };
  try {
    const data = await loadHistoricalData({ ...window, loadPitDataFn: async (opts) => { assert.equal(opts.cross, false); return fixture(); } });
    assert.equal(data.state, 'AVAILABLE');
    const blocked = await loadHistoricalData({ loadPitDataFn: async () => { throw new Error('private secret or price'); } });
    assert.equal(blocked.reason, 'HISTORICAL_DATA_LOAD_FAILED');
    assert.ok(!JSON.stringify(blocked).includes('private secret'));
    assert.equal(prints, 0);
    assert.equal(privateDataConfigured({}), false);
  } finally { console.log = original; }
});

test('current scanner caps concurrent object reads, filters products and stale bars', async () => {
  const listings = Array.from({ length: 12 }, (_, i) => ({ ticker: `A${i}`, exchange: 'NASDAQ', startDate: '2010-01-01', active: true, instrumentType: 'EQUITY_COMMON' }));
  listings.push({ ticker: 'ETF', exchange: 'NYSE', startDate: '2010-01-01', active: true, instrumentType: 'ETF' });
  const eligibility = { decisions: listings.map((s) => ({ ticker: s.ticker, instrument_type: s.instrumentType, product_eligibility: s.instrumentType === 'ETF' ? 'EXCLUDED' : 'ELIGIBLE', start_date: s.startDate })) };
  let inflight = 0, max = 0;
  const data = await loadCurrentScannerInputs({ asOf: dates[2], listings, eligibility, getSeries: async () => { inflight++; max = Math.max(max, inflight); await new Promise((r) => setTimeout(r, 2)); inflight--; return { bars: dates.map((d) => bar(d, 100)) }; } });
  assert.equal(data.state, 'AVAILABLE'); assert.equal(data.scanner.length, 12); assert.ok(max <= 8); assert.ok(max > 1);
  assert.equal(data.coverage.currentRejected.inactiveOrProduct, 1);
  const stale = await loadCurrentScannerInputs({ asOf: '2020-02-03', listings: listings.slice(0, 1), eligibility, getSeries: async (ticker) => ({ bars: (ticker === 'SPY' ? ['2020-01-31', '2020-02-03'] : dates).map((d) => bar(d, 100)) }) });
  assert.equal(stale.scanner.length, 0); assert.equal(stale.coverage.staleRejected, 1);
});

test('current formation uses latest canonical benchmark session and exact contemporaneous stock bars', async () => {
  const listings = ['ABC', 'OLD'].map((ticker) => ({ ticker, exchange: 'NASDAQ', startDate: '2010-01-01', active: true, instrumentType: 'EQUITY_COMMON' }));
  const eligibility = { decisions: listings.map((s) => ({ ticker: s.ticker, instrument_type: s.instrumentType, product_eligibility: 'ELIGIBLE', start_date: s.startDate })) };
  const data = await loadCurrentScannerInputs({ asOf: '2020-01-12', listings, eligibility,
    getSeries: async (ticker) => ({ bars: (ticker === 'OLD' ? ['2020-01-07', '2020-01-08'] : ['2020-01-08', '2020-01-09', '2020-01-10']).map((d) => bar(d, 100)) }) });
  assert.equal(data.formationDate, '2020-01-10'); assert.equal(data.benchmark.bars.at(-1).date, '2020-01-10');
  assert.ok(data.benchmark.bars.every((b) => b.totalReturnIndex > 0));
  assert.deepEqual(data.scanner.map((s) => s.ticker), ['ABC']);
});

test('future corporate action or OHLC failure quarantines only the bad future, preserving earlier scanner selection', () => {
  const clean = prepareHistoricalData(fixture({ raw: dates.slice(0, 2).map((d) => bar(d, 100)) }), window);
  for (const kind of ['dividend', 'splitFactor', 'high']) {
    const raw = dates.map((d) => bar(d, 100));
    if (kind === 'high') raw[2].high = 90; else delete raw[2][kind];
    const altered = prepareHistoricalData(fixture({ raw }), window);
    assert.equal(altered.securities.length, 1);
    const q = altered.securities[0];
    assert.equal(q.dataQuarantine.from, dates[2]); assert.equal(q.terminal.kind, 'DATA_QUARANTINE');
    assert.equal(q.terminal.proceedsKnown, false);
    assert.deepEqual(scannerInputs(altered, dates[1])[0].bars, scannerInputs(clean, dates[1])[0].bars);
    assert.equal(scannerInputs(altered, dates[2]).length, 0);
    assert.equal(featuresAtDate(q, dates[1]).dataQuarantine, null);
  }
});

test('raw-preserving historical adapter reuses stores, caps8 reads, and preserves null action fields', async () => {
  const names = Array.from({ length: 11 }, (_, i) => `A${i}`);
  const deps = {
    universe: { securities: names.map((ticker) => ({ ticker, active: true, startDate: '2010-01-01' })) },
    eligibility: { decisions: names.map((ticker) => ({ ticker, instrument_type: 'EQUITY_COMMON' })) },
    companies: { rows: [] },
    listingRows: names.map((ticker) => ({ ticker, exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2010-01-01', endDate: '' })),
    today: '2020-01-07',
    readPrivate: async (key) => key.includes('manifest') ? { entries: {} } : {},
    pitStore: { getSeries: async () => ({ bars: dates.map((d) => bar(d, 100)) }) }
  };
  let current = 0, peak = 0;
  deps.mainStore = { getSeries: async () => { current++; peak = Math.max(peak, current); await new Promise((r) => setTimeout(r, 2)); current--; const bars = dates.map((d) => bar(d, 100)); delete bars[2].dividend; delete bars[2].splitFactor; return { bars }; } };
  const payload = await loadRawHistoricalPayload({ ...window, rawDataDeps: deps });
  assert.ok(peak <= 8 && peak > 1); assert.equal(payload.segs.length, 11);
  assert.equal(payload.segs[0].raw[2].dividend, null); assert.equal(payload.segs[0].raw[2].splitFactor, null);
  const prepared = await loadHistoricalData({ ...window, rawDataDeps: deps });
  assert.equal(prepared.securities.length, 11); assert.equal(prepared.coverage.quarantined, 11);
  assert.deepEqual(prepared.window, window);
  assert.equal(preserveRawBars([{ date: dates[0], close: 100 }], window)[0].dividend, null);
});

test('current fingerprint includes classification, sector and eligibility source metadata', async () => {
  const listings = [{ ticker: 'ABC', exchange: 'NASDAQ', startDate: '2010-01-01', active: true, instrumentType: 'EQUITY_COMMON', sector: 'A' }];
  const eligibility = { generatedAt: '2020-01-06', decisions: [{ ticker: 'ABC', instrument_type: 'EQUITY_COMMON', product_eligibility: 'ELIGIBLE', start_date: '2010-01-01' }] };
  const getSeries = async () => ({ bars: dates.map((d) => bar(d, 100)) });
  const a = await loadCurrentScannerInputs({ asOf: dates[2], listings, eligibility, getSeries });
  listings[0].sector = 'B';
  const b = await loadCurrentScannerInputs({ asOf: dates[2], listings, eligibility, getSeries });
  assert.notEqual(a.fingerprint, b.fingerprint);
  eligibility.generatedAt = '2020-01-07';
  const c = await loadCurrentScannerInputs({ asOf: dates[2], listings, eligibility, getSeries });
  assert.notEqual(b.fingerprint, c.fingerprint);
});

test('checkpoint quarantine matches linear causal canonical prefix tests including future date-shift rescue', () => {
  const tradingDates = []; let day = new Date('2020-01-02T00:00:00Z');
  while (tradingDates.length < 24) { if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) tradingDates.push(day.toISOString().slice(0, 10)); day.setUTCDate(day.getUTCDate() + 1); }
  const own = { identity: { state: 'CONFIRMED' } };
  const fixtures = [];
  const normal = () => tradingDates.map((d) => bar(d, 100));
  // An unexplained provider dividend on day4 is only "cured" by an own
  // dividend2 bars later; the day4 prefix must still remain quarantined.
  const rescue = normal();
  for (let i = 0; i < rescue.length; i++) rescue[i].adjustedClose = i < 4 ? 99 : 100;
  rescue[6].dividend = 1;
  assert.equal(TotalReturn.reconstruct(rescue, own).reconstructed, true);
  fixtures.push(rescue);
  const drift = normal(); drift.forEach((b, i) => { b.adjustedClose = 100 * Math.exp(i * 0.0004); }); fixtures.push(drift);
  const gap = normal().filter((_, i) => i < 4 || i > 12); gap.at(-2).adjustedClose = 100; gap.at(-1).adjustedClose = 100; fixtures.push(gap);
  const futureSplit = normal(); for (let i = 12; i < futureSplit.length; i++) futureSplit[i] = bar(futureSplit[i].date, 50, { splitFactor: i === 12 ? 2 : 1 }); fixtures.push(futureSplit);
  const suspect = normal(); for (let i = 8; i < suspect.length; i++) suspect[i] = bar(suspect[i].date, 50); fixtures.push(suspect);
  let seed = 91289;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let f = 0; f < 60; f++) {
    const bars = normal();
    for (let i = 2; i < bars.length; i++) {
      const draw = random();
      if (draw < 0.025) delete bars[i].dividend;
      else if (draw < 0.05) bars[i].splitFactor = -1;
      else if (draw < 0.075) bars[i].dividend = 150;
    }
    if (random() < 0.5) bars.forEach((b, i) => { b.adjustedClose = i >= 10 ? 100 : 99; });
    fixtures.push(bars);
  }
  for (const raw of fixtures) {
    let first = null;
    for (let i = 1; i < raw.length; i++) {
      const result = TotalReturn.reconstruct(raw.slice(0, i + 1), own);
      if (!result.reconstructed) { first = result.date ? raw.findIndex((b) => b.date === result.date) : i; break; }
    }
    const data = prepareHistoricalData(fixture({ raw }), { ...window, to: tradingDates.at(-1) });
    if (first === null) assert.equal(data.securities[0].bars.length, raw.length);
    else if (first < 2) assert.equal(data.securities.length, 0);
    else { assert.equal(data.securities[0].bars.length, first); assert.equal(data.securities[0].dataQuarantine.from, raw[first].date); }
  }
});
