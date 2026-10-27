/* Candlestick-Bibliothek (candlesticks.js, L4, docs/technical/CANDLESTICKS.md).

   (a) Fremde Implementierung auf echten Kursen: TA-Lib 0.8.2 (CDL*) auf 38 Titeln x 270 echten Tagesbars,
       eingefroren in fixtures/technical-talib-candles.json (scripts/technical/build-talib-reference.py --set candles).
       Verglichen wird ab der TA-Lib-Aufwaermphase, Doji-Formen ohne Vorzeichen.
       - Mit Rundung (Produktmodus): Abweichungen sind Gleichstaende (z. B. Koerper 0,14 gegen Mittel 0,14),
         die TA-Lib nach Gleitkommarest entscheidet, und Fenster ohne Bewegung (bei uns nicht entscheidbar).
       - Ohne Rundung (roundTies: false) muss die Uebereinstimmung praktisch vollstaendig sein: Damit ist belegt,
         dass die Regeln dieselben sind und nur die Gleichstandsbehandlung abweicht.
   (b) Von Hand konstruierte Kerzenfolgen je Muster: positiver und negativer Fall.
   (c) Kausalitaet (abgeschnittene und vergiftete Zukunft), Determinismus, Aufwaermphase, Luecken. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../engines/technical/candlesticks.js");
const FX = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-candles.json", import.meta.url), "utf8"));
const fin = Number.isFinite;
const PRESENCE_ONLY = new Set(["doji", "longLeggedDoji", "dragonflyDoji", "gravestoneDoji"]);

function compare(roundTies) {
  const st = {};
  for (const [t, title] of Object.entries(FX.titles)) {
    const ours = K.detect(title, { roundTies }).patterns;
    for (const p of K.PATTERNS) {
      if (!p.ta || !FX.functions[p.id]) continue; /* Muster ab 1.1.0: technical-candlesticks-2.test.mjs */
      const s = (st[p.id] = st[p.id] || { both: 0, onlyUs: 0, onlyTa: 0, sign: 0, undecided: 0 });
      const ta = new Map(title.signals[p.id].map(([i, v]) => [i, Math.sign(v)]));
      const a = ours[p.id];
      for (let i = FX.lookback[p.id]; i < a.length; i++) {
        const tv = ta.get(i) || 0;
        if (!fin(a[i])) { if (tv) s.undecided++; continue; }
        if (a[i] && tv) { if (PRESENCE_ONLY.has(p.id) || p.direction === "neutral" || a[i] === tv) s.both++; else s.sign++; }
        else if (a[i]) s.onlyUs++;
        else if (tv) s.onlyTa++;
      }
    }
  }
  return st;
}
const rate = (s) => { const tot = s.both + s.onlyUs + s.onlyTa + s.sign; return tot ? s.both / tot : 1; };

test("Fixture: TA-Lib 0.8.2, 38 Titel mit echten Tagesbars, alle 26 TA-Lib-Muster", () => {
  assert.equal(FX.libraryVersion, "0.8.2");
  assert.equal(Object.keys(FX.titles).length, 38);
  assert.equal(K.PATTERNS.filter((p) => p.ta && FX.functions[p.id]).length, 26);
  for (const [id, fn] of Object.entries(FX.functions)) assert.equal(K.pattern(id).ta, fn, id);
});

test("(a) TA-Lib-Abgleich ohne Rundung: gleiche Regeln (≥ 99,5 % je Muster, nie verschiedene Richtung)", () => {
  const st = compare(false);
  for (const [id, s] of Object.entries(st)) {
    assert.equal(s.sign, 0, id + ": Richtung");
    assert.ok(rate(s) >= 0.995, id + ": " + JSON.stringify(s));
  }
});

test("(a) TA-Lib-Abgleich im Produktmodus: ≥ 98 % je Muster mit ≥ 20 Faellen, alle seltenen Muster gefunden", () => {
  const st = compare(true);
  let both = 0, all = 0;
  for (const [id, s] of Object.entries(st)) {
    const n = s.both + s.onlyTa + s.onlyUs;
    both += s.both; all += n + s.sign;
    assert.equal(s.sign, 0, id + ": Richtung");
    assert.ok(s.both > 0, id + ": kein einziger gemeinsamer Fall in der Fixture");
    if (n >= 20) assert.ok(rate(s) >= 0.98, id + ": " + JSON.stringify(s));
  }
  assert.ok(both / all >= 0.99, "gesamt " + (both / all));
});

