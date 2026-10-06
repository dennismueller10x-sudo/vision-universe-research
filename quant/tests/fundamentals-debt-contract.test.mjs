import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import methodology from "../methodology/fundamentals-debt-v1.json" with { type: "json" };
import registry from "../config/sec-metric-registry.json" with { type: "json" };

const ROOT = new URL("../../", import.meta.url);
const derived = readFileSync(new URL("scripts/quant/sec/derived.py", ROOT), "utf8");

const qualified = (metric) =>
  (registry.metrics[metric]?.concepts || []).map((c) => c.taxonomy + ":" + c.concept);

const LONG_TERM_ONLY = [
  "us-gaap:LongTermDebt", "us-gaap:LongTermDebtNoncurrent", "ifrs-full:LongtermBorrowings"
];

test("the owner decision is written down machine-readably, not only in prose", () => {
  assert.deepEqual(
    { ...methodology.gateStatus, note: undefined },
    { TOTAL_DEBT_METHOD: "OPTION_B", LONG_TERM_DEBT_FALLBACK: false,
      FINANCE_LEASE_SILENT_MERGE: false, note: undefined });
  assert.equal(methodology.approval.state, "APPROVED");
  assert.equal(methodology.approval.approvedOption, "OPTION_B");
  assert.ok(methodology.approval.approvedBy);
  assert.match(methodology.approval.approvedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("total_debt reads the combined amount and nothing that is only one side of it", () => {
  /* The forbidden substitution, enforced at the registry rather than
     remembered. A later mapping change that adds a long-term concept here
     would silently turn total_debt into something else under the same name;
     the census measured that it would reach 3,456 instead of 2,929, which
     is exactly the kind of "improvement" that would look like progress. */
  const concepts = qualified("total_debt");
  assert.deepEqual(concepts.slice().sort(), methodology.definition.order[0].concepts.slice().sort());
  for (const forbidden of LONG_TERM_ONLY) {
    assert.equal(concepts.includes(forbidden), false,
      "total_debt falls back to a long-term-only concept: " + forbidden);
  }
});

test("no finance lease concept reaches total_debt, by any of its three routes", () => {
  /* Directly, or through either input of the derivation. All three are
     checked because the merge this forbids would be silent on any of them. */
  const leases = methodology.forbidden.find((rule) => rule.id === "FINANCE_LEASE_SILENT_MERGE").concepts;
  assert.ok(leases.length >= 3);
  for (const metric of ["total_debt", "long_term_debt", "short_term_debt"]) {
    const concepts = qualified(metric);
    for (const lease of leases) {
      assert.equal(concepts.includes(lease), false,
        metric + " carries the finance lease concept " + lease);
    }
  }
});

test("the derivation is exactly the approved formula, read from the code that runs it", () => {
  /* Not from a copy of it. A methodology that states a formula the
     implementation no longer uses is the failure this pair exists to
     prevent. */
  assert.match(derived, /"total_debt":\s*"long_term_debt \+ short_term_debt"/);
  assert.equal(methodology.definition.order[1].formula, "long_term_debt + short_term_debt");
  assert.equal(methodology.definition.order[1].source, "DERIVED");
  /* And the derived value stays distinguishable from a reported one. */
  assert.match(derived, /PASS_THROUGH_METRICS\s*=\s*\([^)]*"total_debt"/);
});

test("every forbidden rule names its measured price and the test that holds it", () => {
  /* A prohibition without a number is an opinion. Each one here says what
     refusing it costs, so the decision can be revisited against evidence
     rather than re-argued. */
  assert.ok(methodology.forbidden.length >= 2);
  for (const rule of methodology.forbidden) {
    assert.ok(rule.why.length > 80, rule.id + ": no reason given");
    assert.match(rule.why, /\d/, rule.id + ": the reason carries no measured figure");
    assert.equal(rule.enforcedBy, "quant/tests/fundamentals-debt-contract.test.mjs");
  }
});

test("finance leases stay unmodelled and the open cohort stays non-blocking", () => {
  assert.equal(methodology.financeLeaseOption.state, "NOT_MODELLED");
  assert.ok(methodology.financeLeaseOption.measuredReach > 0);
  assert.equal(methodology.openMeasurement.state, "NOT_MEASURED");
  assert.equal(methodology.openMeasurement.blocksProduct, false);
  /* The traps are recorded with their reason, so the next reader does not
     repeat the check that rejected them. */
  for (const entry of methodology.semanticTraps.entries) {
    assert.ok(entry.issuers > 0);
    assert.ok(entry.why.length > 30, entry.concept);
    assert.equal(qualified("total_debt").includes(entry.concept), false, entry.concept);
  }
});
