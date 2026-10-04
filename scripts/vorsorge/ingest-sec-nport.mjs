/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-sec-nport.mjs   (vorsorge-nport-1.0.0)

   US-ETF-HOLDINGS AUS SEC FORM N-PORT (Quartals-Datasets der SEC, DERA)

   Quelle: https://www.sec.gov/files/dera/data/form-n-port-data-sets/<YYYY>q<N>_nport.zip
   Lizenz: gemeinfrei ("may be copied or further distributed ... without the
   SEC's permission", sec.gov/about/privacy-information). Fair Access:
   deklarierter User-Agent, wenige Anfragen (ein Zip je Quartal).

   Inhalt: nur der oeffentliche Teil der N-PORT-P-Meldungen (Bericht fuer
   den dritten Monat eines Fiskalquartals, oeffentlich ~60 Tage danach).
   Stichtag eines Snapshots = REPORT_DATE (Berichtsdatum des Bestands),
   NICHT das Einreichungsdatum.

   Zuordnung: company_tickers_mf.json (cik, seriesId, classId, symbol) ->
   nur Serien, deren Ticker im Vorsorge-ETF-Index steht. Holdings werden
   je SERIE gemeldet: alle Anteilklassen einer Serie teilen den Bestand;
   NET_ASSETS ist Fondsebene (alle Klassen).

   Ablauf je Quartal (streamend, `unzip -p`):
     SUBMISSION -> FUND_REPORTED_INFO (Serienfilter) -> REGISTRANT ->
     FUND_REPORTED_HOLDING (nur gefilterte Meldungen) -> IDENTIFIERS
   Je Serie und Berichtsdatum gewinnt die zuletzt eingereichte Meldung
   (Korrekturen N-PORT-P/A ersetzen das Original).

   Ausgabe (Arbeitsablage, NICHT im Git): <work>/snapshots/<SERIES>/<asOf>.json
   (kanonische Snapshots, Holdings 2.0) und <work>/nport-manifest.json.
   Der Build (build-etf-intelligence.mjs) verdichtet daraus die
   ausgelieferten Dateien.

   Aufruf (GitHub Actions, Marker [vorsorge-nport]):
     node scripts/vorsorge/ingest-sec-nport.mjs [--quarters 2026q2,2026q1] [--max-quarters 4]
   ========================================================================= */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const H = require(join(root, "vorsorge/engines/etf-holdings.js"));
const F = require(join(root, "vorsorge/engines/etf-fundamentals.js"));
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const WORK = arg("--work", join(root, ".market-cache/vorsorge/nport"));
const UA = process.env.SEC_USER_AGENT || "VisionUniverseResearch info@visionuniverse.de";
const MAX_Q = Number(arg("--max-quarters", "4"));
const KEEP_ZIPS = argv.includes("--keep-zips") || !!arg("--local", null);
/* Nachweis ohne Netz (Tests): --local 2026q2=pfad.zip[,2026q1=pfad2.zip] --mf pfad/company_tickers_mf.json */
const LOCAL = Object.fromEntries(String(arg("--local", "") || "").split(",").filter(Boolean).map((x) => x.split("=")));
const MF_FILE = arg("--mf", null);
const VERSION = "vorsorge-nport-1.0.0";
mkdirSync(join(WORK, "snapshots"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function secFetch(url, opts = {}) {
  for (let a = 1; a <= 5; a++) {
    try {
      const res = await fetch(url, { method: opts.method || "GET", headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(opts.timeout || 600000) });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * a * a); continue; }
      return res;
    } catch (e) { if (a === 5) throw e; await sleep(2000 * a * a); }
  }
  throw new Error("SEC nicht erreichbar: " + url);
}

/* ------------------------------------------------- Universum + Zuordnung */
function readIndexSymbols() {
  const rows = [];
  for (const f of ["etf-index.json", "etf-index-extra.json"]) {
    const p = join(root, "vorsorge/data", f);
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const si = j.fields.indexOf("symbol"), ei = j.fields.indexOf("exchange"), sl = j.fields.indexOf("slug");
    for (const r of j.rows) rows.push({ symbol: r[si], exchange: r[ei], slug: r[sl] });
  }
  return rows;
}
const US_EX = /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT|NMFQS)$/i;

