/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-sec-rr.mjs   (vorsorge-rr-1.0.0)

   KOSTENQUOTEN US-REGISTRIERTER ETFs AUS DEN PROSPEKTEN (SEC DERA
   "Mutual Fund Prospectus Risk/Return Summary Data Sets", XBRL, gemeinfrei)

   Je Anteilklasse (classId -> Ticker ueber company_tickers_mf.json):
     ExpensesOverAssets        Gesamtkostenquote laut Gebuehrentabelle (brutto)  -> expenseRatio
     NetExpensesOverAssets     nach Gebuehrenverzicht (falls gemeldet)           -> netExpenseRatio
     ManagementFeesOverAssets  Verwaltungsgebuehr                                -> managementFee
   Werte sind Dezimalbrueche (0.0003 = 0,03 %). Es gewinnt der zuletzt
   eingereichte Prospekt je Klasse und Kennzahl.

   Die Spaltennamen werden aus der Kopfzeile gelesen; fehlt eine erwartete
   Spalte, bricht der Lauf mit der gefundenen Kopfzeile ab (kein Raten).

   Ausgabe: vorsorge/data/sources/sec-rr-costs.json
   GitHub Actions, Marker [vorsorge-fundamentals].
   ========================================================================= */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORK = join(root, ".market-cache/vorsorge/rr");
const UA = process.env.SEC_USER_AGENT || "VisionUniverseResearch info@visionuniverse.de";
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const MAXQ = Number(arg("--max-quarters", "6"));
mkdirSync(WORK, { recursive: true });
const TAGS = { ExpensesOverAssets: "expenseRatio", NetExpensesOverAssets: "netExpenseRatio", ManagementFeesOverAssets: "managementFee" };

async function get(url) {
  for (let a = 1; a <= 4; a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(900000) }); if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 3000 * a)); continue; } return r; }
    catch (e) { if (a === 4) throw e; await new Promise((z) => setTimeout(z, 3000 * a)); }
  }
}
function members(zip) { return new Promise((res, rej) => { const p = spawn("unzip", ["-Z1", zip]); let o = ""; p.stdout.on("data", (d) => (o += d)); p.on("close", (c) => (c === 0 ? res(o.split("\n").filter(Boolean)) : rej(new Error("unzip " + c)))); }); }
function stream(zip, member, onRow) {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-p", zip, member]); const rl = createInterface({ input: p.stdout, crlfDelay: Infinity }); let head = null, n = 0;
    rl.on("line", (l) => { if (!head) { head = l.replace(/^﻿/, "").split("\t").map((h) => h.trim().toLowerCase()); return; } if (!l) return; const c = l.split("\t"); const o = {}; head.forEach((h, i) => (o[h] = c[i] === "" ? null : c[i])); n++; onRow(o, head); });
    rl.on("close", () => resolve({ head, n })); p.on("error", reject);
  });
}

const mfRes = await get("https://www.sec.gov/files/company_tickers_mf.json");
const mf = await mfRes.json(); const fi = Object.fromEntries(mf.fields.map((f, i) => [f, i]));
const inIndex = new Set();
for (const f of ["etf-index.json", "etf-index-extra.json"]) { const p = join(root, "vorsorge/data", f); if (existsSync(p)) { const j = JSON.parse(readFileSync(p, "utf8")); const si = j.fields.indexOf("symbol"); j.rows.forEach((r) => inIndex.add(r[si])); } }
const classToSymbol = new Map(mf.data.filter((r) => inIndex.has(String(r[fi.symbol]).toUpperCase())).map((r) => [r[fi.classId], String(r[fi.symbol]).toUpperCase()]));
console.log("Klassen mit Vorsorge-Ticker:", classToSymbol.size);
const page = await (await get("https://www.sec.gov/data-research/sec-markets-data/mutual-fund-prospectus-riskreturn-summary-data-sets")).text();
const links = [...new Set(page.match(/\/files\/dera\/data\/mutual-fund-prospectus-risk\/return-summary-data-sets\/[0-9]{4}q[1-4]_rr1\.zip/g) || [])].sort().reverse().slice(0, MAXQ);
console.log("RR-Datasets:", links.join(", "));
const best = new Map();   // classId|field -> { value, filed, adsh, ddate }
const report = { schemaVersion: "vu-sec-rr-costs-1.0.0", source: "SEC DERA Mutual Fund Prospectus Risk/Return Summary Data Sets", license: "U.S. government work, public domain",
  datasets: [], headers: {} };
