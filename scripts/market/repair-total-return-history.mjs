#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — repair-total-return-history.mjs

   Gesamtrendite-Reparatur fuer Aktien (Owner-Programm 02.10.2026, §10-§12).

   DAS PROBLEM
   Der taegliche Abruf (ingest-tiingo) haengt nur neue Tage an. Gespeicherte
   Bars behalten die adjustedClose-Skala ihres Abruftags; Tiingo skaliert die
   Vergangenheit an jedem Ex-Tag neu. In der Ablage kommt deshalb jede
   Ausschuettung nach dem Erstabruf in der bereinigten Spalte NICHT an - die
   Reihe heisst Gesamtrendite und rechnet an diesen Tagen Kursrendite.
   Gemessen: quant/data/providers/return-basis-universe-study.json
   (NO_ADJUSTMENT_AT_ALL, juengste Ex-Tage).

   DER VERTRAG
   market-quality.js totalReturnVerdict entscheidet - dieselbe Funktion fuer
   SPY (refresh-benchmark-history.mjs), fuer die Signal- und die Setup-Studie
   (scripts/quant/lib/daily-prices.mjs). Eine abgelehnte Reihe rechnet nie
   als Gesamtrendite.

   DIE REPARATUR (repair-mode ADJUSTED_ONLY, seit 02.10.2026)
   Fuer jede abgelehnte Reihe (DIVIDEND_GAP, SPLIT_GAP, CONTRADICTED) EIN
   voller Abruf ab SCALE.history.initialFrom - derselbe Abruf wie fuer SPY.
   Uebernommen wird NUR die Gesamtrendite-Spalte (adjustedClose und, wo
   gespeichert, die uebrigen adjusted*-Felder), und nur fuer die Tage, die
   schon gespeichert sind. Rohkurs, Volumen, Split, Dividende und die Menge
   der Tage bleiben bitgleich - Kursdarstellung, Technik, Faktoren und
   Discover lesen dieselben Zahlen wie vorher. Voraussetzung: jeder
   gespeicherte Tag kommt im Abruf vor, die Rohschluesse stimmen ueberein,
   und die Reihe besteht danach den Vertrag. Sonst bleibt die Ablage
   unangetastet und die Ablehnung zaehlt weiter.

   WARUM NICHT DIE GANZE REIHE ERSETZEN
   Die erste Fassung (02.10.2026, Marktlauf 37013170985) uebernahm die ganze
   neue Reihe. Damit kamen fuer junge Titel fruehere Tage und korrigierte
   Rohkurse in die Ablage, Faktoren und Perzentile verschoben sich, und
   Discover lehnte eine Karte an der 90-%-Grenze ab (PRHIZ). Eine
   Gesamtrendite-Reparatur darf keine Kursrendite-Zahl veraendern. Reihen,
   die jene Fassung im Runner-Cache ersetzt hat, werden aus der dauerhaften
   Ablage (R2) zurueckgeholt, bevor sie spaltenweise repariert werden.

   Begrenzt: hoechstens --max Abrufe je Lauf (juengste Luecke zuerst). Der
   Bericht nennt vorher/nachher je Grund, aber keine Kurse.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/repair-total-return-history.mjs \
       [--work-dir .market-cache] [--report <pfad>] [--max 1500] [--dry-run]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveScope } from "./preview-scope.mjs";

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
const MAX = Number(arg("--max", "1500"));
const apiKey = process.env.TIINGO_API_KEY || null;
const today = new Date().toISOString().slice(0, 10);
const RAW_TOLERANCE = 0.005;
export const REPAIRABLE = ["DIVIDEND_GAP", "SPLIT_GAP", "CONTRADICTED"];
export const REPAIR_MODE = "ADJUSTED_ONLY";
// This repair reads only Tiingo stores and Tiingo provider responses. Keep
// provider semantics explicit at every shared-contract boundary.
const TIINGO_TOTAL_RETURN_OPTIONS = Object.freeze({ dividendConvention: "TIINGO_REINVESTMENT_CLOSE" });
const ADJ_FIELDS = ["adjustedClose", "adjustedOpen", "adjustedHigh", "adjustedLow", "adjustedVolume"];

/** Nur die Gesamtrendite-Spalte uebernehmen, nur fuer gespeicherte Tage.
    Liefert {ok, bars, reason}. Rohkurs, Volumen, Split, Dividende und die
    Tagesmenge bleiben unveraendert; ein fehlender Tag oder ein abweichender
    Rohschluss bricht ab. */
export function adjustedOnly(storedBars, fetchedBars) {
  const byDate = new Map(fetchedBars.map((b) => [String(b.date).slice(0, 10), b]));
  const out = [];
  for (const s of storedBars) {
    const f = byDate.get(String(s.date).slice(0, 10));
    if (!f) return { ok: false, reason: "STORED_DATE_MISSING_IN_FETCH" };
    if (s.close > 0 && f.close > 0 && Math.abs(f.close / s.close - 1) > RAW_TOLERANCE) return { ok: false, reason: "RAW_CLOSE_DISAGREES" };
    if (!(f.adjustedClose > 0)) return { ok: false, reason: "FETCH_ADJUSTED_CLOSE_MISSING" };
    const b = { ...s };
    for (const k of ADJ_FIELDS) if (k in s && f[k] !== undefined && f[k] !== null) b[k] = f[k];
    b.adjustedClose = f.adjustedClose;
    out.push(b);
  }
  return { ok: true, bars: out };
}

