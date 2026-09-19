/* =========================================================================
   EXTENDED HOURS §2–§7 — DIE SITZUNGEN

   Vision Universe soll für deutsche Nutzer möglichst lange am Tag
   aktuelle US-Kurse zeigen. Das heisst: vier Sitzungen statt einer, und
   für jede die Frage, ob wir sie überhaupt bedienen dürfen.

   Die Szenarien A bis R aus der Vorgabe. Zwei Dinge prüfen sie
   durchgängig mit: dass keine Sitzung behauptet wird, die der Zugang
   nicht belegt hat - und dass der Chart in keiner von ihnen leer wird.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createClock, buildFeed, negotiationFor, createScriptedTransport,
         intradayBar, tick, CALENDAR, THRESHOLDS } from "./realtime-fixtures.mjs";

const require = createRequire(import.meta.url);
const Session = require("../engines/realtime/session-policy.js");
const MarketHours = require("../engines/realtime/market-hours.js");
const BarMerge = require("../engines/realtime/bar-merge.js");
const DataStatus = require("../engines/realtime/data-status.js");
const Bridge = require("../engines/realtime/technical-bridge.js");
const Staleness = require("../engines/realtime/staleness.js");
const Capabilities = require("../engines/capabilities.js");
const Negotiation = require("../engines/realtime/capability-negotiation.js");
const Transport = require("../engines/realtime/transport.js");

/* Fähigkeiten mit und ohne belegte erweiterte Zeiten. */
const OHNE_EXT = { historicalDaily: true, intraday: true, realtime: true, websocket: false };
const MIT_EXT = Object.assign({}, OHNE_EXT, { extendedHours: true, extendedHoursRealtime: true });
const EXT_OHNE_LIVE = Object.assign({}, OHNE_EXT, { extendedHours: true });

function caps(market) { return Capabilities.declare("testprovider", { market: market }); }
function neg(market) {
  return Negotiation.negotiate({ capabilities: caps(market), providerId: "testprovider",
                                 gates: { ENABLE_LIVE_MARKET_DATA: true } });
}
function sess(iso) { return Session.sessionAt(iso, { calendar: CALENDAR, exchange: "XNYS" }); }

/* Zeitpunkte in New Yorker Ortszeit, als UTC geschrieben.
   Dienstag, 8. September 2026 (Sommerzeit, ET = UTC-4). */
const PRE      = "2026-09-08T12:30:00Z";   // 08:30 ET
const REGULAR  = "2026-09-08T17:00:00Z";   // 13:00 ET
/* 17:32 und nicht 17:30: auf einer Intervallgrenze laege "vor einer
   Sekunde" in der bereits geschlossenen Kerze. */
const AFTER    = "2026-09-08T21:32:00Z";   // 17:32 ET
const CLOSED   = "2026-09-09T03:00:00Z";   // 23:00 ET (Mittwoch 05:00 in DE)

/* ============================================== A, B, C — Ticks === */

test("A · Ein Tick in der Vorbörse landet in einer Vorbörsen-Kerze", () => {
  const t = Date.parse(PRE);
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  const r = s.applyTick({ price: 100, timestamp: t, size: 10 });
  assert.equal(r.action, "appended");
  const b = s.last();
  assert.equal(b.session, "PRE_MARKET");
  assert.equal(b.isExtendedHours, true);
  assert.equal(b.sessionType, "EXTENDED");
  assert.equal(b.confirmed, false, "Die laufende Vorbörsen-Kerze ist vorläufig.");
});

test("B · Ein Tick in der regulären Sitzung ist nicht erweitert", () => {
  const t = Date.parse(REGULAR);
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  s.applyTick({ price: 100, timestamp: t, size: 10 });
  assert.equal(s.last().session, "REGULAR");
  assert.equal(s.last().isExtendedHours, false);
  assert.equal(s.last().sessionType, "REGULAR");
});

test("C · Eine laufende After-Hours-Kerze lässt sich wie jede andere aktualisieren", () => {
  const t = Date.parse(AFTER);
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  s.applyTick({ price: 100, timestamp: t, size: 5 });
  s.applyTick({ price: 103, timestamp: t + 1000, size: 5 });
  s.applyTick({ price: 99, timestamp: t + 2000, size: 5 });
  const b = s.last();
  assert.equal(b.session, "AFTER_HOURS");
  assert.equal(b.high, 103);
  assert.equal(b.low, 99);
  assert.equal(b.close, 99);
  assert.equal(b.volume, 15);
  assert.equal(s.length(), 1, "Drei Ticks, eine Kerze.");
});

