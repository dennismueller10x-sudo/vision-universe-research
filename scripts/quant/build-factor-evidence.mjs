#!/usr/bin/env node
/* =========================================================================
   Materialize the broad Factor Evidence product artifact.

   Reads only artifacts that already exist:
     quant/data/market/factors/factors-FULL_UNIVERSE.json   price factors
     quant/data/sec/consumer/CIK*.json                      PIT fundamentals
     quant/data/product/technical-signals-v1/<shard>.json.gz last close
     quant/data/product/sic-peer-taxonomy-v1.json           peer groups
     quant/methodology/quant-v2.json                        the contract

   Writes quant/data/product/factor-evidence-v1/. No provider is called,
   no history is fetched, no second pipeline is created.

   The contract decides what is publishable. Where an input the contract
   demands is not materialized anywhere, the component is UNAVAILABLE with
   a typed reason and the factor falls closed. Nothing is substituted.
   ========================================================================= */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FactorEvidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const ChangeEngine = require(join(ROOT, "quant/engines/change-engine.js"));

const OUT_DIR = join(ROOT, "quant/data/product/factor-evidence-v1");
const CONSUMER_DIR = join(ROOT, "quant/data/sec/consumer");
const TECHNICAL_DIR = join(ROOT, "quant/data/product/technical-signals-v1");

