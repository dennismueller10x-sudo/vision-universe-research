/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/north-star-layers.test.mjs

   Die vier Schichten, die den North Star von der alten Pipeline
   trennen: Gelegenheitsauswahl ueber mehrere Themen, Audience Framing
   vor dem Schreiben, externe Musterbeobachtung ohne fremde Inhalte,
   und Bildqualitaet getrennt von Bildintegritaet.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SO = require("../engines/social-opportunity.js");
const AF = require("../engines/audience-frame.js");
const EI = require("../engines/external-intelligence.js");
const VI = require("../engines/visual-intelligence.js");
const U = require("../engines/content-universe.js");
const O = require("../engines/opportunity.js");

/* ------------------------------------------------------------------ */
/* EIN SIGNAL IST NICHT DIE GELEGENHEIT                                */
/* ------------------------------------------------------------------ */

const THEMEN = [
  U.topic({ family: "RANKING", entityType: "STOCK", entities: ["Apple", "Microsoft", "Nvidia"],
    sources: ["VU_DISCOVER"], slug: "r1", title: "Starke Bilanzen", asOf: "2026-09-18" }),
  U.topic({ family: "EDUCATION", entityType: "NONE", sources: ["VU_MAGAZINE"],
    title: "Was ist ein ETF?", evidenceRefs: ["magazin/01/index.html"] }),
  U.topic({ family: "STOCK_STORY", entityType: "STOCK", entities: ["Exxon Mobil"],
    sources: ["VU_QUANT"], slug: "s1", title: "Exxon Mobil nach den Zahlen" })
];

test("NS1 · Mehrere Familien treten gegeneinander an", () => {
  const r = SO.rank(THEMEN, {
    scorer: (e, o) => O.score(e, Object.assign({}, o,
      { systemicallyUnavailable: ["audienceInterest", "historicalPerformance", "platformFit"] })),
    history: [],
    signals: {
      [THEMEN[0].topicId]: { brandFit: 0.9, contentGap: 1, hoursSinceTrigger: 20 },
      [THEMEN[1].topicId]: { brandFit: 0.9, contentGap: 1, hoursSinceTrigger: 50 },
      [THEMEN[2].topicId]: { brandFit: 0.9, contentGap: 1, hoursSinceTrigger: 5,
        trendScore: 70, vuSignalStrength: 0.8 }
    }
  });
  assert.ok(r.familyCount >= 2, "Gebaut: " + JSON.stringify(r.families));
  assert.equal(r.predictsPerformance, false);
});

test("NS2 · Ein Quant-Signal ist Herkunft, nicht Rang", () => {
  /* Bisher galt: Signal vorhanden, also Beitrag. Es trat gegen nichts
     an, weil es nichts anderes gab. */
  const r = SO.rank(THEMEN, {
    scorer: (e, o) => O.score(e, Object.assign({}, o,
      { systemicallyUnavailable: ["audienceInterest", "historicalPerformance", "platformFit"] })),
    history: [],
    signals: Object.fromEntries(THEMEN.map((t) =>
      [t.topicId, { brandFit: 0.9, contentGap: 1, hoursSinceTrigger: 20 }]))
  });
  const ausSignal = r.ranked.filter((b) => b.derivedFrom === SO.KIND.MARKET_SIGNAL);
  assert.ok(ausSignal.every((b) => b.kind === SO.KIND.CONTENT_OPPORTUNITY),
    "Ein Signal kann eine Gelegenheit erzeugen. Es IST keine.");
});

test("NS3 · Ohne Scorer rechnet diese Schicht nicht selbst", () => {
  /* Zwei Rechenwege waeren zwei Wahrheiten. */
  const r = SO.rank(THEMEN, {});
  assert.equal(r.ok, false);
  assert.match(r.explanation, /rechnet nicht selbst/);
});

test("NS4 · Eine Historie ohne Familie ist keine Saettigungsmessung", () => {
  /* Der erste Entwurf meldete "0 von 25 Beitraegen waren
     MAGAZINE_STORY" - und keiner der 25 trug ein Familienfeld.
     Unbekannt sah aus wie null. */
  const ohne = SO.saettigung("RANKING", [{ at: "2026-09-01" }, { at: "2026-09-02" }]);
  assert.equal(ohne.measured, false);
  assert.match(ohne.explanation, /nicht messbar, nicht null/);

  const mit = SO.saettigung("RANKING",
    [{ family: "RANKING", at: "x" }, { family: "EDUCATION", at: "y" }]);
  assert.equal(mit.measured, true);
  assert.equal(mit.value, 0.5);
});

/* ------------------------------------------------------------------ */
/* AUDIENCE FRAMING VOR DEM SCHREIBEN                                  */
/* ------------------------------------------------------------------ */