for (const l of links) {
  const zip = join(WORK, l.split("/").pop());
  if (!existsSync(zip)) await pipeline(Readable.fromWeb((await get("https://www.sec.gov" + l)).body), createWriteStream(zip));
  const mem = await members(zip);
  const find = (n) => mem.find((m) => m.toLowerCase().replace(/^.*\//, "") === n);
  const subF = find("sub.tsv") || find("sub.txt"), numF = find("num.tsv") || find("num.txt");
  if (!subF || !numF) throw new Error("Unerwarteter Aufbau " + l + ": " + mem.join(", "));
  const filed = new Map();
  const s = await stream(zip, subF, (r) => filed.set(r.adsh, r.filed || r.accepted || null));
  let hits = 0, colsOk = null, tagRows = 0; const samples = [];
  const n = await stream(zip, numF, (r, head) => {
    if (colsOk === null) { colsOk = ["adsh", "tag", "value"].every((k) => head.includes(k)) && (head.includes("class") || head.includes("dimh") || head.includes("segments")); report.headers.num = head; report.headers.sub = s.head; }
    const field = TAGS[r.tag]; if (!field) return;
    tagRows++;
    const cls = r.class || (String(r.otherdims || r.segments || "").match(/C\d{9}/) || [])[0] || null;
    if (samples.length < 4) samples.push({ tag: r.tag, series: r.series, class: r.class, otherdims: r.otherdims, value: r.value, measure: r.measure });
    if (!cls || !classToSymbol.has(cls)) return;
    const v = Number(r.value); if (!Number.isFinite(v) || v < 0 || v >= 0.1) return;
    // Alle Werte einer Klasse muessen aus DERSELBEN Einreichung stammen (sonst Netto aus altem, Brutto aus neuem Prospekt).
    const f = filed.get(r.adsh) || "";
    let byFiling = best.get(cls); if (!byFiling) best.set(cls, (byFiling = new Map()));
    const key = f + "|" + r.adsh; let rec = byFiling.get(key); if (!rec) byFiling.set(key, (rec = { filed: f, adsh: r.adsh, fields: {} }));
    const cur = rec.fields[field];
    if (!cur || String(r.ddate || "") > String(cur.ddate || "")) rec.fields[field] = { value: v, ddate: r.ddate || null };
    hits++;
  });
  if (!colsOk) throw new Error("num.tsv ohne erwartete Spalten (adsh, tag, value, class): " + JSON.stringify(report.headers.num));
  report.datasets.push({ file: l, submissions: s.n, numRows: n.n, tagRows, hits, samples });
  console.log(" ", l.split("/").pop(), s.n, "Einreichungen,", n.n, "Werte,", hits, "Treffer");
  rmSync(zip, { force: true });
}
const bySymbol = {};
for (const [cls, byFiling] of best) {
  const latest = [...byFiling.values()].sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : a.adsh < b.adsh ? 1 : -1))[0];
  if (!latest) continue;
  const sym = classToSymbol.get(cls);
  const filed = latest.filed && /^\d{8}$/.test(latest.filed) ? latest.filed.slice(0, 4) + "-" + latest.filed.slice(4, 6) + "-" + latest.filed.slice(6, 8) : latest.filed || null;
  const o = bySymbol[sym] = { classId: cls, filed, accession: latest.adsh };
  for (const [field, v] of Object.entries(latest.fields)) o[field] = { value: Math.round(v.value * 1e7) / 1e7, filed, accession: latest.adsh };
  // Netto ueber Brutto waere widerspruechlich -> Nettowert verwerfen
  if (o.netExpenseRatio && o.expenseRatio && o.netExpenseRatio.value > o.expenseRatio.value + 1e-9) { delete o.netExpenseRatio; o.note = "NET_ABOVE_GROSS_DROPPED"; }
}
report.count = Object.keys(bySymbol).length;
report.bySymbol = Object.fromEntries(Object.keys(bySymbol).sort().map((k) => [k, bySymbol[k]]));
mkdirSync(join(root, "vorsorge/data/sources"), { recursive: true });
writeFileSync(join(root, "vorsorge/data/sources/sec-rr-costs.json"), JSON.stringify(report));
console.log("Kostenquoten fuer", report.count, "Ticker");
for (const d of report.datasets) console.log(" ", d.file.split("/").pop(), "Tag-Zeilen", d.tagRows, "Treffer", d.hits, JSON.stringify(d.samples).slice(0, 400));
