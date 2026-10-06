/* =========================================================================
   VISION UNIVERSE VORSORGE — adapters/issuers.mjs

   EMITTENTEN-ADAPTER (ETFPrimarySourceAdapter) - MANUELLER IMPORT

   Ergebnis der Quellenpruefung (docs/ETF_PRIMARY_SOURCE_MATRIX.md,
   vorsorge/data/sources/etf-source-probe.json): Die Nutzungsbedingungen
   aller grossen Emittenten erlauben die Inhalte nur fuer persoenliche /
   nicht-kommerzielle Nutzung bzw. verbieten Vervielfaeltigung und
   Weitergabe ohne schriftliche Zustimmung; mehrere verbieten Robots
   ausdruecklich. Deshalb gilt fuer jeden Emittenten-Adapter:

     fetch*()   -> { status: "NOT_PERMITTED" }  (kein automatisierter Abruf)
     parse*()   -> liest eine Datei, die mit Erlaubnis/Lizenz bereitgestellt
                   wurde (manueller Import, .market-cache/vorsorge/manual-import/<issuer>/)

   Sobald eine Lizenz/Zustimmung vorliegt, wird nur automationAllowed
   umgestellt und fetch* implementiert - Parser, Normalisierung und
   Validierung sind fertig und getestet.
   ========================================================================= */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsx } from "./xlsx.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const H = require(join(root, "vorsorge/engines/etf-holdings.js"));
const F = require(join(root, "vorsorge/engines/etf-fundamentals.js"));

/* ------------------------------------------------------------ CSV */
export function parseCsv(text, sep) {
  const s = String(text).replace(/^﻿/, "");
  if (!sep) { const head = s.split(/\r?\n/).slice(0, 15).join("\n"); sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ";" : ","; }
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.replace(/ /g, " ").trim()));
}

/* ------------------------------------------------- Tabellen-Mapping */
const ALIASES = {
  holdingTicker: ["ticker", "emittententicker", "ticker symbol", "issuer ticker", "bbg", "symbol"],
  holdingName: ["name", "security name", "securityname", "issuer name", "issuername", "holding name", "holdingname", "constituent name", "wertpapier", "label"],
  holdingIsin: ["isin"],
  holdingCusip: ["cusip", "identifier"],
  holdingSedol: ["sedol"],
  weight: ["weight (%)", "gewichtung (%)", "weight", "weighting", "% of net assets", "% of funds", "percentage", "percent of fund", "percentageoftotalnetassets", "constituent weighting", "portfolio weight", "weight %", "mktvalpercent", "marketvaluepercentage"],
  marketValue: ["market value", "marktwert", "marketvaluebase", "mv", "marketval", "market value (usd)"],
  shares: ["shares", "quantity", "shares held", "nominale", "units", "numberofshare", "anzahl"],
  sector: ["sector", "sektor", "industry classification", "sectorname", "gics sector", "gicsindustrydescription"],
  assetType: ["asset class", "anlageklasse", "type of security", "securitytypename", "security type", "type", "asset type", "broad type", "asset_class"],
  country: ["location", "standort", "country", "countryofriskcode", "country of risk", "countryofrisk", "land"],
  currency: ["market currency", "marktwährung", "currency", "local currency", "localcurrencycode", "currency code", "währung"],
  holdingExchange: ["exchange", "börse", "primary listing"]
};
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
function headerMap(row) {
  const m = {}; const cells = row.map(norm);
  for (const [field, al] of Object.entries(ALIASES)) for (const a of al) { const i = cells.indexOf(a); if (i >= 0 && !(field in m)) { m[field] = i; break; } }
  return m;
}
/** Findet die Kopfzeile (Name + Gewicht) in den ersten 40 Zeilen und mappt die Tabelle. */
export function mapTable(rows, opts = {}) {
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(40, rows.length); i++) { const m = headerMap(rows[i] || []); if ("weight" in m && ("holdingName" in m || "holdingTicker" in m || "holdingIsin" in m)) { hi = i; map = m; break; } }
  if (hi < 0) return { error: "HEADER_NOT_FOUND", rows: [] };
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every((c) => c === null || c === undefined || c === "")) { if (out.length) break; continue; }
    const g = (f) => (f in map ? r[map[f]] : null);
    const w = g("weight"); if (w === null || w === undefined || w === "" || w === "-") continue;
    const row = { holdingTicker: g("holdingTicker") || null, holdingName: g("holdingName") || null, holdingIsin: F.cleanId("isin", g("holdingIsin")), holdingCusip: F.cleanId("cusip", g("holdingCusip")),
      holdingSedol: F.cleanId("sedol", g("holdingSedol")), weight: w, marketValue: g("marketValue"), shares: g("shares"), sector: g("sector") || null, assetType: g("assetType") || "EQUITY",
      country: countryCode(g("country")), currency: g("currency") || null, holdingExchange: g("holdingExchange") || null, sourceRowId: String(i + 1) };
    if (!row.holdingName && !row.holdingTicker && !row.holdingIsin) continue;
    out.push(row);
  }
  return { headerRow: hi, columns: Object.keys(map), rows: out };
}
const COUNTRY = { "united states": "US", "vereinigte staaten": "US", usa: "US", japan: "JP", "united kingdom": "GB", "vereinigtes königreich": "GB", germany: "DE", deutschland: "DE", france: "FR", frankreich: "FR",
  switzerland: "CH", schweiz: "CH", canada: "CA", kanada: "CA", china: "CN", taiwan: "TW", india: "IN", indien: "IN", "korea (south)": "KR", "south korea": "KR", korea: "KR", netherlands: "NL", niederlande: "NL",
  australia: "AU", australien: "AU", sweden: "SE", schweden: "SE", denmark: "DK", dänemark: "DK", italy: "IT", italien: "IT", spain: "ES", spanien: "ES", ireland: "IE", irland: "IE", "hong kong": "HK", hongkong: "HK", brazil: "BR", brasilien: "BR" };
