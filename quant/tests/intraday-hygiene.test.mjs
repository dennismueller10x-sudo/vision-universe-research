/* Intraday-Snapshots unterliegen demselben Guard wie Tageskurse: nur
   Titel aus dem Umfang, nur mit Grundlage, Sitzung = Verzeichnis. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD = join(root, "scripts", "market", "assert-public-data-hygiene.mjs");
const run = (dir) => spawnSync(process.execPath, [GUARD, "--root=" + dir], { cwd: root, encoding: "utf8" });

function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "vu-intraday-"));
  try {
    mkdirSync(join(dir, "quant", "config"), { recursive: true });
    mkdirSync(join(dir, "quant", "data", "market", "intraday", "2026-09-11"), { recursive: true });
    writeFileSync(join(dir, "quant", "config", "development-preview.json"), JSON.stringify({ scope: ["AAPL"] }));
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const snap = (sym, extra) => JSON.stringify(Object.assign({ symbol: sym, sessionDate: "2026-09-11",
  points: [["09:30", 100], ["09:35", 101]], publishBasis: "Test", provider: "tiingo" }, extra || {}));

test("IH1 · ein Snapshot fuer einen Titel im Umfang wird akzeptiert", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "intraday", "2026-09-11", "ref_AAPL.json"), snap("AAPL"));
    const r = run(dir); assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
test("IH2 · ein Snapshot ausserhalb des Umfangs ist ein Leck", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "intraday", "2026-09-11", "ref_TSLA.json"), snap("TSLA"));
    const r = run(dir); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /TSLA.*outside the declared scope/);
  });
});
test("IH3 · ohne Grundlage keine Veroeffentlichung", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "intraday", "2026-09-11", "ref_AAPL.json"), snap("AAPL", { publishBasis: null }));
    const r = run(dir); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /without a stated basis/);
  });
});
test("IH4 · die Sitzung im Snapshot muss zum Verzeichnis passen", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "intraday", "2026-09-11", "ref_AAPL.json"), snap("AAPL", { sessionDate: "2026-09-10" }));
    const r = run(dir); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /does not match its directory/);
  });
});
