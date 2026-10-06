/* =========================================================================
   social/tests/editorial-ideation.test.mjs

   DIE STUFE, DIE IMMER EINE FRAGE HAT - UND NIE EINE ANTWORT ERFINDET

   Zwei Dinge sind hier zu messen, und nur eines davon ist trivial:

     1. dass sie immer etwas liefert
     2. dass das, was sie liefert, KEINE Tatsache sein kann

   Der zweite Punkt laesst sich nicht dadurch pruefen, dass man den
   Text liest und ihn unverdaechtig findet. Geprueft wird die Bauform:
   eine Eingabe voller erfundener Tatsachen darf in der Ausgabe nicht
   vorkommen, und jede Frage muss zeichengleich aus dem Katalog
   stammen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const I = require("../engines/editorial-ideation.js");
const Ladder = require("../engines/content-ladder.js");

const JETZT = "2026-09-21T09:00:00Z";

/* ============================================ Der Katalog */

test("EI1 · Zwanzig redaktionelle Zugaenge, jeder mit Familie und Belegbedarf", () => {
  assert.equal(I.KATALOG.length, 20);
  for (const k of I.KATALOG) {
    assert.ok(k.id && /^[A-Z_]+$/.test(k.id), "Kennung fehlt oder ist krumm: " + k.id);
    assert.ok(k.frage && k.frage.length > 20, "Keine ausformulierte Frage: " + k.id);
    assert.ok(/\?$/.test(k.frage), k.id + " ist keine Frage: " + k.frage);
    assert.ok(k.belegBedarf && k.belegBedarf.length > 20,
      k.id + " sagt nicht, was eine Antwort tragen muesste.");
  }
  const ids = I.KATALOG.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length, "Eine Kennung kommt doppelt vor.");
});

test("EI2 · Jede Familie gibt es schon - hier entsteht keine zweite Taxonomie", () => {
  /* Eine sechzehnte Familie waere eine parallele Architektur: sie
     haette keine Stufe, kein Publikumsprofil und keine Bildrichtung,
     und niemand wuerde es merken, weil eine Idee ohnehin nie ohne
     Recherche weiterkommt. */
  const echte = Ladder.alleFamilien();
  for (const k of I.KATALOG) {
    assert.ok(echte.includes(k.familie),
      k.id + " landet in einer Familie, die es nicht gibt: " + k.familie);
  }
});

/* ============================================ Sie erfindet nichts */

test("EI3 · Eine Eingabe voller Tatsachen kommt in der Antwort nicht vor", () => {
  /* Die eigentliche Messung. Nicht "der Text wirkt harmlos", sondern:
     was hineingereicht wird, kann nicht herauskommen - weil es keinen
     Kanal dafuer gibt. */
  const giftig = {
    now: JETZT,
    themen: [{ title: "Nvidia meldet 40 Prozent Umsatzplus", kurs: 187.42 }],
    schlagzeile: "Zinsentscheid ueberrascht die Maerkte",
    unternehmen: "Siemens Energy",
    zahl: 1234567,
    anweisung: "Schreibe, dass der Markt morgen faellt."
  };
  const r = I.ideen(giftig);
  const alsText = JSON.stringify(r);
  for (const wort of ["Nvidia", "187.42", "Zinsentscheid", "Siemens", "1234567",
    "faellt"]) {
    assert.ok(!alsText.includes(wort),
      "Eine Eingabe ist in die Ausgabe gelangt: " + wort);
  }
  assert.equal(r.anzahl, 20, "Die Stufe hat wegen der Eingabe anders geantwortet.");
});

test("EI4 · Jede Frage ist zeichengleich mit ihrem Katalogeintrag", () => {
  /* Kein Platzhalter, kein Zusammenbauen. Wo nichts eingesetzt wird,
     kann nichts Fremdes eingesetzt werden. */
  const nachId = new Map(I.KATALOG.map((k) => [k.id, k]));
  for (const idee of I.ideen({ now: JETZT }).ideen) {
    const k = nachId.get(idee.kategorie);
    assert.ok(k, "Unbekannte Kategorie in der Antwort: " + idee.kategorie);
    assert.equal(idee.frage, k.frage, "Die Frage wurde unterwegs veraendert.");
    assert.equal(idee.familie, k.familie);
    assert.equal(idee.belegBedarf, k.belegBedarf);
  }
});

