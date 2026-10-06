/* =========================================================================
   REALTIME §7, §12, §13 — WAS WISSEN WIR, UND SEIT WANN?

   Drei Fragen, die vor jedem Live-Chart stehen und regelmaessig
   miteinander verwechselt werden:

     Kann der Zugang das?          capability-negotiation
     Laeuft gerade Handel?         market-hours
     Ist der Stand noch aktuell?   staleness

   Diese Datei haelt fest, dass keine der drei durch eine Vermutung
   beantwortet wird. Der wichtigste Satz steht in mehreren Tests:
   ungeprueft ist nicht vorhanden.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DataClass = require("../engines/realtime/data-class.js");
const Negotiation = require("../engines/realtime/capability-negotiation.js");
const MarketHours = require("../engines/realtime/market-hours.js");
const Staleness = require("../engines/realtime/staleness.js");
const Capabilities = require("../engines/capabilities.js");
const Policy = require("../engines/display-policy.js");

const CALENDAR = JSON.parse(readFileSync(join(ROOT, "quant/config/market-calendar.json"), "utf8"));
const THRESHOLDS = JSON.parse(readFileSync(join(ROOT, "quant/config/realtime-thresholds.json"), "utf8"));

const GATES_ON = { ENABLE_LIVE_MARKET_DATA: true, ENABLE_PUBLIC_LIVE_MARKET_DATA: false };
const GATES_OFF = { ENABLE_LIVE_MARKET_DATA: false, ENABLE_PUBLIC_LIVE_MARKET_DATA: false };

function caps(market, plan) {
  return Capabilities.declare("testprovider", { plan: plan || "free", market: market });
}

/* ====================================================== Datenklassen === */

test("R01 · Die Leiter ist geordnet und endet bei UNAVAILABLE", () => {
  assert.deepEqual(DataClass.DATA_CLASSES, [
    "REALTIME_STREAM", "REALTIME_QUOTE", "INTRADAY", "EOD", "UNAVAILABLE"]);
  assert.ok(DataClass.isBetter("REALTIME_STREAM", "EOD"));
  assert.ok(DataClass.isBetter("INTRADAY", "UNAVAILABLE"));
  assert.equal(DataClass.best("EOD", "INTRADAY"), "INTRADAY");
});

test("R02 · null wird UNKNOWN, niemals UNAVAILABLE", () => {
  assert.equal(DataClass.fromTriState(null), "UNKNOWN");
  assert.equal(DataClass.fromTriState(undefined), "UNKNOWN");
  assert.equal(DataClass.fromTriState(false), "UNAVAILABLE");
  assert.equal(DataClass.fromTriState(true), "AVAILABLE");
});

test("R03 · Nur AVAILABLE ist nutzbar — UNKNOWN ausdruecklich nicht", () => {
  assert.equal(DataClass.usable("AVAILABLE"), true);
  for (const s of ["UNKNOWN", "UNAVAILABLE", "BLOCKED_BY_PLAN", "BLOCKED_BY_LICENSE", "ERROR"]) {
    assert.equal(DataClass.usable(s), false, s + " darf nicht nutzbar sein");
  }
});

/* ======================================================= Verhandlung === */

test("R04 · Eine ungepruefte Realtime-Faehigkeit bleibt UNKNOWN", () => {
  const n = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: true, realtime: null, websocket: null }),
    gates: GATES_ON
  });
  assert.equal(n.classes.REALTIME_STREAM.state, "UNKNOWN");
  assert.equal(n.classes.REALTIME_QUOTE.state, "UNKNOWN");
  assert.equal(n.bestAvailable, "INTRADAY");
  assert.deepEqual(n.unknown, ["REALTIME_STREAM", "REALTIME_QUOTE"]);
});

test("R05 · Ein ausgeschaltetes Gate ist BLOCKED_BY_PLAN, keine fehlende Faehigkeit", () => {
  const n = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: true, realtime: true, websocket: true }),
    gates: GATES_OFF
  });
  assert.equal(n.classes.INTRADAY.state, "BLOCKED_BY_PLAN");
  assert.equal(n.classes.REALTIME_QUOTE.state, "BLOCKED_BY_PLAN");
  assert.equal(n.classes.INTRADAY.reason, "gateDisabled");
  /* Der Unterschied, auf den es ankommt: der Anbieter kann es sehr wohl. */
  assert.notEqual(n.classes.INTRADAY.state, "UNAVAILABLE");
  assert.equal(n.bestAvailable, "EOD");
});

test("R06 · Eine ausdruecklich fehlende Faehigkeit ist UNAVAILABLE", () => {
  const n = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: false, realtime: false, websocket: false }),
    gates: GATES_ON
  });
  assert.equal(n.classes.INTRADAY.state, "UNAVAILABLE");
  assert.equal(n.classes.INTRADAY.reason, "capabilityDeclaredMissing");
});

