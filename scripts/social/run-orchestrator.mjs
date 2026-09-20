/* =========================================================================
   VISION UNIVERSE SOCIAL — scripts/social/run-orchestrator.mjs

   WAS IST JETZT DRAN?

   Dieses Skript liest den tatsaechlichen Zustand und fragt
   `orchestrator.js`, was zu tun ist. Es fuehrt selbst nichts aus - die
   Stufen laufen als eigene Schritte im Workflow, damit jede fuer sich
   scheitern und wiederholt werden kann.

   Es erzeugt keinen Beitrag, gibt nichts frei und veroeffentlicht
   nichts. Es sagt, was der naechste Schritt ist.

   Ausfuehren:
     node scripts/social/run-orchestrator.mjs
     node scripts/social/run-orchestrator.mjs --github-output
   ========================================================================= */
import { readFileSync, existsSync, readdirSync, appendFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Orchestrator = require(join(ROOT, "social/engines/orchestrator.js"));
const Registry = require(join(ROOT, "social/engines/source-registry.js"));
const MessFenster = require(join(ROOT, "social/engines/measurement-window.js"));
const Job = require(join(ROOT, "social/engines/creative-job.js"));
const EvidencePackage = require(join(ROOT, "social/engines/evidence-package.js"));
const Kadenz = require(join(ROOT, "social/engines/content-cadence.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
import * as VisualDaten from "./visual-data.mjs";

const DATA = "social/data";
const KANDIDATEN = join(DATA, "publish-candidates");

/* Zustaende, in denen ein Kandidat auf einen MENSCHEN wartet. Alles
   andere ist entschieden oder ueberholt und blockiert nichts. */
const WARTET = ["AWAITING_APPROVAL"];

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/** Kandidaten, die auf die Owner-Entscheidung warten. */
export function wartendeKandidaten(verzeichnis) {
  const d = verzeichnis || join(ROOT, KANDIDATEN);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const c = readJson(join(d, f), null);
      return c ? { candidateId: c.candidateId || f.replace(/\.json$/, ""),
        state: c.state || c.status || null, file: f } : null;
    })
    .filter((c) => c && WARTET.includes(c.state));
}

/**
 * Beitraege, deren Messfenster faellig ist.
 *
 * Gefragt wird die bestehende Fensterlogik, nicht eine zweite hier.
 */
export function faelligeMessungen(perf, nowIso) {
  const zeilen = (perf && perf.snapshots) || [];
  return zeilen.filter((z) => {
    const s = z.snapshot || {};
    if (s.state === "UNAVAILABLE") return false;
    try {
      return MessFenster.dueForRemeasurement(
        { capturedAt: s.capturedAt, ageHours: s.ageHours, window: s.window },
        { now: nowIso }) === true;
    } catch { return false; }
  }).map((z) => ({ mediaId: z.mediaId, window: z.window }));
}

/** Der letzte Zeitpunkt, an dem ein Kandidat entstand. */
export function letzterKandidat(verzeichnis) {
  const d = verzeichnis || join(ROOT, KANDIDATEN);
  if (!existsSync(d)) return null;
  const dateien = readdirSync(d).filter((f) => f.endsWith(".json"));
  if (!dateien.length) return null;
  let neuester = null;
  for (const f of dateien) {
    const c = readJson(join(d, f), null);
    const t = (c && (c.createdAt || c.generatedAt)) ||
      statSync(join(d, f)).mtime.toISOString();
    if (!neuester || t > neuester) neuester = t;
  }
  return neuester;
}

/**
 * Wann heute Kandidaten entstanden sind.
 *
 * `letzterKandidat()` beantwortet "wann zuletzt" und genuegte, solange
 * ein Tag genau einen Kandidaten trug. Die Tagesabsicht fragt etwas
 * anderes: WIE VIELE heute schon da sind. Aus "zuletzt um 14 Uhr"
 * laesst sich das nicht erschliessen - es koennte der erste oder der
 * zweite gewesen sein.
 *
 * Gezaehlt wird der Kalendertag in UTC, weil auch die Kadenz-Engine
 * ihn so zaehlt. Zwei Tagesbegriffe waeren zwei Tage.
 */
export function kandidatenHeute(nowIso, verzeichnis) {
  const d = verzeichnis || join(ROOT, KANDIDATEN);
  if (!existsSync(d)) return [];
  const tag = String(nowIso || "").slice(0, 10);
  const out = [];
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) {
    const c = readJson(join(d, f), null);
    const t = (c && (c.createdAt || c.generatedAt)) || null;
    if (t && String(t).slice(0, 10) === tag) out.push(t);
  }
  return out.sort();
}

