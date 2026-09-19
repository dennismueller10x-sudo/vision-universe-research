"use strict";

const { json, preflight } = require("../server/http.js");

module.exports = function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return json(req, res, 405, { state: "METHOD_NOT_ALLOWED" });
  const historyConfigured = ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID",
    "VU_HISTORY_S3_SECRET_ACCESS_KEY"].every((name) => String(process.env[name] || "").trim());
  return json(req, res, 200, {
    state: "AVAILABLE", service: "VISION_UNIVERSE_PRODUCT_DATA", version: "1.0.0",
    capabilities: {
      companyMaster: "AVAILABLE", intraday: "AVAILABLE", realtimeRelay: "EXISTING_SHARED_SERVICE",
      historical: historyConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      fundamentals: historyConfigured ? "AVAILABLE" : "NOT_CONFIGURED"
    },
    realtime: { url: "wss://live.visionuniverse.de/live", priceSemantics: "UNSPECIFIED" }
  });
};
