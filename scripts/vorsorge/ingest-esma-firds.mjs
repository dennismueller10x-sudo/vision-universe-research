/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-esma-firds.mjs   (vorsorge-firds-1.0.0)

   EUROPAEISCHE ETF-ANTEILKLASSEN UND LISTINGS AUS ESMA FIRDS (+ GLEIF)

   ESMA FIRDS (Referenzdaten aller an EU-Handelsplaetzen zugelassenen
   Instrumente). Wiederverwendung erlaubt mit Quellenangabe
   (registers.esma.europa.eu/publication/legalNoticePage); Angabe:
   "Quelle: ESMA FIRDS, transformiert von Vision Universe".
   Datei: woechentliche Vollversion FULINS_C_<Datum>_NNofMM.zip
   (CFI-Kategorie C = Organismen fuer gemeinsame Anlagen).

   Auswahl: CFI "CE...." (Exchange Traded Funds) oder Kategorie C mit
   "ETF" im amtlichen Namen. Je ISIN: Name, CFI, Waehrung, Emittenten-LEI,
   Handelsplaetze (MIC, erster Handelstag, Ende).
   Ertragsverwendung aus dem 2. CFI-Attribut (I = ausschuettend,
   G = thesaurierend, J = gemischt) - vom Emittenten codiert, Konfidenz MEDIUM.
   UCITS: FIRDS kennt kein UCITS-Feld. "UCITS" im amtlichen Namen wird als
   Hinweis gefuehrt (Methode NAME_IN_REGULATORY_RECORD), nicht als Beleg.

   GLEIF (CC0): rechtlicher Name und Rechtsordnung (Domizil) je Emittenten-LEI.

   Ausgabe: vorsorge/data/eu/etf-eu-index.json (spaltenweise)
   GitHub Actions, Marker [vorsorge-fundamentals].
   ========================================================================= */
import { createWriteStream, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = require(join(root, "vorsorge/engines/etf-fundamentals.js"));
const WORK = join(root, ".market-cache/vorsorge/firds");
const UA = "VisionUniverse-Research/1.0 (+https://research.visionuniverse.de)";
mkdirSync(WORK, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, timeout = 600000) {
  for (let a = 1; a <= 4; a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(timeout) }); if (r.status === 429 || r.status >= 500) { await sleep(4000 * a); continue; } return r; }
    catch (e) { if (a === 4) throw e; await sleep(4000 * a); }
  }
}

/* --------------------------------------------- neueste Vollversion finden */
const today = new Date(), from = new Date(today.getTime() - 21 * 864e5);
const iso = (d) => d.toISOString().slice(0, 10);
const list = await (await get(`https://registers.esma.europa.eu/solr/esma_registers_firds_files/select?q=*&fq=publication_date:%5B${iso(from)}T00:00:00Z+TO+${iso(today)}T23:59:59Z%5D&fq=file_type:FULINS&wt=json&start=0&rows=500`, 60000)).json();
const docs = (list.response && list.response.docs) || [];
const cFiles = docs.filter((d) => /^FULINS_C_\d{8}_\d+of\d+\.zip$/.test(d.file_name));
const latest = cFiles.map((d) => d.file_name.slice(9, 17)).sort().pop();
if (!latest) throw new Error("Keine FULINS_C-Datei in den letzten 21 Tagen gefunden.");
const files = cFiles.filter((d) => d.file_name.slice(9, 17) === latest).sort((a, b) => (a.file_name < b.file_name ? -1 : 1));
console.log("FIRDS Vollversion", latest, files.map((f) => f.file_name).join(", "));

