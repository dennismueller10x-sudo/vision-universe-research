#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – TRAIN exploration (R1). Evaluates a stage file of rule specifications on TRAIN decisions only
// and appends every variant (exact parameters + summary) to the private exploration log. Refuses any period
// outside TRAIN. Usage: node explore-train.cjs <stage.json> [--log <file.jsonl>]
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), E = require('./evaluate.cjs');

const TRAIN = { PRICE: ['2001-01-01', '2012-12-31'], FUND: ['2011-01-01', '2016-12-31'], V10RULE: ['2001-01-01', '2012-12-31'] };
const HALVES = { PRICE: [['2001-01-01', '2006-12-31'], ['2007-01-01', '2013-03-31']], FUND: [['2011-01-01', '2013-12-31'], ['2014-01-01', '2017-03-31']], V10RULE: [['2001-01-01', '2006-12-31'], ['2007-01-01', '2013-03-31']] };

function trainEval(ctx, spec) {
  const [from, to] = TRAIN[spec.family];
  const proto = L.protocol(), per = spec.family === 'FUND' ? proto.periods.fundamentalRules.TRAIN : proto.periods.priceRules.TRAIN;
  if (from !== per[0] || to !== per[1]) throw Error('TRAIN_PERIOD_MISMATCH_WITH_PROTOCOL');
  const r = E.evaluateSpec(ctx, spec, from, to, { keepSim: true });
  const eq = r._sim.base.equity, own = r._sim.own.equity;
  // Sub-halves of the TRAIN path (decision-time split; descriptive robustness).
  const halves = HALVES[spec.family].map(([a, b]) => {
    const idx = eq.map((e, k) => k).filter(k => k > 0 && eq[k].date >= a && eq[k].date <= b);
    const d = f => L.mean(idx.map(k => f(k))) * 52;
    return { from: a, to: b, weeks: idx.length, vsSpy: d(k => eq[k].value / eq[k - 1].value - ctx.spy[eq[k].s] / ctx.spy[eq[k - 1].s]), vsOwnEw: d(k => eq[k].value / eq[k - 1].value - own[k].value / own[k - 1].value) };
  });
  // Per-decision-interval returns (strategy, own EW, SPY) for the walk-forward within TRAIN.
  const decs = r._sim.sch.decisions, sIdx = new Map(eq.map((e, k) => [e.s, k]));
  const intervals = decs.map((j, q) => {
    const a = sIdx.get(j + 1), b = q + 1 < decs.length ? sIdx.get(decs[q + 1] + 1) : eq.length - 1;
    return [ctx.cal[j], eq[b].value / eq[a].value - 1, own[b].value / own[a].value - 1, ctx.spy[eq[b].s] / ctx.spy[eq[a].s] - 1, ctx.cal[eq[b].s]];
  });
  delete r._sim;
  return { r, halves, intervals };
}

function summary(spec, x) {
  const r = x.r;
  return { id: spec.id, family: spec.family, spec, cagr: r.strategy.cagr, sharpe: r.strategy.sharpe, sortino: r.strategy.sortino, maxDrawdown: r.strategy.maxDrawdown, turnoverPerYear: r.strategy.turnoverPerYear,
    avgPositions: r.strategy.avgPositions, avgInvestedShare: r.strategy.avgInvestedShare,
    spyCagr: r.spy.cagr, ownEwCagr: r.ownUniverseEw.cagr, frameEwCagr: r.frameEw.cagr, capCagr: r.capWeighted.cagr ?? null,
    exVsSpy: { ann: r.excess.vsSpy.annualisedMean, p: r.excess.vsSpy.pValue }, exVsOwnEw: { ann: r.excess.vsOwnUniverseEw.annualisedMean, p: r.excess.vsOwnUniverseEw.pValue },
    exVsFrameEw: { ann: r.excess.vsFrameEw.annualisedMean, p: r.excess.vsFrameEw.pValue }, exVsCap: r.excess.vsCapWeighted ? { ann: r.excess.vsCapWeighted.annualisedMean, p: r.excess.vsCapWeighted.pValue } : null,
    stress: { cagr: r.stress.cagr, exVsSpyAnn: r.stress.excessVsSpyAnnualised }, halves: x.halves, period: r.period };
}

function main() {
  const stageFile = process.argv[2], li = process.argv.indexOf('--log');
  const logFile = li > 0 ? process.argv[li + 1] : path.join(L.PRIVATE, 'train-exploration.jsonl');
  const stage = JSON.parse(fs.readFileSync(stageFile, 'utf8'));
  const done = new Set(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
  const ctx = L.buildContext({ withPanel: true });
  console.error('context', ctx.seconds, 's');
  for (const spec of stage.specs) {
    if (done.has(spec.id)) { console.error('skip (already logged)', spec.id); continue; }
    const t0 = Date.now(), x = trainEval(ctx, spec), s = summary(spec, x);
    fs.appendFileSync(logFile, JSON.stringify({ ...s, stage: stage.stage, loggedAt: new Date().toISOString(), seconds: (Date.now() - t0) / 1000, intervals: x.intervals }) + '\n');
    const f = v => v === null || v === undefined ? 'na' : (v * 100).toFixed(2);
    console.log([spec.id.padEnd(34), 'CAGR', f(s.cagr), 'SPY', f(s.spyCagr), 'own', f(s.ownEwCagr), '| exSPY', f(s.exVsSpy.ann), 'p', s.exVsSpy.p?.toFixed(3), '| exOwn', f(s.exVsOwnEw.ann), 'p', s.exVsOwnEw.p?.toFixed(3),
      '| SR', s.sharpe?.toFixed(2), 'MDD', f(s.maxDrawdown), 'TO', s.turnoverPerYear.toFixed(1), '| stress exSPY', f(s.stress.exVsSpyAnn), '| halves own', s.halves.map(h => f(h.vsOwnEw)).join('/')].join(' '));
  }
}
if (require.main === module) main();
module.exports = { trainEval, summary, TRAIN, HALVES };
