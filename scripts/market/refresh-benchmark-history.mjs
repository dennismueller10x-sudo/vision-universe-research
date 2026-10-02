#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — refresh-benchmark-history.mjs

   SPY als BENCHMARK_REFERENCE in der kanonischen Historie.

   Owner-Entscheid 02.10.2026: SPY gehoert in die dauerhafte Ablage, damit
   Backtests ihn als Gesamtrendite vergleichen koennen. SPY wird dadurch
   KEIN Aktienprodukt: er steht weder im Gate-Universum noch im
   Produktuniversum, bekommt keine Screener-Zeile, kein Ranking, keinen
   Strategie-Treffer. Diese Trennung sichert quant/tests/benchmark-
   reference.test.mjs.

   WARUM EIN VOLLER ABRUF UND KEIN ANHAENGEN

   Der taegliche Abruf (ingest-tiingo) haengt nur neue Tage an. Gespeicherte
   Bars behalten die adjustedClose-Skala ihres Abruftags, Tiingo skaliert
   die Vergangenheit aber an jedem Ex-Tag neu. Fuer die Gesamtrendite des
   Vergleichsmassstabs waere jede Ausschuettung nach dem Erstabruf
   verloren. Ausserdem beginnt die Arbeitsablage fuer SPY erst 2023 -
   die Studien reichen bis 1990 zurueck.

   Deshalb holt dieser Schritt die ganze Reihe ab SCALE.history.initialFrom
   in EINER Anfrage, mit demselben Adapter, derselben Qualitaetspruefung
   und derselben Arbeitsablage wie der Gate-Lauf (run-scale-gate.mjs
   fetchAndAssess). Bei gleichem Datum gewinnt die neue Bar - die Reihe hat
   danach eine einzige, konsistente Bereinigung.

   Faellt die Pruefung durch, bleibt die Arbeitsablage unangetastet und der
   Bericht sagt FAIL. Die Backtests fallen dann geschlossen auf Kursrendite
   zurueck (keine Mischung) - der Marktlauf selbst wird davon nicht rot.

   Rohkurse verlassen den Runner nie: der Bericht enthaelt nur Zaehler,
   Daten und Zustaende.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/refresh-benchmark-history.mjs \
       [--work-dir .market-cache] [--report <pfad>] [--dry-run]
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
const MarketStore = require(join(engines, "market-store.js"));
const DisplayPolicy = require(join(engines, "display-policy.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const DRY_RUN = argv.includes("--dry-run");
const WORK_DIR = arg("--work-dir", null);
const REPORT = arg("--report", null);
const apiKey = process.env.TIINGO_API_KEY || null;
const today = new Date().toISOString().slice(0, 10);

export const BENCHMARK_ROLE = "BENCHMARK_REFERENCE";

/** Ist die Reihe als Gesamtrendite verwendbar? Dieselbe Regel wie
    scripts/quant/lib/daily-prices.mjs fromBars: jede Bar braucht einen
    bestaetigten adjustedClose. */
export function totalReturnState(bars) {
  if (!Array.isArray(bars) || !bars.length) return { state: "UNAVAILABLE", reason: "NO_BARS" };
  const missing = bars.filter((b) => !(b && b.adjustedClose > 0)).length;
  if (missing) return { state: "UNAVAILABLE", reason: "ADJUSTED_CLOSE_MISSING", missingBars: missing };
  return { state: "AVAILABLE", reason: null, missingBars: 0 };
}

function report(out) {
  console.log(JSON.stringify(out, null, 1));
  if (REPORT) { mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, JSON.stringify(out, null, 1) + "\n"); }
}

async function main() {
  const bm = SCALE.benchmark;
  if (!bm || !bm.symbol || !bm.securityId) throw Error("BENCHMARK_NOT_CONFIGURED");
  const base = { schemaVersion: "benchmark-refresh-1.0.0", generatedAt: new Date().toISOString(), role: BENCHMARK_ROLE,
    symbol: bm.symbol, securityId: bm.securityId, requestedFrom: SCALE.history.initialFrom };

  if (!apiKey && !DRY_RUN) { report({ ...base, state: "SKIPPED", reason: "NO_API_KEY" }); return; }

  const permitted = DisplayPolicy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw",
    gates: DisplayPolicy.gatesFromConfig(JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8")))
  });
  if (!permitted.allowed) { report({ ...base, state: "SKIPPED", reason: "DISPLAY_POLICY", message: permitted.message }); return; }

  const registry = SymbolMapping.createRegistry([{ securityId: bm.securityId, providerId: Tiingo.PROVIDER_ID,
    providerSymbol: bm.symbol, ticker: bm.symbol, exchange: null, currency: "USD", country: "US",
    confidence: "inferred", note: "Benchmark-Referenz, kein Aktienprodukt." }]);
  const provider = Tiingo.createTiingoProvider({ apiKey: apiKey || "dry-run", capabilities: Tiingo.commercialPlanCapabilities(),
    symbolRegistry: registry, baseUrl: process.env.TIINGO_BASE_URL || undefined, fetchImpl: (url, init) => fetch(url, init) });
  const store = MarketStore.createMarketStore({ root, providerId: Tiingo.PROVIDER_ID, workingDir: WORK_DIR || undefined });

  if (DRY_RUN) {
    const stored = store.readBars(bm.securityId, "working");
    report({ ...base, state: "DRY_RUN", stored: stored ? { bars: stored.bars.length, first: stored.first, last: stored.last } : null,
      totalReturn: totalReturnState(stored && stored.bars) });
    return;
  }

  const res = await provider.getDailyBars(bm.securityId, { from: SCALE.history.initialFrom });
  if (!res.available) { report({ ...base, state: "FAIL", reason: "PROVIDER_" + String(res.reason || "UNAVAILABLE").toUpperCase() }); return; }
  const bars = res.data.bars || [];
  const validation = MarketQuality.validateBars(bars, { today, adjustmentStatus: res.data.adjustmentStatus });
  /* Bereinigungssemantik mit derselben Pruefung wie der taegliche Abruf
     (ingest-tiingo): eine Ausschuettung, die in der bereinigten Spalte nicht
     ankommt, widerlegt die Gesamtrendite. Fuer den Vergleichsmassstab ist
     das ein Abbruch, keine Warnung - eine Kursrendite, die als
     Gesamtrendite auftritt, waere die gefaehrlichste Mischung. */
  const semantics = validation.ok ? MarketQuality.validateAdjustmentConsistency(validation.bars, { claimedStatus: "TOTAL_RETURN" }) : null;
  /* Das Urteil faellt der gemeinsame Gesamtrendite-Vertrag (dieselbe
     Funktion wie fuer jede Aktie, market-quality.js totalReturnVerdict). */
  const verdict = validation.ok ? MarketQuality.totalReturnVerdict(validation.bars) : null;
  /* Der Vergleichsmassstab schuettet aus: ohne Dividendenbeleg ist er keine
     Gesamtrendite, auch wenn nichts widerlegt ist. */
  if (verdict && ((!verdict.confirmed && verdict.reason !== "ADJUSTED_CLOSE_MISSING") || semantics.inferredStatus !== "TOTAL_RETURN")) {
    report({ ...base, state: "FAIL", reason: "TOTAL_RETURN_NOT_CONFIRMED", contract: verdict.contract, verdictReason: verdict.reason, bars: bars.length, inferredStatus: semantics.inferredStatus,
      findings: semantics.findings.map((f) => f.code).filter((c, i, a) => a.indexOf(c) === i).slice(0, 8) });
    return;
  }
  const tr = totalReturnState(validation.ok ? validation.bars || bars : bars);
  if (!validation.ok) {
    report({ ...base, state: "FAIL", reason: "QUALITY_CHECK_FAILED", bars: bars.length,
      findings: validation.findings.filter((f) => f.severity === "error").map((f) => f.code).slice(0, 8) });
    return;
  }
  const merged = store.mergeBars(bm.securityId, validation.bars || bars, {
    ticker: bm.symbol, name: null, exchange: null, currency: "USD", adjustmentStatus: res.data.adjustmentStatus,
    provider: Tiingo.PROVIDER_ID, fetchedAt: new Date().toISOString(), role: BENCHMARK_ROLE
  });
  const stored = store.readBars(bm.securityId, "working");
  const assessment = MarketQuality.assessSeries(stored, { today });
  const actions = (stored.bars || []).reduce((a, b) => {
    if (b.dividend > 0) a.dividends++;
    if (b.splitFactor !== null && b.splitFactor !== undefined && b.splitFactor !== 1) a.splits++;
    return a;
  }, { dividends: 0, splits: 0 });
  report({ ...base, state: tr.state === "AVAILABLE" ? "PASS" : "FAIL", reason: tr.state === "AVAILABLE" ? null : tr.reason,
    adjustmentStatus: res.data.adjustmentStatus, bars: stored.bars.length, first: stored.first, last: stored.last,
    added: merged.added, replaced: merged.replaced, totalReturn: tr, corporateActions: actions,
    adjustmentSemantics: { inferredStatus: semantics.inferredStatus, dividendEvidence: semantics.observed.dividendEvidence.length, splitEvidence: semantics.observed.splitEvidence.length },
    quality: assessment ? { status: assessment.status, staleTradingDays: assessment.metrics ? assessment.metrics.staleTradingDays : null } : null });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); report({ schemaVersion: "benchmark-refresh-1.0.0", state: "FAIL", reason: String(e.message || e).slice(0, 200) }); process.exitCode = 0; });
}
