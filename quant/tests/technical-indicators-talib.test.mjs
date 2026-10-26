/* Externe Referenzwerte (Audit B7).
   Vergleicht die Technical-Indikatoren mit TA-Lib 0.8.2 auf dem eingefrorenen
   AAPL-Ausschnitt. Die TA-Lib-Werte stehen eingefroren in
   fixtures/technical-talib-reference-aapl.json (erzeugt mit
   scripts/technical/build-talib-reference.py); TA-Lib selbst ist keine
   Abhaengigkeit. Die naiven Referenzen in technical-indicators.test.mjs teilen
   die Konventionen der Engine; dieser Test prueft gegen eine fremde
   Implementierung. Abweichungen, die nur aus einem anderen Startwert folgen,
   muessen abklingen und sind mit ihrer Konvergenzschwelle festgehalten.
   Doku: docs/technical/INDICATORS_EXTERNAL_REFERENCE.md */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const TA = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-reference-aapl.json", import.meta.url), "utf8"));
const T = TA.series;
const N = ref.close.length;

/* Fixture: 10 signifikante Stellen. */
const TOL = 1e-8;
const close = (e, t) => Math.abs(e - t) <= TOL * Math.max(1, Math.abs(t));
const val = (id, params) => I.compute(ref, id, params).values;

/** Gleiche erste Bar, danach an jeder Bar ab `from` gleich (null genau dort, wo die Engine NaN hat). */
function agrees(name, eng, ta, from = 0) {
  assert.equal(eng.length, N, name + ": Laenge");
  assert.equal(ta.length, N, name + ": Laenge Referenz");
  const bad = [];
  for (let i = from; i < N; i++) {
    const e = eng[i], t = ta[i];
    if (t === null || !Number.isFinite(e)) { if ((t === null) !== !Number.isFinite(e)) bad.push(i + ":Aufwaermung"); continue; }
    if (!close(e, t)) bad.push(i + ":" + e + "≠" + t);
  }
  assert.deepEqual(bad.slice(0, 5), [], name);
}

/** Startwert-Konvention: Abweichung vor `conv` erlaubt, aber abklingend (Endwert << Anfangswert), danach gleich. */
function converges(name, eng, ta, conv) {
  agrees(name, eng, ta, conv);
  const first = eng.findIndex((e, i) => Number.isFinite(e) && ta[i] !== null);
  const d = (i) => Math.abs(eng[i] - ta[i]) / Math.max(1, Math.abs(ta[i]));
  assert.ok(d(first) > TOL, name + ": erwartete Startabweichung fehlt (Konvention geaendert? Schwelle anpassen)");
  assert.ok(d(conv - 1) < d(first) / 100, name + ": Abweichung klingt nicht ab");
}

test("Fixture: TA-Lib-Version und Quelle festgehalten", () => {
  assert.equal(TA.libraryVersion, "0.8.2");
  assert.equal(TA.bars, N);
  assert.equal(TA.from, ref.from);
  assert.equal(TA.to, ref.to);
});

test("exakt gleich: SMA, EMA, WMA, RSI, ROC, CCI, Williams %R, MFI", () => {
  agrees("SMA 50", val("sma"), T.sma.values);
  agrees("EMA 200", val("ema"), T.ema.values);
  agrees("EMA 20", val("ema", { period: 20 }), T.ema20.values);
  agrees("WMA 20", val("wma"), T.wma.values);
  agrees("RSI 14", val("rsi"), T.rsi.values);
  agrees("ROC 21", val("roc"), T.roc.values);
  agrees("CCI 20", val("cci"), T.cci.values);
  agrees("Williams %R 14", val("williamsR"), T.williamsR.values);
  agrees("MFI 14", val("mfi"), T.mfi.values);
});

