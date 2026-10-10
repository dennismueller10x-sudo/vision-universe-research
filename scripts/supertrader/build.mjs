#!/usr/bin/env node
// Supertrader — Build der Strategie- und Signalartefakte.
//
// Liest AUSSCHLIESSLICH bestehende kanonische Artefakte (read-only):
//   discover/data/stock-index/US_REAL.json            Produktuniversum (Discovery)
//   discover/data/stocks/US_REAL/<SYM>.json            Kennzahlen/Fundamentals (Anzeige)
//   quant/data/product/technical-signals-v1/*.json.gz  Tages-OHLCV (~1 Jahr), kanonische Materialisierung
//   quant/data/market/discover-series-long/ref_*.json  Wochenschlusskurse (lange Historie)
//   quant/data/market/multi-asset/series/SPY.json      Benchmark
//   quant/data/product/market-regime-v1.json           Marktregime
//   quant/data/market/freshness/health.json            Marktsitzung / Frische
//   quant/data/product/sic-peer-taxonomy-v1.json       SIC-Klassifikation
//   + Abdeckungsmessung (Security Master, Index-Historie, PIT, Intraday)
//
// Schreibt ausschliesslich nach supertrader/. Keine Anbieterabrufe, keine
// Secrets, keine zweite Normalisierung: Supertrader rechnet nur Strategie-
// Regeln auf den bereits veroeffentlichten Reihen.
//
// Aufruf: node scripts/supertrader/build.mjs [--root=.] [--out=supertrader] [--check]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
// Die eine securityId-Regel des Company Master (company-master.js#legacySecurityId,
// byte-gleich zu core/identity.js): BRK-A liegt als ref_BRK_A, nicht ref_BRK-A.
// Vorher bildete der Build `ref_${symbol}` roh - Wochencharts fuer BRK-A, MOG-A,
// PBR-A und BF-B zeigten auf Dateien, die es nicht gibt (Plattform-Audit 03.10.2026).
const CompanyMaster = createRequire(import.meta.url)('../../quant/engines/company-master.js');
export const weeklySeriesId = (symbol) => CompanyMaster.legacySecurityId(symbol);
import { computeIndicators, percentileRanks, isoWeekKey, sma } from './engine/indicators.mjs';
import { buildWeekly } from './engine/weekly.mjs';
import { simulate, rescaleSignal } from './engine/simulator.mjs';
import { STATES, STATE_LABELS, TERMINAL, PENDING, PHASES, phaseOf } from './engine/lifecycle.mjs';
import { describeExecution } from './engine/execution.mjs';
import { evaluateGates, GATE_DEFS, MIN_HISTORY_YEARS } from './engine/gates.mjs';
import { PORTFOLIO_DEFAULTS } from './engine/backtest.mjs';
import kkBreakout from './engine/strategies/kk-breakout.mjs';
import darvas from './engine/strategies/darvas.mjs';
import minervini from './engine/strategies/minervini.mjs';
import weinstein from './engine/strategies/weinstein.mjs';
import greenblatt from './engine/strategies/greenblatt.mjs';
import donchian from './engine/strategies/donchian.mjs';
import kkBreakout2 from './engine/strategies/kk-breakout-v2.mjs';
import kkBreakout3 from './engine/strategies/kk-breakout-v3.mjs';
import kkBreakout31 from './engine/strategies/kk-breakout-v31.mjs';
import kkBreakout32 from './engine/strategies/kk-breakout-v32.mjs';
import darvas302 from './engine/strategies/darvas-v302.mjs';
import donchian201 from './engine/strategies/donchian-v201.mjs';
import donchian202 from './engine/strategies/donchian-v202.mjs';
import weinstein4 from './engine/strategies/weinstein-v4.mjs';
import { marketOkMap } from './validation/portfolio.mjs';
import donchian2 from './engine/strategies/donchian-v2.mjs';
import darvas3 from './engine/strategies/darvas-v3.mjs';
import darvas301 from './engine/strategies/darvas-v301.mjs';
import weinstein3 from './engine/strategies/weinstein-v3.mjs';
import darvas2 from './engine/strategies/darvas-v2.mjs';
import minervini2 from './engine/strategies/minervini-v2.mjs';
import weinstein2 from './engine/strategies/weinstein-v2.mjs';
import { fidelityFor, FIDELITY_VERSION, RULE_CLASS, SOURCE_ACCESS, PRODUCT_STATUS as FIDELITY_STATUS } from './fidelity.mjs';
import { buildModelPortfolio, portfolioConfig, MODEL_PORTFOLIO_VERSION } from './model-portfolio.mjs';
import { runTrend52Live, trend52View } from './trend52-live.mjs';
import { PROCESS_CHAIN, STEPS as PROCESS_STEPS } from './process-chain.mjs';
import * as canslim from './engine/partial/canslim.mjs';
import * as piotroski from './engine/partial/piotroski.mjs';
import { buildPilotArtifact } from './pilot/donchian-weekly.mjs';
import { createOracle } from './validation/intraday-oracle.mjs';
import { nonStockProduct } from './validation/lib.mjs';
import { buildReplayArtifact } from './replay.mjs';
import { STRATEGIES, REGISTRY_VERSION, DNA_FIELDS, INTERNAL_SOURCES } from './registry.mjs';
import { PHASE1_VERSION } from './registry-p1.mjs';
import { PROVENANCE_LABELS, PRODUCT_CLASS_LABELS, FIDELITY_AREA_LABELS } from './fidelity/provenance-labels.mjs';
import { LIVE_CLASSIFICATION } from './fidelity/product-classes.mjs';
import { evidenceFor, EVIDENCE_LEVELS, SOURCE_QUALITY, DATA_QUALITY, NO_PROMISE, EVIDENCE_VERSION } from './evidence.mjs';

export const BUILD_VERSION = 'supertrader-build-1.0.0';
let CURRENT_REGIME = null;
let TREND52_SYMBOLS = [];
// Runde 7: Momentum, Weinstein, Darvas und Minervini laufen in Version 2.0.0
// (vorab registriert, PREREGISTRATION-R7.json). Offene Positionen der
// Vorversionen werden mit deren Engine weitergefuehrt (engine.legacy).
// Runde 11: Momentum 3.2.0 (Fehlerkorrektur Einstand). Weinstein 4.0.0, Minervini 3.0.0 und Turtle 2.1.0
// verfehlten die vorab festgelegten Uebernahmebedingungen und bleiben Forschung (PREREGISTRATION-R11).
// Runde 12: Marktampel (PORT-MARKET-200) fuer Darvas 3.0.2 und Turtle 2.0.1 (vorab festgelegt bestanden).
// Runde 13 (Audit, Entscheidungen mit S1C neu angewendet): Weinstein 4.0.0 (Fortsetzungskaeufe) live,
// Turtle 2.0.2 ohne Marktampel (2.0.1 zurueckgenommen); Darvas 3.0.2 behaelt die Ampel.
export const LIVE_ENGINES = [kkBreakout32, weinstein4, darvas302, minervini2, donchian202];
export const PREVIOUS_ENGINES = [kkBreakout, kkBreakout2, kkBreakout3, weinstein, weinstein2, darvas, darvas2, darvas3, minervini, donchian];

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ROOT = path.resolve(args.root || '.');
const OUT = path.resolve(ROOT, args.out || 'supertrader');
const DATA = path.join(OUT, 'data');
const rel = (...p) => path.join(ROOT, ...p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readGz = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const exists = (p) => fs.existsSync(p);
const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v ?? null);
const log = (...m) => { if (!args.quiet) console.log('[supertrader]', ...m); };

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj) + '\n');
}

/* ------------------------------------------------------------ Laden */
export function loadUniverse() {
  const idx = readJson(rel('discover/data/stock-index/US_REAL.json'));
  // Runde 10 (PREREGISTRATION-R10-FIXES U1): ETFs, bankemittierte ETNs und geschlossene Fonds,
  // die die Stammdaten als Aktie fuehren, gehoeren nicht ins Aktienuniversum der Methoden.
  const names = exists(rel('quant/data/market/security-master/company-names.json')) ? readJson(rel('quant/data/market/security-master/company-names.json')).rows || [] : [];
  const byTicker = new Map(names.map((r) => [r.ticker, r]));
  const out = new Set();
  UNIVERSE_EXCLUDED.length = 0;
  for (const sym of idx.symbols) {
    const r = byTicker.get(sym);
    const why = r ? nonStockProduct({ ticker: sym, exchange: r.exchange, name: r.companyName }) : null;
    if (why) UNIVERSE_EXCLUDED.push([sym, why]); else out.add(sym);
  }
  return out;
}
export const UNIVERSE_EXCLUDED = [];

export function loadBars(universe) {
  const dir = rel('quant/data/product/technical-signals-v1');
  const out = new Map();
  let generatedAt = null, unavailable = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort()) {
    const shard = readGz(path.join(dir, file));
    generatedAt = generatedAt && generatedAt > shard.generatedAt ? generatedAt : shard.generatedAt;
    unavailable += Object.keys(shard.unavailable || {}).length;
    for (const [sym, inst] of Object.entries(shard.instruments || {})) {
      if (!universe.has(sym) || inst.isMock || inst.dataMode !== 'real') continue;
      const b = inst.bars;
      if (!b || !Array.isArray(b.timestamps) || b.timestamps.length < 60) continue;
      out.set(sym, {
        symbol: sym, shard: file.replace('.json.gz', ''), priceSeriesType: inst.priceSeriesType,
        bars: { date: b.timestamps.map((d) => String(d).slice(0, 10)), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume },
        provenance: inst.provenance || null,
      });
    }
  }
  return { instruments: out, generatedAt, unavailable };
}

function loadWeeklyLong(sym) {
  const p = rel('quant/data/market/discover-series-long', `${weeklySeriesId(sym)}.json`);
  if (!exists(p)) return null;
  const j = readJson(p);
  return j.points || null;
}

function loadBenchmarkWeekly() {
  const j = readJson(rel('quant/data/market/multi-asset/series/SPY.json'));
  const byWeek = new Map();
  for (const [d, v] of j.points) byWeek.set(isoWeekKey(String(d).slice(0, 10)), v);
  return { byWeek, to: j.to, from: j.from };
}

