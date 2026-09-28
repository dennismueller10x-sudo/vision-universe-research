/* Markt-Validierung: reine Funktionen (scripts/market/lib/market-validation.mjs,
   scripts/market/build-validation-sources.mjs). Synthetische Daten, kein Netz. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointInTimeStates, forwardOutcomes, evaluate, frequencies } from "../../scripts/market/lib/market-validation.mjs";
import { parseFrenchCsv, cumulate, industryBreadth, parseFredCsv } from "../../scripts/market/build-validation-sources.mjs";

const CFG = JSON.parse(readFileSync(new URL("../../quant/config/market-pulse.json", import.meta.url), "utf8"));

function day(i) { return new Date(Date.UTC(2000, 0, 3) + i * 86400000).toISOString().slice(0, 10); }
function series(n, f) { return Array.from({ length: n }, (_, i) => [day(i), f(i)]); }
/* Steigender Markt; die ersten 400 Tage schwanken staerker, damit die
   spaetere Volatilitaet unter den expandierenden Perzentilen liegt. */
const rising = (i) => 100 * Math.exp(0.0006 * i + (i < 400 ? 0.02 : 0.003) * Math.sin(i));

test("forwardOutcomes: Einstieg am Folgetag, Rendite und schlechtester Stand", () => {
  const pts = [[day(0), 100], [day(1), 100], [day(2), 90], [day(3), 110], [day(4), 99]];
  const o = forwardOutcomes(pts, [2], 1);
  assert.ok(Math.abs(o.get(day(0))[2].ret - 10) < 1e-9);
  assert.ok(Math.abs(o.get(day(0))[2].worst + 10) < 1e-9);
  assert.equal(o.get(day(3))[2], null, "Fenster ueber das Ende hinaus bleibt leer");
});

test("pointInTimeStates: steigender Markt konstruktiv, fallender defensiv - ohne Blick nach vorn", () => {
  const n = 900;
  const up = series(n, rising);
  const trackers = { A: up, B: up, C: up, D: up };
  const s = pointInTimeStates({ trackers, benchmark: "A", cfg: CFG, volFrom: day(0), minVolSamples: 100 });
  assert.ok(s.length > 0);
  assert.ok(s.every((x) => x.BREADTH === "UNKNOWN"));
  assert.equal(s.at(-1).TREND, "POSITIVE");
  assert.ok(s.at(-1).env >= 3);
  /* Ein spaeterer Absturz aendert keinen frueheren Zustand. */
  const crash = up.map((p, i) => (i > 700 ? [p[0], p[1] * 0.5] : p));
  const s2 = pointInTimeStates({ trackers: { A: crash, B: crash, C: crash, D: crash }, benchmark: "A", cfg: CFG, volFrom: day(0), minVolSamples: 100 });
  const before = (xs) => xs.filter((x) => x.date <= day(700)).map((x) => x.env);
  assert.deepEqual(before(s2), before(s));
  assert.ok(s2.at(-1).env <= 1, "nach dem Absturz niedrige Stufe");
});

test("pointInTimeStates: Breite begrenzt die Stufe (schmal hoechstens 2)", () => {
  const up = series(700, rising);
  const s = pointInTimeStates({ trackers: { A: up, B: up, C: up, D: up }, benchmark: "A", cfg: CFG, volFrom: day(0), minVolSamples: 100, breadthAt: () => "NARROW" });
  assert.ok(s.every((x) => x.env <= CFG.environment.breadthCap.NARROW));
});

test("evaluate: niedrige Stufen mit mehr Rueckgaengen werden erkannt", () => {
  const states = [], out = new Map();
  for (let i = 0; i < 2100; i++) {
    const low = Math.floor(i / 21) % 2 === 0;
    states.push({ date: day(i), env: low ? 0 : 4 });
    out.set(day(i), { 21: low ? { ret: -5, worst: -15 } : { ret: 3, worst: -2 } });
  }
  const e = evaluate(states, out, { horizons: [21], levels: ["a", "b", "c", "d", "e"] });
  const dd = e.contrasts.tests.find((t) => t.metric.startsWith("deutlicher"));
  assert.equal(dd.lowShare, 100);
  assert.equal(dd.highShare, 0);
  assert.ok(dd.significantAfterBH);
  assert.equal(e.byHorizon[21].levels[0].independent + e.byHorizon[21].levels[4].independent, 100);
  assert.equal(frequencies(states, ["a", "b", "c", "d", "e"]).environment.a, 50);
});

test("parseFrenchCsv: erster Block, fehlende Werte, Ende am Textblock", () => {
  const csv = "Beschreibung\r\n\r\n,Mkt-RF,RF\r\n19260701,    0.10,    0.01\r\n19260702,  -99.99,    0.01\r\n\r\n Average Equal Weighted\r\n,Mkt-RF,RF\r\n19260701, 9, 9\r\n";
  const f = parseFrenchCsv(csv);
  assert.deepEqual(f.columns, ["Mkt-RF", "RF"]);
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[1].vals[0], null);
  assert.deepEqual(cumulate(f.rows, 0), [["1926-07-01", 100.1]]);
});

test("industryBreadth: Anteil ueber den Linien erst ab ausreichender Historie", () => {
  const rows = Array.from({ length: 260 }, (_, i) => ({ date: day(i), vals: [0.1, -0.1] }));
  const b = industryBreadth(rows);
  assert.equal(b[0].date, day(199));
  assert.equal(b.at(-1).above50Pct, 50);
  assert.equal(b.at(-1).above200Pct, 50);
  assert.equal(b.at(-1).evaluated, 2);
});

test("parseFredCsv: Punkt als fehlender Wert", () => {
  assert.deepEqual(parseFredCsv("observation_date,T10Y3M\n2020-01-02,0.5\n2020-01-03,.\n"), [["2020-01-02", 0.5]]);
});
