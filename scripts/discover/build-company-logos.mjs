#!/usr/bin/env node
/**
 * Firmenlogos fuer Discover - zwei Quellen in fester Reihenfolge.
 *
 *   node scripts/discover/build-company-logos.mjs [--limit=N] [--dry-run]
 *        [--no-name-search] [--no-web] [--refresh-web] [--refresh-sites]
 *        [--only=NVDA,PYPL --debug]   Diagnose einzelner Titel, schreibt nichts
 *        [--input=/private/companies.json --out=/private/logos
 *         --reviewed=/private/reviewed.json --inherit-existing
 *         --cache-from=/private/previous-logos --cache-only]
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
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { assertPrivateOutput, rejectSymlinkAncestors } from "../marketstack/private-output.mjs";
const Identity = createRequire(import.meta.url)("../../core/identity.js");
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  normalizeSite, parseIconLinks, parseManifest, orderCandidates, toPng, genericIcons,
  WEB_USER_AGENT, sniff, websiteFromFiling, filingText, latestReport, rootDomain, isLightOnTransparent,
  normalizeLogo, logoFilings, secLogoImages, parseIsharesUsTickers, WIDE_RATIO
} from "./company-logos-web.mjs";
import {
  USER_AGENT, THUMB_WIDTH, SPARQL_BY_CIK, SPARQL_BY_TICKER, SPARQL_SITE_BY_CIK, SPARQL_SITE_BY_TICKER, MIME_EXT,
  collectItems, matchUniverse, checkLicense, safeSymbol, entityToItem, matchByName, searchName, namesAgree
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
const PRIVATE = Boolean(args.input);
if (args.out && !PRIVATE) throw new Error("PRIVATE_LOGO_INPUT_REQUIRED");
if (PRIVATE && (!args.out || ONLY || Number.isFinite(LIMIT))) throw new Error("PRIVATE_LOGO_INPUT_AND_OUT_REQUIRED_NO_ONLY_OR_LIMIT");
const OUT = PRIVATE ? assertPrivateOutput(args.out) : ONLY ? mkdtempSync(join(tmpdir(), "logos-diag-")) : REAL_OUT;
if (PRIVATE) {
  rejectSymlinkAncestors(resolve(args.input));
  for (const child of ["files", "files/wide", "index.json", "credits.json", "logo_status.json", "summary.json", "missing.json"]) rejectSymlinkAncestors(join(OUT, child));
}
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
async function webIcon(site, sharp, sym, companyName, iconOpts = {}) {
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
    if ((iconOpts.rejected ? Boolean(iconOpts.rejected[c.href]) : gesperrt(c.href))) { dbg(sym, c.kind, c.href, "gesperrt"); continue; }
    try {
      const { buf } = await holen(c.href, 3 * 1024 * 1024);
      const res = await toPng(buf, sharp, { logo: c.kind === "logo", minIcon: iconOpts.minIcon });
      dbg(sym, c.kind, c.href, res.png ? "OK" : res.reason);
      if (res.png) return { png: res.png, wide: res.wide, iconUrl: c.href, ratio: res.ratio, kind: c.kind };
      grund = res.reason;
    } catch (e) { dbg(sym, c.kind, c.href, "Fehler", e.message); }
  }
  if (inlineSvg && !(iconOpts.rejected ? Boolean(iconOpts.rejected[base + "#inline-svg-logo"]) : gesperrt(base + "#inline-svg-logo"))) {
    try {
      const res = await toPng(Buffer.from(inlineSvg), sharp, { logo: true });
      dbg(sym, "inline-svg", res.png ? "OK" : res.reason);
      if (res.png) return { png: res.png, wide: res.wide, iconUrl: base + "#inline-svg-logo", ratio: res.ratio, kind: "logo" };
    } catch (e) { dbg(sym, "inline-svg", "Fehler", e.message); }
  }
  return { reason: grund };
}

/* Wikidata bricht lange Abfragen bei Zeitueberschreitung mitten im Strom ab
   und haengt die Fehlermeldung an (02.10.2026: "Bad control character in
   string literal") - dann noch einmal, mit Pause. */
async function sparql(query, versuche = 4) {
  for (let v = 1; ; v++) {
    try {
      const res = await http("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
        body: "query=" + encodeURIComponent(query)
      });
      return JSON.parse(await res.text()).results.bindings;
    } catch (e) {
      if (v >= versuche) throw e;
      console.log(`     Wikidata-Abfrage fehlgeschlagen (${String(e.message).slice(0, 80)}), Versuch ${v + 1} von ${versuche} …`);
      await sleep(30000 * v);
    }
  }
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

/* Approved Commons cache reuse is an explicit source path, never a ticker identity
   shortcut. Read only the approved central namespace at the supplied protected main
   commit; the exact Wikidata ISIN/LEI/site graph and private image review remain required. */
