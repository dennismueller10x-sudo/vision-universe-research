/* Core · Ein Aktienkontext fuer alle Produktwelten (core/stock-context.js, VU3 Stufe 2.1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(ROOT, "core", "stock-context.js"));
const Identity = require(join(ROOT, "core", "identity.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const GLOBAL = json("discover/data/search/GLOBAL.json").entries;
const entry = (region, ticker) => GLOBAL.find((e) => e.region === region && e.ticker === ticker);

test("Identitaet · SAP.DE ist nicht SAP, MRK.DE (Merck KGaA) ist nicht MRK (Merck & Co)", () => {
  const sap = SC.fromSearchEntry(entry("US", "SAP")), sapDe = SC.fromSearchEntry(entry("EUROPE", "SAP.DE"));
  const mrk = SC.fromSearchEntry(entry("US", "MRK")), mrkDe = SC.fromSearchEntry(entry("EUROPE", "MRK.DE"));
  assert.equal(SC.key(sap), "US:ref_SAP");
  assert.equal(SC.key(sapDe), "EUROPE:ref_SAP_DE_XETR");
  assert.equal(sapDe.mic, "XETR");
  assert.equal(SC.sameListing(sap, sapDe), false);
  assert.equal(SC.sameListing(mrk, mrkDe), false);
  assert.equal(SC.sameCompany(mrk, mrkDe), false, "verschiedene Emittenten");
  assert.equal(mrkDe.companyId, "LEI:529900OAREIS0MOPTW25");
  /* Ohne belegte companyId gibt es keine Unternehmensgleichheit ueber das Kuerzel. */
  assert.equal(SC.sameCompany(SC.fromUs("SAP"), SC.fromUs("SAP")), false);
  assert.equal(SC.sameListing(SC.fromUs("SAP"), SC.fromUs("sap")), true);
  /* Navigator-Ziele bleiben getrennt. */
  assert.equal(SC.href(sap, "discover"), "/discover/#/s/US_REAL/SAP");
  assert.equal(SC.href(sapDe, "discover"), "/discover/#/s/EUROPE/ref_SAP_DE_XETR");
  assert.equal(SC.href(mrkDe, "quant"), null, "Quant fuehrt keine europaeischen Listings");
});

test("Identitaet · US-securityId nur ueber core/identity.js, Klassen-Aktien mit Bindestrich", () => {
  assert.equal(SC.fromUs("BRK-B").securityId, Identity.securityIdForTicker("BRK-B"));
  assert.equal(SC.fromUs("brk-b").ticker, "BRK-B");
  assert.equal(SC.href(SC.fromUs("BRK-B"), "supertrader"), "/supertrader/stock/BRK-B/");
  /* Punkt-Formen sind keine US-Kuerzel der Daten: nie still umdeuten (VOD.L waere sonst ref_VOD_L in US). */
  for (const bad of ["", "A B", "TOOLONGTICKER1", "SAP.DE", "MRK.DE", "VOD.L", "BRK.B", "../X", "..", "<x>"]) assert.throws(() => SC.fromUs(bad), /INVALID_US_TICKER/, bad);
  assert.equal(SC.parse("/quant/#/aktie/SAP.DE"), null, "kein stilles SAP-DE");
  assert.equal(SC.parse("/quant/#/aktie/BRK.B"), null, "der Quant-Router faende BRK.B nicht");
  /* href prueft auch von Hand gebaute Objekte. */
  assert.throws(() => SC.href({ region: "US", ticker: ".." }, "supertrader"), /INVALID_CONTEXT/);
  assert.throws(() => SC.href({ region: "EUROPE", securityId: "x" }, "discover"), /INVALID_CONTEXT/);
  /* Ohne CIK kein Unternehmensnachweis. */
  assert.equal(SC.fromUs("XYZ", { companyId: "vu_03d5e12a142812" }).companyId, null);
  assert.equal(SC.fromUs("SAP", { companyId: "iss_cik_0001000184" }).companyId, "iss_cik_0001000184");
});

