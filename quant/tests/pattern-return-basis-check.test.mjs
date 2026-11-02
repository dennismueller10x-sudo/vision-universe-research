/* Pruefmodus der Musterstudie (Entscheidung FV-5, Schritt 1) und vorbereitete
   Zertifizierungsanbindung (P4.2).

   Geprueft wird:
     - compare-pattern-return-basis.mjs auf echten Erzeuger-Ausgaben (synthetische
       Fixtures, --return-basis price und total auf derselben Tageshistorie):
       Abdeckung, Ausschluesse nach Grund, Urteile je Hypothese und Horizont,
       Zustand BELOW_MINIMUM_SHARE (Exit 2 mit --strict) und PASS.
     - Der Vergleich verweigert vertauschte oder gemischte Eingaben.
     - Der Bericht und seine Kurzfassung tragen nur Aggregate (kein Titel, kein Kurs).
     - build-backtest-certification.mjs liest die Renditebasis der Musterstudie aus
       der Studie: die committete Kursrendite-Studie ergibt das committete Artefakt
       (eingefrorene Uhr, --out), das Gate bleibt FAIL mit
       STUDY_RETURN_BASIS_NOT_TOTAL_RETURN; eine Gesamtrendite-Studie mit Abdeckung
       PASS laesst es bestehen, eine mit BELOW_MINIMUM_SHARE oder Mischung nicht.

   Alles in temporaeren Verzeichnissen (--series-dir/--out, Testisolation). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writePatternFixture, TITLES, INCLUDED, EXCLUDED } from "./helpers/pattern-total-return-fixtures.mjs";
import { compareStudies, summarizeReport, REPORT_SCHEMA } from "../../scripts/quant/research/compare-pattern-return-basis.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUILDER = join(ROOT, "scripts/quant/build-pattern-research.mjs");
const COMPARE = join(ROOT, "scripts/quant/research/compare-pattern-return-basis.mjs");
const CERT = join(ROOT, "scripts/quant/build-backtest-certification.mjs");
const BacktestSource = require(join(ROOT, "quant/engines/backtest-artifact-consistency.js"));

const tmp = mkdtempSync(join(tmpdir(), "pattern-basis-check-"));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

/* Zwei Bestaende: alle acht Titel (drei ohne Beleg -> 5/8 BELOW_MINIMUM_SHARE)
   und nur die fuenf belegten (5/5 PASS). */
const fxAll = writePatternFixture(join(tmp, "all"));
const fxOk = writePatternFixture(join(tmp, "ok"), TITLES.filter((t) => INCLUDED.includes(t.ticker)));