function cachedCommons(r, site, graphBytes) {
  const c=r.cachedCentralLogo;
  if (!c || !/^[a-f0-9]{40}$/.test(c.sourceMainSHA || "") || !/^[a-f0-9]{40}$/.test(c.sourceBlobSHA || "") || !safeSymbol(c.sourceSymbol)) throw new Error("APPROVED_CENTRAL_COMMONS_SOURCE_REQUIRED");
  const git=(...args)=>execFileSync("git",args,{cwd:root,maxBuffer:4*1024*1024});
  const index=JSON.parse(git("show",c.sourceMainSHA+":discover/logos/index.json"));
  const credit=JSON.parse(git("show",c.sourceMainSHA+":discover/logos/credits.json")).credits?.[c.sourceSymbol];
  const path=index.files?.[c.sourceSymbol];
  const reviewed=JSON.parse(git("show",c.sourceMainSHA+":discover/config/logo-reviewed.json")).symbols?.[c.sourceSymbol];
  if (!credit || credit.source!=="WIKIMEDIA_COMMONS" || credit.pending || !path || path!==credit.path || path!=="files/"+c.sourceSymbol+".png" || reviewed!==credit.sha1 || !/^Q[0-9]+$/.test(credit.wikidata || "")) throw new Error("CENTRAL_COMMONS_NOT_APPROVED");
  const exclusions=JSON.parse(git("show",c.sourceMainSHA+":discover/config/logo-exclusions.json")).symbols || {};
  const rejects=JSON.parse(git("show",c.sourceMainSHA+":discover/config/logo-rejects.json"));
  if(exclusions[c.sourceSymbol] || rejects.titles?.[credit.title] || rejects.urls?.[credit.page]) throw new Error("CENTRAL_COMMONS_SOURCE_EXCLUDED");
  const currentExclusions=readJson(join(root,"discover/config/logo-exclusions.json"),{symbols:{}}).symbols || {};
  const currentRejects=readJson(join(root,"discover/config/logo-rejects.json"),{urls:{},titles:{}});
  if(currentExclusions[c.sourceSymbol] || currentRejects.titles?.[credit.title] || currentRejects.urls?.[credit.page]) throw new Error("CURRENT_CENTRAL_COMMONS_SOURCE_EXCLUDED");
  const license=checkLicense({extmetadata:{License:{value:credit.license},LicenseShortName:{value:credit.licenseName},Artist:{value:credit.author}}});
  if(!license.ok) throw new Error("CENTRAL_COMMONS_LICENSE_NOT_ALLOWED");
  const graph=JSON.parse(graphBytes.toString("utf8")).results?.bindings;
  if(!Array.isArray(graph) || !r.securities.every(s=>graph.some(g=>g.item?.value==="http://www.wikidata.org/entity/"+credit.wikidata && g.isin?.value===s.isin && g.lei?.value===r.lei && g.site?.value===site.url))) throw new Error("EXACT_COMMONS_ISIN_LEI_SITE_GRAPH_REQUIRED");
  const asset=join(REAL_OUT,path);rejectSymlinkAncestors(asset);
  const png=readFileSync(asset), expected=git("show",c.sourceMainSHA+":discover/logos/"+path);
  const blob=git("rev-parse",c.sourceMainSHA+":discover/logos/"+path).toString().trim();
  if(blob!==c.sourceBlobSHA || !png.equals(expected) || sniff(png)!=="png" || png.length<24 || png.readUInt32BE(16)!==128 || png.readUInt32BE(20)!==128) throw new Error("CENTRAL_COMMONS_PNG_BLOB_OR_FORMAT_MISMATCH");
  return {png,credit,dark:(index.dark || []).includes(c.sourceSymbol),sourceBlobSHA:blob,sourceMainSHA:c.sourceMainSHA,sourceSymbol:c.sourceSymbol};
}

/* ------------------------------------------------------------ Universum */
/* Explicit private company input keeps local listings out of the US ticker namespace.
   The website extractor and image normalization below are the same central pipeline.
   Exact official-domain documents and canonical issuer IDs are mandatory; names alone
   never authorize an asset. Newly found images retain the existing exact-hash review gate. */
