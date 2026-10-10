/* Canonical Discover admission independent of analysis gates. */
(function(root,factory){
  'use strict';
  const Contract=typeof module==='object'&&module.exports?require('./contract.js'):root.VUDiscover.Contract;
  const api=factory(Contract);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VUDiscover=root.VUDiscover||{};root.VUDiscover.EuropeProduct=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Contract){
  'use strict';
  const VERSION='discover-europe-product-2.0.0';
  const QUANT_MISSING='Quant-Analyse für dieses Wertpapier noch nicht verfügbar.';
  const TECHNICAL_MISSING='Technische Analyse für dieses Wertpapier noch nicht verfügbar.';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const unavailable=reason=>({state:'UNAVAILABLE',reason,source:'VU_CANONICAL_EUROPE',asOf:null,data:null,publicationAllowed:false});
  const href=id=>'#/s/EUROPE/'+encodeURIComponent(id);
  const discoverBasis=r=>r.discoverPriceBasis||r.priceBasis;
  const basisLabel=basis=>basis==='CANONICAL_SPLIT_ADJUSTED'?'split-bereinigt · kanonisch geprüft':'unbereinigt · Anpassungsbasis nicht bestätigt';
  function create(options){
    const opts=options||{},client=opts.client,watch=opts.watchlist;
    const audience=opts.audience||'public',privatePreview=audience==='research'&&opts.privateResearch===true;
    const cutoff=opts.now?String(opts.now).slice(0,10):null;
    if(cutoff&&!Number.isFinite(Date.parse(opts.now)))throw Error('VALID_EVALUATION_TIME_REQUIRED');
    if(!['public','research'].includes(audience)||(audience==='research'&&!privatePreview))throw Error('EXPLICIT_PRIVATE_RESEARCH_PREVIEW_REQUIRED');
    if(!client||['getSecurity','getReadiness','getPriceSeries','getLatestPrice','search'].some(name=>typeof client[name]!=='function'))throw Error('EUROPE_CORE_CONTRACT_REQUIRED');
    if(!watch||['add','save','reload','remove','values'].some(name=>typeof watch[name]!=='function'))throw Error('EUROPE_CANONICAL_WATCHLIST_REQUIRED');
    if(!Array.isArray(opts.securityRefs))throw Error('EUROPE_CANONICAL_REFERENCES_REQUIRED');
    const refs=new Map(),cache=new Map();
    opts.securityRefs.forEach(value=>{
      const id=typeof value==='string'?value:value&&value.securityId;
      if(typeof id!=='string'||!id||refs.has(id)||(typeof value==='object'&&value.region&&value.region!=='EUROPE'))throw Error('INVALID_EUROPE_CANONICAL_REFERENCE');
      refs.set(id,{region:'EUROPE',securityId:id});
    });
    const available=(data,asOf)=>({state:'AVAILABLE',reason:null,source:'VU_CANONICAL_EUROPE',asOf:asOf||null,data,audience,privatePreview,publicationAllowed:!privatePreview});
    async function permission(id){
      const ref=refs.get(id);if(!ref)return {error:unavailable('CANONICAL_ID_NOT_ACCEPTED')};
      const result=await client.getReadiness(ref),r=result.data;
      if(result.state!=='AVAILABLE'||!r)return {error:unavailable('DISPLAY_RIGHTS_OR_PRODUCT_GATE_CLOSED')};
      if(!privatePreview&&(!Number.isInteger(r.publicTier)||r.publicTier<2))return {error:unavailable('DISPLAY_RIGHTS_OR_PRODUCT_GATE_CLOSED')};
      if(r.UNIVERSE_IDENTITY_READY!==true||r.DISCOVER_ELIGIBLE!==true||!['CHART_READY','CHART_LIMITED'].includes(r.CHART))
        return {error:unavailable('DISCOVER_ADMISSION_REQUIRED')};
      return {ref,readiness:r};
    }
    function meaningful(result,i,r){
      const d=result.data,points=d&&d.points;
      if(result.state!=='AVAILABLE'||!d||d.securityId!==i.securityId||d.listingId!==i.listingId||d.currency!==i.currency||d.basis!==discoverBasis(r)||(d.quoteUnit&&d.quoteUnit!==i.currency)||
        !['RAW_UNADJUSTED','CANONICAL_SPLIT_ADJUSTED'].includes(d.basis)||!Array.isArray(points)||points.length<20)return false;
      for(let n=0;n<points.length;n++){
        const p=points[n];
        if(!Array.isArray(p)||!/^\d{4}-\d{2}-\d{2}$/.test(p[0])||!Number.isFinite(Date.parse(p[0]))||new Date(p[0]).toISOString().slice(0,10)!==p[0]||
          p[0]>(cutoff||new Date().toISOString().slice(0,10))||typeof p[1]!=='number'||!Number.isFinite(p[1])||p[1]<=0||(n>0&&points[n-1][0]>=p[0]))return false;
      }
      if(d.segments!==undefined){
        if(!Array.isArray(d.segments)||!d.segments.length)return false;
        const flat=d.segments.flat();
        if(d.segments.some(segment=>!Array.isArray(segment)||!segment.length)||flat.length!==points.length||
          flat.some((point,n)=>!Array.isArray(point)||point[0]!==points[n][0]||point[1]!==points[n][1]))return false;
      }
      return d.from===points[0][0]&&d.to===points[points.length-1][0]&&Date.parse(d.to)-Date.parse(d.from)>=30*86400000;
    }
    async function admitted(id){
      const p=await permission(id);if(p.error)return p.error;
      const key=id+'\n'+discoverBasis(p.readiness);
      if(!cache.has(key))cache.set(key,(async()=>{
        const identity=await client.getSecurity(p.ref),i=identity.data;
        if(identity.state!=='AVAILABLE'||i.securityId!==id||i.region!=='EUROPE')return unavailable('EUROPE_IDENTITY_CONTRACT_MISMATCH');
        const chart=await client.getPriceSeries(p.ref,{range:'1Y',basis:discoverBasis(p.readiness)});
        if(!meaningful(chart,i,p.readiness))return unavailable('MEANINGFUL_CANONICAL_CHART_REQUIRED');
        const price=await client.getLatestPrice(p.ref),d=price.data;
        if(price.state!=='AVAILABLE'||d.securityId!==id||d.listingId!==i.listingId||d.currency!==i.currency||(d.quoteUnit&&d.quoteUnit!==i.currency)||d.basis!==chart.data.basis||
          d.date!==chart.data.to||d.close!==chart.data.points[chart.data.points.length-1][1])return unavailable('CANONICAL_LATEST_PRICE_MISMATCH');
        let logo=null;
        if(typeof client.getLogo==='function'){const l=await client.getLogo(p.ref);if(l.state==='AVAILABLE'&&l.data.status==='LOGO_VALID')logo=l.data.key||null;}
        return available({identity:i,chart,price:d,logoKey:logo});
      })().catch(()=>unavailable('CANONICAL_DISCOVER_INPUT_UNAVAILABLE')));
      const result=await cache.get(key);
      if(result.state!=='AVAILABLE'){cache.delete(key);return result;}
      const [identity,price]=await Promise.all([client.getSecurity(p.ref),client.getLatestPrice(p.ref)]);
      const current=await permission(id);
      if(current.error)return current.error;
      const i=identity.data,d=price.data,old=result.data;
      if(identity.state!=='AVAILABLE'||!i||i.region!=='EUROPE'||price.state!=='AVAILABLE'||!d||
        ['securityId','listingId','companyId','currency','isin','mic'].some(field=>i[field]!==old.identity[field])||
        d.securityId!==id||d.listingId!==i.listingId||d.currency!==i.currency||(d.quoteUnit&&d.quoteUnit!==i.currency)||d.basis!==discoverBasis(current.readiness)||
        d.date!==old.price.date||d.close!==old.price.close||!meaningful(old.chart,i,current.readiness)){
        cache.delete(key);return unavailable('DISCOVER_ADMISSION_CHANGED');
      }
      return available({...copy(old),readiness:current.readiness});
    }
    function projection(data){
      const i=data.identity,r=data.readiness,price=data.price;
      const stock=Contract.normalizeStock({symbol:i.ticker,securityId:i.securityId,instrumentId:i.instrumentId,companyName:i.name,
        universeId:'EUROPE',dataMode:'real',currency:i.currency,exchange:i.exchange||i.mic,price:price.close,changePercent:price.changePercent});
      return Object.assign(stock,{region:'EUROPE',companyId:i.companyId,listingId:i.listingId,country:i.country,isin:i.isin,
        europeRef:refs.get(i.securityId),href:href(i.securityId),logoKey:data.logoKey,universeLabel:'Europäische Aktien',
        scores:{leadership:null,momentum:null,relativeStrength:null,breakout:null},ranks:{},
        fundamentals:{available:false,message:'Für dieses Wertpapier liegen noch keine vollständig geprüften und zugeordneten Fundamentaldaten vor.'},
        technicalIntelligence:{layers:{}},quantAvailable:false,technicalAvailable:false,quantMessage:QUANT_MISSING,technicalMessage:TECHNICAL_MISSING,
        why:[],indexMemberships:[],readiness:r,discoveryEligible:true,asOf:price.date,priceBasis:price.basis,basisLabel:basisLabel(price.basis),
        chartStatus:r.CHART,freshness:r.discoverFreshness||price.freshness,sessionLag:r.sessionLag??null,provenance:price.provenance,privatePreview,
        series:{source:'vu-core-europe',ref:refs.get(i.securityId),priceSeriesType:price.basis},
        disclaimer:privatePreview?'Private Recherche-Vorschau · nicht öffentlich freigegeben.':'Informationen zur eigenen Recherche. Keine Anlageempfehlung.'});
    }
    async function search(query){
      let open=false;
      for(const id of refs.keys()){if(!(await permission(id)).error){open=true;break;}}
      if(!open)return unavailable('DISPLAY_RIGHTS_OR_PRODUCT_GATE_CLOSED');
      const result=await client.search(query,{limit:100});if(result.state!=='AVAILABLE')return result;
      const entries=[],seen=new Set();
      for(const hit of result.data.results||[]){
        if(seen.has(hit.securityId))continue;seen.add(hit.securityId);
        const found=await admitted(hit.securityId);if(found.state!=='AVAILABLE')continue;
        const i=found.data.identity;
        entries.push({s:i.securityId,n:i.name,displaySymbol:i.ticker,m:true,a:i.mic,sec:null,r:null,d:null,h:false,w:null,
          region:'EUROPE',href:href(i.securityId),logoKey:found.data.logoKey});
      }
      const q=String(query||'').trim().toUpperCase();entries.sort((a,b)=>Number(b.displaySymbol===q)-Number(a.displaySymbol===q));
      return available({universeId:'EUROPE',universeLabel:'Europäische Aktien',entries:entries.slice(0,14)});
    }
    async function detail(id){const found=await admitted(id);return found.state==='AVAILABLE'?available(projection(found.data),found.data.price.date):found;}
    async function series(ref,seriesOptions){
      if(!ref||ref.region!=='EUROPE'||ref.listingId)return unavailable('PRIMARY_EUROPE_CANONICAL_REFERENCE_REQUIRED');
      const found=await admitted(ref.securityId);if(found.state!=='AVAILABLE')return found;
      const range=seriesOptions&&seriesOptions.range||'1Y';
      if(range==='1Y')return available(copy(found.data.chart.data),found.data.chart.asOf);
      const result=await client.getPriceSeries(refs.get(ref.securityId),{range,basis:discoverBasis(found.data.readiness)});
      const current=await permission(ref.securityId);if(current.error)return current.error;
      return meaningful(result,found.data.identity,current.readiness)?available(copy(result.data),result.asOf):unavailable('MEANINGFUL_CANONICAL_CHART_REQUIRED');
    }
    async function browse(){
      const cards=[];
      for(const id of refs.keys()){const found=await admitted(id);if(found.state==='AVAILABLE')cards.push(projection(found.data));}
      if(!cards.length)return unavailable('DISPLAY_RIGHTS_OR_DISCOVER_GATE_CLOSED');
      return available({universeId:'EUROPE',universeLabel:'Europäische Aktien',cards,title:'Europäische Aktien',
        rule:privatePreview?'Private Recherche-Vorschau · nicht öffentlich freigegeben.':'Geprüfte Heimatlistings mit nutzbarem Chart. Keine Vermischung mit US-Ranglisten.'});
    }
    async function toggle(id){
      watch.reload();const existing=watch.values().includes(id);
      if(existing)watch.remove(id);
      else{const found=await admitted(id);if(found.state!=='AVAILABLE')return found;watch.add(id);}
      watch.save();return available({securityId:id,saved:!existing});
    }
    function savedIds(){return watch.reload();}
    function remove(id){watch.reload();watch.remove(id);watch.save();return savedIds();}
    async function saved(){
      const members=[];
      for(const id of savedIds()){
        const found=await admitted(id),i=found.data&&found.data.identity;
        members.push(found.state==='AVAILABLE'?{securityId:id,name:i.name,ticker:i.ticker,href:href(id),state:'AVAILABLE'}:
          {securityId:id,name:null,ticker:null,href:null,state:'UNAVAILABLE',reason:'DISCOVER_OR_DISPLAY_UNAVAILABLE'});
      }
      return available({members});
    }
    return {VERSION,universeId:'EUROPE',audience,privatePreview,search,detail,series,browse,toggle,saved,savedIds,remove};
  }
  return {VERSION,create,href,basisLabel,QUANT_MISSING,TECHNICAL_MISSING};
});
