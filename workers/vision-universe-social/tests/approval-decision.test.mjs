/* =========================================================================
   vision-universe-social — DIE ENTSCHEIDUNG DES OWNERS

   -------------------------------------------------------------------------
   DIE EINE FRAGE, DIE DIESE DATEI BEANTWORTET
   -------------------------------------------------------------------------

   Geht aus dem Approval Center genau das hinaus, was der Owner gesehen
   und bestaetigt hat — einmal, oder gar nicht?

   Daraus werden vier Behauptungen, und jede kann einzeln brechen:

     1. NUR WAS FREIGEGEBEN WURDE. Der Abdruck bindet die Freigabe an
        einen Inhalt, nicht an eine Kennung. Ein Tab von gestern gibt
        den Beitrag von heute nicht frei.

     2. NUR EINMAL. Zwei Druecke, ein Beitrag. Und der zweite zeigt,
        was der erste ergeben hat.

     3. AUF DEM BESTEHENDEN WEG. Keine zweite Meta-Implementierung -
        derselbe Anspruch, derselbe nachgerechnete Abdruck, dieselben
        Graph-Aufrufe wie bei /social/meta/publish.

     4. EINE ABLEHNUNG IST KEINE LEISTUNGSAUSSAGE. Nicht "schlecht
        gelaufen", sondern "nicht ausgewaehlt". Ein Beitrag, der nie
        hinausging, hat keine Reichweite - weder eine schlechte noch
        eine gute.

   -------------------------------------------------------------------------
   WAS DIESE DATEI NICHT BEWEIST
   -------------------------------------------------------------------------

   Dass Meta mitspielt. Der Doppelgaenger haelt sich an das, was die
   Graph API dokumentiert zurueckgibt. Wer hier gruen ist, hat bewiesen,
   dass UNSER Ablauf stimmt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import {
  createEnv, request, TEST_ADMIN_KEY,
  createPublishGraph, verbinde, PUBLISH_MEDIA_ID, PUBLISH_PERMALINK, JPEG_SHA256, jpegBytes
} from "./harness.mjs";
import { contentHash } from "../src/redact.js";
import { CLAIM_PREFIX, DECISION_PREFIX } from "../src/store.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const ID = "cand_20260920_4c7ee69c";
const INHALT = "pkg_xom_20260920";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_xom_20260920.jpg";
const TEXT = "Exxon Mobil steht bei 52 von 100. Keine Anlageberatung.";

async function abdruck(over = {}) {
  return contentHash(Object.assign({ contentId: INHALT, imageUrl: BILD, caption: TEXT }, over));
}

function eintrag(hash, over = {}) {
  return Object.assign({
    candidateId: ID,
    state: "AWAITING_APPROVAL",
    contentHash: hash,
    payload: { contentId: INHALT, imageUrl: BILD, caption: TEXT },
    /* Gemessen und erreichbar. Ohne dieses Feld ist ein Eintrag
       UNGEPRUEFT und damit gesperrt - das ist die Regel und kein
       Testartefakt. Wer sie prueft, tut es in asset-gate.test.mjs. */
    asset: { zustand: "ASSET_PUBLICLY_REACHABLE", grund: null, erreichbar: true,
      url: BILD,
      satz: "Das Bild liegt unter genau dieser Adresse und ist abrufbar.",
      gemessenAm: "2026-09-21T10:00:00Z",
      sha256: JPEG_SHA256, dimensions: { width: 1080, height: 1350 } },
    anzeige: { thema: { value: "Technisches Setup — XOM", basis: "presentation.topic" },
      hook: { value: "52 von 100.", basis: "presentation.hook" } },
    guete: { zustand: "BESTANDEN", score: 82, erklaerung: null, warnungen: [] },
    warum: {}
  }, over);
}

