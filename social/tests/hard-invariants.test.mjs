/* =========================================================================
   VU SOCIAL — FUENF SAETZE, DIE WAHR SEIN MUESSEN (HI1–HI16)

   §45. Und eine Lektion aus dem Bauen dieser Pruefung, die wichtiger
   ist als die fuenf Saetze selbst:

   DREI ANLAEUFE LANG "HIELT" DAS OWNER-TOR AUS DEM FALSCHEN GRUND.
   Erst antwortete der Pfad "notFound" (die Adresse gab es nicht), dann
   "publishingDisabled" (das war der globale Schalter), dann
   "notConnected" (das war die Anbindung). Jedes Mal stand im Bericht
   "OK". Ein Waechter, der haelt, weil man ihn nie gefragt hat.

   Deshalb prueft diese Datei nicht nur, DASS abgelehnt wurde, sondern
   WOMIT.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HI = require("../engines/hard-invariants.js");
const Kadenz = require("../engines/content-cadence.js");

const KONFIG = JSON.parse(readFileSync(join(ROOT, "social/config/cadence.json"), "utf8"));

/* --------------------------------------------- Die fuenf sind benannt */

test("HI1 · Genau fuenf Invarianten, mit ihren Sollwerten", () => {
  assert.deepEqual(Object.keys(HI.SOLL).sort(), [
    "EXTERNAL_SOCIAL_SOURCES_ACTIVE", "GLOBAL_AUTOPUBLISH",
    "MAX_OPEN_CREATIVE_JOBS", "OWNER_PUBLISHING_GATE", "VU_SOCIAL_AUTOPUBLISH"
  ]);
  assert.equal(HI.SOLL.MAX_OPEN_CREATIVE_JOBS, 1);
  assert.equal(HI.SOLL.GLOBAL_AUTOPUBLISH, false);
  assert.equal(HI.SOLL.VU_SOCIAL_AUTOPUBLISH, false);
  assert.equal(HI.SOLL.OWNER_PUBLISHING_GATE, true);
  assert.equal(HI.SOLL.EXTERNAL_SOCIAL_SOURCES_ACTIVE, 0);
});

test("HI2 · Jeder Befund nennt seine Quelle", () => {
  /* Ein Befund ohne Quelle ist eine Behauptung mit Etikett. */
  const r = HI.alle({ cadenceConfig: KONFIG, killSwitch: { gates: {} },
    wrangler: "", workerSource: "", publishOhneFreigabe: {},
    publishMitFalschemAbdruck: {}, registryStatus: {} });
  for (const b of r.invarianten) {
    assert.ok(b.quelle && b.quelle.length > 5, b.id + " ohne Quelle");
    assert.ok(b.beleg && b.beleg.length > 10, b.id + " ohne Beleg");
  }
});

/* ------------------------------------------ Gemessen, nicht behauptet */

test("HI3 · Der Creative-Job-Deckel wird am VERHALTEN gemessen", () => {
  /* Nicht an einer Zahl in einer Konfiguration, die vielleicht
     niemand liest. */
  const gut = HI.creativeJobs(1, KONFIG);
  assert.equal(gut.erfuellt, true, gut.beleg);
  assert.match(gut.quelle, /content-cadence\.entscheide/);
});

test("HI4 · Ein zweiter offener Job verletzt die Invariante", () => {
  const schlecht = HI.creativeJobs(2, KONFIG);
  assert.equal(schlecht.erfuellt, false);
  assert.equal(schlecht.wert, 2);
});

test("HI5 · Laesst die Kadenz bei einem offenen Job durch, faellt es auf", () => {
  /* Die Gegenprobe zur Regel selbst: eine Konfiguration, in der die
     Engine den Job ignorierte, muesste die Invariante brechen. Hier
     wird sie mit einer Engine-Antwort geprueft, die "ja" sagt. */
  const original = Kadenz.entscheide;
  try {
    Kadenz.entscheide = () => ({ darfErzeugen: true, grund: null });
    assert.equal(HI.creativeJobs(0, KONFIG).erfuellt, false);
  } finally { Kadenz.entscheide = original; }
});

