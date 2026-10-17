/* Boersenwert-Vertrag market-cap-1.0.0 (P0 JPM, 05.10.2026).
   JPMorgan stand mit 4.104.933.895 Aktien im Produkt - das ist
   us-gaap:CommonStockSharesIssued (ausgegeben, einschliesslich eigener im
   Bestand) aus dem 10-Q 0001628280-26-054343. Ausstehend waren 2,66 Mrd
   (dei:EntityCommonStockSharesOutstanding, gleiche Einreichung). Die
   SEC-Registry fiel mit Prioritaet 30 auf die ausgegebene Zahl zurueck. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const MarketCap = require("../engines/market-cap.js");
const FactorEvidence = require("../engines/factor-evidence.js");
const registry = JSON.parse(read("quant/config/sec-metric-registry.json"));
const method = JSON.parse(read("quant/methodology/market-cap-v1.json"));

test("Die SEC-Registry kennt fuer shares_outstanding nur ausstehende Aktien", () => {
  const m = registry.metrics.shares_outstanding;
  const concepts = m.concepts.map((c) => c.taxonomy + ":" + c.concept);
  assert.deepEqual(concepts.slice().sort(), MarketCap.OUTSTANDING_CONCEPTS.slice().sort());
  assert.ok(!concepts.includes("us-gaap:CommonStockSharesIssued"), "ausgegebene Aktien als Rueckfall");
  assert.match(m.excludedConcepts["us-gaap:CommonStockSharesIssued"], /einschliesslich eigener/);
  assert.equal(registry.mapping_version, "1.9.0", "Mapping-Aenderung ohne Versionssprung (1.7.0: Fundamental-Audit E1/E2; 1.8.0: Revenues als Gesamtbetrag, E2-R; 1.9.0: gewichtete Aktien nicht additiv, E12)");
});

test("Methodik, Engine und Registry sagen dasselbe", () => {
  assert.equal(method.methodologyVersion, MarketCap.VERSION);
  assert.deepEqual(method.shareCount.accepted, MarketCap.OUTSTANDING_CONCEPTS);
  assert.ok(method.shareCount.excluded["us-gaap:CommonStockSharesIssued"]);
  for (const r of Object.keys(MarketCap.REASONS)) assert.ok(method.withheld[r], "Grund ohne Methodik: " + r);
  assert.equal(MarketCap.isOutstanding("us-gaap:CommonStockSharesIssued"), false);
  assert.equal(MarketCap.isOutstanding("dei:EntityCommonStockSharesOutstanding"), true);
});

test("Der Faktorbau haelt einen Boersenwert aus ausgegebenen Aktien zurueck - mit Grund, ohne Ersatz", () => {
  const b = read("scripts/quant/build-factor-evidence.mjs");
  assert.match(b, /const ausstehend = !sharesConcept \|\| MarketCap\.OUTSTANDING_CONCEPTS\.includes\(sharesConcept\)/);
  assert.match(b, /const marketCap = shares && quote && zuordenbar && ausstehend && gleicheWaehrung \? shares\.value \* quote\.close : null;/);
  assert.match(b, /!ausstehend \? "SHARE_COUNT_NOT_OUTSTANDING"/);
  assert.match(b, /MARKET_CAP_WITHHELD = \["SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING", "SHARE_COUNT_NOT_OUTSTANDING", "REPORTING_CURRENCY_NOT_LISTING_CURRENCY"\]/);
  /* Die Bewertung nennt den Grund, statt "Eingabe nicht materialisiert". */
  assert.match(b, /MARKET_CAP_WITHHELD\.includes\(record\.fundamentals\?\.marketCapReason\)/);
});

