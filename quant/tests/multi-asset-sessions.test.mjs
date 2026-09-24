/* Multi-Asset Core: Sitzungsprofile und asset-aware Freshness (§26-31, §38-39). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Profiles = require("../engines/realtime/session-profiles.js");
const AF = require("../engines/realtime/asset-freshness.js");
const calendar = require("../config/market-calendar.json");
const config = require("../config/multi-asset.json");

const SAT = "2026-09-26T12:00:00Z";   // Samstag
const SUN = "2026-09-27T12:00:00Z";   // Sonntag
const MON = "2026-09-28T09:00:00Z";   // Montag vormittag (Europa)

const inst = {
  BTC: { symbol: "BTCUSD", assetClass: "CRYPTO", sessionProfile: "CRYPTO_24_7" },
  EURUSD: { symbol: "EURUSD", assetClass: "FX", sessionProfile: "FX_24_5" },
  SPX: { symbol: "SPX", assetClass: "INDEX", sessionProfile: "INDEX_US", sessionExchange: "XNYS" },
  DAX: { symbol: "DAX", assetClass: "INDEX", sessionProfile: "INDEX_EU", sessionExchange: "XETR" },
  GOLD: { symbol: "XAUUSD", assetClass: "PRECIOUS_METAL", sessionProfile: "METALS_OTC_24_5" },
  WTI_FUT: { symbol: "WTI", assetClass: "COMMODITY", sessionProfile: "COMMODITY_FUTURES" },
  US10Y: { symbol: "US10Y", assetClass: "YIELD", sessionProfile: "REFERENCE_DAILY", publisherProfile: "US_TREASURY" },
  ECB: { symbol: "ECB_DFR", assetClass: "RATE", sessionProfile: "POLICY_EVENT", publisherProfile: "EU_ECB" }
};
const assess = (i, observation, now) => AF.assess({ instrument: i, observation, now, calendar, config });

test("BTC am Samstag und Sonntag: Markt offen, kein 'Market Closed'", () => {
  for (const t of [SAT, SUN]) {
    const s = Profiles.stateAt("CRYPTO_24_7", t, { calendar });
    assert.equal(s.isOpen, true);
    assert.equal(s.marketState, "OPEN");
  }
});

test("BTC am Samstag: ein frischer Snapshot ist CURRENT, ein Tag alter STALE - nie LAST_SESSION", () => {
  const fresh = assess(inst.BTC, { asOf: "2026-09-26T11:40:00Z", frequency: "INTRADAY" }, SAT);
  assert.equal(fresh.state, "CURRENT");
  const old = assess(inst.BTC, { asOf: "2026-09-25T09:00:00Z", frequency: "INTRADAY" }, SAT);
  assert.equal(old.state, "STALE");
});

test("LIVE nur mit Echtzeitpfad: ein 30 Sekunden alter Snapshot ist nicht LIVE", () => {
  assert.equal(assess(inst.BTC, { asOf: "2026-09-26T11:59:30Z", frequency: "INTRADAY" }, SAT).state, "CURRENT");
  const live = assess(inst.BTC, { asOf: "2026-09-26T11:59:30Z", frequency: "REALTIME" }, SAT);
  assert.equal(live.state, "LIVE");
  assert.equal(live.realtimeClaimAllowed, true);
});

test("EUR/USD am Samstag: Wochenende aus dem Currency Core, Freitagsschluss ist LAST_SESSION", () => {
  const s = Profiles.stateAt("FX_24_5", SAT, { calendar });
  assert.equal(s.isOpen, false);
  assert.equal(s.delegate, "quant/engines/fx/fx-freshness.js#marketPhase");
  const r = assess(inst.EURUSD, { asOf: "2026-09-25T21:40:00Z", frequency: "INTRADAY" }, SAT);
  assert.equal(r.state, "LAST_SESSION");
});

test("EUR/USD am Montag: Handel laeuft wieder", () => {
  assert.equal(Profiles.stateAt("FX_24_5", MON, { calendar }).isOpen, true);
});

test("US-Index am Wochenende: geschlossen, Freitagsschluss ist LAST_SESSION, nicht STALE", () => {
  const s = Profiles.stateAt("INDEX_US", SAT, { calendar, exchange: "XNYS" });
  assert.equal(s.isOpen, false);
  assert.equal(s.closedReason, "weekend");
  const r = assess(inst.SPX, { asOf: "2026-09-25", observationDate: "2026-09-25", frequency: "DAILY" }, SAT);
  assert.equal(r.state, "LAST_SESSION");
});

test("US-Index kennt keine Vorboerse: 08:00 New York ist geschlossen, nicht PRE_MARKET", () => {
  const s = Profiles.stateAt("INDEX_US", "2026-09-24T12:00:00Z", { calendar, exchange: "XNYS" });
  assert.equal(s.marketState, "CLOSED");
});

test("DAX nach deutscher Zeit: 10:00 Berlin offen (in New York ist es 04:00)", () => {
  const s = Profiles.stateAt("INDEX_EU", "2026-09-24T08:00:00Z", { calendar, exchange: "XETR" });
  assert.equal(s.isOpen, true);
  assert.equal(s.timezone, "Europe/Berlin");
  const ny = Profiles.stateAt("INDEX_US", "2026-09-24T08:00:00Z", { calendar, exchange: "XNYS" });
  assert.equal(ny.isOpen, false);
});

test("DAX an Heiligabend: Xetra-Feiertag", () => {
  const s = Profiles.stateAt("INDEX_EU", "2026-12-24T10:00:00Z", { calendar, exchange: "XETR" });
  assert.equal(s.closedReason, "holiday");
});

test("Gold am Wochenende: Wochenfenster geschlossen, Freitagsstand LAST_SESSION", () => {
  const s = Profiles.stateAt("METALS_OTC_24_5", SAT, { calendar });
  assert.equal(s.marketState, "WEEKEND");
  assert.equal(assess(inst.GOLD, { asOf: "2026-09-25T20:55:00Z", frequency: "INTRADAY" }, SAT).state, "LAST_SESSION");
  /* Ein Stand von Donnerstag ist auch am Samstag eine Luecke. */
  assert.equal(assess(inst.GOLD, { asOf: "2026-09-24T15:00:00Z", frequency: "INTRADAY" }, SAT).state, "STALE");
});

