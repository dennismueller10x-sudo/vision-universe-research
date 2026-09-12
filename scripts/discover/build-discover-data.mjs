/* =========================================================================
   VISION UNIVERSE DISCOVER — build-discover-data.mjs

   Praekomputation der Discovery-Payloads (§5, §12 des Auftrags).

   Die Anwendung laeuft auf GitHub Pages und hat keinen Server. Der
   Auftrag verlangt trotzdem "server-side aggregation, caching,
   precomputed metrics, batched data access" und ausdruecklich KEINE
   tausenden Client-Requests. In diesem Repository ist der Build der
   Server: hier wird einmal gerechnet, und das Frontend laedt fertige
   Zeilen-Payloads.

     GET /api/discover/52-week-highs   entspricht
     discover/data/rows/US_REAL/new-52-week-highs.json

   WAS GELESEN WIRD (nur lesend, nichts davon wird veraendert)

     quant/data/market/factors/factors-GATE_500.json   reale Faktoren (Tiingo)
     quant/data/market/scale/universe-GATE_500.json    Sektor/Boerse
     quant/data/market/golden-preview/daily/*.json     reale Bars der Golden Five
     quant/data/technical/index.json + instruments/    bestehende TI-Bundles
     quant/data/securities.json                        Marktkapitalisierung (Modell)
     quant/config/*.json                               Gates, Freigaben, Kalender
     quant/engines/market-factors.js                   DIESELBE Faktorenengine
     quant/engines/mock-generator.js + mock-provider.js Modelluniversum

   ZWEI UNIVERSEN, GETRENNT GERECHNET

   Reale Titel und synthetische Titel landen nie in derselben Rangliste.
   Ein "Top 3 %" aus einem halb erfundenen Universum waere eine
   Falschaussage - und genau die Vermischung, die dieses Repository seit
   Phase 1 ausschliesst.

   Ausfuehren: node scripts/discover/build-discover-data.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const Factors = require(join(root, "quant", "engines", "market-factors.js"));
const DisplayPolicy = require(join(root, "quant", "engines", "display-policy.js"));
const Generator = require(join(root, "quant", "engines", "mock-generator.js"));
const MockProvider = require(join(root, "quant", "engines", "mock-provider.js"));

const Contract = require(join(root, "discover", "engines", "contract.js"));
const High52w = require(join(root, "discover", "engines", "high52w.js"));
const Scoring = require(join(root, "discover", "engines", "scoring.js"));
const Indicators = require(join(root, "discover", "engines", "indicators.js"));
const TI = require(join(root, "discover", "engines", "technical-intelligence.js"));
const Klartext = require(join(root, "discover", "engines", "klartext.js"));
const Unternehmen = require(join(root, "discover", "engines", "unternehmen.js"));

const OUT = join(root, "discover", "data");
const METHODOLOGY = readJSON(join(root, "discover", "methodology", "discover-v1.json"));
const GATES_CONFIG = readJSON(join(root, "quant", "config", "feature-gates.json"));
const PREVIEW_CONFIG = readJSON(join(root, "quant", "config", "development-preview.json"));
const GATES = DisplayPolicy.gatesFromConfig(GATES_CONFIG);
DisplayPolicy.declareFromConfig(PREVIEW_CONFIG);

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function round(v, d) { return isNum(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : null; }

let bytesWritten = 0, filesWritten = 0;
function write(rel, data) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  const json = JSON.stringify(data, (k, v) =>
    (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v));
  writeFileSync(file, json);
  bytesWritten += Buffer.byteLength(json);
  filesWritten++;
  return json.length;
}

/* ---------------------------------------------------------------- Namen

   Firmennamen liegen fuer das reale Universum nur fuer die kuratierten
   Referenztitel vor (die Anbieter-Tickerliste fuehrt keine Namen). Statt
   einen Namen zu erfinden, bleibt das Feld leer und traegt
   companyNameStatus = SOURCE_MISSING; die Oberflaeche zeigt dann den
   Ticker als Ueberschrift. */
function buildNameMap() {
  const map = new Map();
  const merke = (ticker, name, quelle, sector) => {
    if (!ticker || !name || map.has(ticker)) return;
    map.set(ticker, { name: String(name).trim(), sector: sector || null, source: quelle });
  };

  /* Reihenfolge = Vorrang. Bestehende Repository-Quellen zuerst, die
     redaktionelle Liste zuletzt: sie fuellt nur, was sonst fehlt. */
  for (const file of ["market-universe.json", "tiingo-universe.json"]) {
    const cfg = readJSON(join(root, "quant", "config", file));
    for (const s of cfg.securities || []) merke(s.ticker, s.name, "quant/config/" + file, s.sector);
  }

  const dashboardUniverse = join(root, "dashboard", "config", "universe.json");
  if (existsSync(dashboardUniverse)) {
    const cfg = readJSON(dashboardUniverse);
    const rows = Array.isArray(cfg) ? cfg : (cfg.symbols || cfg.universe || []);
    for (const s of rows) merke(s.ticker || s.symbol, s.name || s.company, "dashboard/config/universe.json");
  }

  /* Die SEC fuehrt den Namen der einreichenden Gesellschaft. Er steht in
     Versalien ("JPMORGAN CHASE & CO") - fuer eine Ueberschrift ist das
     Schreien, deshalb nur, wenn sonst nichts vorliegt. */
  const secIndex = join(root, "quant", "data", "sec", "inspector_index.json");
  if (existsSync(secIndex)) {
    for (const c of readJSON(secIndex).companies || []) {
      merke(c.ticker, titelSchreibweise(c.name), "quant/data/sec/inspector_index.json");
    }
  }

  const kuratiert = join(root, "discover", "config", "company-names.json");
  if (existsSync(kuratiert)) {
    const cfg = readJSON(kuratiert);
    for (const [ticker, name] of Object.entries(cfg.names || {})) {
      merke(ticker, name, "discover/config/company-names.json");
    }
  }
  return map;
}

/** "JPMORGAN CHASE & CO" -> "JPMorgan Chase & Co" ist nicht ableitbar;
    "MERCK & CO INC" -> "Merck & Co Inc" dagegen schon. Mehr wird nicht
    versucht - eine falsche Binnenmajuskel ist schlimmer als Versalien. */
function titelSchreibweise(name) {
  if (!name || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s&/(-])([a-z])/g, (m, vor, buchstabe) => vor + buchstabe.toUpperCase());
}

/* ------------------------------------------- Bars aus den Golden-Five-Daten */
function loadGoldenPreviewBars() {
  const dir = join(root, "quant", "data", "market", "golden-preview", "daily");
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const payload = readJSON(join(dir, file));
    if (!payload.ticker || !Array.isArray(payload.bars)) continue;
    /* Die Anzeige-Erlaubnis wird hier geprueft, nicht angenommen. Faellt
       ein Titel aus der Allowlist, verschwindet seine Kursreihe aus der
       Auslieferung - ohne dass jemand daran denken muss. */
    const check = DisplayPolicy.check({
      providerId: "tiingo", dataClass: "marketData", audience: "development_preview",
      form: "raw", gates: GATES, ticker: payload.ticker
    });
    if (!check.allowed) {
      console.log(`     ${payload.ticker.padEnd(6)} Kursreihe zurueckgehalten: ${check.reason}`);
      continue;
    }
    out.set(payload.ticker, { bars: payload.bars, updatedAt: payload.updatedAt || null, basis: check });
  }
  return out;
}

/* Split-bereinigte Schlusskurse aus Tiingo-Rohbars. Dieselbe Ableitung
   wie im Technical-Build: aus splitFactor, nicht aus adjClose. */
function splitAdjustedCloses(bars) {
  const n = bars.length;
  const factors = new Array(n).fill(1);
  let cumulative = 1;
  for (let i = n - 1; i >= 0; i--) {
    factors[i] = cumulative;
    const sf = bars[i].splitFactor;
    if (isNum(sf) && sf !== 1) cumulative *= sf;
  }
  return bars.map((b, i) => ({
    date: String(b.date).slice(0, 10),
    open: isNum(b.open) ? b.open / factors[i] : null,
    high: isNum(b.high) ? b.high / factors[i] : null,
    low: isNum(b.low) ? b.low / factors[i] : null,
    close: isNum(b.close) ? b.close / factors[i] : null,
    volume: isNum(b.volume) ? b.volume * factors[i] : null
  }));
}

