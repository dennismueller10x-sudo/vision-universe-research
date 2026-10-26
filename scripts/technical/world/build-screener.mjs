#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — build-screener.mjs
   ERZEUGER DES TECHNICAL-SCREENER-DATENSATZES

   Eingaben (nur LESEND, alle bereits veroeffentlicht und kanonisch):
     quant/data/product/technical-signals-v1/<XX>.json.gz   Tagesbars + Features (Materialisierung)
     quant/data/market/discover-series-long/ref_*.json      Wochenschluesse (MAX)
     quant/data/market/discover-series/ref_SPY.json         Vergleichsreihe
     quant/data/product/universe-list-v1.json.gz            Namen
   Ausgabe:
     technical/data/screener-v1.json   eine Zeile je Titel, spaltenbasiert
     technical/data/meta.json          Stand, Zaehler, Versionen, Gruende

   Kein Anbieterabruf, kein R2, keine Schluessel. Die Rechnung steckt in
   quant/engines/technical/screen-row.js (dieselbe Funktion koennte der
   Browser rufen). Ein Titel ohne Bundle (zu kurze Historie, Kalender)
   fehlt mit Grund in meta.json, er wird nicht geschaetzt.

   Aufruf:  node scripts/technical/world/build-screener.mjs [--out DIR] [--limit N] [--tickers A,B]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Identity = require(join(root, "core/identity.js"));
const Canonical = require(join(root, "quant/engines/technical/canonical-bars.js"));
const Row = require(join(root, "quant/engines/technical/screen-row.js"));
const Query = require(join(root, "quant/engines/technical/technical-query.js"));
const Indicators = require(join(root, "quant/engines/technical/indicators.js"));
const Formations = require(join(root, "quant/engines/technical/formations.js"));
const Model = require(join(root, "technical/engine/model.js"));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export const SCHEMA_VERSION = "vu-technical-screener-1.0.0";

