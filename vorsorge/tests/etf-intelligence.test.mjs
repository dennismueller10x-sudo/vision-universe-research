import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createIssuerAdapter, PARSERS, ISSUERS, parseCsv } from "../../scripts/vorsorge/adapters/issuers.mjs";
import { makeFixture } from "./fixtures/nport/make-fixture.mjs";

const require = createRequire(import.meta.url);
const F = require("../engines/etf-fundamentals.js");
const H = require("../engines/etf-holdings.js");
const C = require("../engines/etf-changes.js");
const X = require("../engines/xray.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ------------------------------------------------------- Fundamentals */
test("Bezeichner: ISIN/CUSIP/SEDOL-Prüfziffern, WKN-Format", () => {
  assert.ok(F.isValidIsin("IE00B4L5Y983")); assert.ok(!F.isValidIsin("IE00B4L5Y984")); assert.ok(F.isValidIsin("US0378331005"));
  assert.ok(F.isValidCusip("037833100")); assert.ok(!F.isValidCusip("037833101"));
  assert.ok(F.isValidSedol("B0YBKJ7")); assert.ok(F.isValidWkn("A0RPWH")); assert.ok(!F.isValidWkn("A0RPWO"));
  assert.equal(F.cleanId("isin", " ie00b4l5y983 "), "IE00B4L5Y983"); assert.equal(F.cleanId("isin", "N/A"), null);
});
test("Kosten: Einheit nie raten, TER und Ongoing Charges getrennt", () => {
  assert.equal(F.normalizeCost("0,20 %"), 0.002);
  assert.equal(F.normalizeCost("0.20", "percent"), 0.002);
  assert.equal(F.normalizeCost(20, "bps"), 0.002);
  assert.equal(F.normalizeCost("0.20"), null, "ohne Einheit kein Wert");
  assert.equal(F.normalizeCost("12", "percent"), null, "12 % ist keine plausible Kostenquote");
  assert.ok(F.FIELDS.includes("ter") && F.FIELDS.includes("ongoingCharges") && F.FIELDS.includes("expenseRatio") && F.FIELDS.includes("managementFee"));
});
test("Merge: Primärquelle gewinnt, Widerspruch wird gespeichert, Datum unterschieden", () => {
  const ctx = (src, type, asOf) => ({ source: src, sourceType: type, asOf });
  const a = { fields: { ter: F.field(0.002, ctx("ISHARES", "PRIMARY_ISSUER", "2026-10-01")), aum: F.field(1e9, ctx("ISHARES", "PRIMARY_ISSUER", "2026-10-01")), aumCurrency: F.field("USD", ctx("ISHARES", "PRIMARY_ISSUER", "2026-10-01")) } };
  const b = { fields: { ter: F.field(0.0022, ctx("SEC_RR", "REGULATORY", "2026-05-01")), aum: F.field(1.2e9, ctx("SEC_NPORT", "REGULATORY", "2026-06-30")) } };
  const { record, conflicts } = F.merge([b, a], { shareClassId: "X" });
  assert.equal(record.ter.value, 0.002); assert.equal(record.ter.source, "ISHARES");
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.every((c) => c.reason === "AS_OF_DIFFERS"));
  assert.deepEqual(F.validate(record), []);
  const bad = Object.assign({}, record, { isin: { value: "IE00B4L5Y984", source: "X" } });
  assert.ok(F.validate(bad).includes("INVALID_ISIN"));
  assert.ok(F.validate(Object.assign({}, record, { ter: { value: 0.002 } })).includes("NO_SOURCE_ter"));
});
test("Replikation, Ertragsverwendung, UCITS, Emittent normalisiert", () => {
  assert.equal(F.normalizeReplication("Optimized Sampling"), "OPTIMIZED_SAMPLING");
  assert.equal(F.normalizeReplication("Synthetisch (Swap)"), "SWAP_BASED");
  assert.equal(F.normalizeDistribution("Thesaurierend"), "ACCUMULATING");
  assert.equal(F.normalizeDistribution("USD (Dist)"), "DISTRIBUTING");
  assert.equal(F.normalizeUcits("Yes"), true); assert.equal(F.normalizeUcits(""), "UNKNOWN");
  assert.equal(F.normalizeIssuer("Xtrackers MSCI World UCITS ETF 1C"), "DWS");
  assert.equal(F.normalizeIssuer("SPDR S&P 500 ETF Trust"), "STATE_STREET");
});

