#!/usr/bin/env node
'use strict';
// Offline, conditional research only. Raw inputs/results never enter product data.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),cp=require('node:child_process');
const C=require('../../quant/engines/research-contract.cjs'),A=require('../../quant/engines/weekly-real-adapter.cjs'),B=require('../../quant/engines/weekly-benchmark.cjs'),S=require('../../quant/engines/research-studies.cjs'),V=require('../../quant/engines/research-validation.cjs'),MC=require('../../quant/engines/research-monte-carlo.cjs'),Source=require('../../quant/engines/research-weekly-source.cjs'),W=require('./run-real-weekly-backtest.cjs');
const Store=require('../../quant/engines/research-artifacts.cjs');
const ROOT=path.resolve(__dirname,'../..');
const IDS=['ref_A','ref_ARM','ref_GE','ref_IBM','ref_JPM','ref_META','ref_MSFT','ref_NVDA','ref_TSLA','ref_WMT','ref_XOM'];
function main(out,systematic=false){
 if(!out)throw Error('PRIVATE_OUTPUT_REQUIRED');out=path.resolve(out);fs.mkdirSync(out,{recursive:true,mode:0o700});if(!path.relative(ROOT,fs.realpathSync(out)).startsWith('..'+path.sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
 const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')),write=(p,x)=>{Store.publish(path.join(out,'generations'),x);fs.writeFileSync(path.join(out,p+'.json'),JSON.stringify(x),{mode:0o600});};
 const sources={};const track=p=>{sources[p]=C.shaFile(path.join(ROOT,p));return sources[p];};
 const loader=A.createLoader(ROOT),inventory=[],accepted=new Map();
 for(const f of fs.readdirSync(path.join(ROOT,'quant/data/market/discover-series-long')).filter(f=>f.endsWith('.json')).sort()){
  const id=f.slice(0,-5);if(!id.startsWith('ref_')){inventory.push({id,state:'METADATA_NOT_LISTING'});continue;}try{const d=loader(id);accepted.set(id,{listingId:d.listingId});inventory.push({id,state:'QUALIFIED_WEEKLY_PRICE_SCOPE',from:d.points[0][0],to:d.points.at(-1)[0],bars:d.points.length,sourceBytesHash:d.sourceBytesHash,identityHash:d.identityHash});}catch(e){inventory.push({id,state:'UNQUALIFIED',reason:e.message});}
 }
 // Broaden coverage systematically without examining returns. Quality-conditioned survivors remain biased.
 const pool=[...accepted.keys()].filter(id=>!IDS.includes(id));
 const requested=[...IDS,...(systematic ? Array.from({length:29},(_,k)=>pool[Math.floor(k*pool.length/29)]) : [])];
 const exclusions=requested.filter(id=>!accepted.has(id)).map(id=>({id,reason:inventory.find(x=>x.id===id)?.reason||'ABSENT'}));
 const listings=requested.filter(id=>accepted.has(id)).map(id=>{const d=loader(id);accepted.set(id,d);track(d.sourcePath);return {listingId:d.listingId,issuerId:id,securityId:id,identity:{mic:d.listingId.includes(':NASDAQ:')?'XNAS':d.listingId.includes(':NYSE:')?'XNYS':'XASE',instrumentClass:'COMMON_STOCK',primary:true,validFrom:d.listingStart,availableAt:d.masterGeneratedAt,sourceHash:d.identityHash},bars:d.points.map(([date,close])=>({date,close}))};});
 track('quant/data/market/security-master/us-security-master.json');
 const calendar=[...new Set(listings.flatMap(l=>l.bars.map(b=>b.date)))].sort(),asOf=calendar.at(-1),benchmark=B.load(ROOT);track(B.SOURCE);
 const registration={id:'V7-CONDITIONAL-COHORT',version:'1.0.0',frozenAt:'2026-10-26T00:00:00Z',analysisMode:'EXPLORATORY',selection:systematic?'SYSTEMATIC_CLASSIFICATION_PROBE_NOT_VALIDATED_COMMON_STOCK_POPULATION':'Eleven named reference listings, conditional descriptive price scope; not historical market membership',requestedIds:requested};
 const base={asOf,sourceMode:'HISTORICAL_SIMULATION',cohortMode:'CONDITIONAL_CURRENT_CLASSIFICATION',executionClock:'OBSERVED_WEEKLY_DATES',returnBasis:'PRICE_RETURN',currency:'USD',registration,horizonBars:13,entryDelayBars:1,costs:{basis:'PER_SIDE_NOTIONAL',feeBps:10,slippageBps:5},expectedCalendar:calendar,listings,benchmark:{currency:'USD',returnBasis:'PRICE_RETURN',bars:[...benchmark.byDate].map(([date,close])=>({date,close}))}};
 const pattern={id:'ABOVE_40W_SMA',version:'1',terms:[{feature:'aboveSma40w',operator:'eq',value:true}]};
 const studies=[];function study(id,input,fn,summarize){write(id+'-input',input);const r=fn(input);write(id+'-result',r);studies.push({id,inputHash:C.hash(input),resultHash:C.hash(r),asOf,population:listings.map(l=>l.listingId),period:[calendar[0],asOf],returnBasis:'PRICE_RETURN',costs:base.costs,benchmark:'SPY PRICE_RETURN, exact dates only, no extension before inception',evidence:'RETROSPECTIVE_CONDITIONAL_NOT_INDEPENDENT',...summarize(r)});return r;}
 write('registration',registration);write('inventory',inventory);
 const signal=study('V7-SIGNAL-5',base,S.runSignalStudy,r=>({coverage:r.coverage,rules:r.rules}));
 study('V7-PATTERN',{...base,pattern,cooldownBars:13},S.runPatternStudy,r=>({coverage:r.coverage,statistics:r.statistics,controls:r.controls.length,matchedObserved:r.events.filter(e=>Number.isFinite(e.matchedExcess)).length}));
 for(const l of listings)study('V7-REPLAY-'+l.securityId,{...base,listings:[l],pattern,cooldownBars:13},S.runReplayValidation,r=>({coverage:r.coverage,statistics:r.statistics}));
 const setups=[];for(const l of listings){const p='quant/data/product/setup-replay-v1/'+l.securityId+'.json.gz';if(!fs.existsSync(path.join(ROOT,p)))continue;const h=track(p),d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,p))));for(const row of d.rows)if(l.bars.some(b=>b.date===row[0]))setups.push({listingId:l.listingId,date:row[0],availableAt:row[0]+'T23:59:59.999Z',sourceHash:h,sourceMode:'HISTORICAL_SIMULATION',state:row[1]});}
 setups.sort((a,b)=>a.date.localeCompare(b.date)||a.listingId.localeCompare(b.listingId));
 for(const h of [13,26])study('V7-SETUP-RECONSTRUCTED-'+h,{...base,horizonBars:h,setups,entryStates:['CONFIRMED','SETUP_FORMING']},S.runSetupStudy,r=>({coverage:r.coverage,statistics:r.statistics,suppressed:r.suppressed.length,availability:'MODELED_END_OF_BAR_NOT_ORIGINAL_PUBLICATION',horizon:'WEEK_PROXY_NOT_CONTRACT_CALENDAR_M3_M6'}));
 const regimeInput={asOf,mode:'EX_POST_DESCRIPTIVE',bars:base.benchmark.bars,lookbackBars:126,volatilityLookbackBars:63,annualization:252,trendBand:0.05,volatilityThreshold:0.25};
 const labels=S.classifyRegimes(regimeInput);write('regime-labels-input',regimeInput);write('regime-labels',labels);
 for(const axis of ['state','volatilityState'])study('V7-REGIME-'+axis,{mode:'EX_POST_DESCRIPTIVE',regimes:labels.regimes.map(r=>({...r,state:r[axis]})),observations:signal.events.filter(e=>e.completed)},S.analyzeRegimes,r=>({states:r.states,unmatched:r.unmatched.length}));
 // Conservative reconstruction from stored accession-specific rows: never backdate to period end.
 const secRows=new Map(),secEvents=[];
 for(const l of listings){const p='quant/data/sec/inspector/'+l.securityId.slice(4)+'.json';if(!fs.existsSync(path.join(ROOT,p)))continue;const h=track(p),d=read(p);const rows=d.rows.filter(r=>r.available && r.available_from && r.accession && r.quality==='HIGH' && !(r.flags||[]).length && r.transformation==='AS_REPORTED' && Number.isFinite(r.value));secRows.set(l.listingId,{rows,hash:h});
 const seen=new Set();for(const r of rows){if(seen.has(r.accession)||r.available_from.slice(0,10)>asOf)continue;seen.add(r.accession);secEvents.push({eventId:l.listingId+':'+r.accession,eventType:'STORED_SEC_FACT_AVAILABLE_FROM',listingId:l.listingId,occurredAt:r.available_from,publishedAt:r.available_from,availableAt:r.available_from,sourceHash:h});}}
 const secListings=listings.filter(l=>secRows.has(l.listingId));
 if(secListings.length){
 study('V7-SEC-EVENT',{...base,listings:secListings,events:secEvents,horizonBars:4},S.runEventStudy,r=>({coverage:r.coverage,statistics:r.statistics,timing:'Stored SEC fact available_from, not earnings release; no original filing revalidation'}));
 const snaps=[];for(let k=0;k<calendar.length;k++){const date=calendar[k];if(k+1<calendar.length && calendar[k+1].slice(0,7)===date.slice(0,7))continue;const availableAt=date+'T23:59:59.999Z';const rows=[];
 for(const l of secListings){const d=secRows.get(l.listingId);const pairs=d.rows.filter(r=>r.metric==='operating_income' && r.fiscal_period==='FY' && r.available_from<=availableAt && r.period_end<=date).flatMap(r=>{const revenue=d.rows.find(v=>v.metric==='revenue' && v.accession===r.accession && v.period_end===r.period_end && v.fiscal_period===r.fiscal_period && v.available_from<=availableAt && v.unit===r.unit && v.value>0);return revenue?[{r,revenue}]:[];}).sort((a,b)=>b.r.period_end.localeCompare(a.r.period_end)||b.r.available_from.localeCompare(a.r.available_from));
 if(pairs.length){const {r,revenue}=pairs[0];rows.push({listingId:l.listingId,value:r.value/revenue.value,availableAt:r.available_from,sourceHash:d.hash,accession:r.accession,periodEnd:r.period_end,formulaVersion:'STORED_ANNUAL_OPERATING_MARGIN-1'});}}
 if(rows.length)snaps.push({date,availableAt,sourceHash:C.hash(rows),rows});}
 study('V7-FACTOR-SEC-MARGIN',{...base,listings:secListings,factorId:'STORED_ANNUAL_OPERATING_MARGIN',factorSnapshots:snaps,buckets:2,horizonBars:13},S.runFactorStudy,r=>({coverage:r.coverage,periods:r.periods,scope:'Selected stored accession facts, missing original vintages not reconstructed; conditional small cohort, no market ranking claim'}));
 }
 // Reuse the existing ledger for explicitly labeled adjusted-price virtual units.
 const P=require('../../quant/engines/research-portfolio.cjs');
 const pl=listings.filter(l=>['ref_MSFT','ref_NVDA','ref_JPM'].includes(l.securityId));
 const dates=calendar.filter(d=>pl.every(l=>l.bars.some(b=>b.date===d)) && benchmark.byDate.has(d));
 for(const frequency of [1,4,13]){
 const mh=C.hash(pl.map(l=>l.listingId)),weights=Object.fromEntries(pl.map(l=>[l.listingId,0.9/pl.length]));
 const input={sessions:dates.map(date=>({date,closeAt:date+'T23:59:59.999Z'})),initialCapital:100000,currency:'USD',returnBasis:'PRICE_RETURN',provenance:{mode:'HISTORICAL_PRICE_SIMULATION',datasetHash:C.hash(pl),priceSeriesType:'SPLIT_ADJUSTED',populationBasis:'CONDITIONAL_FIXED_CURRENT_COHORT',clockBasis:'MODELED_WEEK_END_DATE'},costs:base.costs,maxMembershipAgeDays:45,maxFactorAgeDays:45,
 listings:pl.map(l=>({listingId:l.listingId,issuerId:l.issuerId,mic:l.identity.mic,instrumentClass:'COMMON_STOCK',primary:true,currency:'USD',firstTradeDate:l.identity.validFrom,lastTradeDate:null,events:[],bars:l.bars.map(b=>({...b,availableAt:b.date+'T23:59:59.999Z'}))})),factorSnapshots:[],memberships:dates.filter((d,k)=>k%4===0).map(date=>({effectiveAt:date+'T00:00:00Z',availableAt:date+'T00:00:00Z',sourceHash:C.hash({date,mh}),members:pl.map(l=>l.listingId)})),targets:dates.slice(0,-1).filter((d,k)=>k%frequency===0).map(decisionDate=>({decisionDate,executionDate:dates[dates.indexOf(decisionDate)+1],availableAt:decisionDate+'T23:59:59.999Z',membershipHash:C.hash({date:dates[Math.floor(dates.indexOf(decisionDate)/4)*4],mh}),weights})),benchmark:{currency:'USD',returnBasis:'PRICE_RETURN',sourceHash:track(B.SOURCE),costPolicy:'PASSIVE_NO_TRANSACTION_COSTS',levels:dates.map(date=>({date,level:benchmark.byDate.get(date)}))}};
 study('V7-PORTFOLIO-'+frequency,input,P.runPortfolio,r=>({period:[dates[0],dates.at(-1)],population:pl.map(l=>l.listingId),metrics:r.metrics,endCapital:r.endCapital,rebalances:r.rebalances.length,scope:'Adjusted-price virtual units, fixed 90% equity / 10% cash, no PIT factor strategy, no dividends, no live fill proof'}));
 }
 const mcRows=[];for(const model of ['TRADE_IID','CIRCULAR_BLOCK'])for(const blockLength of model==='TRADE_IID'?[null]:[4,13,26])for(const seed of [20261026,1729])for(const simulations of [1000,10000]){
  const config={root:ROOT,securityId:'ref_NVDA',model,seed,simulations,horizon:model==='TRADE_IID'?21:52,retainPaths:2};if(blockLength)config.blockLength=blockLength;
  const {input,sourceEvidence}=Source.loadWeeklyMonteCarloInput(config);const id=['V7-MC',model,blockLength||0,seed,simulations].join('-');write(id+'-input',input);const r=MC.runMonteCarlo(input);write(id+'-result',r);mcRows.push({id,model,blockLength,seed,simulations,sourceEvidence,inputHash:C.hash(input),resultHash:C.hash(r),summary:r.summary||r.distributions||r});
 }
 write('mc-summary',mcRows);
 // Developmental WF: unchanged funded rule, no parameter selection on test data.
 const funded=W.run(accepted.get('ref_NVDA'),{benchmark}),points=accepted.get('ref_NVDA').points;
 const events=funded.trades.map((t,k)=>({id:'T'+k,informationStart:points[Math.max(0,t.entryIndex-55)][0],decisionAt:t.signalDate,availableAt:t.signalDate,outcomeEnd:t.exitDate,outcomeAvailableAt:t.exitDate}));
 const observations=funded.trades.map((t,k)=>({id:'T'+k,value:t.netReturn}));
 for(const mode of ['ROLLING','EXPANDING']){
  const input={config:{calendar:points.map(p=>p[0]),trainSize:520,validationSize:156,testSize:156,mode,embargoDays:7,asOf},events};
  const partition=study('V7-WF-'+mode,input,x=>V.buildWalkForward(x.config,x.events),r=>({folds:r.folds.length,train:r.folds.map(f=>f.train.length),validation:r.folds.map(f=>f.validation.length),test:r.folds.map(f=>f.test.length),claim:'DEVELOPMENTAL_PARTITION_NO_UNTOUCHED_TEST'}));
  const ids=new Set(partition.folds.flatMap(f=>f.test));study('V7-OOS-AGG-'+mode,{partition,observations:observations.filter(x=>ids.has(x.id))},x=>V.aggregateOos(x.partition,x.observations),r=>({n:r.n,mean:r.mean,independentEvidence:false}));
 }
 // All sensitivity outputs descriptive: no defensible small-sample p-value is invented.
 const grid=[];for(const horizonBars of [4,13,26])for(const entryDelayBars of [1,2])for(const feeBps of [0,10])for(const slippageBps of [0,5,20]){
  const input={...base,ruleIds:['NEW_52W_HIGH'],horizonBars,entryDelayBars,costs:{basis:'PER_SIDE_NOTIONAL',feeBps,slippageBps}};
  const r=S.runSignalStudy(input);grid.push({parameters:{horizonBars,entryDelayBars,feeBps,slippageBps},inputHash:C.hash(input),resultHash:r.resultHash,coverage:r.coverage,mean:r.statistics.mean,interval95:r.statistics.interval95});
 }
 write('sensitivity-grid',grid);studies.push({id:'V7-SENSITIVITY',gridHash:C.hash(grid),points:grid.length,evidence:'EXPLORATORY_FULL_GRID_NO_OPTIMUM_SELECTED',multiplicity:'NO_SIGNIFICANCE_OR_HOLM_CLAIM_WITHOUT_VALID_P_VALUES',dependence:'OVERLAPPING_OUTCOMES; NOMINAL_ENGINE_INTERVALS_NOT_USED_FOR_ACCEPTANCE'});
 const ledger=V.appendExposure(V.createExposureLedger(),{id:'v7-real-studies',ruleHash:track('quant/engines/signal-backtest.js'),purpose:'EXPLORATION',from:calendar[0],to:asOf,observedAt:new Date().toISOString()});write('exposure-ledger',ledger);
 const mc=mcRows.map(({summary,...row})=>row);
 const dependencies=Object.fromEntries(['quant/engines/research-studies.cjs','quant/engines/research-portfolio.cjs','quant/engines/research-validation.cjs','quant/engines/research-monte-carlo.cjs','scripts/quant/run-v7-real-studies.cjs'].map(p=>[p,C.shaFile(path.join(ROOT,p))]));
 const summary={dependencies,schemaVersion:'quant-v7-real-studies-1.0.0',baseline:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),runtime:C.runtime(),sources,inventory:{files:inventory.length,candidates:inventory.filter(r=>r.state!=='METADATA_NOT_LISTING').length,metadata:inventory.filter(r=>r.state==='METADATA_NOT_LISTING').length,qualified:inventory.filter(r=>r.state==='QUALIFIED_WEEKLY_PRICE_SCOPE').length,reasons:inventory.filter(r=>r.reason).reduce((a,r)=>(a[r.reason.split(':')[0]]=(a[r.reason.split(':')[0]]||0)+1,a),{})},selection:{requested,exclusions,qualified:listings.length},studies,monteCarlo:mc,unresolved:{strategy:'PRICE_RETURN fixed cohort only; no original PIT profile strategy or full-market TOTAL_RETURN qualification',factor:'Stored accession fact reconstruction only; young original production factor archive cannot supply required 12 completed M3 months',event:'Stored available_from study only; original filings not revalidated, not earnings release times'},certification:'NOT_CERTIFIED',productionApproved:false};write('summary',summary);console.log(JSON.stringify({studies:studies.length,monteCarlo:mc.length,inventory:summary.inventory,selection:summary.selection}));
}
if(require.main===module)main(process.argv[2],process.argv[3]==='--classification-probe');module.exports={main};
