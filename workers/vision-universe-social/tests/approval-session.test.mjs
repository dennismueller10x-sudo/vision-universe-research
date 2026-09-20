/* =========================================================================
   vision-universe-social — DAS TOR DES APPROVAL CENTERS

   -------------------------------------------------------------------------
   WAS HIER BEWIESEN WERDEN MUSS
   -------------------------------------------------------------------------

   Der Auftrag sagt es in einem Satz: /approval ist keine oeffentliche
   Admin-Oberflaeche. Daraus folgen vier Aussagen, die einzeln pruefbar
   sein muessen, weil sie einzeln brechen koennen:

     1. OHNE ANMELDUNG NICHTS. Kein Beitrag, kein Text, kein Bild, keine
        Aktion - und auch nicht die Zahl der wartenden Beitraege. Wie
        viel gerade ansteht, ist selbst eine Auskunft ueber den Betrieb.

     2. KEIN GEHEIMNIS IM DOKUMENT. Nicht im HTML, nicht in einem
        Skript, nicht in einer Adresse, nicht in einem Cookie.

     3. FAIL CLOSED. Jeder Zweig, in dem etwas fehlt oder nicht stimmt,
        endet verschlossen. Auch der, in dem gar nichts konfiguriert ist
        - besonders der.

     4. KEINE RECHTEAUSWEITUNG. Die Sitzung oeffnet /approval und sonst
        nichts. Ein Cookie, das den Admin-Schluessel ersetzt, waere eine
        Bequemlichkeit, die ein Tor aufmacht.

   -------------------------------------------------------------------------
   WAS HIER BEWUSST NICHT BEHAUPTET WIRD
   -------------------------------------------------------------------------

   Dass das Abmelden eine Sitzung WIDERRUFT. Tut es nicht. Eine
   zustandslose Sitzung traegt ihre Gueltigkeit in sich; wer das Cookie
   vorher kopiert hat, kommt damit weiter herein, bis es ablaeuft.

   Das ist eine Eigenschaft der Bauart und keine Luecke, die man
   uebersehen hat - und sie steht hier, damit sie nicht spaeter als
   Ueberraschung auftaucht. Der Widerruf existiert, aber er hat einen
   anderen Griff: den Admin-Schluessel drehen. Das entwertet JEDE
   laufende Sitzung sofort (AS9), und das ist bei genau einem Owner die
   richtige Granularitaet.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY } from "./harness.mjs";
import {
  createSession, verifySession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS
} from "../src/session.js";

const STUNDE = 60 * 60 * 1000;

/** Meldet an und gibt das Cookie in der Form zurueck, die ein Browser sendet. */
async function anmelden(env, key = TEST_ADMIN_KEY) {
  const antwort = await worker.fetch(request("/approval/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: key })
  }), env);
  const gesetzt = antwort.headers.get("set-cookie");
  return { antwort, cookie: gesetzt ? gesetzt.split(";")[0] : null };
}

/** Ein Cookie mit einem Token, das zu einem bestimmten Zeitpunkt ausgestellt wurde. */
async function cookieVon(key, now) {
  const { token } = await createSession(key, { now });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/* ------------------------------------------------------ Ohne Anmeldung */

test("AS1 · Ohne Sitzung gibt es das Formular und sonst nichts", async () => {
  const env = createEnv();
  const antwort = await worker.fetch(request("/approval"), env);
  const html = await antwort.text();

  assert.equal(antwort.status, 401);
  assert.match(html, /name="adminKey"/, "Der Weg hinein muss sichtbar sein.");

  /* Was NICHT drinstehen darf. Die Liste ist nicht erschoepfend und
     kann es nicht sein - sie faengt die Formen, in denen ein Leck hier
     tatsaechlich auftreten wuerde: ein Kandidat, eine Caption, eine
     Anzahl, ein Kontoname. */
  /* Geprueft wird der TEXT, nicht das Dokument. Der Stilblock nennt
     Klassennamen wie `.caption` - das ist kein Leck, sondern ein
     Stylesheet. Derselbe Fehler wie in AS4: ein Pruefer, der richtige
     Ausgabe ablehnt, kostet dasselbe wie einer, der falsche
     durchlaesst. */
  const sichtbar = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  for (const verboten of [/candidate/i, /caption/i, /AWAITING_APPROVAL/, /visionuniverse/i,
    /wartet/i, /Beitr(a|ae)g/i]) {
    assert.ok(!verboten.test(sichtbar),
      `Die Anmeldeseite verraet etwas ueber den Betrieb: ${verboten}`);
  }
});

test("AS2 · Die Anmeldeseite traegt kein Geheimnis und laedt kein Skript", async () => {
  const env = createEnv();
  const antwort = await worker.fetch(request("/approval"), env);
  const html = await antwort.text();

  assert.ok(!html.includes(TEST_ADMIN_KEY), "Der Schluessel steht im Dokument.");
  assert.ok(!/<script/i.test(html), "Die Seite laedt ein Skript.");

  const csp = antwort.headers.get("content-security-policy") || "";
  assert.match(csp, /default-src 'none'/,
    "Ohne default-src 'none' waere ein spaeter eingeschleustes Skript erlaubt.");
  assert.ok(!/script-src/.test(csp) || /script-src 'none'/.test(csp),
    "Es gibt keinen Grund, Skripte zu erlauben.");
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);

  assert.match(String(antwort.headers.get("cache-control")), /no-store/);
  assert.match(String(antwort.headers.get("x-robots-tag")), /noindex/);
  assert.equal(antwort.headers.get("referrer-policy"), "no-referrer");
});

