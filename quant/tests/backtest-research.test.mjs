// Vertrag der Datenart backtestResearch (quant/data/product/backtest-research-v1.json).
// Erzeuger: scripts/quant/research/build-backtest-research.cjs (pipeline-weekly, Teil backtest-forschung).
// Mit BACKTEST_RESEARCH_ARTIFACT=<datei> prueft der Test zusaetzlich das gerade erzeugte Artefakt (Workflow-Schritt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const B = require("../../scripts/quant/research/build-backtest-research.cjs");
const STATES = ["EXECUTED", "NOT_RUN", "NOT_APPLICABLE", "FAILED", "SKIPPED"];

function checkDoc(doc) {
  assert.equal(doc.schemaVersion, B.SCHEMA);
  assert.match(doc.asOf, /^\d{4}-\d{2}-\d{2}$/);
  // Forschung, nie Produktaussage: intern, nicht oeffentlich, nicht zertifiziert.
  assert.equal(doc.label, "Forschung, nicht zertifiziert");
  const sw = JSON.parse(readFileSync(new URL("../methodology/backtest-research-display.json", import.meta.url), "utf8"));
  const freigabe = sw.public === true && !!sw.approval && sw.approval.text === sw.approvalPhrase;
  assert.equal(doc.display.public, freigabe, "display.public folgt nur dem Schalter mit Freigabesatz");
  assert.equal(doc.audience, freigabe ? "PUBLIC" : "INTERNAL");
  assert.equal(doc.productionApproved, false);
  assert.equal(doc.certificationStatus, "NOT_CERTIFIED");
  assert.ok(Array.isArray(doc.cases) && doc.cases.length > 0);
  assert.equal(doc.summary.cases, doc.cases.length);
  // 6 Arten x 7 Methoden: jede Zelle mit Ergebnis oder benanntem Grund; NOT_APPLICABLE genau nach METHOD_FIT.
  if (doc.matrix) {
    const Run = require("../../scripts/quant/research/backtest-runner.cjs");
    assert.deepEqual(doc.kinds, B.KINDS); assert.deepEqual(doc.methods, B.METHODS);
    for (const k of B.KINDS) for (const m of B.METHODS) {
      const cell = doc.matrix[k][m], fit = Run.METHOD_FIT[m].includes(k);
      assert.ok(cell, k + "/" + m + " fehlt");
      if (!fit) { assert.equal(cell.state, "NOT_APPLICABLE", k + "/" + m); continue; }
      assert.ok(["EXECUTED", "DATA_MISSING", "NOT_RUN", "NO_CASE"].includes(cell.state), k + "/" + m + ": " + cell.state);
      if (cell.state === "EXECUTED") assert.ok(cell.cases.every((id) => doc.cases.find((c) => c.id === id).methods[m].state === "EXECUTED"), k + "/" + m);
      if (cell.state === "DATA_MISSING") assert.ok(cell.missing.length > 0, k + "/" + m + ": fehlender Eingang benannt");
    }
  }
  // Zertifizierung „methodisch geprueft“ (Owner-Lesart 13.11.2026): CERTIFIED genau dann, wenn alle Kriterien bestehen.
  if (doc.certification) {
    const meth = JSON.parse(readFileSync(new URL("../methodology/backtest-method-certification-v1.json", import.meta.url), "utf8"));
    assert.equal(doc.certification.methodology, meth.schemaVersion);
    for (const k of B.KINDS) {
      const c = doc.certification.kinds[k];
      const want = (meth.kinds[k].robustness || []).concat(["reproducible"]);
      for (const id of want) assert.ok(c.criteria.some((x) => x.id === id), k + ": Kriterium " + id);
      const hardFail = c.criteria.some((x) => x.id.startsWith("hard:") && x.state !== "PASS"), restFail = c.criteria.some((x) => !x.id.startsWith("hard:") && x.state !== "PASS");
      assert.equal(c.status, hardFail ? "WITHHELD" : restFail ? "LIMITED" : "CERTIFIED", k);
      assert.equal(c.label, meth.labels[c.status]);
      if (c.status !== "CERTIFIED") assert.ok(c.reason, k + " ohne Grund");
    }
    assert.deepEqual(doc.certification.certifiedKinds, B.KINDS.filter((k) => doc.certification.kinds[k].status === "CERTIFIED"));
  }
  // Ein Schalter: oeffentlich nur mit dem Freigabesatz in quant/methodology/backtest-research-display.json.
  assert.equal(doc.display.public, doc.audience === "PUBLIC");
  for (const c of doc.cases) {
    assert.ok(c.id && c.kind && c.state, "Fall ohne id/kind/state");
    assert.ok(/^[0-9a-f]{64}$/.test(c.resultHash), c.id + ": resultHash");
    assert.deepEqual(Object.keys(c.methods), B.METHODS, c.id + ": Methoden in fester Reihenfolge");
    for (const [m, r] of Object.entries(c.methods)) {
      assert.ok(STATES.includes(r.state) || typeof r.state === "string", c.id + " " + m);
      if (r.state !== "EXECUTED") continue;
      if (m === "MONTE_CARLO") {
        assert.equal(r.scope, "CONDITIONAL_RESAMPLING_NOT_A_FORECAST", c.id + ": Monte Carlo ist keine Prognose");
        assert.ok(r.totalReturn.p5 <= r.totalReturn.p50 && r.totalReturn.p50 <= r.totalReturn.p95, c.id + ": Quantile geordnet");
      }
      if (m === "OUT_OF_SAMPLE") assert.ok(Array.isArray(r.perFold), c.id + ": OOS je Fenster");
      if (m === "MARKET_REGIME") assert.ok(Array.isArray(r.states) && r.states.length > 0, c.id + ": Regime-Zustaende");
    }
    if (c.state === "PREPARED_DATA_LIMITED") assert.ok(c.missingInputs.length > 0 || c.privateData, c.id + ": nennt den fehlenden Eingang");
  }
}

