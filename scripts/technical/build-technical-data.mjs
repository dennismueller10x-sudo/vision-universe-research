/* =========================================================================
   VISION UNIVERSE TECHNICAL — build-technical-data.mjs

   Praekomputation der Technical Intelligence (EOD). Folgt dem Repository-
   Muster (statisches JSON, Frontend liest nur quant/data/**).

   Quellen:
     1. Reale Tageskurse aus dashboard/data/market_data.json (deklariert
        SPLIT_ADJUSTED). Nur hier, im Build-Skript, wird die Dashboard-
        Datei gelesen — das Frontend liest ausschliesslich quant/data/**.
        Der Import ist vendor-neutral (generischer OHLCV-Adapter).
     2. Das synthetische Mock-Universum (511 Titel, 2006–2026) fuer den
        Universe-Scan, die Split-Fixture und lange Lookbacks.

   Ausgabe: quant/data/technical/
     meta.json, index.json, instruments/<ID>.json (Bars + Bundle + Snapshot),
     scan-mock.json, snapshots/<snapshotId>.json, evidence-walkforward.json

   Ausfuehren: node scripts/technical/build-technical-data.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const T = (n) => require(join(root, "quant", "engines", "technical", n));
const Canonical = T("canonical-bars.js"), Analysis = T("technical-analysis.js"), Snapshot = T("snapshot.js"), Storage = T("storage.js"), Scanner = T("scanner.js");
const Generator = require(join(root, "quant", "engines", "mock-generator.js"));
const MockProvider = require(join(root, "quant", "engines", "mock-provider.js"));
const Hash = require(join(root, "quant", "engines", "hash.js"));

const METH = { technical: JSON.parse(readFileSync(join(root, "quant", "methodology", "technical-v1.json"), "utf8")),
               elliott: JSON.parse(readFileSync(join(root, "quant", "methodology", "elliott-v1.json"), "utf8")) };
const OUT = join(root, "quant", "data", "technical");
const REAL_BENCHMARK = "SPY";
const WALKFORWARD_CUTOFFS = ["2022-01-03", "2023-01-03", "2024-01-02", "2025-01-02", "2026-01-02"];

function write(rel, data) {
  const file = join(OUT, rel); mkdirSync(dirname(file), { recursive: true });
  const json = JSON.stringify(data); writeFileSync(file, json);
  console.log(`  ${rel.padEnd(44)} ${(Buffer.byteLength(json) / 1024).toFixed(0).padStart(6)} KB`);
}
function compactBars(s) { return { timestamps: s.timestamps, open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume, corporateActionFlags: s.corporateActionFlags }; }

console.log("Vision Universe Technical Intelligence — Praekomputation\n");
const started = Date.now();
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const store = Storage.createJsonFileStore(join(OUT, "snapshots"));
const index = [];

/* ------------------------------------------------ 1 Reale Referenztitel */
console.log("1/4  Reale Tageskurse (Dashboard-Marktdaten, deklariert) → CanonicalBars …");
const marketFile = join(root, "dashboard", "data", "market_data.json");
let realSeries = {}, realMeta = null;
if (existsSync(marketFile)) {
  const md = JSON.parse(readFileSync(marketFile, "utf8"));
  realMeta = { adjustment: md.adjustment, semanticsVersion: md.semantics_version, generatedAt: md.generated_at_utc, interval: md.interval, provider: md.provider };
  const level = md.adjustment === "SPLIT_ADJUSTED" ? "SPLIT_ADJUSTED" : md.adjustment === "TOTAL_RETURN" ? "TOTAL_RETURN" : "RAW";
  for (const sym of Object.keys(md.symbols)) {
    realSeries[sym] = Canonical.fromRows(md.symbols[sym], { instrumentId: sym, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: level,
      source: "dashboard/data/market_data.json", sourceRevision: md.generated_at_utc, meta: { declaredAdjustment: md.adjustment, semanticsVersion: md.semantics_version } });
  }
  console.log(`     ${Object.keys(realSeries).length} Symbole, Bereinigung deklariert: ${md.adjustment}`);
} else console.log("     keine Dashboard-Marktdaten vorhanden — reale Titel werden uebersprungen");

