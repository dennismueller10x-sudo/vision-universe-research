/* Wochen- und Monatskennzahlen aus der Tageshistorie (Audit B8, multi-timeframe.js).
   Referenz: eingefrorener AAPL-Ausschnitt (fixtures/technical-reference-aapl.json, 315 Tagesbars).
   Die Wochen-/Monatsbars werden hier unabhaengig von timeframe.js naiv gebildet
   (ISO-Woche bzw. Kalendermonat, letzter Handelstag = Schluss). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/technical/canonical-bars.js");
const MTF = require("../engines/technical/multi-timeframe.js");
const I = require("../engines/technical/indicators.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Row = require("../engines/technical/screen-row.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));

function series(upto) {
  const n = upto === undefined ? ref.date.length : upto + 1;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ timestamp: ref.date[i], open: ref.open[i], high: ref.high[i], low: ref.low[i], close: ref.close[i], volume: ref.volume[i] });
  return C.fromRows(rows, { instrumentId: "AAPL", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED" });
}
function isoWeek(d) {
  const t = new Date(d + "T12:00:00Z"), wd = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - wd + 3);
  const y = t.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  return y + "-" + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7 + 1);
}
/** Naive Buckets: Schluss = letzter Tag, Hoch/Tief = Extrem, Volumen = Summe. */
function naive(keyOf, upto) {
  const out = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  let cur = null;
  for (let i = 0; i <= upto; i++) {
    const k = keyOf(ref.date[i]);
    if (k !== cur) { cur = k; out.date.push(ref.date[i]); out.open.push(ref.open[i]); out.high.push(ref.high[i]); out.low.push(ref.low[i]); out.close.push(ref.close[i]); out.volume.push(ref.volume[i]); continue; }
    const j = out.close.length - 1;
    out.date[j] = ref.date[i]; out.high[j] = Math.max(out.high[j], ref.high[i]); out.low[j] = Math.min(out.low[j], ref.low[i]);
    out.close[j] = ref.close[i]; out.volume[j] += ref.volume[i];
  }
  return out;
}
const near = (a, b, tol = 1e-3) => (a === null && b === null) || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("Abschlussregel: Woche am Freitag, Monat ohne weiteren Werktag", () => {
  assert.equal(MTF.closedAt("2024-12-27", "1W"), true, "Freitag");
  assert.equal(MTF.closedAt("2024-12-26", "1W"), false, "Donnerstag");
  assert.equal(MTF.closedAt("2024-12-31", "1M"), true, "letzter Werktag im Dezember");
  assert.equal(MTF.closedAt("2024-11-29", "1M"), true, "Freitag, danach nur Samstag 30.11.");
  assert.equal(MTF.closedAt("2024-11-28", "1M"), false, "Donnerstag, Freitag folgt noch");
  assert.equal(MTF.closedAt("2024-03-28", "1M"), false, "Gruendonnerstag: Karfreitag ist Werktag, konservativ offen");
});

test("Woche: Bars und Kennzahlen gleich einer naiven Wochenbildung (Freitags-Stichtag)", () => {
  const cut = ref.date.lastIndexOf("2024-12-27"), out = MTF.compute(series(cut))["1W"];
  const w = naive(isoWeek, cut), n = w.close.length, t = n - 1;
  assert.equal(out.droppedOpenBar, false);
  assert.equal(out.bars, n);
  assert.equal(out.asOf, "2024-12-27");
  assert.equal(out.close, w.close[t]);
  const sma40 = I.sma(w.close, 40)[t], sma10 = I.sma(w.close, 10)[t];
  assert.equal(out.values.aboveSma200, w.close[t] > sma40);
  assert.equal(out.values.aboveSma50, w.close[t] > sma10);
  assert.ok(near(out.values.distSma200, w.close[t] / sma40 - 1, 1e-3));
  assert.ok(near(out.values.rsi14, I.rsi(w.close, 14)[t], 1e-3));
  assert.ok(near(out.values.adx, I.adx(w.high, w.low, w.close, 14).adx[t], 1e-3));
  assert.ok(near(out.values.atrPct, I.atr(w.high, w.low, w.close, 14)[t] / w.close[t], 1e-3));
  assert.ok(near(out.values.stochK, I.stochastic(w.high, w.low, w.close, 14, 3, 3).k[t], 1e-3));
  assert.equal(out.values.macdPositive, I.macd(w.close, 12, 26, 9).histogram[t] > 0);
  assert.ok(near(out.values.relVol, I.relativeVolume(w.volume, 20)[t], 1e-3));
  const hi = Math.max(...w.close.slice(n - 52));
  assert.equal(out.values.newHigh52w, w.close[t] >= hi);
});

