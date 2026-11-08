/* Gepaarter Vorher/Nachher-Vergleich der Musterstudie (Owner 02.11.2026, Quant #1259).

   Drei Rechnungen auf derselben Tageshistorie:
     A  --return-basis price                       Kursrendite, volle Population
     B  --population total-return                  Kursrendite, Gesamtrendite-Population
     C  --return-basis total                       Gesamtrendite, Gesamtrendite-Population

   Geprueft wird:
     - --population ist eine reine Populationsauswahl: B ist inhaltsgleich zur Kursstudie
       auf genau den belegten Titeln (gleiche Befunde, gleiche Basisquoten), und B und C sind
       gepaart (gleiche Beobachtungen, gleiche auswertbare Beobachtungen, gleiche Erkennung).
     - fail closed: falscher Wert, ohne --work-dir, ohne --out, zusammen mit --return-basis total.
     - paired-diagnostics.json: Gewinner in beiden Basen stimmen mit B und C ueberein, Buckets
       summieren sich, Nicht-Ausschuetter bekommen keine neuen Gewinner, nur Aggregate.
     - compare-pattern-return-basis.mjs --price-population: Zerlegung A/B/C, verlorene Befunde
       mit Ursache, Mechanismus; verweigert ungepaarte Eingaben; Kurzfassung ohne Titel.
     - lossCause und mechanismOf auf festen Zahlen.

   Alles in temporaeren Verzeichnissen (--series-dir/--out, Testisolation). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writePatternFixture, TITLES, INCLUDED } from "./helpers/pattern-total-return-fixtures.mjs";
import {
  comparePaired, summarizePaired, lossCause, mechanismOf, familiesOf, DECOMPOSITION, PAIRED_SCHEMA
} from "../../scripts/quant/research/compare-pattern-return-basis.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUILDER = join(ROOT, "scripts/quant/build-pattern-research.mjs");
const COMPARE = join(ROOT, "scripts/quant/research/compare-pattern-return-basis.mjs");

const tmp = mkdtempSync(join(tmpdir(), "pattern-paired-"));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

/* Acht Titel aus der gemeinsamen Fixture plus ein Titel ohne Ausschuettung. */
const NON_PAYER = { ticker: "PTN", seed: 97, drift: 0.22, vol: 0.55, noDividend: true };
const ALL = TITLES.concat([NON_PAYER]);
const KEPT = INCLUDED.concat(["PTN"]);
const fx = writePatternFixture(join(tmp, "fx"), ALL);

function build(name, extra, seriesDir = fx.series, withOut = true) {
  const out = join(tmp, "out-" + name);
  const argv = [BUILDER, "--series-dir", seriesDir, ...(withOut ? ["--out", out] : []), ...extra];
  const run = spawnSync(process.execPath, argv, { encoding: "utf8" });
  const read = (file) => (run.status === 0 && existsSync(join(out, file)) ? JSON.parse(readFileSync(join(out, file), "utf8")) : null);
  return { run, out, study: read("study.json"), diagnostics: read("paired-diagnostics.json") };
}

const A = build("A", ["--work-dir", fx.work, "--return-basis", "price"]);
const B = build("B", ["--work-dir", fx.work, "--population", "total-return"]);
const C = build("C", ["--work-dir", fx.work, "--return-basis", "total"]);

const horizons = (s) => [{ horizon: s.primary.horizon, usable: s.primary.usableObservations, winners: s.primary.winners, findings: s.primary.findings }]
  .concat(s.secondaryHorizons.map((h) => ({ horizon: h.horizon, usable: h.usableObservations, winners: h.winners, findings: h.findings })));

test("--population fail closed: Wert, --work-dir, --out, keine Kombination mit Gesamtrendite", () => {
  const typo = build("typo", ["--work-dir", fx.work, "--population", "tr"]);
  assert.notEqual(typo.run.status, 0);
  assert.match(typo.run.stderr, /--population must be 'all' or 'total-return'/);
  const noWork = build("no-work", ["--population", "total-return"]);
  assert.notEqual(noWork.run.status, 0);
  assert.match(noWork.run.stderr, /requires --work-dir/);
  const noOut = build("no-out", ["--work-dir", fx.work, "--population", "total-return"], fx.series, false);
  assert.notEqual(noOut.run.status, 0);
  assert.match(noOut.run.stderr, /requires --out/);
  const both = build("both", ["--work-dir", fx.work, "--population", "total-return", "--return-basis", "total"]);
  assert.notEqual(both.run.status, 0);
  assert.match(both.run.stderr, /price-return twin/);
  for (const r of [typo, noWork, both]) assert.equal(existsSync(r.out), false);
  /* Ausdruecklich --population all ist der Standardpfad. */
  const all = build("all", ["--work-dir", fx.work, "--population", "all"]);
  assert.equal(all.run.status, 0, all.run.stderr);
  const strip = (s) => JSON.stringify({ ...s, generatedAt: null, runtimeMs: null });
  assert.equal(strip(all.study), strip(A.study));
  assert.equal(existsSync(join(all.out, "paired-diagnostics.json")), false);
});

