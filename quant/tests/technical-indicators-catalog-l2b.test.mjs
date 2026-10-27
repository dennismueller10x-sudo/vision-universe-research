/* Katalogerweiterung technical-indicators-1.4.0 (L2b, docs/technical/TECHNICAL_LIBRARY.md):
   Vortex, Mass Index, Choppiness, Ulcer Index, Force Index, Elder Ray, Ease of Movement, Awesome Oscillator,
   Coppock, KST, TSI, DPO (kausal), historische Volatilitaet, Z-Score, NVI/PVI, PVO, Connors RSI,
   Elder Impulse, Chaikin-Volatilitaet, Envelope, Pivot-Varianten Fibonacci/Camarilla/Woodie.

   (a) Echte AAPL-Kurse: die Formel ein zweites Mal aus TA-Lib-Grundbausteinen zusammengesetzt
       (SMA, EMA, WMA, ROC, SUM, MAX, MIN, STDDEV, MEDPRICE, PPO), eingefroren in
       fixtures/technical-talib-reference-aapl-ext2.json (build-talib-reference.py --set ext2).
   (b) Naive Referenzen fuer NVI/PVI, Connors RSI, Elder Impulse, Envelope, Pivot-Varianten, EMV.
   (c) Kleinstbeispiele und Grenzfaelle. Kausalitaet, Determinismus und Aufwaermphase prueft
       technical-indicators.test.mjs fuer jeden Katalogeintrag. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const TA = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-reference-aapl-ext2.json", import.meta.url), "utf8"));
const T = TA.series;
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
const { high: H, low: L, close: C, volume: V } = S;
const N = C.length;
const fin = Number.isFinite;
const val = (id, p) => I.compute(S, id, p).values;
const NEW_IDS = ["vortex", "massIndex", "choppiness", "ulcerIndex", "forceIndex", "elderRay", "easeOfMovement", "awesomeOscillator", "coppock",
  "kst", "tsi", "dpo", "historicalVolatility", "zScore", "nvi", "pvi", "pvo", "connorsRsi", "elderImpulse", "chaikinVolatility", "envelope",
  "pivotsFib", "pivotsCamarilla", "pivotsWoodie"];

function near(a, b, eps = 1e-8) { return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); }
function agrees(name, eng, ta) {
  const bad = [];
  for (let i = 0; i < N; i++) {
    const e = eng[i], t = ta[i];
    if (t === null || !fin(e)) { if ((t === null) !== !fin(e)) bad.push(i + ":Aufwaermung"); continue; }
    if (!near(e, t)) bad.push(i + ":" + e + "≠" + t);
  }
  assert.deepEqual(bad.slice(0, 5), [], name);
}
function same(name, eng, exp, eps = 1e-10) {
  for (let i = 0; i < N; i++) assert.ok(fin(exp[i]) ? fin(eng[i]) && near(eng[i], exp[i], eps) : !fin(eng[i]), `${name}[${i}]: ${eng[i]} ≠ ${exp[i]}`);
}

test("Fixture: TA-Lib 0.8.2, Satz ext2", () => {
  assert.equal(TA.libraryVersion, "0.8.2");
  assert.equal(TA.set, "ext2");
  assert.equal(TA.bars, N);
});

test("(a) aus TA-Lib-Bausteinen an jeder Bar gleich: Vortex, Mass Index, Choppiness, Ulcer, Force, Elder Ray", () => {
  const vx = val("vortex"), er = val("elderRay");
  agrees("Vortex +", vx.plus, T.vortexPlus.values);
  agrees("Vortex −", vx.minus, T.vortexMinus.values);
  agrees("Mass Index", val("massIndex"), T.massIndex.values);
  agrees("Choppiness", val("choppiness"), T.choppiness.values);
  agrees("Ulcer Index", val("ulcerIndex"), T.ulcerIndex.values);
  agrees("Force Index", val("forceIndex"), T.forceIndex.values);
  agrees("Bull Power", er.bull, T.elderBull.values);
  agrees("Bear Power", er.bear, T.elderBear.values);
});

test("(a) aus TA-Lib-Bausteinen an jeder Bar gleich: AO, Coppock, KST, TSI, DPO, HV, Z-Score, PVO, Chaikin-Volatilitaet", () => {
  agrees("Awesome Oscillator", val("awesomeOscillator"), T.awesomeOscillator.values);
  agrees("Coppock", val("coppock"), T.coppock.values);
  agrees("KST", val("kst").kst, T.kst.values);
  agrees("TSI", val("tsi").tsi, T.tsi.values);
  agrees("DPO", val("dpo"), T.dpo.values);
  agrees("Historische Volatilitaet", val("historicalVolatility"), T.historicalVolatility.values);
  agrees("Z-Score", val("zScore"), T.zScore.values);
  agrees("PVO", val("pvo").pvo, T.pvo.values);
  agrees("Chaikin-Volatilitaet", val("chaikinVolatility"), T.chaikinVolatility.values);
});

/* ---------- (b) naive Referenzen ---------- */
test("(b) NVI und PVI nach Fosback", () => {
  const nv = [1000], pv = [1000];
  for (let i = 1; i < N; i++) {
    nv.push(V[i] < V[i - 1] ? nv[i - 1] * C[i] / C[i - 1] : nv[i - 1]);
    pv.push(V[i] > V[i - 1] ? pv[i - 1] * C[i] / C[i - 1] : pv[i - 1]);
  }
  same("NVI", val("nvi"), nv); same("PVI", val("pvi"), pv);
});

