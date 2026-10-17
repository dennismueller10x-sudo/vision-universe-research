// Corporate-action protocol 3.0.0: second source (finra-daily-list.js), event semantics of large jumps
// (discontinuity-semantics.js) and the validity contract canonical-price-validity-3.0.0 (RESUME_FROM segments).
// Synthetic series only; FINRA rows are shaped like api.finra.org otcDailyList rows without issuer names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FDL = require('../engines/finra-daily-list.js');
const DS = require('../engines/discontinuity-semantics.js');
const CAV = require('../engines/corporate-action-validation.js');
const PV = require('../engines/canonical-price-validity.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));

const CONFIRMED = { state: 'CONFIRMED' };
function series(n, { start = '2014-01-02', p0 = 10, vol = 100000, seed = 1 } = {}) {
  let x = seed, p = p0; const out = []; let t = Date.parse(start + 'T00:00:00Z');
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  while (out.length < n) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const r = 1 + (rnd() - 0.5) * 0.04; const prev = p; p = p * r;
      out.push({ date: new Date(t).toISOString().slice(0, 10), open: prev * (1 + (rnd() - 0.5) * 0.01), high: p * 1.01, low: p * 0.99, close: p,
        volume: Math.round(vol * (0.8 + rnd() * 0.4)), splitFactor: 1, dividend: 0, adjustedClose: p });
    }
    t += 864e5;
  }
  return out;
}
/** Scale change by m at index i (price x m, share volume / m): an undeclared split (m > 1 reverse, m < 1 forward). */
const rescale = (bars, i, m) => bars.map((b, j) => j < i ? b : { ...b, open: b.open * m, high: b.high * m, low: b.low * m, close: b.close * m, adjustedClose: b.adjustedClose * m, volume: Math.round(b.volume / m) });
/** Genuine move by m at index i: price x m from i on, share volume on day i x vMult (news), no rescaling of later volume. */
const genuine = (bars, i, m, vMult) => bars.map((b, j) => j < i ? b : { ...b, open: b.open * m, high: b.high * m, low: b.low * m, close: b.close * m, adjustedClose: b.adjustedClose * m, volume: j === i ? b.volume * vMult : b.volume });
const finraRow = (o) => ({ OTCDailyListID: 1, dailyListEventCode: 'DA', dailyListReasonDescription: 'Reverse Split/CUSIP Change', oldSymbolCode: 'TEST', newSymbolCode: 'TESTD',
  oldSecurityDescription: 'Test Mining Corp Common Stock', newSecurityDescription: 'Test Mining Corp Common Stock', reverseSplitRate: '1:20', forwardSplitRate: null, stockPercentage: null,
  exDate: '2014-10-20 00:00:00.0', dailyListDatetime: '2014-10-16 17:02:11.0', calendarDay: '2014-10-16', ...o });

/* ---------------- FINRA OTC Daily List ---------------- */

test('F1: FINRA rows -> ratio in splitFactor convention, kinds, PIT visibility from the publication timestamp', () => {
  assert.equal(FDL.ratioOf({ reverseSplitRate: '1:10' }), 0.1);
  assert.equal(FDL.ratioOf({ forwardSplitRate: '3:1' }), 3);
  assert.ok(Math.abs(FDL.ratioOf({ reverseSplitRate: '1:10', forwardSplitRate: '2:1' }) - 0.2) < 1e-12, 'reverse followed by forward = product');
  assert.equal(FDL.ratioOf({ stockPercentage: 50, dailyListReasonDescription: 'Stock Dividend Regular' }), 1.5);
  assert.equal(FDL.ratioOf({ stockPercentage: 5, dailyListReasonDescription: 'Stock Dividend Regular' }), null, 'small stock dividends are not split-like');
  const o = FDL.observation(finraRow({}));
  assert.equal(o.kind, 'SPLIT'); assert.equal(o.visibleAt, '2014-10-16'); assert.equal(o.exDate, '2014-10-20');
  assert.equal(FDL.kindOf({ dailyListReasonDescription: 'Market Center Change Delisted from NASDAQ' }), 'EXCHANGE_DELISTING_TO_OTC');
  assert.equal(FDL.kindOf({ dailyListReasonDescription: 'Symbol Change', changeSymbolFlag: 'Y' }), 'SYMBOL_CHANGE');
});

