/* =========================================================================
   VISION UNIVERSE — ingest-tiingo.mjs   (Phase 4A, §11, §12, §13)

   Holt Tageskurse von Tiingo, prueft sie und legt sie ab.

   WO DAS LAEUFT: serverseitig. Der Schluessel kommt aus der Umgebung und
   verlaesst sie nie. Vision Universe wird statisch ausgeliefert; ein
   Schluessel im Browser waere ein oeffentlicher Schluessel.

   Drei Betriebsarten, die sich in einem Punkt unterscheiden - wie viel
   Kontingent sie kosten:

     --initial      Erstimport ab dem konfigurierten Startdatum.
                    Teuer: eine Anfrage je Titel, volle Historie.
     (Standard)     Inkrementell. Holt je Titel nur die Tage seit dem
                    letzten gespeicherten Stand. Billig, aber nicht
                    kostenlos - eine Anfrage je Titel bleibt.
     --dry-run      Zeigt, was passieren wuerde. Kostet nichts.

   Der Lauf ist fortsetzbar. Bricht er bei Titel 7 von 12 ab, macht der
   naechste bei 8 weiter - nicht bei 1. Bei 50 Anfragen pro Stunde ist das
   kein Komfort, sondern die Voraussetzung dafuer, dass ein groesserer
   Import ueberhaupt durchlaeuft.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/ingest-tiingo.mjs --initial
     TIINGO_API_KEY=... node scripts/market/ingest-tiingo.mjs
     node scripts/market/ingest-tiingo.mjs --dry-run
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPreviewConfig, resolveScope, expandPreviewConfig } from "./preview-scope.mjs";
import { publishDiscoverSeries } from "./publish-discover-series.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const Semantics = require(join(engines, "price-semantics.js"));
const EodGate = require(join(engines, "market-eod-gate.js"));
const RejectionLifecycle = require(join(engines, "rejection-lifecycle.js"));
const MarketStore = require(join(engines, "market-store.js"));
const DisplayPolicy = require(join(engines, "display-policy.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const CONFIG = JSON.parse(
  readFileSync(join(root, "quant", "config", "tiingo-universe.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const INITIAL = args.has("--initial");
// Opt-in only. No production scheduler is enabled until durable restore and
// provider revision/corporate-action reconciliation have their own evidence.
const STRICT_INCREMENTAL = args.has("--strict-incremental");
if (STRICT_INCREMENTAL && INITIAL) throw Error("STRICT_INCREMENTAL_FORBIDS_INITIAL");
const PUBLISH = args.has("--publish");
/* Phase 5, Golden Five: eine eigene, eng begrenzte Auslieferung neben
   --publish (das oeffentliche, weiterhin gesperrte Gate). Siehe
   quant/config/development-preview.json fuer die Titel-Allowlist und die
   Begruendung - dieser Pfad ist keine zweite, lockerere Kopie von
   --publish, sondern verlangt seine eigene, eng begrenzte Erlaubnis. */
const PUBLISH_PREVIEW = args.has("--publish-preview");
const PREVIEW_CONFIG_PATH = join(root, "quant", "config", "development-preview.json");
/* --scope-from-preview: das Universum des Laufs ist der in
   development-preview.json freigegebene Umfang - eine Tickerliste oder
   ein ganzes Gate-Universum -, nicht das zwoelf Titel grosse Testset.
   Damit holt EIN Lauf genau die Titel, die auch ausgeliefert werden
   duerfen: 5 heute, 498 oder 7.000, sobald der Eigentuemer den Umfang
   aendert. Requests je Lauf = Titel im Umfang. */
const SCOPE_FROM_PREVIEW = args.has("--scope-from-preview");
/* --commercial: Kontingente des Commercial-Zugangs (providers/tiingo/
   adapter.js#COMMERCIAL_LIMITS) statt der Free-Grenzen. Das ganze
   Produktuniversum passt nicht in 50 Anfragen je Stunde; dieselbe
   Umschaltung, die run-scale-gate.mjs benutzt - kein zweiter Adapter. */
const COMMERCIAL = args.has("--commercial") || process.env.TIINGO_PLAN === "commercial";
const REQUEST_BUDGET = parseInt((process.argv.find((a) => a.startsWith("--request-budget=")) || "").slice(17), 10) || 0;
const CONCURRENCY = parseInt((process.argv.find((a) => a.startsWith("--concurrency=")) || "").slice(14), 10) || 0;
const PREVIEW_SCOPE = (PUBLISH_PREVIEW || SCOPE_FROM_PREVIEW)
  ? resolveScope(root, JSON.parse(readFileSync(PREVIEW_CONFIG_PATH, "utf8"))) : null;
const SECURITIES = SCOPE_FROM_PREVIEW
  ? PREVIEW_SCOPE.securities.map((s) => Object.assign({}, s, { mic: s.mic || null }))
  : CONFIG.securities;
const apiKey = process.env.TIINGO_API_KEY || null;
/* Die Gates kommen aus derselben Datei, die auch der Browser liest.
   Zwei Quellen fuer dieselbe Frage waeren zwei Antworten: der Import
   koennte Intraday holen, das die Seite nie zeigen darf, oder umgekehrt.
   Die Umgebung darf nur zusaetzlich abschalten, nie zusaetzlich
   freischalten - eine Freigabe bleibt ein Commit mit Begruendung. */
