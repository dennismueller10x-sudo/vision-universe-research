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

   DIE REPARATUR
   Fuer jede abgelehnte Reihe (DIVIDEND_GAP, SPLIT_GAP, CONTRADICTED) EIN
   voller Abruf ab SCALE.history.initialFrom - derselbe Weg wie fuer SPY,
   keine Sonderberechnung. Die neue Reihe wird nur uebernommen, wenn SIE den
   Vertrag besteht und die Rohschluesse der bisherigen Bars bestaetigt
   (Rohschluss und Splitfaktor aendern sich durch eine Neubereinigung nicht;
   weicht ein Rohschluss ab, ist es nicht dieselbe Reihe). Sonst bleibt die
   Ablage unangetastet und die Ablehnung zaehlt weiter.

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
export const REPAIRABLE = ["DIVIDEND_GAP", "SPLIT_GAP", "CONTRADICTED"];
const RAW_TOLERANCE = 0.005;

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

async function main() {
  const base = { schemaVersion: "total-return-repair-1.0.0", generatedAt: new Date().toISOString(), contract: MarketQuality.TR_CONTRACT_VERSION, max: MAX };
  const store = MarketStore.createMarketStore({ root, providerId: Tiingo.PROVIDER_ID, workingDir: WORK_DIR || undefined });
  const benchmarkId = SCALE.benchmark && SCALE.benchmark.securityId;
  const scope = resolveScope(root, JSON.parse(readFileSync(join(root, "quant", "config", "development-preview.json"), "utf8")));
  const bySecurity = new Map(scope.securities.map((s) => [s.securityId, s]));

  /* Vorher: jede gespeicherte Titelreihe des Umfangs durch den Vertrag. */
  const verdicts = new Map();
  for (const s of scope.securities) {
    if (s.securityId === benchmarkId) continue;
    const stored = store.readBars(s.securityId, "working");
    if (!stored || !Array.isArray(stored.bars) || !stored.bars.length) continue;
    verdicts.set(s.securityId, MarketQuality.totalReturnVerdict(stored.bars));
  }
  const before = tally([...verdicts.values()]);
  const queue = [...verdicts.entries()].filter(([, v]) => !v.confirmed && REPAIRABLE.includes(v.reason))
    .sort((a, b) => String(b[1].lastGap || "").localeCompare(String(a[1].lastGap || "")) || a[0].localeCompare(b[0]));
  const out = { ...base, seriesChecked: verdicts.size, before, repairable: queue.length };

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
    const verdict = MarketQuality.totalReturnVerdict(fresh);
    if (!verdict.confirmed) { fail("STILL_" + verdict.reason); continue; }
    const stored = store.readBars(id, "working");
    const agree = rawCloseAgreement(stored.bars, fresh);
    if (!agree.ok) { fail("RAW_CLOSE_DISAGREES"); continue; }
    store.mergeBars(id, fresh, { ticker: s.ticker, adjustmentStatus: res.data.adjustmentStatus, provider: Tiingo.PROVIDER_ID,
      fetchedAt: new Date().toISOString(), totalReturnRepair: { contract: MarketQuality.TR_CONTRACT_VERSION, at: new Date().toISOString(), previous: v.reason } });
    const after = MarketQuality.totalReturnVerdict(store.readBars(id, "working").bars);
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
