import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const C = require("../engines/backtest-artifact-consistency.js");
const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const CTR = require("../engines/canonical-total-return.js");

/* Erwartete Total-Return-Abdeckung, unabhaengig von den Zaehlern der Studie hergeleitet:
   Universum = Wochenreihen in discover-series-long ohne Benchmark (Eingang von build-signal-backtest),
   Regel   = ein Titel ist in der Studie, wenn er nicht im Ablehnungsbuch (quality.rejected) steht.
   Das Buch muss je Titel genau einen Eintrag haben, nur Titel des Eingangsuniversums nennen und
   in Gruenden und Fehlerklassen zu den gemeldeten Zaehlern passen. */
const LONG_DIR = new URL("quant/data/market/discover-series-long/", root);
function inputUniverse() {
  const bm = json("quant/config/tiingo-scale.json").benchmark || {};
  const ids = [];
  for (const f of readdirSync(LONG_DIR).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    const j = JSON.parse(readFileSync(new URL(f, LONG_DIR), "utf8"));
    if (j.securityId === bm.securityId || j.ticker === bm.symbol) continue;
    ids.push(j.securityId);
  }
  return ids;
}
function expectedCoverage(universe, quality) {
  const errors = [], ids = new Set(universe), study = quality.signalStudy || {};
  if (ids.size !== universe.length) errors.push("UNIVERSE_DUPLICATE_SECURITY");
  const rows = quality.rejected && Array.isArray(quality.rejected.rows) ? quality.rejected.rows : null;
  if (!rows || JSON.stringify(quality.rejected.columns) !== JSON.stringify(["securityId", "reason", "date"])) return { errors: ["REJECTED_LEDGER_MISSING"] };
  const seen = new Set(), reasons = {}, buckets = { REJECTED_DIVIDEND_GAP: 0, REJECTED_SPLIT_GAP: 0, REJECTED_IDENTITY: 0, REJECTED_OTHER: 0 };
  for (const [id, reason] of rows) {
    if (!id || !reason) errors.push("REJECTED_ROW_INCOMPLETE");
    if (seen.has(id)) errors.push("REJECTED_DUPLICATE:" + id);
    if (!ids.has(id)) errors.push("REJECTED_OUTSIDE_UNIVERSE:" + id);
    seen.add(id);
    reasons[reason] = (reasons[reason] || 0) + 1;
    buckets[CTR.bucketOf(reason)]++;
  }
  /* Die Studie laeuft auf dem Universum ihres Laufs. Ein spaeterer Kursreihen-Lauf darf neue Titel
     hinzufuegen (sie fehlen bis zum naechsten Studienlauf), aber keiner darf verschwinden. */
  const titles = study.titles;
  if (!(Number.isInteger(titles) && titles <= ids.size)) errors.push("STUDY_UNIVERSE_LARGER_THAN_INPUT");
  /* Ohne veraltete Gesamtrenditen (RECONSTRUCTED == CONFIRMED_AFTER) stammt jede Ablehnung aus der
     Rekonstruktion: dann muessen Gruende und Fehlerklassen exakt den gemeldeten Zaehlern entsprechen. */
  if (study.TOTAL_RETURN_RECONSTRUCTED === study.TOTAL_RETURN_CONFIRMED_AFTER) {
    if (JSON.stringify(Object.entries(reasons).sort()) !== JSON.stringify(Object.entries(study.reasons || {}).sort())) errors.push("REJECTED_REASONS_MISMATCH");
    for (const b of Object.keys(buckets)) if (buckets[b] !== study[b]) errors.push("REJECTED_BUCKET_MISMATCH:" + b);
  }
  const withTotalReturn = titles - seen.size;
  return { errors, titles, withTotalReturn, share: Math.round(withTotalReturn / titles * 1000) / 1000 };
}

