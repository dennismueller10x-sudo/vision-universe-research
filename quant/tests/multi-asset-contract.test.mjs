/* Multi-Asset Core: Product Contract (§17, §32-37, §41, §49, §52). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Contract = require("../api/multi-asset-contract.js");
const Catalog = require("../engines/multi-asset/instrument-catalog.js");
const config = require("../config/multi-asset.json");
const calendar = require("../config/market-calendar.json");

const NOW = "2026-09-24T14:00:00Z";
const resolved = Object.fromEntries(Catalog.resolved().map((i) => [i.symbol, i]));
const src = (i) => config.sourceRegistry[i.source] || null;
const build = (symbol, points, extra) => {
  const i = resolved[symbol];
  return Contract.build(Object.assign({ instrument: i, source: src(i), series: points ? { points, frequency: "DAILY", fetchedAt: NOW } : null,
                                        capabilities: { eod: true }, now: NOW, calendar, config }, extra || {}));
};

test("Rendite: 4,20 % -> 4,35 % sind +15 bp; die relative Veraenderung ist benannt, nicht Hauptgroesse", () => {
  const c = build("US10Y", [["2026-09-22", 4.20], ["2026-09-23", 4.35]]);
  assert.equal(c.quote.state, "AVAILABLE");
  assert.equal(c.quote.unit, "PERCENT");
  assert.equal(c.quote.nativeCurrency, null);
  assert.equal(c.quote.change.semantics, "BASIS_POINTS");
  assert.equal(c.quote.change.basisPoints, 15);
  assert.equal(c.quote.change.relativePercent, 3.57);
  assert.equal(c.displaySemantics.primaryChange, "basisPoints");
  assert.equal(c.capabilities.currencyConversion, "NOT_CONVERTIBLE");
  assert.equal("price" in c.quote, false, "kein erzwungenes Feld price");
});

test("Rendite in EUR-Anzeige bleibt Prozent: present() rechnet nichts um", () => {
  const c = build("US10Y", [["2026-09-22", 4.20], ["2026-09-23", 4.35]]);
  let called = false;
  const layer = { price: () => { called = true; return null; }, preference: { get: () => "EUR" } };
  const p = Contract.present(c, { layer, displayCurrency: "EUR" });
  assert.equal(called, false);
  assert.equal(p.display.value, 4.35);
  assert.equal(p.display.currency, null);
  assert.equal(p.conversion.reason, "notMonetary");
});

test("Monetaere Einheit: Anzeigewaehrung nur ueber den Currency Core, Einheit bleibt", () => {
  const i = Object.assign({}, resolved.WTI);
  const c = Contract.build({ instrument: i, source: src(i), series: { points: [["2026-09-21", 70], ["2026-09-22", 71]], frequency: "DAILY" },
                             now: NOW, calendar, config });
  const layer = { price: (v, cur, o) => ({ available: true, display: { value: v * 0.5, currency: o.displayCurrency }, fx: { source: "stub" } }) };
  const p = Contract.present(c, { layer, displayCurrency: "EUR" });
  assert.equal(p.conversion.applied, true);
  assert.equal(p.display.currency, "EUR");
  assert.equal(p.native.unitId, "USD_PER_BARREL");
  assert.equal(p.native.value, 71);
});

test("Index ohne Quelle: CAPABILITY_GAP mit Grund, kein Wert, kein Proxy", () => {
  const c = build("NDX", null);
  assert.equal(c.quote.state, "CAPABILITY_GAP");
  assert.equal(c.quote.value, null);
  assert.equal(c.proxy.isProxy, false);
  assert.ok(c.proxy.knownProxiesNotUsed.includes("QQQ"));
  assert.ok(c.gap && c.gap.ownerOptions.length >= 2);
  assert.equal(c.capabilities.currencyConversion, "NOT_CONVERTIBLE");
});

test("S&P 500 als Index: seit Tiingo-first eine benannte Luecke - der Markt kommt ueber den Tracker SPY", () => {
  const c = build("SPX", [["2026-09-22", 6600], ["2026-09-23", 6650]]);
  assert.equal(c.quote.state, "CAPABILITY_GAP");
  assert.equal(c.quote.value, null);
  assert.deepEqual(c.history.recent, []);
  assert.equal(c.proxy.isProxy, false);
  assert.match(c.gap.consumerRepresentation, /SPY/);
  assert.equal(c.data.source, null, "keine FMP-Quelle mehr");
});

test("Tracker QQQ: ETF, Kurs je Anteil in USD, isProxy true mit Kennzeichnung - kein Indexstand", () => {
  const c = build("QQQ", [["2026-09-23", 600], ["2026-09-24", 606]]);
  assert.equal(c.instrument.assetClass, "ETF");
  assert.equal(c.instrument.instrumentSubtype, "INDEX_TRACKER");
  assert.notEqual(c.instrument.assetClass, "INDEX");
  assert.equal(c.quote.unitId, "USD_PER_SHARE");
  assert.notEqual(c.quote.unitDisplay, "Pkt.");
  assert.equal(c.quote.valueSemantics, "PRICE");
  assert.equal(c.proxy.isProxy, true);
  assert.equal(c.proxy.isIndexLevel, false);
  assert.equal(c.proxy.represents, "NASDAQ_100");
  assert.equal(c.tracker.displayMarketName, "Nasdaq 100");
  assert.equal(c.tracker.trackerDisclosure, "Markt-Tracker: Invesco QQQ");
  assert.equal(c.tracker.changePercent, 1);
  assert.equal(c.tracker.price, 606);
  assert.equal(c.market.displayMarket, "NASDAQ_100");
  assert.equal(c.market.underlyingType, "INDEX");
  assert.equal(c.market.trackedBy, "QQQ");
  assert.equal(c.market.tradingSession, "US_EQUITY_ETF");
  assert.equal(c.license.state, "LICENSE_CONFIRMED");
  assert.match(c.displaySemantics.note, /kein Indexstand/);
});

test("SPY und DIA: dieselbe Tracker-Semantik, richtige Indexzuordnung", () => {
  const spy = build("SPY", [["2026-09-23", 660], ["2026-09-24", 661]]);
  const dia = build("DIA", [["2026-09-23", 460], ["2026-09-24", 459]]);
  assert.equal(spy.proxy.represents, "SP500");
  assert.equal(dia.proxy.represents, "DOW_JONES_INDUSTRIAL_AVERAGE");
  for (const c of [spy, dia]) { assert.equal(c.instrument.assetClass, "ETF"); assert.equal(c.quote.unitId, "USD_PER_SHARE"); }
});

test("Tracker in EUR: Kurs ueber den Currency Core, die Prozentbewegung bleibt unveraendert", () => {
  const c = build("QQQ", [["2026-09-23", 600], ["2026-09-24", 606]]);
  let calls = 0;
  const layer = { price: (v, cur, o) => { calls++; return { available: true, display: { value: v * 0.9, currency: o.displayCurrency } }; } };
  const p = Contract.present(c, { layer, displayCurrency: "EUR" });
  assert.equal(calls, 1);
  assert.equal(p.display.currency, "EUR");
  assert.equal(p.native.unitId, "USD_PER_SHARE");
  assert.equal(c.quote.change.percent, 1, "Prozent werden nicht umgerechnet");
});

test("Tracker-Sitzung: 08:00 New York ist fuer den ETF Vorboerse, fuer den Index geschlossen", () => {
  const at = "2026-09-24T12:00:00Z";
  const etf = Contract.refresh(build("QQQ", [["2026-09-22", 600], ["2026-09-23", 606]]), { now: at, calendar, config });
  assert.equal(etf.market.state, "PRE_MARKET");
  assert.equal(etf.market.sessionProfile, "US_EQUITY_ETF");
});

test("Nikkei 225 ueber FRED: Punkte, keine Umrechnung, Quellenangabe nennt Nikkei und FRED", () => {
  const c = build("N225", [["2026-09-22", 45000], ["2026-09-24", 45450]]);
  assert.equal(c.quote.state, "AVAILABLE");
  assert.equal(c.quote.value, 45450);
  assert.equal(c.quote.unitId, "POINTS");
  assert.equal(c.capabilities.currencyConversion, "NOT_CONVERTIBLE");
  assert.match(JSON.stringify(c.data.provenance), /Nikkei Inc\., via FRED/);
});

test("Gold via Tiingo: angezeigt als Development-Risiko, ausdruecklich ohne kommerzielle Freigabe", () => {
  const c = build("XAUUSD", [["2026-09-22", 3700], ["2026-09-23", 3720]]);
  assert.equal(c.quote.state, "AVAILABLE");
  assert.equal(c.quote.value, 3720);
  assert.equal(c.license.state, "OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT");
  assert.equal(c.license.preCommercialLicenseConfirmationRequired, true);
  assert.equal(c.license.commercialDisplayApproved, false);
});

test("Lizenz ausstehend bleibt ohne Wert (Mechanik, unabhaengig von Tiingo)", () => {
  const i = Object.assign({}, resolved.XAUUSD, { status: "LICENSE_PENDING" });
  const c = Contract.build({ instrument: i, source: config.sourceRegistry["fmp-index"], series: { points: [["2026-09-22", 1], ["2026-09-23", 2]], frequency: "DAILY" },
                             capabilities: { eod: true }, now: NOW, calendar, config });
  assert.equal(c.quote.state, "WITHHELD_LICENSE");
  assert.equal(c.quote.value, null);
  assert.deepEqual(c.history.recent, []);
  assert.equal(c.license.state, "UNAVAILABLE");
  assert.equal(c.license.withheld, true);
});

test("Leitzins als Stufenserie: Veraenderung zum vorigen Beschluss, Zeitraeume trotz weniger Punkte", () => {
  const steps = [["2019-09-18", -0.5], ["2022-07-27", 0], ["2023-09-20", 4.0], ["2024-06-12", 3.75], ["2025-06-11", 2.0]];
  const c = build("ECB_DFR", steps, {
    series: { points: steps, frequency: "EVENT", representation: "STEPS", fetchedAt: NOW },
    latest: { value: 2.0, asOf: "2025-06-11", observationDate: "2026-09-24", effectiveSince: "2025-06-11", frequency: "EVENT", checkedAt: NOW }
  });
  assert.equal(c.quote.change.basisPoints, -175);
  assert.equal(c.quote.changeReferenceDate, "2024-06-12");
  assert.equal(c.data.freshness.state, "CURRENT");
  assert.equal(c.history.intervals["1Y"], true);
  assert.equal(c.history.intervals["5Y"], true);
});

test("Fed-Zielband: Bereich mit Unter- und Obergrenze", () => {
  const c = build("FED_TARGET", [["2025-12-10", 3.75]], {
    series: { points: [["2025-09-17", 4.25], ["2025-12-10", 3.75]], frequency: "EVENT", representation: "STEPS", fetchedAt: NOW },
    latest: { value: 3.75, lower: 3.5, upper: 3.75, asOf: "2025-12-10", observationDate: "2026-09-23", frequency: "EVENT", checkedAt: NOW }
  });
  assert.deepEqual(c.quote.range, { lower: 3.5, upper: 3.75 });
  assert.equal(c.quote.change.basisPoints, -50);
});

test("Zeitraeume nur, wo die Reihe sie traegt", () => {
  const c = build("US2Y", [["2026-08-01", 3.9], ["2026-09-01", 3.8], ["2026-09-23", 3.7]]);
  assert.equal(c.history.intervals["1M"], true);
  assert.equal(c.history.intervals["1Y"], false);
  assert.equal(c.history.intervals["1D"], false);
  assert.equal(c.performance["1Y"], undefined);
});

test("Intraday-Stand gegen den letzten Tagesschluss, nicht gegen den vorletzten", () => {
  const i = Object.assign({}, resolved.BTCUSD, { status: "ACTIVE" });
  const c = Contract.build({ instrument: i, source: Object.assign({}, src(i), { publicDisplay: true }),
    series: { points: [["2026-09-22", 100], ["2026-09-23", 110]], frequency: "DAILY" },
    latest: { value: 121, asOf: "2026-09-24T13:55:00Z", observationDate: "2026-09-24", frequency: "INTRADAY" },
    now: NOW, calendar, config });
  assert.equal(c.quote.changeReferenceDate, "2026-09-23");
  assert.equal(c.quote.change.percent, 10);
  assert.equal(c.data.freshness.state, "CURRENT");
  assert.equal(c.data.realtime, false);
});

test("refresh(): der Zustand folgt der Uhr, nicht dem Bauzeitpunkt", () => {
  const c = build("US10Y", [["2026-09-22", 4.2], ["2026-09-23", 4.3]]);
  assert.equal(c.data.freshness.state, "CURRENT");
  const later = Contract.refresh(c, { now: "2026-10-05T14:00:00Z", calendar, config });
  assert.equal(later.data.freshness.state, "STALE");
});
