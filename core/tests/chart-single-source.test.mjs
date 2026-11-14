/* Core · EIN Aktienchart für alle Welten (Owner 13.11.2026: „den Chart immer gleich machen“).
   Vertragstest gegen ein zweites Chart-Modul: jede Aktienseite (Quant, Technical, Discover) zeichnet ihre Kurslinie
   mit dem gemeinsamen Baustein (assets/vu-chart.js über quant/app/chart.js, VUQuantChart.create). Eine Welt, die
   wieder eine eigene Kurslinie zeichnet, macht diesen Test rot. Fachliche Zusätze der Welt sind Ebenen (onPaint). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const VUChart = require(join(ROOT, "assets", "vu-chart.js"));
const CS = require(join(ROOT, "core", "chart-standard.js"));

/* Je Welt: die Datei der Aktienseite, die den gemeinsamen Chart erzeugt, und was sie dort NICHT selbst zeichnen darf. */
const WORLDS = [
  { id: "quant", file: "quant/app/page-stock.js", must: [/VUQuantChart\.create\(/], from: null, to: null, forbid: [/MicroChart\.render(Range|Intraday)\(/, /VUTechnicalChart/] },
  { id: "discover", file: "discover/ui/detail.js", must: [/function gemeinsamerChart\(/, /global\.VUChart/, /VC\.render\(/, /dollarKopf && gemeinsamerChart\(/, /intraday: true/], from: null, to: null, forbid: [/VUTechnicalChart/] },
  { id: "technical", file: "technical/app.js", must: [/loadChartWidget\(\)/, /Chart\.create\(/], from: "function renderSimple(", to: "function renderStudio(", forbid: [/Chart\.render\(/, /VUChart\.(render|mount)\(/, /MicroChart\./] }
];

test("Aktienseiten laden den gemeinsamen Chart und zeichnen keine eigene Kurslinie", () => {
  for (const w of WORLDS) {
    const src = read(w.file);
    const part = w.from ? src.slice(src.indexOf(w.from), src.indexOf(w.to)) : src;
    assert.ok(part.length > 100, w.id + ": Abschnitt nicht gefunden");
    for (const m of w.must) assert.match(part, m, w.id + " nutzt den gemeinsamen Chart nicht: " + m);
    for (const f of w.forbid) assert.doesNotMatch(part, f, w.id + " zeichnet eine eigene Kurslinie: " + f);
  }
});

test("Technical lädt genau die Skripte des gemeinsamen Charts", () => {
  const src = read("technical/app.js");
  for (const s of ["/assets/vu-chart.js", "/quant/app/chart.js", "/discover/ui/live-hub.js", "/core/chart-history.js"]) assert.ok(src.includes('"' + s + '"'), s + " fehlt in CHART_WIDGET_SCRIPTS");
});

test("Eine Leiste: Hauptleiste von vu-chart, Chartstandard und Aktienchart sind gleich", () => {
  assert.deepEqual([...VUChart.RANGES], ["1T", "1W", "1M", "1J", "5J", "Max"]);
  assert.deepEqual(CS.PRIMARY.map((x) => VUChart.canonRange(x)), [...VUChart.RANGES]);
  const src = read("quant/app/chart.js");
  assert.match(src, /var PRIMARY_IDS = \["1D", "5D", "1M", "1Y", "5Y", "MAX"\]/, "Hauptleiste im Aktienchart abgewichen");
  const labels = [...src.matchAll(/\{ id: "(\w+)", label: "(\w+)"/g)].map((m) => m[2]);
  assert.deepEqual(labels.slice(0, 6).map((x) => VUChart.canonRange(x)), [...VUChart.RANGES]);
});

test("Eine Währungsvorgabe: Dollar, an einer Stelle", () => {
  assert.equal(CS.DEFAULT_DISPLAY, "USD");
  for (const f of ["quant/app/chart.js", "technical/app.js", "assets/vu-chart.js"]) assert.doesNotMatch(read(f), /defaultCurrency\s*:\s*["']EUR["']/, f + " setzt eine eigene Währungsvorgabe");
});

test("Die Linienklassen des Charts (vu-chart-line, -area) erzeugt nur assets/vu-chart.js", () => {
  for (const f of ["quant/app/chart.js", "technical/app.js", "quant/app/page-stock.js", "quant/app/page-chartbild.js", "discover/ui/detail.js"]) {
    assert.doesNotMatch(read(f), /class:\s*["']vu-chart-(line|area)["']/, f + " baut die Kurslinie selbst");
  }
});
