// Prueft die veroeffentlichten Supertrader-Artefakte (supertrader/data).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertTransition, STATES } from '../engine/lifecycle.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data', f), 'utf8'));
const signals = read('signals.json');
const backtests = read('backtests.json');
const coverage = read('coverage.json');
const registry = read('registry.json');

test('Gate E: keine Kennzahl ohne bestandene Gates', () => {
  for (const r of backtests.runs) {
    if (!r.metricsPublishable) {
      assert.equal(r.metrics, null, `${r.variantId} veroeffentlicht Kennzahlen trotz offener Gates`);
      assert.equal(r.trustScore.value, null, `${r.variantId} Trust Score ohne Gates`);
      assert.ok(r.failedGates.length > 0);
    }
    assert.ok(['BACKTEST_READY', 'BACKTEST_PENDING', 'DATA_COVERAGE_PENDING', 'DATA_COVERAGE_INSUFFICIENT', 'NOT_COMPARABLE', 'ADVANCED_RESEARCH'].includes(r.status), r.status);
    // Eine Freigabe braucht definierte UND bestandene Gates.
    if (r.metricsPublishable || r.status === 'BACKTEST_READY') {
      assert.ok(r.gates.length > 0, `${r.variantId}: Freigabe ohne Gates`);
      assert.ok(r.gates.every((g) => g.pass), `${r.variantId}: Freigabe trotz offener Gates`);
    }
  }
});

test('Gate E: Intraday-ORH-Variante ist DATA_COVERAGE_PENDING, solange Intraday-Historie fehlt', () => {
  const orh = backtests.runs.find((r) => r.variantId === 'KK_COMMON_BREAKOUT_ORH');
  assert.ok(orh);
  if (coverage.coverage.intradaySessionsRetained < 250) assert.equal(orh.status, 'DATA_COVERAGE_PENDING');
});

test('Gate C: Greenblatt rechnet kein Ranking, solange Pflichtfelder fehlen', () => {
  if (coverage.greenblatt.missingFields.length) {
    assert.equal(coverage.greenblatt.rankingComputable, false);
    assert.equal(signals.strategies.GREENBLATT_VALUE, undefined, 'Greenblatt darf keine Signale fuehren');
  }
});

test('Gate D: gespeicherte Zustandsfolgen sind gueltige Lifecycle-Uebergaenge', () => {
  for (const [id, st] of Object.entries(signals.strategies)) {
    for (const s of [...st.open, ...st.closed, ...st.invalidated]) {
      let prev = null;
      for (const t of s.transitions) { assertTransition(prev, t.state); prev = t.state; assert.ok(t.ruleId, `${s.id} ohne Regel`); assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/); }
      assert.equal(prev, s.state, `${s.id}: letzter Uebergang != Zustand`);
      assert.equal(s.strategyId, id);
      assert.ok(STATES.includes(s.state));
    }
    for (const s of st.closed) assert.equal(s.state, 'CLOSED');
    for (const s of st.invalidated) assert.equal(s.state, 'INVALIDATED');
  }
});

test('Gate D: jede Regel-ID in Signalen existiert in der Registry', () => {
  const ids = new Set(registry.strategies.flatMap((s) => s.rules.map((r) => r.rule_id)));
  for (const st of Object.values(signals.strategies)) for (const s of [...st.open, ...st.closed, ...st.invalidated]) {
    for (const t of s.transitions) assert.ok(ids.has(t.ruleId), `${s.id}: ${t.ruleId}`);
    for (const k of Object.keys(s.rules || {})) assert.ok(ids.has(k), `${s.id}: Regel ${k}`);
  }
});

test('Historie wird nicht geloescht: Ledger-Eintraege bleiben erhalten', () => {
  for (const [id, st] of Object.entries(signals.strategies)) {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data/ledger', `${id}.json`), 'utf8'));
    assert.equal(ledger.closed.length, st.closed.length);
    assert.equal(ledger.invalidated.length, st.invalidatedTotal);
    assert.ok(st.invalidated.length <= st.invalidatedTotal);
    assert.ok(ledger.liveSince && ledger.lastProcessed >= ledger.liveSince);
  }
});

test('Gate C: jede Zahl im Markt-/Abdeckungsartefakt hat einen Quellenpfad', () => {
  const market = read('market.json');
  assert.ok(market.regime.source && market.session.source);
  for (const k of ['dailyOhlcv', 'weekly', 'survivorship', 'delisted', 'membership', 'pit', 'intraday']) assert.ok(coverage.coverage.sources[k], k);
});

test('Produktseiten existieren fuer alle Routen', () => {
  for (const f of ['index.html', 'signals/index.html', 'strategies/index.html', 'backtests/index.html', 'sources/index.html', 'stock/index.html']) assert.ok(fs.existsSync(path.join(ROOT, 'supertrader', f)), f);
  for (const s of registry.strategies) assert.ok(fs.existsSync(path.join(ROOT, 'supertrader/strategies', s.slug, 'index.html')), s.slug);
  for (const sym of Object.keys(signals.bySymbol)) assert.ok(fs.existsSync(path.join(ROOT, 'supertrader/stock', sym, 'index.html')), sym);
});

test('Kein Kaufaufforderungs-Ton in Artefakten und Oberflaeche', () => {
  const texts = [fs.readFileSync(path.join(ROOT, 'supertrader/assets/supertrader.js'), 'utf8'), JSON.stringify(registry)];
  for (const t of texts) assert.doesNotMatch(t, /jetzt kaufen|buy now|kaufen sie|strong buy|garantiert/i);
});

test('Darvas: jedes offene Setup traegt eine Qualitaetsstufe mit allen Kriterien', () => {
  const d = signals.strategies.DARVAS_BOX;
  const reg = registry.strategies.find((s) => s.strategy_id === 'DARVAS_BOX');
  for (const s of d.open) {
    assert.ok(s.quality && ['A', 'B'].includes(s.quality.tier), s.id);
    for (const k of reg.quality_tiers.rules) assert.ok(k in s.quality.criteria, `${s.id}: ${k}`);
    if (s.quality.criteria['DAR-Q-REGIME'] === false) assert.equal(s.quality.tier, 'B', `${s.id}: A trotz schwachem Regime`);
  }
  assert.equal(d.quality.A + d.quality.B, d.open.length);
});
