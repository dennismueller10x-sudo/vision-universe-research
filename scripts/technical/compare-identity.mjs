#!/usr/bin/env node
/* Identitaetspruefung: eine neue Build-Ausgabe gegen die veroeffentlichten Shards.
   Erlaubt verschieden sind NUR die Explore-Felder (projection.explore*, exploreCandidates), der Lebenszyklus, die Beziehungsliste
   und die Versionsnummer der Projektion. Alles andere (Primaer, Alternativen, Motiv-Alternative, Hochpotenzial, Formeln,
   Leitplanken, Kontext, Nachweise, pro.elliott) muss byte-gleich sein.
   Aufruf: node scripts/technical/compare-identity.mjs --new DIR [--old DIR] */
import { readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
const NEW = arg("new"), OLD = arg("old", join(ROOT, "quant/data/technical-intelligence/v3"));
if (!NEW) { console.error("--new DIR fehlt"); process.exit(2); }
const read = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));
const ALLOWED_PROJ = (k) => /^explore/.test(k) || k === "lifecycle" || k === "relations" || k === "version";
const canon = (v) => JSON.stringify(v);
function diffKeys(o, n) {
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]), bad = [];
  for (const k of keys) {
    if (k === "exploreCandidates") continue;
    if (k === "projection") {
      const po = o[k] || {}, pn = n[k] || {};
      for (const q of new Set([...Object.keys(po), ...Object.keys(pn)])) if (!ALLOWED_PROJ(q) && canon(po[q]) !== canon(pn[q])) bad.push("projection." + q);
      continue;
    }
    if (canon(o[k]) !== canon(n[k])) bad.push(k);
  }
  return bad;
}
let titles = 0, differing = 0, missing = 0; const byField = {}, examples = [];
for (const f of readdirSync(join(OLD, "shards")).filter((x) => x.endsWith(".json.gz"))) {
  let n; try { n = read(join(NEW, "shards", f)).instruments; } catch { missing++; continue; }
  const o = read(join(OLD, "shards", f)).instruments;
  for (const s of Object.keys(o)) {
    titles++;
    const bad = n[s] ? diffKeys(o[s], n[s]) : ["MISSING_TITLE"];
    if (bad.length) { differing++; bad.forEach((b) => { byField[b] = (byField[b] || 0) + 1; }); if (examples.length < 8) examples.push({ s, bad }); }
  }
}
console.log(JSON.stringify({ titles, missingShards: missing, differing, byField, examples }));
process.exit(differing || missing ? 1 : 0);