/* ------------------------------------------------ XML streamend lesen */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// Ein Durchgang: "&amp;lt;" bleibt "&lt;" (keine Doppel-Dekodierung); dezimal und hexadezimal.
const ent = (x) => x.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (m, d, h, n) => d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ENT[n.toLowerCase()]);
const tag = (s, t) => { const m = s.match(new RegExp("<(?:\\w+:)?" + t + ">([^<]*)</(?:\\w+:)?" + t + ">")); return m ? ent(m[1].trim()) : null; };
const byIsin = new Map();
let records = 0;
function onRecord(x) {
  records++;
  const gen = x.match(/<(?:\w+:)?FinInstrmGnlAttrbts>([\s\S]*?)<\/(?:\w+:)?FinInstrmGnlAttrbts>/);
  if (!gen) return;
  const isin = tag(gen[1], "Id"), cfi = tag(gen[1], "ClssfctnTp") || "", name = tag(gen[1], "FullNm") || "";
  if (!isin || !/^C/.test(cfi)) return;
  const isEtf = /^CE/.test(cfi) || /\b(UCITS ETF|ETF)\b/i.test(name);
  if (!isEtf) return;
  const ven = x.match(/<(?:\w+:)?TradgVnRltdAttrbts>([\s\S]*?)<\/(?:\w+:)?TradgVnRltdAttrbts>/);
  // Je ISIN gibt es einen Datensatz je Handelsplatz. Namen und Emittenten-LEI koennen je Handelsplatz abweichen
  // (gekuerzte Namen, Handelsplatz als "Emittent") - alle sammeln, spaeter den belastbarsten waehlen.
  let e = byIsin.get(isin);
  if (!e) byIsin.set(isin, (e = { isin, names: {}, leis: {}, cfi, ccy: tag(gen[1], "NtnlCcy"), venues: {} }));
  if (name) e.names[name] = (e.names[name] || 0) + 1;
  const lei = tag(x, "Issr"); if (lei) e.leis[lei] = (e.leis[lei] || 0) + 1;
  if (ven) {
    const mic = tag(ven[1], "Id");
    if (mic) e.venues[mic] = { first: (tag(ven[1], "FrstTradDt") || tag(ven[1], "AdmssnApprvlDtByIssr") || "").slice(0, 10) || null, end: (tag(ven[1], "TermntnDt") || "").slice(0, 10) || null };
  }
}
async function parseZip(zip) {
  await new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-p", zip]); let buf = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk) => {
      buf += chunk;
      let s, e;
      while ((s = buf.search(/<(?:\w+:)?RefData>/)) >= 0) {
        const closeRe = /<\/(?:\w+:)?RefData>/g; closeRe.lastIndex = s;
        const m = closeRe.exec(buf); if (!m) break;
        e = m.index + m[0].length;
        onRecord(buf.slice(s, e)); buf = buf.slice(e);
      }
      if (buf.length > 5e6 && buf.search(/<(?:\w+:)?RefData>/) < 0) buf = buf.slice(-2000);
    });
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error("unzip " + c))));
    p.on("error", reject);
  });
}
for (const f of files) {
  const zip = join(WORK, f.file_name);
  if (!existsSync(zip)) await pipeline(Readable.fromWeb((await get(f.download_link)).body), createWriteStream(zip));
  await parseZip(zip);
  console.log(" ", f.file_name, "Datensaetze bisher", records, "ETF-ISIN", byIsin.size);
  rmSync(zip, { force: true });
}

/* ------------------------------------------------------------ GLEIF */
const leis = [...new Set([...byIsin.values()].flatMap((e) => Object.keys(e.leis)).filter((l) => /^[A-Z0-9]{20}$/.test(l)))];
const gleif = new Map();
for (let i = 0; i < leis.length; i += 100) {
  const batch = leis.slice(i, i + 100);
  const r = await get("https://api.gleif.org/api/v1/lei-records?filter%5Blei%5D=" + batch.join(",") + "&page%5Bsize%5D=100", 60000);
  if (r && r.ok) {
    const j = await r.json();
    for (const d of j.data || []) { const en = d.attributes.entity; gleif.set(d.id, { name: en.legalName && en.legalName.name, jurisdiction: en.jurisdiction ? String(en.jurisdiction).slice(0, 2) : null, jurisdictionFull: en.jurisdiction || null, category: en.category || null, country: en.legalAddress && en.legalAddress.country, status: en.status }); }
  }
  await sleep(1100);
}
console.log("GLEIF:", gleif.size, "von", leis.length, "LEI");

