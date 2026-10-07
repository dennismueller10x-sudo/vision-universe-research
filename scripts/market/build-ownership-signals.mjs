#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/build-ownership-signals.mjs

   EIGENTUEMER-SIGNALE AUS SEC EDGAR (public domain, kostenlos)

   Statt bezahlter Analystendaten: was Insider und grosse Adressen TUN.

     A) Insider (Form 3/4/5) aus den "Insider Transactions Data Sets"
        https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets
        Quartals-ZIPs (z. B. .../insider-transactions-data-sets/2024q1_form345.zip)
        mit den TSV-Tabellen SUBMISSION, REPORTINGOWNER, NONDERIV_TRANS,
        FOOTNOTES (Spalten u. a. ACCESSION_NUMBER, FILING_DATE, DOCUMENT_TYPE,
        ISSUERCIK, RPTOWNERCIK, RPTOWNER_RELATIONSHIP, TRANS_CODE, TRANS_DATE,
        TRANS_SHARES, TRANS_PRICEPERSHARE, *_FN; seit der Form-4-Novelle 2023
        ggf. AFF10B5ONE). Die Luecke zwischen dem letzten veroeffentlichten
        Quartal und heute wird aus den Form-4-Einreichungen selbst gefuellt
        (EDGAR full-index -> Archives/edgar/data/<CIK>/<Accession>.txt,
        ownershipDocument-XML), gecacht je Accession.
     B) Schedule 13D/13G aus dem EDGAR full-index
        https://www.sec.gov/Archives/edgar/full-index/YYYY/QTRn/master.gz
        (Formulare "SC 13D", "SC 13G", "/A" und seit 18.12.2024
        "SCHEDULE 13D", "SCHEDULE 13G").
        Form 13F aus den "Form 13F Data Sets"
        https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets
        (SUBMISSION, COVERPAGE, INFOTABLE). Wertangabe VALUE: bis 02.01.2023
        in Tausend Dollar, ab 03.01.2023 in Dollar (Einreichungsdatum) -
        siehe quant/engines/ownership-signals.js#thirteenFValueUnit.
        CUSIP -> Ticker aus den "Fails-to-Deliver Data" der SEC
        https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data
        (cnsfailsYYYYMM[a|b].zip: SETTLEMENT DATE|CUSIP|SYMBOL|...). Der
        Kursspalte dieser Dateien wird nichts entnommen.

   ZEITPUNKT: alles nach Einreichungsdatum (filing date). Monatliche
   Schnappschuesse ab --since (Standard 2016-01) bis zum letzten
   abgeschlossenen Monat, dazu der aktuelle Stand.

   SEC FAIR ACCESS: sich ausweisender User-Agent (SEC_USER_AGENT, wie
   scripts/quant/sec/http_client.py; Standard "VisionUniverseResearch
   info@visionuniverse.de"), Token-Bucket unter 10 Anfragen/s
   (SEC_RATE, Standard 6/s), Rueckzug bei 403/429/503.

   Ausgabe (quant/data/product/ownership-signals-v1/):
     manifest.json            Herkunft, Abdeckung, Methodik, Grenzen
     highlights.json          aktuelle Auffaelligkeiten (Cluster-Kaeufe, neue 13D, ...)
     current/<SHARD>.json.gz  aktueller Stand je Ticker (Identity.shardKey)
     history/<SHARD>.json.gz  Monatsreihe je Ticker (deterministisch, ohne Zeitstempel)

   Aufruf:
     node scripts/market/build-ownership-signals.mjs [--out DIR] [--cache DIR] [--work DIR]
          [--since 2016-01] [--as-of YYYY-MM-DD] [--form4-max N] [--no-gates]
          [--source-dir DIR --universe-file FILE --consumer-dir DIR]   (offline/Tests)
   ========================================================================= */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gzipSync, gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const E = require(join(ROOT, "quant", "engines", "ownership-signals.js"));
const Identity = require(join(ROOT, "core", "identity.js"));

export const OUT_DIR = "quant/data/product/ownership-signals-v1";
export const SCHEMA = "ownership-signals-1.0.0";
export const SOURCE = "SEC_EDGAR";
export const DEFAULT_UA = "VisionUniverseResearch info@visionuniverse.de";
export const PAGES = {
  insider: "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets",
  thirteenF: "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets",
  ftd: "https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data"
};
export const BASES = {
  insider: "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/",
  thirteenF: "https://www.sec.gov/files/structureddata/data/form-13f-data-sets/",
  ftd: "https://www.sec.gov/files/data/fails-deliver-data/",
  fullIndex: "https://www.sec.gov/Archives/edgar/full-index/",
  archives: "https://www.sec.gov/Archives/"
};
/* Spalten der Monatsreihe - Reihenfolge ist Vertrag (manifest.columns). */
export const HISTORY_COLUMNS = ["ib90", "ib180", "is90", "ibo90", "ibd90", "ibt90", "ibx90", "bv90", "sv90", "svx90", "nbv90", "nbv180",
  "nsh90", "nsp90", "cb", "d13n", "g13n", "d13a", "g13a", "fp", "fh", "fhp", "fnew", "fexit", "finc", "fdec", "fsh", "fshp", "fdsh", "fval", "fio"];
/* Plausibilitaetsgrenzen je Transaktion (Wert, Preis je Aktie). BRK.A notiert
   unter 1 Mio. USD; eine einzelne Insider-Transaktion ueber 20 Mrd. USD gab es nicht. */
export const MAX_TX_USD = 2e10, MAX_PRICE_USD = 1e6;
const INSIDER_COLS = HISTORY_COLUMNS.slice(0, 15), SCHEDULE_COLS = ["d13n", "g13n", "d13a", "g13a"], F_COLS = HISTORY_COLUMNS.slice(19);

/* ------------------------------------------------------------- Optionen */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    if (k.includes("=")) { const [kk, vv] = k.split(/=(.*)/s); o[kk] = vv; continue; }
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) o[k] = true; else { o[k] = n; i++; }
  }
  return o;
}
const log = (...a) => console.log(...a);

