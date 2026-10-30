#!/usr/bin/env node
'use strict';
// V11 WINNERS stage 2: winner anatomy (E1-E5), splits, censoring sensitivity, survivorship gaps, case studies.
// Usage: node analyze.cjs --private <dir with members.json.gz> --out <evidence dir>
const fs = require('node:fs'), path = require('node:path');
const K = require('../../v10/studies/common.cjs');
const W = require('./lib.cjs');
const REG = require('./registration.cjs');

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DIRECTION = { mom3m: 'higher', mom6m: 'higher', mom12_1m: 'higher', rsSpy12_1m: 'higher', near52wHigh: 'higher', shareAbove40w: 'higher', trendSlope52w: 'higher', trendR2_52w: 'higher',
  drawdown52w: 'lower', vol52w: 'lower', logMarketCap: 'higher', revenueGrowthTtmYoy: 'higher', revenueCagr3y: 'higher', epsCagr3y: 'higher', grossMarginTtm: 'higher', operatingMarginTtm: 'higher',
  roaTtm: 'higher', roeTtm: 'higher', salesYield: 'higher', earningsYield: 'higher', bookToMarket: 'higher', accrualRatio: 'lower', netDebtToAssets: 'lower', fcfMarginTtm: 'higher',
  salesToMarketCap: 'higher', equityToAssets: 'higher' };
const FEATURES = Object.keys(DIRECTION);
const PRICE = new Set(REG.PRICE_FEATURES.map(f => f[0]));
const GROUP = Object.fromEntries([...REG.PRICE_FEATURES.map(f => [f[0], f[0] === 'vol52w' || f[0] === 'drawdown52w' ? 'risk' : f[0].startsWith('trend') || f[0] === 'shareAbove40w' ? 'trend' : 'momentum']),
  ...REG.FUNDAMENTAL_FEATURES.map(f => [f[0], f[2]]), ...REG.AMENDMENT_1_0_1.added.map(f => [f[0], f[2]])]);
const DEFS = ['top1', 'top5'];
const VALID = new Set(['OBSERVED', 'TERMINAL_CONSIDERATION', 'DELISTED_NO_CONSIDERATION', 'CENSORED']);
const r6 = x => (W.finite(x) ? Math.round(x * 1e6) / 1e6 : x ?? null);
const r4 = x => (W.finite(x) ? Math.round(x * 1e4) / 1e4 : x ?? null);

function blockMean(rows, dates, h, replicates = K.INFERENCE.replicates) {
  if (rows.length < 2 || dates.length < 4) return { n: rows.length, estimate: W.mean(rows.map(r => r.value)), ci: null, pValue: null, state: 'TOO_FEW_COHORTS' };
  const bl = Math.min(W.BLOCK_QUARTERS[h], Math.floor(dates.length / 2));
  try {
    const r = K.V.inferTemporalBlockMean({ calendar: dates, blockLength: bl, minimumBlockLength: bl, ...K.INFERENCE, replicates }, rows.map(x => ({ id: x.date, date: x.date, value: x.value })));
    return { n: r.n, estimate: r6(r.estimate), ci: r.ci.map(r6), pValue: r6(r.pValue), blockLength: bl, blocks: r.blockCountDiagnostic, state: 'ESTIMATED_NOT_CERTIFIED' };
  } catch (e) { return { n: rows.length, estimate: r6(W.mean(rows.map(r => r.value))), ci: null, pValue: null, state: 'ENGINE_REFUSED:' + e.message }; }
}

