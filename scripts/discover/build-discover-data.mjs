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
const { resolveProductUniverse } = await import(join(root, "scripts", "market", "universe-source.mjs"));

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
const Fundamentals = require(join(root, "discover", "engines", "fundamentals.js"));
const Relevance = require(join(root, "discover", "engines", "relevance.js"));

const OUT = join(root, "discover", "data");
const METHODOLOGY = readJSON(join(root, "discover", "methodology", "discover-v1.json"));
const GATES_CONFIG = readJSON(join(root, "quant", "config", "feature-gates.json"));
const PREVIEW_CONFIG = readJSON(join(root, "quant", "config", "development-preview.json"));
const GATES = DisplayPolicy.gatesFromConfig(GATES_CONFIG);
DisplayPolicy.declareFromConfig(PREVIEW_CONFIG);

/* Redaktionelle Metadata (V3). Beides ist Beschriftung, keine Kennzahl:
   die Bekanntheitsliste bestimmt nie, OB ein Titel in einer Reihe steht,
   und ein Thema ist eine Zuordnung, keine Aussage ueber eine Aktie. */
const RECOGNITION = readJSON(join(root, "discover", "config", "company-recognition.json")).companies || {};

/* Kompakte Kursreihen (ein Jahr Tagesschluss) fuer den freigegebenen
   Umfang - quant/data/market/discover-series/, geschrieben von
   scripts/market/publish-discover-series.mjs, geprueft vom Hygiene-Guard.
   Fuer jeden Titel dort gibt es einen echten Micro-Chart; fuer jeden
   anderen die Renditeleiter. Der Build erweitert nichts: er liest, was
   die Richtlinie freigegeben hat. */
function discoverSeriesIndex() {
  const dir = join(root, "quant", "data", "market", "discover-series");
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    const payload = readJSON(join(dir, name));
    if (payload && payload.ticker && Array.isArray(payload.points) && payload.points.length >= 30) {
      map.set(payload.ticker, payload);
    }
  }
  return map;
}
const THEMES = readJSON(join(root, "discover", "config", "themes.json"));

/* Die Reihen: die der Methodik plus eine je Themenwelt. Themenreihen
   entstehen aus derselben Maschine wie alle anderen (buildRow) - mit
   einer Aufnahmeregel, die "steht in der Themenliste" heisst, und einer
   Sortierung nach Kennzahl. Was auf der Karte steht, ist gerechnet. */
function themeRows() {
  return (THEMES.themes || []).map((t) => ({
    id: "thema-" + t.id, title: t.title, subtitle: t.lead, theme: t.id, editorial: true,
    sort: "leadershipScore", direction: "desc", limit: 30, require: ["leadershipScore"],
    filter: "thema", tickers: t.tickers, world: t.world || "sectors", microRange: "6M",
    minMembers: isNum(THEMES.minMembers) ? THEMES.minMembers : 5
  }));
}
const ROWS = METHODOLOGY.rows.concat(themeRows());

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

/* ------------------------------------------------- Micro-Kursreihe (V3)

   Die Karten zeichnen keinen Renditepfad mehr als Linie. Was sie zeichnen
   duerfen, ist eine echte Kursreihe - und die gibt es nur, wo sie
   ausgeliefert werden darf. Diese Funktion baut daraus die kleinste Form,
   die eine Karte braucht: vier Zeitraeume, je hoechstens 64 Punkte,
   Schlusskurse auf zwei Stellen, mit Herkunft und Stand. Zwischen den
   Punkten liegt nichts Erfundenes: jeder Punkt ist ein Tagesschluss. */
/* Ein Jahr Tagesschluss je Titel (270 Handelstage, mit Reserve). Die
   Zeitraeume 1M/3M/6M/1J sind Fenster darauf, die der Micro-Chart selbst
   schneidet - ein Datensatz je Titel, nicht vier. */
const MICRO_DAYS = 270;

function microSeries(dated, source, priceSeriesType) {
  const valid = (dated || []).filter((b) => isNum(b.close) && b.date);
  if (valid.length < 10) {
    return withheldSeries("INSUFFICIENT_HISTORY", "Zu wenig Historie für einen Verlauf.");
  }
  const fenster = valid.slice(-Math.min(MICRO_DAYS, valid.length));
  return { status: "CALCULATED", source, priceSeriesType: priceSeriesType || "SPLIT_ADJUSTED",
           dataMode: null, grain: "daily", asOf: fenster[fenster.length - 1].date,
           from: fenster[0].date, to: fenster[fenster.length - 1].date,
           points: fenster.map((b) => [b.date, round(b.close, 2)]), path: null, message: null };
}
function withheldSeries(status, message) {
  return { status, source: null, priceSeriesType: null, asOf: null, from: null, to: null,
           points: null, path: null, message };
}
/**
 * Der Verweis, den eine Karte traegt: Status, Herkunft, Stand, Zeitraum
 * und der Pfad zur Reihe - keine Punkte. Die Punkte laedt die Karte,
 * sobald sie sichtbar ist (ui/series-loader.js); ein Titel in drei
 * Sammlungen laedt sie einmal.
 */
function seriesRef(series, range, universeId, symbol, path) {
  if (!series || series.status !== "CALCULATED") return series;
  return { status: series.status, source: series.source, priceSeriesType: series.priceSeriesType,
           asOf: series.asOf, range: range || "6M", from: series.from, to: series.to,
           points: null, path: path || ("/discover/data/series/" + universeId + "/" + symbol + ".json"),
           message: null };
}
/* Kompatibilitaet: aeltere Stellen im Build nennen die Funktion noch so. */
const slimSeries = (series, range) => series;

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
/* Die Faktordatei des Produktuniversums: factors-FULL_UNIVERSE.json, gerechnet
   von build-market-factors.mjs --gate FULL_UNIVERSE --product-universe ueber
   den Company Master. Kein Rueckfall auf ein kleineres Gate mehr (die
   Uebergangsloesung bis 2026-09-13): fehlt die Datei, bricht der Build ab. */
function pickFactorsFile() {
  const file = join(root, "quant", "data", "market", "factors", "factors-FULL_UNIVERSE.json");
  if (!existsSync(file)) {
    throw new Error("factors-FULL_UNIVERSE.json fehlt - Einzelzeilen fuer das Produktuniversum werden vom " +
                    "Workflow market-data-refresh.yml gerechnet (build-market-factors.mjs --product-universe).");
  }
  return { gate: "FULL_UNIVERSE", file };
}

