#!/usr/bin/env node
'use strict';
// V12 REQUAL P6 - six pre-registered complete trading strategies on the PIT S&P 500 (registration 1.0.2, section P6).
// Rebalancing at population dates, targets fixed at t0, buy-and-hold to t1 with holdings returns (incl. exits, ZERO/LOWER), cash at EFFR,
// costs on traded notional (base 10+5, stress 20+30 bps per side). No parameter search.
// 1.1.0 (correction after the independent V12 review, amendment-1.1.0.json): population SPXPOP 1.1.1; CW_ALL (same holdings source)
// as like-for-like benchmark next to SPY (own Holm family); span from 2013-03 (SPXPOP rule 1.0.1); holdings export for the dividend
// quantification (dividend_yield.py); execution timing disclosed. Strategy definitions and parameters unchanged (registration 1.0.2).
// Usage: node p6-strategies.cjs --panels <v12-private>/mcap [--out docs/quant-recovery/v12/requal/p6-strategies-1.1.0.json] [--p5a <file>] [--export-holdings <private file>]
const path = require('node:path');
const L = require('./lib.cjs');
const { frameContext } = require('./p5a-population.cjs');
const { readPanelDates, rankDateFor } = require('./panel-access.cjs');
const { readRegistration } = require('./plan.cjs');

const COSTS = { BASE: 15e-4, STRESS: 50e-4, GROSS: 0 };
const IDS = ['S1_EW_SP500', 'S2_MOM_Q5_FILTER', 'S3_QP_Q5', 'S4_MOMQP_TOP30_VOLTGT', 'S5_LOWVOL_Q1', 'S6_EW_BUFFER_FILTER'];
const finite = L.finite;

function marketFilter(spy, t0) {
  const ends = []; let k = L.lastIdx(spy.dates, t0);
  const px = spy.values[k];
  while (k >= 0 && ends.length < 10) { const m = spy.dates[k].slice(0, 7); ends.push(spy.values[k]); while (k >= 0 && spy.dates[k].slice(0, 7) === m) k--; }
  const sma = L.mean(ends);
  return { on: px > sma, price: px, sma10m: sma };
}
const topBy = (rows, key, n, desc = true) => rows.filter(r => finite(r[key])).sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key]) || (a.sid < b.sid ? -1 : 1)).slice(0, n);
const quint = n => Math.ceil(n / 5);

/** Equal-weighted basket sigma (annualised) over the 52 weekly returns to the last bar <= t0 (names with >= 26 returns). */
function basketSigma(ctx, sids, t0) {
  const cal = ctx.calendar, c = L.lastIdx(cal, t0, 7); if (c < 52) return null;
  const ci = ctx.calIndex, per = [];
  for (const sid of sids) {
    const l = ctx.byId.get(sid); if (!l) continue;
    const m = new Map(); for (let k = 0; k < l.dates.length; k++) { const j = ci.get(l.dates[k]); if (j !== undefined) m.set(j, l.closes[k]); }
    const r = new Map(); for (let j = c - 51; j <= c; j++) if (m.has(j) && m.has(j - 1) && l.dates[0] <= cal[j - 1]) r.set(j, m.get(j) / m.get(j - 1) - 1);
    if (r.size >= 26) per.push(r);
  }
  if (!per.length) return null;
  const wk = []; for (let j = c - 51; j <= c; j++) { const v = per.filter(r => r.has(j)).map(r => r.get(j)); if (v.length) wk.push(L.mean(v)); }
  return { sigma: L.sd(wk) * Math.sqrt(52), names: per.length, weeks: wk.length };
}