test('F2: identity - symbol in the listing window and a non-contradicting name; a reused symbol of another issuer is dropped', () => {
  const obs = [FDL.observation(finraRow({})), FDL.observation(finraRow({ OTCDailyListID: 2, exDate: '2021-03-01 00:00:00.0', dailyListDatetime: '2021-02-26 16:00:00.0', oldSecurityDescription: 'Other Biotech Holdings Inc' }))];
  const l = FDL.forListing(obs, { ticker: 'TEST', from: '2014-01-02', to: null, name: 'Test Mining Corporation' });
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].identity.basis, ['SYMBOL_IN_LISTING_WINDOW', 'NAME_MATCH']);
  assert.equal(FDL.forListing(obs, { ticker: 'TEST', from: '2016-01-01', to: '2018-01-01', name: 'Test Mining' }).length, 0, 'outside the window');
});

test('F3: a later cancellation (DD) removes the event from its own publication on; earlier views keep it', () => {
  const obs = [FDL.observation(finraRow({})), FDL.observation(finraRow({ OTCDailyListID: 3, dailyListEventCode: 'DD', dailyListDatetime: '2014-10-18 09:00:00.0', calendarDay: '2014-10-18' }))];
  const ev = FDL.splitEvents(FDL.forListing(obs, { ticker: 'TEST', from: '2014-01-02', name: 'Test Mining' }))[0];
  assert.equal(ev.stage, 'CANCELLED_OR_UNDATED');
  assert.equal(FDL.eventAsOf(ev, '2014-10-17').stage, 'EFFECTIVE');
  assert.equal(FDL.eventAsOf(ev, '2014-10-16'), null, 'strictly before asOf');
  assert.equal(FDL.eventAsOf(ev, '2014-10-20').stage, 'CANCELLED_OR_UNDATED');
});

function finraEventsFor(raw, i, rate, published) {
  const row = finraRow({ exDate: raw[i].date + ' 00:00:00.0', dailyListDatetime: published + ' 17:00:00.0', calendarDay: published, reverseSplitRate: rate });
  return FDL.splitEvents(FDL.forListing([FDL.observation(row)], { ticker: 'TEST', from: raw[0].date, name: 'Test Mining' }));
}

test('F4: a FINRA-confirmed undeclared reverse split is normalized like an SEC one (second source in the core)', () => {
  const raw = rescale(series(300), 200, 20);
  const c = PV.build(raw, { identity: CONFIRMED, finraEvents: finraEventsFor(raw, 200, '1:20', raw[197].date) });
  assert.equal(c.state, 'FULL_VALID');
  const e = c.evidence.find((x) => x.outcome === 'NORMALIZE');
  assert.equal(e.secEvent.system, 'FINRA_OTC_DAILY_LIST');
  assert.deepEqual(e.corroboration, ['SHARE_VOLUME']);
  assert.ok(Math.abs(c.tr[200] / c.tr[199] - raw[200].close / 20 / raw[199].close) < 1e-9);
  /* PIT: before the FINRA publication the jump is a held price signature */
  assert.equal(PV.build(raw, { identity: CONFIRMED, finraEvents: finraEventsFor(raw, 200, '1:20', raw[197].date), asOf: raw[197].date }).hold, null);
});

const secEv = (o) => ({ ratio: 1 / 20, direction: 'REVERSE', stage: 'EFFECTIVE', scheduled: false, confidence: 'HIGH', sources: [{ system: 'SEC_EDGAR', form: '8-K', accession: 'x', filedDate: o.visibleAt }],
  stageVisibleAt: { EFFECTIVE: o.visibleAt }, tickerMentioned: true, provenanceHash: 'p', ...o });