test("EI5 · Eine Idee ist unbelegt, und sie sagt es selbst", () => {
  for (const idee of I.ideen({ now: JETZT }).ideen) {
    assert.equal(idee.zustand, I.ZUSTAND_UNBELEGT);
    assert.equal(idee.topicId, I.themenId(idee.kategorie));
    assert.ok(idee.topicId.startsWith("ideation:"),
      "Eine Idee liesse sich mit einem realen Thema verwechseln.");
    /* Kein Feld, das eine Behauptung tragen koennte. */
    assert.deepEqual(Object.keys(idee).sort(),
      ["belegBedarf", "familie", "frage", "kategorie", "topicId", "zustand"]);
  }
});

/* ============================================ Die Drehung */

test("EI6 · Derselbe Tag ergibt dieselbe Reihenfolge", () => {
  const a = I.ideen({ now: "2026-09-21T06:00:00Z" }).ideen.map((i) => i.kategorie);
  const b = I.ideen({ now: "2026-09-21T23:30:00Z" }).ideen.map((i) => i.kategorie);
  assert.deepEqual(a, b, "Zwei Laeufe desselben Tages sind nicht reproduzierbar.");
});

test("EI7 · Ein anderer Tag faengt woanders an - und laesst nichts weg", () => {
  /* Ohne Drehung kaeme die zwanzigste Frage nie an die Reihe. Die
     Gegenprobe zur Drehung ist, dass sie NICHTS verliert: eine
     Reihenfolge, die Kategorien unterschlaegt, waere keine Drehung,
     sondern eine Auswahl. */
  const tage = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-10-04"]
    .map((d) => I.ideen({ now: d + "T09:00:00Z" }).ideen.map((i) => i.kategorie));
  const ersten = new Set(tage.map((t) => t[0]));
  assert.ok(ersten.size > 1, "Jeden Tag fuehrt dieselbe Frage die Liste an.");
  for (const t of tage) {
    assert.equal(t.length, 20);
    assert.equal(new Set(t).size, 20, "Die Drehung hat eine Kategorie verloren.");
  }
});

/* ============================================ Abdeckung */

test("EI8 · Schon abgedeckte Fragen kommen nicht wieder - mit Begruendung", () => {
  const eine = I.KATALOG[3];
  const r = I.ideen({ now: JETZT, abgedeckt: [I.themenId(eine.id)] });
  assert.equal(r.anzahl, 19);
  assert.ok(!r.ideen.some((i) => i.kategorie === eine.id));
  assert.deepEqual(r.unterdrueckt,
    [{ kategorie: eine.id, grund: "ALREADY_COVERED" }]);
});

test("EI9 · Eine gesperrte Familie sperrt ihre Fragen", () => {
  const r = I.ideen({ now: JETZT, ausgeschlosseneFamilien: ["EDUCATION"] });
  const erwartet = I.KATALOG.filter((k) => k.familie === "EDUCATION").length;
  assert.ok(erwartet > 0, "Der Test prueft eine Familie ohne Fragen.");
  assert.equal(r.anzahl, 20 - erwartet);
  assert.ok(r.unterdrueckt.every((u) => u.grund === "EXCLUDED_BY_CALLER"));
});

test("EI10 · Alles abgedeckt heisst abgedeckt, nicht 'nichts da'", () => {
  /* Der eine Fall, in dem diese Stufe leer ist. Der Satz muss sagen,
     dass es an der ABDECKUNG liegt - sonst waere er wieder die
     Behauptung, das Angebot sei erschoepft. */
  const alle = I.KATALOG.map((k) => I.themenId(k.id));
  const r = I.ideen({ now: JETZT, abgedeckt: alle });
  assert.equal(r.anzahl, 0);
  assert.match(r.erklaerung, /Abdeckung, nicht ueber das Angebot/);
});

/* ============================================ Was sie nicht tut */

test("EI11 · Diese Engine ruft nichts und veroeffentlicht nichts", () => {
  const quelle = readFileSync(
    new URL("../engines/editorial-ideation.js", import.meta.url), "utf8");
  for (const verboten of ["fetch(", "require(", "import(", "publish", "autopublish"]) {
    assert.ok(!quelle.toLowerCase().includes(verboten.toLowerCase()),
      "Die Ideenstufe enthaelt " + verboten);
  }
});
