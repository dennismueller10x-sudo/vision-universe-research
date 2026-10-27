/* Screener-Felder L6 (screen-row 1.7.0, technical-query 1.7.0): ROC 63/126/252, Inside Bar, NR7,
   Kerzenmuster am Stichtag und "Tage seit" bullischem/baerischem Kerzenmuster.
   Referenz: echte AAPL-Tagesbars (Fixture). Jeder Wert wird unabhaengig aus Katalog bzw.
   candlesticks.js nachgerechnet; "Tage seit" wird ueber abgeschnittene Reihen kausal geprueft. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Row = require("../engines/technical/screen-row.js");
const I = require("../engines/technical/indicators.js");
const Cdl = require("../engines/technical/candlesticks.js");
const Q = require("../engines/technical/technical-query.js");
const P = require("../engines/technical/query-text.js");

const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
function bars(end) {
  const k = end === undefined ? ref.date.length : end + 1, from = Math.max(0, k - 270);
  const pick = (a) => a.slice(from, k);
  return { timestamps: pick(ref.date), open: pick(ref.open), high: pick(ref.high), low: pick(ref.low), close: pick(ref.close), volume: pick(ref.volume) };
}
const row = (b) => Row.computeRow({ ticker: "AAPL", bars: b, features: {}, chartSeries: null });

test("ROC 63/126/252 = Katalog-ROC / 100 am Stichtag (Anteil wie roc21)", () => {
  const b = bars(), r = row(b), t = b.close.length - 1;
  for (const [id, p] of [["roc63", 63], ["roc126", 126], ["roc252", 252]]) {
    const cat = I.compute(b, "roc", { period: p }).values[t] / 100;
    assert.ok(Math.abs(r[id] - cat) < 1e-4, id + " " + r[id] + " vs " + cat);
  }
  const short = bars(); for (const k of Object.keys(short)) short[k] = short[k].slice(-200);
  const rs = row(short);
  assert.equal(rs.roc252, null, "252 braucht 253 Bars");
  assert.ok(rs.roc126 !== null);
});

test("Inside Bar und NR7 = Katalogwerte an jeder Bar (abgeschnittene Reihen)", () => {
  const n = ref.date.length;
  let ib = 0, nr = 0;
  for (let e = n - 60; e < n; e++) {
    const b = bars(e), r = row(b), t = b.close.length - 1;
    const h = b.high, l = b.low;
    assert.equal(r.insideBar, h[t] < h[t - 1] && l[t] > l[t - 1], "insideBar " + b.timestamps[t]);
    const ranges = h.slice(t - 6, t + 1).map((x, i) => x - l[t - 6 + i]);
    assert.equal(r.nr7, ranges[6] <= Math.min(...ranges), "nr7 " + b.timestamps[t]);
    ib += r.insideBar; nr += r.nr7;
  }
  assert.ok(ib > 0 && nr > 0, "beide Faelle kommen in 60 Tagen vor: " + ib + "/" + nr);
});

test("Kerzenmuster am Stichtag = candlesticks.atCutoff, nach Richtung getrennt", () => {
  const n = ref.date.length;
  let seen = 0;
  for (let e = n - 80; e < n; e++) {
    const b = bars(e), r = row(b), hits = Cdl.atCutoff(b);
    const dir = (id) => Cdl.pattern(id).direction;
    const want = {
      candleBullish: hits.filter((x) => dir(x.id) !== "neutral" && x.signal > 0).map((x) => x.id),
      candleBearish: hits.filter((x) => dir(x.id) !== "neutral" && x.signal < 0).map((x) => x.id),
      candleNeutral: hits.filter((x) => dir(x.id) === "neutral").map((x) => x.id)
    };
    for (const k of Object.keys(want)) assert.deepEqual(r[k], want[k], k + " " + b.timestamps[b.close.length - 1]);
    seen += hits.length;
  }
  assert.ok(seen > 10, "echte Treffer im Pruefzeitraum: " + seen);
});

test("Tage seit Kerzenmuster: kausal, juengster Treffer, Pruefraum statt Null", () => {
  const b = bars(), r = row(b), t = b.close.length - 1;
  for (const [days, list] of [["candleBullDays", "candleBullish"], ["candleBearDays", "candleBearish"]]) {
    const d = r[days];
    assert.ok(Number.isInteger(d) && d >= 0 && d < r.candleWindow, days + " = " + d);
    /* Am Tag t-d (abgeschnittene Reihe, also ohne jede spaetere Bar) liegt ein Muster dieser Richtung vor ... */
    const at = row(bars(ref.date.length - 1 - d));
    assert.ok(at[list].length > 0, days + ": Muster an t-" + d);
    /* ... und an keinem spaeteren Tag. */
    for (let k = 0; k < d; k++) assert.equal(row(bars(ref.date.length - 1 - k))[list].length, 0, days + ": kein Muster an t-" + k);
  }
  /* Pruefraum = Bars mit entscheidbaren Mustern; hier alle ausser der Aufwaermphase der laengsten Mittel. */
  const warm = Math.max(...Cdl.PATTERNS.map((p) => p.warmup));
  assert.equal(r.candleWindow, t + 1 - warm);
});

test("Ruhender Titel (alle Mittel 0): Muster nicht entscheidbar, alles null statt leer", () => {
  const n = 270, f = (v) => Array.from({ length: n }, () => v), b = bars();
  const flat = { timestamps: b.timestamps, open: f(5), high: f(5), low: f(5), close: f(5), volume: f(0) };
  const r = row(flat);
  assert.equal(r.candleBullish, null); assert.equal(r.candleBearish, null); assert.equal(r.candleNeutral, null);
  assert.equal(r.candleBullDays, null); assert.equal(r.candleWindow, null);
  assert.equal(r.insideBar, false, "gleiche Spanne ist kein Inside Bar");
});

test("Feste Musterliste: Screener und Abfrage nennen dieselben Muster, alle in candlesticks.js", () => {
  assert.deepEqual(Object.keys(Q.CANDLE_TYPES), Row.SCREEN_CANDLES);
  for (const id of Row.SCREEN_CANDLES) assert.ok(Cdl.pattern(id), id);
});

test("Abfrage und Text: neue Felder validierbar, Text-Rundreise, Begriffe", () => {
  for (const id of ["roc63", "roc126", "roc252", "insideBar", "nr7", "candleBullish", "candleBearish", "candleNeutral", "candleBullDays", "candleBearDays"]) assert.ok(Q.field(id), id);
  const q = Q.validate({ timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [
    { field: "candleBullish", op: "in", value: ["hammer", "engulfing"] }, { field: "roc126", op: "gt", value: 0.1 }, { field: "insideBar", op: "is", value: true }] }], limit: 100 });
  assert.ok(q.ok, JSON.stringify(q.errors));
  const back = P.parse(P.toText(q.query));
  assert.ok(back.ok, P.toText(q.query) + " " + JSON.stringify(back.errors));
  assert.deepEqual(back.query.groups, q.query.groups);
  const nat = P.parse("Inside Bar und NR7 und bullische Kerze in den letzten 3 Tagen und Jahresperformance > 20%");
  assert.ok(nat.ok, JSON.stringify(nat.errors) + nat.unknown);
  const fs = nat.query.groups[0].filters.map((f) => f.field + ":" + f.op + ":" + f.value).sort();
  assert.deepEqual(fs, ["candleBullDays:lte:3", "insideBar:is:true", "nr7:is:true", "roc252:gt:0.2"]);
  assert.equal(P.parse("kerze-bull:unbekannt").errors[0].code, "UNKNOWN_CANDLE");
});
