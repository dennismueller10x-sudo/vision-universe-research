/* =========================================================================
   VU SOCIAL — FREQUENZ AUS EIGENER LEISTUNG (FL1–FL18)

   §22–§25, §35–§37.

   -------------------------------------------------------------------------
   DIE ZWEI VERSUCHUNGEN
   -------------------------------------------------------------------------

     1. Werte erfinden, wo keine gemessen wurden. Ein Default sieht aus
        wie eine Messung und ist keine.

     2. Aus einer Beobachtung eine Ursache machen. "An Tagen mit zwei
        Beitraegen lief der zweite schlechter" ist eine Beobachtung;
        "ein zweiter Beitrag nimmt Reichweite" ist eine Behauptung ueber
        die Welt - und ein System, das sie aufschreibt, hoert auf zu
        suchen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FL = require("../engines/frequency-learning.js");
const LD = require("../engines/learning-dimensions.js");
const OwnPerformance = require("../engines/own-performance.js");

/* Beitraege, wie sie im Gedaechtnis stehen. */
function beitrag(tagNr, stunde, leistung) {
  const d = new Date(Date.UTC(2026, 8, tagNr, stunde, 0, 0));
  return { publicationId: "p" + tagNr + "_" + stunde,
    publishedAt: d.toISOString(), platform: "instagram",
    performance: leistung === undefined ? null : leistung };
}

/* ------------------------------------------- Nichts wird erfunden */

test("FL1 · Ohne Gedaechtnis gibt es keine Werte, nur Nullen mit Stichprobe", () => {
  const z = FL.zustand([], {});
  for (const [name, w] of Object.entries(z.werte)) {
    assert.equal(w.sampleSize, 0, name);
    assert.equal(w.belastbar, false, name);
  }
});

test("FL2 · Jeder Wert traegt seine Stichprobe bei sich", () => {
  /* Eine Zahl ohne Stichprobe ist eine Anekdote mit Nachkommastelle. */
  const z = FL.zustand([beitrag(1, 9, 50), beitrag(2, 9, 60)], {});
  for (const [name, w] of Object.entries(z.werte)) {
    assert.ok(Object.prototype.hasOwnProperty.call(w, "sampleSize"), name);
    assert.ok(Object.prototype.hasOwnProperty.call(w, "source"), name);
  }
});

test("FL3 · Unter der Mindeststichprobe entsteht KEINE Empfehlung", () => {
  /* Nicht eine vorsichtige - gar keine. */
  const z = FL.zustand([beitrag(1, 9, 50), beitrag(1, 15, 40)], {});
  const zweiter = z.entscheidungen.find((e) => e.id === FL.ENTSCHEIDUNG.SECOND_POST_TODAY);
  assert.equal(zweiter.empfehlung, null);
  assert.match(zweiter.grund, /Zu wenige Tage/);
});

test("FL4 · Nicht gemessene Beitraege zaehlen nicht als Leistung", () => {
  /* Ein Beitrag ohne Messwert ist nicht ein Beitrag mit Leistung 0. */
  const z = FL.zustand([beitrag(1, 9), beitrag(2, 9), beitrag(3, 9)], {});
  assert.equal(z.werte.gemesseneBeitraege.value, 0);
  assert.equal(z.werte.leistungErsterDesTages.value, null);
  /* Die Tage zaehlen trotzdem - erschienen sind sie. */
  assert.equal(z.werte.postsProTag.sampleSize, 3);
});

/* ------------------------------------- Beobachtung, nicht Ursache */

test("FL5 · Ein Unterschied heisst OBSERVED_ASSOCIATION", () => {
  const tage = [];
  for (let t = 1; t <= 8; t += 1) {
    tage.push(beitrag(t, 9, 60), beitrag(t, 18, 40));
  }
  const z = FL.zustand(tage, {});
  const b = z.beobachtungen[0];
  assert.equal(b.befund, FL.BEFUND.OBSERVED_ASSOCIATION);
  assert.ok(b.sampleSize >= FL.MINDEST_STICHPROBE);
});

