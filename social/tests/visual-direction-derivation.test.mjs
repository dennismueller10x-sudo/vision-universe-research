/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/visual-direction-derivation.test.mjs

   EIN SATZ, DER AUCH OHNE DATEN ENTSTEHT, IST EIN DEFAULT

   Der reale Lauf meldete `coreIdea` und `mobileFocalPoint` als fehlend.
   Zwei hinterlegte Vorgabesaetze haetten das Tor gruen gemacht - und
   nichts gewusst. Genau das verbietet der Auftrag: die Felder duerfen
   nicht als generische Defaults oder Fixtures eingetragen werden.

   Diese Tests halten die Gegenprobe fest: nimm der Form ihre
   Voraussetzung weg, und es darf KEINE Idee entstehen. Eine Ableitung,
   die auch ohne ihre Eingaben ein Ergebnis liefert, ist keine.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VI = require("../engines/visual-intelligence.js");
const AF = require("../engines/audience-frame.js");

const RAHMEN = {
  coreQuestion: "Was ist bei diesem Unternehmen gerade los?",
  publicEntityNames: ["Exxon Mobil"],
  internalTermsNotSuitableForHook: ["z-Score", "ATR"]
};
const STORY = {
  thesis: "Die Staerke hat ein Gegengewicht.",
  hook: "47,6 % in 12 Monaten, aber nur 76 von 100.",
  claims: [{ text: "76 von 100", numeric: 76, source: { source: "Tiingo" } }]
};
const BEITRAEGE = [
  { label: "Trendstruktur", value: 27.35, max: 30 },
  { label: "Schwankungsbreite", value: 5, max: 10 }
];

function ableiten(overrides = {}) {
  return VI.deriveDirection(Object.assign({
    visualStrategy: "CHART",
    opportunity: { topic: "Technisches Setup — XOM", family: "STOCK_STORY",
      entities: ["XOM"] },
    audienceFrame: RAHMEN,
    story: STORY,
    visualData: { points: new Array(270).fill(1), contributions: BEITRAEGE,
      total: 76, totalMax: 100, source: "Tiingo, Stand 11.09.2026" },
    oneSecondMessage: "76 von 100 im Technical Opportunity Score"
  }, overrides));
}

/* ------------------------------------------------------------------ */
/* DIE GEGENPROBE                                                      */
/* ------------------------------------------------------------------ */

test("VDD1 · Ohne Bildform entsteht keine Idee", () => {
  const d = VI.deriveDirection({ audienceFrame: RAHMEN, story: STORY });
  assert.equal(d.coreIdea, null);
  assert.equal(d.mobileFocalPoint, null);
  assert.equal(d.derivation.derived, false);
  assert.match(d.derivation.explanation, /ohne Form gibt es keine Bildidee/);
});

test("VDD2 · Ohne Kursreihe entsteht keine CHART-Idee", () => {
  const d = ableiten({ visualData: { contributions: BEITRAEGE } });
  assert.equal(d.coreIdea, null);
  assert.deepEqual(d.derivation.missingInputs, ["points"]);
});

test("VDD3 · Ohne gemessene Spannung entsteht keine GENERATIVE-Idee", () => {
  /* Die einzige Form, bei der ein Modell das Motiv frei erfindet.
     Ohne Spannung waere der Auftrag "mach ein Bild zu XOM" - und
     dabei entstehen Neonwuerfel. */
  const d = ableiten({ visualStrategy: "GENERATIVE", visualData: {} });
  assert.equal(d.coreIdea, null);
  assert.ok(d.derivation.missingInputs.includes("spannung"));
});

test("VDD4 · Ohne Publikumsrahmen entsteht keine Idee", () => {
  /* Die fehlende Frage war der Ausgangsfehler eine Stufe hoeher, im
     Text. Ein Bild, das nicht weiss, worauf es antwortet, hat
     dasselbe Problem. */
  const d = ableiten({ audienceFrame: { publicEntityNames: ["Exxon Mobil"] } });
  assert.equal(d.coreIdea, null);
  assert.ok(d.derivation.missingInputs.includes("coreQuestion"));
});

test("VDD5 · Ohne Gegenstand entsteht keine Idee", () => {
  const d = ableiten({
    audienceFrame: { coreQuestion: RAHMEN.coreQuestion, publicEntityNames: [] },
    opportunity: { topic: null, entities: [] } });
  assert.equal(d.coreIdea, null);
  assert.ok(d.derivation.missingInputs.includes("subject"));
});

/* ------------------------------------------------------------------ */
/* DASS ES WIRKLICH EINE ABLEITUNG IST                                 */
/* ------------------------------------------------------------------ */

