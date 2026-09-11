/* =========================================================================
   VISION UNIVERSE — push-derived-artefact.mjs

   Abgeleitete Artefakte dauerhaft ablegen - dort, wo auch die Historien
   liegen.

   Die Faktorzeilen aller Titel entstehen bei jedem Lauf und starben
   bisher mit dem Runner: ueber der Detailgrenze legt
   build-market-factors.mjs sie in die Arbeitsablage, und die ist weg,
   sobald der Job endet. In das Repository gehoeren sie nicht - nicht
   wegen ihrer Groesse, sondern weil sie Anbieterinhalt ableiten.

   R2 loest beides: dauerhaft, privat, und unter derselben
   Nullkostenschranke wie die Historien.

   Ausfuehren:
     node scripts/market/push-derived-artefact.mjs \
       --file .market-cache/tiingo/factors/factors-FULL_UNIVERSE.json \
       --key derived/factors/US/FULL_UNIVERSE.json
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));

const argv = process.argv.slice(2);
function arg(n, d = null) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; }
const FILE = arg("--file");
const KEY = arg("--key");
const PREFIX = arg("--prefix", "v1");
const LOCAL_ROOT = arg("--local-root", null);
const DRY_RUN = argv.includes("--dry-run");
const OUT = arg("--report", join(root, "quant", "data", "market", "history", "derived-push.json"));

if (!FILE || !KEY) {
  console.error("--file und --key sind Pflicht.");
  process.exit(2);
}
if (!existsSync(FILE)) {
  console.error("Keine Datei unter " + FILE + ".");
  process.exit(1);
}
/* Der Schluessel darf nicht in den Historienbereich zeigen. Ein
   abgeleitetes Artefakt, das eine Kursreihe ueberschreibt, waere ein
   Datenverlust mit Ansage. */
if (/\/daily\//.test(KEY) || KEY.startsWith("_usage")) {
  console.error("ZERO_COST_GUARD_BLOCKED: '" + KEY + "' zeigt in den Historienbereich.");
  process.exit(3);
}

async function makeDriver() {
  if (LOCAL_ROOT) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return createFsDriver(LOCAL_ROOT);
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return createS3DriverFromEnv();
}

async function main() {
  const raw = readFileSync(FILE);
  const buf = zlib.zstdCompressSync(raw, {
    params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 }
  });
  const sha = createHash("sha256").update(buf).digest("hex");
  const fullKey = PREFIX.replace(/\/+$/, "") + "/" + KEY.replace(/^\/+/, "") + ".zst";

  console.log("Vision Universe — abgeleitetes Artefakt ablegen\n");
  console.log(`  Datei:     ${FILE.replace(root + "/", "")} (${(raw.length / 1048576).toFixed(2)} MB)`);
  console.log(`  Schluessel: ${fullKey}`);
  console.log(`  Gepackt:   ${(buf.length / 1048576).toFixed(2)} MB (${(raw.length / buf.length).toFixed(1)}x)`);

  if (DRY_RUN) { console.log("\n  --dry-run: nichts geschrieben."); return; }

  const driver = await makeDriver();
  /* Schon derselbe Inhalt da? Dann kein Schreibvorgang. */
  const head = await driver.head(fullKey);
  if (head && head.metadata && head.metadata.sha256 === sha) {
    console.log("\n  Unveraendert - nicht neu geschrieben.");
  } else {
    await driver.put(fullKey, buf, {
      contentType: "application/json",
      metadata: { sha256: sha, rawbytes: String(raw.length), source: KEY }
    });
    console.log("\n  Geschrieben.");
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    key: fullKey, rawBytes: raw.length, storedBytes: buf.length,
    ratio: +(raw.length / buf.length).toFixed(1), sha256: sha,
    skipped: !!(head && head.metadata && head.metadata.sha256 === sha),
    note: "Kein Kursniveau in diesem Bericht - nur Groessen."
  }, null, 2) + "\n");
  console.log(`  ${OUT.replace(root + "/", "")}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
