import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../engines/etf-master.js");
const P = require("../engines/etf-provider.js");

const row = (o) => ({ exchange: "NYSE", currency: "USD", country: "US", securityType: "ETF", source: "tiingo:test", ...o });

test("Leveraged / Inverse werden erkannt und als komplex markiert", () => {
  const l = M.classify({ symbol: "X", name: "Defiance Daily Target 2X Long Amkr ETF" });
  assert.equal(l.leverage, 2); assert.equal(l.inverse, false); assert.equal(l.complex, true); assert.equal(l.singleStockUnderlying, "AMKR");
  const i = M.classify({ symbol: "Y", name: "ProShares UltraShort Top QQQ" });
  assert.equal(i.inverse, true); assert.equal(i.complex, true);
  const bear = M.classify({ symbol: "Z", name: "Direxion Daily S&P 500 Bear 3X Shares" });
  assert.equal(bear.leverage, 3); assert.equal(bear.inverse, true);
});

test("Short Duration / Ultrashort Income ist KEIN Short-ETF", () => {
  for (const n of ["PGIM Short Duration High Yield ETF", "Doubleline Ultrashort Income ETF", "Pgim Corporate Bond 0-5 Year ETF"]) {
    const c = M.classify({ symbol: "S", name: n });
    assert.equal(c.inverse, false, n); assert.equal(c.leverage, 1, n); assert.equal(c.assetClass, "BOND", n);
  }
});

test("Klassische Index-ETFs: Anbieter, Index, Region", () => {
  const c = M.classify({ symbol: "XOEF", name: "Ishares S&P 500 EX S&P 100 ETF" });
  assert.equal(c.issuer, "BlackRock (iShares)"); assert.equal(c.index, "S&P 500 ex S&P 100"); assert.equal(c.region, "USA"); assert.equal(c.complex, false);
  const e = M.classify({ symbol: "EEM", name: "iShares MSCI Emerging Markets ETF" });
  assert.equal(e.region, "EMERGING_MARKETS"); assert.equal(e.index, "MSCI Emerging Markets");
  const q = M.classify({ symbol: "QQQ", name: "Invesco QQQ Trust", trackedIndex: "Nasdaq-100", assetClassHint: "EQUITY" });
  assert.equal(q.index, "Nasdaq-100"); assert.equal(q.region, "USA");
});

test("Null-Handling: fehlende Metadaten bleiben null und stehen in missingFields", () => {
  const m = M.buildMaster([row({ symbol: "ABC", name: "Unknown Strategy ETF" })]);
  const e = m.etfs[0];
  assert.equal(e.ter, null); assert.equal(e.isin, null); assert.equal(e.fundSize, null);
  assert.ok(e.missingFields.includes("ter")); assert.ok(e.missingFields.includes("isin"));
  const q = M.dataQuality(e);
  assert.ok(q.coverage > 0 && q.coverage < 1);
});

test("ETF-Matching: Namensbeleg statt Gattung, REIT/Bank wird abgelehnt", () => {
  assert.equal(M.etfEvidence({ name: "ProShares Trust Ultra PLTR", securityType: "COMMON_STOCK" }).candidate, true);
  assert.equal(M.etfEvidence({ name: "Vornado Realty Trust", securityType: "COMMON_STOCK" }).candidate, false);
  assert.equal(M.etfEvidence({ name: "Blackstone Secured Lending Fund", securityType: "COMMON_STOCK" }).candidate, false);
  const conflict = M.etfEvidence({ name: "Bank of New York Mellon", securityType: "ETF" });
  assert.equal(conflict.candidate, true); assert.ok(conflict.conflict);
});

test("Tickerkollision wird REVIEW und ist nicht fuer Endnutzer sichtbar", () => {
  const m = M.buildMaster([row({ symbol: "BNY", name: "Bank of New York Mellon" })]);
  assert.equal(m.etfs[0].status, "REVIEW"); assert.equal(m.etfs[0].consumerVisible, false);
  assert.equal(m.conflicts.length, 1);
});

test("Duplicate Detection: gleiche Zeile aus zwei Quellen = ein Listing", () => {
  const m = M.buildMaster([row({ symbol: "SPY", name: "SPDR S&P 500 ETF Trust", source: "a" }), row({ symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "nyse", source: "b" })]);
  assert.equal(m.counts.listings, 1);
  assert.deepEqual(m.etfs[0].sources, ["a", "b"]);
});

