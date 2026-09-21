/* =========================================================================
   social/tests/product-readiness.test.mjs

   SOCIAL_OS_1_0_PRODUCTION_READY (§55)

   Zwei Dinge werden hier gemessen, und das zweite ist das wichtigere:

     1. dass das Urteil die vier Zustaende auseinanderhaelt
     2. dass die MESSUNG ihren Gegenstand trifft

   Der zweite Punkt hat beim Bauen dieses Berichts dreimal zugeschlagen:
   `git ls-files` brach mit ENOBUFS ab und meldete "Kein Atlas-Asset im
   Repository gefunden", waehrend die Datei danebenlag; performance.json
   heisst `snapshots` und nicht `posts`, also waren null Beitraege
   gemessen statt 25; und die Lerndimensionen wurden gegen eine Engine
   gerechnet, die sie nie kannte.

   Dreimal dieselbe Familie: eine Pruefung, die am falschen Ort sucht,
   meldet immer dasselbe - und es klingt wie ein Befund.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const P = require("../engines/product-readiness.js");

/* Kommentare sind kein ausgefuehrter Code - und diese Datei erklaert
   ihre eigenen Fehler im Kommentar. Wer dort nach Verdrahtung sucht,
   findet den Namen, den er gerade verbieten will. */
function ohneKommentare(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function messung() {
  return ohneKommentare(readFileSync(
    new URL("../../scripts/social/social-os-ready.mjs", import.meta.url), "utf8"));
}

/* ============================================ Das Urteil */

test("PR40 · Dreizehn Bedingungen, jede mit Paragraph und Frage", () => {
  assert.equal(P.BEDINGUNGEN.length, 13);
  for (const b of P.BEDINGUNGEN) {
    assert.match(b.id, /^[A-Z_]+$/);
    assert.match(b.ref, /§/, b.id + " nennt keinen Paragraphen.");
    assert.ok(b.frage.endsWith("?"), b.id + " stellt keine Frage.");
  }
  const ids = P.BEDINGUNGEN.map((b) => b.id);
  assert.equal(new Set(ids).size, 13);
});

test("PR41 · Ungeprueft ist nicht erfuellt - und auch nicht 'nicht erfuellt'", () => {
  /* Der Unterschied, der den ganzen Bericht traegt. Wer nicht
     hingesehen hat, hat keinen Befund; das als Mangel zu fuehren
     waere genauso falsch wie es als Erfolg zu fuehren. */
  const r = P.beurteile({});
  assert.equal(r.zaehlung.ungeprueft, 13);
  assert.equal(r.zaehlung.nichtErfuellt, 0);
  assert.equal(r.ready, false);
});

test("PR42 · Ein Blocker ersetzt keine Erfuellung", () => {
  /* Ein Blocker erklaert, warum etwas fehlt. Er macht es nicht da. */
  const alle = {};
  for (const b of P.BEDINGUNGEN) alle[b.id] = { zustand: "ERFUELLT", satz: "x" };
  /* Mit dem Produktnachweis (§53) ist es ready - ohne ihn nicht, und
     das ist eine eigene Zusicherung: siehe PR50. */
  assert.equal(P.beurteile(alle, { ok: true }).ready, true);

  alle[P.BEDINGUNGEN[0].id] = { zustand: "BLOCKIERT", satz: "x",
    blocker: "Owner muss entscheiden" };
  const r = P.beurteile(alle, { ok: true });
  assert.equal(r.ready, false, "Ein Blocker wurde als Erfuellung gezaehlt.");
  assert.equal(r.zaehlung.blockiert, 1);
  assert.equal(r.bedingungen[0].blocker, "Owner muss entscheiden");
});

test("PR43 · Ein unbekannter Zustand wird nie als Erfolg gelesen", () => {
  const alle = {};
  for (const b of P.BEDINGUNGEN) alle[b.id] = { zustand: "ERFUELLT", satz: "x" };
  alle[P.BEDINGUNGEN[3].id] = { zustand: "FAST_FERTIG", satz: "x" };
  const r = P.beurteile(alle);
  assert.equal(r.ready, false);
  assert.equal(r.bedingungen[3].zustand, "UNGEPRUEFT");
});

test("PR44 · Der Satz widerspricht §55 nicht", () => {
  /* §55: gruene Tests und ein Deployment machen daraus kein fertiges
     Produkt. Der Bericht muss das sagen, sonst wird er genau so
     gelesen. */
  const r = P.beurteile({});
  assert.match(r.erklaerung, /Gruene Tests|sauberes Deployment/);
});

/* ============================================ Die Messung trifft ihren Gegenstand */

test("PR45 · Die Assetsuche unterscheidet 'nichts da' von 'nicht gesucht'", () => {
  /* Der ENOBUFS-Fall. Ein Werkzeugfehler darf nie als Aussage ueber
     das Repository durchgehen. */
  const q = messung();
  assert.match(q, /maxBuffer/,
    "git laeuft wieder ohne Puffergrenze - ENOBUFS wuerde als 'nichts " +
    "gefunden' durchgehen.");
  assert.match(q, /liste === null/,
    "Ein gescheiterter Suchaufruf wird nicht von einem leeren Ergebnis " +
    "unterschieden.");
});

test("PR46 · git ls-files auf assets/ passt in den Puffer", () => {
  /* Die Gegenprobe zur Gegenprobe: dass der gezielte Aufruf wirklich
     klein ist. Ohne sie waere PR45 eine Behauptung ueber eine Zahl,
     die niemand nachgerechnet hat. */
  const gezielt = execFileSync("git", ["ls-files", "--", "assets/"],
    { encoding: "utf8" });
  assert.ok(gezielt.length < 1024 * 1024,
    "Auch der gezielte Aufruf ist zu gross: " + gezielt.length);
  assert.match(gezielt, /assets\/atlas\.png/);
  assert.match(gezielt, /assets\/vision-universe-logo\.png/);
});

test("PR47 · Die Leistungsdaten werden dort gelesen, wo sie stehen", () => {
  /* performance.json fuehrt `snapshots`. Der erste Entwurf las
     `posts || entries` - beides gibt es nicht, und der Bericht meldete
     null gemessene Beitraege, waehrend 25 danebenlagen. */
  const p = JSON.parse(readFileSync(
    new URL("../data/performance.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(p.snapshots), "performance.json fuehrt keine snapshots.");
  assert.equal(p.posts, undefined, "Es gibt jetzt doch ein Feld `posts`?");

  const q = messung();
  assert.match(q, /p\.snapshots/,
    "Die Messung liest die Leistungsdaten nicht dort, wo sie stehen.");
});

test("PR48 · Die Lerndimensionen werden am Gedaechtnis gezaehlt", () => {
  /* Nicht an learning-dimensions.js: die Engine spricht ueber die
     HERKUNFT von Dimensionen und kannte die Liste aus §38 nie.
     Gegen sie zu rechnen ergab "zwoelf von zwoelf fehlen" - richtig
     klingend, falsch gemessen. */
  const q = messung();
  assert.match(q, /content-memory\.json/,
    "Die Lerndimensionen werden nicht am Gedaechtnis gemessen.");
  assert.doesNotMatch(q, /learning-dimensions\.js/,
    "Die Messung fragt wieder die Engine, die die Liste nicht kennt.");
});

test("PR49 · Ein Feld ohne Werte zaehlt nicht als erfasste Dimension", () => {
  /* Die passive Form dessen, was §38 verbietet: ein Feldname, in dem
     ueberall null steht, sieht nach erfasster Dimension aus.

     Dieser Test hat frueher festgehalten, DASS der Fall real vorlag -
     `contentFamily` gab es als Feld und in allen 57 Eintraegen stand
     null. Er sollte laut werden, sobald das behoben ist, und genau das
     ist passiert: seit learning-unit.js traegt das Feld Werte.

     Was bleibt, ist die REGEL, nicht der Zustand: eine Zaehlung, die
     Felder statt Werte zaehlt, meldet erfasste Dimensionen, die keine
     sind. Ein Test, der eine Datenlage festhaelt, wird von ihrer
     Behebung ueberholt; ein Test, der die Regel festhaelt, nicht.

     Und weil der alte Fall nicht verschwinden soll: die Altbeitraege
     aus dem Konto tragen die Dimension weiterhin nicht, und das muss
     als "nicht erfasst" sichtbar bleiben - nachtraeglich eine Familie
     zu erfinden waere eine Aussage ueber Beitraege, die niemand unter
     diesem Gesichtspunkt geschrieben hat. */
  const L = require("../engines/learning-unit.js");

  const nurFelder = {};
  for (const d of L.DIMENSIONEN) nurFelder[d.feld] = null;
  const leer = L.erfassung([nurFelder, nurFelder, nurFelder]);
  assert.equal(leer.getragen.length, 0,
    "Ein Feldname ohne Wert zaehlt als erfasste Dimension");
  assert.equal(leer.vollstaendig, false);

  /* Und am echten Gedaechtnis: das Feld gibt es, und es traegt jetzt
     auch Werte - beides. */
  const m = JSON.parse(readFileSync(
    new URL("../data/content-memory.json", import.meta.url), "utf8"));
  const e = m.entries || [];
  assert.ok(e.length, "Kein Gedaechtnis - der Test prueft nichts.");
  assert.ok(e.some((x) => "contentFamily" in x),
    "Das Feld contentFamily gibt es gar nicht mehr.");
  assert.ok(e.some((x) => x.contentFamily),
    "contentFamily traegt keine Werte mehr - §38 waere wieder offen.");
  /* Die Altbeitraege bleiben leer, und das ist richtig. */
  assert.ok(e.some((x) => !x.contentFamily),
    "Alle Eintraege tragen eine Familie - dann wurde nachtraeglich " +
    "erfunden, was niemand entschieden hat.");
});

test("PR50 · Dreizehn gruene Bedingungen sind noch kein Produkt (§55)", () => {
  /* §55 woertlich: SOCIAL_OS_1_0_PRODUCTION_READY darf NICHT allein
     aus gruenen Tests, gruener CI, gemergten PRs und gruenen
     Deployments abgeleitet werden. Dreizehn gemessene Bedingungen
     sind derselbe Fall - notwendig, nicht hinreichend.

     Der Produktnachweis aus §53 stand lange als Satz in einem
     Bericht. Als Satz hat er noch nie etwas aufgehalten; hier steht
     er im Urteil. */
  const alle = {};
  for (const b of P.BEDINGUNGEN) alle[b.id] = { zustand: "ERFUELLT", satz: "x" };

  const ohne = P.beurteile(alle);
  assert.equal(ohne.bedingungenErfuellt, true, "Alle dreizehn sind erfuellt");
  assert.equal(ohne.ready, false,
    "Dreizehn gruene Bedingungen allein haben ready:true ergeben");
  assert.equal(ohne.produktnachweis.ungefuehrt, true);

  const unvollstaendig = P.beurteile(alle,
    { ok: false, erfuellt: 11, gesamt: 12, offen: ["VISUAL_GRAMMAR"] });
  assert.equal(unvollstaendig.ready, false);
  assert.deepEqual(unvollstaendig.produktnachweis.offen, ["VISUAL_GRAMMAR"]);

  assert.equal(P.beurteile(alle, { ok: true }).ready, true);

  /* Und umgekehrt: ein vollstaendiger Nachweis rettet keine offene
     Bedingung. */
  const eineOffen = Object.assign({}, alle);
  eineOffen[P.BEDINGUNGEN[0].id] = { zustand: "NICHT_ERFUELLT", satz: "x" };
  assert.equal(P.beurteile(eineOffen, { ok: true }).ready, false);
});
