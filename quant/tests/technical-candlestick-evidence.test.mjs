/* Kerzenmuster-Evidenz (scripts/technical/candlestick-evidence.mjs, docs/technical/CANDLESTICK_EVIDENCE.md).
   Prueft die Bausteine: Ereignisse = Treffer von candlesticks.js, Datums-Cluster im Intervall, Bonferroni-z.
   Der Lauf ueber das Universum ist das Skript, nicht dieser Test. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { eventsOf, stats, zFor } from "../../scripts/technical/candlestick-evidence.mjs";

const require = createRequire(import.meta.url);
const Cdl = require("../engines/technical/candlesticks.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const bars = { open: ref.open, high: ref.high, low: ref.low, close: ref.close };

test("Ereignisse sind genau die Treffer von candlesticks.js, neutrale Muster ohne Richtung, kausal", () => {
  const ev = eventsOf(bars), res = Cdl.detect(bars).patterns;
  let n = 0;
  for (const p of Cdl.PATTERNS) for (let i = 0; i < res[p.id].length; i++) if (res[p.id][i] === 1 || res[p.id][i] === -1) n++;
  assert.equal(ev.length, n);
  for (const [id, dir, i] of ev) {
    assert.equal(dir, Cdl.pattern(id).direction === "neutral" ? 0 : res[id][i], id + "@" + i);
  }
  /* Abgeschnitten bei k: dieselben Ereignisse bis k (kein Vorgriff). */
  const k = 200, cut = { open: bars.open.slice(0, k + 1), high: bars.high.slice(0, k + 1), low: bars.low.slice(0, k + 1), close: bars.close.slice(0, k + 1) };
  assert.deepEqual(eventsOf(cut), ev.filter((e) => e[2] <= k));
});

test("Intervall ueber Datums-Cluster: viele Ereignisse am selben Tag zaehlen wie ein Tag", () => {
  const spread = [["d1", 0.01], ["d2", 0.03], ["d3", 0.02], ["d4", 0.04]];
  const clumped = spread.concat(Array.from({ length: 96 }, () => ["d1", 0.01]));
  const a = stats(spread), b = stats(clumped);
  assert.equal(a.dates, 4); assert.equal(b.dates, 4);
  assert.equal(a.mean, b.mean, "Datumsmittel: d1 bleibt 0,01");
  assert.equal(a.ci95, b.ci95, "100 Ereignisse an 4 Tagen sind nicht 100 unabhaengige Faelle");
  assert.equal(b.n, 100);
  assert.equal(stats([["d", 0.01], ["e", -0.01]]).hitRate, 0.5);
});

test("Bonferroni: z waechst mit der Zahl der Tests", () => {
  assert.ok(Math.abs(zFor(0.05) - 1.96) < 0.01);
  assert.ok(zFor(0.05 / 200) > zFor(0.05 / 10));
});
