/* Core · Watchlist: gemeinsame Uebersicht (scripts/watchlist/build-summary.mjs) und Zeilenansicht (core/watchlist-view.js).
   Gegen den echten Bestand und gegen kleine Fixtures fuer die Grenzfaelle: fehlende/gesperrte Daten, Delisting,
   mehrere Listings, Waehrungskonflikt, veraltete Staende, Ereignisse. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSummary, writeSummary, splitSummary, SCHEMA, SHARD_BUDGET } from "../../scripts/watchlist/build-summary.mjs";

const require = createRequire(import.meta.url);
const W = require("../watchlist-view.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AFTER_RUN = new Date("2026-10-24T12:00:00Z");   // Tag nach dem Datenlauf zum 23.10.

const real = buildSummary(ROOT, { now: AFTER_RUN }).doc;
const ix = W.index(real);
const byTicker = t => { const c = real.cols; const k = c.s.findIndex((s, i) => s === t && c.act[i] === 1); return c.i[k]; };

test("Uebersicht aus dem echten Bestand: Schema, Abdeckung, kein Gesamtscore", () => {
  assert.equal(real.schemaVersion, SCHEMA);
  assert.ok(real.count > 7000 && real.cols.i.length === real.count);
  assert.equal(new Set(real.cols.i).size, real.count, "instrumentId eindeutig");
  assert.equal(real.sources.quant.publication.compositeAllowed, false);
  assert.equal(real.sources.quant.publication.rankingAllowed, false);
  for (const f of real.fields) assert.ok(!/composite|rank|quantScore/i.test(f), "kein Gesamtscore- oder Rangfeld: " + f);
  assert.ok(Object.values(real.sources.supertrader.strategies).every(s => s.released === (s.mode === "LIVE" && s.level === "CRITERIA_MET" && s.presentation !== "RESEARCH")));
});

test("NVDA: Kurs, Faktoren mit Stufe, Gesamtscore zurueckgehalten, Supertrader nicht freigegeben", () => {
  const v = W.view(ix, { instrumentId: byTicker("NVDA"), ticker: "NVDA" }, AFTER_RUN);
  assert.equal(v.identity.state, "AVAILABLE");
  assert.deepEqual([v.exchange, v.currency], ["NASDAQ", "USD"]);
  assert.equal(v.price.state, "AVAILABLE");
  assert.equal(v.price.currency, "USD");
  assert.ok(v.price.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(v.price.date));
  assert.equal(v.quant.composite.state, "WITHHELD");
  assert.equal(v.quant.factors.length, 7);
  assert.equal(v.quant.factors.find(f => f.id === "revisions").state, "UNAVAILABLE", "Revisionen sind extern gesperrt");
  assert.ok(v.quant.factors.filter(f => f.state === "AVAILABLE").every(f => typeof f.score === "number" && f.band));
  assert.ok(v.links.some(l => l.href === "/quant/#/aktie/NVDA"));
});

test("Supertrader: Zustaende nur als Forschung, solange keine Strategie freigegeben ist", () => {
  const released = Object.values(real.sources.supertrader.strategies).filter(s => s.released);
  const v = W.view(ix, { instrumentId: byTicker("ESTC") }, AFTER_RUN);
  if (!released.length) {
    assert.equal(v.supertrader.status, "RESEARCH_ONLY");
    assert.match(v.supertrader.label, /Forschung/);
    assert.ok(v.supertrader.entries.length > 0 && v.supertrader.entries.every(e => !e.released));
  }
  const all = real.cols.i.map(id => W.view(ix, { instrumentId: id }, AFTER_RUN));
  const agg = W.aggregate(all);
  if (!released.length) assert.equal(agg.validSupertrader, 0, "keine Eignung ohne Freigabe");
  assert.ok(agg.newHighs >= 0 && agg.total === all.length);
});

test("Veraltete Daten werden ausgewiesen und nicht mitgezaehlt", () => {
  const later = new Date("2026-10-30T12:00:00Z");      // fuenf faellige Handelstage spaeter, kein neuer Lauf
  const ids = real.cols.i.filter((id, k) => real.cols.h52[k] === true && real.cols.tf[k] === 1).slice(0, 3);
  assert.ok(ids.length, "Bestand hat neue Hochs");
  const fresh = ids.map(id => W.view(ix, { instrumentId: id }, AFTER_RUN)), old = ids.map(id => W.view(ix, { instrumentId: id }, later));
  assert.ok(fresh.every(v => v.high52.signal === "NEW_HIGH"));
  assert.ok(old.every(v => v.high52.state === "STALE" && !v.high52.signal));
  assert.ok(old.every(v => v.price.state === "STALE" && v.price.close > 0), "Kurs bleibt sichtbar, aber als veraltet markiert");
  assert.equal(W.aggregate(old).newHighs, 0);
  assert.equal(W.aggregate(old).stale, ids.length);
  // Ein Tag Verzug ist "verzoegert", noch nicht veraltet.
  assert.equal(W.view(ix, { instrumentId: ids[0] }, new Date("2026-10-27T12:00:00Z")).price.freshness.state, "WARN");
});

test("Zwei Listings desselben Tickers: Daten nur am aktiven Listing (BGC)", () => {
  const rows = real.cols.i.map((id, k) => k).filter(k => real.cols.s[k] === "BGC");
  if (rows.length < 2) return;
  const views = rows.map(k => W.view(ix, { instrumentId: real.cols.i[k] }, AFTER_RUN));
  const act = views.filter(v => v.identity.listing === "ACTIVE"), inact = views.filter(v => v.identity.listing === "INACTIVE");
  assert.equal(act.length, 1);
  assert.ok(inact.every(v => v.price.state === "UNAVAILABLE" && v.price.reason === "LISTING_INACTIVE"));
});

test("Unbekannte Kennung und Tickerwechsel", () => {
  const v = W.view(ix, { instrumentId: "vu_ffffffffffffff", ticker: "OLD" }, AFTER_RUN);
  assert.equal(v.identity.state, "UNAVAILABLE");
  assert.equal(v.price.reason, "NOT_IN_UNIVERSE");
  const t = W.view(ix, { instrumentId: byTicker("NVDA"), ticker: "NVDX" }, AFTER_RUN);
  assert.equal(t.identity.tickerChanged, true);
});

test("Suche und Uebernahme alter Browser-Watchlists aufloesen nur aktive, eindeutige Listings", () => {
  assert.equal(ix.search("NVDA", 3)[0].ticker, "NVDA");
  assert.ok(ix.search("nvidia", 5).some(r => r.ticker === "NVDA"));
  assert.equal(ix.resolveTicker("NVDA"), byTicker("NVDA"));
  assert.equal(ix.resolveTicker("DOESNOTEXIST"), null);
});

/* ------------------------------------------------------------- Fixtures */
function fixtureRoot(t, { strategies, signals, priceCurrency = "USD", withTechnical = true, screening = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vu-wl-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const w = (rel, data, gz) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, gz ? gzipSync(JSON.stringify(data)) : JSON.stringify(data)); };
  cpSync(join(ROOT, "core/registry/domains.json"), join(root, "core/registry/domains.json"));
  cpSync(join(ROOT, "quant/config/market-calendar.json"), join(root, "quant/config/market-calendar.json"));
  w("quant/data/universe/master-manifest.json", { asOf: "2026-10-23", generatedAt: "2026-10-23T05:00:00Z", shards: { index: [{ shard: "AC" }, { shard: "DL" }] } });
  const inst = (id, sym, extra) => ({ instrumentId: id, symbol: sym, companyName: sym + " Inc.", exchange: "NYSE", currency: "USD", active: true,
    delistedAt: null, productEligibility: "ELIGIBLE", masterMemberId: "ref_" + sym, ...extra });
  w("quant/data/universe/instruments/AC.json", { instruments: [inst("vu_aaaaaa000001", "ACME"), inst("vu_aaaaaa000002", "ACX")] });
  w("quant/data/universe/instruments/DL.json", { instruments: [inst("vu_dddddd000001", "DLST", { active: false, delistedAt: "2026-05-01" })] });
  w("quant/data/product/universe-list-v1.json.gz", { entries: [{ s: "ACME", c: 10, d: "2026-10-23", u: "USD" }, { s: "ACX", c: 5, d: "2026-10-23", u: priceCurrency },
    { s: "DLST", c: 3, d: "2026-04-30", u: "USD" }] }, true);
  if (withTechnical) w("technical/data/screener-v1.json", { schemaVersion: "vu-technical-screener-1.0.0", asOf: "2026-10-23", generatedFrom: "2026-10-24T02:00:00Z",
    cols: { s: ["ACME", "ACX"], sid: ["ref_ACME", "ref_ACX"], asOf: ["2026-10-23", "2026-10-23"], fresh: [true, true], newHigh52w: [true, false],
      "newHigh52w@1W": [true, true], "newHigh52w@1M": [true, false], distHigh52w: [0, -0.03], relVol: [2.4, 0.9], volSpike: [true, false],
      rsi14: [70, 55], aboveSma200: [true, true], structure: ["BULLISH", "RANGE"] } });
  w("supertrader/data/registry-core.json", { lifecycle: { labels: { SETUP: "Einstieg vorbereitet" } }, strategies: strategies || [
    { strategy_id: "S_OK", strategy_name: "Freigegeben", mode: "LIVE", evidence: { level: "CRITERIA_MET", presentation: "CURRENT", version: "1.0.0" } },
    { strategy_id: "S_RES", strategy_name: "Forschung", mode: "LIVE", evidence: { level: "IN_REVIEW", presentation: "RESEARCH" } }] });
  w("supertrader/data/signals-core.json", { asOf: "2026-10-23", bySymbol: signals || { ACME: [{ strategyId: "S_OK", id: "S_OK:ACME:2026-10-22:v1.0.0", state: "SETUP" }], ACX: [{ strategyId: "S_RES", state: "ACTIVE" }, { strategyId: "S_OK", state: "CLOSED" }] } });
  if (screening) w("quant/data/product/factor-evidence-v1/screening.json.gz", screening, true);
  w("supertrader/data/build.json", { asOf: "2026-10-23", slices: { stock: ["ACME", "ACX"] } });
  return root;
}

