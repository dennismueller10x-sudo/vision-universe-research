#!/usr/bin/env node
/* VU MISSION X — Register-Pruefung: Hash-Kette, HEAD, Snapshot-Hashes, Laeufe nur vorwaerts, Produkt-Identitaet (ab 1.1.0),
   nur anhaengen (gegen eine fruehere Git-Fassung).
     node scripts/technical/elliott-registry/verify.mjs --registry DIR [--against-git REV] */
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/ti-data.mjs";
import { readLedger, verifyChain } from "./ledger.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const sha = (b) => createHash("sha256").update(b).digest("hex");

export function verifyRegistry(reg, againstGit) {
  const errors = [];
  const lines = readLedger(reg), head = existsSync(join(reg, "HEAD.json")) ? JSON.parse(readFileSync(join(reg, "HEAD.json"), "utf8")) : null;
  const c = verifyChain(lines, head); errors.push(...c.errors);
  for (const e of lines.filter((x) => x.type === "RUN")) {
    const f = join(reg, e.payload.snapshot.file);
    if (!existsSync(f)) errors.push("Snapshot fehlt: " + e.payload.snapshot.file); else if (sha(readFileSync(f)) !== e.payload.snapshot.sha256) errors.push("Snapshot veraendert: " + e.payload.snapshot.file);
  }
  /* Laeufe streng vorwaerts; Kundenprodukt-Sicht nur mit bestaetigter Identitaet zum veroeffentlichten Produkt */
  const runs = lines.filter((x) => x.type === "RUN"), productWeeks = new Set();
  runs.forEach((e, k) => { if (k && e.week <= runs[k - 1].week) errors.push("Lauf nicht vorwaerts: " + e.week + " nach " + runs[k - 1].week);
    if ((e.payload.views || []).includes("CUSTOMER_PRODUCT")) { productWeeks.add(e.week); const id = e.payload.productView && e.payload.productView.identity;
      if (!id || id.ok !== true || !(id.compared > 0) || id.different !== 0) errors.push("Produkt-Identitaet im Lauf " + e.week + " nicht bestaetigt"); } });
  for (const e of lines) if (e.type === "EVENT" && e.payload.view === "CUSTOMER_PRODUCT" && !productWeeks.has(e.week)) errors.push("Produkt-Ereignis ohne Produkt-Lauf: seq " + e.seq);
  /* Revisionen verweisen nur auf vorher registrierte Ereignisse; Ereignis-IDs eindeutig */
  const seen = new Set();
  for (const e of lines) { if (e.type === "EVENT") { if (seen.has(e.id)) errors.push("doppelte Ereignis-ID " + e.id); seen.add(e.id); } if (e.type === "REVISION" && !seen.has(e.ref)) errors.push("Revision ohne vorheriges Ereignis: seq " + e.seq); }
  /* Nur anhaengen: die fruehere Fassung muss ein Prefix der jetzigen sein */
  if (againstGit) {
    const rel = relative(ROOT, join(reg, "ledger.jsonl"));
    let old = null; try { old = execSync(`git show ${againstGit}:${rel}`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { /* Datei existierte frueher nicht */ }
    if (old !== null) { const now = readFileSync(join(reg, "ledger.jsonl"), "utf8"); if (!now.startsWith(old)) errors.push("Ledger gegen " + againstGit + " nicht nur angehaengt (bestehende Zeilen veraendert)"); }
  }
  return { ok: errors.length === 0, errors, entries: lines.length, events: seen.size, head: c.head };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = verifyRegistry(arg("registry"), arg("against-git", null));
  console.log("[elliott-registry verify] " + JSON.stringify({ ok: r.ok, entries: r.entries, events: r.events, errors: r.errors.slice(0, 10) }));
  if (!r.ok) process.exit(1);
}
