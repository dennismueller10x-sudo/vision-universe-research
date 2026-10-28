/* Ende-zu-Ende (AP3, TECHNICAL_COMPLETION_PLAN.md J1/B3/I5): Was die Trefferzeile im Screener zeigt, zeigt auch Chart
   Studio fuer denselben Titel. Chart Studio rechnet im Browser aus den 270 Tagesbars des Buendels (technical/app.js,
   Indicators.compute, Formations.analyzeAt); der Screener kommt aus dem Erzeuger. Stichprobe: jeder 20. Titel je Scherbe,
   nur Titel, deren Buendel denselben letzten Bar hat wie die Zeile (zwischen Materialisierung und Screener-Lauf koennen
   sie auseinanderliegen) und deren Kurs nicht eingefroren ist (SCREENER_FRESHNESS.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const I = require(join(root, "quant/engines/technical/indicators.js"));
const Cn = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(root, "quant/engines/technical/ti/context.js"));
const F = require(join(root, "quant/engines/technical/formations.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const Staleness = require(join(root, "core/listing-staleness.js"));
const screener = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
const c = screener.cols, row = new Map(c.s.map((s, i) => [s, i]));
const SH = join(root, "quant/data/product/technical-signals-v1");

/* Spalte -> Wert, wie Chart Studio ihn aus den Bars zeigt. Toleranz = Rundung der Spalte; RSI, ADX und ATR zusaetzlich
   die Wilder-Glaettung (Screener aus der Vollhistorie, Chart aus 270 Bars; gemessen bei 5.424 Titeln: RSI max. 0,023,
   ADX max. 0,066, ATR % max. 0,00011 bei WOK). */
const num = (x) => (Number.isFinite(x) ? x : null), dir = (x) => (Number.isFinite(x) ? x > 0 : null);
const CHART = {
  rsi14: [(S, t) => num(I.compute(S, "rsi").values[t]), 0.1],
  adx: [(S, t) => num(I.compute(S, "adx").values.adx[t]), 0.1],
  stochK: [(S, t) => num(I.compute(S, "stochastic").values.k[t]), 0.006],
  williamsR: [(S, t) => num(I.compute(S, "williamsR").values[t]), 0.006],
  cci20: [(S, t) => num(I.compute(S, "cci").values[t]), 0.006],
  mfi14: [(S, t) => { const x = I.compute(S, "mfi"); return x.error ? null : num(x.values[t]); }, 0.006],
  cmf20: [(S, t) => { const x = I.compute(S, "cmf"); return x.error ? null : num(x.values[t]); }, 0.0006],
  aroonOsc: [(S, t) => num(I.compute(S, "aroon").values.oscillator[t]), 0],
  atrPct: [(S, t) => num(I.compute(S, "atr").values[t] / S.close[t]), 0.0005],
  bbPctB: [(S, t) => num(I.compute(S, "bollinger").values.percentB[t]), 0.0006],
  macdPositive: [(S, t) => dir(I.compute(S, "macd").values.histogram[t]), 0],
  supertrendUp: [(S, t) => dir(I.compute(S, "supertrend").values.direction[t]), 0],
  psarUp: [(S, t) => dir(I.compute(S, "psar").values.direction[t]), 0],
  aboveEma20: [(S, t) => S.close[t] > I.compute(S, "ema", { period: 20 }).values[t], 0],
  aboveEma50: [(S, t) => S.close[t] > I.compute(S, "ema", { period: 50 }).values[t], 0]
};

function sample() {
  const out = [];
  for (const file of readdirSync(SH).filter((x) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(x)).sort()) {
    const inst = JSON.parse(gunzipSync(readFileSync(join(SH, file)))).instruments || {};
    Object.keys(inst).sort().forEach((tk, k) => {
      const i = row.get(tk), b = inst[tk].bars;
      if (k % 20 || i === undefined || !b || String(b.timestamps[b.timestamps.length - 1]).slice(0, 10) !== c.asOf[i]) return;
      const tail = Staleness.tailRun(b.timestamps.map((d, j) => [d, b.close[j]]));
      if (tail && tail.run >= Staleness.DEFAULTS.dailyMinRun) return;
      out.push({ tk, i, b });
    });
  }
  return out;
}
const titles = sample();
const enough = titles.length >= 100;

test("Indikatorwerte: Trefferzeile = Chart Studio (15 Spalten, Stichprobe)", { skip: enough ? false : "zu wenige vergleichbare Titel (" + titles.length + "), Materialisierung und Screener-Lauf liegen auseinander" }, () => {
  const off = [];
  for (const { tk, i, b } of titles) {
    const S = { dates: b.timestamps, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }, t = b.close.length - 1;
    for (const [col, [f, tol]] of Object.entries(CHART)) {
      const chart = f(S, t), scr = c[col][i];
      if (chart === null || scr === null) { if ((chart === null) !== (scr === null)) off.push(tk + " " + col + " chart=" + chart + " screener=" + scr); continue; }
      const ok = typeof scr === "boolean" ? chart === scr : Math.abs(chart - scr) <= tol;
      if (!ok) off.push(tk + " " + col + " chart=" + chart + " screener=" + scr);
    }
  }
  assert.deepEqual(off, [], titles.length + " Titel");
});

