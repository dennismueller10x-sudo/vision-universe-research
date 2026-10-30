#!/usr/bin/env node
'use strict';
// V13 STUDIES - S3: V12 REQUAL P5a (PIT S&P 500 from SPY holdings) with bounded exits replaced by the observed price return of a
// QUALIFIED delisted chain (same CIK, last trade in [t0, t1+120d]; study amendment 1.0.1 O6). Everything else is the unchanged
// V12 code path (p5a-population.cjs frameContext/computePeriods/aggregate, lib.makePopulation/seriesReturn).
//   node scripts/quant/v13/studies/run-s3.cjs [--series <private series dir>] [--out docs/quant-recovery/v13/studies/s3-spx-exits-1.0.0.json] [--private <dir>]
const fs = require('node:fs'), path = require('node:path');
const W = require('./lib.cjs');
const L = require(W.ROOT + '/scripts/quant/v12/requal/lib.cjs');
const P5 = require(W.ROOT + '/scripts/quant/v12/requal/p5a-population.cjs');
const D = require(W.ROOT + '/quant/engines/research-delisted-series.cjs');
const { readRegistration } = require(W.ROOT + '/scripts/quant/v12/requal/plan.cjs');

const DAY = 86400000;
const plusDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

/** Pure: pick the replacement for one bounded member (null if not covered). chains: delisted listings of the member's CIK. */
function replacement(member, t0, t1, chains, j) {
  if (!/^BOUNDED_EXIT/.test(member.status || '') || !member.cik) return { state: 'NOT_APPLICABLE' };
  const hits = (chains || []).filter(c => c.lifecycle.lastTradeDate >= t0 && c.lifecycle.lastTradeDate <= plusDays(t1, 120));
  if (!hits.length) return { state: 'NO_QUALIFIED_CHAIN' };
  hits.sort((a, b) => Math.abs(Date.parse(a.lifecycle.lastTradeDate) - Date.parse(t1)) - Math.abs(Date.parse(b.lifecycle.lastTradeDate) - Date.parse(t1)) || (a.id < b.id ? -1 : 1));
  const c = hits[0], sr = L.seriesReturn(c, t0, t1);
  if (!sr) return { state: 'NO_BAR_AT_T0', chains: hits.length };
  const cls = c.lifecycle.terminal.kind, s = sr.kind === 'LAST_CLOSE' ? W.TERMINAL_SCENARIOS[cls][j] : 0;
  return { state: 'REPLACED', chains: hits.length, chainId: c.id, kind: sr.kind, terminalClass: cls, r: (1 + sr.r) * (1 + s) - 1, d0: sr.d0, d1: sr.d1 };
}
function wrapPopulation(pop, byCik, j, log) {
  const cache = new Map();
  return { ...pop, members(t0) {
    if (cache.has(t0)) return cache.get(t0);
    const a = pop.members(t0);
    const members = a.members.map(m => {
      const rep = replacement(m, t0, a.t1, byCik.get(String(Number(m.cik))), j);
      if (log && rep.state !== 'NOT_APPLICABLE') log.push({ t0, t1: a.t1, chainId: m.chainId, cik: m.cik, status: m.status, fateClass: m.fateClass, weight: m.weight, before: m.ret, ...rep });
      if (rep.state !== 'REPLACED') return m;
      return { ...m, status: 'V13_DELISTED_OBSERVED', group: 'v13_observed', ret: { ZERO: rep.r, LOWER: rep.r, FATE: rep.r, UPPER: rep.r } };
    });
    const r = { ...a, members }; cache.set(t0, r); return r;
  } };
}
function summary(agg) {
  if (!agg) return null;
  const pick = ['EW_ALL', 'CW_ALL', 'EW_WITH_H', 'EW_WITHOUT_H', 'SPY', 'SPY_TR', 'EW_FRAME'];
  return { periods: agg.periods, years: agg.years, from: agg.from, to: agg.to, cagr: Object.fromEntries(pick.map(k => [k, agg.cagr[k]])),
    terms: Object.fromEntries(['survivorshipInIndex', 'equalWeightInIndex', 'frameMinusSpy'].map(k => [k, agg.terms[k] && { cagrDiffPp: agg.terms[k].cagrDiffPp, meanPeriodPp: agg.terms[k].meanPeriodPp, nwP: agg.terms[k].nwP }])) };
}

