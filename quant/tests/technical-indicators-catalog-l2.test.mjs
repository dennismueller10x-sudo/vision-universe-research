/* Katalogerweiterung technical-indicators-1.3.0 (L2a, docs/technical/TECHNICAL_LIBRARY.md):
   DEMA, TEMA, TRIMA, T3, ZLEMA, ALMA, McGinley, PPO, Stochastic RSI, NATR, A/D-Linie, Chaikin-Oszillator,
   Balance of Power, Momentum, Standardabweichung, R² des Regressionskanals.
   Dazu L3: TA-Lib-Abgleich der 1.2.0-Eintraege KAMA, Regressionskanal, TRIX, Ultimate Oscillator, CMO.

   Pruefungen:
     (a) fremde Implementierung: TA-Lib 0.8.2 auf echten AAPL-Tageskursen, eingefroren in
         fixtures/technical-talib-reference-aapl-ext.json (scripts/technical/build-talib-reference.py --set ext);
     (b) naive, unabhaengig geschriebene Referenz fuer Indikatoren ohne TA-Lib-Gegenstueck (ZLEMA, ALMA, McGinley);
     (c) von Hand gerechnete Kleinstbeispiele und Grenzfaelle;
     (d) Kausalitaet, Determinismus und Aufwaermphase prueft technical-indicators.test.mjs fuer JEDEN Katalogeintrag. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const TA = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-reference-aapl-ext.json", import.meta.url), "utf8"));
const T = TA.series;
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
const N = S.close.length, C = S.close;
const fin = Number.isFinite;
const TOL = 1e-8;
const val = (id, p) => I.compute(S, id, p).values;
const NEW_IDS = ["dema", "tema", "trima", "t3", "zlema", "alma", "mcginley", "ppo", "stochRsi", "natr", "adLine", "chaikinOsc", "balanceOfPower", "momentum", "stdDev"];

function near(a, b, eps = TOL) { return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); }
/** Gleich an jeder Bar ab `from`; null in der Referenz genau dort, wo die Engine NaN hat. */
function agrees(name, eng, ta, from = 0) {
  assert.equal(eng.length, N, name + ": Laenge");
  const bad = [];
  for (let i = from; i < N; i++) {
    const e = eng[i], t = ta[i];
    if (t === null || !fin(e)) { if ((t === null) !== !fin(e)) bad.push(i + ":Aufwaermung"); continue; }
    if (!near(e, t)) bad.push(i + ":" + e + "≠" + t);
  }
  assert.deepEqual(bad.slice(0, 5), [], name);
}
/** Startwert-Konvention: vor `conv` verschieden, aber abklingend; ab `conv` gleich. */
function converges(name, eng, ta, conv) {
  agrees(name, eng, ta, conv);
  const first = eng.findIndex((e, i) => fin(e) && ta[i] !== null);
  const d = (i) => Math.abs(eng[i] - ta[i]) / Math.max(1, Math.abs(ta[i]));
  assert.ok(d(first) > TOL, name + ": erwartete Startabweichung fehlt");
  assert.ok(d(conv - 1) < d(first) / 100, name + ": Abweichung klingt nicht ab");
}

test("Fixture: TA-Lib-Version, Satz ext und Quelle festgehalten", () => {
  assert.equal(TA.libraryVersion, "0.8.2");
  assert.equal(TA.set, "ext");
  assert.equal(TA.bars, N);
});

test("(a) exakt gleich TA-Lib: DEMA, TEMA, TRIMA (gerade und ungerade), T3, PPO, Momentum, Standardabweichung", () => {
  agrees("DEMA 20", val("dema"), T.dema.values);
  agrees("TEMA 20", val("tema"), T.tema.values);
  agrees("TRIMA 20", val("trima"), T.trima20.values);
  agrees("TRIMA 15", val("trima", { period: 15 }), T.trima15.values);
  agrees("T3 5/0,7", val("t3"), T.t3.values);
  agrees("PPO 12/26", val("ppo").ppo, T.ppo.values);
  agrees("MOM 10", val("momentum"), T.momentum.values);
  agrees("STDDEV 20", val("stdDev"), T.stdDev.values);
});

