#!/usr/bin/env node
/* V10 SETUP Pfad A, Teil 1: Kann setup-engine.js historische Setups aus damals verfuegbaren Inputs rekonstruieren,
   und reicht dafuer der Research-Frame (createResearchLoader, Wochenschluesse)?

   Eingabeablation auf den einzigen Titeln mit vollstaendiger Tages-OHLCV-Historie im Repository
   (quant/data/market/golden-preview/daily, 5 Titel, ab 2015). Gleiche Technical-Optionen und Zeilenprojektion wie
   scripts/quant/replay-setup-history.mjs (Funktionen von dort importiert, nicht kopiert):
     FULL          Tages-OHLCV, Corporate Actions bis Stichtag, benchmark null (wie Replay)
     FULL_SPY      wie FULL, zusaetzlich SPY-Benchmark (wie Produktion; SPY nur als Schlusskursreihe O=H=L=C)
     NO_VOLUME     Tages-OHLC, Volumen entfernt
     CLOSE_ONLY    nur Tagesschluss (O=H=L=C, kein Volumen) - Informationsgehalt einer Schlusskursreihe
     WEEKLY_FRAME  Wochenschluesse des Research-Frames (O=H=L=C, kein Volumen) als Balken
   Die Ablationen sind Messungen der Input-Abhaengigkeit, keine Studiendaten: kein abgeleiteter Zustand wird
   als Ergebnis verwendet. Zusaetzlich: Paritaet FULL gegen das veroeffentlichte Replay-Artefakt (AAPL).
   Schreibt nur --out. */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const R = await import(join(ROOT, "scripts/quant/replay-setup-history.mjs"));
const Analysis = require(join(ROOT, "quant/engines/technical/technical-analysis.js"));
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const SetupEngine = require(join(ROOT, "quant/engines/setup-engine.js"));
const Loader = require(join(ROOT, "quant/engines/research-weekly-loader.cjs"));
const C = require(join(ROOT, "quant/engines/research-contract.cjs"));
const methodology = { technical: JSON.parse(readFileSync(join(ROOT, "quant/methodology/technical-v1.json"), "utf8")), elliott: JSON.parse(readFileSync(join(ROOT, "quant/methodology/elliott-v1.json"), "utf8")) };
const setupMethodology = JSON.parse(readFileSync(join(ROOT, "quant/methodology/setup-state-v1.json"), "utf8"));
const TITLES = ["ref_AAPL", "ref_JPM", "ref_MSFT", "ref_NVDA", "ref_XOM"];
const VARIANTS = ["FULL_SPY", "NO_VOLUME", "CLOSE_ONLY", "WEEKLY_FRAME"];
const FIELDS = Object.keys(R.ROW_SOURCES);
const argv = process.argv.slice(2), out = argv[argv.indexOf("--out") + 1];
if (!argv.includes("--out") || !out) throw Error("--out REQUIRED");
const every = parseInt(argv.includes("--every") ? argv[argv.indexOf("--every") + 1] : "1", 10);

const spyDoc = JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json"), "utf8"));
const spyBars = spyDoc.points.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null, splitFactor: 1, dividend: 0 }));
const spyFull = Canonical.fromPriceBars(spyBars, [], { instrumentId: "SPY", source: "tiingo-equity", currency: "USD", exchange: "US" }).SPLIT_ADJUSTED;
const load = Loader.createResearchLoader(ROOT, { identityEvidence: true, corporateActionEvidence: true });

