#!/usr/bin/env node
/**
 * Eine Form-4-Abholung fuer zwei Sichten (Plan Neustart, Insider zusammenfuehren).
 *
 * Der taegliche E2-Lauf (scripts/insider/form4.py --raw-dir) holt jede Form-4-Einreichung
 * einmal. Dieses Skript macht daraus den kompakten Auszug, den
 * scripts/market/build-ownership-signals.mjs in seinem Cache `form4/<YYYY-MM>.json` fuehrt
 * (gleiche Funktion compactForm4, gleicher Parser parseForm4Xml), und legt ihn je Monat ab.
 * Der Wochenlauf der Eigentuemer-Signale saet damit seinen Cache und holt nur noch, was fehlt.
 *
 *   build: --raw <dir> --out-dir <dir> [--prev-dir <dir>] [--keep-months 6] [--as-of YYYY-MM-DD]
 *          Monatsdateien aus prev-dir + neue Einreichungen -> out-dir (nur geaenderte Monate).
 *   seed:  --seed <cache-dir> --from-dir <dir> [--as-of YYYY-MM-DD]   (nur die letzten 6 Monate)
 *          Monatsdateien in <cache-dir>/form4/<YYYY-MM>.json uebernehmen; vorhandene
 *          Eintraege des Caches gewinnen (nie ueberschreiben).
 *
 * Nur Form "4" (wie der Index der Eigentuemer-Signale); 4/A bleibt dort aussen vor.
 * Eintrag je Accession: kompakter Auszug, oder null wenn keine P/S-Transaktion (wie im Cache).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { compactForm4 } from "../market/build-ownership-signals.mjs";

const require = createRequire(import.meta.url);
const E = require("../../quant/engines/ownership-signals.js");
const MONTH = /^(\d{4}-\d{2})\.json$/;
const ACC = /^\d{10}-\d{2}-\d{6}$/;

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function writeJson(p, v) { writeFileSync(p + ".tmp", JSON.stringify(v)); renameSync(p + ".tmp", p); }
function monthFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => MONTH.test(f)).sort() : [];
}
function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Einreichungen aus raw-dir -> { month: { acc: rec|null } } */
export function compactRaw(rawDir) {
  const out = {};
  for (const [acc, filed, form] of readJson(join(rawDir, "index.json"))) {
    if (form !== "4") continue;
    if (!ACC.test(acc) || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) throw new Error(`ungueltiger Indexeintrag ${acc} ${filed}`);
    const rec = compactForm4(E.parseForm4Xml(readFileSync(join(rawDir, acc + ".txt"), "utf8")), filed);
    (out[filed.slice(0, 7)] ||= {})[acc] = rec && rec.x.length ? rec : null;
  }
  return out;
}

export function build({ raw, outDir, prevDir = null, keepMonths = 6, asOf = new Date().toISOString().slice(0, 10) }) {
  const fresh = compactRaw(raw);
  const oldest = addMonths(asOf.slice(0, 7), -(keepMonths - 1));
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const month of Object.keys(fresh).sort()) {
    if (month < oldest) continue;
    const prevFile = prevDir && join(prevDir, month + ".json");
    const merged = prevFile && existsSync(prevFile) ? readJson(prevFile) : {};
    Object.assign(merged, fresh[month]);
    writeJson(join(outDir, month + ".json"), merged);
    written.push({ month, entries: Object.keys(merged).length, added: Object.keys(fresh[month]).length });
  }
  return { written, oldest };
}

export function seed({ cache, fromDir, keepMonths = 6, asOf = new Date().toISOString().slice(0, 10) }) {
  const dir = join(cache, "form4");
  mkdirSync(dir, { recursive: true });
  const stats = [];
  const oldest = addMonths(asOf.slice(0, 7), -(keepMonths - 1));
  for (const f of monthFiles(fromDir)) {
    if (f.slice(0, 7) < oldest) continue;
    const target = join(dir, f);
    const have = existsSync(target) ? readJson(target) : {};
    let added = 0;
    for (const [acc, rec] of Object.entries(readJson(join(fromDir, f)))) {
      if (Object.prototype.hasOwnProperty.call(have, acc)) continue;
      have[acc] = rec; added++;
    }
    writeJson(target, have);
    stats.push({ month: f.slice(0, 7), added, total: Object.keys(have).length });
  }
  return stats;
}

if (process.argv[1] && process.argv[1].endsWith("form4-compact.mjs")) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  if (a.seed) {
    for (const s of seed({ cache: a.seed, fromDir: a["from-dir"], asOf: a["as-of"] || undefined })) console.log(`Form-4-Cache ${s.month}: ${s.added} uebernommen, ${s.total} gesamt`);
  } else if (a.raw && a["out-dir"]) {
    const r = build({ raw: a.raw, outDir: a["out-dir"], prevDir: a["prev-dir"] || null, keepMonths: a["keep-months"] ? Number(a["keep-months"]) : 6, asOf: a["as-of"] || undefined });
    for (const w of r.written) console.log(`Form-4-Auszug ${w.month}: ${w.added} neu, ${w.entries} gesamt`);
  } else {
    console.error("Aufruf: --raw <dir> --out-dir <dir> [--prev-dir <dir>] | --seed <cache> --from-dir <dir>");
    process.exit(2);
  }
}
