/* =========================================================================
   Eine widerlegte Gesamtrendite-Spalte sperrt die Gesamtrendite -
   nicht eine Reihe, die splitbereinigt rekonstruierbar ist.

   Der Anlass (Owner-Frage vom 2026-09-25): SPY war als TOTAL_RETURN
   deklariert, verhielt sich an einem Ex-Tag nicht so, wurde abgelehnt -
   und mit der fehlenden Vergleichsreihe fiel die relative Staerke von
   6.267 Titeln aus. Die relative Staerke verlangt seit Option C den
   splitbereinigten Kurs; sie hat mit der Dividendenbereinigung nichts zu
   tun und darf nicht an ihr haengen.

   Was diese Datei beweist:
     1. Die Pruefung selbst ist unveraendert (derselbe Befund, derselbe Code).
     2. Der fehlende Eingang wird benannt, nicht umschrieben.
     3. Die rekonstruierte Reihe kommt NIE aus der widerlegten Spalte.
     4. Gesamtrendite bleibt fuer diese Reihe gesperrt.
     5. Ein spaeterer Split veraendert keine frueher gerechnete Rendite.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Quality = require("../engines/market-quality.js");
const Semantics = require("../engines/price-semantics.js");
const ReturnSemantics = require("../engines/return-semantics.js");
const Series = require("../engines/return-series.js");
const Factors = require("../engines/market-factors.js");

const TOKEN = Semantics.RECONSTRUCTIBLE;

/* --------------------------------------------------------- Fixtures */

/** Eine lange, saubere Reihe: Rohkurs, Splitfaktor, aufsteigende Tage. */
function reihe(n, options) {
  const o = options || {};
  const out = [];
  let tag = Date.UTC(2023, 0, 2);
  for (let i = 0; i < n; i++) {
    const datum = new Date(tag).toISOString().slice(0, 10);
    const close = 100 + i * 0.1;
    out.push({
      date: datum, open: close, high: close, low: close, close,
      /* Bewusst eine ANDERE Spalte: wer sie benutzt, faellt hier auf. */
      adjustedClose: o.withAdjusted === false ? null : close * 0.8,
      volume: 1e6, splitFactor: 1, dividend: 0, securityId: "ref_TEST"
    });
    tag += 86400000 * (i % 5 === 4 ? 3 : 1);   /* Wochenenden ueberspringen */
  }
  return out;
}

/* Das gemischte Fenster aus increment-adjustment-window.test.mjs: der
   gespeicherte Vortag traegt die Bereinigung des vorigen Laufs, der Ex-Tag
   die von heute. Der Pruefer meldet zurecht, die Ausschuettung sei nicht
   eingerechnet. */
const bar = (date, close, adjustedClose, dividend = 0, splitFactor = 1) => ({
  date, open: close, high: close, low: close, close,
  adjustedClose, volume: 1e6, splitFactor, dividend
});
const DIVIDENDEN_FENSTER = [bar("2026-09-17", 100, 100), bar("2026-09-18", 98.5, 98.5, 1.5),
                            bar("2026-09-21", 99, 99)];
/* Der andere Fall: am Splittag springt auch die BEREINIGTE Spalte mit -
   sie hat den Split also nicht herausgerechnet. Hier steht die
   Splitbereinigung selbst in Frage und damit die Rekonstruktion. */
const SPLIT_FENSTER = [bar("2026-09-17", 400, 400), bar("2026-09-18", 100, 100, 0, 4),
                       bar("2026-09-21", 101, 101)];

const dividendenUrteil = () => Quality.validateAdjustmentConsistency(
  DIVIDENDEN_FENSTER, { claimedStatus: "TOTAL_RETURN" });

/* ------------------------------------- 1. Die Pruefung ist unveraendert */

test("TOTAL_RETURN_VALIDATION_UNCHANGED: derselbe Befund, derselbe Code", () => {
  const urteil = dividendenUrteil();
  assert.equal(urteil.ok, false);
  const codes = urteil.findings.map((f) => f.code);
  assert.ok(codes.includes("dividend_not_in_adjusted"));
  assert.ok(codes.includes("adjustment_status_contradicted"));
  assert.equal(urteil.observed.refutedAbove, "SPLIT_ADJUSTED");
});

test("die Qualitaetspruefung kennt den Rueckfall nicht", () => {
  /* Der Beweis, dass nichts gelockert wurde: market-quality.js enthaelt
     das Vokabular des Rueckfalls nicht. Wer die Pruefung spaeter
     "hilfsbereit" machen will, aendert diesen Test mit - und sieht im
     Diff, was er tut. */
  const quelle = readFileSync(new URL("../engines/market-quality.js", import.meta.url), "utf8");
  assert.ok(!quelle.includes(TOKEN));
  assert.ok(!quelle.includes("fallbackDeclaration"));
});