/* ----------------------------------------------- Querschnittsraenge */
function crossSection(instruments, calendar) {
  const dateIdx = new Map(calendar.map((d, i) => [d, i]));
  const per = new Map();
  for (const inst of instruments.values()) per.set(inst.symbol, { mom21: [], mom63: [], mom126: [], rs: [] });
  for (let ci = 0; ci < calendar.length; ci++) {
    const e21 = [], e63 = [], e126 = [], ers = [];
    for (const inst of instruments.values()) {
      const t = inst.indexOf.get(calendar[ci]);
      if (t === undefined) continue;
      const I = inst.ind;
      if (!(I.dollarVol20[t] >= 1e6)) continue; // Querschnitt nur handelbarer Titel
      e21.push({ key: inst.symbol, value: I.ret21[t] });
      e63.push({ key: inst.symbol, value: I.ret63[t] });
      e126.push({ key: inst.symbol, value: I.ret126[t] });
      const parts = [I.ret63[t], I.ret126[t], I.ret189[t], I.ret252[t]];
      ers.push({ key: inst.symbol, value: parts.every(Number.isFinite) ? 0.4 * parts[0] + 0.2 * parts[1] + 0.2 * parts[2] + 0.2 * parts[3] : null });
    }
    const [p21, p63, p126, prs] = [e21, e63, e126, ers].map((e) => percentileRanks(e));
    for (const inst of instruments.values()) {
      const t = inst.indexOf.get(calendar[ci]);
      if (t === undefined) continue;
      const c = per.get(inst.symbol);
      c.mom21[t] = p21.get(inst.symbol) ?? null; c.mom63[t] = p63.get(inst.symbol) ?? null;
      c.mom126[t] = p126.get(inst.symbol) ?? null; c.rs[t] = prs.get(inst.symbol) ?? null;
    }
  }
  void dateIdx;
  return per;
}

/* ---------------------------------------------- Abdeckungsmessung */
function yearsBetween(a, b) { return (new Date(b) - new Date(a)) / (365.25 * 86400000); }
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }

function measureCoverage(instruments, weeklySpans) {
  const dailySpans = [...instruments.values()].map((i) => yearsBetween(i.bars.date[0], i.bars.date[i.bars.date.length - 1]));
  const sm = readJson(rel('quant/data/market/security-master/us-security-master.json'));
  const inactive = sm.rows.filter((r) => r.active_status === 'INACTIVE');
  const delistedWithPrices = inactive.filter((r) => exists(rel('quant/data/market/discover-series-long', `${weeklySeriesId(r.ticker)}.json`))).length;
  const pitGates = readJson(rel('quant/data/sec/pit_gates.json'));
  const histDir = rel('quant/data/market/index-membership/history/SP500');
  const membershipDates = exists(histDir) ? fs.readdirSync(histDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length : 0;
  const pitDir = rel('quant/data/golden-five-pit-coverage');
  const pitSymbols = exists(pitDir) ? fs.readdirSync(pitDir).filter((f) => /^[A-Z.]+\.json$/.test(f)).length : 0;
  const intradayDir = rel('quant/data/market/intraday');
  const intradaySessions = exists(intradayDir) ? fs.readdirSync(intradayDir).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).length : 0;
  return {
    measuredAt: null, // wird in build() auf den Eingabestand gesetzt (deterministisch)
    dailyOhlcvYears: r4(median(dailySpans)), dailyOhlcvSymbols: instruments.size,
    weeklyCloseYears: r4(median(weeklySpans)), weeklyVolumeFromDailyOnly: true,
    intradaySessionsRetained: intradaySessions, intradayHasOhlc: false, intradayInterval: '5min, nur Schlusskurse',
    pitFundamentalSymbols: pitSymbols,
    delistedWithPriceHistory: delistedWithPrices, inactiveInSecurityMaster: inactive.length,
    survivorshipControls: pitGates.declared_capabilities?.survivorshipBiasControls === true,
    historicalMembershipDates: membershipDates,
    splitAdjusted: [...instruments.values()].every((i) => i.priceSeriesType === 'SPLIT_ADJUSTED'),
    // Dividenden/Total Return: universumsweite Pruefung der Quant-Datenbasis (read-only).
    totalReturnUniform: (() => { const f = rel('quant/data/providers/return-basis-universe-study.json'); return exists(f) ? readJson(f).totalReturnVerification?.verdict === 'TOTAL_RETURN_UNIFORM' : false; })(),
    delistingReturns: false,
    usageRightsConfirmed: false,
    totalReturnSeries: false,
    sources: {
      dailyOhlcv: 'quant/data/product/technical-signals-v1 (kanonische technische Materialisierung, split-adjustiert)',
      weekly: 'quant/data/market/discover-series-long (Wochenschlusskurse)',
      survivorship: 'quant/data/sec/pit_gates.json → declared_capabilities.survivorshipBiasControls',
      delisted: 'quant/data/market/security-master/us-security-master.json (INACTIVE) × vorhandene Kursreihen',
      membership: 'quant/data/market/index-membership/history',
      pit: 'quant/data/golden-five-pit-coverage',
      intraday: 'quant/data/market/intraday (Aufbewahrung laut Konfiguration: 2 Sitzungen)',
    },
  };
}

let SIC_CACHE = null;
function sicInfo() {
  if (SIC_CACHE) return SIC_CACHE;
  const sic = readJson(rel('quant/data/product/sic-peer-taxonomy-v1.json'));
  const col = Object.fromEntries(sic.rowColumns.map((c, i) => [c, i]));
  const map = new Map();
  for (const r of sic.rows) {
    const d = r[col.sicDivision];
    map.set(r[col.ticker], { division: d || null, name: d && sic.divisions[d] ? sic.divisions[d].name : null });
  }
  SIC_CACHE = map;
  return map;
}

function greenblattCoverage() {
  const sic = readJson(rel('quant/data/product/sic-peer-taxonomy-v1.json'));
  const col = Object.fromEntries(sic.rowColumns.map((c, i) => [c, i]));
  const sicBy = new Map(sic.rows.map((r) => [r[col.ticker], r[col.sic4] || r[col.sicRaw]]));
  const dir = rel('discover/data/stocks/US_REAL');
  const companies = [];
  let eyComputable = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const j = readJson(path.join(dir, file));
    const fu = j.fundamentals || {};
    const units = fu.available ? Object.keys(fu.units || {}) : [];
    const has = (k) => (units.includes(k) ? true : undefined);
    const mc = fu.valuation?.marketCap?.value;
    const fields = {
      operating_income: has('operating_income'), total_debt: has('total_debt'), cash_and_equivalents: has('cash_and_equivalents'),
      market_cap: Number.isFinite(mc) ? true : undefined,
      current_assets: has('current_assets'), current_liabilities: has('current_liabilities'), net_ppe: has('net_ppe'),
      sic: sicBy.get(j.symbol) ?? undefined,
    };
    if (fields.operating_income && fields.total_debt && fields.cash_and_equivalents && fields.market_cap) eyComputable++;
    companies.push({ symbol: j.symbol, fields });
  }
  const cov = greenblatt.coverage(companies);
  cov.earningsYieldComputable = eyComputable;
  cov.source = 'discover/data/stocks/US_REAL/*.json → fundamentals.units, fundamentals.valuation; quant/data/product/sic-peer-taxonomy-v1.json';
  cov.sectorNote = 'SIC ist eine aktuelle Momentaufnahme ohne Klassifikationshistorie (historicalClassificationAvailable = false).';
  return cov;
}

/* ------------------------------------------------------- Ledger */
function ledgerPath(id) { return path.join(DATA, 'ledger', `${id}.json`); }
export function loadLedger(engine) {
  const p = ledgerPath(engine.id);
  if (exists(p)) return readJson(p);
  return { schema: 'supertrader-ledger-1.0.0', strategyId: engine.id, variant: engine.variant, liveSince: null, lastProcessed: null, open: [], closed: [], invalidated: [] };
}

function remapIndexes(sig, inst) {
  const idx = (d) => inst.indexOf.get(d) ?? -1;
  if (sig.entry) sig.entry.index = idx(sig.entry.date);
  for (const x of sig.exits || []) x.index = idx(x.date);
}

function stripForSave(sig) {
  const s = JSON.parse(JSON.stringify(sig));
  if (s.entry) delete s.entry.index;
  for (const x of s.exits || []) delete x.index;
  for (const k of ['sessions']) if (s[k] === undefined) delete s[k];
  roundDeep(s);
  return s;
}
function roundDeep(o) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isInteger(v)) o[k] = Math.round(v * 1e4) / 1e4;
    else if (v && typeof v === 'object') roundDeep(v);
  }
}

// Versionspolitik fuer offene Signale (LC-VERSION-RETIRED).
export function applyVersionPolicy(engine, open, lastProcessed, recordedAt) {
  const kept = [], retired = [];
  for (const s of open) {
    const v = s.version || '1.0.0';
    if (v === engine.version) { kept.push(s); continue; }
    // Runde 10: Eine Version mit unveraenderten Signalregeln (engine.signalCompatible, z. B. Darvas
    // 3.0.1 = 3.0.0 mit anderem Modellportfolio) fuehrt wartende Setups unter ihrer Version weiter.
    if ((engine.signalCompatible || []).includes(v)) { kept.push(s); continue; }
    if (PENDING.has(s.state) || s.state === 'TRIGGERED') {
      s.state = 'INVALIDATED';
      s.transitions.push({ state: 'INVALIDATED', date: lastProcessed, dataAsOf: lastProcessed, ruleId: 'LC-VERSION-RETIRED', ruleVersion: engine.version, recordedAt,
        note: `Regelversion ${v} durch ${engine.version} abgelöst. Das Setup wurde unter ${v} entdeckt und wird nicht rückwirkend nach neuen Regeln umgedeutet; die neue Version sucht auf demselben Datenstand neu.` });
      s.retiredBy = { fromVersion: v, toVersion: engine.version, date: lastProcessed };
      retired.push(s);
      continue;
    }
    // Modellpositionen laufen nur weiter, wenn die neue Version ihre Positionsfuehrung
    // ausdruecklich uebernimmt - sonst bricht der Build ab, statt still umzudeuten.
    // Runde 7: Eine neue Version mit anderer Positionsfuehrung fuehrt Positionen
    // aelterer Versionen mit deren eigener Engine weiter (engine.legacy[v]).
    if (!(engine.manageCompatible || []).includes(v) && !engine.legacy?.[v]) throw new Error(`${s.id}: Position unter Version ${v}, ${engine.id} ${engine.version} erklärt keine kompatible Positionsführung`);
    kept.push(s);
  }
  return { open: kept, retired };
}

