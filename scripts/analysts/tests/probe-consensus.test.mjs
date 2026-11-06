import test from "node:test";
import assert from "node:assert/strict";
import { sample, readout, summarize } from "../probe-consensus.mjs";

test("AP-1 · Stichprobe deterministisch, Anker zuerst, keine Doppelung", () => {
  const t = ["AAPL", "MSFT", "NVDA", "A", "B", "C", "D", "E"];
  const a = sample(t, 3, 7), b = sample(t, 3, 7);
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice(0, 3), ["NVDA", "AAPL", "MSFT"]);
  assert.equal(new Set(a).size, a.length);
  assert.equal(a.length, 6);
});

test("AP-2 · Auswertung je Endpunkt: neueste Periode zaehlt, Kursziel nur mit Zahl", () => {
  const rec = readout("finnhub:recommendation", [{ period: "2026-10-01", strongBuy: 1, buy: 1, hold: 0, sell: 0, strongSell: 0 },
    { period: "2026-11-01", strongBuy: 20, buy: 40, hold: 8, sell: 1, strongSell: 0 }]);
  assert.deepEqual(rec, { ratings: true, analysts: 69, asOf: "2026-11-01" });
  assert.equal(readout("finnhub:price-target", {}).target, false);
  assert.equal(readout("fmp:price-target-consensus", [{ targetConsensus: 210.5 }]).target, true);
  assert.equal(readout("fmp:grades-consensus", [{ strongBuy: 2, buy: 3, hold: 1, sell: 0, strongSell: 0 }]).analysts, 6);
});

test("AP-3 · Zusammenfassung: Anteile und Median je Endpunkt, HTTP-Status gezaehlt", () => {
  const s = summarize([
    { endpoint: "e", status: 200, readout: { ratings: true, analysts: 10 } },
    { endpoint: "e", status: 200, readout: { ratings: true, analysts: 30 } },
    { endpoint: "e", status: 403, readout: null }]);
  assert.equal(s.e.asked, 3); assert.equal(s.e.ratings, 2); assert.equal(s.e.shareRatings, 0.667);
  assert.equal(s.e.medianAnalysts, 10); assert.deepEqual(s.e.http, { 200: 2, 403: 1 });
});
