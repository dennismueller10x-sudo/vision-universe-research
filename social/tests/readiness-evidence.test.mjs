/* =========================================================================
   VISION UNIVERSE SOCIAL — DER BELEG GEHOERT ZU EINEM STAND (RB1–RB12)

   §46/§50.

   -------------------------------------------------------------------------
   WAS HIER ABGESCHAFFT WIRD
   -------------------------------------------------------------------------

   production-readiness.mjs kannte zwei Fahnen:

       --suites-green
       --isolation-proven

   Wer sie schrieb, setzte damit zwei der zehn Reifebedingungen auf
   ERFUELLT. Keine Zahl, keine Quelle, kein Stand. Sie liessen sich
   auch dann setzen, wenn die Suiten zuletzt vor drei Wochen liefen -
   und genau dann waeren sie am gefaehrlichsten gewesen.

   Das ist dieselbe Form wie das hingeschriebene

       OWNER_PUBLISHING_GATE: { active: true }

   aus §45: eine Zusicherung, die sich selbst erfuellt.

   Diese Datei prueft die Ersetzung: ein gemessener Befund mit Commit
   und Zeitpunkt, der nur fuer DIESEN Stand gilt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BERICHT = join(ROOT, "scripts/social/production-readiness.mjs");
const MESSER = join(ROOT, "scripts/social/verify-suites.mjs");

function quelle(p) { return readFileSync(p, "utf8"); }

/** Den Bericht mit einem untergeschobenen Beleg laufen lassen. */
function berichtMit(beleg) {
  const d = mkdtempSync(join(tmpdir(), "vu-beleg-"));
  const datei = join(d, "suites.json");
  writeFileSync(datei, JSON.stringify(beleg));
  try {
    /* Der Bericht endet mit einem Fehlercode, wenn READY false ist -
       das ist seine Aussage und kein Absturz. Gelesen wird die
       Ausgabe, nicht der Code. */
    return execFileSync("node", [BERICHT, "--evidence", datei],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) {
    if (err.stdout) return String(err.stdout);
    throw err;
  } finally { rmSync(d, { recursive: true, force: true }); }
}

function kopf() {
  return execFileSync("git", ["rev-parse", "HEAD"],
    { cwd: ROOT, encoding: "utf8" }).trim();
}

function zeileZu(aus, id) {
  const zeilen = aus.split("\n");
  const i = zeilen.findIndex((z) => z.includes(id));
  return i === -1 ? null : zeilen.slice(i, i + 2).join(" ").replace(/\s+/g, " ");
}

/* ------------------------------------------------- Der Messer selbst */

test("RB1 · Der Messer schreibt Commit, Zeitpunkt und Baumzustand", () => {
  const q = quelle(MESSER);
  for (const feld of ["commit", "generatedAt", "cleanTree", "suitesOk", "isolationOk"]) {
    assert.match(q, new RegExp(feld), "Feld fehlt: " + feld);
  }
});

test("RB2 · Ein leerer Lauf ist kein gruener Lauf", async () => {
  /* `node --test` auf ein Muster ohne Treffer endet mit 0. Wer nur den
     Exit-Code liest, haelt "0 von 0 bestanden" fuer bestanden.

     Geprueft wird die REGEL, nicht ihre Schreibweise: die erste Fassung
     suchte den Ausdruck `tests > 0` im Quelltext und haette jede
     Umformulierung fuer einen Ausbau gehalten. */
  const { bilanzGeht } = await import(MESSER);
  assert.equal(bilanzGeht({ tests: 0, pass: 0, fail: 0, exitCode: 0 }), false);
  assert.equal(bilanzGeht({ tests: null, pass: null, fail: 0, exitCode: 0 }), false);
});

test("RB3 · Der Messer veroeffentlicht nichts und stoesst nichts an", () => {
  const q = quelle(MESSER);
  assert.ok(!/fetch\(|dispatches|\/social\/meta\/publish/.test(q),
    "Der Messer ruft nach aussen");
  assert.ok(!/social\/data|quant\/data|discover\/data/.test(q),
    "Der Messer schreibt in einen Datenbaum");
});

/* ------------------------------------------------- Der Bericht liest ihn */

test("RB4 · Ein Beleg von diesem Stand zaehlt", () => {
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: true,
    suites: [{ id: "social", tests: 1357, pass: 1357, fail: 0, ok: true }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: true, isolationOk: true
  });
  assert.match(zeileZu(aus, "SUITE_GREEN"), /ERFUELLT/);
  assert.match(zeileZu(aus, "TEST_PRODUCTION_ISOLATION"), /ERFUELLT/);
  /* Und die Zahlen stehen da, nicht nur das Urteil. */
  assert.match(aus, /1357\/1357/);
});

test("RB5 · Ein Beleg von einem anderen Stand zaehlt nicht", () => {
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z",
    commit: "0000000000000000000000000000000000000000", cleanTree: true,
    suites: [{ id: "social", tests: 1357, pass: 1357, fail: 0, ok: true }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: true, isolationOk: true
  });
  assert.match(zeileZu(aus, "SUITE_GREEN"), /NICHT_ERFUELLT/);
  assert.match(aus, /Gruen an einem anderen Stand/);
});

