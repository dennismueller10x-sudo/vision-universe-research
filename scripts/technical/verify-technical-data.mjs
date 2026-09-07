/* =========================================================================
   VISION UNIVERSE TECHNICAL — verify-technical-data.mjs

   Prueft, dass die ausgelieferten Technical-Daten (quant/data/technical/**)
   noch zu den Engines passen — dieselbe Schutzlogik wie
   verify-quant-data.mjs: eine geaenderte Methodik ohne Neuberechnung waere
   ein stiller Datenfehler.

   Prueft je Instrument: Methodikversion, parametersHash, Opportunity Score,
   Primary-Scenario-ID und Snapshot-Content-Hash gegen eine Neuberechnung
   aus den Quelldaten; ausserdem die Snapshot-Unveraenderlichkeit und die
   Abwesenheit von Wahrscheinlichkeits-Formulierungen.

   Ausfuehren: node scripts/technical/verify-technical-data.mjs
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = (n) => require(join(root, "quant", "engines", "technical", n));
const Canonical = T("canonical-bars.js"), Analysis = T("technical-analysis.js"), Snapshot = T("snapshot.js");
const Generator = require(join(root, "quant", "engines", "mock-generator.js"));
const MockProvider = require(join(root, "quant", "engines", "mock-provider.js"));

const DATA = join(root, "quant", "data", "technical");
const read = (rel) => JSON.parse(readFileSync(join(DATA, rel), "utf8"));
const METH = { technical: JSON.parse(readFileSync(join(root, "quant", "methodology", "technical-v1.json"), "utf8")),
               elliott: JSON.parse(readFileSync(join(root, "quant", "methodology", "elliott-v1.json"), "utf8")) };
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

console.log("Vision Universe Technical Intelligence — Datenpruefung\n");
if (!existsSync(join(DATA, "meta.json"))) { console.log("  keine Technical-Daten vorhanden — bitte scripts/technical/build-technical-data.mjs ausfuehren"); process.exit(1); }
const meta = read("meta.json"), index = read("index.json");
console.log(`  Stand ${meta.generatedAt}, Methodik ${meta.methodologyVersions.technical} / ${meta.methodologyVersions.elliott}, ${index.instruments.length} Instrumente, ${meta.snapshots} Snapshots`);
check(meta.methodologyVersions.technical === METH.technical.methodologyVersion, `Methodikversion technical: Daten ${meta.methodologyVersions.technical}, JSON ${METH.technical.methodologyVersion}`);
check(meta.methodologyVersions.elliott === METH.elliott.methodologyVersion, `Methodikversion elliott: Daten ${meta.methodologyVersions.elliott}, JSON ${METH.elliott.methodologyVersion}`);

/* Quellen fuer Neuberechnung */
const marketFile = join(root, "dashboard", "data", "market_data.json");
const md = existsSync(marketFile) ? JSON.parse(readFileSync(marketFile, "utf8")) : null;
const realSeries = {};
if (md) for (const sym of Object.keys(md.symbols)) realSeries[sym] = Canonical.fromRows(md.symbols[sym], { instrumentId: sym, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: md.adjustment, source: "dashboard/data/market_data.json", sourceRevision: md.generated_at_utc, meta: { declaredAdjustment: md.adjustment, semanticsVersion: md.semantics_version } });
let dataset = null, provider = null, benchMock = null;
function mockSeries(ticker) {
  if (!dataset) {
    dataset = Generator.generateDataset(); provider = MockProvider.createMockProvider({ dataset });
    const bm = provider.getBenchmarkBars(Generator.BENCHMARK_ID, {}).data.bars;
    benchMock = Canonical.fromRows(bm.map((r) => ({ date: r.date, open: r.level, high: r.level, low: r.level, close: r.level, volume: null })), { instrumentId: Generator.BENCHMARK_ID, priceSeriesType: "SPLIT_ADJUSTED", source: "mock", sourceRevision: dataset.meta.dataSnapshotId });
  }
  const id = "sec_" + ticker;
  return Canonical.fromPriceBars(provider.getPriceBars(id, {}).data, provider.getCorporateActions(id, {}).data, { instrumentId: ticker, source: "mock", sourceRevision: dataset.meta.dataSnapshotId }).SPLIT_ADJUSTED;
}

