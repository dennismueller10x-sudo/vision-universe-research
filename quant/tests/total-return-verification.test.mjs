import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { confirmedSandbox, confirmedReport } from "./helpers/confirmed-golden-evidence.mjs";

const ROOT = new URL("../../", import.meta.url);
const report = confirmedReport;

test("the historical total-return question was answered from measured evidence", () => {
  /* It had stood at "Nicht geprueft." in the provider qualification, so the
     capability was UNKNOWN, so the adapter nulled adjustedClose, so the
     pipeline only ever published SPLIT_ADJUSTED - and the backtest gate
     recorded "no total-return price series" as a missing input. The data
     was there the whole time; nobody had asked. */
  assert.equal(report.verdict, "TOTAL_RETURN_CONFIRMED");
  assert.ok(report.dividendEventsChecked >= report.minimumEvents,
    "fewer events than the report's own minimum, which makes a clean run a statement about the sample");
  assert.equal(report.dividendEventsMatching, report.dividendEventsChecked);
  assert.ok(report.worstRelativeError < report.tolerance);
  for (const series of report.series) assert.deepEqual(series.mismatches, [], series.ticker);
});

test("the check is reproducible and reads only committed files", () => {
  /* A verdict nobody can re-derive is an assertion with extra steps. */
  /* Gegen eine Kopie: die Suite darf das committete Artefakt nie
     veraendern. Vorher schrieb dieser Fall die Produktionsdatei neu, sobald
     die Kursreihen einen Handelstag weiter waren als der Bericht. */
  const sandbox = confirmedSandbox();
  const dir = sandbox.directory;
  try {
    const out = join(dir, "report.json");
    execFileSync(process.execPath, ["scripts/market/verify-total-return-capability.mjs", "--out=" + out],
      { cwd: dir, stdio: "pipe" });
    const again = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(again.verdict, report.verdict);
    assert.equal(again.dividendEventsChecked, report.dividendEventsChecked);
    assert.ok(Math.abs(again.worstRelativeError - report.worstRelativeError) < 1e-12, "historical observed ratios changed");
  } finally { sandbox.cleanup(); }
});

test("a run that changes nothing leaves the artifact untouched", () => {
  /* WARUM DAS EIN VERTRAG IST UND KEINE BEQUEMLICHKEIT.
     Der Fall darueber fuehrt das Skript bei jedem Lauf aus, um die
     Reproduzierbarkeit zu zeigen. Vorher schrieb es dabei jedes Mal einen
     neuen `generatedAt` - nach jedem Testlauf stand also eine scheinbar
     geaenderte Datei im Arbeitsbaum. An einem Tag habe ich sie ein Dutzend
     Mal zurueckgesetzt und dabei beinahe eine ECHTE Aenderung mitverworfen
     (2.949 -> 2.950 Balken). Rauschen, das man wegwirft, trainiert einen
     darauf, auch Befunde wegzuwerfen.

     ERSTE FASSUNG DIESES FALLS WAR EIN ZUFALLSTEST: er las die Datei vor und
     nach einem Lauf und verglich. `generatedAt` ist aber auf ganze Sekunden
     gekuerzt, und zwei Laeufe im selben Sekundenfenster erzeugen denselben
     Stempel - der Fall bestand also auch mit einem Schreiber, der IMMER
     schreibt. Deshalb steht jetzt ein Stempel von 2020 in der Datei: bleibt
     er stehen, wurde nicht geschrieben, und daran ist nichts zufaellig. */
  /* Ausgangslage ist ein frisch berechneter Bericht in einer Kopie - nicht
     die committete Datei, die hinter den Kursreihen zuruecksein darf. */
  const sandbox = confirmedSandbox();
  const dir = sandbox.directory;
  const pfad = join(dir, "report.json");
  const run = () => execFileSync(process.execPath, ["scripts/market/verify-total-return-capability.mjs", "--out=" + pfad],
    { cwd: dir, stdio: "pipe" });
  try {
    run();
    const alt = JSON.parse(readFileSync(pfad, "utf8"));
    alt.generatedAt = "2020-01-01T00:00:00.000Z";
    writeFileSync(pfad, JSON.stringify(alt, null, 1) + "\n");
    run();
    const danach = JSON.parse(readFileSync(pfad, "utf8"));
    assert.equal(danach.generatedAt, "2020-01-01T00:00:00.000Z",
      "der Lauf hat die Datei neu geschrieben, obwohl sich am Befund nichts geaendert hat");
    /* Und die unberuehrte Datei traegt weiter den Befund - nicht etwa nichts. */
    assert.equal(danach.verdict, "TOTAL_RETURN_CONFIRMED");
    assert.equal(danach.dividendEventsChecked, report.dividendEventsChecked);
  } finally {
    sandbox.cleanup();
  }
});

