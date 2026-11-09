#!/usr/bin/env node
'use strict';
// V12 MCAP stage 1 (outcome-free): every PIT market-cap input of the V10 factor panel.
// Rebuilds the V10 frame and evaluates scripts/quant/v10/factor/factors.cjs#marketCapAt unchanged for each
// listing x rank date, and records the share observation that enters it (value, period end, filed, accession,
// concept), the price inputs (close at t, split factor at the share date and at t) and the listing's split list.
// Usage: node observations.cjs --private <dir outside repo> [--docs <pit docs dir>] [--panel <panel.jsonl.gz>]
// Writes <private>/observations.json.gz. With --panel, every recomputed market cap is compared with the panel value.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('../../v10/factor/common.cjs');
const X = require('../../v10/factor/factors.cjs');
const { docAt, readPanel } = require('../../v10/factor/panel.cjs');

const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

function loadDocs(dir, cik) {
  const p = path.join(dir, cik + '.json.gz');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions;
}

function collect(frame, docsDir) {
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const rankIndex = new Map(frame.rankDates.map((d, k) => [d, k]));
  const byCik = new Map();
  for (const l of frame.listings) if (l.cik) { if (!byCik.has(l.cik)) byCik.set(l.cik, []); byCik.get(l.cik).push(l); }
  const rows = [], listings = {}, reasons = {};
  for (const [cik, ls] of byCik) {
    const versions = loadDocs(docsDir, cik);
    if (!versions) continue;
    for (const l of ls) {
      const dates = l.points.map(p => p[0]), closes = l.points.map(p => p[1]);
      const factors = X.weeklySplitFactors(dates, l.splits);
      listings[l.securityId] = { cik, ticker: l.ticker, splits: l.splits, firstDate: dates[0], lastDate: dates.at(-1), issuerListings: issuerListings.get(cik) || 1 };
      dates.forEach((t, i) => {
        if (!rankIndex.has(t)) return;
        const v = docAt(versions, t); if (!v) return;
        const cutoff = F.dayBefore(t);
        const mc = X.marketCapAt({ doc: v.doc, cutoff, dates, closes, factors, i, issuerListings: issuerListings.get(cik) || 1 });
        reasons[mc.reason || 'OK'] = (reasons[mc.reason || 'OK'] || 0) + 1;
        if (mc.value === null) return;
        const s = v.doc.ttm.shares_outstanding;
        let k = i; while (k > 0 && dates[k] > mc.sharesEnd) k--;
        rows.push({ id: l.securityId, cik, t, docFrom: v.from, mc: mc.value, close: closes[i], fK: factors[k], fI: factors[i], barK: dates[k],
          s: { v: s.v, end: s.end, filed: s.filed, accn: s.accn || null, concept: s.concept || null, fp: s.fp || null, unit: s.unit || null } });
      });
    }
  }
  return { rows, listings, reasons };
}

function main() {
  const priv = F.privateDir(arg('--private', path.join(SCRATCH, 'v12-private/mcap')));
  const docsDir = arg('--docs', path.join(SCRATCH, 'v10-private/factor/docs'));
  const t0 = Date.now();
  const frame = F.buildFrame(F.DEFAULT_LOADER_OPTIONS);
  const res = collect(frame, docsDir);
  let parity = null;
  const panelFile = arg('--panel');
  if (panelFile) {
    const p = readPanel(panelFile, { withRaws: false });
    const m = new Map(); for (const d of p.dates) for (const r of d.rows) if (X.finite(r.marketCap)) m.set(r.id + '@' + d.date, r.marketCap);
    let same = 0, diff = 0; for (const r of res.rows) { const x = m.get(r.id + '@' + r.t); if (x !== undefined && Math.abs(x - r.mc) <= 1e-9 * Math.abs(x)) same++; else diff++; }
    parity = { panelRowsWithMarketCap: m.size, recomputed: res.rows.length, identical: same, different: diff, panelMasterHash: p.masterHash, frameMasterHash: frame.masterHash };
  }
  const out = { schemaVersion: 'v12-mcap-observations-1.0.0', loaderOptions: F.DEFAULT_LOADER_OPTIONS, masterHash: frame.masterHash, rankDates: frame.rankDates,
    reasons: res.reasons, parity, listings: res.listings, rows: res.rows, seconds: Math.round((Date.now() - t0) / 1000) };
  fs.writeFileSync(path.join(priv, 'observations.json.gz'), zlib.gzipSync(JSON.stringify(out)));
  console.log(JSON.stringify({ rows: res.rows.length, reasons: res.reasons, parity, seconds: out.seconds }));
}
if (require.main === module) main();
module.exports = { collect };
