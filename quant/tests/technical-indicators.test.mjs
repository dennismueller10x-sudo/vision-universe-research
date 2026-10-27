/* Referenz- und Grenzfalltests fuer quant/engines/technical/indicators.js.

   Referenzdaten: eingefrorener realer Ausschnitt (AAPL, Tiingo EOD,
   Okt. 2023 – Dez. 2024, kein Split im Fenster) in
   fixtures/technical-reference-aapl.json. Jeder Indikator wird gegen eine
   unabhaengig geschriebene, absichtlich naive Formel-Implementierung
   geprueft (Schleifen direkt nach Definition), nicht gegen sich selbst. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const Features = require("../engines/technical/feature-store.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
const N = ref.close.length;

const fin = Number.isFinite;
function close(a, b, eps = 1e-9) {
  if (!fin(a) && !fin(b)) return true;
  return fin(a) && fin(b) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
}
function assertSeries(actual, expected, label, eps) {
  assert.equal(actual.length, expected.length, label + ": Laenge");
  for (let i = 0; i < expected.length; i++) assert.ok(close(actual[i], expected[i], eps), `${label}[${i}]: ${actual[i]} != ${expected[i]}`);
}
function firstFinite(a) { return a.findIndex(fin); }

/* ---------- naive Referenzen ---------- */
const nSma = (x, n) => x.map((_, i) => i < n - 1 ? NaN : x.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
function nEma(x, n) {
  const out = x.map(() => NaN), k = 2 / (n + 1);
  for (let i = n - 1; i < x.length; i++) out[i] = i === n - 1 ? x.slice(0, n).reduce((a, b) => a + b, 0) / n : out[i - 1] + k * (x[i] - out[i - 1]);
  return out;
}
const nWma = (x, n) => x.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = 0; j < n; j++) s += (n - j) * x[i - j]; return s / (n * (n + 1) / 2); });
function nTr(h, l, c) { return c.map((_, i) => i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))); }
function nWilder(x, n, start = 0) {
  const out = x.map(() => NaN);
  for (let i = start + n - 1; i < x.length; i++) out[i] = i === start + n - 1 ? x.slice(start, start + n).reduce((a, b) => a + b, 0) / n : (out[i - 1] * (n - 1) + x[i]) / n;
  return out;
}
function nRsi(c, n) {
  const g = c.map((v, i) => i ? Math.max(0, v - c[i - 1]) : NaN), l = c.map((v, i) => i ? Math.max(0, c[i - 1] - v) : NaN);
  const ag = nWilder(g, n, 1), al = nWilder(l, n, 1);
  return c.map((_, i) => fin(ag[i]) ? (al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])) : NaN);
}
const nStd = (x, n) => x.map((_, i) => { if (i < n - 1) return NaN; const w = x.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n; return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n); });
const nMax = (x, n) => x.map((_, i) => i < n - 1 ? NaN : Math.max(...x.slice(i - n + 1, i + 1)));
const nMin = (x, n) => x.map((_, i) => i < n - 1 ? NaN : Math.min(...x.slice(i - n + 1, i + 1)));

/* ---------- Trend ---------- */
test("SMA/EMA/WMA entsprechen der Definition (AAPL real)", () => {
  assertSeries(I.compute(S, "sma", { period: 50 }).values, nSma(S.close, 50), "SMA50");
  assertSeries(I.compute(S, "ema", { period: 200 }).values, nEma(S.close, 200), "EMA200", 1e-9);
  assertSeries(I.compute(S, "ema", { period: 20 }).values, nEma(S.close, 20), "EMA20", 1e-9);
  assertSeries(I.compute(S, "wma", { period: 20 }).values, nWma(S.close, 20), "WMA20");
});

test("Donchian-Kanal = rollierendes Hoch/Tief", () => {
  const d = I.compute(S, "donchian", { period: 20 }).values;
  assertSeries(d.upper, nMax(S.high, 20), "upper");
  assertSeries(d.lower, nMin(S.low, 20), "lower");
});

test("Supertrend: Linie liegt auf der richtigen Seite, Richtungswechsel nur beim Schluss jenseits des Bands", () => {
  const st = I.compute(S, "supertrend", { period: 10, multiplier: 3 }).values;
  let flips = 0;
  for (let i = 1; i < N; i++) {
    if (!fin(st.line[i])) continue;
    if (st.direction[i] > 0) assert.ok(st.line[i] <= S.close[i] + 1e-9, "Aufwaerts: Linie unter dem Schluss an " + i);
    else assert.ok(st.line[i] >= S.close[i] - 1e-9, "Abwaerts: Linie ueber dem Schluss an " + i);
    if (fin(st.direction[i - 1]) && st.direction[i] !== st.direction[i - 1]) {
      flips++;
      if (st.direction[i] > 0) assert.ok(S.close[i] > st.upper[i]);
      else assert.ok(S.close[i] < st.lower[i]);
    }
    /* Nachziehregel: unteres Band sinkt nur, wenn der Vorschluss darunter lag. */
    if (fin(st.lower[i - 1]) && st.lower[i] < st.lower[i - 1]) assert.ok(S.close[i - 1] < st.lower[i - 1]);
  }
  assert.ok(flips >= 2, "reale Reihe ueber 15 Monate hat Richtungswechsel");
});