test("signal readiness derives total return and SPY basis from matching canonical artifacts", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const quality = json("quant/data/product/total-return-quality-v1.json");
  const readiness = json("quant/data/product/backtest-readiness-v2.json");
  const status = C.assertSignalSourceStatus(signal, quality);
  assert.equal(status.state, "AVAILABLE");
  assert.equal(status.returnType, "TOTAL_RETURN");
  // Abdeckung unabhaengig hergeleitet (Eingangsuniversum + Ablehnungsbuch), nicht als feste Zahl:
  // der Datenlauf erweitert das Universum (6036/6174 -> 6052/6190 am 27.10.2026).
  const expected = expectedCoverage(inputUniverse(), quality);
  assert.deepEqual(expected.errors, []);
  assert.equal(status.coverage.withTotalReturn, expected.withTotalReturn);
  assert.equal(status.coverage.titles, expected.titles);
  assert.equal(status.coverage.share, expected.share);
  assert.equal(signal.source.titles, expected.withTotalReturn, "Studie rechnet genau auf den nicht abgelehnten Titeln");
  assert.ok(status.coverage.share >= status.coverage.minimumShare);
  assert.equal(status.coverage.unit, "SECURITY_PRICE_SERIES");
  assert.equal(status.studySchemaVersion, signal.schemaVersion);
  assert.equal(status.studyEngineVersion, signal.engineVersion);
  assert.equal(status.qualitySchemaVersion, quality.schemaVersion);
  assert.equal(status.corporateActionContract, quality.corporateActionContract);
  assert.equal(status.benchmarkContract, quality.benchmarkContract);
  assert.equal(status.benchmark.role, "BENCHMARK_REFERENCE");
  assert.equal(status.studyBenchmark.state, "PASS");
  assert.equal(C.readinessMatches(readiness, status), true);
  const cert = json("quant/data/product/backtest-certification-v1.json");
  const certSignal = cert.kinds.find((k) => k.id === "SIGNAL_BACKTEST");
  assert.deepEqual(certSignal.source, { asOf: status.asOf, generatedAt: status.generatedAt, returnType: status.returnType,
    studySchemaVersion: status.studySchemaVersion, studyEngineVersion: status.studyEngineVersion,
    qualitySchemaVersion: status.qualitySchemaVersion, returnContract: status.contract,
    corporateActionContract: status.corporateActionContract, benchmarkContract: status.benchmarkContract,
    totalReturnCoverage: status.coverage, benchmark: status.benchmark, studyBenchmark: status.studyBenchmark });
  assert.equal(readiness.kinds.find(k => k.key === "SIGNAL_BACKTEST").gates.find(g => g.id === "survivorship").reason,
    certSignal.gates.find(g => g.id === "survivorship").reason);
  const intelligence = json("quant/data/product/backtest-signal-intelligence-v1.json");
  assert.deepEqual(intelligence.measures.SIGNAL_STUDY_SOURCE, readiness.signalStudy);
  assert.equal(readiness.assets.find(a => a.id === "priceTotalReturn").weekly.unit, "SECURITY_PRICE_SERIES");
  assert.ok(!intelligence.measures.SIGNAL_BACKTEST_READY.reasons.includes("TOTAL_RETURN_SERIES_NOT_PUBLISHED"));
});

test("a mismatched timestamp, coverage, return basis or benchmark fails closed", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const quality = json("quant/data/product/total-return-quality-v1.json");
  for (const mutate of [
    (s, q) => { q.generatedAt = "2000-01-01T00:00:00.000Z"; },
    (s, q) => { q.asOf = "2000-01-01"; },
    (s, q) => { q.signalStudy.withTotalReturn -= 1; },
    (s, q) => { q.signalStudy.returnType = "SPLIT_ADJUSTED_PRICE"; },
    (s, q) => { q.corporateActionContract = "future-contract"; },
    (s, q) => { q.benchmarkContract = "future-contract"; },
    (s, q) => { q.benchmark.role = "UNIVERSE_MEMBER"; },
    (s, q) => { q.schemaVersion = "future-unreviewed-contract"; }
  ]) {
    const s = structuredClone(signal), q = structuredClone(quality);
    mutate(s, q);
    assert.equal(C.signalSourceStatus(s, q).state, "INCONSISTENT");
    assert.throws(() => C.assertSignalSourceStatus(s, q), /BACKTEST_SOURCE_ARTIFACTS_INCONSISTENT/);
  }
});

