/* CHARTBILD — Oberflaeche, Datenvertrag der API v2, Alerts.
   Die Seite rechnet nicht, sie zeigt praekomputierte Daten. Kein Text darf
   Gewissheit, Kaufsignale oder Wahrscheinlichkeiten behaupten. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const gz = (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString());
const Alerts = require("../engines/technical/ti/alerts.js");
const Explain = require("../engines/technical/ti/explain.js");

const UI_FILES = ["quant/app/page-chartbild.js", "quant/ui/ti-chart.js", "quant/api/technical-intelligence-workspace.js", "quant/engines/technical/ti/explain.js", "quant/app/chartbild.css"];
const FORBIDDEN = [/kursziel/i, /\bBUY\b/, /\bSELL\b/, /\d+\s*%\s*(Wahrscheinlichkeit|Chance)/i, /garantiert/i, /wird wahrscheinlich/i, /dürfte steigen/i, /Prognose:/, /jetzt kaufen/i, /kaufempfehlung/i, /risikolos/i];

test("UI-1 · keine verbotene Produktsprache in Chartbild-Dateien", () => {
  for (const f of UI_FILES) {
    const src = read(f);
    for (const re of FORBIDDEN) {
      const m = src.match(re);
      if (!m) continue;
      const before = src.slice(Math.max(0, m.index - 60), m.index);
      assert.ok(/keine|nicht|kein/i.test(before), f + " enthaelt " + m[0]);
    }
  }
});

test("UI-2 · Ueberschriften nennen keine internen Produktnamen ('Intelligence')", () => {
  const src = read("quant/app/page-chartbild.js");
  const heads = [...src.matchAll(/el\("h[1-4]"[^)]*text: "([^"]+)"/g)].map((m) => m[1]).concat([...src.matchAll(/X\.section\("([^"]+)"/g)].map((m) => m[1]));
  assert.ok(heads.length >= 6, "zu wenige Ueberschriften gefunden");
  heads.forEach((h) => assert.ok(!/Intelligence|CONFIRMED|INVALIDATED|Setup State/i.test(h), "Ueberschrift: " + h));
});

test("UI-3 · Seite laedt nur Anzeige-Bausteine (keine rechnenden Engines) in der richtigen Reihenfolge", () => {
  const html = read("quant/index.html");
  ["/quant/engines/technical/ti/engine.js", "/quant/engines/technical/elliott/", "/quant/engines/technical/ti/scenario.js"].forEach((p) => assert.ok(!html.includes(p), "laedt " + p));
  /* Im Buendel jeder Quant-Ansicht nur Texte und Lese-API; Chart, Seite und Stile laedt app.js erst bei Bedarf
     (Ressourcen-Budget der Startseite und des Screeners). */
  const order = ["/quant/engines/technical/ti/explain.js", "/quant/api/technical-intelligence-workspace.js", "/quant/app/app.js"].map((p) => html.indexOf(p));
  order.forEach((i) => assert.ok(i > 0));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, "Ladereihenfolge");
  ["/quant/ui/ti-chart.js", "/quant/app/page-chartbild.js", "/quant/app/chartbild.css"].forEach((p) => assert.ok(!html.includes(p), "nicht im Buendel: " + p));
  const app = read("quant/app/app.js");
  const lazy = ["/quant/app/chartbild.css", "/quant/ui/ti-chart.js", "/quant/app/page-chartbild.js"].map((p) => app.indexOf(p));
  lazy.forEach((i) => assert.ok(i > 0, "app.js laedt nach"));
  assert.ok(lazy[1] < lazy[2], "ti-chart.js vor page-chartbild.js");
  /* Jede Chartbild-Route geht ueber den Nachlader */
  assert.ok(!/global\.QXChartbild\.(chartbild|overview)\(/.test(app), "Route ohne Nachlader");
  assert.match(read("quant/app/page-method.js"), /QXLoadChartbild\(\)/);
  assert.match(read("quant/app/page-stock.js"), /QXChartbildCss\(\)/);
});

