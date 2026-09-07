/* =========================================================================
   VISION UNIVERSE QUANT — build-quant-data.mjs

   Praekomputation (§89, §90). Folgt dem bestehenden Repository-Muster:
   Skript erzeugt statisches JSON, das Frontend liest ausschliesslich JSON
   (wie scripts/morning/build-morning.mjs oder die Dashboard-Fetcher).

   Warum ueberhaupt praekomputieren: Ranking, Screener und Radar duerfen
   nicht bei jedem Seitenaufruf 500 Titel ueber 20 Jahre neu berechnen. Die
   Score-Historie erfordert zusaetzlich 53 vollstaendige Panel-Berechnungen —
   das ist Build-Arbeit, keine Render-Arbeit.

   WICHTIG: Jeder historische Snapshot wird mit dem Datenstand SEINES
   Stichtags berechnet (Provider liefert nur availableAt <= asOf). Die
   Historie wird nicht rueckwirkend aus heutigen Daten rekonstruiert.

   Ausfuehren:  node scripts/quant/build-quant-data.mjs
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const engines = join(root, "quant", "engines");

const Generator = require(join(engines, "mock-generator.js"));
const MockProvider = require(join(engines, "mock-provider.js"));
const Factors = require(join(engines, "factors.js"));
const QuantScore = require(join(engines, "quant-score.js"));
const Radar = require(join(engines, "radar.js"));
const Methodology = require(join(engines, "methodology.js"));
const Catalog = require(join(engines, "catalog.js"));
const Strategy = require(join(engines, "strategy.js"));

const OUT_DIR = join(root, "quant", "data");
const quantCfg = Methodology.quant();

/* Shard-Schluessel der Factor DNA. Dieselbe Regel gilt im Frontend
   (quant/ui/shell.js) — sie steht deshalb hier als benannte Funktion und
   nicht als Ausdruck mitten im Schreibvorgang. */
function dnaShardKey(ticker) {
  if (ticker.startsWith("VUF")) return "f";
  const n = parseInt(ticker.slice(2), 10);
  return String(Math.floor((n - 1) / 50));
}

