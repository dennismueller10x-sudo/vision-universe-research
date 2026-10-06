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

/* -------------------------------------------------------------------
   DIE GESCHUETZTEN BAEUME ALS PFADE

   Dieselbe Menge wie GESCHUETZT, nur in der Form, die `git diff`
   versteht. Zwei Listen waeren zwei Meinungen darueber, was geschuetzt
   ist; diese hier ist abgeleitet und nicht abgeschrieben.
   ------------------------------------------------------------------- */
const GESCHUETZTE_BAEUME = ["quant/data", "social/data", "discover/data",
  "authoring/requests"];

/** Ein Abdruck des Arbeitsbaums: Pfad -> Zustand, plus der Inhalt. */
function abdruck() {
  const zeilen = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT })
    .toString().split("\n").filter(Boolean);
  const map = new Map();
  for (const z of zeilen) map.set(z.slice(3).trim(), z.slice(0, 2));

  /* -----------------------------------------------------------------
     DER INHALT, NICHT NUR DER ZUSTAND

     Hier stand `git diff` ueber den GANZEN Baum, und das Ergebnis
     wurde als `diffLength` mitgefuehrt - und nie verglichen. Eine
     Messung, die niemandem im Weg steht, ist keine.

     Verglichen wird jetzt, und zwar nur ueber den geschuetzten
     Baeumen: sonst schlaegt die Pruefung an, sobald irgendwo anders im
     Repository etwas liegt, was mit dem Testlauf nichts zu tun hat.

     Der Fall, den erst das faengt: eine Datei, die VORHER schon als
     geaendert galt und WAEHREND des Laufs ein zweites Mal - anders -
     geschrieben wurde. `git status` zeigt beide Male "M", und der
     erste Vergleich sieht keinen Unterschied.

     WAS ES NICHT FAENGT, und das steht hier, damit es niemand fuer
     mehr haelt: ein Schreiben, das sich selbst zurueckstellt. Wer eine
     Datei aendert und exakt den alten Inhalt wieder hineinschreibt,
     hinterlaesst keine Spur, die ein Vorher-Nachher-Vergleich finden
     koennte. Dagegen hilft kein Abdruck, sondern nur, dass Tests
     ueberhaupt nicht in diese Baeume schreiben - und genau das ist
     der Grund, warum diese Pruefung existiert und nicht die einzige
     Verteidigung ist. */
  const inhalt = execFileSync("git",
    ["diff", "--no-color", "--", ...GESCHUETZTE_BAEUME], { cwd: ROOT }).toString();
  return { map, inhalt };
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

  /* Der Inhalt der geschuetzten Baeume hat sich geaendert, ohne dass
     `git status` eine neue Datei meldet: dann wurde in einer bereits
     geaenderten Datei ein zweites Mal geschrieben. Das ist ein eigener
     Befund und keine Wiederholung des ersten. */
  const inhaltGeaendert = vorher.inhalt !== nachher.inhalt;
  if (inhaltGeaendert && !neu.length) {
    neu.push({ pfad: "(Inhalt eines geschuetzten Baumes)",
      vor: vorher.inhalt.length + " Zeichen Diff",
      nach: nachher.inhalt.length + " Zeichen Diff" });
  }

  return {
    suite,
    testsExitCode: exitCode,
    violations: neu,
    contentChanged: inhaltGeaendert,
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

  /* Ein Muster ohne --suite wurde stillschweigend verworfen, und der
     Lauf pruefte weiter die Standardsuite - mit einer Ausgabe, die
     ehrlich "Suite: quant/..." sagte und trotzdem gelesen wurde, als
     haette sie die gewuenschte geprueft. Lieber abbrechen: ein
     Pruefwerkzeug, das etwas anderes prueft als verlangt, ist
     schlimmer als keines. */
  /* `k !== i + 1` allein war falsch: ohne --suite ist i === -1, und
     i + 1 ist dann 0 - genau der Index des positionalen Arguments, das
     die Pruefung finden sollte. Die Wache verschluckte den Fall, gegen
     den sie geschrieben war. */
  const uebrig = args.filter(function (a, k) {
    if (a === "--suite") return false;
    return i === -1 || k !== i + 1;
  });
  if (uebrig.length) {
    console.error("Unbekanntes Argument: " + uebrig.join(" ") +
      "\nGemeint war vermutlich: --suite \"" + uebrig[0] + "\"");
    process.exit(2);
  }

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