function evaluate(bars, i, meta, benchmark) {
  const cut = bars.slice(0, i + 1);
  const series = Canonical.fromPriceBars(cut, R.actionsOf(cut), meta).SPLIT_ADJUSTED;
  let bundle;
  try {
    const bench = benchmark ? Canonical.slice(benchmark, cut.at(-1).date) : null; /* PIT: Benchmark nur bis Stichtag */
    bundle = Analysis.analyze({ series, benchmarkSeries: bench, methodology, options: { elliott: true, annotations: true, includeChartSeries: false } });
  } catch (e) { return { state: "UNAVAILABLE", error: String(e.message).slice(0, 80) }; }
  const row = R.rowOf(bundle), close = series.close[i];
  const obs = SetupEngine.evaluate({ row, close, previous: null, historyDepth: 1, methodology: setupMethodology });
  const inv = bundle.tradeSetup?.analysisInvalidation?.price, tgt = Array.isArray(bundle.tradeSetup?.targets) ? bundle.tradeSetup.targets[0]?.zoneLow : null;
  return { state: obs.classification.state || "UNAVAILABLE", row, inv: Number.isFinite(inv) ? +inv.toFixed(4) : null, tgt: Number.isFinite(tgt) ? +tgt.toFixed(4) : null, f: series.close[i] };
}
const degrade = (bars, kind) => bars.map((b) => kind === "NO_VOLUME" ? { ...b, volume: null } : { ...b, open: b.close, high: b.close, low: b.close, volume: null });

