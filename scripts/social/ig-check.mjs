#!/usr/bin/env node
/* Instagram-Verbindung pruefen und Beitragsdaten sichern. Rein lesend (GET).
   Der Admin-Schluessel kommt nur aus der Umgebung (VU_SOCIAL_ADMIN_KEY) und wird nie ausgegeben.
   Das Meta-Token bleibt im Worker.

     node scripts/social/ig-check.mjs --expect-id 17841480148117405 --expect-username app.visionuniverse
     node scripts/social/ig-check.mjs ... --out /pfad/instagram-backup.json   (zusaetzlich: alle Beitraege + Kennzahlen)

   Ausgabe: nur Konto, ID und Zaehler. Captions und Kennzahlen stehen ausschliesslich in --out. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INSIGHT_BATCH = 8;   // Worker-Budget: 4 Graph-Aufrufe je Beitrag, 40 je Anfrage
const MAX_PAGES = 40;

export function checkIdentity(profile, expect) {
  const problems = [];
  if (!profile || !profile.id) problems.push("Profil ohne ID");
  if (expect.id && String(profile && profile.id) !== String(expect.id)) problems.push("ID weicht ab");
  if (expect.username && String((profile && profile.username) || "").toLowerCase() !== expect.username.toLowerCase()) {
    problems.push("Benutzername weicht ab");
  }
  return { ok: problems.length === 0, problems };
}

export function makeClient(base, key, fetchImpl = fetch) {
  const root = String(base).replace(/\/+$/, "");
  return async function get(path) {
    const res = await fetchImpl(root + path, { headers: { authorization: "Bearer " + key } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${body.error || ""}`.trim());
    return body;
  };
}

export async function collectMedia(get) {
  let after = null, profile = null;
  const media = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await get("/social/meta/profile?limit=25" + (after ? "&after=" + encodeURIComponent(after) : ""));
    profile = profile || body.profile;
    media.push(...(body.media || []));
    after = body.next;
    if (!after) break;
  }
  return { profile, media };
}

export async function collectInsights(get, ids) {
  const out = new Map();
  let queue = [...ids], rounds = 0;
  while (queue.length && rounds++ < ids.length) {
    const batch = queue.splice(0, INSIGHT_BATCH);
    const body = await get("/social/meta/insights?media=" + batch.join(","));
    for (const p of body.posts || []) {
      out.set(String(p.mediaId), { metrics: p.metrics, unanswered: p.unanswered, measured: Boolean(p.metrics), error: p.metricsError ? "nicht verfuegbar" : null });
    }
    queue = [...(body.deferred || []).map(String), ...queue];
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const key = process.env.VU_SOCIAL_ADMIN_KEY;
  if (!key) { console.error("VU_SOCIAL_ADMIN_KEY fehlt (Umgebung)."); process.exit(3); }
  const get = makeClient(process.env.VU_SOCIAL_WORKER_URL || "https://social.visionuniverse.de", key);
  const expect = { id: opt("--expect-id"), username: opt("--expect-username") };
  const out = opt("--out");

  const { profile, media } = await collectMedia(get);
  const id = checkIdentity(profile, expect);
  console.log(`Konto: @${profile && profile.username} (${profile && profile.id})`);
  console.log(`Follower: ${profile && profile.followers_count} · Beitraege laut Profil: ${profile && profile.media_count} · abrufbar: ${media.length}`);
  if (!id.ok) { console.error("IDENTITAET FALSCH: " + id.problems.join(", ")); process.exit(1); }
  console.log("Identitaet bestaetigt (ID und Benutzername wie erwartet).");

  if (out) {
    const insights = await collectInsights(get, media.map((m) => String(m.id)));
    const records = media.map((m) => ({ ...m, insights: insights.get(String(m.id)) || null }));
    writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), account: profile, count: records.length, media: records }, null, 2));
    const measured = records.filter((r) => r.insights && r.insights.measured).length;
    console.log(`Gesichert: ${records.length} Beitraege, davon mit Kennzahlen: ${measured}.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("Fehler: " + String(e.message).slice(0, 200)); process.exit(1); });
}