/* =====================================================================
   DER CREATIVE-JOB-BEDARF — AUS ECHTEN ZUSTAENDEN

   Die Entscheidung selbst trifft orchestrator.js. Hier wird nur
   zusammengetragen, was sie braucht, und zwar aus dem, was wirklich
   dasteht: dem Ranking, der Platte, dem Job-Register und dem
   bestehenden Hinlaenglichkeitstor.

   WARUM DAS THEMA AUS DEM RANKING KOMMT

   Ein fest verdrahtetes Symbol waere eine manuelle Themenauswahl mit
   zusaetzlichen Schritten - genau die Owner-Handlung, die hier
   verschwinden soll. Gewaehlt wird, was die Gelegenheitsbewertung
   oben hat.
   ===================================================================== */

/**
 * Das hoechstbewertete Thema, fuer das ein technisches Bundle existiert.
 *
 * Gelesen werden die GELEGENHEITEN des letzten Laufs - also das
 * Ergebnis der Bewertung, die der Graph ohnehin vornimmt. Ein
 * eigenes Ranking hier waere ein zweiter Rechenweg fuer dieselbe
 * Frage, und der erste, der vom anderen abweicht, gewinnt per Zufall.
 *
 * Der erste Anlauf las stattdessen das Opportunity-Slate und zog
 * Symbole aus `entities`. Dort stehen aber KLARNAMEN ("Valero
 * Energy"), keine Kuerzel - die Suche fand null Bundles und meldete
 * stillschweigend "kein Thema". Ein Fehler, der wie eine Entscheidung
 * aussah.
 */
export function bestesThema(root) {
  const r = root || ROOT;
  const bericht = readJson(join(r, DATA, "cycle-report.json"), null);
  const gelegenheiten = (bericht && bericht.opportunities) || [];

  const brauchbar = gelegenheiten
    .filter((o) => o && o.proposable !== false)
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  for (const o of brauchbar) {
    const symbol = VisualDaten.symbolAus(o.topic);
    if (!symbol) continue;
    if (existsSync(join(r, "quant/data/technical/instruments", symbol + ".json"))) {
      return { symbol, topicId: o.opportunityId || null, score: o.score || null,
        topic: o.topic };
    }
  }
  return null;
}

/**
 * Braucht dieser Lauf einen Creative Job?
 *
 * Gibt die Entscheidung von orchestrator.js zurueck, angereichert um
 * das, was der Dispatch danach braucht (Symbol, content_id).
 */
