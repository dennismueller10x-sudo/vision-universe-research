#!/usr/bin/env node
/* Produkt-Regression der Migration Elliott 2.2 → 3.x (Mission III §38–§39, §90).
   Vergleicht zwei veroeffentlichte Datenstaende (index.json.gz + Shards) Titel fuer Titel:
     Elliott: Muster/Welle, Anwendbarkeit, Enthaltung, Grad-Hinweis, Mehrdeutigkeit
     Szenario: Ausblick, Struktur, Vorlage, Einstiegszone, Ungueltig-Linie, Zielzone 1
   und gruppiert nach repraesentativen Segmenten: Large Cap (Indexmitglied), volatile Technologie (Nasdaq-100, Volatilitaet
   erhoeht/extrem), defensiv (S&P 500, Volatilitaet ruhig), Small/Nicht-Index, verrauscht (Volatilitaet extrem), Trend, seitwaerts.
   Aufruf: node scripts/technical/ti-product-regression.mjs --before DIR --after DIR [--out FILE] */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { ROOT } from "./lib/ti-data.mjs";
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const B = arg("before"), A = arg("after", join(ROOT, "quant/data/technical-intelligence/v3")), OUT = arg("out", join(ROOT, "quant/data/technical-intelligence/elliott-validation/product-regression-v22-to-v32.json"));
const idx = (d) => JSON.parse(gunzipSync(readFileSync(join(d, "index.json.gz"))).toString()).rows;
const shardCache = {};
const shard = (d, t) => { const k = (String(t).toUpperCase() + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_"), key = d + k; if (!(key in shardCache)) { const f = join(d, "shards", k + ".json.gz"); shardCache[key] = existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString()).instruments : {}; } return shardCache[key][t] || null; };
const before = Object.fromEntries(idx(B).map((r) => [r.t, r])), after = Object.fromEntries(idx(A).map((r) => [r.t, r]));
const both = Object.keys(after).filter((t) => before[t]);
const seg = (r) => {
  const s = [], ix = r.indexes || [];
  if (ix.length) s.push("LARGE_CAP"); else s.push("SMALL_OR_NON_INDEX");
  if (ix.includes("NDX") && (r.vol === "ELEVATED" || r.vol === "EXTREME")) s.push("VOLATILE_TECH");
  if (ix.includes("SP500") && r.vol === "COMPRESSED") s.push("DEFENSIVE");
  if (r.vol === "EXTREME") s.push("NOISY");
  if (r.structure === "UPTREND_ADVANCING" || r.structure === "DOWNTREND_ADVANCING") s.push("TRENDING");
  if (r.structure === "SIDEWAYS_RANGE" || r.structure === "NO_CLEAR_TREND") s.push("SIDEWAYS");
  return s;
};
const eqZ = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
const groups = {}, ALL = "ALL";
const add = (g, k) => { groups[g] = groups[g] || { n: 0 }; groups[g][k] = (groups[g][k] || 0) + 1; };
const dist = { before: {}, after: {} }, eng = { before: {}, after: {} }, samples = [];
for (const t of both) {
  const b = before[t], a = after[t], gs = [ALL].concat(seg(a));
  gs.forEach((g) => { groups[g] = groups[g] || { n: 0 }; groups[g].n++; });
  const ch = {
    elliottCount: (b.elliott || null) !== (a.elliott || null), applicability: (b.elliottApplicable || null) !== (a.elliottApplicable || null),
    outlook: b.outlook !== a.outlook, structure: b.structure !== a.structure, template: b.template !== a.template,
    entry: !eqZ(b.entry, a.entry), invalidation: b.invalidation !== a.invalidation, target1: !eqZ(b.t1, a.t1)
  };
  for (const [k, v] of Object.entries(ch)) if (v) gs.forEach((g) => add(g, k));
  const ab = a.elliottApplicable === "LOW" || a.elliottApplicable === null, bb = b.elliottApplicable === "LOW" || b.elliottApplicable === null;
  gs.forEach((g) => { if (ab) add(g, "abstainAfter"); if (bb) add(g, "abstainBefore"); });
  dist.before[b.elliottApplicable || "NONE"] = (dist.before[b.elliottApplicable || "NONE"] || 0) + 1; dist.after[a.elliottApplicable || "NONE"] = (dist.after[a.elliottApplicable || "NONE"] || 0) + 1;
  if (ch.template || ch.invalidation) samples.push({ t, before: { outlook: b.outlook, template: b.template, inv: b.invalidation, elliott: b.elliott }, after: { outlook: a.outlook, template: a.template, inv: a.invalidation, elliott: a.elliott }, segments: seg(a) });
}
/* Elliott-Version und Mehrdeutigkeit aus einer Stichprobe der Shards */
const sampleT = both.filter((_, i) => i % 25 === 0);
for (const t of sampleT) {
  const pa = shard(A, t), pb = shard(B, t);
  const va = pa && pa.versions ? pa.versions.elliott : pa && pa.pro && pa.pro.elliott ? pa.pro.elliott.engineVersion : null;
  const vb = pb && pb.pro && pb.pro.elliott ? pb.pro.elliott.engineVersion || "elliott-2.2" : null;
  eng.after[va || "none"] = (eng.after[va || "none"] || 0) + 1; eng.before[vb || "none"] = (eng.before[vb || "none"] || 0) + 1;
}
const share = (g) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== "n").map(([k, v]) => [k, +(100 * v / g.n).toFixed(1)]));
const out = { schemaVersion: "vu-ti-product-regression-1.0.0", generatedAt: new Date().toISOString(), before: B, after: A, titles: both.length, onlyBefore: Object.keys(before).filter((t) => !after[t]).length, onlyAfter: Object.keys(after).filter((t) => !before[t]).length,
  applicability: dist, engineVersionsSample: eng, segments: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, { n: v.n, changedSharePct: share(v) }])), samples: samples.slice(0, 40) };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ titles: out.titles, applicability: dist, engineVersionsSample: eng, ALL: out.segments.ALL }, null, 1));
