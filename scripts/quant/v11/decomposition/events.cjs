#!/usr/bin/env node
'use strict';
// V11 DECOMPOSITION - event-level analyses A1 (additive decomposition), A2 (entry/exit/holding, event-time curve),
// A7 (subperiods, regimes, population change) and the per-cell inputs of A6 (power).
// Reuses the V10 frame/panel/benchmark/inference building blocks (scripts/quant/v10/studies/common.cjs) unchanged.
// Usage: node events.cjs --out <private dir> [--factor-panel <panel.jsonl.gz>]
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), readline = require('node:readline');
const K = require('../../v10/studies/common.cjs');
const { readRegistration } = require('./register.cjs');

const V10_LIFECYCLE_MANIFEST = '2c27039fd782cccced62ac28cebfb808eea07670ba2c79e58e373824bcc0b679';
const LOOKBACK = K.SIGNAL_FEATURE_LOOKBACK;
const mean = K.mean;

function args(argv) {
  const o = { out: null, factorPanel: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--factor-panel') o.factorPanel = argv[++i];
    else throw Error('UNKNOWN_ARGUMENT:' + argv[i]);
  }
  if (!o.out) throw Error('OUT_REQUIRED');
  return o;
}

// ---------- context ----------
function context(R) {
  const fr = K.buildFrame(R.population.loaderOptions), manifestHash = K.V.hash(K.sourceManifest(fr));
  if (manifestHash !== V10_LIFECYCLE_MANIFEST) throw Error('FRAME_DIFFERS_FROM_V10_LIFECYCLE_RUN:' + manifestHash);
  const panel = K.buildPanel(fr), benchmark = K.loadBenchmark();
  const calIndex = new Map(fr.calendar.map((d, i) => [d, i]));
  const studyCalendar = fr.calendar.filter(d => d >= R.signalWindow[0] && d <= R.signalWindow[1]);
  // eligibility bitmap per listing (V10 signal eligibility at bar k)
  for (const p of panel) { p.elig = new Uint8Array(p.closes.length); for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) if (K.eligibleAt(p, k, LOOKBACK)) p.elig[k] = 1; }
  return { fr, panel, benchmark, calIndex, studyCalendar, manifestHash, regimes: K.regimeLabels(benchmark, fr.calendar), T: fr.calendar.length };
}
// Window [k+a, k+a+L] on a contiguous calendar path that also covers k (a may be negative or zero).
function winRet(p, k, a, L) {
  const s = k + a, e = s + L, lo = Math.min(k, s);
  if (lo < 0 || e >= p.closes.length) return null;
  if (p.cal[e] - p.cal[lo] !== e - lo) return null;
  return p.closes[e] / p.closes[s] - 1;
}
function spyRet(ctx, p, k, a, L) { const s = k + a, e = s + L; return ctx.benchmark.ret(p.dates[s], p.dates[e]); }
// Population sums by calendar index of the signal bar k: all eligible observations with a complete window.
function popSums(ctx, a, L, flagsByRule = null) {
  const T = ctx.T, sum = new Float64Array(T), cnt = new Float64Array(T), det = {};
  if (flagsByRule) for (const id of Object.keys(flagsByRule)) det[id] = { sum: new Float64Array(T), cnt: new Float64Array(T) };
  ctx.panel.forEach((p, i) => {
    for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
      if (!p.elig[k]) continue;
      const r = winRet(p, k, a, L); if (r === null) continue;
      const c = p.cal[k]; sum[c] += r; cnt[c]++;
      if (flagsByRule) for (const id in det) if (flagsByRule[id][i][k]) { det[id].sum[c] += r; det[id].cnt[c]++; }
    }
  });
  return { sum, cnt, det, at: c => cnt[c] > 0 ? sum[c] / cnt[c] : null };
}
// Weekly rebalanced equal-weighted frame index (chained mean weekly return), for variable-length exits.
function ewIndex(ctx) {
  const T = ctx.T, sum = new Float64Array(T), cnt = new Float64Array(T);
  for (const p of ctx.panel) for (let k = 1; k < p.closes.length; k++) {
    if (p.cal[k] !== p.cal[k - 1] + 1 || p.dates[k - 1] < p.listingStart) continue;
    sum[p.cal[k]] += p.closes[k] / p.closes[k - 1] - 1; cnt[p.cal[k]]++;
  }
  const I = new Float64Array(T); I[0] = 1;
  for (let c = 1; c < T; c++) I[c] = I[c - 1] * (1 + (cnt[c] > 0 ? sum[c] / cnt[c] : 0));
  return { I, ret: (c0, c1) => I[c1] / I[c0] - 1, weeksWithoutObservations: [...cnt].filter(x => x === 0).length };
}

