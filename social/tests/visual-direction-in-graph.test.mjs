/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/visual-direction-in-graph.test.mjs

   EIN TOR, DAS NICHT IM WEG STEHT, IST KEIN TOR

   visual-intelligence.js war gebaut, geprueft und mit Tests versehen -
   und lag NEBEN dem Graphen. Kein Skript rief `direction()` auf, kein
   Artefakt trug eine Bildrichtung. Die Engine hat nichts verhindert,
   weil sie nie gefragt wurde.

   Diese Tests halten fest, dass sie jetzt im Weg steht: vor der
   Erzeugung, mit ihrem Befund im Bericht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VI = require("../engines/visual-intelligence.js");

const ZYKLUS = readFileSync("scripts/social/run-social-cycle.mjs", "utf8");

test("VD1 · Der Zyklus ruft die Bildintelligenz ueberhaupt auf", () => {
  assert.match(ZYKLUS, /visual-intelligence\.js/);
  assert.match(ZYKLUS, /VisualIntelligence\.deriveDirection\(/);
  assert.match(ZYKLUS, /VisualIntelligence\.ready\(/);
});

test("VD2 · Die Richtung entsteht VOR dem Bildplan", () => {
  /* Das ist die ganze These der Engine: generische Bildsprache
     entsteht, weil niemand gesagt hat, was das Bild zeigen soll. Eine
     Richtung nach der Erzeugung waere eine Nachbetrachtung. */
  const richtung = ZYKLUS.indexOf("VisualIntelligence.deriveDirection(");
  const plan = ZYKLUS.indexOf("const bildplan =");
  assert.ok(richtung > 0 && plan > 0);
  assert.ok(richtung < plan,
    "Die Creative Direction muss vor dem Bildplan stehen");
});

test("VD3 · Die Richtung reist mit dem Paket und in den Bericht", () => {
  /* Sonst waere sie eine Zwischenrechnung, die nur waehrend des Laufs
     existiert - und das Lernen koennte nie fragen, welche Bildidee
     getragen hat. Die Projektion des Berichts ist eine Whitelist, und
     genau die hat schon performanceRegime und die Freigabefelder
     verschluckt. */
  assert.match(ZYKLUS, /pkg\.visualDirection = richtung/);
  assert.match(ZYKLUS, /visualDirection: p\.result\.package\.visualDirection/);
  assert.match(ZYKLUS, /visualDirectionMissing: p\.result\.package\.visualDirectionMissing/);
});

test("VD4 · Eine unvollstaendige Richtung wird benannt, nicht beschoenigt", () => {
  /* Der reale Lauf meldet coreIdea und mobileFocalPoint als fehlend -
     ein Befund ueber UNSERE Vorarbeit und kein Urteil ueber das Bild. */
  const leer = VI.ready(VI.direction({ topicId: "t1", visualStrategy: "CHART" }));
  assert.equal(leer.ok, false);
  assert.ok(leer.missing.includes("coreIdea"));
  assert.ok(leer.missing.includes("mobileFocalPoint"));
  assert.match(leer.explanation, /keine Richtung, sondern eine\s+Bestellung/);
});

test("VD5 · Eine vollstaendige Richtung traegt", () => {
  /* Die Pflichtliste ist seit §3 laenger: fuenf Dimensionen kamen
     dazu. Ein Aufruf, der nur die alten fuenf fuellt, IST jetzt
     unvollstaendig - das ist der Sinn der Erweiterung und kein
     Testfehler. */
  const voll = VI.ready(VI.direction({
    topicId: "t1", visualStrategy: "CHART",
    coreIdea: "Eine Kurve, die den Bruch zeigt",
    oneSecondMessage: "Seit August plus 43 Prozent",
    mainSubject: "Kursverlauf AAPL",
    story: "Der Anstieg begann mit den Quartalszahlen",
    mobileFocalPoint: "Der Knick in der Mitte",
    compositionIntent: "Die Kurve nimmt die Flaeche, der Knick sitzt in der Mitte",
    visualHierarchy: ["Der Knick", "Der Verlauf", "Der Name"],
    brandIntent: "Sachlich und belegt, keine Empfehlung",
    mustShow: ["Den Klarnamen Apple Inc."],
    mustNotShow: ["Keine in die Zukunft verlaengerte Linie"]
  }));
  assert.equal(voll.ok, true);
  assert.deepEqual(voll.missing, []);
});

test("VD5b · Die alten fuenf Felder allein reichen nicht mehr", () => {
  const alt = VI.ready(VI.direction({
    topicId: "t1", visualStrategy: "CHART",
    coreIdea: "Eine Kurve, die den Bruch zeigt",
    oneSecondMessage: "Seit August plus 43 Prozent",
    mainSubject: "Kursverlauf AAPL",
    story: "Der Anstieg begann mit den Quartalszahlen",
    mobileFocalPoint: "Der Knick in der Mitte"
  }));
  assert.equal(alt.ok, false);
  for (const f of ["compositionIntent", "visualHierarchy", "brandIntent",
                   "mustShow", "mustNotShow"]) {
    assert.ok(alt.missing.includes(f), "muesste fehlen: " + f);
  }
});

test("VD6 · Die Richtung blockiert den Lauf nicht", () => {
  /* Der Komposition-Weg zeichnet aus echten Daten und braucht keine
     Bildidee. Ein Tor, das hier abbricht, wuerde einen funktionierenden
     Pfad fuer eine Luecke in der Beschreibung anhalten. */
  assert.equal(/richtungBereit\.ok\s*\)\s*\{[^}]*(exit|throw|continue)/.test(ZYKLUS), false,
    "Eine unvollstaendige Richtung darf den Lauf nicht abbrechen");
});

test("VD7 · Das XOM-Visual ist kein Qualitaetsmassstab", () => {
  /* Woertlich im Dateikopf der Engine - und es gehoert dorthin, weil
     neun gruene Pruefungen sonst wie ein Guetesiegel aussehen. */
  const engine = readFileSync("social/engines/visual-intelligence.js", "utf8");
  assert.match(engine, /XOM-Visual/);
  assert.match(engine, /nicht ausreichend/);
  assert.match(engine, /traegt dieses\s+Bild die Geschichte/);
});

test("VD8 · Die Stufen der Bildkette sind vollstaendig", () => {
  for (const stufe of ["VISUAL_STRATEGY", "CREATIVE_DIRECTION", "VISUAL_PROVIDER",
                       "GENERATION", "TECHNICAL_INTEGRITY", "CREATIVE_QUALITY",
                       "CANONICAL_SELECTION", "PERFORMANCE_ATTRIBUTION"]) {
    assert.ok(VI.STAGES.includes(stufe), "fehlt: " + stufe);
  }
  /* Technische Unversehrtheit und gestalterische Qualitaet sind zwei
     Stufen - sie zusammenzulegen hiesse, aus "die Bytes stimmen" ein
     Qualitaetsurteil zu machen. */
  assert.notEqual(VI.STAGES.indexOf("TECHNICAL_INTEGRITY"),
    VI.STAGES.indexOf("CREATIVE_QUALITY"));
});
