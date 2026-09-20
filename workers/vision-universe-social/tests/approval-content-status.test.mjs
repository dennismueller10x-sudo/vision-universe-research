/* =========================================================================
   vision-universe-social — WAS DER LAUF GETAN HAT (CS1–CS12)

   §7, §16, §39–§41.

   -------------------------------------------------------------------------
   DIE FRAGE VOR EINER LEEREN SEITE
   -------------------------------------------------------------------------

   "Aktuell wartet kein Beitrag auf deine Freigabe" ist wahr und
   unbefriedigend. Der Owner will wissen, ob das Ruhe ist oder
   Stillstand.

   Drei Lagen, und keine darf zur anderen werden:

     nicht uebertragen   Wir wissen es hier nicht.
     erklaert            Der Lauf hat gesucht und sagt, warum nichts
                         genommen wurde.
     unerklaert          Der Lauf hat nichts gefunden UND kann es nicht
                         begruenden. Ein Befund, keine beruhigende Zeile.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY } from "./harness.mjs";
import { landingPage } from "../src/approval-ui.js";
import { QUEUE_KEY } from "../src/store.js";

const JETZT = Date.parse("2026-09-20T12:00:00Z");
const vor = (ms) => new Date(JETZT - ms).toISOString();
const nach = (ms) => new Date(JETZT + ms).toISOString();

const NACHWEIS = {
  laufVom: vor(3600e3),
  gesucht: true,
  warumNichtGesucht: null,
  suche: {
    familienGefragtAnzahl: 9, themenGeprueft: 29, stufeErreicht: 5,
    gefunden: 0, vollstaendig: false,
    nichtGefragt: [{ stufe: 6, id: "MEGATREND" }, { stufe: 7, id: "EDUCATION" }],
    ablehnungsgruende: { EVIDENCE_INSUFFICIENT: 7 }
  },
  uhr: { darfErzeugen: true, grund: null, naechsteFruehestens: null },
  tore: { abgelehnt: 3, jeStufe: { FACT_CHECK: 3 }, beispiele: [] }
};

const html = (z) => landingPage(Object.assign({ jetzt: JETZT }, z)).text();

/* Der TEXT der Seite, nicht ihr Markup. Ein Test, der `<em>` mitliest,
   prueft die Formatierung und nicht die Aussage. */
const ohneMarkup = (t) => String(t).replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

/* ------------------------------------------------------ Drei Lagen */

test("CS1 · Ohne Auskunft steht da, dass wir es nicht wissen", async () => {
  const t = await html({ anzahl: 0 });
  assert.match(t, /keine Auskunft vor/);
  /* Ohne Markup gesucht: zwischen "Das heisst" und "nicht" steht ein
     <em>, und ein Test, der das Dokument statt des Textes prueft,
     meldet einen Fehler, den es nicht gibt. */
  assert.match(ohneMarkup(t), /Das heisst nicht, dass nichts wartet|keine Auskunft vor/);
});

test("CS2 · Eine erklaerte Leere zeigt ihren Satz", async () => {
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_JUSTIFIED",
    erklaerung: "Kein Thema trug genug Belege fuer eine eigene Geschichte.",
    nachweis: NACHWEIS } });
  assert.match(t, /Kein Thema trug genug Belege/);
  assert.doesNotMatch(t, /keine Auskunft vor/);
});

test("CS3 · Eine UNERKLAERTE Leere ist als Befund markiert", async () => {
  /* Sonst liest sie sich wie jede andere ruhige Zeile - und genau das
     soll sie nicht. */
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_UNEXPLAINED",
    erklaerung: "Der Nachweis ist unvollstaendig: SUCHE.",
    nachweis: NACHWEIS } });
  assert.match(t, /class="leise warnung"[^>]*>\s*Der Nachweis ist unvollstaendig/);
});

/* ------------------------------------------- Die Breite der Suche */

test("CS4 · Die Seite nennt, was NICHT gefragt wurde (§41)", async () => {
  /* "Neun Familien geprueft" klingt vollstaendig und ist es nicht.
     Die Gegenseite zu verschweigen waere die bequemste Auslassung
     dieser Seite. */
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_JUSTIFIED", erklaerung: "x", nachweis: NACHWEIS } });
  assert.match(t, /Nicht gefragt: MEGATREND, EDUCATION/);
});

test("CS5 · Wurde alles gefragt, steht das auch da", async () => {
  const ganz = JSON.parse(JSON.stringify(NACHWEIS));
  ganz.suche.vollstaendig = true;
  ganz.suche.nichtGefragt = [];
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_JUSTIFIED", erklaerung: "x", nachweis: ganz } });
  assert.match(t, /Jede Stufe wurde gefragt/);
  assert.doesNotMatch(t, /Nicht gefragt:/);
});

/* --------------------------------------------- Zeit in beide Richtungen */

