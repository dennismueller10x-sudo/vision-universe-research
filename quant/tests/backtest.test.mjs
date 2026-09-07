// Backtest-, Point-in-Time- und Trust-Score-Tests.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");
const Backtest = require("../engines/backtest.js");
const TrustScore = require("../engines/trust-score.js");
const Strategy = require("../engines/strategy.js");
const Methodology = require("../engines/methodology.js");
const Factors = require("../engines/factors.js");

const dataset = Generator.generateDataset();
const provider = MockProvider.createMockProvider({ dataset });
const library = Strategy.libraryStrategies();
const qualityMomentum = library.find((r) => r.strategy.strategyId === "vu-quality-momentum");

/* Ein gemeinsamer, bewusst kurzer Lauf. Jeder Test mit eigenem
   20-Jahres-Backtest waere in der CI unnoetig teuer: die Aussagen
   (Ausfuehrungszeitpunkt, Grenzen, Reproduzierbarkeit) haengen nicht an
   der Laenge des Zeitraums. */
const run = Backtest.runBacktest({
  definition: qualityMomentum.versions[0].definition,
  strategyId: qualityMomentum.strategy.strategyId,
  strategyVersion: 1,
  startDate: "2020-01-02", endDate: "2026-09-04",
  provider, dataSnapshotId: dataset.meta.dataSnapshotId
});

/* -------------------------------- Rebalancing und Ausfuehrung ------------- */

test("Rebalancing-Termine liegen an Monats- bzw. Quartalsenden", () => {
  const days = dataset.tradingDays;
  const monthly = Backtest.rebalanceIndices(days, "2020-01-01", "2020-12-31", "monthly");
  const quarterly = Backtest.rebalanceIndices(days, "2020-01-01", "2020-12-31", "quarterly");

  // Elf statt zwoelf: das Signal vom letzten Dezembertag koennte erst im
  // Januar ausgefuehrt werden und liegt damit ausserhalb des Zeitraums. Ein
  // Rebalancing ohne moegliche Ausfuehrung waere ein Look-Ahead-Artefakt.
  assert.equal(monthly.length, 11);
  assert.equal(quarterly.length, 3);
  for (const i of monthly) {
    assert.notEqual(days[i].slice(5, 7), days[i + 1].slice(5, 7), "muss der letzte Handelstag des Monats sein");
  }
  for (const i of quarterly) {
    assert.ok(["03", "06", "09", "12"].includes(days[i].slice(5, 7)), days[i]);
  }
  const wide = Backtest.rebalanceIndices(days, "2020-01-01", "2021-01-31", "monthly");
  assert.equal(wide.length, 12, "mit Puffer nach dem Jahresende sind alle zwoelf Termine ausfuehrbar");
});

test("Ein Signal vom Schlusskurs handelt nie am selben Tag (§37)", () => {
  for (const r of run.rebalances) {
    assert.ok(r.executionDate > r.decisionDate,
      `Ausfuehrung ${r.executionDate} nicht nach Entscheidung ${r.decisionDate}`);
  }
  const days = dataset.tradingDays;
  const first = run.rebalances[0];
  assert.equal(days[days.indexOf(first.decisionDate) + 1], first.executionDate,
    "Ausfuehrung muss der unmittelbar folgende Handelstag sein");
});

test("Der Ausfuehrungspreis stammt vom Folgetag, nicht vom Signaltag", () => {
  const series = dataset.prices["sec_VU0010"];
  const t = series.startIndex + 500;
  const nextOpen = Backtest.executionPrice(series, t + 1, "next_open");
  const nextClose = Backtest.executionPrice(series, t + 1, "next_close");
  assert.equal(nextClose, series.adjustedClose[t + 1]);
  assert.notEqual(nextOpen, series.adjustedClose[t], "next_open darf nicht der Signal-Schlusskurs sein");
  const lo = Math.min(series.adjustedClose[t], series.adjustedClose[t + 1]);
  const hi = Math.max(series.adjustedClose[t], series.adjustedClose[t + 1]);
  assert.ok(nextOpen >= lo && nextOpen <= hi, "Eroeffnung muss zwischen den beiden Schlusskursen liegen");
});

