/* =========================================================================
   REALTIME §2, §9, §11, §23 — DIE ENTSCHEIDUNGEN

   Vier Bausteine, die je fuer sich pruefbar sind und es deshalb auch
   sein muessen:

     fallback-engine    welche Datenklasse?
     connection-state   in welchem Zustand?
     bar-merge          wie wird aus zwei Welten eine Reihe?
     chart-adapter      muss ueberhaupt gezeichnet werden?

   Der Schwerpunkt liegt auf den Faellen, in denen ein naives System
   etwas Falsches zeichnet, ohne dass es auffaellt: doppelte Kerzen,
   Split-Spruenge, gemischte Bereinigung, Blick in die Zukunft.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Capabilities = require("../engines/capabilities.js");
const Negotiation = require("../engines/realtime/capability-negotiation.js");
const Fallback = require("../engines/realtime/fallback-engine.js");
const Connection = require("../engines/realtime/connection-state.js");
const BarMerge = require("../engines/realtime/bar-merge.js");
const ChartAdapter = require("../engines/realtime/chart-adapter.js");

const CALENDAR = JSON.parse(readFileSync(join(ROOT, "quant/config/market-calendar.json"), "utf8"));
const GATES_ON = { ENABLE_LIVE_MARKET_DATA: true };

function negotiationWith(market) {
  return Negotiation.negotiate({
    capabilities: Capabilities.declare("testprovider", { market: market }),
    gates: GATES_ON
  });
}

const ALLES = { historicalDaily: true, intraday: true, realtime: true, websocket: true };

/* ================================================== Fallback-Engine === */

test("E01 · Die beste verfuegbare Klasse gewinnt", () => {
  const r = Fallback.select({ negotiation: negotiationWith(ALLES) });
  assert.equal(r.selected, "REALTIME_STREAM");
  assert.equal(r.downgraded, false);
});

test("E02 · Ein Laufzeitfehler nimmt genau eine Sprosse heraus", () => {
  const r = Fallback.select({
    negotiation: negotiationWith(ALLES),
    runtime: { REALTIME_STREAM: { ok: false, reason: "transportFailed" } }
  });
  assert.equal(r.selected, "REALTIME_QUOTE");
  assert.equal(r.downgraded, true);
  assert.equal(r.downgradedFrom, "REALTIME_STREAM");
});

test("E03 · Ein Anbieter ohne WebSocket steigt nicht ab — er ist so gebaut", () => {
  const r = Fallback.select({
    negotiation: negotiationWith({ historicalDaily: true, intraday: true,
                                   realtime: true, websocket: false })
  });
  assert.equal(r.selected, "REALTIME_QUOTE");
  assert.equal(r.downgraded, false,
    "Eine nie vorhandene Faehigkeit ist kein Abstieg.");
  assert.equal(r.bestPossible, "REALTIME_QUOTE");
});

test("E04 · Ohne jede Klasse ist die Antwort UNAVAILABLE, nicht leer", () => {
  const r = Fallback.select({
    negotiation: negotiationWith({ historicalDaily: false, intraday: false,
                                   realtime: false, websocket: false })
  });
  assert.equal(r.selected, "UNAVAILABLE");
  assert.equal(r.reason, "capabilityDeclaredMissing");
  assert.equal(r.ladder.length, 4);
});

test("E05 · Es gibt keine Mock-Sprosse auf der Leiter", () => {
  const r = Fallback.select({ negotiation: negotiationWith(ALLES) });
  const namen = r.ladder.map((x) => x.dataClass).join(" ");
  assert.equal(/mock|synth|demo|sample/i.test(namen), false);
  assert.equal(/mock/i.test(JSON.stringify(Fallback.REASONS)), false);
});

