import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as Listing from '../../validation/lib.mjs';
import {parseFrenchMonthlyPortfolios,parseFrenchDailyRF,createDailyRFAdapter,referenceArithmeticReport} from './reference-return-arithmetic.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
const hashFile=p=>sha(fs.readFileSync(p));

export function verifyReferenceCaptureBindings({plan,planBytes,freeze,parserBytes}){
 demand(plan?.schema==='vision-universe-calibration-v3-reference-source-plan-1.0.0','V3_REFERENCE_SOURCE_PLAN_SCHEMA_REQUIRED');
 demand(plan.sources?.length===3&&['FRENCH_MOM10','FRENCH_VAR','FRENCH_DAILY_RF'].every(id=>plan.sources.some(s=>s.id===id)),'V3_REFERENCE_SOURCE_SET_REQUIRED');
 demand(freeze?.status==='NOT_FROZEN_MISSING_DURABLE_INPUT_RECEIPTS'&&freeze.strategyDefinitionsChanged===false&&freeze.postResultTuningAllowed===false,'V3_PREMEASUREMENT_CANDIDATE_FREEZE_REQUIRED');
 demand(freeze.referenceSourcePlanSha256===sha(planBytes),'V3_REFERENCE_PLAN_FREEZE_HASH_MISMATCH');
 demand(plan.parser?.path==='scripts/supertrader/research/calibration/reference-return-arithmetic.mjs'&&plan.parser.sha256===sha(parserBytes),'V3_REFERENCE_PARSER_HASH_MISMATCH');
 for(const s of plan.sources){demand(/^https:\/\/mba\.tuck\.dartmouth\.edu\/pages\/faculty\/ken\.french\/ftp\/[A-Za-z0-9_-]+\.zip$/.test(s.url),'OFFICIAL_FRENCH_SOURCE_URL_REQUIRED');demand(/^[a-f0-9]{64}$/.test(s.expectedArchiveSha256||'')&&/^[a-f0-9]{64}$/.test(s.expectedMemberSha256||''),'V3_REFERENCE_SOURCE_HASH_REQUIRED');demand(/^[A-Za-z0-9_.-]+\.csv$/i.test(s.archiveMember||''),'V3_REFERENCE_MEMBER_NAME_INVALID');}
 return true;
}

function privateDirectory(out){const d=path.resolve(out);demand(!d.startsWith(ROOT+path.sep)&&d!==ROOT,'PRIVATE_REFERENCE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');fs.mkdirSync(d,{recursive:true,mode:0o700});fs.chmodSync(d,0o700);return d;}
function seal(out,name,bytes,keys){for(const [audience,key] of Object.entries(keys))fs.writeFileSync(path.join(out,`${name}.${audience}.sealed.json`),Listing.encryptForOwner(key,bytes),{mode:0o600,flag:'wx'});}
function sourcePeriod(parsed){const rows=parsed.rows||[];return rows.length?{first:rows[0].month||rows[0].date,last:rows.at(-1).month||rows.at(-1).date,rows:rows.length}:null;}

