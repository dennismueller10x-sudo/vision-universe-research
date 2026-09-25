/* =========================================================================
   LEARNING UNIT — §38, §39, §40, §41

   Zwoelf Dimensionen, die wirklich mitgeschrieben werden, und ein
   Kreis, der sich schliesst. Die beiden Stellen, an denen so etwas
   still kaputtgeht: eine Feldliste, aus der etwas faellt, und ein
   Gedaechtnis, das niemand liest.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../engines/learning-unit.js");
const Memory = require("../engines/memory.js");
const Content = require("../engines/content.js");

const NOW = "2026-09-16T10:00:00Z";

const KONTEXT = {
  package: { topic: "Small Caps NVDA", archetype: "STOCK_STORY",
    hookArchetype: "ZAHL_MIT_BEZUG", visualType: "CHART",
    hashtags: ["#Aktien", "#ETF"] },
  audienceFrame: { family: "RANKING",
    coreQuestion: "Was bedeutet das fuer mein Depot?" },
  structure: { beats: [{ id: "observation" }, { id: "context" }] },
  decision: { plannedHourUtc: 9, mode: "EXPLOIT" },
  now: NOW
};
const BILD = { plan: { grammatik: { familie: "DATA_EDITORIAL",
  atlasRolle: "ATLAS_SIGNATURE", dominantesTextRolle: "HOOK" },
  messung: { texte: [1, 2, 3] } } };

/* --------------------------------------------------------- §38 Tabelle */

test("LU1 · Zwoelf Dimensionen, jede mit Zweck, Feld, Stufe und Leser", () => {
  assert.equal(L.DIMENSIONEN.length, 12);
  const felder = new Set();
  for (const d of L.DIMENSIONEN) {
    assert.ok(d.id, "Dimension ohne Kennung");
    assert.ok(d.zweck, d.id + " ohne Zweck");
    assert.ok(d.feld, d.id + " ohne Feld");
    assert.ok(["PAKET", "BILD"].includes(d.stufe), d.id + " ohne Stufe");
    assert.equal(typeof d.lies, "function", d.id + " ohne Leser");
    assert.ok(!felder.has(d.feld), "Zwei Dimensionen teilen ein Feld: " + d.feld);
    felder.add(d.feld);
  }
});

test("LU2 · Die zwoelf aus §38 sind es wirklich", () => {
  assert.deepEqual(L.DIMENSION_IDS, ["CONTENT_FAMILY", "TOPIC", "ANGLE",
    "HOOK_ARCHETYPE", "STORY_STRUCTURE", "VISUAL_FAMILY", "ATLAS_ROLE",
    "TEXT_ON_VISUAL_PATTERN", "FORMAT", "HASHTAG_SET", "DAYPART",
    "EXPLORE_EXPLOIT_STATE"]);
});

test("LU3 · Aus dem Bestehenden abgeleitet, nichts erfunden", () => {
  const p = L.ausKontext(KONTEXT, "PAKET");
  assert.equal(p.contentFamily, "RANKING");
  assert.equal(p.angle, "Was bedeutet das fuer mein Depot?");
  assert.equal(p.hookArchetype, "ZAHL_MIT_BEZUG");
  assert.equal(p.storyStructure, "observation>context");
  assert.equal(p.mediaFormat, "IMAGE");
  assert.equal(p.hashtagSet, "aktien,etf");
  assert.equal(p.daypart, "MORGEN");
  assert.equal(p.exploreExploit, "EXPLOIT");
});

test("LU4 · Was der Kontext nicht hergibt, bleibt null", () => {
  const p = L.ausKontext({}, "PAKET");
  for (const feld of Object.keys(p)) assert.equal(p[feld], null, feld);
});

test("LU5 · Bilddimensionen entstehen erst mit dem Plan", () => {
  const p = L.ausKontext(KONTEXT, "PAKET");
  assert.equal(p.visualFamily, undefined,
    "Eine Bilddimension darf beim Paket nicht entstehen - sie waere geraten");
  const e = Object.assign({}, p);
  L.ergaenze(e, BILD);
  assert.equal(e.visualFamily, "DATA_EDITORIAL");
  assert.equal(e.atlasRole, "ATLAS_SIGNATURE");
  assert.equal(e.textOnVisualPattern, "HOOK:3");
});

test("LU6 · Kein Atlas ist eine Antwort, keine Luecke", () => {
  const e = {};
  L.ergaenze(e, { plan: { grammatik: { familie: "RANKING", atlasRolle: null,
    dominantesTextRolle: "HOOK" }, messung: { texte: [1] } } });
  assert.equal(e.atlasRole, "OHNE_ATLAS");
});

test("LU7 · Ohne Plan bleiben die Bildfelder leer", () => {
  const e = {};
  L.ergaenze(e, { plan: { ok: false } });
  assert.equal(e.visualFamily, undefined);
});