test("E06 · Ein verfallener Stand disqualifiziert seine Klasse, ein geschlossener Markt nicht", () => {
  const verfallen = Fallback.select({
    negotiation: negotiationWith(ALLES),
    staleness: { REALTIME_STREAM: { level: "STALE" } }
  });
  assert.equal(verfallen.selected, "REALTIME_QUOTE");

  const geschlossen = Fallback.select({
    negotiation: negotiationWith(ALLES),
    staleness: { REALTIME_STREAM: { level: "MARKET_CLOSED" } }
  });
  assert.equal(geschlossen.selected, "REALTIME_STREAM");
});

test("E07 · Abstieg und Aufstieg werden benannt, nicht nur vollzogen", () => {
  const oben = Fallback.select({ negotiation: negotiationWith(ALLES) });
  const unten = Fallback.select({
    negotiation: negotiationWith(ALLES),
    runtime: { REALTIME_STREAM: { ok: false, reason: "rateLimited" },
               REALTIME_QUOTE: { ok: false, reason: "rateLimited" } }
  });
  const ab = Fallback.compare(oben, unten);
  assert.equal(ab.direction, "downgrade");
  assert.equal(ab.from, "REALTIME_STREAM");
  assert.equal(ab.to, "INTRADAY");
  assert.equal(ab.reason, "rateLimited");

  const auf = Fallback.compare(unten, oben);
  assert.equal(auf.direction, "upgrade");
});

test("E08 · Was nur an der Laufzeit scheitert, gilt als wiedergewinnbar", () => {
  const r = Fallback.select({
    negotiation: negotiationWith(ALLES),
    runtime: { REALTIME_STREAM: { ok: false, reason: "timeout" } }
  });
  assert.deepEqual(r.recoverable, ["REALTIME_STREAM"]);

  /* Eine ungepruefte Faehigkeit ist NICHT wiedergewinnbar - es gibt
     nichts zurueckzugewinnen, es wurde nie gemessen. */
  const ungeprueft = Fallback.select({
    negotiation: negotiationWith({ historicalDaily: true, intraday: true,
                                   realtime: null, websocket: null })
  });
  assert.deepEqual(ungeprueft.recoverable, []);
});

/* =============================================== Verbindungsautomat === */

test("E09 · Unmoegliche Uebergaenge finden nicht statt", () => {
  const m = Connection.createMachine();
  assert.equal(m.state, "IDLE");
  const direkt = m.live();
  assert.equal(direkt.changed, false);
  assert.equal(direkt.reason, "forbiddenTransition");
  assert.equal(m.snapshot().rejectedTransitions, 1);
});

test("E10 · LIVE entsteht nur ueber CONNECTING und wird beim Verlassen vermerkt", () => {
  const m = Connection.createMachine();
  m.connect();
  m.live();
  assert.equal(m.state, "LIVE");
  assert.equal(m.snapshot().allowsLiveLabel, true);
  m.degrade("dataAging");
  assert.equal(m.snapshot().allowsLiveLabel, false);
  const verlauf = m.history();
  assert.equal(verlauf[verlauf.length - 1].from, "LIVE");
  assert.equal(verlauf[verlauf.length - 1].reason, "dataAging");
});

test("E11 · Der Wiederaufbau zaehlt Versuche und gibt nach der Schwelle auf", () => {
  const m = Connection.createMachine({ maxReconnectAttempts: 2, backoffMs: [10, 20, 40] });
  m.connect(); m.live();
  assert.equal(m.lost("x").exhausted, false);
  assert.equal(m.lost("x").exhausted, false);
  const dritter = m.lost("x");
  assert.equal(dritter.exhausted, true);
  assert.equal(dritter.waitMs, 40);
  m.fallback("INTRADAY", "reconnectExhausted");
  assert.equal(m.state, "FALLBACK_INTRADAY");
  assert.equal(m.snapshot().fallbackReason, "reconnectExhausted");
});

test("E12 · Der Backoff waechst und deckelt", () => {
  const m = Connection.createMachine({ backoffMs: [1, 2, 4] });
  assert.equal(m.backoffFor(1), 1);
  assert.equal(m.backoffFor(3), 4);
  assert.equal(m.backoffFor(99), 4);
});

