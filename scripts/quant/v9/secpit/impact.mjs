#!/usr/bin/env node
// V9 secpit task 3/6: read-only factor-input comparison of consumer bundles
// (committed vs BASE vs P1/P2/P12 rebuilt in private scratch) through the
// repo's own engines quant/engines/fundamental-inputs.js and
// quant/engines/pit-fundamental-history.js. Writes derived evidence only.
// usage: node impact.mjs <private impact dir> <evidence json>
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../../..");
const require = createRequire(import.meta.url);
const Inputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));
const Pit = require(join(ROOT, "quant/engines/pit-fundamental-history.js"));
const [dir, evidencePath] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(dir, "impact-meta.json")));
const AS_OF = meta.asOf;
const PIT_DATES = ["2016-06-30", "2018-06-30", "2019-06-30", "2020-06-30", "2021-06-30", "2022-06-30", "2023-06-30", "2024-06-30", "2025-06-30", AS_OF];
const VARIANTS = ["BASE", "P1", "P2", "P12"];

function load(p) { return existsSync(p) ? JSON.parse(readFileSync(p)) : null; }
function snap(doc) {
  if (!doc) return null;
  const r = Inputs.compute(doc, AS_OF, null);
  const pit = {};
  for (const d of PIT_DATES) pit[d] = Pit.featuresAt ? Pit.featuresAt(doc, d) : null;
  return { raws: r.raws, shares: r.shares ? { v: r.shares.value, end: r.shares.end } : null,
    referenceEnd: r.referenceEnd, availableAt: r.availableAt, pit,
    latestQuarter: doc.coverage && doc.coverage.latestQuarter, latestAnnual: doc.coverage && doc.coverage.latestAnnual,
    annualYears: doc.coverage && doc.coverage.annualYears };
}
const num = (a, b) => (a === b) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
function diffObj(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    if (x === undefined && y === undefined) continue;
    if (typeof x === "object" || typeof y === "object") { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(k); }
    else if (!num(x ?? null, y ?? null)) out.push(k);
  }
  return out.sort();
}
function compare(a, b) {
  if (!a || !b) return { comparable: false };
  const raws = diffObj(a.raws, b.raws);
  const pit = {};
  for (const d of PIT_DATES) { const k = diffObj(a.pit[d], b.pit[d]); if (k.length) pit[d] = k; }
  return { comparable: true, rawsChanged: raws, sharesChanged: JSON.stringify(a.shares) !== JSON.stringify(b.shares),
    referenceEndChanged: a.referenceEnd !== b.referenceEnd, pitDatesChanged: pit,
    latestQuarterChanged: JSON.stringify(a.latestQuarter) !== JSON.stringify(b.latestQuarter) };
}
// published product records (read-only)
function productRecord(ticker) {
  if (!ticker) return null;
  const p = join(ROOT, "quant/data/product/factor-evidence-v1", ticker.slice(0, 2).toUpperCase() + ".json.gz");
  if (!existsSync(p)) return null;
  const d = JSON.parse(gunzipSync(readFileSync(p)));
  const rec = (d.securities || d)[ticker];
  return rec ? { marketCap: rec.marketCap ?? null, marketCapReason: rec.marketCapReason ?? null,
    fundamentalsAsOf: rec.fundamentalsAsOf ?? null, fundamentalsAvailableAt: rec.fundamentalsAvailableAt ?? null } : null;
}
const rows = [];
const tally = {};
for (const [cik, reasons] of Object.entries(meta.affected)) {
  const committedDoc = load(join(ROOT, "quant/data/sec/consumer", `CIK${cik}.json`));
  const snaps = { COMMITTED: snap(committedDoc) };
  for (const v of VARIANTS) snaps[v] = snap(load(join(dir, v, `CIK${cik}.json`)));
  const row = { cik, tickers: committedDoc ? committedDoc.tickers : null, reasons,
    committedVsBase: compare(snaps.COMMITTED, snaps.BASE),
    baseVs: Object.fromEntries(["P1", "P2", "P12"].map(v => [v, compare(snaps.BASE, snaps[v])])) };
  const changed = (c) => c.comparable && (c.rawsChanged.length || c.sharesChanged || c.referenceEndChanged || Object.keys(c.pitDatesChanged).length || c.latestQuarterChanged);
  for (const v of ["P1", "P2", "P12"]) {
    if (changed(row.baseVs[v])) {
      row.changed = row.changed || {};
      row.changed[v] = true;
      row.before = row.before || { shares: snaps.BASE.shares, referenceEnd: snaps.BASE.referenceEnd, latestQuarter: snaps.BASE.latestQuarter };
      row["after" + v] = { shares: snaps[v].shares, referenceEnd: snaps[v].referenceEnd, latestQuarter: snaps[v].latestQuarter };
    }
    tally[v] = tally[v] || { ciksChanged: 0, rawsChanged: 0, sharesChanged: 0, referenceEndChanged: 0, pitChanged: 0, latestQuarterChanged: 0 };
    const c = row.baseVs[v];
    if (!c.comparable) continue;
    if (changed(c)) tally[v].ciksChanged++;
    if (c.rawsChanged.length) tally[v].rawsChanged++;
    if (c.sharesChanged) tally[v].sharesChanged++;
    if (c.referenceEndChanged) tally[v].referenceEndChanged++;
    if (Object.keys(c.pitDatesChanged).length) tally[v].pitChanged++;
    if (c.latestQuarterChanged) tally[v].latestQuarterChanged++;
  }
  if (row.changed && row.tickers) row.published = productRecord(row.tickers[0]);
  if (row.changed && row.baseVs.P12.comparable) {
    row.rawsBeforeAfterP12 = Object.fromEntries(row.baseVs.P12.rawsChanged.map(k => [k, [snaps.BASE.raws[k] ?? null, snaps.P12.raws[k] ?? null]]));
  }
  rows.push(row);
}
const cvb = rows.map(r => r.committedVsBase).filter(c => c.comparable);
const report = {
  schemaVersion: "v9-secpit-factor-impact-1.0.0",
  codeSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  engines: { fundamentalInputs: Inputs.VERSION, pitHistory: "quant/engines/pit-fundamental-history.js" },
  asOf: AS_OF, pitDates: PIT_DATES, affectedCiks: rows.length,
  committedVsRebuiltBase: { comparable: cvb.length,
    identicalInputs: cvb.filter(c => !c.rawsChanged.length && !c.sharesChanged && !c.referenceEndChanged && !Object.keys(c.pitDatesChanged).length).length,
    note: "rebuilt BASE omits FSDS supplement and issuer extensions and uses today's bulk vintage; differences are vintage/supplement effects, not patch effects" },
  variantEffectVsBase: tally,
  rows: rows.filter(r => r.changed),
  unchangedCiks: rows.filter(r => !r.changed).map(r => r.cik),
  productionApproved: false,
};
writeFileSync(evidencePath, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ affected: rows.length, committedVsRebuiltBase: report.committedVsRebuiltBase, variantEffectVsBase: tally }, null, 1));
