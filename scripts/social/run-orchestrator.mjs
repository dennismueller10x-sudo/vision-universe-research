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
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, statSync, mkdirSync } from "node:fs";
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
const NoPost = require(join(ROOT, "social/engines/no-post.js"));
const Leiter = require(join(ROOT, "social/engines/content-ladder.js"));
const Harte = require(join(ROOT, "social/engines/hard-invariants.js"));
const RunLease = require(join(ROOT, "social/engines/run-lease.js"));
const FrequenzLernen = require(join(ROOT, "social/engines/frequency-learning.js"));
const ManualMode = require(join(ROOT, "social/engines/manual-mode.js"));
const ChatGptWork = require(join(ROOT, "social/providers/authoring/chatgpt-work/adapter.js"));
import * as VisualDaten from "./visual-data.mjs";
import { ausgabePfad } from "../quality/out-path.mjs";

/* -------------------------------------------------------------------
   DAS DATENVERZEICHNIS DES LAUFS

   Es war eine Konstante, und damit las dieses Skript immer die
   Produktionsdaten - auch aus einem Test heraus. Lesen allein ist
   harmlos; pruefen laesst sich damit aber nichts, denn ein Test kann
   keinen anderen Zustand herstellen, ohne den echten zu veraendern
   (§42).

   Der Vorgabewert bleibt `social/data`: im Betrieb aendert sich
   nichts. */
const DATA = (() => {
  const i = process.argv.indexOf("--data");
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : "social/data";
})();
/* Derselbe absolute-Pfad-Fallstrick wie ueberall: `join(ROOT, "/tmp/x")`
   klebt an, statt zu befolgen. `ausgabePfad` beantwortet die Frage
   einmal fuer alle. */
const DATEN = ausgabePfad(ROOT, DATA);
const KANDIDATEN = join(DATEN, "publish-candidates");

/* Zustaende, in denen ein Kandidat auf einen MENSCHEN wartet. Alles
   andere ist entschieden oder ueberholt und blockiert nichts. */
const WARTET = ["AWAITING_APPROVAL"];

function readJson(p, f) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; }
  catch { return f; }
}

