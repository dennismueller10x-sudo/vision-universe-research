/* =========================================================================
   VISION UNIVERSE VORSORGE — probe-eu-etf-sources.mjs   (vorsorge-eu-probe-1.0.0)

   PRUEFT FREIE / OFFIZIELLE EU-QUELLEN FUER UCITS-ETFS, BEVOR EIN ADAPTER
   GEBAUT WIRD. Lokal sind die Domains gesperrt; die Probe laeuft in GitHub
   Actions (Marker [vorsorge-eu-probe]).

   Je Quelle: Erreichbarkeit, Format, Kopfzeile/Feldnamen, Zeilenzahl, Anteil
   ETF-Zeilen, Links auf Download-Dateien und Auszuege aus Nutzungsbedingungen
   (<= 400 Zeichen je Treffer). Keine Werte werden uebernommen.
   Emittenten-Datenendpunkte werden NICHT abgerufen (Bedingungen, siehe
   docs/ETF_DATA_RIGHTS.md).

   Ausgabe: vorsorge/data/sources/etf-eu-source-probe.json
   ========================================================================= */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, "vorsorge/data/sources/etf-eu-source-probe.json");
const UA = "VisionUniverse-Research/1.0 (+https://research.visionuniverse.de)";
const NOW = new Date();
const d = (n) => new Date(NOW.getTime() - n * 864e5).toISOString().slice(0, 10);
const TERMS_RE = /(robot|spider|scrap|automat|crawl|reproduc|redistribut|re-?use|weiterverwend|commercial|kommerziell|vervielf|weitergabe|verbreit|written (consent|permission)|schriftlich|source is (acknowledged|quoted)|quelle|attribution|licen[cs]e|lizenz|non-commercial|personal use|private)/i;

async function get(url, { method = "GET", max = 3e6, binary = false, timeout = 60000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, redirect: "follow", headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeout) });
    let text = null, buf = null;
    if (method !== "HEAD") { buf = Buffer.from(await res.arrayBuffer()); text = binary ? null : buf.subarray(0, max).toString("utf8"); }
    return { status: res.status, ms: Date.now() - t0, finalUrl: res.url, contentType: res.headers.get("content-type"), bytes: buf ? buf.length : Number(res.headers.get("content-length")) || null, lastModified: res.headers.get("last-modified"), text, buf };
  } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e).slice(0, 160) }; }
}
const strip = (html) => String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
function excerpts(html, n = 8) {
  const txt = strip(html), out = [], re = new RegExp(TERMS_RE.source, "gi"); let m;
  while ((m = re.exec(txt)) && out.length < n) {
    const s = Math.max(0, m.index - 200), e = Math.min(txt.length, m.index + 260), piece = txt.slice(s, e).trim();
    if (!out.some((o) => o.includes(piece.slice(40, 120)))) out.push(piece.slice(0, 400));
    re.lastIndex = e;
  }
  return out;
}
const links = (html, re) => [...new Set(String(html || "").match(re) || [])].slice(0, 40);
const footerLinks = (html) => links(html, /href="[^"]*(terms|legal|disclaimer|nutzungsbedingung|impressum|rechtlich|copyright|conditions|usage)[^"]*"/gi).map((x) => x.slice(6, -1));

const report = { schemaVersion: "vu-etf-eu-source-probe-1.0.0", runDate: NOW.toISOString().slice(0, 10), note: "Nur Metadaten, Kopfzeilen, Zaehlungen und Auszuege aus Nutzungsbedingungen.", sources: [] };
const add = (row) => { report.sources.push(row); console.log(row.id, row.status, row.summary || ""); };
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));