/* ---------------------------------------------------------- SEC-Abruf */
export function createSecClient({ userAgent, rate = 6, fetchImpl = globalThis.fetch, unthrottled = false } = {}) {
  const ua = userAgent || DEFAULT_UA;
  if (!/@/.test(ua)) throw new Error("SEC_USER_AGENT braucht eine Kontaktadresse (SEC Fair Access).");
  /* Nie mehr als 9 Anfragen/s (SEC: 10). unthrottled nur fuer Tests mit Attrappe. */
  const interval = unthrottled ? 0 : 1000 / Math.min(Math.max(rate, 0.5), 9);
  let next = 0, requests = 0, bytes = 0;
  const slot = async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + interval;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
  async function request(url) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      await slot();
      requests++;
      let res;
      try { res = await fetchImpl(url, { headers: { "User-Agent": ua, "Accept-Encoding": "gzip, deflate" } }); }
      catch (err) { if (attempt === 6) throw err; await sleep(2000 * attempt); continue; }
      if (res.status === 404) { await res.body?.cancel?.(); return null; }
      if (res.ok) return res;
      await res.body?.cancel?.();
      if ([403, 429, 500, 502, 503, 504].includes(res.status) && attempt < 6) {
        /* 403 heisst bei der SEC meist "Request Rate Threshold Exceeded". */
        await sleep((res.status === 403 || res.status === 429 ? 15000 : 3000) * attempt);
        continue;
      }
      throw new Error("SEC " + res.status + " fuer " + url);
    }
    throw new Error("SEC nicht erreichbar: " + url);
  }
  return {
    get stats() { return { requests, bytes }; },
    async text(url, encoding = "utf8") {
      const res = await request(url);
      if (!res) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      bytes += buf.length;
      return buf.toString(encoding);
    },
    async buffer(url) {
      const res = await request(url);
      if (!res) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      bytes += buf.length;
      return buf;
    },
    async download(url, dest) {
      const res = await request(url);
      if (!res) return null;
      mkdirSync(dirname(dest), { recursive: true });
      const tmp = dest + ".part";
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      renameSync(tmp, dest);
      bytes += statSync(dest).size;
      return dest;
    }
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------- Tabellen lesen */
/** Zeilen einer Tabelle (TSV) aus einem ZIP (System-unzip, gestreamt) oder
 *  einem Verzeichnis (Fixtures). Liefert Arrays von Spalten, erste Zeile
 *  ist der Kopf. */
async function* tableLines(handle, table) {
  let stream, child = null;
  const want = (n) => basename(n).toUpperCase() === (table + ".TSV").toUpperCase() || basename(n).toUpperCase() === (table + ".TXT").toUpperCase();
  if (handle.zip) {
    const members = execFileSync("unzip", ["-Z1", handle.zip], { maxBuffer: 16 * 1024 * 1024 }).toString("utf8").split(/\r?\n/).filter(Boolean);
    const member = table === "*" ? (members.find((m) => /\.(txt|tsv|csv)$/i.test(m)) || members.find((m) => !m.endsWith("/"))) : members.find(want);
    if (!member) return;
    child = spawn("unzip", ["-p", handle.zip, member], { stdio: ["ignore", "pipe", "inherit"] });
    stream = child.stdout;
  } else if (handle.dir) {
    const f = readdirSync(handle.dir).find(want);
    if (!f) return;
    stream = createReadStream(join(handle.dir, f));
  } else if (handle.file) {
    stream = createReadStream(handle.file);
  } else return;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
  if (child) {
    const code = child.exitCode !== null ? child.exitCode : await new Promise((r) => child.on("close", r));
    if (code !== 0 && code !== null) throw new Error("unzip " + handle.zip + " " + table + ": Exit " + code);
  }
}
const headersSeen = new Set();
async function* tableRows(handle, table) {
  let idx = null;
  for await (const line of tableLines(handle, table)) {
    if (idx === null) {
      idx = E.headerIndex(line);
      /* Einmal je Tabelle die Spalten ins Log: aendert die SEC ein Format, steht es im Lauf. */
      if (!headersSeen.has(table)) { headersSeen.add(table); log(`  Spalten ${table}: ${Object.keys(idx).join(",")}`); }
      yield { header: idx }; continue;
    }
    if (!line) continue;
    yield line.split("\t");
  }
}
const col = (idx, ...names) => { for (const n of names) if (idx[n] !== undefined) return idx[n]; return -1; };
const padCik = (c) => { const d = String(c || "").replace(/\D/g, ""); return d ? d.padStart(10, "0") : null; };

/* ------------------------------------------------------ Quellen-Zugang */
/** Netz (CI) oder Verzeichnis (Tests). Gleiche Schnittstelle. */
function networkSource({ client, work }) {
  const scrape = async (page, re) => {
    const html = await client.text(page);
    if (!html) return [];
    const out = new Set(); let m;
    while ((m = re.exec(html))) out.add(new URL(m[1], page).toString());
    return [...out];
  };
  return {
    kind: "network",
    async listInsider(fromIso, toIso) {
      const found = await scrape(PAGES.insider, /href="([^"]+_form345\.zip)"/gi);
      return mergeCandidates(found, quarterNames(fromIso, toIso, "form345", BASES.insider), fromIso);
    },
    async list13f(fromIso, toIso) {
      const found = await scrape(PAGES.thirteenF, /href="([^"]+_form13f\.zip)"/gi);
      /* Bis 2023 hiessen die Dateien YYYYqN_form13f.zip; seit 2024 gibt es
         rollierende Fenster ("01mar2024-31may2024_form13f.zip") - die kennt
         nur die Seite. Konstruiert wird die Quartalsform (404 = gibt es
         nicht); Ueberschneidungen fallen ueber die Accession-Nummer heraus. */
      return mergeCandidates(found, quarterNames(fromIso, toIso, "form13f", BASES.thirteenF), fromIso);
    },
    async listFtd(fromIso, toIso) {
      const found = await scrape(PAGES.ftd, /href="([^"]*cnsfails\d{6}[ab]?\.zip)"/gi);
      const names = new Map(found.map((u) => [basename(u).toLowerCase(), u]));
      for (let y = +fromIso.slice(0, 4), m = +fromIso.slice(5, 7); `${y}-${String(m).padStart(2, "0")}` <= toIso.slice(0, 7); m === 12 ? (m = 1, y++) : m++) {
        for (const h of ["a", "b"]) {
          const n = `cnsfails${y}${String(m).padStart(2, "0")}${h}.zip`;
          if (!names.has(n)) names.set(n, BASES.ftd + n);
        }
      }
      return [...names.entries()].filter(([n]) => ftdMonth(n) >= fromIso.slice(0, 7)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name, url]) => ({ name, url }));
    },
    async fetchDataset(item, kind) {
      const dest = join(work, kind, item.name);
      if (existsSync(dest)) return { zip: dest };
      const ok = await client.download(item.url, dest);
      return ok ? { zip: dest } : null;
    },
    release(handle) { if (handle && handle.zip) rmSync(handle.zip, { force: true }); },
    async masterIndex(year, q) {
      for (const f of ["master.gz", "master.idx"]) {
        const buf = await client.buffer(`${BASES.fullIndex}${year}/QTR${q}/${f}`);
        if (!buf) continue;
        const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
        return raw.toString("latin1");
      }
      return null;
    },
    async filing(path) { return client.text(BASES.archives + path, "utf8"); }
  };
}
function directorySource(dir) {
  const byWindow = (a, b) => { const wa = E.datasetWindow(a), wb = E.datasetWindow(b); return wa && wb && wa.start !== wb.start ? (wa.start < wb.start ? -1 : 1) : (a < b ? -1 : 1); };
  const list = (sub) => existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)).sort(byWindow) : [];
  return {
    kind: "directory",
    async listInsider() { return list("insider").map((n) => ({ name: n, url: "file:" + n })); },
    async list13f() { return list("13f").map((n) => ({ name: n, url: "file:" + n })); },
    async listFtd() { return list("ftd").map((n) => ({ name: n, url: "file:" + n })); },
    async fetchDataset(item, kind) {
      const p = join(dir, kind, item.name);
      if (!existsSync(p)) return null;
      if (statSync(p).isDirectory()) return { dir: p };
      return p.toLowerCase().endsWith(".zip") ? { zip: p } : { file: p };
    },
    release() {},
    async masterIndex(year, q) { const p = join(dir, "index", `${year}-QTR${q}.idx`); return existsSync(p) ? readFileSync(p, "latin1") : null; },
    async filing(path) { const p = join(dir, "filings", basename(path)); return existsSync(p) ? readFileSync(p, "utf8") : null; }
  };
}
function quarterNames(fromIso, toIso, suffix, base) {
  const out = [];
  let { year, q } = E.quarterOf(fromIso);
  while (E.quarterEnd(year, q) <= toIso) {
    out.push({ name: `${year}q${q}_${suffix}.zip`, url: `${base}${year}q${q}_${suffix}.zip` });
    if (++q > 4) { q = 1; year++; }
  }
  return out;
}
function mergeCandidates(foundUrls, constructed, fromIso) {
  const byName = new Map();
  for (const c of constructed) byName.set(c.name.toLowerCase(), c);
  for (const u of foundUrls) byName.set(basename(u).toLowerCase(), { name: basename(u).toLowerCase(), url: u, listed: true });
  return [...byName.values()].filter((c) => { const w = E.datasetWindow(c.name); return w && w.end >= fromIso; })
    .sort((a, b) => (E.datasetWindow(a.name).start < E.datasetWindow(b.name).start ? -1 : 1));
}
function ftdMonth(name) { const m = /cnsfails(\d{4})(\d{2})/.exec(name); return m ? `${m[1]}-${m[2]}` : ""; }

/* ------------------------------------------------------------- Cache */
function cacheRead(cache, rel) {
  const p = join(cache, rel);
  if (!existsSync(p)) return null;
  try { const b = readFileSync(p); return JSON.parse((p.endsWith(".gz") ? gunzipSync(b) : b).toString("utf8")); } catch { return null; }
}
function cacheWrite(cache, rel, value) {
  const p = join(cache, rel);
  mkdirSync(dirname(p), { recursive: true });
  const s = Buffer.from(JSON.stringify(value));
  writeFileSync(p + ".tmp", p.endsWith(".gz") ? gzipSync(s) : s);
  renameSync(p + ".tmp", p);
}

/* ------------------------------------------------------------ Universum */
export function loadUniverse(root, universeFile) {
  if (universeFile) {
    const rows = JSON.parse(readFileSync(universeFile, "utf8"));
    return rows.map((r) => ({ ticker: r.ticker, securityId: r.securityId || Identity.securityIdForTicker(r.ticker), cik: padCik(r.cik), instrumentType: r.instrumentType || "EQUITY_COMMON", name: r.name || null }));
  }
  const names = JSON.parse(readFileSync(join(root, "quant/data/market/security-master/company-names.json"), "utf8"));
  const cikById = new Map(names.rows.filter((r) => r.cik).map((r) => [r.securityId, padCik(r.cik)]));
  return import(join(root, "scripts/market/universe-source.mjs")).then(({ resolveProductUniverse }) =>
    resolveProductUniverse(root).securities.map((s) => ({ ticker: s.ticker, securityId: s.securityId, cik: cikById.get(s.securityId) || null, instrumentType: s.instrumentType || null,
      name: s.displayName || s.companyName || null })));
}

/* -------------------------------------------------- FTD -> CUSIP-Karte */
async function loadFtdObservations(src, cache, fromIso, toIso, stats) {
  const obs = new Map();
  const files = await src.listFtd(fromIso, toIso);
  for (const item of files) {
    const rel = `ftd/${item.name}.json`;
    let rows = cacheRead(cache, rel);
    if (!rows) {
      const h = await src.fetchDataset(item, "ftd");
      if (!h) { stats.ftdMissing++; continue; }
      const agg = new Map();
      let idx = null;
      for await (const line of tableLines(h, "*")) {
        if (idx === null) { idx = E.headerIndex(line.replace(/\|/g, "\t")); continue; }
        const c = line.split("|");
        const cusip = E.normalizeCusip(c[col(idx, "CUSIP")]), sym = E.symbolKey(c[col(idx, "SYMBOL")]);
        const d = E.parseSecDate(c[col(idx, "SETTLEMENT DATE")]);
        if (!cusip || !sym || !d) continue;
        const k = cusip + "|" + sym;
        const r = agg.get(k);
        if (!r) agg.set(k, [cusip, sym, d, d]);
        else { if (d < r[2]) r[2] = d; if (d > r[3]) r[3] = d; }
      }
      src.release(h);
      rows = [...agg.values()];
      /* Der laufende Monat kann noch nachgereicht werden: nicht cachen. */
      if (ftdMonth(item.name) < toIso.slice(0, 7)) cacheWrite(cache, rel, rows);
    }
    stats.ftdFiles++;
    for (const [cusip, sym, first, last] of rows) {
      const bySym = obs.get(cusip) || obs.set(cusip, new Map()).get(cusip);
      const r = bySym.get(sym);
      if (!r) bySym.set(sym, { first, last });
      else { if (first < r.first) r.first = first; if (last > r.last) r.last = last; }
    }
  }
  return obs;
}

