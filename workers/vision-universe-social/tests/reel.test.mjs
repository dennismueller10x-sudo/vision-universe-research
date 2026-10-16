/* =========================================================================
   VU SOCIAL — Reels (R1–R20). Test-Doubles fuer Video-Host und Graph API.
   Es wird nie ein echtes Reel veroeffentlicht.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { createEnv, request, PAGE_TOKEN, TEST_ADMIN_KEY, verbinde, PUBLISH_IG_ID } from "./harness.mjs";
import { contentHash } from "../src/redact.js";
import { claimKey, readClaim, readQueue, writeQueue } from "../src/store.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const IG = PUBLISH_IG_ID;
const VIDEO = "https://media.example.invalid/reels/vu_reel_01.mp4";
const INHALT = "reel_vu_2026_10_15";
const TEXT = "Drei Kennzahlen, ein Blick. Keine Anlageberatung.";
const GROESSE = 400_000;

function videoBytes(markierung = 1) {
  const b = new Uint8Array(GROESSE);
  b.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);   // ....ftypisom
  for (let i = 12; i < GROESSE; i += 1) b[i] = (i * markierung) & 0xff;
  return b;
}

/** Video-Host (Range) und Graph API in einem Double. */
function welt(options = {}) {
  const aufrufe = [];
  const statuses = [...(options.statuses || ["FINISHED"])];
  let bytes = options.bytes || videoBytes();
  let anlegen = 0;
  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const methode = (init && init.method) || "GET";
    const pfad = url.pathname.split("/").slice(2).join("/");
    aufrufe.push({ host: url.hostname, pfad, methode, url: rawUrl, init });

    if (!url.hostname.includes("graph.")) {
      if (options.videoFehlt) return new Response("", { status: 404 });
      const range = String((init.headers && init.headers.range) || "");
      const typ = options.typ || "video/mp4";
      if (options.ohneRange) return new Response(bytes, { status: 200, headers: { "content-type": typ, "content-length": String(bytes.length) } });
      let a = 0, e = bytes.length - 1;
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m && m[1] === "" && m[2]) { a = Math.max(0, bytes.length - Number(m[2])); }
      else if (m) { a = Number(m[1]); e = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : e; }
      return new Response(bytes.slice(a, e + 1), { status: 206,
        headers: { "content-type": typ, "content-range": `bytes ${a}-${e}/${bytes.length}` } });
    }
    const json = (body, status = 200) => ({ ok: status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)), headers: new Headers({ "content-type": "application/json" }) });
    if (pfad === `${IG}/media` && methode === "POST") {
      anlegen += 1;
      if (options.netzFehler && anlegen <= options.netzFehler) throw new TypeError("fetch failed");
      if (options.containerFehler) return json({ error: { message: "Invalid video", code: 9004, error_subcode: 2207026 } }, 400);
      return json({ id: "container_r1" });
    }
    if (pfad === "container_r1") {
      const s = statuses.length > 1 ? statuses.shift() : statuses[0];
      return json({ status_code: s, status: s === "ERROR" ? "Error: video codec not supported" : s });
    }
    if (pfad === `${IG}/media_publish` && methode === "POST") {
      if (options.publishFehler) return json({ error: { message: "Permission error", code: 200 } }, 403);
      return json({ id: "media_reel_9" });
    }
    if (pfad === "media_reel_9") {
      return json({ id: "media_reel_9", permalink: "https://www.instagram.com/reel/RR9/", timestamp: "2026-10-15T20:00:00+0000", media_type: "VIDEO" });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return { fetchImpl, aufrufe, tauscheBytes(b) { bytes = b; } };
}

async function aufbau(options = {}) {
  const g = welt(options);
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: "visionuniverse",
    VU_SOCIAL_AUTOPUBLISH: options.autopublish || "off",
    VU_SOCIAL_POLL_WAIT_MS: "0",
    VU_REEL_POLL_TRIES: String(options.tries || 3),
    __graph: g, __fetchImpl: g.fetchImpl
  }, options.env || {}));
  if (options.verbunden !== false) await verbinde(env, options.record || {});
  return { env, g };
}