function countryCode(v) { if (!v) return null; const s = String(v).trim(); if (/^[A-Z]{2}$/.test(s)) return s; return COUNTRY[s.toLowerCase()] || null; }
function findAsOf(rows, re) { for (const r of rows.slice(0, 15)) { const line = (r || []).join(" "); const m = line.match(re); if (m) { const d = F.isoDate(m[1].trim()) || F.isoDate(m[1].replace(/\./g, " ").trim()); if (d) return d; } } return null; }

/* ------------------------------------------------------ Parser */
const MONTHS_DE = { jan: "Jan", feb: "Feb", mär: "Mar", mrz: "Mar", apr: "Apr", mai: "May", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", okt: "Oct", nov: "Nov", dez: "Dec" };
function deDate(s) { const m = String(s || "").match(/(\d{1,2})[.\s/-]([A-Za-zäÄ]{3})[a-zä]*[.\s/-](\d{4})/); if (!m) return null; const mo = MONTHS_DE[m[2].toLowerCase()] || m[2]; return F.isoDate(m[1] + "-" + mo + "-" + m[3]); }
export const PARSERS = {
  /** iShares Holdings-CSV (US: "Fund Holdings as of", DE: "Fondsposition per"). Gewicht in Prozent. */
  ISHARES_HOLDINGS_CSV(text) {
    const rows = parseCsv(text);
    const asOf = findAsOf(rows, /Fund Holdings as of[,;]?\s*"?([^"]+)"?/i) || (() => { for (const r of rows.slice(0, 10)) { const l = r.join(" "); if (/Fondsposition per/i.test(l)) return deDate(l.replace(/.*Fondsposition per[,;]?/i, "")); } return null; })();
    const t = mapTable(rows);
    return { asOf, weightUnit: "percent", ...t };
  },
  /** SSGA Holdings-XLSX ("Holdings: As of dd-Mon-yyyy"). Gewicht in Prozent. */
  SSGA_HOLDINGS_XLSX(buf) {
    const { rows } = readXlsx(buf);
    const asOf = findAsOf(rows, /As of\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4}|[A-Za-z]{3}\.? [0-9]{1,2},? [0-9]{4})/i);
    return { asOf, weightUnit: "percent", ...mapTable(rows) };
  },
  /** Xtrackers Constituents-XLSX (Blattname = Stichtag, Weighting dezimal). */
  XTRACKERS_HOLDINGS_XLSX(buf) {
    const { rows, sheetNames } = readXlsx(buf);
    return { asOf: F.isoDate(sheetNames[0]) || findAsOf(rows, /(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})/), weightUnit: "fraction", ...mapTable(rows) };
  },
  /** Amundi getProductsData mit composition (weight dezimal). */
  AMUNDI_PRODUCT_JSON(json) {
    const p = (json.products || [])[0] || {};
    const data = (p.composition && p.composition.compositionData) || [];
    const rows = data.map((d, i) => { const c = d.compositionCharacteristics || d; return { holdingName: c.name, holdingIsin: F.cleanId("isin", c.isin), holdingTicker: c.bbg || null, weight: c.weight, shares: c.quantity, currency: c.currency, sector: c.sector || null, country: countryCode(c.countryOfRisk || c.country), assetType: c.type || "EQUITY", sourceRowId: String(i + 1) }; });
    const dates = data.map((d) => (d.compositionCharacteristics || d).date).filter(Boolean).sort();
    return { asOf: F.isoDate(dates[dates.length - 1]), weightUnit: "fraction", rows };
  },
  /** Invesco Holdings-JSON (percentageOfTotalNetAssets in Prozent). */
  INVESCO_HOLDINGS_JSON(json) {
    const rows = (json.holdings || []).map((h, i) => ({ holdingName: h.issuerName, holdingTicker: h.ticker || null, holdingCusip: F.cleanId("cusip", h.cusip), weight: h.percentageOfTotalNetAssets, marketValue: h.marketValueBase, shares: h.units, sector: h.sectorName || null, assetType: h.securityTypeName || "EQUITY", sourceRowId: String(i + 1) }));
    return { asOf: F.isoDate(json.effectiveBusinessDate || json.effectiveDate), weightUnit: "percent", rows };
  },
  /** Allgemeine Tabelle (CSV/XLSX) mit erkennbarer Kopfzeile; Einheit muss angegeben oder eindeutig sein. */
  GENERIC_TABLE(input, opts = {}) {
    const rows = Buffer.isBuffer(input) && input.readUInt32LE(0) === 0x04034b50 ? readXlsx(input).rows : parseCsv(String(input));
    return { asOf: opts.asOf || findAsOf(rows, /(?:as of|stand|per|date)[:,;]?\s*"?([0-9A-Za-zäÄ ,./-]{8,20})"?/i), weightUnit: opts.weightUnit || null, ...mapTable(rows) };
  },
  /** FinDatEx EMT (CSV/XLSX): laufende Kosten je ISIN (Feld 07100, Dezimalbruch laut EMT-Spezifikation). */
  EMT(input) {
    const rows = Buffer.isBuffer(input) && input.readUInt32LE(0) === 0x04034b50 ? readXlsx(input).rows : parseCsv(String(input));
    const hi = rows.findIndex((r) => (r || []).some((c) => /^00010_/.test(String(c))));
    if (hi < 0) return { error: "EMT_HEADER_NOT_FOUND", funds: [] };
    const h = rows[hi].map((c) => String(c || ""));
    const col = (pfx) => h.findIndex((c) => c.startsWith(pfx));
    const iIsin = col("00010_"), iName = col("00030_"), iOng = col("07100_"), iMgt = col("07110_"), iDate = col("00080_") >= 0 ? col("00080_") : col("00020_");
    const funds = [];
    for (const r of rows.slice(hi + 1)) {
      const isin = F.cleanId("isin", r[iIsin]); if (!isin) continue;
      const ong = H.parseNumber(r[iOng]), mgt = iMgt >= 0 ? H.parseNumber(r[iMgt]) : null;
      funds.push({ isin, name: iName >= 0 ? r[iName] : null, ongoingCharges: ong !== null && ong >= 0 && ong < 0.1 ? ong : null, managementFee: mgt !== null && mgt >= 0 && mgt < 0.1 ? mgt : null,
        unitError: ong !== null && ong >= 0.1 ? "UNIT_MISMATCH" : null, asOf: iDate >= 0 ? F.isoDate(r[iDate]) : null });
    }
    return { funds };
  }
};

