#!/usr/bin/env node
// V13 – unabhängige Wiederherstellungsprobe direkt auf dem Actions-Runner (nur in GitHub Actions).
//   --mode keycheck : prüft nur, ob V13_ARCHIVE_PRIVATE_KEY vorhanden ist und zum öffentlichen Schlüssel im Manifest passt
//   --mode restore  : lädt jeden Teil aus R2, prüft Chiffre-/Klartext-/Datei-Hashes über restore-archive.sh
// Der private Schlüssel steht nur in env, wird in eine Datei mit Modus 600 im Runner-Temp geschrieben und sofort
// danach gelöscht. Ausgabe: nur Teilnamen, Zählungen und OK/Fehlercode – nie Schlüssel, URLs oder Pfade im Eimer.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createS3DriverFromEnv } from "../../../market/storage/s3-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const mode = opt("--mode");
const manifestFile = opt("--manifest");
const prefix = opt("--prefix");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (!/^research-snapshots\/quant-v13\/archive-\d+\.\d+\.\d+\/$/.test(prefix)) { console.error("ungueltiger Praefix"); process.exit(2); }

const keyPem = process.env.V13_ARCHIVE_PRIVATE_KEY || "";
if (!keyPem.trim()) { console.log(JSON.stringify({ keycheck: "SECRET_MISSING" })); process.exit(3); }
const work = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "v13r-"));
const keyFile = path.join(work, "k.pem");
fs.writeFileSync(keyFile, keyPem.endsWith("\n") ? keyPem : keyPem + "\n", { mode: 0o600 });
const cleanup = () => { try { execFileSync("shred", ["-u", keyFile]); } catch { fs.rmSync(keyFile, { force: true }); } fs.rmSync(work, { recursive: true, force: true }); };
async function run() {
  let der;
  try { der = execFileSync("openssl", ["pkey", "-in", keyFile, "-pubout", "-outform", "DER"], { stdio: ["ignore", "pipe", "ignore"] }); }
  catch { console.log(JSON.stringify({ keycheck: "SECRET_NOT_A_PRIVATE_KEY" })); return 3; }
  const fp = createHash("sha256").update(der).digest("hex");
  const match = fp === manifest.archivePublicKeySha256Der;
  console.log(JSON.stringify({ keycheck: match ? "OK" : "KEY_MISMATCH" }));
  if (!match) return 3;
  if (mode === "keycheck") return 0;
  if (mode !== "restore") { console.error("--mode keycheck|restore"); return 2; }
  const driver = createS3DriverFromEnv(process.env);
  const src = path.join(work, "enc"), dst = path.join(work, "out");
  fs.mkdirSync(src); fs.mkdirSync(dst);
  const result = [];
  for (const p of manifest.parts) {
    const buf = await driver.get(prefix + p.object);
    if (!buf) { result.push({ part: p.part, status: "MISSING" }); break; }
    fs.writeFileSync(path.join(src, p.object), buf);
    try {
      const out = execFileSync("bash", [path.join(HERE, "restore-archive.sh"), manifestFile, src, keyFile, dst, p.part], { encoding: "utf8" });
      result.push({ part: p.part, status: /: OK \(/.test(out) ? "OK" : "UNEXPECTED_OUTPUT", files: p.files });
    } catch (e) { result.push({ part: p.part, status: String(e.stdout || "").trim().split(": ").pop() || "RESTORE_FAILED" }); }
    fs.rmSync(path.join(src, p.object), { force: true }); fs.rmSync(path.join(dst, p.part), { recursive: true, force: true });
  }
  console.log(JSON.stringify({ restore: result }, null, 1));
  if (result.length !== manifest.parts.length || result.some(r => r.status !== "OK")) return 1;
  return 0;
}
let code = 1;
try { code = await run(); } finally { cleanup(); }
process.exitCode = code;

