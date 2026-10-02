/* Vision Universe — ask/tests/ask-engine.test.mjs
   Die Auswertung laeuft auf einem kleinen Universum aus Pappe, aber mit
   der echten Screener-Engine und der echten Uebersetzung. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { translate } from "../../workers/vu-ask/src/translate.mjs";

const require = createRequire(import.meta.url);
const Engine = require("../../screener/engine/engine.js");
const Ask = require("../engine.js");

const N = 4;
const col = (vals) => vals;
function artifact() {
  const cols = { s: ["AAA", "BBB", "CCC", "DDD"], n: ["Alpha", "Beta", "Gamma", "Delta"], co: Array(N).fill("US"), ipo: Array(N).fill("2000-01-01"),
    mcap: col([5e8, 1.5e9, 5e9, 4e8]), newHigh: col([true, true, true, false]), fQuality: col([60, 40, 70, 80]), fcfGrowth: col([0.3, null, 0.1, 0.2]), price: col([10, 20, 30, 40]) };
  return { schema: "vu-screener-universe-1.0.0", cols, dict: {} };
}
const ds = Engine.createDataset(artifact());

function screen(mode, extra = {}) {
  return translate({ kind: "screen", understood: "", tickers: [], show: ["qualityFactor"], sort: { field: "marketCap", dir: "desc" }, limit: 25, missing: [], notes: [],
    filters: [{ field: "newHigh52w", op: "is", value: null, value2: null, values: [], flag: true },
      { field: "marketCap", op: "between", value: 3e8, value2: 2e9, values: [], flag: null }],
    supertrader: mode ? { strategy: "MINERVINI_VCP", mode } : { strategy: "NONE", mode: "none" }, ...extra });
}

const complete = { asOf: "2026-09-28", strategies: { MINERVINI_VCP: { open: [], scanner: { top: [{ symbol: "BBB", stage: "WATCH" }], symbols: ["BBB", "CCC"] } } } };
const partial = { asOf: "2026-09-28", strategies: { MINERVINI_VCP: { open: [], scanner: { top: [{ symbol: "BBB", stage: "WATCH" }] } } } };

test("Filter der Frage laufen durch die Screener-Engine", () => {
  const res = Ask.runScreen(ds, screen(null), null);
  assert.deepEqual(res.rows.map((r) => r.symbol), ["BBB", "AAA"]);
  assert.deepEqual(res.columns, ["marketCap", "newHigh52w", "qualityFactor"]);
  assert.equal(res.rows[0].values.qualityFactor, 40);
});

test("Supertrader 'require' behaelt nur Titel, die die Strategie erfuellen", () => {
  const res = Ask.runScreen(ds, screen("require"), complete);
  assert.deepEqual(res.rows.map((r) => [r.symbol, r.strategy.label]), [["BBB", "Beobachten"]]);
  assert.equal(res.total, 2);
  assert.equal(res.matched, 1);
  assert.equal(res.note, null);
});

test("Unvollstaendige Signaldatei: fehlend heisst 'nicht geprueft', nicht 'nein'", () => {
  const res = Ask.runScreen(ds, screen("show"), partial);
  assert.deepEqual(res.rows.map((r) => [r.symbol, r.strategy.pass, r.strategy.label]), [["BBB", true, "Beobachten"], ["AAA", null, "nicht geprüft"]]);
  assert.match(res.note, /Top 60/);
  const full = Ask.runScreen(ds, screen("show"), complete);
  assert.deepEqual(full.rows.map((r) => r.strategy.label), ["Beobachten", "erfüllt nicht"]);
});

test("Einzelfrage: Werte je Ticker, unbekannte Ticker ehrlich benannt", () => {
  const r = translate({ kind: "stock", understood: "", filters: [], tickers: ["AAA", "ZZZ"], show: ["fcfGrowth"], supertrader: { strategy: "NONE", mode: "none" },
    sort: { field: "none", dir: "desc" }, limit: 25, missing: [], notes: [] });
  const res = Ask.runStock(ds, r, null);
  assert.deepEqual(res.stocks.map((s) => [s.symbol, s.found, s.values && s.values.fcfGrowth]), [["AAA", true, 0.3], ["ZZZ", false, undefined]]);
});

test("Link in den Screener traegt genau die Filter", () => {
  const url = Ask.screenerUrl(screen(null));
  assert.ok(url.startsWith("/screener/?"));
  assert.match(decodeURIComponent(url), /f=newHigh52w:is:1/);
  assert.match(decodeURIComponent(url), /f=marketCap:between:300000000:2000000000/);
});
