/* Explicit approval binds publication to every byte of the previously reviewed consumer.
   No ledger facts, producer timestamps, profiles or source classes are changed. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const approval=JSON.parse(readFileSync(new URL('../../company-intelligence/config/production-approval.json',import.meta.url)));
const originalBytes=readFileSync(new URL('../../docs/company-intelligence/full-data-consumer-manifest.json',import.meta.url));
export const reviewed=JSON.parse(originalBytes);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function approvedForPublication(m){
 return approval.schema===1 && approval.approvalId==='dennis-controlled-production-20261007' &&
  createHash('sha256').update(originalBytes).digest('hex')===approval.reviewedManifestSha256 &&
  m?.productionApproval===approval.approvalId && m.releaseState==='APPROVED_CONTROLLED_PRODUCTION' &&
  m.generation===approval.consumerGeneration && m.generation===reviewed.generation &&
  m.generatedAt===reviewed.generatedAt && m.sourceUsagePolicy===approval.sourceUsagePolicy &&
  equal(m.tickers,reviewed.tickers) && m.tickers.length===approval.tickers && equal(m.assets,reviewed.assets);
}
export function approve(directory){
 const path=directory+'/manifest.json',m=JSON.parse(readFileSync(path));
 if(!equal(m,reviewed))throw Error('EXACT_REVIEWED_MANIFEST_REQUIRED');
 const approved={...m,releaseState:'APPROVED_CONTROLLED_PRODUCTION',productionApproval:approval.approvalId};
 if(!approvedForPublication(approved))throw Error('PRODUCTION_APPROVAL_INVALID');
 writeFileSync(path,JSON.stringify(approved)+'\n');return approved;
}
