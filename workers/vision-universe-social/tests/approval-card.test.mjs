/* =========================================================================
   vision-universe-social — DIE KARTE, AUF DER ENTSCHIEDEN WIRD

   -------------------------------------------------------------------------
   DIE EINE ZUSAGE
   -------------------------------------------------------------------------

   DIE VORSCHAU IST DIE SENDUNG.

   Das Bild auf dieser Seite ist das Bild, das veroeffentlicht wuerde,
   unter seiner echten Adresse. Der Text ist der Text, Zeichen fuer
   Zeichen. Wer hier kuerzt, aufbereitet oder ein Ersatzbild zeichnet,
   laesst den Owner etwas freigeben, das er nicht gesehen hat.

   Das ist keine Darstellungsfrage. Der Abdruck, an den die Freigabe
   gebunden wird, rechnet ueber genau diese drei Werte - waere die
   Anzeige eine andere, gaebe der Owner etwas anderes frei als das,
   was auf dem Bildschirm stand.

   -------------------------------------------------------------------------
   UND DIE ZWEITE
   -------------------------------------------------------------------------

   Eine Luecke bleibt eine Luecke. Ein Feld ohne Provenance wird als
   solches angezeigt - nicht weggelassen (dann saehe es aus, als gaebe
   es das Feld nicht) und nicht gefuellt (dann saehe es aus wie eine
   Antwort).
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY } from "./harness.mjs";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const ID = "cand_20260920_4c7ee69c";

const CAPTION = "Unsere Auswertung bewertet Exxon Mobil mit 52.\n\n" +
  "Der Wert beschreibt die Lage — nicht ihre Ursache. Keine Anlageberatung.";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_test.jpg";

function f(value, basis) { return { value, basis: value === null ? __FEHLT : basis }; }
const __FEHLT = "NICHT_IN_DER_PROVENANCE";

function eintrag(over = {}) {
  return Object.assign({
    candidateId: ID,
    state: "AWAITING_APPROVAL",
    contentHash: "c".repeat(64),
    payload: { contentId: "pkg_test", imageUrl: BILD, caption: CAPTION },
    anzeige: {
      thema: f("Technisches Setup — XOM", "presentation.topic"),
      hook: f("52 von 100 — und warum das keine Empfehlung ist.", "presentation.hook"),
      familie: f("STOCK_STORY", "provenance.audienceFrame.family"),
      kernfrage: f("Was ist bei diesem Unternehmen gerade los?",
        "provenance.audienceFrame.coreQuestion"),
      format: f("IMAGE", "presentation.mediaFormat"),
      storyRichtung: f("STOCK_STORY", "provenance.archetype"),
      hookStrategie: f("chatgpt-work/value_first", "presentation.authoring.pattern"),
      visualStrategie: f("CHART", "provenance.visual.strategy"),
      modus: f("EXPLOIT", "presentation.mode"),
      geplanteStundeUtc: f(18, "presentation.plannedHourUtc")
    },
    guete: { zustand: "BESTANDEN", score: 82, erklaerung: null, warnungen: [] },
    warum: {
      thema: {
        erklaerung: f("Opportunity Score 62 von 100.", "presentation.reason"),
        alternativen: f(["AAPL (58)", "JPM (55)"], "presentation.alternatives"),
        evidenz: f(["sig_1"], "provenance.signalIds"),
        gelegenheit: f("opp_xom", "provenance.opportunityId")
      },
      einstieg: {
        erklaerung: f("Markenwert 100 unter 4 bestandenen von 4 Varianten.",
          "presentation.authoring.reason"),
        muster: f("chatgpt-work/value_first", "presentation.authoring.pattern"),
        korrektur: f(null, null)
      },
      visual: {
        kernidee: f("Eine einzige Kurve: Exxon Mobil ueber 270 Punkte.",
          "provenance.visualDirection.coreIdea"),
        blickpunkt: f("Die Richtung des Verlaufs und der Name.",
          "provenance.visualDirection.mobileFocalPoint"),
        ableitung: f("Abgeleitet aus CHART mit gemessener Spannung.",
          "provenance.visualDirection.derivation.explanation"),
        mussZeigen: f(["Den Klarnamen"], "provenance.visualDirection.mustShow"),
        darfNichtZeigen: f(["Keine Prognoselinie"], "provenance.visualDirection.mustNotShow")
      }
    }
  }, over);
}

function projektion(items, over = {}) {
  return Object.assign({
    version: __internals.QUEUE_VERSION,
    source: __internals.QUEUE_SOURCE,
    countedFiles: false,
    generatedAt: new Date().toISOString(),
    activeCount: items.length,
    complete: true,
    items, unresolved: [], held: [], decided: [], unknown: [], total: items.length
  }, over);
}

async function aufbauen(p) {
  const env = createEnv();
  await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(p) }), env);
  const r = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  return { env, cookie: r.headers.get("set-cookie").split(";")[0] };
}

async function karte(p, id = ID) {
  const { env, cookie } = await aufbauen(p);
  const r = await worker.fetch(request("/approval/" + id, { headers: { cookie } }), env);
  return { status: r.status, html: await r.text(), env, cookie };
}

/** Der sichtbare Text, ohne Stil und ohne Auszeichnung. */
function text(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    /* ALLE Leerraeume, auch Zeilenumbrueche. Der erste Anlauf zog nur
       Leerzeichen zusammen - und eine Pruefung scheiterte daran, dass
       der Satz im Quelltext ueber zwei Zeilen lief. Ein Pruefer, der
       richtige Ausgabe ablehnt, kostet dasselbe wie einer, der falsche
       durchlaesst. */
    .replace(/\s+/g, " ");
}

