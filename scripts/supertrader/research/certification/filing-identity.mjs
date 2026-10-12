/** Original SEC filing evidence only. No ticker-name join, network or public logging. */
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {canonicalListing} from './universe-certification.mjs';
import {certifyOriginalAcceptance} from './annual-facts.mjs';
const require = createRequire(import.meta.url);
const Master = require('../../../../quant/engines/company-master.js');
export const FILING_IDENTITY_CONTRACT = Object.freeze({
  version:'supertrader-original-filing-identity-1.0.0',
  binding:'Original SEC accession-bound DEI CIK, TradingSymbol, SecurityExchangeName and Security12bTitle in the same cover context; canonical listing generation required.',
  interval:'Filing-date observation only. No retrospective period-wide or indefinite carry from a cover page. Fiscal report-end is not automatically a security identity observation date.',
  fiscalPoint:'Optional premeasurement AS_REPORTED_FILING_CONTEXT_POINT: current original report-end actual instantaneous issuer-common shares plus independent DEI CIK and full original incorporated class roster; MEDIUM/PIT_PARTIAL, not exchange admission or continuity proof.',
  knownAt:'Original submission acceptance in America/New_York converted through IANA, never API/current ticker availability.',
  classes:'A single registered 12(b) security is not proof of a single issuer common class. Full issuer structure stays UNKNOWN absent explicit original capital-stock disclosure.',
  shares:'Original actual instantaneous issuer-common shares; weighted-average/diluted or class-dimensional counts never substitute.',
  outcome:'Snapshot proof does not certify population completeness, USD price currency, exchange admission history, ADR ratio or full fiscal-date market equity.',
});
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const cik = x => /^\d{1,10}$/.test(String(x)) && BigInt(x)>0n ? String(BigInt(x)).padStart(10,'0') : null;
function checkArtifact(a, issuer, accession) {
  if(typeof a?.text!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256??'')||sha(a.text)!==a.sha256)throw Error('FILING_SOURCE_HASH_MISMATCH');
  let u;try{u=new URL(a.url);}catch{throw Error('OFFICIAL_ACCESSION_BOUND_SOURCE_REQUIRED');}
  const prefix=`/Archives/edgar/data/${BigInt(issuer)}/${accession.replaceAll('-','')}/`;
  if(u.protocol!=='https:'||u.hostname!=='www.sec.gov'||u.search||u.hash||!u.pathname.startsWith(prefix))throw Error('OFFICIAL_ACCESSION_BOUND_SOURCE_REQUIRED');
  return {url:a.url,sha256:a.sha256,accession,hashScope:'FULL_RECEIVED_DOCUMENT'};
}
const PARSER=String.raw`
import sys,json,xml.etree.ElementTree as E,io,math
p=json.load(sys.stdin);text=p['text']
if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():raise ValueError('DTD_NOT_ALLOWED')
ns={'x':'http://www.xbrl.org/2003/instance'};scopes={};stack=[{}];pending={}
parser=E.iterparse(io.StringIO(text),events=['start-ns','start','end'])
for event,node in parser:
 if event=='start-ns':pending[node[0]]=node[1]
 elif event=='start':
  local={**stack[-1],**pending};pending={};stack.append(local);scopes[id(node)]=local
 else:stack.pop()
root=parser.root;contexts={};units={}
for c in root.findall('.//x:context',ns):
 key=c.get('id')
 if not key or key.strip()!=key or key in contexts:raise ValueError('CONTEXT_ID_NOT_UNIQUE_OR_EMPTY')
 i=c.find('x:entity/x:identifier',ns);per=c.find('x:period',ns)
 if i is None or per is None:raise ValueError('CONTEXT_ENTITY_OR_PERIOD_MISSING')
 dimensions=[{'name':e.get('dimension'),'value':(e.text or '').strip(),'kind':e.tag.split('}')[-1]} for e in c.iter() if e.tag.split('}')[-1] in ['explicitMember','typedMember']]
 if not dimensions and any(e.tag.split('}')[-1] in ['segment','scenario'] and len(e)>0 for e in c.iter()):dimensions=[{'kind':'UNCLASSIFIED_SEGMENT_OR_SCENARIO'}]
 contexts[key]={'entityCik':(i.text or '').strip(),'scheme':i.get('scheme'),'start':per.findtext('x:startDate',namespaces=ns),'end':per.findtext('x:endDate',namespaces=ns),'instant':per.findtext('x:instant',namespaces=ns),'dimensions':dimensions}
for u in root.findall('.//x:unit',ns):
 key=u.get('id')
 if not key or key.strip()!=key or key in units:raise ValueError('UNIT_ID_NOT_UNIQUE_OR_EMPTY')
 units[key]='OTHER'
 m=u.findall('x:measure',ns)
 if len(m)==1 and u.find('x:divide',ns) is None:
  v=(m[0].text or '').strip().split(':');prefix=scopes[id(m[0])];uri=prefix.get(v[0]) if len(v)>1 else prefix.get('');units[key]='SHARES' if uri==ns['x'] and v[-1]=='shares' else 'OTHER'
facts=[]
for e in root.iter():
 if not isinstance(e.tag,str) or not e.tag.startswith('{'):continue
 uri,name=e.tag[1:].split('}',1)
 if uri in ['http://www.xbrl.org/2013/inlineXBRL','http://www.xbrl.org/2008/inlineXBRL']:
  named=e.get('name','').split(':');prefix=scopes[id(e)];uri=prefix.get(named[0],'') if len(named)>1 else prefix.get('','');name=named[-1]
 is_dei=uri.startswith('http://xbrl.sec.gov/dei/') or uri.startswith('https://xbrl.sec.gov/dei/')
 is_actual_gaap_shares=name=='CommonStockSharesOutstanding' and any(uri.startswith(base) for base in ['http://fasb.org/us-gaap/','https://fasb.org/us-gaap/','http://xbrl.us/us-gaap/','http://taxonomies.xbrl.us/us-gaap/'])
 if not (is_dei or is_actual_gaap_shares):continue
 if not is_actual_gaap_shares and name not in ['EntityCentralIndexKey','TradingSymbol','SecurityExchangeName','Security12bTitle','EntityCommonStockSharesOutstanding','DocumentPeriodEndDate']:continue
 ref=e.get('contextRef')
 if not ref or ref not in contexts:raise ValueError('TARGET_FACT_CONTEXT_REF_UNDECLARED')
 numeric=name in ['EntityCommonStockSharesOutstanding','CommonStockSharesOutstanding']
 unit=e.get('unitRef')
 if numeric and (not unit or unit not in units):raise ValueError('TARGET_SHARES_UNIT_REF_UNDECLARED')
 c=contexts[ref];value=''.join(e.itertext()).strip()
 facts.append({'concept':name,'namespace':uri,'value':value,'contextId':ref,'context':c,'unit':units.get(unit),'scale':e.get('scale'),'nil':e.get('{http://www.w3.org/2001/XMLSchema-instance}nil')})
json.dump({'facts':facts},sys.stdout)
`;
export function parseOriginalFilingIdentity(artifact, issuerCik, accession) {
  const issuer=cik(issuerCik);if(!issuer||!/^\d{10}-\d{2}-\d{6}$/.test(accession??''))throw Error('ISSUER_ACCESSION_REQUIRED');
  const source=checkArtifact(artifact,issuer,accession);
  const p=spawnSync('python3',['-c',PARSER],{input:JSON.stringify({text:artifact.text}),encoding:'utf8',maxBuffer:32*1024*1024});
  if(p.status!==0)throw Error('FILING_IDENTITY_XML_PARSE_FAILED');
  return {...JSON.parse(p.stdout),source,issuerCik:issuer,accession};
}

