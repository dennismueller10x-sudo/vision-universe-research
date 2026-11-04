// Supertrader Neustart (04.11.2026): Lesarten V1 Top 5. Die Entscheidungsdatei nennt nur Lesarten, die der Code
// bereits als Referenz rechnet, und Alternativen, die als Varianten registriert sind. Sie ändert nichts am Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DARVAS_REFERENCE_CONFIG, DARVAS_RUN_VARIANTS } from '../source-faithful/research/darvas-lifecycle.mjs';
import { KK_REFERENCE_CONFIG, KK_RUN_VARIANTS } from '../source-faithful/research/kk-breakout-lifecycle.mjs';
import { BGU_REFERENCE_CONFIG, BGU_RUN_VARIANTS } from '../source-faithful/research/moka-lifecycle.mjs';

const D = JSON.parse(fs.readFileSync(new URL('../source-faithful/certification/READING-DECISIONS-2026-11-04.json', import.meta.url), 'utf8'));
const PLAN = JSON.parse(fs.readFileSync(new URL('../source-faithful/certification/CERT-PREP-TOP5-PLAN.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(D.decisions.map((d) => [d.id, d]));
const variantIds = (vs) => vs.map((v) => v.id);

test('ST-READ-1: V1 = Top 5, die übrigen acht in Forschung, zusammen C01–C13', () => {
  assert.deepEqual(D.v1Methods, ['C01', 'C02', 'C03', 'C08', 'C12']);
  const all = [...D.v1Methods, ...D.researchMethods].sort();
  assert.deepEqual(all, Array.from({ length: 13 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`));
});

test('ST-READ-2: alle sechs offenen Lesarten entschieden, jede mit einem Satz und Datum', () => {
  assert.deepEqual(Object.keys(byId).sort(), ['FP-ST-03', 'FP-ST-05', 'PS-C01-READINGS', 'PS-C03-BOTTOM-START', 'PS-C08-SETUP-PROXY', 'PS-C12-READINGS']);
  assert.equal(D.decidedOn, '2026-11-04');
  for (const d of D.decisions) assert.ok(d.sentence && d.sentence.length > 40 && d.source, d.id);
});

test('ST-READ-3: jede PS-Entscheidung gehört zu einer vorregistrierten Studie des TOP5-Plans', () => {
  const studies = new Set(PLAN.methods.flatMap((m) => m.studies.map((s) => s.id)));
  for (const id of Object.keys(byId).filter((k) => k.startsWith('PS-'))) assert.ok(studies.has(id), id);
});

test('ST-READ-4: Referenz = die Lesart, die der Code heute rechnet; Alternativen sind registrierte Varianten', () => {
  assert.equal(byId['PS-C03-BOTTOM-START'].reference['DAR-SF-BOTTOM-START'], DARVAS_REFERENCE_CONFIG.bottomSearchStart);
  assert.ok(variantIds(DARVAS_RUN_VARIANTS).includes('ALT-BOTTOM-AFTER-TOP-CONFIRMED'));
  assert.equal(byId['PS-C08-SETUP-PROXY'].reference.setupProxy, KK_REFERENCE_CONFIG.setupProxy);
  for (const v of byId['PS-C08-SETUP-PROXY'].alternativesKept) assert.ok(variantIds(KK_RUN_VARIANTS).includes(v), v);
  assert.equal(byId['PS-C12-READINGS'].reference.violationReading, BGU_REFERENCE_CONFIG.violationReading);
  assert.ok(variantIds(BGU_RUN_VARIANTS).includes('ALT-VIOLATION-NEXT-DAY'));
  // Turtle: der Vertrag nennt SKIP und 10D als Referenzlesart
  const tur = fs.readFileSync(new URL('../source-faithful/contracts/turtle.mjs', import.meta.url), 'utf8');
  assert.match(tur, /'SKIP \(reference reading/);
  assert.match(tur, /'10D \(System 1 exit; reference reading/);
  assert.equal(byId['PS-C01-READINGS'].reference['TUR-SF-S1-OPEN-BREAKOUT'], 'SKIP');
  assert.equal(byId['PS-C01-READINGS'].reference['TUR-SF-FAILSAFE-EXIT'], '10D');
});