/* --------------------------------------------------------- Quartale */
function quarterList() {
  if (Object.keys(LOCAL).length) return Object.keys(LOCAL).sort().reverse();
  const given = arg("--quarters", null);
  if (given) return given.split(",").map((s) => s.trim()).filter(Boolean);
  const now = new Date(); let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3) + 1;
  const out = [];
  for (let i = 0; i < MAX_Q + 2; i++) { out.push(y + "q" + q); q--; if (q === 0) { q = 4; y--; } }
  return out;
}

/* ----------------------------------------------------- TSV streamen */
function streamTsv(zipPath, member, onRow) {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "pipe"] });
    const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
    let header = null, n = 0, err = "";
    p.stderr.on("data", (d) => { err += d; });
    rl.on("line", (line) => {
      if (!header) { header = line.replace(/^﻿/, "").split("\t").map((h) => h.trim().toUpperCase()); return; }
      if (!line) return;
      const cols = line.split("\t"); const o = {};
      for (let i = 0; i < header.length; i++) o[header[i]] = cols[i] === undefined || cols[i] === "" ? null : cols[i];
      n++; onRow(o);
    });
    rl.on("close", () => { p.on("close", (code) => (code === 0 || n > 0 ? resolve({ rows: n, header }) : reject(new Error(member + ": unzip " + code + " " + err.slice(0, 200))))); });
    p.on("error", reject);
  });
}
function listMembers(zipPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-Z1", zipPath]); let out = "";
    p.stdout.on("data", (d) => { out += d; }); p.on("close", (c) => (c === 0 ? resolve(out.split("\n").filter(Boolean)) : reject(new Error("unzip -Z1 " + c))));
  });
}

/* ------------------------------------------------------------- Lauf */
const t0 = Date.now();
const universe = readIndexSymbols().filter((r) => US_EX.test(r.exchange || ""));
const bySymbol = new Map(universe.map((r) => [r.symbol.toUpperCase(), r]));
console.log(`Vorsorge N-PORT (${VERSION}) — ${universe.length} US-Listings im Index`);

let mf;
if (MF_FILE) mf = JSON.parse(readFileSync(MF_FILE, "utf8"));
else {
  const mfRes = await secFetch("https://www.sec.gov/files/company_tickers_mf.json");
  if (!mfRes.ok) throw new Error("company_tickers_mf.json HTTP " + mfRes.status);
  mf = await mfRes.json();
}
const fi = Object.fromEntries(mf.fields.map((f, i) => [f, i]));
const seriesInfo = new Map();      // seriesId -> { cik, classes: [{classId, symbol, slug}] }
for (const row of mf.data) {
  const sym = String(row[fi.symbol] || "").toUpperCase(), series = row[fi.seriesId];
  if (!series || !bySymbol.has(sym)) continue;
  const s = seriesInfo.get(series) || { cik: row[fi.cik], seriesId: series, classes: [] };
  s.classes.push({ classId: row[fi.classId], symbol: sym, slug: bySymbol.get(sym).slug });
  seriesInfo.set(series, s);
}
console.log(`  company_tickers_mf: ${mf.data.length} Zeilen, ${seriesInfo.size} Serien mit Vorsorge-Ticker`);

const manifest = { schemaVersion: "vu-nport-manifest-1.0.0", version: VERSION, generatedAt: new Date().toISOString(), source: "SEC Form N-PORT Data Sets (DERA)",
  license: "U.S. government work, public domain; sec.gov: may be copied or further distributed without the SEC's permission",
  universeUsListings: universe.length, seriesMatched: seriesInfo.size, quarters: [], snapshots: 0, failures: [] };
const seriesMeta = {};

