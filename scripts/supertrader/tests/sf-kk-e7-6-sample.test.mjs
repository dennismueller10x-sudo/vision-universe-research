// Eigentuemerentscheidung E7-6 (25.10.2026), Kullamaegi EP (C09) / PS (C10): vorregistrierte Erweiterung der
// IEX-Stichprobe CLEAN_EXT_E7_6, hoechstens 550 Anfragen, fail closed. Synthetische Daten, keine Netz- oder Speicherzugriffe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXT_E7_6_ID, EXT_E7_6_REQUEST_CAP, EXT_E7_6_TARGETS, EXT_E7_6_SCHEME, EXT_E7_6_PRIORITY, EXT_E7_6_REGISTRATION, kkExtE76RegistrySha256, extPopulation, extTargets, planExtension, runExtFetch, extDaySets } from '../source-faithful/research/kk-sample-ext-e7-6.mjs';
import { kkSampleRegistrySha256, hashOrder, STRATA_MIN_POPULATION, STRATA_SCHEMES, LIQUIDITY_BOUNDS, cleanPrefix } from '../source-faithful/research/kk-sample.mjs';
import { epVariantRegistrySha256 } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { psVariantRegistrySha256 } from '../source-faithful/research/kk-ps-study.mjs';
import { getJson, cacheKey, extCacheKey, EXT_LEDGER_KEY, assertExtFetchAllowed, CACHE_SHARDS, KK_RESEARCH_FILES } from '../source-faithful/research/run-kk-intraday.mjs';

// Vorregistrierung E7-6, festgeschrieben vor dem ersten Abruf
const PINNED_E7_6 = '1422f2efb6eaa0f1f643995679a39f07ae1f196d3b6fe4a02dd258220ce853f8';
// Referenzen, die E7-6 nicht aendern darf (Supertrader 6.0 / 7.0, Lauf 40107434014)
const PINNED_REFERENCES = Object.freeze({ sample: 'ca54c1feed3545cd28632cebaf2b12473f9e2461821e2a54a1605338ed73caae', ep: 'e8d25282f42a98234dd8782a35960dca3776ff0a4657a84e7eff5aab41a3b22f', ps: '436358d6444f6168c16c09631d112914918daff17c3624ae59fa4b35377a04e9' });

const day = (k) => new Date(Date.UTC(2018, 0, 2) + k * 864e5).toISOString().slice(0, 10);
/** n securities, each with one candidate on its trade day; dollar volume decides the liquidity stratum. */
function universe(n, { dv = (j) => [3e6, 30e6, 300e6][j % 3], tradeAt = 30 } = {}) {
  const secs = [], cands = [];
  for (let j = 0; j < n; j++) {
    const px = 20, vol = dv(j) / px, year = j % 2 ? 0 : 400; // two years
    const bars = Array.from({ length: 60 }, (_, k) => ({ date: day(k + year), open: px, high: px * 1.01, low: px * 0.99, close: px, volume: vol, rawClose: px, rawVolume: vol }));
    secs.push({ id: `US:X:T${j}`, bars });
    cands.push({ id: `US:X:T${j}`, ticker: `T${j}`, i: tradeAt, date: bars[tradeAt].date, gap: 0.12 });
  }
  const byId = new Map(secs.map((s) => [s.id, s]));
  return { secs, cands, barsOf: (c) => byId.get(c.id).bars };
}

test('E7-6-PREREG: Vorregistrierung festgeschrieben; Anteile, Schema, Prioritaet und Obergrenze exakt', () => {
  assert.equal(kkExtE76RegistrySha256(), PINNED_E7_6);
  assert.equal(EXT_E7_6_ID, 'CLEAN_EXT_E7_6'); assert.equal(EXT_E7_6_REQUEST_CAP, 550);
  assert.deepEqual(EXT_E7_6_TARGETS, { ps: { num: 35, den: 1000 }, ep: { num: 15, den: 100 } });
  assert.deepEqual([...EXT_E7_6_PRIORITY], ['ps', 'ep']);
  assert.equal(EXT_E7_6_SCHEME, STRATA_SCHEMES[0]); assert.deepEqual([...EXT_E7_6_SCHEME.dims], ['year', 'liquidity']);
  assert.equal(EXT_E7_6_REGISTRATION.minPopulation, STRATA_MIN_POPULATION); assert.equal(EXT_E7_6_REGISTRATION.outcomeInputs, 'none');
  // the research code hash covers the extension module
  assert.ok(KK_RESEARCH_FILES.includes('kk-sample-ext-e7-6.mjs'));
});