test("reine Populationsauswahl: B gleicht der Kursstudie auf genau den belegten Titeln", () => {
  for (const r of [A, B, C]) assert.equal(r.run.status, 0, r.run.stderr);
  const subset = join(tmp, "series-kept");
  mkdirSync(subset, { recursive: true });
  for (const f of readdirSync(fx.series)) if (KEPT.includes(f.slice(4, -5))) copyFileSync(join(fx.series, f), join(subset, f));
  const ref = build("subset-price", ["--work-dir", fx.work], subset).study;
  assert.equal(B.study.returnType, undefined);
  assert.equal(B.study.population.totalReturn, false);
  assert.equal(B.study.population.seriesUsed, KEPT.length);
  assert.equal(B.study.population.observations, ref.population.observations);
  assert.deepEqual(B.study.primary, ref.primary);
  assert.deepEqual(B.study.secondaryHorizons, ref.secondaryHorizons);
  assert.deepEqual(B.study.baseRateGrid, ref.baseRateGrid);
  const sel = B.study.population.populationSelection;
  assert.equal(sel.basis, "TOTAL_RETURN_CONFIRMED");
  assert.equal(sel.outcome, "PRICE_RETURN");
  assert.deepEqual(sel.excluded.map((e) => e.securityId), C.study.population.totalReturnCoverage.excluded.map((e) => e.securityId));
  assert.deepEqual(sel.outcomeUnavailableNoTotalReturnLevel, { H12: 0, H24: 0, H36: 0, H60: 0 });
});

test("B und C gepaart: gleiche Beobachtungen, gleiche Erkennung, nur die Ausgaenge wechseln", () => {
  assert.equal(B.study.population.observations, C.study.population.observations);
  assert.deepEqual(B.study.population.volumeCoverage, C.study.population.volumeCoverage);
  const hb = horizons(B.study), hc = horizons(C.study);
  for (let i = 0; i < hb.length; i++) {
    assert.equal(hb[i].usable, hc[i].usable, hb[i].horizon);
    assert.ok(hc[i].winners >= hb[i].winners, hb[i].horizon);
    const support = (h) => Object.fromEntries(h.findings.map((f) => [f.patternId, f.support]));
    assert.deepEqual(support(hb[i]), support(hc[i]));
  }
});

test("paired-diagnostics: Gewinner beider Basen, Buckets, Nicht-Ausschuetter, nur Aggregate", () => {
  const d = B.diagnostics;
  assert.ok(d, "paired-diagnostics.json fehlt");
  assert.equal(d.schemaVersion, "pattern-paired-diagnostics-1.0.0");
  assert.equal(d.studyContentHash, B.study.contentHash);
  assert.equal(d.winnerThreshold, "W100");
  const hb = new Map(horizons(B.study).map((h) => [h.horizon, h])), hc = new Map(horizons(C.study).map((h) => [h.horizon, h]));
  for (const h of d.horizons) {
    assert.equal(h.usableObservations, hb.get(h.horizon).usable);
    assert.equal(h.winnersPrice, hb.get(h.horizon).winners, h.horizon);
    assert.equal(h.winnersTotal, hc.get(h.horizon).winners, h.horizon);
    assert.equal(h.winnersTotal - h.winnersPrice, h.newWinners - h.lostWinners);
    for (const kind of ["trailingYield", "realizedYield"]) {
      const y = h[kind];
      assert.equal(y.buckets.map((b) => b.bucket).join(","), "NONE,Q1,Q2,Q3,Q4");
      assert.equal(y.buckets.reduce((s, b) => s + b.observations, 0), y.measured);
      assert.equal(y.measured + y.withoutYield, h.usableObservations);
      assert.ok(y.buckets.find((b) => b.bucket === "NONE").observations > 0, kind + " NONE leer");
    }
    /* Ohne Ausschuettung kein Gewinner allein durch Gesamtrendite. */
    assert.equal(h.realizedYield.buckets.find((b) => b.bucket === "NONE").newWinners, 0, h.horizon);
    /* Je Hypothese: Muster + Vergleichsgruppe = Population, Gewinnerzahl wie in B/C. */
    const fb = new Map(hb.get(h.horizon).findings.map((f) => [f.patternId, f])), fc = new Map(hc.get(h.horizon).findings.map((f) => [f.patternId, f]));
    for (const p of h.patterns) {
      assert.equal(p.support, fb.get(p.patternId).support);
      assert.equal(p.winnersPrice, fb.get(p.patternId).winners);
      assert.equal(p.winnersTotal, fc.get(p.patternId).winners);
      assert.equal(p.population, fb.get(p.patternId).population);
    }
  }
  const text = JSON.stringify(d);
  for (const t of ALL) assert.doesNotMatch(text, new RegExp('"' + t.ticker + '"'));
  assert.doesNotMatch(text, /ref_|securityId|"levels"|"bars"/);
});