/* ------------------------------------------ Vorschau ist Sendung */

test("AC1 · Der gezeigte Text ist der Text, Zeichen fuer Zeichen", async () => {
  const { html } = await karte(projektion([eintrag()]));
  const sichtbar = text(html);

  /* Nicht "enthaelt den Anfang" - der ganze Text. Eine Kuerzung waere
     genau der Fall, gegen den die Zusage steht. */
  for (const stueck of CAPTION.split("\n").filter(Boolean)) {
    assert.ok(sichtbar.includes(stueck.trim()),
      "Dieser Teil des Textes fehlt auf der Karte:\n" + stueck);
  }
  /* Und die Karte sagt, dass es der ist. */
  assert.match(sichtbar, /Text, der veroeffentlicht wuerde/);
});

test("AC2 · Das Bild ist das Bild, unter seiner echten Adresse", async () => {
  const { html } = await karte(projektion([eintrag()]));
  const src = (html.match(/<img[^>]+src="([^"]+)"/) || [])[1];
  assert.equal(src, BILD,
    "Ein ersatzweise gezeichnetes Bild waere eine andere Frage als die gestellte.");
  /* Genau eines. Zwei Bilder auf einer Entscheidungsseite lassen offen,
     welches gemeint ist. */
  assert.equal((html.match(/<img /g) || []).length, 1);
});

test("AC3 · Der Abdruck reist mit beiden Formularen", async () => {
  /* Ohne ihn waere die Freigabe an eine Kennung gebunden und nicht an
     einen Inhalt - und ein Tab von gestern gaebe den Beitrag von
     heute frei. */
  const { html } = await karte(projektion([eintrag()]));
  const versteckt = html.match(/name="fingerprint" value="([^"]+)"/g) || [];
  assert.equal(versteckt.length, 2, "Freigabe und Ablehnung brauchen beide den Abdruck.");
  for (const v of versteckt) assert.ok(v.includes("c".repeat(64)));
});

/* ----------------------------------------------- Die Felder aus §4 */

test("AC4 · Der Steckbrief zeigt, was zur Entscheidung gehoert", async () => {
  const { html } = await karte(projektion([eintrag()]));
  const sichtbar = text(html);

  for (const [was, erwartet] of [
    ["Thema", "Technisches Setup — XOM"],
    ["Inhaltsfamilie", "STOCK_STORY"],
    ["Kernfrage", "Was ist bei diesem Unternehmen gerade los?"],
    ["Format", "IMAGE"],
    ["Hook-Strategie", "chatgpt-work/value_first"],
    ["Visual-Strategie", "CHART"],
    ["Erkunden oder Ausnutzen", "EXPLOIT"],
    ["Evidenz", "sig_1"],
    ["Gelegenheit", "opp_xom"]
  ]) {
    assert.ok(sichtbar.includes(was), `Die Zeile "${was}" fehlt`);
    assert.ok(sichtbar.includes(erwartet), `Der Wert zu "${was}" fehlt: ${erwartet}`);
  }
  /* Die Stunde als Uhrzeit: eine nackte 18 neben "geplante Zeit"
     laesst offen, ob Stunde, Tag oder Rang gemeint ist. */
  assert.ok(sichtbar.includes("18:00 UTC"));
});

