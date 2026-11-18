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

test("TX01 Start nach Prototyp #technical (App-Konzept 2, Owner 14./15.11.2026): Reiter im Inhalt, Kopfkachel mit zwei Anteilen, Heute neu und Muster als Schienen, fertige Suchen öffnen den Screener, „Weiter“-Karte und „Daten & Hinweise“; kein Chart-Quiz, keine Zahlenkacheln und Bestenlisten", () => {
  const home = app.slice(app.indexOf("  function viewHome(main) {"), app.indexOf("  /* Ausgeschlossen: Linien"));
  for (const s of ["Was zeigt der Chart?", "Jeden Tag lesen feste Regeln die Charts aller US-Aktien und sagen in Worten, was auffällt.", "Heute neu im Chart", "Muster im Markt", "Fertige Suchen", "Chart lesen in 4 Lektionen",
    "tc-ms", "#/screener?vorlage=", "MUSTER_GRID.map", "tkForm(", "tkTabs()", "tkTabsMode(true)", "Fundamental: wie gut ist das Geschäft?", "Daten & Hinweise", "tk-seg2", "über 200-Tage-Linie", "darunter"])
    assert.ok(home.includes(s), s);
  /* Reihenfolge wie im Prototyp: Reiter, Kopfkachel, Heute neu, Muster; danach die Blöcke des bisherigen Starts, zuletzt Weiter und Hinweise. */
  const order = ["tkTabs()", "tile, tkSh(", "tkSh(\"Heute neu im Chart\"", "musterHead, forms", "tkSh(\"Fertige Suchen\"", "searchSlot, chips", "learn, next", "tk-end"].map((s) => home.indexOf(s));
  assert.ok(order.every((x, i) => x > 0 && (!i || x > order[i - 1])), "Reihenfolge: " + order.join(","));
  for (const t of ["Heute", "Muster", "Screener", "Chart", "Lernen"]) assert.ok(app.includes('["' + t + '", "'), "Reiter " + t);
  assert.match(html, /h\.setAttribute\("data-vu-tabs","inhalt"\)/, "Reiter im Inhalt schon vor dem ersten Bild");
  assert.match(app, /if \(stockView\) tkTabsMode\(true\);\s*else if \(route\.view !== "home"\) tkTabsMode\(false\);/, "andere Ansichten zeigen die Reiter des Rahmens, die Aktienseite #/chart/<T> keine (Klickentwurf 17.11.2026)");
  assert.match(app, /var stockView = route\.view === "chart" && !!route\.ticker/);
  assert.match(html, /\/\^#\\\/\?chart\\\/\[\^\\\/\?\]\+\/\.test\(location\.hash\)\)h\.setAttribute\("data-vu-tabs","inhalt"\)/, "Aktienseite ohne Reiterzeile schon vor dem ersten Bild");
  assert.match(app, /"data-vu-stock": row\.s, "data-vu-stock-name": name/, "Heute neu: Aktien-Vorschau");
  assert.match(app, /href: "\/aktie\/#\/" \+ encodeURIComponent\(row\.s\)/);
  assert.doesNotMatch(home, /Bestenlisten|U\.tile\(|tc-tiles3|setupSheet|Quiz|Punkte/);
});

test("TX02 Chart-Seite: Urteil, Zonen, drei Sätze, Zonen-Kacheln, Befunde heute, Kapitel; Befund-Sheet mit Erkannt, Ungültig laut Regel, Forschung, Verlauf", () => {
  for (const s of ["Was der Chart sagt", "Der Chart in drei Sätzen", "\"200-Tage-Linie\")", "Befunde heute", "Was die Regeln heute im Chart finden.", "Verlauf der letzten 12 Monate", "Kerzen, Linien, RSI, MACD · PRO",
    "\"Ungültig laut Regel\"", "Hilft dieses Muster?", "\"Verlauf bei \"", "-mal gestoppt", "-mal gehalten"]) assert.ok(app.includes(s), s);
  assert.doesNotMatch(app, /"Wichtige Preise"|"In drei Sätzen"|"Relevante Niveaus"/);
});

test("Klickentwurf Modul-Aktienseiten (#modul-technical, Owner 17.11.2026): Reihenfolge der Chart-Seite, Karussell, Zonen-Karte, Verlauf, Kapitel-Liste, Pillen vor der Fußzeile", () => {
  const simple = app.slice(app.indexOf("  function renderSimple(body, X) {"), app.indexOf("  function zoneCard(lv, close, sh) {"));
  const order = ["tk-say", "explainBtn, sh(\"Kursverlauf\")", "host, guideHost, legend, togs", "sh(\"Der Chart in drei Sätzen\", [storyInfo]), story", "zoneCard(lv, S.close[t], sh)", "bh[0], bh[1], verlauf", "sh(\"Kapitel\"), chapters, foot"].map((x) => simple.indexOf(x));
  assert.ok(order.every((x, i) => x > 0 && (!i || x > order[i - 1])), "Reihenfolge: " + order.join(","));
  assert.match(simple, /class: "tk-rail tk-story", role: "list"/, "drei Sätze als Karussell");
  assert.match(simple, /U\.ring\(g\.value, \{ size: 54/, "Schwung mit Ring");
  assert.match(simple, /befundeHeute\(X, 6\)/, "alle Befunde (bis 6) als Karten");
  assert.match(simple, /X\.histOf\(\)\.slice\(\)\.reverse\(\)/, "Verlauf aus derselben Rechnung wie das Kapitel");
  assert.match(simple, /dataQuality\(X\.inst, X\.D, false\); dq\.classList\.add\("tk-krow"\)/, "Datenqualität als Zeile der Kapitel-Kachel");
  assert.match(app, /main\.classList\.toggle\("tk-ak", akView\)/);
  assert.match(app, /var simple = \{ range: "1J", zones: true, trend: false, avg: true/, "Zonen und 200-Tage-Linie zu Beginn an");
  const css = readFileSync("technical/technical.css", "utf8");
  for (const x of [".tk-ak .tk-story-c{width:220px", ".tk-ak .tk-zc-m{position:relative;height:120px", ":root:not([data-theme=dark]) .tk-ak .tk-zc-u", ".tc.tk-ak{max-width:760px}"]) assert.ok(css.includes(x), x);
});

test("TX03 Studio: darunter Befunde und Zonen wie auf der Chart-Seite", () => {
  const studio = app.slice(app.indexOf("  function renderStudio(body, X) {"), app.indexOf("  /** Hinweis zum Zeitbezug der Reihe"));
  assert.match(studio, /befundeHeute\(X, 6\)/);
  assert.match(studio, /zoneTiles\(X\.levels, S\.close\[last\]\)/, "Zonen-Kacheln, seit App-Konzept 2 mit dem Kurs für die Zonenleiter");
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
  assert.match(app, /VC\.sparkline\(sparkMap\[row\.s\], \{ width: 220, height: 80 \}\)/, "Karte „Heute neu im Chart“ (Prototyp: Verlauf 220 × 80 über die ganze Kartenbreite)");
});

test("Markt heute als Ampel in Neonfarben (Owner 10.11.2026): Zustand aus dem Urteil, drei Lichter in der Zustandsfarbe; seit dem Prototyp #technical im Fenster der Kopfkachel", () => {
  const home = app.slice(app.indexOf("  function viewHome(main) {"), app.indexOf("  /* Ausgeschlossen: Linien"));
  assert.match(home, /\["weak", "mid", "strong"\]\.map/);
  assert.match(home, /"tk-ms-sheet tc-ms--" \+ v\[0\]/);
  assert.match(home, /tile\.classList\.add\("tc-ms--" \+ v\[0\]\)/, "Zustand auch an der Kopfkachel");
  assert.match(home, /pop\("tc-about-pop", "Was zeigt der Chart\?"/, "ein Tipp auf die Kopfkachel öffnet das Fenster");
  const css = readFileSync("technical/technical.css", "utf8");
  for (const s of ["--tc-neon-green", "--tc-neon-yellow", "--tc-neon-red", ".tc-ms--strong{", ".tc-ms--mid{", ".tc-ms--weak{", ".tc-ampel", ".tc-ampel i.is-weak.is-on{background:var(--tc-neon-red)", ".tc-ampel i.is-mid.is-on{background:var(--tc-neon-yellow)", ".tc-ampel i.is-strong.is-on{background:var(--tc-neon-green)"]) assert.ok(css.includes(s), s);
  /* Prototyp-Werte: Kachel #151516 mit Radius 22, Tagesbewegung Minus rot (Owner); Hell mit eigenen Werten (lesbar). */
  for (const s of ["--tk-tile:#151516", ".tk .tk-tile{background:var(--tk-tile);border-radius:22px", ".tk .vu-chg--down{background:#c4281c;color:#fff}", ":root:not([data-theme=dark]) .tk{"]) assert.ok(css.includes(s), s);
});
