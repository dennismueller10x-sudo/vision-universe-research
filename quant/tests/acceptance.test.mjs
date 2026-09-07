// CRITICAL ACCEPTANCE TESTS (§76).
// Der Build gilt erst als abgeschlossen, wenn jeder dieser Punkte haelt.
// Diese Datei prueft die Kriterien in ihrer Reihenfolge und zusaetzlich die
// regulatorischen Sprachvorgaben (§81) und die Mock-Kennzeichnung (§94).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUANT = join(ROOT, "quant");

const Provider = require("../engines/provider.js");
const Schema = require("../engines/schema.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");
const Factors = require("../engines/factors.js");
const QuantScore = require("../engines/quant-score.js");
const Radar = require("../engines/radar.js");
const Query = require("../engines/query.js");
const VUQL = require("../engines/vuql.js");
const Strategy = require("../engines/strategy.js");
const Backtest = require("../engines/backtest.js");
const AiTools = require("../engines/ai-tools.js");
const AiProvider = require("../engines/ai-provider.js");
const Methodology = require("../engines/methodology.js");

function walk(dir, extensions, skip = []) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (skip.some((s) => full.includes(s))) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions, skip));
    else if (extensions.includes(extname(full))) out.push(full);
  }
  return out;
}

const dataset = Generator.generateDataset();
const provider = MockProvider.createMockProvider({ dataset });
const asOf = dataset.meta.end;
const metricPanel = Factors.computeMetricPanel({
  securities: provider.getSecurities({ asOf }).data,
  pricePanel: provider.getPricePanel().data,
  factPanel: provider.getFactPanel({ asOf, quarters: 9 }).data,
  asOf
});
const scorePanel = QuantScore.computeScorePanel({ metricPanel, dataSnapshotId: dataset.meta.dataSnapshotId });

