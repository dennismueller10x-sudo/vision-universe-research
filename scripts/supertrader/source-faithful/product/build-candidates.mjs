#!/usr/bin/env node
/**
 * Supertrader 8.0 – Kandidaten-Pipeline (Producer-Entwurf, NICHT registriert, KEIN Workflow):
 *   Aktienuniversum -> Datenqualität -> strategiebezogene Merkmale -> Erkennung -> Evidenz -> zulässige Stufe -> Datensatz
 *
 *   node scripts/supertrader/source-faithful/product/build-candidates.mjs --out <dir> [--as-of YYYY-MM-DD] [--tickers A,B]
 *        [--previous <dir>] [--stats <file>]
 *
 * --out ist Pflicht: der Producer schreibt nie in ein committetes Artefakt (CLAUDE.md "Tests"). Eine Laufintegration
 * (Workflow, domains.json, supertrader/data) ist ausdrücklich NICHT Teil dieses Moduls; Test
 * SF-PRODUCT-NO-RUN-INTEGRATION hält das fest (Aktivierung = Owner-Entscheidung, docs/SUPERTRADER_8_PRODUCT_INTEGRATION.md).
 *
 * Deterministisch: dieselben Eingaben ergeben bitgleiche Dateien (keine Uhrzeit im Ergebnis; Laufzeit nur in --stats).
 * --as-of schneidet alle Reihen auf Balken <= Datum (Reproduktion früherer Stände, Lookahead-Tests).
 * Ausgabe:
 *   <out>/index.json             Übersicht: Strategien, Zählungen, kompakte Kandidatenzeilen (für Übersicht / Filter)
 *   <out>/strategy/<Cxx>.json    je Strategie: Analyseansichten + Vertragsdatensätze
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { loadUniverse, loadEodSecurities, marketAsOf, createCalendar, loadContinuity, loadWeeklyCloses, inputsSha256, EOD_ADAPTER_VERSION, SOURCES, ROOT } from './eod-adapter.mjs';
import { assessSecurity, assessStrategyHistory, DQ_CONTRACT_VERSION, STRATEGY_DATA_NEEDS } from './data-quality.mjs';
import { DETECTORS, DETECTORS_VERSION, commonFeatures, momentumIndex } from './detectors.mjs';
import { buildCandidate, RECORDS_VERSION, ENGINES } from './records.mjs';
import { rankStrategy, RANKING_VERSION, SORT_KEYS } from './ranking.mjs';
import { STRATEGY_CATALOG, CATALOG_VERSION, RULE_LABELS, STAGE_LABELS } from './catalog.mjs';
import { loadSf6Readiness, stageCeilings, candidateContractSha256, ruleClasses, CANDIDATE_SCHEMA, STAGE_ORDER } from './candidate-contract.mjs';
import { createRequire } from 'node:module';
const Identity = createRequire(import.meta.url)('../../../../core/identity.js');
import { benchmarkWeekly } from '../methods/weinstein.mjs';

export const PIPELINE_VERSION = 'sf8-candidate-pipeline-1.0.0';
export const OUTPUT_SCHEMA = 'supertrader-sf8-candidates-1.0.0';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function loadBenchmark(root, asOf) {
  const p = path.join(root, 'quant/data/market/multi-asset/series/SPY.json');
  if (!fs.existsSync(p)) return null;
  const pts = JSON.parse(fs.readFileSync(p, 'utf8')).points.filter(([d]) => String(d).slice(0, 10) <= asOf);
  const daily = pts.map(([d, c]) => ({ date: String(d).slice(0, 10), open: c, high: c, low: c, close: c, volume: 0 }));
  return daily.length ? benchmarkWeekly(daily) : null;
}

/**
 * Reiner Kern der Pipeline (ohne Schreiben): liefert { index, strategies } für eine geladene Eingabe.
 * Eingabe: securities (Research-Form mit meta), asOf, calendar, continuity, weeklyOf(id), bench, readiness.
 */
