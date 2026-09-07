// AI-Layer-Tests: Provider-Interface, Intent-Parsing, Tool-Sicherheitsgrenze.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AiProvider = require("../engines/ai-provider.js");
const AiTools = require("../engines/ai-tools.js");
const Query = require("../engines/query.js");
const Strategy = require("../engines/strategy.js");

const ai = AiProvider.createMockAiProvider();

/* Ein Zugriffs-Stub: die Registry kennt weder Datenbank noch Dateisystem,
   sondern nur die Funktionen, die ihr uebergeben werden. */
function stubAccess(overrides = {}) {
  return Object.assign({
    screen: async (query) => ({ ok: true, result: { matchedCount: 3, universeSize: 100, rows: [
      { ticker: "VU0001", quantScore: 91 }, { ticker: "VU0002", quantScore: 80 }, { ticker: "VU0003", quantScore: 71 }
    ] } }),
    getStockQuant: async (ticker) => ({
      found: true, asOf: "2026-09-04", methodologyVersion: "quant-v1.0.0",
      row: { ticker, name: "VU Mock", industry: "Semiconductors", quantScore: 91, coverage: 0.97 },
      dna: { score: 91, compositeScore: 74.2, status: "scored", coverage: 0.97, confidence: "high",
             factorContributions: { quality: 28.1, momentum: 27.4, growth: 17, value: 12.4, risk: 6.1 },
             effectiveWeights: { quality: 0.3 }, factorScores: { quality: 94 }, peerGroups: {} }
    }),
    getRanking: async (id) => ({ found: true, rankingId: id, asOf: "2026-09-04",
      entries: [{ rank: 1, ticker: "VU0001", value: 100 }] }),
    getFactorHistory: async () => ({ found: true, points: [] }),
    createStrategy: async (f) => ({ ok: true, record: { strategy: { strategyId: "s1", name: f.name } } }),
    runBacktest: async () => ({ ok: true, record: { backtestId: "run_x", startDate: "2011-01-03", endDate: "2026-09-04",
      metrics: { cagr: 12.3, maxDrawdown: -33.1, benchmark: { cagr: 10.1 } }, trustScore: { score: 74, label: "Solide" } } }),
    compareBacktests: async () => ({ backtests: [] }),
    getCurrentHoldings: async () => ({ found: true, holdings: [] }),
    getWatchlistIntelligence: async () => ({ members: [1, 2, 3], events: [1] }),
    getMethodology: async (id) => ({ found: true, methodology: { id, methodologyVersion: "quant-v1.0.0",
      config: { factorWeights: { quality: 0.3, momentum: 0.3, value: 0.15, growth: 0.2, risk: 0.05 } } } })
  }, overrides);
}

/* --------------------------- Provider-Interface --------------------------- */

test("MockAIProvider erfuellt das AIProvider-Interface (§48)", () => {
  assert.ok(AiProvider.implementsAiProvider(ai));
  for (const method of AiProvider.AI_PROVIDER_METHODS) assert.equal(typeof ai[method], "function");
  const health = ai.healthCheck();
  assert.equal(health.status, "ok");
  assert.match(health.message, /Kein Sprachmodell|kein Sprachmodell/);
});

test("Der Mock-Provider gibt sich als Mock zu erkennen", () => {
  assert.equal(ai.isMock, true);
  assert.equal(ai.interpretQuery("Zeige mir Tech-Aktien").isMock, true);
});

/* ------------------------------ Intent-Parsing ---------------------------- */

test("Das Beispiel aus dem Research wird korrekt uebersetzt (§51)", () => {
  const res = ai.interpretQuery(
    "Gib mir profitable Tech-Aktien mit starkem Momentum, die maximal 3 % unter ihrem " +
    "52-Wochen-Hoch stehen und ihre Dividende seit mindestens fuenf Jahren steigern."
  );
  assert.equal(res.intent, "screen");
  assert.equal(res.validation.valid, true);
  const byField = Object.fromEntries(res.query.filters.map((f) => [f.field, f]));
  assert.equal(byField.sector.value, "Technology");
  assert.equal(byField.freeCashFlow.operator, "gt");
  assert.equal(byField.momentum6m.scale, "percentile");
  assert.equal(byField.distanceTo52wHigh.value, 3);
  assert.equal(byField.consecutiveDividendGrowthYears.value, 5);
});

test("Die AI liefert keine Aktie zurueck, sondern eine Abfrage", () => {
  const res = ai.interpretQuery("Zeige mir die besten Technologiewerte");
  assert.equal(typeof res.query, "object");
  assert.ok(!("results" in res) && !("stocks" in res) && !("prices" in res),
    "Die Interpretationsschicht darf keine Ergebnisse enthalten");
});

