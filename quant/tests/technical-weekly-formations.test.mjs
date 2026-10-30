/* Wochenkerzen und Wochenformationen (screen-row 1.14.0): gemeinsame Wochenbars, kausal, identische Definition. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/technical/canonical-bars.js");
const MTF = require("../engines/technical/multi-timeframe.js");
const Fm = require("../engines/technical/formations.js");
const Ctx = require("../engines/technical/ti/context.js");
const Row = require("../engines/technical/screen-row.js");
const Q = require("../engines/technical/technical-query.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));

function rows(n) { return ref.date.slice(0, n).map((d, i) => ({ timestamp: d, open: ref.open[i], high: ref.high[i], low: ref.low[i], close: ref.close[i], volume: ref.volume[i] })); }
function series(n) { return C.fromRows(rows(n), { instrumentId: "AAPL", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED" }); }
function barsOf(n) { return { timestamps: ref.date.slice(0, n), open: ref.open.slice(0, n), high: ref.high.slice(0, n), low: ref.low.slice(0, n), close: ref.close.slice(0, n), volume: ref.volume.slice(0, n) }; }
const lastFriday = (() => { for (let i = ref.date.length - 1; i >= 0; i--) if (new Date(ref.date[i] + "T12:00:00Z").getUTCDay() === 5) return i; })();

test("Wochenbars: completedSeries ist dieselbe Regel wie compute (Anzahl, Stand, Schluss, offene Woche)", () => {
  for (const n of [ref.date.length, lastFriday + 1]) {
    const s = series(n), wk = MTF.completedSeries(s, "1W"), m = MTF.compute(s)["1W"];
    assert.equal(wk.bars, m.bars); assert.equal(wk.asOf, m.asOf); assert.equal(wk.droppedOpenBar, m.droppedOpenBar);
    assert.equal(wk.series.close[wk.series.length - 1], m.close); assert.equal(wk.series.timeframe, "1W");
  }
  assert.equal(MTF.completedSeries(series(lastFriday + 1), "1W").droppedOpenBar, false, "Stichtag Freitag: Woche abgeschlossen");
  assert.equal(MTF.completedSeries(series(ref.date.length), "1W").droppedOpenBar, true, "Stichtag Dienstag: laufende Woche faellt weg");
});

test("Wochenbars: echte OHLC - Eroeffnung erster Tag, Hoch/Tief der Woche, Schluss letzter Tag, Volumensumme", () => {
  const s = series(lastFriday + 1), w = MTF.completedSeries(s, "1W").series, k = w.length - 1;
  const fri = Date.parse(ref.date[lastFriday] + "T00:00:00Z");
  const wkDays = ref.date.map((d, i) => i).filter((i) => i <= lastFriday && fri - Date.parse(ref.date[i] + "T00:00:00Z") <= 4 * 864e5);
  assert.equal(w.open[k], ref.open[wkDays[0]]); assert.equal(w.close[k], ref.close[lastFriday]);
  assert.equal(w.high[k], Math.max(...wkDays.map((i) => ref.high[i]))); assert.equal(w.low[k], Math.min(...wkDays.map((i) => ref.low[i])));
  assert.equal(w.volume[k], wkDays.reduce((a, i) => a + ref.volume[i], 0));
});

test("Wochenformationen: Screener-Spalten = Formations-Engine auf denselben abgeschlossenen Wochen (wie Chart Studio)", () => {
  const n = ref.date.length, row = Row.computeRow({ ticker: "AAPL", bars: barsOf(n), series: series(n), features: {}, weekly: [] });
  const wk = MTF.completedSeries(series(n), "1W"), res = Fm.analyzeAt(Ctx.prepare(wk.series), wk.series.length - 1).formations;
  const active = [...new Set(res.filter((x) => x.state !== "INVALIDATED").map((x) => x.type))];
  const confirmed = [...new Set(res.filter((x) => x.state === "CONFIRMED").map((x) => x.type))];
  assert.equal(row.weeklyFormationBars, wk.bars);
  assert.deepEqual(row["formationActive@1W"], active); assert.deepEqual(row["formationConfirmed@1W"], confirmed);
  assert.ok(confirmed.every((t) => active.includes(t)));
});

test("Wochenformationen: kausal - Tage der laufenden Woche aendern nichts, unter 26 Wochen keine Aussage", () => {
  const n = lastFriday + 1, at = (m) => Row.computeRow({ ticker: "AAPL", bars: barsOf(m), series: series(m), features: {}, weekly: [] });
  const fri = at(n), later = at(ref.date.length);
  assert.ok(ref.date.length > n, "Fixture endet nach dem letzten Freitag");
  assert.equal(later.weeklyFormationBars, fri.weeklyFormationBars);
  assert.deepEqual(later["formationActive@1W"], fri["formationActive@1W"]); assert.deepEqual(later["formationConfirmed@1W"], fri["formationConfirmed@1W"]);
  const short = at(100);
  assert.ok(short.weeklyFormationBars < 26); assert.equal(short["formationActive@1W"], null); assert.equal(short["formationConfirmed@1W"], null);
});

test("Abfrage: Formationen im Wochenchart sind gueltige Filter, Monat nicht", () => {
  const q = (tf) => ({ timeframe: tf, logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationConfirmed", op: "in", value: ["DOUBLE_BOTTOM"] }] }] });
  assert.ok(Q.validate(q("1W")).ok); assert.equal(Q.columnKey("formationActive", "1W"), "formationActive@1W");
  assert.equal(Q.validate(q("1M")).errors[0].code, "FIELD_NOT_AVAILABLE_FOR_TIMEFRAME");
});