test("LU8 · Ein vorhandener Wert wird nicht ueberschrieben", () => {
  /* Das Gedaechtnis ist ein Register und kein Arbeitsblatt. */
  const e = { visualFamily: "RANKING" };
  L.ergaenze(e, BILD);
  assert.equal(e.visualFamily, "RANKING");
});

test("LU9 · Der Tagesabschnitt fasst zusammen, was zusammengehoert", () => {
  assert.equal(L.stundenAbschnitt(9), "MORGEN");
  assert.equal(L.stundenAbschnitt(9), L.stundenAbschnitt(10));
  assert.equal(L.stundenAbschnitt(23), "NACHT");
  assert.equal(L.stundenAbschnitt(3), "NACHT");
  assert.equal(L.stundenAbschnitt(null), null);
  assert.equal(L.stundenAbschnitt(99), null);
});

/* ------------------------------------------ Erfassung zaehlt WERTE */

test("LU10 · Ein Feldname ohne Wert ist keine erfasste Dimension", () => {
  const leer = {};
  for (const d of L.DIMENSIONEN) leer[d.feld] = null;
  const r = L.erfassung([leer, leer, leer]);
  assert.equal(r.getragen.length, 0);
  assert.equal(r.vollstaendig, false);
});

test("LU11 · Ein vollstaendiger Eintrag traegt alle zwoelf", () => {
  const e = Object.assign({}, L.ausKontext(KONTEXT, "PAKET"));
  L.ergaenze(e, BILD);
  const r = L.erfassung([e]);
  assert.equal(r.vollstaendig, true, "fehlt: " + r.fehlend.join(", "));
  assert.equal(r.getragen.length, 12);
});

/* ------------------------------- Die Feldliste faellt nicht mehr aus */

test("LU12 · memory.entry traegt jede Dimension der Tabelle", () => {
  /* Hier lag der Fehler: entry() zaehlte seine Felder auf, kannte vier
     der zwoelf - und die uebrigen acht fielen lautlos heraus. */
  const roh = Object.assign({ packageId: "pkg_x", hook: "H", caption: "C" },
    L.ausKontext(KONTEXT, "PAKET"), { visualFamily: "DATA_EDITORIAL",
      atlasRole: "OHNE_ATLAS", textOnVisualPattern: "HOOK:3" });
  const e = Memory.entry(roh);
  for (const d of L.DIMENSIONEN) {
    assert.ok(Object.prototype.hasOwnProperty.call(e, d.feld),
      "memory.entry kennt " + d.id + " (" + d.feld + ") nicht");
  }
  assert.equal(L.erfassung([e]).vollstaendig, true);
});

test("LU13 · memory.entry erfindet nichts", () => {
  const e = Memory.entry({ packageId: "pkg_y" });
  for (const d of L.DIMENSIONEN) {
    if (d.feld === "topic") continue;
    assert.equal(e[d.feld], null, d.id + " ist nicht null");
  }
});

/* -------------------------------------------- §39/§40 Der Kreis */

function gedaechtnis(stark, schwach, n) {
  const e = [];
  for (let i = 0; i < n; i++) {
    e.push({ hookArchetype: stark, performance: { engagementRate: 0.09 } });
  }
  for (let i = 0; i < n; i++) {
    e.push({ hookArchetype: schwach, performance: { engagementRate: 0.01 } });
  }
  return e;
}

test("LU14 · Ungemessene Eintraege zaehlen bei der Haeufigkeit, nicht bei der Leistung", () => {
  const e = gedaechtnis("KONTRAST", "EXTREM", 3)
    .concat([{ hookArchetype: "KONTRAST", performance: null }]);
  const r = L.leistung(e);
  const k = r.dimensionen.HOOK_ARCHETYPE.find((x) => x.wert === "KONTRAST");
  assert.equal(k.anzahl, 4);
  assert.equal(k.gemessen, 3);
  /* Ein ungesendeter Beitrag ist kein Beitrag mit Leistung null. */
  assert.ok(Math.abs(k.mittel - 0.09) < 1e-9);
});

test("LU15 · Unter der Mindeststichprobe gibt es KEINEN Mittelwert", () => {
  const r = L.leistung(gedaechtnis("KONTRAST", "EXTREM", 2));
  for (const x of r.dimensionen.HOOK_ARCHETYPE) {
    assert.equal(x.genug, false);
    assert.equal(x.mittel, null,
      "Eine Zahl aus zwei Beobachtungen ist keine Leistung");
  }
});

test("LU16 · Nur genug Gemessenes wird zu einem Gewicht", () => {
  const voll = L.alsGewichte(L.leistung(gedaechtnis("KONTRAST", "EXTREM", 4)),
    "HOOK_ARCHETYPE", { faktor: 2500 });
  assert.ok(voll.KONTRAST > voll.EXTREM);
  const duenn = L.alsGewichte(L.leistung(gedaechtnis("KONTRAST", "EXTREM", 1)),
    "HOOK_ARCHETYPE", { faktor: 2500 });
  assert.deepEqual(duenn, {},
    "Zu wenige Messungen sind trotzdem zu einem Gewicht geworden");
});

