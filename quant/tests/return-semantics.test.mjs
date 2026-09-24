import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import contract from "../methodology/return-semantics-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Semantics = require("../engines/return-semantics.js");
const MarketFactors = require("../engines/market-factors.js");

const ROOT = new URL("../../", import.meta.url);
const bars = [{ close: 100, adjustedClose: 90 }, { close: 101, adjustedClose: 91 }];

test("the owner's split is written down machine-readably", () => {
  assert.deepEqual(Semantics.validate(contract), { valid: true, errors: [] });
  assert.equal(contract.approval.state, "APPROVED");
  assert.match(contract.approval.approvedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(
    { ...contract.gateStatus, note: undefined },
    { RETURN_SEMANTICS_CONTRACT_ACTIVE: "PASS",
      PRICE_MODULES_BASIS: "SPLIT_ADJUSTED_PRICE",
      PERFORMANCE_MODULES_BASIS: "TOTAL_RETURN",
      QUANT_V1: "LEGACY_IMMUTABLE",
      QUANT_V2_MOMENTUM_BASIS: "PENDING_METHODOLOGY_DECISION",
      note: undefined });
});

test("price modules take a price, performance modules take a total return", () => {
  /* The two halves of the decision, asserted as membership rather than
     restated as prose that can drift from the contract. */
  assert.deepEqual(Semantics.modulesByBasis("SPLIT_ADJUSTED_PRICE").sort(),
    ["chart", "elliott", "setup", "technical"]);
  assert.deepEqual(Semantics.modulesByBasis("TOTAL_RETURN").sort(),
    ["backtest", "benchmark", "portfolioPerformance"]);
  for (const id of ["chart", "technical", "setup", "elliott"]) {
    assert.equal(Semantics.basisEntry(Semantics.requiredBasis(id)).includesDistributions, false, id);
  }
  for (const id of ["backtest", "portfolioPerformance", "benchmark"]) {
    assert.equal(Semantics.basisEntry(Semantics.requiredBasis(id)).includesDistributions, true, id);
  }
});

test("a module is refused the wrong basis rather than quietly given it", () => {
  /* This is the whole contract in one assertion. Before it, priceBasis()
     took adjustedClose whenever a trustworthy adjusted column existed and
     did not distinguish split-adjusted from total-return. The provider
     reports splitAdjusted today, so nothing looked wrong; raising that to
     "adjusted" would have switched technical structure, setup states and
     momentum to total return with no code change and no published number
     announcing it. */
  assert.equal(MarketFactors.priceBasis(bars, "splitAdjusted", "technical"), "adjustedClose");
  assert.throws(() => MarketFactors.priceBasis(bars, "adjusted", "technical"),
    (error) => error.reason === "RETURN_BASIS_MISMATCH" &&
      error.wanted === "SPLIT_ADJUSTED_PRICE" && error.served === "TOTAL_RETURN");
  /* And symmetrically: a performance module may not be handed a price. */
  assert.equal(MarketFactors.priceBasis(bars, "adjusted", "backtest"), "adjustedClose");
  assert.throws(() => MarketFactors.priceBasis(bars, "splitAdjusted", "backtest"),
    (error) => error.reason === "RETURN_BASIS_MISMATCH");
});

test("the silent switch is impossible for every price module at once", () => {
  /* Named one by one, because a loop that ran over an empty list would
     pass just as loudly. */
  const priceModules = Semantics.modulesByBasis("SPLIT_ADJUSTED_PRICE");
  assert.ok(priceModules.length >= 4);
  for (const id of priceModules) {
    assert.throws(() => MarketFactors.priceBasis(bars, "adjusted", id),
      (error) => error.reason === "RETURN_BASIS_MISMATCH", id + " would silently switch to total return");
  }
});

test("Quant V1 is refused any basis at all", () => {
  /* Not "give it the old one": it is not this contract's to serve. A
     retroactive change to published V1 figures does not happen, whichever
     basis is better argued today. */
  assert.equal(Semantics.isLegacy("quantV1"), true);
  assert.equal(Semantics.requiredBasis("quantV1"), Semantics.LEGACY);
  const resolved = Semantics.resolveColumn("quantV1", "adjusted", true);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, "MODULE_IS_LEGACY_IMMUTABLE");
});