/* ---------------- 1. ESMA FITRS (Transparenz) + Fonds-Register-Kerne */
{
  let r = await get(`https://registers.esma.europa.eu/solr/esma_registers_fitrs_files/select?q=*:*&wt=json&start=0&rows=500&sort=publication_date%20desc`);
  if (r.status !== 200) r = await get(`https://registers.esma.europa.eu/solr/esma_registers_fitrs_files/select?q=*:*&wt=json&start=0&rows=500`);
  const row = { id: "esma-fitrs-files", url: "registers.esma.europa.eu/solr/esma_registers_fitrs_files", status: r.status, error: r.error };
  try {
    const docs = JSON.parse(r.text).response.docs || [];
    row.fileTypes = [...new Set(docs.map((x) => x.file_type))];
    row.sampleNames = [...new Set(docs.map((x) => x.file_name))].slice(0, 40); row.docKeys = Object.keys(docs[0] || {});
    row.files = docs.filter((x) => /^FULECR_/.test(x.file_name)).map((x) => ({ file_name: x.file_name, download_link: x.download_link, publication_date: x.publication_date })).slice(0, 30);
    const ce = docs.filter((x) => /^FULECR_\d{8}_C/.test(x.file_name)).sort((a, b) => (a.file_name < b.file_name ? 1 : -1))[0];
    if (ce) {
      const z = await get(ce.download_link, { binary: true, timeout: 300000 });
      row.sampleFile = { name: ce.file_name, status: z.status, bytes: z.bytes };
      if (z.buf) {
        const tmp = join(root, ".market-cache/fitrs-probe.zip"); mkdirSync(dirname(tmp), { recursive: true }); writeFileSync(tmp, z.buf);
        const xml = execFileSync("unzip", ["-p", tmp], { maxBuffer: 1 << 30 }).toString("utf8"); rmSync(tmp, { force: true });
        const recs = xml.split(/<(?:\w+:)?EqtyTrnsprncyData>/).slice(1);
        const cls = {}; recs.forEach((x) => { const m = x.match(/<(?:\w+:)?FinInstrmClssfctn>([^<]+)</); const k = m ? m[1] : "?"; cls[k] = (cls[k] || 0) + 1; });
        row.sampleFile.records = recs.length; row.sampleFile.classifications = cls;
        row.sampleFile.tags = [...new Set((recs[0] || "").match(/<(?:\w+:)?(\w+)>/g) || [])].slice(0, 60);
        const etf = recs.find((x) => /ETFS</.test(x)); row.sampleFile.etfRecordShape = etf ? etf.replace(/>[^<]{1,}</g, ">…<").slice(0, 900) : null;
      }
    }
    row.summary = (row.files || []).length + " FULECR-Dateien";
  } catch (e) { row.parseError = String(e.message).slice(0, 120); }
  add(row);
}
for (const core of ["esma_registers_funds_cbdif", "esma_registers_cbdif", "esma_registers_funds", "esma_registers_ucits_mgt_cos"]) {
  const r = await get(`https://registers.esma.europa.eu/solr/${core}/select?q=*:*&wt=json&rows=3`);
  const row = { id: "esma-core-" + core, status: r.status, error: r.error };
  try { const j = JSON.parse(r.text); row.numFound = j.response.numFound; row.fields = Object.keys((j.response.docs || [])[0] || {}).slice(0, 60); row.summary = row.numFound + " Dokumente"; } catch (e) { row.parseError = String(e.message).slice(0, 80); }
  add(row); await sleep(400);
}