export function creativeBedarf(z, options) {
  options = options || {};
  const r = options.root || ROOT;
  const thema = options.thema !== undefined ? options.thema : bestesThema(r);

  if (!thema) {
    return Object.assign(Orchestrator.creativeJobDecision({
      halted: z.halted, candidateDue: options.candidateDue === true,
      contentId: null }), { symbol: null });
  }

  /* Die Kennung wird nicht geraten - sie kommt aus derselben Funktion,
     die der Zyklus benutzt, um das Ergebnis spaeter wiederzufinden. */
  const bundlePfad = join(r, "quant/data/technical/instruments", thema.symbol + ".json");
  let paket = null;
  try {
    const roh = JSON.parse(readFileSync(bundlePfad, "utf8"));
    paket = EvidencePackage.fromTechnicalBundle(roh.bundle,
      { entity: thema.symbol, source: roh.bundle.source, now: z.now });
  } catch { paket = null; }

  if (!paket) {
    return Object.assign(Orchestrator.creativeJobDecision({
      halted: z.halted, candidateDue: options.candidateDue === true,
      contentId: null }), { symbol: thema.symbol });
  }

  const contentId = EvidencePackage.contentIdFor(thema.symbol, paket.asOf);
  const hinreichend = EvidencePackage.assessSufficiency(paket);

  /* Liegt schon ein Ergebnis auf der Platte? */
  const ergebnis = join(r, ChatGptWork.requestDir(contentId), "authoring-result.json");

  /* Offene Jobs und die Vorpruefung - beide aus creative-job.js, nicht
     hier nachgebaut. */
  const register = readJson(join(r, DATA, "creative-jobs.json"), { jobs: [] });
  const registry = Job.createRegistry(register.jobs || []);
  const offen = registry.byContent(contentId).filter(
    (j) => Job.OFFEN.includes(j.state));
  /* Und alle offenen Jobs ueberhaupt - siehe die Begruendung in
     orchestrator.js: die anbieterinterne Wiederholung ist von hier aus
     nicht beschraenkbar, also hoechstens einer gleichzeitig. */
  const alleOffen = (register.jobs || []).filter(
    (j) => Job.OFFEN.includes(j.state));
  const tor = registry.mayDispatchContent({ contentId }, { productionPath: true });

  const e = Orchestrator.creativeJobDecision({
    halted: z.halted,
    candidateDue: options.candidateDue === true,
    contentId,
    hasAuthoringResult: existsSync(ergebnis),
    openJobs: offen,
    allOpenJobs: alleOffen,
    evidenceSufficient: hinreichend.sufficient === true,
    dispatchGate: tor
  });

  return Object.assign(e, {
    symbol: thema.symbol,
    asOf: paket.asOf,
    sufficiency: hinreichend.explanation
  });
}

export function zustand(options) {
  options = options || {};
  const now = options.now || new Date().toISOString();
  const perf = readJson(join(ROOT, DATA, "performance.json"), null);
  const health = readJson(join(ROOT, DATA, "health.json"), null);

  /* Ein Schalter, den man uebergehen kann, ist keiner - also wird er
     gelesen, bevor irgendetwas anderes entschieden wird. */
  const angehalten = !!(health && health.killSwitch &&
    health.killSwitch.engaged === true);

  const wartend = wartendeKandidaten();
  /* Dieselbe Zaehlung wie in creativeBedarf(): das rohe Register, nach
     Job.OFFEN gefiltert. Ein zweiter Weg, offene Jobs zu zaehlen, waere
     ein zweiter Begriff von "offen". */
  const register = readJson(join(ROOT, DATA, "creative-jobs.json"), null);
  const offeneJobs = ((register && register.jobs) || [])
    .filter((j) => Job.OFFEN.includes(j.state)).length;

  return {
    now,
    halted: angehalten,
    haltReason: angehalten ? (health.killSwitch.reason || "Kill Switch aktiv") : null,
    awaitingCandidates: wartend,
    dueMeasurements: faelligeMessungen(perf, now),
    lastPreparedAt: letzterKandidat(),
    lastMeasuredAt: (perf && perf.generatedAt) || null,

    /* Was die Kadenz-Engine braucht. Sie zaehlt nicht selbst nach -
       sie bekommt den Zustand, den dieses Skript ohnehin ermittelt. */
    candidatesToday: kandidatenHeute(now),
    lastCandidateAt: letzterKandidat(),
    activeApprovalQueue: wartend.length,
    openCreativeJobs: offeneJobs
  };
}

