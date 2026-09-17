/* =========================================================================
   VU SOCIAL — Das Evidenzpaket (EP1–EP16)

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Der erste Kandidat sagte: "XOM, 76 im Technical Opportunity Score."
   Mehr ging nicht, weil mehr nicht da war — der Signalsammler hatte aus
   dem technischen Bundle genau eine Zahl herausgezogen.

   76 wovon bis wovon? Ist das eine Wahrscheinlichkeit? Der Leser konnte
   es nicht wissen, und ein Creative Agent haette es sich ausgedacht.

   Im Bundle stand alles: Band, Beitraege je Familie, Trendbelege,
   Momentum ueber vier Horizonte, Volatilitaetsregime, Datengrundlage —
   und der Satz "Keine Wahrscheinlichkeit, keine Renditeerwartung."

   Diese Tests laufen gegen das ECHTE Bundle im Repository.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EP = require("../engines/evidence-package.js");
const CB = require("../engines/claim-binding.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(join(ROOT, "quant/data/technical/instruments/XOM.json"), "utf8")).bundle;

const PAKET = EP.fromTechnicalBundle(BUNDLE, { entity: "XOM", now: "2026-09-17T12:00:00Z" });

/* ------------------------------------------------------------------ */
/* WAS DAS PAKET MITNIMMT                                              */
/* ------------------------------------------------------------------ */

test("EP1 · Aus einer Zahl werden viele belegte Aussagen", () => {
  assert.equal(PAKET.ok, true);
  assert.ok(PAKET.evidence.length >= 15,
    "nur " + PAKET.evidence.length + " Aussagen — der Befund ist nicht behoben");
  assert.ok(PAKET.dimensionsAvailable.length >= 5);
});

test("EP2 · Die Leitzahl traegt ihre Bedeutung mit", () => {
  /* Der wichtigste Einzelbefund. Ohne diesen Satz ist 76 eine Zahl, die
     wie eine Chance aussieht. */
  const bedeutung = PAKET.evidence.filter((e) =>
    e.id === "score-meaning" || e.id === "score-not-probability");
  assert.equal(bedeutung.length, 2);
  assert.match(bedeutung.map((e) => e.statement).join(" "), /Keine Wahrscheinlichkeit/);
  assert.match(bedeutung.map((e) => e.statement).join(" "), /methodischer Rang/);
});

test("EP3 · Der Score zerlegt sich in seine Beitraege", () => {
  /* Ohne das ist eine Punktzahl eine Meinung mit Nachkommastelle. */
  const beitraege = PAKET.evidence.filter((e) => e.id.startsWith("score-contribution-"));
  assert.ok(beitraege.length >= 5);
  assert.match(beitraege.map((e) => e.statement).join(" "), /TREND_STRUCTURE traegt .* von 30/);
});

test("EP4 · Die Belegsaetze der Engines werden uebernommen, nicht neu formuliert", () => {
  /* Sie neu zu formulieren hiesse, eine zweite Lesart derselben Zahl zu
     erzeugen. */
  const trend = PAKET.evidence.filter((e) => e.dimension === "TREND");
  const original = (BUNDLE.trend.evidence || []).map((e) => e.statement);
  const uebernommen = trend.filter((e) => original.includes(e.statement));
  assert.ok(uebernommen.length >= 3, "die Engine-Saetze fehlen");
});

test("EP5 · Jede Aussage traegt Quelle, Stand und Zeiger", () => {
  for (const e of PAKET.evidence) {
    assert.ok(e.source, e.id + " ohne Quelle");
    assert.ok(e.observedAt, e.id + " ohne Stand");
    assert.ok(e.pointer, e.id + " ohne Zeiger ins Bundle");
  }
});

test("EP6 · Die Datengrundlage ist selbst eine Aussage", () => {
  const basis = PAKET.evidence.find((e) => e.id === "data-basis");
  assert.ok(basis);
  assert.match(basis.statement, /2940 Handelstage/);
});

/* ------------------------------------------------------------------ */
/* WAS NICHT DA IST — UND DASS ES DASTEHT                              */
/* ------------------------------------------------------------------ */

test("EP7 · Fehlende Dimensionen stehen ausdruecklich drin, mit Grund", () => {
  /* Ein Autor, der nur sieht, was da ist, haelt das Fehlende fuer nicht
     existent — und fuellt es. */
  const rs = PAKET.unavailable.find((u) => u.dimension === "RELATIVE_STRENGTH");
  assert.ok(rs, "die relative Staerke fehlt und wird nicht genannt");
  assert.match(rs.reason, /Benchmark/);
});

