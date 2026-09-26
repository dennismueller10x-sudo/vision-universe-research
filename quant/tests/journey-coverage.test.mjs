/* =========================================================================
   DIE REISE, GEZAEHLT.

   "Die Stock-Intelligence-Reise ist gebaut" ist keine pruefbare Aussage.
   Diese Datei haelt fest, was an ihrer Messung nicht verhandelbar ist:

     - Ein ausdrueckliches Nein ist eine ANTWORT, keine Luecke. Eine Quote,
       die "kein Muster trifft zu" als Loch zaehlt, macht das Produkt
       schlechter aussehen als es ist.
     - Eine Luecke traegt einen benannten Grund, nie "irgendwas fehlt".
     - Die Stichprobe ist deterministisch; sonst misst man den Zufall mit.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const path = new URL("quant/data/product/journey-coverage-v1.json", ROOT);
const source = readFileSync(new URL("scripts/vu2/measure-journey.mjs", ROOT), "utf8");

test("the measurement reads the same services the surface calls", () => {
  /* Ein zweiter Leseweg wuerde eine andere Zahl ergeben als die Seite
     zeigt, und niemand saehe, welche stimmt. */
  assert.match(source, /require\(join\(ROOT, "quant\/api\/product-services\.js"\)\)/);
  for (const call of ["getStockIntelligence", "getSetupObservation", "getPatternMatch",
                      "getStrategyMatch", "getTechnicalIntelligence", "getFactorEvidence"]) {
    assert.ok(source.includes("api." + call + "("), call + " wird nicht gemessen");
  }
  /* Und die Stichprobe ist nicht zufaellig. */
  assert.match(source, /jeder \" \+ step \+ \"\. Titel/);
  assert.equal(/Math\.random/.test(source), false);
});

test("an explicit no counts as an answer and is still reported separately", () => {
  assert.match(source, /"FINDING:NO_PATTERN_HOLDS"/);
  assert.match(source, /"FINDING:NO_PROFILE_FITS_WELL"/);
  assert.match(source, /bucket\.answered \+= 1; bucket\.findings \+= 1;/);
});

test("the published measurement is complete and internally consistent", () => {
  if (!existsSync(path)) return;   /* Vor dem ersten Lauf gibt es sie nicht. */
  const report = JSON.parse(readFileSync(path, "utf8"));
  /* DER LESER AKZEPTIERT, WAS DER PRODUZENT SCHREIBT.
     Eine Gleichheit auf die Geburtsfassung verbietet jede Erweiterung des
     Berichts und faellt dann, weil er BESSER geworden ist. Gehalten wird die
     Liste der Fassungen, die dieser Leser versteht. */
  assert.ok(["journey-coverage-1.0.0", "journey-coverage-1.1.0"].includes(report.schemaVersion),
    "die Fassung " + report.schemaVersion + " kennt dieser Leser nicht");
  assert.ok(report.sample > 0 && report.sample <= report.universe);
  assert.ok(report.stations.length >= 8);
  for (const station of report.stations) {
    assert.equal(station.answered + station.withheld, report.sample,
      station.id + ": beantwortet plus zurueckgehalten ist nicht die Stichprobe");
    assert.ok(station.findings <= station.answered);
    /* Jede Luecke hat einen Grund, und die Gruende summieren sich auf. */
    const summe = Object.values(station.reasons).reduce((a, b) => a + b, 0);
    assert.equal(summe, station.withheld, station.id + ": ungezaehlte Luecken");
    for (const reason of Object.keys(station.reasons)) {
      assert.match(reason, /^[A-Z][A-Z0-9_:.]*$/, station.id + ": Grund ohne Namen - " + reason);
      assert.equal(reason.startsWith("MEASUREMENT_FAILED"), false,
        station.id + ": die Messung selbst ist gescheitert - " + reason);
    }
  }
  /* Die Verteilung deckt die Stichprobe ab. */
  const je = Object.entries(report.answeredStationsPerTitle)
    .reduce((sum, [, n]) => sum + n, 0);
  assert.equal(je, report.sample);
});

test("the report says how many journeys are full, reduced or too thin - and it adds up", () => {
  if (!existsSync(path)) return;
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.schemaVersion === "journey-coverage-1.0.0") return;   /* aeltere Messung */
  const f = report.shapes;
  assert.ok(f, "der Bericht sagt nichts ueber die Form der Seiten");
  assert.equal(f.full + f.reduced + f.minimal, report.sample,
    "die Formen summieren sich nicht auf die Stichprobe");
  /* Die Verdichtung muss messbar etwas sparen, sonst ist sie keine. */
  assert.ok(f.dataPoorNoticeBoxesAfter < f.dataPoorNoticeBoxesBefore,
    "auf den datenarmen Seiten spart die Verdichtung keinen einzigen Kasten");
  /* Und kein Leser soll mehr auf einen Stapel stossen: die schlimmste Seite
     bleibt unter der Zahl, ab der eine Seite ein Stapel ist (gemessen: bis
     zu acht Einzelabsagen vor der Verdichtung). */
  assert.ok(f.worstPageNoticeBoxes <= 5,
    "eine Seite zeigt " + f.worstPageNoticeBoxes + " Absagekaesten - das ist wieder ein Stapel");
  const summe = Object.values(f.substantiveStationsPerTitle).reduce((a, b) => a + b, 0);
  assert.equal(summe, report.sample);
});