test("BR-1 · Erzeuger: ein ausgefuehrter und ein datenbegrenzter Fall, deterministisch, Vertrag erfuellt", () => {
  const only = ["replay-intc-loser", "acquisition-agn"];
  const a = B.build({ asOf: "2026-11-12", only }), b = B.build({ asOf: "2026-11-12", only });
  assert.deepEqual(a, b, "gleiche Eingaben, gleiches Artefakt");
  checkDoc(a);
  const exec = a.cases.find((c) => c.id === "replay-intc-loser");
  assert.equal(exec.state, "RESEARCH_EXECUTED");
  assert.equal(exec.methods.MONTE_CARLO.state, "EXECUTED");
  assert.equal(a.cases.find((c) => c.id === "acquisition-agn").state, "PREPARED_DATA_LIMITED");
});

test("BR-2 · compact nimmt nur Felder des Ergebnisvertrags, rechnet nichts neu", () => {
  const mc = B.compact("MONTE_CARLO", { state: "EXECUTED", result: { model: "TRADE_IID", simulations: 2000, horizon: 10, sourceObservations: 20, scope: "CONDITIONAL_RESAMPLING_NOT_A_FORECAST",
    totalReturn: { p5: -0.1, p50: 0.2, p95: 0.5 }, maxDrawdown: { p5: -0.4, p50: -0.2, p95: 0 }, inputHash: "x", extra: 1 } });
  assert.deepEqual(mc.totalReturn, { p5: -0.1, p50: 0.2, p95: 0.5 });
  assert.equal(mc.extra, undefined);
  assert.deepEqual(B.compact("WALK_FORWARD", { state: "NOT_RUN" }), { state: "NOT_RUN" });
});

test("BR-4 · Schalter: ohne Freigabesatz bleibt die Anzeige intern", () => {
  const sw = JSON.parse(readFileSync(new URL("../methodology/backtest-research-display.json", import.meta.url), "utf8"));
  assert.equal(sw.approvalPhrase, "Freigabe Backtest-Darstellung öffentlich");
  if (sw.public) assert.equal(sw.approval && sw.approval.text, sw.approvalPhrase, "public=true nur mit Owner-Satz");
});