test("VDD6 · Die Idee traegt den Klarnamen, nicht das Kuerzel", () => {
  /* "XOM" auf einer oeffentlichen Bildflaeche sagt einem breiten
     Publikum nichts. Der Klarname steht im Rahmen, nicht in der
     Gelegenheit. */
  const d = ableiten();
  assert.match(d.coreIdea, /Exxon Mobil/);
  assert.equal(d.coreIdea.includes("XOM"), false);
  assert.match(d.mobileFocalPoint, /Exxon Mobil/);
});

test("VDD7 · Andere Daten ergeben eine andere Idee", () => {
  /* Die Probe darauf, dass hier gerechnet und nicht eingesetzt wird:
     eine Vorlage liefert denselben Satz, eine Ableitung nicht. */
  const a = ableiten();
  const b = ableiten({ visualData: {
    points: new Array(120).fill(1),
    contributions: [{ label: "Momentum", value: 4, max: 20 },
                    { label: "Trendstruktur", value: 29, max: 30 }] } });
  assert.notEqual(a.coreIdea, b.coreIdea);
  assert.match(a.coreIdea, /270 beobachtete Punkte/);
  assert.match(b.coreIdea, /120 beobachtete Punkte/);
  assert.match(b.coreIdea, /Momentum/);
});

test("VDD8 · Jede Bildform hat ihre eigene Idee", () => {
  const chart = ableiten({ visualStrategy: "CHART" });
  const zahl = ableiten({ visualStrategy: "NUMBER_VISUAL" });
  const erzeugt = ableiten({ visualStrategy: "GENERATIVE" });
  assert.notEqual(chart.coreIdea, zahl.coreIdea);
  assert.notEqual(zahl.coreIdea, erzeugt.coreIdea);
  assert.notEqual(chart.mobileFocalPoint, zahl.mobileFocalPoint);
});

test("VDD9 · Jede Form im Schema hat eine hinterlegte Ableitung", () => {
  /* Sonst gaebe es eine Bildform, die gewaehlt werden kann und dann
     nie eine Richtung bekommt - ein stiller Dauerbefund. */
  const Schema = require("../engines/schema.js");
  for (const typ of Schema.VISUAL_TYPES) {
    assert.ok(VI.FORMEN[typ], "keine Ableitung fuer " + typ);
    assert.ok(VI.FORMEN[typ].braucht.length > 0);
  }
});

test("VDD10 · Die Herkunft jedes Feldes steht dabei", () => {
  /* Ohne diese Spur laesst sich spaeter nicht mehr unterscheiden, ob
     ein Wert abgeleitet oder von Hand eingetragen wurde. */
  const d = ableiten();
  assert.ok(d.derivedFrom.coreIdea.includes("VISUAL_STRATEGY:CHART"));
  assert.ok(d.derivedFrom.coreIdea.includes("AUDIENCE_FRAME:publicEntityNames"));
  assert.ok(d.derivedFrom.mustShow.includes("AUDIENCE_FRAME:coreQuestion"));
  assert.equal(d.derivation.tension.kind, "CONTRIBUTION_GAP");
});

/* ------------------------------------------------------------------ */
/* §3 · DIE NEUN DIMENSIONEN                                           */
/* ------------------------------------------------------------------ */

test("VDD11 · Alle neun Dimensionen stehen", () => {
  const d = ableiten();
  for (const dim of VI.DIMENSIONEN) {
    const v = d[dim];
    const belegt = Array.isArray(v) ? v.length > 0
      : (typeof v === "string" && v.trim().length > 0);
    assert.ok(belegt, dim + " ist leer");
  }
  assert.equal(VI.ready(d).ok, true);
});

test("VDD12 · NOT_APPLICABLE braucht eine Begruendung", () => {
  const d = VI.direction({
    visualStrategy: "CHART", story: "s", coreIdea: "i", oneSecondMessage: "m",
    mainSubject: "s", mobileFocalPoint: "f", compositionIntent: "c",
    visualHierarchy: ["a"], brandIntent: "b", mustShow: ["x"],
    mustNotShow: VI.NOT_APPLICABLE });
  const r = VI.ready(d);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("mustNotShow"));
  assert.match(r.findings.join(" "), /Achselzucken/);
});

test("VDD13 · Die Kernfragen duerfen nie NOT_APPLICABLE sein", () => {
  /* "Welche EINE Idee traegt die Story?" und "was erkennt jemand auf
     dem Telefon zuerst?" stellen sich fuer jede Bildform. */
  for (const feld of ["coreIdea", "mobileFocalPoint"]) {
    const spec = {
      visualStrategy: "CHART", story: "s", coreIdea: "i", oneSecondMessage: "m",
      mainSubject: "s", mobileFocalPoint: "f", compositionIntent: "c",
      visualHierarchy: ["a"], brandIntent: "b", mustShow: ["x"],
      mustNotShow: ["y"], notApplicable: {} };
    spec[feld] = VI.NOT_APPLICABLE;
    spec.notApplicable[feld] = "passt hier nicht";
    const r = VI.ready(VI.direction(spec));
    assert.equal(r.ok, false, feld + " duerfte nicht durchgehen");
    assert.equal(r.failureType, "VISUAL_DIRECTION_INCOMPLETE");
  }
});

