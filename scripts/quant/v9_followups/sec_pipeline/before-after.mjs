#!/usr/bin/env node
/* V9-Folgearbeit SEC-Pipeline: Vorher/Nachher der Korrekturen P1/P2.
 *
 * Vergleicht zwei Konsum-Buendelstaende, die mit ALTEM (origin/main) und NEUEM
 * Code aus DEMSELBEN companyfacts.zip gebaut wurden (scripts/quant/cli.py
 * consumer --out <privat>), und rechnet die veroeffentlichten Werte, die an den
 * Buendeln haengen (Aktienzahl, Boersenwert, Faktor-Rohwerte), mit den
 * Engines des Repos nach: quant/engines/fundamental-inputs.js und
 * quant/engines/market-cap.js, Kurs wie build-factor-evidence.mjs aus den
 * Technical-Buendeln (TECHNICAL_BUNDLE_CLOSE), Stichtag = dataCutoff des
 * veroeffentlichten Datensatzes.
 *
 * Liest das Repository nur. Schreibt nur --out.
 *   node before-after.mjs --old <dir> --new <dir> --out <file.json>
 *        [--new-coverage <json>] [--old-history <dir,...>] [--new-history <dir,...>]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../../..");
const require = createRequire(import.meta.url);
const Inputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));
const MarketCap = require(join(ROOT, "quant/engines/market-cap.js"));

const arg = (name) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : null; };
const OLD = arg("old"), NEW = arg("new"), OUT = arg("out");
if (!OLD || !NEW || !OUT) { console.error("usage: --old <dir> --new <dir> --out <file>"); process.exit(2); }
if (resolve(OUT).startsWith(join(ROOT, "quant/data")) || resolve(OUT).startsWith(join(ROOT, "discover/data"))) {
  console.error("--out darf kein erzeugtes Artefakt sein"); process.exit(2);
}

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const files = (d) => new Set(readdirSync(d).filter((f) => /^CIK\d+\.json$/.test(f)));
const IGNORED = new Set(["generatedAtUtc", "versions"]);   // aendern sich in JEDEM Lauf bzw. mit dem Versionssprung
const strip = (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !IGNORED.has(k)));

/* Veroeffentlichte Datensaetze und Kurse (nur lesen). */
const evidence = new Map();
const closes = new Map();
function shard(dir, ticker) {
  const p = join(ROOT, dir, ticker.slice(0, 2).toUpperCase() + ".json.gz");
  return existsSync(p) ? JSON.parse(gunzipSync(readFileSync(p))) : null;
}
function published(ticker) {
  if (!evidence.has(ticker)) {
    const d = shard("quant/data/product/factor-evidence-v1", ticker);
    evidence.set(ticker, d ? ((d.securities || d)[ticker] || null) : null);
  }
  return evidence.get(ticker);
}
function close(ticker) {
  if (!closes.has(ticker)) {
    const d = shard("quant/data/product/technical-signals-v1", ticker);
    const inst = d && d.schemaVersion === "technical-product-artifact-1.0.0" ? (d.instruments || {})[ticker] : null;
    const c = inst && inst.bars && Array.isArray(inst.bars.close) ? inst.bars.close.at(-1) : null;
    closes.set(ticker, finite(c) && c > 0 ? { close: c, asOf: inst.bars.timestamps.at(-1) } : null);
  }
  return closes.get(ticker);
}

