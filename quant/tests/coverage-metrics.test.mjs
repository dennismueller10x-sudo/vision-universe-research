/* =========================================================================
   VISION UNIVERSE — coverage-metrics.test.mjs

   Drei Kennzahlen und ein Nenner.

   Die Tests greifen die Stelle an, an der die alte Zahl falsch war:
   eine Schwelle, die fuer eine andere Frage gedacht ist, und ein
   Nenner, der Titel enthaelt, die die Frage nicht beantworten koennen.

   MUTATIONSTESTS

   Zwei Wege, diese Rechnung schoenzurechnen, muessen auffallen:
   die Schwelle senken (CM12) und den Nenner leeren (CM13). Beide
   liefern eine huebschere Zahl und messen nichts mehr.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = require(join(root, "quant", "engines", "coverage-metrics.js"));

const TODAY = "2026-09-11";

/* Ein kleines, vollstaendig durchgerechnetes Universum. Jede Zeile
   steht fuer einen Fall, der in den echten Daten vorkommt. */
function fixture() {
  const universe = [
    { ticker: "OLDCO", startDate: "1995-01-03" },   /* alt, lange Historie  */
    { ticker: "MIDCO", startDate: "2018-06-01" },   /* alt, kurze Historie  */
    { ticker: "NEWCO", startDate: "2026-02-02" },   /* zu jung fuer 250 Bars */
    { ticker: "TINY",  startDate: "2026-08-20" },   /* zu jung, wenige Bars */
    { ticker: "GONE",  startDate: "2010-01-04" },   /* Anbieter hat nichts  */
    { ticker: "LOST",  startDate: "2010-01-04" },   /* fehlt unerklaert     */
    { ticker: "WRNTW", startDate: "2024-03-01" }    /* Warrant, ausgeschlossen */
  ];
  const stored = {
    OLDCO: { bars: 7800, first: "1995-01-03", last: "2026-09-10", bytes: 200000 },
    MIDCO: { bars: 180,  first: "2018-06-01", last: "2026-09-10", bytes: 4000 },
    NEWCO: { bars: 150,  first: "2026-02-02", last: "2026-09-10", bytes: 3000 },
    TINY:  { bars: 1,    first: "2026-08-20", last: "2026-08-20", bytes: 60 },
    WRNTW: { bars: 600,  first: "2024-03-01", last: "2026-09-10", bytes: 12000 }
  };
  const productEligible = { OLDCO: true, MIDCO: true, NEWCO: true, TINY: true,
                            GONE: true, LOST: true, WRNTW: false };
  const providerNoSeries = { GONE: true };
  return { universe, stored, productEligible, providerNoSeries, today: TODAY,
           chartMinBars: 2, technicalMinBars: 300, longHistoryMinBars: 250,
           minLongHistoryRate: 0.9 };
}

test("CM01 die drei Kennzahlen haben drei verschiedene Nenner", () => {
  const r = C.computeCoverage(fixture());
  /* Ablage verantwortet ALLES, was im Universum steht - auch den
     spaeter ausgeschlossenen Warrant: wir haben ihn geholt. */
  assert.equal(r.STORAGE_COVERAGE.denominator, 7);
  /* Chart und Technik fragen nur nach dem, was gezeigt werden soll. */
  assert.equal(r.CHART_AVAILABILITY.denominator, 6);
  assert.equal(r.TECHNICAL_HISTORY_ELIGIBILITY.denominator, 6);
});

test("CM02 STORAGE_COVERAGE trennt Anbieterluecke von echtem Verlust", () => {
  const r = C.computeCoverage(fixture()).STORAGE_COVERAGE;
  assert.equal(r.stored, 5);
  assert.equal(r.missing, 2);
  assert.equal(r.missingProviderUnavailable, 1);
  assert.equal(r.missingUnexplained, 1);
  assert.deepEqual(r.missingSymbols, ["LOST"]);
});

test("CM03 CHART_AVAILABILITY benutzt die Schwelle der Chart-Engine", () => {
  const r = C.computeCoverage(fixture()).CHART_AVAILABILITY;
  /* TINY hat genau eine Kerze und ist damit NICHT zeichenbar; NEWCO
     mit 150 Kerzen ist es sehr wohl - die alte Zahl haette beide
     zusammen als "nicht chartfaehig" gefuehrt. */
  assert.equal(r.renderable, 3);       /* OLDCO, MIDCO, NEWCO */
  assert.equal(r.notRenderable, 3);    /* TINY, GONE, LOST    */
  assert.deepEqual(r.notRenderableSymbols.sort(), ["GONE", "LOST", "TINY"]);
});

