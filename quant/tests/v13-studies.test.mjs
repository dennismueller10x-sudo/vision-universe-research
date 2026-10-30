// V13 STUDIES - fast tests (no private data needed): frame merge F0 + delisted docs, terminal scenarios, S3 exit replacement,
// registration binding and the published evidence envelopes. Tests touching the private delisted series skip when absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const W = require(ROOT + '/scripts/quant/v13/studies/lib.cjs');
const S3 = require(ROOT + '/scripts/quant/v13/studies/run-s3.cjs');

// ---------- fixtures ----------
const cal = ['2020-01-03', '2020-01-10', '2020-01-17', '2020-01-24', '2020-01-30', '2020-02-07', '2020-02-14']; // 2020-01-30 is a modal Thursday
const fr0 = { docs: new Map([['ref_A', { points: cal.map(d => [d, 1]) }]]), qualified: ['ref_A'], frame: ['ref_A'], calendar: cal, excluded: { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] } };
const doc = (id, dates, exch = 'NYSE', kind = 'MERGER') => [id, { securityId: id, listingId: 'v13delisted:' + exch + ':' + id.slice(3), points: dates.map((d, i) => [d, 10 + i]), totalReturnPoints: dates.map((d, i) => [d, 11 + i]),
  listingLifecycle: { schemaVersion: 'v13-delisted-register-1.0.0', status: 'DELISTED_SOURCED_END', lastTradeDate: dates.at(-1), terminal: { kind } }, identityHash: 'h' + id }];
const delisted = new Map([
  doc('dl_full', ['2020-01-03', '2020-01-10', '2020-01-17']),                 // all modal -> F1
  doc('dl_lastwed', ['2020-01-10', '2020-01-17', '2020-01-22']),              // last bar Wednesday -> excluded in F1, relabelled in F1w
  doc('dl_midbad', ['2020-01-09', '2020-01-17', '2020-01-24']),               // non-modal bar before the end -> excluded in both
  doc('dl_arca', ['2020-01-03', '2020-01-10'], 'NYSE ARCA'),                  // MIC outside the primary set
  doc('dl_thu', ['2020-01-24', '2020-01-30']),                                // holiday-week Thursday equals the modal label -> F1
]);

test('mergeFrame applies the registered F0 frame rule to delisted docs (modal labels of F0, MIC set)', () => {
  const f1 = W.mergeFrame(fr0, delisted);
  assert.deepEqual(f1.delisted.added, ['dl_full', 'dl_thu']);
  assert.deepEqual(f1.delisted.excluded.NON_MODAL_WEEK_LABEL, ['dl_lastwed', 'dl_midbad']);
  assert.deepEqual(f1.delisted.excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET, ['dl_arca']);
  assert.deepEqual(f1.frame, ['ref_A', 'dl_full', 'dl_thu']);
  assert.equal(f1.qualified.length, 6);
  assert.equal(f1.calendar, cal, 'F1 keeps the F0 calendar object');
  assert.equal(f1.docs.get('dl_lastwed').points.at(-1)[0], '2020-01-22', 'registered rule never relabels');
  assert.equal(fr0.frame.length, 1, 'F0 frame object is not mutated');
});

test('mergeFrame F1w (amendment 1.0.1) relabels only a last bar earlier than its modal label', () => {
  const f1w = W.mergeFrame(fr0, delisted, { relabelLastBar: true });
  assert.deepEqual(f1w.delisted.added, ['dl_full', 'dl_lastwed', 'dl_thu']);
  assert.equal(f1w.delisted.relabelledLastBars, 1);
  const d = f1w.docs.get('dl_lastwed');
  assert.deepEqual(d.points.at(-1), ['2020-01-24', 12], 'price unchanged, label moved to the modal date');
  assert.deepEqual(d.totalReturnPoints.at(-1), ['2020-01-24', 13]);
  assert.deepEqual(d.relabelledLastBar, { from: '2020-01-22', to: '2020-01-24' });
  assert.equal(d.listingLifecycle.lastTradeDate, '2020-01-22', 'true last-trade date kept');
  assert.equal(delisted.get('dl_lastwed').points.at(-1)[0], '2020-01-22', 'input docs are not mutated');
  assert.deepEqual(f1w.delisted.excluded.NON_MODAL_WEEK_LABEL, ['dl_midbad']);
});