/* ================================= D, E, F — Sitzungswechsel === */

test("D · PRE → REGULAR wird erkannt und benannt", () => {
  const wechsel = Session.transition(sess("2026-09-08T13:25:00Z"), sess("2026-09-08T13:35:00Z"));
  assert.ok(wechsel, "Der Wechsel um 09:30 ET muss auffallen.");
  assert.equal(wechsel.from, "PRE_MARKET");
  assert.equal(wechsel.to, "REGULAR");
  assert.equal(wechsel.entersExtended, false);
  assert.equal(wechsel.leavesTrading, false);
});

test("E · REGULAR → AFTER_HOURS wird erkannt", () => {
  const wechsel = Session.transition(sess("2026-09-08T19:55:00Z"), sess("2026-09-08T20:05:00Z"));
  assert.equal(wechsel.from, "REGULAR");
  assert.equal(wechsel.to, "AFTER_HOURS");
  assert.equal(wechsel.entersExtended, true);
});

test("F · AFTER_HOURS → CLOSED wird erkannt", () => {
  /* 20:00 ET ist das Ende der Nachbörse - in Deutschland 02:00 nachts. */
  const wechsel = Session.transition(sess("2026-09-08T23:55:00Z"), sess("2026-09-09T00:05:00Z"));
  assert.equal(wechsel.from, "AFTER_HOURS");
  assert.equal(wechsel.to, "CLOSED");
  assert.equal(wechsel.leavesTrading, true);
});

test("F2 · Kein Wechsel, wo keiner ist", () => {
  assert.equal(Session.transition(sess(REGULAR), sess("2026-09-08T17:30:00Z")), null);
  assert.equal(Session.transition(null, sess(REGULAR)), null);
});

/* ===================================== G, H, I — Kalender === */

test("G · Am Wochenende gibt es keine erweiterte Sitzung", () => {
  for (const iso of ["2026-09-05T12:30:00Z", "2026-09-05T21:30:00Z", "2026-09-06T17:00:00Z"]) {
    const s = sess(iso);
    assert.equal(s.session, "CLOSED", iso);
    assert.equal(s.isExtended, false);
    assert.equal(s.closedReason, "weekend");
  }
});

test("H · Am US-Feiertag gibt es keine erweiterte Sitzung", () => {
  /* Labor Day, 7. September 2026 - auch um 08:30 ET keine Vorbörse. */
  const vor = sess("2026-09-07T12:30:00Z");
  assert.equal(vor.session, "CLOSED");
  assert.equal(vor.closedReason, "holiday");
  const nach = sess("2026-09-07T21:30:00Z");
  assert.equal(nach.session, "CLOSED");
});

test("I · Ein verkürzter Handelstag verschiebt auch den Beginn der Nachbörse", () => {
  /* 27.11.2026, Schluss um 13:00 ET statt 16:00. */
  const vorSchluss = sess("2026-11-27T17:30:00Z");     // 12:30 ET
  assert.equal(vorSchluss.session, "REGULAR");
  assert.equal(vorSchluss.earlyClose, "13:00");
  const nachSchluss = sess("2026-11-27T18:30:00Z");    // 13:30 ET
  assert.equal(nachSchluss.session, "AFTER_HOURS",
    "Nach dem verkürzten Schluss beginnt die Nachbörse drei Stunden früher.");
});

/* ========================================== J — Zeitumstellung === */

