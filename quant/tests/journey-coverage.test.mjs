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
  assert.equal(report.schemaVersion, "journey-coverage-1.0.0");
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
