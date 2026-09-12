/* Indikatoren: gegen die BESTEHENDE Technical-Engine nachgerechnet.

   Der Sinn dieser Datei ist nicht, dass die Formeln laufen, sondern dass
   sie dieselben Werte liefern wie die bereits ausgelieferten Serien. Zwei
   Definitionen desselben RSI im selben Produkt waeren ein stiller Fehler. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const I = require(join(root, "discover", "engines", "indicators.js"));

const payload = JSON.parse(readFileSync(
  join(root, "quant", "data", "technical", "instruments", "NVDA.json"), "utf8"));
const closes = payload.bars.close;
const features = payload.bundle.featuresAtCutoff;
const last = closes.length - 1;

test("SMA 50 trifft den Wert der bestehenden Engine", () => {
  assert.ok(Math.abs(I.sma(closes, 50)[last] - features.sma50) < 1e-6);
});

test("SMA 20 und 200 treffen die bestehende Engine", () => {
  assert.ok(Math.abs(I.sma(closes, 20)[last] - features.sma20) < 1e-6);
  assert.ok(Math.abs(I.sma(closes, 200)[last] - features.sma200) < 1e-6);
});

test("EMA 20 und 50 treffen die bestehende Engine", () => {
  assert.ok(Math.abs(I.ema(closes, 20)[last] - features.ema20) < 1e-5,
    I.ema(closes, 20)[last] + " != " + features.ema20);
  assert.ok(Math.abs(I.ema(closes, 50)[last] - features.ema50) < 1e-5);
});

test("RSI 14 trifft die bestehende Engine", () => {
  assert.ok(Math.abs(I.rsi(closes, 14)[last] - features.rsi14) < 1e-5);
});

test("MACD trifft die bestehende Engine", () => {
  const m = I.macd(closes, 12, 26, 9);
  assert.ok(Math.abs(m.macd[last] - features.macd) < 1e-5);
  assert.ok(Math.abs(m.signal[last] - features.macdSignal) < 1e-5);
  assert.ok(Math.abs(m.histogram[last] - features.macdHistogram) < 1e-5);
});

test("ATR 14 trifft die bestehende Engine", () => {
  const bars = payload.bars.timestamps.map((t, i) => ({
    date: t, open: payload.bars.open[i], high: payload.bars.high[i],
    low: payload.bars.low[i], close: payload.bars.close[i], volume: payload.bars.volume[i]
  }));
  assert.ok(Math.abs(I.atr(bars, 14)[last] - features.atr) < 1e-4,
    I.atr(bars, 14)[last] + " != " + features.atr);
});

test("relatives Volumen trifft die bestehende Engine (Median der Vorbars)", () => {
  const rel = I.relativeVolume(payload.bars.volume, 20)[last];
  assert.ok(Math.abs(rel - features.relativeVolume) < 1e-4,
    rel + " != " + features.relativeVolume);
});

test("die zweite Volumendefinition ist benannt und weicht bewusst ab", () => {
  const median = I.relativeVolume(payload.bars.volume, 20)[last];
  const mittel = I.relativeVolume(payload.bars.volume, 20, { basis: "mean" })[last];
  assert.ok(median !== mittel, "sonst waere die Unterscheidung Dekoration");
  const avg20 = I.sma(payload.bars.volume, 20)[last];
  assert.ok(Math.abs(mittel - payload.bars.volume[last] / avg20) < 1e-9,
    "die Mittelvariante muss der Definition aus market-factors.js entsprechen");
});

test("Reihen sind so lang wie die Eingabe und beginnen mit Luecken, nicht mit Nullen", () => {
  const sma = I.sma(closes, 200);
  assert.equal(sma.length, closes.length);
  assert.equal(sma[0], null);
  assert.equal(sma[198], null);
  assert.equal(typeof sma[199], "number");
});

test("zu kurze Reihen ergeben nur Luecken", () => {
  const kurz = [1, 2, 3];
  assert.deepEqual(I.ema(kurz, 200), [null, null, null]);
  assert.deepEqual(I.rsi(kurz, 14), [null, null, null]);
  assert.deepEqual(I.sma(kurz, 10), [null, null, null]);
});

test("Bollinger: Mitte ist der SMA, Baender liegen symmetrisch", () => {
  const bb = I.bollinger(closes, 20, 2);
  const sma20 = I.sma(closes, 20);
  assert.ok(Math.abs(bb.middle[last] - sma20[last]) < 1e-9);
  assert.ok(Math.abs((bb.upper[last] - bb.middle[last]) - (bb.middle[last] - bb.lower[last])) < 1e-9);
  assert.ok(bb.upper[last] > bb.lower[last]);
});

test("Rebasierung beginnt bei 100 und bleibt verhaeltnistreu", () => {
  const r = I.rebase([50, 75, 100]);
  assert.deepEqual(r, [100, 150, 200]);
});

test("relative Staerke gegen eine identische Reihe ist konstant", () => {
  const line = I.relativeStrengthLine(closes.slice(-100), closes.slice(-100));
  line.forEach((v) => assert.ok(Math.abs(v - 100) < 1e-6));
});
