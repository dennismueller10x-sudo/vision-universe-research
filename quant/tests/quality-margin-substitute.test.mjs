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
