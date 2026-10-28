/* Candlestick-Bibliothek ab 1.1.0: die 31 weiteren TA-Lib-Muster (candlesticks.js, docs/technical/CANDLESTICKS.md).

   Fremde Implementierung: TA-Lib 0.8.2 (CDL*), eingefroren in fixtures/technical-talib-candles-2.json
   (scripts/technical/build-talib-reference.py --set candles2):
   - auf den 38 echten Titeln der ersten Fixture (Bars dort, hier nur die Signale),
   - auf konstruierten Kerzenfolgen fuer die Muster, die in echten Kursen fast nie vorkommen.
   Verglichen wird Bar fuer Bar ab der TA-Lib-Aufwaermphase, mit Vorzeichen (auch bei neutralen Mustern).
   Hikkake: TA-Lib meldet die Bestaetigung mit ±200; die Bibliothek meldet sie mit dem Vorzeichen des Musters.

   Erlaubte Abweichungen sind einzeln aufgezaehlt (TIES) und muessen ohne Rundung verschwinden (Gleichstaende).
   Nicht entscheidbar (NaN) darf eine Bar nur sein, wenn ein benutztes Mittelungsfenster die Spanne 0 hat. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../engines/technical/candlesticks.js");
const FX1 = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-candles.json", import.meta.url), "utf8"));
const FX = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-candles-2.json", import.meta.url), "utf8"));
const IDS = Object.keys(FX.functions);
const fin = Number.isFinite;
const COLS = ["open", "high", "low", "close"];

/* Gleichstaende im Produktmodus (echte Kurse): TA-Lib entscheidet nach dem Gleitkommarest, die Engine rundet
   (z. B. oberer Schatten 0,02 = 2 × Koerper 0,01 ist kein „sehr langer“ Schatten). Ohne Rundung: keine Abweichung. */
const TIES = {
  beltHold: ["ta:MCGA@115"],
  closingMarubozu: ["ta:QQDN@29", "ta:MCGA@115"],
  highWave: ["ta:KO@176", "ta:AIIO@73", "ta:AIIO@196", "ta:AWRE@15", "ta:AWRE@40", "ta:CLB@24", "ta:CLB@108", "ta:CJMB@234", "ta:ZD@261", "ta:BNT@132", "ta:OVLY@211", "ta:MCGA@28", "ta:MCGA@230"],
  homingPigeon: ["ta:QQDN@30"],
  rickshawMan: ["ta:JFU@145", "us:ABCB@258", "ta:MWG@78", "ta:MWG@138", "ta:ZD@157", "ta:STRC@108", "ta:STRC@147"],
  takuri: ["ta:CJMB@234"]
};

function sets() {
  return [
    ...Object.entries(FX1.titles).map(([t, b]) => ({ name: t, real: true, bars: b, sig: FX.titles[t].signals })),
    ...Object.entries(FX.constructed).map(([n, s]) => ({ name: n, real: false, bars: s, sig: s.signals }))
  ];
}

/* Unabhaengige Pruefung „Fenster ohne Bewegung“: Mittel der Bezugsgroesse ueber die Fenster-Kerzen ist 0. */
function zeroWindow(bars, p, i) {
  const { open: o, high: h, low: l, close: c } = bars;
  const size = { body: (k) => Math.abs(c[k] - o[k]), hl: (k) => h[k] - l[k], shadows: (k) => h[k] - l[k] - Math.abs(c[k] - o[k]) };
  return p.uses.some(([off, name]) => {
    const st = K.SETTINGS[name], k = i - off;
    if (st.period === 0) return false;
    let s = 0;
    for (let j = k - st.period; j < k; j++) s += size[st.range](j);
    return s === 0;
  });
}

function compare(roundTies) {
  const st = {};
  for (const s of sets()) {
    const ours = K.detect(s.bars, { roundTies, only: IDS }).patterns;
    for (const id of IDS) {
      const r = (st[id] = st[id] || { taReal: 0, taConstructed: 0, both: 0, sign: 0, diff: [], undecided: 0, undecidedNotZero: [] });
      const ta = new Map(s.sig[id].map(([i, v]) => [i, Math.sign(v)]));
      const a = ours[id];
      for (let i = FX.lookback[id]; i < a.length; i++) {
        const tv = ta.get(i) || 0;
        if (tv) s.real ? r.taReal++ : r.taConstructed++;
        if (!fin(a[i])) {
          if (tv) r.undecided++;
          if (!zeroWindow(s.bars, K.pattern(id), i)) r.undecidedNotZero.push(s.name + "@" + i);
          continue;
        }
        if (a[i] && tv) { if (a[i] === tv) r.both++; else r.sign++; }
        else if (a[i]) r.diff.push("us:" + s.name + "@" + i);
        else if (tv) r.diff.push("ta:" + s.name + "@" + i);
      }
    }
  }
  return st;
}

