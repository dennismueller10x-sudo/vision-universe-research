#!/usr/bin/env node
/**
 * Firmenlogos fuer Discover aus Wikimedia Commons.
 *
 *   node scripts/discover/build-company-logos.mjs [--limit=N] [--dry-run]
 *
 * Liest das Discover-Universum (discover/data/search/US_REAL.json) und die
 * CIKs aus company-names.json, fragt Wikidata nach Logos, prueft jede
 * Commons-Datei auf eine freie Lizenz und laedt eine verkleinerte Fassung
 * nach discover/logos/files/. Regeln: scripts/discover/company-logos-lib.mjs.
 *
 * Ausgabe (bewusst NICHT unter discover/data - das baut build-discover-data
 * bei jedem Lauf neu auf):
 *   discover/logos/index.json    Symbol -> Datei (fuer die Oberflaeche)
 *   discover/logos/credits.json  Symbol -> Quelle, Urheber, Lizenz
 *   discover/logos/summary.json  Abdeckung und Ausschlussgruende
 *   discover/logos/missing.json  je Titel ohne Logo der Grund
 *
 * Titel in discover/config/logo-exclusions.json bekommen nie ein Logo -
 * dort landet, was ein Rechteinhaber entfernt haben moechte.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  USER_AGENT, THUMB_WIDTH, SPARQL_BY_CIK, SPARQL_BY_TICKER, MIME_EXT,
  collectItems, matchUniverse, checkLicense, safeSymbol, entityToItem, matchByName, searchName
} from "./company-logos-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, "discover", "logos");
const FILES = join(OUT, "files");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY = Boolean(args["dry-run"]);

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, opts = {}, versuch = 0) {
  const res = await fetch(url, { ...opts, headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, ...(opts.headers || {}) } });
  if ((res.status === 429 || res.status >= 500) && versuch < 5) {
    const warte = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** versuch;
    console.log(`     ${res.status} - warte ${Math.round(warte / 1000)} s`);
    await sleep(warte);
    return http(url, opts, versuch + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
  return res;
}

async function sparql(query) {
  const res = await http("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: "query=" + encodeURIComponent(query)
  });
  return (await res.json()).results.bindings;
}

async function imageinfo(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&maxlag=5" +
      "&prop=imageinfo&iiprop=url|sha1|mime|extmetadata&iiurlwidth=" + THUMB_WIDTH +
      "&iiextmetadatafilter=License|LicenseShortName|LicenseUrl|Artist|Restrictions" +
      "&titles=" + encodeURIComponent(chunk.join("|"));
    const data = await (await http(url)).json();
    const alias = new Map(((data.query && data.query.normalized) || []).map((n) => [n.to, n.from]));
    for (const p of (data.query && data.query.pages) || []) {
      const info = p.imageinfo && p.imageinfo[0];
      out.set(alias.get(p.title) || p.title, info || null);
      if (alias.has(p.title)) out.set(p.title, info || null);
    }
    await sleep(300);
  }
  return out;
}

/* ------------------------------------------------------------ Universum */
const search = readJson(join(root, "discover", "data", "search", "US_REAL.json"));
const names = readJson(join(root, "quant", "data", "market", "security-master", "company-names.json"), { rows: [] });
const exclusions = readJson(join(root, "discover", "config", "logo-exclusions.json"), { symbols: {} }).symbols || {};
const cikOf = new Map(names.rows.filter((r) => r.ticker).map((r) => [r.ticker, r.cik || null]));
const universe = search.entries
  .filter((e) => safeSymbol(e.s) && !exclusions[e.s])
  .map((e) => ({ symbol: e.s, name: e.n || e.s, cik: cikOf.get(e.s) || null }));
console.log(`Discover-Universum: ${universe.length} Titel (${Object.keys(exclusions).length} ausgeschlossen)`);