/* --------------------------------------------- A) Insider-Datensaetze */
/** Ein Quartalsdatensatz -> universumsunabhaengige, kompakte Auszuege:
 *  { acc: { i: Emittent, f: Einreichungstag, o: [[Eigner, Bits]], x: [[Code, Tag, Aktien, Wert, Plan]] } } */
export async function extractInsiderDataset(handle) {
  const subs = new Map();
  const stats = { submissions: 0, amendmentsSkipped: 0, transactions: 0, planColumn: false };
  let idx;
  for await (const r of tableRows(handle, "SUBMISSION")) {
    if (r.header) { idx = r.header; stats.planColumn = col(idx, "AFF10B5ONE", "AFF_10B5_ONE", "AFF10B5_ONE") >= 0; continue; }
    const dt = E.insiderDocType(r[col(idx, "DOCUMENT_TYPE")]);
    if (!dt) continue;
    if (dt.amendment) { stats.amendmentsSkipped++; continue; }
    const f = E.parseSecDate(r[col(idx, "FILING_DATE")]);
    const i = padCik(r[col(idx, "ISSUERCIK")]);
    if (!f || !i) continue;
    const ac = col(idx, "AFF10B5ONE", "AFF_10B5_ONE", "AFF10B5_ONE");
    const affRaw = ac >= 0 ? String(r[ac] || "").trim().toLowerCase() : "";
    subs.set(r[col(idx, "ACCESSION_NUMBER")], { i, f: E.dayOf(f), aff: affRaw === "1" || affRaw === "true" || affRaw === "y", o: [], x: [] });
    stats.submissions++;
  }
  const names = {};
  for await (const r of tableRows(handle, "REPORTINGOWNER")) {
    if (r.header) { idx = r.header; continue; }
    const s = subs.get(r[col(idx, "ACCESSION_NUMBER")]);
    if (!s) continue;
    const cik = padCik(r[col(idx, "RPTOWNERCIK")]);
    if (!cik) continue;
    s.o.push([cik, E.classifyRelationship(r[col(idx, "RPTOWNER_RELATIONSHIP")])]);
    const nm = (r[col(idx, "RPTOWNERNAME")] || "").trim();
    if (nm) names[cik] = nm;
  }
  const refs = [];
  let fnCols = [];
  for await (const r of tableRows(handle, "NONDERIV_TRANS")) {
    if (r.header) { idx = r.header; fnCols = Object.keys(idx).filter((k) => k.endsWith("_FN")).map((k) => idx[k]); continue; }
    const acc = r[col(idx, "ACCESSION_NUMBER")];
    const s = subs.get(acc);
    if (!s) continue;
    const code = String(r[col(idx, "TRANS_CODE")] || "").trim().toUpperCase();
    if (code !== "P" && code !== "S") continue;
    const t = E.parseSecDate(r[col(idx, "TRANS_DATE")]);
    const sh = E.num(r[col(idx, "TRANS_SHARES")]);
    const px = E.num(r[col(idx, "TRANS_PRICEPERSHARE")]);
    const tx = [code, t ? E.dayOf(t) : null, sh || 0, sh !== null && px !== null && px > 0 ? Math.round(sh * px) : null, s.aff ? 1 : 0];
    s.x.push(tx);
    stats.transactions++;
    const ids = [];
    for (const ci of fnCols) for (const id of String(r[ci] || "").split(/[\s,;]+/)) if (id) ids.push(id.trim());
    if (ids.length) refs.push([acc, ids, tx]);
  }
  if (refs.length) {
    const want = new Set(refs.map((x) => x[0]));
    const plan = new Set();
    for await (const r of tableRows(handle, "FOOTNOTES")) {
      if (r.header) { idx = r.header; continue; }
      const acc = r[col(idx, "ACCESSION_NUMBER")];
      if (!want.has(acc)) continue;
      if (E.PLAN_RE.test(r[col(idx, "FOOTNOTE_TXT")] || "")) plan.add(acc + "|" + String(r[col(idx, "FOOTNOTE_ID")] || "").trim());
    }
    for (const [acc, ids, tx] of refs) if (ids.some((id) => plan.has(acc + "|" + id))) tx[4] = 1;
  }
  const accessions = {};
  for (const [acc, s] of subs) if (s.x.length) accessions[acc] = { i: s.i, f: s.f, o: s.o, x: s.x };
  return { accessions, names, stats };
}

/** Form-4-XML -> derselbe kompakte Auszug wie aus dem Datensatz. */
export function compactForm4(doc, filedIso) {
  if (!doc || !doc.issuerCik) return null;
  const x = [];
  for (const t of doc.transactions) {
    if (t.code !== "P" && t.code !== "S") continue;
    x.push([t.code, t.date ? E.dayOf(t.date) : null, t.shares || 0,
      t.shares !== null && t.price !== null && t.price > 0 ? Math.round(t.shares * t.price) : null, t.plan ? 1 : 0]);
  }
  const names = {};
  for (const o of doc.owners) if (o.cik && o.name) names[o.cik] = o.name;
  return { i: doc.issuerCik, f: E.dayOf(filedIso), o: doc.owners.filter((o) => o.cik).map((o) => [o.cik, o.bits]), x, n: names };
}

/* ------------------------------------------------- EDGAR full-index */
export function parseMasterIndex(text) {
  const rows = [];
  let body = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (!body) { if (/^-{10,}/.test(line)) body = true; continue; }
    const c = line.split("|");
    if (c.length < 5) continue;
    const date = E.parseSecDate(c[3]);
    const file = c[4].trim();
    const acc = basename(file).replace(/\.txt$/i, "");
    rows.push({ cik: padCik(c[0]), name: c[1].trim(), form: c[2].trim().toUpperCase(), date, file, acc });
  }
  return rows;
}
async function loadIndexQuarter(src, cache, year, q, todayIso) {
  const rel = `index/${year}Q${q}.json.gz`;
  const complete = E.dayOf(E.quarterEnd(year, q)) + 10 < E.dayOf(todayIso);
  if (complete) { const c = cacheRead(cache, rel); if (c) return c; }
  const text = await src.masterIndex(year, q);
  if (text === null) return null;
  const sched = new Map(), f4 = new Map();
  for (const r of parseMasterIndex(text)) {
    const sf = E.scheduleForm(r.form);
    if (sf) {
      const e = sched.get(r.acc) || sched.set(r.acc, [r.acc, r.form, r.date, []]).get(r.acc);
      if (!e[3].some((p) => p[0] === r.cik)) e[3].push([r.cik, r.name]);
    } else if ((r.form === "4" || r.form === "5") && r.date) {
      const e = f4.get(r.acc) || f4.set(r.acc, [r.acc, r.date, [], r.file]).get(r.acc);
      if (!e[2].includes(r.cik)) e[2].push(r.cik);
    }
  }
  const out = { schedule: [...sched.values()], form4: [...f4.values()] };
  if (complete) cacheWrite(cache, rel, out);
  return out;
}

