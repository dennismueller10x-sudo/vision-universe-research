/**
 * Read-only reconciliation diagnostic for a book that failed
 * REFERENCE_BOOK_RECONCILIATION_FAILED. It replays the unchanged construction
 * with a no-op-by-default daily hook, tracks the book identity (actual - expected)
 * per day and attributes every change of that gap to the events of the day.
 * It changes no state, no tolerance and no definition. Public output holds
 * dates, counts and magnitudes only (no tickers, ids or performance).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCanonicalData} from '../certification/canonical-input.mjs';
import {prepareRerunData} from '../certification/run-rerun.mjs';
import {referenceMethods} from './reference-engines.mjs';
import {runReferencePortfolio} from './portfolio-calibration-v3.mjs';
import {reconcileBook} from './accounting-budget-v2.mjs';
import {referenceFrame,} from './run-calibration-v2.mjs';
import {ENGINE_ID} from './run-calibration-v3.mjs';
import crypto from 'node:crypto';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseProtocol=JSON.parse(fs.readFileSync(path.join(HERE,'../tournament/protocol.json')));
const demand=(ok,code)=>{if(!ok)throw new Error(code);};


/** Conservation audit, id-free output. Cost: sum of BUY fills = closed cost + open cost. Cash: from fills and dividends. */
export function auditBook(book,commissionRate=0){
 const byId=new Map(),cashFromFills={buy:0,sell:0};
 for(const f of book.fills){
  const e=byId.get(f.id)??{buyCost:0,buyShares:0,buys:0,sells:0,sellShares:0,firstBuyPrice:null,closedCost:0,terminalSells:0};
  if(f.side==='BUY'){const gross=f.shares*f.price;e.buyCost+=gross*(1+commissionRate);e.buyShares+=f.shares;e.buys++;if(e.firstBuyPrice===null)e.firstBuyPrice=f.price;cashFromFills.buy+=gross*(1+commissionRate);}
  else{e.sells++;e.sellShares+=f.shares;if(f.reason==='TERMINAL_SCENARIO')e.terminalSells++;cashFromFills.sell+=f.shares*f.price*(1-commissionRate);}
  byId.set(f.id,e);
 }
 for(const t of book.trades){const e=byId.get(t.id);if(e)e.closedCost+=t.cost;}
 let leakSum=0,leakIds=0;const rows=[];
 for(const [id,e] of byId){
  const open=book.positions.get(id),openCost=open?.cost??0,openShares=open?.shares??0,diff=e.buyCost-(e.closedCost+openCost),shareDiff=e.buyShares-e.sellShares-openShares;
  if(Math.abs(diff)>1e-9||Math.abs(shareDiff)>1e-9){leakIds++;leakSum+=diff;rows.push({costDiff:diff,shareDiff,firstBuyPrice:e.firstBuyPrice,buys:e.buys,sells:e.sells,terminalSells:e.terminalSells,stillOpen:Boolean(open),buyShares:e.buyShares});}
 }
 const cashExpected=book.initialCapital-cashFromFills.buy+cashFromFills.sell+book.dividends;
 return{idsWithFills:byId.size,idsWithCostOrShareLeak:leakIds,costLeakSum:leakSum,cash:{actual:book.cash,fromFillsAndDividends:cashExpected,difference:book.cash-cashExpected},
  largestLeaks:rows.sort((a,b)=>Math.abs(b.costDiff)-Math.abs(a.costDiff)).slice(0,10),
  leakByShape:{stillOpen:rows.filter(r=>r.stillOpen).length,closed:rows.filter(r=>!r.stillOpen).length,withTerminalSell:rows.filter(r=>r.terminalSells>0).length,multiBuy:rows.filter(r=>r.buys>1).length,priceBelow1:rows.filter(r=>r.firstBuyPrice<1).length,priceAbove1000:rows.filter(r=>r.firstBuyPrice>1000).length}};
}

