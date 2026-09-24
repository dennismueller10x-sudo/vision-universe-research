import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Compare = require("../engines/return-basis-comparison.js");
const STUDY = "quant/data/providers/return-basis-universe-study.json";

/* Die Studie laeuft einmal fuer alle Faelle. Im Repository sieht sie nur
   die Golden Preview - genau der Fall, in dem sie sich weigern muss,
   sich als Universumsstudie auszugeben. */
function run() {
  execFileSync("node", ["scripts/market/study-return-basis-universe.mjs"], { stdio: "pipe" });
  return JSON.parse(readFileSync(STUDY, "utf8"));
}
const report = run();

test("die Gewichte der Simulation sind die der Produktion", () => {
  const summary = JSON.parse(readFileSync("quant/data/product/factor-evidence-v1/summary.json", "utf8"));
  for (const [component, weight] of Object.entries(Compare.PRODUCTION_MOMENTUM_WEIGHTS)) {
    const spec = summary.componentSpecs["momentum:" + component];
    assert.ok(spec, `Komponente momentum:${component} gibt es im veroeffentlichten Evidence nicht`);
    assert.equal(spec.weight, weight,
      `Gewicht von ${component}: Simulation ${weight}, Produktion ${spec.weight}`);
  }
  const published = Object.keys(summary.componentSpecs).filter((k) => k.startsWith("momentum:"));
  assert.equal(published.length, Object.keys(Compare.PRODUCTION_MOMENTUM_WEIGHTS).length,
    "Die Produktion hat Momentumkomponenten, die die Simulation nicht kennt: " + published.join(", "));
});

test("jede Komponente der Simulation hat eine benannte Quelle", () => {
  for (const component of Object.keys(Compare.PRODUCTION_MOMENTUM_WEIGHTS)) {
    assert.ok(Compare.COMPONENT_SOURCE[component],
      `Komponente ${component} ohne Quelle - sie waere still null und das Gewicht fiele weg`);
  }
});

test("ein Lauf ohne kanonischen Bestand gibt sich nicht als Universumsstudie aus", () => {
  assert.equal(report.scope, "REPOSITORY_ONLY");
  assert.match(report.scopeNote, /KEINE Universumsstudie/);
  assert.equal(report.gateStatus.FULL_UNIVERSE_RETURN_AUDIT, "REPOSITORY_ONLY");
  assert.equal(report.gateStatus.METHODOLOGY_DECISION_READY, "FAIL");
});

test("die Methodikentscheidung bleibt offen, solange sie niemand getroffen hat", () => {
  /* Der Owner hat sie ausdruecklich gestoppt. Eine Studie, die sie
     nebenbei setzt, waere genau der stille Umstieg, den der
     Return-Semantics-Vertrag ausschliesst. */
  assert.equal(report.gateStatus.QUANT_V2_MOMENTUM_RETURN_BASIS, "PENDING_METHOD_DECISION");
  const contract = JSON.parse(readFileSync("quant/methodology/return-semantics-v1.json", "utf8"));
  assert.equal(contract.gateStatus.QUANT_V2_MOMENTUM_BASIS, "PENDING_METHODOLOGY_DECISION");
});

test("an historischen Stichtagen gibt es keine Strategiewirkung aus heutigen Fundamentaldaten", () => {
  /* Die nicht-momentumbasierten Faktornoten gibt es nur zu einem
     Stichtag. Sie auf 2023 zu legen waere Future Leakage - und ein
     Ergebnis daraus waere schlimmer als keines. */
  const historical = report.cutoffs.filter((c) => !c.simulation.contemporaneousWithPublishedEvidence);
  assert.ok(historical.length > 0, "keine historischen Stichtage gemessen");
  for (const cutoff of historical) {
    assert.equal(cutoff.STRATEGY_IMPACT.state, "NOT_APPLICABLE");
    assert.equal(cutoff.STRATEGY_IMPACT.reason, "PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME");
    assert.equal(cutoff.simulation.SIMULATION_FIDELITY_TOTAL_VS_PUBLISHED, null);
  }
});

test("jeder Stichtag sieht nur Bars bis zu seinem eigenen Datum", () => {
  /* Die Stichtage liegen absteigend; ein spaeterer Stichtag darf nie
     weniger Historie sehen als ein frueherer, und keiner darf ein
     Datum tragen, das nach dem Ende der Reihen liegt. */
  const dates = report.cutoffs.map((c) => c.cutoffDate);
  const sorted = dates.slice().sort().reverse();
  assert.deepEqual(dates, sorted, "Stichtage nicht absteigend: " + dates.join(", "));
  const audit = existsSync("quant/data/providers/return-basis-input-audit.json")
    ? JSON.parse(readFileSync("quant/data/providers/return-basis-input-audit.json", "utf8")) : null;
  /* Nur wenn beide Artefakte denselben Bestand beschreiben. Ein
     Eingangsaudit vom kanonischen Store gegen eine Studie aus dem
     Repository zu halten vergliche zwei verschiedene Korpora - und das
     Ergebnis waere ein Fehlalarm ueber genau die Sorgfalt, die hier
     geprueft werden soll. */
  if (audit && audit.series.length && audit.scope === report.scope) {
    const last = audit.series.map((s) => s.to).sort().pop();
    for (const date of dates) assert.ok(date <= last, `Stichtag ${date} liegt hinter dem Ende der Daten ${last}`);
  }
});