function build(name, fx, basis) {
  const out = join(tmp, "study-" + name);
  const run = spawnSync(process.execPath, [BUILDER, "--series-dir", fx.series, "--work-dir", fx.work, "--return-basis", basis, "--out", out], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return { out, study: JSON.parse(readFileSync(join(out, "study.json"), "utf8")) };
}
const allPrice = build("all-price", fxAll, "price");
const allTotal = build("all-total", fxAll, "total");
const okPrice = build("ok-price", fxOk, "price");
const okTotal = build("ok-total", fxOk, "total");

function compareCli(price, total, extra = []) {
  const out = join(tmp, "report-" + Math.random().toString(36).slice(2) + ".json");
  const summary = out.replace(/\.json$/, ".summary.json");
  const run = spawnSync(process.execPath, [COMPARE, "--price", price, "--total", total, "--out", out, "--summary-out", summary, ...extra], { encoding: "utf8" });
  return { run, report: existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null, summary: existsSync(summary) ? JSON.parse(readFileSync(summary, "utf8")) : null };
}

test("Vergleich: Abdeckung, Ausschluesse nach Grund und BELOW_MINIMUM_SHARE", () => {
  const { run, report } = compareCli(allPrice.out, allTotal.out);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(report.schemaVersion, REPORT_SCHEMA);
  assert.equal(report.state, "BELOW_MINIMUM_SHARE");
  assert.match(report.decision, /^ABBRUCH/);
  const c = report.coverage;
  assert.equal(c.seriesEligible, TITLES.length);
  assert.equal(c.withTotalReturn, INCLUDED.length);
  assert.equal(c.share, 0.625);
  assert.equal(c.minimumShare, 0.95);
  const expected = {};
  for (const reason of Object.values(EXCLUDED)) expected[reason] = (expected[reason] || 0) + 1;
  assert.deepEqual(c.exclusionsByReason, expected);
  assert.equal(Object.values(c.exclusionsByBucket).reduce((a, b) => a + b, 0), Object.keys(EXCLUDED).length);
  assert.equal(report.comparability.paired, false);
  assert.equal(report.comparability.seriesDropped, Object.keys(EXCLUDED).length);
  assert.equal(report.inputs.total.mixed, false);
  assert.equal(report.inputs.price.returnType, "PRICE_RETURN");
});

test("--strict: BELOW_MINIMUM_SHARE endet mit Exit 2, der Bericht steht trotzdem", () => {
  const { run, report } = compareCli(allPrice.out, allTotal.out, ["--strict"]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /BELOW_MINIMUM_SHARE/);
  assert.equal(report.state, "BELOW_MINIMUM_SHARE");
  const ok = compareCli(okPrice.out, okTotal.out, ["--strict"]);
  assert.equal(ok.run.status, 0, ok.run.stderr);
  assert.equal(ok.report.state, "PASS");
  assert.equal(ok.report.coverage.share, 1);
});

test("Befunde je Hypothese und Horizont vorher/nachher: Urteil, Effekt, ROBUST", () => {
  const report = compareStudies(okPrice.study, okTotal.study);
  const horizons = report.horizons.map((h) => h.horizon);
  assert.deepEqual(horizons, [okPrice.study.primary.horizon, ...okPrice.study.secondaryHorizons.map((h) => h.horizon)]);
  assert.equal(report.horizons.filter((h) => h.primary).length, 1);
  for (const h of report.horizons) {
    const src = h.primary ? okPrice.study.primary.findings : okPrice.study.secondaryHorizons.find((x) => x.horizon === h.horizon).findings;
    const tgt = h.primary ? okTotal.study.primary.findings : okTotal.study.secondaryHorizons.find((x) => x.horizon === h.horizon).findings;
    assert.equal(h.findings.length, new Set([...src, ...tgt].map((f) => f.patternId)).size);
    /* ROBUST-Bilanz geht auf: vorher = gehalten + verloren, nachher = gehalten + neu. */
    assert.equal(h.robust.price, src.filter((f) => f.verdict === "ROBUST").length);
    assert.equal(h.robust.total, tgt.filter((f) => f.verdict === "ROBUST").length);
    assert.equal(h.robust.price, h.robust.kept + h.robust.lost);
    assert.equal(h.robust.total, h.robust.kept + h.robust.gained);
    const changes = h.findings.filter((f) => f.verdictChanged).length;
    assert.equal(Object.values(h.verdictTransitions).reduce((a, b) => a + b, 0), changes);
    for (const f of h.findings) {
      const a = src.find((x) => x.patternId === f.patternId), b = tgt.find((x) => x.patternId === f.patternId);
      assert.equal(f.price.verdict, a.verdict);
      assert.equal(f.total.verdict, b.verdict);
      assert.equal(f.price.robust, a.verdict === "ROBUST");
      if (typeof a.lift === "number" && typeof b.lift === "number") assert.ok(Math.abs(f.deltaLift - (b.lift - a.lift)) < 1e-3);
    }
    const priceBase = h.primary ? okPrice.study.primary.baseRate : okPrice.study.secondaryHorizons.find((x) => x.horizon === h.horizon).baseRate;
    assert.equal(h.price.baseRate, Math.round(priceBase * 1e6) / 1e6);
  }
  /* Basisquoten je Horizont und Schwelle, beide Seiten. */
  assert.equal(report.baseRateGrid.length, okPrice.study.baseRateGrid.length);
  for (const g of report.baseRateGrid) assert.ok(g.total, g.horizon + "/" + g.winnerThreshold);
  /* Gesamtrendite hebt die Basisquote auf denselben Titeln nie (Dividenden nie negativ). */
  assert.ok(report.summary.baseRate.total >= report.summary.baseRate.price);
});

test("Vergleich verweigert vertauschte, gemischte oder fremde Eingaben", () => {
  assert.throws(() => compareStudies(okTotal.study, okTotal.study), /--price ist eine Gesamtrendite-Studie/);
  assert.throws(() => compareStudies(okPrice.study, okPrice.study), /erwartet TOTAL_RETURN/);
  const mixed = JSON.parse(JSON.stringify(okTotal.study)); mixed.returnBasis.mixed = true;
  assert.throws(() => compareStudies(okPrice.study, mixed), /mixed ist nicht false/);
  const other = JSON.parse(JSON.stringify(okTotal.study)); other.methodologyVersion = "pattern-research-9.9.9";
  assert.throws(() => compareStudies(okPrice.study, other), /Methodik verschieden/);
  const cli = compareCli(okTotal.out, okPrice.out);
  assert.notEqual(cli.run.status, 0);
  assert.equal(cli.report, null, "bei Verweigerung wird kein Bericht geschrieben");
});

test("Bericht und Kurzfassung tragen nur Aggregate: kein Titel, keine Kennung, kein Kurs", () => {
  const { report, summary } = compareCli(allPrice.out, allTotal.out);
  for (const doc of [report, summary]) {
    const text = JSON.stringify(doc);
    for (const t of TITLES) {
      assert.ok(!text.includes('"' + t.ticker + '"'), "Kuerzel " + t.ticker);
      assert.ok(!text.includes("ref_" + t.ticker), "Kennung " + t.ticker);
    }
    assert.ok(!/"(closes|points|bars|excluded|dates)"\s*:/.test(text), "keine Reihen oder Ausschlusslisten");
  }
  assert.equal(summary.schemaVersion, REPORT_SCHEMA + "+summary");
  assert.deepEqual(summary.coverage, report.coverage);
  for (const h of summary.horizons) {
    assert.equal(h.findings, undefined);
    const full = report.horizons.find((x) => x.horizon === h.horizon);
    const expected = full.findings.filter((f) => f.verdictChanged || f.price.robust || f.total.robust).map((f) => f.patternId);
    assert.deepEqual(h.robustOrChanged.map((row) => row[0]), expected);
    for (const row of h.robustOrChanged) assert.equal(row.length, h.robustOrChangedColumns.length);
  }
  assert.deepEqual(summarizeReport(report), summary);
});

/* ---------------- Zertifizierungsanbindung ---------------- */

const COMMITTED_CERT = join(ROOT, "quant/data/product/backtest-certification-v1.json");
const COMMITTED_STUDY = join(ROOT, "quant/data/product/pattern-research-v1/study.json");
const committedCert = JSON.parse(readFileSync(COMMITTED_CERT, "utf8"));
const committedStudy = JSON.parse(readFileSync(COMMITTED_STUDY, "utf8"));

/* Eingefrorene Uhr auf den Erzeugungszeitpunkt des committeten Artefakts:
   asOf und die Frische-Tage der Historien haengen am heutigen Datum. */
const clock = join(tmp, "clock.mjs");
writeFileSync(clock, "const F = Date.parse(process.env.VU_TEST_NOW); const R = Date;\n" +
  "globalThis.Date = class extends R { constructor(...a) { if (a.length === 0) super(F); else super(...a); } static now() { return F; } };\n");

function certify(name, studyFile) {
  const out = join(tmp, "cert-" + name + ".json");
  const args = ["--import", clock, CERT, "--out", out, ...(studyFile ? ["--pattern-study", studyFile] : [])];
  const run = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, VU_TEST_NOW: committedCert.generatedAt } });
  assert.equal(run.status, 0, run.stderr);
  const text = readFileSync(out, "utf8");
  return { text, doc: JSON.parse(text) };
}
const patternKind = (doc) => doc.kinds.find((k) => k.id === "PATTERN_EVIDENCE");
const returnGate = (doc) => patternKind(doc).gates.find((g) => g.id === "returnBasis");

