import test from 'node:test';
import assert from 'node:assert/strict';
import {validOHLC,columns,longestObservedSegment,gatherHistories,indicatorSnapshot,compareSnapshots,technicalGate,buildEngineFitness,reconstructSplitControlDiagnostic,maskInvalidDiagnosticBars,tiingoSplitAdjustedRows,evidenceTimestamp,addObservedRanks} from '../../scripts/market/validate-marketstack-product-engines.mjs';
// Synthetic adversarial unit fixtures are explicitly not real-data evidence.
const bar=(date,c=100,extra={})=>({date,symbol:'TEST',exchange:'XETR',open:c,high:c+1,low:c-1,close:c,volume:100,adj_open:c,adj_high:c+1,adj_low:c-1,adj_close:c,price_currency:'EUR',...extra});
const dates=n=>Array.from({length:n},(_,i)=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10));
const probe=rows=>({endpoints:[{endpoint:'eod',ok:true,params:{symbols:'TEST',exchange:'XETR'},checkedAt:'2026-10-01T00:00:00Z',sourceRunId:'fixture',data:{data:rows}}]});
test('impossible OHLC is rejected, not repaired',()=>{assert.equal(validOHLC(bar('2025-01-01',100,{low:110})),false);assert.equal(validOHLC(bar('2025-01-01',0)),false);});
test('missing OHLC remains null when passed into columns',()=>{const c=columns([{date:'2025-01-01',close:100}]);assert.equal(c.open[0],null);assert.equal(c.volume[0],null);});
test('separated old and current windows never supply a false continuous year',()=>{const r=[bar('2000-01-01'),...dates(5).map(d=>bar(d))];assert.equal(longestObservedSegment(r).length,5);});
test('conflicting same-date observations are quarantined rather than last-write-wins',()=>{const r=gatherHistories([probe([bar('2025-01-01'),bar('2025-01-02')]),probe([bar('2025-01-01',99)])]);assert.deepEqual(r[0].conflictingDates,['2025-01-01']);assert.equal(r[0].rows.length,1);});
test('same symbols on different venues never merge',()=>{const r=gatherHistories([probe([bar('2025-01-01'),bar('2025-01-01',110,{exchange:'XFRA'})])]);assert.equal(r.length,2);});
test('missing twelve-month history has null momentum and 52w metrics',()=>{const r=indicatorSnapshot(dates(20).map(d=>bar(d)));assert.equal(r.SMA20,100);assert.equal(r.MOMENTUM_12M,null);assert.equal(r.HIGH_52W,null);});
test('missing adjusted field does not fall back to raw price',()=>{const r=indicatorSnapshot(dates(253).map(d=>bar(d,100,{adj_close:null})),'adj_close');assert.equal(r.SMA20,null);assert.equal(r.MOMENTUM_12M,null);});
test('one-percent price delta is material, bounded tolerance is not widened',()=>{const c=compareSnapshots({SMA20:100,MOMENTUM_6M:0.1},{SMA20:101,MOMENTUM_6M:0.11});assert.equal(c.SMA20.status,'MATERIAL_DIFFERENCE');assert.equal(c.MOMENTUM_6M.status,'MATERIAL_DIFFERENCE');});
test('missing comparable indicator is unsafe, not a numeric zero delta',()=>{assert.equal(compareSnapshots({SMA200:null},{SMA200:null}).SMA200.status,'UNSAFE');});
test('complete-looking bars cannot waive split and session coverage gates',()=>{const h={rows:dates(253).map(d=>bar(d)),conflictingDates:[]};const r=technicalGate(h,{listingId:'listing',tradingCurrency:'EUR'});assert.equal(r.status,'BLOCKED');assert.ok(r.reasons.includes('FULL_SPLIT_DIVIDEND_VOLUME_BASIS_UNVERIFIED'));assert.equal(r.productionAdmission,false);});
test('any currency gap blocks historical native-unit certification',()=>{const r=technicalGate({rows:[bar('2025-01-01',100,{price_currency:null})],conflictingDates:[]},{listingId:'listing',tradingCurrency:'EUR'});assert.ok(r.reasons.includes('UNVERIFIED_HISTORICAL_QUOTE_UNIT'));});
test('explicit foreign currency in same listing is unsafe, not merely missing metadata',()=>{const r=technicalGate({rows:[bar('2025-01-01',100,{price_currency:'MXN'})],conflictingDates:[]},null,{controlCurrency:'USD'});assert.equal(r.status,'UNSAFE');assert.ok(r.reasons.includes('CURRENCY_CONTRACT_MISMATCH'));});
test('invalid history is unsafe even if metadata has identity and currency',()=>{const r=technicalGate({rows:[bar('2025-01-01',100,{high:90})],conflictingDates:[]},{listingId:'listing',tradingCurrency:'EUR'});assert.equal(r.status,'UNSAFE');});
test('research engine runner is deterministic, never production-admits, and labels native turnover',()=>{const p=probe(dates(253).map((d,i)=>bar(d,100+i/100)));const before=JSON.stringify(p);const opts={listings:[{listingId:'listing',providerSymbol:'TEST',mic:'XETR',assetType:'EQUITY',tradingCurrency:'EUR'}]};const a=buildEngineFitness([p],opts),b=buildEngineFitness([p],opts);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(p),before);assert.equal(a.quant.rows[0].nativeTurnoverIsNotUsdLiquidity,true);assert.equal(a.quant.summary.ready,0);assert.equal(a.backtest.status,'NOT_BACKTEST_SAFE');});
test('no cached evidence means no fabricated sample or source metrics',()=>{const r=buildEngineFitness([]);assert.equal(r.technical.rows.length,0);assert.equal(r.technical.summary.pairedTiingoControls,0);});
test('invalid OHLC is fully masked with date retained and missing volume never invented',()=>{
 const rows=[bar('2025-01-01'),bar('2025-01-02',100,{low:110,volume:null}),bar('2025-01-03')],before=JSON.stringify(rows),masked=maskInvalidDiagnosticBars(rows);
 assert.equal(JSON.stringify(rows),before);assert.deepEqual(masked.map(b=>b.date),rows.map(b=>b.date));
 for(const k of ['open','high','low','close','volume'])assert.equal(masked[1][k],null);
});
test('complete Tiingo actions survive common-date removal of the split session',()=>{
 const complete=[bar('2025-01-01',100,{splitFactor:1}),bar('2025-01-02',10,{splitFactor:10}),bar('2025-01-03',11,{splitFactor:1})];
 const adjusted=tiingoSplitAdjustedRows([complete[0],complete[2]],complete);
 assert.equal(adjusted[0].close,10);assert.equal(adjusted[0].volume,1000);assert.equal(adjusted[1].close,11);
});
test('ETF histories are excluded from company Quant factors and company SuperTrader ranks',()=>{
 const p=probe(dates(253).map((d,i)=>bar(d,100+i/100))),r=buildEngineFitness([p],{listings:[{listingId:'ETF_listing',providerSymbol:'TEST',mic:'XETR',assetType:'ETF',tradingCurrency:'EUR'}]});
 assert.equal(r.quant.rows[0].technicalMetrics,null);assert.equal(r.quant.rows[0].fundamentalJoinRequired,false);assert.equal(r.supertrader.rows.length,0);
});
test('native EUR turnover is never presented as USD liquidity',()=>{
 const p=probe(dates(253).map((d,i)=>bar(d,100+i/100))),r=buildEngineFitness([p],{listings:[{listingId:'EQUITY_listing',providerSymbol:'TEST',mic:'XETR',assetType:'EQUITY',tradingCurrency:'EUR'}]});
 assert.equal(r.quant.rows[0].technicalMetrics.avgDollarVolume,null);assert.ok(r.quant.rows[0].technicalMetrics.avgNativeTurnoverMillions>0);
});
test('invalid calendar date fails historical gate explicitly',()=>{const r=technicalGate({rows:[bar('2025-02-31')],conflictingDates:[]},{listingId:'listing',tradingCurrency:'EUR'});assert.equal(r.status,'UNSAFE');assert.ok(r.reasons.includes('INVALID_TRADING_DATE'));});
test('CLI evidence clock is deterministic and cannot predate newest source response',()=>{assert.equal(evidenceTimestamp([{generatedAt:'2026-10-01T00:00:00Z',endpoints:[{checkedAt:'2026-10-02T04:23:10.746Z'}]}]),'2026-10-02T04:23:10.746Z');});
test('verified split reconstruction preserves already-scaled volume and removes false economic gap',()=>{
 const rows=[bar('2024-06-07',1000,{volume:1000}),bar('2024-06-10',101,{volume:1200})],events=[{type:'SPLIT',date:'2024-06-10',factor:10,verification:'VERIFIED_OFFICIAL_AND_PROVIDER_EVENT'}];
 const r=reconstructSplitControlDiagnostic(rows,events,{priceBasis:'INDEPENDENTLY_CONTROLLED_AS_TRADED',volumeBasis:'ALREADY_SPLIT_SCALED_OBSERVED_CONTROL'});
 assert.equal(r[0].close,100);assert.equal(r[0].volume,1000);assert.ok(Math.abs(r[1].close/r[0].close-1-0.01)<1e-12);assert.equal(rows[0].close,1000);
});
test('research split reconstruction refuses unverified or already adjusted price assumptions',()=>{
 const rows=[bar('2024-06-07')];assert.throws(()=>reconstructSplitControlDiagnostic(rows,[],{priceBasis:'ALREADY_ADJUSTED',volumeBasis:'ALREADY_SPLIT_SCALED_OBSERVED_CONTROL'}));
 assert.throws(()=>reconstructSplitControlDiagnostic(rows,[{type:'SPLIT',date:'2024-06-10',factor:10}],{priceBasis:'INDEPENDENTLY_CONTROLLED_AS_TRADED',volumeBasis:'ALREADY_SPLIT_SCALED_OBSERVED_CONTROL'}));
});
test('strategy RS uses the existing weighted momentum definition rather than yearly return alone',()=>{
 const make=(symbol,r)=>({symbol,bars:{date:['2025-01-01']},indexOf:new Map([['2025-01-01',0]]),ind:{dollarVol20:[2e6],ret21:[0],ret63:[r[0]],ret126:[r[1]],ret189:[r[2]],ret252:[r[3]]},cross:{mom21:[],mom63:[],mom126:[],rs:[]}});
 const a=make('A',[1,1,1,0]),b=make('B',[0,0,0,1]);addObservedRanks([a,b]);assert.equal(a.cross.rs[0],100);assert.equal(b.cross.rs[0],0);
});