// Append-only: kein Signal verschwindet, abgeschlossene Signale bleiben
// unveraendert, offene Signale duerfen ihr Protokoll nur verlaengern.
export function assertAppendOnly(before, after) {
  const all = (l) => [...l.open, ...l.closed, ...l.invalidated];
  const next = new Map(all(after).map((s) => [s.id, s]));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const s of all(before)) {
    const n = next.get(s.id);
    if (!n) throw new Error(`Ledger-Verletzung: ${s.id} fehlt`);
    if (TERMINAL.has(s.state)) { if (!eq(s, n)) throw new Error(`Ledger-Verletzung: abgeschlossenes Signal ${s.id} verändert`); continue; }
    const a = s.transitions || [], b = n.transitions || [];
    if (b.length < a.length || !a.every((x, i) => eq(x, b[i]))) throw new Error(`Ledger-Verletzung: Protokoll von ${s.id} umgeschrieben`);
    if (n.createdAt !== s.createdAt || n.version !== s.version) throw new Error(`Ledger-Verletzung: Kopf von ${s.id} verändert`);
  }
}

// Neubewertung nach Regelwechsel (kein neues Marktereignis): Das unter der neuen
// Version auf DEMSELBEN Kursstand erkannte Signal verweist auf seinen Vorgaenger,
// behaelt dessen urspruengliches Entdeckungsdatum und nennt den verwendeten Kursstand.
export function linkReassessment(prev, sig) {
  const first = prev.transitions[0] || {};
  sig.discovery = { ...sig.discovery, kind: 'RULE_VERSION_REASSESSMENT',
    reassessment: { previousSignalId: prev.id, previousVersion: prev.version, originalDiscoveryDate: prev.createdAt, originalDataAsOf: first.dataAsOf || first.date || prev.createdAt, priceDataAsOf: sig.createdAt, retiredOn: prev.retiredBy.date, note: 'Neubewertung nach Regelwechsel auf unverändertem Kursstand — kein neues Marktereignis.' } };
  if (sig.transitions[0]) sig.transitions[0].origin = 'RULE_VERSION_REASSESSMENT';
  prev.retiredBy.successorId = sig.id;
}
export const isReassessment = (s) => s.discovery?.kind === 'RULE_VERSION_REASSESSMENT';
export const isRetired = (s) => s.state === 'INVALIDATED' && s.transitions?.[s.transitions.length - 1]?.ruleId === 'LC-VERSION-RETIRED';

/* ------------------------------------------------------------ Main */
// Runde 9: Minutenquelle fuer Kauf-Stop-Tage im Live-Lauf. intraday-prefetch.mjs legt
// IEX-Minuten der wartenden Setups, deren Tageshoch den Trigger erreichte, in eine Datei
// AUSSERHALB des Repositorys (SUPERTRADER_INTRADAY_CACHE). Ohne Datei (lokal, CI) gilt die
// Tagesbalken-Annahme. Ins Protokoll gelangen nur Belegart und Entscheidung, keine
// Minutenwerte oder Uhrzeiten.
let LIVE_ORACLE = null;
export function liveOracleFrom(file) {
  if (!file || !exists(file)) return null;
  const j = readJson(file);
  const { oracle } = createOracle(j.days || {}, { from: '2017-01-01' });
  return (ctx, t, sig, e) => { const r = oracle(ctx, t, sig, e); if (r && r.status === 'RESOLVED') delete r.entryMinute; return r; };
}