/**
 * Rebasierter Renditepfad aus den ausgelieferten Renditen.
 *
 * Aus r12, r6, r3, r1 laesst sich der Kursstand relativ zum heutigen
 * rekonstruieren: P(-12M)/P(heute) = 1/(1+r12). Fuenf Stuetzstellen,
 * normiert auf 100, ohne ein einziges absolutes Kursniveau. Damit bekommt
 * auch ein Titel ohne freigegebene Kursreihe einen sichtbaren Verlauf -
 * und zwar einen echten, keinen geschaetzten.
 */
function performancePath(metrics) {
  const punkte = [
    { label: "12M", r: metrics.return12M },
    { label: "6M", r: metrics.return6M },
    { label: "3M", r: metrics.return3M },
    { label: "1M", r: metrics.return1M }
  ];
  const werte = [];
  for (const p of punkte) {
    if (!isNum(p.r) || p.r <= -0.999) return null;
    werte.push({ label: p.label, value: round(100 / (1 + p.r), 3) });
  }
  werte.push({ label: "heute", value: 100 });
  return werte;
}

/** 40 Wochenpunkte fuer die Sparkline - eine Card braucht keine 1300 Bars.
    Zwei Nachkommastellen genuegen einer 200 Pixel breiten Linie; vier
    verdoppeln die Nutzlast einer Zeile ohne einen sichtbaren Unterschied. */
function weeklySparkline(closes, points = 40) {
  const valid = closes.filter(isNum);
  if (valid.length < 8) return null;
  const window = valid.slice(-Math.min(valid.length, points * 5));
  const step = window.length / points;
  const out = [];
  for (let i = 0; i < points; i++) {
    const idx = Math.min(window.length - 1, Math.floor(i * step));
    out.push(round(window[idx], 2));
  }
  out[out.length - 1] = round(window[window.length - 1], 2);
  return out;
}

/* ============================================================ Kennzahlen */

/** Flache Kennzahlen aus einem market-factors-Ergebnis. */
function flatMetrics(values) {
  const rs = values.relativeStrength || {};
  const ret = values.returns || {};
  return {
    distanceTo52wHigh: num(values.distanceTo52wHigh),
    distanceTo52wLow: num(values.distanceTo52wLow),
    return1M: num(ret["1M"]), return3M: num(ret["3M"]),
    return6M: num(ret["6M"]), return12M: num(ret["12M"]),
    return12M1M: num(values.return12M1M),
    momentumAcceleration: num(values.momentumAcceleration),
    relativeStrength1M: num(rs["1M"]), relativeStrength3M: num(rs["3M"]),
    relativeStrength6M: num(rs["6M"]), relativeStrength12M: num(rs["12M"]),
    volatility252d: num(values.volatility252d),
    maxDrawdown252d: num(values.maxDrawdown252d),
    volumeRatio20over60: num(values.volumeRatio20over60),
    volumeSpikeRatio: num(values.volumeSpikeRatio),
    trendAlignment: Scoring.trendAlignment(values)
  };
}
function num(v) { return isNum(v) ? v : null; }

function scoreAll(metrics, values) {
  const leadership = Scoring.composite(METHODOLOGY.leadershipScore, metrics);
  const momentum = Scoring.composite(METHODOLOGY.momentumScore, metrics);
  const rs = Scoring.composite(METHODOLOGY.relativeStrengthScore, metrics);
  const breakout = Scoring.breakoutScore(Object.assign({}, values, metrics));
  return { leadership, momentum, rs, breakout };
}

/* ====================================================== Universum: REAL */
/* Welche Faktordatei das reale Universum speist.

   Frueher stand hier `factors-GATE_500.json`, hart verdrahtet - und genau
   diese eine Zeile war der Grund, warum Discover 498 Titel kannte und
   nicht 5.684. Die groesste Faktordatei, die es gibt, war die von
   GATE_500, weil build-market-factors.mjs Einzelzeilen nur bis 500 Titel
   ins Repository schreibt.

   Ab jetzt wird gesucht statt genannt: die groesste verfuegbare
   Faktordatei gewinnt, im Repository und in der Arbeitsablage. Kommt
   eines Tages `factors-FULL_UNIVERSE.json` dazu, benutzt dieser Build sie
   ohne eine weitere Codeaenderung. */
function findFactorsFile() {
  const explicit = arg("--factors", process.env.VU_DISCOVER_FACTORS || null);
  if (explicit) {
    const p = explicit.startsWith("/") ? explicit : join(root, explicit);
    return { factors: p, gate: null, source: "explicit" };
  }
  const dirs = [
    { dir: join(root, "quant", "data", "market", "factors"), source: "repository" },
    { dir: join(root, ".market-cache", "tiingo", "factors"), source: "workingStore" }
  ];
  let best = null;
  for (const { dir, source } of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = /^factors-(.+)\.json$/.exec(f);
      if (!m || m[1].endsWith("-summary")) continue;
      let payload;
      try { payload = readJSON(join(dir, f)); } catch { continue; }
      const n = (payload.securities || []).length;
      if (!n) continue;
      if (!best || n > best.count) best = { factors: join(dir, f), gate: m[1], count: n, source };
    }
  }
  if (!best) {
    throw new Error("Keine Faktordatei gefunden. scripts/market/build-market-factors.mjs erzeugt sie.");
  }
  return best;
}

function buildRealUniverse(nameMap, goldenBars) {
  const pick = findFactorsFile();
  const factors = readJSON(pick.factors);
  /* Das Gate-Universum liefert Sektor und Boerse. Es muss zur Faktordatei
     passen; passt keines, bleibt die Zuordnung leer statt falsch. */
  const universeFile = pick.gate
    ? join(root, "quant", "data", "market", "scale", `universe-${pick.gate}.json`)
    : null;
  const universe = universeFile && existsSync(universeFile)
    ? readJSON(universeFile) : { securities: [] };
  const byTicker = new Map(universe.securities.map((s) => [s.ticker, s]));

  /* Die Identitaet kommt aus dem kanonischen Company Master, nicht aus
     dem Gate-Artefakt: derselbe Titel traegt in Discover, Suche und
     Aktienseite dieselbe instrumentId (§4, §8). */
  const masterByTicker = loadMasterIndex();
  console.log(`     Faktoren aus ${pick.factors.replace(root + "/", "")} ` +
              `(${(factors.securities || []).length} Titel, Quelle ${pick.source})`);
  console.log(`     Company Master: ${masterByTicker.size} Instrumente`);

  const stocks = [];
  for (const sec of factors.securities) {
    const values = sec.values || {};
    const ref = byTicker.get(sec.ticker) || {};
    const metrics = flatMetrics(values);
    const scores = scoreAll(metrics, values);
    const named = nameMap.get(sec.ticker);

    metrics.leadershipScore = scores.leadership.score;
    metrics.momentumScore = scores.momentum.score;
    metrics.relativeStrengthScore = scores.rs.score;
    metrics.breakoutScore = scores.breakout.score;

    const golden = goldenBars.get(sec.ticker);
    const goldenCloses = golden ? splitAdjustedCloses(golden.bars).map((b) => b.close) : null;

    const stock = Contract.normalizeStock({
      symbol: sec.ticker,
      securityId: sec.securityId,
      companyName: named ? named.name : null,
      companyNameStatus: named ? "CALCULATED" : "SOURCE_MISSING",
      universeId: "US_REAL",
      instrumentId: (masterByTicker.get(sec.ticker) || {}).instrumentId || null,
      dataMode: "real",
      provider: factors.provider || "tiingo",
      exchange: sec.exchange || ref.exchange || null,
      sector: sec.sector || (named && named.sector) || null,
      sectorStatus: sec.sector ? (sec.sectorStatus || "CURATED") : "SOURCE_MISSING",
      /* Absolute Kursniveaus realer Titel bleiben nach der
         Redistributionsregel des Bestandssystems zurueck. Die Card zeigt
         deshalb keinen Preis - und sagt warum, statt eine Null. */
      price: goldenCloses
        ? Contract.field(round(goldenCloses[goldenCloses.length - 1], 4))
        : Contract.field(null, "WITHHELD_REDISTRIBUTION"),
      changePercent: goldenCloses && goldenCloses.length > 1
        ? Contract.field(round((goldenCloses[goldenCloses.length - 1] / goldenCloses[goldenCloses.length - 2] - 1) * 100, 4))
        : Contract.field(null, "WITHHELD_REDISTRIBUTION"),
      sparkline: goldenCloses ? weeklySparkline(goldenCloses) : null,
      sparklineStatus: goldenCloses ? "CALCULATED" : "WITHHELD_REDISTRIBUTION",
      performancePath: performancePath(metrics),
      hasPriceSeries: !!goldenCloses,
      marketCap: null,
      metrics,
      metricStatus: withheldMetricStatus(metrics, sec.fieldStatus),
      dataQuality: sec.dataQuality || null,
      dataQualityReason: sec.dataQualityReason || null,
      asOf: sec.asOf || factors.generatedAt.slice(0, 10),
      updatedAt: factors.generatedAt
    });
    stock.scoreDetail = scores;
    stock.rawValues = values;
    stocks.push(stock);
  }

  return {
    universeId: "US_REAL",
    label: METHODOLOGY.universes.US_REAL.label,
    kind: "real",
    provider: factors.provider,
    benchmark: factors.benchmark ? factors.benchmark.id : null,
    asOf: factors.securities.length ? factors.securities[0].asOf : null,
    generatedAt: factors.generatedAt,
    engine: factors.engine,
    redistribution: factors.redistribution,
    sourceFile: pick.factors.replace(root + "/", ""),
    sourceGate: pick.gate,
    sourceKind: pick.source,
    masterInstruments: masterByTicker.size,
    stocks
  };
}

