import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { catalog, latestSegment, seriesRecord, priceReturnSeries, retryable } from "../../scripts/vorsorge/ingest-tiingo-etfs.mjs";
const require = createRequire(import.meta.url);
const T = require("../engines/etf-taxonomy.js");
const Codec = require("../engines/series-codec.js");
const M = require("../engines/etf-master.js");
const cls = (name, extra) => T.classify(Object.assign({ name, securityType: "ETF" }, extra || {}));

test("Produkttypen: ETF, ETN, ETC, ETP, CEF, Mutual Fund, Unknown", () => {
  assert.equal(cls("iShares MSCI World ETF").productType, "ETF");
  assert.equal(cls("iPath Bloomberg Commodity Index Total Return ETN").productType, "ETN");
  assert.equal(cls("WisdomTree Physical Gold ETC").productType, "ETC");
  assert.equal(cls("Grayscale Bitcoin Trust ETF").productType, "ETP");
  assert.equal(cls("RiverNorth Opportunistic Municipal Income Fund, Inc.").productType, "CEF");
  assert.equal(T.classify({ name: "Vanguard 500 Index Admiral Shares", securityType: "MUTUAL_FUND" }).productType, "MUTUAL_FUND");
  assert.equal(T.classify({ name: "" }).productType, "UNKNOWN");
});

test("Strategien und Vorsorge-Einordnung", () => {
  const c = (n) => cls(n);
  assert.equal(c("Direxion Daily S&P 500 Bear 3X Shares").primaryStrategy, "LEVERAGED_INVERSE");
  assert.equal(c("Direxion Daily S&P 500 Bear 3X Shares").retirement.class, "SEHR_KOMPLEX");
  assert.equal(c("ProShares Short S&P500").primaryStrategy, "INVERSE");
  assert.equal(c("Defiance Daily Target 2X Long Amkr ETF").singleStockUnderlying, "AMKR");
  assert.ok(c("Global X Nasdaq 100 Covered Call ETF").strategies.includes("COVERED_CALL"));
  assert.ok(c("JPMorgan Equity Premium Income ETF").strategies.includes("OPTION_INCOME"));
  assert.ok(c("Innovator Equity Defined Outcome Buffer ETF").strategies.includes("BUFFER"));
  assert.equal(c("SPDR Gold Shares").assetClass, "COMMODITY");
  assert.equal(c("VanEck Gold Miners ETF").assetClass, "EQUITY");
  assert.equal(c("VanEck Bitcoin ETF").retirement.class, "KOMPLEX");
  assert.equal(c("Vanguard Total Bond Market ETF").retirement.class, "STANDARD");
  assert.equal(c("iShares MSCI World ETF").retirement.class, "STANDARD");
  assert.equal(c("PGIM Short Duration High Yield ETF").inverse, false);
  assert.equal(c("Doubleline Ultrashort Income ETF").leverage, 1);
  assert.equal(c("Tema Electrification ETF", { historyYears: 0.4 }).retirement.class, "STANDARD", "Name allein");
  assert.equal(T.classify({ name: "Tema Electrification ETF", securityType: "ETF", historyYears: 0.4 }).retirement.class, "KOMPLEX");
  assert.equal(T.classify({ name: "Mystery Strategy ETF", securityType: "ETF" }).retirement.class, "NICHT_EINORDENBAR");
  assert.equal(T.classify({ name: "Mystery Strategy ETF", securityType: "ETF", assetClassHint: "EQUITY" }).retirement.class, "STANDARD");
});

test("Manueller Override gewinnt und ist gekennzeichnet", () => {
  const c = T.classify({ name: "Some Trust", override: { productType: "CEF", assetClass: "BOND", strategies: ["BOND"] } });
  assert.equal(c.productType, "CEF"); assert.equal(c.productTypeBasis, "MANUAL_OVERRIDE");
});

