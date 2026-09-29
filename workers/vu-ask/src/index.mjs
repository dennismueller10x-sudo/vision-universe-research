/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/index.mjs

   DER EINGANG DER FRAGEFUNKTION

     POST /v1/ask            { question, clientId, turnstileToken? }
     GET  /v1/quota?client=  verbleibende Fragen heute
     GET  /v1/admin/report   Lernbericht (Authorization: Bearer <Admin-Key>)
     GET  /v1/health

   Dieser Teil prueft nur Form und Herkunft und reicht weiter. Jede
   Entscheidung ueber Geld faellt im einen Durable Object (gate.mjs).
   ========================================================================= */
import { AskGate } from "./gate.mjs";

export { AskGate };

const DEFAULT_ORIGINS = ["https://research.visionuniverse.de", "https://vision-universe-research.vercel.app"];
const MAX_BODY = 4096;

function origins(env) {
  const list = String(env.VU_ASK_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

function corsHeaders(origin, env) {
  if (!origin || !origins(env).includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function respond(status, body, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
      "x-content-type-options": "nosniff", ...extra },
  });
}

/* Vergleich in konstanter Zeit, damit die Antwortdauer den Admin-Key
   nicht Zeichen fuer Zeichen verraet. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function gate(env) { return env.VU_ASK_GATE.get(env.VU_ASK_GATE.idFromName("global")); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const forward = (path, init = {}) => gate(env).fetch("https://gate" + path, {
      ...init, headers: { "content-type": "application/json", "x-vu-ip": ip },
    }).then(async (res) => respond(res.status, await res.json(), cors));

    if (request.method === "OPTIONS") return new Response(null, { status: origin && cors["access-control-allow-origin"] ? 204 : 403, headers: cors });

    if (url.pathname === "/v1/health") return respond(200, { ok: true, service: "vu-ask" }, cors);

    if (url.pathname === "/v1/ask") {
      if (request.method !== "POST") return respond(405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, cors);
      /* Nur die eigenen Seiten. Kein Schutz gegen gezielte Skripte - der
         liegt in den Zaehlern -, aber fremde Websites koennen die Funktion
         nicht still einbetten und fremde Kontingente verbrauchen. */
      if (!cors["access-control-allow-origin"]) return respond(403, { ok: false, reason: "ORIGIN_NOT_ALLOWED" });
      const raw = await request.text();
      if (raw.length > MAX_BODY) return respond(413, { ok: false, reason: "TOO_LARGE" }, cors);
      let body;
      try { body = JSON.parse(raw); } catch (e) { return respond(400, { ok: false, reason: "INVALID_JSON" }, cors); }
      return forward("/ask", { method: "POST", body: JSON.stringify({ question: body.question, clientId: body.clientId, turnstileToken: body.turnstileToken }) });
    }

    if (url.pathname === "/v1/quota" && request.method === "GET") {
      return forward("/quota?client=" + encodeURIComponent(url.searchParams.get("client") || ""));
    }

    if (url.pathname === "/v1/admin/report" && request.method === "GET") {
      const auth = request.headers.get("authorization") || "";
      if (!sameSecret(auth.replace(/^Bearer\s+/i, ""), env.VU_ASK_ADMIN_KEY)) return respond(401, { ok: false, reason: "UNAUTHORIZED" });
      return forward("/report?limit=" + encodeURIComponent(url.searchParams.get("limit") || "200"));
    }

    return respond(404, { ok: false, reason: "NOT_FOUND" }, cors);
  },
};
