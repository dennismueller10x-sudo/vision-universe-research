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
const German = require("../engines/german-text.js");

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
     wie eine Chance aussieht.

     "methodischer Rang" (die urspruengliche Formulierung von
     score-not-probability) steht in INTERN_NICHT_IM_HOOK
     (audience-frame.js) - AUDIENCE_SEPARATION entfernte den Satz aus
     jedem oeffentlichen Text, genau wie "Setup-Rang" den Satz von
     score-meaning entfernt. Ein Bare-Ticker-Thema blieb damit
     strukturell ohne jede ueberlebende Einordnung, und
     EVIDENCE_SUFFICIENCY verwarf es immer - unabhaengig vom Bundle.
     "ordnet ein, prognostiziert nicht" traegt dieselbe Bedeutung, ohne
     den verbotenen Begriff - die Stimme, die der reale MSFT-Hook
     (PR #179) fuer denselben Sachverhalt bereits nutzt. */
  const bedeutung = PAKET.evidence.filter((e) =>
    e.id === "score-meaning" || e.id === "score-not-probability");
  assert.equal(bedeutung.length, 2);
  const text = bedeutung.map((e) => e.statement).join(" ");
  assert.match(text, /Keine Wahrscheinlichkeit/);
  assert.match(text, /ordnet ein, er prognostiziert nicht/);
  assert.doesNotMatch(text, /methodischer Rang/,
    "methodischer Rang steht in INTERN_NICHT_IM_HOOK - dieser Satz muss ohne ihn auskommen");
});

test("EP3 · Der Score zerlegt sich in seine Beitraege", () => {
  /* Ohne das ist eine Punktzahl eine Meinung mit Nachkommastelle. */
  const beitraege = PAKET.evidence.filter((e) => e.id.startsWith("score-contribution-"));
  assert.ok(beitraege.length >= 5);
  assert.match(beitraege.map((e) => e.statement).join(" "),
    /TREND_STRUCTURE tr\u00e4gt .* von 30/);
});

test("EP4 \u00b7 Die Belegsaetze der Engines werden uebernommen, nicht neu formuliert", () => {
  /* Sie neu zu formulieren hiesse, eine zweite Lesart derselben Zahl zu
     erzeugen.

     Uebernommen heisst seit der Schreibungs-Reparatur: bis auf die
     Orthografie. "Kurs ueber SMA50" wird zu "Kurs <ue>ber SMA50" —
     dieselbe Aussage, dieselben Zahlen, deutsche Schreibung. Dass
     wirklich NUR das passiert ist, steht in statementVerbatim: der
     unveraenderte Engine-Satz reist mit, wo sich etwas geaendert hat. */
  const trend = PAKET.evidence.filter((e) => e.dimension === "TREND");
  const original = (BUNDLE.trend.evidence || []).map((e) => e.statement);

  const uebernommen = trend.filter((e) =>
    original.includes(e.statement) || original.includes(e.statementVerbatim));
  assert.ok(uebernommen.length >= 3, "die Engine-Saetze fehlen");

  /* Und der Beweis, dass die Reparatur nichts weiter angefasst hat. */
  for (const e of trend) {
    if (!e.statementVerbatim) continue;
    assert.equal(German.normalize(e.statementVerbatim), e.statement,
      e.id + ": die Aenderung ist mehr als Orthografie");
    assert.deepEqual(
      (e.statementVerbatim.match(/[0-9]+(?:\.[0-9]+)?/g) || []),
      (e.statement.match(/[0-9]+(?:\.[0-9]+)?/g) || []),
      e.id + ": die Zahlen haben sich geaendert");
  }
});

test("EP4b \u00b7 Kein Belegsatz traegt unbekannte Umschrift", () => {
  /* Was das Woerterbuch nicht kennt, wird nicht geraten. Es wird
     gemeldet — und hier faellt auf, wenn es jemand gemeldet und dann
     liegen gelassen hat. */
  const offen = PAKET.evidence.filter((e) => e.statementResidue);
  assert.deepEqual(offen.map((e) => e.id + ": " + e.statementResidue.join(",")), [],
    "unbekannte Umschrift in den Belegsaetzen");
});

test("EP5 · Jede Aussage traegt Quelle, Stand und Zeiger", () => {
  for (const e of PAKET.evidence) {
    assert.ok(e.source, e.id + " ohne Quelle");
    assert.ok(e.observedAt, e.id + " ohne Stand");
    assert.ok(e.pointer, e.id + " ohne Zeiger ins Bundle");
  }
});