test("AS3 · Der Schluessel in der Adresszeile eroeffnet KEINE Sitzung", async () => {
  /* Der bestehende Admin-Weg nimmt `?key=` - fuer curl ist das in
     Ordnung. Fuer eine Oberflaeche, die ein Mensch im Browser oeffnet,
     ist es das nicht: die Adresszeile landet im Verlauf, im Screenshot
     und im Zugriffsprotokoll jedes Zwischenstuecks. Der Auftrag
     verbietet es ausdruecklich. */
  const env = createEnv();
  const antwort = await worker.fetch(
    request("/approval?key=" + encodeURIComponent(TEST_ADMIN_KEY)), env);

  assert.equal(antwort.status, 401, "Der Query-Parameter darf hier nicht wirken.");
  assert.equal(antwort.headers.get("set-cookie"), null);

  /* Und auch nicht am Austauschpunkt selbst. */
  const zweite = await worker.fetch(request(
    "/approval/session?adminKey=" + encodeURIComponent(TEST_ADMIN_KEY), { method: "POST" }), env);
  assert.equal(zweite.status, 401);
  assert.equal(zweite.headers.get("set-cookie"), null);
});

test("AS4 · Ein falscher Schluessel sagt nicht, was falsch war", async () => {
  const env = createEnv();
  const { antwort, cookie } = await anmelden(env, "falsch-aber-lang-genug-0123456789012345");
  const html = await antwort.text();

  assert.equal(antwort.status, 401);
  assert.equal(cookie, null, "Ein falscher Schluessel darf keine Sitzung hinterlassen.");
  /* Keine Auskunft ueber die erwartete Laenge, das erwartete Format
     oder darueber, ob ueberhaupt einer hinterlegt ist.

     Geprueft wird der TEXT, nicht das Dokument: der erste Anlauf suchte
     "32" im ganzen HTML und fand es in einem CSS-Abstand. Ein Pruefer,
     der richtigen Text ablehnt, kostet genauso viel Zeit wie einer, der
     falschen durchlaesst. */
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  for (const verboten of [/\bZeichen\b/i, /zu kurz/i, /nicht konfiguriert/i,
    /hinterlegt/i, /Mindest/i]) {
    assert.ok(!verboten.test(text), `Die Abweisung verraet zu viel: ${verboten}`);
  }
});

/* --------------------------------------------------------- Die Anmeldung */

