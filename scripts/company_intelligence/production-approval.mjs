/* Explicit approval binds publication to every reviewed consumer byte, source policy
   and the unchanged 46-stock cohort. Accepted private baseline remains immutable. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {refreshApproved} from './refresh-approval.mjs';
export const approval=JSON.parse(readFileSync(new URL('../../company-intelligence/config/production-approval.json',import.meta.url)));
const originalBytes=readFileSync(new URL('../../docs/company-intelligence/full-data-consumer-manifest.json',import.meta.url));
export const reviewed=JSON.parse(originalBytes);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function approvedForPublication(m){
 if(refreshApproved(m))return true;
 return approval.schema===1 && ['dennis-controlled-production-20261007','dennis-top46-content-20261008'].includes(approval.approvalId) &&
  createHash('sha256').update(originalBytes).digest('hex')===approval.reviewedManifestSha256 &&
  m?.productionApproval===approval.approvalId && m.releaseState==='APPROVED_CONTROLLED_PRODUCTION' &&
  m.generation===approval.consumerGeneration && m.generation===reviewed.generation &&
  m.generatedAt===reviewed.generatedAt && m.sourceUsagePolicy===approval.sourceUsagePolicy &&
  equal(m.tickers,reviewed.tickers) && m.tickers.length===46 && approval.tickers===46 && approval.issuers===45 &&
  equal(m.tickers,JSON.parse(readFileSync(new URL('../../docs/company-intelligence/consumer-v2/top46-baseline-manifest.json',import.meta.url))).tickers) && equal(m.assets,reviewed.assets);
}
export function approve(directory){
 const path=directory+'/manifest.json',m=JSON.parse(readFileSync(path));
 if(!equal(m,reviewed))throw Error('EXACT_REVIEWED_MANIFEST_REQUIRED');
 const approved={...m,releaseState:'APPROVED_CONTROLLED_PRODUCTION',productionApproval:approval.approvalId};
 if(!approvedForPublication(approved))throw Error('PRODUCTION_APPROVAL_INVALID');
 writeFileSync(path,JSON.stringify(approved)+'\n');return approved;
}
