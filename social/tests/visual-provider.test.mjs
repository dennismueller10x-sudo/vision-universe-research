/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/visual-provider.test.mjs

   Visual Strategy ist nicht Visual Provider. Diese Tests halten die
   Trennung fest — und dass sie nicht zur Abschaffung generativer Bilder
   missbraucht wird.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V = require("../engines/visual-provider.js");

const VOLL = { keyNumber: true, source: true, statement: true, timeSeries: true,
  scoreContributions: true, returns: true, peerValues: true, trendState: true,
  fundamentals: true, visualBrief: true };

test("VP1 · Die Strategie sagt WAS, der Provider sagt WER", () => {
  /* Solange beide `visualType` hiessen, fielen sie zusammen — und eine
     Transportfrage drohte mit einem inhaltlichen Verzicht beantwortet
     zu werden. */
  assert.equal(V.provider("CHART"), V.DETERMINISTISCH);
  assert.equal(V.provider("SCORE"), V.DETERMINISTISCH);
  assert.equal(V.provider("FUTURE_TECH"), V.GENERATIV);
  assert.equal(V.provider("ATLAS_SCENE"), V.GENERATIV);
});

test("VP2 · Die datengetriebenen Strategien kosten keinen externen Lauf", () => {
  /* Der Kern der Architektur: die meisten Content Objects brauchen
     keinen Agenten. Das ist kein Verzicht — es ist die Feststellung,
     dass ein Score aus unseren Daten zeichenbar ist. */
  ["DATA_CARD", "CHART", "SCORE", "PERFORMANCE", "COMPARISON", "RANKING",
   "TECHNICAL", "FUNDAMENTAL"].forEach((s) => {
    const r = V.route(s, VOLL);
    assert.equal(r.ok, true, s + ": " + r.explanation);
    assert.equal(r.costsInvocation, false, s + " kostet einen Lauf");
  });
});

test("VP3 · Generative Strategien bleiben moeglich", () => {
  /* Ausdruecklich getestet, weil der Owner genau das ausgeschlossen
     hat: generative Bilder dauerhaft abzuschalten. Die Routing-Schicht
     darf keine Hintertuer dafuer sein. */
  ["FUTURE_TECH", "ATLAS_SCENE", "ROBOTICS", "AI_INFRASTRUCTURE",
   "SEMICONDUCTOR_WORLD", "CINEMATIC_MARKET_STORY"].forEach((s) => {
    const r = V.route(s, VOLL);
    assert.equal(r.ok, true, s + ": " + r.explanation);
    assert.equal(r.provider, V.GENERATIV);
    assert.equal(r.costsInvocation, true);
  });
});

test("VP4 · Jedes Bild entsteht aus den Daten SEINES Objekts", () => {
  /* Keine Bibliothek, keine Vorlage mit ausgetauschter Zahl. Der Satz
     steht an jeder Strategie, damit ihn niemand spaeter uebersieht. */
  Object.keys(V.STRATEGIEN).forEach((name) => {
    const s = V.STRATEGIEN[name];
    assert.ok(s.perObject && s.perObject.length > 10,
      name + " sagt nicht, woraus sein Bild entsteht");
  });
});

test("VP5 · Eine Strategie ohne Daten wird nicht gewaehlt", () => {
  /* Ein leeres Chart mit beschrifteten Achsen ist schlimmer als kein
     Chart: es sieht nach Information aus. */
  const ohneReihe = Object.assign({}, VOLL, { timeSeries: false });
  const r = V.route("CHART", ohneReihe);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missingData");
  assert.deepEqual(r.missing, ["timeSeries"]);
});

test("VP6 · Eine unbekannte Strategie wird nicht geraten", () => {
  const r = V.route("ERFUNDEN", VOLL);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknownStrategy");
});

test("VP7 · Ein generativer Weg nennt seine deterministischen Alternativen", () => {
  /* Kein Verbot, eine Sichtbarmachung: wer generativ waehlt, obwohl
     eine gezeichnete Form dasselbe zeigen koennte, soll das gewollt
     haben. */
  const r = V.route("FUTURE_TECH", VOLL);
  assert.equal(r.ok, true);
  assert.ok(r.deterministicAlternatives.includes("CHART"));
  assert.ok(r.deterministicAlternatives.includes("SCORE"));
});

test("VP8 · Das Zyklusbudget zaehlt nur die generativen Wege", () => {
  /* Die Frage des Owners, direkt beantwortet: wie erhalten kuenftige
     Content Objects ihre Bilder, ohne dass die Chatliste volllaeuft. */
  const b = V.budget([
    { strategy: "CHART" }, { strategy: "SCORE" },
    { strategy: "COMPARISON" }, { strategy: "FUTURE_TECH" }
  ]);
  assert.equal(b.total, 4);
  assert.equal(b.deterministic, 3);
  assert.equal(b.invocations, 1);
});

test("VP9 · Ein voller Zyklus aus datengetriebenen Formen kostet null Laeufe", () => {
  const b = V.budget([{ strategy: "CHART" }, { strategy: "SCORE" },
    { strategy: "PERFORMANCE" }, { strategy: "COMPARISON" }]);
  assert.equal(b.invocations, 0);
});

test("VP10 · Das Budget sieht die teure Zeile", () => {
  /* Der Zyklus nennt ein uebernommenes Agentenbild `GENERATIVE`. Dieser
     Name fehlte im Vokabular — und damit zaehlte budget() ausgerechnet
     den einen Fall, der wirklich eine Work-Ausfuehrung gekostet hat,
     als kostenlos. Ein Budget, das die teure Zeile nicht sieht, ist
     keines.

     Gefunden wurde das nicht durch Nachdenken, sondern durch
     Nachrechnen an einem echten Lauf: vier Pakete, davon eines
     generativ, und der Bericht sagte "Work-Ausfuehrungen: 0". */
  assert.equal(V.istGenerativ("GENERATIVE"), true);
  const b = V.budget([{ strategy: "GENERATIVE" }, { strategy: "CHART" },
    { strategy: "CHART" }, { strategy: "CHART" }]);
  assert.equal(b.generative, 1);
  assert.equal(b.deterministic, 3);
  assert.equal(b.invocations, 1);
});
