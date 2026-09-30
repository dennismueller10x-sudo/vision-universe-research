/**
 * Firmenlogos aus Wikimedia Commons - die reine Logik, ohne Netz.
 *
 * Quelle ist allein Wikimedia Commons, erreicht ueber Wikidata (Eigenschaft
 * P154 "Logo"). Zwei Fragen muessen fuer jedes Logo mit Ja beantwortet sein,
 * bevor es ausgeliefert wird:
 *
 *   1. Gehoert das Logo sicher zu DIESER Aktie?  In dieser Reihenfolge:
 *      a) SEC-CIK (Wikidata P5531 gegen die CIK aus company-names.json);
 *      b) Ticker an einer Boerse (P414/P249), wenn der Name passt (erstes
 *         Namenswort gleich oder zwei gemeinsame Woerter) und keine
 *         abweichende CIK dagegen spricht;
 *      c) der Firmenname allein (Wikidata-Suche), nur bei exakt gleichem
 *         Namen, einem Unternehmens-Item und ohne widersprechende CIK oder
 *         Ticker.
 *      Mehrere passende Items heisst: kein Logo. Mehrere Logos EINES Items
 *      sind dagegen kein Zweifel an der Firma - dann gilt das bevorzugte,
 *      sonst das neueste; aeltere Logos derselben Firma sind Ersatz.
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

/* Commons liefert eine 256er-Fassung; aufbereitet wird auf 128 px (company-logos-web.mjs). */
export const THUMB_WIDTH = 256;

/* Wikidata-Items der Boersen, an denen das Produktuniversum handelt -
   bei mehreren Treffern fuer denselben Ticker entscheidet die US-Boerse. */
export const EXCHANGES = { Q13677: "NYSE", Q82059: "NASDAQ" };

/* P154 Logo, P8972 kleines Logo/Icon - beide zeigen die Marke der Firma. */
const LOGO_PROPS = "VALUES (?lp ?lps) { (p:P154 ps:P154) (p:P8972 ps:P8972) }";
const LOGO_BLOCK = `${LOGO_PROPS}
  ?item ?lp ?ls . ?ls ?lps ?logo ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?ls pq:P582 ?ende }
  OPTIONAL { ?ls pq:P580 ?start }`;

export const SPARQL_BY_CIK = `
SELECT ?item ?itemLabel ?cik ?logo ?rank ?start ?lp WHERE {
  ?item wdt:P5531 ?cik .
  ${LOGO_BLOCK}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export const SPARQL_BY_TICKER = `
SELECT ?item ?itemLabel ?ticker ?exch ?cik ?logo ?rank ?start ?lp WHERE {
  ?item p:P414 ?xs . ?xs ps:P414 ?exch ; pq:P249 ?ticker .
  FILTER NOT EXISTS { ?xs pq:P582 ?delisted }
  ${LOGO_BLOCK}
  OPTIONAL { ?item wdt:P5531 ?cik . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

/* Offizielle Website (P856) fuer die zweite Quelle - dieselben Zuordnungs-
   wege wie beim Logo, nur ohne Logo-Bedingung. */
export const SPARQL_SITE_BY_CIK = `
SELECT ?item ?itemLabel ?cik ?site WHERE {
  ?item wdt:P5531 ?cik ; wdt:P856 ?site .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export const SPARQL_SITE_BY_TICKER = `
SELECT ?item ?itemLabel ?ticker ?exch ?cik ?site WHERE {
  ?item p:P414 ?xs . ?xs ps:P414 ?exch ; pq:P249 ?ticker .
  FILTER NOT EXISTS { ?xs pq:P582 ?delisted }
  ?item wdt:P856 ?site .
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
  "sa se nv ag ab asa spa holdings holding group the and of class common shares trust " +
  "adr ads sponsored representing ordinary share stock paired unit units depositary receipt receipts").split(" "));

/** Name fuer die Wikidata-Suche: ohne Aktiengattung, ADR- und Klammerzusaetze. */
export function searchName(name) {
  return String(name || "")
    .replace(/\([^)]*\)?/g, " ")
    .replace(/\b(class|cl)\s+[a-z]\b.*$/i, " ")
    .replace(/\b(sponsored\s+)?(adr|ads|american depositary.*|ordinary shares?|common stock|paired stock)\b.*$/i, " ")
    .replace(/\s+/g, " ").trim();
}