test("UI-4 · Datenzugriff nur ueber erlaubte Pfade", async () => {
  const g = {}; new Function("window", "globalThis", read("quant/api/technical-intelligence-workspace.js"))(g, g);
  const TI = g.VUTechnicalIntelligence;
  assert.ok(TI.ALLOWED.test("/quant/data/technical-intelligence/v3/shards/NV.json.gz"));
  assert.ok(TI.ALLOWED.test("/quant/data/technical-intelligence/v3/method-evidence.json"));
  assert.ok(!TI.ALLOWED.test("/quant/data/technical-intelligence/v3/../../sec/x.json"));
  assert.ok(!TI.ALLOWED.test("/quant/data/technical-intelligence/v2/meta.json"), "v2 ist abgeloest");
  assert.ok(!TI.ALLOWED.test("https://example.com/quant/data/technical-intelligence/v3/meta.json"));
  assert.equal(TI.shardKey("nvda"), "NV"); assert.equal(TI.shardKey("A"), "A_");
  assert.equal((await TI.getAnalysis("../../x")).state, "NOT_AVAILABLE");
});

test("UI-5 · Chart-Beschreibung fuer Screenreader nennt Zonen und Szenario-Charakter", () => {
  const g = {}; new Function("window", read("quant/ui/ti-chart.js"))(g);
  const d = g.VUTIChart.describe({ entryZone: { zoneLow: 10, zoneHigh: 11 }, targets: [{ zoneLow: 13, zoneHigh: 14 }], invalidation: { price: 9, direction: "below" } }, "$");
  assert.match(d, /Schlüsselzone/); assert.match(d, /Zielbereich 1/); assert.match(d, /ungültig unter/); assert.match(d, /ohne Zeitangabe/);
  assert.ok(read("quant/ui/ti-chart.js").includes("Szenario · keine Zeitangabe"));
  /* Datenvertrag v3: Pfad mit wachsendem Korridor aus overlays */
  const v = g.VUTIChart.viewOf({ scenarioKind: "ALTERNATIVE", overlays: { zones: [{ scenario: "ALTERNATIVE", kind: "ENTRY", low: 1, high: 2 }, { scenario: "PRIMARY", kind: "ENTRY", low: 5, high: 6 }], invalidations: [{ scenario: "ALTERNATIVE", price: 0.5, direction: "below" }], projectedPaths: [] } });
  assert.equal(v.entry.low, 1); assert.equal(v.invalidation.price, 0.5);
});

// ---------------------------------------------------------------- Datenvertrag
const V2 = "quant/data/technical-intelligence/v3/";
const hasData = existsSync(join(ROOT, V2, "meta.json"));

test("API-1 · meta, index, Reihen und Evidenzsumme vorhanden und konsistent", { skip: !hasData }, () => {
  const meta = JSON.parse(read(V2 + "meta.json"));
  assert.equal(meta.schemaVersion, "vu-ti-api-3.0.0");
  assert.ok(meta.counts.daily >= 1 && meta.counts.weekly >= 100);
  const idx = gz(V2 + "index.json.gz");
  assert.equal(idx.rows.length, meta.counts.daily + meta.counts.weekly);
  const rows = JSON.parse(read(V2 + "discover-rows.json"));
  rows.rows.forEach((r) => { assert.ok(r.rule && r.title); r.tickers.forEach((t) => assert.ok(idx.rows.some((x) => x.t === t))); });
  const ev = JSON.parse(read(V2 + "evidence-summary.json"));
  assert.ok(ev.studies.weekly.overall.n > 1000);
  assert.equal(JSON.stringify(ev).includes("calibratedProbability"), false);
});

