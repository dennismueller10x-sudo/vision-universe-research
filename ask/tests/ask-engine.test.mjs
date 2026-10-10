/* Vision Universe — ask/tests/ask-engine.test.mjs
   Die Auswertung laeuft auf einem kleinen Universum aus Pappe, aber mit
   der echten Screener-Engine und der echten Uebersetzung. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { translate } from "../../workers/vu-ask/src/translate.mjs";

const require = createRequire(import.meta.url);
const Engine = require("../../screener/engine/engine.js");
const Ask = require("../engine.js");

const N = 4;
const col = (vals) => vals;
function artifact() {
  const cols = { s: ["AAA", "BBB", "CCC", "DDD"], n: ["Alpha", "Beta", "Gamma", "Delta"], co: Array(N).fill("US"), ipo: Array(N).fill("2000-01-01"),
    mcap: col([5e8, 1.5e9, 5e9, 4e8]), newHigh: col([true, true, true, false]), fQuality: col([60, 40, 70, 80]), fcfGrowth: col([0.3, null, 0.1, 0.2]), price: col([10, 20, 30, 40]) };
  return { schema: "vu-screener-universe-1.0.0", cols, dict: {} };
}
const ds = Engine.createDataset(artifact());

function screen(mode, extra = {}) {
  return translate({ kind: "screen", understood: "", tickers: [], show: ["qualityFactor"], sort: { field: "marketCap", dir: "desc" }, limit: 25, missing: [], notes: [],
    filters: [{ field: "newHigh52w", op: "is", value: null, value2: null, values: [], flag: true },
      { field: "marketCap", op: "between", value: 3e8, value2: 2e9, values: [], flag: null }],
    supertrader: mode ? { strategy: "MINERVINI_VCP", mode } : { strategy: "NONE", mode: "none" }, ...extra });
}

const complete = { asOf: "2026-09-28", strategies: { MINERVINI_VCP: { open: [], scanner: { top: [{ symbol: "BBB", stage: "WATCH" }], symbols: ["BBB", "CCC"] } } } };
const partial = { asOf: "2026-09-28", strategies: { MINERVINI_VCP: { open: [], scanner: { top: [{ symbol: "BBB", stage: "WATCH" }] } } } };

test("Filter der Frage laufen durch die Screener-Engine", () => {
  const res = Ask.runScreen(ds, screen(null), null);
  assert.deepEqual(res.rows.map((r) => r.symbol), ["BBB", "AAA"]);
  assert.deepEqual(res.columns, ["marketCap", "newHigh52w", "qualityFactor"]);
  assert.equal(res.rows[0].values.qualityFactor, 40);
});

test("Supertrader 'require' behaelt nur Titel, die die Strategie erfuellen", () => {
  const res = Ask.runScreen(ds, screen("require"), complete);
  assert.deepEqual(res.rows.map((r) => [r.symbol, r.strategy.label]), [["BBB", "Beobachten"]]);
  assert.equal(res.total, 2);
  assert.equal(res.matched, 1);
  assert.equal(res.note, null);
});

test("Unvollstaendige Signaldatei: fehlend heisst 'nicht geprueft', nicht 'nein'", () => {
  const res = Ask.runScreen(ds, screen("show"), partial);
  assert.deepEqual(res.rows.map((r) => [r.symbol, r.strategy.pass, r.strategy.label]), [["BBB", true, "Beobachten"], ["AAA", null, "nicht geprüft"]]);
  assert.match(res.note, /Top 60/);
  const full = Ask.runScreen(ds, screen("show"), complete);
  assert.deepEqual(full.rows.map((r) => r.strategy.label), ["Beobachten", "erfüllt nicht"]);
});

test("Einzelfrage: Werte je Ticker, unbekannte Ticker ehrlich benannt", () => {
  const r = translate({ kind: "stock", understood: "", filters: [], tickers: ["AAA", "ZZZ"], show: ["fcfGrowth"], supertrader: { strategy: "NONE", mode: "none" },
    sort: { field: "none", dir: "desc" }, limit: 25, missing: [], notes: [] });
  const res = Ask.runStock(ds, r, null);
  assert.deepEqual(res.stocks.map((s) => [s.symbol, s.found, s.values && s.values.fcfGrowth]), [["AAA", true, 0.3], ["ZZZ", false, undefined]]);
});

test("Link in den Screener traegt genau die Filter", () => {
  const url = Ask.screenerUrl(screen(null));
  assert.ok(url.startsWith("/screener/?"));
  assert.match(decodeURIComponent(url), /f=newHigh52w:is:1/);
  assert.match(decodeURIComponent(url), /f=marketCap:between:300000000:2000000000/);
});

/* Chartbild-Werkzeug: Zeilen wie im echten index.json.gz (vu-ti-api-3), gekuerzt */
const TI_INDEX = { schemaVersion: "vu-ti-api-3.0.0", methodologyKey: JSON.stringify({ elliott: "elliott-3.2.1" }), rows: [
  { t: "AAA", tf: "1W", asOf: "2026-10-01", close: 166.68, outlook: "BULLISH", structure: "CORRECTION_IN_UPTREND", confidence: "LOW", template: "CONTINUATION", status: "EXTENDED", direction: "BULLISH",
    entry: [148.5, 154.5], invalidation: 145, t1: [171, 175], rr: 3.27, elliott: "WXY:Y", elliottApplicable: "LOW", evidence: "NOT_ESTABLISHED", empirical: { n: 22127, hit: 0.3989, base: 0.404 },
    alerts: { levels: { entryLow: 148.5, entryHigh: 154.5, invalidation: 145, confirmation: 159, target1: [171, 175] } } },
  { t: "BBB", tf: "1W", asOf: "2026-10-01", close: 2.44, outlook: "BEARISH", structure: "DOWNTREND_ADVANCING", confidence: "HIGH", direction: "BEARISH",
    entry: [1.9, 3], invalidation: 4.6, t1: [-2695.2, -2694.56], elliott: "WXY:done", elliottApplicable: "HIGH", evidence: "EXPERIMENTAL",
    alerts: { levels: { confirmation: 949.73 } } },
  { t: "CCC", tf: "1W", asOf: "2024-10-11", close: 10, outlook: "NEUTRAL", structure: "SIDEWAYS_RANGE", elliottApplicable: null }
] };
const TI_META = { elliott: { status: "EXPERIMENTAL_STRUCTURE_MODEL", confluenceWeight: 0 } };

