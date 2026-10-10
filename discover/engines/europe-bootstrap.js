/* Public Europe reads only producer-owned canonical display artifacts. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.VUDiscover.EuropeBootstrap=api;api.start().catch(()=>{});}
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const BASE='/discover/data/europe/',scripts=new Map();
  function localURL(value){
    if(typeof value!=='string'||!(value.startsWith(BASE)||value==='/core/rights/marketstack-display.json')||value.includes('\\')||/%2f|%5c|%2e/i.test(value))throw Error('EUROPE_LOCAL_ARTIFACT_REQUIRED');
    const url=new URL(value,'https://vu.invalid');
    if(url.origin!=='https://vu.invalid'||!(url.pathname.startsWith(BASE)||url.pathname==='/core/rights/marketstack-display.json')||url.search||url.hash)throw Error('EUROPE_LOCAL_ARTIFACT_REQUIRED');
    return url.pathname;
  }
  async function sha(bytes){return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
  async function read(binding){
    if(!binding||!/^\w{64}$/.test(binding.sha256)||!/^[a-f0-9]{64}$/.test(binding.sha256))throw Error('EUROPE_ARTIFACT_HASH_REQUIRED');
    const response=await root.fetch(localURL(binding.url),{cache:'no-cache',credentials:'same-origin'});
    if(!response.ok)throw Error('EUROPE_ARTIFACT_UNAVAILABLE');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>30000000||await sha(bytes)!==binding.sha256)throw Error('EUROPE_ARTIFACT_HASH_MISMATCH');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function loadScript(path){
    if(path==='/core/identity.js'&&root.VUCore&&root.VUCore.Identity||path==='/core/client.js'&&root.VUCore&&root.VUCore.Client)return Promise.resolve();
    if(!scripts.has(path))scripts.set(path,new Promise((resolve,reject)=>{const script=root.document.createElement('script');script.src=path;script.onload=resolve;script.onerror=()=>reject(Error('EUROPE_CORE_UNAVAILABLE'));root.document.head.append(script);}));
    return scripts.get(path);
  }
  function validRights(rights){return !!rights&&rights.display===true&&rights.commercial===true&&typeof rights.evidenceRef==='string'&&rights.evidenceRef.length>0&&Array.isArray(rights.dataPaths)&&rights.dataPaths.includes('IDENTITY')&&rights.dataPaths.includes('RAW_EOD')&&rights.dataPaths.every(v=>['IDENTITY','RAW_EOD'].includes(v));}
  function boundRights(registry,rights){
    return validRights(rights)&&registry&&registry.schema==='vu-marketstack-display-rights-1'&&registry.status==='CONFIRMED_BY_OWNER'&&registry.source==='OWNER_ATTESTATION'&&registry.permittedUse==='NORMALIZED_PRODUCT_DISPLAY'&&registry.rawRedistribution===false&&registry.evidenceRef===rights.evidenceRef&&registry.display===rights.display&&registry.commercial===rights.commercial&&Array.isArray(registry.dataPaths)&&JSON.stringify(registry.dataPaths.slice().sort())===JSON.stringify(rights.dataPaths.slice().sort());
  }
  function validateCatalog(manifest,catalog){
    if(!catalog||!Array.isArray(catalog.securities)||!catalog.securities.length||catalog.securities.some(s=>s.region!=='EUROPE'||typeof s.securityId!=='string'))throw Error('EUROPE_DISPLAY_CATALOG_REQUIRED');
    const ids=catalog.securities.map(s=>s.securityId),published=Object.keys(manifest.series);
    if(manifest.securityCount!==ids.length||new Set(ids).size!==ids.length||published.length!==ids.length||ids.some(id=>!manifest.series[id]))throw Error('EUROPE_PUBLISHED_SERIES_CATALOG_MISMATCH');
    return ids;
  }
  function create(manifest){
    if(!manifest||manifest.publicationAllowed!==true||!validRights(manifest.rights)||!manifest.catalog||!manifest.series||!manifest.calendar||!manifest.rightsEvidence||manifest.rightsEvidence.url!=='/core/rights/marketstack-display.json')throw Error('EUROPE_PUBLIC_RIGHTS_REQUIRED');
    let ready;
    async function connect(){
      if(!ready)ready=(async()=>{
        const rightsEvidence=await read(manifest.rightsEvidence);
        if(!boundRights(rightsEvidence,manifest.rights))throw Error('EUROPE_RIGHTS_REGISTRY_MISMATCH');
        let catalog=await read(manifest.catalog);
        validateCatalog(manifest,catalog);
        await loadScript('/core/identity.js');await loadScript('/core/client.js');
        await loadScript('/core/europe-discover-eligibility.js');await loadScript('/core/europe-session-proof.js');await loadScript('/core/europe-market-data.js');
        const calendar=await read(manifest.calendar);catalog=root.VUCore.EuropeSessionProof.refreshCatalog(catalog,calendar,{now:new Date().toISOString()});
        const Core=root.VUCore.EuropeMarketData,cache=new Map(),logoCache=new Map();
        const usClient=root.VUDiscover.usMarketDataClient||root.VUCore.Client.create({load:path=>root.QuantShell.loadJSON(path),universeId:'US_REAL'});
        const client=Core.create({catalog,rights:manifest.rights,audience:'public',usClient,logoResolver:async key=>{
          const asset=manifest.logos&&manifest.logos[key];if(!asset||typeof asset.path!=='string'||!/^\/discover\/logos\/[A-Za-z0-9_./-]+$/.test(asset.path)||asset.path.includes('..')||!/^[a-f0-9]{64}$/.test(asset.sha256))return null;
          if(!logoCache.has(key))logoCache.set(key,(async()=>{const response=await root.fetch(asset.path);if(!response.ok)throw Error('EUROPE_LOGO_UNAVAILABLE');const bytes=await response.arrayBuffer();if(await sha(bytes)!==asset.sha256||bytes.byteLength!==asset.bytes)throw Error('EUROPE_LOGO_HASH_MISMATCH');return asset;})().catch(()=>null));return logoCache.get(key);
        },loadSeries:async request=>{
          const binding=request.range==='1Y'?manifest.series[request.securityId]:manifest.history&&manifest.history[request.securityId]&&manifest.history[request.securityId][request.range];
          if(!binding||request.basis!=='RAW_UNADJUSTED')throw Error('EUROPE_SERIES_NOT_PUBLISHED');
          const key=binding.sha256;
          if(!cache.has(key))cache.set(key,read(binding).catch(error=>{cache.delete(key);throw error;}));
          return cache.get(key);
        }});
        const product=root.VUDiscover.App.configureEurope({client,watchlist:Core.createWatchlist({catalog,storage:root.localStorage}),securityRefs:catalog.securities.map(s=>s.securityId),audience:'public'});
        root.VUDiscover.publicEuropeManifest=manifest;return product;
      })().catch(error=>{ready=null;throw error;});
      return ready;
    }
    return {connect,async authority(){const [registry,calendar]=await Promise.all([read(manifest.rightsEvidence),read(manifest.calendar)]);return {allowed:boundRights(registry,manifest.rights),catalogSha256:manifest.catalog.sha256,calendar};}};
  }
  async function start(){
    const registryResponse=await root.fetch('/core/registry/domains.json',{cache:'no-cache',credentials:'same-origin'});
    if(!registryResponse.ok)return null;
    const registry=await registryResponse.json();
    if(!Array.isArray(registry.domains)||!registry.domains.some(domain=>domain&&domain.id==='europeDiscoverDisplay'&&domain.artifact===BASE+'manifest.json'&&domain.producer==='scripts/marketstack/europe-discover-publication.mjs'))return null;
    const response=await root.fetch(BASE+'manifest.json',{cache:'no-cache',credentials:'same-origin'});
    if(!response.ok)return null;
    const manifest=await response.json(),loader=create(manifest);
    root.VUDiscover.europePublicLoader=loader;
    root.document.dispatchEvent(new Event('vu-europe-available'));
    if(/#\/(?:s|c|u|watchlist)\/EUROPE(?:\/|$)/.test(root.location.hash))await loader.connect();
    return loader;
  }
  return {start,create,read,localURL,validRights,boundRights,validateCatalog};
});