test("Quant V2 momentum stays undecided, and keeps publishing what it publishes today", () => {
  /* Undecided must not mean unresolved at the call site: leaving it open
     would make every caller invent an answer, which is the silent
     redefinition by a different route. */
  assert.equal(Semantics.isPending("quantV2Momentum"), true);
  assert.equal(Semantics.requiredBasis("quantV2Momentum"), "SPLIT_ADJUSTED_PRICE");
  const entry = Semantics.moduleEntry("quantV2Momentum");
  assert.equal(entry.decision.state, "PENDING_EVIDENCE");
  assert.equal(entry.decision.requiresEmpiricalComparison, true);
  assert.ok(entry.decision.report);
});

test("the empirical comparison exists, and is honest about what it cannot decide", () => {
  const study = JSON.parse(readFileSync(new URL("quant/data/providers/momentum-return-basis-study.json", ROOT), "utf8"));
  assert.ok(study.seriesStudied >= 3);
  assert.equal(study.canDecideTheFactor, false);
  assert.match(study.whyNot, /Rangfolge|RANGFOLGE/);
  assert.ok(study.whatWouldDecideIt.length > 40);
  /* The direction it DOES establish: every series is higher on total
     return, and the gap follows the payout. A momentum factor on total
     return would carry a dividend tilt it does not have on price. */
  assert.equal(study.yieldTilt.everySeriesHigherOnTotalReturn, true);
  assert.ok(study.yieldTilt.spearmanYieldVsDifference >= 0.7,
    "the yield relationship this sample showed is gone");
  assert.ok(study.yieldTilt.reading.includes("Rangwirkung"));
  /* And it changed nothing. */
  assert.match(study.note, /aendert keinen veroeffentlichten Wert/);
});

test("historical universe membership is not substituted by the current one", () => {
  /* Stated by the owner as its own certification gap. The backtest's
     basis being settled must not read as the backtest being closer to
     open than it is. */
  const backtest = Semantics.moduleEntry("backtest");
  assert.equal(backtest.activation.state, "CLOSED");
  assert.equal(backtest.activation.reason, "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING");
  assert.match(backtest.activation.note, /kein Freigabeschritt/);
  /* Asserted on what the checker OUTPUTS, not on how its source is
     written. A first attempt matched the source text and failed on a
     string concatenation - it was testing formatting, not meaning, and
     the message that matters is the one a reader gets. */
  const output = execFileSync(process.execPath, ["scripts/quant/assert-product-completeness.mjs"],
    { cwd: new URL(".", ROOT).pathname, encoding: "utf8" });
  assert.match(output, /BLOCKED/);
  assert.match(output, /BACKTEST · Backtest integration stays shut/);
  assert.match(output, /historical index membership \(1 snapshot per index\)/);
  assert.match(output, /No measurement creates it retroactively/);
  /* And the settled return basis did not quietly move the backtest closer
     to open: total return is reported separately, as a decision. */
  assert.match(output, /TOTAL_RETURN_AVAILABLE_BUT_NOT_PUBLISHED/);
  assert.equal(/BACKTEST[^\n]*\n[^\n]*total-return/.test(output), false,
    "total return is still counted against the backtest blocker");
});

test("an existing caller that names no module keeps computing what it computed", () => {
  /* The contract is enforced where a module asks for it. Changing every
     unnamed caller at once would have been exactly the silent
     redefinition it forbids. */
  assert.equal(MarketFactors.priceBasis(bars, "splitAdjusted"), "adjustedClose");
  assert.equal(MarketFactors.priceBasis(bars, "adjusted"), "adjustedClose");
  assert.equal(MarketFactors.priceBasis([{ close: 100 }], "unknown"), "close");
});
