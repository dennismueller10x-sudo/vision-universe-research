/* =========================================================================
   VISION UNIVERSE VORSORGE — build-etf-intelligence.mjs  (vorsorge-intel-1.0.0)

   VERDICHTET DIE HOLDINGS-SNAPSHOTS ZU AUSGELIEFERTEN DATEIEN

   Eingang (Arbeitsablage, nicht im Git):
     .market-cache/vorsorge/nport/nport-manifest.json + snapshots/<SERIES>/<asOf>.json
   Nur gelesen: vorsorge/data/sources/sec-sic.json, hedgefonds/data/cusip-map.json,
     quant/data/market/scale/universe-FULL_UNIVERSE.json (VU-Aktienstamm: Ticker, kuratierte Sektoren)

   Ausgabe (im Git, klein, je Fonds lazy geladen):
     vorsorge/data/holdings/<SERIES>.json   aktueller Bestand (Top 100), Exposures und
                                            Konzentration aus ALLEN Positionen, Historie,
                                            Aenderungen (Change Events 1.0) je Snapshot-Paar
     vorsorge/data/holdings/index.json      je Ticker: Serie, Stand, Positionen, Top 10,
                                            Fondsvermoegen, Aenderungszaehler; Feed relevanter
                                            Aenderungen

   Der erste Snapshot eines Fonds ist die Baseline (keine Ereignisse).
   Deterministisch: gleiche Eingaben -> byte-gleiche Ausgaben (kein Zeitstempel ausser den Quelldaten).
   ========================================================================= */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const H = require(join(root, "vorsorge/engines/etf-holdings.js"));
const C = require(join(root, "vorsorge/engines/etf-changes.js"));
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const WORK = arg("--work", join(root, ".market-cache/vorsorge/nport"));
const OUT = arg("--out", join(root, "vorsorge/data/holdings"));
const TOP = Number(arg("--top", "100"));
const VERSION = "vorsorge-intel-1.0.0";

const read = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const manifest = read(join(WORK, "nport-manifest.json"), null);
if (!manifest) { console.error("Kein N-PORT-Manifest in " + WORK + " - zuerst ingest-sec-nport.mjs."); process.exit(1); }

/* ------------------------------------------------ Nachschlagetabellen */
const sic = (read(join(root, "vorsorge/data/sources/sec-sic.json"), { map: {} }).map) || {};
const cusipMap = read(join(root, "hedgefonds/data/cusip-map.json"), {});
const vu = read(join(root, "quant/data/market/scale/universe-FULL_UNIVERSE.json"), { securities: [] });
const vuTickers = new Map(vu.securities.map((s) => [String(s.ticker).toUpperCase(), s]));
function enrich(h) {
  if (!h.holdingTicker && h.holdingCusip && cusipMap[h.holdingCusip] && cusipMap[h.holdingCusip].ticker) { h.holdingTicker = cusipMap[h.holdingCusip].ticker; h.tickerSource = "CUSIP_MAP"; }
  if (h.assetType !== "EQUITY") return;
  const t = h.holdingTicker ? String(h.holdingTicker).toUpperCase().replace(/[ /]/g, ".") : null;
  const s = t && vuTickers.get(t);
  // Nur US-Emittenten ueber den Ticker zuordnen (kein unscharfer Abgleich).
  if (s && (h.country === "US" || !h.country)) { h.vuTicker = s.ticker; h.matchMethod = h.tickerSource === "CUSIP_MAP" ? "CUSIP" : "TICKER_US"; }
  // Sektor einheitlich aus SEC-SIC (kuratierte GICS-Sektoren gibt es im VU-Stamm nur fuer 100 Titel).
  const code = h.vuTicker && sic[h.vuTicker] ? sic[h.vuTicker][0] : t && sic[t] && (h.country === "US" || !h.country) ? sic[t][0] : null;
  const sec = code ? H.sicSector(code) : null;
  if (sec) { h.sector = sec; h.sectorSource = "SEC_SIC"; }
}

/* ------------------------------------------------------- Ausgabe */
const r6 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);
function compactRow(h) { return [h.holdingTicker || null, h.holdingName || null, r6(h.weight), h.country || null, h.sector || null, h.assetType, h.holdingIsin || null, h.holdingCusip || null, h.vuTicker || null]; }
const DN = (() => { try { return new Intl.DisplayNames(["de"], { type: "region" }); } catch { return null; } })();
const countryDe = (k) => { try { return (DN && /^[A-Z]{2}$/.test(k) && DN.of(k)) || k; } catch { return k; } };
/** Erklaerungstexte mit deutschen Bezeichnungen fuer Sektor- und Laenderereignisse. */
function localize(e) {
  if (e.eventType === "SECTOR_WEIGHT_CHANGED") e.explanation = e.explanation.replace(/^[A-Z_]+:/, (H.SECTORS_DE[e.entityName] || e.entityName) + ":");
  if (e.eventType === "COUNTRY_WEIGHT_CHANGED") e.explanation = e.explanation.replace(/^[A-Z]{2}:/, countryDe(e.entityName) + ":");
  return e;
}
/* Auslieferungsformat der Ereignisse: Spalten statt Objekte. Die Meta-Felder (fundId, Snapshots,
   Quelle, Stand) stehen einmal je Datei; eventId wird im Browser deterministisch gleich gebildet. */
