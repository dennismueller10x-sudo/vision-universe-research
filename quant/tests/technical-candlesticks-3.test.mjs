/* Candlestick-Bibliothek 1.2.0 (L13): die vier restlichen TA-Lib-Muster (candlesticks.js, docs/technical/CANDLESTICKS.md).

   Fremde Implementierung: TA-Lib 0.8.2 (CDLLONGLINE, CDLSHORTLINE, CDLKICKINGBYLENGTH, CDLHIKKAKEMOD), eingefroren in
   fixtures/technical-talib-candles-3.json (scripts/technical/build-talib-reference.py --set candles3):
   - auf den 38 echten Titeln der ersten Fixture (Bars dort, hier nur die Signale),
   - auf konstruierten Kerzenfolgen fuer Kicking by Length (beide Laengenfaelle).
   Verglichen wird Bar fuer Bar ab der TA-Lib-Aufwaermphase, mit Vorzeichen. Modifizierter Hikkake: TA-Lib meldet die
   Bestaetigung mit ±200, die Bibliothek mit dem Vorzeichen des Musters (wie Hikkake).
   Erlaubte Abweichungen sind einzeln aufgezaehlt (TIES) und muessen ohne Rundung verschwinden (Gleichstaende). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../engines/technical/candlesticks.js");
const FX1 = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-candles.json", import.meta.url), "utf8"));
const FX = JSON.parse(readFileSync(new URL("./fixtures/technical-talib-candles-3.json", import.meta.url), "utf8"));
const IDS = Object.keys(FX.functions);
const fin = Number.isFinite;

/* Gleichstaende im Produktmodus: Koerper bzw. Schatten exakt gleich dem gerundeten Mittel. Ohne Rundung: keine Abweichung. */
const TIES = { longLine: ["ta:MCGA@115"], shortLine: ["ta:STRC@148"] };

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

test("Fixture: TA-Lib 0.8.2, 4 Muster, Signale auf den 38 Titeln der ersten Fixture und konstruierten Reihen", () => {
  assert.equal(FX.libraryVersion, "0.8.2");
  assert.equal(FX.set, "candles3");
  assert.deepEqual(IDS.sort(), ["hikkakeMod", "kickingByLength", "longLine", "shortLine"]);
  assert.deepEqual(Object.keys(FX.titles).sort(), Object.keys(FX1.titles).sort());
  for (const id of IDS) {
    const p = K.pattern(id);
    assert.ok(p, id);
    assert.equal(p.ta, FX.functions[id], id);
    assert.ok(p.warmup <= FX.lookback[id], id + ": Aufwaermphase nicht laenger als bei TA-Lib");
  }
  assert.equal(K.CANDLESTICKS_VERSION, "technical-candlesticks-1.2.0");
  assert.equal(K.PATTERNS.length, 62);
  /* Damit hat jede CDL-Funktion von TA-Lib 0.8.2 (61) ein Gegenstueck; Tweezer ist das eine Muster ohne TA-Lib-Vorlage. */
  assert.equal(new Set(K.PATTERNS.map((p) => p.ta).filter(Boolean)).size, 61);
});

test("TA-Lib-Abgleich im Produktmodus: Bar fuer Bar gleich, Ausnahmen nur die aufgezaehlten Gleichstaende", () => {
  const st = compare(true);
  for (const id of IDS) {
    const r = st[id];
    assert.equal(r.sign, 0, id + ": Richtung");
    assert.deepEqual(r.diff, TIES[id] || [], id + ": Abweichungen");
    assert.deepEqual(r.undecidedNotZero, [], id + ": nicht entscheidbar ohne Fenster der Spanne 0");
    assert.ok(r.both >= 9, id + ": zu wenige gemeinsame Treffer (" + r.both + ")");
    assert.equal(r.both + r.undecided + (TIES[id] || []).filter((d) => d.startsWith("ta:")).length, r.taReal + r.taConstructed, id + ": Treffer");
  }
});

test("TA-Lib-Abgleich ohne Rundung: keine einzige Abweichung (die Ausnahmen sind Gleichstaende)", () => {
  const st = compare(false);
  for (const id of IDS) {
    assert.equal(st[id].sign, 0, id + ": Richtung");
    assert.deepEqual(st[id].diff, [], id);
  }
});

test("Kicking by Length: die Richtung folgt dem laengeren Marubozu, nicht der Luecke", () => {
  for (const [name, s] of Object.entries(FX.constructed)) {
    const last = s.close.length - 1, ours = K.detect(s, { only: ["kickingByLength", "kicking"] }).patterns;
    const ta = s.signals.kickingByLength.find(([i]) => i === last);
    assert.ok(ta, name);
    assert.equal(ours.kickingByLength[last], Math.sign(ta[1]), name);
    /* Der klassische Kicker folgt der Luecke (bullisch); bei laengerem erstem Koerper widersprechen sich beide. */
    assert.equal(ours.kicking[last], 1, name + ": Kicker bullisch");
    assert.equal(ours.kickingByLength[last], name.includes("-short") ? -1 : 1, name);
  }
});

test("Modifizierter Hikkake: Muster und Bestaetigung an denselben Stellen wie TA-Lib, Bestaetigung mit dem Vorzeichen des Musters", () => {
  let confirmations = 0, patterns = 0;
  for (const [t, b] of Object.entries(FX1.titles)) {
    const a = K.detect(b, { only: ["hikkakeMod"] }).patterns.hikkakeMod;
    for (const [i, v] of FX.titles[t].signals.hikkakeMod) {
      if (Math.abs(v) === 200) confirmations++; else patterns++;
      assert.equal(a[i], Math.sign(v), t + "@" + i);
    }
  }
  assert.ok(confirmations >= 3 && patterns >= 3, "beide Faelle kommen vor: " + patterns + "/" + confirmations);
});

test("Kein Vorgriff: Signal an Bar i haengt nur von Bars ≤ i ab", () => {
  for (const b of Object.values(FX1.titles).slice(0, 8)) {
    const full = K.detect(b, { only: IDS }).patterns;
    for (const upto of [120, 200]) {
      const part = K.detect(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, upto + 1) : v])), { only: IDS }).patterns;
      for (const id of IDS) for (let i = 0; i <= upto; i++) assert.ok(Object.is(full[id][i], part[id][i]), id + "@" + i);
    }
  }
});
