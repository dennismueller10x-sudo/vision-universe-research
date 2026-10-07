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

test('R6-1 Donchian v1.1.0: Prüfergebnis bleibt „In Prüfung“; seit Runde 8 läuft 2.0.0, Positionen von 1.x nach 1.1.0', () => {
  const s = STRATEGIES.find((x) => x.strategy_id === 'DONCHIAN_TURTLE');
  const e = evidenceFor(s);
  assert.equal(e.level, 'IN_REVIEW');
  assert.equal(e.presentation, 'RESEARCH');
  assert.ok(isResearch(e));
  // Der Eintrag zu 1.1.0 bleibt im Protokoll stehen (alte Versionen werden nicht geloescht).
  assert.ok(e.history.some((h) => h.version === '1.1.0' && h.level === 'IN_REVIEW'));
  // Runde 8: 2.0.0 laeuft live, offene Positionen aus 1.0.0/1.1.0 fuehrt die unveraenderte 1.1.0-Engine.
  const live = LIVE_ENGINES.find((x) => x.id === 'DONCHIAN_TURTLE');
  // Runde 12: 2.0.1 = 2.0.0 mit Marktampel im Modellportfolio (Signale unveraendert, 2.0.0-Setups laufen weiter).
  // Runde 13: 2.0.2 = 2.0.0 (Marktampel aus 2.0.1 zurueckgenommen); 2.0.0/2.0.1-Setups laufen weiter.
  assert.equal(live.version, '2.0.2'); assert.ok(live.signalCompatible.includes('2.0.0') && live.signalCompatible.includes('2.0.1'));
  assert.equal(live.legacy['1.1.0'], donchian); assert.equal(live.legacy['1.0.0'], donchian);
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
  // Ab 2.0.0 ist der Ausstieg sekundaer belegt (Runde 7); nie als Originalregel.
  assert.ok(['PARTLY_UNBACKED', 'SECONDARY_VU'].includes(evidenceFor(STRATEGIES.find((x) => x.strategy_id === 'MINERVINI_VCP')).source.id), 'Minervini-Ausstieg nicht als Original');
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
  // Runde 8: 2.0.0 sucht neu; Positionen aus 1.x laufen nach ihrer Version weiter, wartende 1.x-Setups sind abgeloest.
  for (const s of ledger.open) assert.ok(s.version === '2.0.0' || s.version === '2.0.1' || s.version === '2.0.2' || (s.entry && ['1.0.0', '1.1.0'].includes(s.version)), s.id);
  assert.ok(ledger.open.some((s) => s.entry && s.version === '1.1.0'), 'Altpositionen bleiben erhalten');
});

test('R6-5 Interne Evidenz liegt nur verschlüsselt im Repository', () => {
  const f = path.join(ROOT, 'scripts/supertrader/validation/evidence-internal.sealed.json');
  assert.ok(fs.existsSync(f));
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j.schema, 'supertrader-sealed-1.0.0');
  assert.ok(!/TESTED_NO_EDGE|excessCagr|cagr/i.test(fs.readFileSync(f, 'utf8')));
});
