/* =========================================================================
   DEBT — Schuldverschreibungen sind keine Stammaktien (02.10.2026)

   Anlass: PRHIZ stand als EQUITY_COMMON/ELIGIBLE im Produktuniversum - aus
   dem Restfall ("Stock", kein Tickermuster). Die Namensschicht
   (TIINGO_METADATA) nennt das Papier "Presurance Holdings Inc Sr Nt", die
   SEC fuehrt unter derselben CIK 0001502292 PRHI als Stammaktie und PRHIZ
   daneben. Ein Senior Note ist Fremdkapital.

   Die Korrektur haengt am NAMEN mit Herkunft, nicht am Ticker: dieselbe
   Regel trifft 21 weitere Baby Bonds (T-Mobile, Trinity, Saratoga, ...).
   Diese Tests halten fest:
     - Der Name, nicht das Symbol, entscheidet (gleicher Ticker, anderer Name).
     - Die Regel ist eng (ein Unternehmen, das "Bond" oder "Notes" heisst,
       bleibt Aktie; ein Anleihen-ETF bleibt ETF).
     - Das ausgelieferte Artefakt fuehrt keine DEBT-Zeile im Produkt, die
       Instrumentensuche findet sie weiter.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { rejudge } from "../../scripts/market/apply-name-layer-class.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const CM = require(join(root, "quant", "engines", "company-master.js"));
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const cls = (name, ticker = "ABCD") => Master.classifySecurity({ ticker, exchange: "NASDAQ", assetType: "Stock", name, currency: "USD", startDate: "2020-01-02" }, { today: "2026-10-02" });

test("DEBT1 · Namen von Schuldverschreibungen ergeben DEBT/EXCLUDED", () => {
  for (const n of ["Presurance Holdings Inc Sr Nt", "T-Mobile US Inc 6.25% Senior Notes due 2069", "Trinity Capital Inc 7.875% Notes due 2029",
                   "Saratoga Investment Corp 6.00% Notes Due 2027", "Example Corp 775 Nts 12012043", "Example Corp Junior Subordinated Debentures"]) {
    const c = cls(n);
    assert.equal(c.instrumentType, "DEBT", n);
    assert.equal(c.classificationStatus, "CLASSIFIED", n);
    const d = Master.decideProductEligibility({ instrumentType: c.instrumentType, classificationStatus: c.classificationStatus, policyBucket: c.policyBucket, eligible: c.eligibleUsEquity === true, reason: c.eligibilityReason });
    assert.equal(d.status, "EXCLUDED", n);
    assert.equal(d.inProductUniverse, false, n);
  }
});

test("DEBT2 · GEGENPROBE: Aktien und Fonds mit Bond/Notes im Namen bleiben, was sie sind", () => {
  for (const n of ["Our Bond, Inc.", "Sticky Notes Holdings Inc", "Apple Inc", "Presurance Holdings Inc", "Bondbloxx Holdings Corp"]) {
    assert.equal(cls(n).instrumentType, "EQUITY_COMMON", n);
  }
  assert.equal(cls("Columbia Core Bond ETF").instrumentType, "ETF");
});

test("DEBT3 · Der Name entscheidet, nicht das Symbol (keine Ticker-Heuristik)", () => {
  /* Dasselbe Symbol PRHIZ mit dem Namen des Emittenten bleibt Stammaktie;
     ein beliebiges Symbol mit dem Anleihenamen wird DEBT. */
  assert.equal(cls("Presurance Holdings Inc", "PRHIZ").instrumentType, "EQUITY_COMMON");
  assert.equal(cls("Presurance Holdings Inc Sr Nt", "QQQX1").instrumentType, "DEBT");
  /* Ohne Namen kein Ausschluss: die Vorsichtsregel bleibt. */
  assert.notEqual(cls(null, "PRHIZ").instrumentType, "DEBT");
});

test("DEBT4 · rejudge: Name mit Herkunft stuft um, Tickerform hat Vorrang, ohne Namen nichts", () => {
  const base = { securityId: "x", ticker: "ABCZ", exchange: "NASDAQ", instrument_type: "EQUITY_COMMON", product_eligibility: "ELIGIBLE",
                 active_status: "ACTIVE", start_date: "2020-01-02", review_flags: ["NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED"] };
  const r = rejudge(base, "Example Corp Sr Nt", { assetType: "Stock" }, ["DEBT"], { today: "2026-10-02" });
  assert.equal(r.instrument_type, "DEBT"); assert.equal(r.product_eligibility, "EXCLUDED");
  assert.ok(r.review_flags.includes("NAME_LAYER_RECLASSIFIED:EQUITY_COMMON"));
  assert.ok(!r.review_flags.includes("NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED"));
  assert.equal(rejudge(base, null, { assetType: "Stock" }, ["DEBT"], { today: "2026-10-02" }), null, "ohne Namen keine Umstufung");
  assert.equal(rejudge(base, "Example Corp", { assetType: "Stock" }, ["DEBT"], { today: "2026-10-02" }), null, "Aktienname bleibt");
  assert.equal(rejudge({ ...base, instrument_type: "PREFERRED" }, "Example Corp Sr Nt", { assetType: "Stock" }, ["DEBT"], { today: "2026-10-02" }), null, "Tickerform vor Name");
  assert.equal(rejudge(base, "Example Corp Sr Nt", { assetType: "Stock" }, ["ADR"], { today: "2026-10-02" }), null, "nur die freigegebenen Klassen");
});