/** Hat die erste Fassung die Reihe als Ganzes ersetzt? */
export function replacedWholesale(payload) {
  return !!(payload && payload.totalReturnRepair && payload.totalReturnRepair.mode !== REPAIR_MODE);
}

/** Zaehlt Urteile je Grund. */
export function tally(verdicts) {
  const out = { TOTAL_RETURN_CONFIRMED: 0, TOTAL_RETURN_REJECTED_DIVIDEND_GAP: 0, TOTAL_RETURN_REJECTED_SPLIT_GAP: 0,
    TOTAL_RETURN_REJECTED_STALE: 0, TOTAL_RETURN_REJECTED_OTHER: 0 };
  for (const v of verdicts) {
    if (v.confirmed) out.TOTAL_RETURN_CONFIRMED++;
    else if (v.reason === "DIVIDEND_GAP") out.TOTAL_RETURN_REJECTED_DIVIDEND_GAP++;
    else if (v.reason === "SPLIT_GAP") out.TOTAL_RETURN_REJECTED_SPLIT_GAP++;
    else if (v.reason === "STALE") out.TOTAL_RETURN_REJECTED_STALE++;
    else out.TOTAL_RETURN_REJECTED_OTHER++;
  }
  return out;
}

/** Bestaetigt die neue Reihe die gespeicherten Rohschluesse? Eine
    Neubereinigung aendert adjustedClose, nie close. */
export function rawCloseAgreement(storedBars, fetchedBars) {
  const byDate = new Map(fetchedBars.map((b) => [String(b.date).slice(0, 10), b]));
  let compared = 0, mismatched = 0, missing = 0;
  for (const s of storedBars) {
    const f = byDate.get(String(s.date).slice(0, 10));
    if (!f) { missing++; continue; }
    if (!(s.close > 0 && f.close > 0)) continue;
    compared++;
    if (Math.abs(f.close / s.close - 1) > RAW_TOLERANCE) mismatched++;
  }
  return { compared, mismatched, missing, ok: compared > 0 && mismatched / compared <= 0.001 && missing / storedBars.length <= 0.01 };
}

function report(out) {
  console.log(JSON.stringify({ ...out, repaired: undefined, failed: undefined }, null, 1));
  if (REPORT) { mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, JSON.stringify(out, null, 1) + "\n"); }
}

async function restoreWholesale(store, securities) {
  const affected = securities.filter((s) => replacedWholesale(store.readBars(s.securityId, "working")));
  const res = { affected: affected.length, restored: 0, failed: 0, reason: null };
  if (!affected.length) return res;
  const need = ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"];
  if (need.some((k) => !process.env[k])) { res.reason = "R2_UNAVAILABLE"; return res; }
  const Store = require(join(engines, "history-store.js"));
  const Guard = require(join(engines, "zero-cost-guard.js"));
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  const durable = Store.createHistoryStore({ driver: createS3DriverFromEnv(process.env), provider: Tiingo.PROVIDER_ID, market: "US",
    budget: Guard.createBudget({ classAOperations: 10, classBOperations: affected.length + 10 }) });
  const dir = join(store.workingDir, Tiingo.PROVIDER_ID, "daily");
  for (const s of affected) {
    try {
      const series = await durable.getSeries(s.ticker);
      if (!series || series.securityId !== s.securityId || !Array.isArray(series.bars) || !series.bars.length) { res.failed++; continue; }
      const payload = store.readBars(s.securityId, "working");
      const bars = series.bars.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const next = { ...payload, bars, barCount: bars.length, first: bars[0].date, last: bars[bars.length - 1].date, totalReturnRepair: null,
        restoredFromDurable: { at: new Date().toISOString(), reason: "WHOLESALE_REPAIR_REVERTED" } };
      writeFileSync(join(dir, s.securityId + ".json"), JSON.stringify(next));
      res.restored++;
    } catch { res.failed++; }
  }
  return res;
}

