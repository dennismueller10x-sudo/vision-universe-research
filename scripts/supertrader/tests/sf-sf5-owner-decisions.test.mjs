// Supertrader 5.0 – Owner-Entscheidungen vom 23.10.2026 (research/sf5-lifecycles.mjs#SF5_OWNER_DECISIONS).
// Jede Entscheidung wirkt genau dort, wo sie soll, und macht keine Modellannahme zur Originalregel; keine
// Statusaufwertung ausser den zwei freigegebenen Holy-Grail-Regeln (Sekundaerquelle, nie SOURCE_EXACT).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { CONTRACTS } from '../source-faithful/registry.mjs';
import { validateContract, deriveImplementationStatus } from '../source-faithful/contract.mjs';
import { SF5_OWNER_DECISIONS, SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { HOLY_GRAIL } from '../source-faithful/contracts/holy-grail.mjs';
import { KK_BREAKOUT } from '../source-faithful/contracts/kullamagi.mjs';
import { BUYABLE_GAP_UP } from '../source-faithful/contracts/morales-kacher.mjs';
import { DARVAS } from '../source-faithful/contracts/darvas.mjs';
import { KK_REFERENCE_CONFIG, KK_RUN_VARIANTS, KK_MODEL_ASSUMPTIONS } from '../source-faithful/research/kk-breakout-lifecycle.mjs';
import { BGU_REFERENCE_CONFIG, BGU_OPEN_MANUAL_DECISIONS, MOKA_MODEL_ASSUMPTIONS } from '../source-faithful/research/moka-lifecycle.mjs';
import { DARVAS_REFERENCE_CONFIG, DARVAS_RUN_VARIANTS, DARVAS_MODEL_ASSUMPTIONS } from '../source-faithful/research/darvas-lifecycle.mjs';
import { HOLY_GRAIL_RESEARCH_ADAPTER, W_RAS97 } from '../source-faithful/research/holy-grail-lifecycle.mjs';

const ART = 'scripts/supertrader/source-faithful/artifacts';
const read = (f) => JSON.parse(fs.readFileSync(`${ART}/${f}`, 'utf8'));
// sha256 of every (candidate, rule, status) on main before the decisions (2026-10-23, 189 rules)
const STATUSES_BEFORE_DECISIONS = '15a7267cc458db013a336a3c959fd7f02f3439466cbca0ddd249b374335c2a20';

test('SF5-OD-REGISTRY: genau die vier Entscheidungen, je mit Wirkung und Grenze', () => {
  assert.deepEqual(SF5_OWNER_DECISIONS.map((d) => d.id), ['D-RAS97', 'D-KK-ENTRY', 'D-BGU-VOLWINDOW', 'D-DARVAS-SIZE-INTRABAR']);
  for (const d of SF5_OWNER_DECISIONS) {
    assert.equal(d.date, '2026-10-23');
    assert.ok(SF5_LIFECYCLES.some((l) => l.key === d.lifecycle), d.id);
    assert.ok(d.changes && d.unchanged, d.id);
  }
});

test('SF5-OD-NO-OTHER-STATUS-CHANGE: ausser RAS-SF-ENTRY / RAS-SF-STOP ist jeder Regelstatus unveraendert', () => {
  const pairs = CONTRACTS.flatMap((c) => c.rules.map((r) => `${c.candidateId}|${r.id}|${r.status}`)).sort();
  const undo = pairs.map((p) => (/^C13\|RAS-SF-(ENTRY|STOP)\|SOURCE_DERIVED$/.test(p) ? p.replace('SOURCE_DERIVED', 'SOURCE_AMBIGUOUS') : p)).sort();
  assert.equal(crypto.createHash('sha256').update(undo.join('\n')).digest('hex'), STATUSES_BEFORE_DECISIONS);
  assert.equal(pairs.filter((p, i) => p !== undo[i]).length, 2);
});

test('SF5-OD-RAS97-SECONDARY-SOURCE: Sekundaerquelle ausdruecklich gekennzeichnet, nie SOURCE_EXACT, keine Messklassen-Aufwertung', () => {
  const extract = JSON.parse(fs.readFileSync('scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json', 'utf8'));
  assert.deepEqual(validateContract(HOLY_GRAIL, extract).errors, []);
  for (const c of CONTRACTS) for (const r of c.rules.filter((x) => x.sourceBasis === 'SECONDARY_SOURCE')) {
    assert.notEqual(r.status, 'SOURCE_EXACT', r.id);
    assert.ok(r.secondarySource && r.ownerDecision && /SECONDARY SOURCE/.test(r.derivation), r.id);
  }
  assert.ok(HOLY_GRAIL.sources.some((s) => s.sourceId === 'W-RAS97' && /SECONDARY SOURCE/.test(s.role)));
  assert.equal(deriveImplementationStatus(HOLY_GRAIL), 'PARTIAL_MANUAL_REVIEW'); // unchanged
  assert.equal(HOLY_GRAIL_RESEARCH_ADAPTER.label, 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT_SECONDARY_SOURCE');
  assert.equal(W_RAS97.notSourceExact, true);
  const c13 = read('STRATEGY-READINESS-SF3.json').candidates.find((x) => x.candidateId === 'C13');
  assert.equal(c13.backtestReadiness.measurement.class, 'NOT_MEASURABLE');
  const hg = read('STRATEGY-SF5-LIFECYCLE.json').strategies.HOLY_GRAIL_W_RAS97;
  assert.equal(hg.readiness.backtestReadiness.measurement, 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT');
  assert.equal(hg.readiness.mechanicalCompleteness.lifecycle, 'INCOMPLETE_LIFECYCLE'); // no trailing: not source-conform
});

test('SF5-OD-KK-NEXT-OPEN: Referenz naechste Eroeffnung, bisherige Schlusskursvariante vorregistriert, Abweichung zu KK-012 dokumentiert', () => {
  assert.equal(KK_REFERENCE_CONFIG.entryTiming, 'NEXT_OPEN');
  assert.ok(KK_RUN_VARIANTS.some((v) => v.id === 'ALT-ENTRY-BREAKOUT-DAY-CLOSE' && v.config.entryTiming === 'BREAKOUT_DAY_CLOSE'));
  assert.ok(!KK_RUN_VARIANTS.some((v) => v.id === 'ALT-ENTRY-NEXT-OPEN'));
  const ma = KK_MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-KK-ENTRY-TIMING');
  assert.match(ma.reference, /not KK-012 literally/); assert.match(ma.alternatives[0], /BREAKOUT_DAY_CLOSE/);
  assert.equal(KK_BREAKOUT.rules.find((r) => r.id === 'KK-SF-BO-STOP').status, 'SOURCE_EXACT'); // the rule itself, unchanged
  const rows = read('STRATEGY-SF5-LIFECYCLE.json').strategies.KK_BREAKOUT;
  assert.ok(JSON.stringify(rows).includes('KK-EX-NEXT-OPEN'));
});

test('SF5-OD-BGU-VOLWINDOW: 50-Sitzungen-Fenster als Research-Modellkonvention, keine Quellenregel; Konfiguration unveraendert', () => {
  assert.equal(BUYABLE_GAP_UP.rules.find((r) => r.id === 'MOKA-SF-BGU-VOLWINDOW').status, 'SOURCE_AMBIGUOUS');
  assert.match(MOKA_MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-MOKA-BGU-VOLWINDOW').reference, /RESEARCH MODEL CONVENTION.*not an original source rule/);
  assert.ok(!BGU_OPEN_MANUAL_DECISIONS.includes('MOKA-MR-VOLWINDOW'));
  assert.equal(BGU_REFERENCE_CONFIG.contextProxy, 'MA50');
});

test('SF5-OD-DARVAS: pessimistische Intrabar-Referenz; Groesse als Bandbreite aller Varianten, keine Darvas-Regel', () => {
  assert.equal(DARVAS_REFERENCE_CONFIG.intrabarOrder, 'PESSIMISTIC');
  assert.deepEqual(DARVAS_RUN_VARIANTS.filter((v) => v.changes.sizing).map((v) => v.id), ['ALT-SIZE-WEIGHT-005', 'ALT-SIZE-WEIGHT-020', 'ALT-SIZE-RISK-001']);
  assert.match(DARVAS_MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-DAR-SIZING').reference, /NOT a Darvas rule/);
  assert.equal(DARVAS.rules.find((r) => r.id === 'DAR-SF-SIZING').status, 'MANUAL_REVIEW_REQUIRED');
  const ps = read('STRATEGY-SF5-LIFECYCLE.json').strategies.DARVAS.readiness.positionSizing;
  assert.equal(ps.report, 'SPAN_OF_ALL_SIZING_VARIANTS'); assert.equal(ps.variants.length, 3); assert.match(ps.sourceRule, /NONE/);
});

test('SF5-OD-NO-READINESS-UPGRADE: Messklassen, Engine-Zustaende und Live-Status aller 13 Kandidaten wie vor den Entscheidungen', () => {
  const cls = Object.fromEntries(read('STRATEGY-READINESS-SF3.json').candidates.map((c) => [c.candidateId, c.backtestReadiness.measurement.class]));
  const F = 'FULL_DIAGNOSTIC_STRATEGY_BACKTEST', S = 'SCREEN_STATISTICS', N = 'NOT_MEASURABLE';
  assert.deepEqual(cls, { C01: F, C02: F, C03: 'MECHANICAL_COMPONENT_STUDY', C04: S, C05: S, C06: S, C07: S, C08: S, C09: N, C10: N, C11: S, C12: S, C13: N });
  const eng = Object.fromEntries(read('STRATEGY-COMPLETION-STATUS.json').candidates.map((c) => [c.candidateId, c.engine]));
  const W = 'RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION', M = 'MECHANICAL_SCREEN_COMPLETE', O = 'MECHANICAL_COMPONENTS_ONLY';
  assert.deepEqual(eng, { C01: W, C02: W, C03: M, C04: M, C05: M, C06: M, C07: M, C08: M, C09: O, C10: O, C11: M, C12: M, C13: O });
  assert.deepEqual([...new Set(read('STRATEGY-LIVE-READINESS.json').methods.map((m) => m.liveReadiness))], ['LIVE_NOT_APPROVED']);
});
