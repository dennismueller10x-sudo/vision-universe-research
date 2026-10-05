/* Mission VI — Forensik und OHLC-Bausteine: Neutralitaet der Forensik-Zaehler, Wochen-OHLC, Split-Konsistenz, HL-Pfad,
   Kausalitaet, Holdout-Versiegelung. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openedCases, caseBars, seriesFrom, runV3, practitionerClass, FREEZE } from "../../scripts/technical/elliott-forensics/lib.mjs";
import { weeklyOHLC, hlPath, splitAdjustedRows, seriesOf } from "../../scripts/technical/elliott-forensics/ohlc.mjs";

const strip = (r) => { const x = Object.assign({}, r); delete x.trace; return JSON.stringify(x); };

test("Forensik ist verhaltensneutral (Ausgabe ohne/mit Forensik identisch) auf geoeffneten Faellen", () => {
  const { rows } = openedCases();
  let checked = 0;
  for (const r of rows.slice(0, 8)) {
    const cb = caseBars(r); if (cb.status !== "OK") continue;
    const s = seriesFrom(cb.bars, cb.tf);
    assert.equal(strip(runV3(s, cb.tf, { forensics: true, debugAll: true })), strip(runV3(s, cb.tf)), r.referenceId);
    checked++;
  }
  assert.ok(checked >= 5);
});
test("Holdouts versiegelt: openedCases liest nur DEVELOPMENT/VALIDATION", () => {
  const man = JSON.parse(readFileSync(FREEZE + ".manifest.json", "utf8"));
  const o = openedCases();
  for (const r of o.rows) assert.ok(["DEVELOPMENT", "VALIDATION"].includes(man.splits.byCase[r.caseId]));
  assert.equal(o.sealedCases, 43);
  assert.equal(o.rows.length, 35);
});
test("Wochen-OHLC: erste Eroeffnung, Maximum, Minimum, letzter Schluss, Summe Volumen; unfertige Woche entfaellt", () => {
  const d = [
    { date: "2024-01-08", open: 10, high: 11, low: 9, close: 10.5, volume: 1 }, { date: "2024-01-09", open: 10.5, high: 13, low: 10, close: 12, volume: 2 },
    { date: "2024-01-12", open: 12, high: 12.5, low: 8, close: 9, volume: 3 },
    { date: "2024-01-15", open: 9, high: 9.5, low: 8.5, close: 9.2, volume: 4 } ];
  const w = weeklyOHLC(d, { completeWeekEnd: "2024-01-12" });
  assert.deepEqual(w, [{ date: "2024-01-12", open: 10, high: 13, low: 8, close: 9, volume: 6 }]);
  const w2 = weeklyOHLC(d, { cutoff: "2024-01-09" });
  assert.equal(w2.length, 1); assert.equal(w2[0].close, 12);   // nichts nach dem Stichtag
});
test("Split-Konsistenz: O/H/L/C werden gemeinsam bereinigt (2:1-Split)", () => {
  const bars = [{ date: "2024-01-08", open: 100, high: 110, low: 90, close: 104, volume: 10, splitFactor: 1, dividend: 0 },
                { date: "2024-01-09", open: 52, high: 56, low: 50, close: 54, volume: 20, splitFactor: 2, dividend: 0 }];
  const r = splitAdjustedRows(bars);
  assert.deepEqual([r[0].open, r[0].high, r[0].low, r[0].close], [50, 55, 45, 52]);
  assert.deepEqual([r[1].open, r[1].high, r[1].low, r[1].close], [52, 56, 50, 54]);
});
test("HL-Pfad: zwei Punkte je Bar, Reihenfolge nach Eroeffnung/Schluss; Wochenende ist keine Luecke", () => {
  const p = hlPath([{ date: "2024-01-05", open: 10, high: 12, low: 9, close: 11 }, { date: "2024-01-08", open: 11, high: 11.5, low: 9.5, close: 10 }]);
  assert.deepEqual(p.map((x) => x.close), [9, 12, 11.5, 9.5]);
  const s = seriesOf(p, "1D");
  assert.equal(s.length, 4);
  assert.ok(s.timestamps.every((t, i) => i === 0 || t > s.timestamps[i - 1]));
});
test("Practitioner-Klasse: Impuls und Richtung normalisiert", () => {
  const pc = practitionerClass({ primary: { pattern: "IMPULSE", family: "MOTIVE", currentWave: "(iii)", state: "DEVELOPING" }, directionalBias: "UP" });
  assert.equal(pc.broad, "MOTIVE"); assert.equal(pc.currentWave, "3"); assert.equal(pc.impulseLike, true);
});

// ---------------------------------------------------------------- §85–§87 (Mission VI)
import { corpusCase } from "./elliott-corpus.mjs";
import { createRequire } from "node:module";
const requireM6 = createRequire(import.meta.url);
const PAT6 = requireM6("../engines/technical/elliott/patterns.js");
const synSeries = (cs, f = (x) => x) => seriesFrom(cs.dates.map((d, i) => [d, f(cs.closes[i])]), "1W");

test("Impuls-Kandidat: sauberer synthetischer Impuls (ohne Rauschen) wird als IMPULSE gezaehlt", () => {
  const cs = corpusCase("IMPULSE", 0, "none", {});
  const r = runV3(synSeries(cs), "1W");
  assert.equal(r.primary.pattern, "IMPULSE");
});
test("Invarianz: Preis × 10 und Preis + 50 aendern die Hauptzaehlung nicht", () => {
  for (const cls of ["IMPULSE", "ZIGZAG"]) {
    const cs = corpusCase(cls, 1, "low", {}), base = runV3(synSeries(cs), "1W");
    for (const f of [(x) => x * 10, (x) => x + 50]) {
      const r = runV3(synSeries(cs, f), "1W");
      assert.equal(r.primary.pattern, base.primary.pattern, cls);
      assert.deepEqual(r.primary.waves.map((w) => w.toIndex), base.primary.waves.map((w) => w.toIndex), cls);
    }
  }
});
test("OHLC-Extrem: Welle 2 bleibt auf Schluss ueber dem Ursprung, das TIEF unterschreitet ihn → Regel W2 verletzt", () => {
  const leg = (a, b, ia, ib) => ({ fromPrice: a, toPrice: b, fromIndex: ia, toIndex: ib, duration: ib - ia, status: "CONFIRMED" });
  const close = [leg(100, 120, 0, 5), leg(120, 101, 5, 8), leg(101, 140, 8, 14)];
  assert.equal(PAT6.checkRules("IMPULSE", close), true);                       // Schlusskurse: regelkonform
  const hl = [leg(100, 121, 0, 5), leg(121, 99.5, 5, 8), leg(99.5, 141, 8, 14)]; // Extreme (Tief der Welle 2 < Ursprung)
  assert.equal(PAT6.checkRules("IMPULSE", hl), false);
  assert.ok(PAT6.evaluate("IMPULSE", hl).violations.includes("W2_NOT_BEYOND_W1_ORIGIN"));
});
test("3.3-Kandidaten-Optionen sind ohne Gewicht wirkungslos (3.2.2-Ausgabe unveraendert)", () => {
  const cs = corpusCase("IMPULSE_EXT3", 2, "medium", { cut: "mid" }), s = synSeries(cs);
  /* parametersHash enthaelt die gesetzten Optionen; der ausgewiesene Komponentenwert trendContext (Gewicht 0) ebenso —
     Rang, Zaehlung, Anwendbarkeit muessen gleich bleiben */
  const st = (r) => { const x = Object.assign({}, r); delete x.trace; delete x.parametersHash; return JSON.stringify(x).replace(/"trendContext":[-0-9.e]+/g, ""); };
  const base = st(runV3(s, "1W"));
  assert.equal(st(runV3(s, "1W", { engine: { trendContextMode: "COUNTER_DEVELOPING" } })), base);
  assert.equal(st(runV3(s, "1W", { engine: { coverageMode: "WAVES" } })), base);
});
