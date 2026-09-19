"use strict";

const { createHistoryStore } = require("../quant/engines/history-store.js");
const Guard = require("../quant/engines/zero-cost-guard.js");
const { resolveIdentity } = require("../server/product-identity.js");
const { cors, json, preflight } = require("../server/http.js");

let driverPromise;
function driver() {
  if (!driverPromise) driverPromise = import("../scripts/market/storage/s3-driver.mjs")
    .then((module) => module.createS3DriverFromEnv());
  return driverPromise;
}

function configured() {
  return ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID",
    "VU_HISTORY_S3_SECRET_ACCESS_KEY"].every((name) => String(process.env[name] || "").trim());
}

function strictDate(value) {
  const string = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(string)) return null;
  const parsed = new Date(string + "T00:00:00.000Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === string ? string : null;
}

function project(bars, { columns, from, to }) {
  let rows = Array.isArray(bars) ? bars : [];
  if (from) rows = rows.filter((bar) => bar.date >= from);
  if (to) rows = rows.filter((bar) => bar.date <= to);
  return rows.map((bar) => columns === "ohlcv"
    ? { date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }
    : { date: bar.date, close: bar.close });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return json(req, res, 405, { state: "METHOD_NOT_ALLOWED" });
  if (!cors(req, res)) return json(req, res, 403, { state: "ORIGIN_NOT_ALLOWED" });
  const url = new URL(req.url, "http://localhost");
  const identity = await resolveIdentity({ ticker: url.searchParams.get("ticker"), securityId: url.searchParams.get("securityId") });
  if (identity.state !== "AVAILABLE") return json(req, res, 200, identity);
  const columns = String(url.searchParams.get("columns") || "close").toLowerCase();
  if (!new Set(["close", "ohlcv"]).has(columns)) return json(req, res, 400, { state: "INVALID_COLUMNS" });
  const fromRaw = url.searchParams.get("from"), toRaw = url.searchParams.get("to");
  const from = fromRaw ? strictDate(fromRaw) : null, to = toRaw ? strictDate(toRaw) : null;
  if ((fromRaw && !from) || (toRaw && !to) || (from && to && from > to)) {
    return json(req, res, 400, { state: "INVALID_DATE_RANGE" });
  }
  if (!configured()) return json(req, res, 200, { state: "NOT_CONFIGURED", identity: identity.identity });
  try {
    const budget = Guard.createBudget({ classAOperations: 0, classBOperations: 1 });
    const store = createHistoryStore({ driver: await driver(), provider: "tiingo", market: "US", budget });
    const series = await store.getSeries(identity.identity.ticker);
    if (!series || !Array.isArray(series.bars) || !series.bars.length) {
      return json(req, res, 200, { state: "HISTORICAL_UNAVAILABLE", identity: identity.identity, bars: [] });
    }
    if (series.securityId && series.securityId !== identity.identity.masterMemberId) {
      return json(req, res, 200, { state: "IDENTITY_MISMATCH", identity: identity.identity, bars: [] });
    }
    const bars = project(series.bars, { columns, from, to });
    return json(req, res, 200, {
      state: bars.length ? "AVAILABLE" : "EMPTY",
      identity: identity.identity, columns, bars,
      barCount: bars.length, storedBars: series.bars.length,
      first: bars[0]?.date || null, last: bars.at(-1)?.date || null,
      adjustmentStatus: series.adjustmentStatus || null,
      provenance: { source: "CANONICAL_R2_HISTORY", providerRequests: 0 }
    });
  } catch {
    return json(req, res, 200, { state: "STORE_UNREACHABLE", identity: identity.identity, bars: [] });
  }
};

module.exports.project = project;
module.exports.strictDate = strictDate;