/* ---------------- 2. Deutsche Boerse: Instrumentenliste, ETF/ETP-Liste, Bedingungen */
{
  const page = await get("https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/Downloads");
  const csvLink = links(page.text, /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/t7-xetr-allTradableInstruments\.csv/gi)[0];
  const row = { id: "xetra-all-tradable-instruments", status: page.status, footerLinks: footerLinks(page.text), pageExcerpts: excerpts(page.text) };
  if (csvLink) {
    const c = await get("https://www.cashmarket.deutsche-boerse.com" + csvLink, { max: 6e7, timeout: 120000 });
    row.csv = { url: csvLink, status: c.status, bytes: c.bytes };
    if (c.text) {
      const lines = c.text.split(/\r?\n/).filter(Boolean);
      const hi = lines.findIndex((l) => /ISIN/i.test(l) && l.includes(";"));
      const head = (lines[hi] || "").split(";"); row.csv.preamble = lines.slice(0, Math.max(0, hi)).slice(0, 4); row.csv.header = head;
      const ti = head.findIndex((h) => /Instrument Type|Product Assignment|Instrument Group|Product Type/i.test(h));
      const rows = lines.slice(hi + 1).map((l) => l.split(";"));
      row.csv.rows = rows.length;
      const types = {}; rows.forEach((r) => { const k = ti >= 0 ? r[ti] : "?"; types[k] = (types[k] || 0) + 1; }); row.csv.types = Object.fromEntries(Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 25));
      row.csv.columnsWithTerOrWkn = head.filter((h) => /TER|WKN|Replic|Distribut|Ertrag|Benchmark|Index/i.test(h));
      const gi = head.indexOf("Product Assignment Group"), gd = head.indexOf("Product Assignment Group Description"), wi = head.indexOf("WKN"), it = head.indexOf("Instrument Type");
      const groups = {}; rows.forEach((r) => { const k = r[gi]; if (!groups[k]) groups[k] = { description: r[gd], rows: 0, withWkn: 0, instrumentTypes: {} }; groups[k].rows++; if (r[wi]) groups[k].withWkn++; groups[k].instrumentTypes[r[it]] = (groups[k].instrumentTypes[r[it]] || 0) + 1; });
      row.csv.groups = groups;
    }
  }
  row.summary = row.csv ? row.csv.rows + " Zeilen" : "kein CSV-Link";
  add(row);
}
{
  const page = await get("https://www.cashmarket.deutsche-boerse.com/cash-en/Data-Tech/statistics/etf-etp-statistics/etp-list");
  const row = { id: "xetra-etf-etp-list", status: page.status, footerLinks: footerLinks(page.text), pageExcerpts: excerpts(page.text, 4) };
  row.files = links(page.text, /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/[^"'\s]+\.(xlsx|xls|csv)/gi);
  if (row.files[0]) {
    const x = await get("https://www.cashmarket.deutsche-boerse.com" + row.files[0], { binary: true, timeout: 120000 });
    row.sample = { status: x.status, bytes: x.bytes, contentType: x.contentType };
    if (x.buf && /\.xlsx/i.test(row.files[0])) {
      try { const { readXlsx } = await import(join(root, "scripts/vorsorge/adapters/xlsx.mjs")); const wb = readXlsx(x.buf); const rows = wb.rows || []; const hi = rows.findIndex((r) => r.some((c) => /ISIN/i.test(String(c)))); row.sample.sheetNames = wb.sheetNames; row.sample.header = rows[hi] || null; row.sample.rows = rows.length - hi - 1; } catch (e) { row.sample.xlsxError = String(e.message).slice(0, 120); }
    }
  }
  row.summary = row.files.length + " Dateien";
  add(row);
}
for (const [id, url] of [
  ["db-terms-cashmarket", "https://www.cashmarket.deutsche-boerse.com/cash-en/meta/terms-of-use"],
  ["db-terms-cashmarket-de", "https://www.cashmarket.deutsche-boerse.com/cash-de/meta/nutzungsbedingungen"],
  ["db-legal-notice", "https://www.deutsche-boerse.com/dbg-en/meta/legal-notice"],
  ["db-delayed-data", "https://www.mds.deutsche-boerse.com/mds-en/real-time-data/Delayed-data"],
  ["esma-legal-notice", "https://registers.esma.europa.eu/publication/legalNoticePage"],
  ["bafin-terms", "https://www.bafin.de/DE/service/nutzungsbedingungen/nutzungsbedingungen_node.html"],
  ["bafin-fondsdb", "https://portal.mvp.bafin.de/database/FondsInfo/"],
  ["cbi-downloads", "https://registers.centralbank.ie/DownloadsPage.aspx"],
  ["cbi-psi-licence", "https://www.centralbank.ie/fns/re-use-of-public-sector-information"],
  ["cssf-terms", "https://www.cssf.lu/en/terms-of-service-and-privacy-policy/"],
  ["ecb-usage-policy", "https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html"],
  ["ecb-investment-funds-list", "https://www.ecb.europa.eu/stats/financial_corporations/list_of_financial_institutions/html/index.en.html"],
  ["tiingo-pricing", "https://www.tiingo.com/about/pricing"],
  ["tiingo-tos", "https://www.tiingo.com/about/terms-of-use"]
]) {
  const r = await get(url);
  add({ id, url, status: r.status, finalUrl: r.finalUrl || null, error: r.error, excerpts: excerpts(r.text), downloadLinks: links(r.text, /href="[^"]*\.(csv|xlsx|xls|zip|xml|pdf)[^"]*"/gi).slice(0, 20).map((x) => x.slice(6, -1)), footerLinks: footerLinks(r.text).slice(0, 15) });
  await sleep(500);
}

/* ---------------- 2b. Deutsche Boerse: Disclaimer/Nutzungserklaerungen, ETF-Stammdatenblatt */
for (const [id, url] of [
  ["db-cashmarket-disclaimer", "https://www.cashmarket.deutsche-boerse.com/cash-en/disclaimer"],
  ["db-cashmarket-disclaimer-de", "https://www.cashmarket.deutsche-boerse.com/cash-de/disclaimer"],
  ["db-group-disclaimer", "https://www.deutsche-boerse.com/dbg-en/meta/disclaimer"],
  ["db-mds-data-usage-declaration", "https://www.mds.deutsche-boerse.com/mds-en/real-time-data/data-usage-declaration"],
  ["db-mds-disclaimer", "https://www.mds.deutsche-boerse.com/mds-en/disclaimer"],
  ["db-reference-data", "https://www.mds.deutsche-boerse.com/mds-en/data-services/reference-data"]
]) {
  const r = await get(url);
  const txt = strip(r.text); const main = Math.max(0, txt.search(/(Disclaimer|Haftungsausschluss|Nutzungs|Terms|Declaration|Erkl)/i) - 200);
  add({ id, url, status: r.status, finalUrl: r.finalUrl || null, error: r.error, excerpts: excerpts(r.text, 12), fullText: txt.slice(main, main + 9000), downloadLinks: links(r.text, /href="[^"]*\.(pdf|xlsx|csv)[^"]*"/gi).slice(0, 15).map((x) => x.slice(6, -1)) });
  await sleep(500);
}
{
  const page = await get("https://www.cashmarket.deutsche-boerse.com/cash-en/Data-Tech/statistics/etf-etp-statistics/etp-list");
  const f = links(page.text, /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/[^"'\s]+\.(xlsx|xls|csv)/gi)[0];
  const row = { id: "xetra-master-datasheet", file: f || null };
  if (f) {
    const x = await get("https://www.cashmarket.deutsche-boerse.com" + f, { binary: true, timeout: 120000 });
    row.status = x.status; row.bytes = x.bytes; row.contentType = x.contentType;
    if (x.buf) {
      row.magic = x.buf.subarray(0, 8).toString("hex"); row.textStart = x.buf.subarray(0, 300).toString("utf8").replace(/[^\x20-\x7e]/g, ".");
      const tmp = join(root, ".market-cache/master-datasheet.xls"); mkdirSync(dirname(tmp), { recursive: true }); writeFileSync(tmp, x.buf);
      if (row.magic.startsWith("504b")) {
        try {
          const { readXlsx } = await import(join(root, "scripts/vorsorge/adapters/xlsx.mjs"));
          const wb = readXlsx(x.buf); const rows = wb.rows || [];
          const hi = rows.findIndex((r) => r.some((c) => /ISIN/i.test(String(c))));
          const head = hi >= 0 ? rows[hi].map(String) : [];
          const filled = {}; head.forEach((h, c) => { filled[h] = rows.slice(hi + 1).filter((r) => String(r[c] ?? "").trim() !== "").length; });
          const distinct = {}; head.forEach((h, c) => { if (/replic|distribut|ertrag|currency|w.hrung|asset|class|domicile|domizil|index|benchmark|issuer|emittent|product|ucits|ter\b|fee|kosten/i.test(h)) { const m = {}; rows.slice(hi + 1).forEach((r) => { const v = String(r[c] ?? "").trim(); if (v) m[v] = (m[v] || 0) + 1; }); distinct[h] = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12); } });
          row.sheets = [{ sheet: wb.sheetNames && wb.sheetNames[0], sheetNames: wb.sheetNames, rows: rows.length, headerRow: hi, header: head, filled, distinct, preamble: rows.slice(0, Math.max(0, hi)).slice(0, 6).map((r) => r.slice(0, 6).map((v) => String(v).slice(0, 80))) }];
        } catch (e) { row.parseError = String(e.message).slice(0, 200); }
      } else try {
        execFileSync("python3", ["-m", "pip", "install", "-q", "xlrd==2.0.1"], { stdio: "ignore" });
        const py = `import xlrd,json,sys
b=xlrd.open_workbook(sys.argv[1])
out=[]
for sh in b.sheets():
    hi=None
    for r in range(min(sh.nrows,30)):
        vals=[str(v) for v in sh.row_values(r)]
        if any('ISIN' in v.upper() for v in vals): hi=r; break
    head=[str(v) for v in sh.row_values(hi)] if hi is not None else []
    fill={}
    if hi is not None:
        for c,h in enumerate(head):
            n=sum(1 for r in range(hi+1,sh.nrows) if str(sh.cell_value(r,c)).strip()!='')
            fill[h]=n
    out.append({'sheet':sh.name,'rows':sh.nrows,'headerRow':hi,'header':head,'filled':fill,'preamble':[[str(v)[:60] for v in sh.row_values(r)][:6] for r in range(0,min(hi or 0,6))]})
print(json.dumps(out))`;
        row.sheets = JSON.parse(execFileSync("python3", ["-c", py, tmp], { maxBuffer: 1 << 26 }).toString("utf8"));
      } catch (e) { row.parseError = String(e.message).slice(0, 200); }
      rmSync(tmp, { force: true });
    }
  }
  row.summary = row.sheets ? row.sheets.map((s) => s.sheet + ":" + s.rows).join(",") : (row.parseError || "keine Datei");
  add(row);
}

/* ---------------- 2c. ESMA Fondsregister: Rechtsrahmen, ETF-Namen, Vertriebslaender */
{
  const base = "https://registers.esma.europa.eu/solr/esma_registers_funds_cbdif/select?wt=json";
  const row = { id: "esma-funds-cbdif-facets" };
  const f = await get(base + "&q=*:*&rows=0&facet=true&facet.limit=40&facet.field=funds_legal_framework_name&facet.field=funds_domicile_cou_code&facet.field=funds_status_code_name&facet.field=entity_type&facet.field=type_s");
  try { row.facets = JSON.parse(f.text).facet_counts.facet_fields; } catch (e) { row.facetError = String(e.message).slice(0, 80) + " " + f.status; }
  const e = await get(base + "&q=funds_national_name:*ETF*&rows=5");
  try { const j = JSON.parse(e.text); row.etfNamed = j.response.numFound; row.etfSample = (j.response.docs || []).slice(0, 5); } catch (x) { row.etfError = String(x.message).slice(0, 80) + " " + e.status; }
  const w = await get(base + "&q=funds_national_name:%22iShares%20Core%20MSCI%20World%20UCITS%20ETF%22&rows=5");
  try { row.iwdaSample = JSON.parse(w.text).response.docs; } catch (x) { row.iwdaError = w.status; }
  row.summary = (row.etfNamed || 0) + " Fonds mit ETF im Namen";
  add(row);
}

/* ---------------- 3. EZB-Referenzkurse (Waehrungsumrechnung) */
{
  const r = await get("https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP+CHF.EUR.SP00.A?format=csvdata&lastNObservations=2");
  const lines = String(r.text || "").split(/\r?\n/).filter(Boolean);
  add({ id: "ecb-exr-api", status: r.status, error: r.error, header: (lines[0] || "").split(",").slice(0, 20), rows: lines.length - 1, summary: (lines.length - 1) + " Zeilen" });
}

/* ---------------- 4. Tiingo: unterstuetzte Boersen (ohne Schluessel, oeffentliche Datei) */
{
  const z = await get("https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip", { binary: true, timeout: 180000 });
  const row = { id: "tiingo-supported-tickers", status: z.status, bytes: z.bytes };
  if (z.buf && z.status === 200) {
    const tmp = join(root, ".market-cache/tiingo-tickers.zip"); mkdirSync(dirname(tmp), { recursive: true }); writeFileSync(tmp, z.buf);
    const csv = execFileSync("unzip", ["-p", tmp], { maxBuffer: 1 << 30 }).toString("utf8"); rmSync(tmp, { force: true });
    const lines = csv.split(/\r?\n/).filter(Boolean), head = lines[0].split(","); const ei = head.indexOf("exchange"), ai = head.indexOf("assetType");
    const ex = {}; lines.slice(1).forEach((l) => { const c = l.split(","); if (c[ai] === "ETF") ex[c[ei]] = (ex[c[ei]] || 0) + 1; });
    row.header = head; row.etfByExchange = Object.fromEntries(Object.entries(ex).sort((a, b) => b[1] - a[1]).slice(0, 30));
    row.summary = Object.keys(ex).length + " Boersen mit ETFs";
  }
  add(row);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
console.log("Fertig:", report.sources.length, "Quellen");
