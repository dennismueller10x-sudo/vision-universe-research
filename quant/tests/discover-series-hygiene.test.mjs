/* Die kompakten Discover-Kursreihen unterliegen demselben Guard wie die
   Golden-Five-Bars: nur Titel aus dem deklarierten Umfang, nur mit
   Grundlage. Und der Umfang darf ein ganzes Universum sein - ohne dass
   irgendwo eine Liste von fuenf Tickern steht. */
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

function withFixture(config, fn) {
  const dir = mkdtempSync(join(tmpdir(), "vu-series-"));
  try {
    mkdirSync(join(dir, "quant", "config"), { recursive: true });
    mkdirSync(join(dir, "quant", "data", "market", "discover-series"), { recursive: true });
    mkdirSync(join(dir, "quant", "data", "market", "scale"), { recursive: true });
    writeFileSync(join(dir, "quant", "config", "development-preview.json"), JSON.stringify(config));
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const reihe = (ticker) => JSON.stringify({ ticker, points: [["2026-09-01", 100], ["2026-09-02", 101]],
                                           publishBasis: "Test", provider: "tiingo" });

test("DS1 · discover-series akzeptiert eine Reihe fuer einen Titel aus der Tickerliste", () => {
  withFixture({ scope: ["AAPL"] }, (dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_AAPL.json"), reihe("AAPL"));
    const r = run(dir); assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});

test("DS2 · discover-series lehnt eine Reihe ausserhalb des Umfangs ab", () => {
  withFixture({ scope: ["AAPL"] }, (dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_TSLA.json"), reihe("TSLA"));
    const r = run(dir); assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /outside the declared preview scope/);
  });
});

test("DS3 · der Umfang darf ein Universum sein (scopeUniverse) - keine Fuenferliste noetig", () => {
  withFixture({ scope: [], scopeUniverse: "TEST_50" }, (dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "scale", "universe-TEST_50.json"),
      JSON.stringify({ securities: [{ securityId: "ref_KO", ticker: "KO" }, { securityId: "ref_PEP", ticker: "PEP" }] }));
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_KO.json"), reihe("KO"));
    const r = run(dir); assert.equal(r.status, 0, r.stdout + r.stderr);
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_AAPL.json"), reihe("AAPL"));
    const r2 = run(dir); assert.equal(r2.status, 1, "AAPL steht nicht im Universum TEST_50");
  });
});

test("DS4 · eine Reihe ohne Grundlage wird abgelehnt", () => {
  withFixture({ scope: ["AAPL"] }, (dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_AAPL.json"),
      JSON.stringify({ ticker: "AAPL", points: [["2026-09-01", 100]] }));
    const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /without a stated basis/);
  });
});

test("DS5 · ein scopeUniverse ohne Datei ist ein Fehler, kein leerer Umfang", () => {
  withFixture({ scope: ["AAPL"], scopeUniverse: "GIBT_ES_NICHT" }, (dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "discover-series", "ref_AAPL.json"), reihe("AAPL"));
    const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /cannot be resolved/);
  });
});

test("DS6 · preview-scope loest die heutige Konfiguration auf genau die fuenf Golden-Five-Titel auf", async () => {
  const m = await import("../../scripts/market/preview-scope.mjs");
  const r = m.resolveScope(root);
  assert.deepEqual([...r.tickers].sort(), ["AAPL", "JPM", "MSFT", "NVDA", "XOM"]);
  assert.equal(r.unresolved.length, 0);
  assert.ok(r.securities.every((s) => /^ref_/.test(s.securityId)));
});
