/* Detailchart: die Linie "52W Hoch/Tief" folgt der Plattformdefinition
   (252 Handelstage bis zum Ende des Ausschnitts), nicht dem gewaehlten
   Zeitraum. Vorher stand bei "3M" das 3-Monats-Hoch als "52W Hoch". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "detail.js"), "utf8");
const body = src.slice(src.indexOf("function jahresExtreme"), src.indexOf("function sliceBars"));
const jahresExtreme = new Function("isNum", body + "\nreturn jahresExtreme;")((v) => typeof v === "number" && Number.isFinite(v));

function bars(n) {
  const t = [], high = [], low = [];
  for (let i = 0; i < n; i++) { t.push(new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10)); high.push(100 + i); low.push(50 + i); }
  return { timestamps: t, high, low };
}

test("52W aus 252 Tagesbars bis zum Ende des Ausschnitts, unabhaengig vom Zeitraum", () => {
  const b = bars(400);
  const ende = b.timestamps[399];
  assert.deepEqual(jahresExtreme(b, ende), { hoch: 499, tief: 50 + 148 });
  /* Ein 3M-Ausschnitt endet am selben Tag: dieselbe Linie (vorher: 3M-Hoch/Tief). */
  const dreiMonate = { high: b.high.slice(-63), low: b.low.slice(-63) };
  assert.notEqual(Math.min(...dreiMonate.low), 50 + 148, "der alte Weg haette das 3M-Tief gezeigt");
});

test("Ausschnitt endet frueher: Fenster endet dort", () => {
  const b = bars(400);
  assert.deepEqual(jahresExtreme(b, b.timestamps[299]), { hoch: 399, tief: 50 + 48 });
});

test("Unter 252 Tagen keine Linie", () => {
  const b = bars(251);
  assert.equal(jahresExtreme(b, b.timestamps[250]), null);
  assert.equal(jahresExtreme(null, "2026-01-01"), null);
});

test("Luecken (null) werden uebersprungen", () => {
  const b = bars(300);
  b.high[299] = null; b.low[100] = null;
  assert.deepEqual(jahresExtreme(b, b.timestamps[299]), { hoch: 398, tief: 50 + 48 });
});