/** Die Kadenzentscheidung zu einem Zustand. Eine Stelle, ein Weg. */
export function kadenz(z) {
  return Kadenz.entscheide(z,
    readJson(join(ROOT, "social/config/cadence.json"), null));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const z = zustand({});
  const k = kadenz(z);
  const h = Orchestrator.naechsteHandlung(z, { cadence: k });
  const quellen = Registry.status(
    readJson(join(ROOT, DATA, "external-sources.json"), null));
  const modell = Orchestrator.betriebsmodell(quellen);

  console.log("VISION UNIVERSE SOCIAL — Orchestrator\n");
  console.log("Zeitpunkt        : " + z.now);
  console.log("Angehalten       : " + z.halted + (z.haltReason ? " (" + z.haltReason + ")" : ""));
  console.log("Wartende Kandidaten: " + z.awaitingCandidates.length +
    (z.awaitingCandidates.length
      ? " (" + z.awaitingCandidates.map((c) => c.candidateId).join(", ") + ")" : ""));
  console.log("Faellige Messungen : " + z.dueMeasurements.length);
  console.log("Letzter Kandidat   : " + (z.lastPreparedAt || "—"));
  console.log("Letzte Messung     : " + (z.lastMeasuredAt || "—"));
  console.log("Externe Sensoren   : " + quellen.externalIntelligence +
    " (" + quellen.dormantCount + " ruhend, " + quellen.activeCount + " aktiv)");

  const creative = creativeBedarf(z, {
    candidateDue: h.stage === "PREPARE_CANDIDATE" });

  console.log("\n--- CONTENT CADENCE (§8/§17) ---");
  console.log("Tag              : " + k.lage.tag +
    "   (Absicht " + k.lage.tagesabsicht.min + "–" + k.lage.tagesabsicht.max +
    ", Regime " + k.lage.regime + ")");
  console.log("Heute erzeugt    : " + k.lage.heuteErzeugt +
    "   naechster waere der " + k.lage.ordinal + ".");
  console.log("Abstand          : " +
    (k.lage.abstand.stundenSeitLetztem === null ? "kein Vorgaenger"
      : k.lage.abstand.stundenSeitLetztem + " h seit dem letzten") +
    "   (mindestens " + k.lage.abstand.mindestens + " h)");
  console.log("Darf erzeugen    : " + (k.darfErzeugen ? "ja" : "nein" +
    (k.grund ? "  — " + k.grund : "")));
  if (k.naechsteFruehestens) {
    console.log("Fruehestens      : " + k.naechsteFruehestens);
  }

  const sp = Kadenz.spannung(
    readJson(join(ROOT, "social/config/cadence.json"), null));
  if (sp.gemessen && sp.gespannt) {
    console.log("Spannung         : " + sp.erzeugungProWoche + " Kandidaten/Woche " +
      "moeglich, " + sp.publishingDachProWoche + " Beitraege/Woche erlaubt");
    console.log("                   " + sp.erklaerung);
  }

  console.log("\nStufe            : " + h.stage);
  console.log(h.explanation);

  console.log("\n--- CREATIVE JOB (§3) ---");
  console.log("Thema            : " + (creative.symbol || "—") +
    (creative.contentId ? "  (" + creative.contentId + ")" : ""));
  console.log("Entscheidung     : " + creative.decision);
  console.log(creative.explanation);
  if (h.actions.length) {
    console.log("\nAuszufuehren:");
    h.actions.forEach((a) => console.log("  " + a.stage.padEnd(20) + a.reason));
  }

  console.log("\n--- BETRIEBSMODELL ---");
  console.log("  Automatisch (" + modell.automatic.length + " Stufen):");
  modell.automatic.forEach((x) => console.log("    " + x));
  console.log("  Nur der Owner:");
  modell.ownerOnly.forEach((x) => console.log("    " + x));
  console.log("  Niemals automatisch: " + modell.neverAutomatic.join(", "));
  console.log("  Braucht eine externe Quelle: " + modell.requiresExternalSource);

  if (args.includes("--github-output") && process.env.GITHUB_OUTPUT) {
    const zeilen = [
      "stage=" + h.stage,
      "measure=" + (h.actions.some((a) => a.stage === "MEASURE") ? "ja" : "nein"),
      "prepare=" + (h.stage === "PREPARE_CANDIDATE" ? "ja" : "nein"),
      "awaiting=" + (h.awaitingOwner ? "ja" : "nein"),
      /* Der Dispatch haengt an dieser Zeile - und nur an ihr. Ein
         Scheduler-Lauf erzeugt keinen Creative Job, nur weil er
         laeuft. */
      "creative=" + (creative.required ? "ja" : "nein"),
      "creative_symbol=" + (creative.symbol || ""),
      "creative_content_id=" + (creative.contentId || ""),
      "creative_reason=" + (creative.code || "REQUIRED")
    ].join("\n") + "\n";
    appendFileSync(process.env.GITHUB_OUTPUT, zeilen);
  }
}
