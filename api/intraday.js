"use strict";

const { resolveIdentity } = require("../server/product-identity.js");
const { cors, json, preflight } = require("../server/http.js");

async function readJson(req, path) {
  if (typeof globalThis.__VU_PRODUCT_DATA_TEST_LOADER === "function") {
    return globalThis.__VU_PRODUCT_DATA_TEST_LOADER(path);
  }
  const origin = String(process.env.VU_PUBLIC_DATA_ORIGIN || "https://research.visionuniverse.de").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) throw new Error("INVALID_ORIGIN");
  const response = await fetch(origin + "/" + path.replace(/^\/+/, ""), {
    headers: { Accept: "application/json" }, redirect: "error"
  });
  if (!response.ok) throw new Error("SNAPSHOT_UNREACHABLE");
  return response.json();
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return json(req, res, 405, { state: "METHOD_NOT_ALLOWED" });
  if (!cors(req, res)) return json(req, res, 403, { state: "ORIGIN_NOT_ALLOWED" });
  const url = new URL(req.url, "http://localhost");
  const resolved = await resolveIdentity({ ticker: url.searchParams.get("ticker"), securityId: url.searchParams.get("securityId") },
    { loadJSON: path => readJson(req, path) });
  if (resolved.state !== "AVAILABLE") return json(req, res, 200, resolved);
  try {
    const index = await readJson(req, "quant/data/market/intraday/index.json");
    const entry = index.entries && index.entries[resolved.identity.ticker];
    if (!entry) {
      const session = index.displaySession || {};
      return json(req, res, 200, {
        state: session.isRunning ? "INTRADAY_UNAVAILABLE" : "MARKET_CLOSED",
        identity: resolved.identity, marketSession: session, points: []
      });
    }
    if (entry.securityId !== resolved.identity.masterMemberId || !entry.path || !entry.path.startsWith("/quant/data/market/intraday/")) {
      return json(req, res, 200, { state: "IDENTITY_MISMATCH", identity: resolved.identity, points: [] });
    }
    const snapshot = await readJson(req, entry.path.slice(1));
    if (snapshot.securityId !== resolved.identity.masterMemberId || snapshot.symbol !== resolved.identity.ticker || snapshot.dataMode !== "real") {
      return json(req, res, 200, { state: "IDENTITY_MISMATCH", identity: resolved.identity, points: [] });
    }
    return json(req, res, 200, {
      state: "INTRADAY_AVAILABLE", identity: resolved.identity,
      sessionDate: snapshot.sessionDate, marketState: snapshot.marketStateAtFetch,
      asOf: snapshot.asOf, interval: snapshot.interval, delayMinutes: snapshot.delayMinutes,
      regularComplete: snapshot.regularComplete, points: snapshot.points,
      priceSemantics: "UNSPECIFIED", provenance: { source: "CANONICAL_INTRADAY_SNAPSHOT" }
    });
  } catch {
    return json(req, res, 200, { state: "SOURCE_MISSING", identity: resolved.identity, points: [] });
  }
};