/* ------------------------------------------------------------- Wikidata */
console.log("1/3  Wikidata: Logos ueber CIK und Ticker …");
const items = collectItems(await sparql(SPARQL_BY_CIK));
collectItems(await sparql(SPARQL_BY_TICKER), items);
const { matches, reasons } = matchUniverse(universe, items);
console.log(`     ${items.size} Items mit Logo, ${matches.size} Titel ueber CIK/Ticker zugeordnet`);

/* Namens-Weg: nur fuer Titel, zu denen Wikidata bisher gar nichts kennt -
   ein Titel mit widersprechendem Treffer bleibt ohne Logo. */
if (!args["no-name-search"]) {
  const offen = universe.filter((r) => reasons.get(r.symbol) === "KEIN_WIKIDATA_LOGO" && r.name && r.name !== r.symbol).slice(0, LIMIT);
  console.log(`     Namenssuche fuer ${offen.length} Titel …`);
  const treffer = new Map();
  for (const [i, r] of offen.entries()) {
    const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&search=" + encodeURIComponent(searchName(r.name));
    try { treffer.set(r.symbol, ((await (await http(url)).json()).search || []).map((x) => x.id)); }
    catch (e) { treffer.set(r.symbol, []); }
    if (i % 500 === 499) console.log(`     … ${i + 1}`);
    await sleep(60);
  }
  const ids = [...new Set([...treffer.values()].flat())];
  const entities = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|aliases&languages=en&maxlag=5&ids=" + ids.slice(i, i + 50).join("|");
    const data = await (await http(url)).json();
    for (const [id, ent] of Object.entries(data.entities || {})) entities.set(id, entityToItem(ent));
    await sleep(150);
  }
  let neu = 0;
  for (const r of offen) {
    const res = matchByName(r, (treffer.get(r.symbol) || []).map((id) => entities.get(id)).filter(Boolean));
    if (res.match) { matches.set(r.symbol, res.match); reasons.delete(r.symbol); neu++; }
    else reasons.set(r.symbol, res.reason);
  }
  console.log(`     Namenssuche: ${neu} weitere Titel zugeordnet`);
}

/* -------------------------------------------------------------- Commons */
console.log("2/3  Commons: Lizenz je Datei …");
const kandidaten = [...matches.entries()].slice(0, LIMIT);
const infos = await imageinfo([...new Set(kandidaten.flatMap(([, m]) => m.titles || [m.title]))]);

/* ------------------------------------------------------------ Download */
console.log("3/3  Verkleinerte Fassungen laden …");
const vorher = readJson(join(OUT, "credits.json"), { credits: {} }).credits || {};
const files = {}, credits = {};
if (!DRY) mkdirSync(FILES, { recursive: true });
let geladen = 0, behalten = 0, frei = 0;
for (const [sym, m0] of kandidaten) {
  /* Das erste Logo der Firma mit freier Lizenz - aeltere sind Ersatz. */
  let m = m0, info = null, lic = { ok: false, reason: "KEINE_DATEIINFO" };
  for (const title of m0.titles || [m0.title]) {
    const i = infos.get(title), l = checkLicense(i);
    if (l.ok) { m = { ...m0, title }; info = i; lic = l; break; }
    if (lic.reason === "KEINE_DATEIINFO") lic = l;
  }
  if (!lic.ok) { reasons.set(sym, lic.reason); continue; }
  frei++;
  const alt = vorher[sym];
  if (alt && alt.sha1 === info.sha1 && alt.path && existsSync(join(OUT, alt.path))) {
    files[sym] = alt.path; credits[sym] = alt; behalten++; continue;
  }
  if (DRY) continue;
  try {
    const res = await http(info.thumburl || info.url);
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = MIME_EXT[mime];
    if (!ext) { reasons.set(sym, "FORMAT:" + mime); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 200 * 1024) { reasons.set(sym, "ZU_GROSS"); continue; }
    const path = "files/" + sym + "." + ext;
    for (const f of readdirSync(FILES)) if (f.startsWith(sym + ".") && f !== sym + "." + ext) rmSync(join(FILES, f));
    writeFileSync(join(OUT, path), buf);
    files[sym] = path;
    credits[sym] = {
      path, title: m.title, page: info.descriptionurl, sha1: info.sha1,
      license: lic.license, licenseName: lic.licenseName, licenseUrl: lic.licenseUrl,
      author: lic.author, attributionRequired: lic.attributionRequired,
      wikidata: m.item, via: m.via
    };
    geladen++;
    await sleep(150);
  } catch (e) {
    reasons.set(sym, "DOWNLOAD_FEHLER");
    console.log(`     ${sym}: ${e.message}`);
  }
}