test("(a) exakt gleich TA-Lib: A/D-Linie, Balance of Power, Stochastic RSI (%K ab der ersten TA-Lib-Bar)", () => {
  agrees("AD", val("adLine"), T.adLine.values);
  agrees("BOP", val("balanceOfPower").bop, T.bop.values);
  const sr = val("stochRsi");
  agrees("StochRSI %K", sr.k, T.stochRsi.values.k);
  /* TA-Lib gibt den rohen Wert erst ab der ersten geglaetteten Bar aus (wie bei STOCH). */
  const firstTa = T.stochRsi.values.raw.findIndex((v) => v !== null);
  assert.equal(firstTa, sr.k.findIndex(fin));
  agrees("StochRSI roh", sr.raw, T.stochRsi.values.raw, firstTa);
});

test("(a) L3: KAMA, Regressionskanal (Wert, Steigung, R²), TRIX und Ultimate Oscillator exakt gleich TA-Lib", () => {
  agrees("KAMA 10", val("kama"), T.kama.values);
  const lr = val("linreg");
  agrees("LINEARREG 50", lr.value, T.linreg.values);
  agrees("LINEARREG_SLOPE 50", lr.slope, T.linregSlope.values);
  agrees("R² 50 = CORREL²", lr.r2, T.linregR2.values);
  agrees("TRIX 15", val("trix").trix, T.trix.values);
  agrees("ULTOSC 7/14/28", val("ultimateOscillator"), T.ultimateOscillator.values);
});

test("(a) Startwert-Konvention, abklingend: NATR (wie ATR) und Chaikin-Oszillator (TA-Lib startet die EMA mit dem ersten Wert)", () => {
  converges("NATR 14", val("natr"), T.natr.values, 190);
  converges("ADOSC 3/10", val("chaikinOsc"), T.chaikinOsc.values, 119);
});

test("(a) CMO: andere Definition dokumentiert – TA-Lib glaettet nach Wilder und ist dort 2·RSI − 100", () => {
  const rsi = val("rsi"), ours = val("cmo"), ta = T.cmo.values;
  for (let i = 0; i < N; i++) if (ta[i] !== null) assert.ok(near(2 * rsi[i] - 100, ta[i], 1e-7), "TA-Lib CMO = 2·RSI − 100 an " + i);
  /* Die Engine folgt Chande/Kroll (einfache Summen); beide sind gleich gerichtet, aber nicht gleich. */
  const differ = ta.filter((t, i) => t !== null && fin(ours[i]) && !near(ours[i], t, 1e-6)).length;
  assert.ok(differ > N / 2, "Engine-CMO ist bewusst nicht die geglaettete TA-Lib-Variante");
});

/* ---------- (b) naive Referenzen ohne TA-Lib-Gegenstueck ---------- */
function nEma(x, n) {
  const out = x.map(() => NaN), s = x.findIndex(fin), k = 2 / (n + 1);
  if (s < 0 || s + n > x.length) return out;
  let acc = 0; for (let j = s; j < s + n; j++) acc += x[j];
  out[s + n - 1] = acc / n;
  for (let i = s + n; i < x.length; i++) out[i] = out[i - 1] + k * (x[i] - out[i - 1]);
  return out;
}

test("(b) ZLEMA 20 = EMA_20(2·C − C_{−9}) nach Definition", () => {
  const lag = 9, x = C.map((c, i) => (i >= lag ? 2 * c - C[i - lag] : NaN)), exp = nEma(x, 20), got = val("zlema");
  for (let i = 0; i < N; i++) assert.ok(fin(exp[i]) ? near(got[i], exp[i], 1e-10) : !fin(got[i]), "ZLEMA " + i);
});

test("(b) ALMA 9/0,85/6 nach Definition (Gauss-Gewichte, aeltester Wert zuerst)", () => {
  const n = 9, m = 0.85 * (n - 1), s = n / 6, got = val("alma");
  const w = Array.from({ length: n }, (_, j) => Math.exp(-((j - m) ** 2) / (2 * s * s)));
  const ws = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) {
    if (i < n - 1) { assert.ok(!fin(got[i])); continue; }
    let acc = 0; for (let j = 0; j < n; j++) acc += w[j] * C[i - n + 1 + j];
    assert.ok(near(got[i], acc / ws, 1e-12), "ALMA " + i);
  }
  /* Offset 0,85 gewichtet die juengsten Kurse am staerksten. */
  assert.ok(w[n - 2] > w[0] && w[n - 2] > w[n - 1] * 0.5);
});

