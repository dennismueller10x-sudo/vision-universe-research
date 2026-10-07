#!/usr/bin/env node
/* =========================================================================
   VU HISTORICAL STRUCTURAL ACCURACY BENCHMARK (Mission VIII) — Stage 1
   KAUSALES REPLAY UND VERSIEGELUNG

   Fuer jeden Titel und jeden Erkennungszeitpunkt t: Produkt-Analyse an t
   (nur Bars <= t, getestet), kompakter Record, KEINE Zukunft. Am Ende ein
   Manifest mit SHA-256 je Shard, Engine-Hashes, Commit und Argumenten. Erst
   danach darf evaluate.mjs (Stage 2) Outcomes rechnen.

   Eingaben (Kohorten)
     --weekly-dir DIR      discover-series-long (Ueberlebende, Wochenschluss)  Kohorte SURV_W
     --delisted FILE       privates Delisting-Wochenbuendel (CI)                Kohorte DELISTED_W
     --work-dir DIR        kanonische Tageshistorie (CI) tiingo/daily/*.json    Kohorte SURV_D

   Auswahl
     --bucket a/b          nur Titel mit hash(symbol) mod b == a (DEV/VAL-Teilung)
     --sample-symbols N    zufaellige, deterministische Titelstichprobe (Tagesstudie)
     --from YYYY-MM-DD --to YYYY-MM-DD   nur Erkennungszeitpunkte in diesem Fenster
     --perbar N            fuer Titel mit hash mod N == 0 zusaetzlich JEDE Bar (Relabel-Studie)
     --persist N           fuer Titel mit hash mod N == 0 jede 10. Erkennung mit Elliott-
                           Persistenzkette (52 Bars, wie das Produkt) gegenrechnen
     --limit N  --workers W  --out DIR
   ========================================================================= */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createWriteStream } from "node:fs";
import { join, basename } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "../lib/ti-data.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";
import * as Core from "./lib/replay-core.mjs";

