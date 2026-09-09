/* =========================================================================
   PHASE 5 — GOLDEN UNIVERSE: SEC-FAKTEN ALS QUANT-INPUT

   Prueft die neue, einzige fehlende Verbindung aus §20 der Master-Dokumentation:
   SEC-Fundamentaldaten (providers/sec/adapter.js) fliessen ueber
   sec-fact-panel.js in factors.js#fundamentalMetrics — dieselbe Funktion,
   die auch das synthetische Modelluniversum bedient, kein Duplikat.

   T1-T4   factsToPeriods(): reine Umformung, verlustfrei, PIT-Reihenfolge.
   T5-T6   build-sec-quant-panel.mjs-Ausgabe (quant/data/sec/quant-factor-inputs.json):
           alle fuenf Golden-Universe-Titel vorhanden, isMock:false.
   T7      Wachposten (Phase 5, seitdem quant/data/market/golden-preview/
           echte Tiingo-EOD-Kurse liefert): beta/relativeStrength bleiben
           IMMER UNAVAILABLE — der gleichgewichtete Durchschnitt der fuenf
           Titel selbst ist kein echter Marktindex, und das darf sich auch
           mit echten Kursen nicht aendern. Value/Momentum/Risk selbst
           duerfen jetzt real sein (das ist der Fortschritt gegenueber der
           urspruenglichen Fassung dieser Datei), aber revisions bleibt
           immer UNAVAILABLE (keine lizenzierten Analystendaten).
   T8-T9   Missing != Zero, jede fehlende Komponente traegt eine Begruendung.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const SecFactPanel = require("../engines/sec-fact-panel.js");
const Factors = require("../engines/factors.js");

const OUT_PATH = new URL("../data/sec/quant-factor-inputs.json", import.meta.url);

test("T1 · factsToPeriods gruppiert mehrere Kennzahlen derselben Periode verlustfrei", () => {
  const facts = [
    { metricId: "revenue", periodEnd: "2025-06-30", fiscalYear: 2025, fiscalPeriod: "Q2",
      value: 100, availableAt: "2025-07-20", revisionId: 0, restatementStatus: "original",
      reportedAt: "2025-07-20", filedAt: "2025-07-20" },
    { metricId: "netIncome", periodEnd: "2025-06-30", fiscalYear: 2025, fiscalPeriod: "Q2",
      value: 20, availableAt: "2025-07-20", revisionId: 0, restatementStatus: "original",
      reportedAt: "2025-07-20", filedAt: "2025-07-20" }
  ];
  const periods = SecFactPanel.factsToPeriods(facts);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].periodEnd, "2025-06-30");
  assert.equal(periods[0].values.revenue, 100);
  assert.equal(periods[0].values.netIncome, 20);
});

test("T2 · factsToPeriods sortiert Perioden absteigend nach periodEnd", () => {
  const facts = [
    { metricId: "revenue", periodEnd: "2024-12-31", fiscalYear: 2024, fiscalPeriod: "Q4",
      value: 90, availableAt: "2025-02-01", revisionId: 0, restatementStatus: "original" },
    { metricId: "revenue", periodEnd: "2025-03-31", fiscalYear: 2025, fiscalPeriod: "Q1",
      value: 95, availableAt: "2025-05-01", revisionId: 0, restatementStatus: "original" }
  ];
  const periods = SecFactPanel.factsToPeriods(facts);
  assert.deepEqual(periods.map((p) => p.periodEnd), ["2025-03-31", "2024-12-31"]);
});

test("T3 · factsToPeriods traegt availableAt als das juengste ihrer Fakten je Periode", () => {
  const facts = [
    { metricId: "revenue", periodEnd: "2025-06-30", fiscalYear: 2025, fiscalPeriod: "Q2",
      value: 100, availableAt: "2025-07-20", revisionId: 0, restatementStatus: "original" },
    { metricId: "netIncome", periodEnd: "2025-06-30", fiscalYear: 2025, fiscalPeriod: "Q2",
      value: 20, availableAt: "2025-08-05", revisionId: 0, restatementStatus: "original" }
  ];
  const periods = SecFactPanel.factsToPeriods(facts);
  assert.equal(periods[0].availableAt, "2025-08-05");
});

test("T4 · Ausgabe ist die exakte Eingabeform von factors.js#fundamentalMetrics", () => {
  const facts = [];
  for (let q = 1; q <= 8; q++) {
    const year = 2024 + Math.floor((q - 1) / 4);
    const fp = "Q" + (((q - 1) % 4) + 1);
    facts.push({ metricId: "revenue", periodEnd: year + "-0" + (((q - 1) % 4) + 1) + "-28",
      fiscalYear: year, fiscalPeriod: fp, value: 100 + q, availableAt: year + "-06-01",
      revisionId: 0, restatementStatus: "original" });
  }
  const periods = SecFactPanel.factsToPeriods(facts);
  // Darf nicht werfen — genau die Form, die fundamentalMetrics() erwartet.
  const fm = Factors.fundamentalMetrics(periods, null);
  assert.equal(typeof fm.revenueGrowth, "number");
});

test("T5 · quant-factor-inputs.json existiert (node scripts/quant/build-sec-quant-panel.mjs gelaufen)", () => {
  assert.ok(existsSync(OUT_PATH), "Build-Artefakt fehlt — vor dem Test build-sec-quant-panel.mjs ausfuehren.");
});

test("T6 · alle fuenf Golden-Universe-Titel sind enthalten und real (isMock:false)", () => {
  const out = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"];
  tickers.forEach((t) => {
    const sec = out.securities[t];
    assert.ok(sec, "fehlt: " + t);
    assert.equal(sec.available, true, t + " sollte verfuegbar sein (SEC-Daten sind ingestiert)");
    assert.equal(sec.provenance.isMock, false, t + " darf nicht als Mock gekennzeichnet sein");
  });
});

test("T7 · Wachposten: revisions bleibt fuer jeden Titel UNAVAILABLE (keine erfundenen Analystendaten); " +
     "beta/relativeStrength bleiben UNAVAILABLE auch wenn ein Preis-Panel vorliegt " +
     "(der gleichgewichtete 5-Titel-Durchschnitt ist kein echter Marktindex)", () => {
  const out = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  Object.keys(out.securities).forEach((t) => {
    const sec = out.securities[t];
    if (!sec.available) return;
    assert.equal(sec.coverage.revisions.status, "UNAVAILABLE", t + ".revisions sollte UNAVAILABLE sein");
    assert.equal(sec.coverage.revisions.realCount, 0);
    assert.equal(sec.fundamentals.beta, undefined, t + ": beta darf nie uebernommen werden (kein echter Marktindex)");
    const momentumBeta = sec.coverage.momentum.components.find((c) => c.fieldId === "relativeStrength");
    if (momentumBeta) assert.equal(momentumBeta.real, false, t + ": relativeStrength darf nie real sein");
    const riskBeta = sec.coverage.risk.components.find((c) => c.fieldId === "beta");
    if (riskBeta) assert.equal(riskBeta.real, false, t + ": beta darf nie real sein");
  });
  if (out.pricePanel) {
    /* Sobald ein Preis-Panel vorliegt (Golden-Preview-Kurse veroeffentlicht),
       duerfen Value/Momentum/Risk ECHT werden - das ist Phase 5, nicht ein
       Leck. marketCap ohne Preis-Panel bliebe weiterhin null (siehe T8-Nachbar-
       Pruefung unten fuer den Fall, dass keine Kursreihe existiert). */
    Object.keys(out.securities).forEach((t) => {
      const sec = out.securities[t];
      if (!sec.available) return;
      assert.ok(isFinite(sec.fundamentals.price), t + ": price sollte real sein, wenn ein Preis-Panel vorliegt");
    });
  }
});