test("Formationen: Trefferzeile = Chart Studio (Typ, Zustand, Erkennung, Ausbruch)", { skip: enough ? false : "zu wenige vergleichbare Titel" }, () => {
  const off = [];
  for (const { tk, i, b } of titles) {
    /* wie technical/app.js: Zeilen mit date, Kanonisierung, Kontext, Analyse am letzten Bar */
    const series = Cn.fromRows(b.timestamps.map((d, k) => ({ date: d, open: b.open[k], high: b.high[k], low: b.low[k], close: b.close[k], volume: b.volume[k] })),
      { instrumentId: tk, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
    const chart = F.analyzeAt(Ctx.prepare(series), series.length - 1).formations.filter((x) => x.state !== "INVALIDATED")
      .map((x) => [x.type, x.state, x.detectedAt, x.breakout ? x.breakout.at : null, x.breakout ? x.breakout.direction : null]);
    const scr = (c.formations[i] || []).map((x) => x.slice(0, 5));
    const key = (l) => l.map((x) => JSON.stringify(x)).sort();
    if (JSON.stringify(key(chart)) !== JSON.stringify(key(scr))) off.push(tk + " chart=" + JSON.stringify(chart) + " screener=" + JSON.stringify(scr));
  }
  assert.deepEqual(off, []);
});

test("Abfrage-Budget: komplexe Suche ueber das ganze Universum unter 100 ms (Median von 9 Laeufen)", () => {
  const ds = Q.createDataset(screener);
  const q = { timeframe: "1D", logic: "AND", sort: { field: "rs6m", dir: "desc" }, groups: [
    { filters: [{ field: "aboveSma200", op: "is", value: true }, { field: "rsi14", op: "between", value: 40, value2: 70 }, { field: "adx", op: "gt", value: 20 },
      { field: "formationConfirmed", op: "in", value: Object.keys(Q.FORMATION_TYPES) }, { field: "goldenCrossDays", op: "lte", value: 20 }] },
    { op: "OR", filters: [{ field: "volSpike", op: "is", value: true }, { field: "candleBullish", op: "in", value: Object.keys(Q.CANDLE_TYPES) }] }] };
  const times = [];
  for (let k = 0; k < 9; k++) { const s = performance.now(); const r = Q.evaluate(ds, q); times.push(performance.now() - s); assert.ok(!r.error, JSON.stringify(r.errors)); }
  times.sort((a, b) => a - b);
  assert.ok(times[4] < 100, "Median " + times[4].toFixed(1) + " ms");
});

test("Kerzenmuster: Chartmarken am letzten Bar = Spalten candleBullish/-Bearish/-Neutral der Trefferzeile", { skip: enough ? false : "zu wenige vergleichbare Titel" }, () => {
  const K = require(join(root, "quant/engines/technical/candlesticks.js"));
  const Model = require(join(root, "technical/engine/model.js"));
  const off = [];
  let marked = 0;
  for (const { tk, i, b } of titles) {
    const t = b.close.length - 1, S = { dates: b.timestamps, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    const pats = K.detect({ open: b.open, high: b.high, low: b.low, close: b.close }, { only: Object.keys(Q.CANDLE_TYPES) }).patterns;
    const marks = Model.candleMarks(S, pats, K.PATTERNS, Q.CANDLE_TYPES, Math.max(0, t - 62));
    const last = (kind) => (marks.find((m) => m.time === b.timestamps[t] && m.kind === kind) || { ids: [] }).ids.slice().sort();
    marked += marks.length;
    for (const [kind, col] of [["bull", "candleBullish"], ["bear", "candleBearish"], ["neutral", "candleNeutral"]]) {
      if (c[col][i] === null) continue;
      if (JSON.stringify(last(kind)) !== JSON.stringify(c[col][i].slice().sort())) off.push(tk + " " + col + " chart=" + last(kind) + " screener=" + c[col][i]);
    }
    for (const m of marks) assert.ok(m.kind === "neutral" ? m.price === S.close[S.dates.indexOf(m.time)] : m.kind === "bull" ? m.price === S.low[S.dates.indexOf(m.time)] : m.price === S.high[S.dates.indexOf(m.time)]);
    assert.ok(marks.filter((m) => m.label).length <= 2, "hoechstens eine Beschriftung je Richtung");
  }
  assert.deepEqual(off, []);
  assert.ok(marked > titles.length, "Marken vorhanden (" + marked + ")");
});
