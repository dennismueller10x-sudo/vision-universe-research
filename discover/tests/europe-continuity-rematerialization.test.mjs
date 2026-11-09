/** Independent public-artifact gates over every admitted listing. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import '../../scripts/discover/tests/europe-chart-continuity.test.mjs';
import '../../scripts/discover/tests/europe-continuity-live-qa.test.mjs';
import '../../scripts/discover/tests/resolve-europe-live-release.test.mjs';
const require=createRequire(import.meta.url),Ranges=require('../../core/chart-history.js'),root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('all 449 rematerialized histories preserve every original approved Close and hash-bound segment',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),report=await read('docs/reports/europe-continuity-449-20261012/europe_449_safe_history.json'),quality=await read('docs/reports/europe-continuity-449-20261012/europe_449_chart_quality.json');
 assert.equal(catalog.securities.length,449);assert.equal(report.rows.length,449);assert.equal(report.quarantineReleased,0);assert.equal(report.fabricatedPrices,0);
 for(const s of catalog.securities){const l=s.listings.find(x=>x.listingId===s.primaryListingId),row=report.rows.find(r=>r.securityId===s.securityId),full=await read(manifest.history[s.securityId].MAX.url.slice(1)),window=l.discoverDisplay.ranges.MAX;assert.equal(l.discoverDisplay.version,'vu-discover-display-policy-2');assert.equal(window.truncated,false);assert.equal(hash(full.points),l.discoverChart.ranges.MAX.pointsSha256);assert.equal(hash(full.segments),l.discoverChart.ranges.MAX.segmentsSha256);// Nach einem Append-only-Refresh (manifest.refresh) bleiben die geprueften Schlusskurse vom 12.10. unveraendert als Praefix erhalten; danach nur neuere Tage.
  const original=full.points.slice(0,row.barCount),appended=full.points.slice(row.barCount);assert.equal(row.retainedApprovedPercent,100);assert.equal(row.sourcePointsSha256,hash(original),s.securityId+' original approved closes unchanged');
  if(!manifest.refresh)assert.equal(row.barCount,full.points.length);else assert.ok(appended.every(p=>p[0]>original.at(-1)[0]),s.securityId+' only newer sessions appended');
  const starts=new Set(window.segmentStartDates),segments=[];for(const p of full.points){if(!segments.length||starts.has(p[0]))segments.push([]);segments.at(-1).push(p);}assert.deepEqual(segments.flat(),full.points);assert.equal(hash(segments),window.displaySegmentsSha256);const shape=segments.map(g=>({from:g[0][0],to:g.at(-1)[0],barCount:g.length}));
  if(!manifest.refresh)assert.deepEqual(shape,row.segments);else{const n=row.segments.length,last=row.segments[n-1];assert.deepEqual(shape.slice(0,n-1),row.segments.slice(0,n-1));assert.equal(shape[n-1].from,last.from);assert.ok(shape[n-1].barCount>=last.barCount&&shape[n-1].to>=last.to);assert.ok(shape.slice(n).every(g=>g.from>last.to));}
  const q=quality.rows.find(x=>x.securityId===s.securityId),rank={CHART_BLOCKED:0,CHART_LIMITED:1,CHART_READY:2};
  // Ein Refresh darf die Darstellungsqualitaet nie verbessern (extendWindow), nur gleich lassen oder verschlechtern.
  if(!manifest.refresh){assert.equal(window.chartStatus,q.chartStatus);assert.equal(l.discoverDisplay.ranges['1Y'].chartStatus,q.oneYearChartStatus);}else assert.ok(rank[window.chartStatus]<=rank[q.chartStatus],s.securityId+' MAX quality never improves by extension');
 }
});
test('all449 offered ranges come from their real full series and source-specific quality',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),report=await read('docs/reports/europe-continuity-449-20261012/europe_449_range_availability.json');assert.equal(report.rows.length,449);
 for(const s of catalog.securities){const full=await read(manifest.history[s.securityId].MAX.url.slice(1)),row=report.rows.find(r=>r.securityId===s.securityId);for(const [range,r]of Object.entries(row.ranges)){if(!manifest.refresh){assert.equal(r.available,Ranges.available(full.points,range));const actual=Ranges.sliceRange(full.points,range);assert.equal(actual.from,r.from);assert.equal(actual.to,r.to);assert.equal(actual.points.length,r.barCount);}
  // Nach einem Refresh: ein angebotener Zeitraum bleibt angeboten und endet am neuesten veroeffentlichten Schlusskurs.
  else if(r.available){assert.ok(Ranges.available(full.points,range),s.securityId+' '+range);assert.equal(Ranges.sliceRange(full.points,range).to,full.points.at(-1)[0]);}}}
});
test('2G golden history reaches2010 without reintroducing the quarantined identity interval',async()=>{
 const catalog=await read('discover/data/europe/catalog.json'),manifest=await read('discover/data/europe/manifest.json'),s=catalog.securities.find(x=>x.securityId==='ref_2GB_DE_XETR'),series=await read(manifest.history[s.securityId].MAX.url.slice(1));assert.ok(series.points.length>=4092);if(!manifest.refresh)assert.equal(series.points.length,4092);assert.deepEqual(series.points[0],['2010-01-04',2.098]);assert.deepEqual(series.points[4091],['2026-10-09',57.75]);assert.ok(series.points.slice(4092).every(p=>p[0]>'2026-10-09'));assert.ok(!series.points.some(p=>p[0]>='2016-10-10'&&p[0]<='2017-02-28'));assert.ok(s.listings[0].discoverDisplay.ranges.MAX.segmentStartDates.includes('2017-03-01'));
});
