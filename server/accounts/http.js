"use strict";

/* HTTP-Hilfen fuer die Konto-Endpunkte. Anders als server/http.js
   (nur GET, oeffentliche Daten) brauchen diese Endpunkte den
   Authorization-Header, POST/DELETE und die Herkunft der spaeteren
   Capacitor-App (iOS: capacitor://localhost, Android: https://localhost). */

const { PRODUCTION_ORIGIN } = require("../http.js");

const ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  "https://vision-universe-research.vercel.app",
  "capacitor://localhost",
  "https://localhost"
]);
const MAX_BODY = 256 * 1024;

function cors(req, res, methods) {
  const origin = String(req.headers && req.headers.origin || "");
  if (origin && ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", ") + ", OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  return !origin || ORIGINS.has(origin);
}

function send(req, res, status, body, methods = ["GET"]) {
  cors(req, res, methods);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.end(JSON.stringify(body));
}

/* true = Anfrage ist erledigt (Preflight beantwortet oder Herkunft abgelehnt). */
function guard(req, res, methods) {
  const allowed = cors(req, res, methods);
  if (req.method === "OPTIONS") {
    if (!allowed) send(req, res, 403, { state: "ORIGIN_NOT_ALLOWED" }, methods);
    else { res.statusCode = 204; res.end(); }
    return true;
  }
  if (!allowed) return send(req, res, 403, { state: "ORIGIN_NOT_ALLOWED" }, methods), true;
  if (!methods.includes(req.method)) return send(req, res, 405, { state: "METHOD_NOT_ALLOWED" }, methods), true;
  return false;
}

function bearer(req) {
  const value = String(req.headers && req.headers.authorization || "");
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/.exec(value);
  return match ? match[1] : null;
}

/* Vercel parst JSON bereits in req.body; im Test und bei anderen Laufzeiten
   lesen wir den Strom selbst - mit Obergrenze. */
async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(String(req.body)); } catch { return null; }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { return null; }
}

module.exports = { ORIGINS, cors, send, guard, bearer, readJson };
