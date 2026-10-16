/* =========================================================================
   VU SOCIAL — Reels im Hintergrund (B1–B14). Test-Doubles fuer Video-Host und Graph API.
   Es wird nie ein echtes Reel veroeffentlicht. Der Cron-Lauf wird ueber worker.scheduled() getrieben.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import worker, { __internals } from "../src/index.js";
import { createEnv, request, PAGE_TOKEN, TEST_ADMIN_KEY, verbinde, PUBLISH_IG_ID } from "./harness.mjs";
import { readClaim, readQueue, readDecision, settleClaim, readPendingReels } from "../src/store.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const IG = PUBLISH_IG_ID;
const VIDEO = "https://media.example.invalid/reels/vu_reel_bg.mp4";
const INHALT = "reel_vu_bg_2026_10_16";
const TEXT = "Hintergrund-Test, keine Anlageberatung.";
const GROESSE = 400_000;

function videoBytes() {
  const b = new Uint8Array(GROESSE);
  b.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  for (let i = 12; i < GROESSE; i += 1) b[i] = (i * 7) & 0xff;
  return b;
}

/** Video-Host (Range) und Graph API; Container- und Medienzustand sind von aussen steuerbar. */
function welt(options = {}) {
  const aufrufe = [];
  const bytes = videoBytes();
  const w = {
    containerStatus: options.status || "FINISHED",
    publishFehler: options.publishFehler || 0,        // so viele media_publish-Aufrufe schlagen fehl
    publishFehlerSchreibtTrotzdem: false,             // Aufruf meldet Fehler, Meta hat aber veroeffentlicht
    statusFehler: null,                               // z. B. { code: 190, type: "OAuthException" }
    medien: [],
    aufrufe
  };
  w.fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const methode = (init && init.method) || "GET";
    const pfad = url.pathname.split("/").slice(2).join("/");
    aufrufe.push({ host: url.hostname, pfad, methode });
    if (!url.hostname.includes("graph.")) {
      const range = String((init.headers && init.headers.range) || "");
      let a = 0, e = bytes.length - 1;
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m && m[1] === "" && m[2]) a = Math.max(0, bytes.length - Number(m[2]));
      else if (m) { a = Number(m[1]); e = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : e; }
      return new Response(bytes.slice(a, e + 1), { status: 206,
        headers: { "content-type": "video/mp4", "content-range": `bytes ${a}-${e}/${bytes.length}` } });
    }
    const json = (body, status = 200) => ({ ok: status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)), headers: new Headers({ "content-type": "application/json" }) });
    if (pfad === `${IG}/media` && methode === "POST") return json({ id: "container_b1" });
    if (pfad === `${IG}/media` && methode === "GET") return json({ data: w.medien });
    if (pfad === "container_b1") {
      if (w.statusFehler) return json({ error: { message: "Invalid OAuth access token", code: w.statusFehler.code, type: w.statusFehler.type } }, 400);
      return json({ status_code: w.containerStatus, status: w.containerStatus });
    }
    if (pfad === `${IG}/media_publish` && methode === "POST") {
      if (w.publishFehler > 0) {
        w.publishFehler -= 1;
        if (w.publishFehlerSchreibtTrotzdem) {
          w.containerStatus = "PUBLISHED";
          w.medien = [{ id: "media_bg_5", media_product_type: "REELS", media_type: "VIDEO", caption: TEXT,
            permalink: "https://www.instagram.com/reel/BG5/", timestamp: new Date().toISOString().replace("Z", "+0000") }];
        }
        return json({ error: { message: "Temporarily unavailable", code: 2 } }, 500);
      }
      w.containerStatus = "PUBLISHED";
      return json({ id: "media_bg_9" });
    }
    if (pfad === "media_bg_9") return json({ id: "media_bg_9", permalink: "https://www.instagram.com/reel/BG9/", timestamp: "2026-10-16T12:00:00+0000", media_type: "VIDEO" });
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return w;
}

async function aufbau(options = {}) {
  const g = welt(options);
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: "visionuniverse",
    VU_SOCIAL_AUTOPUBLISH: "off",
    VU_SOCIAL_POLL_WAIT_MS: "0",
    VU_REEL_POLL_TRIES: "1",
    __graph: g, __fetchImpl: g.fetchImpl
  }, options.env || {}));
  await verbinde(env, options.record || {});
  return { env, g };
}

