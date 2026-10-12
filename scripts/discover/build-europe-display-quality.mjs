/** Offline product quality replay. Reads the existing licensed Close artifacts;
 * private audit inputs never become product data or analytical certificates. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assessContinuity,safeDisplayWindow,POLICY} from './europe-chart-continuity.mjs';
import {readCentralLogoRegistry,buildEuropeCompanyLogoEvidence,inspectAsset} from '../marketstack/europe-company-logos.mjs';
const require=createRequire(import.meta.url),U=require('../../core/discover-universe.js');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x)),read=async p=>JSON.parse(await readFile(p,'utf8'));
const rangeDays={'1M':31,'3M':92,'6M':183,'1Y':366,'3Y':1096,'5Y':1827,'MAX':null};
export async function buildDisplayQuality({root=process.cwd(),calendarPath,exclusionsPath,fundamentalsPath,evidence,now,reportDir}){
 if(!calendarPath||!exclusionsPath||!fundamentalsPath||!evidence||!now||!reportDir)throw Error('EXPLICIT_OFFLINE_INPUTS_REQUIRED');
 const base=join(root,'discover/data/europe'),manifest=await read(join(base,'manifest.json')),catalogBytes=await readFile(join(base,'catalog.json')),catalog=JSON.parse(catalogBytes),calendarBytes=await readFile(calendarPath),calendar=JSON.parse(calendarBytes),exclusions=await read(exclusionsPath),funds=await read(fundamentalsPath),summary=await read(join(evidence,'summary.json'));
 if(sha(catalogBytes)!==manifest.catalog.sha256||catalog.securities.length!==449)throw Error('REVIEWED_BASELINE_REQUIRED');
 const oldCatalogSha=manifest.catalog.sha256,rows=[],visual=[],logos=[],fundamental=[],home=[];
 // Reuse the central, reviewed, exact legal issuer matcher. No ticker/name-only
 // ADR transfer, assets from providers, or unreviewed images are accepted.
 const registry=readCentralLogoRegistry(root),universe={mode:'PRIVATE_RESEARCH',publicationAllowed:false,generatedAt:now,listings:catalog.securities.map(s=>{const l=s.listings[0],ref=l.identityAdmission.evidenceRefs.find(e=>e.kind.includes('ISSUER')||e.kind.includes('GLEIF'));return {status:'ACCEPTED',companyKey:s.companyId,securityId:s.securityId,issuerCountry:l.identityAdmission.issuerCountry,identityEvidence:[{verified:true,lei:s.companyId.slice(4),issuerName:s.name,issuerCountry:l.identityAdmission.issuerCountry,source:{sha256:ref?.sha256||l.identityAdmission.evidenceRefs[0].sha256}}]};})};
 const central=buildEuropeCompanyLogoEvidence(universe,registry,{generatedAt:now});
 for(const s of catalog.securities){
  const l=s.listings.find(x=>x.listingId===s.primaryListingId),c=calendar.calendars[l.mic];
  if(!c||sha(calendarBytes)!==l.discoverChart.calendarSourceSha256||hash(exclusions[s.securityId])!==l.discoverChart.immutableExclusionsSha256)throw Error('CALENDAR_OR_QUARANTINE_BINDING_MISMATCH');
  const beforeLogo=s.logo.status,matched=central.companyEvidence[s.companyId]?.logo;
  if(matched){s.logo={status:matched.status,key:matched.status==='LOGO_VALID'?matched.key:null,companyId:s.companyId,initial:matched.initial.toUpperCase(),issuerCountry:l.identityAdmission.issuerCountry,evidenceRef:matched.evidenceRef,reason:matched.reason,blocksIdentity:false};}
  const nativeCredit=registry.credits.credits[l.ticker],native=nativeCredit?.nativeIssuerBinding;
  if(native&&nativeCredit.source==='WEBSITE'&&native.companyId===s.companyId&&native.isin===s.isin&&native.issuerName===s.name&&native.page===nativeCredit.page&&/^[a-f0-9]{64}$/.test(native.sourcePageSha256)&&inspectAsset(registry,l.ticker).asset){s.logo={...s.logo,status:'LOGO_VALID',key:l.ticker,reason:null,nativeBinding:native,evidenceRef:'central-native-issuer-logo:'+l.ticker+':'+nativeCredit.sha1};}
  logos.push({securityId:s.securityId,companyId:s.companyId,before:beforeLogo,status:s.logo.status,key:s.logo.key,reason:s.logo.reason,fallbackUsed:s.logo.status!=='LOGO_VALID',source:'EXISTING_REVIEWED_CENTRAL_LOGO_PIPELINE'});
  const f=funds.rows.find(x=>x.securityId===s.securityId),official=f?.official,metrics=[];
  // Absolute consolidated issuer facts can support an informational card;
  // shares, ADR ratios, market cap, valuation and Quant remain unlicensed here.
  for(const id of ['revenue','netIncome','operatingCashFlow']){
   const candidates=(official?.companyFacts||[]).filter(v=>v.metricId===id&&v.issuerLei===s.companyId.slice(4)&&v.reportingEntityLei===v.issuerLei&&v.reportingRelationship==='OFFICIAL_DECLARED_ISSUER'&&v.provenance?.mappingStatus==='VERIFIED_STANDARD'&&['ESEF','OFFICIAL_FILING'].includes(v.provenance.sourceSystem)&&Number.isFinite(v.value)&&v.unit==='currency_m'&&/^[A-Z]{3}$/.test(v.currency)&&v.periodEnd<=now.slice(0,10)&&Date.parse(v.availableAt)<=Date.parse(now));
   candidates.sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd));const v=candidates[0];
   if(v)metrics.push({metric:id,value:v.value*1e6,currency:v.currency,periodEnd:v.periodEnd,fiscalYear:v.fiscalYear,scope:'CONSOLIDATED_ISSUER_INFORMATION_ONLY',source:v.provenance.sourceSystem,sourceDocument:v.provenance.sourceDocument,sourceFilingId:v.sourceFilingId,packageSha256:v.provenance.packageSha256,normalizedSha256:v.provenance.normalizedSha256});
  }
  s.cardFundamentals={status:metrics.length?'BASIC_ISSUER_FACTS':'MISSING',metrics,marketCap:null,quantInputReady:false};
  fundamental.push({securityId:s.securityId,companyId:s.companyId,...s.cardFundamentals,reasonCodes:metrics.length?['ABSOLUTE_ISSUER_FACTS_ONLY_NO_SHARE_CLASS_TRANSFER']:['NO_VERIFIED_ISSUER_CARD_METRICS'],primarySources:['SEC_FOR_ACTUAL_FILERS','ESEF','OFFICIAL_FILINGS'],marketstack:'OPTIONAL_SUPPLEMENT_NOT_USED'});
  const meta=summary.results.find(x=>x.kind==='history'&&x.listing.securityId===s.securityId),normalBytes=await readFile(join(evidence,meta.resultPath));if(sha(normalBytes)!==meta.normalizedSha256)throw Error('PRIVATE_PROVIDER_HISTORY_INTEGRITY');
  const providerDates=JSON.parse(normalBytes).result.data.map(x=>x.normalized.tradingDate),policies={};
  const bound={MAX:manifest.history[s.securityId].MAX,'1Y':manifest.series[s.securityId]};let full,short;
  for(const [range,binding]of Object.entries(bound)){
   const bytes=await readFile(join(root,binding.url.slice(1)));if(sha(bytes)!==binding.sha256)throw Error('PUBLIC_CLOSE_SERIES_INTEGRITY');const series=JSON.parse(bytes),proof=range==='1Y'?l.discoverChart:l.discoverChart.ranges.MAX;
   if(hash(series.points)!==proof.pointsSha256||hash(series.segments)!==proof.segmentsSha256)throw Error('ORIGINAL_CLOSE_AND_SEGMENT_PROOF');
   const quality=assessContinuity({points:series.points,segments:series.segments,calendar:c,mic:l.mic,excludedDates:exclusions[s.securityId],providerDates}),window=safeDisplayWindow(series.points,quality),segments=series.segments.map(segment=>segment.filter(p=>p[0]>=window.safeHistoryStart)).filter(x=>x.length),safe=assessContinuity({points:window.points,segments,calendar:c,mic:l.mic,excludedDates:exclusions[s.securityId],providerDates});
   policies[range]={version:'vu-discover-display-window-1',sourcePointsSha256:proof.pointsSha256,sourceSegmentsSha256:proof.segmentsSha256,safeHistoryStart:window.safeHistoryStart,truncated:window.truncated,reasonCodes:window.reasons,visualQualityStatus:safe.visualQualityStatus,originalVisualQualityStatus:quality.visualQualityStatus,calendarSha256:sha(calendarBytes),longestMissingGapSessions:safe.longestMissingGapSessions,missingRatio:safe.missingRatio};
   if(range==='MAX'){full={series,quality,window,safe,segments};rows.push({securityId:s.securityId,mic:l.mic,sourcePointsSha256:proof.pointsSha256,calendarSha256:sha(calendarBytes),...quality,safeHistoryStart:window.safeHistoryStart,safeObservations:window.points.length,windowTruncated:window.truncated,displayVisualQualityStatus:safe.visualQualityStatus,displayLongestGap:safe.longestMissingGapSessions});}
   else short={series,quality,window,safe,segments};
  }
  // Longer canonical requests share the same MAX source proof.
  for(const range of ['3Y','5Y','10Y'])if(l.discoverChart.ranges[range])policies[range]=policies.MAX;
  l.discoverDisplay={version:'vu-discover-display-policy-1',ranges:policies};
  const ranges={};for(const [range,days]of Object.entries(rangeDays)){const pts=days===null?full.window.points:full.window.points.filter(p=>Date.parse(p[0])>=Date.parse(full.window.points.at(-1)[0])-days*86400000),selectedDates=new Set(pts.map(p=>p[0])),segments=full.segments.map(g=>g.filter(p=>selectedDates.has(p[0]))).filter(x=>x.length);if(pts.length<2){ranges[range]={available:false,reason:'INSUFFICIENT_SAFE_HISTORY'};continue;}const q=assessContinuity({points:pts,segments,calendar:c,mic:l.mic,excludedDates:exclusions[s.securityId],providerDates});ranges[range]={available:days===null||Date.parse(full.window.points.at(-1)[0])-Date.parse(full.window.points[0][0])>=days*86400000*.95,from:pts[0][0],to:pts.at(-1)[0],observations:pts.length,visualQualityStatus:q.visualQualityStatus,longestMissingGapSessions:q.longestMissingGapSessions,segmentCount:q.segmentCount,isolatedSegmentCount:q.isolatedSegmentCount};}
  visual.push({securityId:s.securityId,original:full.quality.visualQualityStatus,display:full.safe.visualQualityStatus,ranges});
  const pts=short.window.points,card={symbol:l.ticker,companyName:s.name,securityId:s.securityId,companyId:s.companyId,listingId:l.listingId,region:'EUROPE',identityReady:true,currency:l.currency,asOf:l.latest.date,price:{value:pts.at(-1)[1]},priceSeries:{points:pts},visualQualityStatus:short.safe.visualQualityStatus,logoQuality:s.logo.status==='LOGO_SUSPECT'?'LOGO_FALLBACK':s.logo.status,performanceComparable:short.segments.length===1,cardFundamentals:s.cardFundamentals};
  s.homeCardQuality=U.homeCardQuality(card);home.push({securityId:s.securityId,...s.homeCardQuality,logoQuality:card.logoQuality,fundamentalStatus:s.cardFundamentals.status,discoverEligibleUnchanged:true});
 }
 const nextBytes=JSON.stringify(catalog)+'\n';await writeFile(join(base,'catalog.json'),nextBytes);manifest.catalog={...manifest.catalog,sha256:sha(nextBytes),bytes:Buffer.byteLength(nextBytes)};manifest.displayQuality={version:'vu-discover-quality-1',evaluatedAt:now,policy:POLICY,originalCatalogSha256:manifest.displayQuality?.originalCatalogSha256||oldCatalogSha,historyValuesUnchanged:true,schedule:false};await writeFile(join(base,'manifest.json'),JSON.stringify(manifest)+'\n');
 const common={generatedAt:now,securities:449,providerRequests:0,policy:POLICY};await mkdir(reportDir,{recursive:true});
 for(const [file,data]of Object.entries({'europe_chart_continuity.json':{...common,rows},'europe_chart_visual_quality.json':{...common,counts:Object.fromEntries(['CLEAN','MINOR_GAPS','MAJOR_GAPS','BROKEN'].map(k=>[k,visual.filter(x=>x.display===k).length])),rows:visual},'europe_logo_quality.json':{...common,counts:Object.fromEntries(['LOGO_VALID','LOGO_FALLBACK','LOGO_MISSING','LOGO_SUSPECT'].map(k=>[k,logos.filter(x=>x.status===k).length])),rows:logos},'europe_fundamental_card_readiness.json':{...common,metricsAvailable:fundamental.filter(x=>x.metrics.length).length,marketCapAvailable:0,rows:fundamental},'discover_home_card_quality.json':{...common,counts:Object.fromEntries(['HOME_CARD_READY','HOME_CARD_LIMITED','HOME_CARD_BLOCKED'].map(k=>[k,home.filter(x=>x.status===k).length])),rows:home}}))await writeFile(join(reportDir,file),JSON.stringify(data,null,2)+'\n');
 return {securities:449,truncated:rows.filter(x=>x.windowTruncated).length,homeCounts:Object.fromEntries(['HOME_CARD_READY','HOME_CARD_LIMITED','HOME_CARD_BLOCKED'].map(k=>[k,home.filter(x=>x.status===k).length])),fundamentalMetrics:fundamental.filter(x=>x.metrics.length).length,logoValid:logos.filter(x=>x.status==='LOGO_VALID').length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];console.log(JSON.stringify(await buildDisplayQuality(args)));}
