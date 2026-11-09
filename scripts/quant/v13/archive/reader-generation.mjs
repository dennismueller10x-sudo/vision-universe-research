#!/usr/bin/env node
// V13 – Lesegeneration des privaten Archivs aus docs/quant-recovery/v13-archive-gen2/readers.json aufloesen.
// Ohne Secret und ohne Netz: prueft nur das committete Manifest gegen den Eintrag.
//   node scripts/quant/v13/archive/reader-generation.mjs [--pin <readers.json>] [--generation <x.y.z>]
// Ausgabe (fuer $GITHUB_OUTPUT): generation=…, manifest=…, prefix=…; bei einem Widerspruch Exit 2.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const DEFAULT_PIN = "docs/quant-recovery/v13-archive-gen2/readers.json";
const PREFIX_RE = /^research-snapshots\/quant-v13\/archive-(\d+\.\d+\.\d+)\/$/;

/** Rein: Eintrag der Lesegeneration aufloesen und gegen das Manifest pruefen. Wirft mit einem Grundcode. */
export function resolveReader(pin, readManifest, generation = pin.readGeneration) {
  if (pin?.schemaVersion !== "v13-archive-readers-1.0.0") throw new Error("PIN_SCHEMA");
  const g = pin.generations?.[generation];
  if (!g) throw new Error("GENERATION_UNKNOWN:" + generation);
  const m = PREFIX_RE.exec(g.prefix || "");
  if (!m || m[1] !== generation) throw new Error("PREFIX_MISMATCH:" + generation);
  const manifest = readManifest(g.manifest);
  if (manifest.schemaVersion !== "v13-research-archive-manifest-" + generation) throw new Error("MANIFEST_VERSION_MISMATCH:" + generation);
  if (manifest.storagePrefix != null && manifest.storagePrefix !== g.prefix) throw new Error("MANIFEST_PREFIX_MISMATCH:" + generation);
  if (!Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error("MANIFEST_PARTS_MISSING:" + generation);
  return { generation, manifest: g.manifest, prefix: g.prefix, parts: manifest.parts.map((p) => p.part) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k, d = null) => { const i = a.indexOf(k); return i < 0 ? d : a[i + 1]; };
  try {
    const pin = JSON.parse(fs.readFileSync(path.resolve(ROOT, opt("--pin", DEFAULT_PIN)), "utf8"));
    const r = resolveReader(pin, (f) => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), "utf8")), opt("--generation", pin.readGeneration));
    process.stdout.write(`generation=${r.generation}\nmanifest=${r.manifest}\nprefix=${r.prefix}\n`);
  } catch (e) { console.error(String(e.message || e)); process.exit(2); }
}
