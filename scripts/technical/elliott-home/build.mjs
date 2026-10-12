#!/usr/bin/env node
/* Schreibt den Elliott-Home-Index (elliott-home-1.0.0) aus den veroeffentlichten Technical-Intelligence-Daten.
   Die Auslieferung (scripts/vu2/build-release.mjs) ruft dieselbe Funktion auf; dieses Skript dient der lokalen Entwicklung und Pruefung.
   Es schreibt nie in ein committetes Artefakt: ohne --out wird nichts geschrieben.
     node scripts/technical/elliott-home/build.mjs --out /tmp/elliott-home.json */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHomeFromDir } from "./home.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../../..");
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const home = buildHomeFromDir(root);
if (out) writeFileSync(out, JSON.stringify(home));
console.log(JSON.stringify({ version: home.version, dataAsOf: home.dataAsOf, summary: home.summary, rows: home.rows.map((r) => r.id + ":" + r.total), out }, null, 2));
