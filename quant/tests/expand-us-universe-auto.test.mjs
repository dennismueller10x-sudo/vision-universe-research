// Dauerregel der Mitgliedschaft (expand-us-universe --auto, Steuerung 17./18.11.2026): neue Titel bleiben nicht liegen,
// aber je Lauf hoechstens N, nur mit reinem Kuerzel und nur, wenn die SEC sie an derselben Boersenfamilie fuehrt.
// Aelteste Notierung zuerst; der Rest wartet (deferred). Der Bestand bleibt zeichengleich vorne.
import test from "node:test";
import assert from "node:assert/strict";
import { appendOnlyMerge, indexSecTickers, autoRejectReason } from "../../scripts/market/expand-us-universe.mjs";

const baseline = [{ securityId: "ref_NVDA", ticker: "NVDA", exchange: "NASDAQ" }];
const row = (ticker, start, over = {}) => ({ ticker, reconciliation_status: "ADDED", eligible_us_equity: true, instrument_type: "EQUITY_COMMON",
  venue_tier: "PRIMARY", active_status: "ACTIVE", exchange: "NASDAQ", start_date: start, ...over });
/* Form wie https://www.sec.gov/files/company_tickers_exchange.json */
const SEC = { fields: ["cik", "name", "ticker", "exchange"], data: [
  [1, "Alt AG", "ALT", "Nasdaq"], [2, "Neu Inc", "NEU", "Nasdaq"], [3, "Mitte Corp", "MID", "NYSE"], [4, "Ami Corp", "AMI", "NYSE"],
  [5, "Otc Ltd", "OTCX", "OTC"], [6, "Falsch Inc", "WRONG", "NYSE"], [7, "Test", "TEST235", "NYSE"], [8, "Nvidia", "NVDA", "Nasdaq"] ] };
const secBy = indexSecTickers(SEC);
const master = [
  row("NEU", "2026-11-02"), row("ALT", "1996-01-10"), row("MID", "2018-04-30", { exchange: "NYSE" }),
  row("AMI", "2026-09-18", { exchange: "NYSE MKT" }),               // NYSE American: SEC fuehrt "NYSE"
  row("OTCX", "2025-01-01"),                                        // SEC: Freiverkehr
  row("WRONG", "2024-01-01"),                                       // Anbieter NASDAQ, SEC NYSE
  row("TEST235", "2026-10-19", { exchange: "NYSE" }),               // kein reines Kuerzel
  row("LOB/PR/B", "2026-11-16", { exchange: "NYSE" }),
  row("NOSEC", "2026-10-01"),                                       // SEC kennt den Ticker nicht
  row("NVDA", "1999-01-22"),                                        // schon im Bestand
  row("PREF", "2020-01-01", { reconciliation_status: "REVIEW", eligible_us_equity: false, instrument_type: "PREFERRED" })
];

test("AU1 · Filter: reines Kuerzel, SEC an derselben Boersenfamilie", () => {
  assert.equal(autoRejectReason(row("ALT", "x"), secBy), null);
  assert.equal(autoRejectReason(row("AMI", "x", { exchange: "NYSE MKT" }), secBy), null);
  assert.equal(autoRejectReason(row("OTCX", "x"), secBy), "secNotOnExchange");
  assert.equal(autoRejectReason(row("WRONG", "x"), secBy), "secExchangeMismatch");
  assert.equal(autoRejectReason(row("TEST235", "x"), secBy), "tickerForm");
  assert.equal(autoRejectReason(row("LOB/PR/B", "x"), secBy), "tickerForm");
  assert.equal(autoRejectReason(row("NOSEC", "x"), secBy), "secNotListed");
});

test("AU2 · Obergrenze: aelteste Notierung zuerst, der Rest wartet, Bestand unveraendert vorne", () => {
  const r = appendOnlyMerge(baseline, master, { auto: { max: 2, secBy } });
  assert.deepEqual(r.appended.map((e) => e.ticker), ["ALT", "MID"]);
  assert.deepEqual(r.deferred.sort(), ["ref_AMI", "ref_NEU"]);
  assert.equal(r.skipped.deferredOverCap, 2);
  assert.deepEqual(r.entries.slice(0, 1), baseline);
  assert.equal(r.skipped.alreadyInBaseline, 1);
  assert.equal(r.skipped.secNotOnExchange, 1); assert.equal(r.skipped.secExchangeMismatch, 1);
  assert.equal(r.skipped.tickerForm, 2); assert.equal(r.skipped.secNotListed, 1);
});

test("AU3 · Grenze 0 haengt nichts an; ohne --auto bleibt das bisherige Verhalten", () => {
  const r0 = appendOnlyMerge(baseline, master, { auto: { max: 0, secBy } });
  assert.equal(r0.appended.length, 0); assert.equal(r0.deferred.length, 4);
  assert.equal(appendOnlyMerge(baseline, master).appended.length, 9, "ohne Filter kaemen auch TEST235 und LOB/PR/B");
  assert.deepEqual(appendOnlyMerge(baseline, master).deferred, []);
});

test("AU4 · SEC-Liste ohne Pflichtfelder bricht ab (fail closed)", () => {
  assert.throws(() => indexSecTickers({ fields: ["cik", "name"], data: [] }), /Felder/);
  assert.throws(() => indexSecTickers(null), /fields/);
});
