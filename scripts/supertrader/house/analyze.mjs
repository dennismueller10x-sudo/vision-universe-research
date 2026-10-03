#!/usr/bin/env node
// VU Hausstrategie HS1 (PREREGISTRATION-HS1.json): Entwicklungs- und Holdout-Lauf auf dem
// Point-in-Time-Universum inklusive delisteter Titel. Ausgabe nur verschluesselt; Log nur Zaehlwerte.
//
//   node scripts/supertrader/house/analyze.mjs --mode dev|holdout --out DIR [--limit N]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { loadPitData } from '../validation/analyze-methods.mjs';
import { PIT_KEY_R12 } from '../validation/sec-pit.mjs';
import { prepareStock, crossSection, simulate, monthEnds, HS1 } from './engine.mjs';
import { metrics, deflatedSharpe, pboCscv, moments } from './stats.mjs';
import { truncateForDevelopment, DEV_END, assertFrozen, sealAll, fileHash } from './seal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const W = L.WINDOW;
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const PREREG = readJson('PREREGISTRATION-HS1.json');
const DEV_FROM = PREREG.periods.development.from;

// Versuchsreihen. HS2 erbt Zeitraeume und Kontrollen von HS1 (PREREGISTRATION-HS2.json "inherits").
export const SETS = {
  hs1: { prereg: 'PREREGISTRATION-HS1.json', frozen: 'FROZEN-HS1.json', cfg: (t) => ({ factors: t.factors, n: t.n, regime: t.regime }),
    selectable: (t) => t.turnover <= 3, pboIds: (ids) => ids, randomControls: true },
  hs2: { prereg: 'PREREGISTRATION-HS2.json', frozen: 'FROZEN-HS2.json', cfg: (t) => ({ weighting: 'INDEX_TILT', factors: t.factors, tau: t.tau || 0, cut: !!t.cut }),
    selectable: (t) => t.def.id !== 'E00' && t.turnover <= 1 && t.metrics.excessCagr > 0, pboIds: (ids) => ids.filter((id) => id !== 'E00'), priorSets: ['hs1'], control: 'E00' },
};

const slimMonthly = (m) => m.monthly.map((x) => [x.month, +x.r.toFixed(6), +x.b.toFixed(6)]);
const summary = (m) => { const { monthly, ...rest } = m; return { ...rest, monthly: slimMonthly(m) }; };

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const MODE = arg('--mode', 'dev');
  const SET = arg('--set', 'hs1');
  if (!SETS[SET]) throw new Error('--set hs1|hs2');
  const OUT = arg('--out', path.join(os.tmpdir(), 'house'));
  const LIMIT = Number(arg('--limit', '0'));
  if (!['dev', 'holdout'].includes(MODE)) throw new Error('--mode dev|holdout');
  const frozen = MODE === 'holdout' ? assertFrozen(here, SETS[SET].frozen) : null;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[house-${SET}-${MODE} +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

  const d = await loadPitData({ LIMIT, log, excludeNonEquity: true, secPit: true, secPitKey: PIT_KEY_R12, cross: false });
  const result = runAnalysis(d, { MODE, SET, LIMIT, frozen, log });
  const keys = { owner: path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), session: path.join(here, 'session-public-key.pem') };
  const files = sealAll(OUT, `house-${SET}-${MODE}${LIMIT ? '-smoke' : ''}`, result, keys);
  log(`Verschluesselt geschrieben: ${files.length} Dateien`);
}