test("NS5 · Der Rahmen nennt Publikum, Vorwissen und Kernfrage", () => {
  const f = AF.frame(THEMEN[1], {});
  assert.match(f.targetAudience, /Einsteiger/);
  assert.match(f.assumedKnowledge, /NICHT vorausgesetzt/);
  assert.ok(f.coreQuestion);
  assert.equal(AF.ready(f).ok, true, AF.ready(f).explanation);
});

test("NS6 · Ohne Kernfrage darf nicht geschrieben werden", () => {
  /* Genau diese Frage hat vorher gefehlt - und der Agent hat
     beantwortet, was gefragt war. */
  const f = AF.frame(U.topic({ family: "UNBEKANNT", entityType: "NONE",
    sources: ["EDITORIAL"], title: "Irgendwas" }), {});
  const r = AF.ready(f);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("coreQuestion"));
});

test("NS7 · Der Rahmen erfindet keine Zielgruppenforschung", () => {
  assert.equal(AF.frame(THEMEN[0], {}).basis, AF.BASIS.BOOTSTRAP);
  assert.equal(AF.frame(THEMEN[0], {}).predictsPerformance, false);
});

test("NS8 · Eine Entitaet ohne Klarnamen faellt hier auf, nicht im Hook", () => {
  const t = U.topic({ family: "STOCK_STORY", entityType: "STOCK",
    entities: ["xpeng"], sources: ["VU_STOCK_REPORT"], slug: "x" });
  const f = AF.frame(t, { names: {} });
  assert.ok(f.findings.some((x) => x.id === "noPlainName"));
});

/* ------------------------------------------------------------------ */
/* MUSTER LERNEN, NICHT INHALTE KOPIEREN                               */
/* ------------------------------------------------------------------ */

test("NS9 · Ohne angebundene Quelle meldet die Schicht das, statt zu schweigen", () => {
  const c = EI.capability([]);
  assert.equal(c.state, EI.STATE.AWAITING_OWNER_SOURCE);
  assert.match(c.explanation, /Abwesenheit einer Messung/);
});

test("NS10 · Eine Beobachtung hat kein Feld fuer fremden Text", () => {
  /* Ein Feld, das es nicht gibt, kann niemand versehentlich fuellen. */
  const o = EI.observation({ observationId: "o1", hookArchetype: "CONTRAST" });
  for (const f of EI.VERBOTENE_FELDER) assert.ok(!(f in o), "Feld " + f + " existiert.");
});

test("NS11 · Eingeschmuggelter Fremdinhalt wird beanstandet", () => {
  const o = Object.assign(EI.observation({ observationId: "o1" }),
    { caption: "fremder Text" });
  const v = EI.validateObservation(o);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => f.id === "copiedContent"));
});

test("NS12 · Korrelation darf sich nicht zur Ursache erklaeren", () => {
  const o = Object.assign(EI.observation({ observationId: "o1" }), { causalClaim: true });
  assert.ok(EI.validateObservation(o).findings.some((f) => f.id === "causalClaim"));
});

test("NS13 · Eine Quelle wird entscheidungsreif beschrieben", () => {
  /* "Wir brauchen eine API" ist keine Entscheidungsgrundlage. */
  const s = EI.source({ sourceId: "x" });
  ["availableData", "accessMethod", "legalConstraints", "rateLimit",
   "cost", "historicalDepth", "expectedValue", "alternatives"]
    .forEach((f) => assert.ok(f in s, "Feld " + f + " fehlt."));
  assert.equal(s.state, EI.STATE.AWAITING_OWNER_SOURCE);
});

/* ------------------------------------------------------------------ */
/* TECHNISCH HEIL IST NICHT KREATIV GUT                                */
/* ------------------------------------------------------------------ */

test("NS14 · Ohne kreative Signale ist ein Bild ungeprueft, nicht bestanden", () => {
  /* Das XOM-Visual hat neun technische Pruefungen bestanden. Keine
     davon fragt, ob das Bild die Geschichte traegt. */
  const a = VI.assessQuality({});
  assert.equal(a.passed, false);
  assert.equal(a.unassessed.length, VI.KRITERIEN.length);
  assert.match(a.explanation, /kreativ ist es ungeprueft/);
});

test("NS15 · Ein kreativer Befund ist kein technischer", () => {
  const a = VI.assessQuality({
    signals: Object.fromEntries(VI.KRITERIEN.map((k) => [k, k === "scrollStop" ? 0.2 : 0.9])) });
  assert.equal(a.passed, false);
  assert.equal(a.failureType, "VISUAL_CREATIVE_QUALITY_FAILED");
  assert.equal(a.technicalJudgement, false);
  assert.equal(a.predictsPerformance, false);
});