test("Vergleich A/B/C: Zerlegung, verlorene Befunde mit Ursache, Mechanismus", () => {
  const out = join(tmp, "paired.json"), summary = join(tmp, "paired-summary.json"), plain = join(tmp, "plain.json");
  const run = spawnSync(process.execPath, [COMPARE, "--price", A.out, "--total", C.out, "--price-population", B.out, "--out", plain,
    "--paired-out", out, "--paired-summary-out", summary], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Gepaart H24: Basisquote A\/B\/C/);
  const r = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(r.schemaVersion, PAIRED_SCHEMA);
  assert.equal(r.paired, true);
  assert.equal(r.runs.B.observations, r.runs.C.observations);
  assert.equal(r.horizons.length, 4);
  for (const h of r.horizons) {
    const total = Object.values(h.decomposition).reduce((a, b) => a + b, 0);
    assert.equal(total, h.hypotheses.length);
    const dc = h.decomposition;
    assert.equal(h.robust.A, dc.KEPT + dc.LOST_BY_POPULATION + dc.LOST_BY_RETURN + dc.LOST_BY_POPULATION_RECOVERED_BY_RETURN);
    assert.equal(h.robust.B, dc.KEPT + dc.LOST_BY_RETURN + dc.GAINED_BY_POPULATION + dc.GAINED_BY_POPULATION_LOST_BY_RETURN);
    assert.equal(h.robust.C, dc.KEPT + dc.LOST_BY_POPULATION_RECOVERED_BY_RETURN + dc.GAINED_BY_POPULATION + dc.GAINED_BY_RETURN);
    assert.equal(h.lost.count, dc.LOST_BY_POPULATION + dc.LOST_BY_RETURN);
    assert.ok(Math.abs(h.baseRate.populationEffect - (h.baseRate.B - h.baseRate.A)) < 1e-6);
    assert.ok(Math.abs(h.baseRate.returnEffect - (h.baseRate.C - h.baseRate.B)) < 1e-6);
    assert.ok(h.baseRate.returnEffect >= 0, h.horizon);
    for (const l of h.lost.findings) assert.ok(l.cause.payerShare, "Diagnose je verlorenem Befund");
  }
  assert.equal(r.mechanism.length, 4);
  for (const m of r.mechanism) assert.ok(["BESTAETIGT", "TEILWEISE", "NICHT_BESTAETIGT", "NICHT_ANWENDBAR"].includes(m.state));
  const s = JSON.parse(readFileSync(summary, "utf8"));
  assert.equal(s.schemaVersion, PAIRED_SCHEMA + "+summary");
  assert.ok(s.horizons.every((h) => Array.isArray(h.hypothesesColumns) && h.hypotheses.every((row) => row[1] !== "NEVER")));
  const text = readFileSync(summary, "utf8") + readFileSync(out, "utf8");
  for (const t of ALL) assert.doesNotMatch(text, new RegExp('"' + t.ticker + '"'));
  assert.doesNotMatch(text, /ref_|securityId/);
  /* Der bisherige Zwei-Wege-Bericht bleibt unveraendert ungepaart. */
  assert.equal(JSON.parse(readFileSync(plain, "utf8")).comparability.paired, false);
});

test("gepaarter Vergleich verweigert ungepaarte oder vertauschte Eingaben", () => {
  assert.throws(() => comparePaired(A.study, A.study, C.study), /populationSelection/);
  assert.throws(() => comparePaired(A.study, C.study, C.study), /Gesamtrendite-Studie/);
  assert.throws(() => comparePaired(A.study, B.study, B.study), /keine Gesamtrendite-Studie/);
  const shifted = structuredClone(B.study);
  shifted.population.observations += 1;
  assert.throws(() => comparePaired(A.study, shifted, C.study), /Nicht gepaart/);
  const otherIds = structuredClone(B.study);
  otherIds.population.populationSelection.excluded = otherIds.population.populationSelection.excluded.slice(1);
  assert.throws(() => comparePaired(A.study, otherIds, C.study), /Kennungen/);
  const foreign = { ...B.diagnostics, studyContentHash: "0000000000000000" };
  assert.throws(() => comparePaired(A.study, B.study, C.study, foreign), /anderen Studie/);
  assert.doesNotThrow(() => comparePaired(A.study, B.study, C.study, B.diagnostics));
});