/** Source-preserving text transform and links; offsets are in normalized visible text. */
export function parseOriginalFilingHTML(artifact) {
  if(typeof artifact?.text!=='string'||sha(artifact.text)!==artifact.sha256)throw Error('FILING_SOURCE_HASH_MISMATCH');
  const p=spawnSync('python3',['-c',String.raw`
import json,sys,re
from html.parser import HTMLParser
class P(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.links=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ['script','style']:self.skip+=1
  if t=='a':
   href=dict(a).get('href')
   if href:self.links.append(href)
 def handle_endtag(self,t):
  if t in ['script','style'] and self.skip:self.skip-=1
 def handle_data(self,d):
  if not self.skip:self.parts.append(d)
p=P();p.feed(json.load(sys.stdin)['text']);print(json.dumps({'text':re.sub(r'\s+',' ',' '.join(p.parts)).strip(),'links':p.links}))
`],{input:JSON.stringify({text:artifact.text}),encoding:'utf8',maxBuffer:32*1024*1024});
  if(p.status!==0)throw Error('ORIGINAL_HTML_PARSE_FAILED');return JSON.parse(p.stdout);
}
function classDisclosureProof(e,issuer,filing) {
  // Earlier charter/description may be incorporated by reference: authenticate
  // its exact href from this original annual cover, not from a current index.
  if(e.annualArtifact) {
    checkArtifact(e.annualArtifact,issuer,filing.accession);
    const annual=parseOriginalFilingHTML(e.annualArtifact);
    if(!annual.links.some(h=>{try{return new URL(h,e.annualArtifact.url).href===e.artifact.url;}catch{return false;}}))throw Error('ORIGINAL_ANNUAL_INCORPORATION_LINK_REQUIRED');
    if(typeof e.artifact?.text!=='string'||sha(e.artifact.text)!==e.artifact.sha256)throw Error('FILING_SOURCE_HASH_MISMATCH');
    const u=new URL(e.artifact.url);
    if(u.protocol!=='https:'||u.hostname!=='www.sec.gov'||u.search||u.hash||!u.pathname.startsWith(`/Archives/edgar/data/${BigInt(issuer)}/`))throw Error('OFFICIAL_ISSUER_EXHIBIT_REQUIRED');
  } else checkArtifact(e.artifact,issuer,filing.accession);
  const sourceText=e.textTransform==='HTML_VISIBLE_TEXT_WHITESPACE_NORMALIZED'?parseOriginalFilingHTML(e.artifact).text:e.artifact.text;
  if(!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||sourceText.slice(e.start,e.end)!==e.quote)throw Error('EXACT_CLASS_DISCLOSURE_QUOTE_REQUIRED');
  const direct=/^(?:we|the company|the registrant) (?:has|have) (?:only one|a single) class of common stock[.;]$/i.test(e.quote.trim());
  const completeAuthorized=/^(?:our\s+)?authorized capital stock consists of [\d,]+ shares of common stock, \$?[\d.]+ par value(?: per share)?, and [\d,]+ shares of preferred stock, \$?[\d.]+ par value(?: per share)?\.$/i.test(e.quote.trim());
  if(!direct&&!completeAuthorized)throw Error('EXPLICIT_FULL_ISSUER_SINGLE_COMMON_CLASS_DISCLOSURE_REQUIRED');
  let fullRosterReview=null;
  if(completeAuthorized&&!direct) {
    const review=e.fullRosterReview,a=review?.assertions;
    if(review?.status!=='PASS'||!review.reviewer||review.performanceInspected!==false||typeof review.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(review.reviewedAt)||!Number.isFinite(Date.parse(review.reviewedAt))||!a||review.assertionHash!==sha(JSON.stringify(a))||a.issuerCik!==issuer||a.sourceUrl!==e.artifact.url||a.sourceSha256!==e.artifact.sha256||a.scope!=='ALL_ISSUER_COMMON_EQUITY_CLASSES'||a.completeCommonClassRoster!==true||a.commonClassCount!==1)throw Error('INDEPENDENT_FULL_COMMON_CLASS_ROSTER_REVIEW_REQUIRED');
    fullRosterReview=structuredClone(review);
  }
  return {url:e.artifact.url,sha256:e.artifact.sha256,quote:e.quote,start:e.start,end:e.end,textTransform:e.textTransform??'ORIGINAL_TEXT',scope:'ALL_ISSUER_COMMON_EQUITY_CLASSES',proofBasis:direct?'EXPLICIT_SINGLE_COMMON_CLASS':'INDEPENDENTLY_REVIEWED_FULL_AUTHORIZED_COMMON_CLASS_ROSTER',fullRosterReview,incorporationSource:e.annualArtifact?{url:e.annualArtifact.url,sha256:e.annualArtifact.sha256,locator:'Original annual exhibit index exact href'}:null};
}

