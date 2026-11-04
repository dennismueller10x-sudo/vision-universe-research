/* Musterstudie mit Ausgaengen in Gesamtrendite (build-pattern-research.mjs --return-basis total,
   Entscheidung FV-5 Schritt 2).

   Geprueft wird:
     - Standardpfad bytegleich: ohne Schalter (und mit --return-basis price) ist die Ausgabe auf
       synthetischen Eingaben inhaltsgleich zu der des unveraenderten Erzeugers (origin/main
       94cab8cf76, Hash ohne generatedAt/runtimeMs), mit und ohne --work-dir.
     - fail closed: --return-basis total ohne --work-dir bricht ab und schreibt nichts.
     - Ausschluss ohne Beleg: Titel ohne bestaetigte Gesamtrendite fallen ganz heraus, je Titel mit Grund.
     - Erkennung bleibt auf Kursen: Beobachtungen, Merkmale und Volumenabdeckung sind dieselben
       wie in der Kursstudie derselben Titel; nur die Ausgaenge wechseln die Basis.
     - Kausalitaet: ein Ausgang haengt nur von Daten nach dem Beobachtungsdatum ab.
     - Dividende und Split: der Split erzeugt keinen Sprung, die Dividende hebt die Wochenrendite.

   Alles mit --series-dir/--out in einem temporaeren Verzeichnis (Testisolation). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { writePatternFixture, TITLES, INCLUDED, EXCLUDED, idOf, dailyBars, weeklyPoints } from "./helpers/pattern-total-return-fixtures.mjs";
import { totalReturnWeekly, forwardOutcome } from "../../scripts/quant/build-pattern-research.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUILDER = join(ROOT, "scripts/quant/build-pattern-research.mjs");
const CTR = require(join(ROOT, "quant/engines/canonical-total-return.js"));

/* Mit dem unveraenderten Erzeuger (origin/main 94cab8cf76) auf writePatternFixture erzeugt:
   SHA-256 von study.json ohne generatedAt und runtimeMs. */
const GOLDEN_DEFAULT = "5286ab11360a35a801c166f0c53f4e9f1d147eeb74f719a6dfa8be6c90ffd6ae";
const GOLDEN_WORK_DIR = "dbee3020ec2dad95cd31625884f8307446d5315ca9b2f4caaa20c2997fed41f0";

const tmp = mkdtempSync(join(tmpdir(), "pattern-tr-"));
const fx = writePatternFixture(tmp);
test.after(() => rmSync(tmp, { recursive: true, force: true }));

function build(name, extra, seriesDir = fx.series) {
  const out = join(tmp, "out-" + name);
  const run = spawnSync(process.execPath, [BUILDER, "--series-dir", seriesDir, "--out", out, ...extra], { encoding: "utf8" });
  return { run, out, study: run.status === 0 ? JSON.parse(readFileSync(join(out, "study.json"), "utf8")) : null };
}
const normalizedHash = (study) => {
  const copy = { ...study };
  delete copy.generatedAt; delete copy.runtimeMs;
  return createHash("sha256").update(JSON.stringify(copy, null, 1) + "\n").digest("hex");
};

test("Standardpfad bytegleich: ohne Schalter wie der Erzeuger vor der Aenderung", () => {
  const plain = build("plain", []);
  assert.equal(plain.run.status, 0, plain.run.stderr);
  assert.equal(normalizedHash(plain.study), GOLDEN_DEFAULT);
  assert.equal(plain.study.returnType, undefined);
  assert.equal(plain.study.population.totalReturn, false);

  const work = build("work", ["--work-dir", fx.work]);
  assert.equal(work.run.status, 0, work.run.stderr);
  assert.equal(normalizedHash(work.study), GOLDEN_WORK_DIR);

  const price = build("price", ["--work-dir", fx.work, "--return-basis", "price"]);
  assert.equal(price.run.status, 0, price.run.stderr);
  assert.equal(normalizedHash(price.study), GOLDEN_WORK_DIR);
  /* Bytegleich bis auf die beiden Laufzeitfelder. */
  const strip = (file) => readFileSync(file, "utf8").replace(/"generatedAt": "[^"]*"/, "").replace(/"runtimeMs": \d+/, "");
  assert.equal(strip(join(price.out, "study.json")), strip(join(work.out, "study.json")));
});

test("fail closed: Gesamtrendite ohne --work-dir bricht ab, keine stille Kursrendite", () => {
  const r = build("no-work", ["--return-basis", "total"]);
  assert.notEqual(r.run.status, 0);
  assert.match(r.run.stderr, /--return-basis total requires --work-dir/);
  assert.equal(existsSync(r.out), false);
  const typo = build("typo", ["--work-dir", fx.work, "--return-basis", "gesamt"]);
  assert.notEqual(typo.run.status, 0);
  assert.match(typo.run.stderr, /must be 'price' or 'total'/);
  assert.equal(existsSync(typo.out), false);
});

