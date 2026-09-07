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
const apiKey = process.env.TIINGO_API_KEY || null;
const gates = DisplayPolicy.gatesFromEnv(process.env);

const OUT_DIR = join(root, "quant", "data", "market");
const STATUS_FILE = join(OUT_DIR, "tiingo-status.json");

function writeStatus(fields) {
  mkdirSync(OUT_DIR, { recursive: true });
  const status = Object.assign({
    generatedAt: new Date().toISOString(),
    provider: Tiingo.PROVIDER_ID,
    universeId: CONFIG.universeId,
    boundary: CONFIG.boundary
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
  console.log("\n  Veroeffentlichter Ausschnitt:");
  for (const security of CONFIG.securities) {
    const p = store.publish(security.securityId);
    if (p.published) {
      console.log(`    ${security.ticker.padEnd(6)} ${p.bars} von ${p.of} Bars (${Math.round(p.bytes / 1024)} KB)`);
    }
  }
}

writeStatus({
  configured: true,
  dataMode: ok > 0 ? "hybrid" : "mock",
  capabilities: capabilities.sets,
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
      "synthetisch. Die Bereinigungsstufe ist " + provider.adjustmentStatus() + "."
    : "Kein Titel geladen. Der Quant-Bereich bleibt im Modelldatenmodus."
});

console.log(`\n  Statusbericht: quant/data/market/tiingo-status.json`);
console.log("\nFertig.");