test("E13 · Ein erneuter Echtzeitversuch ist erst nach der Wartezeit faellig", () => {
  let t = 0;
  const m = Connection.createMachine({ now: () => t, retryRealtimeAfterMs: 1000 });
  m.connect(); m.live(); m.fallback("INTRADAY", "x");
  assert.equal(m.realtimeRetryDue(), false);
  t = 1500;
  assert.equal(m.realtimeRetryDue(), true);
  m.retryRealtime();
  assert.equal(m.state, "CONNECTING");
});

test("E14 · Der Verlauf laeuft nicht ueber", () => {
  const m = Connection.createMachine({ maxReconnectAttempts: 100000 });
  m.connect();
  for (let i = 0; i < 500; i++) m.lost("x");
  assert.ok(m.history().length <= 200);
});

/* ==================================================== Zusammenfuehren === */

const T0 = Date.parse("2026-09-08T18:00:00Z");   // Dienstag 14:00 ET
function serie(opts) {
  return BarMerge.createSeries(Object.assign({
    timeframe: "5m", interval: "5min", calendar: CALENDAR,
    adjustmentStatus: "raw", now: () => T0
  }, opts || {}));
}
function bar(minutenVorT0, close, extra) {
  return Object.assign({
    timestamp: new Date(T0 - minutenVorT0 * 60000).toISOString(),
    open: close, high: close, low: close, close: close, volume: 100,
    adjustmentStatus: "raw"
  }, extra || {});
}

test("E15 · Derselbe Zeiteimer erzeugt keine zweite Kerze", () => {
  const s = serie();
  s.seed([bar(30, 100), bar(25, 101)], "INTRADAY");
  assert.equal(s.length(), 2);
  const r = s.applyBar(bar(25, 101), "INTRADAY");
  assert.equal(r.action, "ignored");
  assert.equal(r.reason, "duplicate");
  assert.equal(s.length(), 2);
  assert.equal(s.stats().duplicates, 1);
});

test("E16 · Zwei Zeitstempel im selben Intervall fallen in dieselbe Kerze", () => {
  const s = serie();
  s.applyBar(bar(30, 100), "INTRADAY");        // 13:30
  s.applyBar(bar(28, 102), "INTRADAY");        // 13:32 - selber 5-Minuten-Eimer
  assert.equal(s.length(), 1);
  assert.equal(s.last().close, 102, "Die spaetere Bar ersetzt die fruehere im Eimer.");
});

test("E17 · Eine verspaetete Bar wird einsortiert, nicht angehaengt", () => {
  const s = serie();
  s.seed([bar(30, 100), bar(20, 102)], "INTRADAY");
  const r = s.applyBar(bar(25, 101), "INTRADAY");
  assert.equal(r.action, "inserted");
  const buckets = s.bars().map((b) => b.bucket);
  assert.deepEqual(buckets.slice(), buckets.slice().sort());
  assert.equal(s.stats().outOfOrder, 1);
});

test("E18 · Bestaetigt schlaegt vorlaeufig — und nie umgekehrt", () => {
  const s = serie();
  s.applyTick({ price: 99, timestamp: new Date(T0 - 60000).toISOString() });
  assert.equal(s.last().confirmed, false);
  const ersetzt = s.applyBar(bar(1, 105), "INTRADAY");
  assert.equal(ersetzt.action, "replaced");
  assert.equal(s.last().confirmed, true);
  assert.equal(s.last().close, 105);

  /* Der Rueckweg ist versperrt: ein Tick bewegt keinen bestaetigten Schluss. */
  const zurueck = s.applyTick({ price: 88, timestamp: new Date(T0 - 60000).toISOString() });
  assert.equal(zurueck.action, "ignored");
  assert.equal(zurueck.reason, "bucketConfirmed");
  assert.equal(s.last().close, 105);
});