function events(ctx, ruleId, inWindow) {
  const rule = K.Signal.RULE_BY_ID[ruleId], out = [];
  ctx.panel.forEach((p, i) => {
    for (const k of K.Signal.detectEvents(Array.from(p.closes), rule)) if (inWindow(p.dates[k])) out.push({ i, p, k, c: p.cal[k], date: p.dates[k] });
  });
  return out;
}
function flagsFor(ctx, ruleIds) {
  const out = {};
  for (const id of ruleIds) {
    const r = K.Signal.RULE_BY_ID[id];
    out[id] = ctx.panel.map(p => { const c = Array.from(p.closes), f = new Uint8Array(c.length); for (let k = Math.max(1, K.Signal.WARMUP_WEEKS); k < c.length; k++) if (r.detect(c, k, r.params)) f[k] = 1; return f; });
  }
  return out;
}
const B = (ctx, rows, L) => { const r = K.blockInference(ctx.studyCalendar, rows, L >= 52 ? 104 : 52); return { n: r.n, estimate: r.estimate, ci: r.ci, pValue: r.pValue, blockLength: r.blockLength, state: r.state }; };
const rowsOf = (list, f) => { const out = []; for (const e of list) { const v = f(e); if (v !== null && Number.isFinite(v)) out.push({ id: e.p.id + ':' + e.date, date: e.date, value: v, issuer: e.p.id }); } return out; };
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// ---------- market cap (V10 factor panel, PIT, 2010+) ----------
async function loadMarketCaps(file, calendar) {
  if (!file || !fs.existsSync(file)) return null;
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const byDate = []; let header = null;
  for await (const line of rl) {
    if (!line) continue; const d = JSON.parse(line);
    if (!header) { header = d; continue; }
    if (!Array.isArray(d.rows) || !d.date) continue;
    const m = new Map(); for (const r of d.rows) if (Number.isFinite(r[4]) && r[4] > 0) m.set(r[0], r[4]);
    byDate.push({ date: d.date, caps: m, rows: d.rows.length });
  }
  byDate.sort((a, b) => a.date < b.date ? -1 : 1);
  // calendar index -> latest panel date <= calendar date
  const atCal = new Array(calendar.length).fill(null); let j = -1;
  for (let c = 0; c < calendar.length; c++) { while (j + 1 < byDate.length && byDate[j + 1].date <= calendar[c]) j++; atCal[c] = j >= 0 ? byDate[j] : null; }
  return { schemaVersion: header.schemaVersion, loaderOptions: header.loaderOptions, dates: byDate.length, first: byDate[0].date, last: byDate.at(-1).date, atCal };
}
// DEVIATION 1 (disclosed; added after the first run showed cap weights dominated by XBRL scale errors, e.g. ref_CB
// 1.8e16 USD on 2010-06-25): outcome-free plausibility screen of the V10 panel market caps. A (listing, rank date) cap is
// IMPLAUSIBLE if cap > 5e12 USD, or its implied share count (cap / split-adjusted close at the rank date) deviates by more
// than a factor 5 from the median implied share count of the same listing over all its panel dates.
function screenCaps(mc, ctx) {
  if (!mc) return null;
  const byId = new Map(ctx.panel.map(p => [p.id, p])), idx = new Map(ctx.panel.map(p => [p.id, new Map(p.dates.map((d, k) => [d, k]))]));
  const implied = new Map(), seen = new Set(), stats = { checked: 0, absolute: 0, relative: 0, noClose: 0 };
  const snaps = [...new Set(mc.atCal.filter(Boolean))];
  for (const s of snaps) for (const [id, cap] of s.caps) { const p = byId.get(id), k = p ? idx.get(id).get(s.date) : undefined; if (k === undefined) continue; if (!implied.has(id)) implied.set(id, []); implied.get(id).push(cap / p.closes[k]); }
  const med = new Map([...implied].map(([id, a]) => [id, K.Signal.median(a)]));
  const clean = new Map();
  for (const s of snaps) {
    const m = new Map();
    for (const [id, cap] of s.caps) {
      stats.checked++; const p = byId.get(id), k = p ? idx.get(id).get(s.date) : undefined;
      if (cap > 5e12) { stats.absolute++; continue; }
      if (k === undefined) { stats.noClose++; continue; }
      const r = cap / p.closes[k] / med.get(id); if (r > 5 || r < 0.2) { stats.relative++; continue; }
      m.set(id, cap);
    }
    clean.set(s, { date: s.date, caps: m });
  }
  return { ...mc, atCal: mc.atCal.map(s => s ? clean.get(s) : null), screen: stats };
}
// Percentile rank of market cap within each panel date (0..1).
function capPercentiles(mc) {
  const cache = new Map();
  return snap => { if (!cache.has(snap)) { const v = [...snap.caps].sort((a, b) => a[1] - b[1]); const m = new Map(); v.forEach(([id], r) => m.set(id, v.length > 1 ? r / (v.length - 1) : 0.5)); cache.set(snap, m); } return cache.get(snap); };
}

