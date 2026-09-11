/* Der Discover-Contract: Wert und Status gehoeren zusammen. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Contract = require(join(root, "discover", "engines", "contract.js"));

test("Normalisierung fuellt jede Metrik mit Wert und Status", () => {
  const s = Contract.normalizeStock({ symbol: "aapl", dataMode: "real",
                                      metrics: { return3M: 0.1 } });
  assert.equal(s.symbol, "AAPL");
  assert.equal(s.metrics.return3M, 0.1);
  assert.equal(s.metricStatus.return3M, "CALCULATED");
  assert.equal(s.metrics.leadershipScore, null);
  assert.equal(s.metricStatus.leadershipScore, "SOURCE_MISSING");
  Contract.assertStock(s);
});

test("ein zurueckgehaltener Preis ist null MIT Grund", () => {
  const s = Contract.normalizeStock({ symbol: "MSFT", dataMode: "real",
    price: Contract.field(null, "WITHHELD_REDISTRIBUTION") });
  assert.equal(s.price.value, null);
  assert.equal(s.price.status, "WITHHELD_REDISTRIBUTION");
  Contract.assertStock(s);
});

test("ein Wert mit Nicht-CALCULATED-Status wird abgelehnt", () => {
  assert.throws(() => Contract.field(12, "WITHHELD_REDISTRIBUTION"), /Wert und Status/);
});

test("ein unbekannter Feldstatus wird abgelehnt", () => {
  assert.throws(() => Contract.field(null, "IRGENDWAS"), /unbekannter Feldstatus/);
});

test("Preis ohne Wert, aber mit Status CALCULATED, faellt durch", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "real" });
  s.price = { value: null, status: "CALCULATED" };
  assert.throws(() => Contract.assertStock(s), /ohne Wert, aber Status CALCULATED/);
});

test("real und isMock zugleich ist ein Widerspruch", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "real" });
  s.isMock = true;
  assert.throws(() => Contract.assertStock(s), /real und zugleich als Mock/);
});

test("ein 52-Wochen-Hoch ohne Abstandskennzahl ist eine Behauptung", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "real",
                                      signals: { new52WeekHigh: true } });
  assert.throws(() => Contract.assertStock(s), /ohne Abstandskennzahl/);
});

test("Market Leader ohne Score faellt durch", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "real",
                                      signals: { marketLeader: true } });
  assert.throws(() => Contract.assertStock(s), /ohne Leadership Score/);
});

test("ungueltige Symbole werden abgelehnt", () => {
  for (const bad of ["", "viel zu langes symbol", "A B"]) {
    const s = Contract.normalizeStock({ symbol: bad, dataMode: "real" });
    assert.throws(() => Contract.assertStock(s), /ungueltiges Symbol/);
  }
});

test("toCard laesst kein Feld weg, das eine Karte zeigt", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "mock", companyName: "Test",
                                      metrics: { leadershipScore: 70 } });
  const card = Contract.toCard(s);
  for (const key of ["symbol", "companyName", "dataMode", "price", "changePercent",
                     "sparkline", "signals", "metrics", "metricStatus", "badges", "asOf"]) {
    assert.ok(key in card, "Card ohne " + key);
  }
});

test("unbekannte Signale werden nicht durchgereicht", () => {
  const s = Contract.normalizeStock({ symbol: "X", dataMode: "mock",
                                      signals: { erfundenesSignal: true } });
  assert.equal(s.signals.erfundenesSignal, undefined);
});
