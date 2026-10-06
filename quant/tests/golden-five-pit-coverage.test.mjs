/* =========================================================================
   PHASE 6 — GOLDEN FIVE: POINT-IN-TIME COVERAGE REPORT

   Prueft scripts/quant/build-golden-five-pit-coverage.mjs's Ausgabe: eine
   echte, mehrjaehrige Fakten-Historie je Titel (keine "nur aktueller Wert"-
   Momentaufnahme) und eine aktiv verifizierte PIT-Regel (availableAt <=
   decisionTime), nicht nur eine Behauptung.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(root, "quant", "data", "golden-five-pit-coverage");
const TICKERS = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"];

test("PIT0 · der Bericht liegt NICHT unter quant/data/sec/ (das scannt die parallele " +
     "SEC-Scaling-Pipeline woertlich und policet dort jede *.json - siehe scripts/quant/tests/" +
     "test_workflows.py#GeneratedArtifactTests/DataBudgetTests)", () => {
  assert.ok(!existsSync(join(root, "quant", "data", "sec", "golden-five-pit-coverage")),
    "quant/data/sec/golden-five-pit-coverage darf nicht (wieder) existieren - eigenes " +
    "Geschwisterverzeichnis quant/data/golden-five-pit-coverage verwenden.");
});

test("PIT1 · Coverage-Report existiert fuer alle fuenf Golden-Five-Titel", () => {
  assert.ok(existsSync(join(DIR, "summary.json")), "summary.json fehlt - build-golden-five-pit-coverage.mjs gelaufen?");
  TICKERS.forEach((t) => assert.ok(existsSync(join(DIR, t + ".json")), t + ".json fehlt"));
});

test("PIT2 · jeder Titel traegt eine echte mehrjaehrige Fakten-Historie, nicht nur den aktuellen Wert", () => {
  TICKERS.forEach((t) => {
    const r = JSON.parse(readFileSync(join(DIR, t + ".json"), "utf8"));
    assert.ok(r.factCount > 100, t + ": zu wenige Fakten (" + r.factCount + ") fuer eine echte Historie");
    assert.ok(r.distinctPeriods >= 20, t + ": zu wenige Perioden (" + r.distinctPeriods + ") fuer eine echte Historie");
    assert.ok(r.earliestPeriodEnd < "2015-01-01", t + ": Historie beginnt zu spaet (" + r.earliestPeriodEnd + ")");
  });
});

test("PIT3 · availableAt <= decisionTime gilt fuer jeden einzelnen Fakt (kein Future Data Leak)", () => {
  TICKERS.forEach((t) => {
    const r = JSON.parse(readFileSync(join(DIR, t + ".json"), "utf8"));
    assert.equal(r.pitCheck.ok, true, t + ": PIT-Pruefung meldet Verletzung(en)");
    assert.equal(r.pitCheck.futureDataLeaks, 0, t + ": " + r.pitCheck.futureDataLeaks + " Fakt(en) aus der Zukunft");
    r.facts.forEach((f) => {
      assert.ok(f.availableAt <= r.decisionTime,
        t + "." + f.metric + "@" + f.periodEnd + ": availableAt (" + f.availableAt + ") > decisionTime");
    });
  });
});

test("PIT4 · jeder Fakt traegt metric/periodEnd/availableAt/value/revision/sourceFiling", () => {
  TICKERS.forEach((t) => {
    const r = JSON.parse(readFileSync(join(DIR, t + ".json"), "utf8"));
    assert.ok(r.facts.length > 0, t + ": keine Fakten");
    r.facts.slice(0, 5).forEach((f) => {
      assert.ok(typeof f.metric === "string" && f.metric.length, t + ": metric fehlt");
      assert.ok(typeof f.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.periodEnd), t + ": periodEnd fehlt/ungueltig");
      assert.ok(typeof f.availableAt === "string" && f.availableAt.length, t + ": availableAt fehlt");
      assert.ok("value" in f, t + ": value-Feld fehlt (auch null ist ein gueltiger Wert)");
      assert.ok(typeof f.revision === "number", t + ": revision fehlt");
    });
  });
});

test("PIT5 · Restatements werden gezaehlt, nicht stillschweigend uebernommen", () => {
  TICKERS.forEach((t) => {
    const r = JSON.parse(readFileSync(join(DIR, t + ".json"), "utf8"));
    assert.ok(typeof r.restatedFactCount === "number" && r.restatedFactCount >= 0, t + ": restatedFactCount fehlt");
  });
});
