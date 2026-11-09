#!/usr/bin/env node
'use strict';
// V12 REQUAL P5a - population effect: equal-weighted survivor frame vs equal-weighted PIT S&P 500 (incl. exits, bounded cases) vs SPY,
// and the direct survivorship gap INSIDE the index (members with our series vs all members). Registration 1.0.0 (P5.a_population).
// 1.1.0 (correction after the independent V12 review): population SPXPOP 1.1.1, scenarios FATE/UPPER (lib.cjs), span from 2013-03
// (qualification under the pre-registered SPXPOP rule 1.0.1), scenario labels for the survivorship term.
// Usage: node p5a-population.cjs [--out docs/quant-recovery/v12/requal/p5a-population-1.1.0.json] [--export <private dir>]
//   --export writes the Python check input (frame series, ids) to <private dir>/frame-export.json.gz (outside the repository).
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const L = require('./lib.cjs');
const K = require(L.ROOT + '/scripts/quant/v10/studies/common.cjs');
const { readRegistration } = require('./plan.cjs');

const LOADER = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const SERIES = ['SPY', 'SPY_TR', 'SPY_W', 'EW_ALL', 'CW_ALL', 'EW_WITH_H', 'EW_WITHOUT_H', 'EW_WITH_S', 'EW_FRAME', 'EW_FRAME_WREB'];
const TERMS = { universe: ['EW_FRAME', 'EW_WITH_S'], measurement: ['EW_WITH_S', 'EW_WITH_H'], survivorshipInIndex: ['EW_WITH_H', 'EW_ALL'], equalWeightInIndex: ['EW_ALL', 'SPY'],
  benchmarkTrMinusPrice: ['SPY_TR', 'SPY'], rebalancingWeekly: ['EW_FRAME_WREB', 'EW_FRAME'], dateAlignmentSpy: ['SPY_W', 'SPY'], frameMinusSpy: ['EW_FRAME', 'SPY'], frameWrebMinusSpyW: ['EW_FRAME_WREB', 'SPY_W'] };

function frameContext() {
  const fr = K.buildFrame(LOADER);
  const manifestHash = K.V.hash(K.sourceManifest(fr));
  const listings = fr.frame.map(id => { const d = fr.docs.get(id); return { id, dates: d.points.map(p => p[0]), closes: d.points.map(p => p[1]), listingStart: d.listingStart, lifecycle: d.listingLifecycle ?? null }; });
  return { fr, manifestHash, listings, byId: new Map(listings.map(l => [l.id, l])), calendar: fr.calendar };
}
// V11 weekly rebalanced EW frame index (scripts/quant/v11/decomposition/events.cjs#ewIndex semantics) on the frame calendar.
function ewIndex(ctx) {
  const cal = ctx.calendar, ci = new Map(cal.map((d, i) => [d, i])), T = cal.length, sum = new Float64Array(T), cnt = new Float64Array(T);
  for (const p of ctx.listings) for (let k = 1; k < p.dates.length; k++) {
    const c = ci.get(p.dates[k]), cp = ci.get(p.dates[k - 1]);
    if (c !== cp + 1 || p.dates[k - 1] < p.listingStart) continue;
    sum[c] += p.closes[k] / p.closes[k - 1] - 1; cnt[c]++;
  }
  const I = new Float64Array(T); I[0] = 1; for (let c = 1; c < T; c++) I[c] = I[c - 1] * (1 + (cnt[c] > 0 ? sum[c] / cnt[c] : 0));
  return { at: d => { const k = L.lastIdx(cal, d, 7); return k < 0 ? null : { d: cal[k], v: I[k] }; } };
}