export function nameTokens(name) {
  return new Set(String(name || "").toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((t) => t.length >= 2 && !STOP.has(t)));
}

/** Geordnete Namenswoerter (fuer "erstes Wort gleich"). */
function tokenList(name) { return [...nameTokens(name)]; }

/* Namensanfaenge, die viele Firmen teilen - sie allein belegen nichts. */
const GENERIC = new Set(("american first united national general global international new north south east west " +
  "pacific atlantic capital financial energy bank bancorp royal great western eastern southern northern central " +
  "us usa china community federal standard universal advanced applied premier citizens peoples mid world " +
  "green blue golden silver alpha star digital").split(" "));

/**
 * Ticker-Weg: der kuerzere Name steckt ganz im laengeren, oder zwei
 * gemeinsame Woerter, oder dasselbe erste Wort, wenn es kein allgemeines ist.
 */
export function namesAgree(a, b) {
  const x = tokenList(a), y = tokenList(b);
  if (!x.length || !y.length) return false;
  if (x.join("") === y.join("")) return true;
  const [kurz, lang] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  if (kurz.every((t) => lang.has(t))) return true;
  const ys = new Set(y);
  if (x.filter((t) => ys.has(t)).length >= 2) return true;
  return x[0] === y[0] && !GENERIC.has(x[0]);
}

/**
 * Starker Namensbeleg: gleiche Buchstabenfolge, oder der kuerzere Name steckt
 * ganz im laengeren und beginnt nicht mit einem allgemeinen Wort.
 */
export function namesStrong(a, b) {
  const x = tokenList(a), y = tokenList(b);
  if (!x.length || !y.length) return false;
  if (x.join("") === y.join("")) return true;
  const [kurz, lang] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return !GENERIC.has(kurz[0]) && kurz.every((t) => lang.has(t));
}

/** Namens-Weg: dieselben Namenswoerter, nicht mehr und nicht weniger. */
export function namesEqual(a, b) {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.size || !y.size) return false;
  /* "ExxonMobil" = "Exxon Mobil" - dieselben Buchstaben, anders getrennt. */
  if ([...x].join("") === [...y].join("")) return true;
  if (x.size !== y.size) return false;
  for (const t of x) if (!y.has(t)) return false;
  return true;
}

/**
 * SPARQL-JSON -> Map item -> {item, label, ciks:Set, tickers:Set, logos:[{title, preferred}]}
 */
export function collectItems(bindings, into = new Map()) {
  for (const b of bindings || []) {
    const item = qid(b.item && b.item.value);
    const title = commonsTitle(b.logo && b.logo.value);
    const site = (b.site && b.site.value) || null;
    if (!item || (!title && !site)) continue;
    let e = into.get(item);
    if (!e) { e = { item, label: (b.itemLabel && b.itemLabel.value) || "", ciks: new Set(), tickers: new Set(), usTickers: new Set(), logos: new Map(), sites: new Set() }; into.set(item, e); }
    if (site) e.sites.add(site);
    const cik = normalizeCik(b.cik && b.cik.value);
    if (cik) e.ciks.add(cik);
    if (b.ticker && b.ticker.value) {
      const t = normalizeTicker(b.ticker.value);
      e.tickers.add(t);
      if (EXCHANGES[qid(b.exch && b.exch.value)]) e.usTickers.add(t);
    }
    if (!title) continue;
    const alt = e.logos.get(title) || { preferred: false, start: "", icon: true };
    e.logos.set(title, {
      preferred: alt.preferred || /PreferredRank$/.test((b.rank && b.rank.value) || ""),
      start: [alt.start, (b.start && b.start.value) || ""].sort().pop(),
      /* Nur P8972 (Icon) - das eigentliche Logo P154 geht vor. */
      icon: alt.icon && /P8972$/.test((b.lp && b.lp.value) || "")
    });
  }
  return into;
}

