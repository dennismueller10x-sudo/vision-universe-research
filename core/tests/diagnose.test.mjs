/* Core · Selbstdiagnose (core/diagnose.js): das erste kaputte Glied der
   Kette wird als Ursache genannt, mit dem Lauf, der es repariert. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("../diagnose.js");

function welt(over = {}) {
  const files = {
    "/quant/data/universe/instruments/NV.json": { instruments: [{ symbol: "NVDA", instrumentId: "vu_1", active: true, exchange: "NASDAQ", companyName: "NVIDIA" }] },
    "/discover/data/stock-index/US_REAL.json": { symbols: ["NVDA"] },
    "/quant/data/market/discover-series/ref_NVDA.json": { to: "2026-10-02", points: [["2026-10-01", 230.86], ["2026-10-02", 233.95]] },
    "/quant/data/market/discover-series-long/ref_NVDA.json": { to: "2026-10-02", barCount: 1446 },
    "/discover/data/stocks/US_REAL/NVDA.json": { asOf: "2026-10-02", price: { value: 233.95 }, fundamentals: { available: true, asOf: "2026-09-23", cik: "0001045810" } },
    "/quant/data/product/capabilities-v1.json": { capabilities: ["HAS_MARKET_DATA", "HAS_FACTORS"], rows: { NVDA: ["ref_NVDA", 3] } },
    "/quant/data/market/intraday/index.json": { entries: { NVDA: { sessionDate: "2026-10-02", regularComplete: true, lastRegularLocal: "16:00" } } }
  };
  Object.assign(files, over);
  for (const k of Object.keys(files)) if (files[k] === null) delete files[k];
  return async (p) => { if (!(p in files)) throw new Error("fehlt: " + p); return files[p]; };
}
const lag = (a, b) => (a === b ? 0 : a === "2026-10-01" ? 1 : 5);
const opts = (load) => ({ load, expectedSession: "2026-10-02", lagSessions: lag, marketState: "CLOSED" });

test("Gesunde Kette ist OK, ohne Ursache", async () => {
  const d = await D.diagnose("nvda", opts(welt()));
  assert.equal(d.status, "OK");
  assert.equal(d.likelyCause, null);
  assert.equal(d.ticker, "NVDA");
});

test("Seite nicht nachgebaut: Reihe weiter als Seite -> payload STALE, Reparatur Discover-Build", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/discover/data/stocks/US_REAL/NVDA.json": { asOf: "2026-10-01", price: { value: 233.95 }, fundamentals: { available: true } } })));
  assert.equal(d.failedStep, "payload");
  assert.equal(d.status, "STALE");
  assert.match(d.suggestedRepair, /build-discover-data/);
});

test("Zweite Preiswahrheit: Seite zeigt anderen Kurs als die Reihe -> FAILED", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/discover/data/stocks/US_REAL/NVDA.json": { asOf: "2026-10-02", price: { value: 230 }, fundamentals: { available: true } } })));
  assert.equal(d.failedStep, "payload");
  assert.equal(d.status, "FAILED");
});

test("Veraltete Kurse werden vor der Seite als Ursache erkannt", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/quant/data/market/discover-series/ref_NVDA.json": { to: "2026-09-25", points: [["2026-09-25", 200]] },
    "/discover/data/stocks/US_REAL/NVDA.json": { asOf: "2026-09-25", price: { value: 200 }, fundamentals: { available: true } } })));
  assert.equal(d.failedStep, "eod");
  assert.equal(d.status, "STALE");
  assert.match(d.suggestedRepair, /market-data-refresh/);
});

test("Fehlende generierte Seite bei vorhandenem Indexeintrag ist FAILED", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/discover/data/stocks/US_REAL/NVDA.json": null })));
  assert.equal(d.failedStep, "payload");
  assert.match(d.likelyCause, /Aktienseite fehlt/);
});

test("Zweite Identitaet in der Quant-Projektion wird erkannt", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/quant/data/product/capabilities-v1.json": { capabilities: ["HAS_MARKET_DATA"], rows: { NVDA: ["ref_NVDAX", 1] } } })));
  assert.equal(d.failedStep, "capabilities");
  assert.equal(d.status, "FAILED");
});

test("Ungueltiger Ticker und unbekanntes Wertpapier", async () => {
  assert.equal((await D.diagnose("../x", opts(welt()))).failedStep, "identity");
  const d = await D.diagnose("ZZZZ", opts(welt()));
  assert.equal(d.failedStep, "universe");
});

test("Intraday ohne Schluss bei geschlossener Boerse ist eine Warnung", async () => {
  const d = await D.diagnose("NVDA", opts(welt({ "/quant/data/market/intraday/index.json": { entries: { NVDA: { sessionDate: "2026-10-02", regularComplete: false, lastRegularLocal: "14:20" } } } })));
  assert.equal(d.failedStep, "intraday");
  assert.equal(d.status, "WARN");
});