test("BR-5 · Matrix aus Fallzeilen: anwendbar/nicht anwendbar, Daten fehlen, nicht gerechnet", () => {
  const mk = (id, kind, state, methods, missing = []) => ({ id, kind, state, missingInputs: missing, methods: Object.fromEntries(B.METHODS.map((m) => [m, methods[m] || { state: "NOT_RUN" }])) });
  const mx = B.matrix([mk("a", "SETUP_BACKTEST", "RESEARCH_EXECUTED", { WALK_FORWARD: { state: "EXECUTED" }, OUT_OF_SAMPLE: { state: "NOT_RUN", reason: "R" } }),
    mk("f", "FACTOR_RANKING_BACKTEST", "PREPARED_DATA_LIMITED", {}, ["MISSING_INPUT:PRIVATE_FACTOR_PANEL panel"])]);
  assert.deepEqual(mx.SETUP_BACKTEST.WALK_FORWARD, { state: "EXECUTED", cases: ["a"], verdict: null, verdictCase: "a" });
  assert.equal(mx.SETUP_BACKTEST.MONTE_CARLO.state, "NOT_APPLICABLE");
  assert.equal(mx.SETUP_BACKTEST.OUT_OF_SAMPLE.reason, "R");
  assert.deepEqual(mx.FACTOR_RANKING_BACKTEST.WALK_FORWARD.missing, ["PRIVATE_FACTOR_PANEL"]);
  assert.equal(mx.STRATEGY_BACKTEST.MONTE_CARLO.state, "NO_CASE");
});

test("BR-6 · Zertifizierung: methodisch geprueft, nicht profitabel; Offenlegung aus dem Vorwaerts-Pruefstand", () => {
  const meth = JSON.parse(readFileSync(new URL("../methodology/backtest-method-certification-v1.json", import.meta.url), "utf8"));
  assert.match(meth.definition, /nicht profitabel/);
  const mk = (id, kind, state, hash) => ({ id, kind, state, resultHash: hash, methods: {} });
  const mx = Object.fromEntries(B.KINDS.map((k) => [k, Object.fromEntries(B.METHODS.map((m) => [m, { state: "EXECUTED", cases: ["x"] }]))]));
  mx.SETUP_BACKTEST.OUT_OF_SAMPLE = { state: "NOT_RUN", reason: "R" };
  const forward = { kinds: B.KINDS.map((k) => ({ id: k, status: "LIMITED", gates: [{ id: "pit", category: "HARD", state: k === "FACTOR_RANKING_BACKTEST" ? "FAIL" : "PASS", reason: "PIT" }, { id: "survivorship", label: "Ü", category: "STRUCTURAL", state: "FAIL", reason: "S" }] })) };
  const cases = B.KINDS.map((k) => mk("c-" + k, k, "RESEARCH_EXECUTED", "a".repeat(64)));
  const r = B.certify(cases, mx, meth, forward);
  assert.equal(r.SIGNAL_BACKTEST.status, "CERTIFIED");
  assert.deepEqual(r.SIGNAL_BACKTEST.disclosures.map((d) => d.id), ["survivorship"], "Ueberlebende offengelegt, blockiert nicht");
  assert.equal(r.SETUP_BACKTEST.status, "LIMITED"); assert.equal(r.SETUP_BACKTEST.reason, "R");
  assert.equal(r.FACTOR_RANKING_BACKTEST.status, "WITHHELD");
  assert.equal(B.certify([], mx, meth, forward).SIGNAL_BACKTEST.reason, "NO_REPRODUCIBLE_CASE");
});

test("BR-3 · Erzeugtes Artefakt (falls angegeben) erfuellt den Vertrag", { skip: !process.env.BACKTEST_RESEARCH_ARTIFACT }, () => {
  const f = process.env.BACKTEST_RESEARCH_ARTIFACT;
  assert.ok(existsSync(f), f);
  checkDoc(JSON.parse(readFileSync(f, "utf8")));
});

