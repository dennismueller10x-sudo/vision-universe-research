#!/usr/bin/env node
'use strict';
// Ersatzpruefung fuer quant-v2.4.0 (a) (Steuerung 16.11.2026): Forschung, nicht zertifiziert.
// Die neue Margenkomponente (operatingMarginDrawdown) laesst sich auf dem V10-Panel nicht rueckwaerts pruefen, weil
// der Panel nur die Rohwerte je Stichtag traegt, keine Jahresmargen (kein PIT-Neubau). Geprueft wird deshalb, was die
// ALTE Komponente (operatingMarginStability) zur Trennschaerfe von Quality beitrug:
//   MIT    = Quality wie V10 (fuenf Teile, alte Margenstabilitaet 20 %)
//   OHNE   = Quality ohne Margenkomponente (vier Teile, innerhalb des Faktors umgewichtet)
// Je Stichtag, dieselbe Titelmenge fuer beide (nur Titel mit Quality in beiden Varianten), oberes gegen unteres Fuenftel
// (Q5 - Q1), Rangkorrelation (IC) und die gepaarte Differenz MIT - OHNE. Ausgabe nur Zaehlungen und Mittelwerte.
// Usage: node quality-margin-substitute.cjs --panel <panel.jsonl.gz> --out <file.json>
const fs = require('node:fs'), path = require('node:path');
const F = require('../v10/factor/common.cjs'), X = require('../v10/factor/factors.cjs');
const P = require('../v10/factor/panel.cjs');
const { neweyWest, nwBandwidth } = require('../v10/factor/study.cjs');
const S = require(F.ROOT + '/quant/engines/research-studies.cjs');
const FE = require(F.ROOT + '/quant/engines/factor-evidence.js');
const C = F.C;

const HORIZONS = [13, 52], H_MONTHS = { 13: 3, 52: 12 }, BUCKETS = 5, MIN_SCORED = 200, MIN_OBSERVED = 100;
const QUALITY_V10 = X.COMPONENTS.quality;
const VARIANTS = {
  mit: QUALITY_V10,
  ohne: QUALITY_V10.filter(([id]) => id !== 'operatingMarginStability')
};
// Mindestanforderung wie V10 (mandatoryUnmet), unabhaengig von der Variante: beide Varianten bewerten dieselben Titel.
const QUALITY_CONTRACT = { minimumDataRequirements: { minimumComponents: 1, minimumOriginalWeight: 0 } };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

/** Quality je Variante fuer einen Stichtag; null, wo V10 Quality nicht vergibt (Branchenvorlage, Pflichtteile fehlen). */
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

function listingOf(l, from, to) {
  const k0 = Math.max(0, l.points.findIndex(p => p[0] >= from)), bars = [];
  for (let k = k0; k < l.points.length && l.points[k][0] <= to; k++) bars.push({ date: l.points[k][0], close: l.points[k][1] });
  return { listingId: l.securityId, issuerId: l.cik || l.securityId, identity: { mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: l.listingStart, availableAt: l.masterGeneratedAt, sourceHash: l.identityHash }, bars };
}

