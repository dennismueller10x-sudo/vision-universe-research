/* Konzept „Der Chart in drei Sätzen“ (docs/design/technical-2026-11/HANDOVER.md): Aufbau und Adressen.
   PR 2: Start (TX01), Chart-Seite und Befund-Sheet (TX02), Studio (TX03). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.VUTechnical = globalThis.VUTechnical || {};
require("../../core/query-engine.js");
const Q = require("../../quant/engines/technical/technical-query.js");
const M = require("../engine/model.js");
const SHP = require("../ui/shapes.js");
const app = readFileSync("technical/app.js", "utf8");
const html = readFileSync("technical/index.html", "utf8");

test("Entscheidung 5: alte Adressen /signale und /studio bleiben erreichbar (Kapitel der Chart-Seite)", () => {
  assert.deepEqual([M.parseRoute("#/chart/NVDA").tab, M.parseRoute("#/chart/NVDA/signale").tab, M.parseRoute("#/chart/nvda/studio").tab], ["chart", "signals", "studio"]);
  assert.equal(M.chartHref("NVDA", "signals", "teil=verlauf"), "#/chart/NVDA/signale?teil=verlauf");
  assert.equal(M.parseRoute("#/chart/NVDA/signale?teil=verlauf").params.teil, "verlauf");
});

test("Entscheidung 4: jedes Muster hat ein Bild (oder das neutrale), gleich auf allen Seiten", () => {
  for (const t of Object.keys(Q.FORMATION_TYPES)) assert.ok(SHP.OF_TYPE[t] && SHP.SH[SHP.OF_TYPE[t]], t);
  for (const k of ["dreieck", "range", "doppelboden", "doppeltop", "kopf", "luecke_dn", "luecke_up", "flagge"]) assert.ok(SHP.SH[k], "Vorlage " + k);
  assert.equal(SHP.keyOf({ kind: "indicator", id: "sma200" }), "linie200");
  assert.equal(SHP.keyOf({ kind: "indicator", id: "unbekannt" }), "neutral");
  assert.match(SHP.svg("GAP_DOWN", 30), /^<svg class="tc-shape" width="30" height="20"/);
  assert.ok(html.indexOf("/technical/ui/shapes.js") > 0 && html.indexOf("/technical/ui/shapes.js") < html.indexOf("/technical/app.js"));
});

test("TX01 Start: Markt als Zeile, Heute neu als Karten, fertige Suchen öffnen den Screener, Muster als Raster; keine Zahlenkacheln und Bestenlisten", () => {
  const home = app.slice(app.indexOf("  function viewHome(main) {"), app.indexOf("  /* Ausgeschlossen: Linien"));
  for (const s of ["Was zeigt<br>der Chart?", "Heute neu im Chart", "Fertige Suchen", "Tipp öffnet die Treffer im Screener.", "Muster heute im Markt", "Chart lesen in 4 Lektionen", "tc-ms", "#/screener?vorlage="])
    assert.ok(home.includes(s), s);
  assert.doesNotMatch(home, /Bestenlisten|U\.tile\(|tc-tiles3|setupSheet/);
});

test("TX02 Chart-Seite: Urteil, Zonen, drei Sätze, Zonen-Kacheln, Befunde heute, Kapitel; Befund-Sheet mit Erkannt, Ungültig laut Regel, Forschung, Verlauf", () => {
  for (const s of ["Was der Chart sagt", "Der Chart in drei Sätzen", "\"200-Tage-Linie\")", "Befunde heute", "Was die Regeln heute im Chart finden.", "Verlauf der letzten 12 Monate", "Kerzen, Linien, RSI, MACD · PRO",
    "\"Ungültig laut Regel\"", "Hilft dieses Muster?", "\"Verlauf bei \"", "-mal gestoppt", "-mal gehalten"]) assert.ok(app.includes(s), s);
  assert.doesNotMatch(app, /"Wichtige Preise"|"In drei Sätzen"|"Relevante Niveaus"/);
});

test("TX03 Studio: darunter Befunde und Zonen wie auf der Chart-Seite", () => {
  const studio = app.slice(app.indexOf("  function renderStudio(body, X) {"), app.indexOf("  /** Hinweis zum Zeitbezug der Reihe"));
  assert.match(studio, /befundeHeute\(X, 6\)/);
  assert.match(studio, /zoneTiles\(X\.levels\)/);
  assert.doesNotMatch(studio, /renderSignalCards|renderLevels/);
});
