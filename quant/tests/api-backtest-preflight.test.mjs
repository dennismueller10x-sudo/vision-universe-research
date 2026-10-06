import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Strategy = require("../engines/strategy.js");

test("Product API blockiert nicht zertifizierte Regeln vor Worker und Provider", async () => {
  let workerConstructions = 0;
  function Worker() { workerConstructions += 1; }
  const window = {
    QuantShell: { BASE: "/quant/", DATA_FILES: {} },
    VUQuery: {}, VUStrategy: Strategy, VUMethodology: {}, VUHash: {}
  };
  const context = { window, Worker, localStorage: {}, console };
  vm.runInNewContext(readFileSync(new URL("../api/client.js", import.meta.url), "utf8"), context);

  const definition = Strategy.createDefinition({ filters: [
    { field: "elliottCountStatus", operator: "eq", value: "AMBIGUOUS", scale: "raw" }
  ] });
  const result = await window.QuantApi.runBacktest({ definition });
  assert.equal(result.ok, false);
  assert.equal(result.code, "RULE_METRIC_NOT_BACKTEST_CERTIFIED");
  assert.deepEqual(Array.from(result.blockedFields), ["elliottCountStatus"]);
  assert.equal(workerConstructions, 0);
});
