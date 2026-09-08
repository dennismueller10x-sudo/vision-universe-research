/* CHECKPOINT 6/10 — Technical-UI: Seite, Renderer-Grenze, Terminologie, Mobile */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const QUANT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(QUANT, p), "utf8");

test("UI1 · Die Technical-Seite bindet Shell, Navigation, Chartmodul und Annotationen-Schema in richtiger Reihenfolge ein", () => {
  const html = read("technical/index.html");
  for (const s of ["/quant/ui/shell.js", "vu-navigation", "site-navigation.css", "/quant/ui/charts.js", "/quant/ui/technical-chart.js", "/quant/engines/technical/annotations.js", "/quant/technical/app.js"]) assert.ok(html.includes(s), s);
  assert.ok(html.indexOf("/quant/ui/charts.js") < html.indexOf("/quant/ui/technical-chart.js"), "Renderer erweitert das Chartmodul und muss danach laden");
  assert.ok(!html.includes("/quant/engines/technical/elliott") && !html.includes("technical-analysis.js"), "Die Seite rechnet nicht — sie liest praekomputierte Daten");
});

test("UI2 · Renderer interpretiert nur Annotationen und rechnet keine Struktur", () => {
  const src = read("ui/technical-chart.js");
  assert.ok(!/ATR|zigzag|pivotEngine|runPivots|analyze\(/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "Renderer enthaelt Berechnungslogik");
  assert.ok(src.includes("NOW_DIVIDER") && src.includes("WAVE_LABEL") && src.includes("ENTRY_ZONE") && src.includes("PROJECTION_ZONE"));
  assert.ok(src.includes("a.status.toLowerCase()"), "Status (CONFIRMED/DEVELOPING/PROJECTED) wird als Stilklasse durchgereicht");
  assert.ok(src.includes("QC.technicalChart = technicalChart"), "registriert sich auf dem gemeinsamen Chartmodul");
});

test("UI3 · Keine Wahrscheinlichkeits- oder Empfehlungssprache in UI-Texten", () => {
  const app = read("technical/app.js"), css = read("ui/quant.css");
  assert.doesNotMatch(app, /\d+\s*%\s*(Wahrscheinlichkeit|Chance)/);
  assert.doesNotMatch(app, /garantiert|sicher kaufen|Kursziel|\bBUY\b|\bSELL\b/);
  assert.ok(/keine Wahrscheinlichkeit/i.test(app), "Confidence wird als Method Fit ausgewiesen");
  assert.ok(/Methodology Confidence|Method Fit/.test(app));
  assert.ok(css.includes(".q-tchart"), "Chart-Styles vorhanden");
});

test("UI4 · Mobile: 390px-Breakpoint, horizontal scrollbarer Chart, touch-freundliche Layer-Toggles", () => {
  const css = read("ui/quant.css");
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.q-tech-controls \.q-pill\{min-height:40px\}/);
  assert.match(css, /\.q-tech-chart-wrap\{overflow-x:auto/);
  assert.match(css, /\.q-tchart \.sem-wave-projected\{[^}]*stroke-dasharray/, "Projektion gestrichelt");
  assert.match(css, /\.q-tchart \.sem-wave-historical\{[^}]*stroke:var\(--ink\)/, "Historie durchgezogen in Ink");
  assert.match(css, /\.q-tchart \.sem-wave-developing\{[^}]*stroke:var\(--blue\)/, "Developing eigener Stil");
});

test("UI5 · Navigation fuehrt einen Technical-Tab; oeffentliche Technical-Daten sind versionierte Mock-Bundles", () => {
  assert.ok(read("ui/shell.js").includes('BASE + "technical/"'));
  const meta = JSON.parse(read("data/technical/meta.json")), index = JSON.parse(read("data/technical/index.json"));
  assert.equal(meta.methodologyVersions.technical, JSON.parse(read("methodology/technical-v1.json")).methodologyVersion);
  assert.ok(index.instruments.every((r) => typeof r.isMock === "boolean" && r.snapshotId && r.asOf));
  /* Phase 5: development-preview.json erlaubt genau fuenf reale Titel
     (Golden Five, Eigentuemerentscheidung). Jeder andere reale Titel waere
     ein Leck ausserhalb der deklarierten Scope-Liste - genau das prueft
     dieser Test jetzt, statt "kein einziger realer Titel" zu verlangen. */
  const previewScope = new Set(
    JSON.parse(read("config/development-preview.json")).scope || []);
  const realInstruments = index.instruments.filter((r) => !r.isMock);
  assert.ok(index.instruments.length > previewScope.size, "es muessen auch Mock-Bundles vorliegen");
  assert.ok(realInstruments.every((r) => previewScope.has(r.instrumentId)),
    "ein realer Titel ausserhalb der Golden-Five-Scope-Liste waere ein Leck: " +
    realInstruments.filter((r) => !previewScope.has(r.instrumentId)).map((r) => r.instrumentId).join(", "));
  const fixture = JSON.parse(read("data/technical/instruments/VUF011.json"));
  assert.equal(fixture.isMock, true);
  assert.equal(fixture.bundle.priceSeriesType, "SPLIT_ADJUSTED");
  assert.ok(fixture.bundle.analysisLookback.bars >= fixture.bars.timestamps.length, "Analyse-Lookback ≥ Anzeigefenster");
  assert.ok(fixture.bundle.annotations.annotations.some((a) => a.type === "NOW_DIVIDER"));
  assert.ok(fixture.bundle.elliott, "Elliott-Beta-Ergebnis fuer synthetische Fixture");

  /* Jedes Golden-Five-Bundle traegt source:"tiingo" und eine eigene,
     zutreffende Provenienznotiz - nicht die Dashboard-Formulierung, die
     fuer diese Quelle falsch waere (Fund: SOURCE zeigte "UNKNOWN" und die
     Notiz nannte den Dashboard-Bestand, obwohl die Quelle Tiingo ist). */
  for (const ticker of previewScope) {
    const bundle = JSON.parse(read(`data/technical/instruments/${ticker}.json`));
    assert.equal(bundle.isMock, false, ticker);
    assert.equal(bundle.source, "tiingo", ticker + ": source muss tiingo sein, nicht die Dashboard-Quelle");
    assert.match(bundle.note || "", /Golden Five/, ticker + ": Provenienznotiz muss die Golden-Five-Herkunft nennen");
  }
});

test("UI7 · Die SOURCE-Provenienzfunktion kollidiert nicht mit der einparametrigen Zonen-Quellen-Funktion " +
     "(Fund: eine spaeter im selben Modul deklarierte function sourceLabel(x) ueberschrieb durch Hoisting " +
     "die frueher deklarierte zweiparametrige Provenienzfunktion gleichen Namens - SOURCE zeigte dadurch " +
     "'undefined' statt 'TIINGO'/'MOCK', da x.type auf einem {file, meta}-Argumentpaar nie passt)", () => {
  const app = read("technical/app.js");
  const call = app.match(/S\.provenanceTag\("SOURCE",\s*(\w+)\(file,\s*meta\)/);
  assert.ok(call, "SOURCE-Tag muss eine (file, meta)-Funktion aufrufen");
  const fnName = call[1];
  assert.notEqual(fnName, "sourceLabel",
    "darf nicht denselben Namen wie die vorhandene einparametrige Zonen-Quellen-Funktion tragen");
  const declarations = app.match(new RegExp("function\\s+" + fnName + "\\s*\\(", "g")) || [];
  assert.equal(declarations.length, 1, fnName + " darf im Modul nur einmal deklariert sein");
});

test("UI6 · Provenienz nennt Modus, Form, Quelle und Beta ohne globalen Synthetik-Widerspruch", () => {
  const shell = read("ui/shell.js"), app = read("technical/app.js");
  for (const label of ["MODE", "FORM", "SOURCE", "PRECOMPUTED"]) assert.ok(shell.includes(label) || app.includes(label), label);
  assert.ok(app.includes('provenanceTag("ELLIOTT", "BETA"'));
  assert.doesNotMatch(shell, /Saemtliche Daten in diesem Bereich sind synthetisch/);
});
