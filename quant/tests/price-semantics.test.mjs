/* =========================================================================
   PHASE 3 §2 — BEREINIGUNGSSEMANTIK

   Der Auditbefund MEDIUM-7 war kein Rechenfehler. Beide Systemteile
   rechneten richtig - sie nannten nur zwei verschiedene Dinge gleich. Der
   Quant-Bereich rechnete Gesamtrendite auf total-return-bereinigten Reihen,
   das Dashboard Kursrendite auf splitbereinigten, und beide Zahlen hiessen
   "Rendite".

   Diese Tests halten die Trennung fest. Sie pruefen nicht, ob eine Zahl
   stimmt, sondern ob das System weiss, was seine Zahlen bedeuten.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Semantics = require("../engines/price-semantics.js");
const METHODOLOGY = JSON.parse(
  readFileSync(join(ROOT, "quant", "methodology", "price-adjustment-v1.json"), "utf8"));
Semantics.configure(METHODOLOGY);

/* ---------------------------------------------------------------------- */
test("P1 · Vier Stufen, und UNKNOWN ist die strengste", () => {
  for (const level of ["RAW", "SPLIT_ADJUSTED", "TOTAL_RETURN", "UNKNOWN"]) {
    assert.ok(METHODOLOGY.levels[level], `${level} fehlt in der Methodikdatei`);
  }
  // UNKNOWN liegt unter RAW: "wir wissen nicht, was das ist" muss strenger
  // behandelt werden als "wir wissen, dass die Bereinigung fehlt".
  assert.ok(Semantics.rank("UNKNOWN") < Semantics.rank("RAW"));
  assert.ok(Semantics.rank("RAW") < Semantics.rank("SPLIT_ADJUSTED"));
  assert.ok(Semantics.rank("SPLIT_ADJUSTED") < Semantics.rank("TOTAL_RETURN"));
});

test("P2 · Eine unbekannte Angabe wird nie geraten", () => {
  for (const input of [null, undefined, "", "irgendwas", "adjusted_maybe", 42, {}]) {
    assert.equal(Semantics.normalize(input), "UNKNOWN", `${JSON.stringify(input)} wurde geraten`);
  }
  // Das Vokabular der Providerschicht wird dagegen sauber uebersetzt.
  assert.equal(Semantics.normalize("unadjusted"), "RAW");
  assert.equal(Semantics.normalize("splitAdjusted"), "SPLIT_ADJUSTED");
  assert.equal(Semantics.normalize("adjusted"), "TOTAL_RETURN");
});

test("P3 · Eine Gesamtrendite verlangt total-return-bereinigte Kurse", () => {
  assert.equal(Semantics.check("total_return", "TOTAL_RETURN").allowed, true);

  for (const level of ["SPLIT_ADJUSTED", "RAW", "UNKNOWN"]) {
    const res = Semantics.check("total_return", level);
    assert.equal(res.allowed, false, `${level} durfte total_return rechnen`);
    assert.ok(res.message, "eine Ablehnung ohne Begruendung ist nur die halbe Ehrlichkeit");
    assert.equal(res.required, "TOTAL_RETURN");
  }
});

test("P4 · Kursbasierte Kennzahlen sind ab splitbereinigt zulaessig", () => {
  for (const metric of ["momentum", "volatility", "drawdown", "moving_average", "breakout"]) {
    assert.equal(Semantics.check(metric, "SPLIT_ADJUSTED").allowed, true, `${metric} abgelehnt`);
    assert.equal(Semantics.check(metric, "TOTAL_RETURN").allowed, true, `${metric} abgelehnt`);
    // Auf unbereinigten Reihen erzeugt jeder Split ein Signal, das es nie gab.
    assert.equal(Semantics.check(metric, "RAW").allowed, false, `${metric} auf RAW erlaubt`);
    assert.equal(Semantics.check(metric, "UNKNOWN").allowed, false, `${metric} auf UNKNOWN erlaubt`);
  }
});

test("P5 · Fuer die Ordergroesse ist der ruecgerechnete Kurs der falsche", () => {
  // Die Gegenrichtung, die leicht uebersehen wird: TOTAL_RETURN ist nicht
  // ueberall besser. Zu welchem Kurs haette ich gekauft? Nicht zu diesem -
  // der ruecgerechnete Kurs wurde nie gehandelt.
  assert.equal(Semantics.check("order_sizing", "RAW").allowed, true);
  assert.equal(METHODOLOGY.levels.TOTAL_RETURN.forbids.includes("order_sizing"), true,
    "die Methodikdatei muss den Fall ausdruecklich benennen");
});

