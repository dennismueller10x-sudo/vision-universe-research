import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD = join(root, "scripts", "market", "assert-public-data-hygiene.mjs");

function runGuardAgainst(fixtureRoot) {
  return spawnSync(process.execPath, [GUARD, "--root=" + fixtureRoot], { cwd: root, encoding: "utf8" });
}

/* Fixture-Baum: nur die Datei-Schnittstelle des Guards, keine echte
   Provider-Anbindung noetig. Landet unter os.tmpdir(), nie im Repository -
   ein Testlauf darf nach DO-NOT-BREAK #10 keine Produktionsdaten anfassen. */
function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "vu-hygiene-"));
  try {
    mkdirSync(join(dir, "quant", "config"), { recursive: true });
    mkdirSync(join(dir, "quant", "data", "market", "golden-preview", "daily"), { recursive: true });
    writeFileSync(join(dir, "quant", "config", "development-preview.json"),
      JSON.stringify({ scope: ["AAPL", "MSFT", "NVDA", "JPM", "XOM"] }));
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("DH1 · Oeffentliche Pfade enthalten keine ungeklärten Provider-Rohbars", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts", "market", "assert-public-data-hygiene.mjs")], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no commercial-provider raw bars/i);
});

test("DH3 · golden-preview/daily akzeptiert reale Bars fuer Titel aus der deklarierten Scope-Liste", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "golden-preview", "daily", "ref_AAPL.json"),
      JSON.stringify({ ticker: "AAPL", isMock: false, bars: [{ date: "2026-09-01", close: 200 }] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("DH4 · golden-preview/daily lehnt reale Bars fuer einen Titel ausserhalb der Scope-Liste ab " +
     "(die Ausnahme bleibt eng, kein blinder Fleck)", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "golden-preview", "daily", "ref_TSLA.json"),
      JSON.stringify({ ticker: "TSLA", isMock: false, bars: [{ date: "2026-09-01", close: 200 }] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /outside the declared Golden Five scope/);
  });
});

test("DH5 · das allgemeine quant/data/market/daily/ bleibt gesperrt, auch fuer Golden-Five-Ticker " +
     "(die Ausnahme gilt nur unter golden-preview/, nicht global)", () => {
  withFixture((dir) => {
    mkdirSync(join(dir, "quant", "data", "market", "daily"), { recursive: true });
    writeFileSync(join(dir, "quant", "data", "market", "daily", "ref_AAPL.json"),
      JSON.stringify({ ticker: "AAPL", isMock: false, bars: [{ date: "2026-09-01", close: 200 }] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /quant\/data\/market\/daily\/ref_AAPL\.json: raw bars in public tree/);
  });
});

test("DH6 · quant/data/technical/instruments akzeptiert reale Bundles fuer Golden-Five-Titel", () => {
  withFixture((dir) => {
    mkdirSync(join(dir, "quant", "data", "technical", "instruments"), { recursive: true });
    writeFileSync(join(dir, "quant", "data", "technical", "instruments", "AAPL.json"),
      JSON.stringify({ instrumentId: "AAPL", isMock: false, bars: [{ date: "2026-09-01", close: 200 }] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("DH7 · quant/data/technical/instruments lehnt ein reales Bundle ausserhalb der Scope-Liste ab", () => {
  withFixture((dir) => {
    mkdirSync(join(dir, "quant", "data", "technical", "instruments"), { recursive: true });
    writeFileSync(join(dir, "quant", "data", "technical", "instruments", "TSLA.json"),
      JSON.stringify({ instrumentId: "TSLA", isMock: false, bars: [{ date: "2026-09-01", close: 200 }] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /outside the declared Golden Five scope/);
  });
});

test("DH8 · quant/data/market/tiingo-realtime-verification.json darf nie committet sein " +
     "(artefaktgebunden, siehe tiingo-verify.yml)", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "tiingo-realtime-verification.json"),
      JSON.stringify({ provider: "tiingo", findings: [] }));
    const result = runGuardAgainst(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /tiingo-realtime-verification\.json.*must never be committed/);
  });
});

test("DH2 · Provider-Abrufe schreiben standardmaessig nur in die private Arbeitsablage", () => {
  const source = join(root, "scripts", "market", "fetch-market-data.mjs");
  const result = spawnSync(process.execPath, [source], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Mock-Modus/);
  assert.doesNotMatch(result.stdout, /quant[\\/]data[\\/]market[\\/]status\.json/);
});
