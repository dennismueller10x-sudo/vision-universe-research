/* Markets-Movers und Steigend/Fallend rechnen aus der veroeffentlichten
   Tagesreihe (movers-eod-1.0.0): Schluss der Sitzung gegen Schluss der
   Vorsitzung, dieselbe Definition wie core/client.js#getLatestPrice. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eodChange, MOVERS_METHOD_VERSION } from "../../scripts/market/build-market-pulse.mjs";

test("Tagesaenderung aus den beiden letzten Punkten, auf 4 Stellen in Prozent", () => {
  const pts = [["2026-09-30", 90], ["2026-10-01", 100], ["2026-10-02", 114.99]];
  assert.deepEqual(eodChange(pts, "2026-10-02", "2026-10-01"), { change: 14.99, last: 114.99 });
  /* dieselbe Rundung wie getLatestPrice: Math.round((l/p-1)*1e6)/1e4 */
  assert.equal(eodChange([["a", 3], ["b", 7]], "b", "a").change, Math.round((7 / 3 - 1) * 1e6) / 1e4);
});

test("Kein Wert bei fehlender Sitzung, Luecke oder ungueltigem Kurs - nie ein Ersatz", () => {
  const pts = [["2026-09-30", 90], ["2026-10-01", 100]];
  assert.equal(eodChange(pts, "2026-10-02", "2026-10-01"), null, "Sitzung fehlt (noch nicht veroeffentlicht)");
  assert.equal(eodChange([["2026-09-29", 90], ["2026-10-02", 100]], "2026-10-02", "2026-10-01"), null, "Luecke ueber mehr als eine Sitzung");
  assert.equal(eodChange([["2026-10-01", 0], ["2026-10-02", 100]], "2026-10-02", "2026-10-01"), null);
  assert.equal(eodChange(null, "2026-10-02", "2026-10-01"), null);
});

test("Erzeuger nutzt keinen IEX-Intraday-Pfad mehr fuer Movers", () => {
  const src = readFileSync(new URL("../../scripts/market/build-market-pulse.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /function intradayMoves|lastRegular\(/);
  assert.match(src, /eodMoves\(br\.rows, expectedAsOf\)/);
  assert.equal(MOVERS_METHOD_VERSION, "movers-eod-1.0.0");
  const cfg = JSON.parse(readFileSync(new URL("../../quant/config/market-pulse.json", import.meta.url), "utf8"));
  assert.equal(cfg.movers.methodVersion, MOVERS_METHOD_VERSION);
});