const post = (pfad, body) => request(pfad + KEY, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
async function sitzung(env) {
  const s = await worker.fetch(request("/approval/session", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  return s.headers.get("set-cookie").split(";")[0];
}
const tun = (env, cookie, pfad, daten) => worker.fetch(request(pfad, { method: "POST",
  headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(daten || {}) }), env);

/** Vorbereiten, Owner gibt frei: die kurze Anfrage legt den Container an und kehrt zurueck. */
async function freigegeben(env) {
  const r = await worker.fetch(post("/social/reel/prepare", { contentId: INHALT, videoUrl: VIDEO, caption: TEXT }), env);
  assert.equal(r.status, 201, await r.clone().text());
  const prep = await r.json();
  const item = (await readQueue(env)).items.find((i) => i.candidateId === prep.candidateId);
  const cookie = await sitzung(env);
  const antwort = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  return { prep, item, cookie, antwort };
}

const cron = (env) => worker.scheduled({}, env, { waitUntil() {} });
const containerAnlegen = (g) => g.aufrufe.filter((a) => a.pfad === `${IG}/media` && a.methode === "POST").length;
const freigaben = (g) => g.aufrufe.filter((a) => a.pfad === `${IG}/media_publish` && a.methode === "POST").length;
const alt = (minuten) => new Date(Date.now() - minuten * 60_000).toISOString();

/* ================================================================ */

test("B1 · Die Freigabe-Anfrage kehrt kurz zurueck; das Reel wartet auf den Hintergrundlauf", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep, antwort } = await freigegeben(env);
  assert.equal(antwort.status, 202);
  assert.equal(containerAnlegen(g), 1);
  assert.equal(freigaben(g), 0);
  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "IN_FLIGHT");
  assert.equal(claim.stage, "reelProcessing");
  assert.equal(claim.containerId, "container_b1");
  assert.deepEqual((await readPendingReels(env)).map((e) => e.contentId), [INHALT]);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "REEL_PROCESSING");
});

test("B2 · Der Hintergrundlauf veroeffentlicht nach FINISHED genau einmal und traegt die Entscheidung nach", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);

  const noch = await cron(env);                                   // Meta verarbeitet noch
  assert.equal(noch.ergebnisse[0].ergebnis, "IN_ARBEIT");
  assert.equal(freigaben(g), 0);

  g.containerStatus = "FINISHED";                                 // Meta ist fertig, die Seite ist laengst geschlossen
  const fertig = await cron(env);
  assert.equal(fertig.ergebnisse[0].ergebnis, "VEROEFFENTLICHT");
  assert.equal(freigaben(g), 1);
  assert.equal(containerAnlegen(g), 1, "nie ein zweiter Container");
  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "PUBLISHED");
  assert.equal(claim.mediaId, "media_bg_9");
  const d = await readDecision(env, prep.candidateId);
  assert.equal(d.published, true);
  assert.equal(d.mediaId, "media_bg_9");
  assert.equal(d.lastError, null);
  assert.deepEqual(await readPendingReels(env), []);

  const n = g.aufrufe.length;
  assert.deepEqual(await cron(env), { geprueft: 0 });
  assert.equal(g.aufrufe.length, n, "danach kein Aufruf mehr");
});

test("B3 · Das Approval Center zeigt waehrenddessen 'Verarbeitung laeuft', nie 'nicht angenommen'", async () => {
  const { env } = await aufbau({ status: "IN_PROGRESS" });
  const { prep, cookie } = await freigegeben(env);
  const karte = await (await worker.fetch(request(`/approval/${prep.candidateId}`, { headers: { cookie } }), env)).text();
  assert.match(karte, /im Hintergrund weiter/);
  assert.doesNotMatch(karte, /nicht angenommen/);
});

test("B4 · Lehnt Meta das Video ab: FAILED, Entscheidung mit Betriebszustand, kein neuer Container, kein Senden", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);
  g.containerStatus = "ERROR";
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "CONTAINER_ABGELEHNT");
  assert.equal((await readClaim(env, INHALT)).state, "FAILED");
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "META_PUBLISH_FAILED");
  assert.equal(freigaben(g), 0);
  assert.equal(containerAnlegen(g), 1);
  assert.deepEqual(await readPendingReels(env), []);
});