test("P6 · Das Wort Rendite ist fuer Total Return reserviert", () => {
  assert.equal(Semantics.returnLabel("TOTAL_RETURN"), "Gesamtrendite");
  assert.equal(Semantics.returnLabel("SPLIT_ADJUSTED"), "Kursrendite");
  assert.match(Semantics.returnLabel("RAW"), /unbereinigt/);
  assert.match(Semantics.returnLabel("UNKNOWN"), /unbekannt/i);

  // Keine niedrigere Stufe darf sich schlicht "Rendite" nennen duerfen.
  for (const level of ["SPLIT_ADJUSTED", "RAW", "UNKNOWN"]) {
    assert.notEqual(Semantics.returnLabel(level), "Rendite");
    assert.notEqual(Semantics.returnLabel(level), "Gesamtrendite");
  }
});

test("P7 · Kennzahlen unterschiedlicher Stufe sind nicht vergleichbar", () => {
  // Genau der Auditbefund: eine Gesamtrendite und eine Kursrendite sehen in
  // einer Tabelle gleich aus und gehoeren nicht nebeneinander.
  const mixed = Semantics.comparable("TOTAL_RETURN", "SPLIT_ADJUSTED");
  assert.equal(mixed.comparable, false);
  assert.match(mixed.message, /unterschiedlich bereinigt/);

  assert.equal(Semantics.comparable("TOTAL_RETURN", "TOTAL_RETURN").comparable, true);
  assert.equal(Semantics.comparable("UNKNOWN", "UNKNOWN").comparable, false,
    "zwei ungepruefte Reihen sind nicht deshalb vergleichbar, weil beide ungeprueft sind");
});

test("P8 · Jede Stufe sagt, was ihr fehlt", () => {
  assert.equal(Semantics.caveat("TOTAL_RETURN"), null, "hier fehlt nichts");
  assert.match(Semantics.caveat("SPLIT_ADJUSTED"), /Dividend/);
  assert.match(Semantics.caveat("RAW"), /Split/);
  assert.match(Semantics.caveat("UNKNOWN"), /nicht interpretierbar/);
});

test("P9 · Die Providerschicht und die Semantik sprechen dieselbe Sprache", () => {
  const TwelveData = require("../../providers/twelve-data/adapter.js");
  const caps = TwelveData.freePlanCapabilities();

  // Der Adapter kennt drei Zustaende; jeder muss auf eine Stufe abbilden.
  for (const status of ["adjusted", "splitAdjusted", "unadjusted"]) {
    const level = Semantics.normalize(status);
    assert.notEqual(level, "UNKNOWN", `Adapterzustand '${status}' ist nicht abgebildet`);
  }

  // Und die Abbildung steht auch in der Methodikdatei, nicht nur im Code.
  for (const [providerWord, level] of Object.entries(METHODOLOGY.providerMapping)) {
    if (providerWord === "note") continue;
    assert.equal(Semantics.normalize(providerWord), level,
      `Methodikdatei und Modul widersprechen sich bei '${providerWord}'`);
  }

  // Der kostenlose Zugang erreicht TOTAL_RETURN nicht - deshalb ist der
  // Backtest auf diesen Reihen ausgeschlossen.
  assert.equal(caps.sets.market.adjustedPrices, false);
  assert.equal(Semantics.check("backtest_evidence", "SPLIT_ADJUSTED").allowed, false);
});

/* ------------------------------------------- MEDIUM-7: die Alt-Pipeline */

test("P10 · Die Dashboard-Marktdaten tragen ihre Bereinigungsstufe", () => {
  const file = join(ROOT, "dashboard", "data", "market_data.json");
  if (!existsSync(file)) return;   // Datei ist optional, der Test darf nicht daran haengen

  const market = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(market.adjustment, "market_data.json ohne Feld 'adjustment' (MEDIUM-7)");
  assert.equal(Semantics.normalize(market.adjustment), market.adjustment,
    "die Angabe muss eine der vier Stufen sein");
  assert.ok(market.schema_version >= 2, "schema_version muss die Migration widerspiegeln");
  if (market.status === "generated") {
    assert.ok(market.adjustment_evidence, "eine Einstufung ohne Beleg ist eine Behauptung");
  } else {
    assert.equal(market.adjustment, "UNKNOWN",
      "ein nicht erzeugter oeffentlicher Platzhalter darf keine Bereinigungsstufe behaupten");
    assert.equal(Object.keys(market.symbols || {}).length, 0,
      "ein nicht erzeugter oeffentlicher Platzhalter darf keine Kursreihen enthalten");
  }
});

