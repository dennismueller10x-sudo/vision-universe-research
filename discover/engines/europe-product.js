/* Discover projection of the provider-independent Core Europe contract.
 * Explicit opt-in only; no provider URLs, storage paths or metric calculations.
 */
(function (root, factory) {
  'use strict';
  const Contract = typeof module === 'object' && module.exports ? require('./contract.js') : root.VUDiscover.Contract;
  const api = factory(Contract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUDiscover = root.VUDiscover || {};
  root.VUDiscover.EuropeProduct = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract) {
  'use strict';
  const VERSION = 'discover-europe-product-1.0.0';
  function unavailable(reason) { return {state:'UNAVAILABLE',reason,source:'VU_CANONICAL_EUROPE',asOf:null,data:null}; }
  function available(data, asOf) { return {state:'AVAILABLE',reason:null,source:'VU_CANONICAL_EUROPE',asOf:asOf || null,data}; }
  function href(id) { return '#/s/EUROPE/' + encodeURIComponent(id); }
  function basisLabel(basis) { return basis === 'CANONICAL_SPLIT_ADJUSTED' ? 'split-bereinigt · kanonisch geprüft' : 'unbereinigt · Anpassungsbasis nicht bestätigt'; }
  function create(options) {
    const opts=options || {}, client=opts.client, watch=opts.watchlist;
    if (!client || ['getSecurity','getReadiness','getPriceSeries','getLatestPrice','search'].some(name=>typeof client[name]!=='function')) throw Error('EUROPE_CORE_CONTRACT_REQUIRED');
    if (!watch || ['add','save','reload','remove','values'].some(name=>typeof watch[name]!=='function')) throw Error('EUROPE_CANONICAL_WATCHLIST_REQUIRED');
    if (!Array.isArray(opts.securityRefs)) throw Error('EUROPE_CANONICAL_REFERENCES_REQUIRED');
    const refs=new Map();
    opts.securityRefs.forEach(value=>{
      const id=typeof value==='string'?value:value && value.securityId;
      if(typeof id!=='string' || !id || refs.has(id) || (typeof value==='object' && value.region && value.region!=='EUROPE')) throw Error('INVALID_EUROPE_CANONICAL_REFERENCE');
      refs.set(id,{region:'EUROPE',securityId:id});
    });
    async function permission(id, tier) {
      const ref=refs.get(id);
      if(!ref)return {error:unavailable('CANONICAL_ID_NOT_ACCEPTED')};
      const state=await client.getReadiness(ref);
      // Also protects an accidentally injected research client: data readiness
      // alone never authorizes public Discover display.
      if(state.state!=='AVAILABLE' || !Number.isInteger(state.data.publicTier) || state.data.publicTier<tier)
        return {error:unavailable('DISPLAY_RIGHTS_OR_PRODUCT_GATE_CLOSED')};
      return {ref,readiness:state.data};
    }
    async function identity(id) {
      const p=await permission(id,1);
      if(p.error)return p.error;
      const result=await client.getSecurity(p.ref);
      if(result.state!=='AVAILABLE' || result.data.securityId!==id || result.data.region!=='EUROPE')return unavailable('EUROPE_IDENTITY_CONTRACT_MISMATCH');
      let logo=null;
      if(typeof client.getLogo==='function'){
        const result=await client.getLogo(p.ref);
        if(result.state==='AVAILABLE' && result.data.status==='LOGO_VALID')logo=result.data.key || null;
      }
      return available({identity:result.data,readiness:p.readiness,logoKey:logo});
    }
    function projection(data) {
      const i=data.identity, stock=Contract.normalizeStock({symbol:i.ticker,securityId:i.securityId,instrumentId:i.instrumentId,
        companyName:i.name,universeId:'EUROPE',dataMode:'real',currency:i.currency,exchange:i.exchange || i.mic,
        price:null,changePercent:null});
      return Object.assign(stock,{region:'EUROPE',companyId:i.companyId,listingId:i.listingId,country:i.country,
        isin:i.isin,europeRef:refs.get(i.securityId),href:href(i.securityId),logoKey:data.logoKey,
        universeLabel:'Europäische Aktien',scores:{leadership:null,momentum:null,relativeStrength:null,breakout:null},ranks:{},
        fundamentals:{available:false,message:'Für diesen Titel liegen noch keine geprüften offiziellen Geschäftszahlen vor.'},technicalIntelligence:{layers:{}},why:[],indexMemberships:[],
        readiness:data.readiness,discoveryEligible:data.readiness.DISCOVER==='READY',
        series:{source:null,message:'Für diesen Titel ist noch keine Chart-Freigabe verfügbar.'},
        disclaimer:'Informationen zur eigenen Recherche. Keine Anlageempfehlung.'});
    }
    async function search(query) {
      // Preflight before the underlying search: closed rights must not load
      // an index even when the supplied Core is configured for private research.
      let open=false;
      for(const id of refs.keys()){if(!(await permission(id,1)).error){open=true;break;}}
      if(!open)return unavailable('DISPLAY_RIGHTS_OR_PRODUCT_GATE_CLOSED');
      const result=await client.search(query,{limit:100});
      if(result.state!=='AVAILABLE')return result;
      const entries=[],seen=new Set();
      for(const hit of result.data.results || []){
        if(seen.has(hit.securityId))continue;
        const p=await permission(hit.securityId,1);
        if(p.error)continue;
        seen.add(hit.securityId);
        // s remains the canonical route identity; displaySymbol is only text.
        entries.push({s:hit.securityId,n:hit.name,displaySymbol:hit.ticker,m:true,a:hit.mic,sec:null,
          r:null,d:null,h:false,w:null,region:'EUROPE',href:href(hit.securityId),logoKey:null});
      }
      const q=String(query || '').trim().toUpperCase();
      entries.sort((a,b)=>Number(b.displaySymbol===q)-Number(a.displaySymbol===q));
      return available({universeId:'EUROPE',universeLabel:'Europäische Aktien',entries:entries.slice(0,14)});
    }
    async function detail(id) {
      const found=await identity(id);
      if(found.state!=='AVAILABLE')return found;
      const stock=projection(found.data),r=found.data.readiness;
      if(r.publicTier>=2){
        const price=await client.getLatestPrice(refs.get(id));
        if(price.state==='AVAILABLE'){
          stock.price=Contract.field(price.data.close);
          stock.changePercent=Contract.field(price.data.changePercent);
          stock.asOf=price.data.date;
          stock.priceBasis=price.data.basis;
          stock.basisLabel=basisLabel(price.data.basis);
          stock.freshness=price.data.freshness;
          stock.provenance=price.data.provenance;
          stock.series={source:'vu-core-europe',ref:refs.get(id),priceSeriesType:price.data.basis};
        } else stock.series.message='Die geprüfte Kursreihe ist derzeit nicht verfügbar.';
      }
      return available(stock,stock.asOf);
    }
    async function series(ref, seriesOptions) {
      if(!ref || ref.region!=='EUROPE')return unavailable('EUROPE_CANONICAL_REFERENCE_REQUIRED');
      const p=await permission(ref && ref.securityId,2);
      if(p.error)return p.error;
      if(ref.listingId)return unavailable('PRIMARY_LISTING_REQUIRED');
      return client.getPriceSeries(p.ref,{range:seriesOptions && seriesOptions.range || '1Y',basis:p.readiness.priceBasis});
    }
    async function browse() {
      const cards=[];
      for(const id of refs.keys()){
        const p=await permission(id,1);
        if(p.error || p.readiness.DISCOVER!=='READY')continue;
        const found=await identity(id);
        if(found.state==='AVAILABLE')cards.push(projection(found.data));
      }
      if(!cards.length)return unavailable('DISPLAY_RIGHTS_OR_DISCOVER_GATE_CLOSED');
      return available({universeId:'EUROPE',universeLabel:'Europäische Aktien',cards,
        title:'Europäische Aktien',rule:'Geprüfte Heimatlistings mit aktueller Kursbasis. Keine Vermischung mit US-Ranglisten.'});
    }
    async function toggle(id) {
      watch.reload();
      const existing=watch.values().includes(id);
      if(existing)watch.remove(id);
      else{
        const p=await permission(id,1);
        if(p.error)return p.error;
        watch.add(id);
      }
      watch.save();
      return available({securityId:id,saved:!existing});
    }
    function savedIds(){return watch.reload();}
    function remove(id){watch.reload();watch.remove(id);watch.save();return savedIds();}
    async function saved() {
      const members=[];
      for(const id of savedIds()){
        const found=await identity(id);
        members.push(found.state==='AVAILABLE'?{securityId:id,name:found.data.identity.name,ticker:found.data.identity.ticker,href:href(id),state:'AVAILABLE'}:
          {securityId:id,name:null,ticker:null,href:null,state:'UNAVAILABLE',reason:'IDENTITY_OR_DISPLAY_UNAVAILABLE'});
      }
      return available({members});
    }
    return {VERSION,universeId:'EUROPE',search,detail,series,browse,toggle,saved,savedIds,remove};
  }
  return {VERSION,create,href,basisLabel};
});
