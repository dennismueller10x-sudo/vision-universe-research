// Corporate-action contract 2.0.0: SEC evidence (sec-corporate-actions.js), evidence model
// (corporate-action-validation.js) and the validity-interval contract (canonical-price-validity.js).
// Synthetic series only; SEC sentences are paraphrased filing language without issuer names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SEC = require('../engines/sec-corporate-actions.js');
const CAV = require('../engines/corporate-action-validation.js');
const PV = require('../engines/canonical-price-validity.js');
const CTR = require('../engines/canonical-total-return.js');

const CONFIRMED = { state: 'CONFIRMED' };

/** Business days from start; deterministic pseudo-random walk. */
function series(n, { start = '2014-01-02', p0 = 10, vol = 100000, seed = 1, drift = 0 } = {}) {
  let x = seed, p = p0; const out = []; let t = Date.parse(start + 'T00:00:00Z');
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  while (out.length < n) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const r = 1 + drift + (rnd() - 0.5) * 0.04; const prev = p; p = p * r;
      out.push({ date: new Date(t).toISOString().slice(0, 10), open: prev * (1 + (rnd() - 0.5) * 0.01), high: p * 1.01, low: p * 0.99, close: p,
        volume: Math.round(vol * (0.8 + rnd() * 0.4)), splitFactor: 1, dividend: 0, adjustedClose: p });
    }
    t += 864e5;
  }
  return out;
}
/** Undeclared reverse split 1:k at index i: raw price x k from i on, share volume / k; provider adjustedClose jumps with raw (missed). */
function undeclaredReverse(bars, i, k) {
  return bars.map((b, j) => j < i ? b : { ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k, adjustedClose: b.adjustedClose * k, volume: Math.round(b.volume / k) });
}
function declaredReverse(bars, i, k, factor = 1 / k) {
  const out = undeclaredReverse(bars, i, k);
  return out.map((b, j) => ({ ...b, adjustedClose: j < i ? b.close * 1 / k * k / k : b.close / k * k / k, splitFactor: j === i ? factor : 1 }))
    .map((b) => ({ ...b, adjustedClose: b.close }));
}
const ev = (o) => ({ ratio: 1 / 20, direction: 'REVERSE', stage: 'EFFECTIVE', scheduled: false, confidence: 'HIGH', sources: [{ system: 'SEC_EDGAR', form: '8-K', accession: 'x', filedDate: o.visibleAt }],
  stageVisibleAt: { EFFECTIVE: o.visibleAt }, tickerMentioned: true, provenanceHash: 'p', ...o });

/* ---------------- SEC extraction ---------------- */

test('SEC E1: effective reverse split with ratio, effective time and split-adjusted market date', () => {
  const t = 'Item 3.03. The Board approved a 1-for-60 reverse stock split of the issued and outstanding shares of common stock (the "Reverse Stock Split"). The Articles of Amendment were effective at 5:00 p.m. Eastern Time on January 20, 2023. The Reverse Stock Split became effective at the Effective Time and was reflected in the marketplace at the open of trading on January 23, 2023, whereupon the shares began trading on a split-adjusted basis.';
  const e = SEC.filingEvents(t, { form: '8-K', items: ['3.03', '5.03'], filedDate: '2023-01-23' });
  const x = e.find((z) => z.ratio !== null);
  assert.equal(x.stage, 'EFFECTIVE');
  assert.ok(Math.abs(x.ratio - 1 / 60) < 1e-12);
  assert.equal(x.direction, 'REVERSE');
  assert.equal(x.marketDate, '2023-01-23');
  assert.equal(x.confidence, 'HIGH');
  assert.equal(x.visibleAt, '2023-01-23');
});

test('SEC E2: an approved range is never an effective event and carries no ratio', () => {
  const t = 'At the annual meeting the stockholders approved a proposal to effect a reverse stock split at a ratio of not less than 1-for-2 and not more than 1-for-20, with the exact ratio to be determined by the Board.';
  const e = SEC.filingEvents(t, { form: '8-K', items: ['5.07'], filedDate: '2024-01-10' });
  assert.ok(e.length >= 1);
  assert.ok(e.every((z) => z.stage !== 'EFFECTIVE'));
  assert.ok(e.every((z) => z.ratio === null));
});

