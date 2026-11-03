/** Read-only check of the committed Europe Discover publication against the
 * wall clock: verifies the manifest hash chain, runs the unchanged session
 * proof and Discover admission for every listing and fails when a listing that
 * was not explicitly held by the last refresh is not displayable. */
import {createRequire} from 'node:module';
import {loadBaseline} from './europe-discover-refresh.mjs';
const require=createRequire(import.meta.url),Sessions=require('../../core/europe-session-proof.js'),Admission=require('../../core/europe-discover-eligibility.js');
export async function check({root=process.cwd(),now=new Date().toISOString()}={}){
 const b=await loadBaseline(root),coverage=Object.values(b.calendar.calendars)[0];let projected;
 try{projected=Sessions.refreshCatalog(b.catalog,b.calendar,{now});}catch(e){return {now,securities:b.catalog.securities.length,eligible:0,blocked:b.catalog.securities.length,sessionProofError:e.message,calendar:{from:coverage.coverageFrom,to:coverage.coverageTo}};}
 const held=new Set((b.manifest.refresh?.held||[]).map(h=>h.securityId)),rows=projected.securities.map(s=>{const l=s.listings[0],e=Admission.evaluate(s,l,now);return {securityId:s.securityId,lastDate:l.discoverChart.lastDate,sessionLag:l.discoverChart.sessionLag,freshness:l.discoverChart.freshness,eligible:e.DISCOVER_ELIGIBLE,reasons:e.discoverReasonCodes};});
 const blocked=rows.filter(r=>!r.eligible&&!held.has(r.securityId));
 return {now,securities:rows.length,eligible:rows.filter(r=>r.eligible).length,held:held.size,blocked:blocked.length,lastDates:[...new Set(rows.map(r=>r.lastDate))].sort(),calendar:{from:coverage.coverageFrom,to:coverage.coverageTo},examples:blocked.slice(0,5)};
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop())){const r=await check();console.log(JSON.stringify(r));if(r.blocked)process.exit(1);}