export function createGapTracker({legs=['top','bottom','eligibleUniverse'],commissionRate=0}={}){
 const state=new Map(),days=[],books=new Map(),audits={};
 const hook=({leg,date,book,bars,terminals})=>{
  if(!legs.includes(leg))return;
  const r=reconcileBook(book),gap=r.actual-r.expected,tolerance=Math.max(1e-6,r.actual*1e-10);
  books.set(leg,book);
  const prev=state.get(leg)??{gap:0,dividends:0,terminalCount:0,trades:0,fills:0,rejections:0,positions:0};
  let withoutBar=0,staleBar=0;
  for(const p of book.positions.values()){const b=bars.get(p.id);if(!b)withoutBar++;else if(b.date!==date)staleBar++;}
  const fills=book.fills.slice(prev.fills),sells=fills.filter(f=>f.side==='SELL'),buys=fills.filter(f=>f.side==='BUY');
  const reasons={};for(const f of sells)reasons[f.reason]=(reasons[f.reason]||0)+1;
  const row={leg,date,gap,delta:gap-prev.gap,tolerance,
   dividendsCredited:book.dividends>prev.dividends,dividendDelta:book.dividends-prev.dividends,
   terminals:book.terminalCount-prev.terminalCount,quarantineTerminals:(terminals||[]).filter(t=>t.kind==='DATA_QUARANTINE').length,
   sells:sells.length,buys:buys.length,sellReasons:reasons,newRejections:book.rejections.length-prev.rejections,
   positions:book.positions.size,positionsDelta:book.positions.size-prev.positions,positionsWithoutBar:withoutBar,positionsWithStaleBar:staleBar,
   cashNegative:book.cash<0};
  state.set(leg,{gap,dividends:book.dividends,terminalCount:book.terminalCount,trades:book.trades.length,fills:book.fills.length,rejections:book.rejections.length,positions:book.positions.size});
  if(!audits[leg]&&Math.abs(gap)>tolerance)audits[leg]={atDate:date,audit:auditBook(book,commissionRate)};
  days.push(row);
 };
 const summarize=(top=12)=>{
  const out={};
  for(const leg of [...new Set(days.map(d=>d.leg))]){
   const rows=days.filter(d=>d.leg===leg),broke=rows.find(d=>Math.abs(d.gap)>d.tolerance);
   const flags=['dividendsCredited','sells','buys','newRejections','positionsWithoutBar','positionsWithStaleBar'];
   const byFlag={};
   for(const f of flags){const hit=rows.filter(d=>d[f]>0||d[f]===true);byFlag[f]={days:hit.length,signedGapDeltaSum:hit.reduce((s,d)=>s+d.delta,0),absGapDeltaSum:hit.reduce((s,d)=>s+Math.abs(d.delta),0)};}
   const terminalDays=rows.filter(d=>d.terminals>0||d.quarantineTerminals>0);
   byFlag.terminalOrQuarantine={days:terminalDays.length,signedGapDeltaSum:terminalDays.reduce((s,d)=>s+d.delta,0),absGapDeltaSum:terminalDays.reduce((s,d)=>s+Math.abs(d.delta),0)};
   const quiet=rows.filter(d=>!d.dividendsCredited&&!d.sells&&!d.buys&&!d.terminals&&!d.quarantineTerminals);
   byFlag.noEventDays={days:quiet.length,signedGapDeltaSum:quiet.reduce((s,d)=>s+d.delta,0),absGapDeltaSum:quiet.reduce((s,d)=>s+Math.abs(d.delta),0)};
   out[leg]={days:rows.length,finalGap:rows.at(-1)?.gap??null,finalTolerance:rows.at(-1)?.tolerance??null,firstDayAboveTolerance:broke?{date:broke.date,gap:broke.gap,events:{dividends:broke.dividendsCredited,sells:broke.sells,buys:broke.buys,terminals:broke.terminals,quarantineTerminals:broke.quarantineTerminals,newRejections:broke.newRejections,positionsWithoutBar:broke.positionsWithoutBar,positionsWithStaleBar:broke.positionsWithStaleBar}}:null,
    daysWithGapChangeAbove1e6:rows.filter(d=>Math.abs(d.delta)>1e-6).length,byEventClass:byFlag,
    largestGapChanges:rows.slice().sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,top).map(d=>({date:d.date,delta:d.delta,sells:d.sells,buys:d.buys,sellReasons:d.sellReasons,dividendsCredited:d.dividendsCredited,terminals:d.terminals,quarantineTerminals:d.quarantineTerminals,newRejections:d.newRejections,positionsDelta:d.positionsDelta,positionsWithoutBar:d.positionsWithoutBar,positionsWithStaleBar:d.positionsWithStaleBar}))};
  }
  return out;
 };
 const finalAudits=()=>Object.fromEntries([...books].map(([leg,b])=>[leg,auditBook(b,commissionRate)]));
 return {hook,summarize,days,audits,finalAudits};
}

