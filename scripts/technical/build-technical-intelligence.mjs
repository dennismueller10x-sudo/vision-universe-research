#!/usr/bin/env node
/* =========================================================================
   VU Technical Intelligence — Praekomputation der Produktdaten (API v3)

   v3 (Master Mission II): Datenvertrag fuer Chart-Overlays (overlays),
   Strukturklarheit und Evidenz-Status als getrennte Ebenen, Elliott-
   Transparenz (Count Quality, Anwendbarkeit, Erkennungsverzug, Neu-
   zuordnungs-Risiko), Elliott-Persistenz ueber ein kausales Replay und
   Replay-Schnappschuesse (Zeitachse) fuer Indexmitglieder.
   Migration v2 → v3: siehe docs/technical-intelligence/API_V3_MIGRATION.md.

   Die Seiten rechnen nicht; sie lesen, was dieser Build schreibt:

     quant/data/technical-intelligence/v3/
       meta.json                  Versionen, Zaehler, Evidenzstand
       index.json.gz              eine Zeile je Titel (Screener, Listen, Alerts)
       shards/<XX>.json.gz        Ergebnis je Titel (Konsument + Profi + Chart)
       discover-rows.json         fertige Reihen fuer Discover/Startseite
       alerts.json                Ereignisse seit dem letzten Lauf

   Quellen
     • Tagesanalyse: golden-preview (5 Titel) bzw. --work-dir (kanonische
       Historie, gesamtes Universum, in CI)
     • Wochenanalyse: discover-series-long (alle Titel; Wochenschluss, kein
       Volumen) — fuer jeden Titel ohne Tagesanalyse
   Evidenz: quant/data/technical-intelligence/evidence/evidence-1W.json und
   evidence-1D*.json (vom Backtest ti-evidence.mjs). Ohne Datei: keine
   empirischen Zahlen im Produkt (ehrlich "NO_HISTORY").

   Aufruf: node scripts/technical/build-technical-intelligence.mjs [--work-dir DIR] [--limit N]
   ========================================================================= */
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "./lib/ti-data.mjs";
import { analyzeProduct, replaySnapshots, clarityOf, evidenceBadge, overlaysOf, elliottTransparency } from "./lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const Explain = require(join(ROOT, "quant/engines/technical/ti/explain.js"));
const Alerts = require(join(ROOT, "quant/engines/technical/ti/alerts.js"));

const OUT = join(ROOT, "quant/data/technical-intelligence/v3");
const Patterns = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
const EVID = join(ROOT, "quant/data/technical-intelligence/evidence");
const API_VERSION = "vu-ti-api-3.0.0";
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : def; }
function r(v, d = 4) { return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v; }
export function shardKey(ticker) { return (String(ticker).toUpperCase() + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_"); }
function gz(path, obj) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9, mtime: 0 })); }

function evidenceTable(file) {
  if (!existsSync(file)) return null;
  const e = readJson(file);
  return { setups: e.setups, source: file.split("/").pop(), generatedAt: e.generatedAt, universe: e.universe, calibration: { passed: !!(e.calibration && e.calibration.passed), method: e.calibration && e.calibration.method, brier: e.calibration && e.calibration.reliability && e.calibration.reliability.brier } };
}

