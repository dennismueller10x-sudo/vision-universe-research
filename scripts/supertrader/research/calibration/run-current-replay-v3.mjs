/**
 * Current replay and consensus under the V3 freeze (diagnostic vs qualified kept apart).
 * - Verifies the V3 freeze and the passed-review calibration completion before scanning.
 * - Reuses the frozen tournament scanner (loadCurrentScannerInputs/currentScan/currentConsensus) unchanged.
 * - QUALIFIED consensus admits only methods whose own public tournament summary says fullyQualified===true
 *   (no method is, while the calibration is at most PARTIALLY_CERTIFIED and tournament reviews are pending).
 * - DIAGNOSTIC consensus covers every frozen method and is research-only, never a trading score.
 * - Candidate lists (tickers) exist only in the sealed owner/session envelopes; the public summary has counts.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyFreezeV3} from './freeze-v3.mjs';
import {verifyCalibrationCompletion} from './run-post-calibration-v3.mjs';
import {sealFileStream} from './seal-stream-v3.mjs';
import {loadCurrentScannerInputs} from '../tournament/data.mjs';
import {methods,historicalParticipants,prepareSourceFeatures} from '../tournament/methods.mjs';
import {currentScan,currentConsensus} from '../tournament/runner.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
export const CURRENT_REPLAY_VERSION='V3_CURRENT_REPLAY_DIAGNOSTIC_SEPARATE_FROM_QUALIFIED_1';

export function parseArguments(argv){
 const o={},names=['--freeze','--completion','--completion-sha','--tournament-summaries','--out','--public-out'];
 for(let i=0;i<argv.length;i+=2){if(!names.includes(argv[i])||typeof argv[i+1]!=='string'||argv[i+1].startsWith('--'))throw new Error('REPLAY_ARGUMENT_INVALID');o[argv[i]]=argv[i+1];}
 for(const n of names)demand(o[n],'REPLAY_ARGUMENT_REQUIRED');
 demand(o['--out'].startsWith('/workspace/private/'),'PRIVATE_OUT_OUTSIDE_REPOSITORY_REQUIRED');
 return{freezeFile:o['--freeze'],completionFile:o['--completion'],completionSha:o['--completion-sha'],summariesDir:o['--tournament-summaries'],out:o['--out'],publicOut:o['--public-out']};
}

/** Qualified method ids come only from the public tournament summaries; absent or unreviewed means not qualified. */
export function qualifiedMethodIds(summariesDir,frozenIds){
 const ids=[];
 for(const id of frozenIds){
  const matches=fs.existsSync(summariesDir)?fs.readdirSync(summariesDir).filter(f=>f.startsWith(`TOURNAMENT-V3-${id}-SUMMARY-`)):[];
  if(matches.length!==1)continue;
  const s=JSON.parse(fs.readFileSync(path.join(summariesDir,matches[0]),'utf8'));
  if(s.qualification?.fullyQualified===true&&s.verdict==='MEASURED_RECONCILED_REVIEW_PASSED')ids.push(id);
 }
 return ids;
}

export function replayFromScans({scans,frozenIds,qualifiedIds}){
 const qualified=currentConsensus(scans,qualifiedIds),diagnostic=currentConsensus(scans,frozenIds);
 return{qualified,diagnostic};
}