export function build() {
  LIVE_ORACLE = liveOracleFrom(process.env.SUPERTRADER_INTRADAY_CACHE);
  const t0 = Date.now();
  const universe = loadUniverse();
  const { instruments, generatedAt: barsGeneratedAt, unavailable } = loadBars(universe);
  log(`Universum ${universe.size}, mit Tages-OHLCV ${instruments.size}`);
  const calendarSet = new Set();
  for (const inst of instruments.values()) {
    inst.indexOf = new Map(inst.bars.date.map((d, i) => [d, i]));
    inst.ind = computeIndicators(inst.bars);
    for (const d of inst.bars.date) calendarSet.add(d);
  }
  const calendar = [...calendarSet].sort();
  const asOf = calendar[calendar.length - 1];
  const cross = crossSection(instruments, calendar);
  const bench = loadBenchmarkWeekly();

  // Wochenkontext nur fuer handelbare Titel (Liquiditaetsgrenze der Strategien).
  const weeklySpans = [];
  for (const inst of instruments.values()) {
    const t = inst.bars.date.length - 1;
    if (!(inst.ind.dollarVol20[t] >= 5e6)) continue;
    const long = loadWeeklyLong(inst.symbol);
    if (long && long.length) weeklySpans.push(yearsBetween(String(long[0][0]).slice(0, 10), String(long[long.length - 1][0]).slice(0, 10)));
    Object.assign(inst, buildWeekly(inst, long, bench));
  }
  const coverage = measureCoverage(instruments, weeklySpans);
  coverage.measuredAt = barsGeneratedAt;
  const gbCoverage = greenblattCoverage();

  const ctxOf = (inst) => ({ symbol: inst.symbol, bars: inst.bars, ind: inst.ind, cross: cross.get(inst.symbol), weekly: inst.weekly, weekAt: inst.weekAt, regime: CURRENT_REGIME });

  CURRENT_REGIME = readJson(rel('quant/data/product/market-regime-v1.json')).regime || null;
  /* --- Live-Lauf je Strategie --- */
  const scanner = {};
  const ledgers = {};
  for (const engine of LIVE_ENGINES) {
    const ledger = loadLedger(engine);
    const before = JSON.parse(JSON.stringify(ledger));
    const lastProcessed = ledger.lastProcessed;
    // Regelversionen: ein Signal behaelt die Version, unter der es entdeckt
    // wurde. Wartende Setups einer alten Version werden nicht still neu
    // interpretiert, sondern mit LC-VERSION-RETIRED abgeschlossen und unter der
    // neuen Version auf demselben Datenstand neu gesucht (neue ID).
    const { open: openKept, retired } = applyVersionPolicy(engine, ledger.open, lastProcessed, barsGeneratedAt);
    const retiredSymbols = new Set(retired.map((x) => x.symbol));
    const retiredBySymbol = new Map(retired.map((x) => [x.symbol, x]));
    const openBySymbol = new Map(openKept.map((s) => [s.symbol, s]));
    const seen = new Set();
    const finishedNow = [...retired];
    const stillOpen = [];
    const snap = [];
    for (const inst of instruments.values()) {
      const ctx = ctxOf(inst);
      if (engine.timeframe === 'weekly' && !inst.weekly) continue;
      seen.add(inst.symbol);
      const n = inst.bars.date.length;
      let from;
      if (lastProcessed) {
        from = inst.bars.date.findIndex((d) => d > lastProcessed);
        if (from < 0) from = n; // nichts Neues
        if (retiredSymbols.has(inst.symbol)) {
          // Neu-Erkennung auf demselben Datenstand; Wochenstrategien ab dem letzten vollstaendigen Wochenschluss.
          let k = inst.indexOf.get(lastProcessed);
          if (k !== undefined && engine.timeframe === 'weekly') while (k > 0 && inst.weekAt[k] === null) k--;
          if (k !== undefined) from = Math.min(from, k);
        }
      } else {
        // Erster Live-Lauf: KEINE Rueckrechnung - das waere ein verdeckter Backtest.
        from = n - 1;
        if (engine.timeframe === 'weekly') { let k = n - 1; while (k >= 0 && inst.weekAt[k] === null) k--; from = Math.max(0, k); }
      }
      const open = openBySymbol.get(inst.symbol) || null;
      if (open) {
        delete open.dataStatus;
        remapIndexes(open, inst);
        const anchorIdx = open.anchor ? inst.indexOf.get(open.anchor.date) : undefined;
        if (anchorIdx !== undefined && open.anchor.close > 0) {
          const factor = inst.bars.close[anchorIdx] / open.anchor.close;
          if (Math.abs(factor - 1) > 0.005) rescaleSignal(open, factor, asOf);
        }
      }
      const state = { signal: open, cooldownUntil: -1 };
      let res = { state, finished: [], lastScan: null };
      // Altposition: nach der Regelversion fuehren, unter der sie eroeffnet wurde.
      // Neue Setups fuer diesen Titel sucht die neue Version erst nach dem
      // Abschluss (naechster Lauf) - ein Titel hat je Methode ein Signal.
      const legacyEngine = open && open.version !== engine.version && !(engine.manageCompatible || []).includes(open.version) ? engine.legacy?.[open.version] : null;
      if (from < n && legacyEngine) res = simulate(legacyEngine, ctx, { state, from, to: n - 1, recordedAt: barsGeneratedAt, manageOnly: true });
      else if (from < n) res = simulate(engine, ctx, { state, from, to: n - 1, recordedAt: barsGeneratedAt, ...(LIVE_ORACLE && engine.entryMode === 'BUY_STOP_INTRADAY' ? { intradayOracle: LIVE_ORACLE } : {}) });
      for (const s of res.finished) finishedNow.push(s);
      if (state.signal) {
        const last = n - 1;
        if (!state.signal.regimeAtCreation) state.signal.regimeAtCreation = CURRENT_REGIME;
        state.signal.anchor = { date: inst.bars.date[last], close: inst.bars.close[last] };
        // Qualitaet wartender Setups wird taeglich neu klassifiziert (Phase vor
        // dem Ausbruch); ab der Bestaetigung ist sie eingefroren.
        if (engine.classify && PENDING.has(state.signal.state)) state.signal.quality = engine.classify(ctx, last, state.signal);
        state.signal.lastPrice = inst.bars.close[last];
        state.signal.lastPriceDate = inst.bars.date[last];
        const prev = retiredBySymbol.get(inst.symbol);
        if (prev && !prev.retiredBy.successorId && state.signal.createdAt <= lastProcessed) linkReassessment(prev, state.signal);
        stillOpen.push(state.signal);
      }
      // Scanner-Momentaufnahme (DISCOVERED/WATCH) fuer Titel ohne offenes Signal.
      if (!state.signal) {
        let t = n - 1;
        if (engine.timeframe === 'weekly') { while (t >= 0 && inst.weekAt[t] === null) t--; }
        if (t >= 0) {
          const r = engine.scan(ctx, t);
          if (r && (r.stage === 'DISCOVERED' || r.stage === 'WATCH')) snap.push({ symbol: inst.symbol, stage: r.stage, asOf: inst.bars.date[t], facts: slimFacts(r.facts), rules: r.rules, levels: r.levels, close: inst.bars.close[n - 1] });
        }
      }
    }
    // Offene Signale ohne aktuelle Kursdaten bleiben unveraendert im Ledger
    // (LC-DATA-GAP) - sie verschwinden nicht und werden nicht fortgeschrieben.
    for (const s of openKept) {
      if (seen.has(s.symbol)) continue;
      s.dataStatus = { status: 'NO_CURRENT_DATA', checkedAsOf: asOf, lastDataDate: s.anchor?.date || s.createdAt, ruleId: 'LC-DATA-GAP', note: 'Für diesen Titel liegen im aktuellen Datenstand keine Kursdaten vor. Keine Entscheidung, bis Daten vorliegen.' };
      stillOpen.push(s);
    }
    const closed = [...ledger.closed, ...finishedNow.filter((s) => s.state === 'CLOSED')];
    for (const r of retired) if (r.retiredBy.successorId === undefined) r.retiredBy.successorId = null;
    const invalidated = [...ledger.invalidated, ...finishedNow.filter((s) => s.state === 'INVALIDATED')];
    ledgers[engine.id] = {
      ...ledger, variant: engine.variant, version: engine.version,
      liveSince: ledger.liveSince || asOf, lastProcessed: asOf, previousDataAsOf: lastProcessed && lastProcessed !== asOf ? lastProcessed : (ledger.previousDataAsOf ?? null),
      open: stillOpen.map(stripForSave).sort((a, b) => a.symbol.localeCompare(b.symbol)),
      closed: closed.map(stripForSave), invalidated: invalidated.map(stripForSave),
    };
    assertAppendOnly(before, ledgers[engine.id]);
    snap.sort((a, b) => (a.stage === b.stage ? rankFact(b) - rankFact(a) : a.stage === 'WATCH' ? -1 : 1));
    // symbols: ALLE Titel der Momentaufnahme, nicht nur die Top 60 - die
    // Fragefunktion (/ask/) prueft damit "erfuellt die Strategie heute" fuer
    // jeden Titel, ohne dass ein fehlender Eintrag als "nein" gelesen wird.
    scanner[engine.id] = { discovered: snap.filter((s) => s.stage === 'DISCOVERED').length, watch: snap.filter((s) => s.stage === 'WATCH').length, top: snap.slice(0, 60), symbols: snap.map((s) => s.symbol).sort() };
    log(`${engine.id}: offen ${stillOpen.length}, neu abgeschlossen ${finishedNow.length}, Scanner ${snap.length}`);
  }

  /* --- Teilpruefungen (CAN SLIM, Piotroski) auf SEC-Fundamentaldaten --- */
  const partial = buildPartialChecks(instruments, cross, asOf);
  log(`Teilpruefungen: CAN SLIM ${partial.CANSLIM.counts.partialMatch} Teiltreffer, Piotroski ${partial.PIOTROSKI_F.counts.candidates} Kandidaten`);

  /* --- Fundamentale Anzeige fuer Minervini-Signale (HYBRID) --- */
  const fundCache = new Map();
  const fundOf = (sym) => {
    if (fundCache.has(sym)) return fundCache.get(sym);
    const p = rel('discover/data/stocks/US_REAL', `${sym}.json`);
    let v = null;
    if (exists(p)) {
      const j = readJson(p);
      v = { companyName: j.companyName || sym, sector: j.sector || null, revenueGrowthTTM: j.metrics?.f_revenueGrowthTTM ?? null, earningsAcceleration: j.metrics?.f_earningsAcceleration ?? null, fundamentalsAsOf: j.fundamentals?.asOf || null, discoverUrl: `/discover/#/s/US_REAL/${encodeURIComponent(sym)}` };
    }
    fundCache.set(sym, v);
    return v;
  };

  /* --- Artefakte schreiben --- */
  const market = buildMarket(asOf, barsGeneratedAt);
  const registry = buildRegistry(coverage, gbCoverage);
  const sources = buildSources();
  const signals = buildSignals(ledgers, scanner, fundOf, instruments, market);
  signals.partialChecks = partial;
  for (const [id, pc] of Object.entries(partial)) for (const c of pc.candidates) (signals.bySymbol[c.symbol] ||= []).push({ strategyId: id, id: null, state: 'PARTIAL_CHECK' });
  const pilot = args['skip-pilot'] ? null : buildPilotArtifact(ROOT);
  // Historisches Replay: Demonstration an echten vergangenen Balken, nie im Ledger.
  const replay = buildReplayArtifact({ engine: donchian, instruments, ctxOf, planOf, asOf, generatedAt: barsGeneratedAt });
  const backtests = buildBacktests(registry, coverage, gbCoverage);
  // Historische Validierung je Regelkarte aus den gemessenen Gates, nicht behauptet.
  for (const s of registry.strategies) for (const card of s.rule_cards || []) {
    const run = backtests.runs.find((r) => r.variantId === card.variant_id);
    card.historical_validation = { ...card.historical_validation, status: run?.metricsPublishable ? 'GATES_PASSED_RUN_PENDING' : 'NOT_VALIDATED', gateStatus: run?.status || null, failedGates: run?.failedGates || [] };
  }

  // Laufendes Modellportfolio je Methode aus dem Live-Protokoll (alle Versionen).
  const portfolios = { schema: MODEL_PORTFOLIO_VERSION, asOf, strategies: {} };
  // Runde 12: Marktampel (SPY ueber GD 200 am Vortag) fuer Methoden mit portfolio.marketFilter.
  const spyAll = readJson(rel('quant/data/market/multi-asset/series/SPY.json')).points.filter(([d]) => String(d).slice(0, 10) <= asOf);
  const MARKET_OK = marketOkMap({ date: spyAll.map(([d]) => String(d).slice(0, 10)), close: spyAll.map(([, v]) => v) });
  for (const engine of LIVE_ENGINES) {
    const L = ledgers[engine.id];
    const barsOf = (sym) => instruments.get(sym)?.bars || null;
    // Runde 10 (K3): relative Staerke am Vortag des Einstiegs fuer die Rangfolge gleichzeitiger Einstiege.
    const rsOf = (sym, date) => { const inst = instruments.get(sym); const t = inst?.indexOf.get(date); return t > 0 ? cross.get(sym)?.rs?.[t - 1] ?? null : null; };
    portfolios.strategies[engine.id] = buildModelPortfolio({ engine, signals: [...L.open, ...L.closed], barsOf, marketOk: MARKET_OK, calendar, asOf, rsOf });
  }
  writeJson(path.join(DATA, 'portfolio.json'), portfolios);
  // Runde 12: VU Trendfolge 52W - Modelldepot mit monatlicher Umschichtung (eigenes Ledger, keine Rueckrechnung).
  {
    const spyPts = readJson(rel('quant/data/market/multi-asset/series/SPY.json')).points.filter(([d]) => String(d).slice(0, 10) <= asOf);
    const spy = { date: spyPts.map(([d]) => String(d).slice(0, 10)), close: spyPts.map(([, v]) => v) };
    const lp = ledgerPath('VU_TREND_52W');
    const prev = exists(lp) ? readJson(lp) : null;
    const { ledger: tl, preview, stocks } = runTrend52Live({ instruments, spy, ledger: prev, asOf });
    writeJson(lp, tl);
    const t52 = trend52View({ ledger: tl, preview, stocks, spy, asOf });
    writeJson(path.join(DATA, 'trend52.json'), t52);
    TREND52_SYMBOLS = [...new Set([...t52.portfolio.positions, ...t52.prepared.candidates, ...t52.nearMisses, ...t52.closed].map((x) => x.symbol))];
    log(`VU_TREND_52W: Positionen ${tl.state.positions.length}, Entscheidungen ${tl.decisions.length}, Rangliste ${preview?.candidates?.length ?? 0}`);
  }
  writeJson(path.join(DATA, 'registry.json'), registry);
  /* registry-core.json fuer alle Seiten ausser der Strategie-Detailseite:
     ohne Regeltexte (rules, processChain, fidelity.rules, weitere Regelkarten). */
  writeJson(path.join(DATA, 'registry-core.json'), registryCore(registry));
  writeJson(path.join(DATA, 'sources.json'), sources);
  writeJson(path.join(DATA, 'market.json'), market);
  writeJson(path.join(DATA, 'coverage.json'), { schema: 'supertrader-coverage-1.0.0', asOf, coverage, greenblatt: gbCoverage, unavailableInstruments: unavailable, gateDefinitions: GATE_DEFS, minHistoryYears: MIN_HISTORY_YEARS });
  /* Discover-Verfuegbarkeit explizit ausweisen (LOGI, 03.10.2026: Signal mit
     offener Position, Discover-Seite durch das Faktor-Qualitaetsgate entfallen ->
     toter Link). Signale und Positionen bleiben unveraendert; die Seite zeigt fuer
     ausgewiesene Titel einen Hinweis statt des Links. */
  /* Geprueft werden genau die Titel, fuer die unten eine Aktienseite
     entsteht - auch die Teilpruefungs-Titel, deren Seite ebenfalls den
     Discover-Link traegt. */
  signals.discoverAvailability = discoverAvailability(
    [...Object.keys(signals.bySymbol), ...TREND52_SYMBOLS, ...symbolsIn(signals.partialChecks)],
    readJson(rel('discover/data/stock-index/US_REAL.json')).symbols || []);
  writeJson(path.join(DATA, 'signals.json'), signals);
  /* Ausschnitte (Payload-Audit 03.10.2026: jede der 822 Seiten lud 3,3 MB):
     signals-core.json fuer Start, Strategien, Methodik, Backtests (ohne die
     Historienlisten), stock/<SYM>.json fuer die Aktienseite. signals.json
     bleibt vollstaendig fuer die Signalliste. */
  writeJson(path.join(DATA, 'signals-core.json'), signalsCore(signals));
  const slices = signalsBySymbol(signals, [...TREND52_SYMBOLS, ...symbolsIn(signals.partialChecks)]);
  /* Ein Ausschnitt eines Symbols, das heraus faellt, darf nicht stehen
     bleiben - er zeigte sonst alte Signale. Ohne Ausschnitt laedt die Seite
     die vollstaendige Datei. */
  const sliceDir = path.join(DATA, 'stock');
  if (exists(sliceDir)) for (const f of fs.readdirSync(sliceDir)) if (f.endsWith('.json') && !slices[f.slice(0, -5)]) fs.rmSync(path.join(sliceDir, f));
  for (const [sym, slice] of Object.entries(slices)) writeIfChanged(path.join(sliceDir, sym + '.json'), JSON.stringify(slice) + '\n');
  if (pilot) backtests.pilot = { path: '/supertrader/data/pilot-backtest.json', status: pilot.status, id: pilot.spec.id };
  writeJson(path.join(DATA, 'backtests.json'), backtests);
  if (pilot) writeJson(path.join(DATA, 'pilot-backtest.json'), pilot);
  writeJson(path.join(DATA, 'replay.json'), replay);
  for (const [id, l] of Object.entries(ledgers)) writeJson(ledgerPath(id), l);
  /* Jede Karte verlinkt auf /supertrader/stock/<SYM>/ (supertrader.js
     stockUrl) - auch die Teilpruefungs-Karten, deren Titel nicht unter den
     Kandidaten stehen. Ohne Seite war das ein 404 (DAR, ROKU, PECO, ...,
     Plattform-Audit 03.10.2026). */
  writeStockPages(signals, [...TREND52_SYMBOLS, ...symbolsIn(signals.partialChecks)]);
  writeStrategyPages(registry);
  writeStaticPages();
  /* slices: die Seite fragt nur Ausschnitte an, die dieser Lauf geschrieben hat. */
  writeJson(path.join(DATA, 'build.json'), { buildVersion: BUILD_VERSION, registryVersion: REGISTRY_VERSION, asOf, inputsGeneratedAt: barsGeneratedAt,
    slices: { version: SLICES_VERSION, registry: true, stock: Object.keys(slices).sort() } });
  log(`fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s, Stand ${asOf}`);
  return { asOf, signals, backtests, coverage };
}

