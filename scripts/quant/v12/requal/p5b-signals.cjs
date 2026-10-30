#!/usr/bin/env node
'use strict';
// V12 REQUAL P5b - V11 decomposition of the five V10 signal rules, re-run on PIT S&P 500 members (registration 1.0.1, P5.b_signalDecomposition).
// Steps: FRAME_2009 (full survivor frame, window 2009-10..2025), SP500_WITH_SERIES (events and population restricted to members at the latest
// population date <= signal date), SP500_ALL_ESTIMATE (population term shifted by the within-index survivorship gap of P5a).
// Reuses the V10 frame/panel/eligibility/benchmark/inference blocks and the V11 window/decomposition semantics unchanged.
// Usage: node p5b-signals.cjs [--out docs/quant-recovery/v12/requal/p5b-signals-1.1.0.json] [--p5a docs/.../p5a-population-1.1.0.json]
const path = require('node:path');
const L = require('./lib.cjs');
const K = require(L.ROOT + '/scripts/quant/v10/studies/common.cjs');
const { readRegistration } = require('./plan.cjs');

const LOADER = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const LOOKBACK = K.SIGNAL_FEATURE_LOOKBACK;
const COST = { feeBps: 10, slippageBps: 5 };

function winRet(p, k, a, h) { const s = k + a, e = s + h, lo = Math.min(k, s); if (lo < 0 || e >= p.closes.length) return null; if (p.cal[e] - p.cal[lo] !== e - lo) return null; return p.closes[e] / p.closes[s] - 1; }

function membership(pop) {
  const dates = pop.periods.map(p => p.t0), sets = dates.map(t0 => new Set(pop.members(t0).members.map(m => m.securityId).filter(Boolean)));
  return { dates, at: d => { const k = L.lastIdx(dates, d); return k < 0 ? null : sets[k]; } };
}

function popSums(ctx, h, isMember) {
  const T = ctx.T, sum = new Float64Array(T), cnt = new Float64Array(T);
  for (const p of ctx.panel) for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
    if (!p.elig[k] || !isMember(p, k)) continue;
    const r = winRet(p, k, 1, h); if (r === null) continue;
    sum[p.cal[k]] += r; cnt[p.cal[k]]++;
  }
  return { at: c => cnt[c] > 0 ? sum[c] / cnt[c] : null, cnt };
}

function cell(ctx, rule, h, isMember, pop, shifts) {
  const R = K.Signal.RULE_BY_ID[rule], states = { detected: 0, ineligible: 0, censoredOrImmature: 0, observed: 0, noSpy: 0 }, obs = [];
  ctx.panel.forEach(p => {
    for (const k of K.Signal.detectEvents(Array.from(p.closes), R)) {
      const d = p.dates[k]; if (d < ctx.window[0] || d > ctx.window[1] || !isMember(p, k)) continue;
      states.detected++;
      if (!p.elig[k]) { states.ineligible++; continue; }
      const g = winRet(p, k, 1, h); if (g === null) { states.censoredOrImmature++; continue; }
      states.observed++;
      const S = ctx.benchmark.ret(p.dates[k + 1], p.dates[k + 1 + h]); if (S === null) { states.noSpy++; continue; }
      const P = pop.at(p.cal[k]), net = K.netOf(g, COST.feeBps, COST.slippageBps);
      obs.push({ id: p.id, date: d, g, S, P, net, cost: g - net, shift: shifts ? { ZERO: shifts.ZERO(d, h), LOWER: shifts.LOWER(d, h) } : null });
    }
  });
  const m = f => L.mean(obs.map(f));
  const terms = { rawNet: m(o => o.net), spy: m(o => o.S), populationMinusSpy: m(o => o.P - o.S), signalMinusPopulation: m(o => o.g - o.P), cost: m(o => o.cost), spyExcessNet: m(o => o.net - o.S) };
  const residual = terms.rawNet - (terms.spy + terms.populationMinusSpy + terms.signalMinusPopulation - terms.cost);
  const rows = f => obs.map(o => ({ id: o.id + ':' + o.date, date: o.date, value: f(o), issuer: o.id })).filter(r => L.finite(r.value));
  const B = rs => { const r = K.blockInference(ctx.studyCalendar, rs, h >= 52 ? 104 : 52); return { observed: L.r6(r.estimate), ci: r.ci ? r.ci.map(L.r6) : null, pValue: r.pValue, state: r.state, n: r.n }; };
  const inference = { spyExcessNet: B(rows(o => o.net - o.S)), populationMinusSpy: B(rows(o => o.P - o.S)), signalMinusPopulation: B(rows(o => o.g - o.P)) };
  const out = { rule, horizonWeeks: h, n: obs.length, states, terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, L.r6(v)])), identityResidual: residual, inference };
  if (shifts) for (const sc of ['ZERO', 'LOWER']) {
    const ws = obs.filter(o => L.finite(o.shift[sc]));
    out['allMembersEstimate' + (sc === 'ZERO' ? '' : 'LOWER')] = { n: ws.length, survivorshipShift: L.r6(L.mean(ws.map(o => o.shift[sc]))),
      populationAllMinusSpy: L.r6(L.mean(ws.map(o => o.P - o.shift[sc] - o.S))), signalMinusPopulationAll: L.r6(L.mean(ws.map(o => o.g - (o.P - o.shift[sc])))),
      note: 'estimate (' + sc + '): Pop_all = Pop_with_series - (EW_WITH_H - EW_ALL of the P5a period containing the signal date) * h / weeks of that period' };
  }
  return out;
}

