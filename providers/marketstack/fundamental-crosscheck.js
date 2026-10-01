"use strict";

// Diagnostic only: Marketstack company_facts and official EDGAR companyfacts
// are two access paths to the SAME regulatory source. This module never
// normalizes facts, selects the latest revision, derives metrics or creates
// public availability timestamps. Neither input is modified.
const registry = require("../../quant/config/sec-metric-registry.json");
const KEY_METRICS = Object.freeze([
  "revenue", "gross_profit", "operating_income", "net_income", "eps_basic",
  "eps_diluted", "operating_cash_flow", "capital_expenditures", "free_cash_flow",
  "cash_and_equivalents", "total_debt", "total_assets", "total_liabilities",
  "stockholders_equity", "shares_outstanding"
]);
const DEPENDENCIES = Object.freeze({
  free_cash_flow: ["operating_cash_flow", "capital_expenditures"],
  total_debt: ["long_term_debt", "short_term_debt"]
});
const ID_FIELDS = Object.freeze(["cik", "taxonomy", "concept", "unit", "start", "end", "accn", "form", "filed"]);
const SOURCE_RELATION = "SAME_REGULATORY_SOURCE";

function cik(value) {
  const text = String(value ?? "");
  return /^\d{1,10}$/.test(text) ? text.padStart(10, "0") : null;
}
function date(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function key(fact, fields = ID_FIELDS) { return JSON.stringify(fields.map(field => fact[field])); }
function sorted(values) { return [...new Set(values)].sort(); }
function unwrap(payload) {
  return payload?.data && !payload.facts ? payload.data : payload;
}
function conceptMap() {
  const map = new Map();
  for (const metric of [...KEY_METRICS, "long_term_debt", "short_term_debt"]) {
    for (const mapping of registry.metrics[metric]?.concepts || []) {
      const id = mapping.taxonomy + ":" + mapping.concept;
      const metrics = map.get(id) || [];
      metrics.push(metric); map.set(id, sorted(metrics));
    }
  }
  return map;
}
const CONCEPTS = conceptMap();

function flatten(payload, side) {
  const facts = [], issues = [];
  let examined = 0, ignored = 0;
  const issuer = cik(payload?.cik);
  for (const [taxonomy, concepts] of Object.entries(payload?.facts || {})) {
    for (const [concept, body] of Object.entries(concepts || {})) {
      const metrics = CONCEPTS.get(taxonomy + ":" + concept);
      for (const [unit, entries] of Object.entries(body?.units || {})) {
        if (!Array.isArray(entries)) {
          issues.push({ side, taxonomy, concept, unit, flags: ["FACT_ARRAY_INVALID"] });
          continue;
        }
        examined += entries.length;
        if (!metrics) { ignored += entries.length; continue; }
        for (const entry of entries) {
          const f = {
            cik: issuer, taxonomy, concept, metrics: metrics.slice(), unit,
            start: entry?.start ?? null, end: entry?.end ?? null,
            accn: entry?.accn ?? null, form: entry?.form ?? null,
            filed: entry?.filed ?? null, value: entry?.val ?? null,
            // fy/fp describe the filing. They are NOT canonical fact periods.
            filingFiscalYear: entry?.fy ?? null, filingFiscalPeriod: entry?.fp ?? null
          };
          const flags = [];
          for (const field of ["end", "filed"]) {
            if (f[field] === null) flags.push("MISSING_" + field.toUpperCase() + "_DATE");
            else if (!date(f[field])) flags.push("INVALID_" + field.toUpperCase() + "_DATE");
          }
          if (f.start !== null && !date(f.start)) flags.push("INVALID_START_DATE");
          const definition = registry.metrics[metrics[0]];
          if (definition.kind === "duration" && f.start === null) flags.push("MISSING_START_DATE");
          if (definition.kind === "instant" && f.start !== null) flags.push("PERIOD_KIND_MISMATCH");
          if (date(f.start) && date(f.end) && f.start > f.end) flags.push("PERIOD_ORDER_INVALID");
          if (date(f.end) && date(f.filed) && f.end > f.filed) flags.push("FILING_BEFORE_PERIOD_END");
          if (typeof f.value !== "number" || !Number.isFinite(f.value)) flags.push("INVALID_VALUE");
          if (typeof unit !== "string" || !unit) flags.push("MISSING_UNIT");
          else {
            // The registry expresses monetary units using USD; foreign SEC
            // filers retain their reported ISO currency, with the same unit
            // dimension. This validates dimension, not currency conversion.
            const allowed = definition.units || [];
            const compatible = allowed.includes(unit) ||
              (allowed.includes("USD") && /^[A-Z]{3}$/.test(unit)) ||
              (allowed.includes("USD/shares") && /^[A-Z]{3}\/shares$/.test(unit));
            if (!compatible) flags.push("UNIT_DIMENSION_MISMATCH");
          }
          if (typeof f.accn !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(f.accn)) flags.push("INVALID_ACCESSION");
          if (typeof f.form !== "string" || !f.form) flags.push("MISSING_FORM");
          if (["dimensions", "segment", "scenario"].some(name => entry?.[name] && Object.keys(entry[name]).length)) flags.push("DIMENSIONAL_FACT_NOT_CONSOLIDATED");
          if (flags.length) issues.push({ side, ...f, flags: sorted(flags) });
          else facts.push(f);
        }
      }
    }
  }
  return { facts, issues, examined, ignored };
}
function groups(facts) {
  const map = new Map();
  for (const fact of facts) {
    const id = key(fact), rows = map.get(id) || [];
    rows.push(fact); map.set(id, rows);
  }
  return map;
}
function diagnosticIndex(facts) {
  const out = new Map();
  for (const field of ID_FIELDS.filter(name => name !== "cik")) {
    const retained = ID_FIELDS.filter(name => name !== field), index = new Map();
    for (const fact of facts) {
      const id = key(fact, retained), values = index.get(id) || new Set();
      values.add(fact[field]); index.set(id, values);
    }
    out.set(field, { retained, index });
  }
  return out;
}
function diagnosticFlags(fact, other) {
  // Relax ONE field only. These are review candidates, never value matches.
  // Multiple currencies/periods/revisions may legitimately coexist in EDGAR.
  const fields = ["taxonomy", "concept", "unit", "start", "end", "accn", "form", "filed"];
  const names = { taxonomy: "TAXONOMY", concept: "CONCEPT", unit: "UNIT", start: "PERIOD_START", end: "PERIOD_END", accn: "ACCESSION", form: "FORM", filed: "FILING_DATE" };
  const flags = [];
  for (const field of fields) {
    const { retained, index } = other.get(field);
    const values = index.get(key(fact, retained));
    if (values && (values.size > 1 || !values.has(fact[field]))) {
      flags.push(names[field] + "_MISMATCH_REVIEW");
      if (field === "unit" && /^[A-Z]{3}(?:\/shares)?$/.test(fact.unit)) flags.push("CURRENCY_OR_UNIT_MISMATCH_REVIEW");
    }
  }
  return sorted(flags);
}
function emptyCounts() {
  return { secFacts: 0, marketstackFacts: 0, secExamined: 0, marketstackExamined: 0,
    secIgnored: 0, marketstackIgnored: 0, matched: 0, valueMismatches: 0,
    missingInMarketstack: 0, missingInSEC: 0, duplicateSEC: 0, duplicateMarketstack: 0, invalidFacts: 0 };
}

function compareCompanyFacts(marketstackPayload, secPayload, options = {}) {
  const relativeTolerance = options.relativeTolerance ?? 1e-6;
  const absoluteTolerance = options.absoluteTolerance ?? 1e-6;
  if (![relativeTolerance, absoluteTolerance].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) throw Error("FUNDAMENTAL_TOLERANCE_INVALID");
  const marketstack = unwrap(marketstackPayload), sec = unwrap(secPayload);
  const result = {
    schemaVersion: "marketstack-fundamental-crosscheck-1.0.0",
    sourceRelation: SOURCE_RELATION, scope: "RAW_REPORTED_FACTS_FOR_KEY_METRICS",
    canonicalMetricsCompared: false, pointInTimeCertified: false,
    availabilityPolicy: "SOURCE_FILINGS_REMAIN_AUTHORITATIVE_NO_DATES_CREATED",
    cik: cik(sec?.cik), marketstackCik: cik(marketstack?.cik), status: "UNAVAILABLE",
    mappingVersion: registry.mapping_version,
    tolerances: { relative: relativeTolerance, absolute: absoluteTolerance },
    counts: emptyCounts(), rows: [], issues: [], metrics: []
  };
  if (!result.cik || !result.marketstackCik || !sec?.facts || !marketstack?.facts ||
      typeof sec.facts !== "object" || typeof marketstack.facts !== "object" ||
      Array.isArray(sec.facts) || Array.isArray(marketstack.facts)) {
    result.issues = [{ flags: ["INVALID_SOURCE_PAYLOAD"] }]; return result;
  }
  if (result.cik !== result.marketstackCik) {
    result.status = "IDENTITY_MISMATCH";
    result.issues = [{ flags: ["CIK_MISMATCH"] }]; return result;
  }
  const s = flatten(sec, "SEC"), m = flatten(marketstack, "MARKETSTACK");
  const sg = groups(s.facts), mg = groups(m.facts);
  const si = diagnosticIndex(s.facts), mi = diagnosticIndex(m.facts);
  Object.assign(result.counts, { secFacts: s.facts.length, marketstackFacts: m.facts.length,
    secExamined: s.examined, marketstackExamined: m.examined,
    secIgnored: s.ignored, marketstackIgnored: m.ignored, invalidFacts: s.issues.length + m.issues.length });
  for (const id of sorted([...sg.keys(), ...mg.keys()])) {
    const sr = sg.get(id) || [], mr = mg.get(id) || [];
    const fact = sr[0] || mr[0], flags = [];
    let status;
    if (sr.length > 1) { flags.push("DUPLICATE_SEC_FACT"); result.counts.duplicateSEC += sr.length - 1; }
    if (mr.length > 1) { flags.push("DUPLICATE_MARKETSTACK_FACT"); result.counts.duplicateMarketstack += mr.length - 1; }
    if (!mr.length) {
      status = "MISSING_IN_MARKETSTACK"; result.counts.missingInMarketstack++;
      flags.push(...diagnosticFlags(fact, mi));
    } else if (!sr.length) {
      status = "MISSING_IN_SEC"; result.counts.missingInSEC++;
      flags.push(...diagnosticFlags(fact, si));
    } else if (sr.length > 1 || mr.length > 1) {
      status = "AMBIGUOUS_DUPLICATE";
    } else {
      const difference = mr[0].value - sr[0].value;
      const limit = Math.max(absoluteTolerance, relativeTolerance * Math.max(Math.abs(sr[0].value), Math.abs(mr[0].value)));
      status = Math.abs(difference) <= limit ? "MATCH" : "VALUE_MISMATCH";
      result.counts[status === "MATCH" ? "matched" : "valueMismatches"]++;
      if (status !== "MATCH") flags.push("REPORTED_VALUE_MISMATCH");
      if (sr[0].filingFiscalYear !== mr[0].filingFiscalYear || sr[0].filingFiscalPeriod !== mr[0].filingFiscalPeriod) flags.push("FILING_FISCAL_METADATA_MISMATCH");
    }
    const identity = Object.fromEntries(ID_FIELDS.map(field => [field, fact[field]]));
    result.rows.push({ ...identity, metrics: fact.metrics, status, flags: sorted(flags),
      secValues: sr.map(f => f.value).sort((a, b) => a - b),
      marketstackValues: mr.map(f => f.value).sort((a, b) => a - b),
      absoluteDifference: sr.length === 1 && mr.length === 1 ? Math.abs(mr[0].value - sr[0].value) : null });
  }
  result.issues = [...s.issues, ...m.issues].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  result.metrics = KEY_METRICS.map(metric => {
    const rows = result.rows.filter(row => row.metrics.includes(metric));
    return { metric, compared: rows.filter(row => ["MATCH", "VALUE_MISMATCH"].includes(row.status)).length,
      matched: rows.filter(row => row.status === "MATCH").length,
      mismatched: rows.filter(row => row.status === "VALUE_MISMATCH").length,
      status: rows.length ? "RAW_FACTS_ASSESSED" : "UNAVAILABLE",
      reason: rows.length ? null : DEPENDENCIES[metric] ? "DERIVED_METRIC_REQUIRES_CANONICAL_VALIDATION" : "NO_COMPARABLE_RAW_FACTS",
      canonicalValidated: false, dependencies: (DEPENDENCIES[metric] || []).slice() };
  });
  const problematic = result.rows.some(row => row.status !== "MATCH" || row.flags.length) || result.issues.length > 0;
  result.status = !result.rows.length ? "UNAVAILABLE" : problematic ? "REVIEW_REQUIRED" : "MATCH";
  return result;
}

module.exports = { compareCompanyFacts, KEY_METRICS, SOURCE_RELATION };
