#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/restore-research-series.mjs

   Private Kopien fuer die Forschung zurueckholen (Teil B2b, Steuerung 21.11.2026).
   Liest alle Sicherungs-Belege docs/data/security-master/series-backup/*.json
   (B2a, je Lauf der Umfangsfolge), holt jede Datei aus R2
   (research-series-long/<Pfad>), prueft sha256 und legt sie unter
   --out/<Pfad> ab. Ein Forschungslauf legt sie so in SEINEN Checkout zurueck
   (--out = Repo-Wurzel des Runners; nie committet): die Loader
   (research-weekly-loader, weekly-real-adapter - per Hash festgenagelt und
   unveraendert) lesen dieselben Bytes am gewohnten Pfad, sourceBytesHash bleibt
   gleich. Vorhandene Dateien werden nie ueberschrieben.
     --overlay: zusaetzlich verweisen <out>/<Verzeichnis>/ auf jede Repo-Datei
       (fuer ein getrenntes Verzeichnis statt des Checkouts).
   Ohne Belege tut der Lauf nichts. Eine Abweichung des Hashes bricht ab.

   node scripts/market/restore-research-series.mjs --out <dir> [--overlay]
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, GUARDED_DIRS } from "./backup-series.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BACKUP_DIR = "docs/data/security-master/series-backup";

/** Juengster gesicherter Stand je Pfad aus allen echten Belegen (Trockenlaeufe zaehlen nie). */
export function backupIndex(root) {
  const dir = join(root, BACKUP_DIR), out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const m = JSON.parse(readFileSync(join(dir, name), "utf8"));
    if (m.schema !== "vu-series-backup-manifest-1" || m.dryRun) continue;
    for (const f of m.files || []) out.set(f.path, { ...f, manifest: name });
  }
  return out;
}

export async function restore(driver, root, out, { overlay = false, log = () => {} } = {}) {
  const idx = backupIndex(root);
  let restored = 0;
  for (const [rel, f] of idx) {
    if (existsSync(join(root, rel))) continue;                         // das Repo fuehrt die Reihe noch
    const bytes = await driver.get(f.key);
    if (!bytes || sha256(Buffer.from(bytes)) !== f.sha256) throw new Error("SERIES_RESTORE_HASH_MISMATCH:" + rel);
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), Buffer.from(bytes));
    restored++; log(`  zurueck: ${rel}`);
  }
  if (overlay) for (const d of GUARDED_DIRS) {
    const src = join(root, d); if (!existsSync(src)) continue;
    mkdirSync(join(out, d), { recursive: true });
    for (const n of readdirSync(src)) if (!existsSync(join(out, d, n))) symlinkSync(join(src, n), join(out, d, n));
  }
  return { indexed: idx.size, restored };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = arg("--root") || DEFAULT_ROOT, out = arg("--out");
  if (!out) throw new Error("Aufruf: --out <dir> [--overlay]");
  mkdirSync(out, { recursive: true });
  const idx = backupIndex(root);
  const need = [...idx.keys()].filter((rel) => !existsSync(join(root, rel)));
  let driver = { get: async () => { throw new Error("kein Speicherzugang"); } };
  if (need.length) { const { createS3DriverFromEnv } = await import("./storage/s3-driver.mjs"); driver = createS3DriverFromEnv(process.env); }
  const r = await restore(driver, root, out, { overlay: argv.includes("--overlay"), log: console.log });
  console.log(`Private Kopien: ${r.restored} zurueckgeholt (${r.indexed} gesichert, ${need.length} fehlen im Repo)${argv.includes("--overlay") ? ", Ueberlagerung angelegt" : ""}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