test("B5 · Scheitert media_publish: erst Abstand und Abgleich, dann hoechstens drei Versuche am SELBEN Container", async () => {
  const { env, g } = await aufbau({ status: "FINISHED", publishFehler: 1 });
  await freigegeben(env);                                         // Anfrage: Meta ist schon fertig, der erste Versuch scheitert
  assert.equal(freigaben(g), 1);
  let claim = await readClaim(env, INHALT);
  assert.equal(claim.uncertain, true);
  assert.equal(claim.stage, "reelPublishing");
  assert.equal(claim.publishAttempts, 1);

  const sofort = await cron(env);                                 // zu frueh nach dem Versuch: Abstand einhalten
  assert.equal(sofort.ergebnisse[0].ergebnis, "ABSTAND");
  assert.equal(freigaben(g), 1);

  await settleClaim(env, INHALT, { publishLeaseUntil: null, publishAttemptAt: alt(5) });
  const zweiter = await cron(env);                                // Abgleich: Container ist FINISHED, nicht PUBLISHED -> erneut
  assert.equal(zweiter.ergebnisse[0].ergebnis, "VEROEFFENTLICHT");
  assert.equal(freigaben(g), 2);
  assert.equal(containerAnlegen(g), 1, "derselbe Container");
  claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "PUBLISHED");
  assert.equal(claim.uncertain, false);
});

test("B6 · Meldete der Aufruf einen Fehler, Meta hat aber veroeffentlicht: abgleichen, NICHT erneut senden", async () => {
  const { env, g } = await aufbau({ status: "FINISHED", publishFehler: 1 });
  g.publishFehlerSchreibtTrotzdem = true;
  const { prep } = await freigegeben(env);
  assert.equal(freigaben(g), 1);
  await settleClaim(env, INHALT, { publishLeaseUntil: null, publishAttemptAt: alt(5) });

  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "ABGEGLICHEN_VEROEFFENTLICHT");
  assert.equal(freigaben(g), 1, "kein zweites media_publish");
  const claim = await readClaim(env, INHALT);
  assert.equal(claim.state, "PUBLISHED");
  assert.equal(claim.mediaId, "media_bg_5");
  assert.equal((await readDecision(env, prep.candidateId)).published, true);
});

test("B7 · PUBLISHED bei Meta, Medium nicht eindeutig im Konto: OFFEN melden, nie senden", async () => {
  const { env, g } = await aufbau({ status: "FINISHED", publishFehler: 1 });
  const { prep } = await freigegeben(env);
  g.containerStatus = "PUBLISHED";                                 // Meta hat veroeffentlicht, die Medienliste ist leer
  await settleClaim(env, INHALT, { publishLeaseUntil: null, publishAttemptAt: alt(5) });
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "ABGLEICH_OFFEN");
  assert.equal(freigaben(g), 1);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "PUBLISH_UNCERTAIN");
  assert.equal((await readClaim(env, INHALT)).state, "IN_FLIGHT");
  assert.deepEqual(await readPendingReels(env), []);
});

test("B8 · Nach drei Freigabe-Versuchen ist Schluss: kein vierter, Entscheidung OFFEN", async () => {
  const { env, g } = await aufbau({ status: "FINISHED", publishFehler: 99 });
  const { prep } = await freigegeben(env);                        // Versuch 1
  for (let i = 0; i < 2; i += 1) {                                // Versuche 2 und 3, jeweils nach Abstand
    await settleClaim(env, INHALT, { publishLeaseUntil: null, publishAttemptAt: alt(5) });
    await cron(env);
  }
  assert.equal(freigaben(g), 3);
  await settleClaim(env, INHALT, { publishLeaseUntil: null, publishAttemptAt: alt(5) });
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "VERSUCHE_ERSCHOEPFT");
  assert.equal(freigaben(g), 3, "hoechstens drei");
  assert.equal(containerAnlegen(g), 1);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "PUBLISH_UNCERTAIN");
  assert.deepEqual(await readPendingReels(env), []);
});

test("B9 · Nach dem Zeitfenster (45 min) wird nicht weiter gewartet; manuell bleibt es fortsetzbar", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);
  await settleClaim(env, INHALT, { claimedAt: alt(120) });
  const n = g.aufrufe.length;
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "FENSTER_ABGELAUFEN");
  assert.equal(g.aufrufe.length, n, "keine Meta-Aufrufe nach Fensterende");
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "REEL_PROCESSING");
  assert.deepEqual(await readPendingReels(env), []);
  assert.equal((await readClaim(env, INHALT)).state, "IN_FLIGHT");
});

test("B10 · Im Leerlauf: keine Meta-Aufrufe und genau eine KV-Leseoperation", async () => {
  const { env, g } = await aufbau();
  let gets = 0;
  const get = env.VU_SOCIAL_KV.get.bind(env.VU_SOCIAL_KV);
  env.VU_SOCIAL_KV.get = async (...a) => { gets += 1; return get(...a); };
  assert.deepEqual(await cron(env), { geprueft: 0 });
  assert.equal(gets, 1);
  assert.equal(g.aufrufe.length, 0);
});