const GATE_CONFIG = JSON.parse(
  readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8"));
const gatesAusDatei = DisplayPolicy.gatesFromConfig(GATE_CONFIG);
const gatesAusUmgebung = DisplayPolicy.gatesFromEnv(process.env);
const gates = {};
Object.keys(DisplayPolicy.GATES).forEach((name) => {
  const inUmgebung = process.env[name] !== undefined;
  gates[name] = inUmgebung
    ? (gatesAusDatei[name] && gatesAusUmgebung[name])
    : gatesAusDatei[name];
});

const OUT_DIR = join(root, "quant", "data", "market");
const STATUS_FILE = join(OUT_DIR, "tiingo-status.json");

/**
 * Was der Statusbericht ueber Freigaben sagt (§27).
 *
 * Der Bericht ist die einzige Auskunft, die der Browser ueber die
 * Datenlage bekommt - er wird statisch ausgeliefert, es gibt keinen
 * Dienst, den man fragen koennte. Also muss darin stehen, was jemand
 * wissen muss, um das Gezeigte einzuordnen: nicht nur was da ist,
 * sondern woher es kommen darf.
 */
function policySnapshot() {
  const klassen = ["marketData", "intraday", "realtime", "corporateActions"];
  const out = {};
  klassen.forEach((klasse) => {
    const intern = DisplayPolicy.check({
      providerId: Tiingo.PROVIDER_ID, dataClass: klasse, audience: "internal",
      form: klasse === "realtime" ? "realtime" : "raw", gates
    });
    const oeffentlich = DisplayPolicy.check({
      providerId: Tiingo.PROVIDER_ID, dataClass: klasse, audience: "public",
      form: klasse === "realtime" ? "realtime" : "raw", gates
    });
    const richtlinie = DisplayPolicy.lookup(Tiingo.PROVIDER_ID, klasse);
    out[klasse] = {
      internal: { allowed: intern.allowed, reason: intern.reason, message: intern.message },
      public: { allowed: oeffentlich.allowed, reason: oeffentlich.reason,
                message: oeffentlich.message },
      basis: richtlinie.basis, checkedAt: richtlinie.checkedAt
    };
  });
  return out;
}

function gateSnapshot() {
  const out = {};
  Object.keys(DisplayPolicy.GATES).forEach((name) => {
    out[name] = {
      enabled: gates[name] === true,
      label: DisplayPolicy.GATES[name].label,
      reason: DisplayPolicy.gateReason(GATE_CONFIG, name)
    };
  });
  return out;
}

function writeStatus(fields) {
  mkdirSync(OUT_DIR, { recursive: true });
  const status = Object.assign({
    generatedAt: new Date().toISOString(),
    provider: Tiingo.PROVIDER_ID,
    universeId: CONFIG.universeId,
    boundary: CONFIG.boundary,
    gates: gateSnapshot(),
    policy: policySnapshot()
  }, fields);
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  return status;
}

console.log("Vision Universe — Tiingo-Import\n");
console.log(`  Universum: ${SCOPE_FROM_PREVIEW ? "development-preview.json (Umfang)" : CONFIG.universeId} (${SECURITIES.length} Titel)`);
console.log(`  Modus:     ${DRY_RUN ? "Probelauf" : INITIAL ? "Erstimport" : "inkrementell"}`);

/* ------------------------------------------------------- Ohne Zugang */

if (!apiKey) {
  console.log("\n  Kein TIINGO_API_KEY gesetzt.");
  console.log("  Es wird nichts abgerufen und ausdruecklich NICHT auf Demo-Daten zurueckgefallen.");
  writeStatus({
    configured: false,
    dataMode: "mock",
    capabilities: Tiingo.freePlanCapabilities().sets,
    evidence: Tiingo.freePlanCapabilities().evidence,
    limits: Tiingo.FREE_LIMITS,
    securities: {},
    notice: "Kein Tiingo-Zugang konfiguriert. Der Quant-Bereich laeuft unveraendert im " +
            "Modelldatenmodus. Setze TIINGO_API_KEY als Repository-Secret, um echte " +
            "Kursdaten zu laden."
  });
  console.log("  Statusbericht geschrieben.");
  console.log("\n  Fertig (kein Zugang). Kein Fehler — der Zugang ist optional.");
  process.exit(0);
}

/* ---------------------------------------------------------- Aufbau */

const registry = SymbolMapping.createRegistry(
  SECURITIES.map((s) => ({
    securityId: s.securityId,
    providerId: Tiingo.PROVIDER_ID,
    providerSymbol: s.ticker,
    ticker: s.ticker,
    exchange: s.exchange,
    mic: s.mic,
    currency: "USD",
    country: "US",
    confidence: "inferred",
    note: "Aus der Testuniversum-Konfiguration abgeleitet."
  }))
);

const capabilities = COMMERCIAL ? Tiingo.commercialPlanCapabilities() : Tiingo.freePlanCapabilities();
if (COMMERCIAL && (REQUEST_BUDGET > 0 || CONCURRENCY > 0)) {
  capabilities.limits = Object.assign({}, capabilities.limits,
    REQUEST_BUDGET > 0 ? { requestsPerHour: REQUEST_BUDGET,
                           requestsPerDay: Math.max(capabilities.limits.requestsPerDay, REQUEST_BUDGET) } : {},
    CONCURRENCY > 0 ? { concurrency: CONCURRENCY } : {});
  capabilities.limits.provenance = Object.assign({}, capabilities.limits.provenance,
    { requestsPerHour: "SAFETY_CEILING", budgetNote: "Vom Aufrufer gesetzt (--request-budget). Weiterhin unsere Zahl, nicht Tiingos." });
}
const provider = Tiingo.createTiingoProvider({
  apiKey, capabilities, symbolRegistry: registry,
  baseUrl: process.env.TIINGO_BASE_URL || undefined,
  fetchImpl: (url, init) => fetch(url, init)
});
console.log(`  Zugang:    ${capabilities.plan || (COMMERCIAL ? "commercial" : "free")} · ` +
            `${capabilities.limits.requestsPerHour}/h, ${capabilities.limits.concurrency || 1} gleichzeitig`);
const store = MarketStore.createMarketStore({ root, providerId: Tiingo.PROVIDER_ID });

/* Interne Nutzung pruefen - der Import selbst ist eine interne Handlung. */
const permitted = DisplayPolicy.check({
  providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw", gates
});
if (!permitted.allowed) {
  console.error(`\n  ABBRUCH: ${permitted.message}`);
  process.exit(1);
}

const eodCalendar = STRICT_INCREMENTAL ? JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8")) : null;
const closedSession = STRICT_INCREMENTAL ? EodGate.latestClosedSession(new Date(), eodCalendar) : null;
const strictPlans = {};
if (STRICT_INCREMENTAL) {
  if (closedSession.state !== "AVAILABLE") throw Error(closedSession.reason);
  // Preflight every required history before the first provider request.
  for (const security of SECURITIES) {
    const plan = EodGate.plan(store.lastStoredDate(security.securityId), closedSession, eodCalendar);
    if (plan.state === "BLOCKED") throw Error(plan.reason + ":" + security.securityId);
    strictPlans[security.securityId] = plan;
  }
}
// Keep main's cross-day rejection ledger for regular imports; strict EOD owns a session-specific checkpoint.
const runId = STRICT_INCREMENTAL ? "strict-eod-" + closedSession.date : (INITIAL ? "initial" : "incremental");
const checkpoint = store.loadCheckpoint(runId);
if (STRICT_INCREMENTAL) checkpoint.done = checkpoint.done.filter(id => strictPlans[id]?.state === "CURRENT");

/* Der Checkpoint ist die Wiederaufnahme EINES Laufs (Budget erschoepft,
   Runner weg) - kein Gedaechtnis ueber Tage. Ein Checkpoint von gestern
   wuerde heute jeden Titel als "erledigt" ueberspringen, und die Kurse
   blieben still stehen. Deshalb: neuer Tag, neue Liste; nur die
   Ablehnungen (rejected) bleiben als Sperre bestehen. */
const heute = new Date().toISOString().slice(0, 10);
if (!STRICT_INCREMENTAL && checkpoint.startedAt && checkpoint.startedAt.slice(0, 10) !== heute) {
  console.log(`  Checkpoint vom ${checkpoint.startedAt.slice(0, 10)} verworfen (neuer Tag): ${checkpoint.done.length} erledigte Titel werden neu geprueft.`);
  checkpoint.done = []; checkpoint.failed = []; checkpoint.requests = 0; checkpoint.startedAt = null;
}
if (!checkpoint.startedAt) checkpoint.startedAt = new Date().toISOString();

/* Wie lange eine Ablehnung wirkt, entscheidet nicht mehr eine einzige
   Zahl, sondern ihre Ursache: quant/engines/rejection-lifecycle.js. Die
   sieben Tage bleiben als Frist, ab der JEDE Ablehnung ohnehin verfaellt. */
const REJECT_RETRY_DAYS = 7;
if (!checkpoint.rejected) checkpoint.rejected = {};
const pending = store.remaining(checkpoint, SECURITIES.map((s) => s.securityId));
console.log(`  Ausstehend: ${pending.length} von ${SECURITIES.length}` +
            (checkpoint.done.length ? ` (${checkpoint.done.length} bereits erledigt)` : ""));
console.log(`  Kontingent: ${capabilities.limits.requestsPerHour}/Stunde, ` +
            `${capabilities.limits.requestsPerDay}/Tag\n`);

/* Ab wann Tageskurse geholt werden: fullHistory-Titel ab initialFrom (die
   Aktienseite braucht 5J/Max), alle anderen ab discoverSeries.historyFrom -
   genug fuer 252-Tage-Faktoren und die kompakte Jahresreihe. */
const HISTORY_FROM = (PREVIEW_SCOPE && JSON.parse(readFileSync(PREVIEW_CONFIG_PATH, "utf8")).discoverSeries || {}).historyFrom || null;
function initialFromFor(security) {
  if (!SCOPE_FROM_PREVIEW || !HISTORY_FROM) return CONFIG.fetch.initialFrom;
  return PREVIEW_SCOPE.fullHistory.has(security.ticker) ? CONFIG.fetch.initialFrom : HISTORY_FROM;
}

const perSecurity = {};
let anschlussAusAbrufCount = 0;
let ok = 0, failed = 0, rejected = 0, skipped = 0;
/* Wer wurde wegen welcher Klasse zurueckgestellt, und wer bekam nach einer
   Ablehnung einen neuen Versuch - beides gehoert in den Statusbericht,
   sonst ist ein stiller Ausfall wieder moeglich. */
const deferredByClass = {};
const retriedAfterRejection = [];
let recoveredAfterRejection = 0;

for (const security of SECURITIES) {
  const id = security.securityId;
  const label = `  ${security.ticker.padEnd(6)}`;

  if (checkpoint.done.includes(id)) { skipped++; console.log(`${label} uebersprungen (erledigt)`); continue; }
  /* Ob eine abgelehnte Reihe heute wieder gefragt wird, entscheidet die
     Ursache, nicht der Kalender: ein Fensterartefakt sofort, ein
     Qualitaetszustand nach knapp einem Tag (laenger, wenn er sich
     wiederholt), ein strukturelles Problem nach dreissig Tagen. Kein
     Titel bleibt dauerhaft draussen. Klasse und Grund stehen im
     Checkpoint und im Statusbericht. */
  const zuletztAbgelehnt = checkpoint.rejected && checkpoint.rejected[id];
  const urteil = INITIAL
    ? { allowed: true, class: "RECOVERED", reason: "Erstimport fragt immer" }
    : RejectionLifecycle.darfAbfragen(zuletztAbgelehnt,
        { now: Date.now(), staleAfterMs: REJECT_RETRY_DAYS * 86400000 });
  if (!urteil.allowed) {
    skipped++; rejected++;
    deferredByClass[urteil.class] = (deferredByClass[urteil.class] || 0) + 1;
    perSecurity[id] = { ticker: security.ticker, ok: false, reason: "qualityCheckFailed", deferred: true,
                        rejectionClass: urteil.class, rejectionReason: urteil.reason,
                        message: zuletztAbgelehnt.codes, rejectedAt: zuletztAbgelehnt.at };
    console.log(`${label} uebersprungen (${urteil.class}, abgelehnt am ${zuletztAbgelehnt.at.slice(0, 10)}: ${zuletztAbgelehnt.codes})`);
    continue;
  }
  if (zuletztAbgelehnt) {
    retriedAfterRejection.push(security.ticker);
    console.log(`${label} erneuter Versuch (${urteil.class}: ${urteil.reason})`);
  }

  const strictPlan = STRICT_INCREMENTAL ? strictPlans[id] : null;
  const fromGeplant = STRICT_INCREMENTAL ? strictPlan.from : INITIAL
    ? initialFromFor(security)
    : store.nextFetchFrom(id, { initialFrom: initialFromFor(security) });
  /* EIN TAG UEBERLAPPUNG, KEINE ZUSAETZLICHE ANFRAGE

     nextFetchFrom beginnt bewusst einen Tag nach dem letzten
     gespeicherten - dieselbe Bar zweimal zu holen waere eine Dublette.
     Fuer die Konsistenzpruefung ist aber genau dieser Vortag noetig, und
     zwar mit der Bereinigung von HEUTE (siehe unten beim
     validationInput). Er kommt in derselben Antwort mit; die Anfrage
     kostet nichts extra, und die Dublette faengt der Filter weiter
     unten ab. */
  const gespeichertBis = INITIAL ? null : store.lastStoredDate(id);
  const from = gespeichertBis && gespeichertBis < fromGeplant ? gespeichertBis : fromGeplant;

  if (DRY_RUN) {
    const last = store.lastStoredDate(id);
    console.log(`${label} ${strictPlan?.state === "CURRENT" ? "bereits aktuell" : "wuerde ab " + from + " laden"}` + (last ? ` (gespeichert bis ${last})` : " (nichts gespeichert)"));
    continue;
  }

  /* Nichts nachzuladen ist ein Erfolg, kein Ueberspringen: der Titel ist
     aktuell. Eine Anfrage dafuer waere verschwendetes Kontingent. */
  const todayStr = new Date().toISOString().slice(0, 10);
  if (strictPlan?.state === "CURRENT" || (!STRICT_INCREMENTAL && !INITIAL && from > todayStr)) {
    ok++;
    checkpoint.done.push(id);
    perSecurity[id] = { ticker: security.ticker, ok: true, added: 0, reason: "aktuell" };
    console.log(`${label} aktuell, kein Abruf noetig`);
    continue;
  }

  const res = await provider.getDailyBars(id, { from, ...(STRICT_INCREMENTAL ? { to: strictPlan.through } : {}) });
  checkpoint.requests++;

  if (!res.available) {
    failed++;
    checkpoint.failed = checkpoint.failed.filter((f) => f.securityId !== id);
    checkpoint.failed.push({ securityId: id, reason: res.reason, message: res.message,
                             at: new Date().toISOString() });
    store.saveCheckpoint(checkpoint);
    perSecurity[id] = { ticker: security.ticker, ok: false, reason: res.reason, message: res.message };
    console.log(`${label} FEHLER (${res.reason}) — ${String(res.message || "").slice(0, 70)}`);
    /* Bei erschoepftem Kontingent hat es keinen Zweck weiterzumachen. Der
       Checkpoint steht, der naechste Lauf setzt hier an. */
    if (res.reason === "rateLimited" || res.reason === "quotaExceeded") {
      console.log(`\n  Kontingent erschoepft. Der Lauf setzt beim naechsten Start hier fort.`);
      break;
    }
    continue;
  }

  const bars = res.data.bars;
  if (!bars.length) {
    ok++;
    // An empty response does not prove this session's EOD is available.
    // Keep eligible for a same-day retry (provider lag / pre-close run).
    perSecurity[id] = { ticker: security.ticker, ok: true, added: 0, reason: "keineNeuenTage" };
    console.log(`${label} keine neuen Handelstage`);
    store.saveCheckpoint(checkpoint);
    continue;
  }

  /* DER KONTINUITAETSBELEG - UND DIE URSACHE DES STILLSTANDS VOM 16.09.2026
   *
   * Ein Tageslauf holt genau eine neue Bar: den Schluss. Die
   * Qualitaetspruefung verlangt mindestens zwei, weil sich an einer
   * einzelnen Bar weder Reihenfolge noch Luecke noch Split pruefen laesst.
   * Der strikte Pfad loeste das laengst, indem er die letzte GESPEICHERTE
   * Bar vor das neue Material stellt; der regulaere Pfad tat es nicht -
   * und lehnte am 16.09.2026 um 22:41 UTC 6.831 von 6.876 Titeln mit
   * `too_few_bars` ab. Die Ablehnung sperrte sie sieben Tage, und die
   * Tageskurse standen still, waehrend zwei Sitzungen gehandelt wurden.
   *
   * Die gespeicherte Bar wird dabei weder neu geholt noch veraendert; sie
   * dient nur als Anschluss. Das ist strenger als vorher, nicht
   * grosszuegiger: jetzt wird die Fortsetzung wirklich geprueft. */
  const gespeichert = store.readBars(id);
  const anschluss = (gespeichert && Array.isArray(gespeichert.bars)) ? gespeichert.bars.slice(-1) : [];
  /* Liefert der Anbieter die Anschluss-Bar mit (manche tun das bei
     inklusivem startDate), waere sie nach dem Voranstellen doppelt - und
     `duplicate_bar` wuerde den Titel ablehnen. Dieselbe Bar zweimal ist
     kein Befund, sondern eine Ueberschneidung; sie wird verworfen. */
  const anschlussDatumRoh = anschluss.length ? String(anschluss[0].date).slice(0, 10) : null;
  const neueBars = anschlussDatumRoh
    ? bars.filter((bar) => String(bar.date).slice(0, 10) > anschlussDatumRoh)
    : bars;
  if (!neueBars.length) {
    ok++;
    perSecurity[id] = { ticker: security.ticker, ok: true, added: 0, reason: "keineNeuenTage" };
    console.log(`${label} keine neuen Handelstage (nur der bekannte Stand)`);
    store.saveCheckpoint(checkpoint);
    continue;
  }
  /* DER ANSCHLUSSBAR MUSS AUS DERSELBEN BEREINIGUNG STAMMEN

     Er kam bisher aus dem Speicher - also mit der Bereinigung des
     VORIGEN Laufs. Die neuen Bars tragen die von heute. Liegt ein
     Ex-Tag dazwischen, hat der Anbieter die Historie rueckwirkend
     nachbereinigt: der frisch geholte Vortag steht dann bei einem
     anderen adjustedClose als der gespeicherte.

     Die Konsistenzpruefung sieht daraufhin ein Verhaeltnis, das sich am
     Ex-Tag nicht bewegt, meldet dividend_not_in_adjusted und - weil der
     Anbieter TOTAL_RETURN behauptet - adjustment_status_contradicted.
     Der Titel wird abgelehnt, seine Reihe altert, und beim naechsten
     Lauf passiert dasselbe.

     Genau das hat SPY seit dem 17. September blockiert und mit ihm 531
     Titel in der Ausschuettungssaison. Der Pruefer hatte recht; sein
     Eingang war widerspruechlich.

     Deshalb: liefert die Antwort den Vortag mit, wird ER benutzt. Nur
     wenn nicht, bleibt der gespeicherte - dann ist das Fenster so gut
     wie vorher und nicht schlechter. */
  const anschlussAusAbruf = anschlussDatumRoh
    ? bars.filter((bar) => String(bar.date).slice(0, 10) === anschlussDatumRoh)
    : [];
  const anschlussFuerPruefung = anschlussAusAbruf.length ? anschlussAusAbruf : anschluss;
  if (anschlussAusAbruf.length) anschlussAusAbrufCount++;
  const validationInput = [...anschlussFuerPruefung, ...neueBars];
  const validation = MarketQuality.validateBars(validationInput, {
    today: todayStr,
    adjustmentStatus: res.data.adjustmentStatus
  });

  if (!validation.ok) {
    rejected++;
    const codes = validation.findings.filter((f) => f.severity === "error").map((f) => f.code);
    perSecurity[id] = { ticker: security.ticker, ok: false, reason: "qualityCheckFailed",
                        message: codes.join(", "), findings: validation.findings.slice(0, 8) };
    checkpoint.rejected[id] = RejectionLifecycle.fortschreiben(checkpoint.rejected[id],
      { at: new Date().toISOString(), codes: codes.join(", "),
        window: INITIAL ? "full" : "incremental" });
    /* stats ist null, wenn die Reihe schon vor der Bar-Pruefung scheitert
       (z. B. leere oder unlesbare Antwort) - dann zaehlen die Befunde. */
    console.log(`${label} ABGELEHNT — ${validation.stats ? validation.stats.errors : codes.length} Fehler (${codes[0]})`);
    store.saveCheckpoint(checkpoint);
    continue;
  }

  /* §24: die bereinigte Spalte gegen die rohe. Der Adapter deklariert die
     Stufe aus der Faehigkeitsmatrix; hier wird gemessen, ob die Daten sich
     auch so verhalten. Ein Widerspruch haelt die Reihe auf - eine falsch
     ausgezeichnete Reihe im Bestand ist schlimmer als eine fehlende, weil
     alles Nachgelagerte sie fuer bare Muenze nimmt. */
  const semantik = MarketQuality.validateAdjustmentConsistency(validation.bars, {
    claimedStatus: Semantics.normalize(res.data.adjustmentStatus)
  });
  if (!semantik.ok) {
    rejected++;
    const codes = semantik.findings.filter((f) => f.severity === "error").map((f) => f.code);
    perSecurity[id] = {
      ticker: security.ticker, ok: false, reason: "adjustmentContradicted",
      message: codes.join(", "),
      claimed: semantik.claimedStatus, inferred: semantik.inferredStatus,
      findings: semantik.findings.slice(0, 8)
    };
    checkpoint.rejected[id] = RejectionLifecycle.fortschreiben(checkpoint.rejected[id],
      { at: new Date().toISOString(), codes: "adjustmentContradicted: " + codes.join(", "),
        window: INITIAL ? "full" : "incremental" });
    console.log(`${label} ABGELEHNT — deklariert ${semantik.claimedStatus}, ` +
                `verhaelt sich wie ${semantik.inferredStatus}`);
    store.saveCheckpoint(checkpoint);
    continue;
  }

  /* Der Titel liefert wieder gueltige Daten: die Ablehnung ist erledigt.
     Stehen zu lassen waere ein Gedaechtnis an einen Zustand, den es nicht
     mehr gibt. */
  if (checkpoint.rejected[id]) {
    delete checkpoint.rejected[id];
    recoveredAfterRejection++;
    console.log(`${label} Ablehnung aufgehoben (liefert wieder gueltige Daten)`);
  }

  /* Der Anschluss aus dem Bestand gehoert nicht ins neue Material: er ist
     Beleg, nicht Zulieferung. */
  if (anschluss.length) {
    const anschlussDatum = anschluss[0].date;
    validation.bars = validation.bars.filter((bar) => bar.date > anschlussDatum);
  }
  if (STRICT_INCREMENTAL) validation.bars = validation.bars.filter(bar => bar.date >= strictPlan.from);
  const strictReconciliation = STRICT_INCREMENTAL ? EodGate.reconcile(validation.bars, strictPlan) : null;
  if (strictReconciliation?.state === "BLOCKED") {
    rejected++;
    perSecurity[id] = { ticker: security.ticker, ok: false, reason: strictReconciliation.reason };
    checkpoint.failed = checkpoint.failed.filter(f => f.securityId !== id);
    checkpoint.failed.push({securityId:id,reason:strictReconciliation.reason,at:new Date().toISOString()});
    store.saveCheckpoint(checkpoint);
    console.log(`${label} GESPERRT — ${strictReconciliation.reason}`);
    continue;
  }
  const merged = store.mergeBars(id, validation.bars, {
    ticker: security.ticker,
    name: security.name,
    exchange: security.exchange,
    mic: security.mic,
    currency: "USD",
    adjustmentStatus: res.data.adjustmentStatus,
    fetchedAt: new Date().toISOString()
  });

  ok++;
  if (!STRICT_INCREMENTAL || strictReconciliation.complete) checkpoint.done.push(id);
  checkpoint.failed = checkpoint.failed.filter(f => f.securityId !== id);
  store.saveCheckpoint(checkpoint);
  perSecurity[id] = {
    ticker: security.ticker, ok: true,
    added: merged.added, replaced: merged.replaced, total: merged.total,
    first: merged.first, last: merged.last,
    warnings: validation.stats.warnings,
    splits: validation.bars.filter((b) => b.splitFactor && b.splitFactor !== 1).length,
    dividends: validation.bars.filter((b) => b.dividend && b.dividend > 0).length,
    /* Was die Gegenprobe an dieser Reihe tatsaechlich SEHEN konnte. "no_events"
       heisst: im Zeitraum lag kein Split und keine Ausschuettung, die Stufe
       ist an diesen Daten nicht pruefbar. Das gehoert in den Statusbericht,
       sonst liest sich eine ungepruefte Reihe wie eine bestaetigte. */
    adjustment: {
      claimed: semantik.claimedStatus,
      inferred: semantik.inferredStatus,
      basis: semantik.observed.inferredFrom,
      splitEvents: semantik.observed.splitEvents.length,
      dividendEvents: semantik.observed.dividendEvents.length
    }
  };
  console.log(`${label} +${String(merged.added).padStart(4)} neu, ${String(merged.total).padStart(5)} gesamt  ` +
              `${merged.first} → ${merged.last}` +
              (perSecurity[id].splits ? `  ${perSecurity[id].splits} Split(s)` : "") +
              (perSecurity[id].dividends ? `  ${perSecurity[id].dividends} Div.` : ""));
}

/* ------------------------------------------------------ Abschluss */

/* Lauf vollstaendig (kein Abbruch am Kontingent): die Liste der erledigten
   Titel wird geleert, damit der naechste Lauf wieder jeden Titel nachlaedt.
   Bei Abbruch bleibt sie stehen - genau dafuer ist sie da. */
const vollstaendig = !DRY_RUN && SECURITIES.every((s) => checkpoint.done.includes(s.securityId) ||
  (perSecurity[s.securityId] && perSecurity[s.securityId].reason !== "rateLimited" && perSecurity[s.securityId].reason !== "quotaExceeded"));
if (vollstaendig && !STRICT_INCREMENTAL) {
  checkpoint.done = []; checkpoint.failed = []; checkpoint.requests = 0; checkpoint.startedAt = null;
  checkpoint.completedAt = new Date().toISOString();
  store.saveCheckpoint(checkpoint);
  console.log("\n  Lauf vollstaendig - Checkpoint zurueckgesetzt (Ablehnungen bleiben gemerkt).");
}

if (DRY_RUN) {
  console.log("\n  Probelauf — nichts abgerufen, nichts geschrieben.");
  process.exit(0);
}

const stats = provider.stats();
const quota = provider.quota();
const health = provider.healthCheck();

console.log("\n  Ergebnis:");
console.log(`    erfolgreich ${ok} · fehlgeschlagen ${failed} · abgelehnt ${rejected} · uebersprungen ${skipped}`);
console.log(`    Anfragen ${stats.requests} · Cache-Treffer ${stats.cacheHits} · Wiederholungen ${stats.retries}`);
console.log(`    Kontingent: ${quota.hourUsed}/${quota.hourLimit} Stunde, ${quota.dayUsed}/${quota.dayLimit} Tag`);
console.log(`    Bandbreite: ${(quota.bytesUsed / 1048576).toFixed(1)} MB`);

if (STRICT_INCREMENTAL) {
  const pendingIds = store.remaining(checkpoint, SECURITIES.map(s=>s.securityId));
  checkpoint.health = {
    observedAt: new Date().toISOString(), through: closedSession.date,
    processingState: pendingIds.length ? "INCOMPLETE" : "COMPLETE",
    qualityStatus: rejected || failed ? "FAIL" : "WARNING",
    dataFreshness: pendingIds.length ? "INCOMPLETE" : "LATEST_CLOSED_SESSION_RECEIVED",
    pending: pendingIds, securities: perSecurity,
    durability: "NOT_CERTIFIED", providerFinality: "NOT_CERTIFIED"
  };
  store.saveCheckpoint(checkpoint);
  const healthPath = join(store.workingDir, Tiingo.PROVIDER_ID, "strict-eod-health.json");
  mkdirSync(dirname(healthPath), {recursive:true});
  writeFileSync(healthPath, JSON.stringify({runId, ...checkpoint.health}, null, 2));
  if (pendingIds.length) {
    console.error("STRICT_EOD_INCOMPLETE: no publication; typed health persisted in working state");
    process.exit(1);
  }
}

if (PUBLISH) {
  /* Veroeffentlichen ist der einzige Schritt, der Anbieterdaten aus dem
     Arbeitsbereich in einen ausgelieferten Pfad bewegt. Er wird deshalb
     an derselben Richtlinie geprueft wie die Anzeige selbst - ein Flag
     auf der Kommandozeile ist keine Erlaubnis. */
  const anzeige = DisplayPolicy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "public", form: "raw", gates
  });
  if (!anzeige.allowed) {
    console.error("\n  ABBRUCH: --publish ist angefordert, aber die Auslieferung ist nicht freigegeben.");
    console.error(`  ${anzeige.message}`);
    console.error("\n  Die abgerufenen Reihen bleiben in der Arbeitsablage. Um sie auszuliefern,");
    console.error("  braucht es einen Eintrag in der MarketDataDisplayPolicy mit Grundlage und");
    console.error("  Datum - nicht ein Flag auf der Kommandozeile.");
    process.exit(1);
  }
  console.log("\n  Veroeffentlichter Ausschnitt:");
  console.log(`  Grundlage: ${anzeige.basis}`);
  for (const security of SECURITIES) {
    const p = store.publish(security.securityId, { permission: anzeige });
    if (p.published) {
      console.log(`    ${security.ticker.padEnd(6)} ${p.bars} von ${p.of} Bars (${Math.round(p.bytes / 1024)} KB)`);
    } else if (p.reason !== "noWorkingData") {
      console.error(`    ${security.ticker.padEnd(6)} NICHT ausgeliefert: ${p.message || p.reason}`);
    }
  }
}

