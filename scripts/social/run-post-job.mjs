#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/run-post-job.mjs

   JETZT POST ERSTELLEN / AUTO -> GENAU EIN WORK-JOB (Owner-Auftrag
   "WORK OWNS THE POST", 29.09., §45-§47)

   Drei Aufrufe, eine Schlange (social/data/post-queue.json):

     --enqueue --trigger MANUAL [--topic X] [--run-id N] --write
         legt einen Auftrag an (ein Knopfdruck = ein Auftrag)
     --auto-if-idle [--run-id N] --write
         legt einen AUTO-Auftrag an, wenn nichts wartet und nichts laeuft
     --write
         ist kein Work-Job offen: macht den aeltesten wartenden Auftrag zu
         genau einem Work-Job (Recherchepaket -> Carousel-Brief ->
         Register -> Request-PR). Laeuft einer: wartet, verwirft nichts.

   Die bestehenden Skripte werden unveraendert als Schritte aufgerufen -
   derselbe Weg, den der Orchestrator bisher einzeln ging.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Queue = require(join(ROOT, "social/engines/post-queue.js"));
const Job = require(join(ROOT, "social/engines/creative-job.js"));

export const QUEUE_DATEI = "social/data/post-queue.json";

export function offeneWorkJobs(register) {
  return ((register && register.jobs) || []).filter((j) => Job.OFFEN.indexOf(j.state) !== -1).length;
}

function lies(pfad, fallback) {
  return existsSync(pfad) ? JSON.parse(readFileSync(pfad, "utf8")) : fallback;
}

function schritt(skript, argumente) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/social", skript)].concat(argumente),
    { cwd: ROOT, encoding: "utf8", env: process.env });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
  const WRITE = args.includes("--write");
  const NOW = arg("now", new Date().toISOString());
  const RUN_ID = arg("run-id", process.env.GITHUB_RUN_ID || null);
  const queuePfad = join(ROOT, QUEUE_DATEI);
  let queue = lies(queuePfad, Queue.leer());
  const register = lies(join(ROOT, "social/data/creative-jobs.json"), { jobs: [] });
  const offen = offeneWorkJobs(register);

  const speichern = () => {
    if (!WRITE) return;
    mkdirSync(dirname(queuePfad), { recursive: true });
    writeFileSync(queuePfad, JSON.stringify(queue, null, 2) + "\n");
  };

  console.log("VISION UNIVERSE SOCIAL — Post-Auftraege");
  console.log("Offene Work-Jobs: " + offen + "   wartende Auftraege: " + Queue.wartende(queue).length);

  if (args.includes("--enqueue")) {
    const r = Queue.anmelden(queue, { requestedAt: NOW, trigger: arg("trigger", "MANUAL"),
      topic: arg("topic", null) || null, runId: RUN_ID });
    queue = r.queue;
    speichern();
    console.log(r.neu ? "Auftrag angelegt: " + r.entry.id + " (" + r.entry.trigger + ")"
      : "Auftrag zu diesem Lauf bestand bereits: " + r.entry.id);
    process.exit(0);
  }

  if (args.includes("--auto-if-idle")) {
    if (!Queue.autoErlaubt(queue, offen)) {
      console.log("AUTO: kein neuer Auftrag - es wartet schon einer oder ein Work-Job laeuft.");
      process.exit(0);
    }
    const r = Queue.anmelden(queue, { requestedAt: NOW, trigger: "AUTO", runId: RUN_ID });
    queue = r.queue;
    speichern();
    console.log("AUTO-Auftrag angelegt: " + r.entry.id);
    process.exit(0);
  }

  const plan = Queue.naechsterSchritt(queue, offen);
  console.log(plan.handlung + ": " + plan.grund);
  if (plan.handlung !== "DISPATCH") process.exit(0);
  if (!WRITE) { console.log("(Kein --write: kein Work-Job gestartet.)"); process.exit(0); }

  const auftrag = plan.entry;
  const scheitern = (grund) => {
    queue = Queue.fehlschlag(queue, auftrag.id, grund);
    speichern();
    console.error("Auftrag " + auftrag.id + " nicht gestartet: " + grund);
    process.exit(0);
  };

  const paket = schritt("build-research-package.mjs", ["--write", "--now", NOW]);
  if (paket.code !== 0) scheitern("Recherchepaket: Exit " + paket.code);

  const briefArgs = ["--write", "--now", NOW, "--trigger", auftrag.trigger];
  if (auftrag.topic) briefArgs.push("--owner-topic", auftrag.topic);
  const brief = schritt("request-carousel.mjs", briefArgs);
  const cidTreffer = /content_id=(vu-post-[0-9a-z-]+)/.exec(brief.stdout);
  if (brief.code !== 0 || !cidTreffer) scheitern("Carousel-Brief: Exit " + brief.code);
  const cid = cidTreffer[1];

  const job = schritt("dispatch-creative-job.mjs", ["--content-id", cid, "--write", "--now", NOW]);
  if (job.code !== 0) scheitern("Register: Exit " + job.code);

  const grund = auftrag.trigger === "AUTO"
    ? "Zeitplan: derselbe Work-Prozess wie JETZT POST ERSTELLEN."
    : "JETZT POST ERSTELLEN (" + auftrag.requestedAt + ")" +
      (auftrag.topic ? " - Thema des Owners: " + auftrag.topic : "") + ".";
  const pr = schritt("open-creative-request.mjs", ["--content-id", cid, "--write", "--now", NOW,
    "--reason", grund]);
  if (pr.code !== 0) scheitern("Request-PR: Exit " + pr.code);
  schritt("verify-creative-dispatch.mjs", ["--branch", "authoring/request/" + cid]);

  queue = Queue.markiere(queue, auftrag.id, { state: "DISPATCHED", contentId: cid, dispatchedAt: NOW,
    lastError: null });
  speichern();
  console.log("\nWork-Job gestartet: " + cid + " fuer Auftrag " + auftrag.id);
}
