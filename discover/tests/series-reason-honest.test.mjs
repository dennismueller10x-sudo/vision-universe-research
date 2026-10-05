/* Eine fehlende Kursreihe muss den wahren Grund nennen. Vorher stand bei
   jedem echten Titel ohne Reihe "WITHHELD_REDISTRIBUTION" ("wird nach der
   Redistributionsregel nicht ausgeliefert") - auch wenn die Reihe zu kurz
   war (GROM: 270 Schlusskurse 0, DMN; Red-Team 05.10.2026). Der Vertrag
   kennt INSUFFICIENT_HISTORY (discover/engines/contract.js). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "stocks");

function details() {
  const out = [];
  for (const u of readdirSync(DIR)) {
    let files = [];
    try { files = readdirSync(join(DIR, u)).filter((f) => f.endsWith(".json")); } catch { continue; }
    for (const f of files) out.push(JSON.parse(readFileSync(join(DIR, u, f), "utf8")));
  }
  return out;
}

test("Zu kurze Reihe heisst INSUFFICIENT_HISTORY, nicht Redistribution", () => {
  const falsch = details().filter((d) => d.series && d.series.available === false &&
    d.priceSeries && d.priceSeries.status === "INSUFFICIENT_HISTORY" &&
    d.series.reason !== "INSUFFICIENT_HISTORY").map((d) => d.symbol);
  assert.deepEqual(falsch, []);
});

test("Der Redistributions-Satz steht nur dort, wo die Reihe tatsaechlich vorhanden waere", () => {
  const falsch = details().filter((d) => d.series && d.series.reason === "WITHHELD_REDISTRIBUTION" &&
    d.priceSeries && d.priceSeries.status === "INSUFFICIENT_HISTORY").map((d) => d.symbol);
  assert.deepEqual(falsch, []);
});