test("(a) Gleichstand: ACXP-artiger Fall, Koerper = Mittel ist kein langer Koerper (Produktmodus), TA-Lib entscheidet zufaellig", () => {
  /* 10 Vorbars mit Koerper 0,14, dann eine Kerze ohne Schatten mit Koerper 0,14. */
  const o = [], h = [], l = [], c = [];
  for (let i = 0; i < 10; i++) { o.push(10); c.push(10.14); h.push(10.2); l.push(9.9); }
  o.push(2.92); h.push(2.92); l.push(2.78); c.push(2.78);
  const s = { open: o, high: h, low: l, close: c };
  assert.equal(K.detect(s).patterns.marubozu[10], 0, "Koerper = Mittel: nicht lang");
  c[10] = 2.77; l[10] = 2.77;
  assert.equal(K.detect(s).patterns.marubozu[10], -1, "Koerper > Mittel: schwarzer Marubozu");
});

/* ---------- (b) konstruierte Kerzenfolgen ---------- */
/* Grundreihe: 12 ruhige Kerzen (Koerper 1, Spanne 2) um 100, dann das Muster. Mittel: Koerper 1, Spanne 2. */
function base(n = 12, level = 100, dir = 0) {
  const s = { open: [], high: [], low: [], close: [] };
  for (let i = 0; i < n; i++) {
    const m = level + dir * i, white = i % 2 === 0;
    const o = white ? m - 0.5 : m + 0.5, c = white ? m + 0.5 : m - 0.5;
    s.open.push(o); s.close.push(c); s.high.push(Math.max(o, c) + 0.5); s.low.push(Math.min(o, c) - 0.5);
  }
  return s;
}
function add(s, ...candles) { for (const [o, h, l, c] of candles) { s.open.push(o); s.high.push(h); s.low.push(l); s.close.push(c); } return s; }
function at(s, id) { const a = K.detect(s).patterns[id]; return a[a.length - 1]; }

test("(b) Doji-Familie: Doji, Libelle, Grabstein, Long-Legged", () => {
  assert.equal(at(add(base(), [100, 100.5, 99.5, 100.05]), "doji"), 1);
  assert.equal(at(add(base(), [100, 101, 99, 100.6]), "doji"), 0, "Koerper 0,6 > 10 % der Spanne 2");
  assert.equal(at(add(base(), [100, 100.05, 98, 100.02]), "dragonflyDoji"), 1);
  assert.equal(at(add(base(), [100, 102, 99.98, 100.02]), "gravestoneDoji"), -1);
  assert.equal(at(add(base(), [100, 102, 98, 100.05]), "longLeggedDoji"), 1);
});

test("(b) Hammer und Hanging Man: gleiche Form, Lage zum Vortag entscheidet", () => {
  /* Hammer: Koerper 0,3 < 1, unterer Schatten 2 > Koerper, oberer 0,05 < 0,2, Koerper am Vortagestief. */
  const down = add(base(), [99, 99.2, 97, 97.5], [97.4, 97.75, 95.4, 97.7]);
  assert.equal(at(down, "hammer"), 1);
  assert.equal(at(down, "hangingMan"), 0);
  const upTrend = add(base(), [101, 103, 100.8, 102.8], [103.1, 103.45, 101.1, 103.4]);
  assert.equal(at(upTrend, "hangingMan"), -1);
  assert.equal(at(upTrend, "hammer"), 0);
  assert.equal(at(add(base(), [99, 99.2, 97, 97.5], [97.4, 98.5, 95.4, 97.7]), "hammer"), 0, "langer oberer Schatten: kein Hammer");
});

test("(b) Inverted Hammer und Shooting Star: Koerperluecke", () => {
  assert.equal(at(add(base(), [100, 100.2, 98, 98.5], [98, 99.8, 97.95, 98.2]), "invertedHammer"), 1);
  assert.equal(at(add(base(), [100, 102.2, 99.8, 102], [102.6, 104.4, 102.55, 102.3]), "shootingStar"), -1);
  assert.equal(at(add(base(), [100, 102.2, 99.8, 102], [101.6, 103.4, 101.55, 101.8]), "shootingStar"), 0, "keine Koerperluecke");
});