test("E19 · Ein Zeitstempel aus der Zukunft wird abgelehnt (kein Look-ahead)", () => {
  const s = serie();
  const r = s.applyBar({ timestamp: new Date(T0 + 3600000).toISOString(), close: 500,
                         adjustmentStatus: "raw" }, "INTRADAY");
  assert.equal(r.action, "rejected");
  assert.equal(r.reason, "future");
  assert.equal(s.length(), 0);
  assert.equal(s.applyTick({ price: 500, timestamp: T0 + 3600000 }).reason, "future");
});

test("E20 · Gemischte Bereinigung wird abgelehnt, nicht umgerechnet", () => {
  const s = serie();
  s.applyBar(bar(30, 100), "INTRADAY");
  const r = s.applyBar(bar(25, 90, { adjustmentStatus: "TOTAL_RETURN" }), "INTRADAY");
  assert.equal(r.action, "rejected");
  assert.equal(r.reason, "adjustmentMismatch");
  assert.equal(s.adjustmentStatus(), "raw");
  assert.equal(s.stats().rejectedAdjustment, 1);
});

test("E21 · Ein Split macht die Reihe nachladepflichtig statt einen Sprung zu zeichnen", () => {
  const s = serie();
  s.seed([bar(30, 100), bar(25, 100)], "INTRADAY");
  assert.equal(s.requiresReload(), false);
  const r = s.applyBar(bar(20, 50, { splitFactor: 2 }), "INTRADAY");
  assert.equal(r.requiresReload, true);
  assert.match(s.reloadReason(), /^split:/);
  /* Solange nachzuladen ist, faltet kein Tick mehr in die Reihe: er
     traegt den neuen Massstab, die Reihe den alten. */
  assert.equal(s.applyTick({ price: 51, timestamp: T0 - 30000 }).reason, "awaitingReload");
  s.clearReload();
  assert.equal(s.requiresReload(), false);
});

test("E22 · Ein Tick faltet Hoch, Tief, Schluss und Volumen", () => {
  const s = serie();
  const ts = T0 - 120000;
  s.applyTick({ price: 100, timestamp: ts, size: 10 });
  s.applyTick({ price: 105, timestamp: ts + 1000, size: 5 });
  s.applyTick({ price: 98, timestamp: ts + 2000, size: 5 });
  const b = s.last();
  assert.equal(b.open, 100);
  assert.equal(b.high, 105);
  assert.equal(b.low, 98);
  assert.equal(b.close, 98);
  assert.equal(b.volume, 20);
  assert.equal(b.confirmed, false);
});

test("E23 · Tagesbars werden nach Handelstag gebuendelt", () => {
  const s = BarMerge.createSeries({ timeframe: "1D", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => T0 });
  s.seed([{ date: "2026-09-04", close: 100, adjustmentStatus: "raw" },
          { date: "2026-09-08", close: 101, adjustmentStatus: "raw" }], "EOD");
  assert.deepEqual(s.bars().map((b) => b.bucket), ["2026-09-04", "2026-09-08"]);
  assert.equal(s.applyBar({ date: "2026-09-08", close: 101, adjustmentStatus: "raw" }, "EOD").reason,
               "duplicate");
});

test("E24 · Die Zeitumstellung verschiebt keinen Eimer", () => {
  /* 8. Maerz 2026 ist der US-Umstellungstag; der 9. ist der erste
     Handelstag danach. Die Eroeffnung liegt an beiden Tagen um 09:30
     Ortszeit - nur der UTC-Abstand aendert sich. */
  const vorher = BarMerge.bucketOf({ timestamp: "2026-03-06T14:30:00Z" },
    { timeframe: "5m", interval: "5min", timezone: "America/New_York", sessionStartMin: 570 });
  const nachher = BarMerge.bucketOf({ timestamp: "2026-03-09T13:30:00Z" },
    { timeframe: "5m", interval: "5min", timezone: "America/New_York", sessionStartMin: 570 });
  assert.equal(vorher, "2026-03-06T09:30");
  assert.equal(nachher, "2026-03-09T09:30");
});