/* Der Company Master, nach Kuerzel. Fehlt er, laeuft der Build weiter -
   die Payloads tragen dann keine instrumentId, und das steht im
   Ergebnis. Ein Build, der an einer fehlenden Identitaet scheitert, waere
   schlimmer als einer, der sie vermisst meldet. */
function loadMasterIndex() {
  const dir = join(root, "quant", "data", "universe", "instruments");
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const inst of readJSON(join(dir, f)).instruments || []) {
      if (!map.has(inst.symbol)) map.set(inst.symbol, inst);
      for (const alias of inst.legacyIds || []) if (!map.has(alias)) map.set(alias, inst);
    }
  }
  return map;
}

function withheldMetricStatus(metrics, fieldStatus) {
  const out = {};
  for (const key of Contract.METRICS) {
    if (isNum(metrics[key])) { out[key] = "CALCULATED"; continue; }
    out[key] = "INSUFFICIENT_HISTORY";
  }
  return out;
}

/* ==================================================== Universum: MODELL */
function buildModelUniverse() {
  const dataset = Generator.generateDataset();
  const provider = MockProvider.createMockProvider({ dataset });
  const asOf = dataset.meta.end;
  const securitiesFile = readJSON(join(root, "quant", "data", "securities.json"));
  const capByTicker = new Map(securitiesFile.rows.map((r) => [r.ticker, r.marketCap]));

  const benchBars = provider.getBenchmarkBars(Generator.BENCHMARK_ID, {}).data.bars;
  const benchmark = {
    closes: benchBars.map((b) => b.level),
    dates: benchBars.map((b) => b.date)
  };

  const stocks = [];
  const barsByTicker = new Map();
  for (const sec of provider.getSecurities({ asOf, status: "active" }).data) {
    const bars = provider.getPriceBars(sec.securityId, {}).data;
    if (!bars || bars.length < 300) continue;

    /* Dieselbe Faktorenengine wie fuer das reale Universum. Zwei
       Implementierungen derselben Kennzahl waeren zwei Definitionen. */
    const result = Factors.computeFactors(
      { ticker: sec.ticker, bars, adjustmentStatus: "SPLIT_ADJUSTED" },
      { benchmark }
    );
    if (result.status === "UNAVAILABLE") continue;

    const values = result.values;
    const metrics = flatMetrics(values);
    const scores = scoreAll(metrics, values);
    metrics.leadershipScore = scores.leadership.score;
    metrics.momentumScore = scores.momentum.score;
    metrics.relativeStrengthScore = scores.rs.score;
    metrics.breakoutScore = scores.breakout.score;

    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const marketCap = capByTicker.has(sec.ticker) ? capByTicker.get(sec.ticker) : null;

    const stock = Contract.normalizeStock({
      symbol: sec.ticker,
      securityId: sec.securityId,
      companyName: sec.name,
      universeId: "VU_MODEL",
      dataMode: "mock",
      provider: "VisionUniverseMock",
      exchange: "XMOC",
      sector: sec.sector,
      sectorStatus: "CURATED",
      industry: sec.industry,
      marketCap,
      capBucket: capBucketOf(marketCap),
      price: Contract.field(round(last, 4)),
      changePercent: isNum(prev) && prev > 0 ? Contract.field(round((last / prev - 1) * 100, 4))
                                             : Contract.field(null, "INSUFFICIENT_HISTORY"),
      sparkline: weeklySparkline(closes),
      performancePath: performancePath(metrics),
      hasPriceSeries: true,
      metrics,
      metricStatus: withheldMetricStatus(metrics),
      dataQuality: result.dataQuality || "PASS",
      asOf: result.asOf,
      updatedAt: dataset.meta.dataSnapshotId
    });
    stock.scoreDetail = scores;
    stock.rawValues = values;
    stocks.push(stock);
    barsByTicker.set(sec.ticker, bars);
  }

  return {
    universeId: "VU_MODEL",
    label: METHODOLOGY.universes.VU_MODEL.label,
    kind: "mock",
    provider: "VisionUniverseMock",
    benchmark: Generator.BENCHMARK_ID,
    asOf,
    /* Deterministisch statt Wanduhr: derselbe Eingabestand muss dieselben
       Dateien ergeben, sonst ist jeder Vergleich zweier Staende Rauschen.
       Der Zeitstempel des Laufs steht genau einmal, in meta.json. */
    generatedAt: asOf + "T00:00:00Z",
    engine: Factors.VERSION,
    dataSnapshotId: dataset.meta.dataSnapshotId,
    sourceFile: "quant/engines/mock-generator.js",
    stocks, barsByTicker
  };
}

function capBucketOf(marketCapMillions) {
  if (!isNum(marketCapMillions)) return null;
  for (const bucket of METHODOLOGY.capBuckets) {
    if (marketCapMillions >= bucket.minMarketCapMillions) return bucket.id;
  }
  return "small";
}