test("CS6 · Vergangenheit und Zukunft werden beide lesbar", async () => {
  /* Ein frueherer Entwurf reichte ISO-Zeichenketten an eine Funktion,
     die Millisekunden erwartet. Auf der Seite stand woertlich
     "Letzter Lauf , fruehestens wieder ,". */
  const gebremst = JSON.parse(JSON.stringify(NACHWEIS));
  gebremst.uhr = { darfErzeugen: false, grund: "MINIMUM_SPACING_NOT_REACHED",
    naechsteFruehestens: nach(2 * 3600e3) };
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_JUSTIFIED", erklaerung: "x", nachweis: gebremst } });
  assert.match(t, /Letzter Lauf vor 1 Stunde/);
  assert.match(t, /fruehestens wieder in 2 Stunden/);
  assert.doesNotMatch(t, /Letzter Lauf ,/);
});

test("CS7 · Ein unlesbarer Zeitpunkt ist nicht leer", async () => {
  const kaputt = JSON.parse(JSON.stringify(NACHWEIS));
  kaputt.laufVom = "irgendwann";
  const t = await html({ anzahl: 0, contentStatus: {
    zustand: "NO_POST_JUSTIFIED", erklaerung: "x", nachweis: kaputt } });
  assert.match(t, /Zeitpunkt unklar/);
});

/* ------------------------------------- Auch wenn etwas wartet (§39) */

test("CS8 · Der Stand steht auch dann da, wenn Beitraege warten", async () => {
  const t = await html({ anzahl: 1,
    items: [{ candidateId: "cand_x", thema: "T", hook: "H" }],
    contentStatus: { zustand: "POST_PREPARED",
      erklaerung: "1 Beitrag vorbereitet.", nachweis: NACHWEIS } });
  assert.match(t, /1 Beitrag vorbereitet/);
});

/* --------------------------------------------- Die Uebertragung */

test("CS9 · Ein unbekannter Inhaltszustand wird abgewiesen", async () => {
  /* Fail closed: lieber die Uebertragung zurueckweisen als eine halbe
     Auskunft anzeigen. */
  const env = createEnv();
  const antwort = await worker.fetch(request("/social/approval/queue", {
    method: "POST",
    headers: { "content-type": "application/json",
               authorization: "Bearer " + TEST_ADMIN_KEY },
    body: JSON.stringify(projektion({ zustand: "HEUTE_KEINE_LUST", erklaerung: "x" }))
  }), env);
  assert.equal(antwort.status >= 400, true);
  const j = await antwort.json();
  assert.match(JSON.stringify(j), /unknownContentState/);
});

test("CS10 · Ein Inhaltszustand ohne Satz wird abgewiesen", async () => {
  const env = createEnv();
  const antwort = await worker.fetch(request("/social/approval/queue", {
    method: "POST",
    headers: { "content-type": "application/json",
               authorization: "Bearer " + TEST_ADMIN_KEY },
    body: JSON.stringify(projektion({ zustand: "NO_POST_JUSTIFIED", erklaerung: "  " }))
  }), env);
  assert.equal(antwort.status >= 400, true);
  assert.match(JSON.stringify(await antwort.json()), /contentStatusWithoutSentence/);
});

test("CS11 · Ohne Inhaltszustand bleibt die Schlange gueltig", async () => {
  /* Eine aeltere Uebertragung kennt ihn nicht, und sie ist trotzdem
     eine gueltige Schlange. */
  const env = createEnv();
  const p = projektion(null);
  delete p.contentStatus;
  const antwort = await worker.fetch(request("/social/approval/queue", {
    method: "POST",
    headers: { "content-type": "application/json",
               authorization: "Bearer " + TEST_ADMIN_KEY },
    body: JSON.stringify(p)
  }), env);
  assert.equal(antwort.status, 200);
});

test("CS12 · Der uebertragene Stand erreicht die Seite", async () => {
  const env = createEnv();
  await worker.fetch(request("/social/approval/queue", {
    method: "POST",
    headers: { "content-type": "application/json",
               authorization: "Bearer " + TEST_ADMIN_KEY },
    body: JSON.stringify(projektion({
      zustand: "NO_POST_JUSTIFIED",
      erklaerung: "Keine Quelle trug heute ein Thema.",
      nachweis: NACHWEIS }))
  }), env);
  const anmeldung = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY })
  }), env);
  const cookie = anmeldung.headers.get("set-cookie").split(";")[0];
  const seite = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  const t = await seite.text();
  assert.match(t, /Keine Quelle trug heute ein Thema/);
  /* Und die Lage der Suche kommt mit. */
  assert.match(t, /Nicht gefragt: MEGATREND/);
});

/** Eine gueltige Projektion mit dem gegebenen Inhaltszustand. */
function projektion(contentStatus) {
  return {
    version: "approval-projection-v1",
    generatedAt: new Date(JETZT).toISOString(),
    activeCount: 0,
    source: "owner-decision.warteschlange",
    countedFiles: false,
    items: [],
    unresolved: [],
    complete: true,
    contentStatus
  };
}