const post = (pfad, body) => request(pfad + KEY, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const vorbereiten = (env, over = {}) => worker.fetch(post("/social/reel/prepare",
  Object.assign({ contentId: INHALT, videoUrl: VIDEO, caption: TEXT }, over)), env);

async function freigabe(prep, over = {}) {
  return Object.assign({ candidateId: prep.candidateId, approvedBy: "owner", approvedAt: "2026-10-15T19:00:00Z",
    contentHash: prep.contentHash }, over);
}
async function publish(env, prep, item, over = {}) {
  return worker.fetch(post("/social/meta/publish", Object.assign({
    contentId: INHALT, mediaType: "REELS", videoUrl: VIDEO, caption: TEXT,
    assetVideo: { sha256: item.asset.sha256, sizeBytes: item.asset.sizeBytes },
    approval: await freigabe(prep)
  }, over)), env);
}
async function vorbereitet(env) {
  const r = await vorbereiten(env);
  assert.equal(r.status, 201, await r.clone().text());
  const prep = await r.json();
  const q = await readQueue(env);
  const item = q.items.find((i) => i.candidateId === prep.candidateId);
  return { prep, item };
}
const containerAnlegen = (g) => g.aufrufe.filter((a) => a.pfad === `${IG}/media` && a.methode === "POST");
const freigaben = (g) => g.aufrufe.filter((a) => a.pfad === `${IG}/media_publish` && a.methode === "POST").length;

/* ============================================================ VORBEREITEN */

test("R1 · prepare braucht den Admin-Schluessel und POST", async () => {
  const { env, g } = await aufbau();
  assert.equal((await worker.fetch(request("/social/reel/prepare", { method: "POST", body: "{}" }), env)).status, 401);
  assert.equal((await worker.fetch(request("/social/reel/prepare" + KEY), env)).status, 405);
  assert.equal(g.aufrufe.length, 0);
});

test("R2 · prepare misst das Video, legt eine Karte an und veroeffentlicht nichts", async () => {
  const { env, g } = await aufbau();
  const { prep, item } = await vorbereitet(env);
  assert.equal(prep.published, false);
  assert.equal(item.payload.kind, "REEL");
  assert.equal(item.payload.videoUrl, VIDEO);
  assert.equal(item.asset.zustand, "ASSET_PUBLICLY_REACHABLE");
  assert.equal(item.asset.sizeBytes, GROESSE);
  assert.match(item.asset.sha256, /^[0-9a-f]{64}$/);
  assert.equal(item.contentHash, await contentHash({ contentId: INHALT, videoUrl: VIDEO, caption: TEXT }));
  assert.equal(containerAnlegen(g).length, 0, "Kein Container, nichts bei Meta");
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null, "Auch kein Anspruch");
});

test("R3 · prepare weist Unbrauchbares ab", async () => {
  const { env } = await aufbau();
  for (const [over, grund] of [
    [{ videoUrl: "http://media.example.invalid/x.mp4" }, "videoUrlInvalid"],
    [{ videoUrl: "https://user:pw@media.example.invalid/x.mp4" }, "videoUrlInvalid"],
    [{ contentId: "a b" }, "contentIdInvalid"],
    [{ caption: "x".repeat(2201) }, "captionTooLong"],
    [{ caption: "#a ".repeat(31) }, "tooManyHashtags"]
  ]) {
    const r = await vorbereiten(env, over);
    assert.equal(r.status, 400, grund);
    assert.equal((await r.json()).error, grund);
  }
  for (const [opts, grund] of [
    [{ typ: "image/jpeg" }, "videoNotMp4"],
    [{ videoFehlt: true }, "videoUnreachable"],
    [{ ohneRange: true }, "rangeUnsupported"],
    [{ bytes: new Uint8Array(GROESSE).fill(7) }, "videoNotMp4Bytes"],
    [{ bytes: videoBytes().slice(0, 100) }, "videoTooSmall"]
  ]) {
    const w = await aufbau(opts);
    const r = await vorbereiten(w.env);
    assert.equal(r.status, 400, grund);
    assert.equal((await r.json()).error, grund);
  }
  const gross = await aufbau({ env: { VU_REEL_MAX_BYTES: "1000" } });
  assert.equal((await (await vorbereiten(gross.env)).json()).error, "videoTooLarge");
});

test("R4 · Die Reel-Karte steht in der Schlange und uebersteht eine neue Uebertragung", async () => {
  const { env } = await aufbau();
  const { item } = await vorbereitet(env);
  await writeQueue(env, { version: 1, generatedAt: new Date().toISOString(), activeCount: 0, source: "x",
    complete: true, unresolved: [], items: [] });
  const q = await readQueue(env);
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].candidateId, item.candidateId);
  assert.equal(q.activeCount, 1, "activeCount zaehlt das Reel mit");
});

