#!/usr/bin/env node
'use strict';
// V13b F1W - executes study registration 2.0.0 for one frame (private outputs only).
//   node --max-old-space-size=8192 scripts/quant/v13b/f1w/run.cjs --frame F1d|F1w|F1|F0 [--private <dir>] [--v13private <dir>] [--series <dir>]
// F1d : new frame (drop the non-modal last bar), full V10 signal study + V13 terminal/S2 (unchanged code), DG3.
// F1w : rebuilt with the unchanged V13 relabel; R1 reproduction (s1Terminal + s2 on the V13 F1w events), DG1, DG2, DG3.
// F0/F1: frame rebuilt only for DG3 (funded episodes of the V13 runs); their study results are cited from V13, not recomputed.
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), W = L.W, K = L.K;
const D = require(W.ROOT + '/quant/engines/research-delisted-series.cjs');
const SignalStudy = require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs');
const RF = require(W.ROOT + '/scripts/quant/v13/studies/run-frame.cjs');

function buildContext(frame, seriesDir, dir) {
  const reg = K.readRegistration(), R = reg.registration;
  const fr0 = K.buildFrame(W.F0_LOADER), m0 = K.V.hash(K.sourceManifest(fr0));
  let fr = fr0, manifestHash = m0, delistedInfo = null, loaderOptions = { ...W.F0_LOADER };
  if (frame !== 'F0') {
    const dl = D.loadDelisted(W.ROOT, { dir: seriesDir, include: 'QUALIFIED' });
    fr = frame === 'F1d' ? L.mergeFrameF1d(fr0, dl.docs) : W.mergeFrame(fr0, dl.docs, { relabelLastBar: frame === 'F1w' });
    delistedInfo = { include: dl.include, registerHash: dl.registerHash, counts: dl.counts, loaded: fr.delisted.loaded, added: fr.delisted.added.length,
      excluded: Object.fromEntries(Object.entries(fr.delisted.excluded).map(([k, v]) => [k, v.length])), relabelledLastBars: fr.delisted.relabelledLastBars, relabelOption: fr.delisted.relabelOption,
      ...(frame === 'F1d' ? { truncatedLastBars: fr.delisted.truncatedLastBars, tooShortAfterDrop: fr.delisted.tooShortAfterDrop, dropOption: true } : {}),
      addedByTerminalClass: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.terminal.kind; a[k] = (a[k] || 0) + 1; return a; }, {}),
      addedByStatus: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.status; a[k] = (a[k] || 0) + 1; return a; }, {}) };
    manifestHash = W.mergedManifestHash(m0, fr, delistedInfo);
    loaderOptions.v13Delisted = frame === 'F1d' ? { include: 'QUALIFIED', dropNonModalLastBar: true, registration: L.REG_FILE } : { include: 'QUALIFIED', ...(frame === 'F1w' ? { relabelLastBar: true } : {}) };
  }
  const ctx = { reg, R, fr, panel: K.buildPanel(fr), benchmark: K.loadBenchmark(), manifestHash, tag: 'V13B-' + frame, dir, loaderOptions, isPrimary: false, f0ManifestHash: m0, delistedInfo };
  ctx.regimes = K.regimeLabels(ctx.benchmark, fr.calendar);
  ctx.studyCalendar = fr.calendar.filter(d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1]);
  return ctx;
}