const EVENT_FIELDS = ["eventType", "entityId", "entityName", "oldValue", "newValue", "absoluteChange", "importance", "explanation"];
const compactEvent = (e) => EVENT_FIELDS.map((k) => (typeof e[k] === "number" ? Math.round(e[k] * 1e6) / 1e6 : e[k] === undefined ? null : e[k]));
const ROW = ["ticker", "name", "weight", "country", "sector", "assetType", "isin", "cusip", "vuTicker"];
function topList(list, n) { return list.slice(0, n).map((x) => ({ key: x.key, weight: x.weight })); }

if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith(".json")) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });
const index = { schemaVersion: "vu-vorsorge-holdings-index-1.0.0", version: VERSION, source: "SEC_NPORT", sourceType: "REGULATORY",
  license: manifest.license, quarters: manifest.quarters.map((q) => q.quarter), fields: ["series", "asOf", "positions", "top10", "netAssets", "usShare", "changes", "high", "mapped", "effectiveNumber"], bySymbol: {}, feed: [] };
const stats = { series: 0, snapshots: 0, events: 0, eventsByType: {}, mappedShare: [], qualityErrors: 0, qualityWarnings: 0, rows: 0 };

for (const meta of manifest.series) {
  const dir = join(WORK, "snapshots", meta.seriesId);
  if (!existsSync(dir)) continue;
  const snaps = readdirSync(dir).filter((f) => /\.json$/.test(f)).sort().map((f) => read(join(dir, f), null)).filter(Boolean);
  if (!snaps.length) continue;
  // Gleicher Inhalt an neuem Datum ist kein neuer Stand (Idempotenz).
  const uniq = []; for (const s of snaps) { if (uniq.length && uniq[uniq.length - 1].contentHash === s.contentHash) continue; uniq.push(s); }
  const history = [], timeline = [];
  let prev = null, lastDiff = null;
  for (const s of uniq) {
    s.fundId = "sec:" + meta.seriesId;
    s.holdings.forEach(enrich);
    const q = H.qualityGates(s, prev, { today: s.publishedAt || s.asOf });
    stats.qualityErrors += q.errors.length; stats.qualityWarnings += q.warnings.length;
    const conc = H.concentration(s);
    history.push({ asOf: s.asOf, publishedAt: s.publishedAt, netAssets: s.totalNetAssets, positions: conc.positions, top10: conc.top10, contentHash: s.contentHash, quality: q.errors.length ? "ERROR" : q.warnings.length ? "WARN" : "OK", issues: q.errors.concat(q.warnings).slice(0, 6) });
    if (prev && !q.errors.length) {
      const d = C.diffHoldings(prev, s, { detectedAt: s.publishedAt });
      d.events.forEach(localize);
      lastDiff = { from: prev.asOf, to: s.asOf, status: d.status, events: d.events, summary: d.summary };
      d.events.forEach((e) => { stats.eventsByType[e.eventType] = (stats.eventsByType[e.eventType] || 0) + 1; });
      stats.events += d.events.length;
      C.relevant(d.events, 3).forEach((e) => timeline.push({ asOf: e.asOf, type: e.eventType, importance: e.importance, text: e.explanation }));
    }
    if (!q.errors.length) prev = s;
  }
  const cur = prev || uniq[uniq.length - 1];
  const conc = H.concentration(cur), ex = H.exposures(cur);
  const map = (() => { let eq = 0, mw = 0; cur.holdings.forEach((h) => { if (h.assetType === "EQUITY" && h.weight > 0) { eq += h.weight; if (h.vuTicker) mw += h.weight; } }); return { equityWeight: r6(eq), mappedWeight: r6(mw), mappedShareOfEquity: eq ? r6(mw / eq) : null }; })();
  const secW = cur.holdings.reduce((a, h) => a + (h.sector && h.weight > 0 ? h.weight : 0), 0);
  const listed = cur.holdings.filter((h) => h.weight !== null);
  const totalW = listed.reduce((a, h) => a + h.weight, 0);
  // Hebel-/Derivatefonds: Gewichte in % des Nettovermoegens koennen ueber 100 % liegen (Sicherheiten, Swap-Nominale).
  const derivativeHeavy = ex.derivativeGrossWeight > 0.05 || listed.some((h) => h.weight > 1 || h.weight < -0.05) || totalW > 1.3 || totalW < 0.7;
  const file = {
    schemaVersion: "vu-vorsorge-holdings-file-1.0.0", version: VERSION, seriesId: meta.seriesId, seriesName: meta.seriesName, registrant: meta.registrant, registrantCik: meta.cik, seriesLei: meta.lei,
    listings: meta.classes.map((c) => ({ symbol: c.symbol, classId: c.classId, slug: c.slug })),
    source: "SEC_NPORT", sourceType: "REGULATORY", sourceLabel: "SEC Form N-PORT (öffentlicher Teil)", sourceUrl: cur.sourceUrl, accession: cur.accession,
    asOf: cur.asOf, publishedAt: cur.publishedAt, weightBasis: "Anteil am Nettofondsvermögen (NET_ASSETS)", netAssets: cur.totalNetAssets, netAssetsCurrency: "USD", netAssetsLevel: "FUND",
    holdingsCount: cur.holdingsCount, positions: conc.positions, totalWeight: r6(listed.reduce((a, h) => a + h.weight, 0)),
    concentration: conc, derivativeHeavy,
    exposures: { countries: topList(ex.countries, 25), sectors: ex.sectors.map((x) => ({ key: x.key, weight: x.weight })), sectorBasis: "SEC_SIC", sectorCoverage: r6(secW),
      assetTypes: ex.assetTypes, currencies: topList(ex.currencies, 15), cashWeight: ex.cashWeight, derivativeCount: ex.derivativeCount, derivativeGrossWeight: ex.derivativeGrossWeight },
    mapping: map, summary: derivativeHeavy ? "Fonds mit Derivaten bzw. Hebel: " + conc.positions.toLocaleString("de-DE") + " Positionen; Gewichte beziehen sich auf das Nettofondsvermögen und können zusammen deutlich von 100 % abweichen." : H.summary(cur, ex, conc),
    rowFields: ROW, holdings: listed.slice(0, TOP).map(compactRow), holdingsShown: Math.min(TOP, listed.length), shownWeight: r6(listed.slice(0, TOP).reduce((a, h) => a + h.weight, 0)),
    history, changes: lastDiff ? { from: lastDiff.from, to: lastDiff.to, status: lastDiff.status, eventVersion: C.VERSION, eventFields: EVENT_FIELDS,
      events: lastDiff.events.slice(0, 50).map(compactEvent), eventCount: lastDiff.events.length, summary: lastDiff.summary,
      sentence: C.changeSentence(lastDiff.events) } : { status: "BASELINE", events: [], eventCount: 0 },
    timeline: timeline.sort((a, b) => (a.asOf < b.asOf ? 1 : -1)).slice(0, 15).map((t) => [t.asOf, t.type, t.importance, t.text]), timelineFields: ["asOf", "type", "importance", "text"]
  };
  writeFileSync(join(OUT, meta.seriesId + ".json"), JSON.stringify(file));
  stats.series++; stats.snapshots += uniq.length; stats.rows += cur.holdingsCount;
  if (map.mappedShareOfEquity !== null) stats.mappedShare.push(map.mappedShareOfEquity);
  const us = (ex.countries.find((c) => c.key === "US") || {}).weight || 0;
  const evs = lastDiff ? lastDiff.events : [];
  for (const c of meta.classes) {
    index.bySymbol[c.symbol] = [meta.seriesId, cur.asOf, conc.positions, conc.top10, cur.totalNetAssets, r6(us), evs.filter((e) => e.importance !== "LOW").length, evs.filter((e) => e.importance === "HIGH").length, map.mappedShareOfEquity, conc.effectiveNumber];
  }
  C.relevant(evs, 2).filter((e) => e.importance === "HIGH").forEach((e) => index.feed.push({ symbol: meta.classes[0].symbol, series: meta.seriesId, asOf: e.asOf, type: e.eventType, text: e.explanation, aum: cur.totalNetAssets }));
}
index.feed.sort((a, b) => (b.aum || 0) - (a.aum || 0) || (a.symbol < b.symbol ? -1 : 1));
index.feed = index.feed.slice(0, 120);
const ms = stats.mappedShare.slice().sort((a, b) => a - b);
index.stats = { series: stats.series, symbols: Object.keys(index.bySymbol).length, snapshots: stats.snapshots, currentHoldingRows: stats.rows, events: stats.events, eventsByType: stats.eventsByType,
  medianMappedShareOfEquity: ms.length ? ms[Math.floor(ms.length / 2)] : null, qualityErrors: stats.qualityErrors, qualityWarnings: stats.qualityWarnings };
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`Holdings: ${stats.series} Serien, ${index.stats.symbols} Ticker, ${stats.snapshots} Snapshots, ${stats.events} Ereignisse, Zuordnung Median ${index.stats.medianMappedShareOfEquity}`);