/* ================================================= Perzentile und Signale */
function applyPercentilesAndSignals(universe) {
  const stocks = universe.stocks;
  const scale = (key) => Scoring.percentileScale(stocks.map((s) => s.metrics[key]));
  const leadershipScale = scale("leadershipScore");
  const momentumScale = scale("momentumScore");
  const rsScale = scale("relativeStrengthScore");

  for (const s of stocks) {
    s.metrics.leadershipPercentile = leadershipScale(s.metrics.leadershipScore);
    s.metrics.momentumPercentile = momentumScale(s.metrics.momentumScore);
    s.metrics.relativeStrengthPercentile = rsScale(s.metrics.relativeStrengthScore);
    for (const key of ["leadershipPercentile", "momentumPercentile", "relativeStrengthPercentile"]) {
      s.metricStatus[key] = isNum(s.metrics[key]) ? "CALCULATED" : "INSUFFICIENT_HISTORY";
    }

    const v = s.rawValues || {};
    /* Die Lesart der bestehenden Faktorenengine wird uebernommen, nicht
       neu erfunden: newHigh52w heisst "das Tageshoch hat das
       Jahresmaximum erreicht" und darf deshalb mit einem leicht negativen
       Schlusskursabstand zusammenfallen. */
    const high = High52w.fromDistance(s.metrics.distanceTo52wHigh, s.metrics.distanceTo52wLow,
                                      Object.assign({ touchedHigh: v.newHigh52w === true },
                                                    METHODOLOGY.high52w));
    s.high52w = high;
    s.signals.new52WeekHigh = high.isNew52WeekHigh === true;
    s.signals.nearHigh = !s.signals.new52WeekHigh &&
      (high.state === "nearHigh" || high.state === "watch");
    s.signals.marketLeader = isNum(s.metrics.leadershipPercentile) && s.metrics.leadershipPercentile >= 90;
    s.signals.momentumLeader = isNum(s.metrics.momentumPercentile) && s.metrics.momentumPercentile >= 90;
    s.signals.relativeStrengthLeader = isNum(s.metrics.relativeStrengthPercentile) &&
                                       s.metrics.relativeStrengthPercentile >= 90;
    s.signals.trendIntact = v.aboveAllSMA === true;
    s.signals.breakout = v.volumeBreakout === true && v.priceAboveSMA20 === true &&
                         v.priceAboveSMA50 === true && isNum(s.metrics.distanceTo52wHigh) &&
                         s.metrics.distanceTo52wHigh >= -0.10;
    s.badges = badgesFor(s);
    s.plain = Klartext.karte(s, {});
    s.world = heroWorld(s);
    const eligibility = discoveryEligibility(s);
    s.discoveryEligible = eligibility.eligible;
    s.ineligibleReason = eligibility.reason;
    s.ineligibleMessage = eligibility.message;
    if (!eligibility.eligible) {
      /* Ein stillstehender Kurs traegt kein Signal - auch kein negatives. */
      Object.keys(s.signals).forEach((k) => { s.signals[k] = false; });
      s.badges = [{ id: "notTrading", label: (Klartext.plakette("notTrading") || {}).label,
                    tone: "muted",
                    detail: eligibility.reason === "STALE_SERIES" ? "Reihe steht still" : "Keine Rendite" }];
    }
    Contract.assertStock(s);
  }

  /* Sektorfuehrer: nur in Sektoren, deren Zuordnung tatsaechlich kuratiert
     ist. Ein Sektorrang aus einer Zuordnung, die "SOURCE_MISSING" heisst,
     waere ein Rang ueber eine Vermutung. */
  const bySector = new Map();
  for (const s of stocks) {
    if (!s.sector || s.sectorStatus !== "CURATED") continue;
    if (!bySector.has(s.sector)) bySector.set(s.sector, []);
    bySector.get(s.sector).push(s);
  }
  for (const [sector, list] of bySector) {
    list.sort((a, b) => (b.metrics.leadershipScore || -1) - (a.metrics.leadershipScore || -1));
    list.forEach((s, i) => {
      s.sectorRank = { rank: i + 1, of: list.length, sector };
      s.signals.sectorLeader = i < 3 && isNum(s.metrics.leadershipScore) &&
                               list.length >= METHODOLOGY.sectorRows.minSecuritiesPerSector;
      s.badges = badgesFor(s);
      /* Der Branchenrang veraendert den Zusatz - also noch einmal. */
      s.plain = Klartext.karte(s, {});
    });
  }
  universe.sectors = bySector;
  return universe;
}

/** Der eine Satz, der auf der Card steht. Aus Kennzahlen, nicht aus Prosa. */
/* Die Plakette auf der Karte.

   Sie hiess in der ersten Fassung NEW HIGH, MARKET LEADER, RS 98,
   BREAKOUT - Kuerzel aus einem Screener, die voraussetzen, dass man sie
   kennt. Die Regeln dahinter sind unveraendert; die Beschriftung kommt
   jetzt aus klartext.js. Der Zusatz nennt weiterhin die Zahl, aber in
   der Form, in der sie jemand liest: "Top 1 %" statt "Score 96". */
function badgesFor(stock) {
  const m = stock.metrics;
  const out = [];
  const wort = (id) => (Klartext.plakette(id) || {}).label || id;

  if (stock.signals.new52WeekHigh) {
    const closeAtHigh = stock.high52w && stock.high52w.closeAtHigh === true;
    out.push({ id: "new52WeekHigh", label: wort("new52WeekHigh"), tone: "green",
               detail: closeAtHigh ? "Schlusskurs" : "im Tagesverlauf" });
  } else if (stock.signals.nearHigh && isNum(m.distanceTo52wHigh)) {
    out.push({ id: "nearHigh", label: wort("nearHigh"), tone: "green",
               detail: Klartext.prozent(Math.abs(m.distanceTo52wHigh), false) + " darunter" });
  }
  if (stock.signals.marketLeader && isNum(m.leadershipPercentile)) {
    out.push({ id: "marketLeader", label: wort("marketLeader"), tone: "ink",
               detail: Klartext.topProzent(m.leadershipPercentile) });
  }
  if (stock.signals.momentumLeader && isNum(m.return6M)) {
    out.push({ id: "momentumLeader", label: wort("momentumLeader"), tone: "purple",
               detail: Klartext.prozent(m.return6M) + " in 6 Monaten" });
  }
  if (stock.signals.relativeStrengthLeader && isNum(m.relativeStrengthPercentile)) {
    out.push({ id: "relativeStrengthLeader", label: wort("relativeStrengthLeader"),
               tone: "blue", detail: Klartext.staerkerAls(m.relativeStrengthPercentile) });
  }
  if (stock.signals.breakout) {
    out.push({ id: "breakout", label: wort("breakout"), tone: "yellow", detail: null });
  }
  if (stock.signals.sectorLeader && stock.sectorRank) {
    out.push({ id: "sectorLeader", label: wort("sectorLeader"), tone: "ink",
               detail: stock.sectorRank.sector });
  }
  return out.slice(0, 3);
}

function pct(v) {
  var scaled = v * 100;
  var digits = Math.abs(scaled) < 1 ? 2 : 1;
  return (scaled >= 0 ? "+" : "") + scaled.toFixed(digits) + " %";
}

/* ============================================================== Zeilen */

/* Wer darf ueberhaupt in eine Discovery-Zeile?

   Ein Titel, dessen Kurs sich in einem Jahr um keinen Cent bewegt hat,
   steht rechnerisch auf seinem 52-Wochen-Hoch - der Abstand ist null.
   Genau so ist EQC (Abwicklung, Kurs eingefroren) in der ersten Fassung
   auf Platz eins der neuen Jahreshochs gelandet. Das ist kein Signal,
   sondern eine stehengebliebene Reihe. Sie wird benannt und aus den
   Zeilen genommen, bleibt aber suchbar und behaelt ihre Detailseite:
   "nicht handelbar" ist eine Auskunft, Verschweigen waere keine. */
function discoveryEligibility(stock) {
  const m = stock.metrics;
  const horizons = ["return1M", "return3M", "return6M", "return12M"];
  const known = horizons.filter((h) => isNum(m[h]));
  if (!known.length) {
    return { eligible: false, reason: "NO_RETURNS",
             message: "Keine Rendite über irgendeinen Horizont berechenbar." };
  }
  const allZero = known.every((h) => m[h] === 0);
  if (allZero && (m.volatility252d === 0 || m.volatility252d === null)) {
    return { eligible: false, reason: "STALE_SERIES",
             message: "Die Kursreihe steht seit über einem Jahr still (keine Rendite, keine " +
                      "Volatilität). Ein Abstand von 0 % zum Jahreshoch ist hier kein Signal." };
  }
  return { eligible: true, reason: null, message: null };
}


const ROW_FILTERS = {
  nearOrAtHigh: (s) => s.signals.new52WeekHigh || s.signals.nearHigh ||
    (isNum(s.metrics.distanceTo52wHigh) && s.metrics.distanceTo52wHigh >= -METHODOLOGY.high52w.watchPct),
  /* Nur das belegte Signal, nicht der Score.

     Die erste Fassung liess zusaetzlich jeden Titel mit breakoutScore >= 40
     zu. Solange die Zeile "BREAKING OUT" hiess und im Untertitel von einem
     Score sprach, war das vertretbar. Seit sie "GERADE IN BEWEGUNG" heisst
     und behauptet, der Kurs ziehe an, ist es falsch: unter den
     Score-Treffern standen Titel mit -19,6 % in drei Monaten. Eine Zeile
     darf nicht mehr versprechen, als ihre Regel prueft - lieber vier
     Titel, die stimmen, als acht, von denen die Haelfte das Gegenteil
     zeigt. */
  breakout: (s) => s.signals.breakout === true,
  trendIntact: (s) => s.signals.trendIntact === true
};