let done = 0;
for (const q of quarterList()) {
  if (done >= MAX_Q) break;
  const url = `https://www.sec.gov/files/dera/data/form-n-port-data-sets/${q}_nport.zip`;
  const zipPath = LOCAL[q] || join(WORK, q + "_nport.zip");
  if (Object.keys(LOCAL).length && !LOCAL[q]) continue;
  if (!LOCAL[q] && (!existsSync(zipPath) || statSync(zipPath).size < 1e6)) {
    const head = await secFetch(url, { method: "HEAD", timeout: 60000 });
    if (head.status !== 200) { console.log(`  ${q}: nicht veroeffentlicht (HTTP ${head.status})`); continue; }
    const res = await secFetch(url);
    if (!res.ok) { manifest.failures.push({ quarter: q, status: res.status }); continue; }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  }
  const tq = Date.now();
  const members = await listMembers(zipPath);
  const m = (name) => members.find((x) => x.toUpperCase().replace(/^.*\//, "") === name + ".TSV");
  // 1. Einreichungen
  const subs = new Map();
  await streamTsv(zipPath, m("SUBMISSION"), (r) => subs.set(r.ACCESSION_NUMBER, { filingDate: F.isoDate(r.FILING_DATE), reportDate: F.isoDate(r.REPORT_DATE), periodEnd: F.isoDate(r.REPORT_ENDING_PERIOD), subType: r.SUB_TYPE }));
  // 2. Fondsangaben, Serienfilter
  const keep = new Map();   // accession -> info
  await streamTsv(zipPath, m("FUND_REPORTED_INFO"), (r) => {
    if (!seriesInfo.has(r.SERIES_ID)) return;
    const s = subs.get(r.ACCESSION_NUMBER) || {};
    keep.set(r.ACCESSION_NUMBER, { accession: r.ACCESSION_NUMBER, seriesId: r.SERIES_ID, seriesName: r.SERIES_NAME, seriesLei: r.SERIES_LEI,
      netAssets: H.parseNumber(r.NET_ASSETS), totalAssets: H.parseNumber(r.TOTAL_ASSETS), ...s });
  });
  // 3. Je Serie + Berichtsdatum nur die letzte Meldung
  const chosen = new Map();
  for (const k of keep.values()) {
    if (!k.reportDate) continue;
    const key = k.seriesId + "@" + k.reportDate, cur = chosen.get(key);
    if (!cur || (k.filingDate || "") > (cur.filingDate || "") || ((k.filingDate || "") === (cur.filingDate || "") && /A$/.test(k.subType || "") && !/A$/.test(cur.subType || ""))) chosen.set(key, k);
  }
  const acc = new Map([...chosen.values()].map((k) => [k.accession, k]));
  const regs = new Map();
  await streamTsv(zipPath, m("REGISTRANT"), (r) => { if (acc.has(r.ACCESSION_NUMBER)) regs.set(r.ACCESSION_NUMBER, { cik: r.CIK, name: r.REGISTRANT_NAME, lei: r.LEI }); });
  // 4. Holdings
  const rowsByAcc = new Map(), holdingAcc = new Map();
  let hRows = 0;
  await streamTsv(zipPath, m("FUND_REPORTED_HOLDING"), (r) => {
    if (!acc.has(r.ACCESSION_NUMBER)) return;
    const rate = H.parseNumber(r.EXCHANGE_RATE), val = H.parseNumber(r.CURRENCY_VALUE);
    const usd = val === null ? null : r.CURRENCY_CODE === "USD" || !rate ? val : val / rate;
    const row = { sourceRowId: r.HOLDING_ID, holdingName: [r.ISSUER_NAME, r.ISSUER_TITLE && r.ISSUER_TITLE !== r.ISSUER_NAME ? r.ISSUER_TITLE : null].filter(Boolean).join(" – ") || null,
      issuerName: r.ISSUER_NAME, holdingCusip: F.cleanId("cusip", r.ISSUER_CUSIP), weight: r.PERCENTAGE, assetType: r.ASSET_CAT || r.OTHER_ASSET, derivativeType: r.DERIVATIVE_CAT,
      marketValue: usd, marketValueCurrency: "USD", shares: r.UNIT === "NS" ? r.BALANCE : null, principal: r.UNIT === "PA" ? r.BALANCE : null, currency: r.CURRENCY_CODE,
      country: r.INVESTMENT_COUNTRY, issuerType: r.ISSUER_TYPE, payoff: r.PAYOFF_PROFILE, issuerLei: r.ISSUER_LEI };
    let list = rowsByAcc.get(r.ACCESSION_NUMBER); if (!list) rowsByAcc.set(r.ACCESSION_NUMBER, (list = []));
    list.push(row); holdingAcc.set(r.HOLDING_ID, row); hRows++;
  });
  // 5. Kennungen (ISIN, Ticker)
  await streamTsv(zipPath, m("IDENTIFIERS"), (r) => {
    const row = holdingAcc.get(r.HOLDING_ID); if (!row) return;
    const isin = F.cleanId("isin", r.IDENTIFIER_ISIN); if (isin && !row.holdingIsin) row.holdingIsin = isin;
    const t = r.IDENTIFIER_TICKER && String(r.IDENTIFIER_TICKER).trim().toUpperCase();
    if (t && t !== "N/A" && /^[A-Z0-9.\-/ ]{1,12}$/.test(t) && !row.holdingTicker) row.holdingTicker = t.replace(/\s+(US|UN|UW|UQ|UA|UP)$/, "");
  });
  // 6. Snapshots schreiben
  let written = 0;
  for (const [a, k] of acc) {
    const rows = rowsByAcc.get(a) || [];
    if (!rows.length) continue;
    const reg = regs.get(a) || {};
    const snap = H.snapshot({ fundId: "sec:" + k.seriesId, symbol: null, asOf: k.reportDate, publishedAt: k.filingDate, retrievedAt: new Date().toISOString(),
      source: "SEC_NPORT", sourceType: "REGULATORY", sourceUrl: `https://www.sec.gov/Archives/edgar/data/${Number(reg.cik || seriesInfo.get(k.seriesId).cik)}/${a.replace(/-/g, "")}/`, weightUnit: "percent",
      totalNetAssets: k.netAssets, currency: "USD" }, rows);
    snap.accession = a; snap.seriesId = k.seriesId; snap.seriesName = k.seriesName; snap.registrant = reg.name || null; snap.registrantCik = reg.cik || null;
    snap.subType = k.subType; snap.quarterDataset = q;
    const dir = join(WORK, "snapshots", k.seriesId); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, k.reportDate + ".json"), JSON.stringify(snap));
    seriesMeta[k.seriesId] = Object.assign(seriesMeta[k.seriesId] || {}, { seriesId: k.seriesId, seriesName: k.seriesName, registrant: reg.name || null, cik: reg.cik || seriesInfo.get(k.seriesId).cik, lei: k.seriesLei || null, classes: seriesInfo.get(k.seriesId).classes });
    written++;
  }
  manifest.quarters.push({ quarter: q, submissions: subs.size, matchedFilings: keep.size, chosenFilings: acc.size, holdingRows: hRows, snapshotsWritten: written, seconds: Math.round((Date.now() - tq) / 1000) });
  manifest.snapshots += written;
  console.log(`  ${q}: ${subs.size} Meldungen, ${keep.size} passend, ${acc.size} gewaehlt, ${hRows} Holdings-Zeilen, ${written} Snapshots (${Math.round((Date.now() - tq) / 1000)} s)`);
  if (!KEEP_ZIPS) rmSync(zipPath, { force: true });
  done++;
}
manifest.series = Object.values(seriesMeta).sort((a, b) => (a.seriesId < b.seriesId ? -1 : 1));
manifest.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(join(WORK, "nport-manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`Fertig: ${manifest.snapshots} Snapshots aus ${manifest.quarters.length} Quartalen, ${manifest.series.length} Serien, ${manifest.seconds} s`);
if (!manifest.quarters.length) process.exit(1);
