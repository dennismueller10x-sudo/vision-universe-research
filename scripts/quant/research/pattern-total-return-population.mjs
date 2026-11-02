#!/usr/bin/env node
// P4.1 erweitert auf die oeffentliche Population (pattern-total-return-population-1.0.0). Nur Research.
//
// Frage: Wie weit traegt die Gesamtrendite-Rechnung von P4.1 (pattern-total-return.mjs, unveraendert im Kern) ueber die
// fuenf Golden-Preview-Titel hinaus, ohne Secret und ohne privates Archiv? Und wie sicher ist die gepaarte Differenz
// Gesamtrendite minus Kursrendite?
//
// 1. Kandidaten: der ganze oeffentliche Rahmen des Vorlagenprofils (Vollerhebung; die Pruefung je Titel liest nur
//    Dateien) plus die Golden-Preview-Titel. Reihenfolge und Begrenzung (--limit) ueber sha256(seed + ":" + securityId),
//    deterministisch und unabhaengig vom Ergebnis.
// 2. Je Kandidat: Tagesreihe mit Ausschuettungen ueber scripts/quant/lib/daily-prices.mjs#dailyOf (ohne --work-dir nur
//    oeffentlich). Ohne bestaetigte Gesamtrendite faellt der Titel mit Grund heraus; ausgewiesen als Zaehlung je Grund
//    und Quelle (keine Titelliste fuer den Rahmen, nur fuer die Golden-Preview).
// 3. Mit den uebrigen Titeln laeuft compute() aus pattern-total-return.mjs (Paritaet mit dem Runner, Zerlegung).
// 4. Gepaarte Differenz je Ereignis mit 95-%-Intervallen: t-Intervall (unabhaengige Paare angenommen) und zwei
//    Cluster-Bootstraps (Cluster = Titel, Cluster = Titel x Kalenderjahr; 10.000 Ziehungen, Zufallszahlen aus sha256
//    des Seeds). Bei weniger als 10 Clustern traegt das Intervall den Hinweis FEW_CLUSTERS.
// Keine Ereigniszeilen und keine Kurse im Bericht. Kein Gate-Eingang, keine Produktzahl.
//
//   node scripts/quant/research/pattern-total-return-population.mjs --out <bericht.json>
//        [--template pattern-2015-sideways] [--limit N] [--seed text] [--work-dir <dir>]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dailyOf } from "../lib/daily-prices.mjs";
import * as PTR from "./pattern-total-return.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const R = require("./backtest-runner.cjs");
const Identity = require("../../../core/identity.js");

export const VERSION = "pattern-total-return-population-1.0.0";
export const DEFAULT_SEED = "p41-population-1";
export const BOOTSTRAP_DRAWS = 10000;
const GENERATED = ["quant/data", "discover/data", "supertrader/data", "social/data"];

const fail = (code, detail) => { const e = new Error(code + (detail !== undefined ? ":" + detail : "")); e.code = code; throw e; };
const sha = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : R.canonical(x)).digest("hex");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** Reihenfolge ueber sha256(seed:id): deterministisch, ergebnisfrei. */
export function hashOrder(ids, seed = DEFAULT_SEED) {
  return ids.map((id) => ({ id, h: sha(seed + ":" + id) })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).map((x) => x.id);
}

/* Normalquantil (Acklam) und t-Quantil (Cornish-Fisher bis 1/nu^2; fuer nu >= 10 auf 1e-3 genau). */
function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? p : 1 - p, sign = p < 0.5 ? -1 : 1;
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); return sign * -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  const r = q - 0.5, s = r * r;
  return -sign * (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}
export function tQuantile(p, nu) {
  const z = normalQuantile(p);
  return z + (z ** 3 + z) / (4 * nu) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * nu * nu) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * nu ** 3);
}

