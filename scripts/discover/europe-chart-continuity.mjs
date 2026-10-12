/** Display quality over unchanged real observations and exact MIC sessions.
 * No prices, sessions, adjustments, issuer facts or analytical readiness are inferred. */
export const POLICY=Object.freeze({maximumMinorGapSessions:3,maximumMinorMissingRatio:0.10,minimumSafeObservations:20,minimumSafeSpanDays:30,severeCloseRatio:2});
export function assessContinuity({points,segments,calendar,mic,excludedDates=[],providerDates=null,actionDates=[]}){
 if(!calendar?.verified||calendar.mic!==mic||!Array.isArray(calendar.sessions)||!Array.isArray(points)||points.length<2)throw Error('EXACT_MIC_CALENDAR_AND_REAL_POINTS_REQUIRED');
 const all=calendar.sessions.map(x=>x.date),index=new Map(all.map((d,i)=>[d,i])),excluded=new Set(excludedDates),provider=providerDates?new Set(providerDates):null,actions=new Set(actionDates);
 if(new Set(all).size!==all.length||all.some((d,i)=>i&&d<=all[i-1]))throw Error('INVALID_SESSION_CALENDAR');
 if(points.some((p,i)=>!index.has(p[0])||!Number.isFinite(p[1])||p[1]<=0||i&&p[0]<=points[i-1][0]))throw Error('INVALID_OR_NON_SESSION_POINT');
 const first=points[0][0],last=points.at(-1)[0],expected=all.slice(index.get(first),index.get(last)+1),gaps=[],closures=[],breaks=[];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],missing=all.slice(index.get(a[0])+1,index.get(b[0])),ratio=b[1]/a[1];
  const closedDays=Math.round((Date.parse(b[0])-Date.parse(a[0]))/86400000)-missing.length-1;if(closedDays>0)closures.push({from:a[0],to:b[0],calendarDays:closedDays,classification:'EXPECTED_MARKET_CLOSURE'});
  if(missing.length){const quarantined=missing.filter(d=>excluded.has(d)).length,classification=quarantined===missing.length?'QUARANTINE_GAP':provider&&missing.every(d=>!provider.has(d))?'PROVIDER_DATA_GAP':'UNKNOWN_BREAK';gaps.push({from:a[0],to:b[0],firstMissing:missing[0],lastMissing:missing.at(-1),missingSessions:missing.length,quarantinedSessions:quarantined,classification,sizeClass:missing.length<=POLICY.maximumMinorGapSessions?'SHORT_MISSING_GAP':'LONG_MISSING_GAP'});}
  if(ratio>=POLICY.severeCloseRatio||ratio<=1/POLICY.severeCloseRatio)breaks.push({from:a[0],to:b[0],ratio,classification:actions.has(b[0])?'CORPORATE_ACTION_BREAK':'UNKNOWN_BREAK'});
 }
 const missing=expected.length-points.length,major=gaps.filter(g=>g.sizeClass==='LONG_MISSING_GAP'),isolated=(segments||[]).filter(s=>s.length===1).length;
 const status=breaks.some(b=>b.classification==='UNKNOWN_BREAK')||points.length<POLICY.minimumSafeObservations?'BROKEN':major.length||missing/expected.length>POLICY.maximumMinorMissingRatio?'MAJOR_GAPS':missing||breaks.length?'MINOR_GAPS':'CLEAN';
 return {first,last,observations:points.length,expectedTradingSessions:expected.length,missingTradingSessions:missing,missingRatio:missing/expected.length,longestMissingGapSessions:Math.max(0,...gaps.map(g=>g.missingSessions)),largeGapCount:major.length,gaps,marketClosures:{classification:'EXPECTED_MARKET_CLOSURE',intervalCount:closures.length,calendarDays:closures.reduce((n,x)=>n+x.calendarDays,0),examples:closures.slice(0,3)},breaks,segmentCount:segments?.length||1,isolatedSegmentCount:isolated,visualQualityStatus:status};
}
export function safeDisplayWindow(points,assessment){
 const boundaries=assessment.gaps.filter(g=>g.sizeClass==='LONG_MISSING_GAP').map(g=>g.to).concat(assessment.breaks.map(b=>b.to));
 const proposed=boundaries.sort().at(-1)||points[0][0],safe=points.filter(p=>p[0]>=proposed),sufficient=safe.length>=POLICY.minimumSafeObservations&&Date.parse(safe.at(-1)[0])-Date.parse(safe[0][0])>=POLICY.minimumSafeSpanDays*86400000;
 return {safeHistoryStart:sufficient?proposed:points[0][0],truncated:sufficient&&proposed!==points[0][0],reasons:!sufficient?['SAFE_SUFFIX_TOO_SHORT_RETAINED_WITH_GAP_NOTICE']:proposed!==points[0][0]?['OLDER_MAJOR_GAPS_OR_BREAKS_EXCLUDED']:[],points:sufficient?safe:points};
}
