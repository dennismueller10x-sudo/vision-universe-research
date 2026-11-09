#!/usr/bin/env node
'use strict';
// V12 REQUAL P5c - V10 factor rank IC and quintiles on the PIT S&P 500 with corrected PIT market cap (registration 1.0.1, P5.c_factor).
// Steps S1 FRAME_BEFORE -> S2 FRAME_AFTER -> S3 SP_SERIES -> S4 SP_HOLDINGS (ZERO/LOWER), diagnostic D1 (full-frame scores on the S&P subset).
// Usage: node p5c-factor.cjs --panels <v12-private>/mcap [--out docs/quant-recovery/v12/requal/p5c-factor-1.1.0.json]
const path = require('node:path');
const L = require('./lib.cjs');
const X = require(L.ROOT + '/scripts/quant/v10/factor/factors.cjs');
const { frameContext } = require('./p5a-population.cjs');
const { readPanelDates, rankDateFor } = require('./panel-access.cjs');
const { readRegistration } = require('./plan.cjs');

const BUCKETS = 5, MIN_OBS = 100;
function ranks(v) { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = L.mean(ra), mb = L.mean(rb); let c = 0, va = 0, vb = 0; for (let i = 0; i < a.length; i++) { c += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2; } return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : null; }
/** rows: [{id, score, y}] -> {ic, q:[Q1..Q5 means], n} ; buckets by ascending score, ties by id. */
function periodStats(rows) {
  const ok = rows.filter(r => L.finite(r.score) && L.finite(r.y)); if (ok.length < MIN_OBS) return { n: ok.length, ic: null, q: null };
  const s = ok.slice().sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1)), q = Array.from({ length: BUCKETS }, () => []);
  s.forEach((r, i) => q[Math.floor(i * BUCKETS / s.length)].push(r.y));
  return { n: ok.length, ic: spearman(ok.map(r => r.score), ok.map(r => r.y)), q: q.map(L.mean), all: L.mean(ok.map(r => r.y)) };
}

