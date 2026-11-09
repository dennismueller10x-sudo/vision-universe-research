// V13b F1W - fast tests (no private data needed): F1d drop rule vs F1w relabel on the same chains, registration binding,
// published evidence envelope (V13 primary cited unchanged). The private-series test skips cleanly when the data are absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const L = require(ROOT + '/scripts/quant/v13b/f1w/lib.cjs');
const W = L.W;

const cal = ['2020-01-03', '2020-01-10', '2020-01-17', '2020-01-24', '2020-01-30', '2020-02-07', '2020-02-14'];
const fr0 = { docs: new Map([['ref_A', { points: cal.map(d => [d, 1]) }]]), qualified: ['ref_A'], frame: ['ref_A'], calendar: cal, excluded: { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] } };
const doc = (id, dates, exch = 'NYSE') => [id, { securityId: id, listingId: 'v13delisted:' + exch + ':' + id.slice(3), points: dates.map((d, i) => [d, 10 + i]), totalReturnPoints: dates.map((d, i) => [d, 11 + i]),
  listingLifecycle: { schemaVersion: 'v13-delisted-register-1.0.0', status: 'DELISTED_SOURCED_END', lastTradeDate: dates.at(-1), terminal: { kind: 'MERGER' } }, identityHash: 'h' + id }];
const delisted = new Map([
  doc('dl_full', ['2020-01-03', '2020-01-10', '2020-01-17']),        // all modal -> F1, F1w, F1d unchanged
  doc('dl_lastwed', ['2020-01-10', '2020-01-17', '2020-01-22']),     // last bar Wednesday -> relabelled (F1w) / dropped (F1d)
  doc('dl_midbad', ['2020-01-09', '2020-01-17', '2020-01-24']),      // non-modal earlier bar -> excluded everywhere
  doc('dl_after', ['2020-01-03', '2020-01-10', '2020-01-18']),       // last bar AFTER the modal label -> excluded in F1w and F1d
  doc('dl_short', ['2020-01-10', '2020-01-15']),                     // one bar left after the drop -> excluded in F1d (counted)
]);

test('F1d drops the non-modal last bar of exactly the chains F1w relabels; price of the dropped bar is not used', () => {
  const fw = W.mergeFrame(fr0, delisted, { relabelLastBar: true }), fd = L.mergeFrameF1d(fr0, delisted);
  assert.deepEqual(fd.delisted.added, ['dl_full', 'dl_lastwed']);
  assert.deepEqual(fw.delisted.added, ['dl_full', 'dl_lastwed', 'dl_short']);
  assert.equal(fd.delisted.truncatedLastBars, 1); assert.equal(fd.delisted.tooShortAfterDrop, 1);
  const d = fd.docs.get('dl_lastwed');
  assert.deepEqual(d.points, [['2020-01-10', 10], ['2020-01-17', 11]]);
  assert.deepEqual(d.totalReturnPoints.at(-1), ['2020-01-17', 12]);
  assert.deepEqual(d.droppedLastBar, { date: '2020-01-22', close: 12, modalDate: '2020-01-24' });
  assert.equal(d.listingLifecycle.lastTradeDate, '2020-01-22', 'true last trade date kept');
  assert.deepEqual(fd.delisted.excluded.NON_MODAL_WEEK_LABEL, ['dl_after', 'dl_midbad']);
  assert.equal(delisted.get('dl_lastwed').points.length, 3, 'input not mutated');
  assert.equal(fd.docs.get('dl_full'), delisted.get('dl_full'), 'untouched chains pass through as is');
});

test('endOfSeriesCase and weekdaysBetween', () => {
  const modal = new Map(cal.map(d => [W.K.weekOf(d), d]));
  assert.deepEqual(L.endOfSeriesCase({ points: [['2020-01-17', 1], ['2020-01-22', 1]] }, modal), { lastDate: '2020-01-22', modalDate: '2020-01-24' });
  assert.equal(L.endOfSeriesCase({ points: [['2020-01-17', 1], ['2020-01-24', 1]] }, modal), null);
  assert.equal(L.weekdaysBetween('2020-01-22', '2020-01-24'), 2);
  assert.equal(L.weekdaysBetween('2020-01-24', '2020-01-27'), 1);
});

test('registration 2.0.0 is hash-bound, non-confirmatory and keeps F1 primary', () => {
  const sha = L.registrationSha();
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, L.REG_FILE), 'utf8'));
  assert.equal(r.confirmatory, false); assert.equal(r.productionApproved, false); assert.equal(r.certificationStatus, 'NOT_CERTIFIED');
  assert.equal(r.basedOn.studyRegistration.sha256, W.registrationSha());
  assert.equal(r.basedOn.studyAmendment.sha256, W.amendmentSha());
  assert.match(r.primacy.primaryUnchanged, /remains the registered primary/);
  assert.match(sha, /^[0-9a-f]{64}$/);
});

test('published results cite the committed V13 values unchanged (skipped before assemble)', { skip: !fs.existsSync(path.join(ROOT, L.OUT_DIR, 'results-2.0.0.json')) && 'results not assembled' }, () => {
  const x = JSON.parse(fs.readFileSync(path.join(ROOT, L.OUT_DIR, 'results-2.0.0.json'), 'utf8'));
  const v13 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13/studies/s1-signal-1.0.0.json'), 'utf8'));
  assert.equal(x.registration.sha256, L.registrationSha()); assert.equal(x.confirmatory, false); assert.equal(x.productionApproved, false);
  assert.equal(x.primaryUnchanged.v13S1.sha256, W.shaFile('docs/quant-recovery/v13/studies/s1-signal-1.0.0.json'));
  for (const c of x.s1.cells) {
    const v = v13.cells.find(y => y.rule === c.rule && y.horizonWeeks === c.horizonWeeks && y.endpoint === c.endpoint);
    for (const f of ['F0', 'F1', 'F1w']) assert.deepEqual(c[f], v[f], f + ' copied unchanged');
  }
  assert.equal(x.s1.cells.length, 60);
  assert.ok(!JSON.stringify(x).includes('"points"'), 'no price series in public output');
});

test('private delisted series: F1d adds the same 1,576 chains as F1w (skipped without private data)', { skip: !fs.existsSync(W.PRIVATE_SERIES) && 'private series directory absent' }, () => {
  const D = require(ROOT + '/quant/engines/research-delisted-series.cjs');
  const q = D.loadDelisted(ROOT, { dir: W.PRIVATE_SERIES, include: 'QUALIFIED' });
  const fr = W.K.buildFrame(W.F0_LOADER);
  const fd = L.mergeFrameF1d(fr, q.docs), fw = W.mergeFrame(fr, q.docs, { relabelLastBar: true });
  assert.equal(fd.delisted.added.length, 1576); assert.equal(fd.delisted.truncatedLastBars, 1186);
  assert.deepEqual(fd.delisted.added, fw.delisted.added);
});
