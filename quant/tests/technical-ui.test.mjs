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

test("UI5 · Navigation fuehrt einen Technical-Tab; ausgelieferte Daten sind versioniert und als real/mock gekennzeichnet", () => {
  assert.ok(read("ui/shell.js").includes('BASE + "technical/"'));
  const meta = JSON.parse(read("data/technical/meta.json")), index = JSON.parse(read("data/technical/index.json"));
  assert.equal(meta.methodologyVersions.technical, JSON.parse(read("methodology/technical-v1.json")).methodologyVersion);
  assert.ok(index.instruments.every((r) => typeof r.isMock === "boolean" && r.snapshotId && r.asOf));
  assert.ok(index.instruments.some((r) => r.instrumentId === "NVDA" && !r.isMock), "NVDA Golden Case vorhanden");
  const nvda = JSON.parse(read("data/technical/instruments/NVDA.json"));
  assert.equal(nvda.bundle.priceSeriesType, "SPLIT_ADJUSTED");
  assert.ok(nvda.bundle.analysisLookback.bars >= nvda.bars.timestamps.length, "Analyse-Lookback ≥ Anzeigefenster");
  assert.ok(nvda.bundle.annotations.annotations.some((a) => a.type === "NOW_DIVIDER"));
  assert.ok(nvda.bundle.elliott && nvda.bundle.elliott.primaryCount, "Elliott-Ergebnis fuer NVDA");
  assert.ok(nvda.bundle.elliott.primaryCount.waves.some((w) => w.status === "CONFIRMED"), "historische Wave Map, nicht nur Zukunft");
});