/* ------------------------------------------------------------ Holdings */
const row = (name, w, extra) => Object.assign({ holdingName: name, weight: w, assetType: "EQUITY" }, extra || {});
test("Gewichte: Prozent vs. Dezimal je Datei, 6,8 % bleibt 6,8 %", () => {
  assert.equal(H.inferWeightUnit([6.8, 5, 88.2]), "percent");
  assert.equal(H.inferWeightUnit([0.068, 0.05, 0.882]), "fraction");
  const s = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T" }, [row("NVIDIA", "6,8"), row("Rest", "93,2")]);
  assert.equal(s.holdings.find((h) => h.holdingName === "NVIDIA").weight, 0.068);
  assert.equal(H.parseNumber("1.234,5"), 1234.5); assert.equal(H.parseNumber("1,234.5"), 1234.5); assert.equal(H.parseNumber("(0.5)"), -0.5);
});
test("Anlagearten: nicht alles ist eine Aktie", () => {
  assert.equal(H.normalizeAssetType("EC"), "EQUITY"); assert.equal(H.normalizeAssetType("DBT"), "BOND"); assert.equal(H.normalizeAssetType("STIV"), "FUND");
  assert.equal(H.normalizeAssetType("DE", "FUT"), "FUTURE"); assert.equal(H.normalizeAssetType("Cash"), "CASH"); assert.equal(H.normalizeAssetType("Fixed Income"), "BOND");
  assert.equal(H.normalizeAssetType("Swap"), "SWAP"); assert.equal(H.normalizeAssetType("FX Forward"), "FORWARD"); assert.equal(H.normalizeAssetType("Mystery"), "UNKNOWN");
});
test("Qualitäts-Gates: Duplikate, negative Gewichte, >100 %, Summe, Zukunft, Einbruch", () => {
  const ok = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, Array.from({ length: 40 }, (_, i) => row("P" + i, 2.5, { holdingIsin: null, holdingTicker: "T" + i })));
  assert.deepEqual(H.qualityGates(ok, null, { today: "2026-10-04" }).errors, []);
  const dup = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, [row("A", 50, { holdingTicker: "A" }), row("A", 49, { holdingTicker: "A" }), row("B", -1, { holdingTicker: "B" })]);
  const q = H.qualityGates(dup, null, { today: "2026-10-04" });
  assert.ok(q.warnings.some((w) => /DUPLICATE_ROWS/.test(w))); assert.ok(q.warnings.some((w) => /NEGATIVE_WEIGHTS_NON_DERIVATIVE/.test(w)));
  const over = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "fraction" }, [row("ETF-Dachfonds-Position", 1.02)]);
  assert.ok(H.qualityGates(over, null, { today: "2026-10-04" }).warnings.some((e) => /WEIGHT_ABOVE_100/.test(e)), "Dachfonds mit 102 % ist ein Hinweis, kein Fehler");
  const absurd = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "fraction" }, [row("A", 3.5)]);
  assert.ok(H.qualityGates(absurd, null, { today: "2026-10-04" }).errors.some((e) => /WEIGHT_ABOVE_300/.test(e)));
  // Gegenläufige FLEX-Optionsbeine (Nominalwert) eines Floor-ETFs: real, kein Fehler
  const floor = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "fraction" }, [row("Bitcoin-ETF", 0.98), row("S&P 500 Mini Call", 12.9, { assetType: "OPTION" }), row("S&P 500 Mini Put", -11.8, { assetType: "OPTION" })]);
  assert.ok(!H.qualityGates(floor, null, { today: "2026-10-04" }).errors.some((e) => /WEIGHT_ABOVE_300/.test(e)));
  const low = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, [row("A", 10)]);
  assert.ok(H.qualityGates(low, null, { today: "2026-10-04" }).errors.some((e) => /IMPLAUSIBLE_TOTAL/.test(e)));
  const fut = H.snapshot({ fundId: "F", asOf: "2027-01-01", source: "T", weightUnit: "percent" }, [row("A", 100)]);
  assert.ok(H.qualityGates(fut, null, { today: "2026-10-04" }).errors.includes("FUTURE_AS_OF"));
  const small = H.snapshot({ fundId: "F", asOf: "2026-10-01", source: "T", weightUnit: "percent" }, [row("A", 100)]);
  assert.ok(H.qualityGates(small, ok, { today: "2026-10-04" }).errors.some((e) => /COVERAGE_COLLAPSE/.test(e)));
});
test("Snapshot-Hash: deterministisch und unabhängig von der Zeilenreihenfolge", () => {
  const r = [row("A", 60, { holdingIsin: "US0378331005" }), row("B", 40, { holdingCusip: "037833100" })];
  const a = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, r);
  const b = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, r.slice().reverse());
  assert.equal(a.contentHash, b.contentHash);
});
test("Konzentration, Exposures, Kurztext aus Daten", () => {
  const rows = [row("A", 30, { country: "US" }), row("B", 20, { country: "US" }), row("C", 10, { country: "JP" })].concat(Array.from({ length: 39 }, (_, i) => row("X" + i, 1, { country: "DE" }))).concat([{ holdingName: "Cash", weight: 1, assetType: "CASH", currency: "USD" }]);
  const s = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, rows);
  const c = H.concentration(s);
  assert.equal(c.positions, 42); assert.equal(c.top1, 0.3); assert.equal(c.top10, 0.67);
  assert.ok(c.effectiveNumber > 1 && c.effectiveNumber < 42);
  const ex = H.exposures(s);
  assert.equal(ex.countries[0].key, "US"); assert.equal(ex.countries[1].key, "DE"); assert.equal(ex.cashWeight, 0.01);
  assert.match(H.summary(s), /42 Positionen.*zehn größten Positionen machen 67 %/);
});
test("Zuordnung zum VU-Stamm: ISIN > CUSIP > Ticker (nur US), kein unscharfer Abgleich", () => {
  const s = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" },
    [row("Apple", 50, { holdingIsin: "US0378331005" }), row("Nvidia", 30, { holdingCusip: "67066G104" }), row("Msft", 15, { holdingTicker: "MSFT", country: "US" }), row("Toyota", 5, { holdingTicker: "7203", country: "JP" })]);
  const idx = { byIsin: { US0378331005: { ticker: "AAPL", sector: "TECH" } }, byCusip: { "67066G104": { ticker: "NVDA" } }, byTicker: { MSFT: { ticker: "MSFT" }, 7203: { ticker: "X" } } };
  const m = H.mapToCompanies(s, idx);
  assert.equal(m.mappedCount, 3); assert.equal(m.mappedShareOfEquity, 0.95);
  assert.equal(s.holdings.find((h) => h.holdingName === "Apple").matchMethod, "ISIN");
  assert.equal(s.holdings.find((h) => h.holdingName === "Toyota").vuTicker, undefined);
});
test("Faktor-Exposure nur ab Mindestabdeckung", () => {
  const s = H.snapshot({ fundId: "F", asOf: "2026-09-30", source: "T", weightUnit: "percent" }, [row("A", 60), row("B", 40)]);
  s.holdings[0].vuCompanyId = "A"; s.holdings[1].vuCompanyId = "B";
  assert.equal(H.factorExposure(s, { A: { quality: 80 }, B: { quality: 40 } }, ["quality"]).quality.value, 64);
  assert.equal(H.factorExposure(s, { A: { quality: 80 } }, ["quality"], 0.7).quality.value, null);
});
test("SIC -> Wirtschaftszweig", () => {
  assert.equal(H.sicSector(3674), "TECH"); assert.equal(H.sicSector(2834), "HEALTH"); assert.equal(H.sicSector(6022), "FIN"); assert.equal(H.sicSector(3711), "DISC"); assert.equal(H.sicSector(0), null);
});

