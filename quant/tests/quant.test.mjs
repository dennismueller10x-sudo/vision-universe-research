// Quant-Core-Tests: Normalisierung, Faktoren, VU Quant Score, Radar.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Norm = require("../engines/normalization.js");
const Factors = require("../engines/factors.js");
const QuantScore = require("../engines/quant-score.js");
const Radar = require("../engines/radar.js");
const Methodology = require("../engines/methodology.js");
const Catalog = require("../engines/catalog.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");

const cfg = Methodology.quant();
const dataset = Generator.generateDataset();
const mp = MockProvider.createMockProvider({ dataset });
const asOf = dataset.meta.end;
const metricPanel = Factors.computeMetricPanel({
  securities: mp.getSecurities({ asOf }).data,
  pricePanel: mp.getPricePanel().data,
  factPanel: mp.getFactPanel({ asOf, quarters: 9 }).data,
  asOf
});
const scorePanel = QuantScore.computeScorePanel({ metricPanel, dataSnapshotId: dataset.meta.dataSnapshotId });
const rows = QuantScore.addAuxiliaryPercentiles(
  QuantScore.buildScreenerRows(metricPanel, scorePanel), cfg);
const byFixture = (id) => rows.find((r) => r.fixtureId === id);

/* ------------------------------- Normalisierung ------------------------- */

test("Perzentile: 0 bis 100, aufsteigend", () => {
  assert.deepEqual(Norm.percentileRanks([10, 20, 30, 40, 50], true), [0, 25, 50, 75, 100]);
});

test("higherIsBetter=false dreht die Skala (niedrige Volatilitaet = hoher Score)", () => {
  assert.deepEqual(Norm.percentileRanks([10, 20, 30], false), [100, 50, 0]);
});

test("Gleiche Werte erhalten dasselbe Perzentil", () => {
  const p = Norm.percentileRanks([5, 5, 5, 1, 9], true);
  assert.equal(p[0], p[1]);
  assert.equal(p[1], p[2]);
});

test("Fehlende Werte bekommen KEIN Ersatzperzentil", () => {
  const p = Norm.percentileRanks([1, null, 3, undefined, NaN], true);
  assert.equal(p[1], null);
  assert.equal(p[3], null);
  assert.equal(p[4], null);
});

test("Winsorization stutzt Ausreisser, ohne die Rangfolge zu aendern", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100000];
  const w = Norm.winsorize(values, 2, 98);
  assert.ok(w[9] < 100000, "Ausreisser muss gestutzt werden");
  assert.ok(w[9] >= w[8], "Rangfolge bleibt erhalten");
  // Auch die untere Grenze wird gestutzt: der kleinste Wert wird auf das
  // 2. Perzentil angehoben. Das ist beabsichtigt und symmetrisch.
  assert.ok(w[0] >= values[0] && w[0] <= values[1]);
  for (let i = 1; i < w.length; i++) assert.ok(w[i] >= w[i - 1]);
});

test("Robuster Z-Score nutzt Median und MAD statt Mittelwert", () => {
  const withOutlier = [10, 11, 12, 13, 1000];
  const z = Norm.robustZScores(withOutlier, true);
  assert.ok(Math.abs(z[1]) < 1.5, "Median-basiert duerfen normale Werte nicht extrem wirken");
  assert.ok(z[4] > 50, "Der Ausreisser muss als Ausreisser sichtbar bleiben");
});

test("Peer-Normalisierung faellt bei zu kleiner Gruppe auf das Universum zurueck", () => {
  const rowsIn = [];
  for (let i = 0; i < 40; i++) {
    rowsIn.push({ industry: i < 5 ? "Winzig" : "Gross", sector: "S", v: i });
  }
  const res = Norm.peerNormalize(rowsIn, (r) => r.v, cfg.normalization,
    { industry: (r) => r.industry, sector: (r) => r.sector }, true);
  assert.equal(res[0].peerGroup, "sector:S", "5 Titel unterschreiten minPeerGroupSize");
  assert.equal(res[20].peerGroup, "industry:Gross");
});

test("weightedAverage renormalisiert und meldet die Abdeckung", () => {
  const r = Norm.weightedAverage([
    { weight: 0.5, value: 100 }, { weight: 0.3, value: null }, { weight: 0.2, value: 50 }
  ]);
  assert.equal(Math.round(r.value), 86);
  assert.equal(Math.round(r.coverage * 100), 70);
});

/* --------------------------------- Faktoren ----------------------------- */

test("Alle Faktorkomponenten der Methodik existieren im Katalog", () => {
  for (const factorId of QuantScore.activeFactors(cfg)) {
    for (const componentId of Object.keys(cfg.factors[factorId].components)) {
      assert.ok(Catalog.field(componentId), `Unbekanntes Feld ${componentId} in Faktor ${factorId}`);
    }
  }
});

test("Faktorgewichte und Komponentengewichte summieren jeweils zu 1", () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum(cfg.factorWeights) - 1) < 1e-9);
  for (const factorId of QuantScore.activeFactors(cfg)) {
    assert.ok(Math.abs(sum(cfg.factors[factorId].components) - 1) < 1e-9, factorId);
  }
});

