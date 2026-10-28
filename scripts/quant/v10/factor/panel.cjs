#!/usr/bin/env node
'use strict';
// V10 FACTOR (RECONSTRUCTION): monthly PIT factor panel. Outcome-free.
// Usage: node panel.cjs <private_dir> [--loader-options '<json>'] [--docs <dir>]
// Reads <private_dir>/docs/<cik>.json.gz (pit_docs.py); writes <private_dir>/panel.jsonl.gz:
// line 1 = header {schemaVersion, rankDates, componentIds, counts, ...}, then one line per rank date
// {date, cutoff, rows: [[id, scores{...}, raws[componentIds], template, marketCap, fundAvailableAt, docFrom], ...]}.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('./common.cjs'), X = require('./factors.cjs');

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

function loadDocs(dir, cik) {
  const p = path.join(dir, cik + '.json.gz');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions; }
  catch (e) { if (process.env.V10_FACTOR_STRICT !== '0') throw Error('PIT_DOCUMENT_UNREADABLE:' + cik); return null; }
}
function docAt(versions, t) { let d = null; for (const v of versions || []) { if (v.from <= t) d = v; else break; } return d; }

/** Listing-outer pass (documents of one issuer in memory at a time), then date-wise scoring. */
function buildPanel(frame, spyBars, docsDir, onDate) {
  const spy = new Map(spyBars.map(b => [b.date, b.close]));
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const rankIndex = new Map(frame.rankDates.map((d, k) => [d, k]));
  const perDate = frame.rankDates.map(() => []), counts = Object.fromEntries(frame.rankDates.map(d => [d, {}]));
  const count = (t, k) => { counts[t][k] = (counts[t][k] || 0) + 1; };
  const byCik = new Map(); for (const l of frame.listings) { const k = l.cik || '__none__:' + l.securityId; if (!byCik.has(k)) byCik.set(k, []); byCik.get(k).push(l); }
  const NC = X.COMPONENT_IDS.length;
  for (const [cikKey, listings] of byCik) {
    const cik = cikKey.startsWith('__none__') ? null : cikKey;
    const versions = cik ? loadDocs(docsDir, cik) : null;
    for (const l of listings) {
      const dates = l.points.map(p => p[0]), closes = l.points.map(p => p[1]);
      const factors = X.weeklySplitFactors(dates, l.splits), template = X.needsIndustryTemplate(l.sic4);
      dates.forEach((t, i) => {
        const r = rankIndex.get(t); if (r === undefined) return;
        const cutoff = F.dayBefore(t);
        count(t, 'population');
        const raws = X.priceComponents(dates, closes, i, spy);
        let mc = { value: null, reason: 'NO_ISSUER' }, fundAvailableAt = null, docFrom = null;
        if (cik) {
          const v = docAt(versions, t);
          if (!versions) count(t, 'noPitDocument');
          else if (!v) count(t, 'noFilingVisible');
          else {
            if (v.asOf > cutoff) throw Error('PIT_DOC_AFTER_CUTOFF:' + cik + '@' + t);
            docFrom = v.from;
            mc = X.marketCapAt({ doc: v.doc, cutoff, dates, closes, factors, i, issuerListings: issuerListings.get(cik) || 1 });
            if (mc.splitBetween) count(t, 'marketCapSplitBetweenShareDateAndDecision');
            const f = X.fundamentalComponents(v.doc, cutoff, mc.value);
            if (f) { Object.assign(raws, f.raws); fundAvailableAt = f.availableAt; if (fundAvailableAt && fundAvailableAt > cutoff) throw Error('FUNDAMENTAL_AFTER_CUTOFF'); }
            else count(t, 'fundamentalsDocumentInvalid');
            count(t, 'marketCap:' + (mc.reason || 'OK'));
          }
        } else count(t, 'noIssuer');
        if (template) count(t, 'industryTemplateNotReconstructed');
        const vec = new Float64Array(NC).fill(NaN);
        X.COMPONENT_IDS.forEach((c, k) => { if (X.finite(raws[c])) vec[k] = raws[c]; });
        perDate[r].push({ id: l.securityId, vec, template, marketCap: mc.value, fundAvailableAt, docFrom });
      });
    }
  }
  frame.rankDates.forEach((t, r) => {
    const rows = perDate[r].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const scores = X.scoreCrossSection(rows.map(x => ({ id: x.id, template: x.template, raws: Object.fromEntries(X.COMPONENT_IDS.map((c, k) => [c, Number.isNaN(x.vec[k]) ? null : x.vec[k]])) })));
    for (const s of scores) for (const sig of X.SIGNALS) if (X.finite(s[sig])) count(t, 'available:' + sig);
    onDate({ date: t, cutoff: F.dayBefore(t), rows: rows.map((x, k) => [x.id, scores[k], Array.from(x.vec, v => (Number.isNaN(v) ? null : v)), x.template, x.marketCap, x.fundAvailableAt, x.docFrom]) });
    perDate[r] = null;
  });
  return { counts };
}

/** Reader for panel.jsonl.gz -> {header, dates:[{date, cutoff, rows:[{id, scores, raws, template, marketCap, ...}]}]} */
function readPanel(file, { withRaws = true } = {}) {
  const buf = zlib.gunzipSync(fs.readFileSync(file)), lines = [];
  for (let start = 0; start < buf.length;) { let end = buf.indexOf(10, start); if (end < 0) end = buf.length; if (end > start) lines.push(buf.toString('utf8', start, end)); start = end + 1; }
  const header = JSON.parse(lines[0]), ids = header.componentIds, trailer = JSON.parse(lines.at(-1));
  if (!trailer.trailer) throw Error('PANEL_TRUNCATED');
  header.counts = trailer.counts;
  const dates = lines.slice(1, -1).map(line => {
    const d = JSON.parse(line);
    return { date: d.date, cutoff: d.cutoff, rows: d.rows.map(([id, scores, vec, template, marketCap, fundAvailableAt, docFrom]) => ({ id, scores, template, marketCap, fundAvailableAt, docFrom,
      raws: withRaws ? Object.fromEntries(ids.map((c, k) => [c, vec[k]]).filter(([, v]) => v !== null)) : undefined })) };
  });
  return { ...header, dates };
}

function main() {
  const out = F.privateDir(process.argv[2]);
  const loaderOptions = F.parseLoaderOptions(arg('--loader-options'));
  const docsDir = arg('--docs') || path.join(out, 'docs');
  const t0 = Date.now();
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const header = { schemaVersion: 'v10-factor-panel-1.0.0', evidenceKind: 'RECONSTRUCTION', loaderOptions, masterHash: frame.masterHash, rankDates: frame.rankDates, componentIds: X.COMPONENT_IDS };
  const gz = zlib.createGzip(), ws = fs.createWriteStream(path.join(out, 'panel.jsonl.gz'));
  gz.pipe(ws); gz.write(JSON.stringify(header) + '\n');
  const res = buildPanel(frame, spy.bars, docsDir, d => gz.write(JSON.stringify(d) + '\n'));
  gz.write(JSON.stringify({ trailer: true, counts: res.counts }) + '\n'); gz.end();
  ws.on('finish', () => console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), first: res.counts[frame.rankDates[0]], last: res.counts[frame.rankDates.at(-1)] })));
}
if (require.main === module) main();
module.exports = { buildPanel, readPanel, docAt };
