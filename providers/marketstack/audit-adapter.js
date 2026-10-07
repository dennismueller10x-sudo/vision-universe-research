/* Provider observations only. Not registered in VU products and not a second
 * price truth. Canonical/product admission remains with the existing Core. */
'use strict';
const {createMarketstackClient}=require('./client.js');
const freezeEvidence=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeEvidence);Object.freeze(value);}return value;};
// Endpoint-specific codes, independently linked to exact ticker metadata MICs.
// No suffix convention or country alone supplies venue identity.
const snapshotMappingEvidence=freezeEvidence(require('./snapshot-exchange-mappings.json'));
const snapshotExchangeMappings=snapshotMappingEvidence.mappings;
const clone=x=>x===undefined?undefined:structuredClone(x);
const numeric=x=>x===null||x===undefined||typeof x==='boolean'||String(x).trim()===''?null:Number.isFinite(Number(x))?Number(x):null;
const symbolOf=r=>r.symbol||r.ticker||null;
// exchange_code is often a descriptive label (NASDAQ / NYSE ARCA), not a MIC.
const micOf=r=>{
  const mics=[r.exchange,r.stock_exchange?.mic,r.stock_exchange?.exchange_mic].filter(x=>typeof x==='string'&&/^[A-Z0-9]{4}$/.test(x));
  const unique=[...new Set(mics)];return unique.length>1?'CONFLICTING_PROVIDER_MIC':unique[0]||null;
};
const failure=reason=>({ok:false,reason,data:null,complete:false});
const capabilityNames=['stockDirectory','globalEOD','history','adjustedOHLC','adjustedVolume','splits','dividends','realtimeUS','realtimeEurope','intradayUS','intradayEurope','ETFHoldingsUS','ETFHoldingsUCITS','ETFHoldingsPagination','ETFMetadata'];
const states=new Set(['SUPPORTED','PARTIAL','UNSUPPORTED','NOT_ENTITLED','UNKNOWN']);
function capabilityFlags(evidence={}) {
  const flags=Object.fromEntries(capabilityNames.map(k=>[k,'UNKNOWN']));
  for(const [key,observation] of Object.entries(evidence)) {
    if(!capabilityNames.includes(key)||!states.has(observation?.status)||!observation?.source)throw Error('Capability evidence required');
    flags[key]=observation.status;
  }
  return flags;
}
function normalizeObservation(row,{kind,retrievedAt}={}) {
  // Retain every provider field separately, including unrecognized future fields.
  return {raw:clone(row),normalized:{providerTicker:symbolOf(row),providerExchange:micOf(row),providerExchangeCode:row.exchange_code??null,
    name:row.name??null,description:row.description??row.about??null,isin:row.isin??null,currency:row.price_currency??row.currency??null,
    sector:row.sector??null,industry:row.industry??null,cik:row.cik??null,cusip:row.cusip??null,lei:row.lei??null,
    countryCode:kind==='SNAPSHOT'?null:row.country_code??null,country:kind==='SNAPSHOT'?null:row.country??null,
    exchangeCountry:row.stock_exchange?.country??(kind==='SNAPSHOT'?row.country??null:null),exchangeCountryCode:row.stock_exchange?.country_code??null,
    assetType:row.asset_type??row.item_type??null,
    open:numeric(row.open),high:numeric(row.high),low:numeric(row.low),close:numeric(row.close),volume:numeric(row.volume),
    adjustedOpen:numeric(row.adj_open),adjustedHigh:numeric(row.adj_high),adjustedLow:numeric(row.adj_low),adjustedClose:numeric(row.adj_close),adjustedVolume:numeric(row.adj_volume),
    splitFactor:numeric(row.split_factor),dividend:numeric(row.dividend),
    price:kind==='SNAPSHOT'?numeric(row.price):kind==='INTRADAY'?numeric(row.marketstack_last??row.last):numeric(row.close),
    marketTimestamp:row.trade_last??row.date??null,providerUpdateTimestamp:row.updated_at??row.update_timestamp??null,
    tradingDate:typeof (row.date??row.trade_last)==='string'&&/^\d{4}-\d{2}-\d{2}/.test(row.date??row.trade_last)?(row.date??row.trade_last).slice(0,10):null,
    timestampTimezone:/Z$|[+-]\d{2}:?\d{2}$/.test(String(row.trade_last??row.date??''))?'EXPLICIT_OFFSET':'NOT_REPORTED',retrievedAt:retrievedAt??null,
    frequency:kind??'METADATA',delayState:kind==='EOD'?'EOD_ONLY':'UNKNOWN',adjustmentVerification:'UNVERIFIED'}};
}
function holdingsOf(body) {
  return Array.isArray(body?.output?.holdings)?body.output.holdings:Array.isArray(body?.data)?body.data:null;
}
function createAuditAdapter(options={}) {
  const client=options.client||createMarketstackClient(options);
  const pageOptions=o=>({maxPages:o.maxPages??10,cacheTtlMs:0});
  async function metadata(endpoint,params={}) {
    const res=await client.request(endpoint,params,{cacheTtlMs:0});if(!res.ok)return res;
    const body=res.data?.data??res.data,rows=Array.isArray(body)?body:[body];
    return {...res,raw:clone(res.data),observations:rows.filter(r=>r&&typeof r==='object').map(r=>normalizeObservation(r,{kind:'METADATA',retrievedAt:res.retrievedAt}))};
  }
  async function directory(endpoint,params,o={}) {
    const res=await client.paginate(endpoint,{...params,limit:o.limit??1000},pageOptions(o));
    if(!res.ok)return res;
    const scope=endpoint.match(/^\/exchanges\/([A-Z0-9]{4})\/tickers$/)?.[1]||null;
    if(scope&&res.rawPages.some(p=>p.data?.mic&&p.data.mic!==scope))return {...failure('exchangeMismatch'),raw:clone(res.rawPages)};
    const unique=new Map(),duplicates=[];
    res.data.forEach(row=>{const mic=micOf(row)||scope,key=JSON.stringify([symbolOf(row),mic]);if(unique.has(key))duplicates.push(clone(row));else {
      const observation=normalizeObservation(row,{retrievedAt:res.retrievedAt});
      if(!micOf(row)&&scope){observation.normalized.providerExchange=scope;observation.normalized.exchangeProvenance='SCOPED_ENDPOINT_REQUEST_WITH_PROVIDER_ENVELOPE';}
      unique.set(key,observation);
    }});
    return {...res,raw:clone(res.rawPages),data:[...unique.values()],duplicates,downloadedCount:res.data.length,uniqueCount:unique.size,
      complete:res.complete&&duplicates.length===0,reason:duplicates.length?'duplicateDirectoryRows':res.reason};
  }
  const api={client,capabilities:capabilityFlags(options.capabilityEvidence),
    searchTicker:(query,o={})=>directory('/tickerslist',{search:query,...(o.exchange?{exchange:o.exchange}:{})},o),
    listExchangeTickers:(mic,o={})=>/^[A-Z0-9]{4}$/.test(mic)?directory('/exchanges/'+mic+'/tickers',{search:o.search},o):Promise.resolve(failure('invalidMIC')),
    listExchanges:(o={})=>client.paginate('/exchanges',{search:o.search,limit:o.limit??1000},pageOptions(o)),
    getTicker:(symbol)=>metadata('/tickers/'+encodeURIComponent(symbol)),
    getTickerInfo:(symbol)=>metadata('/tickerinfo',{ticker:symbol}),
    listETFs:(o={})=>client.paginate('/etflist',{ticker:o.ticker,status:o.status,date_from:o.from,date_to:o.to,limit:o.limit??1000},pageOptions(o)),
    async resolveTicker({providerTicker,canonicalTicker,legacyTicker,aliases=[],mic}) {
      // Candidates are observed/explicit aliases, never a fabricated suffix.
      const candidates=[...new Set([providerTicker,canonicalTicker,legacyTicker,...aliases].filter(Boolean))],attempts=[];
      for(const candidate of candidates) {
        const res=await api.getTicker(candidate);attempts.push({candidate,response:clone(res)});
        if(!res.ok)continue;
        const body=res.data?.data??res.data,rows=Array.isArray(body)?body:[body];
        const matched=rows.filter(r=>r&&symbolOf(r)===candidate&&(!mic||micOf(r)===mic||(r.stock_exchanges||[]).some(e=>(e.mic||e.exchange_mic)===mic)));
        if(matched.length===1)return {ok:true,providerTicker:candidate,mic,raw:clone(matched[0]),observation:normalizeObservation(matched[0],{kind:'METADATA',retrievedAt:res.retrievedAt}),attempts,identityVerified:false,identityAdmission:'PROVIDER_OBSERVATION_ONLY'};
        if(matched.length>1)return {...failure('ambiguousListing'),attempts};
      }
      return {...failure('identityUnresolved'),attempts,coverageConclusion:'UNKNOWN'};
    },
    async getETFHoldings(ticker,o={}) {
      const res=await client.paginate('/etfholdings',{ticker,date_from:o.from,date_to:o.to,limit:o.limit??1000},
        {...pageOptions(o),followUnverifiedPages:o.probePagination===true,extract:holdingsOf});
      const rows=Array.isArray(res.data)?res.data:[];
      const holdings=rows.map(r=>{const s=r.investment_security||r;return {raw:clone(r),name:s.name??null,ticker:s.ticker??s.symbol??null,isin:s.isin??null,lei:s.lei??null,cusip:s.cusip??null,
        weightPercent:numeric(s.percent_value),weightRaw:s.percent_value??null,valueUSD:numeric(s.value_usd),country:s.invested_country??null,sector:s.sector??null,
        title:s.title??null,units:s.units??null,balance:numeric(s.balance),currency:s.currency??null,assetCategory:s.asset_category??null,issuerCategory:s.issuer_category??null,payoffProfile:s.payoff_profile??null};});
      const raw=res.rawPages||[],attributes=raw.map(b=>clone(b.output?.attributes??null));
      const reports=new Set(attributes.map(a=>JSON.stringify(a)));
      const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
      const identityVerified=attributes.length>0&&attributes.every(a=>a?.ticker===ticker&&validDate(a.date_report_period));
      const priorRows=new Set(),repeatedAcrossPages=[];
      raw.forEach(page=>{const pageKeys=(holdingsOf(page)||[]).map(r=>JSON.stringify(r));pageKeys.forEach(k=>{if(priorRows.has(k))repeatedAcrossPages.push(k);});pageKeys.forEach(k=>priorRows.add(k));});
      const weightSum=holdings.length>0&&holdings.every(h=>h.weightPercent!==null)?holdings.reduce((n,h)=>n+h.weightPercent,0):null;
      const complete=res.complete===true&&reports.size<=1&&identityVerified&&holdings.length>0&&repeatedAcrossPages.length===0;
      return {...res,raw:clone(raw),data:{holdings,basics:raw.map(b=>clone(b.basics??null)),attributes,
        signatures:raw.map(b=>clone(b.output?.signature??null)),
        downloadedCount:holdings.length,reportedTotal:res.pagination?.total??null,paginationCount:res.pages??0,
        sumWeightsPercent:weightSum,reportDates:attributes.map(a=>a?.date_report_period??null),
        reportedPeriodEnds:attributes.map(a=>a?.end_report_period??null),
        repeatedAcrossPages,completeness:!res.ok||!complete?'PARTIAL':'FULL',completenessBasis:complete?'PROVIDER_PAGINATION_TOTAL':'UNKNOWN',
        metadataVerification:'PROVIDER_OBSERVATION_ONLY'},complete,reason:!res.ok?res.reason:reports.size>1?'holdingsReportChanged':!identityVerified?'holdingsIdentityUnverified':repeatedAcrossPages.length?'holdingsRepeatedAcrossPages':!holdings.length?'holdingsEmpty':res.reason};
    }
  };
  async function prices(endpoint,listing,o={},kind='EOD',latest=false) {
    if(!listing?.providerTicker)return failure('providerTickerRequired');
    if(!/^[A-Z0-9]{4}$/.test(listing.mic||''))return failure('listingMICRequired');
    const snapshotTicker=listing.snapshotTicker||listing.canonicalTicker||listing.providerTicker;
    const codes=listing.verifiedExchangeCodes||[],names=listing.verifiedExchangeNames||[];
    if(kind==='SNAPSHOT'&&(codes.length||names.length)&&!listing.snapshotMappingSource)return failure('snapshotMappingEvidenceRequired');
    const params={...(kind==='SNAPSHOT'?{ticker:snapshotTicker}:{symbols:listing.providerTicker,limit:o.limit??1000}),
      // Live stockprice reports provider codes, while MIC XNAS returns 404.
      // Fetch all venues and select using explicit observed mapping evidence.
      ...(kind==='SNAPSHOT'?{}:{exchange:listing.mic}),...(latest?{}:{date_from:o.from,date_to:o.to,sort:'ASC'}),
      ...(kind==='INTRADAY'?{interval:o.interval??'15min',after_hours:o.extendedHours===true}: {})};
    const res=kind==='SNAPSHOT'?await client.request(endpoint,params,{cacheTtlMs:0}):await client.paginate(endpoint,params,pageOptions(o));
    if(!res.ok)return res;
    let rows=kind==='SNAPSHOT'?res.data?.data:res.data;
    if(!Array.isArray(rows))return failure('invalidResponse');
    const accepted=new Set([listing.providerTicker,...(kind==='SNAPSHOT'?[snapshotTicker]:[]),...(listing.verifiedAliases||[])]);
    if(rows.some(r=>!accepted.has(symbolOf(r))))return {...failure('identityMismatch'),raw:clone(res.rawPages??res.data)};
    const venueName=x=>String(x||'').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
    const mappedVenue=row=>snapshotExchangeMappings.find(m=>m.providerExchangeCode===row.exchange_code&&m.mic===listing.mic&&
      (!row.exchange_name||venueName(row.exchange_name)===venueName(m.providerExchangeName)));
    if(kind==='SNAPSHOT') {
      const observedNames=new Set(names.map(venueName).filter(Boolean));
      rows=rows.filter(r=>micOf(r)===listing.mic||!micOf(r)&&(r.exchange_code===listing.mic||codes.includes(r.exchange_code)||observedNames.has(venueName(r.exchange_name))||mappedVenue(r)));
      if(!rows.length)return {...failure('snapshotVenueUnverified'),raw:clone(res.data)};
    } else if(rows.some(r=>micOf(r)!==listing.mic))return {...failure('identityMismatch'),raw:clone(res.rawPages??res.data)};
    if(latest&&rows.length!==1)return {...failure(rows.length?'ambiguousListing':'dataUnavailable'),raw:clone(res.rawPages??res.data)};
    return {...res,raw:clone(res.rawPages??res.data),data:rows.map(row=>{
      const observation=normalizeObservation(row,{kind,retrievedAt:res.retrievedAt});
      if(kind==='SNAPSHOT'&&!micOf(row)){
        const mapping=mappedVenue(row);observation.normalized.providerExchange=listing.mic;
        observation.normalized.exchangeProvenance=row.exchange_code===listing.mic?'PROVIDER_CODE_MATCHES_REQUEST_MIC':mapping?'AUDITED_PROVIDER_CODE_TO_MIC':'EXPLICIT_OBSERVED_PROVIDER_VENUE_MAPPING';
        observation.normalized.exchangeMappingSource=mapping?.sourceId??listing.snapshotMappingSource??null;
        if(mapping)observation.normalized.exchangeMappingEvidence=clone(mapping.evidence);
      }
      return observation;
    }),
      complete:kind==='SNAPSHOT'?null:res.complete,capabilityConclusion:'UNKNOWN'};
  }
  api.getLatestEOD=(listing,o={})=>prices('/eod/latest',listing,o,'EOD',true);
  api.getHistoricalEOD=(listing,o={})=>prices('/eod',listing,o);
  api.getRealtimePrice=(listing,o={})=>prices('/stockprice',listing,o,'SNAPSHOT',true);
  api.getIntraday=(listing,o={})=>prices(o.latest?'/intraday/latest':'/intraday',listing,o,'INTRADAY',!!o.latest);
  for(const kind of ['Splits','Dividends'])api['get'+kind]=async(listing,o={})=>{
    if(!listing?.providerTicker)return failure('providerTickerRequired');
    const res=await client.paginate('/'+kind.toLowerCase(),{symbols:listing.providerTicker,date_from:o.from,date_to:o.to,sort:'ASC',limit:o.limit??1000},pageOptions(o));
    if(!res.ok)return res;
    if(res.data.some(r=>symbolOf(r)!==listing.providerTicker||micOf(r)&&listing.mic&&micOf(r)!==listing.mic))return {...failure('identityMismatch'),raw:clone(res.rawPages)};
    return {...res,raw:clone(res.rawPages),data:res.data.map(row=>({...normalizeObservation(row,{kind:'ACTION',retrievedAt:res.retrievedAt}),identityVenueState:micOf(row)?'PROVIDER_REPORTED':'NOT_REPORTED',canonicalAdmission:false}))};
  };
  return api;
}
module.exports={createAuditAdapter,capabilityFlags,capabilityNames,normalizeObservation,holdingsOf,snapshotExchangeMappings,snapshotMappingEvidence};