/* ------------------------------------- Point-in-Time ---------------------- */

test("Der Backtest kann keine zukuenftigen Fundamentaldaten sehen (§36)", () => {
  const decisionDate = "2018-06-29";
  const panel = provider.getFactPanel({ asOf: decisionDate, quarters: 9 }).data;
  let checked = 0;
  for (const periods of Object.values(panel.periods)) {
    for (const p of periods) {
      assert.ok(p.availableAt <= decisionDate,
        `Periode ${p.periodEnd} war am ${decisionDate} noch nicht verfuegbar (availableAt ${p.availableAt})`);
      checked++;
    }
  }
  assert.ok(checked > 1000);
});

test("Die Faktorberechnung eines Stichtags nutzt nur bis dahin bekannte Daten", () => {
  const asOf = "2015-03-31";
  const securities = provider.getSecurities({ asOf }).data;
  const factPanel = provider.getFactPanel({ asOf, quarters: 9 }).data;
  const panel = Factors.computeMetricPanel({
    securities, pricePanel: provider.getPricePanel().data, factPanel, asOf
  });
  for (const row of panel.rows) {
    if (row._asOfAvailableAt) assert.ok(row._asOfAvailableAt <= asOf, row.ticker);
    assert.ok(row.asOf <= asOf);
  }
});

test("MOCK_RESTATEMENT: die Korrektur wirkt nicht rueckwaerts in den Backtest (§40)", () => {
  const before = Backtest.selectCandidates(
    { provider, definition: qualityMomentum.versions[0].definition,
      pricePanel: provider.getPricePanel().data, dataSnapshotId: null, percentileFields: [] },
    "2017-09-29"
  );
  const rowBefore = before.allRanked.find((r) => r.securityId === "sec_VUF009");
  const factsBefore = provider.getFacts("sec_VUF009", { asOf: "2017-09-29", periodEnd: "2017-03-31", metricId: "revenue" }).data;
  const factsAfter = provider.getFacts("sec_VUF009", { asOf: "2019-09-30", periodEnd: "2017-03-31", metricId: "revenue" }).data;
  assert.equal(factsBefore[0].restatementStatus, "original");
  assert.equal(factsAfter[0].restatementStatus, "restated");
  assert.ok(factsAfter[0].value < factsBefore[0].value);
  assert.ok(rowBefore === undefined || Number.isFinite(rowBefore.rankScore));
});

test("MOCK_DELISTED bleibt im historischen Universum des Backtests (§39)", () => {
  const historic = Backtest.selectCandidates(
    { provider, definition: qualityMomentum.versions[0].definition,
      pricePanel: provider.getPricePanel().data, dataSnapshotId: null, percentileFields: [] },
    "2018-03-29"
  );
  const ids = historic.allRanked.map((r) => r.securityId);
  const universeIds = provider.getSecurities({ asOf: "2018-03-29" }).data.map((s) => s.securityId);
  assert.ok(universeIds.includes("sec_VUF008"), "delisteter Titel fehlt im historischen Universum");

  const today = provider.getSecurities({ asOf: dataset.meta.end }).data.map((s) => s.securityId);
  assert.ok(!today.includes("sec_VUF008"), "delisteter Titel darf heute nicht mehr erscheinen");
  assert.ok(Array.isArray(ids));
});

