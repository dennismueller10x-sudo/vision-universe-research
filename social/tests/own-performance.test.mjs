/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/own-performance.test.mjs

   DIE EINZIGE QUELLE MUSS IHRE LUECKEN BENENNEN

   Solange eine externe Quelle in Aussicht stand, war die eigene
   Leistung eine von zwei Evidenzklassen. Jetzt ist sie die einzige -
   und eine einzige Quelle, die ihre Luecken kaschiert, ist schlimmer
   als zwei, die sie benennen: niemand kann mehr gegenrechnen.

   Drei Regeln, und alle drei hat dieses Projekt schon einmal verletzt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OP = require("../engines/own-performance.js");
const L = require("../engines/learning.js");
const Memory = require("../engines/memory.js");

function beitrag(extra) {
  return Object.assign({
    publicationId: "p" + Math.random().toString(36).slice(2),
    publishedAt: "2026-09-01T12:00:00Z",
    performance: 50
  }, extra || {});
}

/* -------------------------- Regel 1: ohne Wert ist keine Gruppe "null" */

test("OP1 · Ein Beitrag ohne Wert faellt heraus und wird gezaehlt", () => {
  /* Die Saettigungsrechnung meldete einmal "0 von 25 waren
     MAGAZINE_STORY" - und KEINER der 25 trug ein Familienfeld.
     Unbekannt sah aus wie null. */
  const eintraege = [
    beitrag({ contentFamily: "RANKING" }),
    beitrag({ contentFamily: null }),
    beitrag({})
  ];
  const d = OP.datensaetze(eintraege, { id: "content_family", field: "contentFamily" });
  assert.equal(d.records.length, 1);
  assert.equal(d.withoutValue, 2);
  /* Und ausdruecklich KEINE Gruppe mit dem Schluessel "null". */
  assert.equal(d.records.some((r) => r.value === "null"), false);
});

test("OP2 · Unter der Mindestabdeckung wird gar nicht erst gerechnet", () => {
  /* Ein Befund aus drei von fuenfundzwanzig Feldern waere eine Aussage
     ueber die Mitschrift, nicht ueber die Beitraege. */
  const eintraege = [];
  for (let i = 0; i < 20; i += 1) eintraege.push(beitrag({}));
  eintraege.push(beitrag({ contentFamily: "RANKING" }));

  const a = OP.auswerten(eintraege, { observe: L.observe });
  const cf = a.dimensions.find((x) => x.dimension === "content_family");
  assert.equal(cf.evaluable, false);
  assert.deepEqual(cf.observations, []);
  assert.match(cf.explanation, /Luecke in der Mitschrift und kein Befund/);
});

/* -------------- Regel 2: ein unveroeffentlichter Kandidat hat keine Leistung */

test("OP3 · Ohne Leistungswert kommt ein Beitrag nicht vor — auch nicht als 0", () => {
  const eintraege = [
    beitrag({ mediaFormat: "REEL", performance: 60 }),
    beitrag({ mediaFormat: "REEL", performance: null }),
    beitrag({ mediaFormat: "IMAGE" })
  ];
  eintraege[2].performance = undefined;

  const d = OP.datensaetze(eintraege, { id: "format", field: "mediaFormat" });
  assert.equal(d.measured, 1);
  assert.equal(d.unmeasured, 2);
  assert.equal(d.records.length, 1);
  /* Kein Datensatz mit performanceScore 0. */
  assert.equal(d.records.some((r) => r.performanceScore === 0), false);
});

test("OP4 · Eine echte Null bleibt eine echte Null", () => {
  /* Die Gegenprobe: gemessene 0 ist eine Messung und darf nicht mit
     "nicht gemessen" verschwinden. */
  const d = OP.datensaetze([beitrag({ mediaFormat: "REEL", performance: 0 })],
    { id: "format", field: "mediaFormat" });
  assert.equal(d.measured, 1);
  assert.equal(d.records.length, 1);
  assert.equal(d.records[0].performanceScore, 0);
});