function buildRow(universe, config) {
  const pool = universe.stocks.filter((s) => {
    if (s.discoveryEligible === false) return false;
    if (config.filter && ROW_FILTERS[config.filter] && !ROW_FILTERS[config.filter](s)) return false;
    return (config.require || []).every((f) => isNum(s.metrics[f]));
  });
  /* Zweitschluessel, damit eine Zeile nicht an Gleichstaenden haengt: bei
     zwei Titeln auf demselben Jahreshoch entscheidet die Fuehrerschaft,
     nicht die Reihenfolge in der Quelldatei. */
  const secondary = config.secondarySort || "leadershipScore";
  pool.sort((a, b) => {
    /* Eine Zeile, die "NEW 52-WEEK HIGHS" heisst, beginnt mit den Titeln,
       die tatsaechlich eines gemacht haben - nicht mit denen, die dem Hoch
       rechnerisch am naechsten sind. */
    if (config.signalFirst) {
      const asig = a.signals[config.signalFirst] === true;
      const bsig = b.signals[config.signalFirst] === true;
      if (asig !== bsig) return asig ? -1 : 1;
    }
    const av = a.metrics[config.sort], bv = b.metrics[config.sort];
    if (!isNum(av) && !isNum(bv)) return 0;
    if (!isNum(av)) return 1;
    if (!isNum(bv)) return -1;
    if (av !== bv) return config.direction === "asc" ? av - bv : bv - av;
    const as = a.metrics[secondary], bs = b.metrics[secondary];
    if (!isNum(as) && !isNum(bs)) return a.symbol < b.symbol ? -1 : 1;
    if (!isNum(as)) return 1;
    if (!isNum(bs)) return -1;
    return bs - as;
  });
  /* Die Karte traegt ihre Uebersetzung mit. Sie liesse sich auch im
     Browser rechnen - aber dann stuende auf dem Bildschirm ein Satz, den
     keine Pruefung je gesehen hat. So rechnet ihn der Build, und
     verify-discover-data.mjs rechnet ihn nach. */
  const auswahl = pool.slice(0, isNum(config.limit) ? config.limit : pool.length);
  /* Die Uebersetzung kennt die ganze Reihe, nicht nur die einzelne Karte -
     sonst steht derselbe wahre Satz zwoelfmal untereinander. */
  const texte = Klartext.reihe(auswahl, config.id);
  const cards = auswahl.map((s, i) => Object.assign(Contract.toCard(s), { plain: texte[i] }));
  /* Die Karte muss sich selbst erklaeren koennen: der Klartext wird aus
     der KARTE nachgerechnet, nicht aus dem Titel im Speicher. Was die
     Uebersetzung liest, muss deshalb auch auf der Karte stehen. */
  const notEvaluable = universe.stocks.length - universe.stocks.filter((s) =>
    s.discoveryEligible !== false &&
    (config.require || []).every((f) => isNum(s.metrics[f]))).length;

  return {
    rowId: config.id, title: config.title, subtitle: config.subtitle,
    world: config.world || "leadership",
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    methodologyVersion: METHODOLOGY.methodologyVersion,
    asOf: universe.asOf, generatedAt: universe.generatedAt,
    sort: config.sort, direction: config.direction,
    coverage: {
      universeSize: universe.stocks.length,
      matched: pool.length,
      returned: cards.length,
      notEvaluable,
      note: notEvaluable > 0
        ? notEvaluable + " Titel sind für diese Zeile nicht entscheidbar (fehlende Kennzahl)."
        : null
    },
    filters: filterOptions(pool),
    cards
  };
}

function filterOptions(stocks) {
  const sectors = new Map();
  const buckets = new Map();
  for (const s of stocks) {
    if (s.sector && s.sectorStatus === "CURATED") sectors.set(s.sector, (sectors.get(s.sector) || 0) + 1);
    if (s.capBucket) buckets.set(s.capBucket, (buckets.get(s.capBucket) || 0) + 1);
  }
  return {
    sectors: [...sectors.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })),
    capBuckets: METHODOLOGY.capBuckets
      .filter((b) => buckets.has(b.id))
      .map((b) => ({ id: b.id, label: b.label, count: buckets.get(b.id) }))
  };
}

/* ================================================ Weiter-Entdecken-Daten

   Eine Detailseite ohne Ausgang ist eine Sackgasse (§14 des Redesigns).
   Beides entsteht deterministisch aus den bereits gerechneten Zeilen:

     memberships  in welchen Zeilen steht dieser Titel weit vorn?
     similar      wer steht ihm im selben Universum am naechsten?

   "Weit vorn" ist bewusst begrenzt: dass ein Titel Platz 312 von 497 einer
   Rangliste belegt, ist keine Zugehoerigkeit, sondern eine Fussnote. */
const MEMBERSHIP_RANK_LIMIT = 60;

function buildMemberships(universe) {
  const perSymbol = new Map();
  for (const config of METHODOLOGY.rows) {
    const row = buildRow(universe, Object.assign({}, config, { limit: Infinity }));
    row.cards.forEach((card, index) => {
      if (index >= MEMBERSHIP_RANK_LIMIT) return;
      if (!perSymbol.has(card.symbol)) perSymbol.set(card.symbol, []);
      perSymbol.get(card.symbol).push({
        rowId: config.id, title: config.title, rank: index + 1, of: row.coverage.matched
      });
    });
  }
  for (const [sector, list] of universe.sectors) {
    list.slice(0, MEMBERSHIP_RANK_LIMIT).forEach((stock, index) => {
      if (!perSymbol.has(stock.symbol)) perSymbol.set(stock.symbol, []);
      perSymbol.get(stock.symbol).push({
        rowId: "sector-leaders", title: sector + " Leaders", rank: index + 1, of: list.length
      });
    });
  }
  return perSymbol;
}

/**
 * Aehnliche Titel: naechste Nachbarn nach Leadership Score, bevorzugt aus
 * demselben Sektor. Keine Empfehlung, keine Aehnlichkeit im
 * Geschaeftsmodell - der Vergleich ist ausdruecklich einer des
 * Kursverhaltens, und die Ueberschrift sagt das.
 */
function buildSimilar(universe, stock, anzahl) {
  const score = stock.metrics.leadershipScore;
  if (!isNum(score)) return [];
  const kandidaten = universe.stocks.filter((other) =>
    other.symbol !== stock.symbol && other.discoveryEligible !== false &&
    isNum(other.metrics.leadershipScore));
  const gleicherSektor = stock.sectorStatus === "CURATED" && stock.sector
    ? kandidaten.filter((o) => o.sector === stock.sector) : [];
  const rest = kandidaten.filter((o) => gleicherSektor.indexOf(o) === -1);
  const nachNaehe = (a, b) =>
    Math.abs(a.metrics.leadershipScore - score) - Math.abs(b.metrics.leadershipScore - score);
  return gleicherSektor.sort(nachNaehe).concat(rest.sort(nachNaehe))
    .slice(0, anzahl || 8).map((o) => Contract.toMiniCard(o));
}

/* ======================================================= Hero (Featured)

   Welcher Titel traegt die Eingangsflaeche? Die Frage wird hier
   beantwortet und nicht im Frontend, damit sie nachvollziehbar bleibt und
   nicht bei jedem Laden anders ausfaellt.

   Gewaehlt wird nach: ein tatsaechliches Signal (neues Jahreshoch,
   Marktfuehrerschaft oder bestaetigter Ausbruch), dann Fuehrerschaft,
   dann Darstellbarkeit - ein Titel mit ausgelieferter Kursreihe traegt
   eine grosse Flaeche besser als einer ohne. Hoechstens zwei je Sektor,
   damit die Eingangsflaeche nicht dreimal denselben Markt zeigt. */