test("exakt gleich: Bollinger (Populationsstreuung), Aroon, Donchian, Ichimoku-Linien", () => {
  const bb = val("bollinger");
  agrees("Bollinger oben", bb.upper, T.bollinger.values.upper);
  agrees("Bollinger Mitte", bb.middle, T.bollinger.values.middle);
  agrees("Bollinger unten", bb.lower, T.bollinger.values.lower);
  const ar = val("aroon");
  agrees("Aroon Up", ar.up, T.aroon.values.up);
  agrees("Aroon Down", ar.down, T.aroon.values.down);
  agrees("Aroon-Oszillator", ar.oscillator, T.aroon.values.oscillator);
  const dc = val("donchian");
  agrees("Donchian oben", dc.upper, T.donchianUpper.values);
  agrees("Donchian unten", dc.lower, T.donchianLower.values);
  const ich = val("ichimoku");
  agrees("Tenkan", ich.tenkan, T.tenkan.values);
  agrees("Kijun", ich.kijun, T.kijun.values);
  agrees("Senkou B", ich.spanB, T.spanB.values);
});

test("Stochastik: TA-Lib gibt %K erst ab der %D-Bar aus, danach gleich", () => {
  const st = val("stochastic");
  agrees("%D", st.d, T.stochastic.values.d);
  const firstTa = T.stochastic.values.k.findIndex((v) => v !== null);
  assert.equal(firstTa, I.catalogEntry("stochastic").warmup({ kPeriod: 14, smooth: 3, dPeriod: 3 }));
  agrees("%K", st.k, T.stochastic.values.k, firstTa);
});

test("Startwert-Konvention, abklingend: ATR, ADX (TA-Lib laesst die erste True Range weg)", () => {
  converges("ATR 14", val("atr"), T.atr.values, 190);
  converges("ATR 10", val("atr", { period: 10 }), T.atr10.values, 138);
  converges("ADX 14", val("adx").adx, T.adx.values, 264);
});

test("Startwert-Konvention, abklingend: MACD (TA-Lib startet die schnelle EMA erst mit der langsamen)", () => {
  const m = val("macd");
  converges("MACD", m.macd, T.macd.values.macd, 137);
  converges("Signal", m.signal, T.macd.values.signal, 151);
  converges("Histogramm", m.histogram, T.macd.values.histogram, 170);
});

test("OBV: gleicher Verlauf, TA-Lib startet bei V_0 statt bei 0", () => {
  const o = val("obv"), v0 = ref.volume[0];
  agrees("OBV + V_0", o.map((x) => x + v0), T.obv.values);
});

test("Parabolic SAR: gleich ausser Startbar und Umkehrbars, deren Extrem den alten Extrempunkt uebertrifft", () => {
  const { sar, direction } = val("psar"), ta = T.psar.values;
  const inside = [];
  for (let i = 2; i < N; i++) {
    if (direction[i] === direction[i - 1]) continue;
    if (direction[i] < 0 ? sar[i] < ref.high[i] : sar[i] > ref.low[i]) inside.push(i);
  }
  const differ = [];
  for (let i = 1; i < N; i++) if (!close(sar[i], ta[i])) differ.push(i);
  /* Bar 2: TA-Lib nutzt Bar 0 nur zur Initialisierung und begrenzt mit einer Vorbar (Konvention). */
  assert.deepEqual(inside, [173, 308]);
  assert.deepEqual(differ, [2, ...inside], "Abweichungen nur an Startbar und den Umkehrbars mit SAR in der Spanne");
  /* TA-Lib setzt dort das Extrem der Umkehrbar. */
  for (const i of inside) assert.equal(ta[i], direction[i] < 0 ? ref.high[i] : ref.low[i]);
});

test("Parabolic SAR: Wert der Umkehrbar liegt ausserhalb ihrer Spanne (Wilder, TA-Lib)", { todo: "Engine-Befund B7: SAR = alter Extrempunkt ohne das Extrem der Umkehrbar; Korrektur als eigener Fachmodell-PR vorgelegt" }, () => {
  const { sar, direction } = val("psar");
  for (let i = 2; i < N; i++) {
    if (direction[i] === direction[i - 1]) continue;
    if (direction[i] < 0) assert.ok(sar[i] >= ref.high[i], i + ": kurzer SAR " + sar[i] + " unter Hoch " + ref.high[i]);
    else assert.ok(sar[i] <= ref.low[i], i + ": langer SAR " + sar[i] + " ueber Tief " + ref.low[i]);
  }
});