if (PRIVATE) {
  const input = JSON.parse(readFileSync(resolve(args.input), "utf8"));
  if (input.schemaVersion !== "vu-private-company-logos-1" || !Array.isArray(input.companies)) throw new Error("INVALID_PRIVATE_LOGO_INPUT");
  const seen = new Set();
  const companies = input.companies.map((r) => {
    const issuerId = r.companyId || r.referencedIssuerId;
    if (!r.lei || Identity.companyIdForLEI(r.lei) !== issuerId || seen.has(issuerId)) throw new Error("INVALID_OR_DUPLICATE_COMPANY_ID");
    seen.add(issuerId);
    r = {...r, canonicalCompanyId:r.companyId || null, referencedIssuerId:r.referencedIssuerId || issuerId, companyId:issuerId};
    for (const path of ["files/LEI-"+r.lei+".png","files/wide/LEI-"+r.lei+".png"]) rejectSymlinkAncestors(join(OUT,path));
    const site = normalizeSite(r.officialWebsite);
    if (!Array.isArray(r.securities) || !r.securities.length) throw new Error("OFFICIAL_DOMAIN_AND_SECURITIES_REQUIRED");
    for (const security of r.securities) if (Identity.securityIdForISIN(security.isin) !== security.securityId || Identity.listingIdFor({isin:security.isin,mic:security.mic}) !== security.listingId) throw new Error("EXACT_LOCAL_SECURITY_DOMAIN_EVIDENCE_REQUIRED");
    if (!site && !r.officialWebsite && r.domainStatus === "UNVERIFIED") {
      const ref=r.issuerReference;
      if (!ref || ref.lei!==r.lei || ref.legalName!==r.legalName || !["EXACT_GLEIF_ISIN_LEI_REFERENCE","EXACT_ESMA_ISIN_LEI_REFERENCE"].includes(ref.basis) || !/^[a-f0-9]{64}$/.test((ref.basis==="EXACT_ESMA_ISIN_LEI_REFERENCE" ? ref.evidence?.regulatoryResponseSHA256 : ref.evidence?.mappingZipSHA256) || "") || !/^[a-f0-9]{64}$/.test(ref.evidence?.leiBatchResponseSHA256 || "")) throw new Error("EXACT_ISSUER_REFERENCE_REQUIRED");
      return {...r,site:null};
    }
    if (!site) throw new Error("OFFICIAL_DOMAIN_AND_SECURITIES_REQUIRED");
    const e = r.domainEvidence;
    if (!e || !["OFFICIAL_ISSUER_SHARE_CLASS_IDENTIFIER_PAGE","EXACT_WIKIDATA_ISIN_LEI_OFFICIAL_SITE_GRAPH"].includes(e.type) || !e.path || !e.sha256 || !Number.isFinite(Date.parse(e.retrievedAt))) throw new Error("OFFICIAL_DOMAIN_EVIDENCE_REQUIRED");
    rejectSymlinkAncestors(e.path);
    const bytes = readFileSync(e.path), text = bytes.toString("utf8").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    const graphSource=e.type==="EXACT_WIKIDATA_ISIN_LEI_OFFICIAL_SITE_GRAPH";
    if (createHash("sha256").update(bytes).digest("hex") !== e.sha256 || !/^https:/.test(e.url) || (graphSource ? new URL(e.url).hostname!=="query.wikidata.org" || new URL(e.url).pathname!=="/sparql" : rootDomain(new URL(e.url).hostname)!==rootDomain(site.host))) throw new Error("OFFICIAL_DOMAIN_EVIDENCE_MISMATCH");
    const g = r.issuerEvidence;
    if (!g || g.url !== "https://api.gleif.org/api/v1/lei-records/" + r.lei || !g.path || !g.sha256) throw new Error("EXACT_ISSUER_EVIDENCE_REQUIRED");
    rejectSymlinkAncestors(g.path);
    const gb = readFileSync(g.path), gd = JSON.parse(gb.toString("utf8"));
    const entity = gd.data && gd.data.attributes && gd.data.attributes.entity;
    if (createHash("sha256").update(gb).digest("hex") !== g.sha256 || gd.data?.id !== r.lei || entity?.legalName?.name !== r.legalName || !namesAgree(r.legalName, r.name)) throw new Error("EXACT_ISSUER_EVIDENCE_MISMATCH");
    for (const security of r.securities) {
      if (Identity.securityIdForISIN(security.isin) !== security.securityId || Identity.listingIdFor({isin:security.isin,mic:security.mic}) !== security.listingId || !text.includes(security.isin)) throw new Error("EXACT_LOCAL_SECURITY_DOMAIN_EVIDENCE_REQUIRED");
    }
    return {...r, site, approvedCommons:graphSource ? cachedCommons(r,site,bytes) : null};
  });
  if (DRY) { console.log(JSON.stringify({privateInput:true,validatedCompanies:companies.length,providerRequests:0,writes:0})); process.exit(0); }
  mkdirSync(join(FILES, "wide"), {recursive:true, mode:0o700});
  const sharp = companies.some(r=>r.site && !r.approvedCommons) ? (await import("sharp")).default : null;
  const rejected = readJson(join(root,"discover/config/logo-rejects.json"),{urls:{}}).urls || {};
  const excluded = readJson(join(root,"discover/config/logo-exclusions.json"),{symbols:{}}).symbols || {};
  const review = args.reviewed ? readJson(assertPrivateOutput(args.reviewed), {companies:{}}).companies || {} : {};
  const CACHE = args["cache-from"] ? assertPrivateOutput(args["cache-from"]) : OUT;
  rejectSymlinkAncestors(join(CACHE,"credits.json"));rejectSymlinkAncestors(join(CACHE,"missing.json"));
  const old = readJson(join(CACHE,"credits.json"),{credits:{}}).credits || {};
  const previousMissing=readJson(join(CACHE,"missing.json"),{reasons:{}}).reasons || {};
  const icons = new Map(), failures = new Map();
  for (const r of companies) {
    if (!r.site) { failures.set(r.companyId,r.domainResolutionCause || "MISSING_VERIFIED_OFFICIAL_DOMAIN"); continue; }
    for(const path of ["files/LEI-"+r.lei+".png","files/wide/LEI-"+r.lei+".png"]) rejectSymlinkAncestors(join(CACHE,path));
    if (excluded[r.companyId] || r.securities.some(s => excluded[s.securityId] || excluded[s.listingId])) { failures.set(r.companyId,"AUSGESCHLOSSEN"); continue; }
    if(r.approvedCommons) {
      const meta=sharp ? await sharp(r.approvedCommons.png).metadata() : {format:"png",width:r.approvedCommons.png.readUInt32BE(16),height:r.approvedCommons.png.readUInt32BE(20)};
      if(meta.format!=="png" || meta.width!==128 || meta.height!==128) throw new Error("CENTRAL_COMMONS_PNG_DECODE_MISMATCH");
      icons.set(r.companyId,{png:r.approvedCommons.png,hash:createHash("sha1").update(r.approvedCommons.png).digest("hex"),host:r.site.host,site:r.site,ratio:r.approvedCommons.credit.ratio || 1,commons:r.approvedCommons});continue;
    }
    const prior = old["LEI-" + r.lei];
    if (!args["refresh-web"] && prior && prior.companyId === r.companyId && prior.host === r.site.host && prior.path === "files/LEI-"+r.lei+".png" && existsSync(join(CACHE,prior.path))) {
      const png = readFileSync(join(CACHE,prior.path));
      if (createHash("sha1").update(png).digest("hex") === prior.sha1 && !rejected[prior.iconUrl]) { icons.set(r.companyId,{png,hash:prior.sha1,host:prior.host,site:r.site,ratio:prior.ratio,iconUrl:prior.iconUrl,wide:prior.wide === "files/wide/LEI-"+r.lei+".png" && existsSync(join(CACHE,prior.wide)) && createHash("sha1").update(readFileSync(join(CACHE,prior.wide))).digest("hex") === prior.wideSha1 ? readFileSync(join(CACHE,prior.wide)) : null}); continue; }
    }
    if(args["cache-only"]) { failures.set(r.companyId,previousMissing[r.companyId] || "MISSING_VERIFIED_CACHED_LOGO"); continue; }
    const icon = await webIcon(r.site,sharp,r.companyId,r.name,{rejected});
    if (icon.png && !rejected[icon.iconUrl]) icons.set(r.companyId,{...icon,hash:createHash("sha1").update(icon.png).digest("hex"),host:r.site.host,site:r.site});
    else failures.set(r.companyId,icon.reason || "WEB_ICON_REJECTED");
  }
  const generic = genericIcons(icons), files = {}, credits = {}, dark = [], rows = [];
  for (const r of companies) {
    const icon = icons.get(r.companyId), valid = icon && !generic.has(r.companyId);
    let state="LOGO_FALLBACK", reason=failures.get(r.companyId)||"WEB_ICON_GENERISCH";
    if (valid) {
      const symbol="LEI-"+r.lei,path="files/"+symbol+".png";
      writeFileSync(join(OUT,path),icon.png,{mode:0o600});
      const wide=icon.wide ? "files/wide/"+symbol+".png" : null;
      if(wide) writeFileSync(join(OUT,wide),icon.wide,{mode:0o600});
      credits[symbol]={source:"WEBSITE",companyId:r.companyId,path,wide,wideSha1:icon.wide?createHash("sha1").update(icon.wide).digest("hex"):null,sha1:icon.hash,iconUrl:icon.iconUrl,host:r.site.host,page:r.site.url,via:"EXACT_LEI_AND_OFFICIAL_ISIN_DOMAIN",licenseName:"Marke des Inhabers",ratio:icon.ratio,fmt:3,pending:review[r.companyId]!==icon.hash,domainEvidence:r.domainEvidence,issuerEvidence:r.issuerEvidence};
      if(icon.commons) {
        const original=icon.commons.credit;
        Object.assign(credits[symbol],{source:"WIKIMEDIA_COMMONS",via:"VERIFIED_EXISTING_APPROVED_ASSET_WITH_EXACT_REFERENCE_GRAPH",page:original.page,title:original.title,wikidata:original.wikidata,license:original.license,licenseName:original.licenseName,licenseUrl:original.licenseUrl,author:original.author,attributionRequired:original.attributionRequired,sourceSHA1:original.sha1,sourceMainSHA:icon.commons.sourceMainSHA,sourceBlobSHA:icon.commons.sourceBlobSHA,sourceSymbol:icon.commons.sourceSymbol,mime:"image/png",width:128,height:128});
        delete credits[symbol].iconUrl;
      }
      if(!credits[symbol].pending) { state="LOGO_VALID";reason=null;files[symbol]=path;if(icon.commons ? icon.commons.dark : await isLightOnTransparent(icon.png,sharp))dark.push(symbol); }
      else {state="LOGO_SUSPECT";reason="WARTET_AUF_SICHTPRUEFUNG";}
    }
    rows.push({companyId:r.canonicalCompanyId,referencedIssuerId:r.referencedIssuerId,name:r.name,legalName:r.legalName,lei:r.lei,securities:r.securities,status:state,canonicalStatus:state==="LOGO_VALID"?"VERIFIED_LOGO":state==="LOGO_SUSPECT"?"SUSPECT_QUARANTINED":"EXISTING_FALLBACK",symbol:files["LEI-"+r.lei]?"LEI-"+r.lei:null,asset:files["LEI-"+r.lei]||null,logo:{status:state==="LOGO_VALID"?"VERIFIED_LOGO":state==="LOGO_SUSPECT"?"SUSPECT_QUARANTINED":"EXISTING_FALLBACK",symbol:files["LEI-"+r.lei]?"LEI-"+r.lei:null,companyId:r.companyId},reason});
  }
  const generatedAt=new Date(Math.max(0,...companies.map(r=>Date.parse(r.domainEvidence?.retrievedAt || input.asOf || "1970-01-01T00:00:00Z")))).toISOString();
  const save=(name,value)=>writeFileSync(join(OUT,name),JSON.stringify(value,null,2)+"\n",{mode:0o600});
  const baseIndex=args["inherit-existing"] ? readJson(join(REAL_OUT,"index.json"),{files:{},dark:[],wide:{}}) : {files:{},dark:[],wide:{}};
  const baseCredits=args["inherit-existing"] ? readJson(join(REAL_OUT,"credits.json"),{credits:{}}).credits || {} : {};
  for(const symbol of Object.keys(credits)) if(baseIndex.files[symbol] || baseCredits[symbol]) throw new Error("LOGO_ASSET_NAMESPACE_COLLISION");
  const renderedFiles={...baseIndex.files,...files};
  save("index.json",{version:"company-logos-1.0.0",generatedAt,private:true,count:Object.keys(renderedFiles).length,localCount:Object.keys(files).length,files:renderedFiles,dark:[...new Set([...(baseIndex.dark||[]),...dark])].sort(),wide:baseIndex.wide||{}});
  save("credits.json",{version:"company-logos-1.0.0",generatedAt,credits:{...baseCredits,...credits}});
  save("logo_status.json",{schemaVersion:"vu-private-company-logos-1",generatedAt,rows});
  save("summary.json",{generatedAt,private:true,companies:companies.length,verified:Object.keys(files).length,pending:rows.filter(r=>r.status==="LOGO_SUSPECT").length,fallback:rows.filter(r=>r.status==="LOGO_FALLBACK").length,missingVerifiedDomain:companies.filter(r=>!r.site).length,cacheOnly:Boolean(args["cache-only"]),providerRequests:0});
  save("missing.json",{generatedAt,reasons:Object.fromEntries(rows.filter(r=>r.status!=="LOGO_VALID").map(r=>[r.companyId || r.referencedIssuerId,r.reason]))});
  console.log(JSON.stringify({private:true,companies:companies.length,verified:Object.keys(files).length,providerRequests:0}));process.exit(0);
}
const search = readJson(join(root, "discover", "data", "search", "US_REAL.json"));
const names = readJson(join(root, "quant", "data", "market", "security-master", "company-names.json"), { rows: [] });
const exclusions = readJson(join(root, "discover", "config", "logo-exclusions.json"), { symbols: {} }).symbols || {};
/* Gesperrte BILDER (Unterschriften, Dokumentseiten, Fotos): die Firma
   bleibt im Spiel, nur dieses Bild nicht (discover/config/logo-rejects.json). */