// ---------- A1 ----------
function decompositionCell(ctx, ev, ruleId, h, pop, base, v10Cells) {
  const states = { detected: ev.length, ineligible: 0, censoredOrImmature: 0, observed: 0, observedWithoutSpy: 0 };
  const obs = [];
  for (const e of ev) {
    if (!e.p.elig[e.k]) { states.ineligible++; continue; }
    const g = winRet(e.p, e.k, 1, h); if (g === null) { states.censoredOrImmature++; continue; }
    states.observed++;
    const S = spyRet(ctx, e.p, e.k, 1, h); if (S === null) { states.observedWithoutSpy++; continue; }
    const P = pop.at(e.c), dn = pop.det[ruleId], nc = pop.cnt[e.c] - dn.cnt[e.c];
    const Pc = nc > 0 ? (pop.sum[e.c] - dn.sum[e.c]) / nc : null;
    const net = K.netOf(g, base.feeBps, base.slippageBps);
    obs.push({ ...e, g, S, P, Pc, net, cost: g - net });
  }
  const m = f => mean(obs.map(f));
  const terms = { rawNet: m(o => o.net), spy: m(o => o.S), populationMinusSpy: m(o => o.P - o.S), signalMinusPopulation: m(o => o.g - o.P), cost: m(o => o.cost) };
  terms.spyExcessNet = m(o => o.net - o.S);
  const identityResidual = terms.rawNet - (terms.spy + terms.populationMinusSpy + terms.signalMinusPopulation - terms.cost);
  const withC = obs.filter(o => o.Pc !== null);
  const v10Recon = { baseRateExcessV10Definition: mean(withC.map(o => o.net - K.netOf(o.Pc, base.feeBps, base.slippageBps))), n: withC.length, controlMinusAll: mean(withC.map(o => o.Pc - o.P)) };
  const inf = {
    spyExcessNet: B(ctx, rowsOf(obs, o => o.net - o.S), h),
    populationMinusSpy: B(ctx, rowsOf(obs, o => o.P - o.S), h),
    signalMinusPopulation: B(ctx, rowsOf(obs, o => o.g - o.P), h)
  };
  const v10 = v10Cells.find(c => c.rule === ruleId && c.horizonWeeks === h && c.endpoint === 'SPY_EXCESS');
  const surv = v10?.survivorship?.state === 'EVALUATED' ? { observedOnly: v10.survivorship.observedOnly.mean, boundMinus100: v10.survivorship.boundMinus100.mean, boundLastClose: v10.survivorship.boundLastClose.mean, withoutEndedListings: v10.survivorship.withoutEndedListings.mean, censoredUnresolved: v10.survivorship.censoredBeyondSeriesEnd.unresolved, terminalConsideration: v10.survivorship.censoredBeyondSeriesEnd.terminalConsideration } : null;
  return { rule: ruleId, horizonWeeks: h, n: obs.length, states, terms, identityResidual, inference: inf, v10Reconciliation: { ...v10Recon, v10SpyExcess: v10?.estimate ?? null, v10SpyExcessN: v10?.n ?? null },
    censoringTerm: surv ? { ...surv, minus100Shift: surv.boundMinus100 - surv.observedOnly, lastCloseShift: surv.boundLastClose - surv.observedOnly, source: 'V10 signal-backtest-evidence.json cells[SPY_EXCESS].survivorship (lifecycle run)' } : null,
    sampleSd: { spyExcessNet: obs.length > 1 ? sd(obs.map(o => o.net - o.S)) : null },
    _obs: obs };
}
function capSplit(ctx, obs, mc, h) {
  if (!mc) return { state: 'FACTOR_PANEL_UNAVAILABLE' };
  // per calendar week: EW(all), EW(subset with cap), CW(subset)
  const T = ctx.T, s = { all: new Float64Array(T), na: new Float64Array(T), sub: new Float64Array(T), ns: new Float64Array(T), cw: new Float64Array(T), wc: new Float64Array(T) };
  for (const p of ctx.panel) for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
    if (!p.elig[k] || p.dates[k] < '2010-01-01') continue;
    const r = winRet(p, k, 1, h); if (r === null) continue;
    const c = p.cal[k]; s.all[c] += r; s.na[c]++;
    const snap = mc.atCal[c], cap = snap ? snap.caps.get(p.id) : undefined;
    if (cap) { s.sub[c] += r; s.ns[c]++; s.cw[c] += cap * r; s.wc[c] += cap; }
  }
  const rows = obs.filter(o => o.date >= '2010-01-01' && s.ns[o.c] > 0);
  const t = { n: rows.length, eventsFrom2010: obs.filter(o => o.date >= '2010-01-01').length };
  const m = f => mean(rows.map(f));
  t.populationMinusSpy = m(o => s.all[o.c] / s.na[o.c] - o.S);
  t.coverage = m(o => s.all[o.c] / s.na[o.c] - s.sub[o.c] / s.ns[o.c]);
  t.equalWeightSize = m(o => s.sub[o.c] / s.ns[o.c] - s.cw[o.c] / s.wc[o.c]);
  t.capWeightedMinusSpy = m(o => s.cw[o.c] / s.wc[o.c] - o.S);
  t.residual = t.populationMinusSpy - t.coverage - t.equalWeightSize - t.capWeightedMinusSpy;
  t.signalMinusCapWeighted = m(o => o.g - s.cw[o.c] / s.wc[o.c]);
  // calendar-week (not event-weighted) structural gaps over all weeks 2010+
  const wk = []; for (let c = 0; c < T; c++) if (s.ns[c] > 0 && ctx.fr.calendar[c] <= '2025-12-31') { const d = ctx.fr.calendar[c], e = ctx.fr.calendar[c + 1 + h]; const S = e ? ctx.benchmark.ret(ctx.fr.calendar[c + 1], e) : null; if (S !== null) wk.push({ ew: s.all[c] / s.na[c], ewSub: s.sub[c] / s.ns[c], cw: s.cw[c] / s.wc[c], S, cov: s.ns[c] / s.na[c], d }); }
  t.calendarWeekMeans = { weeks: wk.length, ewMinusSpy: mean(wk.map(w => w.ew - w.S)), ewSubMinusCw: mean(wk.map(w => w.ewSub - w.cw)), cwMinusSpy: mean(wk.map(w => w.cw - w.S)), meanCoverageShare: mean(wk.map(w => w.cov)) };
  t.coverageByYear = Object.fromEntries([...K.splitBy(wk, w => w.d.slice(0, 4))].map(([y, a]) => [y, Math.round(mean(a.map(w => w.cov)) * 1000) / 1000]));
  return t;
}

