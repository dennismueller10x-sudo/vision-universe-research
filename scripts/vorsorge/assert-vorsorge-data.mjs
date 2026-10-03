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
const rows = index ? index.rows.map((r) => Object.fromEntries(index.fields.map((f, i) => [f, r[i]]))) : [];
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
for (const f of ["ingest/ingest-report.json", "ingest/failed-etf-ingest.json", "ingest/catalog-stats.json", "quality.json"]) {
  const p = join(D, f);
  if (existsSync(p) && /token\s+[0-9a-f]{40}|[?&]token=[0-9a-f]{40}/i.test(readFileSync(p, "utf8"))) errors.push("SECRET_PATTERN " + f);
}

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