test("J · Die Sitzungsgrenzen überleben beide Zeitumstellungen", () => {
  /* USA stellt am 8. März 2026 um, Deutschland am 29. März. Dazwischen
     liegen drei Wochen, in denen der Abstand zwischen Berlin und New
     York sechs statt sieben Stunden beträgt - der Zeitraum, in dem eine
     fest verdrahtete Verschiebung falsche Sitzungen ergäbe. */
  const faelle = [
    ["2026-03-06T14:35:00Z", "REGULAR",     "09:35", "Winterzeit USA"],
    ["2026-03-09T13:35:00Z", "REGULAR",     "09:35", "Sommerzeit USA, Winterzeit DE"],
    ["2026-04-01T13:35:00Z", "REGULAR",     "09:35", "beide Sommerzeit"],
    ["2026-03-09T09:00:00Z", "PRE_MARKET",  "05:00", "Vorbörse im Übergangsfenster"],
    ["2026-03-09T23:00:00Z", "AFTER_HOURS", "19:00", "Nachbörse im Übergangsfenster"],
    ["2026-11-05T14:35:00Z", "REGULAR",     "09:35", "Winterzeit beide"]
  ];
  for (const [iso, erwartet, ortszeit, was] of faelle) {
    const s = sess(iso);
    assert.equal(s.session, erwartet, was + " (" + iso + ")");
    assert.equal(s.localTime.slice(0, 5), ortszeit, was);
  }
});

test("J2 · Deutsche Ortszeit wird nie als Marktzeit gelesen", () => {
  /* 15:00 in Berlin ist im Sommer 09:00 in New York - Vorbörse, nicht
     regulärer Handel. Ein System, das die Nutzerzeit für die Marktzeit
     hält, zeigte hier "REGULAR". */
  const s = sess("2026-07-15T13:00:00Z");   // 15:00 Berlin, 09:00 New York
  assert.equal(s.session, "PRE_MARKET");
  assert.equal(s.timezone, "America/New_York");
});

/* ============================ K, R — Kerzen an der Grenze === */

test("K · Ein verspäteter Tick bewegt keine geschlossene Extended-Kerze", () => {
  let jetzt = Date.parse(AFTER);
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => jetzt });
  s.applyTick({ price: 100, timestamp: jetzt, size: 5 });
  const bucket = s.last().bucket;
  jetzt = Date.parse(AFTER) + 6 * 60000;
  assert.equal(s.byBucket(bucket).confirmed, true);
  const spaet = s.applyTick({ price: 999, timestamp: Date.parse(AFTER) });
  assert.equal(spaet.action, "ignored");
  assert.equal(spaet.reason, "bucketClosed");
  assert.equal(s.byBucket(bucket).close, 100);
});

test("R · An der Sitzungsgrenze entsteht keine doppelte Kerze", () => {
  /* 09:30 ET ist Ende der Vorbörse und Eröffnung zugleich. Beide Quellen
     liefern eine Bar für denselben Zeitpunkt - der Eimer ist derselbe,
     also bleibt es eine Kerze. */
  const t = Date.parse("2026-09-08T14:00:00Z");   // 10:00 ET
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  const grenze = "2026-09-08T13:30:00Z";          // 09:30 ET
  s.applyBar({ timestamp: grenze, open: 100, high: 100, low: 100, close: 100,
               volume: 10, adjustmentStatus: "raw" }, "INTRADAY");
  const zweite = s.applyBar({ timestamp: grenze, open: 100, high: 101, low: 99, close: 101,
                              volume: 50, adjustmentStatus: "raw" }, "INTRADAY");
  assert.equal(s.length(), 1, "Eine Kerze, nicht zwei.");
  assert.equal(zweite.action, "replaced");
  assert.equal(s.last().session, "REGULAR", "09:30 gehört zur regulären Sitzung.");

  /* Und die Kerze davor bleibt die Vorbörsen-Kerze. */
  s.applyBar({ timestamp: "2026-09-08T13:25:00Z", close: 99, adjustmentStatus: "raw" }, "INTRADAY");
  const alle = s.bars();
  assert.equal(alle.length, 2);
  assert.equal(alle[0].session, "PRE_MARKET");
  assert.equal(alle[1].session, "REGULAR");
  assert.deepEqual(alle.map((b) => b.bucket), alle.map((b) => b.bucket).slice().sort());
});

test("R2 · Regulär und erweitert bilden EINE kontinuierliche Reihe", () => {
  const t = Date.parse("2026-09-08T21:00:00Z");   // 17:00 ET
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  const stempel = ["2026-09-08T13:00:00Z", "2026-09-08T13:35:00Z", "2026-09-08T17:00:00Z",
                   "2026-09-08T19:35:00Z", "2026-09-08T20:30:00Z"];
  stempel.forEach((iso, i) => s.applyBar({ timestamp: iso, close: 100 + i,
                                           adjustmentStatus: "raw" }, "INTRADAY"));
  const bars = s.bars();
  assert.equal(bars.length, 5);
  assert.deepEqual(bars.map((b) => b.session),
    ["PRE_MARKET", "REGULAR", "REGULAR", "REGULAR", "AFTER_HOURS"]);
  /* Eine Reihe, aufsteigend, ohne Sprung in der Ordnung. */
  const buckets = bars.map((b) => b.bucket);
  assert.deepEqual(buckets, buckets.slice().sort());
  assert.equal(new Set(buckets).size, buckets.length);
  /* Und die Kurse gehen ohne Bruch durch. */
  assert.deepEqual(bars.map((b) => b.close), [100, 101, 102, 103, 104]);
});