test("R07 · Oeffentlich ohne Lizenzeintrag ist BLOCKED_BY_LICENSE", () => {
  const n = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: true, realtime: true, websocket: true }),
    gates: { ENABLE_LIVE_MARKET_DATA: true, ENABLE_PUBLIC_LIVE_MARKET_DATA: true },
    audience: "public",
    providerId: "kein-eintrag-vorhanden"
  });
  assert.equal(n.classes.EOD.state, "BLOCKED_BY_LICENSE");
  assert.equal(n.classes.EOD.reason, "notLicensed");
  assert.equal(n.bestAvailable, "UNAVAILABLE");
});

test("R08 · Ein Laufzeitbefund hebt an und senkt ab, ein UNKNOWN-Befund nicht", () => {
  const base = caps({ historicalDaily: true, intraday: true, realtime: null, websocket: null });
  const angehoben = Negotiation.negotiate({
    capabilities: base, gates: GATES_ON,
    probe: { REALTIME_QUOTE: { result: "PASSED" } }
  });
  assert.equal(angehoben.classes.REALTIME_QUOTE.state, "AVAILABLE");
  assert.equal(angehoben.bestAvailable, "REALTIME_QUOTE");

  const gesenkt = Negotiation.negotiate({
    capabilities: base, gates: GATES_ON,
    probe: { INTRADAY: { result: "FAILED" } }
  });
  assert.equal(gesenkt.classes.INTRADAY.state, "UNAVAILABLE");

  const unveraendert = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: true }), gates: GATES_ON,
    probe: { INTRADAY: { result: "UNKNOWN" } }
  });
  assert.equal(unveraendert.classes.INTRADAY.state, "AVAILABLE",
    "Ein gescheiterter Messversuch widerlegt nichts.");
});

test("R09 · Eine gescheiterte Pruefung wird ERROR, nicht UNAVAILABLE", () => {
  const n = Negotiation.negotiate({
    capabilities: caps({ historicalDaily: true, intraday: true }), gates: GATES_ON,
    errors: { INTRADAY: "Zeitueberschreitung" }
  });
  assert.equal(n.classes.INTRADAY.state, "ERROR");
  assert.equal(n.classes.INTRADAY.usable, false);
});

test("R10 · Die Zusammenfassung nennt keinen Kurs und keinen Schluessel", () => {
  const n = Negotiation.negotiate({ capabilities: caps({ historicalDaily: true }), gates: GATES_ON });
  const text = Negotiation.summarize(n);
  assert.match(text, /EOD=AVAILABLE/);
  assert.equal(/[0-9]{4,}/.test(text), false);
});

/* ===================================================== Handelszeiten === */

test("R11 · Sommer- und Winterzeit ergeben dieselbe Boersenzeit", () => {
  const winter = MarketHours.sessionAt("2026-01-15T14:35:00Z", { calendar: CALENDAR });
  const sommer = MarketHours.sessionAt("2026-07-15T13:35:00Z", { calendar: CALENDAR });
  assert.equal(winter.localTime.slice(0, 5), "09:35");
  assert.equal(sommer.localTime.slice(0, 5), "09:35");
  assert.equal(winter.phase, "REGULAR");
  assert.equal(sommer.phase, "REGULAR");
});

test("R12 · Wochenende und Feiertag sind verschiedene Auskuenfte", () => {
  const samstag = MarketHours.sessionAt("2026-09-05T17:00:00Z", { calendar: CALENDAR });
  assert.equal(samstag.phase, "CLOSED");
  assert.equal(samstag.closedReason, "weekend");
  assert.equal(samstag.isTradingDay, false);

  const laborDay = MarketHours.sessionAt("2026-09-07T17:00:00Z", { calendar: CALENDAR });
  assert.equal(laborDay.closedReason, "holiday");
});

test("R13 · Vor- und Nachboerse sind eigene Phasen, kein Handel", () => {
  const vor = MarketHours.sessionAt("2026-09-08T12:00:00Z", { calendar: CALENDAR });
  assert.equal(vor.phase, "PRE");
  assert.equal(vor.isOpen, false);
  assert.equal(vor.isTradingDay, true);

  const nach = MarketHours.sessionAt("2026-09-08T21:00:00Z", { calendar: CALENDAR });
  assert.equal(nach.phase, "AFTER");
});

test("R14 · Ein verkuerzter Handelstag schliesst frueher", () => {
  /* 27.11.2026, 13:30 Ortszeit - nach dem verkuerzten Schluss um 13:00. */
  const s = MarketHours.sessionAt("2026-11-27T18:30:00Z", { calendar: CALENDAR });
  assert.equal(s.earlyClose, "13:00");
  assert.equal(s.phase, "AFTER");
  /* Zwei Stunden frueher laeuft der Handel noch. */
  const frueher = MarketHours.sessionAt("2026-11-27T16:30:00Z", { calendar: CALENDAR });
  assert.equal(frueher.phase, "REGULAR");
});

