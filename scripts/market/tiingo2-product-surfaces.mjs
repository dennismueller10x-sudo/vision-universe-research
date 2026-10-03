// Run existing product builders in an isolated canonical shadow. Incremental
// technical writes replace scoped securities only; no production store write.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertShadowRoot,runExistingProcess} from './tiingo2-fundamentals.mjs';
import {writeUniverse,COLUMNS} from '../screener/build-universe.mjs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const digest=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
function nativeHistoricalInputs(root){
 const files=['quant/data/product/pattern-research-v1/study.json','quant/data/product/pattern-research-fundamentals-v1/study.json'];
 const walk=dir=>{if(!existsSync(join(root,dir)))return;for(const name of readdirSync(join(root,dir),{withFileTypes:true})){const path=join(dir,name.name);if(name.isDirectory())walk(path);else files.push(path);}};
 walk('quant/data/product/factor-evidence-history');
 return Object.fromEntries(files.map(path=>[path,digest(join(root,path))]));
}
function patternRows(root){
 const dir=join(root,'quant/data/product/pattern-match-v1'),rows={};
 if(!existsSync(dir))return rows;
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.json.gz'))){const shard=JSON.parse(gunzipSync(readFileSync(join(dir,name))));for(const kind of ['instruments','unavailable'])for(const [ticker,row]of Object.entries(shard[kind]||{})){if(rows[ticker])throw Error('DUPLICATE_NATIVE_PATTERN_IDENTITY:'+ticker);rows[ticker]={kind,row};}}
 return rows;
}
export function assertBaselinePatternProjections(before,after,{allowedTickers=[],scope=[]}={}){
 const allowed=new Set(allowedTickers.filter(ticker=>scope.includes(ticker)));
 for(const [ticker,entry]of Object.entries(before))if(!allowed.has(ticker)&&!isDeepStrictEqual(entry,after[ticker]))throw Error('BASELINE_PATTERN_PROJECTION_CHANGED:'+ticker);
}
export function mergeTechnicalProjection(baseline,increment,tickers){
 const scope=new Set(tickers),result={...baseline,...increment};
 const preserved=new Set([...scope].filter(t=>baseline?.instruments?.[t]&&!increment?.instruments?.[t]));
 for(const key of ['instruments','unavailable'])if(baseline?.[key]||increment?.[key]){
  result[key]={...baseline?.[key]};for(const ticker of scope)if(!preserved.has(ticker))delete result[key][ticker];
  for(const [ticker,row] of Object.entries(increment?.[key]||{})){
   if(!scope.has(ticker))throw Error('OUT_OF_SCOPE_TECHNICAL_WRITE:'+ticker);
   if(!preserved.has(ticker))result[key][ticker]=row;
  }
 }
 if(baseline?.results||increment?.results){
  for(const row of increment?.results||[])if(!scope.has(row.ticker))throw Error('OUT_OF_SCOPE_SIGNAL_WRITE:'+row.ticker);
  const oldResults=new Map((baseline?.results||[]).map(r=>[r.ticker,r]));
  for(const row of increment?.results||[])if(row.state==='AVAILABLE'||oldResults.get(row.ticker)?.state!=='AVAILABLE')oldResults.set(row.ticker,row);
  result.results=[...oldResults.values()].sort((a,b)=>a.ticker.localeCompare(b.ticker));
  result.events=result.results.filter(r=>r.state==='AVAILABLE').flatMap(r=>r.events||[]).sort((a,b)=>b.asOf.localeCompare(a.asOf)||a.ticker.localeCompare(b.ticker));
  const available=result.results.filter(r=>r.state==='AVAILABLE').length;
  result.counts={requested:result.results.length,available,unavailable:result.results.length-available};
 }
 return result;
}
export async function materializeProductSurfaces({shadowRoot,marketStoreDir,tickers,freshPriceTickers=[],privateDir,now=new Date().toISOString(),onProgress=()=>{}}){
 shadowRoot=assertShadowRoot(shadowRoot);privateDir=resolve(privateDir);mkdirSync(privateDir,{recursive:true});
 const scope=[...new Set(tickers)].sort(),regime=join(shadowRoot,'quant/data/product/market-regime-v1.json'),regimeBefore=digest(regime);
 // The new listing has no prior technical bundle. SOURCE_MISSING is the
 // existing engine's recheckable state, unlike null, which vetoes analysis.
 // Only independently price/action-validated private histories may be retried;
 // the existing engine still checks bars, calendar and every output component.
 const fresh=new Set(freshPriceTickers),capabilityPath=join(shadowRoot,'quant/data/universe/market-capability.json'),capability=load(capabilityPath);
 for(const member of capability.members)if(fresh.has(member.s)&&scope.includes(member.s))member.t='SOURCE_MISSING';
 writeFileSync(capabilityPath,JSON.stringify(capability));
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
 const summaryPath=join(target,'summary.json'),baselineSummary=existsSync(summaryPath)?load(summaryPath):{},mergedRows={...baselineSummary.rows};
 const existingAvailablePreserved=[];
 for(const [ticker,row]of Object.entries(incrementSummary.rows)){
  const baseline=mergedRows[ticker];
  if(baseline?.technical==='AVAILABLE'&&row.technical!=='AVAILABLE')existingAvailablePreserved.push(ticker);
  else mergedRows[ticker]={...row,...(baseline?.signals==='AVAILABLE'&&row.signals!=='AVAILABLE'?{signals:baseline.signals,signalsAsOf:baseline.signalsAsOf||baseline.asOf,preservedSignalEvidence:true}: {})};
 }
 const summary={...baselineSummary,generatedAt:now,rows:mergedRows,incremental:{scope,counts:incrementSummary.counts,source:incrementSummary.source,existingAvailablePreserved}};
 summary.counts={...baselineSummary.counts,productUniverse:Object.keys(summary.rows).length,technicalFullBundles:Object.values(summary.rows).filter(r=>r.technical==='AVAILABLE').length,signalsCapable:Object.values(summary.rows).filter(r=>r.signals==='AVAILABLE').length};
 writeFileSync(summaryPath,JSON.stringify(summary));
 // Both builders reuse the full canonical shadow population, rather than
 // maintaining per-product ticker lists. Discover's destructive cleanup is
 // confined to its copied shadow output directory.
 const discoverProcess=await runExistingProcess(process.execPath,[join(shadowRoot,'scripts/discover/build-discover-data.mjs')],{cwd:shadowRoot,onProgress});
 if(discoverProcess.code!==0)throw Error('DISCOVER_BUILDER_FAILED:'+discoverProcess.output.slice(-1200));
 const screener=await writeUniverse({root:shadowRoot,out:join(shadowRoot,'screener/data'),log:onProgress});
 // These existing readers derive current membership and predicates from the
 // same canonical outputs above. Reusing yesterday's native projections
 // would hide new securities and leave Strategy/Watchlist breadth stale.
 // Historical studies and published factor snapshots remain read-only.
 const historicalBefore=nativeHistoricalInputs(shadowRoot);
 const patternsBefore=patternRows(shadowRoot);
 for(const script of ['scripts/market/build-capability-matrix.mjs','scripts/vu2/build-product-capabilities.mjs','scripts/quant/build-strategy-index.mjs','scripts/quant/build-pattern-match.mjs']){
  const built=await runExistingProcess(process.execPath,[join(shadowRoot,script)],{cwd:shadowRoot,onProgress});
  if(built.code!==0)throw Error('NATIVE_PRODUCT_PROJECTION_BUILDER_FAILED:'+script+':'+built.output.slice(-1200));
 }
 if(JSON.stringify(nativeHistoricalInputs(shadowRoot))!==JSON.stringify(historicalBefore))throw Error('NATIVE_PROJECTION_HISTORICAL_INPUT_CHANGED');
 assertBaselinePatternProjections(patternsBefore,patternRows(shadowRoot),{allowedTickers:[...fresh],scope});
 const nativeCapabilities=load(join(shadowRoot,'quant/data/product/capabilities-summary-v1.json'));
 const nativeStrategy=JSON.parse(gunzipSync(readFileSync(join(shadowRoot,'quant/data/product/strategy-index-v1.json.gz'))));
 const nativePatterns=load(join(shadowRoot,'quant/data/product/pattern-match-v1/summary.json'));
 const universe=load(join(shadowRoot,'screener/data/universe-US_REAL.json')),columns=universe.columns||COLUMNS;
 const screenerRows=new Map((universe.cols?.s||[]).map((ticker,i)=>[ticker,Object.fromEntries(columns.map(c=>[c,universe.cols[c][i]]))]));
 const rows=scope.map(ticker=>{
  const technical=incrementSummary.rows[ticker]||{},stockPath=join(shadowRoot,'discover/data/stocks/US_REAL',ticker+'.json'),stock=existsSync(stockPath)?load(stockPath):null,row=screenerRows.get(ticker);
  return {ticker,discover:{ready:!!stock,eligible:stock?.discoveryEligible??null,artifact:stock?'discover/data/stocks/US_REAL/'+ticker+'.json':null},screener:{ready:!!row,missingValuesRemainNull:true},supertrader:{ready:technical.technical==='AVAILABLE'&&technical.signals==='AVAILABLE',status:technical.technical==='AVAILABLE'&&technical.signals==='AVAILABLE'?'SUPERTRADER_READY':technical.signals==='AVAILABLE'?'TECHNICAL_ONLY':'BLOCKED',technical:technical.technical||'SOURCE_MISSING',signals:technical.signals||'SOURCE_MISSING',bars:technical.bars??null},markets:{ready:!!stock&&!!row,exchange:row?.ex??null,sector:row?.sec??null,industry:stock?.industry??null}};
 });
 if(digest(regime)!==regimeBefore)throw Error('MARKET_REGIME_BASELINE_CHANGED');
 return {schemaVersion:'tiingo2-product-surfaces-1.0.0',rows,screener,technical:incrementSummary.counts,existingAvailablePreserved,marketRegimeUnchanged:true,nativeProjections:{productUniverse:nativeCapabilities.counts.productUniverse,strategyUniverse:nativeStrategy.universe,patternsAvailable:nativePatterns.instruments,patternsUnavailable:nativePatterns.unavailable.total,patternUnavailableReasons:nativePatterns.unavailable.reasons,historicalInputsUnchanged:true},productionWrites:0};
}