function buildFeatured(universe, anzahl) {
  const kandidaten = universe.stocks.filter((s) =>
    s.discoveryEligible !== false &&
    (s.signals.new52WeekHigh || s.signals.marketLeader || s.signals.breakout) &&
    isNum(s.metrics.leadershipPercentile));

  const bewertet = kandidaten.map((s) => {
    let rang = s.metrics.leadershipPercentile;
    if (s.hasPriceSeries) rang += 12;          // traegt eine grosse Flaeche
    if (s.companyName) rang += 6;              // ein Name wirkt anders als ein Kuerzel
    if (s.signals.new52WeekHigh) rang += 4;
    if (s.signals.breakout) rang += 3;
    return { stock: s, rang };
  }).sort((a, b) => b.rang - a.rang || (a.stock.symbol < b.stock.symbol ? -1 : 1));

  const proSektor = new Map();
  const auswahl = [];
  for (const eintrag of bewertet) {
    const sektor = eintrag.stock.sector || "?";
    const bisher = proSektor.get(sektor) || 0;
    if (bisher >= 2) continue;
    proSektor.set(sektor, bisher + 1);
    auswahl.push(eintrag.stock);
    if (auswahl.length >= (anzahl || 5)) break;
  }
  return auswahl.map((s) => Object.assign(Contract.toCard(s), {
    plain: Klartext.karte(s, {}),
    headline: heroHeadline(s),
    reasons: heroReasons(s),
    hasPriceSeries: s.hasPriceSeries,
    seriesPath: s.hasPriceSeries ? "/quant/data/technical/instruments/" + s.symbol + ".json" : null,
    leadershipPercentile: s.metrics.leadershipPercentile,
    sectorRank: s.sectorRank || null
  }));
}

/* Welche Farbwelt trägt ein Titel? Die seines stärksten belegten Signals -
   dieselbe Zuordnung, die auch die Reihen färbt (Category Color System).
   Die Farbe steht nie allein: das Signal trägt daneben immer seinen Namen. */
function heroWorld(stock) {
  const zuordnung = METHODOLOGY.visualLanguage.signalWorlds;
  for (const signal of ["new52WeekHigh", "marketLeader", "breakout", "momentumLeader",
                        "relativeStrengthLeader", "trendIntact"]) {
    if (stock.signals[signal] && zuordnung[signal]) return zuordnung[signal];
  }
  return "leadership";
}

/** Die eine Zeile ueber der Aktie. Aus dem staerksten belegten Signal. */
function heroHeadline(stock) {
  if (stock.signals.new52WeekHigh && stock.signals.marketLeader) {
    return { kicker: "AM JAHRESHOCH UND UNTER DEN STÄRKSTEN", line: "" };
  }
  if (stock.signals.new52WeekHigh) return { kicker: "NEUES JAHRESHOCH", line: "" };
  if (stock.signals.breakout) return { kicker: "GERADE IN BEWEGUNG", line: "" };
  if (stock.signals.momentumLeader) return { kicker: "SEIT MONATEN IM AUFWIND", line: "" };
  return { kicker: "UNTER DEN STÄRKSTEN AKTIEN", line: "" };
}

/** Drei Belege, alle aus gerechneten Kennzahlen. */
/* Drei Belege unter der grossen Zahl.

   Sie hiessen frueher "Leadership 96", "RS 100", "Perzentil 100" - drei
   Werte, die man kennen muss, um sie zu lesen. Es sind dieselben Zahlen;
   nur heissen sie jetzt so, wie man sie erklaeren wuerde. Wo eine Zahl
   ohne Vorwissen nichts aussagt (ein Score von 96 auf einer Skala, die
   niemand kennt), steht stattdessen ihre Bedeutung. */
function heroReasons(stock) {
  const m = stock.metrics;
  const out = [];
  if (isNum(m.return6M)) {
    out.push({ label: "in 6 Monaten", value: Klartext.prozent(m.return6M), hint: null });
  }
  if (isNum(m.leadershipPercentile)) {
    out.push({ label: "der Aktien im Universum", value: "stärker als " +
               Math.min(99, Math.round(m.leadershipPercentile)) + " %", hint: null });
  }
  if (isNum(m.distanceTo52wHigh)) {
    out.push(m.distanceTo52wHigh >= -0.005
      ? { label: "", value: "am Jahreshoch", hint: null }
      : { label: "unter dem Jahreshoch", hint: null,
          value: Klartext.prozent(Math.abs(m.distanceTo52wHigh), false) });
  }
  return out.slice(0, 3);
}

/* ====================================================== Geschaeftszahlen

   Woher kommen Umsatz, Gewinn und Bewertung?

   Fuer das Modelluniversum aus quant/data/securities.json - dort stehen
   sie fertig gerechnet. Fuer reale Titel aus quant/data/sec/canonical/,
   und das sind genau fuenf: AAPL, MSFT, NVDA, JPM, XOM. Fuer die
   uebrigen 493 gibt es in diesem Repository keine Fundamentaldaten, und
   es wird auch keine erfunden - die Aktienseite sagt dann, dass keine
   vorliegen.

   Das ist kein Mangel dieser Ausbaustufe, sondern der Stand der
   Datenversorgung. Eine Wachstumsrate, die niemand belegen kann, waere
   schlimmer als eine fehlende. */
function secFaktenIndex() {
  const dir = join(root, "quant", "data", "sec", "canonical");
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const datei of readdirSync(dir)) {
    if (!datei.endsWith(".json")) continue;
    const ticker = datei.replace(/\.json$/, "");
    try {
      const payload = readJSON(join(dir, datei));
      if (Array.isArray(payload.facts) && payload.facts.length) map.set(ticker, payload.facts);
    } catch (err) { /* eine unlesbare Datei ist ein fehlender Titel, kein Abbruch */ }
  }
  return map;
}

function geschaeftszahlen(stock, secFakten, modellzeilen) {
  if (stock.dataMode === "mock") {
    return Unternehmen.ausModellzeile(modellzeilen.get(stock.symbol) || null);
  }
  const fakten = secFakten.get(stock.symbol);
  if (!fakten) {
    return Unternehmen.leer("SOURCE_MISSING",
      "Für diesen Titel liefert der Anbieter keine Geschäftszahlen. Vision Universe " +
      "zeigt deshalb nur, was aus der Kursreihe folgt.");
  }
  return Unternehmen.ausSecFakten(fakten, {
    preis: Contract.valueOf(stock.price),
    preisStatus: Contract.statusOf(stock.price)
  });
}

/* ========================================================== Detailseiten */
function technicalInstrumentIndex() {
  const file = join(root, "quant", "data", "technical", "index.json");
  if (!existsSync(file)) return new Map();
  const index = readJSON(file);
  return new Map((index.instruments || []).map((i) => [i.instrumentId, i]));
}