const snapshotDir = join(DATA, "snapshots");
const snapshots = existsSync(snapshotDir) ? readdirSync(snapshotDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(snapshotDir, f), "utf8"))) : [];
const byId = Object.fromEntries(snapshots.map((s) => [s.snapshotId, s]));
check(snapshots.length === meta.snapshots, `Snapshot-Anzahl: Dateien ${snapshots.length}, meta ${meta.snapshots}`);

let verified = 0;
for (const row of index.instruments) {
  const file = read(`instruments/${row.instrumentId}.json`);
  const b = file.bundle;
  check(b.methodologyVersion === METH.technical.methodologyVersion, `${row.instrumentId}: Bundle-Methodik ${b.methodologyVersion}`);
  check(b.priceSeriesType === "SPLIT_ADJUSTED", `${row.instrumentId}: nicht SPLIT_ADJUSTED`);
  check(b.opportunityScore.isProbability === false && b.opportunityScore.interpretation === "methodology_rank", `${row.instrumentId}: Score als Wahrscheinlichkeit`);
  const text = JSON.stringify(b.scenarios).concat(JSON.stringify(b.elliott || {}));
  check(!/\d+\s*% (Wahrscheinlichkeit|Chance)|probability of|Erfolgswahrscheinlichkeit: \d/i.test(text), `${row.instrumentId}: Wahrscheinlichkeits-Formulierung im Output`);
  check(file.bars.timestamps[file.bars.timestamps.length - 1] === b.dataCutoff, `${row.instrumentId}: letzte Bar ≠ dataCutoff`);
  const snap = byId[file.snapshotId];
  check(!!snap, `${row.instrumentId}: Snapshot ${file.snapshotId} fehlt`);

  /* Neuberechnung aus den Quelldaten */
  let series = null, bench = null;
  if (file.dataMode === "real" && realSeries[row.instrumentId]) { series = realSeries[row.instrumentId]; bench = row.instrumentId === file.benchmarkId ? null : realSeries[file.benchmarkId] || null; }
  else if (file.dataMode === "mock") { series = mockSeries(row.instrumentId); bench = benchMock; }
  if (!series) { check(false, `${row.instrumentId}: Quelldaten fuer Neuberechnung fehlen`); continue; }
  const fresh = Analysis.analyze({ series, benchmarkSeries: bench, methodology: METH, options: { elliott: true, annotations: true, includeChartSeries: false, displayWindow: "5Y" } });
  check(fresh.dataVersion === b.dataVersion, `${row.instrumentId}: dataVersion weicht ab (Quelle ${fresh.dataVersion}, Daten ${b.dataVersion}) — Quelle geaendert, bitte neu bauen`);
  check(fresh.parametersHash === b.parametersHash, `${row.instrumentId}: parametersHash weicht ab — Methodik/Engine geaendert, bitte neu bauen`);
  check(fresh.opportunityScore.score === b.opportunityScore.score, `${row.instrumentId}: Score ${b.opportunityScore.score} vs. neu ${fresh.opportunityScore.score}`);
  check(fresh.scenarios.primary.scenarioId === b.scenarios.primary.scenarioId, `${row.instrumentId}: Primary-Scenario-ID weicht ab`);
  if (snap) {
    const freshSnap = Snapshot.createSnapshot(fresh);
    check(freshSnap.snapshotId === snap.snapshotId && freshSnap.contentHash === snap.contentHash, `${row.instrumentId}: Snapshot nicht reproduzierbar`);
  }
  verified++;
}
/* Snapshot-Kette: supersedes zeigt nur auf existierende, aeltere Snapshots. */
for (const s of snapshots) if (s.supersedesSnapshotId) check(!!byId[s.supersedesSnapshotId], `Snapshot ${s.snapshotId} referenziert unbekannten Vorgaenger`);

console.log(`  ${verified} Instrumente gegen die Engines nachgerechnet`);
if (problems.length) { console.log("\nPROBLEME:"); problems.forEach((p) => console.log("  - " + p)); process.exit(1); }
console.log("\nOK — Technical-Daten stimmen mit den Engines ueberein.");
