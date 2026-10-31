// Supertrader 9 – historical infrastructure, data side (point in time, identity, delisting, coverage). Synthetic
// fixtures only: no provider data, no private series, no network. Files go to os.tmpdir().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as H from '../source-faithful/research/st9-hist-universe.mjs';
import { preflight } from '../source-faithful/research/run-st9-v13-delisted-study.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { BLOCKLIST_SCHEMA, BLOCKLIST_GENERATOR } from '../../market/build-security-master-identity-blocklist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2015, 0, 1); t <= Date.UTC(2017, 5, 30); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
function raw(from, to, { c0 = 20, flatFrom = null } = {}) {
  const out = []; let c = c0;
  for (const d of CAL) {
    if (d < from || d > to) continue;
    if (flatFrom && d >= flatFrom) { out.push({ date: d, open: c, high: c, low: c, close: c, volume: 0, adjClose: null, dividend: 0, splitFactor: 1 }); continue; }
    const o = c; c *= 1.001; out.push({ date: d, open: o, high: c * 1.01, low: o * 0.99, close: c, volume: 1e6, adjClose: null, dividend: 0, splitFactor: 1 });
  }
  return out;
}
const sec = (id, from, to, endCause = 'ACTIVE', extra = {}) => Object.assign(securityFromSegment({ id, raw: raw(from, to, extra), endCause, delisted: endCause !== 'ACTIVE', survivor: endCause === 'ACTIVE', delistClass: extra.delistClass ?? null }), extra.fund ? { fund: extra.fund } : {});
const ds = (securities) => ({ calendar: CAL.filter((d) => d >= WIN.from), securities, benchmark: [] });
const blocklistDoc = (entries) => ({ schema: BLOCKLIST_SCHEMA, generator: BLOCKLIST_GENERATOR, measuredOn: '2026-10-30', prevMasterSha256: 'a'.repeat(64), nextMasterSha256: 'b'.repeat(64), entries });

test('point in time: the universe of a date is the set of listings whose own interval contains it (survivorship visible)', () => {
  const d = ds([
    sec('tiingo:NYSE:SURV:2000-01-03', '2015-01-02', '2017-06-30'),
    sec('tiingo:NYSE:GONE:2010-01-04', '2015-01-02', '2016-03-31', 'LISTING_INACTIVE', { delistClass: 'ACQUISITION' }),
    sec('tiingo:NASDAQ:NEWB:2016-06-01', '2016-06-01', '2017-06-30'),
  ]);
  const w = H.listingWindows(d);
  assert.deepEqual(H.membersAt(w, '2016-01-04').sort(), ['tiingo:NYSE:GONE:2010-01-04', 'tiingo:NYSE:SURV:2000-01-03']);
  assert.deepEqual(H.membersAt(w, '2016-07-01').sort(), ['tiingo:NASDAQ:NEWB:2016-06-01', 'tiingo:NYSE:SURV:2000-01-03'], 'a delisted listing leaves, a new one enters');
  const y = H.pitUniverseByYear(w, { window: WIN });
  assert.equal(y[2016].listed, 3); assert.equal(y[2017].listed, 2);
  assert.equal(y[2016].endsEconomic, 1); assert.equal(y[2016].newListings, 1);
  assert.ok(y[2016].survivorShare < 1, 'the 2016 universe is not survivors only');
});

test('point in time fails closed on structural violations and counts forward-fill signatures', () => {
  const ok = sec('tiingo:NYSE:FLAT:2000-01-03', '2015-01-02', '2016-06-30', 'ACTIVE', { flatFrom: '2016-06-01' });
  const r = H.assertPointInTime(ds([ok]), { calendarDates: CAL, window: WIN });
  assert.equal(r.suspectForwardFillRuns, 1, 'one run of unchanged zero-volume bars');
  assert.ok(r.suspectForwardFillBars >= 15);
  assert.equal(r.lastBarZeroVolume, 1);
  assert.equal(r.barsOffCalendar, 0);
  const after = sec('tiingo:NYSE:AFT:2000-01-03', '2015-01-02', '2016-03-31', 'LISTING_INACTIVE');
  after.terminal = { ...after.terminal, date: '2016-03-30' }; // a bar after the economic end = forward fill
  assert.throws(() => H.assertPointInTime(ds([after])), /PIT_BAR_AFTER_TERMINAL/);
  const unsorted = sec('tiingo:NYSE:UNS:2000-01-03', '2015-01-02', '2015-03-31'); unsorted.bars.reverse();
  assert.throws(() => H.assertPointInTime(ds([unsorted])), /PIT_DATES_NOT_INCREASING/);
  assert.throws(() => H.assertPointInTime(ds([sec('tiingo:NYSE:LATE:2000-01-03', '2015-01-02', '2017-06-30')]), { window: { ...WIN, to: '2017-03-31' } }), /PIT_BAR_AFTER_WINDOW/);
  const off = H.assertPointInTime(ds([sec('tiingo:NYSE:OFF:2000-01-03', '2015-01-02', '2015-03-31')]), { calendarDates: CAL.filter((x) => x !== '2015-02-02') });
  assert.equal(off.barsOffCalendar, 1, 'off-calendar bars are counted, never repaired');
});