test("NS16 · Generische Motive sind nicht verboten, aber begruendungspflichtig", () => {
  const signale = Object.fromEntries(VI.KRITERIEN.map((k) => [k, 0.9]));
  const ohneGrund = VI.direction({ coreIdea: "Ein Neon-Datenstrom", mainSubject: "neon",
    oneSecondMessage: "x", storyCarried: "y", mobileFocalPoint: "Mitte" });
  assert.equal(VI.assessQuality({ direction: ohneGrund, signals: signale }).passed, false);

  /* Wenn das Motiv die Geschichte traegt, ist es richtig. */
  const mitGrund = VI.direction({ coreIdea: "Ein Neon-Datenstrom", mainSubject: "neon",
    oneSecondMessage: "x", storyCarried: "y", mobileFocalPoint: "Mitte",
    /* Beide Motive im Text muessen begruendet sein - "Neon-Datenstrom"
       enthaelt zwei. Der erste Entwurf dieses Tests begruendete nur
       eines und fiel durch; die Pruefung hatte recht. */
    justifiedGenericMotifs: ["neon", "datenstrom"] });
  assert.equal(VI.assessQuality({ direction: mitGrund, signals: signale }).passed, true);
});

test("NS17 · Eine Richtung ohne eine Idee ist eine Bestellung", () => {
  const r = VI.ready(VI.direction({ visualStrategy: "GENERATIVE" }));
  assert.equal(r.ok, false);
  assert.match(r.explanation, /bekommt Neonwuerfel/);
});

/* ------------------------------------------------------------------ */
/* DIE SOURCE DECISION MATRIX                                          */
/* ------------------------------------------------------------------ */

import { readFileSync } from "node:fs";
const MATRIX = JSON.parse(readFileSync(
  new URL("../config/external-sources.json", import.meta.url), "utf8"));

test("NS18 · Keine externe Quelle ist aktiviert", () => {
  /* Die Matrix beschreibt Optionen. Sie trifft keine Entscheidung und
     oeffnet keinen Zugang. */
  const q = MATRIX.sources.map((s) => EI.source(s));
  const c = EI.capability(q);
  assert.equal(c.activeSources, 0);
  assert.equal(c.state, EI.STATE.AWAITING_OWNER_SOURCE);
  assert.equal(MATRIX.purpose, "OWNER_DECISION_MATRIX");
});

test("NS19 · Eine Quelle ohne geprueften Preis ist nicht entscheidungsreif", () => {
  /* Bei X und beim Scraping habe ich die laufenden Kosten NICHT
     verifiziert. Sie als Option mit Preis zu praesentieren waere eine
     erfundene Zahl an genau der Stelle, an der entschieden wird. */
  const q = MATRIX.sources.map((s) => EI.source(s));
  const offen = q.filter((s) => !s.decisionReady).map((s) => s.sourceId);
  assert.ok(offen.includes("x.api"));
  assert.ok(offen.every((id) => q.find((s) => s.sourceId === id)
    .missingDecisionFields.includes("cost")));
});

test("NS20 · Die kostenfreien offiziellen Wege sind entscheidungsreif", () => {
  const q = MATRIX.sources.map((s) => EI.source(s));
  for (const id of ["meta.instagram.hashtag_search", "youtube.data_api"]) {
    const s = q.find((x) => x.sourceId === id);
    assert.equal(s.decisionReady, true,
      id + " fehlt: " + s.missingDecisionFields.join(", "));
    assert.equal(s.cost, 0);
    assert.equal(s.official, true);
  }
});

test("NS21 · Scraping wird benannt und nicht empfohlen", () => {
  /* Aufgefuehrt, damit die Option bewertet ist - nicht, damit sie
     gewaehlt wird. Eine Quelle nur deshalb zu waehlen, weil sie
     technisch erreichbar ist, waere genau der ausgeschlossene Fehler. */
  const s = MATRIX.sources.find((x) => x.sourceId === "scraping.any");
  assert.equal(s.state, "NOT_RECOMMENDED");
  assert.equal(s.official, false);
  assert.match(s.operationalRisk, /HOCH/);
  assert.ok(MATRIX.recommendation.notRecommended.includes("scraping.any"));
});

test("NS22 · Die Empfehlung begruendet sich aus Kosten, Zugang und Risiko", () => {
  const r = MATRIX.recommendation;
  assert.equal(r.first, "meta.instagram.hashtag_search");
  const erste = MATRIX.sources.find((s) => s.sourceId === r.first);
  assert.equal(erste.runningCost, 0);
  assert.match(erste.accessMethod, /[Bb]estehend/);
  assert.ok(r.explicitlyNotChosen.length > 10);
});