/* --------------------------------------------------- B2) 13F-Datensaetze */
const REC = 28; // u32 ticker, u32 manager, f64 shares, f64 usd, u32 filingDay
async function extract13fDataset(handle, ctx) {
  const { cusipToTicker, tickerIndex, managerIndex, managerNames, seenOriginal, seenAcc, filedDay, periodDir, fromPeriod, stats } = ctx;
  let idx;
  const subs = new Map();
  for await (const r of tableRows(handle, "SUBMISSION")) {
    if (r.header) { idx = r.header; continue; }
    const acc = r[col(idx, "ACCESSION_NUMBER")];
    if (seenAcc.has(acc)) { stats.duplicateAccessions++; continue; }
    const type = String(r[col(idx, "SUBMISSIONTYPE")] || "").trim().toUpperCase();
    if (!type.startsWith("13F-HR")) continue;
    const f = E.parseSecDate(r[col(idx, "FILING_DATE")]);
    const per = E.parseSecDate(r[col(idx, "PERIODOFREPORT")]);
    const cik = padCik(r[col(idx, "CIK")]);
    if (!f || !per || !cik) continue;
    const pq = E.quarterOf(per);
    subs.set(acc, { f, period: E.quarterEnd(pq.year, pq.q), cik, amendment: type.endsWith("/A") });
  }
  const cover = new Map();
  for await (const r of tableRows(handle, "COVERPAGE")) {
    if (r.header) { idx = r.header; continue; }
    const acc = r[col(idx, "ACCESSION_NUMBER")];
    if (!subs.has(acc)) continue;
    cover.set(acc, {
      isAmend: /^(Y|YES|TRUE|1)$/i.test(String(r[col(idx, "ISAMENDMENT")] || "").trim()),
      amendType: String(r[col(idx, "AMENDMENTTYPE")] || "").trim().toUpperCase(),
      reportType: String(r[col(idx, "REPORTTYPE")] || "").trim().toUpperCase(),
      name: String(r[col(idx, "FILINGMANAGER_NAME")] || "").trim()
    });
  }
  const summary = new Map();
  for await (const r of tableRows(handle, "SUMMARYPAGE")) {
    if (r.header) { idx = r.header; continue; }
    const acc = r[col(idx, "ACCESSION_NUMBER")];
    if (!subs.has(acc)) continue;
    summary.set(acc, {
      tableEntryTotal: E.num(r[col(idx, "TABLEENTRYTOTAL")]),
      confidentialOmitted: /^(Y|YES|TRUE|1)$/i.test(String(r[col(idx, "ISCONFIDENTIALOMITTED")] || "").trim())
    });
  }
  /* Annahme in Einreichungsreihenfolge: je (Verwalter, Quartal) zaehlt die
     ERSTE Originalmeldung; Aenderungen vom Typ NEW HOLDINGS kommen hinzu.
     RESTATEMENT ersetzt das Original nur, wenn beide im selben Datensatz
     stehen und das Original unvollstaendig ist (siehe unten); sonst wird es
     nicht uebernommen (dokumentierte Grenze).
     "Hat gemeldet" (filedDay) zaehlt nur fuer vollstaendige Meldungen
     (E.thirteenFFilingComplete) - sonst entstehen Neu- und Ausstiege aus
     vertraulichen oder abgeschnittenen Meldungen. */
  const accepted = new Map(), originalOf = new Map(), restates = new Map();
  for (const [acc, s] of [...subs.entries()].sort((a, b) => (a[1].f < b[1].f ? -1 : a[1].f > b[1].f ? 1 : 0))) {
    seenAcc.add(acc);
    if (s.period < fromPeriod) continue;
    const cv = cover.get(acc) || { isAmend: s.amendment, amendType: "", reportType: "", name: "" };
    if (cv.reportType.includes("NOTICE")) continue;
    const key = s.cik + "|" + s.period;
    const amend = s.amendment || cv.isAmend;
    let restatementOf = null;
    if (!amend) {
      if (seenOriginal.has(key)) { stats.duplicateOriginals++; continue; }
      seenOriginal.add(key);
      originalOf.set(key, acc);
    } else if (!cv.amendType.includes("NEW HOLDINGS")) {
      restatementOf = originalOf.get(key) || null;
      if (!restatementOf || restates.has(restatementOf)) { stats.restatementsSkipped++; continue; }
    }
    let m = managerIndex.get(s.cik);
    if (m === undefined) { m = managerIndex.size; managerIndex.set(s.cik, m); }
    if (cv.name) managerNames[m] = cv.name;
    const fd = E.dayOf(s.f);
    accepted.set(acc, { m, f: s.f, fd, period: s.period, rows: 0, original: !amend });
    if (restatementOf) restates.set(restatementOf, acc);
    else if (amend) stats.newHoldingsAmendments++; else stats.filings++;
  }
  const agg = new Map(), implied = new Map();
  for await (const r of tableRows(handle, "INFOTABLE")) {
    if (r.header) { idx = r.header; continue; }
    const acc = r[col(idx, "ACCESSION_NUMBER")];
    const a = accepted.get(acc);
    if (!a) continue;
    stats.infoRows++;
    a.rows++;
    if (String(r[col(idx, "SSHPRNAMTTYPE")] || "").trim().toUpperCase() !== "SH") continue;
    if (String(r[col(idx, "PUTCALL")] || "").trim()) continue;
    const sh = E.num(r[col(idx, "SSHPRNAMT")]), v = E.num(r[col(idx, "VALUE")]);
    if (!(sh > 0)) continue;
    let smp = implied.get(acc);
    if (!smp) { smp = []; implied.set(acc, smp); }
    if (smp.length < 201 && v !== null) smp.push(v / sh);
    const t = cusipToTicker.get(E.normalizeCusip(r[col(idx, "CUSIP")]));
    if (!t) continue;
    const ti = tickerIndex.get(t);
    const k = acc + "|" + ti;
    const e = agg.get(k);
    if (e) { e.sh += sh; e.v += v || 0; } else agg.set(k, { acc, ti, sh, v: v || 0 });
  }
  /* Vollstaendigkeit je Meldung; ein unvollstaendiges Original wird durch
     seine vollstaendige RESTATEMENT-Aenderung ersetzt, sonst bleibt das
     Original und die Aenderung entfaellt. */
  const complete = (acc) => E.thirteenFFilingComplete(Object.assign({ rows: accepted.get(acc).rows }, summary.get(acc) || {}));
  const dropped = new Set();
  for (const [orig, rest] of restates) {
    if (!complete(orig) && complete(rest)) { dropped.add(orig); stats.restatementsReplacing++; }
    else { dropped.add(rest); stats.restatementsSkipped++; }
  }
  for (const acc of dropped) accepted.delete(acc);
  for (const [k, e] of agg) if (dropped.has(e.acc)) agg.delete(k);
  for (const [acc, a] of accepted) {
    if (!complete(acc)) { if (a.original) stats.incompleteFilings++; continue; }
    const fmap = filedDay.get(a.period) || filedDay.set(a.period, new Map()).get(a.period);
    if (!fmap.has(a.m) || fmap.get(a.m) > a.fd) fmap.set(a.m, a.fd);
  }
  const unit = new Map();
  for (const [acc, a] of accepted) {
    const u = E.thirteenFValueUnit(a.f, E.median(implied.get(acc) || []));
    unit.set(acc, u.unit);
    if (u.basis !== "FILING_DATE_RULE") stats.unitOverrides++;
    if (u.unit === "THOUSANDS") stats.unitThousands++; else stats.unitDollars++;
  }
  const byPeriod = new Map();
  for (const e of agg.values()) {
    const a = accepted.get(e.acc);
    (byPeriod.get(a.period) || byPeriod.set(a.period, []).get(a.period)).push([e.ti, a.m, e.sh, E.valueToUsd(e.v, unit.get(e.acc)), a.fd]);
  }
  for (const [period, rows] of byPeriod) {
    const buf = Buffer.allocUnsafe(rows.length * REC);
    rows.forEach((x, i) => { const o = i * REC; buf.writeUInt32LE(x[0], o); buf.writeUInt32LE(x[1], o + 4); buf.writeDoubleLE(x[2], o + 8); buf.writeDoubleLE(x[3] || 0, o + 16); buf.writeUInt32LE(x[4], o + 24); });
    appendFileSync(join(periodDir, period + ".bin"), buf);
    stats.positions += rows.length;
  }
}
function loadPeriod(periodDir, period) {
  const p = join(periodDir, period + ".bin");
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  const byTicker = new Map();
  for (let o = 0; o + REC <= buf.length; o += REC) {
    const ti = buf.readUInt32LE(o);
    const arr = byTicker.get(ti) || byTicker.set(ti, []).get(ti);
    arr.push({ m: buf.readUInt32LE(o + 4), sh: buf.readDoubleLE(o + 8), v: buf.readDoubleLE(o + 16), f: buf.readUInt32LE(o + 24) });
  }
  return byTicker;
}

/* ------------------------------------------------- Aktienbasis (PIT) */
function loadSharesBase(consumerDir, ciks) {
  const out = new Map();
  if (!consumerDir || !existsSync(consumerDir)) return out;
  for (const cik of ciks) {
    const p = join(consumerDir, `CIK${cik}.json`);
    if (!existsSync(p)) continue;
    try {
      const d = JSON.parse(readFileSync(p, "utf8"));
      const rows = ((d.annual || {}).diluted_weighted_average_shares || [])
        .filter((r) => r[3] > 0 && r[4]).map((r) => [E.dayOf(r[4]), r[3]]).sort((a, b) => a[0] - b[0]);
      if (rows.length) out.set(cik, rows);
    } catch { /* unlesbar = keine Basis */ }
  }
  return out;
}