test("Öffentliche Schicht: aktiv, Name, Preise, eindeutig, Standard", () => {
  const base = { status: "ACTIVE", name: "X ETF", priceHistoryAvailable: true, productType: "ETF", retirementClass: "STANDARD" };
  assert.equal(T.layerOf(base).layer, "PUBLIC_ANALYSIS");
  assert.equal(T.layerOf({ ...base, retirementClass: "SEHR_KOMPLEX" }).layer, "COMPLEX");
  assert.equal(T.layerOf({ ...base, status: "INACTIVE" }).layer, "ARCHIVE");
  assert.equal(T.layerOf({ ...base, conflict: "TICKER_COLLISION" }).layer, "REVIEW");
  assert.equal(T.layerOf({ ...base, priceHistoryAvailable: false }).layer, "REVIEW");
  assert.equal(T.layerOf({ ...base, name: null }).layer, "REVIEW");
  assert.equal(T.layerOf({ ...base, productType: "CEF" }).layer, "REVIEW");
  assert.equal(T.layerOf({ ...base, retirementClass: "NICHT_EINORDENBAR" }).layer, "REVIEW");
  assert.equal(T.layerOf({ ...base, otc: true }).layer, "REVIEW");
});

test("Preis-Anomalie wird erkannt", () => {
  assert.equal(T.priceAnomaly([["2020-01-01", 10], ["2020-01-08", 11]]), null);
  assert.match(T.priceAnomaly([["2020-01-01", 10], ["2020-01-08", 11], ["2020-01-15", 400]]), /SPRUNG/);
});

test("Ingest-Katalog: ETF-Zeilen, aktiv/inaktiv, Duplikate, fehlerhafte Zeilen", () => {
  const rows = [
    { ticker: "SPY", exchange: "NYSE ARCA", assetType: "ETF", priceCurrency: "USD", startDate: "1993-01-29", endDate: "2026-10-02" },
    { ticker: "SPY", exchange: "LSE", assetType: "ETF", priceCurrency: "USD", startDate: "2001-01-01", endDate: "2004-01-01" },
    { ticker: "OLD", exchange: "NYSE", assetType: "ETF", priceCurrency: "USD", startDate: "2001-01-01", endDate: "2010-01-01" },
    { ticker: "AAPL", exchange: "NASDAQ", assetType: "Stock", priceCurrency: "USD", startDate: "1980-01-01", endDate: "2026-10-02" },
    { ticker: "", exchange: "X", assetType: "ETF" }, { ticker: "BAD", exchange: "NYSE", assetType: "ETF", startDate: "2020-01-01", endDate: "2019-01-01" }
  ];
  const c = catalog(rows);
  assert.equal(c.stats.etfRows, 5); assert.equal(c.stats.malformedRows, 2);
  assert.equal(c.stats.activeRows, 1); assert.equal(c.stats.inactiveRows, 2);
  assert.equal(c.stats.tickersWithMultipleRows, 1); assert.equal(c.stats.activeUniqueTickers, 1);
  assert.equal(c.stats.otherAssetTypes.Stock, 1);
});

function bars(start, n, f, extra) {
  const out = []; let d = Date.parse(start);
  for (let i = 0; i < n; i++) { const day = new Date(d).getUTCDay(); if (day && day !== 6) out.push({ date: new Date(d).toISOString().slice(0, 10), close: f(i), adjClose: f(i), divCash: 0, splitFactor: 1, ...(extra ? extra(i) : {}) }); d += 864e5; }
  return out;
}

test("Recycelte Ticker: Lücke > 120 Tage trennt Vorgänger ab", () => {
  const b = bars("2001-01-01", 100, (i) => 10 + i).concat(bars("2015-03-02", 200, (i) => 50 + i * 0.1));
  const s = latestSegment(b);
  assert.equal(s.droppedBefore, "2015-03-02");
  const r = seriesRecord("REC", b, { name: "Recycled ETF" });
  assert.equal(r.record.recycledTickerSuspected, true);
  assert.equal(r.record.priceHistoryFrom, "2015-03-02");
});

