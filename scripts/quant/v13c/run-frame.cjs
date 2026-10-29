#!/usr/bin/env node
'use strict';
// V13c - executes study registration 3.0.0 (S1, S2) for one frame (private outputs only).
//   node --max-old-space-size=8192 scripts/quant/v13c/run-frame.cjs --frame F1p|F1wp|F1dp [--private <dir>] [--series <dir>] [--series110 <dir>]
// F1p  = F0 + register-1.1.0 QUALIFIED chains passing the registered V13 frame rule (primary of this study)
// F1wp = same chains, V13 amendment-1.0.1 last-bar relabel (sensitivity)
// F1dp = same chains, V13b registration-2.0.0 F1d drop rule (sensitivity)
// Unchanged engines: signal-study.cjs (V10), run-frame.cjs#s1Terminal/#s2Population (V13). R2: the same frame built with register 1.0.0
// must reproduce the registered V13/V13b manifest, and the 1.1.0 frame must add exactly that set plus new chains.
const fs = require('node:fs'), path = require('node:path');
const C = require('./lib.cjs'), W = C.W, K = C.K, D = C.D;
const SignalStudy = require(W.ROOT + '/scripts/quant/v10/studies/signal-study.cjs');
const RF = require(W.ROOT + '/scripts/quant/v13/studies/run-frame.cjs');

function buildContext(frame, seriesDir, series110, dir) {
  if (!C.FRAMES[frame]) throw Error('V13C_FRAME_UNKNOWN:' + frame);
  const reg = K.readRegistration(), R = reg.registration, cp = C.FRAMES[frame].counterpart;
  const fr0 = K.buildFrame(W.F0_LOADER), m0 = K.V.hash(K.sourceManifest(fr0));
  // R2: counterpart with register 1.0.0 (default loader, unchanged)
  const dl0 = D.loadDelisted(W.ROOT, { dir: seriesDir, include: 'QUALIFIED' });
  const fr100 = C.mergeStudyFrame(cp, fr0, dl0.docs), info100 = C.delistedInfoOf(cp, dl0, fr100), m100 = W.mergedManifestHash(m0, fr100, info100);
  // this study's frame with register 1.1.0
  const dl = C.loadDelisted110('QUALIFIED', seriesDir, series110);
  const fr = C.mergeStudyFrame(frame, fr0, dl.docs), info = C.delistedInfoOf(frame, dl, fr);
  const newIds = C.newQualifiedChains();
  if (newIds.length !== 13) throw Error('V13C_NEW_CHAINS_COUNT:' + newIds.length);
  const newSet = new Set(newIds), added110Old = fr.delisted.added.filter(id => !newSet.has(id)), newAdded = fr.delisted.added.filter(id => newSet.has(id));
  const r2 = { counterpart: cp, manifest100: m100, registeredManifest100: C.MANIFEST_100[cp], manifestReproduced: m100 === C.MANIFEST_100[cp],
    oldChainsAddedIdentical: JSON.stringify(added110Old) === JSON.stringify(fr100.delisted.added), added100: fr100.delisted.added.length, added110: fr.delisted.added.length };
  if (!r2.manifestReproduced || !r2.oldChainsAddedIdentical) throw Error('V13C_R2_FAILED:' + JSON.stringify(r2));
  info.newChains = { loaded: newIds.filter(id => fr.docs.has(id)).length, added: newAdded.length, addedIds: newAdded,
    addedByTerminalClass: newAdded.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.terminal.kind; a[k] = (a[k] || 0) + 1; return a; }, {}),
    excluded: Object.fromEntries(Object.entries(fr.delisted.excluded).map(([k, v]) => [k, v.filter(id => newSet.has(id)).length])),
    ...(fr.delisted.relabelOption ? { relabelled: newAdded.filter(id => fr.docs.get(id).relabelledLastBar).length } : {}),
    ...(C.FRAMES[frame].rule === 'DROP_LAST_BAR' ? { truncated: newAdded.filter(id => fr.docs.get(id).droppedLastBar).length } : {}) };
  const manifestHash = W.mergedManifestHash(m0, fr, info);
  const loaderOptions = { ...W.F0_LOADER, v13Delisted: { include: 'QUALIFIED', registerVersion: '1.1.0', rule: C.FRAMES[frame].rule, registration: C.REG_FILE } };
  const ctx = { reg, R, fr, panel: K.buildPanel(fr), benchmark: K.loadBenchmark(), manifestHash, tag: 'V13C-' + frame, dir, loaderOptions, isPrimary: false, f0ManifestHash: m0, delistedInfo: info, r2, newSet };
  ctx.regimes = K.regimeLabels(ctx.benchmark, fr.calendar);
  ctx.studyCalendar = fr.calendar.filter(d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1]);
  return ctx;
}

