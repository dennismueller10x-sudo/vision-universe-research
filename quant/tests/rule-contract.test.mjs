import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Rules = require("../engines/rule-contract.js");
const Query = require("../engines/query.js");
const Screener = require("../api/screener-workspace.js");
const Strategy = require("../engines/strategy.js");
const Backtest = require("../engines/backtest.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");
const Alerts = require("../api/alert-rule-contract.js");

const filters = [
  { field: "revenueGrowth", operator: "gte", value: 20, scale: "raw" },
  { field: "momentum6m", operator: "gte", value: 10, scale: "raw" }
];

test("Screener and Strategy share one canonical selection predicate", () => {
  const query = Screener.build(filters, [{ field: "momentum6m", direction: "desc" }]);
  const definition = Strategy.createDefinition({ filters });
  const fromScreen = Screener.predicate(query);
  const fromStrategy = Strategy.selectionPredicate(definition);
  assert.deepEqual(fromStrategy, fromScreen);
  assert.equal(Rules.predicateHash(fromStrategy), Rules.predicateHash(fromScreen));
});

test("sort and limit do not change rule identity", () => {
  const first = Query.createQuery({ filters, sort: [{ field: "momentum6m", direction: "desc" }], limit: 5 });
  const second = Query.createQuery({ filters, sort: [{ field: "revenueGrowth", direction: "asc" }], limit: 500 });
  assert.notEqual(Query.queryHash(first), Query.queryHash(second));
  assert.equal(Rules.predicateHash(Rules.fromQuery(first)), Rules.predicateHash(Rules.fromQuery(second)));
});

test("rule evaluation and transitions delegate to Query semantics", () => {
  const predicate = Rules.create({ filters: [{ field: "momentum6m", operator: "gte", value: 10, scale: "raw" }] });
  assert.equal(Rules.matches({ momentum6m: null }, predicate), false);
  assert.equal(Rules.transition({ momentum6m: 9 }, { momentum6m: 10 }, predicate), "ENTERED");
  assert.equal(Rules.transition({ momentum6m: 12 }, { momentum6m: 8 }, predicate), "EXITED");
  assert.equal(Rules.transition({ momentum6m: 12 }, { momentum6m: 11 }, predicate), null);
});

test("Backtest base selection keeps portfolio constraints outside rule identity", () => {
  const dataset = Generator.generateDataset({ securities: 12, startDate: "2024-01-02", endDate: "2026-09-04" });
  const provider = MockProvider.createMockProvider({ dataset });
  const definition = Strategy.createDefinition({
    filters,
    portfolio: { positions: 25, minMarketCapM: 1000, minDollarVolumeM: 10 }
  });
  const selection = Backtest.selectCandidates({
    provider,
    definition,
    pricePanel: provider.getPricePanel().data,
    dataSnapshotId: dataset.meta.dataSnapshotId,
    percentileFields: [],
    sawMock: false,
    sawReal: false
  }, "2026-06-30");
  assert.equal(selection.predicateHash, Rules.predicateHash(Strategy.selectionPredicate(definition)));
  assert.equal(selection.constraintFilters.length, 2);
  assert.deepEqual(Strategy.selectionPredicate(definition).filters, filters);
});

test("internal alerts are deterministic, fail closed and configure no delivery", () => {
  const predicate = Rules.create({ filters: [{ field: "momentum6m", operator: "gte", value: 10, scale: "raw" }] });
  const alert = Alerts.create({ alertId: "momentum-entered", predicate });
  const context = { observedAt: "2026-09-18T20:00:00Z" };
  const first = Alerts.evaluate(alert, { momentum6m: 9 }, { momentum6m: 10 }, context);
  const second = Alerts.evaluate(alert, { momentum6m: 9 }, { momentum6m: 10 }, context);
  assert.deepEqual(first, second);
  assert.equal(first.transition, "ENTERED");
  assert.equal(first.delivery, "NOT_CONFIGURED");
  assert.equal(Alerts.evaluate(alert, { momentum6m: 11 }, { momentum6m: 12 }, context), null);
  assert.throws(() => Alerts.evaluate({ ...alert, predicateHash: "rule_tampered" }, { momentum6m: 9 }, { momentum6m: 10 }, context));
});

test("unknown predicate fields are rejected", () => {
  const predicate = { ...Rules.create({ filters }), delivery: "email" };
  assert.equal(Rules.validate(predicate).valid, false);
  assert.throws(() => Rules.predicateHash(predicate));
  assert.equal(Rules.validate({ schemaVersion: "1.0", type: "stock_selection", universe: {}, filters: "not-an-array" }).valid, false);
});