const RULES = {};
function catalogRule(x) { if (!RULES[x.ruleId]) RULES[x.ruleId] = { class: x.class, statement: String(x.detail || "").replace(/\s*\(.*$/, "").replace(/[-\d.]+ vs\..*$/, "").trim(), source: x.source || null }; }

/** Schlankes Produktobjekt: alles, was Konsument und Profi sehen — keine Rohlisten. */
export function slim(res) {
  const m = res.methods, E = m.elliott;
  const count = (c) => c && { pattern: c.pattern, patternName: c.patternName, variant: c.variant, direction: c.direction, complete: c.complete, currentWave: c.currentWave, nextMove: c.nextMove,
    waves: c.waves.map((w) => ({ label: w.label, notation: w.notation, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status, subdivision: w.subdivision })),
    /* Regeltext und Quelle stehen einmal im Regelkatalog (rules-catalog.json), hier nur Ergebnis. */
    rules: c.rules.map((x) => { catalogRule(x); return { id: x.ruleId, cls: x.class, passed: x.passed }; }), guidelines: c.guidelines, subdivision: c.subdivision,
    invalidation: c.invalidation, revision: c.revision, caps: c.caps, zones: c.projection.zones.slice(0, 6), rank: c.rank, rankComponents: c.rankComponents, source: c.source,
    countQuality: c.countQuality || null, detection: c.detection || null, persistenceKey: c.persistenceKey || null, ruleAudit: c.ruleAudit || null };
  return {
    schemaVersion: res.schemaVersion, symbol: res.symbol, timeframe: res.timeframe, asOf: res.asOf, price: res.price, dataQuality: res.dataQuality,
    outlook: res.outlook, regime: res.regime, scenarios: res.scenarios, confidence: res.confidence, confluence: res.confluence, signature: res.signature,
    evidence: res.evidence, timeframes: res.timeframes, alerts: res.alerts,
    pro: {
      elliott: E && E.primary ? { status: E.status, degrees: E.degrees, structuralScore: E.structuralScore, structuralLevel: E.structuralLevel, clarity: E.clarity, clarityLevel: E.clarityLevel, applicability: E.applicability,
                                  primary: count(E.primary), alternatives: E.alternatives.map((a) => { const c = count(a); delete c.rules; delete c.guidelines; delete c.subdivision; if (c.ruleAudit) c.ruleAudit = { validity: c.ruleAudit.validity, hardRules: c.ruleAudit.hardRules, definitions: c.ruleAudit.definitions, guidelines: { matched: c.ruleAudit.guidelines.matched, total: c.ruleAudit.guidelines.total } }; c.zones = c.zones.slice(0, 3); return c; }), higherDegree: E.higherDegree && { pattern: E.higherDegree.pattern, patternName: E.higherDegree.patternName, current: E.higherDegree.current, waves: E.higherDegree.waves },
                                  historicalMap: E.historicalMap && { coverage: E.historicalMap.coverage, unlabeledLegs: E.historicalMap.unlabeledLegs, patterns: E.historicalMap.patterns.slice(-6) }, ruleSetVersion: E.ruleSetVersion }
                              : { status: E ? E.status : "UNAVAILABLE", reason: E ? E.reason : null, detail: E ? E.detail : null },
      trend: { phase: m.trend.phase, primary: m.trend.primary, secondary: m.trend.secondary, shortTerm: m.trend.shortTerm, stage: m.trend.stage, source: m.trend.source },
      momentum: m.momentum, volatility: m.volatility,
      volume: m.volume.status === "OK" ? { relativeVolume: m.volume.relativeVolume, upDownVolumeRatio: m.volume.upDownVolumeRatio, accumulation: m.volume.accumulation, anchoredVwap: m.volume.anchoredVwap, profile: m.volume.profile, source: m.volume.source } : { status: m.volume.status, detail: m.volume.detail },
      supportResistance: { supports: m.supportResistance.supports, resistances: m.supportResistance.resistances, source: m.supportResistance.source },
      fibonacci: { clusters: m.fibonacci.clusters.slice(0, 6), note: m.fibonacci.note, source: m.fibonacci.source },
      patterns: { patterns: m.patterns.patterns, source: m.patterns.source },
      wyckoff: { status: m.wyckoff.status, schematic: m.wyckoff.schematic, phase: m.wyckoff.phase, range: m.wyckoff.range, events: m.wyckoff.events, note: m.wyckoff.note, source: m.wyckoff.source }
    },
    diagnostics: { engineVersions: res.diagnostics.engineVersions, isProbability: res.diagnostics.isProbability }
  };
}

function chartOf(series, bars) {
  const n = series.length, from = Math.max(0, n - bars);
  const pick = (a) => a.slice(from).map((v) => r(v, 4));
  const closeOnly = !!(series.meta && series.meta.closeOnly);
  /* Reine Schlusskurs-Reihen: O=H=L=C — nur einmal ausliefern. */
  if (closeOnly) return { timeframe: series.timeframe, timestamps: series.timestamps.slice(from), close: pick(series.close), closeOnly: true };
  return { timeframe: series.timeframe, timestamps: series.timestamps.slice(from), open: pick(series.open), high: pick(series.high), low: pick(series.low), close: pick(series.close), closeOnly: false };
}

const CASES = {};
function casesFor(tf, sym) {
  const f = join(EVID, "cases-" + tf + (tf === "1D" ? (existsSync(join(EVID, "cases-1D-universe.json.gz")) ? "-universe" : "-golden") : "") + ".json.gz");
  if (!(f in CASES)) CASES[f] = existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString()).symbols : {};
  return (CASES[f][sym] || []).slice().reverse();
}
function payload(series, out, currency, withReplay) {
  const res = out.res, s = slim(res), E = res.methods.elliott;
  const abstain = !!(E && E.applicability && E.applicability.abstain);
  s.history = casesFor(series.timeframe, res.symbol);
  /* Konsument: Wellen-Satz nur, wenn die Struktur fuer Elliott taugt (sonst ehrlich "Struktur unklar"). */
  s.explain = { summary: Explain.summary(res, currency), wave: abstain ? null : Explain.waveConsumer(E.primary), evidence: Explain.evidenceLine(res), facts: Explain.facts(res, currency) };
  s.clarity = clarityOf(res);
  s.evidenceBadge = evidenceBadge(res);
  s.overlays = overlaysOf(res);
  s.pro.elliottTransparency = elliottTransparency(res, out.replay);
  s.chart = chartOf(series, 260);
  if (withReplay) s.replay = { every: 1, unit: series.timeframe === "1W" ? "Woche" : "Tag", steps: replaySnapshots(series, out.P, out.replay, withReplay, 1),
                               note: "Jeder Schritt zeigt, was die Analyse an diesem Tag mit den damals verfügbaren Daten gezeigt hätte." };
  return s;
}

