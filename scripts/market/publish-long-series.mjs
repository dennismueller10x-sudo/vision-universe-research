/* =========================================================================
   VISION UNIVERSE — publish-long-series.mjs

   LANGE KURSREIHEN FUER 5J UND MAX - AUS DER HISTORIENABLAGE, ALS
   WOCHENSCHLUSSKURSE

   Die kompakten Discover-Reihen (publish-discover-series.mjs) tragen ein
   Jahr Tagesschluss. Fuer "5J" und "Max" braucht die Aktienseite die
   ganze Historie - sie liegt in der Historienablage (R2, history-store.js,
   Median 6,8 Jahre, bis 36 Jahre je Titel). Dieses Skript liest sie dort
   (ein GET je Titel, keine Kursabfrage beim Anbieter) und veroeffentlicht
   je Titel eine Wochenreihe:

     quant/data/market/discover-series-long/<securityId>.json
       points: [datum, schluss] - der letzte Handelstag jeder ISO-Woche,
       split-bereinigt nach demselben Verfahren wie die Tagesreihe
       (splitFactor, nicht adjClose), gerundet auf Cent.

   Kein Punkt wird erfunden: Wochen ohne Handel fehlen, Luecken bleiben
   Luecken. Die Aktienseite haengt die Tagesreihe hinten an
   (series-sampling.js mergeWeeklyWithDaily), damit der letzte Punkt der
   juengste Schluss ist.

   Umfang und Grundlage kommen aus development-preview.json (dieselbe
   Freigabe wie die Tagesreihen); assert-public-data-hygiene.mjs prueft
   beides. Ohne Speicherzugang (VU_HISTORY_S3_*) oder --local=<Ordner>
   passiert nichts.

   Aufruf (CI):  node scripts/market/publish-long-series.mjs
   Nachweis:     node scripts/market/publish-long-series.mjs --local=.market-history --only=AAPL,MSFT
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPreviewConfig, resolveScope, expandPreviewConfig } from "./preview-scope.mjs";
import { splitAdjustedCloses } from "./publish-discover-series.mjs";
import { benchmarkSpec } from "./benchmark-reference.mjs";

const require = createRequire(import.meta.url);
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const hit = argv.find((a) => a.startsWith(name + "=")); return hit ? hit.slice(name.length + 1) : fallback; };
const flag = (name) => argv.includes(name);

const root = arg("--root", DEFAULT_ROOT);
const LOCAL = arg("--local", null);
const ONLY = arg("--only", null) ? new Set(arg("--only").split(",").map((t) => t.trim().toUpperCase())) : null;
const CONCURRENCY = parseInt(arg("--concurrency", "8"), 10);
const DRY_RUN = flag("--dry-run");
const PRUNE = !flag("--no-prune");
/* --prune-only: keine Ablage, kein Abruf - nur Reihen entfernen, die nicht mehr im Umfang stehen (z. B. nach einer
   Gattungskorrektur im Wertpapierstamm), und den Index nachfuehren. Wie publish-discover-series.mjs --prune-only. */
const PRUNE_ONLY = flag("--prune-only");
const MIN_WEEKS = 30;

export const LONG_SERIES_DIR = join("quant", "data", "market", "discover-series-long");
export const LONG_SERIES_SCHEMA = "discover-series-long-1.0.0";
const OUT_DIR = join(root, LONG_SERIES_DIR);

const Sampling = require(join(root, "quant", "engines", "series-sampling.js"));
const PublishedClose = require(join(root, "quant", "engines", "published-close.js"));
const Store = require(join(root, "quant", "engines", "history-store.js"));
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const DisplayPolicy = require(join(root, "quant", "engines", "display-policy.js"));
const SC = require(join(root, "quant", "engines", "survivorship-control.js"));
const CorporateActions = require(join(root, "quant", "engines", "corporate-action-evidence.js"));
const GATE_CONFIG = JSON.parse(readFileSync(join(root, "quant", "config", "feature-gates.json"), "utf8"));
const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

