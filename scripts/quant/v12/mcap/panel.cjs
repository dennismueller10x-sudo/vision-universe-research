#!/usr/bin/env node
'use strict';
// V12 MCAP: V10 factor panel rebuilt on the current frame, before and after the PIT market-cap correction.
// Usage: node panel.cjs --private <dir outside repo> --mode before|after [--docs <pit docs dir>]
// Writes <private>/<mode>/panel.jsonl.gz in the V10 panel format (readable by scripts/quant/v10/factor/study.cjs and
// strategy.cjs). 'before' runs scripts/quant/v10/factor/panel.cjs#buildPanel unchanged. 'after' runs the same function
// with factors.cjs#marketCapAt wrapped by quant/engines/research-pit-market-cap.cjs#marketCapAt (the V10 function is
// called first; only its value is replaced). The wrapper learns the current listing from factors.cjs#weeklySplitFactors,
// which buildPanel calls once per listing with the frame listing's own split array (identity checked, fail-closed).
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('../../v10/factor/common.cjs');
const X = require('../../v10/factor/factors.cjs');
const P = require('../../v10/factor/panel.cjs');
const M = require(F.ROOT + '/quant/engines/research-pit-market-cap.cjs');
const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

/** Install the corrected market cap on the shared factors module; returns {counts, restore}. */
function installCorrection(frame, register = M.loadRegister()) {
  const bySplits = new Map(frame.listings.map(l => [l.splits, l]));
  const origSplit = X.weeklySplitFactors, origMc = X.marketCapAt;
  let current = null, currentDates = null;
  const counts = {};
  X.weeklySplitFactors = (dates, splits) => {
    current = bySplits.get(splits) || null; currentDates = dates;
    if (!current) throw Error('MCAP_WRAPPER_LISTING_UNKNOWN');
    return origSplit(dates, splits);
  };
  X.marketCapAt = args => {
    const base = origMc(args);
    if (base.value === null) return base;
    if (!current || args.dates !== currentDates) throw Error('MCAP_WRAPPER_LISTING_MISMATCH');
    const r = M.marketCapAt({ ...args, securityId: current.securityId, cik: current.cik, splits: current.splits }, base, register);
    const k = r.status + (r.classes.length ? ':' + r.classes.join('+') : ''); counts[k] = (counts[k] || 0) + 1;
    if (r.value === null) return { value: null, reason: 'V12_MCAP_' + (r.reason || 'EXCLUDED'), splitBetween: base.splitBetween };
    return { ...base, value: r.value, v12Status: r.status, v12Classes: r.classes };
  };
  return { counts, restore: () => { X.weeklySplitFactors = origSplit; X.marketCapAt = origMc; } };
}

function main() {
  const mode = arg('--mode');
  if (!['before', 'after'].includes(mode)) throw Error('MODE_REQUIRED');
  const out = F.privateDir(path.join(arg('--private', path.join(SCRATCH, 'v12-private/mcap')), mode));
  const docsDir = arg('--docs', path.join(SCRATCH, 'v10-private/factor/docs'));
  const t0 = Date.now();
  const loaderOptions = F.parseLoaderOptions(null);
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const corr = mode === 'after' ? installCorrection(frame) : null;
  const reg = mode === 'after' ? M.loadRegister().meta : null;
  const header = { schemaVersion: 'v10-factor-panel-1.0.0', evidenceKind: 'RECONSTRUCTION', loaderOptions, masterHash: frame.masterHash, rankDates: frame.rankDates, componentIds: X.COMPONENT_IDS,
    v12MarketCap: mode === 'after' ? { module: 'quant/engines/research-pit-market-cap.cjs', ruleVersion: reg.ruleVersion, ruleSha256: reg.ruleSha256, observationsHash: reg.observationsHash } : 'V10_UNCHANGED' };
  const gz = zlib.createGzip(), ws = fs.createWriteStream(path.join(out, 'panel.jsonl.gz'));
  gz.pipe(ws); gz.write(JSON.stringify(header) + '\n');
  const res = P.buildPanel(frame, spy.bars, docsDir, d => gz.write(JSON.stringify(d) + '\n'));
  if (corr) corr.restore();
  gz.write(JSON.stringify({ trailer: true, counts: res.counts }) + '\n'); gz.end();
  ws.on('finish', () => {
    const info = { mode, seconds: Math.round((Date.now() - t0) / 1000), correctionCounts: corr ? corr.counts : null, masterHash: frame.masterHash };
    fs.writeFileSync(path.join(out, 'panel-info.json'), JSON.stringify(info, null, 1));
    console.log(JSON.stringify(info));
  });
}
if (require.main === module) main();
module.exports = { installCorrection };