// Rechnung auf bereits geladenen Daten (loadPitData-Form); getrennt, damit Tests sie pruefen koennen.
export function runAnalysis(d, { MODE, SET = 'hs1', LIMIT = 0, frozen = null, log = () => {} }) {
  const S = SETS[SET], P = readJson(S.prereg);
  let segs = d.segs;
  const end = MODE === 'dev' ? DEV_END : W.to;
  if (MODE === 'dev') { segs = truncateForDevelopment(segs); log(`Entwicklungssperre: Segmente nach Kuerzung ${segs.length}`); }

  // Kalender und SPY (Gesamtrendite, Verhaeltnis Schluss/SMA200) nur bis zum Modusende.
  const spy = d.spyAdj;
  const calendar = spy.date.filter((x) => x >= W.warmupFrom && x <= end);
  const calIndex = new Map(calendar.map((x, i) => [x, i]));
  const bench = new Map(); const spySma = new Float64Array(calendar.length).fill(NaN);
  { let v = 1, sum = 0; const closes = [];
    for (let i = 0; i < spy.date.length; i++) {
      const x = spy.date[i]; if (x > end) break;
      if (i > 0 && spy.tr[i] != null) v *= 1 + spy.tr[i];
      closes.push(spy.close[i]); sum += spy.close[i]; if (closes.length > HS1.regimeSma) sum -= closes[closes.length - 1 - HS1.regimeSma];
      const k = calIndex.get(x); if (k === undefined) continue;
      bench.set(x, v); if (closes.length >= HS1.regimeSma) spySma[k] = spy.close[i] / (sum / HS1.regimeSma);
    } }

  let fundSegs = 0;
  const stocks = [];
  for (const seg of segs) {
    const raw = seg.raw.filter((b) => calIndex.has(b.date));
    if (raw.length < 30) continue;
    const a = L.adjustSeries(raw);
    if (seg.fund) fundSegs++;
    stocks.push(prepareStock({ id: seg.id, survivor: seg.survivor, delisted: seg.delisted, date: a.date, open: a.open, high: a.high, close: a.close,
      rawClose: a.rawClose, rawVolume: a.rawVolume, divAdj: a.divAdj, fund: seg.fund || null }, calIndex));
    seg.raw = null;
  }
  segs = null;
  log(`Aktien ${stocks.length}, delistet ${stocks.filter((s) => s.delisted).length}, mit SEC-Werten ${fundSegs}`);

  const startDate = MODE === 'dev' ? DEV_FROM : PREREG.periods.holdout.from;
  const startK = calIndex.get(startDate), endK = calendar.length - 1;
  if (startK === undefined) throw new Error('Startdatum nicht im Kalender: ' + startDate);
  const fullStartK = calIndex.get(DEV_FROM);

  // Querschnitt je Entscheidungstag einmal rechnen (fuer alle Versuche identisch).
  const cache = new Map();
  const section = (pool) => (k) => { const key = pool.tag + ':' + k; if (!cache.has(key)) cache.set(key, crossSection(pool.list, k, calendar[k])); return cache.get(key); };
  const ALL = { tag: 'all', list: stocks };
  const coverage = [];
  for (const k of monthEnds(calendar, Math.min(startK, fullStartK ?? startK), endK - 1)) {
    const e = section(ALL)(k);
    coverage.push({ date: calendar[k], eligible: e.length, sue: e.filter((x) => Number.isFinite(x.SUE)).length, revg: e.filter((x) => Number.isFinite(x.REVG)).length, delistedLater: e.filter((x) => x.st.delisted).length });
  }
  log(`Querschnitte ${coverage.length}`);

  const run = (cfg, pool = ALL, s = startK) => simulate(pool.list, calendar, { scenario: 'S1_MINUS_30', ...cfg, startK: s, endK, spySma, sectionCache: section(pool) });
  const runTrials = (prereg, set) => {
    const out = {};
    for (const t of prereg.trials) {
      const r = run(set.cfg(t));
      out[t.id] = { def: t, metrics: summary(metrics(r.equity, bench)), turnover: r.turnover, costs: r.costs, meanPositions: r.meanPositions, terminalCount: r.terminalCount,
        reconcile: Math.abs(r.equity.at(-1).equity - (r.cashEnd + r.openValueEnd)), lastHoldings: r.log.at(-1)?.holdings.slice(0, 30).map((id) => id.split(':')[2]) || [] };
      log(`${t.id} fertig`);
    }
    return out;
  };
  const activeSr = (t) => { const mm = moments(t.metrics.monthly.map((m) => m[1] - m[2])); return mm.sdSample > 0 ? mm.mean / mm.sdSample : 0; };
  const trials = runTrials(P, S);

  // Auswahl (nur im Entwicklungsmodus massgeblich), Regel je Versuchsreihe vorab registriert.
  const ok = Object.values(trials).filter(S.selectable);
  const best = ok.sort((a, b) => (b.metrics.infoRatio ?? -Infinity) - (a.metrics.infoRatio ?? -Infinity))[0] || null;
  const selectedId = MODE === 'holdout' ? frozen.selectedTrial : best?.def.id || null;
  const sel = selectedId ? P.trials.find((t) => t.id === selectedId) : null;

  // Statistik: PBO ueber die Versuche dieser Reihe, DSR ueber ALLE je gerechneten Versuche (auch fruehere Reihen).
  const ids = S.pboIds(P.trials.map((t) => t.id));
  const months = trials[ids[0]].metrics.monthly.map((x) => x[0]);
  const matrix = months.map((_, i) => ids.map((id) => { const m = trials[id].metrics.monthly[i]; return m ? m[1] - m[2] : 0; }));
  const srTrials = P.trials.map((t) => activeSr(trials[t.id]));
  for (const ps of S.priorSets || []) { const prior = runTrials(readJson(SETS[ps].prereg), SETS[ps]); for (const t of Object.values(prior)) srTrials.push(activeSr(t)); }
  const stats = { pbo: pboCscv(matrix, 8), trialsCounted: srTrials.length, dsrActive: sel ? deflatedSharpe(trials[selectedId].metrics.monthly.map((m) => m[1] - m[2]), srTrials) : null };

  // Kontrollen fuer den gewaehlten Versuch.
  const controls = {};
  const SURV = { tag: 'surv', list: stocks.filter((s) => s.survivor) };
  const base = sel ? S.cfg(sel) : null;
  if (sel) {
    for (const [key, cfg] of Object.entries({ S0: { scenario: 'S0_LAST_PRICE' }, S2: { scenario: 'S2_DISTRESS_ZERO' }, COST2: { slippageBps: 20, commissionBps: 2 } })) {
      const r = run({ ...base, ...cfg }); controls[key] = summary(metrics(r.equity, bench)); controls[key].turnover = r.turnover;
    }
    { const r = run(base, SURV); controls.SURVIVORS = summary(metrics(r.equity, bench)); }
  }
  if (S.randomControls) {
    { const r = run({ ewUniverse: true }); controls.EW_UNIVERSE = summary(metrics(r.equity, bench)); controls.EW_UNIVERSE.turnover = r.turnover; }
    const random = [];
    for (let s = 1; s <= 20; s++) { const r = run({ random: s, n: 30 }); const m = metrics(r.equity, bench); random.push({ seed: s, cagr: m.cagr, excessCagr: m.excessCagr, infoRatio: m.infoRatio, maxDrawdown: m.maxDrawdown }); }
    controls.RANDOM = random;
  }
  log('Kontrollen fertig');

  let holdout = null;
  if (MODE === 'holdout') {
    const s1 = trials[selectedId].metrics;
    const devPart = frozen.development || null;
    const H = {
      H1: s1.excessCagr > 0, H2: controls.COST2.excessCagr > 0, H3: devPart ? devPart.excessCagr > 0 : null, H4: controls.S2.excessCagr > 0, H5: devPart ? devPart.pbo < 0.5 : null,
    };
    if (S.control) H.H6 = s1.cagr > trials[S.control].metrics.cagr;
    H.verdict = Object.values(H).every((v) => v === true) ? 'CRITERIA_MET' : 'TESTED_NO_EDGE';
    // Durchgehender Lauf 2016-2026 als Zusatz (nicht Teil des Urteils).
    const full = run(base, ALL, fullStartK);
    const fm = metrics(full.equity, bench);
    holdout = { criteria: H, full: summary(fm), fullDsr: deflatedSharpe(fm.monthly.map((x) => x.r - x.b), srTrials) };
  }

  const result = {
    schema: 'supertrader-house-result-1.1.0', set: SET, mode: MODE, limit: LIMIT || null, at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
    hashes: { prereg: fileHash(path.join(here, S.prereg)), engine: fileHash(path.join(here, 'engine.mjs')), stats: fileHash(path.join(here, 'stats.mjs')), listingTable: d.hash },
    period: { from: calendar[startK], to: calendar[endK] }, universe: { stocks: stocks.length, delisted: stocks.filter((s) => s.delisted).length, survivors: SURV.list.length, withSec: fundSegs, nonEquityExcluded: d.nonEquityExcluded, secCoverage: d.secCoverage },
    coverage, trials, selection: { rule: P.selection, selected: selectedId, candidates: ok.length }, stats, controls, holdout,
  };
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
