/* Wochen-Evidenz (scripts/technical/weekly-evidence.mjs, docs/technical/WEEKLY_EVIDENCE.md).
   Prueft die Bausteine: Kalenderwoche, Kausalitaet der Linien, Marktphase, eingefrorene Kombinationen.
   Der Lauf ueber das Universum ist das Skript, nicht dieser Test. */
import test from "node:test";
import assert from "node:assert/strict";
import { EVENTS, COMBOS, weekIndex, linesOf, marketPhases } from "../../scripts/technical/weekly-evidence.mjs";

const close = Array.from({ length: 160 }, (_, i) => 100 + 20 * Math.sin(i / 9) + i * 0.2);

test("Kalenderwoche: Montag bis Sonntag eine Woche, Folgewoche +1", () => {
  assert.equal(weekIndex("2026-10-19"), weekIndex("2026-10-23"));
  assert.equal(weekIndex("2026-10-25"), weekIndex("2026-10-23"));
  assert.equal(weekIndex("2026-10-26"), weekIndex("2026-10-23") + 1);
  assert.equal(weekIndex("2026-10-30") - weekIndex("2025-10-31"), 52);
});

test("Linien kausal: abgeschnitten bei k gleich bis k; Signale bis k unveraendert", () => {
  const full = linesOf(close);
  for (const k of [60, 100, 140]) {
    const part = linesOf(close.slice(0, k + 1));
    for (const key of ["sma10", "sma40", "rsi14", "hi52", "lo52"]) {
      for (let i = 0; i <= k; i++) assert.ok(Object.is(part[key][i], full[key][i]) || Math.abs(part[key][i] - full[key][i]) < 1e-12, key + "@" + i);
    }
    for (const e of EVENTS.concat(COMBOS)) for (let i = 53; i <= k; i++) assert.equal(e.at(part, i, "UP"), e.at(full, i, "UP"), e.id + "@" + i);
  }
});

test("52-Wochen-Hoch: Vergleich nur mit den 52 Vorwochen, erstes Hoch nach 4 Wochen ohne", () => {
  const c = Array.from({ length: 70 }, () => 10); c[60] = 11; c[61] = 12;
  const L = linesOf(c), e = EVENTS.find((x) => x.id === "newHigh52w");
  assert.equal(L.hi52[60], 10);
  assert.equal(e.at(L, 60), true);
  assert.equal(e.at(L, 61), false, "zweites Hoch in Folge zaehlt nicht erneut");
});

test("Marktphase aus SPY: Wochenschluss ueber seiner 40-Wochen-Linie, erst ab 40 Wochen", () => {
  const days = [];
  for (let w = 0; w < 60; w++) { const d = new Date(Date.UTC(2020, 0, 3) + w * 604800000).toISOString().slice(0, 10); days.push([d, w < 50 ? 100 + w : 100]); }
  const ph = marketPhases(days);
  assert.equal(ph.has(weekIndex(days[38][0])), false);
  assert.equal(ph.get(weekIndex(days[45][0])), "UP");
  assert.equal(ph.get(weekIndex(days[55][0])), "DOWN");
});

test("Kombinationen eingefroren (vor dem ersten Lauf festgelegt), je mit Basissignal", () => {
  assert.deepEqual(COMBOS.map((c) => c.id), ["pullbackInUptrend", "breakoutInUptrend", "breakdownInDowntrend", "cross40wMarketUp", "overboughtInDowntrend", "goldenWithMomentum"]);
  for (const c of COMBOS) assert.ok(EVENTS.some((e) => e.id === c.base && e.dir === c.dir), c.id);
  assert.equal(EVENTS.filter((e) => e.dir > 0).length, EVENTS.filter((e) => e.dir < 0).length);
});