const REJECTS = readJson(join(root, "discover", "config", "logo-rejects.json"), { urls: {}, titles: {} });
const gesperrt = (url) => Boolean(url && (REJECTS.urls || {})[url]);
const gesperrtTitel = (t) => Boolean(t && (REJECTS.titles || {})[t]);
/* Firmen mit einem gesperrten SEC-Bild: dort liefert die SEC-Quelle
   erfahrungsgemaess weitere Fehlgriffe (Unterschriften, Stimmzettel). */
const SEC_GESPERRT = new Set(Object.entries(REJECTS.urls || {})
  .filter(([url]) => /^https:\/\/www\.sec\.gov\//.test(url)).map(([, why]) => String(why).split(":")[0].trim()));
/* Firmen, deren Website schon zweimal ein falsches Bild lieferte (fremde
   Logos, Produktmarken, Baukasten-Icons): die Website ist dafuer keine
   Quelle mehr - sonst kaeme nach jeder Sperre das naechste falsche Bild. */
const WEB_GESPERRT = new Set(Object.entries(Object.entries(REJECTS.urls || {})
  .filter(([url]) => !/^https:\/\/www\.sec\.gov\//.test(url))
  .reduce((a, [, why]) => { const s = String(why).split(":")[0].trim(); a[s] = (a[s] || 0) + 1; return a; }, {}))
  .filter(([, n]) => n >= 2).map(([s]) => s));
const cikOf = new Map(names.rows.filter((r) => r.ticker).map((r) => [r.ticker, r.cik || null]));
const universe = search.entries
  .filter((e) => safeSymbol(e.s) && !exclusions[e.s] && (!ONLY || ONLY.has(e.s)))
  .map((e) => ({ symbol: e.s, name: e.n || e.s, cik: cikOf.get(e.s) || null }));
console.log(`Discover-Universum: ${universe.length} Titel (${Object.keys(exclusions).length} ausgeschlossen)`);

/* ------------------------------------------------ Wichtige Indizes */
/* S&P 500, NASDAQ-100, Dow Jones aus den Discover-Daten (Fondsbestaende),
   MSCI World aus dem Bestand des iShares-Fonds URTH (nur US-Notierungen -
   nur die stehen im Universum). Fuer diese Titel gelten die letzten
   Rettungsstufen (erstes Bild im Proxy Statement, Favicon ab 32 px). */
const INDEX_MITGLIEDER = { SP500: new Set(), NDX: new Set(), DJIA: new Set(), MSCI_WORLD: new Set() };
{
  const stocksDir = join(root, "discover", "data", "stocks", "US_REAL");
  const imUniversum = new Set(universe.map((r) => r.symbol));
  if (existsSync(stocksDir)) {
    for (const f of readdirSync(stocksDir)) {
      try {
        const d = JSON.parse(readFileSync(join(stocksDir, f), "utf8"));
        if (!imUniversum.has(d.symbol)) continue;
        for (const ix of d.indexMemberships || []) if (INDEX_MITGLIEDER[ix.indexId]) INDEX_MITGLIEDER[ix.indexId].add(d.symbol);
      } catch (e) { /* weiter */ }
    }
  }
  try {
    /* Wie scripts/market/build-index-membership.mjs: iShares liefert die
       Bestandsdatei nur mit Browser-Kennung, teils als UTF-16. */
    const { buf: roh } = await holen("https://www.ishares.com/us/products/239696/ishares-msci-world-etf/1467271812596.ajax?fileType=csv&fileName=URTH_holdings&dataType=fund",
      8 * 1024 * 1024, { truncate: true, accept: "text/csv, text/plain, application/octet-stream, */*",
                         ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
    const csv = roh[0] === 0xff && roh[1] === 0xfe ? roh.slice(2).toString("utf16le") : roh.toString("utf8").replace(/^\uFEFF/, "");
    const norm = (t) => String(t).toUpperCase().replace(/[.\-/ ]/g, "");
    const nachNorm = new Map(universe.map((r) => [norm(r.symbol), r.symbol]));
    const ticker = parseIsharesUsTickers(csv);
    if (!ticker.length) console.log("     MSCI-World-Bestand ohne US-Titel - Dateikopf:", csv.slice(0, 200).replace(/\s+/g, " "));
    for (const t of ticker) { const s = nachNorm.get(norm(t)); if (s) INDEX_MITGLIEDER.MSCI_WORLD.add(s); }
  } catch (e) { console.log("     MSCI-World-Bestand nicht erreichbar:", e.message); }
  console.log("     Index-Titel im Universum:", Object.entries(INDEX_MITGLIEDER).map(([k, v]) => k + " " + v.size).join(", "));
}
const PRIORITAET = new Set(Object.values(INDEX_MITGLIEDER).flatMap((v) => [...v]));

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
  /* Suchergebnisse bleiben im Zwischenspeicher (name-search.json): Wikidata
     bremst bei Tausenden Suchen hintereinander (429), und ein gebremster Lauf
     verlor sonst alle Namens-Treffer. Gesucht wird nur, was noch fehlt oder
     aelter als 30 Tage ist; ein Fehler ueberschreibt nie ein gutes Ergebnis. */
  const cachePfad = join(REAL_OUT, "name-search.json");
  const nameCache = args["refresh-sites"] ? {} : (readJson(cachePfad, { results: {} }).results || {});
  const treffer = new Map();
  let gesucht = 0, gebremst = 0;
  for (const [i, r] of offen.entries()) {
    const q = searchName(r.name), alt = nameCache[r.symbol];
    if (alt && alt.q === q && Date.now() - Date.parse(alt.at || 0) < 30 * 864e5) { treffer.set(r.symbol, alt.ids); continue; }
    const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&search=" + encodeURIComponent(q);
    try {
      const ids = ((await (await http(url)).json()).search || []).map((x) => x.id);
      treffer.set(r.symbol, ids);
      nameCache[r.symbol] = { q, ids, at: new Date().toISOString() };
      gesucht++;
    } catch (e) { gebremst++; treffer.set(r.symbol, alt ? alt.ids : []); }
    if (i % 500 === 499) console.log(`     … ${i + 1}`);
    await sleep(250);
  }
  console.log(`     Namenssuche: ${gesucht} neu gesucht, ${offen.length - gesucht - gebremst} aus dem Zwischenspeicher, ${gebremst} gebremst`);
  if (!ONLY && !Number.isFinite(LIMIT)) writeFileSync(cachePfad, JSON.stringify({ note: "Zwischenspeicher der Wikidata-Namenssuche (Symbol -> Suchbegriff, Item-IDs, Datum).", results: nameCache }) + "\n");
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
const FORMAT = 3;
/* Format 2 kannte die breite Fassung noch nicht: nur breite Logos werden
   deshalb neu geholt, quadratische bleiben. */
const aktuell = (alt) => alt && alt.path && existsSync(join(OUT, alt.path)) &&
  (alt.fmt === FORMAT ? (!alt.wide || existsSync(join(OUT, alt.wide))) : alt.fmt === 2 && !(alt.ratio >= WIDE_RATIO));
/* Klappt das Neuladen nicht, bleibt das bisherige quadratische Logo
   (Format 2) - ohne breite Fassung, aber ohne Luecke. */
const ersatz = (alt) => alt && alt.fmt === 2 && alt.path && existsSync(join(OUT, alt.path)) && !gesperrt(alt.iconUrl) && !gesperrtTitel(alt.title);
/* Breite Fassung (NVIDIA, AMD) unter files/wide/ - nur fuer die Aktienseite. */
function breitSchreiben(sym, buf) {
  const p = join(FILES, "wide", sym + ".png");
  if (!buf) { if (existsSync(p)) rmSync(p); return null; }
  mkdirSync(join(FILES, "wide"), { recursive: true });
  writeFileSync(p, buf);
  return "files/wide/" + sym + ".png";
}
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
    if (gesperrtTitel(title)) { dbg(sym, "Commons", title, "gesperrt"); continue; }
    const i = infos.get(title), l = checkLicense(i);
    dbg(sym, "Commons", title, i ? JSON.stringify(Object.fromEntries(Object.entries(i.extmetadata || {}).map(([k, v]) => [k, String(v.value).slice(0, 80)]))) : "keine Dateiinfo", "->", l.ok ? "frei" : l.reason);
    if (l.ok) { m = { ...m0, title }; info = i; lic = l; break; }
    if (lic.reason === "KEINE_DATEIINFO") lic = l;
  }
  if (!lic.ok) { reasons.set(sym, lic.reason); continue; }
  frei++;
  const alt = vorher[sym];
  if (alt && alt.sha1 === info.sha1 && aktuell(alt)) {
    files[sym] = alt.path; credits[sym] = { source: "WIKIMEDIA_COMMONS", ...alt, author: lic.author }; behalten++; continue;
  }
  if (DRY) continue;
  try {
    const res = await http(info.thumburl || info.url);
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = MIME_EXT[mime];
    if (!ext) { reasons.set(sym, "FORMAT:" + mime); continue; }
    let buf = Buffer.from(await res.arrayBuffer()), ratio = null, zielExt = ext, breit = null;
    if (buf.length > 1024 * 1024) { reasons.set(sym, "ZU_GROSS"); continue; }
    if (SHARP) { const n = await normalizeLogo(buf, SHARP); buf = n.png; breit = n.wide; ratio = Math.round(n.ratio * 100) / 100; zielExt = "png"; }
    const path = "files/" + sym + "." + zielExt;
    for (const f of readdirSync(FILES)) if (f.startsWith(sym + ".") && f !== sym + "." + zielExt) rmSync(join(FILES, f));
    writeFileSync(join(OUT, path), buf);
    files[sym] = path;
    credits[sym] = {
      source: "WIKIMEDIA_COMMONS", path, wide: breitSchreiben(sym, breit), title: m.title, page: info.descriptionurl, sha1: info.sha1, fmt: SHARP ? FORMAT : 1, ratio,
      license: lic.license, licenseName: lic.licenseName, licenseUrl: lic.licenseUrl,
      author: lic.author, attributionRequired: lic.attributionRequired,
      wikidata: m.item, via: m.via
    };
    geladen++;
    await sleep(150);
  } catch (e) {
    if (ersatz(alt) && alt.sha1 === info.sha1) { files[sym] = alt.path; credits[sym] = { source: "WIKIMEDIA_COMMONS", ...alt, author: lic.author }; behalten++; continue; }
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
    /* Von Hand gewaehlte Bildadressen (discover/config/logo-urls.json) fuer
       Titel, bei denen keine Quelle automatisch etwas findet - gewaehlt aus
       den Kandidaten (scripts/discover/logo-candidates.mjs). Sie gehen jeder
       anderen Quelle vor und durchlaufen die Freigabe wie alle anderen. */
    const gewaehlt = readJson(join(root, "discover", "config", "logo-urls.json"), { symbols: {} }).symbols || {};
    const imUniv = new Set(universe.map((r) => r.symbol));
    for (const [sym, url] of Object.entries(gewaehlt)) {
      if (!imUniv.has(sym) || gesperrt(url) || !/^https:\/\//.test(url)) continue;
      try {
        const host = new URL(url).hostname;
        const istSec = /(^|\.)sec\.gov$/.test(host);
        const { buf } = istSec ? await secHolen(url, 3 * 1024 * 1024, process.env.SEC_USER_AGENT || WEB_USER_AGENT) : await holen(url, 3 * 1024 * 1024);
        const res = await toPng(buf, sharp, { logo: true });
        if (!res.png) { dbg(sym, "gewaehlt", url, res.reason); continue; }
        const path = "files/" + sym + ".png";
        for (const f of readdirSync(FILES)) if (f.startsWith(sym + ".") && f !== sym + ".png") rmSync(join(FILES, f));
        writeFileSync(join(OUT, path), res.png);
        files[sym] = path;
        const basis = { path, wide: breitSchreiben(sym, res.wide), iconUrl: url, sha1: createHash("sha1").update(res.png).digest("hex"),
                        via: "KURATIERT", licenseName: "Marke des Inhabers", fmt: FORMAT, ratio: Math.round((res.ratio || 1) * 100) / 100 };
        credits[sym] = istSec ? { source: "SEC_FILING", page: url, form: "kuratiert", rule: "kuratiert", ...basis }
                              : { source: "WEBSITE", page: "https://" + host + "/", host: host.replace(/^www\./, ""), ...basis };
        reasons.delete(sym);
        dbg(sym, "gewaehlt", url, "OK");
      } catch (e) { dbg(sym, "gewaehlt", url, "Fehler", e.message); }
    }
    console.log("4/5  Website-Icons fuer Titel ohne Commons-Logo oder mit breitem Schriftzug …");
    /* Ein breiter Schriftzug (NVIDIA 5:1) wird im Quadrat winzig. Hat die
       Website ein quadratisches Symbol, geht das vor. */
    const breit = new Set(Object.entries(credits).filter(([, c]) => c.ratio && c.ratio > 2.2 && c.via !== "KURATIERT").map(([s]) => s));
    const ohne = universe.filter((r) => !files[r.symbol] || breit.has(r.symbol)).slice(0, LIMIT);
    console.log(`     ${ohne.filter((r) => !files[r.symbol]).length} ohne Logo, ${breit.size} mit breitem Schriftzug`);

    /* Website: Wikidata (CIK, Ticker, Name), sonst SEC-Stammdaten. */
    const siteItems = collectItems(await sparql(SPARQL_SITE_BY_CIK));
    collectItems(await sparql(SPARQL_SITE_BY_TICKER), siteItems);
    const siteMatches = matchUniverse(ohne, siteItems).matches;
    const siteOf = new Map();
    /* Von Hand gepflegte Adressen gehen vor (discover/config/logo-sites.json). */
    const kuratiert = readJson(join(root, "discover", "config", "logo-sites.json"), { symbols: {} }).symbols || {};
    for (const r of ohne) {
      const site = kuratiert[r.symbol] && normalizeSite(kuratiert[r.symbol]);
      if (site) siteOf.set(r.symbol, { ...site, via: "KURATIERT" });
    }
    for (const r of ohne) {
      if (siteOf.has(r.symbol)) continue;
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
    for (const sym of WEB_GESPERRT) if (siteOf.has(sym) && siteOf.get(sym).via !== "KURATIERT") siteOf.delete(sym);
    console.log(`     ${siteOf.size} von ${ohne.length} Titeln mit offizieller Website`);

    const icons = new Map();
    await pool(ohne.filter((r) => siteOf.has(r.symbol)), 8, async (r) => {
      const site = siteOf.get(r.symbol);
      const alt = vorher[r.symbol];
      if (!args["refresh-web"] && alt && alt.source === "WEBSITE" && aktuell(alt) && alt.host === site.host && !gesperrt(alt.iconUrl)) {
        icons.set(r.symbol, { hash: alt.sha1, host: site.host, alt });
        return;
      }
      const res = await webIcon(site, sharp, r.symbol, r.name);
      /* Ersetzt einen Commons-Schriftzug nur durch ein quadratisches Icon. */
      if (breit.has(r.symbol) && files[r.symbol] && !(res.png && res.kind !== "logo" && res.ratio <= 1.4)) return;
      if (res.png) icons.set(r.symbol, { hash: createHash("sha1").update(res.png).digest("hex"), host: site.host, png: res.png, wide: res.wide, iconUrl: res.iconUrl, site, ratio: res.ratio });
      else if (alt && alt.source === "WEBSITE" && alt.host === site.host && ersatz(alt)) icons.set(r.symbol, { hash: alt.sha1, host: site.host, alt });
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
      credits[sym] = { source: "WEBSITE", path, wide: breitSchreiben(sym, ic.wide), page: ic.site.url, host: ic.site.host, iconUrl: ic.iconUrl,
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
      /* Nur Titel ohne Logo. (Ein SEC-Bild als Ersatz fuer einen breiten
         Schriftzug brachte Deckblaetter und Fotos - verworfen.) */
      const rest = universe.filter((r) => r.cik && !files[r.symbol] && !SEC_GESPERRT.has(r.symbol)).slice(0, LIMIT);
      console.log(`5/5  Logo aus SEC-Einreichungen fuer ${rest.length} Titel …`);
      const stat = { ok: 0, ohneBild: 0, fehler: 0 };
      let i = 0;
      for (const r of rest) {
        const alt = vorher[r.symbol];
        /* Nur nach der strengen Regel gefundene SEC-Logos werden weiterverwendet (rule). */
        if (!args["refresh-web"] && alt && alt.source === "SEC_FILING" && alt.rule === "logo-hint" && aktuell(alt) && !gesperrt(alt.iconUrl)) {
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
              if (gesperrt(url)) { dbg(r.symbol, "SEC-Logo", url, "gesperrt"); continue; }
              try {
                const res = await toPng((await secHolen(url, 3 * 1024 * 1024, secUa)).buf, sharp, { logo: true });
                dbg(r.symbol, "SEC-Logo", url, res.png ? "OK" : res.reason);
                /* Hochformat wie eine Briefseite (0,65-0,85) ist ein Deckblatt, kein Logo. */
                if (res.png && !(res.ratio >= 0.65 && res.ratio <= 0.85)) { treffer = { ...res, url, form: f.form, doc }; break; }
              } catch (e) { dbg(r.symbol, "SEC-Logo", url, "Fehler", e.message); }
            }
            if (treffer) break;
          }
          if (!treffer && alt && alt.source === "SEC_FILING" && alt.rule === "logo-hint" && ersatz(alt)) {
            files[r.symbol] = alt.path; credits[r.symbol] = alt; reasons.delete(r.symbol); stat.ok++; continue;
          }
          if (!treffer) { stat.ohneBild++; continue; }
          const path = "files/" + r.symbol + ".png";
          for (const f of readdirSync(FILES)) if (f.startsWith(r.symbol + ".") && f !== r.symbol + ".png") rmSync(join(FILES, f));
          writeFileSync(join(OUT, path), treffer.png);
          files[r.symbol] = path;
          credits[r.symbol] = { source: "SEC_FILING", path, wide: breitSchreiben(r.symbol, treffer.wide), page: treffer.doc, iconUrl: treffer.url, form: treffer.form,
                                sha1: createHash("sha1").update(treffer.png).digest("hex"), via: "SEC_CIK",
                                licenseName: "Marke des Inhabers", fmt: FORMAT, ratio: Math.round(treffer.ratio * 100) / 100, rule: "logo-hint" };
          reasons.delete(r.symbol);
          stat.ok++;
        } catch (e) {
          stat.fehler++; dbg(r.symbol, "SEC-Logo Fehler", e.message);
          if (alt && alt.source === "SEC_FILING" && alt.rule === "logo-hint" && ersatz(alt)) { files[r.symbol] = alt.path; credits[r.symbol] = alt; reasons.delete(r.symbol); }
        }
        if (++i % 250 === 0) console.log(`     … ${i} (${JSON.stringify(stat)})`);
      }
      console.log(`     SEC-Logos: ${JSON.stringify(stat)}`);
    }

    /* Letzte Stufe, nur Index-Titel ohne Logo: das Favicon ab 32 px. */
    const letzte = universe.filter((r) => PRIORITAET.has(r.symbol) && !files[r.symbol] && siteOf.has(r.symbol));
    if (letzte.length) {
      console.log(`     Index-Titel ohne Logo, Favicon ab 32 px: ${letzte.length}`);
      for (const r of letzte) {
        const site = siteOf.get(r.symbol);
        const res = await webIcon(site, sharp, r.symbol, r.name, { minIcon: 32 });
        if (!res.png) continue;
        const path = "files/" + r.symbol + ".png";
        writeFileSync(join(OUT, path), res.png);
        files[r.symbol] = path;
        credits[r.symbol] = { source: "WEBSITE", path, wide: breitSchreiben(r.symbol, res.wide), page: site.url, host: site.host, iconUrl: res.iconUrl,
                              sha1: createHash("sha1").update(res.png).digest("hex"), via: site.via,
                              licenseName: "Marke des Inhabers", fmt: FORMAT, ratio: Math.round((res.ratio || 1) * 100) / 100, small: true };
        reasons.delete(r.symbol);
      }
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
for (const f of readdirSync(FILES)) if (!f.startsWith(".") && f !== "wide" && !behaltenePfade.has(f)) rmSync(join(FILES, f));
/* Breite Fassungen nur zu Titeln, deren Logo sie auch hat. */
const breitePfade = new Set(Object.entries(credits).filter(([s, c]) => c.wide && files[s]).map(([, c]) => c.wide.slice("files/wide/".length)));
if (existsSync(join(FILES, "wide"))) for (const f of readdirSync(join(FILES, "wide"))) if (!breitePfade.has(f)) rmSync(join(FILES, "wide", f));
for (const c of Object.values(credits)) if (!c.wide) delete c.wide;

/* Freigabe: Ein Logo geht erst live, wenn genau dieses Bild (sha1) von Hand
   gesichtet ist (discover/config/logo-reviewed.json). Neue Titel und
   geaenderte Bilder warten - Datei und Nachweis bleiben, aber die
   Oberflaeche (index.json) kennt sie noch nicht. So erscheint kein
   ungesehenes Bild neben einer Aktie (Unterschriften, Partnerlogos, Fotos). */
const FREIGABE = readJson(join(root, "discover", "config", "logo-reviewed.json"), { symbols: {} }).symbols || {};
const wartend = [];
for (const [sym, c] of Object.entries(credits)) {
  if (files[sym] && FREIGABE[sym] !== c.sha1) {
    c.pending = true; wartend.push(sym);
    delete files[sym]; reasons.set(sym, "WARTET_AUF_SICHTPRUEFUNG");
  } else delete c.pending;
}
if (wartend.length) console.log(`     Warten auf Sichtpruefung: ${wartend.length} (${wartend.slice(0, 40).join(", ")}${wartend.length > 40 ? " …" : ""})`);
const live = Object.values(credits).filter((c) => !c.pending);

/* Helle Logos auf transparentem Grund bekommen in der Oberflaeche eine dunkle Flaeche. */
const dunkel = [];
try {
  const sharpLib = (await import("sharp")).default;
  for (const [sym, path] of Object.entries(files)) {
    try { if (await isLightOnTransparent(readFileSync(join(OUT, path)), sharpLib)) dunkel.push(sym); } catch (e) { /* weiter */ }
  }
} catch (e) { console.log("     sharp fehlt - keine Pruefung auf helle Logos."); }

/* Abdeckung der wichtigen Indizes (Mitglieder oben ermittelt). */
const indexAbdeckung = {};
for (const [id, set] of Object.entries(INDEX_MITGLIEDER)) {
  const liste = [...set].sort();
  const ohneLogo = liste.filter((s) => !files[s]);
  indexAbdeckung[id] = { members: liste.length, withLogo: liste.length - ohneLogo.length,
                         missing: ohneLogo.map((s) => s + ":" + (exclusions[s] ? "AUSGESCHLOSSEN" : (reasons.get(s) || "?"))) };
  console.log(`     ${id}: ${liste.length - ohneLogo.length}/${liste.length} mit Logo`);
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
  /* Seitenverhaeltnis der breiten Fassung (files/wide/<Titel>.png). */
  wide: sortiert(Object.fromEntries(Object.entries(credits).filter(([s, c]) => c.wide && files[s]).map(([s, c]) => [s, c.ratio]))),
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
  note: "Titel ohne Logo und der Grund. KEIN_WIKIDATA_LOGO: Wikidata kennt fuer die Firma kein Logo (oder die Firma nicht). NAME_ODER_CIK_WIDERSPRICHT / MEHRERE_ITEMS: Zuordnung unklar, deshalb bewusst ohne Logo. LIZENZ_NICHT_FREI / EINSCHRAENKUNG / URHEBER_FEHLT: kein Logo der Firma mit freier Lizenz. WEB_*: die Website brachte kein brauchbares Icon (keins, zu klein, generisch). WARTET_AUF_SICHTPRUEFUNG: Logo gefunden, geht nach der Sichtpruefung live.",
  reasons: sortiert(Object.fromEntries([...reasons].filter(([sym]) => !files[sym])))
}, null, 1) + "\n");
writeFileSync(join(OUT, "summary.json"), JSON.stringify({
  generatedAt,
  universe: universe.length,
  withLogo: Object.keys(files).length,
  pct: Math.round((Object.keys(files).length / Math.max(1, universe.length)) * 1000) / 10,
  downloaded: geladen + webNeu, unchanged: behalten + webBehalten,
  pending: wartend.sort(),
  bySource: live.reduce((a, c) => ((a[c.source] = (a[c.source] || 0) + 1), a), {}),
  byVia: live.reduce((a, c) => ((a[c.via] = (a[c.via] || 0) + 1), a), {}),
  indexCoverage: indexAbdeckung,
  byLicense: live.filter((c) => c.license).reduce((a, c) => ((a[c.license] = (a[c.license] || 0) + 1), a), {}),
  excluded: grundZaehler
}, null, 1) + "\n");

console.log(`Fertig: ${Object.keys(files).length}/${universe.length} Titel mit Logo (Commons ${geladen} neu/${behalten} unveraendert, Website ${webNeu} neu/${webBehalten} unveraendert).`);
console.log("Ausgeschlossen:", JSON.stringify(grundZaehler));
