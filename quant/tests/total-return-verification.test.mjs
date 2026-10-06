import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url);
const report = JSON.parse(readFileSync(new URL("quant/data/providers/total-return-verification.json", ROOT), "utf8"));

test("the total-return question was actually asked, and answered from evidence", () => {
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
  const dir = mkdtempSync(join(tmpdir(), "vu-trv-"));
  try {
    const out = join(dir, "report.json");
    execFileSync(process.execPath, ["scripts/market/verify-total-return-capability.mjs", "--out=" + out],
      { cwd: new URL(".", ROOT).pathname, stdio: "pipe" });
    const again = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(again.verdict, report.verdict);
    assert.equal(again.dividendEventsChecked, report.dividendEventsChecked);
    assert.equal(again.worstRelativeError, report.worstRelativeError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  const dir = mkdtempSync(join(tmpdir(), "vu-trv-"));
  const pfad = join(dir, "report.json");
  const run = () => execFileSync(process.execPath, ["scripts/market/verify-total-return-capability.mjs", "--out=" + pfad],
    { cwd: new URL(".", ROOT).pathname, stdio: "pipe" });
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
    rmSync(dir, { recursive: true, force: true });
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
