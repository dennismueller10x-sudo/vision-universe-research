#!/usr/bin/env node
/* =========================================================================
   Core-Adoption-Matrix: welche Produktteile laufen wirklich auf den
   gemeinsamen Grundlagen, wo gibt es Parallelwelten?

   Gemessen, nicht behauptet: fuer jedes Produkt werden die tatsaechlich
   geladenen Skripte (Laufzeit, <script src> der Einstiegsseiten) und die
   Erzeuger-Skripte (Build, import/require) gelesen. Je Bereich wird
   festgestellt, ob das Produkt das gemeinsame Modul nutzt (CORE/SHARED),
   eine eigene Ableitung hat (OWN) oder den Bereich nicht beruehrt (–).

     node scripts/core/adoption-matrix.mjs            Markdown-Tabelle
     node scripts/core/adoption-matrix.mjs --json     Rohdaten mit Belegen
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Produkte: Laufzeit = Einstiegsseiten (+ Einschraenkung auf Dateien, wenn
   das Produkt Teil einer groesseren Seite ist), Build = Erzeuger. */
export const PRODUCTS = {
  Discover: { pages: ["discover/index.html"], build: ["scripts/discover/build-discover-data.mjs", "scripts/market/publish-discover-series.mjs", "scripts/market/publish-long-series.mjs"] },
  Quant: { pages: ["quant/index.html"], build: ["scripts/market/build-capability-matrix.mjs"] },
  Markets: { pages: ["quant/markt/index.html"], extra: ["discover/ui/markets.js"], build: [] },
  Screener: { pages: ["screener/index.html", "quant/screener/index.html"], build: [] },
  Supertrader: { pages: ["supertrader/index.html", "supertrader/stock/AAPL/index.html"], build: ["scripts/supertrader/build.mjs"] },
  Technical: { pages: ["quant/technical/index.html"], build: ["scripts/technical/materialize-product-intelligence.mjs", "scripts/technical/run-technical-scale.mjs"] },
  News: { pages: ["news/index.html"], build: [] },
  "Company Pages": { pages: [], extra: ["quant/app/page-stock.js", "quant/app/chart.js", "discover/ui/detail.js", "discover/ui/detail-fundamentals.js", "discover/ui/series-loader.js"], build: ["scripts/discover/build-discover-data.mjs"] },
  Status: { pages: ["status/index.html"], build: ["scripts/core/system-health.mjs", "scripts/core/diagnose.mjs"] }
};

