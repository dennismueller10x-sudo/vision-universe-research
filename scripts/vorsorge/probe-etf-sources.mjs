/* =========================================================================
   VISION UNIVERSE VORSORGE — probe-etf-sources.mjs

   PRUEFT OFFIZIELLE ETF-QUELLEN, BEVOR EIN ADAPTER GEBAUT WIRD.

   Zwei Arten von Abrufen, beide einmalig je Lauf:
   1. Nutzungsbedingungen und robots.txt der Emittenten - um festzustellen,
      OB automatisierter Abruf erlaubt ist. Datenendpunkte der Emittenten
      werden NICHT abgerufen: deren Bedingungen verbieten nach der
      Recherche (docs/ETF_PRIMARY_SOURCE_MATRIX.md) automatisierten Abruf
      bzw. Weiterverbreitung ohne Zustimmung.
   2. Regulatorische / offen lizenzierte Quellen (SEC, ESMA FIRDS, GLEIF,
      Deutsche Boerse Instrumentenliste): Erreichbarkeit, Format, Groesse,
      Kopfzeilen - keine Werte.

   Ergebnis: vorsorge/data/sources/etf-source-probe.json (nur Metadaten,
   Auszuege aus Bedingungen <= 400 Zeichen je Treffer).

   GitHub Actions, Marker [vorsorge-etf-probe].
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, "vorsorge/data/sources/etf-source-probe.json");
const SEC_UA = process.env.SEC_USER_AGENT || "VisionUniverseResearch info@visionuniverse.de";
const VU_UA = "VisionUniverse-Research/1.0 (+https://research.visionuniverse.de)";
const NOW = new Date();
const d = (n) => new Date(NOW.getTime() - n * 864e5).toISOString().slice(0, 10);

/* Bedingungen: Seite + Suchmuster fuer die relevanten Klauseln. */
const TERMS_RE = /(robot|spider|scrap|automat|crawl|reproduc|redistribut|commercial|kommerziell|vervielf|weitergabe|verbreit|written (consent|permission)|schriftlich|personal (and|or) (non-commercial|internal)|private use)/i;
const TERMS = [
  ["BLACKROCK", "https://www.blackrock.com/corporate/compliance/terms-and-conditions"],
  ["BLACKROCK", "https://www.ishares.com/uk/individual/en/compliance/terms-and-conditions"],
  ["BLACKROCK", "https://www.ishares.com/robots.txt"],
  ["VANGUARD", "https://investor.vanguard.com/terms-conditions"],
  ["VANGUARD", "https://www.vanguard.co.uk/professional/terms-and-conditions"],
  ["STATE_STREET", "https://www.ssga.com/us/en/footer/terms-and-conditions"],
  ["STATE_STREET", "https://www.ssga.com/robots.txt"],
  ["INVESCO", "https://www.invesco.com/us/en/resources/terms-of-use.html"],
  ["AMUNDI", "https://www.amundietf.de/de/professionell/rechtshinweise"],
  ["AMUNDI", "https://www.amundietf.de/robots.txt"],
  ["DWS", "https://etf.dws.com/en-no/footer/terms-of-use/"],
  ["DWS", "https://www.dws.com/mifid_emt/"],
  ["WISDOMTREE", "https://www.wisdomtree.eu/en-gb/terms-and-conditions"],
  ["UBS", "https://www.ubs.com/global/en/legal/disclaimer.html"],
  ["HSBC", "https://www.assetmanagement.hsbc.co.uk/en/individual-investor/legal-information"],
  ["VANECK", "https://www.vaneck.com/nl/en/terms-and-conditions/"],
  ["LEGAL_GENERAL", "https://fundcentres.landg.com/terms-and-conditions"],
  ["JPMORGAN", "https://am.jpmorgan.com/gb/en/asset-management/per/regulatory/terms-of-use/"],
  ["GLOBAL_X", "https://globalxetfs.eu/terms-of-use"],
  ["FRANKLIN_TEMPLETON", "https://www.franklintempleton.co.uk/resources-and-literature/literature/regulatory-templates"],
  ["DEUTSCHE_BOERSE", "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/Downloads"],
  ["DEUTSCHE_BOERSE", "https://www.deutsche-boerse.com/dbg-en/meta/terms-of-use"],
  ["ESMA", "https://registers.esma.europa.eu/publication/legalNoticePage"],
  ["SEC", "https://www.sec.gov/about/privacy-information"],
  ["GLEIF", "https://www.gleif.org/en/meta/lei-data-terms-of-use"]
];