/** Events of the new chains per rule x horizon (V10 observed; terminal-resolved scenario 0, i.e. engine-CENSORED with a terminal value). */
function newChainEvents(ctx, events) {
  const SB = ctx.R.studies.SIGNAL_BACKTEST, T = ctx.fr.calendar.length, byId = new Map(ctx.panel.map(p => [p.id, p])), out = {};
  for (const h of SB.horizonsWeeks) for (const rule of SB.rules) {
    let all = 0, observed = 0, terminal = 0;
    for (const e of events[String(h)]) {
      if (e.rule !== rule || !ctx.newSet.has(e.securityId)) continue;
      all++; if (e.state === 'OBSERVED') { observed++; continue; }
      if (e.state !== 'CENSORED') continue;
      const p = byId.get(e.securityId), k = p.dates.indexOf(e.signalDate);
      if (W.terminalForward(p, k, h, T, 0) !== null) terminal++;
    }
    out[rule + ':' + h] = { events: all, observed, terminalResolved: terminal };
  }
  return out;
}

async function main() {
  const o = W.args(process.argv.slice(2), { frame: null, private: C.PRIVATE, series: C.SERIES_100, series110: C.SERIES_110, skipSignal: null });
  const regSha = C.registrationSha(), amSha = C.amendmentSha(), data = C.dataState();
  if (!data.quantDataEqualsSnapshot) throw Error('V13C_DATA_NOT_SNAPSHOT (amendment 3.0.1 D1)');
  const t0 = Date.now(), dir = path.join(K.privateDir(o.private), o.frame); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ctx = buildContext(o.frame, o.series, o.series110, dir), timings = {}; let t = Date.now();
  console.error('frame', o.frame, ctx.fr.frame.length, 'built', (Date.now() - t0) / 1000, 's', JSON.stringify(ctx.delistedInfo.newChains), JSON.stringify(ctx.r2));
  if (!o.skipSignal) { await SignalStudy.run(ctx); timings.signalStudy = (Date.now() - t) / 1000; }
  t = Date.now();
  const ev = K.readJson(path.join(dir, 'signal-events.json.gz'));
  K.writeJson(path.join(dir, 's1-terminal.json'), RF.s1Terminal(ctx, ev.events)); timings.terminal = (Date.now() - t) / 1000; t = Date.now();
  K.writeJson(path.join(dir, 's2-population.json'), RF.s2Population(ctx)); timings.s2 = (Date.now() - t) / 1000;
  const res = { frame: o.frame, counterpart: C.FRAMES[o.frame].counterpart, frameListings: ctx.fr.frame.length, qualified: ctx.fr.qualified.length, manifestHash: ctx.manifestHash, f0ManifestHash: ctx.f0ManifestHash,
    delisted: ctx.delistedInfo, r2: ctx.r2, newChainEvents: newChainEvents(ctx, ev.events),
    registrationSha256: regSha, amendmentSha256: amSha, data, v13RegistrationSha256: W.registrationSha(), v13AmendmentSha256: W.amendmentSha(), v13bRegistrationSha256: C.L13b.registrationSha(), v10RegistrationHash: ctx.reg.registrationHash,
    calendar: { length: ctx.fr.calendar.length, first: ctx.fr.calendar[0], last: ctx.fr.calendar.at(-1) }, studyCalendarWeeks: ctx.studyCalendar.length,
    code: K.codeHashes(['scripts/quant/v10/studies/signal-study.cjs', 'scripts/quant/v13/studies/lib.cjs', 'scripts/quant/v13/studies/run-frame.cjs', 'scripts/quant/v13b/f1w/lib.cjs', 'quant/engines/research-delisted-series.cjs', 'scripts/quant/v13c/lib.cjs', 'scripts/quant/v13c/run-frame.cjs']),
    gitHead: K.gitHead(), runtime: K.C.runtime(), timings, seconds: (Date.now() - t0) / 1000 };
  if (o.skipSignal) { const f = path.join(dir, 'run-meta-v13c.json'); if (fs.existsSync(f)) res.timings.signalStudy = JSON.parse(fs.readFileSync(f, 'utf8')).timings.signalStudy ?? null; }
  K.writeJson(path.join(dir, 'run-meta-v13c.json'), res);
  console.log(JSON.stringify({ frame: o.frame, listings: res.frameListings, newChains: res.delisted.newChains, r2: res.r2, seconds: res.seconds, timings }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { buildContext, newChainEvents };
