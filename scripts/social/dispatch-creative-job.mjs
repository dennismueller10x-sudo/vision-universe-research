/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/dispatch-creative-job.mjs

   DER EINZIGE ZUGELASSENE WEG, EINEN CREATIVE JOB IN DIE WELT ZU SETZEN

   -------------------------------------------------------------------------
   DIE LUECKE, DIE DIESE DATEI SCHLIESST
   -------------------------------------------------------------------------

   request-creative.mjs hatte ein Gatter — aber es sass an der falschen
   Stelle. Es prueft, bevor der BRIEF geschrieben wird. Ausgeloest wird
   der Agent aber nicht vom Brief, sondern vom Oeffnen des Pull Requests.
   Dazwischen lagen `git push` und ein PR — beides ausserhalb jeder
   Pruefung.

   Genau so sind die bisherigen acht Jobs entstanden: von Hand, am
   Gatter vorbei. Dass dabei nie ein doppelter Dispatch passierte, war
   Sorgfalt und keine Eigenschaft des Systems.

   Diese Datei macht den Dispatch zu einem Vorgang, der gezaehlt wird:
   erst der Eintrag im Job-Register, dann der Push, dann der PR. Wer die
   Reihenfolge umdreht, hat einen Job, den niemand kennt.

   -------------------------------------------------------------------------
   FAIL CLOSED
   -------------------------------------------------------------------------

   Jede Verweigerung endet mit einem Rueckgabewert ungleich null. Ein
   Gatter, das mit 0 endet, ist kein Gatter.

   Ausfuehren:
     node scripts/social/dispatch-creative-job.mjs --content-id vu-xom-20260911
     node scripts/social/dispatch-creative-job.mjs --content-id vu-xom-20260911 --write
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

export function registerLaden(root) {
  const pfad = join(root || ROOT, REGISTER);
  const roh = existsSync(pfad)
    ? JSON.parse(readFileSync(pfad, "utf8")) : { jobs: [] };
  return { registry: Job.createRegistry(roh.jobs || []), pfad, roh };
}

/** Der Blob-SHA des abgelegten Briefs — die Wurzel aller Kennungen. */
export function briefSha(contentId, root) {
  const rel = ChatGptWork.requestDir(contentId) + "/authoring-brief.json";
  const abs = join(root || ROOT, rel);
  if (!existsSync(abs)) return null;
  return execFileSync("git", ["hash-object", abs],
    { cwd: root || ROOT, encoding: "utf8" }).trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const CID = arg("content-id", null);
  const WRITE = args.includes("--write");
  const PRODUKTION = !args.includes("--allow-diagnostic");
  const NOW = arg("now", new Date().toISOString());

  if (!CID) { console.error("Kein --content-id."); process.exit(2); }

  const { registry, pfad, roh } = registerLaden();
  const brief = join(ROOT, ChatGptWork.requestDir(CID), "authoring-brief.json");
  if (!existsSync(brief)) {
    console.error("Kein Brief unter " + brief + ". Erst request-creative.mjs.");
    process.exit(2);
  }
  const daten = JSON.parse(readFileSync(brief, "utf8"));
  const sha = briefSha(CID);
  const key = [daten.brief_id, CID, sha, "1.0"].join(":");

  console.log("VISION UNIVERSE SOCIAL — Creative Job Dispatch");
  console.log("Inhalt:        " + CID);
  console.log("Brief-SHA:     " + sha);
  console.log("Processing Key:" + key);
  console.log("Anlauf:        " + (daten.attempt || 1));

  const spec = { contentId: CID, briefId: daten.brief_id, briefBlobSha: sha,
    processingKey: key, attempt: daten.attempt || 1, revision: daten.revision || null };

  const darf = registry.mayDispatch(spec, { productionPath: PRODUKTION });
  console.log("\n--- GATTER ---");
  if (!darf.ok) {
    console.error("KEIN DISPATCH (" + darf.reason + "): " + darf.message);
    process.exit(4);
  }
  console.log("Frei. Kein logischer Job zu diesem Schluessel.");

  if (!WRITE) {
    console.log("\n(Kein --write: es wurde nichts geschrieben.)");
    process.exit(0);
  }

  const job = registry.dispatch(spec, { now: NOW });
  writeFileSync(pfad, JSON.stringify(
    Object.assign({}, roh, registry.snapshot({ now: NOW })), null, 2) + "\n");

  console.log("\nJob angelegt: " + job.creativeJobId + " (" + job.state + ")");
  console.log("Register:     " + REGISTER);
  console.log("\nErst JETZT duerfen Branch und Pull Request entstehen.");
  console.log("Nach dem Oeffnen: --pr <nummer> nachtragen (DISPATCHED).");
}
