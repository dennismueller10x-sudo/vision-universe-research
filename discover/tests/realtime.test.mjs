/* Live-Schicht: kein LIVE ohne Live-Daten (§18). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RT = require(join(root, "discover", "engines", "realtime-source.js"));
const Contract = require(join(root, "discover", "engines", "contract.js"));
const calendar = JSON.parse(readFileSync(
  join(root, "quant", "config", "market-calendar.json"), "utf8"));

const MITTAGS = "2026-09-09T15:00:00Z";      // 11:00 New York, regulaerer Handel
const VORBOERSE = "2026-09-09T12:00:00Z";    // 08:00 New York
const NACHTS = "2026-09-09T02:00:00Z";
const SAMSTAG = "2026-09-12T15:00:00Z";

function assess(extra) {
  return RT.assess(Object.assign({ calendar: calendar, now: MITTAGS, asOf: "2026-09-08" }, extra));
}

test("ohne Gate gibt es kein LIVE - auch bei offener Boerse", () => {
  const r = assess({ gates: {}, quoteSource: { connected: true, lastTickAt: MITTAGS } });
  assert.equal(r.session, "REGULAR");
  assert.equal(r.sessionLabel, "MARKET OPEN");
  assert.equal(r.mode, "eod");
  assert.equal(r.live, false);
  assert.equal(r.reason, "gateDisabled");
});

test("Gate ohne Anzeigeerlaubnis bleibt ebenfalls aus", () => {
  const r = assess({ gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
                     policyCheck: { allowed: false, reason: "notLicensed", message: "keine Lizenz" },
                     quoteSource: { connected: true, lastTickAt: MITTAGS } });
  assert.equal(r.mode, "eod");
  assert.equal(r.reason, "notLicensed");
});

test("Gate und Erlaubnis, aber keine Quelle: unavailable", () => {
  const r = assess({ gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
                     policyCheck: { allowed: true } });
  assert.equal(r.mode, "unavailable");
  assert.equal(r.reason, "noQuoteSource");
});

test("alles vorhanden und Handel laeuft: live", () => {
  const r = assess({ gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
                     policyCheck: { allowed: true },
                     quoteSource: { connected: true, lastTickAt: MITTAGS } });
  assert.equal(r.mode, "live");
  assert.equal(r.live, true);
});

test("alter Tick waehrend des Handels ist verzoegert, nicht live", () => {
  const r = assess({ gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
                     policyCheck: { allowed: true },
                     quoteSource: { connected: true, lastTickAt: "2026-09-09T14:50:00Z" } });
  assert.equal(r.mode, "delayed");
  assert.equal(r.live, false);
});

test("Sitzungen werden benannt: Vorboerse, Nachts, Wochenende", () => {
  assert.equal(assess({ now: VORBOERSE }).sessionLabel, "PRE-MARKET");
  assert.equal(assess({ now: NACHTS }).sessionLabel, "MARKET CLOSED");
  assert.equal(assess({ now: SAMSTAG }).sessionLabel, "MARKET CLOSED");
});

test("ausserhalb der regulaeren Sitzung gibt es kein LIVE", () => {
  const r = assess({ now: VORBOERSE, gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
                     policyCheck: { allowed: true },
                     quoteSource: { connected: true, lastTickAt: VORBOERSE } });
  assert.equal(r.mode, "eod");
  assert.equal(r.reason, "extendedSession");
});

test("Realtime- und abgeleitete Felder sind getrennt benannt (§11)", () => {
  const gemeinsam = RT.REALTIME_FIELDS.filter((f) => RT.DERIVED_FIELDS.indexOf(f) !== -1);
  assert.equal(gemeinsam.length, 0);
  assert.ok(RT.REALTIME_FIELDS.indexOf("price") !== -1);
  assert.ok(RT.DERIVED_FIELDS.indexOf("leadershipScore") !== -1);
});

test("ein Tick aendert Kurs und Hochsignal - aber keinen Score", () => {
  const card = Contract.toCard(Contract.normalizeStock({
    symbol: "TEST", dataMode: "mock",
    price: Contract.field(100), metrics: { leadershipScore: 70, distanceTo52wHigh: -0.05 }
  }));
  const now = Date.parse(MITTAGS);
  const next = RT.applyTick(card, { price: 111, previousClose: 100, at: now },
                            { previous52WeekHigh: 110, previous52WeekLow: 60, now: now });
  assert.equal(next.price.value, 111);
  assert.ok(Math.abs(next.changePercent.value - 11) < 1e-9);
  assert.equal(next.signals.new52WeekHigh, true);
  assert.equal(next.metrics.leadershipScore, 70, "ein Tick rechnet keinen Score neu");
  assert.equal(card.price.value, 100, "der urspruengliche Datensatz bleibt unangetastet");
});

test("ohne Referenzniveau bleibt das Hochsignal, wie es war", () => {
  const card = Contract.toCard(Contract.normalizeStock({
    symbol: "TEST", dataMode: "real",
    price: Contract.field(null, "WITHHELD_REDISTRIBUTION"),
    metrics: { distanceTo52wHigh: -0.05 }
  }));
  const next = RT.applyTick(card, { price: 200, at: Date.now() }, {});
  assert.equal(next.signals.new52WeekHigh, false);
  assert.equal(next.realtime.reason, "referenceLevelWithheld");
});

test("ohne Kurs im Tick passiert nichts", () => {
  const card = Contract.toCard(Contract.normalizeStock({ symbol: "T", dataMode: "mock" }));
  assert.equal(RT.applyTick(card, { price: null }), card);
});

test("ohne quoteFn wird keine Abfrage gestartet", () => {
  const source = RT.createRealtimeSource({ gates: {}, calendar: calendar, now: MITTAGS });
  assert.equal(source.start(1000), false);
  assert.equal(source.state().mode, "eod");
  source.stop();
});
