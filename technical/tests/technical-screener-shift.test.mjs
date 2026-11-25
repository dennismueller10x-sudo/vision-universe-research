/* K3 (Live-Messung 23.11.2026, Screener CLS 0,215): Der Kopfbereich des Screeners hat vor dem Laden des Datensatzes
   einen Platzhalter, damit der Ergebnisbereich beim Fuellen nicht springt. Nur Darstellung, keine Rechnung. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("technical/app.js", "utf8");
const css = readFileSync("technical/technical.css", "utf8");
const start = app.indexOf('id: "tc-treffer"');
const view = app.slice(start, app.indexOf("Promise.all([loadScreener(), loadSpark()])", start));

test("Screener: vor dem Datensatz stehen Platzhalter im Kopfbereich und im Ergebnisbereich", () => {
  assert.match(view, /if \(!dataset\) \{[^}]*put\(body, el\("div", \{ class: "tc-skel tc-skel--body"/);
  assert.match(view, /put\(results, el\("div", \{ class: "tc-skel", style: "height:220px" \}\)\)/);
});

test("Screener: der Platzhalter des Kopfbereichs hat eine feste Hoehe", () => {
  assert.match(css, /\.tc-skel--body\{height:\d+px\}/);
});

test("Screener: der Platzhalter ist fuer assistive Technik ausgeblendet, der Datensatz wird wie bisher geladen", () => {
  assert.match(view, /"aria-hidden": "true"/);
  assert.match(app, /Promise\.all\(\[loadScreener\(\), loadSpark\(\)\]\)/);
});
