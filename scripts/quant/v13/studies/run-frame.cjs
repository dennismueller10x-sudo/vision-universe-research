#!/usr/bin/env node
'use strict';
// V13 STUDIES - S1 (V10 signal study, unchanged code) and S2 (population return) on one frame.
//   node scripts/quant/v13/studies/run-frame.cjs --frame F0|F1|F1c|F1w --private <dir outside repo> [--series <private series dir>]
// F0  = V10 lifecycle frame (common.buildFrame, loader identity+CA+lifecycle)
// F1  = F0 + QUALIFIED delisted docs passing the registered frame rule (lib.mergeFrame)
// F1c = F0 + QUALIFIED + PRICE_ONLY_CENSORED_END (registered sensitivity)
// F1w = F1 with the last-bar relabel of study amendment 1.0.1 (added sensitivity)
// Writes only into <private>/<frame>/ (event files contain private provider-derived returns); the public summary is built by assemble.cjs.
const fs = require('node:fs'), path = require('node:path');
const W = require('./lib.cjs'), K = W.K;
const D = require(W.ROOT + '/quant/engines/research-delisted-series.cjs');
const SignalStudy = require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs');

const FRAMES = { F0: null, F1: { include: 'QUALIFIED' }, F1c: { include: 'ALL_LOADABLE' }, F1w: { include: 'QUALIFIED', relabelLastBar: true } };

function buildContext(frame, seriesDir, dir) {
  if (!(frame in FRAMES)) throw Error('FRAME_UNKNOWN:' + frame);
  const reg = K.readRegistration(), R = reg.registration;
  const fr0 = K.buildFrame(W.F0_LOADER), m0 = K.V.hash(K.sourceManifest(fr0));
  let fr = fr0, manifestHash = m0, delistedInfo = null;
  if (FRAMES[frame]) {
    const dl = D.loadDelisted(W.ROOT, { dir: seriesDir, include: FRAMES[frame].include });
    fr = W.mergeFrame(fr0, dl.docs, { relabelLastBar: !!FRAMES[frame].relabelLastBar });
    delistedInfo = { include: dl.include, registerHash: dl.registerHash, counts: dl.counts, loaded: fr.delisted.loaded, added: fr.delisted.added.length,
      excluded: Object.fromEntries(Object.entries(fr.delisted.excluded).map(([k, v]) => [k, v.length])), relabelledLastBars: fr.delisted.relabelledLastBars, relabelOption: fr.delisted.relabelOption,
      addedByTerminalClass: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.terminal.kind; a[k] = (a[k] || 0) + 1; return a; }, {}),
      addedByStatus: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.status; a[k] = (a[k] || 0) + 1; return a; }, {}) };
    manifestHash = W.mergedManifestHash(m0, fr, delistedInfo);
  }
  const loaderOptions = { ...W.F0_LOADER, ...(FRAMES[frame] ? { v13Delisted: FRAMES[frame] } : {}) };
  const ctx = { reg, R, fr, panel: K.buildPanel(fr), benchmark: K.loadBenchmark(), manifestHash, tag: frame, dir, loaderOptions, isPrimary: false, f0ManifestHash: m0, delistedInfo };
  ctx.regimes = K.regimeLabels(ctx.benchmark, fr.calendar);
  ctx.studyCalendar = fr.calendar.filter(d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1]);
  return ctx;
}

// Same deterministic subsample as signal-study.cjs#inferenceRows (V10 rule, > 100,000 rows).
function inferenceRows(rows) {
  if (rows.length <= 100000) return rows;
  return rows.map(r => ({ r, k: K.sha('V10-STUDIES-SUBSAMPLE-1.0.0|' + r.securityId + '|' + r.date) })).sort((a, b) => a.k < b.k ? -1 : 1).slice(0, 100000).map(x => x.r);
}