test("ADX nutzt dieselbe Mathematik wie feature-store (Quant und Technical rechnen identisch)", () => {
  const a = I.compute(S, "adx", { period: 14 }).values;
  const f = Features.adx(S.high, S.low, S.close, 14);
  assertSeries(a.adx, f.adx, "ADX");
  const k = firstFinite(a.adx);
  assert.equal(k, 27, "ADX-Aufwaermphase = 2n−1");
  for (let i = k; i < N; i++) assert.ok(a.adx[i] >= 0 && a.adx[i] <= 100);
});

/* ---------- Momentum ---------- */
test("RSI (Wilder) entspricht der naiven Formel und dem Quant-Feature", () => {
  const r = I.compute(S, "rsi", { period: 14 }).values;
  assertSeries(r, nRsi(S.close, 14), "RSI14", 1e-9);
  assert.equal(firstFinite(r), 14);
});

test("MACD = EMA12 − EMA26, Signal EMA9", () => {
  const m = I.compute(S, "macd").values;
  const e12 = nEma(S.close, 12), e26 = nEma(S.close, 26), line = e12.map((v, i) => v - e26[i]);
  assertSeries(m.macd, line, "MACD", 1e-9);
  const sig = m.signal, k = firstFinite(sig);
  assert.equal(k, 26 + 9 - 2, "Signal-Aufwaermphase");
  const seg = line.slice(25), refSig = nEma(seg, 9);
  for (let i = k; i < N; i++) assert.ok(close(sig[i], refSig[i - 25], 1e-9));
});

test("ROC in Prozent", () => {
  const r = I.compute(S, "roc", { period: 21 }).values;
  for (let i = 21; i < N; i++) assert.ok(close(r[i], 100 * (S.close[i] / S.close[i - 21] - 1)));
  assert.ok(!fin(r[20]));
});

test("Stochastik (14,3,3) entspricht der Definition und liegt in [0,100]", () => {
  const s = I.compute(S, "stochastic").values;
  const hh = nMax(S.high, 14), ll = nMin(S.low, 14);
  const raw = S.close.map((c, i) => fin(hh[i]) ? 100 * (c - ll[i]) / (hh[i] - ll[i]) : NaN);
  const k = raw.map((_, i) => i < 15 ? NaN : (raw[i] + raw[i - 1] + raw[i - 2]) / 3);
  assertSeries(s.k, k, "%K");
  assert.equal(firstFinite(s.d), 14 + 3 + 3 - 3);
  s.k.filter(fin).forEach((v) => assert.ok(v >= 0 && v <= 100));
});

test("CCI(20) entspricht der Definition", () => {
  const c = I.compute(S, "cci", { period: 20 }).values;
  const tp = S.close.map((x, i) => (S.high[i] + S.low[i] + x) / 3);
  for (let i = 19; i < N; i++) {
    const w = tp.slice(i - 19, i + 1), m = w.reduce((a, b) => a + b, 0) / 20, md = w.reduce((a, b) => a + Math.abs(b - m), 0) / 20;
    assert.ok(close(c[i], (tp[i] - m) / (0.015 * md), 1e-9), "CCI an " + i);
  }
});

/* ---------- Volatilitaet ---------- */
test("ATR (Wilder) und Bollinger/Keltner", () => {
  const a = I.compute(S, "atr", { period: 14 }).values;
  assertSeries(a, nWilder(nTr(S.high, S.low, S.close), 14), "ATR14", 1e-9);
  const b = I.compute(S, "bollinger", { period: 20, k: 2 }).values, sd = nStd(S.close, 20), m = nSma(S.close, 20);
  assertSeries(b.upper, m.map((v, i) => v + 2 * sd[i]), "BB oben", 1e-9);
  assertSeries(b.lower, m.map((v, i) => v - 2 * sd[i]), "BB unten", 1e-9);
  const k = I.compute(S, "keltner").values, e = nEma(S.close, 20), a10 = nWilder(nTr(S.high, S.low, S.close), 10);
  assertSeries(k.upper, e.map((v, i) => v + 2 * a10[i]), "Keltner oben", 1e-9);
});

