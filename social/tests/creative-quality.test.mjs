/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creative-quality.test.mjs

   Richtig ist nicht dasselbe wie gut. Diese Tests halten fest, was die
   Rubrik prueft — und ebenso ausdruecklich, was sie NICHT behauptet.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Q = require("../engines/creative-quality.js");
const S = require("../engines/story-selection.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DIR = join(ROOT, "authoring/requests/vu-xom-20260911");
const BRIEF = JSON.parse(readFileSync(join(DIR, "authoring-brief.json"), "utf8"));
const ERGEBNIS = JSON.parse(readFileSync(join(DIR, "authoring-result.json"), "utf8"));
const STORY = S.select(BRIEF.evidence);

const VARIANTEN = ERGEBNIS.hook_variants.map((h) => ({
  hook: h.hook_text || h.text, evidenceRefs: h.evidence_refs || []
}));

test("CQ1 · Die Rubrik sagt ausdruecklich keine Leistung voraus", () => {
  /* Der wichtigste Test dieser Datei. Im Bestand ist n=0 — kein
     einziger dieser Beitraege ist erschienen. Eine Zahl, die Leistung
     verspricht, waere dieselbe erfundene Prognose, die der Publish
     Candidate im Feld "Zielmetrik" verweigert. */
  const a = Q.assess({ hook: "Irgendwas", caption: "Irgendwas." });
  assert.equal(a.predictsPerformance, false);
  /* Und sie gibt keine Note, sondern eine Zaehlung: eine Note
     suggeriert eine Skala, die es nicht gibt. */
  assert.equal(typeof a.met, "number");
  assert.equal(typeof a.total, "number");
  assert.equal(a.score, undefined);
});

test("CQ2 · Setzungen sind als Setzungen gekennzeichnet", () => {
  /* Wo ein Kriterium nicht gemessen, sondern entschieden ist, muss das
     dranstehen. Sonst liest sich eine Meinung wie ein Messwert. */
  const a = Q.assess({ hook: "76 von 100 – und trotzdem.", caption: "Weil X." });
  const arten = new Set(a.criteria.map((k) => k.kind));
  assert.ok(arten.has("policy"));
  assert.ok(arten.has("measurable"));
  a.criteria.forEach((k) => assert.ok(["policy", "measurable"].includes(k.kind), k.id));
});

test("CQ3 · Innensprache im oeffentlichen Text blockiert", () => {
  /* Der Befund, der die Datei ausgeloest hat: "27,35 von 30 Punkten
     aus der Trendstruktur" ist die Innenansicht unseres Rechenwegs. */
  const treffer = Q.innensprache(
    "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei, ATR bei Perzentil 43, z=1.62.");
  const ids = treffer.map((t) => t.id);
  assert.ok(ids.includes("enum-trend-structure"));
  assert.ok(ids.includes("atr"));
  assert.ok(ids.includes("percentile"));
  assert.ok(ids.includes("z-score"));

  /* Normaler Finanztext ist KEINE Innensprache — die Rubrik verbietet
     keine schwierigen Woerter, nur unsere eigenen Bezeichner. */
  assert.equal(Q.innensprache(
    "Der Kurs stieg in zwoelf Monaten um 47,6 Prozent.").length, 0);
});

test("CQ4 · Jedes Kriterium gehoert zu einer Flaeche", () => {
  /* Der erste Entwurf prueft Hook und Caption als einen Text und
     bewertete alle vier Varianten gleich — weil beide Ausschlaege die
     GEMEINSAME Caption trafen. Eine Rubrik, die Verschiedenes gleich
     bewertet, vergleicht nicht. */
  const a = Q.assess({ hook: "76 von 100 – und trotzdem nur.",
    caption: "Weil die Volatilitaet bremst.", story: STORY, evidenceRefs: ["score"] });
  a.criteria.forEach((k) =>
    assert.ok(["hook", "caption", "both"].includes(k.surface), k.id + ": " + k.surface));
  assert.ok(a.criteria.some((k) => k.surface === "hook"));
  assert.ok(a.criteria.some((k) => k.surface === "caption"));
});

test("CQ5 · Der Vergleich laeuft ueber das, was die Varianten unterscheidet", () => {
  /* Alle vier teilen sich eine Caption. Ihre Befunde belasten jede
     Variante gleich und duerfen die Rangfolge nicht verschlucken. */
  const b = Q.best(VARIANTEN, { caption: ERGEBNIS.caption, story: STORY });
  const hookWerte = b.assessed.map((x) => x.hookMet);
  assert.ok(new Set(hookWerte).size > 1,
    "Die Rubrik unterscheidet die Varianten nicht: " + hookWerte.join(","));
});

test("CQ6 · Keine der vier vorhandenen Varianten besteht", () => {
  /* Der reale Befund, festgehalten. Faellt er spaeter anders aus, ist
     entweder eine Variante dazugekommen oder die Huerde gesunken —
     beides soll auffallen. */
  const b = Q.best(VARIANTEN, { caption: ERGEBNIS.caption, story: STORY });
  assert.equal(b.ok, false);
  assert.equal(b.chosen, null);
  /* Jede scheitert am selben Kriterium: keiner traegt den Bogen. */
  b.assessed.forEach((x) => {
    const ct = x.assessment.criteria.find((k) => k.id === "concreteTension");
    assert.equal(ct.passed, false, "Variante " + (x.index + 1));
  });
});

test("CQ7 · Es wird keine 'am wenigsten schlechte' gewaehlt", () => {
  /* Die Grenze an das anzupassen, was gerade vorliegt, waere keine
     Qualitaetssicherung, sondern ihre Abschaffung. `closest` sagt, wer
     vorne laege — und ist ausdruecklich keine Auswahl. */
  const b = Q.best(VARIANTEN, { caption: ERGEBNIS.caption, story: STORY });
  assert.equal(b.chosen, null);
  assert.ok(b.closest, "Die Rangfolge soll trotzdem berichtet werden.");
  assert.equal(b.closest.index, 0);
  assert.match(b.explanation, /am wenigsten schlechte/);
});

test("CQ8 · Ein Hook mit dem Bogen besteht die Hook-Ebene", () => {
  /* Die Gegenprobe: die Rubrik ist erfuellbar. Waere sie es nicht,
     waere sie kein Gate, sondern eine Ablehnung mit Begruendung. */
  const a = Q.assess({
    hook: "47,6 % in zwoelf Monaten – und trotzdem nur 76 von 100.",
    caption: "Der Kurs liegt 47,6 % ueber dem Stand vor zwoelf Monaten. " +
      "Der Score bleibt dennoch bei 76 von 100, weil die Schwankungsbreite " +
      "nur 5 von 10 moeglichen Punkten erreicht. Quelle: Tiingo, " +
      "Stand 11.09.2026. Keine Anlageberatung.",
    story: STORY, evidenceRefs: ["momentum-12m", "score"] });

  const holen = (id) => a.criteria.find((k) => k.id === id);
  assert.equal(holen("scrollStop").passed, true);
  assert.equal(holen("curiosityGap").passed, true);
  assert.equal(holen("plainLanguageHook").passed, true);
  assert.equal(holen("concreteTension").passed, true, holen("concreteTension").finding);
  assert.equal(holen("plainLanguageCaption").passed, true);
  assert.equal(a.passed, true, a.explanation);
});

test("CQ9 · Eine fehlende Flaeche gilt nicht als bestanden", () => {
  /* Dieselbe Lehre wie im Transportvertrag: eine Pruefung, die nicht
     stattgefunden hat, ist keine bestandene Pruefung. */
  const a = Q.assess({ hook: "76 von 100 – und trotzdem.", caption: "",
    story: STORY, evidenceRefs: ["score"] });
  const cap = a.criteria.filter((k) => k.surface === "caption");
  assert.ok(cap.length > 0);
  cap.forEach((k) => assert.equal(k.passed, null, k.id));
  assert.equal(a.passed, false);
});

test("CQ10 · Ohne Story-Auswahl gilt die Spannung als ungeprueft", () => {
  const a = Q.assess({ hook: "76 von 100 – und trotzdem.", caption: "Weil X." });
  const ct = a.criteria.find((k) => k.id === "concreteTension");
  assert.equal(ct.passed, null);
  assert.equal(a.passed, false);
});

test("CQ11 · Die Obergrenze passt zu dem Befund, aus dem sie stammt", () => {
  /* Die Grenze ist aus der beanstandeten Caption abgeleitet, nicht
     gesetzt. Also muss genau diese Caption sie reissen — und zwar
     gemessen mit der Zaehlweise der Engine, nicht mit einer zweiten
     im Test. Zwei Zaehlweisen waeren zwei Wahrheiten, und die
     Ableitung liefe still auseinander.

     Genau das ist einmal passiert: das Ausklammern von Datumsangaben
     und Skalen senkte die Messung von 17,1 auf 12,7, und der
     Kommentar an der Konstanten stimmte nicht mehr. */
  const a = Q.assess({ hook: "x", caption: ERGEBNIS.caption });
  const k = a.criteria.find((x) => x.id === "informationDensity");
  assert.equal(k.passed, false,
    "Die beanstandete Caption muss oberhalb des Bandes liegen.");
  assert.match(k.finding, /Zahlendichte/);
  assert.ok(Q.DICHTE.zuDuenn < Q.DICHTE.zuDicht);
});

/* ------------------------------------------------------------------ */
/* INNENSPRACHE IST DIE FORMEL, NICHT DAS VERB                         */
/* ------------------------------------------------------------------ */

test("CQ21 · Ein Synonym laeuft nicht an der Beitragsformel vorbei", () => {
  /* Der Brief verbot "traegt X von Y Punkten bei". Zurueck kam
     "steuert 27,35 von 30 Punkten bei" - und bestand, weil das Muster
     am Verb hing statt an der Sache. Dieselbe Defektklasse wie ein
     Pruefer, der `byte_size` liest, waehrend `asset_byte_size`
     dasteht: das Muster war enger als der Sachverhalt. */
  const treffer = Q.innensprache(
    "Die Trendstruktur steuert 27,35 von 30 Punkten bei, die " +
    "Schwankungsbreite 5 von 10.");
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].id, "contribution-formula");

  /* Und mit dem urspruenglichen Verb weiterhin. */
  assert.equal(Q.innensprache("Die Trendstruktur traegt 27,35 von 30 Punkten bei.")
    .length, 1);
  assert.equal(Q.innensprache("Der Faktor fuegt 5 von 10 Punkten hinzu.").length, 1);
});

test("CQ22 · \"Punkten bei\" als Praeposition ist keine Innensprache", () => {
  /* Die Gegenrichtung, und die teurere: ein Muster, das jedes
     "Punkten bei" faengt, wiese korrekten Text zurueck. Das Partikel
     zaehlt nur am Satzglied-Ende, wo es eine Verbklammer schliesst. */
  assert.deepEqual(
    Q.innensprache("Im Vergleich zu 30 Punkten bei XOM liegt der Wert darunter."), []);
  assert.deepEqual(
    Q.innensprache("Der Gesamtwert 76 von 100 liegt im Band Konstruktiv, das ab 60 beginnt."), []);
  assert.deepEqual(Q.innensprache("XOM erreicht 76 von 100 Punkten."), []);
});
