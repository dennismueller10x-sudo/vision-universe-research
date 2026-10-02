// Runde 6: Evidenz je Strategieversion, Donchian als Forschung, keine
// Veroeffentlichung abgeleiteter Kennzahlen vor der Rechteklaerung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_LEDGER, EVIDENCE_LEVELS, evidenceFor, isResearch } from '../evidence.mjs';
import { STRATEGIES } from '../registry.mjs';
import { LIVE_ENGINES } from '../build.mjs';
import donchian from '../engine/strategies/donchian.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'supertrader/data', f), 'utf8'));

test('R6-0 Alle intern geprüften Kursmethoden: öffentlich „In Prüfung“, Darstellung Forschung', () => {
  for (const id of ['MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP', 'DONCHIAN_TURTLE']) {
    const e = evidenceFor(STRATEGIES.find((x) => x.strategy_id === id));
    assert.equal(e.level, 'IN_REVIEW', id);
    assert.equal(e.presentation, 'RESEARCH', id);
    assert.equal(e.version, LIVE_ENGINES.find((x) => x.id === id).version, id + ': Evidenz gilt der live laufenden Version');
  }
});

test('R6-1 Donchian v1.1.0: öffentlich „In Prüfung“, Darstellung Forschung; Engine läuft unverändert weiter', () => {
  const s = STRATEGIES.find((x) => x.strategy_id === 'DONCHIAN_TURTLE');
  const e = evidenceFor(s);
  assert.equal(e.level, 'IN_REVIEW');
  assert.equal(e.presentation, 'RESEARCH');
  assert.equal(e.version, '1.1.0');
  assert.ok(isResearch(e));
  // Laufende Modellpositionen werden nach der gueltigen Regelversion weiter gefuehrt.
  assert.ok(LIVE_ENGINES.includes(donchian));
  assert.equal(donchian.version, '1.1.0');
  assert.deepEqual(donchian.manageCompatible, ['1.0.0', '1.1.0']);
});

test('R6-2 Bis zur Rechteklärung: kein öffentliches Prüfergebnis, keine Kennzahlen in Evidenztexten', () => {
  for (const [id, hist] of Object.entries(EVIDENCE_LEDGER)) {
    for (const h of hist) {
      assert.ok(['NOT_TESTED', 'IN_REVIEW'].includes(h.level), `${id}: ${h.level} vor Rechteklärung`);
      assert.ok(!/\d+([,.]\d+)?\s*(%|Prozent|p\. ?a\.)/.test(h.note || ''), `${id}: Kennzahl im Text`);
      assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  for (const k of Object.keys(EVIDENCE_LEVELS)) assert.ok(EVIDENCE_LEVELS[k].label && EVIDENCE_LEVELS[k].plain);
});

test('R6-3 Jede Strategie trägt Evidenz, Quellen- und Datenqualität getrennt; Teilprüfungen bleiben Teilprüfung', () => {
  for (const s of STRATEGIES) {
    const e = evidenceFor(s);
    assert.ok(e.level && e.source?.label && e.data?.label && e.presentation, s.strategy_id);
    if (s.mode === 'PARTIAL_CHECK') assert.equal(e.presentation, 'PARTIAL');
    if (s.mode === 'RESEARCH') assert.equal(e.presentation, 'NAME_ONLY');
  }
  assert.equal(evidenceFor(STRATEGIES.find((x) => x.strategy_id === 'MINERVINI_VCP')).source.id, 'PARTLY_UNBACKED', 'Minervini-Ausstieg nicht als Original');
  assert.equal(evidenceFor(STRATEGIES.find((x) => x.strategy_id === 'CANSLIM')).data.id, 'PRICES_NO_PIT_FUNDAMENTALS');
});

test('R6-4 Ausgeliefertes registry.json enthält die Einstufung; Protokoll der Forschungsmethode bleibt erhalten', () => {
  const reg = read('registry.json');
  const don = reg.strategies.find((x) => x.strategy_id === 'DONCHIAN_TURTLE');
  assert.equal(don.evidence?.presentation, 'RESEARCH');
  assert.equal(don.evidence?.level, 'IN_REVIEW');
  assert.ok(reg.evidenceScale?.noPromise);
  const ledger = read('ledger/DONCHIAN_TURTLE.json');
  assert.ok(ledger.open.some((s) => s.entry), 'laufende Modellpositionen im Protokoll');
  for (const s of ledger.open) assert.ok(['1.0.0', '1.1.0'].includes(s.version));
});

test('R6-5 Interne Evidenz liegt nur verschlüsselt im Repository', () => {
  const f = path.join(ROOT, 'scripts/supertrader/validation/evidence-internal.sealed.json');
  assert.ok(fs.existsSync(f));
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j.schema, 'supertrader-sealed-1.0.0');
  assert.ok(!/TESTED_NO_EDGE|excessCagr|cagr/i.test(fs.readFileSync(f, 'utf8')));
});
