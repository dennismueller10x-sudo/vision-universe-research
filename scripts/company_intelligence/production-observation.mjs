/* A historical timestamp cannot certify an OFF or different live generation. */
export async function productionObservation(good,observed,fetcher=fetch){
 try{
  const r=await fetcher('https://research.visionuniverse.de/company-intelligence-delivery.json?health='+Date.now(),{signal:AbortSignal.timeout(30000)});
  if(!r.ok)return {state:'UNAVAILABLE',servedGeneration:null};
  const d=await r.json();
  const stocks=good?.manifest?.scope==='PER_ISSUER_ELIGIBILITY'?good.manifest.tickers.length:46;
  const issuers=good?.manifest?.scope==='PER_ISSUER_ELIGIBILITY'?Object.keys(good.manifest.eligibility).length:45;
  if(!good||d.generation!==good.generation||observed.generation!==good.generation||d.cohortStocks!==stocks||d.issuers!==issuers)
   return {state:'MISMATCH',servedGeneration:d.generation||null};
  return {state:'VERIFIED',servedGeneration:d.generation};
 }catch{return {state:'UNAVAILABLE',servedGeneration:null};}
}
