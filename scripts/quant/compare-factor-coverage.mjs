#!/usr/bin/env node
/* =========================================================================
   Compare two Factor Evidence summaries and print what actually changed.

   Written because "coverage improved" is not a measurement. After a data
   pipeline runs, the question is which components opened, by how much, and
   whether anything went the other way — a component losing coverage is the
   finding that a summary line would hide.

   Usage:
     node scripts/quant/compare-factor-coverage.mjs <before.json> [after.json]

   `after` defaults to the current published summary.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CURRENT = join(ROOT, "quant/data/product/factor-evidence-v1/summary.json");

const [beforePath, afterPath = CURRENT] = process.argv.slice(2);
if (!beforePath) {
  console.error("usage: compare-factor-coverage.mjs <before.json> [after.json]");
  process.exit(2);
}

const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const pad = (value, width) => String(value).padStart(width);
const delta = (a, b) => {
  const difference = (b || 0) - (a || 0);
  if (difference === 0) return "        ·";
  return pad((difference > 0 ? "+" : "") + difference.toLocaleString("en-US"), 9);
};

console.log("Factor Evidence coverage");
console.log("  before " + (before.asOf || "?") + "   after " + (after.asOf || "?"));
console.log("");

const FACTORS = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];
console.log("factor            before     after     delta");
for (const id of FACTORS) {
  const a = before.factorStates?.[id]?.AVAILABLE || 0;
  const b = after.factorStates?.[id]?.AVAILABLE || 0;
  console.log("  " + id.padEnd(16) + pad(a.toLocaleString("en-US"), 7) + pad(b.toLocaleString("en-US"), 10) + delta(a, b));
}

console.log("");
console.log("component                                  before     after     delta");
const componentIds = [...new Set([
  ...Object.keys(before.componentCoverage || {}),
  ...Object.keys(after.componentCoverage || {})
])].sort();
let opened = 0, closed = 0;
for (const id of componentIds) {
  const a = before.componentCoverage?.[id] || 0;
  const b = after.componentCoverage?.[id] || 0;
  if (a === 0 && b > 0) opened += 1;
  if (a > 0 && b === 0) closed += 1;
  const mark = a === 0 && b > 0 ? " OPENED" : a > 0 && b === 0 ? " CLOSED" : a > b ? " lower" : "";
  console.log("  " + id.padEnd(40) + pad(a.toLocaleString("en-US"), 7) + pad(b.toLocaleString("en-US"), 10) + delta(a, b) + mark);
}

console.log("");
console.log("universe                                   before     after     delta");
for (const key of ["priceFactorSecurities", "published", "withFundamentals", "withMarketCap"]) {
  const a = before.counts?.[key] || 0;
  const b = after.counts?.[key] || 0;
  console.log("  " + key.padEnd(40) + pad(a.toLocaleString("en-US"), 7) + pad(b.toLocaleString("en-US"), 10) + delta(a, b));
}

const beforeGates = new Set((before.openInputGates || before.gates || []).map((g) => g.id || g));
const afterGates = new Set((after.openInputGates || []).map((g) => g.id));
const cleared = [...beforeGates].filter((id) => !afterGates.has(id));
const appeared = [...afterGates].filter((id) => !beforeGates.has(id));

console.log("");
console.log("gates cleared:  " + (cleared.length ? cleared.join(", ") : "none"));
console.log("gates appeared: " + (appeared.length ? appeared.join(", ") : "none"));
console.log("components opened: " + opened + "   components that lost all coverage: " + closed);

/* A component that lost every observation is a regression, not a detail. */
if (closed > 0) {
  console.error("\nA component lost all coverage. That is a regression, not an improvement.");
  process.exit(1);
}
