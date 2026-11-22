#!/usr/bin/env node
'use strict';
// Gewichtsvarianten des Gesamtwerts mit Holdout und Robustheit von Q5-Q1 (Forschung, nicht zertifiziert; Steuerung 22.11.2026).
// Nur lesend: V10-Panel (privat, R2), Kurse aus dem Checkout, Eignung aus eligibility.json. Schreibt nichts ins Repository.
//
// Teil A (Holdout): Vorab festgelegtes Raster von Gewichtsvarianten des Composite (quant-v2.4.1 = "cur"). Gewaehlt wird NUR auf dem
//   Zeitraum 2010-2017 (Regel unten), geprueft auf 2018-2025: gepaarte IC-Differenz gegen "cur" je Stichtag, Newey-West-t, Holm ueber
//   alle Varianten x Horizonte, dazu Teilzeitraeume. Vergleich nur auf Titeln mit allen sechs Faktoren (gleiche Menge fuer alle
//   Gewichtungen); der Profilwert (ab vier Faktoren) steht getrennt.
//   Auswahlregel (vorab): hoechster Mittelwert aus IC 3 Monate und IC 12 Monate auf 2010-2017, nur wenn er ueber "cur" liegt.
// Teil B (Q5-Q1): Mittel, Median und winsorisiertes Mittel (1 %/99 % je Stichtag) von Q5-Q1; Anteil der Ausreisser am Q1-Mittel;
//   Population "common" gegen "common+ended" (zusaetzlich die per Ereignis beendeten Notierungen, Register ended-listings-1.0.0,
//   Kurse wie von R2 zurueckgeholt; Kurs nach dem Ende vom Anbieter fortgeschrieben, kein Totalverlust, keine Abfindung).
// Usage: node factor-weights-holdout.cjs --panel <panel.jsonl.gz> --out <file.json> --population common|common+ended
const fs = require('node:fs'), path = require('node:path');
const F = require('../v10/factor/common.cjs'), X = require('../v10/factor/factors.cjs');
const { neweyWest, nwBandwidth } = require('../v10/factor/study.cjs');
const P = require('./factor-predictive-power.cjs');
const Q = require('./quality-margin-compare.cjs');
const S = require(F.ROOT + '/quant/engines/research-studies.cjs');
const V = require(F.ROOT + '/quant/engines/research-validation.cjs');
const C = F.C;

const HORIZONS = [4, 13, 52], BUCKETS = 5, MIN_SCORED = 200, MIN_OBSERVED = 100;
const SPLIT = '2018-01-01';
const SUBPERIODS = [['2010-01-01', '2014-12-31'], ['2015-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']];
const finite = X.finite, mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

// Vorab festgelegtes Raster (Summen werden im Composite normiert). cur = X.COMPOSITE_WEIGHTS.
const W = X.COMPOSITE_WEIGHTS;
const VARIANTS = {
  cur: { ...W },
  growthLow: { ...W, growth: 0.05 },
  growthLowRiskUp: { ...W, growth: 0.05, risk: 0.15 },
  riskUp: { ...W, risk: 0.15 },
  noGrowthRiskUp: { ...W, growth: 0, risk: 0.15 },
  equal6: Object.fromEntries(X.FACTORS.map(f => [f, 1 / 6]))
};
const weighted = (sc, w) => (X.FACTORS.every(f => finite(sc[f])) ? X.FACTORS.reduce((s, f) => s + w[f] * sc[f], 0) / X.FACTORS.reduce((s, f) => s + w[f], 0) : null);

function populations(kind) {
  const e = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const type = new Map();
  for (const d of e.decisions) {
    const product = ['ELIGIBLE', 'SEPARATE_CLASS', 'REVIEW'].includes(d.product_eligibility);
    const ended = /^CONFIRMED_LISTING_ENDED/.test(d.product_eligibility_reason || '');
    if (!['EQUITY_COMMON', 'ADR'].includes(d.instrument_type)) continue;
    if (product || (kind === 'common+ended' && ended)) type.set(d.securityId, d.instrument_type);
  }
  return type;
}

function listingOf(l, from, to) {
  const k0 = Math.max(0, l.points.findIndex(p => p[0] >= from)), bars = [];
  for (let k = k0; k < l.points.length && l.points[k][0] <= to; k++) bars.push({ date: l.points[k][0], close: l.points[k][1] });
  return { listingId: l.securityId, issuerId: l.cik || l.securityId, identity: { mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: l.listingStart, availableAt: l.masterGeneratedAt, sourceHash: l.identityHash }, bars };
}

