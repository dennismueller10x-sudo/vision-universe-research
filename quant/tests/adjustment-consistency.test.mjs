/* =========================================================================
   PHASE 4A §24 — DIE BEREINIGTE SPALTE GEGEN DIE ROHE

   Bisher konnte das System die Bereinigungsstufe nur glauben: der Anbieter
   sagt "adjusted", und der Adapter traegt es ein. Tiingo liefert beide
   Spalten nebeneinander, und damit wird die Behauptung pruefbar.

   Der gefaehrliche Fall ist nicht die fehlende Bereinigung. Er ist die
   behauptete: eine Spalte, die "adjClose" heisst und in Wahrheit die
   Rohwerte kopiert, sieht sauber aus und erzeugt trotzdem falsche
   Renditen - und niemand merkt es, weil nichts fehlt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Quality = require("../engines/market-quality.js");

/* Baut eine Reihe mit steuerbaren Ereignissen. `mode` bestimmt, wie die
   bereinigte Spalte entsteht - genau das ist der Prueffall. */
function reihe(opts) {
  opts = opts || {};
  const tage = opts.days || 40;
  const splitAt = opts.splitAt === undefined ? null : opts.splitAt;
  const splitFactor = opts.splitFactor || 4;
  const divAt = opts.divAt === undefined ? null : opts.divAt;
  const dividend = opts.dividend || 0.5;
  const mode = opts.mode || "total_return";

  /* Rohkurse: ruhiger Verlauf, am Splittag geteilt. */
  const roh = [];
  let kurs = 100;
  for (let i = 0; i < tage; i++) {
    kurs = 100 + i * 0.2;
    if (splitAt !== null && i >= splitAt) kurs = kurs / splitFactor;
    roh.push(+kurs.toFixed(4));
  }

  /* Der kumulierte Faktor je Tag, rueckwaerts aufgebaut: er ist 1 am
     letzten Tag und faellt in die Vergangenheit an jedem Ereignis. Genau
     so arbeiten die Anbieterkonventionen. */
  const faktor = new Array(tage).fill(1);
  for (let i = tage - 2; i >= 0; i--) {
    let f = faktor[i + 1];
    if (splitAt !== null && i + 1 === splitAt && mode !== "raw") f = f / splitFactor;
    if (divAt !== null && i + 1 === divAt && mode === "total_return") {
      f = f * (1 - dividend / roh[i]);
    }
    faktor[i] = f;
  }

  const bars = [];
  for (let i = 0; i < tage; i++) {
    const d = new Date(Date.UTC(2024, 0, 8 + i));
    bars.push({
      date: d.toISOString().slice(0, 10),
      close: roh[i],
      adjustedClose: +(roh[i] * faktor[i]).toFixed(6),
      splitFactor: (splitAt !== null && i === splitAt) ? splitFactor : 1,
      dividend: (divAt !== null && i === divAt) ? dividend : 0
    });
  }
  return bars;
}

test("A1 · Ohne bereinigte Spalte gibt es nichts abzuleiten", () => {
  const bars = reihe({ divAt: 10 }).map((b) => ({ ...b, adjustedClose: null }));
  const res = Quality.validateAdjustmentConsistency(bars, { claimedStatus: "TOTAL_RETURN" });
  assert.equal(res.inferredStatus, "UNKNOWN");
  // Und das ist kein Fehler: die Pruefung sagt, dass sie nichts sagen kann.
  assert.equal(res.ok, true);
  assert.equal(res.findings[0].code, "no_adjusted_column");
});

test("A2 · Ohne Ereignis im Zeitraum sind alle Stufen ununterscheidbar", () => {
  // Der wichtigste Zurueckhaltungstest. Eine ruhige Reihe beweist nichts -
  // auch nicht das Gegenteil. Wer hier RAW ableitet, verwechselt fehlende
  // Beobachtung mit Beobachtung des Fehlens.
  const res = Quality.validateAdjustmentConsistency(reihe({}), { claimedStatus: "TOTAL_RETURN" });
  assert.equal(res.inferredStatus, "UNKNOWN");
  assert.equal(res.ok, true);
  assert.equal(res.observed.inferredFrom, "no_events");
});

test("A3 · Ein Split, den nur die rohe Spalte mitmacht, belegt Splitbereinigung", () => {
  const res = Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, mode: "split_only" }), { claimedStatus: "SPLIT_ADJUSTED" });
  assert.equal(res.inferredStatus, "SPLIT_ADJUSTED");
  assert.equal(res.ok, true);
  assert.equal(res.observed.splitEvidence.length, 1);
  assert.ok(res.observed.splitEvidence[0].rawMovePct > 70, "der Rohsprung muss sichtbar sein");
  assert.ok(res.observed.splitEvidence[0].adjustedMovePct < 5, "die bereinigte Spalte darf nicht springen");
});

test("A4 · Eine Ausschuettung im Faktor belegt die Gesamtrendite", () => {
  const res = Quality.validateAdjustmentConsistency(
    reihe({ divAt: 15 }), { claimedStatus: "TOTAL_RETURN" });
  assert.equal(res.inferredStatus, "TOTAL_RETURN");
  assert.equal(res.ok, true);
  const beleg = res.observed.dividendEvidence[0];
  // Der beobachtete Schritt muss zur Ausschuettung passen, nicht nur
  // ungleich null sein.
  assert.ok(Math.abs(beleg.observedFactorStep - beleg.expectedFactorStep) < 0.0005,
    `Schritt ${beleg.observedFactorStep} passt nicht zu ${beleg.expectedFactorStep}`);
});

