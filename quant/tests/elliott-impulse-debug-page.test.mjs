/* Interne Impuls-Debug-Seite (quant/research/elliott-impulse-debug/), Mission VI §30, §67, §68.
   INTERN · Forschung · keine Produktaussage. Geprüft wird ohne Browser:
     1. index.html / debug.js referenzieren impulse-debug-data.json und enthalten keine externen http(s)-URLs,
     2. debug.js ist syntaktisch gültig und definiert die Wellenbeschriftungen (IMPULSE/ZIGZAG/WXY/TRIANGLE),
     3. die Daten: 35 Fälle, kein HOLDOUT_*-Split, jeder OK-Fall hat series und top[0].points. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "quant/research/elliott-impulse-debug");
const HTML = readFileSync(join(DIR, "index.html"), "utf8");
const JS = readFileSync(join(DIR, "debug.js"), "utf8");
const CSS = readFileSync(join(DIR, "debug.css"), "utf8");
const DATA = JSON.parse(readFileSync(join(DIR, "impulse-debug-data.json"), "utf8"));
const EXTERNAL = /https?:\/\/[a-z0-9]/i;

test("Seite referenziert impulse-debug-data.json, Shell und eigene Assets", () => {
  assert.match(JS, /impulse-debug-data\.json/);
  assert.match(HTML, /impulse-debug-data\.json/);
  assert.match(HTML, /src="debug\.js"/);
  assert.match(HTML, /href="debug\.css"/);
  assert.match(HTML, /\/quant\/ui\/shell\.js/);
  assert.match(HTML, /noindex/);
  assert.match(HTML, /INTERN · Forschung · keine Produktaussage/);
  assert.match(JS, /Primärquelle/);
  assert.match(JS, /Warum verliert die Impulslesart\?/);
});

test("keine externen http(s)-URLs in HTML, JS und CSS", () => {
  for (const [name, txt] of [["index.html", HTML], ["debug.js", JS], ["debug.css", CSS]])
    assert.ok(!EXTERNAL.test(txt), name + " enthält eine externe URL: " + (txt.match(/https?:\/\/[^\s"')]+/i) || [""])[0]);
});

test("debug.js ist syntaktisch gültig und definiert die Wellenbeschriftungen", () => {
  const r = spawnSync(process.execPath, ["--check", join(DIR, "debug.js")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const t of ["IMPULSE", "ZIGZAG", "WXY", "TRIANGLE"]) assert.match(JS, new RegExp("\\b" + t + ":\\s*\\["), "Beschriftung für " + t);
  assert.match(JS, /IMPULSE:\s*\["0", "1", "2", "3", "4", "5"\]/);
  assert.match(JS, /ZIGZAG:\s*\["0", "A", "B", "C"\]/);
  assert.match(JS, /WXY:\s*\["0", "W", "X", "Y"\]/);
  assert.match(JS, /TRIANGLE:\s*\["0", "A", "B", "C", "D", "E"\]/);
});

test("Daten: 35 Fälle, keine Holdouts, jeder OK-Fall mit series und top[0].points", () => {
  assert.ok(typeof DATA.label === "string" && DATA.label.length > 0);
  assert.ok(DATA.engine);
  assert.equal(DATA.cases.length, 35);
  for (const c of DATA.cases) {
    assert.ok(!String(c.split || "").startsWith("HOLDOUT"), c.referenceId + " ist ein Holdout");
    if (c.status && c.status !== "OK") continue;
    assert.ok(Array.isArray(c.series) && c.series.length > 0, c.referenceId + ": series");
    assert.ok(Array.isArray(c.top) && c.top[0] && Array.isArray(c.top[0].points), c.referenceId + ": top[0].points");
  }
});