/** Je Signal, Horizont und Stichtag: IC, Q5-Q1 (Mittel, Median, winsorisiert), Ausreisseranteil am Q1-Mittel. */
function outcomes(scored, names, frame, spy, log) {
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const calIndex = new Map(frame.calendar.map((d, k) => [d, k]));
  const base = { asOf: frame.calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: 'factor-weights-holdout', version: '1.0.0', frozenAt: '2026-11-22', analysisMode: 'EXPLORATORY' }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 },
    entryDelayBars: 1, buckets: BUCKETS, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: spy.bars } };
  const years = [...new Set(scored.map(d => d.date.slice(0, 4)))];
  const out = {};
  for (const h of HORIZONS) for (const v of names) {
    const key = v + ':' + h; out[key] = new Map(); log(key);
    for (const y of years) {
      const snaps = scored.filter(d => d.date.slice(0, 4) === y && d.rows.some(r => finite(r[v])));
      if (!snaps.length) continue;
      const to = frame.calendar[Math.min(frame.calendar.length - 1, calIndex.get(snaps.at(-1).date) + h + 2)];
      const ids = new Set(snaps.flatMap(s => s.rows.map(r => r.id)));
      const listings = [...ids].map(id => listingOf(byId.get(id), snaps[0].date, to)).filter(l => l.bars.length);
      const factorSnapshots = snaps.map(s => {
        const availableAt = s.date + 'T23:59:59.999Z';
        return { date: s.date, availableAt, sourceHash: C.hash({ date: s.date, v }), rows: s.rows.map(r => ({ listingId: r.id, value: finite(r[v]) ? r[v] : null, availableAt, sourceHash: C.hash([r.id, s.date, r[v]]) })) };
      });
      const expectedCalendar = frame.calendar.slice(calIndex.get(snaps[0].date), calIndex.get(to) + 1);
      const res = S.runFactorStudy({ ...base, expectedCalendar, listings, horizonBars: h, factorId: 'w-' + v, factorSnapshots });
      const evByDate = new Map();
      for (const e of res.events) { if (!evByDate.has(e.signalDate)) evByDate.set(e.signalDate, []); evByDate.get(e.signalDate).push(e); }
      for (const p of res.periods) {
        const observed = (evByDate.get(p.date) || []).filter(e => e.completed);
        if (p.eligibleAtDecision < MIN_SCORED || observed.length < MIN_OBSERVED) continue;
        const all = observed.map(e => e.grossReturn).sort((a, b) => a - b);
        const lo = all[Math.floor(0.01 * (all.length - 1))], hi = all[Math.ceil(0.99 * (all.length - 1))];
        const cl = x => Math.min(hi, Math.max(lo, x));
        const q = k => observed.filter(e => e.bucket === k).map(e => e.grossReturn);
        const q5 = q(BUCKETS - 1), q1 = q(0);
        if (!q5.length || !q1.length) continue;
        const q1Out = q1.filter(x => x >= hi).length;
        out[key].set(p.date, { ic: p.spearmanObservedOnly, spread: mean(q5) - mean(q1), spreadMedian: median(q5) - median(q1), spreadWin: mean(q5.map(cl)) - mean(q1.map(cl)),
          q1Mean: mean(q1), q1WinMean: mean(q1.map(cl)), q1Top1pctShare: q1.length ? q1Out / q1.length : null, n: observed.length });
      }
    }
  }
  return out;
}

