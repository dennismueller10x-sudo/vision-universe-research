/** Display quality over unchanged real observations and exact MIC sessions.
 * No prices, sessions, adjustments, issuer facts or analytical readiness are inferred. */
export const POLICY=Object.freeze({maximumMicroGapSessions:2,maximumSmallGapSessions:5,maximumMinorGapSessions:5,maximumMinorMissingRatio:0.10,readyMissingRatio:0.02,minimumSafeObservations:20,minimumSafeSpanDays:30,severeCloseRatio:2});
export function assessContinuity({points,segments,calendar,mic,securityId,listingId,excludedDates=[],providerDates=null,corporateActions=[],transitions=[],identityExcludedDates=[]}){
 if(!calendar?.verified||calendar.mic!==mic||!Array.isArray(calendar.sessions)||!Array.isArray(points)||points.length<2)throw Error('EXACT_MIC_CALENDAR_AND_REAL_POINTS_REQUIRED');
 const all=calendar.sessions.map(x=>x.date),index=new Map(all.map((d,i)=>[d,i])),excluded=new Set(excludedDates),provider=providerDates?new Set(providerDates):null,identity=new Set(identityExcludedDates);
 const verified=e=>e&&e.verified===true&&/^[a-f0-9]{64}$/.test(e.sourceSha256||'')&&e.mic===mic&&securityId&&listingId&&e.securityId===securityId&&e.listingId===listingId;
 const actions=new Map(corporateActions.filter(e=>verified(e)&&e.sourceKind==='OFFICIAL_CORPORATE_ACTION'&&e.factorConvention==='NEW_SHARES_PER_OLD_SHARE'&&Number.isFinite(e.factor)&&e.factor>0&&e.factor!==1).map(e=>[e.date,e]));
 const changes=new Map(transitions.filter(e=>verified(e)&&e.securityId&&e.fromSecurityId===e.securityId&&e.toSecurityId===e.securityId&&['SYMBOL_CHANGE','PRIMARY_LISTING_CHANGE','SECONDARY_LISTING_CHANGE'].includes(e.type)).map(e=>[e.date,e]));
 if(new Set(all).size!==all.length||all.some((d,i)=>i&&d<=all[i-1]))throw Error('INVALID_SESSION_CALENDAR');
 if(points.some((p,i)=>!index.has(p[0])||!Number.isFinite(p[1])||p[1]<=0||i&&p[0]<=points[i-1][0]))throw Error('INVALID_OR_NON_SESSION_POINT');
 const first=points[0][0],last=points.at(-1)[0],expected=all.slice(index.get(first),index.get(last)+1),gaps=[],closures=[],breaks=[];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],missing=all.slice(index.get(a[0])+1,index.get(b[0])),ratio=b[1]/a[1];
  const closedDays=Math.round((Date.parse(b[0])-Date.parse(a[0]))/86400000)-missing.length-1;if(closedDays>0)closures.push({from:a[0],to:b[0],calendarDays:closedDays,classification:'EXPECTED_MARKET_CLOSURE'});
  if(missing.length){const quarantined=missing.filter(d=>excluded.has(d)).length,classification=quarantined===missing.length?'QUARANTINE_GAP':provider&&missing.every(d=>!excluded.has(d)&&!provider.has(d))?'PROVIDER_DATA_GAP':'MIXED_MISSING_GAP';gaps.push({from:a[0],to:b[0],firstMissing:missing[0],lastMissing:missing.at(-1),missingSessions:missing.length,missingDates:missing,quarantinedSessions:quarantined,classification,sizeClass:missing.length<=POLICY.maximumMicroGapSessions?'MICRO_GAP':missing.length<=POLICY.maximumSmallGapSessions?'SMALL_GAP':'MAJOR_PROVIDER_GAP',causes:missing.map(date=>({date,classification:excluded.has(date)?quarantined===1?'QUARANTINED_SINGLE_BAR':'QUARANTINED_CLUSTER':provider&&!provider.has(date)?'PROVIDER_MISSING_DAY':'UNKNOWN'}))});}
 const candidate=actions.get(b[0]),action=candidate&&Math.abs(ratio*candidate.factor-1)<=0.05?candidate:null,change=changes.get(b[0]);
  if(ratio>=POLICY.severeCloseRatio||ratio<=1/POLICY.severeCloseRatio)breaks.push({from:a[0],to:b[0],ratio,classification:action?'CORPORATE_ACTION_BREAK':'UNKNOWN_BREAK',sourceSha256:action?.sourceSha256||null});
  if(change)breaks.push({from:a[0],to:b[0],ratio,classification:change.type,continuityClass:'IDENTITY_TRANSITION',sourceSha256:change.sourceSha256});
  if(all.slice(index.get(a[0])+1,index.get(b[0])).some(d=>identity.has(d)))breaks.push({from:a[0],to:b[0],ratio,classification:'IDENTITY_QUARANTINE_INTERVAL',continuityClass:'IDENTITY_TRANSITION'});
 }
 const missing=expected.length-points.length,major=gaps.filter(g=>g.sizeClass==='MAJOR_PROVIDER_GAP'),isolated=(segments||[]).filter(s=>s.length===1).length;
 const status=breaks.some(b=>b.classification==='UNKNOWN_BREAK')||points.length<POLICY.minimumSafeObservations?'BROKEN':major.length||missing/expected.length>POLICY.maximumMinorMissingRatio?'MAJOR_GAPS':missing||breaks.length?'MINOR_GAPS':'CLEAN';
 return {first,last,observations:points.length,expectedTradingSessions:expected.length,missingTradingSessions:missing,missingRatio:missing/expected.length,longestMissingGapSessions:Math.max(0,...gaps.map(g=>g.missingSessions)),largeGapCount:major.length,gaps,marketClosures:{classification:'EXPECTED_MARKET_CLOSURE',intervalCount:closures.length,calendarDays:closures.reduce((n,x)=>n+x.calendarDays,0),examples:closures.slice(0,3)},breaks,segmentCount:segments?.length||1,isolatedSegmentCount:isolated,visualQualityStatus:status};
}
export function safeDisplayWindow(points,assessment){
 // Duration is a display segment boundary, never an identity/price certificate.
 // Only unresolved severe price breaks can exclude a preceding history block.
 const boundaries=assessment.breaks.filter(b=>b.classification==='UNKNOWN_BREAK'||b.classification==='UNSAFE_BREAK').map(b=>b.to);
 const proposed=boundaries.sort().at(-1)||points[0][0],safe=points.filter(p=>p[0]>=proposed),sufficient=safe.length>=POLICY.minimumSafeObservations&&Date.parse(safe.at(-1)[0])-Date.parse(safe[0][0])>=POLICY.minimumSafeSpanDays*86400000;
 return {safeHistoryStart:sufficient?proposed:points[0][0],truncated:sufficient&&proposed!==points[0][0],reasons:!sufficient?['UNSAFE_SUFFIX_TOO_SHORT_CHART_BLOCKED']:proposed!==points[0][0]?['UNRESOLVED_SEVERE_PRICE_BREAK_EXCLUDED']:[],points:sufficient?safe:points};
}
export function safeSegments(points,assessment){
 const boundaries=new Set(assessment.gaps.filter(g=>g.sizeClass==='MAJOR_PROVIDER_GAP').map(g=>g.to).concat(assessment.breaks.map(b=>b.to))),result=[];
 for(const p of points){if(!result.length||boundaries.has(p[0]))result.push([]);result.at(-1).push(p);}
 return result;
}