if (PUBLISH_PREVIEW) {
  /* Development Preview (Phase 5, Golden Five). Eigene Richtlinienabfrage
     pro Titel - developmentPreviewScope entscheidet einzeln, nicht "alles
     im Universum". Landet in einem eigenen Verzeichnis
     (quant/data/market/golden-preview/daily/), nie im allgemeinen
     quant/data/market/daily/, das fuer die uebrigen zehn Referenztitel
     weiterhin gesperrt bleibt.

     Bug (Phase 6, Live-Feedback): MarketStore.publish() ohne eigenes
     `limit` faellt auf PUBLISHED_BAR_LIMIT=400 zurueck. Die Arbeitsablage
     haelt aber laengst die volle Historie ab initialFrom (quant/config/
     tiingo-universe.json, "2015-01-01") - jeder Lauf auf einem frischen
     Runner erfragt sie ohnehin neu (MarketStore.nextFetchFrom faellt ohne
     lokalen Stand immer auf initialFrom zurueck, unabhaengig von --initial).
     Mit 400 Bars zeigte "5J" im Chart nur ~1,6 Jahre. GOLDEN_PREVIEW_BAR_LIMIT
     veroeffentlicht stattdessen die komplette Arbeitsablage (kein neuer
     Tiingo-Request, keine neue Pipeline - nur ein anderer Grenzwert beim
     Schreiben des bereits geholten Bestands). */
  const GOLDEN_PREVIEW_BAR_LIMIT = 5000;
  const previewConfig = JSON.parse(readFileSync(PREVIEW_CONFIG_PATH, "utf8"));
  /* Der Umfang, aufgeloest: Tickerliste und/oder Universum. Die
     Richtlinie bekommt die aufgeloeste Liste, damit sie je Titel
     entscheiden kann. */
  DisplayPolicy.declareFromConfig(expandPreviewConfig(previewConfig, PREVIEW_SCOPE));

  const previewStore = MarketStore.createMarketStore({
    root, providerId: Tiingo.PROVIDER_ID, workingDir: store.workingDir,
    publishedDir: join(root, "quant", "data", "market", "golden-preview")
  });

  console.log("\n  Development-Preview-Veroeffentlichung (volle Historie, fullHistory-Titel):");
  /* Die volle Historie (5.000 Bars, ~500 KB je Titel) nur fuer die Titel,
     die die Aktienseite mit 5J/Max und die Technical Intelligence
     brauchen. Alle anderen im Umfang bekommen die kompakte Discover-Reihe
     weiter unten - ein Jahr Tagesschluss, 5 KB. */
  const scope = PREVIEW_SCOPE.fullHistory;
  for (const security of SECURITIES) {
    if (!scope.has(security.ticker)) continue;
    const anzeige = DisplayPolicy.check({
      providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
      form: "raw", ticker: security.ticker, gates
    });
    if (!anzeige.allowed) {
      console.error(`    ${security.ticker.padEnd(6)} NICHT veroeffentlicht: ${anzeige.message}`);
      continue;
    }
    const p = previewStore.publish(security.securityId, { permission: anzeige, limit: GOLDEN_PREVIEW_BAR_LIMIT });
    if (p.published) {
      console.log(`    ${security.ticker.padEnd(6)} ${p.bars} von ${p.of} Bars (${Math.round(p.bytes / 1024)} KB) ` +
                  `- ${anzeige.basis}`);
    } else if (p.reason !== "noWorkingData") {
      console.error(`    ${security.ticker.padEnd(6)} NICHT veroeffentlicht: ${p.message || p.reason}`);
    }
  }

  /* Die kompakten Discover-Reihen fuer JEDEN Titel im Umfang - dieselbe
     Richtlinie, dieselbe Arbeitsablage, ein anderer Ausschnitt. */
  console.log("\n  Kompakte Discover-Kursreihen (1 Jahr Tagesschluss, alle Titel im Umfang):");
  const reihen = publishDiscoverSeries({ root, workingDir: store.workingDir, fromPublished: true,
                                        log: (m) => console.log(m) });
  console.log(`    ${reihen.written.length} geschrieben, ${reihen.skipped.length} uebersprungen` +
              (reihen.skipped.length ? " (" + reihen.skipped.map((x) => x.ticker + ":" + x.reason).slice(0, 8).join(", ") +
               (reihen.skipped.length > 8 ? ", …" : "") + ")" : ""));
}