export function runPipeline({ securities: input, rejectedInputs = [], asOf, calendar, continuity, weeklyOf = () => null, bench = null, readiness = loadSf6Readiness(), sourceFiles = [], universeInfo = null }) {
  // kanonische Reihenfolge (Ticker), damit Hashes und Zählungen nicht von der Ladereihenfolge abhängen
  const securities = [...input].sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const nextSession = calendar.nextSession(asOf);
  const ceilings = new Map(stageCeilings(readiness).map((c) => [c.strategyId, c.maxStage]));
  const dqById = new Map(), dqCounts = { PASS: 0, CAP: 0, FAIL: 0 }, failReasons = {};
  for (const s of securities) {
    const dq = assessSecurity(s, { asOf, calendar, weekly: weeklyOf(s.id), continuity });
    dqById.set(s.id, dq); dqCounts[dq.status]++;
    if (dq.status === 'FAIL') for (const c of dq.checks.filter((x) => x.status === 'FAIL')) failReasons[c.id] = (failReasons[c.id] || 0) + 1;
  }
  const evaluable = securities.filter((s) => dqById.get(s.id).status !== 'FAIL');
  // KK-005-Querschnitt nur über bewertbare Titel mit Balken am Stichtag (fail closed: veraltete Titel zählen nicht mit)
  const momentum = momentumIndex(evaluable.filter((s) => dqById.get(s.id).checks.some((c) => c.id === 'LIQUIDITY_RESEARCH_UNIVERSE' && c.status === 'PASS')), asOf);
  const views = new Map(STRATEGY_CATALOG.map((c) => [c.strategyId, []])), records = new Map(STRATEGY_CATALOG.map((c) => [c.strategyId, []]));
  const rejected = [], historyShort = {}, detectedCount = {}, readingsOf = new Map();
  for (const s of evaluable) {
    const dq = dqById.get(s.id), weekly = weeklyOf(s.id), common = commonFeatures(s.bars), ish = inputsSha256(s);
    for (const c of STRATEGY_CATALOG) {
      const h = assessStrategyHistory(c.strategyId, s.bars);
      if (h.status !== 'PASS') { historyShort[c.strategyId] = (historyShort[c.strategyId] || 0) + 1; continue; }
      const det = DETECTORS[c.strategyId](s, { dq, weekly, momentum, nextSession, benchWeekly: bench, asOf, listingStart: s.meta?.listingStart ?? null });
      if (!det.detected) continue;
      detectedCount[c.strategyId] = (detectedCount[c.strategyId] || 0) + 1;
      const r = buildCandidate({ det, sec: s, dq, asOf, nextSession, inputsSha256: ish, readiness, ceilings, common, meta: s.meta });
      if (!r) continue;
      if (r.rejected) { rejected.push(r.rejected); continue; }
      if (!readingsOf.has(c.strategyId)) readingsOf.set(c.strategyId, det.ambiguousReadings);
      views.get(c.strategyId).push(r.view); records.get(c.strategyId).push(r.record);
    }
  }
  const strategies = [], rows = [];
  for (const c of STRATEGY_CATALOG) {
    const { order, views: ranked } = rankStrategy(c.strategyId, views.get(c.strategyId));
    const recById = new Map(records.get(c.strategyId).map((r) => [r.recordId, r]));
    const byStage = Object.fromEntries(STAGE_ORDER.slice(0, 3).map((st) => [st, ranked.filter((v) => v.stage === st).length]));
    const cand = readiness.candidates.find((x) => x.strategyId === c.strategyId) || {};
    strategies.push({
      ...c, ceiling: ceilings.get(c.strategyId), primaryState: cand.primaryState ?? null, measurementClass: cand.measurementClass ?? null, liveReadiness: 'LIVE_NOT_APPROVED',
      engine: ENGINES[c.strategyId], dataNeeds: STRATEGY_DATA_NEEDS[c.strategyId], sortOrder: order,
      rules: (({ mechanicalSetupRules, discretionaryRules, ambiguousRules, dataBlockedRules }) => ({ mechanicalSetupRules, discretionaryRules, ambiguousRules, dataBlockedRules }))(ruleClasses(c.strategyId)),
      readings: readingsOf.get(c.strategyId) ?? [],
      counts: { detected: detectedCount[c.strategyId] || 0, published: ranked.length, byStage, historyTooShort: historyShort[c.strategyId] || 0, rejected: rejected.filter((r) => r.strategyId === c.strategyId).length },
      detail: { asOf, views: ranked, records: ranked.map((v) => recById.get(v.recordId)) },
    });
    for (const v of ranked) rows.push({ c: v.candidateId, t: v.ticker, n: v.companyName, s: v.stage, r: v.rank, pd: v.pivot?.distance ?? null, v: v.trend?.volumeVs50d ?? null, m: v.trend?.ret63 ?? null, q: v.dataQuality.status, sh: v.shard, x: v.close });
  }
  const inputSha = sha(securities.map((s) => `${s.id}:${inputsSha256(s)}`).join('\n'));
  const index = {
    schema: OUTPUT_SCHEMA, asOf, nextSession,
    versions: { pipeline: PIPELINE_VERSION, adapter: EOD_ADAPTER_VERSION, dataQuality: DQ_CONTRACT_VERSION, detectors: DETECTORS_VERSION, records: RECORDS_VERSION, ranking: RANKING_VERSION, catalog: CATALOG_VERSION, candidateContract: CANDIDATE_SCHEMA, candidateContractSha256: candidateContractSha256(), readinessCriteria: readiness.criteriaVersion },
    status: { liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', validatedTradeSignal: 'LOCKED_FOR_ALL_13', orders: 'NONE' },
    inputs: { sources: SOURCES, sourceFiles, inputsSha256: inputSha, universe: universeInfo },
    dataQuality: { securities: securities.length, rejectedInputs: rejectedInputs.length, ...dqCounts, failReasons: Object.fromEntries(Object.entries(failReasons).sort()) },
    ruleLabels: RULE_LABELS, stageLabels: STAGE_LABELS,
    sortKeys: Object.fromEntries(Object.entries(SORT_KEYS).map(([k, s]) => [k, { label: s.label, dir: s.dir }])),
    counts: { candidates: rows.length, byStage: Object.fromEntries(STAGE_ORDER.slice(0, 3).map((st) => [st, rows.filter((r) => r.s === st).length])), validatedTradeSignal: 0, rejectedRecords: rejected.length },
    strategies: strategies.map(({ detail, ...rest }) => rest),
    rejectedRecords: rejected.slice(0, 200),
    candidates: rows,
  };
  return { index, strategies };
}

/** Neue / entfallene / umgestufte Kandidaten gegen einen früheren Lauf (nur wenn --previous gegeben ist). */
export function diffAgainst(prevIndex, index) {
  if (!prevIndex?.candidates) return { status: 'NO_PREVIOUS_RUN' };
  const key = (r) => `${r.c}|${r.t}`, prev = new Map(prevIndex.candidates.map((r) => [key(r), r])), cur = new Map(index.candidates.map((r) => [key(r), r]));
  const added = [], removed = [], restaged = [];
  for (const [k, r] of cur) { const p = prev.get(k); if (!p) added.push(k); else if (p.s !== r.s) restaged.push({ key: k, from: p.s, to: r.s }); }
  for (const k of prev.keys()) if (!cur.has(k)) removed.push(k);
  return { status: 'COMPARED', previousAsOf: prevIndex.asOf, added, removed, restaged };
}

/**
 * Schreibt index.json, strategy/<Cxx>.json (Ansichten), ticker/<shard>.json (Ansichten je core/identity.js#shardKey)
 * und records/<Cxx>.json (Vertragsdatensätze, Audit). Sortierte Schlüssel, keine Uhrzeit: bitgleich reproduzierbar.
 */
export function writeOutputs(out, { index, strategies }) {
  for (const d of ['strategy', 'ticker', 'records']) { fs.rmSync(path.join(out, d), { recursive: true, force: true }); fs.mkdirSync(path.join(out, d), { recursive: true }); }
  const w = (rel, obj) => fs.writeFileSync(path.join(out, rel), JSON.stringify(obj) + '\n');
  w('index.json', index);
  // kleine Übersicht für die Startseite: Zählungen, Strategien, je Strategie die ersten fünf Kandidaten
  const { candidates, rejectedRecords, ...head } = index;
  w('summary.json', { ...head, tickerShards: [...byShardKeys(strategies)].sort(), top: Object.fromEntries(strategies.map((s) => [s.candidateId, candidates.filter((c) => c.c === s.candidateId).sort((a, b) => a.r - b.r).slice(0, 5)])) });
  const byShard = new Map();
  for (const s of strategies) {
    w(`strategy/${s.candidateId}.json`, { schema: OUTPUT_SCHEMA, strategyId: s.strategyId, candidateId: s.candidateId, asOf: s.detail.asOf, views: s.detail.views });
    w(`records/${s.candidateId}.json`, { schema: OUTPUT_SCHEMA, strategyId: s.strategyId, candidateId: s.candidateId, asOf: s.detail.asOf, records: s.detail.records });
    for (const v of s.detail.views) { const k = Identity.shardKey(v.ticker); if (!byShard.has(k)) byShard.set(k, []); byShard.get(k).push(v); }
  }
  for (const k of [...byShard.keys()].sort()) w(`ticker/${k}.json`, { schema: OUTPUT_SCHEMA, asOf: index.asOf, shard: k, views: byShard.get(k).sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : a.candidateId < b.candidateId ? -1 : 1)) });
}