/* --------------------------------- 2. Der fehlende Eingang wird benannt */

test("vollstaendige Eingaben: konstruierbar", () => {
  const messung = Series.splitAdjustedInputs(reihe(300));
  assert.equal(messung.constructible, true);
  assert.deepEqual(messung.missing, []);
  assert.equal(messung.bars, 300);
});

test("jeder fehlende Eingang wird mit Namen gemeldet", () => {
  const ohneClose = reihe(300); ohneClose[17].close = null;
  assert.deepEqual(Series.splitAdjustedInputs(ohneClose).missing, ["RAW_CLOSE"]);
  assert.deepEqual(Series.splitAdjustedInputs(ohneClose).rawCloseMissingAt, [ohneClose[17].date]);

  const ohneFaktor = reihe(300); delete ohneFaktor[42].splitFactor;
  assert.deepEqual(Series.splitAdjustedInputs(ohneFaktor).missing, ["SPLIT_FACTOR"]);

  const falscheTage = reihe(300); falscheTage[8].date = falscheTage[6].date;
  assert.deepEqual(Series.splitAdjustedInputs(falscheTage).missing, ["TRADING_DATES"]);

  assert.deepEqual(Series.splitAdjustedInputs(reihe(100)).missing, ["HISTORY"]);
  assert.deepEqual(Series.splitAdjustedInputs([]).missing, ["NO_BARS"]);

  /* Mehrere fehlende Eingaben werden auch mehrfach genannt - "irgendwas
     fehlt" waere fuer einen Bericht nichts wert. */
  const mehreres = reihe(100); mehreres[3].close = 0;
  assert.deepEqual(Series.splitAdjustedInputs(mehreres).missing, ["RAW_CLOSE", "HISTORY"]);
});

/* ------------------------------------------ 3. Die Entscheidung selbst */

test("Dividendenfehler plus vollstaendige Bausteine: splitbereinigt weiterfuehren", () => {
  const entscheidung = Semantics.fallbackDeclaration(
    dividendenUrteil(), Series.splitAdjustedInputs(reihe(300)));
  assert.equal(entscheidung.allowed, true);
  assert.equal(entscheidung.declare, TOKEN);
  assert.equal(entscheidung.level, "SPLIT_ADJUSTED");
  assert.deepEqual(entscheidung.blocks, ["TOTAL_RETURN"]);
  assert.equal(entscheidung.refutedClaim, "TOTAL_RETURN");
});

test("ein widerlegter SPLIT kennt keinen Rueckfall", () => {
  /* Die Grenze der Trennung: ist die Splitbereinigung widerlegt, steht der
     Splitfaktor selbst in Frage - und damit die Rekonstruktion. */
  const urteil = Quality.validateAdjustmentConsistency(
    SPLIT_FENSTER, { claimedStatus: "TOTAL_RETURN" });
  assert.equal(urteil.observed.refutedAbove, "RAW");
  const entscheidung = Semantics.fallbackDeclaration(
    urteil, Series.splitAdjustedInputs(reihe(300)));
  assert.equal(entscheidung.allowed, false);
  assert.equal(entscheidung.reason, "SPLIT_ADJUSTMENT_ITSELF_REFUTED");
});

test("unvollstaendige Bausteine: Ablehnung mit benanntem Eingang", () => {
  const entscheidung = Semantics.fallbackDeclaration(
    dividendenUrteil(), Series.splitAdjustedInputs(reihe(100)));
  assert.equal(entscheidung.allowed, false);
  assert.equal(entscheidung.reason, "SPLIT_ADJUSTED_INPUTS_INCOMPLETE");
  assert.deepEqual(entscheidung.detail, ["HISTORY"]);
});

test("ein zweiter Fehler schliesst den Rueckfall aus", () => {
  const urteil = dividendenUrteil();
  urteil.findings.push({ severity: "error", code: "suspected_unadjusted_split", message: "x" });
  const entscheidung = Semantics.fallbackDeclaration(
    urteil, Series.splitAdjustedInputs(reihe(300)));
  assert.equal(entscheidung.allowed, false);
  assert.equal(entscheidung.reason, "OTHER_ERRORS_PRESENT");
});

