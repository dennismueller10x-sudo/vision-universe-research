#!/usr/bin/env node
'use strict';
// Erzeuger des Produktartefakts quant/data/product/backtest-research-v1.json (Datenart backtestResearch).
//   node scripts/quant/research/build-backtest-research.cjs [--out <datei>] [--as-of YYYY-MM-DD]
//        [--private-delisted <dir>] [--private-factor-panel <panel.jsonl.gz>]   (im Wochenlauf aus dem R2-Archiv)
//
// Rechnet die festen Prüffälle aus docs/quant/backtest-demos/cases.json mit dem Research-Runner
// (scripts/quant/research/backtest-runner.cjs) und schreibt je Fall die Zusatzmethoden in kompakter Form:
// Monte Carlo, Walk-Forward, Out-of-Sample, Marktregime, Parameter-Sensitivität, Ereignis-Studie,
// Portfolio-Rebalancing. Keine neue Rechnung: die Werte kommen unverändert aus dem Ergebnisvertrag v2.
//
// Das Artefakt ist Forschung, nicht zertifiziert, und nur für die interne Ansicht (audience INTERNAL,
// display.public false). Öffentliche Rendite- oder Performanceaussagen brauchen eine Owner-Freigabe.
// Fälle, die private Daten brauchen (delistete Reihen, V10-Faktorpanel), stehen mit ihrem Zustand
// PREPARED_DATA_LIMITED und dem fehlenden Eingang da; sie werden nicht geschätzt.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CASES = path.join(ROOT, 'docs/quant/backtest-demos/cases.json');
const MATRIX_CASES = path.join(ROOT, 'docs/quant/backtest-research/cases.json');
const DISPLAY = path.join(ROOT, 'quant/methodology/backtest-research-display.json');
const KINDS = ['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'STRATEGY_BACKTEST', 'FACTOR_RANKING_BACKTEST'];
const DEFAULT_OUT = path.join(ROOT, 'quant/data/product/backtest-research-v1.json');
const SCHEMA = 'backtest-research-1.3.0';
const CERT_METHOD = path.join(ROOT, 'quant/methodology/backtest-method-certification-v1.json');
const FORWARD_CERT = path.join(ROOT, 'quant/data/product/backtest-certification-v1.json');
const METHODS = ['MONTE_CARLO', 'WALK_FORWARD', 'OUT_OF_SAMPLE', 'MARKET_REGIME', 'PARAMETER_SENSITIVITY', 'EVENT_DRIVEN', 'PORTFOLIO_REBALANCING'];

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = { '--out': 'out', '--as-of': 'asOf', '--private-delisted': 'delisted', '--private-factor-panel': 'factorPanel' }[argv[i]];
    if (!k || !argv[i + 1]) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[i + 1];
  }
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw Error('INVALID_AS_OF');
  return o;
}
const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const q3 = x => (x && typeof x === 'object' ? { p5: num(x.p5), p50: num(x.p50), p95: num(x.p95) } : null);
const pair = x => (Array.isArray(x) && x.length === 2 ? [num(x[0]), num(x[1])] : null);

