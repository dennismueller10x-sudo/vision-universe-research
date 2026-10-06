#!/usr/bin/env node
/* Mission VIII CI: nur aggregierte, kursfreie Kennzahlen aus einem runner-privaten Replay veroeffentlichen.
     --replay DIR --label NAME --out DIR [--survivorship FILE]   Manifest-Auszug (Siegel, Zaehler, Jahre)
     --check DIR                                                 bricht ab, wenn ein Artefakt Kursfelder traegt */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const check = arg("check", null);
if (check) {
  const bad = [];
  /* rekursiv, alle Dateien; Schluessel, die Kurse oder Kursniveaus tragen koennen (Review LOW) */
  const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(join(d, x.name)) : [join(d, x.name)])) : []);
  for (const f of walk(check)) {
    const t = readFileSync(f, "utf8");
    if (/"(px|close|open|high|low|price|atr|points|bars|inv|t1|t2|e|rng|c|w0|zoneLow|zoneHigh|entryLow|entryHigh|invalidation)"\s*:/.test(t)) bad.push(f);
  }
  if (bad.length) { console.error("Kursfelder in veroeffentlichten Artefakten: " + bad.join(", ")); process.exit(1); }
  console.log("[publish-ci] Hygiene ok");
  process.exit(0);
}
const dir = arg("replay"), label = arg("label"), out = arg("out");
const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const byYear = {}, symByYear = {}, coh = {};
for (const sh of man.shards) for (const line of gunzipSync(readFileSync(join(dir, sh.file))).toString("utf8").split("\n")) {
  if (!line) continue; const r = JSON.parse(line); if (!r.dp) continue;
  const y = r.d.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; (symByYear[y] = symByYear[y] || new Set()).add(r.s); coh[r.c] = (coh[r.c] || 0) + 1;
}
let surv = null;
const sf = arg("survivorship", null);
if (sf && existsSync(sf)) { const s = JSON.parse(readFileSync(sf, "utf8")); surv = { asOf: s.asOf, delisted: s.delisted ? { ...s.delisted, rows: undefined } : null, historicalSecurityMasterCoverage: s.historicalSecurityMasterCoverage || null }; }
const res = { schemaVersion: "hsab-ci-stage1-1.0.0", label, generatedAt: new Date().toISOString(), sealHash: man.sealHash, commit: man.commit, engine: man.engine, replayVersion: man.replayVersion,
  opts: man.opts, sampleSymbols: man.sampleSymbols, symbols: man.symbols, counts: man.counts, errors: man.errors.length, seconds: man.seconds, delisted: man.delisted,
  persistenceCheck: man.persistenceCheck ? { ...man.persistenceCheck, rows: undefined } : null, analysisPointsByYear: byYear,
  symbolsByYear: Object.fromEntries(Object.entries(symByYear).sort().map(([k, v]) => [k, v.size])), analysisPointsByCohort: coh, survivorship: surv };
mkdirSync(out, { recursive: true });
writeFileSync(join(out, label + "-stage1.json"), JSON.stringify(res, null, 1));
console.log("[publish-ci] " + label + ": " + man.counts.records + " Records, Siegel " + man.sealHash.slice(0, 16));