test("AC5 · Die drei Warum-Fragen stehen als Fragen da", async () => {
  const { html } = await karte(projektion([eintrag()]));
  const sichtbar = text(html);
  assert.ok(sichtbar.includes("Warum dieses Thema"));
  assert.ok(sichtbar.includes("Warum dieser Einstieg"));
  assert.ok(sichtbar.includes("Warum dieses Visual"));

  assert.ok(sichtbar.includes("Opportunity Score 62 von 100."));
  assert.ok(sichtbar.includes("Markenwert 100 unter 4 bestandenen"));
  assert.ok(sichtbar.includes("Eine einzige Kurve"));
  assert.ok(sichtbar.includes("Die Richtung des Verlaufs"));
  assert.ok(sichtbar.includes("Keine Prognoselinie"));
});

/* ------------------------------------------------ Luecken bleiben Luecken */

test("AC6 · Ein Feld ohne Provenance wird gezeigt und nicht gefuellt", async () => {
  const e = eintrag();
  e.anzeige.familie = { value: null, basis: __FEHLT };
  e.anzeige.kernfrage = { value: null, basis: __FEHLT };
  /* Und die Erzaehlrichtung auf etwas Eigenes: im ersten Anlauf trug
     sie denselben Wert wie die Familie, und die Gegenprobe unten hielt
     ihn fuer den ergaenzten. */
  e.anzeige.storyRichtung = { value: "MARKET_CONTEXT", basis: "provenance.archetype" };

  const { html } = await karte(projektion([e]));
  const sichtbar = text(html);

  /* Die Beschriftung bleibt: ein weggelassenes Feld saehe aus, als
     gaebe es die Frage nicht. */
  assert.ok(sichtbar.includes("Inhaltsfamilie"));
  assert.ok(sichtbar.includes("Kernfrage"));
  /* Und darunter steht die Luecke, nicht ein plausibler Wert. */
  assert.ok((sichtbar.match(/nicht in der Provenance/g) || []).length >= 2);
  assert.ok(!sichtbar.includes("STOCK_STORY"),
    "Ein fehlender Wert wurde aus einem anderen Feld ergaenzt.");
});

test("AC7 · Ein Warum-Block ohne Provenance sagt, dass er leer ist", async () => {
  /* Genau der Fall, der bis zu diesem Auftrag bestand: kein Kandidat
     trug eine Bildrichtung. Die Frage unbeantwortet zu lassen ist
     richtig; sie zu beantworten waere Erfindung. */
  const e = eintrag();
  e.warum.visual = {
    kernidee: { value: null, basis: __FEHLT },
    blickpunkt: { value: null, basis: __FEHLT },
    ableitung: { value: null, basis: __FEHLT },
    mussZeigen: { value: [], basis: __FEHLT },
    darfNichtZeigen: { value: [], basis: __FEHLT }
  };

  const { html } = await karte(projektion([e]));
  const sichtbar = text(html);

  assert.ok(sichtbar.includes("Warum dieses Visual"));
  assert.match(sichtbar, /nicht nachtraeglich beantwortet/);
  /* Die anderen beiden Bloecke bleiben unberuehrt. */
  assert.ok(sichtbar.includes("Opportunity Score 62 von 100."));
});

/* ----------------------------------------------------- Das Qualitaetstor */

test("AC8 · Nicht anwendbar wird nicht als bestanden gezeigt", async () => {
  const e = eintrag({ guete: { zustand: "NICHT_ANWENDBAR", score: null,
    erklaerung: "Generatives Bild ohne Textebene.", warnungen: [] } });
  const sichtbar = text((await karte(projektion([e]))).html);

  assert.ok(sichtbar.includes("nicht anwendbar"));
  assert.ok(!/Qualitaetstor\s+bestanden/.test(sichtbar),
    "Eine Pruefung zu behaupten, die nicht stattgefunden hat.");
  assert.ok(sichtbar.includes("Generatives Bild ohne Textebene."));
});

test("AC9 · Nicht bestanden steht auch so da", async () => {
  const e = eintrag({ guete: { zustand: "NICHT_BESTANDEN", score: 31,
    erklaerung: "Zu viel Text auf der Flaeche.", warnungen: [] } });
  const sichtbar = text((await karte(projektion([e]))).html);
  assert.ok(sichtbar.includes("nicht bestanden"));
  assert.ok(sichtbar.includes("31"));
});