/**
 * Alle aktuellen Logos eines Items in der Reihenfolge, in der sie versucht
 * werden: Icon (P8972, quadratisches Symbol) vor Logo (oft ein breiter
 * Schriftzug), bevorzugter Rang, neuestes Startdatum, SVG, Titel.
 * Faellt das erste an der Lizenz, ist das naechste der Ersatz.
 */
export function rankLogos(entry) {
  return [...entry.logos.entries()].sort(([ta, a], [tb, b]) =>
    (b.icon - a.icon) || (b.preferred - a.preferred) ||
    (b.start > a.start ? 1 : b.start < a.start ? -1 : 0) ||
    (/\.svg$/i.test(tb) - /\.svg$/i.test(ta)) || (ta < tb ? -1 : ta > tb ? 1 : 0)
  ).map(([t]) => t);
}
export function pickLogo(entry) { return rankLogos(entry)[0] || null; }

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
      const sym = normalizeTicker(row.symbol);
      const t = byTicker.get(sym) || [];
      /* Eine abweichende CIK spricht gegen den Treffer - ausser die Firma
         notiert unter genau diesem Ticker an NYSE/NASDAQ und der Name passt
         stark (Umstrukturierungen wie BlackRock 2024 bringen neue CIKs). */
      cands = t.filter((e) => namesAgree(e.label, row.name) &&
        (!(cik && e.ciks.size && !e.ciks.has(cik)) || (e.usTickers.has(sym) && namesStrong(e.label, row.name))));
      /* Derselbe Ticker an mehreren Boersen der Welt: die US-Notierung zaehlt. */
      if (cands.length > 1) {
        const us = cands.filter((e) => e.usTickers.has(sym));
        if (us.length === 1) cands = us;
      }
      if (cands.length) via = "TICKER";
      else if (t.length) { reasons.set(row.symbol, "NAME_ODER_CIK_WIDERSPRICHT"); continue; }
    }
    if (!via) { reasons.set(row.symbol, "KEIN_WIKIDATA_LOGO"); continue; }
    if (cands.length > 1) { reasons.set(row.symbol, "MEHRERE_ITEMS"); continue; }
    const titles = rankLogos(cands[0]);
    matches.set(row.symbol, { item: cands[0].item, label: cands[0].label, title: titles[0] || null, titles, via,
                              sites: [...(cands[0].sites || [])].sort() });
  }
  return { matches, reasons };
}

const LICENSE_OK = /^(pd|cc0|cc-by(-sa)?-\d\.\d(-[a-z]{2,})?|apache-2\.0|mit)$/;
const RESTRICTIONS_OK = new Set(["", "trademarked"]);

/**
 * Lizenzcode aus der Commons-Metadata. Manche Dateien tragen nur den
 * Kurznamen ("Public domain", "CC BY-SA 4.0") - der gilt dann.
 */
export function licenseCode(code, shortName) {
  const c = String(code || "").toLowerCase().trim();
  if (c) return c;
  const n = String(shortName || "").trim();
  if (/^public domain$/i.test(n)) return "pd";
  if (/^cc0\b/i.test(n)) return "cc0";
  if (/^apache license,? (version )?2\.0$/i.test(n)) return "apache-2.0";
  if (/^mit( license)?$/i.test(n)) return "mit";
  const m = /^cc[ -]by(-sa)?[ -](\d\.\d)$/i.exec(n);
  return m ? "cc-by" + (m[1] ? "-sa" : "") + "-" + m[2] : "";
}

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
 * Urheberangabe aus Commons lesbar machen: Commons fuehrt im Feld "Artist"
 * oft Hochlade-Protokolle, Vorlagenreste und Zusaetze wie "(vectorization)".
 * Uebrig bleiben die Namen - Firma bzw. Gestalter, dann wer die Datei
 * erstellt hat. Kein Name faellt weg: Leer wird die Angabe nur bei
 * "unbekannt"/"null".
 */