test("Gesamtrendite: Vertrag, Abdeckung und Ausschluss je Titel mit Grund", () => {
  const { run, study } = build("total", ["--work-dir", fx.work, "--return-basis", "total"]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(study.returnType, "TOTAL_RETURN");
  assert.equal(study.returnBasis.detection, "SPLIT_ADJUSTED_PRICE");
  assert.equal(study.returnBasis.outcome, "TOTAL_RETURN");
  assert.equal(study.returnBasis.contract, CTR.VERSION);
  assert.equal(study.returnBasis.corporateActionContract, CTR.CORPORATE_ACTION_CONTRACT);
  assert.equal(study.returnBasis.weeklyContract, "weekly-total-return-1.0.0");
  assert.equal(study.returnBasis.mixed, false);
  assert.equal(study.backtest, "NOT_CERTIFIED");
  const cov = study.population.totalReturnCoverage;
  assert.equal(study.population.totalReturn, true);
  assert.equal(cov.seriesEligible, TITLES.length);
  assert.equal(cov.withTotalReturn, INCLUDED.length);
  assert.equal(study.population.seriesUsed, INCLUDED.length);
  assert.equal(cov.excludedNoConfirmedTotalReturn, Object.keys(EXCLUDED).length);
  assert.equal(cov.state, "BELOW_MINIMUM_SHARE");
  assert.equal(cov.minimumShare, 0.95);
  assert.deepEqual(Object.fromEntries(cov.excluded.map((e) => [e.ticker, e.reason])), EXCLUDED);
  for (const e of cov.excluded) assert.equal(e.securityId, idOf(e.ticker));
  assert.equal(cov.TOTAL_RETURN_RECONSTRUCTED, INCLUDED.length);
  assert.deepEqual(cov.reasons, { DIVIDEND_FIELD_MISSING: 1, NO_CANONICAL_SERIES: 1, STALE: 1 });
  /* Nur Aggregate: kein Kurs, kein Gesamtrendite-Wert je Titel im Artefakt. */
  const text = JSON.stringify(study);
  assert.doesNotMatch(text, /"levels"|"tr":\[|"bars"/);
});

test("Erkennung bleibt auf Kursen: dieselben Beobachtungen, nur die Ausgaenge wechseln die Basis", () => {
  const subset = join(tmp, "series-included");
  mkdirSync(subset, { recursive: true });
  for (const f of readdirSync(fx.series)) if (INCLUDED.includes(f.slice(4, -5))) copyFileSync(join(fx.series, f), join(subset, f));
  const price = build("subset-price", ["--work-dir", fx.work], subset).study;
  const total = build("subset-total", ["--work-dir", fx.work, "--return-basis", "total"]).study;
  assert.equal(total.population.observations, price.population.observations);
  assert.equal(total.population.skippedNoFeatures, price.population.skippedNoFeatures);
  assert.deepEqual(total.population.volumeCoverage, price.population.volumeCoverage);
  assert.equal(total.population.firstDate, price.population.firstDate);
  /* Gleiche Kandidatenmengen (Erkennung), andere Ausgaenge. */
  const support = (s) => Object.fromEntries(s.primary.findings.map((f) => [f.patternId, f.support]));
  assert.deepEqual(support(total), support(price));
  let strictlyMore = 0;
  for (const cell of total.baseRateGrid) {
    const p = price.baseRateGrid.find((x) => x.horizon === cell.horizon && x.winnerThreshold === cell.winnerThreshold);
    assert.equal(cell.usableObservations, p.usableObservations, cell.horizon);
    /* Ausschuettungen kommen nur hinzu: nie weniger Gewinner als in Kursrendite. */
    assert.ok(cell.winners >= p.winners, cell.horizon + "/" + cell.winnerThreshold);
    if (cell.winners > p.winners) strictlyMore++;
  }
  assert.ok(strictlyMore > 0, "Gesamtrendite muss mindestens eine Gewinnerzahl erhoehen");
  assert.deepEqual(total.population.totalReturnCoverage.outcomeUnavailableNoTotalReturnLevel, { H12: 0, H24: 0, H36: 0, H60: 0 });
});

test("Tageshistorie beginnt spaeter: Ausgang ohne Gesamtrendite-Wert ist nicht verfuegbar, nie Kurs", () => {
  const late = join(tmp, "late");
  const p = writePatternFixture(late, TITLES.filter((t) => INCLUDED.includes(t.ticker)));
  const file = join(p.daily, idOf("PTA") + ".json");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  payload.bars = payload.bars.filter((b) => b.date >= "2016-01-04");
  writeFileSync(file, JSON.stringify(payload));
  const price = build("late-price", ["--work-dir", p.work], p.series).study;
  const total = build("late-total", ["--work-dir", p.work, "--return-basis", "total"], p.series).study;
  const gap = total.population.totalReturnCoverage.outcomeUnavailableNoTotalReturnLevel;
  assert.ok(gap.H12 > 0 && gap.H24 > 0);
  const cell = (s) => s.baseRateGrid.find((x) => x.horizon === "H12" && x.winnerThreshold === "W100");
  assert.equal(cell(total).usableObservations, cell(price).usableObservations - gap.H12);
  assert.equal(cell(total).outcomeUnavailable, cell(price).outcomeUnavailable + gap.H12);
});

/* ---------------------------------------------------------------- Einheit */
const PTA = TITLES.find((t) => t.ticker === "PTA"), PTB = TITLES.find((t) => t.ticker === "PTB");
const payloadOf = (bars, ticker) => ({ ticker, securityId: idOf(ticker), provider: "tiingo", currency: "USD", bars });
const noProvider = (bars) => bars.map((b) => ({ ...b, adjustedClose: null }));

test("Dividende und Split: kein Sprung am Split, Dividende hebt die Wochenrendite", () => {
  const bars = dailyBars(PTB), weekly = weeklyPoints(bars), dates = weekly.map((p) => p[0]);
  const tr = totalReturnWeekly(payloadOf(bars, "PTB"), dates);
  assert.equal(tr.confirmed, true);
  assert.equal(tr.levels.length, dates.length);
  assert.ok(tr.levels.every((v) => v > 0));
  let dividendWeeks = 0, splitWeek = false;
  for (let i = 1; i < dates.length; i++) {
    const inWeek = bars.filter((b) => b.date > dates[i - 1] && b.date <= dates[i]);
    const D = inWeek.reduce((s, b) => s + b.dividend, 0), split = inWeek.some((b) => b.splitFactor !== 1);
    const excess = (tr.levels[i] / tr.levels[i - 1]) / (weekly[i][1] / weekly[i - 1][1]) - 1;
    if (D > 0) { dividendWeeks++; assert.ok(excess > 0.004 && excess < 0.012, dates[i] + " " + excess); }
    else assert.ok(Math.abs(excess) < 1e-3, dates[i] + " " + excess);
    if (split) { splitWeek = true; assert.ok(Math.abs(tr.levels[i] / tr.levels[i - 1] - weekly[i][1] / weekly[i - 1][1]) < 1e-3); }
  }
  assert.ok(splitWeek && dividendWeeks > 40);
});

test("Kausalitaet: der Ausgang haengt nur von Daten nach dem Beobachtungsdatum ab", () => {
  const bars = noProvider(dailyBars(PTA)), dates = weeklyPoints(bars).map((p) => p[0]);
  const k = 300, h = 52, t = dates[k], end = dates[k + h];
  const base = totalReturnWeekly(payloadOf(bars, "PTA"), dates);
  assert.equal(base.confirmed, true);
  const o0 = forwardOutcome(base.levels, k, h);
  assert.equal(o0.state, "AVAILABLE");
  const same = (a, b) => ["forwardReturn", "maxDrawdownWithinHorizon", "maxForwardReturn"].forEach((f) => assert.ok(Math.abs(a[f] - b[f]) < 1e-12, f));

  /* Nur die Fenster-Werte zaehlen: alles davor und danach unbrauchbar -> gleicher Ausgang. */
  const masked = base.levels.map((v, i) => (i >= k && i <= k + h ? v : NaN));
  same(forwardOutcome(masked, k, h), o0);

  /* Vergangenheit vor t geaendert (Kursniveau, zusaetzliche Dividende) -> gleicher Ausgang. Der Schluss am
     Beobachtungstag selbst ist der Einstieg und gehoert zum Ausgang. */
  const past = bars.map((b) => (b.date < t ? { ...b, close: b.close * 0.9, dividend: b.date === dates[k - 20] ? b.close * 0.02 : b.dividend } : b));
  const oPast = forwardOutcome(totalReturnWeekly(payloadOf(past, "PTA"), dates).levels, k, h);
  same(oPast, o0);

  /* Zukunft nach dem Horizontende geaendert -> gleicher Ausgang. */
  const future = bars.map((b) => (b.date > end ? { ...b, close: b.close * 1.15, dividend: b.dividend ? b.dividend * 3 : b.dividend } : b));
  same(forwardOutcome(totalReturnWeekly(payloadOf(future, "PTA"), dates).levels, k, h), o0);

  /* Eine Dividende im Horizont aendert den Ausgang - in die erwartete Richtung. */
  const mid = dates[k + 10];
  const inside = bars.map((b) => (b.date === mid ? { ...b, dividend: b.dividend + b.close * 0.05 } : b));
  const oIn = forwardOutcome(totalReturnWeekly(payloadOf(inside, "PTA"), dates).levels, k, h);
  assert.ok(oIn.forwardReturn > o0.forwardReturn + 0.04);
});

test("Ausschluss ohne Beleg: fehlendes Dividendenfeld, veraltete Reihe", () => {
  const bars = dailyBars(PTA), dates = weeklyPoints(bars).map((p) => p[0]);
  const missing = bars.map((b, i) => { if (i !== 700) return b; const { dividend, ...rest } = b; return rest; });
  const a = totalReturnWeekly(payloadOf(missing, "PTA"), dates);
  assert.equal(a.confirmed, false);
  assert.equal(a.reason, "DIVIDEND_FIELD_MISSING");
  assert.equal(a.levels, undefined);
  const stale = totalReturnWeekly(payloadOf(bars.filter((b) => b.date <= "2024-06-28"), "PTA"), dates);
  assert.equal(stale.confirmed, false);
  assert.equal(stale.reason, "STALE");
});