/* ------------------------------------------------------- Die Reihenfolge */

test("AC10 · 1 von N kommt aus der Zahl der Maschine", async () => {
  const a = eintrag({ candidateId: "cand_a" });
  const b = eintrag({ candidateId: "cand_b" });
  const c = eintrag({ candidateId: "cand_c" });
  const p = projektion([a, b, c]);

  for (const [id, erwartet] of [["cand_a", "1 von 3"], ["cand_b", "2 von 3"],
    ["cand_c", "3 von 3"]]) {
    const { html } = await karte(p, id);
    assert.match(text(html), new RegExp(erwartet));
  }
});

test("AC11 · Faellt die Maschinenzahl von der Liste ab, gewinnt die Maschine", async () => {
  /* Zwei uebertragene Karten, drei Wartende: einer liess sich nicht
     lesen. "2 von 2" waere eine glattere Zahl und eine falsche. */
  const p = projektion([eintrag({ candidateId: "cand_a" }), eintrag({ candidateId: "cand_b" })],
    { activeCount: 3, complete: false,
      unresolved: [{ candidateId: "cand_c", reason: "KANDIDAT_NICHT_GELESEN" }] });
  const { html } = await karte(p, "cand_a");
  assert.match(text(html), /1 von 3/);
});

/* ------------------------------------------------------ Was nicht da ist */

test("AC12 · Ein Kandidat, der nicht mehr wartet, bekommt keine 404", async () => {
  /* Die Seite gab es. "Gibt es nicht" schickt den Owner auf die Suche
     nach einem Fehler; "wartet nicht mehr" beantwortet seine Frage. */
  const { status, html } = await karte(projektion([eintrag()]), "cand_ganz_anders");
  assert.equal(status, 409);
  assert.match(text(html), /wartet nicht mehr/);
  assert.match(text(html), /nichts schiefgegangen/);
});

test("AC13 · Ein unvollstaendig uebertragener Kandidat sagt genau das", async () => {
  const p = projektion([], { activeCount: 1, complete: false,
    unresolved: [{ candidateId: ID, reason: "KANDIDAT_NICHT_GELESEN" }] });
  const { status, html } = await karte(p, ID);
  assert.equal(status, 409);
  assert.match(text(html), /nicht vollstaendig uebertragen/);
  /* Und ausdruecklich keine Freigabe fuer etwas, das niemand gesehen hat. */
  assert.ok(!/name="fingerprint"/.test(html));
});

/* ---------------------------------------------------------------- §10 */

test("AC14 · Ohne Sitzung gibt die Karte nichts preis", async () => {
  const { env } = await aufbauen(projektion([eintrag()]));
  const r = await worker.fetch(request("/approval/" + ID), env);
  const html = await r.text();

  assert.equal(r.status, 401);
  for (const wort of [CAPTION.slice(0, 40), "Exxon", "pkg_test", ID, "Opportunity Score"]) {
    assert.ok(!html.includes(wort), `Die Karte verraet "${wort}" ohne Anmeldung`);
  }
});

/* -------------------------------------------- Der Text kommt von aussen */

test("AC15 · Ein Text aus dem Creative Agent kann kein Markup einschleusen", async () => {
  /* Die Caption schreibt ein externer Agent. Sie ist damit die
     einzige Stelle dieser Oberflaeche, an der fremder Text ins
     Dokument kommt - und genau dort muss die Maskierung halten. */
  const boese = '</p><script>alert(1)</script><img src=x onerror="alert(2)">' +
    '"><svg onload=alert(3)>';
  const e = eintrag();
  e.payload.caption = boese;
  e.anzeige.thema = f(boese, "presentation.topic");
  e.anzeige.hook = f(boese, "presentation.hook");
  e.warum.visual.kernidee = f(boese, "provenance.visualDirection.coreIdea");

  const { html } = await karte(projektion([e]));

  /* Geprueft wird, ob ein TAG entsteht - nicht, ob die Zeichenfolge
     vorkommt. Sie MUSS vorkommen: maskiert, als Text. Der erste Anlauf
     suchte "onerror=" im ganzen Dokument und fand es in
     `onerror=&quot;alert(2)&quot;` - also genau dort, wo die
     Maskierung funktioniert hat. */
  assert.ok(!/<script/i.test(html), "Ein Skript ist ins Dokument gelangt.");
  assert.ok(!/<svg/i.test(html));
  assert.ok(!/<img[^>]+onerror/i.test(html), "Ein Attribut ist in ein Tag gelangt.");
  assert.ok(!/<[a-z][^>]*\bon[a-z]+\s*=/i.test(html),
    "Irgendein Ereignisattribut steht in einem Tag.");
  /* Und der Gegenbeweis: die gefaehrliche Form ist da, nur maskiert. */
  assert.ok(html.includes("&lt;script&gt;"),
    "Der Text wurde entfernt statt maskiert - dann saehe der Owner etwas " +
    "anderes, als hinausginge.");
  /* Genau ein Bild - das echte. */
  assert.equal((html.match(/<img /g) || []).length, 1);
  /* Und der Text ist trotzdem VOLLSTAENDIG lesbar: maskiert, nicht
     entfernt. Sonst saehe der Owner etwas anderes, als hinausginge. */
  assert.ok(text(html).includes(boese));
});

