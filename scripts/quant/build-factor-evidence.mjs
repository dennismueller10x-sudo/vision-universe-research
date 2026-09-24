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
const FundamentalInputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));
const Catalog = require(join(ROOT, "quant/engines/catalog.js"));

const OUT_DIR = join(ROOT, "quant/data/product/factor-evidence-v1");
/* Deliberately a sibling of OUT_DIR, not a child: the current artifact is
   rebuilt from scratch on every run, and a published snapshot must not be
   something a rebuild can delete. */
const HISTORY_ROOT = join(ROOT, "quant/data/product/factor-evidence-history");
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
    /* Seit quant-v2.1.0 heissen diese drei nach dem, was sie messen.
       Sie hiessen totalReturn*, weil sie auf der gesamtrenditebereinigten
       Spalte liefen; seit der Owner-Entscheidung (Option C) laufen sie auf
       splitbereinigten Kursen, und ein Name, der etwas anderes behauptet
       als der Inhalt, ist genau die stille Umdefinition, die hier
       ausgeschlossen wird. */
    { id: "priceReturn12m1m", weight: 0.30, direction: "higher", label: "Kursentwicklung 12 Monate ohne letzten Monat", unit: "ratio", read: (v) => v.return12M1M },
    { id: "priceReturn6m", weight: 0.20, direction: "higher", label: "Kursentwicklung 6 Monate", unit: "ratio", read: (v) => v.returns?.["6M"] },
    { id: "priceReturn3m", weight: 0.10, direction: "higher", label: "Kursentwicklung 3 Monate", unit: "ratio", read: (v) => v.returns?.["3M"] },
    { id: "relativeStrength12m1m", weight: 0.20, direction: "higher", label: "Vorsprung gegenüber dem Markt, 12 Monate ohne letzten Monat", unit: "ratio", read: (v) => v.relativeStrength12M1M,
      note: "Differenz der Log-Renditen über das 12-1-Fenster gegen den hinterlegten Vergleichsindex. Die volle Zwölfmonatsreihe daneben ist eine andere Größe und steht nicht an ihrer Stelle." },
    { id: "distanceTo52wHigh", weight: 0.10, direction: "lower", label: "Abstand zum 52-Wochen-Hoch", unit: "ratio", read: (v) => (finite(v.distanceTo52wHigh) ? -v.distanceTo52wHigh : null) },
    { id: "distanceToSma200", weight: 0.10, direction: "higher", label: "Abstand zur 200-Tage-Linie", unit: "ratio", read: (v) => v.distanceToSMA200 }
  ],
  risk: [
    { id: "realizedVolatility252d", weight: 0.35, direction: "lower", label: "Schwankungsbreite 1 Jahr", unit: "ratio", read: (v) => v.volatility252d },
    { id: "downsideVolatility252d", weight: 0.25, direction: "lower", label: "Schwankungsbreite der Verlusttage", unit: "ratio", read: (v) => v.downsideVolatility252d,
      note: "Annualisierte Halbabweichung der negativen Tages-Logrenditen über 252 Sitzungen. Sie kommt aus dem Kursfaktor-Artefakt, sobald dieses sie führt; bis dahin wird sie aus der veröffentlichten 270-Tage-Reihe abgeleitet und trägt dann die Kursbasis SPLIT_ADJUSTED." },
    { id: "maxDrawdown252d", weight: 0.25, direction: "lower", label: "Größter Rückgang im Jahr", unit: "ratio", read: (v) => (finite(v.maxDrawdown252d) ? Math.abs(v.maxDrawdown252d) : null) },
    { id: "beta252d", weight: 0.15, direction: "lower", label: "Marktsensitivität (Beta)", unit: "ratio", read: (v) => v.beta252d,
      note: "Kovarianz der Tagesrenditen zum Vergleichsindex, geteilt durch dessen Varianz, über 252 Sitzungen. Gepaart wird über die Handelstage; ein Tag ohne Gegenstück fällt heraus." }
  ]
};

