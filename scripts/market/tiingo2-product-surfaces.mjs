// Run existing product builders in an isolated canonical shadow. Incremental
// technical writes replace scoped securities only; no production store write.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {assertShadowRoot,runExistingProcess} from './tiingo2-fundamentals.mjs';
import {writeUniverse,COLUMNS} from '../screener/build-universe.mjs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const digest=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
export function mergeTechnicalProjection(baseline,increment,tickers){
 const scope=new Set(tickers),result={...baseline,...increment};
 for(const key of ['instruments','unavailable'])if(baseline?.[key]||increment?.[key]){
  result[key]={...baseline?.[key]};for(const ticker of scope)delete result[key][ticker];
  for(const [ticker,row] of Object.entries(increment?.[key]||{})){
   if(!scope.has(ticker))throw Error('OUT_OF_SCOPE_TECHNICAL_WRITE:'+ticker);
   result[key][ticker]=row;
  }
 }
 if(baseline?.results||increment?.results){
  for(const row of increment?.results||[])if(!scope.has(row.ticker))throw Error('OUT_OF_SCOPE_SIGNAL_WRITE:'+row.ticker);
  result.results=[...(baseline?.results||[]).filter(r=>!scope.has(r.ticker)),...(increment?.results||[])].sort((a,b)=>a.ticker.localeCompare(b.ticker));
  result.events=result.results.filter(r=>r.state==='AVAILABLE').flatMap(r=>r.events||[]).sort((a,b)=>b.asOf.localeCompare(a.asOf)||a.ticker.localeCompare(b.ticker));
  const available=result.results.filter(r=>r.state==='AVAILABLE').length;
  result.counts={requested:result.results.length,available,unavailable:result.results.length-available};
 }
 return result;
}
export async function materializeProductSurfaces({shadowRoot,marketStoreDir,tickers,privateDir,now=new Date().toISOString(),onProgress=()=>{}}){
 shadowRoot=assertShadowRoot(shadowRoot);privateDir=resolve(privateDir);mkdirSync(privateDir,{recursive:true});
 const scope=[...new Set(tickers)].sort(),regime=join(shadowRoot,'quant/data/product/market-regime-v1.json'),regimeBefore=digest(regime);
 // Call the exported scoped API: its default CLI would enumerate every
 // existing stock while our incremental private history contains new listings.
 const technicalDir=join(privateDir,'technical-increment'),runner=join(privateDir,'technical-runner.mjs');
 writeFileSync(runner,`import {materialize} from ${JSON.stringify('file://'+join(shadowRoot,'scripts/technical/materialize-product-intelligence.mjs'))};\nconst r=materialize({tickers:${JSON.stringify(scope)},workDir:${JSON.stringify(marketStoreDir)},outDir:${JSON.stringify(technicalDir)}});console.log(JSON.stringify(r.counts));\n`);
 const technicalProcess=await runExistingProcess(process.execPath,[runner,'--root',shadowRoot,'--now',now],{cwd:shadowRoot,onProgress});
 if(technicalProcess.code!==0)throw Error('TECHNICAL_PRODUCT_BUILDER_FAILED:'+technicalProcess.output.slice(-1200));
 const incrementSummary=load(join(technicalDir,'summary.json')),target=join(shadowRoot,'quant/data/product/technical-signals-v1');mkdirSync(target,{recursive:true});
 for(const name of readdirSync(technicalDir).filter(n=>n.endsWith('.json.gz'))){
  const path=join(target,name),baseline=existsSync(path)?JSON.parse(gunzipSync(readFileSync(path))):{},increment=JSON.parse(gunzipSync(readFileSync(join(technicalDir,name))));
  const merged=mergeTechnicalProjection(baseline,increment,scope);
  writeFileSync(path,gzipSync(Buffer.from(JSON.stringify(merged)),{level:9,mtime:0}));
 }
 const summaryPath=join(target,'summary.json'),baselineSummary=existsSync(summaryPath)?load(summaryPath):{},summary={...baselineSummary,generatedAt:now,rows:{...baselineSummary.rows,...incrementSummary.rows},incremental:{scope,counts:incrementSummary.counts,source:incrementSummary.source}};
 summary.counts={...baselineSummary.counts,productUniverse:Object.keys(summary.rows).length,technicalFullBundles:Object.values(summary.rows).filter(r=>r.technical==='AVAILABLE').length,signalsCapable:Object.values(summary.rows).filter(r=>r.signals==='AVAILABLE').length};
 writeFileSync(summaryPath,JSON.stringify(summary));
 // Both builders reuse the full canonical shadow population, rather than
 // maintaining per-product ticker lists. Discover's destructive cleanup is
 // confined to its copied shadow output directory.
 const discoverProcess=await runExistingProcess(process.execPath,[join(shadowRoot,'scripts/discover/build-discover-data.mjs')],{cwd:shadowRoot,onProgress});
 if(discoverProcess.code!==0)throw Error('DISCOVER_BUILDER_FAILED:'+discoverProcess.output.slice(-1200));
 const screener=await writeUniverse({root:shadowRoot,out:join(shadowRoot,'screener/data'),log:onProgress});
 const universe=load(join(shadowRoot,'screener/data/universe-US_REAL.json')),columns=universe.columns||COLUMNS;
 const screenerRows=new Map((universe.cols?.s||[]).map((ticker,i)=>[ticker,Object.fromEntries(columns.map(c=>[c,universe.cols[c][i]]))]));
 const rows=scope.map(ticker=>{
  const technical=incrementSummary.rows[ticker]||{},stockPath=join(shadowRoot,'discover/data/stocks/US_REAL',ticker+'.json'),stock=existsSync(stockPath)?load(stockPath):null,row=screenerRows.get(ticker);
  return {ticker,discover:{ready:!!stock,eligible:stock?.discoveryEligible??null,artifact:stock?'discover/data/stocks/US_REAL/'+ticker+'.json':null},screener:{ready:!!row,missingValuesRemainNull:true},supertrader:{ready:technical.technical==='AVAILABLE'&&technical.signals==='AVAILABLE',status:technical.technical==='AVAILABLE'&&technical.signals==='AVAILABLE'?'SUPERTRADER_READY':technical.signals==='AVAILABLE'?'TECHNICAL_ONLY':'BLOCKED',technical:technical.technical||'SOURCE_MISSING',signals:technical.signals||'SOURCE_MISSING',bars:technical.bars??null},markets:{ready:!!stock&&!!row,exchange:row?.ex??null,sector:row?.sec??null,industry:stock?.industry??null}};
 });
 if(digest(regime)!==regimeBefore)throw Error('MARKET_REGIME_BASELINE_CHANGED');
 return {schemaVersion:'tiingo2-product-surfaces-1.0.0',rows,screener,technical:incrementSummary.counts,marketRegimeUnchanged:true,productionWrites:0};
}