test("Jeder Grund hat einen Satz - in Engine, Ansicht und Dienst", () => {
  assert.ok(FactorEvidence.REASONS ? FactorEvidence.REASONS.includes("SHARE_COUNT_NOT_OUTSTANDING") : read("quant/engines/factor-evidence.js").includes('"SHARE_COUNT_NOT_OUTSTANDING"'));
  const fe = read("quant/engines/factor-evidence.js"), vm = read("quant/app/view-model.js"), svc = read("quant/api/product-services.js");
  assert.match(fe, /SHARE_COUNT_NOT_OUTSTANDING: "Gemeldet ist nur die Zahl ausgegebener Aktien/);
  assert.match(fe, /SHARE_COUNT_NOT_OUTSTANDING: "Bewertung bewusst zurückgehalten"/);
  assert.match(vm, /SHARE_COUNT_NOT_OUTSTANDING: "Diese Kennzahl braucht den Börsenwert\./);
  assert.match(svc, /VALUATION_WITHHELD_REASONS=\['SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING','SHARE_COUNT_NOT_OUTSTANDING','REPORTING_CURRENCY_NOT_LISTING_CURRENCY'\]/);
  for (const t of Object.values(MarketCap.REASONS)) assert.doesNotMatch(t, /\b(laesst|fuer|waere|ueber|gemaess)\b/, "Umschrift statt Umlaut im Nutzertext");
});

test("Die Konsumschicht nennt das Konzept des juengsten Werts und je Kennzahl die verwendeten Konzepte", () => {
  const c = read("scripts/quant/sec/consumer.py");
  assert.match(c, /row\["concept"\] = concept/);
  assert.match(c, /"conceptsUsed": \{metric: sorted\(values\)/);
  const audit = read("scripts/quant/audit-share-count-provenance.mjs");
  assert.match(audit, /SHARE_COUNT_PROVENANCE_AUDIT/);
  assert.match(audit, /latestIssued === 0 && universum\.seriesWithIssued === 0/);
});

test("Radar: eine schon gemeldete Meldung sagt das auf der Karte", () => {
  assert.match(read("scripts/quant/build-quant-radar.mjs"), /trustState: e\.trustState, isNew: e\.isNew,/);
  assert.match(read("quant/app/pages.js"), /first\.isNew === false \? "Bereits gemeldet · " : ""/);
});

/* market-cap-1.1.0 (05.10.2026): CNFinance (CNF) berichtet im 20-F in CNY;
   1.559.576.960 Stammaktien x Kurs des ADS ergaben 3,0 statt 0,36 Mrd $.
   Keine CNF-Regel: die Berichtswaehrung entscheidet, fuer jeden Emittenten. */
test("Gleiche Waehrung: wer nicht in USD berichtet, bekommt keinen Boersenwert", () => {
  const cny = { net_income: "CNY", eps_diluted: "CNY/shares", shares_outstanding: "shares", total_assets: "CNY" };
  const usd = { net_income: "USD", eps_diluted: "USD/shares", shares_outstanding: "shares" };
  assert.equal(MarketCap.reportingCurrency(cny), "CNY");
  assert.equal(MarketCap.sameCurrencyAsListing(cny), false);
  assert.equal(MarketCap.sameCurrencyAsListing(usd), true);
  assert.equal(MarketCap.reportingCurrency({ net_income: "USD", stockholders_equity: "EUR" }), "MIXED");
  assert.equal(MarketCap.sameCurrencyAsListing({ net_income: "USD", stockholders_equity: "EUR" }), false);
  /* Eine Nebenkennzahl ausserhalb der Bewertung sperrt nichts. */
  assert.equal(MarketCap.sameCurrencyAsListing({ net_income: "USD", research_and_development: "AFN" }), true);
  assert.equal(MarketCap.reportingCurrency({ shares_outstanding: "shares" }), null, "ohne Geldkennzahl keine Waehrung");
  assert.equal(MarketCap.sameCurrencyAsListing(undefined), true);
  const b = read("scripts/quant/build-factor-evidence.mjs");
  assert.match(b, /!gleicheWaehrung \? "REPORTING_CURRENCY_NOT_LISTING_CURRENCY"/);
  assert.ok(!/\bCNF\b/.test(b.replace(/\/\*[\s\S]*?\*\//g, "")), "Sonderregel fuer CNF im Code");
  const fe = read("quant/engines/factor-evidence.js"), vm = read("quant/app/view-model.js"), st = read("quant/app/page-stock.js");
  assert.match(fe, /REPORTING_CURRENCY_NOT_LISTING_CURRENCY: "Bewertung bewusst zurückgehalten"/);
  assert.match(vm, /REPORTING_CURRENCY_NOT_LISTING_CURRENCY: "Diese Kennzahl braucht den Börsenwert\./);
  assert.match(st, /m\.reason === "REPORTING_CURRENCY_NOT_LISTING_CURRENCY"/);
  assert.equal(method.currency.listingCurrency, MarketCap.LISTING_CURRENCY);
  assert.equal(method.versionHistory.at(-1).version, MarketCap.VERSION);
});