test('identity: overlapping listings under one securityId are duplicates, sequential ones a flagged ticker reuse', () => {
  const d = ds([
    sec('tiingo:NYSE:DUP:2000-01-03', '2015-01-02', '2016-06-30'),
    sec('tiingo:NASDAQ:DUP:2016-01-04', '2016-01-04', '2017-06-30'), // same ticker, overlapping interval
    sec('tiingo:NYSE:REUS:2000-01-03', '2015-01-02', '2015-12-31', 'LISTING_INACTIVE'),
    sec('tiingo:NYSE:REUS:2016-06-01', '2016-06-01', '2017-06-30'), // same ticker after the first listing ended
    sec('tiingo:NYSE:ONE:2000-01-03', '2015-01-02', '2017-06-30'),
    sec('v13dl:NASDAQ:aaaa000000000001', '2015-01-02', '2016-06-30', 'LISTING_INACTIVE'),
  ]);
  const w = H.listingWindows(d, { addedIds: new Set(['v13dl:NASDAQ:aaaa000000000001']), addedTickers: new Map([['v13dl:NASDAQ:aaaa000000000001', 'ONE']]) });
  const { census, flags } = H.identityCensus(w);
  assert.equal(census.duplicateListingOverlap.listings, 4, 'DUP x2 and ONE (A) with its added V13 chain x2');
  assert.deepEqual(census.duplicateListingOverlap.byOrigin, { A_OWN: 3, B_ADDED: 1 });
  assert.equal(census.tickerReuseSequential.listings, 2);
  assert.deepEqual(flags.get('tiingo:NYSE:REUS:2016-06-01'), ['TICKER_REUSE_SEQUENTIAL']);
  assert.equal(census.unresolvedTicker, 0);
  assert.equal(w.find((x) => x.lid === 'tiingo:NYSE:ONE:2000-01-03').securityId, 'ref_ONE', 'securityId only via core/identity.js');
});

