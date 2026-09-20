/* =========================================================================
   VU SOCIAL — Was ein Beitrag behaupten darf (CC1–CC10)

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Der erste echte Kandidat las sich so:

     Hook:    "Warum bewegt sich XOM gerade?"
     Caption: "Der Grund liegt in den Daten: Technical Opportunity Score
               steht bei 76. Das erklaert die Bewegung, weil sich daran
               ablesen laesst, wie sich die Lage gegenueber dem
               Vorzeitraum veraendert hat."

   Der Text erklaert nichts. Er nennt eine Zahl und stellt das Wort
   "Grund" davor. Die Frage der Hook bleibt unbeantwortet.

   Die Markenpruefung liess das durch, weil sie auf das WORT "Grund"
   prueft — eine Hook-Einloesung, die an einem Wort haengt, ist auch an
   einem Wort zu haben. Deterministisch feststellen, ob ein Text
   wirklich erklaert, kann diese Pruefung nicht, und sie soll es nicht
   vortaeuschen.

   Die Loesung liegt deshalb eine Stufe frueher: die Vorlage stellt die
   Frage gar nicht erst. Was sie sieht, ist eine Kennzahl mit Wert und
   Quelle — kein Anlass, kein Trend, keine Ursache. Also spricht sie von
   einer Kennzahl.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Content = require("../engines/content.js");
const Brand = require("../engines/brand.js");

const QUELLE = {
  source: "vu.technical", provider: "vu-technical-intelligence",
  entity: "XOM", metric: "Technical Opportunity Score", value: 76, unit: null,
  observedAt: "2026-09-16T00:00:00Z", state: "VERIFIED"
};

function teile() {
  const w = Content.createTemplateWriter({});
  const opportunity = { topic: "Technisches Setup — XOM" };
  const research = Content.research(opportunity, [QUELLE]);
  const thesis = w.thesis(opportunity, research.data);
  const hook = w.hook(opportunity, { text: thesis }, research.data);
  const draft = w.draft(opportunity, { research: research.data });
  return { opportunity, research: research.data, thesis, hook, draft };
}

test("CC1 · Die Hook fragt nicht nach dem Warum", () => {
  /* Weil die Daten kein Warum hergeben. Eine Frage, die der Text nicht
     beantworten kann, ist Clickbait — auch in sachlichem Ton. */
  const { hook } = teile();
  assert.ok(!/\bwarum\b/i.test(hook), "Hook fragt nach dem Warum: " + hook);
  assert.ok(!/\bweshalb\b/i.test(hook));
});

test("CC2 · Die Caption behauptet keine Erklaerung", () => {
  const { draft } = teile();
  assert.ok(!/erklaert die Bewegung/i.test(draft.caption), draft.caption);
  assert.ok(!/der Grund liegt/i.test(draft.caption), draft.caption);
});

test("CC3 · Die Caption sagt, was die Zahl NICHT sagt", () => {
  /* Der wichtigste Satz. Eine Kennzahl ohne ihre Grenze liest sich wie
     eine Aussage ueber die Zukunft — und genau das ist sie nicht. */
  const { draft } = teile();
  assert.match(draft.caption, /nicht\s+ihre\s+Ursache/i);
  assert.match(draft.caption, /was\s+als\s+n\u00E4chstes/i);
});

test("CC4 · Hook und Caption nennen dieselbe Zahl", () => {
  const { hook, draft } = teile();
  assert.match(hook, /76/);
  assert.match(draft.caption, /76/);
});

test("CC5 · Die These ist eine Lagebeschreibung, keine Prognose", () => {
  const { thesis } = teile();
  assert.match(thesis, /Lagebeschreibung/i);
  assert.match(thesis, /keine Prognose/i);
});

test("CC6 · Jede Zahl im Text hat ihren Beleg", () => {
  /* Das war schon vorher so und bleibt der Kern: eine Zahl ohne
     sourceRef ist eine erfundene Zahl in Markenoptik. */
  const { draft } = teile();
  assert.ok(draft.claims.length >= 2);
  const mitZahl = draft.claims.find((c) => c.numeric !== null);
  assert.equal(mitZahl.source.source, "vu.technical");
  assert.equal(mitZahl.numeric, 76);
});

/* ------------------------------------------------------------------ */
/* DER PFLICHTHINWEIS                                                  */
/* ------------------------------------------------------------------ */

test("CC7 · Einzelwert plus Zahl ohne Hinweis wird blockiert", () => {
  /* Ein Beitrag, der ein einzelnes Wertpapier benennt und ihm eine Zahl
     zuordnet, liest sich fuer ein Publikum wie eine Empfehlung —
     unabhaengig davon, wie sachlich er formuliert ist. */
  const b = Brand.check({
    hook: "XOM: 76 im Score.",
    caption: "Unsere Auswertung bewertet XOM derzeit mit 76 im Technical Opportunity " +
      "Score. Der Wert beschreibt die aktuelle Lage und sonst nichts weiter dazu.",
    thesis: "XOM steht bei 76."
  });
  assert.equal(b.passed, false);
  assert.ok(b.blocking.some((x) => x.id === "missing-disclaimer"));
});