function read(rel) { const p = join(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }

/** Lokale Skripte einer Seite, in Ladereihenfolge. */
export function scriptsOf(htmlRel) {
  const html = read(htmlRel), base = dirname(htmlRel), out = [];
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    let src = m[1].split("?")[0];
    if (/^(https?:)?\/\//.test(src)) continue;
    src = src.startsWith("/") ? src.slice(1) : join(base, src);
    out.push(src);
  }
  return out;
}

/** Module, die ein Erzeuger importiert (eine Ebene, relative Pfade). */
export function importsOf(rel) {
  const src = read(rel), base = dirname(rel), out = new Set();
  for (const m of src.matchAll(/(?:from\s+|import\(|require\()\s*["'`]([^"'`]+)["'`]/g)) if (m[1].startsWith(".")) out.add(join(base, m[1]));
  /* createRequire(import.meta.url)("../x.js") - so laedt Supertrader die
     gemeinsame Engine; vorher uebersehen (Matrix zeigte "eigen"). */
  for (const m of src.matchAll(/createRequire\([^)]*\)\(\s*["'`]([^"'`]+)["'`]/g)) if (m[1].startsWith(".")) out.add(join(base, m[1]));
  for (const m of src.matchAll(/join\((?:root|ROOT|HERE|DEFAULT_ROOT|here)[^)]*?((?:"[^"]+"\s*,\s*)*"[^"]+\.(?:js|mjs)")\s*\)/g)) {
    const parts = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((x) => x !== "..");
    out.add(parts.join("/"));
  }
  return [...out].map((p) => p.replace(/^(\.\.\/)+/, ""));
}

const has = (files, re) => files.filter((f) => re.test(f));

/** Quelltext ohne Block- und Zeilenkommentare (grob, reicht fuer die Muster hier). */
export function ohneKommentare(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}
/* Eine eigene Split-Bereinigung rechnet einen kumulativen Faktor aus
   splitFactor (ein Produkt ueber alle Splits danach). Reine Pruefungen auf
   splitFactor zaehlen nicht. */
const OWN_SPLIT = /(?:cumulative|factor|acc|kum\w*)\s*\*=\s*(?:sf|s|split\w*|[a-z]+\.splitFactor)\b/i;

export function measure(name, def) {
  const runtime = [...new Set([...(def.pages || []).flatMap(scriptsOf), ...(def.extra || [])])];
  const build = def.build || [];
  const buildMods = [...new Set(build.flatMap(importsOf))];
  /* Produkteigene Dateien: alles, was nicht unter quant/engines, core oder
     den geteilten Assets liegt. Nur dort zaehlt eine Ableitung als "eigene". */
  const own = [...runtime.filter((f) => !/^(quant\/engines|core|assets)\//.test(f)), ...build];
  /* Ohne Kommentare: ein Kommentar, der einen behobenen Fehler beschreibt
     (etwa die fruehere rohe ID-Bildung im Supertrader-Build), ist keine
     Ableitung. */
  const ownText = own.map((f) => [f, ohneKommentare(read(f))]);
  const grepOwn = (re) => ownText.filter(([, t]) => re.test(t)).map(([f]) => f);
  const all = [...runtime, ...buildMods];
  const paths = new Set();
  for (const [, t] of ownText) for (const m of t.matchAll(/["'`](\/?(?:quant|discover|supertrader|dashboard|screener)\/data\/[A-Za-z0-9_\-\/.${}]+|\/api\/[a-z\-]+)/g)) paths.add(m[1].replace(/^\//, ""));

  const cell = (core, shared, ownHits, touched) => {
    if (core.length) return { state: "CORE", evidence: core };
    if (shared.length && !ownHits.length) return { state: "SHARED", evidence: shared };
    if (shared.length && ownHits.length) return { state: "MIXED", evidence: [...shared, ...ownHits.map((f) => "eigen: " + f)] };
    if (ownHits.length) return { state: "OWN", evidence: ownHits };
    return { state: touched ? "INDIRECT" : "-", evidence: [] };
  };
  const pathList = [...paths];
  const prices = pathList.filter((p) => /discover-series|market\/(eod|history)|intraday|stocks\/|signals|screening|api\/(intraday|history)/.test(p));
  return {
    product: name, runtime, build, buildModules: buildMods, dataPaths: pathList.sort(),
    identity: cell(has(all, /^core\/identity\.js$/), has(all, /quant\/engines\/(company-master|instrument-directory)\.js$/),
      grepOwn(/["'`]ref_["'`]\s*\+|`ref_\$\{|"ref_"\s*\+/), false),
    prices: cell([], has(all, /quant\/engines\/(published-close|return-series|series-sampling)\.js$/),
      grepOwn(OWN_SPLIT), prices.length > 0),
    fundamentals: cell([], has(all, /quant\/api\/fundamentals-contract\.js$|discover\/engines\/fundamentals\.js$/),
      grepOwn(/\bfundamentals?_(?:metrics|data)\b|sec\/companyfacts/), pathList.some((p) => /fundamental|stocks\//.test(p))),
    corporateActions: cell([], has(all, /quant\/engines\/(return-series|canonical-total-return)\.js$/),
      grepOwn(OWN_SPLIT), false),
    healthDq: cell(has(all, /^core\/(health|data-quality|diagnose)\.js$/), has(all, /quant\/engines\/realtime\/(freshness|source-state)\.js$/),
      /* "eigen" = das Produkt rechnet ein Datenalter selbst aus, statt
         freshness.js/source-state.js/core/health.js zu nutzen. */
      grepOwn(/(?:Date\.now\(\)|new Date\(\)(?:\.getTime\(\))?)\s*-\s*(?:Date\.parse|new Date|\+?\s*new Date|[a-zA-Z_.]*(?:asOf|updated|generated|time|date))/i), false),
    coreClient: cell(has(all, /^core\/client\.js$/), [], [], false)
  };
}

/** Alle Stellen im Repository, die einen kumulativen Splitfaktor selbst berechnen. */
export function splitImplementations() {
  return execFileSync("git", ["ls-files", "*.js", "*.mjs"], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter((f) => f && !/(^|\/)(tests?|fixtures)\/|\.test\.m?js$|^docs\//.test(f) && OWN_SPLIT.test(read(f)));
}

export function matrix() { return Object.entries(PRODUCTS).map(([n, d]) => measure(n, d)); }

const LABEL = { CORE: "✅ Core", SHARED: "🟢 gemeinsam", MIXED: "🟡 gemischt", OWN: "🔴 eigen", INDIRECT: "⚪ indirekt", "-": "–" };

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = matrix();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ rows, splitImplementations: splitImplementations() }, null, 2)); process.exit(0); }
  const cols = [["identity", "Security Identity"], ["prices", "Prices"], ["fundamentals", "Fundamentals"], ["corporateActions", "Corporate Actions"], ["healthDq", "Health/DQ"], ["coreClient", "Core Client"]];
  console.log("| Bereich | " + cols.map((c) => c[1]).join(" | ") + " |");
  console.log("|---|" + cols.map(() => "---").join("|") + "|");
  for (const r of rows) console.log(`| ${r.product} | ` + cols.map(([k]) => LABEL[r[k].state]).join(" | ") + " |");
  console.log("\nEigene Split-Bereinigungen im Repository (Ziel: nur quant/engines/return-series.js):");
  for (const f of splitImplementations()) console.log("  " + f);
}
