/* Ereignisfelder im Screener (Audit B12): "Handelstage seit" Golden/Death Cross, SMA-200-Kreuzung,
   RSI 30/70, neuem 52-Wochen-Hoch und juengster Formation. Synthetische Reihen mit bekannten Kreuzungen. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Row = require("../engines/technical/screen-row.js");
const Q = require("../engines/technical/technical-query.js");
const P = require("../engines/technical/query-text.js");

const N = 270;
function dates() { const out = []; const d = new Date(Date.UTC(2025, 6, 1)); while (out.length < N) { const wd = d.getUTCDay(); if (wd && wd < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; }
const D = dates();
const flat = (v) => Array.from({ length: N }, () => v);
function input({ close = flat(100), high, sma50 = flat(90), sma200 = flat(100), rsi14 = flat(50), chartSeries } = {}) {
  const bars = { timestamps: D, open: close, high: high || close.map((c) => c + 1), low: close.map((c) => c - 1), close, volume: flat(1e6) };
  return { ticker: "TEST", bars, features: {}, chartSeries: chartSeries === undefined ? { sma50, sma200, rsi14 } : chartSeries };
}
const row = (o) => Row.computeRow(input(o));

test("Golden Cross: Tage seit der Kreuzung, 0 am Stichtag, null ohne Kreuzung", () => {
  const at = (k) => { const s = flat(90); for (let i = N - 1 - k; i < N; i++) s[i] = 110; return s; };
  assert.equal(row({ sma50: at(0) }).goldenCrossDays, 0);
  assert.equal(row({ sma50: at(7) }).goldenCrossDays, 7);
  assert.equal(row({}).goldenCrossDays, null, "SMA 50 die ganze Zeit darunter");
  assert.equal(row({ sma50: flat(110) }).goldenCrossDays, null, "die ganze Zeit darueber: keine Kreuzung im Fenster");
  assert.equal(row({ sma50: at(7) }).deathCrossDays, null);
});

test("Gleichstand zaehlt nicht als Kreuzung, die juengste Kreuzung gewinnt", () => {
  const s = flat(90); s[200] = 100; for (let i = 201; i < N; i++) s[i] = 110;   /* 90 -> 100 (gleich) -> 110 */
  assert.equal(row({ sma50: s }).goldenCrossDays, N - 1 - 201, "erst der Schritt von <= auf > ist die Kreuzung");
  const t = flat(110); for (let i = 0; i < 100; i++) t[i] = 90; for (let i = 150; i < 160; i++) t[i] = 95;
  const r = row({ sma50: t });
  assert.equal(r.goldenCrossDays, N - 1 - 160, "zweite Kreuzung bei 160");
  assert.equal(r.deathCrossDays, N - 1 - 150);
});

test("Schluss ueber/unter SMA 200 und RSI 30/70", () => {
  const close = flat(95); for (let i = N - 4; i < N; i++) close[i] = 105;
  const rsi = flat(25); for (let i = N - 2; i < N; i++) rsi[i] = 35; rsi[100] = 75; rsi[101] = 65;
  const r = row({ close, rsi14: rsi });
  assert.equal(r.crossAboveSma200Days, 3);
  assert.equal(r.crossBelowSma200Days, null);
  assert.equal(r.rsiExitOversoldDays, 1);
  assert.equal(r.rsiExitOverboughtDays, N - 1 - 101);
});

test("Neues 52-Wochen-Hoch: nur pruefbar, wo 251 Vorbars im Fenster liegen", () => {
  const close = flat(100), high = flat(101); high[N - 5] = 120;
  assert.equal(row({ close, high }).newHigh52wDays, 4);
  const h2 = flat(101); h2[30] = 130;
  assert.equal(row({ close, high: h2 }).newHigh52wDays, null, "das Hoch von Bar 30 liegt in jedem pruefbaren 252-Bar-Fenster");
  const h3 = flat(101);
  assert.equal(row({ close, high: h3 }).newHigh52wDays, 0, "Gleichstand mit dem Jahreshoch zaehlt (>=), wie newHigh52w");
});

test("Ohne chartSeries oder mit falscher Laenge: Linien-Ereignisse null, nie geschaetzt", () => {
  const r = Row.computeRow(input({ chartSeries: null }));
  for (const k of ["goldenCrossDays", "deathCrossDays", "crossAboveSma200Days", "crossBelowSma200Days", "rsiExitOversoldDays", "rsiExitOverboughtDays"]) assert.equal(r[k], null, k);
  const s = Row.computeRow(input({ chartSeries: { sma50: flat(90).slice(1), sma200: flat(100), rsi14: flat(50) } }));
  assert.equal(s.goldenCrossDays, null);
});

test("Abfragekatalog und Suche in Worten kennen die Ereignisse", () => {
  for (const id of ["goldenCrossDays", "deathCrossDays", "crossAboveSma200Days", "crossBelowSma200Days", "rsiExitOversoldDays", "rsiExitOverboughtDays", "newHigh52wDays", "formationNewDays"]) {
    const f = Q.field(id);
    assert.equal(f.group, "Ereignisse", id); assert.equal(f.kind, "num"); assert.deepEqual(f.tfs, ["1D"]);
  }
  const art = { schemaVersion: "test", cols: { s: ["A", "B", "C"], goldenCrossDays: [2, 9, null] } };
  const hit = Q.evaluate(Q.createDataset(art), { timeframe: "1D", groups: [{ filters: [{ field: "goldenCrossDays", op: "lte", value: 5 }] }] });
  assert.deepEqual(hit.indices.map((i) => art.cols.s[i]), ["A"], "ohne Kreuzung (null) kein Treffer");
  assert.equal(P.toText(P.parse("Golden Cross in den letzten 10 Tagen").query), "goldenCrossDays <= 10");
  assert.equal(P.toText(P.parse("SMA 50 über SMA 200").query), "sma50AboveSma200", "der Zustand bleibt eigener Begriff");
});