test("P11 · Die Dashboard-Kennzahlen sind als Kursrendite benannt", () => {
  const file = join(ROOT, "dashboard", "data", "backtest_results.json");
  if (!existsSync(file)) return;

  const results = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(results.return_semantics, "backtest_results.json ohne return_semantics (MEDIUM-7)");

  const semantics = results.return_semantics;
  const level = Semantics.normalize(semantics.adjustment);

  // Die Zahl muss heissen, was sie ist.
  assert.equal(semantics.meaning, Semantics.returnLabel(level));
  assert.equal(semantics.field, "average_return_pct");

  // Solange die Stufe unter TOTAL_RETURN liegt, darf hier nicht
  // "Gesamtrendite" stehen - und der Hinweis auf die Nichtvergleichbarkeit
  // mit dem Quant-Bereich muss dabei sein.
  if (Semantics.rank(level) < Semantics.rank("TOTAL_RETURN")) {
    assert.notEqual(semantics.meaning, "Gesamtrendite");
    assert.match(semantics.note, /Quant/,
      "der Unterschied zum Quant-Bereich muss ausdruecklich benannt sein");
  }
});

test("P12 · Beide Stacks lesen dieselbe Definition", () => {
  // Eine gemeinsame Bibliothek gibt es zwischen JavaScript und Python nicht.
  // Eine gemeinsame Definition schon - und dieser Test haelt fest, dass die
  // Python-Seite tatsaechlich auf sie zeigt und nicht auf eine Kopie.
  const py = readFileSync(join(ROOT, "scripts", "dashboard", "price_semantics.py"), "utf8");
  assert.match(py, /price-adjustment-v1\.json/,
    "das Python-Modul muss die gemeinsame Methodikdatei lesen");
  assert.match(py, /"quant"\s*\/\s*"methodology"/,
    "und zwar aus quant/methodology, nicht aus einer eigenen Ablage");

  // Die Raenge muessen in beiden Modulen gleich sein.
  assert.match(py, /RANK\s*=\s*\{UNKNOWN:\s*-1,\s*RAW:\s*0,\s*SPLIT_ADJUSTED:\s*1,\s*TOTAL_RETURN:\s*2\}/,
    "die Rangfolge muss in beiden Modulen identisch sein");
});

test("P13 · Die Methodikdatei ist in sich schluessig", () => {
  // Jede Kennzahl verweist auf eine existierende Stufe.
  for (const [name, metric] of Object.entries(METHODOLOGY.metrics)) {
    assert.ok(METHODOLOGY.levels[metric.minimumLevel],
      `Kennzahl '${name}' verweist auf unbekannte Stufe '${metric.minimumLevel}'`);
    assert.ok(metric.statement, `Kennzahl '${name}' ohne Aussagesatz`);
  }
  // Was eine Stufe erlaubt, darf sie nicht zugleich verbieten.
  for (const [name, level] of Object.entries(METHODOLOGY.levels)) {
    const both = (level.permits || []).filter((p) => (level.forbids || []).includes(p));
    assert.deepEqual(both, [], `Stufe '${name}' erlaubt und verbietet zugleich: ${both.join(", ")}`);
    assert.ok(level.reason, `Stufe '${name}' ohne Begruendung`);
  }
  // Eine hoehere Stufe darf nichts verbieten, was eine niedrigere erlaubt -
  // ausser den Faellen, in denen der ruecgerechnete Kurs sachlich falsch ist.
  const erlaubteAusnahmen = ["volume_analysis_by_price", "order_sizing"];
  for (const forbidden of METHODOLOGY.levels.TOTAL_RETURN.forbids) {
    assert.ok(erlaubteAusnahmen.includes(forbidden),
      `TOTAL_RETURN verbietet '${forbidden}' ohne dokumentierte Ausnahme`);
  }
});