test('SEC E3: a proposal is ANNOUNCED, an approval is APPROVED', () => {
  const a = SEC.filingEvents('The proposal to effect a 1-for-10 reverse stock split will be voted on at the special meeting.', { form: 'DEF 14A', filedDate: '2020-01-02' });
  assert.equal(a[0].stage, 'ANNOUNCED');
  const b = SEC.filingEvents('On April 12, 2024, the Board of Directors approved a 1-for-20 reverse stock split.', { form: '8-K', filedDate: '2024-04-12' });
  assert.equal(b[0].stage, 'APPROVED');
  assert.ok(Math.abs(b[0].ratio - 0.05) < 1e-12);
});

test('SEC E4: anti-dilution boilerplate is not an event', () => {
  const t = 'In case of any reclassification, stock split, or reverse stock split, capital reorganization, stock dividend or other change of outstanding shares of Common Stock, the number of Warrant Shares shall be proportionately adjusted.';
  assert.equal(SEC.filingEvents(t, { form: '8-K', filedDate: '2006-03-22' }).length, 0);
});

test('SEC E5: forward split, "every N shares combined into one" and a share consolidation', () => {
  const f = SEC.filingEvents('The Company effected a three-for-two stock split on June 3, 2015.', { form: '8-K', filedDate: '2015-06-04' })[0];
  assert.equal(f.direction, 'FORWARD'); assert.equal(f.ratio, 1.5); assert.equal(f.stage, 'EFFECTIVE');
  const c = SEC.filingEvents('As a result of the Reverse Stock Split, every 80 shares of issued and outstanding Common Stock will be combined into one share of Common Stock. The Class A Common Stock will begin trading on a split-adjusted basis when the market opens on Thursday, April 18, 2024.', { form: '8-K', items: ['3.03'], filedDate: '2024-04-16' });
  const x = c.find((z) => z.ratio !== null);
  assert.equal(x.stage, 'EFFECTIVE'); assert.equal(x.scheduled, true); assert.ok(Math.abs(x.ratio - 1 / 80) < 1e-12); assert.equal(x.marketDate, '2024-04-18');
  const s = SEC.filingEvents('The share consolidation, whereby every forty ordinary shares were consolidated into one ordinary share, became effective on November 21, 2022.', { form: '6-K', filedDate: '2022-11-21' }).find((z) => z.ratio !== null);
  assert.ok(Math.abs(s.ratio - 1 / 40) < 1e-12); assert.equal(s.stage, 'EFFECTIVE');
});

test('SEC E6: retrospective 10-Q statement is EFFECTIVE with the stated date, MEDIUM confidence', () => {
  const e = SEC.filingEvents('On March 3, 2020, we effected a 1-for-25 reverse stock split of our outstanding common stock.', { form: '10-Q', filedDate: '2020-05-12' })[0];
  assert.equal(e.stage, 'EFFECTIVE'); assert.equal(e.effectiveDate, '2020-03-03'); assert.equal(e.confidence, 'MEDIUM');
});

test('SEC E7: merge keeps the stage history point in time (approved first, effective later)', () => {
  const a = SEC.filingEvents('On April 12, 2024, the Board of Directors approved a 1-for-20 reverse stock split.', { form: '8-K', filedDate: '2024-04-12' });
  const b = SEC.filingEvents('The 1-for-20 reverse stock split became effective and the shares began trading on a split-adjusted basis on April 24, 2024.', { form: '8-K', filedDate: '2024-04-24' });
  const m = SEC.mergeEvents([...a, ...b]);
  assert.equal(m.length, 1);
  assert.equal(m[0].stage, 'EFFECTIVE');
  assert.equal(m[0].stageVisibleAt.APPROVED, '2024-04-12');
  assert.equal(m[0].stageVisibleAt.EFFECTIVE, '2024-04-24');
  assert.equal(CAV.stageAt(m[0], '2024-04-20'), 'APPROVED');
  assert.equal(CAV.stageAt(m[0], '2024-04-11'), null);
});

/* ---------------- evidence model + validity contract ---------------- */

test('V1: SEC-confirmed undeclared reverse split is normalized; the full series stays canonical', () => {
  const raw = undeclaredReverse(series(300), 200, 20), d = raw[200].date;
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ marketDate: d, visibleAt: raw[197].date })] });
  assert.equal(c.state, 'FULL_VALID');
  const e = c.evidence.find((x) => x.class === 'CONFIRMED_REVERSE_SPLIT');
  assert.equal(e.outcome, 'NORMALIZE'); assert.equal(e.eventDate, d);
  const g = c.tr[200] / c.tr[199];
  assert.ok(Math.abs(g - raw[200].close / 20 / raw[199].close) < 1e-9, 'the split day return is the market move, not 20x');
});