/* ============================================================ VEROEFFENTLICHEN */

test("R5 · Ohne Freigabe nie — auch nicht bei Autopublish an", async () => {
  const { env, g } = await aufbau({ autopublish: "on" });
  const r = await worker.fetch(post("/social/meta/publish", { contentId: INHALT, mediaType: "REELS", videoUrl: VIDEO, caption: TEXT }), env);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "reelNeedsApproval");
  assert.equal(g.aufrufe.length, 0);
  assert.equal(await env.VU_SOCIAL_KV.get(claimKey(INHALT)), null);
});

test("R6 · Geaenderter Text oder andere Videoadresse: die Freigabe gilt nicht", async () => {
  const { env, g } = await aufbau();
  const { prep, item } = await vorbereitet(env);
  for (const over of [{ caption: TEXT + " Neu." }, { videoUrl: VIDEO.replace("01", "02") }, { contentId: "anderes" }]) {
    const r = await publish(env, prep, item, over);
    assert.equal(r.status, 409, JSON.stringify(over));
    assert.equal((await r.json()).error, "approvalMismatch");
  }
  assert.equal(containerAnlegen(g).length, 0);
});

test("R7 · Gelungener Weg: ein Container, eine Freigabe, Beleg im Anspruch — und kein zweites Mal", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS", "FINISHED"] });
  const { prep, item } = await vorbereitet(env);
  const r = await publish(env, prep, item);
  assert.equal(r.status, 200, await r.clone().text());
  const b = await r.json();
  assert.equal(b.published, true);
  assert.equal(b.mediaType, "REELS");
  assert.equal(b.via, "APPROVAL");
  assert.equal(b.mediaId, "media_reel_9");

  const c = containerAnlegen(g);
  assert.equal(c.length, 1);
  const u = new URL(c[0].url);
  assert.equal(u.searchParams.get("media_type"), "REELS");
  assert.equal(u.searchParams.get("video_url"), VIDEO);
  assert.equal(u.searchParams.get("share_to_feed"), "true");
  assert.equal(freigaben(g), 1);
  assert.equal((await readClaim(env, INHALT)).state, "PUBLISHED");

  const nochmal = await publish(env, prep, item);
  assert.equal(nochmal.status, 200);
  const nb = await nochmal.json();
  assert.equal(nb.idempotent, true);
  assert.equal(containerAnlegen(g).length, 1, "kein zweiter Container");
  assert.equal(freigaben(g), 1, "keine zweite Freigabe");
});

test("R8 · Ohne Videoabdruck keine Sendung; ein anderes Video unter derselben Adresse auch nicht", async () => {
  const a = await aufbau();
  const { prep, item } = await vorbereitet(a.env);
  const r1 = await publish(a.env, prep, item, { assetVideo: {} });
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).error, "videoFingerprintRequired");

  const b = await aufbau();
  const p2 = await vorbereitet(b.env);
  b.g.tauscheBytes(videoBytes(3));                       // Datei nach der Freigabe ersetzt
  const r2 = await publish(b.env, p2.prep, p2.item);
  assert.equal(r2.status, 400);
  const body = await r2.json();
  assert.equal(body.error, "videoFingerprintMismatch");
  assert.notEqual(body.expectedSha256, body.actualSha256);
  assert.equal(containerAnlegen(b.g).length, 0, "kein Container");
  assert.equal((await readClaim(b.env, INHALT)).state, "FAILED");
});

test("R9 · Dauert die Verarbeitung: 202, und derselbe Aufruf setzt FORT — ohne zweiten Container", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "FINISHED"], tries: 2 });
  const { prep, item } = await vorbereitet(env);
  const r1 = await publish(env, prep, item);
  assert.equal(r1.status, 202);
  const b1 = await r1.json();
  assert.equal(b1.state, "PROCESSING");
  assert.equal(b1.containerId, "container_r1");
  assert.equal(freigaben(g), 0);
  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "IN_FLIGHT");
  assert.equal(claim.stage, "reelProcessing");

  const r2 = await publish(env, prep, item);
  assert.equal(r2.status, 200, await r2.clone().text());
  assert.equal(containerAnlegen(g).length, 1, "derselbe Container");
  assert.equal(freigaben(g), 1);
});

