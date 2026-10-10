/* A historical timestamp cannot certify an OFF or different live generation. */
export async function productionObservation(good,observed,fetcher=fetch){
 try{
  const r=await fetcher('https://research.visionuniverse.de/company-intelligence-delivery.json?health='+Date.now(),{signal:AbortSignal.timeout(30000)});
  if(!r.ok)return {state:'UNAVAILABLE',servedGeneration:null};
  const d=await r.json();
  if(!good||d.generation!==good.generation||observed.generation!==good.generation||d.cohortStocks!==46||d.issuers!==45)
   return {state:'MISMATCH',servedGeneration:d.generation||null};
  return {state:'VERIFIED',servedGeneration:d.generation};
 }catch{return {state:'UNAVAILABLE',servedGeneration:null};}
}