test("API-2 · Payload: keine Wahrscheinlichkeit ohne Kalibrierung, jede Einstiegszone mit Invalidation, Texte ohne verbotene Sprache", { skip: !hasData }, () => {
  const shards = readdirSync(join(ROOT, V2, "shards")).slice(0, 60);
  let checked = 0;
  for (const f of shards) {
    const s = gz(V2 + "shards/" + f);
    for (const a of Object.values(s.instruments)) {
      assert.equal(a.confidence.calibrated, null, a.symbol);
      assert.equal(a.diagnostics.isProbability, false);
      a.scenarios.filter((x) => x.kind !== "TAIL" && x.entryZone).forEach((x) => assert.ok(x.invalidation, a.symbol + " " + x.kind));
      for (const re of FORBIDDEN) assert.ok(!re.test(a.explain.summary), a.symbol + ": " + a.explain.summary);
      assert.ok(a.chart.timestamps.length === a.chart.close.length && a.chart.close.length > 50);
      if (a.confidence.empirical && a.confidence.empirical.status === "OK") assert.ok(a.confidence.empirical.n >= 30);
      /* v3: zwei getrennte Ebenen, Datenvertrag, Elliott nur mit Enthaltung, keine "hohe Konfidenz"-Sprache */
      assert.ok(["CLEAR", "MODERATE", "AMBIGUOUS"].includes(a.clarity.level));
      assert.ok(["NOT_ESTABLISHED", "EXPERIMENTAL", "NO_DATA"].includes(a.evidenceBadge.level), "VALIDATED ist ohne bestandenen Bestaetigungstest nicht zulaessig");
      a.overlays.projectedPaths.forEach((p) => { for (let k = 2; k < p.points.length; k++) assert.ok(p.points[k].half >= p.points[k - 1].half, "Korridor waechst"); });
      if (a.pro.elliott.applicability && a.pro.elliott.applicability.abstain) { assert.equal(a.explain.wave, null); assert.equal(a.overlays.waves.consumerVisible, false); }
      checked++;
    }
  }
  assert.ok(checked > 100, "nur " + checked);
});

test("API-3 · Tagesanalyse fuer die Referenztitel mit Wochenkontext", { skip: !hasData }, () => {
  const a = gz(V2 + "shards/NV.json.gz").instruments.NVDA;
  assert.equal(a.timeframe, "1D");
  assert.ok(a.timeframes.weekly && ["ALIGNED", "COUNTER_TREND", "MIXED"].includes(a.timeframes.alignment));
  assert.equal(a.chart.closeOnly, false);
});

// ---------------------------------------------------------------- Alerts
test("AL-1 · Alerts nur bei Flankenwechsel desselben Szenarios", () => {
  const base = { scenarioId: "s1", direction: "BULLISH", confidence: "MODERATE", levels: { entryLow: 10, entryHigh: 11, invalidation: 9, confirmation: 12, target1: [13, 14] }, flags: { inEntryZone: false, invalidated: false, target1Reached: false, confirmed: false } };
  const m = { symbol: "X", asOf: "2026-10-01" };
  assert.deepEqual(Alerts.diff(base, base, m), []);
  const inZone = JSON.parse(JSON.stringify(base)); inZone.flags.inEntryZone = true;
  assert.deepEqual(Alerts.diff(base, inZone, m).map((e) => e.type), ["ENTRY_ZONE_REACHED"]);
  const inv = JSON.parse(JSON.stringify(base)); inv.flags.invalidated = true;
  assert.deepEqual(Alerts.diff(base, inv, m).map((e) => e.type), ["INVALIDATED"]);
  const flip = JSON.parse(JSON.stringify(base)); flip.direction = "BEARISH"; flip.scenarioId = "s2"; flip.flags.invalidated = true;
  assert.deepEqual(Alerts.diff(base, flip, m).map((e) => e.type), ["SCENARIO_CHANGED"], "neues Szenario startet ohne Altlasten");
  const conf = JSON.parse(JSON.stringify(base)); conf.confidence = "HIGH";
  assert.deepEqual(Alerts.diff(Object.assign({}, base, { confidence: "LOW" }), conf, m).map((e) => e.type), ["CONFIDENCE_CHANGED"]);
});

