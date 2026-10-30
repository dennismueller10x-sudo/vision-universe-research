/* Boersenwert-Vertrag market-cap-1.2.0: Skalenwaechter fuer XBRL-Aktienzahlen.
   XBRL-Aktienzahlen tragen Skalenfehler (EEFT 10-K 2020: 5,28e16 statt
   52.752.851; ON, ORCL, YUM, CB: x1e6; Beleg docs/quant-recovery/v12/mcap).
   Ein Boersenwert daraus ist um das Tausend- bis Milliardenfache falsch.
   Regel: zurueckhalten (null + SHARE_COUNT_SCALE_SUSPECT), nie umskalieren.
   Synthetische Reihen, keine Produktionsdaten. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const MarketCap = require("../engines/market-cap.js");
const FactorEvidence = require("../engines/factor-evidence.js");

const COLUMNS = ["fy", "fp", "end", "v", "filed", "accn", "derived"];
/* Vier Quartale um 100 Mio Aktien, dann die zu pruefende Zahl. */
function doc(history, current) {
  const rows = history.map(([end, v, filed]) => [2025, "Q", end, v, filed, "0000000000-25-000001", 0]);
  if (current) rows.push([2026, "Q1", current.end, current.value, current.filed, "0000000000-26-000001", 0]);
  return { columns: COLUMNS, quarterly: { shares_outstanding: rows } };
}
const HISTORY = [
  ["2025-03-31", 100_000_000, "2025-05-01"],
  ["2025-06-30", 101_000_000, "2025-08-01"],
  ["2025-09-30", 102_000_000, "2025-11-01"],
  ["2025-12-31", 103_000_000, "2026-02-15"]
];
const CUTOFF = "2026-05-15";
const at = (value) => ({ value, end: "2026-03-31", filed: "2026-05-01" });

test("10^3-Sprung der Aktienzahl -> verdaechtig, Boersenwert zurueckgehalten", () => {
  const s = at(103_500_000_000); /* x1000, z. B. Zahl 'in Tausend' doppelt skaliert */
  const d = doc(HISTORY, s);
  assert.equal(MarketCap.shareScaleSuspect(s, d, CUTOFF), true);
  assert.equal(MarketCap.scalePlausible(s, d, CUTOFF, s.value * 20), false);
  /* auch nach unten (10^-3) und 10^6 */
  assert.equal(MarketCap.shareScaleSuspect(at(103_500), doc(HISTORY), CUTOFF), true);
  assert.equal(MarketCap.shareScaleSuspect(at(103_500_000_000_000), doc(HISTORY), CUTOFF), true);
});

test("Plausible Veraenderung (Rueckkauf, Emission, 2:1- und 10:1-Split) bleibt unberuehrt", () => {
  for (const v of [97_000_000, 125_000_000, 206_000_000, 1_030_000_000, 10_300_000]) {
    const s = at(v);
    assert.equal(MarketCap.shareScaleSuspect(s, doc(HISTORY, s), CUTOFF), false, "faelschlich verdaechtig: " + v);
    assert.equal(MarketCap.scalePlausible(s, doc(HISTORY, s), CUTOFF, v * 50), true);
  }
  /* Faktor 1000, aber ausserhalb der +-25 %-Toleranz um die Zehnerpotenz: kein reiner Skalenfehler. */
  assert.equal(MarketCap.shareScaleSuspect(at(103_000_000 * 1000 * 1.4), doc(HISTORY), CUTOFF), false);
});

test("Ohne Vorgeschichte entscheidet nur die absolute Grenze 8e12 USD", () => {
  const s = at(5_000_000_000);
  assert.equal(MarketCap.shareScaleSuspect(s, doc([]), CUTOFF), false);
  assert.equal(MarketCap.scalePlausible(s, doc([]), CUTOFF, 5e12), true);
  assert.equal(MarketCap.ABSOLUTE_MCAP_BOUND_USD, 8e12);
  assert.equal(MarketCap.scalePlausible(s, doc([]), CUTOFF, 8.0000001e12), false, "> 8e12 USD muss zurueckgehalten werden");
  assert.equal(MarketCap.scalePlausible(s, doc(HISTORY), CUTOFF, 2.5e13), false);
  /* ohne Kurs (kein Rohwert) haelt nur der Zehnerpotenz-Vergleich zurueck */
  assert.equal(MarketCap.scalePlausible(s, doc([]), CUTOFF, null), true);
  assert.equal(MarketCap.scalePlausible(null, doc(HISTORY), CUTOFF, 9e12), true, "ohne Aktienzahl gilt NO_PIT_SHARE_COUNT, nicht dieser Grund");
});

test("Zeitpunktsicher: spaeter gemeldete Quartale zaehlen nicht zur Vorgeschichte", () => {
  /* Die einzigen 'normalen' Vergleichswerte sind erst nach dem Stichtag gemeldet. */
  const late = HISTORY.map(([end, v]) => [end, v, "2026-09-01"]);
  const s = at(103_500_000_000);
  assert.equal(MarketCap.shareScaleSuspect(s, doc(late, s), CUTOFF), false);
  assert.deepEqual(MarketCap.previousShareCounts(doc(late, s), CUTOFF, s.end), []);
  /* Die zu pruefende Zahl selbst (gleiches Periodenende) ist nie ihr eigener Vergleich. */
  assert.deepEqual(MarketCap.previousShareCounts(doc(HISTORY, s), CUTOFF, s.end), HISTORY.map((r) => r[1]));
});

test("Der Faktorbau haelt zurueck statt umzuskalieren - mit Grund, in Engine, Dienst und Methodik", () => {
  const b = read("scripts/quant/build-factor-evidence.mjs");
  assert.match(b, /const skalaPlausibel = MarketCap\.scalePlausible\(shares, doc, cutoff, rohwert\);/);
  assert.match(b, /!skalaPlausibel \? "SHARE_COUNT_SCALE_SUSPECT"/);
  assert.match(b, /MARKET_CAP_WITHHELD = \[[^\]]*"SHARE_COUNT_SCALE_SUSPECT"\]/);
  /* keine Umrechnung der Aktienzahl im Faktorbau */
  assert.doesNotMatch(b.replace(/\/\*[\s\S]*?\*\//g, ""), /shares\.value\s*\/\s*(1e3|1e6|1e9|1000)/);
  assert.ok(FactorEvidence.REASONS ? FactorEvidence.REASONS.includes("SHARE_COUNT_SCALE_SUSPECT") : read("quant/engines/factor-evidence.js").includes('"SHARE_COUNT_SCALE_SUSPECT"'));
  assert.match(read("quant/engines/factor-evidence.js"), /SHARE_COUNT_SCALE_SUSPECT: "Bewertung bewusst zurückgehalten"/);
  assert.match(read("quant/api/product-services.js"), /VALUATION_WITHHELD_REASONS=\[[^\]]*'SHARE_COUNT_SCALE_SUSPECT'\]/);
  const method = JSON.parse(read("quant/methodology/market-cap-v1.json"));
  assert.equal(method.methodologyVersion, "market-cap-1.2.0");
  assert.equal(MarketCap.VERSION, "market-cap-1.2.0");
  assert.equal(method.scaleGuard.absoluteMarketCapBoundUsd, MarketCap.ABSOLUTE_MCAP_BOUND_USD);
  assert.ok(MarketCap.REASONS.SHARE_COUNT_SCALE_SUSPECT && method.withheld.SHARE_COUNT_SCALE_SUSPECT);
});