/* ------------------ Regel 3: ein Qualitaetsscore ist keine Leistung */

test("OP5 · Qualitaetsfelder stehen ausdruecklich auf der Verbotsliste", () => {
  /* Sie hier zu nennen ist billiger, als spaeter zu erklaeren, warum
     das System Formate nach Bildqualitaet ausgewaehlt hat. */
  for (const feld of ["qualityScore", "visualQuality", "compositionScore"]) {
    assert.ok(OP.KEINE_LEISTUNG.includes(feld), feld);
  }
  /* Und keines davon ist eine Lerndimension. */
  for (const d of OP.DIMENSIONEN) {
    assert.equal(OP.KEINE_LEISTUNG.includes(d.field), false, d.id);
  }
});

/* --------------------------------------------- Die geforderten Dimensionen */

test("OP6 · Alle zwoelf verlangten Dimensionen sind da", () => {
  const verlangt = ["topic", "content_family", "entity_type", "audience_frame",
    "story_structure", "hook_strategy", "hook_variant_id", "format",
    "visual_strategy", "visual_variant_id", "timing", "market_context"];
  const da = OP.DIMENSIONEN.map((d) => d.id);
  for (const v of verlangt) assert.ok(da.includes(v), "fehlt: " + v);
});

test("OP7 · Jede Dimension liegt wirklich im Gedaechtnis — oder wird abgeleitet", () => {
  /* Eine Whitelist ist eine gute Verteidigung und ein schlechtes
     Gedaechtnis: dieselbe Falle hat schon performanceRegime und die
     Freigabe erwischt. Also gemessen statt angenommen. */
  const e = Memory.entry({});
  for (const d of OP.DIMENSIONEN) {
    if (!d.field) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(e, d.field),
      "memory.entry() kennt " + d.field + " nicht — " + d.id + " waere nie messbar");
  }
});

test("OP8 · Die Zeit wird zu einer vergleichbaren Groesse, nicht zu einem Stempel", () => {
  /* Zwei Beitraege teilen nie einen Zeitstempel. Ohne Gruppierung
     haette jede Auspraegung n=1. */
  assert.equal(OP.zeitfenster("2026-09-01T08:00:00Z"), "Di-frueh");
  assert.equal(OP.zeitfenster("2026-09-01T19:00:00Z"), "Di-abend");
  assert.equal(OP.zeitfenster("keine Zeit"), null);
  assert.equal(OP.zeitfenster(null), null);
});

/* ---------------------------------------------------- Explore / Exploit */

test("OP9 · Ohne belastbaren Befund wird erkundet, nicht genutzt", () => {
  const eintraege = [];
  for (let i = 0; i < 6; i += 1) {
    eintraege.push(beitrag({ mediaFormat: i < 3 ? "REEL" : "IMAGE",
      performance: i < 3 ? 80 : 40 }));
  }
  const a = OP.auswerten(eintraege, { observe: L.observe });
  const ee = OP.exploreExploit(a, {});
  assert.equal(ee.mode, "EXPLORE_ONLY");
  assert.equal(ee.exploit.length, 0);
  /* Und der Grund ist die Stichprobe, nicht das Format. */
  const f = ee.explore.find((x) => x.dimension === "format");
  assert.match(f.reason, /nicht belastbar|Anekdote|Zufall/);
});

test("OP10 · EXPLORE_ONLY ist eine Antwort, kein Zwischenzustand", () => {
  const ee = OP.exploreExploit(OP.auswerten([], { observe: L.observe }), {});
  assert.equal(ee.mode, "EXPLORE_ONLY");
  assert.match(ee.explanation, /die richtige\s+Antwort, nicht eine vorlaeufige/);
});

