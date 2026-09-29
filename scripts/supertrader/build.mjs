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
import { computeIndicators, percentileRanks, isoWeekKey, sma } from './engine/indicators.mjs';
import { simulate, rescaleSignal } from './engine/simulator.mjs';
import { STATES, STATE_LABELS, TERMINAL, PENDING } from './engine/lifecycle.mjs';
import { describeExecution } from './engine/execution.mjs';
import { evaluateGates, GATE_DEFS, MIN_HISTORY_YEARS } from './engine/gates.mjs';
import { PORTFOLIO_DEFAULTS } from './engine/backtest.mjs';
import kkBreakout from './engine/strategies/kk-breakout.mjs';
import darvas from './engine/strategies/darvas.mjs';
import minervini from './engine/strategies/minervini.mjs';
import weinstein from './engine/strategies/weinstein.mjs';
import greenblatt from './engine/strategies/greenblatt.mjs';
import { STRATEGIES, REGISTRY_VERSION, DNA_FIELDS, INTERNAL_SOURCES } from './registry.mjs';

export const BUILD_VERSION = 'supertrader-build-1.0.0';
let CURRENT_REGIME = null;
export const LIVE_ENGINES = [kkBreakout, weinstein, darvas, minervini];

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
function loadUniverse() {
  const idx = readJson(rel('discover/data/stock-index/US_REAL.json'));
  return new Set(idx.symbols);
}