test("(b) McGinley Dynamic 14 nach Definition, Start SMA_14", () => {
  const n = 14, got = val("mcginley");
  let md = C.slice(0, n).reduce((a, b) => a + b, 0) / n;
  assert.ok(near(got[n - 1], md, 1e-12));
  for (let i = n; i < N; i++) { md = md + (C[i] - md) / (n * Math.pow(C[i] / md, 4)); assert.ok(near(got[i], md, 1e-10), "McGinley " + i); }
});

/* ---------- (c) Kleinstbeispiele und Grenzfaelle ---------- */
test("(c) von Hand: BOP, A/D, Momentum, TRIMA 3", () => {
  const s = { open: [10, 11, 12], high: [12, 12, 13], low: [9, 10, 11], close: [11, 11, 12], volume: [100, 200, 300] };
  assert.deepEqual(I.compute(s, "balanceOfPower", { period: 2 }).values.bop, [(11 - 10) / 3, 0, 0]);
  /* CLV: (2 − 1)/3 = 1/3 → 33,33…; (1 − 1)/2 = 0; (1 − 1)/2 = 0 */
  const ad = I.compute(s, "adLine").values;
  assert.ok(near(ad[0], 100 / 3) && near(ad[1], 100 / 3) && near(ad[2], 100 / 3));
  assert.deepEqual(I.compute(s, "momentum", { period: 2 }).values.slice(2), [1]);
  /* TRIMA 3 = SMA2(SMA2): Gewichte 1, 2, 1 */
  const tr = I.compute({ close: [1, 2, 4, 8] }, "trima", { period: 3 }).values;
  assert.ok(near(tr[2], (1 + 2 * 2 + 4) / 4) && near(tr[3], (2 + 2 * 4 + 8) / 4));
});

test("(c) Grenzfaelle: flache Reihe ohne Division durch null, Luecken ergeben NaN", () => {
  const n = 80, flat = { open: Array(n).fill(5), high: Array(n).fill(5), low: Array(n).fill(5), close: Array(n).fill(5), volume: Array(n).fill(100) };
  assert.equal(I.compute(flat, "balanceOfPower").values.bop[n - 1], 0, "H = L: BOP 0");
  assert.equal(I.compute(flat, "adLine").values[n - 1], 0, "H = L: kein Beitrag");
  assert.equal(I.compute(flat, "stochRsi").values.k[n - 1], 50, "keine RSI-Spanne: Mitte");
  assert.ok(!fin(I.compute(flat, "linreg", { period: 20 }).values.r2[n - 1]), "konstante Reihe: R² nicht definiert");
  assert.equal(I.compute(flat, "stdDev").values[n - 1], 0);
  assert.equal(I.compute(flat, "mcginley").values[n - 1], 5);
  const gap = { ...S, close: C.slice() };
  gap.close[150] = null;
  assert.ok(!fin(I.compute(gap, "alma").values[150]) && !fin(I.compute(gap, "momentum").values[160]));
  assert.ok(fin(I.compute(gap, "mcginley").values[151]), "McGinley traegt den Zustand ueber die Luecke");
  assert.match(I.compute(S, "t3", { vfactor: -1 }).error, /INVALID_PARAM/);
});

test("Vertrag: neue Eintraege dokumentiert, nur Katalog, Produktflaechen unveraendert", () => {
  assert.match(I.INDICATORS_VERSION, /^technical-indicators-1\.\d+\.\d+$/); /* Versionspin im juengsten Katalogtest (L2b) */
  for (const id of NEW_IDS) {
    const e = I.catalogEntry(id);
    assert.ok(e && e.name && e.definition && e.family && e.catalogOnly === true, id);
    assert.equal(typeof I.compute(S, id).error, "undefined", id);
  }
  assert.ok(I.CATALOG.length >= 53);
  assert.equal(I.CATALOG.filter((e) => !e.catalogOnly).length, 24, "gelistete Indikatoren unveraendert");
});