test('mergeFrame fails closed on id collisions and on a calendar with two labels per week', () => {
  assert.throws(() => W.mergeFrame(fr0, new Map([['ref_A', delisted.get('dl_full')]])), /DELISTED_ID_COLLIDES_WITH_F0/);
  assert.throws(() => W.mergeFrame({ ...fr0, calendar: ['2020-01-02', '2020-01-03'] }, delisted), /F0_CALENDAR_NOT_ONE_LABEL_PER_WEEK/);
});

const panelOf = (closes, { ended = true, kind = 'DISTRESS', v13 = true, startCal = 0 } = {}) => ({ id: 'dl_x', closes: Float64Array.from(closes), cal: Int32Array.from(closes.map((_, i) => startCal + i)),
  lifecycle: ended ? { schemaVersion: v13 ? 'v13-delisted-register-1.0.0' : 'v10', lastTradeDate: '2020-01-01', terminal: { kind } } : null });

test('terminalForward: last traded close times (1+s), only for ended listings, contiguous paths and matured exits', () => {
  const p = panelOf([10, 10, 8, 6, 4]); // n=5, ended, DISTRESS
  assert.equal(W.terminalForward(p, 1, 13, 100, 0), 4 / 8 - 1);
  assert.ok(Math.abs(W.terminalForward(p, 1, 13, 100, 1) - (4 * 0.7 / 8 - 1)) < 1e-15);
  assert.equal(W.terminalForward(p, 1, 13, 100, 2), -1);
  assert.equal(W.terminalForward(p, 1, 2, 100, 0), null, 'exit inside the series -> observed outcome, not terminal');
  assert.equal(W.terminalForward(p, 4, 13, 100, 0), null, 'no entry bar after the signal');
  assert.equal(W.terminalForward(p, 1, 13, 15, 0), null, 'expected exit beyond the calendar -> immature');
  assert.equal(W.terminalForward(panelOf([10, 10, 8, 6, 4], { ended: false }), 1, 13, 100, 0), null);
  const gap = panelOf([10, 10, 8, 6, 4]); gap.cal = Int32Array.from([0, 1, 2, 4, 5]);
  assert.equal(W.terminalForward(gap, 1, 13, 100, 0), null, 'calendar gap before the end');
  const merger = panelOf([10, 10, 8, 6, 4], { kind: 'MERGER' });
  assert.ok(Math.abs(W.terminalForward(merger, 1, 13, 100, 2) - (4 * 1.1 / 8 - 1)) < 1e-15);
  const v10ended = panelOf([10, 10, 8, 6, 4], { v13: false, kind: 'CASH_MERGER' });
  assert.equal(W.terminalForward(v10ended, 1, 13, 100, 2), 4 / 8 - 1, 'F0 ended listings stay at the last close in every scenario');
  const lastAtCalendarEnd = panelOf([10, 10, 8, 6, 4], { startCal: 95 });
  assert.equal(W.terminalForward(lastAtCalendarEnd, 1, 13, 100, 0), null, 'a series reaching the calendar end is not ended');
});

test('registered terminal scenarios are the protocol R6 bands', () => {
  assert.deepEqual(W.TERMINAL_SCENARIOS, { MERGER: [0, -0.10, 0.10], DISTRESS: [0, -0.30, -1], UNKNOWN: [0, -0.30, -1] });
  assert.throws(() => W.scenarioReturn(panelOf([1, 2], { kind: 'OTHER' }), 0), /TERMINAL_CLASS_UNKNOWN/);
});

