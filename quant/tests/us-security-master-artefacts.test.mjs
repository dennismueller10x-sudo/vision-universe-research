/* =========================================================================
   VISION UNIVERSE — us-security-master-artefacts.test.mjs

   Die AUSGELIEFERTEN Artefakte, nicht die Engine.

   Getrennt von us-security-master.test.mjs, und zwar aus einem
   konkreten Anlass. Die Enginetests laufen VOR einem Lauf - sie
   beantworten "taugt der Klassierer?". Diese hier laufen DANACH und
   beantworten "taugt, was er erzeugt hat?".

   Beides in einer Datei zu halten hiess: ein Lauf, der ein veraltetes
   Artefakt erneuern soll, scheitert an der Pruefung, dass das Artefakt
   veraltet ist - bevor er es erneuern darf. Die Pruefung ist richtig,
   ihr Zeitpunkt war es nicht.

   Eine Pruefung ohne Artefakt wird UEBERSPRUNGEN und nicht bestanden.
   Ein Test, der still gruen wird, weil die Datei fehlt, ist schlimmer
   als keiner.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));

/* Die Pflichtfelder aus §7. Sie stehen hier ein zweites Mal, weil diese
   Datei ohne die Engine-Testdatei laufen koennen muss - und weil ein
   Artefakt gegen eine FESTGESCHRIEBENE Liste zu pruefen mehr wert ist
   als gegen eine, die mit der Engine mitwandert. */
const REQUIRED_FIELDS = [
  "provider", "ticker", "canonical_id", "exchange", "country", "currency",
  "instrument_type", "classification_status", "classification_confidence",
  "active_status", "start_date", "end_date", "eligible_us_equity",
  "eligibility_reason", "reconciliation_status", "baseline_member",
  "source_provenance"
];
/* ======================================== DAS AUSGELIEFERTE ARTEFAKT (§8) */

const SM_DIR = join(root, "quant", "data", "market", "security-master");
const RECON = join(SM_DIR, "reconciliation.json");
const MASTER = join(SM_DIR, "us-security-master.json");
/* Der Bestand, gegen den der Abgleich GEMACHT wurde - und zwar nach
   SEINER Auskunft, nicht nach unserer Vermutung.

   Diese Konstante war schon einmal falsch, und beim zweiten Mal auf
   dieselbe Weise: sie RIET, welche Datei der Lauf gelesen hat.

   Zuerst verglich sie den Abgleich gegen universe-FULL_UNIVERSE.json
   mit seinen 7.803 Titeln, obwohl der Abgleich gegen die 5.684 davor
   gemacht worden war - und warf dem Lauf vor, die Zukunft nicht
   gekannt zu haben. Die Korrektur griff zur Vor-Erweiterungsdatei.

   Damit war sie beim naechsten Lauf wieder falsch, nur andersherum:
   ein Abgleich, der HEUTE laeuft, liest den heutigen Bestand mit 7.803
   Titeln. Verglichen wurde er trotzdem mit 5.684 - jetzt warf sie ihm
   vor, in der Vergangenheit stehengeblieben zu sein.

   Beide Male war die Vermutung das Problem, nicht ihre Richtung. Der
   Abgleich schreibt auf, welche Datei er gelesen hat; das ist die
   einzige Angabe, die zu ihm gehoert. Eine Pruefung, die zwei
   verschiedene Zeitpunkte vergleicht, prueft den Kalender. */
const PRE_EXPANSION = join(SM_DIR, "universe-FULL_UNIVERSE.before-expansion.json");

function baselineOf(recon) {
  const named = recon && recon.nonDestructive && recon.nonDestructive.baselineFile;
  if (named) {
    const file = join(root, named);
    /* Nennt der Abgleich eine Datei, die es nicht gibt, ist das ein
       Befund und kein Grund, auf eine andere auszuweichen. */
    assert.ok(existsSync(file), "Der Abgleich nennt " + named + ", die Datei fehlt.");
    return JSON.parse(readFileSync(file, "utf8")).securities;
  }
  const fallback = existsSync(PRE_EXPANSION)
    ? PRE_EXPANSION
    : join(root, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json");
  return JSON.parse(readFileSync(fallback, "utf8")).securities;
}

test("SM60 die ausgelieferte Stammtabelle enthaelt jeden Bestandstitel", (t) => {
  if (!existsSync(MASTER) || !existsSync(RECON)) return t.skip("Artefakte fehlen.");
  const master = JSON.parse(readFileSync(MASTER, "utf8"));
  const baseline = baselineOf(JSON.parse(readFileSync(RECON, "utf8")));

  const delivered = new Set(master.rows.filter((r) => r.baseline_member).map((r) => r.ticker));
  const missing = baseline.map((b) => b.ticker.toUpperCase()).filter((t2) => !delivered.has(t2));
  assert.deepEqual(missing, [], "Fehlende Bestandstitel: " + missing.slice(0, 10).join(", "));
  assert.equal(delivered.size, baseline.length);

  /* Jede Zeile traegt die Pflichtfelder auch dann noch, wenn der
     Schreiber sie kuerzt. */
  for (const row of master.rows) {
    for (const f of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, f), f + " fehlt an " + row.ticker);
    }
  }
  for (const f of master.schema.required) assert.ok(REQUIRED_FIELDS.includes(f), f);
});

