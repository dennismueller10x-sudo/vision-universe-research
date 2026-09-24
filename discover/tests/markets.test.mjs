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

test("Index ohne Quelle und Gold ohne Freigabe: kein Wert, keine erfundene Zahl", () => {
  assert.equal(M.wertText(build("SPX", null), null), null);
  assert.equal(M.wertText(build("XAUUSD", [["2026-09-22", 1], ["2026-09-23", 2]]), null), null);
});

test("Gruppen je Assetklasse, Reihenfolge Aktienmaerkte, Zinsen, Rohstoffe, Krypto, Devisen", () => {
  const contracts = ["SPX", "US10Y", "WTI", "BTCUSD", "EURUSD"].map((s) => build(s, null));
  const g = M.gruppieren(contracts);
  assert.deepEqual(JSON.parse(JSON.stringify(g.map((x) => x.id))), ["aktien", "zinsen", "rohstoffe", "krypto", "devisen"]);
});

test("Stand: ein reiner Tag bleibt ein Tag", () => {
  assert.equal(M.standText("2026-09-23"), "23.09.2026");
});

test("Keine Gewinn-/Verlustfarbe fuer Zinsbewegungen", () => {
  const src = readFileSync(new URL("../ui/markets.js", import.meta.url), "utf8");
  assert.match(src, /is-neutral/);
  assert.match(src, /semantics === "PERCENT_OF_VALUE"/);
});