// Fundamentaldaten aus den SEC-Konsumartefakten (zuletzt berichtete Werte,
// keine Point-in-Time-Erstmeldungen). Nur die fuer die Teilpruefungen noetigen Reihen.
function loadSecFundamentals(symbols) {
  const dir = rel('quant/data/sec/consumer');
  const out = new Map();
  if (!exists(dir)) return out;
  const keepA = ['net_income', 'total_assets', 'operating_cash_flow', 'long_term_debt', 'shares_outstanding', 'gross_profit', 'revenue', 'stockholders_equity'];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const j = readJson(path.join(dir, f));
    const sym = (j.tickers || []).find((t) => symbols.has(t));
    if (!sym || out.has(sym)) continue;
    const annual = {}; for (const k of keepA) if (j.annual?.[k]) annual[k] = j.annual[k];
    out.set(sym, { cik: j.cik, name: j.name, annual, quarterly: { net_income: j.quarterly?.net_income || [] }, asOf: j.asOf });
  }
  return out;
}

function lastOf(rows) { const r = (rows || []).filter((x) => x[1] === 'FY' && Number.isFinite(x[3])).sort((a, b) => String(a[2]).localeCompare(String(b[2]))); return r.length ? r[r.length - 1][3] : null; }

export function buildPartialChecks(instruments, cross, asOf) {
  const fund = loadSecFundamentals(new Set(instruments.keys()));
  const spy = readJson(rel('quant/data/market/multi-asset/series/SPY.json')).points.filter(([d]) => String(d).slice(0, 10) <= asOf);
  const market = canslim.evalM(spy);
  const cs = [], pio = [];
  const csCount = Object.fromEntries(canslim.CRITERIA.map((c) => [c.id, { PASS: 0, FAIL: 0, NO_DATA: 0 }]));
  const pioCount = Object.fromEntries(piotroski.SIGNALS.map((c) => [c.id, { PASS: 0, FAIL: 0, NO_DATA: 0 }]));
  const bm = [];
  for (const inst of instruments.values()) {
    const t = inst.bars.date.length - 1;
    const close = inst.bars.close[t];
    if (!(close >= 5) || !(inst.ind.dollarVol20[t] >= 5e6)) continue; // gleiche Handelbarkeitsgrenze wie die Live-Strategien
    const f = fund.get(inst.symbol);
    const vr = inst.ind.vol20[t] && inst.ind.vol50[t] ? inst.ind.vol20[t] / inst.ind.vol50[t] : null;
    const shares = f ? lastOf(f.annual.shares_outstanding) : null;
    const r = canslim.evaluate({ fund: f ? { ...f, sharesOutstanding: shares } : null, close, high252: inst.ind.high252[t], rsPercentile: cross.get(inst.symbol)?.rs?.[t], volumeRatio: vr, market, asOf });
    for (const k of Object.keys(csCount)) { const st = r.criteria[k].status; if (st in csCount[k]) csCount[k][st]++; }
    cs.push({ symbol: inst.symbol, name: f?.name || null, close: r4(close), ...r });
    if (f) {
      const p = piotroski.evaluate(f.annual, asOf);
      for (const k of Object.keys(pioCount)) { const st = p.signals[k].status; if (st in pioCount[k]) pioCount[k][st]++; }
      const eq = lastOf(f.annual.stockholders_equity);
      const mcap = shares && shares > 0 ? shares * close : null;
      const btm = eq && mcap ? eq / mcap : null;
      pio.push({ symbol: inst.symbol, name: f.name, close: r4(close), bookToMarket: r4(btm), ...p });
      if (btm !== null && btm > 0) bm.push(btm);
    }
  }
  bm.sort((a, b) => a - b);
  const q80 = bm.length ? bm[Math.floor(bm.length * piotroski.PARAMS.bookToMarketQuintile)] : null;
  const slimCs = (x) => ({ symbol: x.symbol, name: x.name, close: x.close, passed: x.passed, failed: x.failed, noData: x.noData, criteria: Object.fromEntries(Object.entries(x.criteria).map(([k, v]) => [k, { status: v.status, value: v.value ?? null, periodEnd: v.periodEnd || null, note: v.note || null }])) });
  const csMatches = cs.filter((x) => x.partialMatch).sort((a, b) => (b.criteria.C.value ?? 0) - (a.criteria.C.value ?? 0));
  // Ohne bestaetigten Markt (M) bleiben die uebrigen Kriterien sichtbar: "4 von 5, nur M fehlt".
  const csNear = cs.filter((x) => !x.partialMatch && x.passed.length === canslim.CHECKABLE.length - 1 && x.failed.length === 1).sort((a, b) => (b.criteria.C.value ?? 0) - (a.criteria.C.value ?? 0));
  const pioCand = pio.filter((x) => x.bookToMarket !== null && q80 !== null && x.bookToMarket >= q80 && x.checked === piotroski.CHECKABLE.length && x.partialScore >= piotroski.PARAMS.minPartialScore)
    .sort((a, b) => b.partialScore - a.partialScore || b.bookToMarket - a.bookToMarket);
  const slimPio = (x) => ({ symbol: x.symbol, name: x.name, close: x.close, bookToMarket: x.bookToMarket, partialScore: x.partialScore, checked: x.checked, fiscalYearEnd: x.fiscalYearEnd, signals: x.signals });
  return {
    CANSLIM: {
      mode: 'PARTIAL_CHECK', asOf, priceAsOf: asOf, fundamentalsBasis: 'SEC companyfacts, zuletzt berichtete Werte (keine Erstmeldungen)',
      criteria: canslim.CRITERIA, checkable: canslim.CHECKABLE, market,
      counts: { evaluated: cs.length, partialMatch: csMatches.length, near: csNear.length, byCriterion: csCount },
      candidates: csMatches.slice(0, 60).map(slimCs), near: csNear.slice(0, 40).map(slimCs),
    },
    PIOTROSKI_F: {
      mode: 'PARTIAL_CHECK', asOf, fundamentalsBasis: 'SEC companyfacts, Jahresabschlüsse, zuletzt berichtete Werte',
      signals: piotroski.SIGNALS, checkable: piotroski.CHECKABLE, valueThreshold: r4(q80), minPartialScore: piotroski.PARAMS.minPartialScore,
      counts: { evaluated: pio.length, fullyCheckable: pio.filter((x) => x.checked === piotroski.CHECKABLE.length).length, valueUniverse: pio.filter((x) => q80 !== null && x.bookToMarket >= q80).length, candidates: pioCand.length, bySignal: pioCount },
      candidates: pioCand.slice(0, 60).map(slimPio),
    },
  };
}

function slimFacts(f) {
  const out = {};
  for (const [k, v] of Object.entries(f || {})) out[k] = typeof v === 'number' ? r4(v) : v;
  return out;
}
function rankFact(s) { return s.facts?.momentumPercentile ?? s.facts?.rsPercentile ?? s.facts?.rsChange13w ?? -s.facts?.distanceTo52wHigh ?? 0; }

function buildMarket(asOf, barsGeneratedAt) {
  const regime = readJson(rel('quant/data/product/market-regime-v1.json'));
  const health = readJson(rel('quant/data/market/freshness/health.json'));
  const labels = { BROAD_STRENGTH: 'Breite Stärke', MIXED: 'Gemischt', BROAD_WEAKNESS: 'Breite Schwäche' };
  return {
    schema: 'supertrader-market-1.0.0', asOf,
    regime: { id: regime.regime, label: labels[regime.regime] || regime.regime, plain: regime.matchedRule?.plain || null, asOf: regime.asOf, source: 'quant/data/product/market-regime-v1.json', notAForecast: regime.notAForecast,
      measures: (regime.measures || []).map((m) => ({ id: m.id, label: m.label, share: r4(m.share) })) },
    session: { lastCompletedSession: health.market?.lastCompletedSession || asOf, stateAtCheck: health.market?.state || null, checkedAt: health.checkedAt, source: 'quant/data/market/freshness/health.json' },
    freshness: { barsGeneratedAt, barsThrough: asOf, note: 'Signale werden auf Tagesschlusskursen berechnet. Der Stand ist immer der letzte vollständige Handelstag.' },
  };
}

