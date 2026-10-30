#!/usr/bin/env node
'use strict';
// V12 MCAP: expected effect of the producer patch proposal (docs/quant-recovery/v12/mcap/producer-patch-market-cap-1.2.0.diff)
// measured on the research panel, without applying the patch. The guard below is the proposed
// market-cap.js#shareScaleSuspect, copied verbatim from the diff so that the measurement and the proposal agree
// (a test compares both texts).
// Usage: node producer-effect.cjs --private <dir> [--docs <pit docs dir>] [--out <json>]
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { docAt } = require('../../v10/factor/panel.cjs');
const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

// ---- BEGIN GUARD (verbatim from the proposal) ----
var SCALE_GUARD_MIN_EXPONENT = 3, SCALE_GUARD_TOLERANCE = 1.25, SCALE_GUARD_HISTORY = 4;
function previousShareCounts(doc, cutoff, end) {
  var cols = (doc && doc.columns) || ["fy", "fp", "end", "v", "filed", "accn", "derived"];
  var iEnd = cols.indexOf("end"), iV = cols.indexOf("v"), iFiled = cols.indexOf("filed");
  var rows = (doc && doc.quarterly && doc.quarterly.shares_outstanding) || [];
  return rows.filter(function (r) { return typeof r[iFiled] === "string" && r[iFiled] <= cutoff && r[iEnd] < end && typeof r[iV] === "number" && r[iV] > 0; })
    .sort(function (a, b) { return a[iEnd] < b[iEnd] ? -1 : 1; }).slice(-SCALE_GUARD_HISTORY).map(function (r) { return r[iV]; });
}
/* true if the share count differs from the median of the previous quarterly counts by a power of ten (|k| >= 3, +-25 %). */
function shareScaleSuspect(shares, doc, cutoff) {
  if (!shares || !(shares.value > 0) || typeof shares.end !== "string") return false;
  var prev = previousShareCounts(doc, cutoff, shares.end).sort(function (a, b) { return a - b; });
  if (!prev.length) return false;
  var m = prev.length % 2 ? prev[(prev.length - 1) / 2] : (prev[prev.length / 2 - 1] + prev[prev.length / 2]) / 2;
  var l = Math.log10(shares.value / m), k = Math.round(l);
  return Math.abs(k) >= SCALE_GUARD_MIN_EXPONENT && Math.abs(l - k) <= Math.log10(SCALE_GUARD_TOLERANCE);
}
// ---- END GUARD ----

function main() {
  const priv = arg('--private', path.join(SCRATCH, 'v12-private/mcap'));
  const docsDir = arg('--docs', path.join(SCRATCH, 'v10-private/factor/docs'));
  const out = arg('--out', path.join(priv, 'producer-effect-1.0.0.json'));
  const obs = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(priv, 'observations.json.gz'))));
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(priv, 'rows-corrected.json.gz')))).rows;
  const status = new Map(rows.map(r => [r.id + '@' + r.t, r]));
  const byCik = new Map();
  for (const r of obs.rows) { if (!byCik.has(r.cik)) byCik.set(r.cik, []); byCik.get(r.cik).push(r); }
  const cross = {}, over = { rows: 0, guarded: 0 }, last = obs.rankDates.at(-1), lastList = [];
  let n = 0, guarded = 0;
  for (const [cik, list] of byCik) {
    const versions = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(docsDir, cik + '.json.gz')))).versions;
    for (const r of list) {
      const v = docAt(versions, r.t), cutoff = new Date(Date.parse(r.t + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      const g = shareScaleSuspect({ value: r.s.v, end: r.s.end }, v.doc, cutoff) || r.mc > 8e12; // proposal: guard or absolute bound
      const st = status.get(r.id + '@' + r.t);
      const k = (g ? 'GUARD_WITHHOLDS' : 'GUARD_PASSES') + '|' + st.status + (st.classes.length ? ':' + st.classes.join('+') : '');
      cross[k] = (cross[k] || 0) + 1; n++; if (g) guarded++;
      if (r.mc > 5e12) { over.rows++; if (g) over.guarded++; }
      if (r.t === last && (g || st.status !== 'OK')) lastList.push({ securityId: r.id, guard: g, register: st.status, classes: st.classes, before: +r.mc.toPrecision(4), after: st.after === null ? null : +st.after.toPrecision(4) });
    }
  }
  const doc = { schemaVersion: 'v12-mcap-producer-effect-1.0.0', proposal: 'docs/quant-recovery/v12/mcap/producer-patch-market-cap-1.2.0.diff', population: 'V10 factor panel rows with a V10 market cap (research frame, 2010-01 to 2025-12, 370,389 rows)',
    rows: n, guardWithholds: guarded, guardShare: +(guarded / n).toFixed(5), rowsOver5e12: over, crossTabGuardVsRegister: Object.fromEntries(Object.entries(cross).sort()),
    lastRankDate: { date: last, cases: lastList.sort((a, b) => (a.securityId < b.securityId ? -1 : 1)) },
    note: 'The product computes market cap from the latest share count and the latest close; the research panel uses the same fundamental-inputs selection at each rank date. The last rank date approximates the current product state.' };
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ rows: n, guarded, over, cross }, null, 1));
}
if (require.main === module) main();
module.exports = { shareScaleSuspect, previousShareCounts };
