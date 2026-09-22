import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url),Catalog=require('../engines/catalog.js');
const screener=readFileSync(new URL('../screener/app.js',import.meta.url),'utf8');
const builder=readFileSync(new URL('../strategies/builder/app.js',import.meta.url),'utf8');
const strategies=readFileSync(new URL('../strategies/app.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../api/client.js',import.meta.url),'utf8');

test('classic synthetic workspaces do not offer current real snapshot fields',()=>{
 const current=Catalog.FIELD_LIST.filter(field=>field.availability==='CURRENT_SNAPSHOT_ONLY');
 assert.deepEqual(current.map(field=>field.id),[
  'technicalOpportunityScore','technicalOpportunityPercentile','technicalRiskReward','technicalTrend','technicalStructure',
  'technicalConfirmedStructure','technicalMomentumState','technicalRelativeStrengthState','technicalRelativeStrengthPercentile','technicalScenarioConfidence',
  'technicalSetupStatus','technicalEntryStatus','technicalPrimaryDirection','technicalVolatilityRegime','technicalVolumeState',
  'technicalDistanceTo52wHigh','technicalMomentum12MReturn','elliottCountStatus',
  /* Quant-V2-Faktorevidenz: eine aktuelle Materialisierung, kein
     backtestfaehiger Verlauf. Dieselbe Verfuegbarkeitsstufe haelt sie
     damit automatisch aus den klassischen synthetischen Workspaces
     heraus - die filtern genau darauf. */
  'quantV2.factorEvidence.quality','quantV2.factorEvidence.growth','quantV2.factorEvidence.momentum',
  'quantV2.factorEvidence.value','quantV2.factorEvidence.profitability','quantV2.factorEvidence.revisions',
  'quantV2.factorEvidence.risk','quantV2.factorEvidence.availableFactors'
 ]);
 for(const source of [screener,builder]){
  assert.match(source,/availability\s*!==\s*"CURRENT_SNAPSHOT_ONLY"/);
  assert.match(source,/hier nicht verfuegbar/);
 }
});

test('historical launch is preflighted before Worker creation and explained in the Strategy UI',()=>{
 assert.ok(client.indexOf('Strategy.backtestEligibility(request.definition)')<client.indexOf('new Worker('));
 assert.match(client,/blockedFields:\s*eligibility\.blockedFields\.slice\(\)/);
 assert.match(strategies,/Strategy\.backtestEligibility\(version\.definition\)/);
 assert.match(strategies,/Es wurde kein Worker und kein historischer Datenlauf gestartet/);
});

test('classic screener and Strategy Lab fail closed instead of showing a false empty result',()=>{
 assert.match(screener,/unavailableSnapshotFields\(state\.query\.filters, state\.query\.sort\)/);
 assert.match(screener,/nicht als leere Trefferliste ausgegeben/);
 assert.match(builder,/Die Definition wurde weder als leere Auswahl interpretiert noch fuer einen Backtest freigegeben/);
 assert.ok(screener.indexOf('unavailableSnapshotFields(state.query.filters, state.query.sort)')<screener.indexOf('var validation = Query.validate(state.query)'));
 assert.ok(builder.indexOf('field.availability === "CURRENT_SNAPSHOT_ONLY"')<builder.indexOf('var probe = Query.createQuery'));
});
