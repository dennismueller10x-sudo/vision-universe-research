import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Compare = require("../engines/return-basis-comparison.js");
/* Der Testlauf schreibt NEBEN das veroeffentlichte Artefakt, nicht
   darauf. Eine Regression, die den Baum anfasst, macht jeden Testlauf zu
   einer Aenderung - und dann steht irgendwann eine Zeile im Commit, die
   niemand geschrieben hat. */
const STUDY = join(tmpdir(), "vu-return-basis-study-test.json");

/* Die Studie laeuft einmal fuer alle Faelle. Im Repository sieht sie nur
   die Golden Preview - genau der Fall, in dem sie sich weigern muss,
   sich als Universumsstudie auszugeben. */
/* DER TEST BESTIMMT SEINEN EINGANG, ER BEOBACHTET IHN NICHT

   Erste Fassung liess das Skript seinen Standardpfad nehmen und
   behauptete dann, das Ergebnis sei REPOSITORY_ONLY. Im Repository
   stimmte das. Im Marktdaten-Workflow liegt unter .market-cache ein
   vollstaendiger Barstore - dort fand dieselbe Zeile 6.874 Titel, und
   drei Tests fielen um. Sie hatten eine Umgebung behauptet statt eines
   Verhaltens, und die Rechnung kam nach siebzig Minuten Kursabruf.

   Jetzt zeigt der Lauf auf ein garantiert leeres Verzeichnis. Damit ist
   der Bestand eine Bedingung des Tests und keine Eigenschaft der
   Maschine, auf der er zufaellig laeuft - und nebenbei dauert er
   Sekunden statt einer Minute. */
const LEER = mkdtempSync(join(tmpdir(), "vu-ohne-barstore-"));

function run() {
  execFileSync("node", ["scripts/market/study-return-basis-universe.mjs",
    "--work-dir", LEER, "--out", STUDY], { stdio: "pipe" });
  return JSON.parse(readFileSync(STUDY, "utf8"));
}
const report = run();

