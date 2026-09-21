/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/reconcile-creative-jobs.mjs

   DEN REGISTERZUSTAND AN DIE EVIDENZ HOLEN

   -------------------------------------------------------------------------
   DER BEFUND, DER ES NOETIG MACHTE
   -------------------------------------------------------------------------

   Ein Creative Job stand 51 Stunden auf CREATIVE_JOB_IN_FLIGHT und
   blockierte damit MAX_OPEN_CREATIVE_JOBS = 1. Sein Ergebnis lag seit
   zehn Minuten nach dem Start im Repository, das Ledger nannte
   denselben Schluessel COMPLETED, und eine spaetere Revision hatte ihn
   ausdruecklich ueberholt.

   Die Ursache war keine Ausnahme, sondern ein fehlender Rueckweg:

       ingest-creative.mjs  schreibt  ->  creative-invocations.json
       run-orchestrator.mjs zaehlt    <-  creative-jobs.json

   Der Abschluss landete im Ledger. Gezaehlt wurde das Register. Ohne
   Bruecke blockiert jeder so abgeschlossene Job fuer immer — es gibt
   keine Altersregel, die ihn je freigaebe, und das ist richtig so.

   -------------------------------------------------------------------------
   WAS DIESES SKRIPT TUT
   -------------------------------------------------------------------------

   Es sammelt fuer jeden OFFENEN Job die harte Evidenz mit IDENTISCHEM
   processing_key und laesst die Engine entscheiden. Es entscheidet
   nichts selbst: die Liste zulaessiger Evidenz steht in
   creative-job.js und weist alles andere benannt zurueck.

   Es ist IDEMPOTENT. Ein zweiter Lauf findet dieselbe Evidenz, trifft
   auf einen terminalen Job und schreibt nichts — auch keinen zweiten
   History-Eintrag.

   -------------------------------------------------------------------------
   WAS ES NICHT TUT
   -------------------------------------------------------------------------

   Es loescht nichts, erzeugt keinen Job, stellt keinen Request, loest
   keine Work Invocation aus und veroeffentlicht nichts. Ein Job wird
   NIEMALS wegen seines Alters geschlossen.

   Ausfuehren:
     node scripts/social/reconcile-creative-jobs.mjs           # nur zeigen
     node scripts/social/reconcile-creative-jobs.mjs --write   # schreiben
     node scripts/social/reconcile-creative-jobs.mjs --json
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Job = require(join(ROOT, "social/engines/creative-job.js"));

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const JSON_AUS = argv.includes("--json");
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const DATEN = arg("data", "social/data");
const ANFRAGEN = arg("requests", "authoring/requests");
const NOW = arg("now", new Date().toISOString());

/* Ein Pfad, wie er gemeint ist.
   -----------------------------------------------------------------
   `--data /tmp/…` ist absolut und darf NICHT unter ROOT gehaengt
   werden. Die erste Fassung tat genau das an drei von vier Stellen —
   sie fand die Evidenz nicht und meldete "keine zulaessige Evidenz",
   also ausgerechnet den Satz, der nach einem korrekten Befund
   aussieht. Ein Test mit einem Temp-Verzeichnis hat es gefunden. */
function pfad(p) {
  return String(p).startsWith("/") ? String(p) : join(ROOT, p);
}

function lies(p, f = null) {
  const voll = pfad(p);
  if (!existsSync(voll)) return f;
  try { return JSON.parse(readFileSync(voll, "utf8")); } catch { return f; }
}

/* ------------------------------------------------------------------
   DIE EVIDENZ, EINGESAMMELT — NICHT BEURTEILT

   Beurteilt wird in der Engine. Hier wird nur nachgesehen, und zwar
   ueber den processing_key: er ist der einzige Schluessel, der Brief,
   Ergebnis, Ledger und Register verbindet. Ueber die content_id zu
   gehen waere bequemer und falsch — zu einem Inhaltsobjekt gibt es
   mehrere Anlaeufe, und der vorletzte darf den letzten nicht
   schliessen.
   ------------------------------------------------------------------ */

/** Alle Ergebnisdateien, nach processing_key. */
function ergebnisseNachSchluessel() {
  const ordner = pfad(ANFRAGEN);
  const aus = new Map();
  if (!existsSync(ordner)) return aus;
  for (const name of readdirSync(ordner)) {
    const datei = join(ordner, name, "authoring-result.json");
    if (!existsSync(datei)) continue;
    const r = lies(datei);
    const key = r && r.processing && r.processing.processing_key;
    if (key) aus.set(key, { pfad: join(ANFRAGEN, name, "authoring-result.json"), result: r });
  }
  return aus;
}

/** Alle Ergebnisdateien, die einen Vorgaenger ausdruecklich nennen. */
function nachfolgerNachVorgaenger() {
  const ordner = pfad(ANFRAGEN);
  const aus = new Map();
  if (!existsSync(ordner)) return aus;
  for (const name of readdirSync(ordner)) {
    const datei = join(ordner, name, "authoring-result.json");
    if (!existsSync(datei)) continue;
    const r = lies(datei);
    if (!r || !r.supersedes_content_id) continue;
    const liste = aus.get(r.supersedes_content_id) || [];
    liste.push(r);
    aus.set(r.supersedes_content_id, liste);
  }
  return aus;
}

function ledgerNachSchluessel() {
  const d = lies(join(DATEN, "creative-invocations.json"), null);
  const liste = Array.isArray(d) ? d : ((d && (d.invocations || d.entries)) || []);
  const aus = new Map();
  for (const e of liste) {
    if (!e || !e.processingKey) continue;
    /* Der juengste Eintrag je Schluessel gewinnt: das Ledger ist eine
       Folge von Beobachtungen, kein Zustand. */
    const alt = aus.get(e.processingKey);
    if (!alt || String(e.at || "") >= String(alt.at || "")) aus.set(e.processingKey, e);
  }
  return aus;
}