test("Intents werden unterschieden", () => {
  const cases = [
    ["Zeige mir guenstige Industriewerte", "screen"],
    ["Baue mir eine Strategie mit Quality und Momentum", "strategy"],
    ["Was waere passiert, wenn ich seit 2011 Momentum-Aktien gehalten haette?", "backtest"],
    ["Warum hat VU0001 einen so hohen Score?", "explain"],
    ["Vergleiche VU0001 und VU0002", "compare"],
    ["Was hat sich in meiner Watchlist veraendert?", "watchlist"],
    ["Wie wird der VU Quant Score berechnet?", "methodology"],
    ["Welche Unternehmen haben sich am staerksten verbessert?", "rank"]
  ];
  for (const [text, expected] of cases) assert.equal(AiProvider.detectIntent(text), expected, text);
});

test("Jede AI-erzeugte Abfrage durchlaeuft die Schema-Validierung", () => {
  const inputs = [
    "profitable Technologiewerte mit starkem Momentum",
    "guenstige Aktien mit wenig Volatilitaet",
    "Wachstumswerte mit 20 % Umsatzwachstum",
    "grosse Unternehmen mit steigender Dividende seit acht Jahren",
    "irgendwas voellig Unverstaendliches ohne Finanzbezug"
  ];
  for (const text of inputs) {
    const res = ai.interpretQuery(text);
    if (res.query) assert.equal(Query.validate(res.query).valid, true, text);
    if (res.strategyDefinition) assert.equal(Strategy.validate(res.strategyDefinition).valid, true, text);
  }
});

test("Eine AI-erzeugte Strategie ist immer gueltig (§62)", () => {
  const inputs = [
    "Baue mir eine Strategie mit viel Quality und Momentum, aber wenig Volatilitaet",
    "Strategie aus 40 Wachstumsaktien, quartalsweise",
    "Strategie mit Value und Growth"
  ];
  for (const text of inputs) {
    const res = ai.interpretStrategy(text);
    assert.equal(res.strategyValidation.valid, true, `${text}: ${res.strategyValidation.errors.join("; ")}`);
    const sum = res.strategyDefinition.ranking.factors.reduce((s, f) => s + f.weight, 0);
    assert.ok(Math.abs(sum - 1) < 0.005, `Gewichte summieren zu ${sum}`);
  }
});

test("Feedback erzeugt eine neue Version statt einer nachtraeglichen Optimierung (§97)", () => {
  const base = ai.interpretStrategy("Baue mir eine Strategie mit Quality und Momentum").strategyDefinition;
  const revised = ai.interpretStrategy("Der Drawdown ist mir zu hoch.", { baseDefinition: base });
  assert.equal(revised.intent, "revise");
  assert.equal(revised.strategyValidation.valid, true);
  assert.ok(revised.changes.length > 0, "Aenderungen muessen benannt werden");
  assert.notDeepEqual(revised.strategyDefinition, base);
  // Die Vorversion bleibt unangetastet.
  assert.equal(base.portfolio.maxSectorWeight, 0.3);
  const riskWeight = revised.strategyDefinition.ranking.factors.find((f) => f.factor === "risk");
  assert.ok(riskWeight, "eine Drawdown-Beschwerde muss die Risikodimension einbeziehen");
});

test("Die AI sucht nicht rueckwirkend nach besseren Parametern", () => {
  const base = ai.interpretStrategy("Strategie mit Momentum").strategyDefinition;
  const revised = ai.reviseStrategy("Der Drawdown ist mir zu hoch.", base);
  // Sie ergaenzt Regeln mit Begruendung, statt Schwellen zu verschieben,
  // bis das Ergebnis besser aussieht.
  for (const change of revised.changes) assert.ok(change.length > 15);
  assert.equal(revised.definition.execution.transactionCostsBps, base.execution.transactionCostsBps,
    "Kostenannahmen duerfen nicht heimlich guenstiger werden");
});

/* --------------------------- Tool-Sicherheitsgrenze ----------------------- */

test("Die AI kann kein SQL und keinen freien Code ausfuehren (§50)", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const attempts = ["sql", "runSql", "eval", "exec", "shell", "fetch", "readFile", "database", "queryDatabase"];
  for (const name of attempts) {
    const res = await registry.call(name, { anything: "SELECT * FROM securities" });
    assert.equal(res.ok, false, `${name} haette abgelehnt werden muessen`);
    assert.match(res.error, /Unbekanntes Werkzeug/);
  }
});

test("Verbotene Werkzeugnamen koennen nicht registriert werden", () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  for (const name of AiTools.FORBIDDEN_TOOL_NAMES) {
    assert.throws(() => registry.register({ name, parameters: {} }, () => {}), /ausdruecklich verboten/);
  }
});