test("CC8 · Mit Hinweis geht es durch", () => {
  const b = Brand.check({
    hook: "XOM: 76 im Score.",
    caption: "Unsere Auswertung bewertet XOM derzeit mit 76 im Technical Opportunity " +
      "Score. Der Wert beschreibt die aktuelle Lage. Keine Anlageberatung.",
    thesis: "XOM steht bei 76."
  });
  assert.ok(!b.blocking.some((x) => x.id === "missing-disclaimer"));
});

test("CC9 · Blockierend, nicht warnend", () => {
  /* Eine Warnung in einem automatischen Pfad erreicht niemanden. */
  const b = Brand.check({
    hook: "AAPL: 65.", caption: "AAPL liegt bei 65 Punkten in unserer Auswertung " +
      "und das ist der Stand von heute frueh, mehr steht dazu nicht fest.",
    thesis: "x" });
  assert.ok(b.blocking.some((x) => x.id === "missing-disclaimer"));
  assert.ok(!b.warnings.some((x) => x.id === "missing-disclaimer"));
});

test("CC10 · Die Vorlage erzeugt einen Text, der die Markenpruefung besteht", () => {
  /* Der Zusammenhang, auf den es ankommt: was die Vorlage schreibt, muss
     durch das Tor passen, das davor steht. Sonst gibt es entweder keinen
     Beitrag oder ein aufgeweichtes Tor. */
  const { draft, hook, thesis } = teile();
  const b = Brand.check({ hook, caption: draft.caption, thesis, cta: draft.cta });
  assert.equal(b.passed, true, JSON.stringify(b.blocking));
});

/* =========================================================================
   CC11–CC14 — DER VEROEFFENTLICHTE TEXT IST NICHT DER QUELLTEXT

   Der Quelltext dieses Repositories ist ASCII, und das ist richtig: er
   laeuft durch Shells, Workflows und Editoren, deren Kodierung niemand
   garantiert.

   Der veroeffentlichte Text ist etwas anderes. "Fuer jeden Titel" auf
   einem deutschen Markenkonto sieht aus, als haette es eine Maschine
   geschrieben, die kein Deutsch kann — und genau das waere es dann auch.
   Der erste gerenderte Kandidat trug es im Bild.
   ========================================================================= */

test("CC11 · Umschriebene Umlaute blockieren den Beitrag", () => {
  const b = Brand.check({
    hook: "Ein Hook.",
    caption: "Wir veroeffentlichen das Ergebnis unveraendert fuer jeden Titel, " +
      "und mehr steht dazu bis auf Weiteres nicht fest.",
    thesis: "t"
  });
  const treffer = b.blocking.find((x) => x.id === "transliterated-umlauts");
  assert.ok(treffer, "nicht erkannt");
  assert.match(treffer.message, /veroeffentlichen/);
  assert.match(treffer.message, /fuer/);
});

test("CC12 · Mit echten Umlauten geht derselbe Satz durch", () => {
  const b = Brand.check({
    hook: "Ein Hook.",
    caption: "Wir veröffentlichen das Ergebnis unverändert für jeden Titel, " +
      "und mehr steht dazu bis auf Weiteres nicht fest.",
    thesis: "t"
  });
  assert.ok(!b.blocking.some((x) => x.id === "transliterated-umlauts"));
});

test("CC13 · Woerter mit echtem 'ue' werden nicht getroffen", () => {
  /* "ue" gehoert in "Museum" und in "neue". Eine allgemeine Regel
     wuerde entweder diese Woerter treffen oder gar nichts — deshalb
     eine Liste, die faengt, was sie kennt, und nichts darueber hinaus
     behauptet. */
  const b = Brand.check({
    hook: "Ein Hook.",
    caption: "Neue Daten aus dem Museum der Statistik, und die Steuerung bleibt " +
      "unverändert bestehen wie zuvor auch schon.",
    thesis: "t"
  });
  assert.ok(!b.blocking.some((x) => x.id === "transliterated-umlauts"),
    JSON.stringify(b.blocking));
});

test("CC14 · Alle Varianten des Autors sind sauberes Deutsch", () => {
  /* Der Zusammenhang, auf den es ankommt: was der Autor schreibt, muss
     durch das Tor passen, das davor steht. */
  const Brief = require("../engines/content-brief.js");
  const Template = require("../providers/authoring/template/adapter.js");

  const brief = Brief.build({
    opportunity: { topic: "Technisches Setup — XOM", premise: "SECURITY_METRIC",
      hasCause: false },
    strategyDecision: { archetype: "STOCK_STORY" },
    evidence: [{ entity: "XOM", metric: "Technical Opportunity Score", value: 76,
      source: { source: "vu.technical", observedAt: "2026-09-16T00:00:00Z",
                state: "VERIFIED" } }]
  });

  for (const v of Template.createTemplateAuthor({}).write(brief, {}).variants) {
    const b = Brand.check({ hook: v.hook, caption: v.caption, cta: v.cta,
      hashtags: v.hashtags });
    assert.ok(!b.blocking.some((x) => x.id === "transliterated-umlauts"),
      v.pattern + ": " + JSON.stringify(b.blocking));
  }
});