/* Pfade, die andere Datenlaeufe (Index-Zugehoerigkeit, Faktor-Historie)
   zwischen zwei Materialisierungen fortschreiben, ohne das Zertifikat neu zu
   bauen. Nur dort darf ein Unterschied liegen; PATTERN_EVIDENCE nie. */
const HISTORY_PATH = /^\/kinds\/(STRATEGY_BACKTEST|FACTOR_RANKING_BACKTEST)\//;
function diffPaths(a, b, path = "", out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && a.every((x) => x && x.id) && b.every((x) => x && x.id)) {
      const ids = new Set([...a.map((x) => x.id), ...b.map((x) => x.id)]);
      for (const id of ids) diffPaths(a.find((x) => x.id === id), b.find((x) => x.id === id), path + "/" + id, out);
      return out;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], path + "/" + k, out);
    return out;
  }
  out.push(path);
  return out;
}

test("Zertifizierung: die committete Kursrendite-Studie ergibt das committete Artefakt, Gate exakt FAIL wie bisher", () => {
  const { text, doc } = certify("committed");
  const strip = (s) => s.replace(/"generatedAt": "[^"]*"/, "");
  if (strip(text) !== strip(readFileSync(COMMITTED_CERT, "utf8"))) {
    /* Bytegleich, solange die Historien seit der Materialisierung stehen; sonst
       nur in den Historien-Pfaden verschieden. */
    const paths = diffPaths(committedCert, doc).filter((p) => p !== "/generatedAt");
    assert.deepEqual(paths.filter((p) => !HISTORY_PATH.test(p)), [], "Unterschiede ausserhalb der Historien: " + paths.join(", "));
  }
  assert.equal(JSON.stringify(patternKind(doc)), JSON.stringify(patternKind(committedCert)), "PATTERN_EVIDENCE bytegleich");
  if (committedStudy.returnType !== "TOTAL_RETURN") {
    assert.deepEqual(returnGate(doc), {
      id: "returnBasis", label: "Gesamtrendite", category: "STRUCTURAL", state: "FAIL",
      value: "Diese Musterstudie verwendet Kursrendite", required: null, reason: "STUDY_RETURN_BASIS_NOT_TOTAL_RETURN"
    });
  }
});