/* ================================================================ BUILD */
export async function build(opts = {}) {
  const t0 = Date.now();
  const today = opts.asOf || new Date().toISOString().slice(0, 10);
  const since = (opts.since || "2016-01").slice(0, 7);
  const firstMonthEnd = E.monthEnds(since + "-01", since + "-31")[0];
  const dataFrom = E.isoOf(E.dayOf(since + "-01") - 200);
  const outDir = opts.out || join(ROOT, OUT_DIR);
  const cache = opts.cache || join(ROOT, ".ownership-cache");
  const work = opts.work || join(cache, "_work");
  const form4Max = opts.form4Max === undefined ? 20000 : opts.form4Max;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const src = opts.sourceDir ? directorySource(opts.sourceDir)
    : networkSource({ client: opts.client || createSecClient({ userAgent: process.env.SEC_USER_AGENT || DEFAULT_UA, rate: Number(process.env.SEC_RATE || 6) }), work });
  const client = opts.client || null;

  /* Universum */
  const universe = await loadUniverse(opts.root || ROOT, opts.universeFile);
  const tickers = universe.map((u) => u.ticker);
  const tickerIndex = new Map(tickers.map((t, i) => [t, i]));
  const tickersByCik = new Map();
  for (const u of universe) if (u.cik) (tickersByCik.get(u.cik) || tickersByCik.set(u.cik, []).get(u.cik)).push(u.ticker);
  const universeCiks = new Set(tickersByCik.keys());
  log(`Universum: ${universe.length} Titel, ${universeCiks.size} Emittenten mit CIK`);

  const stats = {
    ftdFiles: 0, ftdMissing: 0,
    insiderDatasets: [], insiderMissing: [], insiderTransactions: 0, implausibleValues: 0, insiderPurchases: 0, insiderSales: 0, insiderAccessions: 0, insiderAmendmentsSkipped: 0, planColumnSeen: false,
    form4: { needed: 0, cached: 0, fetched: 0, failed: 0, cap: form4Max, from: null, to: null },
    indexQuarters: [], indexMissing: [], schedule: { filings: 0, resolved: 0, ambiguous: 0, filerOnly: 0, notInUniverse: 0 },
    thirteenF: { datasets: [], missing: [], filings: 0, newHoldingsAmendments: 0, restatementsSkipped: 0, restatementsReplacing: 0, incompleteFilings: 0, duplicateOriginals: 0, duplicateAccessions: 0, infoRows: 0, positions: 0, unitThousands: 0, unitDollars: 0, unitOverrides: 0 }
  };

  /* 1) CUSIP -> Ticker */
  const obs = await loadFtdObservations(src, cache, E.isoOf(E.dayOf(dataFrom) - 365), today, stats);
  const cmap = E.mapCusipsToTickers(obs, tickers);
  log(`CUSIP-Karte: ${cmap.map.size} CUSIPs fuer ${cmap.tickersMapped} Ticker (${stats.ftdFiles} FTD-Dateien)`);

  /* 2) Insider-Datensaetze */
  const insiderAcc = new Map(); // acc -> record
  const ownerNames = {};
  let insiderCoverageEnd = null;
  for (const item of await src.listInsider(dataFrom, today)) {
    const w = E.datasetWindow(item.name);
    if (!w) continue;
    const rel = `insider/${item.name}.json.gz`;
    let ex = cacheRead(cache, rel);
    if (!ex) {
      const h = await src.fetchDataset(item, "insider");
      if (!h) { stats.insiderMissing.push(item.name); continue; }
      ex = await extractInsiderDataset(h);
      src.release(h);
      if (src.kind === "network") cacheWrite(cache, rel, ex);
    }
    /* Nur Emittenten des Universums im Speicher halten; der Cache bleibt universumsunabhaengig. */
    let n = 0;
    for (const [acc, r] of Object.entries(ex.accessions)) {
      if (!universeCiks.has(r.i) || insiderAcc.has(acc)) continue;
      insiderAcc.set(acc, r); n++;
      for (const o of r.o) if (ex.names[o[0]]) ownerNames[o[0]] = ex.names[o[0]];
    }
    stats.insiderAmendmentsSkipped += ex.stats.amendmentsSkipped;
    if (ex.stats.planColumn) stats.planColumnSeen = true;
    stats.insiderDatasets.push({ name: item.name, start: w.start, end: w.end, accessions: n, transactions: ex.stats.transactions, planColumn: ex.stats.planColumn });
    if (!insiderCoverageEnd || w.end > insiderCoverageEnd) insiderCoverageEnd = w.end;
    log(`Insider ${item.name}: ${n} Einreichungen mit P/S im Universum (${ex.stats.transactions} P/S-Zeilen gesamt)`);
  }

  /* 3) EDGAR-Index: Schedule 13D/13G und die Form-4-Luecke */
  const scheduleByCik = new Map();
  const gap = [], scheduleQuarters = [];
  const gapFrom = insiderCoverageEnd || dataFrom;
  stats.form4.from = E.isoOf(E.dayOf(gapFrom) + 1); stats.form4.to = today;
  for (let { year, q } = E.quarterOf(dataFrom); E.quarterEnd(year, q) <= E.quarterEnd(E.quarterOf(today).year, E.quarterOf(today).q); q === 4 ? (q = 1, year++) : q++) {
    const ix = await loadIndexQuarter(src, cache, year, q, today);
    if (!ix) { stats.indexMissing.push(`${year}Q${q}`); continue; }
    stats.indexQuarters.push(`${year}Q${q}`);
    const counts = new Map();
    for (const [, , , parties] of ix.schedule) for (const [cik] of parties) counts.set(cik, (counts.get(cik) || 0) + 1);
    scheduleQuarters.push({ schedule: ix.schedule, counts });
    for (const [acc, date, ciks, file] of ix.form4) {
      if (date > gapFrom && date <= today && !insiderAcc.has(acc) && ciks.some((c) => universeCiks.has(c))) gap.push({ acc, date, file });
    }
  }
  /* Wer Vielmelder (Verwalter) ist, wird ueber vier Quartale gezaehlt - das
     laufende Quartal allein ist in seinen ersten Tagen zu kurz (im ersten
     CI-Lauf galt JPMorgan am 6. Oktober deshalb als Gegenstand). */
  for (let qi = 0; qi < scheduleQuarters.length; qi++) {
    const ix = scheduleQuarters[qi];
    const participation = new Map();
    for (let k = Math.max(0, qi - 3); k <= qi; k++) for (const [cik, n] of scheduleQuarters[k].counts) participation.set(cik, (participation.get(cik) || 0) + n);
    for (const [acc, form, date, parties] of ix.schedule) {
      if (!date || date > today) continue;
      stats.schedule.filings++;
      const sf = E.scheduleForm(form);
      const res = E.resolveScheduleSubject(acc, parties.map(([cik, name]) => ({ cik, name })), universeCiks, participation);
      if (res.status !== "RESOLVED") { stats.schedule[res.status === "AMBIGUOUS" ? "ambiguous" : res.status === "FILER_ONLY" ? "filerOnly" : "notInUniverse"]++; continue; }
      stats.schedule.resolved++;
      (scheduleByCik.get(res.subjectCik) || scheduleByCik.set(res.subjectCik, []).get(res.subjectCik))
        .push({ f: E.dayOf(date), k: sf.kind, a: sf.amendment, filers: res.filers, acc });
    }
  }

  /* 4) Form-4-Luecke: neueste zuerst, gecacht je Monat, gedeckelt */
  gap.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.acc < b.acc ? -1 : 1));
  stats.form4.needed = gap.length;
  const f4Cache = new Map();
  const f4Month = (m) => { if (!f4Cache.has(m)) f4Cache.set(m, cacheRead(cache, `form4/${m}.json`) || {}); return f4Cache.get(m); };
  const dirty = new Set();
  const todo = [];
  for (const g of gap) { const c = f4Month(g.date.slice(0, 7)); if (Object.prototype.hasOwnProperty.call(c, g.acc)) stats.form4.cached++; else todo.push(g); }
  const fetchList = todo.slice(0, Math.max(0, form4Max));
  let cursor = 0;
  const worker = async () => {
    while (cursor < fetchList.length) {
      const g = fetchList[cursor++];
      try {
        const txt = await src.filing(g.file);
        if (txt === null) { stats.form4.failed++; continue; }
        const rec = compactForm4(E.parseForm4Xml(txt), g.date);
        f4Month(g.date.slice(0, 7))[g.acc] = rec && rec.x.length ? rec : null;
        dirty.add(g.date.slice(0, 7));
        stats.form4.fetched++;
        if (stats.form4.fetched % 2000 === 0) { log(`Form 4: ${stats.form4.fetched}/${fetchList.length}`); for (const m of dirty) cacheWrite(cache, `form4/${m}.json`, f4Month(m)); dirty.clear(); }
      } catch (err) { stats.form4.failed++; if (stats.form4.failed <= 5) log("Form 4 Fehler: " + err.message); }
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));
  for (const m of dirty) cacheWrite(cache, `form4/${m}.json`, f4Month(m));
  /* Gecachte Monate, die inzwischen ein Datensatz abdeckt, verwerfen. */
  if (existsSync(join(cache, "form4"))) for (const f of readdirSync(join(cache, "form4"))) if (insiderCoverageEnd && f.slice(0, 7) < insiderCoverageEnd.slice(0, 7)) rmSync(join(cache, "form4", f), { force: true });
  const missingDays = new Set();
  for (const g of gap) {
    const c = f4Month(g.date.slice(0, 7));
    if (!Object.prototype.hasOwnProperty.call(c, g.acc)) { missingDays.add(E.dayOf(g.date)); continue; }
    const rec = c[g.acc];
    if (rec && !insiderAcc.has(g.acc)) { insiderAcc.set(g.acc, rec); Object.assign(ownerNames, rec.n || {}); }
  }
  const missingSorted = [...missingDays].sort((a, b) => a - b);
  stats.form4.missingFilingDays = missingSorted.length;
  stats.form4.complete = missingSorted.length === 0;
  log(`Form-4-Luecke ab ${stats.form4.from}: ${gap.length} noetig, ${stats.form4.cached} gecacht, ${stats.form4.fetched} geholt, ${missingSorted.length} Tage unvollstaendig`);
  /* Ist der Insider-Stand an D vollstaendig? Keine fehlende Einreichung im 180-Tage-Fenster. */
  const insiderComplete = (day) => {
    let lo = 0, hi = missingSorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (missingSorted[mid] <= day - 180) lo = mid + 1; else hi = mid; }
    return !(lo < missingSorted.length && missingSorted[lo] <= day);
  };

  /* Transaktionen je Emittent im Universum */
  const txByCik = new Map();
  for (const [, r] of insiderAcc) {
    if (!universeCiks.has(r.i)) continue;
    const os = r.o.map((o) => o[0]), rs = r.o.map((o) => o[1]);
    const arr = txByCik.get(r.i) || txByCik.set(r.i, []).get(r.i);
    const insiderOwner = rs.some((b) => E.isInsider(b));
    for (const x of r.x) {
      /* Tippfehler im Preis (gesehen: 2,27 Mio. USD je Aktie, 10 Billionen USD
         Kaufwert) duerfen kein Signal tragen: Wert unplausibel -> null. */
      let v = x[3];
      if (v !== null && (v > MAX_TX_USD || (x[2] > 0 && v / x[2] > MAX_PRICE_USD))) { v = null; stats.implausibleValues++; }
      arr.push({ f: r.f, t: x[1], c: x[0], sh: x[2], v, p: x[4] === 1, os, rs, a: false });
      stats.insiderTransactions++;
      if (insiderOwner && x[0] === "P") stats.insiderPurchases++; else if (insiderOwner && x[0] === "S") stats.insiderSales++;
    }
    stats.insiderAccessions++;
  }
  for (const arr of txByCik.values()) E.sortTransactions(arr);
  for (const arr of scheduleByCik.values()) arr.sort((a, b) => a.f - b.f || (a.acc < b.acc ? -1 : 1));

  /* 5) 13F */
  const periodDir = join(work, "13f-periods");
  mkdirSync(periodDir, { recursive: true });
  const managerIndex = new Map(), managerNames = [], filedDay = new Map();
  const fctx = { cusipToTicker: cmap.map, tickerIndex, managerIndex, managerNames, seenOriginal: new Set(), seenAcc: new Set(), filedDay, periodDir,
    fromPeriod: E.prevQuarterEnd(E.thirteenFPeriodAt(E.dayOf(firstMonthEnd))), stats: stats.thirteenF };
  for (const item of await src.list13f(dataFrom, today)) {
    const w = E.datasetWindow(item.name);
    if (!w) continue;
    const h = await src.fetchDataset(item, "13f");
    if (!h) { stats.thirteenF.missing.push(item.name); continue; }
    const before = stats.thirteenF.positions;
    await extract13fDataset(h, fctx);
    src.release(h);
    stats.thirteenF.datasets.push({ name: item.name, start: w.start, end: w.end, positions: stats.thirteenF.positions - before });
    log(`13F ${item.name}: ${stats.thirteenF.positions - before} Positionen im Universum`);
  }

  /* 6) Aktienbasis: nur Emittenten mit genau EINEM Stammtitel im Universum
        (keine ADRs - eine gemeldete Aktie ist kein Hinterlegungsschein). */
  const sharesTicker = new Map();
  for (const [cik, ts] of tickersByCik) {
    const commons = universe.filter((u) => u.cik === cik && /^(EQUITY_COMMON|REIT|UNKNOWN|OTHER|TRUST|SPAC)?$/i.test(u.instrumentType || ""));
    if (commons.length === 1 && ts.length >= 1) sharesTicker.set(commons[0].ticker, cik);
  }
  const sharesBase = loadSharesBase(opts.consumerDir === undefined ? join(opts.root || ROOT, "quant/data/sec/consumer") : opts.consumerDir, new Set(sharesTicker.values()));
  const baseFor = (ticker, day) => { const cik = sharesTicker.get(ticker); return cik ? E.sharesBaseAt(sharesBase.get(cik), day) : null; };

  /* 7) Schnappschuesse */
  const asOfDay = E.dayOf(today);
  const months = E.monthEnds(firstMonthEnd, E.isoOf(asOfDay - 1)).filter((d) => E.dayOf(d) < asOfDay);
  const dates = months.concat([today]);
  const rows = new Map(); // ticker -> Array(dates.length) of row arrays
  const rowFor = (t, di) => { let r = rows.get(t); if (!r) { r = new Array(dates.length).fill(null); rows.set(t, r); } if (!r[di]) r[di] = new Array(HISTORY_COLUMNS.length).fill(null); return r[di]; };
  const C = Object.fromEntries(HISTORY_COLUMNS.map((c, i) => [c, i]));
  const current = new Map();

  dates.forEach((iso, di) => {
    const day = E.dayOf(iso);
    const complete = insiderComplete(day);
    for (const [cik, ts] of tickersByCik) {
      const txs = txByCik.get(cik) || [];
      const sch = scheduleByCik.get(cik) || [];
      for (const t of ts) {
        const r = rowFor(t, di);
        if (complete || di === dates.length - 1) {
          const s = E.insiderSnapshot(txs, day, { sharesBase: baseFor(t, day) });
          for (const k of INSIDER_COLS) r[C[k]] = s[k];
          if (di === dates.length - 1) current.set(t, Object.assign(current.get(t) || {}, { insider: Object.assign({}, s, { complete, topBuyers: E.topInsiderBuyers(txs, day, ownerNames, 5), issuerLevel: ts.length > 1 }) }));
        }
        const ss = E.scheduleSnapshot(sch, day);
        for (const k of SCHEDULE_COLS) r[C[k]] = ss[k];
        if (di === dates.length - 1) current.get(t).schedules = Object.assign({}, ss, { recent: E.recentSchedules(sch, day, 8) });
      }
    }
  });

  /* 13F: Quartal fuer Quartal, nur zwei Quartale im Speicher. */
  const byPeriod = new Map();
  dates.forEach((iso, di) => { const p = E.thirteenFPeriodAt(E.dayOf(iso)); (byPeriod.get(p) || byPeriod.set(p, []).get(p)).push(di); });
  let prevPeriod = null, prevData = null;
  for (const period of [...byPeriod.keys()].sort()) {
    const pPrev = E.prevQuarterEnd(period);
    const prevLoaded = prevPeriod === pPrev ? prevData : loadPeriod(periodDir, pPrev);
    const curr = loadPeriod(periodDir, period);
    prevPeriod = period; prevData = curr;
    if (!curr) continue;
    const fdCurr = filedDay.get(period) || new Map(), fdPrev = filedDay.get(pPrev) || new Map();
    const tis = new Set([...curr.keys(), ...(prevLoaded ? prevLoaded.keys() : [])]);
    for (const di of byPeriod.get(period)) {
      const day = E.dayOf(dates[di]);
      for (const ti of tis) {
        const t = tickers[ti];
        const sharesB = baseFor(t, day);
        const s = E.thirteenFSnapshot({ positions: curr.get(ti) || [], filedDay: fdCurr }, { positions: prevLoaded ? prevLoaded.get(ti) || [] : [], filedDay: fdPrev }, day, { sharesBase: sharesB });
        if (!s.fh && !s.fhp) continue;
        const r = rowFor(t, di);
        for (const k of F_COLS) if (k !== "fp") r[C[k]] = s[k];
        r[C.fp] = E.periodLabel(period);
        if (!prevLoaded) for (const k of ["fhp", "fnew", "fexit", "finc", "fdec", "fshp", "fdsh"]) r[C[k]] = null;
        if (di === dates.length - 1) {
          const cur = current.get(t) || {};
          /* Wenige Vorquartals-Halter bei vielen heutigen: IPO, Abspaltung oder
             CUSIP-Wechsel ohne Zuordnung - "neue Positionen" sind dann kein Zufluss. */
          cur.institutions = Object.assign({ period, previousPeriodLoaded: !!prevLoaded, previousHoldersLow: !!prevLoaded && s.fhp < s.fh / 2 }, s, { topNew: s.topNew.map((x) => ({ manager: managerNames[x.manager] || null, shares: x.shares, valueUsd: x.valueUsd })) });
          current.set(t, cur);
        }
      }
    }
  }

  /* 8) Schreiben */
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "current"), { recursive: true });
  mkdirSync(join(outDir, "history"), { recursive: true });
  const byId = new Map(universe.map((u) => [u.ticker, u]));
  const shards = new Map();
  const counters = { tickersWithAnySignal: 0, tickersWithInsiderTx: 0, tickersWithSchedule: 0, tickersWith13F: 0, tickersWithSharesBase: 0, historyRows: 0 };
  const hasData = (row) => row && row.some((v, i) => v !== null && v !== 0 && HISTORY_COLUMNS[i] !== "fp");
  for (const t of tickers) {
    const r = rows.get(t);
    const cur = current.get(t);
    if (!r || !r.some(hasData)) continue;
    counters.tickersWithAnySignal++;
    const u = byId.get(t);
    const key = Identity.shardKey(t);
    const sh = shards.get(key) || shards.set(key, { current: {}, history: {} }).get(key);
    const first = r.findIndex((x) => x !== null && hasData(x));
    const hist = r.slice(first, months.length).map((x) => x || new Array(HISTORY_COLUMNS.length).fill(null));
    if (hist.length) { sh.history[t] = { from: months[first], rows: hist }; counters.historyRows += hist.length; }
    const ins = cur && cur.insider;
    if (u.cik && (txByCik.get(u.cik) || []).length) counters.tickersWithInsiderTx++;
    if (u.cik && (scheduleByCik.get(u.cik) || []).length) counters.tickersWithSchedule++;
    if (cur && cur.institutions) counters.tickersWith13F++;
    const base = baseFor(t, asOfDay);
    if (base) counters.tickersWithSharesBase++;
    sh.current[t] = {
      securityId: u.securityId, cik: u.cik, issuerTickers: u.cik ? tickersByCik.get(u.cik) : [t],
      insider: u.cik ? (ins || null) : null,
      schedules: u.cik ? ((cur && cur.schedules) || null) : null,
      institutions: (cur && cur.institutions) || null,
      sharesBase: base ? { shares: base, basis: "annual diluted weighted average shares (SEC companyfacts, latest filed)" } : null
    };
  }
  const gz = (o) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
  for (const [key, s] of [...shards.entries()].sort()) {
    writeFileSync(join(outDir, "current", key + ".json.gz"), gz({ schemaVersion: SCHEMA, source: SOURCE, shard: key, asOf: today, issuers: sortObj(s.current) }));
    if (Object.keys(s.history).length) writeFileSync(join(outDir, "history", key + ".json.gz"), gz({ schemaVersion: SCHEMA, source: SOURCE, shard: key, grain: "month-end", columns: HISTORY_COLUMNS, issuers: sortObj(s.history) }));
  }

  /* Auffaelligkeiten. Insider- und 13D-Werte gelten je Emittent: mehrere
     Gattungen (LEN/LEN-B) erscheinen nur einmal, mit dem ersten Ticker nach
     der Sortierung. Namen aus der Namensschicht des Universums. */
  const all = [...shards.values()].flatMap((s) => Object.entries(s.current));
  const nameOf = new Map(universe.map((u) => [u.ticker, u.name || null]));
  const cikOf = new Map(all.map(([t, x]) => [t, x.cik || t]));
  const named = (rows) => rows.map((r) => Object.assign({ ticker: r.ticker, name: nameOf.get(r.ticker) || null }, r));
  const perIssuer = (rows) => { const seen = new Set(); return rows.filter((r) => { const c = cikOf.get(r.ticker); if (seen.has(c)) return false; seen.add(c); return true; }); };
  const highlights = {
    schemaVersion: SCHEMA, source: SOURCE, asOf: today,
    clusterBuys: all.filter(([, x]) => x.insider && x.insider.cb).map(([t, x]) => ({ ticker: t, buyers90: x.insider.ib90, netBuyUsd90: x.insider.nbv90 }))
      .sort((a, b) => b.buyers90 - a.buyers90 || b.netBuyUsd90 - a.netBuyUsd90 || (a.ticker < b.ticker ? -1 : 1)),
    largestNetInsiderBuys90: all.filter(([, x]) => x.insider && x.insider.nbv90 > 0).map(([t, x]) => ({ ticker: t, netBuyUsd90: x.insider.nbv90, buyers90: x.insider.ib90 }))
      .sort((a, b) => b.netBuyUsd90 - a.netBuyUsd90 || (a.ticker < b.ticker ? -1 : 1)),
    new13D90: all.filter(([, x]) => x.schedules && x.schedules.d13n > 0).map(([t, x]) => ({ ticker: t, filings: x.schedules.d13n, latest: x.schedules.recent.find((r) => r.form === "SC 13D") || null }))
      .sort((a, b) => ((b.latest && b.latest.filed) || "").localeCompare((a.latest && a.latest.filed) || "") || (a.ticker < b.ticker ? -1 : 1)),
    mostNewInstitutions: all.filter(([, x]) => x.institutions && x.institutions.fnew > 0 && !x.institutions.previousHoldersLow).map(([t, x]) => ({ ticker: t, period: x.institutions.period, newPositions: x.institutions.fnew, exits: x.institutions.fexit, holders: x.institutions.fh }))
      .sort((a, b) => b.newPositions - a.newPositions || (a.ticker < b.ticker ? -1 : 1)).slice(0, 25)
  };
  highlights.clusterBuys = named(perIssuer(highlights.clusterBuys).slice(0, 50));
  highlights.largestNetInsiderBuys90 = named(perIssuer(highlights.largestNetInsiderBuys90).slice(0, 25));
  highlights.new13D90 = named(perIssuer(highlights.new13D90).slice(0, 50));
  highlights.mostNewInstitutions = named(highlights.mostNewInstitutions);
  writeFileSync(join(outDir, "highlights.json"), JSON.stringify(highlights, null, 1) + "\n");

  const manifest = {
    schemaVersion: "ownership-signals-manifest-1.0.0", engineVersion: E.VERSION, generatedAt: opts.generatedAt || new Date().toISOString(), asOf: today,
    source: SOURCE, license: "SEC EDGAR-Daten sind gemeinfrei (public domain); abgeleitete Kennzahlen je Emittent.",
    access: { userAgent: "SEC_USER_AGENT (Kontaktadresse Pflicht)", ratePerSecondMax: 9, sourceMode: src.kind, requests: client ? client.stats.requests : (src.kind === "network" ? null : 0) },
    sources: { pages: PAGES, bases: BASES },
    pointInTime: "Alle Signale nach Einreichungsdatum (filing date). Eine Einreichung nach dem Stichtag ist an ihm unsichtbar, auch wenn die Transaktion davor lag.",
    layout: { current: "current/<SHARD>.json.gz (core/identity.js#shardKey)", history: "history/<SHARD>.json.gz: issuers[TICKER] = {from: erstes Monatsende, rows: [[...columns]]} je Monatsende" },
    columns: COLUMN_DOC,
    history: { grain: "month-end", firstMonth: months[0] || null, lastMonth: months[months.length - 1] || null, months: months.length },
    coverage: Object.assign({
      universeTickers: universe.length, universeIssuersWithCik: universeCiks.size,
      cusipMap: { cusips: cmap.map.size, tickers: cmap.tickersMapped, ambiguousSymbols: cmap.ambiguousSymbols, rejectedReusedSymbols: cmap.rejectedReuse, latestObservation: cmap.latestObservation, ftdFiles: stats.ftdFiles, ftdMissing: stats.ftdMissing },
      insider: { datasets: stats.insiderDatasets.length, missing: stats.insiderMissing, coverageEnd: insiderCoverageEnd, accessionsInUniverse: stats.insiderAccessions, transactionsInUniverse: stats.insiderTransactions, purchasesByInsiders: stats.insiderPurchases, implausibleValuesNulled: stats.implausibleValues, salesByInsiders: stats.insiderSales, issuersWithTransactions: txByCik.size, amendmentsSkipped: stats.insiderAmendmentsSkipped, planColumnSeen: stats.planColumnSeen, form4GapFill: stats.form4 },
      schedules: Object.assign({ indexQuarters: stats.indexQuarters.length, indexMissing: stats.indexMissing, issuersWithFilings: scheduleByCik.size }, stats.schedule),
      thirteenF: Object.assign({}, stats.thirteenF, { datasets: stats.thirteenF.datasets.length, managers: managerIndex.size, periods: [...filedDay.keys()].sort() }),
      sharesBaseIssuers: sharesBase.size
    }, counters),
    datasets: { insider: stats.insiderDatasets, thirteenF: stats.thirteenF.datasets, indexQuarters: stats.indexQuarters },
    methodology: METHODOLOGY,
    limitations: LIMITATIONS,
    runtimeSeconds: Math.round((Date.now() - t0) / 1000)
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  rmSync(work, { recursive: true, force: true });
  return manifest;
}
function sortObj(o) { return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])); }

