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
    assert.equal(ledger.invalidated.length, st.invalidatedTotal + st.retiredTotal, "ungueltige + abgeloeste = alle Ledger-Eintraege");
    assert.equal(st.retired.length, st.retiredTotal, "alle abgeloesten Setups ausgeliefert");
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

test('Regelkarten: jede Live-Variante hat eine vollstaendige Karte mit existierenden Regel-IDs', () => {
  const live = ['MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP'];
  const need = ['candidate', 'prepared', 'confirmation', 'execution', 'initialStop', 'hold', 'warning', 'exit', 'invalid'];
  for (const id of live) {
    const s = registry.strategies.find((x) => x.strategy_id === id);
    const card = s.rule_cards?.[0];
    assert.ok(card, `${id} ohne Regelkarte`);
    assert.equal(card.rule_version, s.strategy_version);
    assert.deepEqual(card.sections.map((x) => x.id), need, id);
    for (const e of ['gap', 'volume', 'missingData', 'conflictPre', 'conflictPos', 'version']) assert.ok(card.edge_cases.some((x) => x.id === e), `${id}: Randfall ${e}`);
    const ids = new Set(s.rules.map((r) => r.rule_id));
    for (const x of [...card.sections, ...card.edge_cases]) { for (const r of x.rules) assert.ok(ids.has(r), `${id}: ${r}`); assert.ok(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN', 'FOREIGN_RULE', 'NOT_PUBLIC', 'UNRESOLVED', 'VU', 'MIXED', 'NONE'].includes(x.provenance), `${id}/${x.id}: Herkunft ${x.provenance}`); }
    // Drei getrennte Aussagen: ausfuehrbar, Quellenlage, historische Validierung.
    assert.equal(card.executable.status, 'EXECUTABLE', id);
    // Runde 7: Quellenpruefung nur auf Suchauszuegen - nie als vollstaendige Originalpruefung ausgegeben.
    assert.ok(card.source_basis.status && ['NOT_PERFORMED', 'PERFORMED_R7_SNIPPETS', 'PERFORMED_R8_FULLTEXT', 'PERFORMED_R8_SECONDARY_QUOTES'].includes(card.source_basis.fidelityReview), `${id}: Originaltreue als geprueft ausgegeben`);
    if (card.source_basis.fidelityReview === 'PERFORMED_R7_SNIPPETS') assert.match(card.source_basis.fidelityNote, /Suchauszüg|Suchauszug/, id);
    // Runde 8: Volltext nur behaupten, wenn die Quelle im Ledger mit Abrufnachweis steht.
    if (card.source_basis.fidelityReview === 'PERFORMED_R8_FULLTEXT') assert.match(card.source_basis.fidelityNote, /Volltext gelesen/, id);
    assert.ok(card.source_basis.ruleCounts.original + card.source_basis.ruleCounts.vu > 0);
    assert.equal(card.historical_validation.status, 'NOT_VALIDATED', `${id}: ohne bestandene Gates keine Validierung`);
    assert.ok(card.historical_validation.failedGates.length > 0);
    assert.equal(card.completeness, undefined, `${id}: pauschales „vollständig“ ist abgeschafft`);
    assert.ok(ids.has(card.plan.confirmRuleId) && ids.has(card.plan.invalidationRuleId));
  }
  const mi = registry.strategies.find((x) => x.strategy_id === 'MINERVINI_VCP').rule_cards[0];
  // Ab 2.0.0 sekundaer belegt (Runde 7) - weiterhin keine Originalregel.
  assert.ok(['EXIT_NOT_SOURCE_BACKED', 'SECONDARY_SOURCES_VU_THRESHOLDS'].includes(mi.source_basis.status), 'Minervini-Ausstieg ist keine belastbare Originalregel');
  assert.equal(registry.strategies.find((x) => x.strategy_id === 'GREENBLATT_VALUE').rule_cards[0].executable.status, 'NOT_EXECUTABLE');
  const gb = registry.strategies.find((x) => x.strategy_id === 'GREENBLATT_VALUE').rule_cards[0];
  assert.equal(gb.inactive, true);
  assert.ok(gb.sections.some((x) => x.id === 'rebalance'));
});

test('Plan je Signal: geplante Schwellen mit Datenstand; Einstieg nur als echte Modellausfuehrung', () => {
  for (const st of Object.values(signals.strategies)) for (const s of st.open) {
    assert.ok(s.plan, s.id);
    assert.equal(s.plan.trigger.kind, 'PLANNED_THRESHOLD');
    assert.match(s.plan.trigger.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.plan.nextAction.text && s.plan.nextAction.ruleId, s.id);
    if (['SETUP', 'ENTRY_READY', 'TRIGGERED'].includes(s.state)) assert.equal(s.plan.entry, null, `${s.id}: Einstieg vor Ausfuehrung`);
    // Schlusskurs-Methoden kaufen zur naechsten Eroeffnung nach der Bestaetigung; Kauf-Stop-Methoden
    // (ab Runde 8) am Tag, an dem das Tageshoch den Trigger erreicht (Bestaetigung = Einstiegstag).
    if (s.entry) {
      assert.ok(['NEXT_OPEN', 'BUY_STOP'].includes(s.entry.priceBasis), `${s.id}: Preisbasis ${s.entry.priceBasis}`);
      if (s.entry.priceBasis === 'NEXT_OPEN') assert.ok(s.entry.date > s.confirmation.date, `${s.id}: Einstieg nach Bestaetigung`);
      else { assert.equal(s.entry.date, s.confirmation.date, `${s.id}: Kauf-Stop am Ausloesetag`); assert.ok(s.entry.evidence, `${s.id}: Belegart fehlt`); }
    }
  }
});

test('Darvas: B-Aufschluesselung ist konsistent und Regime-Sperre als VU markiert', () => {
  const q = signals.strategies.DARVAS_BOX.quality;
  assert.equal(q.bBreakdown.total, q.B);
  assert.equal(q.bBreakdown.blockedOnlyByRegime + q.bBreakdown.failOtherCriteria, q.B);
  assert.equal(q.byLabel.A_CANDIDATE + q.byLabel.B_SETUP + q.byLabel.A_ENTRY + q.byLabel.B_ENTRY, signals.strategies.DARVAS_BOX.open.length);
  const reg = registry.strategies.find((s) => s.strategy_id === 'DARVAS_BOX');
  const rule = reg.rules.find((r) => r.rule_id === 'DAR-Q-REGIME');
  assert.deepEqual(rule.source_reference, ['SRC-INTERNAL-VU']);
  assert.match(rule.plain_language_explanation, /keine Darvas-Originalregel/);
  for (const s of signals.strategies.DARVAS_BOX.open.filter((x) => ['SETUP', 'ENTRY_READY'].includes(x.state))) {
    assert.equal(s.quality.phase, 'PRE_BREAKOUT');
    assert.ok(!['A_ENTRY', 'B_ENTRY'].includes(s.quality.label), `${s.id}: Einstiegsstufe vor Bestaetigung`);
  }
});

test('Versionswechsel: abgeloeste Signale bleiben im Ledger, neue tragen die Version in der ID', () => {
  for (const [id, st] of Object.entries(signals.strategies)) {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data/ledger', `${id}.json`), 'utf8'));
    for (const s of ledger.open) assert.ok(s.id.endsWith(`:v${s.version}`), s.id);
    for (const s of ledger.invalidated.filter((x) => x.transitions.at(-1).ruleId === 'LC-VERSION-RETIRED')) assert.notEqual(s.version, st.version);
  }
});

test('Regelwechsel ist kein Marktereignis: Neubewertungen verweisen auf Vorgaenger und Kursstand', () => {
  let retired = 0, reassessed = 0;
  for (const [id, st] of Object.entries(signals.strategies)) {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data/ledger', `${id}.json`), 'utf8'));
    const all = new Map([...ledger.open, ...ledger.closed, ...ledger.invalidated].map((s) => [s.id, s]));
    for (const r of ledger.invalidated.filter((x) => x.transitions.at(-1).ruleId === 'LC-VERSION-RETIRED')) {
      retired++;
      assert.ok('successorId' in r.retiredBy, `${r.id}: Nachfolger nicht dokumentiert`);
      if (!r.retiredBy.successorId) continue;
      const n = all.get(r.retiredBy.successorId);
      assert.ok(n, `${r.id}: Nachfolger fehlt im Ledger`);
      const ra = n.discovery.reassessment;
      assert.equal(n.discovery.kind, 'RULE_VERSION_REASSESSMENT');
      assert.equal(ra.previousSignalId, r.id);
      assert.equal(ra.originalDiscoveryDate, r.createdAt, 'urspruengliches Entdeckungsdatum bleibt');
      assert.ok(n.createdAt <= r.retiredBy.date, `${n.id}: Neubewertung datiert nach dem Kursstand des Wechsels`);
      assert.equal(ra.priceDataAsOf, n.createdAt);
      assert.equal(n.transitions[0].origin, 'RULE_VERSION_REASSESSMENT');
    }
    const open = st.open.filter((x) => x.discovery?.kind === 'RULE_VERSION_REASSESSMENT');
    reassessed += open.length;
    assert.equal(st.retiredTotal, ledger.invalidated.filter((x) => x.transitions.at(-1).ruleId === 'LC-VERSION-RETIRED').length);
    assert.ok(!st.invalidated.some((x) => x.transitions.at(-1).ruleId === 'LC-VERSION-RETIRED'), 'Abgeloeste Setups nicht als ungueltig ausgeliefert');
  }
  assert.equal(signals.counts.RETIRED_BY_RULE_VERSION, retired);
  assert.equal(signals.counts.REASSESSED_AFTER_RULE_CHANGE, reassessed);
  const allOpen = Object.values(signals.strategies).flatMap((st) => st.open);
  assert.equal(signals.counts.NEW_SINCE_PREVIOUS_DATA, allOpen.filter((x) => x.discovery?.kind !== 'RULE_VERSION_REASSESSMENT' && x.createdAt > (JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data/ledger', `${x.strategyId}.json`), 'utf8')).previousDataAsOf || '')).length, 'Neubewertungen zaehlen nicht als neue Setups');
  for (const x of allOpen) assert.ok(x.createdAt <= signals.asOf, `${x.id}: Entdeckung nach dem Datenstand`);
});