test("eine unauffaellige Reihe bekommt keinen Rueckfall angeboten", () => {
  const sauber = Quality.validateAdjustmentConsistency(
    [bar("2026-09-17", 100, 98.5), bar("2026-09-18", 98.5, 98.5, 1.5), bar("2026-09-21", 99, 99)],
    { claimedStatus: "TOTAL_RETURN" });
  assert.equal(sauber.ok, true);
  assert.equal(Semantics.fallbackDeclaration(sauber, Series.splitAdjustedInputs(reihe(300))).reason,
               "NOT_REFUTED");
});

/* ------------------- 4. Die Reihe kommt nie aus der widerlegten Spalte */

test("SPY_SPLIT_ADJUSTED_BENCHMARK: rekonstruiert, obwohl adjustedClose vorliegt", () => {
  const bars = reihe(300);
  /* Ein Split in der Reihe, damit die Rekonstruktion ueberhaupt etwas tut. */
  bars[200].splitFactor = 4;
  const serie = Factors.priceSeries(bars, TOKEN, "relativeStrengthBenchmark");
  assert.equal(serie.basis, "SPLIT_ADJUSTED_PRICE");
  assert.equal(serie.source, "RECONSTRUCTED_FROM_SPLIT_FACTOR");
  assert.equal(serie.column, "close");

  /* Wortgleich mit der kanonischen Rekonstruktion - nicht "aehnlich". */
  const kanonisch = Series.splitAdjustedColumn(bars, "close");
  serie.close.forEach((v, i) => assert.equal(v, kanonisch[i]));

  /* Und ausdruecklich NICHT die widerlegte Spalte. */
  assert.notEqual(serie.close[0], bars[0].adjustedClose);
});

test("dieselbe Reihe als 'splitAdjusted' deklariert nimmt die Spalte - der Unterschied ist die Deklaration", () => {
  /* Die Gegenprobe: ohne den Rueckfall-Token greift der bisherige Pfad.
     Waere der Token nur Kosmetik, waere hier kein Unterschied. */
  const bars = reihe(300);
  bars[200].splitFactor = 4;
  const alsSplitbereinigt = Factors.priceSeries(bars, "splitAdjusted", "relativeStrengthBenchmark");
  assert.equal(alsSplitbereinigt.source, "PROVIDER_SPLIT_ADJUSTED_COLUMN");
  const alsRueckfall = Factors.priceSeries(bars, TOKEN, "relativeStrengthBenchmark");
  assert.equal(alsRueckfall.source, "RECONSTRUCTED_FROM_SPLIT_FACTOR");
  assert.notEqual(alsSplitbereinigt.close[0], alsRueckfall.close[0]);
});

test("ohne Bausteine verweigert die Reihe den Dienst statt auszuweichen", () => {
  const bars = reihe(300);
  delete bars[5].splitFactor;
  assert.throws(() => Factors.priceSeries(bars, TOKEN, "relativeStrengthBenchmark"),
                (e) => e.reason === "SPLIT_ADJUSTED_PRICE_NOT_CONSTRUCTIBLE");
});

/* ------------------------------ 5. Gesamtrendite bleibt gesperrt */

test("die Anlegerrendite ist fuer diese Reihe nicht verfuegbar", () => {
  const investor = Factors.investorReturn(reihe(300), TOKEN);
  assert.notEqual(investor.state, "AVAILABLE");
  assert.deepEqual(investor.returns, {});
});

test("der Vertrag verweigert die Gesamtrendite-Spalte", () => {
  assert.equal(ReturnSemantics.basisOfAdjustmentStatus(TOKEN), "RAW_PRICE");
  const aufgeloest = ReturnSemantics.resolveColumn("investorReturnEvidence", TOKEN, true);
  assert.equal(aufgeloest.ok, false);
  assert.equal(aufgeloest.reason, ReturnSemantics.MISMATCH);
  assert.equal(ReturnSemantics.resolveColumn("backtest", TOKEN, true).ok, false);
});

test("die Stufenpruefung laesst splitbereinigte Kennzahlen zu und Gesamtrendite nicht", () => {
  assert.equal(Semantics.normalize(TOKEN), "SPLIT_ADJUSTED");
  assert.equal(Semantics.check("relative_strength", TOKEN).allowed, true);
  assert.equal(Semantics.check("momentum", TOKEN).allowed, true);
  assert.equal(Semantics.check("total_return", TOKEN).allowed, false);
  assert.equal(Semantics.check("cagr", TOKEN).allowed, false);
  assert.equal(Semantics.check("backtest_evidence", TOKEN).allowed, false);
});

/* -------------------------------------------- 6. Keine Future Leakage */