test("Oel (Future-Profil) in der Tagespause 17-18 Uhr New York: DAILY_BREAK, nicht 24/7", () => {
  const s = Profiles.stateAt("COMMODITY_FUTURES", "2026-09-24T21:30:00Z", { calendar });
  assert.equal(s.marketState, "DAILY_BREAK");
  assert.equal(s.isOpen, false);
  assert.equal(assess(inst.WTI_FUT, { asOf: "2026-09-24T20:58:00Z", frequency: "INTRADAY" }, "2026-09-24T21:30:00Z").state, "LAST_SESSION");
  assert.equal(Profiles.stateAt("COMMODITY_FUTURES", "2026-09-24T22:30:00Z", { calendar }).isOpen, true);
});

test("Leitzins zwischen zwei Beschluessen: derselbe Wert bleibt CURRENT", () => {
  /* Beschluss im Juni, heute September - solange die Quelle gerade
     abgefragt wurde, ist das kein veralteter Wert. */
  const r = assess(inst.ECB, { asOf: "2026-06-11", observationDate: "2026-06-11", effectiveSince: "2026-06-11",
                               checkedAt: "2026-09-26T06:20:00Z", frequency: "EVENT" }, SAT);
  assert.equal(r.state, "CURRENT");
  assert.equal(r.reason, "stepSeriesValidUntilNextDecision");
  const unchecked = assess(inst.ECB, { asOf: "2026-06-11", checkedAt: "2026-09-10T06:20:00Z", frequency: "EVENT" }, SAT);
  assert.equal(unchecked.state, "STALE");
});

test("US-Rendite: Veroeffentlichung am Geschaeftstag, Wochenende ist kein Rueckstand", () => {
  /* Samstag: faellig ist Freitag. */
  assert.equal(assess(inst.US10Y, { observationDate: "2026-09-25", frequency: "DAILY" }, SAT).state, "CURRENT");
  /* Donnerstag Vormittag New York: der Mittwochswert ist der juengste faellige. */
  assert.equal(assess(inst.US10Y, { observationDate: "2026-09-23", frequency: "DAILY" }, "2026-09-24T14:00:00Z").state, "CURRENT");
  /* Eine Woche alt ist veraltet. */
  const old = assess(inst.US10Y, { observationDate: "2026-09-16", frequency: "DAILY" }, "2026-09-24T14:00:00Z");
  assert.equal(old.state, "STALE");
  assert.equal(old.reason, "publicationMissing");
});

test("ohne Beobachtung: UNAVAILABLE, nie ein erfundener Stand", () => {
  assert.equal(assess(inst.BTC, null, SAT).state, "UNAVAILABLE");
});