function computePeriods(ctx, pop, spy, dist) {
  const ew = ewIndex(ctx), rows = [];
  for (const p of pop.periods) {
    const mem = pop.members(p.t0), row = { t0: p.t0, t1: p.t1, months: L.IP.monthsBetween(p.t0, p.t1), qualification: p.qualification, series: {}, counts: {} };
    const tr = L.spyTotalReturn(spy, dist, p.t0, p.t1);
    const w0 = ew.at(p.t0), w1 = ew.at(p.t1);
    const spyW = spy.at(w0.d) && spy.at(w1.d) ? spy.at(w1.d) / spy.at(w0.d) - 1 : null;
    // with-series set (identical for H and S)
    const withSet = [], without = [], seriesKinds = {};
    for (const m of mem.members) {
      const l = m.securityId ? ctx.byId.get(m.securityId) : null;
      const sr = l && L.hasBarAt(l, p.t0) ? L.seriesReturn(l, p.t0, p.t1) : null;
      if (sr) { withSet.push({ m, sr }); seriesKinds[sr.kind] = (seriesKinds[sr.kind] || 0) + 1; } else without.push(m);
    }
    const frameRets = [], frameKinds = {}; let frameGap = 0;
    for (const l of ctx.listings) { if (!L.hasBarAt(l, p.t0)) continue; const sr = L.seriesReturn(l, p.t0, p.t1); if (!sr) { frameGap++; continue; } frameRets.push(sr); frameKinds[sr.kind] = (frameKinds[sr.kind] || 0) + 1; }
    const lowerSeries = sr => sr.kind === 'LAST_CLOSE' ? -1 : sr.r;
    for (const sc of L.SCENARIOS_P5A) {
      const s = {};
      s.SPY = spy.ret(p.t0, p.t1); s.SPY_TR = tr.tr; s.SPY_W = spyW;
      s.EW_ALL = L.mean(mem.members.map(m => m.ret[sc]));
      s.CW_ALL = mem.members.reduce((a, m) => a + m.weight * m.ret[sc], 0) / mem.members.reduce((a, m) => a + m.weight, 0);
      s.EW_WITH_H = L.mean(withSet.map(x => x.m.ret[sc]));
      s.EW_WITHOUT_H = without.length ? L.mean(without.map(m => m.ret[sc])) : null;
      s.EW_WITH_S = L.mean(withSet.map(x => sc === 'LOWER' ? lowerSeries(x.sr) : x.sr.r));
      s.EW_FRAME = L.mean(frameRets.map(x => sc === 'LOWER' ? lowerSeries(x) : x.r));
      s.EW_FRAME_WREB = w1.v / w0.v - 1;
      row.series[sc] = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, L.r6(v)]));
    }
    const bnd = mem.members.filter(m => m.group === 'bounded');
    const byFateClass = {}; for (const m of bnd) { const k = byFateClass[m.fateClass] = byFateClass[m.fateClass] || { n: 0, w: 0 }; k.n++; k.w = L.r6(k.w + m.weight); }
    row.counts = { members: mem.members.length, withSeries: withSet.length, withoutSeries: without.length, withSeriesWeight: L.r6(withSet.reduce((a, x) => a + x.m.weight, 0)),
      boundedMembers: bnd.length, boundedWeight: L.r6(bnd.reduce((a, m) => a + m.weight, 0)), boundedByFateClass: byFateClass, boundedWithSeries: withSet.filter(x => x.m.group === 'bounded').length,
      withSeriesKinds: seriesKinds, frameListings: frameRets.length, frameSeriesGapExcluded: frameGap, frameKinds,
      weeklyDates: [w0.d, w1.d], spyTrDividendYield: L.r6(tr.divYield), spyTrCarriedForward: tr.carried, nportTotalReturn: p.nportTotalReturn ?? null };
    rows.push(row);
  }
  return rows;
}

function aggregate(rows, sc, filter = () => true) {
  const sel = rows.filter(filter); if (!sel.length) return null;
  const Y = sel.reduce((a, r) => a + L.years(r.t0, r.t1), 0);
  const cagr = {}, total = {};
  for (const k of SERIES) { const v = sel.map(r => r.series[sc][k]); if (v.some(x => !L.finite(x))) { cagr[k] = null; continue; } const g = v.reduce((a, x) => a * (1 + x), 1); total[k] = L.r6(g - 1); cagr[k] = L.r6(g ** (1 / Y) - 1); }
  const terms = {};
  for (const [name, [a, b]] of Object.entries(TERMS)) {
    const d = sel.map(r => r.series[sc][a] - r.series[sc][b]);
    if (d.some(x => !L.finite(x))) { terms[name] = null; continue; }
    const nw = L.neweyWest(d, 2);
    terms[name] = { meanPeriodPp: L.r6(L.mean(d) * 100), annualizedArithmeticPp: L.r6(d.reduce((s, x) => s + x, 0) / Y * 100), cagrDiffPp: cagr[a] !== null && cagr[b] !== null ? L.r6((cagr[a] - cagr[b]) * 100) : null,
      positivePeriods: d.filter(x => x > 0).length, periods: d.length, nwSePp: nw.se === null ? null : L.r6(nw.se * 100), nwP: L.r6(nw.p) };
  }
  const idn = sel.map(r => { const s = r.series[sc]; return (s.EW_FRAME - s.SPY) - ((s.EW_FRAME - s.EW_WITH_S) + (s.EW_WITH_S - s.EW_WITH_H) + (s.EW_WITH_H - s.EW_ALL) + (s.EW_ALL - s.SPY)); });
  return { periods: sel.length, years: L.r6(Y), from: sel[0].t0, to: sel.at(-1).t1, cagr, total, terms, identityMaxAbsResidual: Math.max(...idn.map(Math.abs)) };
}

