/* =========================================================================
   VISION UNIVERSE VORSORGE — assert-vorsorge-data.mjs

   Qualitaets-Gates fuer die ausgelieferten Vorsorge-Daten. Bricht ab
   (Exit 1) bei harten Fehlern, warnt bei auffaelligen Veraenderungen
   gegenueber dem letzten committeten Stand (git HEAD).

   HART    gueltiges JSON, eindeutige Slugs und Listing-IDs, keine NaN,
           keine unmoeglichen Daten, keine negative Historie, gueltige
           oeffentliche Ticker, jede Indexzeile hat eine Detaildatei,
           kein Schluessel-Muster in den Daten, kein TER/ISIN ohne Quelle.
   REGRESSION (gegen HEAD)
           Universum schrumpft > 20 %  -> Fehler
           Kursabdeckung faellt > 10 Prozentpunkte -> Fehler
           Duplikate verdreifachen sich -> Fehler
           unbekannte Klassifikation > 25 % -> Warnung
           gescheiterte Ingest-Ticker > 10 % -> Warnung
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const D = join(root, "vorsorge/data");
const errors = [], warnings = [];
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { errors.push("INVALID_JSON " + p.replace(root + "/", "") + ": " + e.message); return null; } };
const today = new Date().toISOString().slice(0, 10);

const index = read(join(D, "etf-index.json"));
const extra = existsSync(join(D, "etf-index-extra.json")) ? read(join(D, "etf-index-extra.json")) : null;
const rows = index ? index.rows.concat(extra ? extra.rows : []).map((r) => Object.fromEntries(index.fields.map((f, i) => [f, r[i]]))) : [];
if (index && index.rows.some((r) => !["PUBLIC_ANALYSIS", "COMPLEX"].includes(r[index.fields.indexOf("layer")]))) errors.push("MAIN_INDEX_CONTAINS_ARCHIVE_OR_REVIEW");
const slugs = new Set(), ids = new Set();
for (const r of rows) {
  if (slugs.has(r.slug)) errors.push("DUPLICATE_SLUG " + r.slug); slugs.add(r.slug);
  if (ids.has(r.id)) errors.push("DUPLICATE_LISTING_ID " + r.id); ids.add(r.id);
  if (!/^[A-Z0-9.\-^=]+$/i.test(r.symbol)) errors.push("INVALID_TICKER " + r.symbol);
  if ((r.layer === "PUBLIC_ANALYSIS" || r.layer === "COMPLEX") && !/^[A-Z0-9.-]+$/.test(r.slug)) errors.push("INVALID_PUBLIC_SLUG " + r.slug);
  for (const [k, v] of Object.entries(r)) if (typeof v === "number" && !Number.isFinite(v)) errors.push("NAN " + r.symbol + "." + k);
  if (r.hy !== null && r.hy < 0) errors.push("NEGATIVE_HISTORY " + r.symbol);
  if (r.from && (r.from > today || r.from < "1900-01-01")) errors.push("IMPOSSIBLE_DATE " + r.symbol + " " + r.from);
  if (r.priceDate && r.from && r.priceDate < r.from) errors.push("PRICE_BEFORE_HISTORY " + r.symbol);
  if (!existsSync(join(D, "etf", r.slug + ".json"))) errors.push("MISSING_DETAIL " + r.slug);
}
for (const f of existsSync(join(D, "etf")) ? readdirSync(join(D, "etf")) : []) {
  const d = read(join(D, "etf", f));
  if (d && (d.ter !== null || d.isin !== null)) errors.push("UNSOURCED_TER_OR_ISIN " + f);
}
// Kein Schluessel-Muster (Tiingo-Token sind 40 Hex-Zeichen) in Berichten
for (const f of ["ingest/ingest-report.json", "ingest/failed-etf-ingest.json", "ingest/catalog-stats.json", "quality.json", "sources/etf-source-probe.json", "sources/nport-manifest.json", "sources/sec-rr-costs.json"]) {
  const p = join(D, f);
  if (existsSync(p) && /token\s+[0-9a-f]{40}|[?&]token=[0-9a-f]{40}/i.test(readFileSync(p, "utf8"))) errors.push("SECRET_PATTERN " + f);
}

// ------------------------------------------- ETF Intelligence (Holdings, EU, Quellen)
const hDir = join(D, "holdings");
if (existsSync(join(hDir, "index.json"))) {
  const hi = read(join(hDir, "index.json"));
  if (hi) {
    const series = new Set(Object.values(hi.bySymbol).map((r) => r[0]));
    for (const sid of series) {
      const p = join(hDir, sid + ".json");
      if (!existsSync(p)) { errors.push("MISSING_HOLDINGS_FILE " + sid); continue; }
      const f = read(p); if (!f) continue;
      if (f.seriesName === "Test Series" || /TEST TRUST/.test(f.registrant || "")) errors.push("FIXTURE_DATA_PUBLISHED " + sid);
      if (!f.asOf || f.asOf > today) errors.push("HOLDINGS_BAD_AS_OF " + sid);
      if (f.source !== "SEC_NPORT" || f.sourceType !== "REGULATORY") errors.push("HOLDINGS_UNKNOWN_SOURCE " + sid);
      const wi = f.rowFields.indexOf("weight"), ti = f.rowFields.indexOf("assetType");
      // Hebel-/Derivatefonds melden Gewichte in % des Nettovermoegens auch ueber 100 % (Sicherheiten, Swaps): nur dort zulaessig.
      // Gegenlaeufige Optionsbeine (z. B. FLEX-Optionen mit Floor) werden mit Nominalwert gemeldet und koennen dort
      // einzeln weit ueber 1000 % liegen; fuer Derivate in Derivatefonds gilt daher nur: endlicher Wert.
      const DERIV = new Set(["FUTURE", "OPTION", "SWAP", "FORWARD", "DERIVATIVE"]);
      const lim = f.derivativeHeavy ? 10 : 1;
      for (const r of f.holdings) {
        const w = r[wi]; if (w === null) continue;
        if (!Number.isFinite(w)) { errors.push("HOLDINGS_WEIGHT_NOT_FINITE " + sid); break; }
        if (f.derivativeHeavy && DERIV.has(r[ti])) continue;
        if (w > lim || w < -lim) { errors.push("HOLDINGS_WEIGHT_OUT_OF_RANGE " + sid); break; }
      }
      if (!f.derivativeHeavy && f.concentration && f.concentration.top10 !== null && (f.concentration.top10 < 0 || f.concentration.top10 > 1.5)) errors.push("HOLDINGS_TOP10_IMPLAUSIBLE " + sid);
    }
  }
}
const euP = join(D, "eu/etf-eu-index.json");
if (existsSync(euP)) {
  const eu = read(euP);
  if (eu) {
    const ii = eu.fields.indexOf("isin"); let bad = 0; const seen = new Set();
    for (const r of eu.rows) { if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r[ii])) bad++; if (seen.has(r[ii])) errors.push("EU_DUPLICATE_ISIN " + r[ii]); seen.add(r[ii]); }
    if (bad) errors.push("EU_INVALID_ISIN " + bad);
    if (!/ESMA/.test(eu.attribution || "")) errors.push("EU_MISSING_ATTRIBUTION");
    // ESMA-Fondsregister: nur ISINs aus dem EU-Stamm, keine Dubletten, Quellenangabe
    const regP = join(D, "eu/etf-eu-ucits.json");
    if (existsSync(regP)) {
      const reg = read(regP);
      if (reg) {
        const ri = reg.fields.indexOf("isin"), rs = new Set();
        for (const r of reg.rows) { if (!seen.has(r[ri])) errors.push("EU_REGISTER_UNKNOWN_ISIN " + r[ri]); if (rs.has(r[ri])) errors.push("EU_REGISTER_DUPLICATE " + r[ri]); rs.add(r[ri]); }
        if (!/ESMA/.test(reg.attribution || "")) errors.push("EU_REGISTER_MISSING_ATTRIBUTION");
        if (reg.rows.length > eu.rows.length) errors.push("EU_REGISTER_MORE_THAN_INDEX");
      }
    }
  }
}
// Xetra-Referenzdaten: Rechte UNKNOWN -> Werte duerfen ohne Freigabe nicht im veroeffentlichten Verzeichnis liegen
{
  // Ohne Freigabe weder Werte noch Abdeckungsdateien im veroeffentlichten Verzeichnis
  if (existsSync(join(D, "eu/etf-eu-xetra.json"))) errors.push("XETRA_VALUES_PUBLISHED_WITHOUT_RELEASE");
  if (existsSync(join(D, "sources/xetra-refdata-stats.json"))) errors.push("XETRA_STATS_PUBLISHED_WITHOUT_RELEASE");
  // EU-Stamm/Register: nur die bekannten Spalten (keine Xetra-Felder wie WKN oder laufende Kosten)
  for (const [f, allowed] of [["eu/etf-eu-index.json", null], ["eu/etf-eu-ucits.json", ["isin", "ucits", "fundName", "manager", "homeState", "authority", "status", "hostCountries", "registerUpdated", "match"]]]) {
    const j = existsSync(join(D, f)) ? read(join(D, f)) : null;
    const bad = j && (j.fields || []).filter((k) => /wkn|ongoing|replication|benchmark|xetra/i.test(k) || (allowed && !allowed.includes(k)));
    if (bad && bad.length) errors.push("XETRA_FIELDS_IN_EU_DATA: " + f + " " + bad.join(","));
  }
  for (const f of ["quality.json", "data-gaps.json", "changes.json", "sources/etf-eu-source-probe.json"]) {   // EU-Stamm: Fondsnamen enthalten Indexnamen wie "Deutsche Börse EUROGOV"
    const t = existsSync(join(D, f)) ? readFileSync(join(D, f), "utf8") : "";
    if (/Deutsche B(ö|oe)rse|DEUTSCHE_BOERSE|xetra-master|xetra-all-tradable|ongoingChargesQuantiles|pendingRights/i.test(t)) errors.push("XETRA_REFERENCE_IN_PUBLIC_DATA: " + f);
  }
}
const rrP = join(D, "sources/sec-rr-costs.json");
if (existsSync(rrP)) { const rr = read(rrP); if (rr) for (const [sym, v] of Object.entries(rr.bySymbol)) for (const k of ["expenseRatio", "netExpenseRatio", "managementFee"]) if (v[k] && !(v[k].value >= 0 && v[k].value < 0.1)) errors.push("COST_OUT_OF_RANGE " + sym + "." + k); }

const q = read(join(D, "quality.json"));
let prev = null;
try { prev = JSON.parse(execFileSync("git", ["show", "HEAD:vorsorge/data/quality.json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { /* erster Stand */ }
if (q && prev && prev.counts) {
  const before = prev.counts.listings || 0, after = q.counts.listings;
  if (before && after < before * 0.8) errors.push(`UNIVERSE_SHRANK ${before} -> ${after}`);
  const pr = prev.priceCoverage?.ratio ?? null;
  if (pr !== null && q.priceCoverage.ratio < pr - 0.10) errors.push(`PRICE_COVERAGE_DROP ${pr} -> ${q.priceCoverage.ratio}`);
  const dupB = prev.duplicates?.duplicateTickers?.length || 0, dupA = q.duplicates.duplicateTickers.length;
  if (dupA > Math.max(10, dupB * 3)) errors.push(`DUPLICATE_SPIKE ${dupB} -> ${dupA}`);
}
if (q) {
  if (q.unknownClassification > 0.25 * Math.max(1, q.counts.listings)) warnings.push(`UNKNOWN_CLASSIFICATION ${q.unknownClassification}/${q.counts.listings}`);
  const rep = q.ingest?.report;
  if (rep && rep.activeTickers && rep.failed > 0.10 * rep.activeTickers) warnings.push(`FAILED_INGEST ${rep.failed}/${rep.activeTickers}`);
}
for (const w of warnings) console.log("::warning::" + w);
if (errors.length) { console.error(errors.slice(0, 50).join("\n")); console.error(`${errors.length} Fehler`); process.exit(1); }
console.log(`Vorsorge-Daten OK: ${rows.length} Listings, ${warnings.length} Warnungen.`);
