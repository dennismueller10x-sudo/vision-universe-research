/* CHECKPOINT 6/10 — Technical-UI: Seite, Renderer-Grenze, Terminologie, Mobile */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const QUANT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(QUANT, p), "utf8");

/* UI1, UI3 und UI7 prueften die fruehere Mehrseiten-Technical-Seite
   (quant/technical/app.js). Sie lief neben den Golden Five auf synthetischen
   Instrumenten und ist entfernt; /quant/technical/?symbol=T leitet auf
   #/aktie/T/technik der App weiter (no-mock-in-product.test.mjs). */
test("UI1 · Die App bindet Chartmodul und Technical-Renderer in richtiger Reihenfolge ein; die alte Technical-Adresse ist eine Weiterleitung", () => {
  const html = read("index.html");
  for (const s of ["/quant/ui/shell.js", "vu-navigation", "site-navigation.css", "/quant/ui/charts.js", "/quant/ui/technical-chart.js"]) assert.ok(html.includes(s), s);
  assert.ok(html.indexOf("/quant/ui/charts.js") < html.indexOf("/quant/ui/technical-chart.js"), "Renderer erweitert das Chartmodul und muss danach laden");
  const legacy = read("technical/index.html");
  assert.ok(legacy.includes("/quant/ui/legacy-redirect.js") && !legacy.includes("/quant/ui/shell.js"));
});

test("UI2 · Renderer interpretiert nur Annotationen und rechnet keine Struktur", () => {
  const src = read("ui/technical-chart.js");
  assert.ok(!/ATR|zigzag|pivotEngine|runPivots|analyze\(/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "Renderer enthaelt Berechnungslogik");
  assert.ok(src.includes("NOW_DIVIDER") && src.includes("WAVE_LABEL") && src.includes("ENTRY_ZONE") && src.includes("PROJECTION_ZONE"));
  assert.ok(src.includes("a.status.toLowerCase()"), "Status (CONFIRMED/DEVELOPING/PROJECTED) wird als Stilklasse durchgereicht");
  assert.ok(src.includes("QC.technicalChart = technicalChart"), "registriert sich auf dem gemeinsamen Chartmodul");
});

test("UI3 · Keine Wahrscheinlichkeits- oder Empfehlungssprache im Technical-Vertrag der App", () => {
  const contract = read("api/technical-workspace-contract.js"), css = read("ui/quant.css");
  assert.doesNotMatch(contract, /\d+\s*%\s*(Wahrscheinlichkeit|Chance)/);
  assert.doesNotMatch(contract, /garantiert|sicher kaufen|\bBUY\b|\bSELL\b/);
  assert.match(contract, /isProbability:false/, "Method Fit wird nie als Wahrscheinlichkeit ausgewiesen");
  assert.ok(css.includes(".q-tchart"), "Chart-Styles vorhanden");
});

test("UI4 · Mobile: 390px-Breakpoint, horizontal scrollbarer Chart, touch-freundliche Layer-Toggles", () => {
  const css = read("ui/quant.css") + read("ui/technical-chart.css");
  assert.ok(read("index.html").includes("/quant/ui/technical-chart.css"), "shared chart styles loaded by the app");
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.q-tech-controls \.q-pill\{min-height:40px\}/);
  assert.match(css, /\.q-tech-chart-wrap\{overflow-x:auto/);
  assert.match(css, /\.q-tchart \.sem-wave-projected\{[^}]*stroke-dasharray/, "Projektion gestrichelt");
  assert.match(css, /\.q-tchart \.sem-wave-historical\{[^}]*stroke:var\(--ink\)/, "Historie durchgezogen in Ink");
  assert.match(css, /\.q-tchart \.sem-wave-developing\{[^}]*stroke:var\(--blue\)/, "Developing eigener Stil");
});

test("UI5 · Oeffentliche Technical-Daten sind ausschliesslich echte, versionierte Bundles", () => {
  const meta = JSON.parse(read("data/technical/meta.json")), index = JSON.parse(read("data/technical/index.json"));
  assert.equal(meta.methodologyVersions.technical, JSON.parse(read("methodology/technical-v1.json")).methodologyVersion);
  assert.ok(index.instruments.every((r) => r.isMock === false && r.dataMode === "real" && r.snapshotId && r.asOf));
  assert.equal(meta.mockData, undefined, "kein Block fuer das synthetische Universum mehr");
  /* Phase 5: development-preview.json erlaubt genau fuenf reale Titel
     (Golden Five, Eigentuemerentscheidung). Jeder andere reale Titel waere
     ein Leck ausserhalb der deklarierten Scope-Liste. */
  const previewScope = new Set(
    JSON.parse(read("config/development-preview.json")).scope || []);
  assert.ok(index.instruments.length > 0);
  assert.ok(index.instruments.every((r) => previewScope.has(r.instrumentId)),
    "ein realer Titel ausserhalb der Golden-Five-Scope-Liste waere ein Leck: " +
    index.instruments.filter((r) => !previewScope.has(r.instrumentId)).map((r) => r.instrumentId).join(", "));

  /* Jedes Golden-Five-Bundle traegt source:"tiingo" und eine eigene,
     zutreffende Provenienznotiz - nicht die Dashboard-Formulierung, die
     fuer diese Quelle falsch waere (Fund: SOURCE zeigte "UNKNOWN" und die
     Notiz nannte den Dashboard-Bestand, obwohl die Quelle Tiingo ist).
     Die Bundle-Eigenschaften, die frueher an der synthetischen Fixture
     VUF011 geprueft wurden, gelten fuer jedes echte Bundle. */
  for (const ticker of previewScope) {
    const bundle = JSON.parse(read(`data/technical/instruments/${ticker}.json`));
    assert.equal(bundle.isMock, false, ticker);
    assert.equal(bundle.source, "tiingo", ticker + ": source muss tiingo sein, nicht die Dashboard-Quelle");
    assert.match(bundle.note || "", /Golden Five/, ticker + ": Provenienznotiz muss die Golden-Five-Herkunft nennen");
    assert.equal(bundle.bundle.priceSeriesType, "SPLIT_ADJUSTED", ticker);
    assert.ok(bundle.bundle.analysisLookback.bars >= bundle.bars.timestamps.length, ticker + ": Analyse-Lookback ≥ Anzeigefenster");
    assert.ok(bundle.bundle.annotations.annotations.some((a) => a.type === "NOW_DIVIDER"), ticker);
  }
});


test("UI6 · Provenienz nennt Modus, Form und Quelle ohne globalen Synthetik-Widerspruch", () => {
  const shell = read("ui/shell.js");
  for (const label of ["MODE", "FORM", "SOURCE", "PRECOMPUTED"]) assert.ok(shell.includes(label), label);
  assert.doesNotMatch(shell, /Saemtliche Daten in diesem Bereich sind synthetisch/);
  assert.doesNotMatch(shell, /Modelluniversum zum Modellstand|Demo-Daten · synthetisches Universum/);
});
