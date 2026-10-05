/* Eine Split-Bereinigung (ADR-002): der Discover-Publisher leitet den
   Faktor aus quant/engines/return-series.js#splitFactors ab, nicht aus
   einer eigenen Schleife. Vorher/Nachher auf den Golden-Preview-Reihen
   (AAPL, NVDA, MSFT, JPM, XOM, 14.775 Balken, mehrere Splits): bitgleich. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { splitAdjustedCloses } from "../../scripts/market/publish-discover-series.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ReturnSeries = createRequire(import.meta.url)(join(ROOT, "quant", "engines", "return-series.js"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* Die bis 10/2026 im Publisher eigene Schleife - als Referenz eingefroren. */
function vorher(bars) {
  const f = new Array(bars.length).fill(1);
  let c = 1;
  for (let i = bars.length - 1; i >= 0; i--) { f[i] = c; const sf = bars[i].splitFactor; if (isNum(sf) && sf !== 1) c *= sf; }
  return bars.map((b, i) => (isNum(b.close) ? b.close / f[i] : null));
}

test("Publisher: bitgleich zur frueheren Schleife auf den Golden-Reihen", () => {
  const dir = join(ROOT, "quant", "data", "market", "golden-preview", "daily");
  let n = 0;
  for (const file of readdirSync(dir)) {
    const bars = JSON.parse(readFileSync(join(dir, file), "utf8")).bars;
    assert.deepEqual(splitAdjustedCloses(bars).map((b) => b.close), vorher(bars), file);
    n += bars.length;
  }
  assert.ok(n > 10000);
});

test("Publisher: Faktor ist der aus return-series.js", () => {
  const bars = [{ date: "2024-06-07", close: 1200, splitFactor: 1 }, { date: "2024-06-10", close: 121, splitFactor: 10 }, { date: "2024-06-11", close: 122, splitFactor: 1 }];
  const f = ReturnSeries.splitFactors(bars);
  assert.deepEqual(splitAdjustedCloses(bars).map((b) => b.close), bars.map((b, i) => b.close / f[i]));
  assert.equal(splitAdjustedCloses(bars)[0].close, 120);
});

test("Publisher: ein Splitfaktor <= 0 wirkt nicht (vorher -Infinity und negative Kurse)", () => {
  const bars = [{ date: "2020-01-01", close: 10 }, { date: "2020-01-02", close: 10, splitFactor: 0 }, { date: "2020-01-03", close: 5, splitFactor: -3 }];
  assert.deepEqual(splitAdjustedCloses(bars).map((b) => b.close), [10, 10, 5]);
});
