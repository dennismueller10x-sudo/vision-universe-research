/* Marketstack -> existing VU market-data contracts. Node ingestion only.
   A listing mapping is mandatory: ticker alone cannot identify a global asset. */
'use strict';
const {createMarketstackClient}=require('./client.js');
const Capabilities=require('../../quant/engines/capabilities.js');
const Schema=require('../../quant/engines/schema.js');
const Identity=require('../../core/identity.js');
const PROVIDER_ID='marketstack', DATA_SOURCE_ID='ds_marketstack';
function number(value) {
  if(value===null||value===undefined||value===''||typeof value==='boolean') return null;
  const n=typeof value==='number'?value:Number(value);
  return Number.isFinite(n)?n:null;
}
function assetType(value) {
  const v=String(value||'').toLowerCase().replace(/[ _-]/g,'');
  if(['equity','stock','commonstock','commonequity'].includes(v))return 'equity';
  // Local index preferred equity is equity only with verified share-class mapping.
  if(['preferredstock','preferenceequity','preferredequity'].includes(v))return 'preferred_equity';
  return null;
}
function normalizeCurrency(value) {
  if(typeof value!=='string')return null;
  const code=value.trim();
  // GBp is the established pence quote-unit spelling, unlike ISO GBP.
  // Normalize spelling only; never change the numerical price scale.
  if(code==='GBp')return 'GBX';
  return /^[A-Za-z]{3}$/.test(code)?code.toUpperCase():null;
}
function validDate(value) {
  const date=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date ? date:null;
}
function resolveMapping(id,options) {
  let entry=options.mappings && options.mappings[id];
  if(!entry && options.symbols && typeof options.symbols.toProvider==='function') {
    const found=options.symbols.toProvider(PROVIDER_ID,id);
    if(found && found.resolved)entry={...found.entry,symbol:found.symbol};
  }
  if(typeof options.resolveListing==='function')entry=options.resolveListing(id);
  if(!entry||typeof entry!=='object')return {error:'symbolUnmapped'};
  const symbol=entry.symbol||entry.provider_symbol||entry.providerSymbol;
  const exchange=entry.provider_exchange||entry.providerExchange||entry.exchange||entry.mic;
  const suppliedCurrency=entry.trading_currency||entry.tradingCurrency||entry.currency;
  const currency=normalizeCurrency(suppliedCurrency);
  const type=assetType(entry.asset_type||entry.assetType||entry.type);
  if(!symbol||!exchange||!suppliedCurrency||!type||!entry.securityId||!entry.listingId||!entry.isin||!entry.mic)return {error:'incompleteListingIdentity'};
  if((entry.security_id!==undefined&&entry.security_id!==entry.securityId)||(entry.listing_id!==undefined&&entry.listing_id!==entry.listingId))return {error:'conflictingIdentityAliases'};
  try{if(!Identity.normalizeISIN(entry.isin)||Identity.securityIdForISIN(entry.isin)!==entry.securityId||Identity.listingIdFor({isin:entry.isin,mic:entry.mic})!==entry.listingId)return {error:'invalidCanonicalListingIdentity'};}catch(_){return {error:'invalidCanonicalListingIdentity'};}
  if(exchange!==entry.mic&&!(entry.exchangeAliases||[]).includes(exchange))return {error:'exchangeMicMismatch'};
  if(entry.mappingVerified!==true||entry.currencyVerified!==true||!entry.mappingSource||!entry.currencySource)return {error:'listingIdentityUnverified'};
  if(type==='preferred_equity'&&entry.shareClassVerified!==true)return {error:'shareClassUnverified'};
  if(!currency)return {error:'invalidCurrency'};
  return {...entry,symbol,exchange,currency,assetType:type,securityId:entry.securityId,listingId:entry.listingId};
}
function identityProblem(row,mapping,requestedSymbol,sourceExchange) {
  const symbol=row.symbol||row.ticker;
  if(!symbol)return 'symbolMissing';
  if(symbol!==requestedSymbol)return 'symbolMismatch';
  if(!row.exchange&&!row.exchange_code)return 'exchangeMissing';
  if(row.isin&&row.isin!==mapping.isin)return 'isinMismatch';
  if(row.price_currency&&normalizeCurrency(row.price_currency)!==normalizeCurrency(mapping.currency))return 'currencyMismatch';
  if(row.currency&&normalizeCurrency(row.currency)!==normalizeCurrency(mapping.currency))return 'currencyMismatch';
  const accepted=sourceExchange?[sourceExchange,...(mapping.intradayExchangeAliases||[])]:[mapping.exchange,mapping.mic,...(mapping.exchangeAliases||[])].filter(Boolean);
  if([row.exchange,row.exchange_code].filter(Boolean).some(venue=>!accepted.includes(venue)))return 'exchangeMismatch';
  const type=assetType(row.asset_type);
  if(mapping.assetType==='preferred_equity'&&type==='equity'&&mapping.shareClassVerified===true)return null;
  if(row.asset_type&&(!type||type!==mapping.assetType))return 'assetTypeMismatch';
  return null;
}
function normalizeBar(id,row,mapping,options={}) {
  const currency=normalizeCurrency(mapping.currency);
  if(!currency)return {ok:false,reason:'invalidCurrency'};
  const intraday=options.frequency==='INTRADAY';
  const sourceExchange=intraday?(mapping.intradayExchange||mapping.intraday_exchange):null;
  if(intraday&&!sourceExchange)return {ok:false,reason:'intradayVenueUnmapped'};
  const problem=identityProblem(row,mapping,options.symbol||mapping.symbol,sourceExchange);
  if(problem)return {ok:false,reason:problem};
  let date=validDate(row.date);
  if(intraday) {
    if(typeof row.date!=='string'||!row.date.includes('T')||!Number.isFinite(Date.parse(row.date)))return {ok:false,reason:'invalidTimestamp'};
    const timezone=mapping.timezone||mapping.timeZone||mapping.exchangeTimezone;
    if(!timezone)return {ok:false,reason:'exchangeTimezoneMissing'};
    try {
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(row.date));
      const part=t=>parts.find(p=>p.type===t).value;date=part('year')+'-'+part('month')+'-'+part('day');
    } catch (_) {return {ok:false,reason:'invalidExchangeTimezone'};}
  }
  const open=number(row.open),high=number(row.high),low=number(row.low),close=number(row.close),volume=number(row.volume);
  if(!date)return {ok:false,reason:'invalidDate'};
  if([open,high,low,close].some(n=>n===null||n<=0)||high<Math.max(open,close,low)||low>Math.min(open,close,high)||(volume!==null&&volume<0))return {ok:false,reason:'invalidOHLC'};
  // A global adjustment flag cannot certify every listing and time window.
  const evidence=mapping.adjustmentEvidence;
  const adjustmentVerified=!!(evidence&&evidence.verified===true&&evidence.source&&evidence.from<=date&&date<=evidence.to&&evidence.ohlcBasis==='SPLIT_AND_DIVIDEND_ADJUSTED');
  const adjusted=[row.adj_open,row.adj_high,row.adj_low,row.adj_close].map(number);
  if(adjusted.some(n=>n!==null&&n<=0)|| (adjusted.every(n=>n!==null) && (adjusted[1]<Math.max(adjusted[0],adjusted[2],adjusted[3])||adjusted[2]>Math.min(adjusted[0],adjusted[1],adjusted[3])))) return {ok:false,reason:'invalidAdjustedOHLC'};
  const splitFactor=number(row.split_factor),dividend=number(row.dividend),adjustedVolume=number(row.adj_volume);
  if((splitFactor!==null&&splitFactor<=0)||(dividend!==null&&dividend<0)||(adjustedVolume!==null&&adjustedVolume<0))return {ok:false,reason:'invalidCorporateAction'};
  return {ok:true,bar:{securityId:mapping.securityId||id,listingId:mapping.listingId||null,date,open,high,low,close,volume,
    adjustedOpen:adjusted[0],adjustedHigh:adjusted[1],adjustedLow:adjusted[2],adjustedClose:adjustmentVerified?adjusted[3]:null,adjustedVolume,
    ...(!adjustmentVerified&&!intraday?{adjustmentObservation:{open:adjusted[0],high:adjusted[1],low:adjusted[2],close:adjusted[3],volume:adjustedVolume,verification:'UNVERIFIED'}}:{}),
    splitFactor,dividend,volumeQuality:{state:mapping.volumeEvidence?.verified===true?'VERIFIED':'UNKNOWN',basis:mapping.volumeEvidence?.basis||'UNKNOWN',source:mapping.volumeEvidence?.source||null},adjustmentStatus:intraday?'raw':adjustmentVerified?'adjusted':'unknown',currency,assetType:mapping.assetType,dataSourceId:DATA_SOURCE_ID,
    ...(intraday?{timestamp:row.date}:{}),market_timestamp:row.date,provider_timestamp:row.date,retrieved_at:options.retrievedAt||null,
    currencyProvenance:{kind:row.price_currency||row.currency?'PROVIDER_ROW':'VERIFIED_LISTING_DERIVATION',source:row.price_currency||row.currency?'price_currency/currency':mapping.currencySource},quoteUnit:currency==='GBX'?'PENCE':'MAJOR_CURRENCY_UNIT',
    sourceVenue:sourceExchange||row.exchange||mapping.exchange,data_frequency:intraday?'INTRADAY':'EOD',delay_state:intraday?'UNKNOWN':'EOD_ONLY'}};
}
function createMarketstackProvider(options={}) {
  const client=options.client||createMarketstackClient(options);
  const capabilities=Capabilities.declare(PROVIDER_ID,{plan:'UNVERIFIED_CURRENT_ACCOUNT',market:{historicalDaily:null,daily:null,adjustedPrices:null,splitAdjustedPrices:null,splits:null,dividends:null,intraday:null,historicalIntraday:null,realtime:null,delayed:null,websocket:false,extendedHours:null,symbolSearch:null,marketStatus:false,bulkQuotes:null},fundamental:{annual:null,quarterly:null,asReported:null,standardized:null,pointInTime:null,restatements:null,filingDates:null},reference:{securityMaster:null,exchanges:null,isin:null,delisted:null},notes:{realtime:'No realtime capability is asserted without account and timestamp evidence.',adjustedPrices:'Documented CRSP methodology; empirical adjustment verification remains required.'}});
  function unavailable(reason,message) {return {available:false,data:null,reason,message:message||reason};}
  function result(res,data,endpoint,mapping) {
    if(!res.ok)return {...unavailable(res.reason,res.message),status:res.status||null,source:res.source||null,complete:res.complete};
    const asOf=data&&data.bars&&data.bars.length?data.bars[data.bars.length-1].date:(data&&(data.timestamp||data.reportDate))||res.retrievedAt;
    return {available:true,data,fromCache:!!res.fromCache,stale:false,complete:res.complete!==false,
      provenance:{...Schema.makeProvenance({provider:PROVIDER_ID,source:'Marketstack',asOf:String(asOf).slice(0,10),ingestedAt:res.retrievedAt,dataSnapshotId:'ingestion_marketstack_'+res.retrievedAt,isMock:false,adjustmentStatus:'unknown'}),
        apiVersion:'v2',host:'api.marketstack.com',provider_symbol:mapping.symbol,provider_exchange:endpoint.startsWith('/intraday')?(mapping.intradayExchange||mapping.intraday_exchange):mapping.exchange,listing_exchange:mapping.exchange,retrieved_at:res.retrievedAt,endpoint}};
  }
  async function bars(id,opts={},intraday=false) {
    const mapping=resolveMapping(id,options);if(mapping.error)return unavailable(mapping.error);
    if(intraday&&!(mapping.intradayExchange||mapping.intraday_exchange))return unavailable('intradayVenueUnmapped');
    if(intraday&&!(mapping.timezone||mapping.timeZone||mapping.exchangeTimezone))return unavailable('exchangeTimezoneMissing');
    // Measured IEX-derived payloads contain session OHLC/cumulative volume and
    // a prior close. They are not established interval candles.
    if(intraday&&options.intradayBarsVerified!==true)return unavailable('intradayBarSemanticsUnverified');
    const endpoint=intraday?'/intraday':'/eod';
    const symbol=intraday?(mapping.intradaySymbol||mapping.symbol.replace(/\./g,'-')):mapping.symbol;
    const params={symbols:symbol,exchange:intraday?(mapping.intradayExchange||mapping.intraday_exchange):mapping.exchange,sort:'ASC',limit:1000};
    if(opts.from)params.date_from=opts.from;if(opts.to)params.date_to=opts.to;
    if(intraday){params.interval=opts.interval||'5min';if(opts.extendedHours===true)params.after_hours=true;}
    const res=await client.paginate(endpoint,params,{maxPages:opts.maxPages||1000});
    if(!res.ok)return result(res,null,endpoint,mapping);
    const normalized=[],anomalies=[],seen=new Set();
    for(const row of res.data) {
      const checked=normalizeBar(id,row,mapping,{symbol,frequency:intraday?'INTRADAY':'EOD',retrievedAt:res.retrievedAt,adjustmentVerified:options.adjustmentVerified});
      if(!checked.ok){anomalies.push({date:row.date||null,reason:checked.reason});continue;}
      const key=intraday?checked.bar.timestamp:checked.bar.date;
      if(seen.has(key)){anomalies.push({date:key,reason:'duplicateCandle'});continue;}
      seen.add(key);normalized.push(checked.bar);
    }
    // Identity errors block the entire series: mixing currencies/venues is unsafe.
    if(anomalies.some(x=>['symbolMismatch','symbolMissing','exchangeMissing','isinMismatch','currencyMismatch','exchangeMismatch','assetTypeMismatch'].includes(x.reason)))return {...unavailable('identityMismatch'),anomalies};
    normalized.sort((a,b)=>String(a.timestamp||a.date).localeCompare(String(b.timestamp||b.date)));
    if(!normalized.length)return {...unavailable(res.data.length?'invalidPriceData':'dataUnavailable'),anomalies};
    return result(res,{securityId:mapping.securityId,listingId:mapping.listingId,providerSymbol:mapping.symbol,currency:mapping.currency,assetType:mapping.assetType,
      adjustmentStatus:intraday?'raw':'unknown',bars:normalized,anomalies,qualityStatus:anomalies.length?'PARTIAL':'VALIDATED_RAW_ONLY',technicalAdmission:anomalies.length?'BLOCKED':'NOT_TESTED',quarantinedSourceRows:res.data.filter(row=>!normalizeBar(id,row,mapping,{symbol,frequency:intraday?'INTRADAY':'EOD'}).ok),...(intraday?{interval:params.interval}:{} )},endpoint,mapping);
  }
  const api={providerId:PROVIDER_ID,isMock:false,capabilities,
    adjustmentStatus:()=>'unknown',
    getDailyBars:(id,opts)=>bars(id,opts),getHistoricalBars:(id,opts)=>bars(id,opts),getIntradayBars:(id,opts)=>bars(id,opts,true),
    async getQuote(id,opts={}) {
      const mapping=resolveMapping(id,options);if(mapping.error)return unavailable(mapping.error);
      const frequency=opts.frequency||'EOD';
      if(!['EOD','INTRADAY','SNAPSHOT'].includes(frequency))return unavailable('unsupportedFrequency');
      if(frequency==='INTRADAY'&&!(mapping.intradayExchange||mapping.intraday_exchange))return unavailable('intradayVenueUnmapped');
      const symbol=frequency==='INTRADAY'?(mapping.intradaySymbol||mapping.symbol.replace(/\./g,'-')):mapping.symbol;
      const endpoint=frequency==='EOD'?'/eod/latest':frequency==='INTRADAY'?'/intraday/latest':'/stockprice';
      const sourceExchange=frequency==='INTRADAY'?(mapping.intradayExchange||mapping.intraday_exchange):null;
      const params={exchange:sourceExchange||mapping.exchange,...(frequency==='SNAPSHOT'?{ticker:symbol}:{symbols:symbol,limit:1000})};
      const res=await client.request(endpoint,params);if(!res.ok)return result(res,null,endpoint,mapping);
      const rows=res.data&&res.data.data;
      if(!Array.isArray(rows))return unavailable('invalidResponse');
      // Require exactly one listing; a global quote must not choose a first match.
      if(rows.length!==1)return unavailable(rows.length?'ambiguousListing':'dataUnavailable');
      const row=rows[0],problem=identityProblem(row,mapping,symbol,sourceExchange);if(problem)return unavailable(problem);
      if(frequency==='SNAPSHOT'&&row.exchange_code&&!([mapping.exchange,mapping.mic,...(mapping.exchangeAliases||[])].includes(row.exchange_code)))return unavailable('exchangeMismatch');
      const timestamp=frequency==='SNAPSHOT'?row.trade_last:row.date;
      const last=frequency==='SNAPSHOT'?number(row.price):number(frequency==='INTRADAY'?row.marketstack_last??row.last:row.close);
      if(last===null||last<=0||!timestamp||!Number.isFinite(Date.parse(timestamp))||(frequency==='EOD'&&!validDate(timestamp)))return unavailable('invalidQuote');
      if(frequency==='EOD'&&[row.open,row.high,row.low].some(value=>value!==undefined&&value!==null)){const checked=normalizeBar(id,row,mapping);if(!checked.ok)return unavailable(checked.reason);}
      return result(res,{securityId:mapping.securityId,listingId:mapping.listingId,providerSymbol:mapping.symbol,last,previousClose:frequency==='INTRADAY'?number(row.close):null,...(frequency==='INTRADAY'?{referencePrice:number(row.marketstack_last),priceKind:row.marketstack_last!==null&&row.marketstack_last!==undefined?'REFERENCE':'LAST_TRADE'}:{}),
        open:number(row.open),high:number(row.high),low:number(row.low),volume:number(row.volume),timestamp,currency:mapping.currency,dataSourceId:DATA_SOURCE_ID,
        currencyProvenance:{kind:row.price_currency||row.currency?'PROVIDER_ROW':'VERIFIED_LISTING_DERIVATION',source:row.price_currency||row.currency?'price_currency/currency':mapping.currencySource},quoteUnit:mapping.currency==='GBX'?'PENCE':'MAJOR_CURRENCY_UNIT',
        market_timestamp:timestamp,provider_timestamp:timestamp,retrieved_at:res.retrievedAt,data_frequency:frequency==='SNAPSHOT'?'SNAPSHOT':frequency,
        sourceVenue:sourceExchange||row.exchange||mapping.exchange,delay_state:frequency==='EOD'?'EOD_ONLY':'UNKNOWN'},endpoint,mapping);
    },
    async getMetadata(id) {
      const mapping=resolveMapping(id,options);if(mapping.error)return unavailable(mapping.error);
      const endpoint='/tickers/'+encodeURIComponent(mapping.symbol);
      const res=await client.request(endpoint);if(!res.ok)return result(res,null,endpoint,mapping);
      const row=res.data&&(res.data.data||res.data);if(!row||typeof row!=='object'||Array.isArray(row))return unavailable('invalidResponse');
      const returnedSymbol=row.symbol||row.ticker;
      if(!returnedSymbol||returnedSymbol!==mapping.symbol)return unavailable('symbolMismatch');
      const returnedType=assetType(row.item_type||row.asset_type);
      if(row.isin&&row.isin!==mapping.isin)return unavailable('isinMismatch');
      if((row.item_type||row.asset_type)&&returnedType!==mapping.assetType&&!(mapping.assetType==='preferred_equity'&&returnedType==='equity'&&mapping.shareClassVerified))return unavailable('assetTypeMismatch');
      const exchanges=Array.isArray(row.stock_exchanges)?row.stock_exchanges:(row.stock_exchange?[row.stock_exchange]:[]);
      if(!exchanges.some(x=>[mapping.exchange,mapping.mic].includes(x.mic||x.exchange_mic)))return unavailable('exchangeMismatch');
      return result(res,{securityId:mapping.securityId,listingId:mapping.listingId,name:row.name||null,isin:row.isin||null,providerSymbol:mapping.symbol,exchange:mapping.exchange,currency:mapping.currency,assetType:mapping.assetType,
        coverage:{price_eod:row.has_eod===true?'PARTIAL':row.has_eod===false?'NONE':'UNKNOWN',intraday:row.has_intraday===true?'PARTIAL':row.has_intraday===false?'NONE':'UNKNOWN',realtime:'UNKNOWN'}},endpoint,mapping);
    },
    async getCorporateActions(id,opts={}) {
      const res=await api.getDailyBars(id,opts);if(!res.available)return res;
      const actions=[];
      for(const bar of res.data.bars) {
        if(bar.splitFactor!==null&&bar.splitFactor!==1)actions.push({actionId:'marketstack_split_'+id+'_'+bar.date,securityId:bar.securityId,listingId:bar.listingId,type:'split',exDate:bar.date,announcedAt:null,ratio:bar.splitFactor,dataSourceId:DATA_SOURCE_ID});
        if(bar.dividend!==null&&bar.dividend>0)actions.push({actionId:'marketstack_div_'+id+'_'+bar.date,securityId:bar.securityId,listingId:bar.listingId,type:'dividend',exDate:bar.date,announcedAt:null,amount:bar.dividend,currency:bar.currency,dataSourceId:DATA_SOURCE_ID});
      }
      return {...res,data:actions};
    },
    healthCheck:()=>({provider:PROVIDER_ID,status:client.health().status==='notConfigured'?'not_configured':client.health().status==='degraded'?'degraded':client.health().authenticationState==='NOT_TESTED'?'not_tested':'ok',authenticationState:client.health().authenticationState,message:'Marketstack ingestion only; observed data coverage is listing-specific',checkedAt:new Date().toISOString()}),
    stats:()=>client.stats(),quota:()=>client.stats(),rawHealth:()=>client.health(),clearCache:()=>client.clearCache()};
  return api;
}
module.exports={createMarketstackProvider,normalizeBar,resolveMapping,assetType,normalizeCurrency,number,PROVIDER_ID,DATA_SOURCE_ID};