test("BR-7 · Quant-Profilwert (Forschung): Mittel der sechs Faktoren, mindestens 4 belegt; Prüffälle registriert", () => {
  const Run = require("../../scripts/quant/research/backtest-runner.cjs");
  const X = require("../../scripts/quant/v10/factor/factors.cjs");
  assert.equal(Run.PROFILE_MEAN_MIN, 4);
  assert.equal(Run.profileMean({ quality: 80, growth: 60, value: null, profitability: 70, momentum: 50, risk: 40, composite: 99 }, X), 60, "composite zählt nicht mit");
  assert.equal(Run.profileMean({ quality: null, growth: 60, value: null, profitability: null, momentum: 50, risk: 40 }, X), null, "unter 4 belegten Faktoren kein Wert");
  const cases = JSON.parse(readFileSync(new URL("../../docs/quant/backtest-research/cases.json", import.meta.url), "utf8")).cases;
  for (const id of ["matrix-profile-mean", "matrix-profile-mean-sample"]) {
    const c = cases.find((x) => x.id === id);
    assert.ok(c && c.kind === "FACTOR_RANKING_BACKTEST" && c.privateData === "factorPanel", id);
    const spec = JSON.parse(readFileSync(new URL("../../docs/quant/backtest-research/" + c.spec, import.meta.url), "utf8"));
    Run.validateSpec(spec); assert.equal(spec.engine.factorId, "PROFILE_MEAN");
  }
  assert.equal(B.factorRow({ metrics: { perEvent: null } }), null);
  assert.deepEqual(B.factorRow({ metrics: { perEvent: { factor: { factorId: "PROFILE_MEAN", buckets: 5, rankDates: 24, meanTopMinusBottomCompleteCohort: 0.02, topBeatsBottomShare: 0.6, bucketMeansCompleteCohort: [0.01, 0.02, 0.02, 0.025, 0.03], meanSpearmanObservedOnly: 0.05 } } } }),
    { factorId: "PROFILE_MEAN", buckets: 5, rankDates: 24, meanTopMinusBottom: 0.02, topBeatsBottomShare: 0.6, bucketMeans: [0.01, 0.02, 0.02, 0.025, 0.03], meanSpearman: 0.05 });
});

test("BR-8 · Ampel vergleicht: bewährt nur besser als der Vergleich, nie nur „im Mittel im Plus“", () => {
  const ev = (ex) => ({ metrics: { basis: "PER_EVENT", excess: { meanExcess: ex, n: 10 } } });
  assert.equal(B.comparison("SIGNAL_BACKTEST", ev(-0.006)).state, "LOSES");
  assert.equal(B.comparison("SIGNAL_BACKTEST", ev(0.02)).state, "BEATS");
  assert.equal(B.comparison("STRATEGY_BACKTEST", { metrics: { basis: "PORTFOLIO", benchmark: { id: "ZERO_RATE_CASH", totalReturn: 0 } } }), null, "Bargeld ist kein Marktvergleich");
  assert.match(B.comparison("SAME_STOCK_REPLAY", { metrics: { basis: "PORTFOLIO", totalReturn: 1, benchmark: { id: "SAME_LISTING_BUY_AND_HOLD", totalReturn: 2 } } }).basis, /Kaufen und Halten/);
  const f = (d, sh) => B.comparison("FACTOR_RANKING_BACKTEST", {}, { meanTopMinusBottom: d, topBeatsBottomShare: sh });
  assert.equal(f(-0.10, 0.5).state, "LOSES"); assert.equal(f(0.01, 0.55).state, "MIXED"); assert.equal(f(0.02, 0.7).state, "BEATS");
  const pr = { verdict: "PROVEN", basis: "x" };
  assert.equal(B.combine(pr, { state: "LOSES", basis: "S&P" }).verdict, "FAILED", "im Plus, aber hinter dem Markt: hat versagt");
  assert.equal(B.combine(pr, { state: "MIXED", basis: "Q" }).verdict, "REGIME_DEPENDENT");
  assert.equal(B.combine(pr, { state: "BEATS", basis: "S&P" }).verdict, "PROVEN");
  assert.equal(B.combine(pr, null).verdict, null, "ohne Vergleich keine Einordnung");
});

test("BR-9 · Überlebenden-Auswahl: besser als der Vergleich heißt dann nur „eingeschränkt geprüft“", () => {
  const pr = { verdict: "PROVEN", basis: "x" };
  assert.equal(B.combine(pr, { state: "BEATS", basis: "S&P" }, true).verdict, "LIMITED");
  assert.equal(B.combine(pr, { state: "LOSES", basis: "S&P" }, true).verdict, "FAILED", "verloren bleibt verloren");
  assert.equal(B.combine(pr, { state: "BEATS", basis: "S&P" }, false).verdict, "PROVEN", "mit delisteten Titeln bleibt bewährt möglich");
});
