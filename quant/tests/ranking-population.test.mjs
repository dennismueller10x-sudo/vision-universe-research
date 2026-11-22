/* Ranglisten und Perzentile nur ueber Stammaktien und ADR (quant/engines/ranking-population.js, Steuerung 22.11.2026).
   RP-1 Regel; RP-2 Screener-Ranglisten (build-market-factors) und RP-3 Faktorevidenz (build-factor-evidence) nutzen sie;
   RP-4 der Grund ist lesbar (factor-evidence REASON_TEXT, Faktorobjekt traegt reasonText). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const RP = require("../engines/ranking-population.js");
const FE = require("../engines/factor-evidence.js");
const src = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("RP-1 · gerankt werden nur EQUITY_COMMON und ADR", () => {
  assert.deepEqual([...RP.RANKABLE], ["EQUITY_COMMON", "ADR"]);
  for (const t of ["EQUITY_COMMON", "ADR"]) assert.equal(RP.isRankable(t), true, t);
  for (const t of ["PREFERRED", "SPAC", "TRUST", "REIT", "WARRANT", "RIGHT", "UNIT", "COMMON_STOCK", null, undefined, ""]) assert.equal(RP.isRankable(t), false, String(t));
});

test("RP-2 · Screener-Ranglisten ranken nur die Stammaktien-Grundgesamtheit; Ja/Nein-Fragen zaehlen weiter alle", () => {
  const s = src("scripts/market/build-market-factors.mjs");
  assert.match(s, /const RANKABLE_ROWS = rows\.filter\(\(r\) => RankingPopulation\.isRankable\(r\.instrumentType\)\);/);
  assert.match(s, /RankingHygiene\.rankRows\(RANKABLE_ROWS,/);
  assert.ok(!/RankingHygiene\.rankRows\(rows,/.test(s), "keine Rangliste ueber alle Zeilen");
});

test("RP-3 · Faktorevidenz: getrennte Klassen rechnen in keine Normalisierung und tragen NOT_APPLICABLE mit Grund", () => {
  const s = src("scripts/quant/build-factor-evidence.mjs");
  assert.match(s, /const rankable = records\.map\(\(record\) => RankingPopulation\.isRankable\(gattung\.get\(record\.security\.securityId\)\)\);/);
  assert.match(s, /const raws = records\.map\(\(record, index\) => \{\n\s+if \(!rankable\[index\]\) return null;/);
  assert.match(s, /state: "NOT_APPLICABLE", reason: RankingPopulation\.REASON, reasonText: RankingPopulation\.TEXT/);
});

test("RP-4 · der Grund ist ein bekannter Faktorgrund mit Text", () => {
  assert.ok(FE.FACTOR_REASONS.includes(RP.REASON));
  assert.equal(FE.REASON_TEXT[RP.REASON], RP.TEXT);
});

test("RP-5 · Zusammensetzung des Produkts (Beschriftung): Stammaktien, in Pruefung, Produktumfang", () => {
  const C = require("../../core/product-composition.js");
  const elig = [["e1", "EQUITY_COMMON", "ELIGIBLE"], ["e2", "EQUITY_COMMON", "REVIEW"], ["a1", "ADR", "SEPARATE_CLASS"], ["p1", "PREFERRED", "SEPARATE_CLASS"],
    ["s1", "SPAC", "SEPARATE_CLASS"], ["w1", "WARRANT", "REVIEW"], ["x1", "EQUITY_COMMON", "EXCLUDED"]].map(([securityId, instrument_type, product_eligibility]) => ({ securityId, instrument_type, product_eligibility }));
  const uni = ["e1", "e2", "a1", "p1", "s1", "w1", "zz"].map((securityId) => ({ securityId }));
  const c = C.compose(elig, uni);
  assert.deepEqual({ ...c, version: null }, { version: null, commonStock: { eligible: 1, review: 1 }, adr: 1, separateClasses: 2, otherReview: 1, productScope: 7, unmatched: 1 });
  assert.equal(c.commonStock.eligible + c.commonStock.review + c.adr + c.separateClasses + c.otherReview + c.unmatched, c.productScope, "jede Zeile genau einmal gezaehlt");
  const toy = C.compose([{ securityId: "a", instrument_type: "EQUITY_COMMON", product_eligibility: "ELIGIBLE" }, { securityId: "b", instrument_type: "EQUITY_COMMON", product_eligibility: "REVIEW" },
    { securityId: "c", instrument_type: "PREFERRED", product_eligibility: "SEPARATE_CLASS" }], [{ securityId: "a" }, { securityId: "b" }, { securityId: "c" }]);
  assert.deepEqual(C.label(toy), { commonStock: "US-Stammaktien 1 (+1 in Prüfung)", productScope: "Produktumfang inkl. getrennter Klassen 3" });
});
