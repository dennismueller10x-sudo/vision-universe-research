#!/usr/bin/env node
// Schickt alte und korrigierte Consumer-Bundles durch die UNVERAENDERTEN Consumer-Engines und zaehlt, was sich aendert.
//   Quant:    quant/engines/fundamental-inputs.js compute()  (Rohwerte der Faktoren; Boersenwert fest, damit nur Daten wirken)
//   Discover: discover/engines/fundamentals.js fromBundle + unternehmen.js ausConsumerBundle (KGV-Basis, TTM, Wachstum)
//   Screener: Feldlogik aus scripts/screener/build-universe.mjs nachgestellt (eps = TTM ?? FY, epsGrowth FY/FY, epsCagr3)
//   node consumer-impact.mjs <old-dir> <new-dir> <out.json> [--cutoff 2026-10-05]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const Inputs = require(path.join(root, "quant/engines/fundamental-inputs.js"));
const Fund = require(path.join(root, "discover/engines/fundamentals.js"));
const Unt = require(path.join(root, "discover/engines/unternehmen.js"));

const args = process.argv.slice(2);
const [oldDir, newDir, outPath] = args;
const cutoff = args.includes("--cutoff") ? args[args.indexOf("--cutoff") + 1] : "2026-10-05";
const MARKET_CAP = 1e10;
const PRICE = 100;
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12));

function screenerFields(doc) {
  const lastAnnual = (m) => { const r = doc.annual?.[m]; return Array.isArray(r) && r.length ? r[r.length - 1][3] : null; };
  const eps = (doc.annual?.eps_diluted || []).map((r) => r[3]).filter(fin);
  const growth = (a, b) => (fin(a) && fin(b) && b > 0 ? a / b - 1 : null);
  let epsCagr3 = null;
  if (eps.length >= 4) { const a = eps.at(-4), b = eps.at(-1); if (a > 0 && b > 0) epsCagr3 = Math.pow(b / a, 1 / 3) - 1; }
  const ttmEps = fin(doc.ttm?.eps_diluted?.v) ? doc.ttm.eps_diluted.v : null;
  return {
    eps: ttmEps ?? lastAnnual("eps_diluted"),
    epsSource: ttmEps !== null ? "TTM" : (fin(lastAnnual("eps_diluted")) ? "FY" : "NONE"),
    epsGrowth: eps.length >= 2 ? growth(eps.at(-1), eps.at(-2)) : null,
    epsCagr3,
    revenue: fin(doc.ttm?.revenue?.v) ? doc.ttm.revenue.v : lastAnnual("revenue"),
  };
}

function discoverFields(doc) {
  const model = Fund.fromBundle(doc);
  const u = Unt.ausConsumerBundle(model, { preis: PRICE });
  const epsBasis = fin(doc.ttm?.eps_diluted?.v) ? "TTM_EPS" : (u.basis === "FY" ? "FY_EPS_OR_NI_SHARES" : "TTM_NI_DIV_SHARES");
  return { status: u.status, basis: u.basis, gewinnJeAktie: u.gewinnJeAktie, kgv: u.kgv, kgvStatus: u.kgvStatus,
           umsatzTTM: u.umsatzTTM, gewinnTTM: u.gewinnTTM, umsatzWachstum: u.umsatzWachstum, gewinnWachstum: u.gewinnWachstum,
           marge: u.marge, epsBasis };
}

const counters = {};
const examples = {};
function count(key, ticker, detail) {
  counters[key] = (counters[key] || 0) + 1;
  const list = (examples[key] ||= []);
  if (list.length < 8) list.push({ ticker, ...detail });
}
function compareFields(prefix, a, b, ticker, tol = 1e-6) {
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[key]; const y = b?.[key];
    if (fin(x) && fin(y)) {
      if (rel(x, y) > tol) {
        count(`${prefix}.${key}.changed`, ticker, { old: x, new: y });
        if (rel(x, y) > 0.1) count(`${prefix}.${key}.changedOver10pct`, ticker, { old: x, new: y });
        if (Math.sign(x) !== Math.sign(y)) count(`${prefix}.${key}.signFlip`, ticker, { old: x, new: y });
      }
    } else if (fin(x) && !fin(y)) count(`${prefix}.${key}.lost`, ticker, { old: x });
    else if (!fin(x) && fin(y)) count(`${prefix}.${key}.gained`, ticker, { new: y });
    else if (typeof x === "string" || typeof y === "string") {
      if (x !== y) count(`${prefix}.${key}.${x}->${y}`, ticker, {});
    }
  }
}

const files = fs.readdirSync(newDir).filter((f) => /^CIK\d+\.json$/.test(f) && fs.existsSync(path.join(oldDir, f))).sort();
let n = 0;
const issuersChanged = { quant: new Set(), discover: new Set(), screener: new Set() };
for (const f of files) {
  const a = JSON.parse(fs.readFileSync(path.join(oldDir, f), "utf8"));
  const b = JSON.parse(fs.readFileSync(path.join(newDir, f), "utf8"));
  const ticker = (b.tickers || [])[0] || b.cik;
  n += 1;
  const before = { ...counters };
  const qa = Inputs.compute(a, cutoff, MARKET_CAP);
  const qb = Inputs.compute(b, cutoff, MARKET_CAP);
  compareFields("quant.raws", qa?.raws, qb?.raws, ticker);
  compareFields("quant.change", qa?.change, qb?.change, ticker);
  const mark = (k) => Object.keys(counters).some((key) => key.startsWith(k) && counters[key] !== before[key]);
  if (mark("quant.")) issuersChanged.quant.add(ticker);
  compareFields("discover", discoverFields(a), discoverFields(b), ticker, 1e-4);
  if (mark("discover.")) issuersChanged.discover.add(ticker);
  compareFields("screener", screenerFields(a), screenerFields(b), ticker);
  if (mark("screener.")) issuersChanged.screener.add(ticker);
}

const out = {
  schema: "vu-fundamental-consumer-impact-1.0.0",
  method: "gleiche SEC-Quelle (companyfacts.zip), gleicher as_of; alte vs. korrigierte Kernversion; Consumer-Engines unveraendert; Boersenwert/Kurs fest (Datenwirkung isoliert)",
  cutoff, issuersCompared: n,
  issuersWithChange: Object.fromEntries(Object.entries(issuersChanged).map(([k, v]) => [k, v.size])),
  counters: Object.fromEntries(Object.entries(counters).sort()),
  examples,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ n, issuersWithChange: out.issuersWithChange }));
for (const [k, v] of Object.entries(out.counters)) if (!/quant\.change/.test(k)) console.log(k, v);
