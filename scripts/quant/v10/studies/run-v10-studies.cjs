#!/usr/bin/env node
'use strict';
// V10 strand STUDIES. Stages:
//   register --out <private>                                   frame + manifest + registration (no outcomes)
//   run      --out <private> [--loader-options '<json>'] [--studies signal,pattern,replay]
//   publish  --out <private> [--loader-options '<json>']      compact evidence into docs/quant-recovery/v10/studies/<tag>/
// All study parameters are read back from the committed registration.
const fs = require('node:fs'), path = require('node:path');
const K = require('./common.cjs');
const { plan } = require('./plan.cjs');

function manifestFile(tag) { return path.join(K.DOCS_DIR, 'source-manifest-' + tag + '-1.0.0.json.gz'); }

function register(args) {
  const out = K.privateDir(args.out);
  if (K.C.hash(args.loaderOptions) !== K.C.hash(K.PRIMARY_LOADER_OPTIONS)) throw Error('REGISTRATION_USES_PRIMARY_LOADER_CONFIGURATION');
  const fr = K.buildFrame(args.loaderOptions), manifest = K.sourceManifest(fr), manifestHash = K.V.hash(manifest);
  const panel = K.buildPanel(fr), detectionCounts = {};
  for (const r of K.Signal.RULES) { let n = 0; for (const p of panel) for (const k of K.Signal.detectEvents(Array.from(p.closes), r)) if (p.dates[k] >= K.WINDOW[0] && p.dates[k] <= K.WINDOW[1]) n++; detectionCounts[r.id] = n; }
  const bm = K.loadBenchmark();
  if (fs.existsSync(K.REG_FILE)) {
    const prev = K.readRegistration();
    if (prev.registration.primaryFrame.sourceManifestHash !== manifestHash) throw Error('PRIMARY_FRAME_CHANGED_SINCE_REGISTRATION');
    console.log(JSON.stringify({ state: 'REGISTRATION_UNCHANGED', registrationHash: prev.registrationHash })); return;
  }
  const body = { ...plan(), registeredAt: new Date().toISOString(), gitHeadAtRegistration: K.gitHead(),
    primaryFrame: { loaderOptions: args.loaderOptions, qualificationCounts: fr.reasons, qualified: fr.qualified.length,
      exclusions: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, { count: v.length, ids: v }])), frameCount: fr.frame.length, frameIdsHash: K.V.hash(fr.frame),
      calendar: { length: fr.calendar.length, first: fr.calendar[0], last: fr.calendar.at(-1), hash: K.V.hash(fr.calendar) },
      spyMissingCalendarDatesFrom1999: fr.calendar.filter(d => d >= '1999-01-01' && !bm.byDate.has(d)).length,
      sourceManifestHash: manifestHash, sourceManifestFile: path.relative(K.ROOT, manifestFile(K.loaderTag(args.loaderOptions))),
      signalDetectionCountsInWindow: detectionCounts, listingsWithCalendarGaps: panel.filter(p => p.gap[p.closes.length] > 0).length } };
  const doc = { registration: body, registrationHash: K.V.hash(body), codeAtRegistration: K.codeHashes(['scripts/quant/v10/studies/plan.cjs', 'scripts/quant/v10/studies/run-v10-studies.cjs']), runtime: K.C.runtime() };
  K.writeJson(manifestFile(K.loaderTag(args.loaderOptions)), manifest, true);
  fs.writeFileSync(K.REG_FILE, JSON.stringify(doc, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'registration-1.0.0.json'), JSON.stringify(doc));
  console.log(JSON.stringify({ registrationHash: doc.registrationHash, frame: fr.frame.length, manifestHash, detectionCounts }));
}

function run(args) {
  const out = K.privateDir(args.out), tag = K.loaderTag(args.loaderOptions), dir = path.join(out, tag);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reg = K.readRegistration(), R = reg.registration, t0 = Date.now();
  const fr = K.buildFrame(args.loaderOptions), manifest = K.sourceManifest(fr), manifestHash = K.V.hash(manifest);
  const isPrimary = K.C.hash(args.loaderOptions) === K.C.hash(R.population.loaderConfigurations.PRIMARY.loaderOptions);
  if (isPrimary && manifestHash !== R.primaryFrame.sourceManifestHash) throw Error('PRIMARY_FRAME_CHANGED_SINCE_REGISTRATION');
  K.writeJson(path.join(dir, 'source-manifest.json.gz'), manifest, true);
  const ctx = { reg, R, fr, panel: K.buildPanel(fr), benchmark: K.loadBenchmark(), manifestHash, tag, dir, loaderOptions: args.loaderOptions, isPrimary };
  ctx.regimes = K.regimeLabels(ctx.benchmark, fr.calendar);
  ctx.studyCalendar = fr.calendar.filter(d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1]);
  console.error('frame', fr.frame.length, 'tag', tag, (Date.now() - t0) / 1000, 's');
  const timings = {};
  if (args.studies.includes('signal')) { const t = Date.now(); require('./signal-study.cjs').run(ctx); timings.signal = (Date.now() - t) / 1000; }
  if (args.studies.includes('pattern') || args.studies.includes('replay')) { const t = Date.now(); require('./pattern-study.cjs').run(ctx, args.studies); timings.patternAndReplay = (Date.now() - t) / 1000; }
  const meta = { schemaVersion: 'v10-studies-run-1.0.0', tag, loaderOptions: args.loaderOptions, isPrimary, registrationHash: reg.registrationHash, sourceManifestHash: manifestHash, frame: fr.frame.length,
    gitHead: K.gitHead(), runtime: K.C.runtime(), code: K.codeHashes(['scripts/quant/v10/studies/plan.cjs', 'scripts/quant/v10/studies/run-v10-studies.cjs', 'scripts/quant/v10/studies/signal-study.cjs', 'scripts/quant/v10/studies/pattern-study.cjs']),
    timings, seconds: (Date.now() - t0) / 1000, finishedAt: new Date().toISOString() };
  K.writeJson(path.join(dir, 'run-meta.json'), meta);
  console.log(JSON.stringify(meta));
}

function publish(args) {
  const out = K.privateDir(args.out), tag = K.loaderTag(args.loaderOptions), dir = path.join(out, tag), target = path.join(K.DOCS_DIR, tag);
  const meta = K.readJson(path.join(dir, 'run-meta.json'));
  if (meta.registrationHash !== K.readRegistration().registrationHash) throw Error('REGISTRATION_MISMATCH');
  fs.mkdirSync(target, { recursive: true });
  for (const f of ['run-meta.json', 'signal-backtest-evidence.json', 'funded-strategy-evidence.json', 'pattern-evidence.json', 'same-stock-replay-evidence.json', 'parity-engine.json']) {
    const src = path.join(dir, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, f));
  }
  const pyParity = path.join(dir, 'python-parity.json'); if (fs.existsSync(pyParity)) fs.copyFileSync(pyParity, path.join(target, 'python-parity.json'));
  if (!meta.isPrimary) fs.copyFileSync(path.join(dir, 'source-manifest.json.gz'), manifestFile(tag));
  console.log(JSON.stringify({ published: target }));
}

if (require.main === module) {
  const args = K.parseArgs(process.argv.slice(2));
  const stages = { register, run, publish };
  if (!stages[args.stage]) throw Error('STAGE_REQUIRED: register|run|publish');
  stages[args.stage](args);
}
module.exports = { register, run, publish };
