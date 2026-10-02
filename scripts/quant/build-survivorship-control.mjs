#!/usr/bin/env node
/* =========================================================================
   SURVIVORSHIP CONTROL - Inventar delisteter Titel, Identitaetsschutz und
   die private Wochenreihe fuer die Sensitivitaet der Signal-Studie.

   Owner-Programm 02.10.2026, §2-§9. Quellen, nur interne:
     1. Security Master (oeffentlich, 8.021 Zeilen): inaktive Stammaktien
        werden ueber ihre Listing-Kennung klassifiziert, nie ueber das Kuerzel.
     2. Privater Delisting-Abruf (R2, Namensraum tiingo-delisted, Owner-
        Freigabe 01.10.2026 fuer interne Auswertung): Manifest je Listing und
        die Rohreihen ab 2015. Nur Aggregate verlassen den Runner.

   Ausgaben
     quant/data/product/survivorship-control-v1.json   oeffentlich, nur Zaehler,
        Klassen, Kennungen des oeffentlichen Security Masters
     --bundle-out <datei>   runner-privat: Wochenreihen (splitbereinigt und
        Gesamtrendite) der delisteten Listings fuer build-signal-backtest.mjs

   Doppelhistorien (Kuerzelwechsel): endet ein "delistetes" Listing mit
   genau der Kerze (Datum, Schluss, Volumen), die ein heute gelisteter Titel
   an diesem Tag traegt, lebt die Firma unter neuem Kuerzel weiter. Es ist
   dann kein Delisting und wird nur einmal gezaehlt (Klasse F).

   Ausfuehren (Materialisierung):
     node scripts/quant/build-survivorship-control.mjs --work-dir <kanonische Historie> \
       --bundle-out "$RUNNER_TEMP/delisted-weekly.json"
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";
import { weekKey } from "./lib/weekly-total-return.mjs";
import { fromBars } from "./lib/daily-prices.mjs";
import { splitAdjustedCloses } from "../market/publish-discover-series.mjs";
import { splitSegments } from "../supertrader/validation/lib.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(ROOT, "quant/engines/survivorship-control.js"));
const MQ = require(join(ROOT, "quant/engines/market-quality.js"));
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WORK = arg("--work-dir");
const BUNDLE_OUT = arg("--bundle-out");
const OUT = process.env.VU_SURVIVORSHIP_OUT || join(ROOT, "quant/data/product/survivorship-control-v1.json");
export const BUNDLE_VERSION = "delisted-weekly-bundle-1.0.0";
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const t0 = Date.now();
const log = (m) => console.log(`[survivorship +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

/* ---------- 1. Security Master: inaktive Stammaktien ---------- */
function securityMasterInventory() {
  const sm = json("quant/data/market/security-master/us-security-master.json");
  const active = new Set(sm.rows.filter((r) => r.active_status !== "INACTIVE").map((r) => r.ticker));
  const inactive = sm.rows.filter((r) => r.active_status === "INACTIVE" && r.instrument_type === "EQUITY_COMMON");
  const seriesOf = (r) => {
    const f = join(ROOT, "quant/data/market/discover-series-long", (r.baseline_security_id || "ref_" + r.ticker) + ".json");
    if (!existsSync(f)) return null;
    const j = JSON.parse(readFileSync(f, "utf8"));
    return { from: j.points.length ? j.points[0][0] : null, to: j.points.length ? j.points[j.points.length - 1][0] : null };
  };
  const rows = inactive.map((r) => SC.classifyInactiveRow(r, { activeTickers: active, seriesOf }));
  const classes = SC.emptyClasses();
  for (const r of rows) classes[r.cls]++;
  return { source: "quant/data/market/security-master/us-security-master.json", snapshot: sm.generatedAt || null, rowsTotal: sm.rows.length,
    inactiveCommon: rows.length, classes, cik: { mapped: 0, reason: "Die CIK-Zuordnung (quant/data/universe/cik-map.json) gilt dem heutigen Emittenten eines Kürzels; für ein früheres Listing desselben Kürzels wäre sie ein Ticker-Join und wird nicht verwendet." },
    backtestEligible: classes.A + classes.B, rows: rows.map((r) => [r.listingId, r.ticker, r.start, r.end, r.cls, r.reason, r.seriesOwner]),
    columns: ["listingId", "ticker", "start", "end", "class", "reason", "seriesOwner"] };
}

/* ---------- 2. Privater Delisting-Abruf ---------- */
function parseId(id) { const p = String(id).split(":"); return { exchange: p[1], ticker: p[2], start: p[3] }; }

