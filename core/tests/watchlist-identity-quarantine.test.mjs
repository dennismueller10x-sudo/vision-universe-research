/* Core · Watchlist: belegte Ticker-Wiederverwendung (quant/config/ticker-reuse-quarantine.json) in der gemeinsamen Uebersicht
   (scripts/watchlist/build-summary.mjs). Unter dem Ticker handelt heute ein anderes Wertpapier als das Unternehmen, auf das
   Name, Stamm und securityId zeigen: die Zeile bleibt (gespeicherte Eintraege bleiben erklaerbar), traegt aber keinen Namen der
   alten Identitaet und keine Kurs-, Quant-, Technik- oder Supertrader-Werte; jeder Abschnitt nennt IDENTITY_QUARANTINED.
   Fixtures fuer markierte und nicht markierte Kennungen, dazu der echte Bestand. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSummary, splitSummary } from "../../scripts/watchlist/build-summary.mjs";
import { loadTickerReuseQuarantine } from "../../scripts/market/universe-source.mjs";

const require = createRequire(import.meta.url);
const W = require("../watchlist-view.js");
const Identity = require("../identity.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AFTER_RUN = new Date("2026-10-24T12:00:00Z");

const record = ticker => ({
  securityId: Identity.securityIdForTicker(ticker), ticker, action: "IDENTITY_QUARANTINED", finding: "TICKER_REUSED_BY_ETF",
  historicIdentity: { name: "Alte Firma", providerRow: { exchange: "NYSE", assetType: "Stock", priceCurrency: "USD", startDate: "1999-03-31", endDate: "2018-02-26" } },
  currentInstrument: { providerRow: { exchange: "NYSE ARCA", assetType: "ETF", priceCurrency: "USD", startDate: "2025-10-16", endDate: "2026-10-23" } },
  ownSeries: { from: "2025-10-16", to: "2026-10-23" }
});

function fixtureRoot(t, { quarantine = ["OLDC"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vu-wl-iq-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const w = (rel, data, gz) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, gz ? gzipSync(JSON.stringify(data)) : JSON.stringify(data)); };
  cpSync(join(ROOT, "core/registry/domains.json"), join(root, "core/registry/domains.json"));
  cpSync(join(ROOT, "quant/config/market-calendar.json"), join(root, "quant/config/market-calendar.json"));
  if (quarantine) w("quant/config/ticker-reuse-quarantine.json", { schemaVersion: "ticker-reuse-quarantine-1.0.0", records: quarantine.map(record) });
  w("quant/data/universe/master-manifest.json", { asOf: "2026-10-23", generatedAt: "2026-10-23T05:00:00Z", shards: { index: [{ shard: "AC" }, { shard: "OL" }] } });
  const inst = (id, sym, name) => ({ instrumentId: id, symbol: sym, companyName: name, exchange: "NYSE", currency: "USD", active: true,
    delistedAt: null, productEligibility: "ELIGIBLE", masterMemberId: Identity.securityIdForTicker(sym) });
  w("quant/data/universe/instruments/AC.json", { instruments: [inst("vu_aaaaaa000001", "ACME", "Acme Inc.")] });
  w("quant/data/universe/instruments/OL.json", { instruments: [inst("vu_bbbbbb000001", "OLDC", "Alte Firma Inc.")] });
  w("quant/data/product/universe-list-v1.json.gz", { entries: [{ s: "ACME", c: 10, d: "2026-10-23", u: "USD" }, { s: "OLDC", c: 25, d: "2026-10-23", u: "USD" }] }, true);
  w("technical/data/screener-v1.json", { schemaVersion: "vu-technical-screener-1.0.0", asOf: "2026-10-23", generatedFrom: "2026-10-24T02:00:00Z",
    cols: { s: ["ACME", "OLDC"], sid: ["ref_ACME", "ref_OLDC"], asOf: ["2026-10-23", "2026-10-23"], fresh: [true, true], newHigh52w: [true, true],
      "newHigh52w@1W": [true, true], "newHigh52w@1M": [true, true], distHigh52w: [0, 0], relVol: [2.4, 3.1], volSpike: [true, true],
      rsi14: [70, 75], aboveSma200: [true, true], structure: ["BULLISH", "BULLISH"] } });
  w("supertrader/data/registry-core.json", { lifecycle: { labels: { SETUP: "Einstieg vorbereitet" } }, strategies: [
    { strategy_id: "S_OK", strategy_name: "Freigegeben", mode: "LIVE", evidence: { level: "CRITERIA_MET", presentation: "CURRENT", version: "1.0.0" } }] });
  w("supertrader/data/signals-core.json", { asOf: "2026-10-23", bySymbol: {
    ACME: [{ strategyId: "S_OK", id: "S_OK:ACME:2026-10-22:v1.0.0", state: "SETUP" }],
    OLDC: [{ strategyId: "S_OK", id: "S_OK:OLDC:2026-10-22:v1.0.0", state: "SETUP" }] } });
  w("supertrader/data/build.json", { asOf: "2026-10-23", slices: { stock: ["ACME", "OLDC"] } });
  return root;
}

const rowOf = (doc, sym) => { const k = doc.cols.s.indexOf(sym); const r = {}; for (const f of doc.fields) r[f] = doc.cols[f][k]; return r; };

test("Quarantaene: markierte Kennung ohne alten Namen und ohne Kurs, Technik, Supertrader - Grund je Abschnitt", t => {
  const { doc, report } = buildSummary(fixtureRoot(t), { now: AFTER_RUN });
  const r = rowOf(doc, "OLDC");
  assert.equal(r.i, "vu_bbbbbb000001", "Kennung bleibt, gespeicherte Eintraege bleiben erklaerbar");
  assert.equal(r.n, null, "kein Name der alten Identitaet");
  assert.equal(r.act, 1, "Listing-Status unveraendert");
  for (const f of ["c", "cd", "q", "td", "h52", "rv", "rsi", "st", "sts"]) assert.equal(r[f], null, f + " bleibt leer");
  assert.equal(r.stp, 0, "kein Verweis auf die Supertrader-Seite des Tickers");
  assert.deepEqual(r.why, { identity: "IDENTITY_QUARANTINED", price: "IDENTITY_QUARANTINED", technical: "IDENTITY_QUARANTINED", supertrader: "IDENTITY_QUARANTINED" });
  assert.equal(report.withheld["identity:IDENTITY_QUARANTINED"], 1);
  assert.equal(report.withheld["price:IDENTITY_QUARANTINED"], 1);
  assert.deepEqual(Object.keys(doc.sources.master.identityQuarantine).sort(), ["artifact", "reason", "securities", "sha256"]);
  assert.equal(doc.sources.master.identityQuarantine.securities, 1);
  const names = splitSummary(doc).names.cols;
  assert.equal(names.n[names.s.indexOf("OLDC")], null, "auch die Suche zeigt den alten Namen nicht");

  const v = W.view(W.index(doc), { instrumentId: "vu_bbbbbb000001", ticker: "OLDC" }, AFTER_RUN);
  assert.equal(v.name, null);
  for (const s of ["price", "high52", "volume", "trend", "supertrader"]) {
    assert.equal(v[s].state, "UNAVAILABLE", s);
    assert.equal(v[s].reason, "IDENTITY_QUARANTINED", s);
  }
  const agg = W.aggregate([v]);
  assert.deepEqual([agg.validSupertrader, agg.newHighs, agg.volumeSpikes], [0, 0, 0], "zaehlt in keiner Kennzahl");
});

test("Quarantaene: nicht markierte Kennung bleibt unveraendert", t => {
  const flagged = buildSummary(fixtureRoot(t), { now: AFTER_RUN }).doc;
  const none = buildSummary(fixtureRoot(t, { quarantine: [] }), { now: AFTER_RUN }).doc;
  const missing = buildSummary(fixtureRoot(t, { quarantine: null }), { now: AFTER_RUN }).doc;
  assert.deepEqual(rowOf(flagged, "ACME"), rowOf(none, "ACME"));
  assert.deepEqual(rowOf(none, "OLDC"), rowOf(missing, "OLDC"), "ohne Datei gibt es nichts zu markieren");
  const a = rowOf(flagged, "ACME");
  assert.equal(a.n, "Acme Inc.");
  assert.equal(a.c, 10);
  assert.equal(a.h52, true);
  assert.deepEqual(a.sts, [["S_OK", "SETUP", "1.0.0"]]);
  assert.equal(a.why, null);
  const o = rowOf(none, "OLDC");
  assert.equal(o.n, "Alte Firma Inc.");
  assert.equal(o.c, 25);
  assert.equal(missing.sources.master.identityQuarantine, undefined);
  assert.equal(none.withheld["identity:IDENTITY_QUARANTINED"], undefined);
});

test("Quarantaene: fehlerhafte Datei bricht ab statt still nichts zu markieren", t => {
  const root = fixtureRoot(t);
  writeFileSync(join(root, "quant/config/ticker-reuse-quarantine.json"), JSON.stringify({ schemaVersion: "falsch", records: [] }));
  assert.throws(() => buildSummary(root, { now: AFTER_RUN }), /schemaVersion/);
});

test("Quarantaene im echten Bestand: keine markierte Kennung traegt Name, Kurs, Faktoren, Technik oder Supertrader", () => {
  const q = loadTickerReuseQuarantine(ROOT);
  assert.ok(q && q.records.size > 0);
  const doc = buildSummary(ROOT, { now: AFTER_RUN }).doc;
  let seen = 0;
  doc.cols.s.forEach((s, k) => {
    const sid = Identity.securityIdForTicker(s);
    if (!q.records.has(sid)) return;
    seen++;
    for (const f of ["n", "c", "q", "td", "sts"]) assert.equal(doc.cols[f][k], null, s + "." + f);
    assert.equal(doc.cols.why[k].identity, "IDENTITY_QUARANTINED", s);
  });
  assert.ok(seen > 0);
  const nvda = doc.cols.s.indexOf("NVDA");
  assert.ok(doc.cols.n[nvda] && doc.cols.c[nvda] > 0 && doc.cols.q[nvda], "nicht markierte Titel behalten ihre Abschnitte");
});