function buildDetail(universe, stock, instruments, barsByTicker, memberships) {
  const entry = instruments.get(stock.symbol);
  let bundle = null;
  let series = { available: false, source: null, path: null, reason: "NO_SERIES",
                 message: "Für diesen Titel wird keine Kursreihe ausgeliefert." };

  if (entry) {
    const file = join(root, "quant", "data", "technical", "instruments", stock.symbol + ".json");
    if (existsSync(file)) {
      const payload = readJSON(file);
      bundle = payload.bundle || null;
      /* Kein Kopieren: die Detailseite laedt die bestehende Datei zur
         Laufzeit. Eine zweite Kopie derselben Bars waere eine zweite
         Wahrheit, sobald der Technical-Build laeuft. */
      series = {
        available: true, source: "technical-instrument",
        path: "/quant/data/technical/instruments/" + stock.symbol + ".json",
        priceSeriesType: payload.priceSeriesType || "SPLIT_ADJUSTED",
        dataMode: payload.dataMode, bars: payload.bars ? payload.bars.timestamps.length : null,
        from: payload.bars ? payload.bars.from : null,
        reason: null, message: null
      };
    }
  }

  if (!series.available && barsByTicker && barsByTicker.has(stock.symbol)) {
    const bars = barsByTicker.get(stock.symbol);
    series = { available: true, source: "inline", path: null,
               priceSeriesType: "SPLIT_ADJUSTED", dataMode: stock.dataMode,
               bars: null, reason: null, message: null, inline: compactSeries(bars) };
    series.bars = series.inline.daily.dates.length;
  }

  if (!series.available && stock.dataMode === "real") {
    series.reason = "WITHHELD_REDISTRIBUTION";
    series.message = "Die Kursreihe dieses Titels stammt vom Anbieter und wird nach der " +
                     "Redistributionsregel nicht ausgeliefert. Alle Kennzahlen auf dieser " +
                     "Seite sind daraus abgeleitete Zustände, Abstände und Renditen.";
  }

  const detail = {
    contractVersion: Contract.CONTRACT_VERSION,
    methodologyVersion: METHODOLOGY.methodologyVersion,
    symbol: stock.symbol, companyName: stock.companyName,
    companyNameStatus: stock.companyNameStatus,
    /* Beide Kennungen auf der Seite. securityId ist der Schluessel im
       Bestand (Faktoren, Gate-Universen), instrumentId der haus­weite
       (§8, §41). Eine Seite, die nur das Kuerzel traegt, laesst sich
       spaeter nicht verlaesslich zuordnen. */
    securityId: stock.securityId || null,
    instrumentId: stock.instrumentId || null,
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    dataMode: stock.dataMode, provider: stock.provider, exchange: stock.exchange,
    sector: stock.sector, sectorStatus: stock.sectorStatus, industry: stock.industry,
    marketCap: stock.marketCap, capBucket: stock.capBucket,
    price: stock.price, changePercent: stock.changePercent,
    sparkline: stock.sparkline, sparklineStatus: stock.sparklineStatus,
    performancePath: stock.performancePath, performancePathStatus: stock.performancePathStatus,
    signals: stock.signals, badges: stock.badges,
    metrics: stock.metrics, metricStatus: stock.metricStatus,
    high52w: stock.high52w,
    scores: {
      leadership: stock.scoreDetail.leadership,
      momentum: stock.scoreDetail.momentum,
      relativeStrength: stock.scoreDetail.rs,
      breakout: stock.scoreDetail.breakout
    },
    ranks: {
      leadershipPercentile: stock.metrics.leadershipPercentile,
      momentumPercentile: stock.metrics.momentumPercentile,
      relativeStrengthPercentile: stock.metrics.relativeStrengthPercentile,
      sector: stock.sectorRank || null,
      universeSize: universe.stocks.length
    },
    rawValues: stock.rawValues,
    /* Klartext fuer den Kopf der Aktienseite: dieselbe Uebersetzung wie
       auf der Karte, damit die Seite dort weitermacht, wo man geklickt
       hat. Dazu die Zeitachse und die Jahresspanne in Worten - das ist
       Ebene 2, sie darf mehr zeigen als die Reihe, aber immer noch ohne
       Fachsprache. */
    plain: Klartext.karte(stock, {}),
    zeitachse: Klartext.zeitachse(stock),
    jahresspanne: Klartext.jahresspanne(stock),
    /* Die Farbwelt des staerksten Signals. Sie steht hier, weil die
       Detailseite dieselbe Zuordnung braucht wie die Reihe, aus der man
       kommt - und eine zweite Zuordnung waere eine zweite Wahrheit. */
    world: stock.world || null,
    /* Weiter entdecken: wo steht dieser Titel noch, und wer steht ihm nahe? */
    memberships: (memberships && memberships.get(stock.symbol)) || [],
    similar: buildSimilar(universe, stock, 8),
    series,
    technicalIntelligence: TI.fromBundle(bundle, { seriesAvailable: series.available }),
    discoveryEligible: stock.discoveryEligible !== false,
    ineligibleReason: stock.ineligibleReason || null,
    ineligibleMessage: stock.ineligibleMessage || null,
    dataQuality: stock.dataQuality, dataQualityReason: stock.dataQualityReason,
    asOf: stock.asOf, updatedAt: stock.updatedAt,
    disclaimer: METHODOLOGY.disclaimer
  };
  return detail;
}

/** Kompakte Reihe fuer Modelltitel: 2 Jahre taeglich, 10 Jahre woechentlich.

    Zwei Jahre Tagesbars tragen jeden Zeitraum bis 1Y samt Kerzen, ATR und
    Volumen; die Wochenreihe traegt 3Y bis 10Y. Mehr Tagesbars je Titel
    waeren ueber 150 Detailseiten mehrere Megabyte, die niemand ansieht. */
function compactSeries(bars) {
  const daily = bars.slice(-504);
  const weekly = [];
  const long = bars.slice(-2520);
  for (let i = 0; i < long.length; i += 5) weekly.push(long[i]);
  if (long.length && weekly[weekly.length - 1] !== long[long.length - 1]) weekly.push(long[long.length - 1]);
  return {
    daily: {
      dates: daily.map((b) => b.date),
      open: daily.map((b) => round(b.open, 2)),
      high: daily.map((b) => round(b.high, 2)),
      low: daily.map((b) => round(b.low, 2)),
      close: daily.map((b) => round(b.close, 2)),
      volume: daily.map((b) => (isNum(b.volume) ? Math.round(b.volume) : null))
    },
    weekly: {
      dates: weekly.map((b) => b.date),
      close: weekly.map((b) => round(b.close, 2))
    }
  };
}

/* =================================================================== Lauf */
console.log("Vision Universe DISCOVER — Präkomputation\n");
const started = Date.now();
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("1/5  Reales Universum (Tiingo-Faktoren) …");
const nameMap = buildNameMap();
const goldenBars = loadGoldenPreviewBars();
const real = applyPercentilesAndSignals(buildRealUniverse(nameMap, goldenBars));
console.log(`     ${real.stocks.length} Titel, Stand ${real.asOf}, ` +
            `${goldenBars.size} mit freigegebener Kursreihe`);

console.log("2/5  Modelluniversum (synthetisch) …");
const model = applyPercentilesAndSignals(buildModelUniverse());
console.log(`     ${model.stocks.length} Titel, Stand ${model.asOf}`);

const instruments = technicalInstrumentIndex();
const universes = [real, model];
const rowIndex = [];

