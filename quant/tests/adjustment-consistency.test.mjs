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

/* ===================================================================
   DIE STETIGKEITSPRUEFUNG UND DIE ZWEITE SPALTE

   Diese Faelle stammen nicht aus dem Kopf. Der erste Import gegen die
   echte Tiingo-API hat vier von zwoelf Titeln verworfen - AAPL, NVDA,
   AMZN und TSLA, alle vier mit Split im Zeitraum, alle vier mit
   tadellos bereinigter Reihe daneben.

   Die Ursache war eine Annahme aus Phase 2, die mit einer Spalte
   richtig war und mit zweien falsch wird: geprueft wurde die ROHE
   Spalte, und die springt an einem Split - das ist ihre Aufgabe, nicht
   ihr Fehler.
   =================================================================== */

/* AAPL, 4:1 am 2020-08-31, wie Tiingo es liefert: die rohe Spalte
   springt, die bereinigte laeuft durch. */
function splitReihe(opts) {
  opts = opts || {};
  const faktor = opts.factor || 4;
  const bars = [];
  const d = new Date(Date.UTC(2020, 7, 3));
  for (let i = 0; i < 40; i++) {
    const stetig = 120 + i * 0.4;                 // der bereinigte Verlauf
    const nachSplit = i >= 20;
    bars.push({
      date: d.toISOString().slice(0, 10),
      close: +(nachSplit ? stetig : stetig * faktor).toFixed(4),
      adjustedClose: opts.ohneBereinigt ? null : +stetig.toFixed(4),
      splitFactor: (opts.ohneKennzeichnung ? 1 : (i === 20 ? faktor : 1)),
      dividend: 0, volume: 1000000,
      open: +(nachSplit ? stetig : stetig * faktor).toFixed(4),
      high: +((nachSplit ? stetig : stetig * faktor) * 1.01).toFixed(4),
      low: +((nachSplit ? stetig : stetig * faktor) * 0.99).toFixed(4)
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

test("A11 · Ein Split verwirft eine bereinigte Reihe nicht mehr", () => {
  // Der Fall aus dem echten Import. Vorher: abgelehnt.
  const res = Quality.validateBars(splitReihe(), {
    today: "2026-09-07", adjustmentStatus: "TOTAL_RETURN"
  });
  assert.equal(res.ok, true, "eine bereinigte Reihe mit Split muss durchgehen");
  assert.equal(res.stats.continuityBasis, "adjustedClose");
  assert.equal(res.stats.suspectedSplits, 0);
  assert.equal(res.bars.length, 40, "kein Tag darf verloren gehen");
});

test("A12 · Auf einer rohen Reihe bleibt der Verdacht bestehen", () => {
  // Die Gegenprobe. Waere der Test nur ein Freibrief, haette er den
  // eigentlichen Zweck der Pruefung aufgehoben.
  const res = Quality.validateBars(
    splitReihe({ ohneBereinigt: true, ohneKennzeichnung: true }),
    { today: "2026-09-07", adjustmentStatus: "RAW" });
  assert.equal(res.ok, false);
  assert.equal(res.stats.continuityBasis, "close");
  assert.ok(res.findings.some((f) => f.code === "suspected_unadjusted_split"));
});

test("A13 · Ein gekennzeichneter Splittag erklaert seinen eigenen Sprung", () => {
  // Auch ohne bereinigte Spalte: was der Anbieter selbst als Splittag
  // ausweist, ist eine dokumentierte Kapitalmassnahme und kein
  // Verdachtsfall. Die eingeschraenkte Brauchbarkeit steht trotzdem da.
  const res = Quality.validateBars(splitReihe({ ohneBereinigt: true }), {
    today: "2026-09-07", adjustmentStatus: "RAW"
  });
  assert.equal(res.ok, true);
  const hinweis = res.findings.find((f) => f.code === "announced_split");
  assert.ok(hinweis, "der gekennzeichnete Split muss als Hinweis erscheinen");
  assert.equal(hinweis.severity, "info");
  assert.match(hinweis.message, /nur eingeschraenkt brauchbar/);
});

test("A14 · Eine behauptete Bereinigung ohne zweite Spalte hebt nichts auf", () => {
  // Die Stufe allein darf die Pruefung nicht entschaerfen. Sonst genuegte
  // es, eine Reihe "TOTAL_RETURN" zu nennen, um jede Kontrolle
  // abzuschalten.
  const res = Quality.validateBars(
    splitReihe({ ohneBereinigt: true, ohneKennzeichnung: true }),
    { today: "2026-09-07", adjustmentStatus: "TOTAL_RETURN" });
  assert.equal(res.stats.continuityBasis, "close",
    "ohne bereinigte Spalte gibt es nichts, worauf man ausweichen koennte");
  assert.equal(res.ok, false);
});

test("A15 · Ein echter Kurssturz bleibt ein Befund", () => {
  // Die wichtigste Gegenprobe: die Lockerung darf nur Splits betreffen.
  // Ein Einbruch von 60 % ohne Splitverhaeltnis und ohne Kennzeichnung
  // muss weiterhin auffallen.
  const bars = splitReihe();
  bars[30].adjustedClose = +(bars[29].adjustedClose * 0.4).toFixed(4);
  bars[30].close = +(bars[29].close * 0.4).toFixed(4);
  const res = Quality.validateBars(bars, {
    today: "2026-09-07", adjustmentStatus: "TOTAL_RETURN"
  });
  assert.ok(res.findings.some((f) => f.code === "large_move" ||
                                     f.code === "suspected_unadjusted_split"),
    "ein Einbruch ohne Erklaerung muss gemeldet werden");
});

test("A16 · Ein Titel ohne Ausschuettung wird nicht wegen fehlender Dividende verworfen", () => {
  /* Der zweite Befund aus dem echten Import. AMZN und TSLA zahlen keine
     Dividende. An ihnen laesst sich eine Splitbereinigung zeigen und eine
     Dividendenbereinigung nicht - nicht weil sie fehlte, sondern weil es
     nichts zu bereinigen gibt. Bei einem Titel ohne Ausschuettung sind
     TOTAL_RETURN und SPLIT_ADJUSTED dieselbe Reihe.

     Ein Rangvergleich hat beide verworfen. Der Fehler lag nicht in den
     Daten. */
  const res = Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, mode: "total_return" }), { claimedStatus: "TOTAL_RETURN" });

  assert.equal(res.observed.dividendEvents.length, 0, "der Testfall braucht einen Titel ohne Dividende");
  assert.equal(res.inferredStatus, "SPLIT_ADJUSTED", "belegt ist nur die Splitbereinigung");
  assert.equal(res.observed.refutedAbove, null, "widerlegt ist damit gar nichts");
  assert.equal(res.ok, true, "fehlende Beobachtung ist keine Widerlegung");
});

test("A17 · Widerlegt wird nur, was ein Ereignis auch zeigen konnte", () => {
  // Die Grenze zwischen A16 und A6: dort lagen Ausschuettungen im
  // Zeitraum, und die Spalte hat sie nicht mitgemacht. Hier nicht.
  const mitDividende = Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, divAt: 15, mode: "split_only" }), { claimedStatus: "TOTAL_RETURN" });
  assert.equal(mitDividende.observed.refutedAbove, "SPLIT_ADJUSTED");
  assert.equal(mitDividende.ok, false);

  const ohneDividende = Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, mode: "split_only" }), { claimedStatus: "TOTAL_RETURN" });
  assert.equal(ohneDividende.observed.refutedAbove, null);
  assert.equal(ohneDividende.ok, true);
});

test("A18 · Eine Rohreihe widerlegt jede Bereinigungsbehauptung", () => {
  const res = Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, divAt: 15, mode: "raw" }), { claimedStatus: "SPLIT_ADJUSTED" });
  assert.equal(res.observed.refutedAbove, "RAW");
  assert.equal(res.ok, false);
  // Und eine Behauptung, die nicht ueber das Widerlegte hinausgeht, steht.
  assert.equal(Quality.validateAdjustmentConsistency(
    reihe({ splitAt: 20, divAt: 15, mode: "raw" }), { claimedStatus: "RAW" }).ok, true);
});
