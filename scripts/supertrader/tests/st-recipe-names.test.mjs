// Supertrader „Das Rezept eines Profis“ (docs/design/supertrader-2026-11/HANDOVER.md, Entscheidungen 1 und 2, Folien K1 und K3):
// ein Name je Methode („Trader · Muster“) und eine Ablauf-Leiste mit festen Wörtern auf allen Seiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stringLiterals, UI_SCRIPTS } from './st-recipe-wording.test.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const N = require('../../../supertrader/assets/st-names.js');
const F = require('../../../supertrader/assets/st-flow.js');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Folie K3, Spalte „Neu“ */
const K3 = {
  C04: 'Weinstein · Investor', C05: 'Weinstein · Trader', C06: 'Minervini · VCP', C07: 'Minervini · Power Play',
  C11: 'Morales & Kacher · Pocket Pivot', C12: 'Morales & Kacher · Buyable Gap-Up', C13: 'Raschke · Holy Grail', C03: 'Darvas · Box',
  C01: 'Turtle · 20 Tage', C02: 'Turtle · 55 Tage', C08: 'Kullamägi · Breakout', C09: 'Kullamägi · Episodic Pivot', C10: 'Kullamägi · Parabolic',
};

test('K3: ein Name je Methode nach „Trader · Muster“ für alle 13 Methoden des Datenstands', () => {
  for (const [cid, name] of Object.entries(K3)) assert.equal(N.name(cid), name, cid);
  assert.equal(N.ORDER.length, 13);
  const sum = JSON.parse(read('supertrader/data/sf-candidates/summary.json'));
  assert.deepEqual(sum.strategies.map((s) => s.candidateId).sort(), Object.keys(K3).sort(), 'jede Methode des Datenstands hat ihren Namen');
});

test('K3: die fünf Musterdepots tragen den Namen ihrer Methode; alle anderen Modelle behalten ihren Namen', () => {
  assert.deepEqual(N.DEPOT, { WEINSTEIN_STAGE: 'C04', MINERVINI_VCP: 'C06', DARVAS_BOX: 'C03', DONCHIAN_TURTLE: 'C01', MOMENTUM_BREAKOUT: 'C08' });
  const reg = JSON.parse(read('supertrader/data/registry-core.json'));
  const live = reg.strategies.filter((s) => s.mode === 'LIVE').map((s) => s.strategy_id).sort();
  assert.deepEqual(live, Object.keys(N.DEPOT).sort(), 'Musterdepots im Datenstand = Zuordnung');
  for (const s of reg.strategies) {
    if (N.DEPOT[s.strategy_id]) assert.equal(N.ofStrategy(s), K3[N.DEPOT[s.strategy_id]]);
    else if (N.ALIAS[s.strategy_id]) assert.equal(N.ofStrategy(s), K3[N.ALIAS[s.strategy_id]], s.strategy_id);
    else assert.equal(N.ofStrategy(s), s.world_name, s.strategy_id);
  }
});

test('K3: erzeugte Methodenseiten tragen den Namen im Titel (build.mjs nutzt st-names.js)', () => {
  assert.match(read('scripts/supertrader/build.mjs'), /createRequire\(import\.meta\.url\)\('\.\.\/\.\.\/supertrader\/assets\/st-names\.js'\)/);
  for (const [slug, name] of [['donchian-turtle', 'Turtle · 20 Tage'], ['minervini-vcp', 'Minervini · VCP'], ['darvas-boxes', 'Darvas · Box'], ['momentum-breakout', 'Kullamägi · Breakout'], ['weinstein-stages', 'Weinstein · Investor']]) {
    assert.match(read(`supertrader/strategies/${slug}/index.html`), new RegExp(`<title>${name} — Supertrader`), slug);
  }
});

test('K1: eine Leiste, zwei Fragen, feste Wörter', () => {
  assert.deepEqual(F.ERK.map((x) => x[0]), ['Muster erkannt', 'Regel erfüllt', 'Plan fertig']);
  assert.deepEqual(F.DEP.map((x) => x[0]), ['Wartet', 'Aufgenommen', 'Im Musterdepot', 'Abgegeben']);
  assert.equal(F.BROKEN[0], 'Muster zerfallen');
  assert.deepEqual(['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN'].map(F.wordOfStage), ['Muster erkannt', 'Regel erfüllt', 'Plan fertig']);
  const W = { SETUP: 'Wartet', ENTRY_READY: 'Plan fertig', TRIGGERED: 'Aufgenommen', ACTIVE: 'Im Musterdepot', WARNING: 'Im Musterdepot', EXIT: 'Abgegeben', CLOSED: 'Abgegeben', INVALIDATED: 'Muster zerfallen' };
  for (const [st, w] of Object.entries(W)) assert.equal(F.wordOfState(st), w, st);
  assert.deepEqual(['SETUP', 'ENTRY_READY', 'TRIGGERED', 'ACTIVE', 'EXIT', 'CLOSED', 'INVALIDATED'].map(F.stepOfState), [0, 0, 1, 2, 3, 3, -1]);
  assert.match(F.erk(1), /class="is-done"[\s\S]*class="is-on"[\s\S]*Plan fertig/);
  assert.equal((F.mini(2, 4).match(/<i /g) || []).length, 4);
});

test('K1/K3: die Oberfläche nutzt die alten Stufen-, Zustands- und Methodennamen nicht mehr', () => {
  const OLD = /\b(?:Bild passt|Regel bestätigt|Durchgerechnet|Muster entsteht|(?<!-)Marke erreicht|Muster geplatzt|Chart-Kandidat|Bestätigtes Research-Setup|Modellierter Handelsablauf|Turtle System [12]|Donchian Turtle|VU (?:Equity )?Adaptation|Minervini SEPA|Momentum Breakout|Darvas-Box|Weinstein Stages?)\b/;
  const bad = [];
  for (const f of UI_SCRIPTS) for (const s of stringLiterals(read(f))) { const m = s.match(OLD); if (m) bad.push(f + ': ' + m[0] + ' «' + s.slice(0, 80) + '»'); }
  assert.deepEqual(bad, []);
  const st = read('supertrader/assets/supertrader.js');
  assert.match(st, /loadScript\(BASE \+ 'assets\/st-names\.js'\), loadScript\(BASE \+ 'assets\/st-flow\.js'\)/, 'Bausteine vor dem Seitenmodul geladen');
});