/**
 * Welche zulaessige Evidenz gibt es zu diesem Job?
 *
 * Reihenfolge ist Rang: das EIGENE Ergebnis schlaegt den Nachfolger.
 * Ein Job, der geliefert hat, ist verifiziert und nicht ueberholt —
 * auch dann, wenn spaeter eine Revision kam.
 */
function evidenzFuer(job, ergebnisse, ledger, nachfolger, register) {
  const belege = [];

  const eigenes = job.processingKey ? ergebnisse.get(job.processingKey) : null;
  if (eigenes && eigenes.result.processing &&
      eigenes.result.processing.status === "completed") {
    belege.push({ art: "RESULT_VERIFIED", quelle: eigenes.pfad,
      detail: "processing.status=completed, processing_key identisch" });
  }

  const l = job.processingKey ? ledger.get(job.processingKey) : null;
  if (l && (l.state === "COMPLETED" || l.state === "VERIFIED")) {
    belege.push({ art: "LEDGER_COMPLETED", quelle: "creative-invocations.json",
      detail: l.state + " am " + l.at + (l.note ? " — " + l.note : "") });
  } else if (l && l.state === "REJECTED") {
    belege.push({ art: "LEDGER_REJECTED", quelle: "creative-invocations.json",
      detail: "REJECTED am " + l.at + (l.note ? " — " + l.note : "") });
  }

  /* Ein Nachfolger zaehlt nur, wenn SEIN Job abgeschlossen ist. Ein
     Nachfolger, der selbst noch laeuft, hat nichts bewiesen. */
  for (const n of (nachfolger.get(job.contentId) || [])) {
    const seiner = register.filter((j) => j.contentId === n.content_id &&
      Job.TERMINAL.indexOf(j.state) !== -1);
    if (seiner.length) {
      belege.push({ art: "SUPERSEDED_BY_VERIFIED_SUCCESSOR",
        quelle: ANFRAGEN + "/" + n.content_id + "/authoring-result.json",
        detail: n.content_id + " nennt " + job.contentId + " als Vorgaenger und " +
          "steht auf " + seiner[0].state });
    }
  }

  return belege;
}

/* ------------------------------------------------------------------ Lauf */
const registerPfad = pfad(join(DATEN, "creative-jobs.json"));
const registerDatei = lies(registerPfad, null);
if (!registerDatei) {
  console.error("Kein Job-Register unter " + registerPfad + " — nichts abzugleichen.");
  process.exit(4);
}

const jobs = registerDatei.jobs || [];
const registry = Job.createRegistry(jobs);
const ergebnisse = ergebnisseNachSchluessel();
const ledger = ledgerNachSchluessel();
const nachfolger = nachfolgerNachVorgaenger();

const offene = jobs.filter((j) => Job.OFFEN.indexOf(j.state) !== -1);
const befunde = [];

for (const job of offene) {
  const belege = evidenzFuer(job, ergebnisse, ledger, nachfolger, jobs);
  if (!belege.length) {
    befunde.push({ creativeJobId: job.creativeJobId, contentId: job.contentId,
      vorher: job.state, nachher: job.state, geaendert: false,
      grund: "keineEvidenz", belege: [],
      satz: "Keine zulaessige Evidenz. Der Job bleibt offen — Alter allein " +
        "schliesst ihn nicht." });
    continue;
  }

  const erste = belege[0];
  const r = registry.reconcile(job.creativeJobId, erste.art,
    { now: NOW, note: erste.quelle });

  befunde.push({ creativeJobId: job.creativeJobId, contentId: job.contentId,
    vorher: r.from || job.state, nachher: r.geaendert ? r.to : job.state,
    geaendert: !!r.geaendert, grund: r.reason,
    belege: belege.map((b) => b.art + " (" + b.quelle + ")"),
    satz: r.message });
}

const geaendert = befunde.filter((b) => b.geaendert);
const offenNachher = registry.all().filter((j) => Job.OFFEN.indexOf(j.state) !== -1);

if (WRITE && geaendert.length) {
  writeFileSync(registerPfad,
    JSON.stringify(Object.assign({}, registerDatei,
      { jobs: registry.all(), reconciledAt: NOW }), null, 2) + "\n");
}

if (JSON_AUS) {
  console.log(JSON.stringify({
    generatedAt: NOW,
    written: WRITE && geaendert.length > 0,
    openBefore: offene.length,
    openAfter: offenNachher.length,
    reconciled: geaendert.length,
    findings: befunde
  }, null, 2));
} else {
  console.log("VISION UNIVERSE SOCIAL — Creative Jobs abgleichen\n");
  console.log("  Offen vorher: " + offene.length + "\n");
  for (const b of befunde) {
    console.log("  " + (b.geaendert ? "->  " : "    ") + b.contentId);
    console.log("      " + b.creativeJobId.slice(0, 72));
    console.log("      " + b.vorher + (b.geaendert ? "  ->  " + b.nachher : ""));
    for (const e of b.belege) console.log("      Evidenz: " + e);
    console.log("      " + b.satz);
    console.log("");
  }
  console.log("  Abgeglichen : " + geaendert.length);
  console.log("  Offen nachher: " + offenNachher.length +
    "   (MAX_OPEN_CREATIVE_JOBS = " + Job.BUDGET.concurrentJobsPerContentId + " je Inhalt)");
  if (!WRITE) console.log("\n  (Kein --write: es wurde nichts geschrieben.)");
  console.log("\n  Ein Job wird niemals wegen seines Alters geschlossen.");
}

process.exit(0);