test("VDD14 · Eine begruendet nicht zutreffende Dimension traegt", () => {
  /* Eine Minimal-Typografie hat genau ein Element. Eine Rangfolge
     ueber mehrere Bildelemente gibt es dort nicht - das ist etwas
     anderes als eine fehlende Rangfolge. */
  const d = ableiten({ visualStrategy: "MINIMAL_TYPOGRAPHY", visualData: {} });
  assert.equal(d.visualHierarchy, VI.NOT_APPLICABLE);
  assert.match(d.notApplicable.visualHierarchy, /genau ein Element/);
  const r = VI.ready(d);
  assert.equal(r.ok, true);
  assert.deepEqual(r.notApplicable, ["visualHierarchy"]);
});

test("VDD15 · Keine Dimension wird als Leerstring vorgetaeuscht", () => {
  const d = ableiten({ visualStrategy: "MINIMAL_TYPOGRAPHY", visualData: {} });
  for (const dim of VI.DIMENSIONEN) {
    assert.notEqual(d[dim], "", dim + " ist ein Leerstring");
    if (Array.isArray(d[dim])) assert.notEqual(d[dim].length, 0, dim + " ist leer");
  }
});

/* ------------------------------------------------------------------ */
/* WAS NICHT AUF DIE FLAECHE DARF                                      */
/* ------------------------------------------------------------------ */

test("VDD16 · Interne Begriffe sind auf der Flaeche genauso gesperrt", () => {
  /* Eine Bildflaeche ist nicht weniger oeffentlich als ein Satz. Die
     Liste kommt aus dem Rahmen, nicht aus einer zweiten Quelle. */
  const d = ableiten();
  assert.match(d.mustNotShow.join(" "), /z-Score/);
  assert.match(d.mustNotShow.join(" "), /ATR/);
});

test("VDD17 · Keine Prognose, weil kein Beleg eine ist", () => {
  const d = ableiten();
  assert.match(d.mustNotShow.join(" "), /Prognose/);
});

test("VDD18 · Generische KI-Motive nur dort, wo ein Modell erfindet", () => {
  /* Bei einer aus Daten gezeichneten Karte kann die Frage nach
     generischer Bildsprache nicht auftreten - der Renderer zeichnet,
     was dasteht. Sie dort aufzufuehren waere eine Warnung vor einem
     unmoeglichen Fall. */
  const gezeichnet = ableiten({ visualStrategy: "CHART" });
  const erzeugt = ableiten({ visualStrategy: "GENERATIVE" });
  assert.equal(/Neon|neon/.test(gezeichnet.mustNotShow.join(" ")), false);
  assert.match(erzeugt.mustNotShow.join(" "), /neon/);
});

test("VDD19 · Die Quellenzeile steht in mustShow, wenn Daten im Bild sind", () => {
  const mit = ableiten();
  assert.match(mit.mustShow.join(" "), /Tiingo, Stand 11\.09\.2026/);
  const ohne = ableiten({ visualData: { points: new Array(270).fill(1),
    contributions: BEITRAEGE } });
  assert.equal(/Quellenzeile/.test(ohne.mustShow.join(" ")), false);
});

/* ------------------------------------------------------------------ */
/* DER RAHMEN KENNT SEINE FAMILIE                                      */
/* ------------------------------------------------------------------ */

test("VDD20 · Archetyp ist nicht Familie, aber aufloesbar", () => {
  /* Von 14 Archetypen heissen genau zwei wie eine Familie. Den
     Archetyp einfach einzusetzen haette fuer zwoelf von ihnen "keine
     hinterlegte Kernfrage" gemeldet - eine falsche Erklaerung. */
  const Schema = require("../engines/schema.js");
  for (const a of Schema.CONTENT_ARCHETYPES) {
    const f = AF.frame({ entities: ["XOM"] }, { archetype: a });
    assert.ok(f.coreQuestion, "keine Kernfrage fuer Archetyp " + a);
    assert.equal(f.familyBasis, "ARCHETYPE");
  }
});

test("VDD21 · Steht die Familie am Thema, gewinnt sie", () => {
  const f = AF.frame({ family: "RANKING", entities: ["XOM"] },
    { archetype: "STOCK_STORY" });
  assert.equal(f.family, "RANKING");
  assert.equal(f.familyBasis, "TOPIC");
});

test("VDD22 · Ohne beides sagt der Rahmen das, statt zu raten", () => {
  const f = AF.frame({ entities: ["XOM"] }, {});
  assert.equal(f.family, null);
  assert.equal(f.familyBasis, "NONE");
  assert.equal(f.coreQuestion, null);
  assert.equal(AF.ready(f).ok, false);
});