const require = createRequire(import.meta.url);
const Hash = require(join(ROOT, "quant/engines/hash.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));

export const MIN_BARS = { "1W": 160, "1D": 520 };
const symHash = (s) => parseInt(createHash("sha256").update("hsab|" + s).digest("hex").slice(0, 8), 16);

/** Elliott-Vorzustand wie im Produkt: Kette ueber die 52 Bars vor t (ti-product.mjs elliottReplay, WARMUP + STEPS). */
function chainState(P, series, t, meth) {
  const prep = P.main; let prev = null;
  for (let u = Math.max(1, t - 52); u < t; u++) {
    const E = EV3.analyzeElliottV3({ series, features: prep.features, pivots: prep.pivots, asOfIndex: u, barsPerYear: prep.profile.barsPerYear, previous: prev, methodology: meth });
    prev = E.primary ? { key: E.primary.persistenceKey, scaleId: E.degrees.analysis, pivots: E.primary.persistencePivots } : null;
  }
  return prev;
}

function processSeries(series, meta, o) {
  const minBars = MIN_BARS[series.timeframe];
  if (series.length < minBars) return { recs: [], skipped: "TOO_SHORT" };
  const P = Core.prepareSeries(series);
  const det = new Set(Core.detectionPoints(P, series.length, minBars));
  const h = symHash(meta.symbol);
  const perBar = o.perbar && h % o.perbar === 0;
  /* Review H4: eigener Hash-Strom, sonst waeren alle Persistenz-Titel zugleich Per-Bar-Titel (und uebersprungen). */
  const persist = o.persist && symHash("persist|" + meta.symbol) % o.persist === 0;
  const inWin = (t) => (!o.from || series.timestamps[t] >= o.from) && (!o.to || series.timestamps[t] <= o.to);
  /* Kalenderraster (Red Team #3): zusaetzlich die letzte Bar jedes Kalendermonats — „Kunde oeffnet VU an einem beliebigen Tag“. */
  const grid = new Set();
  const qOf = (d) => d.slice(0, 4) + (Math.floor((+d.slice(5, 7) - 1) / 3));
  if (o.grid === "month") for (let t = minBars - 1; t < series.length; t++) if (t === series.length - 1 || series.timestamps[t + 1].slice(0, 7) !== series.timestamps[t].slice(0, 7)) grid.add(t);
  /* Mission IX: Quartalsende-Raster (Titel × Quartal), letzte Bar eines Kalenderquartals */
  if (o.grid === "quarter") for (let t = minBars - 1; t < series.length - 1; t++) if (qOf(series.timestamps[t + 1]) !== qOf(series.timestamps[t])) grid.add(t);
  const ts = perBar ? Array.from({ length: series.length - (minBars - 1) }, (_, k) => k + minBars - 1) : Array.from(o.gridOnly ? grid : new Set([...det, ...grid])).sort((a, b) => a - b);
  const recs = [], checks = [];
  let k = 0, chain = null;
  /* Per-Bar-Modus: Elliott-Persistenz wie im Produkt (Vorzustand der Vorbar). Startet 52 Bars vor dem ersten Analysebar. */
  if (perBar) { const first = ts.find(inWin); if (first !== undefined) chain = chainState(P, series, first, PRODUCT_METHODOLOGY); }
  for (const t of ts) {
    if (!inWin(t)) continue;
    const r = Core.recordAt(P, series, t, meta, perBar ? { elliottPrevious: chain } : null);
    if (perBar) { chain = r._state; r.ch = 1; }
    delete r._state;
    r.dp = det.has(t) ? 1 : 0; if (perBar) r.pb = 1; if (grid.has(t)) r.g = 1;
    /* Mission IX (nur Forschung): interne Elliott-Kandidaten ueber die ausgabeneutralen Forensik-Haken von Mission VI.
       Zweiter Engine-Aufruf mit forensics:true; das Produkt-Ergebnis im Record bleibt unveraendert. */
    if (o.forensics && r.g) {
      const Ef = EV3.analyzeElliottV3({ series, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: PRODUCT_METHODOLOGY, forensics: true });
      const F = Ef.forensics || {}, pick = (k) => (F.final && F.final[k] ? { pos: F.final[k].bestPos, ...F.final[k].best } : null);
      r.fx = { IMPULSE: pick("IMPULSE"), LEADING_DIAGONAL: pick("LEADING_DIAGONAL"), scored: F.scoredTotal ?? null, samePrimary: (Ef.primary && Ef.primary.persistenceKey) === (r.ew && r.ew.key) ? 1 : 0 };
    }
    recs.push(r);
    if (persist && !perBar && r.dp && (k++ % 10 === 0)) {
      const prev = chainState(P, series, t, PRODUCT_METHODOLOGY);
      const rc = Core.recordAt(P, series, t, meta, { elliottPrevious: prev });
      checks.push({ s: meta.symbol, d: r.d, samePrimary: JSON.stringify(rc.P) === JSON.stringify(r.P) ? 1 : 0, sameOutlook: rc.o === r.o ? 1 : 0,
                    sameClarity: rc.cl === r.cl ? 1 : 0, sameElliottKey: rc.ew.key === r.ew.key ? 1 : 0, elliottAbstainBoth: rc.ew.ab && r.ew.ab ? 1 : 0, shapes: r.P && r.P.es ? 1 : 0 });
    }
  }
  return { recs, checks, perBar };
}

// ------------------------------------------------------------------ Worker
if (!isMainThread) {
  const { out, wid, opts } = workerData;
  const gz = createGzip({ level: 6 }); const file = join(out, `records-${String(wid).padStart(2, "0")}.jsonl.gz`);
  const ws = createWriteStream(file); gz.pipe(ws);
  const stats = { series: 0, skipped: 0, records: 0, perBarSymbols: 0, errors: [], checks: [] };
  parentPort.on("message", (m) => {
    if (m.job) {
      try {
        const j = m.job; let series;
        /* --history-from (Red Team #5): Historie vor diesem Datum verwerfen — prueft, was der Start der Delisted-Reihen 2015 an der Analyse aendert. */
        const hf = (pts) => (opts.historyFrom ? pts.filter((p) => p[0] >= opts.historyFrom) : pts);
        if (j.kind === "weekly") { const x = readJson(j.path); series = weeklySeriesFromPoints(hf(x.points || []), x.ticker); }
        else if (j.kind === "inline") series = weeklySeriesFromPoints(hf(j.points), j.symbol);
        else { const x = readJson(j.path); series = dailySeriesFromPayload(x, x.ticker); }
        const r = processSeries(series, { symbol: j.symbol, cohort: j.cohort }, opts);
        if (r.skipped) stats.skipped++; else { stats.series++; if (r.perBar) stats.perBarSymbols++; }
        for (const x of r.recs || []) gz.write(JSON.stringify(x) + "\n");
        stats.records += (r.recs || []).length; stats.checks.push(...(r.checks || []));
      } catch (e) { stats.errors.push(m.job.symbol + ": " + String(e.message).slice(0, 200)); }
      parentPort.postMessage({ next: true });
    } else if (m.finish) { gz.end(); ws.on("finish", () => { parentPort.postMessage({ done: stats, file }); parentPort.close(); }); }
  });
  parentPort.postMessage({ next: true });
}

// ------------------------------------------------------------------ Main
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
export function engineHashes() {
  const files = ["quant/engines/technical/elliott/elliott-v3.js", "quant/engines/technical/elliott/patterns.js", "quant/engines/technical/ti/scenario.js", "quant/engines/technical/ti/engine.js",
    "quant/engines/technical/ti/context.js", "quant/engines/technical/ti/dow-trend.js", "quant/engines/technical/ti/momentum-volatility.js", "quant/engines/technical/ti/levels.js",
    "quant/engines/technical/ti/chart-patterns.js", "quant/engines/technical/ti/wyckoff.js", "quant/engines/technical/ti/volume-intelligence.js", "quant/engines/technical/pivot-engine.js",
    "quant/engines/technical/feature-store.js", "scripts/technical/lib/ti-product.mjs", "scripts/technical/lib/ti-data.mjs", "scripts/technical/hsab/lib/replay-core.mjs",
    "scripts/technical/hsab/replay.mjs"];
  return Object.fromEntries(files.filter((f) => existsSync(join(ROOT, f))).map((f) => [f, sha(readFileSync(join(ROOT, f))).slice(0, 16)]));
}

async function main() {
  const out = arg("out", null); if (!out) throw new Error("--out DIR fehlt (Stage-1-Records gehoeren nie in ein committetes Artefakt)");
  mkdirSync(out, { recursive: true });
  const opts = { from: arg("from", null), to: arg("to", null), perbar: +arg("perbar", "0"), persist: +arg("persist", "0"), grid: arg("grid", null), historyFrom: arg("history-from", null), gridOnly: process.argv.includes("--grid-only"), forensics: process.argv.includes("--forensics") };
  const bucket = arg("bucket", null), limit = +arg("limit", "0"), workers = +arg("workers", "4"), sampleN = +arg("sample-symbols", "0");
  let jobs = [];
  const wdir = arg("weekly-dir", null);
  if (wdir) for (const f of readdirSync(wdir).filter((x) => x.startsWith("ref_") && x.endsWith(".json")).sort())
    jobs.push({ kind: "weekly", path: join(wdir, f), symbol: f.replace(/\.json$/, ""), cohort: "SURV_W", size: statSync(join(wdir, f)).size });
  const dl = arg("delisted", null);
  let delistedMeta = null;
  if (dl) {
    const b = readJson(dl); let added = 0;
    for (const l of b.listings || []) {
      if (!l || !l.w0 || !Array.isArray(l.c)) continue;
      const t0w = Date.parse(l.w0 + "T00:00:00Z"), points = [];
      l.c.forEach((c, i) => { if (c > 0) points.push([new Date(t0w + i * 7 * 864e5).toISOString().slice(0, 10), c]); });
      if (points.length) { jobs.push({ kind: "inline", points, symbol: "DL:" + (l.id || l.ticker), cohort: "DELISTED_W", size: points.length * 20 }); added++; }
    }
    delistedMeta = { version: b.version || null, asOf: b.asOf || null, listings: (b.listings || []).length, series: added };
  }
  const work = arg("work-dir", null), uni = arg("universe", null);
  /* Tagesstudie nur fuer Stammaktien des Produktuniversums (keine ETFs, keine sonstigen Gattungen). */
  const allowed = uni ? new Set(readJson(uni).securities.filter((x) => x.instrumentType === "COMMON_STOCK").map((x) => x.securityId)) : null;
  if (work) { const dd = join(work, "tiingo", "daily");
    for (const f of readdirSync(dd).filter((x) => x.endsWith(".json") && (!allowed || allowed.has(x.replace(/\.json$/, "")))).sort()) jobs.push({ kind: "daily", path: join(dd, f), symbol: "D:" + f.replace(/\.json$/, ""), cohort: "SURV_D", size: statSync(join(dd, f)).size }); }
  if (bucket) { const [a, b] = bucket.split("/").map(Number); jobs = jobs.filter((j) => symHash(j.symbol) % b === a); }
  if (sampleN && jobs.length > sampleN) { jobs = jobs.map((j) => [symHash("sample|" + j.symbol), j]).sort((x, y) => x[0] - y[0]).slice(0, sampleN).map((x) => x[1]); }
  if (limit) jobs = jobs.slice(0, limit);
  const symbols = jobs.map((j) => j.symbol).sort();
  const queue = jobs.slice().sort((a, b) => b.size - a.size || (a.symbol < b.symbol ? -1 : 1));
  const t0 = Date.now(), hashesAtStart = engineHashes();
  console.log(`[hsab-replay] ${jobs.length} Reihen, ${workers} Worker, Fenster ${opts.from || "-"}..${opts.to || "-"}`);
  let done = 0;
  const results = await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, wid) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { out, wid, opts }, resourceLimits: { maxOldGenerationSizeMb: 3072 } });
    w.on("message", (m) => {
      if (m.next) {
        const job = queue.shift();
        if (job) { w.postMessage({ job }); if (++done % 250 === 0) console.log(`[hsab-replay] ${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)`); }
        else w.postMessage({ finish: true });
      }
      if (m.done) resolve(m);
    });
    w.on("error", reject);
  })));
  /* Engine-Dateien und Record-Kern duerfen sich waehrend des Laufs nicht aendern (der Treiber selbst ist zu Laufbeginn geladen). */
  const hashesAtEnd = engineHashes(), driver = "scripts/technical/hsab/replay.mjs";
  const changed = Object.keys(hashesAtStart).filter((f) => f !== driver && hashesAtStart[f] !== hashesAtEnd[f]);
  if (changed.length) throw new Error("Engine-Dateien waehrend des Laufs veraendert: " + changed.join(", "));
  const shards = results.map((r) => ({ file: basename(r.file), sha256: sha(readFileSync(r.file)), records: r.done.records }));
  const agg = results.reduce((a, r) => { a.series += r.done.series; a.skipped += r.done.skipped; a.records += r.done.records; a.perBarSymbols += r.done.perBarSymbols; a.errors.push(...r.done.errors); a.checks.push(...r.done.checks); return a; },
    { series: 0, skipped: 0, records: 0, perBarSymbols: 0, errors: [], checks: [] });
  let commit = null; try { commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* ohne Git */ }
  let dirty = null; try { dirty = execSync("git status --porcelain -- quant/engines scripts/technical", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean); } catch { /* ohne Git */ }
  const C = agg.checks, sum = (k) => C.reduce((a, x) => a + x[k], 0);
  const manifest = {
    schemaVersion: "hsab-replay-manifest-1.0.0", replayVersion: Core.REPLAY_VERSION, generatedAt: new Date().toISOString(), commit, dirtyEngineFiles: dirty,
    engine: { scenario: require(join(ROOT, "quant/engines/technical/ti/scenario.js")).ENGINE_VERSION, elliott: EV3.ENGINE_VERSION || null, methodology: PRODUCT_METHODOLOGY, files: hashesAtStart },
    args: process.argv.slice(2).filter((x) => !/\/|\\/.test(x) || x.startsWith("--")), opts, bucket, sampleSymbols: sampleN || null, delisted: delistedMeta,
    symbols: { n: symbols.length, sha256: sha(symbols.join("\n")) }, counts: { series: agg.series, tooShort: agg.skipped, records: agg.records, perBarSymbols: agg.perBarSymbols, errors: agg.errors.length },
    errors: agg.errors.slice(0, 200), shards, seconds: Math.round((Date.now() - t0) / 1000),
    persistenceCheck: C.length ? { n: C.length, samePrimary: sum("samePrimary") / C.length, sameOutlook: sum("sameOutlook") / C.length, sameClarity: sum("sameClarity") / C.length,
      sameElliottKey: sum("sameElliottKey") / C.length, elliottShapesScenario: sum("shapes") / C.length, rows: C } : null
  };
  manifest.sealHash = sha(JSON.stringify({ shards: manifest.shards, symbols: manifest.symbols, engine: manifest.engine, opts: manifest.opts }));
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`[hsab-replay] fertig: ${agg.records} Records aus ${agg.series} Reihen (${agg.skipped} zu kurz, ${agg.errors.length} Fehler), ${manifest.seconds} s, Siegel ${manifest.sealHash.slice(0, 16)}`);
  if (manifest.persistenceCheck) console.log("[hsab-replay] Persistenz-Abgleich", JSON.stringify({ ...manifest.persistenceCheck, rows: undefined }));
}
if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
