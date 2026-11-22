// Elliott-Neustart Schritt 2: Leitmaerkte gegen die echten Reihen (nur Struktur, keine festen Werte).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETS, marketSeries } from "../../scripts/technical/lib/ti-markets.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");

test("EML-1 · kein Marktkürzel ist zugleich eine Aktie der Langreihen", () => {
  for (const x of MARKETS) assert.ok(!existsSync(join(ROOT, "quant/data/market/discover-series-long", "ref_" + x.id + ".json")), x.id);
});

test("EML-2 · jede vorhandene Marktreihe trägt mindestens drei Jahre Wochenschlüsse", () => {
  for (const x of MARKETS) {
    const s = marketSeries(x);
    if (!s) continue;     // Reihe fehlt im Arbeitsbaum: der Build überspringt den Markt (skipped)
    assert.ok(s.series.length >= 160, x.id + ": " + s.series.length + " Wochen");
  }
});