function loadBars(universe) {
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
  const p = rel('quant/data/market/discover-series-long', `ref_${sym}.json`);
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

// Wochenreihe: lange Wochenschlusskurse + aus Tagesbalken abgeleitete Wochen
// danach. Volumen nur, wo Tagesbalken existieren. weekAt[t] ist nur an
// VOLLSTAENDIGEN Wochenenden gesetzt (naechster Balken in neuer Woche, oder
// letzter Balken an einem Freitag).
function buildWeekly(inst, longPoints, bench) {
  const { bars } = inst;
  const weeks = new Map();
  for (const [d, c] of longPoints || []) weeks.set(isoWeekKey(String(d).slice(0, 10)), { date: String(d).slice(0, 10), close: c, volume: null });
  const n = bars.date.length;
  const weekAt = new Array(n).fill(null);
  const dailyWeekEnd = new Map();
  for (let t = 0; t < n; t++) {
    const wk = isoWeekKey(bars.date[t]);
    const w = weeks.get(wk) || { date: bars.date[t], close: bars.close[t], volume: 0 };
    if (w.volume === null) w.volume = 0;
    w._daily = (w._daily || 0) + 1;
    w.volume += Number.isFinite(bars.volume[t]) ? bars.volume[t] : 0;
    w.close = bars.close[t]; w.date = bars.date[t];
    weeks.set(wk, w);
    const nextWk = t + 1 < n ? isoWeekKey(bars.date[t + 1]) : null;
    const complete = nextWk ? nextWk !== wk : new Date(bars.date[t] + 'T12:00:00Z').getUTCDay() === 5;
    if (complete) dailyWeekEnd.set(t, wk);
  }
  const keys = [...weeks.keys()].sort();
  // Die erste Woche im Tagesfenster ist moeglicherweise unvollstaendig
  // (Fenster beginnt mitten in der Woche): Volumen dort nicht verwenden.
  const firstDailyWeek = isoWeekKey(bars.date[0]);
  const w = { date: [], close: [], volume: [], key: [] };
  for (const k of keys) {
    const x = weeks.get(k);
    w.key.push(k); w.date.push(x.date); w.close.push(x.close);
    w.volume.push(x._daily && k !== firstDailyWeek ? x.volume : null);
  }
  w.ma30 = sma(w.close, 30);
  w.rs = w.close.map((c, i) => { const b = bench.byWeek.get(w.key[i]); return Number.isFinite(b) && b > 0 ? c / b : null; });
  w.volAvg = w.volume.map((_, i) => {
    let s = 0, c = 0;
    for (let j = i - 10; j < i; j++) if (j >= 0 && Number.isFinite(w.volume[j])) { s += w.volume[j]; c++; }
    return c >= 8 ? s / c : null;
  });
  const keyIndex = new Map(w.key.map((k, i) => [k, i]));
  for (const [t, wk] of dailyWeekEnd) weekAt[t] = keyIndex.get(wk);
  return { weekly: w, weekAt };
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
  const delistedWithPrices = inactive.filter((r) => exists(rel('quant/data/market/discover-series-long', `ref_${r.ticker}.json`))).length;
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
function loadLedger(engine) {
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

/* ------------------------------------------------------------ Main */
export function build() {
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

  const ctxOf = (inst) => ({ symbol: inst.symbol, bars: inst.bars, ind: inst.ind, cross: cross.get(inst.symbol), weekly: inst.weekly, weekAt: inst.weekAt });

  CURRENT_REGIME = readJson(rel('quant/data/product/market-regime-v1.json')).regime || null;
  /* --- Live-Lauf je Strategie --- */
  const scanner = {};
  const ledgers = {};
  for (const engine of LIVE_ENGINES) {
    const ledger = loadLedger(engine);
    const openBySymbol = new Map(ledger.open.map((s) => [s.symbol, s]));
    const lastProcessed = ledger.lastProcessed;
    const finishedNow = [];
    const stillOpen = [];
    const snap = [];
    for (const inst of instruments.values()) {
      const ctx = ctxOf(inst);
      if (engine.timeframe === 'weekly' && !inst.weekly) continue;
      const n = inst.bars.date.length;
      let from;
      if (lastProcessed) {
        from = inst.bars.date.findIndex((d) => d > lastProcessed);
        if (from < 0) from = n; // nichts Neues
      } else {
        // Erster Live-Lauf: KEINE Rueckrechnung - das waere ein verdeckter Backtest.
        from = n - 1;
        if (engine.timeframe === 'weekly') { let k = n - 1; while (k >= 0 && inst.weekAt[k] === null) k--; from = Math.max(0, k); }
      }
      const open = openBySymbol.get(inst.symbol) || null;
      if (open) {
        remapIndexes(open, inst);
        const anchorIdx = open.anchor ? inst.indexOf.get(open.anchor.date) : undefined;
        if (anchorIdx !== undefined && open.anchor.close > 0) {
          const factor = inst.bars.close[anchorIdx] / open.anchor.close;
          if (Math.abs(factor - 1) > 0.005) rescaleSignal(open, factor, asOf);
        }
      }
      const state = { signal: open, cooldownUntil: -1 };
      let res = { state, finished: [], lastScan: null };
      if (from < n) res = simulate(engine, ctx, { state, from, to: n - 1 });
      for (const s of res.finished) finishedNow.push(s);
      if (state.signal) {
        const last = n - 1;
        if (!state.signal.regimeAtCreation) state.signal.regimeAtCreation = CURRENT_REGIME;
        state.signal.anchor = { date: inst.bars.date[last], close: inst.bars.close[last] };
        state.signal.lastPrice = inst.bars.close[last];
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
    const closed = [...ledger.closed, ...finishedNow.filter((s) => s.state === 'CLOSED')];
    const invalidated = [...ledger.invalidated, ...finishedNow.filter((s) => s.state === 'INVALIDATED')];
    ledgers[engine.id] = {
      ...ledger, variant: engine.variant, version: engine.version,
      liveSince: ledger.liveSince || asOf, lastProcessed: asOf,
      open: stillOpen.map(stripForSave).sort((a, b) => a.symbol.localeCompare(b.symbol)),
      closed: closed.map(stripForSave), invalidated: invalidated.map(stripForSave),
    };
    snap.sort((a, b) => (a.stage === b.stage ? rankFact(b) - rankFact(a) : a.stage === 'WATCH' ? -1 : 1));
    scanner[engine.id] = { discovered: snap.filter((s) => s.stage === 'DISCOVERED').length, watch: snap.filter((s) => s.stage === 'WATCH').length, top: snap.slice(0, 60) };
    log(`${engine.id}: offen ${stillOpen.length}, neu abgeschlossen ${finishedNow.length}, Scanner ${snap.length}`);
  }

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
  const backtests = buildBacktests(registry, coverage, gbCoverage);

  writeJson(path.join(DATA, 'registry.json'), registry);
  writeJson(path.join(DATA, 'sources.json'), sources);
  writeJson(path.join(DATA, 'market.json'), market);
  writeJson(path.join(DATA, 'coverage.json'), { schema: 'supertrader-coverage-1.0.0', asOf, coverage, greenblatt: gbCoverage, unavailableInstruments: unavailable, gateDefinitions: GATE_DEFS, minHistoryYears: MIN_HISTORY_YEARS });
  writeJson(path.join(DATA, 'signals.json'), signals);
  writeJson(path.join(DATA, 'backtests.json'), backtests);
  for (const [id, l] of Object.entries(ledgers)) writeJson(ledgerPath(id), l);
  writeStockPages(signals);
  writeStrategyPages(registry);
  writeStaticPages();
  writeJson(path.join(DATA, 'build.json'), { buildVersion: BUILD_VERSION, registryVersion: REGISTRY_VERSION, asOf, inputsGeneratedAt: barsGeneratedAt });
  log(`fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s, Stand ${asOf}`);
  return { asOf, signals, backtests, coverage };
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

function buildRegistry(coverage, gbCoverage) {
  const engineParams = Object.fromEntries(LIVE_ENGINES.map((e) => [e.id, { variant: e.variant, version: e.version, params: e.PARAMS, timeframe: e.timeframe }]));
  return {
    schema: 'supertrader-registry-1.0.0', registryVersion: REGISTRY_VERSION, dnaFields: DNA_FIELDS,
    lifecycle: { states: STATES, labels: STATE_LABELS, persistedFrom: 'SETUP', scannerOnly: ['DISCOVERED', 'WATCH'] },
    execution: describeExecution(), portfolioDefaults: PORTFOLIO_DEFAULTS,
    strategies: STRATEGIES.map((s) => ({ ...s, engine: engineParams[s.strategy_id] || null })),
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
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  const decorate = (s) => {
    const fund = fundOf(s.symbol);
    const inst = instruments.get(s.symbol);
    const si = sicInfo().get(s.symbol) || {};
    const out = { ...s, sicDivision: si.division || null, sicDivisionName: si.name || null, companyName: fund?.companyName || s.symbol, chart: inst ? { shard: inst.shard, weeklyPath: `/quant/data/market/discover-series-long/ref_${s.symbol}.json` } : null };
    if (s.strategyId === 'MINERVINI_VCP' && fund) out.fundamentalsDisplay = { revenueGrowthTTM: fund.revenueGrowthTTM, earningsAcceleration: fund.earningsAcceleration, asOf: fund.fundamentalsAsOf, filtered: false };
    return out;
  };
  for (const [id, l] of Object.entries(ledgers)) {
    const open = l.open.map(decorate);
    const closed = l.closed.map(decorate).sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
    // Ungueltige Setups: die juengsten 150 im Produktartefakt, alle im Ledger.
    const invalidated = l.invalidated.slice().sort((a, b) => lastDate(b).localeCompare(lastDate(a))).slice(0, 150).map(decorate);
    for (const s of open) counts[s.state]++;
    counts.CLOSED += closed.length; counts.INVALIDATED += l.invalidated.length;
    counts.DISCOVERED += scanner[id].discovered; counts.WATCH += scanner[id].watch;
    const scan = scanner[id].top.map((x) => ({ ...x, sicDivision: sicInfo().get(x.symbol)?.division || null, sicDivisionName: sicInfo().get(x.symbol)?.name || null, companyName: fundOf(x.symbol)?.companyName || x.symbol, chart: instruments.get(x.symbol) ? { shard: instruments.get(x.symbol).shard, weeklyPath: `/quant/data/market/discover-series-long/ref_${x.symbol}.json` } : null }));
    strategiesOut[id] = { liveSince: l.liveSince, lastProcessed: l.lastProcessed, variant: l.variant, version: l.version, open, closed, invalidated, invalidatedTotal: l.invalidated.length, ledgerPath: `/supertrader/data/ledger/${id}.json`, scanner: { discovered: scanner[id].discovered, watch: scanner[id].watch, top: scan } };
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
function lastDate(s) { return s.transitions?.[s.transitions.length - 1]?.date || s.createdAt || ''; }

function buildBacktests(registry, coverage, gbCoverage) {
  const out = [];
  for (const s of registry.strategies.filter((x) => !x.advanced)) {
    for (const v of s.variants) {
      const engine = LIVE_ENGINES.find((e) => e.variant === v.variant_id);
      const timeframe = engine?.timeframe || (s.strategy_id === 'WEINSTEIN_STAGE' ? 'weekly' : 'daily');
      const gateId = v.variant_id === 'KK_COMMON_BREAKOUT_ORH' ? 'KK_COMMON_BREAKOUT_ORH' : mapVariant(v.variant_id);
      const g = evaluateGates(gateId, coverage, {
        timeframe, baselines: s.baselines, missingFields: s.strategy_id === 'GREENBLATT_VALUE' ? gbCoverage.missingFields : [],
      });
      out.push({
        strategyId: s.strategy_id, variantId: v.variant_id, label: v.label, active: v.active, vuFormalization: v.vu_formalization,
        status: g.status, metricsPublishable: g.metricsPublishable, metrics: null,
        gates: g.gates, failedGates: g.failedGates, baselines: s.baselines,
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
  };
}
function mapVariant(v) {
  if (v.startsWith('KK_COMMON_BREAKOUT')) return 'KK_COMMON_BREAKOUT_DAILY';
  if (v.startsWith('WEINSTEIN_STAGE2')) return 'WEINSTEIN_STAGE2_WEEKLY';
  if (v.startsWith('DARVAS')) return 'DARVAS_BOX_N3_VU';
  if (v.startsWith('MINERVINI')) return 'MINERVINI_TT_VCP_A';
  if (v.startsWith('GREENBLATT')) return 'GREENBLATT_US_ORIGINAL';
  return v;
}

/* ----------------------------------------------- statische Routen */
function pageShell({ title, description, page, depth, attrs = '' }) {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#07080c">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="stylesheet" href="/assets/site-navigation.css">
<link rel="stylesheet" href="/supertrader/assets/supertrader.css">
</head>
<body class="st" data-page="${page}"${attrs}>
<vu-navigation theme="dark" no-preview></vu-navigation>
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
    ['sources/index.html', 'sources', 'Quellen — Supertrader — Vision Universe®', 'Source Ledger und Methodik der Supertrader-Strategien.', 2],
  ];
  for (const [file, page, title, description, depth] of pages) writeIfChanged(path.join(OUT, file), pageShell({ title, description, page, depth }));
}

function writeStrategyPages(registry) {
  for (const s of registry.strategies) {
    writeIfChanged(path.join(OUT, 'strategies', s.slug, 'index.html'), pageShell({ title: `${s.world_name} — Supertrader — Vision Universe®`, description: `${s.strategy_name}: Regeln, Evidenz, Signale und Backteststatus.`, page: 'strategy', depth: 3, attrs: ` data-strategy="${s.strategy_id}"` }));
  }
}

function writeStockPages(signals) {
  for (const sym of Object.keys(signals.bySymbol)) {
    if (!/^[A-Z0-9.\-]+$/.test(sym)) continue;
    writeIfChanged(path.join(OUT, 'stock', sym, 'index.html'), pageShell({ title: `${sym} — Strategy Lens — Supertrader — Vision Universe®`, description: `Welche Supertrader-Modelle ${sym} erkennen — Status, Trigger, Risiko und Historie.`, page: 'stock', depth: 3, attrs: ` data-symbol="${sym}"` }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}