/* ================================ N, O, P, Q — Nichtverfügbarkeit === */

test("N · Ohne belegte erweiterte Zeiten wird die erweiterte Sitzung nicht bedient", () => {
  const ohne = caps(OHNE_EXT);
  for (const s of ["PRE_MARKET", "AFTER_HOURS"]) {
    const r = Session.restrict(s, ohne);
    assert.deepEqual(r.suppress, ["REALTIME_STREAM", "REALTIME_QUOTE", "INTRADAY"]);
    assert.equal(r.reason, "extendedHoursUnverified");
    assert.equal(Session.allowsLiveLabel(s, ohne), false);
  }
  /* Die reguläre Sitzung bleibt unberührt - das ist der Punkt. */
  assert.deepEqual(Session.restrict("REGULAR", ohne).suppress, []);
  assert.equal(Session.allowsLiveLabel("REGULAR", ohne), true);
});

test("N2 · Bars ja, Aktualität ungeprüft → Intraday bleibt, LIVE nicht", () => {
  const teil = caps(EXT_OHNE_LIVE);
  const r = Session.restrict("AFTER_HOURS", teil);
  assert.deepEqual(r.suppress, ["REALTIME_STREAM", "REALTIME_QUOTE"]);
  assert.equal(r.reason, "extendedRealtimeUnverified");
  assert.equal(Session.allowsLiveLabel("AFTER_HOURS", teil), false,
    "Daten dürfen kommen - live heissen dürfen sie nicht.");
});

test("N3 · Mit Beleg wird die erweiterte Sitzung voll bedient", () => {
  const voll = caps(MIT_EXT);
  for (const s of ["PRE_MARKET", "AFTER_HOURS"]) {
    assert.deepEqual(Session.restrict(s, voll).suppress, []);
    assert.equal(Session.allowsLiveLabel(s, voll), true);
  }
});

test("O · Ohne Realtime-Fähigkeit gibt es auch in der Vorbörse kein LIVE", () => {
  const nurBars = caps({ historicalDaily: true, intraday: true, extendedHours: true });
  const n = neg({ historicalDaily: true, intraday: true, extendedHours: true });
  const status = DataStatus.derive({
    connection: { state: "FALLBACK_INTRADAY" },
    selection: { selected: "INTRADAY" },
    negotiation: n, staleness: { level: "FRESH" },
    session: sess(PRE),
    sessionAllowsLive: Session.allowsLiveLabel("PRE_MARKET", nurBars),
    lastTimestamp: Date.parse(PRE)
  });
  assert.equal(status.isLive, false);
  assert.equal(status.code, "INTRADAY");
  assert.equal(status.session, "PRE_MARKET");
});

test("P · Bei geschlossener Börse bleibt der letzte Schlusskurs stehen", async () => {
  const clock = createClock(Date.parse(CLOSED));
  const eod = createScriptedTransport({ id: "e", dataClass: "EOD", kind: "eod",
    timers: clock.timers, intervalMs: 3600000,
    bars: () => [{ date: "2026-09-08", open: 100, high: 101, low: 99, close: 100.5,
                   volume: 1000, adjustmentStatus: "raw" }] });
  const feed = buildFeed({ negotiation: neg(MIT_EXT), transports: { EOD: eod },
                           timers: clock.timers, timeframe: "1D", interval: "1D",
                           capabilities: caps(MIT_EXT) });
  feed.start();
  await clock.advance(20000);
  assert.equal(feed.session().session, "CLOSED");
  assert.ok(feed.bars().length >= 1, "Der Chart ist nicht leer.");
  assert.equal(feed.status().isLive, false);
  assert.equal(feed.status().code, "LAST_CLOSE");
  assert.match(feed.status().text, /^LETZTER SCHLUSSKURS · \d{2}\.\d{2}\.\d{4}$/);
});