test('F5: SEC and FINRA disagree on the ratio -> CONFLICTING, held from the event (no normalization)', () => {
  const raw = rescale(series(300), 200, 20);
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [secEv({ marketDate: raw[200].date, visibleAt: raw[197].date })], finraEvents: finraEventsFor(raw, 200, '1:10', raw[197].date) });
  assert.equal(c.normalized, 0);
  assert.equal(c.hold.from, raw[200].date);
  assert.equal(c.hold.evidenceClass, 'CONFLICTING_CORPORATE_ACTION');
  assert.ok(c.evidence.some((e) => e.reason === 'SOURCES_DISAGREE_ON_RATIO'));
});

test('F6: SEC and FINRA agree -> the normalization carries both sources (SECOND_SOURCE corroboration)', () => {
  const raw = rescale(series(300), 200, 20).map((b, j) => j === 200 ? { ...b, volume: b.volume * 40 } : b); /* volume not in split direction */
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [secEv({ marketDate: raw[200].date, visibleAt: raw[197].date })], finraEvents: finraEventsFor(raw, 200, '1:20', raw[196].date) });
  const e = c.evidence.find((x) => x.outcome === 'NORMALIZE');
  assert.ok(e && e.corroboration.includes('SECOND_SOURCE'));
  assert.ok(e.sources.some((s) => s.system === 'FINRA_OTC_DAILY_LIST' && s.role === 'SECOND_SOURCE'));
});

test('F7: 3.0.0 - an SEC effective event without any second confirmation no longer normalizes (any ratio); the jump is held', () => {
  const raw = rescale(series(300), 200, 20).map((b, j) => j === 200 ? { ...b, volume: b.volume * 40 } : b);
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [secEv({ marketDate: raw[200].date, visibleAt: raw[197].date })] });
  assert.equal(c.normalized, 0);
  assert.ok(c.evidence.some((e) => e.reason === 'EFFECTIVE_EVENT_UNCORROBORATED'));
  assert.equal(c.hold.from, raw[200].date);
  assert.equal(c.hold.evidenceClass, 'PROBABLE_CORPORATE_ACTION');
});

/* ---------------- event semantics of large jumps ---------------- */

test('S1: undeclared FORWARD split (downward 1:4, share volume x4, dollar volume normal) is a FORWARD_SPLIT and held', () => {
  const raw = rescale(series(300), 150, 1 / 4);
  const c = DS.classify(raw, 150);
  assert.equal(c.cause, 'FORWARD_SPLIT'); assert.equal(c.direction, 'DOWN'); assert.equal(c.outcome, 'HOLD_FROM');
  const v = PV.build(raw, { identity: CONFIRMED });
  assert.equal(v.hold.from, raw[150].date); assert.equal(v.hold.reason, 'UNDECLARED_SPLIT_SIGNATURE');
  assert.equal(v.hold.evidenceClass, 'PRICE_DISCONTINUITY_NO_CA_EVIDENCE');
});

test('S2: a genuine crash (-80 % overnight on 30x share volume) is a GENUINE_MOVE and stays valid', () => {
  const raw = genuine(series(300), 150, 0.2, 30);
  assert.equal(DS.classify(raw, 150).cause, 'GENUINE_MOVE');
  assert.equal(PV.build(raw, { identity: CONFIRMED }).state, 'FULL_VALID');
});

test('S3: a special distribution explains a downward jump (provider dividend on the day)', () => {
  const raw = genuine(series(300), 150, 0.25, 1).map((b, j) => j === 150 ? { ...b, dividend: 0.75 * 10 } : b);
  /* only the classification is tested here; the dividend arithmetic belongs to the core */
  const c = DS.classify(raw, 150);
  assert.equal(c.cause, 'SPECIAL_DISTRIBUTION'); assert.equal(c.outcome, 'ACCEPT');
});

test('S4: unit change x100 (share volume unchanged) is CURRENCY_OR_UNIT and quarantined from the day', () => {
  const raw = genuine(series(300), 150, 100, 1);
  const c = DS.classify(raw, 150);
  assert.equal(c.cause, 'CURRENCY_OR_UNIT');
  const v = PV.build(raw, { identity: CONFIRMED });
  assert.equal(v.hold.state, 'QUARANTINE'); assert.equal(v.hold.reason, 'CURRENCY_OR_UNIT_CHANGE');
});