test("EX-1 · Erklaertexte stammen nur aus Fakten; Facts sind abschliessend", () => {
  const res = { symbol: "T", asOf: "2026-10-01", timeframe: "1D", price: { close: 100 }, outlook: { label: "BULLISH", structure: "CORRECTION_IN_UPTREND" }, confluence: { level: "HIGH", supporting: ["TREND"], opposing: [] },
    evidence: { why: ["a"], against: [] }, confidence: { overall: "MODERATE", empirical: null }, timeframes: { weekly: null, alignment: "UNAVAILABLE" },
    primaryScenario: { direction: "BULLISH", template: "PULLBACK", status: "APPROACHING", entryZone: { zoneLow: 95, zoneHigh: 97, displayStep: 0.5, confluence: 2 }, invalidation: { price: 92, direction: "below" }, targets: [{ zoneLow: 104, zoneHigh: 106 }], confirmation: null } };
  const s = Explain.summary(res, "$");
  assert.match(s, /95 und 97 \$/); assert.match(s, /92 \$ nicht per Schlusskurs unterschritten/); assert.match(s, /104–106 \$/);
  const nums = (s.match(/\d+/g) || []).map(Number);
  nums.forEach((n) => assert.ok([95, 97, 92, 104, 106].includes(n), "Zahl " + n + " stammt nicht aus den Fakten"));
  assert.ok(Explain.facts(res, "$").rules.includes("Keine Zahl"));
});

test("AI-1 · KI-Werkzeuge liefern nur praekomputierte Fakten mit Regel, keine Berechnung", async () => {
  const AiTools = require("../engines/ai-tools.js");
  const TIAI = require("../engines/technical/ti/ai-tools.js");
  const reg = AiTools.createToolRegistry({});
  const a = { asOf: "2026-10-01", timeframe: "1D", explain: { facts: { close: 1 }, summary: "x", evidence: null }, scenarios: [{ kind: "PRIMARY" }, { kind: "ALTERNATIVE", direction: "BEARISH", template: "PULLBACK", entryZone: { zoneLow: 1, zoneHigh: 2 }, invalidation: { price: 3 }, targets: [] }], pro: { elliott: null } };
  TIAI.register(reg, { getAnalysis: (s) => (s === "OK" ? { state: "AVAILABLE", analysis: a } : { state: "NOT_AVAILABLE", reason: "NOT_COVERED" }) });
  const r = await reg.call("getChartbild", { symbol: "OK" });
  const out = r.data;
  assert.equal(out.found, true); assert.equal(out.isProbability, false); assert.match(out.rule, /Keine Zahl/);
  const miss = await reg.call("getChartbild", { symbol: "NO" });
  assert.equal(miss.data.found, false);
});