// SPXPOP rule 1.0.1 (registered before any result) qualified the S&P 500 from 2013-03-31; 1.1.0 extended it to 2009-09 after sight.
const SPAN_101 = '2013-03-31';
const SCENARIO_LABELS = {
  ZERO: 'point convention: bounded exits at 0 % (last holdings price), ambiguous CA at the midpoint - NOT a bound',
  LOWER: 'all bounded exits at -100 %, ambiguous CA at the lower bound - gives the UPPER bound of the survivorship term (EW_WITH_H - EW_ALL) and the lower bound of EW_ALL/CW_ALL',
  FATE: 'exits by documented fate: takeover -> typical premium of documented takeovers (takeoverPremium.median), delisting/bankruptcy -> -100 %, index change -> population period return, unknown fate -> 0 %; ambiguous CA midpoint - evidence-based point estimate',
  UPPER: 'every bounded exit at max(takeover premium p75, population period return), ambiguous CA at the upper bound - gives the lower end of the survivorship term'
};
function main() {
  const o = L.args(process.argv.slice(2), { out: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json'), export: null });
  const t0 = Date.now(), reg = readRegistration();
  const ctx = frameContext(), pop = L.makePopulation(), spy = L.makeSpy(), dist = L.spyDistributions();
  const rows = computePeriods(ctx, pop, spy, dist);
  const r1 = L.regimeR1(spy, pop.periods), r2 = L.regimeR2(reg.registration, pop.periods);
  rows.forEach((r, i) => { r.regimeR1 = r1[i].label; r.regimeR2 = r2[i].label; });
  const qualified = r => r.qualification === 'QUALIFIED';
  const out = { studyId: 'V12-REQUAL-P5A', registrationSha256: reg.sha256, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    population: { id: 'PIT_SP500', rules: pop.ruleVersion, dataSha256: pop.dataSha256, periods: rows.length, span: L.SPAN, nonQualifiedInSpan: rows.filter(r => !qualified(r)).map(r => [r.t0, r.qualification]) },
    frame: { loaderOptions: LOADER, listings: ctx.listings.length, sourceManifestHash: ctx.manifestHash, v11ManifestHash: '2c27039fd782cccced62ac28cebfb808eea07670ba2c79e58e373824bcc0b679', note: 'manifest differs from the V11 run (CA register 1.1.2); frame size identical' },
    returnBasis: 'PRICE_RETURN on both sides; SPY_TR = SPY price + N-30D distributions (reference only)', inputs: { spySha256: spy.sha256, spyDistributionsSha256: dist.sha256 },
    seriesDefinitions: reg.registration.P5.a_population.series, termDefinitions: TERMS, identity: reg.registration.P5.a_population.identity,
    regimes: { R1: r1, R2: r2 },
    amendmentSha256: L.shaFile('docs/quant-recovery/v12/requal/amendment-1.1.0.json'), resultVersion: '1.1.0', correction: 'Korrektur nach unabhaengiger Pruefung: SPXPOP 1.1.1 (Broadcom-Identitaetsbruch u. a.), Szenarien FATE/UPPER, Spanne ab 2013-03 (SPXPOP-Regel 1.0.1), Szenario-Bezeichnungen (amendment-1.1.0.json)',
    scenarios: SCENARIO_LABELS, takeoverPremium: pop.premium,
    aggregates: {}, periods: rows, runtimeSeconds: null };
  for (const sc of L.SCENARIOS_P5A) out.aggregates[sc] = {
    full: aggregate(rows, sc), qualifiedOnly: aggregate(rows, sc, qualified), from2013_03_rule101: aggregate(rows, sc, r => r.t0 >= SPAN_101),
    semiannual_2009_2019: aggregate(rows, sc, r => r.t1 <= '2019-09-30'), quarterly_2019_2026: aggregate(rows, sc, r => r.t0 >= '2019-09-30'),
    regimeR1: Object.fromEntries(['CRASH_BEAR', 'RECOVERY', 'SIDEWAYS', 'BULL'].map(k => [k, aggregate(rows, sc, r => r.regimeR1 === k)])),
    regimeR2: Object.fromEntries(['CRASH_BEAR', 'RECOVERY', 'SIDEWAYS', 'OTHER'].map(k => [k, aggregate(rows, sc, r => r.regimeR2 === k)])) };
  out.runtimeSeconds = Math.round((Date.now() - t0) / 1000);
  const h = L.writeJson(o.out, out);
  if (o.export) {
    const dir = K.privateDir(o.export);
    const exp = { schemaVersion: 'v12-requal-frame-export-1.0.0', sourceManifestHash: ctx.manifestHash, calendar: ctx.calendar,
      listings: ctx.listings.map(l => [l.id, l.listingStart, l.dates, l.closes, l.lifecycle && l.lifecycle.terminal ? { kind: l.lifecycle.terminal.kind, cashPerShare: l.lifecycle.terminal.cashPerShare ?? null } : null]) };
    fs.writeFileSync(path.join(dir, 'frame-export.json.gz'), zlib.gzipSync(JSON.stringify(exp)));
  }
  console.log(JSON.stringify({ out: path.relative(L.ROOT, o.out), sha256: h, seconds: out.runtimeSeconds }));
}
if (require.main === module) main();
module.exports = { frameContext, ewIndex, computePeriods, aggregate, SERIES, TERMS, LOADER, SPAN_101, SCENARIO_LABELS };