const result = { titles: {}, totals: {} };
const tally = () => ({ compared: 0, stateEqual: 0, levelsEqual: 0, fieldsEqual: Object.fromEntries(FIELDS.map((f) => [f, 0])), confusion: {} });
for (const v of VARIANTS) result.totals[v] = tally();
const parity = { title: "AAPL", artifact: "quant/data/product/setup-replay-v1/ref_AAPL.json.gz", compared: 0, equal: 0, mismatches: [] };
const t0 = Date.now();
for (const id of TITLES) {
  const payload = JSON.parse(readFileSync(join(ROOT, "quant/data/market/golden-preview/daily", id + ".json"), "utf8"));
  const bars = payload.bars, meta = { instrumentId: payload.ticker, source: "tiingo", sourceRevision: payload.updatedAt, currency: "USD", exchange: "US" };
  const cuts = R.weeklyCutoffs(bars, R.MIN_BARS - 1).filter((_, k) => k % every === 0);
  const variantsBars = { NO_VOLUME: degrade(bars, "NO_VOLUME"), CLOSE_ONLY: degrade(bars, "CLOSE_ONLY") };
  let frame = null, frameError = null;
  try { frame = load(id); } catch (e) { frameError = String(e.message).split(":")[0]; }
  const weekly = (frame ? frame.points : []).map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null, splitFactor: 1, dividend: 0 }));
  const weeklyIdx = new Map(weekly.map((b, k) => [b.date, k]));
  const replay = id === "ref_AAPL" ? new Map(JSON.parse(gunzipSync(readFileSync(join(ROOT, parity.artifact))).toString("utf8")).rows.map((r) => [r[0], r])) : null;
  const per = Object.fromEntries(VARIANTS.map((v) => [v, tally()]));
  const fullSA = Canonical.fromPriceBars(bars, R.actionsOf(bars), meta).SPLIT_ADJUSTED; /* Skala der vollen Reihe wie im Replay */
  for (const i of cuts) {
    const d = bars[i].date, base = evaluate(bars, i, meta, null);
    if (replay && replay.has(d)) {
      const r = replay.get(d), f = fullSA.close[i] / base.f;
      const mine = [d, base.state, base.inv === null ? null : +(base.inv * f).toFixed(4), base.tgt === null ? null : +(base.tgt * f).toFixed(4)];
      parity.compared++; if (JSON.stringify(mine) === JSON.stringify(r)) parity.equal++; else if (parity.mismatches.length < 10) parity.mismatches.push({ replay: r, recomputed: mine });
    }
    for (const v of VARIANTS) {
      let x;
      if (v === "FULL_SPY") x = evaluate(bars, i, meta, spyFull);
      else if (v === "WEEKLY_FRAME") { const k = weeklyIdx.get(d); if (k === undefined || k < R.MIN_BARS - 1) continue; x = evaluate(weekly, k, { ...meta, source: "research-weekly-frame" }, null); }
      else x = evaluate(variantsBars[v], i, meta, null);
      for (const t of [per[v], result.totals[v]]) {
        t.compared++; if (x.state === base.state) t.stateEqual++;
        if (x.state === base.state && x.inv === base.inv && x.tgt === base.tgt) t.levelsEqual++;
        for (const f of FIELDS) if (x.row && base.row && x.row[f] === base.row[f]) t.fieldsEqual[f]++;
        const key = base.state + "->" + x.state; t.confusion[key] = (t.confusion[key] || 0) + 1;
      }
    }
  }
  result.titles[id] = { cutoffs: cuts.length, from: bars[cuts[0]].date, to: bars[cuts.at(-1)].date, weeklyFrame: frameError ? { state: "EXCLUDED_BY_LOADER", reason: frameError } : { state: "LOADED", listingId: frame.listingId }, variants: per };
  console.log(id, cuts.length, ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
const share = (t) => ({ ...t, stateAgreement: t.compared ? +(t.stateEqual / t.compared).toFixed(4) : null, levelAgreement: t.compared ? +(t.levelsEqual / t.compared).toFixed(4) : null,
  fieldAgreement: Object.fromEntries(FIELDS.map((f) => [f, t.compared ? +(t.fieldsEqual[f] / t.compared).toFixed(4) : null])) });
for (const v of VARIANTS) result.totals[v] = share(result.totals[v]);
for (const id of TITLES) for (const v of VARIANTS) result.titles[id].variants[v] = share(result.titles[id].variants[v]);
const sha = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const doc = {
  schemaVersion: "quant-v10-setup-reconstruction-feasibility-1.0.0", evidenceKind: "TECHNICAL_PARITY", status: "ANALYSIS_ONLY",
  question: "Rekonstruiert setup-engine.js historische Setups aus damals verfuegbaren Inputs, und genuegt der Research-Frame (Wochenschluesse) als Input?",
  engineInputs: {
    setupEngine: "quant/engines/setup-engine.js evaluate({row, close, previous, historyDepth, methodology})",
    rowFields: FIELDS, rowSource: "Technical-Bundle (quant/engines/technical/technical-analysis.js) ueber ROW_SOURCES (replay-setup-history.mjs = build-setup-observations.mjs)",
    pointInTimeStatesUse: "nur Technical-Felder + Schlusskurs des Stichtags; quantV2.factorEvidence ist in setup-state-v1 als Quelle gelistet, geht aber in keine Kaskadenregel der vier PIT-Zustaende ein",
    pathDependentStates: "ACTIVE/RISK_RISING/INVALIDATED/EXIT sind geschlossen (pathDependentActivation PENDING_HISTORY) und werden weder im Produkt noch in der Rekonstruktion erzeugt",
    technicalNeeds: "Tagesbalken OHLCV (>= 300 Balken, minTechnicalBars), Splits/Dividenden bis Stichtag; Produktion zusaetzlich SPY als Benchmark (relative Staerke -> Szenario-Bias)"
  },
  sources: Object.fromEntries([...TITLES.map((t) => "quant/data/market/golden-preview/daily/" + t + ".json"), ...TITLES.map((t) => "quant/data/market/discover-series-long/" + t + ".json"), "quant/data/market/multi-asset/series/SPY.json", parity.artifact,
    "quant/engines/setup-engine.js", "quant/engines/technical/technical-analysis.js", "scripts/quant/replay-setup-history.mjs", "quant/methodology/setup-state-v1.json", "quant/methodology/technical-v1.json"].map((p) => [p, sha(p)])),
  sampling: { every, cadence: "WEEKLY (letzter Handelstag der Woche), ab Balken " + R.MIN_BARS },
  parityAgainstPublishedReplay: parity, ablation: result,
  runtimeSeconds: Math.round((Date.now() - t0) / 1000), certificationStatus: "NOT_CERTIFIED", productionApproved: false };
doc.reproHash = C.hash({ sources: doc.sources, code: [fileURLToPath(import.meta.url)].map((f) => C.shaFile(f)), every });
writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(JSON.stringify({ parity: { compared: parity.compared, equal: parity.equal }, totals: Object.fromEntries(VARIANTS.map((v) => [v, [result.totals[v].compared, result.totals[v].stateAgreement, result.totals[v].levelAgreement]])) }));