test("Fixture: TA-Lib 0.8.2, 31 Muster, Signale auf den 38 Titeln der ersten Fixture und konstruierten Reihen", () => {
  assert.equal(FX.libraryVersion, "0.8.2");
  assert.equal(FX.source, "quant/tests/fixtures/technical-talib-candles.json");
  assert.equal(IDS.length, 31);
  assert.deepEqual(Object.keys(FX.titles).sort(), Object.keys(FX1.titles).sort());
  for (const [t, ti] of Object.entries(FX.titles)) {
    assert.equal(ti.bars, FX1.titles[t].close.length, t);
    assert.ok(!("close" in ti), t + ": Bars nicht doppelt");
  }
  for (const id of IDS) {
    const p = K.pattern(id);
    assert.ok(p, id);
    assert.equal(p.ta, FX.functions[id], id);
    assert.ok(p.warmup <= FX.lookback[id], id + ": Aufwaermphase nicht laenger als bei TA-Lib");
    assert.ok(Object.keys(FX1.functions).indexOf(id) < 0, id + " ist neu");
  }
  assert.equal(FX.params.CDLMATHOLD.penetration, 0.5);
  assert.match(K.CANDLESTICKS_VERSION, /^technical-candlesticks-1\.([1-9]\d*)\.\d+$/);
  /* Ab 1.2.0 (L13) haengen weitere Muster an; die 58 Muster von 1.1.0 stehen unveraendert vorn. */
  assert.ok(K.PATTERNS.length >= 58);
  assert.equal(K.PATTERNS.findIndex((p) => p.id === "xSideGapThreeMethods"), 57);
});

test("TA-Lib-Abgleich im Produktmodus: Bar fuer Bar gleich, Ausnahmen nur die aufgezaehlten Gleichstaende", () => {
  const st = compare(true);
  for (const id of IDS) {
    const r = st[id];
    assert.equal(r.sign, 0, id + ": Richtung");
    assert.deepEqual(r.diff, TIES[id] || [], id + ": Abweichungen");
    assert.deepEqual(r.undecidedNotZero, [], id + ": nicht entscheidbar ohne Fenster der Spanne 0");
    assert.ok(r.taReal + r.taConstructed >= 3, id + ": zu wenige TA-Lib-Treffer in der Fixture");
    assert.ok(r.both >= 3 && r.both + r.undecided + (TIES[id] || []).filter((d) => d.startsWith("ta:")).length === r.taReal + r.taConstructed, id + ": Treffer");
  }
});

test("TA-Lib-Abgleich ohne Rundung: keine einzige Abweichung (die Ausnahmen sind Gleichstaende)", () => {
  const st = compare(false);
  for (const id of IDS) {
    assert.equal(st[id].sign, 0, id + ": Richtung");
    assert.deepEqual(st[id].diff, [], id);
  }
});

test("Konstruierte Reihen: seltene Muster an der letzten Bar, wie TA-Lib", () => {
  const seen = new Set();
  for (const [name, s] of Object.entries(FX.constructed)) {
    const id = name.split("-")[0], last = s.close.length - 1, ours = K.detect(s, { only: [id] }).patterns[id][last];
    const ta = s.signals[id].find(([i]) => i === last);
    if (name.includes("-neg")) { assert.ok(!ta && ours === 0, name + ": Gegenprobe ohne Muster"); continue; }
    assert.ok(ta, name + ": TA-Lib-Treffer an der letzten Bar");
    assert.equal(ours, Math.sign(ta[1]), name);
    seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ["breakaway", "concealingBabySwallow", "matHold", "threeStarsInSouth", "twoCrows", "upsideGapTwoCrows"]);
});