test('S5: an extreme bad tick reverting after two sessions becomes INVALID_RANGE (two bars); causal at the revert bar', () => {
  const raw = series(300).map((b, j) => j === 120 || j === 121 ? { ...b, close: b.close * 40, open: b.open * 40, adjustedClose: b.adjustedClose * 40 } : b);
  const v = PV.build(raw, { identity: CONFIRMED });
  assert.equal(v.state, 'VALID_WITH_INVALID_BARS');
  const x = v.invalidRanges.find((r) => r.reason === 'BAD_TICK_REVERTED');
  assert.deepEqual([x.from, x.to, x.observedAt], [raw[120].date, raw[121].date, raw[122].date]);
  /* as of the first bad bar it is an unexplained extreme jump: held (a disclosed PIT revision, not a leak) */
  const pit = PV.build(raw, { identity: CONFIRMED, asOf: raw[120].date });
  assert.equal(pit.hold && pit.hold.from, raw[120].date);
});

test('S6: data staleness - an extreme jump after a run of identical quotes is quarantined, not accepted', () => {
  let raw = series(300);
  raw = raw.map((b, j) => j >= 140 && j < 150 ? { ...b, close: raw[139].close, open: raw[139].close, adjustedClose: raw[139].close, volume: 0 } : b);
  raw = genuine(raw, 150, 12, 1);
  assert.equal(DS.classify(raw, 150).cause, 'DATA_STALENESS');
  assert.equal(PV.build(raw, { identity: CONFIRMED }).hold.reason, 'STALE_THEN_EXTREME_JUMP');
});

test('S7: a FINRA market-center change at the jump is a LISTING_CHANGE -> TERMINAL (no resume across listings)', () => {
  const raw = genuine(series(300), 150, 0.05, 1);
  const listingEvents = [{ kind: 'EXCHANGE_DELISTING_TO_OTC', date: raw[150].date, visibleAt: raw[148].date }];
  assert.equal(DS.classify(raw, 150, { listingEvents }).cause, 'LISTING_CHANGE');
  const v = PV.build(raw, { identity: CONFIRMED, listingEvents });
  assert.equal(v.hold.state, 'TERMINAL'); assert.equal(v.segments.length, 1); assert.equal(v.view.TERMINAL.from, raw[150].date);
});

test('S8: an extreme upward jump without split signature and without abnormal dollar volume is UNRESOLVED and held', () => {
  const raw = genuine(series(300), 150, 15, 1.2);
  assert.equal(DS.classify(raw, 150).cause, 'UNRESOLVED');
  assert.equal(PV.build(raw, { identity: CONFIRMED }).hold.reason, 'UNEXPLAINED_EXTREME_DISCONTINUITY');
});

test('S9: a genuine extreme squeeze (12x on 40x share volume) is accepted (no global cap); below 10x unresolved moves only count', () => {
  assert.equal(PV.build(genuine(series(300), 150, 12, 40), { identity: CONFIRMED }).state, 'FULL_VALID');
  assert.equal(PV.build(genuine(series(300), 150, 4, 1.1), { identity: CONFIRMED }).state, 'FULL_VALID');
});

test('S10: residual of a declared split is classified on g = factor x raw move; a 10x residual is already a core quarantine', () => {
  const raw = rescale(series(300), 150, 20).map((b, j) => j === 150 ? { ...b, splitFactor: 0.5 } : b);
  const c = DS.classify(raw, 150);
  assert.ok(c.onDeclaredSplit); assert.ok(Math.abs(Math.log(c.ratio / 10)) < 0.05); assert.equal(c.cause, 'REVERSE_SPLIT');
  const v = PV.build(raw, { identity: CONFIRMED });
  assert.equal(v.hold.from, raw[150].date); assert.equal(v.hold.reason, 'CORPORATE_ACTION_CONTRADICTED');
  /* a residual under 3:1 is not a semantic candidate (documented limit; the core band 0.4..2.5 applies) */
  assert.equal(DS.classify(rescale(series(300), 150, 4).map((b, j) => j === 150 ? { ...b, splitFactor: 0.5 } : b), 150), null);
});