test("EP6 · Die Datengrundlage ist selbst eine Aussage", () => {
  /* Hier stand "/2940 Handelstage/". Die Zahl waechst mit jedem
     Handelstag, den die Quant-Schicht dazulernt - beim naechsten
     Datenstand waren es 2944, und der Test war rot, ohne dass sich am
     Code etwas geaendert haette. Eine eingefrorene Zahl aus einem
     wachsenden Bestand prueft nicht die Aussage, sondern den
     Stichtag.

     Geprueft gehoert die FORM der Aussage und dass die Zahl aus dem
     Bundle stammt - nicht ihr Wert. */
  const basis = PAKET.evidence.find((e) => e.id === "data-basis");
  assert.ok(basis);
  const m = /(\d+) Handelstage seit (\d{4}-\d{2}-\d{2})/.exec(basis.statement);
  assert.ok(m, "Die Datengrundlage nennt Handelstage und Startdatum: " +
    basis.statement);
  assert.equal(Number(m[1]), BUNDLE.analysisLookback.bars,
    "Die genannte Zahl stammt nicht aus dem Bundle");
  assert.equal(m[2], BUNDLE.analysisLookback.from,
    "Das genannte Startdatum stammt nicht aus dem Bundle");
  assert.ok(Number(m[1]) > 0);
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
  assert.match(hinweis.map((e) => e.statement).join(" "),
    /Relative St\u00e4rke nicht verf\u00fcgbar/);
});

/* ------------------------------------------------------------------ */
/* DIE BINDUNG                                                         */
/* ------------------------------------------------------------------ */

test("EP10 · Ein Text aus den Belegen besteht das Claim Binding", () => {
  /* -----------------------------------------------------------------
     KEINE EINGEFRORENE ZAHL AUS EINEM WACHSENDEN BESTAND

     Hier standen 76, 27.35 und 47.6 - die XOM-Werte vom Tag, an dem
     der Test geschrieben wurde. Mit dem naechsten Datenstand steht
     dort 52 und 27.26, und der Test war rot, ohne dass sich am Code
     etwas geaendert haette. Das prueft den Stichtag, nicht das Claim
     Binding.

     Ein Autor zitiert das, was im Paket steht. Genau das tut dieser
     Satz jetzt auch. */
  const satz = (id) => PAKET.evidence.find((e) => e.id === id).statement;
  const text = [satz("score"), satz("score-contribution-trend_structure"),
    satz("price-close"), satz("data-basis")].join(" ");
  const r = CB.check(text, PAKET.evidence, {});
  assert.equal(r.ok, true, r.explanation);
  /* Und die Gegenprobe, damit das nicht zu einem Test wird, der
     alles besteht: eine Zahl, die NICHT im Paket steht, faellt auf. */
  const erfunden = CB.check(text + " Die relative Staerke liegt bei 88.",
    PAKET.evidence, {});
  assert.equal(erfunden.ok, false);
});

test("EP11 · Zahlen aus einem Belegsatz gelten als belegt", () => {
  /* Die Engines liefern fertige Saetze wie "Kurs ueber SMA50 (3.05
     ATR)". Nur den `value` zu decken hiesse, einen Autor fuer das
     Zitieren eines Belegs zu bestrafen — und je reicher die Evidenz,
     desto mehr angeblich unbelegte Zahlen. */
  /* Auch hier stammt der Satz aus dem Paket statt aus der
     Erinnerung: "3.05 ATR" war der Wert von damals. */
  const sma = PAKET.evidence.find((e) => e.id === "trend-SMA50");
  assert.ok(sma, "kein SMA50-Beleg im Paket");
  assert.match(sma.statement, /ATR/, "der Belegsatz nennt keinen ATR-Abstand");
  const r = CB.check(sma.statement + ".", PAKET.evidence, {});
  assert.equal(r.ok, true, r.explanation);
});

test("EP12 · Eine erfundene Zahl faellt trotz reicher Evidenz auf", () => {
  /* 76 war der Score von damals; der belegte Teil kommt jetzt aus
     dem Paket, der erfundene bleibt erfunden. */
  const r = CB.check(PAKET.evidence.find((e) => e.id === "score").statement +
    " Die relative Staerke liegt bei 88.", PAKET.evidence, {});
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

test("EP17 · Die Einordnung ueberlebt AUDIENCE_SEPARATION", () => {
  /* Der reale Befund (MANUAL_TOPIC MSFT, Lauf #42/#43, 2026-09-23):
     themaAusBundle() (run-social-cycle.mjs) filtert paket.evidence vor
     dem Sufficiency-Test durch AudienceFrame.INTERN_NICHT_IM_HOOK -
     dieselbe Wache, die einmal "Technical Opportunity Score" aus einem
     oeffentlichen Hook entfernte. score-meaning traegt "Setup-Rang"
     woertlich aus dem Bundle-Disclaimer und faellt dieser Wache
     zuverlaessig zum Opfer; score-not-probability trug bis zu diesem
     Test-Update "methodischer Rang" und fiel ihr ebenso zum Opfer -
     BEIDE Traeger der Einordnung verschwanden, EVIDENCE_SUFFICIENCY
     verwarf jedes Bare-Ticker-Thema, unabhaengig vom Bundle. Der Test
     laeuft gegen das echte XOM-Bundle wie der Rest dieser Datei - kein
     nachgebautes Paket, das nur sich selbst beweist. */
  const AF = require("../engines/audience-frame.js");
  const oeffentlich = PAKET.evidence.filter((e) =>
    !AF.INTERN_NICHT_IM_HOOK.some((begriff) =>
      String(e.statement || "").includes(begriff)));
  const s = EP.assessSufficiency(Object.assign({}, PAKET, { evidence: oeffentlich }));
  assert.equal(s.sufficient, true, s.explanation);
});
