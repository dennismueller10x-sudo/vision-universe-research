/* =========================================================================
   VISION UNIVERSE — scripts/quality/check-test-isolation.mjs

   SCHREIBEN TESTS IN PRODUKTIONSDATEN?

   -------------------------------------------------------------------------
   WARUM DAS NICHT IN DER SUITE STEHEN KANN
   -------------------------------------------------------------------------

   Der erste Versuch war ein Test INNERHALB der Suite, der `git status`
   las und darauf bestand, dass nichts unter quant/data, social/data
   oder discover/data veraendert sei.

   Er schlug fehl, sobald vorher ein PRODUKTIONSSKRIPT gelaufen war und
   legitim etwas geschrieben hatte - und meldete das als "von einem
   Testlauf veraendert". Eine Falschbeschuldigung mit demselben Muster
   wie ueberall hier: vorbestehend sah aus wie verursacht.

   Ein Test kann nicht messen, was VOR ihm passiert ist. Die Frage
   lautet nicht "ist der Baum sauber?", sondern "hat DIESER LAUF etwas
   veraendert?" - und die beantwortet man nur, indem man vorher und
   nachher vergleicht. Das geht von aussen, nicht von innen.

   Ausfuehren:
     node scripts/quality/check-test-isolation.mjs
     node scripts/quality/check-test-isolation.mjs --suite "quant/tests/*.test.mjs"
   ========================================================================= */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Pfade, die ein Testlauf niemals veraendern darf. Owner-Zustaende,
   Lernstand und Marktdaten gehoeren dem Betrieb, nicht der Pruefung. */
export const GESCHUETZT = [
  /^quant\/data\//,
  /^social\/data\//,
  /^discover\/data\//,
  /^authoring\/requests\/[^/]+\/authoring-result\.json$/
];

/** Ein Abdruck des Arbeitsbaums: Pfad -> Zustand. */
function abdruck() {
  const zeilen = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT })
    .toString().split("\n").filter(Boolean);
  const map = new Map();
  for (const z of zeilen) map.set(z.slice(3).trim(), z.slice(0, 2));
  /* Auch der Inhalt zaehlt: eine Datei, die vorher UND nachher als
     geaendert gilt, kann dazwischen ein zweites Mal geaendert worden
     sein. */
  const hashes = execFileSync("git", ["diff", "--no-color"], { cwd: ROOT }).toString();
  return { map, diffLength: hashes.length };
}

export function pruefe(suite) {
  const vorher = abdruck();
  let exitCode = 0;
  try {
    execFileSync(process.execPath, ["--test", suite],
      { cwd: ROOT, stdio: "pipe", timeout: 900000 });
  } catch (err) {
    exitCode = err.status === undefined ? 1 : err.status;
  }
  const nachher = abdruck();

  const neu = [];
  for (const [pfad, zustand] of nachher.map) {
    const vor = vorher.map.get(pfad);
    if (vor === zustand) continue;
    if (GESCHUETZT.some((r) => r.test(pfad))) neu.push({ pfad, vor: vor || "sauber", nach: zustand });
  }

  return {
    suite,
    testsExitCode: exitCode,
    violations: neu,
    ok: neu.length === 0,
    explanation: neu.length === 0
      ? "Der Lauf hat keine Produktionsdatei veraendert."
      : neu.length + " Produktionsdatei(en) wurden WAEHREND des Testlaufs " +
        "veraendert:\n  " + neu.map((v) => v.pfad + " (" + v.vor + " -> " + v.nach + ")").join("\n  ")
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--suite");
  const suite = i === -1 ? "quant/tests/*.test.mjs" : args[i + 1];

  console.log("VISION UNIVERSE — Test-/Produktionsisolation");
  console.log("Suite: " + suite + "\n");
  const r = pruefe(suite);
  console.log(r.explanation);
  if (r.testsExitCode !== 0) {
    console.log("\nHinweis: die Suite selbst ist nicht gruen (exit " +
      r.testsExitCode + "). Die Isolationsfrage ist davon unabhaengig.");
  }
  process.exit(r.ok ? 0 : 1);
}