function buildRealUniverse(nameMap, goldenBars, compactSeries) {
  const universeSource = resolveProductUniverse(root);
  const faktorQuelle = pickFactorsFile();
  const factors = readJSON(faktorQuelle.file);
  const byTicker = new Map(universeSource.securities.map((s) => [s.ticker, s]));
  const factorTickers = new Set(factors.securities.map((f) => f.ticker));
  const withFactorRows = universeSource.securities.filter((s) => factorTickers.has(s.ticker)).length;
  const factorCoverage = {
    universe: universeSource.securities.length,
    withFactorRows,
    factorsGate: faktorQuelle.gate,
    factorsUniverseSource: factors.universeSource || null,
    /* partial heisst jetzt: die Faktordatei kennt nicht jeden Titel des
       Produktuniversums - z. B. weil sie vor der Uebernahme des Company
       Masters gerechnet wurde. Der naechste Workflow-Lauf schliesst das. */
    partial: withFactorRows < universeSource.securities.length * 0.9,
    note: withFactorRows < universeSource.securities.length * 0.9
      ? `Faktorzeilen fuer ${withFactorRows} von ${universeSource.securities.length} Titeln des Produktuniversums; der naechste Lauf von market-data-refresh.yml rechnet den Rest.`
      : "Faktorzeilen fuer das Produktuniversum (Company Master)."
  };

  const stocks = [];
  const consumerPolicy = { allowed: 0, excludedByType: {} };
  for (const sec of factors.securities) {
    /* Nur Titel des Produktuniversums: was der Company Master ausschliesst
       (Warrants, Units, Rights, Testwerte), bekommt keine Karte - auch wenn
       eine Faktorzeile existiert. */
    if (!byTicker.has(sec.ticker)) continue;
    const values = sec.values || {};
    const ref = byTicker.get(sec.ticker) || {};
    /* Consumer-Instrumentenpolitik (universe-source.mjs): Discover zeigt
       Unternehmen, keine Vorzugspapiere, Units, Warrants, Fonds. */
    if (ref.consumer === false) {
      const typ = ref.instrumentType || "UNKNOWN";
      consumerPolicy.excludedByType[typ] = (consumerPolicy.excludedByType[typ] || 0) + 1;
      continue;
    }
    consumerPolicy.allowed++;
    const metrics = flatMetrics(values);
    const scores = scoreAll(metrics, values);
    const named = nameMap.get(sec.ticker);

    metrics.leadershipScore = scores.leadership.score;
    metrics.momentumScore = scores.momentum.score;
    metrics.relativeStrengthScore = scores.rs.score;
    metrics.breakoutScore = scores.breakout.score;

    const golden = goldenBars.get(sec.ticker);
    const goldenDated = golden ? splitAdjustedCloses(golden.bars) : null;
    const goldenCloses = goldenDated ? goldenDated.map((b) => b.close) : null;
    const erkannt = RECOGNITION[sec.ticker] || null;
    /* Die kompakte Reihe: fuer jeden Titel, den der Umfang freigibt. Die
       volle Golden-Five-Historie hat Vorrang - dieselben Kurse, nur
       laenger. */
    const kompakt = compactSeries.get(sec.ticker) || null;
    const kompaktDated = kompakt ? kompakt.points.map((p) => ({ date: p[0], close: p[1] })) : null;
    /* Der Pfad der Reihe: die kompakte Reihe wird nicht kopiert, die Karte
       laedt die kanonische Datei aus quant/data/market/discover-series/.
       Nur Titel mit voller Historie und ohne kompakte Reihe bekommen eine
       Kopie im Series-Store. */
    const seriesPath = kompakt ? "/quant/data/market/discover-series/" + (kompakt.securityId || sec.securityId) + ".json" : null;
    const kursCloses = goldenCloses || (kompaktDated ? kompaktDated.map((b) => b.close) : null);

    const stock = Contract.normalizeStock({
      symbol: sec.ticker,
      securityId: sec.securityId,
      /* Name: displayName der kanonischen Namensschicht, sonst ihr
         companyName, sonst die Repository-Namensquellen, sonst nichts -
         der Ticker wird nie als Name eingetragen. */
      companyName: ref.displayName || ref.companyName || (named ? named.name : null),
      companyNameStatus: (ref.companyName || named) ? "CALCULATED" : "SOURCE_MISSING",
      legalName: ref.companyName || null,
      nameSource: ref.nameSource || (named ? named.source : null),
      universeId: "US_REAL",
      dataMode: "real",
      provider: factors.provider || "tiingo",
      exchange: sec.exchange || ref.exchange || null,
      /* Sektor: aus der Faktorzeile, sonst aus der Universumsquelle (kuratierte
         Zuordnung), sonst aus der Namensquelle - nie geraten. */
      sector: sec.sector || ref.sector || (named && named.sector) || null,
      sectorStatus: sec.sector ? (sec.sectorStatus || "CURATED")
                  : ref.sector ? (ref.sectorStatus || "CURATED") : "SOURCE_MISSING",
      /* Absolute Kursniveaus realer Titel bleiben nach der
         Redistributionsregel des Bestandssystems zurueck. Die Card zeigt
         deshalb keinen Preis - und sagt warum, statt eine Null. */
      /* Der letzte Schlusskurs: aus der vollen Historie oder aus der
         kompakten Reihe - beide sind freigegeben (Eigentuemerentscheidung
         2026-09-13). Ohne Reihe bleibt das Feld leer und sagt warum. */
      price: kursCloses
        ? Contract.field(round(kursCloses[kursCloses.length - 1], 4))
        : Contract.field(null, "WITHHELD_REDISTRIBUTION"),
      changePercent: kursCloses && kursCloses.length > 1
        ? Contract.field(round((kursCloses[kursCloses.length - 1] / kursCloses[kursCloses.length - 2] - 1) * 100, 4))
        : Contract.field(null, "WITHHELD_REDISTRIBUTION"),
      sparkline: goldenCloses ? weeklySparkline(goldenCloses) : null,
      sparklineStatus: goldenCloses ? "CALCULATED" : "WITHHELD_REDISTRIBUTION",
      performancePath: performancePath(metrics),
      hasPriceSeries: !!goldenCloses || !!kompaktDated,
      priceSeries: goldenDated
        ? microSeries(goldenDated, "tiingo", "SPLIT_ADJUSTED")
        : kompaktDated
          ? microSeries(kompaktDated, kompakt.provider || "tiingo", kompakt.priceSeriesType || "SPLIT_ADJUSTED")
          : withheldSeries("WITHHELD_REDISTRIBUTION",
              "Die Kursreihe dieses Titels stammt vom Anbieter und wird nicht ausgeliefert."),
      was: erkannt ? erkannt.was : null,
      recognitionTier: erkannt ? erkannt.tier : null,
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
    stock.seriesPath = seriesPath;
    /* Kursspanne der ausgelieferten Reihe - fuer "Kurs + Fundamentals". */
    const dated = goldenDated || kompaktDated;
    if (dated && dated.length >= 2) {
      stock.priceRange = { start: { date: dated[0].date, close: dated[0].close },
                           end: { date: dated[dated.length - 1].date, close: dated[dated.length - 1].close } };
    }
    attachFundamentals(stock, FUNDAMENTALS.get(sec.ticker) || null);
    stocks.push(stock);
  }
  const fundamentalsCoverage = {
    withFundamentals: stocks.filter((s) => s.signals.fundamentals).length,
    h3: stocks.filter((s) => s.fundamentalCapabilities && s.fundamentalCapabilities.HAS_FUNDAMENTALS_3Y).length,
    h5: stocks.filter((s) => s.fundamentalCapabilities && s.fundamentalCapabilities.HAS_FUNDAMENTALS_5Y).length,
    h10: stocks.filter((s) => s.fundamentalCapabilities && s.fundamentalCapabilities.HAS_FUNDAMENTALS_10Y).length,
    ttm: stocks.filter((s) => s.fundamentalCapabilities && s.fundamentalCapabilities.HAS_TTM).length,
    withValuation: stocks.filter((s) => isNum(s.metrics.f_pe)).length,
    source: FUNDAMENTALS.size ? "quant/data/sec/consumer" : null
  };

  return {
    universeId: "US_REAL",
    universeSource: { source: universeSource.source, file: universeSource.file, version: universeSource.version,
                      counts: universeSource.counts, sha256: universeSource.sha256, handover: universeSource.handover },
    factorCoverage,
    fundamentalsCoverage,
    consumerPolicy: Object.assign({}, consumerPolicy, { rule: "CONSUMER_INSTRUMENT_TYPES aus scripts/market/universe-source.mjs" }),
    label: METHODOLOGY.universes.US_REAL.label,
    kind: "real",
    provider: factors.provider,
    benchmark: factors.benchmark ? factors.benchmark.id : null,
    asOf: factors.securities.length ? factors.securities[0].asOf : null,
    generatedAt: factors.generatedAt,
    engine: factors.engine,
    redistribution: factors.redistribution,
    sourceFile: faktorQuelle.file.replace(root + "/", ""),
    stocks
  };
}

function withheldMetricStatus(metrics, fieldStatus) {
  const out = {};
  for (const key of Contract.METRICS) {
    if (isNum(metrics[key])) { out[key] = "CALCULATED"; continue; }
    out[key] = key.indexOf("f_") === 0 ? "SOURCE_MISSING" : "INSUFFICIENT_HISTORY";
  }
  return out;
}

/* =========================================================== Fundamentals

   Was das Unternehmen gemacht hat - aus dem Consumer-Bundle der SEC-
   Pipeline, gerechnet von discover/engines/fundamentals.js. Am Titel
   haengen die Kennzahlen (Praefix f_), die Signale fuer Sammlungen, der
   Karten-Hook und die Bewertung aus Kurs und Fundamentals. Fehlt das
   Bundle, bleibt alles null/false und die Statusfelder sagen SOURCE_MISSING. */
function attachFundamentals(stock, model) {
  stock.fundamentalModel = model || null;
  stock.fundamentalCapabilities = Fundamentals.capabilities(model);
  if (!model) return;
  const sig = Fundamentals.signals(model);
  const m = stock.metrics;
  const v = (x) => (x && isNum(x.value)) ? x.value : null;
  const revRows = model.annual.revenue || [];
  m.f_revenue = revRows.length ? revRows[revRows.length - 1].v : null;
  m.f_revenueGrowth3y = v(sig.revenueGrowth3y);
  m.f_revenueGrowth10y = v(sig.revenueGrowth10y);
  m.f_netMargin = v(sig.netMargin);
  m.f_fcfMargin = v(sig.fcfMargin);
  m.f_earningsAcceleration = v(sig.earningsAcceleration);
  m.f_marginExpansion3y = v(sig.marginExpansion3y);
  const latest = Fundamentals.latest(model);
  m.f_roe = latest.derived && isNum(latest.derived.roe) ? latest.derived.roe : null;
  const g = Unternehmen.ausConsumerBundle(model, { preis: Contract.valueOf(stock.price), preisStatus: Contract.statusOf(stock.price) });
  m.f_revenueGrowthTTM = isNum(g.umsatzWachstum) ? g.umsatzWachstum : null;
  /* Bewertung: Kurs x Aktien gegen Umsatz/FCF, Kurs gegen Gewinn je Aktie.
     Basis (TTM oder FY) steht dran; nichts wird gemischt. */
  const preis = Contract.valueOf(stock.price);
  const bewertung = valuationOf(model, g, preis);
  m.f_pe = bewertung.pe ? bewertung.pe.value : null;
  m.f_ps = bewertung.ps ? bewertung.ps.value : null;
  m.f_fcfYield = bewertung.fcfYield ? bewertung.fcfYield.value : null;
  stock.fundamentalValuation = bewertung;
  stock.geschaeftszahlenKompakt = g;
  stock.signals.fundamentals = true;
  stock.signals.compounder = !!(sig.compounder && sig.compounder.value === true);
  stock.signals.turnaround = !!(sig.turnaround && sig.turnaround.value === true);
  stock.signals.netCash = !!(sig.netCash && sig.netCash.value === true);
  for (const key of Contract.METRICS) if (key.indexOf("f_") === 0) stock.metricStatus[key] = isNum(m[key]) ? "CALCULATED" : "SOURCE_MISSING";
  stock.hook = fundamentalHook(model, sig);
}

function valuationOf(model, g, preis) {
  const out = { available: false, basis: g.basis || null };
  if (!isNum(preis) || preis <= 0) { out.reason = "NO_PRICE"; return out; }
  const M = 1e6;
  const aktienReihe = (model.annual.shares_outstanding && model.annual.shares_outstanding.length) ? model.annual.shares_outstanding
                    : (model.annual.diluted_weighted_average_shares || []);
  const aktien = aktienReihe.length ? aktienReihe[aktienReihe.length - 1] : null;
  if (aktien && aktien.v > 0) {
    out.marketCap = { value: preis * aktien.v, shares: aktien.v, sharesFy: aktien.fy, sharesEnd: aktien.end };
    if (isNum(g.umsatzTTM) && g.umsatzTTM > 0) out.ps = { value: (preis * aktien.v) / (g.umsatzTTM * M), basis: g.basis, period: g.zeitraum, calculation: "Kurs x Aktien / Umsatz (" + g.basis + ")" };
    const fcf = (model.ttm.free_cash_flow && isNum(model.ttm.free_cash_flow.v)) ? { v: model.ttm.free_cash_flow.v, basis: "TTM", through: model.ttm.free_cash_flow.through }
              : (model.annual.free_cash_flow && model.annual.free_cash_flow.length) ? Object.assign({ basis: "FY" }, model.annual.free_cash_flow[model.annual.free_cash_flow.length - 1]) : null;
    if (fcf) out.fcfYield = { value: fcf.v / (preis * aktien.v), basis: fcf.basis, through: fcf.through || null, fy: fcf.fy || null, calculation: "Free Cashflow (" + fcf.basis + ") / (Kurs x Aktien)" };
  }
  if (g.kgvStatus === "CALCULATED" && isNum(g.kgv)) out.pe = { value: g.kgv, basis: g.basis, eps: g.gewinnJeAktie, period: g.zeitraum, calculation: "Kurs / Gewinn je Aktie (" + g.basis + ")" };
  else out.peReason = g.kgvStatus;
  out.available = !!(out.pe || out.ps || out.fcfYield);
  out.price = preis;
  return out;
}

/* Der Einstieg in die Geschichte: EIN belegter Satz, EINE Zahl. */
function fundamentalHook(model, sig) {
  const story = Fundamentals.story(model);
  const bevorzugt = ["revenue_doubled", "profit_faster", "turned_profitable", "margin_up", "shares_down", "revenue_up", "fcf_up"];
  for (const id of bevorzugt) {
    const s = (story.statements || []).find((x) => x.id === id);
    if (s) return { id: s.id, text: s.text, metric: s.evidence.metric, from: s.evidence.periodStart.fy, to: s.evidence.periodEnd.fy,
                    valueStart: s.evidence.valueStart, valueEnd: s.evidence.valueEnd, source: s.evidence.source, asOf: s.evidence.asOf };
  }
  if (sig.revenueGrowth3y && isNum(sig.revenueGrowth3y.value)) {
    const g = sig.revenueGrowth3y;
    return { id: "revenue_cagr_3y", text: "Umsatz " + (g.value >= 0 ? "+" : "") + Math.round(g.value * 100) + " % pro Jahr über drei Jahre",
             metric: "revenue", from: g.evidence.periodStart.fy, to: g.evidence.periodEnd.fy, valueStart: g.evidence.valueStart, valueEnd: g.evidence.valueEnd,
             source: g.evidence.source, asOf: g.evidence.asOf };
  }
  return null;
}

/* Bewertung im Vergleich: der Median des Universums als Massstab - eine
   Aussage wie "deutlich hoeher bewertet als der breite Markt" braucht
   genau diesen Vergleich, sonst ist sie eine Behauptung. */
function applyValuationContext(universe) {
  const pes = universe.stocks.map((s) => s.metrics.f_pe).filter((x) => isNum(x) && x > 0 && x < 500).sort((a, b) => a - b);
  const pss = universe.stocks.map((s) => s.metrics.f_ps).filter((x) => isNum(x) && x > 0 && x < 500).sort((a, b) => a - b);
  const median = (arr) => arr.length ? arr[Math.floor(arr.length / 2)] : null;
  universe.valuationContext = { peMedian: median(pes), psMedian: median(pss), peCount: pes.length, psCount: pss.length,
                                rule: "deutlich höher: KGV > 1,5 × Median; günstiger: KGV < 0,67 × Median; sonst im Bereich des Markts" };
  for (const s of universe.stocks) {
    if (!s.fundamentalValuation || !s.fundamentalValuation.available) continue;
    const b = s.fundamentalValuation;
    const pm = universe.valuationContext.peMedian;
    if (b.pe && isNum(pm) && pm > 0) {
      const x = b.pe.value / pm;
      b.relative = { peVsMedian: x, peMedian: pm, universeCount: pes.length,
                     label: b.pe.value <= 0 ? "Kein Gewinn" : x > 1.5 ? "Deutlich höher bewertet als der breite Markt"
                          : x < 0.67 ? "Günstiger bewertet als der breite Markt" : "Im Bereich des breiten Markts",
                     stufe: b.pe.value <= 0 ? "negativ" : x > 1.5 ? "hoch" : x < 0.67 ? "niedrig" : "mittel" };
    } else if (b.peReason) {
      b.relative = { label: null, stufe: null, reason: b.peReason };
    }
  }
  return universe;
}

/* Der Fundamentals-Block der Aktienseite. */
function fundamentalsDetail(universe, stock) {
  const model = stock.fundamentalModel;
  if (!model) {
    return { available: false, reason: "SOURCE_MISSING",
             message: "Für diesen Titel liegen keine Geschäftszahlen der SEC vor (kein CIK, keine XBRL-Fakten oder nicht im Companyfacts-Archiv)." };
  }
  const compare = Fundamentals.compare(model);
  const journey = Fundamentals.journey(model);
  const story = Fundamentals.story(model);
  const health = Fundamentals.health(model);
  const latest = Fundamentals.latest(model);
  const pvf = stock.priceRange ? Fundamentals.priceVsFundamentals(model, stock.priceRange.start, stock.priceRange.end) : { available: false };
  return {
    available: true, version: Fundamentals.VERSION, source: model.source, asOf: model.asOf, cik: model.cik,
    capabilities: stock.fundamentalCapabilities,
    fiscalYears: model.years, latestFiscalYear: model.years[model.years.length - 1] || null,
    ttmThrough: (model.coverage && model.coverage.ttmThrough) || null,
    units: model.units,
    compare, journey, story, health, latest,
    valuation: Object.assign({ context: universe.valuationContext || null }, stock.fundamentalValuation || { available: false }),
    priceVsFundamentals: pvf
  };
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
      priceSeries: microSeries(bars.map((b) => ({ date: b.date, close: b.close })),
                               "VisionUniverseMock", "SPLIT_ADJUSTED"),
      was: null,
      recognitionTier: null,
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


/* Die Basis einer fundamentalen Sammlung: ein Unternehmen, das im letzten
   Geschaeftsjahr mindestens 100 Mio. $ umgesetzt hat, und ein Wachstum
   ohne Basiseffekt (<= 300 % pro Jahr). CorMedix mit +1 583 % p. a. auf
   einer Basis von wenigen Millionen ist eine wahre Zahl und trotzdem
   keine Entdeckung, die "Umsatz waechst stark" anfuehren sollte. */
const FUND_MIN_REVENUE_USD = 100e6, FUND_MAX_GROWTH = 3.0;
function fundBasis(s) {
  const m = s.metrics;
  if (!isNum(m.f_revenue) || m.f_revenue < FUND_MIN_REVENUE_USD) return false;
  if (isNum(m.f_revenueGrowth3y) && m.f_revenueGrowth3y > FUND_MAX_GROWTH) return false;
  return true;
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
  trendIntact: (s) => s.signals.trendIntact === true,

  /* V3. Die Regeln stehen auch in der Methodik (rows[].rule) - hier ist
     ihr Code, dort ihr Wortlaut. */
  /* Bekannt UND in Bewegung. Die Bekanntheit ist redaktionell; die
     Bewegung ist gerechnet. Ohne die zweite Bedingung waere die Reihe
     eine Liste von Namen, nicht von Beobachtungen. */
  bekannt: (s) => s.recognitionTier === 1 &&
    (s.signals.new52WeekHigh || s.signals.nearHigh || s.signals.breakout ||
     (isNum(s.metrics.return3M) && s.metrics.return3M >= 0.05)),
  /* Deutlich gefallen, seit drei Monaten klar im Plus, noch nicht wieder
     oben. Alle drei Bedingungen aus Kennzahlen - "Comeback?" traegt sein
     Fragezeichen zu Recht. */
  comeback: (s) => isNum(s.metrics.maxDrawdown252d) && s.metrics.maxDrawdown252d <= -0.25 &&
    isNum(s.metrics.return3M) && s.metrics.return3M >= 0.10 &&
    isNum(s.metrics.distanceTo52wHigh) && s.metrics.distanceTo52wHigh <= -0.08,
  /* Stark, aber ohne bekannten Namen: das Komplement zu "bekannt". */
  ueberraschung: (s) => !isNum(s.recognitionTier) &&
    isNum(s.metrics.leadershipPercentile) && s.metrics.leadershipPercentile >= 85,
  /* Steht in der Themenliste. Mehr prueft ein Thema nicht - es ist eine
     Zuordnung, und die Reihe zeigt, was die Zahlen dazu sagen. */
  thema: (s, config) => Array.isArray(config.tickers) && config.tickers.indexOf(s.symbol) !== -1,

  /* FUNDAMENTAL (discover/engines/fundamentals.js). Jede Regel liest nur
     Kennzahlen, die aus Geschaeftsjahren der SEC-Bundles gerechnet sind;
     ein Titel ohne Bundle faellt durch (null). Der Wortlaut steht in der
     Methodik (rows[].rule). */
  fundUmsatz: (s) => fundBasis(s) && isNum(s.metrics.f_revenueGrowth3y) && s.metrics.f_revenueGrowth3y >= 0.15,
  fundGewinne: (s) => fundBasis(s) && isNum(s.metrics.f_earningsAcceleration) && s.metrics.f_earningsAcceleration >= 0.05 &&
    isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin > 0,
  fundMargen: (s) => fundBasis(s) && isNum(s.metrics.f_marginExpansion3y) && s.metrics.f_marginExpansion3y >= 2 &&
    isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin >= -0.25,
  fundCashflow: (s) => fundBasis(s) && isNum(s.metrics.f_fcfMargin) && s.metrics.f_fcfMargin >= 0.15 && isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin > 0,
  fundQualitaetWachstum: (s) => fundBasis(s) && isNum(s.metrics.f_revenueGrowth3y) && s.metrics.f_revenueGrowth3y >= 0.10 &&
    isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin >= 0.10,
  fundCompounder: (s) => fundBasis(s) && s.signals.compounder === true,
  fundProfitablesWachstum: (s) => fundBasis(s) && isNum(s.metrics.f_revenueGrowth3y) && s.metrics.f_revenueGrowth3y >= 0.10 &&
    isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin >= 0.05 && isNum(s.metrics.f_fcfMargin) && s.metrics.f_fcfMargin > 0,
  fundTurnaround: (s) => fundBasis(s) && s.signals.turnaround === true,
  fundQualitaetPreis: (s) => fundBasis(s) && isNum(s.metrics.f_netMargin) && s.metrics.f_netMargin >= 0.10 &&
    isNum(s.metrics.f_pe) && s.metrics.f_pe > 0 && s.metrics.f_pe <= 20,
  fundBilanzWachstum: (s) => fundBasis(s) && s.signals.netCash === true && isNum(s.metrics.f_revenueGrowth3y) && s.metrics.f_revenueGrowth3y >= 0.10
};

function buildRow(universe, config) {
  const pool = universe.stocks.filter((s) => {
    if (s.discoveryEligible === false) return false;
    if (config.filter && ROW_FILTERS[config.filter] && !ROW_FILTERS[config.filter](s, config)) return false;
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
  const cards = auswahl.map((s, i) => Object.assign(Contract.toCard(s), {
    plain: texte[i],
    /* Der Verweis auf die Reihe, nicht die Reihe: geladen wird, was
       sichtbar wird. */
    priceSeries: seriesRef(s.priceSeries, config.microRange || "6M", universe.universeId, s.symbol, s.seriesPath)
  }));
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
    microRange: config.microRange || "6M",
    rule: config.rule || null,
    theme: config.theme || null,
    editorial: config.editorial === true,
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
  for (const config of ROWS) {
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
/* ================================================= Next Discovery

   Eine Aktie fuehrt zur naechsten. Deterministische Aehnlichkeit ueber
   das, was vorliegt: Sektor, Kursverhalten (Leadership-Perzentil,
   Volatilitaet), Fundamentals (Umsatzwachstum, Nettomarge, Bewertung).
   Fehlt eine Dimension, faellt sie aus dem Abstand - sie wird nicht
   geschaetzt. Jede Liste sagt, wonach sie sortiert ist. */
function similarityDistance(a, b) {
  const dims = [
    ["leadershipPercentile", 100], ["volatility252d", 0.6], ["f_revenueGrowth3y", 0.5], ["f_netMargin", 0.4]
  ];
  let sum = 0, n = 0;
  for (const [k, scale] of dims) {
    const x = a.metrics[k], y = b.metrics[k];
    if (!isNum(x) || !isNum(y)) continue;
    sum += Math.pow((x - y) / scale, 2); n++;
  }
  const pa = a.metrics.f_pe, pb = b.metrics.f_pe;
  if (isNum(pa) && isNum(pb) && pa > 0 && pb > 0) { sum += Math.pow((Math.log(pa) - Math.log(pb)) / 1.0, 2); n++; }
  if (!n) return null;
  return Math.sqrt(sum / n);
}

function buildNextDiscovery(universe, stock, anzahl) {
  const n = anzahl || 8;
  const pool = universe.stocks.filter((o) => o.symbol !== stock.symbol && o.discoveryEligible !== false);
  const mini = (o) => Contract.toMiniCard(o);
  const sektor = stock.sectorStatus === "CURATED" && stock.sector ? stock.sector : null;
  const out = { basis: [] };

  /* Aehnliche Aktien: kleinster Abstand, Sektor zuerst. */
  const mitAbstand = pool.map((o) => ({ o, d: similarityDistance(stock, o) })).filter((x) => x.d !== null);
  const sortiert = mitAbstand.sort((x, y) => (x.o.sector === sektor ? 0 : 1) - (y.o.sector === sektor ? 0 : 1) || x.d - y.d || (x.o.symbol < y.o.symbol ? -1 : 1));
  out.similar = { title: "Ähnliche Aktien", rule: "kleinster Abstand über Kursverhalten, Wachstum, Marge und Bewertung; gleicher Sektor zuerst",
                  cards: sortiert.slice(0, n).map((x) => mini(x.o)) };

  /* Gleicher Sektor: die staerksten Titel des Sektors. */
  if (sektor) {
    const gleich = pool.filter((o) => o.sector === sektor && isNum(o.metrics.leadershipScore))
      .sort((a, b) => b.metrics.leadershipScore - a.metrics.leadershipScore);
    if (gleich.length) out.sameSector = { title: "Mehr aus " + sektor, sector: sektor, rule: "staerkste Titel des Sektors nach Leadership Score", cards: gleich.slice(0, n).map(mini) };
  }

  /* Gleiches Thema: aus den redaktionellen Themenlisten. */
  const themen = ROWS.filter((r) => r.theme && Array.isArray(r.tickers) && r.tickers.indexOf(stock.symbol) !== -1);
  if (themen.length) {
    const th = themen[0];
    const mitglieder = pool.filter((o) => th.tickers.indexOf(o.symbol) !== -1);
    if (mitglieder.length) out.sameTheme = { title: "Gleiches Thema · " + th.title, rowId: th.id, rule: "redaktionelle Themenliste " + th.id, cards: mitglieder.slice(0, n).map(mini) };
  }

  /* Aehnliches Wachstum / aehnliche Qualitaet: nur mit Fundamentals. */
  const g = stock.metrics.f_revenueGrowth3y, m = stock.metrics.f_netMargin, pe = stock.metrics.f_pe;
  if (isNum(g)) {
    const nah = pool.filter((o) => isNum(o.metrics.f_revenueGrowth3y) && Math.abs(o.metrics.f_revenueGrowth3y - g) <= 0.05)
      .sort((a, b) => Math.abs(a.metrics.f_revenueGrowth3y - g) - Math.abs(b.metrics.f_revenueGrowth3y - g) || (a.symbol < b.symbol ? -1 : 1));
    if (nah.length) out.similarGrowth = { title: "Ähnliches Umsatzwachstum", rule: "Umsatz-CAGR 3J innerhalb von ±5 Prozentpunkten", cards: nah.slice(0, n).map(mini) };
  }
  if (isNum(m)) {
    const nah = pool.filter((o) => isNum(o.metrics.f_netMargin) && Math.abs(o.metrics.f_netMargin - m) <= 0.03 && (!sektor || o.sector === sektor))
      .sort((a, b) => Math.abs(a.metrics.f_netMargin - m) - Math.abs(b.metrics.f_netMargin - m) || (a.symbol < b.symbol ? -1 : 1));
    if (nah.length >= 3) out.similarQuality = { title: "Ähnliche Profitabilität", rule: "Nettomarge innerhalb von ±3 Prozentpunkten" + (sektor ? ", gleicher Sektor" : ""), cards: nah.slice(0, n).map(mini) };
  }
  if (isNum(pe) && pe > 0) {
    const guenstiger = pool.filter((o) => isNum(o.metrics.f_pe) && o.metrics.f_pe > 0 && o.metrics.f_pe < pe * 0.8 &&
                                          isNum(o.metrics.f_netMargin) && o.metrics.f_netMargin >= 0.05 && (!sektor || o.sector === sektor))
      .sort((a, b) => a.metrics.f_pe - b.metrics.f_pe || (a.symbol < b.symbol ? -1 : 1));
    if (guenstiger.length >= 3) out.cheaperAlternatives = { title: "Günstiger bewertete Alternativen", rule: "KGV unter 80 % des eigenen, Nettomarge ≥ 5 %" + (sektor ? ", gleicher Sektor" : ""), cards: guenstiger.slice(0, n).map(mini) };
  }
  out.basis = Object.keys(out).filter((k) => k !== "basis");
  return out;
}

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
    if (s.recognitionTier === 1) rang += 10;   // ein Name, den man kennt (V3)
    else if (s.recognitionTier === 2) rang += 5;
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

/* ============================================================ Startseite

   WAS EINE SURFACE IST

   Die Startseite besteht nicht mehr aus Reihen, die alle gleich aussehen,
   sondern aus Surfaces verschiedener Art: die nummerierte Rangliste, die
   breite Reihe, die kompakte, die Themenwelt, die eine grosse Karte, die
   Sektorkacheln, der Einstieg in den Einzelmodus. Jede Surface zeigt eine
   AUSWAHL aus einer gerechneten Reihe - nie etwas, das nicht in einer
   Reihe steht.

   ZWEI SCHICHTEN UEBER DER RANGLISTE

   1. Discovery-Reihenfolge (relevance.js): innerhalb der qualifizierten
      Titel einer Reihe ruecken bekannte Namen nach vorn - im oberen
      Fenster, mit kleinem Bonus. Die Rangliste selbst bleibt, wie sie
      ist; die Kategorieseite zeigt sie unveraendert.
   2. Diversity ueber die Seite: ein Titel fuehrt hoechstens eine Surface
      an, erscheint hoechstens zweimal. Entfernt wird nur, umsortiert nie.

   Beides ist deterministisch und wird in verify-discover-data.mjs
   nachgeprueft: jede Karte einer Surface muss in ihrer Reihe stehen. */
function buildHome(universe, rowsById, sectorPayload, featured) {
  const plan = (METHODOLOGY.home && METHODOLOGY.home.surfaces) || [];
  const U = universe.universeId;
  const heroSymbols = new Set(featured.map((f) => f.symbol));
  const surfaces = [];
  const sektorWelten = (METHODOLOGY.visualLanguage && METHODOLOGY.visualLanguage.sectorWorlds) || {};

  for (const step of plan) {
    if (step.type === "hero") {
      /* Die Eingangsflaeche zaehlt als Auftritte, damit die Reihen darunter
         nicht mit demselben Titel beginnen. */
      surfaces.push({ type: "hero", id: "hero", pure: true, show: featured.length,
                      cards: featured, title: null });
      continue;
    }
    if (step.type === "story") {
      /* DIE ENTWICKLUNG: ein Unternehmen, dessen Zahlen eine Geschichte
         erzaehlen - aus einer fundamentalen Reihe, bekannter Name zuerst,
         mindestens zwei belegte Saetze. Ohne Kandidaten keine Flaeche. */
      const quellen = (step.rowIds || ["langfristige-compounder", "umsatz-waechst-stark", "gewinne-beschleunigen"]);
      const kandidaten = [];
      for (const rid of quellen) {
        const row = rowsById.get(rid);
        if (!row || !row.cards) continue;
        const liste = row.cards.map((c) => universe.stocks.find((s) => s.symbol === c.symbol)).filter((s) => s && s.fundamentalModel);
        liste.sort((a, b) => ((a.recognitionTier || 3) - (b.recognitionTier || 3)) || (a.symbol < b.symbol ? -1 : 1));
        for (const s of liste) {
          if (kandidaten.some((k) => k.stock.symbol === s.symbol)) continue;
          const st = Fundamentals.story(s.fundamentalModel);
          if (st.available && st.statements.length >= 2) kandidaten.push({ stock: s, story: st, rowId: rid, row });
        }
      }
      if (!kandidaten.length) continue;
      /* Wie die grosse Karte wird der Titel erst NACH der Diversity gewaehlt
         (siehe unten): der erste Kandidat, der weder die Eingangsflaeche traegt
         noch eine Reihe anfuehrt. */
      surfaces.push({ type: "story", id: "story", pure: true, show: 1, cards: [], quelle: kandidaten,
                      kicker: step.kicker || "DIE ENTWICKLUNG", title: step.title || "Was das Unternehmen gemacht hat",
                      world: "fundamentals" });
      continue;
    }
    if (step.type === "immersive") {
      surfaces.push({ type: "immersive", id: "immersive", pure: true, show: 0, cards: [],
                      title: step.title, lead: step.lead, href: "#/einzeln/" + U });
      continue;
    }
    if (step.type === "sectors") {
      surfaces.push({ type: "sectors", id: "sectors", rowId: "sector-leaders", pure: true, show: 0,
                      cards: [], title: METHODOLOGY.sectorRows.title,
                      subtitle: "Die stärksten Titel je Sektor.",
                      sectors: sectorPayload, href: "#/c/" + U + "/sector-leaders" });
      continue;
    }
    if (step.type === "sector-row") {
      const list = (universe.sectors.get(step.sector) || []).filter((s) => s.discoveryEligible !== false);
      if (list.length < 4) continue;
      const texte = Klartext.reihe(list, "sektor-" + step.sector);
      const cards = list.map((s, i) => Object.assign(Contract.toCard(s), {
        plain: texte[i], priceSeries: seriesRef(s.priceSeries, "6M", U, s.symbol, s.seriesPath)
      }));
      const ordered = Relevance.discoveryOrder(cards, { recognition: RECOGNITION }).cards;
      surfaces.push({ type: "row", variant: step.variant || "compact", id: "sektor-" + slug(step.sector),
                      rowId: "sector-leaders", sector: step.sector, title: step.title,
                      subtitle: "Die stärksten Titel des Sektors " + step.sector + ".",
                      world: sektorWelten[step.sector] || "sectors", microRange: "6M",
                      cards: ordered, show: step.show || 10, total: list.length,
                      href: "#/c/" + U + "/sector-leaders" });
      continue;
    }

    const row = rowsById.get(step.rowId);
    if (!row || !row.cards || !row.cards.length) continue;
    if (row.config && (row.config.theme || row.config.minMembers) && row.coverage.matched < (row.config.minMembers || 5)) continue;

    if (step.type === "featured-card") {
      /* Die eine grosse Karte wird erst NACH der Diversity gefuellt: sie
         soll einen Namen zeigen, der sonst nirgends vorn steht. Hier
         steht nur der Platzhalter mit der Reihe, aus der sie schoepft. */
      surfaces.push({ type: "featured-card", id: "featured", rowId: row.rowId, pure: true, show: 0,
                      kicker: step.kicker || "IM BLICK", title: row.title, world: row.world,
                      microRange: row.microRange, cards: [], href: null,
                      quelle: Relevance.discoveryOrder(row.cards, { recognition: RECOGNITION }).cards });
      continue;
    }

    const pure = step.type === "ranking";
    const ordered = pure ? row.cards
      : Relevance.discoveryOrder(row.cards, { recognition: RECOGNITION }).cards;
    surfaces.push({
      type: step.type, variant: step.variant || null, id: step.id || row.rowId, rowId: row.rowId,
      title: step.title || row.title, subtitle: row.subtitle, world: row.world, microRange: row.microRange,
      theme: row.theme || null, editorial: row.editorial === true, rule: row.rule || null,
      cards: ordered, show: step.show || 10, pure, total: row.coverage.matched,
      href: "#/c/" + U + "/" + row.rowId
    });
  }

  const diversified = Relevance.diversify(surfaces, {
    leadPositions: 2, maxAppearances: 2, shortList: 6, exceptionalPercentile: 99
  });
  /* Jetzt die grosse Karte: der erste Name aus ihrer Reihe, der weder
     die Eingangsflaeche traegt noch irgendwo anfuehrt noch schon zweimal
     zu sehen ist - und der eine Taetigkeit hat, die auf die Karte kann.
     Keine Geschichte, die nicht auf der Karte steht. */
  const fuehrt = new Set(), gesehen = Object.create(null);
  diversified.forEach((v) => (v.cards || []).forEach((c, i) => {
    gesehen[c.symbol] = (gesehen[c.symbol] || 0) + 1;
    if (i < 2 && v.type !== "hero") fuehrt.add(c.symbol);
  }));
  diversified.forEach((v) => {
    if (v.type === "story") {
      const frei = (k) => !heroSymbols.has(k.stock.symbol) && !fuehrt.has(k.stock.symbol) && (gesehen[k.stock.symbol] || 0) < 2;
      const wahl = v.quelle.find(frei) || v.quelle[0];
      delete v.quelle;
      const s = wahl.stock;
      const cmp = Fundamentals.compare(s.fundamentalModel);
      v.cards = [Object.assign(Contract.toCard(s), { priceSeries: seriesRef(s.priceSeries, "1J", U, s.symbol, s.seriesPath),
                                                     plain: Klartext.karte(s, { rowId: wahl.rowId }) })];
      v.rowId = wahl.rowId;
      v.story = { statements: wahl.story.statements.slice(0, 3).map((x) => ({ id: x.id, text: x.text, evidence: x.evidence })),
                  horizon: wahl.story.horizon, asOf: wahl.story.asOf, source: wahl.story.source };
      v.compare = cmp.available ? { horizon: cmp.horizon, rows: cmp.rows.filter((r) => ["revenue", "net_income", "operating_margin", "free_cash_flow"].includes(r.id)).slice(0, 4) } : null;
      v.href = "#/s/" + U + "/" + s.symbol;
      v.sourceRow = { rowId: wahl.rowId, title: wahl.row.title };
      return;
    }
    if (v.type !== "featured-card") return;
    const frei = (c) => !heroSymbols.has(c.symbol) && !fuehrt.has(c.symbol) && (gesehen[c.symbol] || 0) < 2;
    const wahl = v.quelle.find((c) => frei(c) && c.was) || v.quelle.find(frei);
    delete v.quelle;
    if (!wahl) { v.cards = []; return; }
    v.cards = [wahl];
    v.id = "featured-" + wahl.symbol;
    v.href = "#/s/" + U + "/" + wahl.symbol;
  });
  const behalten = diversified.filter((s) =>
    s.type === "hero" || s.type === "immersive" || s.type === "sectors" ||
    (s.type === "featured-card" && s.cards.length === 1) || (s.type === "story" && s.cards.length === 1) ||
    s.cards.length >= 3);
  /* Die Karten der Startseite tragen keine `config`-Objekte und keine
     Hilfsfelder; was bleibt, ist genau das, was die Oberflaeche liest. */
  const hidden = diversified.reduce((n, s) => n + (s.hidden || 0), 0);
  behalten.forEach((s) => { delete s.pure; delete s.hidden; });
  return { surfaces: behalten, coverage: { planned: plan.length, shown: behalten.length, hidden } };
}
function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

/* Die kompakten Consumer-Bundles der SEC-Pipeline (scripts/quant/sec/consumer.py):
   je Ticker ein Lesemodell der Fundamentals-Engine. Fehlt das Verzeichnis,
   fehlen die Fundamentals - die Seite sagt es, statt zu schaetzen. */
function consumerFundamentalsIndex() {
  const dir = join(root, "quant", "data", "sec", "consumer");
  const map = new Map();
  const indexFile = join(dir, "index.json");
  if (!existsSync(indexFile)) return map;
  const index = readJSON(indexFile);
  const cache = new Map();
  for (const [ticker, entry] of Object.entries(index.byTicker || {})) {
    const file = join(root, "quant", "data", "sec", entry.file);
    if (!existsSync(file)) continue;
    let model = cache.get(file);
    if (model === undefined) {
      try { model = Fundamentals.fromBundle(readJSON(file)); } catch (err) { model = null; }
      cache.set(file, model);
    }
    if (model) map.set(ticker, model);
  }
  return map;
}

function geschaeftszahlen(stock, secFakten, modellzeilen, fundamentalsByTicker) {
  if (stock.dataMode === "mock") {
    return Unternehmen.ausModellzeile(modellzeilen.get(stock.symbol) || null);
  }
  const model = fundamentalsByTicker && fundamentalsByTicker.get(stock.symbol);
  if (model) {
    return Unternehmen.ausConsumerBundle(model, {
      preis: Contract.valueOf(stock.price), preisStatus: Contract.statusOf(stock.price)
    });
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

  /* Kompakte Reihe (ein Jahr Tagesschluss) fuer Titel ohne Technical-
     Bundle: die Aktienseite zeichnet daraus 1M bis 1J - 5J und Max bleiben
     ehrlich gesperrt, weil die Reihe sie nicht traegt. */
  if (!series.available && stock.priceSeries && stock.priceSeries.status === "CALCULATED" &&
      Array.isArray(stock.priceSeries.points)) {
    series = { available: true, source: "discover-series",
               path: stock.seriesPath || ("/discover/data/series/" + universe.universeId + "/" + stock.symbol + ".json"),
               priceSeriesType: stock.priceSeries.priceSeriesType || "SPLIT_ADJUSTED",
               dataMode: stock.dataMode, bars: stock.priceSeries.points.length,
               from: stock.priceSeries.from, reason: null, message: null };
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
    legalName: stock.legalName || null,
    nameSource: stock.nameSource || null,
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    dataMode: stock.dataMode, provider: stock.provider, exchange: stock.exchange,
    sector: stock.sector, sectorStatus: stock.sectorStatus, industry: stock.industry,
    marketCap: stock.marketCap, capBucket: stock.capBucket,
    price: stock.price, changePercent: stock.changePercent,
    sparkline: stock.sparkline, sparklineStatus: stock.sparklineStatus,
    performancePath: stock.performancePath, performancePathStatus: stock.performancePathStatus,
    priceSeries: seriesRef(stock.priceSeries, "1J", universe.universeId, stock.symbol, stock.seriesPath),
    was: stock.was || null, recognitionTier: stock.recognitionTier || null,
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
    discoverNext: buildNextDiscovery(universe, stock, 8),
    series,
    technicalIntelligence: TI.fromBundle(bundle, { seriesAvailable: series.available }),
    fundamentals: fundamentalsDetail(universe, stock),
    /* Der belegte Satz aus den Abschluessen - auf der Karte, im Hero der
       Startseite und im Kopf der Aktienseite derselbe. */
    hook: stock.hook || null,
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
const FUNDAMENTALS = consumerFundamentalsIndex();
console.log(`     Fundamentals (SEC Consumer): ${FUNDAMENTALS.size} Titel`);
const goldenBars = loadGoldenPreviewBars();
const compact = discoverSeriesIndex();
const real = applyValuationContext(applyPercentilesAndSignals(buildRealUniverse(nameMap, goldenBars, compact)));
console.log(`     ${real.stocks.length} Titel, Stand ${real.asOf}, ` +
            `${real.stocks.filter((s) => s.hasPriceSeries).length} mit freigegebener Kursreihe ` +
            `(${goldenBars.size} volle Historie, ${compact.size} kompakt)`);

console.log("2/5  Modelluniversum (synthetisch) …");
const model = applyPercentilesAndSignals(buildModelUniverse());
console.log(`     ${model.stocks.length} Titel, Stand ${model.asOf}`);

const instruments = technicalInstrumentIndex();
const universes = [real, model];
const rowIndex = [];
const homeIndex = [];
const homeSymbols = new Map();

console.log("3/5  Zeilen-Payloads …");
for (const universe of universes) {
  const rows = [];
  const rowsById = new Map();
  for (const config of ROWS) {
    const row = buildRow(universe, config);
    write(`rows/${universe.universeId}/${config.id}.json`, row);
    rowsById.set(config.id, Object.assign({}, row, { config }));
    rows.push({ rowId: row.rowId, title: row.title, subtitle: row.subtitle,
                returned: row.coverage.returned, matched: row.coverage.matched,
                theme: config.theme || null });
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

  /* Die Startseite (V3): eine Folge von Surfaces, gerechnet und in
     Stuecken ausgeliefert. Das erste Stueck traegt, was ueber der Falz
     steht; die weiteren laedt die Seite nach, sobald man dorthin
     scrollt. */
  const home = buildHome(universe, rowsById, sectorPayload, featured);
  const chunkSizes = (METHODOLOGY.home && METHODOLOGY.home.chunkSizes) || [6, 7];
  /* Ein Stueck ist durch Anzahl UND Groesse begrenzt: das erste muss klein
     bleiben, auch wenn ein Universum (das Modelluniversum traegt seine
     Reihen in den Karten) mehr Bytes je Flaeche hat. Ab drei Flaechen darf
     ein Stueck enden, wenn die naechste Flaeche die Grenze sprengen wuerde. */
  const chunkMaxBytes = (METHODOLOGY.home && METHODOLOGY.home.chunkMaxBytes) || 300 * 1024;
  const stuecke = [];
  let rest = home.surfaces.slice();
  for (let i = 0; rest.length; i++) {
    const n = i < chunkSizes.length ? chunkSizes[i] : rest.length;
    const teil = [];
    let bytes = 0;
    while (rest.length && teil.length < n) {
      const next = Buffer.byteLength(JSON.stringify(rest[0]));
      if (teil.length >= 3 && i < chunkSizes.length && bytes + next > chunkMaxBytes) break;
      teil.push(rest.shift());
      bytes += next;
    }
    stuecke.push(teil);
  }
  const chunkNames = stuecke.map((_, i) => `home/${universe.universeId}${i ? "." + (i + 1) : ""}.json`);
  stuecke.forEach((teil, i) => {
    write(chunkNames[i], {
      universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
      asOf: universe.asOf, generatedAt: universe.generatedAt,
      methodologyVersion: METHODOLOGY.methodologyVersion,
      chunk: i + 1, chunks: stuecke.length,
      next: i + 1 < stuecke.length ? "/discover/data/" + chunkNames[i + 1] : null,
      surfaces: teil,
      coverage: i === 0 ? home.coverage : undefined
    });
  });
  homeIndex.push({ universeId: universe.universeId, chunks: chunkNames.map((n) => "/discover/data/" + n),
                   surfaces: home.surfaces.length, hidden: home.coverage.hidden });
  /* Jede Karte der Startseite braucht eine Detailseite - auch im
     Modelluniversum, wo nicht jeder Titel eine bekommt. */
  homeSymbols.set(universe.universeId,
    new Set(home.surfaces.flatMap((s) => (s.cards || []).map((c) => c.symbol))));
  write(`featured/${universe.universeId}.json`, {
    universeId: universe.universeId, universeLabel: universe.label,
    universeKind: universe.kind, asOf: universe.asOf, generatedAt: universe.generatedAt,
    methodologyVersion: METHODOLOGY.methodologyVersion,
    selection: "Signal (Jahreshoch, Führerschaft oder bestätigter Ausbruch), dann " +
               "Leadership-Perzentil, dann Darstellbarkeit. Höchstens zwei je Sektor.",
    count: featured.length, stocks: featured
  });

  rowIndex.push({ universeId: universe.universeId, rows });

  /* Der Live-Umfang: welche Titel stehen auf einer Discover-Flaeche
     (Startseite, Reihen, Sektorkacheln, Eingangsflaeche)? Genau fuer die
     holt der Intraday-Ingest (scripts/market/ingest-intraday.mjs
     --scope=discover) waehrend der Sitzung Snapshots. Der Rest des
     Universums bekommt seinen Tagesverlauf nach Handelsschluss. */
  if (universe.kind === "real") {
    const live = new Set();
    for (const [, row] of rowsById) (row.cards || []).forEach((c) => live.add(c.symbol));
    sectorPayload.forEach((sp) => sp.cards.forEach((c) => live.add(c.symbol)));
    featured.forEach((f) => live.add(f.symbol));
    (homeSymbols.get(universe.universeId) || new Set()).forEach((sym) => live.add(sym));
    write(`live-scope/${universe.universeId}.json`, {
      universeId: universe.universeId, generatedAt: universe.generatedAt, asOf: universe.asOf,
      count: live.size, symbols: [...live].sort(),
      note: "Titel auf Discover-Flaechen. Umfang des Intraday-Ingests waehrend der Sitzung; " +
            "gelesen von scripts/market/ingest-intraday.mjs --scope=discover."
    });
    console.log(`     ${universe.universeId.padEnd(9)} Live-Umfang: ${live.size} Titel`);
  }

  /* Suchindex: klein genug fuer einen einzigen Abruf. */
  write(`search/${universe.universeId}.json`, {
    universeId: universe.universeId, universeLabel: universe.label, universeKind: universe.kind,
    asOf: universe.asOf, count: universe.stocks.length,
    entries: universe.stocks.map((s) => ({
      s: s.symbol, n: s.companyName, sec: s.sector, m: s.dataMode === "real" ? 1 : 0,
      a: s.was || null,
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

console.log("4/6  Kursreihen (Series-Store) …");
for (const universe of universes) {
  let n = 0;
  for (const stock of universe.stocks) {
    const ps = stock.priceSeries;
    if (!ps || ps.status !== "CALCULATED" || !Array.isArray(ps.points)) continue;
    /* Kanonische Reihe vorhanden: kein Duplikat im Series-Store. */
    if (stock.seriesPath) continue;
    write(`series/${universe.universeId}/${stock.symbol}.json`, {
      contractVersion: Contract.CONTRACT_VERSION,
      symbol: stock.symbol, instrumentId: stock.symbol, universeId: universe.universeId,
      dataMode: stock.dataMode,
      status: ps.status, source: ps.source, priceSeriesType: ps.priceSeriesType,
      grain: "daily", range: "1J", from: ps.from, to: ps.to, asOf: ps.asOf,
      points: ps.points, message: null
    });
    n++;
  }
  console.log(`     ${universe.universeId.padEnd(9)} ${n} Kursreihen`);
}

console.log("5/6  Detailseiten …");
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
    for (const config of ROWS) {
      const row = buildRow(universe, config);
      row.cards.forEach((c) => symbols.add(c.symbol));
    }
    for (const [, list] of universe.sectors) {
      list.slice(0, METHODOLOGY.sectorRows.limitPerSector).forEach((s) => symbols.add(s.symbol));
    }
    for (const id of instruments.keys()) {
      if (universe.stocks.some((s) => s.symbol === id)) symbols.add(id);
    }
    for (const sym of homeSymbols.get(universe.universeId) || []) symbols.add(sym);
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
    detail.geschaeftszahlen = geschaeftszahlen(stock, secFakten, modellzeilen, FUNDAMENTALS);
    write(`stocks/${universe.universeId}/${stock.symbol}.json`, detail);
    written++;
  }
  console.log(`     ${universe.universeId.padEnd(9)} ${written} Detailseiten`);
}

console.log("6/6  Meta …");
/* Die Live-Lage, wie der Client sie liest: Gate UND Grundlage. Auf GitHub
   Pages heisst "live" Snapshot-Refresh im Sitzungstakt; die Seite nennt
   den Stand mit Uhrzeit. Ein LIVE-Punkt ohne Strom gibt es nicht. */
function realtimeMeta() {
  const intraday = DisplayPolicy.check({ providerId: "tiingo", dataClass: "intraday", audience: "public",
                                         form: "raw", gates: GATES });
  const cfg = PREVIEW_CONFIG.intraday || {};
  const verfuegbar = intraday.allowed && GATES.ENABLE_PUBLIC_LIVE_MARKET_DATA === true && cfg.enabled !== false;
  return {
    available: verfuegbar,
    mode: verfuegbar ? "snapshot" : "eod",
    reason: verfuegbar ? null : (intraday.reason || "gateDisabled"),
    message: verfuegbar
      ? "Intraday-Snapshots (" + (cfg.interval || "5min") + ", Tiingo/IEX) werden waehrend der Sitzung alle " +
        (cfg.refreshMinutes || 10) + " Minuten erneuert. Die Seite nennt den Stand mit Uhrzeit; " +
        "ausserhalb der Sitzung bleibt die letzte abgeschlossene Sitzung sichtbar."
      : (intraday.message || "ENABLE_PUBLIC_LIVE_MARKET_DATA ist nicht gesetzt.") +
        " Discover zeigt den letzten ausgelieferten Stand und kennzeichnet ihn als solchen.",
    basis: intraday.basis || null, checkedAt: intraday.checkedAt || null,
    intraday: verfuegbar ? {
      index: "/quant/data/market/intraday/index.json",
      pathPattern: "/quant/data/market/intraday/<sessionDate>/<securityId>.json",
      interval: cfg.interval || "5min", refreshMinutes: cfg.refreshMinutes || 10,
      extendedHours: cfg.extendedHours !== false, provider: "tiingo", venue: "IEX",
      isLiveStream: false, isDelayed: true
    } : null,
    realtimeFields: ["price", "changePercent", "new52WeekHigh", "intradayBreakout"],
    derivedFields: ["leadershipScore", "momentumScore", "relativeStrengthScore",
                    "breakoutScore", "percentiles", "movingAverages"]
  };
}
const meta = {
  module: "discover",
  moduleVersion: "discover-3.0.0",
  contractVersion: Contract.CONTRACT_VERSION,
  methodologyVersion: METHODOLOGY.methodologyVersion,
  visualLanguage: METHODOLOGY.visualLanguage,
  topTen: METHODOLOGY.top10,
  engines: {
    high52w: High52w.ENGINE_VERSION, scoring: Scoring.ENGINE_VERSION,
    indicators: Indicators.ENGINE_VERSION, technicalIntelligence: TI.ENGINE_VERSION,
    relevance: Relevance.ENGINE_VERSION, klartext: Klartext.ENGINE_VERSION || null,
    factors: Factors.VERSION
  },
  home: homeIndex,
  editorial: {
    recognition: { entries: Object.keys(RECOGNITION).length, source: "discover/config/company-recognition.json" },
    themes: (THEMES.themes || []).map((t) => ({ id: t.id, title: t.title, members: t.tickers.length })),
    note: "Bekanntheit und Themen sind redaktionelle Zuordnungen. Sie entscheiden nie, ob ein Titel " +
          "in einer Reihe steht - nur, wie weit vorn er innerhalb der qualifizierten Titel gezeigt wird."
  },
  generatedAt: new Date().toISOString(),
  gates: GATES,
  gateReasons: Object.keys(GATES).reduce((acc, name) => {
    acc[name] = DisplayPolicy.gateReason(GATES_CONFIG, name);
    return acc;
  }, {}),
  realtime: realtimeMeta(),
  universeSource: real.universeSource,
  universes: universes.map((u) => ({
    universeId: u.universeId, label: u.label, kind: u.kind, provider: u.provider,
    benchmark: u.benchmark, asOf: u.asOf, generatedAt: u.generatedAt,
    engine: u.engine, sourceFile: u.sourceFile,
    securities: u.stocks.length,
    withPriceSeries: u.stocks.filter((s) => s.hasPriceSeries).length,
    withCompanyName: u.stocks.filter((s) => s.companyName).length,
    consumerPolicy: u.consumerPolicy || null,
    curatedSectors: u.sectors.size,
    notTradingExcluded: u.stocks.filter((s) => s.discoveryEligible === false)
      .map((s) => ({ symbol: s.symbol, reason: s.ineligibleReason })),
    detailPages: detailSets.get(u.universeId).size,
    factorCoverage: u.factorCoverage || null,
    fundamentalsCoverage: u.fundamentalsCoverage || null,
    valuationContext: u.valuationContext || null,
    universeSource: u.universeSource ? { source: u.universeSource.source, file: u.universeSource.file,
                                         version: u.universeSource.version, counts: u.universeSource.counts,
                                         handover: u.universeSource.handover } : null,
    redistribution: u.redistribution || null,
    note: METHODOLOGY.universes[u.universeId].note,
    rankingScope: METHODOLOGY.universes[u.universeId].rankingScope
  })),
  rows: rowIndex,
  rowConfigs: ROWS.map((r) => ({ id: r.id, title: r.title, theme: r.theme || null,
                                 microRange: r.microRange || "6M", rule: r.rule || null })),
  sources: [
    real.sourceFile,
    real.universeSource.file,
    "quant/data/market/discover-series/*.json",
    "quant/data/market/intraday/index.json",
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
