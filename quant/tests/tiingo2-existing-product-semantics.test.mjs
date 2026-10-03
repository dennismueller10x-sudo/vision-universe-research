import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDiscoverExistingPayload,compareTechnicalExistingPayload,compareChangedExistingProductFiles,
 compareSignalExistingPayload,compareTechnicalSummaryExistingPayload,
 compareScreenerExistingPayload} from '../../scripts/market/tiingo2-existing-product-semantics.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const card={symbol:'OLD',securityId:'ref_OLD',price:{value:42},fundamentals:{revenue:100},
 discoveryEligible:true,signals:{breakout:false},metrics:{momentumPercentile:52,return6M:0.2},
 ranks:{momentumPercentile:52,universeSize:1000,sector:{rank:4,of:20,sector:'Technology'}},updatedAt:'2026-10-01T00:00:00Z'};
test('existing Discover stock card allows only documented rank and timestamp changes',()=>{
 const ranked=structuredClone(card);ranked.ranks.momentumPercentile=53;ranked.metrics.momentumPercentile=53;ranked.updatedAt='2026-10-02T00:00:00Z';
 assert.equal(compareDiscoverExistingPayload(card,ranked,{addedCount:20}).status,'PASS');
 assert.equal(compareDiscoverExistingPayload(card,ranked,{addedCount:0}).status,'BLOCKED');
 for(const mutate of [row=>row.price.value++,row=>row.fundamentals.revenue++,row=>row.discoveryEligible=false,
  row=>row.signals.breakout=true,row=>row.ranks.sector.sector='Financials',row=>row.metrics.return6M=0.9]){
  const changed=structuredClone(card);mutate(changed);
  assert.equal(compareDiscoverExistingPayload(card,changed,{addedCount:20}).status,'BLOCKED');
 }
 const jump=structuredClone(card);jump.ranks.momentumPercentile=95;
 assert.equal(compareDiscoverExistingPayload(card,jump,{addedCount:20}).status,'BLOCKED');
});
test('existing technical instrument bytes and signal events cannot change under an additive listing',()=>{
 const baseline={schemaVersion:'technical-v1',shard:'OL',generatedAt:'old',instruments:{OLD:{securityId:'ref_OLD',bars:[42,43],priceSeriesType:'SPLIT_ADJUSTED'}},unavailableSchemaVersion:1,unavailable:{}};
 const added=structuredClone(baseline);added.generatedAt='new';added.instruments.IPO={securityId:'ref_IPO',bars:[10]};
 assert.equal(compareTechnicalExistingPayload(baseline,added,{allowedNewTickers:['IPO']}).status,'PASS');
 added.instruments.OLD.bars[0]=999;
 assert.equal(compareTechnicalExistingPayload(baseline,added,{allowedNewTickers:['IPO']}).status,'BLOCKED');
 const before={schemaVersion:'signals-v1',generatedAt:'old',lookback:60,scope:'CANONICAL_PRODUCT_UNIVERSE',
  results:[{ticker:'OLD',state:'AVAILABLE',asOf:'2026-10-02',events:[{id:'old-event'}]}],
  events:[{ticker:'OLD',id:'old-event',definitionId:'rule',state:'AVAILABLE'}],counts:{requested:1,available:1,unavailable:0}};
 const after=structuredClone(before);after.generatedAt='new';after.results.push({ticker:'IPO',state:'AVAILABLE',events:[]});after.counts={requested:2,available:2,unavailable:0};
 assert.equal(compareSignalExistingPayload(before,after,{allowedNewTickers:['IPO']}).status,'PASS');
  after.events[0].definitionId='other-rule';
  assert.equal(compareSignalExistingPayload(before,after,{allowedNewTickers:['IPO']}).status,'BLOCKED');
 const oldSummary={schemaVersion:'technical-summary-v1',source:{owner:'native'},artifacts:{shards:1},
  generatedAt:'old',counts:{requested:1},reasons:{},rows:{OLD:{technical:'AVAILABLE',signals:'AVAILABLE'}}};
 const newSummary=structuredClone(oldSummary);newSummary.rows.IPO={technical:'AVAILABLE',signals:'AVAILABLE'};newSummary.counts.requested=2;
 assert.equal(compareTechnicalSummaryExistingPayload(oldSummary,newSummary,{allowedNewTickers:['IPO']}).status,'PASS');
 newSummary.rows.OLD.signals='UNAVAILABLE';
 assert.equal(compareTechnicalSummaryExistingPayload(oldSummary,newSummary,{allowedNewTickers:['IPO']}).status,'BLOCKED');
});
test('Screener columnar existing prices and fundamentals are protected while population percentiles may shift',()=>{
 const before={columns:['s','price','revenue','rsPct','fQuality'],cols:{s:['OLD'],price:[42],revenue:[100],rsPct:[52],fQuality:[60]}};
 const after={columns:before.columns,cols:{s:['OLD','IPO'],price:[42,10],revenue:[100,null],rsPct:[53,null],fQuality:[60,null]}};
 assert.equal(compareScreenerExistingPayload(before,after,{addedCount:1}).status,'PASS');
 after.cols.rsPct[0]=95;
 assert.equal(compareScreenerExistingPayload(before,after,{addedCount:1}).status,'PASS','one addition to one baseline title can change the percentile substantially');
 after.cols.rsPct[0]=53;
 after.cols.price[0]=999;
 assert.equal(compareScreenerExistingPayload(before,after).status,'BLOCKED');
 after.cols.price[0]=42;after.cols.revenue[0]=0;
 assert.equal(compareScreenerExistingPayload(before,after).status,'BLOCKED');
 after.cols.revenue[0]=100;after.cols.fQuality[0]=61;
 assert.equal(compareScreenerExistingPayload(before,after).status,'BLOCKED','factor values require their own exact per-title proof');
 const broadBefore={columns:['s','rsPct','momPct'],cols:{s:Array.from({length:100},(_,i)=>'T'+i),
  rsPct:Array(100).fill(50),momPct:Array(100).fill(50)}},broadAfter=structuredClone(broadBefore);
 broadAfter.cols.s.push('IPO');broadAfter.cols.rsPct.push(50);broadAfter.cols.momPct.push(50);
 broadAfter.cols.rsPct[0]=95;
 assert.equal(compareScreenerExistingPayload(broadBefore,broadAfter,{addedCount:1}).status,'BLOCKED');
 const dir=mkdtempSync(join(tmpdir(),'vu-tiingo2-screener-semantic-'));
 try{
  const path=join(dir,'shadow/screener/data/universe-US_REAL.json');mkdirSync(join(dir,'shadow/screener/data'),{recursive:true});
  writeFileSync(path,JSON.stringify(after));
  const report=compareChangedExistingProductFiles({root:join(dir,'root'),shadow:join(dir,'shadow'),
   stage:{additions:[],files:[]},baselineScreener:before});
  assert.equal(report.status,'BLOCKED','private native Screener baseline is compared even when no tracked Screener file exists');
  assert.equal(report.findings[0].name,'EXISTING_PRODUCT_SEMANTIC_CHANGE');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
