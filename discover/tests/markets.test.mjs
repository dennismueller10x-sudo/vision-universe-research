/* Discover — Märkte: konsumiert den Multi-Asset Product Contract (§53, §54). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const Contract = require("../../quant/api/multi-asset-contract.js");
const Catalog = require("../../quant/engines/multi-asset/instrument-catalog.js");
const config = require("../../quant/config/multi-asset.json");
const calendar = require("../../quant/config/market-calendar.json");

/* Ein minimaler Browser: el() baut Objekte statt DOM-Knoten. */
function load() {
  const el = (tag, attrs, kids) => ({ tag, attrs: attrs || {}, children: kids || [] });
  const ctx = { QuantShell: { el, loadJSON: () => Promise.reject(new Error("offline")) }, VUMultiAssetContract: Contract,
                Intl, Date, Math, String, Object, Array, JSON, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../ui/markets.js", import.meta.url), "utf8"), ctx);
  return ctx.VUDiscover.Markets;
}
const M = load();
const NOW = "2026-09-24T14:00:00Z";
const resolved = Object.fromEntries(Catalog.resolved().map((i) => [i.symbol, i]));
const build = (sym, points, extra) => Contract.build(Object.assign({
  instrument: resolved[sym], source: config.sourceRegistry[resolved[sym].source] || null,
  series: points ? { points, frequency: "DAILY" } : null, now: NOW, calendar, config }, extra || {}));

test("Rendite: Prozent mit Komma, Veraenderung in Basispunkten - nie als Kursrendite", () => {
  const c = build("US10Y", [["2026-09-22", 4.20], ["2026-09-23", 4.35]]);
  assert.equal(M.wertText(c, null), "4,35 %");
  assert.equal(M.veraenderungText(c), "+15 bp");
});

test("Rendite bei EUR-Anzeige: kein Euro-Zeichen, keine Umrechnung", () => {
  const c = build("DE10Y", [["2026-09-23", 2.6], ["2026-09-24", 2.7]]);
  let called = false;
  const layer = { price: () => { called = true; return null; }, preference: { get: () => "EUR" } };
  assert.equal(M.wertText(c, layer), "2,70 %");
  assert.equal(called, false);
});

test("Rohoel: monetaer, Einheit je Barrel bleibt sichtbar", () => {
  const c = build("WTI", [["2026-09-21", 70], ["2026-09-22", 71.5]]);
  const text = M.wertText(c, null);
  assert.match(text, /71,50/);
  assert.match(text, /\/bbl$/);
  assert.equal(M.veraenderungText(c), "+2,14 %");
});

test("Leitzins-Zielband: Bereich, Veraenderung zum vorigen Beschluss", () => {
  const c = build("FED_TARGET", null, {
    series: { points: [["2025-09-17", 4.25], ["2025-12-10", 3.75]], frequency: "EVENT", representation: "STEPS" },
    latest: { value: 3.75, lower: 3.5, upper: 3.75, asOf: "2025-12-10", observationDate: "2026-09-23", frequency: "EVENT", checkedAt: NOW }
  });
  assert.equal(M.wertText(c, null), "3,50–3,75 %");
  assert.equal(M.veraenderungText(c), "−50 bp");
});

test("Index ohne Quelle: kein Wert, keine erfundene Zahl", () => {
  assert.equal(M.wertText(build("SPX", null), null), null);
  assert.equal(M.wertText(build("NDX", null), null), null);
});

test("Tracker QQQ: Markt als Titel, Tracker sichtbar, Kurs in Waehrung - nie Indexpunkte", () => {
  const c = build("QQQ", [["2026-09-23", 600], ["2026-09-24", 607.44]]);
  const kopf = M.kopfText(c);
  assert.equal(kopf.titel, "Nasdaq 100");
  assert.equal(kopf.klasse, "Tracker · QQQ");
  const wert = M.wertText(c, null);
  assert.doesNotMatch(wert, /Pkt/);
  assert.match(wert, /607,44/);
  assert.equal(M.veraenderungText(c), "+1,24 %");
  assert.match(M.semantikKurz(c), /Markt-Tracker: Invesco QQQ/);
  assert.match(M.semantikKurz(c), /nicht der offizielle Indexstand/);
});

test("Aktienmaerkte: Tracker QQQ/SPY/DIA vorn, Nikkei als echter Index, keine leeren Indexkarten", () => {
  const syms = ["SPY", "DIA", "QQQ", "N225", "SPX", "NDX", "DJI", "UKX", "DAX"];
  const contracts = syms.map((s) => build(s, ["SPY", "DIA", "QQQ", "N225"].includes(s) ? [["2026-09-23", 100], ["2026-09-24", 101]] : null));
  const aktien = M.gruppieren(contracts).find((g) => g.id === "aktien");
  const ids = JSON.parse(JSON.stringify(aktien.karten.map((c) => c.instrument.symbol)));
  assert.deepEqual(ids, ["QQQ", "SPY", "DIA", "N225"], "Indizes ohne Quelle erscheinen nicht");
  for (const c of aktien.karten.filter((k) => k.tracker)) {
    assert.equal(c.instrument.assetClass, "ETF");
    assert.equal(c.proxy.isProxy, true);
    assert.equal(M.kopfText(c).klasse, "Tracker · " + c.instrument.symbol);
    assert.doesNotMatch(M.wertText(c, null), /Pkt/);
  }
  const n225 = aktien.karten.find((c) => c.instrument.symbol === "N225");
  assert.equal(n225.instrument.assetClass, "INDEX");
  assert.match(M.wertText(n225, null), /Pkt\.$/);
});

test("Owner-Liste: jede Gruppe mit genau den freigegebenen Instrumenten, Klasse passt zum Katalog", () => {
  const erwartet = {
    aktien: ["QQQ", "SPY", "DIA", "N225"], energie: ["WTI", "BRENT", "NATGAS"],
    edelmetalle: ["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"], krypto: ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"],
    "us-renditen": ["US2Y", "US5Y", "US10Y", "US30Y"], "eu-renditen": ["DE2Y", "DE10Y", "DE30Y"],
    leitzinsen: ["FED_TARGET", "US_EFFR", "ECB_DFR"], devisen: ["EURUSD"]
  };
  const gruppen = Object.fromEntries(M.GRUPPEN.map((g) => [g.id, g]));
  assert.deepEqual(Object.keys(gruppen), Object.keys(erwartet));
  for (const [id, syms] of Object.entries(erwartet)) {
    for (const s of syms) assert.ok(gruppen[id].symbole.includes(s), id + " enthaelt " + s);
  }
  for (const g of M.GRUPPEN) for (const s of g.symbole) {
    assert.ok(resolved[s], s + " steht im Katalog");
    assert.ok(g.klassen.includes(resolved[s].assetClass), s + " passt zur Gruppe " + g.id);
  }
});

test("Krypto: 24/7 - keine Boersensitzung, kein Handelsschluss", () => {
  const c = build("BTCUSD", [["2026-09-23", 84000], ["2026-09-24", 84212.9]]);
  assert.equal(M.marktText(c), "Handel rund um die Uhr (24/7)");
  assert.equal(c.market.sessionProfile, "CRYPTO_24_7");
  assert.doesNotMatch(M.semantikKurz(c), /Sitzung|Börsenschluss am/);
  assert.match(M.veraenderungText(c), /%$/);
});

test("Tracker: Marktzustand der US-Handelssitzung, keine Indexsitzung", () => {
  const c = build("SPY", [["2026-09-23", 760], ["2026-09-24", 767.18]]);
  assert.match(M.marktText(c), /^US-Handelssitzung: /);
  assert.equal(c.market.tradingSession, "US_EQUITY_ETF");
});

test("Tageswerte, Fixings und Beschluesse haben keinen Handelszustand", () => {
  assert.equal(M.marktText(build("US10Y", [["2026-09-22", 4.2], ["2026-09-23", 4.35]])), null);
  assert.equal(M.marktText(build("EURUSD", [["2026-09-22", 1.15], ["2026-09-23", 1.149]])), null);
  assert.equal(M.marktText(build("ECB_DFR", [["2025-06-11", 2.0]])), null);
});

test("EFFR: Prozent, Veraenderung in Basispunkten, keine Kursfarbe", () => {
  const c = build("US_EFFR", [["2026-09-22", 3.88], ["2026-09-23", 3.83]]);
  assert.equal(M.wertText(c, null), "3,83 %");
  assert.equal(M.veraenderungText(c), "−5 bp");
  const karte = JSON.parse(JSON.stringify(M.gruppieren([c])[0].karten[0].quote.change));
  assert.equal(karte.semantics, "BASIS_POINTS");
});

test("Rohoel in EUR: Umrechnung nur ueber den Currency Core, Einheit bleibt je Barrel", () => {
  const c = build("BRENT", [["2026-09-21", 110], ["2026-09-22", 114.89]]);
  const aufrufe = [];
  const layer = { preference: { get: () => "EUR" },
    price: (v, cur, o) => { aufrufe.push([v, cur, o.displayCurrency]); return { available: true, display: { value: v / 1.149, currency: "EUR" } }; } };
  const text = M.wertText(c, layer);
  assert.deepEqual(aufrufe, [[114.89, "USD", "EUR"]]);
  assert.match(text, /99,99/);
  assert.match(text, /\/bbl$/);
  assert.equal(M.veraenderungText(c), "+4,45 %", "Prozent wird nicht umgerechnet");
});

test("Platin und Palladium: je Unze", () => {
  assert.match(M.wertText(build("XPTUSD", [["2026-09-23", 1750], ["2026-09-24", 1758.87]]), null), /1\.758,87.*\/oz$/);
  assert.match(M.wertText(build("XPDUSD", [["2026-09-23", 1250], ["2026-09-24", 1262.63]]), null), /\/oz$/);
});

test("Gold (Development-Risiko akzeptiert): Wert mit Einheit je Unze", () => {
  const c = build("XAUUSD", [["2026-09-22", 3700], ["2026-09-23", 3720]]);
  assert.match(M.wertText(c, null), /3\.720,00/);
  assert.match(M.wertText(c, null), /\/oz$/);
});

test("Gruppen in der Reihenfolge der Owner-Liste", () => {
  const contracts = ["EURUSD", "ECB_DFR", "DE10Y", "US10Y", "BTCUSD", "XAUUSD", "WTI", "QQQ"].map((s) => build(s, null));
  const g = M.gruppieren(contracts);
  assert.deepEqual(JSON.parse(JSON.stringify(g.map((x) => x.id))),
    ["aktien", "energie", "edelmetalle", "krypto", "us-renditen", "eu-renditen", "leitzinsen", "devisen"]);
});

test("Keine Providerlogik in Discover", () => {
  const src = readFileSync(new URL("../ui/markets.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /tiingo\.com|api\.|apikey|token=|fetch\(|XMLHttpRequest|WebSocket/i);
  assert.doesNotMatch(src, /eia\.gov|treasury\.gov|bundesbank|stlouisfed|ecb\.europa/i);
});

test("Stand: ein reiner Tag bleibt ein Tag", () => {
  assert.equal(M.standText("2026-09-23"), "23.09.2026");
});

test("Keine Gewinn-/Verlustfarbe fuer Zinsbewegungen", () => {
  const src = readFileSync(new URL("../ui/markets.js", import.meta.url), "utf8");
  assert.match(src, /is-neutral/);
  assert.match(src, /semantics === "PERCENT_OF_VALUE"/);
});