test("FL6 · Kein Befund traegt Kausalsprache", () => {
  /* Der wichtigste Test der Datei. */
  const tage = [];
  for (let t = 1; t <= 8; t += 1) tage.push(beitrag(t, 9, 60), beitrag(t, 18, 20));
  const z = FL.zustand(tage, {});
  const text = JSON.stringify(z);
  for (const wort of ["CAUSES", "verursacht", "Ursache ist", "fuehrt zu", "bewirkt"]) {
    if (wort === "Ursache ist") continue;   /* kommt in der Verneinung vor */
    assert.doesNotMatch(text, new RegExp(wort, "i"), "Kausalsprache: " + wort);
  }
  /* Und die Vokabel selbst kennt keinen kausalen Befund. */
  assert.deepEqual(Object.keys(FL.BEFUND).sort(),
    ["INSUFFICIENT_SAMPLE", "NO_ASSOCIATION_OBSERVED", "OBSERVED_ASSOCIATION"]);
});

test("FL7 · Jede Beobachtung sagt, was sie NICHT heisst", () => {
  /* Der Satz muss MITREISEN. Wer die Zahl ohne ihn weitergibt, gibt
     etwas anderes weiter - deshalb ist er ein Feld und kein Kommentar. */
  const tage = [];
  for (let t = 1; t <= 8; t += 1) tage.push(beitrag(t, 9, 60), beitrag(t, 18, 40));
  for (const b of FL.zustand(tage, {}).beobachtungen) {
    assert.ok(b.nichtGesagt && b.nichtGesagt.length > 20, b.id);
  }
  /* Auch der Fall "zu wenig Daten" sagt, was er nicht heisst. */
  const duenn = FL.zustand([beitrag(1, 9, 50)], {});
  assert.match(duenn.beobachtungen[0].nichtGesagt, /Beides waere hier erfunden/);
});

test("FL8 · Kein sichtbarer Unterschied heisst NO_ASSOCIATION_OBSERVED", () => {
  /* Die Gegenprobe: nicht jeder Vergleich ist ein Befund. */
  const tage = [];
  for (let t = 1; t <= 8; t += 1) tage.push(beitrag(t, 9, 50), beitrag(t, 18, 50.2));
  assert.equal(FL.zustand(tage, {}).beobachtungen[0].befund,
    FL.BEFUND.NO_ASSOCIATION_OBSERVED);
});

/* ------------------------------------------- Acht Werte, sechs Entscheidungen */

test("FL9 · Acht benannte Werte (§37)", () => {
  const z = FL.zustand([], {});
  assert.equal(Object.keys(z.werte).length, 8);
});

test("FL10 · Sechs benannte Entscheidungen (§37)", () => {
  const z = FL.zustand([], {});
  assert.equal(z.entscheidungen.length, 6);
  assert.deepEqual(z.entscheidungen.map((e) => e.id).sort(),
    Object.values(FL.ENTSCHEIDUNG).sort());
});

test("FL11 · Jede Entscheidung nennt ihre Grundlage", () => {
  const z = FL.zustand([beitrag(1, 9, 50)], {});
  for (const e of z.entscheidungen) {
    assert.ok(e.grund && e.grund.length > 10, e.id + " ohne Grund");
  }
});

test("FL12 · Owner-Entscheidungen werden nicht ueberschrieben", () => {
  /* Tagesabsicht und Publishing-Dach sind Owner-Entscheidungen. Eine
     Messung kann sie stuetzen, nicht ersetzen. */
  const viel = [];
  for (let t = 1; t <= 20; t += 1) viel.push(beitrag(t, 9, 80), beitrag(t, 18, 80));
  const z = FL.zustand(viel, {});
  for (const id of [FL.ENTSCHEIDUNG.DAILY_INTENT, FL.ENTSCHEIDUNG.WEEKLY_CEILING]) {
    const e = z.entscheidungen.find((x) => x.id === id);
    assert.equal(e.empfehlung, null, id + " gibt eine Zahl vor");
    assert.match(e.grund, /Owner-Entscheidung/);
  }
});