test("E25 · Der Nachladebereich beginnt bei der letzten bestaetigten Bar", () => {
  const s = serie();
  s.seed([bar(60, 100), bar(55, 101)], "INTRADAY");
  s.applyTick({ price: 102, timestamp: T0 - 60000 });
  const gap = s.gapSince(T0 - 30000);
  assert.equal(gap.lastConfirmedBucket, s.bars()[1].bucket);
  assert.ok(gap.fromMs <= T0 - 55 * 60000);
});

test("E26 · Der Ringpuffer haelt die Reihe endlich", () => {
  const s = BarMerge.createSeries({ timeframe: "1D", calendar: CALENDAR,
                                    maxBars: 10, now: () => T0 });
  for (let i = 0; i < 50; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    s.applyBar({ date: d, close: 100 + i }, "EOD");
  }
  assert.equal(s.length(), 10);
  assert.equal(s.last().close, 149);
});

/* ===================================================== Chart-Adapter === */

function chartBar(bucket, close, confirmed) {
  return { bucket: bucket, open: close, high: close, low: close, close: close,
           volume: 1, confirmed: confirmed !== false };
}

test("E27 · Unveraenderte Daten loesen kein Zeichnen aus", () => {
  const a = ChartAdapter.createChartAdapter({ coalesceMs: 0 });
  const bars = [chartBar("a", 1), chartBar("b", 2)];
  assert.equal(a.sync(bars).op, "reset");
  const zweite = a.sync(bars);
  assert.equal(zweite.op, "none");
  assert.equal(zweite.shouldRender, false);
});

test("E28 · Eine neue Bar haengt an, ein bewegter Schluss aktualisiert", () => {
  const a = ChartAdapter.createChartAdapter({ coalesceMs: 0 });
  let bars = [chartBar("a", 1), chartBar("b", 2)];
  a.sync(bars);
  bars = bars.concat([chartBar("c", 3, false)]);
  assert.equal(a.sync(bars).op, "append");
  bars = bars.slice(0, 2).concat([chartBar("c", 3.5, false)]);
  const u = a.sync(bars);
  assert.equal(u.op, "update");
  assert.equal(u.changed.length, 1);
});

test("E29 · Eine geaenderte Vergangenheit erzwingt den Neuaufbau", () => {
  const a = ChartAdapter.createChartAdapter({ coalesceMs: 0 });
  let bars = [chartBar("a", 1), chartBar("b", 2), chartBar("c", 3)];
  a.sync(bars);
  bars = [chartBar("a", 9), chartBar("b", 2), chartBar("c", 3)];
  const r = a.sync(bars);
  assert.equal(r.op, "reset");
  assert.equal(r.reason, "historyChanged");
});

test("E30 · Schnelle Ticks werden zu einer Zeichnung zusammengefasst", () => {
  let t = 0;
  const a = ChartAdapter.createChartAdapter({ coalesceMs: 250, now: () => t });
  let bars = [chartBar("a", 1)];
  assert.equal(a.syncCoalesced(bars).op, "reset");
  t = 10;
  bars = [chartBar("a", 1), chartBar("b", 2, false)];
  const gehalten = a.syncCoalesced(bars);
  assert.equal(gehalten.shouldRender, false);
  assert.equal(gehalten.reason, "coalesced");
  assert.ok(gehalten.dueInMs > 0);
  const nachgereicht = a.flush();
  assert.equal(nachgereicht.op, "append");
  assert.equal(a.stats().coalesced, 1);
});

test("E31 · Ein Neuaufbau wartet nie", () => {
  let t = 0;
  const a = ChartAdapter.createChartAdapter({ coalesceMs: 10000, now: () => t });
  a.syncCoalesced([chartBar("a", 1)]);
  t = 1;
  const r = a.syncCoalesced([chartBar("z", 1)]);
  assert.equal(r.op, "reset");
  assert.equal(r.shouldRender, true);
});
