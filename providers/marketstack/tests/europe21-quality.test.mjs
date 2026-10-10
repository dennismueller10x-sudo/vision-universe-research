import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEodBars } from '../../../scripts/marketstack/europe-quality.mjs';
import { classifyQuarantineBar, summarizeQuarantine, inspectContiguousLoss, mergeMissingDateObservations, buildEurope21HistoryOverlay } from '../../../scripts/marketstack/europe21-quality.mjs';

const listing = { providerTicker: 'SAP.DE', mic: 'XETR', currency: 'EUR', securityId: 'fixture-security', listingId: 'fixture-listing' };
const calendar = { verified: true, source: 'independent-fixture-session-list', mic: 'XETR', expectedLastCompletedSession: '2026-10-08',
  expectedSessions: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'] };
const now = '2026-10-09T10:00:00Z';
const bar = (date, fields = {}) => ({ date, symbol: 'SAP.DE', exchange: 'XETR', currency: 'EUR', open: 10, high: 11, low: 9, close: 10, volume: 100, ...fields });

test('originating request ranges retain cached and new out-of-range rows as chart and research barriers', () => {
  const oldSource = 'a'.repeat(64), newSource = 'b'.repeat(64), latestSource = 'c'.repeat(64);
  const cachedBars = [bar('2026-10-05', { provenance: { normalizedSha256: oldSource } }),
    bar('2026-10-07', { provenance: { normalizedSha256: oldSource } })];
  const additions = [bar('2026-10-06', { provenance: { normalizedSha256: newSource } }),
    bar('2026-10-08', { provenance: { normalizedSha256: latestSource } })];
  const sourceRequestRanges = { [oldSource]: { from: '2026-10-06', to: '2026-10-08' },
    [newSource]: { from: '2026-10-07', to: '2026-10-08' } };
  const result = buildEurope21HistoryOverlay({ cachedBars, additions, listing, calendar, now,
    protectedQuarantineDates: [], sourceReceipts: [{ normalizedSha256: oldSource }, { normalizedSha256: newSource }, { normalizedSha256: latestSource }], sourceRequestRanges });
  assert.deepEqual(result.quality.validBars.map(bar => bar.date), ['2026-10-07', '2026-10-08']);
  assert.deepEqual(result.quality.counts, { raw: 4, valid: 2, quarantined: 2 });
  assert.ok(result.quality.quarantine.every(bar => bar.reasons.includes('OUTSIDE_REQUESTED_RANGE')));
  assert.equal(result.quality.quarantine[0].raw, cachedBars[0]);
  assert.equal(result.quality.quarantine[1].raw, additions[0]);
  assert.equal(result.projection.quality.observations, 2);
  assert.deepEqual(result.receipt.sourceRequestRanges, sourceRequestRanges);
  assert.equal(result.receipt.sourceRequestRangesSha256.length, 64);
  assert.throws(() => mergeMissingDateObservations({ cachedBars, additions, listing, calendar, now,
    protectedQuarantineDates: [], sourceRequestRanges: { [oldSource]: { from: '2026-10-99' } } }), /INVALID_REQUEST_RANGE/);
});

test('quarantine counting separates exclusive totals from overlapping defects and retains originals', () => {
  const raw = [bar('2026-10-05', { close: 0 }), bar('2026-10-06', { close: null }), bar('2026-10-07', { high: 8 })];
  const q = validateEodBars(raw, { listing, calendar, now });
  const result = summarizeQuarantine(q);
  assert.equal(result.total, 3); assert.equal(Object.values(result.primary).reduce((a,b) => a+b,0), 3);
  assert.equal(result.primary.ZERO_PRICE, 1); assert.equal(result.primary.MISSING_FIELD, 1); assert.equal(result.primary.INVALID_OHLC, 1);
  assert.equal(result.inclusive.INVALID_OHLC, 2); assert.equal(result.rows[0].originalBar.raw, raw[0]);
  assert.equal(result.quarantineReleased, 0);
  assert.equal(classifyQuarantineBar({ raw: bar('2026-10-08'), reasons: ['OUTSIDE_LISTING_IDENTITY_INTERVAL'] }).primary, 'OTHER');
});

test('new evidence may fill absent session and extend unchanged raw research without promoting strict gates', () => {
  const cachedBars = [bar('2026-10-05'), bar('2026-10-07'), bar('2026-10-08')];
  const old = inspectContiguousLoss({ quality: validateEodBars(cachedBars, { listing, calendar, now }), listing, calendar });
  assert.equal(old.cause, 'MISSING_PRECEDING_SESSION'); assert.equal(old.precedingSession, '2026-10-06');
  const merged = mergeMissingDateObservations({ cachedBars, additions: [bar('2026-10-06')], listing, calendar, now, protectedQuarantineDates: [] });
  const next = inspectContiguousLoss({ quality: merged.researchQuality, listing, calendar });
  assert.equal(old.projection.quality.observations, 2); assert.equal(next.projection.quality.observations, 4);
  assert.equal(next.projection.technical, 'TECHNICAL_PARTIAL'); assert.equal(next.projection.rsStatus, 'RS_BLOCKED');
  assert.equal(next.projection.quantReady, false); assert.equal(next.projection.publicationReady, false);
  assert.deepEqual(merged.addedValidDates, ['2026-10-06']); assert.equal(merged.rawBars[0], cachedBars[0]);
});

test('changed observations on cached or quarantined dates cannot replace or release prior bars', () => {
  const bad = bar('2026-10-06', { close: 0 });
  const cachedBars = [bar('2026-10-05'), bad, bar('2026-10-07'), bar('2026-10-08')];
  const merged = mergeMissingDateObservations({ cachedBars, additions: [bar('2026-10-06'), bar('2026-10-07', { close: 10.5 })],
    listing, calendar, now, protectedQuarantineDates: ['2026-10-06'] });
  assert.equal(merged.rejectedAdditions.length, 2); assert.equal(merged.rawBars[1], bad);
  assert.equal(merged.quality.quarantine.length, 1); assert.equal(merged.quarantineReleased, 0);
  assert.equal(inspectContiguousLoss({ quality: merged.researchQuality, listing, calendar }).projection.quality.observations, 2);
  const subset = mergeMissingDateObservations({ cachedBars: cachedBars.filter(x => x !== bad), additions: [bar('2026-10-06')],
    listing, calendar, now, protectedQuarantineDates: ['2026-10-06'] });
  assert.equal(subset.rejectedAdditions[0].reason, 'PREVIOUS_QUARANTINE_DATE_PROTECTED');
  assert.equal(inspectContiguousLoss({ quality: subset.researchQuality, listing, calendar }).projection.quality.observations, 2);
});

test('duplicate new date, foreign MIC, future bar and malformed currency stay quarantined', () => {
  for (const additions of [[bar('2026-10-06'),bar('2026-10-06')], [bar('2026-10-06',{exchange:'XNAS'})],
    [bar('2026-10-12')], [bar('2026-10-06',{currency:false})]]) {
    const merged = mergeMissingDateObservations({ cachedBars: [bar('2026-10-05')], additions, listing, calendar, now, protectedQuarantineDates: [] });
    assert.equal(merged.addedValidDates.length, 0); assert.equal(merged.quality.quarantine.length, additions.length);
    assert.equal(merged.rawBars.length, additions.length+1);
  }
});

test('immutable previous quarantine evidence is an explicit required input', () => {
  assert.throws(() => mergeMissingDateObservations({ cachedBars: [bar('2026-10-05')], additions: [bar('2026-10-06')], listing, calendar, now }), /BAR_ARRAYS_REQUIRED/);
});

test('changed evaluation conditions cannot re-admit an explicitly frozen quarantine date', () => {
  const cachedBars = [bar('2026-10-05'),bar('2026-10-06'),bar('2026-10-07'),bar('2026-10-08')];
  const result = mergeMissingDateObservations({ cachedBars, additions: [], listing, calendar, now, protectedQuarantineDates: ['2026-10-06'] });
  assert.equal(result.quality.validBars.some(bar => bar.date === '2026-10-06'), false);
  assert.equal(result.quality.quarantine[0].raw, cachedBars[1]);
  assert.deepEqual(result.quality.quarantine[0].reasons, ['PREVIOUS_QUARANTINE_DATE_PROTECTED']);
  assert.deepEqual(result.quality.counts, { raw: 4, valid: 3, quarantined: 1 });
  assert.equal(inspectContiguousLoss({ quality: result.researchQuality, listing, calendar }).projection.quality.observations, 2);
});

test('producer overlay binds cached/new source inputs and unchanged raw feature output without forged provider page', () => {
  const cachedBars = [bar('2026-10-05'),bar('2026-10-06'),bar('2026-10-07')];
  const sourceReceipts = [{ normalizedSha256: 'f'.repeat(64), origin: 'UPSTREAM_RAW_LOADER_FIXTURE' }];
  const result = buildEurope21HistoryOverlay({ cachedBars, additions: [bar('2026-10-08')], listing, calendar, now,
    protectedQuarantineDates: [], sourceReceipts });
  assert.equal(result.projection.quality.observations, 4); assert.equal(result.projection.asOf, '2026-10-08');
  assert.equal(result.receipt.securityId, listing.securityId); assert.equal(result.receipt.researchSeriesHash, result.projection.seriesHash);
  assert.equal(result.receipt.projectionSha256.length, 64); assert.equal(result.receipt.upstreamSourceAuthenticationRequired, true);
  assert.equal(result.receipt.existingBarsReplaced, 0); assert.equal(result.projection.quantReady, false);
  sourceReceipts[0].origin = 'MUTATED'; assert.equal(result.receipt.sourceReceipts[0].origin, 'UPSTREAM_RAW_LOADER_FIXTURE');
  assert.throws(() => buildEurope21HistoryOverlay({ cachedBars: [['2026-10-05',10]], additions: [], listing, calendar, now,
    protectedQuarantineDates: [], sourceReceipts }), /OHLC_WRAPPERS_REQUIRED/);
});