test("RB6 · Ein Beleg ohne Stand zaehlt nicht", () => {
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z", commit: null, cleanTree: true,
    suites: [], isolation: [], suitesOk: true, isolationOk: true
  });
  assert.match(zeileZu(aus, "SUITE_GREEN"), /NICHT_ERFUELLT/);
  assert.match(aus, /nennt keinen Stand/);
});

test("RB7 · Ein Beleg aus einem schmutzigen Baum zaehlt nicht", () => {
  /* Gruen bei vierzig nicht eingecheckten Aenderungen sagt ueber den
     Commit nichts aus. */
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: false,
    suites: [{ id: "social", tests: 1, pass: 1, fail: 0, ok: true }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: true, isolationOk: true
  });
  assert.match(zeileZu(aus, "SUITE_GREEN"), /NICHT_ERFUELLT/);
  assert.match(aus, /nicht sauber/);
});

test("RB8 · Ein roter Beleg von diesem Stand ist ein Mangel, kein Rauschen", () => {
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: true,
    suites: [{ id: "social", tests: 1357, pass: 1350, fail: 7, ok: false }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: false, isolationOk: true
  });
  assert.match(zeileZu(aus, "SUITE_GREEN"), /NICHT_ERFUELLT/);
  assert.match(aus, /7 gefallen/, "Die Zahl der gefallenen Tests fehlt");
});

test("RB9 · Eine veraenderte Produktionsdatei faellt getrennt auf", () => {
  const aus = berichtMit({
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: true,
    suites: [{ id: "social", tests: 1, pass: 1, fail: 0, ok: true }],
    isolation: [{ id: "social", ok: false }],
    suitesOk: true, isolationOk: false
  });
  assert.match(zeileZu(aus, "TEST_PRODUCTION_ISOLATION"), /NICHT_ERFUELLT/);
  assert.match(zeileZu(aus, "SUITE_GREEN"), /ERFUELLT/,
    "Die beiden Bedingungen haengen aneinander statt getrennt zu urteilen");
});

/* ------------------------------------------ Die Fahne bleibt, benannt */

test("RB10 · Eine blosse Behauptung nennt sich so", () => {
  const q = quelle(BERICHT);
  assert.match(q, /Von aussen behauptet/,
    "Die Fahne meldet sich immer noch als Beleg");
  assert.ok(!/Von aussen belegt/.test(q),
    "\"belegt\" steht noch da, wo nichts belegt wurde");
});

/* ------------------------------------- Der Kommentar bleibt Kommentar */

