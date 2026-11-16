'use strict';
// Gemeinsamer Kern der Quality-Margen-Pruefungen (Forschung, nicht zertifiziert; Steuerung 16.11.2026):
// Quality je Variante (Liste von Teilen) auf derselben Titelmenge, oberes gegen unteres Fuenftel (Q5 - Q1) und
// Rangkorrelation (IC) mit der Studien-Engine der V10-Rekonstruktion (runFactorStudy, Einstieg einen Balken spaeter),
// gepaarte Differenzen je Stichtag mit Newey-West-t und Holm ueber alle Vergleiche. Nur Mittelwerte und Zaehlungen.
const X = require('../v10/factor/factors.cjs');
const { neweyWest, nwBandwidth } = require('../v10/factor/study.cjs');
const F = require('../v10/factor/common.cjs');
const S = require(F.ROOT + '/quant/engines/research-studies.cjs');
const V = require(F.ROOT + '/quant/engines/research-validation.cjs');
const FE = require(F.ROOT + '/quant/engines/factor-evidence.js');
const C = F.C;

const BUCKETS = 5, MIN_SCORED = 200, MIN_OBSERVED = 100, H_MONTHS = { 4: 1, 13: 3, 26: 6, 52: 12 };
const QUALITY_BASE = X.COMPONENTS.quality.filter(([id]) => id !== 'operatingMarginStability');
const MARGIN_WEIGHT = 0.20;
// Mindestanforderung unabhaengig von der Variante (V10 mandatoryUnmet); assembleFactor gewichtet nur innerhalb des Faktors um.
const QUALITY_CONTRACT = { minimumDataRequirements: { minimumComponents: 1, minimumOriginalWeight: 0 } };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

/** Quality-Teile: die vier Basisteile plus hoechstens eine Margenkomponente (id, Richtung "lower"). */
function variant(marginId) { return marginId ? [...QUALITY_BASE, [marginId, MARGIN_WEIGHT, 'lower']] : QUALITY_BASE.slice(); }

/** Quality je Titel eines Stichtags; null, wo V10 Quality nicht vergibt (Branchenvorlage, Pflichtteile fehlen). */
function scoreQuality(rows, components) {
  const comp = {};
  for (const [id, , direction, noWinsor] of components) {
    const raws = rows.map(r => (r.template ? null : (X.finite(r.raws[id]) ? r.raws[id] : null)));
    const bounds = noWinsor ? null : FE.winsorBounds(raws);
    const vals = raws.map(v => (v === null ? null : FE.clamp(v, bounds)));
    comp[id] = vals.filter(v => v !== null).length >= X.UNIVERSE_MIN ? FE.midrankPercentiles(vals, direction) : rows.map(() => null);
  }
  return rows.map((r, k) => {
    if (r.template) return null;
    const parts = components.map(([id, weight]) => { const s = comp[id][k]; return { id, weight, state: X.finite(s) ? 'AVAILABLE' : 'UNAVAILABLE', score: X.finite(s) ? s : null }; });
    if (X.mandatoryUnmet('quality', id => parts.some(c => c.id === id && c.state === 'AVAILABLE'))) return null;
    const a = FE.assembleFactor(QUALITY_CONTRACT, parts);
    return a.state === 'AVAILABLE' ? a.score : null;
  });
}

/** Je Stichtag die Scores aller Varianten, nur Titel, die in JEDER Variante einen Wert haben. */
function scoreDates(dates, variants, known) {
  const names = Object.keys(variants);
  return dates.map(s => {
    const rows = s.rows.filter(r => known(r.id));
    const by = Object.fromEntries(names.map(n => [n, scoreQuality(rows, variants[n])]));
    const keep = rows.map((r, k) => (names.every(n => X.finite(by[n][k])) ? { id: r.id, ...Object.fromEntries(names.map(n => [n, by[n][k]])) } : null)).filter(Boolean);
    return { date: s.date, rows: keep };
  });
}

function listingOf(l, from, to) {
  const k0 = Math.max(0, l.points.findIndex(p => p[0] >= from)), bars = [];
  for (let k = k0; k < l.points.length && l.points[k][0] <= to; k++) bars.push({ date: l.points[k][0], close: l.points[k][1] });
  return { listingId: l.securityId, issuerId: l.cik || l.securityId, identity: { mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: l.listingStart, availableAt: l.masterGeneratedAt, sourceHash: l.identityHash }, bars };
}