export function cleanAuthor(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/\{\{([^}]*)\}\}/g, (m, inner) => inner.split("|").pop());
  s = s.replace(/https?:\/\/(www\.)?([^\s/]+)\S*/gi, "$2");
  s = s.replace(/Transferred from .*$/gi, " ")
       .replace(/\b\d{1,2} \w+ \d{4} \(original upload date\);?/gi, " ")
       .replace(/Later version\(s\) were uploaded by ([^.]*?) at [\w.]+ ?(Wikipedia)?\s*\.*/gi, ", $1")
       .replace(/The original uploader was (.+?) at [\w ]*Wikipedia\s*\.*/gi, ", $1")
       .replace(/Uploaded by (\S+) at [\w.]+/gi, ", $1")
       .replace(/\b(?:SVG version|converted to PNG|Vector graphics logo|vectori[sz]ed|redrawn) by\b/gi, ",")
       .replace(/\b(?:Vectori[sz]ation|Vector|Original|Logo|File|derivative work)\s*:/gi, ",")
       .replace(/\b[\w.-]+\.(?:png|svg|jpe?g|gif)\s*:?/gi, " ")
       .replace(/\( ?talk ?\)|\[ ?\d+ ?\]|Tel ?\([^)]*\)[\d -]*|™\/®|[™®]|\beh\?|Powered by \w+|- for use on Wikipedia\.?.*$|Done with their permission\.?/gi, " ")
       .replace(/\((?:logo|vectori[sz]ation|upload|owner|history|typeface( creator)?|design firm|company|car company|правообладатель)\)/gi, ",")
       .replace(/^Компания\s+/i, "")
       .replace(/\bUser:\s*/g, "");
  s = s.replace(/\(\s*,?\s*/g, "(").replace(/\s*\)/g, ")").replace(/\(\)/g, " ");
  const teile = [];
  for (let t of s.split(/\s*[,;]\s*(?:and\s+)?/)) {
    t = t.replace(/^[\s.:\-–]+|[\s:\-–]+$|(?<=\s)\.$/g, "").trim()
      .replace(/^by\s+/i, "").replace(/^unknown\s*\(([^)]+)\)$/i, "$1").replace(/(\b[A-Za-z]{5,})\.$/, "$1").replace(/\s+/g, " ");
    if (!t || /^(unknown|null|unknown (author|artist))( unknown( author| artist)?)?$/i.test(t)) continue;
    const doppelt = /^(.+) \1$/.exec(t); if (doppelt) t = doppelt[1];
    if (!teile.some((x) => x.toLowerCase() === t.toLowerCase())) teile.push(t);
  }
  const out = teile.join(", ").slice(0, 140).trim();
  return out || null;
}

/**
 * Lizenzpruefung einer Commons-imageinfo.
 * @returns {{ok:true, license, licenseName, licenseUrl, author, attributionRequired} | {ok:false, reason}}
 */
