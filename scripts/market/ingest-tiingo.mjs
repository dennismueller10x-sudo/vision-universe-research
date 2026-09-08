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

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const Semantics = require(join(engines, "price-semantics.js"));
const MarketStore = require(join(engines, "market-store.js"));
const DisplayPolicy = require(join(engines, "display-policy.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const CONFIG = JSON.parse(
  readFileSync(join(root, "quant", "config", "tiingo-universe.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const INITIAL = args.has("--initial");
const PUBLISH = args.has("--publish");
/* Phase 5, Golden Five: eine eigene, eng begrenzte Auslieferung neben
   --publish (das oeffentliche, weiterhin gesperrte Gate). Siehe
   quant/config/development-preview.json fuer die Titel-Allowlist und die
   Begruendung - dieser Pfad ist keine zweite, lockerere Kopie von
   --publish, sondern verlangt seine eigene, eng begrenzte Erlaubnis. */
const PUBLISH_PREVIEW = args.has("--publish-preview");
const PREVIEW_CONFIG_PATH = join(root, "quant", "config", "development-preview.json");
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
console.log(`  Universum: ${CONFIG.universeId} (${CONFIG.securities.length} Titel)`);
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
  CONFIG.securities.map((s) => ({
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

const capabilities = Tiingo.freePlanCapabilities();
const provider = Tiingo.createTiingoProvider({
  apiKey, capabilities, symbolRegistry: registry,
  fetchImpl: (url, init) => fetch(url, init)
});
const store = MarketStore.createMarketStore({ root, providerId: Tiingo.PROVIDER_ID });

/* Interne Nutzung pruefen - der Import selbst ist eine interne Handlung. */
const permitted = DisplayPolicy.check({
  providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw", gates
});
if (!permitted.allowed) {
  console.error(`\n  ABBRUCH: ${permitted.message}`);
  process.exit(1);
}

const runId = INITIAL ? "initial" : "incremental";
const checkpoint = store.loadCheckpoint(runId);
if (!checkpoint.startedAt) checkpoint.startedAt = new Date().toISOString();

const pending = store.remaining(checkpoint, CONFIG.securities.map((s) => s.securityId));
console.log(`  Ausstehend: ${pending.length} von ${CONFIG.securities.length}` +
            (checkpoint.done.length ? ` (${checkpoint.done.length} bereits erledigt)` : ""));
console.log(`  Kontingent: ${Tiingo.FREE_LIMITS.requestsPerHour}/Stunde, ` +
            `${Tiingo.FREE_LIMITS.requestsPerDay}/Tag\n`);

const perSecurity = {};
let ok = 0, failed = 0, rejected = 0, skipped = 0;

for (const security of CONFIG.securities) {
  const id = security.securityId;
  const label = `  ${security.ticker.padEnd(6)}`;

  if (checkpoint.done.includes(id)) { skipped++; console.log(`${label} uebersprungen (erledigt)`); continue; }

  const from = INITIAL
    ? CONFIG.fetch.initialFrom
    : store.nextFetchFrom(id, { initialFrom: CONFIG.fetch.initialFrom });

  if (DRY_RUN) {
    const last = store.lastStoredDate(id);
    console.log(`${label} wuerde ab ${from} laden` + (last ? ` (gespeichert bis ${last})` : " (nichts gespeichert)"));
    continue;
  }

  /* Nichts nachzuladen ist ein Erfolg, kein Ueberspringen: der Titel ist
     aktuell. Eine Anfrage dafuer waere verschwendetes Kontingent. */
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!INITIAL && from > todayStr) {
    ok++;
    checkpoint.done.push(id);
    perSecurity[id] = { ticker: security.ticker, ok: true, added: 0, reason: "aktuell" };
    console.log(`${label} aktuell, kein Abruf noetig`);
    continue;
  }

  const res = await provider.getDailyBars(id, { from });
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
    checkpoint.done.push(id);
    perSecurity[id] = { ticker: security.ticker, ok: true, added: 0, reason: "keineNeuenTage" };
    console.log(`${label} keine neuen Handelstage`);
    store.saveCheckpoint(checkpoint);
    continue;
  }

  const validation = MarketQuality.validateBars(bars, {
    today: todayStr,
    adjustmentStatus: res.data.adjustmentStatus
  });

  if (!validation.ok) {
    rejected++;
    const codes = validation.findings.filter((f) => f.severity === "error").map((f) => f.code);
    perSecurity[id] = { ticker: security.ticker, ok: false, reason: "qualityCheckFailed",
                        message: codes.join(", "), findings: validation.findings.slice(0, 8) };
    console.log(`${label} ABGELEHNT — ${validation.stats.errors} Fehler (${codes[0]})`);
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
    console.log(`${label} ABGELEHNT — deklariert ${semantik.claimedStatus}, ` +
                `verhaelt sich wie ${semantik.inferredStatus}`);
    store.saveCheckpoint(checkpoint);
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
  checkpoint.done.push(id);
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
  for (const security of CONFIG.securities) {
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
     weiterhin gesperrt bleibt. */
  const previewConfig = JSON.parse(readFileSync(PREVIEW_CONFIG_PATH, "utf8"));
  DisplayPolicy.declareFromConfig(previewConfig);

  const previewStore = MarketStore.createMarketStore({
    root, providerId: Tiingo.PROVIDER_ID, workingDir: store.workingDir,
    publishedDir: join(root, "quant", "data", "market", "golden-preview")
  });

  console.log("\n  Development-Preview-Veroeffentlichung (Golden Five):");
  const scope = new Set(previewConfig.scope || []);
  for (const security of CONFIG.securities) {
    if (!scope.has(security.ticker)) continue;
    const anzeige = DisplayPolicy.check({
      providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
      form: "raw", ticker: security.ticker, gates
    });
    if (!anzeige.allowed) {
      console.error(`    ${security.ticker.padEnd(6)} NICHT veroeffentlicht: ${anzeige.message}`);
      continue;
    }
    const p = previewStore.publish(security.securityId, { permission: anzeige });
    if (p.published) {
      console.log(`    ${security.ticker.padEnd(6)} ${p.bars} von ${p.of} Bars (${Math.round(p.bytes / 1024)} KB) ` +
                  `- ${anzeige.basis}`);
    } else if (p.reason !== "noWorkingData") {
      console.error(`    ${security.ticker.padEnd(6)} NICHT veroeffentlicht: ${p.message || p.reason}`);
    }
  }
}

writeStatus({
  configured: true,
  dataMode: ok > 0 ? "hybrid" : "mock",
  capabilities: capabilities.sets,
  /* Woher jede zugesagte Faehigkeit ihren Wert hat. Ohne diese Angabe ist
     die Matrix eine Behauptung; mit ihr ist sie nachpruefbar. */
  evidence: capabilities.evidence,
  limits: Tiingo.FREE_LIMITS,
  adjustmentStatus: provider.adjustmentStatus(),
  health: { status: health.status, message: health.message },
  quota: quota,
  summary: { requested: CONFIG.securities.length, ok, failed, rejected, skipped,
             requests: stats.requests, cacheHits: stats.cacheHits, retries: stats.retries,
             bytesReceived: stats.bytesReceived },
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
