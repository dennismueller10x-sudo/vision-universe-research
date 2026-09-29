#!/usr/bin/env node
/**
 * Firmenlogos fuer Discover - zwei Quellen in fester Reihenfolge.
 *
 *   node scripts/discover/build-company-logos.mjs [--limit=N] [--dry-run]
 *        [--no-name-search] [--no-web] [--refresh-web]
 *
 * 1. Wikimedia Commons: Logo ueber Wikidata, nur mit freier Lizenz
 *    (Regeln: scripts/discover/company-logos-lib.mjs).
 * 2. Wo Commons nichts hat: das Icon der offiziellen Website der Firma
 *    (Regeln: scripts/discover/company-logos-web.mjs). Braucht die
 *    Bibliothek sharp (npm install --no-save sharp); fehlt sie, entfaellt
 *    dieser Schritt. SEC-Stammdaten nur mit SEC_USER_AGENT.
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
import { createHash } from "node:crypto";
import {
  normalizeSite, parseIconLinks, parseManifest, orderCandidates, toPng, genericIcons
} from "./company-logos-web.mjs";
import {
  USER_AGENT, THUMB_WIDTH, SPARQL_BY_CIK, SPARQL_BY_TICKER, SPARQL_SITE_BY_CIK, SPARQL_SITE_BY_TICKER, MIME_EXT,
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

/** Arbeitet eine Liste mit n gleichzeitigen Aufgaben ab. */
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const x = list[i++]; await fn(x); }
  }));
}

async function holen(url, max) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,image/*,*/*;q=0.8" } });
  if (!res.ok) throw new Error(String(res.status));
  const len = Number(res.headers.get("content-length") || 0);
  if (len > max) throw new Error("ZU_GROSS");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error("ZU_GROSS");
  return { buf, url: res.url || url };
}

