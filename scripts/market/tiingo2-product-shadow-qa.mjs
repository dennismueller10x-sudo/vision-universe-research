// Compare actual materialized output with immutable accepted-PR identities.
// Export hashes/counts/reason codes only, never provider or factor values.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=p=>{const b=readFileSync(p);return JSON.parse(p.endsWith('.gz')?gunzipSync(b):b);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function runShadowQa({root,shadow,readiness,baseline,out}){
 root=resolve(root);shadow=resolve(shadow);baseline=resolve(baseline);out=resolve(out);
 if(root===shadow)throw Error('ISOLATED_SHADOW_REQUIRED');
 const identities=load(join(baseline,'baseline-identities.json.gz')),files=load(join(baseline,'protected-baseline-files.json.gz')),report=load(readiness),scope=new Set(report.rows.map(r=>r.ticker)),checks=[],findings=[],changes=[];
 const check=(name,ok,details={})=>{const row={name,status:ok?'PASS':'FAIL',...details};checks.push(row);if(!ok)findings.push(row);};
 const records=Array.isArray(files)?files:files.files;let checkedProductionFiles=0;
 for(const f of records){
  if(f.path!=='scripts/vu2/resource-budget.mjs'&&!/^(quant\/data|discover\/data|discover\/logos|supertrader\/data|screener\/data|dashboard\/config|quant\/config)\//.test(f.path))continue;
  checkedProductionFiles++;
  if(!existsSync(join(root,f.path))){findings.push({name:'PROTECTED_PRODUCTION_MISSING',path:f.path});continue;}
  const b=readFileSync(join(root,f.path)),oid=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
  if(oid!==f.gitBlobOid)findings.push({name:'PROTECTED_PRODUCTION_CHANGED',path:f.path});
 }
 check('PROTECTED_PRODUCTION_BASELINE_BYTES',!findings.length,{baselineFiles:checkedProductionFiles});
 const raw=load(join(shadow,'quant/data/market/scale/universe-FULL_UNIVERSE.json')).securities,elig=load(join(shadow,'quant/data/market/security-master/eligibility.json')).decisions,cap=load(join(shadow,'quant/data/universe/market-capability.json')).members,factors=load(join(shadow,'quant/data/market/factors/factors-FULL_UNIVERSE.json')).securities;
 function preserved(name,before,after,keys){const map=new Map(after.map(r=>[keys.map(k=>r[k]).join('|'),r])),missing=before.filter(r=>!map.has(keys.map(k=>r[k]).join('|')));check(name,missing.length===0,{before:before.length,after:after.length,missing:missing.map(r=>r.ticker??r.symbol??r.s)});}
 preserved('RAW_CANONICAL_IDENTITIES',identities.raw,raw,['securityId','ticker']);preserved('CAPABILITY_CANONICAL_IDENTITIES',identities.capability,cap,['m','s','i']);preserved('MARKET_FACTOR_IDENTITIES',identities.marketFactors,factors,['securityId','ticker']);
 const originalFactors=load(join(root,'quant/data/market/factors/factors-FULL_UNIVERSE.json')).securities,newFactors=new Map(factors.map(r=>[r.securityId,r]));
 const changedFactors=originalFactors.filter(r=>!scope.has(r.ticker)&&!eq(r,newFactors.get(r.securityId)));check('UNSCOPED_MARKET_FACTOR_VALUES',!changedFactors.length,{changed:changedFactors.map(r=>r.ticker)});
 const scopedIds=new Set(report.rows.flatMap(r=>[r.securityId,r.securityId.replace(/[.-]/g,'_')])),historyChanges=[];
 for(const f of records.filter(r=>/^quant\/data\/market\/(?:golden-preview\/(?:daily|weekly|monthly)|discover-series(?:-long)?|history)\/.+\.json$/.test(r.path))){const id=f.path.split('/').at(-1).slice(0,-5);if(id==='index'||scopedIds.has(id))continue;const p=join(shadow,f.path);if(!existsSync(p)){historyChanges.push(f.path);continue;}const b=readFileSync(p),oid=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');if(oid!==f.gitBlobOid)historyChanges.push(f.path);}
 check('UNSCOPED_HISTORICAL_PRICE_BYTES',!historyChanges.length,{changed:historyChanges});
 const emap=new Map(elig.map(r=>[r.securityId,r]));const altered=identities.eligibility.filter(r=>!scope.has(r.ticker)&&(!emap.has(r.securityId)||['ticker','product_eligibility','instrument_type'].some(k=>emap.get(r.securityId)[k]!==r[k])));check('UNSCOPED_CONSUMER_POLICY',!altered.length,{changed:altered.map(r=>r.ticker)});
 const instrumentDir=join(shadow,'quant/data/universe/instruments'),instruments=readdirSync(instrumentDir).filter(n=>n.endsWith('.json')).flatMap(n=>load(join(instrumentDir,n)).instruments??[]),imap=new Map(instruments.map(r=>[r.instrumentId,r]));
 const badIdentities=identities.instruments.filter(r=>!imap.has(r.instrumentId)||Object.entries(r).some(([k,v])=>!eq(imap.get(r.instrumentId)[k],v)));check('BASELINE_INSTRUMENT_IDS_URL_ALIASES',!badIdentities.length,{before:identities.instruments.length,after:instruments.length,changed:badIdentities.map(r=>r.symbol)});
 check('UNIQUE_CANONICAL_INSTRUMENT_IDS',imap.size===instruments.length);
 const manifest=load(join(shadow,'quant/data/universe/search/manifest.json'));
 for(const kind of ['sym','name']){
  const referenced=new Set((manifest[kind]??[]).map(r=>r.shard));check('BASELINE_SEARCH_MANIFEST_'+kind.toUpperCase(),identities.searchManifest[kind].every(r=>referenced.has(r.shard)));
  let lost=0;for(const [path,entries]of Object.entries(identities.searchIdentities[kind])){if(!existsSync(join(shadow,path))){lost+=entries.length;continue;}const current=new Set((load(join(shadow,path)).entries??[]).map(r=>r.i+'|'+r.s));lost+=entries.filter(r=>!current.has(r.i+'|'+r.s)).length;}check('BASELINE_SEARCH_ENTRIES_'+kind.toUpperCase(),lost===0,{lost});
 }
 const dna=load(join(shadow,'quant/data/product/factor-evidence-v1/screening.json.gz')),dnaSymbols=new Set(Object.keys(dna.rows??{}));check('BASELINE_FACTOR_DNA_COVERAGE',identities.factorDnaSymbols.every(t=>dnaSymbols.has(t)),{before:identities.factorDnaSymbols.length,after:dnaSymbols.size,missing:identities.factorDnaSymbols.filter(t=>!dnaSymbols.has(t))});
 const logos=load(join(shadow,'discover/logos/index.json'));for(const kind of ['files','wide','dark']){const old=identities.logos[kind]??{},missing=Array.isArray(old)?old.filter(t=>!Array.isArray(logos[kind])||!logos[kind].includes(t)):Object.entries(old).filter(([t,p])=>logos[kind]?.[t]!==p).map(([t])=>t);check('BASELINE_LOGO_MAPPING_'+kind.toUpperCase(),!missing.length,{changed:missing});}
 const screenBefore=load(join(baseline,'generated-screener-baseline.json')),screenAfter=load(join(shadow,'screener/data/universe-US_REAL.json')),screenSet=new Set(screenAfter.cols?.s??[]),symbols=screenBefore.symbols??[];check('BASELINE_SCREENER_MEMBERSHIP',symbols.every(t=>screenSet.has(t)),{before:symbols.length,after:screenSet.size,missing:symbols.filter(t=>!screenSet.has(t))});
 const ranked=load(join(baseline,'baseline-rank-populations.json')).rows;
 for(const [path,previous]of Object.entries(ranked)){const p=join(shadow,path);if(!existsSync(p)){findings.push({name:'BASELINE_DISCOVER_RANK_FILE_MISSING',path});continue;}const d=load(p),current=previous.surfaces?{surfaces:(d.surfaces??[]).map(s=>({id:s.id,symbols:(s.cards??[]).map(c=>c.symbol)}))}:{sort:d.sort,direction:d.direction,symbols:(d.cards??[]).map(c=>c.symbol)};if(!eq(previous,current))changes.push({path,category:'DISCOVER_POPULATION_OR_RANK_CHANGED',before:previous,after:current});}
 for(const f of records.filter(f=>f.path.startsWith('quant/data/product/factor-evidence-v1/'))){const p=join(shadow,f.path);if(existsSync(p)&&f.sha256&&sha(readFileSync(p))!==f.sha256)changes.push({path:f.path,category:'FACTOR_DNA_REBUILT_WITH_CANONICAL_POPULATION',baselineSha256:f.sha256,shadowSha256:sha(readFileSync(p))});}
 const result={schemaVersion:'tiingo2-product-shadow-qa-1',runId:report.runId??null,sourceCommit:identities.sourceCommit,sourceReadinessSha256:sha(readFileSync(readiness)),scope:[...scope].sort(),checks,findings,explicitPopulationChanges:changes,productionWrites:0};mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a;},[]));try{const r=runShadowQa(args);console.log(JSON.stringify({checks:r.checks.length,findings:r.findings.length,populationChanges:r.explicitPopulationChanges.length}));if(r.findings.length)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