export const COLUMN_DOC = {
  ib90: "verschiedene Insider (Officer/Director/10%) mit Kaeufen am offenen Markt (Code P), Einreichung in den letzten 90 Tagen",
  ib180: "dasselbe, 180 Tage", is90: "verschiedene Insider mit Verkaeufen (Code S), 90 Tage",
  ibo90: "davon Officer (Kaeufer, 90 Tage)", ibd90: "davon Director (Kaeufer, 90 Tage)", ibt90: "davon 10-%-Eigner (Kaeufer, 90 Tage)",
  ibx90: "Kaeufer ohne als 10b5-1-Plan gekennzeichnete Kaeufe (90 Tage)",
  bv90: "Kaufwert USD (Aktien x gemeldeter Preis), 90 Tage", sv90: "Verkaufswert USD, 90 Tage", svx90: "Verkaufswert USD ohne 10b5-1-Plan, 90 Tage",
  nbv90: "Nettokaufwert USD (Kauf - Verkauf), 90 Tage", nbv180: "Nettokaufwert USD, 180 Tage",
  nsh90: "Nettoaktien (gekauft - verkauft), 90 Tage", nsp90: "Nettoaktien in % der Aktienbasis (sonst null)",
  cb: "Cluster-Kauf: >= 3 verschiedene Insider kaufen innerhalb von 30 Tagen (Transaktionsdatum), alle Meldungen <= 90 Tage alt",
  d13n: "neue Schedule 13D (aktivistisch), 90 Tage", g13n: "neue Schedule 13G (passiv), 90 Tage", d13a: "13D-Aenderungen, 90 Tage", g13a: "13G-Aenderungen, 90 Tage",
  fp: "13F-Quartal (juengstes mit abgelaufener 45-Tage-Frist)", fh: "Institutionen mit Position", fhp: "Institutionen mit Position im Vorquartal",
  fnew: "neue Positionen (Verwalter hat fuers Vorquartal gemeldet, damals ohne Position)", fexit: "aufgeloeste Positionen (Verwalter hat fuers Quartal gemeldet, ohne Position)",
  finc: "aufgestockt", fdec: "reduziert", fsh: "gehaltene Aktien gesamt", fshp: "gehaltene Aktien Vorquartal",
  fdsh: "Nettoveraenderung der Aktien im abgeglichenen Panel (nur Verwalter mit Meldung in beiden Quartalen)", fval: "Wert USD (normiert, siehe Methodik)",
  fio: "gehaltene Aktien in % der Aktienbasis (Doppelzaehlungen moeglich, > 100 % moeglich)"
};
export const METHODOLOGY = {
  pointInTime: "Sichtbarkeit nach Einreichungsdatum; Fenster 90/180 Tage auf dem Einreichungsdatum.",
  insider: "Nur nicht-derivative Transaktionen mit Code P (Kauf am offenen Markt) und S (Verkauf am offenen Markt) aus Form 4 und 5. Aenderungen (4/A, 5/A) werden nicht gezaehlt. Gemeinsame Meldungen mehrerer Eigner zaehlen den Wert einmal, jeden Eigner als Insider. Nur Eigner mit Rolle Officer, Director oder 10-%-Eigner.",
  plan10b5One: "Eine Transaktion gilt als 10b5-1-Plan, wenn die Einreichung das Kontrollkaestchen (AFF10B5ONE / aff10b5One, seit 2023) setzt oder eine an der Transaktion referenzierte Fussnote '10b5-1' nennt.",
  schedules: "Formulare SC 13D/13G (bis 2024) und SCHEDULE 13D/13G (ab 18.12.2024), je Accession einmal. Der Gegenstand wird aus den Indexzeilen bestimmt (quant/engines/ownership-signals.js#resolveScheduleSubject); Mehrdeutiges wird verworfen.",
  thirteenF: "Je Verwalter und Quartal die erste Originalmeldung (13F-HR) plus Aenderungen vom Typ NEW HOLDINGS; nur Aktien (SSHPRNAMTTYPE=SH), keine Optionen (PUTCALL leer). VALUE bis 02.01.2023 in Tausend USD, ab 03.01.2023 in USD (nach Einreichungsdatum), mit Plausibilitaetspruefung je Einreichung (Median Wert je Aktie).",
  cusipMapping: "CUSIP -> Ticker aus den Fails-to-Deliver-Daten der SEC: ein CUSIP gehoert dem Symbol, unter dem er zuletzt gefuehrt wurde; historische CUSIPs nur mit derselben Emittentennummer (CUSIP-6) wie ein aktueller.",
  sharesBase: "Aktienbasis = juengster eingereichter Jahreswert der verwaesserten gewichteten Aktienzahl (SEC companyfacts, quant/data/sec/consumer), nur fuer Emittenten mit genau einem Stammtitel im Universum und ohne ADR."
};
export const LIMITATIONS = [
  "Ueberlebende: das Universum ist das heutige Produktuniversum - delistete Emittenten fehlen in der Historie (Backtests muessen das beruecksichtigen).",
  "Insider-Aenderungsmeldungen (4/A) werden ignoriert; korrigierte Werte gehen damit verloren, Doppelzaehlungen werden vermieden.",
  "Form 3 enthaelt keine Transaktionen; Form 5 (nachtraegliche Jahresmeldung) zaehlt ab ihrem Einreichungsdatum.",
  "10b5-1: das Kontrollkaestchen gibt es erst seit 2023 und gilt fuer die ganze Einreichung; vorher nur Fussnoten. Fruehe Jahre unterschaetzen Planverkaeufe.",
  "Kaufwerte ohne gemeldeten Preis zaehlen mit 0 USD (ntx180/noPrice180 im aktuellen Stand).",
  "13F: Vertrauliche Meldungen (ISCONFIDENTIALOMITTED) und Meldungen, deren Tabelle im Datensatz unter 90 % der angegebenen Zeilen traegt, zaehlen nicht als \"hat gemeldet\" (keine Neu- oder Ausstiege daraus). Eine RESTATEMENT-Aenderung ersetzt ein solches Original nur im selben Datensatz; sonst werden RESTATEMENT-Aenderungen nicht uebernommen; Verwalter, die dieselben Positionen ueber Sub-Advisor/Other Manager mehrfach melden, koennen doppelt zaehlen (fio > 100 % moeglich).",
  "13F-Positionen ohne CUSIP-Zuordnung (kein Fails-to-Deliver-Eintrag unter dem heutigen Ticker) fehlen.",
  "Schedule 13D/13G: Rolle (Gegenstand/Meldender) kommt nicht aus dem Index; Meldungen mit zwei Universums-Parteien ohne klare Regel werden verworfen (coverage.schedules.ambiguous).",
  "Aktuelle Insider-Daten nach dem letzten Quartalsdatensatz stammen aus einzeln geholten Form-4-Einreichungen; ist die Luecke nicht vollstaendig geholt (coverage.insider.form4GapFill.complete=false), sind betroffene Monatswerte null und der aktuelle Stand traegt insider.complete=false.",
  "Aktienbasis ist eine Jahreszahl (verwaessert, gewichtet), keine taggenaue ausstehende Aktienzahl."
];