test("die Gesamtrendite-Reihe wird nachgewiesen, nicht angenommen", () => {
  const v = report.totalReturnVerification;
  assert.ok(["TOTAL_RETURN_CONFIRMED", "TOTAL_RETURN_NOT_UNIFORM", "NOT_MEASURED"].includes(v.verdict));
  if (v.verdict === "TOTAL_RETURN_CONFIRMED") {
    assert.equal(v.eventsConsistent, v.eventsChecked);
    assert.ok(v.eventsChecked >= 30, "zu wenige Ereignisse fuer ein Urteil");
  }
});

test("die veroeffentlichte Basis wird gemessen statt behauptet", () => {
  const p = report.publishedBasis;
  assert.ok(p.entries > 0);
  assert.equal(Object.keys(p.priceBasisCounts).length, 1,
    "uneinheitliche Preisbasis im veroeffentlichten Evidence: " + JSON.stringify(p.priceBasisCounts));
  assert.ok(["TOTAL_RETURN", "MIXED_OR_UNCONFIRMED"].includes(p.measuredQuantV2MomentumBasis));
});

test("der Unterschied zwischen Methodiktext und Rechnung steht im Bericht", () => {
  /* Zwei Momentumkomponenten sind als splitbereinigter Kurs
     beschrieben und werden auf der Gesamtrenditespalte gerechnet. Der
     Befund gehoert in die Entscheidungsgrundlage, nicht in eine stille
     Korrektur. */
  const ids = report.specImplementationFindings.map((f) => f.component);
  assert.ok(ids.includes("momentum:distanceTo52wHigh"), "Befund fehlt: " + ids.join(", "));
  assert.ok(ids.includes("momentum:distanceToSma200"), "Befund fehlt: " + ids.join(", "));
  for (const finding of report.specImplementationFindings) {
    assert.equal(finding.finding, "SPEC_DECLARES_SPLIT_ADJUSTED_BUT_COMPUTED_ON_TOTAL_RETURN_COLUMN");
  }
});

test("jede Messgroesse des Auftrags steht im Bericht", () => {
  const primary = report.cutoffs[0];
  for (const measure of ["3M", "6M", "12M", "12M-1M", "RELATIVE_STRENGTH"]) {
    const m = primary.measures[measure];
    assert.ok(m, "Messgroesse fehlt: " + measure);
    for (const key of ["UNIVERSE_N", "SPEARMAN_RANK_CORRELATION", "MEDIAN_ABSOLUTE_RANK_CHANGE",
                       "P90_RANK_CHANGE", "P95_RANK_CHANGE", "MAX_RANK_CHANGE",
                       "TITLES_MOVING_1_PERCENTILE", "TITLES_MOVING_5_PERCENTILES",
                       "TITLES_MOVING_10_PERCENTILES", "DIVIDEND_BIAS", "SECTOR_BIAS"]) {
      assert.ok(key in m, `${measure}: ${key} fehlt`);
    }
  }
});

test("die Dividendensegmente sind benannt und nicht geraten", () => {
  const segments = Object.keys(report.cutoffs[0].measures["12M"].DIVIDEND_BIAS);
  for (const segment of segments) {
    assert.ok(["NO_DIVIDEND", "LOW_YIELD", "MEDIUM_YIELD", "HIGH_YIELD"].includes(segment),
      "unbekanntes Segment: " + segment);
  }
});

test("das Studiendokument entsteht nicht aus einer Teilmessung", () => {
  /* Ein Papier mit der Ueberschrift "ueber das Produktuniversum", das
     fuenf Titel gesehen hat, ist schlimmer als keines: der Warnkasten
     oben wird ueberlesen, die Tabellen darunter nicht. */
  assert.equal(report.scope, "REPOSITORY_ONLY", "Vorbedingung dieses Tests");
  let failed = false;
  try {
    execFileSync("node", ["scripts/quant/render-return-basis-study.mjs"], { stdio: "pipe" });
  } catch (error) {
    failed = true;
    assert.match(String(error.stderr), /NICHT geschrieben/);
  }
  assert.ok(failed, "Der Renderer haette die Teilmessung ablehnen muessen");
  assert.ok(!existsSync("docs/VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md") ||
    readFileSync("docs/VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md", "utf8").includes("CANONICAL_HISTORY"),
    "Ein Studiendokument aus einer Teilmessung liegt im Baum");
});

