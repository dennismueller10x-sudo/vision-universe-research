#!/usr/bin/env node
/**
 * Firmenlogos fuer Discover - zwei Quellen in fester Reihenfolge.
 *
 *   node scripts/discover/build-company-logos.mjs [--limit=N] [--dry-run]
 *        [--no-name-search] [--no-web] [--refresh-web] [--refresh-sites]
 *        [--only=NVDA,PYPL --debug]   Diagnose einzelner Titel, schreibt nichts
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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  normalizeSite, parseIconLinks, parseManifest, orderCandidates, toPng, genericIcons,
  WEB_USER_AGENT, websiteFromFiling, filingText, latestReport, rootDomain, isLightOnTransparent,
  normalizeLogo, logoFilings, secLogoImages, parseIsharesUsTickers
} from "./company-logos-web.mjs";
import {
  USER_AGENT, THUMB_WIDTH, SPARQL_BY_CIK, SPARQL_BY_TICKER, SPARQL_SITE_BY_CIK, SPARQL_SITE_BY_TICKER, MIME_EXT,
  collectItems, matchUniverse, checkLicense, safeSymbol, entityToItem, matchByName, searchName
} from "./company-logos-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_OUT = join(root, "discover", "logos");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY = Boolean(args["dry-run"]);
const ONLY = args.only ? new Set(String(args.only).toUpperCase().split(",").map((x) => x.trim()).filter(Boolean)) : null;
const DEBUG = Boolean(args.debug) || Boolean(ONLY);
const dbg = (...a) => { if (DEBUG) console.log("  [diag]", ...a); };
/* Diagnose schreibt in einen Wegwerf-Ordner, nie ins Repository. */
const OUT = ONLY ? mkdtempSync(join(tmpdir(), "logos-diag-")) : REAL_OUT;
const FILES = join(OUT, "files");

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

/**
 * Laedt hoechstens max Bytes (liest den Rest nicht - ein Jahresbericht kann
 * 20 MB haben, die Website steht vorn). Mit truncate=false ist mehr ein Fehler.
 */
async function holen(url, max, { ua = WEB_USER_AGENT, truncate = false, accept = "text/html,image/*,*/*;q=0.8" } = {}) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": ua, Accept: accept, "Accept-Language": "en-US,en;q=0.8" } });
  if (!res.ok) throw new Error(String(res.status));
  const len = Number(res.headers.get("content-length") || 0);
  if (len > max && !truncate) throw new Error("ZU_GROSS");
  const teile = [];
  let n = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    teile.push(value); n += value.length;
    if (n > max) {
      try { await reader.cancel(); } catch (e) { /* egal */ }
      if (!truncate) throw new Error("ZU_GROSS");
      break;
    }
  }
  return { buf: Buffer.concat(teile.map((t) => Buffer.from(t))), url: res.url || url };
}

/* SEC: hoechstens ~8 Anfragen je Sekunde (Grenze der SEC: 10), eine nach der anderen. */
let secLetzte = 0;
async function secHolen(url, max, ua) {
  const warte = secLetzte + 130 - Date.now();
  if (warte > 0) await sleep(warte);
  secLetzte = Date.now();
  return holen(url, max, { ua, truncate: true, accept: "application/json,text/html,*/*" });
}

