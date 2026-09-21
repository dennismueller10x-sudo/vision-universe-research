/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/verify-suites.mjs

   GRUEN IST KEINE EIGENSCHAFT, SONDERN EIN ZEITPUNKT

   -------------------------------------------------------------------------
   WOZU DIESE DATEI ENTSTANDEN IST
   -------------------------------------------------------------------------

   production-readiness.mjs kannte zwei Fahnen:

       --suites-green
       --isolation-proven

   Wer sie setzte, setzte damit zwei der zehn Reifebedingungen auf
   ERFUELLT. Kein Messwert, keine Quelle, kein Stand - eine Behauptung
   des Aufrufers ueber die Arbeit, die der Bericht bewerten sollte.
   Und sie liess sich auch dann setzen, wenn die Suiten vor drei
   Wochen zuletzt liefen und seitdem vierzig Dateien anders sind.

   Dieses Skript ersetzt die Behauptung durch einen BEFUND MIT STAND:
   es laesst die Suiten und die Isolationspruefung tatsaechlich laufen
   und schreibt, was dabei herauskam - zusammen mit dem Commit, an dem
   es lief.

   Der Bericht liest die Datei und vergleicht den Commit mit HEAD.
   Gruen an einem anderen Stand ist kein Beleg fuer diesen; es steht
   dann UNGEPRUEFT da und blockiert, was es blockieren soll.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es veroeffentlicht nichts, stoesst keinen Lauf an, ruft keine
   externe Schnittstelle und verbraucht kein Work-Budget. Es fuehrt
   Tests aus und schreibt EINE Datei ausserhalb der Datenbaeume.

   Ausfuehren:
     node scripts/social/verify-suites.mjs
     node scripts/social/verify-suites.mjs --out .verification/suites.json
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

const AUS = arg("out", ".verification/suites.json");

/* Die Suiten, um die es geht. Nicht "alle Tests des Repositories":
   gefragt ist der Social-Orchestrator samt seiner Laufzeit. */
const SUITEN = [
  { id: "social", muster: "social/tests/*.test.mjs" },
  { id: "worker", muster: "workers/vision-universe-social/tests/*.test.mjs" }
];

function commit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"],
      { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { return null; }
}

/* Ein sauberer Baum gehoert zum Stand dazu: gruen bei drei nicht
   eingecheckten Aenderungen sagt nichts ueber den Commit aus. */
function sauber() {
  try {
    return execFileSync("git", ["status", "--porcelain"],
      { cwd: ROOT, encoding: "utf8" }).trim() === "";
  } catch { return null; }
}

/**
 * Eine Suite laufen lassen und ZAEHLEN, was herauskam.
 *
 * Gelesen wird die TAP-Zusammenfassung des Node-Testrunners, nicht
 * der Exit-Code allein: ein Lauf, der gar keinen Test gefunden hat,
 * endet ebenfalls mit 0, und "0 von 0 bestanden" ist kein gruener
 * Lauf, sondern ein leerer.
 */
function laufen(suite) {
  let ausgabe = "";
  let code = 0;
  try {
    ausgabe = execFileSync("node", ["--test", suite.muster],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    ausgabe = String((err.stdout || "") + (err.stderr || ""));
    code = err.status === undefined ? 1 : err.status;
  }
  const zahl = (name) => {
    const m = ausgabe.match(new RegExp("^# " + name + " (\\d+)", "m"));
    return m ? Number(m[1]) : null;
  };
  const tests = zahl("tests");
  const bestanden = zahl("pass");
  const gefallen = zahl("fail");
  return {
    id: suite.id, pattern: suite.muster,
    tests, pass: bestanden, fail: gefallen, exitCode: code,
    /* Drei Bedingungen, und die erste ist die, die ein Exit-Code
       nicht stellt. */
    ok: tests !== null && tests > 0 && gefallen === 0 && code === 0
  };
}

/** Die Isolationspruefung, je Suite. */
function isolation(suite) {
  let ausgabe = "";
  let code = 0;
  try {
    ausgabe = execFileSync("node",
      ["scripts/quality/check-test-isolation.mjs", "--suite", suite.muster],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    ausgabe = String((err.stdout || "") + (err.stderr || ""));
    code = err.status === undefined ? 1 : err.status;
  }
  const unveraendert = /keine Produktionsdatei veraendert/.test(ausgabe);
  return { id: suite.id, ok: code === 0 && unveraendert, exitCode: code,
    satz: ausgabe.trim().split("\n").slice(-1)[0] || null };
}

/* ------------------------------------------------------------------ Lauf */
console.log("VISION UNIVERSE SOCIAL — Suiten und Isolation messen\n");

const laeufe = SUITEN.map((s) => {
  process.stdout.write("  " + s.id.padEnd(8) + " laeuft ... ");
  const r = laufen(s);
  console.log(r.ok ? (r.pass + " gruen") : ("FEHLGESCHLAGEN (" +
    (r.fail === null ? "keine Zusammenfassung" : r.fail + " gefallen") + ")"));
  return r;
});

const isolationen = SUITEN.map((s) => {
  process.stdout.write("  " + s.id.padEnd(8) + " Isolation ... ");
  const r = isolation(s);
  console.log(r.ok ? "unveraendert" : "VERAENDERT");
  return r;
});

const befund = {
  generatedAt: new Date().toISOString(),
  commit: commit(),
  cleanTree: sauber(),
  suites: laeufe,
  isolation: isolationen,
  suitesOk: laeufe.every((r) => r.ok),
  isolationOk: isolationen.every((r) => r.ok)
};

mkdirSync(join(ROOT, dirname(AUS)), { recursive: true });
writeFileSync(join(ROOT, AUS), JSON.stringify(befund, null, 2) + "\n");

console.log("\n  Stand:     " + (befund.commit || "unbekannt").slice(0, 10) +
  (befund.cleanTree === false ? "  (Baum NICHT sauber)" : ""));
console.log("  Suiten:    " + (befund.suitesOk ? "gruen" : "nicht gruen"));
console.log("  Isolation: " + (befund.isolationOk ? "unveraendert" : "veraendert"));
console.log("  Geschrieben: " + AUS);

process.exit(befund.suitesOk && befund.isolationOk ? 0 : 1);