/** Kandidaten, die auf die Owner-Entscheidung warten. */
export function wartendeKandidaten(verzeichnis) {
  const d = verzeichnis || KANDIDATEN;
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
  const d = verzeichnis || KANDIDATEN;
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
  const d = verzeichnis || KANDIDATEN;
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
  const bericht = readJson(join(r === ROOT ? DATEN : ausgabePfad(r, DATA), "cycle-report.json"), null);
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
/* -------------------------------------------------------------------
   DAS THEMA DES OWNERS AUF EIN INSTRUMENT ABBILDEN (§30)

   `bestesThema()` liefert kein Wort, sondern ein Instrument mit
   Belegen: {symbol, topicId, score, topic}. Der freie Text aus dem
   Formular ist etwas anderes, und ihn einfach durchzureichen haette
   einen Auftrag erzeugt, der an `thema.symbol` ins Leere laeuft.

   Abgebildet wird mit derselben Funktion, die der Zyklus benutzt, und
   das Ergebnis muss ein Bundle auf der Platte haben. Findet sich
   keines, entsteht NICHTS - und der Lauf sagt, dass zu diesem Thema
   keine Evidenz liegt. Einen Gegenstand erfindet kein Knopf (§4).

   -----------------------------------------------------------------
   EINE PLATTEN-UEBERSCHRIFT IST KEIN INSTRUMENT - UND TROTZDEM OK

   "Staerkste Aktien im Dow Jones" hat kein Kuerzel und kein Bundle;
   ohne diese Pruefung meldete diese Funktion KEIN_INSTRUMENT_ERKANNT
   und der Aufrufer (kWirksam weiter unten) hielt die Warteschlangen-
   Aufhebung deshalb fuer nicht ausfuehrbar - obwohl run-social-
   cycle.mjs (themaVomOwner(), dieselbe Reihenfolge) genau so einen
   Titel laengst als eigenstaendiges, bereits kuratiertes Thema
   erkennt. Ein realer Lauf mit exakt diesem Titel dispatchte deshalb
   nichts: VORBEREITEN wurde uebersprungen, WIRKSAM blieb "darf
   erzeugen nein".

   Die Platte wird deshalb, wie dort, ZUERST auf einen exakten Titel
   geprueft. Ein Treffer traegt `symbol: null` - es gibt kein
   Instrument, also keinen Creative-Job-Dispatch dafuer (creativeBedarf()
   liest ein fehlendes Bundle bereits als "kein Inhaltsobjekt", ohne
   Sonderfall), aber `ok: true` haelt kWirksam offen: der Auftrag ist
   ausfuehrbar, run-social-cycle.mjs baut den Kandidaten direkt aus der
   Platte. */
export function themaDesOwners(text, root, platteThemen) {
  const r = root || ROOT;
  const titelTreffer = (platteThemen || []).find((t) =>
    t && t.title && t.title.trim().toLowerCase() === String(text || "").trim().toLowerCase());
  if (titelTreffer) {
    return { ok: true, thema: { symbol: null, topicId: titelTreffer.topicId,
      score: null, topic: titelTreffer.title, herkunft: "PLATTE" } };
  }

  const symbol = VisualDaten.symbolAus(text);
  if (!symbol) {
    return { ok: false, grund: "KEIN_INSTRUMENT_ERKANNT",
      erklaerung: "Aus \"" + String(text || "") + "\" laesst sich weder eine " +
        "Platten-Ueberschrift noch ein Instrument lesen. Erwartet wird der " +
        "exakte Titel einer Reihe oder ein Kuerzel am Ende, etwa " +
        "\"Rechenzentren NVDA\"." };
  }
  const bundle = join(r, "quant/data/technical/instruments", symbol + ".json");
  if (!existsSync(bundle)) {
    return { ok: false, grund: "KEINE_EVIDENZ_ZU_DIESEM_THEMA", symbol,
      erklaerung: "Zu " + symbol + " liegt kein technisches Bundle vor. Ohne " +
        "Beleg entsteht kein Beitrag - auf Knopfdruck genauso wenig." };
  }
  return { ok: true, thema: { symbol, topicId: null, score: null,
    topic: String(text), herkunft: "OWNER" } };
}

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
  const register = readJson(join(r === ROOT ? DATEN : ausgabePfad(r, DATA), "creative-jobs.json"), { jobs: [] });
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
  const perf = readJson(join(DATEN, "performance.json"), null);
  const health = readJson(join(DATEN, "health.json"), null);

  /* Ein Schalter, den man uebergehen kann, ist keiner - also wird er
     gelesen, bevor irgendetwas anderes entschieden wird. */
  const angehalten = !!(health && health.killSwitch &&
    health.killSwitch.engaged === true);

  const wartend = wartendeKandidaten();
  /* Dieselbe Zaehlung wie in creativeBedarf(): das rohe Register, nach
     Job.OFFEN gefiltert. Ein zweiter Weg, offene Jobs zu zaehlen, waere
     ein zweiter Begriff von "offen". */
  /* -------------------------------------------------------------------
     GEZAEHLT ODER NICHT GEZAEHLT - UND NIE DAZWISCHEN

     `readJson(..., null)` gab frueher fuer BEIDE Faelle null zurueck:
     fuer das Register, das es noch nicht gibt (dann sind null Jobs
     offen, und das stimmt), und fuer das Register, das da ist und
     sich nicht lesen laesst (dann weiss niemand, wie viele offen
     sind). Die Zeile darunter machte aus beidem eine 0 - und 0 offene
     Jobs heisst: bau einen neuen.

     MAX_OPEN_CREATIVE_JOBS = 1 waere damit genau dann aufgehoben
     gewesen, wenn die Datei kaputt ist. Hier wird deshalb zuerst
     gefragt, OB es das Register gibt.
     ------------------------------------------------------------------- */
  const registerPfad = join(DATEN, "creative-jobs.json");
  const registerDa = existsSync(registerPfad);
  const register = registerDa ? readJson(registerPfad, null) : { jobs: [] };
  const offeneJobs = register
    ? ((register.jobs) || []).filter((j) => Job.OFFEN.includes(j.state)).length
    /* Da, aber nicht lesbar: null heisst UNBEKANNT, und die Kadenz-Engine
       haelt darauf an (CREATIVE_JOB_COUNT_UNKNOWN). */
    : null;

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

/* =====================================================================
   WARUM HEUTE KEIN BEITRAG ENTSTAND (§13–§16)

   Der Lauf hat zwei Haelften, und beide liegen schon vor: die
   Kadenzentscheidung dieses Skripts und der Suchnachweis, den der
   Zyklus in seinen Bericht schreibt. Zusammengelegt ergeben sie die
   Antwort auf die Frage, die ein Owner wirklich stellt - nicht "hat
   es gelaufen", sondern "was habt ihr gesucht und warum nichts
   genommen".

   Hier wird nichts nachgerechnet. Diese Funktion liest zwei
   vorhandene Nachweise und uebergibt sie der Engine, die beurteilt,
   ob sie zusammen einen ergeben.
   ===================================================================== */
export function keinBeitragNachweis(z, k, root) {
  const r = root || ROOT;
  const bericht = readJson(join(r === ROOT ? DATEN : ausgabePfad(r, DATA), "cycle-report.json"), null);
  return NoPost.beurteile({
    now: z.now,
    laufVom: (bericht && bericht.generatedAt) || null,
    /* Wieviele Pakete der letzte Zyklus gebaut hat. Fehlt der Bericht,
       steht hier 0 - und der Nachweis wird genau deshalb unvollstaendig
       ausfallen, statt einen leeren Tag zu behaupten. */
    erzeugt: ((bericht && bericht.packages) || []).length,
    kadenz: k,
    leiter: (bericht && bericht.ladder) || null,
    ablehnungen: (bericht && bericht.rejections) || [],
    platte: bericht && bericht.slate
      ? { ok: bericht.slate.ok, grund: bericht.slate.grund,
          erklaerung: bericht.slate.erklaerung, themen: bericht.slate.themen }
      : null
  });
}

/* =====================================================================
   DIE LEASE EINES LAUFS (§5/§27–§31)

   Sie liegt im Datenverzeichnis wie jeder andere Zustand, damit der
   naechste Lauf sie sieht - der Workflow schreibt social/data ohnehin
   nach jedem Lauf fest.

   WAS HIER NICHT PASSIERT: keine Tageszaehler, keine
   Abstandszeitpunkte, kein Portfolio-Zustand werden angefasst (§38).
   Diese drei Dinge gehoeren der Kadenz, und JETZT PRUEFEN darf die Uhr
   ueberspringen, aber keine Grenze.
   ===================================================================== */
const LEASE_DATEI = () => join(DATEN, "orchestrator-lease.json");

export function leaseLesen() {
  return readJson(LEASE_DATEI(), null);
}

function leaseSchreiben(l) {
  mkdirSync(DATEN, { recursive: true });
  writeFileSync(LEASE_DATEI(), JSON.stringify(l, null, 2) + "\n");
}

/**
 * Die Lease nehmen - oder begruendet nicht.
 *
 * Gibt IMMER eine Antwort zurueck; ein Lauf ohne Lease darf weiter
 * messen und berichten. Verwehrt ist nur das Produktive.
 */
export function leaseNehmen(runId, options) {
  const o = options || {};
  const now = o.now || new Date().toISOString();
  const vorhanden = leaseLesen();
  const urteil = RunLease.pruefe(vorhanden, { now, runId });
  if (!urteil.darfArbeiten) return { genommen: false, urteil, lease: vorhanden };
  const lease = RunLease.nimm({ now, runId, takenBy: o.takenBy || null });
  leaseSchreiben(lease);
  return { genommen: true, urteil, lease };
}

/** Die Lease zurueckgeben. `produktiv` entscheidet ueber die Abklingzeit. */
export function leaseZurueck(runId, produktiv, options) {
  const o = options || {};
  const now = o.now || new Date().toISOString();
  const vorhanden = leaseLesen();
  /* Eine fremde Lease gibt niemand zurueck - sonst hebt ein Lauf die
     Sperre eines anderen auf, und die Sperre waere keine. */
  if (vorhanden && vorhanden.runId && runId && String(vorhanden.runId) !== String(runId)) {
    return { zurueck: false, grund: "FREMDE_LEASE", lease: vorhanden };
  }
  const lease = RunLease.gib(vorhanden || RunLease.nimm({ now, runId }),
    { now, produktiv: produktiv === true });
  leaseSchreiben(lease);
  return { zurueck: true, grund: null, lease };
}

/** Die Kadenzentscheidung zu einem Zustand. Eine Stelle, ein Weg. */
export function kadenz(z) {
  return Kadenz.entscheide(z,
    readJson(join(ROOT, "social/config/cadence.json"), null));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  /* -------------------------------------------------------------------
     DIE LEASE ALS EIGENER AUFRUF

     Sie steht VOR allem anderen: ein Lauf, der die Lease nicht
     bekommt, soll das erfahren, bevor er irgendetwas anderes tut -
     und der Workflow soll seine produktiven Schritte daran haengen
     koennen, ohne den ganzen Bericht zu lesen.
     ------------------------------------------------------------------- */
  const flagWert = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
  };

  if (args.includes("--lease-claim")) {
    const runId = flagWert("--lease-claim") || process.env.GITHUB_RUN_ID || null;
    const r = leaseNehmen(runId, { takenBy: flagWert("--von") || null });
    console.log("VISION UNIVERSE SOCIAL — Lauf-Lease");
    console.log("Lauf             : " + (runId || "ohne Kennung"));
    console.log("Produktiv erlaubt: " + (r.genommen ? "ja" : "nein"));
    console.log("Grund            : " + r.urteil.grund);
    console.log("Erklaerung       : " + r.urteil.erklaerung);
    if (r.urteil.wartetBis) console.log("Fruehestens      : " + r.urteil.wartetBis);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT,
        "produktiv_erlaubt=" + (r.genommen ? "true" : "false") + "\n" +
        "lease_grund=" + r.urteil.grund + "\n");
    }
    /* Kein Fehlercode: eine verwehrte Lease ist eine Antwort und kein
       Fehlschlag. Der Workflow liest die Ausgabe. */
    process.exit(0);
  }

  if (args.includes("--lease-release")) {
    const runId = flagWert("--lease-release") || process.env.GITHUB_RUN_ID || null;
    const produktiv = args.includes("--produktiv");
    const r = leaseZurueck(runId, produktiv);
    console.log("Lease zurueck    : " + (r.zurueck ? "ja" : "nein — " + r.grund));
    console.log("Produktiv gewesen: " + (produktiv ? "ja" : "nein"));
    process.exit(0);
  }

  const z = zustand({});
  const k = kadenz(z);

  /* -------------------------------------------------------------------
     §28-§30 — WELCHER DER DREI KNOEPFE DIESEN LAUF ANGESTOSSEN HAT

     Der Scheduler nennt keinen Modus; dann ist es der Zeitplan, und
     der hebt nichts auf. Ein Owner-Auftrag hebt die UHR auf - die
     Tagesobergrenze, den Mindestabstand, die eigene Warteschlange -
     und kein Tor. Was aufhebbar ist, steht in manual-mode.js, und nur
     dort: der Worker kennt nur die Namen der drei Knoepfe, damit die
     Regel nicht zweimal existiert.

     Das Urteil steht HIER und nicht weiter unten im Bericht. Ein
     aufgehobener Grund, den `naechsteHandlung()` nie zu sehen bekommt,
     waere ein Knopf, der meldet "ich darf" und nichts tut - genau die
     Sorte Tor, die in diesem Projekt schon mehrfach neben dem Weg
     stand.

     `k` selbst bleibt unveraendert: die Kadenz hat gesagt, was sie zu
     sagen hat, und ein Auftrag schreibt ihre Antwort nicht um. Was
     weiterreist, ist eine ABGELEITETE Lage, die mitfuehrt, wodurch sie
     abgeleitet wurde.
     ------------------------------------------------------------------- */
  const modusRoh = process.env.VU_SOCIAL_MODUS || "";
  const themaRoh = process.env.VU_SOCIAL_THEMA || "";
  const auftrag = modusRoh
    ? ManualMode.auftrag({ modus: modusRoh, thema: themaRoh || null })
    : null;
  const manuell = auftrag && auftrag.ok
    ? ManualMode.anwenden(auftrag.modus, k) : null;

  /* Bei POST ZU THEMA muss der Gegenstand zuerst auf eine Platten-
     Ueberschrift oder ein Instrument mit Belegen abgebildet werden.
     Gelingt keines von beiden, ist der Auftrag nicht ausfuehrbar - und
     das ist ein Befund, keine Ausrede. Dieselbe Platte, die
     run-social-cycle.mjs::themaVomOwner() prueft - hier nur gelesen,
     nicht neu gebaut. */
  const platteFuerThema = (auftrag && auftrag.ok && auftrag.thema)
    ? readJson(join(DATEN, "opportunity-slate.json"), { topics: [] }) : null;
  const ownerThema = (auftrag && auftrag.ok && auftrag.thema)
    ? themaDesOwners(auftrag.thema, ROOT, platteFuerThema.topics) : null;

  const kWirksam = (manuell && manuell.darfErzeugen && !k.darfErzeugen &&
      !(ownerThema && !ownerThema.ok))
    ? Object.assign({}, k, {
        darfErzeugen: true, grund: null,
        aufgehobenDurch: manuell.modus,
        aufgehobenerGrund: manuell.aufgehoben,
        erklaerung: manuell.erklaerung })
    : k;

  const h = Orchestrator.naechsteHandlung(z, { cadence: kWirksam });
  const quellen = Registry.status(
    readJson(join(DATEN, "external-sources.json"), null));
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
    candidateDue: h.stage === "PREPARE_CANDIDATE",
    /* Bei POST ZU THEMA nennt der Owner den Gegenstand. Sonst waehlt
       die Gelegenheitsbewertung wie bisher - `undefined` heisst hier
       ausdruecklich "wie immer" und nicht "kein Thema". */
    thema: ownerThema ? (ownerThema.ok ? ownerThema.thema : null) : undefined });

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

  console.log("\n--- ANLASS DIESES LAUFS (§28-§30) ---");
  if (!modusRoh) {
    console.log("Anlass           : ZEITPLAN — kein Owner-Auftrag, die Uhr gilt.");
  } else if (!auftrag.ok) {
    console.log("Anlass           : ABGELEHNT (" + auftrag.grund + ")");
    console.log("Warum            : " + auftrag.erklaerung);
  } else {
    console.log("Anlass           : " + auftrag.label +
      (auftrag.thema ? "  — Thema: " + auftrag.thema : ""));
    console.log("Auftrag          : " +
      (auftrag.istProduktionsauftrag ? "ja" : "nein (§28)"));
    console.log("Wirkung          : " + manuell.erklaerung);
    if (manuell.aufgehoben) {
      console.log("Aufgehoben       : " + manuell.aufgehoben +
        "   (nur die Uhr; kein Tor, keine Freigabe)");
    }
  }
  if (ownerThema) {
    console.log("Thema abgebildet : " + (ownerThema.ok
      ? ownerThema.thema.symbol + "  (Bundle vorhanden)"
      : "NEIN — " + ownerThema.grund + ": " + ownerThema.erklaerung));
  }
  console.log("Wirksam          : darf erzeugen " +
    (kWirksam.darfErzeugen ? "ja" : "nein") +
    (kWirksam.aufgehobenDurch ? "  (durch " + kWirksam.aufgehobenDurch + ")" : ""));


  /* --------------------------------------------------- §13–§16 */
  const nachweis = keinBeitragNachweis(z, k);
  console.log("\n--- WARUM (K)EIN BEITRAG (§13-§16) ---");
  console.log("Zustand          : " + nachweis.zustand +
    (nachweis.grund ? "  (" + nachweis.grund + ")" : ""));
  console.log("Nachweis         : " + (nachweis.vollstaendig === null
    ? "nicht gefragt — es ist etwas entstanden"
    : nachweis.vollstaendig ? "vollstaendig"
      : "UNVOLLSTAENDIG — fehlt: " + nachweis.fehlendeTeile.join(", ")));
  console.log("Letzter Lauf     : " + (nachweis.nachweis.laufVom || "—"));
  console.log("Gesucht          : " + (nachweis.nachweis.gesucht ? "ja"
    : "nein — " + (nachweis.nachweis.warumNichtGesucht || "kein Suchnachweis im Bericht")));
  if (nachweis.nachweis.suche) {
    const su = nachweis.nachweis.suche;
    console.log("Suche            : " + su.familienGefragtAnzahl + " Familien, " +
      su.themenGeprueft + " Themen geprueft, Stufe " + su.stufeErreicht +
      ", " + su.gefunden + " belegt");
    console.log("Nicht gefragt    : " + (su.nichtGefragt.length
      ? su.nichtGefragt.map((n) => n.stufe + " " + n.id).join(", ")
      : "keine Stufe — die Leiter wurde ganz durchgefragt"));
  }
  if (nachweis.nachweis.tore.abgelehnt) {
    console.log("An den Toren     : " + Object.entries(nachweis.nachweis.tore.jeStufe)
      .map(([st, n]) => n + "x " + st).join(", "));
  }
  console.log("Fuer den Owner   : " + nachweis.erklaerung);

  /* --------------------------------------------------- §35–§37 */
  const gedaechtnis = readJson(join(DATEN, "content-memory.json"), null);
  const fl = FrequenzLernen.zustand((gedaechtnis && gedaechtnis.entries) || [],
    { now: z.now });
  console.log("\n--- FREQUENZ AUS EIGENER LEISTUNG (§35-§37) ---");
  for (const [name, w] of Object.entries(fl.werte)) {
    console.log("  " + name.padEnd(26) +
      (w.value === null ? "—" : String(w.value).slice(0, 9)).padEnd(11) +
      "n=" + String(w.sampleSize).padEnd(4) +
      (w.belastbar ? "belastbar" : "unter der Mindeststichprobe"));
  }
  for (const b of fl.beobachtungen) {
    console.log("  Beobachtung: " + b.satz);
    /* Der zweite Satz reist IMMER mit. Wer die Zahl ohne ihn
       weitergibt, gibt etwas anderes weiter. */
    console.log("  Nicht gesagt: " + b.nichtGesagt);
  }
  for (const e of fl.entscheidungen) {
    console.log("  " + e.id.padEnd(20) +
      (e.empfehlung === null ? "keine Empfehlung" : String(e.empfehlung)));
  }

  /* --------------------------------------------------- §7-§13
     DIE VERFASSUNG, VOR DER STUFENENTSCHEIDUNG GEDRUCKT

     Sie steht hier und nicht in einem Kommentar, weil ein leerer Tag
     genau an dieser Stelle gelesen wird. Wer ihn erklaert bekommt,
     soll zugleich sehen, WELCHE der beiden Groessen knapp war - das
     Angebot ist es bei fuenfzehn Familien und einer redaktionellen
     Stufe naemlich nie. */
  const cfg = readJson(join(ROOT, "social/config/cadence.json"), null);
  const vf = Kadenz.verfassung({
    leiterStufen: Leiter.LEITER.length,
    familien: Leiter.alleFamilien().length,
    ideationStufe: (Leiter.LEITER.find((x) => x.ideation) || {}).stufe,
    maxOpenCreativeJobs: Harte.SOLL.MAX_OPEN_CREATIVE_JOBS,
    offeneCreativeJobs: z.openCreativeJobs,
    aktiveFreigaben: z.activeApprovalQueue,
    dailyIntentMax: (cfg && cfg.contentCreation || {}).dailyIntentMax,
    maxPostsPer7Days: cfg && cfg.maxPostsPer7Days
  });
  console.log("\n--- ANGEBOT UND KAPAZITAET (§7-§13) ---");
  console.log("Content Supply   : " + vf.contentSupply.modell +
    "   (" + vf.contentSupply.familien + " Familien, " +
    vf.contentSupply.leiterStufen + " Leiterstufen, die letzte fragt " +
    "redaktionell: " + (vf.contentSupply.letzteStufeIstIdeation ? "ja" : "NEIN") + ")");
  console.log("Publishing Cap.  : " + vf.publishingCapacity.modell +
    "   (offene Creative Jobs " +
    (vf.publishingCapacity.offeneCreativeJobs === null ? "unbekannt"
      : vf.publishingCapacity.offeneCreativeJobs) +
    " von " + vf.publishingCapacity.maxOpenCreativeJobs +
    ", wartende Freigaben " + vf.publishingCapacity.aktiveFreigaben +
    ", Dach " + vf.publishingCapacity.maxPostsPer7Days + "/Woche)");
  if (nachweis.grund) {
    const kl = Kadenz.grundZulaessig(nachweis.grund,
      { vollstaendigGesucht: !!(nachweis.nachweis.suche &&
          nachweis.nachweis.suche.vollstaendig) });
    console.log("Grund gehoert zu : " + (kl.klasse || "unbekannt"));
  }
  console.log(vf.erklaerung);

  const sp = Kadenz.spannung(cfg);
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
      /* Der Anlass reist bis in die Workflow-Ausgabe: ohne ihn liesse
         sich hinterher nicht unterscheiden, ob ein Beitrag aus dem
         Zeitplan oder aus einem Auftrag entstanden ist. */
      "modus=" + (auftrag && auftrag.ok ? auftrag.modus : "ZEITPLAN"),
      "auftrag=" + (auftrag && auftrag.ok && auftrag.istProduktionsauftrag ? "ja" : "nein"),
      "darf_erzeugen=" + (kWirksam.darfErzeugen ? "ja" : "nein"),
      "uhr_aufgehoben=" + (kWirksam.aufgehobenerGrund || ""),
      "creative_symbol=" + (creative.symbol || ""),
      "creative_content_id=" + (creative.contentId || ""),
      "creative_reason=" + (creative.code || "REQUIRED")
    ].join("\n") + "\n";
    appendFileSync(process.env.GITHUB_OUTPUT, zeilen);
  }
}