test("Q · Ohne API-Key gibt es keine Sitzungsbehauptung", () => {
  const Tiingo = require("../../providers/tiingo/adapter.js");
  const c = Tiingo.freePlanCapabilities();
  assert.equal(c.sets.market.extendedHours, null);
  assert.equal(c.sets.market.extendedHoursRealtime, null);
  const r = Session.restrict("AFTER_HOURS", c);
  assert.equal(r.reason, "extendedHoursUnverified");
  assert.equal(Session.allowsLiveLabel("AFTER_HOURS", c), false);
});

/* ==================================== L, M — Feed über Grenzen === */

test("L · Ein Reconnect während der Nachbörse fällt nicht auf LIVE zurück", async () => {
  const clock = createClock(Date.parse(AFTER));
  const quote = createScriptedTransport({ id: "q", dataClass: "REALTIME_QUOTE",
    timers: clock.timers, intervalMs: 5000, maxConsecutiveErrors: 2,
    ticks: (now) => [tick(now, 1, 100)] });
  const intraday = createScriptedTransport({ id: "i", dataClass: "INTRADAY", kind: "barPolling",
    timers: clock.timers, intervalMs: 30000, bars: (now) => [intradayBar(now, 1, 99)] });

  /* Erweiterte Zeiten belegt, Echtzeit darin ebenfalls. */
  const feed = buildFeed({ negotiation: neg(MIT_EXT), capabilities: caps(MIT_EXT),
    transports: { REALTIME_QUOTE: quote, INTRADAY: intraday }, timers: clock.timers });
  feed.start();
  await clock.advance(1);
  assert.equal(feed.status().code, "LIVE");
  assert.equal(feed.status().session, "AFTER_HOURS");
  assert.match(feed.status().text, /^LIVE · AFTER-HOURS · /);

  quote.script.mode = "transportFailed";
  await clock.advance(120000);
  assert.notEqual(feed.status().code, "LIVE");
  assert.equal(feed.activeDataClass(), "INTRADAY");
  assert.ok(feed.bars().length >= 1, "Der Chart bleibt gefüllt.");
});

test("M · Backfill über die Sitzungsgrenze erzeugt keine Dubletten", () => {
  const t = Date.parse("2026-09-08T14:30:00Z");   // 10:30 ET
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  /* Laufender Bestand: eine Vorbörsen- und eine reguläre Bar. */
  s.seed([
    { timestamp: "2026-09-08T13:20:00Z", close: 99, adjustmentStatus: "raw" },
    { timestamp: "2026-09-08T14:00:00Z", close: 101, adjustmentStatus: "raw" }
  ], "HISTORICAL");

  /* Das Nachladen liefert den ganzen Bereich noch einmal, über die
     Grenze hinweg - so, wie ein Anbieter es täte. */
  const nachgeladen = [];
  for (let m = 70; m >= 10; m -= 5) {
    nachgeladen.push({ timestamp: new Date(t - m * 60000).toISOString(),
                       close: 100, adjustmentStatus: "raw" });
  }
  const bilanz = s.applyBars(nachgeladen, "INTRADAY");

  const bars = s.bars();
  const buckets = bars.map((b) => b.bucket);
  assert.equal(new Set(buckets).size, buckets.length, "Keine doppelten Eimer.");
  assert.deepEqual(buckets, buckets.slice().sort(), "Die Reihe bleibt geordnet.");
  assert.ok(bars.some((b) => b.session === "PRE_MARKET"), "Vorbörse ist dabei.");
  assert.ok(bars.some((b) => b.session === "REGULAR"), "Reguläre Sitzung ist dabei.");
  assert.ok(bilanz.appended + bilanz.inserted + bilanz.replaced + bilanz.ignored >= 13);
});

/* ============================ Technical Intelligence (§6) === */