test('S3 replacement: only BOUNDED_EXIT* with a same-CIK chain ending in [t0, t1+120d], observed price return, terminal band on LAST_CLOSE', () => {
  const chain = (id, dates, closes, last, kind = 'MERGER') => ({ id, dates, closes, listingStart: dates[0], lifecycle: { lastTradeDate: last, terminal: { kind } } });
  const c = chain('dl_a', ['2015-03-27', '2015-04-24', '2015-05-15'], [20, 22, 25], '2015-05-15');
  const m = { status: 'BOUNDED_EXIT', cik: 123 };
  const r0 = S3.replacement(m, '2015-03-31', '2015-06-30', [c], 0);
  assert.equal(r0.state, 'REPLACED'); assert.equal(r0.kind, 'LAST_CLOSE'); assert.ok(Math.abs(r0.r - (25 / 20 - 1)) < 1e-12);
  assert.ok(Math.abs(S3.replacement(m, '2015-03-31', '2015-06-30', [c], 1).r - (25 * 0.9 / 20 - 1)) < 1e-12);
  assert.equal(S3.replacement({ status: 'OBS_SERIES', cik: 123 }, '2015-03-31', '2015-06-30', [c], 0).state, 'NOT_APPLICABLE');
  assert.equal(S3.replacement({ status: 'BOUNDED_EXIT', cik: null }, '2015-03-31', '2015-06-30', [c], 0).state, 'NOT_APPLICABLE');
  assert.equal(S3.replacement(m, '2015-06-30', '2015-09-30', [c], 0).state, 'NO_QUALIFIED_CHAIN', 'last trade before t0');
  assert.equal(S3.replacement(m, '2014-09-30', '2014-12-31', [c], 0).state, 'NO_QUALIFIED_CHAIN', 'last trade after t1+120d');
  const late = chain('dl_b', ['2015-04-10', '2015-05-15'], [20, 25], '2015-05-15');
  assert.equal(S3.replacement(m, '2015-03-31', '2015-06-30', [late], 0).state, 'NO_BAR_AT_T0');
  const through = chain('dl_c', ['2015-03-27', '2015-06-26', '2015-08-14'], [20, 30, 31], '2015-08-14', 'DISTRESS');
  const rs = S3.replacement(m, '2015-03-31', '2015-06-30', [through], 2);
  assert.equal(rs.kind, 'SERIES'); assert.ok(Math.abs(rs.r - 0.5) < 1e-12, 'series reaches t1: no terminal scenario');
});

test('study registration and amendment are hash-bound', () => {
  assert.equal(W.registrationSha(), 'd12c1ec0fa7f37628b067c0c06470b0bef3b1209013e207193fe3d0a3e68937f');
  const am = fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13/studies/study-amendment-1.0.1.sha256'), 'utf8').split(/\s+/)[0];
  assert.equal(W.amendmentSha(), am);
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, W.STUDY_AMENDMENT), 'utf8'));
  assert.equal(a.amends.sha256, W.registrationSha());
  assert.equal(a.productionApproved, false);
});

test('published V13 study outputs carry the evidence envelope', () => {
  const dir = path.join(ROOT, W.STUDY_DIR);
  const files = ['s1-signal-1.0.0.json', 's2-population-1.0.0.json', 's3-spx-exits-1.0.0.json'].filter(f => fs.existsSync(path.join(dir, f)));
  if (!files.length) return;
  for (const f of files) {
    const x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(x.studyId, f); assert.equal(x.registrationSha256, W.registrationSha(), f); assert.equal(x.amendmentSha256, W.amendmentSha(), f);
    assert.equal(x.evidenceKind, 'HISTORICAL_DEVELOPMENT_STUDY', f); assert.equal(x.certificationStatus, 'NOT_CERTIFIED', f); assert.equal(x.productionApproved, false, f);
  }
  const s1 = path.join(dir, 's1-signal-1.0.0.json');
  if (fs.existsSync(s1)) {
    const x = JSON.parse(fs.readFileSync(s1, 'utf8'));
    assert.equal(x.populations.F0.listings, 4329);
    assert.equal(x.populations.F1.listings, x.populations.F0.listings + x.populations.F1.delisted.added);
    assert.ok(!JSON.stringify(x).includes('"points"'), 'no price series in public output');
  }
});

test('private delisted series load hash-bound (skipped without private data)', { skip: !fs.existsSync(W.PRIVATE_SERIES) && 'private series directory absent' }, () => {
  const D = require(ROOT + '/quant/engines/research-delisted-series.cjs');
  const q = D.loadDelisted(ROOT, { dir: W.PRIVATE_SERIES, include: 'QUALIFIED' });
  assert.deepEqual(q.counts, { requested: 1675, loaded: 1675, missingFile: 0 });
});