test("AI-2 · getChartbildLage: lesend aus dem Index, Elliott-Enthaltung, Hinweis, keine Quoten", async () => {
  const AiTools = require("../engines/ai-tools.js");
  const TIAI = require("../engines/technical/ti/ai-tools.js");
  const reg = AiTools.createToolRegistry({});
  const index = gz("quant/data/technical-intelligence/v3/index.json.gz");
  const meta = JSON.parse(read("quant/data/technical-intelligence/v3/meta.json"));
  const by = Object.fromEntries(index.rows.map((r) => [r.t, r]));
  TIAI.register(reg, { getAnalysis: () => ({ state: "NOT_AVAILABLE" }), getIndexRow: (s) => ({ row: by[s] || null, index, meta }) });
  const low = index.rows.find((r) => r.elliottApplicable === "LOW");
  const out = (await reg.call("getChartbildLage", { symbol: low.t })).data;
  assert.equal(out.found, true);
  assert.equal(out.elliott.abstained, true); assert.equal(out.elliott.count, null);
  assert.equal(out.elliott.expertValidated, false); assert.equal(out.elliott.confluenceWeight, 0); assert.equal(out.elliott.status, "EXPERIMENTAL");
  assert.match(out.disclaimer, /keine Anlageberatung/); assert.equal(out.status.isProbability, false);
  assert.ok(!/"hit"|"base"|empirical|"rr"/.test(JSON.stringify(out)));
  FORBIDDEN.forEach((re) => assert.ok(!re.test(out.disclaimer + out.elliott.note + out.primaryScenario.rule), re));
  /* Ueber den echten Index: Niveaus nie <= 0 und nie weiter als Faktor 10 vom Kurs (Artefakte werden zurueckgehalten) */
  for (const r of index.rows) {
    const p = TIAI.situation(r, { index, meta }).primaryScenario;
    if (!p) continue;
    [p.invalidation, p.confirmation].concat(p.entryZone || [], p.target1 || []).filter((v) => v !== null).forEach((v) => assert.ok(v > 0 && v <= r.close * 10 && v >= r.close / 10, r.t + " " + v));
  }
  assert.equal((await reg.call("getChartbildLage", { symbol: "ZZZZZZ" })).data.found, false);
});

test("AL-2 · Merkliste: Chartbild-Ereignisse nur aus sauberem Lauf, nur beobachtete Titel, neutral formuliert", () => {
  const g = {}; new Function("window", "globalThis", read("quant/api/technical-intelligence-workspace.js"))(g, g);
  const TI = g.VUTechnicalIntelligence;
  const ev = [{ type: "ENTRY_ZONE_REACHED", symbol: "AAA", asOf: "2026-10-08" }, { type: "INVALIDATED", symbol: "BBB", asOf: "2026-10-08" },
    { type: "ENTRY_ZONE_REACHED", symbol: "CCC", asOf: "2026-10-08" }, { type: "SOMETHING_NEW", symbol: "AAA" }];
  const ok = TI.watchlistAlerts({ previousIndex: true, suppressed: null, events: ev }, ["AAA", "bbb"]);
  assert.equal(ok.state, "AVAILABLE");
  assert.deepEqual(ok.events.map((e) => [e.symbol, e.text]), [["AAA", "Kurs hat die Einstiegszone des Hauptszenarios erreicht"], ["BBB", "Hauptszenario ist per Schlusskurs ungültig geworden"]]);
  for (const s of ["BASELINE", "METHODOLOGY_CHANGED"]) assert.deepEqual(TI.watchlistAlerts({ previousIndex: true, suppressed: s, events: ev }, ["AAA"]), { state: "SUPPRESSED", reason: s, events: [] });
  assert.equal(TI.watchlistAlerts({ previousIndex: false, suppressed: null, events: ev }, ["AAA"]).state, "SUPPRESSED");
  assert.equal(TI.watchlistAlerts({ previousIndex: true, events: ev }, ["AAA"]).state, "SUPPRESSED", "ohne suppressed-Angabe kein Vertrauen");
  assert.equal(TI.watchlistAlerts({ previousIndex: true, suppressed: null, events: ev }, ["ZZZ"]).state, "NONE");
  assert.equal(TI.watchlistAlerts(null, ["AAA"]).state, "UNAVAILABLE");
  Object.values(TI.ALERT_TEXT).forEach((t) => FORBIDDEN.forEach((re) => assert.ok(!re.test(t), t)));
  /* Die ausgelieferte Datei (Migrationslauf Elliott 2.2 -> 3.2.1) meldet nichts Neues */
  assert.equal(TI.watchlistAlerts(JSON.parse(read("quant/data/technical-intelligence/v3/alerts.json")), ["NVDA", "AAPL", "A"]).state, "SUPPRESSED");
  assert.match(read("quant/app/pages.js"), /getWatchlistAlerts\(watched\)/);
});
