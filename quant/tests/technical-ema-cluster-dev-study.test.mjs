import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN, division, selectSample, aggregateCell } from '../../scripts/technical/ema-cluster-dev-study.mjs';
import { run } from '../../scripts/technical/ema-cluster-study.mjs';
import { createRequire } from 'node:module';
import { archiveBytes, objectRequests } from '../../scripts/technical/ema-cluster-archive.mjs';
import { createSnapshotStore } from '../../scripts/supertrader/snapshot/store.mjs';
const require = createRequire(import.meta.url), S = require('../engines/research-studies.cjs');
test('archive reuses immutable content-addressed storage and verifies every restored byte', async () => {
  const objects = new Map(), driver = { async head(k) { return objects.has(k) ? {} : null; }, async get(k) { return objects.get(k) || null; }, async put(k, b) { objects.set(k, b); } };
  const store = createSnapshotStore({ driver }), b = Buffer.from('existing sealed research package');
  const { createHash } = await import('node:crypto'), hash = createHash('sha256').update(b).digest('hex');
  const r = await archiveBytes(store, b, hash); assert.equal(r.restored, true); assert.equal(objects.size, 1);
  assert.deepEqual(await archiveBytes(store, b, hash), r); assert.equal(objects.size, 1);
  await assert.rejects(archiveBytes(store, b, '0'.repeat(64)), /INPUT_HASH/);
  driver.get = async () => Buffer.from('corrupt'); await assert.rejects(archiveBytes(store, b, hash), /HASH_MISMATCH|OBJECT_CONFLICT/);
});
test('archive transfer signatures bind only the chosen research object and exact ciphertext', () => {
  const env = { VU_HISTORY_S3_ENDPOINT: 'https://storage.example.test', VU_HISTORY_S3_BUCKET: 'research', VU_HISTORY_S3_ACCESS_KEY_ID: 'test-id', VU_HISTORY_S3_SECRET_ACCESS_KEY: 'never-export-this' };
  const store = createSnapshotStore({ driver: {} }), hash = 'a'.repeat(64);
  const r = objectRequests(env, store, hash, 123, new Date('2026-11-16T12:00:00Z'));
  assert.equal(r.requests.PUT.headers['x-amz-content-sha256'], hash); assert.equal(r.requests.PUT.headers['content-length'], '123');
  assert.ok(r.requests.PUT.url.endsWith('/research-snapshots/supertrader/sts1/objects/' + hash + '.bin'));
  assert.equal(r.requests.GET.url, r.requests.PUT.url); assert.ok(!JSON.stringify(r).includes(env.VU_HISTORY_S3_SECRET_ACCESS_KEY));
  assert.notEqual(r.requests.PUT.headers.authorization, r.requests.GET.headers.authorization);
});
function candidates() {
  return ['ACTIVE', 'DELISTED'].flatMap(cohort => Array.from({ length: 220 }, (_, i) => ({ listingId: cohort + '-' + i,
    cik: null, instrumentClass: 'EQUITY_COMMON', reusedLater: false, bars: 900, hasStudyBars: true, cohort,
    industry: ['MANUFACTURING', 'SERVICES', 'UNKNOWN'][i % 3] })));
}
test('selection fixes 150/50, balances available strata including UNKNOWN and is independent of input order', () => {
  const input = candidates(), a = selectSample(input), b = selectSample([...input].reverse());
  assert.deepEqual(a.selected, b.selected); assert.deepEqual(a.counts, { active: 150, delisted: 50, unknownIndustry: 66, missingCik: 200 });
  assert.equal(new Set(a.selected.map(x => x.listingId)).size, 200);
  assert.equal(division('3571'), 'MANUFACTURING'); assert.equal(division(null), 'UNKNOWN');
  assert.deepEqual(PLAN.instrumentClasses, ['EQUITY_COMMON']);
});
test('unavailable histories, identity reuse and duplicate issuers are disclosed without filling deficits from another cohort', () => {
  const input = candidates().slice(0, 5); input[0].reusedLater = true; input[1].bars = 12;
  input[2].cik = '1234'; input[3].cik = '1234'; input[4].hasStudyBars = false;
  const a = selectSample(input);
  assert.equal(a.selected.length, 1); assert.equal(a.counts.delisted, 0);
  assert.deepEqual(new Set(a.excluded.flatMap(x => x.reasons)), new Set(['REUSED_LISTING_IDENTITY', 'INSUFFICIENT_BARS', 'DUPLICATE_KNOWN_ISSUER', 'NO_DEV_OBSERVATIONS']));
});
test('existing non-stock classifications cannot enter the common-equity sample', () => {
  const input = candidates().slice(0, 2); input[0].nonStockReason = 'FUND_NAME'; input[1].nonStockReason = 'EXCHANGE_NYSE_ARCA';
  const out = selectSample(input);
  assert.equal(out.selected.length, 0);
  assert.ok(out.excluded.every(x => x.reasons.some(r => r.startsWith('KNOWN_NON_STOCK_PRODUCT:'))));
});
test('pooled inference uses observations and preserves negative, neutral, censored and cohort results', () => {
  const rows = [0, .03, -.04, -.02].map((v, i) => ({ eventId: '' + i, state: 'OBSERVED', benchmarkExcess: v, directionAdjustedExcess: -v,
    netReturn: v, issuerId: 'issuer-' + (i % 2), timeCluster: '2020-01-0' + (i + 1), cohort: i < 2 ? 'ACTIVE' : 'DELISTED',
    regime: 'SIDEWAYS|LOW_VOL', year: '2020', industry: 'UNKNOWN', signalDate: '2020-01-0' + (i + 1), exitDate: '2020-01-07' }));
  rows.push({ ...rows[0], state: 'CENSORED', benchmarkExcess: null, netReturn: null, directionAdjustedExcess: null });
  const out = aggregateCell(rows, Array.from({ length: 7 }, (_, i) => '2020-01-0' + (i + 1)), '2020-01-07');
  assert.equal(out.excessSpy.mean, S.inference(rows.slice(0, 4), 'benchmarkExcess').mean);
  assert.equal(out.excessSpy.positive, 1); assert.equal(out.excessSpy.negative, 2); assert.equal(out.excessSpy.neutral, 1);
  assert.equal(out.states.CENSORED, 1); assert.equal(out.cohorts.length, 2); assert.equal(out.p, null);
  assert.equal(out.walkForward.state, 'NOT_RUN');
});
test('batch observer exposes exact engine rows; eventFrom excludes warmup outcomes without removing feature history', () => {
  const calendar = []; for (let t = Date.UTC(2020, 0, 1); calendar.length < 270; t += 864e5) if (![0, 6].includes(new Date(t).getUTCDay())) calendar.push(new Date(t).toISOString().slice(0, 10));
  const listing = k => ({ listingId: 'test-' + k, issuerId: 'test-' + k, sourceHash: 'synthetic', identity: { mic: 'XNYS',
    instrumentClass: 'COMMON_STOCK', primary: true, validFrom: calendar[0], availableAt: calendar[0], sourceHash: 'synthetic' },
    bars: calendar.map((date, i) => { const close = 100 + 20 * Math.sin(i / 8 + k); return { date, close, high: close * 1.01, low: close * .99, closeAt: date + 'T23:59:59.999Z' }; }) });
  const input = { schemaVersion: 'technical-event-study-input-1.0.0', asOf: calendar.at(-1), priceBasis: 'SPLIT_ADJUSTED_PRICE', returnBasis: 'PRICE_RETURN',
    currency: 'USD', sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', population: { sourceHash: 'fixture', limitations: ['SYNTHETIC'] },
    calendar, listings: [listing(0), listing(1)], benchmark: { id: 'SPY', currency: 'USD', returnBasis: 'PRICE_RETURN', bars: calendar.map(date => ({ date, close: 100 })) } };
  const options = { config: { fast: [2, 3], slow: [5, 8] }, eventFrom: calendar[160] }, seen = [];
  const observed = run(input, { ...options, onCell(cell) { seen.push(cell); } }), plain = run(input, options);
  assert.equal(observed.resultHash, plain.resultHash); assert.equal(seen.length, 36);
  assert.ok(seen.some(c => c.rows.length)); assert.ok(seen.flatMap(c => c.rows).every(r => r.signalDate >= options.eventFrom));
  assert.equal(observed.eventFrom, options.eventFrom);
  const reversed = run({ ...input, listings: input.listings.map(l => ({ ...l, bars: l.bars.slice(160) })) }, options);
  assert.ok(observed.counts.events > reversed.counts.events, 'warmup history remains usable');
});
