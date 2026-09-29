import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STRATEGIES, DNA_FIELDS, EVIDENCE, PRODUCT_STATUS, INTERNAL_SOURCES } from '../registry.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-ledger.json'), 'utf8'));
const sourceIds = new Set([...ledger, ...INTERNAL_SOURCES].map((s) => s.source_id));
const RULE_FIELDS = ['rule_id', 'plain_language_explanation', 'machine_readable_definition', 'parameter_set', 'source_reference', 'evidence_status', 'VU_formalization_flag', 'strategy_version'];

test('Gate B: jede Strategie fuehrt alle DNA-Felder', () => {
  for (const s of STRATEGIES) for (const f of DNA_FIELDS) assert.ok(f in s && s[f] !== undefined && s[f] !== null, `${s.strategy_id}.${f}`);
});

test('Gate B: jede Regel hat ID, Klartext, Maschinenfassung, Parameter, Quelle, Evidenz, VU-Flag, Version', () => {
  for (const s of STRATEGIES) { const ids = new Set(); for (const r of s.rules) {
    for (const f of RULE_FIELDS) assert.ok(f in r, `${r.rule_id}.${f}`);
    assert.ok(!ids.has(r.rule_id), `doppelte Rule-ID ${r.rule_id}`); ids.add(r.rule_id);
    assert.ok(EVIDENCE.includes(r.evidence_status), `${r.rule_id} Evidenz ${r.evidence_status}`);
    assert.equal(typeof r.VU_formalization_flag, 'boolean');
    assert.equal(r.strategy_version, s.strategy_version, `${r.rule_id} Version`);
    assert.ok(r.source_reference.length > 0, `${r.rule_id} ohne Quelle`);
    for (const id of r.source_reference) assert.ok(sourceIds.has(id), `${r.rule_id} verweist auf unbekannte Quelle ${id}`);
    if (r.evidence_status === 'VU_FORMALIZATION' || r.evidence_status === 'VU_EXTENSION') assert.equal(r.VU_formalization_flag, true, `${r.rule_id}: VU_FORMALIZATION ohne Flag`);
    if (r.source_reference.includes('SRC-INTERNAL-VU')) assert.equal(r.VU_formalization_flag, true, `${r.rule_id}: interne Regel ohne VU-Flag`);
  } }
});

test('Gate B: DNA-Felder verweisen nur auf existierende Regeln', () => {
  for (const s of STRATEGIES) {
    const ids = new Set(s.rules.map((r) => r.rule_id));
    for (const f of DNA_FIELDS) for (const rid of (s[f] && s[f].rules) || []) assert.ok(ids.has(rid), `${s.strategy_id}.${f} -> ${rid}`);
  }
});

test('Gate B: Quellen der Strategien existieren im Ledger', () => {
  for (const s of STRATEGIES) for (const id of s.sources) assert.ok(sourceIds.has(id), `${s.strategy_id} -> ${id}`);
});

test('Gate B: Source Ledger ist dauerhaft (echte URL oder ausdruecklich keine) und ohne Chat-Zitate', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-ledger.json'), 'utf8');
  assert.doesNotMatch(raw, /turn\d+(view|search)\d+|cite(turn)?/i);
  for (const s of ledger) {
    for (const f of ['source_id', 'title', 'author', 'source_type', 'access', 'retrieved_at', 'url_verification', 'evidence_status_ceiling']) assert.ok(s[f] !== undefined, `${s.source_id}.${f}`);
    if (s.url) assert.match(s.url, /^https:\/\//, s.source_id);
    else assert.equal(s.url_verification, 'NO_URL_FOUND', s.source_id);
    assert.equal(s.content_retrieved_by_vu, false, `${s.source_id}: Inhaltsabruf nicht behaupten`);
  }
});

test('Schreibweise Kullamägi, keine falsche Variante', () => {
  const files = ['scripts/supertrader/registry.mjs', 'scripts/supertrader/source-ledger.json', 'supertrader/assets/supertrader.js'];
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(t, /Kullam(ä|a)ggi|Kullamagi(?!e)/, f);
  }
});

test('Produktstatus nur aus dem erlaubten Vokabular; nichts ist validiert', () => {
  for (const s of STRATEGIES) for (const p of s.product_status) {
    assert.ok(PRODUCT_STATUS.includes(p), `${s.strategy_id}: ${p}`);
    assert.ok(!['BACKTEST_VALIDATED', 'LIVE_VALIDATED'].includes(p), `${s.strategy_id} darf nicht validiert sein`);
  }
});

test('Pflicht-Welten vorhanden, Advanced ohne Regeln/Signale', () => {
  const ids = STRATEGIES.map((s) => s.strategy_id);
  for (const id of ['GREENBLATT_VALUE', 'MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP', 'KK_EPISODIC_PIVOT', 'KK_PARABOLIC_SHORT', 'CANSLIM', 'PIOTROSKI_F', 'DONCHIAN_TURTLE']) assert.ok(ids.includes(id), id);
  for (const s of STRATEGIES.filter((x) => x.advanced)) { assert.equal(s.rules.length, 0); assert.deepEqual(s.product_status, ['ADVANCED_RESEARCH']); }
});

test('Darvas und Minervini tragen die Pflicht-Kennzeichnungen', () => {
  const d = STRATEGIES.find((s) => s.strategy_id === 'DARVAS_BOX');
  assert.ok(d.product_status.includes('VU_FORMALIZATION'));
  assert.ok(d.prohibited_interpretations.some((p) => /originale Darvas-Formel/.test(p)));
  assert.ok(d.rules.find((r) => r.rule_id === 'DAR-BOX-01').VU_formalization_flag);
  const m = STRATEGIES.find((s) => s.strategy_id === 'MINERVINI_VCP');
  assert.ok(m.product_status.includes('HYBRID_MODEL'));
  assert.equal(m.automation_level, 'HYBRID');
  assert.ok(m.rules.find((r) => r.rule_id === 'MIN-VCP-01').VU_formalization_flag);
  assert.ok(m.prohibited_interpretations.some((p) => /Trend Template ist nicht/.test(p)));
});

test('Jede Strategie mit Varianten hat Kontrollstrategien', () => {
  for (const s of STRATEGIES.filter((x) => !x.advanced)) assert.ok(s.baselines.length > 0, s.strategy_id);
});
