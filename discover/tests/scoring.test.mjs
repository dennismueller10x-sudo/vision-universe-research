/* Market Leadership Score: von Hand nachgerechnet, nicht nur ausgefuehrt. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Scoring = require(join(root, "discover", "engines", "scoring.js"));
const METHODOLOGY = require(join(root, "discover", "methodology", "discover-v1.json"));

const LEADERSHIP = METHODOLOGY.leadershipScore;

test("Gewichte der Methodik summieren sich auf 1", () => {
  for (const key of ["leadershipScore", "momentumScore", "relativeStrengthScore"]) {
    const sum = METHODOLOGY[key].components.reduce((a, c) => a + c.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, key + " summiert auf " + sum);
  }
});

test("lineare Transformation klemmt an beiden Enden", () => {
  const c = { weight: 1, from: -0.30, to: 0, transform: "linear" };
  assert.equal(Scoring.transform(c, -0.30), 0);
  assert.equal(Scoring.transform(c, 0), 1);
  assert.equal(Scoring.transform(c, 0.5), 1, "300 % Anstieg macht niemanden dreimal zum Fuehrer");
  assert.equal(Scoring.transform(c, -9), 0);
  assert.equal(Scoring.transform(c, null), null);
});

test("unbekannte Transformation wird abgelehnt statt geraten", () => {
  assert.throws(() => Scoring.transform({ from: 0, to: 1, transform: "sigmoid" }, 0.5),
                /unbekannte Transformation/);
});

test("Bestwert in jeder Komponente ergibt 100", () => {
  const perfekt = {};
  LEADERSHIP.components.forEach((c) => { perfekt[c.field] = c.to; });
  const r = Scoring.composite(LEADERSHIP, perfekt);
  assert.equal(r.status, "SCORED");
  assert.ok(Math.abs(r.score - 100) < 1e-9);
  assert.equal(r.coverage, 1);
});

test("Score von Hand nachgerechnet", () => {
  /* Zwei Komponenten auf 50 %, der Rest auf 100 % -> die Abweichung
     entspricht genau dem Gewicht der beiden halben Komponenten. */
  const metrics = {};
  LEADERSHIP.components.forEach((c) => { metrics[c.field] = c.to; });
  const halb = LEADERSHIP.components.slice(0, 2);
  halb.forEach((c) => { metrics[c.field] = c.from + (c.to - c.from) * 0.5; });
  const erwartet = 100 - halb.reduce((a, c) => a + c.weight * 50, 0);
  const r = Scoring.composite(LEADERSHIP, metrics);
  assert.ok(Math.abs(r.score - erwartet) < 1e-6, r.score + " != " + erwartet);
});

test("fehlende Komponente wird herausgerechnet, nicht mit 0 bewertet", () => {
  const voll = {};
  LEADERSHIP.components.forEach((c) => { voll[c.field] = c.to; });
  const ohneVolumen = Object.assign({}, voll);
  delete ohneVolumen.volumeRatio20over60;

  const r = Scoring.composite(LEADERSHIP, ohneVolumen);
  assert.equal(r.status, "SCORED");
  assert.ok(Math.abs(r.score - 100) < 1e-9,
    "wer in allen bekannten Komponenten perfekt ist, faellt nicht wegen einer unbekannten");
  assert.ok(r.coverage < 1);
  const fehlend = r.contributions.filter((c) => c.status === "MISSING");
  assert.equal(fehlend.length, 1);
  assert.equal(fehlend[0].contribution, null);
});

test("unter der Mindestabdeckung gibt es keinen Score", () => {
  const r = Scoring.composite(LEADERSHIP, { return3M: 0.4 });
  assert.equal(r.status, "INCOMPLETE");
  assert.equal(r.score, null);
  assert.match(r.reason, /Abdeckung/);
});

test("Beitraege sind nachvollziehbar und summieren sich", () => {
  const metrics = {};
  LEADERSHIP.components.forEach((c) => { metrics[c.field] = c.to; });
  const r = Scoring.composite(LEADERSHIP, metrics);
  const summe = r.contributions.reduce((a, c) => a + (c.contribution || 0), 0);
  assert.ok(Math.abs(summe - r.score) < 1e-6);
});

test("Trendqualitaet zaehlt nur bekannte Durchschnitte", () => {
  assert.equal(Scoring.trendAlignment({ priceAboveSMA20: true, priceAboveSMA50: true,
                                        priceAboveSMA100: true, priceAboveSMA200: true }), 1);
  assert.equal(Scoring.trendAlignment({ priceAboveSMA20: true, priceAboveSMA50: false }), 0.5);
  assert.equal(Scoring.trendAlignment({}), null, "ohne Angaben gibt es keine Trendqualitaet");
});

test("Perzentil: Bindungen teilen sich den Rang", () => {
  const scale = Scoring.percentileScale([10, 20, 20, 30]);
  assert.equal(scale(30), 87.5);
  assert.equal(scale(10), 12.5);
  assert.equal(scale(20), 50, "zwei gleiche Werte bekommen denselben Rang");
  assert.equal(scale(null), null);
});

test("Perzentil eines Ein-Titel-Universums behauptet keine Spitze", () => {
  const scale = Scoring.percentileScale([42]);
  assert.equal(scale(42), 50);
});

test("Breakout ohne Trend ist kein Breakout", () => {
  const r = Scoring.breakoutScore({ volumeSpikeRatio: 3, distanceTo52wHigh: -0.02,
                                    priceAboveSMA20: false, priceAboveSMA50: true });
  assert.equal(r.score, 0);
  assert.match(r.reason, /SMA20/);
});

test("Breakout ohne Volumenkennzahl bleibt unentschieden", () => {
  const r = Scoring.breakoutScore({ distanceTo52wHigh: -0.02, priceAboveSMA20: true,
                                    priceAboveSMA50: true });
  assert.equal(r.status, "INCOMPLETE");
  assert.equal(r.score, null);
});

test("Breakout mit Volumen und Naehe zum Hoch skaliert", () => {
  const stark = Scoring.breakoutScore({ volumeSpikeRatio: 2.5, distanceTo52wHigh: 0,
                                        volumeBreakout: true, priceAboveSMA20: true,
                                        priceAboveSMA50: true });
  const schwach = Scoring.breakoutScore({ volumeSpikeRatio: 1.2, distanceTo52wHigh: -0.12,
                                          volumeBreakout: false, priceAboveSMA20: true,
                                          priceAboveSMA50: true });
  assert.equal(stark.score, 100);
  assert.ok(schwach.score < stark.score);
});