test("Fixture: freigegebene Strategie, Forschung, Delisting, fehlende Quant-Quelle", t => {
  const { doc, report } = buildSummary(fixtureRoot(t), { now: AFTER_RUN });
  assert.ok(report.skipped.quant, "fehlende Quant-Quelle wird gemeldet, nicht ersetzt");
  const x = W.index(doc);
  const acme = W.view(x, { instrumentId: "vu_aaaaaa000001" }, AFTER_RUN), acx = W.view(x, { instrumentId: "vu_aaaaaa000002" }, AFTER_RUN);
  const dl = W.view(x, { instrumentId: "vu_dddddd000001" }, AFTER_RUN);
  assert.equal(acme.supertrader.status, "VALID_SIGNAL");
  assert.equal(acx.supertrader.status, "RESEARCH_ONLY", "aktive Modellposition einer Forschungsstrategie ist keine Eignung");
  assert.equal(acx.supertrader.entries.length, 1, "geschlossene Signale sind Geschichte");
  assert.equal(acme.quant.state, "UNAVAILABLE");
  assert.equal(acme.quant.reason, "SOURCE_MISSING");
  assert.equal(acme.high52.signal, "NEW_HIGH");
  assert.equal(acx.high52.signal, "NEAR_HIGH", "Annaeherung ist kein Hoch");
  assert.equal(acme.volume.signal, "SPIKE");
  assert.equal(dl.identity.listing, "INACTIVE");
  assert.equal(dl.price.state, "UNAVAILABLE");
  const agg = W.aggregate([acme, acx, dl]);
  assert.deepEqual([agg.validSupertrader, agg.newHighs, agg.nearHighs, agg.delisted, agg.volumeSpikes], [1, 1, 1, 1, 1]);
  assert.deepEqual(W.group([acme, acx, dl]).map(g => [g.id, g.items.length]), [["validSupertrader", 1], ["nearHigh", 1], ["attention", 1]]);
  assert.deepEqual(W.sort([dl, acx, acme], "relevance").map(v => v.ticker), ["ACME", "ACX", "DLST"]);
  assert.deepEqual(W.filter([acme, acx, dl], { filter: "nearHigh" }).map(v => v.ticker), ["ACME", "ACX"]);
  assert.deepEqual(W.filter([acme, acx, dl], { query: "acx" }).map(v => v.ticker), ["ACX"]);
});

