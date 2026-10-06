import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const Codec = createRequire(import.meta.url)("../engines/series-codec.js");
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const index = read("data/etf-index.json");
const extra = read("data/etf-index-extra.json");
const rows = index.rows.concat(extra.rows).map((r) => Object.fromEntries(index.fields.map((f, i) => [f, r[i]])));

test("ETF-Index: Schema, Spalten, Schichten, keine erfundenen Kosten", () => {
  assert.equal(index.schemaVersion, "vu-vorsorge-etf-index-2.0.0");
  assert.ok(rows.length >= 100);
  for (const r of index.rows.concat(extra.rows)) assert.equal(r.length, index.fields.length);
  for (const r of index.rows) assert.ok(["PUBLIC_ANALYSIS", "COMPLEX"].includes(r[index.fields.indexOf("layer")]), "Haupt-Index nur Public + Komplex");
  for (const r of rows) {
    assert.ok(["PUBLIC_ANALYSIS", "COMPLEX", "ARCHIVE", "REVIEW"].includes(r.layer), r.symbol);
    assert.ok(["STANDARD", "KOMPLEX", "SEHR_KOMPLEX", "NICHT_EINORDENBAR"].includes(r.retirementClass), r.symbol);
    if (r.layer === "PUBLIC_ANALYSIS") { assert.equal(r.retirementClass, "STANDARD", r.symbol); assert.equal(r.status, "ACTIVE"); assert.ok(r.hy !== null, r.symbol); }
    if (r.leverage > 1 || r.inverse) assert.equal(r.retirementClass, "SEHR_KOMPLEX", r.symbol);
    if (r.status === "INACTIVE") assert.equal(r.layer, "ARCHIVE");
  }
  assert.equal(index.counts.listings, rows.length);
});

test("Detaildateien: Provenienz, Taxonomie, keine TER/ISIN ohne Quelle, Holdings ehrlich", () => {
  for (const r of rows) {
    const d = read("data/etf/" + r.slug + ".json");
    assert.equal(d.symbol, r.symbol);
    assert.equal(d.ter, null); assert.equal(d.isin, null);
    assert.ok(["AVAILABLE", "NOT_IN_NPORT", "NOT_APPLICABLE"].includes(d.holdings.status), r.symbol + " " + d.holdings.status);
    if (d.holdings.status === "AVAILABLE") {
      assert.equal(d.holdings.source, "SEC_NPORT", r.symbol);
      assert.ok(existsSync(new URL("." + d.holdings.path.replace("/vorsorge", ""), root)), d.holdings.path);
    } else assert.ok(d.holdings.reason, r.symbol);
    assert.ok(["AVAILABLE", "PLACEHOLDER_ONLY", "SOURCE_NOT_CONNECTED"].includes(d.costs.status), r.symbol);
    if (d.costs.basis === "MANAGEMENT_FEE_ONLY") assert.equal(d.costs.value, null, r.symbol);
    if (d.costs.status === "AVAILABLE") assert.ok(d.costs.basis && (d.costs.value === null || (d.costs.value >= 0 && d.costs.value < 0.1)), r.symbol);
    else assert.equal(d.costs.value, null, r.symbol);
    for (const k of ["source", "sourceId", "asOf", "classificationMethod", "classificationConfidence", "coverage", "missingFields", "canonicalizationMethod"]) assert.ok(k in d.provenance, k);
    if (d.metrics) assert.ok(d.metrics.basis === "PRICE_RETURN");
    if (d.metricsTotal) assert.equal(d.metricsTotal.basis, "TOTAL_RETURN");
    if (d.seriesPath) assert.ok(existsSync(new URL("." + d.seriesPath.replace("/vorsorge", ""), root)), d.seriesPath);
  }
});

test("Reihen: dekodierbar, positiv, aufsteigend", () => {
  const files = readdirSync(new URL("data/series/", root));
  for (const f of files.slice(0, 80)) {
    const s = read("data/series/" + f);
    for (const part of [s.price.daily, s.price.weekly].concat(s.total ? [s.total.weekly] : [])) {
      const pts = Codec.decode(part);
      for (let i = 0; i < pts.length; i++) { assert.ok(pts[i][1] > 0, f); if (i) assert.ok(pts[i][0] > pts[i - 1][0], f); }
    }
  }
});

test("Data-QA, UCITS-Report und Lückenmatrix sind vollständig", () => {
  const q = read("data/quality.json");
  for (const k of ["ingest", "layers", "counts", "priceCoverage", "metadataCoverage", "duplicates", "conflicts", "productTypes", "retirementClasses", "currencies", "exchanges"]) assert.ok(k in q, k);
  const u = read("data/ucits-coverage.json");
  assert.ok(typeof u.listingsOnEuropeanExchanges === "number" && typeof u.isinAvailable === "number");
  const g = read("data/data-gaps.json");
  for (const f of ["US-Kurse", "ISIN (EU)", "WKN", "Kostenquote (US)", "US-Holdings", "UCITS-Holdings", "UCITS-Status", "Tracking Difference"]) assert.ok(g.fields.some((x) => x.field === f), f);
  for (const x of g.fields) assert.ok(x.primarySource && "coverage" in x && x.gap, x.field);
});

test("SEO-Seiten nur für das Public Analysis Universe, mit Disclaimer und Sitemap", () => {
  const pages = existsSync(new URL("etf/", root)) ? readdirSync(new URL("etf/", root)) : [];
  const pub = new Set(rows.filter((r) => r.layer === "PUBLIC_ANALYSIS").map((r) => r.slug));
  for (const p of pages) assert.ok(pub.has(p), p + " ist nicht öffentlich");
  for (const p of pages.slice(0, 10)) assert.match(readFileSync(new URL("etf/" + p + "/index.html", root), "utf8"), /keine individuelle Anlage-, Steuer- oder Rechtsberatung/);
  const sm = readFileSync(new URL("sitemap.xml", root), "utf8");
  assert.equal((sm.match(/<url>/g) || []).length, pages.length + 1);
});

test("Anbieter- und Strategiemodell-Daten: kein Fake", () => {
  const p = read("data/providers.json");
  for (const x of p.providers) assert.ok(x.source && x.sourceDate && x.verified !== undefined);
  const mp = read("data/model-portfolios.json");
  for (const pf of mp.portfolios) assert.ok(Math.abs(pf.positions.reduce((a, x) => a + x.weight, 0) - 1) < 1e-9, pf.id);
  assert.doesNotMatch(JSON.stringify(mp), /empfohlen|kaufen|bestes/i);
});