async function delistedInventory(survivorLastKeys) {
  const need = ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"];
  if (need.some((k) => !process.env[k])) return { available: false, reason: "R2_UNAVAILABLE" };
  const Store = require(join(ROOT, "quant/engines/history-store.js"));
  const Guard = require(join(ROOT, "quant/engines/zero-cost-guard.js"));
  const { createS3DriverFromEnv } = await import(join(ROOT, "scripts/market/storage/s3-driver.mjs"));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 20, classBOperations: 12000 });
  const mine = Store.createHistoryStore({ driver, provider: "tiingo-delisted", market: "US", budget });
  const main = Store.createHistoryStore({ driver, provider: "tiingo", market: "US", budget });
  const u = await mine.readUsage(), v = await main.readUsage();
  const verdict = Guard.evaluate({ usage: Guard.applyUsage(v, { classAOperations: u.classAOperations, classBOperations: u.classBOperations }),
    estimate: Guard.estimateOperations({ kind: "SURVIVORSHIP_READ", objectReads: 8000, indexWrites: 2 }), operation: "SURVIVORSHIP_READ" });
  log("Zero-Cost-Guard: " + verdict.verdict);
  if (verdict.verdict !== Guard.ALLOWED) return { available: false, reason: "ZERO_COST_GUARD_" + verdict.verdict };
  budget.consumeClassB(1, "GET manifest");
  const mbuf = await driver.get(mine.seriesPrefix + "_validation/manifest.json.gz");
  if (!mbuf) return { available: false, reason: "MANIFEST_MISSING" };
  const manifest = JSON.parse(zlib.gunzipSync(mbuf).toString("utf8"));
  const entries = manifest.entries || {};
  const asOf = (manifest.updatedAt || today).slice(0, 10);

  /* Wochenbuendel: aus dem Cache, solange Manifest und Vertrag gleich sind. */
  const cacheKey = mine.seriesPrefix + "_validation/quant-weekly-bundle-v1.json.gz";
  const stamp = { bundle: BUNDLE_VERSION, contract: MQ.TR_CONTRACT_VERSION, manifestUpdatedAt: manifest.updatedAt || null, tableHash: manifest.tableHash || null };
  let bundle = null;
  budget.consumeClassB(1, "GET bundle cache");
  const cbuf = await driver.get(cacheKey);
  if (cbuf) { const c = JSON.parse(zlib.gunzipSync(cbuf).toString("utf8")); if (JSON.stringify(c.stamp) === JSON.stringify(stamp)) bundle = c; }
  log(bundle ? "Wochenbuendel aus dem Cache" : "Wochenbuendel wird neu gebaut");

  if (!bundle) {
    const listings = [];
    let read = 0;
    for (const [id, e] of Object.entries(entries)) {
      if (!(e.status === "OK" || e.status === "PARTIAL") || e.included === false || id.startsWith("BENCH:")) continue;
      if (!(e.last && SC.classifyFetchedListing(e, { asOf }))) continue;           /* nur beendete Listings */
      const { ticker, start } = parseId(id);
      const s = await mine.getSeries(`${ticker}@${start}`);
      read++;
      if (!s || !Array.isArray(s.bars)) continue;
      const bars = s.bars.map((b) => ({ date: String(b.date).slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0,
        adjustedClose: b.adjustedClose ?? b.adjClose ?? null, dividend: b.dividend ?? 0, splitFactor: b.splitFactor ?? 1 }))
        .filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date));
      const segs = splitSegments(bars);
      segs.forEach((seg, k) => {
        if (seg.length < 30) return;
        const last = seg[seg.length - 1];
        const sa = splitAdjustedCloses(seg);
        const d = fromBars({ ticker, bars: seg });
        const wk = new Map();
        sa.forEach((b, i) => { const key = weekKey(b.date); wk.set(key, [b.close, d.tr ? d.tr[i] : null]); });
        /* Lueckenlose Freitage ab der ersten Woche; Wochen ohne Handel null. */
        const have = [...wk.keys()].sort(), keys = [];
        for (let t = Date.parse(have[0] + "T00:00:00Z"), end = Date.parse(have[have.length - 1] + "T00:00:00Z"); t <= end; t += 7 * 864e5) keys.push(new Date(t).toISOString().slice(0, 10));
        const val = (x, j) => { const v = wk.get(x); return v && v[j] > 0 ? +v[j].toPrecision(7) : null; };
        listings.push({ id: k ? id + "#" + k : id, ticker, cls: e.cls || null, status: e.status, first: seg[0].date, last: last.date,
          segmentEnd: k < segs.length - 1, lastKey: `${last.date}|${last.close}|${last.volume}`,
          tr: d.trVerdict.confirmed ? "TOTAL_RETURN_CONFIRMED" : "TOTAL_RETURN_REJECTED_" + d.trVerdict.reason,
          w0: keys[0], c: keys.map((x) => val(x, 0)), t: d.tr ? keys.map((x) => val(x, 1)) : null });
      });
      if (read % 500 === 0) log(`gelesen ${read}`);
    }
    bundle = { stamp, builtAt: new Date().toISOString(), asOf, listings };
    budget.consumeClassA(1, "PUT bundle cache");
    await driver.put(cacheKey, zlib.gzipSync(Buffer.from(JSON.stringify(bundle))), { contentType: "application/json", contentEncoding: "gzip" });
    log(`Wochenbuendel gebaut: ${listings.length} Abschnitte aus ${read} Reihen`);
  }

  /* Doppelhistorien gegen die heutigen Titel (Datum, Schluss, Volumen). */
  const dup = new Set();
  if (survivorLastKeys) { const hit = survivorLastKeys(new Set(bundle.listings.map((l) => l.lastKey))); for (const l of bundle.listings) if (hit.has(l.lastKey)) dup.add(l.id); }

  const classes = SC.emptyClasses(), statusCount = {}, byEndYear = {}, trCount = {};
  let activeFetched = 0, skippedClass = 0;
  for (const [id, e] of Object.entries(entries)) {
    if (id.startsWith("BENCH:")) continue;
    statusCount[e.status] = (statusCount[e.status] || 0) + 1;
    if (e.status === "SKIPPED_CLASS" || e.included === false) { skippedClass++; continue; }
    const c = SC.classifyFetchedListing({ ...e, duplicateOf: dup.has(id) ? "SURVIVOR" : null }, { asOf });
    if (!c) { activeFetched++; continue; }
    classes[c.cls]++;
    const y = (e.last || e.metaEnd || "").slice(0, 4);
    if (y && (c.cls === "A" || c.cls === "B")) byEndYear[y] = (byEndYear[y] || 0) + 1;
  }
  const usable = bundle.listings.filter((l) => !dup.has(l.id));
  for (const l of usable) trCount[l.tr] = (trCount[l.tr] || 0) + 1;
  const sp = budget.spent;
  const usage = await mine.readUsage();
  await mine.writeUsage(Guard.applyUsage(usage, { classAOperations: sp.classA + 1, classBOperations: sp.classB, run: { at: new Date().toISOString(), kind: "SURVIVORSHIP_READ" } }));
  return { available: true, asOf, manifestUpdatedAt: manifest.updatedAt || null, listingsInManifest: Object.keys(entries).length, statusCount, skippedClass, activeFetched,
    classes, delistedUsable: usable.length, tickerChangeDuplicates: dup.size, totalReturn: trCount, byEndYear,
    window: { from: "2015-01-01", note: "Der Abruf reicht ab 2015; vor 2015/16 führt die Quelle Delistings nur lückenhaft (scripts/supertrader/probe/results-2026-10-01.json)." },
    bundle: { ...bundle, listings: usable } };
}