test("AS5 · Der richtige Schluessel setzt genau ein gebundenes Cookie", async () => {
  const env = createEnv();
  const { antwort } = await anmelden(env);
  const gesetzt = antwort.headers.get("set-cookie");

  assert.equal(antwort.status, 303, "Nach einem POST gehoert eine GET-Adresse in die Zeile.");
  assert.equal(antwort.headers.get("location"), "/approval");

  /* __Host- ist kein Zierrat: es verlangt Secure und Path=/ und
     VERBIETET ein Domain-Attribut. Damit gehoert das Cookie genau
     diesem Host und ist von keiner Subdomain aus setzbar. */
  assert.match(gesetzt, /^__Host-vu_owner_session=/);
  assert.match(gesetzt, /; Secure/);
  assert.match(gesetzt, /; HttpOnly/, "Ohne HttpOnly koennte ein Skript es lesen.");
  assert.match(gesetzt, /; SameSite=Strict/, "Eine fremde Seite darf nichts ausloesen.");
  assert.match(gesetzt, /; Path=\//);
  assert.ok(!/; Domain=/i.test(gesetzt), "__Host- verbietet ein Domain-Attribut.");
  assert.match(gesetzt, new RegExp("Max-Age=" + SESSION_MAX_AGE_SECONDS));
});

test("AS6 · Weder Cookie noch Antwort tragen den Schluessel", async () => {
  const env = createEnv();
  const { antwort } = await anmelden(env);

  const alles = [
    antwort.headers.get("set-cookie"),
    antwort.headers.get("location"),
    await antwort.text()
  ].join("\n");

  assert.ok(!alles.includes(TEST_ADMIN_KEY), "Der Schluessel verlaesst den Worker.");
  /* Auch kein Teilstueck, aus dem man ihn raten koennte. */
  assert.ok(!alles.includes(TEST_ADMIN_KEY.slice(0, 16)));
});

test("AS7 · Mit Sitzung oeffnet sich die Seite", async () => {
  const env = createEnv();
  const { cookie } = await anmelden(env);
  const antwort = await worker.fetch(request("/approval", { headers: { cookie } }), env);

  assert.equal(antwort.status, 200);
  assert.match(String(antwort.headers.get("cache-control")), /no-store/);
  assert.ok(!(await antwort.text()).includes(TEST_ADMIN_KEY));
});

/* ------------------------------------------------------- Fail closed */

test("AS8 · Eine abgelaufene Sitzung wird abgewiesen und das Cookie geloescht", async () => {
  const env = createEnv();
  const cookie = await cookieVon(TEST_ADMIN_KEY, Date.now() - 13 * STUNDE);
  const antwort = await worker.fetch(request("/approval", { headers: { cookie } }), env);

  assert.equal(antwort.status, 401);
  /* Das abgelaufene Cookie muss WEG. Sonst schickt der Browser es bei
     jedem Versuch weiter mit, und der Owner meldet sich an, ohne dass
     sich etwas aendert - ein Fehler, der wie ein kaputter Schluessel
     aussieht und keiner ist. */
  assert.match(String(antwort.headers.get("set-cookie")), /^__Host-vu_owner_session=;/);
  assert.match(String(antwort.headers.get("set-cookie")), /Max-Age=0/);
  assert.match(await antwort.text(), /abgelaufen/i);
});

test("AS9 · Ein gedrehter Admin-Schluessel entwertet jede laufende Sitzung", async () => {
  /* Das ist der Widerruf, den eine zustandslose Sitzung sonst nicht
     haette. Er kostet nichts, weil der Sitzungsschluessel aus dem
     Admin-Schluessel abgeleitet ist - ein neuer Admin-Schluessel ist
     ein neuer Sitzungsschluessel. */
  const env = createEnv();
  const { cookie } = await anmelden(env);

  const vorher = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  assert.equal(vorher.status, 200);

  const gedreht = createEnv({
    VU_SOCIAL_ADMIN_KEY: "ein-anderer-admin-key-mindestens-32-zeichen-lang" });
  const nachher = await worker.fetch(request("/approval", { headers: { cookie } }), gedreht);
  assert.equal(nachher.status, 401, "Der alte Sitzungsnachweis gilt weiter.");
});

test("AS10 · Ein verfaelschtes Cookie kommt nicht herein", async () => {
  const env = createEnv();
  const { cookie } = await anmelden(env);

  const proben = [
    cookie.slice(0, -4) + "AAAA",                    /* Signatur veraendert */
    cookie.replace("=", "=x"),                        /* Nutzlast veraendert */
    `${SESSION_COOKIE_NAME}=nichts`,                  /* kein Punkt, kein Token */
    `${SESSION_COOKIE_NAME}=.`,
    `${SESSION_COOKIE_NAME}=eyJ0IjoxLCJ2IjoxfQ.`      /* Nutzlast ohne Signatur */
  ];
  for (const probe of proben) {
    const antwort = await worker.fetch(request("/approval", { headers: { cookie: probe } }), env);
    assert.equal(antwort.status, 401, `kam herein: ${probe.slice(0, 48)}`);
  }
});

test("AS11 · Ein Token aus der Zukunft ist ein Fund, keine frische Sitzung", async () => {
  /* Ein Zeitstempel, der noch nicht war, kann nicht aus diesem Lauf
     stammen. Ihn durchzulassen hiesse, eine unbegrenzt lange gueltige
     Sitzung zu akzeptieren, solange sie nur weit genug in der Zukunft
     ausgestellt ist. */
  const env = createEnv();
  const cookie = await cookieVon(TEST_ADMIN_KEY, Date.now() + 48 * STUNDE);
  const antwort = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  assert.equal(antwort.status, 401);
});

test("AS12 · Ohne konfigurierten Schluessel ist zu, nicht offen", async () => {
  const ohne = createEnv({ VU_SOCIAL_ADMIN_KEY: undefined });

  const seite = await worker.fetch(request("/approval"), ohne);
  assert.equal(seite.status, 401, "Ein unkonfigurierter Worker darf nicht offenstehen.");

  const versuch = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: "" })
  }), ohne);
  assert.equal(versuch.status, 503);
  assert.equal(versuch.headers.get("set-cookie"), null);

  /* Und der leere Schluessel darf nicht zum leeren Schluessel passen. */
  const leerGegenLeer = await verifySession(undefined, "irgendwas.irgendwas");
  assert.equal(leerGegenLeer.valid, false);
  assert.equal(leerGegenLeer.reason, "notConfigured");
});