test('V2: the same split without any source is held from the event date; nothing is back-calculated', () => {
  const raw = undeclaredReverse(series(300), 200, 20);
  const c = PV.build(raw, { identity: CONFIRMED });
  assert.equal(c.state, 'VALID_PREFIX');
  assert.equal(c.hold.from, raw[200].date); assert.equal(c.hold.state, 'HOLD');
  assert.equal(c.hold.evidenceClass, 'PRICE_DISCONTINUITY_NO_CA_EVIDENCE');
  assert.equal(c.validUntil, raw[199].date); assert.equal(c.validBars, 200);
});

test('V3: approval without effectiveness is PROBABLE and still a HOLD (no normalization)', () => {
  const raw = undeclaredReverse(series(300), 200, 20);
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ stage: 'APPROVED', stageVisibleAt: { APPROVED: raw[150].date }, visibleAt: raw[150].date })] });
  assert.equal(c.hold.evidenceClass, 'PROBABLE_CORPORATE_ACTION');
  assert.equal(c.normalized, 0);
});

test('V4: provider split consistent with SEC: CONFIRMED and ACCEPT, no second adjustment', () => {
  const base = series(300), i = 200, k = 20;
  const raw = base.map((b, j) => j < i ? b : { ...b, close: b.close * k, open: b.open * k, volume: Math.round(b.volume / k) })
    .map((b, j) => ({ ...b, splitFactor: j === i ? 1 / k : 1, adjustedClose: j < i ? b.close / k : b.close }));
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ marketDate: raw[i].date, visibleAt: raw[i - 3].date })] });
  const e = c.evidence[0];
  assert.equal(e.class, 'CONFIRMED_REVERSE_SPLIT'); assert.equal(e.outcome, 'ACCEPT');
  assert.equal(c.state, 'FULL_VALID');
  assert.ok(Math.abs(c.tr[i] / c.tr[i - 1] - base[i].close / base[i - 1].close) < 1e-9, 'no double adjustment');
});

test('V5: provider factor contradicting SEC is CONFLICTING and held (the core alone accepts it)', () => {
  const base = series(300), i = 200, k = 20;
  const raw = base.map((b, j) => j < i ? b : { ...b, close: b.close * k, open: b.open * k })
    .map((b, j) => ({ ...b, splitFactor: j === i ? 1 / 10 : 1, adjustedClose: b.close }));
  assert.equal(CTR.reconstruct(raw, { identity: CONFIRMED }).reconstructed, true, 'precondition: 1.2.0 accepts the wrong factor (gross 2.0)');
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ marketDate: raw[i].date, visibleAt: raw[i - 3].date })] });
  assert.equal(c.hold.evidenceClass, 'CONFLICTING_CORPORATE_ACTION');
  assert.equal(c.validUntil, raw[i - 1].date);
});

test('V6: SEC event not visible in the price (identity/listing confusion) is UNKNOWN and changes nothing', () => {
  const raw = series(300);
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ marketDate: raw[150].date, visibleAt: raw[148].date })] });
  assert.equal(c.state, 'FULL_VALID');
  assert.equal(c.evidence[0].class, 'UNKNOWN'); assert.equal(c.evidence[0].outcome, 'NO_ACTION');
  assert.equal(c.normalized, 0);
});

test('V7: a reverted provider spike invalidates one bar only and the series resumes (R7)', () => {
  const raw = series(300).map((b, j) => j === 120 ? { ...b, close: b.close * 8, open: b.open * 8, adjustedClose: b.adjustedClose * 8 } : b);
  const c = PV.build(raw, { identity: CONFIRMED });
  assert.equal(c.state, 'VALID_WITH_INVALID_BARS');
  assert.equal(c.validUntil, raw[299].date);
  assert.deepEqual(c.invalidRanges.map((x) => [x.from, x.observedAt]), [[raw[120].date, raw[121].date]]);
  assert.equal(PV.isValidOn(c, raw[120].date), false);
  assert.equal(PV.isValidOn(c, raw[121].date), true);
  const at = PV.alignTr(c, raw.map((b) => b.date));
  assert.ok(Number.isNaN(at[120]));
  assert.ok(Math.abs(at[121] / at[119] - raw[121].close / raw[119].close) < 1e-9, 'return skips the bad bar');
  /* PIT: on the spike day itself the bar is not yet known to be bad */
  const v = PV.build(raw, { identity: CONFIRMED, asOf: raw[120].date });
  assert.equal(v.invalidRanges.length, 0);
});

