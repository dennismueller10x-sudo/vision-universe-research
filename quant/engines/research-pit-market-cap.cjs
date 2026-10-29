'use strict';
// Research-only corrected PIT market capitalization (V12 MCAP, rule docs/quant-recovery/v12/mcap/rule-1.0.7.json, amending 1.0.0-1.0.6).
// Opt-in: nothing in the product or in the V10 factor code reads this module. It provides
//   (1) pure classification functions used by the register builder (scripts/quant/v12/mcap/classify.cjs), and
//   (2) marketCapAt(): the V10 market-cap computation with the register applied (status OK / CORRECTED / EXCLUDED + evidence).
// The V10 function scripts/quant/v10/factor/factors.cjs#marketCapAt stays unchanged and is called first; this module only
// replaces the share value and the split basis of its result. Fail-closed: an EXCLUDED observation returns value null.

const RULE = Object.freeze({
  id: 'v12-mcap-pit-share-correction', version: '1.0.7',
  SAME_FILING_TOLERANCE: 0.02, TWO_REFERENCE_TOLERANCE: 0.10, TIER_B_PRIOR_TOLERANCE: 0.25, TRIGGER_FACTOR: 5,
  ABSOLUTE_MCAP_BOUND_USD: 8e12, MIN_MCAP_USD: 1e6, SAME_FILING_WINDOW_DAYS: 120, WASO_MAX_DURATION_DAYS: 370,
  SCALE_EXPONENTS: Object.freeze([-9, -6, -3, -2, -1, 1, 2, 3, 6, 9]), PRIOR_VINTAGES: 2,
  SPLIT_CONTINUITY_TOLERANCE_OF_LOG_FACTOR: 0.25, SPLIT_CONTINUITY_MAX_GAP_DAYS: 200, SMALL_SPLIT_FACTOR_LOG_BOUND: Math.log(1.10),
  SPLIT_WINDOW: Object.freeze(['2009-01-01', '2025-12-31'])
});
const OUT = Object.freeze(['ECSO', 'CSSO']), WASO = Object.freeze(['WASO_B', 'WASO_D', 'WASO_BD']);
const CONCEPT_CODE = Object.freeze({ 'dei:EntityCommonStockSharesOutstanding': 'ECSO', 'us-gaap:CommonStockSharesOutstanding': 'CSSO' });