/* Migration Phase 1: Produktklasse und Fidelity je Live-Strategie (Datenbasis, aus fidelity/product-classes.mjs und R15-FIDELITY-MATRIX.json). */
let FIDELITY_MATRIX = null;
export function productOf(s) {
  const c = LIVE_CLASSIFICATION[s.strategy_id];
  if (!c) return null;
  FIDELITY_MATRIX ||= readJson(rel('scripts/supertrader/fidelity/R15-FIDELITY-MATRIX.json'));
  const m = FIDELITY_MATRIX.strategies[s.strategy_id];
  if (!m || m.liveVersion !== c.version || c.version !== s.strategy_version) throw new Error(`Produktklasse ${s.strategy_id}: Version ${c.version} passt nicht zur Registry ${s.strategy_version}`);
  const f = m.fidelity;
  return {
    schema: 'supertrader-product-1.0.0', product_class: c.productClass, product_class_label: PRODUCT_CLASS_LABELS[c.productClass].label, display_name: c.displayName, live_version: c.version,
    entry_fidelity: f.entry, exit_fidelity: f.exit, position_sizing_fidelity: f.sizing, portfolio_fidelity: f.portfolio,
    fundamental_fidelity: f.fundamental, market_fidelity: f.marketRegime, risk_fidelity: f.risk,
    replication_claim_allowed: m.REPLICATION_CLAIM_ALLOWED, hard_gate: { required: m.hardGate.required, not_high: m.hardGate.notHigh, blocking_portfolio_fields: m.hardGate.blockingPortfolioFields },
    original_fidelity_overall: m.originalFidelityOverall, note: m.overallNote,
  };
}

function buildRegistry(coverage, gbCoverage) {
  const engineParams = Object.fromEntries(LIVE_ENGINES.map((e) => [e.id, { variant: e.variant, version: e.version, params: e.PARAMS, timeframe: e.timeframe, portfolio: portfolioConfig(e), legacyVersions: Object.keys(e.legacy || {}) }]));
  return {
    schema: 'supertrader-registry-1.0.0', registryVersion: REGISTRY_VERSION, dnaFields: DNA_FIELDS,
    lifecycle: { states: STATES, labels: STATE_LABELS, phases: PHASES, persistedFrom: 'SETUP', scannerOnly: ['DISCOVERED', 'WATCH'] },
    execution: describeExecution(), portfolioDefaults: PORTFOLIO_DEFAULTS,
    provenanceClasses: PROVENANCE_LABELS, productClasses: PRODUCT_CLASS_LABELS, fidelityAreas: FIDELITY_AREA_LABELS, migrationPhase: PHASE1_VERSION,
    strategies: STRATEGIES.map((s) => ({ ...s, engine: engineParams[s.strategy_id] || null, evidence: evidenceFor(s), fidelity: fidelityFor(s.strategy_id), processChain: PROCESS_CHAIN[s.strategy_id] || null, product: productOf(s) })),
    fidelityScale: { schema: FIDELITY_VERSION, ruleClass: RULE_CLASS, sourceAccess: SOURCE_ACCESS, status: FIDELITY_STATUS,
      accessNote: 'Runde 7: Fast alle Primärseiten (Trader-Websites, Bücher, Interviews) waren aus der Arbeitsumgebung nicht abrufbar. Belegt ist, was mehrere unabhängige Suchauszüge übereinstimmend wiedergeben; Wortlaute sind vor einem Zitat am Original zu prüfen.' },
    evidenceScale: { schema: EVIDENCE_VERSION, levels: EVIDENCE_LEVELS, source: SOURCE_QUALITY, data: DATA_QUALITY, noPromise: NO_PROMISE,
      publicationNote: 'Intern geprüfte Versionen erscheinen bis zur Klärung der Rechte an abgeleiteten Kennzahlen als „In Prüfung“. Eine Änderung der Einstufung ist kein Marktsignal und ändert kein protokolliertes Signal.' },
    dataRealityNote: `Tages-OHLCV öffentlich ${String(coverage.dailyOhlcvYears).replace('.', ',')} Jahre; Greenblatt-Pflichtfelder fehlend: ${gbCoverage.missingFields.join(', ') || 'keine'}.`,
  };
}

function buildSources() {
  const ledger = readJson(rel('scripts/supertrader/source-ledger.json'));
  return {
    schema: 'supertrader-sources-1.0.0',
    policy: 'Dauerhafte Quellen mit echter URL, Titel, Autor und Abrufdatum. Temporäre Chat-Zitate werden nicht übernommen. Kein Buch wurde als vollständig gelesen behandelt; es werden keine geschützten Texte oder Grafiken übernommen.',
    retrievalNote: 'Die URLs wurden am 2026-09-29 über Suchergebnisse mit exakt diesem Titel bestätigt (SEARCH_RESULT_MATCH). Ein direkter Seitenabruf war aus der Build-Umgebung nicht möglich; die inhaltliche Prüfung der Aussagen stammt aus dem Deep-Research-Report und bleibt bis zum Source-Fidelity-Pass offen.',
    sources: [...ledger, ...INTERNAL_SOURCES],
  };
}

function buildSignals(ledgers, scanner, fundOf, instruments, market) {
  const strategiesOut = {};
  const bySymbol = {};
  const counts = { ...Object.fromEntries(STATES.map((s) => [s, 0])), RETIRED_BY_RULE_VERSION: 0, REASSESSED_AFTER_RULE_CHANGE: 0, NEW_SINCE_PREVIOUS_DATA: 0 };
  const decorate = (s) => {
    const fund = fundOf(s.symbol);
    const inst = instruments.get(s.symbol);
    const si = sicInfo().get(s.symbol) || {};
    const out = { ...s, plan: planOf(s), sicDivision: si.division || null, sicDivisionName: si.name || null, companyName: fund?.companyName || s.symbol, chart: inst ? { shard: inst.shard, weeklyPath: `/quant/data/market/discover-series-long/${weeklySeriesId(s.symbol)}.json` } : null };
    if (s.strategyId === 'MINERVINI_VCP' && fund) out.fundamentalsDisplay = { revenueGrowthTTM: fund.revenueGrowthTTM, earningsAcceleration: fund.earningsAcceleration, asOf: fund.fundamentalsAsOf, filtered: false };
    return out;
  };
  for (const [id, l] of Object.entries(ledgers)) {
    const open = l.open.map(decorate);
    const closed = l.closed.map(decorate).sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
    // Ungueltige Setups: die juengsten 150 im Produktartefakt, alle im Ledger.
    // Durch Regelwechsel abgeloeste Setups sind kein Marktereignis: getrennt von
    // ungueltig gewordenen Setups gezaehlt und ausgeliefert.
    const realInvalid = l.invalidated.filter((x) => !isRetired(x));
    const retiredList = l.invalidated.filter(isRetired);
    const invalidated = realInvalid.slice().sort((a, b) => lastDate(b).localeCompare(lastDate(a))).slice(0, 150).map(decorate);
    const retired = retiredList.map((x) => ({ id: x.id, symbol: x.symbol, strategyId: x.strategyId, version: x.version, createdAt: x.createdAt, state: x.state, retiredBy: x.retiredBy, transitions: x.transitions, levels: x.levels, companyName: fundOf(x.symbol)?.companyName || x.symbol }));
    for (const s of open) counts[s.state]++;
    counts.CLOSED += closed.length; counts.INVALIDATED += realInvalid.length; counts.RETIRED_BY_RULE_VERSION += retiredList.length;
    counts.REASSESSED_AFTER_RULE_CHANGE += open.filter(isReassessment).length;
    counts.NEW_SINCE_PREVIOUS_DATA += open.filter((x) => !isReassessment(x) && x.createdAt > (l.previousDataAsOf || '')).length;
    counts.DISCOVERED += scanner[id].discovered; counts.WATCH += scanner[id].watch;
    const scan = scanner[id].top.map((x) => ({ ...x, sicDivision: sicInfo().get(x.symbol)?.division || null, sicDivisionName: sicInfo().get(x.symbol)?.name || null, companyName: fundOf(x.symbol)?.companyName || x.symbol, chart: instruments.get(x.symbol) ? { shard: instruments.get(x.symbol).shard, weeklyPath: `/quant/data/market/discover-series-long/${weeklySeriesId(x.symbol)}.json` } : null }));
    const quality = qualitySummary(open);
    strategiesOut[id] = { quality: open.some((x) => x.quality) ? quality : null, liveSince: l.liveSince, lastProcessed: l.lastProcessed, variant: l.variant, version: l.version, open, closed, invalidated, invalidatedTotal: realInvalid.length, retired, retiredTotal: retiredList.length, reassessed: open.filter(isReassessment).length, ledgerPath: `/supertrader/data/ledger/${id}.json`, scanner: { discovered: scanner[id].discovered, watch: scanner[id].watch, top: scan, symbols: scanner[id].symbols } };
    for (const s of [...open, ...closed, ...invalidated]) (bySymbol[s.symbol] ||= []).push({ strategyId: id, id: s.id, state: s.state });
    for (const s of scan) (bySymbol[s.symbol] ||= []).push({ strategyId: id, id: null, state: s.stage });
  }
  return {
    schema: 'supertrader-signals-1.0.0', asOf: market.asOf, inputsGeneratedAt: market.freshness.barsGeneratedAt,
    policy: 'Ab SETUP wird jedes Signal mit allen Zustandswechseln dauerhaft protokolliert. Abgeschlossene und ungültige Signale — Gewinner wie Verlierer — werden nie gelöscht. DISCOVERED/WATCH sind tägliche Momentaufnahmen.',
    disclaimer: 'Modellsignale einer regelbasierten Strategie-Nachbildung. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung, keine Aussage über persönliche Eignung.',
    counts, strategies: strategiesOut, bySymbol,
  };
}
// Ein-/Ausstiegsblock je Signal: Phase, geplante Schwellen mit Datenstand,
// tatsaechliche Modellausfuehrung (nur wenn vorhanden) und die naechste Handlung.
const CARD_BY_STRATEGY = new Map(STRATEGIES.filter((x) => x.rule_cards).map((x) => [x.strategy_id, x.rule_cards[0]]));
const fmtP = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
// Plan der Regelversion des Signals: exakt, sonst die naechstaeltere gespeicherte,
// sonst die aelteste gespeicherte (z. B. 1.0.0 bei gleicher Regel wie 1.1.0).
const vnum = (v) => String(v || '').split('.').map(Number).reduce((a, x) => a * 1000 + (x || 0), 0);
export function planForVersion(card, version) {
  if (!card) return null;
  if (!version || version === card.rule_version || !card.plans_by_version) return card.plan;
  const vs = Object.keys(card.plans_by_version).sort((a, b) => vnum(a) - vnum(b));
  if (card.plans_by_version[version]) return card.plans_by_version[version];
  if (vnum(version) > vnum(card.rule_version)) return card.plan;
  const older = vs.filter((x) => vnum(x) <= vnum(version)).pop();
  return card.plans_by_version[older || vs[0]] || card.plan;
}
export function planOf(s) {
  const card = CARD_BY_STRATEGY.get(s.strategyId);
  const p = planForVersion(card, s.version);
  if (!p) return null;
  const last = s.transitions[s.transitions.length - 1] || {};
  const levelsAsOf = s.levelHistory?.[s.levelHistory.length - 1]?.date || s.createdAt;
  const phase = phaseOf(s.state);
  const out = {
    phase, phaseLabel: PHASES[phase]?.label || s.state, phasePlain: PHASES[phase]?.plain || '',
    since: last.date || null, sinceRuleId: last.ruleId || null,
    trigger: { value: r4(s.levels?.trigger), kind: 'PLANNED_THRESHOLD', label: 'geplanter Schwellenwert', basis: p.confirmBasis, dataAsOf: levelsAsOf, ruleId: p.confirmRuleId },
    invalidation: { value: r4(s.levels?.invalidation), kind: 'PLANNED_THRESHOLD', label: 'geplante Invalidation', basis: p.invalidationBasis, dataAsOf: levelsAsOf, ruleId: p.invalidationRuleId },
    confirmation: s.confirmation ? { date: s.confirmation.date, close: s.confirmation.close, basis: s.confirmation.basis, ruleId: s.transitions.find((x) => x.state === 'TRIGGERED')?.ruleId || p.confirmRuleId } : null,
    entry: s.entry ? { date: s.entry.date, price: r4(s.entry.price), rawOpen: s.entry.rawOpen, basis: s.entry.priceBasis, gappedAboveTrigger: !!s.entry.gappedAboveTrigger, kind: 'MODEL_EXECUTION', evidence: s.entry.evidence || (s.entry.priceBasis === 'BUY_STOP' ? 'DAILY_BAR_HIGH_REACHED_TRIGGER' : 'DAILY_BAR_OPEN'), sameDayOrder: s.entry.sameDayOrder || null } : null,
    stop: Number.isFinite(s.stop) ? { value: r4(s.stop), ruleId: s.stopRuleId, dataAsOf: s.stopHistory?.[s.stopHistory.length - 1]?.date || null } : null,
    exits: (s.exits || []).map((x) => ({ date: x.date, price: r4(x.price), fraction: x.fraction, ruleId: x.ruleId, basis: x.priceBasis, kind: 'MODEL_EXECUTION' })),
    exitSummary: p.exitSummary,
    lastPrice: Number.isFinite(s.lastPrice) ? { value: r4(s.lastPrice), dataAsOf: s.lastPriceDate || s.anchor?.date || null, basis: 'CLOSE' } : null,
  };
  let text, ruleId;
  if (s.dataStatus?.status === 'NO_CURRENT_DATA') {
    text = 'Keine Entscheidung: im aktuellen Datenstand fehlen Kursdaten für diesen Titel.'; ruleId = 'LC-DATA-GAP';
  } else if (PENDING.has(s.state)) {
    const inv = `${p.invalidationText} ${fmtP(s.levels?.invalidation)} → ungültig`;
    text = p.confirmBasis === 'INTRADAY_BUY_STOP'
      ? `Kauf-Stop über ${fmtP(s.levels?.trigger)} für den nächsten Handelstag. ${inv}.`
      : `Warten auf ${p.confirmText} ${fmtP(s.levels?.trigger)}. Erst dann gilt der Einstieg als bestätigt; Modelleinstieg zur folgenden Eröffnung. ${inv}.`;
    ruleId = p.confirmRuleId;
  } else if (s.state === 'TRIGGERED') {
    text = 'Modelleinstieg zur nächsten Eröffnung (keine reale Order). Bei Eröffnung auf/unter dem Stop oder außerhalb der Gap-Regel kein Einstieg.'; ruleId = 'LC-MODEL-ENTRY';
  } else if (s.state === 'ACTIVE' || s.state === 'WARNING') {
    text = `Modellposition halten, solange keine Ausstiegsregel greift. Stop ${fmtP(s.stop)}. ${p.exitSummary}.`; ruleId = s.stopRuleId;
  } else if (s.state === 'EXIT') {
    text = 'Ausstieg ausgelöst — Modellausführung zur nächsten Eröffnung.'; ruleId = last.ruleId;
  } else if (s.state === 'CLOSED') {
    text = 'Modellposition geschlossen. Keine weitere Handlung.'; ruleId = last.ruleId;
  } else {
    text = 'Setup ungültig — keine weitere Handlung.'; ruleId = last.ruleId;
  }
  out.nextAction = { text, ruleId, dataAsOf: s.anchor?.date || last.date || null };
  out.reason = last.note || null;
  return out;
}