/** Ein Worker mit Verbindung, Schlange und angemeldeter Sitzung. */
async function aufbau(options = {}) {
  const g = createPublishGraph(options.graph || {});
  const env = createEnv(Object.assign({
    META_IG_ALLOWED_USERNAMES: "visionuniverse",
    /* Ausdruecklich AUS. Das Approval Center darf nicht davon abhaengen,
       und §17 verbietet, dass es den Schalter beruehrt. */
    VU_SOCIAL_AUTOPUBLISH: "off",
    __graph: g, __fetchImpl: g.fetchImpl
  }, options.env || {}));

  if (options.verbunden !== false) await verbinde(env);

  const hash = await abdruck();
  const posten = options.items || [eintrag(hash, options.eintrag || {})];
  const p = Object.assign({
    version: __internals.QUEUE_VERSION,
    source: __internals.QUEUE_SOURCE,
    countedFiles: false,
    generatedAt: new Date().toISOString(),
    activeCount: posten.length,
    complete: true,
    items: posten, unresolved: [], held: [], decided: [], unknown: [],
    total: posten.length
  }, options.projektion || {});

  const abgelegt = await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(p) }), env);
  assert.equal(abgelegt.status, 200, "Der Aufbau selbst muss stimmen.");

  const s = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);

  return { env, g, hash, cookie: s.headers.get("set-cookie").split(";")[0] };
}

function tun(env, cookie, pfad, daten) {
  return worker.fetch(request(pfad, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(daten || {})
  }), env);
}

function titel(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
}

function claims(env) {
  return [...env.VU_SOCIAL_KV.__raw().keys()].filter((k) => k.startsWith(CLAIM_PREFIX));
}

/* ==================================================== Der gelungene Weg */

test("AD1 · Freigeben laeuft ueber eine Rueckfrage, die denselben Beitrag zeigt", async () => {
  const { env, cookie, hash } = await aufbau();
  const r = await tun(env, cookie, `/approval/${ID}/approve`, { fingerprint: hash });
  const html = await r.text();

  assert.equal(r.status, 200);
  assert.match(titel(html), /Wirklich veroeffentlichen/);
  /* Und zwar DENSELBEN: derselbe Text, dasselbe Bild. Eine Rueckfrage,
     die nur "sicher?" fragt, bestaetigt eine Erinnerung. */
  assert.ok(html.includes(BILD));
  assert.ok(html.includes("Exxon Mobil steht bei 52 von 100."));
  assert.ok(html.includes(hash), "Der Abdruck reist weiter.");

  /* Eine Rueckfrage veroeffentlicht nichts. */
  assert.deepEqual(claims(env), []);
});

test("AD2 · Senden geht hinaus und meldet, was daraus wurde", async () => {
  const { env, cookie, hash, g } = await aufbau();
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await r.text();

  assert.equal(r.status, 200);
  assert.match(titel(html), /Veroeffentlicht/);
  assert.ok(html.includes(PUBLISH_MEDIA_ID), "Die Medien-ID ist der Beleg.");
  assert.ok(html.includes(PUBLISH_PERMALINK));
  assert.match(html, /Auf Instagram ansehen/);

  /* Und der Weg war der bestehende: Bildpruefung, Container, Status,
     Freigabe, Nachschau. */
  const pfade = g.aufrufe.map((a) => a.methode + " " + a.pfad);
  /* -----------------------------------------------------------------
     GEPRUEFT WIRD, DASS DAS BILD GEHOLT WURDE - UND ZWAR GANZ

     Hier stand `startsWith("HEAD")`. Das war nie die Frage: HEAD war
     nur die Methode, mit der die Pruefung zufaellig lief. Seit der
     Worker die BYTES ansieht, ist GET die Bedingung - ein HEAD wuerde
     den Koerper gar nicht sehen und genau die Luecke wieder oeffnen,
     durch die ein Beitrag ohne ladbares Bild hinausging.

     Der Test misst deshalb die Adresse und die Methode zusammen. */
  const bildAbruf = g.aufrufe.find((a) => a.url === BILD);
  assert.ok(bildAbruf, "Das Bild wurde nicht abgerufen.");
  assert.equal(bildAbruf.methode, "GET",
    "Das Bild wurde nicht ganz geholt - HEAD sieht die Bytes nicht.");
  assert.ok(pfade.some((p) => /media$/.test(p)));
  assert.ok(pfade.some((p) => /media_publish$/.test(p)));
});

