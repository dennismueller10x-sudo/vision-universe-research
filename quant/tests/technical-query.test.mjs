/* Tests fuer die Technical-Screener-Abfrage (quant/engines/technical/technical-query.js)
   und die Screener-Zeile (screen-row.js). Der Datensatz ist klein und
   von Hand gebaut: jede Erwartung ist ohne Rechner nachvollziehbar. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Q = require("../engines/technical/technical-query.js");
const Row = require("../engines/technical/screen-row.js");
const Canonical = require("../engines/technical/canonical-bars.js");

const artifact = {
  schemaVersion: "test", cols: {
    s: ["AAA", "BBB", "CCC", "DDD"],
    aboveSma200: [true, true, false, null],
    "aboveSma200@1W": [true, false, false, true],
    rsi14: [55, 72, 30, null],
    relVol: [1.4, 0.8, 2.5, 1.1],
    formationActive: [["SYMMETRICAL_TRIANGLE"], [], ["BULL_FLAG", "RANGE_BREAKOUT"], null],
    newHigh200w: [false, true, false, true]
  }
};
const ds = Q.createDataset(artifact);
const syms = (r) => r.indices.map((i) => artifact.cols.s[i]);

test("UND: alle Bedingungen; fehlende Werte erfuellen nichts und werden im Trichter gezaehlt", () => {
  const r = Q.evaluate(ds, { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "aboveSma200", op: "is", value: true }, { field: "rsi14", op: "lt", value: 60 }] }] });
  assert.deepEqual(syms(r), ["AAA"]);
  assert.equal(r.funnel[1].missing, 1, "DDD hat keinen SMA-200-Wert");
  assert.equal(r.funnel.at(-1).count, 1);
});

test("ODER innerhalb einer Gruppe und ODER zwischen Gruppen", () => {
  const inGroup = Q.evaluate(ds, { logic: "AND", groups: [{ op: "OR", filters: [{ field: "rsi14", op: "gt", value: 70 }, { field: "relVol", op: "gte", value: 2 }] }] });
  assert.deepEqual(syms(inGroup).sort(), ["BBB", "CCC"]);
  const between = Q.evaluate(ds, { logic: "OR", groups: [{ op: "AND", filters: [{ field: "formationActive", op: "in", value: ["SYMMETRICAL_TRIANGLE"] }] }, { op: "AND", filters: [{ field: "newHigh200w", op: "is", value: true }] }] });
  assert.deepEqual(syms(between).sort(), ["AAA", "BBB", "DDD"]);
  assert.equal(between.funnel.at(-1).kind, "union");
});

test("Zeitrahmen waehlt die Spalte; Tagesfelder sind fuer Woche gesperrt", () => {
  const w = Q.evaluate(ds, { timeframe: "1W", logic: "AND", groups: [{ op: "AND", filters: [{ field: "aboveSma200", op: "is", value: true }] }] });
  assert.deepEqual(syms(w), ["AAA", "DDD"]);
  const v = Q.validate({ timeframe: "1W", groups: [{ op: "AND", filters: [{ field: "relVol", op: "gt", value: 1 }] }] });
  assert.equal(v.ok, false);
  assert.equal(v.errors[0].code, "FIELD_NOT_AVAILABLE_FOR_TIMEFRAME");
  assert.equal(Q.columnKey("newHigh200w", "1W"), "newHigh200w", "zeitrahmenunabhaengiges Feld");
});

test("Sortierung: Feld, fehlende Werte ans Ende; ohne Feld nach erfuellten Bedingungen", () => {
  const r = Q.evaluate(ds, { logic: "AND", groups: [], sort: { field: "rsi14", dir: "desc" } });
  assert.deepEqual(syms(r), ["BBB", "AAA", "CCC", "DDD"]);
  const m = Q.evaluate(ds, { logic: "AND", groups: [{ op: "OR", filters: [{ field: "relVol", op: "gt", value: 1 }, { field: "aboveSma200", op: "is", value: true }] }] });
  assert.equal(syms(m)[0], "AAA", "AAA erfuellt beide");
});

test("Validierung liefert stabile Fehlercodes und wirft nie", () => {
  const bad = [
    [null, "GROUPS_REQUIRED"], [{ groups: [], timeframe: "2D" }, "INVALID_TIMEFRAME"], [{ groups: [], logic: "XOR" }, "INVALID_LOGIC"],
    [{ groups: [{ op: "AND", filters: [{ field: "nope", op: "gt", value: 1 }] }] }, "UNKNOWN_FIELD"],
    [{ groups: [{ op: "AND", filters: [{ field: "rsi14", op: "is", value: true }] }] }, "INVALID_OPERATOR"],
    [{ groups: [{ op: "AND", filters: [{ field: "rsi14", op: "gt", value: "60" }] }] }, "INVALID_VALUE"],
    [{ groups: [{ op: "AND", filters: [{ field: "rsi14", op: "between", value: 60, value2: 50 }] }] }, "INVALID_VALUE2"],
    [{ groups: [{ op: "AND", filters: [{ field: "formationActive", op: "in", value: ["ZIGZAG"] }] }] }, "INVALID_VALUE"],
    [{ groups: [], limit: 10000 }, "INVALID_LIMIT"], [{ groups: Array(7).fill({ op: "AND", filters: [] }) }, "TOO_MANY_GROUPS"]
  ];
  for (const [q, code] of bad) {
    const v = Q.validate(q);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.code === code), JSON.stringify(q) + " -> " + JSON.stringify(v.errors));
  }
  assert.equal(Q.evaluate(ds, { groups: "x" }).error, "INVALID_QUERY");
});

test("Vorlagen sind gueltig und beschreibbar; das KI-Schema deckt jeden Katalogeintrag ab", () => {
  for (const p of Q.PRESETS) {
    const v = Q.validate(p.query);
    assert.ok(v.ok, p.id + ": " + JSON.stringify(v.errors));
    assert.ok(Q.describe(p.query).length > 10);
  }
  const schema = Q.jsonSchema();
  const variants = schema.properties.groups.items.properties.filters.items.oneOf;
  assert.deepEqual(variants.map((x) => x.properties.field.const).sort(), Q.FIELDS.map((f) => f.id).sort());
  assert.equal(schema.additionalProperties, false);
  /* Beispielanfrage aus dem Produktauftrag, so wie ein Modell sie liefern soll. */
  const ai = { v: 1, timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [
    { field: "formationActive", op: "in", value: ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"] },
    { field: "aboveSma200", op: "is", value: true }, { field: "volAboveAvg", op: "is", value: true }] }], sort: null, limit: 50 };
  assert.ok(Q.validate(ai).ok);
  assert.match(Q.describe(ai), /Dreieck.*SMA 200.*Volumen/);
});

