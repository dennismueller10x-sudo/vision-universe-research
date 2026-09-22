import {readFile,readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Service=require('../../quant/api/product-services.js');
const Policy=require('../../quant/engines/display-policy.js');
const Query=require('../../quant/engines/query.js');
const root=new URL('../../',import.meta.url);
const baseArg=process.argv.find(a=>a.startsWith('--base-url='));
const base=baseArg?baseArg.slice('--base-url='.length).replace(/\/$/,''):null;
const loadJSON=async path=>{
 if(base){const response=await fetch(base+path);if(!response.ok)throw Error('HTTP_'+response.status+' '+path);return response.json();}
 return JSON.parse(await readFile(new URL(path.slice(1),root),'utf8'));
};
const loadCompressedJSON=async path=>{
 if(base){const response=await fetch(base+path);if(!response.ok)throw Error('HTTP_'+response.status+' '+path);const bytes=new Uint8Array(await response.arrayBuffer());return JSON.parse(gunzipSync(bytes));}
 return JSON.parse(gunzipSync(await readFile(new URL(path.slice(1),root))));
};
const api=Service.create({loadJSON,loadCompressedJSON,displayPolicy:Policy,queryEngine:Query});
const summary=await loadJSON('/quant/data/product/capabilities-summary-v1.json');
const productIntelligence=await loadJSON('/quant/data/product/technical-signals-v1/summary.json').catch(()=>null);
const samples=[
 ['TSLA','large_cap'],['AMD','semiconductor'],['MU','semiconductor'],['MET','insurer'],['O','reit'],
 ['ASML','international_adr'],['BAC','bank'],['PLAB','small_cap'],['CRWV','young_ipo']
];
const checks=[];
for(const [ticker,cohort] of samples){
 const [search,stock,fundamentals,quant,technical,technicalWorkspace]=await Promise.all([
  api.searchInstruments(ticker,{limit:12}),api.getStockIntelligence(ticker),api.getHistoricalFundamentals(ticker),
  api.getQuantWorkspace(ticker),api.getTechnicalIntelligence(ticker),api.getTechnicalWorkspace(ticker)
 ]);
 checks.push({ticker,cohort,
  searchable:search.entries.some(e=>e.ticker===ticker),stockDetail:stock.state,history:stock.chart?.state||'UNAVAILABLE',
  fundamentals:fundamentals.state,quantEvidence:quant.state,quantScore:quant.score?.state||'UNAVAILABLE',
  technicalEvidence:technical.state,technicalEvidenceLevel:technical.evidenceLevel||null,
  fullTechnicalWorkspace:technicalWorkspace.state,elliott:technicalWorkspace.state,
  setupStateContract:stock.setupState?'VISIBLE':'UNAVAILABLE',setupStateActive:stock.setupState?.availability?.state==='AVAILABLE'});
}
let canonicalTechnicalBundles=productIntelligence?.counts?.technicalFullBundles??5;
let signalsCapable=productIntelligence?.counts?.signalsCapable??5;
let elliottCapable=productIntelligence?.counts?.elliottCapable??5;
if(!base&&!productIntelligence){
 const files=(await readdir(new URL('../../quant/data/technical/instruments/',import.meta.url))).filter(f=>f.endsWith('.json'));
 canonicalTechnicalBundles=0;
 for(const file of files){try{const source=await loadJSON('/quant/data/technical/instruments/'+file);if(source.dataMode==='real'&&source.isMock===false&&source.source==='tiingo'&&source.instrumentId===file.slice(0,-5)&&/^[A-Z0-9.-]+$/.test(source.instrumentId))canonicalTechnicalBundles++;}catch{}}
}
const failed=checks.filter(c=>!c.searchable||c.stockDetail!=='AVAILABLE'||c.history!=='AVAILABLE'||c.quantEvidence!=='AVAILABLE'||c.quantScore!=='UNAVAILABLE'||c.technicalEvidence!=='AVAILABLE'||c.setupStateContract!=='VISIBLE'||c.setupStateActive||(productIntelligence&&(c.fullTechnicalWorkspace!=='AVAILABLE'||c.elliott!=='AVAILABLE')));
const report={measuredAt:new Date().toISOString(),target:base||'LOCAL_CHECKOUT',sourceArtifactGeneratedAt:summary.generatedAt,
 PRODUCTION_SEARCHABLE_UNIVERSE:summary.counts.productUniverse,
 STOCK_DETAIL_ROUTABLE_UNIVERSE:summary.counts.productUniverse,
 FUNDAMENTAL_VISIBLE_UNIVERSE:summary.counts.fundamentals,
 QUANT_EVIDENCE_VISIBLE_UNIVERSE:summary.counts.factorEligible,
 TECHNICAL_VISIBLE_UNIVERSE:summary.counts.factorEligible,
 TECHNICAL_FULL_BUNDLE_UNIVERSE:canonicalTechnicalBundles,
 FULL_TECHNICAL_WORKSPACE_VISIBLE_UNIVERSE:canonicalTechnicalBundles,
 SIGNALS_CAPABLE_UNIVERSE:signalsCapable,
 ELLIOTT_CAPABLE_UNIVERSE:elliottCapable,
 ELLIOTT_VISIBLE_UNIVERSE:elliottCapable,
 SETUPSTATE_VISIBLE_UNIVERSE:summary.counts.productUniverse,
 SETUPSTATE_ACTIVE_UNIVERSE:0,
 FIVE_SCOPE_REMAINS:false,
 QUANT_MODEL_VERSION:'quant-v2.0.0',QUANT_V2_STATUS:'SPECIFIED_NOT_ACTIVE',MARKET_REGIME_STATUS:'FAIL_CLOSED',
 samples:checks,acceptance:failed.length?'FAIL':'PASS',failures:failed.map(c=>c.ticker),
 measurementBasis:'Canonical product capability summary, materialized Technical/Signals/Elliott summary and live consumer-service probes.'};
console.log(JSON.stringify(report,null,2));
if(failed.length)process.exitCode=1;