const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 6) => (finite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

/* ---------------------------------------------------------------------------
   Component contracts.

   Every entry names the quant-v2.0.0 component it implements, the weight the
   contract assigns it, and how it is derived here. `unavailable` marks a
   component whose input the contract demands but which no existing artifact
   materializes; naming it explicitly is what turns a silent gap into a gate.
   --------------------------------------------------------------------------- */
const PRICE_COMPONENTS = {
  momentum: [
    { id: "totalReturn12m1m", weight: 0.30, direction: "higher", label: "Kursentwicklung 12 Monate ohne letzten Monat", unit: "ratio", read: (v) => v.return12M1M },
    { id: "totalReturn6m", weight: 0.20, direction: "higher", label: "Kursentwicklung 6 Monate", unit: "ratio", read: (v) => v.returns?.["6M"] },
    { id: "totalReturn3m", weight: 0.10, direction: "higher", label: "Kursentwicklung 3 Monate", unit: "ratio", read: (v) => v.returns?.["3M"] },
    { id: "relativeStrength12m1m", weight: 0.20, direction: "higher", label: "Vorsprung gegenüber dem Markt, 12 Monate ohne letzten Monat", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED",
      note: "Das Kursfaktor-Artefakt führt die relative Stärke über volle 12 Monate, nicht über das 12-1-Fenster der Methodik. Ein Fenstertausch wäre eine stille Ersetzung." },
    { id: "distanceTo52wHigh", weight: 0.10, direction: "lower", label: "Abstand zum 52-Wochen-Hoch", unit: "ratio", read: (v) => (finite(v.distanceTo52wHigh) ? -v.distanceTo52wHigh : null) },
    { id: "distanceToSma200", weight: 0.10, direction: "higher", label: "Abstand zur 200-Tage-Linie", unit: "ratio", read: (v) => v.distanceToSMA200 }
  ],
  risk: [
    { id: "realizedVolatility252d", weight: 0.35, direction: "lower", label: "Schwankungsbreite 1 Jahr", unit: "ratio", read: (v) => v.volatility252d },
    { id: "downsideVolatility252d", weight: 0.25, direction: "lower", label: "Schwankungsbreite der Verlusttage", unit: "ratio", read: (v) => v.downsideVolatility252d,
      basis: "SPLIT_ADJUSTED",
      note: "Aus der veröffentlichten 270-Tage-Kursreihe berechnet: annualisierte Halbabweichung der negativen Tages-Logrenditen über 252 Sitzungen. Kursbasis splitbereinigt und hier ausdrücklich so ausgewiesen; sie wird nicht als Gesamtrendite ausgegeben." },
    { id: "maxDrawdown252d", weight: 0.25, direction: "lower", label: "Größter Rückgang im Jahr", unit: "ratio", read: (v) => (finite(v.maxDrawdown252d) ? Math.abs(v.maxDrawdown252d) : null) },
    { id: "beta252d", weight: 0.15, direction: "lower", label: "Marktsensitivität (Beta)", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Beta gegen den zertifizierten Vergleichsindex wird von market-factors-1.0.0 nicht berechnet." }
  ]
};

const FUNDAMENTAL_COMPONENTS = {
  quality: [
    { id: "accrualRatio", weight: 0.25, direction: "lower", label: "Abstand zwischen Gewinn und Zahlungsfluss", unit: "ratio" },
    { id: "netDebtToAssets", weight: 0.20, direction: "lower", label: "Nettoverschuldung zu Bilanzsumme", unit: "ratio" },
    { id: "equityToAssets", weight: 0.15, direction: "higher", label: "Eigenkapitalquote", unit: "ratio" },
    { id: "positiveFcfYears", weight: 0.20, direction: "higher", label: "Jahre mit positivem freien Zahlungsfluss", unit: "count", noWinsor: true },
    { id: "operatingMarginStability", weight: 0.20, direction: "lower", label: "Schwankung der operativen Marge", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Das operative Ergebnis ist in der bestehenden SEC-Normalisierung (mapping 1.5.0) nicht enthalten." }
  ],
  growth: [
    { id: "revenueCagr3y", weight: 0.30, direction: "higher", label: "Umsatzwachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "epsCagr3y", weight: 0.20, direction: "higher", label: "Gewinn je Aktie, Wachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "fcfCagr3y", weight: 0.15, direction: "higher", label: "Freier Zahlungsfluss, Wachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "revenueGrowthTtmYoy", weight: 0.15, direction: "higher", label: "Umsatzwachstum der letzten 12 Monate", unit: "ratio" },
    { id: "operatingMarginExpansion3y", weight: 0.10, direction: "higher", label: "Ausweitung der operativen Marge, 3 Jahre", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Das operative Ergebnis ist in der bestehenden SEC-Normalisierung (mapping 1.5.0) nicht enthalten." },
    { id: "revenueGrowthAcceleration", weight: 0.10, direction: "higher", label: "Veränderung des Umsatztempos", unit: "ratio" }
  ],
  value: [
    { id: "fcfYield", weight: 0.30, direction: "higher", label: "Freier Zahlungsfluss je Börsenwert", unit: "ratio" },
    { id: "earningsYield", weight: 0.25, direction: "higher", label: "Gewinn je Börsenwert", unit: "ratio" },
    { id: "ebitdaYield", weight: 0.20, direction: "higher", label: "Operatives Ergebnis vor Abschreibungen je Unternehmenswert", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "EBITDA ist in der bestehenden SEC-Normalisierung (mapping 1.5.0) nicht enthalten." },
    { id: "salesYield", weight: 0.10, direction: "higher", label: "Umsatz je Unternehmenswert", unit: "ratio" },
    { id: "bookToMarket", weight: 0.15, direction: "higher", label: "Eigenkapital je Börsenwert", unit: "ratio" }
  ],
  profitability: [
    { id: "roicTtm", weight: 0.25, direction: "higher", label: "Rendite auf das eingesetzte Kapital", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Ohne operatives Ergebnis lässt sich der kanonische ROIC nicht bilden." },
    { id: "roicMedian3y", weight: 0.15, direction: "higher", label: "Rendite auf das eingesetzte Kapital, Median 3 Jahre", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Ohne operatives Ergebnis lässt sich der kanonische ROIC nicht bilden." },
    { id: "grossProfitabilityTtm", weight: 0.20, direction: "higher", label: "Rohertrag je Bilanzsumme", unit: "ratio" },
    { id: "operatingMarginTtm", weight: 0.15, direction: "higher", label: "Operative Marge", unit: "ratio",
      unavailable: "INPUT_NOT_MATERIALIZED", note: "Das operative Ergebnis ist in der bestehenden SEC-Normalisierung (mapping 1.5.0) nicht enthalten." },
    { id: "fcfMarginTtm", weight: 0.15, direction: "higher", label: "Marge des freien Zahlungsflusses", unit: "ratio" },
    { id: "roaTtm", weight: 0.10, direction: "higher", label: "Rendite auf die Bilanzsumme", unit: "ratio" }
  ]
};

/* quant-v2.0.0: the generic Quality, Profitability and Value formulas are
   NOT_APPLICABLE for banks, insurers and REITs until separately versioned
   industry templates exist. SIC majors, not a guess. */
const isBank = (sic4) => sic4 >= 6020 && sic4 <= 6220;
const isInsurer = (sic4) => sic4 >= 6300 && sic4 <= 6411;
const isReit = (sic4) => sic4 === 6798;
const needsIndustryTemplate = (sic4) => finite(sic4) && (isBank(sic4) || isInsurer(sic4) || isReit(sic4));

/* ---------------------------------------------------------------------------
   PIT-safe reads over the consumer fundamentals contract.
   A value is only usable when its filing date is on or before the cutoff.
   --------------------------------------------------------------------------- */
const COL = { fy: 0, fp: 1, end: 2, v: 3, filed: 4 };

function annualSeries(doc, metric, cutoff) {
  const rows = doc?.annual?.[metric];
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row) && finite(row[COL.v]) && typeof row[COL.filed] === "string" && row[COL.filed] <= cutoff)
    .map((row) => ({ fy: row[COL.fy], end: row[COL.end], value: row[COL.v], filed: row[COL.filed] }))
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

function quarterSeries(doc, metric, cutoff) {
  const rows = doc?.quarterly?.[metric];
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row) && finite(row[COL.v]) && typeof row[COL.filed] === "string" && row[COL.filed] <= cutoff)
    .map((row) => ({ end: row[COL.end], value: row[COL.v], filed: row[COL.filed] }))
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

/* Newest filing date the consumer contract carries for a metric. Used to
   date a derived TTM value, which has no filing of its own: its earliest
   honest availability is the latest filing among its named inputs. */
function newestFiled(doc, metric) {
  const dates = [];
  for (const block of ["quarterly", "annual"]) {
    const rows = doc?.[block]?.[metric];
    if (Array.isArray(rows)) rows.forEach((row) => { if (typeof row[COL.filed] === "string") dates.push(row[COL.filed]); });
  }
  const direct = doc?.ttm?.[metric]?.filed;
  if (typeof direct === "string") dates.push(direct);
  return dates.length ? dates.sort().at(-1) : null;
}

function ttmValue(doc, metric, cutoff) {
  const entry = doc?.ttm?.[metric];
  if (!entry || !finite(entry.v)) return null;
  let filed = typeof entry.filed === "string" ? entry.filed : null;
  if (!filed && entry.derived && Array.isArray(entry.inputs)) {
    const inputDates = entry.inputs.map((input) => newestFiled(doc, input)).filter(Boolean);
    filed = inputDates.length === entry.inputs.length ? inputDates.sort().at(-1) : null;
  }
  if (!filed || filed > cutoff) return null;
  return { value: entry.v, end: entry.end, filed, derived: entry.derived === true };
}

/* A balance-sheet instant that predates the reporting period by more than a
   year is not a current figure. Combining it with a current TTM would read
   like one number when it is two, so it is dropped rather than mixed. */
const STALE_INSTANT_DAYS = 400;
function periodAligned(entry, referenceEnd) {
  if (!entry) return null;
  if (typeof entry.end !== "string" || typeof referenceEnd !== "string") return entry;
  const gap = (Date.parse(referenceEnd) - Date.parse(entry.end)) / 86400000;
  if (!Number.isFinite(gap)) return entry;
  return gap > STALE_INSTANT_DAYS ? null : entry;
}

function cagr(series, years) {
  if (series.length < years + 1) return null;
  const last = series[series.length - 1], first = series[series.length - 1 - years];
  if (!(first.value > 0) || !(last.value > 0)) return null; /* cross-zero CAGR is null, never zero */
  return (last.value / first.value) ** (1 / years) - 1;
}

function sumLast(series, count) {
  if (series.length < count) return null;
  return series.slice(-count).reduce((total, entry) => total + entry.value, 0);
}

function sumWindow(series, from, count) {
  if (series.length < from + count) return null;
  const end = series.length - from;
  return series.slice(end - count, end).reduce((total, entry) => total + entry.value, 0);
}

/* ---------------------------------------------------------------------------
   Raw fundamental component values and the change inputs, per issuer.
   --------------------------------------------------------------------------- */
function fundamentalRaws(doc, cutoff, marketCap) {
  const revenueA = annualSeries(doc, "revenue", cutoff),
    epsA = annualSeries(doc, "eps_diluted", cutoff),
    fcfA = annualSeries(doc, "free_cash_flow", cutoff),
    assetsA = annualSeries(doc, "total_assets", cutoff),
    equityA = annualSeries(doc, "stockholders_equity", cutoff),
    grossQ = quarterSeries(doc, "gross_profit", cutoff),
    revenueQ = quarterSeries(doc, "revenue", cutoff),
    fcfQ = quarterSeries(doc, "free_cash_flow", cutoff),
    revenueT = ttmValue(doc, "revenue", cutoff),
    netIncomeT = ttmValue(doc, "net_income", cutoff),
    ocfT = ttmValue(doc, "operating_cash_flow", cutoff),
    grossT = ttmValue(doc, "gross_profit", cutoff),
    fcfT = ttmValue(doc, "free_cash_flow", cutoff);

  /* Everything below is read against the period the TTM block reports. */
  const referenceEnd = revenueT?.end || assetsA.at(-1)?.end || null;
  const netDebtT = periodAligned(ttmValue(doc, "net_debt", cutoff), referenceEnd);

  const latestAssets = periodAligned(assetsA.at(-1), referenceEnd)?.value ?? null,
    priorAssets = assetsA.at(-2)?.value ?? null,
    averageAssets = finite(latestAssets) && finite(priorAssets) ? (latestAssets + priorAssets) / 2 : latestAssets,
    latestEquity = periodAligned(equityA.at(-1), referenceEnd)?.value ?? null;

  const raws = {};
  const filedDates = [];
  const note = (entry) => { if (entry?.filed) filedDates.push(entry.filed); };
  [revenueT, netIncomeT, ocfT, grossT, fcfT, netDebtT].forEach(note);
  [revenueA.at(-1), assetsA.at(-1), equityA.at(-1)].forEach((entry) => { if (entry?.filed) filedDates.push(entry.filed); });

  /* Quality */
  if (netIncomeT && ocfT && finite(averageAssets) && averageAssets > 0) {
    raws.accrualRatio = (netIncomeT.value - ocfT.value) / averageAssets;
  }
  if (netDebtT && finite(latestAssets) && latestAssets > 0) raws.netDebtToAssets = netDebtT.value / latestAssets;
  if (finite(latestEquity) && finite(latestAssets) && latestAssets > 0) raws.equityToAssets = latestEquity / latestAssets;
  if (fcfA.length >= 4) raws.positiveFcfYears = fcfA.slice(-5).filter((entry) => entry.value > 0).length;

  /* Growth */
  raws.revenueCagr3y = cagr(revenueA, 3);
  raws.epsCagr3y = cagr(epsA, 3);
  raws.fcfCagr3y = cagr(fcfA, 3);

  const currentTtmRevenue = sumWindow(revenueQ, 0, 4), priorTtmRevenue = sumWindow(revenueQ, 4, 4);
  if (finite(currentTtmRevenue) && finite(priorTtmRevenue) && priorTtmRevenue > 0) {
    raws.revenueGrowthTtmYoy = currentTtmRevenue / priorTtmRevenue - 1;
  }
  if (revenueA.length >= 3) {
    const [twoBack, oneBack, latest] = revenueA.slice(-3);
    if (oneBack.value > 0 && twoBack.value > 0) {
      const current = latest.value / oneBack.value - 1, prior = oneBack.value / twoBack.value - 1;
      raws.revenueGrowthAcceleration = current - prior;
      raws._revenueGrowthCurrent = current;
      raws._revenueGrowthPrior = prior;
    }
  }

  /* Value */
  if (finite(marketCap) && marketCap > 0) {
    if (fcfT) raws.fcfYield = fcfT.value / marketCap;
    if (netIncomeT) raws.earningsYield = netIncomeT.value / marketCap;
    if (finite(latestEquity)) raws.bookToMarket = latestEquity / marketCap;
    const enterpriseValue = netDebtT ? marketCap + netDebtT.value : null;
    if (revenueT && finite(enterpriseValue) && enterpriseValue > 0) raws.salesYield = revenueT.value / enterpriseValue;
  }

  /* Profitability */
  if (grossT && finite(averageAssets) && averageAssets > 0) raws.grossProfitabilityTtm = grossT.value / averageAssets;
  if (fcfT && revenueT && revenueT.value > 0) raws.fcfMarginTtm = fcfT.value / revenueT.value;
  if (netIncomeT && finite(averageAssets) && averageAssets > 0) raws.roaTtm = netIncomeT.value / averageAssets;

  /* Change inputs */
  const currentTtmGross = sumWindow(grossQ, 0, 4), priorTtmGross = sumWindow(grossQ, 4, 4),
    currentTtmFcf = sumWindow(fcfQ, 0, 4), priorTtmFcf = sumWindow(fcfQ, 4, 4);
  const change = {
    revenueGrowthAcceleration: raws.revenueGrowthAcceleration ?? null,
    revenueGrowthCurrent: raws._revenueGrowthCurrent ?? null,
    revenueGrowthPrior: raws._revenueGrowthPrior ?? null,
    grossMarginTtm: finite(currentTtmGross) && finite(currentTtmRevenue) && currentTtmRevenue > 0 ? currentTtmGross / currentTtmRevenue : null,
    grossMarginPriorTtm: finite(priorTtmGross) && finite(priorTtmRevenue) && priorTtmRevenue > 0 ? priorTtmGross / priorTtmRevenue : null,
    fcfMarginTtm: finite(currentTtmFcf) && finite(currentTtmRevenue) && currentTtmRevenue > 0 ? currentTtmFcf / currentTtmRevenue : null,
    fcfMarginPriorTtm: finite(priorTtmFcf) && finite(priorTtmRevenue) && priorTtmRevenue > 0 ? priorTtmFcf / priorTtmRevenue : null
  };

  delete raws._revenueGrowthCurrent;
  delete raws._revenueGrowthPrior;

  return {
    raws,
    change,
    shares: periodAligned(ttmValue(doc, "shares_outstanding", cutoff), referenceEnd),
    availableAt: filedDates.length ? filedDates.slice().sort().at(-1) : null,
    fundamentalsAsOf: revenueT?.end || revenueA.at(-1)?.end || null,
    annualYears: revenueA.length
  };
}

/* --------------------------------------------------------------------------- */
function main() {
  const started = Date.now();
  const contract = readJSON(join(ROOT, "quant/methodology/quant-v2.json"));
  const priceFactors = readJSON(join(ROOT, "quant/data/market/factors/factors-FULL_UNIVERSE.json"));
  const taxonomy = readJSON(join(ROOT, "quant/data/product/sic-peer-taxonomy-v1.json"));

  if (contract.methodologyVersion !== FactorEvidence.DERIVED_FROM) {
    throw new Error("factor contract drifted: expected " + FactorEvidence.DERIVED_FROM);
  }
  if (contract.publication.allowed !== false) {
    throw new Error("quant-v2 publication opened; this materializer must be revisited before it runs again");
  }

  const columns = Object.fromEntries(taxonomy.rowColumns.map((name, index) => [name, index]));
  const peerByTicker = new Map();
  for (const row of taxonomy.rows) {
    peerByTicker.set(row[columns.ticker], {
      securityId: row[columns.securityId],
      cik: row[columns.cik],
      sic4: Number.parseInt(row[columns.sic4], 10),
      division: row[columns.sicDivision],
      level: row[columns.peerLevel],
      confidence: row[columns.peerConfidence],
      penalty: row[columns.confidencePenaltyRequired] === true
    });
  }

  /* 1. Last close per ticker, from the published technical bundles. */
  const closeByTicker = new Map();
  for (const file of readdirSync(TECHNICAL_DIR)) {
    if (!file.endsWith(".json.gz") || file.startsWith("signals-")) continue;
    const bundle = JSON.parse(gunzipSync(readFileSync(join(TECHNICAL_DIR, file))));
    if (bundle.schemaVersion !== "technical-product-artifact-1.0.0") continue;
    for (const [ticker, instrument] of Object.entries(bundle.instruments || {})) {
      const closes = instrument?.bars?.close, stamps = instrument?.bars?.timestamps;
      if (!Array.isArray(closes) || !closes.length || !Array.isArray(stamps)) continue;
      const close = closes.at(-1);
      if (finite(close) && close > 0) {
        closeByTicker.set(ticker, {
          close, asOf: stamps.at(-1), basis: instrument.priceSeriesType,
          downsideVolatility252d: downsideVolatility(closes, 252)
        });
      }
    }
  }

  /* 2. Per-security raw values. Fundamentals are read once per issuer. */
  const cutoff = priceFactors.securities.reduce((latest, row) => (row.asOf > latest ? row.asOf : latest), priceFactors.securities[0].asOf);
  const docCache = new Map();
  const records = [];
  const gapCounts = new Map();
  const countGap = (key) => gapCounts.set(key, (gapCounts.get(key) || 0) + 1);

  for (const security of priceFactors.securities) {
    const ticker = security.ticker;
    const peer = peerByTicker.get(ticker) || null;
    const quote = closeByTicker.get(ticker) || null;
    /* The certified price factors plus the one value derived here from the
       published bar series. Derived values keep their own basis label. */
    const price = finite(quote?.downsideVolatility252d)
      ? { ...(security.values || {}), downsideVolatility252d: quote.downsideVolatility252d }
      : (security.values || {});
    const priceStatus = security.fieldStatus || {};

    let fundamentals = null;
    if (peer?.cik) {
      if (!docCache.has(peer.cik)) {
        const path = join(CONSUMER_DIR, "CIK" + peer.cik + ".json");
        docCache.set(peer.cik, existsSync(path) ? readJSON(path) : null);
      }
      const doc = docCache.get(peer.cik);
      if (doc) {
        const marketCapShares = null;
        fundamentals = fundamentalRaws(doc, cutoff, marketCapShares);
        const shares = fundamentals.shares;
        const marketCap = shares && quote ? shares.value * quote.close : null;
        /* Market capitalization needs both a PIT-safe share count and a
           published close; recompute the price-dependent block once it is
           known rather than guessing it above. */
        fundamentals = fundamentalRaws(doc, cutoff, marketCap);
        fundamentals.marketCap = finite(marketCap) ? marketCap : null;
        fundamentals.priceAsOf = quote?.asOf || null;
      } else countGap("FUNDAMENTALS_DOCUMENT_MISSING");
    } else countGap("IDENTITY_UNRESOLVED");

    records.push({ security, ticker, peer, price, priceStatus, fundamentals, quote });
  }

  /* 3. Cross-sectional normalization, per component, universe and peer. */
  const allComponents = [];
  for (const [factorId, list] of Object.entries(PRICE_COMPONENTS)) list.forEach((spec) => allComponents.push({ factorId, spec, source: "price" }));
  for (const [factorId, list] of Object.entries(FUNDAMENTAL_COMPONENTS)) list.forEach((spec) => allComponents.push({ factorId, spec, source: "fundamentals" }));

  const scores = new Map(); /* componentId -> array aligned with records */
  const peerSizes = new Map();

  for (const { factorId, spec, source } of allComponents) {
    const key = factorId + ":" + spec.id;
    if (spec.unavailable) { scores.set(key, records.map(() => null)); continue; }

    const raws = records.map((record) => {
      if (source === "price") {
        const value = spec.read(record.price);
        return finite(value) ? value : null;
      }
      if (!record.fundamentals) return null;
      if (needsIndustryTemplate(record.peer?.sic4) && factorId !== "growth") return null;
      const value = record.fundamentals.raws[spec.id];
      return finite(value) ? value : null;
    });

    /* Universe leg. */
    const bounds = spec.noWinsor ? null : FactorEvidence.winsorBounds(raws);
    const universeValues = raws.map((value) => (value === null ? null : FactorEvidence.clamp(value, bounds)));
    const validUniverse = universeValues.filter((value) => value !== null).length;
    const universePercentiles = validUniverse >= contract.normalization.peerFallback.at(-1).minimumValidIssuers
      ? FactorEvidence.midrankPercentiles(universeValues, spec.direction)
      : records.map(() => null);

    /* Peer legs. A level only counts when it reaches the contract minimum
       for this very metric, not for the population. */
    const groupsByLevel = { sic4_industry: new Map(), sic_division: new Map() };
    records.forEach((record, index) => {
      if (universeValues[index] === null || !record.peer) return;
      const industry = finite(record.peer.sic4) ? String(record.peer.sic4) : null;
      if (industry) {
        if (!groupsByLevel.sic4_industry.has(industry)) groupsByLevel.sic4_industry.set(industry, []);
        groupsByLevel.sic4_industry.get(industry).push(index);
      }
      if (record.peer.division) {
        if (!groupsByLevel.sic_division.has(record.peer.division)) groupsByLevel.sic_division.set(record.peer.division, []);
        groupsByLevel.sic_division.get(record.peer.division).push(index);
      }
    });

    const peerPercentiles = records.map(() => null);
    const peerLevels = records.map(() => "universe");
    const peerGroupSizes = records.map(() => validUniverse);

    for (const level of ["sic_division", "sic4_industry"]) {
      const minimum = contract.normalization.peerFallback.find((entry) => entry.level === (level === "sic4_industry" ? "industry" : "sector")).minimumValidIssuers;
      for (const [groupId, indices] of groupsByLevel[level]) {
        if (indices.length < minimum) continue;
        const groupValues = indices.map((index) => universeValues[index]);
        const groupBounds = spec.noWinsor ? null : FactorEvidence.winsorBounds(groupValues);
        const clamped = groupValues.map((value) => FactorEvidence.clamp(value, groupBounds));
        const percentiles = FactorEvidence.midrankPercentiles(clamped, spec.direction);
        indices.forEach((index, position) => {
          peerPercentiles[index] = percentiles[position];
          peerLevels[index] = level;
          peerGroupSizes[index] = indices.length;
        });
        peerSizes.set(level + ":" + groupId, indices.length);
      }
    }

    scores.set(key, records.map((_, index) => {
      if (universeValues[index] === null) return null;
      const blended = FactorEvidence.blend(peerPercentiles[index], universePercentiles[index], peerLevels[index]);
      if (!finite(blended)) return null;
      return {
        raw: raws[index],
        winsorized: universeValues[index],
        score: blended,
        peerPercentile: peerPercentiles[index],
        universePercentile: universePercentiles[index],
        peerLevel: peerLevels[index],
        peerSize: peerGroupSizes[index]
      };
    }));
  }

  /* 4. Assemble factors per security. */
  const out = new Map(); /* shard -> {ticker: record} */
  const componentSpecs = {};
  const factorStates = Object.fromEntries(FactorEvidence.FACTOR_ORDER.map((id) => [id, { AVAILABLE: 0, UNAVAILABLE: 0, NOT_APPLICABLE: 0 }]));
  const reasonCounts = {};
  const componentCoverage = {};

  records.forEach((record, index) => {
    const factors = {};

    for (const factorId of FactorEvidence.FACTOR_ORDER) {
      if (factorId === "revisions") {
        factors.revisions = {
          state: "UNAVAILABLE", reason: "BLOCKED_EXTERNAL", score: null, availableWeight: 0, confidence: null,
          components: [], peer: null,
          blocker: contract.factors.revisions.blocker
        };
        factorStates.revisions.UNAVAILABLE += 1;
        reasonCounts.BLOCKED_EXTERNAL = (reasonCounts.BLOCKED_EXTERNAL || 0) + 1;
        continue;
      }

      const specs = PRICE_COMPONENTS[factorId] || FUNDAMENTAL_COMPONENTS[factorId];
      const fundamentalFactor = Boolean(FUNDAMENTAL_COMPONENTS[factorId]);
      const templateBlocked = fundamentalFactor && factorId !== "growth" && needsIndustryTemplate(record.peer?.sic4);

      const components = specs.map((spec) => {
        const entry = spec.unavailable ? null : scores.get(factorId + ":" + spec.id)[index];
        const base = {
          id: spec.id, label: spec.label, weight: spec.weight, direction: spec.direction, unit: spec.unit,
          basis: spec.basis || null, note: spec.note || null,
          window: contract.factors[factorId].components.find((component) => component.id === spec.id)?.window || null,
          input: contract.factors[factorId].components.find((component) => component.id === spec.id)?.input || null
        };
        if (spec.unavailable) return { ...base, state: "UNAVAILABLE", reason: spec.unavailable, raw: null, score: null };
        if (!entry) {
          return { ...base, state: "UNAVAILABLE", reason: templateBlocked ? "SECTOR_TEMPLATE_MISSING" : fundamentalFactor && !record.fundamentals ? "FUNDAMENTALS_UNAVAILABLE" : "INPUT_NOT_MATERIALIZED", raw: null, score: null };
        }
        const countKey = factorId + ":" + spec.id;
        componentCoverage[countKey] = (componentCoverage[countKey] || 0) + 1;
        return {
          ...base, state: "AVAILABLE", reason: null,
          raw: round(entry.raw), score: round(entry.score, 2),
          peerPercentile: round(entry.peerPercentile, 2), universePercentile: round(entry.universePercentile, 2),
          peerLevel: entry.peerLevel, peerSize: entry.peerSize
        };
      });

      let assembled;
      if (templateBlocked) assembled = { state: "NOT_APPLICABLE", reason: "SECTOR_TEMPLATE_MISSING", score: null, availableWeight: 0 };
      else {
        assembled = FactorEvidence.assembleFactor(contract.factors[factorId], components);
        /* Mandatory components are a contract statement, checked after the
           arithmetic so that a satisfied weight can never overrule them. */
        if (assembled.state === "AVAILABLE") {
          const mandatoryMissing = mandatoryUnmet(factorId, components);
          if (mandatoryMissing) assembled = { state: "UNAVAILABLE", reason: "MANDATORY_COMPONENT_MISSING", score: null, availableWeight: assembled.availableWeight };
        }
      }

      const available = components.filter((component) => component.state === "AVAILABLE");
      const peerLevel = available.length ? mostCommon(available.map((component) => component.peerLevel)) : null;
      const confidenceValue = assembled.state === "AVAILABLE"
        ? FactorEvidence.confidence({
          coverage: (assembled.availableWeight / 1) * 100,
          freshness: freshnessScore(fundamentalFactor ? record.fundamentals?.availableAt : record.security.asOf, cutoff),
          peerQuality: peerLevel === "sic4_industry" ? 100 : peerLevel === "sic_division" ? 75 : 45,
          historyDepth: fundamentalFactor ? Math.min(100, ((record.fundamentals?.annualYears || 0) / 10) * 100) : Math.min(100, (record.security.bars / 1260) * 100),
          provenance: record.security.dataQuality === "PASS" ? 100 : 50
        })
        : null;

      /* Only measurements travel per security; the wording, weight, window
         and contract input of a component live once in the artifact head. */
      components.forEach((component) => {
        const key = factorId + ":" + component.id;
        if (!componentSpecs[key]) {
          componentSpecs[key] = {
            label: component.label, weight: component.weight, direction: component.direction,
            unit: component.unit, basis: component.basis, note: component.note,
            window: component.window, input: component.input
          };
        }
      });

      factors[factorId] = {
        state: assembled.state,
        reason: assembled.reason,
        score: assembled.state === "AVAILABLE" ? round(assembled.score, 2) : null,
        availableWeight: round(assembled.availableWeight, 4),
        confidence: confidenceValue,
        components: components.map((component) => (component.state === "AVAILABLE"
          ? { id: component.id, state: "AVAILABLE", raw: component.raw, score: component.score, peerPercentile: component.peerPercentile, universePercentile: component.universePercentile, peerLevel: component.peerLevel, peerSize: component.peerSize }
          : { id: component.id, state: "UNAVAILABLE", reason: component.reason })),
        peer: peerLevel ? { level: peerLevel, industry: record.peer?.sic4 ?? null, division: record.peer?.division ?? null, confidencePenalty: peerLevel === "universe" } : null
      };

      factorStates[factorId][assembled.state] += 1;
      if (assembled.reason) reasonCounts[assembled.reason] = (reasonCounts[assembled.reason] || 0) + 1;
    }

    const change = ChangeEngine.build({
      price: record.price, priceStatus: record.priceStatus,
      fundamentals: record.fundamentals?.change || null,
      asOf: record.security.asOf, basis: record.security.basis
    });

    const published = {
      ticker: record.ticker,
      securityId: record.security.securityId,
      cik: record.peer?.cik || null,
      asOf: record.security.asOf,
      dataCutoff: cutoff,
      priceBasis: record.security.basis,
      bars: record.security.bars,
      dataQuality: record.security.dataQuality,
      fundamentalsAsOf: record.fundamentals?.fundamentalsAsOf || null,
      fundamentalsAvailableAt: record.fundamentals?.availableAt || null,
      marketCap: record.fundamentals?.marketCap ?? null,
      peer: record.peer ? { level: record.peer.level, industry: record.peer.sic4, division: record.peer.division, confidence: record.peer.confidence } : null,
      factors,
      composite: { state: "WITHHELD", reason: "QUANT_V2_NOT_ACTIVE" },
      change: ChangeEngine.compact(change)
    };

    const violations = FactorEvidence.publicationViolations(published);
    if (violations.length) throw new Error("publication gate violated for " + record.ticker + ": " + violations.join("; "));

    const shard = (record.ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
    if (!out.has(shard)) out.set(shard, {});
    out.get(shard)[record.ticker] = published;
  });

  /* 5. Write. */
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const head = {
    schemaVersion: FactorEvidence.SHARD_SCHEMA,
    methodologyVersion: FactorEvidence.METHODOLOGY_VERSION,
    derivedFrom: FactorEvidence.DERIVED_FROM,
    changeMethodologyVersion: ChangeEngine.METHODOLOGY_VERSION,
    generatedAt,
    asOf: cutoff,
    publication: { compositeAllowed: false, rankingAllowed: false, reason: "QUANT_V2_NOT_ACTIVE", explanation: contract.publication.reason },
    factorOrder: contract.factorOrder,
    factorWeights: contract.factorWeights,
    componentSpecs
  };

  let written = 0;
  for (const [shard, securities] of [...out].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const payload = { ...head, shard, securities };
    writeFileSync(join(OUT_DIR, shard + ".json.gz"), gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
    written += Object.keys(securities).length;
  }

  const summary = {
    ...head,
    schemaVersion: FactorEvidence.SUMMARY_SCHEMA,
    scope: "CANONICAL_PRODUCT_UNIVERSE",
    source: {
      priceFactors: { engine: priceFactors.engine, generatedAt: priceFactors.generatedAt, securities: priceFactors.securities.length, benchmark: priceFactors.benchmark },
      fundamentals: { schema: "vu-consumer-fundamentals-1.0.0", issuersRead: [...docCache.values()].filter(Boolean).length },
      peerTaxonomy: { version: taxonomy.version, rows: taxonomy.rows.length, snapshotMode: taxonomy.snapshotMode },
      quotes: { source: "technical-product-artifact-1.0.0", tickers: closeByTicker.size }
    },
    counts: {
      productUniverse: priceFactors.coverage.requested,
      priceFactorSecurities: priceFactors.securities.length,
      published: written,
      withFundamentals: records.filter((record) => record.fundamentals).length,
      withMarketCap: records.filter((record) => finite(record.fundamentals?.marketCap)).length
    },
    factorStates,
    reasonCounts,
    componentCoverage,
    shards: out.size,
    /* Named, actionable gates. Each one is a concrete missing input, not a
       vague "not ready": this list is the work queue for the next factor
       certification step. */
    openInputGates: [
      { id: "OPERATING_INCOME", blocks: ["quality.operatingMarginStability", "growth.operatingMarginExpansion3y", "profitability.operatingMarginTtm", "profitability.roicTtm", "profitability.roicMedian3y"], owner: "SEC normalization metric registry (mapping 1.5.0)" },
      { id: "EBITDA", blocks: ["value.ebitdaYield"], owner: "SEC normalization metric registry (mapping 1.5.0)" },
      { id: "BETA_252D", blocks: ["risk.beta252d"], owner: "market-factors-1.0.0", detail: "Der Vergleichsindex ist im Kursfaktor-Artefakt genannt, seine Tagesreihe ist aber nicht veröffentlicht; Beta lässt sich daraus nicht bilden." },
      { id: "NET_DEBT_PERIOD_ALIGNMENT", blocks: ["quality.netDebtToAssets", "value.salesYield"], owner: "SEC normalization", detail: "Der abgeleitete Nettoverschuldungswert stützt sich häufig auf eine veraltete Schuldenposition; periodenfremde Werte werden hier verworfen statt vermischt." },
      { id: "RELATIVE_STRENGTH_12M1M", blocks: ["momentum.relativeStrength12m1m"], owner: "market-factors-1.0.0" },
      { id: "PIT_ANALYST_CONSENSUS", blocks: ["revisions.*"], owner: "external licence" },
      { id: "INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS", blocks: ["quality.*", "value.*", "profitability.*"], owner: "quant-v2 methodology" },
      { id: "FACTOR_SNAPSHOT_HISTORY", blocks: ["change.scoreMomentum"], owner: "this materializer, from its first weekly snapshot forward" }
    ],
    gapCounts: Object.fromEntries(gapCounts),
    runtimeMs: Date.now() - started
  };
  summary.contentHash = createHash("sha256").update(JSON.stringify({ ...summary, contentHash: undefined, runtimeMs: undefined })).digest("hex").slice(0, 16);
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 1));

  console.log("factor-evidence: " + written + " securities in " + out.size + " shards");
  for (const factorId of FactorEvidence.FACTOR_ORDER) {
    console.log("  " + factorId.padEnd(14) + JSON.stringify(factorStates[factorId]));
  }
  console.log("  reasons " + JSON.stringify(reasonCounts));
}

function mandatoryUnmet(factorId, components) {
  const has = (id) => components.some((component) => component.id === id && component.state === "AVAILABLE");
  if (factorId === "momentum") return !has("totalReturn12m1m");
  if (factorId === "risk") return !has("realizedVolatility252d");
  if (factorId === "quality") return !(has("accrualRatio") || has("positiveFcfYears")) || !(has("netDebtToAssets") || has("equityToAssets"));
  if (factorId === "growth") return !(has("revenueCagr3y") || has("revenueGrowthTtmYoy"));
  if (factorId === "value") return !(has("fcfYield") || has("earningsYield")) || !(has("salesYield") || has("bookToMarket") || has("ebitdaYield"));
  if (factorId === "profitability") return !(has("roicTtm") || has("roaTtm")) || !(has("operatingMarginTtm") || has("fcfMarginTtm") || has("grossProfitabilityTtm"));
  return false;
}

/* Annualized downside semi-deviation about zero, mirroring the log-return
   and sqrt(252) convention of market-factors-1.0.0 so that the two
   volatility components of the Risk factor stay comparable. Returns null
   below the contract minimum of 240 valid returns. */
function downsideVolatility(closes, window) {
  if (!Array.isArray(closes) || closes.length < window + 1) return null;
  const slice = closes.slice(-(window + 1));
  let valid = 0, sum = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const previous = slice[i - 1], current = slice[i];
    if (!finite(previous) || !finite(current) || previous <= 0 || current <= 0) continue;
    valid += 1;
    const logReturn = Math.log(current / previous);
    if (logReturn < 0) sum += logReturn * logReturn;
  }
  if (valid < 240) return null;
  return round(Math.sqrt(sum / (valid - 1)) * Math.sqrt(252));
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function freshnessScore(observed, cutoff) {
  if (typeof observed !== "string" || typeof cutoff !== "string") return 0;
  const days = (Date.parse(cutoff) - Date.parse(observed)) / 86400000;
  if (!Number.isFinite(days) || days < 0) return 100;
  if (days <= 7) return 100;
  if (days <= 45) return 90;
  if (days <= 120) return 75;
  if (days <= 240) return 55;
  if (days <= 400) return 35;
  return 10;
}

main();