// ---------- A2 ----------
function entryDelayCells(ctx, evByRule, delays, h, base) {
  const out = [];
  for (const d of delays) {
    const pop = popSums(ctx, d, h);
    for (const [rule, ev] of Object.entries(evByRule)) {
      const obs = [];
      for (const e of ev) { if (!e.p.elig[e.k]) continue; const g = winRet(e.p, e.k, d, h); if (g === null) continue; const S = spyRet(ctx, e.p, e.k, d, h); if (S === null) continue; obs.push({ ...e, g, S, P: pop.at(e.c), net: K.netOf(g, base.feeBps, base.slippageBps) }); }
      out.push({ rule, delayWeeks: d, horizonWeeks: h, n: obs.length, rawNet: mean(obs.map(o => o.net)), spyExcessNet: B(ctx, rowsOf(obs, o => o.net - o.S), h), populationExcessGross: B(ctx, rowsOf(obs, o => o.g - o.P), h), populationMinusSpy: mean(obs.map(o => o.P - o.S)) });
    }
  }
  return out;
}
function exitVariants(ctx, evByRule, base, idx) {
  const out = [], opp = { MOMENTUM_IMPROVED: 'MOMENTUM_DETERIORATED', MOMENTUM_DETERIORATED: 'MOMENTUM_IMPROVED', TREND_UP: 'TREND_DOWN', TREND_DOWN: 'TREND_UP', NEW_52W_HIGH: 'TREND_DOWN' };
  const variants = [{ id: 'FIXED_52_EW_INDEX', kind: 'fixed', h: 52 }, { id: 'FIXED_13_EW_INDEX', kind: 'fixed', h: 13 }, { id: 'TRAIL_15', kind: 'trail', stop: 0.15 }, { id: 'TRAIL_25', kind: 'trail', stop: 0.25 }, { id: 'OPPOSITE_SIGNAL_MAX52', kind: 'opposite' }];
  for (const [rule, ev] of Object.entries(evByRule)) {
    const oppRule = K.Signal.RULE_BY_ID[opp[rule]];
    for (const v of variants) {
      const obs = []; const exitKinds = {};
      for (const e of ev) {
        const p = e.p, c = p.closes; if (!p.elig[e.k]) continue;
        const en = e.k + 1; let x = null, kind = 'TIME';
        const ok = j => j < c.length && p.cal[j] - p.cal[e.k] === j - e.k;
        if (v.kind === 'fixed') { x = en + v.h; if (!ok(x)) x = null; }
        else if (v.kind === 'trail') {
          let peak = c[en], hit = false;
          for (let j = en + 1; j <= en + 52; j++) { if (!ok(j)) { x = null; hit = true; kind = 'CENSORED'; break; } if (c[j] <= peak * (1 - v.stop) && j < en + 52) { x = j + 1; kind = 'STOP'; hit = true; if (!ok(x)) x = null; break; } if (c[j] > peak) peak = c[j]; }
          if (!hit) x = en + 52;
        } else {
          const arr = Array.from(c); let hit = false;
          for (let j = en + 1; j <= en + 52 && j + 1 < c.length; j++) { if (!ok(j)) { hit = true; kind = 'CENSORED'; x = null; break; } if (oppRule.detect(arr, j, oppRule.params)) { x = j + 1; kind = 'OPPOSITE'; hit = true; if (!ok(x)) x = null; break; } }
          if (!hit) { x = en + 52; if (!ok(x)) x = null; }
        }
        if (x === null || !ok(x)) { exitKinds.CENSORED = (exitKinds.CENSORED || 0) + 1; continue; }
        exitKinds[kind] = (exitKinds[kind] || 0) + 1;
        const g = c[x] / c[en] - 1, S = ctx.benchmark.ret(p.dates[en], p.dates[x]); if (S === null) continue;
        const P = idx.ret(p.cal[en], p.cal[x]), net = K.netOf(g, base.feeBps, base.slippageBps), w = x - en;
        obs.push({ ...e, g, S, P, net, w });
      }
      const W = mean(obs.map(o => o.w));
      const spyEx = B(ctx, rowsOf(obs, o => o.net - o.S), Math.round(W)), popEx = B(ctx, rowsOf(obs, o => o.g - o.P), Math.round(W));
      out.push({ rule, variant: v.id, oppositeRule: v.kind === 'opposite' ? opp[rule] : null, n: obs.length, exitKinds, meanHoldingWeeks: W, medianHoldingWeeks: K.Signal.median(obs.map(o => o.w)), rawNet: mean(obs.map(o => o.net)), spyExcessNet: spyEx, populationExcessGross_EWIndex: popEx,
        perWeekAnnualised: { spyExcessNet: spyEx.estimate / W * 52, populationExcessGross: popEx.estimate / W * 52 }, populationBenchmark: 'weekly rebalanced EW frame index' });
    }
  }
  return out;
}
function curve(ctx, evByRule, offsets) {
  const out = {};
  for (const r of Object.keys(evByRule)) out[r] = [];
  for (const o of offsets) {
    const [a, L] = o < 0 ? [o, -o] : o === 0 ? [0, 1] : [1, o];
    const pop = popSums(ctx, a, L);
    for (const [rule, ev] of Object.entries(evByRule)) {
      const obs = [];
      for (const e of ev) { if (!e.p.elig[e.k]) continue; const g = winRet(e.p, e.k, a, L); if (g === null) continue; const S = spyRet(ctx, e.p, e.k, a, L); if (S === null) continue; obs.push({ ...e, g, S, P: pop.at(e.c) }); }
      const s = B(ctx, rowsOf(obs, x => x.g - x.S), L), p = B(ctx, rowsOf(obs, x => x.g - x.P), L);
      out[rule].push({ offsetWeeks: o, window: o < 0 ? 'k' + o + '..k' : o === 0 ? 'k..k+1 (reaction week, before entry)' : 'k+1..k+1+' + o, n: obs.length, gross: mean(obs.map(x => x.g)), minusSpy: { estimate: s.estimate, ci: s.ci }, minusPopulation: { estimate: p.estimate, ci: p.ci }, populationMinusSpy: mean(obs.map(x => x.P - x.S)) });
    }
  }
  return out;
}