async function main() {
  const o = L.args(process.argv.slice(2), { out: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p5b-signals-1.1.0.json'), p5a: path.join(L.ROOT, 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json') });
  const t0 = Date.now(), reg = readRegistration(), spec = reg.registration.P5.b_signalDecomposition;
  const fr = K.buildFrame(LOADER), manifestHash = K.V.hash(K.sourceManifest(fr)), panel = K.buildPanel(fr), benchmark = K.loadBenchmark();
  for (const p of panel) { p.elig = new Uint8Array(p.closes.length); for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) if (K.eligibleAt(p, k, LOOKBACK)) p.elig[k] = 1; }
  const ctx = { panel, benchmark, T: fr.calendar.length, window: spec.window, studyCalendar: fr.calendar.filter(d => d >= spec.window[0] && d <= spec.window[1]) };
  const pop = L.makePopulation(), mem = membership(pop);
  const isSp = (p, k) => { const s = mem.at(p.dates[k]); return !!s && s.has(p.id); };
  const any = () => true;
  const p5a = require(o.p5a), p5aSha = L.shaFile(o.p5a);
  const shiftFor = sc => (d, h) => { const per = p5a.periods.find(x => x.t0 <= d && d < x.t1); if (!per) return null; const s = per.series[sc]; const w = L.days(per.t0, per.t1) / 7; return (s.EW_WITH_H - s.EW_ALL) * h / w; };
  const v11 = require(L.ROOT + '/docs/quant-recovery/v11/decomposition/decomposition-results.json').A1_decomposition.cells;
  const steps = {};
  for (const [step, isMember] of [['FRAME_2009', any], ['SP500_WITH_SERIES', isSp]]) {
    const cells = [];
    for (const h of spec.horizonsWeeks) {
      const ps = popSums(ctx, h, isMember);
      for (const rule of spec.rules) {
        const c = cell(ctx, rule, h, isMember, ps, step === 'SP500_WITH_SERIES' ? { ZERO: shiftFor('ZERO'), LOWER: shiftFor('LOWER') } : null);
        cells.push(c);
      }
      if (step === 'SP500_WITH_SERIES') cells.filter(c => c.horizonWeeks === h).forEach(c => { c.populationSizeMeanPerWeek = L.r6(L.mean(Array.from(ps.cnt).filter(x => x > 0))); });
    }
    const fam = cells.flatMap(c => Object.values(c.inference));
    const adj = L.holm(fam.map(x => x.pValue)); fam.forEach((x, i) => { x.holmAdjustedP = L.r6(adj[i]); x.secured = adj[i] !== null && adj[i] <= 0.05; });
    steps[step] = { cells, multipleTesting: { family: fam.length, method: 'HOLM over 5 rules x 2 horizons x 3 terms', rejections: fam.filter(x => x.secured).length } };
  }
  const v11Cells = spec.horizonsWeeks.flatMap(h => spec.rules.map(rule => { const c = v11.find(x => x.rule === rule && x.horizonWeeks === h); return c ? { rule, horizonWeeks: h, n: c.n, terms: c.terms, holm: Object.fromEntries(Object.entries(c.inference).map(([k, v]) => [k, v.holmAdjustedP])) } : { rule, horizonWeeks: h, missing: true }; }));
  const bridge = spec.horizonsWeeks.flatMap(h => spec.rules.map(rule => {
    const a = v11Cells.find(x => x.rule === rule && x.horizonWeeks === h), b = steps.FRAME_2009.cells.find(x => x.rule === rule && x.horizonWeeks === h), c = steps.SP500_WITH_SERIES.cells.find(x => x.rule === rule && x.horizonWeeks === h);
    const t = k => [a.terms?.[k] ?? null, b.terms[k], c.terms[k], k === 'populationMinusSpy' ? c.allMembersEstimate.populationAllMinusSpy : k === 'signalMinusPopulation' ? c.allMembersEstimate.signalMinusPopulationAll : c.terms[k]];
    return { rule, horizonWeeks: h, columns: ['V11_2000_2025', 'FRAME_2009_2025', 'SP500_WITH_SERIES', 'SP500_ALL_ESTIMATE_ZERO'], spyExcessNet: t('spyExcessNet'), populationMinusSpy: t('populationMinusSpy'), signalMinusPopulation: t('signalMinusPopulation'), cost: t('cost'), n: [a.n ?? null, b.n, c.n, c.n],
      lowerBoundPopulationAllMinusSpy: c.allMembersEstimateLOWER.populationAllMinusSpy, lowerBoundSignalMinusPopulationAll: c.allMembersEstimateLOWER.signalMinusPopulationAll };
  }));
  const out = { studyId: 'V12-REQUAL-P5B', registrationSha256: reg.sha256, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    population: { frame: fr.frame.length, sourceManifestHash: manifestHash, loaderOptions: LOADER, sp500: 'PIT_SP500 rules ' + pop.ruleVersion + ', member at latest population date <= signal date', indexDataSha256: pop.dataSha256 },
    window: spec.window, returnBasis: 'PRICE_RETURN both sides (events, population, SPY)', costs: { perSide: COST, rule: 'K.netOf on each event (round trip)' }, signalTiming: spec.signalTiming,
    p5aInput: { file: path.relative(L.ROOT, o.p5a), sha256: p5aSha }, v11Published: v11Cells, steps, bridge, runtimeSeconds: Math.round((Date.now() - t0) / 1000) };
  const h = L.writeJson(o.out, out);
  console.log(JSON.stringify({ out: path.relative(L.ROOT, o.out), sha256: h, seconds: out.runtimeSeconds }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