/** Zufallszahlen aus sha256(seed:zaehler) - reproduzierbar ohne Laufzeitabhaengigkeit. */
function uniforms(seed) {
  let k = 0, buf = null, off = 32;
  return () => { if (off + 4 > 32) { buf = crypto.createHash("sha256").update(seed + ":" + k++).digest(); off = 0; } const v = buf.readUInt32BE(off); off += 4; return v / 4294967296; };
}
const quantileSorted = (s, p) => { const x = (s.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };

/** Cluster-Bootstrap des Mittels: Cluster mit Zuruecklegen ziehen, Mittel ueber alle Paare der gezogenen Cluster. */
export function clusterBootstrap(rows, clusterOf, seed, draws = BOOTSTRAP_DRAWS) {
  const groups = new Map();
  for (const r of rows) { const k = clusterOf(r); if (!groups.has(k)) groups.set(k, { sum: 0, n: 0 }); const g = groups.get(k); g.sum += r.difference; g.n++; }
  const list = [...groups.keys()].sort().map((k) => groups.get(k)), G = list.length;
  if (G < 2) return { clusters: G, interval95: null, note: "TOO_FEW_CLUSTERS" };
  const u = uniforms(seed), means = new Float64Array(draws);
  for (let b = 0; b < draws; b++) { let s = 0, n = 0; for (let j = 0; j < G; j++) { const g = list[Math.floor(u() * G)]; s += g.sum; n += g.n; } means[b] = s / n; }
  const sorted = Array.from(means).sort((a, b) => a - b);
  return { clusters: G, draws, interval95: [quantileSorted(sorted, 0.025), quantileSorted(sorted, 0.975)], note: G < 10 ? "FEW_CLUSTERS: Intervall unterschaetzt die Unsicherheit" : null };
}

/** Gepaarte Differenz mit Intervallen. rows: [{ issuerId, signalDate, difference }]. */
export function pairedInterval(rows, seed = DEFAULT_SEED) {
  const x = rows.map((r) => r.difference), n = x.length, m = mean(x), s = sd(x);
  const t = n > 1 ? tQuantile(0.975, n - 1) : null;
  const perTitle = {};
  for (const r of rows) { const p = perTitle[r.issuerId] || (perTitle[r.issuerId] = []); p.push(r.difference); }
  return {
    pairs: n, mean: m, median: median(x), sd: s, positiveShare: n ? x.filter((v) => v > 0).length / n : null,
    tInterval95: n > 1 ? { interval: [m - t * s / Math.sqrt(n), m + t * s / Math.sqrt(n)], assumption: "unabhaengige Paare (trifft nicht zu: gleiche Titel, ueberlappende 13-Wochen-Fenster)" } : null,
    clusterTitle: clusterBootstrap(rows, (r) => r.issuerId, seed + ":title"),
    clusterTitleYear: clusterBootstrap(rows, (r) => r.issuerId + "|" + r.signalDate.slice(0, 4), seed + ":title-year"),
    perTitle: Object.fromEntries(Object.keys(perTitle).sort().map((k) => [k, { pairs: perTitle[k].length, mean: mean(perTitle[k]), min: Math.min(...perTitle[k]), max: Math.max(...perTitle[k]) }]))
  };
}

/**
 * Kern. spec aus PTR.specFor; frame { ids, calendar, docOf }; golden: securityIds der Golden-Preview; daily(id) wie dailyOf;
 * runner wie in PTR.compute. Liefert den Bericht ohne Ereigniszeilen.
 */
export function computePopulation({ spec, frame, golden, daily, runner, seed = DEFAULT_SEED, limit = null, profile }) {
  const ordered = hashOrder([...new Set([...frame.ids, ...golden])], seed);
  const candidates = limit ? ordered.slice(0, limit) : ordered;
  const frameSet = new Set(frame.ids), goldenSet = new Set(golden);
  const byReason = {}, goldenExcluded = [], included = [];
  const count = (reason, source) => { const k = reason + "|" + (source || "NONE"); byReason[k] = (byReason[k] || 0) + 1; };
  for (const id of candidates) {
    let reason = null, source = null;
    if (!frameSet.has(id)) reason = "NOT_IN_POPULATION_FRAME";
    else {
      let d = null;
      try { d = daily(id); } catch (e) { d = { source: "READ_FAILED", totalReturn: false, tr: null, trVerdict: { reason: "READ_FAILED" } }; }
      if (!d) reason = "NO_DAILY_HISTORY_WITH_DISTRIBUTIONS";
      else if (!d.totalReturn || !d.tr) { reason = "TOTAL_RETURN_NOT_CONFIRMED:" + ((d.trVerdict && d.trVerdict.reason) || "UNKNOWN"); source = d.source; }
      else source = d.source;
    }
    if (reason) { count(reason, source); if (goldenSet.has(id)) goldenExcluded.push({ securityId: id, reason }); continue; }
    const doc = frame.docOf(id);
    if (!doc.ticker || Identity.securityIdForTicker(doc.ticker) !== id) { count("TICKER_IDENTITY_MISMATCH", source); continue; }
    included.push({ securityId: id, ticker: doc.ticker, source });
  }
  if (!included.length) fail("NO_TITLE_WITH_CONFIRMED_TOTAL_RETURN");
  const cohortSpec = { ...spec, population: { ...spec.population, tickers: included.map((x) => x.ticker).sort() } };
  const rep = PTR.compute({ spec: cohortSpec, population: { calendar: frame.calendar, docOf: frame.docOf }, daily, runner }, { pairRows: true });
  const rows = rep.pairRows;
  const body = {
    schemaVersion: VERSION, evidenceKind: "RESEARCH_RETURN_BASIS_POPULATION", certification: "NOT_CERTIFIED", productionApproved: false, gateInput: false, claim: "NO_ALPHA_OR_CERTIFICATION_CLAIM",
    template: spec.id, window: spec.window, asOf: spec.asOf, pattern: rep.pattern, horizonBars: rep.horizonBars, cooldownBars: rep.cooldownBars, costs: rep.costs, benchmark: "NONE",
    contracts: { ...rep.contracts, population: VERSION, base: PTR.VERSION },
    population: {
      profile, frame: frame.ids.length, golden: golden.length, goldenInFrame: golden.filter((g) => frameSet.has(g)).length,
      candidates: candidates.length, selection: { rule: "sha256(seed + ':' + securityId) aufsteigend", seed, limit: limit || "ALL" },
      confirmedTotalReturn: included.length, confirmedShareOfCandidates: included.length / candidates.length,
      included: included.map((x) => ({ ticker: x.ticker, source: x.source })),
      excludedByReasonAndSource: Object.fromEntries(Object.keys(byReason).sort().map((k) => [k, byReason[k]])),
      goldenExcluded: goldenExcluded.sort((a, b) => (a.securityId < b.securityId ? -1 : 1)),
      ceiling: included.every((x) => goldenSet.has(x.securityId)) ? "PUBLIC_CEILING_GOLDEN_PREVIEW: oeffentlich hat nur die Golden-Preview Tagesreihen mit Ausschuettungen; mehr Titel nur ueber die kanonische Historie (--work-dir, Ablauf R3, Freigabe FV-5)" : "BEYOND_GOLDEN_PREVIEW"
    },
    parity: rep.parity, priceReturn: rep.priceReturn, totalReturn: rep.totalReturn,
    paired: { direction: "Gesamtrendite minus Kursrendite je Ereignis (beide beobachtet)", ...pairedInterval(rows, seed),
      distributionsComponent: { mean: rep.paired.decomposition.distributions.mean, min: rep.paired.decomposition.distributions.min },
      weeklySeriesSource: { mean: rep.paired.decomposition.weeklySeriesSource.mean } },
    baseReportHash: rep.reportHash
  };
  return { ...body, reportHash: sha(body) };
}

function parse(argv) {
  const o = {};
  const flags = { "--out": "out", "--template": "template", "--limit": "limit", "--seed": "seed", "--work-dir": "workDir" };
  for (let i = 0; i < argv.length; i++) { const k = flags[argv[i]]; if (!k || !argv[i + 1] || o[k] !== undefined) fail("INVALID_ARGUMENTS", argv[i]); o[k] = argv[++i]; }
  if (!o.out) fail("OUT_REQUIRED");
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith("..") && GENERATED.some((g) => rel === g || rel.startsWith(g + path.sep))) fail("OUT_INSIDE_GENERATED_DATA", rel);
  if (o.limit !== undefined && !(/^\d+$/.test(o.limit) && +o.limit > 0)) fail("INVALID_LIMIT", o.limit);
  return o;
}