const rowsOf = (map, from, to) => [...map].filter(([d]) => (!from || d >= from) && (!to || d <= to)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
function stat(vals, h) { const nw = neweyWest(vals, nwBandwidth(h)); return { n: vals.length, mean: nw.mean, t: nw.t ?? null, p: nw.p ?? null, positiveShare: vals.length ? vals.filter(x => x > 0).length / vals.length : null }; }
const series = (map, f, from, to) => rowsOf(map, from, to).map(([, v]) => v[f]).filter(finite);
function pairedDiff(a, b, f, from, to) {
  return rowsOf(a, from, to).filter(([d]) => b.has(d)).map(([d, v]) => [v[f], b.get(d)[f]]).filter(([x, y]) => finite(x) && finite(y)).map(([x, y]) => x - y);
}

function run(panelFile, loaderOptions, population) {
  const t0 = Date.now(), log = k => process.stderr.write(k + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
  const type = populations(population);
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const known = new Set(frame.listings.map(l => l.securityId));
  const Pn = require('../v10/factor/panel.cjs').readPanel(panelFile, { withRaws: true });
  const wanted = Pn.dates.map(d => d.rows.filter(r => type.has(r.id)));
  const missingSeries = new Set(); wanted.forEach(rs => rs.forEach(r => { if (!known.has(r.id)) missingSeries.add(r.id); }));
  const scored = Pn.dates.map((d, k) => {
    const rows = wanted[k].filter(r => known.has(r.id));
    const sc = P.scoreCrossSection(rows.map(r => ({ id: r.id, template: !!r.template, raws: r.raws })), P.SPECS.panel);
    return { date: d.date, rows: rows.map((r, j) => ({ id: r.id, ...Object.fromEntries(Object.keys(VARIANTS).map(n => [n, weighted(sc[j], VARIANTS[n])])), profileMean: sc[j].PROFILE_MEAN, risk: sc[j].risk, value: sc[j].value, profitability: sc[j].profitability, momentum: sc[j].momentum, growth: sc[j].growth, quality: sc[j].quality })) };
  });
  log('scored');
  const names = [...Object.keys(VARIANTS), 'profileMean', 'risk', 'value', 'profitability', 'momentum', 'growth', 'quality'];
  const per = outcomes(scored, names, frame, spy, log);
  const hM = { 4: 1, 13: 3, 52: 12 };

  // Teil A
  const ev = (n, h) => per[n + ':' + h];
  const trainScore = {};
  for (const n of Object.keys(VARIANTS)) trainScore[n] = mean([13, 52].map(h => mean(series(ev(n, h), 'ic', null, '2017-12-31')))) ;
  const challengers = Object.keys(VARIANTS).filter(n => n !== 'cur').sort((a, b) => trainScore[b] - trainScore[a]);
  const chosen = trainScore[challengers[0]] > trainScore.cur ? challengers[0] : 'cur';
  const holdout = [];
  for (const n of [...Object.keys(VARIANTS).filter(x => x !== 'cur'), 'profileMean']) for (const h of HORIZONS) {
    const diff = (from, to) => pairedDiff(ev(n, h), ev('cur', h), 'ic', from, to);
    const tr = stat(diff(null, '2017-12-31'), h), te = stat(diff(SPLIT, null), h);
    holdout.push({ variant: n, horizonMonths: hM[h], train: tr, test: te, testIc: stat(series(ev(n, h), 'ic', SPLIT, null), h), curTestIc: stat(series(ev('cur', h), 'ic', SPLIT, null), h),
      subperiods: SUBPERIODS.map(([a, b]) => ({ from: a, to: b, ...stat(diff(a, b), h) })) });
  }
  const fam = holdout.filter(r => finite(r.test.p)), adj = V.holm(fam.map(r => r.test.p));
  fam.forEach((r, j) => { r.test.holm = adj[j]; r.test.holmReject05 = adj[j] <= 0.05; });

  // Teil B
  const robust = [];
  for (const n of ['cur', 'profileMean', 'risk', 'value', 'profitability', 'momentum', 'growth', 'quality']) for (const h of [13, 52]) {
    const m = ev(n, h), s = f => stat(series(m, f), h);
    robust.push({ signal: n, horizonMonths: hM[h], spread: s('spread'), spreadMedian: s('spreadMedian'), spreadWin: s('spreadWin'), q1Mean: mean(series(m, 'q1Mean')), q1WinMean: mean(series(m, 'q1WinMean')), q1Top1pctShare: mean(series(m, 'q1Top1pctShare')) });
  }
  const fp = robust.flatMap(r => [r.spread.p, r.spreadMedian.p, r.spreadWin.p]).map(p => (finite(p) ? p : 1)), fa = V.holm(fp);
  robust.forEach((r, j) => { r.spread.holm = fa[3 * j]; r.spreadMedian.holm = fa[3 * j + 1]; r.spreadWin.holm = fa[3 * j + 2]; });
  return {
    schemaVersion: 'factor-weights-holdout-1.0.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION', population,
    variants: VARIANTS, split: { train: '2010-01-01..2017-12-31', test: SPLIT + '..2025-12-31' }, selectionRule: 'hoechster Mittelwert aus IC 3 und 12 Monate auf dem Trainingszeitraum, nur wenn ueber cur',
    trainScores: trainScore, chosen, holdout, robust,
    coverage: { panelRowsWanted: wanted.reduce((s, r) => s + r.length, 0), idsWithoutSeriesInCheckout: missingSeries.size },
    returnBasis: 'PRICE_RETURN', input: { masterHash: frame.masterHash, framedListings: frame.listings.length },
    grenzen: 'Panel mit alter Margenstabilitaet in Quality; nur Titel mit Reihen im Checkout; Anbieter-Fortschreibung nach Notierungsende; Revisionen fehlen; Kursrendite ohne Kosten.',
    certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function main() {
  const panel = arg('--panel'), out = arg('--out'), population = arg('--population') || 'common';
  if (!panel || !out || !['common', 'common+ended'].includes(population)) throw Error('usage: --panel <panel.jsonl.gz> --out <file.json> --population common|common+ended');
  const r = run(path.resolve(panel), F.parseLoaderOptions(arg('--loader-options')), population);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ population, chosen: r.chosen, trainScores: r.trainScores, coverage: r.coverage }));
  for (const h of r.holdout) console.log([h.variant, h.horizonMonths + 'M', 'Test dIC ' + h.test.mean?.toFixed(4) + ' t ' + h.test.t?.toFixed(2) + ' Holm ' + h.test.holm?.toFixed(3)].join('\t'));
}
if (require.main === module) main();
module.exports = { VARIANTS, weighted, pairedDiff };
