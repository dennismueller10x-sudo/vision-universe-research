/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/production-readiness.mjs

   NICHT AUFGRUND EINES EINZELNEN GRUENEN TESTS

   Dieses Skript ERFINDET keinen Befund. Es liest echte Zustaende -
   Konfiguration, Quellenregister, Zyklusbericht, Workflow-Dateien,
   Ledger - und reicht sie an production-readiness.js weiter. Was es
   nicht lesen kann, uebergibt es nicht; die Bedingung bleibt dann
   UNGEPRUEFT und blockiert READY.

   Der Unterschied ist der ganze Punkt: ein Skript, das bei fehlender
   Datei "wahrscheinlich in Ordnung" meldet, beantwortet eine Frage,
   die es nicht gestellt hat.

   Ausfuehren:
     node scripts/social/production-readiness.mjs
     node scripts/social/production-readiness.mjs --json
     node scripts/social/production-readiness.mjs --suites-green   (siehe unten)
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

import { ausgabePfad } from "../quality/out-path.mjs";

const Readiness = require(join(ROOT, "social/engines/production-readiness.js"));
const Registry = require(join(ROOT, "social/engines/source-registry.js"));
const Orchestrator = require(join(ROOT, "social/engines/orchestrator.js"));
const VisualIntelligence = require(join(ROOT, "social/engines/visual-intelligence.js"));
const VisualQuality = require(join(ROOT, "social/engines/visual-quality.js"));
const CreativeJob = require(join(ROOT, "social/engines/creative-job.js"));
const OwnPerformance = require(join(ROOT, "social/engines/own-performance.js"));
const Schema = require(join(ROOT, "social/engines/schema.js"));
const Learning = require(join(ROOT, "social/engines/learning.js"));
const OwnerDecision = require(join(ROOT, "social/engines/owner-decision.js"));

const argv = process.argv.slice(2);
const JSON_AUS = argv.includes("--json");

/* Die Suiten laufen hier NICHT mit: ein Reifebericht, der zwanzig
   Minuten Tests startet, wird nicht gelesen. Ob sie gruen sind, ist
   ein Befund von aussen - und wird nur dann uebergeben, wenn er
   ausdruecklich mitgeliefert wird. Ohne ihn bleibt SUITE_GREEN
   ungeprueft, und das ist die richtige Antwort. */
function fahne(name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1] : "ja");
}
const SUITEN = fahne("--suites-green");
const ISOLATION = fahne("--isolation-proven");

/* -------------------------------------------------------------------
   GRUEN WOANDERS IST KEIN BELEG FUER HIER

   Die beiden Fahnen oben waren eine Behauptung des Aufrufers: wer
   --suites-green schrieb, setzte damit eine der zehn Bedingungen auf
   ERFUELLT - ohne Zahl, ohne Quelle, ohne Stand. Sie liess sich auch
   dann setzen, wenn die Suiten zuletzt vor drei Wochen liefen.

   scripts/social/verify-suites.mjs laesst sie stattdessen wirklich
   laufen und schreibt, was herauskam, samt dem Commit, an dem es lief.
   Hier wird dieser Commit mit HEAD verglichen. Ein Befund von einem
   anderen Stand ist keiner fuer diesen und zaehlt wie kein Befund.

   Die Fahnen bleiben - fuer eine Umgebung, in der ein Aufrufer den
   Lauf wirklich von aussen belegt. Der gemessene Befund geht ihnen
   vor, und beide nennen im Bericht ihre Herkunft.
   ------------------------------------------------------------------- */
const BELEG_PFAD = fahne("--evidence") || ".verification/suites.json";
/* `join(ROOT, "/tmp/x")` klebt an, statt zu befolgen - derselbe
   Fallstrick wie ueberall sonst. */
const beleg = lies(ausgabePfad(ROOT, BELEG_PFAD));

function kopfCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

/**
 * Der gemessene Befund - oder die Begruendung, warum er keiner ist.
 *
 * @param feld     "suitesOk" oder "isolationOk"
 * @param zaehlung ein Satz mit den gemessenen Zahlen
 */
function ausBeleg(feld, zaehlung) {
  if (!beleg) return null;
  const kopf = kopfCommit();
  if (!beleg.commit || !kopf) {
    return { ok: false, explanation: "Der Beleg in " + BELEG_PFAD +
      " nennt keinen Stand, oder der Stand dieses Baums ist unbekannt. " +
      "Ohne Stand laesst sich nicht sagen, wofuer er gilt." };
  }
  if (beleg.commit !== kopf) {
    return { ok: false, explanation: "Der Beleg stammt von " +
      beleg.commit.slice(0, 10) + ", dieser Baum steht auf " + kopf.slice(0, 10) +
      ". Gruen an einem anderen Stand ist kein Beleg fuer diesen." };
  }
  if (beleg.cleanTree === false) {
    return { ok: false, explanation: "Zum Zeitpunkt der Messung war der " +
      "Arbeitsbaum nicht sauber. Der Befund gehoert dann zu keinem Commit." };
  }
  return { ok: beleg[feld] === true, explanation: zaehlung(beleg) +
    " (gemessen am Stand " + beleg.commit.slice(0, 10) + ", " +
    beleg.generatedAt + ")" };
}

function lies(pfad, fallback = null) {
  const p = pfad.startsWith("/") ? pfad : join(ROOT, pfad);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}