test("(b) Connors RSI 3/2/100 nach Definition", () => {
  const rsi3 = I.rsi(C, 3), streak = [NaN];
  let s = 0;
  for (let i = 1; i < N; i++) { const d = C[i] - C[i - 1]; s = d > 0 ? (s > 0 ? s + 1 : 1) : d < 0 ? (s < 0 ? s - 1 : -1) : 0; streak.push(s); }
  const rsiS = I.rsi(streak, 2), ret = C.map((c, i) => (i ? c / C[i - 1] - 1 : NaN)), exp = [];
  for (let i = 0; i < N; i++) {
    if (i < 101) { exp.push(NaN); continue; }
    const rank = 100 * ret.slice(i - 100, i).filter((r) => r < ret[i]).length / 100;
    exp.push((rsi3[i] + rsiS[i] + rank) / 3);
  }
  same("Connors RSI", val("connorsRsi"), exp);
  assert.ok(val("connorsRsi").filter(fin).every((v) => v >= 0 && v <= 100));
});

test("(b) Elder Impulse: Vorzeichen von EMA13- und MACD-Histogramm-Steigung", () => {
  const e = I.ema(C, 13), h = I.macd(C, 12, 26, 9).histogram, got = val("elderImpulse");
  for (let i = 1; i < N; i++) {
    if (!fin(e[i - 1]) || !fin(h[i - 1])) { assert.ok(!fin(got[i])); continue; }
    const de = e[i] - e[i - 1], dh = h[i] - h[i - 1];
    assert.equal(got[i], de > 0 && dh > 0 ? 1 : de < 0 && dh < 0 ? -1 : 0, "Impulse " + i);
  }
  assert.ok(got.includes(1) && got.includes(-1) && got.includes(0), "reale Reihe zeigt alle drei Zustaende");
});

test("(b) Envelope, Pivot-Varianten und Ease of Movement nach Definition", () => {
  const sma = I.sma(C, 20), env = val("envelope");
  same("Envelope oben", env.upper, sma.map((v) => v * 1.025)); same("Envelope unten", env.lower, sma.map((v) => v * 0.975));
  const i = 200, Hp = H[i - 1], Lp = L[i - 1], Cp = C[i - 1], R = Hp - Lp, P = (Hp + Lp + Cp) / 3;
  const fib = val("pivotsFib"), cam = val("pivotsCamarilla"), wd = val("pivotsWoodie");
  assert.ok(near(fib.r2[i], P + 0.618 * R) && near(fib.s3[i], P - R));
  assert.ok(near(cam.r4[i], Cp + R * 1.1 / 2) && near(cam.s1[i], Cp - R * 1.1 / 12));
  const Pw = (Hp + Lp + 2 * Cp) / 4;
  assert.ok(near(wd.p[i], Pw) && near(wd.r1[i], 2 * Pw - Lp) && near(wd.s2[i], Pw - R));
  assert.ok(!fin(fib.p[0]) && fin(fib.p[1]), "Pivots erst ab der zweiten Bar (Vorbar)");
  const raw = C.map((_, k) => (k ? ((H[k] + L[k]) / 2 - (H[k - 1] + L[k - 1]) / 2) / ((V[k] / 1e8) / (H[k] - L[k])) : NaN));
  same("EMV", val("easeOfMovement"), I.sma(raw, 14), 1e-9);
});