const bench = realSeries[REAL_BENCHMARK] || null;
for (const sym of Object.keys(realSeries)) {
  const s = realSeries[sym];
  if (s.priceSeriesType !== "SPLIT_ADJUSTED") { console.log(`     ${sym}: ${s.priceSeriesType} — nicht SPLIT_ADJUSTED, uebersprungen`); continue; }
  const b = Analysis.analyze({ series: s, benchmarkSeries: sym === REAL_BENCHMARK ? null : bench, methodology: METH, options: { elliott: true, annotations: true, includeChartSeries: true, displayWindow: "5Y" } });
  const snap = Snapshot.createSnapshot(b, { createdAt: new Date().toISOString() });
  store.put(snap);
  write(`instruments/${sym}.json`, { instrumentId: sym, dataMode: "real", isMock: false, source: s.source, sourceRevision: s.sourceRevision, priceSeriesType: s.priceSeriesType, benchmarkId: sym === REAL_BENCHMARK ? null : REAL_BENCHMARK, bars: compactBars(s), bundle: b, snapshotId: snap.snapshotId });
  index.push({ instrumentId: sym, name: sym, dataMode: "real", isMock: false, asOf: b.analysisTime, bars: s.length, from: s.timestamps[0], opportunityScore: b.opportunityScore.score, trend: b.trend.direction, primaryDirection: b.scenarios.primary ? b.scenarios.primary.direction : null, elliottStatus: b.elliott ? b.elliott.status : null, snapshotId: snap.snapshotId });
}

/* ------------------------------------------ 2 Walk-Forward: Projected vs Actual */
console.log("2/4  Walk-Forward-Snapshots (Projected vs Actual) …");
const evidence = [];
for (const sym of ["NVDA", "MSFT"].filter((k) => realSeries[k])) {
  for (const cut of WALKFORWARD_CUTOFFS) {
    const idx = Canonical.indexAtOrBefore(realSeries[sym], cut);
    if (idx < 260) continue;
    const b = Analysis.analyzeAsOf({ series: realSeries[sym], benchmarkSeries: bench, methodology: METH, options: { elliott: true, annotations: true } }, idx);
    const snap = Snapshot.createSnapshot(b, { createdAt: new Date().toISOString() });
    store.put(snap);
    const rec = Snapshot.createEvidenceRecord(snap, b.scenarios.primary);
    evidence.push({ instrumentId: sym, cutoff: b.dataCutoff, snapshotId: snap.snapshotId, primary: snap.frozen.scenarios[0], elliott: snap.frozen.elliott,
                    annotations: b.annotations, outcome: rec ? Snapshot.evaluateOutcome(rec, realSeries[sym]) : null });
  }
}
write("evidence-walkforward.json", { note: "Historische Snapshots mit damaligem Datenstand; Outcome walk-forward ausgewertet. Stichprobe zu klein fuer Erfolgsquoten.", aggregate: Snapshot.aggregateEvidence(evidence.map((e) => e.outcome).filter(Boolean), METH.technical.evidence.minEffectiveSample), records: evidence });