test("AD3 · Die Freigabe traegt den Abdruck bis zu Meta", async () => {
  /* Der Abdruck wird im Veroeffentlichungspfad ein drittes Mal
     nachgerechnet - aus dem, was TATSAECHLICH gesendet wird. Das ist
     die Pruefung, die zaehlt; die beiden davor erlauben nur eine
     verstaendliche Antwort. */
  const { env, cookie, hash } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  const anspruch = JSON.parse(await env.VU_SOCIAL_KV.get(CLAIM_PREFIX + INHALT));
  assert.equal(anspruch.state, "PUBLISHED");
  assert.equal(anspruch.via, "APPROVAL", "Nicht als Autopublish verbucht.");
  assert.equal(anspruch.approval.contentHash, hash);
  assert.equal(anspruch.approval.candidateId, ID);
  assert.equal(anspruch.approval.approvedBy, "owner");
});

test("AD4 · Der Schalter bleibt aus - das Center braucht ihn nicht und ruehrt ihn nicht an", async () => {
  const { env, cookie, hash } = await aufbau();
  assert.equal(env.VU_SOCIAL_AUTOPUBLISH, "off");

  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 200);

  /* Veroeffentlicht trotz ausgeschaltetem Autopublish - weil eine
     Freigabe vorliegt. Das sind zwei Erlaubnisse und nicht eine mit
     Extraschritt. */
  assert.equal(env.VU_SOCIAL_AUTOPUBLISH, "off",
    "Das Approval Center hat einen Schalter veraendert.");
  assert.equal(env.GLOBAL_AUTOPUBLISH, undefined);
});

/* ==================================================== Nur einmal (§9) */

test("AD5 · Zweimal druecken erzeugt keinen zweiten Beitrag", async () => {
  const { env, cookie, hash, g } = await aufbau();

  const erst = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(erst.status, 200);
  const nachErstem = g.aufrufe.filter((a) => /media_publish$/.test(a.pfad)).length;

  const zweit = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await zweit.text();

  assert.equal(zweit.status, 200);
  assert.match(titel(html), /Veroeffentlicht/,
    "Der zweite Druck zeigt, was der erste ergeben hat.");
  assert.ok(html.includes(PUBLISH_MEDIA_ID));

  assert.equal(g.aufrufe.filter((a) => /media_publish$/.test(a.pfad)).length, nachErstem,
    "Es ging ein zweites Mal etwas an Meta.");
  assert.equal(claims(env).length, 1);
});

test("AD6 · Auch zehn Druecke bleiben ein Beitrag", async () => {
  const { env, cookie, hash, g } = await aufbau();
  for (let n = 0; n < 10; n += 1) {
    await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  }
  assert.equal(g.aufrufe.filter((a) => /media_publish$/.test(a.pfad)).length, 1);
});

test("AD7 · Die Karte eines entschiedenen Beitrags zeigt keine Knoepfe mehr", async () => {
  const { env, cookie, hash } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  const r = await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
  const html = await r.text();
  assert.match(titel(html), /Veroeffentlicht/);
  assert.ok(!/name="fingerprint"/.test(html),
    "Zwei Knoepfe fuer etwas, das bereits entschieden ist.");
});

test("AD8 · Ein veroeffentlichter Beitrag wartet nicht mehr - und das steht da", async () => {
  const { env, cookie, hash } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();
  assert.match(titel(html), /wartet kein Beitrag/);
  /* Und nicht stillschweigend: die Zahl der Maschine ist weiterhin 1.
     Eine kleinere Zahl ohne Begruendung waere genau die stille
     Arithmetik, gegen die diese Oberflaeche gebaut ist. */
  assert.match(html, /1 Beitrag soeben entschieden/);
  assert.match(html, /noch nicht im Repository/);
});

/* ============================================= Nur was freigegeben wurde */

test("AD9 · Ein alter Tab gibt den neuen Beitrag nicht frei (§8)", async () => {
  const { env, cookie, g } = await aufbau();
  const alt = await abdruck({ caption: "Der Text von gestern." });

  for (const pfad of [`/approval/${ID}/approve`, `/approval/${ID}/publish`]) {
    const r = await tun(env, cookie, pfad, { fingerprint: alt });
    assert.equal(r.status, 409, pfad);
    assert.match(titel(await r.text()), /inzwischen aktualisiert/);
  }
  assert.deepEqual(claims(env), [], "Es wurde etwas angemeldet.");
  assert.deepEqual(g.aufrufe, []);
});