export function main(argv = process.argv.slice(2), io = { log: (s) => console.log(s) }) {
  const o = parse(argv);
  const spec = PTR.specFor({ template: o.template, tickers: "_" });
  const Pop = require("./research-population.cjs");
  const pop = Pop.buildPopulation({ profile: spec.population.profile });
  const frame = { ids: [...pop.listings.keys()].sort(), calendar: pop.calendar, docOf: (id) => { const d = pop.listings.get(id); if (!d) fail("NOT_IN_POPULATION_FRAME", id); return d; } };
  const golden = fs.readdirSync(path.join(ROOT, PTR.GOLDEN_DIR)).filter((f) => /^ref_.+\.json$/.test(f)).map((f) => Identity.securityIdForTicker(f.slice(4, -5))).sort();
  const daily = (id) => dailyOf(id, o.workDir || null, { asOf: spec.asOf });
  const rep = computePopulation({ spec, frame, golden, daily, runner: (s) => R.runBacktest(s, {}), seed: o.seed || DEFAULT_SEED, limit: o.limit ? +o.limit : null, profile: spec.population.profile });
  const out = { ...rep, dailySource: o.workDir ? "CANONICAL_HISTORY (--work-dir, privat)" : PTR.GOLDEN_DIR + " (oeffentlich) und discover-series (oeffentlich, ohne Ausschuettungen)" };
  const tmp = o.out + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 1) + "\n"); fs.renameSync(tmp, o.out);
  const p = rep.paired;
  io.log("[pattern-total-return-population] " + rep.population.confirmedTotalReturn + "/" + rep.population.candidates + " Kandidaten mit Gesamtrendite, Paare " + p.pairs + ", Mittel " + (p.mean * 100).toFixed(3) + " Pp · " + o.out);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
