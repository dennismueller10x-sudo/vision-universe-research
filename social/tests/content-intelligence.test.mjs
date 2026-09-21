/* =========================================================================
   CONTENT INTELLIGENCE — §6, §7, §8

   Vier Ebenen, die nicht dasselbe sind. Der Fehler, den §8 verbietet,
   ist in diesem Repository schon passiert: der erste gerenderte
   Kandidat trug "XOM: 76 im Technical Opportunity Score".

   Die Liste der internen Begriffe lag die ganze Zeit daneben. Diese
   Tests pruefen vor allem, ob sie jetzt im Weg steht - und ob sie
   dabei keinen richtigen Text abweist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CI = require("../engines/content-intelligence.js");
const AF = require("../engines/audience-frame.js");
const VQ = require("../engines/visual-quality.js");
const Content = require("../engines/content.js");

const NOW = "2026-09-16T10:00:00Z";

function sauber(ueber) {
  return Object.assign({
    internalSignal: ["Technical Opportunity Score", "76"],
    editorialAngle: "Was ist bei diesem Unternehmen gerade los?",
    publicHook: "So nah am Jahreshoch war Exxon seit 2022 nicht.",
    publicStory: "Der Konzern steht am oberen Rand seiner Gruppe, gemessen " +
      "an den letzten zwoelf Monaten."
  }, ueber || {});
}

/* --------------------------------------------------------- §8 Ebenen */

test("CI1 · Die vier Ebenen sind benannt, und jede sagt, wo sie wohnt", () => {
  assert.deepEqual(CI.EBENEN_IDS,
    ["INTERNAL_SIGNAL", "EDITORIAL_ANGLE", "PUBLIC_HOOK", "PUBLIC_STORY"]);
  for (const id of CI.EBENEN_IDS) {
    const e = CI.EBENEN[id];
    assert.ok(e.zweck, id + " ohne Zweck");
    assert.ok(e.wohnt, id + " sagt nicht, wo sie wohnt");
    assert.equal(typeof e.oeffentlich, "boolean");
  }
  /* Genau zwei davon gehen nach draussen. */
  assert.deepEqual(CI.EBENEN_IDS.filter((id) => CI.EBENEN[id].oeffentlich),
    ["PUBLIC_HOOK", "PUBLIC_STORY"]);
});

test("CI2 · Ein sauber getrennter Beitrag geht durch", () => {
  const r = CI.trenne(sauber());
  assert.equal(r.ok, true, r.erklaerung);
  assert.equal(r.zustand, CI.BEFUND.OK);
});

test("CI3 · Eine fehlende Ebene wird benannt, nicht uebersehen", () => {
  const r = CI.trenne(sauber({ editorialAngle: "" }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === CI.BEFUND.EBENE_FEHLT &&
    v.ebene === "EDITORIAL_ANGLE"));
});

/* ------------------------------------------- Das Tor, das gefehlt hat */

test("CI4 · Der Satz vom ersten Kandidaten kommt nicht mehr durch", () => {
  const r = CI.trenne(sauber({
    publicHook: "XOM: 76 im Technical Opportunity Score." }));
  assert.equal(r.ok, false);
  const v = r.verstoesse.find((x) =>
    x.id === CI.BEFUND.INTERNES_SIGNAL_OEFFENTLICH);
  assert.ok(v, JSON.stringify(r.verstoesse));
  assert.deepEqual(v.begriffe, ["Technical Opportunity Score"]);
});

test("CI5 · Auch im Beitragstext, nicht nur im Hook", () => {
  const r = CI.trenne(sauber({
    publicStory: "Der Setup-Rang liegt im obersten Perzentil." }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) =>
    v.id === CI.BEFUND.INTERNES_SIGNAL_OEFFENTLICH && v.ebene === "PUBLIC_STORY"));
});

test("CI6 · Eine fehlende Begriffsliste ist kein Freibrief", () => {
  /* Unbekanntes als "keine Einschraenkung" zu lesen ist die
     Fehlerfamilie, die hier schon mehrfach zugeschlagen hat. */
  const r = CI.trenne({ internalSignal: "x",
    editorialAngle: "Was bedeutet das fuer mein Depot?",
    publicHook: "76 im Technical Opportunity Score.",
    publicStory: "Text.", internalTerms: [] });
  assert.equal(r.ok, false);
  assert.ok(r.geprueft >= 10,
    "Ohne eigene Liste muss die kanonische gelten, nicht die leere");
});

