#!/usr/bin/env node
/* =========================================================================
   SETUP REPLAY - der Setup-Zustand, wie er an jedem frueheren Stichtag
   veroeffentlicht worden waere.

   Fuer jeden Stichtag t:
     1. nur die Tagesbalken bis einschliesslich t
     2. Corporate Actions nur bis t, kanonische Reihe SPLIT_ADJUSTED
     3. technische Auswertung mit denselben Optionen wie die Produktion
        (scripts/technical/materialize-product-intelligence.mjs)
     4. dieselbe Zeilenprojektion wie scripts/quant/build-setup-observations.mjs
     5. SetupEngine.evaluate mit der veroeffentlichten Methodik

   Die Marken (Invalidierung, erste Zielzone) stehen in der Kursskala des
   Stichtags. Fuer den Vergleich mit spaeteren Kursen werden sie mit dem
   Splitfaktor auf die Skala der vollen Reihe gebracht.

   Beobachtungsraster: WEEKLY (letzter Handelstag jeder Woche), versioniert.
   Zusaetzlich wird jeder Stichtag der veroeffentlichten Setup-Historie
   nachgerechnet (parity) - das ist der PIT-Beleg gegen das Produkt.

   Quellen:
     ohne --work-dir   quant/data/market/golden-preview/daily (fuenf Titel im Repository)
     --work-dir DIR    DIR/tiingo/daily/<securityId>.json (kanonische Historie der
                       Pipeline, runner-privat) fuer eine feste Stichprobe (--sample N,
                       Auswahl per sha256(SAMPLE_SEED + Kuerzel), nicht nach Ergebnis)
   Inkrementell: vorhandene Replays werden um neue Stichtage ergaenzt.
   --budget-minutes begrenzt die Laufzeit; der Rest folgt im naechsten Lauf.

   Schreibt quant/data/product/setup-replay-v1/<securityId>.json.gz - nur
   eigene Ableitungen (Setup-Zustand, Marken), keine Kursreihe.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = fileURLToPath(import.meta.url);
export const REPLAY_SCHEMA = "setup-replay-1.0.0";
export const MIN_BARS = 300; /* wie minTechnicalBars der Materialisierung */
export const CADENCE = "WEEKLY";
export const SAMPLE_SEED = "setup-backtest-sample-1";
export function sampleOrder(tickers) {
  const h = (t) => createHash("sha256").update(SAMPLE_SEED + ":" + t).digest("hex");
  return tickers.slice().sort((a, b) => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : 0));
}
const finite = Number.isFinite;

/* Identisch mit ROW_SOURCES in build-setup-observations.mjs. Der Test
   setup-backtest.test.mjs vergleicht beide Listen Schluessel fuer Schluessel. */
export const ROW_SOURCES = {
  technicalTrend: (b) => b.trend?.direction ?? null,
  technicalStructure: (b) => b.structure?.state?.regime ?? null,
  technicalConfirmedStructure: (b) => b.structure?.state?.confirmedRegime ?? null,
  technicalMomentumState: (b) => b.momentum?.state ?? null,
  technicalVolatilityRegime: (b) => b.volatility?.regime ?? null,
  technicalVolumeState: (b) => b.volume?.state ?? null,
  technicalSetupStatus: (b) => b.tradeSetup?.status ?? null,
  technicalEntryStatus: (b) => b.scenarios?.primary?.entryStatus ?? null,
  technicalPrimaryDirection: (b) => b.scenarios?.primary?.direction ?? null,
  technicalDistanceTo52wHigh: (b) => (finite(b.featuresAtCutoff?.distanceTo52wHigh) ? b.featuresAtCutoff.distanceTo52wHigh : null)
};
export function rowOf(bundle) {
  const row = { status: "active" };
  for (const [field, read] of Object.entries(ROW_SOURCES)) { const v = read(bundle); row[field] = v === undefined ? null : v; }
  return row;
}
export function actionsOf(bars) {
  const actions = [];
  for (const bar of bars) {
    if (bar.splitFactor !== 1) actions.push({ type: "split", exDate: bar.date, ratio: bar.splitFactor });
    if (finite(bar.dividend) && bar.dividend > 0) actions.push({ type: "dividend", exDate: bar.date, amount: bar.dividend });
  }
  return actions;
}
/* Letzter Handelstag jeder Kalenderwoche. */
export function weeklyCutoffs(bars, from) {
  const out = [];
  for (let i = from; i < bars.length; i++) {
    const next = bars[i + 1];
    if (!next) { out.push(i); continue; }
    const a = new Date(bars[i].date + "T00:00:00Z"), b = new Date(next.date + "T00:00:00Z");
    if (b.getUTCDay() <= a.getUTCDay() || b - a > 6 * 86400000) out.push(i);
  }
  return out;
}