test("Chartbild-Werkzeug: strukturierte Lage, Elliott-Enthaltung, kein Freitext und keine Quoten", () => {
  const r = translate({ kind: "stock", understood: "", filters: [], tickers: ["AAA", "BBB", "CCC", "ZZZ"], show: [], supertrader: { strategy: "NONE", mode: "none" }, chartbild: true,
    sort: { field: "none", dir: "desc" }, limit: 25, missing: [], notes: [] });
  assert.equal(r.chartbild, true);
  const res = Ask.runChartbild(TI_INDEX, TI_META, r);
  assert.equal(res.tool, "getChartbildLage");
  const [a, b, c, z] = res.stocks;
  assert.deepEqual([a.outlook, a.structure.label], [{ value: "BULLISH", label: "Aufwärts" }, "Rücksetzer im Aufwärtstrend"]);
  assert.deepEqual([a.primaryScenario.entryZone, a.primaryScenario.invalidation, a.primaryScenario.confirmation, a.primaryScenario.target1], [[148.5, 154.5], 145, 159, [171, 175]]);
  // Elliott: enthaelt sich bei LOW, nennt die Zaehlung nur bei HIGH/MODERATE - immer experimentell
  assert.deepEqual([a.elliott.abstained, a.elliott.count, a.elliott.expertValidated, a.elliott.confluenceWeight, a.elliott.engine], [true, null, false, 0, "elliott-3.2.1"]);
  assert.deepEqual([b.elliott.abstained, b.elliott.count, b.elliott.status], [false, "WXY:done", "EXPERIMENTAL"]);
  // Unplausible Niveaus werden zurueckgehalten, nicht gezeigt
  assert.equal(b.primaryScenario.target1, null); assert.equal(b.primaryScenario.confirmation, null);
  assert.deepEqual(b.primaryScenario.withheld, ["confirmation", "target1"]);
  assert.equal(c.stale, true); assert.equal(a.stale, false);
  assert.deepEqual([z.found, z.reason], [false, "NOT_COVERED"]);
  for (const x of res.stocks) {
    assert.match(x.disclaimer, /keine Prognose/); assert.match(x.disclaimer, /keine Anlageberatung/);
    assert.equal(x.status.isProbability, false); assert.equal(x.status.isAdvice, false);
    const json = JSON.stringify(x);
    assert.ok(!/"hit"|"base"|"rr"|empirical/.test(json), "keine Trefferquoten im Werkzeug");
  }
  const said = res.stocks.map(Ask.chartbildSentence).join(" ");
  assert.match(said, /AAA: Ausblick Aufwärts, Rücksetzer im Aufwärtstrend\. Hauptszenario mit Zone 148,50.\$ bis 154,50.\$; es gilt, solange 145,00.\$ nicht per Schlusskurs unterschritten wird\. Elliott: keine belastbare Zählung\./);
  assert.match(said, /BBB: .*überschritten.*Elliott \(experimentell\): Strukturklarheit hoch\./);
  assert.match(said, /ZZZ: Für diesen Titel liegt kein Chartbild vor\./);
  assert.doesNotMatch(said, /kaufen|verkaufen|Kaufsignal|Verkaufssignal|wird steigen|wird fallen|%/i);
});