function indexRow(p) {
  const s = p.scenarios[0] || null, E = p.pro.elliott;
  const dist = s && s.entryZone && p.price.atr ? r((s.direction === "BULLISH" ? p.price.close - s.entryZone.zoneHigh : s.entryZone.zoneLow - p.price.close) / p.price.atr, 2) : null;
  return {
    t: p.symbol, tf: p.timeframe, asOf: p.asOf, close: p.price.close, outlook: p.outlook.label, structure: p.outlook.structure, confidence: p.outlook.confidence, agreement: p.confluence.agreement,
    template: s ? s.template : null, status: s ? s.status : null, direction: s ? s.direction : null,
    entry: s && s.entryZone ? [s.entryZone.zoneLow, s.entryZone.zoneHigh] : null, invalidation: s && s.invalidation ? s.invalidation.price : null,
    t1: s && s.targets && s.targets[0] ? [s.targets[0].zoneLow, s.targets[0].zoneHigh] : null, rr: s ? s.rewardRiskT1 : null, distAtr: dist,
    elliott: E && E.primary ? E.primary.pattern + ":" + (E.primary.complete ? "done" : E.primary.currentWave.label) : null, elliottClarity: E ? E.clarityLevel || null : null,
    elliottApplicable: E && E.applicability ? E.applicability.level : null, countQuality: E && E.primary && E.primary.countQuality ? E.primary.countQuality.level : null,
    relabelRisk: p.pro.elliottTransparency && p.pro.elliottTransparency.relabeling ? p.pro.elliottTransparency.relabeling.risk : null,
    clarity: p.clarity.level, evidence: p.evidenceBadge.level, higherAligned: E && E.primary && E.primary.rankComponents ? E.primary.rankComponents.higherDegree >= 0.8 : null,
    patterns: p.pro.patterns.patterns.filter((x) => x.status !== "FAILED").map((x) => x.type + ":" + x.status), wyckoff: p.pro.wyckoff.phase ? p.pro.wyckoff.schematic + ":" + p.pro.wyckoff.phase : null,
    stage: p.regime.stage, vol: p.regime.volatility, alignment: p.timeframes.alignment, empirical: p.confidence.empirical && p.confidence.empirical.status === "OK" ? { n: p.confidence.empirical.n, hit: p.confidence.empirical.t1HitRate, base: p.confidence.empirical.baselineRate } : null,
    alerts: p.alerts
  };
}

