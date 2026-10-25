/**
 * Kullamaegi EP (C09) / PS (C10), owner decision E7-6 (2026-10-25): one pre-registered extension of the IEX intraday
 * sample, at most 550 additional Tiingo requests, inside the existing run budget. DIAGNOSTIC_NOT_CERTIFIED. Pure
 * functions (no IO). Docs: docs/SUPERTRADER_7_EPPS_SAMPLE_E7_6.md, plan: docs/SUPERTRADER_KK_EP_PS_CHART_FIRST.md
 * section 8 (E5, priorities 1 and 2).
 *
 * Pre-registration (pinned in sf-kk-e7-6-sample.test.mjs before any fetch):
 *  - strata: the existing scheme YEAR_X_LIQUIDITY of research/kk-sample.mjs (same features, same bounds, same minimum
 *    population of 100 candidate keys; smaller strata take no part and are counted);
 *  - target per eligible stratum: PS 3.5 % and EP 15 % of its candidate keys, exactly floor(share x population) keys;
 *  - selection: the first `target` keys of the stratum in the existing sha256(TICKER|date) hash order. Keys already in
 *    the cache are reused, the next not-yet-cached keys are fetched. Nothing depends on returns, PnL or any outcome:
 *    the inputs are the candidate keys and their strata (year, liquidity of the 20 sessions BEFORE the trade day);
 *  - priority under the cap: step 1 (PS) fully first, then step 2 (EP) as far as the cap allows, each in the global
 *    hash order of its missing keys; the plan stops at the first key that no longer fits (pure hash-order prefix,
 *    an EP day is never started without room for both its requests);
 *  - hard cap 550 HTTP attempts (retries included), fail closed: the plan never exceeds it, the fetch aborts before
 *    an attempt beyond it, and a second fetch is refused (private ledger, "einmalig");
 *  - the reference samples are untouched: the extension writes separate private cache objects, the reference day sets
 *    (BEFORE_FIX, CLEAN, STRAT_*) are computed from the reference cache only; the extension is the additional day set
 *    CLEAN_EXT_E7_6 evaluated beside them.
 * Every number is a research convention (MODEL_ASSUMPTION), never a Kullamaegi source rule.
 */
import { STRATA_SCHEMES, STRATA_MIN_POPULATION, KK_SAMPLE_VERSION, hashOrder, sha256Hex, strataFeatures, stratumOf } from './kk-sample.mjs';

export const KK_EXT_E7_6_VERSION = 'kk-sample-ext-e7-6-1.0.0';
export const EXT_E7_6_ID = 'CLEAN_EXT_E7_6';
export const EXT_E7_6_REQUEST_CAP = 550;
export const EXT_E7_6_SCHEME = STRATA_SCHEMES.find((s) => s.id === 'YEAR_X_LIQUIDITY');
/** Exact rational target shares per eligible stratum. */
export const EXT_E7_6_TARGETS = Object.freeze({ ps: Object.freeze({ num: 35, den: 1000 }), ep: Object.freeze({ num: 15, den: 100 }) });
export const EXT_E7_6_PRIORITY = Object.freeze(['ps', 'ep']); // E5 step 1 (PS 3.5 %), then step 2 (EP 15 %)
export const EXT_E7_6_REGISTRATION = Object.freeze({
  id: EXT_E7_6_ID, version: KK_EXT_E7_6_VERSION, decision: 'E7-6 (owner, 2026-10-25): einmalig bis zu 550 zusaetzliche Tiingo-Intraday-Anfragen im bestehenden Budget; vorab geschichtet; keine Auswahl nach Profitabilitaet; keine Aenderung bisheriger Referenzen',
  baseSample: KK_SAMPLE_VERSION, scheme: EXT_E7_6_SCHEME, minPopulation: STRATA_MIN_POPULATION, targets: EXT_E7_6_TARGETS,
  selection: 'per eligible stratum the first floor(share x population) candidate keys in sha256(TICKER|date) hash order; cached keys reused, missing keys fetched',
  requestCost: { ps: 'minutes 1 if missing', ep: 'minutes 1 if missing + baseline 1 if missing (0 below IEX_BASELINE_SESSIONS of history)' },
  priority: EXT_E7_6_PRIORITY, truncation: 'PS missing keys in global hash order, then EP missing keys in global hash order; stop at the first key that does not fit the cap',
  requestCap: EXT_E7_6_REQUEST_CAP, capRule: 'FAIL_CLOSED: plan <= cap, abort before any attempt beyond the cap, one fetch only (private ledger)',
  daySets: { ps: 'target keys with minutes', ep: 'target keys with minutes and IEX baseline mean > 0 (EP common day set rule)' },
  references: 'unchanged: separate private cache objects; BEFORE_FIX / CLEAN / STRAT_* from the reference cache only',
  outcomeInputs: 'none',
});
export const kkExtE76RegistrySha256 = () => sha256Hex(EXT_E7_6_REGISTRATION);