test('V8: partial series - 2014-2022 valid, an unexplained 2023 break does not remove the history (R8)', () => {
  const base = series(2600, { start: '2014-01-02' });
  const i = base.findIndex((b) => b.date >= '2023-03-01');
  const raw = undeclaredReverse(base, i, 25);
  const c = PV.build(raw, { identity: CONFIRMED });
  assert.equal(c.state, 'VALID_PREFIX');
  assert.ok(c.validUntil < '2023-03-01' && c.validUntil >= '2023-02-27');
  assert.equal(c.validFrom, '2014-01-02');
  assert.equal(CTR.reconstruct(raw, { identity: CONFIRMED }).reconstructed, false, '1.2.0 whole-series verdict would discard all 2014-2022 bars');
});

test('V9: point in time - a defect starting 2024-06-03 does not touch a 2022-12-30 view', () => {
  const base = series(2800, { start: '2014-01-02' });
  const i = base.findIndex((b) => b.date >= '2024-06-03');
  const raw = undeclaredReverse(base, i, 30);
  const fin = PV.build(raw, { identity: CONFIRMED }), pit = PV.build(raw, { identity: CONFIRMED, asOf: '2022-12-30' });
  assert.equal(pit.state, 'FULL_VALID');
  assert.ok(fin.hold.observedAt > '2022-12-30');
  const d = pit.dates, a = PV.alignTr(fin, d);
  for (let j = 1; j < d.length; j++) assert.ok(Math.abs((a[j] / a[j - 1]) / (pit.tr[j] / pit.tr[j - 1]) - 1) < 1e-12);
});

test('V10: a SEC filing that arrives after the event resolves the hold from its filing day (RESUME_FROM, PIT)', () => {
  const raw = undeclaredReverse(series(300), 200, 20);
  const opts = { identity: CONFIRMED, secEvents: [ev({ marketDate: null, effectiveDate: raw[200].date, visibleAt: raw[230].date, confidence: 'MEDIUM' })] };
  const fin = PV.build(raw, opts);
  assert.equal(fin.state, 'FULL_VALID');
  assert.equal(PV.build(raw, { ...opts, asOf: raw[215].date }).hold.from, raw[200].date, 'before the filing the split is only a price signature: HOLD');
  const h = PV.pitHistory(raw, opts, fin);
  assert.equal(h[0].state, 'HOLD'); assert.equal(h[0].from, raw[200].date); assert.equal(h[0].resumeFrom, raw[231].date);
});

test('V11: downward event semantics - an SEC-confirmed forward split missing at the provider is normalized', () => {
  const base = series(300), i = 150;
  const raw = base.map((b, j) => j < i ? b : { ...b, close: b.close / 4, open: b.open / 4, adjustedClose: b.adjustedClose / 4, volume: b.volume * 4 });
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ ratio: 4, direction: 'FORWARD', marketDate: raw[i].date, visibleAt: raw[i - 5].date })] });
  const e = c.evidence.find((x) => x.class === 'CONFIRMED_SPLIT');
  assert.equal(e.outcome, 'NORMALIZE');
  assert.ok(Math.abs(c.tr[i] / c.tr[i - 1] - base[i].close / base[i - 1].close) < 1e-9);
});

test('V12: genuine high nominal price and genuine large moves are not held (no price cap)', () => {
  const hi = series(300, { p0: 400000 });
  assert.equal(PV.build(hi, { identity: CONFIRMED }).state, 'FULL_VALID');
  /* +150 % overnight on 10x volume (news): no corporate-action signature */
  const mv = series(300).map((b, j) => j >= 200 ? { ...b, close: b.close * 2.5, open: b.open * 2.5, adjustedClose: b.adjustedClose * 2.5, volume: j === 200 ? b.volume * 10 : b.volume } : b);
  assert.equal(PV.build(mv, { identity: CONFIRMED }).state, 'FULL_VALID');
});

test('V13: an undated retrospective SEC statement with two candidate days is ambiguous and does nothing', () => {
  let raw = undeclaredReverse(series(300), 150, 10);
  raw = raw.map((b, j) => j >= 220 ? { ...b, close: b.close * 6, open: b.open * 6, adjustedClose: b.adjustedClose * 6 } : b);
  const c = PV.build(raw, { identity: CONFIRMED, secEvents: [ev({ ratio: 0.1, marketDate: null, effectiveDate: null, visibleAt: raw[260].date, confidence: 'MEDIUM' })] });
  assert.equal(c.evidence.find((e) => e.reason === 'SEC_EVENT_UNDATED_AMBIGUOUS')?.class, 'UNKNOWN');
  assert.equal(c.normalized, 0);
});