/** Das beste Icon einer Website als verkleinertes PNG, oder {reason}. */
async function webIcon(site, sharp, sym, companyName) {
  let found = [], base = site.url, inlineSvg = null;
  /* Startseite, bei Fehler dieselbe Adresse mit bzw. ohne "www." */
  const varianten = [site.url];
  try {
    const u = new URL(site.url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : "www." + u.hostname;
    varianten.push(u.href);
    /* Investoren- oder Laenderseite (ir.united.com): auch die Hauptdomain. */
    const haupt = rootDomain(new URL(site.url).hostname);
    if (haupt && haupt !== new URL(site.url).hostname.replace(/^www\./, "")) varianten.push("https://www." + haupt + "/");
  } catch (e) { /* nur die eine */ }
  for (const url of varianten) {
    try {
      const seite = await holen(url, 3 * 1024 * 1024, { truncate: true });
      base = seite.url;
      const r = parseIconLinks(seite.buf.toString("utf8"), base, companyName);
      /* Nur kleine Icons auf der Investorenseite: die Hauptseite versuchen. */
      if (!r.icons.some((c) => c.size >= 64 || c.kind === "logo") && !r.inlineSvg && url !== varianten[varianten.length - 1]) {
        dbg(sym, "Startseite", seite.url, "ohne grosses Icon - naechste Variante");
        if (!found.length) { found = r.icons; base = seite.url; }
        continue;
      }
      found = r.icons; inlineSvg = r.inlineSvg;
      dbg(sym, "Startseite", base, found.length + " Kandidaten", inlineSvg ? "+ Inline-SVG" : "");
      if (r.manifest) {
        try { found = found.concat(parseManifest(JSON.parse((await holen(r.manifest, 512 * 1024)).buf.toString("utf8")), r.manifest)); }
        catch (e) { dbg(sym, "Manifest", r.manifest, e.message); }
      }
      break;
    } catch (e) { dbg(sym, "Startseite", url, "Fehler", e.message); }
  }
  let grund = "WEB_KEIN_ICON";
  for (const c of orderCandidates(found, new URL(base).origin).slice(0, 12)) {
    try {
      const { buf } = await holen(c.href, 3 * 1024 * 1024);
      const res = await toPng(buf, sharp, { logo: c.kind === "logo" });
      dbg(sym, c.kind, c.href, res.png ? "OK" : res.reason);
      if (res.png) return { png: res.png, iconUrl: c.href, ratio: res.ratio, kind: c.kind };
      grund = res.reason;
    } catch (e) { dbg(sym, c.kind, c.href, "Fehler", e.message); }
  }
  if (inlineSvg) {
    try {
      const res = await toPng(Buffer.from(inlineSvg), sharp, { logo: true });
      dbg(sym, "inline-svg", res.png ? "OK" : res.reason);
      if (res.png) return { png: res.png, iconUrl: base + "#inline-svg-logo", ratio: res.ratio, kind: "logo" };
    } catch (e) { dbg(sym, "inline-svg", "Fehler", e.message); }
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
  .filter((e) => safeSymbol(e.s) && !exclusions[e.s] && (!ONLY || ONLY.has(e.s)))
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
/* Aufbereitung (einheitliches 128er-Quadrat) braucht sharp; FORMAT zaehlt
   hoch, wenn sich die Aufbereitung aendert - aeltere Dateien werden neu geholt. */
const FORMAT = 2;
let SHARP = null;
try { SHARP = (await import("sharp")).default; } catch (e) { console.log("     sharp fehlt - Logos werden nicht einheitlich aufbereitet."); }
const vorher = ONLY ? {} : (readJson(join(REAL_OUT, "credits.json"), { credits: {} }).credits || {});
const files = {}, credits = {};
if (!DRY) mkdirSync(FILES, { recursive: true });
let geladen = 0, behalten = 0, frei = 0;
for (const [sym, m0] of kandidaten) {
  /* Das erste Logo der Firma mit freier Lizenz - aeltere sind Ersatz. */
  let m = m0, info = null, lic = { ok: false, reason: "KEINE_DATEIINFO" };
  for (const title of m0.titles || [m0.title]) {
    const i = infos.get(title), l = checkLicense(i);
    dbg(sym, "Commons", title, i ? JSON.stringify(Object.fromEntries(Object.entries(i.extmetadata || {}).map(([k, v]) => [k, String(v.value).slice(0, 80)]))) : "keine Dateiinfo", "->", l.ok ? "frei" : l.reason);
    if (l.ok) { m = { ...m0, title }; info = i; lic = l; break; }
    if (lic.reason === "KEINE_DATEIINFO") lic = l;
  }
  if (!lic.ok) { reasons.set(sym, lic.reason); continue; }
  frei++;
  const alt = vorher[sym];
  if (alt && alt.sha1 === info.sha1 && alt.fmt === FORMAT && alt.path && existsSync(join(OUT, alt.path))) {
    files[sym] = alt.path; credits[sym] = { source: "WIKIMEDIA_COMMONS", ...alt }; behalten++; continue;
  }
  if (DRY) continue;
  try {
    const res = await http(info.thumburl || info.url);
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = MIME_EXT[mime];
    if (!ext) { reasons.set(sym, "FORMAT:" + mime); continue; }
    let buf = Buffer.from(await res.arrayBuffer()), ratio = null, zielExt = ext;
    if (buf.length > 1024 * 1024) { reasons.set(sym, "ZU_GROSS"); continue; }
    if (SHARP) { const n = await normalizeLogo(buf, SHARP); buf = n.png; ratio = Math.round(n.ratio * 100) / 100; zielExt = "png"; }
    const path = "files/" + sym + "." + zielExt;
    for (const f of readdirSync(FILES)) if (f.startsWith(sym + ".") && f !== sym + "." + zielExt) rmSync(join(FILES, f));
    writeFileSync(join(OUT, path), buf);
    files[sym] = path;
    credits[sym] = {
      source: "WIKIMEDIA_COMMONS", path, title: m.title, page: info.descriptionurl, sha1: info.sha1, fmt: SHARP ? FORMAT : 1, ratio,
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
let webNeu = 0, webBehalten = 0, webSites = null;
if (!args["no-web"] && !DRY) {
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch (e) { console.log("     sharp fehlt - Website-Icons entfallen."); }
  if (sharp) {
    console.log("4/5  Website-Icons fuer Titel ohne Commons-Logo oder mit breitem Schriftzug …");
    /* Ein breiter Schriftzug (NVIDIA 5:1) wird im Quadrat winzig. Hat die
       Website ein quadratisches Symbol, geht das vor. */
    const breit = new Set(Object.entries(credits).filter(([, c]) => c.ratio && c.ratio > 2.2).map(([s]) => s));
    const ohne = universe.filter((r) => !files[r.symbol] || breit.has(r.symbol)).slice(0, LIMIT);
    console.log(`     ${ohne.filter((r) => !files[r.symbol]).length} ohne Logo, ${breit.size} mit breitem Schriftzug`);

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
    /* Gefundene Adressen bleiben im Zwischenspeicher - die SEC muss nicht
       jede Woche 3000 Berichte liefern. */
    const cache = args["refresh-sites"] ? {} : (readJson(join(REAL_OUT, "sites.json"), { sites: {} }).sites || {});
    for (const r of ohne) {
      if (siteOf.has(r.symbol) || !cache[r.symbol]) continue;
      const site = normalizeSite(cache[r.symbol].url);
      if (site) siteOf.set(r.symbol, { ...site, via: cache[r.symbol].via });
    }
    const secUa = process.env.SEC_USER_AGENT;
    if (secUa) {
      const offen = ohne.filter((r) => !siteOf.has(r.symbol) && r.cik);
      console.log(`     SEC fuer ${offen.length} Titel (Stammdaten, sonst Jahresbericht) …`);
      const stat = { stamm: 0, bericht: 0, fehler: 0, ohne: 0 };
      let i = 0;
      for (const r of offen) {
        try {
          const cik = String(Number(r.cik));
          const sub = JSON.parse((await secHolen("https://data.sec.gov/submissions/CIK" + cik.padStart(10, "0") + ".json", 8 * 1024 * 1024, secUa)).buf.toString("utf8"));
          let site = normalizeSite(sub.website) || normalizeSite(sub.investorWebsite);
          let via = "SEC_STAMMDATEN";
          if (!site) {
            const rep = latestReport(sub.filings && sub.filings.recent);
            if (rep) {
              const url = "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + rep.accession.replace(/-/g, "") + "/" + rep.document;
              const dom = websiteFromFiling(filingText((await secHolen(url, 4 * 1024 * 1024, secUa)).buf.toString("utf8")), r.name);
              dbg(r.symbol, "SEC", rep.form, url, "->", dom || "keine Adresse");
              site = dom ? normalizeSite("https://www." + dom) : null;
              via = "SEC_" + rep.form.replace(/\W/g, "");
            }
          } else dbg(r.symbol, "SEC-Stammdaten", site.url);
          if (site) { siteOf.set(r.symbol, { ...site, via }); stat[via === "SEC_STAMMDATEN" ? "stamm" : "bericht"]++; }
          else stat.ohne++;
        } catch (e) { stat.fehler++; dbg(r.symbol, "SEC Fehler", e.message); }
        if (++i % 250 === 0) console.log(`     … ${i} (${JSON.stringify(stat)})`);
      }
      console.log(`     SEC: ${JSON.stringify(stat)}`);
    } else console.log("     SEC_USER_AGENT fehlt - keine SEC-Adressen.");
    console.log(`     ${siteOf.size} von ${ohne.length} Titeln mit offizieller Website`);

    const icons = new Map();
    await pool(ohne.filter((r) => siteOf.has(r.symbol)), 8, async (r) => {
      const site = siteOf.get(r.symbol);
      const alt = vorher[r.symbol];
      if (!args["refresh-web"] && alt && alt.source === "WEBSITE" && alt.fmt === FORMAT && alt.host === site.host && alt.path && existsSync(join(OUT, alt.path))) {
        icons.set(r.symbol, { hash: alt.sha1, host: site.host, alt });
        return;
      }
      const res = await webIcon(site, sharp, r.symbol, r.name);
      /* Ersetzt einen Commons-Schriftzug nur durch ein quadratisches Icon. */
      if (breit.has(r.symbol) && files[r.symbol] && !(res.png && res.kind !== "logo" && res.ratio <= 1.4)) return;
      if (res.png) icons.set(r.symbol, { hash: createHash("sha1").update(res.png).digest("hex"), host: site.host, png: res.png, iconUrl: res.iconUrl, site, ratio: res.ratio });
      else if (!files[r.symbol]) reasons.set(r.symbol, res.reason);
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
                       sha1: ic.hash, via: ic.site.via, licenseName: "Marke des Inhabers", fmt: FORMAT,
                       ratio: Math.round((ic.ratio || 1) * 100) / 100 };
      reasons.delete(sym);
      webNeu++;
    }
    console.log(`     Website-Icons: ${webNeu} neu, ${webBehalten} unveraendert, ${generisch.size} generisch verworfen`);
    for (const r of ohne) if (!siteOf.has(r.symbol) && reasons.get(r.symbol) === "KEIN_WIKIDATA_LOGO") reasons.set(r.symbol, "KEINE_WEBSITE_BEKANNT");
    webSites = Object.fromEntries([...siteOf].map(([sym, st]) => [sym, { url: st.url, via: st.via }]));

    /* ------------------------------ Dritte Quelle: Logo aus SEC-Einreichung */
    if (secUa && !args["no-sec-logo"]) {
      const rest = universe.filter((r) => !files[r.symbol] && r.cik).slice(0, LIMIT);
      console.log(`5/5  Logo aus SEC-Einreichungen fuer ${rest.length} Titel …`);
      const stat = { ok: 0, ohneBild: 0, fehler: 0 };
      let i = 0;
      for (const r of rest) {
        const alt = vorher[r.symbol];
        if (!args["refresh-web"] && alt && alt.source === "SEC_FILING" && alt.fmt === FORMAT && alt.path && existsSync(join(OUT, alt.path))) {
          files[r.symbol] = alt.path; credits[r.symbol] = alt; reasons.delete(r.symbol); stat.ok++; continue;
        }
        try {
          const cik = String(Number(r.cik));
          const sub = JSON.parse((await secHolen("https://data.sec.gov/submissions/CIK" + cik.padStart(10, "0") + ".json", 8 * 1024 * 1024, secUa)).buf.toString("utf8"));
          let treffer = null;
          for (const f of logoFilings(sub.filings && sub.filings.recent, 3)) {
            const doc = "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + f.accession.replace(/-/g, "") + "/" + f.document;
            const bilder = secLogoImages((await secHolen(doc, 3 * 1024 * 1024, secUa)).buf.toString("utf8"), doc, r.name);
            dbg(r.symbol, "SEC-Logo", f.form, doc, bilder.length + " Bild(er)");
            for (const url of bilder) {
              try {
                const res = await toPng((await secHolen(url, 3 * 1024 * 1024, secUa)).buf, sharp, { logo: true });
                dbg(r.symbol, "SEC-Logo", url, res.png ? "OK" : res.reason);
                if (res.png) { treffer = { ...res, url, form: f.form, doc }; break; }
              } catch (e) { dbg(r.symbol, "SEC-Logo", url, "Fehler", e.message); }
            }
            if (treffer) break;
          }
          if (!treffer) { stat.ohneBild++; continue; }
          const path = "files/" + r.symbol + ".png";
          for (const f of readdirSync(FILES)) if (f.startsWith(r.symbol + ".") && f !== r.symbol + ".png") rmSync(join(FILES, f));
          writeFileSync(join(OUT, path), treffer.png);
          files[r.symbol] = path;
          credits[r.symbol] = { source: "SEC_FILING", path, page: treffer.doc, iconUrl: treffer.url, form: treffer.form,
                                sha1: createHash("sha1").update(treffer.png).digest("hex"), via: "SEC_CIK",
                                licenseName: "Marke des Inhabers", fmt: FORMAT, ratio: Math.round(treffer.ratio * 100) / 100 };
          reasons.delete(r.symbol);
          stat.ok++;
        } catch (e) { stat.fehler++; dbg(r.symbol, "SEC-Logo Fehler", e.message); }
        if (++i % 250 === 0) console.log(`     … ${i} (${JSON.stringify(stat)})`);
      }
      console.log(`     SEC-Logos: ${JSON.stringify(stat)}`);
    }
  }
}

if (DRY) {
  console.log(`Probelauf: ${frei} von ${kandidaten.length} zugeordneten Titeln haben eine freie Lizenz.`);
  process.exit(0);
}

/* Dateien, die zu keinem Titel mehr gehoeren, verschwinden - aber nur nach
   einem vollstaendigen Lauf, nie nach einem begrenzten. */
if (ONLY) {
  for (const sym of ONLY) console.log(`  [diag] ${sym}: ${files[sym] ? "LOGO " + (credits[sym] && credits[sym].source) + " " + ((credits[sym] && (credits[sym].iconUrl || credits[sym].title)) || "") : "OHNE LOGO - " + (reasons.get(sym) || "?")}`);
  console.log("Diagnose (--only): nichts geschrieben."); process.exit(0);
}
if (Number.isFinite(LIMIT)) { console.log("Begrenzter Lauf (--limit): nichts geschrieben."); process.exit(0); }
const behaltenePfade = new Set(Object.values(files).map((p) => p.slice("files/".length)));
for (const f of readdirSync(FILES)) if (!f.startsWith(".") && !behaltenePfade.has(f)) rmSync(join(FILES, f));

/* Helle Logos auf transparentem Grund bekommen in der Oberflaeche eine dunkle Flaeche. */
const dunkel = [];
try {
  const sharpLib = (await import("sharp")).default;
  for (const [sym, path] of Object.entries(files)) {
    try { if (await isLightOnTransparent(readFileSync(join(OUT, path)), sharpLib)) dunkel.push(sym); } catch (e) { /* weiter */ }
  }
} catch (e) { console.log("     sharp fehlt - keine Pruefung auf helle Logos."); }

/* Abdeckung der wichtigen Indizes: S&P 500, NASDAQ-100, Dow Jones aus den
   Discover-Daten (Fondsbestaende), MSCI World aus dem Bestand des iShares-
   Fonds URTH (nur US-Notierungen - nur die stehen im Universum). */
const indexAbdeckung = {};
{
  const mitglieder = { SP500: new Set(), NDX: new Set(), DJIA: new Set(), MSCI_WORLD: new Set() };
  const stocksDir = join(root, "discover", "data", "stocks", "US_REAL");
  const imUniversum = new Set(universe.map((r) => r.symbol));
  if (existsSync(stocksDir)) {
    for (const f of readdirSync(stocksDir)) {
      try {
        const d = JSON.parse(readFileSync(join(stocksDir, f), "utf8"));
        for (const ix of d.indexMemberships || []) if (mitglieder[ix.indexId]) mitglieder[ix.indexId].add(d.symbol);
      } catch (e) { /* weiter */ }
    }
  }
  try {
    const csv = (await holen("https://www.ishares.com/us/products/239696/ishares-msci-world-etf/1467271812596.ajax?fileType=csv&fileName=URTH_holdings&dataType=fund", 8 * 1024 * 1024, { truncate: true })).buf.toString("utf8");
    const norm = (t) => String(t).toUpperCase().replace(/[.\-/ ]/g, "");
    const nachNorm = new Map(universe.map((r) => [norm(r.symbol), r.symbol]));
    for (const t of parseIsharesUsTickers(csv)) { const s = nachNorm.get(norm(t)); if (s) mitglieder.MSCI_WORLD.add(s); }
    console.log(`     MSCI World (URTH): ${mitglieder.MSCI_WORLD.size} US-Titel im Universum`);
  } catch (e) { console.log("     MSCI-World-Bestand nicht erreichbar:", e.message); }
  for (const [id, set] of Object.entries(mitglieder)) {
    const liste = [...set].filter((s) => imUniversum.has(s) || exclusions[s]).sort();
    const ohneLogo = liste.filter((s) => !files[s]);
    indexAbdeckung[id] = { members: liste.length, withLogo: liste.length - ohneLogo.length,
                           missing: ohneLogo.map((s) => s + ":" + (exclusions[s] ? "AUSGESCHLOSSEN" : (reasons.get(s) || "?"))) };
    console.log(`     ${id}: ${liste.length - ohneLogo.length}/${liste.length} mit Logo`);
  }
}

const sortiert = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const generatedAt = new Date().toISOString();
const grundZaehler = {};
for (const r of reasons.values()) { const k = r.split(":")[0]; grundZaehler[k] = (grundZaehler[k] || 0) + 1; }

writeFileSync(join(OUT, "index.json"), JSON.stringify({
  version: "company-logos-1.0.0",
  generatedAt,
  sources: ["WIKIMEDIA_COMMONS", "WEBSITE", "SEC_FILING"],
  boundary: "Logos dienen allein der Identifizierung des Unternehmens neben seinen eigenen Kursdaten. Zuerst Wikimedia Commons (nur freie Lizenz: gemeinfrei, CC0, CC BY, CC BY-SA, Apache 2.0, MIT), sonst das Icon der offiziellen Website des Unternehmens, sonst das Logo aus seinen SEC-Einreichungen (Marke des Inhabers, keine Lizenz). Unveraendert, nur verkleinert und einheitlich in ein Quadrat eingepasst. Nicht fuer Werbung, Social-Media-Beitraege oder eigene Grafiken. Quelle je Logo: credits.json.",
  count: Object.keys(files).length,
  files: sortiert(files),
  dark: dunkel.sort()
}) + "\n");
writeFileSync(join(OUT, "credits.json"), JSON.stringify({
  version: "company-logos-1.0.0", generatedAt, credits: sortiert(credits)
}, null, 1) + "\n");
if (webSites) writeFileSync(join(OUT, "sites.json"), JSON.stringify({
  generatedAt, note: "Offizielle Websites (Wikidata P856 oder SEC: Stammdaten bzw. 'our website' im juengsten Bericht). Zwischenspeicher fuer die Website-Icons.",
  sites: sortiert(webSites)
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
  indexCoverage: indexAbdeckung,
  byLicense: Object.values(credits).filter((c) => c.license).reduce((a, c) => ((a[c.license] = (a[c.license] || 0) + 1), a), {}),
  excluded: grundZaehler
}, null, 1) + "\n");

console.log(`Fertig: ${Object.keys(files).length}/${universe.length} Titel mit Logo (Commons ${geladen} neu/${behalten} unveraendert, Website ${webNeu} neu/${webBehalten} unveraendert).`);
console.log("Ausgeschlossen:", JSON.stringify(grundZaehler));
