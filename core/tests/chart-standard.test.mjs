/* Chartstandard (core/chart-standard.js): Zeitraeume, Start 1T, Intraday-Aufloesung, Waehrung.
   Die Waehrungsfaelle laufen gegen die echte FX-Schicht und die veroeffentlichte EZB-Reihe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CS = require("../chart-standard.js");
const Rates = require("../../quant/engines/fx/fx-rates.js");
const Contract = require("../../quant/engines/fx/currency-contract.js");

const mem = () => ({ m: {}, getItem(k) { return this.m[k] || null; }, setItem(k, v) { this.m[k] = String(v); } });
function layer(pref) {
  const ecb = JSON.parse(readFileSync(new URL("../../quant/data/market/fx/ecb/EURUSD.json", import.meta.url)));
  const store = Rates.createStore();
  store.ingest("EUR", "USD", ecb.points, { source: "ecb", frequency: "DAILY" });
  const L = Contract.createLayer({ store, storage: mem() });
  if (pref) L.preference.set(pref);
  return { L, ecb: new Map(ecb.points) };
}

test("Reihenfolge: Hauptleiste 1T 1W 1M 1J 5J MAX, vorhandene weitere dahinter", () => {
  const quant = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"];
  assert.deepEqual(CS.order(quant), ["1D", "5D", "1M", "1Y", "5Y", "MAX", "3M", "6M", "YTD", "3Y", "10Y"]);
  assert.equal(CS.canonical("5D"), "1W");
  assert.equal(CS.canonical("Max"), "MAX");
});

test("Start: 1T, sonst gemerkte Wahl, ohne Tagesverlauf der laengste bis 1J", () => {
  const all = () => true;
  assert.equal(CS.startRange(all, null, mem()), "1T");
  const s = mem(); CS.rememberRange("5Y", s);
  assert.equal(CS.startRange(all, null, s), "5J", "gewaehlter Zeitraum gilt auch in der naechsten Welt");
  assert.equal(CS.startRange((id) => id !== "5J", null, s), "1T", "gemerkter, hier nicht verfuegbarer Zeitraum faellt auf 1T");
  assert.equal(CS.startRange((id) => id !== "1T", null, mem()), "1J", "ohne Tagesverlauf kein kuenstliches 1T");
  assert.equal(CS.startRange((id) => id === "1M" || id === "MAX", null, mem()), "1M");
  assert.equal(CS.startRange(all, ["1J", "6M"], mem()), "1J", "nur angebotene Zeitraeume");
  assert.equal(CS.startRange(all, null, null), "1T", "ohne Speicher");
});

test("Intraday: entries zuerst, sonst juengste Sitzung aus available (wie live-hub.js)", () => {
  const index = {
    entries: { NVDA: { path: "/quant/data/market/intraday/2026-10-22/ref_NVDA.json", sessionDate: "2026-10-22" } },
    available: { "2026-10-21": ["AAPL", "BRK-B"], "2026-10-22": ["AAPL"] },
    idExceptions: { "BRK-B": "ref_BRK_B" }, idPattern: "ref_<symbol>",
    pathPattern: "/quant/data/market/intraday/<sessionDate>/<securityId>.json"
  };
  assert.equal(CS.intradayEntry(index, "NVDA").derived, false);
  assert.deepEqual(CS.intradayEntry(index, "AAPL"), { path: "/quant/data/market/intraday/2026-10-22/ref_AAPL.json", sessionDate: "2026-10-22", derived: true });
  assert.equal(CS.intradayEntry(index, "BRK-B").path, "/quant/data/market/intraday/2026-10-21/ref_BRK_B.json");
  assert.equal(CS.intradayEntry(index, "XYZ"), null);
});

test("EUR (Vorgabe): jeder Punkt mit dem EZB-Kurs SEINES Tages, nicht mit dem heutigen", () => {
  const { L, ecb } = layer();
  const pts = [["2025-01-02", 100], ["2026-10-22", 100]];
  const r = CS.displaySeries(pts, "USD", L);
  assert.equal(r.currency, "EUR");
  assert.ok(Math.abs(r.points[0][1] - 100 / ecb.get("2025-01-02")) < 1e-9);
  assert.ok(Math.abs(r.points[1][1] - 100 / ecb.get("2026-10-22")) < 1e-9);
  assert.notEqual(r.points[0][1].toFixed(4), r.points[1][1].toFixed(4));
});

test("Boersenwaehrung gewaehlt: Reihe unveraendert", () => {
  const { L } = layer("USD");
  const pts = [["2026-10-21", 221.97], ["2026-10-22", 212.21]];
  const r = CS.displaySeries(pts, "USD", L);
  assert.equal(r.currency, "USD"); assert.equal(r.converted, false); assert.deepEqual(r.points, pts);
});

test("1T: Punkte und Vortagesschluss mit dem Kurs der Sitzung, Prozentveraenderung bleibt", () => {
  const { L } = layer();
  const snap = { sessionDate: "2026-10-22", previousClose: 221.97, points: [["09:30", 218.42], ["15:55", 212.27]] };
  const r = CS.displaySnapshot(snap, "USD", L);
  assert.equal(r.currency, "EUR");
  const usd = snap.points[1][1] / snap.previousClose, eur = r.snap.points[1][1] / r.snap.previousClose;
  assert.ok(Math.abs(usd - eur) < 1e-12);
  assert.equal(snap.points[1][1], 212.27, "Original unveraendert");
});

test("Kursmarke: juengster Kurs, Original reist mit; ohne Schicht Boersenwaehrung", () => {
  const { L } = layer();
  const r = CS.displayLevel(232.41, "USD", L);
  assert.equal(r.currency, "EUR"); assert.equal(r.original.value, 232.41); assert.ok(r.value < 232.41);
  const n = CS.displayLevel(232.41, "USD", null);
  assert.equal(n.converted, false); assert.equal(n.value, 232.41);
});

test("Kein gueltiger Kurs: keine Umrechnung mit altem Kurs, Boersenwaehrung", () => {
  const { L } = layer();
  const r = CS.displaySeries([["2031-01-02", 10], ["2031-01-03", 11]], "USD", L);
  assert.equal(r.currency, "USD"); assert.equal(r.converted, false);
});

test("Fenster: Kalendertage ab dem letzten Punkt, 95-%-Regel wie chart-history.js", () => {
  const H = require("../chart-history.js");
  const pts = []; for (let d = Date.parse("2024-01-02"); d <= Date.parse("2026-10-22"); d += 86400000) { const w = new Date(d).getUTCDay(); if (w && w < 6) pts.push([new Date(d).toISOString().slice(0, 10), 100 + pts.length]); }
  for (const [id, old] of [["1M", "1M"], ["1J", "1Y"], ["MAX", "MAX"]]) {
    assert.deepEqual(CS.slice(pts, id), H.sliceRange(pts, old).points, id + " wie chart-history.js");
    assert.equal(CS.covers(pts, id), H.available(pts, old), id);
  }
  assert.equal(CS.slice(pts, "1W").length, 6, "1W: sieben Kalendertage, sechs Handelstage inkl. Rand");
  assert.equal(CS.slice(pts, "YTD")[0][0], "2026-01-01", "ab 1. Januar (Testreihe ohne Feiertage)");
  assert.equal(CS.covers(pts, "5J"), false, "knapp drei Jahre decken 5J nicht ab");
  assert.equal(CS.covers(pts, "1T"), false, "1T nie aus Tagesschluessen");
});