test("SM61 kein ausgeliefertes Artefakt traegt Kursniveaus", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  for (const file of [RECON, MASTER, join(SM_DIR, "summary.json"),
                      join(SM_DIR, "backfill-estimate.json")]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const key of ["\"close\"", "\"adjustedClose\"", "\"sma20\"", "\"sma200\"",
                       "\"high52w\"", "\"low52w\"", "\"bars\""]) {
      assert.ok(!text.includes(key), "Kursfeld " + key + " in " + file);
    }
  }
});

test("SM62 der Abgleich sagt, dass er nichts angefasst hat - und nennt die Phase", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const baseline = baselineOf(recon);
  assert.equal(recon.phase, "DISCOVERY_ONLY_NO_BACKFILL");
  assert.equal(recon.version, Master.VERSION);
  assert.equal(recon.nonDestructive.baselineCount, baseline.length);
  assert.equal(recon.nonDestructive.baselinePreserved, baseline.length);
  assert.equal(recon.nonDestructive.baselineRemoved, 0);
  assert.equal(recon.invariants.destructiveViolations, 0);
  assert.equal(recon.headline.BASELINE_COUNT, baseline.length);
  assert.equal(typeof recon.headline.REVIEW_EXISTING, "number");
  /* Die Kernzusage als Rechnung: jeder Bestandstitel ist entweder
     bestaetigt oder zur Pruefung gestellt. Ein dritter Ausgang - etwa
     "entfernt" - existiert nicht, und diese Summe ist der Ort, an dem
     er auffiele. */
  assert.equal(recon.headline.MATCHED_EXISTING + recon.headline.REVIEW_EXISTING,
               baseline.length,
               "MATCHED_EXISTING + REVIEW_EXISTING muss BASELINE_COUNT ergeben");
  assert.equal(recon.headline.BASELINE_ACCOUNTED_FOR, baseline.length);
  /* Ein Bestandstitel darf im ausgelieferten Artefakt nie als
     Neuaufnahme oder Ausschluss stehen. */
  for (const row of recon.rows.filter((r) => r.baseline_member)) {
    assert.ok(["EXISTING", "REVIEW"].includes(row.reconciliation_status), row.ticker);
  }
});