console.log("Vision Universe — lange Kursreihen (Wochenschluss) aus der Historienablage\n");

/* --------------------------------------------------- Grundlage */
const config = loadPreviewConfig(root);
const scope = resolveScope(root, config);
DisplayPolicy.declareFromConfig(expandPreviewConfig(config, scope));
const gates = DisplayPolicy.gatesFromConfig(GATE_CONFIG);
const permission = DisplayPolicy.check({ providerId: "tiingo", dataClass: "marketData", audience: "public", form: "raw", gates });
if (!permission.allowed) { console.error("  ABBRUCH: " + permission.message); process.exit(1); }
console.log(`  Grundlage: ${permission.basis}`);
/* Die Benchmark (SPY) liegt als BENCHMARK_REFERENCE in der Historienablage,
   ist aber kein Titel: discover-series-long ist die Titelliste der Studien
   (Signal-Backtest, Muster, Radar). Sie kommt hier nie hinein. */
const BENCHMARK = benchmarkSpec(SCALE);
const securities = scope.securities.filter((s) => (!ONLY || ONLY.has(s.ticker)) &&
  !(BENCHMARK && (s.securityId === BENCHMARK.securityId || s.ticker === BENCHMARK.ticker)));
console.log(`  Umfang: ${securities.length} Titel`);

if (PRUNE_ONLY) {
  const imUmfang = new Set(securities.map((s) => s.securityId + ".json"));
  let entfernt = 0;
  for (const name of readdirSync(OUT_DIR).filter((n) => n.endsWith(".json") && n !== "index.json")) {
    if (imUmfang.has(name)) continue;
    if (!DRY_RUN) rmSync(join(OUT_DIR, name));
    entfernt++; console.log(`  entfernt: ${name} (nicht im Umfang)`);
  }
  if (!DRY_RUN && entfernt) {
    const index = JSON.parse(readFileSync(join(OUT_DIR, "index.json"), "utf8"));
    index.count = readdirSync(OUT_DIR).filter((n) => n.endsWith(".json") && n !== "index.json").length;
    index.pruned = { at: new Date().toISOString(), removed: entfernt, reason: "nicht mehr im Umfang (--prune-only)" };
    writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 1) + "\n");
  }
  console.log(`\n  --prune-only: ${entfernt} Reihen entfernt`);
  process.exit(0);
}

/* --------------------------------------------------- Ablage */
let driver;
if (LOCAL) {
  const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
  driver = createFsDriver(LOCAL);
} else {
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  driver = createS3DriverFromEnv();
}
const budget = Guard.createBudget({ classAOperations: 0, classBOperations: securities.length + 50 });
const history = (SCALE.history && SCALE.history.store) || {};
const store = Store.createHistoryStore({ driver, provider: "tiingo", market: "US", budget,
                                         prefix: history.prefix || undefined, codec: history.codec || undefined });

/* --------------------------------------------------- Lauf */
const bilanz = { requested: securities.length, written: 0, unchanged: 0, missing: 0, tooShort: 0, failed: 0 };
const t0 = Date.now();
mkdirSync(OUT_DIR, { recursive: true });
const warteschlange = securities.slice();
const geschrieben = new Set();

