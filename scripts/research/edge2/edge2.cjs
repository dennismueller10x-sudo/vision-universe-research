'use strict';
// Edge 2 (docs/research/edge2/PROTOKOLL.json, SHA-256 in protocol-pin.cjs). Forschung, nicht zertifiziert.
// Teil 1: Quant-Merkliste + Einstieg an einer Zone der Technical-Engine, lange gehalten. Teil 2: Risiko-Overlay auf
// Value Momentum N20. Keine Fachengine wird geändert: Auswahlpool aus quant-e3.cjs#createSelector, Ledger und Kosten aus
// quant-e3.cjs#ledgerFromTargets (wie E3 und Holdout H), Zonen aus scripts/research/signals/study.mjs#detect (wie S2).
// Die Zonenerkennung wird als Funktion zoneAt(id, t) übergeben; dieses Modul liest keine Dateien.
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const Q = require('../edge/quant-e3.cjs');
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const VERSION = 'edge2-adapter-1.0.0';
const ZONE_TEMPLATES = Object.freeze(['PULLBACK_TO_SUPPORT', 'BREAKOUT_RETEST', 'DEEPER_CORRECTION']);
const EPS = 1e-9, E_STEP = 0.10;
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : P.canonical(x)).digest('hex');
const at = d => d + 'T23:59:59.999Z';
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }

function standardFor(n) { return { minPositions: n, maxPositions: n, targetPositions: n, maxPositionWeight: Math.max(.08, 1 / n) }; }

function windowIndex(panel, window) {
  const cal = panel.calendar, bench = panel.benchmark.levels;
  const idx = [...cal.keys()].filter(i => cal[i] >= window[0] && cal[i] <= window[1] && bench[i] > 0);
  if (idx.length < 60) fail('WINDOW_TOO_SHORT');
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1) fail('BENCHMARK_GAP_IN_WINDOW', cal[idx[k]]);
  return idx;
}
// Letzter Index mit Kurs bzw. Endindex wie ledgerFromTargets (Delisting oder Reihenende vor Fensterende).
function terminalIdx(s, last) {
  if (s._term !== undefined) return s._term;
  let lastObs = s.adj.length - 1; while (lastObs >= 0 && !(s.adj[lastObs] > 0)) lastObs--;
  let term = null;
  if (s.terminal && s.terminal.lastIdx < last) term = s.terminal.lastIdx;
  if (term === null && lastObs < last) term = lastObs;
  s._term = term;
  return term;
}
const recoveryOf = s => BT.DEFAULTS.terminalRecovery[s.terminal ? s.terminal.kind : 'SERIES_END'];

/** Zonen-Prädikat aus einem S2-Analyseergebnis (study.mjs#detect) und trade-setup.js. */
function isZone(analysis, Trade) {
  for (const s of analysis.scenarios.scenarios) {
    if (s.direction !== 'BULLISH' || !ZONE_TEMPLATES.includes(s.template)) continue;
    if (s.status !== 'ACTIVE' || s.entryStatus !== 'ACTIVE') continue;
    const setup = Trade.buildTradeSetup(s, { close: analysis.lastBar.close, atr: analysis.featuresAtCutoff.atr, averageVolume: analysis.featuresAtCutoff.averageVolume });
    if (['COMPLETE', 'COMPLETE_LOW_RR'].includes(setup.status)) return s.template;
  }
  return null;
}