// ---------- A7 ----------
function termsTable(rows) {
  const m = f => mean(rows.map(f));
  if (!rows.length) return { n: 0 };
  const ci = K.clusterInference(rows.map(o => ({ value: o.g - o.P, date: o.date, issuer: o.p.id })));
  const ci2 = K.clusterInference(rows.map(o => ({ value: o.P - o.S, date: o.date, issuer: o.p.id })));
  return { n: rows.length, rawNet: m(o => o.net), spy: m(o => o.S), populationMinusSpy: m(o => o.P - o.S), signalMinusPopulation: m(o => o.g - o.P), cost: m(o => o.cost), spyExcessNet: m(o => o.net - o.S),
    clusterCI: { signalMinusPopulation: ci.ci, populationMinusSpy: ci2.ci } };
}
function timeTables(ctx, obs, R) {
  const sub = R.analyses.A7_REGIME_TIME.subperiods.map(([a, b]) => ({ from: a, to: b, ...termsTable(obs.filter(o => o.date >= a && o.date <= b)) }));
  const P = { TRAIN: ['2001-01-01', '2012-12-31'], VALIDATION: ['2013-01-01', '2018-12-31'], TEST: ['2019-01-01', '2025-12-31'] };
  const prot = Object.fromEntries(Object.entries(P).map(([k, [a, b]]) => [k, { from: a, to: b, label: 'FULL_DESCRIPTIVE (no selection on these periods)', ...termsTable(obs.filter(o => o.date >= a && o.date <= b)) }]));
  const reg = {};
  for (const axis of ['trend', 'volatility']) reg[axis] = [...K.splitBy(obs, o => ctx.regimes.byDate.get(o.date)?.[axis] ?? 'REGIME_UNAVAILABLE')].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([state, rows]) => ({ state, ...termsTable(rows) }));
  const f = sub[0], l = sub.at(-1);
  const change = { from: f.from + '..' + f.to, to: l.from + '..' + l.to, deltaSpyExcessNet: l.spyExcessNet - f.spyExcessNet, deltaPopulationMinusSpy: l.populationMinusSpy - f.populationMinusSpy, deltaSignalMinusPopulation: l.signalMinusPopulation - f.signalMinusPopulation, deltaCost: -(l.cost - f.cost) };
  change.shareBenchmarkPopulation = change.deltaPopulationMinusSpy / change.deltaSpyExcessNet; change.shareSelection = change.deltaSignalMinusPopulation / change.deltaSpyExcessNet;
  return { subperiods: sub, protocolPeriods: prot, regimes: reg, change };
}
function populationChange(ctx, evByRule, mc) {
  const firstBar = new Map(ctx.panel.map(p => [p.id, p.cal[0]]));
  const years = {};
  const pct = mc ? capPercentiles(mc) : null;
  for (const p of ctx.panel) for (let k = 0; k < p.closes.length; k++) {
    if (!p.elig[k]) continue; const d = p.dates[k]; if (d < '2000-01-01' || d > '2025-12-31') continue;
    const y = d.slice(0, 4); years[y] ??= { obs: 0, ages: [], weeks: new Set() };
    years[y].obs++; years[y].weeks.add(d); if (k % 4 === 0) years[y].ages.push(p.cal[k] - firstBar.get(p.id));
  }
  const evStats = {};
  for (const [rule, ev] of Object.entries(evByRule)) {
    const by = K.splitBy(ev.filter(e => e.p.elig[e.k]), e => e.date.slice(0, 4));
    evStats[rule] = Object.fromEntries([...by].sort().map(([y, a]) => {
      const ages = a.map(e => e.c - firstBar.get(e.p.id));
      const pc = pct ? a.map(e => { const s = mc.atCal[e.c]; return s ? pct(s).get(e.p.id) : undefined; }).filter(x => x !== undefined) : [];
      return [y, { events: a.length, medianAgeWeeks: K.Signal.median(ages), shareYoungerThan3y: ages.filter(x => x < 156).length / ages.length, medianCapPercentile: pc.length ? K.Signal.median(pc) : null, withCap: pc.length }];
    }));
  }
  return { population: Object.fromEntries(Object.entries(years).sort().map(([y, v]) => [y, { meanEligibleListingsPerWeek: v.obs / v.weeks.size, medianAgeWeeks: K.Signal.median(v.ages), shareYoungerThan3y: v.ages.filter(x => x < 156).length / v.ages.length }])), events: evStats,
    note: 'age = calendar weeks since the first bar of the listing in the provider series (truncated at the series start; IPO date not modelled)' };
}