function replayTitle({ file, cadence, previous, parityDates }) {
  const Analysis = require(join(ROOT, "quant/engines/technical/technical-analysis.js"));
  const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
  const SetupEngine = require(join(ROOT, "quant/engines/setup-engine.js"));
  const methodology = { technical: JSON.parse(readFileSync(join(ROOT, "quant/methodology/technical-v1.json"), "utf8")),
    elliott: JSON.parse(readFileSync(join(ROOT, "quant/methodology/elliott-v1.json"), "utf8")) };
  const setupMethodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/setup-state-v1.json"), "utf8"));
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const bars = payload.bars;
  const meta = { instrumentId: payload.ticker, source: "tiingo", sourceRevision: payload.updatedAt, currency: payload.currency || "USD", exchange: payload.exchange || "US" };
  const full = Canonical.fromPriceBars(bars, actionsOf(bars), meta);
  const SA = full.SPLIT_ADJUSTED, TR = full.TOTAL_RETURN || null;
  const all = cadence === "WEEKLY" ? weeklyCutoffs(bars, MIN_BARS - 1) : bars.map((_, i) => i).filter((i) => i >= MIN_BARS - 1);
  /* Inkrementell: bereits gerechnete Stichtage bleiben, solange die
     Kursskala gleich ist (kein Split seither) und der Stichtag ein
     abgeschlossener Wochenschluss war. */
  const keep = previous && previous.cadence === cadence && previous.engine && previous.engine.mapping === setupMethodology.stateMapping.mappingVersion
    && previous.splitsSeen === bars.filter((b) => b.splitFactor !== 1).length ? previous.rows.slice(0, -1) : [];
  const lastKept = keep.length ? keep[keep.length - 1][0] : "";
  const rows = keep.slice();
  let pitViolations = previous && keep.length ? previous.pitViolations || 0 : 0;
  const one = (i) => {
    const cut = bars.slice(0, i + 1);
    const series = Canonical.fromPriceBars(cut, actionsOf(cut), meta).SPLIT_ADJUSTED;
    let bundle;
    try {
      bundle = Analysis.analyze({ series, benchmarkSeries: null, methodology, options: { elliott: true, annotations: true, includeChartSeries: false } });
    } catch (error) { return [bars[i].date, "UNAVAILABLE", null, null]; }
    if (bundle.dataCutoff !== bars[i].date) pitViolations++;
    const close = series.close[i];
    const obs = SetupEngine.evaluate({ row: rowOf(bundle), close, previous: null, historyDepth: 1, methodology: setupMethodology });
    const f = SA.close[i] / close;
    const inv = bundle.tradeSetup?.analysisInvalidation?.price, tgt = Array.isArray(bundle.tradeSetup?.targets) ? bundle.tradeSetup.targets[0]?.zoneLow : null;
    return [bars[i].date, obs.classification.state || "UNAVAILABLE", finite(inv) ? +(inv * f).toFixed(4) : null, finite(tgt) ? +(tgt * f).toFixed(4) : null,
      finite(inv) ? +inv.toFixed(4) : null, finite(tgt) ? +tgt.toFixed(4) : null];
  };
  const dateIdx = new Map(bars.map((b, i) => [b.date, i]));
  const parity = (parityDates || []).filter((d) => dateIdx.has(d) && dateIdx.get(d) >= MIN_BARS - 1).map((d) => one(dateIdx.get(d)));
  for (const i of all) {
    if (bars[i].date <= lastKept) continue;
    rows.push(one(i).slice(0, 4));
  }
  return {
    schemaVersion: REPLAY_SCHEMA, ticker: payload.ticker, securityId: payload.securityId, cadence,
    engine: { setup: SetupEngine.ENGINE_VERSION, mapping: setupMethodology.stateMapping.mappingVersion, technicalOptions: "elliott:true, annotations:true, benchmark:null" },
    from: bars[0].date, to: bars.at(-1).date, minBars: MIN_BARS, pitViolations, splitsSeen: bars.filter((b) => b.splitFactor !== 1).length,
    columns: ["date", "setupState", "invalidationPrice", "exitPrice"], rows,
    parityColumns: ["date", "setupState", "invalidationPrice", "exitPrice", "invalidationPriceAtCutoff", "exitPriceAtCutoff"], parity,
    /* Keine Kursreihe im Ergebnis: Rohkurse des Anbieters bleiben im
       runner-privaten Speicher (assert-public-data-hygiene.mjs). Die
       Auswertung liest sie zur Laufzeit aus derselben Quelle. */
    priceSource: "RUNTIME_ONLY"
  };
}

