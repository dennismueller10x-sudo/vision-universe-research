/* Der Series-Loader dedupliziert: ein Pfad, ein Abruf - egal, wie viele
   Karten ihn brauchen und wie oft "prefetch" gerufen wird. Geprueft in
   Node mit einem gefaelschten Fenster und gezaehlten Abrufen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const quelle = readFileSync(join(root, "discover", "ui", "series-loader.js"), "utf8");

function frischerLoader(antworten) {
  const calls = [];
  const fenster = {
    QuantShell: null,
    fetch: (url) => { calls.push(url); const a = antworten[url];
      return Promise.resolve({ ok: !!a, status: a ? 200 : 404, json: () => Promise.resolve(a) }); }
  };
  const fn = new Function("window", "fetch", quelle.replace("(window);", "(window);"));
  fn(fenster, fenster.fetch);
  return { L: fenster.VUDiscover.SeriesLoader, calls };
}
const reihe = { status: "CALCULATED", source: "tiingo", priceSeriesType: "SPLIT_ADJUSTED", asOf: "2026-09-08",
                from: "2025-09-01", to: "2026-09-08", points: Array.from({ length: 30 }, (_, i) => ["2026-0" + (1 + i % 9) + "-01", 100 + i]) };

test("derselbe Pfad wird nur einmal geholt - auch bei drei Karten und einem Prefetch", async () => {
  const { L, calls } = frischerLoader({ "/discover/data/series/US_REAL/NVDA.json": reihe });
  L.prefetch("/discover/data/series/US_REAL/NVDA.json");
  const a = await L.get("/discover/data/series/US_REAL/NVDA.json");
  const b = await L.get("/discover/data/series/US_REAL/NVDA.json");
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  assert.deepEqual(L.stats(), { requests: 1, hits: 2, failures: 0, cached: 1 });
});

test("eine Reihe ohne Punkte wird abgelehnt und nicht als Chart durchgereicht", async () => {
  const { L } = frischerLoader({ "/x.json": { status: "CALCULATED", points: [] } });
  await assert.rejects(L.get("/x.json"), /ohne Punkte/);
  assert.equal(L.stats().failures, 1);
});

test("merge legt die Punkte an den Verweis, ohne den Zeitraum zu verlieren", () => {
  const { L } = frischerLoader({});
  const voll = L.merge({ status: "CALCULATED", range: "3M", path: "/p.json", points: null }, reihe);
  assert.equal(voll.range, "3M");
  assert.equal(voll.points.length, 30);
  assert.equal(voll.source, "tiingo");
});
