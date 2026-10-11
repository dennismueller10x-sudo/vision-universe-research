import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as Listing from '../validation/lib.mjs';
import { prepareSourceFeatures } from '../research/tournament/methods.mjs';
import { formationContext } from '../research/tournament/runner.mjs';
import { turtleNSeries } from '../research/tournament/engines/legendary.mjs';
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
  assert.throws(() => prepareHistoricalData(fixture({ listingExtra: { ticker: 'DEF' } }), window), /LISTING_IDENTITY_CONFLICT/);
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
    assert.equal(blocked.privateDiagnostics.visibility, 'SEALED_ONLY');
    assert.equal(blocked.privateDiagnostics.phase, 'INJECTED_PIT_LOADER');
    assert.equal(blocked.privateDiagnostics.errorName, 'Error');
    assert.equal(blocked.privateDiagnostics.message, 'private secret or price');
    assert.match(blocked.privateDiagnostics.stack, /private secret or price/);
    assert.equal(Object.getOwnPropertyDescriptor(blocked, 'privateDiagnostics').enumerable, false);
    assert.equal(prints, 0);
    assert.equal(privateDataConfigured({}), false);
  } finally { console.log = original; }
});

test('historical dependency and normalization errors retain sealed phase diagnostics only', async () => {
  const error = Object.assign(new Error('private metadata failure'), { code: 'PRIVATE_READ_ERROR' });
  const blocked = await loadHistoricalData({ ...window, rawDataDeps: { readJson: async () => { throw error; } } });
  assert.equal(blocked.reason, 'HISTORICAL_DATA_LOAD_FAILED');
  assert.equal(blocked.privateDiagnostics.phase, 'PUBLIC_UNIVERSE_METADATA');
  assert.equal(blocked.privateDiagnostics.code, 'PRIVATE_READ_ERROR');
  assert.ok(!JSON.stringify(blocked).includes('PRIVATE_READ_ERROR'));
  assert.ok(!JSON.stringify(blocked).includes('private metadata'));
  const malformed = await loadHistoricalData({ ...window, loadPitDataFn: async () => fixture({ raw: [bar(dates[1], 100), bar(dates[0], 100)] }) });
  assert.equal(malformed.privateDiagnostics.phase, 'CANONICAL_NORMALIZATION');
  assert.equal(malformed.privateDiagnostics.message, 'BARS_NOT_ORDERED');
  assert.ok(!JSON.stringify(malformed).includes('BARS_NOT_ORDERED'));
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

test('official unsupported identity rows are excluded before series loading, without aliases', async () => {
  // Exact public Tiingo supported_tickers.zip rows observed 2026-10-11. The
  // shared classifier admits all three as common equity; Core identity rejects
  // each ticker, which previously aborted canonical normalization globally.
  const sourceRows = [
    { ticker: '-P-HIZ', startDate: '2023-08-30', endDate: '2025-09-29' },
    { ticker: 'CAPTW(EXP20260807)', startDate: '2026-07-28', endDate: '2026-07-31' },
    { ticker: 'NXT(EXP20091224)', startDate: '2023-02-09', endDate: '2023-02-09' },
    { ticker: 'BADSTART', startDate: '2023-02-30', endDate: '' },
    { ticker: 'BADEND', startDate: '2023-02-09', endDate: '2023-02-30' },
    { ticker: 'BADRANGE', startDate: '2023-02-09', endDate: '2023-02-08' },
    { ticker: 'ABC', startDate: '2010-01-01', endDate: '' }
  ].map((r) => ({ exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', ...r }));
  const req = createRequire(import.meta.url), identity = req('../../../core/identity.js'), master = req('../../../quant/engines/us-security-master.js');
  const roots = master.collectListedRoots(sourceRows);
  for (const r of sourceRows.slice(0, 3)) {
    assert.equal(identity.normalizeTicker(r.ticker), null);
    assert.equal(Listing.classifyListing(master, { ...r, listEnd: r.endDate }, null, roots).included, true);
  }
  const observed = ['2023-08-30', '2023-08-31'];
  const reads = [], bars = observed.map((d) => bar(d, 100));
  const deps = { listingRows: sourceRows, today: '2026-10-11',
    universe: { securities: [{ ticker: 'ABC', active: true, startDate: '2010-01-01' }] },
    eligibility: { decisions: [{ ticker: 'ABC', instrument_type: 'EQUITY_COMMON' }] }, companies: { rows: [] },
    readPrivate: async (key) => key.includes('manifest') ? { entries: Object.fromEntries(sourceRows.map((r) => [`tiingo:NASDAQ:${r.ticker}:${r.startDate}`, { status: 'OK', included: true, cls: 'EQUITY_COMMON' }])) } : {},
    mainStore: { getSeries: async (key) => { reads.push(key); return { bars }; } },
    pitStore: { getSeries: async (key) => { reads.push(key); return { bars }; } } };
  const data = await loadHistoricalData({ rawDataDeps: deps });
  assert.equal(data.state, 'AVAILABLE'); assert.deepEqual(data.securities.map((s) => s.ticker), ['ABC']);
  assert.deepEqual(reads.sort(), ['ABC', 'SPY@1993-01-29']);
  assert.deepEqual(data.coverage.loader.sourceIdentity, { supportedRows: 7, rejectedRows: 6, reasons: {
    SOURCE_TICKER_UNSUPPORTED: 3, SOURCE_START_DATE_INVALID: 1, SOURCE_END_DATE_INVALID: 1, SOURCE_DATE_RANGE_INVALID: 1 } });
  assert.equal(data.coverage.loader.excluded.SOURCE_TICKER_UNSUPPORTED, 3);
});

test('production streaming matches raw-path canonical bars, facts, quarantine and fingerprint without retaining raw histories', async () => {
  const observed = []; let day = new Date('2020-01-02T00:00:00Z');
  while (day.toISOString().slice(0, 10) <= '2020-02-18') {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) observed.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const names = ['ABC', 'SPLIT', 'BAD', 'OLD', 'GAP'];
  const listingRows = names.map((ticker) => ({ ticker, exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2010-01-01', endDate: ticker === 'OLD' ? dates[2] : '' }));
  const allBars = (ticker) => {
    const rows = observed.map((d, i) => bar(d, ticker === 'SPLIT' && i >= 2 ? 50 : 100, ticker === 'SPLIT' && i === 2 ? { splitFactor: 2, dividend: 1 } : {}));
    if (ticker === 'BAD') { delete rows[0].dividend; }
    if (ticker === 'ABC') { delete rows[rows.length - 1].splitFactor; }
    return ticker === 'GAP' ? rows.filter((b, i) => i < 2 || b.date >= '2020-02-17') : rows;
  };
  const deps = { listingRows, today: '2020-02-19', universe: { securities: names.filter((ticker) => ticker !== 'OLD').map((ticker) => ({ ticker, active: true, startDate: '2010-01-01' })) },
    eligibility: { decisions: names.map((ticker) => ({ ticker, instrument_type: 'EQUITY_COMMON' })) }, companies: { rows: [] },
    readPrivate: async (key) => key.includes('manifest') ? { entries: { 'tiingo:NASDAQ:OLD:2010-01-01': { status: 'OK', included: true, cls: 'EQUITY_COMMON' } } }
      : key.includes('sec-pit') ? Object.fromEntries(names.map((ticker) => [`tiingo:NASDAQ:${ticker}:2010-01-01`, { eps: [['2019-09-30', 2, dates[1]]], rev: [['2019-09-30', 200, dates[1]]] }])) : {},
    mainStore: { getSeries: async (ticker) => { await new Promise((r) => setTimeout(r, names.indexOf(ticker) * 2)); return { bars: allBars(ticker) }; } },
    pitStore: { getSeries: async (key) => ({ bars: key.startsWith('SPY@') ? allBars('SPY') : allBars(key.split('@')[0]) }) } };
  const options = { ...window, to: '2020-02-18', rawDataDeps: deps };
  const raw = await loadRawHistoricalPayload(options), legacy = prepareHistoricalData(raw, options), streamed = await loadHistoricalData(options);
  assert.equal(streamed.state, 'AVAILABLE'); assert.equal(streamed.fingerprint, legacy.fingerprint);
  assert.deepEqual(streamed.coverage, legacy.coverage); assert.deepEqual(streamed.calendar, legacy.calendar);
  assert.deepEqual(streamed.segs, []); assert.equal(Object.hasOwn(streamed, 'spyRaw'), false);
  assert.equal(Object.hasOwn(streamed.benchmark, 'raw'), false);
  for (let i = 0; i < legacy.securities.length; i++) {
    const { raw: omitted, ...expected } = legacy.securities[i];
    assert.deepEqual(streamed.securities[i], expected);
    assert.equal(Object.hasOwn(streamed.securities[i], 'raw'), false);
  }
  assert.ok(streamed.securities.some((s) => s.dataQuarantine?.reason === 'LISTING_DATA_GAP'));
  assert.ok(streamed.securities.some((s) => s.terminal?.kind === 'DELISTED'));
  assert.ok(streamed.coverage.rejected.DIVIDEND_FIELD_MISSING > 0);
});

test('current streaming keeps one full canonical source history and scanner references for prior-prefix N', async () => {
  const observed = []; let day = new Date('2016-01-04T00:00:00Z');
  while (observed.length < 1100) { if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) observed.push(day.toISOString().slice(0, 10)); day.setUTCDate(day.getUTCDate() + 1); }
  const asOf = observed.at(-1), listings = [{ ticker: 'ABC', exchange: 'NASDAQ', startDate: '2010-01-01', active: true, instrumentType: 'EQUITY_COMMON' }];
  const eligibility = { decisions: [{ ticker: 'ABC', instrument_type: 'EQUITY_COMMON', product_eligibility: 'ELIGIBLE', start_date: '2010-01-01' }] };
  const data = await loadCurrentScannerInputs({ asOf, listings, eligibility, lookbackBars: 1000000,
    getSeries: async () => ({ bars: observed.map((date, i) => ({ ...bar(date, 100), high: i < 50 ? 110 : 101, low: i < 50 ? 90 : 99, volume: 100000 })) }) });
  assert.equal(data.state, 'AVAILABLE'); assert.equal(data.securities[0].bars.length, 1100);
  assert.equal(data.scanner[0], data.securities[0]); assert.equal(data.scanner[0].bars, data.securities[0].bars);
  assert.equal(Object.hasOwn(data.securities[0], 'raw'), false); assert.deepEqual(data.segs, []);
  prepareSourceFeatures(data);
  const expected = turtleNSeries(data.securities[0].bars);
  assert.deepEqual(data.scanner[0].sourceFeatures.turtleN20, expected);
  const protocol = { universe: { priceFloorRaw: 5, dollarVolumeSessions: 20, dollarVolumeFloor: 1000000 } };
  const context = formationContext(data, { id: 'TURTLE_S2_EQUITY_DAILY', portfolioSemantics: { mode: 'STATEFUL_DAILY' } }, asOf, null, protocol);
  assert.equal(context.securities[0].bars.length, 400);
  assert.equal(context.securities[0].preSignalN.value, expected.at(-2));
  assert.equal(context.securities[0].preSignalN.asOf, observed.at(-2));
});

test('current scanner preserves a causal prefix when a stock object extends beyond the latest SPY session', async () => {
  const listings = [{ ticker: 'ABC', exchange: 'NASDAQ', startDate: '2010-01-01', active: true, instrumentType: 'EQUITY_COMMON' }];
  const eligibility = { decisions: [{ ticker: 'ABC', instrument_type: 'EQUITY_COMMON', product_eligibility: 'ELIGIBLE', start_date: '2010-01-01' }] };
  const data = await loadCurrentScannerInputs({ asOf: '2020-01-07', listings, eligibility, lookbackBars: 1000000,
    getSeries: async (ticker) => ({ bars: ticker === 'SPY' ? dates.map((d) => bar(d, 100)) : [...dates.map((d) => bar(d, 100)), bar('2020-01-07', 50, { splitFactor: 2 })] }) });
  assert.equal(data.formationDate, dates[2]); assert.equal(data.securities[0].bars.length, 4); assert.equal(data.scanner[0].bars.length, 3);
  assert.equal(data.scanner[0].bars[0], data.securities[0].bars[0]);
  assert.equal(data.scanner[0].bars.at(-1).date, dates[2]);
  const protocol = { universe: { priceFloorRaw: 5, dollarVolumeSessions: 2, dollarVolumeFloor: 0 } };
  const context = formationContext({ ...data, securities: data.scanner }, { id: '52_week_high_effect' }, dates[2], null, protocol);
  assert.equal(context.securities[0].bars[0].close, 100);
  assert.equal(context.securities[0].bars.at(-1).close, 100);
  assert.equal(context.securities[0].bars.at(-1).date, dates[2]);
  assert.deepEqual(featuresAtDate(data.scanner[0], dates[2]).bars, featuresAtDate(data.securities[0], dates[2]).bars);
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