test("OP11 · Die Auswertung rechnet nicht selbst", () => {
  /* Zwei Rechenwege waeren zwei Wahrheiten. Ohne Beobachter gibt es
     kein Ergebnis - und keinen stillen Ersatz. */
  const a = OP.auswerten([beitrag({ mediaFormat: "REEL" })], {});
  assert.equal(a.ok, false);
  assert.match(a.explanation, /rechnet\s+nicht selbst/);
});

test("OP12 · Die Auswertung ist keine Prognose", () => {
  const a = OP.auswerten([beitrag({ mediaFormat: "REEL" })], { observe: L.observe });
  assert.equal(a.predictsPerformance, false);
});

/* ------------------------------------------------ Gegen den echten Bestand */

test("OP13 · Der reale Bestand wird ohne Beschoenigung beschrieben", () => {
  const pfad = "social/data/content-memory.json";
  if (!existsSync(pfad)) return;
  const m = JSON.parse(readFileSync(pfad, "utf8"));
  const a = OP.auswerten(m.entries || [], { observe: L.observe });
  assert.equal(a.ok, true);

  for (const d of a.dimensions) {
    /* Jede Dimension sagt, wie viele Beitraege sie tragen - die Zahl
       ist Teil des Befunds und nicht seine Fussnote. */
    assert.equal(typeof d.coverage, "number");
    assert.ok(d.coverage >= 0 && d.coverage <= 1, d.dimension);
    if (!d.evaluable) {
      assert.ok(d.explanation.length > 20, d.dimension);
      assert.deepEqual(d.observations, [], d.dimension);
    }
  }
});

test("OP14 · Warum ein Beitrag ungemessen ist, wird gezaehlt statt verschwiegen", () => {
  /* "3 ungemessen" ist eine Zahl ohne Aussage. Im echten Bestand sind
     drei IMAGE-Beitraege nicht ungemessen, weil niemand hingesehen
     haette - das Evidenzregime hat sich geweigert, sie gegen eine Basis
     aus drei Beitraegen zu bewerten. Das ist die richtige Weigerung,
     und sie als blosse Luecke zu fuehren macht daraus ein Versaeumnis. */
  const eintraege = [
    beitrag({ mediaFormat: "REEL", performance: 60 }),
    { publicationId: "a", publishedAt: "2026-08-05T09:00:00Z", performance: null,
      mediaFormat: "IMAGE",
      performanceProvenance: { reason: "Nur 3 Beitraege; ab 5 entsteht eine Basis." } },
    { publicationId: "b", publishedAt: "2026-08-04T09:00:00Z", performance: null,
      mediaFormat: "IMAGE",
      performanceProvenance: { reason: "Nur 3 Beitraege; ab 5 entsteht eine Basis." } },
    { publicationId: "c", performance: null, mediaFormat: "IMAGE" }
  ];
  const d = OP.datensaetze(eintraege, { id: "format", field: "mediaFormat" });
  assert.equal(d.unmeasured, 3);

  const basis = d.unmeasuredReasons.find((x) => /ab 5/.test(x.reason));
  assert.ok(basis, "Der Grund des Regimes muss mitgezaehlt werden");
  assert.equal(basis.count, 2);

  /* Ein unveroeffentlichter Kandidat bekommt seinen eigenen Grund -
     nicht denselben wie eine verweigerte Bewertung. */
  const offen = d.unmeasuredReasons.find((x) => /Nicht veroeffentlicht/.test(x.reason));
  assert.ok(offen);
  assert.equal(offen.count, 1);
});

test("OP15 · Der Grund wird gezaehlt, nicht erfunden", () => {
  /* Steht keiner im Eintrag, sagt die Auswertung genau das - statt
     einen plausiblen zu ergaenzen. */
  const d = OP.datensaetze([
    { publicationId: "x", publishedAt: "2026-08-01T09:00:00Z", performance: null,
      mediaFormat: "REEL" }
  ], { id: "format", field: "mediaFormat" });
  assert.equal(d.unmeasuredReasons[0].reason, "Kein Grund vermerkt.");
});
