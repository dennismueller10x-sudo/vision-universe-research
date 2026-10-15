#!/usr/bin/env node
/* Instagram aus Claude Code lesen: duenner Client fuer den Worker vision-universe-social.
   Nur lesend (GET). Das Meta-Token bleibt im Worker; hier liegt nur der Admin-Schluessel
   in der Umgebung (VU_SOCIAL_ADMIN_KEY), nie in Datei, Argument oder Ausgabe.

     node scripts/social/ig.mjs status
     node scripts/social/ig.mjs profile
     node scripts/social/ig.mjs media [--limit 12] [--after <cursor>] [--reels]

   Veroeffentlichen laeuft NICHT hier, sondern ueber die Freigabe-Pipeline (docs/operations/INSTAGRAM_CLAUDE_CODE.md). */
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d = null) => { const i = argv.indexOf(n); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };

export function buildUrl(base, command, { limit, after } = {}) {
  const root = String(base || "").replace(/\/+$/, "");
  if (command === "status") return root + "/social/meta/status";
  if (command === "profile" || command === "media") {
    const q = new URLSearchParams();
    if (limit) q.set("limit", String(limit));
    if (after) q.set("after", String(after));
    return root + "/social/meta/profile" + (q.size ? "?" + q : "");
  }
  return null;
}

export function shape(command, body, { reels = false } = {}) {
  if (command === "profile") return body.profile;
  if (command === "media") {
    const media = (body.media || []).filter((m) => !reels || m.media_product_type === "REELS");
    return { media, next: body.next };
  }
  return body;
}

async function main() {
  const base = process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de";
  const key = process.env.VU_SOCIAL_ADMIN_KEY;
  const url = buildUrl(base, cmd, { limit: opt("--limit"), after: opt("--after") });
  if (!url) { console.error("Befehle: status | profile | media [--limit N] [--after C] [--reels]"); process.exit(2); }
  if (!key) { console.error("VU_SOCIAL_ADMIN_KEY ist nicht gesetzt (Umgebung, nicht Datei)."); process.exit(3); }
  const res = await fetch(url, { headers: { authorization: "Bearer " + key } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`HTTP ${res.status}: ${body.error || "Fehler"} ${body.message || ""}`); process.exit(1); }
  console.log(JSON.stringify(shape(cmd, body, { reels: argv.includes("--reels") }), null, 2));
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