// Je Methode nur die Felder, die die interne Ansicht braucht; Hashes bleiben als Beleg.
function compact(id, m) {
  const out = { state: m.state };
  if (m.state !== 'EXECUTED' || !m.result) { const why = m.reason || (m.result && m.result.reason); if (why) out.reason = String(why); return out; }
  const x = m.result;
  if (id === 'MONTE_CARLO') Object.assign(out, { model: x.model, simulations: num(x.simulations), horizon: num(x.horizon), sourceObservations: num(x.sourceObservations),
    totalReturn: q3(x.totalReturn), maxDrawdown: q3(x.maxDrawdown), scope: x.scope, inputHash: x.inputHash || null });
  else if (id === 'WALK_FORWARD') Object.assign(out, { mode: x.mode, folds: num(x.folds), sizes: x.sizes || null, excludedByReason: x.excludedByReason || {}, partitionHash: x.partitionHash || null });
  else if (id === 'OUT_OF_SAMPLE') Object.assign(out, { endpoint: x.endpoint, n: num(x.n), mean: num(x.mean),
    perFold: (x.perFold || []).map(f => ({ fold: f.fold, test: Array.isArray(f.test) ? f.test.slice(0, 2) : null, n: num(f.n), mean: num(f.mean) })), note: x.note || null, resultHash: x.resultHash || null });
  else if (id === 'MARKET_REGIME') Object.assign(out, { definition: x.definition, mode: x.mode,
    states: (x.states || []).map(s => ({ state: s.state, episodes: num(s.episodes), n: num(s.n), mean: num(s.mean), median: num(s.median), interval95: pair(s.interval95) })), regimeResultHash: x.regimeResultHash || null });
  else if (id === 'PARAMETER_SENSITIVITY') Object.assign(out, {
    grid: (x.grid || []).map(g => ({ parameters: g.parameters || {}, n: num(g.n), estimate: num(g.estimate), ci: pair(g.ci), adjustedPValue: num(g.adjustedPValue) })) });
  else if (id === 'EVENT_DRIVEN') Object.assign(out, { coverage: x.coverage || null, meanNet: num(x.meanNet), medianNet: num(x.medianNet), interval95: pair(x.interval95) });
  else if (id === 'PORTFOLIO_REBALANCING') Object.assign(out, { rule: x.rule || null, maxPositions: num(x.maxPositions), holdingWeeks: num(x.holdingWeeks), rebalances: num(x.rebalances),
    from: x.from || null, to: x.to || null, totalReturn: num(x.totalReturn), cagr: num(x.cagr), maxDrawdown: num(x.maxDrawdown), volatility: num(x.volatility),
    benchmarkTotalReturn: x.benchmark ? num(x.benchmark.totalReturn) : null, oneWayTurnoverSum: num(x.oneWayTurnoverSum) });
  return out;
}