test("R15 · Ausserhalb der Kalenderabdeckung wird keine Vollstaendigkeit behauptet", () => {
  const s = MarketHours.sessionAt("2031-03-11T15:00:00Z", { calendar: CALENDAR });
  assert.equal(s.calendarCoverage, false);
  /* Der Wochentag traegt trotzdem: ein Mittwoch bleibt ein Mittwoch. */
  assert.equal(s.phase, "REGULAR");
});

test("R16 · Nur der regulaere Handel erwartet ohne Weiteres Aktualisierungen", () => {
  const regular = MarketHours.sessionAt("2026-09-08T17:00:00Z", { calendar: CALENDAR });
  const pre = MarketHours.sessionAt("2026-09-08T12:00:00Z", { calendar: CALENDAR });
  assert.equal(MarketHours.expectsUpdates(regular), true);
  assert.equal(MarketHours.expectsUpdates(pre), false);
  assert.equal(MarketHours.expectsUpdates(pre, true), true);
});

/* ========================================================== Verfall === */

const OFFEN = Date.parse("2026-09-08T17:00:00Z");   // Dienstag, 13:00 ET
const ZU = Date.parse("2026-09-06T17:00:00Z");      // Sonntag

function stale(input) {
  return Staleness.evaluate(Object.assign({
    calendar: CALENDAR, thresholds: THRESHOLDS
  }, input));
}

test("R17 · Frisch, alternd, verfallen — drei Stufen bei offener Boerse", () => {
  assert.equal(stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 5000, now: OFFEN }).level, "FRESH");
  assert.equal(stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 60000, now: OFFEN }).level, "DEGRADED");
  assert.equal(stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 900000, now: OFFEN }).level, "STALE");
});

test("R18 · Bei geschlossener Boerse gibt es keinen Verfall, aber auch kein LIVE", () => {
  const r = stale({ dataClass: "REALTIME_QUOTE", timestamp: ZU - 3600000, now: ZU });
  assert.equal(r.level, "MARKET_CLOSED");
  assert.equal(r.allowsLive, false);
  assert.equal(r.reason, "weekend");
});

test("R19 · Ein Tagesschluss veraltet auch am Wochenende — nur langsamer", () => {
  const frisch = stale({ dataClass: "EOD", timestamp: ZU - 20 * 3600000, now: ZU });
  assert.equal(frisch.level, "MARKET_CLOSED");
  const alt = stale({ dataClass: "EOD", timestamp: ZU - 30 * 86400000, now: ZU });
  assert.equal(alt.level, "STALE");
});

test("R20 · Intraday-Schwellen haengen am Intervall, nicht an einer festen Zahl", () => {
  const einMinute = Staleness.thresholdsFor("INTRADAY", { interval: "1min", thresholds: THRESHOLDS });
  const fuenfMinuten = Staleness.thresholdsFor("INTRADAY", { interval: "5min", thresholds: THRESHOLDS });
  assert.ok(fuenfMinuten.degradedMs > einMinute.degradedMs);
  assert.equal(Staleness.intervalMs("5min"), 300000);
  assert.equal(Staleness.intervalMs("1h"), 3600000);
});

test("R21 · Ohne Zeitstempel ist nichts frisch", () => {
  const r = stale({ dataClass: "REALTIME_QUOTE", timestamp: null, now: OFFEN });
  assert.equal(r.level, "UNKNOWN");
  assert.equal(r.reason, "missingTimestamp");
  assert.equal(r.allowsLive, false);
});

test("R22 · Ein Zeitstempel aus der Zukunft ist kein frischer Kurs", () => {
  const r = stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN + 600000, now: OFFEN });
  assert.equal(r.level, "UNKNOWN");
  assert.equal(r.reason, "timestampInFuture");
});

test("R23 · Anbieter- und Transportverzoegerung werden getrennt gemessen", () => {
  const r = stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 10000,
                    receivedAt: OFFEN - 3000, now: OFFEN });
  assert.equal(r.providerLagMs, 7000);
  assert.equal(r.transportLagMs, 3000);
  assert.equal(r.ageMs, 10000);
});

test("R24 · Der Rueckfall hat eine eigene, hoehere Schwelle als der Verfall", () => {
  const alternd = stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 150000, now: OFFEN });
  assert.equal(Staleness.shouldFallback(alternd), false);
  const weg = stale({ dataClass: "REALTIME_QUOTE", timestamp: OFFEN - 600000, now: OFFEN });
  assert.equal(Staleness.shouldFallback(weg), true);
  /* Geschlossene Boerse loest nie einen Rueckfall aus. */
  assert.equal(Staleness.shouldFallback(
    stale({ dataClass: "REALTIME_QUOTE", timestamp: ZU - 7200000, now: ZU })), false);
});

test("R25 · Die Schwellen sind versioniert und begruendet", () => {
  assert.equal(typeof THRESHOLDS.thresholdSetId, "string");
  assert.equal(typeof THRESHOLDS.changedAt, "string");
  for (const klasse of Object.keys(THRESHOLDS.classes)) {
    assert.equal(typeof THRESHOLDS.classes[klasse].basis, "string",
      klasse + " braucht eine Begruendung");
  }
});