test("ein spaeterer Split veraendert keine frueher gerechnete Rendite", () => {
  /* Die Rekonstruktion rechnet rueckwaerts und benutzt damit Splits, die
     nach dem Bewertungstag liegen. Das ist kein Vorgriff auf Information,
     sondern eine Umrechnung der Stueckzahl: jede RENDITE innerhalb des
     Fensters bleibt identisch. Genau das wird hier gezeigt und nicht
     behauptet. */
  const ohne = reihe(300);
  const mit = reihe(300).map((b, i) => (i === 299 ? { ...b, splitFactor: 4 } : { ...b }));

  const a = Factors.priceSeries(ohne, TOKEN, "relativeStrengthBenchmark").close;
  const b = Factors.priceSeries(mit, TOKEN, "relativeStrengthBenchmark").close;

  /* Die Niveaus unterscheiden sich um den Faktor - die Renditen nicht. */
  for (let i = 1; i < 299; i++) {
    const rA = a[i] / a[i - 1] - 1;
    const rB = b[i] / b[i - 1] - 1;
    assert.ok(Math.abs(rA - rB) < 1e-12, `Rendite am Index ${i} weicht ab: ${rA} vs ${rB}`);
  }
  assert.ok(Math.abs(a[0] / b[0] - 4) < 1e-9);
});

/* ----------------------- 7. Der Faktorlauf bekommt relative Staerke */

test("RELATIVE_STRENGTH_AVAILABLE_BROADLY: Titel und Vergleichsreihe auf derselben Basis", () => {
  const bars = reihe(300);
  const benchBars = reihe(300);
  const benchSerie = Factors.priceSeries(benchBars, TOKEN, "relativeStrengthBenchmark");
  const ergebnis = Factors.computeFactors(
    { bars, adjustmentStatus: "adjusted", ticker: "TEST" },
    { module: "quantV2Momentum",
      benchmark: { id: "SPY", dates: benchBars.map((b) => b.date),
                   closes: benchSerie.close.map((v) => v), last: benchBars.at(-1).date } });
  assert.equal(ergebnis.fieldStatus.relativeStrength["12M"], "CALCULATED");
  assert.equal(typeof ergebnis.values.relativeStrength["12M"], "number");
  assert.equal(ergebnis.returnBasis, "SPLIT_ADJUSTED_PRICE");
});

/* ------------------------------------------ 8. Die Naht im Importlauf */

test("der Import entscheidet mit der Messung und speichert die Deklaration", () => {
  /* Am Quelltext festgehalten, weil der Lauf selbst einen Anbieterzugang
     braucht. Drei Dinge muessen zusammen stimmen, sonst ist die Trennung
     nur gedacht: gemessen wird an der Reihe, die in den Bestand geht;
     entschieden wird von fallbackDeclaration; gespeichert wird die
     Deklaration und nicht mehr die Anbieterstufe. */
  const ingest = readFileSync("scripts/market/ingest-tiingo.mjs", "utf8");
  assert.match(ingest, /const zielreihe = \[\.\.\.\(\(gespeichert && Array\.isArray\(gespeichert\.bars\)\)/);
  assert.match(ingest, /const bausteine = Series\.splitAdjustedInputs\(zielreihe\)/);
  assert.match(ingest, /const rueckfall = semantik\.ok \? null : Semantics\.fallbackDeclaration\(semantik, bausteine\)/);
  assert.match(ingest, /if \(!semantik\.ok && !rueckfall\.allowed\) \{/);
  assert.match(ingest, /adjustmentStatus: deklaration,/);
  assert.equal(/adjustmentStatus: res\.data\.adjustmentStatus,\n {4}fetchedAt/.test(ingest), false,
    "die Anbieterstufe wird noch ungeprueft in den Bestand geschrieben");

  /* Der fehlende Eingang wird berichtet - Schritt 6 der Vorgabe. */
  assert.match(ingest, /splitAdjustedFallback: \{ allowed: false, reason: rueckfall\.reason/);
  assert.match(ingest, /inputs: bausteine\.missing/);

  /* Und die Widerlegung von gestern wird nicht weitergetragen. */
  assert.match(ingest, /adjustmentClaim: rueckfall && rueckfall\.allowed/);
});

test("die Pruefung bleibt vor der Entscheidung - nicht umgekehrt", () => {
  /* Die Reihenfolge ist der Kern: erst prueft validateAdjustmentConsistency
     unveraendert, dann liest die Entscheidung deren Urteil. Waere es
     umgekehrt, entschiede der Rueckfall, was geprueft wird. */
  const ingest = readFileSync("scripts/market/ingest-tiingo.mjs", "utf8");
  const pruefung = ingest.indexOf("MarketQuality.validateAdjustmentConsistency");
  const entscheidung = ingest.indexOf("Semantics.fallbackDeclaration");
  assert.ok(pruefung > 0 && entscheidung > pruefung);
});
