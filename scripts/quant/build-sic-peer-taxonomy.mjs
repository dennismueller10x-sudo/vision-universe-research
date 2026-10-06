import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Contract = require(join(root, "quant", "engines", "sic-peer-taxonomy.js"));
const factorsPath = join(root, "quant", "data", "market", "factors", "factors-FULL_UNIVERSE.json");
const issuerDir = join(root, "quant", "data", "fundamentals", "issuers");
const instrumentDir = join(root, "quant", "data", "universe", "instruments");
const statePath = join(root, "quant", "data", "fundamentals", "daily", "state.json");
const outPath = join(root, "quant", "data", "product", "sic-peer-taxonomy-v1.json");

const factors = JSON.parse(readFileSync(factorsPath, "utf8"));
const state = JSON.parse(readFileSync(statePath, "utf8"));
const securities = Array.isArray(factors.securities) ? factors.securities : [];
const secGeneratedAt = state.LAST_SUCCESSFUL_RUN || null;
if (!factors.generatedAt || !secGeneratedAt || securities.length === 0) throw new Error("Required current factor/SEC snapshot metadata is missing.");
const generatedAt = [factors.generatedAt, secGeneratedAt].sort().at(-1);

const instrumentByMember = new Map();
const duplicateMasterMembers = [];
for (const file of readdirSync(instrumentDir).filter((name) => /^[A-Z0-9_]{2}\.json$/.test(name)).sort()) {
  const payload = JSON.parse(readFileSync(join(instrumentDir, file), "utf8"));
  for (const instrument of payload.instruments || []) {
    if (!instrument.masterMemberId) continue;
    if (instrumentByMember.has(instrument.masterMemberId)) {
      duplicateMasterMembers.push(instrument.masterMemberId);
      instrumentByMember.delete(instrument.masterMemberId);
      continue;
    }
    if (!duplicateMasterMembers.includes(instrument.masterMemberId)) instrumentByMember.set(instrument.masterMemberId, instrument);
  }
}

const fundamentalsByIssuer = new Map();
const duplicateFundamentalsIssuers = [];
for (const file of readdirSync(issuerDir).filter((name) => /^\d{3}\.json$/.test(name)).sort()) {
  const path = join(issuerDir, file);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  for (const issuer of payload.issuers || []) {
    if (!issuer.cik) continue;
    const issuerId = `iss_cik_${String(issuer.cik).padStart(10, "0")}`;
    if (fundamentalsByIssuer.has(issuerId)) {
      duplicateFundamentalsIssuers.push(issuerId);
      fundamentalsByIssuer.delete(issuerId);
      continue;
    }
    if (!duplicateFundamentalsIssuers.includes(issuerId)) fundamentalsByIssuer.set(issuerId, { issuer, file });
  }
}

const matches = [];
const rejected = [];
for (const security of [...securities].sort((a, b) => String(a.securityId).localeCompare(String(b.securityId)))) {
  const result = Contract.canonicalMatch(security, instrumentByMember, fundamentalsByIssuer);
  if (!result.ok) {
    rejected.push({ ticker: security.ticker || null, securityId: security.securityId || null, reason: result.reason });
    continue;
  }
  matches.push({ security, ...result });
}

function distinctIssuerCounts(keyOf) {
  const groups = new Map();
  for (const match of matches) {
    const key = keyOf(match);
    if (key === null || key === undefined) continue;
    const set = groups.get(key) || new Set();
    set.add(match.issuer.cik);
    groups.set(key, set);
  }
  return new Map([...groups].map(([key, issuers]) => [key, issuers.size]));
}
const industryCounts = distinctIssuerCounts((match) => match.sic4);
const divisionCounts = distinctIssuerCounts((match) => match.division && match.division.id);
const universeCount = new Set(matches.map((match) => match.issuer.cik)).size;