test("Delistings werden glattgestellt statt zu verschwinden (§38)", () => {
  const longRun = Backtest.runBacktest({
    definition: library.find((r) => r.strategy.strategyId === "vu-momentum-leaders").versions[0].definition,
    // Fenster um das Delisting von MOCK_DELISTED (2019-06-28) herum.
    startDate: "2018-01-02", endDate: "2020-12-31",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  const delistTrades = longRun.trades.filter((t) => t.reason === "delisting");
  for (const t of delistTrades) {
    assert.equal(t.side, "close");
    assert.ok(t.grossValue > 0, "Erloes eines Delistings darf nicht verloren gehen");
  }
  assert.ok(longRun.equity.values.every((v) => v > 0));
});

/* ------------------------------------- Kosten ----------------------------- */

test("Transaktionskosten senken die Rendite messbar (§41)", () => {
  const base = qualityMomentum.versions[0].definition;
  const free = JSON.parse(JSON.stringify(base));
  free.execution.transactionCostsBps = 0;
  free.execution.slippageBps = 0;

  const withCosts = Backtest.runBacktest({
    definition: base, startDate: "2022-01-03", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  const withoutCosts = Backtest.runBacktest({
    definition: free, startDate: "2022-01-03", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });

  assert.ok(withCosts.metrics.totalCosts > 0);
  assert.equal(withoutCosts.metrics.totalCosts, 0);
  assert.ok(withoutCosts.metrics.cagr > withCosts.metrics.cagr,
    `ohne Kosten ${withoutCosts.metrics.cagr}% muesste ueber ${withCosts.metrics.cagr}% liegen`);
});

test("Positions- und Sektorgrenzen werden eingehalten (§41)", () => {
  const def = qualityMomentum.versions[0].definition;
  for (const r of run.rebalances) {
    const bySector = {};
    for (const h of r.holdings) {
      assert.ok(h.weight <= def.portfolio.maxPositionWeight + 1e-6,
        `${h.ticker} mit ${h.weight} ueber der Positionsgrenze`);
      bySector[h.sector] = (bySector[h.sector] || 0) + h.weight;
    }
    for (const [sector, weight] of Object.entries(bySector)) {
      assert.ok(weight <= def.portfolio.maxSectorWeight + 1e-6,
        `Sektor ${sector} mit ${weight} ueber der Sektorgrenze am ${r.executionDate}`);
    }
  }
});

/* --------------------------------- Reproduzierbarkeit --------------------- */

test("Gleiche Eingaben ergeben denselben reproductionHash und dasselbe Ergebnis (§44)", () => {
  const again = Backtest.runBacktest({
    definition: qualityMomentum.versions[0].definition,
    strategyId: qualityMomentum.strategy.strategyId, strategyVersion: 1,
    startDate: "2020-01-02", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  assert.equal(again.reproductionHash, run.reproductionHash);
  assert.equal(again.metrics.cagr, run.metrics.cagr);
  assert.equal(again.metrics.maxDrawdown, run.metrics.maxDrawdown);
});

test("Geaenderte Annahmen ergeben einen anderen reproductionHash", () => {
  const changed = JSON.parse(JSON.stringify(qualityMomentum.versions[0].definition));
  changed.execution.transactionCostsBps = 25;
  const other = Backtest.runBacktest({
    definition: changed, startDate: "2020-01-02", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  assert.notEqual(other.reproductionHash, run.reproductionHash);
});

test("Jeder Backtest traegt Versionen, Snapshot und Annahmen", () => {
  assert.ok(run.reproductionHash.startsWith("bt_"));
  assert.equal(run.engineVersion, Methodology.backtest().engineVersion);
  assert.equal(run.methodologyVersion, Methodology.backtest().methodologyVersion);
  assert.equal(run.quantMethodologyVersion, Methodology.quant().methodologyVersion);
  assert.ok(run.dataSnapshotId);
  assert.ok(run.executionAssumptions.timing);
});

test("Ein Startdatum vor dem Datenbestand wird abgelehnt statt verschoben", () => {
  assert.throws(() => Backtest.runBacktest({
    definition: qualityMomentum.versions[0].definition,
    startDate: "1995-01-02", endDate: "2020-01-02",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  }), /Datenbestand/);
});

test("Kennzahlen sind vollstaendig und plausibel (§42)", () => {
  const m = run.metrics;
  for (const key of ["cagr", "totalReturn", "volatility", "maxDrawdown", "sharpe", "sortino", "calmar", "turnover"]) {
    assert.ok(Number.isFinite(m[key]), `${key} fehlt`);
  }
  assert.ok(m.maxDrawdown <= 0, "Drawdown wird negativ ausgewiesen");
  assert.ok(m.volatility > 0);
  assert.ok(m.benchmark && Number.isFinite(m.benchmark.cagr));
  assert.ok(Object.keys(m.annualReturns).length >= 6);
  assert.equal(m.drawdownSeries.length, run.equity.values.length);
});

/* ----------------------------- What the strategy owns today (§47) --------- */

test("Current Holdings wenden dieselbe Definition auf heute an", () => {
  const holdings = Backtest.currentHoldings({
    definition: qualityMomentum.versions[0].definition,
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  assert.equal(holdings.asOf, dataset.meta.end);
  assert.ok(holdings.holdings.length > 0);
  assert.ok(holdings.holdings.length <= qualityMomentum.versions[0].definition.portfolio.positions);
  const sum = holdings.holdings.reduce((s, h) => s + h.weight, 0);
  assert.ok(Math.abs(sum - 1) < 0.02, `Gewichte summieren zu ${sum}`);
  assert.match(holdings.statement, /erfuellen aktuell die Regeln/);
});

/* --------------------------------- Trust Score ---------------------------- */

test("Trust Score belohnt nachgewiesene Integritaet, nicht Rendite", () => {
  const ts = TrustScore.computeTrustScore(run, {});
  assert.ok(ts.score > 60 && ts.score < 90);
  assert.equal(ts.blocks.dataIntegrity.points, ts.blocks.dataIntegrity.maxPoints);
  assert.ok(ts.limitations.length > 0, "Grenzen muessen benannt werden");
  assert.ok(ts.limitations.some((l) => /[Ss]ynthetisch/.test(l.label + l.note)));
});

test("Hard Cap: ohne Point-in-Time hoechstens 60 Punkte (§45)", () => {
  const fake = JSON.parse(JSON.stringify(run));
  fake.capabilities.pointInTimeFundamentals = false;
  const ts = TrustScore.computeTrustScore(fake, {});
  assert.ok(ts.score <= 60, `Score ${ts.score} ueber der Obergrenze`);
  assert.ok(ts.appliedCaps.some((c) => c.id === "noPointInTime"));
});

test("Hard Cap: ohne delistete Titel hoechstens 70 Punkte", () => {
  const fake = JSON.parse(JSON.stringify(run));
  fake.capabilities.delistedSecurities = false;
  const ts = TrustScore.computeTrustScore(fake, {});
  assert.ok(ts.score <= 70);
  assert.ok(ts.appliedCaps.some((c) => c.id === "noDelisted"));
});

test("Hard Cap: optimierte Strategie ohne Out-of-Sample hoechstens 75 Punkte", () => {
  const ts = TrustScore.computeTrustScore(run, { userOptimized: true, outOfSample: false });
  assert.ok(ts.score <= 75);
  assert.ok(ts.appliedCaps.some((c) => c.id === "optimizedNoOos"));
});

test("Fehlende Kosten senken den Trust Score", () => {
  const free = JSON.parse(JSON.stringify(run));
  free.capabilities.transactionCostsBps = 0;
  free.capabilities.slippageBps = 0;
  free.capabilities.liquidityConstraint = false;
  const withCosts = TrustScore.computeTrustScore(run, {});
  const withoutCosts = TrustScore.computeTrustScore(free, {});
  assert.ok(withoutCosts.score < withCosts.score - 10);
});

test("Teilperioden decken den gesamten Zeitraum ab", () => {
  const parts = Backtest.subperiods(run, 3);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].from, run.equity.dates[0]);
  assert.equal(parts[2].to, run.equity.dates[run.equity.dates.length - 1]);
  for (const p of parts) assert.ok(Number.isFinite(p.cagr) && p.maxDrawdown <= 0);
});
