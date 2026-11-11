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

test("Entscheidung 8: Lernen ist ein Ort; #/akademie und #/assistent leiten weiter, Lektionen und Fragen behalten ihre Adresse", () => {
  assert.equal(M.parseRoute("#/lernen").view, "learn");
  assert.match(app, /\(r\.view === "academy" \|\| r\.view === "assistant"\) && !r\.id \? "#\/lernen" : null/);
  assert.match(app, /if \(to\) \{ redirected = true; location\.replace\(to\); return; \}/, "Weiterleitung vor dem Seitenübergang");
  assert.equal(M.parseRoute("#/akademie/struktur-1").view, "academy");
  const learn = app.slice(app.indexOf("  function viewLearn(main"), app.indexOf("  function viewAssistant(main, route) {"));
  for (const s of ["Charts lesen<br>lernen", "8 Lernpfade, 32 kurze Lektionen", "Weiter mit", "Lernpfade", "Eine Frage an den Chart", "#/screener?z="]) assert.ok(learn.includes(s), s);
  const view = readFileSync("technical/academy/view.js", "utf8");
  assert.doesNotMatch(view, /'#\/akademie'\)/, "Rückwege der Lektionen führen nach #/lernen");
  /* Akademie-Inhalte bleiben unverändert (nur Darstellung). */
  const c = JSON.parse(readFileSync("technical/academy/content.json", "utf8"));
  assert.equal(c.paths.length, 8); assert.equal(c.lessons.length, 32);
});

test("TX04 / Entscheidung 11: Muster mit Bild, Zahl und Richtung; „Hilft das Muster?“ mit Urteil und Etikett Forschung", () => {
  const muster = app.slice(app.indexOf("  function musterTab(slot) {"), app.indexOf("  function indicatorTab(slot, familie) {"));
  for (const s of ["Heute im Markt", "Hilft das Muster?", "Forschung, nicht zertifiziert", "\"Belegt\"", "\"Kein Vorteil\"", "\"Gegen die Lesart\"", "mgCell("]) assert.ok(muster.includes(s), s);
  assert.match(app, /Was die Formen<br>im Chart bedeuten/);
});

test("TX06 / Entscheidung 9 mit Owner-Änderung 09.11.: Technical-Screener bleibt im neuen Design, keine Weiterleitung; Perspektiven führen in den Hauptscreener", () => {
  const scr = app.slice(app.indexOf("  function viewScreener(main, route) {"), app.indexOf("  function valueText(field, v) {"));
  for (const s of ["Screener · Perspektive Chart", "Was suchst du?", "\"/screener/?p=\" + x[0]", "Fertige Suchen · Chart", "Treffer zeigen", "tc-satz"]) assert.ok(scr.includes(s) || app.includes(s), s);
  assert.doesNotMatch(app, /location\.(replace|assign)\(["']\/screener\//, "keine Weiterleitung in den Hauptscreener");
  assert.match(app, /"In Worten suchen"/);
  assert.match(app, /Regeln" \) \+ " erkannt\. "|" Regeln"\) \+ " erkannt\. "/);
  assert.equal(M.parseRoute("#/screener?reiter=vorlagen").tab, "templates");
  assert.equal(M.parseRoute("#/vorlagen/breakout").view, "templates");
});

test("Entscheidung 10: Markt heute aus der gemeinsamen Quelle (market-pulse.json) mit Stand und Basis; eigene Zählung nur als Rückfall, ebenfalls mit Basis", () => {
  const pulse = JSON.parse(readFileSync(new URL("./fixtures/technical-concept/market-pulse.json", import.meta.url), "utf8"));
  const b = M.marketBreadth(pulse);
  assert.ok(b && b.source === "market-pulse" && b.base > 1000 && b.share > 0 && b.share < 100 && /^\d{4}-\d{2}-\d{2}$/.test(b.asOf));
  assert.match(M.breadthSentence(b), /^\d+ % von [\d.]+ US-Aktien über der 200-Tage-Linie, Stand \d\d\.\d\d\.$/);
  assert.equal(M.breadthSentence({ share: 34.2, base: 5630, asOf: "2026-11-06" }), "34 % von 5.630 US-Aktien über der 200-Tage-Linie, Stand 06.11.");
  assert.equal(M.marketBreadth({ schemaVersion: "vu-market-pulse-1.1.0", dimensions: { BREADTH: { evidence: [{ key: "above200", value: 37, evaluated: 5000, current: false }] } } }), null, "nicht aktueller Beleg");
  assert.equal(M.marketBreadth(null), null);
  const home = app.slice(app.indexOf("  function viewHome(main) {"), app.indexOf("  /* Ausgeschlossen: Linien"));
  assert.match(home, /M\.marketBreadth\(pulse\) \|\| own/);
  assert.match(home, /M\.breadthSentence\(b\)/);
  const reg = JSON.parse(readFileSync("core/registry/product-contracts.json", "utf8"));
  assert.ok(reg.products.technical.consumes.includes("marketPulse") && /^quant\/data\/market\/intelligence\/market-pulse\.json$/.test(reg.interfaces.marketPulse.artifact));
});

test("Kleinform im Konzept-Stil: Mini-Charts nutzen VUChart.sparkline (neongrüne Fläche, Endpunkt), keine schwarze Einzellinie", () => {
  assert.doesNotMatch(app, /Chart\.sparkline\(/, "kein technical/ui/chart.js#sparkline in der Oberfläche");
  assert.match(app, /VC\.sparkline\(sparkMap\[row\.s\], \{ width: 216, height: 40 \}\)/, "Karte „Heute neu im Chart“");
});

test("Markt heute als Ampel in Neonfarben (Owner 10.11.2026): Zustand aus dem Urteil, drei Lichter, Karte in der Zustandsfarbe", () => {
  const home = app.slice(app.indexOf("  function viewHome(main) {"), app.indexOf("  /* Ausgeschlossen: Linien"));
  assert.match(home, /\["weak", "mid", "strong"\]\.map/);
  assert.match(home, /"tc-ms tc-ms--" \+ v\[0\]/);
  const css = readFileSync("technical/technical.css", "utf8");
  for (const s of ["--tc-neon-green", "--tc-neon-yellow", "--tc-neon-red", ".tc-ms--strong{", ".tc-ms--mid{", ".tc-ms--weak{", ".tc-ampel"]) assert.ok(css.includes(s), s);
});
