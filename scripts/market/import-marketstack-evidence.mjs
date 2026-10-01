// Replay authenticated evidence through the same canonical provider normalizer.
// Inputs are private Action artifacts. No network calls or US-master mutations.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), A=require('../../providers/marketstack/adapter.js'), G=require('../../quant/engines/global-market.js'), Geo=require('../../quant/engines/global-equities.js');
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
export function importEvidence(probe, references, existing=[]) {
 const official=new Map(references.flatMap(r=>r.matches||[]).map(r=>[r.provider_symbol,r]));
 const identities=new Map((probe.endpoints||[]).filter(e=>e.label==='listing-identity'&&e.ok).map(e=>[e.data.symbol,e]));
 const listings=[],histories={},decisions=[],keys=new Set();
 for(const e of probe.endpoints||[]) {
  if(e.label!=='global-qualified-eod')continue;
  const symbol=e.params.symbols, identity=identities.get(symbol), ref=official.get(symbol), raw=e.data?.data;
  const blocked=reason=>decisions.push({providerSymbol:symbol,status:'BLOCKED',reason});
  if(!e.ok||!Array.isArray(raw)||!raw.length){blocked('PRICE_UNAVAILABLE');continue;}
  const meta=identity?.data, venue=meta?.stock_exchange;
  if(!meta||!venue?.mic||!venue.country_code){blocked('LISTING_IDENTITY_MISSING');continue;}
  const type=A.assetType(meta.item_type);
  if(!type){blocked('ASSET_TYPE_UNVERIFIED');continue;}
  // Missing price currency requires instrument-specific official evidence.
  const currencies=[...new Set(raw.map(r=>r.price_currency||r.currency).filter(Boolean).map(A.normalizeCurrency))];
  if(currencies.length>1){blocked('MIXED_CURRENCY');continue;}
  if(ref&&(ref.mic!==venue.mic||(meta.isin&&ref.isin&&meta.isin!==ref.isin))){blocked('OFFICIAL_IDENTITY_MISMATCH');continue;}
  const currency=ref?.trading_currency||currencies[0];
  if(!currency||(!ref&&raw.some(r=>!r.price_currency&&!r.currency))){blocked('TRADING_CURRENCY_UNVERIFIED');continue;}
  if(currencies[0]&&currencies[0]!==currency){blocked('OFFICIAL_CURRENCY_MISMATCH');continue;}
  // GBP providers sometimes quote UK equities in pence: retain ambiguity.
  if(venue.country_code==='GB'&&!ref){blocked('UK_PRICE_SCALE_UNVERIFIED');continue;}
  const suffixes=[{XETR:'.DE',XAMS:'.AS',XPAR:'.PA',XMIL:'.MI',XCSE:'.CO',XSWX:'.SW',XBRU:'.BR',XMAD:'.MC',XWBO:'.VI',XSTO:'.ST',XOSL:'.OL',XHEL:'.HE',XLON:'.L',XKRX:'.KS',XHKG:'.HK',XTAI:'.TW',XNSE:'.NS',XJPX:'.T'}[venue.mic],'.'+venue.mic].filter(Boolean);
  const suffix=suffixes.find(s=>symbol.endsWith(s));
  const isin=ref?.isin||meta.isin||null, ticker=ref?.exchange_mnemonic||ref?.official_symbol||(suffix&&symbol.endsWith(suffix)?symbol.slice(0,-suffix.length):symbol);
  const key=ticker+'@'+venue.mic;
  const known=existing.filter(r=>r.mic===venue.mic&&((r.ticker||r.symbol)===ticker||(isin&&r.isin===isin)));
  if(known.length>1){blocked('AMBIGUOUS_EXISTING_LISTING');continue;}
  const issuer=meta.cik?existing.find(r=>String(r.cik||'').padStart(10,'0')===String(meta.cik).padStart(10,'0')):null;
  const prior=known[0], listingId=prior?.listingId||prior?.instrumentId||'vu_'+hash(key), securityId=prior?.securityId||(isin?'sec_isin_'+isin:'sec_listing_'+hash(key));
  if(keys.has(key)){blocked('DUPLICATE_LISTING');continue;}
  const mapping={symbol,exchange:venue.mic,mic:venue.mic,currency,assetType:type,securityId,listingId};
  const bars=[], anomalies=[];
  for(const row of raw){const n=A.normalizeBar(securityId,row,mapping,{retrievedAt:e.retrievedAt||e.checkedAt});
   if(n.ok&&((e.params.date_from&&n.bar.date<e.params.date_from)||(e.params.date_to&&n.bar.date>e.params.date_to)||n.bar.date>probe.generatedAt.slice(0,10)))anomalies.push({date:row.date,reason:'outOfRequestedWindow'});
   else if(n.ok)bars.push(n.bar);else anomalies.push({date:row.date,reason:n.reason});}
  bars.sort((a,b)=>a.date.localeCompare(b.date));
  const issues=G.priceIssues(bars);
  // Reject identity contamination; quarantine malformed candles without losing
  // otherwise valid listings. Their gaps and PARTIAL coverage remain explicit.
  if(anomalies.some(a=>['symbolMismatch','currencyMismatch','exchangeMismatch','assetTypeMismatch'].includes(a.reason))||issues.length||bars.length<2){decisions.push({providerSymbol:symbol,status:'BLOCKED',reason:'PRICE_QUALITY_GATE',anomalies,issues});continue;}
  const last=bars.at(-1), sourceUpdatedAt=e.retrievedAt||e.checkedAt;
  const observations=G.priceObservations(bars,type.toUpperCase());
  const staleDays=Math.floor((Date.parse(probe.generatedAt)-Date.parse(last.date))/86400000);
  const preferred=/VZO|PREFERENCE|PREFERRED/i.test(ref?.official_instrument_name||meta.name||'');
  const companyId=type==='equity'?(prior?.companyId||issuer?.companyId||issuer?.issuerId||null):null;
  const row={listingId,securityId,companyId,fundId:type==='etf'?'fund_'+hash(isin||key):null,
    ticker,name:meta.name,companyName:type==='equity'?meta.name:null,assetType:type.toUpperCase(),listingType:prior?.listingType||(preferred?'PREFERRED':'UNKNOWN'),
    isin,issuerLEI:meta.lei||null,wkn:ref?.wkn||null,mic:venue.mic,exchange:venue.name,listingCountry:venue.country_code,country:prior?.country||null,
    region:prior?.region||Geo.region(prior?.country),listingRegion:Geo.region(venue.country_code),universeTier:Geo.region(venue.country_code)==='EUROPE'?'EUROPE':'GLOBAL_SELECT',
    tradingCurrency:currency,reportingCurrency:prior?.reportingCurrency||null,displayCurrency:currency,primaryListing:prior?.primaryListing??null,
    adrRatio:prior?.adrRatio??null,adrRatioSource:prior?.adrRatioSource||null,adrRatioBasis:prior?.adrRatioBasis||null,
    shareCountBasis:prior?.shareCountBasis||null,shareCountBasisSource:prior?.shareCountBasisSource||null,epsBasis:prior?.epsBasis||null,epsBasisSource:prior?.epsBasisSource||null,
    active:ref?.instrument_status==='Active'?true:null,activeBasis:ref?.instrument_status==='Active'?'OFFICIAL_INSTRUMENT_STATUS':'UNKNOWN',
    providerSymbol:symbol,providerExchange:venue.mic,classificationSource:'MARKETSTACK_TICKER_METADATA'+(ref?'+OFFICIAL_REFERENCE':''),
    currencySource:ref?.source||{source_system:'MARKETSTACK_EXPLICIT_PRICE_CURRENCY'},source:'marketstack',sourceUpdatedAt,
    identityStatus:companyId?'EXISTING_ISSUER_LINK':'ISSUER_UNLINKED',corporateActionBasis:'UNVERIFIED',freshness:{lastTradingDate:last.date,staleDays,delayState:'EOD_ONLY'},
    quality:{status:anomalies.length||observations.length?'PARTIAL':'VALID_OBSERVED_WINDOW',quarantinedCandles:anomalies.length,unexplainedJumps:observations.length,priceBasis:'PROVIDER_REPORTED_UNVERIFIED'},
    coverage:{price_eod:staleDays>7||anomalies.length?'PARTIAL':'FULL',price_history:'PARTIAL',intraday:'UNKNOWN',realtime:'UNKNOWN',corporate_actions:raw.some(r=>r.split_factor!=null||r.dividend!=null)?'PARTIAL':'UNKNOWN',fundamentals:'NONE',technical:'NONE',etf_holdings:type==='etf'?'UNKNOWN':'NONE'}};
  G.validateListing(row);keys.add(key);listings.push(row);
  histories[listingId]={schemaVersion:'canonical-market-history-1.0.0',securityId,listingId,currency,assetType:type,adjustmentStatus:'unknown',quality:row.quality,quarantined:anomalies,retrievedAt:sourceUpdatedAt,provenance:{provider:'marketstack',providerSymbol:symbol,providerExchange:venue.mic,endpoint:'eod',currencySource:row.currencySource},bars};
  decisions.push({providerSymbol:symbol,status:'IMPORTED',listingId,bars:bars.length,quarantinedCandles:anomalies.length,anomalies,observations,from:bars[0].date,to:last.date,staleDays,assetType:row.assetType,currency});
 }
 const layer={schemaVersion:G.VERSION,generatedAt:probe.generatedAt,listings};G.validate(layer);
 return {layer,histories,summary:{generatedAt:probe.generatedAt,inputListings:decisions.length,imported:listings.length,blocked:decisions.filter(d=>d.status==='BLOCKED').length,
   germanEquities:listings.filter(r=>r.listingCountry==='DE'&&r.assetType==='EQUITY').length,europeanEquities:listings.filter(r=>r.listingRegion==='EUROPE'&&r.assetType==='EQUITY').length,
   globalSelectEquities:listings.filter(r=>r.universeTier==='GLOBAL_SELECT'&&r.listingCountry!=='US'&&r.assetType==='EQUITY').length,etfs:listings.filter(r=>r.assetType==='ETF').length,
   bars:Object.values(histories).reduce((s,h)=>s+h.bars.length,0),quarantinedCandles:Object.values(histories).reduce((s,h)=>s+h.quarantined.length,0),missingFundamentals:listings.filter(r=>r.assetType==='EQUITY').length,missingVerifiedAdjustmentBasis:listings.length,decisions}};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
 const probe=arg('probe'), out=arg('out')||'.market-cache/marketstack/imported', refs=arg('references');
 if(!probe||!refs)throw Error('PROBE_AND_REFERENCES_REQUIRED');
 const existing=readdirSync('quant/data/universe/instruments').filter(f=>f.endsWith('.json')).flatMap(f=>JSON.parse(readFileSync(join('quant/data/universe/instruments',f))).instruments||[]);
 const overlay=JSON.parse(readFileSync('quant/data/universe/global-equities.json'));
 for(const row of overlay.listings||[]){const prior=existing.find(r=>(r.listingId||r.instrumentId)===row.listingId);if(prior)Object.assign(prior,row);else existing.push(row);}
 const result=importEvidence(JSON.parse(readFileSync(probe)),refs.split(',').map(f=>JSON.parse(readFileSync(f))),existing);
 mkdirSync(join(out,'daily'),{recursive:true});writeFileSync(join(out,'listings.json'),JSON.stringify(result.layer)+'\n');
 for(const [id,h]of Object.entries(result.histories))writeFileSync(join(out,'daily',id+'.json'),JSON.stringify(h)+'\n');
 const summary=arg('summary');if(summary){mkdirSync(resolve(summary,'..'),{recursive:true});writeFileSync(summary,JSON.stringify(result.summary,null,2)+'\n');}
 console.log(JSON.stringify({...result.summary,decisions:undefined}));
}