const finite = v => typeof v === 'number' && Number.isFinite(v);
const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
const within = (a, b, tol) => finite(a) && finite(b) && b > 0 && Math.abs(a / b - 1) <= tol;
const median = xs => { const s = xs.filter(finite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const lg = x => Math.log10(x);
// 1.0.3/1.0.7: source families. The cover page (dei ECSO) is one source; balance-sheet CSSO and income-statement WASO are
// both financial-statement tables, usually presented 'in thousands', and count as one family (common-cause scale errors).
const family = c => (c === 'ECSO' ? 'COVER' : 'STATEMENTS');

/** f or 1/f equals an integer n <= 1000 or p/q with p, q <= 10 (relative tolerance 1e-4). */
function splitShaped(f) {
  if (!finite(f) || f <= 0) return false;
  for (const x of [f, 1 / f]) {
    const n = Math.round(x); if (n >= 1 && n <= 1000 && Math.abs(n - x) <= 1e-4 * x) return true;
    for (let q = 1; q <= 10; q++) { const p = Math.round(x * q); if (p >= 1 && p <= 10 && Math.abs(p / q - x) <= 1e-4 * x) return true; }
  }
  return false;
}

/**
 * Basis converter: shares reported as of `from` expressed as of `to` with the kept split events
 * (events: [[date, factor]] already filtered to real splits). A split dated s affects reports with date >= s.
 */
function basisFactor(events, from, to) {
  if (from === to) return 1;
  let m = 1;
  if (from < to) { for (const [s, f] of events) if (s > from && s <= to) m *= f; }
  else { for (const [s, f] of events) if (s > to && s <= from) m /= f; }
  return m;
}

/**
 * Classify one share observation (rule steps S0-S6).
 * o: {code: 'ECSO'|'CSSO', v, E, filed, accn, maxPriceBasisD(D) -> max over uses of close(t) x basis multiplier to D (USD per D-basis share)}
 * ctx: {byAccn: Map<accn, fact[]>, priorAccns(filed) -> [{accn, filed, facts}] (latest first, filed < o.filed, already sanitized:
 *       fact.val replaced by corrected value or fact dropped if excluded), basis(from, to) -> multiplier}
 * fact: {c, end, start, val, accn, filed, unit}
 */
function classifyFact(o, ctx) {
  const same = ctx.byAccn.get(o.accn) || [];
  const own = same.find(f => f.c === o.code && finite(f.val) && Math.abs(f.val - o.v) <= 1e-6 * Math.abs(o.v)) || null;
  const D = own ? own.end : o.E;
  const flags = own ? [] : ['RAW_FACT_UNMATCHED'];
  const ev = [];
  const result = (status, cls, vPrime, extra = {}) => ({ status, class: cls, D, rawDateDiffers: D !== o.E, vPrime, factor: finite(vPrime) ? vPrime / o.v : null, flags, evidence: ev, ...extra });
  if (own && own.unit !== 'shares') { ev.push(['RAW_FACT_UNIT', own.c, own.accn, own.end, own.val, own.unit]); return result('EXCLUDED', 'UNIT_ERROR', null); }

  // S3 multi-class duplicates (ECSO, same end, distinct values)
  const dupVals = o.code === 'ECSO' ? [...new Set(same.filter(f => f.c === 'ECSO' && f.end === D && f.unit === 'shares' && f.val > 0).map(f => f.val))] : [];
  const isDup = f => dupVals.length >= 2 && f.c === 'ECSO' && f.end === D;
  const conv = f => ({ c: f.c, accn: f.accn, end: f.end, val: f.val, adj: f.val * ctx.basis(f.end, D) });
  const aOut = same.filter(f => OUT.includes(f.c) && f !== own && !isDup(f) && f.unit === 'shares' && f.val > 0 && Math.abs(days(f.end, D)) <= RULE.SAME_FILING_WINDOW_DAYS).map(conv);
  const aW = same.filter(f => WASO.includes(f.c) && f.unit === 'shares' && f.val > 0 && f.start && days(f.start, f.end) <= RULE.WASO_MAX_DURATION_DAYS && Math.abs(days(f.end, D)) <= RULE.SAME_FILING_WINDOW_DAYS).map(conv);
  // 1.0.6: prior vintages are only the issuer's latest earlier observations validated by this rule (filed < O.filed,
  // corrected value, excluded ones skipped). Raw facts of earlier accessions are no prior vintage any more.
  const prior = (ctx.previousObservations ? ctx.previousObservations(o.filed, RULE.PRIOR_VINTAGES) : [])
    .map(q => ({ c: q.c, accn: q.accn, end: q.end, val: q.val, adj: q.val * ctx.basis(q.end, D), filed: q.filed, kind: 'VALIDATED_OBSERVATION' }));
  const P1 = prior[0] || null, P2 = prior[1] || null;
  const sameVals = aOut.concat(aW);
  let v = o.v, cls = null;
  if (dupVals.length >= 2 && dupVals.includes(o.v)) {
    const totals = aOut.filter(x => x.c === 'CSSO').concat(aW);
    if (!totals.some(x => within(o.v, x.adj, RULE.SAME_FILING_TOLERANCE))) {
      const sum = dupVals.reduce((s, x) => s + x, 0), hit = totals.find(x => within(sum, x.adj, RULE.SAME_FILING_TOLERANCE));
      ev.push(['MULTI_CLASS_VALUES', 'ECSO', o.accn, D, dupVals.slice().sort((a, b) => a - b), null]);
      if (!hit) return result('EXCLUDED', 'MULTI_CLASS_UNRESOLVED', null);
      ev.push(['SAME_FILING_TOTAL', hit.c, hit.accn, hit.end, hit.val, sum / hit.adj]);
      v = sum; cls = 'MULTI_CLASS_SUM';
    }
  }
  // S4 trigger (1.0.1: also against the prior vintage)
  const priceMax = o.maxPriceBasisD(D);
  const ref = aOut.length ? median(aOut.map(x => x.adj)) : aW.length ? median(aW.map(x => x.adj)) : P1 ? P1.adj : null;
  const refKind = aOut.length ? 'SAME_FILING_ALT' : aW.length ? 'SAME_FILING_WASO' : P1 ? 'PRIOR_VINTAGE' : null;
  const overBound = x => finite(priceMax) && x * priceMax > RULE.ABSOLUTE_MCAP_BOUND_USD;
  // 1.0.6 price plausibility: a correction must not create a market cap below MIN_MCAP_USD or above the absolute bound
  const priceMin = o.minPriceBasisD ? o.minPriceBasisD(D) : null;
  const plausible = x => !overBound(x) && !(finite(priceMin) && x * priceMin < RULE.MIN_MCAP_USD);
  const relTrig = ref !== null && Math.abs(lg(v / ref)) >= lg(RULE.TRIGGER_FACTOR);
  const priorTrig = P1 !== null && Math.abs(lg(v / P1.adj)) >= lg(RULE.TRIGGER_FACTOR);
  if (!relTrig && !priorTrig && !overBound(v)) {
    if (cls) return result('CORRECTED', cls, v);
    return result('OK', ref === null ? 'OK_NO_REFERENCE' : 'OK', v, { refKind });
  }
  ev.push(['TRIGGER', relTrig ? refKind : priorTrig ? 'PRIOR_VINTAGE' : 'ABSOLUTE_BOUND', null, null, relTrig ? ref : P1 ? P1.adj : null, relTrig ? v / ref : P1 ? v / P1.adj : null]);
  const kind = x => (x.c.startsWith('WASO') ? 'SAME_FILING_WASO' : 'SAME_FILING_ALT');
  const pe = x => ['PRIOR_VINTAGE', P1.c, P1.accn, P1.end, P1.val, x / P1.adj];
  // S5 H1: scale (tested first; every tier needs prior consistency when a prior vintage exists)
  const comp = [];
  for (const f of same) {
    if (!(f.val > 0) || f.unit !== 'shares') continue;
    if (!P1) break; // 1.0.6: an earlier comparison value counts only if the validated history confirms it
    for (const a of ctx.priorAccns(o.filed, true)) {
      const g = a.facts.find(x => x.c === f.c && x.end === f.end && (x.start || null) === (f.start || null) && x.val > 0);
      if (!g) continue;
      const trusted = OUT.includes(g.c) ? within(g.val, P1.val * ctx.basis(P1.end, g.end), RULE.TIER_B_PRIOR_TOLERANCE) : false;
      if (trusted) comp.push({ c: f.c, end: f.end, val: f.val, earlier: g.val, earlierAccn: g.accn, q: f.val / g.val });
      break;
    }
  }
  // 1.0.2 support: one value per same-filing concept (end closest to D) plus P1 and P2; a scale correction needs more support for v' than for v
  const perConcept = new Map();
  for (const x of sameVals) { const cur = perConcept.get(x.c); if (!cur || Math.abs(days(x.end, D)) < Math.abs(days(cur.end, D))) perConcept.set(x.c, x); }
  const supportRefs = [...perConcept.values()].map(x => x.adj).concat(P1 ? [P1.adj] : [], P2 ? [P2.adj] : []);
  const support = x => supportRefs.filter(r => within(x, r, RULE.TIER_B_PRIOR_TOLERANCE)).length;
  const supportV = support(v);
  const extRefs = (P1 ? [P1.adj] : []).concat(P2 ? [P2.adj] : []);
  const supportExt = x => extRefs.filter(r => within(x, r, RULE.TIER_B_PRIOR_TOLERANCE)).length;
  const tiers = { A: [], B: [], C: [] };
  for (const k of RULE.SCALE_EXPONENTS) {
    const vp = v / Math.pow(10, k);
    if (!plausible(vp)) continue;
    const supported = support(vp) > supportV, extSupported = supportExt(vp) > supportExt(v);
    const priorOk = P1 !== null && within(vp, P1.adj, RULE.TIER_B_PRIOR_TOLERANCE);
    const hitsA = sameVals.filter(x => within(vp, x.adj, RULE.SAME_FILING_TOLERANCE));
    if (supported && hitsA.length && (P1 ? priorOk : new Set(hitsA.map(x => family(x.c))).size >= 2)) {
      const a = hitsA[0];
      tiers.A.push({ k, vp, e: [kind(a), a.c, a.accn, a.end, a.val, vp / a.adj], e2: P1 ? pe(vp) : (hitsA.find(x => family(x.c) !== family(a.c)) && [kind(hitsA.find(x => family(x.c) !== family(a.c))), hitsA.find(x => family(x.c) !== family(a.c)).c, hitsA.find(x => family(x.c) !== family(a.c)).accn, hitsA.find(x => family(x.c) !== family(a.c)).end, hitsA.find(x => family(x.c) !== family(a.c)).val, vp / hitsA.find(x => family(x.c) !== family(a.c)).adj]) });
    }
    // 1.0.4: tier B shows a filing-wide scale error, so same-filing values share it; support is counted on P1/P2 only
    if (Math.abs(k) >= 3 && priorOk && extSupported) {
      const b = comp.find(x => within(x.q, Math.pow(10, k), RULE.SAME_FILING_TOLERANCE));
      const contra = comp.some(x => x.c === o.code && within(x.q, 1, RULE.SAME_FILING_TOLERANCE));
      if (b && !contra) tiers.B.push({ k, vp, e: ['COMPARATIVE_SCALE', b.c, b.earlierAccn, b.end, b.val, b.q], e2: pe(vp) });
    }
    if (supported && P1 && within(vp, P1.adj, RULE.TWO_REFERENCE_TOLERANCE)) {
      const c = sameVals.find(x => within(vp, x.adj, RULE.TWO_REFERENCE_TOLERANCE));
      if (c) tiers.C.push({ k, vp, e: [kind(c), c.c, c.accn, c.end, c.val, vp / c.adj], e2: pe(vp) });
    }
  }
  for (const tier of ['A', 'B', 'C']) {
    const ks = [...new Set(tiers[tier].map(x => x.k))];
    if (!ks.length) continue;
    if (ks.length > 1) { ev.push(['AMBIGUOUS_SCALE', tier, null, null, ks, null]); return result('EXCLUDED', 'AMBIGUOUS_SCALE', null); }
    const h = tiers[tier][0]; ev.push(h.e); if (h.e2) ev.push(h.e2);
    if (overBound(h.vp)) return result('EXCLUDED', 'MCAP_ABSOLUTE_BOUND', null, { scaleExponent: h.k, tier });
    return result('CORRECTED', cls ? cls + '+SCALE_ERROR' : 'SCALE_ERROR', h.vp, { scaleExponent: h.k, tier });
  }
  // S5 H0: value confirmed
  const hits2 = sameVals.filter(x => within(v, x.adj, RULE.SAME_FILING_TOLERANCE));
  const twoConcepts = new Set(hits2.map(x => family(x.c))).size >= 2;
  const outHit = aOut.find(x => within(v, x.adj, RULE.SAME_FILING_TOLERANCE));
  let confirmed = false;
  if (priorTrig) {
    // genuine capital action: deviates >= 5x from the prior vintage, the filing itself confirms v
    if (hits2.length) { confirmed = true; ev.push([kind(hits2[0]), hits2[0].c, hits2[0].accn, hits2[0].end, hits2[0].val, v / hits2[0].adj], pe(v)); }
  } else if (P1 && within(v, P1.adj, RULE.TIER_B_PRIOR_TOLERANCE)) { confirmed = true; ev.push(pe(v)); }
  else if (!P1 && (outHit || twoConcepts)) { const x = outHit || hits2[0]; confirmed = true; ev.push([kind(x), x.c, x.accn, x.end, x.val, v / x.adj]); }
  // 1.0.2 label: a prior vintage off by a power of ten (within 25 %) is the erroneous one, not a capital action
  const priorPow = priorTrig && P1 && RULE.SCALE_EXPONENTS.some(k => within(P1.adj * Math.pow(10, k), v, RULE.TIER_B_PRIOR_TOLERANCE));
  if (confirmed && !overBound(v)) return result(cls ? 'CORRECTED' : 'OK', cls || (priorTrig ? (priorPow ? 'PRIOR_VINTAGE_SCALE_ERROR' : 'GENUINE_CAPITAL_ACTION') : 'ALTERNATIVE_CONCEPT_DEVIATES'), v);
  if (overBound(v)) return result('EXCLUDED', 'MCAP_ABSOLUTE_BOUND', null);
  return result('EXCLUDED', 'UNRESOLVED', null);
}

/**
 * Split-event classification by share continuity (rule S7).
 * facts: outstanding facts [{c, end, val, accn, filed, unit}] of the issuer.
 */
function classifySplitEvent(date, factor, facts) {
  const lf = Math.log(factor), small = Math.abs(lf) < RULE.SMALL_SPLIT_FACTOR_LOG_BOUND;
  const ok = facts.filter(f => OUT.includes(f.c) && f.unit === 'shares' && f.val > 0);
  const before = ok.filter(f => f.end < date && f.filed < date && days(f.end, date) <= RULE.SPLIT_CONTINUITY_MAX_GAP_DAYS).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.filed < b.filed ? -1 : 1))[0] || null;
  const afterAll = ok.filter(f => f.end >= date && days(date, f.end) <= RULE.SPLIT_CONTINUITY_MAX_GAP_DAYS).sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.filed < b.filed ? -1 : 1));
  const after = afterAll[0] || null;
  const base = { date, factor, splitShaped: splitShaped(factor), before: before && [before.c, before.accn, before.end, before.val, before.filed], after: after && [after.c, after.accn, after.end, after.val, after.filed] };
  if (small) return { ...base, class: 'SMALL_FACTOR_ACCEPTED', availableAt: date, ratio: before && after ? after.val / before.val : null };
  if (!before || !after) return { ...base, class: 'UNRESOLVED', reason: 'NO_CONTINUITY_PAIR', availableAt: null, ratio: null };
  const r = after.val / before.val, lr = Math.log(r), tol = RULE.SPLIT_CONTINUITY_TOLERANCE_OF_LOG_FACTOR * Math.abs(lf);
  // 1.0.5: share continuity ~1 for a split-shaped factor contradicts the split but does not show a spin-off -> CONTRADICTED_SPLIT
  const cls = Math.abs(lr - lf) <= tol ? 'REAL_SPLIT' : Math.abs(lr) <= tol ? (base.splitShaped ? 'CONTRADICTED_SPLIT' : 'NOT_A_SPLIT') : 'UNRESOLVED';
  return { ...base, class: cls, ratio: r, availableAt: after.filed };
}