test("Mehrere Listings: gleicher Ticker an zwei Boersen = zwei Listings, ein Duplikat-Hinweis", () => {
  const m = M.buildMaster([row({ symbol: "CHAI", name: "Example AI ETF", exchange: "NASDAQ" }), row({ symbol: "CHAI", name: "Example AI ETF", exchange: "NYSE ARCA" })]);
  assert.equal(m.counts.listings, 2);
  assert.equal(m.duplicateTickers.length, 1);
  assert.equal(m.counts.funds, 1, "derselbe Fonds wird nicht doppelt gezaehlt");
});

test("Fund -> Share Class: ETF-Shares-Klasse wird erkannt und zum Fonds gruppiert", () => {
  const m = M.buildMaster([row({ symbol: "VTP", name: "Vanguard Total Inflation-protected Securities ETF ETF Shares" })]);
  assert.equal(m.etfs[0].shareClass, "ETF Shares");
  assert.ok(m.etfs[0].canonicalETFId.startsWith("vu-etf-"));
});

test("Delisteter ETF ist INACTIVE und nicht sichtbar", () => {
  const m = M.buildMaster([row({ symbol: "OLD", name: "Old Closed ETF", active: false, lastTradeDate: "2022-12-16" })]);
  assert.equal(m.etfs[0].status, "INACTIVE"); assert.equal(m.etfs[0].consumerVisible, false);
});

test("Fremdwaehrung bleibt erhalten, nicht umgerechnet", () => {
  const m = M.buildMaster([row({ symbol: "EUNL", name: "iShares Core MSCI World UCITS ETF", currency: "EUR", exchange: "XETRA", country: "DE" })]);
  assert.equal(m.etfs[0].currency, "EUR"); assert.equal(m.etfs[0].region, "GLOBAL");
});

test("ETF-DNA: ohne Daten keine Schaetzung", () => {
  const d = M.dna({ region: null }, {});
  for (const k of Object.keys(d)) assert.equal(d[k].value, null, k);
  const d2 = M.dna({ region: "GLOBAL" }, { volatility: 0.15, maxDrawdown: -0.34, momentum12m: 0.12, historyYears: 10 });
  assert.equal(d2.volatility.status, "CALCULATED"); assert.equal(d2.cost.value, null);
});

test("Suche: Ticker exakt zuerst, Name, Index, Anbieter", () => {
  const etfs = [{ symbol: "SPY", name: "SPDR S&P 500 ETF Trust", index: "S&P 500", issuer: "State Street (SPDR)", consumerVisible: true },
    { symbol: "XOEF", name: "Ishares S&P 500 EX S&P 100 ETF", index: "S&P 500 ex S&P 100", issuer: "BlackRock (iShares)", consumerVisible: true }];
  assert.equal(M.search(etfs, "spy")[0].symbol, "SPY");
  assert.equal(M.search(etfs, "ishares")[0].symbol, "XOEF");
  assert.equal(M.search(etfs, "s&p 500").length, 2);
  assert.equal(M.search(etfs, "").length, 0);
});

test("Provider Adapter: Huelle, Abdeckung, Rangfolge, nicht angeschlossene Anbieter liefern nichts", () => {
  const t = P.createTiingoAdapter({ rows: [{ symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE ARCA", currency: "USD", canonicalETFId: "vu-etf-1" }],
    series: { SPY: { points: [["2026-01-02", 1], ["2026-01-05", 2]], asOf: "2026-01-05" } }, asOf: "2026-01-05" });
  const rec = t.getMetadata("SPY");
  assert.equal(rec.provider, "tiingo"); assert.equal(rec.canonicalETFId, "vu-etf-1");
  assert.ok(rec.fieldCoverage > 0 && rec.fieldCoverage < 1); assert.ok(rec.missingFields.includes("inceptionDate"));
  assert.equal(t.getMetadata("NOPE"), null);
  const issuer = P.createDisconnectedAdapter("issuer");
  assert.equal(issuer.getMetadata("SPY"), null);
  const reg = P.registry([t, issuer]);
  assert.equal(reg.metadata("SPY").fields.name, "SPDR S&P 500 ETF Trust");
  assert.equal(reg.prices("SPY").provider, "tiingo");
  assert.ok(reg.status().some((s) => s.provider === "morningstar" && s.status === "NOT_CONNECTED"));
  // Emittent schlaegt Kursanbieter bei Stammdaten
  const merged = P.merge([P.record("tiingo", "SPY", "x", { name: "A", ter: null }), P.record("issuer", "SPY", "x", { name: "B", ter: 0.0009 })], "meta");
  assert.equal(merged.fields.name, "B"); assert.equal(merged.fields.ter, 0.0009); assert.equal(merged.provenance.ter.provider, "issuer");
  assert.throws(() => P.record("unknown", "X"));
});