function run(panelFile) {
  const t0 = Date.now();
  const panel = P.readPanel(panelFile, { withRaws: true });
  const frame = F.buildFrame(panel.loaderOptions), spy = F.spyWeekly(frame.calendar);
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const calIndex = new Map(frame.calendar.map((d, k) => [d, k]));
  // Scores beider Varianten je Stichtag, nur auf der gemeinsamen Titelmenge.
  const scored = panel.dates.map(s => {
    const rows = s.rows.filter(r => byId.has(r.id));
    const mit = scoreQuality(rows, VARIANTS.mit), ohne = scoreQuality(rows, VARIANTS.ohne);
    const keep = rows.map((r, k) => (X.finite(mit[k]) && X.finite(ohne[k]) ? { id: r.id, mit: mit[k], ohne: ohne[k] } : null)).filter(Boolean);
    return { date: s.date, rows: keep };
  });
  const base = { asOf: frame.calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: 'quality-margin-substitute', version: '1.0.0', frozenAt: '2026-11-16', analysisMode: 'EXPLORATORY' }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 },
    entryDelayBars: 1, buckets: BUCKETS, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: spy.bars } };
  const years = [...new Set(scored.map(d => d.date.slice(0, 4)))];
  const perDate = {};
  for (const h of HORIZONS) for (const v of Object.keys(VARIANTS)) {
    const key = v + ':' + h; perDate[key] = new Map();
    process.stderr.write(key + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
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
        perDate[key].set(p.date, { ic: p.spearmanObservedOnly, spread: q5.length && q1.length ? mean(q5) - mean(q1) : null, q5: mean(q5), q1: mean(q1) });
      }
    }
  }
  const summary = (vals, h) => { const nw = neweyWest(vals, nwBandwidth(h)); return { n: vals.length, mean: nw.mean, t: nw.t ?? null, positiveShare: vals.length ? vals.filter(x => x > 0).length / vals.length : null }; };
  const table = HORIZONS.map(h => {
    const m = perDate['mit:' + h], o = perDate['ohne:' + h];
    const both = [...m.keys()].filter(d => o.has(d)).sort();
    const pick = (map, f) => both.map(d => map.get(d)[f]).filter(X.finite);
    const diff = f => both.map(d => [m.get(d)[f], o.get(d)[f]]).filter(([a, b]) => X.finite(a) && X.finite(b)).map(([a, b]) => a - b);
    return { horizonBars: h, horizonMonths: H_MONTHS[h], dates: both.length, first: both[0] || null, last: both.at(-1) || null,
      mit: { spread: summary(pick(m, 'spread'), h), ic: summary(pick(m, 'ic'), h), q5: mean(pick(m, 'q5')), q1: mean(pick(m, 'q1')) },
      ohne: { spread: summary(pick(o, 'spread'), h), ic: summary(pick(o, 'ic'), h), q5: mean(pick(o, 'q5')), q1: mean(pick(o, 'q1')) },
      differenzMitMinusOhne: { spread: summary(diff('spread'), h), ic: summary(diff('ic'), h) } };
  });
  const titlesPerDate = scored.map(d => d.rows.length).filter(n => n > 0);
  return {
    schemaVersion: 'quality-margin-substitute-1.0.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION',
    frage: 'Trug die alte Margenkomponente (Margenstabilitaet) zur Trennschaerfe von Quality bei? Ersatz fuer die nicht rueckwaerts pruefbare neue Komponente (Margeneinbruch, quant-v2.4.0).',
    varianten: { mit: VARIANTS.mit.map(([id, w]) => [id, w]), ohne: VARIANTS.ohne.map(([id, w]) => [id, w]) },
    population: { rankDates: titlesPerDate.length, titelJeStichtagMedian: titlesPerDate.slice().sort((a, b) => a - b)[Math.floor(titlesPerDate.length / 2)] || 0 },
    returnBasis: 'PRICE_RETURN', costs: base.costs, buckets: BUCKETS, table,
    grenzen: 'Rueckblickend auf heutigen Survivors (bedingte Population), Kursrendite ohne Kosten; prueft die alte Komponente, nicht die neue.',
    input: { panelHash: C.hash(panel.dates.map(d => [d.date, d.rows.length])), masterHash: frame.masterHash },
    certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function main() {
  const panelFile = arg('--panel'), out = arg('--out');
  if (!panelFile || !out) throw Error('usage: --panel <panel.jsonl.gz> --out <file.json>');
  const r = run(panelFile);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  for (const row of r.table) console.log([row.horizonMonths + 'M', 'Tage ' + row.dates, 'Q5-Q1 mit ' + row.mit.spread.mean?.toFixed(4), 'ohne ' + row.ohne.spread.mean?.toFixed(4), 'Diff ' + row.differenzMitMinusOhne.spread.mean?.toFixed(4) + ' t ' + row.differenzMitMinusOhne.spread.t?.toFixed(2)].join('\t'));
}
if (require.main === module) main();
module.exports = { scoreQuality, VARIANTS, run };