const keyOf = (c) => `${c.ticker}|${c.date}`;
/**
 * Population of one method: key -> stratum (YEAR_X_LIQUIDITY), first candidate per key from `firstDate` on, exactly as
 * run-kk-intraday.mjs#buildDaySets builds it. Only the key, the year and the liquidity of the sessions before the trade
 * day enter; anything else on the candidate or later in the bars is ignored.
 */
export function extPopulation(cands, barsOf, firstDate) {
  const first = new Map();
  for (const c of cands) { const k = keyOf(c); if (c.date >= firstDate && !first.has(k)) first.set(k, c); }
  return { stratum: new Map([...first].map(([k, c]) => [k, stratumOf(strataFeatures(barsOf(c), c.i, new Map()), EXT_E7_6_SCHEME)])), cand: first };
}

/** Per eligible stratum the first floor(share x population) keys in hash order. Returns { keys (Set), strata }. */
export function extTargets(population, { num, den }, minPopulation = STRATA_MIN_POPULATION) {
  const by = new Map();
  for (const [k, s] of population) { if (!by.has(s)) by.set(s, []); by.get(s).push(k); }
  const keys = new Set(), strata = {};
  for (const s of [...by.keys()].sort()) {
    const all = by.get(s), eligible = all.length >= minPopulation, target = eligible ? Math.floor((num * all.length) / den) : 0;
    for (const k of hashOrder(all).slice(0, target)) keys.add(k);
    strata[s] = { population: all.length, eligible, target };
  }
  return { keys, strata };
}

/**
 * Fetch plan under the cap. costPs(k) / costEp(k): requests a target key still needs (0 = complete). Step 1 (PS) then
 * step 2 (EP), each in global hash order; stops at the first key that does not fit. Returns the ordered fetch list and
 * the public counts; `requests <= cap` always holds.
 */
export function planExtension({ psTargets, epTargets, costPs, costEp, cap = EXT_E7_6_REQUEST_CAP }) {
  if (!Number.isInteger(cap) || cap < 0 || cap > EXT_E7_6_REQUEST_CAP) throw new Error('EXT_E7_6_CAP_INVALID');
  const need = { ps: hashOrder([...psTargets]).map((k) => [k, costPs(k)]).filter(([, n]) => n > 0), ep: hashOrder([...epTargets]).map((k) => [k, costEp(k)]).filter(([, n]) => n > 0) };
  const list = [], counts = {};
  let used = 0, stopped = false;
  for (const m of EXT_E7_6_PRIORITY) {
    const req = need[m].reduce((a, [, n]) => a + n, 0);
    let keys = 0, requests = 0;
    for (const [k, n] of need[m]) {
      if (stopped || used + n > cap) { stopped = true; break; }
      list.push({ method: m, key: k, requests: n }); used += n; keys++; requests += n;
    }
    counts[m] = { missingKeys: need[m].length, requestsNeeded: req, plannedKeys: keys, plannedRequests: requests, truncatedKeys: need[m].length - keys };
  }
  const requestsNeededTotal = counts.ps.requestsNeeded + counts.ep.requestsNeeded;
  if (used > cap) throw new Error('EXT_E7_6_PLAN_ABOVE_CAP');
  return { list, requests: used, cap, requestsNeededTotal, truncated: requestsNeededTotal > used, counts, planSha256: sha256Hex(list) };
}