/* ------------------------------------------------------- 3 Mock-Universum */
console.log("3/4  Synthetisches Universum → Scan …");
const dataset = Generator.generateDataset();
const provider = MockProvider.createMockProvider({ dataset });
const asOf = dataset.meta.end;
const bm = provider.getBenchmarkBars(Generator.BENCHMARK_ID, {}).data.bars;
const benchMock = Canonical.fromRows(bm.map((r) => ({ date: r.date, open: r.level, high: r.level, low: r.level, close: r.level, volume: null })), { instrumentId: Generator.BENCHMARK_ID, priceSeriesType: "SPLIT_ADJUSTED", source: "mock", sourceRevision: dataset.meta.dataSnapshotId });
const universe = [];
for (const sec of provider.getSecurities({ asOf, status: "active" }).data) {
  const bars = provider.getPriceBars(sec.securityId, {}).data;
  if (!bars || bars.length < 300) continue;
  const worlds = Canonical.fromPriceBars(bars, provider.getCorporateActions(sec.securityId, {}).data, { instrumentId: sec.ticker, source: "mock", sourceRevision: dataset.meta.dataSnapshotId });
  universe.push({ instrumentId: sec.ticker, series: worlds.SPLIT_ADJUSTED, meta: { name: sec.name, sector: sec.sector, industry: sec.industry, securityId: sec.securityId, isMock: true } });
}
const scan = Scanner.scanUniverse({ universe, benchmarkSeries: benchMock, methodology: METH, universeId: "vu-mock-universe", universeVersion: dataset.meta.dataSnapshotId });
write("scan-mock.json", Object.assign({ isMock: true, mockNotice: dataset.meta.mockNotice || "Synthetisches Universum. Keine realen Marktdaten." }, scan));
console.log(`     ${scan.count} Titel gescannt, ${scan.errors.length} Fehler`);

/* Fixtures + Top-Scan als Instrumentdateien (mit Elliott/Annotationen). */
const fixtureIds = Generator.FIXTURES.map((f) => f.ticker);
const topIds = scan.rows.slice(0, 8).map((r) => r.instrumentId);
for (const u of universe.filter((x) => fixtureIds.includes(x.instrumentId) || topIds.includes(x.instrumentId))) {
  const b = Analysis.analyze({ series: u.series, benchmarkSeries: benchMock, methodology: METH, options: { elliott: true, annotations: true, includeChartSeries: true, displayWindow: "5Y" } });
  const snap = Snapshot.createSnapshot(b, { createdAt: new Date().toISOString(), universeVersion: dataset.meta.dataSnapshotId });
  store.put(snap);
  write(`instruments/${u.instrumentId}.json`, { instrumentId: u.instrumentId, dataMode: "mock", isMock: true, name: u.meta.name, source: "mock", sourceRevision: dataset.meta.dataSnapshotId, priceSeriesType: "SPLIT_ADJUSTED", benchmarkId: Generator.BENCHMARK_ID, bars: compactBars(u.series), bundle: b, snapshotId: snap.snapshotId });
  index.push({ instrumentId: u.instrumentId, name: u.meta.name, dataMode: "mock", isMock: true, asOf: b.analysisTime, bars: u.series.length, from: u.series.timestamps[0], opportunityScore: b.opportunityScore.score, trend: b.trend.direction, primaryDirection: b.scenarios.primary ? b.scenarios.primary.direction : null, elliottStatus: b.elliott ? b.elliott.status : null, snapshotId: snap.snapshotId });
}

/* ------------------------------------------------------------- 4 Meta */
console.log("4/4  Index und Meta …");
write("index.json", { generatedAt: new Date().toISOString(), instruments: index.sort((a, b) => a.instrumentId.localeCompare(b.instrumentId)) });
write("meta.json", {
  generatedAt: new Date().toISOString(), bundleVersion: Analysis.ENGINE_BUNDLE_VERSION,
  methodologyVersions: { technical: METH.technical.methodologyVersion, elliott: METH.elliott.methodologyVersion },
  methodologyHash: Hash.hashValue(METH), realData: realMeta ? { symbols: Object.keys(realSeries).length, adjustment: realMeta.adjustment, semanticsVersion: realMeta.semanticsVersion, sourceGeneratedAt: realMeta.generatedAt, benchmark: REAL_BENCHMARK, note: "Reale Tageskurse aus dem Dashboard-Marktdatenbestand, deklariert splitbereinigt. Anzeige gemaess bestehender Dashboard-Freigabe." } : null,
  mockData: { seed: dataset.meta.seed, dataSnapshotId: dataset.meta.dataSnapshotId, securities: universe.length, isMock: true },
  snapshots: store.count(), walkForwardCutoffs: WALKFORWARD_CUTOFFS
});
console.log(`\nFertig in ${((Date.now() - started) / 1000).toFixed(1)} s · ${store.count()} Snapshots`);