function qualitySummary(open) {
  if (!open.some((x) => x.quality)) return null;
  const q = open.filter((x) => x.quality);
  const byLabel = { A_CANDIDATE: 0, B_SETUP: 0, A_ENTRY: 0, B_ENTRY: 0 };
  for (const x of q) if (x.quality.label in byLabel) byLabel[x.quality.label]++;
  const b = q.filter((x) => x.quality.tier === 'B');
  const failedBy = {};
  for (const x of b) for (const id of x.quality.failed || []) failedBy[id] = (failedBy[id] || 0) + 1;
  const onlyRegime = b.filter((x) => x.quality.blockedOnlyByRegime).length;
  return {
    A: q.filter((x) => x.quality.tier === 'A').length, B: b.length, byLabel,
    bBreakdown: { total: b.length, blockedOnlyByRegime: onlyRegime, failOtherCriteria: b.length - onlyRegime, failedBy, regimeLockOrigin: 'VU' },
  };
}

function lastDate(s) { return s.transitions?.[s.transitions.length - 1]?.date || s.createdAt || ''; }

function buildBacktests(registry, coverage, gbCoverage) {
  const out = [];
  for (const s of registry.strategies.filter((x) => !x.advanced)) {
    for (const v of s.variants) {
      const engine = LIVE_ENGINES.find((e) => e.variant === v.variant_id);
      const timeframe = engine?.timeframe || (s.strategy_id === 'WEINSTEIN_STAGE' ? 'weekly' : 'daily');
      const gateId = v.variant_id === 'KK_COMMON_BREAKOUT_ORH' ? 'KK_COMMON_BREAKOUT_ORH' : mapVariant(v.variant_id);
      const g = v.status === 'ADVANCED_RESEARCH'
        ? { status: 'ADVANCED_RESEARCH', metricsPublishable: false, gates: [], failedGates: ['ADVANCED_RESEARCH'] }
        : evaluateGates(gateId, coverage, {
        timeframe, baselines: s.baselines, missingFields: s.strategy_id === 'GREENBLATT_VALUE' ? gbCoverage.missingFields : s.strategy_id === 'CANSLIM' ? ['institutional_holdings_history', 'eps_point_in_time'] : s.strategy_id === 'PIOTROSKI_F' ? ['current_assets', 'current_liabilities'] : [],
        });
      out.push({
        strategyId: s.strategy_id, variantId: v.variant_id, label: v.label, active: v.active, vuFormalization: v.vu_formalization,
        status: g.status, metricsPublishable: g.metricsPublishable, metrics: null,
        gates: g.gates, failedGates: g.failedGates, testPlan: g.testPlan || null, baselines: s.baselines,
        trustScore: { value: null, reason: g.metricsPublishable ? 'Lauf ausstehend' : 'Kein Trust Score ohne bestandene Datengates — eine Zahl würde Evidenz vortäuschen.' },
      });
    }
  }
  return {
    schema: 'supertrader-backtests-1.0.0',
    policy: 'Eine Kennzahl erscheint nur, wenn alle harten Gates einer vorab definierten Variante bestanden sind. Keine Best-of-Hindsight-Auswahl: jede Variante ist eine eigene Strategy-Version.',
    execution: describeExecution(), portfolioDefaults: PORTFOLIO_DEFAULTS,
    requiredMetrics: ['CAGR', 'Gesamtrendite', 'Benchmark-Rendite', 'Excess Return', 'Volatilität', 'Sharpe', 'Sortino', 'Max. Drawdown', 'Calmar', 'Trefferquote', 'Ø Gewinn', 'Ø Verlust', 'Expectancy', 'Profit Factor', 'Ø Haltedauer', 'Turnover', 'Exposure', 'Verlustserien', 'Tail Losses', 'Jahresergebnisse', 'Marktregime-Ergebnisse', 'Anzahl Trades', 'Datenabdeckung', 'Strategy Trust Score'],
    validationDesign: { inSampleShare: 0.6, outOfSample: 'letzte 40 % unverändert', walkForward: 'Kalenderjahre', sensitivity: 'alle vorab definierten Varianten als Fläche, nie als bester Punkt', benchmark: 'SPY (Kursindex) und gleichgewichtetes Universum inkl. Delistings' },
    runs: out,
    // Datenstrecke zum ersten validierbaren Backtest - aus dem Probeabruf (nur Anzahlen).
    dataPath: (() => { const f = rel('scripts/supertrader/probe/results-2026-10-01.json'); return exists(f) ? readJson(f) : null; })(),
    nextSteps: NEXT_STEPS,
  };
}
// Kleinster belegter Schritt zuerst (docs/SUPERTRADER_VALIDATION_DATA_PATH.md).
const NEXT_STEPS = [
  ['Rechte an abgeleiteten Kennzahlen klären', 'Ob aus den Kursdaten berechnete Backtest-Ergebnisse veröffentlicht werden dürfen. Bis dahin erscheinen geprüfte Versionen als „In Prüfung“.'],
  ['Fundamentaldaten zum damaligen Stichtag', 'Erstmeldungen aus den SEC-Abschlüssen statt zuletzt berichteter Werte – Voraussetzung für historische Tests von CAN SLIM, Piotroski und Greenblatt.'],
  ['Neue Regelversionen nur als neue Hypothese', 'Eine Variante nach Kenntnis eines Ergebnisses wird vorab festgelegt und erst mit späteren Daten unabhängig geprüft.'],
];
function mapVariant(v) {
  if (v.startsWith('KK_COMMON_BREAKOUT')) return 'KK_COMMON_BREAKOUT_DAILY';
  if (v.startsWith('WEINSTEIN_STAGE2')) return 'WEINSTEIN_STAGE2_WEEKLY';
  if (v === 'GREENBLATT_GLOBAL_VU') return v; // keine Gate-Definition -> NOT_COMPARABLE
  if (v.startsWith('DARVAS')) return 'DARVAS_BOX_N3_VU';
  if (v.startsWith('MINERVINI')) return 'MINERVINI_TT_VCP_A';
  if (v.startsWith('DONCHIAN')) return 'DONCHIAN_TURTLE_S1_DAILY';
  if (v.startsWith('CANSLIM')) return 'CANSLIM_FULL';
  if (v.startsWith('PIOTROSKI')) return 'PIOTROSKI_F_FULL';
  if (v.startsWith('GREENBLATT')) return 'GREENBLATT_US_ORIGINAL';
  return v;
}