test("HI6 · Der globale Schalter wird dort gesucht, wo er steht", () => {
  /* Ein frueherer Pruefer suchte ihn in autonomy.json und meldete
     pflichtgemaess "nicht gefunden" - fuer einen Schalter, der in
     kill-switch.json steht und aus ist. */
  const b = HI.globalAutopublish(
    JSON.parse(readFileSync(join(ROOT, "social/config/kill-switch.json"), "utf8")));
  assert.equal(b.erfuellt, true, b.beleg);
  assert.match(b.quelle, /kill-switch\.json#gates\.GLOBAL_AUTOPUBLISH/);
});

test("HI7 · Ein fehlender Schalter ist keine erfuellte Invariante", () => {
  /* "Nicht gefunden" darf nicht als "aus" durchgehen: eine Invariante
     ueber einen Schalter, den es nicht gibt, ist keine. */
  const b = HI.globalAutopublish({ gates: {} });
  assert.equal(b.erfuellt, false);
  assert.equal(b.wert, null);
});

test("HI8 · Ein eingeschalteter Schalter faellt auf", () => {
  assert.equal(HI.globalAutopublish({ gates: { GLOBAL_AUTOPUBLISH: { enabled: true } } })
    .erfuellt, false);
});

/* ------------------------------------------------ Der Worker-Schalter */

test("HI9 · Konfiguriertes Autopublish faellt auf", () => {
  const b = HI.workerAutopublish('VU_SOCIAL_AUTOPUBLISH = "on"',
    'x.toLowerCase() === "on"');
  assert.equal(b.erfuellt, false);
});

test("HI10 · Eine laxe Pruefung im Worker faellt auf", () => {
  /* Nicht konfiguriert reicht nicht: wer "true" oder "1" als
     Einschaltung liest, hat einen Schalter, den eine Tippfehler-Zeile
     umlegt. */
  const b = HI.workerAutopublish("", "if (env.VU_SOCIAL_AUTOPUBLISH) publish();");
  assert.equal(b.erfuellt, false);
  assert.match(b.beleg, /nicht strikt/);
});

/* -------------------------------------------------- Das Owner-Tor */

test("HI11 · Nur die halbe Frage ist kein Bestehen", () => {
  /* Die Lektion aus drei Anlaeufen: A haengt am Schalter, B nicht.
     Wer nur A fragt, misst eine Selbstverstaendlichkeit. */
  const nurA = HI.ownerTor({ status: 403, published: false, error: "publishingDisabled" });
  assert.equal(nurA.erfuellt, false);
  assert.equal(nurA.wert, null);
  assert.match(nurA.beleg, /nicht gemessen/);
});

test("HI12 · Beide Fragen abgelehnt heisst erfuellt", () => {
  const b = HI.ownerTor(
    { status: 403, published: false, error: "publishingDisabled" },
    { status: 409, published: false, error: "approvalMismatch" });
  assert.equal(b.erfuellt, true);
  assert.match(b.beleg, /approvalMismatch/);
});

test("HI13 · Ein durchgelassener falscher Abdruck bricht die Invariante", () => {
  /* Der Fall, der ohne die zweite Frage unsichtbar bliebe: ein
     nachtraeglich geaenderter Inhalt geht mit einer alten Freigabe
     hinaus. */
  const b = HI.ownerTor(
    { status: 403, published: false, error: "publishingDisabled" },
    { status: 200, published: true });
  assert.equal(b.erfuellt, false);
  assert.match(b.beleg, /falschem Abdruck durch/);
});

/* ------------------------------------------------ Externe Quellen */

test("HI14 · Unbekannt ist nicht null", () => {
  assert.equal(HI.externeQuellen({}).erfuellt, false);
  assert.equal(HI.externeQuellen({ activeCount: 0 }).erfuellt, true);
  assert.equal(HI.externeQuellen({ activeCount: 1 }).erfuellt, false);
});

/* ------------------------------------- Das Skript als Ganzes */

test("HI15 · Das echte Skript misst alle fuenf und besteht", () => {
  const aus = execFileSync(process.execPath,
    [join(ROOT, "scripts/social/check-hard-invariants.mjs")],
    { cwd: ROOT, encoding: "utf8" });
  for (const id of Object.keys(HI.SOLL)) {
    assert.match(aus, new RegExp("OK\\s+" + id), id + " nicht bestanden:\n" + aus);
  }
  assert.match(aus, /Alle fuenf harten Invarianten gemessen und erfuellt/);
});

test("HI16 · Das Skript veroeffentlicht nichts", () => {
  /* Es ruft den echten Publish-Pfad auf - zweimal, einmal sogar mit
     eingeschaltetem Schalter. Es darf trotzdem nie nach aussen gehen. */
  const quelle = readFileSync(
    join(ROOT, "scripts/social/check-hard-invariants.mjs"), "utf8");
  assert.match(quelle, /globalThis\.fetch = async/);
  assert.match(quelle, /Kein Netz in dieser Pruefung/);
  /* Und es fasst keine Produktionsdatei an. */
  assert.ok(!/writeFileSync|mkdirSync|appendFileSync/.test(quelle),
    "Die Invariantenpruefung schreibt");
});

/* ===========================================================================
   DER VIERTE FALSCHE GRUND

   Die Tests HI11-HI13 verlangten, dass BEIDE Fragen gestellt werden. Eine
   Gegenprobe am echten Worker hat gezeigt, dass das nicht reicht: baut man
   die Abdruckpruefung aus, stirbt die Anfrage eine Stufe spaeter am Bild.
   Die Antwort war dann

       { published: false, error: "imageUnreachable" }

   und der Bericht sagte "OK   OWNER_PUBLISHING_GATE   ist true". Das Tor war
   ausgebaut. Die Messung hat es gelobt.

   Die vier Tests hier sind aus genau diesen gemessenen Antworten gebaut.
   =========================================================================== */

test("HI17 · Eine Ablehnung aus einem anderen Grund ist keine Messung des Tors", () => {
  /* Woertlich die Antwort, die der Worker mit ausgebauter Abdruckpruefung gab. */
  const b = HI.ownerTor(
    { published: false, error: "publishingDisabled" },
    { published: false, error: "imageUnreachable" });
  assert.equal(b.erfuellt, false, "Ein Tor, das nie gefragt wurde, hat nicht gehalten");
  assert.equal(b.wert, null, "Ungemessen ist weder wahr noch falsch");
  assert.match(b.beleg, /nicht vom Tor/);
  assert.match(b.beleg, /imageUnreachable/);
  assert.match(b.beleg, /approvalMismatch/, "Der Beleg muss nennen, was gefehlt hat");
});

test("HI18 · Auch die erste Frage braucht ihren eigenen Grund", () => {
  /* Die Antwort mit ausgebautem Schalter-und-Freigabe-Block. */
  const b = HI.ownerTor(
    { published: false, error: "imageUnreachable" },
    { published: false, error: "approvalMismatch" });
  assert.equal(b.erfuellt, false);
  assert.equal(b.wert, null);
  assert.match(b.beleg, /im Betrieb kam "imageUnreachable" statt "publishingDisabled"/);
});

test("HI19 · Die drei frueheren falschen Gruende bestehen nicht mehr", () => {
  /* notFound, publishingDisabled an der falschen Stelle, notConnected - jeder
     hat in einem frueheren Anlauf ein "OK" erzeugt. */
  for (const grund of ["notFound", "notConnected", "contentIdRequired", "publishingDisabled"]) {
    const b = HI.ownerTor(
      { published: false, error: "publishingDisabled" },
      { published: false, error: grund });
    if (grund === "approvalMismatch") continue;
    assert.equal(b.erfuellt, false, grund + " wurde als Tor gewertet");
  }
  /* Und der eine richtige Grund besteht. */
  assert.equal(HI.ownerTor(
    { published: false, error: "publishingDisabled" },
    { published: false, error: "approvalMismatch" }).erfuellt, true);
});

test("HI20 · Jede Frage hat genau einen Tor-Grund, und er steht nicht im Test", () => {
  assert.equal(HI.TOR_GRUND.betrieb, "publishingDisabled");
  assert.equal(HI.TOR_GRUND.falscherAbdruck, "approvalMismatch");
  /* Die Gruende muessen im Worker tatsaechlich vorkommen - sonst prueft die
     Invariante auf eine Antwort, die es nicht gibt, und haelt fuer immer. */
  const worker = readFileSync(new URL(
    "../../workers/vision-universe-social/src/index.js", import.meta.url), "utf8");
  for (const g of Object.values(HI.TOR_GRUND)) {
    assert.ok(worker.includes('error: "' + g + '"'),
      "Der Worker antwortet nie mit " + g + " — die Invariante fragt ins Leere");
  }
});
