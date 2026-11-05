'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./study.cjs');
test('registration fingerprint and complete fixed hypothesis family', () => {
  assert.equal(S.sha(fs.readFileSync(path.resolve(__dirname, '../../../docs/research/edge/PROTOKOLL.md'))), S.PROTOCOL_SHA256);
  const v = S.variants(); assert.equal(v.length, 96); assert.equal(new Set(v.map(x => x.id)).size, 96);
  assert.equal(v.filter(x => x.family === 'supertrader').length, 12);
  assert.equal(v.filter(x => x.profileId === 'quality-momentum').length, 12);
  for (const x of v.filter(x => x.family === 'quant')) assert.ok(x.n * x.standard.maxPositionWeight >= 1);
});
test('Holm includes blocked tests and preserves input order', () => {
  assert.deepEqual(S.holm([.03, .001, 1, .02]), [.06, .004, 1, .06]);
  const ps = Array(192).fill(1); ps[95] = .0002;
  assert.equal(S.holm(ps)[95], .038400000000000004);
  assert.throws(() => S.holm([NaN]));
});
test('drawdown includes initial capital; rejects unsorted dates and nonpositive levels', () => {
  const d = ['2020-01-03', '2020-01-10', '2020-01-17'];
  assert.equal(S.metrics([100, 70, 90], d).maxDrawdown, -.30000000000000004);
  assert.ok(Math.abs(S.metrics([100, 70, 90], d).totalReturn + .1) < 1e-12);
  assert.throws(() => S.metrics([100, 0, 90], d));
  assert.throws(() => S.metrics([100, 70, 90], [...d].reverse()));
});
test('paired bootstrap null and direction; reproducible serially dependent sample', () => {
  const b = Array.from({ length: 104 }, (_, i) => .002 + Math.sin(i / 7) * .02);
  assert.equal(S.pairedTest(b, b, { count: 99 }).pLog, 1);
  const a = b.map(x => x + .01), cfg = { count: 199 };
  const r = S.pairedTest(a, b, cfg); assert.deepEqual(r, S.pairedTest(a, b, cfg));
  assert.equal(r.pLog, .005); assert.ok(r.logEffect > 0);
  assert.equal(S.pairedTest(b, a, cfg).pLog, 1);
  assert.throws(() => S.pairedTest(a, b.slice(1)));
});
test('constant cash has undefined Sharpe and cannot receive risk-only verdict', () => {
  const c = Array(104).fill(0), r = S.pairedTest(c, c, { count: 9 });
  assert.equal(r.pSharpe, 1); assert.equal(r.sharpeEffect, null);
  assert.equal(S.verdict({ totalReturn: 0, sharpe: null, maxDrawdown: 0 }, { totalReturn: .2, sharpe: .5, maxDrawdown: -.2 }, 1, .001), 'schlägt nicht');
});
test('verdict distinguishes absent evidence, net edge and risk-only evidence', () => {
  const spy = { totalReturn: 1, sharpe: .7, maxDrawdown: -.3 };
  assert.equal(S.verdict(null), 'nicht bestimmbar (blockiert)');
  assert.equal(S.verdict({ totalReturn: 2, sharpe: .8, maxDrawdown: -.2 }, spy, null, null), 'schlägt nicht');
  assert.equal(S.verdict({ totalReturn: 1.1, sharpe: .6, maxDrawdown: -.4 }, spy, .04, 1), 'schlägt');
  const m = { totalReturn: .9, sharpe: .8, maxDrawdown: -.2 };
  assert.equal(S.verdict(m, spy, 1, .04), 'nur risikobereinigt');
  assert.equal(S.verdict({ ...m, maxDrawdown: -.4 }, spy, 1, .04), 'schlägt nicht');
  assert.equal(S.verdict(m, spy, 1, .06), 'schlägt nicht');
});
test('blocked report never fabricates performance or silently drops variants', () => {
  const { render } = require('./preflight.cjs');
  const s = render({ sourceCommit: 'fixture', protocolCommit: 'fixture', protocolSha256: S.PROTOCOL_SHA256,
    blockers: [], credentials: [], benchmarks: [], variants: S.variants().map(v => ({ ...v, verdict: S.verdict(null) })) });
  assert.equal(s.split('nicht bestimmbar (blockiert)').length - 1, 96);
  assert.match(s, /keine E3-Renditeergebnisse/);
});
