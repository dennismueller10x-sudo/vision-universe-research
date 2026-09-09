/* =========================================================================
   PHASE 6 — GOLDEN FIVE: BACKTEST-DATENVORAUSSETZUNGEN ("GOLDEN CASE")

   Prueft scripts/quant/verify-golden-five-backtest-readiness.mjs's Ausgabe.
   Kein Backtest-Lauf wird hier geprueft (den gibt es nicht) - nur, dass die
   vier Zutaten (SEC PIT, Marktdaten, Corporate Actions, decisionTime <
   executionTime) fuer jeden Golden-Five-Titel tatsaechlich vorhanden sind
   und zueinander passen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = join(root, "quant", "data", "sec", "golden-five-pit-coverage", "backtest-readiness.json");
const TICKERS = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"];

test("BT1 · Golden-Case-Bericht existiert und deckt alle fuenf Titel ab", () => {
  assert.ok(existsSync(FILE), "backtest-readiness.json fehlt - verify-golden-five-backtest-readiness.mjs gelaufen?");
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  assert.equal(r.tickers.length, 5);
  TICKERS.forEach((t) => assert.ok(r.tickers.some((x) => x.ticker === t), t + " fehlt im Bericht"));
});

test("BT2 · jeder Titel ist bereit: SEC-PIT, Marktdaten, Corporate Actions und Reihenfolge stimmen", () => {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  r.tickers.forEach((t) => {
    assert.equal(t.ok, true, t.ticker + " ist nicht Golden-Case-bereit");
    assert.equal(t.marketData.hasExecutionPrice, true, t.ticker + ": kein Kurs am Ausfuehrungstag");
    assert.equal(t.marketData.orderingOk, true, t.ticker + ": decisionDate nicht vor executionDate");
    assert.equal(t.secPit.available, true, t.ticker + ": keine SEC-Fakten zum Stichtag");
    assert.ok(t.secPit.factsKnownAtDecisionDate > 0, t.ticker + ": null bekannte Fakten");
    assert.equal(t.secPit.noFutureLeak, true, t.ticker + ": ein Fakt war vor seiner Verfuegbarkeit sichtbar");
    assert.equal(t.corporateActions.schemaPresent, true, t.ticker + ": splitFactor/dividend fehlen in den Bars");
  });
});

test("BT3 · decisionDate liegt tatsaechlich vor executionDate (Kalenderdaten, nicht nur ein Flag)", () => {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  r.tickers.forEach((t) => {
    assert.ok(t.decisionDate < t.executionDate, t.ticker + ": " + t.decisionDate + " >= " + t.executionDate);
  });
});