/** Indexmitglieder (S&P 500, Nasdaq-100, Dow) als Relevanz- und Liquiditaetsfilter fuer Consumer-Reihen. */
function indexMembers() {
  const out = {};
  for (const id of ["SP500", "NDX", "DJIA"]) {
    const f = join(ROOT, "quant/data/market/index-membership", id + ".json");
    if (!existsSync(f)) continue;
    (readJson(f).members || []).forEach((m) => { (out[m.symbol] = out[m.symbol] || []).push(id); });
  }
  return out;
}

/** Consumer-Reihen (Discover/Startseite). Regeln offen, Reihenfolge nach Klarheit.
    Nur Indexmitglieder mit Kurs >= 5 $: liquide, bekannte Titel — technische Analyse
    auf illiquiden Werten ist wenig aussagekraeftig (Spreads, Luecken). */
export function discoverRows(allRows) {
  const rows = allRows.filter((x) => x.indexes && x.indexes.length && x.close >= 5);
  const bull = rows.filter((x) => x.direction === "BULLISH");
  const by = (arr, fn) => arr.slice().sort(fn).slice(0, 24).map((x) => x.t);
  return {
    generatedAt: new Date().toISOString(),
    rows: [
      { id: "near-zone", title: "Nahe einer Schlüsselzone", rule: "Aufwärtsszenario, Kurs in der Einstiegszone oder höchstens 1 ATR darüber, Szenario gültig", evidence: "DESCRIPTIVE",
        tickers: by(bull.filter((x) => x.distAtr !== null && x.distAtr <= 1 && x.status !== "INVALIDATED"), (a, b) => b.agreement - a.agreement) },
      { id: "pullback-uptrend", title: "Rücksetzer im Aufwärtstrend", rule: "Übergeordneter Aufwärtstrend intakt, aktuell Korrektur; Aufwärtsszenario", evidence: "DESCRIPTIVE",
        tickers: by(bull.filter((x) => x.structure === "CORRECTION_IN_UPTREND"), (a, b) => (a.distAtr === null ? 99 : Math.abs(a.distAtr)) - (b.distAtr === null ? 99 : Math.abs(b.distAtr))) },
      { id: "clearest", title: "Klarste Strukturen", rule: "Strukturklarheit „klar“: Verfahren gleichgerichtet, kein gemischtes Bild", evidence: "DESCRIPTIVE",
        tickers: by(rows.filter((x) => x.clarity === "CLEAR" && x.outlook !== "MIXED"), (a, b) => Math.abs(b.agreement) - Math.abs(a.agreement)) },
      { id: "breakouts", title: "Ausbrüche beobachten", rule: "Chartformation mit bestätigtem Ausbruch oder gehaltenem Rücktest, Aufwärtsszenario", evidence: "DESCRIPTIVE",
        tickers: by(rows.filter((x) => x.patterns.some((p) => /BREAKOUT/.test(p)) && x.direction === "BULLISH"), (a, b) => b.agreement - a.agreement) },
      { id: "clear-elliott", title: "Klare Elliott-Strukturen", rule: "Elliott anwendbar (hoch), Count Quality hoch, geringes Neuzuordnungs-Risiko — experimentell, kein belegter Prognosevorteil", evidence: "EXPERIMENTAL",
        tickers: by(rows.filter((x) => x.elliottApplicable === "HIGH" && x.countQuality === "HIGH" && x.relabelRisk === "LOW"), (a, b) => Math.abs(b.agreement) - Math.abs(a.agreement)) },
      { id: "higher-degree", title: "Großes und kleines Bild gleichgerichtet", rule: "Elliott-Zählung passt zum höheren Grad; Wochen- und Tagesbild nicht gegenläufig", evidence: "EXPERIMENTAL",
        tickers: by(rows.filter((x) => x.higherAligned && x.alignment !== "COUNTER_TREND" && x.elliottApplicable !== "LOW" && x.outlook !== "MIXED"), (a, b) => Math.abs(b.agreement) - Math.abs(a.agreement)) },
      { id: "reversal", title: "Mögliche Trendwenden", rule: "Abwärtstrend, aber bullische Formation in Bildung oder Ausbruch bzw. Wyckoff-Akkumulation ab Phase C", evidence: "DESCRIPTIVE",
        tickers: by(rows.filter((x) => (x.structure === "DOWNTREND_ADVANCING" || x.structure === "RALLY_IN_DOWNTREND") && (x.patterns.some((p) => /DOUBLE_BOTTOM|INVERSE_HEAD|CUP/.test(p)) || /ACCUMULATION:(C|D)/.test(x.wyckoff || ""))), (a, b) => b.agreement - a.agreement) }
    ],
    universe: "Mitglieder von S&P 500, Nasdaq-100 oder Dow Jones mit Kurs ab 5 $",
    note: "Reihen beschreiben technische Lagen, keine Empfehlungen. Für keine Reihe ist ein Prognosevorteil belegt (siehe Evidenzbericht).",
    evidenceLevels: { DESCRIPTIVE: "Beschreibt die Lage, ohne Prognoseanspruch", EXPERIMENTAL: "Neue Analyse, Wirkung nicht belegt" }
  };
}