test("CM04 MUTATION: die Chartschwelle ist nicht die Technikschwelle", () => {
  /* Der eigentliche Fehler der 84,81 %: mit 250 statt 2 Bars
     gerechnet und CHART_READY genannt. Faellt jemand darauf zurueck,
     bricht dieser Test. */
  const f = fixture();
  const richtig = C.computeCoverage(f).CHART_AVAILABILITY.renderable;
  const falsch = C.computeCoverage({ ...f, chartMinBars: 250 }).CHART_AVAILABILITY.renderable;
  assert.equal(richtig, 3);
  assert.equal(falsch, 1);
  assert.notEqual(richtig, falsch,
    "Wer die Technikschwelle in die Chartfrage setzt, meldet 2 zeichenbare Titel zu wenig.");
});

test("CM05 TECHNICAL_HISTORY_ELIGIBILITY misst die Indikatorschwelle", () => {
  const r = C.computeCoverage(fixture()).TECHNICAL_HISTORY_ELIGIBILITY;
  assert.equal(r.eligible, 1);         /* nur OLDCO hat >= 300 Bars */
  assert.equal(r.tooShort, 5);
});

test("CM06 der Langhistoriennenner kennt das Listingalter", () => {
  const L = C.computeCoverage(fixture()).LONG_HISTORY;
  /* Drin: OLDCO, MIDCO, LOST. Draussen: NEWCO und TINY (zu jung),
     GONE (Anbieter), WRNTW (nicht im Produkt). */
  assert.equal(L.ELIGIBLE_FOR_LONG_HISTORY_CHECK, 3);
  assert.equal(L.notEligibleByReason.LISTING_TOO_YOUNG, 2);
  assert.equal(L.notEligibleByReason.PROVIDER_HAS_NO_SERIES, 1);
  assert.equal(L.notEligibleByReason.NOT_IN_PRODUCT_UNIVERSE, 1);
});

test("CM07 PASS, FAIL und Prozent rechnen auf diesem Nenner", () => {
  const L = C.computeCoverage(fixture()).LONG_HISTORY;
  assert.equal(L.PASS, 1);                                  /* OLDCO        */
  assert.equal(L.FAIL, 2);                                  /* MIDCO, LOST  */
  assert.equal(L.PASS + L.FAIL, L.ELIGIBLE_FOR_LONG_HISTORY_CHECK);
  assert.equal(L.LONG_HISTORY_COVERAGE_PERCENT, 33.33);
  assert.equal(L.ok, false);
});

test("CM08 ein zu junger Titel verschwindet nicht - er bekommt einen Grund", () => {
  const L = C.computeCoverage(fixture()).LONG_HISTORY;
  const draussen = Object.values(L.notEligibleByReason).reduce((a, b) => a + b, 0);
  assert.equal(draussen + L.ELIGIBLE_FOR_LONG_HISTORY_CHECK, L.universeSize,
    "Jedes Mitglied steht entweder im Nenner oder mit Grund daneben.");
});

test("CM09 das Mindestalter folgt aus der Barschwelle, nicht aus Gefuehl", () => {
  assert.equal(C.minCalendarDaysFor(250), 363);
  assert.equal(C.minCalendarDaysFor(300), 435);
  assert.equal(C.minCalendarDaysFor(0), 0);
});