/** Per (cohort, horizon) analysis rows. variant: 'primary' | 'minus100'. */
function cohortAnalysis(c, h, variant) {
  const valid = c.members.filter(m => VALID.has(m.fwd[h].state));
  if (!valid.length) return null;
  const rets = valid.map(m => m.fwd[h][variant]);
  const cls = W.assignClasses(rets, valid.map(m => m.fwd[h].state === 'DELISTED_NO_CONSIDERATION'));
  const out = { date: c.date, n: valid.length, valid, rets, cls, features: {} };
  const allMean = W.mean(rets), allMedian = W.median(rets);
  const sum = rets.reduce((a, b) => a + b, 0);
  out.tail = { meanAll: allMean, medianAll: allMedian, spy: valid[0].spy[h],
    meanExTop1: W.mean(rets.filter((_, i) => !cls[i].top1)), meanExTop5: W.mean(rets.filter((_, i) => !cls[i].top5)),
    shareOfSumTop1: sum > 0 ? rets.filter((_, i) => cls[i].top1).reduce((a, b) => a + b, 0) / sum : null,
    shareOfSumTop5: sum > 0 ? rets.filter((_, i) => cls[i].top5).reduce((a, b) => a + b, 0) / sum : null,
    nTop1: cls.filter(x => x.top1).length, nTop5: cls.filter(x => x.top5).length, nLoser: cls.filter(x => x.loser).length,
    minTop1: Math.min(...rets.filter((_, i) => cls[i].top1)), minTop5: Math.min(...rets.filter((_, i) => cls[i].top5)), maxLoser: Math.max(...rets.filter((_, i) => cls[i].loser)) };
  for (const f of FEATURES) {
    const vals = valid.map(m => (W.finite(m.f[f]) ? m.f[f] : null));
    const nf = vals.filter(v => v !== null).length; if (nf < 50) continue;
    const pct = W.percentiles(vals, DIRECTION[f]);
    const fr = { nFinite: nf };
    const avgPct = W.mean(pct.filter((p, i) => p !== null && cls[i].average)), losPct = W.mean(pct.filter((p, i) => p !== null && cls[i].loser));
    for (const d of DEFS) {
      const lab = cls.map(x => x[d]), wp = pct.filter((p, i) => p !== null && lab[i]);
      fr[d] = { winPct: W.mean(wp), minusAverage: wp.length && avgPct !== null ? W.mean(wp) - avgPct : null, minusLoser: wp.length && losPct !== null ? W.mean(wp) - losPct : null,
        auc: W.rankAuc(pct, lab), top: W.quintileCounts(pct, lab, 'top'), bottom: W.quintileCounts(pct, lab, 'bottom') };
    }
    const lab = cls.map(x => x.loser);
    fr.loser = { auc: W.rankAuc(pct, lab), top: W.quintileCounts(pct, lab, 'top'), bottom: W.quintileCounts(pct, lab, 'bottom') };
    const withF = rets.filter((_, i) => pct[i] !== null), topR = rets.filter((_, i) => pct[i] !== null && pct[i] > 0.8), botR = rets.filter((_, i) => pct[i] !== null && pct[i] <= 0.2);
    fr.translation = { meanTopMinusAll: W.mean(topR) - W.mean(withF), medianTopMinusAll: W.median(topR) - W.median(withF), meanBottomMinusAll: W.mean(botR) - W.mean(withF), medianBottomMinusAll: W.median(botR) - W.median(withF), topMean: W.mean(topR), topMedian: W.median(topR) };
    // raw medians per class for interpretation
    const rawOf = sel => W.median(vals.filter((v, i) => v !== null && sel(cls[i])));
    fr.rawMedian = { top5: rawOf(x => x.top5), top1: rawOf(x => x.top1), average: rawOf(x => x.average), loser: rawOf(x => x.loser), all: W.median(vals.filter(v => v !== null)) };
    out.features[f] = fr;
  }
  return out;
}

const addCounts = (a, b) => { a.n += b.n; a.pos += b.pos; a.sel += b.sel; a.selPos += b.selPos; return a; };
const zero = () => ({ n: 0, pos: 0, sel: 0, selPos: 0 });

function summarise(rowsByH, cohortsMeta, variantLabel) {
  const table = {}, aucFamily = [], effFamily = [];
  for (const [h, rows] of Object.entries(rowsByH)) {
    table[h] = {};
    for (const f of FEATURES) {
      const rs = rows.filter(r => r.features[f]); if (!rs.length) continue;
      const dates = rs.map(r => r.date);
      const e = { group: GROUP[f], direction: DIRECTION[f], cohorts: rs.length, from: dates[0], to: dates.at(-1), membersWithFeature: rs.reduce((s, r) => s + r.features[f].nFinite, 0) };
      for (const d of [...DEFS, 'loser']) {
        const top = rs.reduce((a, r) => addCounts(a, r.features[f][d].top), zero()), bottom = rs.reduce((a, r) => addCounts(a, r.features[f][d].bottom), zero());
        const L = W.liftFrom(top), Lb = W.liftFrom(bottom);
        const aucRows = rs.filter(r => W.finite(r.features[f][d].auc)).map(r => ({ date: r.date, value: r.features[f][d].auc - 0.5 }));
        const auc = blockMean(aucRows, aucRows.map(r => r.date), h);
        const exPrec = rs.filter(r => r.features[f][d].top.sel && r.features[f][d].top.n).map(r => { const t = r.features[f][d].top; return { date: r.date, value: t.selPos / t.sel - t.pos / t.n }; });
        const cell = { auc: { mean: r6(auc.estimate === null ? null : auc.estimate + 0.5), ci: auc.ci ? auc.ci.map(x => r6(x + 0.5)) : null, pValue: auc.pValue, blockLength: auc.blockLength ?? null, blocks: auc.blocks ?? null, cohorts: auc.n, state: auc.state },
          topQuintile: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, r6(v)])), bottomQuintile: Object.fromEntries(Object.entries(Lb).map(([k, v]) => [k, r6(v)])),
          excessPrecisionTopQ: blockMean(exPrec, exPrec.map(r => r.date), h) };
        if (d !== 'loser') {
          const ea = rs.filter(r => W.finite(r.features[f][d].minusAverage)).map(r => ({ date: r.date, value: r.features[f][d].minusAverage }));
          const el = rs.filter(r => W.finite(r.features[f][d].minusLoser)).map(r => ({ date: r.date, value: r.features[f][d].minusLoser }));
          cell.effectVsAverage = blockMean(ea, ea.map(r => r.date), h); cell.effectVsLoser = blockMean(el, el.map(r => r.date), h);
          cell.meanWinnerPercentile = r6(W.mean(rs.map(r => r.features[f][d].winPct).filter(W.finite)));
          aucFamily.push({ key: [variantLabel, h, d, f].join('|'), pValue: cell.auc.pValue, cell: cell.auc });
          effFamily.push({ key: [variantLabel, h, d, f].join('|'), pValue: cell.effectVsAverage.pValue, cell: cell.effectVsAverage });
        }
        e[d] = cell;
      }
      const tr = rs.map(r => ({ date: r.date, value: r.features[f].translation.meanTopMinusAll })).filter(x => W.finite(x.value));
      e.translation = { meanTopQuintileMinusAll: blockMean(tr, tr.map(r => r.date), h),
        medianTopQuintileMinusAll: r6(W.mean(rs.map(r => r.features[f].translation.medianTopMinusAll).filter(W.finite))),
        meanBottomQuintileMinusAll: r6(W.mean(rs.map(r => r.features[f].translation.meanBottomMinusAll).filter(W.finite))),
        medianBottomQuintileMinusAll: r6(W.mean(rs.map(r => r.features[f].translation.medianBottomMinusAll).filter(W.finite))) };
      // Two-tailed view: on the quintile side where WINNER_TOP5 is enriched most, how enriched are LOSERS, and what did the side earn?
      const side = (e.top5.topQuintile.lift ?? 0) >= (e.top5.bottomQuintile.lift ?? 0) ? 'topQuintile' : 'bottomQuintile';
      const wl = e.top5[side].lift, ll = e.loser[side].lift;
      e.twoTailed = { enrichedSide: side === 'topQuintile' ? 'TOP_QUINTILE' : 'BOTTOM_QUINTILE', winnerTop5Lift: wl, winnerTop1Lift: e.top1[side].lift, loserLift: ll,
        winnerToLoserLiftRatio: W.finite(wl) && W.finite(ll) && ll > 0 ? r4(wl / ll) : null, precisionTop5: e.top5[side].precision, nonWinnerShareTop5: e.top5[side].falsePositiveShare,
        sideMeanMinusAll: side === 'topQuintile' ? e.translation.meanTopQuintileMinusAll.estimate : e.translation.meanBottomQuintileMinusAll,
        sideMedianMinusAll: side === 'topQuintile' ? e.translation.medianTopQuintileMinusAll : e.translation.medianBottomQuintileMinusAll };
      e.rawMedian = Object.fromEntries(['top1', 'top5', 'average', 'loser', 'all'].map(k => [k, r6(W.median(rs.map(r => r.features[f].rawMedian[k]).filter(W.finite)))]));
      e.rawMedian.note = 'median over cohorts of the per-cohort class median (raw units)';
      table[h][f] = e;
    }
  }
  const holm = fam => { const cells = fam.map(x => x.cell); const res = K.holmFamily(cells); return { ...res, rejectedKeys: fam.filter(x => x.cell.holmReject).map(x => x.key) }; };
  return { table, holm: { auc: holm(aucFamily), effectVsAverage: holm(effFamily) } };
}