test("AS13 · Ein zu kurzer Schluessel wird abgelehnt statt akzeptiert", async () => {
  const schwach = createEnv({ VU_SOCIAL_ADMIN_KEY: "kurz" });
  const antwort = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: "kurz" })
  }), schwach);

  assert.equal(antwort.status, 503, "Ein schwacher Schluessel oeffnet die Oberflaeche.");
  assert.equal(antwort.headers.get("set-cookie"), null);
});

test("AS14 · Unbekannte Pfade unter /approval fallen nicht durch", async () => {
  /* Der allgemeine Router beantwortet Unbekanntes mit 404 - und wuerde
     das VOR dem Tor tun. Jede kuenftige Route unter /approval waere
     dann bis zu ihrer eigenen Pruefung offen. Also beantwortet das
     Approval Center auch das, was es nicht gibt, selbst. */
  const env = createEnv();
  for (const pfad of ["/approval/queue", "/approval/publish", "/approval/x/y"]) {
    const antwort = await worker.fetch(request(pfad), env);
    assert.equal(antwort.status, 401, `${pfad} war nicht verschlossen`);
    assert.match(await antwort.text(), /name="adminKey"/);
  }

  /* Mit Sitzung darf dieselbe Adresse ehrlich 404 sagen. */
  const { cookie } = await anmelden(env);
  const angemeldet = await worker.fetch(
    request("/approval/queue", { headers: { cookie } }), env);
  assert.equal(angemeldet.status, 404);
});

/* --------------------------------------------- Keine Rechteausweitung */

test("AS15 · Die Sitzung oeffnet /approval und nichts sonst", async () => {
  const env = createEnv();
  const { cookie } = await anmelden(env);

  /* Nicht per Verbot, sondern per Bauart: requireAdmin liest ueberhaupt
     kein Cookie. Dieser Test haelt fest, dass das so BLEIBT - jemand
     koennte die Bequemlichkeit spaeter einbauen wollen. */
  for (const pfad of ["/social/meta/status", "/social/meta/connect",
    "/social/meta/insights", "/social/meta/hashtag-capability"]) {
    const antwort = await worker.fetch(request(pfad, { headers: { cookie } }), env);
    assert.equal(antwort.status, 401, `${pfad} liess das Sitzungscookie gelten`);
  }

  /* Und die beiden Wege, die etwas veroeffentlichen koennten, erst
     recht. */
  for (const pfad of ["/social/meta/publish", "/social/meta/smoke-publish"]) {
    const antwort = await worker.fetch(
      request(pfad, { method: "POST", headers: { cookie } }), env);
    assert.equal(antwort.status, 401, `${pfad} liess das Sitzungscookie gelten`);
    const koerper = await antwort.json();
    assert.notEqual(koerper.published, true);
  }
});