test("AD10 · Ohne Abdruck gibt es keine Freigabe", async () => {
  const { env, cookie, g } = await aufbau();
  for (const daten of [{}, { fingerprint: "" }, { fingerprint: null }]) {
    const r = await tun(env, cookie, `/approval/${ID}/publish`, daten);
    assert.equal(r.status, 409, JSON.stringify(daten));
  }
  assert.deepEqual(g.aufrufe, []);
});

test("AD11 · Ein veraenderter Eintrag im Speicher geht nicht hinaus", async () => {
  /* Der Abdruck des Eintrags stimmt mit dem Formular ueberein - aber
     nicht mehr mit seinem eigenen Inhalt. Irgendwer hat den Speicher
     angefasst. */
  const hash = await abdruck();
  const { env, cookie, g } = await aufbau({
    eintrag: { payload: { contentId: INHALT, imageUrl: BILD,
      caption: "Nachtraeglich hineingeschrieben." } }
  });

  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 409);
  assert.match(titel(await r.text()), /passt nicht zu seinem Abdruck/);
  assert.deepEqual(g.aufrufe, []);
});

test("AD12 · Ein Beitrag, der das Qualitaetstor nicht bestanden hat, ist nicht freigebbar", async () => {
  const { env, cookie, hash, g } = await aufbau({
    eintrag: { guete: { zustand: "NICHT_BESTANDEN", score: 22,
      erklaerung: "Zu viel Text auf der Flaeche.", warnungen: [] } }
  });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 409);
  assert.match(titel(await r.text()), /Qualitaetstor nicht bestanden/);
  assert.deepEqual(g.aufrufe, []);
});

test("AD13 · Nicht anwendbar ist kein Durchfallen", async () => {
  /* Ein generatives Bild traegt laut Brief keinen Text; die Kartenprobe
     misst Text. Sie nicht anwenden zu koennen darf die Freigabe nicht
     blockieren - sonst waere kein generativer Beitrag je sendbar. */
  const { env, cookie, hash } = await aufbau({
    eintrag: { guete: { zustand: "NICHT_ANWENDBAR", score: null,
      erklaerung: "Generatives Bild ohne Textebene.", warnungen: [] } }
  });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 200);
  assert.match(titel(await r.text()), /Veroeffentlicht/);
});

test("AD14 · Ein Beitrag, der nicht mehr in der Schlange steht, geht nicht hinaus", async () => {
  const { env, cookie, hash, g } = await aufbau();
  /* Der naechste Orchestratorlauf hat ihn abgeloest. */
  await worker.fetch(request("/social/approval/queue" + KEY, { method: "POST",
    body: JSON.stringify({ version: __internals.QUEUE_VERSION,
      source: __internals.QUEUE_SOURCE, countedFiles: false,
      generatedAt: new Date().toISOString(), activeCount: 0, complete: true,
      items: [], unresolved: [], held: [], decided: [], unknown: [], total: 1 }) }), env);

  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.equal(r.status, 409);
  assert.deepEqual(g.aufrufe, []);
});

/* ================================================= Betriebszustaende (§12) */

test("AD15 · Ein unerreichbares Bild ist ein Versandproblem, kein Beitragsproblem", async () => {
  const { env, cookie, hash } = await aufbau({ graph: { bildFehlt: true } });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await r.text();

  assert.equal(r.status, 502);
  assert.match(titel(html), /Bild/);
  /* Der Owner muss zwei Dinge erfahren: dass nichts hinausging, und
     dass es am Bild liegt und nicht am Beitrag. Geprueft wird das
     hier an der Aussage, nicht an einer Formulierung - sonst faellt
     der Test beim naechsten Umschreiben des Satzes um, ohne dass
     etwas kaputt waere. */
  assert.match(html, /nichts veroeffentlicht|NICHT veroeffentlicht/);
  assert.match(html, /am Bild, nicht am Beitrag/);
  /* Kein Stacktrace, keine Fehlernummer, kein Meta-Rohtext. */
  assert.ok(!/stack|at Object|fbtrace|error_subcode/i.test(html));
});