/* 1 --------------------------------------------------------------------- */
test("1 · Das Frontend enthaelt keine vendor-spezifischen Felder", () => {
  const frontendFiles = [
    ...walk(join(QUANT, "ui"), [".js", ".css"]),
    ...walk(join(QUANT, "api"), [".js"]),
    ...walk(QUANT, [".html"]),
    ...walk(QUANT, [".js"], [join(QUANT, "engines"), join(QUANT, "tests")])
  ];
  assert.ok(frontendFiles.length > 12, "zu wenige Dateien geprueft");

  for (const file of frontendFiles) {
    const source = readFileSync(file, "utf8");
    for (const marker of Provider.VENDOR_MARKERS) {
      // Der Provider-Architektur-Text nennt Anbieter bewusst in Kommentaren
      // und Dokumentationstexten; verboten sind FELDZUGRIFFE.
      const accessPattern = new RegExp("[.\\\\[][\"']?" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      assert.ok(!accessPattern.test(source), `${file}: Vendor-Feldzugriff auf '${marker}'`);
    }
  }

  // Auch die ausgelieferten Daten tragen keine Vendor-Felder.
  for (const record of [dataset.securities[0], dataset.corporateActions[0],
                        provider.getFacts("sec_VU0001", { quarters: 1 }).data[0]]) {
    assert.deepEqual(Provider.findVendorLeakage(record), []);
  }
});

/* 2, 3 ------------------------------------------------------------------ */
test("2+3 · Die gesamte Anwendung laeuft mit dem MockProvider, ohne API-Key", () => {
  const registry = Provider.createRegistry().registerAll(provider);
  assert.equal(registry.list().length, Object.keys(Provider.INTERFACES).length);
  assert.equal(provider.healthCheck().status, "ok");

  const secretPatterns = [
    /process\.env\./, /import\.meta\.env/, /\bapi[_-]?key\b\s*[:=]\s*["'][^"']+["']/i,
    /Bearer\s+[A-Za-z0-9._-]{12,}/, /\bsk-[A-Za-z0-9]{16,}/, /Authorization\s*:/i
  ];
  for (const file of walk(QUANT, [".js", ".json", ".html", ".css"], [join(QUANT, "tests")])) {
    const source = readFileSync(file, "utf8");
    for (const pattern of secretPatterns) {
      assert.ok(!pattern.test(source), `${file}: moeglicher Schluessel- oder Env-Zugriff (${pattern})`);
    }
  }

  // Kein Netzwerkzugriff ausser der Schriftart im Stylesheet.
  for (const file of walk(QUANT, [".js"], [join(QUANT, "tests")])) {
    const source = readFileSync(file, "utf8");
    const urls = source.match(/https?:\/\/[^\s"')]+/g) || [];
    for (const url of urls) {
      assert.ok(/w3\.org|schema|example|localhost/.test(url), `${file}: externer Aufruf ${url}`);
    }
  }
});

/* 4 --------------------------------------------------------------------- */
test("4 · Jede Finanzkennzahl fuehrt ihren Stichtag mit", () => {
  for (const row of metricPanel.rows) {
    assert.match(row.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.asOf <= asOf);
  }
  const facts = provider.getFacts("sec_VU0004", { quarters: 2 }).data;
  for (const fact of facts) {
    for (const field of ["periodEnd", "reportedAt", "filedAt", "availableAt", "ingestedAt"]) {
      assert.ok(fact[field], `${field} fehlt an FundamentalFact`);
    }
  }
  const res = provider.getPriceBars("sec_VU0004", { from: "2026-08-03", to: "2026-08-07" });
  assert.ok(res.provenance.asOf);
  for (const bar of res.data) assert.match(bar.date, /^\d{4}-\d{2}-\d{2}$/);
});

/* 5, 6 ------------------------------------------------------------------ */
test("5+6 · Jeder Score fuehrt Methodikversion und Datenabdeckung mit", () => {
  const version = Methodology.quant().methodologyVersion;
  for (const score of scorePanel.scores) {
    assert.equal(score.methodologyVersion, version);
    assert.ok(Number.isFinite(score.coverage) && score.coverage >= 0 && score.coverage <= 1);
    assert.ok(Schema.COVERAGE_CONFIDENCE.includes(score.confidence));
    assert.ok(score.dataSnapshotId);
    for (const factor of Object.keys(score.factorCoverage)) {
      assert.ok(Number.isFinite(score.factorCoverage[factor]), `${factor} ohne Coverage`);
    }
  }
});

/* 7 --------------------------------------------------------------------- */
test("7 · Die Faktorbeitraege reproduzieren den Composite Score", () => {
  const scored = scorePanel.scores.filter((s) => s.status === "scored");
  assert.ok(scored.length > 400);
  for (const score of scored) {
    const sum = Object.values(score.factorContributions).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - score.compositeScore) < 0.005,
      `${score.ticker}: Summe ${sum} ≠ Composite ${score.compositeScore}`);
  }
});

/* 8 --------------------------------------------------------------------- */
test("8 · Historische Faktoren liegen als Snapshots vor", () => {
  const history = Radar.createHistory(Methodology.quant().methodologyVersion, dataset.meta.dataSnapshotId);
  for (const date of ["2026-07-03", "2026-08-07", asOf]) {
    const panel = Factors.computeMetricPanel({
      securities: provider.getSecurities({ asOf: date }).data,
      pricePanel: provider.getPricePanel().data,
      factPanel: provider.getFactPanel({ asOf: date, quarters: 9 }).data,
      asOf: date
    });
    Radar.appendSnapshot(history, QuantScore.computeScorePanel({ metricPanel: panel }));
  }
  assert.equal(history.dates.length, 3);
  const series = history.series["sec_VU0001"] || history.series[Object.keys(history.series)[0]];
  assert.equal(series.score.length, 3);
  assert.equal(series.quality.length, 3);

  const velocity = Radar.computeVelocity(history, Object.keys(history.series)[0]);
  assert.ok("scoreVelocity30d" in velocity && "scoreAcceleration" in velocity);
});

/* 9 --------------------------------------------------------------------- */
test("9 · Der Backtest kann keine zukuenftigen Fundamentaldaten sehen", () => {
  const decisionDate = "2019-03-29";
  const panel = provider.getFactPanel({ asOf: decisionDate, quarters: 9 }).data;
  let count = 0;
  for (const periods of Object.values(panel.periods)) {
    for (const p of periods) { assert.ok(p.availableAt <= decisionDate); count++; }
  }
  assert.ok(count > 1000);
  // Der Zukunftsdatensatz der Fixture ist auch heute unsichtbar.
  const today = provider.getFacts("sec_VUF010", { asOf, quarters: 12 }).data;
  assert.ok(today.every((f) => f.availableAt <= asOf));
  assert.ok(dataset.financials["sec_VUF010"].some((p) => p.availableAt > asOf), "Fixture enthaelt keinen Zukunftsdatensatz mehr");
});

/* 10 -------------------------------------------------------------------- */
test("10 · Ein delistetes Unternehmen bleibt im historischen Universum", () => {
  assert.ok(provider.getSecurities({ asOf: "2018-06-01" }).data.some((s) => s.fixtureId === "MOCK_DELISTED"));
  assert.ok(!provider.getSecurities({ asOf }).data.some((s) => s.fixtureId === "MOCK_DELISTED"));
  assert.ok(provider.getUniverseMembership("US_EQUITIES", "2018-06-01").data.some((m) => m.securityId === "sec_VUF008"));
  assert.ok(!provider.getUniverseMembership("US_EQUITIES", asOf).data.some((m) => m.securityId === "sec_VUF008"));
});

/* 11 -------------------------------------------------------------------- */
test("11 · Eine Korrektur wirkt nicht rueckwaerts", () => {
  const before = provider.getFacts("sec_VUF009", { asOf: "2018-01-15", periodEnd: "2017-03-31", metricId: "revenue" }).data[0];
  const after = provider.getFacts("sec_VUF009", { asOf: "2019-01-15", periodEnd: "2017-03-31", metricId: "revenue" }).data[0];
  assert.equal(before.revisionId, 0);
  assert.equal(before.restatementStatus, "original");
  assert.equal(after.revisionId, 1);
  assert.ok(after.value < before.value);
});

/* 12 -------------------------------------------------------------------- */
test("12 · Ein Signal auf dem Schlusskurs handelt nicht vor dem naechsten zulaessigen Zeitpunkt", () => {
  const run = Backtest.runBacktest({
    definition: Strategy.libraryStrategies()[0].versions[0].definition,
    startDate: "2024-01-02", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  const days = dataset.tradingDays;
  for (const r of run.rebalances) {
    assert.ok(r.executionDate > r.decisionDate);
    assert.equal(days[days.indexOf(r.decisionDate) + 1], r.executionDate);
  }
  for (const trade of run.trades.filter((t) => t.reason === "rebalance")) {
    assert.ok(run.rebalances.some((r) => r.executionDate === trade.date),
      `Trade am ${trade.date} ohne zugehoerigen Ausfuehrungstag`);
  }
});

/* 13 -------------------------------------------------------------------- */
test("13 · Transaktionskosten wirken sich auf die Rendite aus", () => {
  const base = Strategy.libraryStrategies()[0].versions[0].definition;
  const expensive = JSON.parse(JSON.stringify(base));
  expensive.execution.transactionCostsBps = 100;
  expensive.execution.slippageBps = 100;

  const cheap = Backtest.runBacktest({ definition: base, startDate: "2022-01-03", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId });
  const costly = Backtest.runBacktest({ definition: expensive, startDate: "2022-01-03", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId });

  assert.ok(costly.metrics.totalCosts > cheap.metrics.totalCosts * 5);
  assert.ok(costly.metrics.cagr < cheap.metrics.cagr,
    `${costly.metrics.cagr}% muesste unter ${cheap.metrics.cagr}% liegen`);
});

/* 14 -------------------------------------------------------------------- */
test("14 · Jeder Backtest erhaelt einen Reproduktionshash", () => {
  const run = Backtest.runBacktest({
    definition: Strategy.libraryStrategies()[1].versions[0].definition,
    startDate: "2024-01-02", endDate: "2026-09-04",
    provider, dataSnapshotId: dataset.meta.dataSnapshotId
  });
  assert.match(run.reproductionHash, /^bt_[0-9a-f]{16}$/);
  for (const key of ["strategyVersionHash", "dataSnapshotId", "engineVersion", "methodologyVersion",
                     "executionAssumptions", "period"]) {
    assert.ok(key in run.reproductionInput, `${key} fehlt im Reproduktionsschluessel`);
  }
});

/* 15 -------------------------------------------------------------------- */
test("15 · Ein ungueltiges Strategy Schema wird abgelehnt", () => {
  const invalid = [
    Strategy.createDefinition({ rebalance: "daily" }),
    Strategy.createDefinition({ ranking: { factors: [{ factor: "quality", weight: 0.3 }] } }),
    Strategy.createDefinition({ ranking: { factors: [{ factor: "revisions", weight: 1 }] } })
  ];
  for (const def of invalid) {
    assert.equal(Strategy.validate(def).valid, false);
    assert.throws(() => Strategy.assertValid(def), /Invalid strategy definition/);
    assert.throws(() => Backtest.runBacktest({ definition: def, provider, startDate: "2024-01-02" }),
      /Invalid strategy definition/);
  }
});

/* 16 -------------------------------------------------------------------- */
test("16 · Ungueltiges VUQL wird abgelehnt und nicht ausgefuehrt", () => {
  for (const source of ["ERFUNDEN > 5", "UNIVERSE MARS", "LIMIT viele", "MOMENTUM_6M PCTL >= 900"]) {
    const parsed = VUQL.parse(source);
    assert.equal(parsed.ok, false, source);
    assert.equal(parsed.query, null);
  }
  assert.throws(() => Query.execute(Query.createQuery({ filters: [{ field: "x", operator: "gt", value: 1 }] }), []),
    /Invalid query/);
});

/* 17, 18 ---------------------------------------------------------------- */
test("17+18 · Die AI kann kein SQL ausfuehren und nur registrierte Werkzeuge nutzen", async () => {
  const registry = AiTools.createToolRegistry({});
  for (const name of ["sql", "SELECT", "runSql", "eval", "exec", "fetch", "readFile", "dropTable"]) {
    const res = await registry.call(name, {});
    assert.equal(res.ok, false);
    assert.match(res.error, /Unbekanntes Werkzeug/);
  }
  const registered = registry.list().map((t) => t.name);
  assert.ok(registered.length >= 13, "§49 verlangt mindestens 13 Werkzeuge");
  for (const required of ["screenStocks", "getStockSnapshot", "compareStocks", "getQuantScore",
                          "explainQuantScore", "getFactorHistory", "rankStocks", "createStrategy",
                          "validateStrategy", "runBacktest", "compareBacktests",
                          "getCurrentStrategyHoldings", "getWatchlistChanges"]) {
    assert.ok(registered.includes(required), `Werkzeug ${required} fehlt (§49)`);
  }
});

/* 19 -------------------------------------------------------------------- */
test("19 · Eine AI-erzeugte Strategie wird vor der Ausfuehrung validiert", async () => {
  const ai = AiProvider.createMockAiProvider();
  const interpretation = ai.interpretStrategy("Baue mir eine Strategie mit Quality und Momentum und wenig Volatilitaet");
  assert.ok(interpretation.strategyValidation, "die Interpretation traegt kein Validierungsergebnis");
  assert.equal(interpretation.strategyValidation.valid, true);

  let executed = false;
  const registry = AiTools.createToolRegistry({ runBacktest: async () => { executed = true; return { ok: true }; } });
  const rejected = await registry.call("runBacktest", { definition: Strategy.createDefinition({ rebalance: "daily" }) });
  assert.equal(rejected.ok, false);
  assert.equal(executed, false, "eine ungueltige Definition darf die Engine nie erreichen");

  const accepted = await registry.call("runBacktest", { definition: interpretation.strategyDefinition });
  assert.equal(accepted.ok, true);
  assert.equal(executed, true);
});

/* 20 -------------------------------------------------------------------- */
test("20 · Eine Strategieaenderung erzeugt eine neue Version", () => {
  const record = Strategy.createStrategy({ name: "T", thesis: "t", origin: "builder",
    definition: Strategy.createDefinition({}) });
  const changed = JSON.parse(JSON.stringify(record.versions[0].definition));
  changed.portfolio.positions = 40;
  const updated = Strategy.addVersion(record, changed, "Mehr Positionen");
  assert.equal(updated.versions.length, 2);
  assert.equal(updated.versions[0].definition.portfolio.positions, 25, "V1 wurde veraendert");
  assert.equal(updated.versions[1].parentVersion, 1);
  assert.ok(updated.versions[1].changeReason);
});

/* 21 -------------------------------------------------------------------- */
test("21 · Datenherkunft ist einsehbar", () => {
  const res = provider.getFacts("sec_VU0009", { quarters: 1 });
  const p = res.provenance;
  for (const field of ["provider", "source", "asOf", "ingestedAt", "dataSnapshotId", "isMock"]) {
    assert.ok(p[field] !== undefined, `Provenance ohne ${field}`);
  }
  assert.equal(Schema.validate("DataProvenance", p).valid, true);
  assert.equal(dataset.dataSources[0].isMock, true);
  assert.equal(dataset.dataSources[0].licenseStatus, "mock");
  for (const fact of res.data) assert.equal(fact.dataSourceId, Generator.DATA_SOURCE_ID);
});

/* 22 -------------------------------------------------------------------- */
test("22 · Fehlende Provider-Daten werden ausgewiesen statt erfunden", () => {
  for (const res of [provider.getEstimates("sec_VU0001"), provider.getRevisionHistory("sec_VU0001"),
                     provider.getIndicator("CPI"), provider.getNews("sec_VU0001"),
                     provider.getUniverse("EU_EQUITIES")]) {
    assert.equal(res.available, false);
    assert.equal(res.data, null);
    assert.ok(res.reason.length > 20);
  }
  // Der Revisions-Faktor existiert im Schema, wird aber nicht befuellt.
  assert.equal(Methodology.quant().factors.revisions.available, false);
  assert.ok(!QuantScore.activeFactors(Methodology.quant()).includes("revisions"));
  // Ein Titel ohne Daten bekommt keinen Score, sondern einen Status.
  const missing = scorePanel.scores.find((s) => s.ticker === "VUF007");
  assert.equal(missing.status, "incomplete");
  assert.equal(missing.score, null);
});

/* Regulatorische Sprache (§81) ------------------------------------------ */
test("§81 · Die Oberflaeche verwendet keine Kauf- oder Verkaufsempfehlungen", () => {
  const forbidden = [
    /\bSTRONG BUY\b/i, /\bBUY\b(?!ER)/, /\bSELL\b/, /\bkaufempfehlung/i, /\bverkaufsempfehlung/i,
    /solltest du kaufen/i, /solltest du verkaufen/i, /\bkursziel/i, /\btop pick/i, /\bjetzt kaufen/i
  ];
  const files = [
    ...walk(join(QUANT, "ui"), [".js"]),
    ...walk(QUANT, [".html"]),
    ...walk(QUANT, [".js"], [join(QUANT, "engines"), join(QUANT, "tests")])
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      const match = source.match(pattern);
      // "keine Kaufempfehlung" und "keine Aufforderung zum Kauf" sind
      // Abgrenzungen, keine Empfehlungen.
      if (match && !new RegExp("(keine|nicht|kein)[^.]{0,60}" + match[0], "i").test(source)) {
        assert.fail(`${file}: unzulaessige Formulierung "${match[0]}"`);
      }
    }
  }
});

/* Mock-Kennzeichnung (§94) ---------------------------------------------- */
test("§94 · Synthetische Daten sind als solche gekennzeichnet", () => {
  for (const security of dataset.securities) {
    assert.equal(security.isMock, true);
    assert.match(security.name, /^VU Mock /);
  }
  const meta = JSON.parse(readFileSync(join(QUANT, "data", "meta.json"), "utf8"));
  assert.equal(meta.isMock, true);
  assert.ok(meta.mockNotice.length > 40);

  // Jede Seite bindet die gemeinsame Shell ein, die das Banner rendert.
  for (const page of walk(QUANT, [".html"])) {
    const html = readFileSync(page, "utf8");
    assert.ok(html.includes("/quant/ui/shell.js"), `${page} ohne gemeinsame Shell`);
  }
  assert.ok(readFileSync(join(QUANT, "ui", "shell.js"), "utf8").includes("q-mock-banner"));
});

/* Zentrale Methodik (§72) ----------------------------------------------- */
test("§72 · Alle Methodikparameter liegen zentral und versioniert", () => {
  for (const entry of Methodology.list()) {
    assert.match(entry.methodologyVersion, /^[a-z-]+-v\d+\.\d+\.\d+$/, entry.id);
  }
  const factorWeightSum = Object.values(Methodology.quant().factorWeights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(factorWeightSum - 1) < 1e-9);

  const trust = Methodology.trustScore();
  assert.equal(Object.values(trust.blocks).reduce((s, b) => s + b.points, 0), 100);
  for (const block of Object.values(trust.blocks)) {
    assert.equal(Object.values(block.checks).reduce((s, c) => s + c.points, 0), block.points);
  }
});
