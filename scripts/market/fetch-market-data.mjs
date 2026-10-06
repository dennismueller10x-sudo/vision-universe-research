/* =========================================================================
   VISION UNIVERSE — fetch-market-data.mjs   (Phase 2, §12, §14, §15)

   Holt echte Tageskurse fuer das kleine Referenzuniversum, prueft sie und
   schreibt normalisiertes JSON in die nicht ausgelieferte Arbeitsablage
   .market-cache/twelve-data/.

   WO DAS LAEUFT: serverseitig — in der GitHub Action oder lokal. Der
   API-Schluessel kommt aus der Umgebung und verlaesst sie nie. Vision
   Universe wird statisch von GitHub Pages ausgeliefert; ein Schluessel im
   Browser waere ein oeffentlicher Schluessel. Deshalb dieser Weg:

       GitHub Action (Secret)  ->  Abruf  ->  Normalisierung  ->
       Qualitaetspruefung      ->  interne Arbeitsablage

   OHNE SCHLUESSEL bricht das Skript NICHT ab. Es schreibt einen
   Statusbericht mit `notConfigured` und beendet sich erfolgreich — der
   Mock-Modus bleibt vollstaendig funktionsfaehig, und die CI bleibt gruen.
   Ein fehlender Zugang ist eine Konfigurationsfrage, kein Baufehler.

   Ausfuehren:
     TWELVE_DATA_API_KEY=... node scripts/market/fetch-market-data.mjs
     node scripts/market/fetch-market-data.mjs --dry-run
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const SymbolMapping = require(join(engines, "symbol-mapping.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const DataMode = require(join(engines, "data-mode.js"));
const TwelveData = require(join(root, "providers", "twelve-data", "adapter.js"));

const CACHE_ROOT = resolve(root, ".market-cache");
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith("--output-dir="));
const OUT_DIR = resolve(outputArg ? outputArg.slice("--output-dir=".length) : join(CACHE_ROOT, "twelve-data"));
const CONFIG = JSON.parse(readFileSync(join(root, "quant", "config", "market-universe.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const apiKey = process.env.TWELVE_DATA_API_KEY || null;
const mode = DataMode.resolveMode(process.env);

/* Vendor-Rohdaten duerfen bei offener Redistribution nie in einen von der
   statischen Site ausgelieferten Pfad geschrieben werden. Auch ein
   versehentlich gesetztes CLI-Ziel darf diese Grenze nicht umgehen. */
const cacheRelative = relative(CACHE_ROOT, OUT_DIR);
if (cacheRelative.startsWith("..") || (cacheRelative === "" && OUT_DIR !== CACHE_ROOT)) {
  throw new Error("Ausgabe abgelehnt: Twelve-Data-Rohdaten muessen unter .market-cache/ bleiben.");
}