test("CI7 · Die Liste ist die aus audience-frame.js, keine zweite", () => {
  const quelle = readFileSync("social/engines/content-intelligence.js", "utf8");
  assert.doesNotMatch(quelle, /INTERN_NICHT_IM_HOOK\s*=/,
    "content-intelligence.js fuehrt eine eigene Begriffsliste");
  assert.match(quelle, /AudienceFrame\.INTERN_NICHT_IM_HOOK/);
});

/* -------------------------------------- Kein Pruefer, der recht hat */

test("CI8 · Ein Kuerzel wird nicht mitten im Wort gefunden", () => {
  assert.deepEqual(CI.interneTreffer("Ein Smartphone mit SMS", ["SMA"]), []);
  assert.deepEqual(CI.interneTreffer("Attraktive Titel", ["ATR"]), []);
  /* Aber als eigenes Wort sehr wohl. */
  assert.deepEqual(CI.interneTreffer("Der SMA-Wert liegt hoch", ["SMA"]), ["SMA"]);
});

test("CI9 · Ein Wort wird auch in der Zusammensetzung gefunden", () => {
  /* "Perzentilrechnung" ist derselbe interne Begriff mit Anhang. Ein
     Tor, das ihn durchlaesst, ist zu schmal gebaut. */
  assert.deepEqual(CI.interneTreffer("Eine Perzentilrechnung", ["Perzentil"]),
    ["Perzentil"]);
  assert.deepEqual(CI.interneTreffer("Trendwertorientiert", ["Trendwert"]),
    ["Trendwert"]);
});

test("CI10 · Die Unterscheidung haengt an der Schreibung, nicht am Zufall", () => {
  assert.equal(CI.istKuerzel("SMA"), true);
  assert.equal(CI.istKuerzel("TREND_STRUCTURE"), true);
  assert.equal(CI.istKuerzel("Perzentil"), false);
  assert.equal(CI.istKuerzel("z-Score"), false);
});

test("CI11 · Ein voellig unverfaenglicher Beitrag loest nichts aus", () => {
  const r = CI.trenne(sauber({
    publicHook: "Kleine Unternehmen sind so billig wie lange nicht.",
    publicStory: "Gemessen am Gewinn kosten sie heute weniger als grosse " +
      "Unternehmen. Der Abstand ist der groesste seit 1999." }));
  assert.equal(r.ok, true, r.erklaerung);
});

/* ----------------------------------------- Die Frage bleibt eine Frage */

test("CI12 · Die Frage darf nicht das Signal in anderen Worten sein", () => {
  const r = CI.trenne(sauber({
    internalSignal: "Der Rang im Vergleich zur Gruppe ist hoch",
    editorialAngle: "Der Rang im Vergleich zur Gruppe ist hoch" }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === CI.BEFUND.ANGLE_IST_DAS_SIGNAL));
});

test("CI13 · Die Hook darf nicht die Kernfrage selbst sein", () => {
  const frage = "Was bedeutet das fuer mein Depot?";
  const r = CI.trenne(sauber({ editorialAngle: frage, publicHook: frage }));
  assert.equal(r.ok, false);
  assert.ok(r.verstoesse.some((v) => v.id === CI.BEFUND.HOOK_IST_DER_ANGLE));
});

test("CI14 · Die Schwellen sind dieselben wie ueberall sonst", () => {
  const quelle = readFileSync("social/engines/content-intelligence.js", "utf8");
  assert.match(quelle, /VQ\.GRENZEN\.redundanz/);
  assert.match(quelle, /VQ\.GRENZEN\.hookDoppel/);
  assert.ok(typeof VQ.GRENZEN.hookDoppel === "number");
});

/* ------------------------------------------------- Ableitung aus dem Bau */