test("B11 · Abgelaufene Verbindung: kein Senden, Entscheidung zeigt den Grund", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);
  g.statusFehler = { code: 190, type: "OAuthException" };
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "AUTH_ABGELAUFEN");
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "AUTH_EXPIRED");
  assert.equal(freigaben(g), 0);
});

test("B12 · Ein anderes Konto steht nicht (mehr) auf der Allowlist: es wird nichts gesendet", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);
  env.META_IG_ALLOWED_USERNAMES = "ein.anderes.konto";
  env.META_IG_ACCOUNT_ID = "999";
  g.containerStatus = "FINISHED";
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "ZIEL_NICHT_ERLAUBT");
  assert.equal(freigaben(g), 0);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "NOT_PUBLISHABLE");
});

test("B13 · Hintergrundlauf und manuelles 'Verarbeitung pruefen' veroeffentlichen zusammen nur EINMAL", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep, item, cookie } = await freigegeben(env);
  g.containerStatus = "FINISHED";

  /* Der Cron hat gerade die Sperre gesetzt (Freigabe laeuft): ein Druck darf nicht parallel senden. */
  await settleClaim(env, INHALT, { publishLeaseUntil: new Date(Date.now() + 60_000).toISOString() });
  const druck = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(druck.status, 202);
  assert.equal(freigaben(g), 0);
  assert.equal((await cron(env)).ergebnisse[0].ergebnis, "BESETZT");
  assert.equal(freigaben(g), 0);

  await settleClaim(env, INHALT, { publishLeaseUntil: null });
  const fertig = await tun(env, cookie, `/approval/${prep.candidateId}/publish`, { fingerprint: item.contentHash });
  assert.equal(fertig.status, 200, (await fertig.clone().text()).slice(0, 300));
  assert.equal(freigaben(g), 1);
  const danach = await cron(env);                                 // der Cron findet es schon veroeffentlicht
  assert.equal(freigaben(g), 1);
  assert.ok(danach.geprueft <= 1);
  assert.equal(containerAnlegen(g), 1);
});

test("B14 · Ohne Freigabe entsteht nie ein Hintergrundauftrag, und der Cron ruehrt fremde Anspruchszustaende nicht an", async () => {
  const { env, g } = await aufbau();
  await worker.fetch(post("/social/reel/prepare", { contentId: INHALT, videoUrl: VIDEO, caption: TEXT }), env);
  assert.deepEqual(await readPendingReels(env), [], "vorbereitet ist nicht freigegeben");
  assert.deepEqual(await cron(env), { geprueft: 0 });
  assert.equal(containerAnlegen(g), 0);
  assert.equal(freigaben(g), 0);

  /* Eine Liste mit einem Eintrag ohne Anspruch wird bereinigt, ohne etwas zu senden. */
  await env.VU_SOCIAL_KV.put("reel:pending:v1", JSON.stringify([{ contentId: "gibt_es_nicht", since: alt(1) }]));
  const r = await cron(env);
  assert.equal(r.ergebnisse[0].ergebnis, "KEIN_ANSPRUCH");
  assert.deepEqual(await readPendingReels(env), []);
  assert.equal(freigaben(g), 0);
});

test("B15 · Kein Token und kein Schluessel in Anspruch, Entscheidung oder Protokoll des Hintergrundlaufs", async () => {
  const { env } = await aufbau({ status: "IN_PROGRESS", publishFehler: 1 });
  const { prep } = await freigegeben(env);
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); };
  try { await cron(env); } finally { console.log = orig; }
  const roh = [JSON.stringify(await readClaim(env, INHALT)), JSON.stringify(await readDecision(env, prep.candidateId)), ...logs];
  for (const t of roh) {
    assert.ok(!t.includes(PAGE_TOKEN), "Page-Token");
    assert.ok(!t.includes(TEST_ADMIN_KEY), "Admin-Schluessel");
  }
});

/* ============================================================ TAKT: alle fuenf Minuten */

const TAKT_MIN = (() => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const m = toml.match(/^crons\s*=\s*\["([^"]+)"\]/m);
  assert.ok(m, "ein Cron-Eintrag in wrangler.toml");
  const n = m[1].match(/^\*\/(\d+) \* \* \* \*$/);
  assert.ok(n, "Form */N * * * *, gefunden: " + m[1]);
  return Number(n[1]);
})();