test('identity blocklist (#1159) is an input: validated fail closed, FLAG keeps the dataset, EXCLUDE removes blocked ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-bl-')), f = path.join(dir, 'bl.json');
  fs.writeFileSync(f, JSON.stringify(blocklistDoc([{ securityId: 'ref_LESL', reason: 'START_DATE_CHANGED' }])));
  const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const bl = H.readIdentityBlocklist(f, { expectedSha256: h });
  assert.equal(bl.entries, 1); assert.equal(bl.map.get('ref_LESL'), 'START_DATE_CHANGED');
  assert.throws(() => H.readIdentityBlocklist(f, {}), /IDENTITY_BLOCKLIST_SHA256_REQUIRED/);
  assert.throws(() => H.readIdentityBlocklist(f, { expectedSha256: 'c'.repeat(64) }), /IDENTITY_BLOCKLIST_HASH_MISMATCH/);
  assert.throws(() => H.readIdentityBlocklist(path.join(dir, 'none.json'), { expectedSha256: h }), /IDENTITY_BLOCKLIST_MISSING/);
  assert.throws(() => H.parseIdentityBlocklist({ ...blocklistDoc([]), generator: 'hand-written' }), /IDENTITY_BLOCKLIST_GENERATOR/);
  assert.throws(() => H.parseIdentityBlocklist({ ...blocklistDoc([]), schema: 'x' }), /IDENTITY_BLOCKLIST_SCHEMA/);
  assert.throws(() => H.parseIdentityBlocklist(blocklistDoc([{ securityId: 'ref_A', reason: 'R' }, { securityId: 'ref_A', reason: 'R' }])), /IDENTITY_BLOCKLIST_DUPLICATE_ENTRY/);
  assert.throws(() => H.parseIdentityBlocklist({ ...blocklistDoc([]), prevMasterSha256: 'x' }), /IDENTITY_BLOCKLIST_MASTER_HASHES/);
  const d = ds([sec('tiingo:NYSE:LESL:2020-10-29', '2015-01-02', '2017-06-30'), sec('tiingo:NYSE:KEEP:2000-01-03', '2015-01-02', '2017-06-30')]);
  const flag = H.applyIdentityBlocklist(d, bl);
  assert.equal(flag.ds, d, 'FLAG: the registered universe is unchanged'); assert.deepEqual([...flag.blocked], ['tiingo:NYSE:LESL:2020-10-29']);
  const ex = H.applyIdentityBlocklist(d, bl, { mode: 'EXCLUDE' });
  assert.deepEqual(ex.ds.securities.map((s) => s.id), ['tiingo:NYSE:KEEP:2000-01-03']); assert.equal(ex.removedSecurities, 1);
  assert.throws(() => H.applyIdentityBlocklist(d, bl, { mode: 'MERGE' }), /IDENTITY_BLOCKLIST_MODE/);
  const { census, flags } = H.identityCensus(H.listingWindows(d), { blocklist: bl });
  assert.deepEqual(census.blocklisted.byReason, { START_DATE_CHANGED: 1 });
  assert.deepEqual(flags.get('tiingo:NYSE:LESL:2020-10-29'), ['IDENTITY_BLOCKLISTED:START_DATE_CHANGED']);
  assert.equal(census.blocklist.sha256, h);
});

test('delisting outcomes: known only where a source classifies them; everything else is censored, never filled forward', () => {
  const merger = sec('tiingo:NYSE:ACQ:2000-01-03', '2015-01-02', '2016-03-31', 'LISTING_INACTIVE', { delistClass: 'ACQUISITION' });
  const unknown = sec('tiingo:NYSE:UNK:2000-01-03', '2015-01-02', '2016-05-31', 'LISTING_INACTIVE');
  const gap = sec('tiingo:NYSE:GAP:2000-01-03', '2015-01-02', '2015-09-30', 'DATA_GAP');
  const active = sec('tiingo:NYSE:ACT:2000-01-03', '2015-01-02', '2017-06-30');
  const windowEnd = securityFromSegment({ id: 'tiingo:NYSE:WEND:2000-01-03', raw: raw('2015-01-02', '2017-06-30'), endCause: 'WINDOW_END', delisted: true, survivor: false });
  const v13d = sec('v13dl:NASDAQ:bbbb000000000001', '2015-01-02', '2016-08-31', 'LISTING_INACTIVE'); v13d.v13 = { terminalClass: 'DISTRESS' };
  const v13u = sec('v13dl:NASDAQ:bbbb000000000002', '2015-01-02', '2016-09-30', 'LISTING_INACTIVE'); v13u.v13 = { terminalClass: 'UNKNOWN' };
  const added = new Set(['v13dl:NASDAQ:bbbb000000000001', 'v13dl:NASDAQ:bbbb000000000002']);
  const o = H.terminalOutcomes(H.listingWindows(ds([merger, unknown, gap, active, windowEnd, v13d, v13u]), { addedIds: added }));
  assert.deepEqual(o.byOutcome, { DELISTED_MERGER: 1, DELISTED_UNKNOWN_CENSORED: 2, DATA_GAP_CENSORED: 1, ACTIVE_AT_WINDOW_END: 1, WINDOW_END_RIGHT_CENSORED: 1, DELISTED_DISTRESS: 1 });
  assert.equal(o.censored, 4);
  assert.deepEqual(o.byOrigin.B_ADDED, { DELISTED_DISTRESS: 1, DELISTED_UNKNOWN_CENSORED: 1 });
  assert.equal(o.byYear['2016'].DELISTED_MERGER, 1);
  assert.equal(unknown.bars.at(-1).date, unknown.terminal.date, 'the economic end is the last traded bar');
});

