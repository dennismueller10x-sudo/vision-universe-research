import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {assessEvidence} from '../../../scripts/market/tiingo2-evidence.mjs';
const source=join(dirname(fileURLToPath(import.meta.url)),'../../..'),Company=createRequire(import.meta.url)('../../engines/company-master.js');
const digest=x=>createHash('sha256').update(x).digest('hex'),today='2026-10-02';
function save(root,path,doc){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(doc));return file;}
export function productizationFixture(fn,{baselineTicker='BASE'}={}){const root=mkdtempSync(join(tmpdir(),'vu-productize-'));let asynchronous=false;try{
 cpSync(join(source,'quant/engines'),join(root,'quant/engines'),{recursive:true});
 cpSync(join(source,'quant/config/company-master.json'),join(root,'quant/config/company-master.json'),{recursive:true});
 mkdirSync(join(root,'scripts/universe'),{recursive:true});for(const name of ['build-company-master.mjs','company-master-snapshot-replay.mjs'])cpSync(join(source,'scripts/universe',name),join(root,'scripts/universe',name));
 const raw={ticker:baselineTicker,securityId:'ref_'+baselineTicker,exchange:'NASDAQ',assetType:'Stock',currency:'USD',company:'Baseline Inc.',active:true,startDate:'2000-01-01'};
 const baseline=Company.toInstrument({...raw,name:raw.company},{today:'2026-09-01',provider:'tiingo'});Company.applyEligibility(baseline,{securityId:raw.securityId,product_eligibility:'ELIGIBLE',instrument_type:'EQUITY_COMMON'});
 baseline.firstSeen='2026-09-01';
 save(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json',{securities:[raw]});
 save(root,'quant/data/market/security-master/eligibility.json',{decisions:[{...raw,instrument_type:'EQUITY_COMMON',product_eligibility:'ELIGIBLE'}],counts:{universeMembers:1,productUniverse:1,ELIGIBLE:1,SEPARATE_CLASS:0,REVIEW:0,EXCLUDED:0}});
 const baselineShard=Company.shardKey(baselineTicker);
 save(root,'quant/data/market/security-master/company-names.json',{rows:[{ticker:baselineTicker,securityId:raw.securityId,companyName:raw.company,status:'RESOLVED',inProductUniverse:true}]});
 save(root,'quant/data/universe/instruments/'+baselineShard+'.json',{shard:baselineShard,engine:Company.VERSION,count:1,instruments:[baseline]});
 save(root,'quant/data/universe/master-manifest.json',{totals:{providerRows:1,ingested:1,inMaster:1,published:1},identifiers:{},shards:{count:1,index:[{shard:baselineShard,count:1}]}});
 const sourceRun=join(root,'.verification/accepted'),sourceCache=join(root,'.market-cache/tiingo2'),workDir=join(root,'.market-cache/tiingo2-productization');
 const bars=['2026-09-01','2026-09-02','2026-10-01'].map(date=>({date,open:10,high:10,low:10,close:10,volume:100,adjOpen:10,adjHigh:10,adjLow:10,adjClose:10,adjVolume:100,splitFactor:1,divCash:0}));
 const metadata={ticker:'IPO',name:'IPO Corporation',startDate:'2026-09-01',exchangeCode:'NASDAQ'},summary=assessEvidence(bars,{ticker:'IPO',today,currency:'USD',metadata});
 const price={...summary.price,historyValid:true,latestValid:true,corporateActionValid:true};
 const policyRow={ticker:'IPO',securityId:'ref_IPO',companyName:'IPO Corporation',decision:'AUTO_ACCEPT',publicationReady:true,policy:{instrumentType:'EQUITY_COMMON'},evidence:{identity:{resolved:true},price,sec:{cik:null,available:false,pitValid:false},factors:{materialized:false,basisValid:true},source:summary.source}};
 save(root,'.verification/accepted/tiingo2_consumer_policy_report.json',{rows:[policyRow]});
 save(root,'.verification/accepted/tiingo2_publication_preview.json',{ADDED:[{ticker:'IPO',securityId:'ref_IPO',quantReady:false}],REMOVED:[]});
 save(root,'.verification/accepted/tiingo2_fresh_discovery.json',{records:[{ticker:'IPO',exchange:'NASDAQ',assetType:'Stock',currency:'USD',active:true,startDate:'2026-09-01',endDate:'2026-10-01'}]});
 const key=digest('isolated-price-cache');save(root,'.market-cache/tiingo2/evidence/'+key+'.json',{key,metadata,rows:bars,summary});
 const result=fn({root,sourceRun,sourceCache,workDir,baseline,bars,key,metadata,summary});
 if(result&&typeof result.finally==='function'){asynchronous=true;return result.finally(()=>rmSync(root,{recursive:true,force:true}));}
 return result;
}finally{if(!asynchronous)rmSync(root,{recursive:true,force:true});}}
