import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { equityRules } from '../../scripts/core/equity-quality.mjs';
const require = createRequire(import.meta.url);
const Q = require('../equity-quality.js');
const RS = require('../../quant/engines/return-series.js');
const PC = require('../../quant/engines/published-close.js');
const DQ = require('../data-quality.js');
const now = '2026-11-06T12:00:00Z';
function series(points) { return { schemaVersion: PC.SCHEMA, status: 'CALCULATED', source: 'tiingo', provider: 'tiingo',
  dataMode: 'real', priceSeriesType: PC.BASIS, grain: 'daily', publishBasis: 'LICENSED', currency: 'USD', asOf: points.at(-1)[0], points }; }
test('E8-1: strictly over 50%, both directions, split at the jump date only', () => {
  const row = (points, splits = []) => ({ ticker: 'X', series: { points }, splits });
  assert.equal(Q.jumps([row([['2026-11-04',100],['2026-11-05',150]])], RS).failed, 0);
  assert.equal(Q.jumps([row([['2026-11-04',100],['2026-11-05',151]])], RS).failed, 1);
  assert.equal(Q.jumps([row([['2026-11-04',100],['2026-11-05',49]])], RS).failed, 1);
  assert.equal(Q.jumps([row([['2026-11-04',100],['2026-11-05',20]], [{date:'2026-11-05',factor:5}])], RS).failed, 0);
  assert.equal(Q.jumps([row([['2026-11-04',100],['2026-11-05',20]], [{date:'2026-11-04',factor:5}])], RS).failed, 1);
});
test('E8-2: >10 billion in dollars; existing logo and exact boundary pass', () => {
  assert.equal(Q.logos([{ticker:'A',marketCap:1e10}, {ticker:'B',marketCap:1e10+1},
    {ticker:'C',marketCap:2e10,logo:'/logo.png'}, {ticker:'D',marketCap:null}]).failed, 1);
});
test('E8-3: missing, whitespace and ticker-only names', () => {
  assert.equal(Q.names([{ticker:'A'}, {ticker:'B',name:'  '}, {ticker:'C',name:' c '}, {ticker:'D',name:'Delta'}]).failed, 3);
});
test('E8-4: rating date rather than fetch date; 45 days exactly passes', () => {
  const r = Q.analysts([{ticker:'A',asOf:'2026-09-22'}, {ticker:'B',asOf:'2026-09-21'}, {ticker:'C',asOf:null}], now);
  assert.deepEqual(r.findings.map(f => f.ticker), ['B','C']);
});
test('E8-5: canonical published close must match completed session (weekend safe)', () => {
  const rows = [null, series([['2026-11-04',12]]), series([['2026-11-05',13]]), series([['2026-11-05',0]])]
    .map((s,i) => ({ticker:String(i),series:s,owner:'quality'}));
  assert.equal(Q.depotPrices(rows, '2026-11-05', '2026-11-06', PC).failed, 3);
  assert.equal(Q.depotPrices([rows[2]], '2026-11-05', '2026-11-07', PC).failed, 0);
});
test('E8-6: stop must be positive finite; warnings never fail strict summary', () => {
  const r = Q.stops([null,0,-1,NaN,Infinity,10].map(stop => ({ticker:'A',owner:'strategy',stop})));
  assert.equal(r.failed,5); assert.equal(DQ.summarize([r]).overall,'WARN');
});
test('trend: only the preceding UTC calendar day; zero coverage is unknown', () => {
  const report = () => ({checkedAt:now,rules:[Q.names([{ticker:'A'}])]});
  const prev = {checkedAt:'2026-11-05T23:00:00Z',rules:[{id:'DQ-E8-3',checked:1,failed:0}]};
  assert.equal(Q.withTrend(report(),prev).rules[0].delta,1);
  assert.equal(Q.withTrend(report(),{...prev,checkedAt:now}).rules[0].delta,null);
  assert.equal(Q.withTrend(report(),null).rules[0].delta,null);
});
test('trend: a same-day rerun keeps the yesterday basis it carried (trendBasis), never compares with itself', () => {
  const report = () => ({checkedAt:now,rules:[Q.names([{ticker:'A'}])]});
  const prev = {checkedAt:'2026-11-05T23:00:00Z',rules:[{id:'DQ-E8-3',checked:1,failed:0,findings:[{ticker:'X'}]},{id:'DQ-PX-1',checked:9,failed:0}]};
  const first = Q.withTrend(report(),prev);
  assert.deepEqual(first.trendBasis,{checkedAt:prev.checkedAt,rules:[{id:'DQ-E8-3',checked:1,failed:0}]},'schlank, nur E8-Regeln, keine Befunde');
  const rerun = Q.withTrend(report(),JSON.parse(JSON.stringify(first)));
  assert.equal(rerun.rules[0].delta,1);assert.deepEqual(rerun.trendBasis,first.trendBasis);
  // Ohne Vortagsbasis (erster Bericht oder Luecke) bleibt der Trend unbekannt, auch bei Wiederholung.
  const lonely = Q.withTrend(report(),null);assert.equal(lonely.trendBasis,null);
  assert.equal(Q.withTrend(report(),lonely).rules[0].delta,null);
});
test('ticker findings are not truncated at the 25 sample limit', () => {
  const r = Q.names(Array.from({length:30},(_,i) => ({ticker:'X'+i})));
  assert.equal(r.samples.length,25); assert.equal(Q.forTicker([r],'X29').length,1);
});
test('adapter uses real source shapes, new ratings take precedence over legacy', async () => {
  const artifacts = {
    '/discover/data/stock-index/US_REAL.json':{symbols:['A']},
    '/discover/logos/index.json':{files:{}},
    '/quant/data/market/discover-series/ref_A.json':series([['2026-11-04',100],['2026-11-05',20]]),
    '/quant/data/market/discover-series-long/ref_A.json':{corporateActions:{splits:[['2026-11-05',5]]}},
    '/discover/data/stocks/US_REAL/A.json':{companyName:'A',marketCap:{value:2e10}},
    '/dashboard/data/analysts/shards/A_.json':{entries:{ref_A:{ratingsState:'AVAILABLE',asOf:'2026-09-01',fetchedAt:'2026-11-06'}}},
    '/dashboard/data/analyst_ratings.json':{symbols:{A:{consensus_label:'buy',trend_history:[{period:'2026-11-01'}]}}},
    '/quant/data/product/model-depots-v1.json':{depots:[{profileId:'quality',positions:[{ticker:'A'}]}]},
    '/supertrader/data/portfolio.json':{strategies:{s:{positions:[{symbol:'A',stop:null}],closed:[{symbol:'B'}]}}}
  };
  const load = async p => { if (!(p in artifacts)) throw Error('missing'); return artifacts[p]; };
  const result = await equityRules({load,now,expected:'2026-11-05'});
  assert.equal(result.rules.length,6);
  assert.deepEqual(result.rules.map(r => r.failed),[0,1,1,1,0,1]);
  assert.equal(result.rules[0].checked,1);
  assert.equal(result.missingArtifacts.length,0);
});
test('CLI publishes E8 findings and yesterday deltas under --out without blocking', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(),'e8-test-'));
  try {
    for (const [file,value] of Object.entries({
      'discover/data/stock-index/US_REAL.json':{symbols:['A']},
      'discover/data/stocks/US_REAL/A.json':{companyName:'A',marketCap:{value:2e10}},
      'discover/logos/index.json':{files:{}},
      'previous.json':{checkedAt:'2026-11-05T12:00:00Z',rules:[{id:'DQ-E8-3',checked:1,failed:0}]}
    })) { const p=join(root,file); mkdirSync(dirname(p),{recursive:true}); writeFileSync(p,JSON.stringify(value)); }
    const out=join(root,'report.json');
    const run=spawnSync(process.execPath,[new URL('../../scripts/core/data-quality.mjs',import.meta.url).pathname,
      '--root='+root,'--now='+now,'--previous='+join(root,'previous.json'),'--out='+out],
      {encoding:'utf8',env:{...process.env,GITHUB_STEP_SUMMARY:''}});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(report.rules.filter(r=>r.id.startsWith('DQ-E8-')).length,6);
    assert.equal(report.rules.find(r=>r.id==='DQ-E8-3').delta,1);
    assert.equal(report.rules.find(r=>r.id==='DQ-E8-2').severity,'WARN');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('missing Discover market cap falls back to existing factor evidence with matching identity', async () => {
  const artifacts={
    '/discover/logos/index.json':{files:{}},
    '/discover/data/stocks/US_REAL/A.json':{companyName:'Alpha',marketCap:null},
    '/quant/data/product/factor-evidence-v1/A_.json.gz':{securities:{A:{securityId:'ref_A',marketCap:2e10}}}
  };
  const load=async p=> {if(p in artifacts)return artifacts[p];throw Error('missing');};
  const report=await equityRules({load,now,expected:'2026-11-05',tickers:['A']});
  assert.equal(report.rules[1].checked,1);assert.equal(report.rules[1].failed,1);
  artifacts['/quant/data/product/factor-evidence-v1/A_.json.gz'].securities.A.securityId='ref_B';
  assert.equal((await equityRules({load,now,expected:'2026-11-05',tickers:['A']})).rules[1].checked,0);
});
test('artifact loader reads existing compressed JSON locally and from a site', async () => {
  const {makeLoader}=await import('../../scripts/core/lib.mjs');
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {gzipSync}=await import('node:zlib');const root=mkdtempSync(join(tmpdir(),'e8-gzip-'));
  const bytes=gzipSync(JSON.stringify({marketCap:2e10}));
  const originalFetch=globalThis.fetch;
  try {
    writeFileSync(join(root,'cap.json.gz'),bytes);
    assert.deepEqual(await makeLoader({root})('/cap.json.gz'),{marketCap:2e10});
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes});
    assert.deepEqual(await makeLoader({site:'https://example.test'})('/cap.json.gz'),{marketCap:2e10});
  } finally {globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true});}
});