test("AS16 · Das Abmelden loescht das Cookie - und behauptet nichts weiter", async () => {
  const env = createEnv();
  const { cookie } = await anmelden(env);

  const abgemeldet = await worker.fetch(
    request("/approval/logout", { method: "POST", headers: { cookie } }), env);

  assert.equal(abgemeldet.status, 200);
  assert.match(String(abgemeldet.headers.get("set-cookie")), /Max-Age=0/);
  assert.match(await abgemeldet.text(), /Abgemeldet/);

  /* DIE EHRLICHE HAELFTE: das Token selbst bleibt gueltig, bis es
     ablaeuft. Wer das Cookie vorher kopiert hat, kommt damit herein.
     Das steht hier als geprueftes Verhalten und nicht als
     uebersehener Fall - der Widerruf heisst AS9. */
  const alt = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  assert.equal(alt.status, 200,
    "Eine zustandslose Sitzung wird nicht durch Abmelden widerrufen. " +
    "Wer das aendern will, braucht einen Speicher - und muss es wollen.");
});

test("AS17 · Ein GET auf den Austauschpunkt eroeffnet nichts", async () => {
  const env = createEnv();
  const antwort = await worker.fetch(request("/approval/session"), env);
  assert.equal(antwort.status, 401);
  assert.equal(antwort.headers.get("set-cookie"), null);
  assert.match(await antwort.text(), /name="adminKey"/);
});

/* ------------------------------------------------- Keine Nebenwirkung */

test("AS18 · Die bestehenden Routen sind unveraendert", async () => {
  /* Die neue Weiche steht VOR requireAdmin. Eine Weiche an dieser
     Stelle kann still etwas verdecken, das vorher funktionierte -
     deshalb wird hier nachgesehen und nicht angenommen. */
  const env = createEnv();
  const adminQuery = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);

  const health = await worker.fetch(request("/health"), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).alive, true);

  const ohneSchluessel = await worker.fetch(request("/social/meta/status"), env);
  assert.equal(ohneSchluessel.status, 401);

  const mitSchluessel = await worker.fetch(request("/social/meta/status" + adminQuery), env);
  assert.equal(mitSchluessel.status, 200);

  /* Die Startseite liegt HINTER dem Admin-Tor und tat das schon vorher.
     Beide Seiten werden geprueft, weil die neue Weiche genau hier steht
     und beide Richtungen verschieben koennte. */
  assert.equal((await worker.fetch(request("/"), env)).status, 401);
  assert.equal((await worker.fetch(request("/" + adminQuery), env)).status, 200);

  const unbekannt = await worker.fetch(request("/gibtesnicht" + adminQuery), env);
  assert.equal(unbekannt.status, 404);
});

test("AS19 · Die Sitzungsdauer ist zwoelf Stunden - gemessen, nicht behauptet", async () => {
  const ausgestellt = Date.parse("2026-09-20T09:00:00Z");
  const token = (await createSession(TEST_ADMIN_KEY, { now: ausgestellt })).token;

  const kurzVorher = await verifySession(TEST_ADMIN_KEY, token,
    { now: ausgestellt + (SESSION_MAX_AGE_SECONDS - 5) * 1000 });
  assert.equal(kurzVorher.valid, true);

  const kurzDanach = await verifySession(TEST_ADMIN_KEY, token,
    { now: ausgestellt + (SESSION_MAX_AGE_SECONDS + 5) * 1000 });
  assert.equal(kurzDanach.valid, false);
  assert.equal(kurzDanach.reason, "expired");

  assert.equal(SESSION_MAX_AGE_SECONDS, 12 * 60 * 60);

  /* Der Zeitpunkt 0 ist ein Zeitpunkt. Er hat hier einmal auf die echte
     Uhr zurueckgefallen, und dieser Test mass daraufhin den Abstand zum
     1.1.1970 statt der Sitzungsdauer - er war rot aus dem richtigen
     Grund und haette genauso gut gruen sein koennen. */
  const beiNull = await createSession(TEST_ADMIN_KEY, { now: 0 });
  assert.equal((await verifySession(TEST_ADMIN_KEY, beiNull.token, { now: 1000 })).valid, true);
  assert.equal((await verifySession(TEST_ADMIN_KEY, beiNull.token,
    { now: (SESSION_MAX_AGE_SECONDS + 5) * 1000 })).reason, "expired");
});
