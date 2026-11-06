import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromRecommendation, fromTarget, due, wantsTarget, writeAll, summarize } from "../fetch-consensus.mjs";

test("AC-1 · Einstufungen: neueste Periode zaehlt, Verlauf bis 6, ohne Analysten NO_COVERAGE", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ period: `2026-${String(11 - i).padStart(2, "0")}-01`, strongBuy: 10 + i, buy: 40, hold: 8, sell: 1, strongSell: 0 }));
  const e = fromRecommendation(rows.reverse());
  assert.equal(e.ratingsState, "AVAILABLE"); assert.equal(e.asOf, "2026-11-01"); assert.equal(e.analysts, 59);
  assert.deepEqual(e.counts, { strongBuy: 10, buy: 40, hold: 8, sell: 1, strongSell: 0 });
  assert.equal(e.history.length, 6);
  assert.equal(fromRecommendation([]).ratingsState, "NO_COVERAGE");
  assert.equal(fromRecommendation([{ period: "2026-11-01", strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }]).ratingsState, "NO_COVERAGE");
});

test("AC-2 · Kursziel nur mit Zahl; FMP hoechstens alle 30 Tage und nur bei Coverage", () => {
  assert.deepEqual(fromTarget([{ targetConsensus: 210, targetMedian: 205, targetHigh: 260, targetLow: 150 }]), { consensus: 210, median: 205, high: 260, low: 150, source: "FMP" });
  assert.equal(fromTarget([{}]), null);
  assert.equal(wantsTarget({ ratingsState: "NO_COVERAGE" }, "2026-11-06"), false);
  assert.equal(wantsTarget({ ratingsState: "AVAILABLE" }, "2026-11-06"), true);
  assert.equal(wantsTarget({ ratingsState: "AVAILABLE", targetCheckedAt: "2026-10-20" }, "2026-11-06"), false);
  assert.equal(wantsTarget({ ratingsState: "AVAILABLE", targetCheckedAt: "2026-10-01" }, "2026-11-06"), true);
});

test("AC-3 · Rotation: nie abgefragt zuerst, dann aeltester Abruf", () => {
  const U = [{ securityId: "ref_A", ticker: "A" }, { securityId: "ref_B", ticker: "B" }, { securityId: "ref_C", ticker: "C" }];
  const E = { ref_A: { fetchedAt: "2026-11-05" }, ref_C: { fetchedAt: "2026-11-01" } };
  assert.deepEqual(due(U, E, 2).map((s) => s.ticker), ["B", "C"]);
});

test("AC-4 · Ausgabe: Shards nach shardKey, Titel ausserhalb des Universums fallen weg, Abdeckung im Summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  const U = [{ securityId: "ref_NVDA", ticker: "NVDA" }, { securityId: "ref_F", ticker: "F" }];
  const E = { ref_NVDA: { securityId: "ref_NVDA", ticker: "NVDA", ratingsState: "AVAILABLE", analysts: 69, targetState: "AVAILABLE", fetchedAt: "2026-11-06" },
    ref_F: { securityId: "ref_F", ticker: "F", ratingsState: "NO_COVERAGE", analysts: 0, targetState: "NOT_CHECKED", fetchedAt: "2026-11-05" },
    ref_GONE: { securityId: "ref_GONE", ticker: "GONE", ratingsState: "AVAILABLE", analysts: 3, fetchedAt: "2026-11-01" } };
  const s = writeAll(dir, E, U, "2026-11-06");
  assert.ok(existsSync(join(dir, "shards", "NV.json")) && existsSync(join(dir, "shards", "F_.json")));
  assert.equal(JSON.parse(readFileSync(join(dir, "shards", "NV.json"), "utf8")).entries.ref_NVDA.analysts, 69);
  assert.deepEqual(s.counts, { universe: 2, fetched: 2, withRatings: 1, withTarget: 1, shareRatings: 0.5, shareTarget: 0.5, medianAnalysts: 69 });
  assert.equal(s.oldestFetch, "2026-11-05");
  assert.deepEqual(s.shards, ["F_", "NV"]);
});

test("AC-5 · leeres Universum ergibt Anteile 0, kein Teilen durch null", () => {
  assert.equal(summarize({}, 0, "2026-11-06").counts.shareRatings, 0);
});