/* ----------------------------------------------- statische Routen */
// Farbschema: Standard dunkel (Supertrader-Identitaet). Das Inline-Skript im
// <head> uebernimmt vor dem ersten Zeichnen die gespeicherte Wahl des
// plattformweiten Hell/Dunkel-Schalters (localStorage "vu-discover-theme-v1"),
// damit nichts aufblitzt; die Navigation zeigt den Schalter (theme-switch).
function pageShell({ title, description, page, depth, attrs = '' }) {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#07080c">
<script>(function(){var w="dark";try{var v=localStorage.getItem("vu-discover-theme-v1");if(v==="dark"||v==="light")w=v;}catch(e){}var h=document.documentElement;h.setAttribute("data-theme",w);h.setAttribute("data-theme-mode",w);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",w==="dark"?"#08080a":"#ffffff");})();</script>
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="stylesheet" href="/assets/site-navigation.css">
<link rel="stylesheet" href="/supertrader/assets/supertrader.css">
</head>
<body class="st" data-page="${page}"${attrs}>
<vu-navigation theme="dark" theme-switch no-preview></vu-navigation><script>document.querySelector("vu-navigation").setAttribute("theme",document.documentElement.getAttribute("data-theme")||"dark");</script>
<script src="/assets/site-navigation.js"></script>
<a class="st-skip" href="#st-main">Zum Inhalt</a>
<main id="st-main" class="st-main" tabindex="-1"><div class="st-boot" aria-live="polite">Supertrader lädt …</div></main>
<noscript><p class="st-noscript">Supertrader benötigt JavaScript.</p></noscript>
<script src="/supertrader/assets/st-chart.js"></script>
<script src="/supertrader/assets/supertrader.js"></script>
<!-- ${up || './'} -->
</body>
</html>
`;
}

export function renderPage(opts) { return pageShell(opts); }

function writeIfChanged(file, content) {
  if (exists(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeStaticPages() {
  const pages = [
    ['index.html', 'home', 'Supertrader — Vision Universe®', 'Bewährte Strategien, transparente Regeln, ehrliche Backtests und laufende Modell-Signale.', 1],
    ['signals/index.html', 'signals', 'Signale — Supertrader — Vision Universe®', 'Signalzentrum: Setup, Einstieg bereit, ausgelöst, aktiv, abgeschlossen — mit vollständiger Historie.', 2],
    ['strategies/index.html', 'strategies', 'Strategien — Supertrader — Vision Universe®', 'Alle Strategy Worlds von Supertrader mit Research-, Daten- und Backteststatus.', 2],
    ['backtests/index.html', 'backtests', 'Backtest Lab — Supertrader — Vision Universe®', 'Backtest Lab: Gates, Datenabdeckung, Ausführungsannahmen und Vergleich der Strategien.', 2],
    ['stock/index.html', 'stock', 'Strategy Lens — Supertrader — Vision Universe®', 'Welche Supertrader-Modelle einen Titel erkennen.', 2],
    ['beispiel/index.html', 'replay', 'Beispiel eines Modell-Zyklus — Supertrader — Vision Universe®', 'Historisches Beispiel an echten Kursen: wie Bestätigung, Einstieg, Stop und Ausstieg ablaufen. Kein aktuelles Signal.', 2],
    ['sources/index.html', 'sources', 'Quellen — Supertrader — Vision Universe®', 'Source Ledger und Methodik der Supertrader-Strategien.', 2],
    ['hausstrategie/index.html', 'house', 'VU Hausstrategie — Supertrader — Vision Universe®', 'Die eigene Vision-Universe-Strategie: eingefrorene Regeln, Beobachtungsdepot mit Zeitstempel und ehrliche Prüfgeschichte.', 2],
  ];
  for (const [file, page, title, description, depth] of pages) writeIfChanged(path.join(OUT, file), pageShell({ title, description, page, depth }));
}

function writeStrategyPages(registry) {
  for (const s of registry.strategies) {
    writeIfChanged(path.join(OUT, 'strategies', s.slug, 'index.html'), pageShell({ title: `${LIVE_CLASSIFICATION[s.strategy_id]?.displayName || s.world_name} — Supertrader — Vision Universe®`, description: `${s.strategy_name}: Regeln, Evidenz, Signale und Backteststatus.`, page: 'strategy', depth: 3, attrs: ` data-strategy="${s.strategy_id}"` }));
  }
}

/** Alle Symbole, die irgendwo in einem Ausgabeobjekt als `symbol` stehen. */
export function symbolsIn(x, out = new Set()) {
  if (Array.isArray(x)) for (const y of x) symbolsIn(y, out);
  else if (x && typeof x === 'object') {
    if (typeof x.symbol === 'string') out.add(x.symbol);
    for (const v of Object.values(x)) if (v && typeof v === 'object') symbolsIn(v, out);
  }
  return out;
}

/* Was nur die Strategie-Detailseite (renderStrategy) aus der Registry liest. */
export const REGISTRY_DETAIL_FIELDS = ['rules', 'processChain'];

/** registry.json ohne Detailtexte: Regeln, Prozesskette, Regel-Herkunft
    (fidelity.rules) und alle Regelkarten ausser der ersten (card0). */
export function registryCore(registry) {
  const strategies = registry.strategies.map((s) => {
    const c = { ...s };
    for (const k of REGISTRY_DETAIL_FIELDS) delete c[k];
    if (c.fidelity) { c.fidelity = { ...c.fidelity }; delete c.fidelity.rules; }
    if (Array.isArray(c.rule_cards)) c.rule_cards = c.rule_cards.slice(0, 1);
    return c;
  });
  return { ...registry, slice: 'core', strategies };
}

/* Die Listen, die nur Signalliste und Aktienseite brauchen. */
export const HISTORY_LISTS = ['invalidated', 'retired', 'scanner'];

/* Steht in build.json, sobald signals-core.json und stock/<SYM>.json geschrieben sind. */
export const SLICES_VERSION = 'signals-slices-1';

/** signals.json ohne die Historienlisten; Zaehler (invalidatedTotal ...) bleiben. */
export function signalsCore(signals) {
  const strategies = {};
  for (const [id, st] of Object.entries(signals.strategies || {})) {
    const c = { ...st };
    for (const k of HISTORY_LISTS) delete c[k];
    strategies[id] = c;
  }
  return { ...signals, slice: 'core', strategies };
}

/** Je Symbol genau die Eintraege, die die Aktienseite liest (renderStock). */
export function signalsBySymbol(signals, extra = []) {
  const out = {};
  const syms = new Set([...Object.keys(signals.bySymbol || {}), ...extra].filter((x) => /^[A-Z0-9.\-]+$/.test(x)));
  /* Ohne asOf/inputsGeneratedAt/counts: die wechseln jeden Tag und haetten
     sonst jeden Ausschnitt taeglich neu geschrieben (Repo-Wachstum). Den
     Stand liefert build.json; die Seite setzt ihn ein. */
  const head = { schema: signals.schema, policy: signals.policy, disclaimer: signals.disclaimer };
  for (const sym of syms) {
    const strategies = {};
    for (const [id, st] of Object.entries(signals.strategies || {})) {
      const mine = (list) => (list || []).filter((x) => x.symbol === sym);
      const scanner = st.scanner ? { ...st.scanner, top: mine(st.scanner.top) } : { top: [] };
      strategies[id] = { ...st, open: mine(st.open), closed: mine(st.closed), invalidated: mine(st.invalidated), retired: mine(st.retired), scanner };
    }
    const partialChecks = {};
    for (const [id, pc] of Object.entries(signals.partialChecks || {})) {
      partialChecks[id] = { ...pc, candidates: (pc.candidates || []).filter((r) => r.symbol === sym), near: (pc.near || []).filter((r) => r.symbol === sym) };
    }
    /* Die Aktienseite liest nur den Ausschnitt: er traegt die
       Discover-Verfuegbarkeit seines Symbols mit, sonst zeigte sie fuer LOGI
       wieder den toten Link (#418). */
    const av = signals.discoverAvailability;
    const discoverAvailability = av ? { source: av.source, unavailable: (av.unavailable || []).filter((x) => x === sym), note: av.note } : undefined;
    out[sym] = { ...head, slice: 'stock', symbol: sym, bySymbol: signals.bySymbol && signals.bySymbol[sym] ? { [sym]: signals.bySymbol[sym] } : {}, strategies, partialChecks, discoverAvailability };
  }
  return out;
}

/** Welche Titel mit Supertrader-Seite haben (k)eine Discover-Aktienseite? */
export function discoverAvailability(symbols, indexSymbols) {
  const index = new Set(indexSymbols);
  const checked = [...new Set(symbols)].sort();
  return {
    source: 'discover/data/stock-index/US_REAL.json',
    checked: checked.length,
    unavailable: checked.filter((s) => !index.has(s)),
    note: 'Titel mit Supertrader-Seite ohne Discover-Aktienseite (z. B. vom Faktor-Qualitaetsgate gesperrt). Signale bleiben unveraendert; die Seite zeigt einen Hinweis statt des Links.'
  };
}

function writeStockPages(signals, extra = []) {
  for (const sym of new Set([...Object.keys(signals.bySymbol), ...extra])) {
    if (!/^[A-Z0-9.\-]+$/.test(sym)) continue;
    writeIfChanged(path.join(OUT, 'stock', sym, 'index.html'), pageShell({ title: `${sym} — Strategy Lens — Supertrader — Vision Universe®`, description: `Welche Supertrader-Modelle ${sym} erkennen — Status, Trigger, Risiko und Historie.`, page: 'stock', depth: 3, attrs: ` data-symbol="${sym}"` }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}
