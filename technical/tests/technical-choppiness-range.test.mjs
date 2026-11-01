/* Datenvertrag 1.3.0: Choppiness 14 ist nur nach unten begrenzt (docs/technical/DATA_CONTRACT.md, Befund BMBL 30.10.2026).
   Reproduziert den BMBL-Fall mit den veroeffentlichten Tagesbars (09.10. bis 30.10.2026, Uebernahmeangebot 6,05 USD am 13.10.)
   und prueft die Schranken 0 <= CHOP <= 100 * log10(n + g / (HH - LL)) / log10(n). Die Formel bleibt unveraendert. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const I = require(join(root, "quant/engines/technical/indicators.js"));
const C = require(join(root, "quant/engines/technical/screener-contract.js"));

/* [Datum, Eroeffnung, Hoch, Tief, Schluss] aus quant/data/product/technical-signals-v1/BM.json.gz (BMBL), Stand 30.10.2026 */
const BMBL = [
  ["2026-10-09", 2.57, 2.59, 2.52, 2.54], ["2026-10-12", 2.54, 3.975, 2.5, 3.8], ["2026-10-13", 5.98, 5.98, 5.92, 5.95],
  ["2026-10-14", 5.95, 5.98, 5.93, 5.97], ["2026-10-15", 5.96, 5.97, 5.93, 5.93], ["2026-10-16", 5.94, 5.95, 5.93, 5.94],
  ["2026-10-19", 5.93, 5.96, 5.93, 5.96], ["2026-10-20", 5.94, 5.96, 5.94, 5.95], ["2026-10-21", 5.95, 5.95, 5.93, 5.95],
  ["2026-10-22", 5.94, 5.95, 5.935, 5.94], ["2026-10-23", 5.94, 5.96, 5.94, 5.96], ["2026-10-26", 5.95, 5.97, 5.94, 5.97],
  ["2026-10-27", 5.95, 6, 5.95, 5.98], ["2026-10-28", 5.96, 5.99, 5.96, 5.96], ["2026-10-29", 5.97, 5.99, 5.96, 5.98],
  ["2026-10-30", 5.96, 5.99, 5.96, 5.99]
];
const series = (rows) => ({ timestamps: rows.map((r) => r[0]), open: rows.map((r) => r[1]), high: rows.map((r) => r[2]),
  low: rows.map((r) => r[3]), close: rows.map((r) => r[4]), volume: rows.map(() => 1e6) });

test("BMBL 30.10.2026: Luecke vor dem Fenster ergibt CHOP 131,4 (Formel nach Dreiss, unveraendert)", () => {
  const b = series(BMBL), v = I.compute(b, "choppiness").values, t = BMBL.length - 1;
  assert.equal(Math.round(v[t] * 100) / 100, 131.4);
  /* Handrechnung: Fenster 13.10. bis 30.10. (14 Bars), Vorschluss 3,80 liegt unter LL = 5,92 */
  const w = BMBL.slice(-14), hh = Math.max(...w.map((r) => r[2])), ll = Math.min(...w.map((r) => r[3]));
  let sum = 0;
  for (let i = BMBL.length - 14; i < BMBL.length; i++) {
    const h = BMBL[i][2], l = BMBL[i][3], pc = BMBL[i - 1][4];
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  assert.ok(Math.abs(v[t] - 100 * Math.log10(sum / (hh - ll)) / Math.log10(14)) < 1e-9);
  assert.ok(sum > 14 * (hh - ll), "Σ TR uebersteigt n * Spanne");
  const g = ll - BMBL[BMBL.length - 15][4];
  assert.ok(v[t] <= 100 * Math.log10(14 + g / (hh - ll)) / Math.log10(14) + 1e-9, "obere Schranke mit Lueckenabstand");
  /* einen Tag vorher (Fenster ab 12.10.) ist die Spanne gross: CHOP klein, im alten Bereich */
  assert.ok(v[t - 1] >= 0 && v[t - 1] < 38.2, String(v[t - 1]));
});

test("Schranken: Vorschluss innerhalb der Fensterspanne -> CHOP <= 100; immer >= 0", () => {
  let seed = 7, above = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    let c = 50; const rows = [];
    for (let i = 0; i < 40; i++) {
      const o = c * (1 + (rnd() - 0.5) * 0.02) * (rnd() < 0.05 ? 1.3 : 1), cl = o * (1 + (rnd() - 0.5) * 0.004);
      rows.push(["d" + i, o, Math.max(o, cl) * (1 + rnd() * 0.002), Math.min(o, cl) * (1 - rnd() * 0.002), cl]); c = cl;
    }
    const v = I.compute(series(rows), "choppiness").values;
    for (let t = 14; t < rows.length; t++) {
      if (!Number.isFinite(v[t])) continue;
      const w = rows.slice(t - 13, t + 1), hh = Math.max(...w.map((r) => r[2])), ll = Math.min(...w.map((r) => r[3])), pc = rows[t - 14][4];
      const g = pc > hh ? pc - hh : pc < ll ? ll - pc : 0;
      assert.ok(v[t] >= -1e-9, "CHOP >= 0");
      assert.ok(v[t] <= 100 * Math.log10(14 + g / (hh - ll)) / Math.log10(14) + 1e-9, "obere Schranke");
      if (g === 0) assert.ok(v[t] <= 100 + 1e-9, "ohne Luecke <= 100");
      if (v[t] > 100) above++;
    }
  }
  assert.ok(above > 0, "die konstruierten Luecken erzeugen Werte ueber 100");
});

test("Vertrag 1.3.0: CHOP ueber 100 ist gueltig, negativ bleibt ein Verstoss", () => {
  const spec = C.columns().choppiness14;
  assert.deepEqual(spec.range, [0, Infinity]);
  assert.equal(C.valueError(spec, 131.4), null);
  assert.equal(C.valueError(spec, -0.01), "RANGE");
  assert.equal(C.CONTRACT_VERSION, "technical-screener-contract-1.3.0");
});