const EXCHANGES = Object.freeze({NASDAQ:['NASDAQ','NASDAQ STOCK MARKET','THE NASDAQ STOCK MARKET LLC','NASDAQ GLOBAL SELECT MARKET','NASDAQ GLOBAL MARKET','NASDAQ CAPITAL MARKET'],NYSE:['NYSE','NEW YORK STOCK EXCHANGE','NEW YORK STOCK EXCHANGE LLC'],NYSEMKT:['NYSE AMERICAN','NYSE AMERICAN LLC']});
const sameExchange=(a,b)=>(EXCHANGES[a?.toUpperCase()]??[a?.toUpperCase()]).includes(b?.toUpperCase());
function fail(reason,provenance=null){return {schema:FILING_IDENTITY_CONTRACT.version,status:'UNVERIFIED',historical:false,reason,identity:null,shares:[],provenance};}
/** Returns private proof; caller must keep security identifiers and source facts private. */
export function certifyFilingIdentity({listing,artifact,header,filing,classRosterEvidence=null}={}) {
  const l=canonicalListing(listing),issuer=cik(filing?.issuerCik);
  if(!issuer)return fail('ISSUER_CIK_MISSING');
  let primary,accepted;try{primary=parseOriginalFilingIdentity(artifact,issuer,filing.accession);accepted=certifyOriginalAcceptance(header,filing);}catch(e){return fail(e.message);}
  if(accepted.form!=='10-K')return fail('ORIGINAL_ANNUAL_FORM_REQUIRED');
  const facts=primary.facts.filter(f=>f.context&&cik(f.context.entityCik)===issuer&&['http://www.sec.gov/CIK','https://www.sec.gov/CIK'].includes(f.context.scheme)&&!['true','1'].includes(f.nil));
  const scalar=name=>{const xs=[...new Set(facts.filter(f=>f.concept===name&&!f.context.dimensions.length).map(f=>f.value))];return xs.length===1?xs[0]:null;};
  if(cik(scalar('EntityCentralIndexKey'))!==issuer)return fail('DEI_ENTITY_CIK_CONTEXT_MISMATCH');
  const covers=[];
  for(const symbol of facts.filter(f=>f.concept==='TradingSymbol'&&f.value===l.ticker)) {
    const same=facts.filter(f=>f.contextId===symbol.contextId),title=same.filter(f=>f.concept==='Security12bTitle'),exchange=same.filter(f=>f.concept==='SecurityExchangeName');
    if(title.length!==1||exchange.length!==1||!sameExchange(l.exchange,exchange[0].value))continue;
    covers.push({symbol,title:title[0],exchange:exchange[0]});
  }
  if(covers.length!==1)return fail('EXACT_SAME_CONTEXT_TICKER_EXCHANGE_TITLE_BINDING_REQUIRED');
  const cover=covers[0],observationDate=accepted.filingDate;
  if(observationDate<l.startDate||(l.endDate&&observationDate>l.endDate))return fail('FILING_OBSERVATION_OUTSIDE_LISTING_GENERATION');
  const instrument=/\b(?:depositary|depository|adr|ads)\b/i.test(cover.title.value)?'ADR':/\bcommon (?:stock|shares)\b/i.test(cover.title.value)?'COMMON_STOCK':'UNKNOWN';
  if(instrument!=='COMMON_STOCK')return fail('ADR_OR_NON_COMMON_COVER_SECURITY_NOT_ELIGIBLE');
  const registeredClasses=new Set(facts.filter(f=>f.concept==='Security12bTitle'&&/\bcommon (?:stock|shares)\b/i.test(f.value)).map(f=>f.value));
  let issuerStructure='UNKNOWN',classDisclosure=null;
  if(classRosterEvidence) {
    try{classDisclosure=classDisclosureProof(classRosterEvidence,issuer,filing);}catch(e){return fail(e.message);}
    if(registeredClasses.size!==1||/\bclass [a-z]\b/i.test(cover.title.value))return fail('REGISTERED_COMMON_CLASS_CONFLICTS_WITH_FULL_ROSTER');
    issuerStructure='SINGLE_CLASS';
  }
  const source={...primary.source,kind:'SEC_FILING_XBRL',acceptedAt:accepted.acceptedAt,locator:`DEI context ${cover.symbol.contextId}: TradingSymbol;SecurityExchangeName;Security12bTitle;EntityCentralIndexKey`};
  const identity={status:'VERIFIED',historical:true,issuerId:Master.issuerIdFromCik(issuer),cik:issuer,listingId:l.id,securityId:l.securityId,instrumentType:instrument,issuerStructure,validFrom:observationDate,validTo:observationDate,knownFrom:accepted.acceptedAt,source};
  const shares=facts.filter(f=>['EntityCommonStockSharesOutstanding','CommonStockSharesOutstanding'].includes(f.concept)&&f.context.instant&&!f.context.dimensions.length&&f.unit==='SHARES'&&f.scale==null&&Number.isFinite(Number(f.value))&&Number(f.value)>0).map(f=>({concept:f.concept==='CommonStockSharesOutstanding'?'us-gaap:CommonStockSharesOutstanding':'dei:EntityCommonStockSharesOutstanding',value:Number(f.value),unit:'shares',periodDate:f.context.instant,knownFrom:accepted.acceptedAt,vintage:'AS_REPORTED',issuerId:identity.issuerId,cik:issuer,listingId:l.id,securityId:l.securityId,context:{verified:true,periodType:'INSTANT',periodDate:f.context.instant,scope:'ISSUER_COMMON',entityCik:issuer,dimensions:[]},source:{...source,periodDate:f.context.instant,contextId:f.contextId}}));
  return {schema:FILING_IDENTITY_CONTRACT.version,status:'VERIFIED_FILING_DATE_SNAPSHOT',historical:true,reason:null,identity,shares,provenance:{cover,canonicalListingInterval:{listingId:l.id,securityId:l.securityId,startDate:l.startDate,endDate:l.endDate},registeredCommonClassCount:registeredClasses.size,classDisclosure,intervalScope:'FILING_DATE_OBSERVATION_ONLY',reportDate:accepted.reportDate,documentPeriodEndDate:scalar('DocumentPeriodEndDate'),periodEndIsNotObservationDate:true,acceptanceSource:accepted.acceptanceSource,apiClockConflict:accepted.apiClockConflict,marketEquityEligible:issuerStructure==='SINGLE_CLASS',marketEquityFullContractStillRequired:true,populationCompletenessEstablished:false}};
}
/** Safe public classes and counts; no source quotes, source values or identities. */
export function summarizeFilingIdentities(rows=[]) {
  const out={schema:FILING_IDENTITY_CONTRACT.version,attempts:rows.length,verifiedSnapshots:0,fullIssuerSingleClass:0,actualSharesFacts:0,reasons:{},scope:'FILING_DATE_OBSERVATION_ONLY',populationCompletenessEstablished:false};
  for(const r of rows){if(r.status==='VERIFIED_FILING_DATE_SNAPSHOT')out.verifiedSnapshots++;if(r.identity?.issuerStructure==='SINGLE_CLASS')out.fullIssuerSingleClass++;out.actualSharesFacts+=r.shares?.length??0;if(r.reason)out.reasons[r.reason]=(out.reasons[r.reason]??0)+1;}
  return out;
}