const rowColumns = ["ticker", "securityId", "issuerId", "cik", "sicRaw", "sic4", "sicDivision", "peerLevel", "peerConfidence", "confidencePenaltyRequired", "sourceShard", "marketAsOf"];
const rows = matches.map((match) => {
  const population = { sic4_industry: match.sic4 ? industryCounts.get(match.sic4) : null, sic_division: match.division ? divisionCounts.get(match.division.id) : null, universe: universeCount };
  const candidate = Contract.resolvePeerLevel(population);
  return [match.security.ticker, match.security.securityId,
    `iss_cik_${String(match.issuer.cik).padStart(10, "0")}`, String(match.issuer.cik).padStart(10, "0"),
    match.issuer.sic === null || match.issuer.sic === undefined ? null : String(match.issuer.sic),
    match.sic4, match.division ? match.division.id : null, candidate.level, candidate.confidence,
    candidate.confidencePenaltyRequired,
    match.file, match.security.asOf || null];
});

const projection = {
  version: Contract.VERSION,
  generatedAt,
  classificationTime: { observedAt: secGeneratedAt, effectiveAt: null, note: "SEC issuer summary observation time; no SIC effective date or classification history is available." },
  snapshotMode: "CURRENT_ONLY",
  historicalClassificationAvailable: false,
  backtestEligible: false,
  scorePublicationAllowed: false,
  methodologyBinding: { industry: "sic4_industry", sector: "sic_division", universe: "universe", note: "SIC divisions are not GICS or modern sectors." },
  minimumValidIssuers: Contract.MINIMUMS,
  fallbackPolicy: { populationCountsAreUpperBounds: true, metricSpecificValidIssuerCountsRequired: true, universeConfidencePenaltyRequired: true, resolver: "sic4_industry -> sic_division -> universe -> unavailable" },
  identityJoin: { chain: ["factor.securityId", "companyMaster.masterMemberId", "companyMaster.issuerId", "fundamentals.cikDerivedIssuerId"], fundamentalsIssuerIdDerivation: "iss_cik_<10-digit-cik>", requiresExactEquality: true, tickerUsedForJoin: false },
  source: { provider: "SEC", artifact: "fundamentals-issuer-summary", factors: relative(root, factorsPath), factorsGeneratedAt: factors.generatedAt, instruments: relative(root, instrumentDir), fundamentals: relative(root, issuerDir), fundamentalsState: relative(root, statePath), fundamentalsObservedAt: secGeneratedAt, classificationEffectiveAt: null },
  divisions: Object.fromEntries(Contract.DIVISIONS.map((division) => [division.id, { name: division.name, range: `${String(division.min).padStart(4, "0")}-${String(division.max).padStart(4, "0")}`, memberIssuers: divisionCounts.get(division.id) || 0 }])),
  industryIssuerCounts: Object.fromEntries([...industryCounts].sort(([a], [b]) => a.localeCompare(b))),
  counts: { factorSecurities: securities.length, projectedSecurities: rows.length, classifiedSecurities: matches.filter((match) => !match.classificationMissing).length, classificationMissing: matches.filter((match) => match.classificationMissing).length, distinctIssuers: universeCount, identityRejected: rejected.length, duplicateMasterMembers: duplicateMasterMembers.length, duplicateFundamentalsIssuers: duplicateFundamentalsIssuers.length },
  identityConflicts: { duplicateMasterMembers: [...duplicateMasterMembers].sort(), duplicateFundamentalsIssuers: [...duplicateFundamentalsIssuers].sort() },
  rowColumns,
  rejectionColumns: ["ticker", "securityId", "reason"],
  rejections: rejected.map((item) => [item.ticker, item.securityId, item.reason]),
  rows
};
const validation = Contract.validate(projection);
if (!validation.ok) throw new Error(`Invalid SIC peer projection: ${validation.errors.join(", ")}`);
mkdirSync(dirname(outPath), { recursive: true });
function serialize(value) {
  const denseArrays = new Set(["rejections", "rows"]);
  const entries = Object.entries(value).map(([key, child]) => {
    if (denseArrays.has(key)) {
      const lines = child.map((row) => `    ${JSON.stringify(row)}`);
      return `  ${JSON.stringify(key)}: [\n${lines.join(",\n")}\n  ]`;
    }
    return `  ${JSON.stringify(key)}: ${JSON.stringify(child, null, 2).replace(/\n/g, "\n  ")}`;
  });
  return `{\n${entries.join(",\n")}\n}\n`;
}
writeFileSync(outPath, serialize(projection));
console.log(`SIC peer taxonomy: ${rows.length} securities / ${universeCount} issuers; ${matches.filter((match) => match.classificationMissing).length} classification-missing; ${rejected.length} rejected canonical joins.`);
