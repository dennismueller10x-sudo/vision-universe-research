// Runde 5: historisches Replay (nie Live-Signal), Beobachtungsliste statt
// „vorbereitet“, Pilot v1.1.0 mit Pruefung (Abstimmung, Stichprobe, Historie).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data', f), 'utf8'));

test('Replay: gekennzeichnet, nie im Ledger oder in Signalen, Einstieg zur naechsten Eroeffnung nach Schlussbestaetigung', () => {
  const rp = read('replay.json');
  assert.equal(rp.label, 'HISTORICAL_REPLAY_DEMO');
  assert.match(rp.labelText, /kein aktuelles Signal/);
  assert.ok(rp.examples.length >= 1);
  const sig = read('signals.json');
  const ledger = read('ledger/DONCHIAN_TURTLE.json');
  const liveIds = new Set([...ledger.open, ...(ledger.closed || []), ...(ledger.invalidated || [])].map((s) => s.id));
  for (const ex of rp.examples) {
    assert.ok(ex.signal.id.startsWith('REPLAY:'), ex.signal.id);
    assert.ok(!liveIds.has(ex.signal.id));
    assert.ok(!JSON.stringify(sig).includes(ex.signal.id), 'Replay-ID taucht in signals.json auf');
    assert.ok(ex.checks.confirmedAboveTrigger, 'Bestaetigung per Schluss ueber Trigger');
    assert.ok(ex.checks.entryIsNextSessionOpen, 'Einstieg zur naechsten Eroeffnung');
    assert.ok(ex.result.entry.price >= ex.checks.entryRawOpen, 'Einstieg = Eroeffnung + Ausfuehrungsannahme');
    assert.ok(Number.isFinite(ex.signal.initialStop) && ex.signal.initialStop < ex.result.entry.price);
    assert.equal(ex.signal.state, 'CLOSED');
    assert.ok(ex.result.exit.date > ex.result.entry.date || ex.kind === 'STOP');
  }
  // Auswahl nach Liquiditaet, nicht nach Ergebnis: jede Ausstiegsart hoechstens einmal
  const kinds = rp.examples.map((e) => e.kind);
  assert.equal(new Set(kinds).size, kinds.length);
});

test('Beobachtungsliste: Donchian-Wartende sind keine vorbereiteten Einstiege', () => {
  const reg = read('registry.json');
  const don = reg.strategies.find((s) => s.strategy_id === 'DONCHIAN_TURTLE');
  assert.equal(don.pending_semantics, 'WATCHLIST');
  const others = reg.strategies.filter((s) => s.strategy_id !== 'DONCHIAN_TURTLE' && s.mode === 'LIVE');
  for (const s of others) assert.notEqual(s.pending_semantics, 'WATCHLIST', s.strategy_id);
  const js = fs.readFileSync(path.join(ROOT, 'supertrader/assets/supertrader.js'), 'utf8');
  assert.match(js, /!isWatch\(s\)/, 'Startseite zaehlt Beobachtungsliste nicht als vorbereitet');
});

test('Pilot v1.1.0: Abstimmung, nachgerechnete Stichprobe, dokumentierte Vorversion und Konzentration', () => {
  const p = read('pilot-backtest.json');
  assert.equal(p.spec.version, '1.1.0');
  assert.equal(p.audit.reconciliation.ok, true);
  assert.ok(p.audit.tradeSample.length >= 4);
  for (const t of p.audit.tradeSample) assert.equal(t.raw.ok, true, `${t.symbol} ${t.entryWeek}`);
  assert.equal(p.history[0].version, '1.0.0');
  assert.ok(p.history[0].supersededBecause.length >= 2);
  assert.ok(p.audit.topContributors.length === 5);
  assert.ok(p.audit.adjustedPriceArtifacts.trades > 0);
  assert.match(p.audit.runHistory, /zweite Lauf/);
  assert.ok(p.biases.some((b) => b.id === 'DATA_BREAKS'));
  // Parameter unveraendert gegenueber v1.0.0
  for (const [k, v] of Object.entries({ entryLookback: 20, exitLookback: 10, minHistoryWeeks: 52, minPrice: 5, maxPositions: 20, costPerSide: 0.0025, anomalyLow: -0.75, anomalyHigh: 3 })) assert.equal(p.spec[k], v, k);
});
