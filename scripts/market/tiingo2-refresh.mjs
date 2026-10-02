/** Daily incremental staging. A discovery row never becomes a production row. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {discoverTiingo,diffUniverses} from './tiingo2-discovery.mjs';
import {resolveProductUniverse} from './universe-source.mjs';
import {resolveListingIdentities,trackNewListings} from './tiingo2-identity.mjs';
import {buildPolicyReport,previewPublication,evaluateConsumerPolicy} from './tiingo2-policy.mjs';
import {collectEvidence} from './tiingo2-evidence.mjs';
const require=createRequire(import.meta.url),Master=require('../../quant/engines/us-security-master.js'),Company=require('../../quant/engines/company-master.js');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function write(p,x){mkdirSync(dirname(p),{recursive:true});writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');renameSync(p+'.tmp',p);}
const fold=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function issuerNameKey(value){
 return String(value||'').toUpperCase().split(/\s+-\s+|\bCLASS\s+[A-Z0-9]\b|\bCOMMON\s+(?:STOCK|SHARES)\b|\bORDINARY\s+SHARES\b|\bAMERICAN\s+DEPOSITARY\b|\bADS\b|\bADR\b/)[0]
  .replace(/[^A-Z0-9 ]/g,' ').replace(/\b(?:INCORPORATED|INC|CORPORATION|CORP|LIMITED|LTD|PLC|LLC)\b/g,'').replace(/\s+/g,'').trim();
}
const listingKey=r=>[r.exchange,r.ticker,r.startDate].join('|');
const targets=['DNA','AMC','BIRD','AMWL','CART','CRCL','FIG','FLY','Q','SNDK','VLTO','SKHY'];
export function parseExchangeDirectory(text,source){
 const lines=text.trim().split(/\r?\n/),fields=lines.shift().split('|'),symbolField=source==='nasdaqlisted'?'Symbol':'ACT Symbol',rows=[];
 if(!fields.includes(symbolField)||!fields.includes('Security Name'))throw Error('INVALID_EXCHANGE_DIRECTORY');
 for(const line of lines){if(line.startsWith('File Creation Time:'))continue;const cells=line.split('|');if(cells.length!==fields.length)throw Error('INVALID_EXCHANGE_DIRECTORY_ROW');
  const r=Object.fromEntries(fields.map((f,i)=>[f,cells[i]]));rows.push({ticker:r[symbolField].replaceAll('.','-'),name:r['Security Name'],etf:r.ETF,test:r['Test Issue'],
   exchange:source==='nasdaqlisted'?'NASDAQ':({N:'NYSE',A:'AMEX',P:'NYSE ARCA',Z:'BATS',V:'IEX'}[r.Exchange]||r.Exchange),source});}
 return rows;
}
async function directories({workDir,today,fetchImpl=fetch,offline=false}){
 const rows=[];
 for(const name of ['nasdaqlisted','otherlisted']){const file=join(workDir,'directories',today+'-'+name+'.txt');
  if(!existsSync(file)&&!offline){const response=await fetchImpl('https://www.nasdaqtrader.com/dynamic/SymDir/'+name+'.txt',{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('EXCHANGE_DIRECTORY_HTTP_'+response.status);
   const text=await response.text();parseExchangeDirectory(text,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}
  if(existsSync(file))rows.push(...parseExchangeDirectory(readFileSync(file,'utf8'),name));}
 return new Map(rows.map(r=>[r.ticker,r]));
}
export function selectCurrentListings(records,today){
 const primary=new Set(Object.keys(Master.US_PRIMARY_EXCHANGES)),groups=new Map();
 for(const r of records){if(r.assetType!=='Stock'||!primary.has(r.exchange)||!r.active)continue;const key=r.ticker;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const selected=[],ambiguous=[];
 for(const rows of groups.values()){const unique=new Map();for(const r of rows){const key=listingKey(r);if(!unique.has(key)||String(r.endDate)>String(unique.get(key).endDate))unique.set(key,r);}
  if(unique.size===1)selected.push([...unique.values()][0]);else ambiguous.push({ticker:rows[0].ticker,reason:'MULTIPLE_ACTIVE_LISTING_PERIODS',records:rows.map(r=>r.recordId)});}
 return {selected:selected.sort((a,b)=>a.ticker.localeCompare(b.ticker)),ambiguous};
}
export async function runRefresh({root=process.cwd(),workDir=join(root,'.market-cache/tiingo2'),runId,today=new Date().toISOString().slice(0,10),fromZip,offline=false,probe=false,maxSymbols=750,fetchImpl=fetch,onProgress=()=>{}}={}){
 root=resolve(root);workDir=resolve(workDir);
 if(!workDir.startsWith(join(root,'.market-cache')+'/'))throw Error('PRIVATE_WORK_DIR_REQUIRED');
 const baselineFiles=['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json','quant/data/market/security-master/company-names.json','quant/data/universe/cik-map.json'];
 const baselineHashes=Object.fromEntries(baselineFiles.map(p=>[p,sha(readFileSync(join(root,p)))]));
 const rawDoc=read(join(root,baselineFiles[0])),raw=rawDoc.securities,product=resolveProductUniverse(root).securities,consumer=product.filter(r=>r.consumer),
  decisions=read(join(root,baselineFiles[1])).decisions,names=read(join(root,baselineFiles[2])).rows,ciks=read(join(root,baselineFiles[3])).byTicker;
 const current=readdirSync(join(root,'quant/data/universe/instruments')).filter(x=>x.endsWith('.json')).flatMap(p=>read(join(root,'quant/data/universe/instruments',p)).instruments);
 if(offline&&!fromZip)throw Error('OFFLINE_DISCOVERY_SOURCE_REQUIRED');
 const priorPath=join(workDir,'discovery/latest.json');
 const contextKey=sha(runId||today),contextFile=join(workDir,'contexts',contextKey+'.json');
 const prior=existsSync(contextFile)?read(contextFile).previousDiscovery:existsSync(priorPath)?read(priorPath):null;
 if(!existsSync(contextFile))write(contextFile,{previousDiscovery:prior});
 const discovery=await discoverTiingo({workDir:join(workDir,'discovery'),runId,asOf:today,fromZip,force:!fromZip&&!offline,fetchImpl});
 const out=join(workDir,'runs',discovery.runId),directory=await directories({workDir,today,fetchImpl,offline}),roots=Master.collectListedRoots(discovery.records,raw),rawMap=new Map(raw.map(r=>[r.ticker,r])),decisionMap=new Map(decisions.map(r=>[r.ticker,r])),nameMap=new Map(names.map(r=>[r.ticker,r.companyName]));
 const initialMaster=Master.buildSecurityMaster({providerRows:discovery.records,baseline:raw,today,providerAvailable:true}),auditCandidates=initialMaster.rows.filter(r=>r.venue_tier==='PRIMARY'&&r.active_status==='ACTIVE'&&r.instrument_type==='EQUITY_COMMON'&&r.eligible_us_equity&&!rawMap.has(r.ticker));
 const {selected,ambiguous}=selectCurrentListings(discovery.records,today),selectedMap=new Map(selected.map(r=>[r.ticker,r]));
 const gapTickers=new Set(auditCandidates.map(r=>r.ticker));
 const skipped=read(join(root,'quant/data/market/factors/factors-FULL_UNIVERSE.json')).skipped;
 const retryTickers=new Set(skipped.map(r=>r.ticker));
 const consumerSet=new Set(consumer.map(r=>r.ticker));
 const toCheck=selected.filter(r=>{
  if(gapTickers.has(r.ticker)||targets.includes(r.ticker)||retryTickers.has(r.ticker)&&consumerSet.has(r.ticker))return true;
  // Recheck a baseline exclusion only if current evidence contradicts its form.
  if(!rawMap.has(r.ticker)||consumerSet.has(r.ticker))return false;
  const name=directory.get(r.ticker)?.name||nameMap.get(r.ticker)||ciks[r.ticker]?.name;
  const currentType=Master.classifySecurity({...r,name},{today,listedRoots:roots}).instrumentType;
  return ['EQUITY_COMMON','ADR'].includes(currentType);
 });
 // Known false rejections first. Budget exhausted candidates stay pending.
 toCheck.sort((a,b)=>(targets.includes(b.ticker)?1:0)-(targets.includes(a.ticker)?1:0)||a.ticker.localeCompare(b.ticker));
 const collected=probe?await collectEvidence(toCheck,{workDir,today,maxSymbols,fetchImpl,onProgress}):{results:new Map(),requests:0,completed:0,pending:toCheck.length,stopped:probe?null:'PROBES_NOT_REQUESTED'};
 const identity=resolveListingIdentities({fresh:selected,current,asOf:today}),identityMap=new Map(identity.decisions.map(d=>[[d.exchange,d.ticker,d.startDate].join('|'),d]));
 const candidateRows=[];
 for(const listing of toCheck){
  const t=listing.ticker,official=directory.get(t),observed=collected.results.get(t),meta=observed?.metadata,sec=ciks[t],base=rawMap.get(t),old=decisionMap.get(t),identityDecision=identityMap.get(listingKey(listing));
  const name=official?.name||meta?.name||nameMap.get(t)||sec?.name||null;
  const classification=Master.classifySecurity({...listing,name},{today,listedRoots:roots});
  const explicitForm=!!official&&official.etf==='N'&&official.test==='N'&&/\b(common (stock|shares|subordinate)|ordinary shares|subordinate voting shares|depositary|depository|\bADS\b|\bADR\b)\b/i.test(official.name);
  const venueOK=!!official&&official.exchange===listing.exchange&&(!meta?.exchange||meta.exchange===listing.exchange);
  const periodOK=!!meta&&meta.startDate===listing.startDate;
  const namesAgree=!!issuerNameKey(meta?.name)&&issuerNameKey(meta?.name)===issuerNameKey(official?.name);
  const providerSymbolMatched=String(meta?.ticker||'').toUpperCase()===t;
  const legacyId=base?.securityId||'ref_'+t.replace(/[^A-Z0-9]/g,'_'),idCollision=raw.some(r=>r.securityId===legacyId&&r.ticker!==t)||current.some(r=>(r.legacyIds||[]).includes(legacyId)&&r.symbol!==t);
  const identityOK=['NEW_SECURITY','EXISTING'].includes(identityDecision?.state)&&!identityDecision?.reviewRequired&&periodOK&&venueOK&&namesAgree&&explicitForm&&!idCollision&&providerSymbolMatched;
  const secNameOK=!!issuerNameKey(sec?.name)&&issuerNameKey(sec?.name)===issuerNameKey(meta?.name);
  const secFile=sec?join(root,'quant/data/sec/consumer/CIK'+sec.cik+'.json'):null,secData=secFile&&existsSync(secFile)?read(secFile):null;
  // Existing PIT artifacts alone do not certify new issuer fundamentals.
  const secReady=secNameOK&&secData?.policy==='as_of_latest'&&secData?.dataSource?.isMock===false&&Object.values(secData.quarterly||{}).some(rows=>rows?.length);
  const evidence={identity:{resolved:identityOK,symbolCollision:idCollision,staleAlias:!!meta&&!providerSymbolMatched,wrongExchange:!!official&&!venueOK,listingPeriodMatched:periodOK,providerSymbolMatched,nameAgreement:namesAgree,explicitShareForm:explicitForm,state:identityDecision?.state||'UNKNOWN'},
   price:observed?.price||{},corporateActions:observed?.corporateActions||null,sec:{cik:secNameOK?sec?.cik:null,available:secReady,pitValid:false},factors:observed?.marketFactors||{},products:{discoverReady:false,screenerReady:false,superTraderReady:false},source:observed?.source||null};
  candidateRows.push({...listing,securityId:legacyId,companyName:meta?.name||name,instrument_type:classification.instrumentType,classification,
   reason:gapTickers.has(t)?'STATIC_SNAPSHOT_MISS':!consumer.some(c=>c.ticker===t)?'CLASSIFICATION_REVIEW':'CORPORATE_ACTION_GATE_REVALIDATION',existingDecision:old||null,evidence});
 }
 // Every historical audit candidate is accounted for, including unresolved active collisions.
 for(const r of auditCandidates)if(!candidateRows.some(c=>c.ticker===r.ticker))candidateRows.push({ticker:r.ticker,exchange:r.exchange,startDate:r.start_date,securityId:null,instrument_type:r.instrument_type,active_status:r.active_status,evidence:{identity:{resolved:false,symbolCollision:true}},reason:'SYMBOL_COLLISION'});
 const policy=buildPolicyReport(candidateRows,{today,baselineConsumerRows:consumer,peers:raw});
 const inputByTicker=new Map(candidateRows.map(r=>[r.ticker,r]));
 for(const row of policy.rows){const original=inputByTicker.get(row.ticker);row.exclusionCategory=original.reason==='STATIC_SNAPSHOT_MISS'?(original.startDate>='2026-09-01'?'NEW_LISTING_MISS':'STATIC_SNAPSHOT_MISS'):
  original.reason==='CORPORATE_ACTION_GATE_REVALIDATION'?'CORPORATE_ACTION_GATE_REVALIDATION':original.existingDecision?.instrument_type==='PREFERRED'&&row.policy.included?'PREFERRED_FALSE_POSITIVE':'OTHER';
  row.previousExclusionReason=original.existingDecision?.product_eligibility_reason||null;row.previousInstrumentType=original.existingDecision?.instrument_type||null;}
 const preview=previewPublication(consumer,policy.rows),diff=diffUniverses({discovery,raw,product,consumer,previousDiscovery:prior,symbolChanges:identity.symbolChanges});
 const staged=policy.rows.filter(r=>gapTickers.has(r.ticker)),falseExclusions=policy.rows.filter(r=>!consumer.some(c=>c.ticker===r.ticker)||targets.slice(0,4).includes(r.ticker));
 const newListings=trackNewListings({fresh:selected,previous:existsSync(join(workDir,'listing-registry.json'))?read(join(workDir,'listing-registry.json')):[],discoveredAt:discovery.discoveryTimestamp,runId:discovery.runId});
 const unchanged=baselineFiles.every(p=>sha(readFileSync(join(root,p)))===baselineHashes[p]);
 if(!unchanged)throw Error('PROTECTED_BASELINE_CHANGED');
 const summary={schemaVersion:1,runId:discovery.runId,asOf:today,discovery:discovery.counts,current:{raw:raw.length,product:product.length,consumer:consumer.length},auditCandidateRecords:auditCandidates.length,auditCandidateSymbols:gapTickers.size,
  staged:policy.counts,proposedConsumer:preview.counts.after,added:preview.ADDED.map(r=>r.ticker),removed:[],quantReadyAdded:preview.ADDED.filter(r=>r.quantReady).map(r=>r.ticker),
  evidence:{requests:collected.requests,completed:collected.completed,pending:collected.pending,stopped:collected.stopped},protectedBaseline:{unchanged,hashes:baselineHashes},productionMutations:0,
  publication:{state:'BLOCKED',reasons:['CANONICAL_PROJECTION_AND_RELEASE_QA_REQUIRED','FUNDAMENTAL_PIT_AND_PRODUCT_CAPABILITY_CHECKS_PENDING'],automaticProductionPublication:false},ambiguousListings:ambiguous.length};
 const artifacts={'tiingo2_fresh_discovery.json':discovery,'tiingo2_universe_diff.json':diff,'tiingo2_staged_candidates.json':{runId:discovery.runId,auditCandidateRecords:auditCandidates.length,rows:staged},
  'tiingo2_false_exclusions.json':{runId:discovery.runId,scope:'ACTIVE_US_PRIMARY_COMMON_AND_ADR_CANDIDATES_AND_MATERIALIZATION_RETRIES',rows:falseExclusions},
  'tiingo2_split_false_rejections.json':{runId:discovery.runId,rows:policy.rows.filter(r=>retryTickers.has(r.ticker)||targets.slice(0,4).includes(r.ticker))},
  'tiingo2_new_listings.json':newListings,'tiingo2_symbol_changes.json':identity,'tiingo2_consumer_policy_report.json':policy,'tiingo2_publication_preview.json':preview,'tiingo2_final_universe_summary.json':summary};
 for(const [name,value]of Object.entries(artifacts))write(join(out,name),value);
 write(join(workDir,'listing-registry.json'),newListings);
 write(join(out,'VU_FALSE_EXCLUSIONS.json'),artifacts['tiingo2_false_exclusions.json']);
 return {summary,out,policy,preview,candidateRows};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
 const result=await runRefresh({runId:arg('--run-id'),today:arg('--today'),workDir:arg('--work-dir'),fromZip:arg('--from-zip'),offline:args.includes('--offline'),probe:args.includes('--probe'),maxSymbols:arg('--max-symbols')?Number(arg('--max-symbols')):750,onProgress:x=>{if(x.completed%25===0)console.log(JSON.stringify(x));}});
 console.log(JSON.stringify({out:result.out,summary:result.summary}));
}
