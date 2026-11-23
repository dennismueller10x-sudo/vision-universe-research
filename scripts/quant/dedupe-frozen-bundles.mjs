#!/usr/bin/env node
// Legt Dateien, die in mehreren eingefrorenen Buendeln stehen, einmal in core/tests/fixtures/frozen-shared/<sha256>.gz ab
// und ersetzt sie im Buendel durch { enc, ref }. Idempotent. Aufruf: node scripts/quant/dedupe-frozen-bundles.mjs [--check]
//   --check: schreibt nichts, Exit 1, wenn noch ein Inhalt in mehreren Buendeln liegt (Vertragstest TI-11 nutzt dieselbe Logik).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { REPO, FROZEN_SHARED_DIR } from "./lib/data-fixture.mjs";

export function bundleFiles(root = REPO) {
  const out = [];
  const gehe = (dir) => {
    for (const n of readdirSync(join(root, dir))) {
      if (n === "node_modules" || n === ".git" || n === "data") continue;
      const rel = dir ? dir + "/" + n : n;
      const st = statSync(join(root, rel));
      if (st.isDirectory()) { gehe(rel); continue; }
      if (/\/fixtures\/frozen\/[^/]+\.json\.gz$/.test(rel) || /\/fixtures\/[^/]+\/data\.json\.gz$/.test(rel)) out.push(rel);
    }
  };
  for (const d of ["core/tests", "quant/tests", "discover/tests", "technical/tests", "screener/tests", "scripts/supertrader/tests", "scripts/quant/tests", "products"]) if (existsSync(join(root, d))) gehe(d);
  return out;
}
const sha = (s) => createHash("sha256").update(s).digest("hex");
export function duplicates(root = REPO) {
  const seen = new Map();
  for (const f of bundleFiles(root)) {
    const b = JSON.parse(gunzipSync(readFileSync(join(root, f))).toString("utf8"));
    for (const [p, v] of Object.entries(b.files)) { if (v.ref || v.data === undefined) continue; const h = sha(v.data); const e = seen.get(h) || []; e.push(`${f}:${p}`); seen.set(h, e); }
  }
  /* Ein Inhalt, der schon als geteilter Blob liegt, zaehlt auch dann, wenn er nur in EINEM Buendel noch inline steht
     (23.11.2026: v13b-largecap-strict fuehrte den Stamm inline, obwohl sieben Buendel ihn als ref teilen). */
  const blobs = existsSync(join(root, FROZEN_SHARED_DIR)) ? new Set(readdirSync(join(root, FROZEN_SHARED_DIR)).map((n) => n.replace(/\.gz$/, ""))) : new Set();
  return [...seen.entries()].filter(([h, e]) => e.length > 1 || blobs.has(h));
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const dups = duplicates();
  if (process.argv.includes("--check")) { console.log(JSON.stringify({ doppelt: dups.length })); process.exit(dups.length ? 1 : 0); }
  const shared = new Set(dups.map(([h]) => h));
  mkdirSync(join(REPO, FROZEN_SHARED_DIR), { recursive: true });
  let moved = 0;
  for (const f of bundleFiles()) {
    const b = JSON.parse(gunzipSync(readFileSync(join(REPO, f))).toString("utf8")); let changed = false;
    for (const [p, v] of Object.entries(b.files)) {
      if (v.ref || v.data === undefined) continue;
      const h = sha(v.data); if (!shared.has(h)) continue;
      const blob = join(REPO, FROZEN_SHARED_DIR, h + ".gz");
      if (!existsSync(blob)) writeFileSync(blob, gzipSync(v.data, { level: 9 }));
      b.files[p] = { enc: v.enc, ref: h }; changed = true; moved++;
    }
    if (changed) writeFileSync(join(REPO, f), gzipSync(JSON.stringify(b), { level: 9 }));
  }
  console.log(JSON.stringify({ geteilteInhalte: shared.size, ersetzt: moved }));
}
