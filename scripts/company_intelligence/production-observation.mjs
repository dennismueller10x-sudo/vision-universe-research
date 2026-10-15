/* A historical timestamp cannot certify an OFF or different live generation.
   States (strictest reading, anything unproven stays UNAVAILABLE = alarm):
   VERIFIED     served delivery matches GOOD and its accepted observation
   MISMATCH     delivery readable but different generation/scope
   GATE_CLOSED  deliberately OFF: delivery.json is HTTP 404 AND the production gate
                object was read cleanly, is valid for this approval and is DISABLED
   UNAVAILABLE  everything else: HTTP error, timeout, HTML/password page, gate read
                or parse failure, gate AVAILABLE/STAGED while delivery is missing.
   `gate` is optional: {read:()=>Promise<bytes|string|null>, approvalId, generation}
   (same read-only R2 driver as the GOOD pointer). Without it GATE_CLOSED is never
   returned. */
const URL_BASE='https://research.visionuniverse.de/company-intelligence-delivery.json?health=';
const GATE_STATES=['AVAILABLE','DISABLED','STAGED'];
export async function readGateState(gate){
 if(!gate||typeof gate.read!=='function')return {gateState:null,gateReason:'GATE_NOT_CHECKED'};
 let raw;
 try{raw=await gate.read();}catch{return {gateState:null,gateReason:'GATE_READ_FAILED'};}
 if(!raw)return {gateState:null,gateReason:'GATE_MISSING'};
 try{
  const g=JSON.parse(Buffer.from(raw).toString('utf8'));
  if(!g||g.schema!==1||g.approvalId!==gate.approvalId||g.generation!==gate.generation||!GATE_STATES.includes(g.state))return {gateState:null,gateReason:'GATE_INVALID'};
  return {gateState:g.state,gateReason:null,gateChangedAt:g.changedAt||null};
 }catch{return {gateState:null,gateReason:'GATE_INVALID'};}
}
export async function productionObservation(good,observed,fetcher=fetch,gate=null){
 const g=await readGateState(gate),out=(state,servedGeneration,reason)=>({state,servedGeneration,reason,gateState:g.gateState,gateReason:g.gateReason,gateChangedAt:g.gateChangedAt||null});
 let r,d;
 try{r=await fetcher(URL_BASE+Date.now(),{signal:AbortSignal.timeout(30000)});}
 catch(error){return out('UNAVAILABLE',null,error?.name==='TimeoutError'||error?.name==='AbortError'?'DELIVERY_TIMEOUT':'DELIVERY_FETCH_FAILED');}
 if(!r.ok){
  if(r.status===404){
   if(g.gateState==='DISABLED')return out('GATE_CLOSED',null,'GATE_DISABLED_DELIVERY_ABSENT');
   return out('UNAVAILABLE',null,g.gateState?'DELIVERY_MISSING_GATE_'+g.gateState:'DELIVERY_MISSING_'+g.gateReason);
  }
  return out('UNAVAILABLE',null,'DELIVERY_HTTP_'+(Number.isInteger(r.status)?r.status:'ERROR'));
 }
 try{d=await r.json();}catch{return out('UNAVAILABLE',null,'DELIVERY_NOT_JSON');}
 if(!d||typeof d!=='object')return out('UNAVAILABLE',null,'DELIVERY_NOT_JSON');
 const stocks=good?.manifest?.scope==='PER_ISSUER_ELIGIBILITY'?good.manifest.tickers.length:46;
 const issuers=good?.manifest?.scope==='PER_ISSUER_ELIGIBILITY'?Object.keys(good.manifest.eligibility).length:45;
 if(!good||d.generation!==good.generation||observed?.generation!==good.generation||d.cohortStocks!==stocks||d.issuers!==issuers)
  return out('MISMATCH',d.generation||null,'DELIVERY_GENERATION_OR_SCOPE_MISMATCH');
 return out('VERIFIED',d.generation,null);
}
