// Vorarbeit Setup-OOS A6: build-setup-outcomes.mjs --oos-rows-out (getrennte Datei, Produktartefakt unberuehrt).
// Schreibt nur nach tmp (--out), liest die veroeffentlichte Setup-Historie.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "scripts/quant/build-setup-outcomes.mjs");
const PRODUCT = path.join(ROOT, "quant/data/product/setup-outcomes-v1.json");
const O = require("../engines/setup-oos.cjs");
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

test("A6: Zeilenexport nur mit --oos-rows-out, Form passt zum Auswerter, Produktartefakt bleibt unberuehrt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-oos-rows-"));
  const before = sha(PRODUCT);
  execFileSync(process.execPath, ["--max-old-space-size=6144", SCRIPT, "--out", path.join(dir, "outcomes.json"), "--oos-rows-out", path.join(dir, "rows.json")], { stdio: "pipe" });
  assert.equal(sha(PRODUCT), before, "setup-outcomes-v1.json unveraendert");
  const out = JSON.parse(fs.readFileSync(path.join(dir, "outcomes.json"), "utf8"));
  const rows = JSON.parse(fs.readFileSync(path.join(dir, "rows.json"), "utf8"));
  assert.equal(rows.schemaVersion, "setup-oos-rows-1.0.0");
  assert.equal(rows.asOf, out.asOf);
  assert.deepEqual(Object.keys(rows.rows).sort(), ["SETUP_CONFIRMED", "SETUP_NEW"], "nur Einstiegsereignisse");
  for (const [type, byVariant] of Object.entries(rows.rows)) for (const [variant, byH] of Object.entries(byVariant)) for (const [h, list] of Object.entries(byH)) {
    assert.equal(list.length, out.study[type].variants[variant][h].status.COMPLETED, `${type}/${variant}/${h}: Zeilen = abgeschlossene Ergebnisse`);
    for (const r of list) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.net) && (r.b === null || Number.isFinite(r.b.median)) && Object.keys(r).length === 3);
    const sorted = list.map((r) => r.date); assert.deepEqual(sorted, [...sorted].sort());
  }
  /* Der Auswerter liest die Zeilen ohne Umformung; ohne Segmentierung bleibt er bei FAIL. */
  const m6 = rows.rows.SETUP_NEW.NEXT_CLOSE.m6;
  const r = O.evaluateSetupOos({ rows: m6, minPerSegment: 30, segmentation: null });
  assert.equal(r.status, "FAIL"); assert.equal(r.completed, m6.length);
});

test("A6: Ziel unter quant/data wird verweigert", () => {
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, "--out", path.join(os.tmpdir(), "x.json"), "--oos-rows-out", path.join(ROOT, "quant/data/product/setup-oos-rows.json")], { stdio: "pipe" }), /OOS_ROWS_OUT_INSIDE_QUANT_DATA/);
  assert.equal(fs.existsSync(path.join(ROOT, "quant/data/product/setup-oos-rows.json")), false);
});