function write(relativePath, data) {
  const file = join(OUT_DIR, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(file, json);
  return Math.round(Buffer.byteLength(json) / 1024);
}

function today() { return new Date().toISOString().slice(0, 10); }

/* Interner Statusbericht — die einzige Datei, die IMMER geschrieben wird.
   Die oeffentliche UI liest ausschliesslich den bewusst eingecheckten
   UNAVAILABLE-Status unter quant/data/market/status.json. */
function writeStatus(fields) {
  const status = {
    generatedAt: new Date().toISOString(),
    dataMode: fields.mode,
    provider: fields.provider || null,
    configured: fields.configured,
    health: fields.health || null,
    quota: fields.quota || null,
    capabilities: fields.capabilities || null,
    securities: fields.securities || {},
    summary: fields.summary || null,
    adjustmentStatus: fields.adjustmentStatus || null,
    notice: fields.notice,
    /* Diese Trennung ist der Kern der Phase: echte Kurse ja, erfundene
       Fundamentaldaten fuer reale Unternehmen nein. */
    boundary: CONFIG.boundary
  };
  const kb = write("status.json", status);
  console.log(`  status.json (${kb} KB) — dataMode=${status.dataMode}, configured=${status.configured}`);
  return status;
}

console.log("Vision Universe — Marktdatenabruf\n");
console.log(`  Modus: ${mode}`);
console.log(`  Referenzuniversum: ${CONFIG.securities.length} Titel`);

if (!apiKey) {
  console.log("\n  Kein TWELVE_DATA_API_KEY gesetzt.");
  console.log("  Es wird nichts abgerufen und ausdruecklich NICHT auf Demo-Daten zurueckgefallen.");
  writeStatus({
    mode: "mock",
    provider: TwelveData.PROVIDER_ID,
    configured: false,
    capabilities: TwelveData.freePlanCapabilities().sets,
    notice: "Kein API-Schluessel konfiguriert. Das System laeuft vollstaendig im Mock-Modus. " +
            "Setze TWELVE_DATA_API_KEY als Repository-Secret, um echte Kursdaten zu laden."
  });
  console.log("\n  Fertig (Mock-Modus). Kein Fehler — der Zugang ist optional.");
  process.exit(0);
}

/* --------------------------------------------------------------- Aufbau */
const symbolRegistry = SymbolMapping.createRegistry(
  CONFIG.securities.map((s) => ({
    securityId: s.securityId,
    providerId: TwelveData.PROVIDER_ID,
    providerSymbol: s.ticker,
    ticker: s.ticker,
    exchange: s.exchange,
    mic: s.mic,
    currency: CONFIG.exchange.currency,
    country: CONFIG.exchange.country,
    confidence: "inferred",
    note: "Aus der Referenzkonfiguration abgeleitet; vor produktiver Nutzung gegen den Anbieter verifizieren."
  }))
);

const capabilities = TwelveData.freePlanCapabilities();
const provider = TwelveData.createTwelveDataProvider({
  apiKey,
  capabilities,
  symbolRegistry,
  fetchImpl: (url, init) => fetch(url, init)
});

const adjustment = provider.adjustmentStatus();
if (adjustment !== "adjusted") {
  const explanation = adjustment === "splitAdjusted"
    ? "Der Zugang liefert splitbereinigte, aber nicht dividendenbereinigte Kurse."
    : "Der Zugang liefert keine bestaetigt bereinigten Kurse.";
  console.log(`\n  Hinweis: ${explanation}`);
  console.log(`  Die Reihen werden als '${adjustment}' gekennzeichnet. adjustedClose bleibt null;`);
  console.log("  sie sind fuer die Anzeige geeignet, nicht als Grundlage fuer Total-Return-Kennzahlen.\n");
}

/* ---------------------------------------------------------------- Abruf */
const results = {};
const perSecurity = {};
let ok = 0, failed = 0, rejected = 0;

for (const security of CONFIG.securities) {
  process.stdout.write(`  ${security.ticker.padEnd(6)} `);
  if (DRY_RUN) { console.log("uebersprungen (--dry-run)"); continue; }

  const res = await provider.getDailyBars(security.securityId, {
    outputsize: CONFIG.fetch.outputsize
  });

  if (!res.available) {
    failed++;
    perSecurity[security.securityId] = { ticker: security.ticker, ok: false, reason: res.reason, message: res.message };
    console.log(`FEHLER (${res.reason})`);
    continue;
  }

  const validation = MarketQuality.validateBars(res.data.bars, {
    today: today(),
    adjustmentStatus: res.data.adjustmentStatus
  });

  if (!validation.ok) {
    rejected++;
    perSecurity[security.securityId] = {
      ticker: security.ticker, ok: false, reason: "qualityCheckFailed",
      message: validation.findings.filter((f) => f.severity === "error").map((f) => f.code).join(", "),
      findings: validation.findings.slice(0, 10)
    };
    console.log(`ABGELEHNT — ${validation.stats.errors} Fehler (${validation.findings.filter(f => f.severity === "error")[0]?.code})`);
    continue;
  }

  ok++;
  const payload = {
    securityId: security.securityId,
    ticker: security.ticker,
    name: security.name,
    exchange: security.exchange,
    mic: security.mic,
    currency: res.data.currency,
    adjustmentStatus: res.data.adjustmentStatus,
    provider: TwelveData.PROVIDER_ID,
    fetchedAt: new Date().toISOString(),
    asOf: validation.stats.last,
    barCount: validation.bars.length,
    bars: validation.bars
  };
  const kb = write(join("daily", `${security.securityId}.json`), payload);
  perSecurity[security.securityId] = {
    ticker: security.ticker, ok: true, bars: validation.bars.length,
    first: validation.stats.first, last: validation.stats.last,
    warnings: validation.stats.warnings, sizeKb: kb,
    fromCache: !!res.fromCache, stale: !!res.stale
  };
  results[security.securityId] = payload;
  console.log(`${String(validation.bars.length).padStart(4)} Bars  ${validation.stats.first} → ${validation.stats.last}` +
              (validation.stats.warnings ? `  (${validation.stats.warnings} Warnungen)` : ""));
}

/* --------------------------------------------------------------- Status */
const health = provider.healthCheck();
const stats = provider.stats();
const anyLive = ok > 0;

console.log("\n  Ergebnis:");
console.log(`    erfolgreich ${ok} · fehlgeschlagen ${failed} · Qualitaetspruefung abgelehnt ${rejected}`);
console.log(`    Anfragen ${stats.requests} · Cache-Treffer ${stats.cacheHits} · Wiederholungen ${stats.retries} · Fehler ${stats.errors}`);
console.log(`    Kontingent: ${stats.quota.minuteUsed}/${stats.quota.minuteLimit} pro Minute, ${stats.quota.dayUsed}/${stats.quota.dayLimit} pro Tag`);

writeStatus({
  mode: anyLive ? "hybrid" : "mock",
  provider: TwelveData.PROVIDER_ID,
  configured: true,
  health: { status: health.status, message: health.message },
  quota: stats.quota,
  capabilities: capabilities.sets,
  adjustmentStatus: adjustment,
  securities: perSecurity,
  summary: {
    requested: CONFIG.securities.length, ok, failed, rejected,
    requests: stats.requests, cacheHits: stats.cacheHits,
    retries: stats.retries, errors: stats.errors,
    averageLatencyMs: stats.averageLatencyMs
  },
  notice: anyLive
    ? "Echte Tageskurse fuer das Referenzuniversum. Fundamentaldaten bleiben synthetisch; " +
      "das synthetische Modelluniversum ist davon vollstaendig getrennt."
    : "Kein Titel konnte geladen werden. Das System bleibt im Mock-Modus."
});

if (!DRY_RUN && ok === 0) {
  console.log("\n  Kein Titel geladen. Das System bleibt im Mock-Modus — das ist ein gueltiger Zustand.");
}
console.log("\nFertig.");