/* ---------- (c) Kleinstbeispiele und Grenzfaelle ---------- */
test("(c) von Hand: Vortex, DPO, Z-Score, Force Index", () => {
  const s = { high: [10, 12, 11, 13], low: [9, 10, 10, 11], close: [9.5, 11, 10.5, 12.5], volume: [1, 2, 3, 4] };
  /* VM+ = |12−9|=3, |11−10|=1, |13−10|=3; VM− = |10−10|=0, |10−12|=2, |11−11|=0; TR = 2.5, 1, 2.5 (Periode 3: Σ=6) */
  const vx = I.compute(s, "vortex", { period: 3 }).values;
  assert.ok(near(vx.plus[3], 7 / 6) && near(vx.minus[3], 2 / 6));
  /* DPO 2: k = 2, SMA2(Bar 3) = 11,5 → C_1 − 11,5 = −0,5 */
  assert.ok(near(I.compute(s, "dpo", { period: 2 }).values[3], 11 - 11.5));
  /* Z-Score 2 an Bar 3: Mittel 11,5, σ 1 → +1 */
  assert.ok(near(I.compute(s, "zScore", { period: 2 }).values[3], 1));
  /* Force Index 1 = (C − C₋₁)·V */
  assert.deepEqual(I.compute(s, "forceIndex", { period: 1 }).values.slice(1), [3, -1.5, 8]);
});

test("(c) Grenzfaelle: flache Reihe ohne Division durch null, Luecken ergeben NaN", () => {
  const n = 150, flat = { open: Array(n).fill(5), high: Array(n).fill(5), low: Array(n).fill(5), close: Array(n).fill(5), volume: Array(n).fill(100) };
  for (const id of ["choppiness", "zScore", "easeOfMovement", "vortex", "tsi", "chaikinVolatility"]) {
    const v = I.compute(flat, id).values, a = Array.isArray(v) ? v : v[Object.keys(v)[0]];
    assert.ok(!fin(a[n - 1]), id + ": ohne Bewegung nicht definiert");
  }
  assert.equal(I.compute(flat, "ulcerIndex").values[n - 1], 0, "kein Rueckgang");
  assert.equal(I.compute(flat, "historicalVolatility").values[n - 1], 0);
  assert.equal(I.compute(flat, "nvi").values[n - 1], 1000);
  assert.equal(I.compute(flat, "elderImpulse").values[n - 1], 0);
  const gap = { ...S, close: C.slice() };
  gap.close[150] = null;
  assert.ok(!fin(I.compute(gap, "historicalVolatility").values[160]) && !fin(I.compute(gap, "zScore").values[155]));
  assert.ok(fin(I.compute(gap, "nvi").values[152]), "NVI traegt den Stand ueber die Luecke");
  assert.match(I.compute(S, "envelope", { pct: -1 }).error, /INVALID_PARAM/);
});

test("Vertrag: 1.4.0, neue Eintraege dokumentiert, nur Katalog, Produktflaechen unveraendert", () => {
  assert.equal(I.INDICATORS_VERSION, "technical-indicators-1.4.0");
  for (const id of NEW_IDS) {
    const e = I.catalogEntry(id);
    assert.ok(e && e.name && e.definition && e.family && e.catalogOnly === true, id);
    assert.equal(typeof I.compute(S, id).error, "undefined", id);
  }
  assert.equal(I.CATALOG.length, 77);
  assert.equal(I.CATALOG.filter((e) => !e.catalogOnly).length, 24, "gelistete Indikatoren unveraendert");
});