export async function captureReferenceV3({out,planPath=path.join(HERE,'CALIBRATION-V3-REFERENCE-SOURCE-PLAN.json'),freezePath=path.join(HERE,'BACKTEST-CALIBRATION-FREEZE-V3.json')}={}){
 const dest=privateDirectory(out),planBytes=fs.readFileSync(planPath),plan=JSON.parse(planBytes),freezeBytes=fs.readFileSync(freezePath),freeze=JSON.parse(freezeBytes),parserPath=path.join(HERE,'reference-return-arithmetic.mjs'),parserBytes=fs.readFileSync(parserPath);
 verifyReferenceCaptureBindings({plan,planBytes,freeze,parserBytes});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vu-cal-v3-reference-'));
 try{
  const keys={owner:fs.readFileSync(path.join(ROOT,'scripts/supertrader/validation/results-public-key.pem'),'utf8'),session:fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/session-public-key.pem'),'utf8')};
  const refs={},fileReceipts=[];
  for(const src of plan.sources){
   const response=await fetch(src.url,{redirect:'follow'});demand(response.ok,'OFFICIAL_REFERENCE_FETCH_FAILED');
   const archive=Buffer.from(await response.arrayBuffer());demand(sha(archive)===src.expectedArchiveSha256,'V3_REFERENCE_ARCHIVE_HASH_MISMATCH');
   const archivePath=path.join(temp,`${src.id}.zip`);fs.writeFileSync(archivePath,archive,{mode:0o600,flag:'wx'});
   const member=execFileSync('unzip',['-p',archivePath,src.archiveMember],{maxBuffer:32*1024*1024});demand(sha(member)===src.expectedMemberSha256,'V3_REFERENCE_MEMBER_HASH_MISMATCH');
   const stem=src.id.toLowerCase().replaceAll('_','-');seal(dest,`${stem}-archive`,archive,keys);seal(dest,`${stem}-member`,member,keys);
   const memberText=member.toString('utf8');let parsed;
   if(src.id==='FRENCH_MOM10')parsed=parseFrenchMonthlyPortfolios(memberText,{kind:'MOMENTUM_EW'});
   else if(src.id==='FRENCH_VAR')parsed=parseFrenchMonthlyPortfolios(memberText,{kind:'VARIANCE_EW'});
   else parsed=parseFrenchDailyRF(memberText);
   refs[src.id]=parsed;
   fileReceipts.push({id:src.id,url:src.url,archiveSha256:sha(archive),archiveBytes:archive.length,memberName:src.archiveMember,memberSha256:sha(member),memberBytes:member.length,period:sourcePeriod(parsed),sourceVintage:src.sourcePeriod,sourceValuesPublished:false});
  }
  const from='2018-01',to='2026-08',rfAdapter=createDailyRFAdapter(refs.FRENCH_DAILY_RF);
  const parsedArtifact={schema:'vision-universe-calibration-v3-parsed-reference-private-1.0.0',createdAt:new Date().toISOString(),sourcePlanSha256:sha(planBytes),candidateFreezeSha256:sha(freezeBytes),parserSha256:sha(parserBytes),referenceWindow:{from,to},monthlySeries:{momentumEW:refs.FRENCH_MOM10,varianceEW:refs.FRENCH_VAR},riskFreeDaily:rfAdapter.toRows({from:'2015-01-01',to:'2026-09-30',includeMissing:true}),riskFreeMetadata:{sourceId:'FRENCH_DAILY_RF',unit:refs.FRENCH_DAILY_RF.unit,conversion:refs.FRENCH_DAILY_RF.conversion,historicalVintage:refs.FRENCH_DAILY_RF.historicalVintage,originalDatastreamEquivalence:refs.FRENCH_DAILY_RF.originalDatastreamEquivalence,missingObservations:refs.FRENCH_DAILY_RF.missingObservations,missingRFNeverFilled:true},reports:[referenceArithmeticReport(refs.FRENCH_MOM10,{from,to}),referenceArithmeticReport(refs.FRENCH_VAR,{from,to})],stockConstructionCertified:false,providerValuesPublic:false,noPostResultToleranceChanges:true};
  const parsedBytes=Buffer.from(JSON.stringify(parsedArtifact));seal(dest,'reference-parsed',parsedBytes,keys);
  const files=fs.readdirSync(dest).sort().map(name=>({name,sha256:hashFile(path.join(dest,name)),bytes:fs.statSync(path.join(dest,name)).size}));
  const schema={schemaId:'vision-universe-calibration-v3-reference-safe-status-1.0.0',fields:['schema','status','workflowRunId','codeCommit','sourcePlanSha256','parserSha256','referenceWindow','sources','parsedArtifactSha256','encryptedFiles','performanceCalculated','privateValuesPublished'].sort()};
  const status={schema:schema.schemaId,status:'REFERENCE_CAPTURE_PARSED_ENCRYPTED_PENDING_INDEPENDENT_REVIEW',workflowRunId:process.env.GITHUB_RUN_ID||null,codeCommit:process.env.GITHUB_SHA||null,sourcePlanSha256:sha(planBytes),parserSha256:sha(parserBytes),referenceWindow:{from,to},sources:fileReceipts.map(({id,url,archiveSha256,archiveBytes,memberName,memberSha256,memberBytes,period})=>({id,url,archiveSha256,archiveBytes,memberName,memberSha256,memberBytes,period})),parsedArtifactSha256:sha(parsedBytes),parsedArtifactSchema:parsedArtifact.schema,encryptedFiles:files,contentManifestSha256:sha(Buffer.from(JSON.stringify(files))),schemaHash:sha(Buffer.from(JSON.stringify(schema))),recipientScheme:'OWNER_AND_SESSION_ENVELOPES',recipientId:'NOT_PUBLIC',performanceCalculated:false,privateValuesPublished:false};
  fs.writeFileSync(path.join(dest,'reference-safe-status.json'),JSON.stringify(status,null,2)+'\n',{mode:0o600,flag:'wx'});
  return status;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error('EXPLICIT_PRIVATE_OUTPUT_REQUIRED');
 try{const status=await captureReferenceV3({out:process.argv[i+1]});process.stdout.write(JSON.stringify({status:status.status,sourceCount:status.sources.length,parsedArtifactSha256:status.parsedArtifactSha256,performanceCalculated:false})+'\n');}
 catch(e){process.stderr.write(JSON.stringify({status:'REFERENCE_CAPTURE_FAILED_CLOSED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_CAPTURE_FAILURE'})+'\n');process.exitCode=1;}
}
