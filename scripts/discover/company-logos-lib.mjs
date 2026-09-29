/**
 * Firmenlogos aus Wikimedia Commons - die reine Logik, ohne Netz.
 *
 * Quelle ist allein Wikimedia Commons, erreicht ueber Wikidata (Eigenschaft
 * P154 "Logo"). Zwei Fragen muessen fuer jedes Logo mit Ja beantwortet sein,
 * bevor es ausgeliefert wird:
 *
 *   1. Gehoert das Logo sicher zu DIESER Aktie?  Zuerst ueber die SEC-CIK
 *      (Wikidata P5531 gegen die CIK aus company-names.json). Nur wo keine
 *      CIK traegt, ueber Ticker + Boerse (P414/P249) - und dann nur, wenn
 *      der Name bei Wikidata und bei uns ein gemeinsames Wort hat und keine
 *      abweichende CIK dagegen spricht. Mehrdeutig heisst: kein Logo.
 *   2. Duerfen wir die Datei verwenden?  Nur gemeinfrei, CC0, CC BY oder
 *      CC BY-SA laut der maschinenlesbaren Lizenz der Commons-Datei. Als
 *      Einschraenkung ist allein "trademarked" zugelassen; alles andere
 *      (Insignien, Persoenlichkeitsrechte, ...) faellt heraus.
 *
 * Kein Logo wird veraendert - Commons liefert eine verkleinerte Fassung,
 * sonst nichts.
 */

export const USER_AGENT =
  "VisionUniverseLogoSync/1.0 (https://github.com/dennismueller10x-sudo/vision-universe-research)";

export const THUMB_WIDTH = 120;

/* Wikidata-Items der Boersen, an denen das Produktuniversum handelt. */
export const EXCHANGES = { Q13677: "NYSE", Q82059: "NASDAQ" };

export const SPARQL_BY_CIK = `
SELECT ?item ?itemLabel ?cik ?logo ?rank WHERE {
  ?item wdt:P5531 ?cik .
  ?item p:P154 ?ls . ?ls ps:P154 ?logo ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?ls pq:P582 ?ende }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export const SPARQL_BY_TICKER = `
SELECT ?item ?itemLabel ?ticker ?cik ?logo ?rank WHERE {
  VALUES ?exch { ${Object.keys(EXCHANGES).map((q) => "wd:" + q).join(" ")} }
  ?item p:P414 ?xs . ?xs ps:P414 ?exch ; pq:P249 ?ticker .
  FILTER NOT EXISTS { ?xs pq:P582 ?delisted }
  ?item p:P154 ?ls . ?ls ps:P154 ?logo ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?ls pq:P582 ?ende }
  OPTIONAL { ?item wdt:P5531 ?cik . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export function normalizeCik(v) {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, "").replace(/^0+/, "");
  return digits || null;
}

export function normalizeTicker(v) {
  return String(v || "").toUpperCase().replace(/[.\-/ ]/g, "");
}

/** "http://commons.wikimedia.org/wiki/Special:FilePath/Apple%20logo.svg" -> "File:Apple logo.svg" */
export function commonsTitle(url) {
  const m = /Special:FilePath\/(.+)$/.exec(String(url || ""));
  if (!m) return null;
  let name = decodeURIComponent(m[1]).replace(/_/g, " ").trim();
  if (!name) return null;
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return "File:" + name;
}

function qid(uri) {
  const m = /(Q\d+)$/.exec(String(uri || ""));
  return m ? m[1] : null;
}

/* Rechtsformen und Fuellwoerter tragen keine Identitaet. */
const STOP = new Set(("inc incorporated corp corporation co company companies ltd limited plc llc lp " +
  "sa se nv ag ab asa spa holdings holding group the and of class common shares trust").split(" "));

export function nameTokens(name) {
  return new Set(String(name || "").toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)));
}

export function namesAgree(a, b) {
  const x = nameTokens(a), y = nameTokens(b);
  for (const t of x) if (y.has(t)) return true;
  return false;
}

/**
 * SPARQL-JSON -> Map item -> {item, label, ciks:Set, tickers:Set, logos:[{title, preferred}]}
 */