const rowKey = (part, metric, r) => Array.isArray(r) ? `${part}|${metric}|${r[0]}|${r[1]}|${r[2]}` : `${part}|${metric}`;
function rows(b) {
  const out = new Map();
  for (const part of ["annual", "quarterly"]) for (const [m, list] of Object.entries(b[part] || {})) for (const r of list) out.set(rowKey(part, m, r), r);
  for (const [m, t] of Object.entries(b.ttm || {})) out.set(rowKey("ttm", m, null), [null, t.fp, t.end, t.v, t.filed, t.accn, t.derived ? 1 : 0]);
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function values(doc, ticker) {
  const rec = published(ticker);
  const cutoff = rec?.dataCutoff || doc.asOf;
  const base = Inputs.compute(doc, cutoff, null);
  if (!base) return null;
  const q = close(ticker);
  const concept = doc.ttm?.shares_outstanding?.concept || null;
  const attributable = !(rec && rec.marketCapReason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING");
  const ok = base.shares && q && attributable && (!concept || MarketCap.OUTSTANDING_CONCEPTS.includes(concept)) && MarketCap.sameCurrencyAsListing(doc.units);
  const marketCap = ok ? base.shares.value * q.close : null;
  const full = Inputs.compute(doc, cutoff, marketCap);
  return { cutoff, close: q?.close ?? null, shares: base.shares ? { v: base.shares.value, end: base.shares.end } : null,
    marketCap, referenceEnd: full.referenceEnd, raws: full.raws,
    latestAnnual: doc.coverage?.latestAnnual || null, latestQuarter: doc.coverage?.latestQuarter || null };
}
const round = (x) => (finite(x) ? (Math.abs(x) >= 1e6 ? Math.round(x) : Number(x.toPrecision(6))) : x ?? null);
function rawDiff(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[k] ?? null, y = b?.[k] ?? null;
    if (finite(x) && finite(y) ? Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)) : x !== y) out[k] = [round(x), round(y)];
  }
  return out;
}

const oldFiles = files(OLD), newFiles = files(NEW);
const all = [...new Set([...oldFiles, ...newFiles])].sort();
const issuers = [];
const totals = { bundlesOld: oldFiles.size, bundlesNew: newFiles.size, contentChanged: 0, dataChanged: 0, qualityBlockOnly: 0, onlyOld: 0, onlyNew: 0,
  labelChanged: 0, rowsRemoved: 0, rowsAdded: 0, rowsChanged: 0, sharesChanged: 0, marketCapChanged: 0, rawsChanged: 0,
  latestAnnualChanged: 0, latestQuarterChanged: 0, qualityImplausibleFilingFy: 0, qualityFuturePeriodEnd: 0 };