function splitTables(rowsByH, metaByDate) {
  const out = {};
  for (const axis of ['trend', 'subperiod', 'ratePhase']) {
    out[axis] = {};
    for (const [h, rows] of Object.entries(rowsByH)) {
      out[axis][h] = {};
      const groups = new Map();
      for (const r of rows) { const m = metaByDate.get(r.date); const g = axis === 'trend' ? m.regime.trend : m[axis]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
      for (const f of FEATURES) {
        const per = {};
        for (const [g, rs0] of [...groups].sort()) {
          const rs = rs0.filter(r => r.features[f]); if (!rs.length) continue;
          const cell = { cohorts: rs.length };
          for (const d of DEFS) {
            const top = rs.reduce((a, r) => addCounts(a, r.features[f][d].top), zero()), L = W.liftFrom(top);
            cell[d] = { meanAuc: r4(W.mean(rs.map(r => r.features[f][d].auc).filter(W.finite))), lift: r4(L.lift), precision: r4(L.precision), baseRate: r4(L.baseRate), recall: r4(L.recall) };
          }
          cell.loserLiftTopQ = r4(W.liftFrom(rs.reduce((a, r) => addCounts(a, r.features[f].loser.top), zero())).lift);
          cell.translationMeanTopMinusAll = r4(W.mean(rs.map(r => r.features[f].translation.meanTopMinusAll).filter(W.finite)));
          per[g] = cell;
        }
        out[axis][h][f] = per;
      }
    }
  }
  return out;
}

function tailSummary(rowsByH) {
  const out = {};
  for (const [h, rows] of Object.entries(rowsByH)) {
    const t = rows.map(r => r.tail), avg = k => r4(W.mean(t.map(x => x[k]).filter(W.finite))), med = k => r4(W.median(t.map(x => x[k]).filter(W.finite)));
    out[h] = { cohorts: rows.length, membersPerCohortMedian: W.median(rows.map(r => r.n)), meanOfCohortEwMean: avg('meanAll'), meanOfCohortMedian: avg('medianAll'), meanSpy: avg('spy'),
      meanExTop1: avg('meanExTop1'), meanExTop5: avg('meanExTop5'), medianShareOfSumTop1: med('shareOfSumTop1'), medianShareOfSumTop5: med('shareOfSumTop5'),
      medianWinnerThresholdTop1: med('minTop1'), medianWinnerThresholdTop5: med('minTop5'), medianLoserThreshold: med('maxLoser'),
      shareOfCohortsMedianBelowSpy: r4(W.mean(t.filter(x => W.finite(x.spy)).map(x => (x.medianAll < x.spy ? 1 : 0)))),
      byCohort: rows.map(r => [r.date, r.n, r4(r.tail.meanAll), r4(r.tail.medianAll), r4(r.tail.spy), r4(r.tail.minTop1), r4(r.tail.minTop5), r4(r.tail.maxLoser), r4(r.tail.shareOfSumTop1), r4(r.tail.shareOfSumTop5)]),
      byCohortColumns: ['date', 'n', 'ewMean', 'median', 'spy', 'top1Threshold', 'top5Threshold', 'loserThreshold', 'shareOfSumTop1', 'shareOfSumTop5'] };
  }
  return out;
}

// POST-HOC descriptive (not registered): the case-study profile pooled over all cohorts with fundamentals.
function profilePooled(rowsByH) {
  const profiles = { QUALITY_GROWTH_MOMENTUM: ['mom12_1m', 'revenueGrowthTtmYoy', 'operatingMarginTtm'], QGM_AT_HIGH: ['mom12_1m', 'near52wHigh', 'revenueGrowthTtmYoy', 'operatingMarginTtm'],
    DISTRESSED_REBOUND: ['vol52w', 'drawdown52w', 'near52wHigh'] };
  const sideOf = { vol52w: 'bottom', drawdown52w: 'bottom', near52wHigh: 'bottom' };
  const out = { label: 'POST_HOC_DESCRIPTIVE_NOT_REGISTERED', definition: 'members in the top quintile (registered direction) of every listed feature; DISTRESSED_REBOUND uses the bottom quintile of vol52w, drawdown52w (i.e. highest volatility, deepest drawdown) and near52wHigh (farthest from the high)', profiles: {} };
  for (const [name, feats] of Object.entries(profiles)) {
    out.profiles[name] = { features: feats };
    for (const [h, rows] of Object.entries(rowsByH)) {
      let n = 0, sel = 0, t1 = 0, t5 = 0, lo = 0, cohorts = 0; const exMean = [], exMedian = [];
      for (const r of rows) {
        const pc = feats.map(f => W.percentiles(r.valid.map(m => (W.finite(m.f[f]) ? m.f[f] : null)), DIRECTION[f]));
        if (pc.some(a => a.filter(x => x !== null).length < 50)) continue;
        const ok = r.valid.map((_, i) => pc.every(a => a[i] !== null));
        const pick = r.valid.map((_, i) => ok[i] && feats.every((f, j) => (sideOf[f] === 'bottom' && name === 'DISTRESSED_REBOUND' ? pc[j][i] <= 0.2 : pc[j][i] > 0.8)));
        const all = r.rets.filter((_, i) => ok[i]), selR = r.rets.filter((_, i) => pick[i]);
        cohorts++; n += all.length; sel += selR.length;
        r.cls.forEach((c, i) => { if (pick[i]) { if (c.top1) t1++; if (c.top5) t5++; if (c.loser) lo++; } });
        if (selR.length) { exMean.push({ date: r.date, value: W.mean(selR) - W.mean(all) }); exMedian.push(W.median(selR) - W.median(all)); }
      }
      out.profiles[name][h] = { cohorts, membersWithAllFeatures: n, selected: sel, selectedShare: r4(sel / n), top1Share: r4(t1 / sel), top5Share: r4(t5 / sel), loserShare: r4(lo / sel),
        nonWinnerTop5Share: r4((sel - t5) / sel), meanMinusAll: blockMean(exMean, exMean.map(x => x.date), h), medianMinusAllAvg: r4(W.mean(exMedian)) };
    }
  }
  return out;
}

// ---------------- case studies ----------------
function memberView(c, h, rows, m) {
  const r = rows.find(x => x.date === c.date); if (!r) return null;
  const i = r.valid.indexOf(m); if (i < 0) return null;
  return { ret: r6(r.rets[i]), state: m.fwd[h].state, top1: r.cls[i].top1, top5: r.cls[i].top5, loser: r.cls[i].loser, pct: r4(r.cls[i].pct), spy: r6(m.spy[h]), cohortMedian: r6(r.tail.medianAll) };
}
function featurePcts(c) {
  const out = {};
  for (const f of FEATURES) { const vals = c.members.map(m => (W.finite(m.f[f]) ? m.f[f] : null)); if (vals.filter(v => v !== null).length < 50) continue; out[f] = W.percentiles(vals, DIRECTION[f]); }
  return out;
}
const PROFILE = ['mom12_1m', 'near52wHigh', 'revenueGrowthTtmYoy', 'operatingMarginTtm'];
function profilePeers(c, idx, pcts, rowsByH) {
  const prof = PROFILE.filter(f => pcts[f] && W.finite(pcts[f][idx]) && pcts[f][idx] > 0.8);
  const peers = c.members.map((m, i) => i).filter(i => prof.every(f => pcts[f] && W.finite(pcts[f][i]) && pcts[f][i] > 0.8));
  const res = { profile: prof, profileNote: prof.length ? 'top quintile on: ' + prof.join(', ') : 'case is in the top quintile on none of the profile features; peers = all members', peers: peers.length, members: c.members.length };
  for (const h of ['1Y', '3Y', '5Y']) {
    const r = rowsByH[h].find(x => x.date === c.date); if (!r) { res[h] = 'IMMATURE'; continue; }
    const pos = new Map(r.valid.map((m, i) => [m, i]));
    const ix = peers.map(i => pos.get(c.members[i])).filter(i => i !== undefined);
    const rr = ix.map(i => r.rets[i]);
    res[h] = { n: ix.length, meanRet: r4(W.mean(rr)), medianRet: r4(W.median(rr)), cohortMedian: r4(r.tail.medianAll), spy: r4(r.tail.spy), top1Share: r4(W.mean(ix.map(i => (r.cls[i].top1 ? 1 : 0)))), top5Share: r4(W.mean(ix.map(i => (r.cls[i].top5 ? 1 : 0)))),
      loserShare: r4(W.mean(ix.map(i => (r.cls[i].loser ? 1 : 0)))), cohortTop5Share: r4(r.tail.nTop5 / r.n), nonWinnerTop5: ix.filter(i => !r.cls[i].top5).length };
  }
  return res;
}
function caseRow(c, m, idx, pcts, rowsByH) {
  const fund = m.fund ? { docFrom: m.fund.docFrom, availableAt: m.fund.availableAt, referenceEnd: m.fund.referenceEnd,
    revenueTtm: m.fund.revenue, netIncomeTtm: m.fund.netIncome,
    secFilingIndex: m.fund.revenue ? 'https://www.sec.gov/Archives/edgar/data/' + Number(m.fund.cik) + '/' + m.fund.revenue.accn.replace(/-/g, '') + '/' : null } : null;
  return { date: c.date, regime: c.regime.trend, ratePhase: c.ratePhase,
    features: Object.fromEntries(Object.entries(m.f).map(([k, v]) => [k, { raw: r4(v), pct: pcts[k] ? r4(pcts[k][idx]) : null }])),
    forward: Object.fromEntries(['1Y', '3Y', '5Y'].map(h => [h, memberView(c, h, rowsByH[h], m) || 'IMMATURE'])), fundamentalsSource: fund, profilePeers: profilePeers(c, idx, pcts, rowsByH) };
}
function plausibility(p, kFrom, kTo, header) {
  let maxUp = 0, maxDown = 0, at = null;
  for (let j = Math.max(1, kFrom); j <= Math.min(kTo, p.closes.length - 1); j++) { const r = p.closes[j] / p.closes[j - 1]; if (r > maxUp) { maxUp = r; at = p.dates[j]; } maxDown = Math.max(maxDown, p.closes[j - 1] / p.closes[j]); }
  const splits = (p.doc.corporateActions?.splits || []).filter(s => s[0] >= p.dates[Math.max(0, kFrom)] && s[0] <= p.dates[Math.min(kTo, p.closes.length - 1)]);
  return { maxWeeklyUpRatio: r4(maxUp), maxWeeklyUpDate: at, maxWeeklyDownRatio: r4(maxDown), splitsInWindow: splits, caQuality: p.doc.corporateActionQuality ?? null, warnings: (p.doc.warnings || []).slice(0, 5), lifecycle: header.lifecycle[p.id] || null,
    entryCloseAdjusted: r4(p.closes[kFrom + 52 + 1] ?? null), flag: maxUp > 3 || maxDown > 3 ? 'EXTREME_WEEKLY_MOVE_CHECK_SOURCE' : 'NO_EXTREME_WEEKLY_MOVE' };
}

function main() {
  const priv = arg('--private'), outDir = arg('--out');
  if (!priv || !outDir) throw Error('USAGE: --private <dir> --out <dir>');
  const t0 = Date.now();
  const data = K.readJson(path.join(priv, 'members.json.gz'));
  const H = data.header, cohorts = data.cohorts;
  const metaByDate = new Map(cohorts.map(c => [c.date, c]));
  const rowsByH = {}, rowsMinus = {};
  for (const h of Object.keys(W.HORIZONS)) {
    rowsByH[h] = cohorts.map(c => cohortAnalysis(c, h, 'primary')).filter(Boolean);
    rowsMinus[h] = cohorts.map(c => cohortAnalysis(c, h, 'minus100')).filter(Boolean);
  }
  console.error('cohort analysis', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  const primary = summarise(rowsByH, cohorts, 'primary');
  const minus = summarise(rowsMinus, cohorts, 'minus100');
  // POST-HOC (disclosed, not registered): bootstrap p-value resolution. With 1,999 replicates the smallest p is 1/2000,
  // so Holm over 156 tests cannot go below 0.078. Same rows, same seed and blocks, 99,999 replicates.
  const resolution = { label: 'POST_HOC_RESOLUTION_SENSITIVITY_NOT_REGISTERED', replicates: 99999, reason: 'registered 1,999 replicates give p >= 1/2000; Holm x 156 >= 0.078, so the registered family cannot reject by construction', auc: [], effectVsAverage: [] };
  for (const [h, rows] of Object.entries(rowsByH)) for (const f of FEATURES) for (const d of DEFS) {
    const rs = rows.filter(r => r.features[f]); if (!rs.length) continue;
    const a = rs.filter(r => W.finite(r.features[f][d].auc)).map(r => ({ date: r.date, value: r.features[f][d].auc - 0.5 }));
    const ea = rs.filter(r => W.finite(r.features[f][d].minusAverage)).map(r => ({ date: r.date, value: r.features[f][d].minusAverage }));
    const ia = blockMean(a, a.map(r => r.date), h, 99999), ie = blockMean(ea, ea.map(r => r.date), h, 99999);
    resolution.auc.push({ key: [h, d, f].join('|'), estimate: ia.estimate === null ? null : r6(ia.estimate + 0.5), pValue: ia.pValue });
    resolution.effectVsAverage.push({ key: [h, d, f].join('|'), estimate: ie.estimate, pValue: ie.pValue });
  }
  for (const fam of ['auc', 'effectVsAverage']) { const res = K.holmFamily(resolution[fam]); resolution[fam + 'Holm'] = { ...res, rejectedKeys: resolution[fam].filter(c => c.holmReject).map(c => c.key) }; }
  console.error('resolution sensitivity', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // class changes between censoring bounds
  const changes = {};
  for (const h of Object.keys(W.HORIZONS)) {
    let n = 0, t1 = 0, t5 = 0, lo = 0, cens = 0;
    rowsByH[h].forEach((r, j) => { const q = rowsMinus[h][j]; r.cls.forEach((c, i) => { n++; if (c.top1 !== q.cls[i].top1) t1++; if (c.top5 !== q.cls[i].top5) t5++; if (c.loser !== q.cls[i].loser) lo++; }); cens += r.valid.filter(m => m.fwd[h].state === 'CENSORED').length; });
    changes[h] = { memberCohorts: n, censored: cens, top1Changes: t1, top5Changes: t5, loserChanges: lo };
  }
  const compactMinus = Object.fromEntries(Object.entries(minus.table).map(([h, t]) => [h, Object.fromEntries(Object.entries(t).map(([f, e]) => [f, { top5Auc: e.top5.auc.mean, top5Lift: e.top5.topQuintile.lift, top1Auc: e.top1.auc.mean, top1Lift: e.top1.topQuintile.lift, loserLiftTopQ: e.loser.topQuintile.lift }]))]));
  const splits = splitTables(rowsByH, metaByDate);
  const tails = tailSummary(rowsByH);
  const pooledProfiles = profilePooled(rowsByH);
  console.error('summaries', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // ---------------- survivorship gaps ----------------
  const pf = JSON.parse(fs.readFileSync(path.join(K.ROOT, 'docs/quant-recovery/v10/population/population-frame-1.0.0.json'), 'utf8'));
  const gapRows = cohorts.map(c => {
    const y = c.date.slice(0, 4), py = pf.perIsoYear[y] || {};
    const st = {}; for (const h of Object.keys(W.HORIZONS)) { st[h] = {}; for (const m of c.members) { const s = m.fwd[h].state + (m.fwd[h].terminalKind && m.fwd[h].state === 'CENSORED' ? ':' + m.fwd[h].terminalKind : ''); st[h][s] = (st[h][s] || 0) + 1; } }
    return { date: c.date, members: c.members.length, candidatesWithBar: c.counts.candidatesWithBar, excludedYoungerThan52w: c.counts.youngerThan52w, sec10KFilersIsoYear: py.sec10KFilers ?? null,
      coverageMembersVs10KFilers: py.sec10KFilers ? r4(c.members.length / py.sec10KFilers) : null, frameLaterDelistedInYear: py.laterDelisted ?? null, outcomeStates: st, fundamentals: H.fundCounts[c.date] || null };
  });
  const surv = { schemaVersion: 'v11-winners-survivorship-gaps-1.0.0', studyId: 'V11-WINNERS', protocolSha256: REG.PROTOCOL_SHA, period: 'FULL_DESCRIPTIVE',
    frame: { listings: H.frame, qualification: H.qualification, excluded: H.frameExcluded, endedListings: Object.keys(H.lifecycle).length,
      endedByKind: Object.values(H.lifecycle).reduce((a, l) => { const k = l.status + '|' + l.terminal; a[k] = (a[k] || 0) + 1; return a; }, {}) },
    censoringSensitivity: changes,
    interpretation: 'Coverage = cohort members / distinct SEC 10-K filers of the ISO year (includes OTC and non-listed registrants: order of magnitude, not a listed-company count). The frame is today\'s provider universe plus 121 ended series; companies that failed or were acquired before the universe was built are absent. Winners are therefore drawn from a survivor-heavy population: the loser tail (bankruptcies, delistings without consideration) is strongly under-represented, mainly before 2015, while extreme winners are fully represented. This inflates base rates of winning among all features and biases features associated with failure (high volatility, losses, small size) towards looking benign.',
    byCohort: gapRows, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };

  // POST-HOC descriptive (not registered): the case-study profile pooled over all cohorts with fundamentals.
function profilePooled(rowsByH) {
  const profiles = { QUALITY_GROWTH_MOMENTUM: ['mom12_1m', 'revenueGrowthTtmYoy', 'operatingMarginTtm'], QGM_AT_HIGH: ['mom12_1m', 'near52wHigh', 'revenueGrowthTtmYoy', 'operatingMarginTtm'],
    DISTRESSED_REBOUND: ['vol52w', 'drawdown52w', 'near52wHigh'] };
  const sideOf = { vol52w: 'bottom', drawdown52w: 'bottom', near52wHigh: 'bottom' };
  const out = { label: 'POST_HOC_DESCRIPTIVE_NOT_REGISTERED', definition: 'members in the top quintile (registered direction) of every listed feature; DISTRESSED_REBOUND uses the bottom quintile of vol52w, drawdown52w (i.e. highest volatility, deepest drawdown) and near52wHigh (farthest from the high)', profiles: {} };
  for (const [name, feats] of Object.entries(profiles)) {
    out.profiles[name] = { features: feats };
    for (const [h, rows] of Object.entries(rowsByH)) {
      let n = 0, sel = 0, t1 = 0, t5 = 0, lo = 0, cohorts = 0; const exMean = [], exMedian = [];
      for (const r of rows) {
        const pc = feats.map(f => W.percentiles(r.valid.map(m => (W.finite(m.f[f]) ? m.f[f] : null)), DIRECTION[f]));
        if (pc.some(a => a.filter(x => x !== null).length < 50)) continue;
        const ok = r.valid.map((_, i) => pc.every(a => a[i] !== null));
        const pick = r.valid.map((_, i) => ok[i] && feats.every((f, j) => (sideOf[f] === 'bottom' && name === 'DISTRESSED_REBOUND' ? pc[j][i] <= 0.2 : pc[j][i] > 0.8)));
        const all = r.rets.filter((_, i) => ok[i]), selR = r.rets.filter((_, i) => pick[i]);
        cohorts++; n += all.length; sel += selR.length;
        r.cls.forEach((c, i) => { if (pick[i]) { if (c.top1) t1++; if (c.top5) t5++; if (c.loser) lo++; } });
        if (selR.length) { exMean.push({ date: r.date, value: W.mean(selR) - W.mean(all) }); exMedian.push(W.median(selR) - W.median(all)); }
      }
      out.profiles[name][h] = { cohorts, membersWithAllFeatures: n, selected: sel, selectedShare: r4(sel / n), top1Share: r4(t1 / sel), top5Share: r4(t5 / sel), loserShare: r4(lo / sel),
        nonWinnerTop5Share: r4((sel - t5) / sel), meanMinusAll: blockMean(exMean, exMean.map(x => x.date), h), medianMinusAllAvg: r4(W.mean(exMedian)) };
    }
  }
  return out;
}

// ---------------- case studies ----------------
  // NVDA timeline
  const fr = K.buildFrame(H.loaderOptions || { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });
  const panel = new Map(K.buildPanel(fr).map(p => [p.id, p]));
  const pctCache = new Map(); const pctsOf = c => { if (!pctCache.has(c.date)) pctCache.set(c.date, featurePcts(c)); return pctCache.get(c.date); };
  const nvda = cohorts.filter(c => c.date >= '2014-12-01').map(c => { const idx = c.members.findIndex(m => m.id === 'ref_NVDA'); return idx < 0 ? null : caseRow(c, c.members[idx], idx, pctsOf(c), rowsByH); }).filter(Boolean);
  // systematic selection: per subperiod the two distinct listings with the highest 3Y forward return (excluding NVDA)
  const selected = [];
  for (const [a, b] of W.SUBPERIODS) {
    const cand = [];
    for (const r of rowsByH['3Y']) if (r.date >= a && r.date <= b) r.valid.forEach((m, i) => cand.push({ id: m.id, date: r.date, ret: r.rets[i], state: m.fwd['3Y'].state }));
    cand.sort((x, y) => y.ret - x.ret || (x.id < y.id ? -1 : 1));
    const seen = new Set(['ref_NVDA']), pick = [];
    for (const x of cand) { if (seen.has(x.id)) continue; seen.add(x.id); pick.push(x); if (pick.length === 2) break; }
    pick.forEach((x, rank) => selected.push({ subperiod: a.slice(0, 4) + '-' + b.slice(0, 4), rank: rank + 1, ...x }));
  }
  const cases = selected.map(s => {
    const ci = cohorts.findIndex(c => c.date === s.date), timeline = [];
    for (let j = Math.max(0, ci - 4); j <= Math.min(cohorts.length - 1, ci + 4); j++) {
      const c = cohorts[j], idx = c.members.findIndex(m => m.id === s.id); if (idx < 0) continue;
      timeline.push(caseRow(c, c.members[idx], idx, pctsOf(c), rowsByH));
    }
    const p = panel.get(s.id), m = cohorts[ci].members.find(x => x.id === s.id);
    return { ...s, ret: r4(s.ret), ticker: H.tickers[s.id], selectionRule: 'highest 3Y forward return among all members of cohorts in the subperiod, distinct listings, NVDA excluded', plausibility: p ? plausibility(p, m.k - 52, m.k + 1 + 156, H) : null, timeline };
  });
  const nvdaP = panel.get('ref_NVDA');
  const caseDoc = { schemaVersion: 'v11-winners-case-studies-1.0.0', studyId: 'V11-WINNERS', protocolSha256: REG.PROTOCOL_SHA, period: 'FULL_DESCRIPTIVE', evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY',
    note: 'Case studies describe what was observable at each quarterly cohort date (closes up to t, SEC facts filed before t). They are not strategies. Profile peers = members at the same date sharing the case\'s top-quintile memberships on ' + PROFILE.join(', ') + '.',
    returnBasis: 'PRICE_RETURN (split-adjusted weekly closes), SPY PRICE_RETURN same dates', percentileNote: 'pct: cohort mid-rank percentile in the registered direction (vol52w and drawdown52w: high pct = LOW volatility / shallow drawdown)',
    nvda: { securityId: 'ref_NVDA', ticker: 'NVDA', cik: '0001045810', plausibility: nvdaP ? { splits: nvdaP.doc.corporateActions?.splits || [], caQuality: nvdaP.doc.corporateActionQuality ?? null } : null, timeline: nvda },
    systematicWinners: cases, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };

  // ---------------- anatomy envelope ----------------
  const reg = JSON.parse(fs.readFileSync(path.join(K.ROOT, 'docs/quant-recovery/v11/winners/registration-1.0.0.json'), 'utf8'));
  const amd = JSON.parse(fs.readFileSync(path.join(K.ROOT, 'docs/quant-recovery/v11/winners/registration-amendment-1.0.1.json'), 'utf8'));
  const anatomy = { schemaVersion: 'v11-winners-anatomy-1.0.0', studyId: 'V11-WINNERS', ruleVersion: '1.0.1', registrationHash: reg.registrationHash, amendmentHash: amd.amendmentHash,
    protocol: { path: 'docs/quant-recovery/v11/protocol/time-split-1.0.0.json', sha256: REG.PROTOCOL_SHA }, period: 'FULL_DESCRIPTIVE', firewall: 'R4: the DISCOVERY strand must not read this file.',
    evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY',
    dataSource: { series: K.SERIES_DIR, loaderOptions: H.loaderOptions, benchmark: H.benchmark, us10ySha256: H.us10ySha256, pitDocuments: 'V10 factor strand private PIT documents (pit_docs.py, companyfacts, filed < t)', codeHashes: H.codeHashes, buildGitHead: H.gitHead },
    population: { frame: H.frame, rule: reg.registration.population.cohortMembership, survivorshipGap: 'see survivorship-gaps-1.0.0.json; coverage vs SEC 10-K filers ~14-17 % (2001-03), ~22 % (2010), ~48 % (2020)' },
    cohorts: { dates: cohorts.length, first: cohorts[0].date, last: cohorts.at(-1).date, maturedPerHorizon: Object.fromEntries(Object.entries(rowsByH).map(([h, r]) => [h, { cohorts: r.length, first: r[0].date, last: r.at(-1).date, memberObservations: r.reduce((s, x) => s + x.n, 0) }])) },
    returnBasis: { stocks: 'PRICE_RETURN, entry close week t+1, exit close week t+1+h', benchmark: 'SPY PRICE_RETURN same dates (context only; classes are cross-sectional)' },
    costs: { feeBps: 10, slippageBps: 5, applied: false, reason: 'ranking-based classes are cost-invariant' }, weighting: 'equal weight per member within cohort; cohorts equally weighted in means', investmentAssumption: 'none (no portfolio); E4 compares equal-weight feature top quintile with the equal-weight member population',
    excessKind: 'Observed descriptive differences; block-bootstrap intervals over cohort dates and Holm families are given, but nothing here is a tradable excess claim.',
    uncertainty: { method: 'research-validation.inferTemporalBlockMean over cohort dates', blockQuarters: W.BLOCK_QUARTERS, replicates: K.INFERENCE.replicates, seed: K.INFERENCE.seed },
    multipleTesting: { primary: { auc: primary.holm.auc, effectVsAverage: primary.holm.effectVsAverage }, resolutionSensitivity: resolution },
    tailStructure: tails,
    features: primary.table,
    censoringSensitivityMinus100: { classChanges: changes, compact: compactMinus, holmAucRejections: minus.holm.auc.rejections },
    splits, pooledProfiles,
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    scope: 'Descriptive anatomy of ex-post winners in a survivor-heavy frame (price return). Separation statistics describe what distinguished winners on average; they are not rules, carry no time-split validation and must not feed the DISCOVERY strand.' };
  anatomy.reproHash = K.C.hash({ registrationHash: reg.registrationHash, amendmentHash: amd.amendmentHash, codeHashes: H.codeHashes, features: primary.table });
  fs.mkdirSync(outDir, { recursive: true });
  K.writeJson(path.join(outDir, 'anatomy-results-1.0.0.json'), anatomy);
  K.writeJson(path.join(outDir, 'case-studies-1.0.0.json'), caseDoc);
  K.writeJson(path.join(outDir, 'survivorship-gaps-1.0.0.json'), surv);
  // pooled tables for the Python check (private)
  K.writeJson(path.join(priv, 'js-check.json.gz'), { classes: Object.fromEntries(Object.entries(rowsByH).map(([h, rs]) => [h, rs.map(r => [r.date, r.valid.map((m, i) => [m.id, r6(r.rets[i]), r.cls[i].top1 ? 1 : 0, r.cls[i].top5 ? 1 : 0, r.cls[i].loser ? 1 : 0, r.cls[i].average ? 1 : 0])])])),
    lift: Object.fromEntries(Object.entries(primary.table).map(([h, t]) => [h, Object.fromEntries(Object.entries(t).map(([f, e]) => [f, { top1: e.top1.topQuintile, top5: e.top5.topQuintile, loser: e.loser.topQuintile, top5Bottom: e.top5.bottomQuintile, top5AucMean: e.top5.auc.mean }]))])),
    features: Object.fromEntries(cohorts.map(c => [c.date, c.members.map(m => [m.id, m.f, m.fund ? m.fund.cik : null])])) }, true);
  console.error('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
if (require.main === module) main();
module.exports = { cohortAnalysis, FEATURES, DIRECTION };