test("DEBT5 · Katalog: DEBT ist ausgeschlossen und nur ueber den Namen belegbar", () => {
  assert.ok(Master.CLASSES.includes("DEBT"));
  assert.ok(Master.POLICY.EXCLUDE.includes("DEBT"));
  const inst = CM.applyEligibility({ securityType: "COMMON_STOCK", screenerEligible: true }, { product_eligibility: "EXCLUDED", instrument_type: "DEBT" });
  assert.equal(inst.screenerEligible, false);
});

const ELIG = "quant/data/market/security-master/eligibility.json";
test("DEBT6 · Ausgeliefert: keine DEBT-Zeile im Produkt, PRHIZ als Instrument auffindbar, Beleg mit Herkunft", { skip: !existsSync(join(root, ELIG)) }, () => {
  const elig = json(ELIG);
  const debt = elig.decisions.filter((d) => d.instrument_type === "DEBT");
  assert.ok(debt.length >= 1);
  assert.ok(debt.every((d) => d.product_eligibility === "EXCLUDED"));
  const prhiz = elig.decisions.find((d) => d.ticker === "PRHIZ");
  assert.equal(prhiz.instrument_type, "DEBT", "PRHIZ darf nicht wieder Stammaktie werden");
  const recon = json("quant/data/market/security-master/eligibility-reconciliation.json");
  const beleg = recon.changes.find((c) => c.ticker === "PRHIZ" && c.to && c.to.instrumentType === "DEBT");
  assert.ok(beleg && beleg.nameSource && /Sr Nt/.test(beleg.name), "Umstufung ohne Namensbeleg");
  const ids = new Set(debt.map((d) => d.securityId));
  const product = json("quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json");
  assert.equal(product.securities.some((s) => ids.has(s.securityId)), false, "DEBT im Produktuniversum");
  assert.equal(product.actualSize, elig.counts.productUniverse);
  const cap = json("quant/data/universe/market-capability.json");
  assert.equal(cap.members.some((m) => ids.has(m.securityId)), false, "DEBT in der Marktfaehigkeit");
  const shard = json("quant/data/universe/instruments/PR.json").instruments.find((i) => i.symbol === "PRHIZ");
  assert.ok(shard, "PRHIZ muss als Instrument auffindbar bleiben");
  assert.equal(shard.screenerEligible, false);
  assert.equal(shard.productEligibility, "EXCLUDED");
  assert.equal(shard.securityClass, "DEBT");
  const common = json("quant/data/universe/instruments/PR.json").instruments.find((i) => i.symbol === "PRHI");
  if (common) assert.notEqual(common.securityClass, "DEBT", "die Stammaktie des Emittenten bleibt Aktie");
});

test("DEBT7 · Faktorevidenz: Grundgesamtheit ist das Produktuniversum, Anleihen nehmen der Stammaktie nicht den Boersenwert", { skip: !existsSync(join(root, "quant/data/product/factor-evidence-v1/summary.json")) }, async () => {
  const { gunzipSync } = await import("node:zlib");
  const dir = join(root, "quant/data/product/factor-evidence-v1");
  const debt = new Set(json(ELIG).decisions.filter((d) => d.instrument_type === "DEBT").map((d) => d.ticker));
  const zeilen = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json.gz") || f === "screening.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8"));
    for (const [t, row] of Object.entries(shard.securities || {})) zeilen.set(t, row);
  }
  for (const t of debt) assert.equal(zeilen.has(t), false, t + " hat eine Faktorzeile");
  for (const row of zeilen.values()) {
    for (const g of row.issuerListings || []) assert.equal(debt.has(g), false, g + " als Geschwisterzeile einer Aktie");
  }
  /* T-Mobile: die drei Senior Notes standen als Geschwister und nahmen der
     Stammaktie den Boersenwert. */
  const tmus = zeilen.get("TMUS");
  if (tmus && tmus.fundamentalsAsOf) assert.ok(Number.isFinite(tmus.marketCap), "TMUS ohne Boersenwert");
  const summary = json("quant/data/product/factor-evidence-v1/summary.json");
  const cov = summary.coverage || summary.counts || {};
  assert.equal(cov.productUniverse, json("quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json").actualSize);
});
