import test from 'node:test';
import assert from 'node:assert/strict';
import {eodEconomics,etfEconomics,intradayEconomics} from '../../scripts/market/summarize-marketstack-product-fitness.mjs';
test('multi-symbol batching never understates symbol credits',()=>{const s=eodEconomics(5000);assert.equal(s.minimumDailyHttpRequests,50);assert.equal(s.creditsPerDailyEod,5000);assert.equal(s.monthlyEodCredits,105000);});
test('history pages and actions are separately accounted',()=>{const s=eodEconomics(1000);assert.equal(s.oneTimeHistoryCredits,4000);assert.equal(s.oneTimeMetadataSplitsDividendsCredits,3000);});
test('ETF refresh cost does not claim usable holdings',()=>{const s=etfEconomics(500);assert.equal(s.monthlyWeeklyHoldingsEstimate,2167);assert.equal(s.holdingsCostDoesNotEstablishCoverage,true);});
test('intraday estimate is explicitly US session scenario, not global realtime promise',()=>{const s=intradayEconomics(10);assert.equal(s.estimatedSymbolEndpointCredits,16380);assert.equal(s.empiricalRealtimeClaim,false);});
test('invalid or fractional scenario sizes fail closed',()=>{for(const n of [-1,0.5,NaN])assert.throws(()=>eodEconomics(n));assert.throws(()=>intradayEconomics(1,{refreshMinutes:0}));});
