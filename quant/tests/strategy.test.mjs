// Strategy-Schema-, Query- und VUQL-Tests.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Strategy = require("../engines/strategy.js");
const Query = require("../engines/query.js");
const VUQL = require("../engines/vuql.js");
const Catalog = require("../engines/catalog.js");

/* ------------------------------- Query-AST -------------------------------- */

test("Ein gueltiger Query-AST wird akzeptiert", () => {
  const q = Query.createQuery({
    filters: [
      { field: "sector", operator: "eq", value: "Technology" },
      { field: "freeCashFlow", operator: "gt", value: 0 },
      { field: "momentum6m", operator: "gte", value: 80, scale: "percentile" }
    ]
  });
  assert.equal(Query.validate(q).valid, true);
});

test("Unbekannte Felder, Operatoren und Universen werden abgelehnt (§30)", () => {
  const cases = [
    [{ field: "erfundenesFeld", operator: "gt", value: 1 }, /unknown field/],
    [{ field: "roic", operator: "beinahe", value: 1 }, /unknown operator/],
    [{ field: "roic", operator: "in", value: ["a"] }, /not allowed for number/]
  ];
  for (const [filter, pattern] of cases) {
    const res = Query.validate(Query.createQuery({ filters: [filter] }));
    assert.equal(res.valid, false);
    assert.match(res.errors.join(" "), pattern);
  }
  const badUniverse = Query.createQuery({ universe: { universeId: "MARS_EQUITIES", region: "MARS", assetType: "equity" } });
  assert.match(Query.validate(badUniverse).errors.join(" "), /unknown universe/);
});

test("Einheiten und Wertebereiche werden geprueft", () => {
  const tooHigh = Query.createQuery({ filters: [{ field: "momentum6m", operator: "gte", value: 140, scale: "percentile" }] });
  assert.match(Query.validate(tooHigh).errors.join(" "), /between 0 and 100/);

  const noPercentile = Query.createQuery({ filters: [{ field: "ticker", operator: "eq", value: "VU0001", scale: "percentile" }] });
  assert.match(Query.validate(noPercentile).errors.join(" "), /no percentile representation/);

  const badEnum = Query.createQuery({ filters: [{ field: "sector", operator: "eq", value: "Raumfahrt" }] });
  assert.match(Query.validate(badEnum).errors.join(" "), /not a valid value/);
});

test("Widerspruechliche Filter werden erkannt, nicht still zu null Treffern", () => {
  const q = Query.createQuery({ filters: [
    { field: "roic", operator: "gte", value: 30 },
    { field: "roic", operator: "lte", value: 5 }
  ]});
  assert.match(Query.validate(q).errors.join(" "), /contradictory/);
});

test("Ein ungueltiger AST wird niemals ausgefuehrt", () => {
  const q = Query.createQuery({ filters: [{ field: "nichts", operator: "gt", value: 1 }] });
  assert.throws(() => Query.execute(q, []), /Invalid query/);
});

test("Fehlende Daten erfuellen keinen Filter", () => {
  const rows = [
    { ticker: "A", status: "active", roic: 15, quantScore: 50 },
    { ticker: "B", status: "active", roic: null, quantScore: 90 }
  ];
  const q = Query.createQuery({ filters: [{ field: "roic", operator: "gte", value: 10 }] });
  const res = Query.execute(q, rows);
  assert.deepEqual(res.rows.map((r) => r.ticker), ["A"]);
});

test("Delistete Titel erscheinen nicht im aktuellen Screener, sind aber abrufbar", () => {
  const rows = [
    { ticker: "A", status: "active", quantScore: 50 },
    { ticker: "Z", status: "delisted", quantScore: 99 }
  ];
  const q = Query.createQuery({ filters: [] });
  assert.deepEqual(Query.execute(q, rows).rows.map((r) => r.ticker), ["A"]);
  assert.equal(Query.execute(q, rows, { includeDelisted: true }).rows.length, 2);
  const explicit = Query.createQuery({ filters: [{ field: "status", operator: "eq", value: "delisted" }] });
  assert.deepEqual(Query.execute(explicit, rows).rows.map((r) => r.ticker), ["Z"]);
});

/* ---------------------------------- VUQL ---------------------------------- */

test("VUQL parst das Beispiel aus der Spezifikation", () => {
  const res = VUQL.parse([
    "UNIVERSE US_EQUITIES",
    "SECTOR Technology",
    "MOMENTUM_6M PCTL >= 80",
    "DISTANCE_52W_HIGH <= 3%",
    "FCF > 0",
    "SORT QUANT_SCORE DESC",
    "LIMIT 25"
  ].join("\n"));
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.query.filters.length, 4);
  assert.deepEqual(res.query.filters[1], { field: "momentum6m", operator: "gte", value: 80, scale: "percentile" });
  assert.equal(res.query.limit, 25);
});