test("das Dokument nennt jede Messgroesse des Auftrags", () => {
  /* Gegen den Renderer selbst, nicht gegen ein erzeugtes Dokument -
     sonst bestaetigte der Test nur, dass jemand einmal gerendert hat. */
  const src = readFileSync("scripts/quant/render-return-basis-study.mjs", "utf8");
  for (const flag of ["FULL_UNIVERSE_RETURN_AUDIT", "DUAL_RETURN_SERIES_CAPABLE_UNIVERSE",
                      "PRICE_VS_TOTAL_RANK_CORRELATION", "DIVIDEND_BIAS", "SECTOR_BIAS",
                      "STRATEGY_IMPACT", "METHODOLOGY_DECISION_READY"]) {
    assert.ok(report.gateStatus[flag] !== undefined, "Flag fehlt im Artefakt: " + flag);
  }
  /* Der Flag-Block wird vollstaendig aus gateStatus gerendert; es reicht
     zu pruefen, dass er es aus dem Artefakt nimmt statt aus einer
     eigenen Liste. */
  assert.match(src, /Object\.entries\(study\.gateStatus\)/);
  for (const abschnitt of ["Dividendenschieflage", "Sektorschieflage", "Strategiewirkung",
                           "Historische Robustheit", "Die drei Alternativen"]) {
    assert.ok(src.includes(abschnitt), "Abschnitt fehlt im Renderer: " + abschnitt);
  }
});

test("der Vollstaendigkeitspruefer nennt den Stand des Audits", () => {
  /* Die Return-Basis ist kein Produktloch, sondern ein Owner-Gate. Sie
     muss trotzdem im Bericht stehen: sonst faellt niemandem auf, wenn
     der Audit nie ueber den kanonischen Bestand gelaufen ist und jede
     Aussage darueber wieder aus fuenf Titeln stammt. */
  const output = execFileSync("node", ["scripts/quant/assert-product-completeness.mjs"], { encoding: "utf8" });
  assert.match(output, /RETURN_BASIS_AUDIT_PARTIAL|RETURN_BASIS_AUDIT_NOT_RUN|RETURN_BASIS_AUDIT_INCOMPLETE|RETURN_BASIS_DECISION_WITH_OWNER/);
  assert.match(output, /CRITICAL_PRODUCT_GAPS = 0/);
  /* Und der Befund zu den zwei Komponenten verschwindet nicht dadurch,
     dass die Entscheidung noch offen ist. */
  if (report.specImplementationFindings.length) {
    assert.match(output, /MOMENTUM_SPEC_MISMATCH/);
    assert.match(output, /keine stille Korrektur/);
  }
});

test("die Strategiewirkung nennt ihre Grundlage und ihre Einschraenkung", () => {
  /* Der kanonische Barstore und das veroeffentlichte Evidence stehen
     nicht zwingend auf demselben Tag. Wenn das Evidence spaeter ist,
     darf die Simulation nur laufen, solange jede benutzte Fundamental-
     zahl am Stichtag schon oeffentlich war - und dann muss der Rest
     benannt sein statt mitgerechnet. */
  const sim = report.cutoffs[0].simulation;
  assert.ok(["EVIDENCE_AT_OR_BEFORE_CUTOFF", "FUNDAMENTALS_AT_OR_BEFORE_CUTOFF", "NOT_APPLICABLE"]
    .includes(sim.strategyBasis), "unbekannte Grundlage: " + sim.strategyBasis);
  if (sim.strategyBasis === "FUNDAMENTALS_AT_OR_BEFORE_CUTOFF") {
    assert.ok(sim.publishedEvidenceLagDays > 0);
    assert.ok(sim.limitation, "Einschraenkung nicht benannt");
    assert.ok(Number.isFinite(sim.excludedForLateFundamentals));
  }
  if (sim.strategyBasis === "NOT_APPLICABLE") {
    assert.equal(report.cutoffs[0].STRATEGY_IMPACT.state, "NOT_APPLICABLE");
  }
});

test("ein Abstand zwischen Bestand und Evidence wird benannt, nicht verschwiegen", () => {
  const findings = report.dataFreshnessFindings || [];
  for (const f of findings) {
    assert.equal(f.finding, "CANONICAL_STORE_LAGS_PUBLISHED_EVIDENCE");
    assert.ok(f.lagDays > 0);
    assert.ok(f.canonicalStoreLastDate < f.publishedEvidenceAsOf);
  }
  /* Und wenn es einen gibt, darf die Strategiewirkung nicht so tun, als
     gaebe es ihn nicht. */
  if (findings.length) {
    assert.notEqual(report.cutoffs[0].simulation.strategyBasis, "EVIDENCE_AT_OR_BEFORE_CUTOFF");
  }
});