test("an unverified or missing quality artifact cannot pass the certification return-basis gate", () => {
  const signal = json("quant/data/product/signal-backtest-v1.json");
  const missing = C.signalSourceStatus(signal, null);
  assert.equal(missing.state, "UNAVAILABLE");
  assert.equal(C.hasConfirmedTotalReturn(signal, missing), false);
  assert.equal(C.hasConfirmedTotalReturn(signal, { state: "INCONSISTENT" }), false);
  assert.equal(C.hasConfirmedTotalReturn(signal, { state: "AVAILABLE" }), true);
});

test("source consistency does not change any backtest certification status", () => {
  const certification = json("quant/data/product/backtest-certification-v1.json");
  const signalKind = certification.kinds.find((k) => k.id === "SIGNAL_BACKTEST");
  assert.equal(signalKind.status, "LIMITED");
  assert.ok(signalKind.gates.some((g) => g.id === "survivorship" && g.state === "FAIL"));
  assert.ok(signalKind.rules.every((r) => r.status !== "CERTIFIED"));
});

test("die unabhaengige Erwartung erkennt fehlende, zusaetzliche, doppelte und widerspruechliche Ablehnungen", () => {
  const quality = json("quant/data/product/total-return-quality-v1.json"), universe = inputUniverse();
  const base = expectedCoverage(universe, quality);
  assert.deepEqual(base.errors, []);
  const rows = (q) => q.rejected.rows;
  const cases = [
    ["Ablehnung fehlt", (q) => { rows(q).pop(); }, (e) => e.withTotalReturn === base.withTotalReturn + 1 && e.errors.includes("REJECTED_REASONS_MISMATCH")],
    ["Ablehnung doppelt", (q) => { rows(q).push(rows(q)[0].slice()); }, (e) => e.errors.some((x) => x.startsWith("REJECTED_DUPLICATE:"))],
    ["Titel ausserhalb des Universums", (q) => { rows(q).push(["ref_NICHT_IM_UNIVERSUM", "DIVIDEND_MISSING", null]); }, (e) => e.errors.some((x) => x.startsWith("REJECTED_OUTSIDE_UNIVERSE:"))],
    ["Grund widerspricht Zaehler", (q) => { rows(q)[0][1] = "SPLIT_MISSING"; }, (e) => e.errors.includes("REJECTED_REASONS_MISMATCH")],
    ["Zeile ohne Grund", (q) => { rows(q)[0][1] = null; }, (e) => e.errors.includes("REJECTED_ROW_INCOMPLETE")],
    ["Buch fehlt", (q) => { delete q.rejected; }, (e) => e.errors.includes("REJECTED_LEDGER_MISSING")],
    ["Studie groesser als Eingang", (q) => { q.signalStudy.titles = universe.length + 1; }, (e) => e.errors.includes("STUDY_UNIVERSE_LARGER_THAN_INPUT")]
  ];
  for (const [name, mutate, caught] of cases) {
    const q = structuredClone(quality);
    mutate(q);
    assert.ok(caught(expectedCoverage(universe, q)), name);
  }
  /* Studienzaehler gegen die Erwartung: eine Studie, die einen Titel zu viel oder zu wenig meldet, faellt auf. */
  const signal = json("quant/data/product/signal-backtest-v1.json");
  for (const d of [-1, 1]) {
    const s = structuredClone(signal), q = structuredClone(quality);
    s.source.totalReturnCoverage.withTotalReturn += d; s.source.titles += d; q.signalStudy.withTotalReturn += d;
    const st = C.signalSourceStatus(s, q);
    assert.notEqual(st.state === "AVAILABLE" && st.coverage.withTotalReturn === base.withTotalReturn, true, "Abweichung " + d);
  }
  /* Ein neuer Titel im Eingang nach dem Studienlauf ist erlaubt (er fehlt bis zum naechsten Lauf). */
  assert.deepEqual(expectedCoverage(universe.concat("ref_NEU_NACH_STUDIE"), quality).errors, []);
});
