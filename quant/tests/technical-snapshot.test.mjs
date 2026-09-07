/* CHECKPOINT 7 — Snapshots, Storage, Evidence, Scanner, AI-Tools, Strategy Packs */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtures } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Snapshot = require("../engines/technical/snapshot.js");
const Storage = require("../engines/technical/storage.js");
const Scanner = require("../engines/technical/scanner.js");
const Tools = require("../engines/technical/technical-tools.js");
const Packs = require("../engines/technical/strategy-packs.js");
const AiTools = require("../engines/ai-tools.js");

const METH = { technical: JSON.parse(readFileSync(new URL("../methodology/technical-v1.json", import.meta.url), "utf8")),
               elliott: JSON.parse(readFileSync(new URL("../methodology/elliott-v1.json", import.meta.url), "utf8")) };
const run = (s, b, o) => Analysis.analyze({ series: s, benchmarkSeries: b || null, methodology: METH, options: Object.assign({ elliott: false }, o || {}) });

test("SN1 · AnalysisSnapshot traegt alle Pflichtfelder und ist deterministisch", () => {
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const s1 = Snapshot.createSnapshot(b), s2 = Snapshot.createSnapshot(b);
  for (const f of ["snapshotId", "instrumentId", "analysisTime", "dataCutoff", "engineBundleVersion", "methodologyVersion", "parametersHash", "dataVersion", "primaryScenarioId", "alternativeScenarioIds", "signalRefs", "annotationRefs", "evidenceRefs", "createdAt", "supersedesSnapshotId"]) assert.ok(f in s1, f);
  assert.equal(s1.snapshotId, s2.snapshotId); assert.equal(s1.contentHash, s2.contentHash);
  assert.equal(s1.alternativeScenarioIds.length, 2);
  assert.ok(s1.frozen.scenarios.length === 3 && s1.frozen.lastClose > 0);
});

test("SN2 · Snapshots werden nie ueberschrieben; Datenrevision erzeugt neuen Snapshot mit supersedes", () => {
  const store = Storage.createMemoryStore();
  const s = fixtures.cleanUptrend();
  const b = run(s, fixtures.range());
  const snap = Snapshot.createSnapshot(b);
  assert.equal(store.put(snap).stored, true);
  assert.equal(store.put(snap).stored, false, "identisch → nicht doppelt");
  const tampered = Object.assign({}, snap, { contentHash: "x" });
  assert.throws(() => store.put(tampered), /nie ueberschrieben/);
  const rev = Canonical.revise(s, [{ index: 300, close: s.close[300] * 1.03, high: s.high[300] * 1.04 }], "rev2");
  const b2 = run(rev, fixtures.range());
  const snap2 = Snapshot.superseding(b2, snap);
  assert.notEqual(snap2.snapshotId, snap.snapshotId);
  assert.notEqual(snap2.dataVersion, snap.dataVersion);
  assert.equal(snap2.supersedesSnapshotId, snap.snapshotId);
  store.put(snap2);
  assert.equal(store.count(), 2);
  assert.equal(store.get(snap.snapshotId).contentHash, snap.contentHash, "der alte Snapshot bleibt unveraendert");
  assert.equal(store.latestFor(s.instrumentId).snapshotId, snap2.snapshotId);
  // JSON-File-Store haelt dieselben Invarianten und ueberlebt ein Neuladen.
  const dir = mkdtempSync(join(tmpdir(), "vu-snap-"));
  const fs1 = Storage.createJsonFileStore(dir); fs1.put(snap); fs1.put(snap2);
  const fs2 = Storage.createJsonFileStore(dir);
  assert.equal(fs2.count(), 2); assert.throws(() => fs2.put(tampered));
});

test("SN3 · Walk-Forward-Snapshots sind reproduzierbar: Snapshot bei T haengt nicht von T+k ab", () => {
  const full = fixtures.cleanUptrend(400), bench = fixtures.range(400);
  const a = Snapshot.createSnapshot(Analysis.analyzeAsOf({ series: full, benchmarkSeries: bench, methodology: METH, options: { elliott: false } }, 300));
  const b = Snapshot.createSnapshot(run(Canonical.slice(full, 300), Canonical.slice(bench, 300)));
  assert.equal(a.snapshotId, b.snapshotId); assert.equal(a.contentHash, b.contentHash);
});

test("EV1 · Evidence Foundation: Projected vs Actual, Same-Bar-Policy, keine Quote ohne Stichprobe", () => {
  const full = fixtures.cleanUptrend(400), bench = fixtures.range(400);
  const T = 250;
  const b = Analysis.analyzeAsOf({ series: full, benchmarkSeries: bench, methodology: METH, options: { elliott: false } }, T);
  const snap = Snapshot.createSnapshot(b);
  const rec = Snapshot.createEvidenceRecord(snap, b.scenarios.primary);
  assert.ok(rec && rec.eventualOutcome === null && rec.scenarioClass.startsWith(b.scenarios.primary.direction));
  const out = Snapshot.evaluateOutcome(rec, full);
  assert.ok(out.eventualOutcome, "Outcome bestimmt");
  assert.ok(out.evaluatedThrough === null || out.evaluatedThrough > snap.dataCutoff, "nur Bars nach dem Cutoff");
  // Same-Bar: Stop und Target in einer Bar → Stop zaehlt.
  const both = { direction: "BULLISH", dataCutoff: "2020-01-01", entry: { zoneLow: 99, zoneHigh: 101 }, invalidation: 95, targets: [{ zoneLow: 110, zoneHigh: 112 }] };
  const series = Canonical.fromRows([{ date: "2020-01-02", open: 100, high: 100.5, low: 99.5, close: 100, volume: 1 }, { date: "2020-01-03", open: 100, high: 115, low: 90, close: 100, volume: 1 }], { instrumentId: "x", priceSeriesType: "SPLIT_ADJUSTED" });
  assert.equal(Snapshot.evaluateOutcome(both, series).eventualOutcome, "INVALIDATION");
  const agg = Snapshot.aggregateEvidence([out], 30);
  assert.equal(agg.displayable, false); assert.equal(agg.target1BeforeInvalidation, null); assert.match(agg.note, /Stichprobe zu klein/);
});