test("the test would fail on a split-only series, which is the point", () => {
  /* Built rather than assumed: a series adjusted for splits alone keeps
     adjClose/close constant across an ex-date, so the expected step is
     absent and every event must be rejected. If this passed on such a
     series the verdict above would mean nothing. */
  const splitOnly = [
    { date: "2026-01-01", close: 100, adjustedClose: 50, dividend: 0, splitFactor: 1 },
    { date: "2026-01-02", close: 99, adjustedClose: 49.5, dividend: 1, splitFactor: 1 }
  ];
  const bar = splitOnly[1], previous = splitOnly[0];
  const observed = (previous.adjustedClose / previous.close) / (bar.adjustedClose / bar.close);
  const expected = 1 - bar.dividend / previous.close;
  assert.equal(Math.round(observed * 1e6) / 1e6, 1, "a split-only series should leave the ratio unchanged");
  assert.ok(Math.abs(observed - expected) / expected > report.tolerance,
    "a split-only series would pass the total-return test, which would make the verdict meaningless");
});

test("the measurement changes no published value", () => {
  /* It answers a question. Switching the published price basis is a
     separate decision with its own version, because it changes every
     momentum and drawdown figure the product shows. */
  assert.match(report.note, /aendert keinen veroeffentlichten Wert/);
  /* Checked by what it WRITES, not by what it mentions: the first version
     of this assertion matched the script's own comment explaining why the
     capability stood at UNKNOWN, which is prose and proves nothing. */
  const source = readFileSync(new URL("scripts/market/verify-total-return-capability.mjs", ROOT), "utf8");
  const writes = [...source.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(writes, ["OUT"], "the verification writes somewhere other than its own report");
  assert.match(source, /const DEFAULT_OUT = join\(ROOT, "quant\/data\/providers\/total-return-verification\.json"\)/);
});


test("untouched pinned conflict rows produce nonzero INCONSISTENT in an isolated actual historical sample", () => {
  const sandbox = confirmedSandbox();
  const dir = sandbox.directory;
  try {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/jpm-observed-provider-conflict.json", import.meta.url), "utf8"));
    const path = join(dir, "quant/data/market/golden-preview/daily/ref_JPM.json");
    const payload = JSON.parse(readFileSync(path, "utf8"));
    assert.ok(payload.bars.at(-1).date.slice(0,10) < fixture.bars[0].date.slice(0,10));
    payload.bars.push(...fixture.bars);
    writeFileSync(path, JSON.stringify(payload));
    const output = join(dir, "current-diagnostic.json");
    const run = spawnSync(process.execPath, ["scripts/market/verify-total-return-capability.mjs", "--out=" + output],
      {cwd: dir, encoding: "utf8"});
    assert.equal(run.status, 1, run.stderr);
    const measured = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(measured.verdict, "INCONSISTENT");
    assert.equal(measured.dividendEventsChecked - measured.dividendEventsMatching, 1);
    const failures = measured.series.flatMap((s) => s.mismatches.map((event) => ({ticker:s.ticker, ...event})));
    assert.equal(failures.length, 1);
    assert.equal(failures[0].ticker, "JPM");
    assert.equal(failures[0].date, "2026-10-06");
    assert.equal(failures[0].dividend, 1.65);
    assert.ok(failures[0].error > measured.tolerance);
    assert.ok(failures[0].error > 0.0049 && failures[0].error < 0.0051);
  } finally {sandbox.cleanup();}
});


test("current committed measurement carries a verdict consistent with its actual recorded evidence", () => {
  const current = JSON.parse(readFileSync(new URL("quant/data/providers/total-return-verification.json", ROOT), "utf8"));
  assert.equal(current.schemaVersion, "total-return-verification-1.0.0");
  assert.equal(current.tolerance, 0.002);
  assert.ok(Number.isInteger(current.minimumEvents) && current.minimumEvents > 0);
  assert.equal(current.seriesChecked, current.series.length);
  assert.equal(current.dividendEventsChecked, current.series.reduce((n,s) => n + s.dividendEvents, 0));
  assert.equal(current.dividendEventsMatching, current.series.reduce((n,s) => n + s.matching, 0));
  assert.ok(current.dividendEventsMatching >= 0 && current.dividendEventsMatching <= current.dividendEventsChecked);
  for (const row of current.series) {
    assert.equal(row.mismatches.length, row.dividendEvents - row.matching);
    for (const event of row.mismatches) assert.ok(event.error >= current.tolerance);
  }
  const expected = current.dividendEventsChecked < current.minimumEvents ? "INSUFFICIENT_EVIDENCE"
    : current.dividendEventsMatching === current.dividendEventsChecked ? "TOTAL_RETURN_CONFIRMED"
    : current.dividendEventsMatching === 0 ? "SPLIT_ADJUSTED_ONLY" : "INCONSISTENT";
  assert.equal(current.verdict, expected);
  if (current.verdict === "TOTAL_RETURN_CONFIRMED") assert.ok(current.worstRelativeError < current.tolerance);
});