/** Kompakte Kennzahlen der Evidenzstudie fuer die Methodikseite (nur reale Zahlen aus den Berichten). */
function evidenceSummary() {
  const out = { schemaVersion: API_VERSION, generatedAt: new Date().toISOString(), studies: {} };
  for (const [key, file] of [["weekly", "evidence-1W.json"], ["dailyGolden", "evidence-1D-golden.json"], ["dailyUniverse", "evidence-1D-universe.json"]]) {
    const f = join(EVID, file); if (!existsSync(f)) continue;
    const e = readJson(f), pick = (a) => a && { n: a.n, symbols: a.symbols, t1HitRate: a.t1HitRate, t1Ci: a.t1Ci, baselineRate: a.baselineRate, lift: a.lift, liftCiLow: a.liftCiLow, liftCiHigh: a.liftCiHigh, meanReturn: a.meanReturn, medianBarsToT1: a.medianBarsToT1, fillRate: a.fillRate };
    out.studies[key] = {
      file, generatedAt: e.generatedAt, timeframe: e.timeframe, universe: e.universe, rules: e.rules,
      overall: pick(e.overall), byPeriod: Object.fromEntries(Object.entries(e.byPeriod).map(([k, v]) => [k, pick(v)])),
      byConfidence: Object.fromEntries(Object.entries(e.byConfidence).map(([k, v]) => [k, pick(v)])),
      byTemplate: Object.fromEntries(Object.entries(e.byTemplate).map(([k, v]) => [k, pick(v)])),
      byMarketRegime: Object.fromEntries(Object.entries(e.byMarketRegime).map(([k, v]) => [k, pick(v)])),
      calibration: { passed: e.calibration.passed, brierSkill: e.calibration.brierSkill, maxReliabilityGap: e.calibration.maxReliabilityGap, gate: e.calibration.gate, testN: e.calibration.testN },
      directionHoldout: e.directionAblation && e.directionAblation.holdout,
      elliott: e.elliott && { bySetup: e.elliott.bySetup, byPeriod: e.elliott.byPeriod, bySubdivision: e.elliott.bySubdivision, byHigherDegree: e.elliott.byHigherDegree, note: e.elliott.note },
      fibonacci: e.fibonacci && { n: e.fibonacci.n, levels: e.fibonacci.levels }
    };
  }
  /* Elliott-Validierung (Master Mission II): vorab registrierte Hypothesen der Bestaetigungsstichprobe */
  const EVAL = join(ROOT, "quant/data/technical-intelligence/elliott-validation");
  for (const [key, file] of [["confirmatory", "report-confirmatory-v22-sticky.json"], ["exploratory", "report-exploratory-v22-sticky.json"]]) {
    const f = join(EVAL, file); if (!existsSync(f)) continue;
    const v = readJson(f);
    out.elliottValidation = out.elliottValidation || {};
    out.elliottValidation[key] = { file, engine: v.meta.engine, generatedAt: v.generatedAt, events: v.funnel.genericEvents, issuers: v.funnel.symbolsWithEvents,
      hypotheses: Object.fromEntries(Object.entries(v.preregisteredHypotheses).map(([k, h]) => [k, { name: h.name, est: h.est, lo: h.lo, hi: h.hi, confirmed: h.confirmed }])),
      latency: v.latency.all, stability: { relabelRate: v.stability.relabelRate, medianCountLifetimeBars: v.stability.medianCountLifetimeBars } };
  }
  return out;
}

