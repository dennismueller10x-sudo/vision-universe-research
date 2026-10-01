/* Quant Radar (quant-radar-1.0.0): taegliche Ereignisse, Setup-Lebenszyklus,
   Alert-Vertrag und Evidenz-Status. Geprueft wird gegen die
   veroeffentlichten Artefakte, nicht gegen eingefrorene Zahlen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const Radar = require("../engines/quant-radar.js");
const Service = require("../api/product-services.js");
const Policy = require("../engines/display-policy.js");
const Query = require("../engines/query.js");
const gz = (p) => JSON.parse(gunzipSync(readFileSync(new URL(p, root))));
const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(new URL(p.slice(1), root), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(new URL(p.slice(1), root))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});
const radar = gz("quant/data/product/radar-v1.json.gz");
const lifecycle = gz("quant/data/product/setup-lifecycle-v1.json.gz");
const evidence = JSON.parse(readFileSync(new URL("quant/data/product/evidence-status-v1.json", root), "utf8"));

test("jedes veroeffentlichte Ereignis erfuellt den Alert-Vertrag", () => {
  assert.equal(radar.schemaVersion, "quant-radar-1.0.0");
  assert.ok(radar.events.length > 0, "ein Radar ohne Ereignis waere ein Fehler im Build");
  for (const e of radar.events) {
    assert.deepEqual(Radar.eventViolations(e), [], e.id);
    for (const f of ["securityId", "ticker", "eventType", "occurredAt", "previousState", "currentState", "explanation", "evidence", "nextCondition"])
      assert.ok(f in e, f + " fehlt in " + e.id);
    assert.equal(e.delivery, "NOT_CONFIGURED", "Zustellung gibt es noch keine - das Ereignis darf keine behaupten");
  }
  assert.equal(radar.measures.ALERT_READY_EVENTS, radar.events.length);
});

test("der Vertrag weist verbotene Felder und unbekannte Typen zurueck", () => {
  const ok = radar.events[0];
  assert.ok(Radar.eventViolations({ ...ok, hitRate: 0.7 }).includes("FORBIDDEN_KEY_hitRate"));
  assert.ok(Radar.eventViolations({ ...ok, expectedReturn: 0.1 }).includes("FORBIDDEN_KEY_expectedReturn"));
  assert.ok(Radar.eventViolations({ ...ok, eventType: "BUY_SIGNAL" }).includes("UNKNOWN_EVENT_TYPE"));
  assert.ok(Radar.eventViolations({ ...ok, evidence: [] }).includes("EVIDENCE_REQUIRED"));
  const { nextCondition, ...ohne } = ok;
  assert.ok(Radar.eventViolations(ohne).includes("MISSING_nextCondition"));
});

test("jedes Setup-Ereignis ist ein Wechsel zwischen den letzten beiden Setup-Staenden", () => {
  const dir = new URL("quant/data/product/setup-observation-history/setup-mapping-1.0.0/", root);
  const dates = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
  const cur = gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + dates.at(-1) + ".json.gz").rows;
  const prev = gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + dates.at(-2) + ".json.gz").rows;
  const setupEvents = radar.events.filter((e) => e.source === "SETUP");
  assert.ok(setupEvents.length > 0);
  for (const e of setupEvents) {
    assert.equal(e.occurredAt, dates.at(-1));
    assert.equal(e.previousState.setupState, prev[e.ticker][0], e.id);
    assert.equal(e.currentState.setupState, cur[e.ticker][0], e.id);
    assert.notEqual(e.previousState.setupState, e.currentState.setupState);
    if (e.eventType === "SETUP_CONFIRMED") assert.equal(e.currentState.setupState, "CONFIRMED");
    if (e.eventType === "SETUP_NEW") assert.equal(e.currentState.setupState, "SETUP_FORMING");
  }
});

test("geschlossene Engine-Zustaende werden nicht aus eigener Rechnung ausgerufen", () => {
  const typ = Object.fromEntries(radar.eventTypes.map((t) => [t.id, t]));
  assert.equal(typ.SETUP_INVALIDATED.state, "CLOSED");
  assert.equal(typ.SETUP_INVALIDATED.reason, "PATH_DEPENDENT_STATES_NOT_ACTIVATED");
  assert.equal(radar.events.filter((e) => e.eventType === "SETUP_INVALIDATED").length, 0);
  if (typ.PATTERN_MATCH_NEW.state === "CLOSED") assert.equal(radar.events.filter((e) => e.eventType === "PATTERN_MATCH_NEW").length, 0);
  /* Ein Lebenszyklus-Zustand jenseits der entscheidbaren Stufe steht nicht in der Tabelle. */
  for (const row of Object.values(lifecycle.rows)) assert.ok(["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED"].includes(row[0]));
  assert.equal(lifecycle.pathTier.state, "CLOSED");
});