/** Das beste Icon einer Website als verkleinertes PNG, oder {reason}. */
async function webIcon(site, sharp) {
  let found = [], base = site.url;
  try {
    const seite = await holen(site.url, 3 * 1024 * 1024);
    base = seite.url;
    const { icons, manifest } = parseIconLinks(seite.buf.toString("utf8"), base);
    found = icons;
    if (manifest) {
      try { found = found.concat(parseManifest(JSON.parse((await holen(manifest, 512 * 1024)).buf.toString("utf8")), manifest)); }
      catch (e) { /* ohne Manifest */ }
    }
  } catch (e) { /* Startseite nicht erreichbar - Standardpfade versuchen */ }
  let grund = "WEB_KEIN_ICON";
  for (const c of orderCandidates(found, new URL(base).origin).slice(0, 6)) {
    try {
      const { buf } = await holen(c.href, 2 * 1024 * 1024);
      const res = await toPng(buf, sharp);
      if (res.png) return { png: res.png, iconUrl: c.href };
      grund = res.reason;
    } catch (e) { /* naechster Kandidat */ }
  }
  return { reason: grund };
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
const kandidaten = [...matches.entries()].filter(([, m]) => m.titles && m.titles.length).slice(0, LIMIT);
for (const [sym, m] of matches) if (!(m.titles && m.titles.length)) reasons.set(sym, "KEIN_WIKIDATA_LOGO");
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
    files[sym] = alt.path; credits[sym] = { source: "WIKIMEDIA_COMMONS", ...alt }; behalten++; continue;
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
      source: "WIKIMEDIA_COMMONS", path, title: m.title, page: info.descriptionurl, sha1: info.sha1,
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

/* ------------------------------------------------ Zweite Quelle: Website */
let webNeu = 0, webBehalten = 0;
if (!args["no-web"] && !DRY) {
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch (e) { console.log("     sharp fehlt - Website-Icons entfallen."); }
  if (sharp) {
    console.log("4/4  Website-Icons fuer Titel ohne Commons-Logo …");
    const ohne = universe.filter((r) => !files[r.symbol]).slice(0, LIMIT);

    /* Website: Wikidata (CIK, Ticker, Name), sonst SEC-Stammdaten. */
    const siteItems = collectItems(await sparql(SPARQL_SITE_BY_CIK));
    collectItems(await sparql(SPARQL_SITE_BY_TICKER), siteItems);
    const siteMatches = matchUniverse(ohne, siteItems).matches;
    const siteOf = new Map();
    for (const r of ohne) {
      const quelle = siteMatches.get(r.symbol) || matches.get(r.symbol);
      const site = quelle && (quelle.sites || []).map(normalizeSite).find(Boolean);
      if (site) siteOf.set(r.symbol, { ...site, via: "WIKIDATA_" + quelle.via });
    }
    const secUa = process.env.SEC_USER_AGENT;
    if (secUa) {
      const offen = ohne.filter((r) => !siteOf.has(r.symbol) && r.cik);
      console.log(`     SEC-Stammdaten fuer ${offen.length} Titel …`);
      await pool(offen, 4, async (r) => {
        try {
          const res = await fetch("https://data.sec.gov/submissions/CIK" + String(r.cik).padStart(10, "0") + ".json",
            { headers: { "User-Agent": secUa }, signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const site = normalizeSite((await res.json()).website);
            if (site) siteOf.set(r.symbol, { ...site, via: "SEC_CIK" });
          }
        } catch (e) { /* ohne Website */ }
        await sleep(300);
      });
    }
    console.log(`     ${siteOf.size} von ${ohne.length} Titeln mit offizieller Website`);

    const icons = new Map();
    await pool(ohne.filter((r) => siteOf.has(r.symbol)), 8, async (r) => {
      const site = siteOf.get(r.symbol);
      const alt = vorher[r.symbol];
      if (!args["refresh-web"] && alt && alt.source === "WEBSITE" && alt.host === site.host && alt.path && existsSync(join(OUT, alt.path))) {
        icons.set(r.symbol, { hash: alt.sha1, host: site.host, alt });
        return;
      }
      const res = await webIcon(site, sharp);
      if (res.png) icons.set(r.symbol, { hash: createHash("sha1").update(res.png).digest("hex"), host: site.host, png: res.png, iconUrl: res.iconUrl, site });
      else reasons.set(r.symbol, res.reason);
    });
    const generisch = genericIcons(icons);
    for (const [sym, ic] of icons) {
      if (generisch.has(sym)) { reasons.set(sym, "WEB_ICON_GENERISCH"); continue; }
      if (ic.alt) { files[sym] = ic.alt.path; credits[sym] = ic.alt; webBehalten++; continue; }
      const path = "files/" + sym + ".png";
      for (const f of readdirSync(FILES)) if (f.startsWith(sym + ".") && f !== sym + ".png") rmSync(join(FILES, f));
      writeFileSync(join(OUT, path), ic.png);
      files[sym] = path;
      credits[sym] = { source: "WEBSITE", path, page: ic.site.url, host: ic.site.host, iconUrl: ic.iconUrl,
                       sha1: ic.hash, via: ic.site.via, licenseName: "Marke des Inhabers" };
      reasons.delete(sym);
      webNeu++;
    }
    console.log(`     Website-Icons: ${webNeu} neu, ${webBehalten} unveraendert, ${generisch.size} generisch verworfen`);
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
  sources: ["WIKIMEDIA_COMMONS", "WEBSITE"],
  boundary: "Logos dienen allein der Identifizierung des Unternehmens neben seinen eigenen Kursdaten. Zuerst Wikimedia Commons (nur freie Lizenz: gemeinfrei, CC0, CC BY, CC BY-SA), sonst das Icon der offiziellen Website des Unternehmens (Marke des Inhabers, keine Lizenz). Unveraendert und nur verkleinert. Nicht fuer Werbung, Social-Media-Beitraege oder eigene Grafiken. Quelle je Logo: credits.json.",
  count: Object.keys(files).length,
  files: sortiert(files)
}) + "\n");
writeFileSync(join(OUT, "credits.json"), JSON.stringify({
  version: "company-logos-1.0.0", generatedAt, credits: sortiert(credits)
}, null, 1) + "\n");
writeFileSync(join(OUT, "missing.json"), JSON.stringify({
  generatedAt,
  note: "Titel ohne Logo und der Grund. KEIN_WIKIDATA_LOGO: Wikidata kennt fuer die Firma kein Logo (oder die Firma nicht). NAME_ODER_CIK_WIDERSPRICHT / MEHRERE_ITEMS: Zuordnung unklar, deshalb bewusst ohne Logo. LIZENZ_NICHT_FREI / EINSCHRAENKUNG / URHEBER_FEHLT: kein Logo der Firma mit freier Lizenz. WEB_*: die Website brachte kein brauchbares Icon (keins, zu klein, generisch).",
  reasons: sortiert(Object.fromEntries([...reasons].filter(([sym]) => !files[sym])))
}, null, 1) + "\n");
writeFileSync(join(OUT, "summary.json"), JSON.stringify({
  generatedAt,
  universe: universe.length,
  withLogo: Object.keys(files).length,
  pct: Math.round((Object.keys(files).length / Math.max(1, universe.length)) * 1000) / 10,
  downloaded: geladen + webNeu, unchanged: behalten + webBehalten,
  bySource: Object.values(credits).reduce((a, c) => ((a[c.source] = (a[c.source] || 0) + 1), a), {}),
  byVia: Object.values(credits).reduce((a, c) => ((a[c.via] = (a[c.via] || 0) + 1), a), {}),
  byLicense: Object.values(credits).filter((c) => c.license).reduce((a, c) => ((a[c.license] = (a[c.license] || 0) + 1), a), {}),
  excluded: grundZaehler
}, null, 1) + "\n");

console.log(`Fertig: ${Object.keys(files).length}/${universe.length} Titel mit Logo (Commons ${geladen} neu/${behalten} unveraendert, Website ${webNeu} neu/${webBehalten} unveraendert).`);
console.log("Ausgeschlossen:", JSON.stringify(grundZaehler));
