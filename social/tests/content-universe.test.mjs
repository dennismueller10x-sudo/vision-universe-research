/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/content-universe.test.mjs

   In signals.js stand: topic = label + " — " + entity. Daraus wurde
   "Technisches Setup — XOM": kein Content-Konzept, sondern ein
   Datenbankereignis mit einem Bindestrich.

   Gemessen waren 12 Signaltypen, 10 davon an ein einzelnes Instrument
   gebunden, 0 thematisch. Die Opportunity Engine waegt acht Dimensionen
   ab - und bekam nur Instrument-Ereignisse vorgelegt. Eine Auswahl kann
   nichts waehlen, was ihr nie vorgelegt wurde.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const U = require("../engines/content-universe.js");

/* ------------------------------------------------------------------ */
/* KEINE, EINE, ODER MEHRERE ENTITAETEN                                */
/* ------------------------------------------------------------------ */

test("CU1 · Ein Thema ohne Entitaet ist ein vollwertiges Thema", () => {
  /* "Was bedeutet eine Zinssenkung fuer Aktien?" braucht keinen
     Ticker. Die Datenstruktur darf keine Einzelaktie voraussetzen -
     genau diese Annahme hat das bisherige System eng gemacht. */
  const t = U.topic({
    family: "MARKET_EXPLAINER", entityType: "NONE", sources: ["VU_MAGAZINE"],
    title: "Was eine Zinssenkung für Aktien bedeutet",
    question: "Was passiert mit Aktien, wenn die Zinsen fallen?" });
  assert.equal(U.validate(t).ok, true, U.validate(t).explanation);
  assert.deepEqual(t.entities, []);
});

test("CU2 · Ein Vergleich braucht mehr als eine Seite", () => {
  const eins = U.topic({ family: "COMPARISON", entityType: "INDEX",
    entities: ["S&P 500"], sources: ["VU_QUANT"] });
  assert.equal(U.validate(eins).ok, false);
  assert.match(U.validate(eins).explanation, /Ein Vergleich mit einer Seite/);

  const zwei = U.topic({ family: "COMPARISON", entityType: "INDEX",
    entities: ["S&P 500", "Nasdaq 100"], sources: ["VU_QUANT"] });
  assert.equal(U.validate(zwei).ok, true, U.validate(zwei).explanation);
});

test("CU3 · Eine Stock Story traegt genau eine Entitaet", () => {
  const zwei = U.topic({ family: "STOCK_STORY", entityType: "STOCK",
    entities: ["XOM", "CVX"], sources: ["VU_QUANT"] });
  assert.equal(U.validate(zwei).ok, false);
  assert.ok(U.validate(zwei).findings.some((f) => f.id === "tooManyEntities"));
});

test("CU4 · Art und Anzahl muessen zusammenpassen", () => {
  const a = U.topic({ family: "EDUCATION", entityType: "STOCK",
    entities: [], sources: ["EDITORIAL"], title: "Was ist ein Index?" });
  assert.ok(U.validate(a).findings.some((f) => f.id === "entityTypeMismatch"),
    "Wer eine Art nennt, muss auch sagen, wovon.");

  const b = U.topic({ family: "EDUCATION", entityType: "NONE",
    entities: ["XOM"], sources: ["EDITORIAL"], title: "Was ist ein Index?" });
  assert.ok(U.validate(b).findings.some((f) => f.id === "entityTypeMismatch"));
});

/* ------------------------------------------------------------------ */
/* DIE ENTITY-LOSE FORM IST NICHT ZWEITER KLASSE                       */
/* ------------------------------------------------------------------ */

test("CU5 · Zwei entity-lose Themen kollidieren nicht", () => {
  /* Der erste Entwurf haengte die Kennung an Family, Art und
     Entitaeten. Ohne Entitaet blieb davon nur die Family - und damit
     waeren "Was bedeutet eine Zinssenkung?" und "Was ist ein ETF?"
     DASSELBE Thema gewesen. Die Annahme "ohne Ticker keine Identitaet"
     waere durch die Hintertuer zurueckgekommen. */
  const a = U.topic({ family: "MARKET_EXPLAINER", entityType: "NONE",
    sources: ["VU_MAGAZINE"], title: "Was eine Zinssenkung für Aktien bedeutet" });
  const b = U.topic({ family: "MARKET_EXPLAINER", entityType: "NONE",
    sources: ["VU_MAGAZINE"], title: "Was ist ein ETF?" });
  assert.notEqual(a.topicId, b.topicId);
});