test("AD16 · Ein abgelaufenes Token ist ein Verbindungsproblem", async () => {
  const { env, cookie, hash } = await aufbau({
    graph: { publishFehler: { code: 190, message: "Session expired" } } });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await r.text();

  /* Nach media_publish ist UNKLAR, ob etwas entstanden ist - und das
     wiegt schwerer als die Diagnose des Grundes. Zweimal zu senden
     waere der teurere Fehler. */
  assert.equal(r.status, 502);
  assert.match(titel(html), /Unklar, ob der Beitrag entstanden ist|Verbindung zu Instagram/);
  assert.ok(!/190|OAuthException|Def456/i.test(html));
});

test("AD17 · Ohne Verbindung wird nichts gesendet und nichts behauptet", async () => {
  const { env, cookie, hash } = await aufbau({ verbunden: false });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await r.text();
  assert.equal(r.status, 502);
  assert.match(titel(html), /Verbindung zu Instagram besteht nicht mehr/);
  assert.match(html, /NICHT veroeffentlicht/);
});

test("AD18 · Ein misslungener Versand loescht die Freigabe nicht", async () => {
  /* Die Entscheidung steht; nur der Versand nicht. Die beiden zu
     vermengen hiesse, dem Owner seine eigene Entscheidung
     wegzunehmen, weil eine Leitung klemmte. */
  const { env, cookie, hash } = await aufbau({ graph: { bildFehlt: true } });
  await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  const d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  assert.equal(d.decision, "APPROVED");
  assert.equal(d.published, false);
  assert.equal(d.lastError, "ASSET_NOT_REACHABLE");
  assert.equal(d.contentHash, hash);
});

/* ================================================= Die Ablehnung (§7) */

test("AD19 · Ohne Grund keine Ablehnung", async () => {
  const { env, cookie, hash } = await aufbau();
  for (const daten of [{ fingerprint: hash }, { fingerprint: hash, reason: "" },
    { fingerprint: hash, reason: "   " }]) {
    const r = await tun(env, cookie, `/approval/${ID}/reject`, daten);
    assert.equal(r.status, 400, JSON.stringify(daten));
    assert.match(titel(await r.text()), /Was soll besser werden/);
  }
  assert.equal(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID), null);
});

test("AD20 · Eine Ablehnung haelt fest, was §7 verlangt", async () => {
  const { env, cookie, hash } = await aufbau();
  const r = await tun(env, cookie, `/approval/${ID}/reject`,
    { fingerprint: hash, reason: "Der Hook ist zu technisch fuer den Einstieg." });

  assert.equal(r.status, 200);
  const d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  assert.equal(d.candidateId, ID);
  assert.equal(d.contentHash, hash);
  assert.equal(d.decision, "REJECTED");
  assert.equal(d.reason, "Der Hook ist zu technisch fuer den Einstieg.");
  assert.equal(d.decisionSource, "approval_center");
  assert.equal(d.decidedBy, "owner");
  assert.ok(d.decidedAt);
});

test("AD21 · Eine Ablehnung ist KEINE Leistungsaussage", async () => {
  const { env, cookie, hash } = await aufbau();
  const r = await tun(env, cookie, `/approval/${ID}/reject`,
    { fingerprint: hash, reason: "Thema passt nicht." });
  const html = await r.text();

  /* Der Satz steht auf der Seite, weil der Owner ihn lesen soll. */
  assert.match(html, /keine Reichweite/);
  assert.match(html, /weder eine schlechte noch eine gute/);

  /* Und im Datensatz gibt es kein Feld dafuer - nicht als null,
     sondern gar nicht. Ein Feld, das es nicht gibt, kann niemand
     versehentlich fuellen. */
  const d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  for (const verboten of ["performance", "reach", "impressions", "score",
    "engagement", "objective"]) {
    assert.ok(!(verboten in d), `Der Ablehnungsdatensatz traegt "${verboten}".`);
  }
});

