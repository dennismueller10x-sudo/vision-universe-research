/** One-shot, hash-bound producer of the licensed minimal display projection.
 * No provider calls, schedules, RAW envelopes, fundamentals or analytical grants. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),Admission=require('../../core/europe-discover-eligibility.js'),Sessions=require('../../core/europe-session-proof.js');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins={calendar:'9b039f4d3446648d77664ac56a31a69e5c186247c659f8d5b806d89420342b4c',catalog:'4a8a32e839c206465c6c04edb1d9cd6c97f4e185e308dadb5109412f6c974fb9',series:'9108eb59022c93e0ac8df7fdf134ffb7ea0e84e7deb0112444edf3146c26ba62',logos:'be7cd48f6b88401edec72cb0c5ec8641c6bb5936ac2e4598eed930050677be4d'};
async function input(path,pin){const b=await readFile(path);if(pin&&sha(b)!==pin)throw Error('SOURCE_PIN_MISMATCH');return JSON.parse(b);}
function pick(o,keys){return Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));}
const proofKeys='version listingKey securityId companyId listingId isin mic providerSymbol pointsSha256 chartStatus status reasonCodes segments firstDate lastDate observationCount spanDays currency quoteUnit priceBasis sessionLag freshness evaluatedAt calendarSource calendarSourceSha256 calendarProof sourceInputSha256 immutableExclusionsSha256 criticalIssues warnings annotations evidenceRef'.split(' ');
function proof(p){const out=pick(p,proofKeys);out.quoteBasis=pick(p.quoteBasis,'kind mic providerSymbol isin currency quoteUnit sourceSha256 contractSchemaSha256 providerCurrencyObservationSha256 unitContractSha256'.split(' '));return out;}
export async function produce({catalogPath,seriesPath,logosPath,calendarPath,out,root=process.cwd(),now=new Date().toISOString()}){
 if(!out)throw Error('EXPLICIT_OUTPUT_REQUIRED');
 const rights=await input(resolve(root,'core/rights/marketstack-display.json'));
 if(rights.schema!=='vu-marketstack-display-rights-1'||rights.status!=='CONFIRMED_BY_OWNER'||rights.source!=='OWNER_ATTESTATION'||!rights.display||!rights.commercial||rights.rawRedistribution!==false||rights.permittedUse!=='NORMALIZED_PRODUCT_DISPLAY'||typeof rights.evidenceRef!=='string'||!rights.evidenceRef.trim()||JSON.stringify(rights.dataPaths)!=='["IDENTITY","RAW_EOD"]')throw Error('OWNER_DISPLAY_EVIDENCE_REQUIRED');
 const source=await input(catalogPath,pins.catalog),bundle=await input(seriesPath,pins.series),logos=await input(logosPath,pins.logos),cal=await input(calendarPath,pins.calendar);
 const securities=source.securities.filter(s=>Admission.evaluate(s,s.listings.find(l=>l.listingId===s.primaryListingId),now).DISCOVER_ELIGIBLE);
 if(securities.length!==449)throw Error('REVIEWED_449_SET_REQUIRED');
 const selectedIds=new Set(securities.map(s=>s.securityId)),companyIds=new Set(securities.map(s=>s.companyId));
 const catalog={schema:'europe-discover-public-catalog-1',generatedAt:now,publicationAllowed:true,companies:source.companies.filter(c=>companyIds.has(c.companyId)).map(c=>pick(c,['companyId','name','country','lei'])),securities:securities.map(s=>{
  const result=pick(s,'region securityId companyId instrumentId name ticker canonicalTicker isin shareClassId aliases primaryListingId acceptance identity indexes logo'.split(' '));
  result.indexes=(s.indexes||[]).map(i=>typeof i==='string'?i:pick(i,['index','name','code','id','asOf','membershipStatus']));
  result.logo=pick(s.logo||{},['status','key','companyId','initial','issuerCountry','evidenceRef','reason','blocksIdentity']);
  result.listings=s.listings.filter(l=>l.listingId===s.primaryListingId).map(l=>({...pick(l,'listingId instrumentId ticker providerSymbol mic exchange country exchangeCountry currency aliases identityAdmission'.split(' ')),latest:{date:l.discoverChart.lastDate,status:l.discoverChart.freshness},history:{valid:true,observations:l.discoverChart.observationCount,chartStatus:'CHART_LIMITED'},discoverChart:proof(l.discoverChart),provenance:{provider:'MARKETSTACK',priceBasis:'RAW_UNADJUSTED',evidenceRef:l.discoverChart.evidenceRef.sha256},adjustment:{status:'ADJUSTMENT_UNKNOWN'}}));return result;
 })};
 const calendar={schema:'europe-exact-mic-display-calendar-1',generatedAt:now,sourceFileSha256:sha(await readFile(calendarPath)),calendars:{}};
 for(const s of catalog.securities){const l=s.listings[0],p=l.discoverChart,c=cal.calendars[l.mic];if(!c?.verified||c.mic!==l.mic||p.calendarSourceSha256!==pins.calendar)throw Error('AUTHENTIC_EXACT_MIC_CALENDAR_REQUIRED');calendar.calendars[l.mic]={mic:l.mic,source:c.source,sourceSha256:p.calendarSourceSha256,coverageFrom:'2026-10-01',coverageTo:'2026-10-30',sessions:c.sessions.filter(r=>r.date>='2026-10-01'&&r.date<='2026-10-30').map(r=>pick(r,['date','close']))};}
 const projected=Sessions.refreshCatalog(catalog,calendar,{now});
 if(projected.securities.some(s=>!Admission.evaluate(s,s.listings[0],now).DISCOVER_ELIGIBLE))throw Error('CURRENT_SESSION_GATE_FAILED');
 const manifest={version:'europe-discover-public-1',generatedAt:now,publicationAllowed:true,securityCount:449,companyCount:companyIds.size,rights:pick(rights,['display','commercial','evidenceRef','dataPaths']),rightsEvidence:{url:'/core/rights/marketstack-display.json',sha256:sha(await readFile(resolve(root,'core/rights/marketstack-display.json')))},series:{},logos:{},schedule:'MANUAL_ONLY',requests:0};
 const output=resolve(out);if(output.startsWith(resolve(root)+'/')&&output!==resolve(root,'discover/data/europe'))throw Error('OWNED_OUTPUT_PATH_REQUIRED');await mkdir(output,{recursive:true});
 async function emit(name,data){const bytes=JSON.stringify(data)+'\n';if(bytes.includes('/workspace/')||bytes.includes('access_key')||bytes.includes('evidenceRoot')||bytes.includes('normalizedPath'))throw Error('PRIVATE_EVIDENCE_DISCLOSURE');const path=resolve(output,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);return{url:'/discover/data/europe/'+name,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 manifest.catalog=await emit('catalog.json',catalog);manifest.calendar=await emit('calendar.json',calendar);
 const available=new Map(bundle.series.map(s=>[s.securityId,s]));
 for(const s of catalog.securities){const p=s.listings[0].discoverChart,raw=available.get(s.securityId);if(!raw||raw.listingId!==s.primaryListingId||sha(JSON.stringify(raw.points))!==p.pointsSha256||JSON.stringify(raw.segments)!==JSON.stringify(p.segments))throw Error('EXACT_SERIES_BINDING_REQUIRED');const series={...pick(raw,'securityId listingId range basis currency quoteUnit points segments sessionContinuity'.split(' ')),provenance:{provider:'MARKETSTACK',evidenceRef:p.evidenceRef.sha256,sourceInputSha256:p.sourceInputSha256,immutableExclusionsSha256:p.immutableExclusionsSha256}};manifest.series[s.securityId]=await emit('series/'+s.securityId+'.json',series);}
 for(const row of logos.rows){if(!selectedIds.has(row.securityId)||row.status!=='LOGO_VALID')continue;const a=row.asset,b=await readFile(resolve(root,a.path.slice(1)));if(sha(b)!==a.sha256||b.length!==a.bytes)throw Error('CENTRAL_LOGO_BINDING_FAILED');manifest.logos[row.centralKey]=pick(a,['path','sha256','bytes']);}
 await emit('manifest.json',manifest);return{securityCount:449,companyCount:companyIds.size,seriesCount:Object.keys(manifest.series).length,logoCount:Object.keys(manifest.logos).length,catalogBytes:manifest.catalog.bytes,requests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];console.log(JSON.stringify(await produce(args)));}
