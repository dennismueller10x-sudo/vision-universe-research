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

test("DS6 · preview-scope loest die heutige Konfiguration auf das Produktuniversum auf - keine Fuenferliste mehr", async () => {
  const m = await import("../../scripts/market/preview-scope.mjs");
  const U = await import("../../scripts/market/universe-source.mjs");
  const r = m.resolveScope(root);
  const produkt = U.resolveProductUniverse(root);
  /* Umfang = Produktuniversum + fullHistory-Titel + Benchmark; nichts
     davon steht als Zahl im Test - die Quelle bestimmt die Groesse. */
  assert.ok(r.tickers.size >= produkt.securities.length, "Umfang kleiner als das Produktuniversum");
  for (const t of ["AAPL", "JPM", "MSFT", "NVDA", "XOM", "SPY"]) assert.ok(r.tickers.has(t), t + " fehlt im Umfang");
  assert.equal(r.unresolved.length, 0);
  assert.ok(r.securities.every((s) => /^ref_/.test(s.securityId)));
  assert.equal(r.universeSource.source, produkt.source);
  assert.ok(["INTEGRATED", "PENDING"].includes(r.universeSource.handover.status));
});

/* Kurzreihen (neu an der Boerse): derselbe Guard, eigenes Verzeichnis, nur kurz. */
const kurz = (ticker, n = 2, extra = {}) => JSON.stringify({ ticker, short: true, publishBasis: "Test", provider: "tiingo",
  points: Array.from({ length: n }, (_, i) => ["2026-09-" + String(i + 1).padStart(2, "0"), 100 + i]), ...extra });
function mitKurz(config, fn) {
  withFixture(config, (dir) => { mkdirSync(join(dir, "quant", "data", "market", "discover-series-kurz"), { recursive: true }); fn(dir); });
}
const KD = (dir, name) => join(dir, "quant", "data", "market", "discover-series-kurz", name);

test("DS-K1 · Kurzreihe im Umfang mit Grundlage wird akzeptiert", () => {
  mitKurz({ scope: ["AAPL"] }, (dir) => { writeFileSync(KD(dir, "ref_AAPL.json"), kurz("AAPL")); const r = run(dir); assert.equal(r.status, 0, r.stdout + r.stderr); });
});
test("DS-K2 · Kurzreihe ausserhalb des Umfangs oder ohne Grundlage wird abgelehnt", () => {
  mitKurz({ scope: ["AAPL"] }, (dir) => { writeFileSync(KD(dir, "ref_TSLA.json"), kurz("TSLA")); assert.equal(run(dir).status, 1); });
  mitKurz({ scope: ["AAPL"] }, (dir) => { writeFileSync(KD(dir, "ref_AAPL.json"), kurz("AAPL", 2, { publishBasis: undefined })); assert.equal(run(dir).status, 1); });
});
test("DS-K3 · eine Reihe mit 30 Punkten oder ohne Marke short gehoert nicht in discover-series-kurz", () => {
  mitKurz({ scope: ["AAPL"] }, (dir) => { writeFileSync(KD(dir, "ref_AAPL.json"), kurz("AAPL", 30)); assert.equal(run(dir).status, 1); });
  mitKurz({ scope: ["AAPL"] }, (dir) => { writeFileSync(KD(dir, "ref_AAPL.json"), kurz("AAPL", 2, { short: false })); assert.equal(run(dir).status, 1); });
});
