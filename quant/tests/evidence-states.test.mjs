/* Zustaende, die ein Live-Artefakt nur zufaellig zeigt: zu kleine Stichprobe,
   fehlende Daten, zurueckgehaltene Evidenz. Jeder Zustand hat hier eine eigene
   Eingabe im Test, damit er nicht davon abhaengt, welcher Ticker heute gerade
   in diesem Zustand ist (Audit 10.11.2026, vu2-chart NVDA INSUFFICIENT_SAMPLE).
   Keine Produktionsdaten, keine Uhr. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Sc = require("../engines/technical/ti/scenario.js");
const MarketCap = require("../engines/market-cap.js");
const StrategyMatch = require("../engines/strategy-match.js");
const contract = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8"));

const KEY = "1D|PULLBACK|BULLISH|HIGH";
const sig = { key: KEY };
const MIN = Sc.DEFAULTS.empirical.minSample;

test("ES-1 · INSUFFICIENT_SAMPLE genau an der Schwelle, nicht davor und nicht danach", () => {
  const at = (n) => Sc.empiricalLookup({ setups: { [KEY]: { n, t1HitRate: 0.9 } } }, sig, Sc.DEFAULTS);
  const below = at(MIN - 1);
  assert.equal(below.status, "INSUFFICIENT_SAMPLE");
  assert.equal(below.n, MIN - 1);
  assert.equal(below.minSample, MIN);
  assert.equal(at(MIN).status, "OK", "die Schwelle selbst reicht");
  assert.equal(at(MIN).t1HitRate, 0.9, "bei OK bleibt die Zeile unveraendert");
  assert.equal(at(0).status, "INSUFFICIENT_SAMPLE");
});

test("ES-2 · fehlende Daten: keine Tabelle ist kein Befund, eine Tabelle ohne Zeile ist NO_HISTORY", () => {
  assert.equal(Sc.empiricalLookup(null, sig, Sc.DEFAULTS), null);
  assert.equal(Sc.empiricalLookup({}, sig, Sc.DEFAULTS), null);
  assert.deepEqual(Sc.empiricalLookup({ setups: {} }, sig, Sc.DEFAULTS), { status: "NO_HISTORY", key: KEY });
});

test("ES-3 · zurueckgehaltener Boersenwert: Skalenfehler und unmoeglicher Wert werden gesperrt, fehlende Aktienzahl nicht von diesem Waechter", () => {
  const doc = { columns: ["fy", "fp", "end", "v", "filed", "accn", "derived"], quarterly: { shares_outstanding: [
    [2025, "Q1", "2025-03-31", 100e6, "2025-04-30", "a", false],
    [2025, "Q2", "2025-06-30", 100e6, "2025-07-30", "b", false],
    [2025, "Q3", "2025-09-30", 101e6, "2025-10-30", "c", false] ] } };
  const cutoff = "2026-01-31";
  const ok = { value: 102e6, end: "2025-12-31" };
  const skala = { value: 102e12, end: "2025-12-31" };
  assert.equal(MarketCap.scalePlausible(ok, doc, cutoff, 5e9), true);
  assert.equal(MarketCap.scalePlausible(skala, doc, cutoff, 5e9), false, "x1e6 ist ein Skalenfehler und wird zurueckgehalten");
  assert.equal(MarketCap.scalePlausible(ok, doc, cutoff, MarketCap.ABSOLUTE_MCAP_BOUND_USD * 2), false, "ueber der Absolutgrenze");
  assert.equal(MarketCap.scalePlausible(null, doc, cutoff, 5e9), true, "ohne Aktienzahl entscheidet NO_PIT_SHARE_COUNT, nicht dieser Waechter");
  assert.ok(MarketCap.REASONS.SHARE_COUNT_SCALE_SUSPECT && MarketCap.REASONS.NO_PUBLISHED_CLOSE);
});

test("ES-4 · fehlende Evidenz: ohne Zeile UNAVAILABLE/NO_EVIDENCE, und ein Ranking wird nie veroeffentlicht", () => {
  for (const row of [null, undefined, "x"]) {
    const r = StrategyMatch.evaluate(contract, row);
    assert.equal(r.state, "UNAVAILABLE");
    assert.equal(r.reason, "NO_EVIDENCE");
    assert.deepEqual(r.profiles, []);
  }
  const leer = StrategyMatch.evaluate(contract, {});
  assert.equal(leer.ranking.state, "WITHHELD");
  assert.equal(leer.ranking.reason, "RANKING_NOT_PUBLISHED");
  assert.deepEqual(leer.bestFit, []);
});
