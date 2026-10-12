/** Independent public-artifact gates over every admitted listing. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import '../../scripts/discover/tests/europe-chart-continuity.test.mjs';
import '../../scripts/discover/tests/europe-continuity-live-qa.test.mjs';
const require=createRequire(import.meta.url),Ranges=require('../../core/chart-history.js'),root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('all 449 rematerialized histories preserve every original approved Close and hash-bound segment',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),report=await read('docs/reports/europe-continuity-449-20261012/europe_449_safe_history.json'),quality=await read('docs/reports/europe-continuity-449-20261012/europe_449_chart_quality.json');
 assert.equal(catalog.securities.length,449);assert.equal(report.rows.length,449);assert.equal(report.quarantineReleased,0);assert.equal(report.fabricatedPrices,0);
 for(const s of catalog.securities){const l=s.listings.find(x=>x.listingId===s.primaryListingId),row=report.rows.find(r=>r.securityId===s.securityId),full=await read(manifest.history[s.securityId].MAX.url.slice(1)),window=l.discoverDisplay.ranges.MAX;assert.equal(l.discoverDisplay.version,'vu-discover-display-policy-2');assert.equal(window.truncated,false);assert.equal(hash(full.points),l.discoverChart.ranges.MAX.pointsSha256);assert.equal(hash(full.segments),l.discoverChart.ranges.MAX.segmentsSha256);assert.equal(row.barCount,full.points.length);assert.equal(row.retainedApprovedPercent,100);assert.equal(row.sourcePointsSha256,hash(full.points));
  const starts=new Set(window.segmentStartDates),segments=[];for(const p of full.points){if(!segments.length||starts.has(p[0]))segments.push([]);segments.at(-1).push(p);}assert.deepEqual(segments.flat(),full.points);assert.equal(hash(segments),window.displaySegmentsSha256);assert.deepEqual(segments.map(g=>({from:g[0][0],to:g.at(-1)[0],barCount:g.length})),row.segments);
  const q=quality.rows.find(x=>x.securityId===s.securityId);assert.equal(window.chartStatus,q.chartStatus);assert.equal(l.discoverDisplay.ranges['1Y'].chartStatus,q.oneYearChartStatus);
 }
});
test('all449 offered ranges come from their real full series and source-specific quality',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),report=await read('docs/reports/europe-continuity-449-20261012/europe_449_range_availability.json');assert.equal(report.rows.length,449);
 for(const s of catalog.securities){const full=await read(manifest.history[s.securityId].MAX.url.slice(1)),row=report.rows.find(r=>r.securityId===s.securityId);for(const [range,r]of Object.entries(row.ranges)){assert.equal(r.available,Ranges.available(full.points,range));const actual=Ranges.sliceRange(full.points,range);assert.equal(actual.from,r.from);assert.equal(actual.to,r.to);assert.equal(actual.points.length,r.barCount);}}
});
test('2G golden history reaches2010 without reintroducing the quarantined identity interval',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),s=catalog.securities.find(x=>x.securityId==='ref_2GB_DE_XETR'),series=await read(manifest.history[s.securityId].MAX.url.slice(1));assert.equal(series.points.length,4092);assert.deepEqual(series.points[0],['2010-01-04',2.098]);assert.deepEqual(series.points.at(-1),['2026-10-09',57.75]);assert.ok(!series.points.some(p=>p[0]>='2016-10-10'&&p[0]<='2017-02-28'));assert.ok(s.listings[0].discoverDisplay.ranges.MAX.segmentStartDates.includes('2017-03-01'));
});