test("die Gewichte der Simulation sind die der Methodik", () => {
  /* Verglichen wird gegen die Methodikdatei, nicht gegen das
     veroeffentlichte Artefakt: die Datei ist die Autoritaet, das
     Artefakt ein Bauergebnis. Nach einem Versionswechsel traegt das
     Artefakt eine Weile noch die alte Fassung, und ein Test, der
     dagegen prueft, meldete dann einen Fehler, den es nicht gibt. */
  const spec = JSON.parse(readFileSync("quant/methodology/quant-v2.json", "utf8"));
  const components = spec.factors.momentum.components;
  for (const [component, weight] of Object.entries(Compare.PRODUCTION_MOMENTUM_WEIGHTS)) {
    const entry = components.find((c) => c.id === component);
    assert.ok(entry, `Komponente ${component} gibt es in der Methodik nicht`);
    assert.equal(entry.weight, weight,
      `Gewicht von ${component}: Simulation ${weight}, Methodik ${entry.weight}`);
  }
  assert.equal(components.length, Object.keys(Compare.PRODUCTION_MOMENTUM_WEIGHTS).length,
    "Die Methodik hat Momentumkomponenten, die die Simulation nicht kennt: " +
    components.map((c) => c.id).join(", "));

  /* Und wenn das veroeffentlichte Artefakt dieselbe Methodikversion
     traegt, muss es auch dasselbe sagen - sonst ist der Bau von der
     Methodik abgewichen. */
  const summary = JSON.parse(readFileSync("quant/data/product/factor-evidence-v1/summary.json", "utf8"));
  if (summary.derivedFrom === spec.methodologyVersion) {
    for (const entry of components) {
      const published = summary.componentSpecs["momentum:" + entry.id];
      assert.ok(published, `Der Bau kennt momentum:${entry.id} nicht`);
      assert.equal(published.weight, entry.weight);
    }
  }
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

test("die Studie setzt die Methodikentscheidung nicht selbst", () => {
  /* Die Studie misst; entschieden hat der Owner. Ihr eigener Report
     bleibt deshalb auf PENDING - er beschreibt den Stand IHRER Messung,
     nicht den des Vertrags. Was gilt, steht im Vertrag, und dort steht
     seit dem 2026-09-24 Option C. */
  assert.equal(report.gateStatus.QUANT_V2_MOMENTUM_RETURN_BASIS, "PENDING_METHOD_DECISION");
  const contract = JSON.parse(readFileSync("quant/methodology/return-semantics-v1.json", "utf8"));
  assert.equal(contract.gateStatus.QUANT_V2_MOMENTUM_BASIS, "SPLIT_ADJUSTED_PRICE");
  assert.equal(contract.gateStatus.QUANT_V2_MOMENTUM_DECISION, "APPROVED_2026-09-24_OPTION_C");
  assert.equal(contract.gateStatus.TOTAL_RETURN_EVIDENCE, "SEPARATE");
  /* Und die alte Basis steht daneben, sonst waere die Umstellung
     still. */
  const entry = contract.modules.find((m) => m.id === "quantV2Momentum");
  assert.equal(entry.decision.previousPublishedBasis, "TOTAL_RETURN");
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
  /* Nur wenn beide Artefakte DENSELBEN Bestand beschreiben. Derselbe
     Etikettenwert genuegt dafuer nicht: im Marktdaten-Workflow trugen
     Audit und Studie beide CANONICAL_HISTORY und meinten zwei
     verschiedene Ablagen - die eine aus R2 bis zum 10., die andere aus
     dem Arbeitsbestand bis zum 17. Der Vergleich meldete daraufhin eine
     Zukunftsschau, die es nicht gab. Verglichen wird deshalb ueber das
     Verzeichnis. */
  if (audit && audit.series.length && audit.scope === report.scope &&
      audit.barsDir === report.inputs.barsDir) {
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
    /* Eine Messgroesse darf fehlen - aber nur mit Zustand UND Grund.
       Eine leere Zeile ohne beides waere genau das stille Weglassen,
       das dieser Test verhindert. */
    if (m.state) {
      assert.ok(m.reason, measure + ": Zustand ohne Grund");
      assert.ok(m.note, measure + ": Zustand ohne Erklaerung");
      continue;
    }
    for (const key of ["UNIVERSE_N", "SPEARMAN_RANK_CORRELATION", "MEDIAN_ABSOLUTE_RANK_CHANGE",
                       "P90_RANK_CHANGE", "P95_RANK_CHANGE", "MAX_RANK_CHANGE",
                       "TITLES_MOVING_1_PERCENTILE", "TITLES_MOVING_5_PERCENTILES",
                       "TITLES_MOVING_10_PERCENTILES", "DIVIDEND_BIAS", "SECTOR_BIAS"]) {
      assert.ok(key in m, `${measure}: ${key} fehlt`);
    }
  }
});

test("relative Staerke ohne Benchmark wird bewiesen, nicht weggelassen", () => {
  /* Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich.
     Relative Staerke ist dann die Zwoelfmonatsrendite minus einer
     Konstante - und eine Konstante verschiebt keinen Rang. Der Test
     rechnet das nach, statt der Behauptung im Bericht zu glauben. */
  const Series = require("../engines/return-series.js");
  const titles = ["AAPL", "JPM", "MSFT", "NVDA", "XOM"]
    .map((t) => `quant/data/market/golden-preview/daily/ref_${t}.json`)
    .filter((f) => existsSync(f))
    .map((f) => Series.build(JSON.parse(readFileSync(f, "utf8"))));
  if (titles.length < 3) return;
  const last = titles[0].bars - 1;
  const twelve = Compare.rankField(titles.map((t) => Compare.momentumAt(t.total, last, null, -1)["12M"])).ranks;
  for (const shape of [(i) => 100 + i * 0.03, (i) => 500 + i * 0.9, (i) => 50 * Math.exp(i / 5000)]) {
    const bench = titles[0].total.map((_, i) => shape(i));
    const rs = Compare.rankField(titles.map((t) => Compare.momentumAt(t.total, last, bench, last).RELATIVE_STRENGTH)).ranks;
    assert.deepEqual(rs, twelve,
      "Die Rangfolge der relativen Staerke weicht von der Zwoelfmonatsrendite ab - dann traegt die Zeile 12M sie nicht mehr");
  }
  const measure = report.cutoffs[0].measures.RELATIVE_STRENGTH;
  if (measure.state) {
    assert.equal(measure.state, "RANK_EQUIVALENT_TO_12M");
    assert.equal(measure.rankStatisticsIdenticalTo, "12M");
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
    execFileSync("node", ["scripts/quant/render-return-basis-study.mjs",
      "--study", STUDY, "--out", join(LEER, "studie.md")], { stdio: "pipe" });
  } catch (error) {
    failed = true;
    assert.match(String(error.stderr), /NICHT geschrieben/);
  }
  assert.ok(failed, "Der Renderer haette die Teilmessung ablehnen muessen");
  assert.equal(existsSync(join(LEER, "studie.md")), false,
    "Der Renderer hat aus einer Teilmessung doch ein Dokument geschrieben");
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
  assert.match(output, /CRITICAL_PRODUCT_GAPS = 0/);
  const contract = JSON.parse(readFileSync("quant/methodology/return-semantics-v1.json", "utf8"));
  if (contract.gateStatus.QUANT_V2_MOMENTUM_BASIS === "PENDING_METHODOLOGY_DECISION") {
    /* Solange offen: der Bericht nennt den Stand des Audits. */
    assert.match(output, /RETURN_BASIS_AUDIT_PARTIAL|RETURN_BASIS_AUDIT_NOT_RUN|RETURN_BASIS_AUDIT_INCOMPLETE|RETURN_BASIS_DECISION_WITH_OWNER/);
  } else {
    /* Entschieden: dann zaehlt nur noch, ob das Veroeffentlichte der
       Entscheidung folgt - und solange nicht, muss genau das dastehen.
       Eine Entscheidung, deren Umsetzung unsichtbar aussteht, ist die
       gefaehrlichere Lage: die alte Zahl sieht aus wie die neue. */
    const summary = JSON.parse(readFileSync("quant/data/product/factor-evidence-v1/summary.json", "utf8"));
    if (summary.methodologyVersion !== "vu-factor-evidence-2.0.0") {
      assert.match(output, /MOMENTUM_BASIS_REMATERIALIZATION_PENDING/);
      assert.match(output, /METHODOLOGY_VERSION_SUPERSEDED/);
    }
    /* Und die Methodik darf sich nicht selbst widersprechen. */
    assert.doesNotMatch(output, /MOMENTUM_SPEC_CONTRADICTS_ITSELF/);
    assert.doesNotMatch(output, /MOMENTUM_COMPONENT_NAMES_STALE/);
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

test("entscheidungsreif heisst: kein unerklaerter Tag im Messfenster", () => {
  /* Der Anteil unerklaerter Bereinigungen an der ganzen Historie sagt
     nichts ueber die Belastbarkeit eines Querschnitts - ein unerklaerter
     Tag von 2003 kann eine Messung von 2026 nicht verzerren. Gemessen
     wird deshalb, ob einer davon IN dem Fenster liegt, ueber das
     gerechnet wird. Das ist die schaerfere Bedingung. */
  for (const cutoff of report.cutoffs) {
    assert.ok(Number.isFinite(cutoff.unexplainedInsideWindow),
      "Stichtag " + cutoff.cutoffDate + " weist die Zahl nicht aus");
  }
  assert.ok("UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW" in report.gateStatus);

  /* Nach dem Ausschluss muss das Feld an jedem Stichtag null sein -
     sonst hat der Ausschluss nicht gegriffen, und die Zahl wuerde eine
     Sauberkeit behaupten, die es nicht gibt. */
  for (const cutoff of report.cutoffs) {
    assert.equal(cutoff.unexplainedInsideWindow, 0,
      "Stichtag " + cutoff.cutoffDate + ": beruehrte Titel sind noch in der Messung");
    assert.ok(Number.isFinite(cutoff.excludedForUnexplainedAdjustment));
    assert.equal(cutoff.securitiesWithCutoff + cutoff.excludedForUnexplainedAdjustment,
      cutoff.securitiesBeforeExclusion, "Ausschlussbilanz geht nicht auf");
    /* Und jeder Ausschluss ist benannt, nicht nur gezaehlt. */
    assert.equal((cutoff.excludedForUnexplainedAdjustmentTickers || []).length,
      cutoff.excludedForUnexplainedAdjustment, "ausgeschlossene Titel nicht vollstaendig benannt");
  }
  const beruehrt = report.cutoffs.some((c) => c.unexplainedInsideWindow > 0);
  const garNichtBereinigt = (report.totalReturnVerification.failureClasses || {}).NO_ADJUSTMENT_AT_ALL || 0;
  if (beruehrt || garNichtBereinigt > 0) {
    assert.equal(report.gateStatus.METHODOLOGY_DECISION_READY, "FAIL",
      "Ein beruehrtes Messfenster oder eine gar nicht bereinigte Dividende darf nicht entscheidungsreif sein");
  }
  /* Und eine Teilmessung ist nie entscheidungsreif, egal wie sauber sie
     in sich ist. */
  if (report.scope !== "CANONICAL_HISTORY") {
    assert.equal(report.gateStatus.METHODOLOGY_DECISION_READY, "FAIL");
  }
});