test("(b) Marubozu und Spinning Top", () => {
  assert.equal(at(add(base(), [100, 103, 100, 103]), "marubozu"), 1);
  assert.equal(at(add(base(), [103, 103, 100, 100]), "marubozu"), -1);
  assert.equal(at(add(base(), [100, 101, 99, 100.3]), "spinningTop"), 1);
  assert.equal(at(add(base(), [100, 101, 99, 99.7]), "spinningTop"), -1, "Vorzeichen = Farbe");
});

test("(b) Engulfing, Harami, Harami Cross", () => {
  assert.equal(at(add(base(), [101, 101.2, 99.8, 100], [99.5, 101.8, 99.4, 101.6]), "engulfing"), 1);
  assert.equal(at(add(base(), [100, 101.2, 99.8, 101], [101.5, 101.6, 99.2, 99.4]), "engulfing"), -1);
  assert.equal(at(add(base(), [100, 101.2, 99.8, 101], [100.8, 100.9, 100.2, 100.6]), "engulfing"), 0);
  /* Harami: langer schwarzer Koerper 3, dann kurzer weisser Koerper 0,4 innerhalb. */
  assert.equal(at(add(base(), [103, 103.2, 99.8, 100], [101, 101.6, 100.8, 101.4]), "harami"), 1);
  assert.equal(at(add(base(), [100, 103.2, 99.8, 103], [102, 102.3, 101.7, 101.6]), "harami"), -1);
  assert.equal(at(add(base(), [103, 103.2, 99.8, 100], [101.5, 101.8, 101.2, 101.52]), "haramiCross"), 1);
});

test("(b) Piercing Line und Dark Cloud Cover", () => {
  assert.equal(at(add(base(), [102, 102.2, 99.8, 100], [99.5, 101.6, 99.4, 101.5]), "piercing"), 1);
  assert.equal(at(add(base(), [102, 102.2, 99.8, 100], [99.5, 101, 99.4, 100.9]), "piercing"), 0, "Schluss unter der Koerpermitte");
  assert.equal(at(add(base(), [100, 102.2, 99.8, 102], [102.5, 102.6, 100.4, 100.6]), "darkCloudCover"), -1);
});

test("(b) Morning/Evening Star und Doji-Varianten", () => {
  assert.equal(at(add(base(), [103, 103.1, 99.9, 100], [99.5, 99.7, 99.1, 99.3], [99.8, 102.2, 99.7, 102]), "morningStar"), 1);
  assert.equal(at(add(base(), [100, 103.1, 99.9, 103], [103.5, 103.9, 103.3, 103.7], [103.2, 103.3, 100.8, 101]), "eveningStar"), -1);
  assert.equal(at(add(base(), [103, 103.1, 99.9, 100], [99.5, 99.7, 99.1, 99.52], [99.8, 102.2, 99.7, 102]), "morningDojiStar"), 1);
  assert.equal(at(add(base(), [103, 103.1, 99.9, 100], [99.5, 99.7, 99.1, 99.3], [99.8, 100.4, 99.7, 100.3]), "morningStar"), 0, "Schluss zu tief");
});

test("(b) Three White Soldiers, Three Black Crows, Three Inside/Outside", () => {
  assert.equal(at(add(base(), [100, 101.55, 99.9, 101.5], [101.3, 102.9, 101.2, 102.85], [102.6, 104.3, 102.5, 104.25]), "threeWhiteSoldiers"), 1);
  assert.equal(at(add(base(), [100, 102.5, 99.9, 102.4], [102.2, 102.3, 100.65, 100.7], [100.9, 101, 99.35, 99.4], [99.6, 99.7, 98.05, 98.1]), "threeBlackCrows"), -1);
  assert.equal(at(add(base(), [103, 103.2, 99.8, 100], [101, 101.6, 100.8, 101.4], [101.5, 103.6, 101.4, 103.5]), "threeInside"), 1);
  assert.equal(at(add(base(), [101, 101.2, 99.8, 100], [99.5, 101.8, 99.4, 101.6], [101.7, 102.6, 101.6, 102.5]), "threeOutside"), 1);
});

