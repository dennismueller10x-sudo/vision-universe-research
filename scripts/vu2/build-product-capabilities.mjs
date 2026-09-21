import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "product-capabilities-1.0.0";
export const SUMMARY_VERSION = "product-capabilities-summary-1.0.0";
export const CAPABILITIES = [
  "HAS_MARKET_DATA", "HAS_HISTORICAL", "HAS_INTRADAY", "HAS_LIVE", "HAS_FACTORS",
  "HAS_FUNDAMENTALS", "HAS_FUNDAMENTALS_5Y", "HAS_FUNDAMENTALS_10Y", "HAS_TTM",
  "HAS_NAME", "DISCOVER_ELIGIBLE", "HAS_STOCK_PAGE"
];

export function buildProductCapabilities({ root, write = true } = {}) {
  root ||= join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const matrix = JSON.parse(readFileSync(join(root, "quant/data/market/capabilities/matrix.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(root, "quant/data/market/capabilities/summary.json"), "utf8"));
  if (matrix.version !== "capability-matrix-1.0.0" || !Array.isArray(matrix.rows) ||
      summary.version !== matrix.version || summary.generatedAt !== matrix.generatedAt) {
    throw new Error("CAPABILITY_SOURCE_MISMATCH");
  }
  const rows = {}, seenMembers = new Set();
  for (const row of matrix.rows.filter((entry) => entry.inProductUniverse).sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    if (!/^[A-Z0-9.-]{1,12}$/.test(row.ticker) || !/^ref_[A-Z0-9._-]+$/.test(row.securityId) ||
        Object.hasOwn(rows, row.ticker) || seenMembers.has(row.securityId)) throw new Error("INVALID_PRODUCT_IDENTITY");
    seenMembers.add(row.securityId);
    const mask = CAPABILITIES.reduce((value, capability, index) => value | (row[capability] === true ? 2 ** index : 0), 0);
    rows[row.ticker] = [row.securityId, mask];
  }
  if (Object.keys(rows).length !== summary.counts.productUniverse) throw new Error("PRODUCT_UNIVERSE_COUNT_MISMATCH");
  const measuredCounts = Object.fromEntries(CAPABILITIES.map((capability, index) => [capability,
    Object.values(rows).filter((row) => (row[1] & 2 ** index) !== 0).length]));
  const countFields = {
    HAS_MARKET_DATA: "historicalQualityAccepted", HAS_HISTORICAL: "historicalAvailable",
    HAS_INTRADAY: "intradayAvailable", HAS_LIVE: "liveCapable", HAS_FACTORS: "factorEligible",
    HAS_FUNDAMENTALS: "fundamentals", HAS_FUNDAMENTALS_5Y: "fundamentals5y",
    HAS_FUNDAMENTALS_10Y: "fundamentals10y", HAS_TTM: "fundamentalsTtm",
    DISCOVER_ELIGIBLE: "discoverEligible", HAS_STOCK_PAGE: "stockPages"
  };
  for (const [capability, field] of Object.entries(countFields)) {
    if (summary.counts[field] !== measuredCounts[capability]) throw new Error(`CAPABILITY_COUNT_MISMATCH:${field}`);
  }
  if (summary.counts.namesMissing !== summary.counts.productUniverse - measuredCounts.HAS_NAME) throw new Error("CAPABILITY_COUNT_MISMATCH:namesMissing");
  const payload = {
    schemaVersion: "1.0.0", version: VERSION, generatedAt: matrix.generatedAt,
    source: { version: matrix.version, generatedAt: matrix.generatedAt },
    scope: "CANONICAL_PRODUCT_UNIVERSE", capabilities: CAPABILITIES,
    counts: summary.counts, measuredCounts, rows
  };
  const summaryPayload = {
    schemaVersion: "1.0.0", version: SUMMARY_VERSION, generatedAt: matrix.generatedAt,
    source: { version: matrix.version, generatedAt: matrix.generatedAt, projectionVersion: VERSION },
    scope: "CANONICAL_PRODUCT_UNIVERSE", capabilities: CAPABILITIES,
    counts: summary.counts, measuredCounts
  };
  if (write) {
    const target = join(root, "quant/data/product/capabilities-v1.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(payload));
    writeFileSync(join(root, "quant/data/product/capabilities-summary-v1.json"), JSON.stringify(summaryPayload));
  }
  return { payload, summary: summaryPayload };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const result = buildProductCapabilities({ root: rootArg ? rootArg.slice(7) : undefined });
  console.log(`Product Capabilities: ${Object.keys(result.payload.rows).length} Titel · ${result.payload.generatedAt}`);
}