/* Regulatorische / offene Quellen: Form pruefen. */
const yq = (back) => { const q0 = Math.floor(NOW.getUTCMonth() / 3); let y = NOW.getUTCFullYear(), q = q0 - back; while (q < 0) { q += 4; y--; } return y + "q" + (q + 1); };
const OPEN = [
  { id: "sec-nport-page", sec: true, url: "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets", links: /\/files\/dera\/data\/form-n-port-data-sets\/[0-9]{4}q[1-4]_nport\.zip/gi },
  ...[0, 1, 2, 3, 4].map((b) => ({ id: "sec-nport-" + yq(b), sec: true, method: "HEAD", url: `https://www.sec.gov/files/dera/data/form-n-port-data-sets/${yq(b)}_nport.zip` })),
  { id: "sec-company-tickers-mf", sec: true, url: "https://www.sec.gov/files/company_tickers_mf.json", json: true },
  { id: "sec-rr-page", sec: true, url: "https://www.sec.gov/data-research/sec-markets-data/mutual-fund-prospectus-riskreturn-summary-data-sets", links: /\/files\/[^"'\s]*(rr|risk)[^"'\s]*\.zip/gi },
  { id: "sec-ncen-page", sec: true, url: "https://www.sec.gov/data-research/sec-markets-data/form-n-cen-data-sets", links: /\/files\/[^"'\s]*n-?cen[^"'\s]*\.zip/gi },
  { id: "esma-firds-files", url: `https://registers.esma.europa.eu/solr/esma_registers_firds_files/select?q=*&fq=publication_date:%5B${d(14)}T00:00:00Z+TO+${d(0)}T23:59:59Z%5D&wt=json&start=0&rows=200`, json: true },
  { id: "gleif-fund-sample", url: "https://api.gleif.org/api/v1/lei-records?filter%5Bentity.category%5D=FUND&filter%5Bentity.legalName%5D=iShares%20Core%20MSCI%20World%20UCITS%20ETF&page%5Bsize%5D=3", json: true },
  { id: "xetra-instruments-page", url: "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/Downloads", links: /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/t7-xetr-allTradableInstruments\.csv/gi }
];

async function get(url, { method = "GET", ua = VU_UA, max = 600000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, redirect: "follow", headers: { "User-Agent": ua, "Accept": "*/*", "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(45000) });
    let text = null;
    if (method !== "HEAD") { const buf = Buffer.from(await res.arrayBuffer()); text = buf.subarray(0, max).toString("utf8"); }
    return { status: res.status, ms: Date.now() - t0, finalUrl: res.url, contentType: res.headers.get("content-type"), bytes: Number(res.headers.get("content-length")) || (text ? text.length : null), lastModified: res.headers.get("last-modified"), text };
  } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e).slice(0, 160) }; }
}
function excerpts(html) {
  const txt = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const out = []; const re = new RegExp(TERMS_RE.source, "gi"); let m;
  while ((m = re.exec(txt)) && out.length < 6) {
    const s = Math.max(0, m.index - 180), e = Math.min(txt.length, m.index + 220);
    const piece = txt.slice(s, e).trim();
    if (!out.some((o) => o.includes(piece.slice(40, 120)))) out.push(piece);
    re.lastIndex = e;
  }
  return out;
}

const report = { schemaVersion: "vu-etf-source-probe-1.0.0", generatedAt: NOW.toISOString(), note: "Nur Metadaten und Auszuege aus Nutzungsbedingungen. Datenendpunkte der Emittenten werden nicht abgerufen.", terms: [], open: [] };
for (const [issuer, url] of TERMS) {
  const r = await get(url, { ua: url.includes("sec.gov") ? SEC_UA : VU_UA });
  const robots = url.endsWith("robots.txt") ? String(r.text || "").split("\n").filter((l) => /^(user-agent|disallow|allow|crawl-delay)/i.test(l.trim())).slice(0, 40) : undefined;
  report.terms.push({ issuer, url, status: r.status, finalUrl: r.finalUrl || null, error: r.error, excerpts: robots ? undefined : excerpts(r.text).map((x) => x.slice(0, 400)), robots });
  await new Promise((z) => setTimeout(z, 400));
}
for (const p of OPEN) {
  const r = await get(p.url, { method: p.method || "GET", ua: p.sec ? SEC_UA : VU_UA });
  const row = { id: p.id, url: p.url, status: r.status, ms: r.ms, contentType: r.contentType || null, bytes: r.bytes || null, lastModified: r.lastModified || null, error: r.error };
  if (p.links && r.text) row.links = [...new Set(r.text.match(p.links) || [])].slice(0, 30);
  if (p.json && r.text) {
    try {
      const j = JSON.parse(r.text);
      row.jsonKeys = Object.keys(j).slice(0, 20);
      if (p.id === "sec-company-tickers-mf") { row.fields = j.fields; row.rows = j.data.length; row.sample = j.data.filter((x) => ["IVV", "VTI", "QQQM", "AGG"].includes(x[3])); }
      if (p.id === "esma-firds-files") { const docs = (j.response && j.response.docs) || []; row.files = docs.filter((x) => /FULINS_C|DLTINS/.test(x.file_name)).map((x) => ({ file_name: x.file_name, file_type: x.file_type, download_link: x.download_link, publication_date: x.publication_date })).slice(0, 40); row.numFound = j.response && j.response.numFound; }
      if (p.id === "gleif-fund-sample") { row.sample = (j.data || []).map((x) => ({ lei: x.id, name: x.attributes?.entity?.legalName?.name, category: x.attributes?.entity?.category, jurisdiction: x.attributes?.entity?.jurisdiction, legalForm: x.attributes?.entity?.legalForm?.id, country: x.attributes?.entity?.legalAddress?.country })); }
    } catch (e) { row.jsonError = String(e.message).slice(0, 120); }
  }
  report.open.push(row);
  await new Promise((z) => setTimeout(z, p.sec ? 250 : 400));
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
console.log("Bedingungen:", report.terms.map((t) => t.issuer + " " + t.status).join(", "));
console.log("Offen:", report.open.map((o) => o.id + " " + o.status).join(", "));