/* ------------------------------------------------------- Change Engine */
function snap(asOf, rows, opts) { return H.snapshot(Object.assign({ fundId: "IVV", asOf, source: "SEC_NPORT", weightUnit: "percent" }, opts || {}), rows); }
const base = () => [row("NVIDIA", 6.8, { holdingIsin: "US67066G1040", sector: "TECH", country: "US" }), row("Apple", 6.5, { holdingIsin: "US0378331005", sector: "TECH", country: "US" }),
  row("Microsoft", 6.0, { holdingIsin: "US5949181045", sector: "TECH", country: "US" })].concat(Array.from({ length: 6 }, (_, i) => row("Co" + i, 2.0, { holdingTicker: "C" + i, sector: "FIN", country: "US" })))
  .concat([row("Tesla", 2.2, { holdingIsin: "US88160R1014", sector: "DISC", country: "US" }), row("Broadcom", 1.5, { holdingIsin: "US11135F1012", sector: "TECH", country: "US" }), row("Rest", 65.0, { holdingTicker: "REST", sector: "IND", country: "US" })]);
test("Erster Snapshot = Baseline, gleicher Snapshot = keine Ereignisse", () => {
  const a = snap("2026-03-31", base());
  assert.equal(C.diffHoldings(null, a).status, "BASELINE"); assert.equal(C.diffHoldings(null, a).events.length, 0);
  const same = snap("2026-06-30", base());
  const d = C.diffHoldings(a, same);
  assert.equal(d.status, "UNCHANGED"); assert.equal(d.events.length, 0);
});
test("NVIDIA 6,8 → 7,4 %, Tesla raus aus Top 10, Broadcom rein, neue/entfernte Positionen, Rauschen ignoriert", () => {
  const a = snap("2026-03-31", base());
  const rows = base().map((r) => Object.assign({}, r));
  rows[0].weight = 7.4;
  rows.find((r) => r.holdingName === "Tesla").weight = 1.2;
  rows.find((r) => r.holdingName === "Broadcom").weight = 2.1;
  rows.find((r) => r.holdingName === "Apple").weight = 6.53;          // +0,03 PP = Rauschen
  rows.push(row("NewCo", 0.4, { holdingIsin: "US0000000NC1", sector: "TECH", country: "US" }));
  rows.find((r) => r.holdingName === "Rest").weight = 64.37;
  const b = snap("2026-06-30", rows);
  const d = C.diffHoldings(a, b, { detectedAt: "2026-08-29" });
  const by = (t, n) => d.events.find((e) => e.eventType === t && (!n || e.entityName === n));
  const inc = by("WEIGHT_INCREASED", "NVIDIA");
  assert.ok(inc); assert.equal(inc.absoluteChange, 0.006); assert.equal(inc.importance, "MEDIUM");
  assert.match(inc.explanation, /6,8 % → 7,4 % \(\+0,6 Prozentpunkte\)/);
  assert.ok(by("LEFT_TOP_10", "Tesla")); assert.ok(by("ENTERED_TOP_10", "Broadcom")); assert.ok(by("HOLDING_ADDED", "NewCo"));
  assert.ok(!d.events.some((e) => e.entityName === "Apple"), "0,03 PP ist Rauschen");
  assert.equal(d.summary.largestIncrease.entityName, "Broadcom");
  assert.ok(d.summary.top10Exits.includes("Tesla"));
  assert.match(C.changeSentence(d.events), /^Seit dem letzten Holdings-Update: /);
  // Deterministische IDs
  assert.equal(C.diffHoldings(a, b, { detectedAt: "x" }).events[0].eventId, d.events[0].eventId);
  // Entfernt
  const c = snap("2026-09-30", rows.filter((r) => r.holdingName !== "NewCo").map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 64.77 }) : r));
  assert.ok(C.diffHoldings(b, c).events.some((e) => e.eventType === "HOLDING_REMOVED" && e.entityName === "NewCo"));
});
test("Sektor- und Länderverschiebung", () => {
  const a = snap("2026-03-31", base());
  const rows = base().map((r) => Object.assign({}, r));
  rows.find((r) => r.holdingName === "Rest").weight = 55.0;   // 10 % wandern in eine japanische Technologieaktie
  rows.push(row("Sony", 10.0, { holdingIsin: "JP3435000009", sector: "TECH", country: "JP" }));
  const d = C.diffHoldings(a, snap("2026-06-30", rows));
  assert.ok(d.events.some((e) => e.eventType === "COUNTRY_WEIGHT_CHANGED" && e.entityName === "JP" && e.importance === "HIGH"));
  assert.ok(d.events.some((e) => e.eventType === "SECTOR_WEIGHT_CHANGED" && e.entityName === "TECH"));
});
test("Kennungswechsel zwischen Quartalen (ISIN -> nur Ticker) erzeugt kein Hinzufügen/Entfernen", () => {
  const a = snap("2026-03-31", base());
  const rows = base().map((r) => r.holdingName === "Apple" ? Object.assign({}, r, { holdingIsin: null, holdingCusip: "037833100" }) : r);
  const d = C.diffHoldings(a, snap("2026-06-30", rows));
  assert.ok(!d.events.some((e) => /HOLDING_(ADDED|REMOVED)/.test(e.eventType)), JSON.stringify(d.events.map((e) => e.eventType + ":" + e.entityName)));
});
test("ISIN-Wechsel einer Aktie bei doppeltem Namen im Vorquartal: kein Zu-/Abgang, kein Top-10-Wechsel", () => {
  const roche = (isin) => base().map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 61.8 }) : r)
    .concat([row("Roche Holding AG", 3.0, { holdingIsin: isin, sector: "HEALTH", country: "CH" }), row("Roche Holding AG", 0.2, { holdingIsin: "CH0012032113", sector: "HEALTH", country: "CH" })]);
  const d = C.diffHoldings(snap("2026-03-31", roche("CH0012032048")), snap("2026-06-30", roche("CH1499059983")));
  assert.ok(!d.events.some((e) => /Roche/.test(e.entityName)), JSON.stringify(d.events.map((e) => e.eventType + ":" + e.entityName)));
  // Zwei verschiedene neue Aktien gleichen Namens bleiben echte Zu-/Abgänge
  const two = roche("CH1499059983").concat([row("Roche Holding AG", 0.5, { holdingIsin: "CH9999999990", sector: "HEALTH", country: "CH" })]).map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 61.3 }) : r);
  assert.ok(C.diffHoldings(snap("2026-03-31", roche("CH0012032048")), snap("2026-06-30", two)).events.some((e) => e.eventType === "HOLDING_ADDED"));
});
test("Zweite Aktiengattung gleichen Namens (Alphabet A neben C) ist ein Zugang, keine Gewichtsänderung", () => {
  const withC = base().map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 62.0 }) : r).concat([row("Alphabet Inc", 3.0, { holdingIsin: "US02079K1079", sector: "COMM", country: "US" })]);
  const withA = withC.map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 59.5 }) : r).concat([row("Alphabet Inc", 2.5, { holdingIsin: "US02079K3059", sector: "COMM", country: "US" })]);
  const d = C.diffHoldings(snap("2026-03-31", withC), snap("2026-06-30", withA));
  assert.ok(d.events.some((e) => e.eventType === "HOLDING_ADDED" && e.entityId === "ISIN:US02079K3059"), JSON.stringify(d.events.map((e) => e.eventType + ":" + e.entityId)));
  assert.ok(!d.events.some((e) => e.eventType === "WEIGHT_INCREASED" && /Alphabet/.test(e.entityName)));
});
test("Gewichtsänderung bei unveränderter Stückzahl = Kursbewegung, eine Stufe niedriger", () => {
  const withShares = (w) => base().map((r) => Object.assign({}, r, { shares: 1000 }, r.holdingName === "NVIDIA" ? { weight: w } : {}));
  const a = snap("2026-03-31", withShares(6.8)), b = snap("2026-06-30", withShares(8.0).map((r) => r.holdingName === "Rest" ? Object.assign({}, r, { weight: 63.8 }) : r));
  const e = C.diffHoldings(a, b).events.find((x) => x.entityName === "NVIDIA");
  assert.equal(e.driver, "PRICE"); assert.equal(e.importance, "MEDIUM"); assert.match(e.explanation, /Kursbewegung/);
});
test("Tickerwechsel / Split mit gleicher ISIN ist keine Änderung; andere Quelle nicht vergleichbar", () => {
  const a = snap("2026-03-31", base());
  const rows = base().map((r) => Object.assign({}, r, r.holdingName === "NVIDIA" ? { holdingTicker: "NVDA2", shares: 10000 } : {}));
  assert.equal(C.diffHoldings(a, snap("2026-06-30", rows)).events.length, 0);
  assert.equal(C.diffHoldings(a, snap("2026-06-30", base(), { source: "ISHARES" })).status, "NOT_COMPARABLE");
  assert.equal(C.diffHoldings(snap("2026-06-30", base()), a).status, "NOT_COMPARABLE");
});
test("Fondsdaten-Änderungen: TER, Fondsvolumen, Index, Status; fehlend ist keine Änderung", () => {
  const f = (v) => ({ value: v, source: "T" });
  const prev = { shareClassId: "X", ter: f(0.0022), aum: f(9e9), aumCurrency: f("EUR"), benchmarkName: f("MSCI World"), fundStatus: f("ACTIVE"), replicationMethod: null };
  const next = { shareClassId: "X", ter: f(0.002), aum: f(1.05e10), aumCurrency: f("EUR"), benchmarkName: f("MSCI World"), fundStatus: f("LIQUIDATING"), replicationMethod: f("PHYSICAL") };
  const d = C.diffFundamentals(prev, next, { from: "2026-09-01", to: "2026-10-01" });
  const types = d.events.map((e) => e.eventType);
  assert.ok(types.includes("TER_CHANGED")); assert.ok(types.includes("AUM_CHANGED")); assert.ok(types.includes("FUND_STATUS_CHANGED"));
  assert.ok(!types.includes("BENCHMARK_CHANGED")); assert.ok(!types.includes("REPLICATION_CHANGED"));
  assert.match(d.events.find((e) => e.eventType === "TER_CHANGED").explanation, /0,22 % → 0,20 %/);
  assert.equal(d.events.find((e) => e.eventType === "FUND_STATUS_CHANGED").importance, "HIGH");
});

