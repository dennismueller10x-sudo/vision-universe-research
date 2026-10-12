/** Data-only exact MG industry taxonomy + SEC as-known adaptation. No strategy engine. */
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
export const INDUSTRY_CONTRACT=freeze({schema:'supertrader-industry-contract-1.0.0',methodId:'industry_momentum',priorReference:'#589',source:{id:'mg1999',url:'https://spinup-000d1a-wp-offload-media.s3.amazonaws.com/faculty/wp-content/uploads/sites/3/2019/09/DoIndustriesExplainMomentum.pdf',locator:'Journal of Finance54(1999), SectionI/footnote3/TableI pp1252–1254; SectionIII.B p1259'},original:{rankingMonths:6,rankingOffsets:[-6,-1],skipMonths:0,selectedIndustries:3,holdingMonths:6,cohorts:6,industryWeights:'EQUAL',stockWeights:'VALUE_WEIGHT_MONTHLY_INDUSTRY_CONSTITUENTS',classification:'CRSP_TIME_SERIES_SIC_EXACT_TABLE_I_GROUPED_TWO_DIGIT',longShort:true},adaptation:'SEC_FILING_HEADER_SIC_KNOWN_FROM_ACCEPTANCE_IS_NOT_CRSP_CLASSIFICATION_IDENTITY',engineEligibility:'BLOCKED_HISTORICAL_BROAD_CONSTITUENTS_AND_MARKET_EQUITY_UNCERTIFIED',noFrenchIndustryProxy:true,noSectorEtfProxy:true,noCurrentSicFallback:true,noPaperReturnInheritance:true,noFrozenTenMethodChanges:true});
export const MG20_INDUSTRIES=freeze([
 ['MINING','Mining',[[10,14]]],['FOOD','Food',[[20,20]]],['APPAREL','Apparel',[[22,23]]],['PAPER','Paper',[[26,26]]],['CHEMICAL','Chemical',[[28,28]]],['PETROLEUM','Petroleum',[[29,29]]],['CONSTRUCTION','Construction',[[32,32]]],['PRIMARY_METALS','Primary Metals',[[33,33]]],['FABRICATED_METALS','Fabricated Metals',[[34,34]]],['MACHINERY','Machinery',[[35,35]]],['ELECTRICAL_EQUIPMENT','Electrical Equipment',[[36,36]]],['TRANSPORT_EQUIPMENT','Transport Equipment',[[37,37]]],['MANUFACTURING','Manufacturing',[[38,39]]],['RAILROADS','Railroads',[[40,40]]],['OTHER_TRANSPORT','Other Transportation',[[41,47]]],['UTILITIES','Utilities',[[49,49]]],['DEPARTMENT_STORES','Department Stores',[[53,53]]],['RETAIL','Retail',[[50,52],[54,59]]],['FINANCIAL','Financial',[[60,69]]],['OTHER','Other',[]]
].map(([id,name,sic2Ranges],index)=>({id,name,sourceTableIndex:index+1,sic2Ranges})));
const cik=x=>/^\d{1,10}$/.test(String(x??''))&&Number(x)>0?String(x).padStart(10,'0'):null;
const utc=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
const official=u=>typeof u==='string'&&/^https:\/\/(?:www\.)?sec\.gov\/(?:Archives\/|files\/)/.test(u);
const officialAcceptance=u=>official(u)||(typeof u==='string'&&/^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/.test(u));
export function mg20Industry(sic){
 const s=String(sic??'');if(!/^\d{4}$/.test(s)||s==='0000')return null;
 const n=Number(s.slice(0,2));return MG20_INDUSTRIES.find(g=>g.sic2Ranges.some(([lo,hi])=>n>=lo&&n<=hi))?.id??'OTHER';
}
function easternStamp(acceptedAt){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(acceptedAt)).map(p=>[p.type,p.value]));
 return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}