test("CU6 · Ohne Titel und ohne Entitaet wird keine Kennung erfunden", () => {
  const t = U.topic({ family: "EDUCATION", entityType: "NONE",
    sources: ["EDITORIAL"] });
  assert.equal(t.topicId, null);
  assert.ok(U.validate(t).findings.some((f) => f.id === "noStableIdentity"));
});

test("CU7 · Dieselbe Sache ergibt dieselbe Kennung, egal in welcher Reihenfolge", () => {
  const a = U.topic({ family: "COMPARISON", entityType: "INDEX",
    entities: ["Nasdaq 100", "S&P 500"], sources: ["VU_QUANT"] });
  const b = U.topic({ family: "COMPARISON", entityType: "INDEX",
    entities: ["S&P 500", "Nasdaq 100"], sources: ["VU_QUANT"] });
  assert.equal(a.topicId, b.topicId);
});

/* ------------------------------------------------------------------ */
/* QUELLE IST NICHT FAMILY                                             */
/* ------------------------------------------------------------------ */

test("CU8 · Eine Quelle traegt mehrere Familien", () => {
  /* Ein Aktienreport kann eine Stock Story tragen, eine Education oder
     einen Vergleich. Wer Quelle und Form gleichsetzt, kann aus einer
     Quelle nur eine Sorte Inhalt machen - und produziert jeden Tag
     dasselbe. */
  const f = U.familiesFor("VU_STOCK_REPORT");
  assert.ok(f.length > 1);
  assert.ok(f.includes("STOCK_STORY"));
  assert.ok(f.includes("EDUCATION"));
});

test("CU9 · Eine Family entsteht aus mehreren Quellen", () => {
  const q = U.sourcesFor("EDUCATION");
  assert.ok(q.length > 1, "Education kommt nicht nur aus einer Ecke.");
  assert.ok(q.includes("VU_MAGAZINE"));
});

test("CU10 · Eine Quelle, die eine Family nicht traegt, wird abgewiesen", () => {
  /* Leer heisst NICHT "alles erlaubt". Ohne diese Pruefung faellt man
     in die alte Gleichsetzung zurueck: Quant-Signal, also Stock Story. */
  const t = U.topic({ family: "MAGAZINE_STORY", entityType: "NONE",
    sources: ["VU_QUANT"], title: "Eine Magazingeschichte aus Quant-Daten" });
  assert.equal(U.validate(t).ok, false);
  assert.ok(U.validate(t).findings.some((f) => f.id === "sourceCannotCarryFamily"));
});

test("CU11 · Ohne Quelle kein Thema", () => {
  const t = U.topic({ family: "EDUCATION", entityType: "NONE",
    title: "Was ist Diversifikation?" });
  assert.ok(U.validate(t).findings.some((f) => f.id === "noSource"),
    "Ein Thema ohne Quelle hat keine Belege.");
});

test("CU12 · Das Universum ist breiter als Einzelaktien", () => {
  /* Die Messung, die diesen Node ausgeloest hat: 0 von 12 Signaltypen
     waren thematisch. Hier zaehlt, dass Formen existieren, die gar
     keine Einzelaktie brauchen. */
  const ohneEinzelaktie = U.CONTENT_FAMILIES.filter((f) => {
    const s = U.FAMILY_ENTITY_SHAPE[f];
    return !s || s.min === 0 || s.min === undefined;
  });
  assert.ok(ohneEinzelaktie.length >= 6,
    "Mindestens sechs Familien kommen ohne Einzelaktie aus: " +
    ohneEinzelaktie.join(", "));
  assert.ok(U.ENTITY_TYPES.includes("NONE"));
  assert.ok(U.ENTITY_TYPES.includes("ETF"));
  assert.ok(U.ENTITY_TYPES.includes("MACRO"));
});
