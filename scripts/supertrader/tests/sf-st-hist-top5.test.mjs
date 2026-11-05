// Supertrader Neustart – historischer Backtest der V1-Methoden (Top 5). Synthetische Reihen, kein Netz, keine Anbieterdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../source-faithful/research/run-st-hist-top5.mjs';
import * as L from '../validation/lib.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { SF6_VALIDATION_PROTOCOL } from '../source-faithful/research/run-sf6-validation.mjs';

const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2017, 11, 29); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function bars(seed, drift) {
  const r = rng(seed), out = []; let c = 20;
  for (const d of CAL) { const o = c; c = c * (1 + drift + 0.03 * (r() - 0.5)); out.push({ date: d, open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: Number(c.toFixed(4)), volume: 2e6 * (1 + r()), adjClose: null, dividend: 0, splitFactor: 1 }); }
  return out;
}
const sec = (id, seed, drift) => securityFromSegment({ id, raw: bars(seed, drift), endCause: 'ACTIVE', delisted: false, survivor: true });
const ds = () => ({ calendar: CAL.filter((d) => d >= WIN.from && d <= WIN.to), securities: [sec('tiingo:NYSE:AAA:2010-01-04', 3, 0.0015), sec('tiingo:NYSE:BBB:2010-01-04', 5, 0.0008), sec('tiingo:NASDAQ:CCC:2010-01-04', 9, 0.002)], spyTR: CAL.map((date, i) => ({ date, value: 100 * 1.0003 ** i })), benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })) });

test('ST-HIST-1: genau die V1-Methoden, als Forschung beschriftet, keine Renditeaussage', () => {
  assert.deepEqual([...T.TOP5], ['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']);
  assert.equal(T.LABEL.label, 'Forschung, nicht zertifiziert');
  assert.equal(T.LABEL.performanceClaim, 'NONE');
  assert.equal(T.LABEL.productionApproved, false);
});