function readJSON(path) { return JSON.parse(readFileSync(path, "utf8")); }
function readGz(path) { return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")); }

/** Tagesbars (Spalten) -> CanonicalBarSeries fuer die Formationserkennung. */
export function seriesOf(ticker, bars) {
  const rows = bars.timestamps.map((d, i) => ({ date: d, open: bars.open[i], high: bars.high[i], low: bars.low[i], close: bars.close[i], volume: bars.volume[i] }));
  return Canonical.fromRows(rows, { instrumentId: ticker, exchange: "US", currency: "USD", timeframe: "1D",
    priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
}

/** Spaltenform: jede Zeileneigenschaft wird eine Spalte; fehlende Werte null. */
export function toColumns(rows) {
  const keys = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const cols = {};
  [...keys].sort().forEach((k) => { cols[k] = rows.map((r) => (r[k] === undefined ? null : r[k])); });
  return cols;
}

export function build(options = {}) {
  const base = options.root || root;
  const signalsDir = join(base, "quant/data/product/technical-signals-v1");
  const longDir = join(base, "quant/data/market/discover-series-long");
  const names = new Map();
  const listPath = join(base, "quant/data/product/universe-list-v1.json.gz");
  if (existsSync(listPath)) for (const e of readGz(listPath).entries || []) names.set(e.s, e.n);
  const spyPath = join(base, "quant/data/market/discover-series/ref_SPY.json");
  const spy = existsSync(spyPath) ? readJSON(spyPath) : null;
  const benchmark = spy && Array.isArray(spy.points) ? { dates: spy.points.map((p) => p[0]), close: spy.points.map((p) => p[1]), asOf: spy.asOf } : null;

  const shards = readdirSync(signalsDir).filter((f) => /^[A-Z0-9_-]{2}\.json\.gz$/.test(f))  /* "C-", "F-", "T-": Vorzugsaktien (product-materialization.shardKey) */.sort();
  const only = options.tickers ? new Set(options.tickers) : null;
  const rows = [], skipped = {};
  let generatedFrom = null;
  for (const file of shards) {
    const shard = readGz(join(signalsDir, file));
    generatedFrom = generatedFrom && generatedFrom > shard.generatedAt ? generatedFrom : shard.generatedAt;
    for (const ticker of Object.keys(shard.instruments).sort()) {
      if (only && !only.has(ticker)) continue;
      if (options.limit && rows.length >= options.limit) break;
      const inst = shard.instruments[ticker];
      const reason = !inst || inst.isMock || inst.dataMode !== "real" ? "NOT_REAL_DATA"
        : !inst.bars || !Array.isArray(inst.bars.close) || inst.bars.close.length < 60 ? "INSUFFICIENT_BARS"
        : inst.priceSeriesType !== "SPLIT_ADJUSTED" ? "NOT_SPLIT_ADJUSTED" : null;
      if (reason) { skipped[reason] = (skipped[reason] || 0) + 1; continue; }
      const securityId = Identity.securityIdForTicker(ticker);
      const longPath = join(longDir, securityId + ".json");
      const long = existsSync(longPath) ? readJSON(longPath) : null;
      const weekly = long && long.priceSeriesType === "SPLIT_ADJUSTED" && Array.isArray(long.points) ? long.points : null;
      const bundle = inst.bundle || null;
      try {
        const row = Row.computeRow({
          ticker, name: names.get(ticker) || null, securityId,
          bars: inst.bars, series: seriesOf(ticker, inst.bars),
          features: bundle && bundle.featuresAtCutoff || null,
          structure: bundle && bundle.structure && bundle.structure.state || null,
          weekly, benchmark, universeAsOf: options.universeAsOf || null
        });
        if (!bundle) row.noBundle = true;
        rows.push(row);
      } catch (e) {
        const code = "ROW_FAILED";
        skipped[code] = (skipped[code] || 0) + 1;
      }
    }
  }
  /* Stichtag des Universums = haeufigster letzter Bar; "fresh" danach setzen (keine Uhrzeit, reproduzierbar). */
  const freq = {};
  rows.forEach((r) => { freq[r.asOf] = (freq[r.asOf] || 0) + 1; });
  const asOf = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || (a < b ? 1 : -1))[0] || null;
  rows.forEach((r) => { r.fresh = r.asOf === asOf; });
  rows.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));

  const versions = { row: Row.ROW_VERSION, query: Query.QUERY_VERSION, indicators: Indicators.INDICATORS_VERSION, formations: Formations.ENGINE_VERSION };
  const artifact = { schemaVersion: SCHEMA_VERSION, asOf, generatedFrom, versions, benchmark: benchmark ? { ticker: "SPY", asOf: benchmark.asOf } : null,
    count: rows.length, cols: toColumns(rows) };
  const formationCounts = {};
  rows.forEach((r) => (r.formations || []).forEach(([type, state]) => { const k = type + ":" + state; formationCounts[k] = (formationCounts[k] || 0) + 1; }));
  const meta = {
    schemaVersion: "vu-technical-meta-1.0.0", asOf, generatedFrom, versions,
    counts: { rows: rows.length, fresh: rows.filter((r) => r.fresh).length, stale: rows.filter((r) => !r.fresh).length,
      withVolume: rows.filter((r) => r.hasVolume).length, withWeekly: rows.filter((r) => r.weeks >= 40).length,
      with200Weeks: rows.filter((r) => r.newHigh200w !== null).length, noBundle: rows.filter((r) => r.noBundle).length,
      suspectJump60: rows.filter((r) => r.suspectJumpAt).length },
    skipped, formations: formationCounts,
    sources: {
      daily: "quant/data/product/technical-signals-v1 (Materialisierung, SPLIT_ADJUSTED, 270 Tagesbars + Vollhistorien-Features)",
      weekly: "quant/data/market/discover-series-long (Wochenschluesse, SPLIT_ADJUSTED)",
      benchmark: "quant/data/market/discover-series/ref_SPY.json",
      names: "quant/data/product/universe-list-v1.json.gz"
    },
    producer: "scripts/technical/world/build-screener.mjs",
    paths: { screener: "/technical/data/screener-v1.json", index: "/technical/data/index-v1.json", chart: "/quant/data/product/technical-signals-v1/by-ticker/<T>.json.gz" }
  };
  return { artifact, meta };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = arg("--out", join(root, "technical/data"));
  const limit = Number(arg("--limit", "0")) || 0;
  const tickers = arg("--tickers", "") ? arg("--tickers").split(",") : null;
  const started = Date.now();
  const { artifact, meta } = build({ limit, tickers });
  meta.runtimeSec = Math.round((Date.now() - started) / 1000);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "screener-v1.json"), JSON.stringify(artifact));
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 1) + "\n");
  writeFileSync(join(out, "index-v1.json"), JSON.stringify(Model.homeIndex(artifact)));
  console.log(`Technical-Screener: ${meta.counts.rows} Titel, Stand ${meta.asOf}, ${meta.runtimeSec}s -> ${out}`);
  /* Historische Evidenz der Formationen (beschreibend, kausal); bei --limit/--tickers uebersprungen, damit Teilaeufe schnell bleiben. */
  if (!limit && !tickers && process.argv.indexOf("--no-evidence") < 0) {
    const ev = await import("./formation-evidence.mjs");
    const r = ev.buildAndWrite(join(out, "formation-evidence.json"));
    console.log(`Formations-Evidenz: ${r.detections} Erkennungen, ${r.titles} Titel, ${r.runtimeSec}s`);
  }
  console.log("Uebersprungen:", JSON.stringify(meta.skipped));
}
