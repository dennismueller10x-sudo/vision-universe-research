#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/backup-series.mjs

   Private Sicherung vor dem Loeschen (Teil B2a, Steuerung 21.11.2026).
   Die Umfangsfolge loescht Kursreihen ausserhalb des Produktumfangs. Das
   gilt nur dann nicht als endgueltiges Loeschen, wenn jede geloeschte Datei
   im selben Lauf nachweislich privat gesichert ist:

     1. --plan     welche Dateien in discover-series/ und discover-series-long/
                   die Umfangsfolge loeschen wuerde (dieselbe Umfangsregel wie
                   publish-*-series --prune-only)
     2. Hochladen  je Datei byte-gleich nach R2 unter research-series-long/<Pfad>
                   (privat, nur mit Schluessel, nie ueber Pages)
     3. Lesetest   jede Datei zurueck holen, sha256 gleich, sonst Abbruch
     4. Manifest   sha256 und Groesse je Datei (--out); die Loeschschritte
                   lesen es mit --backup-manifest und loeschen nur, was mit
                   gleichem Hash darin steht (scripts/market/lib/research-series.mjs)

   node scripts/market/backup-series.mjs --plan --out <manifest.json> [--dry-run]
   Ohne Speicherzugang (VU_HISTORY_S3_*) bricht der Lauf ab, sobald es etwas zu sichern gibt.
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadPreviewConfig, resolveScope } from "./preview-scope.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREFIX = "research-series-long/";
export const GUARDED_DIRS = ["quant/data/market/discover-series", "quant/data/market/discover-series-long"];
export const MANIFEST_SCHEMA = "vu-series-backup-manifest-1";
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Dateien, die die Umfangsfolge loeschen wuerde: *.json ausser index.json, deren securityId nicht im Umfang steht. */
export function plannedDeletions(root, scopeIds) {
  const out = [];
  for (const dir of GUARDED_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (name === "index.json" || !name.endsWith(".json")) continue;
      if (!scopeIds.has(name.replace(/\.json$/, ""))) out.push(dir + "/" + name);
    }
  }
  return out;
}

/** Hochladen, zuruecklesen, vergleichen. Wirft beim ersten Unterschied (nichts wird dann geloescht). */
export async function backupFiles(driver, root, rels, { prefix = PREFIX, log = () => {} } = {}) {
  const entries = [];
  for (const rel of rels) {
    const bytes = readFileSync(join(root, rel)), hash = sha256(bytes), key = prefix + rel;
    await driver.put(key, bytes, { contentType: "application/json" });
    const back = await driver.get(key);
    if (!back || sha256(Buffer.from(back)) !== hash) throw new Error("SERIES_BACKUP_READBACK_MISMATCH:" + rel);
    entries.push({ path: rel, key, sha256: hash, bytes: bytes.length });
    log(`  gesichert: ${rel} (${bytes.length} Bytes)`);
  }
  return entries;
}

export function manifest(entries, meta = {}) {
  return { schema: MANIFEST_SCHEMA, prefix: PREFIX, createdAt: new Date().toISOString(), ...meta,
           count: entries.length, files: entries.slice().sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = arg("--root") || DEFAULT_ROOT, out = arg("--out"), dry = argv.includes("--dry-run");
  if (!argv.includes("--plan") || !out) throw new Error("Aufruf: --plan --out <manifest.json> [--dry-run]");
  const scope = resolveScope(root, loadPreviewConfig(root));
  const rels = plannedDeletions(root, new Set(scope.securities.map((s) => s.securityId)));
  console.log(`Zu sichern vor dem Loeschen: ${rels.length} Dateien`);
  let entries = [];
  if (rels.length && !dry) {
    const { createS3DriverFromEnv } = await import("./storage/s3-driver.mjs");
    entries = await backupFiles(createS3DriverFromEnv(process.env), root, rels, { log: console.log });
  } else if (dry) entries = rels.map((rel) => ({ path: rel, key: PREFIX + rel, sha256: sha256(readFileSync(join(root, rel))), bytes: null, dryRun: true }));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest(entries, { runId: process.env.GITHUB_RUN_ID || null, dryRun: dry }), null, 1) + "\n");
  console.log(`Manifest: ${out} (${entries.length} Dateien${dry ? ", Trockenlauf ohne Hochladen" : ", Lesetest bestanden"})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