test("Identitaet · Europa-securityId kommt aus den Daten und muss zu Kuerzel und Boerse passen", () => {
  assert.throws(() => SC.fromEurope({ securityId: "ref_SAP_DE" }), /INVALID_EU_SECURITY_ID/);
  assert.throws(() => SC.fromEurope({ securityId: "ref_SAP_DE_XETR", ticker: "SAP.PA" }), /TICKER_SECURITY_MISMATCH/);
  assert.throws(() => SC.fromEurope({ securityId: "ref_SAP_DE_XETR", mic: "XPAR" }), /MIC_MISMATCH/);
  const m = SC.fromEurope({ securityId: "ref_MAERSK_B_CO_XCSE", ticker: "MAERSK-B.CO" });
  assert.equal(m.mic, "XCSE");
});

test("Bestand · jeder Europa-Katalogeintrag und jeder Suchindex-Eintrag ergibt einen gueltigen, eindeutigen Kontext", () => {
  const catalog = json("discover/data/europe/catalog.json");
  const rows = catalog.securities || catalog.entries;
  assert.ok(rows.length > 100);
  for (const r of rows) {
    const c = SC.fromEurope({ securityId: r.securityId, ticker: r.ticker, companyId: r.companyId, isin: r.isin });
    assert.equal(SC.parse(SC.href(c, "discover")).ctx.securityId, r.securityId);
  }
  const keys = new Set();
  let us = 0, eu = 0;
  for (const e of GLOBAL) {
    const c = SC.fromSearchEntry(e);
    assert.ok(!keys.has(SC.key(c)), "doppelter Listing-Schluessel " + SC.key(c));
    keys.add(SC.key(c));
    /* Der Suchindex verlinkt genau dorthin, wohin der Kontext fuehrt. */
    assert.equal(SC.href(c, "discover"), "/discover/" + e.href, e.ticker);
    if (c.region === "US") us++; else eu++;
  }
  assert.ok(us > 1000 && eu > 100, us + "/" + eu);
});

test("Adressen · Roundtrip href -> parse fuer US, EU, Klassen-Aktie, ETF-Kuerzel", () => {
  const ctxs = [SC.fromUs("PLTR"), SC.fromUs("BRK-B"), SC.fromUs("SPY"), SC.fromUs("SAP"), SC.fromSearchEntry(entry("EUROPE", "SAP.DE")), SC.fromSearchEntry(entry("EUROPE", "MRK.DE"))];
  for (const c of ctxs) for (const p of SC.PRODUCTS) {
    const h = SC.href(c, p);
    if (h == null) continue;
    const r = SC.parse(h);
    assert.ok(r, h);
    assert.equal(r.product, p, h);
    assert.equal(SC.key(r.ctx), SC.key(c), h);
    /* Neu laden: dieselbe Adresse als volle URL liefert dasselbe Ziel. */
    assert.deepEqual(SC.parse("https://research.visionuniverse.de" + h), r);
  }
});

test("Adressen · genau die Formen, die die Produkt-Router lesen", () => {
  const c = SC.fromUs("NVDA");
  assert.deepEqual(SC.PRODUCTS.map((p) => SC.href(c, p)), [
    "/discover/#/s/US_REAL/NVDA", "/quant/#/aktie/NVDA", "/elliott/#/NVDA", "/elliott/#/NVDA?ansicht=profi", "/supertrader/stock/NVDA/", null
  ]);
  /* Altadressen werden erkannt (quant/app/app.js leitet sie auf /elliott/#/<T> um). */
  assert.equal(SC.parse("/quant/#/aktie/NVDA/technik").product, "technik");
  assert.equal(SC.parse("/quant/#/aktie/NVDA/technik?elliott=1").product, "elliott");
  assert.equal(SC.parse("/quant/#/aktie/NVDA/zahlen").product, "quant");
  assert.equal(SC.parse("/quant/#/elliott/NVDA").product, "technik");
  assert.equal(SC.parse("/quant/#/elliott/NVDA?ansicht=profi").product, "elliott");
  assert.equal(SC.parse("/quant/#/aktie/NVDA/technik?ansicht=profi").product, "elliott");
  assert.equal(SC.parse("/quant/#/aktie/NVDA/irgendwas").product, "quant", "der Router zeigt die Aktienseite");
  assert.equal(SC.parse("/supertrader/stock/NVDA/index.html").product, "supertrader");
  assert.equal(SC.parse("/discover/index.html#/s/US_REAL/NVDA").product, "discover");
  assert.equal(SC.parse("/elliott/#/NVDA/").product, "technik");
  for (const bad of ["/discover/#/s/US_REAL/", "/discover/#/s/ASIA/X", "/discover/#/s/EUROPE/SAP.DE", "/quant/#/aktien", "/quant/#/aktie/%E0", "/elliott/#/?welle=3", "/elliott/#//NVDA", "/elliott/#/%4EVDA", "/supertrader/stock/", "/screener/", "", null]) {
    assert.equal(SC.parse(bad), null, String(bad));
  }
});