test("Es existiert kein Werkzeug mit freiem Datenzugriff", () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const names = registry.list().map((t) => t.name.toLowerCase());
  for (const forbidden of ["sql", "eval", "exec", "fetch", "http", "file", "database"]) {
    assert.ok(!names.some((n) => n.includes(forbidden)), `Werkzeug enthaelt '${forbidden}'`);
  }
});

test("Argumente werden geprueft: fehlende Pflichtfelder und unbekannte Argumente", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  assert.match((await registry.call("rankStocks", {})).error, /Pflichtargument/);
  assert.match((await registry.call("rankStocks", { rankingId: "overall", extra: 1 })).error, /Unbekanntes Argument/);
  assert.match((await registry.call("getStockSnapshot", { ticker: 42 })).error, /erwartet string/);
});

test("screenStocks lehnt einen ungueltigen AST ab", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const res = await registry.call("screenStocks", { query: { version: "1.0", type: "stock_screen",
    universe: { universeId: "US_EQUITIES" }, filters: [{ field: "erfunden", operator: "gt", value: 1, scale: "raw" }],
    sort: [{ field: "quantScore", direction: "desc" }], limit: 10 } });
  assert.equal(res.ok, false);
  assert.match(res.error, /Ungueltiger Query-AST/);
});

test("runBacktest akzeptiert keine natuerliche Sprache (§74)", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const asText = await registry.call("runBacktest", { definition: "kaufe die besten Momentum-Aktien" });
  assert.equal(asText.ok, false);
  assert.match(asText.error, /erwartet object|keine natuerliche Sprache/);

  const invalid = await registry.call("runBacktest", { definition: Strategy.createDefinition({ rebalance: "daily" }) });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Ungueltige Strategy Definition/);

  const valid = await registry.call("runBacktest", { definition: Strategy.createDefinition({}) });
  assert.equal(valid.ok, true);
});

test("Der Aufrufverlauf protokolliert auch abgelehnte Versuche", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  registry.clearLog();
  await registry.call("sqlInjection", {});
  await registry.call("rankStocks", { rankingId: "overall" });
  const log = registry.log();
  assert.equal(log.length, 2);
  assert.equal(log[0].rejected, true);
  assert.equal(log[1].ok, true);
});

/* ------------------------------- Halluzination ---------------------------- */

test("Ohne Werkzeugergebnis gibt es keine Zahl, sondern 'keine Daten' (§54)", () => {
  const empty = ai.explain("screen", { toolResults: [] });
  assert.equal(empty.dataUnavailable, true);
  assert.deepEqual(empty.sources, []);
  assert.ok(!/\d+\s*%/.test(empty.text), "Die Antwort darf keine Zahl enthalten");

  const failed = ai.explain("screen", { toolResults: [{ ok: false, tool: "screenStocks", error: "kaputt" }] });
  assert.equal(failed.dataUnavailable, true);
});

test("Jede Aussage nennt das Werkzeug, aus dem sie stammt", async () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const result = await registry.call("explainQuantScore", { ticker: "VU0001" });
  const explanation = ai.explain("explain", { toolResults: [result] });
  assert.equal(explanation.dataUnavailable, false);
  assert.deepEqual(explanation.sources, ["explainQuantScore"]);
  assert.match(explanation.text, /91/);
  assert.match(explanation.text, /quant-v1\.0\.0/);
});

test("Die Erklaerung erfindet keine Treffer, wenn es keine gibt", async () => {
  const registry = AiTools.createToolRegistry(stubAccess({
    screen: async () => ({ ok: true, result: { matchedCount: 0, universeSize: 482, rows: [] } })
  }));
  const result = await registry.call("screenStocks", { query: Query.createQuery({ filters: [] }) });
  const explanation = ai.explain("screen", { toolResults: [result] });
  assert.match(explanation.text, /keinen Treffer|0 von 482/);
  assert.ok(!/hoechsten VU Quant Score in dieser Auswahl/.test(explanation.text));
});

test("Der Toolplan bleibt innerhalb der registrierten Werkzeuge", () => {
  const registry = AiTools.createToolRegistry(stubAccess());
  const inputs = [
    "profitable Tech-Aktien mit Momentum", "Welche haben sich am staerksten verbessert?",
    "Warum hat VU0001 diesen Score?", "Vergleiche VU0001 und VU0002",
    "Was hat sich in meiner Watchlist veraendert?", "Wie wird der Score berechnet?",
    "Baue eine Strategie mit Quality", "Was waere seit 2011 passiert?"
  ];
  for (const text of inputs) {
    for (const step of ai.interpretQuery(text).toolPlan) {
      assert.ok(registry.has(step.tool), `${text} plant unbekanntes Werkzeug ${step.tool}`);
    }
  }
});