/** Ein Takt vergeht: alle Zeitstempel des Anspruchs liegen um TAKT_MIN Minuten weiter zurueck. */
async function takt(env) {
  const c = await readClaim(env, INHALT);
  const zurueck = (iso) => iso ? new Date(Date.parse(iso) - TAKT_MIN * 60_000).toISOString() : iso;
  await settleClaim(env, INHALT, { claimedAt: zurueck(c.claimedAt), publishAttemptAt: zurueck(c.publishAttemptAt),
    publishLeaseUntil: c.publishLeaseUntil ? zurueck(c.publishLeaseUntil) : null });
  return (await cron(env)).ergebnisse[0].ergebnis;
}

test("B16 · Der Takt passt zu Fenster, Abstand und Versuchen: genug Laeufe, begrenzte Wartezeit", () => {
  const { REEL_WINDOW_MIN_DEFAULT, REEL_PUBLISH_MAX, REEL_PUBLISH_GAP_MS } = __internals;
  assert.equal(TAKT_MIN, 5);
  const laeufeImFenster = Math.floor(REEL_WINDOW_MIN_DEFAULT / TAKT_MIN);
  assert.ok(laeufeImFenster >= REEL_PUBLISH_MAX + 2,
    `im Fenster liegen ${laeufeImFenster} Laeufe, noetig sind mindestens ${REEL_PUBLISH_MAX + 2} (Verarbeitung + Versuche)`);
  assert.ok(TAKT_MIN * 60_000 >= REEL_PUBLISH_GAP_MS, "der Takt haelt den Mindestabstand zwischen Versuchen von selbst ein");
  assert.ok(TAKT_MIN <= 10, "hoechstens zehn Minuten bis zur Veroeffentlichung nach Metas Fertigmeldung");
});

test("B17 · Im Fuenf-Minuten-Takt: Verarbeitung dauert, ein Versuch scheitert, der zweite gelingt - im Fenster, am selben Container", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS", publishFehler: 1 });
  const { prep } = await freigegeben(env);
  const ergebnisse = [];
  ergebnisse.push(await takt(env));            // Lauf 1: Meta verarbeitet noch
  ergebnisse.push(await takt(env));            // Lauf 2: noch
  g.containerStatus = "FINISHED";
  ergebnisse.push(await takt(env));            // Lauf 3: FINISHED -> Versuch 1 scheitert
  ergebnisse.push(await takt(env));            // Lauf 4: Abgleich (FINISHED, nicht PUBLISHED) -> Versuch 2 gelingt
  assert.deepEqual(ergebnisse, ["IN_ARBEIT", "IN_ARBEIT", "VERSUCH_FEHLGESCHLAGEN", "VEROEFFENTLICHT"]);
  assert.equal(freigaben(g), 2);
  assert.equal(containerAnlegen(g), 1);
  assert.equal((await readDecision(env, prep.candidateId)).published, true);
  assert.deepEqual(await readPendingReels(env), []);
});

test("B18 · Im Fuenf-Minuten-Takt: dauerhaft scheiternde Freigabe endet nach drei Versuchen weit vor dem Fensterende", async () => {
  const { env, g } = await aufbau({ status: "FINISHED", publishFehler: 99 });
  const { prep } = await freigegeben(env);     // Versuch 1 in der Anfrage
  const ergebnisse = [];
  for (let i = 0; i < 3; i += 1) ergebnisse.push(await takt(env));
  assert.deepEqual(ergebnisse, ["VERSUCH_FEHLGESCHLAGEN", "VERSUCH_FEHLGESCHLAGEN", "VERSUCHE_ERSCHOEPFT"]);
  assert.equal(freigaben(g), 3);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "PUBLISH_UNCERTAIN");
});

test("B19 · Im Fuenf-Minuten-Takt: die 45-Minuten-Grenze greift hoechstens einen Takt nach dem Fenster", async () => {
  const { env, g } = await aufbau({ status: "IN_PROGRESS" });
  const { prep } = await freigegeben(env);
  const ergebnisse = [];
  for (let i = 0; i < 10; i += 1) {
    const e = await takt(env);
    ergebnisse.push(e);
    if (e !== "IN_ARBEIT") break;
  }
  const letzte = ergebnisse.length;
  assert.equal(ergebnisse[letzte - 1], "FENSTER_ABGELAUFEN");
  assert.ok(letzte * TAKT_MIN >= 45 && letzte * TAKT_MIN <= 45 + TAKT_MIN, `Ende nach ${letzte * TAKT_MIN} min`);
  assert.equal(freigaben(g), 0);
  assert.equal((await readDecision(env, prep.candidateId)).lastError, "REEL_PROCESSING");
});
