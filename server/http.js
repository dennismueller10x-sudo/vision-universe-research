"use strict";

const PRODUCTION_ORIGIN = "https://research.visionuniverse.de";

function cors(req, res) {
  const origin = String(req.headers && req.headers.origin || "");
  const allowed = new Set([PRODUCTION_ORIGIN, "https://vision-universe-research.vercel.app"]);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return !origin || allowed.has(origin);
}

function json(req, res, status, body) {
  cors(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.end(JSON.stringify(body));
}

function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;
  if (!cors(req, res)) return json(req, res, 403, { state: "ORIGIN_NOT_ALLOWED" }), true;
  res.statusCode = 204;
  res.end();
  return true;
}

module.exports = { cors, json, preflight, PRODUCTION_ORIGIN };