export function checkLicense(info) {
  if (!info) return { ok: false, reason: "KEINE_DATEIINFO" };
  const ext = info.extmetadata || {};
  const license = licenseCode(meta(ext, "License"), meta(ext, "LicenseShortName"));
  if (!LICENSE_OK.test(license)) return { ok: false, reason: "LIZENZ_NICHT_FREI:" + (license || meta(ext, "LicenseShortName") || "unbekannt") };
  const restrictions = meta(ext, "Restrictions").toLowerCase().split("|").map((s) => s.trim());
  if (restrictions.some((r) => !RESTRICTIONS_OK.has(r))) return { ok: false, reason: "EINSCHRAENKUNG:" + restrictions.join("|") };
  const roh = stripHtml(meta(ext, "Artist"));
  /* Bereinigt; wo die Bereinigung nichts uebrig laesst, bleibt der Rohtext. */
  const author = cleanAuthor(roh) || (/^(null|unknown( author| artist)?( unknown( author| artist)?)?)$/i.test(roh) ? "" : roh);
  /* Apache 2.0 und MIT verlangen den Urheber- und Lizenzhinweis wie CC BY. */
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

/* --------------------------------------------------------- Namens-Weg */

/* Ein Item gilt als Unternehmen, wenn es Kennzeichen eines Unternehmens
   traegt: Boersennotierung, CIK, ISIN, LEI oder eine Branche. */
const FIRMA_PROPS = ["P414", "P5531", "P946", "P1278", "P452"];

function claimValues(entity, prop) {
  return ((entity.claims && entity.claims[prop]) || [])
    .filter((c) => c.rank !== "deprecated" && c.mainsnak && c.mainsnak.datavalue)
    .map((c) => c);
}

/** wbgetentities-Item -> Eintrag im Format von collectItems, oder null. */
export function entityToItem(entity) {
  if (!entity || !entity.claims) return null;
  if (!FIRMA_PROPS.some((p) => claimValues(entity, p).length)) return null;
  const logos = new Map();
  for (const prop of ["P154", "P8972"]) {
    for (const c of claimValues(entity, prop)) {
      if (((c.qualifiers && c.qualifiers.P582) || []).length) continue;
      const name = String(c.mainsnak.datavalue.value || "").replace(/_/g, " ").trim();
      if (!name) continue;
      const title = "File:" + name.charAt(0).toUpperCase() + name.slice(1);
      const startQ = ((c.qualifiers && c.qualifiers.P580) || [])[0];
      if (!logos.has(title)) logos.set(title, {
        preferred: c.rank === "preferred",
        start: (startQ && startQ.datavalue && startQ.datavalue.value && startQ.datavalue.value.time) || "",
        icon: prop === "P8972"
      });
    }
  }
  const sites = new Set(claimValues(entity, "P856")
    .filter((c) => !((c.qualifiers && c.qualifiers.P582) || []).length)
    .map((c) => String(c.mainsnak.datavalue.value || "")).filter(Boolean));
  if (!logos.size && !sites.size) return null;
  const ciks = new Set(claimValues(entity, "P5531").map((c) => normalizeCik(c.mainsnak.datavalue.value)).filter(Boolean));
  const tickers = new Set();
  for (const c of claimValues(entity, "P414")) {
    if (((c.qualifiers && c.qualifiers.P582) || []).length) continue;
    for (const q of (c.qualifiers && c.qualifiers.P249) || []) if (q.datavalue) tickers.add(normalizeTicker(q.datavalue.value));
  }
  const names = [];
  const lab = entity.labels && entity.labels.en;
  if (lab) names.push(lab.value);
  for (const a of (entity.aliases && entity.aliases.en) || []) names.push(a.value);
  const listed = ["P414", "P5531", "P946", "P1278"].some((p) => claimValues(entity, p).length);
  return { item: entity.id, label: lab ? lab.value : "", names, ciks, tickers, usTickers: new Set(), logos, sites, listed };
}

/**
 * Namens-Weg fuer einen Titel: genau ein Kandidat mit exakt gleichem Namen
 * (Bezeichnung oder Alias), ohne widersprechende CIK oder Ticker.
 */
export function matchByName(row, candidates) {
  const cik = normalizeCik(row.cik), sym = normalizeTicker(row.symbol);
  const ok = candidates.filter((e) => e &&
    e.names.some((n) => namesEqual(n, row.name)) &&
    !(cik && e.ciks.size && !e.ciks.has(cik)) &&
    !(e.tickers.size && !e.tickers.has(sym)));
  let unique = [...new Map(ok.map((e) => [e.item, e])).values()];
  /* Zwei gleichnamige Items (etwa Konzern und Marke): das boersennotierte zaehlt. */
  if (unique.length > 1) {
    const listed = unique.filter((e) => e.listed);
    if (listed.length === 1) unique = listed;
  }
  if (unique.length !== 1) return { reason: unique.length ? "MEHRERE_ITEMS" : "KEIN_WIKIDATA_LOGO" };
  const titles = rankLogos(unique[0]);
  return { match: { item: unique[0].item, label: unique[0].label, title: titles[0] || null, titles, via: "NAME",
                     sites: [...(unique[0].sites || [])].sort() } };
}
