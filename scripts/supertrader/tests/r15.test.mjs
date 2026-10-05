import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_ENGINES } from '../build.mjs';
import { portfolioConfig } from '../model-portfolio.mjs';
import { runPortfolioTR } from '../validation/portfolio.mjs';
import { PORTFOLIO_POLICIES, resolvePortfolioPolicy, assertExplicitPolicy, ImplicitPolicyError, SELECTION_POLICY, blockingFields } from '../fidelity/portfolio-policy.mjs';
import { SHARED_RULES, SHARED_RULE_PROVENANCE } from '../fidelity/shared-rules.mjs';
import { PROVENANCE } from '../fidelity/taxonomy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const KEYS = ['initialEquity', 'riskPerTrade', 'maxPositionPct', 'maxPositions', 'maxExposure', 'priority', 'progressive', 'turtleNotional'];
const pick = (c) => Object.fromEntries(KEYS.map((k) => [k, c[k] ?? null]).concat([['marketFilter', !!c.marketFilter]]));

test('R15-P1 Layer C: explizite Policy je Live-Engine ist identisch zur Live-Konfiguration (keine Verhaltensänderung)', () => {
  for (const e of LIVE_ENGINES) {
    const { cfg } = resolvePortfolioPolicy(e);
    assert.deepEqual(pick(cfg), pick(portfolioConfig(e)), e.id);
    assert.equal(PORTFOLIO_POLICIES[e.id].version, e.version, `${e.id}: Policy-Version passt nicht zur Live-Version`);
  }
});

test('R15-P2 Kein stilles Erben von Defaults: Engine ohne eigene Policy schlägt fehl; Weinstein ist als Altfall ausgewiesen', () => {
  assert.throws(() => assertExplicitPolicy({ id: 'NEW_METHOD', version: '1.0.0', portfolio: null }), ImplicitPolicyError);
  assert.throws(() => assertExplicitPolicy({ id: 'MOMENTUM_BREAKOUT', version: '9.9.9', portfolio: null }), ImplicitPolicyError);
  const w = PORTFOLIO_POLICIES.WEINSTEIN_STAGE;
  assert.ok(w.implicitDefaults.includes('riskPerTrade'));
  assert.equal(w.fields.riskPerTrade.provenance, PROVENANCE.FOREIGN_RULE, 'Weinstein-Risiko stammt aus KK-RISK-01');
});

test('R15-P3 Jede Policy-Angabe hat eine gültige Herkunftsklasse und Quelle', () => {
  const ok = new Set(Object.values(PROVENANCE));
  for (const [id, pol] of Object.entries(PORTFOLIO_POLICIES)) for (const [k, v] of Object.entries(pol.fields)) {
    assert.ok(ok.has(v.provenance), `${id}.${k}: ${v.provenance}`);
    assert.ok(String(v.source || '').length > 3, `${id}.${k}: Quelle fehlt`);
  }
});

test('R15-S1 Geteilte Regeln: jede Live-Strategie hat für jede geteilte Regel eine Herkunftsangabe', () => {
  for (const e of LIVE_ENGINES) for (const r of SHARED_RULES) {
    const p = SHARED_RULE_PROVENANCE[e.id]?.[r.id];
    assert.ok(p && Object.values(PROVENANCE).includes(p.provenance), `${e.id}: ${r.id} ohne Herkunft`);
  }
});

test('R15-I1 Strategie-Isolation: keine Live-Engine importiert die Strategie eines anderen Traders', () => {
  const family = { MOMENTUM_BREAKOUT: 'kk-breakout', WEINSTEIN_STAGE: 'weinstein', DARVAS_BOX: 'darvas', MINERVINI_VCP: 'minervini', DONCHIAN_TURTLE: 'donchian' };
  const file = { MOMENTUM_BREAKOUT: 'kk-breakout-v32', WEINSTEIN_STAGE: 'weinstein-v4', DARVAS_BOX: 'darvas-v302', MINERVINI_VCP: 'minervini-v2', DONCHIAN_TURTLE: 'donchian-v202' };
  const deps = (f, acc = new Set()) => { const s = fs.readFileSync(f, 'utf8'); for (const m of s.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) { const d = path.resolve(path.dirname(f), m[1]); if (!acc.has(d)) { acc.add(d); deps(d, acc); } } return acc; };
  for (const [id, f] of Object.entries(file)) {
    const all = [...deps(path.join(root, 'scripts/supertrader/engine/strategies', f + '.mjs'))].map((d) => path.basename(d)).filter((b) => /^(kk-breakout|weinstein|darvas|minervini|donchian)/.test(b));
    for (const b of all) assert.ok(b.startsWith(family[id]), `${id} importiert ${b}`);
  }
});

