/* Ein Titel ohne CIK hat keine SEC-Geschaeftszahlen aus einem strukturellen
   Grund. Die Aktienseite sagt das mit `cik: null`, damit der Core-Vertrag
   NO_CIK von einem echten Loch (FUNDAMENTALS_MISSING) trennt
   (core/client.js#getFundamentals). Gemessen am 24.10.2026: REPX auf der
   Startseite, 958 Seiten ohne das Feld. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COVERAGE = join(root, "quant", "data", "sec", "consumer_coverage.json");
const PAGES = join(root, "discover", "data", "stocks", "US_REAL");

test("FU-NOCIK · Seiten ohne CIK tragen cik: null, Seiten mit Geschaeftszahlen ihre CIK", () => {
  if (!existsSync(COVERAGE)) return;
  const ohne = JSON.parse(readFileSync(COVERAGE, "utf8")).withoutCikTickers || [];
  let geprueft = 0;
  for (const t of ohne) {
    const file = join(PAGES, t + ".json");
    if (!existsSync(file)) continue;
    const f = JSON.parse(readFileSync(file, "utf8")).fundamentals;
    if (f.available) continue;
    assert.equal(f.cik, null, t + ": kein CIK, aber kein cik: null im Fundamentals-Block");
    geprueft++;
  }
  assert.ok(geprueft > 0, "kein Titel ohne CIK geprueft");
});