test("SM64 Abgleich und Stammtabelle widersprechen sich nicht", (t) => {
  if (!existsSync(RECON) || !existsSync(MASTER)) return t.skip("Artefakte fehlen.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const master = JSON.parse(readFileSync(MASTER, "utf8"));

  /* Der Abgleich fuehrt genau die Zeilen, die eine Entscheidung
     brauchen. Die Stammtabelle fuehrt alle. Beides muss dieselbe
     Auszaehlung ergeben - sonst ist eine der beiden Dateien alt. */
  assert.equal(recon.rowsElsewhere.count, master.rows.length);
  assert.deepEqual(recon.counts.byInstrumentType, master.counts.byInstrumentType);
  assert.equal(recon.version, master.version);

  const decidedInMaster = master.rows.filter((r) => r.reconciliation_status !== "EXISTING");
  assert.equal(recon.rowsNeedingDecision, decidedInMaster.length);
  assert.equal(recon.rows.length, recon.rowsNeedingDecision);
  const reconTickers = new Set(recon.rows.map((r) => r.ticker));
  for (const row of decidedInMaster) {
    assert.ok(reconTickers.has(row.ticker), row.ticker + " fehlt im Abgleich");
  }
  /* Und die gekuerzte Stammzeile darf nie eine sein, die etwas zu
     erklaeren haette. */
  for (const row of master.rows) {
    if (!Object.prototype.hasOwnProperty.call(row, "classification_reasons")) {
      assert.equal(row.reconciliation_status, "EXISTING", row.ticker);
      assert.equal(row.classification_status, "CLASSIFIED", row.ticker);
    }
  }
});

test("SM65 die Aufteilung der Neuzugaenge zaehlt genauso viele wie die Kennzahl", (t) => {
  if (!existsSync(RECON)) return t.skip("Kein Abgleich ausgeliefert.");
  const recon = JSON.parse(readFileSync(RECON, "utf8"));
  const a = recon.additions;
  if (!a || a.status === "NOT_MEASURABLE_WITHOUT_PROVIDER_LIST") {
    /* Ohne Anbieterliste gibt es keine Neuzugaenge zu zaehlen - dann
       muss die Kennzahl das genauso sagen und darf keine Zahl nennen. */
    assert.equal(typeof recon.headline.NEW_ELIGIBLE_ADDITIONS, "object");
    return;
  }
  assert.equal(a.total, recon.headline.NEW_ELIGIBLE_ADDITIONS);
  const sumExchanges = Object.values(a.byExchange).reduce((x, y) => x + y, 0);
  assert.equal(sumExchanges, a.total, "Boersenaufteilung muss sich zur Gesamtzahl addieren");
  const sumYears = Object.values(a.byStartYear).reduce((x, y) => x + y, 0);
  assert.equal(sumYears, a.total, "Jahresaufteilung muss sich zur Gesamtzahl addieren");
  const h = a.historyRule;
  assert.equal(h.belowRule + h.atOrAboveRule + h.noStartDate, a.total,
               "Die Drei-Jahres-Regel teilt die Neuzugaenge vollstaendig auf");
});

test("SM63 die Backfill-Schaetzung verlangt eine Freigabe und startet nichts", (t) => {
  const file = join(root, "quant", "data", "market", "security-master", "backfill-estimate.json");
  if (!existsSync(file)) return t.skip("Keine Schaetzung ausgeliefert.");
  const est = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(est.approvalRequired, true);
  assert.equal(est.estimate.fullRerun.necessary, false);
  /* Beendete Listings gehoeren nicht in die Nachholliste: ihre
     Historie ist vollstaendig, ein erneuter Abruf liefert dieselbe
     Reihe. Die Zahl kommt aus dem Referenzlauf und nicht aus dem
     active-Feld. */
  const inc = est.estimate.incremental;
  assert.equal(inc.symbolsToFetch, inc.newSymbols + inc.staleSymbols);
  assert.ok(inc.staleBasis.includes("stale_last_bar"), inc.staleBasis);
  /* Die Zahl kommt aus dem Referenzlauf und wird dort nachgelesen -
     nicht aus dem active-Feld des Stamms abgeleitet. */
  const gateFile = join(root, "quant", "data", "market", "scale", "gate-FULL_UNIVERSE.json");
  if (existsSync(gateFile)) {
    const gate = JSON.parse(readFileSync(gateFile, "utf8"));
    /* Nur vergleichen, wenn beide vom SELBEN Lauf stammen.

       Die Schaetzung ist eine Momentaufnahme vor einem Lauf; die
       Gate-Bilanz entsteht danach. Nach der Erweiterung liegt eine
       neuere Bilanz vor (stale_last_bar 58 statt 34), und die
       Schaetzung von vorher dagegen zu halten hiesse, ihr vorzuwerfen,
       dass sie den Lauf nicht kannte, den sie geplant hat. */
    const sameRun = est.estimate.referenceRun &&
                    String(est.estimate.referenceRun.runId) === String(gate.run && gate.run.runId);
    if (sameRun) {
      assert.equal(inc.staleSymbols, gate.dataQuality.reasons.stale_last_bar || 0,
                   "stale kommt aus dataQuality.reasons.stale_last_bar des Referenzlaufs");
    } else {
      /* Andernfalls muss die Schaetzung wenigstens sagen, auf welchen
         Lauf sie sich beruft - sonst ist sie nicht nachpruefbar. */
      assert.ok(est.estimate.referenceRun && est.estimate.referenceRun.runId,
                "eine Schaetzung ohne Referenzlauf ist nicht nachpruefbar");
    }
  }
  assert.ok(est.estimate.aggregatesToRebuild.mustRebuild.length > 0);
  assert.ok(est.estimate.aggregatesToRebuild.mustNotRebuild.length > 0);
  /* Kein Pfad darf zugleich neu zu bauen und zu erhalten sein. */
  const rebuild = new Set(est.estimate.aggregatesToRebuild.mustRebuild.map((x) => x.path));
  for (const keep of est.estimate.aggregatesToRebuild.mustNotRebuild) {
    assert.ok(!rebuild.has(keep.path), keep.path + " steht in beiden Listen");
  }
});