async function main() {
  const a = args(process.argv.slice(2)), out = K.privateDir(a.out), t0 = Date.now();
  const reg = readRegistration(), R = reg.registration, base = R.costs.base;
  const ctx = context(R); console.error('frame', ctx.fr.frame.length, (Date.now() - t0) / 1000);
  const v10 = JSON.parse(fs.readFileSync(path.join(K.ROOT, 'docs/quant-recovery/v10/studies/ca-id-lifecycle/signal-backtest-evidence.json'), 'utf8'));
  const inWindow = d => d >= R.signalWindow[0] && d <= R.signalWindow[1];
  const evByRule = Object.fromEntries(R.rules.map(r => [r, events(ctx, r, inWindow)]));
  const flags = flagsFor(ctx, R.rules);
  const mcRaw = await loadMarketCaps(a.factorPanel, ctx.fr.calendar), mc = screenCaps(mcRaw, ctx); console.error('screen', mc && mc.screen);
  console.error('mcap', mc ? mc.dates : null, (Date.now() - t0) / 1000);
  // A1
  const A1 = { cells: [], capWeighted: {}, timeTables: {} };
  for (const h of R.analyses.A1_DECOMPOSITION.horizonsWeeks) {
    const pop = popSums(ctx, 1, h, flags);
    for (const rule of R.rules) {
      const cell = decompositionCell(ctx, evByRule[rule], rule, h, pop, base, v10.cells);
      A1.capWeighted[rule + ':' + h] = capSplit(ctx, cell._obs, mc, h);
      A1.capWeighted[rule + ':' + h].unscreenedDeviationCheck = (x => ({ coverage: x.coverage, equalWeightSize: x.equalWeightSize, capWeightedMinusSpy: x.capWeightedMinusSpy }))(capSplit(ctx, cell._obs, mcRaw, h));
      if (h === 13 || h === 52) A1.timeTables[rule + ':' + h] = timeTables(ctx, cell._obs, R);
      delete cell._obs; A1.cells.push(cell);
    }
    console.error('A1 h', h, (Date.now() - t0) / 1000);
  }
  const fam = A1.cells.flatMap(c => ['spyExcessNet', 'populationMinusSpy', 'signalMinusPopulation'].map(t => Object.assign(c.inference[t], { _t: t })));
  A1.multipleTesting = K.holmFamily(fam); fam.forEach(x => delete x._t);
  // A2
  const A2 = {};
  A2.entryDelay = entryDelayCells(ctx, evByRule, R.analyses.A2_ENTRY_EXIT.entryDelaysWeeks, R.analyses.A2_ENTRY_EXIT.entryHorizonWeeks, base);
  A2.entryMultipleTesting = K.holmFamily(A2.entryDelay.flatMap(c => [c.spyExcessNet, c.populationExcessGross]));
  console.error('A2 entry', (Date.now() - t0) / 1000);
  const fixed = [];
  for (const h of R.analyses.A2_ENTRY_EXIT.fixedHorizonsWeeks) {
    const pop = popSums(ctx, 1, h);
    for (const rule of R.rules) {
      const obs = []; for (const e of evByRule[rule]) { if (!e.p.elig[e.k]) continue; const g = winRet(e.p, e.k, 1, h); if (g === null) continue; const S = spyRet(ctx, e.p, e.k, 1, h); if (S === null) continue; obs.push({ ...e, g, S, P: pop.at(e.c), net: K.netOf(g, base.feeBps, base.slippageBps) }); }
      const s = B(ctx, rowsOf(obs, o => o.net - o.S), h), p = B(ctx, rowsOf(obs, o => o.g - o.P), h);
      fixed.push({ rule, horizonWeeks: h, n: obs.length, rawNet: mean(obs.map(o => o.net)), spyExcessNet: s, populationExcessGross: p, perWeekAnnualised: { spyExcessNet: s.estimate / h * 52, populationExcessGross: p.estimate / h * 52 } });
    }
  }
  A2.fixedHorizons = fixed;
  const idx = ewIndex(ctx);
  A2.exitVariants = exitVariants(ctx, evByRule, base, idx);
  A2.exitMultipleTesting = K.holmFamily(A2.exitVariants.flatMap(c => [c.spyExcessNet, c.populationExcessGross_EWIndex]));
  A2.ewIndexNote = { weeksWithoutObservations: idx.weeksWithoutObservations, definition: R.analyses.A2_ENTRY_EXIT.variableExitBenchmark };
  console.error('A2 exits', (Date.now() - t0) / 1000);
  A2.eventTimeCurve = curve(ctx, evByRule, R.analyses.A2_ENTRY_EXIT.eventTimeCurve.offsetsWeeks);
  console.error('A2 curve', (Date.now() - t0) / 1000);
  const A7pop = populationChange(ctx, evByRule, mc);
  const result = { schemaVersion: 'v11-decomposition-events-1.0.0', registrationHash: reg.registrationHash, protocolSha256: R.protocol.sha256, sourceManifestHash: ctx.manifestHash, frame: ctx.fr.frame.length,
    marketCapPanel: mc ? { schemaVersion: mc.schemaVersion, loaderOptions: mc.loaderOptions, dates: mc.dates, first: mc.first, last: mc.last, plausibilityScreen: mc.screen,
      deviation: 'DEVIATION_1: plausibility screen of PIT market caps added after the first run (cap weights were dominated by XBRL scale errors, e.g. ref_CB 1.8e16 USD 2010-06-25). Rule: cap > 5e12 USD or implied share count off by > 5x from the listing median -> excluded. Unscreened values are kept in capWeighted[*].unscreenedDeviationCheck.' } : null,
    eventCounts: Object.fromEntries(Object.entries(evByRule).map(([r, e]) => [r, e.length])), A1, A2, A7: { populationChange: A7pop }, gitHead: K.gitHead(), runtime: K.C.runtime(), seconds: (Date.now() - t0) / 1000,
    code: K.codeHashes(['scripts/quant/v11/decomposition/events.cjs', 'scripts/quant/v11/decomposition/plan.cjs', 'scripts/quant/v11/decomposition/register.cjs']) };
  K.writeJson(path.join(out, 'events-result.json'), result);
  // private export for the dividend estimate (A5): event ids/dates of h13 observed events
  K.writeJson(path.join(out, 'events-export.json.gz'), Object.fromEntries(Object.entries(evByRule).map(([r, ev]) => [r, ev.filter(e => e.p.elig[e.k]).map(e => [e.p.id, e.date])])), true);
  console.error('done', result.seconds);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { context, winRet, popSums, ewIndex, events };
