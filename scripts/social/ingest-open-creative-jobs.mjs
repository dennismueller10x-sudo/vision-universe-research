/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/ingest-open-creative-jobs.mjs

   DIE FEHLENDE ERSTE LINIE

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   PR #170 (vu-nvda-20260918) trug seit 13:05 Uhr einen echten,
   vollstaendig bestaetigten Creative-Result-Commit — Hook-Varianten,
   Caption, ein geprueftes Bild. `ingest-creative.mjs` bestaetigt das
   Ergebnis als COMPLETED, sobald man es gegen den PR-Branch ausfuehrt.

   Trotzdem blieb der Job Stunden auf CREATIVE_JOB_DISPATCHED stehen
   und blockierte MAX_OPEN_CREATIVE_JOBS = 1 fuer den gesamten Betrieb.

   Der Grund war kein kaputter externer Agent, sondern eine fehlende
   Verdrahtung: `ingest-creative.mjs` wird in KEINEM Workflow jemals
   aufgerufen. `reconcile-creative-jobs.mjs` — die "zweite Linie" laut
   eigenem Kommentar — sucht das Ergebnis nur im bereits ausgecheckten
   Arbeitsbaum von `main`, und dorthin gelangt es nie: der Agent
   committet auf den Request-Branch, nicht auf main, und niemand holt
   diesen Branch.

   -------------------------------------------------------------------------
   WAS DIESES SKRIPT TUT — UND NICHT TUT
   -------------------------------------------------------------------------

   Es baut KEINE neue Pruef- oder Uebernahmelogik. Es haengt fuer jeden
   OFFENEN Job mit einer Request-PR-Nummer den vorhandenen, bereits
   getesteten Weg an: den Request-Branch holen, dann `ingest-creative.mjs
   --write` denselben Job pruefen und uebernehmen lassen, den ein Mensch
   bisher von Hand aufgerufen haben muesste.

   Ein Job ohne PR-Nummer gehoert nicht hierher — dafuer misst
   `reconcile-creative-jobs.mjs` bereits DISPATCH_NIE_ERFOLGT. Ein
   fehlgeschlagener `git fetch` (Branch geloescht, Netzproblem) ist kein
   Absturz: `ingest-creative.mjs` meldet dann NO_BRIEF und laesst den Job
   unveraendert — dieselbe Antwort wie bei einem Agenten, der noch nicht
   geliefert hat.

   Ausfuehren:
     node scripts/social/ingest-open-creative-jobs.mjs
     node scripts/social/ingest-open-creative-jobs.mjs --write
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Job = require(join(ROOT, "social/engines/creative-job.js"));

/** Die offenen Jobs, fuer die ueberhaupt ein Branch existieren kann. */
export function offeneJobsMitPr(register) {
  return (register.jobs || []).filter((j) =>
    Job.OFFEN.indexOf(j.state) !== -1 && j.prNumber);
}

/* --------------------------------------------------------------- Lauf
   ingest-creative.mjs kennt kein --data/--repo-root: Ledger und Register
   liegen bei ihm fest unter ROOT/social/data. Dieses Skript haengt sich
   deshalb an dieselbe reale ROOT — eine Umleitung waere hier keine
   Vereinfachung, sondern ein zweiter, unwahrer Pfad. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");

  const registerPfad = join(ROOT, "social/data/creative-jobs.json");
  if (!existsSync(registerPfad)) {
    console.log("Kein Job-Register unter " + registerPfad + " — nichts zu holen.");
    process.exit(0);
  }
  const register = JSON.parse(readFileSync(registerPfad, "utf8"));
  const jobs = offeneJobsMitPr(register);

  console.log("VISION UNIVERSE SOCIAL — Offene Creative Jobs einholen\n");
  console.log("Offene Jobs mit Request-PR: " + jobs.length + "\n");

  for (const job of jobs) {
    const zweig = "authoring/request/" + job.contentId;
    console.log("--- " + job.contentId + " (PR #" + job.prNumber + ") ---");
    try {
      execFileSync("git", ["fetch", "origin", zweig],
        { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      console.log("  git fetch fehlgeschlagen (" +
        String((err && err.message) || err).split("\n")[0].slice(0, 160) +
        "); ingest-creative.mjs meldet das gleich als NO_BRIEF.");
    }

    const cmd = [join(ROOT, "scripts/social/ingest-creative.mjs"),
      "--content-id", job.contentId];
    if (WRITE) cmd.push("--write");
    try {
      execFileSync("node", cmd, { cwd: ROOT, stdio: "inherit" });
    } catch (err) {
      /* ingest-creative.mjs beendet sich mit 1, wenn das Ergebnis
         zurueckgewiesen wurde (REJECTED/CONTRACT_MISMATCH/...) — das
         ist eine gueltige, geschriebene Antwort und kein Absturz dieses
         Skripts. Nur ein Exit-Code jenseits von 0/1 ist ein echter
         Fehler (fehlende Argumente, unbehandelte Ausnahme). */
      const code = err && typeof err.status === "number" ? err.status : null;
      if (code !== 1) {
        console.error("  Unerwarteter Abbruch (" + code + ") bei " + job.contentId);
        process.exitCode = 1;
      }
    }
    console.log("");
  }
}