async function einer(s) {
  let reihe;
  try { reihe = await store.getSeries(s.ticker); }
  catch (err) { bilanz.failed++; console.error(`  ${s.ticker}: ${String(err.message).slice(0, 100)}`); return; }
  if (!reihe || !reihe.bars || !reihe.bars.length) { bilanz.missing++; return; }
  /* Nur das juengste Listing: nach mehr als einem Jahr ohne Kerze traegt
     das Kuerzel eine andere Firma (survivorship-control.js). */
  const aktuell = SC.currentListingSegment(reihe.bars).bars;
  const closes = splitAdjustedCloses(aktuell).filter((b) => Number.isFinite(b.close) && b.close > 0);
  const weekly = Sampling.weeklyPoints(closes.map((b) => [b.date, b.close]));
  if (weekly.length < MIN_WEEKS) { bilanz.tooShort++; return; }
  const points = weekly.map((p) => [p[0], PublishedClose.roundClose(p[1])]);
  const doc = {
    schemaVersion: LONG_SERIES_SCHEMA,
    status: "CALCULATED", source: reihe.provider || "tiingo",
    securityId: s.securityId, ticker: s.ticker, instrumentId: s.ticker,
    provider: reihe.provider || "tiingo", dataMode: "real",
    priceSeriesType: "SPLIT_ADJUSTED", currency: "USD",
    range: "MAX", grain: "weekly",
    from: weekly[0][0], to: weekly[weekly.length - 1][0], asOf: weekly[weekly.length - 1][0],
    points,
    /* Beleg der Kapitalmassnahmen (Splittage des Anbieters, Wochen mit Kurssprung in Split-Groesse samt groesstem
       Tagessprung): damit unterscheidet die Datenqualitaet eine echte Kursbewegung von einer verpassten Bereinigung
       (quant/engines/corporate-action-evidence.js). */
    corporateActions: CorporateActions.evidence(closes, points, aktuell),
    barCount: weekly.length, sourceBarCount: aktuell.length,
    sourceFirst: aktuell[0].date, sourceLast: aktuell[aktuell.length - 1].date,
    publishBasis: permission.basis, publishCheckedAt: permission.checkedAt || null,
    note: "Lange Reihe fuer Discover (5J, Max): Schlusskurs des letzten Handelstags jeder ISO-Woche, split-bereinigt, " +
          weekly.length + " Wochen ab " + weekly[0][0] + ". Kein Intraday, keine Volumina, keine OHLC, nichts interpoliert."
  };
  const f = join(OUT_DIR, s.securityId + ".json");
  const text = JSON.stringify(doc);
  geschrieben.add(s.securityId + ".json");
  if (existsSync(f) && readFileSync(f, "utf8") === text) { bilanz.unchanged++; return; }
  if (!DRY_RUN) writeFileSync(f, text);
  bilanz.written++;
}
async function arbeiter() { while (warteschlange.length) { await einer(warteschlange.shift()); } }
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, arbeiter));

/* Reihen ausserhalb des Umfangs (Universumswechsel) verschwinden. */
if (PRUNE && !DRY_RUN && !ONLY) {
  const imUmfang = new Set(securities.map((s) => s.securityId + ".json"));
  for (const name of readdirSync(OUT_DIR).filter((n) => n.endsWith(".json") && n !== "index.json")) {
    if (!imUmfang.has(name)) { rmSync(join(OUT_DIR, name)); console.log(`  entfernt: ${name} (nicht im Umfang)`); }
  }
}
if (!DRY_RUN) {
  const vorhanden = readdirSync(OUT_DIR).filter((n) => n.endsWith(".json") && n !== "index.json").sort();
  const index = {
    schemaVersion: "discover-series-long-index-1.0.0",
    generatedAt: new Date().toISOString(),
    note: "Lange Discover-Kursreihen (Wochenschluss, split-bereinigt) aus der Historienablage. Erzeugt von scripts/market/publish-long-series.mjs; geprueft von assert-public-data-hygiene.mjs.",
    grain: "weekly", range: "MAX", count: vorhanden.length,
    pathPattern: "/" + LONG_SERIES_DIR + "/<securityId>.json",
    summary: bilanz
  };
  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 1) + "\n");
}
console.log(`\n  geschrieben ${bilanz.written} · unveraendert ${bilanz.unchanged} · ohne Historie ${bilanz.missing} · zu kurz ${bilanz.tooShort} · fehlgeschlagen ${bilanz.failed}`);
console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s · Speicherbudget: ${JSON.stringify(budget.usage || {})}`);
if (bilanz.failed > securities.length * 0.05) { console.error("  ABBRUCH: zu viele Fehler."); process.exit(1); }