test("Woche: offene Woche faellt weg, Werte gleich dem Stand am Vorfreitag (kausal)", () => {
  const fri = ref.date.lastIndexOf("2024-12-20"), thu = ref.date.lastIndexOf("2024-12-26");
  const a = MTF.compute(series(fri))["1W"], b = MTF.compute(series(thu))["1W"];
  assert.equal(b.droppedOpenBar, true);
  assert.equal(b.asOf, "2024-12-20");
  assert.deepEqual(b.values, a.values);
});

test("Monat: Schluss ist der Schluss des letzten Handelstags im Monat (Audit B5)", () => {
  const end = ref.date.length - 1, out = MTF.compute(series(end))["1M"];
  const m = naive((d) => d.slice(0, 7), end);
  assert.equal(ref.date[end], "2024-12-31");
  assert.equal(out.droppedOpenBar, false);
  assert.equal(out.bars, m.close.length);
  assert.equal(out.close, m.close[m.close.length - 1]);
  /* Gegenprobe: Ende November ist Freitag 29.11.; der Wochenschluss dieser Woche ist zugleich Monatsschluss.
     Ende Oktober (Do 31.10.) gehoert der Monatsschluss zur Woche bis 01.11. - die Wochen-Ableitung irrte dort. */
  const oct = m.date.indexOf("2024-10-31");
  assert.ok(oct >= 0, "Oktober endet am letzten Handelstag 31.10.");
  assert.equal(m.close[oct], ref.close[ref.date.indexOf("2024-10-31")]);
  const sma10 = I.sma(m.close, 10)[m.close.length - 1];
  assert.equal(out.values.aboveSma200, m.close.at(-1) > sma10);
});

test("Zu kurze Historie ergibt null, nie 0", () => {
  const out = MTF.compute(series(40));
  assert.equal(out["1W"].values.aboveSma200, null, "weniger als 40 Wochen");
  assert.equal(out["1W"].values.adx, null);
  assert.equal(out["1M"], null, "weniger als zwei abgeschlossene Monate");
});

test("Bundle: multiTimeframe additiv, parametersHash und bestehende Felder unveraendert", () => {
  const s = series();
  const a = Analysis.analyze({ series: s, options: { elliott: false, annotations: false } });
  const b = Analysis.analyze({ series: s, options: { elliott: false, annotations: false, multiTimeframe: false } });
  assert.equal(a.multiTimeframe.version, MTF.MTF_VERSION);
  assert.equal(b.multiTimeframe, undefined);
  assert.equal(a.parametersHash, b.parametersHash);
  assert.deepEqual(a.featuresAtCutoff, b.featuresAtCutoff);
});

test("screen-row: Wochen-/Monatswerte aus multiTimeframe haben Vorrang, sonst Schlusskurs-Rechnung", () => {
  const s = series(), mtf = MTF.compute(s);
  const bars = { timestamps: ref.date, open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
  const weekly = []; const w = naive(isoWeek, ref.date.length - 1); w.date.forEach((d, i) => weekly.push([d, w.close[i]]));
  const withMtf = Row.computeRow({ ticker: "AAPL", bars, features: {}, weekly, multiTimeframe: mtf });
  const without = Row.computeRow({ ticker: "AAPL", bars, features: {}, weekly });
  assert.equal(withMtf.mtfSource, "DAILY_HISTORY");
  assert.equal(without.mtfSource, "WEEKLY_CLOSES");
  assert.equal(withMtf["adx@1W"], mtf["1W"].values.adx);
  assert.equal(withMtf["relVol@1M"], mtf["1M"].values.relVol);
  assert.equal(without["adx@1W"], null, "ohne Tageshistorie kein Wochen-ADX");
  assert.equal(withMtf["rsi14@1W"], mtf["1W"].values.rsi14);
  assert.ok(typeof without["rsi14@1W"] === "number" || without["rsi14@1W"] === null);
  assert.equal(Row.computeRow({ ticker: "AAPL", bars, features: {}, weekly, multiTimeframe: { version: "andere-2.0" } }).mtfSource, "WEEKLY_CLOSES", "fremde Version wird nicht gelesen");
});