test('coverage per year and method: fundamentals, added share and uncertainty flags', () => {
  const withFund = sec('tiingo:NYSE:FND:2000-01-03', '2015-01-02', '2017-06-30', 'ACTIVE', { fund: { eps: [{ d: '2015-01-01', v: 1 }], rev: [] } });
  const noFund = sec('v13dl:NASDAQ:cccc000000000001', '2015-01-02', '2016-06-30', 'LISTING_INACTIVE');
  const c = H.dataCoverageByYear(ds([withFund, noFund]), { addedIds: new Set(['v13dl:NASDAQ:cccc000000000001']), window: WIN });
  assert.ok(c[2016].fundamentalsShare > 0 && c[2016].fundamentalsShare < 1);
  assert.ok(c[2016].addedShare > 0);
  assert.ok(c[2016].flags.includes('ADDED_CHAINS_WITHOUT_FUNDAMENTALS'));
  assert.ok(c[2015].flags.includes('WARMUP_ONLY'));
  assert.ok(c[2017].flags.includes('PARTIAL_YEAR'));
  assert.equal(c[2017].securitiesB, 0);
  assert.equal(H.requirementsOf('MINERVINI_SEPA').flag, 'FUNDAMENTALS_NOT_BLOCKING_EVIDENCE_MANUAL');
  assert.equal(H.requirementsOf('TURTLE_S1').flag, null);
  assert.equal(H.requirementsOf('KK_EPISODIC_PIVOT').excluded, true);
  const all = H.universeDiagnostics(ds([withFund, noFund]), { addedIds: new Set(['v13dl:NASDAQ:cccc000000000001']), window: WIN, calendarDates: CAL });
  const pub = JSON.stringify(H.publicUniverseDiagnostics(all));
  assert.ok(!/FND|cccc000000000001|tiingo:/.test(pub), 'public diagnostics carry no ticker and no listing id');
});

test('preflight lists exactly what a real run is missing and computes nothing', () => {
  const out = path.join(os.tmpdir(), 'st9-preflight-out');
  const none = preflight(['--accounting', 'research-v1', '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--out', out], { env: {} });
  assert.equal(none.ready, false);
  const codes = none.missing.map((m) => m.code);
  assert.deepEqual([...new Set(codes)].sort(), ['SNAPSHOT_STORE_SECRET_MISSING', 'V13_DAILY_DIR_MISSING', 'V13_SERIES_DIR_MISSING']);
  // a complete synthetic input set (empty register => no QUALIFIED series needed) is ready
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-pf-root-')), priv = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-pf-priv-'));
  for (const f of ['scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json', 'scripts/supertrader/validation/results-public-key.pem']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(root, f)); }
  fs.mkdirSync(path.join(root, 'docs/quant-recovery/v13/delisted'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json'), JSON.stringify({ columns: ['chainId', 'status'], rows: [['x1', 'QUALIFIED']] }));
  fs.mkdirSync(path.join(priv, 'series')); fs.mkdirSync(path.join(priv, 'raw', '1'), { recursive: true });
  fs.writeFileSync(path.join(priv, 'raw', '1', 'series.jsonl.gz'), '');
  const env = { VU_HISTORY_S3_ENDPOINT: 'e', VU_HISTORY_S3_BUCKET: 'b', VU_HISTORY_S3_ACCESS_KEY_ID: 'k', VU_HISTORY_S3_SECRET_ACCESS_KEY: 's' };
  const args = ['--accounting', 'research-v1', '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--out', out, '--v13-series', path.join(priv, 'series'), '--v13-raw', path.join(priv, 'raw')];
  const part = preflight(args, { env, root });
  assert.deepEqual(part.missing, [{ code: 'V13_SERIES_INCOMPLETE', detail: '1 of 1 QUALIFIED series absent' }]);
  fs.writeFileSync(path.join(priv, 'series', 'x1.json'), '{}');
  assert.deepEqual(preflight(args, { env, root }), { ready: true, missing: [] });
  assert.ok(preflight([...args, '--quarantine', 'CA-Q-K5-DATES'], { env, root }).missing.some((m) => m.code === 'QUARANTINE_DATES_MISSING'));
  assert.ok(preflight([...args, '--identity-blocklist', path.join(priv, 'nope.json')], { env, root }).missing.some((m) => m.code === 'IDENTITY_BLOCKLIST_MISSING'));
});