test("Fixture: Waehrung passt nicht zum Listing -> kein Kurs; ohne Technikquelle kein 52W-Signal", t => {
  const { doc } = buildSummary(fixtureRoot(t, { priceCurrency: "EUR", withTechnical: false }), { now: AFTER_RUN });
  const v = W.view(W.index(doc), { instrumentId: "vu_aaaaaa000002" }, AFTER_RUN);
  assert.equal(v.price.state, "UNAVAILABLE");
  assert.equal(v.price.reason, "CURRENCY_MISMATCH");
  assert.equal(v.high52.reason, "SOURCE_MISSING");
});

test("Ereignisse: neues Hoch, neue gueltige Eignung - je Instrument einmal, idempotente eventId", t => {
  const before = buildSummary(fixtureRoot(t, { signals: { ACME: [{ strategyId: "S_RES", state: "SETUP" }] } }), { now: AFTER_RUN }).doc;
  const after = buildSummary(fixtureRoot(t), { now: AFTER_RUN }).doc;
  const k = before.cols.s.indexOf("ACME");
  before.cols.h52[k] = false; before.cols.vs[k] = false; before.cols.dh[k] = -0.02;
  const evs = W.events(before, after, { now: AFTER_RUN });
  const acme = evs.filter(e => e.ticker === "ACME").map(e => e.type + ":" + e.subtype).sort();
  assert.deepEqual(acme, ["PRICE_EVENT:NEW_52W_HIGH", "PRICE_EVENT:VOLUME_SPIKE", "SUPERTRADER_SIGNAL:VALID_SIGNAL"]);
  assert.ok(evs.every(e => e.schemaVersion === "vu-event-1.0.0" && /^ev_[0-9a-f]{16}$/.test(e.eventId) && e.asOf && e.source.ruleVersion));
  assert.deepEqual(W.events(before, after, { now: AFTER_RUN }).map(e => e.eventId), evs.map(e => e.eventId), "deterministisch");
  assert.deepEqual(W.events(after, after, { now: AFTER_RUN }), [], "kein Ereignis ohne Aenderung");
});