/** Q5-Q1 und IC je Variante und Horizont (Map Datum -> Kennzahlen). */
function perDateOutcomes(scored, names, frame, spy, horizons, log = () => {}) {
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const calIndex = new Map(frame.calendar.map((d, k) => [d, k]));
  const base = { asOf: frame.calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: 'quality-margin-compare', version: '1.0.0', frozenAt: '2026-11-16', analysisMode: 'EXPLORATORY' }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 },
    entryDelayBars: 1, buckets: BUCKETS, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: spy.bars } };
  const years = [...new Set(scored.map(d => d.date.slice(0, 4)))];
  const out = {};
  for (const h of horizons) for (const v of names) {
    const key = v + ':' + h; out[key] = new Map(); log(key);
    for (const y of years) {
      const snaps = scored.filter(d => d.date.slice(0, 4) === y && d.rows.length);
      if (!snaps.length) continue;
      const to = frame.calendar[Math.min(frame.calendar.length - 1, calIndex.get(snaps.at(-1).date) + h + 2)];
      const ids = new Set(snaps.flatMap(s => s.rows.map(r => r.id)));
      const listings = [...ids].map(id => listingOf(byId.get(id), snaps[0].date, to)).filter(l => l.bars.length);
      const factorSnapshots = snaps.map(s => {
        const availableAt = s.date + 'T23:59:59.999Z';
        return { date: s.date, availableAt, sourceHash: C.hash({ date: s.date, v }), rows: s.rows.map(r => ({ listingId: r.id, value: r[v], availableAt, sourceHash: C.hash([r.id, s.date, r[v]]) })) };
      });
      const expectedCalendar = frame.calendar.slice(calIndex.get(snaps[0].date), calIndex.get(to) + 1);
      const res = S.runFactorStudy({ ...base, expectedCalendar, listings, horizonBars: h, factorId: 'quality-' + v, factorSnapshots });
      const evByDate = new Map();
      for (const e of res.events) { if (!evByDate.has(e.signalDate)) evByDate.set(e.signalDate, []); evByDate.get(e.signalDate).push(e); }
      for (const p of res.periods) {
        const observed = (evByDate.get(p.date) || []).filter(e => e.completed);
        if (p.eligibleAtDecision < MIN_SCORED || observed.length < MIN_OBSERVED) continue;
        const q = k => observed.filter(e => e.bucket === k).map(e => e.grossReturn);
        const q5 = q(BUCKETS - 1), q1 = q(0);
        out[key].set(p.date, { ic: p.spearmanObservedOnly, spread: q5.length && q1.length ? mean(q5) - mean(q1) : null, q5: mean(q5), q1: mean(q1) });
      }
    }
  }
  return out;
}

/** Tabelle je Horizont: Kennzahlen je Variante, gepaarte Differenzen fuer die Vergleiche, Holm ueber alle Differenz-Tests. */
function summarize(per, names, horizons, comparisons) {
  const summary = (vals, h) => { const nw = neweyWest(vals, nwBandwidth(h)); return { n: vals.length, mean: nw.mean, t: nw.t ?? null, p: nw.p ?? null, positiveShare: vals.length ? vals.filter(x => x > 0).length / vals.length : null }; };
  const table = horizons.map(h => {
    const maps = Object.fromEntries(names.map(n => [n, per[n + ':' + h]]));
    const both = [...maps[names[0]].keys()].filter(d => names.every(n => maps[n].has(d))).sort();
    const pick = (n, f) => both.map(d => maps[n].get(d)[f]).filter(X.finite);
    const diff = (a, b, f) => both.map(d => [maps[a].get(d)[f], maps[b].get(d)[f]]).filter(([x, y]) => X.finite(x) && X.finite(y)).map(([x, y]) => x - y);
    return { horizonBars: h, horizonMonths: H_MONTHS[h], dates: both.length, first: both[0] || null, last: both.at(-1) || null,
      varianten: Object.fromEntries(names.map(n => [n, { spread: summary(pick(n, 'spread'), h), ic: summary(pick(n, 'ic'), h), q5: mean(pick(n, 'q5')), q1: mean(pick(n, 'q1')) }])),
      vergleiche: comparisons.map(([a, b]) => ({ a, b, spread: summary(diff(a, b, 'spread'), h), ic: summary(diff(a, b, 'ic'), h) })) };
  });
  const family = [];
  for (const row of table) for (const c of row.vergleiche) for (const k of ['ic', 'spread']) if (X.finite(c[k].p)) family.push(c[k]);
  const adj = V.holm(family.map(x => x.p));
  family.forEach((x, j) => { x.holm = adj[j]; x.holmReject05 = adj[j] <= 0.05; });
  return { table, multipleTesting: { method: 'HOLM ueber alle gepaarten Differenzen (Vergleiche x Horizonte x {IC, Q5-Q1}), Newey-West-p', family: family.length, rejections05: family.filter(x => x.holmReject05).length } };
}

module.exports = { QUALITY_BASE, MARGIN_WEIGHT, variant, scoreQuality, scoreDates, perDateOutcomes, summarize, H_MONTHS };
