/* Chart-Paritaet (scripts/quality/chart-parity.mjs): dieselbe Aktie, derselbe Kurs in jeder
   Produktwelt. Die Toleranz folgt der Praezision der Quellen, nicht einem festen Betrag. */
import test from "node:test";
import assert from "node:assert/strict";
import { comparePair, tolerance } from "../../scripts/quality/chart-parity.mjs";

test("Toleranz: veroeffentlichte Rundung gegen Anbieterwert, nicht pauschal 0,005 $", () => {
  /* 1,045 (Anbieter) wird zu 1,05 gerundet: zulaessig. 1,04 gegen 1,045 ebenso, 1,03 nicht. */
  assert.ok(Math.abs(1.05 - 1.045) <= tolerance("DS", 1.05, "TS", 1.045));
  assert.ok(Math.abs(1.03 - 1.045) > tolerance("DS", 1.03, "TS", 1.045));
  /* Pennystock: vier gueltige Stellen, die Grenze schrumpft mit dem Kurs. */
  assert.ok(Math.abs(0.05331 - 0.0533) <= tolerance("DS", 0.0533, "DL", 0.05331), "eine Einheit der vierten Stelle");
  assert.ok(Math.abs(0.05334 - 0.0533) > tolerance("DS", 0.0533, "DL", 0.05334), "vier Einheiten sind ein Befund");
  /* Rekonstruktion (ungerundet) gegen Veroeffentlichung: halber Cent. */
  assert.ok(tolerance("DS", 121.79, "GP", 121.7912) < 0.0051);
});

test("Identische Reihen: IDENTICAL; fehlender Handelstag: TIMESTAMPS-Befund ohne Wertfehler", () => {
  const a = [["2026-10-19", 10], ["2026-10-20", 10.5], ["2026-10-21", 11]];
  assert.equal(comparePair("DS", a, "TS", a).status, "IDENTICAL");
  const b = [["2026-10-19", 10], ["2026-10-21", 11]];
  const c = comparePair("DS", b, "TS", a);
  assert.equal(c.status, "DEVIATION");
  assert.equal(c.valueMismatches, 0);
  assert.deepEqual(c.missingInA, ["2026-10-20"]);
});

test("Ausserhalb des gemeinsamen Fensters wird nicht verglichen", () => {
  const lang = [["2026-01-02", 5], ["2026-10-20", 10.5], ["2026-10-21", 11]];
  const kurz = [["2026-10-20", 10.5], ["2026-10-21", 11]];
  assert.equal(comparePair("TS", kurz, "GP", lang).status, "IDENTICAL");
});

test("Split nicht nachgezogen: Niveaufaktor wird erkannt", () => {
  const tag = [["2026-10-14", 34.8], ["2026-10-15", 34.05], ["2026-10-16", 29.87]];
  const alt = tag.map(([d, v]) => [d, Number((v / 60).toPrecision(4))]);
  const c = comparePair("DS", tag, "DL", alt);
  assert.equal(c.valueMismatches, 3);
  assert.ok(Math.abs(c.levelFactor - 60) < 0.1);
});