test("R10 · Fortsetzen gilt nur fuer dasselbe, freigegebene Reel", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS"], tries: 1 });
  const { prep, item } = await vorbereitet(env);
  assert.equal((await publish(env, prep, item)).status, 202);
  /* gleiche contentId, anderer Text mit passender (neuer) Freigabe: kein Fortsetzen, kein zweites Reel */
  const andere = await contentHash({ contentId: INHALT, videoUrl: VIDEO, caption: "anders" });
  const r = await publish(env, prep, item, { caption: "anders", approval: await freigabe(prep, { contentHash: andere }) });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "claimInFlight");
  assert.equal(containerAnlegen(g).length, 1);
  assert.equal(freigaben(g), 0);
});

test("R11 · Meta lehnt das Video ab: nichts veroeffentlicht, Anspruch FAILED, Wiederholung ist eine Entscheidung", async () => {
  const { env, g } = await aufbau({ statuses: ["ERROR"] });
  const { prep, item } = await vorbereitet(env);
  const r = await publish(env, prep, item);
  assert.equal(r.status, 502);
  const b = await r.json();
  assert.equal(b.error, "containerNotReady");
  assert.equal(b.status, "ERROR");
  assert.equal(freigaben(g), 0);
  assert.equal((await readClaim(env, INHALT)).state, "FAILED");
  const wieder = await publish(env, prep, item);
  assert.equal(wieder.status, 409);
  assert.equal((await wieder.json()).error, "claimFailedEarlier");
  assert.equal(containerAnlegen(g).length, 1);
});

test("R12 · Vorubergehende Fehler beim Anlegen werden begrenzt wiederholt", async () => {
  const { env, g } = await aufbau({ netzFehler: 2 });
  const { prep, item } = await vorbereitet(env);
  const r = await publish(env, prep, item);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(containerAnlegen(g).length, 3, "zwei Fehlversuche + ein Erfolg");
  assert.equal(freigaben(g), 1);

  const hart = await aufbau({ netzFehler: 99 });
  const p2 = await vorbereitet(hart.env);
  const r2 = await publish(hart.env, p2.prep, p2.item);
  assert.equal(r2.status, 502);
  assert.equal(containerAnlegen(hart.g).length, 3, "hoechstens drei Versuche");
  assert.equal(freigaben(hart.g), 0);
});

test("R13 · Ein dauerhafter Containerfehler (ungueltiges Medium) wird nicht wiederholt", async () => {
  const { env, g } = await aufbau({ containerFehler: true });
  const { prep, item } = await vorbereitet(env);
  const r = await publish(env, prep, item);
  assert.equal(r.status, 502);
  assert.equal(containerAnlegen(g).length, 1);
});

test("R14 · Scheitert media_publish, bleibt der Zustand OFFEN und es wird nie erneut gesendet", async () => {
  const { env, g } = await aufbau({ publishFehler: true });
  const { prep, item } = await vorbereitet(env);
  const r = await publish(env, prep, item);
  assert.equal(r.status, 502);
  const b = await r.json();
  assert.equal(b.uncertain, true);
  assert.equal((await readClaim(env, INHALT)).state, "IN_FLIGHT");
  const wieder = await publish(env, prep, item);
  assert.equal(wieder.status, 409);
  assert.equal(freigaben(g), 1, "genau ein Versuch bei Meta");
});

test("R15 · Allowlist und Verbindung bleiben Pflicht", async () => {
  const fremd = await aufbau({ record: { instagramUsername: "fremdes.konto" } });
  const p = await vorbereitet(fremd.env);
  const r = await publish(fremd.env, p.prep, p.item);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "targetNotAllowed");
  assert.equal(containerAnlegen(fremd.g).length, 0);

  const keine = await aufbau({ verbunden: false });
  const p2 = await vorbereitet(keine.env);
  assert.equal((await publish(keine.env, p2.prep, p2.item)).status, 409);
});

test("R16 · Admin-Schluessel bleibt Pflicht fuer /social/meta/publish", async () => {
  const { env } = await aufbau();
  const r = await worker.fetch(request("/social/meta/publish", { method: "POST", body: "{}" }), env);
  assert.equal(r.status, 401);
});