test("T1 · Erweiterte Bars erreichen die technische Analyse nicht", () => {
  const t = Date.parse("2026-09-08T21:00:00Z");
  const s = BarMerge.createSeries({ timeframe: "5m", interval: "5min", calendar: CALENDAR,
                                    adjustmentStatus: "raw", now: () => t });
  ["2026-09-08T12:30:00Z", "2026-09-08T17:00:00Z", "2026-09-08T20:30:00Z"]
    .forEach((iso, i) => s.applyBar({ timestamp: iso, close: 100 + i,
                                      adjustmentStatus: "raw" }, "INTRADAY"));
  s.applyTick({ price: 200, timestamp: t });      // laufende Kerze

  const roh = s.bars();
  assert.equal(Bridge.audit(roh).clean, false, "Die Live-Reihe enthält Erweitertes.");

  const fuerTechnik = Bridge.forTechnical(roh);
  assert.equal(Bridge.audit(fuerTechnik.bars).clean, true);
  assert.ok(fuerTechnik.counts.droppedExtended >= 2);
  assert.ok(fuerTechnik.counts.droppedDeveloping >= 1);
  assert.ok(fuerTechnik.bars.every((b) => b.session === "REGULAR" && b.confirmed === true));
});

test("T2 · Die Brücke sagt ausdrücklich, dass sie nichts verändert", () => {
  const c = Bridge.context({ code: "LIVE", dataClass: "REALTIME_QUOTE" }, sess(AFTER));
  assert.equal(c.affectsTechnicalSeries, false);
  assert.equal(c.liveIsExtended, true);
  assert.match(c.reason, /XNYS-regular-v1/);
});

test("T3 · Die Sitzungsrichtlinie der Technical Intelligence bleibt unverändert", () => {
  const Timeframe = require("../engines/technical/timeframe.js");
  assert.equal(Timeframe.DEFAULT_POLICY.includeExtended, false,
    "Die technische Analyse rechnet weiterhin auf der regulären Sitzung.");
  assert.equal(Timeframe.DEFAULT_POLICY.policyId, "XNYS-regular-v1");
  assert.equal(Bridge.DEFAULT_CONTRACT.sessionPolicyId, Timeframe.DEFAULT_POLICY.policyId,
    "Brücke und Aggregator müssen dieselbe Richtlinie nennen.");
  assert.equal(Bridge.DEFAULT_CONTRACT.includeExtended, Timeframe.DEFAULT_POLICY.includeExtended);
});

test("T4 · Eine Abweichung ist möglich, aber niemals stillschweigend", () => {
  const bars = [{ bucket: "a", close: 100, confirmed: true, session: "AFTER_HOURS",
                  isExtendedHours: true }];
  const streng = Bridge.forTechnical(bars);
  assert.equal(streng.bars.length, 0);
  const bewusst = Bridge.forTechnical(bars, { includeExtended: true });
  assert.equal(bewusst.bars.length, 1);
  assert.equal(bewusst.contract.includeExtended, true,
    "Der abweichende Vertrag steht im Ergebnis - er lässt sich nicht verschweigen.");
});

/* ================== Befunde aus der Anbindung an echte Daten === */

test("V1 · Ein Tagesschluss wird als Handelstag angezeigt, nicht durch eine Zeitzone gerechnet", () => {
  /* Der Befund aus der Anbindung an die Marktdatenseite: eine Tagesbar
     traegt keine Uhrzeit, landet als Mitternacht UTC im Zeitstempel -
     und Mitternacht UTC ist in New York der Vorabend. Die Anzeige lag
     verlaesslich einen Tag zurueck. */
  const ohneHandelstag = DataStatus.derive({
    connection: { state: "FALLBACK_EOD" },
    selection: { selected: "EOD" },
    negotiation: neg(OHNE_EXT),
    staleness: { level: "MARKET_CLOSED" },
    session: sess(CLOSED),
    lastTimestamp: Date.parse("2026-09-04")
  });
  const mitHandelstag = DataStatus.derive({
    connection: { state: "FALLBACK_EOD" },
    selection: { selected: "EOD" },
    negotiation: neg(OHNE_EXT),
    staleness: { level: "MARKET_CLOSED" },
    session: sess(CLOSED),
    lastTimestamp: Date.parse("2026-09-04"),
    lastTradingDay: "2026-09-04"
  });
  assert.equal(mitHandelstag.detail, "04.09.2026",
    "Der Handelstag steht so da, wie er heisst.");
  assert.notEqual(ohneHandelstag.detail, mitHandelstag.detail,
    "Ohne Handelstag verschiebt die Zeitzone das Datum - deshalb wird er gereicht.");
  assert.equal(DataStatus.fmtDateOnly("2026-01-02"), "02.01.2026");
});