export async function diagnose({inputDir,referenceParsed,method,publicOut,costMode='SOURCE_GROSS',legs}){
 demand(path.resolve(inputDir).startsWith('/workspace/private/'),'PRIVATE_INPUT_REQUIRED');
 const engine=referenceMethods.find(m=>m.id===ENGINE_ID[method]);demand(engine,'REGISTERED_REFERENCE_METHOD_REQUIRED');
 const inputsBytes=fs.readFileSync(path.join(inputDir,'data-certification-inputs.json')),manifestBytes=fs.readFileSync(path.join(inputDir,'canonical-dataset-manifest.json'));
 const parsed=JSON.parse(fs.readFileSync(referenceParsed));
 const data=await loadCanonicalData(inputDir,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256:sha(inputsBytes)});
 const prepared=prepareRerunData(data,baseProtocol),contract=JSON.parse(fs.readFileSync(path.join(HERE,'protocol.json')));
 const frame=referenceFrame(prepared.data,engine,baseProtocol,contract),tracker=createGapTracker({legs,commissionRate:costMode==='SOURCE_GROSS'?0:baseProtocol.execution.commissionBpsPerSide/10000});
 let outcome;
 try{runReferencePortfolio(frame.data,engine,frame.protocol,{costMode,riskFreeDaily:parsed.dailyRF?.rows??parsed.riskFreeDaily??[],onDayClose:tracker.hook});outcome={reconciliation:'PASSED'};}
 catch(e){outcome={reconciliation:e.message==='REFERENCE_BOOK_RECONCILIATION_FAILED'?'FAILED':'ERROR',errorCode:/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_FAILURE'};}
 const report={schema:'supertrader-calibration-v3-reconciliation-diagnostic-1.0.0',methodId:method,engineMethodId:engine.id,costMode,inputBasis:{manifestSha256:sha(manifestBytes),sourceMetadataSha256:sha(inputsBytes)},outcome,gap:tracker.summarize(),auditAtFirstBreak:tracker.audits,finalAudit:tracker.finalAudits(),toleranceChanged:false,stateChanged:false,performanceNumbersPublished:false};
 fs.mkdirSync(path.dirname(path.resolve(publicOut)),{recursive:true});fs.writeFileSync(publicOut,JSON.stringify(report,null,2)+'\n');
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{const r=await diagnose({inputDir:arg('--input-dir'),referenceParsed:arg('--reference-parsed'),method:arg('--method'),publicOut:arg('--public-out'),costMode:arg('--cost-mode')||'SOURCE_GROSS'});process.stdout.write(JSON.stringify({outcome:r.outcome,legs:Object.fromEntries(Object.entries(r.gap).map(([k,v])=>[k,{finalGap:v.finalGap,firstAbove:v.firstDayAboveTolerance?.date??null}]))})+'\n');}
 catch(e){process.stderr.write(JSON.stringify({status:'V3_DIAGNOSTIC_FAILED_CLOSED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'DIAGNOSTIC_FAILURE'})+'\n');process.exitCode=1;}
}