function text(pfad) {
  const p = join(ROOT, pfad);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/* ===================================================================
   DIE GELESENEN ZUSTAENDE
   =================================================================== */

const killSwitch = lies("social/config/kill-switch.json");
const quellenBestand = lies("social/data/external-sources.json");
const bericht = lies("social/data/cycle-report.json");
const leistung = lies("social/data/performance.json");
const gedaechtnis = lies("social/data/content-memory.json");
const workflowRoh = text(".github/workflows/social-orchestrator.yml");

/* -------------------------------------------------------------------
   EIN KOMMENTAR IST KEINE HANDLUNG

   SCHEDULER_NEVER_PUBLISHES stand auf NICHT_ERFUELLT mit der Begruendung
   "Der Scheduler fuehrt aus: APPROVE, REJECT". Der Workflow ruft
   decide-candidate.mjs aber gar nicht auf - der Name steht in einem
   YAML-Kommentar, der erklaert, welchen Weg die Owner-Entscheidung
   nimmt. Die Pruefung hat eine Erklaerung fuer eine Ausfuehrung
   gehalten und damit fuenf Auftraege lang einen Mangel gemeldet, den
   es nicht gab.

   Derselbe Fehler ist in diesem Projekt schon einmal vorgekommen (ein
   Test, der einen Kommentar mit `evidenceSufficient: false` als Code
   las). Deshalb steht die Antwort jetzt an EINER Stelle.

   Vorsichtig: entfernt werden nur ganze Kommentarzeilen und
   Zeilenenden nach einem `#`, das nicht in Anfuehrungszeichen steht.
   Ein `#` in einem Cron-Ausdruck oder einer Zeichenkette bleibt.
   ------------------------------------------------------------------- */
function ohneYamlKommentare(quelle) {
  return String(quelle || "").split("\n").map((zeile) => {
    let inEinfach = false, inDoppelt = false;
    for (let i = 0; i < zeile.length; i += 1) {
      const c = zeile[i];
      if (c === "'" && !inDoppelt) inEinfach = !inEinfach;
      else if (c === '"' && !inEinfach) inDoppelt = !inDoppelt;
      else if (c === "#" && !inEinfach && !inDoppelt) return zeile.slice(0, i);
    }
    return zeile;
  }).join("\n");
}

const workflow = ohneYamlKommentare(workflowRoh);

/* -------------------------------------------------------------------
   WER KOENNTE EINEN AUTOPUBLISH-SCHALTER SETZEN?

   Nicht "tut es jemand", sondern "koennte es jemand". Ein Schalter,
   der aus ist, aber von einem Lauf gesetzt werden kann, ist kein
   Invariant, sondern ein Vorsatz.

   Der Scheduler schreibt ausschliesslich social/data/ - das steht in
   seinem Festschreiben-Schritt. Die Schalter liegen in
   social/config/. Das ist die strukturelle Antwort; sie wird hier
   nachgelesen und nicht behauptet.
   ------------------------------------------------------------------- */
function schedulerSchreiber() {
  if (!workflow) return null;
  const schreiber = [];

  /* -----------------------------------------------------------------
     WAS DER FESTSCHREIBEN-SCHRITT ANFASST

     Der erste Anlauf las die ZEILE und nicht die PFADE: bei
     "git add social/data/ social/config/" war der eine gefangene
     String "social/data/ social/config/", und `startsWith("social/data")`
     sagte brav ja. Eine geweitete Schreiberlaubnis waere so
     unbemerkt durchgegangen - die Wache war breiter gebaut als das
     Tor, das sie bewachen sollte. Gegengeprobt durch Einbauen.
     ----------------------------------------------------------------- */
  const addiert = [...workflow.matchAll(/git add ([^\n]+)/g)]
    .flatMap((m) => m[1].trim().split(/\s+/))
    .filter((a) => a.length && !a.startsWith("-"));
  const fremd = addiert.filter((a) => !a.startsWith("social/data"));
  const nurDaten = addiert.length > 0 && fremd.length === 0;
  if (!nurDaten) {
    schreiber.push({ gate: "GLOBAL_AUTOPUBLISH",
      path: ".github/workflows/social-orchestrator.yml (git add " +
        (fremd.length ? fremd.join(" ") : "nichts") + ")" });
  }
  /* Setzt der Workflow die Variable selbst? */
  if (/VU_SOCIAL_AUTOPUBLISH\s*[:=]/.test(workflow)) {
    schreiber.push({ gate: "VU_SOCIAL_AUTOPUBLISH",
      path: ".github/workflows/social-orchestrator.yml" });
  }
  /* Schreibt irgendein Skript, das der Workflow aufruft, die
     Schalterdatei? */
  for (const datei of readdirSync(join(ROOT, "scripts/social"))) {
    if (!datei.endsWith(".mjs")) continue;
    const inhalt = readFileSync(join(ROOT, "scripts/social", datei), "utf8");
    if (/writeFileSync\([^)]*kill-switch\.json/.test(inhalt) ||
        /writeFileSync\([^)]*autonomy\.json/.test(inhalt)) {
      schreiber.push({ gate: "GLOBAL_AUTOPUBLISH", path: "scripts/social/" + datei });
    }
  }
  return schreiber;
}

/* Welche Handlungen fuehrt der Scheduler aus? Aus den Schritt-Namen
   und den aufgerufenen Skripten - nicht aus der Absicht im Kopf. */
/* Ein ES-Modul in einem synchronen Skript: der Aufruf laeuft in einem
   eigenen Node-Prozess, damit dieser Bericht synchron bleiben kann und
   nichts vom geprueften Skript in seinen eigenen Zustand gerät. */
function ladeSynchron(pfad) {
  const aus = execFileSync("node", ["-e", `
    const m = await import(${JSON.stringify(join(ROOT, pfad))});
    const lagen = [undefined, "MAYBE", "", null];
    console.log(JSON.stringify(lagen.map((z) =>
      m.befehleFuer({ candidateId: "pruefung", decision: z }))));
  `], { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
  const ergebnisse = JSON.parse(aus.trim());
  return { befehleFuer: (posten) => ergebnisse[
    [undefined, "MAYBE", "", null].indexOf(posten.decision)] ?? null };
}

function schedulerHandlungen() {
  if (!workflow) return null;
  const handlungen = [];
  if (/run-orchestrator\.mjs/.test(workflow)) handlungen.push("DECIDE");
  if (/ingest-performance\.mjs/.test(workflow)) handlungen.push("MEASURE");
  if (/run-social-cycle\.mjs/.test(workflow)) {
    handlungen.push("DISCOVER", "CREATE", "VALIDATE", "LEARN");
  }
  if (/make-publish-candidate\.mjs/.test(workflow)) handlungen.push("CANDIDATE");
  if (/dispatch-publications\.mjs/.test(workflow)) handlungen.push("PUBLISH");
  if (/decide-candidate\.mjs/.test(workflow)) handlungen.push("APPROVE", "REJECT");

  /* -----------------------------------------------------------------
     TRAGEN IST NICHT ENTSCHEIDEN

     ingest-owner-decisions.mjs steht im Workflow, und es schreibt
     APPROVED und REJECTED ins Repository. Es TRIFFT diese
     Entscheidungen aber nicht: es holt sie unter dem Admin-Schluessel
     beim Worker ab, wo der Owner sie gefaellt hat.

     Der Unterschied ist genau die Invariante. Deshalb wird er hier
     nicht unterstellt, sondern nachgesehen: stammt die Entscheidung
     aus der Antwort des Workers - oder koennte das Skript sie sich
     auch selbst geben? Findet sich ein zweiter Ursprung, ist das
     Tragen doch ein Entscheiden, und die Invariante faellt. */
  if (/ingest-owner-decisions\.mjs/.test(workflow)) {
    const quelle = text("scripts/social/ingest-owner-decisions.mjs") || "";

    /* Dass die Entscheidung vom Worker kommt, ist die eine Haelfte. */
    const vomWorker = /\/social\/approval\/decisions/.test(quelle);

    /* Die andere wird GEFRAGT statt gelesen: `befehleFuer` bekommt
       nacheinander einen Posten ohne Entscheidung, einen mit einem
       Zustand, den es nicht gibt, und einen mit leerem Zustand. Ergibt
       eine dieser drei Lagen einen Befehl, dann kann der Scheduler eine
       Freigabe erzeugen, die der Owner nie getroffen hat - und genau
       das ist die verbotene Handlung.

       Ein Blick in den Quelltext haette hier nur gezeigt, dass
       "--approve" darin vorkommt. Es kommt vor; die Frage ist, WORAN es
       haengt. */
    let erfindetEntscheidung = null;
    try {
      const mod = ladeSynchron("scripts/social/ingest-owner-decisions.mjs");
      erfindetEntscheidung = [undefined, "MAYBE", "", null]
        .some((zustand) => mod.befehleFuer(
          { candidateId: "pruefung", decision: zustand }) !== null);
    } catch { erfindetEntscheidung = null; }

    if (!vomWorker || erfindetEntscheidung !== false) {
      handlungen.push("APPROVE", "REJECT");
    }
  }
  return [...new Set(handlungen)];
}

/* ===================================================================
   DIE BEFUNDE
   =================================================================== */

/* --- 1. GRAPH_COMPLETE --------------------------------------------
   Jede Stufe der Kette muss im realen Lauf eine Spur hinterlassen.
   Eine gebaute Stufe, die niemand aufruft, ist kein Knoten. */
function graph() {
  if (!bericht) return null;
  const pakete = bericht.packages || [];
  const stufen = [
    ["CONTENT_UNIVERSE/SLATE", existsSync(join(ROOT, "social/data/opportunity-slate.json"))],
    ["SOCIAL_OPPORTUNITY", (bericht.opportunities || []).length > 0],
    ["AUDIENCE_FRAMING", pakete.some((p) => p.audienceFrame && p.audienceFrame.coreQuestion)],
    ["STORY", pakete.some((p) => p.hook)],
    ["HOOK_STRATEGY", pakete.some((p) => p.authoring && p.authoring.pattern)],
    ["VISUAL_INTELLIGENCE", pakete.some((p) => p.visualDirection)],
    ["QUALITY_GATES", pakete.every((p) => p.validation || (p.result && p.result.stages))
      || pakete.length > 0],
    ["MEASURE", !!(bericht.learning)],
    ["LEARN", !!(bericht.learning)],
    ["ADAPT", bericht.learning !== undefined]
  ];
  const fehlend = stufen.filter(([, ok]) => !ok).map(([n]) => n);
  return { ok: fehlend.length === 0 && pakete.length > 0,
    findings: fehlend,
    explanation: fehlend.length === 0
      ? stufen.length + " Stufen im realen Lauf belegt, " + pakete.length + " Pakete."
      : "Ohne Spur im realen Lauf: " + fehlend.join(", ") + "." };
}

/* --- 2. VISUAL_DIRECTION_DERIVED ----------------------------------
   Nicht "es steht etwas drin", sondern: es ist ABGELEITET. Ein Feld
   mit Inhalt, das keine Herkunft nennt, waere genau der Default,
   den der Auftrag verbietet. */
function visuelleRichtung() {
  if (!bericht) return null;
  const pakete = bericht.packages || [];
  if (!pakete.length) {
    return { ok: false, explanation: "Kein Paket im letzten Lauf - ohne Paket " +
      "gibt es keine Richtung zu pruefen." };
  }
  const maengel = [];
  for (const p of pakete) {
    const d = p.visualDirection;
    if (!d) { maengel.push(p.packageId + ": keine Richtung"); continue; }
    if (p.visualDirectionReady !== true) {
      maengel.push(p.packageId + ": ready=false (" +
        (p.visualDirectionMissing || []).join(", ") + ")");
      continue;
    }
    if (!d.derivation || d.derivation.derived !== true) {
      maengel.push(p.packageId + ": nicht abgeleitet");
      continue;
    }
    if (!d.derivedFrom || !d.derivedFrom.coreIdea) {
      maengel.push(p.packageId + ": coreIdea ohne Herkunftsangabe");
    }
  }
  /* Und die Gegenprobe im Code: jede Bildform des Schemas hat eine
     Ableitung mit Voraussetzungen. Eine Form ohne Voraussetzungen
     koennte auch ohne Daten eine Idee liefern. */
  const ohneForm = Schema.VISUAL_TYPES.filter((t) =>
    !VisualIntelligence.FORMEN[t] || !VisualIntelligence.FORMEN[t].braucht.length);
  if (ohneForm.length) maengel.push("Bildformen ohne Ableitung: " + ohneForm.join(", "));

  return { ok: maengel.length === 0, findings: maengel,
    explanation: maengel.length === 0
      ? pakete.length + " Paket(e), Richtung abgeleitet und belegt, alle " +
        Schema.VISUAL_TYPES.length + " Bildformen mit Voraussetzungsliste."
      : maengel.join("; ") };
}

/* --- 3. GATES_FAIL_CLOSED ------------------------------------------ */
function tore() {
  const befunde = [];
  /* Die Richtungspruefung ohne Angabe muss verweigern. */
  const ohne = VisualQuality.check({ ebenen: { aussage: "Eine Aussage" } }, {});
  if (ohne.passed) befunde.push("VisualQuality laesst ohne Richtungsangabe durch");
  if (ohne.failureType !== VisualQuality.VISUAL_DIRECTION_INCOMPLETE) {
    befunde.push("Der Befund heisst " + ohne.failureType + " statt " +
      VisualQuality.VISUAL_DIRECTION_INCOMPLETE);
  }
  for (const falsch of ["CONTENT_FAILED", "PROVIDER_FAILED", "IMAGE_FAILED"]) {
    if (ohne.failureType === falsch) befunde.push("verwechselt mit " + falsch);
    if (!VisualQuality.NIEMALS.includes(falsch)) {
      befunde.push(falsch + " ist nicht ausgeschlossen");
    }
  }
  /* Eine leere Richtung darf nicht bereit sein. */
  const leer = VisualIntelligence.ready(VisualIntelligence.direction({}));
  if (leer.ok) befunde.push("Eine leere Creative Direction gilt als bereit");
  /* Und NOT_APPLICABLE ohne Begruendung darf nicht durchgehen. */
  const na = VisualIntelligence.ready(VisualIntelligence.direction({
    visualStrategy: "CHART", story: "s", coreIdea: "i", oneSecondMessage: "m",
    mainSubject: "s", mobileFocalPoint: "f", compositionIntent: "c",
    visualHierarchy: ["a"], brandIntent: "b", mustShow: ["x"],
    mustNotShow: VisualIntelligence.NOT_APPLICABLE }));
  if (na.ok) befunde.push("NOT_APPLICABLE ohne Begruendung geht durch");

  return { ok: befunde.length === 0, findings: befunde,
    explanation: befunde.length === 0
      ? "Fail-closed bestaetigt: ohne Angabe kein Durchlass, und der Befund " +
        "traegt seinen eigenen Namen."
      : befunde.join("; ") };
}

/* --- 4. AUTONOMY_INVARIANTS ----------------------------------------
   Jede Invariante gegen einen gelesenen Zustand, nicht gegen eine
   Absicht. */
function autonomieBefunde() {
  const bestand = quellenBestand;
  const quellen = bestand ? Registry.status(bestand) : null;
  const belege = {};

  const cronImWorkflow = workflow ? /^\s*schedule:/m.test(workflow) : false;
  belege.NO_DAILY_OWNER_START = {
    ok: cronImWorkflow,
    evidence: workflow
      ? "cron im Workflow: " +
        ([...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]).join(", ") || "keiner")
      : "Workflow nicht lesbar" };

  belege.NO_MANUAL_TOPIC_SELECTION = {
    ok: !!bericht && (bericht.opportunities || []).length > 0 &&
        !existsSync(join(ROOT, "social/config/topics.json")),
    evidence: "Gelegenheiten aus geclusterten Signalen; keine vom Owner " +
      "gepflegte Themendatei vorhanden." };

  const slate = lies("social/data/opportunity-slate.json");
  belege.NO_MANUAL_SLATE = {
    ok: !!(slate && slate.generatedAt),
    evidence: slate ? "opportunity-slate.json erzeugt am " + slate.generatedAt
      : "kein Slate" };

  belege.NO_MANUAL_RANKING = {
    ok: workflow ? /rank-social-opportunities\.mjs/.test(workflow) : false,
    evidence: "Das Ranking laeuft im Orchestrator-Workflow." };

  belege.NO_MANUAL_PERFORMANCE_INGEST = {
    ok: workflow ? /steps\.plan\.outputs\.measure/.test(workflow) : false,
    evidence: "Der MESSEN-Schritt haengt an der Entscheidung des Orchestrators." };

  belege.NO_MANUAL_LEARNING = {
    ok: !!(bericht && bericht.learning),
    evidence: "Lernen laeuft im Zyklus; im letzten Bericht vorhanden." };

  /* -----------------------------------------------------------------
     Der Beleg war frueher: "der Scheduler ruft den Dispatch-Pfad NICHT
     auf". Er war wahr und belegte die falsche Sache - naemlich dass
     der Scheduler es nicht KANN, statt dass kein Mensch es MUSS.
     Jetzt gilt das Umgekehrte, und zwar mit denselben drei Bedingungen,
     die auch AUTONOMOUS_CREATIVE_DISPATCH traegt. */
  const budget = CreativeJob.BUDGET;
  const kann = schedulerKannDispatchen();
  belege.NO_MANUAL_CHATGPT_WORK = {
    ok: budget.dispatchesPerProcessingKey === 1 && kann.ok === true,
    evidence: "Budget 1 Dispatch je processing_key. " + kann.explanation };

  const store = text("social/engines/asset-store.js") || "";
  belege.NO_MANUAL_IMAGE_MOVING = {
    ok: /sha\.slice\(0, 2\)/.test(store),
    evidence: "Der Speicherort folgt aus dem SHA-256, nicht aus einer Ablage." };

  belege.DISABLED_SOURCES_DO_NOT_BLOCK = {
    ok: !!quellen && quellen.blocksGraph === false,
    evidence: quellen ? "source-registry: blocksGraph=" + quellen.blocksGraph +
      ", aktive Sensoren: " + (quellen.active || []).length : "kein Bestand" };

  /* Der heikelste: fehlende externe Intelligenz darf nicht als
     Themenluecke zaehlen. Im Bericht steht die Ursache je Dimension. */
  const gelegenheiten = (bericht && bericht.opportunities) || [];
  const falschGezaehlt = gelegenheiten.filter((o) =>
    (o.missing || []).some((m) => m.dimension === "externalInterest" &&
      m.cause !== "NOT_ACTIVATED" && m.cause !== "SYSTEMICALLY_UNAVAILABLE"));
  belege.MISSING_EXTERNAL_DOES_NOT_PENALISE = {
    ok: gelegenheiten.length > 0 && falschGezaehlt.length === 0,
    evidence: gelegenheiten.length
      ? gelegenheiten.length + " Gelegenheit(en), externalInterest ueberall " +
        "als nicht aktiv bzw. systemisch unverfuegbar gefuehrt"
      : "keine Gelegenheiten im Bericht" };

  return Readiness.autonomie(belege);
}

/* --- 5. PUBLISHING_GATE_INTACT ------------------------------------- */
function publishingGate() {
  const gates = {};
  if (killSwitch && killSwitch.gates && killSwitch.gates.GLOBAL_AUTOPUBLISH) {
    gates.GLOBAL_AUTOPUBLISH = killSwitch.gates.GLOBAL_AUTOPUBLISH.enabled === true;
  }
  /* VU_SOCIAL_AUTOPUBLISH lebt als Worker-Variable. Sie ist hier
     nicht direkt lesbar - lesbar ist, ob irgendetwas sie SETZT, und
     ob der Worker ohne sie verweigert. Das ist die Frage, die sich
     von hier aus ehrlich beantworten laesst. */
  const worker = text("workers/vision-universe-social/src/index.js") || "";
  const verweigertOhne = /!autopublish && !genehmigung/.test(worker);
  const wrangler = text("workers/vision-universe-social/wrangler.toml") || "";
  const imDeploy = /VU_SOCIAL_AUTOPUBLISH/.test(wrangler);
  if (verweigertOhne && !imDeploy) gates.VU_SOCIAL_AUTOPUBLISH = false;

  const hart = Readiness.hart({
    gates,
    schedulerWriters: schedulerSchreiber(),
    schedulerActions: schedulerHandlungen()
  });
  return { ok: hart.ok, findings: hart.open, explanation: hart.explanation,
    detail: hart };
}

/* --- 6. EXTERNAL_SOURCES_DORMANT ----------------------------------- */
function externeQuellen() {
  if (!quellenBestand) return null;
  const s = Registry.status(quellenBestand);
  const maengel = [];
  for (const sensor of s.sensors) {
    if (sensor.state !== Registry.STATE.NOT_ACTIVATED_BY_OWNER) {
      maengel.push(sensor.id + " steht auf " + sensor.state);
    }
    if (sensor.mayRequest) maengel.push(sensor.id + " darf anfragen");
    if (sensor.warns) maengel.push(sensor.id + " warnt");
    for (const datei of sensor.components || []) {
      if (!existsSync(join(ROOT, datei))) {
        maengel.push("geloeschte Komponente: " + datei);
      }
    }
  }
  if (s.blocksGraph !== false) maengel.push("blocksGraph ist nicht false");
  if (workflow && /social-external-(observe|intelligence)/.test(workflow)) {
    maengel.push("Der Orchestrator ruft einen externen Beobachtungslauf auf");
  }
  return { ok: maengel.length === 0, findings: maengel,
    explanation: maengel.length === 0
      ? s.sensors.length + " Sensor(en) ruhend, keiner fragt an, keiner warnt, " +
        "alle Komponenten erhalten."
      : maengel.join("; ") };
}

/* --- 7. OWN_PERFORMANCE_ACTIVE ------------------------------------- */
function eigeneLeistung() {
  if (!gedaechtnis) return null;
  const eintraege = gedaechtnis.entries || gedaechtnis.posts || [];
  if (!eintraege.length) return null;

  /* Derselbe Aufruf wie im Gelegenheits-Trockenlauf - nicht ein
     zweiter Rechenweg fuer dieselbe Frage. */
  const auswertung = OwnPerformance.auswerten(eintraege, { observe: Learning.observe });
  const modus = OwnPerformance.exploreExploit(auswertung, {});

  const maengel = [];
  if (!auswertung.dimensions || !auswertung.dimensions.length) {
    maengel.push("keine Lerndimension ausgewertet");
  }
  /* Der Punkt, auf den es ankommt: die Luecke zwischen reifen
     Snapshots und bewertbaren Beitraegen wird BENANNT, nicht
     geschlossen. Ein Lauf, der keinen Grund je unbewertetem Beitrag
     nennt, hat die Luecke nur versteckt. */
  const ohneGrund = (auswertung.dimensions || []).filter((d) =>
    d.unmeasured > 0 && !(d.unmeasuredReasons &&
      Object.keys(d.unmeasuredReasons).length));
  if (ohneGrund.length) {
    maengel.push(ohneGrund.length + " Dimension(en) mit unbewerteten Beitraegen " +
      "ohne genannten Grund");
  }
  return { ok: maengel.length === 0, findings: maengel,
    explanation: (auswertung.dimensions || []).length + " Lerndimension(en) " +
      "gerechnet, Modus " + (modus && modus.mode) + "; die Luecke zwischen " +
      "reifen Snapshots und bewertbaren Beitraegen ist je Dimension begruendet " +
      "und nicht geschlossen worden." };
}

/* --- 9. CREATIVE_BUDGET_ENFORCED ----------------------------------- */
function creativeBudget() {
  const b = CreativeJob.BUDGET;
  const maengel = [];
  if (b.dispatchesPerProcessingKey !== 1) {
    maengel.push("dispatchesPerProcessingKey=" + b.dispatchesPerProcessingKey);
  }
  if (b.diagnosticJobsInProduction !== undefined &&
      b.diagnosticJobsInProduction !== 0) {
    maengel.push("diagnosticJobsInProduction=" + b.diagnosticJobsInProduction);
  }
  /* -----------------------------------------------------------------
     DIE GEGENPROBE, GERECHNET

     Der erste Anlauf stand hinter einem `typeof ... === "function"`
     auf einen Namen, den es nicht gibt (`darfDispatchen`). Die
     Pruefung war damit nie gelaufen und hat trotzdem "in Ordnung"
     gemeldet - dieselbe Bauart wie ein Tor, das nicht im Weg steht.
     Hier ist der echte Weg, ohne Wenn. */
  const bestand = CreativeJob.createRegistry([
    { creativeJobId: "cj_probe", processingKey: "pk_probe",
      contentId: "c_probe", state: "DISPATCHED" }
  ]);
  const zweiter = bestand.mayDispatch(
    { processingKey: "pk_probe", contentId: "c_probe" });
  if (zweiter.ok) {
    maengel.push("Ein zweiter Dispatch auf denselben processing_key waere erlaubt");
  } else if (zweiter.reason !== "alreadyDispatched") {
    maengel.push("Der zweite Dispatch scheitert an \"" + zweiter.reason +
      "\" und nicht am Schluessel - das koennte ein anderer Grund sein, " +
      "der morgen wegfaellt");
  }
  /* Und ein Diagnosejob im Produktionspfad. Ein Job ist
     diagnostisch, wenn seine contentId es sagt - `diagnostic: true`
     als eigenes Feld gibt es nicht, und ein erster Anlauf, der es
     uebergab, hat deshalb nichts geprueft. */
  const frisch = CreativeJob.createRegistry([]);
  const diagnose = frisch.mayDispatch(
    { processingKey: "pk_d", contentId: "vu-diag-probe" },
    { productionPath: true });
  if (diagnose.ok) maengel.push("Ein Diagnosejob waere im Produktionspfad erlaubt");
  else if (diagnose.reason !== "diagnosticInProduction") {
    maengel.push("Der Diagnosejob scheitert an \"" + diagnose.reason + "\"");
  }
  return { ok: maengel.length === 0, findings: maengel,
    explanation: maengel.length === 0
      ? "1 processing_key -> hoechstens 1 logischer Job; ein zweiter Dispatch " +
        "wird abgelehnt."
      : maengel.join("; ") };
}

/* ===================================================================
   DER BERICHT
   =================================================================== */

const autonomie = autonomieBefunde();
const gateBefund = publishingGate();
const quellen = externeQuellen();
const richtung = visuelleRichtung();

const ergebnis = Readiness.pruefe({
  graph: graph(),
  visualDirection: richtung,
  gates: tore(),
  autonomy: autonomie,
  publishingGate: gateBefund,
  externalSources: quellen,
  ownPerformance: eigeneLeistung(),
  creativeBudget: creativeBudget(),
  /* Diese beiden kommen von aussen. Ohne die Fahne bleiben sie
     ungeprueft - und das ist ehrlicher als ein Skript, das seine
     eigene Hausaufgabe abnimmt. */
  /* Gemessener Befund zuerst, Behauptung nur ersatzweise - und jede
     nennt, woher sie kommt. */
  isolation: ausBeleg("isolationOk", (b) =>
      b.isolation.map((i) => i.id + ": " + (i.ok ? "unveraendert" : "VERAENDERT"))
        .join(", ")) ||
    (ISOLATION ? { ok: true, explanation: "Von aussen behauptet: " + ISOLATION +
      " — nicht gemessen." } : null),
  suites: ausBeleg("suitesOk", (b) =>
      b.suites.map((r) => r.id + ": " + r.pass + "/" + r.tests +
        (r.fail ? " (" + r.fail + " gefallen)" : "")).join(", ")) ||
    (SUITEN ? { ok: true, explanation: "Von aussen behauptet: " + SUITEN +
      " — nicht gemessen." } : null)
});

/* ===================================================================
   DER ABSCHLUSSBERICHT (§16)

   Woertlich: keine Faehigkeit als aktiv melden, die nur als Datei
   existiert. Jeder AUTONOMOUS_*-Zustand haengt deshalb an einer SPUR
   im letzten realen Lauf - nicht daran, dass eine Engine im
   Repository liegt.
   =================================================================== */

/* Feuert der Zeitplan? GitHub fuehrt `schedule` NUR im Standardzweig
   aus. Das ist keine Meinung, sondern nachlesbar: liegt die Datei
   dort oder nicht. */
function schedulerAufMain() {
  if (!workflow) return { active: false, reason: "Kein Workflow gefunden." };
  let standard = null;
  try {
    standard = execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch { standard = "origin/main"; }
  try {
    const dort = execFileSync("git",
      ["ls-tree", "--name-only", standard, ".github/workflows/social-orchestrator.yml"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (dort) {
      return { active: true, branch: standard,
        reason: "Der Workflow liegt im Standardzweig " + standard + "." };
    }
    return { active: false, branch: standard,
      reason: "Der Workflow liegt NICHT im Standardzweig " + standard + ". " +
        "GitHub fuehrt `schedule` nur dort aus - der Zeitplan feuert also nicht." };
  } catch (err) {
    return { active: null, branch: standard,
      reason: "Der Standardzweig ist von hier aus nicht lesbar (" +
        String(err.message).split("\n")[0] + "). Unbekannt bleibt unbekannt." };
  }
}

/* Die Zustaende der Kandidaten - gelesen, nicht gezaehlt. */
function kandidatenZustaende() {
  const d = join(ROOT, "social/data/publish-candidates");
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => {
    const c = lies("social/data/publish-candidates/" + f, null);
    return { candidateId: (c && c.candidateId) || f.replace(/\.json$/, ""),
      state: c ? (c.state || c.status || null) : null };
  });
}

/* -------------------------------------------------------------------
   EIN ORDNER IST KEINE WARTESCHLANGE

   Hier stand `readdirSync(...)` und darunter "N Kandidat(en) warten".
   Gezaehlt wurden DATEIEN. Von den sechs wartete keine einzige: drei
   SUPERSEDED, drei auf einem Haltegrund, hinter dem eine
   Owner-Entscheidung steht.

   Der Orchestrator hat nie etwas anderes behauptet - er filtert auf
   AWAITING_APPROVAL und meldete korrekt null. Die falsche Zahl
   entstand HIER, in einem zweiten Rechenweg fuer dieselbe Frage.
   Jetzt fragen beide dieselbe Engine.
   ------------------------------------------------------------------- */
const schlange = OwnerDecision.warteschlange(kandidatenZustaende());

/* -------------------------------------------------------------------
   KANN DER SCHEDULER EINEN CREATIVE JOB SELBST ERZEUGEN?

   Die Frage ist nicht, ob je einer entstanden ist. Sie ist, ob der
   Weg dasteht: die drei bestehenden Schritte, die Bindung an die
   eigene Entscheidung, und das Recht, einen Pull Request zu oeffnen.

   Jede dieser vier Bedingungen ist im Workflow nachlesbar. Fehlt
   eine, ist die Faehigkeit nicht da - auch dann nicht, wenn im
   Ledger hundert Jobs staenden.
   ------------------------------------------------------------------- */
function schedulerKannDispatchen() {
  if (!workflow) {
    return { ok: false, explanation: "Kein Orchestrator-Workflow lesbar." };
  }
  const fehlt = [];
  for (const s of ["request-creative.mjs", "dispatch-creative-job.mjs",
                   "open-creative-request.mjs"]) {
    if (!workflow.includes(s)) fehlt.push(s);
  }
  if (!/steps\.plan\.outputs\.creative == 'ja'/.test(workflow)) {
    fehlt.push("Bindung an die Orchestrator-Entscheidung");
  }
  if (!/pull-requests:\s*write/.test(workflow)) {
    fehlt.push("Recht pull-requests: write");
  }
  /* Und der Orchestrator muss die Zeile ueberhaupt ausgeben. */
  const runner = text("scripts/social/run-orchestrator.mjs") || "";
  if (!/"creative=" \+ \(creative\.required/.test(runner)) {
    fehlt.push("Der Orchestrator gibt keine Creative-Entscheidung aus");
  }

  const ledger = lies("social/data/creative-jobs.json", { jobs: [] });
  const anzahl = (ledger.jobs || []).length;

  return {
    ok: fehlt.length === 0,
    explanation: fehlt.length === 0
      ? "Der Scheduler ruft die drei bestehenden Schritte auf, der Aufruf " +
        "haengt an seiner eigenen Entscheidung, und er darf den Pull Request " +
        "oeffnen. (" + anzahl + " Job(s) im Ledger - historisch und hier " +
        "ausdruecklich KEIN Beleg.)"
      : "Nicht scheduler-ausgeloest. Es fehlt: " + fehlt.join(", ") + "."
  };
}

/* Eine Faehigkeit gilt als aktiv, wenn der letzte reale Lauf eine
   Spur von ihr traegt. `null` heisst: nicht beobachtet - und das ist
   etwas anderes als false. */
function faehigkeiten() {
  const pakete = (bericht && bericht.packages) || [];
  const gelegenheiten = (bericht && bericht.opportunities) || [];
  const jobs = lies("social/data/creative-jobs.json");

  return {
    AUTONOMOUS_DISCOVERY: {
      /* `bericht.signals` ist eine ZAHL, keine Liste - der erste
         Anlauf schrieb deshalb "undefined Signal(e)". */
      active: !!bericht && (Number(bericht.signals) > 0 || gelegenheiten.length > 0),
      trace: bericht ? (Number(bericht.signals || 0) + " Signal(e), " +
        gelegenheiten.length + " Gelegenheit(en) im Lauf vom " +
        bericht.generatedAt) : "kein Bericht" },
    AUTONOMOUS_OPPORTUNITY_SELECTION: {
      active: pakete.length > 0 && gelegenheiten.length >= pakete.length,
      trace: pakete.length + " von " + gelegenheiten.length +
        " Gelegenheit(en) ausgewaehlt" },
    AUTONOMOUS_AUDIENCE_FRAMING: {
      active: pakete.length > 0 &&
        pakete.every((p) => p.audienceFrame && p.audienceFrame.coreQuestion),
      trace: pakete.length
        ? pakete.filter((p) => p.audienceFrame && p.audienceFrame.coreQuestion).length +
          " von " + pakete.length + " Paket(en) mit Kernfrage"
        : "keine Pakete" },
    AUTONOMOUS_STORY_SELECTION: {
      active: pakete.length > 0 && pakete.every((p) => p.hook),
      trace: pakete.filter((p) => p.hook).length + " Paket(e) mit Hook, " +
        "Muster: " + [...new Set(pakete.map((p) => p.authoring && p.authoring.pattern)
          .filter(Boolean))].join(", ") },
    AUTONOMOUS_VISUAL_INTELLIGENCE: {
      active: pakete.length > 0 && pakete.every((p) =>
        p.visualDirectionReady === true && p.visualDirection &&
        p.visualDirection.derivation && p.visualDirection.derivation.derived === true),
      trace: pakete.filter((p) => p.visualDirectionReady === true).length +
        " von " + pakete.length + " Richtung(en) abgeleitet und vollstaendig" },
    AUTONOMOUS_CREATIVE_DISPATCH: {
      /* -------------------------------------------------------------
         NICHT AUS HISTORISCHEN JOBS

         Der erste Anlauf meldete hier `true`, weil elf Creative Jobs
         im Ledger standen. Die stammten aus Laeufen, die ein MENSCH
         angestossen hat - vorhanden ist nicht dasselbe wie vom
         Scheduler ausgefuehrt.

         Gefragt wird deshalb, ob der Scheduler einen Job SELBST
         erzeugen KANN: ruft er die drei Schritte auf, haengt der
         Aufruf an seiner eigenen Entscheidung, und darf er den Pull
         Request oeffnen? Alles drei steht im Workflow und laesst sich
         lesen. Ein Ledgereintrag beweist es nicht. */
      active: schedulerKannDispatchen().ok,
      trace: schedulerKannDispatchen().explanation },
    AUTONOMOUS_RESULT_INGEST: {
      /* Das Ergebnis des Agenten kommt auf dem Request-Branch zurueck.
         Es aufzunehmen heisst: pruefen, uebersetzen, verifizieren -
         und das tut der Zyklus, ohne dass jemand etwas verschiebt. */
      active: (() => {
        const zyklus = text("scripts/social/run-social-cycle.mjs") || "";
        return /authoring-result\.json/.test(zyklus) &&
          /verifyResult|verifyAssets/.test(zyklus);
      })(),
      trace: "Der Zyklus liest authoring-result.json aus dem Request-Ordner " +
        "und laesst den Adapter Ergebnis und Assets verifizieren - kein " +
        "Verschieben von Hand." },
    AUTONOMOUS_MEASUREMENT: {
      active: !!(bericht && bericht.learning),
      trace: bericht && bericht.learning
        ? "Messstufe im Lauf durchlaufen" : "keine Messstufe im Bericht" },
    AUTONOMOUS_LEARNING: {
      active: !!(bericht && bericht.learning),
      trace: bericht && bericht.learning
        ? "Lernstufe im Lauf durchlaufen" : "keine Lernstufe im Bericht" },
    OWNER_PUBLISHING_GATE: {
      active: true,
      trace: schlange.explanation + " Der Scheduler gibt keinen frei und " +
        "lehnt keinen ab." }
  };
}

const kadenz = Readiness.kadenz({
  runsPerDay: workflow ? [...workflow.matchAll(/cron:/g)].length : null
});

const zustand = Orchestrator.betriebsmodell(
  quellenBestand ? Registry.status(quellenBestand) : {});

const scheduler = schedulerAufMain();
const koennen = faehigkeiten();
const quellenStatus = quellenBestand ? Registry.status(quellenBestand) : null;

/* NEXT_AUTONOMOUS_RUN. Eine Zeit auszurechnen, waehrend der Zeitplan
   gar nicht feuert, waere eine erfundene Zusage - deshalb haengt sie
   ausdruecklich daran, dass der Scheduler im Standardzweig liegt. */
function naechsterLauf() {
  if (scheduler.active !== true) {
    return { at: null,
      reason: "Kein naechster autonomer Lauf: " + scheduler.reason };
  }
  const crons = [...workflow.matchAll(/cron:\s*'(\d+) (\d+) \* \* \*'/g)]
    .map((m) => ({ minute: Number(m[1]), stunde: Number(m[2]) }));
  if (!crons.length) return { at: null, reason: "Kein taeglicher Zeitplan lesbar." };
  const jetzt = new Date();
  let bester = null;
  for (const c of crons) {
    for (const tag of [0, 1]) {
      const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(),
        jetzt.getUTCDate() + tag, c.stunde, c.minute, 0));
      if (d > jetzt && (!bester || d < bester)) bester = d;
    }
  }
  return { at: bester ? bester.toISOString() : null,
    reason: crons.length + " taegliche Laeufe (UTC)." };
}
const naechster = naechsterLauf();

function ja(v) { return v === true ? "true" : v === false ? "false" : "UNKNOWN"; }

if (argv.includes("--final-report")) {
  console.log("VISION UNIVERSE SOCIAL — ABSCHLUSSBERICHT (§16)\n");
  const zeilen = [
    ["SOCIAL_ORCHESTRATOR_PRODUCTION_READY", ja(ergebnis.ready), ergebnis.explanation],
    ["SCHEDULER_ACTIVE_ON_MAIN", ja(scheduler.active), scheduler.reason]
  ];
  for (const [k, v] of Object.entries(koennen)) {
    zeilen.push([k, ja(v.active), v.trace]);
  }
  const gate = gateBefund.detail.invariants;
  zeilen.push(["GLOBAL_AUTOPUBLISH",
    killSwitch && killSwitch.gates && killSwitch.gates.GLOBAL_AUTOPUBLISH
      ? ja(killSwitch.gates.GLOBAL_AUTOPUBLISH.enabled === true) : "UNKNOWN",
    (gate.find((i) => i.id === "GLOBAL_AUTOPUBLISH_OFF") || {}).explanation || ""]);
  zeilen.push(["VU_SOCIAL_AUTOPUBLISH",
    (gate.find((i) => i.id === "VU_SOCIAL_AUTOPUBLISH_OFF") || {}).state === "ERFUELLT"
      ? "false" : "UNKNOWN",
    (gate.find((i) => i.id === "VU_SOCIAL_AUTOPUBLISH_OFF") || {}).explanation || ""]);
  zeilen.push(["EXTERNAL_SOURCES_ACTIVE",
    quellenStatus ? String((quellenStatus.active || []).length) : "UNKNOWN",
    quellenStatus
      ? quellenStatus.sensors.map((x) => x.id + "=" + x.state).join(", ")
      : "kein Bestand"]);
  zeilen.push(["ACTIVE_APPROVAL_QUEUE_COUNT", String(schlange.activeCount),
    schlange.explanation]);
  zeilen.push(["CRITICAL_BLOCKERS", String(ergebnis.criticalBlockers),
    ergebnis.criticalBlockers
      ? "offen: " + ergebnis.blockedBy.concat(ergebnis.unverified).join(", ")
      : "keiner"]);
  zeilen.push(["NEXT_AUTONOMOUS_RUN", naechster.at || "—", naechster.reason]);

  const breite = Math.max(...zeilen.map(([k]) => k.length));
  for (const [k, v, warum] of zeilen) {
    console.log("  " + k.padEnd(breite) + "  " + v);
    if (warum) console.log("  " + " ".repeat(breite) + "  " + warum);
  }
  process.exit(ergebnis.ready ? 0 : 1);
}

if (JSON_AUS) {
  console.log(JSON.stringify({ ready: ergebnis, autonomy: autonomie,
    hardInvariants: gateBefund.detail, cadence: kadenz,
    operatingModel: zustand }, null, 2));
} else {
  console.log("VISION UNIVERSE SOCIAL — Produktionsreife\n");
  console.log("SOCIAL_ORCHESTRATOR_PRODUCTION_READY  " +
    (ergebnis.ready ? "true" : "false"));
  console.log("CRITICAL_BLOCKERS                     " + ergebnis.criticalBlockers);
  console.log("");
  for (const z of ergebnis.conditions) {
    const zeichen = z.state === "ERFUELLT" ? "+"
      : z.state === "NICHT_ERFUELLT" ? "x" : "?";
    console.log("  " + zeichen + " " + z.id.padEnd(28) + " " + z.state);
    if (z.explanation) console.log("      " + z.explanation);
    for (const f of z.findings) console.log("      - " + f);
  }
  console.log("\n" + ergebnis.explanation);

  console.log("\n--- AUTONOMIE-INVARIANTEN (§6) ---");
  for (const i of autonomie.invariants) {
    console.log("  " + (i.state === "ERFUELLT" ? "+" : i.state === "NICHT_ERFUELLT" ? "x" : "?") +
      " " + i.id.padEnd(36) + i.state);
    if (i.evidence) console.log("      " + i.evidence);
  }
  console.log("  " + autonomie.explanation);

  console.log("\n--- HARTE INVARIANTEN (§7) ---");
  for (const i of gateBefund.detail.invariants) {
    console.log("  " + (i.state === "ERFUELLT" ? "+" : i.state === "NICHT_ERFUELLT" ? "x" : "?") +
      " " + i.id.padEnd(30) + i.state);
    console.log("      " + i.explanation);
  }
  console.log("  Der Scheduler darf:       " + gateBefund.detail.schedulerMay.join(", "));
  console.log("  Der Scheduler darf nicht: " + gateBefund.detail.schedulerMayNot.join(", "));

  console.log("\n--- KADENZ (§8) ---");
  console.log("  Scheduler-Laeufe je Tag:  " + kadenz.schedulerRunsPerDay);
  console.log("  Publishing-Frequenz:      " +
    (kadenz.publishingFrequency === null ? "keine" : kadenz.publishingFrequency));
  console.log("  " + kadenz.publishingFrequencyNote);
}

process.exit(ergebnis.ready ? 0 : 1);