export function collectItems(bindings, into = new Map()) {
  for (const b of bindings || []) {
    const item = qid(b.item && b.item.value);
    const title = commonsTitle(b.logo && b.logo.value);
    if (!item || !title) continue;
    let e = into.get(item);
    if (!e) { e = { item, label: (b.itemLabel && b.itemLabel.value) || "", ciks: new Set(), tickers: new Set(), logos: new Map() }; into.set(item, e); }
    const cik = normalizeCik(b.cik && b.cik.value);
    if (cik) e.ciks.add(cik);
    if (b.ticker && b.ticker.value) e.tickers.add(normalizeTicker(b.ticker.value));
    const preferred = /PreferredRank$/.test((b.rank && b.rank.value) || "");
    e.logos.set(title, (e.logos.get(title) || false) || preferred);
  }
  return into;
}

/** Genau ein aktuelles Logo - bevorzugter Rang schlaegt normalen, sonst mehrdeutig. */
export function pickLogo(entry) {
  const all = [...entry.logos.entries()];
  const preferred = all.filter(([, p]) => p);
  const pool = preferred.length ? preferred : all;
  return pool.length === 1 ? pool[0][0] : null;
}

/**
 * Ordnet jedem Titel des Universums hoechstens ein Wikidata-Item zu.
 * @param {Array<{symbol, cik, name}>} universe
 * @param {Map} items  aus collectItems
 * @returns {{matches: Map<symbol,{item,title,via,label}>, reasons: Map<symbol,string>}}
 */
export function matchUniverse(universe, items) {
  const byCik = new Map(), byTicker = new Map();
  for (const e of items.values()) {
    for (const c of e.ciks) { if (!byCik.has(c)) byCik.set(c, []); byCik.get(c).push(e); }
    for (const t of e.tickers) { if (!byTicker.has(t)) byTicker.set(t, []); byTicker.get(t).push(e); }
  }
  const matches = new Map(), reasons = new Map();
  for (const row of universe) {
    const cik = normalizeCik(row.cik);
    let via = null, cands = [];
    if (cik && byCik.has(cik)) { via = "CIK"; cands = byCik.get(cik); }
    else {
      const t = byTicker.get(normalizeTicker(row.symbol)) || [];
      cands = t.filter((e) => namesAgree(e.label, row.name) &&
        !(cik && e.ciks.size && !e.ciks.has(cik)));
      if (cands.length) via = "TICKER";
      else if (t.length) { reasons.set(row.symbol, "NAME_ODER_CIK_WIDERSPRICHT"); continue; }
    }
    if (!via) { reasons.set(row.symbol, "KEIN_WIKIDATA_LOGO"); continue; }
    if (cands.length > 1) { reasons.set(row.symbol, "MEHRERE_ITEMS"); continue; }
    const title = pickLogo(cands[0]);
    if (!title) { reasons.set(row.symbol, "MEHRERE_LOGOS"); continue; }
    matches.set(row.symbol, { item: cands[0].item, label: cands[0].label, title, via });
  }
  return { matches, reasons };
}

const LICENSE_OK = /^(pd|cc0|cc-by(-sa)?-\d\.\d(-[a-z]{2,})?)$/;
const RESTRICTIONS_OK = new Set(["", "trademarked"]);

function meta(ext, key) {
  const v = ext && ext[key] && ext[key].value;
  return v === undefined || v === null ? "" : String(v);
}

export function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Lizenzpruefung einer Commons-imageinfo.
 * @returns {{ok:true, license, licenseName, licenseUrl, author, attributionRequired} | {ok:false, reason}}
 */
export function checkLicense(info) {
  if (!info) return { ok: false, reason: "KEINE_DATEIINFO" };
  const ext = info.extmetadata || {};
  const license = meta(ext, "License").toLowerCase().trim();
  if (!LICENSE_OK.test(license)) return { ok: false, reason: "LIZENZ_NICHT_FREI:" + (license || "unbekannt") };
  const restrictions = meta(ext, "Restrictions").toLowerCase().split("|").map((s) => s.trim());
  if (restrictions.some((r) => !RESTRICTIONS_OK.has(r))) return { ok: false, reason: "EINSCHRAENKUNG:" + restrictions.join("|") };
  const author = stripHtml(meta(ext, "Artist"));
  const attributionRequired = license !== "pd" && license !== "cc0";
  if (attributionRequired && !author) return { ok: false, reason: "URHEBER_FEHLT" };
  return {
    ok: true,
    license,
    licenseName: meta(ext, "LicenseShortName") || license.toUpperCase(),
    licenseUrl: meta(ext, "LicenseUrl") || null,
    author: author || null,
    attributionRequired
  };
}

export const MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export function safeSymbol(sym) {
  return /^[A-Z0-9][A-Z0-9.\-]{0,23}$/.test(String(sym || "")) ? sym : null;
}