/* ---------------- validity contract 3.0.0: RESUME_FROM ---------------- */

test('R1: after an undeclared split hold the series resumes as a new segment; no return across the break', () => {
  const raw = rescale(series(600), 300, 20);
  const v = PV.build(raw, { identity: CONFIRMED });
  assert.equal(v.validUntil, raw[299].date, '2.x fields describe the first segment');
  assert.equal(v.segments.length, 2);
  assert.equal(v.segments[1].from, raw[300].date); assert.equal(v.segments[1].to, raw[599].date);
  assert.equal(v.resumedBars, 300); assert.equal(v.usableBars, 600);
  assert.deepEqual(v.view.RESUME_FROM.map((x) => x.from), [raw[300].date]);
  assert.equal(PV.isValidReturn(v, raw[299].date, raw[300].date), false);
  assert.equal(PV.isValidReturn(v, raw[300].date, raw[301].date), true);
  const a = PV.alignSegments(v, raw.map((b) => b.date));
  assert.ok(Math.abs(a.tr[301] / a.tr[300] - raw[301].close / raw[300].close) < 1e-9);
  assert.equal(a.segment[299], 0); assert.equal(a.segment[300], 1);
  assert.ok(v.intervals.some((x) => x.state === 'RESUME_FROM' && x.from === raw[300].date));
});

test('R2: no resume after quarantine for data contradictions or across a listing change', () => {
  const st = (() => { let raw = series(300); raw = raw.map((b, j) => j >= 140 && j < 150 ? { ...b, close: raw[139].close, open: raw[139].close, adjustedClose: raw[139].close, volume: 0 } : b); return genuine(raw, 150, 12, 1); })();
  assert.equal(PV.build(st, { identity: CONFIRMED }).segments.length, 1);
});

test('R3: PIT - an as-of view never contains a segment, hold or bar after its as-of day', () => {
  const raw = rescale(rescale(series(700), 300, 20), 500, 1 / 4);
  const fin = PV.build(raw, { identity: CONFIRMED });
  assert.equal(fin.segments.length, 3);
  for (const k of [299, 300, 301, 450, 500, 501]) {
    const v = PV.build(raw, { identity: CONFIRMED, asOf: raw[k].date });
    assert.ok(v.last <= raw[k].date);
    assert.ok(v.segments.every((s) => s.to <= raw[k].date));
    assert.ok(v.holds.every((h) => h.from <= raw[k].date));
    /* truncation oracle: the as-of view equals a build on the truncated input */
    const o = PV.build(raw.slice(0, k + 1), { identity: CONFIRMED });
    assert.deepEqual(v.segments.map((s) => [s.from, s.to]), o.segments.map((s) => [s.from, s.to]));
    assert.deepEqual(v.holds.map((h) => [h.from, h.reason]), o.holds.map((h) => [h.from, h.reason]));
  }
});

/* ---------------- blinding: the label module must not read the mechanism ---------------- */

test('B1: scripts/quant/corporate-action-v3/labels.mjs imports no validity/semantics/evidence engine', () => {
  const src = fs.readFileSync(path.join(HERE, '../../scripts/quant/corporate-action-v3/labels.mjs'), 'utf8');
  for (const forbidden of ['canonical-price-validity', 'discontinuity-semantics', 'corporate-action-validation', 'canonical-total-return', 'price-integrity'])
    assert.ok(!src.includes(forbidden), `labels.mjs must not reference ${forbidden}`);
});

test('B2: versions', () => {
  assert.equal(PV.VERSION, 'canonical-price-validity-3.0.0');
  assert.equal(CAV.VERSION, 'corporate-action-validation-3.0.0');
  assert.equal(CAV.CONTRACT, 'corporate-action-contract-3.0.0');
  assert.equal(DS.VERSION, 'discontinuity-semantics-1.0.0');
  assert.equal(FDL.VERSION, 'finra-daily-list-1.0.0');
});