/* ------------------------------------------------- Adapter-Register */
const RESTRICTED = (terms, url) => ({ automationAllowed: false, termsStatus: "RESTRICTED", termsSummary: terms, termsUrl: url, implementationStatus: "MANUAL_IMPORT_READY" });
export const ISSUERS = {
  BLACKROCK: { label: "iShares (BlackRock)", parsers: ["ISHARES_HOLDINGS_CSV"], ...RESTRICTED("Inhalte nur für persönliche, nicht-kommerzielle Nutzung; keine Verbreitung zu öffentlichen/kommerziellen Zwecken ohne Erlaubnis.", "https://www.blackrock.com/corporate/compliance/terms-and-conditions") },
  VANGUARD: { label: "Vanguard", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Persönliche, nicht-kommerzielle Nutzung; kommerzielle Nutzung nur mit vorheriger schriftlicher Zustimmung.", "https://www.vanguard.co.uk/professional/terms-and-conditions") },
  STATE_STREET: { label: "SPDR (State Street)", parsers: ["SSGA_HOLDINGS_XLSX"], ...RESTRICTED("Kein Kopieren, Vervielfältigen oder Verbreiten ohne Zustimmung.", "https://www.ssga.com/us/en/footer/terms-and-conditions") },
  INVESCO: { label: "Invesco", parsers: ["INVESCO_HOLDINGS_JSON"], ...RESTRICTED("Nur persönliche, nicht-kommerzielle oder interne Nutzung; kein automatisierter Massenabruf.", "https://www.invesco.com/us/en/resources/terms-of-use.html") },
  AMUNDI: { label: "Amundi", parsers: ["AMUNDI_PRODUCT_JSON"], ...RESTRICTED("Vervielfältigung ohne vorherige schriftliche Zustimmung untersagt; Download nur für den persönlichen Gebrauch.", "https://www.amundietf.de/de/professionell/rechtshinweise") },
  DWS: { label: "Xtrackers (DWS)", parsers: ["XTRACKERS_HOLDINGS_XLSX", "EMT"], ...RESTRICTED("Kein Herunterladen, Vervielfältigen oder Verbreiten ohne vorherige schriftliche Zustimmung; Fondsfinder hinter Zugangsseite.", "https://etf.dws.com/en-no/footer/terms-of-use/") },
  WISDOMTREE: { label: "WisdomTree", parsers: ["GENERIC_TABLE", "EMT"], ...RESTRICTED("Keine Vervielfältigung ohne vorherige schriftliche Zustimmung; Website lehnt automatisierten Abruf ab (HTTP 403 in der Probe).", "https://www.wisdomtree.eu/en-gb/terms-and-conditions") },
  UBS: { label: "UBS", parsers: ["GENERIC_TABLE", "EMT"], ...RESTRICTED("Nur persönliche, nicht-kommerzielle Nutzung.", "https://www.ubs.com/global/en/legal/disclaimer.html") },
  JPMORGAN: { label: "J.P. Morgan", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Keine Nutzung, Speicherung oder Weitergabe ohne vorherige schriftliche Zustimmung; Robots ausdrücklich untersagt.", "https://am.jpmorgan.com/gb/en/asset-management/per/regulatory/terms-of-use/") },
  HSBC: { label: "HSBC", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Keine Vervielfältigung, Speicherung oder Verwertung ohne vorherige schriftliche Zustimmung.", "https://www.assetmanagement.us.hsbc.com/en/terms-and-conditions") },
  VANECK: { label: "VanEck", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Keine Vervielfältigung zu kommerziellen Zwecken ohne Zustimmung; Seite verlangt Cookies.", "https://www.vaneck.com/nl/en/terms-and-conditions/") },
  LEGAL_GENERAL: { label: "L&G", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Vervielfältigung ohne vorherige schriftliche Zustimmung untersagt, außer zur privaten Ansicht.", "https://fundcentres.landg.com/") },
  GLOBAL_X: { label: "Global X", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Keine kommerzielle Nutzung ohne Lizenz.", "https://globalxetfs.eu/terms-of-use") },
  FIDELITY: { label: "Fidelity", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Bot-Schutz (Akamai); keine Freigabe gefunden.", null) },
  FRANKLIN_TEMPLETON: { label: "Franklin Templeton", parsers: ["EMT"], ...RESTRICTED("EMT-Vorlagen öffentlich angeboten, aber ohne Weiterverwendungslizenz.", "https://www.franklintempleton.co.uk/resources-and-literature/literature/regulatory-templates") },
  BNP_PARIBAS: { label: "BNP Paribas", parsers: ["GENERIC_TABLE"], ...RESTRICTED("Vervielfältigung ohne ausdrückliche vorherige Genehmigung untersagt.", "https://group.bnpparibas/en/legal-information") }
};

/** ETFPrimarySourceAdapter fuer einen Emittenten. */
export function createIssuerAdapter(issuerId) {
  const cfg = ISSUERS[issuerId];
  if (!cfg) throw new Error("Unbekannter Emittent " + issuerId);
  const notPermitted = async () => ({ status: "NOT_PERMITTED", reason: "Nutzungsbedingungen erlauben keinen automatisierten Abruf/keine Weiterverbreitung", termsUrl: cfg.termsUrl });
  return {
    id: issuerId, label: cfg.label, sourceType: "PRIMARY_ISSUER", automationAllowed: cfg.automationAllowed, termsStatus: cfg.termsStatus, implementationStatus: cfg.implementationStatus,
    discoverProducts: notPermitted, fetchProductMetadata: notPermitted, fetchShareClasses: notPermitted, fetchListings: notPermitted,
    fetchHoldings: notPermitted, fetchHistoricalHoldings: notPermitted, fetchFundCharacteristics: notPermitted,
    healthCheck: async () => ({ status: cfg.automationAllowed ? "NOT_CONFIGURED" : "NOT_PERMITTED", lastSuccessfulFetch: null, lastFailedFetch: null, consecutiveFailures: 0, itemsFetched: 0 }),
    /** Manueller Import: Datei (Text/Buffer/JSON) mit benanntem Parser -> kanonischer Snapshot. */
    normalise(parser, input, meta = {}) {
      if (!cfg.parsers.includes(parser) && parser !== "GENERIC_TABLE") throw new Error(parser + " gehoert nicht zu " + issuerId);
      const p = PARSERS[parser](input, meta);
      if (p.error) return { error: p.error };
      if (parser === "EMT") return { funds: p.funds };
      return H.snapshot({ fundId: meta.fundId || null, shareClassId: meta.shareClassId || null, symbol: meta.symbol || null, asOf: meta.asOf || p.asOf, retrievedAt: meta.retrievedAt || null,
        source: issuerId, sourceType: "PRIMARY_ISSUER", sourceUrl: meta.sourceUrl || null, weightUnit: meta.weightUnit || p.weightUnit }, p.rows);
    },
    validate(snapshot, prev, opts) { return H.qualityGates(snapshot, prev, opts); }
  };
}