async function main() {
  const o = L.args(process.argv.slice(2), { panels: null, out: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p5c-factor-1.1.0.json') });
  if (!o.panels) throw Error('PANELS_DIR_REQUIRED');
  const t0 = Date.now(), reg = readRegistration();
  const ctx = frameContext(), pop = L.makePopulation(), spy = L.makeSpy();
  const before0 = await readPanelDates(path.join(o.panels, 'before/panel.jsonl.gz'), []);
  const rankDates = before0.header.rankDates;
  const periods = pop.periods.map(p => ({ ...p, rank: rankDateFor(rankDates, p.t0, L.SIGNAL_MAX_STALE_DAYS) })).filter(p => p.rank);
  const want = periods.map(p => p.rank);
  const before = await readPanelDates(path.join(o.panels, 'before/panel.jsonl.gz'), want), after = await readPanelDates(path.join(o.panels, 'after/panel.jsonl.gz'), want);
  const steps = ['S1_FRAME_BEFORE', 'S2_FRAME_AFTER', 'S3_SP_SERIES', 'D1_SP_SERIES_FULLFRAME_SCORES', 'S4_SP_HOLDINGS_ZERO', 'S4_SP_HOLDINGS_LOWER', 'D2_SP_HOLDINGS_FULLFRAME_ZERO', 'D2_SP_HOLDINGS_FULLFRAME_LOWER'];
  const per = Object.fromEntries(steps.map(s => [s, Object.fromEntries(X.SIGNALS.map(g => [g, []]))])), counts = [];
  for (const p of periods) {
    const pb = before.byDate.get(p.rank), pa = after.byDate.get(p.rank);
    // frame outcomes (series), frame listings with a panel row
    const frameOut = new Map();
    for (const l of ctx.listings) { if (!L.hasBarAt(l, p.t0)) continue; const sr = L.seriesReturn(l, p.t0, p.t1); if (sr) frameOut.set(l.id, sr); }
    const w0 = ctx.calendar[L.lastIdx(ctx.calendar, p.t0, 7)], w1 = ctx.calendar[L.lastIdx(ctx.calendar, p.t1, 7)];
    const spyW = spy.ret(w0, w1), spyX = spy.ret(p.t0, p.t1);
    // S&P members with series and an AFTER panel row (same set for S3, D1, S4)
    const mem = pop.members(p.t0).members, sp = [];
    const seen = new Set();
    for (const m of mem) { if (!m.securityId || seen.has(m.securityId)) continue; const sr = frameOut.get(m.securityId), row = pa.get(m.securityId); if (sr && row) { sp.push({ m, sr, row }); seen.add(m.securityId); } }
    const rescored = X.scoreCrossSection(sp.map(x => ({ id: x.m.securityId, template: x.row.template, raws: x.row.raws })));
    counts.push({ t0: p.t0, t1: p.t1, rank: p.rank, qualification: p.qualification, frameWithOutcome: frameOut.size, frameWithBeforeRow: [...frameOut.keys()].filter(id => pb.has(id)).length, members: mem.length, spScored: sp.length,
      spBounded: sp.filter(x => x.m.group === 'bounded').length });
    for (const g of X.SIGNALS) {
      const add = (step, rows, bench) => { const st = periodStats(rows); per[step][g].push({ t0: p.t0, t1: p.t1, qualification: p.qualification, n: st.n, ic: st.ic, q: st.q, all: st.all, spy: bench }); };
      add('S1_FRAME_BEFORE', [...frameOut].filter(([id]) => pb.has(id)).map(([id, sr]) => ({ id, score: pb.get(id).scores[g], y: sr.r })), spyW);
      add('S2_FRAME_AFTER', [...frameOut].filter(([id]) => pa.has(id)).map(([id, sr]) => ({ id, score: pa.get(id).scores[g], y: sr.r })), spyW);
      add('S3_SP_SERIES', sp.map((x, i) => ({ id: x.m.securityId, score: rescored[i][g], y: x.sr.r })), spyW);
      add('D1_SP_SERIES_FULLFRAME_SCORES', sp.map(x => ({ id: x.m.securityId, score: x.row.scores[g], y: x.sr.r })), spyW);
      add('S4_SP_HOLDINGS_ZERO', sp.map((x, i) => ({ id: x.m.securityId, score: rescored[i][g], y: x.m.ret.ZERO })), spyX);
      add('S4_SP_HOLDINGS_LOWER', sp.map((x, i) => ({ id: x.m.securityId, score: rescored[i][g], y: x.m.ret.LOWER })), spyX);
      // registration 1.0.2 (post hoc, after S3/S4 showed profitability/composite unavailable): full-frame AFTER scores, holdings outcome
      add('D2_SP_HOLDINGS_FULLFRAME_ZERO', sp.map(x => ({ id: x.m.securityId, score: x.row.scores[g], y: x.m.ret.ZERO })), spyX);
      add('D2_SP_HOLDINGS_FULLFRAME_LOWER', sp.map(x => ({ id: x.m.securityId, score: x.row.scores[g], y: x.m.ret.LOWER })), spyX);
    }
  }
  const summarize = (rows, filter = () => true) => {
    const sel = rows.filter(r => filter(r) && r.ic !== null); if (!sel.length) return null;
    const ic = sel.map(r => r.ic), sp = sel.map(r => r.q[4] - r.q[0]), ew = sel.map(r => r.q[4] - r.all), sy = sel.map(r => r.q[4] - r.spy);
    const nwIc = L.neweyWest(ic, 2), nwSp = L.neweyWest(sp, 2);
    return { periods: sel.length, meanIC: L.r6(L.mean(ic)), icPositiveShare: L.r6(ic.filter(x => x > 0).length / ic.length), icNwSe: L.r6(nwIc.se), icNwP: L.r6(nwIc.p),
      meanQ: [0, 1, 2, 3, 4].map(k => L.r6(L.mean(sel.map(r => r.q[k])))), q5MinusQ1: L.r6(L.mean(sp)), spreadNwP: L.r6(nwSp.p), q5MinusEw: L.r6(L.mean(ew)), q5MinusSpy: L.r6(L.mean(sy)), meanN: L.r6(L.mean(sel.map(r => r.n))) };
  };
  const results = {};
  for (const s of steps) results[s] = Object.fromEntries(X.SIGNALS.map(g => [g, { full: summarize(per[s][g]), qualifiedOnly: summarize(per[s][g], r => r.qualification === 'QUALIFIED'),
    semiannual: summarize(per[s][g], r => r.t1 <= '2019-09-30'), quarterly: summarize(per[s][g], r => r.t0 >= '2019-09-30') }]));
  for (const step of ['S4_SP_HOLDINGS_ZERO', 'D2_SP_HOLDINGS_FULLFRAME_ZERO']) for (const ep of ['icNwP', 'spreadNwP']) { const ps = X.SIGNALS.map(g => results[step][g].full ? results[step][g].full[ep] : null); const adj = L.holm(ps); X.SIGNALS.forEach((g, i) => { if (results[step][g].full) results[step][g].full[ep.replace('NwP', 'HolmP')] = L.r6(adj[i]); }); }
  const v10 = require(L.ROOT + '/docs/quant-recovery/v10/factor/factor-study-1.0.0.json').table;
  const v10Ref = Object.fromEntries(X.SIGNALS.map(g => [g, Object.fromEntries([13, 26].map(h => { const r = v10.find(x => x.signal === g && x.horizonBars === h); return [h + 'W', r ? { meanIC: L.r6(r.endpoints.E1_IC.mean), icNwP: L.r6(r.endpoints.E1_IC.nw.p), q5MinusQ1: L.r6(r.endpoints.E2_SPREAD.mean), q5MinusSpy: L.r6(r.endpoints.E3_EXCESS_SPY.mean), dates: r.datesUsed } : null]; }))]));
  const out = { studyId: 'V12-REQUAL-P5C', registrationSha256: reg.sha256, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    inputs: { panelBeforeSha256: before.sha256, panelAfterSha256: after.sha256, panelMasterHash: after.header.masterHash, indexDataSha256: pop.dataSha256, frameManifestHash: ctx.manifestHash },
    periodGrid: { periods: periods.length, from: periods[0].t0, to: periods.at(-1).t1, rankDateMaxStaleDays: L.SIGNAL_MAX_STALE_DAYS },
    returnBasis: 'PRICE_RETURN; outcome S1-S3/D1 weekly series t0->t1 (bar dates), S4 holdings return incl. exits; Q5-SPY against SPY at the same dates', availability: 'panel cutoff = day before rank date (filed < cutoff); rank date <= t0',
    stepDefinitions: reg.registration.P5.c_factor.steps.concat(['D2 (registration 1.0.2, post hoc): S&P members with series, AFTER full-frame scores, holdings outcome incl. exits (ZERO / LOWER)']), componentMinimum: 'factors.cjs UNIVERSE_MIN = ' + X.UNIVERSE_MIN + ' valid values per component (product contract) - inside the S&P subset profitability/composite are unavailable (S3/S4)', v10Published: v10Ref, results, perPeriod: per, counts, runtimeSeconds: Math.round((Date.now() - t0) / 1000) };
  const h = L.writeJson(o.out, out);
  console.log(JSON.stringify({ out: path.relative(L.ROOT, o.out), sha256: h, seconds: out.runtimeSeconds }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { spearman, ranks, periodStats };