test("Zertifizierung: Gesamtrendite-Studie mit Abdeckung PASS besteht das Gate, PATTERN_EVIDENCE bleibt LIMITED", () => {
  assert.equal(okTotal.study.population.totalReturnCoverage.state, "PASS");
  const { doc } = certify("tr-pass", join(okTotal.out, "study.json"));
  const gate = returnGate(doc);
  assert.equal(gate.state, "PASS");
  assert.equal(gate.reason, null);
  assert.equal(gate.value, "Gesamtrendite (" + okTotal.study.returnBasis.contract + ", " + okTotal.study.returnBasis.weeklyContract + ")");
  /* Nur returnBasis wechselt: Ueberlebende und Backtest-Freigabe bleiben offen. */
  const k = patternKind(doc);
  assert.equal(k.status, "LIMITED");
  assert.equal(k.gates.find((g) => g.id === "survivorship").state, "FAIL");
  assert.equal(k.gates.find((g) => g.id === "certifiedAsBacktest").state, "FAIL");
  assert.deepEqual(k.gates.map((g) => g.id), patternKind(committedCert).gates.map((g) => g.id), "keine Gate-Definition geaendert");
});

test("Zertifizierung: BELOW_MINIMUM_SHARE oder Mischung bleibt FAIL mit demselben Grund", () => {
  assert.equal(allTotal.study.population.totalReturnCoverage.state, "BELOW_MINIMUM_SHARE");
  const below = certify("tr-below", join(allTotal.out, "study.json"));
  assert.equal(returnGate(below.doc).state, "FAIL");
  assert.equal(returnGate(below.doc).reason, "STUDY_RETURN_BASIS_NOT_TOTAL_RETURN");
  assert.match(returnGate(below.doc).value, /BELOW_MINIMUM_SHARE/);

  const mixed = JSON.parse(JSON.stringify(okTotal.study)); mixed.returnBasis.mixed = true;
  const file = join(tmp, "study-mixed.json"); writeFileSync(file, JSON.stringify(mixed));
  assert.equal(returnGate(certify("tr-mixed", file).doc).reason, "STUDY_RETURN_BASIS_NOT_TOTAL_RETURN");
  /* Die Kursrendite-Studie der Fixtures ebenso. */
  assert.equal(returnGate(certify("fx-price", join(okPrice.out, "study.json")).doc).state, "FAIL");
});

test("patternTotalReturnStatus: alle drei Bedingungen, sonst der bisherige Grund", () => {
  const ok = BacktestSource.patternTotalReturnStatus(okTotal.study);
  assert.deepEqual([ok.confirmed, ok.reason, ok.coverageState], [true, null, "PASS"]);
  for (const mutate of [
    (s) => { delete s.returnType; },
    (s) => { s.returnType = "PRICE_RETURN"; },
    (s) => { delete s.returnBasis; },
    (s) => { s.returnBasis.mixed = true; },
    (s) => { delete s.returnBasis.mixed; },
    (s) => { delete s.population.totalReturnCoverage; },
    (s) => { s.population.totalReturnCoverage.state = "BELOW_MINIMUM_SHARE"; }
  ]) {
    const s = JSON.parse(JSON.stringify(okTotal.study)); mutate(s);
    const st = BacktestSource.patternTotalReturnStatus(s);
    assert.deepEqual([st.confirmed, st.reason], [false, "STUDY_RETURN_BASIS_NOT_TOTAL_RETURN"]);
  }
  assert.equal(BacktestSource.patternTotalReturnStatus(null).confirmed, false);
  assert.equal(BacktestSource.patternTotalReturnStatus(committedStudy).confirmed, committedStudy.returnType === "TOTAL_RETURN");
});