// ------------------------------------------------------------ Teil 1
function runTeil1(panel, selector, v, { window, anchorDate, zoneAt }) {
  if (!['ZONE', 'NOW'].includes(v.entry)) fail('ENTRY_UNKNOWN', v.entry);
  const cal = panel.calendar, idx = windowIndex(panel, window), first = idx[0], last = idx.at(-1);
  const anchor = cal.indexOf(anchorDate);
  if (anchor < 0 || anchor > first) fail('ANCHOR_INVALID', anchorDate);
  const W = 13, n = v.n, standard = standardFor(n), std = C.standardOf(standard);
  const byId = new Map(panel.securities.map(s => [s.id, s]));
  const scheduled = t => (t - anchor) % W === 0;
  const t0 = anchor + Math.floor((first - anchor) / W) * W;
  let watch = null, keep = null;
  const stats = { rescores: 0, emptyPools: 0, zoneChecks: 0, zoneHits: 0, zoneByTemplate: {}, buys: 0, sells: 0, deferred: 0, terminal: 0, sectorSkips: 0, notTradable: 0, slotWeeks: 0, filledSlotWeeks: 0 };
  const rescore = t => {
    const p = selector.poolAt(t, v.profileId, std, v.profileFamilies);
    stats.rescores++;
    if (!p.pool.length) stats.emptyPools++;
    watch = p.pool.slice(0, 2 * n).map(c => ({ ...c, cap: C.liquidity(c, std).cap }));
    keep = new Set(p.pool.slice(0, 4 * n).map(c => c.id));
  };
  if (t0 < first) rescore(t0);
  // Schatten-Depot in Gesamtrendite-Einheiten (ohne Kosten) nur zur Bemessung der Zielgewichte; gerechnet wird im Ledger.
  const units = new Map(), hs = new Map();
  let cash = 1e6;
  const targets = [], memberships = [];
  for (let t = first; t < last; t++) {
    if (scheduled(t)) rescore(t);
    const e = t + 1;
    // Delisting / Reihenende: Barausgleich wie TERMINAL_CASH.
    for (const [id, u] of [...units]) {
      const s = byId.get(id), term = terminalIdx(s, last);
      if (term !== null && term < e) { cash += u * s.adj[term] * recoveryOf(s); units.delete(id); stats.terminal++; }
    }
    stats.slotWeeks += n; stats.filledSlotWeeks += units.size;
    if (!watch) continue;
    const sells = scheduled(t) ? [...units.keys()].filter(id => !keep.has(id)) : [];
    let free = n - (units.size - sells.length);
    const sector = {};
    for (const id of units.keys()) if (!sells.includes(id)) { const k = byId.get(id).sector; sector[k] = (sector[k] || 0) + 1; }
    const buys = [];
    for (const c of watch) {
      if (free <= 0) break;
      if (units.has(c.id) || !(c.cap > 0)) continue;
      if (((sector[c.sector] || 0) + 1) / n > std.maxSectorWeight + EPS) { stats.sectorSkips++; continue; }
      const s = byId.get(c.id), term = terminalIdx(s, last);
      if (!(s.adj[e] > 0) || (term !== null && term < e)) { stats.notTradable++; continue; }
      if (v.entry === 'ZONE') {
        stats.zoneChecks++;
        const z = zoneAt(c.id, t);
        if (!z) continue;
        stats.zoneHits++; stats.zoneByTemplate[z] = (stats.zoneByTemplate[z] || 0) + 1;
      }
      buys.push(c); free--; sector[c.sector] = (sector[c.sector] || 0) + 1;
    }
    if (!sells.length && !buys.length) continue;
    // Ein gehaltener Titel ohne Kurs an t+1 (Datenlücke): Aktion um eine Woche verschieben.
    if ([...units.keys()].some(id => !(byId.get(id).adj[e] > 0))) { stats.deferred++; continue; }
    let V = cash;
    for (const [id, u] of units) V += u * byId.get(id).adj[e];
    for (const id of sells) { cash += units.get(id) * byId.get(id).adj[e]; units.delete(id); stats.sells++; }
    for (const c of buys) {
      const w = Math.min(1 / n, c.cap, Math.max(0, cash / V));
      if (!(w > EPS)) continue;
      units.set(c.id, w * V / byId.get(c.id).adj[e]); cash -= w * V; hs.set(c.id, C.halfSpreadBps(c).bps); stats.buys++;
    }
    const weights = {};
    for (const [id, u] of units) weights[id] = u * byId.get(id).adj[e] / V;
    const members = Object.keys(weights).sort(), mh = sha({ date: cal[t], members, variant: v.id });
    memberships.push({ effectiveAt: cal[t] + 'T00:00:00Z', availableAt: cal[t] + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: cal[t], executionDate: cal[e], availableAt: at(cal[t]), membershipHash: mh, weights, hs: Object.fromEntries(members.map(id => [id, hs.get(id)])) });
  }
  // Mitgliedschaften gelten bis zur nächsten Aktion; die Frist umfasst deshalb das ganze Fenster.
  const ledger = Q.ledgerFromTargets(panel, { initialCapital: 1e6, terminalRecovery: BT.DEFAULTS.terminalRecovery }, std, idx, targets, memberships, idx.length);
  return { variantId: v.id, window: [cal[first], cal[last]], ...ledger, construction: { ...stats, targetsEmitted: targets.length, averageSlotsFilled: stats.slotWeeks ? stats.filledSlotWeeks / stats.slotWeeks : null } };
}

// ------------------------------------------------------------ Teil 2
const BASE = Object.freeze({ id: 'Q-value-momentum-N20-W13-F0', family: 'quant', profileId: 'value-momentum', n: 20, weeks: 13, filter: false, standard: standardFor(20) });