test("R17 · In keiner Antwort und keinem Anspruch steht ein Token oder Schluessel", async () => {
  const { env } = await aufbau({ statuses: ["ERROR"] });
  const { prep, item } = await vorbereitet(env);
  const roh = [];
  roh.push(await (await publish(env, prep, item)).text());
  roh.push(JSON.stringify(await readClaim(env, INHALT)));
  roh.push(JSON.stringify(item));
  for (const t of roh) {
    assert.ok(!t.includes(PAGE_TOKEN), "Page-Token");
    assert.ok(!t.includes(TEST_ADMIN_KEY), "Admin-Schluessel");
  }
});

test("R18 · Bild und Carousel bleiben unveraendert: der Abdruck eines Bildes aendert sich nicht", async () => {
  const bild = await contentHash({ contentId: "pkg_x", imageUrl: "https://a.example/x.jpg", caption: "t" });
  const mitLeerVideo = await contentHash({ contentId: "pkg_x", imageUrl: "https://a.example/x.jpg", caption: "t", videoUrl: "" });
  assert.equal(bild, mitLeerVideo);
  /* Bekannter Wert aus der Zeit vor Reels (kanonisches JSON ohne videoUrl). */
  const { createHash } = await import("node:crypto");
  const erwartet = createHash("sha256").update(JSON.stringify({ contentId: "pkg_x", imageUrl: "https://a.example/x.jpg", caption: "t" })).digest("hex");
  assert.equal(bild, erwartet);
});

/* ============================================================ OWNER-WEG */

async function sitzung(env) {
  const s = await worker.fetch(request("/approval/session", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  return s.headers.get("set-cookie").split(";")[0];
}
const tun = (env, cookie, pfad, daten) => worker.fetch(request(pfad, { method: "POST",
  headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(daten || {}) }), env);

test("R19 · Approval Center: Karte zeigt das Video, Rueckfrage zeigt es erneut, Senden veroeffentlicht einmal", async () => {
  const { env, g } = await aufbau();
  const { prep, item } = await vorbereitet(env);
  const cookie = await sitzung(env);

  const karte = await worker.fetch(request("/approval/" + prep.candidateId, { headers: { cookie } }), env);
  const html = await karte.text();
  assert.equal(karte.status, 200);
  assert.match(html, /<video[^>]+src="https:\/\/media\.example\.invalid\/reels\/vu_reel_01\.mp4"/);
  assert.match(karte.headers.get("content-security-policy"), /media-src https:/);
  assert.equal(containerAnlegen(g).length, 0, "Ansehen veroeffentlicht nichts");

  const rueck = await tun(env, cookie, `/approval/${prep.candidateId}/approve`, { fingerprint: item.contentHash });
  assert.equal(rueck.status, 200);
  assert.match(await rueck.text(), /<video/);
  assert.equal(containerAnlegen(g).length, 0, "Rueckfrage veroeffentlicht nichts");

  const senden = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  const seite = await senden.text();
  assert.equal(senden.status, 200, seite.slice(0, 400));
  assert.match(seite, /media_reel_9/);
  assert.equal(freigaben(g), 1);
  assert.equal((await readClaim(env, INHALT)).state, "PUBLISHED");

  const nochmal = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(freigaben(g), 1, "zweiter Druck erzeugt kein zweites Reel");
  assert.ok(nochmal.status === 200 || nochmal.status === 409);
});

test("R20 · Approval Center sperrt ein Reel mit fehlender Groesse im Abdruck", async () => {
  const { env, g } = await aufbau();
  const { prep, item } = await vorbereitet(env);
  const q = await readQueue(env);
  const raw = JSON.parse(await env.VU_SOCIAL_KV.get("reel:item:" + prep.candidateId));
  delete raw.asset.sizeBytes;
  await env.VU_SOCIAL_KV.put("reel:item:" + prep.candidateId, JSON.stringify(raw));
  const cookie = await sitzung(env);
  const r = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.notEqual(r.status, 200);
  assert.equal(containerAnlegen(g).length, 0);
  assert.ok(q);
});

test("R21 · Approval Center: Verarbeitung dauert -> Seite mit 'Verarbeitung pruefen', fortsetzen ohne zweites Reel", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"], tries: 1 });
  const { prep, item } = await vorbereitet(env);
  const cookie = await sitzung(env);

  const erst = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  const html = await erst.text();
  assert.equal(erst.status, 202);
  assert.match(html, /verarbeitet das Video noch/);
  assert.match(html, /Verarbeitung pruefen/);
  assert.equal(freigaben(g), 0);

  /* Die Karte selbst zeigt dieselbe Seite mit Knopf (Freigabe steht, Versand wartet). */
  const wieder = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(wieder.status, 202);
  assert.equal(containerAnlegen(g).length, 1, "derselbe Container");

  const fertig = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(fertig.status, 200, (await fertig.clone().text()).slice(0, 300));
  assert.match(await fertig.text(), /media_reel_9/);
  assert.equal(freigaben(g), 1);
  assert.equal(containerAnlegen(g).length, 1);

  const nochmal = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(freigaben(g), 1, "danach nie wieder");
  assert.ok([200, 409].includes(nochmal.status));
});

test("R22 · Fortsetzen verlangt den Abdruck der Freigabe", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS"], tries: 1 });
  const { prep, item } = await vorbereitet(env);
  const cookie = await sitzung(env);
  assert.equal((await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash })).status, 202);
  const falsch = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: "0".repeat(64) });
  assert.notEqual(falsch.status, 200);
  assert.equal(freigaben(g), 0);
  assert.equal(containerAnlegen(g).length, 1);
});

