/* Multi-Asset Core: Taxonomie, Einheiten, Katalog (§14-17, §41, §46-48). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Taxonomy = require("../engines/multi-asset/asset-taxonomy.js");
const Catalog = require("../engines/multi-asset/instrument-catalog.js");
const CompanyMaster = require("../engines/company-master.js");

test("alle Katalogeintraege sind taxonomisch gueltig", () => {
  for (const i of Catalog.all()) assert.deepEqual(i.findings, [], `${i.symbol}: ${i.findings.join(", ")}`);
});

test("instrumentId liegt im ID-Raum des Company Master und ist eindeutig", () => {
  const all = Catalog.all();
  const ids = new Set(all.map((i) => i.instrumentId));
  assert.equal(ids.size, all.length);
  for (const i of all) {
    assert.match(i.instrumentId, /^vu_[0-9a-f]{14}$/);
    assert.equal(i.instrumentId, CompanyMaster.mintInstrumentId({ provider: "vu-core", exchange: i.assetClass, symbol: i.symbol }, 0));
  }
});

test("Pflichtinstrumente des Auftrags sind im Katalog", () => {
  const need = ["SPX", "NDX", "DJI", "DAX", "SX5E", "UKX", "N225", "XAUUSD", "XAGUSD", "WTI", "BRENT", "COPPER",
                "NATGAS", "BTCUSD", "ETHUSD", "US2Y", "US5Y", "US10Y", "US30Y", "DE2Y", "DE10Y", "FED_TARGET", "ECB_DFR", "EURUSD"];
  for (const s of need) assert.ok(Catalog.bySymbol(s), s);
});

test("ein Index ist kein ETF: kein Katalog-Index nutzt ein ETF-Kuerzel als Symbol", () => {
  for (const i of Catalog.byAssetClass("INDEX")) {
    assert.equal(i.unit, "INDEX_POINTS");
    assert.equal(i.valueSemantics, "INDEX_LEVEL");
    for (const p of i.knownProxies) assert.notEqual(String(p).split(" ")[0], i.symbol === "DAX" ? "__" : i.symbol);
  }
  assert.equal(Catalog.bySymbol("SPY"), null);
  assert.equal(Catalog.bySymbol("QQQ"), null);
  assert.equal(Catalog.bySymbol("GLD"), null);
});

test("Rendite und Zins: Prozent, keine Waehrung, Basispunkte, nicht umrechenbar", () => {
  for (const cls of ["YIELD", "RATE"]) {
    for (const i of Catalog.byAssetClass(cls)) {
      assert.equal(i.unit, "PERCENT", i.symbol);
      assert.equal(i.currency, null, i.symbol);
      assert.equal(Taxonomy.changeSemantics(i.valueSemantics), "BASIS_POINTS", i.symbol);
      assert.equal(Taxonomy.conversionFor(i.assetClass, i.unit), "NOT_CONVERTIBLE", i.symbol);
    }
  }
});

test("Umrechenbarkeit folgt der Einheit, nicht dem Waehrungsfeld", () => {
  assert.equal(Taxonomy.conversionFor("PRECIOUS_METAL", "PRICE_PER_OUNCE"), "CONVERTIBLE");
  assert.equal(Taxonomy.conversionFor("CRYPTO", "CRYPTO_QUOTE"), "CONVERTIBLE");
  assert.equal(Taxonomy.conversionFor("INDEX", "INDEX_POINTS"), "NOT_CONVERTIBLE");
  assert.equal(Taxonomy.conversionFor("FX", "FX_RATE"), "SELF");
  /* Kupfer mit ungeklaerter Einheit: USD/t und USD/lb sind beide "USD". */
  assert.equal(Taxonomy.conversionFor("COMMODITY", "UNRESOLVED"), "NOT_CONVERTIBLE");
});

test("kanonische Einheits-IDs", () => {
  assert.equal(Taxonomy.unitId("PRICE_PER_OUNCE", "USD", "TROY_OUNCE"), "USD_PER_TROY_OUNCE");
  assert.equal(Taxonomy.unitId("PRICE_PER_BARREL", "USD", "BARREL"), "USD_PER_BARREL");
  assert.equal(Taxonomy.unitId("INDEX_POINTS", "USD"), "POINTS");
  assert.equal(Taxonomy.unitId("PERCENT", null), "PERCENT");
  assert.equal(Taxonomy.unitId("CRYPTO_QUOTE", "USD", "BTC"), "USD_PER_BTC");
});

test("Semantikregeln greifen: ein Yield in USD oder ein Krypto mit Boersensitzung ist ungueltig", () => {
  const base = Catalog.bySymbol("US10Y");
  assert.ok(Taxonomy.validateInstrument({ ...base, currency: "USD" }).includes("yieldOrRateHasNoCurrency"));
  assert.ok(Taxonomy.validateInstrument({ ...base, unit: "CURRENCY" }).includes("yieldOrRateMustBePercent"));
  const btc = Catalog.bySymbol("BTCUSD");
  assert.ok(Taxonomy.validateInstrument({ ...btc, sessionProfile: "US_EQUITY" }).includes("cryptoMustBe24x7"));
});

test("resolve ohne Entscheidung bleibt CANDIDATE und behauptet keine Quelle", () => {
  const r = Catalog.resolve(Catalog.bySymbol("SPX"), null);
  assert.equal(r.status, "CANDIDATE");
  assert.equal(r.source, null);
  assert.equal(r.expectedRange, undefined);
});
