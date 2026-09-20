/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/open-creative-request.mjs

   DER LETZTE SCHRITT, DEN BISHER EIN MENSCH GETAN HAT

   -------------------------------------------------------------------------
   WAS HIER FEHLTE
   -------------------------------------------------------------------------

   request-creative.mjs schreibt den Brief. dispatch-creative-job.mjs
   traegt den Job ein und sagt woertlich: "Erst JETZT duerfen Branch und
   Pull Request entstehen."

   Genau dieser Satz war das letzte Owner Gate, das keines sein sollte.
   Jemand musste den Branch pushen und den PR oeffnen. Der Owner stand
   damit an zwei Stellen statt an einer.

   Dieses Skript macht diesen einen Schritt - und keinen anderen. Es ist
   KEIN zweiter Ausloesemechanismus: es benutzt denselben Brief, dasselbe
   Register und dasselbe PR-Ereignis, das die Work-Automation seit acht
   Jobs startet.

   -------------------------------------------------------------------------
   WARUM ES NOCH EINMAL PRUEFT
   -------------------------------------------------------------------------

   Die Tore davor haben bereits entschieden. Trotzdem prueft dieses
   Skript erneut, ob der Job existiert und im richtigen Zustand ist -
   denn zwischen dem Registereintrag und diesem Aufruf liegt ein
   Prozesswechsel, und ein PR ist die Handlung mit Aussenwirkung. Wer
   an der teuersten Stelle auf eine frueher erteilte Zusage vertraut,
   verlaesst sich darauf, dass nichts dazwischenkam.

   Ausfuehren:
     node scripts/social/open-creative-request.mjs --content-id vu-xom-20260917
     node scripts/social/open-creative-request.mjs --content-id vu-xom-20260917 --write
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Job = require(join(ROOT, "social/engines/creative-job.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));

export const REGISTER = "social/data/creative-jobs.json";

/** Der Branchname eines Requests. Eine Definition, nicht zwei. */
export function branchFor(contentId) {
  return "authoring/request/" + String(contentId);
}

/** Der Titel, an dem die Work-Automation den Request erkennt. */
export function titleFor(contentId) {
  return "VU-AUTHORING-REQUEST: " + String(contentId);
}

/**
 * Darf dieser Request als Pull Request in die Welt?
 *
 * Bewusst als Wert und nicht als Wurf, damit Tests ihn lesen koennen -
 * dieselbe Bauart wie verify-creative-dispatch.mjs.
 */
export function pruefe(spec) {
  const contentId = spec && spec.contentId;
  if (!contentId) {
    return { ok: false, reason: "noContentId",
      message: "Ohne content_id gibt es nichts zu oeffnen." };
  }

  if (!spec.briefExists) {
    return { ok: false, reason: "noBrief",
      message: "Kein Brief unter " + ChatGptWork.requestDir(contentId) +
        "/authoring-brief.json. Erst request-creative.mjs." };
  }

  const jobs = (spec.jobs || []).filter((j) => j.contentId === contentId);
  if (!jobs.length) {
    return { ok: false, reason: "noJob",
      message: "Zu " + contentId + " steht kein Job im Register. Ein PR ohne " +
        "beschlossenen Job ist ein Dispatch, den niemand beschlossen hat - " +
        "genau der, den creative-job-guard.yml rot meldet." };
  }

  /* Der juengste Job zu diesem Inhalt entscheidet. */
  const job = jobs[jobs.length - 1];

  if (job.state !== "CREATIVE_JOB_REQUESTED") {
    return { ok: false, reason: "wrongState", job,
      message: "Job " + job.creativeJobId + " steht auf " + job.state +
        ". Ein Pull Request gehoert genau in den Uebergang " +
        "CREATIVE_JOB_REQUESTED -> CREATIVE_JOB_DISPATCHED; jeder andere " +
        "Zustand heisst, dass der PR entweder schon existiert oder der Job " +
        "vorbei ist." };
  }

  if (job.prNumber) {
    return { ok: false, reason: "prExists", job,
      message: "Zu Job " + job.creativeJobId + " ist bereits PR #" +
        job.prNumber + " vermerkt. Ein zweiter waere eine zweite Anfrage " +
        "fuer dieselbe Arbeit." };
  }

  /* Ein Branch, den es schon gibt, ist der deutlichste Hinweis darauf,
     dass ein frueherer Lauf weiter gekommen ist als sein Register. */
  if (spec.branchExists) {
    return { ok: false, reason: "branchExists",
      message: "Der Branch " + branchFor(contentId) + " existiert bereits. " +
        "Ein frueherer Lauf ist weiter gekommen, als das Register vermerkt - " +
        "das gehoert angesehen und nicht ueberschrieben." };
  }

  return { ok: true, reason: null, job,
    branch: branchFor(contentId), title: titleFor(contentId) };
}

/** Der PR-Text. Er sagt, WER den Job beschlossen hat und WARUM. */
export function bodyFor(contentId, job, entscheidung) {
  return [
    "Automatisch erzeugt vom Social Orchestrator.",
    "",
    "| | |",
    "| --- | --- |",
    "| content_id | `" + contentId + "` |",
    "| creative_job_id | `" + (job.creativeJobId || "—") + "` |",
    "| processing_key | `" + (job.processingKey || "—") + "` |",
    "| request_type | " + (job.revision ? "TEXT_REVISION" : "FULL_CREATIVE") + " |",
    "| Anlauf | " + (job.attempt || 1) + " |",
    "",
    "**Warum dieser Job:** " + (entscheidung || "Entscheidung des Orchestrators."),
    "",
    "Das Oeffnen dieses Pull Requests startet die bestehende",
    "ChatGPT-Work-Automation. Der Agent schreibt sein Ergebnis auf diesen",
    "Branch zurueck.",
    "",
    "Veroeffentlicht wird dadurch nichts: `publishing_allowed` steht im",
    "Brief auf `false`, und der Owner entscheidet am Publishing Gate."
  ].join("\n");
}

/* --------------------------------------------------------------- Lauf */
function git(args, options) {
  return execFileSync("git", args,
    Object.assign({ cwd: ROOT, encoding: "utf8" }, options || {})).trim();
}

export function branchVorhanden(contentId) {
  const b = branchFor(contentId);
  try {
    if (git(["branch", "--list", b])) return true;
  } catch { /* egal */ }
  try {
    const fern = git(["ls-remote", "--heads", "origin", b]);
    return fern.length > 0;
  } catch { return false; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const CID = arg("content-id", null);
  const WRITE = args.includes("--write");
  const GRUND = arg("reason", null);
  const NOW = arg("now", new Date().toISOString());

  if (!CID) { console.error("Kein --content-id."); process.exit(2); }

  const registerPfad = join(ROOT, REGISTER);
  const roh = existsSync(registerPfad)
    ? JSON.parse(readFileSync(registerPfad, "utf8")) : { jobs: [] };
  const briefPfad = join(ROOT, ChatGptWork.requestDir(CID), "authoring-brief.json");

  const befund = pruefe({
    contentId: CID,
    briefExists: existsSync(briefPfad),
    jobs: roh.jobs || [],
    branchExists: branchVorhanden(CID)
  });

  console.log("VISION UNIVERSE SOCIAL — Creative Request oeffnen");
  console.log("Inhalt:  " + CID);
  console.log("Branch:  " + branchFor(CID));
  console.log("Titel:   " + titleFor(CID));

  console.log("\n--- GATTER ---");
  if (!befund.ok) {
    console.error("KEIN PULL REQUEST (" + befund.reason + "): " + befund.message);
    process.exit(4);
  }
  console.log("Frei. Job " + befund.job.creativeJobId + " wartet auf seinen PR.");

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts gepusht und nichts geoeffnet.)");
    console.log("\n--- PR-TEXT ---");
    console.log(bodyFor(CID, befund.job, GRUND));
    process.exit(0);
  }

  /* -------------------------------------------------------------------
     DER BRIEF REIST AUF SEINEM EIGENEN ZWEIG

     Nur der Brief. Register und Ledger gehoeren auf den Hauptzweig -
     sie sind der Nachweis, dass VU den Job beschlossen hat, und der
     gehoert nicht in den Zweig, den ein fremder Agent beschreibt.
     ------------------------------------------------------------------- */
  const branch = branchFor(CID);
  git(["checkout", "-b", branch]);
  git(["add", "--", join("authoring/requests", CID, "authoring-brief.json")]);
  git(["-c", "user.name=vision-universe-bot",
       "-c", "user.email=bot@visionuniverse.de",
       "commit", "-m", titleFor(CID),
       "-m", "Beschlossen vom Social Orchestrator am " + NOW + "."]);
  git(["push", "-u", "origin", branch]);

  console.log("\nGepusht: " + branch);

  const body = bodyFor(CID, befund.job, GRUND);
  const nummer = execFileSync("gh",
    ["pr", "create", "--base", "main", "--head", branch,
     "--title", titleFor(CID), "--body", body],
    { cwd: ROOT, encoding: "utf8" }).trim();

  console.log("Pull Request: " + nummer);

  /* Zurueck auf den Hauptzweig, damit der Registereintrag dort landet. */
  git(["checkout", "-"]);

  const registry = Job.createRegistry(roh.jobs || []);
  const treffer = /\/pull\/(\d+)/.exec(nummer);
  registry.transition(befund.job.creativeJobId, "CREATIVE_JOB_DISPATCHED", {
    now: NOW, prNumber: treffer ? Number(treffer[1]) : null,
    note: "PR vom Orchestrator geoeffnet." });
  writeFileSync(registerPfad, JSON.stringify(
    Object.assign({}, roh, registry.snapshot({ now: NOW })), null, 2) + "\n");

  console.log("Register: CREATIVE_JOB_DISPATCHED" +
    (treffer ? " (PR #" + treffer[1] + ")" : ""));
}