// Methoden-Ampel (Forschung, keine Prognose): feste Regel je Methode, nur aus den Werten des Ergebnisvertrags.
//   PROVEN   „hat sich bewährt“            REGIME_DEPENDENT „nur in bestimmten Marktlagen“   FAILED „hat versagt“
const MIN_REGIME_N = 5;
function verdict(id, m) {
  if (!m || m.state !== 'EXECUTED') return null;
  const pos = x => typeof x === 'number' && x > 0;
  const share = (xs, f) => xs.length ? xs.filter(f).length / xs.length : null;
  let v = null, basis = null;
  if (id === 'MONTE_CARLO' && m.totalReturn) { v = pos(m.totalReturn.p5) ? 'PROVEN' : pos(m.totalReturn.p50) ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Spanne 5 %/Mitte'; }
  else if (id === 'OUT_OF_SAMPLE' || id === 'WALK_FORWARD') {
    const folds = (id === 'OUT_OF_SAMPLE' ? m.perFold : null) || [];
    const sh = share(folds.filter(f => typeof f.mean === 'number'), f => f.mean > 0);
    if (sh !== null) { v = sh >= 2 / 3 ? 'PROVEN' : sh > 0 ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Anteil Testfenster im Plus'; }
  } else if (id === 'MARKET_REGIME') {
    const st = (m.states || []).filter(x => (x.n || 0) >= MIN_REGIME_N && typeof x.mean === 'number');
    const sh = share(st, x => x.mean > 0);
    if (sh !== null) { v = sh === 1 ? 'PROVEN' : sh > 0 ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Marktlagen mit mindestens ' + MIN_REGIME_N + ' Fällen im Plus'; }
  } else if (id === 'PARAMETER_SENSITIVITY') {
    const sh = share((m.grid || []).filter(g => typeof g.estimate === 'number'), g => g.estimate > 0);
    if (sh !== null) { v = sh === 1 ? 'PROVEN' : sh > 0 ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Stellschrauben mit positivem Ergebnis'; }
  } else if (id === 'EVENT_DRIVEN' && typeof m.meanNet === 'number') {
    v = m.interval95 && pos(m.interval95[0]) ? 'PROVEN' : m.meanNet > 0 ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Mittel netto und 95-%-Spanne';
  } else if (id === 'PORTFOLIO_REBALANCING' && typeof m.totalReturn === 'number' && typeof m.benchmarkTotalReturn === 'number') {
    v = m.totalReturn > m.benchmarkTotalReturn && (m.maxDrawdown == null || m.maxDrawdown > -0.5) ? 'PROVEN' : m.totalReturn > 0 ? 'REGIME_DEPENDENT' : 'FAILED'; basis = 'Depot gegen S&P 500 im selben Zeitraum';
  }
  return v ? { verdict: v, basis } : null;
}
// Vergleich je Fall (Steuerung 13.11.2026): „hat sich bewährt“ heißt nie nur „im Mittel im Plus“, sondern „besser als der
// Vergleich“. Ereignis-Arten: mittlerer Vorsprung je Fall gegen den S&P 500 (Kursrendite, gleiches Fenster je Fall);
// Depots: Gesamtergebnis gegen den S&P 500 im selben Zeitraum; Faktor-Ranglisten: oberstes gegen unterstes Fünftel je Rangtag.
//   BEATS  Vergleich klar geschlagen   MIXED  nur teilweise   LOSES  nicht geschlagen   null  kein Vergleich messbar
function comparison(kind, e, factor) {
  const m = e.metrics || {};
  if (kind === 'FACTOR_RANKING_BACKTEST') {
    if (!factor || typeof factor.meanTopMinusBottom !== 'number' || typeof factor.topBeatsBottomShare !== 'number') return null;
    const d = factor.meanTopMinusBottom, sh = factor.topBeatsBottomShare;
    return { state: d > 0 && sh >= 2 / 3 ? 'BEATS' : d > 0 || sh > 0.5 ? 'MIXED' : 'LOSES', value: d, share: sh, basis: 'oberstes gegen unterstes Fünftel' };
  }
  if (m.basis === 'PORTFOLIO') {
    const b = m.benchmark || {}, id = b.id || '';
    // Bargeld ist kein Marktvergleich (Gesamtrendite-Depot mit Dividenden-Register): ohne Einordnung statt „besser als nichts“.
    if (id === 'ZERO_RATE_CASH') return null;
    const ex = b.pathStatistics && b.pathStatistics.excessTotalReturn;
    const x = typeof ex === 'number' ? ex : (typeof m.totalReturn === 'number' && typeof b.totalReturn === 'number' ? m.totalReturn - b.totalReturn : null);
    if (x === null) return null;
    const basis = id === 'SAME_LISTING_BUY_AND_HOLD' ? 'Regel gegen Kaufen und Halten derselben Aktie' : 'Depot gegen S&P 500 im selben Zeitraum';
    return { state: x > 0 ? 'BEATS' : 'LOSES', value: x, basis };
  }
  const ex = m.excess && m.excess.meanExcess;
  if (typeof ex !== 'number') return null;
  return { state: ex > 0 ? 'BEATS' : 'LOSES', value: ex, n: num(m.excess.n), basis: 'mittlerer Vorsprung je Fall gegen den S&P 500' };
}
// Ampel aus Robustheit (verdict) und Vergleich: bewährt nur, wenn beides trägt; ohne geschlagenen Vergleich „hat versagt“.
function combine(vd, cmp) {
  if (!vd) return null;
  if (!cmp) return { verdict: null, basis: vd.basis, robustness: vd.verdict, comparison: null };
  const v = cmp.state === 'LOSES' ? 'FAILED' : cmp.state === 'MIXED' ? (vd.verdict === 'FAILED' ? 'FAILED' : 'REGIME_DEPENDENT') : vd.verdict;
  return { verdict: v, basis: vd.basis + '; Vergleich: ' + cmp.basis, robustness: vd.verdict, comparison: cmp.state };
}
function disclosure(c, r) {
  const e = r.envelope, costs = (e.metrics && e.metrics.costs) || {}, sens = e.methods.find(x => x.method === 'PARAMETER_SENSITIVITY');
  return { period: e.period ? { from: e.period.from, to: e.period.to } : null,
    costs: { feeBpsPerSide: num(costs.feeBpsPerSide), slippageBpsPerSide: num(costs.slippageBpsPerSide), model: costs.model || null },
    benchmark: { id: (r.spec && r.spec.benchmark) || null, label: 'S&P 500 (SPY)', returnBasis: (e.metrics && e.metrics.benchmark && e.metrics.benchmark.returnBasis) || null },
    delistedIncluded: c.privateData === 'delistedSeries' || /DELISTED/.test(JSON.stringify((r.spec && r.spec.population) || {})),
    survivorship: (e.dataQuality && e.dataQuality.survivorship && e.dataQuality.survivorship.state) || null,
    variants: sens && sens.state === 'EXECUTED' && sens.result && Array.isArray(sens.result.grid) ? sens.result.grid.length : 1,
    maxDrawdown: num(e.metrics && e.metrics.maxDrawdown) };
}

// Faktor-Rang: Fuenftel-Vergleich aus dem Runner (oberstes minus unterstes Fuenftel, je Rangtag), unveraendert uebernommen.
function factorRow(e) {
  const f = e.metrics && e.metrics.perEvent && e.metrics.perEvent.factor;
  if (!f) return null;
  return { factorId: f.factorId, buckets: f.buckets, rankDates: num(f.rankDates), meanTopMinusBottom: num(f.meanTopMinusBottomCompleteCohort),
    topBeatsBottomShare: num(f.topBeatsBottomShare), bucketMeans: Array.isArray(f.bucketMeansCompleteCohort) ? f.bucketMeansCompleteCohort.map(num) : null, meanSpearman: num(f.meanSpearmanObservedOnly) };
}
function caseRow(c, r) {
  const e = r.envelope;
  const byId = Object.fromEntries(e.methods.map(m => [m.method, m]));
  return {
    id: c.id, kind: c.kind, scenarios: c.scenarios || [], purpose: c.purpose || null, privateData: c.privateData || null,
    state: r.state, evidenceKind: e.status.evidenceKind, certificationStatus: e.status.certificationStatus, period: e.period,
    events: { occurrences: num(e.events.occurrences), completed: num(e.events.completed) },
    metrics: { basis: e.metrics.basis, hitRate: num(e.metrics.hitRate), maxDrawdown: num(e.metrics.maxDrawdown), trades: num(e.metrics.trades), totalReturn: num(e.metrics.totalReturn), cagr: num(e.metrics.cagr) },
    missingInputs: e.limitations.filter(x => x.startsWith('MISSING_INPUT:')),
    methods: (() => {
      const cmp = comparison(c.kind, e, factorRow(e));
      const ms = Object.fromEntries(METHODS.map(id => { const m = byId[id] ? compact(id, byId[id]) : { state: 'NOT_APPLICABLE' }; const vd = combine(verdict(id, m), cmp); return [id, vd ? { ...m, ...vd } : m]; }));
      // Walk-Forward teilt nur die Zeit; sein Ergebnis steht in den Testfenstern derselben Teilung (OUT_OF_SAMPLE).
      if (ms.WALK_FORWARD.state === 'EXECUTED' && ms.OUT_OF_SAMPLE.robustness) Object.assign(ms.WALK_FORWARD, { verdict: ms.OUT_OF_SAMPLE.verdict, robustness: ms.OUT_OF_SAMPLE.robustness, comparison: ms.OUT_OF_SAMPLE.comparison, basis: 'Testfenster der Walk-Forward-Teilung; Vergleich wie dort' });
      return ms;
    })(),
    comparison: comparison(c.kind, e, factorRow(e)),
    factor: factorRow(e),
    disclosure: disclosure(c, r),
    resultHash: r.resultHash
  };
}

// 6 Arten x 7 Methoden: jede Zelle traegt ein Ergebnis (Fall mit EXECUTED) oder einen benannten Grund.
//   NOT_APPLICABLE  methodisch nicht anwendbar (METHOD_FIT des Runners)
//   DATA_MISSING    zulaessig, aber jeder Fall dieser Art wartet auf einen fehlenden Eingang (missing)
//   NOT_RUN         zulaessig und gerechnet, aber die Methode lieferte kein Ergebnis (reason aus dem Runner)
function matrix(cases) {
  const out = {};
  for (const k of KINDS) {
    out[k] = {};
    const ofKind = cases.filter(c => c.kind === k);
    for (const m of METHODS) {
      if (!R.METHOD_FIT[m].includes(k)) { out[k][m] = { state: 'NOT_APPLICABLE' }; continue; }
      const hit = ofKind.filter(c => c.methods[m].state === 'EXECUTED');
      if (hit.length) { const lead = hit.find(c => c.group === 'MATRIX') || hit[0]; out[k][m] = { state: 'EXECUTED', cases: hit.map(c => c.id), verdict: lead.methods[m].verdict || null, verdictCase: lead.id }; continue; }
      const ran = ofKind.filter(c => c.state === 'RESEARCH_EXECUTED');
      if (!ran.length && ofKind.length) { out[k][m] = { state: 'DATA_MISSING', cases: ofKind.map(c => c.id), missing: [...new Set(ofKind.flatMap(c => c.missingInputs.map(x => x.replace(/^MISSING_INPUT:/, '').split(/[ :]/)[0])))] }; continue; }
      const why = ran.map(c => c.methods[m].reason).filter(Boolean);
      out[k][m] = { state: ofKind.length ? 'NOT_RUN' : 'NO_CASE', cases: ran.map(c => c.id), reason: why[0] || null };
    }
  }
  return out;
}

// Zertifizierung „methodisch geprueft“ (backtest-method-certification-1.0.0, Owner-Lesart 13.11.2026) je Art:
// nachvollziehbar gerechnet + alle zulaessigen Robustheitspruefungen + kein hartes Gate des Vorwaerts-Pruefstands verletzt.
// Offenlegungen (Historie, Ueberlebende, Renditebasis, Ergebnis) kommen unveraendert aus dem Vorwaerts-Pruefstand.
function certify(cases, mx, method, forward) {
  const out = {};
  for (const k of KINDS) {
    const reproducible = cases.filter(c => c.kind === k && c.state === 'RESEARCH_EXECUTED' && /^[0-9a-f]{64}$/.test(c.resultHash || ''));
    const fk = forward && Array.isArray(forward.kinds) ? forward.kinds.find(x => x.id === k) : null;
    const hard = fk ? fk.gates.filter(g => g.category === 'HARD') : [];
    const criteria = [{ id: 'reproducible', state: reproducible.length ? 'PASS' : 'FAIL', value: reproducible.map(c => c.id), reason: reproducible.length ? null : 'NO_REPRODUCIBLE_CASE' }]
      .concat((method.kinds[k] || {}).robustness.map(m => { const c = mx[k][m]; return { id: m, state: c.state === 'EXECUTED' ? 'PASS' : 'FAIL', value: c.cases || [], reason: c.state === 'EXECUTED' ? null : c.reason || c.state }; }))
      .concat(hard.map(g => ({ id: 'hard:' + g.id, state: g.state, value: g.value, reason: g.reason })));
    if (!fk) criteria.push({ id: 'hard:forwardCertification', state: 'FAIL', value: null, reason: 'FORWARD_CERTIFICATION_MISSING' });
    const failHard = criteria.find(c => c.id.startsWith('hard:') && c.state !== 'PASS');
    const failRest = criteria.find(c => !c.id.startsWith('hard:') && c.state !== 'PASS');
    const status = failHard ? 'WITHHELD' : failRest ? 'LIMITED' : 'CERTIFIED';
    out[k] = { status, label: method.labels[status], reason: (failHard || failRest || {}).reason || null, criteria,
      disclosures: fk ? fk.gates.filter(g => g.category !== 'HARD' && g.state !== 'PASS').map(g => ({ id: g.id, label: g.label, reason: g.reason, value: g.value })) : [],
      forwardStatus: fk ? fk.status : null };
  }
  return out;
}

function build(opts = {}) {
  const list = [CASES, MATRIX_CASES].flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).cases.map(c => ({ ...c, file: f, group: f === MATRIX_CASES ? 'MATRIX' : 'DEMO' })));
  const cases = list.filter(c => !opts.only || opts.only.includes(c.id)).map(c => {
    const s = JSON.parse(fs.readFileSync(path.join(path.dirname(c.file), c.spec), 'utf8'));
    return { ...caseRow(c, R.runBacktest(s, { cacheDir: null, privateDirs: { delistedSeries: opts.delisted || null, factorPanel: opts.factorPanel || null } })), group: c.group };
  });
  const display = JSON.parse(fs.readFileSync(DISPLAY, 'utf8'));
  const isPublic = display.public === true && !!(display.approval && display.approval.text === display.approvalPhrase);
  const executed = m => cases.filter(c => c.methods[m].state === 'EXECUTED').length;
  const mx = matrix(cases);
  return {
    schemaVersion: SCHEMA,
    asOf: opts.asOf || new Date().toISOString().slice(0, 10),
    runner: R.VERSION,
    label: 'Forschung, nicht zertifiziert',
    audience: isPublic ? 'PUBLIC' : 'INTERNAL',
    display: { public: isPublic, switch: 'quant/methodology/backtest-research-display.json', approvalPhrase: display.approvalPhrase,
      reason: isPublic ? null : 'Öffentliche Rendite- oder Performanceaussagen brauchen eine Owner-Freigabe (CLAUDE.md, Freigaben).' },
    certificationStatus: 'NOT_CERTIFIED',
    productionApproved: false,
    // Private Eingaenge (delistete Reihen, V10-Faktorpanel) aus dem verschluesselten Archiv; veroeffentlicht werden nur abgeleitete Kennzahlen.
    privateInputs: { delistedSeries: !!opts.delisted, factorPanel: !!opts.factorPanel },
    source: ['docs/quant/backtest-demos/cases.json', 'docs/quant/backtest-research/cases.json'],
    kinds: KINDS, methods: METHODS,
    matrix: mx,
    certification: (() => { const method = JSON.parse(fs.readFileSync(CERT_METHOD, 'utf8')); const forward = fs.existsSync(FORWARD_CERT) ? JSON.parse(fs.readFileSync(FORWARD_CERT, 'utf8')) : null;
      const kinds = certify(cases, mx, method, forward);
      return { methodology: method.schemaVersion, definition: method.definition, forward: forward ? { file: 'quant/data/product/backtest-certification-v1.json', asOf: forward.asOf, methodology: forward.methodology } : null,
        kinds, certifiedKinds: KINDS.filter(k => kinds[k].status === 'CERTIFIED') }; })(),
    summary: { cases: cases.length, executed: cases.filter(c => c.state === 'RESEARCH_EXECUTED').length,
      dataLimited: cases.filter(c => c.state === 'PREPARED_DATA_LIMITED').length,
      methods: Object.fromEntries(METHODS.map(m => [m, executed(m)])) },
    cases
  };
}

function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const out = path.resolve(o.out || DEFAULT_OUT);
  const doc = build({ asOf: o.asOf, delisted: o.delisted, factorPanel: o.factorPanel });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ out: path.relative(ROOT, out), ...doc.summary }));
  return doc;
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack); process.exitCode = 1; } }
module.exports = { build, compact, caseRow, factorRow, comparison, combine, matrix, certify, verdict, disclosure, METHODS, KINDS, SCHEMA };