test("R23 · /social/reel/status zeigt Karte, Anspruch und Containerstatus, ohne Token, ohne Schreibzugriff", async () => {
  const { env, g } = await aufbau({ statuses: ["IN_PROGRESS"], tries: 1 });
  const { prep, item } = await vorbereitet(env);
  assert.equal((await worker.fetch(request("/social/reel/status?contentId=" + INHALT), env)).status, 401);
  const vor = await (await worker.fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json();
  assert.equal(vor.prepared, true);
  assert.equal(vor.claim, null);
  await publish(env, prep, item);                       // 202 PROCESSING
  const n = g.aufrufe.length;
  const nach = await (await worker.fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json();
  assert.equal(nach.claim.state, "IN_FLIGHT");
  assert.equal(nach.claim.stage, "reelProcessing");
  assert.equal(nach.claim.containerId, "container_r1");
  const neu = g.aufrufe.slice(n);
  assert.equal(neu.length, 1, "genau ein lesender Meta-Aufruf");
  assert.equal(neu[0].pfad, "container_r1");
  assert.equal(neu[0].methode, "GET");
  assert.equal(nach.containerMeta.statusCode, "IN_PROGRESS");
  assert.equal(nach.claim.reelHashSet, true);
  assert.equal(freigaben(g), 0);
  assert.ok(!JSON.stringify(nach).includes(PAGE_TOKEN));
});

test("R25 · Status: Entscheidung, Containerfehler und fehlende Verbindung werden lesbar gemeldet", async () => {
  const { env, g } = await aufbau({ statuses: ["ERROR"], tries: 1 });
  const { prep, item } = await vorbereitet(env);
  const cookie = await sitzung(env);
  await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  const s = await (await worker.fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json();
  assert.equal(s.decision.decision, "APPROVED");
  assert.equal(s.decision.published, false);
  assert.ok(s.decision.lastError, "ein Betriebszustand ist festgehalten");
  assert.equal(s.claim.state, "FAILED");
  assert.equal(s.containerMeta.statusCode, "ERROR");
  assert.match(s.containerMeta.status, /codec/);
  assert.equal(freigaben(g), 0);
  assert.ok(!JSON.stringify(s).includes(PAGE_TOKEN));

  /* Ohne Verbindung: keine Ausnahme, ein klarer Hinweis. */
  await env.VU_SOCIAL_KV.delete("meta:connection:v1");
  const k = await (await worker.fetch(request("/social/reel/status" + KEY + "&contentId=" + INHALT), env)).json();
  assert.equal(k.containerMeta.error, "notConnected");
});

test("R24 · prepare warnt bei signierten (ablaufenden) Videoadressen", async () => {
  const { env } = await aufbau();
  const a = await (await vorbereiten(env, { videoUrl: VIDEO + "?X-Amz-Expires=3600&X-Amz-Signature=abc" })).json();
  assert.deepEqual(a.warnings, ["VIDEO_URL_MAY_EXPIRE"]);
  const b = await (await vorbereiten(env, { contentId: INHALT + "_b" })).json();
  assert.deepEqual(b.warnings, []);
});