test("AD22 · Eine Ablehnung sendet nichts", async () => {
  const { env, cookie, hash, g } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/reject`, { fingerprint: hash, reason: "Nein." });
  assert.deepEqual(g.aufrufe, []);
  assert.deepEqual(claims(env), []);
});

test("AD23 · Ein alter Tab lehnt die neue Fassung nicht ab", async () => {
  /* Sonst ginge die Rueckmeldung an einen Text, den der Owner nie
     gesehen hat - und die naechste Auswahl lernte das Falsche. */
  const { env, cookie } = await aufbau();
  const alt = await abdruck({ caption: "Der Text von gestern." });
  const r = await tun(env, cookie, `/approval/${ID}/reject`,
    { fingerprint: alt, reason: "Passt nicht." });

  assert.equal(r.status, 409);
  assert.match(titel(await r.text()), /inzwischen aktualisiert/);
  assert.equal(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID), null);
});

test("AD24 · Nach einer Ablehnung aendert ein zweiter Druck nichts", async () => {
  const { env, cookie, hash, g } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/reject`, { fingerprint: hash, reason: "Erster Grund." });

  /* Weder eine zweite Ablehnung ... */
  await tun(env, cookie, `/approval/${ID}/reject`, { fingerprint: hash, reason: "Zweiter Grund." });
  let d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  assert.equal(d.reason, "Erster Grund.", "Die erste Entscheidung wurde ueberschrieben.");

  /* ... noch eine nachtraegliche Freigabe. */
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  assert.match(titel(await r.text()), /Abgelehnt/);
  assert.deepEqual(g.aufrufe, [], "Ein abgelehnter Beitrag ging hinaus.");
  d = JSON.parse(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID));
  assert.equal(d.decision, "REJECTED");
});

/* ============================================================== §10 */

test("AD25 · Ohne Sitzung entscheidet niemand", async () => {
  const { env, hash, g } = await aufbau();
  for (const pfad of [`/approval/${ID}/approve`, `/approval/${ID}/publish`,
    `/approval/${ID}/reject`]) {
    const r = await worker.fetch(request(pfad, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fingerprint: hash, reason: "x" }) }), env);
    assert.equal(r.status, 401, pfad);
  }
  assert.deepEqual(g.aufrufe, []);
  assert.deepEqual(claims(env), []);
  assert.equal(await env.VU_SOCIAL_KV.get(DECISION_PREFIX + ID), null);
});

test("AD26 · Der Admin-Schluessel in der Adresszeile entscheidet auch nicht", async () => {
  /* Er oeffnet die maschinellen Endpunkte, nicht das Approval Center.
     Zwei Tore, zwei Zustaendigkeiten - und keine Abkuerzung zwischen
     ihnen. */
  const { env, hash, g } = await aufbau();
  const r = await worker.fetch(request(`/approval/${ID}/publish` + KEY, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fingerprint: hash }) }), env);
  assert.equal(r.status, 401);
  assert.deepEqual(g.aufrufe, []);
});

test("AD27 · Eine Entscheidung laesst sich nicht ueber einen Link ausloesen", async () => {
  /* Ein GET waere ueber ein untergeschobenes Bild oder einen Link
     ausloesbar - und das Ergebnis waere ein oeffentlicher Beitrag. */
  const { env, cookie, g } = await aufbau();
  for (const pfad of [`/approval/${ID}/publish`, `/approval/${ID}/reject`,
    `/approval/${ID}/approve`]) {
    const r = await worker.fetch(request(pfad, { headers: { cookie } }), env);
    assert.equal(r.status, 405, pfad);
  }
  assert.deepEqual(g.aufrufe, []);
});

/* ============================================ Der bestehende Weg bleibt */

