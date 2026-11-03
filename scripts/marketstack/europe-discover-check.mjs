/** Read-only check of the committed Europe Discover publication against the
 * wall clock: verifies the manifest hash chain and the per-stock publication
 * list, runs the unchanged session proof and Discover admission for every
 * listing and fails when a listing that the publication admitted is not
 * displayable, or when a blocked listing would be displayable. */
import {createRequire} from 'node:module';
import {loadBaseline} from './europe-discover-refresh.mjs';
const require=createRequire(import.meta.url),Sessions=require('../../core/europe-session-proof.js'),Admission=require('../../core/europe-discover-eligibility.js'),Isolation=require('../../core/europe-publication-isolation.js');
export async function check({root=process.cwd(),now=new Date().toISOString()}={}){
 const b=await loadBaseline(root),coverage=Object.values(b.calendar.calendars)[0],publication=Isolation.verify(b.manifest,b.catalog);let projected;
 try{projected=Sessions.refreshCatalog(b.catalog,b.calendar,{now});}catch(e){return {now,securities:b.catalog.securities.length,eligible:0,blocked:b.catalog.securities.length,sessionProofError:e.message,calendar:{from:coverage.coverageFrom,to:coverage.coverageTo}};}
 const held=new Set((b.manifest.refresh?.held||[]).map(h=>h.securityId)),explicit=new Set(publication.blocked.map(x=>x.securityId)),rows=projected.securities.map(s=>{const l=s.listings[0],e=Admission.evaluate(s,l,now);return {securityId:s.securityId,lastDate:l.discoverChart.lastDate,sessionLag:l.discoverChart.sessionLag,freshness:l.discoverChart.freshness,eligible:e.DISCOVER_ELIGIBLE,reasons:e.discoverReasonCodes};});
 const blocked=rows.filter(r=>!r.eligible&&!held.has(r.securityId)&&!explicit.has(r.securityId)),leaked=rows.filter(r=>r.eligible&&explicit.has(r.securityId));
 return {now,securities:rows.length,eligible:rows.filter(r=>r.eligible).length,admittedAtPublication:publication.admitted.length,publicationBlocked:publication.blocked.map(x=>({securityId:x.securityId,reasonClass:x.reasonClass,reasonCode:x.reasonCode})),held:held.size,blocked:blocked.length+leaked.length,leaked:leaked.map(r=>r.securityId),lastDates:[...new Set(rows.map(r=>r.lastDate))].sort(),calendar:{from:coverage.coverageFrom,to:coverage.coverageTo},examples:blocked.slice(0,5)};
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){const r=await check();console.log(JSON.stringify(r));if(r.blocked)process.exit(1);}
