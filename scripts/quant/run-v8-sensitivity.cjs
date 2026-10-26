#!/usr/bin/env node
'use strict';
// Registered offline robustness analysis. No product data writes or parameter winner.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const C=require('../../quant/engines/research-contract.cjs'),A=require('../../quant/engines/weekly-real-adapter.cjs'),S=require('../../quant/engines/research-studies.cjs'),V=require('../../quant/engines/research-validation.cjs');
const ROOT=path.resolve(__dirname,'../..');
function main(directory){
 if(!directory)throw Error('PRIVATE_OUTPUT_REQUIRED'); const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true,mode:0o700});const real=fs.realpathSync(out);if(real===ROOT||real.startsWith(ROOT+path.sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
 const write=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data),{mode:0o600});
 const loader=A.createLoader(ROOT),ids=['ref_JPM','ref_MSFT','ref_NVDA'];
 const raw=ids.map(id=>loader(id)),sources=Object.fromEntries(raw.map(d=>[d.sourcePath,C.shaFile(path.join(ROOT,d.sourcePath))]));
 sources['quant/data/market/security-master/us-security-master.json']=C.shaFile(path.join(ROOT,'quant/data/market/security-master/us-security-master.json'));
 const listings=raw.map((d,i)=>({listingId:d.listingId,issuerId:ids[i],securityId:ids[i],identity:{mic:d.listingId.includes(':NASDAQ:')?'XNAS':'XNYS',instrumentClass:'COMMON_STOCK',primary:true,validFrom:d.listingStart,availableAt:d.masterGeneratedAt,sourceHash:d.identityHash},bars:d.points.map(([date,close])=>({date,close}))}));
 const calendar=[...new Set(listings.flatMap(l=>l.bars.map(b=>b.date)))].sort();
 // Fixed bounds and balanced price coverage are declared before evaluating any grid return.
 const studyCalendar=calendar.filter(d=>d>='2000-01-01'&&d<='2025-12-31');
 for(const l of listings){const dates=new Set(l.bars.map(b=>b.date));if(!studyCalendar.every(d=>dates.has(d)))throw Error('BALANCED_CALENDAR_NOT_COVERED');}
 const planPath=path.join(out,'sensitivity-plan.json');
 const previousPlan=fs.existsSync(planPath)?JSON.parse(fs.readFileSync(planPath,'utf8')):null;
 const registeredAt=previousPlan?.registeredAt||new Date().toISOString();
 const config={calendar:studyCalendar,blockLength:52,minimumBlockLength:28,replicates:1999,seed:1729,alpha:.05,assumption:'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING'};
 const dimensions={horizonBars:[4,13,26],entryDelayBars:[1,2],feeBps:[0,10],slippageBps:[0,5,20]};
 const registration={id:'V8-SENSITIVITY-CALENDAR-BLOCK',version:'1.0.0',registeredAt,alpha:.05,purpose:'EXPLORATORY_ROBUSTNESS',population:ids,selection:'Existing V7 price-portfolio trio; fixed survivor cohort, no population representativeness',period:['2000-01-01','2025-12-31'],asOf:calendar.at(-1),dimensions,baseline:{horizonBars:13,entryDelayBars:1,feeBps:10,slippageBps:5},inference:config,robustnessBlockLength:104,primaryEndpoint:'POOLED_EVENT_MEAN_NET_PRICE_RETURN',missingOutcomes:'Only completed events; all excluded/immature/censored counts reported for each horizon/delay; no imputation',costs:'PER_SIDE_NOTIONAL',benchmark:'No benchmark-adjusted endpoint; long equity drift remains in mean',priorExposure:'V7 explored history; no untouched holdout',multiplicity:'HOLM_WITHIN_36_POINTS_ONLY; earlier searches not incorporated',sources};
 if(previousPlan){if(C.hash(previousPlan)!==C.hash(registration))throw Error('REGISTERED_PLAN_CHANGED_USE_NEW_GENERATION');}
 else write('sensitivity-plan',registration); // Durable plan before any outcome calculation; exact replay reuses it.
 const base={asOf:calendar.at(-1),sourceMode:'HISTORICAL_SIMULATION',cohortMode:'CONDITIONAL_CURRENT_CLASSIFICATION',executionClock:'OBSERVED_WEEKLY_DATES',returnBasis:'PRICE_RETURN',currency:'USD',registration:{id:registration.id,version:'1.0.0',frozenAt:registeredAt,analysisMode:'EXPLORATORY',selection:registration.selection},ruleIds:['NEW_52W_HIGH'],costs:{basis:'PER_SIDE_NOTIONAL',feeBps:0,slippageBps:0},expectedCalendar:calendar,listings};
 const cached={};for(const horizonBars of dimensions.horizonBars)for(const entryDelayBars of dimensions.entryDelayBars){const result=S.runSignalStudy({...base,horizonBars,entryDelayBars});cached[horizonBars+':'+entryDelayBars]=result.events.filter(e=>studyCalendar.includes(e.signalDate));}
 const inputs={config,planHash:C.hash(registration),events:cached};write('sensitivity-input',inputs);
 const datasetHash=C.hash(inputs),ruleHash=C.shaFile(path.join(ROOT,'quant/engines/signal-backtest.js'));
 const inferenceResults=[],robustness=[];
 function evaluator(parameters){
  const events=cached[parameters.horizonBars+':'+parameters.entryDelayBars];const side=(parameters.feeBps+parameters.slippageBps)/10000;
  const rows=events.filter(e=>e.completed).map((e,i)=>({id:e.listingId+':'+e.signalDate+':'+i,date:e.signalDate,value:(1+e.grossReturn)*(1-side)/(1+side)-1}));
  const result=V.inferTemporalBlockMean(config,rows),long=V.inferTemporalBlockMean({...config,blockLength:104},rows);
  const coverage=events.reduce((a,e)=>(a[e.state]=(a[e.state]||0)+1,a),{});
  inferenceResults.push({parameters,coverage,result});robustness.push({parameters,coverage,result:long});
  return {estimate:result.estimate,pValue:result.pValue,n:result.n,ci:result.ci,inferenceMethod:result.inferenceMethod,clusters:result.blockCountDiagnostic,effectiveN:null};
 }
 const spec={...registration,ruleHash,datasetHash,evaluatorHash:V.hash(evaluator.toString())};
 const registered=V.registerSensitivity(spec);write('sensitivity-registration',registered);
 const result=V.runSensitivity(registered,evaluator,{datasetHash,evaluatorHash:spec.evaluatorHash,ruleHash,executedAt:new Date().toISOString(),holdout:false});
 const all={registration:registered,result,inferenceResults,robustness};write('sensitivity-result',all);
 const files=['quant/engines/research-validation.cjs','quant/engines/research-studies.cjs','scripts/quant/run-v8-sensitivity.cjs'];
 const summary={schemaVersion:'quant-v8-sensitivity-1.0.0',gitHead:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),runtime:C.runtime(),dependencies:Object.fromEntries(files.map(f=>[f,C.shaFile(path.join(ROOT,f))])),sources,planHash:C.hash(registration),registrationHash:registered.resultHash,inputHash:datasetHash,resultHash:result.resultHash,scope:registration,rows:result.rows,neighborhood:result.neighborhood,coverage:inferenceResults.map(x=>({parameters:x.parameters,coverage:x.coverage})),robustness:robustness.map(x=>({parameters:x.parameters,estimate:x.result.estimate,pValue:x.result.pValue,ci:x.result.ci})),nominalRejections:result.rows.filter(x=>x.pValue<=.05).length,holmRejections:result.rows.filter(x=>x.reject).length,bootstrapAssumptionsVerified:false,independentEvidence:false,status:'COMPUTATION_VALIDATED_INFERENCE_ASSUMPTIONS_UNVERIFIED',productionApproved:false};
 write('sensitivity-summary',summary);console.log(JSON.stringify({points:result.rows.length,nominalRejections:summary.nominalRejections,holmRejections:summary.holmRejections,neighborhood:result.neighborhood}));
}
if(require.main===module)main(process.argv[2]);module.exports={main};