test("lossCause: Ursache aus Gewinnerquote gegen Basisquote", () => {
  const side = (lift, cond, base, robust = true) => ({ lift, conditionalRate: cond, baseRate: base, robust });
  /* Basisquote steigt 20 %, Gewinnerquote 5 %: Vergleichsgruppe steigt staerker. */
  const a = side(1.10, 0.33, 0.30), b = side(1.05, 0.315, 0.30), c = side(1.05 * 1.05 / 1.2, 0.315 * 1.05, 0.36, false);
  const x = lossCause(a, b, c, null);
  assert.equal(x.driver, "BASISQUOTE_STEIGT_STAERKER");
  assert.ok(Math.abs(x.lnConditionalRateReturn - Math.log(1.05)) < 1e-3);
  assert.ok(Math.abs(x.lnBaseRateReturn - Math.log(1.2)) < 1e-3);
  assert.ok(x.lnLiftPopulation < 0 && x.lnLiftReturn < 0);
  assert.equal(lossCause(a, b, side(0.9, 0.30, 0.33, false), null).driver, "GEWINNERQUOTE_SINKT");
  assert.equal(lossCause(a, b, side(1.0, 0.40, 0.33, false), null).driver, "SONSTIGES");
  const d = { conditionalRatePrice: 0.3, conditionalRateTotal: 0.33, outsideRatePrice: 0.2, outsideRateTotal: 0.25,
    outsideRateTotalUnused: null, payerShareInside: 0.2, payerShareOutside: 0.5, medianTrailingYieldInside: 0, medianTrailingYieldOutside: 0.01,
    medianRealizedYieldInside: 0.01, medianRealizedYieldOutside: 0.08 };
  const y = lossCause(a, b, c, d);
  assert.deepEqual(y.relativeRise, { inside: 0.1, outside: 0.25 });
  assert.deepEqual(y.payerShare, { inside: 0.2, outside: 0.5 });
});

test("mechanismOf: drei Folgerungen, Zustand", () => {
  const buckets = (noneNew, q4New) => ({ measured: 500, withoutYield: 0, buckets: ["NONE", "Q1", "Q2", "Q3", "Q4"].map((id) => ({
    bucket: id, observations: 100, newWinners: id === "NONE" ? noneNew : id === "Q4" ? q4New : 5 })) });
  const dH = { horizon: "H60", usableObservations: 500, newWinners: 30, lostWinners: 0, baseRatePrice: 0.2, baseRateTotal: 0.26,
    trailingYield: buckets(0, 12), realizedYield: buckets(0, 15) };
  const lost = (inside, outside, riseIn, riseOut) => ({ cause: { payerShare: { inside, outside }, relativeRise: { inside: riseIn, outside: riseOut } } });
  const all = mechanismOf(dH, [lost(0.2, 0.5, 0.05, 0.3), lost(0.3, 0.5, 0.1, 0.3), lost(0.4, 0.5, 0.1, 0.2)]);
  assert.equal(all.state, "BESTAETIGT");
  assert.equal(all.checks.newWinnersFromPayers.newWinnerRateTopQuartile, 0.12);
  assert.equal(all.trailingYield.buckets[4].newWinnerRate, 0.12);
  const part = mechanismOf(dH, [lost(0.6, 0.5, 0.3, 0.1), lost(0.6, 0.5, 0.3, 0.1), lost(0.4, 0.5, 0.1, 0.2)]);
  assert.equal(part.state, "TEILWEISE");
  const none = mechanismOf({ ...dH, trailingYield: buckets(12, 0) }, [lost(0.6, 0.5, 0.3, 0.1)]);
  assert.equal(none.state, "NICHT_BESTAETIGT");
  assert.equal(mechanismOf(dH, []).state, "NICHT_ANWENDBAR");
});

test("Familien und Zerlegungslegende", () => {
  assert.deepEqual(familiesOf("six-month-thrust"), ["SCHUB"]);
  assert.deepEqual(familiesOf("near-52w-high+high-volatility"), ["NAEHE_HOCH", "VOLATILITAET"]);
  assert.deepEqual(familiesOf("six-month-thrust+three-month-thrust"), ["SCHUB"]);
  assert.deepEqual(familiesOf("unbekannt"), ["SONSTIGE"]);
  assert.equal(Object.keys(DECOMPOSITION).length, 8);
});
