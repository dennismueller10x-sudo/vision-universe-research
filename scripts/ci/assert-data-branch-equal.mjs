/* Gleichheitsnachweis fuer DUAL_WRITE: nach push-data-branch.sh muss der Datenzweig dieselben Dateien mit demselben
   Inhalt tragen wie der Arbeitsbaum (main). Bricht mit Exit 1 ab und nennt die Unterschiede.
   Aufruf: node scripts/ci/assert-data-branch-equal.mjs <branch> <pfad>...   (aus dem Repository-Wurzelverzeichnis)
   Der Vergleich selbst (vergleiche) ist rein und im Test geprueft (core/tests/data-branch-pilot.test.mjs, DB-18). */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function dateien(root, p, out = new Map()) {
  const abs = join(root, p);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isDirectory()) {
    for (const n of readdirSync(abs).sort()) dateien(root, join(p, n), out);
  } else out.set(p, createHash("sha256").update(readFileSync(abs)).digest("hex"));
  return out;
}

/** Vergleicht je Pfad Dateimenge und Inhalt. Liefert { ok, files, differences[] }. */
export function vergleiche(rootA, rootB, pfade) {
  const differences = []; let files = 0;
  for (const p of pfade) {
    const a = dateien(rootA, p.replace(/\/$/, "")), b = dateien(rootB, p.replace(/\/$/, ""));
    files += a.size;
    if (a.size === 0) differences.push({ pfad: p, art: "LEER_IM_ARBEITSBAUM" });
    for (const [k, h] of a) {
      if (!b.has(k)) differences.push({ pfad: k, art: "FEHLT_IM_ZWEIG" });
      else if (b.get(k) !== h) differences.push({ pfad: k, art: "INHALT_ANDERS" });
    }
    for (const k of b.keys()) if (!a.has(k)) differences.push({ pfad: k, art: "NUR_IM_ZWEIG" });
  }
  return { ok: differences.length === 0, files, differences };
}

function main(argv) {
  const [branch, ...pfade] = argv;
  if (!branch || pfade.length === 0) throw Error("Aufruf: <branch> <pfad>...");
  const D = mkdtempSync(join(tmpdir(), "db-equal-"));
  try {
    execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", `refs/heads/${branch}`], { stdio: "inherit" });
    const tar = execFileSync("git", ["archive", "FETCH_HEAD", "--", ...pfade.map((p) => p.replace(/\/$/, ""))], { maxBuffer: 1024 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", D], { input: tar });
    const r = vergleiche(resolve("."), D, pfade);
    console.log(`[datenzweig-gleich] ${r.files} Dateien im Arbeitsbaum, ${r.differences.length} Unterschiede`);
    for (const d of r.differences.slice(0, 20)) console.log(`  ${d.art} ${d.pfad}`);
    return r.ok ? 0 : 1;
  } finally { rmSync(D, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