test("SC1 · Universe Scanner: Summaries, Perzentile, strukturierte Filter, kein freier Ausdruck", () => {
  const universe = ["cleanUptrend", "cleanDowntrend", "range", "highVol", "lowVol", "gap"].map((k) => ({ instrumentId: "SYN_" + k, series: fixtures[k](), meta: { name: k } }));
  const scan = Scanner.scanUniverse({ universe, benchmarkSeries: fixtures.range(), methodology: METH, universeId: "synthetic", universeVersion: "v1" });
  assert.equal(scan.count, 6); assert.deepEqual(scan.errors, []);
  assert.ok(scan.rows.every((r) => typeof r.opportunityScore === "number" && r.scorePercentile !== null && r.parametersHash && r.dataCutoff));
  assert.ok(scan.rows[0].opportunityScore >= scan.rows[scan.rows.length - 1].opportunityScore);
  const bull = Scanner.applyFilters(scan, [{ field: "trend", op: "==", value: "BULLISH" }, { field: "technicalScore", op: ">", value: 40 }]);
  assert.ok(bull.rows.every((r) => r.trend === "BULLISH" && r.opportunityScore > 40));
  assert.throws(() => Scanner.applyFilters(scan, [{ field: "eval", op: ">", value: 1 }]), /unbekanntes Feld/);
  assert.throws(() => Scanner.applyFilters(scan, [{ field: "trend", op: "=~", value: "x" }]), /Operator/);
  // Missing != Match: Titel ohne RR fallen bei RR-Filter heraus, statt als 0 zu gelten.
  const rr = Scanner.applyFilters(scan, [{ field: "riskReward", op: ">=", value: 0 }]);
  assert.ok(rr.rows.every((r) => r.riskReward !== null));
});

test("AI1 · Technical-Tools registrieren sich auf der bestehenden Registry; AI bekommt nur strukturierte Outputs", async () => {
  const bundle = run(fixtures.cleanUptrend(), fixtures.range(), { annotations: true });
  const scan = Scanner.scanUniverse({ universe: [{ instrumentId: "SYN_UP", series: fixtures.cleanUptrend() }], benchmarkSeries: fixtures.range(), methodology: METH, universeId: "t" });
  const registry = AiTools.createToolRegistry({});
  Tools.registerTechnicalTools(registry, { getBundle: (s) => (s === "SYN_UP" ? bundle : null), getScan: () => scan, getMethodology: (id) => METH[id] || null });
  const names = registry.list().map((d) => d.name);
  for (const n of ["getTechnicalSnapshot", "getMarketStructure", "getTrendState", "getMomentumState", "getSupportResistance", "getTechnicalScenarios", "getTradeSetup", "getElliottAnalysis", "getChartAnnotations", "scanTechnicalSetups", "compareTechnicalSetups"]) assert.ok(names.includes(n), n);
  const snap = await registry.call("getTechnicalSnapshot", { symbol: "SYN_UP" });
  assert.equal(snap.ok, true); assert.ok(snap.data.provenance.dataCutoff && snap.data.provenance.engineVersions);
  assert.equal(snap.data.primaryScenario.confidenceType, "methodology_confidence");
  const missing = await registry.call("getTradeSetup", { symbol: "NOPE" });
  assert.equal(missing.data.found, false);
  const bad = await registry.call("scanTechnicalSetups", { filters: [{ field: "sql", op: ">", value: 1 }] });
  assert.equal(bad.ok, false);
  const ann = await registry.call("getChartAnnotations", { symbol: "SYN_UP", layer: "STRUCTURE" });
  assert.ok(ann.data.annotations.length > 0 && ann.data.annotations.every((a) => a.layers.includes("STRUCTURE")));
  assert.equal((await registry.call("eval", { code: "1" })).ok, false, "verbotene Tools bleiben verboten");
});

test("SP1 · Strategy-Pack-Architektur: Interface erzwungen, Named Method braucht Legal Review, keine Regel implementiert", () => {
  assert.throws(() => Packs.registerPack({ packId: "x" }), /RulePack ohne/);
  assert.throws(() => Packs.registerPack({ packId: "named", version: "1", label: "n", origin: "NAMED_METHOD", requires: [], evaluate: () => ({}) }), /LEGAL REVIEW/);
  const pack = Packs.registerPack({ packId: "vu-test", version: "0.0.1", label: "Test", origin: "VU", requires: ["trend"], evaluate: (b) => ({ criteria: [{ id: "bull", passed: b.trend.direction === "BULLISH" }], status: "OK" }) });
  assert.equal(pack.packId, "vu-test");
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const res = Packs.evaluateAll(b);
  assert.equal(res[0].criteria[0].passed, true);
  const ready = Packs.readinessInputs(b);
  for (const k of ["trend", "relativeStrength", "proximity52w", "volume", "contraction", "breakout", "boxLogic"]) assert.ok(k in ready, k);
  assert.ok(Packs.PLANNED.length >= 4 && Packs.listPacks().every((p) => p.origin === "VU"));
});