// ------------------------------------------------------------------ runtime (register applied)
let REGISTER = null;
const REGISTER_SCHEMA = 'research-pit-market-cap-register-1.0.0';
/** Index a register object (the data module or an in-memory build) for marketCapAt. */
function indexRegister(reg) {
  if (!reg || reg.schemaVersion !== REGISTER_SCHEMA || reg.ruleVersion !== RULE.version) throw Error('INVALID_RESEARCH_PIT_MARKET_CAP_REGISTER');
  const facts = new Map(), splits = new Map();
  for (const [cik, list] of Object.entries(reg.facts)) for (const r of list) facts.set(cik + '|' + r[0] + '|' + r[1] + '|' + r[2], r);
  for (const [id, list] of Object.entries(reg.splits)) splits.set(id, new Map(list.map(s => [s[0] + '|' + s[1], s])));
  return { meta: reg, facts, splits, columns: reg.factColumns, splitColumns: reg.splitColumns };
}
function loadRegister() {
  if (!REGISTER) REGISTER = indexRegister(require('./research-pit-market-cap-register.cjs'));
  return REGISTER;
}

/**
 * Corrected PIT market cap. args = the V10 marketCapAt arguments plus {securityId, cik, splits} (provider split list of the listing).
 * base: the unchanged V10 result (scripts/quant/v10/factor/factors.cjs#marketCapAt) for the same arguments.
 * Returns {value, status: 'OK'|'CORRECTED'|'EXCLUDED'|'NOT_APPLICABLE', classes, reason, base, evidence}.
 */