test("CM10 ein Listing genau an der Altersgrenze ist drin", () => {
  const days = C.minCalendarDaysFor(250);
  const start = new Date(Date.parse(TODAY + "T00:00:00Z") - days * 86400000)
    .toISOString().slice(0, 10);
  const genau = C.longHistoryEligible({ startDate: start }, { today: TODAY, minBars: 250 });
  assert.equal(genau.eligible, true);
  const einTagZuJung = C.longHistoryEligible(
    { startDate: new Date(Date.parse(start + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) },
    { today: TODAY, minBars: 250 });
  assert.equal(einTagZuJung.eligible, false);
  assert.equal(einTagZuJung.reason, C.NOT_ELIGIBLE.LISTING_TOO_YOUNG);
});

test("CM11 ohne Startdatum wird nicht geraten", () => {
  const e = C.longHistoryEligible({ startDate: null }, { today: TODAY, minBars: 250 });
  assert.equal(e.eligible, false);
  assert.equal(e.reason, C.NOT_ELIGIBLE.START_DATE_UNKNOWN);
});

test("CM12 MUTATION: die Schwelle zu senken macht die Quote huebsch und leer", () => {
  /* Der ausdruecklich verbotene Weg: minHistoryCoverageRate von 0,9
     auf die gemessene Quote senken. Die Pruefung besteht dann immer -
     und misst nichts mehr. */
  const f = fixture();
  const echt = C.computeCoverage(f).LONG_HISTORY;
  const geschoent = C.computeCoverage({ ...f, minLongHistoryRate: 0.33 }).LONG_HISTORY;
  assert.equal(echt.ok, false);
  assert.equal(geschoent.ok, true);
  assert.equal(echt.LONG_HISTORY_COVERAGE_PERCENT, geschoent.LONG_HISTORY_COVERAGE_PERCENT,
    "Die gemessene Quote aendert sich dabei NICHT - nur das Urteil. " +
    "Genau deshalb ist das Senken der Schwelle keine Loesung.");
  assert.equal(echt.thresholdSource, "tiingo-scale.json:pass.minHistoryCoverageRate");
});

test("CM13 MUTATION: ein leerer Nenner ist kein bestandener Test", () => {
  const r = C.computeCoverage({ universe: [], stored: {}, today: TODAY });
  assert.equal(r.LONG_HISTORY.ELIGIBLE_FOR_LONG_HISTORY_CHECK, 0);
  assert.equal(r.LONG_HISTORY.LONG_HISTORY_COVERAGE_PERCENT, 0);
  assert.equal(r.LONG_HISTORY.ok, false,
    "Null von Null ist nicht 100 %. Wer nichts geprueft hat, hat nichts bestanden.");
});

test("CM14 ohne Eignungsschicht zaehlt jedes Mitglied als Produkttitel", () => {
  const f = fixture();
  delete f.productEligible;
  const r = C.computeCoverage(f);
  assert.equal(r.CHART_AVAILABILITY.denominator, 7);
  assert.equal(r.LONG_HISTORY.notEligibleByReason.NOT_IN_PRODUCT_UNIVERSE, undefined);
});

test("CM15 die alte Kennzahl bleibt als Vergleich stehen, nicht als Zusage", () => {
  const r = C.computeCoverage(fixture());
  assert.equal(r.legacy.denominator, 7);
  assert.equal(r.legacy.pass, 2);              /* OLDCO, WRNTW: >= 250 Bars */
  assert.equal(r.legacy.percent, 28.57);
  assert.ok(/nur noch zum Vergleich/.test(r.legacy.note));
});

test("CM16 die Schwellen stehen im Ergebnis, samt Herkunft", () => {
  const t = C.computeCoverage(fixture()).thresholds;
  assert.equal(t.chartMinBars, 2);
  assert.equal(t.technicalMinBars, 300);
  assert.equal(t.longHistoryMinBars, 250);
  assert.ok(t.chartMinBarsSource.includes("chart-ranges.js"));
  assert.ok(t.technicalMinBarsSource.includes("run-technical-scale.mjs"));
  assert.ok(t.longHistoryMinBarsSource.includes("tiingo-scale.json"));
});

test("CM17 die Schwellen des Skripts stammen aus den anwendenden Stellen", () => {
  /* Nicht die Rechnung, sondern ihre Herkunft: aendert jemand MIN_BARS
     in chart-ranges.js, muss diese Kennzahl mitgehen - nicht die
     Kennzahl eine eigene Zahl pflegen. */
  const chart = readFileSync(join(root, "quant", "engines", "chart-ranges.js"), "utf8");
  const m = chart.match(/var\s+MIN_BARS\s*=\s*(\d+)\s*;/);
  assert.ok(m, "chart-ranges.js muss MIN_BARS als Literal fuehren");
  assert.equal(parseInt(m[1], 10), 2);

  const tech = readFileSync(join(root, "scripts", "technical", "run-technical-scale.mjs"), "utf8");
  const t = tech.match(/const\s+MIN_BARS\s*=[^;]*?"(\d+)"/);
  assert.ok(t, "run-technical-scale.mjs muss MIN_BARS als Literal fuehren");
  assert.equal(parseInt(t[1], 10), 300);

  const scale = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));
  assert.equal(scale.pass.historyCoverageMinBars, 250);
  assert.equal(scale.pass.minHistoryCoverageRate, 0.9,
    "Die Schwelle darf nicht gesenkt worden sein - der Nenner war das Thema, nicht sie.");
});

test("CM18 ein ausgeschlossener Titel behaelt seine Ablagedeckung", () => {
  /* Die Zusage des Aufraeumens in einer Zahl: der Warrant faellt aus
     Chart und Technik, aber NICHT aus der Ablage. Seine Historie
     bleibt - geloescht wird nichts. */
  const r = C.computeCoverage(fixture());
  assert.ok(!r.CHART_AVAILABILITY.notRenderableSymbols.includes("WRNTW"));
  assert.equal(r.STORAGE_COVERAGE.stored, 5);
  assert.ok(!r.STORAGE_COVERAGE.missingSymbols.includes("WRNTW"));
});