test("EP8 · Eine nicht verfuegbare Dimension wird NICHT ersetzt", () => {
  /* Wo die Quant-Schicht UNAVAILABLE sagt, steht hier UNAVAILABLE — und
     kein Ersatzwert. */
  assert.ok(!PAKET.evidence.some((e) => e.dimension === "RELATIVE_STRENGTH"));
  assert.equal(BUNDLE.relativeStrength.state, "UNAVAILABLE");
});

test("EP9 · Der Hinweis der Engine dazu reist mit", () => {
  const hinweis = PAKET.evidence.filter((e) => e.id.startsWith("score-note-"));
  assert.match(hinweis.map((e) => e.statement).join(" "), /Relative Staerke nicht verfuegbar/);
});

/* ------------------------------------------------------------------ */
/* DIE BINDUNG                                                         */
/* ------------------------------------------------------------------ */

test("EP10 · Ein Text aus den Belegen besteht das Claim Binding", () => {
  const text = "XOM erreicht 76 von 100 im Technical Opportunity Score. " +
    "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei. " +
    "Das 12M-Momentum liegt bei 47.6 %. " +
    "Grundlage sind 2940 Handelstage seit 2015-01-02.";
  const r = CB.check(text, PAKET.evidence, {});
  assert.equal(r.ok, true, r.explanation);
});

test("EP11 · Zahlen aus einem Belegsatz gelten als belegt", () => {
  /* Die Engines liefern fertige Saetze wie "Kurs ueber SMA50 (3.05
     ATR)". Nur den `value` zu decken hiesse, einen Autor fuer das
     Zitieren eines Belegs zu bestrafen — und je reicher die Evidenz,
     desto mehr angeblich unbelegte Zahlen. */
  const r = CB.check("Kurs ueber SMA50 (3.05 ATR).", PAKET.evidence, {});
  assert.equal(r.ok, true, r.explanation);
});

test("EP12 · Eine erfundene Zahl faellt trotz reicher Evidenz auf", () => {
  const r = CB.check("XOM erreicht 76 — die relative Staerke liegt bei 88.",
    PAKET.evidence, {});
  assert.equal(r.ok, false);
  assert.ok(r.unbound.some((u) => u.raw === "88"));
});

/* ------------------------------------------------------------------ */
/* DIE HINREICHENDE GESCHICHTE                                         */
/* ------------------------------------------------------------------ */

test("EP13 · Das echte Paket reicht fuer einen Beitrag", () => {
  const s = EP.assessSufficiency(PAKET);
  assert.equal(s.sufficient, true, s.explanation);
  assert.ok(s.dimensions >= 5);
});

test("EP14 · Ein hoher Score allein reicht NICHT", () => {
  /* Die Regel, die der Owner verlangt hat: eine Gelegenheit mit hohem
     Score ist nicht automatisch veroeffentlichungswuerdig. */
  const duenn = EP.fromTechnicalBundle({
    instrumentId: "ABC", dataCutoff: "2026-09-11",
    opportunityScore: { score: 91, isProbability: false }
  }, { entity: "ABC" });

  const s = EP.assessSufficiency(duenn);
  assert.equal(s.sufficient, false);
  assert.match(s.explanation, /Dimension/);
});

test("EP15 · Ohne Einordnung der Leitzahl reicht es nicht", () => {
  /* Eine Zahl ohne ihre Bedeutung ist der Anfang jeder
     Fehlinterpretation. */
  const ohne = JSON.parse(JSON.stringify(PAKET));
  ohne.evidence = ohne.evidence.filter((e) =>
    e.id !== "score-meaning" && e.id !== "score-not-probability");
  const s = EP.assessSufficiency(ohne);
  assert.equal(s.sufficient, false);
  assert.match(s.explanation, /Fehlinterpretation/);
});

test("EP16 · Die Kennung haengt am Datenstand", () => {
  /* Aendern sich die Daten, ist es ein anderes Paket — und damit ein
     anderer Brief und andere Varianten-Kennungen. */
  const zweites = EP.fromTechnicalBundle(
    Object.assign({}, BUNDLE, { dataVersion: "dv_anders" }), { entity: "XOM" });
  assert.notEqual(zweites.packageId, PAKET.packageId);
});