test("V2 · Ein Tagesschluss altert in Handelstagen, nicht in Kalenderstunden", () => {
  /* Freitag 04.09. geschlossen, Dienstag 08.09. nachgesehen. Dazwischen
     Wochenende und Labor Day - 108 Kalenderstunden, aber genau ein
     fehlender Handelstag. Eine Warnung nach jedem langen Wochenende
     waere keine Warnung mehr. */
  const jetzt = Date.parse("2026-09-08T12:00:00Z");
  const frisch = Staleness.evaluate({
    dataClass: "EOD", timestamp: Date.parse("2026-09-04"), tradingDay: "2026-09-04",
    now: jetzt, calendar: CALENDAR, thresholds: THRESHOLDS
  });
  assert.equal(frisch.tradingDaysBehind, 1);
  assert.notEqual(frisch.level, "STALE",
    "108 Kalenderstunden ueber ein langes Wochenende sind kein Ausfall.");

  const alt = Staleness.evaluate({
    dataClass: "EOD", timestamp: Date.parse("2026-08-09"), tradingDay: "2026-08-09",
    now: jetzt, calendar: CALENDAR, thresholds: THRESHOLDS
  });
  assert.equal(alt.level, "STALE");
  assert.ok(alt.tradingDaysBehind > 3);
});

test("V3 · Handelstage zaehlen Wochenenden und Feiertage nicht mit", () => {
  const z = (a, b) => MarketHours.tradingDaysBetween(a, b,
    { calendar: CALENDAR, exchange: "XNYS" });
  assert.equal(z("2026-09-04", "2026-09-08T12:00:00Z"), 1, "Sa, So und Labor Day zaehlen nicht.");
  assert.equal(z("2026-09-08", "2026-09-08T12:00:00Z"), 0, "Derselbe Tag ist kein Abstand.");
  assert.equal(z("2026-09-08T20:00:00Z", "2026-09-04T12:00:00Z"), 0, "Rueckwaerts ist null.");
  /* Ein Datum bleibt ein Datum - es wird nicht durch eine Zeitzone gerechnet. */
  assert.equal(z("2026-09-07", "2026-09-08T12:00:00Z"), 1, "Labor Day raus, Dienstag rein.");
});

test("V4 · Ohne Kalender bleibt die Stundenrechnung als Rueckfall", () => {
  const jetzt = Date.parse("2026-09-08T12:00:00Z");
  const r = Staleness.evaluate({
    dataClass: "EOD", timestamp: jetzt - 200 * 3600000, now: jetzt, thresholds: THRESHOLDS
  });
  assert.equal(r.level, "STALE", "Groeber, aber besser als gar keine Alterung.");
  assert.equal(r.tradingDaysBehind, null);
});

/* ================================ Sitzungszeiten als Bericht === */

test("S1 · Die Sitzungszeiten werden mit Prüfzustand berichtet, nicht als Zusage", () => {
  const b = Session.describe(CALENDAR, "XNYS", caps(OHNE_EXT));
  assert.equal(b.timezone, "America/New_York");
  const nach = {};
  b.sessions.forEach((s) => { nach[s.session] = s; });
  assert.equal(nach.REGULAR.startLocal, "09:30");
  assert.equal(nach.REGULAR.endLocal, "16:00");
  assert.equal(nach.REGULAR.state, "AVAILABLE");
  assert.equal(nach.PRE_MARKET.startLocal, "04:00");
  assert.equal(nach.AFTER_HOURS.endLocal, "20:00");
  assert.equal(nach.PRE_MARKET.state, "UNKNOWN", "Ungeprüft bleibt ungeprüft.");
  assert.equal(nach.AFTER_HOURS.state, "UNKNOWN");
  assert.equal(b.extendedSupport.bars, "UNKNOWN");
});

test("S2 · Die Sitzungsnamen sind eine Übersetzung, keine zweite Wahrheit", () => {
  assert.deepEqual(MarketHours.PHASES, ["PRE", "REGULAR", "AFTER", "CLOSED"]);
  assert.deepEqual(Session.SESSIONS, ["PRE_MARKET", "REGULAR", "AFTER_HOURS", "CLOSED"]);
  for (const p of MarketHours.PHASES) {
    assert.ok(Session.SESSIONS.includes(Session.sessionOf(p)), p);
  }
});
