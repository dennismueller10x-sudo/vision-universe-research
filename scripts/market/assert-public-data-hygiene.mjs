/* Public-data boundary for the static GitHub Pages tree.

   Commercial-provider raw bars may only live below .market-cache while
   redistribution is LEGAL_REVIEW_REQUIRED. This guard deliberately checks
   the generated public artefacts rather than trusting workflow intent. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* --root=<path> is test-only: it lets DH3/DH4 point this guard at a
   throwaway fixture tree instead of the real repository, so a test that
   exercises "does the guard actually catch a leak" never has to write into
   quant/data/market itself (DO-NOT-BREAK #10 - verification runs on
   copies, never on committed production data). Without it, root is always
   this file's real location, exactly as before. */
const rootArg = process.argv.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

/* Phase 5, Golden Five: the ONE narrow, explicit exception, not a blind
   spot. quant/data/market/golden-preview/daily/ may carry real bars, but
   only for the exact tickers named in development-preview.json's scope -
   this block re-derives that scope and fails loudly if a bar for any other
   ticker (or any file without a resolvable ticker) shows up there. The
   general quant/data/market/daily/ check above is unaffected and still
   blocks everything, including these same five tickers under that path. */
const previewConfig = json("quant/config/development-preview.json");
const previewScope = new Set((previewConfig && previewConfig.scope) || []);
const previewDaily = join(root, "quant", "data", "market", "golden-preview", "daily");
if (existsSync(previewDaily)) {
  if (!previewScope.size) {
    findings.push("quant/data/market/golden-preview/daily/ exists but quant/config/development-preview.json " +
                  "declares no scope - remove the directory or restore the declared allowlist.");
  }
  for (const name of readdirSync(previewDaily).filter((name) => name.endsWith(".json"))) {
    const payload = json(join("quant", "data", "market", "golden-preview", "daily", name));
    if (!hasBars(payload)) continue;
    if (!payload.ticker || !previewScope.has(payload.ticker)) {
      findings.push(`quant/data/market/golden-preview/daily/${name}: real bars for ticker ` +
                    `'${payload.ticker || "unknown"}' outside the declared Golden Five scope ` +
                    `(${[...previewScope].join(", ")})`);
    }
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

/* Phase 5, Golden Five: the same narrow, explicit exception as the raw-bar
   check above. A real (isMock:false) technical instrument bundle may only
   exist for a ticker in development-preview.json's declared scope - any
   other real bundle here is a leak, not a feature. */
const instruments = join(root, "quant", "data", "technical", "instruments");
if (existsSync(instruments)) {
  for (const name of readdirSync(instruments).filter((name) => name.endsWith(".json"))) {
    const payload = json(join("quant", "data", "technical", "instruments", name));
    if (payload && payload.isMock === false && hasBars(payload)) {
      const instrumentId = payload.instrumentId || name.replace(/\.json$/, "");
      if (!previewScope.has(instrumentId)) {
        findings.push(`quant/data/technical/instruments/${name}: real bars for '${instrumentId}' ` +
                      `outside the declared Golden Five scope (${[...previewScope].join(", ")})`);
      }
    }
  }
}

if (findings.length) {
  console.error("PUBLIC DATA HYGIENE FAILED");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}

console.log("Public data hygiene: no commercial-provider raw bars or provider-derived symbol outputs in delivered paths.");