test("Adressen · jedes US-Kuerzel aus Quant, Technik und Supertrader ist adressierbar", () => {
  const gz = (rel) => JSON.parse(gunzipSync(readFileSync(join(ROOT, rel))));
  const quant = gz("quant/data/product/universe-list-v1.json.gz").entries.map((e) => e.s);
  const technik = gz("quant/data/technical-intelligence/v3/index.json.gz").rows.map((r) => r.t);
  const sup = json("supertrader/data/build.json").slices.stock;
  assert.ok(quant.length > 1000 && technik.length > 1000 && sup.length > 100);
  for (const [p, list] of [["quant", quant], ["technik", technik], ["elliott", technik], ["supertrader", sup]]) {
    for (const s of list) assert.equal(SC.parse(SC.href(SC.fromUs(s), p)).ctx.ticker, s, p + " " + s);
  }
});

test("Verfuegbarkeit · nur mit Nachweis 'available'; ohne Manifest neutral 'unknown'; Fundamental 'planned'", () => {
  const nvda = SC.fromUs("NVDA"), sapDe = SC.fromSearchEntry(entry("EUROPE", "SAP.DE"));
  const none = SC.availability(nvda);
  assert.deepEqual(none.map((m) => m.state), ["unknown", "unknown", "unknown", "unknown", "unknown", "planned"]);
  const manifest = { schema: SC.SCHEMA, modules: {
    discover: { US: ["NVDA"], EUROPE: ["ref_SAP_DE_XETR"] }, quant: { US: ["NVDA"] }, supertrader: { US: new Set(["AAPL"]) }
  } };
  const a = Object.fromEntries(SC.availability(nvda, manifest).map((m) => [m.product, m]));
  assert.equal(a.discover.state, "available");
  assert.equal(a.quant.href, "/quant/#/aktie/NVDA");
  assert.equal(a.supertrader.state, "unavailable");
  assert.equal(a.supertrader.href, null, "kein toter Link");
  assert.equal(a.technik.state, "unknown");
  assert.equal(a.fundamental.state, "planned");
  assert.equal(a.fundamental.href, null);
  const e = Object.fromEntries(SC.availability(sapDe, manifest).map((m) => [m.product, m]));
  assert.equal(e.discover.state, "available");
  assert.equal(e.quant.state, "unavailable");
  assert.equal(e.quant.reason, "REGION_NOT_COVERED");
  /* Fremdes Schema zaehlt nicht als Nachweis. */
  assert.equal(SC.moduleState(nvda, "quant", { schema: "x", modules: manifest.modules }).state, "unknown");
  /* Map: nur true belegt. */
  const m = { schema: SC.SCHEMA, modules: { quant: { US: new Map([["NVDA", false]]) } } };
  assert.equal(SC.moduleState(nvda, "quant", m).state, "unavailable");
  assert.throws(() => SC.href(nvda, "hedgefonds"), /UNKNOWN_PRODUCT/);
});

test("Browser · laedt nach /core/identity.js als VUCore.StockContext, ohne module", () => {
  const sandbox = { URLSearchParams, WeakMap, Set };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(ROOT, "core", "identity.js"), "utf8"), sandbox);
  vm.runInNewContext(readFileSync(join(ROOT, "core", "stock-context.js"), "utf8"), sandbox);
  assert.equal(sandbox.VUCore.StockContext.href(sandbox.VUCore.StockContext.fromUs("NVDA"), "quant"), "/quant/#/aktie/NVDA");
  const bare = { URLSearchParams }; bare.globalThis = bare;
  assert.throws(() => vm.runInNewContext(readFileSync(join(ROOT, "core", "stock-context.js"), "utf8"), bare), /VUCore.Identity fehlt/);
});