/** Explicit source-context point mode fixed before measurement. This is a
 * point input certificate, never a listing-admission or continuity certificate.
 * Prior-year comparative facts are not promoted to their original vintage.
 */
export function certifyFilingContextPoints(snapshot) {
  if(snapshot?.status!=='VERIFIED_FILING_DATE_SNAPSHOT'||snapshot.identity?.issuerStructure!=='SINGLE_CLASS'||!snapshot.provenance?.classDisclosure)return [];
  const p=snapshot.provenance;
  if(!p.reportDate||p.reportDate!==p.documentPeriodEndDate)return [];
  const interval=p.canonicalListingInterval;
  if(!interval||interval.listingId!==snapshot.identity.listingId||interval.securityId!==snapshot.identity.securityId||!interval.startDate||p.reportDate<interval.startDate||(interval.endDate&&p.reportDate>interval.endDate))return [];
  const candidates=snapshot.shares.filter(s=>s.periodDate===p.reportDate&&s.context?.verified===true&&s.context.periodType==='INSTANT'&&s.context.scope==='ISSUER_COMMON'&&s.context.dimensions.length===0&&s.concept==='us-gaap:CommonStockSharesOutstanding');
  if(!candidates.length||new Set(candidates.map(s=>s.value)).size!==1)return [];
  return candidates.map(shares=>({schema:FILING_IDENTITY_CONTRACT.version,state:'DERIVED',dataQuality:'MEDIUM',panelState:'PIT_PARTIAL',eligibleForPointInput:true,fullMarketCoverage:false,
    identity:{...snapshot.identity,validFrom:p.reportDate,validTo:p.reportDate,validationScope:'AS_REPORTED_FILING_CONTEXT_POINT',confidence:'MEDIUM',source:{...shares.source,locator:`Original current fiscal instant ${shares.source.contextId}; independent DEI CIK; original annual incorporated full common-class roster`}},
    shares,provenance:{canonicalListingInterval:structuredClone(interval),originalReportDate:p.reportDate,knownFrom:snapshot.identity.knownFrom,originalAcceptedAt:snapshot.identity.knownFrom,coverObservationDate:snapshot.identity.validFrom,shareContextId:shares.source.contextId,classRosterSource:p.classDisclosure,priorComparativeVintagePromoted:false,reportedSharesRawSplitBasisAutomaticallyEstablished:false,exchangeAdmissionEstablished:false,continuousIssuerSecurityIntervalEstablished:false,currentTickerRetroactiveFallbackUsed:false,scope:'AS_REPORTED_FILING_CONTEXT_POINT'}}));
}
