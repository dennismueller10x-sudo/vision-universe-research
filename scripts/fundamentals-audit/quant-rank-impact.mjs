#!/usr/bin/env node
// Querschnittsraenge der Quant-Faktor-Rohwerte (quant/engines/fundamental-inputs.js, unveraendert) alt vs. korrigiert:
// Perzentilrang je Rohwert ueber alle Emittenten mit Wert; Spearman-Korrelation und Anzahl Emittenten mit |Rangsprung| > 10 / 25 Punkte.
//   node quant-rank-impact.mjs <old-dir> <new-dir> <out.json> [--cutoff 2026-10-05]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const Inputs = require(path.join(root, "quant/engines/fundamental-inputs.js"));
const [oldDir, newDir, outPath] = process.argv.slice(2);
const cutoff = process.argv.includes("--cutoff") ? process.argv[process.argv.indexOf("--cutoff") + 1] : "2026-10-05";
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const raws = { old: {}, new: {} };
for (const f of fs.readdirSync(newDir).filter((x) => /^CIK\d+\.json$/.test(x))) {
  if (!fs.existsSync(path.join(oldDir, f))) continue;
  for (const [k, dir] of [["old", oldDir], ["new", newDir]]) {
    const r = Inputs.compute(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), cutoff, 1e10);
    for (const [name, v] of Object.entries(r?.raws || {})) if (fin(v)) (raws[k][name] ||= {})[f] = v;
  }
}
function pct(map) {
  const ids = Object.keys(map).sort((a, b) => map[a] - map[b]);
  const out = {}; ids.forEach((id, i) => { out[id] = ids.length > 1 ? (100 * i) / (ids.length - 1) : 50; });
  return out;
}
const result = {};
for (const name of Object.keys({ ...raws.old, ...raws.new }).sort()) {
  const a = raws.old[name] || {}; const b = raws.new[name] || {};
  const pa = pct(a); const pb = pct(b);
  const both = Object.keys(pa).filter((id) => id in pb);
  const n = both.length;
  let d2 = 0; let over10 = 0; let over25 = 0;
  for (const id of both) { const d = pa[id] - pb[id]; d2 += (d / 100 * (n - 1)) ** 2; if (Math.abs(d) > 10) over10 += 1; if (Math.abs(d) > 25) over25 += 1; }
  const spearman = n > 2 ? 1 - (6 * d2) / (n * (n * n - 1)) : null;
  result[name] = { issuersOld: Object.keys(a).length, issuersNew: Object.keys(b).length, both: n, spearman: spearman === null ? null : +spearman.toFixed(5), rankMoveOver10pts: over10, rankMoveOver25pts: over25 };
}
fs.writeFileSync(outPath, JSON.stringify({ schema: "vu-fundamental-quant-rank-impact-1.0.0", cutoff, byRaw: result }, null, 1));
for (const [k, v] of Object.entries(result)) if (v.rankMoveOver10pts || v.issuersOld !== v.issuersNew) console.log(k.padEnd(30), JSON.stringify(v));