/* ------------------------------------------------------------ als Skript */
if (process.argv[1] && process.argv[1].endsWith("build-ownership-signals.mjs")) {
  const a = parseArgs(process.argv.slice(2));
  const opts = {
    out: a.out, cache: a.cache, work: a.work, since: a.since, asOf: a["as-of"],
    form4Max: a["form4-max"] !== undefined ? Number(a["form4-max"]) : (process.env.FORM4_MAX ? Number(process.env.FORM4_MAX) : undefined),
    sourceDir: a["source-dir"], universeFile: a["universe-file"], consumerDir: a["consumer-dir"]
  };
  if (!opts.sourceDir) opts.client = createSecClient({ userAgent: process.env.SEC_USER_AGENT || DEFAULT_UA, rate: Number(process.env.SEC_RATE || 6) });
  build(opts).then((m) => {
    const c = m.coverage;
    log("\nEigentuemer-Signale " + m.asOf);
    log(`  Titel mit Signal:        ${c.tickersWithAnySignal} von ${c.universeTickers}`);
    log(`  Insider:                 ${c.insider.datasets} Datensaetze bis ${c.insider.coverageEnd}, ${c.insider.transactionsInUniverse} Transaktionen, ${c.insider.issuersWithTransactions} Emittenten`);
    log(`  Form-4-Luecke:           ${c.insider.form4GapFill.fetched} geholt, ${c.insider.form4GapFill.cached} gecacht, vollstaendig: ${c.insider.form4GapFill.complete}`);
    log(`  Schedule 13D/13G:        ${c.schedules.resolved} zugeordnet von ${c.schedules.filings} (${c.schedules.ambiguous} mehrdeutig)`);
    log(`  13F:                     ${c.thirteenF.datasets} Datensaetze, ${c.thirteenF.filings} Meldungen, ${c.tickersWith13F} Ticker`);
    log(`  Historie:                ${m.history.firstMonth} .. ${m.history.lastMonth} (${m.history.months} Monate)`);
    log(`  Anfragen an die SEC:     ${m.access.requests}`);
    if (a["no-gates"]) return;
    const fails = [];
    if (c.insider.datasets < 30) fails.push(`nur ${c.insider.datasets} Insider-Datensaetze`);
    if (c.thirteenF.datasets < 30) fails.push(`nur ${c.thirteenF.datasets} 13F-Datensaetze`);
    if (c.insider.purchasesByInsiders < 5000 || c.insider.salesByInsiders < 50000) fails.push(`Insider-Rollen nicht erkannt (Kaeufe ${c.insider.purchasesByInsiders}, Verkaeufe ${c.insider.salesByInsiders})`);
    if (c.insider.issuersWithTransactions < 1000) fails.push(`nur ${c.insider.issuersWithTransactions} Emittenten mit Insider-Transaktionen`);
    if (c.tickersWith13F < 1500) fails.push(`nur ${c.tickersWith13F} Ticker mit 13F`);
    if (c.schedules.resolved < 5000) fails.push(`nur ${c.schedules.resolved} zugeordnete 13D/13G`);
    /* Loecher sind schlimmer als ein kuerzerer Zeitraum: sie sehen aus wie "keine Aktivitaet". */
    const ins = m.datasets.insider.map((x) => x.start).sort();
    const insHoles = c.insider.missing.filter((n) => { const w = E.datasetWindow(n); return w && ins.length && w.start > ins[0] && w.end < c.insider.coverageEnd; });
    if (insHoles.length) fails.push(`Insider-Datensaetze fehlen mitten im Zeitraum: ${insHoles.join(", ")}`);
    const per = c.thirteenF.periods || [];
    for (let i = 1; i < per.length; i++) if (E.prevQuarterEnd(per[i]) !== per[i - 1]) fails.push(`13F-Quartal fehlt vor ${per[i]}`);
    const curQ = E.quarterOf(m.asOf);
    const idxHoles = c.schedules.indexMissing.filter((q) => q !== `${curQ.year}Q${curQ.q}`);
    if (idxHoles.length) fails.push(`EDGAR-Index fehlt: ${idxHoles.join(", ")}`);
    const latest13f = (c.thirteenF.periods || []).slice(-1)[0];
    if (!latest13f || E.dayOf(m.asOf) - E.dayOf(latest13f) > 200) fails.push(`juengstes 13F-Quartal ${latest13f} zu alt`);
    if (fails.length) { console.error("::error::Abdeckung zu gering: " + fails.join("; ")); process.exit(1); }
  }).catch((err) => { console.error(err.stack || err.message); process.exit(1); });
}