if (DRY) {
  console.log(`Probelauf: ${frei} von ${kandidaten.length} zugeordneten Titeln haben eine freie Lizenz.`);
  process.exit(0);
}

/* Dateien, die zu keinem Titel mehr gehoeren, verschwinden - aber nur nach
   einem vollstaendigen Lauf, nie nach einem begrenzten. */
if (Number.isFinite(LIMIT)) { console.log("Begrenzter Lauf (--limit): nichts geschrieben."); process.exit(0); }
const behaltenePfade = new Set(Object.values(files).map((p) => p.slice("files/".length)));
for (const f of readdirSync(FILES)) if (!f.startsWith(".") && !behaltenePfade.has(f)) rmSync(join(FILES, f));

const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const generatedAt = new Date().toISOString();
const grundZaehler = {};
for (const r of reasons.values()) { const k = r.split(":")[0]; grundZaehler[k] = (grundZaehler[k] || 0) + 1; }

writeFileSync(join(OUT, "index.json"), JSON.stringify({
  version: "company-logos-1.0.0",
  generatedAt,
  source: "WIKIMEDIA_COMMONS",
  boundary: "Logos dienen allein der Identifizierung des Unternehmens neben seinen eigenen Kursdaten. Nur Commons-Dateien mit freier Lizenz (gemeinfrei, CC0, CC BY, CC BY-SA), unveraendert und nur verkleinert. Nicht fuer Werbung, Social-Media-Beitraege oder eigene Grafiken. Urheber und Lizenz: credits.json.",
  count: Object.keys(files).length,
  files: sortiert(files)
}) + "\n");
writeFileSync(join(OUT, "credits.json"), JSON.stringify({
  version: "company-logos-1.0.0", generatedAt, credits: sortiert(credits)
}, null, 1) + "\n");
writeFileSync(join(OUT, "missing.json"), JSON.stringify({
  generatedAt,
  note: "Titel ohne Logo und der Grund. KEIN_WIKIDATA_LOGO: Wikidata kennt fuer die Firma kein Logo (oder die Firma nicht). NAME_ODER_CIK_WIDERSPRICHT / MEHRERE_ITEMS: Zuordnung unklar, deshalb bewusst ohne Logo. LIZENZ_NICHT_FREI / EINSCHRAENKUNG / URHEBER_FEHLT: kein Logo der Firma mit freier Lizenz.",
  reasons: sortiert(Object.fromEntries([...reasons].filter(([sym]) => !files[sym])))
}, null, 1) + "\n");
writeFileSync(join(OUT, "summary.json"), JSON.stringify({
  generatedAt,
  universe: universe.length,
  withLogo: Object.keys(files).length,
  pct: Math.round((Object.keys(files).length / Math.max(1, universe.length)) * 1000) / 10,
  downloaded: geladen, unchanged: behalten,
  byVia: Object.values(credits).reduce((a, c) => ((a[c.via] = (a[c.via] || 0) + 1), a), {}),
  byLicense: Object.values(credits).reduce((a, c) => ((a[c.license] = (a[c.license] || 0) + 1), a), {}),
  excluded: grundZaehler
}, null, 1) + "\n");

console.log(`Fertig: ${Object.keys(files).length}/${universe.length} Titel mit Logo (${geladen} neu, ${behalten} unveraendert).`);
console.log("Ausgeschlossen:", JSON.stringify(grundZaehler));
