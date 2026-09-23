/* VU2 product services: the only file in this experience that knows storage
 * paths. Existing scoped display policy is applied before market data reads.
 * Financial values come from existing validated panel; no new factor engine. */
(function(g){
'use strict';
const MarketSignals=typeof module!=='undefined'&&module.exports?require('./market-signal-contract.js'):g.VUMarketSignalContract;
const PortfolioWorkspace=typeof module!=='undefined'&&module.exports?require('./portfolio-workspace.js'):g.VUPortfolioWorkspace;
const WatchlistWorkspace=typeof module!=='undefined'&&module.exports?require('./watchlist-workspace.js'):g.VUWatchlistWorkspace;
const MarketHealth=typeof module!=='undefined'&&module.exports?require('./market-health-contract.js'):g.VUMarketHealthContract;
const MarketSession=typeof module!=='undefined'&&module.exports?require('./market-session-contract.js'):g.VUMarketSessionContract;
const CompareWorkspace=typeof module!=='undefined'&&module.exports?require('./compare-workspace.js'):g.VUCompareWorkspace;
const Methodology=typeof module!=='undefined'&&module.exports?require('../engines/methodology.js'):g.VUMethodology;
const Rules=typeof module!=='undefined'&&module.exports?require('../engines/rule-contract.js'):g.VURuleContract;
const Strategy=typeof module!=='undefined'&&module.exports?require('../engines/strategy.js'):g.VUStrategy;
const QuantWorkspace=typeof module!=='undefined'&&module.exports?require('./quant-workspace-contract.js'):g.VUQuantWorkspaceContract;
const SetupState=typeof module!=='undefined'&&module.exports?require('../engines/setup-state-contract.js'):g.VUSetupStateContract;
const SetupEngine=typeof module!=='undefined'&&module.exports?require('../engines/setup-engine.js'):g.VUSetupEngine;
const TechnicalWorkspace=typeof module!=='undefined'&&module.exports?require('./technical-workspace-contract.js'):g.VUTechnicalWorkspaceContract;
const IntradaySnapshot=typeof module!=='undefined'&&module.exports?require('../engines/realtime/intraday-snapshot.js'):g.VURealtime?.IntradaySnapshot;
const History=typeof module!=='undefined'&&module.exports?require('./fundamentals-contract.js'):g.VUFundamentalsContract;
const Directory=typeof module!=='undefined'&&module.exports?require('../engines/instrument-directory.js'):g.VUInstrumentDirectory;
const Master=typeof module!=='undefined'&&module.exports?require('../engines/company-master.js'):g.VUCompanyMaster;
const FactorEvidence=typeof module!=='undefined'&&module.exports?require('../engines/factor-evidence.js'):g.VUFactorEvidence;
const ChangeEngine=typeof module!=='undefined'&&module.exports?require('../engines/change-engine.js'):g.VUChangeEngine;
const StrategyMatch=typeof module!=='undefined'&&module.exports?require('../engines/strategy-match.js'):g.VUStrategyMatch;
function create(options){
 const load=options.loadJSON, policy=options.displayPolicy, queryEngine=options.queryEngine; let ready,configReady;
 const directory=Directory.create({loadJSON:load});
 async function compressedJSON(path){
  const loader=options.loadCompressedJSON||g.QuantShell?.loadCompressedJSON;
  if(loader)return loader(path);
  // Only this service constructs these same-origin materialized paths.
  if(!/^\/quant\/data\/sec\/quarterly\/[0-9]{2}\.json\.gz$/.test(path)&&
     !/^\/quant\/data\/product\/factor-evidence-v1\/(?:[A-Z0-9._-]{2}|screening)\.json\.gz$/.test(path)&&
     !/^\/quant\/data\/product\/setup-observations-v1\/(?:[A-Z0-9._-]{2}|screen-index)\.json\.gz$/.test(path)&&
     !/^\/quant\/data\/product\/pattern-match-v1\/[A-Z0-9._-]{2}\.json\.gz$/.test(path)&&
     !/^\/quant\/data\/product\/technical-signals-v1\/(?:[A-Z0-9._-]{2}|signals-(?:5|20|60))\.json\.gz$/.test(path))throw Error('INVALID_ARTIFACT_PATH');
  const response=await fetch(path,{credentials:'omit'});if(!response.ok)throw Error('SOURCE_MISSING');
  const input=new Uint8Array(await response.arrayBuffer());if(input.length>131072)throw Error('ARTIFACT_TOO_LARGE');
  if(input[0]!==31||input[1]!==139){if(response.headers.get('content-encoding')==='gzip')return JSON.parse(new TextDecoder().decode(input));throw Error('INVALID_COMPRESSION');}
  if(typeof DecompressionStream!=='function')throw Error('DECOMPRESSION_UNSUPPORTED');
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>1048576)throw Error('ARTIFACT_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(output));
 }
 async function identity(ticker){
  const result=await directory.getInstrument(ticker),i=result.instrument;
  if(result.status!=='OK'||!i||i.symbol!==ticker||!Master.inProductUniverse(i)||!/^vu_[a-f0-9]+$/.test(i.instrumentId)||!i.masterMemberId||!(i.legacyIds||[]).includes(i.masterMemberId))return null;
  return i;
 }
 function canonicalIdentity(i){return !!i&&Master.inProductUniverse(i)&&/^vu_[a-f0-9]+$/.test(i.instrumentId)&&!!i.masterMemberId&&(i.legacyIds||[]).includes(i.masterMemberId);}
 function identityModel(i){return {securityId:i.instrumentId,instrumentId:i.instrumentId,masterMemberId:i.masterMemberId,issuerId:i.issuerId||null,ticker:i.symbol,name:i.companyName||i.symbol,productEligibility:i.productEligibility};}
 async function searchInstruments(query,{limit=12}={}){
  const q=String(query||'').trim();if(!q)return {state:'AVAILABLE',entries:[],scope:'CANONICAL_PRODUCT_UNIVERSE'};
  const boundedLimit=Math.max(1,Math.min(30,Number.isInteger(limit)?limit:12));let failed=false;
  // Directory owns indexing, ranking and identity resolution. Isolate failures
  // per request because its optional-shard API otherwise treats I/O as no hits.
  const searchDirectory=Directory.create({loadJSON:async path=>{try{return await load(path);}catch(e){failed=true;throw e;}}});
  try{const result=await searchDirectory.search(q,{limit:boundedLimit*3});
   const resolved=await Promise.all(result.entries.map(e=>searchDirectory.getInstrument({symbol:e.s,instrumentId:e.i})));
   if(failed)return {state:'SOURCE_MISSING',reason:'DIRECTORY_SOURCE_UNAVAILABLE',entries:[]};
   const seen=new Set(),entries=[];
   for(let index=0;index<resolved.length;index++){const i=resolved[index].instrument,e=result.entries[index];if(resolved[index].status!=='OK'||!canonicalIdentity(i)||i.instrumentId!==e.i||seen.has(i.masterMemberId))continue;seen.add(i.masterMemberId);entries.push(identityModel(i));}
   return {state:'AVAILABLE',entries:entries.slice(0,boundedLimit),scope:'CANONICAL_PRODUCT_UNIVERSE',limited:result.entries.length===boundedLimit*3||entries.length>boundedLimit};
  }catch{return {state:'SOURCE_MISSING',reason:'DIRECTORY_SOURCE_UNAVAILABLE',entries:[]};}
 }
 async function identityOnlyStock(ticker,reason='PRODUCT_DATA_NOT_CONNECTED'){
  try{const result=await directory.getInstrument(ticker),i=result.instrument;if(result.status!=='OK'||i?.symbol!==ticker||!canonicalIdentity(i))return unavailable('INVALID_IDENTITY');
   const missing={state:'UNAVAILABLE',reason};
   return {...identityModel(i),state:'UNAVAILABLE',identityState:'AVAILABLE',reason,availability:{fundamentals:{...missing},history:{...missing},technical:{...missing},quant:{...missing},intraday:{...missing},realtime:{...missing}},workspaces:workspaces(ticker)};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 function config(){if(!configReady)configReady=Promise.all([
  load('/quant/config/development-preview.json'),load('/quant/config/feature-gates.json')
 ]).then(([preview,gates])=>{policy.declareFromConfig(preview);return {preview,gates:policy.gatesFromConfig(gates)};}).catch(e=>{configReady=null;throw e;});return configReady;}
 function init(){if(!ready)ready=Promise.all([
  config(),
  load('/quant/data/sec/quant-factor-inputs.json').catch(()=>null)
 ])
 .then(([c,panel])=>{
   return {...c,panel,capabilities:null,productSummary:null,factorIndex:null};
 }).catch(e=>{ready=null;throw e;});return ready;}
 async function hydrateCapabilities(c){
  if(c.capabilities)return c;
  const [capabilities,productSummary]=await Promise.all([load('/quant/data/universe/market-capability.json'),load('/quant/data/product/capabilities-summary-v1.json').catch(()=>null)]);
  c.capabilities=capabilities;c.productSummary=productSummary;return c;
 }
 async function hydrateFullUniverseFactors(c){
  if(c.factorIndex)return c;
  const factors=await load('/quant/data/market/factors/factors-FULL_UNIVERSE.json');
   const factorIndex=Object.create(null);
   const list=Array.isArray(factors&&factors.securities)?factors.securities:Object.values((factors&&factors.securities)||{});
   list.forEach(f=>{if(f&&f.ticker)factorIndex[f.ticker]=f;if(f&&f.securityId)factorIndex[f.securityId]=f;});
  c.factors=factors;c.factorIndex=factorIndex;return c;
 }
 function permission(c,ticker,form){
  const args={providerId:'tiingo',dataClass:'marketData',form:form||'derived',ticker,gates:c.gates};
  const publicGrant=policy.check({...args,audience:'public'});
  return publicGrant.allowed?publicGrant:policy.check({...args,audience:'development_preview'});
 }
 function unavailable(reason){return {state:'UNAVAILABLE',reason,stocks:[]};}
 function metric(value,unit){return {value:Number.isFinite(value)?value:null,unit,state:Number.isFinite(value)?'AVAILABLE':'SOURCE_MISSING'};}
 function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
 async function row(c,ticker){
  const s=c.panel&&c.panel.securities&&c.panel.securities[ticker];
  if(!s||!s.available||s.ticker!==ticker||s.securityId!=='sec_'+ticker)return null;
  if(!s.provenance||s.provenance.isMock!==false)return null;
  const instrument=await identity(ticker);if(!instrument)return null;
  const marketDate=s.marketData&&s.marketData.asOf;
  if(!validDate(marketDate)||marketDate>new Date().toISOString().slice(0,10))return null;
  const f=s.fundamentals||{};
  if(!validDate(f._asOfAvailableAt)||f._asOfAvailableAt>new Date().toISOString().slice(0,10))return null;
  const allowed=permission(c,ticker).allowed;
  const m=(key,unit,market=false)=>metric(market&&!allowed?null:f[key],unit);
  return {securityId:instrument.instrumentId,instrumentId:instrument.instrumentId,masterMemberId:instrument.masterMemberId,issuerId:instrument.issuerId,sourceSecurityId:s.securityId,ticker,name:s.reference.name,industry:s.reference.industry||null,
   state:'AVAILABLE',marketState:allowed?'AVAILABLE':'UNAVAILABLE',asOf:s.marketData&&s.marketData.asOf,
   fundamentalsAsOf:s.asOfPeriodEnd,availableAt:f._asOfAvailableAt||null,
   price:permission(c,ticker,'raw').allowed?m('price','USD',true):{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'},momentum6m:m('momentum6m','percent',true),
   above200:m('priceTo200dma','percent',true),above50:m('priceTo50dma','percent',true),
   revenueGrowth:m('revenueGrowth','percent'),operatingMargin:m('operatingMargin','percent'),
   fcfMargin:m('fcfMargin','percent'),roic:m('roic','percent'),drawdown:m('maxDrawdown','percent',true),
   provenance:{fundamentals:'SEC EDGAR',market:allowed?'Tiingo EOD':null,methodology:'/quant/data-inspector/',
    marketMetricOwner:'quant/engines/factors.js',marketUnits:'percent; legacy definition, not market-factors ratio aliases'},
   workspaces:workspaces(ticker)};
 }
 /* Broad product projection.  This is deliberately only a projection over
  * the already published Company/Security Master capability and factor
  * artifacts.  It does not create a second universe or a new factor engine.
  * A missing factor row remains missing (fail closed). */
 function broadRow(c,member){
  if(!member||typeof member.s!=='string'||typeof member.i!=='string'||typeof member.m!=='string')return null;
  const f=c.factorIndex&&((c.factorIndex[member.m])||(c.factorIndex[member.s])),factorReady=!!f||Number(member.b)>0;
  const v=f&&f.values||{}, candidate=c.panel&&c.panel.securities&&c.panel.securities[member.s],today=new Date().toISOString().slice(0,10),legacy=candidate&&candidate.available&&candidate.provenance?.isMock===false&&validDate(candidate.marketData?.asOf)&&candidate.marketData.asOf<=today?candidate:null;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const derived=(value,unit)=>({value:finite(value)?value:null,unit,state:finite(value)?'AVAILABLE':'SOURCE_MISSING'});
  const capability={
   profile:true,priceHistory:member.ph===true,priceSnapshot:member.ps===true,
   fundamentals:member.fr===true,factors:factorReady,technical:member.t==='TECHNICAL_READY',
   lastPriceDate:member.l||null,firstPriceDate:member.f||null
  };
  const lf=legacy&&legacy.fundamentals||{};
  const choose=(a,b)=>finite(a)?a:(finite(b)?b:null);
  return {securityId:member.i,instrumentId:member.i,masterMemberId:member.m,issuerId:null,
   ticker:member.s,name:member.s,industry:null,state:'AVAILABLE',identityState:'AVAILABLE',
   marketState:member.ps===true?'AVAILABLE':'UNAVAILABLE',
   factorState:factorReady?'AVAILABLE':'UNAVAILABLE',factorReason:factorReady?null:'NO_FACTOR_ROW',
   capabilities:capability,asOf:f&&f.asOf||member.l||null,
   price:finite(lf.price)?{value:lf.price,unit:'USD',state:'AVAILABLE'}:{value:null,unit:'USD',state:'UNAVAILABLE',reason:'PRICE_LEVEL_WITHHELD'},
   momentum6m:derived(choose(lf.momentum6m,v.returns&&v.returns['6M']),'ratio'),
   momentum12m:derived(choose(lf.momentum12m,v.returns&&v.returns['12M']),'ratio'),
   priceTo200dma:derived(choose(lf.priceTo200dma,v.distanceToSMA200),'ratio'),priceTo50dma:derived(choose(lf.priceTo50dma,v.distanceToSMA50),'ratio'),
   distanceTo52wHigh:derived(v.distanceTo52wHigh,'ratio'),volatility:derived(v.volatility252d,'ratio'),
   drawdown:derived(choose(lf.maxDrawdown,v.maxDrawdown252d),'ratio'),
   above200:derived(choose(lf.priceTo200dma,v.distanceToSMA200),'ratio'),above50:derived(choose(lf.priceTo50dma,v.distanceToSMA50),'ratio'),
   revenueGrowth:derived(lf.revenueGrowth,'percent'),operatingMargin:derived(lf.operatingMargin,'percent'),fcfMargin:derived(lf.fcfMargin,'percent'),roic:derived(lf.roic,'percent'),
   provenance:{market:f?'Tiingo EOD factor artifact':null,sourcePath:f?'/quant/data/market/factors/factors-FULL_UNIVERSE.json':null,
    dataQuality:f&&f.dataQuality||'SOURCE_MISSING',fieldStatus:f&&f.fieldStatus||null,methodology:f&&f.basis||null},
   workspaces:workspaces(member.s)};
 }
 function applyConsumer(stock,consumer){
  if(!consumer||consumer.dataMode!=='real'||consumer.isMock===true)return stock;
  const metrics=consumer.metrics||{},latest=consumer.fundamentals?.latest||{},derived=latest.derived||{};
  const measured=(value,unit)=>Number.isFinite(value)?{value,unit,state:'AVAILABLE'}:null,scaled=(value,unit)=>Number.isFinite(value)?measured(value*100,unit):null;
  stock.name=consumer.companyName||stock.name;stock.industry=consumer.industry||consumer.sector||stock.industry;
  stock.price=measured(consumer.price?.value,'USD')||stock.price;
  stock.consumerMetrics=metrics;if(stock.capabilities?.fundamentals===false)return stock;
  stock.revenueGrowth=scaled(metrics.f_revenueGrowthTTM,'percent')||stock.revenueGrowth;
  stock.operatingMargin=scaled(derived.operatingMargin,'percent')||stock.operatingMargin;
  stock.fcfMargin=scaled(derived.fcfMargin,'percent')||stock.fcfMargin;
  stock.netMargin=scaled(metrics.f_netMargin,'percent');stock.roe=scaled(metrics.f_roe,'percent');
  stock.pe=measured(metrics.f_pe,'x');stock.ps=measured(metrics.f_ps,'x');stock.fcfYield=scaled(metrics.f_fcfYield,'percent');
  stock.fundamentalsAsOf=latest.annual?.revenue?.end||stock.fundamentalsAsOf||stock.asOf;
  stock.availableAt=latest.annual?.revenue?.filed||stock.availableAt||stock.asOf;
  return stock;
 }
 async function consumerFor(ticker){try{return await load('/discover/data/stocks/US_REAL/'+ticker+'.json');}catch{return null;}}
 function broadQuantWorkspace(stock){
  const finite=v=>typeof v==='number'&&Number.isFinite(v), metric=(id,label,value,unit,reason,asOf)=>({metricId:id,label,unit:unit||'pct',value:finite(value)?value:null,state:finite(value)?'AVAILABLE':'SOURCE_MISSING',reason:reason||(!finite(value)?'SOURCE_MISSING':null),description:'Bestehende veröffentlichte Evidenz; kein aktivierter Quant-V2-Score.',owner:'quant/engines/factors.js',registryId:'factor.'+id,definitionVersion:'1.0.0',catalog:'quant/engines/metric-registry.js',panelVersion:'quant-evidence-1.0.0',asOf:asOf||stock.asOf,availableAt:asOf||stock.asOf});
  const v=stock._factorValues||{};
  const families=[
   ['quality','Quality','Wie belastbar ist die Ertragskraft?',[metric('operatingMargin','Operative Marge',stock.operatingMargin?.value,'pct'),metric('netMargin','Nettomarge',stock.netMargin?.value,'pct'),metric('roe','Eigenkapitalrendite',stock.roe?.value,'pct'),metric('roic','ROIC',stock.roic?.value,'pct')]],
   ['growth','Growth','Wie verändert sich das Geschäft?',[metric('revenueGrowth','Umsatzwachstum',stock.revenueGrowth?.value,'pct')]],
   ['momentum','Momentum','Wie entwickelt sich der Kurs?',[metric('momentum6m','Kursentwicklung · 6M',finite(stock.momentum6m?.value)?stock.momentum6m.value*100:null,'pct'),metric('momentum12m','Kursentwicklung · 12M',finite(stock.momentum12m?.value)?stock.momentum12m.value*100:null,'pct'),metric('priceTo200dma','Abstand zum 200-Tage-Durchschnitt',finite(stock.priceTo200dma?.value)?stock.priceTo200dma.value*100:null,'pct')]],
   ['value','Value','Wie steht der Preis zum Geschäft?',[metric('priceEarnings','Kurs-Gewinn-Verhältnis',stock.pe?.value,'x'),metric('priceSales','Kurs-Umsatz-Verhältnis',stock.ps?.value,'x'),metric('fcfYield','Free-Cashflow-Rendite',stock.fcfYield?.value,'pct')]],
   ['profitability','Profitability','Wie effizient arbeitet das Unternehmen?',[metric('fcfMargin','FCF-Marge',stock.fcfMargin?.value,'pct'),metric('netMargin','Nettomarge',stock.netMargin?.value,'pct')]],
   ['revisions','Revisions','Wie verändern sich Analystenerwartungen?',[metric('earningsRevisions','Earnings Revisions',null,'percent','LICENSED_ANALYST_PIT_NOT_AVAILABLE')]],
   ['risk','Risk','Welche Risiken zeigen die Kursdaten?',[metric('volatility','Volatilität',finite(stock.volatility?.value)?stock.volatility.value*100:null,'pct'),metric('maxDrawdown','Maximaler Drawdown',finite(stock.drawdown?.value)?Math.abs(stock.drawdown.value*100):null,'pct')]]
  ];
  return {state:'AVAILABLE',version:'quant-evidence-1.0.0',ticker:stock.ticker,name:stock.name,asOf:stock.asOf,fundamentalsAsOf:stock.fundamentalsAsOf||stock.asOf,availableAt:stock.availableAt||stock.asOf,score:{state:'UNAVAILABLE',reason:'QUANT_V2_NOT_ACTIVE'},pitEligible:false,families:families.map(([id,label,question,metrics])=>({id,label,question,metrics})),methodology:'quant-v2.0.0',methodologyState:'SPECIFIED_NOT_ACTIVE',methodologyHref:'/quant/data-inspector/',legacyHref:'/quant/stock/?ticker='+encodeURIComponent(stock.ticker)};
 }
 async function setupFor(stock){
  if(!SetupState||!stock)return null;
  const asOf=validDate(stock.asOf)?stock.asOf:new Date().toISOString().slice(0,10),observedAt=new Date().toISOString();
  try{return SetupState.fromCurrentSnapshot({identity:{instrumentId:stock.instrumentId,securityId:stock.masterMemberId,ticker:stock.ticker},observedAt,asOf,dataCutoff:asOf,provenance:{dataMode:'real',isMock:false,source:'vision-universe:materialized-product-data',dataVersion:'product-data-1.0.0',methodologyVersions:{setupState:'setup-state-1.0.0'},parametersHash:'0000000000000000'},evidenceRefs:[]});}catch{return null;}
 }
 function workspaces(t){const q=encodeURIComponent(t);return [
  ['Full Chart','/quant/stock/?ticker='+q],['Technical','/vu2/?view=technical&ticker='+q],
  ['Elliott Wave','/vu2/?view=elliott&ticker='+q],
  ['Historische Fundamentals','/vu2/?view=fundamentals&ticker='+q],['Quant','/vu2/?view=quant&ticker='+q],
  ['Vergleichen','/vu2/?view=compare&ticker='+q],['Strategie definieren','/vu2/?view=strategies']
 ].map(([label,href])=>({label,href}));}
 function technicalShard(ticker){return (ticker+'_').slice(0,2).replace(/[^A-Z0-9._-]/g,'_');}
 /* Factor DNA and What-Changed for one title. The artifact carries a
  * withheld composite by construction; this reader refuses anything that
  * claims otherwise rather than rendering a score the gate forbids. */
 /* Quant-V2-Evidenz als Screening-Zeile. Die Spalten sind kanonische
  * Katalogfelder des Namensraums quantV2.factorEvidence; Quant V1 bleibt
  * davon unberuehrt und wird nie in dieselbe Zeile gemischt. */
 let screeningPromise=null;
 async function getFactorEvidenceScreening(){
  if(!screeningPromise)screeningPromise=(async()=>{
   try{
    const payload=await compressedJSON('/quant/data/product/factor-evidence-v1/screening.json.gz');
    if(!FactorEvidence.validScreening(payload))return {state:'UNAVAILABLE',reason:'INVALID_SCREENING_ARTIFACT',rows:[]};
    const rows=Object.entries(payload.rows).map(([ticker,values])=>FactorEvidence.screeningRow(ticker,values,payload.fields)).filter(Boolean);
    return {state:'AVAILABLE',namespace:payload.namespace,methodologyVersion:payload.methodologyVersion,
     asOf:payload.asOf,fields:payload.fields,publication:payload.publication,rows};
   }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING',rows:[]};}
  })();
  return screeningPromise;
 }
 /* Strategy Match liest ausschliesslich Quant-V2-Evidenz. Der Vertrag
  * nennt den erlaubten Namensraum, und die Engine weist ein Profil ab,
  * das darueber hinausgreift - deshalb steht hier keine zweite Pruefung. */
 let profilesPromise=null;
 async function getStrategyProfiles(){
  if(!profilesPromise)profilesPromise=(async()=>{
   try{
    const contract=await load('/quant/methodology/strategy-profiles-v1.json');
    const validation=StrategyMatch.validateContract(contract);
    return validation.valid?{state:'AVAILABLE',contract}:{state:'UNAVAILABLE',reason:'INVALID_PROFILE_CONTRACT',errors:validation.errors};
   }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};}
  })();
  return profilesPromise;
 }
 async function getStrategyMatch(ticker){
  ticker=String(ticker||'').toUpperCase();
  const [profiles,screening]=await Promise.all([getStrategyProfiles(),getFactorEvidenceScreening()]);
  if(profiles.state!=='AVAILABLE')return {state:'UNAVAILABLE',reason:profiles.reason||'PROFILES_UNAVAILABLE',profiles:[]};
  if(screening.state!=='AVAILABLE')return {state:'UNAVAILABLE',reason:screening.reason||'EVIDENCE_UNAVAILABLE',profiles:[]};
  const row=screening.rows.find(entry=>entry.ticker===ticker);
  if(!row)return {state:'UNAVAILABLE',reason:'NOT_COVERED_BY_FACTOR_EVIDENCE',profiles:[]};
  return {...StrategyMatch.evaluate(profiles.contract,row),ticker,asOf:screening.asOf};
 }
 /* Die Setup-Beobachtung eines Titels. Was hier zurueckkommt, ist die
  * Regel, die den Zustand entschieden hat, samt ihrer Bedingungen - nicht
  * ein Etikett ohne Herleitung. Der Lebenszyklus bleibt getrennt von der
  * Klassifikation: 'heute sieht es so aus' und 'der Titel steht an dieser
  * Stelle seines Verlaufs' sind zwei verschiedene Aussagen, und die
  * zweite verlangt eine geordnete Beobachtungshistorie. */
 async function getSetupObservation(ticker){
  ticker=String(ticker||'').toUpperCase();
  if(!SetupEngine||!/^[A-Z0-9.-]{1,12}$/.test(ticker))return {state:'UNAVAILABLE',reason:'INVALID_IDENTITY'};
  try{
   const key=technicalShard(ticker),shard=await compressedJSON('/quant/data/product/setup-observations-v1/'+key+'.json.gz');
   if(shard?.schemaVersion!==SetupEngine.SHARD_SCHEMA||shard.shard!==key)return {state:'UNAVAILABLE',reason:'INVALID_SETUP_ARTIFACT'};
   const source=shard.instruments?.[ticker];
   if(!source)return {state:'UNAVAILABLE',reason:'NOT_COVERED_BY_SETUP_OBSERVATION'};
   const mapping={mappingVersion:shard.mappingVersion,cascade:{rules:shard.cascade}};
   const observation=SetupEngine.hydrate(source.observation,mapping);
   if(SetupEngine.publicationViolations(observation).length)return {state:'UNAVAILABLE',reason:'PUBLICATION_GATE_VIOLATED'};
   return {state:'AVAILABLE',ticker,engineVersion:shard.engineVersion,mappingVersion:shard.mappingVersion,
    approval:shard.approval,publication:shard.publication,asOf:source.asOf,dataCutoff:source.dataCutoff,
    close:source.close,levels:source.levels,previous:source.previous,
    classification:observation.classification,lifecycle:observation.lifecycle,
    matchedRule:observation.matchedRule,conditions:observation.conditions,
    journey:shard.cascade.filter(rule=>rule.always!==true)};
  }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};}
 }
 /* Dieselbe Regel, andersherum gelesen: nicht 'wo steht dieser Titel',
  * sondern 'welche Titel stehen dort'. Die Liste kommt aus der Zuordnung
  * der Kaskade und nicht aus dem Regelpraedikat allein - das Praedikat
  * einer Regel trifft mehr Titel, als die Regel zuordnet, weil eine
  * hoeher priorisierte Regel sie vorher genommen hat. Wer das Praedikat
  * direkt ausliefert, zeigt beobachtete Titel als 'beobachtet', obwohl
  * sie laengst bestaetigt sind. Ein Zustand, dessen Stufe geschlossen
  * ist, traegt hier keine Liste und keine Null, sondern seinen Grund. */
 async function getSetupScreenIndex(){
  if(!SetupEngine)return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};
  try{
   const index=await compressedJSON('/quant/data/product/setup-observations-v1/screen-index.json.gz');
   if(index?.schemaVersion!==SetupEngine.SCREEN_INDEX_SCHEMA)return {state:'UNAVAILABLE',reason:'INVALID_SETUP_ARTIFACT'};
   if(index.approval?.state!=='APPROVED')return {state:'UNAVAILABLE',reason:'SETUP_MAPPING_NOT_APPROVED'};
   const states=(index.states||[]).filter(entry=>SetupEngine.STATES.includes(entry.state)).map(entry=>({
    state:entry.state,tier:entry.tier,count:entry.count,availability:entry.availability,
    /* NO_SETUP ist der Auffangzustand: er traegt kein Praedikat und
       deshalb keine Liste. Er bleibt als Zahl sichtbar, damit die
       Besetzungen zusammen das Universum ergeben. */
    rules:(entry.rules||[]).map(rule=>({ruleId:rule.ruleId,order:rule.order,screenable:rule.screenable,
     predicateHash:rule.predicateHash,plain:rule.plain,matched:rule.matched,
     tickers:Array.isArray(rule.tickers)?rule.tickers.slice():null}))
   }));
   return {state:'AVAILABLE',asOf:index.asOf,engineVersion:index.engineVersion,
    mappingVersion:index.mappingVersion,methodologyVersion:index.methodologyVersion,
    approval:index.approval,universe:index.universe,classified:index.classified,
    unclassified:index.unclassified,states};
  }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};}
 }
 /* VU Pattern Match. Welche der vorregistrierten Muster dieser Titel
  * heute erfuellt - und was die Muster in der Grundgesamtheit gezeigt
  * haben. Die Zahlen gehoeren dem Muster, nicht dem Titel: sie werden
  * nicht dadurch zu einer Aussage ueber ihn, dass sie neben seinem Namen
  * stehen. Deshalb traegt jede Zeile die Verlustseite und die Asymmetrie
  * neben dem Lift, und der Kopf traegt die Vorbehalte der Studie. */
 async function getPatternMatch(ticker){
  ticker=String(ticker||'').toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return {state:'UNAVAILABLE',reason:'INVALID_IDENTITY'};
  try{
   const key=technicalShard(ticker),shard=await compressedJSON('/quant/data/product/pattern-match-v1/'+key+'.json.gz');
   if(shard?.schemaVersion!=='pattern-match-1.0.0'||shard.shard!==key)return {state:'UNAVAILABLE',reason:'INVALID_PATTERN_MATCH_ARTIFACT'};
   const source=shard.instruments?.[ticker];
   if(!source)return {state:'UNAVAILABLE',reason:'NOT_COVERED_BY_PATTERN_MATCH'};
   const holds=new Set(source.holds),unmeasurable=new Set(source.unmeasurable);
   const rows=shard.findings.map(finding=>{
    const terms=finding.terms.map((term,index)=>({...term,id:(finding.id.split('+')[index]||finding.id)}));
    const ids=finding.id.split('+');
    const state=ids.some(id=>unmeasurable.has(id))?'NOT_MEASURABLE':(ids.every(id=>holds.has(id))?'HOLDS':'DOES_NOT_HOLD');
    return {...finding,terms,state};
   });
   return {state:'AVAILABLE',ticker,asOf:source.asOf,hasFundamentals:source.hasFundamentals,
    horizon:shard.horizon,horizonMonths:shard.horizonMonths,winnerMinReturn:shard.winnerMinReturn,
    lossThreshold:shard.lossThreshold,baseRate:shard.baseRate,caveats:shard.caveats,
    withheld:shard.withheld,studies:shard.studies,
    holds:rows.filter(row=>row.state==='HOLDS'),
    others:rows.filter(row=>row.state!=='HOLDS')};
  }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};}
 }
 async function getFactorEvidence(ticker){
  ticker=String(ticker||'').toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return {state:'UNAVAILABLE',reason:'INVALID_IDENTITY'};
  const i=await identity(ticker);
  if(!i)return {state:'UNAVAILABLE',reason:'NOT_IN_PRODUCT_UNIVERSE'};
  try{
   const key=technicalShard(ticker),shard=await compressedJSON('/quant/data/product/factor-evidence-v1/'+key+'.json.gz');
   if(!FactorEvidence.validShard(shard,key))return {state:'UNAVAILABLE',reason:'INVALID_FACTOR_EVIDENCE_ARTIFACT'};
   const source=shard.securities?.[ticker];
   if(!source)return {state:'UNAVAILABLE',reason:'NOT_COVERED_BY_FACTOR_EVIDENCE'};
   const violations=FactorEvidence.publicationViolations(source);
   if(violations.length)return {state:'UNAVAILABLE',reason:'PUBLICATION_GATE_VIOLATED'};
   const record=FactorEvidence.hydrate(source,shard);
   return {state:'AVAILABLE',ticker,name:i.companyName||ticker,
    methodologyVersion:shard.methodologyVersion,derivedFrom:shard.derivedFrom,
    asOf:record.asOf,dataCutoff:record.dataCutoff,priceBasis:record.priceBasis,
    fundamentalsAsOf:record.fundamentalsAsOf,fundamentalsAvailableAt:record.fundamentalsAvailableAt,
    marketCap:record.marketCap,peer:record.peer,dataQuality:record.dataQuality,
    publication:shard.publication,composite:record.composite,
    factors:FactorEvidence.ordered(record),
    summary:FactorEvidence.summarySentence(record),
    change:ChangeEngine.hydrate(record.change),
    changeHeadline:ChangeEngine.headline(ChangeEngine.hydrate(record.change))};
  }catch{return {state:'UNAVAILABLE',reason:'SOURCE_MISSING'};}
 }
 async function materializedTechnical(ticker,securityId){
  const key=technicalShard(ticker),shard=await compressedJSON('/quant/data/product/technical-signals-v1/'+key+'.json.gz'),source=shard?.instruments?.[ticker];
  if(shard?.schemaVersion!=='technical-product-artifact-1.0.0'||shard.shard!==key||!source||source.schemaVersion!==shard.schemaVersion||source.instrumentId!==ticker||source.securityId!==securityId)throw Error('INVALID_TECHNICAL_PRODUCT_ARTIFACT');
  return source;
 }
 async function technicalSource(ticker,securityId){try{return await materializedTechnical(ticker,securityId);}catch{return load('/quant/data/technical/instruments/'+ticker+'.json');}}
 async function getUniverse(){try{const c=await hydrateFullUniverseFactors(await hydrateCapabilities(await init()));
  const members=Array.isArray(c.capabilities&&c.capabilities.members)?c.capabilities.members:[];
  const stocks=members.map(m=>{const s=broadRow(c,m);if(s&&!permission(c,s.ticker,'raw').allowed)s.price={value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'};return s;}).filter(Boolean);
  return {state:stocks.length?'AVAILABLE':'UNAVAILABLE',stocks,scope:'CANONICAL_PRODUCT_UNIVERSE',
   universeSize:stocks.length,factorReady:stocks.filter(s=>s.factorState==='AVAILABLE').length,
   productCapabilityState:c.productSummary?.schemaVersion==='1.0.0'?'AVAILABLE':'UNAVAILABLE',
   productUniverseSize:c.productSummary?.counts?.productUniverse||stocks.length,capabilityCounts:c.productSummary?.counts||{},
   totalMarketState:'CAPABILITY_PROJECTED',source:'/quant/data/universe/market-capability.json'};
 }catch{return unavailable('SOURCE_MISSING');}}
 async function getMarketIntelligence(){
  const universe=await getUniverse();
  return {version:'1.0.0',state:universe.state,scope:universe.scope,
   marketPulse:{state:'UNAVAILABLE',reason:'NO_APPROVED_FULL_MARKET_VIEW'},
   observations:universe.stocks.map(stock=>({stock,trend:stock.above200.state!=='AVAILABLE'||stock.above50.state!=='AVAILABLE'
    ?{state:'SOURCE_MISSING',label:'Trend derzeit nicht verfügbar'}
    :{state:'AVAILABLE',label:stock.above200.value>0&&stock.above50.value>0?'Über wichtigen Trendbereichen':'Trendbereiche prüfen',
      explanation:'Vergleich des letzten verfügbaren Kurses mit dem 50- und 200-Tage-Durchschnitt. Keine Prognose.',
      evidence:[{label:'Abstand zum 50-Tage-Durchschnitt',metric:stock.above50},{label:'Abstand zum 200-Tage-Durchschnitt',metric:stock.above200}]}}))};
 }
 async function getTechnicalIntelligence(ticker){
  ticker=String(ticker||'').toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await hydrateCapabilities(await init()),canonical=await identity(ticker);if(!canonical)return unavailable('INVALID_IDENTITY');
   const member=(c.capabilities.members||[]).find(m=>m.s===ticker);if(!member||member.t!=='TECHNICAL_READY')return unavailable('TECHNICAL_EVIDENCE_NOT_PUBLISHED');
   const stock=await row(c,ticker)||broadRow(c,member);if(!stock)return unavailable('SOURCE_MISSING');
   function status(value,labels){return labels[value]?{state:'AVAILABLE',code:value,label:labels[value]}:{state:'SOURCE_MISSING',code:null,label:'Nicht verfügbar'};}
   try{if(!permission(c,ticker,'raw').allowed)throw Error('DISPLAY_NOT_PERMITTED');const source=await technicalSource(ticker,member.m),b=source.bundle;
    if(source.instrumentId!==ticker||source.isMock!==false||source.dataMode!=='real'||source.source!=='tiingo'||!b||b.instrumentId!==ticker||!validDate(b.dataCutoff)||b.dataCutoff>new Date().toISOString().slice(0,10)||!b.methodologyVersion) return unavailable('INVALID_TECHNICAL_PROVENANCE');
    return {state:'AVAILABLE',ticker,asOf:b.dataCutoff,methodology:b.methodologyVersion,evidenceLevel:'FULL_WORKSPACE',fullWorkspace:true,
     trend:status(b.trend?.direction,{BULLISH:'Aufwärtstrend',BEARISH:'Abwärtstrend',NEUTRAL:'Keine klare Richtung',SIDEWAYS:'Seitwärts'}),
     momentum:status(b.momentum?.state,{POSITIVE:'Positiv',NEGATIVE:'Negativ',NEUTRAL:'Neutral'}),
     volatility:status(b.volatility?.regime,{NORMAL:'Normal',HIGH:'Erhöht',LOW:'Niedrig',EXTREME:'Sehr hoch'}),
     elliott:status(b.elliott?.status,{OK:'Validierte Zählung',LOW_CONFIDENCE:'Niedriger Method Fit',AMBIGUOUS:'Mehrere mögliche Zählungen',VALID:'Gültige Zählung',INSUFFICIENT_DATA:'Historie reicht nicht aus',NO_VALID_COUNT:'Keine gültige Zählung'}),
     elliottMethodology:b.elliottMethodologyVersion||null,isProbability:false,
     workspace:'/vu2/?view=technical&ticker='+encodeURIComponent(ticker),elliottWorkspace:'/vu2/?view=elliott&ticker='+encodeURIComponent(ticker)};
   }catch{
    const consumer=await consumerFor(ticker),metrics=consumer?.metrics||{};
    const momentum=Number.isFinite(metrics.return6M)?metrics.return6M:stock.momentum6m?.value,volatility=Number.isFinite(metrics.volatility252d)?metrics.volatility252d:stock.volatility?.value,distance=Number.isFinite(metrics.distanceTo52wHigh)?metrics.distanceTo52wHigh:stock.distanceTo52wHigh?.value;
    if(!Number.isFinite(momentum)||!Number.isFinite(volatility))return unavailable('TECHNICAL_EVIDENCE_NOT_PUBLISHED');
    return {state:'AVAILABLE',ticker,asOf:consumer?.asOf||stock.asOf,methodology:'market-factors-1.0.0',evidenceLevel:'REDUCED_EVIDENCE',fullWorkspace:false,
     trend:{state:Number.isFinite(distance)?'AVAILABLE':'SOURCE_MISSING',code:null,label:Number.isFinite(distance)?(distance>=-0.1?'Nahe am 52-Wochen-Hoch':'Unter dem 52-Wochen-Hoch'):'Nicht verfügbar'},
     momentum:{state:'AVAILABLE',code:momentum>=0?'POSITIVE':'NEGATIVE',label:momentum>=0?'6M positiv':'6M negativ'},
     volatility:{state:'AVAILABLE',code:'MEASURED',label:(volatility*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %'},
     elliott:{state:'UNAVAILABLE',code:null,label:'Kein publiziertes Elliott-Bundle'},elliottMethodology:null,isProbability:false};
   }
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getStockIntelligence(ticker){ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await hydrateCapabilities(await init()),canonical=await identity(ticker);if(!canonical)return unavailable('INVALID_IDENTITY');
   const member=(c.capabilities.members||[]).find(m=>m.s===ticker);if(!member)return identityOnlyStock(ticker);
   const panelCandidate=c.panel?.securities?.[ticker];if(panelCandidate&&panelCandidate.securityId!=='sec_'+ticker)return unavailable('INVALID_IDENTITY');
   let stock=await row(c,ticker)||broadRow(c,member);if(!stock)return identityOnlyStock(ticker);
   const consumer=await consumerFor(ticker);if(consumer)stock=applyConsumer(stock,consumer);if(!permission(c,ticker,'raw').allowed)stock.price={value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'};
   try{const p=await load('/quant/data/market/golden-preview/daily/'+stock.masterMemberId+'.json');
    if(p.securityId!==stock.masterMemberId||p.provider!=='tiingo'||p.isMock===true||p.dataMode==='mock'||!p.publishBasis||!Array.isArray(p.bars))throw Error('identity');
    const bars=p.bars.filter(b=>validDate(b.date)&&b.date<=new Date().toISOString().slice(0,10));
    stock.chart={state:bars.length?'AVAILABLE':'SOURCE_MISSING',bars,adjustmentStatus:p.adjustmentStatus};
   }catch{const history=await getHistoricalPriceHistory(ticker);stock.chart=history.state==='AVAILABLE'?history:{state:'UNAVAILABLE',bars:[],reason:history.reason||'HISTORY_NOT_PUBLISHED'};}
   stock._factorValues=(c.factorIndex&&c.factorIndex[member.m]||{}).values||{};stock.quant=await getQuantWorkspace(ticker);stock.setupState=await setupFor(stock);stock.health=await marketHealth([stock]);return stock;
   }catch{const known=await identityOnlyStock(ticker,'SOURCE_MISSING');return known.identityState==='AVAILABLE'?known:unavailable('SOURCE_MISSING');}}
 async function getSignals({lookback=20}={}){
  if(![5,20,60].includes(lookback))return {state:'UNAVAILABLE',events:[],results:[],reason:'INVALID_SIGNAL_WINDOW'};
  try{const c=await hydrateCapabilities(await init());
   try{const artifact=await compressedJSON('/quant/data/product/technical-signals-v1/signals-'+lookback+'.json.gz');
    if(artifact?.schemaVersion!=='market-signals-product-1.0.0'||artifact.lookback!==lookback||artifact.scope!=='CANONICAL_PRODUCT_UNIVERSE'||!Array.isArray(artifact.results)||!Array.isArray(artifact.events))throw Error('INVALID_SIGNAL_PRODUCT_ARTIFACT');
    const members=new Set((c.capabilities.members||[]).map(m=>m.s)),results=artifact.results.filter(r=>members.has(r.ticker)&&permission(c,r.ticker).allowed);
    if(results.length!==artifact.results.length||artifact.events.some(e=>!members.has(e.ticker)))throw Error('INVALID_SIGNAL_PRODUCT_SCOPE');
    const available=results.filter(r=>r.state==='AVAILABLE'),events=artifact.events.filter(e=>permission(c,e.ticker).allowed);
    return {state:available.length?'AVAILABLE':'UNAVAILABLE',partial:available.length!==results.length,results,events,coverage:artifact.counts||{requested:results.length,available:available.length,unavailable:results.length-available.length},scope:'CANONICAL_PRODUCT_UNIVERSE',materializedAt:artifact.generatedAt};
   }catch{}
   const calendar=await load('/quant/config/market-calendar.json'),results=await Promise.all((c.preview.scope||[]).map(async ticker=>{
   if(!permission(c,ticker,'raw').allowed||!permission(c,ticker).allowed)return {ticker,state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED',events:[]};
   try{const stock=await row(c,ticker);if(!stock)return {ticker,state:'UNAVAILABLE',reason:'INVALID_IDENTITY',events:[]};return {ticker,...MarketSignals.build(await load('/quant/data/market/golden-preview/daily/'+stock.masterMemberId+'.json'),{ticker,recipes:getRecipes(),lookback,calendar})};}catch{return {ticker,state:'UNAVAILABLE',reason:'SOURCE_MISSING',events:[]};}
  }));const available=results.filter(r=>r.state==='AVAILABLE');return {state:available.length?'AVAILABLE':'UNAVAILABLE',partial:available.length!==results.length,results,events:available.flatMap(r=>r.events).sort((a,b)=>b.asOf.localeCompare(a.asOf)||a.ticker.localeCompare(b.ticker)),scope:'APPROVED_DISPLAY_SET'};
  }catch{return {state:'UNAVAILABLE',events:[],results:[],reason:'SOURCE_MISSING'};}
 }
 function radarModules(events,limit){
  const definitions=[
   ['momentum-entered','positive-momentum','ENTERED','Momentum wieder nicht negativ','Neue belegte Wechsel in eine nicht negative Sechs-Monats-Entwicklung.'],
   ['trend-entered','above-long-trend','ENTERED','Langfristigen Trendbereich zurückgewonnen','Neue belegte Wechsel an oder über den 200-Tage-Durchschnitt.'],
   ['momentum-exited','positive-momentum','EXITED','Momentum unter null gefallen','Neue belegte Wechsel in eine negative Sechs-Monats-Entwicklung.'],
   ['trend-exited','above-long-trend','EXITED','Langfristigen Trendbereich verlassen','Neue belegte Wechsel unter den 200-Tage-Durchschnitt.']
  ];
  return definitions.map(([id,definitionId,transition,title,description])=>{const seen=new Set(),items=[];for(const event of events){if(event.definitionId!==definitionId||event.transition!==transition||seen.has(event.ticker))continue;seen.add(event.ticker);items.push(event);if(items.length===limit)break;}return {id,title,description,definitionId,transition,items};});
 }
 async function getRadarIntelligence({lookback=20,limit=12}={}){
  if(![5,20,60].includes(lookback)||!Number.isInteger(limit)||limit<1||limit>50)return {state:'UNAVAILABLE',reason:'INVALID_RADAR_SELECTION',modules:[]};
  const signals=await getSignals({lookback});if(signals.state!=='AVAILABLE')return {state:'UNAVAILABLE',reason:signals.reason||'SIGNAL_EVIDENCE_NOT_PUBLISHED',modules:[],coverage:signals.coverage||null};
  return {state:'AVAILABLE',version:'1.0.0',scope:signals.scope,lookback,coverage:signals.coverage,materializedAt:signals.materializedAt||null,eventCount:signals.events.length,eventTickerCount:new Set(signals.events.map(e=>e.ticker)).size,modules:radarModules(signals.events,limit),quantScore:{state:'UNAVAILABLE',reason:'QUANT_V2_NOT_ACTIVE'},marketRegime:{state:'UNAVAILABLE',reason:'MARKET_REGIME_NOT_CERTIFIED'}};
 }
 async function getComparison(tickers){let selected;try{selected=CompareWorkspace.validate(tickers);}catch{return {state:'UNAVAILABLE',reason:'INVALID_COMPARISON',companies:[],families:[]};}return CompareWorkspace.build(selected,await Promise.all(selected.map(async ticker=>{const model=await getQuantWorkspace(ticker);return model.state==='AVAILABLE'?model:{...model,ticker};})));}
 async function getMarketDataHealth(ticker){if(ticker!==undefined)ticker=String(ticker||'').toUpperCase();const data=await getUniverse();return marketHealth(ticker===undefined?data.stocks:data.stocks.filter(s=>s.ticker===ticker));}
 async function marketHealth(stocks){try{const calendar=await load('/quant/config/market-calendar.json');return MarketHealth.build(stocks,calendar);}catch{return MarketHealth.build(stocks,null);}}
 async function getMarketSession({now}={}){try{const calendar=await load('/quant/config/market-calendar.json');return MarketSession.build(calendar,now===undefined?new Date().toISOString():now);}catch{return MarketSession.build(null,now);}}
 async function getHomeIntelligence(tickers=[]){const [watchlist,session]=await Promise.all([tickers.length?getWatchlistIntelligence(tickers):WatchlistWorkspace.build([],null),getMarketSession()]);let market={state:'UNAVAILABLE',scope:'FEATURED_FULL_INTELLIGENCE_SET',observations:[]};try{const c=await init(),stocks=(await Promise.all((c.preview.scope||[]).map(ticker=>row(c,ticker)))).filter(Boolean);market={state:stocks.length?'AVAILABLE':'UNAVAILABLE',scope:'FEATURED_FULL_INTELLIGENCE_SET',observations:stocks.map(stock=>({stock,trend:stock.above200.state!=='AVAILABLE'||stock.above50.state!=='AVAILABLE'?{state:'SOURCE_MISSING',label:'Trend derzeit nicht verfügbar'}:{state:'AVAILABLE',label:stock.above200.value>0&&stock.above50.value>0?'Über wichtigen Trendbereichen':'Trendbereiche prüfen',explanation:'Vergleich des letzten verfügbaren Kurses mit dem 50- und 200-Tage-Durchschnitt. Keine Prognose.',evidence:[{label:'Abstand zum 50-Tage-Durchschnitt',metric:stock.above50},{label:'Abstand zum 200-Tage-Durchschnitt',metric:stock.above200}]}}))};}catch{}return {version:'1.0.0',state:market.state,scope:market.scope,market,watchlist,session,health:await marketHealth(market.observations.map(o=>o.stock)),dataMode:'LATEST_AVAILABLE_EOD',isLive:false};}
 async function getWatchlistIntelligence(tickers){
  let selected;try{selected=WatchlistWorkspace.validate(tickers);}catch{return {state:'UNAVAILABLE',reason:'INVALID_WATCHLIST',members:[]};}
  if(!selected.length)return WatchlistWorkspace.build([],null);
  const [universe,signals,summary]=await Promise.all([getUniverse(),getSignals({lookback:60}),load('/quant/data/product/technical-signals-v1/summary.json').catch(()=>null)]);
  try{const c=await init(),signalIndex=new Map((signals.results||[]).map(result=>[result.ticker,result])),technical=await Promise.all(selected.map(ticker=>getTechnicalWorkspace(ticker))),capabilities={};
   selected.forEach((ticker,index)=>{const signal=signalIndex.get(ticker),workspace=technical[index],elliottAvailable=workspace?.state==='AVAILABLE'&&!['UNAVAILABLE','INSUFFICIENT_DATA'].includes(workspace.elliott?.status);capabilities[ticker]={
    signals:signal?{state:signal.state,reason:signal.reason||null,asOf:signal.asOf||null,from:signal.from||null,lookback:signal.lookback||60,events:Array.isArray(signal.events)?signal.events:[]}:{state:'UNAVAILABLE',reason:'SIGNAL_EVIDENCE_NOT_PUBLISHED',events:[]},
    technical:workspace?.state==='AVAILABLE'?{state:'AVAILABLE',asOf:workspace.asOf,methodology:workspace.methodology,workspace:'/vu2/?view=technical&ticker='+encodeURIComponent(ticker)}:{state:'UNAVAILABLE',reason:workspace?.reason||'TECHNICAL_BUNDLE_NOT_PUBLISHED'},
    elliott:elliottAvailable?{state:'AVAILABLE',status:workspace.elliott.status,workspace:'/vu2/?view=elliott&ticker='+encodeURIComponent(ticker)}:{state:'UNAVAILABLE',reason:workspace?.state==='AVAILABLE'?'ELLIOTT_COUNT_NOT_VALIDATED':workspace?.reason||'ELLIOTT_BUNDLE_NOT_PUBLISHED'}
   };});
   const coverage={selectable:universe.productUniverseSize||universe.stocks.length,signalsCapable:signals.coverage?.available||0,technicalCapable:summary?.counts?.technicalFullBundles||0,elliottCapable:summary?.counts?.elliottCapable||0};
   return WatchlistWorkspace.build(selected,{...universe,stocks:universe.stocks.map(stock=>permission(c,stock.ticker,'raw').allowed?stock:{...stock,price:{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'}})},{capabilities,coverage});
  }catch{return WatchlistWorkspace.build(selected,universe);}
 }
 async function getPortfolioIntelligence(positions){try{const universe=await getUniverse(),c=await init();return PortfolioWorkspace.build(positions,{...universe,stocks:universe.stocks.map(stock=>permission(c,stock.ticker,'raw').allowed?stock:{...stock,marketState:'UNAVAILABLE'})});}catch{return unavailable('INVALID_PORTFOLIO');}}
 async function getStrategyContext(){
  try{const [quant,backtest,quantV2,universe]=await Promise.all([load('/quant/methodology/quant-v1.json'),load('/quant/methodology/backtest-v1.json'),load('/quant/methodology/quant-v2.json'),getUniverse()]);
   if(quantV2?.methodologyVersion!=='quant-v2.0.0'||quantV2.status!=='SPECIFIED_NOT_ACTIVE'||quantV2.publication?.allowed!==false)throw Error('INVALID_QUANT_V2_GATE');
   Methodology.configure({quant,backtest,quantV2});return {state:'AVAILABLE',definition:Strategy.defaults(),factors:Strategy.RANKABLE_FACTORS,weightings:Strategy.WEIGHTINGS,
    currentSelection:{state:universe.state,scope:universe.scope,selectable:universe.productUniverseSize||universe.stocks.length,filterEngine:'CANONICAL_QUERY_ENGINE',ranking:{state:'UNAVAILABLE',reason:'QUANT_V2_NOT_ACTIVE'}},
    quantV2:{methodologyVersion:quantV2.methodologyVersion,status:quantV2.status,publicationAllowed:false,factorOrder:quantV2.factorOrder.slice(),factorReadiness:Object.fromEntries(quantV2.factorOrder.map(id=>[id,quantV2.factors[id].readiness]))},
    rebalance:backtest.rebalance.allowed,timings:backtest.execution.allowedTimings,costs:backtest.costs,constraints:backtest.constraints,
    methodology:backtest.methodologyVersion,backtest:{state:'UNAVAILABLE',reason:'REAL_BACKTEST_GATE_NOT_VALIDATED',
     /* Gemessen statt behauptet. Ein Nutzer, dem nur 'nicht validiert'
      * gesagt wird, kann nicht einschätzen, ob das eine Formalie oder ein
      * echtes Hindernis ist - und die beiden mittleren Punkte sind echte
      * Hindernisse, die sich am 2026-09-23 genau beziffern ließen. */
     checks:[['Historische Fundamentaldaten','Die veröffentlichten Faktorwerte beschreiben den heutigen Stand. Für einen Backtest müsste zu jedem vergangenen Stichtag bekannt sein, was damals schon veröffentlicht war — sonst fließt Wissen aus der Zukunft in eine Aussage über die Vergangenheit.'],['Historisches Universum','Von jedem Index liegt genau eine Mitgliedschafts-Momentaufnahme vor (15.09.2026). Ein Backtest darauf würde die heutigen Mitglieder auf die gesamte Vergangenheit anwenden und alle seither ausgeschiedenen Titel weglassen — das Ergebnis sähe dadurch systematisch besser aus, als es war.'],['Kapitalmaßnahmen','Die Kursreihen sind splitbereinigt, tragen aber keine Ausschüttungen. Eine Gesamtrendite lässt sich daraus nicht bilden, und gerade bei Dividendentiteln fehlt damit ein wesentlicher Teil des Ergebnisses.'],['Vergleichsindex','Veröffentlicht sind Kursreihen einzelner Aktien, keine Indexstände. Ohne eine Vergleichsreihe auf demselben Kalender und derselben Kursbasis lässt sich nicht sagen, ob ein Ergebnis besser war als der Markt oder nur so gut.'],['Ausführung & Reproduktion','Die Kostenannahmen sind definiert, aber ein geprüfter historischer Lauf liegt nicht vor. Erst er zeigt, ob dieselben Regeln zweimal dasselbe Ergebnis liefern.']]}};
  }catch{return unavailable('STRATEGY_METHODOLOGY_MISSING');}
 }
 async function getQuantWorkspace(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await hydrateCapabilities(await init());const stock=await row(c,ticker);if(stock)return QuantWorkspace.build(stock,{...c.panel.securities[ticker],securityId:stock.securityId},c.panel.versions);
   const member=(c.capabilities.members||[]).find(m=>m.s===ticker);if(!member)return unavailable('INVALID_IDENTITY');let broad=broadRow(c,member);if(!broad)return unavailable('SOURCE_MISSING');const consumer=await consumerFor(ticker);if(consumer)broad=applyConsumer(broad,consumer);broad._factorValues=(c.factorIndex&&c.factorIndex[member.m]||{}).values||{};const model=broadQuantWorkspace(broad);if(!permission(c,ticker).allowed)for(const family of model.families.filter(f=>['value','momentum','risk'].includes(f.id)))for(const item of family.metrics){item.value=null;item.state='UNAVAILABLE';item.reason='DISPLAY_NOT_PERMITTED';}return model;
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getTechnicalWorkspace(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await hydrateCapabilities(await init());const member=(c.capabilities.members||[]).find(m=>m.s===ticker);if(!member||member.t!=='TECHNICAL_READY')return unavailable('TECHNICAL_BUNDLE_NOT_PUBLISHED');
   if(!permission(c,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const source=await technicalSource(ticker,member.m);
   if(source.source!=='tiingo')return unavailable('UNSUPPORTED_MARKET_SOURCE');
   return TechnicalWorkspace.build(source,{ticker});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getHistoricalFundamentals(ticker,selection={}){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const c=await hydrateCapabilities(await init()),member=(c.capabilities.members||[]).find(m=>m.s===ticker);if(!member||member.fr!==true)return unavailable('FUNDAMENTALS_NOT_PUBLISHED');
   if(selection.period==='quarterly'){
    if(!/^\d{10}$/.test(instrument.cik))return unavailable('FUNDAMENTAL_IDENTITY_UNAVAILABLE');
     const shard=instrument.cik.slice(-2),bucket=await compressedJSON('/quant/data/sec/quarterly/'+shard+'.json.gz');
     if(bucket?.schema!=='vu-quant-quarterly-shard-1.0.0'||bucket.shard!==shard)return unavailable('INVALID_QUARTERLY_SHARD');
     const projected=bucket.issuers?.[instrument.cik];if(!projected)return unavailable('SOURCE_MISSING');
     return History.buildQuarterly(projected,{...identityModel(instrument),cik:instrument.cik,metric:selection.metric,period:'quarterly'});
   }
   const consumer=await consumerFor(ticker);if(consumer){const projected=History.buildConsumer(consumer,{...identityModel(instrument),cik:instrument.cik,metric:selection.metric,period:selection.period});if(projected.state==='AVAILABLE'||projected.reason!=='PERIOD_NOT_IN_CONSUMER_ARTIFACT')return projected;}
   const index=await load('/quant/data/sec/inspector_index.json'),entry=index.companies?.find(s=>s.ticker===ticker);if(!entry?.cik||entry.cik!==instrument.cik)return unavailable('SOURCE_MISSING');
   return History.build(await load('/quant/data/sec/inspector/'+ticker+'.json'),{ticker,cik:instrument.cik,metric:selection.metric,period:selection.period});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 // Artifact paths are resolved from canonical identity, never a free-form URL.
 async function publicPermission(ticker,dataClass='marketData',form='raw'){
  const c=await config();return policy.check({providerId:'tiingo',dataClass,audience:'public',form,ticker,gates:c.gates}).allowed;
 }
 async function getHistoricalPriceHistory(ticker,selection={}){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  if(selection.columns&&selection.columns!=='close')return unavailable('OHLCV_NOT_IN_SERIES_ARTIFACT');
  if((selection.from&&!validDate(selection.from))||(selection.to&&!validDate(selection.to))||(selection.from&&selection.to&&selection.from>selection.to))return unavailable('INVALID_SELECTION');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   if(!/^[A-Za-z0-9_-]+$/.test(instrument.masterMemberId))return unavailable('INVALID_IDENTITY');
   const long=selection.range==='MAX'||selection.grain==='weekly';
   const path='/quant/data/market/discover-series'+(long?'-long':'')+'/'+instrument.masterMemberId+'.json';
   const source=await load(path),today=new Date().toISOString().slice(0,10);
   if(source.schemaVersion!==(long?'discover-series-long-1.0.0':'discover-series-1.1.0')||source.securityId!==instrument.masterMemberId||source.ticker!==ticker||source.dataMode!=='real'||source.source!=='tiingo'||source.provider!=='tiingo'||source.status!=='CALCULATED'||source.priceSeriesType!=='SPLIT_ADJUSTED'||source.grain!==(long?'weekly':'daily')||!source.publishBasis||!validDate(source.asOf)||source.asOf>today||!source.currency||!Array.isArray(source.points))return unavailable('INVALID_HISTORY_CONTRACT');
   let previous='';
   for(const point of source.points){if(!Array.isArray(point)||point.length!==2||!validDate(point[0])||point[0]<=previous||point[0]>source.asOf||!Number.isFinite(point[1])||point[1]<=0)return unavailable('INVALID_HISTORY_POINTS');previous=point[0];}
   const bars=source.points.filter(([date])=>(!selection.from||date>=selection.from)&&(!selection.to||date<=selection.to)).map(([date,close])=>({date,close}));
   return {state:bars.length?'AVAILABLE':'INSUFFICIENT_HISTORY',identity:identityModel(instrument),bars,grain:source.grain,currency:source.currency,asOf:source.asOf,adjustmentStatus:source.priceSeriesType,sourcePath:path,availableFrom:source.from,availableTo:source.to,columns:['close'],pitEligibility:'NOT_CERTIFIED',fullDailyHistory:false};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getIntraday(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const index=await load('/quant/data/market/intraday/index.json');
   if(index.schemaVersion!=='intraday-index-1.1.0')return unavailable('INVALID_INTRADAY_INDEX');
   const today=new Date().toISOString().slice(0,10);
   const session=Object.keys(index.available||{}).filter(date=>validDate(date)&&date<=today&&Array.isArray(index.available[date])&&index.available[date].includes(ticker)).sort().at(-1);
   if(!session)return {state:'INTRADAY_UNAVAILABLE',identity:identityModel(instrument),reason:'NO_PUBLISHED_SNAPSHOT'};
   if(!/^[A-Za-z0-9_-]+$/.test(instrument.masterMemberId))return unavailable('INVALID_IDENTITY');
   const path='/quant/data/market/intraday/'+session+'/'+instrument.masterMemberId+'.json',snapshot=await load(path);
   if(snapshot.securityId!==instrument.masterMemberId||snapshot.symbol!==ticker||snapshot.sessionDate!==session||snapshot.publishable!==true||!IntradaySnapshot?.validate(snapshot).ok||!Number.isFinite(Date.parse(snapshot.asOf))||Date.parse(snapshot.asOf)>Date.now())return unavailable('INVALID_INTRADAY_CONTRACT');
   return {state:'INTRADAY_AVAILABLE',identity:identityModel(instrument),snapshot,points:snapshot.points,asOf:snapshot.asOf,sessionDate:session,isLive:false,isDelayed:snapshot.isDelayed,priceSemantics:'UNSPECIFIED',sourcePath:path};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getRealtimeCapability(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const c=await config(),stream=c.preview.stream;
   if(!stream?.enabled||!await publicPermission(ticker,'realtime','realtime'))return unavailable('DISPLAY_NOT_PERMITTED');
   if(stream.url!=='wss://live.visionuniverse.de/live')return unavailable('UNSUPPORTED_RELAY');
   return {state:'AVAILABLE',identity:identityModel(instrument),transport:'VISION_UNIVERSE_RELAY',url:stream.url,onDemand:true,connectionState:'NOT_CONNECTED',priceSemantics:'UNSPECIFIED',chartMovement:'TRADE_EVENTS_ONLY'};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 function getRecipes(){return [
  {id:'positive-momentum',title:'Kursstärke entdecken',explanation:'Unternehmen mit nicht negativer Kursentwicklung über sechs Monate.',field:'momentum6m',threshold:0,rule:'Kursentwicklung über 6 Monate ≥ 0 %'},
  {id:'growing-business',title:'Wachsendes Geschäft',explanation:'Unternehmen, deren ausgewiesenes Umsatzwachstum mindestens 20 Prozent beträgt.',field:'revenueGrowth',threshold:20,rule:'Umsatzwachstum ≥ 20 %'},
  {id:'above-long-trend',title:'Über dem langfristigen Trend',explanation:'Unternehmen, deren Kurs auf oder über dem 200-Tage-Durchschnitt liegt.',field:'priceTo200dma',threshold:0,rule:'Abstand zum 200-Tage-Durchschnitt ≥ 0 %'}
 ].map(recipe=>{const query=queryEngine.createQuery({filters:[{field:recipe.field,operator:'gte',value:recipe.threshold,scale:'raw'}],sort:[{field:recipe.field,direction:'desc'}],limit:50});const predicate=Rules.fromQuery(query);return {...recipe,version:'1.0.0',query,predicate,predicateHash:Rules.predicateHash(predicate)};});}
 async function getDiscover(){const collections=await Promise.all(getRecipes().map(async recipe=>({...recipe,result:await screen(recipe.query)})));return {collections,scope:'APPROVED_DISPLAY_SET'};}
 /* Eine Abfrage gehoert genau einer Methodik. Welche Zeilen sie sieht,
  * entscheidet deshalb die Methodik und nicht der Aufrufer: Quant V2 liest
  * die Faktorevidenz-Tabelle, alles andere das bestehende Produktuniversum.
  * Gemischte Abfragen kommen hier nicht an - der Screener-Vertrag weist sie
  * schon beim Bauen ab. */
 async function screenFactorEvidence(query){
  const [screening,universe]=await Promise.all([getFactorEvidenceScreening(),getUniverse()]);
  if(screening.state!=='AVAILABLE')return unavailable(screening.reason||'EVIDENCE_UNAVAILABLE');
  if(universe.state!=='AVAILABLE')return universe;
  /* Der Handelsstatus gehoert dem Company Master, nicht dieser Tabelle.
   * Die Evidenzzeile erbt ihn deshalb aus dem kanonischen Universum, und
   * ein Titel ohne kanonische Bestaetigung erscheint gar nicht - die
   * Query Engine wuerde ihn sonst still als inaktiv herausfiltern. */
  const byTicker=new Map((universe.stocks||[]).map(stock=>[stock.ticker,stock]));
  const rows=screening.rows.filter(row=>byTicker.has(row.ticker)).map(row=>({...row,status:'active'}));
  const result=queryEngine.execute(query,rows);
  return {state:'AVAILABLE',query:result.query,queryHash:result.queryHash,
   scope:'CANONICAL_PRODUCT_UNIVERSE',methodologyVersion:screening.methodologyVersion,
   namespace:screening.namespace,asOf:screening.asOf,publication:screening.publication,
   eligible:rows.length,
   stocks:result.rows.map(row=>({...(byTicker.get(row.ticker)||{ticker:row.ticker,name:row.ticker}),evidence:row}))};
 }
 async function screen(query){try{
  const routed=typeof g.VUScreenerWorkspace!=='undefined'||typeof module!=='undefined'
   ? (options.screenerWorkspace||(typeof module!=='undefined'&&module.exports?require('./screener-workspace.js'):g.VUScreenerWorkspace))
   : null;
  const chosen=routed&&typeof routed.methodologyOf==='function'?routed.methodologyOf(query):null;
  if(chosen&&chosen.source==='FACTOR_EVIDENCE_SCREENING')return await screenFactorEvidence(query);
  const c=await init();const universe=await getUniverse();if(universe.state!=='AVAILABLE')return universe;
  if(!queryEngine.validate(query).valid)return unavailable('INVALID_SCREEN_RULES');
  const usesPrice=query.filters.some(f=>f.field==='price')||query.sort.some(s=>s.field==='price');
  if(usesPrice&&universe.stocks.some(s=>!permission(c,s.ticker,'raw').allowed))return unavailable('PRICE_DISPLAY_NOT_PERMITTED');
  const rows=universe.stocks.map(s=>({
   ticker:s.ticker,securityId:s.securityId,status:'active',
   price:s.price.value,
   momentum6m:s.momentum6m.value,momentum12m:s.momentum12m.value,
   priceTo200dma:s.priceTo200dma.value,priceTo50dma:s.priceTo50dma.value,
   distanceTo52wHigh:s.distanceTo52wHigh.value,volatility:s.volatility.value,drawdown:s.drawdown.value,
   revenueGrowth:s.revenueGrowth.value,operatingMargin:s.operatingMargin.value,
   fcfMargin:s.fcfMargin.value,roic:s.roic.value,
   capabilities:s.capabilities,factorState:s.factorState
  }));
  const result=queryEngine.execute(query,rows);
  return {state:'AVAILABLE',query:result.query,queryHash:result.queryHash,scope:universe.scope,
   eligible:rows.length,stocks:result.rows.map(r=>universe.stocks.find(s=>s.ticker===r.ticker))};
 }catch{return unavailable('SOURCE_OR_QUERY_UNAVAILABLE');}}
 return {searchInstruments,getMarketDataHealth,getComparison,getHomeIntelligence,getMarketSession,getWatchlistIntelligence,getSignals,getRadarIntelligence,getPortfolioIntelligence,getStrategyContext,getQuantWorkspace,getTechnicalWorkspace,getHistoricalFundamentals,getHistoricalPriceHistory,getIntraday,getRealtimeCapability,getUniverse,getMarketIntelligence,getTechnicalIntelligence,getStockIntelligence,getFactorEvidence,getFactorEvidenceScreening,getSetupObservation,getSetupScreenIndex,getPatternMatch,getStrategyProfiles,getStrategyMatch,getRecipes,getDiscover,screen,workspaces};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUProductServices=api;
})(typeof window!=='undefined'?window:globalThis);
