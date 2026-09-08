/* Public-data boundary for the static GitHub Pages tree.

   Commercial-provider raw bars may only live below .market-cache while
   redistribution is LEGAL_REVIEW_REQUIRED. This guard deliberately checks
   the generated public artefacts rather than trusting workflow intent. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const findings = [];

function json(relativePath) {
  const file = join(root, relativePath);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function hasBars(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value.bars) && value.bars.length) return true;
  if (value.bars && Array.isArray(value.bars.timestamps) && value.bars.timestamps.length) return true;
  return false;
}

const publicDaily = join(root, "quant", "data", "market", "daily");
if (existsSync(publicDaily)) {
  for (const name of readdirSync(publicDaily).filter((name) => name.endsWith(".json"))) {
    const payload = json(join("quant", "data", "market", "daily", name));
    if (hasBars(payload)) findings.push(`quant/data/market/daily/${name}: raw bars in public tree`);
  }
}

const dashboardMarket = json("dashboard/data/market_data.json");
if (dashboardMarket) {
  for (const [symbol, rows] of Object.entries(dashboardMarket.symbols || {})) {
    if (Array.isArray(rows) && rows.length) {
      findings.push(`dashboard/data/market_data.json: ${symbol} raw bars in public tree`);
    }
  }
  if (dashboardMarket.status === "generated" && Object.keys(dashboardMarket.symbols || {}).length) {
    findings.push("dashboard/data/market_data.json: generated provider dataset is publicly deliverable");
  }
}

for (const relativePath of [
  "dashboard/data/technical_scores.json",
  "dashboard/data/technical_scenarios.json",
  "dashboard/data/backtest_results.json"
]) {
  const payload = json(relativePath);
  if (!payload) continue;
  if (Object.keys(payload.symbols || {}).length) {
    findings.push(`${relativePath}: provider-derived symbol output in public tree`);
  }
  if (payload.public_data_state && payload.public_data_state.display_allowed === true) {
    findings.push(`${relativePath}: public display enabled without a documented redistribution grant`);
  }
}

const instruments = join(root, "quant", "data", "technical", "instruments");
if (existsSync(instruments)) {
  for (const name of readdirSync(instruments).filter((name) => name.endsWith(".json"))) {
    const payload = json(join("quant", "data", "technical", "instruments", name));
    if (payload && payload.isMock === false && hasBars(payload)) {
      findings.push(`quant/data/technical/instruments/${name}: provider-derived raw bars in public bundle`);
    }
  }
}

if (findings.length) {
  console.error("PUBLIC DATA HYGIENE FAILED");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}

console.log("Public data hygiene: no commercial-provider raw bars or provider-derived symbol outputs in delivered paths.");