test("die Kartenreihenfolge ist die offen gelegte Sortierregel - keine Note", () => {
  assert.equal(radar.priorityRule.version, "radar-priority-1.0.0");
  for (let i = 1; i < radar.cards.length; i++) assert.ok(Radar.compareCards(radar.cards[i - 1], radar.cards[i]) <= 0, "Karte " + i + " steht falsch");
  const keys = JSON.stringify(radar.cards[0]);
  for (const verboten of ["score\"", "rank\"", "grade", "totalScore", "composite"]) assert.ok(!keys.includes(verboten), "Karte traegt " + verboten);
});

test("Einstieg, Stop und Ziele einer Karte stammen aus dem veroeffentlichten Trade-Setup", () => {
  const card = radar.cards.find((c) => c.trade && c.trade.state === "AVAILABLE");
  assert.ok(card, "keine angereicherte Karte");
  const shard = gz("quant/data/product/technical-signals-v1/" + (card.ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_") + ".json.gz");
  const ts = shard.instruments[card.ticker].bundle.tradeSetup;
  assert.deepEqual(card.trade.entry, [ts.entry.zoneLow, ts.entry.zoneHigh]);
  assert.equal(card.trade.invalidation, ts.analysisInvalidation.price);
  assert.deepEqual(card.trade.targets[0], [ts.targets[0].zoneLow, ts.targets[0].zoneHigh]);
});

test("Vergleichsfaelle einer Karte erscheinen nur ueber der Schwelle", () => {
  for (const c of radar.cards) {
    if (!c.replay || c.replay.sufficient) continue;
    for (const k of ["positiveShare", "medianReturn", "medianDrawdown", "chanceRisk"]) assert.equal(c.replay[k] ?? null, null, c.ticker + " " + k);
  }
  assert.ok(radar.cards.some((c) => c.replay && c.replay.sufficient && c.replay.completed >= 10));
});

test("Lebenszyklus: 'seit' ist der erste Stichtag der laufenden Folge", () => {
  const dates = lifecycle.snapshots;
  const snaps = dates.map((d) => gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + d + ".json.gz").rows);
  let geprueft = 0;
  for (const [t, row] of Object.entries(lifecycle.rows).slice(0, 400)) {
    const k = dates.indexOf(row[1]);
    assert.ok(k >= 0, t);
    for (let i = k; i < dates.length; i++) assert.equal(snaps[i][t][0], row[0], t + " " + dates[i]);
    if (k > 0 && snaps[k - 1][t]) { assert.notEqual(snaps[k - 1][t][0], row[0]); assert.equal(row[3], snaps[k - 1][t][0]); assert.equal(row[2], 0); }
    else { assert.equal(row[2], 1, "eine Folge ab der ersten Beobachtung ist eine Untergrenze"); assert.equal(row[3], null); }
    geprueft++;
  }
  assert.ok(geprueft > 100);
});

test("Dienste liefern Radar, Lebenszyklus und Evidenz-Status", async () => {
  const r = await api.getQuantRadar();
  assert.equal(r.state, "AVAILABLE");
  assert.equal(r.dropped, 0);
  assert.equal(r.cards.length, radar.cards.length);
  const l = await api.getSetupLifecycle("NVDA");
  assert.equal(l.state, "AVAILABLE");
  assert.equal(l.current, lifecycle.rows.NVDA[0]);
  assert.equal((await api.getSetupLifecycle("ZZZZZZ")).state, "UNAVAILABLE");
  const s = await api.getEvidenceStatus();
  assert.equal(s.state, "AVAILABLE");
});

test("Evidenz-Status: vier Arten, getrennt; geschlossene Arten nennen gemessene Bedingungen", () => {
  assert.deepEqual(evidence.kinds.map((k) => k.id), ["HISTORICAL_REPLAY", "PATTERN_EVIDENCE", "STRATEGY_BACKTEST", "SETUP_BACKTEST"]);
  const byId = Object.fromEntries(evidence.kinds.map((k) => [k.id, k]));
  assert.equal(byId.STRATEGY_BACKTEST.state, "WITHHELD");
  assert.equal(byId.SETUP_BACKTEST.state, "WITHHELD");
  for (const k of [byId.STRATEGY_BACKTEST, byId.SETUP_BACKTEST]) {
    assert.ok(k.checks.length >= 3);
    assert.ok(k.checks.some((c) => c.state === "FAIL"), "eine geschlossene Art ohne fehlschlagende Bedingung waere ein Widerspruch");
    for (const c of k.checks) assert.ok(c.required && c.measured !== undefined, c.id);
  }
  /* Keine Zahl einer geschlossenen Art. */
  for (const k of [byId.STRATEGY_BACKTEST, byId.SETUP_BACKTEST]) for (const verboten of ["hitRate", "cagr", "sharpe", "medianReturn", "positiveShare"]) assert.ok(!JSON.stringify(k).includes(verboten));
  assert.ok(evidence.measures.HISTORICAL_REPLAY_COVERAGE.sufficient.m6 > 0);
});
