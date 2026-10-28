#!/usr/bin/env node
'use strict';
// V10 FACTOR (RECONSTRUCTION): monthly PIT factor panel. Outcome-free.
// Usage: node panel.cjs <private_dir> [--loader-options '<json>'] [--docs <dir>]
// Reads <private_dir>/docs/<cik>.json.gz (pit_docs.py); writes <private_dir>/panel.json.gz.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('./common.cjs'), X = require('./factors.cjs');

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

function loadDocs(dir, cik, cache) {
  if (cache.has(cik)) return cache.get(cik);
  const p = path.join(dir, cik + '.json.gz');
  const v = fs.existsSync(p) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions : null;
  cache.set(cik, v); return v;
}
function docAt(versions, t) { let d = null; for (const v of versions || []) { if (v.from <= t) d = v; else break; } return d; }

function buildPanel(frame, spyBars, docsDir) {
  const spy = new Map(spyBars.map(b => [b.date, b.close]));
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const prepared = frame.listings.map(l => {
    const dates = l.points.map(p => p[0]), closes = l.points.map(p => p[1]);
    return { l, dates, closes, index: new Map(dates.map((d, k) => [d, k])), factors: X.weeklySplitFactors(dates, l.splits) };
  });
  const cache = new Map(), dates = [], counts = {};
  const count = (t, k) => { counts[t] = counts[t] || {}; counts[t][k] = (counts[t][k] || 0) + 1; };
  for (const t of frame.rankDates) {
    const cutoff = F.dayBefore(t), rows = [];
    for (const p of prepared) {
      const i = p.index.get(t); if (i === undefined) continue;
      count(t, 'population');
      const raws = X.priceComponents(p.dates, p.closes, i, spy);
      const template = X.needsIndustryTemplate(p.l.sic4);
      let mc = { value: null, reason: 'NO_ISSUER' }, fundAvailableAt = null, docFrom = null;
      if (p.l.cik) {
        const versions = loadDocs(docsDir, p.l.cik, cache), v = docAt(versions, t);
        if (!versions) count(t, 'noPitDocument');
        else if (!v) count(t, 'noFilingVisible');
        else {
          if (v.asOf > cutoff) throw Error('PIT_DOC_AFTER_CUTOFF:' + p.l.cik + '@' + t);
          docFrom = v.from;
          const doc = { ...v.doc };
          mc = X.marketCapAt({ doc, cutoff, dates: p.dates, closes: p.closes, factors: p.factors, i, issuerListings: issuerListings.get(p.l.cik) || 1 });
          if (mc.splitBetween) count(t, 'marketCapSplitBetweenShareDateAndDecision');
          const f = X.fundamentalComponents(doc, cutoff, mc.value);
          if (f) { Object.assign(raws, f.raws); fundAvailableAt = f.availableAt; if (fundAvailableAt && fundAvailableAt > cutoff) throw Error('FUNDAMENTAL_AFTER_CUTOFF'); }
          count(t, 'marketCap:' + (mc.reason || 'OK'));
        }
      } else count(t, 'noIssuer');
      if (template) count(t, 'industryTemplateNotReconstructed');
      rows.push({ id: p.l.securityId, raws, template, marketCap: mc.value, fundAvailableAt, docFrom });
    }
    const scores = X.scoreCrossSection(rows);
    for (const s of scores) for (const sig of X.SIGNALS) if (X.finite(s[sig])) count(t, 'available:' + sig);
    dates.push({ date: t, cutoff, rows: rows.map((r, k) => ({ id: r.id, scores: scores[k], raws: Object.fromEntries(X.COMPONENT_IDS.filter(c => X.finite(r.raws[c])).map(c => [c, r.raws[c]])),
      template: r.template, marketCap: r.marketCap, fundAvailableAt: r.fundAvailableAt, docFrom: r.docFrom })) });
  }
  return { dates, counts };
}

function main() {
  const out = F.privateDir(process.argv[2]);
  const loaderOptions = F.parseLoaderOptions(arg('--loader-options'));
  const docsDir = arg('--docs') || path.join(out, 'docs');
  const t0 = Date.now();
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const panel = buildPanel(frame, spy.bars, docsDir);
  const body = { schemaVersion: 'v10-factor-panel-1.0.0', evidenceKind: 'RECONSTRUCTION', loaderOptions, masterHash: frame.masterHash, rankDates: frame.rankDates, counts: panel.counts, dates: panel.dates };
  fs.writeFileSync(path.join(out, 'panel.json.gz'), zlib.gzipSync(JSON.stringify(body)));
  const last = panel.counts[frame.rankDates.at(-1)], first = panel.counts[frame.rankDates[0]];
  console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), first, last }));
}
if (require.main === module) main();
module.exports = { buildPanel, docAt };