test("VUQL ist verlustfrei serialisierbar (Roundtrip)", () => {
  const original = Query.createQuery({
    filters: [
      { field: "sector", operator: "in", value: ["Technology", "Health Care"] },
      { field: "roic", operator: "gte", value: 12 },
      { field: "volatility", operator: "lte", value: 30, scale: "percentile" },
      { field: "marketCap", operator: "between", value: [1000, 50000] }
    ],
    sort: [{ field: "momentumScore", direction: "desc" }], limit: 40
  });
  const parsed = VUQL.parse(VUQL.serialize(original));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.deepEqual(parsed.query.filters, original.filters);
  assert.deepEqual(parsed.query.sort, original.sort);
  assert.equal(parsed.query.limit, original.limit);
});

test("Ungueltiges VUQL wird mit Zeilennummer abgelehnt und nicht ausgefuehrt (§30)", () => {
  const cases = [
    ["BOGUS_FIELD > 5", /Unbekanntes Feld/],
    ["UNIVERSE MARS", /Unbekanntes Universum/],
    ["SORT VU_QUANT_SCORE SIDEWAYS", /Unbekanntes Feld|ASC oder DESC/],
    ["ROIC >", /Fehlender Wert|keine gueltige Zahl/],
    ["LIMIT viele", /ganze Zahl/],
    ["TICKER PCTL >= 50", /kein Perzentil/]
  ];
  for (const [source, pattern] of cases) {
    const res = VUQL.parse(source);
    assert.equal(res.ok, false, `"${source}" haette abgelehnt werden muessen`);
    assert.equal(res.query, null);
    assert.match(res.errors.map((e) => e.message).join(" "), pattern);
  }
  assert.ok(VUQL.parse("BOGUS_FIELD > 5").errors[0].line >= 1);
});

test("VUQL akzeptiert Prozent-, Mio.- und Mrd.-Schreibweisen", () => {
  assert.equal(VUQL.parseNumber("3%"), 3);
  assert.equal(VUQL.parseNumber("250M"), 250);
  assert.equal(VUQL.parseNumber("1.5B"), 1500);
  assert.equal(VUQL.parseNumber("keine Zahl"), null);
});

test("Kommentare und Leerzeilen sind erlaubt", () => {
  const res = VUQL.parse("# Kommentar\n\nSECTOR Technology  -- inline\nLIMIT 10");
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.query.filters.length, 1);
});

/* -------------------------------- Strategien ------------------------------ */

test("Die fuenf Bibliotheksstrategien sind gueltig", () => {
  const library = Strategy.libraryStrategies();
  assert.equal(library.length, 5);
  for (const rec of library) {
    const res = Strategy.validate(rec.versions[0].definition);
    assert.ok(res.valid, `${rec.strategy.name}: ${res.errors.join("; ")}`);
    assert.ok(rec.strategy.thesis.length > 80, "jede Strategie braucht eine Thesis");
    assert.ok(rec.strategy.mainRisk.length > 40, "jede Strategie braucht ein benanntes Hauptrisiko");
  }
});

test("Ungueltige Strategy Definitions werden abgelehnt (§74)", () => {
  const cases = [
    [{ ranking: { factors: [{ factor: "quality", weight: 0.4 }, { factor: "momentum", weight: 0.4 }] } }, /sum to 1/],
    [{ ranking: { factors: [{ factor: "revisions", weight: 1 }] } }, /not available/],
    [{ ranking: { factors: [{ factor: "erfunden", weight: 1 }] } }, /unknown factor/],
    [{ rebalance: "daily" }, /rebalance: must be one of/],
    [{ execution: { timing: "same_close", transactionCostsBps: 5, slippageBps: 5 } }, /execution.timing/],
    [{ portfolio: { positions: 2, weighting: "equal", maxPositionWeight: 0.08, maxSectorWeight: 0.3, minDollarVolumeM: 5, minMarketCapM: 300 } }, /positions: must be between/],
    [{ portfolio: { positions: 25, weighting: "gleich", maxPositionWeight: 0.08, maxSectorWeight: 0.3, minDollarVolumeM: 5, minMarketCapM: 300 } }, /weighting: must be one of/],
    [{ portfolio: { positions: 25, weighting: "equal", maxPositionWeight: 0.02, maxSectorWeight: 0.3, minDollarVolumeM: 5, minMarketCapM: 300 } }, /cannot reach 100/],
    [{ filters: [{ field: "erfunden", operator: "gt", value: 1, scale: "raw" }] }, /unknown field/]
  ];
  for (const [patch, pattern] of cases) {
    const def = Strategy.createDefinition(patch);
    const res = Strategy.validate(def);
    assert.equal(res.valid, false, JSON.stringify(patch));
    assert.match(res.errors.join(" "), pattern);
  }
});