test('ST-HIST-2: je Methode und vorregistrierter Kostenstufe Trades, Trefferquote, Rendite, max. Verlust, SPY, Kosten; deterministisch', () => {
  const a = T.runTop5(ds(), { window: WIN });
  for (const k of T.TOP5) {
    assert.deepEqual(Object.keys(a[k].costs), SF6_VALIDATION_PROTOCOL.costLevels.map((c) => c.id));
    const m = a[k].costs.REF;
    for (const f of ['trades', 'hitRate', 'totalReturn', 'cagr', 'maxDrawdown', 'spyTotalReturn', 'spyDistance', 'costsPaid']) assert.ok(f in m, `${k} ${f}`);
    assert.ok(m.maxDrawdown <= 0);
    assert.ok(m.costsPaid >= a[k].costs['COST-0'].costsPaid);
  }
  const b = T.runTop5(ds(), { window: WIN });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('ST-HIST-3: der öffentliche Teil trägt keine Renditezahl; der versiegelte Teil ist nur mit dem Prüfschlüssel lesbar', () => {
  const A = T.runTop5(ds(), { window: WIN });
  const result = { A, quarantine: { A: { policy: 'DQ-K5-BOOK' } }, receipt: { version: T.ST_HIST_TOP5_VERSION } };
  const pub = JSON.stringify(T.publicPart(result));
  for (const f of ['totalReturn', 'cagr', 'maxDrawdown', 'hitRate', 'spyDistance', 'annualReturns']) assert.ok(!pub.includes(`"${f}"`), f);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sealed = L.encryptForOwner(publicKey.export({ type: 'spki', format: 'pem' }), Buffer.from(JSON.stringify(result)));
  assert.deepEqual(JSON.parse(L.decryptSealed(privateKey.export({ type: 'pkcs8', format: 'pem' }), sealed)).A, JSON.parse(JSON.stringify(A)));
});

test('ST-HIST-4: Workflow nur manuell, nur lesend, kein Commit, Eingaben über env', () => {
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-st-hist-top5.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/);
  assert.doesNotMatch(w, /\n\s+schedule:/);
  assert.match(w, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(w, /git push|push-with-retry/);
  assert.doesNotMatch(w, /run: [^\n]*\$\{\{\s*inputs\./);
  assert.match(w, /group: supertrader-st-hist-top5-\$\{\{ github\.ref_name \}\}/);
});

test('ST-HIST-5: Sensitivität Delisting-Erlös als echte Neuläufe (S0/S1/S2), Austritts- und Populationszählung, Audit fail closed', () => {
  const sec2 = (id, seed, drift, end) => securityFromSegment({ id, raw: bars(seed, drift).filter((b) => b.date <= end), endCause: 'LISTING_INACTIVE', delisted: true, survivor: false });
  const d = ds(); d.securities.push(sec2('tiingo:NASDAQ:DDD:2010-01-04', 11, 0.0025, '2017-03-31'));
  const a = T.runTop5(d, { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  for (const k of T.TOP5) {
    const p = a[k].delistingProceeds;
    assert.deepEqual(Object.keys(p), ['DELIST_100', 'DELIST_70', 'DELIST_DISTRESS_0']);
    assert.ok(Math.abs(p.DELIST_100.totalReturn - a[k].costs.REF.totalReturn) < 1e-12, `${k}: 100 % ist die Referenz`);
    assert.equal(p.DELIST_100.scenario, 'S0_LAST_PRICE');
    for (const v of Object.values(p)) assert.ok(v.maxDrawdown >= -1 && v.maxDrawdown <= 0, `${k}: max. Verlust zwischen 0 und -100 %`);
    assert.deepEqual(Object.keys(a[k].exitCensus), ['TERMINAL_DELISTED', 'SECURITY_UNAVAILABLE', 'OTHER']);
  }
  assert.deepEqual(T.populationCensus(d), { ACTIVE_AT_WINDOW_END: 3, LISTING_INACTIVE: 1 });
  assert.equal(T.auditPassAll({ A: { X: { audit: { pass: true } } } }), true);
  assert.equal(T.auditPassAll({ A: { X: { audit: { pass: true } } }, B: { X: { audit: { pass: false } } } }), false);
  const runner = fs.readFileSync(new URL('../source-faithful/research/run-st-hist-top5.mjs', import.meta.url), 'utf8');
  assert.match(runner, /if \(!auditPass\) \{[^}]*process\.exit\(4\)/, 'fail closed');
});

test('ST-HIST-6: E3-Export je Methode und Fenster ab Cash, kostenfrei, mit Fills, Kurve, Terminalen und ADV20', () => {
  const W = [{ id: 'W1', from: '2016-01-04', to: '2016-12-30' }, { id: 'W2', from: '2017-01-03', to: '2017-06-30' }];
  const e = T.edgeExport(ds(), { windows: W });
  assert.equal(e.schema, 'st-edge-export-1.0.0');
  assert.ok(e.benchmark.spyClose.length > 0);
  for (const k of T.TOP5) for (const w of W) {
    const x = e.methods[k].windows[w.id];
    assert.deepEqual(x.costs, { slippageBps: 0, commissionBps: 0 });
    assert.ok(x.curve.every((p) => p.date >= w.from && p.date <= w.to), `${k} ${w.id}: Kurve im Fenster`);
    assert.ok(x.fills.every((f) => f.date >= w.from && f.date <= w.to), `${k} ${w.id}: keine Position vor dem Fenster`);
    for (const f of x.fills.filter((f) => f.side === 'BUY')) { assert.ok(f.securityId && f.ticker && f.shares > 0 && f.price > 0); assert.ok(f.adv20Usd === null || f.adv20Usd > 0); }
    assert.ok(Math.abs(x.curve[0].equity - 100000) < 100000 * 0.2 || x.fills.length === 0, 'Start in Cash');
    assert.equal(x.holdings.length, x.curve.length);
    assert.deepEqual(x.holdings[0].positions.length <= x.fills.filter((f) => f.date === x.curve[0].date && f.side === 'BUY').length, true, 'Start ohne Altbestand');
    for (const h of x.holdings) for (const [id, n] of h.positions) assert.ok(id && n > 0, `${k} ${w.id} ${h.date}: nur positive Bestände`);
    if (x.curve.at(-1).positions !== null) assert.equal(x.holdings.at(-1).positions.length, x.curve.at(-1).positions, `${k} ${w.id}: Bestände = Positionszahl der Engine`);
  }
  assert.deepEqual(T.EDGE_WINDOWS.map((w) => [w.from, w.to]), [['2016-01-04', '2019-12-31'], ['2020-01-02', '2026-09-30']]);
});

test('ST-HIST-7: Darvas-Spannweite der Balkenreihenfolge nur mit der vorregistrierten Variante ALT-INTRABAR-OPTIMISTIC', () => {
  const a = T.runTop5(ds(), { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  assert.deepEqual(Object.keys(a.DARVAS.intrabarVariants), ['ALT-INTRABAR-OPTIMISTIC']);
  assert.deepEqual(a.DARVAS.intrabarVariants['ALT-INTRABAR-OPTIMISTIC'].changes, { intrabarOrder: 'OPTIMISTIC' });
  for (const k of ['TURTLE_S1', 'TURTLE_S2', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']) assert.equal(a[k].intrabarVariants, undefined, `${k}: keine nicht registrierte Variante`);
});

test('ST-HIST-8: Plausibilitätsdiagnose ohne Hebel (Exposure <= 1, Cash >= 0) und mit schlechtesten Trades und Tagen', () => {
  const a = T.runTop5(ds(), { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  for (const k of T.TOP5) {
    const p = a[k].plausibility;
    assert.ok(p.maxExposure <= 1 + 1e-9 && p.minCash >= -1e-6, `${k}: kein Hebel`);
    assert.ok(Array.isArray(p.worstTrades) && Array.isArray(p.worstDays));
    assert.ok(p.worstDays.every((d, i, arr) => i === 0 || arr[i - 1].ret <= d.ret));
  }
});

test('ST-HIST-9: C08-Treuevariante FID-1 neben der Referenz; R-Verteilung und goldene Trades; Referenz unverändert', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const d = ds();
  const f = T.kkFidelityRun(d, { window: WIN });
  assert.deepEqual(Object.keys(f.variants), ['FID-1', 'FID-2', 'FID-2L', 'FID-3', 'FID-4']);
  assert.equal(FID.KK_FIDELITY_VARIANTS['FID-2L'].minAdv20Usd, 2.5e6);
  for (const v of Object.values(f.variants)) {
    assert.deepEqual(Object.keys(v.costs), ['COST-0', 'REF']);
    assert.ok(v.costs.REF.rDistribution && 'avgWinR' in v.costs.REF.rDistribution && 'shareAbove5R' in v.costs.REF.rDistribution);
    assert.equal(v.costs.REF.goldenTrades.length, FID.KK_GOLDEN_TRADES.length);
  }
  assert.throws(() => FID.createKkFidelityAdapter({ leaders: new Map(), market: new Set(), variant: 'FID-9' }), /UNKNOWN_FID_VARIANT/);
  assert.ok(f.marketOnShare >= 0 && f.marketOnShare <= 1);
  // Querschnitt: in drei Titeln sind die besten 2 % genau ein Titel je Datum mit voller Historie
  const L1 = FID.momentumLeaders(d.securities);
  assert.ok([...L1.values()].every((s) => s.size <= 3));
  // Referenz C08 unverändert: die gepinnte Variantenregistrierung bleibt gleich
  const KK = await import('../source-faithful/research/kk-breakout-lifecycle.mjs');
  assert.equal(KK.KK_REFERENCE_CONFIG.entryTiming, 'NEXT_OPEN');
  const a = T.runTop5(d, { window: WIN, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF') });
  assert.ok(a.KK_BREAKOUT.rDistribution && Array.isArray(a.KK_BREAKOUT.goldenTrades));
});

test('ST-HIST-10: Diagnose der goldenen Trades folgt kkFidelitySetupAt Schritt für Schritt und trägt keine Renditezahl', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const d = ds();
  // Gleichheit: Explain meldet OK genau dann, wenn kkFidelitySetupAt ein Setup liefert (alle Varianten, alle Sitzungen)
  let ok = 0;
  for (const s of d.securities) for (let i = 0; i < s.bars.length; i++) for (const V of Object.values(FID.KK_FIDELITY_VARIANTS)) {
    const o = { quality: V.quality, minAdv20Usd: V.minAdv20Usd ?? null }, a = FID.kkFidelitySetupAt(s.bars, i, undefined, o), e = FID.kkFidelitySetupExplain(s.bars, i, undefined, o);
    assert.equal(e.step === 'OK', a !== null, `${s.id} ${s.bars[i].date} ${e.step}`);
    if (a) { ok++; assert.equal(e.level, a.level); assert.equal(e.adr20, a.adr20); }
  }
  assert.ok(ok > 0, 'die Testreihen erzeugen Setups');
  const leaders = FID.momentumLeaders(d.securities), market = FID.marketOn(d.benchmark);
  const golden = [{ ticker: 'AAA', date: '2016-06-15', source: 'Test' }, { ticker: 'ZZZ', date: '2016-06-15', source: 'Test' }];
  const g = FID.goldenDiagnose(d, { leaders, market, golden });
  assert.equal(g[1].inUniverse, false);
  assert.equal(g[0].inUniverse, true);
  const sess = g[0].securities[0].sessions;
  assert.ok(sess.length >= 10 && sess.every((x) => 'FID-1' in x && 'FID-2' in x && 'FID-2L' in x && 'leader' in x && 'marketOn' in x && x.momentum && 'bestPercentile' in x.momentum));
  // Perzentil gleich der Leader-Rechnung
  for (const x of sess) assert.equal(x.leader, x.momentum.bestPercentile !== null && x.momentum.bestPercentile >= 100 - FID.KK_FIDELITY_RULES.momentumTopPct);
  assert.doesNotMatch(JSON.stringify(g), /totalReturn|cagr|pnl|equity/);
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-st-hist-top5.yml', import.meta.url), 'utf8');
  assert.match(w, /options: \[backtest, edge-export, golden-diagnose, minervini-golden\]/);
});

test('ST-HIST-11: Ausführungsdiagnose der goldenen Trades: Setups, Ablehnungen mit Grund, offene Positionen, keine Renditezahl', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const d = ds(), leaders = FID.momentumLeaders(d.securities), market = FID.marketOn(d.benchmark);
  const golden = [{ ticker: 'CCC', date: '2016-09-15', source: 'Test' }];
  const x = T.goldenExecution(d, { leaders, market, golden, window: WIN })['CCC|2016-09-15'];
  assert.deepEqual(Object.keys(x), ['FID-1', 'FID-2', 'FID-2L', 'FID-3', 'FID-4']);
  for (const [k, v] of Object.entries(x)) {
    assert.ok(Array.isArray(v.setupDays) && Array.isArray(v.rejections) && Array.isArray(v.trades));
    assert.equal(v.maxOpenPositions, k === 'FID-4' ? 5 : 20);
    assert.ok(Object.values(v.openPositions).every((n) => n === null || (n >= 0 && n <= v.maxOpenPositions)));
  }
  assert.doesNotMatch(JSON.stringify(x), /pnl|equity|totalReturn|cagr/);
});

test('ST-HIST-12: FID-3 = FID-1 plus Tagesauswahl der höchstens 3 stärksten Setups; Leader-Rechnung unverändert', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const d = ds();
  assert.deepEqual(FID.KK_FIDELITY_VARIANTS['FID-3'], { quality: false, adrNorm: 'ENTRY', trail: 'MA10', dailyTop: 3 });
  const ranks = FID.momentumRanks(d.securities), L1 = FID.momentumLeaders(d.securities), L2 = FID.momentumLeaders(d.securities, { ranks });
  assert.deepEqual([...L1].map(([k, v]) => [k, [...v].sort()]), [...L2].map(([k, v]) => [k, [...v].sort()]), 'Leader aus ranks gleich der bisherigen Rechnung');
  const market = FID.marketOn(d.benchmark), sel = FID.dailySelection(d, { leaders: L1, market, ranks, variant: 'FID-3' });
  for (const [date, set] of sel) {
    assert.ok(set.size <= 3);
    for (const id of set) assert.ok(L1.get(date).has(id) && market.has(date));
  }
  // mit dailyTop 1 bleibt je Datum der Titel mit dem höchsten Perzentil
  const one = FID.dailySelection(d, { leaders: new Map([...L1].map(([k]) => [k, new Set(d.securities.map((s) => s.id))])), market: new Set(d.calendar.concat(d.benchmark.map((b) => b.date))), ranks, variant: 'FID-3' });
  for (const [date, set] of one) { const best = Math.max(...[...set].map((id) => ranks.get(date).get(id) ?? -1)); for (const id of set) assert.ok((ranks.get(date).get(id) ?? -1) <= best); }
  assert.throws(() => FID.createKkFidelityAdapter({ leaders: L1, market, variant: 'FID-3' }), /SELECTION_REQUIRED/);
  assert.throws(() => FID.dailySelection(d, { leaders: L1, market, ranks, variant: 'FID-1' }), /NO_DAILY_TOP/);
  // FID-3 stellt nur an ausgewählten Tagen Setups bereit
  const ad = FID.createKkFidelityAdapter({ leaders: L1, market, variant: 'FID-3', selection: sel });
  for (const s of d.securities) { const c = ad.prepare(s, FID.KK_FIDELITY_CONFIG); if (c) for (const [, st] of c.setups) assert.ok(sel.get(st.date)?.has(s.id)); }
});

test('ST-HIST-13: FID-4 genau wie vorregistriert (1 % Risiko, Kappe 25 %, höchstens 5 Positionen) und Urteil nach der festen Regel', async () => {
  const FID = await import('../source-faithful/research/kk-breakout-fidelity.mjs');
  const pre = JSON.parse(fs.readFileSync(new URL('../source-faithful/certification/C08-FID4-PREREGISTRATION.json', import.meta.url), 'utf8'));
  const V = FID.KK_FIDELITY_VARIANTS['FID-4'], V3 = FID.KK_FIDELITY_VARIANTS['FID-3'];
  assert.equal(pre.variant, 'FID-4');
  assert.equal(V.riskFraction, pre.rule.riskFraction); assert.equal(V.maxPositionWeight, pre.rule.maxPositionWeight); assert.equal(V.maxOpenPositions, pre.rule.maxOpenPositions);
  for (const k of Object.keys(V3)) assert.equal(V[k], V3[k], `FID-4 erbt ${k} von FID-3`);
  assert.deepEqual(pre.criteria.machine, { cagrAboveSpyCagr: true, expectancyRAbove: 0, minClosedTrades: 100 });
  assert.deepEqual(pre.sequence.map((x) => x.window), ['DEV', 'HOLDOUT']);
  assert.equal(FID.kkFidelityConfigFor('FID-4').sizing.riskFraction, 0.01);
  assert.equal(FID.kkFidelityConfigFor('FID-1'), FID.KK_FIDELITY_CONFIG);
  const pol = FID.kkFidelityPolicyFor('FID-4', { maxPositionWeight: 0.25, maxOpenPositions: 20, x: 1 });
  assert.deepEqual(pol, { maxPositionWeight: 0.25, maxOpenPositions: 5, x: 1 });
  // keine weitere Variante nach FID-4 (Entscheidung Steuerung)
  assert.equal(Object.keys(FID.KK_FIDELITY_VARIANTS).at(-1), 'FID-4');
  const mk = (cagr, spyCagr, e, n) => ({ variants: { 'FID-4': { costs: { REF: { cagr, spyCagr, rDistribution: { expectancyR: e, closed: n } } } } } });
  assert.equal(T.fid4Verdict(mk(0.2, 0.15, 0.1, 150), pre, 'DEV').pass, true);
  assert.equal(T.fid4Verdict(mk(0.1, 0.15, 0.1, 150), pre, 'DEV').pass, false);
  assert.equal(T.fid4Verdict(mk(0.2, 0.15, 0, 150), pre, 'DEV').pass, false);
  assert.equal(T.fid4Verdict(mk(0.2, 0.15, 0.1, 99), pre, 'DEV').pass, false);
  assert.equal(T.fid4Verdict({}, pre, 'DEV').status, 'NOT_COMPUTED');
  const d = ds(), f = T.kkFidelityRun(d, { window: WIN });
  assert.ok('FID-4' in f.variants && f.variants['FID-4'].costs.REF);
});

test('ST-HIST-14: Minervini-Treueprüfung Schritt 1: Referenz C06/C07 unverändert gegen belegte Trades, Zustand je Sitzung', async () => {
  const MF = await import('../source-faithful/research/minervini-fidelity.mjs');
  assert.equal(MF.MINERVINI_GOLDEN_TRADES.length, 13);
  assert.ok(MF.MINERVINI_GOLDEN_TRADES.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.date >= '2016-01-04' && g.date <= '2026-09-30' && ['SEPA', 'POWER_PLAY'].includes(g.setup) && /@markminervini \d+/.test(g.source)));
  const d = ds(), golden = [{ ticker: 'AAA', date: '2016-06-15', setup: 'SEPA', source: 'Test' }, { ticker: 'ZZZ', date: '2016-06-15', setup: 'SEPA', source: 'Test' }, { ticker: 'CCC', date: '2016-06-15', setup: 'POWER_PLAY', source: 'Test' }];
  const out = T.minerviniGoldenRun(d, { window: WIN });
  assert.deepEqual(Object.keys(out.methods), ['C06', 'C07']);
  for (const m of Object.values(out.methods)) { assert.deepEqual(Object.keys(m.costs), ['COST-0', 'REF']); assert.ok('expectancyR' in m.costs.REF.rDistribution && m.costs.REF.rejectionsByReason); assert.ok(Array.isArray(m.costs.REF.golden)); }
  // Diagnose direkt mit eigener Liste
  const MX = await import('../source-faithful/research/minervini-execution.mjs'), ML = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const idx = MX.buildSetupIndex(d, 'SEPA', { from: null }), run = MX.runMinerviniLifecycle(d, { strategy: 'SEPA', setupIndex: idx, config: ML.REFERENCE_CONFIG, from: WIN.from, to: WIN.to });
  const g = MF.minerviniGoldenDiagnose(d, { strategy: 'SEPA', setupIndex: idx, run, golden });
  assert.equal(g.length, 2, 'nur goldene Trades derselben Strategie');
  assert.equal(g[1].inUniverse, false);
  const sess = g[0].securities[0].sessions;
  assert.ok(sess.length >= 10 && sess.every((x) => typeof x.state === 'string' && !x.state.includes('|')));
  // Zustand je Sitzung stimmt mit dem Setup-Index überein
  const sec = d.securities.find((s) => s.id.includes(':AAA:')), m = idx.index.get(sec.id) || new Map();
  for (let i = 300; i < sec.bars.length; i += 37) assert.equal(MF.setupStateAt('SEPA', sec, i) === 'SETUP_DETECTED', m.has(i), sec.bars[i].date);
  assert.doesNotMatch(JSON.stringify(g), /totalReturn|cagr|equity/);
});

test('ST-HIST-15: C06/C07 FID-1 genau wie vorregistriert (RS >= 70, höchstens 3 je Tag nach RS, FREEROLL_2R), Referenz unverändert', async () => {
  const MF = await import('../source-faithful/research/minervini-fidelity.mjs');
  const MX = await import('../source-faithful/research/minervini-execution.mjs'), ML = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const pre = JSON.parse(fs.readFileSync(new URL('../source-faithful/certification/C06-C07-FID1-PREREGISTRATION.json', import.meta.url), 'utf8'));
  assert.deepEqual(MF.MINERVINI_FID1, { rsMin: pre.rule.rsGate.min, dailyTop: pre.rule.dailySelection.max, exitPolicy: pre.rule.exitPolicy });
  assert.ok(ML.EXIT_POLICIES[pre.rule.exitPolicy], 'Ausstieg ist eine vorhandene Politik der gepinnten Engine');
  assert.deepEqual(pre.criteria.machine, { cagrAboveSpyCagr: true, expectancyRAbove: 0, minClosedTrades: 100 });
  assert.equal(ML.REFERENCE_CONFIG.exitPolicy, 'STOP_BE3R_MA50', 'Referenz unverändert');
  const d = ds(), idx = MX.buildSetupIndex(d, 'SEPA', { from: null });
  const rs = { at: (id, date) => ({ proxy: { vuPercentile: id.includes(':AAA:') ? 95 : id.includes(':BBB:') ? 80 : 50 } }) };
  const sel = MF.selectSetupIndex(d, idx, { rs });
  assert.ok(![...sel.index.keys()].some((id) => id.includes(':CCC:')), 'RS 50 < 70 fällt heraus');
  const perDate = new Map(); for (const [id, m] of sel.index) for (const [i] of m) { const dt = d.securities.find((s) => s.id === id).bars[i].date; perDate.set(dt, (perDate.get(dt) || 0) + 1); assert.ok(idx.index.get(id).has(i), 'nur Setups der Referenz'); }
  assert.ok([...perDate.values()].every((n) => n <= 3));
  const one = MF.selectSetupIndex(d, idx, { rs, dailyTop: 1 });
  const dateOf = (id, i) => d.securities.find((s) => s.id === id).bars[i].date, pct = (id) => rs.at(id).proxy.vuPercentile;
  const setupsOn = new Map(); for (const [id, m] of idx.index) for (const [i] of m) { const dt = dateOf(id, i); if (pct(id) >= 70) (setupsOn.get(dt) || setupsOn.set(dt, []).get(dt)).push(id); }
  for (const [id, m] of one.index) for (const [i] of m) { const dt = dateOf(id, i); assert.equal(pct(id), Math.max(...setupsOn.get(dt).map(pct)), `bei einem Platz gewinnt das höhere RS (${dt})`); }
  const mk = (cagr, spyCagr, e, n) => ({ costs: { REF: { cagr, spyCagr, rDistribution: { expectancyR: e, closed: n } } } });
  assert.equal(T.minerviniFid1Verdict(mk(0.2, 0.15, 0.1, 150), pre, 'DEV').pass, true);
  assert.equal(T.minerviniFid1Verdict(mk(0.1, 0.15, 0.1, 150), pre, 'DEV').pass, false);
  assert.equal(T.minerviniFid1Verdict(mk(0.2, 0.15, -0.01, 150), pre, 'DEV').pass, false);
  assert.equal(T.minerviniFid1Verdict(mk(0.2, 0.15, 0.1, 99), pre, 'DEV').pass, false);
  const out = T.minerviniGoldenRun(d, { window: WIN });
  for (const m of Object.values(out.methods)) { assert.ok(m.fid1 && m.fid1.costs.REF && m.fid1.verdict && 'pass' in m.fid1.verdict || m.fid1.verdict.status === 'NOT_COMPUTED'); assert.ok(Array.isArray(m.fid1.costs.REF.golden)); }
});