test("CI15 · Die Ebenen werden aus dem Bestehenden abgeleitet", () => {
  const rahmen = AF.frame({ topicId: "t", family: "STOCK_STORY",
    entities: ["XOM"] }, { names: { XOM: "Exxon Mobil" } });
  const k = CI.ableiten({
    package: { hook: "Ein Satz.", caption: "Ein Text.", thesis: "Eine These." },
    opportunity: { scoreName: "Technical Opportunity Score", score: 76 },
    audienceFrame: rahmen,
    evidence: [{ metric: "Setup-Rang" }] });
  assert.ok(k.internalSignal.includes("Technical Opportunity Score"));
  assert.ok(k.internalSignal.includes("Setup-Rang"));
  assert.equal(k.editorialAngle, rahmen.coreQuestion);
  assert.equal(k.publicHook, "Ein Satz.");
  assert.match(k.publicStory, /Ein Text/);
  assert.ok(k.internalTerms.length >= 10);
});

/* -------------------------------------- Das Tor steht im Produktionsweg */

const CONTENT_QUELLE = readFileSync("social/engines/content.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("CI16 · Die Pipeline hat eine eigene Stufe dafuer", () => {
  assert.ok(Content.STAGES.includes("AUDIENCE_SEPARATION"), Content.STAGES.join(","));
  assert.match(CONTENT_QUELLE, /ContentIntelligence\s*\.\s*trenne/);
});

test("CI17 · Der reale Durchlauf sperrt den Vorfall vom ersten Kandidaten", () => {
  const res = Content.run({
    opportunity: { opportunityId: "o", topic: "Exxon", entities: ["XOM"],
      platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "XOM",
      metric: "Technical Opportunity Score", value: 76, state: "VERIFIED",
      observedAt: NOW }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { keyNumber: true },
    audienceFrame: AF.frame({ topicId: "t", family: "STOCK_STORY",
      entities: ["XOM"] }, { names: { XOM: "Exxon Mobil" } }),
    writer: Content.createTemplateWriter()
  }, { now: NOW });

  assert.equal(res.ok, false);
  assert.equal(res.failedStage, "AUDIENCE_SEPARATION");
  assert.match(res.explanation, /Technical Opportunity Score/);
});

test("CI18 · Ein Beitrag aus oeffentlichen Kennzahlen geht weiterhin durch", () => {
  /* Das Tor darf nicht alles sperren. "52-Wochen-Hoch" ist eine
     oeffentliche Angabe und kein internes Signal. */
  const res = Content.run({
    opportunity: { opportunityId: "o2", topic: "KI-Rechenzentren",
      entities: ["NVDA"], platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: NOW }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Content.createTemplateWriter()
  }, { now: NOW });

  assert.equal(res.ok, true, res.explanation);
  const a = res.package.validation.audienceSeparation;
  assert.equal(a.passed, true, a.explanation);
  /* Ohne Publikumsrahmen fehlt die Kernfrage - das ist ein Befund
     ueber die Vorarbeit und getrennt vermerkt, nicht mit der Sperre
     verrechnet. */
  assert.equal(a.vollstaendig, false);
  assert.deepEqual(a.fehlendeEbenen, ["EDITORIAL_ANGLE"]);
});

test("CI19 · Der Befund reist mit dem Paket", () => {
  const res = Content.run({
    opportunity: { opportunityId: "o3", topic: "KI-Rechenzentren",
      entities: ["NVDA"], platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: NOW }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Content.createTemplateWriter()
  }, { now: NOW });
  const a = res.package.validation.audienceSeparation;
  assert.ok(a, "Der Befund faellt beim Verpacken heraus");
  assert.ok(a.geprueft >= 10, "Gegen wie viele Begriffe geprueft wurde");
  assert.equal(a.passed, true);
});

test("CI20 · Eine fehlende Ebene sperrt nicht, ein interner Begriff schon", () => {
  /* Ohne Publikumsrahmen gibt es die Kernfrage hier nicht. Das ist ein
     Befund ueber unsere Vorarbeit - kein Grund, den Beitrag zu sperren.
     Der interne Begriff ist etwas anderes: der geht nicht raus. */
  const ohneRahmen = CI.trenne(sauber({ editorialAngle: "" }));
  assert.ok(ohneRahmen.verstoesse.every((v) => v.id === CI.BEFUND.EBENE_FEHLT));
  assert.equal(ohneRahmen.ok, false, "unvollstaendig");
  assert.equal(ohneRahmen.dicht, true, "aber nichts Internes ist raus");
  /* Und umgekehrt. */
  const leck = CI.trenne(sauber({ publicHook: "76 im Setup-Rang." }));
  assert.equal(leck.dicht, false);
  assert.match(CONTENT_QUELLE, /if \(!ebenen\.dicht\)/);
});