/* ---------------------------------------------- Overlap und Look-through */
const xf = (rows) => ({ asOf: "2026-06-30", source: "SEC_NPORT", holdings: rows.map(([n, w, i]) => ({ name: n, weight: w, isin: i })) });
test("Overlap: null, identisch, teilweise, fehlende Daten", () => {
  const a = xf([["NVIDIA", 0.08, "N"], ["Apple", 0.07, "A"], ["X", 0.85, "X"]]);
  const b = xf([["NVIDIA", 0.05, "N"], ["Toyota", 0.95, "T"]]);
  assert.equal(X.overlap(a, xf([["Z", 1, "Z"]])).weightedOverlap, 0);
  assert.ok(Math.abs(X.overlap(a, a).weightedOverlap - 1) < 1e-12);
  assert.ok(Math.abs(X.overlap(a, b).weightedOverlap - 0.05) < 1e-12); assert.equal(X.overlap(a, b).commonCount, 1);
  assert.equal(X.overlap(a, null).status, "DATA_PENDING");
});
test("Look-through: ETF-Gewicht × Holding-Gewicht, Summe über ETFs, Cash, Abdeckung", () => {
  const H1 = xf([["NVIDIA", 0.08, "N"], ["Cash", 0.02, null], ["Rest", 0.9, "R1"]]); H1.holdings[1].name = "Cash";
  const H2 = xf([["NVIDIA", 0.05, "N"], ["Rest2", 0.95, "R2"]]);
  const lt = X.lookThrough([{ symbol: "A", weight: 50 }, { symbol: "B", weight: 30 }, { symbol: "C", weight: 20 }], { A: H1, B: H2 });
  const nv = lt.companies.find((c) => c.name === "NVIDIA");
  assert.ok(Math.abs(nv.weight - (0.5 * 0.08 + 0.3 * 0.05)) < 1e-12);           // 4 % + 1,5 % = 5,5 %
  assert.deepEqual(nv.via, ["A", "B"]);
  assert.equal(lt.status, "PARTIAL"); assert.ok(Math.abs(lt.coverage - 0.8) < 1e-12);
});