writeStatus({
  configured: true,
  dataMode: ok > 0 ? "hybrid" : "mock",
  capabilities: capabilities.sets,
  /* Woher jede zugesagte Faehigkeit ihren Wert hat. Ohne diese Angabe ist
     die Matrix eine Behauptung; mit ihr ist sie nachpruefbar. */
  evidence: capabilities.evidence,
  limits: capabilities.limits,
  adjustmentStatus: provider.adjustmentStatus(),
  health: { status: health.status, message: health.message },
  quota: quota,
  summary: { requested: SECURITIES.length, ok, failed, rejected, skipped,
             requests: stats.requests, cacheHits: stats.cacheHits, retries: stats.retries,
             bytesReceived: stats.bytesReceived,
             /* Ohne diese drei Zahlen ist ein stiller Ausfall wieder
                moeglich: wie viele Titel wegen welcher Klasse gar nicht
                gefragt wurden, wie viele nach einer Ablehnung einen neuen
                Versuch bekamen und wie viele sich dabei erholt haben. */
             deferredByClass, retriedAfterRejection: retriedAfterRejection.length,
             recoveredAfterRejection },
  /* `offen`, nicht `open`: "open" ist in einem ausgelieferten Artefakt
     der Eroeffnungskurs, und die Hygienepruefung liest es genau so - sie
     kann einer Zahl nicht ansehen, ob sie ein Kurs oder eine Anzahl ist.
     Der Lauf 35349647216 ist daran gescheitert, nachdem 66 Minuten
     Abruf schon getan waren. Ein Feldname, der etwas anderes behauptet
     als er ist, ist der Fehler - nicht die Pruefung. */
  rejectionLedger: { offen: Object.keys(checkpoint.rejected || {}).length,
                     ...RejectionLifecycle.pruefeRegister(checkpoint.rejected || {},
                       { staleAfterMs: REJECT_RETRY_DAYS * 86400000 }).byClass },
  securities: perSecurity,
  checkpoint: { runId: checkpoint.runId, done: checkpoint.done.length,
                failed: checkpoint.failed.length, requests: checkpoint.requests },
  notice: ok > 0
    ? "Echte Tageskurse von Tiingo fuer das Testuniversum. Fundamentaldaten bleiben " +
      /* Die kanonische Stufe, nicht das Anbietervokabular: "adjusted" ist
         Tiingos Wort und sagt einem Leser nichts. */
      "synthetisch. Die Bereinigungsstufe ist " +
      Semantics.normalize(provider.adjustmentStatus()) + "."
    : "Kein Titel geladen. Der Quant-Bereich bleibt im Modelldatenmodus."
});

console.log(`\n  Statusbericht: quant/data/market/tiingo-status.json`);
console.log("\nFertig.");