test("Kurs- und Gesamtrendite getrennt; Dividende ergibt TOTAL_RETURN > PRICE_RETURN", () => {
  // adjClose konsistent mit einer Dividende von 1,0 am Tag 100
  const b = bars("2020-01-01", 400, () => 100);
  const div = 100; b[div].divCash = 1;
  b.forEach((x, i) => { x.adjClose = i < div ? x.close * (100 / 101) : x.close; });
  const r = seriesRecord("DIV", b, { name: "Dividend World ETF" });
  assert.equal(r.ok, true);
  assert.equal(r.record.totalReturn.state, "TOTAL_RETURN_RECONSTRUCTED");
  const p = Codec.decode(r.record.price.weekly), t = Codec.decode(r.record.total.weekly);
  assert.ok(Math.abs(p[p.length - 1][1] / p[0][1] - 1) < 1e-9, "Kurs flach");
  assert.ok(t[t.length - 1][1] / t[0][1] > 1.009, "Gesamtrendite enthält Dividende");
  assert.equal(r.record.dividendEvents, 1);
});

test("Ohne Name keine Identität -> keine Gesamtrendite; ohne Kurse kein Datensatz", () => {
  const b = bars("2020-01-01", 300, (i) => 100 + i);
  assert.equal(seriesRecord("X", b, { name: null }).record.totalReturn.state, "TOTAL_RETURN_UNAVAILABLE");
  assert.equal(seriesRecord("X", [], { name: "A ETF" }).ok, false);
});

test("Split-bereinigte Kursreihe", () => {
  const p = priceReturnSeries([{ date: "2020-01-01", close: 100, splitFactor: 1 }, { date: "2020-01-02", close: 50, splitFactor: 2 }]);
  assert.equal(p[0][1], 50); assert.equal(p[1][1], 50);
});

test("Retry-Regeln: 429, 408, 5xx, Verbindungsfehler", () => {
  for (const s of [429, 408, 500, 503, 0]) assert.equal(retryable(s), true);
  for (const s of [400, 401, 403, 404]) assert.equal(retryable(s), false);
});

test("Series-Codec ist verlustfrei im Datum", () => {
  const pts = [["2024-01-02", 101.25], ["2024-01-05", 101.9], ["2024-02-01", 99.123456789]];
  const d = Codec.decode(Codec.encode(pts));
  assert.deepEqual(d.map((x) => x[0]), pts.map((x) => x[0]));
  assert.ok(Math.abs(d[2][1] - 99.1235) < 1e-3);
  assert.deepEqual(Codec.decode(null), []);
});

test("Fund -> Share Class -> Listing: ohne Anbieter kein Merge, Share-Class-ID", () => {
  const row = (o) => ({ exchange: "NYSE", currency: "USD", securityType: "ETF", source: "t", ...o });
  const m = M.buildMaster([row({ symbol: "AAA", name: "Global Strategy ETF" }), row({ symbol: "BBB", name: "Global Strategy ETF" })]);
  assert.equal(m.counts.funds, 2, "kein Anbieter belegt -> nicht zusammenführen");
  const v = M.buildMaster([row({ symbol: "VTP", name: "Vanguard Total Inflation-protected Securities ETF ETF Shares" })]);
  assert.match(v.etfs[0].shareClassId, /:etf-shares$/);
  assert.equal(v.etfs[0].canonicalizationMethod, "ISSUER_AND_NORMALIZED_NAME");
  const o = M.buildMaster([row({ symbol: "BNY", name: "Bank of New York Mellon" })], { overrides: { "BNY@NYSE": { conflict: "TICKER_COLLISION_OPERATING_COMPANY", note: "x" } } });
  assert.equal(o.etfs[0].status, "REVIEW"); assert.equal(o.etfs[0].manualOverride, "x");
});