test("A5 · Eine als bereinigt deklarierte Rohreihe wird widerlegt", () => {
  // Der Fall, um den es geht: adjClose kopiert close, die Reihe heisst
  // trotzdem TOTAL_RETURN.
  const bars = reihe({ divAt: 15, splitAt: 20, mode: "raw" });
  const res = Quality.validateAdjustmentConsistency(bars, { claimedStatus: "TOTAL_RETURN" });

  assert.equal(res.ok, false);
  assert.equal(res.inferredStatus, "RAW");
  const codes = res.findings.map((f) => f.code);
  assert.ok(codes.includes("split_not_adjusted"), "der unbereinigte Split muss auffallen");
  assert.ok(codes.includes("adjustment_status_contradicted"), "der Widerspruch muss benannt sein");
  assert.match(res.findings.find((f) => f.code === "adjustment_status_contradicted").message,
    /falsch, nicht nur ungenau/);
});

test("A6 · Splitbereinigt, aber als Gesamtrendite deklariert, faellt auf", () => {
  // Der unauffaelligere und darum gefaehrlichere Fall: die Splits sind
  // heraus, die Dividenden nicht. Die Reihe sieht sauber aus.
  const bars = reihe({ divAt: 15, splitAt: 25, mode: "split_only" });
  const res = Quality.validateAdjustmentConsistency(bars, { claimedStatus: "TOTAL_RETURN" });

  assert.equal(res.inferredStatus, "SPLIT_ADJUSTED");
  assert.equal(res.ok, false);
  const codes = res.findings.map((f) => f.code);
  assert.ok(codes.includes("dividend_not_in_adjusted"));
  assert.ok(codes.includes("adjustment_status_contradicted"));
});

test("A7 · Die Pruefung hebt nie an", () => {
  // Eine Reihe, die sich besser verhaelt als deklariert, bleibt
  // deklariert. Eine Faehigkeit anzuheben ist Sache des
  // Laufzeitnachweises, nicht einer Plausibilitaetspruefung an 40 Bars.
  const res = Quality.validateAdjustmentConsistency(
    reihe({ divAt: 15 }), { claimedStatus: "SPLIT_ADJUSTED" });
  assert.equal(res.inferredStatus, "TOTAL_RETURN");
  assert.equal(res.claimedStatus, "SPLIT_ADJUSTED");
  assert.equal(res.ok, true, "besser als deklariert ist kein Fehler");
  assert.equal(res.findings.filter((f) => f.severity === "error").length, 0);
});

test("A8 · Ohne Behauptung gibt es keinen Widerspruch", () => {
  const res = Quality.validateAdjustmentConsistency(reihe({ divAt: 15, mode: "raw" }));
  assert.equal(res.claimedStatus, null);
  assert.equal(res.ok, true);
  assert.ok(!res.findings.some((f) => f.code === "adjustment_status_contradicted"));
});

test("A9 · Der Faktor steht zwischen den Ereignissen still", () => {
  // Die Eigenschaft, auf der die ganze Pruefung beruht. Bewegte er sich
  // auch an gewoehnlichen Tagen, waere jeder Befund Rauschen.
  const f = Quality.adjustmentFactors(reihe({ divAt: 15, splitAt: 25 }));
  const werte = f.map((x) => x.factor);
  for (let i = 1; i < werte.length; i++) {
    const istEreignis = f[i].splitFactor !== 1 || f[i].dividend > 0;
    if (istEreignis) continue;
    // Die Toleranz ist die Rundung der Kursspalte, nicht Spielraum: bei
    // sechs Nachkommastellen auf dreistelligen Kursen bleibt genau das
    // uebrig.
    assert.ok(Math.abs(werte[i] / werte[i - 1] - 1) < 1e-7,
      `Faktor bewegt sich am ereignislosen ${f[i].date}`);
  }
});

test("A10 · Der echte Tiingo-Befund haelt der Gegenprobe stand", () => {
  // Kein Netzverkehr: die Zahlen stammen aus dem committeten
  // Laufzeitnachweis. Sie sind hier, damit die Ableitung dieser Datei an
  // echten Werten gemessen wird und nicht nur an gebauten.
  const bericht = require("../data/market/tiingo-runtime-verification.json");
  const dividende = bericht.findings.find((f) => f.capability === "adjustedPrices");
  const split = bericht.findings.find((f) => f.capability === "splitAdjustedPrices");

  // KO: bereinigt liegt vor dem Ex-Tag unter roh - die Dividende ist drin.
  const e = dividende.evidence;
  assert.ok(e.adjustedOpen < e.rawOpen);
  assert.ok(Math.abs(e.adjustedOpen / e.rawOpen - e.ratio) < 0.0005);

  // NVDA: roh springt um den Splitfaktor, bereinigt nicht. Genau das
  // Muster, das A3 prueft.
  assert.ok(split.evidence.rawRatio > 3.5 && split.evidence.rawRatio < 4.5);
  assert.ok(Math.abs(split.evidence.adjustedRatio - 1) < 0.15);
});