test("Hikkake: Muster ±100 und Bestaetigung ±200 an derselben Stelle, Bestaetigung mit dem Vorzeichen des Musters", () => {
  let confirmations = 0;
  for (const [t, b] of Object.entries(FX1.titles)) {
    const a = K.detect(b, { only: ["hikkake"] }).patterns.hikkake;
    for (const [i, v] of FX.titles[t].signals.hikkake) {
      if (Math.abs(v) === 200) confirmations++;
      assert.equal(a[i], Math.sign(v), t + "@" + i);
    }
  }
  assert.ok(confirmations >= 50, "Bestaetigungen in der Fixture: " + confirmations);
  /* Innenstab (Bar 1), Ausbruch nach unten (Bar 2: bullisch), Schluss ueber dem Hoch des Innenstabs zwei Bars spaeter. */
  const s = { open: [10, 10, 9.5, 9.6, 9.8, 10.3], high: [11, 10.8, 10.2, 10, 10.05, 10.9], low: [9, 9.4, 9.2, 9.3, 9.25, 10.1], close: [10.5, 10, 9.4, 9.7, 9.9, 10.85] };
  for (const k of ["open", "high", "low", "close"]) s[k] = [10, 10, 10].concat(s[k]); /* drei Vorbars */
  s.high[0] = s.high[1] = s.high[2] = 10.5; s.low[0] = s.low[1] = s.low[2] = 9.5;
  let a = K.detect(s, { only: ["hikkake"] }).patterns.hikkake;
  assert.deepEqual(a.slice(5), [1, 0, 0, 1], "Muster an Bar 5, Bestaetigung an Bar 8 (drei Bars spaeter)");
  s.open.splice(8, 0, 9.8); s.high.splice(8, 0, 10.1); s.low.splice(8, 0, 9.5); s.close.splice(8, 0, 9.9);
  a = K.detect(s, { only: ["hikkake"] }).patterns.hikkake;
  assert.equal(a[9], 0, "vier Bars spaeter: keine Bestaetigung mehr");
});

test("Aufwaermphase, Wertebereich, Luecken, ruhende Titel", () => {
  const REAL = FX1.titles.AAPL, r = K.detect(REAL, { only: IDS }).patterns;
  for (const id of IDS) {
    const p = K.pattern(id), a = r[id];
    assert.equal(a.length, REAL.close.length);
    for (let i = 0; i < p.warmup; i++) assert.ok(!fin(a[i]), id + " vor der Aufwaermphase");
    assert.ok(a.slice(p.warmup).every((v) => v === 0 || v === 1 || v === -1), id + " Werte");
    assert.ok(p.name && p.rule && p.candles >= 1 && ["bullish", "bearish", "both", "neutral"].includes(p.direction), id + " dokumentiert");
  }
  const gap = { ...REAL, close: REAL.close.slice() };
  gap.close[150] = null;
  const g = K.detect(gap, { only: IDS }).patterns;
  for (const id of IDS) {
    const p = K.pattern(id), w = p.span || p.candles;
    for (let i = 150; i < 150 + w; i++) assert.ok(!fin(g[id][i]), id + "[" + i + "]: Luecke in einer benutzten Kerze");
    assert.ok(fin(g[id][150 + p.warmup + 1]), id + ": nach Kerzen und Mittelungsfenster wieder entscheidbar");
  }
  const flat = Object.fromEntries(COLS.map((k) => [k, Array(30).fill(5)]));
  const f = K.detect(flat, { only: IDS }).patterns;
  for (const id of IDS) {
    if (K.pattern(id).uses.some(([, n]) => K.SETTINGS[n].period > 0)) assert.ok(!fin(f[id][29]), id + ": ohne Bewegung kein Massstab");
    else assert.equal(f[id][29], 0, id + ": ohne Mittel entscheidbar");
  }
});

test("Kausalitaet: abgeschnittene und vergiftete Zukunft aendern keine fruehere Bar; Determinismus", () => {
  for (const b of [FX1.titles.AAPL, FX1.titles.MCGA, FX.constructed["matHold-a"]]) {
    const n = b.close.length, full = K.detect(b, { only: IDS }).patterns;
    assert.equal(JSON.stringify(full), JSON.stringify(K.detect(b, { only: IDS }).patterns));
    for (const cut of [Math.floor(n / 3), Math.floor((2 * n) / 3), n - 2]) {
      const prefix = Object.fromEntries(COLS.map((k) => [k, b[k].slice(0, cut + 1)]));
      const poisoned = Object.fromEntries(COLS.map((k) => [k, b[k].map((v, i) => (i > cut ? v * 7 + 3 : v))]));
      const a = K.detect(prefix, { only: IDS }).patterns, z = K.detect(poisoned, { only: IDS }).patterns;
      for (const id of IDS) for (let i = 0; i <= cut; i++) {
        assert.ok(Object.is(full[id][i], a[id][i]) && Object.is(full[id][i], z[id][i]), `${id}[${i}] bei Schnitt ${cut}`);
      }
    }
  }
});