test("Kennzahlen mit unzulaessigem Nenner sind null, nicht 'guenstig'", () => {
  const periods = [{
    fiscalPeriod: "Q1", fiscalYear: 2026, periodEnd: "2026-03-31", availableAt: "2026-05-05",
    revisionId: 0, restatementStatus: "original",
    values: { revenue: 100, ebitda: -20, freeCashFlow: -30, netIncome: -10, operatingIncome: -15,
              grossProfit: 30, totalAssets: 500, totalEquity: 200, netDebt: 100,
              investedCapital: 300, sharesOutstanding: 10, dividendPerShare: 0,
              interestExpense: 2, accruals: 0.02 }
  }];
  const four = [0, 1, 2, 3].map((i) => ({ ...periods[0], periodEnd: `2026-0${i + 1}-28` }));
  const m = Factors.fundamentalMetrics(four, 50);
  assert.equal(m.evToEbitda, null, "negatives EBITDA ergibt keinen Multiplikator");
  assert.equal(m.priceToFcf, null, "negativer FCF ergibt kein Kurs/FCF");
  assert.ok(m.fcfYield < 0, "negative FCF-Rendite ist dagegen aussagekraeftig");
});

test("Wachstum aus negativer Basis wird nicht berechnet", () => {
  const mk = (netIncome, periodEnd) => ({
    fiscalPeriod: "Q1", fiscalYear: 2026, periodEnd, availableAt: "2026-05-05", revisionId: 0,
    restatementStatus: "original",
    values: { revenue: 100, netIncome, grossProfit: 30, operatingIncome: netIncome, ebitda: netIncome + 5,
              freeCashFlow: netIncome, totalAssets: 500, totalEquity: 200, netDebt: 50,
              investedCapital: 250, sharesOutstanding: 10, dividendPerShare: 0,
              interestExpense: 1, accruals: 0.01 }
  });
  const periods = [
    mk(10, "2026-06-30"), mk(10, "2026-03-31"), mk(10, "2025-12-31"), mk(10, "2025-09-30"),
    mk(-5, "2025-06-30"), mk(-5, "2025-03-31"), mk(-5, "2024-12-31"), mk(-5, "2024-09-30")
  ];
  assert.equal(Factors.fundamentalMetrics(periods, 50).epsGrowth, null);
});

test("Momentum 12-1 laesst den letzten Monat aus", () => {
  const n = 300;
  const adj = new Float32Array(n);
  for (let i = 0; i < n; i++) adj[i] = 100 * Math.pow(1.001, i);
  adj[n - 1] = 10;                                     // Absturz im letzten Monat
  for (let i = n - 21; i < n; i++) adj[i] = 10;
  const close = adj;
  const series = { adjustedClose: adj, close, startIndex: 0, endIndex: n - 1 };
  const m = Factors.priceMetrics(series, n - 1, null, null, "x");
  assert.ok(m.momentum12m < -80, "12M-Momentum muss den Absturz sehen");
  assert.ok(m.momentum12m1m > 0, "12-1-Momentum darf den letzten Monat nicht sehen");
});

/* ------------------------------- Quant Score ---------------------------- */

test("Faktorbeitraege summieren sich exakt zum Composite", () => {
  const scored = scorePanel.scores.filter((s) => s.status === "scored");
  assert.ok(scored.length > 400);
  for (const s of scored) {
    const sum = Object.values(s.factorContributions).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - s.compositeScore) < 0.005,
      `${s.ticker}: Summe ${sum} != Composite ${s.compositeScore}`);
  }
});

test("Effektive Gewichte summieren zu 1, wenn ein Score vergeben wird", () => {
  for (const s of scorePanel.scores.filter((x) => x.status === "scored")) {
    const sum = Object.values(s.effectiveWeights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `${s.ticker}: ${sum}`);
  }
});

test("Jeder Score traegt methodologyVersion, asOf und Coverage", () => {
  for (const s of scorePanel.scores) {
    assert.equal(s.methodologyVersion, cfg.methodologyVersion);
    assert.match(s.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(s.coverage));
    assert.ok(s.dataSnapshotId);
  }
});

test("Der Revisions-Faktor geht nicht in den Composite ein", () => {
  assert.equal(cfg.factors.revisions.available, false);
  assert.ok(!QuantScore.activeFactors(cfg).includes("revisions"));
  for (const s of scorePanel.scores) {
    assert.equal(s.factorScores.revisions, undefined);
    assert.ok(!("revisions" in s.factorContributions));
  }
});

test("MOCK_MISSING_DATA erhaelt keinen Score, sondern den Status INCOMPLETE", () => {
  const s = scorePanel.byId[byFixture("MOCK_MISSING_DATA").securityId];
  assert.equal(s.status, "incomplete");
  assert.equal(s.score, null);
  assert.equal(s.confidence, "insufficient");
  assert.ok(s.incompleteReasons.length > 0);
  assert.ok(s.coverage < cfg.coverage.minTotalCoverage);
});