async function main() {
  const limit = +arg("limit", "0"), workDir = arg("work-dir", null);
  const ev1W = evidenceTable(join(EVID, "evidence-1W.json"));
  const ev1D = evidenceTable(join(EVID, workDir ? "evidence-1D-universe.json" : "evidence-1D-golden.json")) || evidenceTable(join(EVID, "evidence-1D-golden.json"));
  const shards = {}, rows = [], t0 = Date.now(), dailyDone = new Set();
  const members = indexMembers();
  const add = (p) => { const k = shardKey(p.symbol); (shards[k] = shards[k] || {})[p.symbol] = p; const row = indexRow(p); row.indexes = members[p.symbol] || []; rows.push(row); };
  // ---- Tagesanalyse
  const dailyDir = workDir ? join(workDir, "tiingo", "daily") : join(ROOT, "quant/data/market/golden-preview/daily");
  let dailyFiles = existsSync(dailyDir) ? readdirSync(dailyDir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort() : [];
  if (limit) dailyFiles = dailyFiles.slice(0, limit);
  for (const f of dailyFiles) {
    try {
      const j = readJson(join(dailyDir, f)), series = dailySeriesFromPayload(j, j.ticker);
      if (series.length < 300) continue;
      const opts = { evidenceTable: ev1D, weeklyEvidenceTable: ev1W, calibration: ev1D && ev1D.calibration, symbol: j.ticker };
      add(payload(series, analyzeProduct(series, opts), "$", opts)); dailyDone.add(j.ticker);
    } catch (e) { process.stderr.write("daily " + f + ": " + e.message + "\n"); }
  }
  // ---- Wochenanalyse fuer alle uebrigen Titel
  const wdir = join(ROOT, "quant/data/market/discover-series-long");
  let wfiles = readdirSync(wdir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort();
  if (limit) wfiles = wfiles.slice(0, limit * 20);
  let weekly = 0, skipped = 0;
  for (const f of wfiles) {
    try {
      const j = readJson(join(wdir, f));
      if (dailyDone.has(j.ticker)) continue;
      const series = weeklySeriesFromPoints(j.points || [], j.ticker);
      if (series.length < 160) { skipped++; continue; }
      const opts = { evidenceTable: ev1W, calibration: ev1W && ev1W.calibration, symbol: j.ticker };
      add(payload(series, analyzeProduct(series, opts), j.currency === "USD" || !j.currency ? "$" : j.currency, members[j.ticker] ? opts : null)); weekly++;
    } catch (e) { skipped++; process.stderr.write("weekly " + f + ": " + e.message + "\n"); }
  }
  // ---- Alerts gegen den vorherigen Index
  let prev = {};
  const idxPath = join(OUT, "index.json.gz");
  if (existsSync(idxPath)) { try { JSON.parse(gunzipSync(readFileSync(idxPath)).toString()).rows.forEach((x) => { prev[x.t] = x.alerts; }); } catch (e) { prev = {}; } }
  const alerts = [];
  /* Erster Lauf ohne vorherigen Index = Ausgangszustand, keine Ereignisse. */
  const hasPrev = Object.keys(prev).length > 0;
  if (hasPrev) rows.forEach((x) => Alerts.diff(prev[x.t] || null, x.alerts, { symbol: x.t, asOf: x.asOf }).forEach((a) => alerts.push(a)));
  // ---- schreiben
  mkdirSync(join(OUT, "shards"), { recursive: true });
  Object.entries(shards).forEach(([k, inst]) => gz(join(OUT, "shards", k + ".json.gz"), { schemaVersion: API_VERSION, shard: k, instruments: inst }));
  gz(idxPath, { schemaVersion: API_VERSION, generatedAt: new Date().toISOString(), rows });
  writeFileSync(join(OUT, "rules-catalog.json"), JSON.stringify({ schemaVersion: API_VERSION, ruleSet: Patterns.RULE_SET_VERSION, rules: RULES }, null, 1));
  writeFileSync(join(OUT, "discover-rows.json"), JSON.stringify(discoverRows(rows), null, 1));
  writeFileSync(join(OUT, "alerts.json"), JSON.stringify({ schemaVersion: API_VERSION, generatedAt: new Date().toISOString(), previousIndex: Object.keys(prev).length > 0, events: alerts.slice(0, 2000) }, null, 1));
  const meta = {
    schemaVersion: API_VERSION, resultSchema: TI.SCHEMA_VERSION, bundle: TI.BUNDLE_VERSION, generatedAt: new Date().toISOString(),
    methodology: "quant/methodology/technical-intelligence-v2.json",
    counts: { daily: dailyDone.size, weekly, skipped, shards: Object.keys(shards).length },
    sources: { daily: workDir ? "kanonische Tageshistorie (work-dir)" : "golden-preview (5 Titel)", weekly: "discover-series-long (Wochenschluss, ohne Volumen)" },
    evidence: { weekly: ev1W ? { file: ev1W.source, generatedAt: ev1W.generatedAt, calibrationPassed: ev1W.calibration.passed } : null, daily: ev1D ? { file: ev1D.source, generatedAt: ev1D.generatedAt, calibrationPassed: ev1D.calibration.passed } : null },
    paths: Object.fromEntries(Object.entries({ evidenceSummary: "evidence-summary.json", rulesCatalog: "rules-catalog.json", index: "index.json.gz", shard: "shards/<XX>.json.gz", discoverRows: "discover-rows.json", alerts: "alerts.json", methodEvidence: "method-evidence.json" }).map(([k, v]) => [k, "/quant/data/technical-intelligence/v3/" + v])),
    migration: "docs/technical-intelligence/API_V3_MIGRATION.md",
    runtimeSec: Math.round((Date.now() - t0) / 1000)
  };
  writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  writeFileSync(join(OUT, "evidence-summary.json"), JSON.stringify(evidenceSummary(), null, 1));
  const me = join(ROOT, "quant/methodology/technical-method-evidence.json");
  if (existsSync(me)) writeFileSync(join(OUT, "method-evidence.json"), JSON.stringify(Object.assign({ schemaVersion: API_VERSION }, readJson(me)), null, 1));
  console.log(JSON.stringify(meta.counts), meta.runtimeSec + " s", alerts.length + " Alerts");
}

if (process.argv[1] && process.argv[1].endsWith("build-technical-intelligence.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