export function headerEasternToUtc(stamp){
 if(typeof stamp!=='string'||!/^\d{14}$/.test(stamp))throw Error('VALID_SEC_HEADER_LOCAL_STAMP_REQUIRED');
 const pseudo=Date.UTC(+stamp.slice(0,4),+stamp.slice(4,6)-1,+stamp.slice(6,8),+stamp.slice(8,10),+stamp.slice(10,12),+stamp.slice(12,14));
 const possible=[4,5].map(hours=>new Date(pseudo+hours*3600000).toISOString()).filter(date=>easternStamp(date)===stamp);
 if(possible.length!==1)throw Error(possible.length?'AMBIGUOUS_SEC_HEADER_EASTERN_TIME':'INVALID_SEC_HEADER_EASTERN_TIME');
 return possible[0];
}
export function sicEventFromFilingHeader(text,{sourceUrl,acceptedAt,acceptanceSourceUrl,clockPolicy='STRICT_API_HEADER_AGREEMENT'}={}){
 if(typeof text!=='string'||!official(sourceUrl)||!utc(acceptedAt)||!officialAcceptance(acceptanceSourceUrl))throw Error('OFFICIAL_FILING_AND_UTC_ACCEPTANCE_PROVENANCE_REQUIRED');
 if(!['STRICT_API_HEADER_AGREEMENT','HEADER_EASTERN_AUTHORITATIVE'].includes(clockPolicy))throw Error('EXPLICIT_VALID_CLOCK_POLICY_REQUIRED');
 const documentAt=text.indexOf('<DOCUMENT>'),header=documentAt>=0?text.slice(0,documentAt):text;
 const acceptance=header.match(/<ACCEPTANCE-DATETIME>\s*(\d{14})/i)?.[1];
 const headerUtc=headerEasternToUtc(acceptance),apiMatches=Date.parse(acceptedAt)===Date.parse(headerUtc);
 if(!apiMatches&&clockPolicy==='STRICT_API_HEADER_AGREEMENT')throw Error('SEC_HEADER_ACCEPTANCE_NORMALIZATION_MISMATCH');
 const sics=[...new Set([...header.matchAll(/STANDARD INDUSTRIAL CLASSIFICATION:[^\r\n]*?\[(\d{4})\]/gi)].map(m=>m[1]))];
 const ciks=[...new Set([...header.matchAll(/CENTRAL INDEX KEY:\s*(\d{1,10})/gi)].map(m=>cik(m[1])))];
 const accession=header.match(/ACCESSION NUMBER:\s*([\d-]+)/i)?.[1];
 if(sics.length!==1||ciks.length!==1||!ciks[0]||!mg20Industry(sics[0])||!/^\d{10}-\d{2}-\d{6}$/.test(accession??''))return {status:'BLOCKED_SIC_HEADER_AMBIGUOUS_OR_MISSING',event:null};
 const clockProof={policy:clockPolicy,headerLocal:acceptance,headerUtc,apiReportedAt:acceptedAt,apiMatchesHeader:apiMatches,certification:apiMatches?'PRIMARY_HEADER_API_AGREEMENT':'PIT_PARTIAL_API_CLOCK_CONFLICT',confidence:'MEDIUM'};
 return {status:'READY_SEC_AS_KNOWN_ADAPTATION',event:{cik:ciks[0],sic:sics[0],industry:mg20Industry(sics[0]),accession,knownFrom:headerUtc,headerAcceptanceLocal:acceptance,sourceUrl,acceptanceSourceUrl,clockProof,classificationBasis:'SEC_FILING_HEADER_AS_KNOWN_NOT_CRSP'}};
}
export function industryAsKnown(events,{issuerCik,asOf}={}){
 if(!cik(issuerCik)||!utc(asOf))throw Error('ISSUER_AND_UTC_AS_OF_REQUIRED');
 const selected=[];
 for(const e of events??[]){if(!utc(e.knownFrom)||!cik(e.cik)||!mg20Industry(e.sic)||!official(e.sourceUrl)||!officialAcceptance(e.acceptanceSourceUrl)||!e.clockProof||Date.parse(e.knownFrom)!==Date.parse(e.clockProof.headerUtc))throw Error('INVALID_SIC_EVENT_PROVENANCE');if(cik(e.cik)===cik(issuerCik)&&Date.parse(e.knownFrom)<=Date.parse(asOf))selected.push(e);}
 selected.sort((a,b)=>Date.parse(b.knownFrom)-Date.parse(a.knownFrom)||a.accession.localeCompare(b.accession));
 if(!selected.length)return {status:'BLOCKED_SIC_AS_KNOWN_MISSING',industry:null,event:null};
 const latest=selected[0],tied=selected.filter(e=>Date.parse(e.knownFrom)===Date.parse(latest.knownFrom));
 if(new Set(tied.map(e=>e.sic)).size!==1)return {status:'BLOCKED_SIC_CONFLICT',industry:null,event:null};
 return {status:'READY_SEC_AS_KNOWN_ADAPTATION',industry:mg20Industry(latest.sic),event:latest,originalCrspReplication:false};
}
export function marketEquityForIndustry(datum,member,{valuationDate,asOf}={}){
 const p=datum?.provenance,f=datum?.fact,c=f?.certification;
 if(!utc(asOf)||!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate??''))throw Error('VALUATION_DATE_AND_UTC_CUTOFF_REQUIRED');
 const bound=member?.instrumentType==='COMMON_STOCK'&&member.shareClassPolicy==='SINGLE_CLASS_VERIFIED'&&cik(member.issuerCik)&&typeof member.issuerId==='string'&&typeof member.listingId==='string'
  &&datum?.eligible===true&&['DERIVED','VERIFIED'].includes(datum.state)&&f?.key==='marketEquity'&&f.unit==='USD'&&Number.isFinite(f.value)&&f.value>0&&c?.normalized===true&&c.concept==='marketEquity'&&c.basis==='ACTUAL_POINT_IN_TIME_SPLIT_ALIGNED'
  &&p?.securityId===member.id&&p.listingId===member.listingId&&p.issuerId===member.issuerId&&cik(p.cik)===cik(member.issuerCik)&&p.valuationDate===valuationDate&&p.priceDate===valuationDate&&f.periodEnd===valuationDate
  &&utc(p.knownFrom)&&utc(f.availableAt)&&Date.parse(p.knownFrom)===Date.parse(f.availableAt)&&Date.parse(p.knownFrom)<=Date.parse(asOf)&&utc(p.formationAsOf)&&Date.parse(p.formationAsOf)===Date.parse(asOf)
  &&p.exactSharesAtPriceDateEstablished===true&&c.state===datum.state&&c.provenance?.securityId===p.securityId&&c.provenance?.issuerId===p.issuerId&&c.provenance?.listingId===p.listingId&&official(f.source?.url)&&typeof f.source?.accession==='string';
 return bound?{status:'READY_BOUND_MARKET_EQUITY',value:f.value,datum}:{status:'BLOCKED_MARKET_EQUITY_IDENTITY_OR_SOURCE_BINDING',value:null};
}
export function industryValueWeights(members,{formationMonth,valuationMonth,valuationDate,asOf,membershipCertificate,monthlyEndpoint}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(valuationMonth??'')||!utc(asOf)||!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate??''))throw Error('SOURCE_VALUATION_DATE_AND_UTC_AS_OF_REQUIRED');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(formationMonth??''))throw Error('FORMATION_MONTH_REQUIRED');
 const ordinal=m=>Number(m.slice(0,4))*12+Number(m.slice(5))-1;
 if(ordinal(formationMonth)-ordinal(valuationMonth)!==1||valuationDate.slice(0,7)!==valuationMonth||valuationDate>asOf.slice(0,10))throw Error('PRIOR_MONTH_MARKET_EQUITY_REQUIRED');
 const endpoint=monthlyEndpoint,source=endpoint?.source;
 const endpointCertified=endpoint?.status==='VERIFIED_MONTH_END_SESSION'&&endpoint.month===valuationMonth&&endpoint.lastSession===valuationDate&&utc(endpoint.knownFrom)&&Date.parse(endpoint.knownFrom)<=Date.parse(asOf)&&typeof source?.id==='string'&&source.id.length>0&&/^[a-f0-9]{64}$/.test(source.sha256??'')&&(['CERTIFIED_EXCHANGE_SESSION_CALENDAR','FROZEN_RUNNER_MONTHLY_ENDPOINT'].includes(source.basis))&&(source.basis!=='FROZEN_RUNNER_MONTHLY_ENDPOINT'||/^[a-f0-9]{64}$/.test(source.frozenProtocolHash??''));
 if(!endpointCertified)return {status:'BLOCKED_PRIOR_MONTH_ENDPOINT_UNCERTIFIED',industryGroups:[],rejections:[],missingIndustries:MG20_INDUSTRIES.map(g=>g.id),broadMembershipCertified:false,engineEligibility:INDUSTRY_CONTRACT.engineEligibility,originalCrspReplication:false};
 const groups=new Map(MG20_INDUSTRIES.map(g=>[g.id,[]])),rejections=[],seen=new Set();
 for(const m of members??[]){
  if(typeof m.id!=='string'||!m.id||seen.has(m.id))throw Error('UNIQUE_SECURITY_ID_REQUIRED');seen.add(m.id);
  const cl=m.classification;
  if(cl?.status!=='READY_SEC_AS_KNOWN_ADAPTATION'||!groups.has(cl.industry)||!utc(cl.event?.knownFrom)||Date.parse(cl.event.knownFrom)>Date.parse(asOf)||mg20Industry(cl.event.sic)!==cl.industry||cik(cl.event.cik)!==cik(m.issuerCik)||!cik(m.issuerCik)||!official(cl.event.sourceUrl)||!officialAcceptance(cl.event.acceptanceSourceUrl)){rejections.push({id:m.id,reason:'SIC_AS_KNOWN_ISSUER_BINDING_UNCERTIFIED'});continue;}
  const me=marketEquityForIndustry(m.marketEquity,m,{valuationDate,asOf});
  if(me.status!=='READY_BOUND_MARKET_EQUITY'){rejections.push({id:m.id,reason:'HISTORICAL_MARKET_EQUITY_UNCERTIFIED'});continue;}
  groups.get(cl.industry).push({id:m.id,marketEquity:me.value,classificationEvent:cl.event,marketEquityProvenance:me.datum});
 }
 const industryGroups=[...groups].map(([industry,rows])=>{const total=rows.reduce((s,r)=>s+r.marketEquity,0);if(rows.length&&!Number.isFinite(total))return {industry,members:[],status:'NONFINITE_MARKET_EQUITY_SUM'};return {industry,members:rows.map(r=>({...r,weight:r.marketEquity/total})),status:rows.length?'AVAILABLE':'MISSING_CONSTITUENTS'};});
 const mc=membershipCertificate,broadMembershipCertified=mc?.state==='CERTIFIED_HISTORICAL_BROAD_MEMBERSHIP'&&utc(mc.asOf)&&Date.parse(mc.asOf)===Date.parse(asOf)&&/^[a-f0-9]{64}$/.test(mc.certificateSha256??'')&&/^[a-f0-9]{64}$/.test(mc.sourceManifestSha256??'')&&Array.isArray(mc.securityIds)&&mc.securityIds.length===seen.size&&new Set(mc.securityIds).size===seen.size&&mc.securityIds.every(id=>seen.has(id));
 const missingIndustries=industryGroups.filter(g=>g.status!=='AVAILABLE').map(g=>g.industry),status=broadMembershipCertified&&rejections.length===0&&missingIndustries.length===0?'READY_SEC_VU_ADAPTATION_DATA':'PARTIAL_INDUSTRY_DATA';
 return {status,formationMonth,valuationMonth,valuationDate,asOf,industryGroups,rejections,missingIndustries,broadMembershipCertified,originalCrspReplication:false,engineEligibility:INDUSTRY_CONTRACT.engineEligibility,noCurrentSicFallback:true};
}
