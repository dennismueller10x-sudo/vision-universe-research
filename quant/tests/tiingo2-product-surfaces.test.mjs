import test from 'node:test';
import assert from 'node:assert/strict';
import {productSurfaceReadiness} from '../../scripts/market/tiingo2-product-surfaces.mjs';

const stock={symbol:'TEST',exchange:'NASDAQ',sector:'Technology',industry:null,discoveryEligible:true};
const row={s:'TEST',ex:'NASDAQ',sec:'Technology'};

test('Discover eligibility is distinct from a delivered stock payload',()=>{
 const excluded=productSurfaceReadiness('TEST',{...stock,discoveryEligible:false},row);
 assert.equal(excluded.discover.payloadReady,true);
 assert.equal(excluded.discover.ready,false);
 assert.deepEqual(excluded.discover.reasonCodes,['DISCOVER_INELIGIBLE']);
 assert.equal(excluded.markets.ready,true);
 const included=productSurfaceReadiness('TEST',stock,row);
 assert.equal(included.discover.ready,true);
});

test('Markets requires matching canonical identity, exchange and sector evidence',()=>{
 assert.equal(productSurfaceReadiness('TEST',stock,row).markets.ready,true);
 const wrongStock=productSurfaceReadiness('TEST',{...stock,symbol:'OTHER'},row);
 assert.equal(wrongStock.discover.ready,false);
 assert.equal(wrongStock.markets.ready,false);
 const wrongExchange=productSurfaceReadiness('TEST',stock,{...row,ex:'NYSE'});
 assert.equal(wrongExchange.markets.ready,false);
 assert.deepEqual(wrongExchange.markets.reasonCodes,['MARKETS_EXCHANGE_MISMATCH']);
 const missingSector=productSurfaceReadiness('TEST',{...stock,sector:null},{...row,sec:null});
 assert.equal(missingSector.markets.ready,false);
 assert.deepEqual(missingSector.markets.reasonCodes,['MARKETS_SECTOR_UNRESOLVED']);
 assert.equal(productSurfaceReadiness('TEST',stock,{...row,s:'OTHER'}).screener.ready,false);
});