test("AC16 · Auch eine Kandidatenkennung kann nichts einschleusen", async () => {
  /* Sie steht in den Formularzielen. Eine Kennung mit Anfuehrungszeichen
     waere sonst ein Weg, ein Attribut zu verlassen. */
  const e = eintrag({ candidateId: 'cand_"><script>alert(1)</script>' });
  const p = projektion([e]);
  const { env, cookie } = await aufbauen(p);
  const r = await worker.fetch(
    request("/approval/" + encodeURIComponent(e.candidateId), { headers: { cookie } }), env);

  /* Der Router laesst diese Kennung gar nicht erst durch: sie passt
     nicht auf das Muster. Verschlossen zu bleiben ist hier die
     richtige Antwort - und die Maskierung ist die zweite Linie. */
  assert.equal(r.status, 404);
  assert.ok(!/<script/i.test(await r.text()));
});

/* --------------------------------------------------- Kein Autopublishing */

test("AC17 · Die Karte allein veroeffentlicht nichts", async () => {
  const { env, cookie } = await aufbauen(projektion([eintrag()]));

  /* Zehnmal ansehen ist zehnmal ansehen. */
  for (let n = 0; n < 10; n += 1) {
    const r = await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
    assert.equal(r.status, 200);
  }
  /* Kein Anspruch, kein Protokoll, keine Verbindung angefasst. */
  const schluessel = [...env.VU_SOCIAL_KV.__raw().keys()];
  assert.deepEqual(schluessel.filter((k) => k.startsWith("publish:claim:")), []);
  assert.equal(await env.VU_SOCIAL_KV.get("smoke:publish:v1"), null);
});

test("AC18 · Die Kennung, die der Router erwartet, ist die, die erzeugt wird", async () => {
  /* Der Router unterscheidet Karten von anderen Adressen am Praefix
     "cand_". Das ist eine Annahme UEBER EIN ANDERES REPOSITORY-TEIL -
     und solche Annahmen altern still: aendert make-publish-candidate
     sein Kennungsschema, laufen die Tests hier weiter gruen (sie
     benutzen ja selbst "cand_") und die echte Karte antwortet mit 404.

     Also wird nicht die Annahme getestet, sondern die Uebereinstimmung. */
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  const erzeuger = readFileSync(
    join(ROOT, "scripts/social/make-publish-candidate.mjs"), "utf8");
  const zeile = erzeuger.match(/const candidateId = "([a-z_]+)"/);
  assert.ok(zeile, "Das Kennungsschema steht nicht mehr, wo es stand.");

  const praefix = zeile[1];
  const router = readFileSync(
    join(ROOT, "workers/vision-universe-social/src/approval.js"), "utf8");
  /* Die Zeile im Router ist ein regulaerer Ausdruck, in dem die
     Schraegstriche maskiert sind. Gesucht wird deshalb die
     Gruppenoeffnung mit dem Praefix - das ist die Stelle, die sich
     aendern muesste. */
  assert.ok(router.includes("(" + praefix + "["),
    `Der Router erwartet ein anderes Praefix als "${praefix}".`);

  /* Und die Gegenprobe am lebenden Objekt. */
  const p = projektion([eintrag({ candidateId: praefix + "20260920_abcdef12" })]);
  const { status } = await karte(p, praefix + "20260920_abcdef12");
  assert.equal(status, 200);
});
