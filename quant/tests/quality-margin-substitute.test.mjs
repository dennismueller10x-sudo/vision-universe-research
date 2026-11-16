// Ersatzpruefung quant-v2.4.0 (a): die Variante "ohne" laesst genau die alte Margenkomponente weg, und eine
// Margenstabilitaet aendert nur die Variante "mit". Forschung, nicht zertifiziert.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Q = require("../../scripts/quant/research/quality-margin-substitute.cjs");

test("Varianten: ohne = mit minus operatingMarginStability", () => {
  assert.deepEqual(Q.VARIANTS.mit.map((c) => c[0]), ["accrualRatio", "netDebtToAssets", "equityToAssets", "positiveFcfYears", "operatingMarginStability"]);
  assert.deepEqual(Q.VARIANTS.ohne.map((c) => c[0]), ["accrualRatio", "netDebtToAssets", "equityToAssets", "positiveFcfYears"]);
});

test("nur die Variante mit liest die Margenstabilitaet", () => {
  const rows = Array.from({ length: 250 }, (_, k) => ({
    id: "ref_T" + k, template: false,
    raws: { accrualRatio: (k % 17) / 17, netDebtToAssets: (k % 11) / 11, equityToAssets: (k % 13) / 13, positiveFcfYears: k % 6, operatingMarginStability: (k % 7) / 7 }
  }));
  const flipped = rows.map((r) => ({ ...r, raws: { ...r.raws, operatingMarginStability: 1 - r.raws.operatingMarginStability } }));
  assert.deepEqual(Q.scoreQuality(rows, Q.VARIANTS.ohne), Q.scoreQuality(flipped, Q.VARIANTS.ohne));
  assert.notDeepEqual(Q.scoreQuality(rows, Q.VARIANTS.mit), Q.scoreQuality(flipped, Q.VARIANTS.mit));
  assert.equal(Q.scoreQuality([{ ...rows[0], template: true }, ...rows.slice(1)], Q.VARIANTS.mit)[0], null);
});

const M = require("../../scripts/quant/research/quality-margin-pit.cjs");

test("drei Margenformen: steigende Marge bestraft nur die alte Stabilitaet", () => {
  const steigend = M.marginForms([0.10, 0.15, 0.20, 0.30, 0.40]);
  assert.ok(steigend.operatingMarginStability > 0);
  assert.equal(steigend.operatingMarginDrawdown, 0);
  assert.equal(steigend.operatingMarginDownside, 0);
});

test("drei Margenformen: Einbruch, Dauerverlust, zu kurzes Fenster", () => {
  const einbruch = M.marginForms([0.37, 0.16, 0.30, 0.55, 0.62]);
  assert.ok(Math.abs(einbruch.operatingMarginDrawdown - 0.21) < 1e-12);
  assert.ok(Math.abs(einbruch.operatingMarginDownside - Math.sqrt(0.21 * 0.21 / 4)) < 1e-12);
  const verlust = M.marginForms([-0.3, -0.25, -0.2, -0.15]);
  assert.ok(Math.abs(verlust.operatingMarginDrawdown - 0.225) < 1e-12);
  assert.ok(Math.abs(verlust.operatingMarginDownside - 0.225) < 1e-12);
  assert.equal(M.marginForms([0.1, 0.2, 0.3]), null);
});

test("Vergleiche der PIT-Pruefung: (ii) und (iii) gegen (i), (ii) gegen (iii), (i) gegen ohne", () => {
  assert.deepEqual(M.COMPARISONS, [["ii", "i"], ["iii", "i"], ["ii", "iii"], ["i", "ohne"]]);
  assert.deepEqual(Object.keys(M.VARIANTS), ["ohne", "i", "ii", "iii"]);
});
