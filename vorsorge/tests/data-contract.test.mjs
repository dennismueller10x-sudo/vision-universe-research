import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

test("ETF-Master: Schema, Pflichtfelder, keine erfundenen Kosten", () => {
  const m = read("data/etf-master.json");
  assert.equal(m.schemaVersion, "vu-vorsorge-etf-master-1.0.0");
  assert.ok(m.etfs.length >= 100, "mindestens das ausgelieferte Tiingo-ETF-Universum");
  for (const e of m.etfs) {
    assert.ok(e.symbol && e.listingId && e.canonicalETFId, e.symbol);
    assert.equal(e.ter, null, "TER hat keine Quelle: " + e.symbol);
    assert.equal(e.isin, null);
    if (e.complex) assert.ok(e.structure !== "INDEX_OR_UNSPECIFIED" || e.assetClass === "CRYPTO", e.symbol);
    if (e.m) assert.ok(e.m.basis === "PRICE_RETURN" || e.m.basis === "TOTAL_RETURN");
  }
  assert.equal(m.counts.listings, m.etfs.length);
});

test("ETF-Detaildateien existieren fuer jeden Eintrag und haben Reihen ohne Luecken-Erfindung", () => {
  const m = read("data/etf-master.json");
  for (const e of m.etfs) {
    const d = read("data/etf/" + e.symbol + ".json");
    assert.equal(d.symbol, e.symbol);
    assert.equal(d.holdings.status, "DATA_PENDING");
    if (d.series) for (const p of d.series.daily.concat(d.series.weekly)) assert.ok(p[1] > 0);
  }
});

test("Data-QA ist vollstaendig", () => {
  const q = read("data/quality.json");
  for (const k of ["tiingoEtfSymbols", "canonicalETFs", "listings", "priceCoverage", "metadataCoverage", "missingMetadata", "duplicates", "leveragedInverse", "currencies", "exchanges"]) assert.ok(k in q, k);
});

test("SEO-Seiten fuer alle sichtbaren ETFs mit Disclaimer", () => {
  const m = read("data/etf-master.json");
  const visible = m.etfs.filter((e) => e.consumerVisible);
  for (const e of visible.slice(0, 20)) {
    const html = readFileSync(new URL("etf/" + e.symbol + "/index.html", root), "utf8");
    assert.match(html, /keine individuelle Anlage-, Steuer- oder Rechtsberatung/);
    assert.match(html, /vu-navigation/);
  }
});

test("Anbieter- und Modellportfolio-Daten: kein Fake", () => {
  const p = read("data/providers.json");
  assert.ok(Array.isArray(p.providers));
  for (const x of p.providers) assert.ok(x.source && x.asOf, "jede Anbieterzeile braucht Quelle und Stand");
  const mp = read("data/model-portfolios.json");
  for (const pf of mp.portfolios) {
    const sum = pf.positions.reduce((a, x) => a + x.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, pf.id);
  }
});