test('E7-6-REFERENCES: Referenzstichproben und Variantenregister unveraendert; Erweiterung in eigenen Cache-Objekten', () => {
  assert.equal(kkSampleRegistrySha256(), PINNED_REFERENCES.sample);
  assert.equal(epVariantRegistrySha256(), PINNED_REFERENCES.ep); assert.equal(psVariantRegistrySha256(), PINNED_REFERENCES.ps);
  assert.deepEqual([...LIQUIDITY_BOUNDS], [10_000_000, 100_000_000]); assert.equal(STRATA_MIN_POPULATION, 100);
  // the extension never shares an object with the reference cache, so the reference day sets cannot move
  const ref = new Set(), ext = new Set();
  for (let h = 0; h < CACHE_SHARDS; h++) for (const kind of ['minutes', 'baseline']) { ref.add(cacheKey(kind, h.toString(16))); ext.add(extCacheKey(kind, h.toString(16))); }
  for (const k of ext) assert.ok(!ref.has(k), k);
  assert.ok(!ref.has(EXT_LEDGER_KEY));
  for (const k of ext) assert.match(k, /^_validation\/kk-epps-v2\/ext-e7-6\//);
  // the runner computes the reference day sets from the reference cache only and switches the view for the extension alone
  const rk = fs.readFileSync(new URL('../source-faithful/research/run-kk-intraday.mjs', import.meta.url), 'utf8');
  assert.match(rk, /const sets = buildDaySets\(\{ epCands: cand\.ep, psCands: cand\.ps, minuteCache, baseCache,/);
  assert.match(rk, /const keyFn = EXT \? extCacheKey : cacheKey;/);
  assert.ok(rk.indexOf('view = { min: mMin, base: mBase }') > rk.indexOf("log(`PS ${setId} ${overlap}: REF closed"), 'the merged view starts after every reference evaluation');
});

test('E7-6-TARGETS: je Schicht genau floor(Anteil x Population) Schluessel, in Hash-Reihenfolge, nur Schichten >= 100', () => {
  const u = universe(900);
  const pop = extPopulation(u.cands, u.barsOf, '2017-01-03');
  const t = extTargets(pop.stratum, EXT_E7_6_TARGETS.ep);
  const by = new Map(); for (const [k, s] of pop.stratum) { if (!by.has(s)) by.set(s, []); by.get(s).push(k); }
  assert.equal(by.size, 6);
  for (const [s, keys] of by) {
    const x = t.strata[s];
    assert.equal(x.population, keys.length); assert.equal(x.eligible, keys.length >= 100);
    assert.equal(x.target, Math.floor((15 * keys.length) / 100));
    // the target keys of a stratum are exactly its hash-order prefix: an existing clean prefix in the stratum stays inside
    assert.deepEqual(hashOrder(keys).filter((k) => t.keys.has(k)), hashOrder(keys).slice(0, x.target));
    const cp = cleanPrefix(hashOrder(keys), { cached: () => true, ownPath: (k) => hashOrder(keys).indexOf(k) < 5 });
    for (const k of cp.keys) assert.ok(t.keys.has(k));
  }
  // a stratum below the minimum population takes no part
  const small = extTargets(new Map(Array.from({ length: 99 }, (_, n) => [`S${n}|2018-01-02`, 'X'])), EXT_E7_6_TARGETS.ps);
  assert.equal(small.keys.size, 0); assert.equal(small.strata.X.eligible, false);
});

test('E7-6-OUTCOME-BLIND: Auswahl deterministisch und unabhaengig von Rendite, PnL und spaeteren Kursen (Mutationstest)', () => {
  const plan = (u) => {
    const ep = extPopulation(u.cands, u.barsOf, '2017-01-03'), ps = extPopulation(u.cands, u.barsOf, '2017-01-03');
    const et = extTargets(ep.stratum, EXT_E7_6_TARGETS.ep), pt = extTargets(ps.stratum, EXT_E7_6_TARGETS.ps);
    return planExtension({ psTargets: pt.keys, epTargets: et.keys, costPs: () => 1, costEp: () => 2 });
  };
  const a = plan(universe(900));
  // mutate everything an outcome could be read from: later prices (exit side), PnL / return fields, candidate order
  const u = universe(900);
  for (const s of u.secs) for (let k = 30; k < s.bars.length; k++) { const f = 1 + ((k * 7919 + s.id.length) % 17 - 8) / 10; Object.assign(s.bars[k], { open: 20 * f, high: 22 * f, low: 18 * f, close: 21 * f, rawClose: 21 * f }); }
  u.cands.forEach((c, n) => Object.assign(c, { pnl: n % 2 ? 1e6 : -1e6, netReturn: (n % 13) / 10, realizedPnl: -n, rMultiple: n, gap: 0.5 }));
  u.cands.reverse();
  const b = plan(u);
  assert.equal(b.planSha256, a.planSha256); assert.deepEqual(b.list, a.list);
  // repeated runs are identical
  assert.equal(plan(universe(900)).planSha256, a.planSha256);
  // the source of the module reads no outcome field
  const src = fs.readFileSync(new URL('../source-faithful/research/kk-sample-ext-e7-6.mjs', import.meta.url), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
  assert.doesNotMatch(src, /\.(pnl|netReturn|realizedPnl|unrealizedPnl|exitDate|exitReason|rMultiple|metrics)\b/);
});

test('E7-6-PLAN-CAP: Schritt 1 (PS) vollstaendig zuerst, dann EP in Hash-Reihenfolge; der Plan ueberschreitet 550 nie', () => {
  const ps = new Set(Array.from({ length: 300 }, (_, n) => `P${n}|2019-01-02`)), ep = new Set(Array.from({ length: 200 }, (_, n) => `E${n}|2019-01-02`));
  const p = planExtension({ psTargets: ps, epTargets: ep, costPs: () => 1, costEp: () => 2 });
  assert.equal(p.requestsNeededTotal, 700); assert.equal(p.truncated, true); assert.ok(p.requests <= 550);
  assert.equal(p.counts.ps.plannedKeys, 300); assert.equal(p.counts.ps.truncatedKeys, 0);
  assert.equal(p.counts.ep.plannedKeys, 125); assert.equal(p.requests, 550);
  // EP truncation is the global hash-order prefix of the missing EP keys
  assert.deepEqual(p.list.filter((x) => x.method === 'ep').map((x) => x.key), hashOrder([...ep]).slice(0, 125));
  assert.ok(p.list.findIndex((x) => x.method === 'ep') > p.list.findLastIndex((x) => x.method === 'ps'));
  // an EP day is never started without room for both requests: one request left -> the plan stops
  const odd = planExtension({ psTargets: new Set(Array.from({ length: 549 }, (_, n) => `Q${n}|2019-01-02`)), epTargets: ep, costPs: () => 1, costEp: () => 2 });
  assert.equal(odd.requests, 549); assert.equal(odd.counts.ep.plannedKeys, 0);
  // cached keys cost nothing and are not planned
  const c = planExtension({ psTargets: ps, epTargets: ep, costPs: (k) => (k.startsWith('P1') ? 0 : 1), costEp: () => 0 });
  assert.equal(c.list.length, ps.size - [...ps].filter((k) => k.startsWith('P1')).length); assert.equal(c.truncated, false);
  // PS alone above the cap: PS truncated in hash order, no EP
  const big = planExtension({ psTargets: new Set(Array.from({ length: 800 }, (_, n) => `R${n}|2019-01-02`)), epTargets: ep, costPs: () => 1, costEp: () => 2 });
  assert.equal(big.requests, 550); assert.equal(big.counts.ep.plannedKeys, 0);
  assert.throws(() => planExtension({ psTargets: ps, epTargets: ep, costPs: () => 1, costEp: () => 2, cap: 551 }), /EXT_E7_6_CAP_INVALID/);
});

test('E7-6-FETCH-FAIL-CLOSED: Abbruf vor jeder Anfrage ueber 550 (auch durch Wiederholungen); nur ein Abruf (Ledger)', async () => {
  const keys = Array.from({ length: 600 }, (_, n) => `F${n}|2019-01-02`);
  const plan = planExtension({ psTargets: new Set(keys), epTargets: new Set(), costPs: () => 1, costEp: () => 0 });
  assert.equal(plan.requests, 550);
  // every request is answered 429 at first: retries consume the budget, the run must abort at the cap, never finish quietly
  let calls = 0, first = new Set();
  const flaky = async (url) => { calls++; if (!first.has(url)) { first.add(url); return { status: 429, text: async () => '' }; } return { status: 200, text: async () => '[]' }; };
  const budget = { used: 0, max: EXT_E7_6_REQUEST_CAP }, have = new Set();
  const fetchMinutes = async (k, b) => { const r = await getJson(`u/${k}`, 'key', b, flaky, async () => {}); if (r.status === 200) have.add(k); return r.status; };
  await assert.rejects(runExtFetch({ plan, needs: (k) => ({ minutes: !have.has(k) }), fetchMinutes, fetchBaseline: async () => { throw new Error('no EP'); }, budget, pause: async () => {} }), /EXT_E7_6_REQUEST_CAP_REACHED/);
  assert.ok(budget.used <= EXT_E7_6_REQUEST_CAP); assert.equal(calls, budget.used); assert.ok(have.size < plan.list.length);
  // without retries the plan finishes exactly at its planned count
  const b2 = { used: 0, max: EXT_E7_6_REQUEST_CAP }, have2 = new Set();
  const ok = await runExtFetch({ plan, needs: (k) => ({ minutes: !have2.has(k) }), fetchMinutes: async (k, b) => { for (const x of b) x.used++; have2.add(k); return 200; }, fetchBaseline: async () => 200, budget: b2, pause: async () => {} });
  assert.equal(ok.keysDone, 550); assert.equal(b2.used, 550);
  // a budget above the cap or a plan above the budget is refused before any request
  await assert.rejects(runExtFetch({ plan, needs: () => ({ minutes: true }), fetchMinutes: async () => 200, fetchBaseline: async () => 200, budget: { used: 0, max: 551 } }), /EXT_E7_6_PLAN_ABOVE_CAP/);
  await assert.rejects(runExtFetch({ plan, needs: () => ({ minutes: true }), fetchMinutes: async () => 200, fetchBaseline: async () => 200, budget: { used: 0, max: 100 } }), /EXT_E7_6_PLAN_ABOVE_CAP/);
  // EP: a key needs room for minutes and baseline; a fetcher that over-consumes aborts
  const ep = planExtension({ psTargets: new Set(), epTargets: new Set(['E1|2019-01-02', 'E2|2019-01-02']), costPs: () => 0, costEp: () => 2 });
  const b3 = { used: 0, max: 3 };
  await assert.rejects(runExtFetch({ plan: { ...ep, requests: 3 }, needs: () => ({ minutes: true, baseline: true }), fetchMinutes: async (k, b) => { for (const x of b) x.used++; return 200; }, fetchBaseline: async (k, b) => { for (const x of b) x.used++; return 200; }, budget: b3, pause: async () => {} }), /EXT_E7_6_REQUEST_CAP_REACHED/);
  assert.equal(b3.used, 2);
  // once only: any ledger (started, complete or aborted) refuses a second fetch
  assert.doesNotThrow(() => assertExtFetchAllowed(null));
  for (const status of ['STARTED', 'COMPLETE', 'ABORTED_AT_CAP', 'ABORTED_ERROR']) assert.throws(() => assertExtFetchAllowed({ status, runId: '1' }), /EXT_E7_6_ALREADY_FETCHED/);
  const rk = fs.readFileSync(new URL('../source-faithful/research/run-kk-intraday.mjs', import.meta.url), 'utf8');
  assert.ok(rk.indexOf("status: 'STARTED'") < rk.indexOf('done = await runExtFetch('), 'the ledger is written before the first request');
  assert.match(rk, /assertExtFetchAllowed\(ledger\); \/\/ once only/);
});

test('E7-6-CACHE-ONLY: Cache-only und Planlauf stellen 0 Anfragen; die Auswertung ruft nie einen Abrufer', async () => {
  let calls = 0;
  const plan = planExtension({ psTargets: new Set(['A|2019-01-02']), epTargets: new Set(['B|2019-01-02']), costPs: () => 1, costEp: () => 2 });
  const r = await runExtFetch({ plan, cacheOnly: true, needs: () => ({ minutes: true, baseline: true }), fetchMinutes: async () => { calls++; return 200; }, fetchBaseline: async () => { calls++; return 200; }, budget: { used: 0, max: 0 } });
  assert.deepEqual(r, { skipped: true, keysDone: 0 }); assert.equal(calls, 0);
  const rk = fs.readFileSync(new URL('../source-faithful/research/run-kk-intraday.mjs', import.meta.url), 'utf8');
  // cache-only and the extension fetch are exclusive; the plan run has no key and asserts zero requests; neither writes a cache
  assert.match(rk, /EXT_E7_6_AND_CACHE_ONLY_EXCLUSIVE/); assert.match(rk, /EXT_E7_6_PLAN_REQUEST_COUNT_NOT_ZERO/);
  assert.match(rk, /KEY = CACHE_ONLY \|\| EXT_COUNT \? '' :/);
  assert.match(rk, /if \(LIMIT \|\| verification\.smokeStore \|\| CACHE_ONLY \|\| EXT_COUNT\) return;/);
  assert.match(rk, /if \(CACHE_ONLY \|\| EXT_COUNT\) noRequests\(\);/);
  assert.match(rk, /CACHE_ONLY_REQUEST_COUNT_NOT_ZERO/);
});

test('E7-6-DAY-SETS: PS-Satz = Zielschluessel mit Minuten; EP-Satz zusaetzlich mit IEX-Basis > 0; Zaehlungen je Schicht', () => {
  const u = universe(900), pop = extPopulation(u.cands, u.barsOf, '2017-01-03');
  const pt = extTargets(pop.stratum, EXT_E7_6_TARGETS.ps), et = extTargets(pop.stratum, EXT_E7_6_TARGETS.ep);
  const ek = [...et.keys], miss = new Set(ek.slice(0, 3)), noBase = new Set(ek.slice(3, 5));
  const d = extDaySets({ psTargets: pt, epTargets: et, psPop: pop.stratum, epPop: pop.stratum, hasMinutes: (k) => !miss.has(k), baselineMean: (k) => (noBase.has(k) ? null : 10), beforeEp: new Set(ek.slice(0, 10)) });
  assert.equal(d.ps.size, [...pt.keys].filter((k) => !miss.has(k)).length);
  assert.equal(d.ep.size, et.keys.size - 5); assert.equal(d.public.ep.holes, 3); assert.equal(d.public.ep.excludedBaseline, 2);
  const sum = (o, f) => Object.values(o).reduce((a, x) => a + x[f], 0);
  assert.equal(sum(d.public.ep.strata, 'inDaySet'), d.ep.size); assert.equal(sum(d.public.ep.strata, 'cleanPrefixBefore'), 10);
  assert.equal(sum(d.public.ep.strata, 'target'), et.keys.size);
  assert.ok(d.public.ep.minShareAfter.value > 0 && d.public.ep.minShareAfter.value <= 0.15);
  // public output: counts and hashes only, never keys or minute values
  assert.doesNotMatch(JSON.stringify(d.public), /\|20\d\d-/);
});