test("AD28 · /social/meta/publish verhaelt sich unveraendert", async () => {
  /* Der Veroeffentlichungspfad wurde aufgeteilt: Tor beim Eingang,
     Weg in publishCore. Eine Aufteilung, die das Verhalten aendert,
     waere eine zweite Implementierung mit Tarnung. */
  const { env } = await aufbau();
  const hash = await abdruck();

  const ohne = await worker.fetch(request("/social/meta/publish", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId: INHALT, imageUrl: BILD, caption: TEXT }) }), env);
  assert.equal(ohne.status, 401, "Das Admin-Tor steht nicht mehr.");

  const mit = await worker.fetch(request("/social/meta/publish" + KEY, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId: INHALT, imageUrl: BILD, caption: TEXT,
      approval: { candidateId: ID, approvedBy: "skript", approvedAt: "2026-09-20T09:00:00Z",
        contentHash: hash } }) }), env);
  const b = await mit.json();
  assert.equal(mit.status, 200);
  assert.equal(b.published, true);
  assert.equal(b.via, "APPROVAL");
  assert.equal(b.mediaId, PUBLISH_MEDIA_ID);
});

test("AD29 · Und lehnt einen falschen Abdruck weiterhin ab", async () => {
  const { env } = await aufbau();
  const r = await worker.fetch(request("/social/meta/publish" + KEY, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId: INHALT, imageUrl: BILD, caption: "Ein anderer Text.",
      approval: { contentHash: await abdruck() } }) }), env);
  const b = await r.json();
  assert.equal(r.status, 409);
  assert.equal(b.error, "approvalMismatch");
  assert.equal(b.published, false);
});

/* =========================================================================
   DIE ZWEITE LINIE

   Beim Nachmessen der Waechter fiel auf: zwei absichtlich eingebaute
   Fehler liessen KEINEN Test fallen.

   Der eine war harmlos - die fruehe Abfrage in handlePublishDecision
   ist eine Bequemlichkeit, keine Sicherung. Faellt sie weg, faengt
   `recordDecision` den zweiten Druck, und darunter faengt ihn der
   Anspruch. Drei Linien, und die oberste ist die entbehrlichste. Das
   steht hier, damit niemand sie spaeter fuer die tragende haelt.

   Der andere war es nicht. Wer in `recordDecision` die Pruefung auf
   eine bestehende Entscheidung entfernt, bricht nichts - WEIL die
   Route vorher nachsieht. Das Journal selbst war ungesichert, und
   seine Sicherung ungeprueft. Die naechste Bearbeitung der Route
   haette sie stillschweigend mitgenommen.
   ========================================================================= */

test("AD30 · Das Journal schuetzt sich selbst gegen ein Ueberschreiben", async () => {
  const { recordDecision, readDecision } = await import("../src/store.js");
  const { env } = await aufbau();

  const erst = await recordDecision(env, { candidateId: "cand_direkt",
    contentHash: "a".repeat(64), decision: "REJECTED", reason: "Erster Grund." });
  assert.equal(erst.ok, true);

  /* Direkt am Speicher vorbei an der Route - genau so, wie es ein
     kuenftiger zweiter Aufrufer taete. */
  const zweit = await recordDecision(env, { candidateId: "cand_direkt",
    contentHash: "b".repeat(64), decision: "APPROVED", reason: "Zweiter Grund." });

  assert.equal(zweit.ok, false);
  assert.equal(zweit.reason, "alreadyDecided");
  assert.equal(zweit.decision.reason, "Erster Grund.",
    "Die erste Entscheidung ist weg. Sie ist die, die der Owner getroffen hat.");

  const gespeichert = await readDecision(env, "cand_direkt");
  assert.equal(gespeichert.decision, "REJECTED");
  assert.equal(gespeichert.contentHash, "a".repeat(64));
});

test("AD31 · Ein Ergebnis anzuhaengen ist kein Ueberschreiben", async () => {
  /* Medien-ID und Permalink gehoeren zu derselben Entscheidung. Sie
     nachzutragen darf gehen - und darf die Entscheidung nicht aendern. */
  const { recordDecision, settleDecision } = await import("../src/store.js");
  const { env } = await aufbau();

  await recordDecision(env, { candidateId: "cand_direkt2",
    contentHash: "c".repeat(64), decision: "APPROVED" });
  const fertig = await settleDecision(env, "cand_direkt2",
    { published: true, mediaId: "m_1", permalink: "https://x.invalid/p/1" });

  assert.equal(fertig.decision, "APPROVED");
  assert.equal(fertig.published, true);
  assert.equal(fertig.mediaId, "m_1");
  assert.equal(fertig.contentHash, "c".repeat(64));

  /* Und ein spaeterer Fehlversuch loescht den Beleg nicht. */
  const spaeter = await settleDecision(env, "cand_direkt2",
    { published: false, lastError: "META_PUBLISH_FAILED" });
  assert.equal(spaeter.published, true, "Der Beleg der Veroeffentlichung ist weg.");
  assert.equal(spaeter.mediaId, "m_1");
});

