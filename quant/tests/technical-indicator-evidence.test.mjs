/* Indikator-Ereignis-Evidenz (scripts/technical/indicator-evidence.mjs, docs/technical/INDICATOR_EVIDENCE.md).
   Prueft die Bausteine: Kreuzungslogik, Kausalitaet ueber abgeschnittene Reihen, Startschwelle der Bar-Linien.
   Der Lauf ueber das Universum ist das Skript, nicht dieser Test. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EVENTS, SETTLE, eventsOf, linesOf } from "../../scripts/technical/indicator-evidence.mjs";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const bars = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume, timestamps: ref.date };
const cut = (o, k) => Object.fromEntries(Object.entries(o).map(([key, a]) => [key, a.slice(0, k + 1)]));

/* Vollhistorie-Linien wie bundle.chartSeries: je Bar kausal aus allen Bars bis dahin. */
const chart = { sma50: Array.from(I.compute(bars, "sma", { period: 50 }).values), sma200: Array.from(I.compute(bars, "sma", { period: 200 }).values), rsi14: Array.from(I.compute(bars, "rsi").values) };

test("Ereignisse: eindeutige Ids, je Richtung ein Gegenstueck, Quelle chart oder bars", () => {
  const ids = EVENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(EVENTS.filter((e) => e.dir > 0).length, EVENTS.filter((e) => e.dir < 0).length);
  for (const e of EVENTS) assert.ok(e.src === "chart" || e.src === "bars", e.id);
});

test("Kreuzung: an i−1 nicht darueber, an i darueber; jede Bar gegen die Linien nachgerechnet", () => {
  const L = linesOf(bars, chart), ev = eventsOf(bars, chart);
  let golden = 0, macd = 0;
  for (const [id, , i] of ev) {
    if (id === "goldenCross") { golden++; assert.ok(L.sma50[i - 1] <= L.sma200[i - 1] && L.sma50[i] > L.sma200[i], "Golden " + i); }
    if (id === "macdCrossUp") { macd++; assert.ok(L.macd[i - 1] <= L.macdSignal[i - 1] && L.macd[i] > L.macdSignal[i], "MACD " + i); }
    if (id === "rsiExitOversold") assert.ok(L.rsi14[i - 1] <= 30 && L.rsi14[i] > 30, "RSI " + i);
    if (id === "supertrendUp") assert.ok(L.st[i - 1] === -1 && L.st[i] === 1);
  }
  assert.ok(macd > 0, "die Pruefung laeuft nicht leer");
  /* Gegenprobe: jede MACD-Aufwaertskreuzung ab SETTLE wird gefunden. */
  let want = 0;
  for (let i = SETTLE; i < L.n; i++) if (L.macd[i - 1] <= L.macdSignal[i - 1] && L.macd[i] > L.macdSignal[i]) want++;
  assert.equal(macd, want);
  assert.ok(golden >= 0);
});

test("Bar-Linien erst ab SETTLE, Vollhistorie-Linien ab Bar 2", () => {
  const ev = eventsOf(bars, chart);
  for (const [id, , i] of ev) {
    const e = EVENTS.find((x) => x.id === id);
    assert.ok(i >= (e.src === "bars" ? SETTLE : 2), id + "@" + i);
  }
});

test("Kausal: Ereignisse bis k sind dieselben, wenn die Reihe bei k endet", () => {
  const all = eventsOf(bars, chart);
  for (const k of [150, 220, 290]) {
    const part = eventsOf(cut(bars, k), cut(chart, k));
    assert.deepEqual(part, all.filter((e) => e[2] <= k).sort((a, b) => EVENTS.findIndex((x) => x.id === a[0]) - EVENTS.findIndex((x) => x.id === b[0]) || a[2] - b[2]), "k=" + k);
  }
});

test("Ohne chartSeries keine Vollhistorie-Ereignisse (keine Schaetzung aus 270 Bars)", () => {
  const ev = eventsOf(bars, null);
  assert.equal(ev.filter(([id]) => EVENTS.find((x) => x.id === id).src === "chart").length, 0);
  assert.ok(ev.length > 0);
});
