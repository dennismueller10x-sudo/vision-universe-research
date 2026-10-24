/* Das Kursniveau des SEC-Quant-Panels ist ein veroeffentlichter Schlusskurs
   und folgt damit derselben Regel wie die Reihen (published-close.js,
   ADR-002). Gemessen am 23.10.2026: AAPL 347,725 im Panel gegen 347,73 auf
   der Aktienseite. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const PublishedClose = require(join(ROOT, "quant/engines/published-close.js"));
const PANEL = join(ROOT, "quant/data/sec/quant-factor-inputs.json");

test("SEC-Panel: jedes Kursniveau ist ein nach Vertrag gerundeter Schlusskurs", () => {
  if (!existsSync(PANEL)) return;
  const panel = JSON.parse(readFileSync(PANEL, "utf8"));
  let geprueft = 0;
  for (const s of Object.values(panel.securities)) {
    const price = s.fundamentals && s.fundamentals.price;
    if (price === null || price === undefined) continue;
    assert.equal(price, PublishedClose.roundClose(price), s.ticker + ": Kurs " + price + " ist kein veroeffentlichter Schluss");
    geprueft++;
  }
  assert.ok(geprueft > 0, "kein Kurs im Panel");
});
