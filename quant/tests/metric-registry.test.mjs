import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),Registry=require('../engines/metric-registry.js'),Market=require('../engines/market-metric-registry.js'),Catalog=require('../engines/catalog.js');
test('unified registry preserves every original market definition and distinct legacy units',()=>{assert.equal(Registry.entries.length,48);for(const m of Market.entries)assert.strictEqual(Registry.get(m.metricId),m);assert.equal(new Set(Registry.entries.map(m=>m.metricId)).size,48);assert.equal(Registry.get('momentum_6m').unit,'ratio');assert.equal(Registry.get('factor.momentum6m').unit,'pct');assert.equal(Registry.get('factor.marginExpansion').unit,'percentage_points');assert.equal(Registry.get('factor.maxDrawdown').minimumBars,1);});
test('legacy ownership revision and all catalogue fields are explicit and immutable',()=>{const digest=createHash('sha256').update(readFileSync(new URL('../engines/factors.js',import.meta.url))).digest('hex');for(const m of Registry.entries.filter(m=>m.metricId.startsWith('factor.'))){assert.equal(m.ownerRevision.value,digest,'owner changed: review metric definition/version');assert.ok(Catalog.field(m.field[0]));for(const key of ['timeSemantics','adjustmentSemantics','missingDataPolicy','pitEligibility','updateCadence','provenance','uxMapping','methodology'])assert.ok(m[key],key);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.inputs));}});
test('dependency selection does not alias separate price engines or mix filing-only definitions',()=>{const market=Registry.affectedBy(['legacy.price_panel.close']);assert.ok(market.includes('factor.priceTo200dma')&&market.includes('factor.earningsYield'));assert.ok(!market.includes('factor.momentum6m'));assert.ok(Registry.affectedBy(['legacy.price_panel.adjustedClose']).includes('factor.momentum6m'));assert.ok(!market.includes('momentum_6m')&&!market.includes('factor.roic'));const filings=Registry.affectedBy(['canonical.fundamentals.periods']);assert.ok(filings.includes('factor.roic')&&filings.includes('factor.earningsYield'));assert.ok(!filings.includes('factor.momentum6m'));});

test('technical and Elliott rule fields are explicit current-snapshot metrics and not backtest-certified',()=>{
 const ids=['technical.opportunity_score','technical.trend','technical.primary_direction','elliott.count_status'];
 const fields=['technicalOpportunityScore','technicalTrend','technicalPrimaryDirection','elliottCountStatus'];
 assert.deepEqual(Registry.affectedBy(['technical.bundle.current_snapshot']),ids);
 ids.forEach((id,index)=>{const metric=Registry.get(id),field=Catalog.field(fields[index]);assert.deepEqual(metric.field,[fields[index]]);assert.ok(field);assert.equal(field.availability,'CURRENT_SNAPSHOT_ONLY');assert.equal(field.backtestEligibility,'NOT_CERTIFIED');assert.equal(field.isProbability,false);assert.equal(metric.timeSemantics,'CURRENT_SNAPSHOT_ONLY');assert.equal(metric.pitEligibility,'NOT_CERTIFIED');assert.equal(metric.backtestEligibility,'NOT_CERTIFIED');assert.ok(Object.isFrozen(metric)&&Object.isFrozen(metric.provenance));});
 assert.match(Registry.get('elliott.count_status').uxMapping.explanation,/keine Wahrscheinlichkeit/);
});

test('raw SMA factor is invalidated when adjusted observation availability changes',()=>{
 const Factors=require('../engines/factors.js');
 const series={startIndex:0,endIndex:199,close:new Float32Array(200).fill(100),adjustedClose:new Float32Array(200).fill(100)};
 assert.equal(Factors.priceMetrics(series,199,null,null,'NVDA').priceTo200dma,0);
 series.adjustedClose[199]=0;
 assert.equal(Factors.priceMetrics(series,199,null,null,'NVDA'),null);
 assert.ok(Registry.affectedBy(['legacy.price_panel.adjustedClose']).includes('factor.priceTo200dma'));
});