function targets(id, ctx, p, mem, panelRows, mf) {
  const all = mem.members;
  const sel = [], seen = new Set();
  for (const m of all) { if (!m.securityId || seen.has(m.securityId)) continue; const row = panelRows.get(m.securityId); if (!row) continue; seen.add(m.securityId);
    const s = row.scores, qp = finite(s.quality) && finite(s.profitability) ? (s.quality + s.profitability) / 2 : null;
    sel.push({ chainId: m.chainId, sid: m.securityId, mom: s.momentum, qp, combo: finite(s.momentum) && finite(qp) ? (s.momentum + qp) / 2 : null, vol: row.raws.realizedVolatility252d }); }
  const ew = (list, e) => { const w = new Map(); list.forEach(x => w.set(x.chainId, e / list.length)); return w; };
  const info = { selectable: sel.length };
  let pick, e = 1;
  switch (id) {
    case 'S1_EW_SP500': return { w: ew(all, 1), info: { ...info, eligible: all.length, picked: all.length, equity: 1 } };
    case 'S6_EW_BUFFER_FILTER': e = mf.on ? 0.9 : 0.45; return { w: ew(all, e), info: { ...info, eligible: all.length, picked: all.length, equity: e, filterOn: mf.on } };
    case 'S2_MOM_Q5_FILTER': { const el = sel.filter(x => finite(x.mom)); pick = topBy(el, 'mom', quint(el.length)); e = mf.on ? 1 : 0; return { w: ew(pick, e), info: { ...info, eligible: el.length, picked: pick.length, equity: e, filterOn: mf.on } }; }
    case 'S3_QP_Q5': { const el = sel.filter(x => finite(x.qp)); pick = topBy(el, 'qp', quint(el.length)); return { w: ew(pick, 1), info: { ...info, eligible: el.length, picked: pick.length, equity: 1 } }; }
    case 'S4_MOMQP_TOP30_VOLTGT': { const el = sel.filter(x => finite(x.combo)); pick = topBy(el, 'combo', 30); const sg = basketSigma(ctx, pick.map(x => x.sid), p.t0);
      e = sg && sg.sigma > 0 ? Math.min(1, 0.15 / sg.sigma) : 1; return { w: ew(pick, e), info: { ...info, eligible: el.length, picked: pick.length, equity: e, sigma: sg ? L.r6(sg.sigma) : null, sigmaNames: sg ? sg.names : 0 } }; }
    case 'S5_LOWVOL_Q1': { const el = sel.filter(x => finite(x.vol)); pick = topBy(el, 'vol', quint(el.length), false); return { w: ew(pick, 1), info: { ...info, eligible: el.length, picked: pick.length, equity: 1 } }; }
    case 'EW_SELECTABLE': return { w: ew(sel, 1), info: { ...info, eligible: sel.length, picked: sel.length, equity: 1 } };
  }
  throw Error('UNKNOWN_STRATEGY:' + id);
}

function simulate(id, ctx, periods, sc, costRate, cashMode) {
  let drift = new Map(), driftCash = 1, first = true; const rows = [];
  for (const p of periods) {
    const mem = ctx.pop.members(p.t0), byChain = new Map(mem.members.map(m => [m.chainId, m]));
    // positions no longer in the index at t0 were converted to cash at the end of the previous period (in drift already)
    const { w, info } = targets(id, ctx, p, mem, ctx.panel.get(p.rank) || new Map(), ctx.filter.get(p.t0));
    let traded = 0; const keys = new Set([...w.keys(), ...drift.keys()]);
    for (const k of keys) traded += Math.abs((w.get(k) || 0) - (first ? 0 : (drift.get(k) || 0)));
    const cost = traded * costRate, cashW = 1 - [...w.values()].reduce((a, x) => a + x, 0);
    const cashRet = cashMode === 'ZERO_CASH' ? 0 : ctx.cash.ret(p.t0, p.t1);
    let gross = cashW * cashRet, boundedW = 0; const nd = new Map(); let ndCash = cashW * (1 + cashRet);
    for (const [k, wk] of w) { const m = byChain.get(k), r = m.ret[sc]; gross += wk * r; if (m.group === 'bounded') boundedW += wk; nd.set(k, wk * (1 + r)); }
    const r = (1 - cost) * (1 + gross) - 1;
    // drift to t1: members still in the index next period keep their chainId; the others become cash
    const next = ctx.nextChains.get(p.t0); const tot = 1 + gross;
    drift = new Map(); driftCash = ndCash / tot;
    for (const [k, v] of nd) { if (next && next.has(k)) drift.set(k, v / tot); else driftCash += v / tot; }
    const { equity: targetEquity, ...rest } = info;
    rows.push({ t0: p.t0, t1: p.t1, r, gross, cash: cashRet, traded, cost, ...rest, targetEquity, equity: 1 - cashW, positions: w.size, boundedWeightHeld: boundedW, qualification: p.qualification });
    first = false;
  }
  return rows;
}

function regimeTable(rows, bench, ew, labels) {
  const out = {};
  for (const lab of [...new Set(labels.map(x => x.label))].sort()) {
    const idx = rows.map((r, i) => i).filter(i => labels.find(x => x.t0 === rows[i].t0)?.label === lab); if (!idx.length) continue;
    const d = idx.map(i => rows[i].r - bench[i].r), de = idx.map(i => rows[i].r - ew[i].r);
    out[lab] = { periods: idx.length, meanReturnPp: L.r6(L.mean(idx.map(i => rows[i].r)) * 100), meanSpyPp: L.r6(L.mean(idx.map(i => bench[i].r)) * 100), meanExcessVsSpyPp: L.r6(L.mean(d) * 100), positiveVsSpy: d.filter(x => x > 0).length,
      relativeWealthVsSpy: L.r6(idx.reduce((a, i) => a * (1 + rows[i].r) / (1 + bench[i].r), 1)), meanExcessVsEwSp500Pp: L.r6(L.mean(de) * 100) };
  }
  return out;
}