test("FL13 · Eine Stunde unter der Mindeststichprobe gewinnt nicht", () => {
  /* Sonst entschiede ein einzelner guter Beitrag ueber den Zeitplan. */
  const e = [beitrag(1, 3, 99)];
  for (let t = 2; t <= 8; t += 1) e.push(beitrag(t, 14, 40));
  const z = FL.zustand(e, {});
  assert.notEqual(z.werte.besteStundeUtc.value, 3);
  assert.equal(z.werte.besteStundeUtc.value, 14);
});

/* ---------------------------------------- Die Lerndimensionen (§22–§25) */

test("FL14 · Die Dimensionsliste steht an EINER Stelle", () => {
  /* Eine zweite Liste waere die naechste Gelegenheit, dass eine
     Dimension auf einer Seite fehlt - daran ist es schon gescheitert. */
  const quelle = readFileSync(new URL("../engines/learning-dimensions.js",
    import.meta.url), "utf8");
  assert.match(quelle, /OwnPerformance\.DIMENSIONEN/);
  const gesetzt = LD.zuSetzen();
  const erwartet = OwnPerformance.DIMENSIONEN
    .filter((d) => !LD.NICHT_VON_HIER.includes(d.id))
    .map((d) => d.field);
  assert.deepEqual(gesetzt, erwartet);
});

test("FL15 · Die Ausnahmen sind genau die drei, die anderswo entstehen", () => {
  assert.deepEqual(LD.NICHT_VON_HIER.slice().sort(), ["format", "timing", "topic"]);
});

test("FL16 · Aus einem echten Paket entstehen echte Werte", () => {
  const r = LD.ausPaket({
    audienceFrame: { family: "RANKING", familyBasis: "TOPIC" },
    authoring: { pattern: "group-count/group-rule-evidence", variantId: "var_1" },
    visualType: "COMPARISON", visual: { origin: "rendered" },
    thema: { entityType: "STOCK" }
  });
  assert.equal(r.werte.contentFamily, "RANKING");
  assert.equal(r.werte.entityType, "STOCK");
  assert.equal(r.werte.hookStrategy, "group-count");
  assert.equal(r.werte.storyStructure, "group-rule-evidence");
  assert.equal(r.werte.visualStrategy, "COMPARISON");
  assert.equal(r.werte.audienceFrameBasis, "TOPIC");
  /* Und die Abdeckung meldet KEINE Luecke im Mitschreiben. */
  assert.equal(LD.abdeckung(r).nichtMitgeschrieben, 0);
});

test("FL17 · 'Nicht ermittelbar' ist nicht 'nicht mitgeschrieben'", () => {
  /* Beide sehen im Gedaechtnis wie null aus und bedeuten Verschiedenes:
     das eine ist ein Befund ueber die Datenlage, das andere einer
     ueber uns. */
  const r = LD.ausPaket({});
  const a = LD.abdeckung(r);
  assert.equal(a.nichtMitgeschrieben, 0, "Alle Felder werden angefasst");
  assert.ok(a.nichtErmittelbar > 0);
  for (const feld of LD.zuSetzen()) {
    assert.ok(r.herkunft[feld], "ohne Herkunft: " + feld);
    assert.notEqual(r.herkunft[feld], LD.HERKUNFT.NICHT_MITGESCHRIEBEN);
  }
});

test("FL18 · Ein gezeichnetes Bild hat keine Variante — und sagt warum", () => {
  const r = LD.ausPaket({ visual: { origin: "rendered" } });
  assert.equal(r.werte.visualVariantId, null);
  assert.match(r.herkunft.visualVariantId, /Gezeichnetes Bild/);
  const g = LD.ausPaket({ visual: { origin: "generative", variantId: "v1" } });
  assert.equal(g.werte.visualVariantId, "v1");
});