test('V14: SEC share count contradicting a price-only split signature makes it CONFLICTING (still held)', () => {
  const raw = undeclaredReverse(series(300), 200, 20);
  const shares = [{ periodEnd: raw[180].date, availableAt: raw[185].date, value: 1e8 }, { periodEnd: raw[240].date, availableAt: raw[245].date, value: 1.05e8 }];
  const c = PV.build(raw, { identity: CONFIRMED, shares });
  assert.equal(c.hold.evidenceClass, 'CONFLICTING_CORPORATE_ACTION');
  const sup = PV.build(raw, { identity: CONFIRMED, shares: [shares[0], { ...shares[1], value: 5.2e6 }] });
  assert.equal(sup.hold.evidenceClass, 'PROBABLE_CORPORATE_ACTION');
  /* PIT: a share count filed after the as-of day is not used */
  const pit = PV.build(raw, { identity: CONFIRMED, shares, asOf: raw[210].date });
  assert.equal(pit.hold.evidenceClass, 'PRICE_DISCONTINUITY_NO_CA_EVIDENCE');
});

test('V15: an unverified identity yields no valid bars at all (no partial series without identity)', () => {
  const c = PV.build(series(50), { identity: { state: 'UNVERIFIED' } });
  assert.equal(c.state, 'NO_VALID_BARS'); assert.equal(c.validUntil, null);
});

/* ---------------- consumer: scripts/quant/lib/daily-prices.mjs (R8) ---------------- */

const DP = await import('../../scripts/quant/lib/daily-prices.mjs');
const payload = (bars) => ({ ticker: 'TEST', provider: 'tiingo', bars: bars.map((b) => ({ ...b, adjClose: b.adjustedClose, divCash: b.dividend })) });

test('C1: daily-prices keeps the valid prefix (NaN after trValidUntil) instead of dropping the whole series', () => {
  const raw = undeclaredReverse(series(400), 300, 20);
  const d = DP.fromBars(payload(raw), { identity: CONFIRMED });
  assert.equal(d.trVerdict.confirmed, false, 'the whole-series verdict is unchanged');
  assert.equal(d.totalReturn, true); assert.equal(d.trCoverage, 'PREFIX');
  assert.equal(d.trValidUntil, raw[299].date);
  assert.ok(d.tr[299] > 0 && Number.isNaN(d.tr[300]) && Number.isNaN(d.tr[399]));
  assert.equal(d.trVerdict.hold.from, raw[300].date);
});

test('C2: daily-prices: fully valid series unchanged; benchmark role and missing identity stay whole-series', () => {
  const ok = DP.fromBars(payload(series(200)), { identity: CONFIRMED });
  assert.equal(ok.trCoverage, 'FULL'); assert.equal(ok.trVerdict.confirmed, true);
  const raw = undeclaredReverse(series(400), 300, 20);
  assert.equal(DP.fromBars(payload(raw), { identity: CONFIRMED, role: 'BENCHMARK_REFERENCE' }).tr, null);
  assert.equal(DP.fromBars(payload(raw), {}).tr, null);
});

test('C3: daily-prices with SEC evidence normalizes the confirmed split (full coverage)', () => {
  const raw = undeclaredReverse(series(400), 300, 20);
  const d = DP.fromBars(payload(raw), { identity: CONFIRMED, secEvents: [ev({ marketDate: raw[300].date, visibleAt: raw[298].date })] });
  assert.equal(d.trCoverage, 'FULL');
  assert.ok(Math.abs(d.tr[300] / d.tr[299] - raw[300].close / 20 / raw[299].close) < 1e-9);
});

test('SEC E8: number words are matched whole ("one for sixty" is 1:60), share-count ranges are no ratio', () => {
  const a = SEC.filingEvents('We effected a reverse split of our common stock at a ratio of one for sixty, effected on January 20, 2023.', { form: '10-Q', filedDate: '2023-05-12' })[0];
  assert.ok(Math.abs(a.ratio - 1 / 60) < 1e-12);
  const b = SEC.extractStatements('The Company will perform a reverse stock split at the rate of 1 share for every 35 shares of common shares outstanding, and approval of an increase in the authorized common stock from 2,857,142 to 100,000,000 shares.');
  assert.ok(Math.abs(b[0].ratio - 1 / 35) < 1e-12);
  const c = SEC.filingEvents('A 1-for-1,000 reverse stock split became effective on May 2, 2012.', { form: '8-K', filedDate: '2012-05-02' })[0];
  assert.ok(Math.abs(c.ratio - 1 / 1000) < 1e-12);
});