// ---------- S1 terminal-resolved cells (study amendment 1.0.1, O1-O4) ----------
function terminalControl(ctx, flags, h, ruleIds, j) {
  const T = ctx.fr.calendar.length, all = { sum: new Float64Array(T), cnt: new Float64Array(T) }, det = {};
  for (const id of ruleIds) det[id] = { sum: new Float64Array(T), cnt: new Float64Array(T) };
  ctx.panel.forEach((p, i) => {
    for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
      if (!K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK)) continue;
      let g = K.forwardGross(p, k, h); if (g === null) g = W.terminalForward(p, k, h, T, j); if (g === null) continue;
      const c = p.cal[k]; all.sum[c] += g; all.cnt[c]++;
      for (const id of ruleIds) if (flags[i][id][k]) { det[id].sum[c] += g; det[id].cnt[c]++; }
    }
  });
  return { all, det };
}
function s1Terminal(ctx, events) {
  const SB = ctx.R.studies.SIGNAL_BACKTEST, base = ctx.R.costs.base, T = ctx.fr.calendar.length, cal = ctx.fr.calendar, calIndex = new Map(cal.map((d, i) => [d, i]));
  const rules = SB.rules.map(id => K.Signal.RULE_BY_ID[id]), flags = SignalStudy.detectionFlags(ctx.panel, rules);
  const byId = new Map(ctx.panel.map(p => [p.id, p])), dateIdx = new Map(ctx.panel.map(p => [p.id, new Map(p.dates.map((d, k) => [d, k]))]));
  const isDelisted = id => id.startsWith('dl_');
  const cells = [], parity = { terminalVsEngineCensoredOutcomeNotObserved: 0, terminalOnNonCensored: 0 }, trSubset = {}, counts = {};
  for (const h of SB.horizonsWeeks) {
    const ev = events[String(h)] || events[h];
    for (let j = 0; j < 3; j++) {
      const cs = terminalControl(ctx, flags, h, SB.rules, j);
      const ctrlNet = (rule, c) => { const n = cs.all.cnt[c] - cs.det[rule].cnt[c]; return n > 0 ? K.netOf((cs.all.sum[c] - cs.det[rule].sum[c]) / n, base.feeBps, base.slippageBps) : null; };
      for (const rule of SB.rules) {
        const rowsBy = { RAW_NET: [], SPY_EXCESS: [], BASE_RATE_EXCESS: [] }, gross = { all: [], delistedPrice: [], delistedTr: [] };
        let nTerminal = 0, nTerminalDelisted = 0, nObservedDelisted = 0;
        for (const e of ev) {
          if (e.rule !== rule) continue;
          const p = byId.get(e.securityId), k = dateIdx.get(e.securityId).get(e.signalDate);
          let g = null, bench = null, terminal = false;
          if (e.state === 'OBSERVED') { g = e.gross; bench = e.bench; }
          else {
            // Only engine-CENSORED events can be terminal-resolved (INELIGIBLE/IMMATURE never count, V10 semantics).
            const t = e.state === 'CENSORED' ? W.terminalForward(p, k, h, T, j) : null;
            if (j === 0 && e.state !== 'CENSORED' && W.terminalForward(p, k, h, T, j) !== null) parity.terminalOnNonCensored++;
            if (t !== null) {
              if (j === 0 && e.reason !== 'OUTCOME_NOT_OBSERVED') parity.terminalVsEngineCensoredOutcomeNotObserved++;
              g = t; terminal = true; bench = ctx.benchmark.ret(p.dates[k + 1], cal[p.cal[k] + 1 + h]);
            }
          }
          if (g === null) continue;
          if (terminal) { nTerminal++; if (isDelisted(p.id)) nTerminalDelisted++; } else if (isDelisted(p.id)) nObservedDelisted++;
          const net = K.netOf(g, base.feeBps, base.slippageBps), row = v => ({ id: e.securityId + ':' + e.signalDate, date: e.signalDate, value: v, issuer: e.securityId, securityId: e.securityId });
          rowsBy.RAW_NET.push(row(net));
          if (bench !== null && bench !== undefined) rowsBy.SPY_EXCESS.push(row(net - bench));
          const cn = ctrlNet(rule, calIndex.get(e.signalDate)); if (cn !== null) rowsBy.BASE_RATE_EXCESS.push(row(net - cn));
          gross.all.push(g);
          if (j === 0 && isDelisted(p.id)) {
            const tr = p.doc.totalReturnPoints, trBy = trBy_(p);
            const exitDate = terminal ? p.dates[p.closes.length - 1] : p.dates[k + 1 + h], a = trBy.get(p.dates[k + 1]), b = trBy.get(exitDate);
            if (tr && a > 0 && b > 0) { gross.delistedPrice.push(g); gross.delistedTr.push(b / a - 1); }
          }
        }
        for (const endpoint of SB.endpoints) {
          const rows = rowsBy[endpoint], B = K.blockLengthFor(h);
          const cell = { rule, horizonWeeks: h, endpoint, scenario: W.SCENARIO_NAMES[j], n: rows.length, estimate: K.mean(rows.map(r => r.value)), nTerminal, nTerminalDelisted, nObservedDelisted };
          if (j === 0) {
            const inf = K.blockInference(ctx.studyCalendar, inferenceRows(rows), B);
            Object.assign(cell, { ci: inf.ci, pValue: inf.pValue, blockLength: B, inferenceSubsampled: rows.length > 100000, subperiods: K.subperiodTable(rows).map(s => ({ from: s.from, to: s.to, n: s.n, mean: s.mean })) });
          }
          if (endpoint === 'RAW_NET') cell.grossMean = K.mean(gross.all);
          cells.push(cell);
        }
        if (j === 0) trSubset[rule + ':' + h] = { n: gross.delistedPrice.length, priceGrossMean: K.mean(gross.delistedPrice), totalReturnGrossMean: K.mean(gross.delistedTr) };
      }
    }
  }
  const s0 = cells.filter(c => c.scenario === W.SCENARIO_NAMES[0]);
  const family = K.holmFamily(s0);
  return { cells, holmScenario0: { ...family, definition: '5 rules x 4 horizons x 3 endpoints on the terminal-resolved scenario-0 cells of this frame (study amendment 1.0.1 O4)' }, parity, totalReturnDelistedSubset: trSubset };
}
const trCache = new WeakMap();
function trBy_(p) { if (!trCache.has(p)) trCache.set(p, new Map((p.doc.totalReturnPoints || []).map(([d, v]) => [d, v]))); return trCache.get(p); }