async function main() {
  const base = { schemaVersion: "total-return-repair-1.0.0", generatedAt: new Date().toISOString(), contract: MarketQuality.TR_CONTRACT_VERSION, max: MAX };
  const store = MarketStore.createMarketStore({ root, providerId: Tiingo.PROVIDER_ID, workingDir: WORK_DIR || undefined });
  const benchmarkId = SCALE.benchmark && SCALE.benchmark.securityId;
  const scope = resolveScope(root, JSON.parse(readFileSync(join(root, "quant", "config", "development-preview.json"), "utf8")));
  const bySecurity = new Map(scope.securities.map((s) => [s.securityId, s]));

  /* Rueckholung: Reihen, die die erste Fassung als Ganzes ersetzt hat,
     kommen aus der dauerhaften Ablage zurueck (dort liegt noch der Stand
     vor der Reparatur, weil jener Lauf nicht gepusht hat). */
  const restored = await restoreWholesale(store, scope.securities);

  /* Vorher: jede gespeicherte Titelreihe des Umfangs durch den Vertrag. */
  const verdicts = new Map();
  for (const s of scope.securities) {
    if (s.securityId === benchmarkId) continue;
    const stored = store.readBars(s.securityId, "working");
    if (!stored || !Array.isArray(stored.bars) || !stored.bars.length) continue;
    verdicts.set(s.securityId, MarketQuality.totalReturnVerdict(stored.bars, TIINGO_TOTAL_RETURN_OPTIONS));
  }
  const before = tally([...verdicts.values()]);
  const queue = [...verdicts.entries()].filter(([, v]) => !v.confirmed && REPAIRABLE.includes(v.reason))
    .sort((a, b) => String(b[1].lastGap || "").localeCompare(String(a[1].lastGap || "")) || a[0].localeCompare(b[0]));
  const out = { ...base, mode: REPAIR_MODE, restoredFromDurable: restored, seriesChecked: verdicts.size, before, repairable: queue.length };

  if (!apiKey || DRY_RUN) { report({ ...out, state: apiKey ? "DRY_RUN" : "SKIPPED", reason: apiKey ? null : "NO_API_KEY", after: before }); return; }
  const permitted = DisplayPolicy.check({
    providerId: "tiingo", dataClass: "marketData", audience: "internal", form: "raw",
    gates: DisplayPolicy.gatesFromConfig(JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8")))
  });
  if (!permitted.allowed) { report({ ...out, state: "SKIPPED", reason: "DISPLAY_POLICY", after: before }); return; }

  const todo = queue.slice(0, MAX);
  const registry = SymbolMapping.createRegistry(todo.map(([id]) => {
    const s = bySecurity.get(id);
    return { securityId: id, providerId: Tiingo.PROVIDER_ID, providerSymbol: s.ticker, ticker: s.ticker, exchange: s.exchange || null,
      mic: s.mic || null, currency: "USD", country: "US", confidence: "inferred", note: "Gesamtrendite-Reparatur (voller Abruf)." };
  }));
  const provider = Tiingo.createTiingoProvider({ apiKey, capabilities: Tiingo.commercialPlanCapabilities(), symbolRegistry: registry,
    baseUrl: process.env.TIINGO_BASE_URL || undefined, fetchImpl: (url, init) => fetch(url, init) });

  const results = { repaired: [], failed: [] };
  const failReasons = {};
  let requests = 0;
  for (const [id, v] of todo) {
    const s = bySecurity.get(id);
    requests++;
    let res;
    try { res = await provider.getDailyBars(id, { from: SCALE.history.initialFrom }); } catch (e) { res = { available: false, reason: "EXCEPTION" }; }
    const fail = (why) => { failReasons[why] = (failReasons[why] || 0) + 1; results.failed.push([id, v.reason, why]); };
    if (!res.available) { fail("PROVIDER_" + String(res.reason || "UNAVAILABLE").toUpperCase()); continue; }
    const validation = MarketQuality.validateBars(res.data.bars || [], { today, adjustmentStatus: res.data.adjustmentStatus });
    if (!validation.ok) { fail("QUALITY_CHECK_FAILED"); continue; }
    const fresh = validation.bars;
    const verdict = MarketQuality.totalReturnVerdict(fresh, TIINGO_TOTAL_RETURN_OPTIONS);
    if (!verdict.confirmed) { fail("STILL_" + verdict.reason); continue; }
    const stored = store.readBars(id, "working");
    const merged = adjustedOnly(stored.bars, fresh);
    if (!merged.ok) { fail(merged.reason); continue; }
    if (!MarketQuality.totalReturnVerdict(merged.bars, TIINGO_TOTAL_RETURN_OPTIONS).confirmed) { fail("MERGED_NOT_CONFIRMED"); continue; }
    store.mergeBars(id, merged.bars, { totalReturnRepair: { mode: REPAIR_MODE, contract: MarketQuality.TR_CONTRACT_VERSION, at: new Date().toISOString(), previous: v.reason } });
    const after = MarketQuality.totalReturnVerdict(store.readBars(id, "working").bars, TIINGO_TOTAL_RETURN_OPTIONS);
    if (after.confirmed) { results.repaired.push([id, v.reason]); verdicts.set(id, after); }
    else { fail("MERGED_STILL_" + after.reason); verdicts.set(id, after); }
  }
  const after = tally([...verdicts.values()]);
  report({ ...out, state: "DONE", requests, repairedCount: results.repaired.length, failedCount: results.failed.length, failReasons,
    remainingRepairable: queue.length - results.repaired.length, after, repaired: results.repaired, failed: results.failed });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); report({ schemaVersion: "total-return-repair-1.0.0", state: "FAIL", reason: String(e.message || e).slice(0, 200) }); process.exitCode = 0; });
}