// ---------- DG1: partial-week return of the relabelled (F1w) = dropped (F1d) last bars ----------
function dg1(ctx) {
  const by = {}, add = (k, x) => { (by[k] = by[k] || []).push(x); };
  for (const p of ctx.panel) {
    const rl = p.doc.relabelledLastBar; if (!rl) continue;
    const n = p.closes.length, r = p.closes[n - 1] / p.closes[n - 2] - 1;
    const x = { r, gap: p.cal[n - 1] !== p.cal[n - 2] + 1, days: L.weekdaysBetween(rl.from, rl.to), year: rl.from.slice(0, 4) };
    add(p.lifecycle.terminal.kind, x); add('ALL', x);
  }
  const med = a => { const s = a.slice().sort((u, v) => u - v); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  return Object.fromEntries(Object.entries(by).sort().map(([k, xs]) => {
    const r = xs.map(x => x.r), dd = {}; for (const x of xs) dd[x.days] = (dd[x.days] || 0) + 1;
    return [k, { n: xs.length, mean: K.mean(r), median: med(r), shareBelowMinus50: r.filter(v => v < -0.5).length / xs.length, shareAbovePlus50: r.filter(v => v > 0.5).length / xs.length,
      previousBarNotPrecedingWeek: xs.filter(x => x.gap).length, weekdaysLastTradeToModal: dd }];
  }));
}

// ---------- DG2: SPY legs on relabelled bars moved to the true last trade date (F1w only) ----------
function dg2(ctx, events) {
  const SB = ctx.R.studies.SIGNAL_BACKTEST, base = ctx.R.costs.base, T = ctx.fr.calendar.length, cal = ctx.fr.calendar;
  const byId = new Map(ctx.panel.map(p => [p.id, p])), dateIdx = new Map(ctx.panel.map(p => [p.id, new Map(p.dates.map((d, k) => [d, k]))]));
  const trueDate = (p, d) => (p.doc.relabelledLastBar && d === p.doc.relabelledLastBar.to) ? p.doc.relabelledLastBar.from : d;
  const out = [];
  for (const h of SB.horizonsWeeks) for (const rule of SB.rules) {
    const acc = { V10: { id: [], tr: [], affected: 0 }, S0: { id: [], tr: [], affected: 0 } };
    for (const e of events[String(h)]) {
      if (e.rule !== rule) continue;
      const p = byId.get(e.securityId), k = dateIdx.get(e.securityId).get(e.signalDate);
      if (e.state === 'OBSERVED') {
        const net = K.netOf(e.gross, base.feeBps, base.slippageBps), b0 = ctx.benchmark.ret(e.entryDate, e.exitDate);
        if (b0 !== e.bench) throw Error('DG2_BENCH_IDENTITY:' + e.securityId + ':' + e.signalDate);
        const a = trueDate(p, e.entryDate), z = trueDate(p, e.exitDate), b1 = ctx.benchmark.ret(a, z), moved = a !== e.entryDate || z !== e.exitDate;
        for (const v of ['V10', 'S0']) { if (e.bench !== null) acc[v].id.push(net - e.bench); if (b1 !== null) acc[v].tr.push(net - b1); if (moved) acc[v].affected++; }
      } else if (e.state === 'CENSORED') {
        const t = W.terminalForward(p, k, h, T, 0); if (t === null) continue;
        const net = K.netOf(t, base.feeBps, base.slippageBps), ed = p.dates[k + 1], xd = cal[p.cal[k] + 1 + h];
        const b0 = ctx.benchmark.ret(ed, xd), a = trueDate(p, ed), b1 = ctx.benchmark.ret(a, xd);
        if (b0 !== null) acc.S0.id.push(net - b0); if (b1 !== null) acc.S0.tr.push(net - b1); if (a !== ed) acc.S0.affected++;
      }
    }
    for (const v of ['V10', 'S0']) out.push({ rule, horizonWeeks: h, variant: v, nModalDate: acc[v].id.length, estimateModalDate: K.mean(acc[v].id), nTrueDate: acc[v].tr.length, estimateTrueDate: K.mean(acc[v].tr), affectedEvents: acc[v].affected, difference: K.mean(acc[v].tr) - K.mean(acc[v].id) });
  }
  return out;
}

// ---------- DG3: funded-strategy fragility (descriptive) ----------
function dg3(ctx, fundedDir, f1Dir) {
  const F = ctx.R.studies.SIGNAL_BACKTEST.fundedStrategy, cal = ctx.fr.calendar, ci = new Map(cal.map((d, i) => [d, i]));
  const jLast = ci.get(ctx.studyCalendar.at(-1)), lastSession = jLast + 1 + F.parameters.holdingWeeks;
  const universe = ctx.panel.filter(p => p.gap[p.closes.length] === 0 && p.cal[p.closes.length - 1] >= lastSession);
  const dlU = universe.filter(p => p.id.startsWith('dl_'));
  const byId = new Map(ctx.panel.map(p => [p.id, p]));
  const out = { lastSession: cal[lastSession], universe: universe.length, delistedInUniverse: dlU.length,
    delistedByLastTradeYear: dlU.reduce((a, p) => { const y = p.lifecycle.lastTradeDate.slice(0, 4); a[y] = (a[y] || 0) + 1; return a; }, {}),
    delistedRelabelledInUniverse: dlU.filter(p => p.doc.relabelledLastBar).length, delistedTruncatedInUniverse: dlU.filter(p => p.doc.droppedLastBar).length, rules: {} };
  for (const rule of F.rules) {
    const f = path.join(fundedDir, 'funded-' + rule + '-equity.json.gz'); if (!fs.existsSync(f)) continue;
    const eps = K.readJson(f).episodes, f1 = f1Dir ? new Set(K.readJson(path.join(f1Dir, 'funded-' + rule + '-equity.json.gz')).episodes.map(e => e.securityId + '|' + e.signalDate)) : null;
    const ret = e => { const p = byId.get(e.securityId), m = new Map(Array.from(p.cal, (c, k) => [c, k])), a = m.get(e.entryExec), b = m.get(e.exitExec); if (a === undefined || b === undefined) throw Error('DG3_EPISODE_BAR:' + e.securityId); return p.closes[b] / p.closes[a] - 1; };
    const all = eps.map(ret), dl = eps.filter(e => e.securityId.startsWith('dl_'));
    out.rules[rule] = { episodes: eps.length, episodesInDelisted: dl.length, delistedChainsTraded: new Set(dl.map(e => e.securityId)).size, meanGrossEpisodeAll: K.mean(all), meanGrossEpisodeDelisted: dl.length ? K.mean(dl.map(ret)) : null,
      sumGrossEpisodeDelisted: dl.reduce((s, e) => s + ret(e), 0), episodesNotInF1: f1 ? eps.filter(e => !f1.has(e.securityId + '|' + e.signalDate)).length : null,
      episodesNotInF1NonDelisted: f1 ? eps.filter(e => !e.securityId.startsWith('dl_') && !f1.has(e.securityId + '|' + e.signalDate)).length : null };
  }
  return out;
}

async function main() {
  const o = W.args(process.argv.slice(2), { frame: null, private: L.PRIVATE, v13private: L.V13_PRIVATE, series: W.PRIVATE_SERIES });
  if (!['F0', 'F1', 'F1w', 'F1d'].includes(o.frame)) throw Error('FRAME_UNKNOWN:' + o.frame);
  const regSha = L.registrationSha(), t0 = Date.now(), dir = path.join(K.privateDir(o.private), o.frame); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const v13dir = path.join(o.v13private, o.frame), v13F1 = path.join(o.v13private, 'F1');
  const ctx = buildContext(o.frame, o.series, dir), timings = {}; let t = Date.now();
  console.error('frame', o.frame, ctx.fr.frame.length, 'built', (Date.now() - t0) / 1000, 's');
  const res = { frame: o.frame, frameListings: ctx.fr.frame.length, qualified: ctx.fr.qualified.length, manifestHash: ctx.manifestHash, f0ManifestHash: ctx.f0ManifestHash, delisted: ctx.delistedInfo };
  if (o.frame === 'F1d') {
    await SignalStudy.run(ctx); timings.signalStudy = (Date.now() - t) / 1000; t = Date.now();
    const ev = K.readJson(path.join(dir, 'signal-events.json.gz'));
    K.writeJson(path.join(dir, 's1-terminal.json'), RF.s1Terminal(ctx, ev.events)); timings.terminal = (Date.now() - t) / 1000; t = Date.now();
    K.writeJson(path.join(dir, 's2-population.json'), RF.s2Population(ctx)); timings.s2 = (Date.now() - t) / 1000;
    res.dg3 = dg3(ctx, dir, v13F1);
  } else if (o.frame === 'F1w') {
    res.r1 = { manifestHashEqualsV13: ctx.manifestHash === L.V13_F1W_MANIFEST };
    const ev = K.readJson(path.join(v13dir, 'signal-events.json.gz'));
    K.writeJson(path.join(dir, 's1-terminal.json'), RF.s1Terminal(ctx, ev.events)); timings.terminal = (Date.now() - t) / 1000; t = Date.now();
    K.writeJson(path.join(dir, 's2-population.json'), RF.s2Population(ctx)); timings.s2 = (Date.now() - t) / 1000; t = Date.now();
    res.dg1 = dg1(ctx); res.dg2 = dg2(ctx, ev.events); timings.dg = (Date.now() - t) / 1000;
    res.dg3 = dg3(ctx, v13dir, v13F1);
  } else {
    res.dg3 = dg3(ctx, v13dir, o.frame === 'F1' ? null : v13F1);
  }
  Object.assign(res, { registrationSha256: regSha, v13RegistrationSha256: W.registrationSha(), v13AmendmentSha256: W.amendmentSha(), v10RegistrationHash: ctx.reg.registrationHash,
    calendar: { length: ctx.fr.calendar.length, first: ctx.fr.calendar[0], last: ctx.fr.calendar.at(-1) }, studyCalendarWeeks: ctx.studyCalendar.length,
    code: K.codeHashes(['scripts/quant/v10/studies/signal-study.cjs', 'scripts/quant/v13/studies/lib.cjs', 'scripts/quant/v13/studies/run-frame.cjs', 'quant/engines/research-delisted-series.cjs', 'scripts/quant/v13b/f1w/lib.cjs', 'scripts/quant/v13b/f1w/run.cjs']),
    gitHead: K.gitHead(), runtime: K.C.runtime(), timings, seconds: (Date.now() - t0) / 1000 });
  K.writeJson(path.join(dir, 'run-meta-v13b.json'), res);
  console.log(JSON.stringify({ frame: o.frame, listings: res.frameListings, delisted: res.delisted && { added: res.delisted.added, relabelled: res.delisted.relabelledLastBars, truncated: res.delisted.truncatedLastBars, tooShort: res.delisted.tooShortAfterDrop }, r1: res.r1, seconds: res.seconds, timings }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { buildContext, dg1, dg2, dg3 };