console.log("3/5  Zeilen-Payloads …");
for (const universe of universes) {
  const rows = [];
  for (const config of METHODOLOGY.rows) {
    const row = buildRow(universe, config);
    write(`rows/${universe.universeId}/${config.id}.json`, row);
    rows.push({ rowId: row.rowId, title: row.title, subtitle: row.subtitle,
                returned: row.coverage.returned, matched: row.coverage.matched });
  }

  /* Sektorzeilen */
  const sectorPayload = [];
  for (const [sector, list] of universe.sectors) {
    if (list.length < METHODOLOGY.sectorRows.minSecuritiesPerSector) continue;
    sectorPayload.push({
      sector,
      count: list.length,
      /* Die Sektorkachel zeigt eine kleine Rangliste, keinen Chart - eine
         volle Karte je Titel waere hier reine Nutzlast. */
      cards: list.slice(0, METHODOLOGY.sectorRows.limitPerSector).map((s) => Contract.toMiniCard(s))
    });
  }
  sectorPayload.sort((a, b) => b.count - a.count);
  write(`rows/${universe.universeId}/sector-leaders.json`, {
    rowId: "sector-leaders", title: METHODOLOGY.sectorRows.title,
    world: METHODOLOGY.sectorRows.world || "sectors",
    subtitle: "Die stärksten Titel je Sektor - gerechnet nur dort, wo die Sektorzuordnung kuratiert ist.",
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    asOf: universe.asOf, generatedAt: universe.generatedAt,
    methodologyVersion: METHODOLOGY.methodologyVersion,
    coverage: {
      universeSize: universe.stocks.length,
      curatedSectors: sectorPayload.length,
      withoutSector: universe.stocks.filter((s) => s.sectorStatus !== "CURATED").length
    },
    sectors: sectorPayload
  });
  /* Die Eingangsflaeche. Eine eigene, sehr kleine Datei: sie wird als
     erste geladen und darf nicht auf eine 250-KB-Zeile warten. */
  const featured = buildFeatured(universe, 5);
  write(`featured/${universe.universeId}.json`, {
    universeId: universe.universeId, universeLabel: universe.label,
    universeKind: universe.kind, asOf: universe.asOf, generatedAt: universe.generatedAt,
    methodologyVersion: METHODOLOGY.methodologyVersion,
    selection: "Signal (Jahreshoch, Führerschaft oder bestätigter Ausbruch), dann " +
               "Leadership-Perzentil, dann Darstellbarkeit. Höchstens zwei je Sektor.",
    count: featured.length, stocks: featured
  });

  rowIndex.push({ universeId: universe.universeId, rows });

  /* Verzeichnis der ausgelieferten Aktienseiten.

     Ohne diese Datei muesste die Anwendung fuer jeden Titel erst eine
     Detailseite ANFRAGEN, um zu erfahren, dass es keine gibt - ein
     absichtlicher 404 je Aufruf, und im erweiterten Universum ist das der
     Regelfall und nicht die Ausnahme. Drei Kilobyte einmal sind billiger
     als ein Fehlschlag pro Seitenaufruf, und die Konsole bleibt sauber. */
  write(`stocks/${universe.universeId}/index.json`, {
    universeId: universe.universeId,
    count: universe.stocks.length,
    note: "Kuerzel, fuer die eine Detailseite ausgeliefert wird. Alle uebrigen Titel des " +
          "Company Master bekommen ihre Seite aus dem Master (quant/data/universe/).",
    symbols: universe.stocks.map((s) => s.symbol).sort()
  });

  /* Suchindex: klein genug fuer einen einzigen Abruf. */
  write(`search/${universe.universeId}.json`, {
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    asOf: universe.asOf, count: universe.stocks.length,
    /* Die Kennung steht im Index, damit ein Suchtreffer ohne zweiten
       Abruf zum Instrument aufloest (§8). */
    entries: universe.stocks.map((s) => ({
      i: s.instrumentId || null,
      s: s.symbol, n: s.companyName, sec: s.sector, m: s.dataMode === "real" ? 1 : 0,
      l: isNum(s.metrics.leadershipScore) ? Math.round(s.metrics.leadershipScore) : null,
      d: isNum(s.metrics.distanceTo52wHigh) ? round(s.metrics.distanceTo52wHigh, 4) : null,
      h: s.signals.new52WeekHigh ? 1 : 0,
      /* Die Zwoelfmonatsrendite. Sie ersetzt in der Trefferliste den
         Leadership Score: "+150 %" sagt jedem etwas, "LEAD 96" nur dem,
         der die Skala kennt. */
      r: isNum(s.metrics.return12M) ? round(s.metrics.return12M, 4) : null,
      /* Ein Buchstabenkuerzel je Farbwelt. Der Suchindex traegt alle
         Titel eines Universums; jedes zusaetzliche Feld kostet hier
         hundertfach, deshalb die Welt und sonst nichts - sie genuegt,
         damit ein Treffer aussieht wie die Reihe, aus der er kaeme. */
      w: s.world || null
    }))
  });
}

console.log("4/5  Detailseiten …");
const detailSets = new Map();
for (const universe of universes) {
  /* Fuer welche Titel wird eine Detailseite ausgeliefert?
     Reales Universum: alle - die Payloads sind klein, weil keine Kursreihe
     darin steckt. Modelluniversum: die Titel, die in einer Zeile
     auftauchen, plus alle mit bestehendem Technical-Bundle - deren
     Payload traegt eine Kursreihe und waere ueber 500 Titel unnoetig
     gross. */
  let symbols;
  if (universe.kind === "real") {
    symbols = new Set(universe.stocks.map((s) => s.symbol));
  } else {
    symbols = new Set();
    for (const config of METHODOLOGY.rows) {
      const row = buildRow(universe, config);
      row.cards.forEach((c) => symbols.add(c.symbol));
    }
    for (const [, list] of universe.sectors) {
      list.slice(0, METHODOLOGY.sectorRows.limitPerSector).forEach((s) => symbols.add(s.symbol));
    }
    for (const id of instruments.keys()) {
      if (universe.stocks.some((s) => s.symbol === id)) symbols.add(id);
    }
  }
  detailSets.set(universe.universeId, symbols);

  const memberships = buildMemberships(universe);
  const secFakten = secFaktenIndex();
  const modellzeilen = new Map(
    readJSON(join(root, "quant", "data", "securities.json")).rows.map((r) => [r.ticker, r]));
  let written = 0;
  for (const stock of universe.stocks) {
    if (!symbols.has(stock.symbol)) continue;
    const detail = buildDetail(universe, stock, instruments, universe.barsByTicker, memberships);
    detail.geschaeftszahlen = geschaeftszahlen(stock, secFakten, modellzeilen);
    write(`stocks/${universe.universeId}/${stock.symbol}.json`, detail);
    written++;
  }
  console.log(`     ${universe.universeId.padEnd(9)} ${written} Detailseiten`);
}

console.log("5/5  Meta …");
const meta = {
  module: "discover",
  moduleVersion: "discover-1.0.0",
  contractVersion: Contract.CONTRACT_VERSION,
  methodologyVersion: METHODOLOGY.methodologyVersion,
  visualLanguage: METHODOLOGY.visualLanguage,
  topTen: METHODOLOGY.top10,
  engines: {
    high52w: High52w.ENGINE_VERSION, scoring: Scoring.ENGINE_VERSION,
    indicators: Indicators.ENGINE_VERSION, technicalIntelligence: TI.ENGINE_VERSION,
    factors: Factors.VERSION
  },
  generatedAt: new Date().toISOString(),
  gates: GATES,
  gateReasons: Object.keys(GATES).reduce((acc, name) => {
    acc[name] = DisplayPolicy.gateReason(GATES_CONFIG, name);
    return acc;
  }, {}),
  realtime: {
    available: false,
    reason: "gateDisabled",
    message: "ENABLE_PUBLIC_LIVE_MARKET_DATA ist nicht gesetzt und für Realtime liegt keine " +
             "Anzeigeerlaubnis vor. Discover zeigt den letzten ausgelieferten Stand und " +
             "kennzeichnet ihn als solchen - es gibt keinen LIVE-Punkt ohne Live-Daten.",
    realtimeFields: ["price", "changePercent", "new52WeekHigh", "intradayBreakout"],
    derivedFields: ["leadershipScore", "momentumScore", "relativeStrengthScore",
                    "breakoutScore", "percentiles", "movingAverages"]
  },
  universes: universes.map((u) => ({
    universeId: u.universeId, label: u.label, kind: u.kind, provider: u.provider,
    benchmark: u.benchmark, asOf: u.asOf, generatedAt: u.generatedAt,
    engine: u.engine, sourceFile: u.sourceFile,
    securities: u.stocks.length,
    withPriceSeries: u.stocks.filter((s) => s.hasPriceSeries).length,
    withCompanyName: u.stocks.filter((s) => s.companyName).length,
    curatedSectors: u.sectors.size,
    notTradingExcluded: u.stocks.filter((s) => s.discoveryEligible === false)
      .map((s) => ({ symbol: s.symbol, reason: s.ineligibleReason })),
    detailPages: detailSets.get(u.universeId).size,
    redistribution: u.redistribution || null,
    note: METHODOLOGY.universes[u.universeId].note,
    rankingScope: METHODOLOGY.universes[u.universeId].rankingScope
  })),
  rows: rowIndex,
  sources: [
    "quant/data/market/factors/factors-GATE_500.json",
    "quant/data/market/scale/universe-GATE_500.json",
    "quant/data/market/golden-preview/daily/*.json",
    "quant/data/technical/index.json",
    "quant/data/securities.json",
    "quant/config/feature-gates.json",
    "quant/config/development-preview.json",
    "quant/config/market-calendar.json"
  ],
  boundary: "Discover liest bestehende Vision-Universe-Daten und schreibt ausschließlich " +
            "nach discover/data/**. Keine bestehende Datei wird verändert.",
  disclaimer: METHODOLOGY.disclaimer
};
write("meta.json", meta);

console.log(`\nFertig in ${((Date.now() - started) / 1000).toFixed(1)} s — ` +
            `${filesWritten} Dateien, ${(bytesWritten / 1024 / 1024).toFixed(2)} MB`);