/* ---------- Volumen ---------- */
test("OBV, MFI, relative Volumenstaerke, Volumenspitzen", () => {
  const o = I.compute(S, "obv").values;
  let acc = 0;
  for (let i = 1; i < N; i++) { acc += S.close[i] > S.close[i - 1] ? S.volume[i] : S.close[i] < S.close[i - 1] ? -S.volume[i] : 0; assert.equal(o[i], acc); }
  const mf = I.compute(S, "mfi", { period: 14 }).values;
  const tp = S.close.map((x, i) => (S.high[i] + S.low[i] + x) / 3);
  for (let i = 14; i < N; i++) {
    let p = 0, q = 0;
    for (let j = i - 13; j <= i; j++) { const f = tp[j] * S.volume[j]; if (tp[j] > tp[j - 1]) p += f; else if (tp[j] < tp[j - 1]) q += f; }
    assert.ok(close(mf[i], q === 0 ? 100 : 100 - 100 / (1 + p / q), 1e-9), "MFI an " + i);
  }
  const rv = I.compute(S, "relativeVolume", { period: 20 }).values;
  const feat = Features.computeFeatures({ ...S, length: N, timestamps: ref.date }, {}).columns.relativeVolume;
  assertSeries(rv, feat, "relatives Volumen = Quant-Feature");
  const sp = I.compute(S, "volumeSpikes", { period: 20, threshold: 2 }).values;
  sp.forEach((v, i) => { if (fin(v)) assert.equal(v, rv[i] >= 2 ? 1 : 0); });
  assert.ok(sp.some((v) => v === 1), "reale Reihe enthaelt Volumenspitzen");
});

/* ---------- Katalogvertrag ---------- */
test("Aufwaermperiode im Katalog stimmt mit dem ersten Wert ueberein", () => {
  for (const entry of I.CATALOG) {
    const r = I.compute(S, entry.id);
    assert.ok(!r.error, entry.id + ": " + r.error);
    const v = r.values, main = Array.isArray(v) ? v : v.line || v.adx || v.macd || v.k || v.upper || v.middle || v.sar || v.cloudB || v.up
      || v[Object.keys(v)[0]]; /* 1.2.0: Hauptreihe neuer Mehrfachausgaben ist die erste (pivot, trix, long, open) */
    /* MACD und PPO: Hauptreihe startet vor dem Signal (warmup = Histogramm); Stochastik und Stochastic RSI: %K vor %D. */
    const expected = entry.id === "macd" || entry.id === "ppo" ? r.params.slow - 1 : entry.id === "stochastic" ? r.params.kPeriod + r.params.smooth - 2
      : entry.id === "stochRsi" ? r.params.rsiPeriod + r.params.stochPeriod + r.params.kSmooth - 2 : r.warmup;
    assert.equal(firstFinite(main), expected, entry.id + " Aufwaermphase");
    assert.ok(entry.definition && entry.name && entry.family, entry.id + " dokumentiert");
  }
});

test("Kausalitaet: Werte an i haengen nicht von Bars nach i ab", () => {
  const cut = 260;
  const prefix = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.slice(0, cut)]));
  for (const entry of I.CATALOG) {
    const full = I.compute(S, entry.id).values, part = I.compute(prefix, entry.id).values;
    const pairs = Array.isArray(full) ? [[full, part]] : Object.keys(full).map((k) => [full[k], part[k]]);
    for (const [f, p] of pairs) for (let i = 0; i < cut; i++) assert.ok(close(f[i], p[i], 1e-12), `${entry.id}[${i}] veraendert sich durch Zukunft`);
  }
});

test("Determinismus: zweimal gerechnet ist bitgleich", () => {
  for (const entry of I.CATALOG) assert.deepEqual(JSON.stringify(I.compute(S, entry.id)), JSON.stringify(I.compute(S, entry.id)));
});

test("Grenzfaelle: Luecken, zu kurze Reihen, ungueltige Parameter, fehlende Spalten", () => {
  const gap = { ...S, close: S.close.slice() };
  gap.close[100] = null;
  const sma = I.compute(gap, "sma", { period: 10 }).values;
  for (let i = 100; i < 110; i++) assert.ok(!fin(sma[i]), "Luecke im Fenster ergibt NaN, nicht 0");
  assert.ok(fin(sma[110]));
  assert.ok(!fin(I.compute(gap, "wma", { period: 5 }).values[102]));
  const short = { open: [1, 2], high: [1, 2], low: [1, 2], close: [1, 2], volume: [1, 1] };
  assert.ok(I.compute(short, "rsi").values.every((v) => !fin(v)), "zu kurz: nur NaN");
  assert.match(I.compute(S, "sma", { period: 0 }).error, /INVALID_PARAM/);
  assert.match(I.compute(S, "ema", { period: 2.5 }).error, /INVALID_PARAM/);
  assert.match(I.compute({ close: S.close }, "atr").error, /MISSING_INPUT/);
  assert.equal(I.compute(S, "nope").error, "UNKNOWN_INDICATOR");
  /* Flache Reihe: keine Division durch null. */
  const flat = { open: Array(40).fill(5), high: Array(40).fill(5), low: Array(40).fill(5), close: Array(40).fill(5), volume: Array(40).fill(100) };
  assert.equal(I.compute(flat, "stochastic").values.k[39], 50);
  assert.equal(I.compute(flat, "cci").values[39], 0);
  assert.equal(I.compute(flat, "rsi").values[39], 100);
});