/**
 * Executes a plan, fail closed. fetchMinutes(k, budgets) / fetchBaseline(k, budgets) consume the budget per attempt
 * (run-kk-intraday.mjs#getJson). Before every key the remaining cap must cover its planned requests; an attempt the
 * budget refused (BUDGET_EXHAUSTED, e.g. after retries) or a budget above the cap aborts with EXT_E7_6_REQUEST_CAP_REACHED.
 * `cacheOnly` never calls a fetcher. needs(k) -> { minutes, baseline } (booleans) at the time of the key, optional baselineCost (0 for a baseline
 * decided without a request: too little history).
 */
export async function runExtFetch({ plan, cacheOnly = false, needs, fetchMinutes, fetchBaseline, budget, checkpoint = async () => {}, pause = () => new Promise((res) => setTimeout(res, 120)) }) {
  if (cacheOnly) return { skipped: true, keysDone: 0 };
  if (!budget || budget.max > EXT_E7_6_REQUEST_CAP || plan.requests > budget.max) throw new Error('EXT_E7_6_PLAN_ABOVE_CAP');
  const capFail = () => { const e = new Error('EXT_E7_6_REQUEST_CAP_REACHED'); e.code = 'EXT_E7_6_REQUEST_CAP_REACHED'; throw e; };
  let keysDone = 0;
  for (const p of plan.list) {
    const n = needs(p.key, p.method), cost = (n.minutes ? 1 : 0) + (p.method === 'ep' && n.baseline ? (n.baselineCost ?? 1) : 0);
    if (!cost) { keysDone++; continue; }
    if (budget.max - budget.used < cost) capFail();
    if (p.method === 'ep' && n.baseline && (await fetchBaseline(p.key, [budget])) === 'BUDGET_EXHAUSTED') capFail();
    if (n.minutes && (await fetchMinutes(p.key, [budget])) === 'BUDGET_EXHAUSTED') capFail();
    if (budget.used > budget.max) capFail();
    keysDone++;
    await checkpoint(); await pause();
  }
  return { skipped: false, keysDone };
}

/**
 * Day sets of the extension (from the merged view: reference cache plus extension cache) and public per-stratum
 * counts. `before` per stratum: cached keys of the reference clean prefix (Supertrader 6.0) in that stratum.
 */
export function extDaySets({ psTargets, epTargets, psPop, epPop, hasMinutes, baselineMean, beforePs = new Set(), beforeEp = new Set() }) {
  const ps = new Set([...psTargets.keys].filter(hasMinutes));
  const epMin = [...epTargets.keys].filter(hasMinutes);
  const ep = new Set(epMin.filter((k) => baselineMean(k) > 0));
  const per = (targets, pop, set, before) => {
    const out = {};
    for (const [s, x] of Object.entries(targets.strata)) out[s] = { ...x, cleanPrefixBefore: 0, inDaySet: 0 };
    for (const [k, s] of pop) { if (before.has(k)) out[s].cleanPrefixBefore++; if (set.has(k)) out[s].inDaySet++; }
    return out;
  };
  const minShare = (strata, f) => { let best = null; for (const x of Object.values(strata)) if (x.eligible && (best === null || x[f] * best.den < best.num * x.population)) best = { num: x[f], den: x.population }; return best && { ...best, value: best.num / best.den }; };
  const psS = per(psTargets, psPop, ps, beforePs), epS = per(epTargets, epPop, ep, beforeEp);
  return {
    ps, ep,
    public: {
      id: EXT_E7_6_ID, version: KK_EXT_E7_6_VERSION, registrySha256: kkExtE76RegistrySha256(),
      ps: { targetKeys: psTargets.keys.size, inDaySet: ps.size, holes: psTargets.keys.size - ps.size, strata: psS, minShareBefore: minShare(psS, 'cleanPrefixBefore'), minShareAfter: minShare(psS, 'inDaySet'), excludedSmallStrata: Object.values(psTargets.strata).filter((x) => !x.eligible).length },
      ep: { targetKeys: epTargets.keys.size, withMinutes: epMin.length, inDaySet: ep.size, holes: epTargets.keys.size - epMin.length, excludedBaseline: epMin.length - ep.size, strata: epS, minShareBefore: minShare(epS, 'cleanPrefixBefore'), minShareAfter: minShare(epS, 'inDaySet'), excludedSmallStrata: Object.values(epTargets.strata).filter((x) => !x.eligible).length },
    },
  };
}