// ---------- S2 population return (study amendment 1.0.1 O5) ----------
function s2Population(ctx) {
  const SB = ctx.R.studies.SIGNAL_BACKTEST, base = ctx.R.costs.base, cal = ctx.fr.calendar, T = cal.length, ci = new Map(cal.map((d, i) => [d, i]));
  const periods = [['FULL', ctx.R.window.signalDates[0], ctx.R.window.signalDates[1]], ...K.SUBPERIODS.map(([a, b]) => [a.slice(0, 4) + '-' + b.slice(0, 4), a, b])];
  const out = { buyAndHold: {}, weeklyRebalancedEW: {}, delistedSubsetLifetime: null };
  const studyIdx = ctx.studyCalendar.map(d => ci.get(d));
  for (const h of SB.horizonsWeeks) {
    out.buyAndHold[h] = {};
    for (let j = 0; j < 3; j++) {
      const sum = new Float64Array(T), cnt = new Float64Array(T), sumTerm = new Float64Array(T), cntTerm = new Float64Array(T);
      for (const p of ctx.panel) for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
        if (!K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK)) continue;
        let g = K.forwardGross(p, k, h), term = false; if (g === null && j >= 0) { g = W.terminalForward(p, k, h, T, j); term = g !== null; } if (g === null) continue;
        if (!term) { sum[p.cal[k]] += g; cnt[p.cal[k]]++; }
        sumTerm[p.cal[k]] += g; cntTerm[p.cal[k]]++;
      }
      const variants = j === 0 ? { V10_COMPLETED_ONLY: [sum, cnt], TERMINAL_S0: [sumTerm, cntTerm] } : { ['TERMINAL_' + W.SCENARIO_NAMES[j]]: [sumTerm, cntTerm] };
      for (const [name, [s, n]] of Object.entries(variants)) {
        out.buyAndHold[h][name] = Object.fromEntries(periods.map(([label, a, b]) => {
          const P = [], S = [], N = [], PN = [];
          for (const c of studyIdx) { const d = cal[c]; if (d < a || d > b || !n[c] || c + 1 + h > T - 1) continue; const spy = ctx.benchmark.ret(cal[c + 1], cal[c + 1 + h]); if (spy === null) continue; const m = s[c] / n[c]; P.push(m); PN.push(K.netOf(m, base.feeBps, base.slippageBps)); S.push(spy); N.push(n[c]); }
          return [label, { weeks: P.length, meanMembers: K.mean(N), populationGross: K.mean(P), populationNet: K.mean(PN), spy: K.mean(S), populationGrossMinusSpy: K.mean(P.map((x, i) => x - S[i])) }];
        }));
      }
    }
  }
  for (let j = 0; j < 3; j++) {
    const sum = new Float64Array(T), cnt = new Float64Array(T);
    for (const p of ctx.panel) {
      const n = p.closes.length, ended = W.endedListing(p, T), s = W.scenarioReturn(p, j);
      for (let k = 1; k < n; k++) {
        if (p.cal[k] !== p.cal[k - 1] + 1 || p.dates[k - 1] < p.listingStart) continue;
        let r = p.closes[k] / p.closes[k - 1] - 1; if (ended && k === n - 1) r = (1 + r) * (1 + s) - 1;
        sum[p.cal[k]] += r; cnt[p.cal[k]]++;
      }
    }
    const I = new Float64Array(T); I[0] = 1; for (let c = 1; c < T; c++) I[c] = I[c - 1] * (1 + (cnt[c] > 0 ? sum[c] / cnt[c] : 0));
    out.weeklyRebalancedEW[W.SCENARIO_NAMES[j]] = Object.fromEntries(periods.map(([label, a, b]) => {
      const idx = cal.map((d, i) => [d, i]).filter(([d]) => d >= a && d <= b).map(x => x[1]); const c0 = idx[0], c1 = idx.at(-1);
      const years = (Date.parse(cal[c1]) - Date.parse(cal[c0])) / (365.25 * 86400000), spy = ctx.benchmark.ret(cal[c0], cal[c1]);
      const tot = I[c1] / I[c0] - 1;
      return [label, { from: cal[c0], to: cal[c1], years, total: tot, cagr: (1 + tot) ** (1 / years) - 1, spyTotal: spy, spyCagr: spy === null ? null : (1 + spy) ** (1 / years) - 1, meanMembers: K.mean(Array.from(cnt.slice(c0 + 1, c1 + 1))) }];
    }));
  }
  // delisted subset: lifetime buy-and-hold first bar -> last traded bar, price vs provider adjClose total return (O7)
  const dl = ctx.panel.filter(p => p.id.startsWith('dl_'));
  if (dl.length) {
    const pr = [], tr = []; for (const p of dl) { const m = trBy_(p), a = m.get(p.dates[0]), b = m.get(p.dates.at(-1)); if (a > 0 && b > 0) { pr.push(p.closes.at(-1) / p.closes[0] - 1); tr.push(b / a - 1); } }
    const med = a => { const x = a.slice().sort((u, v) => u - v); return x.length ? x[x.length >> 1] : null; };
    out.delistedSubsetLifetime = { listings: dl.length, withTotalReturn: pr.length, priceMean: K.mean(pr), totalReturnMean: K.mean(tr), priceMedian: med(pr), totalReturnMedian: med(tr), lossShareBelowMinus50: pr.filter(x => x < -0.5).length / (pr.length || 1) };
  }
  return out;
}