/* ------------------------------------------------------ Emittenten */
test("Emittenten-Adapter: kein automatisierter Abruf (Bedingungen), Parser arbeiten", async () => {
  for (const id of Object.keys(ISSUERS)) {
    const a = createIssuerAdapter(id);
    assert.equal(a.automationAllowed, false);
    assert.equal((await a.fetchHoldings()).status, "NOT_PERMITTED");
    assert.equal((await a.healthCheck()).status, "NOT_PERMITTED");
  }
});
test("iShares-CSV US (Prozent, Kopfzeilen davor) und DE (Dezimalkomma, deutsches Datum)", () => {
  const us = 'iShares Core S&P 500 ETF\nFund Holdings as of,"Sep 30, 2026"\nInception Date,"May 15, 2000"\n \nTicker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,Market Currency\n"NVDA","NVIDIA CORP","Information Technology","Equity","50,000,000.00","7.40","50,000,000.00","1,000","180.00","United States","NASDAQ","USD","1.00","USD"\n"AAPL","APPLE INC","Information Technology","Equity","40,000,000.00","92.60","40,000,000.00","1,000","220.00","United States","NASDAQ","USD","1.00","USD"\n \n"The content contained herein is owned or licensed by BlackRock"\n';
  const s = createIssuerAdapter("BLACKROCK").normalise("ISHARES_HOLDINGS_CSV", us, { fundId: "IVV" });
  assert.equal(s.asOf, "2026-09-30"); assert.equal(s.holdings.length, 2);
  assert.equal(s.holdings[0].weight, 0.926); assert.equal(s.holdings.find((h) => h.holdingTicker === "NVDA").weight, 0.074);
  assert.equal(s.holdings[0].country, "US"); assert.equal(s.sourceType, "PRIMARY_ISSUER");
  const de = 'Fondsposition per;30.Sep.2026\n\nEmittententicker;Name;Sektor;Anlageklasse;Marktwert;Gewichtung (%);Nominale;Standort;Börse;Marktwährung\nSAP;SAP SE;IT;Aktien;"1.234.567,00";"10,50";"1.000";Deutschland;Xetra;EUR\nSIE;SIEMENS AG;Industrie;Aktien;"1.000,00";"89,50";"10";Deutschland;Xetra;EUR\n';
  const d = createIssuerAdapter("BLACKROCK").normalise("ISHARES_HOLDINGS_CSV", de, { fundId: "EXS1" });
  assert.equal(d.asOf, "2026-09-30"); assert.equal(d.holdings.find((h) => h.holdingTicker === "SAP").weight, 0.105); assert.equal(d.holdings[0].country, "DE");
});
test("Amundi (Dezimal), Invesco (Prozent), EMT (laufende Kosten je ISIN)", () => {
  const am = { products: [{ composition: { compositionData: [{ compositionCharacteristics: { date: "2026-09-30", isin: "US0378331005", name: "APPLE", weight: 0.0514, type: "EQUITY_ORDINARY", country: "United States" } }, { compositionCharacteristics: { date: "2026-09-30", isin: "US5949181045", name: "MSFT", weight: 0.9486, type: "EQUITY_ORDINARY", country: "United States" } }] } }] };
  const s = createIssuerAdapter("AMUNDI").normalise("AMUNDI_PRODUCT_JSON", am, { fundId: "X" });
  assert.equal(s.asOf, "2026-09-30"); assert.equal(s.holdings.find((h) => h.holdingIsin === "US0378331005").weight, 0.0514);
  const inv = { effectiveBusinessDate: "2026-09-30", holdings: [{ issuerName: "NVIDIA", ticker: "NVDA", cusip: "67066G104", percentageOfTotalNetAssets: 9.1, securityTypeName: "Common Stock" }, { issuerName: "Other", ticker: "O", percentageOfTotalNetAssets: 90.9, securityTypeName: "Common Stock" }] };
  const i = createIssuerAdapter("INVESCO").normalise("INVESCO_HOLDINGS_JSON", inv, { fundId: "QQQM" });
  assert.equal(i.holdings.find((h) => h.holdingTicker === "NVDA").weight, 0.091); assert.equal(i.holdings[0].assetType, "EQUITY");
  const emt = "00001_EMT_Version;00010_Financial_Instrument_Identifying_Data;00030_Financial_Instrument_Name;07100_Financial_Instrument_Gross_Ongoing_Costs;07110_Financial_Instrument_Management_Fee\nV4.2;IE00B4L5Y983;Fund A;0.0020;0.0020\nV4.2;IE00B4L5Y984;Bad ISIN;0.0020;\nV4.2;LU0274208692;Fund B;0.19;\n";
  const e = createIssuerAdapter("DWS").normalise("EMT", emt);
  assert.equal(e.funds.length, 2); assert.equal(e.funds[0].ongoingCharges, 0.002);
  assert.equal(e.funds[1].ongoingCharges, null); assert.equal(e.funds[1].unitError, "UNIT_MISMATCH");
});