test("RB11 · Ein Name in einem YAML-Kommentar ist keine ausgefuehrte Handlung", () => {
  /* SCHEDULER_NEVER_PUBLISHES stand auf NICHT_ERFUELLT, weil
     decide-candidate.mjs im Workflow vorkam - in einem Kommentar, der
     erklaert, welchen Weg die Owner-Entscheidung nimmt. */
  const workflow = readFileSync(
    join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  assert.match(workflow, /#.*decide-candidate\.mjs/,
    "Der Kommentar, um den es geht, ist weg — dann prueft dieser Test nichts");
  const ohne = workflow.split("\n")
    .map((z) => z.replace(/(^|\s)#.*$/, "")).join("\n");
  assert.ok(!/decide-candidate\.mjs/.test(ohne),
    "Der Workflow ruft decide-candidate.mjs jetzt wirklich auf");
});

test("RB12 · Der Bericht meldet den Scheduler nicht mehr als Freigebenden", () => {
  let aus;
  try {
    aus = execFileSync("node", [BERICHT], { cwd: ROOT, encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) { aus = String(err.stdout || ""); }
  assert.match(zeileZu(aus, "SCHEDULER_NEVER_PUBLISHES"), /ERFUELLT/, aus);
  /* Und zwar nicht, weil niemand gefragt hat: der Workflow ruft
     ingest-owner-decisions.mjs auf, und das Skript SCHREIBT
     Freigaben - es faellt sie nur nicht selbst. */
  const workflow = readFileSync(
    join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  assert.match(workflow, /ingest-owner-decisions\.mjs/,
    "Der Weg, um den es geht, ist gar nicht im Workflow");
});

/* ===========================================================================
   DIE VIERZEHN, DIE WEDER BESTANDEN NOCH GEFALLEN SIND

   Im Deployment-Lauf meldete der Bericht:

       SUITEN_GRUEN  ERFUELLT
       social: 1369/1383

   Vierzehn Tests fehlten in der Bilanz, `fail` stand auf 0, und die
   Pruefung sagte gruen. Es sind die vierzehn aus asset-transport, die
   sich selbst ueberspringen, wenn das bekannt gute Bild im Klon fehlt.

   Beides muss hier gelten, und das eine darf das andere nicht
   erschlagen: eine erklaerte Auslassung faerbt die CI nicht rot, und
   sie verschwindet auch nicht hinter einer gruenen Zahl.
   =========================================================================== */

test("RB13 · Eine erklaerte Auslassung ist kein Fehlschlag", () => {
  const b = {
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: true,
    suites: [{ id: "social", tests: 1383, pass: 1369, fail: 0,
      skipped: 14, cancelled: 0, todo: 0, ok: true }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: true, isolationOk: true
  };
  const aus = berichtMit(b);
  assert.match(zeileZu(aus, "SUITE_GREEN"), /ERFUELLT/);
  /* Aber sie steht da. "1369/1383" allein liest sich wie ein Mangel. */
  assert.match(aus, /14 uebersprungen/,
    "Die uebersprungenen Tests verschwinden hinter der gruenen Zahl");
});

test("RB14 · Die Regel selbst, ohne eine Suite zu starten", async () => {
  /* Herausgezogen als `bilanzGeht`, damit sie an EINER Stelle steht und
     geprueft werden kann, ohne 1383 Tests zu starten. */
  const { bilanzGeht } = await import(MESSER);
  const voll = { tests: 100, pass: 100, fail: 0, cancelled: 0,
                 skipped: 0, todo: 0, exitCode: 0 };
  const mit = (o) => bilanzGeht(Object.assign({}, voll, o));

  assert.equal(mit({}), true, "Ein vollstaendig gruener Lauf gilt nicht");

  /* Erklaerte Auslassung: kein Fehlschlag. */
  assert.equal(mit({ pass: 86, skipped: 14 }), true,
    "Vierzehn erklaerte Auslassungen faerben die CI rot");

  /* Abgebrochen: nicht gelaufen, und niemand hat gesagt warum. */
  assert.equal(mit({ pass: 86, cancelled: 14 }), false,
    "Abgebrochene Tests gelten als gruen");

  /* Weder bestanden noch erklaert - genau die Lage aus dem
     Deployment-Lauf, als die Pruefung noch gruen sagte. */
  assert.equal(mit({ pass: 86 }), false,
    "Eine Bilanz, die nicht aufgeht, gilt als gruen");

  /* Und die beiden, die schon RB2 und RB8 meinten. */
  assert.equal(mit({ tests: 0, pass: 0 }), false, "Ein leerer Lauf gilt als gruen");
  assert.equal(mit({ pass: 99, fail: 1 }), false);
  assert.equal(mit({ exitCode: 1 }), false);
});

test("RB15 · Vierzehn abgebrochene Tests sind kein gruener Lauf", () => {
  /* Dieselbe Luecke wie RB13, aber ohne Erklaerung - und der Bericht
     reicht das Urteil des Messers durch, statt es zu ueberstimmen. */
  const b = {
    generatedAt: "2026-09-21T06:00:00.000Z", commit: kopf(), cleanTree: true,
    suites: [{ id: "social", tests: 1383, pass: 1369, fail: 0,
      skipped: 0, cancelled: 14, todo: 0, ok: false }],
    isolation: [{ id: "social", ok: true }],
    suitesOk: false, isolationOk: true
  };
  assert.match(zeileZu(berichtMit(b), "SUITE_GREEN"), /NICHT_ERFUELLT/);
});

test("RB16 · Der Messer startet nichts, wenn man ihn nur liest", async () => {
  /* Die erste Fassung war ein reines Skript: ein `import` davon hat die
     Suiten gestartet. Ein Test ueber eine Regel darf nicht 1700 Tests
     ausloesen. */
  const q = readFileSync(MESSER, "utf8");
  assert.match(q, /import\.meta\.url !== `file:\/\/\$\{process\.argv\[1\]\}`/,
    "Der Messer laeuft auch dann los, wenn ihn jemand nur importiert");
});