test("(b) Abandoned Baby, Kicker, Three Methods, Tweezer", () => {
  assert.equal(at(add(base(), [103, 103, 100, 100], [98.8, 99, 98.6, 98.82], [100.5, 102.5, 100.5, 102.4]), "abandonedBaby"), 1);
  assert.equal(at(add(base(), [103, 103, 100, 100], [104, 107, 104, 107]), "kicking"), 1);
  assert.equal(at(add(base(), [100, 103, 99.9, 102.9], [102.7, 102.8, 102.2, 102.3], [102.4, 102.5, 101.9, 102], [102.1, 102.2, 101.6, 101.7], [101.8, 104.2, 101.7, 104.1]), "threeMethods"), 1);
  /* Tweezer Bottom: lange schwarze Kerze, weisse Kerze mit gleichem Tief (≤ Equal = 5 % der mittleren Spanne). */
  assert.equal(at(add(base(), [102, 102.1, 98.9, 99], [99.2, 100.5, 98.95, 100.3]), "tweezer"), 1);
  assert.equal(at(add(base(), [102, 102.1, 98.9, 99], [99.2, 100.5, 98.6, 100.3]), "tweezer"), 0, "Tiefs zu verschieden");
  assert.equal(at(add(base(), [99, 102.1, 98.9, 102], [101.8, 102.12, 100.5, 100.7]), "tweezer"), -1, "Tweezer Top");
});

/* ---------- (c) Vertrag ---------- */
const REAL = FX.titles.AAPL;

test("(c) Kausalitaet: abgeschnittene und vergiftete Zukunft aendern keine fruehere Bar", () => {
  const full = K.detect(REAL).patterns;
  for (const cut of [40, 120, 200, 269]) {
    const prefix = Object.fromEntries(["open", "high", "low", "close"].map((k) => [k, REAL[k].slice(0, cut + 1)]));
    const poisoned = Object.fromEntries(["open", "high", "low", "close"].map((k) => [k, REAL[k].map((v, i) => (i > cut ? v * 7 + 3 : v))]));
    const a = K.detect(prefix).patterns, b = K.detect(poisoned).patterns;
    for (const p of K.PATTERNS) for (let i = 0; i <= cut; i++) {
      assert.ok(Object.is(full[p.id][i], a[p.id][i]) && Object.is(full[p.id][i], b[p.id][i]), `${p.id}[${i}] bei Schnitt ${cut}`);
    }
  }
});

test("(c) Determinismus, Aufwaermphase, Wertebereich, Luecken", () => {
  assert.deepEqual(JSON.stringify(K.detect(REAL)), JSON.stringify(K.detect(REAL)));
  const r = K.detect(REAL).patterns;
  for (const p of K.PATTERNS) {
    const a = r[p.id];
    assert.equal(a.length, REAL.close.length);
    for (let i = 0; i < p.warmup; i++) assert.ok(!fin(a[i]), p.id + " vor der Aufwaermphase");
    assert.ok(a.slice(p.warmup).every((v) => v === 0 || v === 1 || v === -1), p.id + " Werte");
    assert.ok(p.name && p.rule && p.candles >= 1, p.id + " dokumentiert");
  }
  const gap = { ...REAL, close: REAL.close.slice() };
  gap.close[150] = null;
  const g = K.detect(gap).patterns;
  assert.ok(!fin(g.doji[150]) && !fin(g.engulfing[151]) && !fin(g.morningStar[152]), "Luecke in einer benutzten Kerze: nicht entscheidbar");
  assert.ok(!fin(g.doji[155]), "Luecke im 10er-Mittel: nicht entscheidbar");
  assert.ok(fin(g.doji[161]), "nach dem Mittelfenster wieder entscheidbar");
  const flat = { open: Array(20).fill(5), high: Array(20).fill(5), low: Array(20).fill(5), close: Array(20).fill(5) };
  assert.ok(!fin(K.detect(flat).patterns.doji[19]), "ohne Bewegung kein Massstab: nicht entscheidbar");
  assert.deepEqual(K.detect(REAL, { only: ["doji"] }).patterns.doji, r.doji);
});

test("(c) atCutoff liefert die Treffer der letzten Bar", () => {
  const list = K.atCutoff(REAL), r = K.detect(REAL).patterns, last = REAL.close.length - 1;
  assert.deepEqual(list.map((x) => x.id).sort(), K.PATTERNS.filter((p) => r[p.id][last] === 1 || r[p.id][last] === -1).map((p) => p.id).sort());
  assert.match(K.CANDLESTICKS_VERSION, /^technical-candlesticks-1\.\d+\.\d+$/);
  assert.ok(K.PATTERNS.length >= 27);
});