test("Fehlende Daten werden nie als neutrale 50 eingesetzt", () => {
  const s = scorePanel.byId[byFixture("MOCK_MISSING_DATA").securityId];
  for (const [factorId, comps] of Object.entries(s.components)) {
    for (const [cid, c] of Object.entries(comps)) {
      if (c.raw === null) assert.equal(c.percentile, null, `${factorId}.${cid}`);
    }
  }
});

test("Edge-Case-Fixtures zeigen das erwartete Faktorprofil", () => {
  const dna = (id) => scorePanel.byId[byFixture(id).securityId];
  assert.ok(dna("MOCK_HIGH_QUALITY").factorScores.quality > 85);
  assert.ok(dna("MOCK_HIGH_MOMENTUM").factorScores.momentum > 80);
  assert.ok(dna("MOCK_HIGH_GROWTH").factorScores.growth > 75);
  assert.ok(dna("MOCK_DEEP_VALUE").factorScores.value > 80);
  assert.ok(dna("MOCK_LOW_VOL").factorScores.risk > 85);
});

test("MOCK_VALUE_TRAP wird nicht als Value-Chance ausgegeben", () => {
  const trap = byFixture("MOCK_VALUE_TRAP");
  assert.ok(trap.quantScore < 15, `Value Trap mit Score ${trap.quantScore}`);
  assert.ok(trap.momentumScore < 20);
  assert.ok(trap.qualityScore < 30);
});

test("VU Quant Score ist der Perzentilrang des Composite", () => {
  const scored = scorePanel.scores.filter((s) => s.status === "scored")
    .sort((a, b) => b.compositeScore - a.compositeScore);
  assert.equal(scored[0].score, 100);
  assert.equal(scored[scored.length - 1].score, 0);
  for (let i = 1; i < scored.length; i++) {
    assert.ok(scored[i].score <= scored[i - 1].score, "Rangfolge muss monoton sein");
  }
});

test("Screener-Zeilen tragen Perzentile fuer alle Perzentil-Felder", () => {
  const row = rows.find((r) => r.quantStatus === "scored");
  for (const field of Catalog.FIELD_LIST.filter((f) => f.percentileAvailable)) {
    assert.ok(field.id in row.percentiles, `Perzentil fuer ${field.id} fehlt`);
  }
});

/* ---------------------------------- Radar ------------------------------- */

test("Score-Historie und Velocity", () => {
  const history = Radar.createHistory(cfg.methodologyVersion, "snap_test");
  const mkPanel = (date, score) => ({
    asOf: date,
    scores: [{ securityId: "sec_A", ticker: "A", score, status: "scored",
               factorScores: { quality: score, momentum: score, value: 50, growth: 50, risk: 50 } }]
  });
  Radar.appendSnapshot(history, mkPanel("2026-06-06", 60));
  Radar.appendSnapshot(history, mkPanel("2026-07-06", 70));
  Radar.appendSnapshot(history, mkPanel("2026-08-05", 75));
  Radar.appendSnapshot(history, mkPanel("2026-09-04", 90));

  const v = Radar.computeVelocity(history, "sec_A", cfg);
  assert.equal(v.currentScore, 90);
  assert.equal(v.scoreVelocity30d, 15);          // 90 - 75
  assert.equal(v.scoreVelocity60d, 20);          // 90 - 70
  assert.equal(v.scoreAcceleration, 10);         // 15 - 5
  assert.equal(v.factorVelocity.quality, 15);
});

test("Radar-Module und Events entstehen aus derselben Konfiguration", () => {
  const history = Radar.createHistory(cfg.methodologyVersion, "snap_test");
  Radar.appendSnapshot(history, { asOf: "2026-08-05", scores: [
    { securityId: "sec_A", ticker: "A", score: 50, status: "scored", factorScores: { quality: 50, momentum: 50, value: 50, growth: 50, risk: 50 } }
  ]});
  Radar.appendSnapshot(history, { asOf: "2026-09-04", scores: [
    { securityId: "sec_A", ticker: "A", score: 95, status: "scored", factorScores: { quality: 95, momentum: 95, value: 50, growth: 95, risk: 50 } }
  ]});
  const testRows = [{ securityId: "sec_A", ticker: "A", asOf: "2026-09-04", status: "active",
                      quantScore: 95, qualityScore: 95, momentumScore: 95, distanceTo52wHigh: 1.0 }];
  const velocities = Radar.computeVelocityPanel(history, ["sec_A"], cfg);
  const events = Radar.detectEvents(testRows, velocities, cfg);
  const types = events.map((e) => e.eventType);
  assert.ok(types.includes("quant_upgrade"));
  assert.ok(types.includes("momentum_leader"));
  assert.ok(types.includes("factor_breakout"));
  assert.ok(types.includes("near_52w_high_confirmed"));
  for (const e of events) {
    assert.ok(e.eventId && e.occurredAt && e.detectedAt && e.headline);
    assert.equal(e.methodologyVersion, cfg.methodologyVersion);
  }
  const radar = Radar.buildRadar(testRows, velocities, cfg);
  assert.equal(radar.modules.biggest_upgrades.length, 1);
  assert.equal(radar.modules.biggest_downgrades.length, 0);
});