test("T8 · fehlende Rohkennzahlen bleiben null, werden nie durch 0 ersetzt (Missing != Zero)", () => {
  const out = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  const jpm = out.securities.JPM;
  assert.ok(jpm.available);
  // JPM meldet 'revenue' unter dem verwendeten XBRL-Concept seit 2014 nicht mehr —
  // bekannte, dokumentierte Bankenluecke (siehe SEC_COVERAGE_REPORT.md).
  assert.equal(jpm.fundamentals.revenue, null);
  assert.notEqual(jpm.fundamentals.revenue, 0);
});

test("T9 · jede Faktor-Komponente ohne Realwert traegt eine Begruendung, nie eine stille Luecke", () => {
  const out = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  Object.keys(out.securities).forEach((t) => {
    const sec = out.securities[t];
    if (!sec.available) return;
    Object.keys(sec.coverage).forEach((factorId) => {
      sec.coverage[factorId].components.forEach((c) => {
        if (!c.real) assert.ok(c.reason && c.reason.length > 10, t + "." + factorId + "." + c.fieldId + " ohne Begruendung");
      });
    });
  });
});

test("T10 · JPM: strukturell nicht anwendbare Kennzahlen tragen notApplicable, keine generische Luecke " +
     "(Live-Feedback: 'JPM sieht aus wie eine kaputte Aktie')", () => {
  const out = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  const jpm = out.securities.JPM;
  assert.ok(jpm && jpm.available, "JPM sollte verfuegbar sein");
  const expectNotApplicable = { quality: ["roic", "grossProfitability", "leverage"], value: ["evToEbitda"] };
  Object.keys(expectNotApplicable).forEach((factorId) => {
    const byField = Object.fromEntries(jpm.coverage[factorId].components.map((c) => [c.fieldId, c]));
    expectNotApplicable[factorId].forEach((fieldId) => {
      const c = byField[fieldId];
      assert.ok(c, "JPM." + factorId + "." + fieldId + " nicht gefunden");
      assert.equal(c.real, false, "JPM." + factorId + "." + fieldId + " sollte keinen Wert haben");
      assert.equal(c.notApplicable, true, "JPM." + factorId + "." + fieldId + " sollte notApplicable sein");
      assert.ok(c.reason && c.reason.length > 20, "JPM." + factorId + "." + fieldId + " ohne erklaerende Begruendung");
    });
  });
  /* Die Gegenprobe: kein anderer Golden-Five-Titel bekommt diese
     Sonderbehandlung - sie ist ticker-scoped fuer JPM, keine allgemeine
     Sektor-Erkennung. */
  ["AAPL", "MSFT", "NVDA", "XOM"].forEach((t) => {
    const sec = out.securities[t];
    if (!sec || !sec.available) return;
    Object.keys(sec.coverage).forEach((factorId) => {
      sec.coverage[factorId].components.forEach((c) => {
        assert.equal(c.notApplicable, false, t + "." + factorId + "." + c.fieldId + " sollte nicht notApplicable sein");
      });
    });
  });
});