test('R15-I2 Portfolio-Isolation: Änderung der Momentum-Policy verändert keine andere Strategie', () => {
  const before = Object.fromEntries(LIVE_ENGINES.map((e) => [e.id, JSON.stringify(resolvePortfolioPolicy(e).cfg)]));
  const kk = LIVE_ENGINES.find((e) => e.id === 'MOMENTUM_BREAKOUT');
  const mutated = { ...kk, portfolio: { ...kk.portfolio, riskPerTrade: 0.01 } };
  assert.notEqual(JSON.stringify(portfolioConfig(mutated)), JSON.stringify(portfolioConfig(kk)));
  for (const e of LIVE_ENGINES) if (e.id !== 'MOMENTUM_BREAKOUT') assert.equal(JSON.stringify(resolvePortfolioPolicy(e).cfg), before[e.id]);
});

// Gleichzeitige Signale: zwei Einstiege am selben Tag, nur ein Platz. Dieselben Trades, nur die Kürzel getauscht.
function chosen(priority, names, rs) {
  const cal = ['2024-01-02', '2024-01-03'];
  const mk = (id, r) => ({ id, listingId: id, entry: { date: cal[0], price: 10 }, initialStop: 9, exits: [{ date: cal[1], price: 11, fraction: 1, ruleId: 'X' }], terminal: null, marks: new Map(cal.map((d) => [d, 10])), divs: new Map(), rsAtEntry: r });
  const run = runPortfolioTR([mk(names[0], rs[0]), mk(names[1], rs[1])], cal, { initialEquity: 100000, riskPerTrade: 0.01, maxPositionPct: 0.5, maxPositions: 1, maxExposure: 1, priority }, {});
  return run.taken.map((p) => (p.tr.listingId === names[0] ? 'first' : 'second'));
}
test('R15-O1 Ordering: RS-Auswahl hängt nicht vom Kürzel ab; ALPHA entscheidet nach Kürzel und ist als VU_FORMALIZATION_REQUIRED markiert', () => {
  assert.deepEqual(chosen('RS', ['AAA', 'ZZZ'], [60, 90]), ['second']);
  assert.deepEqual(chosen('RS', ['ZZZ', 'AAA'], [60, 90]), ['second']); // gleiche Ökonomie → gleiche Wahl
  assert.notDeepEqual(chosen('ALPHA', ['AAA', 'ZZZ'], [60, 90]), chosen('ALPHA', ['ZZZ', 'AAA'], [60, 90])); // nur der Name entscheidet
  assert.equal(SELECTION_POLICY.ALPHA.requires, 'VU_FORMALIZATION_REQUIRED');
  const alphaLive = LIVE_ENGINES.filter((e) => resolvePortfolioPolicy(e).cfg.priority === 'ALPHA').map((e) => e.id);
  assert.deepEqual(alphaLive, ['DONCHIAN_TURTLE'], 'bekannter Befund: Turtle wählt alphabetisch');
  assert.ok(blockingFields('DONCHIAN_TURTLE').some((b) => b.field === 'priority'));
});

// Referenz: Notionalkonto-Schleife vor dem R14-Fix (mit Notbremse nur für den Test).
function tnOld(tnStart, eqNow, tn) { let cuts = 0; for (let guard = 0; guard < 10000; guard++) { let th = 0, acct = tnStart; for (let j = 0; j <= cuts; j++) { th += tn.stepLoss * acct; acct *= 1 - tn.cut; } if (tnStart - eqNow >= th - 1e-9) cuts++; else return cuts; } return Infinity; }
test('R15-T2 Turtle-Notionalkonto: Fix ändert kein Ergebnis, das vorher terminierte; > 50 % Verlust endet mit Notionalkonto ≈ 0', () => {
  const tn = { stepLoss: 0.1, cut: 0.2 };
  for (let loss = 0; loss < 0.5; loss += 0.01) { const old = tnOld(100, 100 * (1 - loss), tn); assert.ok(Number.isFinite(old) && old <= 60, String(loss)); }
  assert.equal(tnOld(100, 40, tn), Infinity); // vorher Endlosschleife
  // Nach dem Fix: neue Position bei > 50 % Jahresverlust praktisch null (keine unplausible Größe).
  const cal = ['2008-01-02', '2008-01-03', '2008-01-04'];
  const a = { id: 'A', listingId: 'A', entry: { date: cal[0], price: 10 }, initialStop: 9, exits: [{ date: cal[2], price: 2, fraction: 1, ruleId: 'X' }], terminal: null, marks: new Map([[cal[0], 10], [cal[1], 2], [cal[2], 2]]), divs: new Map() };
  const b = { ...a, id: 'B', listingId: 'B', entry: { date: cal[2], price: 5 }, initialStop: 4.5, exits: [], marks: new Map([[cal[2], 5]]) };
  const run = runPortfolioTR([a, b], cal, { initialEquity: 100000, riskPerTrade: 1, maxPositionPct: 1, maxPositions: 12, maxExposure: 1, turtleNotional: tn }, {});
  const pb = run.taken.find((p) => p.tr.id === 'B');
  assert.ok(!pb || pb.entryShares * 5 < 10, 'Notionalkonto ≈ 0 → neue Position < 0,01 % des Startkapitals');
});