export async function runCurrentReplay(options,{loader=loadCurrentScannerInputs,asOfDate=new Date().toISOString().slice(0,10)}={}){
 const freezeBytes=fs.readFileSync(options.freezeFile),freeze=JSON.parse(freezeBytes);
 verifyFreezeV3(freeze,{root:ROOT});
 const completion=await verifyCalibrationCompletion({file:options.completionFile,expectedSHA:options.completionSha,freezeSHA256:sha(freezeBytes),freezeId:freeze.freezeId});
 fs.mkdirSync(options.out,{recursive:true,mode:0o700});
 const protocol=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/protocol.json')));
 const frozenIds=historicalParticipants.map(m=>m.id),qualifiedIds=qualifiedMethodIds(options.summariesDir,frozenIds);
 const current=await loader({asOf:asOfDate,lookbackBars:1000000});
 let scans,asOf=null;
 if(current.state==='AVAILABLE'){
  prepareSourceFeatures(current);
  const originals=new Map(current.securities.map(s=>[s.id,s]));
  for(const security of current.scanner){const original=originals.get(security.id);security.sourceFeatures=original.sourceFeatures;}
  asOf=current.formationDate||current.benchmark?.bars.at(-1)?.date||null;
 }
 scans=current.state==='AVAILABLE'&&asOf?methods.map(method=>currentScan(current,method,protocol,asOf)):methods.map(method=>({id:method.id,status:'BLOCKED_DATA',reason:current.reason,asOf:null,numberMatches:0,candidates:[]}));
 const {qualified,diagnostic}=replayFromScans({scans,frozenIds,qualifiedIds});
 const status=current.state==='AVAILABLE'&&asOf?'CURRENT_REPLAYED_DIAGNOSTIC_REVIEW_PENDING':'CURRENT_BLOCKED_DATA';
 const privateReport={schema:'supertrader-current-replay-v3-private-1.0.0',version:CURRENT_REPLAY_VERSION,freezeId:freeze.freezeId,calibrationOverallVerdict:completion.overallVerdict,asOf,status,
  coverage:current.coverage||null,limitations:current.limitations||null,fingerprint:current.fingerprint||null,scans,
  consensus:{qualified,diagnosticAllFrozenMethods:diagnostic,qualifiedMethodIds:qualifiedIds,notAnIndependentTradingScore:true}};
 const plain=path.join(options.out,'current-replay.private.json');
 fs.writeFileSync(plain,JSON.stringify(privateReport),{mode:0o600,flag:'wx'});
 const keys={owner:fs.readFileSync(path.join(ROOT,'scripts/supertrader/validation/results-public-key.pem'),'utf8'),session:fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/session-public-key.pem'),'utf8')};
 const sealed=await sealFileStream({input:plain,output:plain+'.sealed',recipients:keys});
 fs.rmSync(plain);
 const inputHash=f=>{try{return sha(fs.readFileSync(path.join(ROOT,f)));}catch{return null;}};
 const pub={schema:'supertrader-current-replay-v3-public-summary-1.0.0',version:CURRENT_REPLAY_VERSION,freezeId:freeze.freezeId,freezeFileSha256:sha(freezeBytes),calibrationCompletionSha256:options.completionSha,calibrationOverallVerdict:completion.overallVerdict,
  status,asOf,methodsScanned:scans.length,
  perMethod:scans.map(s=>({id:s.id,status:s.status,numberMatches:s.numberMatches??0})),
  consensus:{qualified:{methodIds:qualifiedIds.length,names:'NONE_CERTIFIED',tickersWithAtLeastTwoMethods:qualified.length,rule:'ONLY_METHODS_WITH_FULLYQUALIFIED_AND_PASSED_TOURNAMENT_REVIEW'},
   diagnostic:{allFrozenMethods:frozenIds.length,tickersWithAtLeastTwoMethods:diagnostic.length,researchOnly:true,notAnIndependentTradingScore:true}},
  universeInputsSha256:{universe:inputHash('quant/data/market/scale/universe-FULL_UNIVERSE.json'),eligibility:inputHash('quant/data/market/security-master/eligibility.json'),companyNames:inputHash('quant/data/market/security-master/company-names.json')},
  limitation:'CURRENT_UNIVERSE_AND_ELIGIBILITY_ARE_THE_BRANCH_SNAPSHOT_FILES_NOT_MAIN',
  sealed:{name:path.basename(plain)+'.sealed',plaintextSha256:sealed.plaintextSha256,plaintextBytes:sealed.plaintextBytes,sealedSha256:sealed.sealedSha256,sealedBytes:sealed.sealedBytes,audiences:sealed.audiences},
  candidateListsPublished:false,performanceNumbersPublished:false};
 fs.mkdirSync(path.dirname(path.resolve(options.publicOut)),{recursive:true});
 fs.writeFileSync(options.publicOut,JSON.stringify(pub,null,2)+'\n');
 return pub;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const pub=await runCurrentReplay(parseArguments(process.argv.slice(2)));
  process.stdout.write(JSON.stringify({status:pub.status,methods:pub.methodsScanned,qualifiedTickers:pub.consensus.qualified.tickersWithAtLeastTwoMethods,diagnosticTickers:pub.consensus.diagnostic.tickersWithAtLeastTwoMethods})+'\n');
 }catch(e){process.stderr.write(JSON.stringify({status:'CURRENT_REPLAY_FAILED_CLOSED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'REPLAY_FAILURE'})+'\n');process.exitCode=1;}
}