test("LU17 · Der Kreis schliesst sich: die Messung verschiebt die Auswahl (§39)", () => {
  /* Seit storyKraft (Owner-Direktive "FINAL GOLDEN PATH
     SIMPLIFICATION", 23.09., §5/§6) gewinnt KONTRAST gegen
     ZAHL_MIT_BEZUG bereits OHNE jede Messung (zwei Belege auf einer
     Achse sind per Bauform eine Story, ein einzelner Wert nicht) -
     eine Lage mit zwei vergleichbaren Belegen zeigt den Kreis aus
     §39 deshalb nicht mehr. Eine Lage mit EINEM Beleg tut es weiter:
     dort stehen nur ZAHL_MIT_BEZUG und der Autorensatz (AUTOR) zur
     Wahl, und ZAHL_MIT_BEZUG gewinnt ohne Messung knapp. */
  const quellen = [
    { source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "KGV", value: 13.4, state: "VERIFIED", observedAt: NOW }
  ];
  const eingabe = (perf) => ({
    opportunity: { opportunityId: "o", topic: "Halbleiter",
      entities: ["NVDA"], platform: "instagram" },
    sources: quellen,
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { keyNumber: true },
    writer: Content.createTemplateWriter(),
    hookPerformance: perf
  });

  const ohne = Content.run(eingabe(null), { now: NOW });
  assert.equal(ohne.ok, true, ohne.explanation);
  assert.equal(ohne.package.hookArchetype, "ZAHL_MIT_BEZUG");

  const gewichte = L.alsGewichte(
    L.leistung(gedaechtnis("AUTOR", ohne.package.hookArchetype, 4)),
    "HOOK_ARCHETYPE", { faktor: 2500 });
  const mit = Content.run(eingabe(gewichte), { now: NOW });
  assert.equal(mit.ok, true, mit.explanation);

  assert.notEqual(ohne.package.hookArchetype, mit.package.hookArchetype,
    "Die gemessene Leistung verschiebt nichts - dann ist das Gedaechtnis " +
    "ein Archiv");
  assert.equal(mit.package.hookArchetype, "AUTOR");
});

test("LU18 · Ohne Messung bleibt alles, wie es war", () => {
  const quellen = [{ source: "vu.technical", entity: "NVDA", metric: "KGV",
    value: 13.4, state: "VERIFIED", observedAt: NOW }];
  const eingabe = (perf) => ({
    opportunity: { opportunityId: "o", topic: "Halbleiter",
      entities: ["NVDA"], platform: "instagram" },
    sources: quellen,
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { keyNumber: true },
    writer: Content.createTemplateWriter(), hookPerformance: perf
  });
  const a = Content.run(eingabe(null), { now: NOW });
  const b = Content.run(eingabe({}), { now: NOW });
  assert.equal(a.package.hookArchetype, b.package.hookArchetype);
  assert.equal(a.package.hook, b.package.hook);
});

/* ---------------------------------------- Der Weg durch das System */

const ZYKLUS = readFileSync("scripts/social/run-social-cycle.mjs", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CONTENT = readFileSync("social/engines/content.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MEMORY = readFileSync("social/engines/memory.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("LU19 · Der Zyklus schreibt die Dimensionen aus der Tabelle", () => {
  /* Der AUFRUF, nicht der Name: ein `if (false)` davor liess den Namen
     stehen, und die Suche fand ihn weiter. */
  assert.match(ZYKLUS, /LearningUnit\s*\.\s*ausKontext/);
  assert.match(ZYKLUS, /memory\.add\(Object\.assign\(/);
  assert.match(ZYKLUS, /\}, dimensionen\)\)/);
  assert.match(ZYKLUS, /if \(lernEintrag\) LearningUnit\.ergaenze\(/);
});

test("LU20 · Und liest sie zurueck in die naechste Auswahl", () => {
  /* `hookPerformanceUngenutzt` enthaelt "hookPerformance" als
     Zeichenkette - eine Suche danach bestand, waehrend der Kreis
     offen war. Gesucht wird der Schluessel selbst. */
  assert.match(ZYKLUS, /^\s*hookPerformance: LearningUnit\.alsGewichte\(/m);
  assert.match(CONTENT, /input\.hookPerformance/);
  assert.match(CONTENT, /kontext\.leistung = leistung/);
});

test("LU21 · Es gibt keine zweite Dimensionsliste", () => {
  /* Der Zyklus und memory.js duerfen die zwoelf Feldnamen nicht noch
     einmal aufzaehlen - sonst laufen sie beim naechsten Zusatz
     auseinander. */
  assert.doesNotMatch(ZYKLUS, /\b(contentFamily|hookArchetype|visualFamily|daypart)\s*:/);
  assert.match(MEMORY, /LearningUnit\.DIMENSIONEN/);
});