/* ---------- Screener-Zeile ---------- */
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const bars = { timestamps: ref.date, open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
const series = Canonical.fromRows(ref.date.map((d, i) => ({ date: d, open: ref.open[i], high: ref.high[i], low: ref.low[i], close: ref.close[i], volume: ref.volume[i] })),
  { instrumentId: "AAPL", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "fixture" });

test("Screener-Zeile: Werte aus den Features, fehlende Eingaben bleiben null", () => {
  const features = { sma200: 180, sma50: 240, ema20: 250, ema50: 245, rsi14: 61.234, high52w: Math.max(...ref.high.slice(-252)), distanceTo52wHigh: -0.02, macdHistogram: 0.5, relativeVolume: 1.3 };
  const row = Row.computeRow({ ticker: "AAPL", bars, series, features, weekly: null, benchmark: null });
  const c = ref.close.at(-1);
  assert.equal(row.aboveSma200, c > 180);
  assert.equal(row.sma50AboveSma200, true);
  assert.equal(row.rsi14, 61.23);
  assert.equal(row.volAboveAvg, true);
  assert.equal(row.rs6m, null, "ohne Vergleichsreihe keine relative Staerke");
  assert.equal(row.adx, null, "fehlendes Feature ist null, nicht 0");
  assert.equal(row.newHigh200w, null);
  assert.equal(row.spark.length, 60);
  assert.ok(Array.isArray(row.formationActive));
  assert.equal(row.aboveEma200, null, "ohne eingeschwungene EMA 200 kein Wert, keine Schaetzung");
  assert.equal(row.distEma200, null);
  const withEma = Row.computeRow({ ticker: "AAPL", bars, series, features: { ...features, ema200: c * 0.8 }, weekly: null, benchmark: null });
  assert.equal(withEma.aboveEma200, true);
  assert.ok(Math.abs(withEma.distEma200 - 0.25) < 1e-4, String(withEma.distEma200));
});

test("Screener-Zeile: relative Staerke nur bei gleichem Stichtag; offene Woche faellt weg", () => {
  const n = ref.close.length;
  const benchmark = { dates: ref.date.slice(), close: ref.close.map((v, i) => 100 * (1 + i / 1000)) };
  const row = Row.computeRow({ ticker: "AAPL", bars, series, features: {}, benchmark });
  const expected = ref.close[n - 1] / ref.close[n - 127] - 1 - (benchmark.close[n - 1] / benchmark.close[n - 127] - 1);
  assert.ok(Math.abs(row.rs6m - expected) < 1e-4);
  const shifted = { dates: benchmark.dates.slice(0, -1), close: benchmark.close.slice(0, -1) };
  assert.equal(Row.computeRow({ ticker: "AAPL", bars, series, features: {}, benchmark: shifted }).rs6m, null, "anderer Stichtag: kein Vergleich");
  /* Stichtag ist ein Dienstag (2024-12-31) -> letzte Wochenzeile mit diesem Datum ist offen. */
  const weekly = Array.from({ length: 60 }, (_, i) => ["2023-" + String(i).padStart(2, "0"), 100 + i]);
  weekly.push([ref.date.at(-1), 1]);
  const w = Row.computeRow({ ticker: "AAPL", bars, series, features: {}, weekly });
  assert.equal(w.weeks, 60, "offene Woche nicht mitgezaehlt");
  assert.equal(w["newHigh52w@1W"], true);
});

test("Monatsschluesse aus Wochen: letzter Wert je Monat, laufender Monat zaehlt nicht", () => {
  const pts = [["2026-08-07", 1], ["2026-08-28", 2], ["2026-09-04", 3], ["2026-09-25", 4], ["2026-10-02", 5]];
  assert.deepEqual(Row.monthlyFromWeekly(pts, "2026-10-09"), [2, 4]);
  assert.deepEqual(Row.monthlyFromWeekly(pts, "2026-11-02"), [2, 4, 5]);
});