async function main() {
  const o = W.args(process.argv.slice(2), { frame: null, private: null, series: W.PRIVATE_SERIES, skipSignal: null });
  const t0 = Date.now(), dir = path.join(K.privateDir(o.private), o.frame); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ctx = buildContext(o.frame, o.series, dir);
  console.error('frame', o.frame, ctx.fr.frame.length, 'built', (Date.now() - t0) / 1000, 's');
  const timings = {};
  let t = Date.now();
  if (!o.skipSignal) { await SignalStudy.run(ctx); timings.signalStudy = (Date.now() - t) / 1000; }
  t = Date.now();
  const ev = K.readJson(path.join(dir, 'signal-events.json.gz'));
  const term = s1Terminal(ctx, ev.events); timings.terminal = (Date.now() - t) / 1000;
  K.writeJson(path.join(dir, 's1-terminal.json'), term);
  t = Date.now(); const s2 = s2Population(ctx); timings.s2 = (Date.now() - t) / 1000;
  K.writeJson(path.join(dir, 's2-population.json'), s2);
  const meta = { frame: o.frame, frameListings: ctx.fr.frame.length, qualified: ctx.fr.qualified.length, f0ManifestHash: ctx.f0ManifestHash, manifestHash: ctx.manifestHash, delisted: ctx.delistedInfo,
    calendar: { length: ctx.fr.calendar.length, first: ctx.fr.calendar[0], last: ctx.fr.calendar.at(-1) }, studyCalendarWeeks: ctx.studyCalendar.length,
    registrationSha256: W.registrationSha(), amendmentSha256: W.amendmentSha(), v10RegistrationHash: ctx.reg.registrationHash,
    code: K.codeHashes(['scripts/quant/v10/studies/signal-study.cjs', 'scripts/quant/v13/studies/lib.cjs', 'scripts/quant/v13/studies/run-frame.cjs', 'quant/engines/research-delisted-series.cjs']),
    gitHead: K.gitHead(), runtime: K.C.runtime(), timings, seconds: (Date.now() - t0) / 1000 };
  K.writeJson(path.join(dir, 'run-meta-v13.json'), meta);
  console.log(JSON.stringify({ frame: o.frame, listings: meta.frameListings, seconds: meta.seconds, timings }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { buildContext, s1Terminal, s2Population, terminalControl, FRAMES };
