"use strict";

/* Verify the next Factor Evidence population before the materializer replaces
 * any published shard. A missing price-factor row is evidence to investigate,
 * never an implicit instruction to delete an existing product identity. */
function validateTransition(previous, next, decisions, historicalProtection = []) {
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") {
    throw new TypeError("FACTOR_POPULATION_INVALID_INPUT");
  }
  const before = new Set([...Object.keys(previous), ...historicalProtection]);
  const after = new Set(Object.keys(next));
  const removed = [...before].filter((ticker) => !after.has(ticker)).sort();
  const added = [...after].filter((ticker) => !before.has(ticker)).sort();
  const reviewed = new Map();
  for (const decision of decisions || []) {
    if (!decision || typeof decision.ticker !== "string" || reviewed.has(decision.ticker)) {
      throw new Error("FACTOR_REMOVAL_DECISION_INVALID_OR_DUPLICATE");
    }
    if (!/^[A-Z0-9.^-]+$/.test(decision.ticker) ||
        !/^[A-Z][A-Z0-9_]+$/.test(decision.reasonCode || "") ||
        !decision.beforeEvidence || !decision.afterEvidence ||
        !decision.scoreImpact || !decision.rankingImpact ||
        !decision.reviewedBy || !decision.reviewedAt) {
      throw new Error(`FACTOR_REMOVAL_DECISION_INCOMPLETE:${decision.ticker}`);
    }
    reviewed.set(decision.ticker, decision);
  }
  const unexpected = removed.filter((ticker) => !reviewed.has(ticker));
  const unrelated = [...reviewed.keys()].filter((ticker) => !removed.includes(ticker));
  if (unrelated.length) throw new Error(`FACTOR_REMOVAL_DECISION_NOT_APPLICABLE:${unrelated.join(",")}`);
  return { beforeCount: before.size, afterCount: after.size, added, removed,
    reviewedRemovals: removed.map((ticker) => reviewed.get(ticker)).filter(Boolean), unexpected,
    safe: unexpected.length === 0 };
}

module.exports = { validateTransition };