for (const f of all) {
  if (!newFiles.has(f)) { totals.onlyOld++; issuers.push({ file: f, onlyIn: "old" }); continue; }
  if (!oldFiles.has(f)) { totals.onlyNew++; issuers.push({ file: f, onlyIn: "new" }); continue; }
  const a = readJSON(join(OLD, f)), b = readJSON(join(NEW, f));
  const q = b.quality || {};
  if (q.implausibleFilingFy) totals.qualityImplausibleFilingFy++;
  if (q.futurePeriodEnd) totals.qualityFuturePeriodEnd++;
  if (same(strip(a), strip(b))) continue;
  totals.contentChanged++;
  const { quality: _qa, ...dataA } = strip(a), { quality: _qb, ...dataB } = strip(b);
  if (same(dataA, dataB)) {
    totals.qualityBlockOnly++;
    issuers.push({ cik: b.cik, tickers: b.tickers, qualityBlockOnly: true, quality: b.quality || null });
    continue;
  }
  totals.dataChanged++;
  const ra = rows(a), rb = rows(b);
  const removed = [], added = [], changed = [];
  for (const [k, r] of ra) { if (!rb.has(k)) removed.push(k + " = " + r[3]); else if (!same(r, rb.get(k))) changed.push(k + ": " + r[3] + " -> " + rb.get(k)[3] + " (" + r[2] + " -> " + rb.get(k)[2] + ")"); }
  for (const [k, r] of rb) if (!ra.has(k)) added.push(k + " = " + r[3]);
  const yearsA = a.coverage?.annualYears || [], yearsB = b.coverage?.annualYears || [];
  const row = { cik: b.cik, tickers: b.tickers, quality: b.quality || null,
    annualYears: same(yearsA, yearsB) ? undefined : { before: yearsA, after: yearsB },
    latestAnnual: same(a.coverage?.latestAnnual, b.coverage?.latestAnnual) ? undefined : { before: a.coverage?.latestAnnual, after: b.coverage?.latestAnnual },
    latestQuarter: same(a.coverage?.latestQuarter, b.coverage?.latestQuarter) ? undefined : { before: a.coverage?.latestQuarter, after: b.coverage?.latestQuarter },
    rows: { removed: removed.length, added: added.length, changed: changed.length,
      sample: [...removed.slice(0, 3).map((x) => "- " + x), ...added.slice(0, 3).map((x) => "+ " + x), ...changed.slice(0, 3).map((x) => "~ " + x)] } };
  if (row.annualYears) totals.labelChanged++;
  if (row.latestAnnual) totals.latestAnnualChanged++;
  if (row.latestQuarter) totals.latestQuarterChanged++;
  totals.rowsRemoved += removed.length; totals.rowsAdded += added.length; totals.rowsChanged += changed.length;
  const ticker = (b.tickers || [])[0];
  if (ticker) {
    const va = values(a, ticker), vb = values(b, ticker);
    if (va && vb) {
      const raws = rawDiff(va.raws, vb.raws);
      const rec = published(ticker);
      row.publishedFacing = { ticker, cutoff: vb.cutoff, close: vb.close,
        publishedNow: rec ? { marketCap: rec.marketCap ?? null, marketCapReason: rec.marketCapReason ?? null } : null,
        shares: same(va.shares, vb.shares) ? { unchanged: va.shares } : { before: va.shares, after: vb.shares },
        marketCap: va.marketCap === vb.marketCap ? { unchanged: round(va.marketCap) } : { before: round(va.marketCap), after: round(vb.marketCap) },
        referenceEnd: va.referenceEnd === vb.referenceEnd ? undefined : { before: va.referenceEnd, after: vb.referenceEnd },
        rawsChanged: raws };
      if (!same(va.shares, vb.shares)) totals.sharesChanged++;
      if (va.marketCap !== vb.marketCap) totals.marketCapChanged++;
      if (Object.keys(raws).length) totals.rawsChanged++;
    }
  }
  issuers.push(row);
}

/* Aeltere Geschaeftsjahre (consumer-history-Scherben): je CIK vergleichen. */
function histories(dirs) {
  const out = new Map();
  for (const d of (dirs || "").split(",").filter(Boolean)) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((n) => /^\d\d\.json\.gz$/.test(n))) {
      const doc = JSON.parse(gunzipSync(readFileSync(join(d, f))));
      for (const [cik, h] of Object.entries(doc.issuers || {})) out.set(cik, h);
    }
  }
  return out;
}
const histOld = histories(arg("old-history")), histNew = histories(arg("new-history"));
const historyChanged = [];
for (const cik of new Set([...histOld.keys(), ...histNew.keys()])) {
  const a = histOld.get(cik), b = histNew.get(cik);
  const sa = a ? strip(a) : null, sb = b ? strip(b) : null;
  if (!same(sa, sb)) historyChanged.push({ cik, yearsBefore: a?.coverage?.annualYears ?? null, yearsAfter: b?.coverage?.annualYears ?? null });
}
totals.historyIssuersOld = histOld.size;
totals.historyIssuersNew = histNew.size;
totals.historyChanged = historyChanged.length;

const cov = (p) => (p && existsSync(p) ? readJSON(p).secQuality ?? null : null);
const report = {
  schemaVersion: "v9-followup-sec-pipeline-before-after-1.0.0",
  generatedBy: "scripts/quant/v9_followups/sec_pipeline/before-after.mjs",
  codeSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  productionApproved: false,
  engines: { fundamentalInputs: Inputs.VERSION, marketCap: MarketCap.VERSION },
  comparison: "same companyfacts.zip, old = origin/main SEC code, new = this branch; ignored fields: generatedAtUtc, versions",
  totals,
  secQualityNew: cov(arg("new-coverage")),
  issuers,
  historyChanged: historyChanged.sort((x, y) => x.cik.localeCompare(y.cik)),
};
writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(totals));
