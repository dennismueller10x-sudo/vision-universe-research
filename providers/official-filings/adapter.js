"use strict";
// SEC and official European filings implement the same FundamentalDataProvider.
// Company facts are stored once; listing projection happens only when requested.
const fs = require("node:fs");
const path = require("node:path");
const Schema = require("../../quant/engines/schema.js");
const Provider = require("../../quant/engines/provider.js");

function asOfInstant(value) {
  if (!value) return new Date().toISOString();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T23:59:59.999Z" : new Date(value).toISOString();
}
function createOfficialFilingsProvider(options) {
  const o = options || {};
  const loadAll = o.loadAll || (() => {
    const dir = o.directory || path.join(__dirname, "../../quant/data/fundamentals/official");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith(".json")).map(n => JSON.parse(fs.readFileSync(path.join(dir, n)))) : [];
  });
  let cache;
  const bundles = () => cache || (cache = loadAll());
  function company(id) {
    return (o.listings || []).find(r => r.securityId === id || r.listingId === id)?.companyId || id;
  }
  function rows(id, opts) {
    const instant = asOfInstant(opts?.asOf);
    const records = bundles().filter(b => b.companyId === company(id));
    const facts = [], filings = [];
    for (const b of records) {
      if (b.schemaVersion !== "official-filing-1.0.0" || !b.sourceDocument || !b.documentSha256) throw Error("OFFICIAL_FILING_INVALID");
      for (const f of b.facts || []) {
        if (f.securityId !== b.companyId) throw Error("OFFICIAL_COMPANY_IDENTITY_MISMATCH");
        const projected = { ...f, securityId: id };
        Schema.assertValid("FundamentalFact", projected);
        if (asOfInstant(f.availableAt) <= instant) facts.push(projected);
      }
      if (asOfInstant(b.availableAt) <= instant) {
        const filing = { ...b.filing, securityId: id };
        Schema.assertValid("Filing", filing);
        if (!opts?.formType || opts.formType === filing.formType) filings.push(filing);
      }
    }
    // Select revisions separately for each metric/period/fiscalPeriod using
    // the shared schema's exact PIT rule, including publication intraday.
    const keys = new Map();
    for (const f of facts) {
      const key = [f.metricId, f.periodEnd, f.fiscalPeriod].join("|");
      if (!keys.has(key)) keys.set(key, []);
      keys.get(key).push(f);
    }
    const selected = [];
    for (const candidates of keys.values()) {
      const f = candidates[0];
      if (opts?.metricId && f.metricId !== opts.metricId) continue;
      if (opts?.periodEnd && f.periodEnd !== opts.periodEnd) continue;
      if (opts?.fiscalPeriod && f.fiscalPeriod !== opts.fiscalPeriod) continue;
      const best = Schema.latestKnownFact(candidates, f.metricId, instant);
      if (best) selected.push(best);
    }
    return { facts: selected, filings: Array.from(new Map(filings.map(f => [f.filingId, f])).values()) };
  }
  const provenance = asOf => Schema.makeProvenance({ provider: "official-filings", source: "official_structured_filing",
    asOf: String(asOf || new Date().toISOString()).slice(0, 10), ingestedAt: new Date().toISOString(),
    dataSnapshotId: "official-filing-1.0.0", isMock: false });
  return {
    getFacts(id, opts) {
      const r = rows(id, opts).facts;
      return r.length ? Provider.ok(r, provenance(opts?.asOf)) : Provider.unavailable("No official structured facts available at this point in time.");
    },
    getFilings(id, opts) { return Provider.ok(rows(id, opts).filings, provenance(opts?.asOf)); },
    getFactPanel(ids, opts) {
      const panel = {}, missing = [];
      for (const id of ids || []) {
        const r = rows(id, opts).facts;
        if (r.length) panel[id] = r; else missing.push(id);
      }
      return Object.keys(panel).length ? Provider.ok({ rows: panel, missing }, provenance(opts?.asOf)) : Provider.unavailable("No official structured fact panel available.");
    },
    healthCheck() { return Provider.makeHealth(bundles().length ? "ok" : "unavailable", { provider: "official-filings", capabilities: ["FundamentalDataProvider"] }); },
    clearCache() { cache = null; }
  };
}
module.exports = { createOfficialFilingsProvider, asOfInstant };