/** Ticker-Shards mit mindestens einem Kandidaten (die Oberfläche fragt nur diese an: kein 404 für unbekannte Titel). */
const byShardKeys = (strategies) => new Set(strategies.flatMap((s) => s.detail.views.map((v) => Identity.shardKey(v.ticker))));

/** Schneidet eine geladene Eingabe auf Balken <= asOf (Lookahead-Schutz bei Reproduktion). */
export const truncateTo = (securities, asOf) => securities.map((s) => ({ ...s, bars: s.bars.filter((b) => b.date <= asOf) })).filter((s) => s.bars.length);

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const out = arg('--out'); if (!out) { console.error('--out required'); process.exit(2); }
  const resolvedOut = path.resolve(out);
  // nie in das Repository schreiben (Allowlist: nur Pfade außerhalb; Review L3)
  const inside = (p) => p === ROOT || p.startsWith(ROOT + path.sep);
  if (inside(resolvedOut)) { console.error('REFUSED_OUT_INSIDE_COMMITTED_TREE'); process.exit(2); }
  if (arg('--stats') && inside(path.resolve(arg('--stats')))) { console.error('REFUSED_STATS_INSIDE_COMMITTED_TREE'); process.exit(2); }
  const t0 = Date.now(), lap = {};
  const universe = loadUniverse();
  const tickers = arg('--tickers') ? arg('--tickers').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
  const loaded = loadEodSecurities({ universe, tickers });
  lap.load = Date.now() - t0;
  let securities = loaded.securities;
  const asOf = arg('--as-of') || marketAsOf(securities);
  if (arg('--as-of')) securities = truncateTo(securities, asOf);
  const calendar = createCalendar(), continuity = loadContinuity();
  const res = runPipeline({ securities, rejectedInputs: loaded.rejected, asOf, calendar, continuity, weeklyOf: (id) => loadWeeklyCloses(id), bench: loadBenchmark(ROOT, asOf), sourceFiles: loaded.sourceFiles, universeInfo: { id: universe.universeId, symbols: universe.symbols.size, excludedNonStock: universe.excluded.length, withDailySeries: loaded.securities.length } });
  lap.pipeline = Date.now() - t0 - lap.load;
  const prev = arg('--previous') && fs.existsSync(path.join(arg('--previous'), 'index.json')) ? JSON.parse(fs.readFileSync(path.join(arg('--previous'), 'index.json'), 'utf8')) : null;
  res.index.changes = diffAgainst(prev, res.index);
  writeOutputs(resolvedOut, res);
  lap.total = Date.now() - t0;
  const dirBytes = (d) => fs.readdirSync(path.join(resolvedOut, d)).reduce((a, f) => a + fs.statSync(path.join(resolvedOut, d, f)).size, 0);
  const bytes = { summary: fs.statSync(path.join(resolvedOut, 'summary.json')).size, index: fs.statSync(path.join(resolvedOut, 'index.json')).size, strategy: dirBytes('strategy'), ticker: dirBytes('ticker'), records: dirBytes('records') };
  const stats = { asOf, ms: lap, securities: securities.length, candidates: res.index.counts, bytes, networkRequests: 0, node: process.version };
  if (arg('--stats')) fs.writeFileSync(arg('--stats'), JSON.stringify(stats, null, 1) + '\n');
  console.log(`[sf8-candidates] asOf ${asOf}: ${res.index.counts.candidates} Kandidaten ${JSON.stringify(res.index.counts.byStage)}, ${securities.length} Titel, ${lap.total} ms, ${JSON.stringify(bytes)} Bytes`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