function marketCapAt(args, base, register = loadRegister()) {
  if (!base || base.value === null) return { value: null, status: 'NOT_APPLICABLE', reason: base ? base.reason : 'NO_BASE', classes: [], base: base ? base.value : null };
  const s = args.doc.ttm.shares_outstanding, code = CONCEPT_CODE[s.concept] || null;
  const key = args.cik + '|' + s.accn + '|' + code + '|' + s.v;
  const rec = register.facts.get(key) || null, C = register.columns;
  const col = name => (rec ? rec[C.indexOf(name)] : null);
  const classes = [];
  const status0 = rec ? col('status') : 'OK';
  if (status0 === 'EXCLUDED') return { value: null, status: 'EXCLUDED', reason: col('class'), classes: [col('class')], base: base.value, fact: rec };
  const vPrime = rec && finite(col('vPrime')) ? col('vPrime') : s.v;
  if (rec && status0 === 'CORRECTED') classes.push(col('class'));
  const D = rec && col('D') ? col('D') : s.end;
  const t = args.dates[args.i], cutoff = args.cutoff;
  const reg = register.splits.get(args.securityId) || new Map(), SC = register.splitColumns;
  let mult = 1, removed = false, unresolved = null;
  for (const [sd, f] of args.splits || []) {
    if (!(sd > D && sd <= t)) continue;
    const r = reg.get(sd + '|' + f) || null;
    const cls = r ? r[SC.indexOf('class')] : null, avail = r ? r[SC.indexOf('availableAt')] : null, known = avail !== null && avail <= cutoff;
    if (cls === 'NOT_A_SPLIT' && known) { removed = true; continue; }
    if (cls === 'CONTRADICTED_SPLIT' && known) { unresolved = { date: sd, factor: f, class: cls, availableAt: avail }; continue; }
    if (Math.abs(Math.log(f)) < RULE.SMALL_SPLIT_FACTOR_LOG_BOUND || splitShaped(f) || (cls === 'REAL_SPLIT' && known)) { mult *= f; continue; }
    unresolved = { date: sd, factor: f, class: cls, availableAt: avail };
  }
  if (unresolved) return { value: null, status: 'EXCLUDED', reason: 'SPLIT_BASIS_UNRESOLVED', classes: ['SPLIT_BASIS_UNRESOLVED'], base: base.value, split: unresolved };
  const fI = args.factors[args.i];
  const value = vPrime * args.closes[args.i] * fI * mult;
  if (removed) classes.push('SPINOFF_AS_SPLIT');
  if (Math.abs(value / (vPrime * base.value / s.v) - 1) > 1e-9 && !removed) classes.push('SPLIT_TIMING');
  if (value > RULE.ABSOLUTE_MCAP_BOUND_USD) return { value: null, status: 'EXCLUDED', reason: 'MCAP_ABSOLUTE_BOUND', classes: classes.concat('MCAP_ABSOLUTE_BOUND'), base: base.value };
  return { value, status: classes.length ? 'CORRECTED' : 'OK', reason: null, classes, base: base.value, fact: rec };
}

module.exports = { RULE, CONCEPT_CODE, splitShaped, basisFactor, classifyFact, classifySplitEvent, marketCapAt, loadRegister, indexRegister, REGISTER_SCHEMA, _days: days, _median: median };