test("Unbekannte Top-Level-Felder werden abgelehnt", () => {
  const def = Strategy.createDefinition({});
  def.leverage = 2;
  assert.match(Strategy.validate(def).errors.join(" "), /unknown field 'leverage'/);
});

test("Eine Aenderung erzeugt eine neue Version und laesst die alte unberuehrt (§32)", () => {
  const record = Strategy.createStrategy({
    name: "Test", thesis: "t", origin: "builder", definition: Strategy.createDefinition({})
  });
  const v1Hash = record.versions[0].definitionHash;
  const changed = JSON.parse(JSON.stringify(record.versions[0].definition));
  changed.portfolio.positions = 40;

  const updated = Strategy.addVersion(record, changed, "Mehr Positionen");
  assert.equal(updated.versions.length, 2);
  assert.equal(updated.strategy.latestVersion, 2);
  assert.equal(updated.versions[1].parentVersion, 1);
  assert.equal(updated.versions[0].definitionHash, v1Hash, "V1 darf sich nicht aendern");
  assert.equal(updated.versions[0].definition.portfolio.positions, 25);
  assert.notEqual(updated.versions[1].definitionHash, v1Hash);
});

test("Eine identische oder unbegruendete Version wird abgelehnt", () => {
  const record = Strategy.createStrategy({
    name: "Test", thesis: "t", origin: "builder", definition: Strategy.createDefinition({})
  });
  assert.throws(() => Strategy.addVersion(record, record.versions[0].definition, "keine Aenderung"), /identical/);
  const changed = JSON.parse(JSON.stringify(record.versions[0].definition));
  changed.portfolio.positions = 40;
  assert.throws(() => Strategy.addVersion(record, changed, "   "), /changeReason is required/);
});

test("Lineage bildet Verzweigungen ab (§33)", () => {
  let record = Strategy.createStrategy({
    name: "Basis", thesis: "t", origin: "builder", definition: Strategy.createDefinition({})
  });
  const defensive = JSON.parse(JSON.stringify(record.versions[0].definition));
  defensive.portfolio.maxSectorWeight = 0.25;
  record = Strategy.addVersion(record, defensive, "Defensiver");

  const growth = JSON.parse(JSON.stringify(record.versions[0].definition));
  growth.ranking.factors = [{ factor: "growth", weight: 0.6 }, { factor: "quality", weight: 0.4 }];
  record = Strategy.addVersion(record, growth, "Mehr Wachstum", { parentVersion: 1 });

  const tree = Strategy.lineage(record);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].version, 1);
  assert.deepEqual(tree[0].children.map((c) => c.version), [2, 3]);
});

test("Der Diff zweier Versionen benennt genau die Aenderung", () => {
  const a = Strategy.createDefinition({});
  const b = Strategy.createDefinition({ portfolio: Object.assign({}, a.portfolio, { positions: 40 }) });
  const diff = Strategy.diff(a, b);
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0], { path: "portfolio.positions", from: 25, to: 40 });
});

test("definitionHash ist stabil gegenueber der Feldreihenfolge", () => {
  const a = Strategy.createDefinition({});
  const b = JSON.parse(JSON.stringify(a));
  const reordered = { execution: b.execution, rebalance: b.rebalance, portfolio: b.portfolio,
                      ranking: b.ranking, filters: b.filters, universe: b.universe, schemaVersion: b.schemaVersion };
  assert.equal(Strategy.definitionHash(a), Strategy.definitionHash(reordered));
});

test("Strategiefilter und Screenerfilter teilen denselben Validator (§27)", () => {
  const def = Strategy.createDefinition({ filters: [{ field: "erfunden", operator: "gt", value: 1, scale: "raw" }] });
  const strategyErrors = Strategy.validate(def).errors.join(" ");
  const queryErrors = Query.validate(Query.createQuery({ filters: def.filters })).errors.join(" ");
  assert.match(strategyErrors, /unknown field/);
  assert.match(queryErrors, /unknown field/);
});

test("Der Feldkatalog ist konsistent: eindeutige IDs und VUQL-Tokens", () => {
  const ids = new Set(), tokens = new Set();
  for (const field of Catalog.FIELD_LIST) {
    assert.ok(!ids.has(field.id), `doppelte Feld-ID ${field.id}`);
    assert.ok(!tokens.has(field.token), `doppeltes Token ${field.token}`);
    ids.add(field.id); tokens.add(field.token);
    assert.equal(Catalog.fieldByToken(field.token).id, field.id);
  }
});