/* ----------------------------------------------------------- Ausgabe */
const DIST = { I: "DISTRIBUTING", G: "ACCUMULATING", J: "MIXED" };
/* Belastbarster Name: vollstaendig (nicht auf ~30 Zeichen + " ETFS" gekuerzt), dann laengster, dann haeufigster. */
const TRUNC = /^.{20,35} ETFS?$/;
function bestName(names) {
  return Object.entries(names).sort((a, b) => (TRUNC.test(a[0]) ? 1 : 0) - (TRUNC.test(b[0]) ? 1 : 0) || b[0].length - a[0].length || b[1] - a[1])[0]?.[0] || "";
}
/* Emittent: bevorzugt eine LEI, die GLEIF als Fonds (FUND) fuehrt; Handelsplaetze/Banken als "Emittent" werden verworfen. */
function bestIssuer(leis) {
  const list = Object.entries(leis).filter(([l]) => /^[A-Z0-9]{20}$/.test(l)).map(([l, n]) => ({ lei: l, n, g: gleif.get(l) || {} }));
  const fund = list.filter((x) => x.g.category === "FUND").sort((a, b) => b.n - a.n)[0];
  if (fund) return { lei: fund.lei, g: fund.g, basis: "GLEIF_FUND" };
  const other = list.sort((a, b) => b.n - a.n)[0];
  return other ? { lei: other.lei, g: other.g, basis: "OTHER_ENTITY" } : { lei: null, g: {}, basis: null };
}
// ISO-6166: Laenderpraefix der ISIN = Land des Emittenten; fuer Fonds in der Regel das Domizil (XS/EU ausgenommen).
const ISIN_DOMICILE_OK = /^(IE|LU|DE|FR|NL|AT|BE|DK|FI|SE|NO|IT|ES|PT|CH|GB|LI|PL|CZ|HU|HR|BG|RO|SI|SK|GR|CY|MT|EE|LV|LT|IS|US|CA|AU|JP|HK|SG|KR|ZA|IL)$/;
const fields = ["isin", "name", "cfi", "currency", "issuerLei", "issuerLegalName", "issuerBrand", "domicile", "distribution", "ucitsInName", "venues", "firstTrade", "active", "domicileBasis"];
const rows = [];
for (const e of [...byIsin.values()].sort((a, b) => (a.isin < b.isin ? -1 : 1))) {
  if (!F.isValidIsin(e.isin)) continue;
  const iss = bestIssuer(e.leis), g = iss.g, name = bestName(e.names);
  // Domizil: Rechtsordnung des Fonds laut GLEIF; ohne Fonds-LEI aus dem ISIN-Praefix (abgeleitet).
  const domicile = iss.basis === "GLEIF_FUND" && g.jurisdiction ? g.jurisdiction : ISIN_DOMICILE_OK.test(e.isin.slice(0, 2)) ? e.isin.slice(0, 2) : null;
  const domicileBasis = iss.basis === "GLEIF_FUND" && g.jurisdiction ? "GLEIF" : domicile ? "ISIN_PREFIX" : null;
  const mics = Object.keys(e.venues).sort();
  const activeMics = mics.filter((m) => !e.venues[m].end || e.venues[m].end > iso(today));
  const firsts = mics.map((m) => e.venues[m].first).filter(Boolean).sort();
  const dist = e.cfi.length >= 4 ? DIST[e.cfi[3]] || null : null;     // CE = Gruppe; Attribute ab Position 3: [2]=offen/geschlossen, [3]=Ertragsverwendung
  const issuerName = iss.basis === "GLEIF_FUND" ? g.name || null : null;
  rows.push([e.isin, name, e.cfi, e.ccy, iss.basis === "GLEIF_FUND" ? iss.lei : null, issuerName, F.normalizeIssuer(name) || F.normalizeIssuer(issuerName), domicile, dist,
    /\bUCITS\b/i.test(name) || /\bUCITS\b/i.test(issuerName || ""), activeMics.join(" "), firsts[0] || null, activeMics.length > 0, domicileBasis]);
}
mkdirSync(join(root, "vorsorge/data/eu"), { recursive: true });
const out = { schemaVersion: "vu-vorsorge-eu-etf-1.0.0", source: "ESMA FIRDS " + files.map((f) => f.file_name).join(", ") + "; GLEIF Level-1 (CC0)",
  attribution: "Quelle: ESMA Financial Instruments Reference Data System (FIRDS), transformiert von Vision Universe. GLEIF LEI-Daten (CC0).",
  asOf: latest.slice(0, 4) + "-" + latest.slice(4, 6) + "-" + latest.slice(6, 8), recordsRead: records, fields, rows,
  notes: { distribution: "aus CFI-Attribut, vom Emittenten codiert", ucits: "kein FIRDS-Feld; nur Hinweis aus dem amtlichen Namen", prices: "kein Kursfeed fuer europaeische Listings angebunden" } };
writeFileSync(join(root, "vorsorge/data/eu/etf-eu-index.json"), JSON.stringify(out));
const venues = {}; rows.forEach((r) => r[10].split(" ").filter(Boolean).forEach((m) => (venues[m] = (venues[m] || 0) + 1)));
console.log("EU-ETF-Anteilklassen:", rows.length, "aktiv:", rows.filter((r) => r[12]).length, "Top-MIC:", Object.entries(venues).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x.join("=")).join(" "));