test("AD32 · Die Uebersicht fragt je Wartendem, nicht die ganze Ablage", async () => {
  /* Entscheidungen werden nie geloescht - sie sind der Beleg. Die Liste
     waechst also dauerhaft; die Schlange nicht. Wer bei jedem
     Seitenaufruf die Ablage durchgeht, zahlt fuer Geschichte statt
     fuer Gegenwart, und zwar jedes Jahr mehr.

     Gemessen wird das an den KV-Zugriffen, nicht am Quelltext: ein
     Kommentar ueber Sparsamkeit ist keine Sparsamkeit. */
  const { env, cookie, hash } = await aufbau();
  await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });

  /* Hundert alte Entscheidungen aus vergangenen Monaten. */
  const { recordDecision } = await import("../src/store.js");
  for (let n = 0; n < 100; n += 1) {
    await recordDecision(env, { candidateId: "cand_alt_" + n,
      contentHash: "d".repeat(64), decision: "REJECTED", reason: "alt" });
  }

  let gelesen = 0;
  const echtesGet = env.VU_SOCIAL_KV.get.bind(env.VU_SOCIAL_KV);
  env.VU_SOCIAL_KV.get = async (k) => {
    if (String(k).startsWith("approval:decision:")) gelesen += 1;
    return echtesGet(k);
  };
  let aufgelistet = 0;
  const echtesList = env.VU_SOCIAL_KV.list.bind(env.VU_SOCIAL_KV);
  env.VU_SOCIAL_KV.list = async (o) => { aufgelistet += 1; return echtesList(o); };

  const r = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  assert.equal(r.status, 200);

  assert.equal(aufgelistet, 0,
    "Die Uebersicht listet die Ablage auf - das waechst mit der Geschichte.");
  assert.ok(gelesen <= 2,
    "Die Schlange hat einen Eintrag; gelesen wurden " + gelesen + " Entscheidungen.");
});

/* ============================================ §25 durch den ganzen Weg

   AG28-AG30 halten fest, dass ohne Abdruck nicht freigegeben wird.
   Hier geht es um die andere Haelfte: dass der Abdruck den Weg von der
   Schlange bis zum Bildabruf TATSAECHLICH geht.

   Beide Zeilen - der Abdruck im Eintrag und der Abdruck im Aufruf -
   liessen sich einzeln entfernen, ohne dass ein Test fiel. Ein Tor, das
   nicht im Weg steht, ist keines.
   ================================================================= */

test("AD29 · Ein ausgetauschtes Bild kommt nicht durch den Owner-Pfad", async () => {
  /* Alles stimmt, was sich an Zeichenketten pruefen laesst: Adresse,
     Caption, contentHash. Nur die Datei hinter der Adresse ist eine
     andere geworden - genau die Lage vom 21.09.

     `fuellung` aendert ein Byte: gleiche Masse, gleicher Typ, anderer
     Abdruck. */
  const { env, cookie, hash, g } =
    await aufbau({ graph: { bild: jpegBytes({ fuellung: 3 }) } });
  const r = await tun(env, cookie, `/approval/${ID}/publish`, { fingerprint: hash });
  const html = await r.text();

  assert.match(titel(html), /Bild hat sich seit der Freigabe geaendert/,
    "Der Owner erfaehrt nicht, was wirklich los ist: " + titel(html));

  /* Und zwar, BEVOR etwas an Meta ging. Ein Container, der steht, ist
     nicht zurueckzunehmen. */
  const schreibend = g.aufrufe.filter((a) => a.methode === "POST");
  assert.equal(schreibend.length, 0,
    "Es ging etwas an Meta hinaus, obwohl das Bild ein anderes war.");
});