const FUNDAMENTAL_COMPONENTS = {
  quality: [
    { id: "accrualRatio", weight: 0.25, direction: "lower", label: "Abstand zwischen Gewinn und Zahlungsfluss", unit: "ratio" },
    { id: "netDebtToAssets", weight: 0.20, direction: "lower", label: "Nettoverschuldung zu Bilanzsumme", unit: "ratio" },
    { id: "equityToAssets", weight: 0.15, direction: "higher", label: "Eigenkapitalquote", unit: "ratio" },
    { id: "positiveFcfYears", weight: 0.20, direction: "higher", label: "Jahre mit positivem freien Zahlungsfluss", unit: "count", noWinsor: true },
    { id: "operatingMarginStability", weight: 0.20, direction: "lower", label: "Schwankung der operativen Marge", unit: "ratio",
      note: "Mittlere absolute Abweichung der jährlichen operativen Marge vom eigenen Median, über bis zu fünf Geschäftsjahre und erst ab vier." }
  ],
  growth: [
    { id: "revenueCagr3y", weight: 0.30, direction: "higher", label: "Umsatzwachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "epsCagr3y", weight: 0.20, direction: "higher", label: "Gewinn je Aktie, Wachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "fcfCagr3y", weight: 0.15, direction: "higher", label: "Freier Zahlungsfluss, Wachstum pro Jahr, 3 Jahre", unit: "ratio" },
    { id: "revenueGrowthTtmYoy", weight: 0.15, direction: "higher", label: "Umsatzwachstum der letzten 12 Monate", unit: "ratio" },
    { id: "operatingMarginExpansion3y", weight: 0.10, direction: "higher", label: "Ausweitung der operativen Marge, 3 Jahre", unit: "ratio",
      note: "Operative Marge des letzten Geschäftsjahres minus die des Jahres drei Abschlüsse davor." },
    { id: "revenueGrowthAcceleration", weight: 0.10, direction: "higher", label: "Veränderung des Umsatztempos", unit: "ratio" }
  ],
  value: [
    { id: "fcfYield", weight: 0.30, direction: "higher", label: "Freier Zahlungsfluss je Börsenwert", unit: "ratio" },
    { id: "earningsYield", weight: 0.25, direction: "higher", label: "Gewinn je Börsenwert", unit: "ratio" },
    { id: "ebitdaYield", weight: 0.20, direction: "higher", label: "Operatives Ergebnis vor Abschreibungen je Unternehmenswert", unit: "ratio",
      note: "EBITDA der letzten zwölf Monate je Unternehmenswert. EBITDA entsteht in der SEC-Schicht aus operativem Ergebnis plus Abschreibungen; meldet ein Emittent keine Abschreibungen, bleibt es leer statt zum operativen Ergebnis unter falschem Namen zu werden." },
    { id: "salesYield", weight: 0.10, direction: "higher", label: "Umsatz je Unternehmenswert", unit: "ratio" },
    { id: "bookToMarket", weight: 0.15, direction: "higher", label: "Eigenkapital je Börsenwert", unit: "ratio" }
  ],
  profitability: [
    { id: "roicTtm", weight: 0.25, direction: "higher", label: "Rendite auf das eingesetzte Kapital", unit: "ratio",
      note: "Operatives Ergebnis nach Steuern je eingesetztem Kapital (Schulden plus Eigenkapital minus Kasse). Der Steuersatz ist der gemeldete effektive Satz des Emittenten; ohne positives Vorsteuerergebnis bleibt der Wert leer, statt einen pauschalen Satz zu unterstellen." },
    { id: "roicMedian3y", weight: 0.15, direction: "higher", label: "Rendite auf das eingesetzte Kapital, Median 3 Jahre", unit: "ratio",
      note: "Median der jährlichen ROIC über drei Geschäftsjahre, jedes mit dem effektiven Steuersatz desselben Jahres." },
    { id: "grossProfitabilityTtm", weight: 0.20, direction: "higher", label: "Rohertrag je Bilanzsumme", unit: "ratio" },
    { id: "operatingMarginTtm", weight: 0.15, direction: "higher", label: "Operative Marge", unit: "ratio",
      note: "Operatives Ergebnis der letzten zwölf Monate im Verhältnis zum Umsatz desselben Fensters." },
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

  /* Published snapshots of this methodology, oldest first. Only values that
     were published on those dates become a comparison point; nothing is
     recomputed for a past date. */
  const priorDir = join(HISTORY_ROOT, FactorEvidence.METHODOLOGY_VERSION);
  const historyByTicker = new Map();
  if (existsSync(priorDir)) {
    const files = readdirSync(priorDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)).sort();
    for (const file of files) {
      const snapshot = JSON.parse(gunzipSync(readFileSync(join(priorDir, file))));
      if (snapshot.schemaVersion !== FactorEvidence.SNAPSHOT_SCHEMA) continue;
      if (snapshot.methodologyVersion !== FactorEvidence.METHODOLOGY_VERSION) continue;
      if (snapshot.asOf >= cutoff) continue;
      const order = snapshot.fields.map((id) => id.slice((FactorEvidence.NAMESPACE + ".").length));
      for (const [ticker, values] of Object.entries(snapshot.rows || {})) {
        if (!historyByTicker.has(ticker)) historyByTicker.set(ticker, []);
        historyByTicker.get(ticker).push({
          asOf: snapshot.asOf,
          factors: Object.fromEntries(order.map((id, index) => [id, values[index]]))
        });
      }
    }
  }
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
    const price = !finite(security.values?.downsideVolatility252d) && finite(quote?.downsideVolatility252d)
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
        /* Market capitalization needs both a PIT-safe share count and a
           published close. The first pass resolves the share count; the
           second computes the price-dependent block from it rather than
           guessing a capitalization beforehand. */
        const shares = FundamentalInputs.compute(doc, cutoff, null)?.shares || null;
        const marketCap = shares && quote ? shares.value * quote.close : null;
        fundamentals = FundamentalInputs.compute(doc, cutoff, marketCap);
        if (fundamentals) {
          fundamentals.marketCap = finite(marketCap) ? marketCap : null;
          fundamentals.priceAsOf = quote?.asOf || null;
        } else countGap("FUNDAMENTALS_DOCUMENT_INVALID");
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
      asOf: record.security.asOf, basis: record.security.basis,
      factors: Object.fromEntries(FactorEvidence.FACTOR_ORDER
        .filter((id) => factors[id].state === "AVAILABLE")
        .map((id) => [id, factors[id].score])),
      factorHistory: historyByTicker.get(record.ticker) || null
    });

    const published = {
      ticker: record.ticker,
      securityId: record.security.securityId,
      cik: record.peer?.cik || null,
      asOf: record.security.asOf,
      dataCutoff: cutoff,
      priceBasis: record.security.basis,
      /* WORAUF gerechnet wurde, nicht nur WELCHE SPALTE. Seit
         quant-v2.1.0 ist das der Unterschied zwischen Kursstaerke und
         Anlegerrendite, und er darf nicht aus der Spalte erraten werden
         muessen. */
      returnBasis: record.security.returnBasis || null,
      priceSource: record.security.priceSource || null,
      /* Die Anlegerrendite: eigene Evidenz neben dem Faktor, nie darin.
         Sie beantwortet "Was haette ein Anleger inklusive Ausschuettungen
         verdient?" - der Momentumfaktor beantwortet "Wie stark bewegt
         sich der Kurs?". Option C, Owner-Entscheidung 2026-09-24. */
      investorReturn: record.security.investorReturn
        ? { state: record.security.investorReturn.state,
            reason: record.security.investorReturn.reason || null,
            basis: record.security.investorReturn.basis,
            returns: record.security.investorReturn.returns || {},
            return12M1M: record.security.investorReturn.return12M1M ?? null,
            isFactorComponent: false }
        : { state: "UNAVAILABLE", reason: "NOT_MATERIALIZED", basis: "TOTAL_RETURN",
            returns: {}, return12M1M: null, isFactorComponent: false },
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

  /* One compact universe-wide table so the Screener and Strategy Match can
     select on Quant V2 evidence without loading 637 shards. The column
     names ARE the canonical catalog field ids of the
     quantV2.factorEvidence namespace: no second naming scheme can drift
     away from the one a rule is written against. */
  const screeningFields = Catalog.namespaceFieldIds(FactorEvidence.NAMESPACE);
  const factorColumns = FactorEvidence.FACTOR_ORDER.map((id) => FactorEvidence.NAMESPACE + "." + id);
  const coverageColumn = FactorEvidence.NAMESPACE + ".availableFactors";
  if (screeningFields.length !== factorColumns.length + 1 || !screeningFields.includes(coverageColumn)) {
    throw new Error("catalog namespace drifted from the published factor set");
  }
  const screeningRows = {};
  for (const securities of out.values()) {
    for (const [ticker, record] of Object.entries(securities)) {
      const values = FactorEvidence.FACTOR_ORDER.map((id) =>
        (record.factors[id].state === "AVAILABLE" ? record.factors[id].score : null));
      screeningRows[ticker] = values.concat(values.filter((value) => value !== null).length);
    }
  }
  writeFileSync(join(OUT_DIR, "screening.json.gz"), gzipSync(Buffer.from(JSON.stringify({
    ...head,
    schemaVersion: FactorEvidence.SCREENING_SCHEMA,
    scope: "CANONICAL_PRODUCT_UNIVERSE",
    namespace: FactorEvidence.NAMESPACE,
    /* Column order is the contract; a reader zips against it rather than
       assuming the factor order twice. */
    fields: factorColumns.concat(coverageColumn),
    rows: screeningRows
  })), { level: 9 }));

  /* ---------------------------------------------------------------------
     The immutable snapshot history.

     This is what opens change.scoreMomentum, and later the SetupState
     contract, without either of them being reconstructed: a comparison
     point has to be a value that was published on that date, not one
     recomputed today.

     Two rules make it immutable in practice. The path carries the
     methodology version, so a later methodology starts its own series
     instead of rewriting this one. And a snapshot for a date that already
     exists is only rewritten when it is byte-identical; anything else
     aborts the run rather than quietly changing a published past.
     --------------------------------------------------------------------- */
  const historyDir = join(HISTORY_ROOT, FactorEvidence.METHODOLOGY_VERSION);
  mkdirSync(historyDir, { recursive: true });
  const snapshotPath = join(historyDir, cutoff + ".json.gz");
  const snapshot = {
    schemaVersion: FactorEvidence.SNAPSHOT_SCHEMA,
    methodologyVersion: FactorEvidence.METHODOLOGY_VERSION,
    derivedFrom: FactorEvidence.DERIVED_FROM,
    namespace: FactorEvidence.NAMESPACE,
    asOf: cutoff,
    fields: factorColumns,
    rows: Object.fromEntries(Object.entries(screeningRows).map(([ticker, values]) => [ticker, values.slice(0, factorColumns.length)]))
  };
  snapshot.contentHash = snapshotHash(snapshot);
  let recomputationDrift = null;
  if (existsSync(snapshotPath)) {
    const existing = JSON.parse(gunzipSync(readFileSync(snapshotPath)));
    /* Corruption is the one case that must stop the run: a stored file
       that does not match its own hash is not evidence of anything, and
       writing past it would launder it. */
    if (existing.contentHash !== snapshotHash(existing)) {
      throw new Error("the published snapshot " + cutoff + " does not match its own content hash; " +
        "it is corrupt and this run will not overwrite it.");
    }
    if (existing.contentHash !== snapshot.contentHash) {
      /* NOT an error, and treating it as one cost a whole materialization
         run before this was measured.
      
         The cutoff is the market data date. The values also depend on the
         fundamentals vintage, which the SEC export refreshes on its own
         schedule - and the factors are PERCENTILES, so when anyone's
         inputs move, everyone's rank moves with them. Measured on
         2026-09-21: 2,653 of 6,403 rows differed, by hundredths.
      
         So a later run recomputing a past cutoff differently is the normal
         case, not a defect. This module's own rule already says what to do
         with it: a comparison point has to be a value that was PUBLISHED on
         that date, not one recomputed today. The published snapshot stands
         untouched; today's recomputation is simply not a snapshot.
      
         What must not happen is that this passes silently: that the inputs
         behind an already-published date have moved is worth knowing, so it
         is measured and carried into the summary. */
      let changed = 0;
      for (const [ticker, values] of Object.entries(snapshot.rows)) {
        const before = existing.rows[ticker];
        if (!before || JSON.stringify(before) !== JSON.stringify(values)) changed += 1;
      }
      recomputationDrift = {
        asOf: cutoff,
        publishedHash: existing.contentHash,
        recomputedHash: snapshot.contentHash,
        rowsDiffering: changed,
        rowsTotal: Object.keys(snapshot.rows).length,
        note: "Die veroeffentlichte Beobachtung bleibt unveraendert. Sie wurde an diesem Stichtag " +
          "veroeffentlicht und wird nicht durch eine heutige Neuberechnung ersetzt."
      };
    }
  } else {
    writeFileSync(snapshotPath, gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 }));
  }

  const snapshotDates = readdirSync(historyDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name))
    .map((name) => name.replace(".json.gz", ""))
    .sort();
  writeFileSync(join(HISTORY_ROOT, "index.json"), JSON.stringify({
    schemaVersion: FactorEvidence.SNAPSHOT_INDEX_SCHEMA,
    generatedAt,
    note: "Jede Methodikversion fuehrt ihre eigene Reihe. Ein veroeffentlichter Snapshot wird nie ueberschrieben.",
    series: { [FactorEvidence.METHODOLOGY_VERSION]: snapshotDates }
  }, null, 1));

  const summary = {
    ...head,
    schemaVersion: FactorEvidence.SUMMARY_SCHEMA,
    /* "Open" means a comparison point actually sits inside the velocity
       window, not merely that a second file exists. Two snapshots three days
       apart cannot carry a 30-day trajectory, and saying otherwise here
       would contradict what the engine reports per title. */
    snapshotHistory: { methodologyVersion: FactorEvidence.METHODOLOGY_VERSION, dates: snapshotDates,
      velocityWindowDays: ChangeEngine.SCORE_VELOCITY_DAYS,
      velocityToleranceDays: ChangeEngine.SCORE_VELOCITY_TOLERANCE_DAYS,
      scoreMomentumOpen: snapshotDates.some((date) => {
        const days = (Date.parse(cutoff) - Date.parse(date)) / 86400000;
        return Math.abs(days - ChangeEngine.SCORE_VELOCITY_DAYS) <= ChangeEngine.SCORE_VELOCITY_TOLERANCE_DAYS;
      }),
      /* Null im Normalfall. Steht hier etwas, hat eine spaetere Rechnung
         fuer einen bereits veroeffentlichten Stichtag andere Werte
         ergeben - die veroeffentlichte Beobachtung bleibt trotzdem
         stehen. Sichtbar, damit es niemand fuer Rauschen haelt. */
      recomputationDrift },
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
    screening: { schemaVersion: FactorEvidence.SCREENING_SCHEMA, namespace: FactorEvidence.NAMESPACE, rows: Object.keys(screeningRows).length, fields: factorColumns.concat(coverageColumn) },
    /* Named, actionable gates. Each one is a concrete missing input, not a
       vague "not ready": this list is the work queue for the next factor
       certification step.

       Every entry that a run can settle by itself is MEASURED against the
       coverage this run produced, never asserted. A gate that names a
       component which now carries values would otherwise keep claiming a
       blockade that a workflow has already cleared - and a stale gate is
       worse than no gate, because someone acts on it. Only the gates that
       no materialization can close (an external licence, a missing
       methodology, a history that has to accumulate) are declared. */
    openInputGates: measuredGates(componentCoverage).concat([
      { id: "PIT_ANALYST_CONSENSUS", blocks: ["revisions.*"], owner: "external licence" },
      { id: "INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS", blocks: ["quality.*", "value.*", "profitability.*"], owner: "quant-v2 methodology" },
      { id: "FACTOR_SNAPSHOT_HISTORY", blocks: ["change.scoreMomentum"], owner: "this materializer, from its first weekly snapshot forward" }
    ]),
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

/* A component with no coverage at all is a closed input. A component that
   covers a small part of the universe is a narrow input, and saying so with
   the measured count is more use than either silence or a blanket "blocked".
   The threshold is deliberately coarse; it describes breadth, not quality. */
function measuredGates(componentCoverage) {
  const NARROW = 0.10;
  const universe = Math.max(1, ...Object.values(componentCoverage));
  const closed = [], narrow = [];
  for (const [id, count] of Object.entries(componentCoverage).sort()) {
    if (count === 0) closed.push(id);
    else if (count / universe < NARROW) narrow.push(id + " (" + count + ")");
  }
  const gates = [];
  if (closed.length) {
    gates.push({ id: "COMPONENT_INPUT_NOT_MATERIALIZED", blocks: closed, owner: "the artifact that feeds the component",
      detail: "Diese Komponenten stehen in der Methodik, tragen in diesem Lauf aber keinen einzigen Wert. Gemessen, nicht behauptet." });
  }
  if (narrow.length) {
    gates.push({ id: "COMPONENT_INPUT_NARROW", blocks: narrow, owner: "the artifact that feeds the component",
      detail: "Diese Komponenten sind offen, decken aber weniger als " + Math.round(NARROW * 100) + " % der bewerteten Titel ab. Sie tragen ihren Faktor nicht allein." });
  }
  return gates;
}

/* Hash over everything but the hash itself, so a stored snapshot can be
   checked against its own record. */
function snapshotHash(snapshot) {
  const body = { ...snapshot };
  delete body.contentHash;
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

function mandatoryUnmet(factorId, components) {
  const has = (id) => components.some((component) => component.id === id && component.state === "AVAILABLE");
  if (factorId === "momentum") return !has("priceReturn12m1m");
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