async function main() {
  const o = L.args(process.argv.slice(2), { panels: null, out: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p6-strategies-1.1.0.json'), p5a: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json'), 'export-holdings': null });
  if (!o.panels) throw Error('PANELS_DIR_REQUIRED');
  const t0 = Date.now(), reg = readRegistration();
  const fc = frameContext(), pop = L.makePopulation(), spy = L.makeSpy(), cash = L.makeCash(), dist = L.spyDistributions();
  const hdr = await readPanelDates(path.join(o.panels, 'after/panel.jsonl.gz'), []);
  const all = pop.periods.map(p => ({ ...p, rank: rankDateFor(hdr.header.rankDates, p.t0, L.SIGNAL_MAX_STALE_DAYS) }));
  const periods = all.filter(p => p.rank), ext = all;
  const panel = (await readPanelDates(path.join(o.panels, 'after/panel.jsonl.gz'), periods.map(p => p.rank)));
  const nextChains = new Map(all.map((p, i) => [p.t0, i + 1 < all.length ? new Set(pop.members(all[i + 1].t0).members.map(m => m.chainId)) : null]));
  const ctx = { ...fc, calIndex: new Map(fc.calendar.map((d, i) => [d, i])), pop, cash, panel: panel.byDate, nextChains, filter: new Map(all.map(p => [p.t0, marketFilter(spy, p.t0)])) };
  const p5a = require(o.p5a);
  const r1 = L.regimeR1(spy, all), r2 = L.regimeR2(reg.registration, all);
  const spyRows = ps => ps.map(p => ({ t0: p.t0, t1: p.t1, r: spy.ret(p.t0, p.t1), cash: cash.ret(p.t0, p.t1) }));
  const trRows = ps => ps.map(p => ({ t0: p.t0, t1: p.t1, r: L.spyTotalReturn(spy, dist, p.t0, p.t1).tr, cash: cash.ret(p.t0, p.t1) }));
  const withRows = (ps, sc) => ps.map(p => ({ t0: p.t0, t1: p.t1, r: p5a.periods.find(x => x.t0 === p.t0).series[sc].EW_WITH_H }));
  // 1.1.0: holdings-weighted total population (same holdings source as the strategies, same scenario for bounded cases)
  const cwRows = (ps, sc) => ps.map(p => ({ t0: p.t0, t1: p.t1, r: p5a.periods.find(x => x.t0 === p.t0).series[sc].CW_ALL, cash: cash.ret(p.t0, p.t1) }));
  // SPY daily MaxDD over the span (scale reference for period-granularity drawdowns)
  const spyDailyDD = (a, b) => { const i0 = L.lastIdx(spy.dates, a), i1 = L.lastIdx(spy.dates, b); let pk = 0, dd = 0; for (let k = i0; k <= i1; k++) { pk = Math.max(pk, spy.values[k]); dd = Math.min(dd, spy.values[k] / pk - 1); } return L.r6(dd); };
  function evaluate(ps, withExtras) {
    const res = { from: ps[0].t0, to: ps.at(-1).t1, periods: ps.length, scenarios: {} };
    for (const sc of L.SCENARIOS) {
      res.scenarios[sc] = {};
      for (const [cl, rate] of Object.entries(COSTS)) {
        const S = {}, spyR = spyRows(ps), trR = trRows(ps), withR = withRows(ps, sc), cwR = cwRows(ps, sc), cwTests = [];
        const runs = Object.fromEntries(IDS.concat(['EW_SELECTABLE']).map(id => [id, simulate(id, ctx, ps, sc, rate, 'EFFR')]));
        const tests = [];
        for (const id of IDS) {
          const rows = runs[id], pf = L.perf(rows), Y = pf.years;
          const vsSpy = L.excessStats(rows, spyR), vsEw = id === 'S1_EW_SP500' ? null : L.excessStats(rows, runs.S1_EW_SP500), vsCw = L.excessStats(rows, cwR);
          cwTests.push({ id, vs: 'CW_ALL', nwP: vsCw.nw.p, bootP: vsCw.bootstrap.p });
          S[id] = { performance: pf, turnoverOneSidedPerYear: L.r6(rows.reduce((a, r) => a + r.traded, 0) / 2 / Y), costDragPerYearPp: L.r6(rows.reduce((a, r) => a + r.cost, 0) / Y * 100),
            avgEquity: L.r6(L.mean(rows.map(r => r.equity))), avgPositions: L.r6(L.mean(rows.map(r => r.positions))), minPositions: Math.min(...rows.map(r => r.positions)), periodsWithoutEligibleNames: rows.filter(r => r.eligible === 0).length,
            maxBoundedWeightHeld: L.r6(Math.max(...rows.map(r => r.boundedWeightHeld))), boundedWeightHeldMean: L.r6(L.mean(rows.map(r => r.boundedWeightHeld))),
            vsSpy, vsCwAll: vsCw, vsSpyTrReference: { cagrDiff: L.r6(pf.cagr - L.perf(trR).cagr), basis: 'strategy PRICE vs SPY TOTAL RETURN reference (mixed basis, labelled)' }, vsEwSp500: vsEw,
            vsSelectableUniverse: L.excessStats(rows, runs.EW_SELECTABLE, { bootstrap: false }), vsEwWithSeriesP5a: L.excessStats(rows, withR, { bootstrap: false }),
            qualifiedOnly: (() => { const q = rows.map((r, i) => [r, spyR[i]]).filter(([r]) => r.qualification === 'QUALIFIED'); return { periods: q.length, meanExcessVsSpyPp: L.r6(L.mean(q.map(([r, x]) => r.r - x.r)) * 100) }; })(),
            regimesR1: regimeTable(rows, spyR, runs.S1_EW_SP500, r1), regimesR2: regimeTable(rows, spyR, runs.S1_EW_SP500, r2),
            periods: withExtras && cl === 'BASE' ? rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? L.r6(v) : v]))) : undefined };
          tests.push({ id, vs: 'SPY', nwP: vsSpy.nw.p, bootP: vsSpy.bootstrap.p });
          if (vsEw) tests.push({ id, vs: 'S1_EW_SP500', nwP: vsEw.nw.p, bootP: vsEw.bootstrap.p });
        }
        const hn = L.holm(tests.map(t => t.nwP)), hb = L.holm(tests.map(t => t.bootP));
        tests.forEach((t, i) => { t.holmNw = L.r6(hn[i]); t.holmBoot = L.r6(hb[i]); t.secured = hn[i] <= 0.05 && hb[i] <= 0.05; t.nwP = L.r6(t.nwP); t.bootP = L.r6(t.bootP); });
        const cn = L.holm(cwTests.map(t => t.nwP)), cb = L.holm(cwTests.map(t => t.bootP));
        cwTests.forEach((t, i) => { t.holmNw = L.r6(cn[i]); t.holmBoot = L.r6(cb[i]); t.secured = cn[i] <= 0.05 && cb[i] <= 0.05; t.nwP = L.r6(t.nwP); t.bootP = L.r6(t.bootP); });
        res.scenarios[sc][cl] = { strategies: S, references: { SPY: L.perf(spyR), CW_ALL: L.perf(cwR), SPY_TR_REFERENCE: L.perf(trR), EW_SELECTABLE: L.perf(runs.EW_SELECTABLE), EW_WITH_SERIES_P5A: L.perf(withR), spyDailyMaxDD: spyDailyDD(ps[0].t0, ps.at(-1).t1) },
          multipleTesting: { family: tests.length, rule: 'secured = Holm <= 0.05 under Newey-West AND block bootstrap', tests },
          multipleTestingVsCwAll: { family: cwTests.length, rule: '1.1.0 like-for-like benchmark CW_ALL (holdings-weighted total population, same scenario); own Holm family, not mixed with the registered family', tests: cwTests } };
      }
      if (withExtras) {
        // cash sensitivity (0 % cash) and S1 extended span, base costs
        res.scenarios[sc].ZERO_CASH_BASE = Object.fromEntries(IDS.map(id => { const rows = simulate(id, ctx, ps, sc, COSTS.BASE, 'ZERO_CASH'); return [id, { performance: L.perf(rows.map(r => ({ ...r, cash: 0 }))), cagrDiffVsSpy: L.r6(L.perf(rows).cagr - L.perf(spyRows(ps)).cagr) }]; }));
        const rows = simulate('S1_EW_SP500', ctx, ext, sc, COSTS.BASE, 'EFFR'); res.scenarios[sc].S1_EXTENDED_2009_2026_BASE = { performance: L.perf(rows), spy: L.perf(spyRows(ext)), vsSpy: L.excessStats(rows, spyRows(ext)) };
      }
    }
    return res;
  }
  const registeredSpan = evaluate(periods, true);
  // Post hoc (disclosed): S3/S4 have no eligible member (profitability score unavailable in the panel) before a mechanically determined date and sit in cash.
  // Common span = first t0 from which every strategy has eligible members.
  const firstAll = periods.findIndex(p => IDS.every(id => targets(id, ctx, p, pop.members(p.t0), ctx.panel.get(p.rank) || new Map(), ctx.filter.get(p.t0)).info.eligible > 0));
  const commonSpan = { ...evaluate(periods.slice(firstAll), false), note: 'post hoc sensitivity, defined after the registered-span results showed S3/S4 in cash for the first periods (no eligible member); start = first population date at which every strategy has eligible members' };
  // 1.1.0: span from the first S&P 500 period qualified under the pre-registered SPXPOP rule 1.0.1 (2013-03-31); portfolios restart there
  const span2013 = { ...evaluate(periods.filter(p => p.t0 >= '2013-03-31'), false), note: '1.1.0 (correction after independent review): span from 2013-03-31, the first qualified S&P 500 period under the pre-registered SPXPOP rule 1.0.1; portfolios restart at 2013-03-31' };
  const res = { registeredSpan, commonSpan, span2013_rule101: span2013 };
  if (o['export-holdings']) {
    // private input of dividend_yield.py: registered span, ZERO, BASE targets per period (weights at t0) for S1-S6 and the population
    const exp = { schemaVersion: 'v12-requal-holdings-export-1.1.0', span: [periods[0].t0, periods.at(-1).t1], periods: [] };
    for (const p of periods) {
      const mem = pop.members(p.t0), byChain = new Map(mem.members.map(m => [m.chainId, m])), row = { t0: p.t0, t1: p.t1, CW_ALL: mem.members.map(m => [m.cik, m.securityId, L.r6(m.weight)]), strategies: {} };
      for (const id of IDS) { const { w } = targets(id, ctx, p, mem, ctx.panel.get(p.rank) || new Map(), ctx.filter.get(p.t0)); row.strategies[id] = [...w].map(([k, v]) => [byChain.get(k).cik, byChain.get(k).securityId, L.r6(v)]); }
      exp.periods.push(row);
    }
    require('node:fs').writeFileSync(o['export-holdings'], JSON.stringify(exp));
  }
  const out = { studyId: 'V12-REQUAL-P6', registrationSha256: reg.sha256, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    span: { from: periods[0].t0, to: periods.at(-1).t1, periods: periods.length, commonSpanFrom: periods[firstAll].t0 }, inputs: { panelAfterSha256: panel.sha256, indexDataSha256: pop.dataSha256, frameManifestHash: fc.manifestHash, spySha256: spy.sha256, effrSha256: cash.sha256, p5aSha256: L.shaFile(o.p5a) },
    strategyDefinitions: reg.registration.P6.strategies, scoreSource: 'AFTER panel full-frame scores (registration 1.0.2)', quintileRule: 'top/bottom ceil(n/5) of the eligible selectable members, ties by securityId',
    costs: { BASE: '15 bps per side', STRESS: '50 bps per side', GROSS: 'no costs (for the cost drag)' }, cash: 'EFFR accrual (sensitivity ZERO_CASH_BASE: 0 %)',
    returnBasis: 'PRICE_RETURN strategies and SPY; SPY_TR only as labelled reference', marketFilter: Object.fromEntries([...ctx.filter].map(([k, v]) => [k, { on: v.on, price: L.r6(v.price), sma10m: L.r6(v.sma10m) }])),
    regimes: { R1: r1, R2: r2 }, resultVersion: '1.1.0', amendmentSha256: L.shaFile('docs/quant-recovery/v12/requal/amendment-1.1.0.json'), populationRules: pop.ruleVersion,
    execution: 'same-bar: the market filter (SPY close vs 10 month-end SMA, both up to t0) and the volatility target (52 weekly bars up to the last bar <= t0) are evaluated with data up to t0 and the trades are executed at the t0 holdings prices of the same date; no execution lag (disclosed after the independent review, m7)',
    cashBasis: 'cash accrues the EFFR daily (a total-return component), while the equity side is a price return without dividends; ZERO_CASH_BASE shows the strategies with 0 % cash',
    results: res, runtimeSeconds: Math.round((Date.now() - t0) / 1000) };
  const h = L.writeJson(o.out, out);
  console.log(JSON.stringify({ out: path.relative(L.ROOT, o.out), sha256: h, seconds: out.runtimeSeconds }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { marketFilter, basketSigma, targets, simulate, COSTS, IDS };
