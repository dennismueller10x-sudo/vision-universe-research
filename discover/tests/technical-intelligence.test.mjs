/* Technical Intelligence: der Layer erfindet nichts, er uebersetzt nur. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TI = require(join(root, "discover", "engines", "technical-intelligence.js"));

test("ohne Bundle: unavailable mit Grund, niemals eine Zaehlung", () => {
  const r = TI.elliottWave(null);
  assert.equal(r.status, "unavailable");
  assert.equal(r.reason, "NO_BUNDLE");
  assert.equal(r.currentWave, null);
  assert.equal(r.confidence, null);
});

test("ohne Kursreihe wird der Grund benannt", () => {
  const r = TI.elliottWave(null, { seriesAvailable: false });
  assert.equal(r.reason, "NO_SERIES");
});

test("calculating nur auf ausdrueckliche Ansage", () => {
  assert.equal(TI.elliottWave(null).status, "unavailable");
  assert.equal(TI.elliottWave(null, { calculating: true }).status, "calculating");
});

test("AMBIGUOUS der bestehenden Engine wird nicht zu einem Ergebnis geschoent", () => {
  const r = TI.elliottWave({ status: "AMBIGUOUS", reason: "AMBIGUOUS", confidence: 76,
                             engineVersion: "elliott-1.0.0-beta" });
  assert.equal(r.status, "unavailable");
  assert.equal(r.confidence, null, "eine nicht verwertbare Zaehlung traegt keine Konfidenz");
  assert.match(r.message, /nicht eindeutig/);
});

test("ein unbekannter Engine-Zustand faellt auf unavailable", () => {
  const r = TI.elliottWave({ status: "VOELLIG_NEU" });
  assert.equal(r.status, "unavailable");
});

test("OK mit guter Methodengeguete wird available", () => {
  const r = TI.elliottWave({ status: "OK", confidence: 72, confidenceType: "method_fit",
                             degreeScale: "scale-3", isProbability: false,
                             degrees: { "scale-3": { currentWave: "3", patternType: "IMPULSE" } } });
  assert.equal(r.status, "available");
  assert.equal(r.currentWave, "3");
  assert.equal(r.patternType, "IMPULSE");
  assert.equal(r.isProbability, false);
});

test("OK mit schwacher Methodengeguete wird herabgestuft", () => {
  const r = TI.elliottWave({ status: "OK", confidence: 31, degreeScale: "scale-3",
                             degrees: { "scale-3": { currentWave: "5" } } });
  assert.equal(r.status, "lowConfidence");
});

test("LOW_CONFIDENCE bleibt LOW_CONFIDENCE", () => {
  assert.equal(TI.elliottWave({ status: "LOW_CONFIDENCE", confidence: 80 }).status, "lowConfidence");
});

test("am echten Bundle: der Befund der Engine wird unveraendert uebernommen", () => {
  const file = join(root, "quant", "data", "technical", "instruments", "NVDA.json");
  if (!existsSync(file)) return;
  const bundle = JSON.parse(readFileSync(file, "utf8")).bundle;
  const r = TI.fromBundle(bundle);
  const erwartet = TI.FROM_ENGINE[bundle.elliott.status] || "unavailable";
  assert.equal(r.layers.elliottWave.status, erwartet);
  assert.equal(r.layers.elliottWave.sourceEngine, bundle.elliott.engineVersion);
  assert.equal(r.layers.supportResistance.status, "available");
  assert.equal(r.layers.supportResistance.zones, bundle.supportResistance.zones.length);
});

test("die vier Zustaende sind genau die des Vertrags", () => {
  const Contract = require(join(root, "discover", "engines", "contract.js"));
  assert.deepEqual(Object.values(TI.STATUS).sort(), Contract.TI_STATUS.slice().sort());
});