/* Welche dieser Letzte-Kerze-Schluessel traegt ein heutiger Titel? Ein
   Durchlauf ueber die kanonische Historie; im Speicher stehen nur die
   Schluessel der delisteten Listings. */
function survivorKeyLookup() {
  if (!WORK) return null;
  const dir = join(WORK, "tiingo", "daily");
  if (!existsSync(dir)) return null;
  return (wanted) => {
    const hit = new Set();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try { for (const b of JSON.parse(readFileSync(join(dir, f), "utf8")).bars || []) { const k = `${String(b.date).slice(0, 10)}|${b.close}|${b.volume}`; if (wanted.has(k)) hit.add(k); } } catch { /* unlesbar: kein Abgleich */ }
    }
    log(`Doppelhistorien-Abgleich: ${hit.size} von ${wanted.size} Schluesseln bei heutigen Titeln`);
    return hit;
  };
}

async function main() {
  const sm = securityMasterInventory();
  log(`Security Master: ${sm.inactiveCommon} inaktive Stammaktien, Klassen ${JSON.stringify(sm.classes)}`);
  let fetched;
  try { fetched = await delistedInventory(survivorKeyLookup()); } catch (e) { fetched = { available: false, reason: "R2_READ_FAILED: " + String(e.message || e).slice(0, 120) }; }
  if (fetched.available) log(`Delisting-Abruf: ${fetched.delistedUsable} verwendbar, Klassen ${JSON.stringify(fetched.classes)}, Doppelhistorien ${fetched.tickerChangeDuplicates}`);
  else log(`Delisting-Abruf nicht verfuegbar: ${fetched.reason}`);

  const probe = json("scripts/supertrader/probe/results-2026-10-01.json");
  const endedByYear = probe.delistedListingsByEndYear || {};
  const coverageByYear = fetched.available ? Object.fromEntries(Object.entries(endedByYear).filter(([y]) => y >= "2016").map(([y, n]) => [y, { listedEnded: n, usable: fetched.byEndYear[y] || 0, share: n ? Math.round(((fetched.byEndYear[y] || 0) / n) * 1000) / 1000 : null }])) : null;
  const D = fetched.available ? fetched.classes.D : null;
  const delistedTotal = fetched.available ? Object.values(fetched.classes).reduce((a, b) => a + b, 0) : null;

  if (BUNDLE_OUT && fetched.available) {
    mkdirSync(dirname(BUNDLE_OUT), { recursive: true });
    writeFileSync(BUNDLE_OUT, JSON.stringify({ version: BUNDLE_VERSION, asOf: fetched.asOf, contract: MQ.TR_CONTRACT_VERSION, listings: fetched.bundle.listings }));
    log(`Privates Wochenbuendel: ${fetched.bundle.listings.length} Listings -> ${BUNDLE_OUT}`);
  }
  const out = {
    schemaVersion: "survivorship-control-1.0.0", engineVersion: SC.VERSION, generatedAt: new Date().toISOString(), asOf: today,
    semantics: {
      SURVIVORSHIP_GATE: "Schutz: keine Auswertung ohne Überlebenden-Kontrolle steht über „eingeschränkt“. Ein bestandenes Gate löst das Problem nicht.",
      SURVIVORSHIP_CONTROL: "Historische Nicht-Überlebende sind in der Studie tatsächlich enthalten."
    },
    identityRule: "Eine Kursreihe gehört einem Listing nur, wenn ihr Zeitraum im Listing-Fenster liegt (Listing-Kennung tiingo:BÖRSE:KÜRZEL:Start). Kein Join über das Kürzel.",
    classes: SC.CLASSES,
    outcome: SC.OUTCOME,
    securityMaster: sm,
    delisted: fetched.available ? { available: true, source: "privater Delisting-Abruf (R2, intern; Owner-Freigabe 01.10.2026)", asOf: fetched.asOf, listingsInManifest: fetched.listingsInManifest,
      statusCount: fetched.statusCount, excludedClass: fetched.skippedClass, activeListings: fetched.activeFetched, delistedListings: delistedTotal, classes: fetched.classes,
      usableForStudy: fetched.delistedUsable, tickerChangeDuplicates: fetched.tickerChangeDuplicates, totalReturn: fetched.totalReturn, window: fetched.window,
      unfetchableReusedShare: delistedTotal ? Math.round((D / delistedTotal) * 1000) / 1000 : null }
      : { available: false, reason: fetched.reason },
    historicalSecurityMasterCoverage: {
      sources: [
        { id: "SECURITY_MASTER_SNAPSHOT", path: "quant/data/market/security-master/us-security-master.json", rows: sm.rowsTotal, inactive: sm.inactiveCommon, snapshots: 1, note: "ein Stand; Listing-Start und -Ende je Zeile" },
        { id: "TIINGO_LISTING_TABLE", path: "privat (R2-Manifest)", rows: fetched.available ? fetched.listingsInManifest : null, from: "2015-01-01", note: "Listings mit Ende ab 2015; volle Liste ist LEGAL_REVIEW_REQUIRED und liegt nicht im Repository" },
        { id: "UNIVERSE_BEFORE_EXPANSION", path: "quant/data/market/security-master/universe-FULL_UNIVERSE.before-expansion.json", snapshots: 1, note: "ein früherer Universumsstand, ohne Delistings" },
        { id: "INDEX_MEMBERSHIP", path: "quant/data/market/index-membership/history", snapshots: 2, note: "zwei Stichtage im September 2026" },
        { id: "CIK_MAP", path: "quant/data/universe/cik-map.json", snapshots: 1, note: "heutige Emittenten; keine historischen CIK-Zuordnungen" }
      ],
      delistedCoverageByEndYear: coverageByYear,
      before2016: "nicht abgedeckt: weder Listing-Tabelle noch Kursreihen delisteter Titel vor 2015",
      plain: "Ab 2016 ist das damalige Universum aus Listing-Fenstern und Kursreihen rekonstruierbar, mit Ausnahme der Alt-Listings später neu vergebener Kürzel. Davor nicht."
    }
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  log(`geschrieben ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