/** Investitionsquote je Woche t nach Protokoll; ctx: { filterStateAt, baseReturnsUntil(t), spyLevels, cal }. */
function exposureFn(overlay, ctx) {
  const trend = t => { const st = ctx.filterStateAt(ctx.cal[t]); return st === true ? 1 : 0.5; };
  const vol = t => {
    const r = ctx.baseReturnsUntil(t);
    if (r.length < 26) return 1;
    const x = r.slice(-26), m = x.reduce((s, y) => s + y, 0) / 26, sd = Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / 25) * Math.sqrt(52);
    return sd > 0 ? Math.min(1, 0.15 / sd) : 1;
  };
  let mom = null;
  const absmom = t => {
    const cal = ctx.cal, newMonth = t === 0 || cal[t].slice(0, 7) !== cal[t - 1].slice(0, 7);
    if (newMonth || mom === null) { const a = ctx.spyLevels[t], b = ctx.spyLevels[t - 52]; mom = a > 0 && b > 0 ? (a / b - 1 > 0 ? 1 : 0) : 0; }
    return mom;
  };
  if (overlay === 'TREND50') return trend;
  if (overlay === 'VOL15') return vol;
  if (overlay === 'TREND50_VOL15') return t => trend(t) * vol(t);
  if (overlay === 'ABSMOM12') return absmom;
  if (overlay === 'F1_PARITY') return t => (ctx.filterStateAt(ctx.cal[t]) === true ? 1 : 0); // nur Paritätstest gegen E3 F1
  fail('OVERLAY_UNKNOWN', overlay);
}

// Schleife wie quant-e3.cjs#runVariant; der Marktfilter (0/1) ist durch die Quote e ersetzt.
function runTeil2(panel, selector, overlay, { window, anchorDate, filterStateAt, baseEquity = null, id = 'E2-T2-' + overlay, base = BASE }) {
  const variant = base, cal = panel.calendar, idx = windowIndex(panel, window), first = idx[0], last = idx.at(-1);
  const byId = new Map(panel.securities.map(s => [s.id, s]));
  const anchor = cal.indexOf(anchorDate);
  if (anchor < 0 || anchor > first) fail('ANCHOR_INVALID', anchorDate);
  const std = C.standardOf(variant.standard);
  const scheduled = t => (t - anchor) % variant.weeks === 0;
  const t0 = anchor + Math.floor((first - anchor) / variant.weeks) * variant.weeks;
  const pos = new Map((baseEquity || []).map(([d], i) => [d, i]));
  const baseReturnsUntil = t => { const k = pos.get(cal[t]); if (k === undefined) return []; const out = []; for (let i = 1; i <= k; i++) out.push(baseEquity[i][1] / baseEquity[i - 1][1] - 1); return out; };
  const ex = exposureFn(overlay, { filterStateAt, baseReturnsUntil, spyLevels: panel.benchmark.levels, cal });
  const decisions = [], targets = [], memberships = [], unfilled = [], exposures = [];
  let current = null, lastE = null, tooFew = 0, switches = 0;
  const pickAt = t => { const d = selector.select(t, variant.profileId, 'EQUAL', variant.standard, variant.profileFamilies); decisions.push(d); if (d.built.state === 'CONSTRUCTED') current = d; else tooFew++; };
  if (t0 < first) pickAt(t0);
  for (let t = first; t < last; t++) {
    if (scheduled(t)) pickAt(t);
    const e0 = ex(t);
    exposures.push(e0);
    if (!current) continue;
    const rebalance = scheduled(t) && e0 > 0 && current.t === t;
    const changed = lastE === null ? e0 > 0 && Object.keys(current.built.weights).length > 0 : Math.abs(e0 - lastE) >= E_STEP - EPS;
    if (!rebalance && !changed) continue;
    if (lastE !== null && changed) switches++;
    const ex1 = t + 1, w = {};
    for (const [sid, x] of Object.entries(current.built.weights)) {
      if (!(e0 > 0)) break;
      const s = byId.get(sid);
      if (s.adj[ex1] > 0 && !(s.terminal && s.terminal.lastIdx < ex1)) w[sid] = x * e0; else unfilled.push({ date: cal[ex1], id: sid, weight: x * e0 });
    }
    const members = Object.keys(w).sort(), mh = sha({ date: cal[t], members, variant: id });
    memberships.push({ effectiveAt: cal[t] + 'T00:00:00Z', availableAt: cal[t] + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: cal[t], executionDate: cal[ex1], availableAt: at(cal[t]), membershipHash: mh, weights: w, hs: current.built.halfSpreadBps || {} });
    lastE = e0;
  }
  const ledger = Q.ledgerFromTargets(panel, { initialCapital: 1e6, terminalRecovery: BT.DEFAULTS.terminalRecovery }, std, idx, targets, memberships, variant.weeks);
  const avg = exposures.length ? exposures.reduce((s, x) => s + x, 0) / exposures.length : null;
  return { variantId: id, window: [cal[first], cal[last]], ...ledger,
    construction: { selections: decisions.length, tooFewEligible: tooFew, targetsEmitted: targets.length, unfilledAtExecution: unfilled.length, exposureSwitches: switches, averageExposure: avg, minExposure: exposures.length ? Math.min(...exposures) : null } };
}

module.exports = { VERSION, ZONE_TEMPLATES, BASE, standardFor, isZone, runTeil1, runTeil2, exposureFn };