function write(name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  const json = JSON.stringify(data);
  writeFileSync(file, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(`  ${name.padEnd(24)} ${kb.padStart(7)} KB`);
}

function panelFor(provider, asOf, securities) {
  const metricPanel = Factors.computeMetricPanel({
    securities: securities || provider.getSecurities({ asOf }).data,
    pricePanel: provider.getPricePanel().data,
    factPanel: provider.getFactPanel({ asOf, quarters: 9 }).data,
    asOf
  });
  const scorePanel = QuantScore.computeScorePanel({ metricPanel, dataSnapshotId: DATA_SNAPSHOT_ID });
  return { metricPanel, scorePanel };
}

console.log("Vision Universe Quant — Praekomputation\n");
const started = Date.now();

console.log("1/6  Synthetisches Universum erzeugen …");
const dataset = Generator.generateDataset();
const provider = MockProvider.createMockProvider({ dataset });
const DATA_SNAPSHOT_ID = dataset.meta.dataSnapshotId;
const asOf = dataset.meta.end;
console.log(`     ${dataset.securities.length} Securities, ${dataset.tradingDays.length} Handelstage, Snapshot ${DATA_SNAPSHOT_ID}`);

console.log("2/6  Aktuelles Panel berechnen …");
const { metricPanel, scorePanel } = panelFor(provider, asOf);
let rows = QuantScore.buildScreenerRows(metricPanel, scorePanel);
rows = QuantScore.addAuxiliaryPercentiles(rows, quantCfg);
console.log(`     ${rows.length} Titel, ${rows.filter((r) => r.quantStatus === "scored").length} mit vollstaendigem Score`);

console.log("3/6  Score-Historie berechnen (wochentliche Snapshots) …");
const intervalDays = quantCfg.scoreMomentum.snapshotIntervalDays;
const windowDays = quantCfg.scoreMomentum.historyWindowDays;
const tradingDays = dataset.tradingDays;
const lastIndex = tradingDays.length - 1;
const step = Math.round(intervalDays * (252 / 365));
const snapshotIndices = [];
for (let i = lastIndex; i >= 0 && Radar.daysBetween(tradingDays[i], asOf) <= windowDays; i -= step) {
  snapshotIndices.push(i);
}
snapshotIndices.reverse();

const history = Radar.createHistory(quantCfg.methodologyVersion, DATA_SNAPSHOT_ID);
for (const idx of snapshotIndices) {
  const date = tradingDays[idx];
  const panel = date === asOf ? { scorePanel } : panelFor(provider, date);
  Radar.appendSnapshot(history, panel.scorePanel);
}
console.log(`     ${history.dates.length} Snapshots von ${history.dates[0]} bis ${history.dates[history.dates.length - 1]}`);

console.log("4/6  Score Momentum, Events und Radar …");
const velocities = Radar.computeVelocityPanel(history, rows.map((r) => r.securityId), quantCfg);
rows.forEach((r) => {
  const v = velocities[r.securityId] || {};
  r.scoreVelocity30d = v.scoreVelocity30d ?? null;
  r.scoreVelocity60d = v.scoreVelocity60d ?? null;
  r.scoreAcceleration = v.scoreAcceleration ?? null;
});
const events = Radar.detectEvents(rows, velocities, quantCfg);
const radar = Radar.buildRadar(rows, velocities, quantCfg, { limit: 12 });
console.log(`     ${events.length} Intelligence Events, ${Object.keys(radar.modules).length} Radar-Module`);

/* Historisch existierende, heute nicht mehr gelistete Titel gehoeren als
   Referenzzeilen in den Datensatz. Sie erscheinen nicht im Screener — die
   Query Engine filtert status !== "active" heraus —, aber Backtest-Trades
   und Portfolio-Historien verweisen auf sie, und eine Detailseite, die
   dafuer ins Leere laeuft, waere ein Loch im Evidenzpfad. Kennzahlen
   bekommen sie keine: zum Datenstand existiert kein Kurs mehr. */
const activeIds = new Set(rows.map((r) => r.securityId));
const inactiveRows = dataset.securities
  .filter((s) => !activeIds.has(s.securityId))
  .map((s) => ({
    securityId: s.securityId, ticker: s.ticker, name: s.name,
    sector: s.sector, industry: s.industry, country: s.country,
    assetType: s.assetType, status: s.status, isMock: true,
    fixtureId: s.fixtureId || null,
    firstTradingDate: s.firstTradingDate, lastTradingDate: s.lastTradingDate || null,
    asOf, quantScore: null, quantStatus: "not_listed", coverage: null, confidence: null,
    methodologyVersion: quantCfg.methodologyVersion, percentiles: {}
  }));
rows = rows.concat(inactiveRows);
console.log(`     ${inactiveRows.length} historische Titel als Referenzzeilen ergaenzt`);

console.log("5/6  Rankings vorberechnen …");
const RANKINGS = [
  { id: "overall", label: "VU Quant Score", field: "quantScore" },
  { id: "quality", label: "Quality", field: "qualityScore" },
  { id: "momentum", label: "Momentum", field: "momentumScore" },
  { id: "value", label: "Value", field: "valueScore" },
  { id: "growth", label: "Growth", field: "growthScore" },
  { id: "risk", label: "Risk (geringes Risiko zuerst)", field: "riskScore" },
  { id: "score_velocity", label: "Score-Velocity 30 Tage", field: "scoreVelocity30d" }
];
const rankings = {
  asOf, methodologyVersion: quantCfg.methodologyVersion, dataSnapshotId: DATA_SNAPSHOT_ID,
  definitions: RANKINGS,
  lists: Object.fromEntries(RANKINGS.map((def) => [
    def.id,
    rows.filter((r) => r.status === "active" && Number.isFinite(r[def.field]))
      .sort((a, b) => b[def.field] - a[def.field])
      .slice(0, 100)
      .map((r, i) => ({ rank: i + 1, securityId: r.securityId, ticker: r.ticker, value: r[def.field] }))
  ]))
};

console.log("6/6  Dateien schreiben …");

const meta = {
  generatedAt: new Date().toISOString(),
  isMock: true,
  mockNotice: "Alle Werte stammen aus einem synthetischen Datensatz. Keine realen Unternehmen, keine realen Marktdaten.",
  dataSnapshotId: DATA_SNAPSHOT_ID,
  asOf,
  historyStart: dataset.meta.start,
  securityCount: dataset.securities.length,
  activeSecurityCount: rows.filter((r) => r.status === "active").length,
  tradingDays: dataset.tradingDays.length,
  generatorVersion: dataset.meta.generatorVersion,
  seed: dataset.meta.seed,
  methodologyVersions: {
    quant: quantCfg.methodologyVersion,
    backtest: Methodology.backtest().methodologyVersion,
    trustScore: Methodology.trustScore().methodologyVersion,
    strategies: Methodology.strategies().methodologyVersion
  },
  providerHealth: provider.healthCheck(),
  unavailableDatasets: [
    { dataset: "Analyst Estimates / Revisions", reason: provider.getEstimates().reason },
    { dataset: "Macro", reason: provider.getIndicator("CPI").reason },
    { dataset: "News", reason: provider.getNews().reason }
  ],
  fixtures: Generator.FIXTURES.map((f) => ({
    fixtureId: f.fixtureId, ticker: f.ticker, purpose: f.purpose,
    securityId: "sec_" + f.ticker
  })),
  dnaShardRule: "VUF* -> 'f', sonst floor((Ticker-Nummer - 1) / 50)"
};

/* Die Factor DNA ist der grosse Teil (alle Komponenten je Titel). Sie wird
   getrennt ausgeliefert, damit Uebersichtsseiten sie nicht laden muessen.
   Label, Einheit und Richtung jeder Komponente stehen bereits im
   Field-Catalog — sie hier zu wiederholen wuerde die Datei ohne Mehrwert
   verdoppeln und ein zweites, driftendes Namensregister erzeugen. */
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const factorDna = {
  asOf, methodologyVersion: quantCfg.methodologyVersion, dataSnapshotId: DATA_SNAPSHOT_ID,
  securities: Object.fromEntries(scorePanel.scores.map((s) => [s.securityId, {
    score: s.score, compositeScore: s.compositeScore, status: s.status,
    incompleteReasons: s.incompleteReasons, coverage: s.coverage, confidence: s.confidence,
    factorScores: s.factorScores, factorCoverage: s.factorCoverage,
    factorContributions: s.factorContributions, effectiveWeights: s.effectiveWeights,
    peerGroups: s.peerGroups,
    components: Object.fromEntries(Object.entries(s.components).map(([factorId, comps]) => [
      factorId,
      Object.fromEntries(Object.entries(comps).map(([cid, c]) => [cid, {
        weight: c.weight, raw: r2(c.raw), percentile: r2(c.percentile),
        peerPercentile: r2(c.peerPercentile), universePercentile: r2(c.universePercentile),
        robustZ: r2(c.robustZ), peerGroup: c.peerGroup
      }]))
    ])),
    dataAsOfPeriodEnd: s.dataAsOfPeriodEnd, dataAvailableAt: s.dataAvailableAt,
    restatementStatus: s.restatementStatus
  }]))
};

/* Auch die Screener-Zeilen werden gerundet ausgeliefert: mehr als zwei
   Nachkommastellen sind bei Kennzahlen dieser Art Scheingenauigkeit und
   kosten nur Uebertragungsvolumen. */
for (const row of rows) {
  for (const key of Object.keys(row)) {
    if (typeof row[key] === "number") row[key] = r2(row[key]);
  }
  if (row.percentiles) {
    for (const key of Object.keys(row.percentiles)) row.percentiles[key] = r2(row.percentiles[key]);
  }
}

const libraryStrategies = Strategy.libraryStrategies().map((rec) => ({
  strategy: rec.strategy,
  versions: rec.versions
}));

write("meta.json", meta);
write("securities.json", { asOf, dataSnapshotId: DATA_SNAPSHOT_ID, methodologyVersion: quantCfg.methodologyVersion, rows });
/* Factor DNA wird geshardet ausgeliefert. Eine einzige 2,4-MB-Datei fuer
   die Anzeige EINER Aktie waere eine unnoetige Uebertragung; 482 Einzeldateien
   wuerden das Repository unnoetig aufblaehen. 11 Shards zu je ~50 Titeln sind
   der brauchbare Mittelweg: die Detailseite laedt ~250 KB statt 2,4 MB. */
mkdirSync(join(OUT_DIR, "dna"), { recursive: true });
const shards = new Map();
for (const [securityId, dna] of Object.entries(factorDna.securities)) {
  const key = dnaShardKey(securityId.replace("sec_", ""));
  if (!shards.has(key)) shards.set(key, {});
  shards.get(key)[securityId] = dna;
}
for (const [key, securities] of [...shards.entries()].sort()) {
  write(join("dna", `${key}.json`), {
    asOf, methodologyVersion: quantCfg.methodologyVersion,
    dataSnapshotId: DATA_SNAPSHOT_ID, securities
  });
}
write("score-history.json", history);
write("radar.json", radar);
write("events.json", { asOf, methodologyVersion: quantCfg.methodologyVersion, events });
write("rankings.json", rankings);
write("strategies.json", { methodologyVersion: Methodology.strategies().methodologyVersion, strategies: libraryStrategies });
write("field-catalog.json", {
  operators: Catalog.OPERATORS,
  fields: Catalog.FIELD_LIST.map((f) => ({
    id: f.id, label: f.label, type: f.type, unit: f.unit, category: f.category,
    higherIsBetter: f.higherIsBetter, percentileAvailable: f.percentileAvailable,
    values: f.values, description: f.description, token: f.token, factorComponent: f.factorComponent
  }))
});

console.log(`\nFertig in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