if (!isMainThread) {
  parentPort.postMessage(replayTitle(workerData));
} else if (process.argv[1] === SELF) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const workDir = arg("--work-dir", null);
  const cadence = arg("--cadence", CADENCE);
  const out = arg("--out", join(ROOT, "quant/data/product/setup-replay-v1"));
  const budgetMs = parseFloat(arg("--budget-minutes", "0")) * 60000 || Infinity;
  const only = arg("--tickers", null);
  const HIST = join(ROOT, "quant/data/product/setup-observation-history/setup-mapping-1.0.0");
  const parityDates = existsSync(HIST) ? readdirSync(HIST).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort() : [];
  let files;
  if (workDir) {
    const universe = JSON.parse(readFileSync(join(ROOT, "quant/data/universe/market-capability.json"), "utf8")).members;
    const setupUniverse = new Set(Object.keys(JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/setup-lifecycle-v1.json.gz"))).toString("utf8")).rows));
    const bySymbol = new Map(universe.map((m) => [m.s, m.m]));
    const n = parseInt(arg("--sample", "150"), 10);
    const chosen = only ? only.split(",") : sampleOrder([...setupUniverse].filter((t) => bySymbol.has(t))).slice(0, n);
    files = chosen.map((t) => join(workDir, "tiingo", "daily", bySymbol.get(t) + ".json")).filter((f) => existsSync(f));
    console.log("sample", chosen.length, "with history", files.length);
  } else {
    const source = arg("--source", join(ROOT, "quant/data/market/golden-preview/daily"));
    files = readdirSync(source).filter((f) => f.endsWith(".json")).sort().map((f) => join(source, f));
    if (only) { const want = new Set(only.split(",")); files = files.filter((f) => want.has(JSON.parse(readFileSync(f, "utf8")).ticker)); }
  }
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  let next = 0, done = 0;
  const run = () => new Promise((resolve) => {
    const go = () => {
      if (next >= files.length || Date.now() - t0 > budgetMs) return resolve();
      const file = files[next++];
      const secId = JSON.parse(readFileSync(file, "utf8")).securityId;
      const prevFile = join(out, secId + ".json.gz");
      const previous = existsSync(prevFile) ? JSON.parse(gunzipSync(readFileSync(prevFile)).toString("utf8")) : null;
      const w = new Worker(SELF, { workerData: { file, cadence, previous, parityDates } });
      w.once("message", (r) => {
        writeFileSync(join(out, r.securityId + ".json.gz"), gzipSync(JSON.stringify(r)));
        done++;
        console.log(r.ticker, r.rows.length, "Stichtage", "parity", r.parity.length, "pitViolations", r.pitViolations, ((Date.now() - t0) / 1000).toFixed(0) + "s");
        go();
      });
      w.once("error", (e) => { console.error(file, e.message); go(); });
    };
    go();
  });
  await Promise.all(Array.from({ length: Math.min(cpus().length, files.length) }, run));
  console.log("done", done, "of", files.length, ((Date.now() - t0) / 1000).toFixed(0) + "s", Date.now() - t0 > budgetMs ? "(budget reached, continues next run)" : "");
}
