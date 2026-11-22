/* Zweitbesuch/Ladezeit: screener-v1 (1,1 MB) und spark-v1 (325 KB) gehen nicht mehr im Leerlauf ueber das Netz. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync("technical/app.js", "utf8");
const body = (name) => { const i = app.indexOf("function " + name + "("); assert.ok(i > 0, name); return app.slice(i, app.indexOf("\n  }", i)); };

test("Vorlagenliste laedt den Datensatz nur bei Absicht, nie im Leerlauf", () => {
  const f = body("prefetchScreener");
  assert.ok(!/requestIdleCallback|setTimeout/.test(f));
  assert.ok(/pointerdown/.test(f) && /focusin/.test(f) && /touchstart/.test(f));
  assert.ok(/saveData/.test(f), "Datensparen bleibt ausgenommen");
});

test("Startseite: \"Heute neu im Chart\" steht im ersten Bildschirm und laedt weiter nach dem ersten Bild", () => {
  assert.ok(/requestIdleCallback\(go, \{ timeout: 1500 \}\)/.test(app));
});

test("index.html laedt screener/spark weder per preload noch per prefetch", () => {
  const html = readFileSync("technical/index.html", "utf8");
  assert.ok(!/(preload|prefetch)[^>]*(screener-v1|spark-v1)/.test(html));
});