test("Auslieferung in Teilen: meta, Scherben je shardKey, Namen; Laden nur der benoetigten Teile", async t => {
  const out = mkdtempSync(join(tmpdir(), "vu-wl-out-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const r = writeSummary({ root: ROOT, out, now: AFTER_RUN });
  assert.ok(r.shards > 500 && r.bytes > 0);
  const read = rel => JSON.parse(readFileSync(join(out, rel), "utf8"));
  const meta = read("meta.json");
  assert.equal(meta.schemaVersion, SCHEMA);
  assert.ok(!meta.cols, "meta ohne Zeilen");
  for (const key of meta.shards) assert.ok(readFileSync(join(out, "rows", key + ".json")).length <= SHARD_BUDGET);
  const fetched = [];
  const fetchJson = async path => { fetched.push(path); return read(path.replace("/core/data/watchlist-summary-v1/", "")); };
  const Id = require("../identity.js");
  const loaded = await W.load(fetchJson, ["NVDA", "BRK-B", "ESTC"].map(Id.shardKey));
  assert.deepEqual(fetched.slice(1).sort(), ["/core/data/watchlist-summary-v1/rows/BR.json", "/core/data/watchlist-summary-v1/rows/ES.json", "/core/data/watchlist-summary-v1/rows/NV.json"]);
  const part = W.index(loaded.doc), whole = ix;
  const id = byTicker("NVDA");
  assert.deepEqual(W.view(part, { instrumentId: id }, AFTER_RUN), W.view(whole, { instrumentId: id }, AFTER_RUN), "Teilansicht = Gesamtansicht");
  // Zusammengesetzt ergeben die Scherben genau den Bestand.
  const all = await W.load(fetchJson, meta.shards, meta);
  assert.equal(all.doc.cols.i.length, real.count);
  const names = W.index(read("names.json"));
  assert.equal(names.resolveTicker("NVDA"), id);
  assert.equal(splitSummary(real).names.cols.i.length, real.count);
});

test("Freigaben: nichts wird durch ein Datenupdate allein gueltig", t => {
  const signals = id => ({ ACME: [{ strategyId: id, id: id + ":ACME:2026-10-22:v1.0.0", state: "ACTIVE" }] });
  const status = (strategies, sig) => {
    const { doc } = buildSummary(fixtureRoot(t, { strategies, signals: sig }), { now: AFTER_RUN });
    return W.view(W.index(doc), { instrumentId: "vu_aaaaaa000001" }, AFTER_RUN).supertrader.status;
  };
  const S = (evidence, mode = "LIVE") => [{ strategy_id: "S", strategy_name: "S", mode, evidence }];
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "CURRENT", version: "1.0.0" }), signals("S")), "VALID_SIGNAL", "Gegenprobe");
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "RESEARCH", version: "1.0.0" }), signals("S")), "RESEARCH_ONLY", "als Forschung dargestellt");
  assert.equal(status(S({ level: "IN_REVIEW", presentation: "CURRENT", version: "1.0.0" }), signals("S")), "RESEARCH_ONLY", "in Pruefung");
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "CURRENT" }), signals("S")), "RESEARCH_ONLY", "ohne benannte Regelversion");
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "CURRENT", version: "1.0.0" }, "MODEL"), signals("S")), "RESEARCH_ONLY", "kein LIVE-Modus");
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "CURRENT", version: "2.0.0" }), signals("S")), "RESEARCH_ONLY", "Signal einer anderen Regelversion");
  assert.equal(status(S({ level: "CRITERIA_MET", presentation: "CURRENT", version: "1.0.0" }), signals("UNBEKANNT")), "NO_SIGNAL", "unbekannte Strategie wird nicht gezeigt");
});

