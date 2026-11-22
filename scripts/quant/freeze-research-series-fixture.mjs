#!/usr/bin/env node
// Friert die Kursreihen ein, die eine Bereinigung aus dem Repo nimmt (Teil B2c, Steuerung 21.11.2026): byte-gleiche Kopien
// nach quant/tests/fixtures/research-series/<Pfad>, damit Forschungs-Tests (V10-Population, Elliott M11-P6, Backtests) nach
// B3 dieselben Bytes lesen (scripts/quant/lib/data-fixture.mjs#researchSeriesRoot). Vorhandene Kopien bleiben unveraendert.
//   node scripts/quant/freeze-research-series-fixture.mjs --cleanup docs/data/security-master/<freigabe>.json
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { REPO, RESEARCH_SERIES_FIXTURE } from "./lib/data-fixture.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const cleanup = arg("--cleanup");
if (!cleanup) throw Error("--cleanup <Freigabeliste> angeben");
const doc = JSON.parse(readFileSync(join(REPO, cleanup), "utf8"));
const ids = [...new Set((doc.leave || []).map((x) => x.securityId))].sort();
let neu = 0, da = 0;
for (const id of ids) for (const d of ["quant/data/market/discover-series", "quant/data/market/discover-series-long"]) {
  const src = join(REPO, d, id + ".json"), dst = join(REPO, RESEARCH_SERIES_FIXTURE, d, id + ".json");
  if (!existsSync(src)) continue;
  if (existsSync(dst)) { da++; continue; }
  mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); neu++;
}
console.log(JSON.stringify({ cleanup, titles: ids.length, copied: neu, kept: da }));