/* ------------------------------------------- N-PORT-Pipeline (Fixture) */
test("SEC-N-PORT-Pipeline: Quartale -> Snapshots -> Holdings-Datei mit Exposures und Ereignissen", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-nport-"));
  const { zips, mf } = makeFixture(dir);
  execFileSync("node", [join(root, "scripts/vorsorge/ingest-sec-nport.mjs"), "--work", join(dir, "work"), "--local", Object.entries(zips).map(([k, v]) => k + "=" + v).join(","), "--mf", mf], { stdio: "pipe" });
  const out = join(dir, "out");
  execFileSync("node", [join(root, "scripts/vorsorge/build-etf-intelligence.mjs"), "--work", join(dir, "work"), "--out", out], { stdio: "pipe" });
  const f = JSON.parse(readFileSync(join(out, "S000004310.json"), "utf8"));
  assert.equal(f.source, "SEC_NPORT"); assert.equal(f.asOf, "2026-06-30"); assert.equal(f.publishedAt, "2026-08-27");
  assert.equal(f.netAssets, 1200000000); assert.equal(f.netAssetsLevel, "FUND");
  assert.equal(f.history.length, 2);
  const ev = f.changes.events.map((r) => Object.fromEntries(f.changes.eventFields.map((k, i) => [k, r[i]])));
  assert.ok(ev.some((e) => e.eventType === "HOLDING_ADDED" && e.entityName === "Epsilon SA"));
  assert.ok(ev.some((e) => e.eventType === "HOLDING_REMOVED" && e.entityName === "Delta AG"));
  assert.equal(f.changes.eventVersion, "1.0.0");
  assert.ok(Math.abs(f.exposures.countries.find((c) => c.key === "US").weight - 0.934) < 1e-9);
  const idx = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
  assert.equal(idx.bySymbol.IVV[0], "S000004310"); assert.ok(!idx.bySymbol.NOTINDEX);
  // Deterministisch: zweiter Build byte-gleich
  const out2 = join(dir, "out2");
  execFileSync("node", [join(root, "scripts/vorsorge/build-etf-intelligence.mjs"), "--work", join(dir, "work"), "--out", out2], { stdio: "pipe" });
  assert.equal(readFileSync(join(out2, "S000004310.json"), "utf8"), readFileSync(join(out, "S000004310.json"), "utf8"));
});
test("Kostenaenderung zwischen Prospektstaenden: nur gleich definierte Felder, fehlend ist keine Aenderung", () => {
  const f = (v) => ({ value: v });
  const prev = { shareClassId: "C1", expenseRatio: f(0.0009), netExpenseRatio: f(0.0009), managementFee: f(0.0005) };
  const next = { shareClassId: "C1", expenseRatio: f(0.0009), netExpenseRatio: f(0.0007), managementFee: null };
  const d = C.diffFundamentals(prev, next, { from: "2025-04-28", to: "2026-04-28", source: "SEC_RR" });
  assert.deepEqual(d.events.map((e) => e.eventType), ["NET_EXPENSE_RATIO_CHANGED"]);
  assert.match(d.events[0].explanation, /0,09 % → 0,07 %/);
  // Brutto gegen Netto wird nie verglichen
  assert.equal(C.diffFundamentals({ shareClassId: "C1", expenseRatio: f(0.002) }, { shareClassId: "C1", netExpenseRatio: f(0.001) }).events.length, 0);
});
test("Fundamentals kompakt ausliefern: verlustfrei (expand(compact(x)) === x)", () => {
  const fu = { schemaVersion: "2.0.0", fundId: "sec:S1", name: { value: "X ETF", source: "TIINGO", sourceType: "MARKET_DATA_PROVIDER", sourceUrl: null, asOf: null, retrievedAt: null, confidence: "MEDIUM" },
    isin: null, aum: { value: 1e9, source: "SEC_NPORT", sourceType: "REGULATORY", sourceUrl: "https://sec.example/nport", asOf: "2026-03-31", retrievedAt: null, confidence: "HIGH" },
    domicile: { value: "US", source: "SEC_NPORT", sourceType: "DERIVED", sourceUrl: "https://sec.example/nport", asOf: "2026-03-31", retrievedAt: null, confidence: "MEDIUM" },
    expenseRatio: { value: 0.0003, source: "SEC_RR", sourceType: "REGULATORY", sourceUrl: "https://sec.example/rr", asOf: "2025-07-22", retrievedAt: null, confidence: "HIGH", originalField: "Prospekt" },
    conflicts: [{ field: "aum", reason: "AS_OF_DIFFERS" }] };
  const c = F.compact(fu);
  assert.ok(JSON.stringify(c).length < JSON.stringify(fu).length);
  assert.equal(c.isin, undefined); assert.equal(c.aum.sourceUrl, undefined); assert.equal(c.sourceUrls.SEC_NPORT, "https://sec.example/nport");
  const e = F.expand(c);
  for (const k of Object.keys(fu)) assert.deepEqual(e[k], fu[k], k);
});
test("Kostenzustand: belegte 0,00 % ist VALID_ZERO, nicht fehlend; Platzhalter und fehlende Felder sind nicht vergleichbar", () => {
  const v = (x) => ({ value: x });
  assert.equal(F.costState({ expenseRatio: v(0.0055), netExpenseRatio: v(0) }, "netExpenseRatio"), "VALID_ZERO");
  assert.equal(F.costState({ expenseRatio: v(0.001), managementFee: v(0) }, "managementFee"), "VALID_ZERO");
  assert.equal(F.costState({ expenseRatio: v(0.001) }, "netExpenseRatio"), "NOT_REPORTED");
  assert.equal(F.costState(null, "expenseRatio"), "MISSING");
  assert.equal(F.costState({ expenseRatio: v(0), managementFee: v(0) }, "expenseRatio"), "PLACEHOLDER", "alle Kostenfelder 0 = Vorlage");
  assert.equal(F.costState({ expenseRatio: v(0), managementFee: v(0.004) }, "expenseRatio"), "PLACEHOLDER", "brutto unter Verwaltungsgebuehr ist unmoeglich");
  assert.equal(F.costState({ expenseRatio: v(0.2) }, "expenseRatio"), "UNKNOWN");
  assert.equal(F.costState({ expenseRatio: v(NaN) }, "expenseRatio"), "UNKNOWN");
  assert.equal(F.costState({ expenseRatio: v(0.0009) }, "expenseRatio"), "VALUE");
});
test("Kostenaenderung mit Nullwerten: 0 → positiv, positiv → 0 erzeugen Ereignisse; 0 → 0, fehlend → positiv, positiv → fehlend nicht", () => {
  const v = (x) => ({ value: x });
  const diff = (a, b) => {
    const pick = (r) => { const st = F.costStates(r); return { shareClassId: "C1", expenseRatio: st.expenseRatio.value, netExpenseRatio: st.netExpenseRatio.value, managementFee: st.managementFee.value }; };
    return C.diffFundamentals(pick(a), pick(b), { from: "2025-04-28", to: "2026-04-28", source: "SEC_RR" }).events.map((e) => [e.eventType, e.oldValue, e.newValue]);
  };
  const G = v(0.0055);
  assert.deepEqual(diff({ expenseRatio: G, netExpenseRatio: v(0) }, { expenseRatio: G, netExpenseRatio: v(0.0001) }), [["NET_EXPENSE_RATIO_CHANGED", 0, 0.0001]], "0 → positiv");
  assert.deepEqual(diff({ expenseRatio: G, netExpenseRatio: v(0.0001) }, { expenseRatio: G, netExpenseRatio: v(0) }), [["NET_EXPENSE_RATIO_CHANGED", 0.0001, 0]], "positiv → 0");
  assert.deepEqual(diff({ expenseRatio: G, netExpenseRatio: v(0) }, { expenseRatio: G, netExpenseRatio: v(0) }), [], "0 → 0");
  assert.deepEqual(diff({ expenseRatio: G }, { expenseRatio: G, netExpenseRatio: v(0.0004) }), [], "fehlend → positiv");
  assert.deepEqual(diff({ expenseRatio: G, netExpenseRatio: v(0.0004) }, { expenseRatio: G }), [], "positiv → fehlend");
  assert.deepEqual(diff({ expenseRatio: v(0), managementFee: v(0) }, { expenseRatio: v(0.0059), managementFee: v(0.004) }).map((x) => x[0]), [], "Platzhalter → positiv ist keine Aenderung");
  assert.deepEqual(diff({ expenseRatio: v(0), managementFee: v(0.004) }, { expenseRatio: v(0.0059), managementFee: v(0.004) }), [], "Brutto-Platzhalter (FCG-Fall) → positiv ist keine Aenderung");
  assert.match(C.diffFundamentals({ shareClassId: "C1", managementFee: 0 }, { shareClassId: "C1", managementFee: 0.0003 }).events[0].explanation, /0,00 % → 0,03 %/);
});
