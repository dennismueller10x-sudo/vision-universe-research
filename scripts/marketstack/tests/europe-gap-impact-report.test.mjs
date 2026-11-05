import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, billing, makeCalendar, safeOut, micDateClusters } from '../europe-gap-impact-report.mjs';

// Synthetic XETR fortnight: 2026-03-02..2026-03-13 (10 sessions). No real prices.
const days = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13'].map(d => '2026-03-' + d);
const calendarAudit = { calendars: { XETR: { coverageFrom: '2026-03-01', coverageTo: '2026-03-31', closures: [{ date: '2026-03-10', classification: 'EXPECTED_EXCHANGE_CLOSURE' }] } } };
const sessions = days.filter(d => d !== '2026-03-10');
const security = (id, symbol, publication) => ({ securityId: id, primaryListingId: 'L' + id, identity: { status: 'VERIFIED' },
  listings: [{ listingId: 'L' + id, providerSymbol: symbol, mic: 'XETR', discoverPublication: publication,
    discoverChart: { sessionLag: 0, evaluatedAt: '2026-03-14T00:00:00Z', calendarProof: { expectedLastCompletedSession: '2026-03-13' } } }] });
const pts = dates => dates.map(d => [d, 10]);

function fixture() {
  const catalog = { securities: [security('A', 'AAA.DE'), security('B', 'BBB.PA', { status: 'BLOCKED', reasonCode: 'PROVIDER_REQUEST_FAILED:providerError:no_valid_symbols_provided:HTTP422' })] };
  catalog.securities[1].listings[0].mic = 'XETR';
  catalog.securities[1].listings[0].discoverChart.sessionLag = 5;
  // A misses 03-04 (provider) and 03-05 (identity quarantine); B misses 03-04 (provider) and has a stale tail after 03-11.
  const series = new Map([['A', { securityId: 'A', points: pts(sessions.filter(d => !['2026-03-04', '2026-03-05'].includes(d))) }],
    ['B', { securityId: 'B', points: pts(sessions.filter(d => d <= '2026-03-11' && d !== '2026-03-04')) }]]);
  const inventory = { rows: [
    { securityId: 'A', mic: 'XETR', firstRawDate: '2026-03-02', lastRawDate: '2026-03-13', lastApprovedDate: '2026-03-13',
      priceOrIdentityBreaks: [{ from: '2026-03-03', to: '2026-03-06', classification: 'IDENTITY_QUARANTINE_INTERVAL' }],
      allGaps: [{ from: '2026-03-03', to: '2026-03-06', classification: 'MIXED_MISSING_GAP', causes: [{ date: '2026-03-04', classification: 'PROVIDER_MISSING_DAY' }, { date: '2026-03-05', classification: 'QUARANTINED_SINGLE_BAR' }] }] },
    { securityId: 'B', mic: 'XETR', firstRawDate: '2026-03-02', lastRawDate: '2026-03-11', lastApprovedDate: '2026-03-11', priceOrIdentityBreaks: [],
      allGaps: [{ from: '2026-03-03', to: '2026-03-05', classification: 'PROVIDER_DATA_GAP', causes: [{ date: '2026-03-04', classification: 'PROVIDER_MISSING_DAY' }] }] }] };
  return { catalog, manifest: { generatedAt: '2026-03-14T00:00:00Z' }, series, inventory, calendarAudit };
}

test('audited calendar overrides the rule calendar inside its coverage', () => {
  const cal = makeCalendar(calendarAudit);
  assert.deepEqual(cal.sessions('XETR', '2026-03-02', '2026-03-13'), sessions);
  assert.equal(cal.deviations('XETR').ruleSessionAuditedClosed.length, 1);
});

test('every missing session gets exactly one primary cause', () => {
  const r = buildReport(fixture());
  assert.equal(r.providerRequests, 0);
  assert.equal(r.pricesIncluded, false);
  // A: 03-04 provider (only 2 eligible < 5: no calendar recheck), 03-05 identity hold.
  // B: 03-04 same MIC-date, tail 03-12, 03-13 -> symbol change suspected.
  assert.deepEqual(r.q4.primaryCause, { CALENDAR_DEVIATION_SUSPECTED: 0, IDENTITY_HOLD: 1, SYMBOL_CHANGE_SUSPECTED: 2, QUARANTINE: 0, PROVIDER_NO_DATA: 2, UNEXPLAINED: 0 });
  assert.equal(r.q4.total, 5);
  assert.equal(r.q1.withAnyMissingSession, 2);
  assert.deepEqual(r.q1.withStaleTail, ['BBB.PA']);
  assert.equal(r.q3.gapLengthSessions.max, 2);
  assert.equal(r.q3.sharedOutageDaysTop25[0].date, '2026-03-04');
  assert.equal(r.q3.sharedOutageDaysTop25[0].securities, 2);
  assert.equal(r.q2.MAX.all.continuousValid, 0);
  assert.equal(r.consistency.ledgerDatesNotRecomputed, 0);
  assert.deepEqual(buildReport(fixture()), r, 'deterministic');
});

test('calendar recheck only when every eligible security (>= 5) is absent', () => {
  const row = (id, absent) => ({ securityId: id, mic: 'XETR', firstRawDate: '2026-03-02', lastRawDate: '2026-03-13', priceOrIdentityBreaks: [],
    allGaps: absent ? [{ from: '2026-03-03', to: '2026-03-05', causes: [{ date: '2026-03-04', classification: 'PROVIDER_MISSING_DAY' }] }] : [] });
  const all = micDateClusters({ rows: ['A', 'B', 'C', 'D', 'E'].map(id => row(id, true)) }).get('XETR|2026-03-04');
  assert.equal(all.calendarRecheck, true);
  assert.equal(all.classification, 'MARKET_WIDE');
  const one = micDateClusters({ rows: ['A', 'B', 'C', 'D', 'E'].map(id => row(id, id !== 'E')) }).get('XETR|2026-03-04');
  assert.equal(one.calendarRecheck, false);
  assert.equal(one.missing, 4);
});

test('billing reads x-increment-usage per request, errors included', () => {
  const h = (inc, rem) => ({ 'x-increment-usage': String(inc), 'x-quota-remaining': String(rem), 'x-quota-limit': '100000', 'x-ratelimit-limit-second': '5' });
  const b = billing({ httpStatusCounts: { 200: 1, 422: 1 }, requests: [
    { seq: 1, endpoint: '/eod', params: { symbols: 'X.PA,Y.PA,Z.PA' }, httpStatus: 200, rateAndCreditHeaders: h(3, 100) },
    { seq: 2, endpoint: '/eod', params: { symbols: 'W.PA' }, httpStatus: 422, rateAndCreditHeaders: h(1, 97) }] });
  assert.equal(b.creditsBooked, 4);
  assert.equal(b.byStatus[422].creditsBooked, 1);
  assert.equal(b.quotaRemainingAfter, 96);
  assert.equal(b.multiSymbolRequests[0].increment, 3);
});

test('refuses output inside the repository except the report folder', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  assert.throws(() => safeOut(join(root, 'discover/data/europe')), /OUTPUT_INSIDE_REPOSITORY_REFUSED/);
  assert.throws(() => safeOut('relative/dir'), /ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED/);
  assert.ok(safeOut(join(root, 'docs/reports/europe-marketstack-support-report-20261103')));
  const tmp = mkdtempSync(join(tmpdir(), 'gap-impact-'));
  assert.equal(safeOut(tmp), tmp);
});