test("Quant: veroeffentlicht die Quelle einen Gesamtscore, faellt der Abschnitt aus statt ihn zu zeigen", t => {
  const screening = { schemaVersion: "factor-evidence-screening-1.0.0", namespace: "quantV2.factorEvidence", fields: ["x"], rows: {},
    publication: { compositeAllowed: true, rankingAllowed: true } };
  const { doc, report } = buildSummary(fixtureRoot(t, { screening }), { now: AFTER_RUN });
  assert.match(report.skipped.quant, /QUANT_PUBLICATION_CHANGED/);
  const v = W.view(W.index(doc), { instrumentId: "vu_aaaaaa000001" }, AFTER_RUN);
  assert.equal(v.quant.state, "UNAVAILABLE");
  assert.ok(!JSON.stringify(v).includes("compositeScore"));
});

test("Lokale Listen: nur lesen, Vereinigung ueber instrumentId, Unklares wird genannt", () => {
  const store = { "vu-discover-watchlist-v1": '["NVDA","AAPL","../x"]', "vu.quant.watchlist.v1": '["AAPL","MSFT","GIBTESNICHT"]',
    "vu2.watchlist.selection.v1": '{"version":"1.0.0","tickers":["NVDA","ESTC"]}' };
  const before = JSON.stringify(store);
  const legacy = W.legacyTickers(k => store[k] ?? null);
  assert.deepEqual(legacy.map(l => l.ticker), ["NVDA", "AAPL", "MSFT", "GIBTESNICHT", "ESTC"]);
  assert.deepEqual(legacy.find(l => l.ticker === "NVDA").sources, ["Discover", "Quant-Watchlist"]);
  const plan = W.planMerge(ix, legacy, [byTicker("MSFT")]);
  assert.deepEqual(plan.add.map(a => a.ticker), ["NVDA", "AAPL", "ESTC"]);
  assert.deepEqual(plan.alreadyPresent, ["MSFT"]);
  assert.deepEqual(plan.unresolved, ["GIBTESNICHT"]);
  assert.equal(JSON.stringify(store), before, "lokale Daten unveraendert");
  assert.deepEqual(W.legacyTickers(() => { throw new Error("SecurityError"); }), [], "gesperrter Speicher");
});

test("Euro-Anzeige nur vorbereitet: EZB-Kurs vom Kursdatum, Listing-Waehrung bleibt massgeblich", () => {
  const v = W.view(ix, { instrumentId: byTicker("NVDA") }, AFTER_RUN);
  assert.equal(v.price.currency, "USD", "Anzeige in Listing-Waehrung");
  const eur = W.inEuro(real, v.price);
  assert.equal(eur.state, "AVAILABLE");
  assert.ok(eur.rateDate <= v.price.date && eur.rate > 0 && Math.abs(eur.value - v.price.close / eur.rate) < 0.01);
  assert.equal(W.inEuro({ sources: {} }, v.price).reason, "NO_FX_RATE", "ohne Kurs kein Euro-Wert");
  assert.equal(W.inEuro({ sources: { fx: { rates: { USD: ["2026-09-01", 1.1] } } } }, v.price).reason, "FX_RATE_NOT_MATCHING_PRICE_DATE");
  assert.equal(W.inEuro(real, { state: "UNAVAILABLE" }).reason, "NO_PRICE");
});