function main() {
  const o = W.args(process.argv.slice(2), { series: W.PRIVATE_SERIES, out: path.join(W.ROOT, W.STUDY_DIR, 's3-spx-exits-1.0.0.json'), private: null });
  const t0 = Date.now(), reg = readRegistration();
  const ctx = P5.frameContext(), pop = L.makePopulation(), spy = L.makeSpy(), dist = L.spyDistributions();
  const dl = D.loadDelisted(W.ROOT, { dir: o.series, include: 'QUALIFIED' });
  const byCik = new Map();
  for (const [id, d] of dl.docs) { const k = String(Number(d.listingLifecycle.cik)); if (!byCik.has(k)) byCik.set(k, []); byCik.get(k).push({ id, dates: d.points.map(p => p[0]), closes: d.points.map(p => p[1]), listingStart: d.listingStart, lifecycle: d.listingLifecycle }); }
  const before = P5.computePeriods(ctx, pop, spy, dist);
  const committed = JSON.parse(fs.readFileSync(path.join(W.ROOT, 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json'), 'utf8'));
  const reproduced = JSON.stringify(before.map(r => r.series)) === JSON.stringify(committed.periods.map(r => r.series));
  const after = [], logs = [];
  for (let j = 0; j < 3; j++) { const log = []; after.push(P5.computePeriods(ctx, wrapPopulation(pop, byCik, j, log), spy, dist)); logs.push(log); }
  const states = logs[0].reduce((a, x) => { a[x.state] = (a[x.state] || 0) + 1; return a; }, {});
  const replaced = logs[0].filter(x => x.state === 'REPLACED');
  const aggs = rows => Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, { full: summary(P5.aggregate(rows, sc)), from2013_03_rule101: summary(P5.aggregate(rows, sc, r => r.t0 >= P5.SPAN_101)) }]));
  const r4 = x => typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x;
  const out = { studyId: 'V13-S3-SPX-BOUNDED-EXITS', registrationSha256: W.registrationSha(), amendmentSha256: W.amendmentSha(), basedOn: { study: 'V12-REQUAL-P5A 1.1.0', registrationSha256: reg.sha256, committedResultReproduced: reproduced },
    evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    population: { id: 'PIT_SP500 (SPY holdings, SPXPOP 1.1.1)', periods: before.length, span: L.SPAN, frameListingsF0: ctx.listings.length, delistedQualifiedLoaded: dl.counts.loaded, delistedRegisterHash: dl.registerHash },
    returnBasis: 'PRICE_RETURN both sides (members: holdings-derived or series price return; replaced exits: split-adjusted delisted series price return, terminal scenario at the last traded close); SPY_TR reference as V12',
    costs: 'none (index population returns, as V12 P5a)', weighting: { EW_ALL: 'equal weight of all index members', CW_ALL: 'holdings weight (SPY) of all index members' },
    matching: { rule: 'BOUNDED_EXIT* member, same CIK as a QUALIFIED delisted chain with lastTradeDate in [t0, t1+120d], bar within 7 days at/before t0 (amendment 1.0.1 O6)', boundedExitRowsWithCikInSpan: logs[0].length, states,
      coverageReferenceAllSpyPeriods: 39, note: 'coverage-1.0.0 counts all SPY periods 1995-2026; P5a uses the span ' + L.SPAN.join('..') },
    replacedRows: replaced.map(x => ({ t0: x.t0, cik: x.cik, chainId: x.chainId, priorStatus: x.status, fateClass: x.fateClass, weight: r4(x.weight), kind: x.kind, terminalClass: x.terminalClass, matchingChains: x.chains,
      beforeZero: r4(x.before.ZERO), beforeLower: r4(x.before.LOWER), beforeFate: r4(x.before.FATE), afterS0: r4(x.r), afterS1: r4(logs[1].find(y => y.t0 === x.t0 && y.chainId === x.chainId).r), afterS2: r4(logs[2].find(y => y.t0 === x.t0 && y.chainId === x.chainId).r) })),
    replacedSummary: { n: replaced.length, weightSum: r4(replaced.reduce((a, x) => a + x.weight, 0)), meanBeforeZero: r4(L.mean(replaced.map(x => x.before.ZERO))), meanBeforeFate: r4(L.mean(replaced.map(x => x.before.FATE))), meanBeforeLower: r4(L.mean(replaced.map(x => x.before.LOWER))), meanAfterS0: r4(L.mean(replaced.map(x => x.r))),
      byKind: replaced.reduce((a, x) => { a[x.kind] = (a[x.kind] || 0) + 1; return a; }, {}), byTerminalClass: replaced.reduce((a, x) => { a[x.terminalClass] = (a[x.terminalClass] || 0) + 1; return a; }, {}), byPriorFateClass: replaced.reduce((a, x) => { a[x.fateClass] = (a[x.fateClass] || 0) + 1; return a; }, {}) },
    aggregates: { before: aggs(before), afterTerminalS0: aggs(after[0]), afterTerminalS1: aggs(after[1]), afterTerminalS2: aggs(after[2]) },
    scenarios: { P5a: P5.SCENARIO_LABELS, terminal: { S0_LAST_CLOSE: 'replaced exit at the last traded close', S1_MERGER_M10_OTHER_M30: 'MERGER -10 %, DISTRESS/UNKNOWN -30 % on the last traded close (only when the series ended before t1)', S2_MERGER_P10_OTHER_M100: 'MERGER +10 %, DISTRESS/UNKNOWN -100 %' } },
    scope: 'Index population (S&P 500 members by SPY holdings) 2009-09..2026-06; replaces only the bounded exits that a QUALIFIED delisted chain covers; tests only descriptive (V12 NW p-values of the period terms). Not a strategy, no alpha claim.',
    runtimeSeconds: null };
  out.runtimeSeconds = Math.round((Date.now() - t0) / 1000);
  const h = W.writeJson(o.out, out);
  if (o.private) fs.writeFileSync(path.join(W.K.privateDir(o.private), 's3-log.json'), JSON.stringify(logs));
  console.log(JSON.stringify({ out: path.relative(W.ROOT, o.out), sha256: h, states, replaced: replaced.length, reproduced, seconds: out.runtimeSeconds }));
}
if (require.main === module) main();
module.exports = { replacement, wrapPopulation };
