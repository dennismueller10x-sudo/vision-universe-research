/* `refresh-run.mjs observe`: bestaetigt nach bestandener Live-Pruefung, dass die Produktion die GOOD-Generation ausliefert,
 * und schreibt die Beobachtung (`observed.json`, optional health.json).
 *
 * WARUM (Lauf 39128011059, 18.10.2026): Auslieferung und Live-Pruefung (16 Faelle) waren bestanden, danach scheiterte nur
 * dieser Schritt. Ein leeres catch{} verschluckte die Ursache (nur CONTINUOUS_REFRESH_FAILED); der Fail-closed-Pfad wertete
 * den Exit 1 als Produktionsfehler, rollte zurueck und schloss das Gate.
 *
 * Klassen (jeder Fehler traegt einen Code, der im Log steht):
 *  REAL         Exit 1. Produktion nicht belegbar: Live-Auslieferung nach begrenzter Wiederholung nicht lesbar
 *               (HTTP-Fehler, HTML statt JSON, Netz), ausgelieferte Generation != GOOD (nach Wiederholung), GOOD in R2
 *               nicht lesbar. Bleibt fail-closed.
 *  BOOKKEEPING  Exit 3. Produktion belegt (Generation == GOOD), nur das Festhalten scheitert: Schreiben/Zuruecklesen von
 *               observed.json, Schreiben von health.json. Kein Grund, ein gesundes Gate zu schliessen.
 * Gelesen wird nur (HTTP GET, R2 get); geschrieben werden nur observed.json und health.json. */
export const CLASS=Object.freeze({REAL:'REAL',BOOKKEEPING:'BOOKKEEPING'});
export const EXIT=Object.freeze({PASS:0,REAL:1,BOOKKEEPING:3});
const DELIVERY='https://research.visionuniverse.de/company-intelligence-delivery.json?observe=';
const codeOf=e=>/^[A-Z0-9_:-]+$/.test(e?.message||'')?e.message:(e?.code||e?.name||'UNKNOWN');
const fail=(cls,code,extra={})=>({status:'FAIL',class:cls,code,exitCode:EXIT[cls],...extra});

/** Liest delivery.json einmal. Wirft nie; liefert {generation} oder {error}. */
export async function readDelivery(fetcher=fetch){
 let r;
 try{r=await fetcher(DELIVERY+Date.now(),{signal:AbortSignal.timeout(30000)});}
 catch(e){return {error:e?.name==='TimeoutError'||e?.name==='AbortError'?'DELIVERY_TIMEOUT':'DELIVERY_FETCH_FAILED'};}
 if(!r.ok)return {error:'DELIVERY_HTTP_'+(Number.isInteger(r.status)?r.status:'ERROR')};
 let d;try{d=await r.json();}catch{return {error:'DELIVERY_NOT_JSON'};}
 if(!d||typeof d!=='object'||typeof d.generation!=='string')return {error:'DELIVERY_NOT_JSON'};
 return {generation:d.generation};
}

/**
 * @param o.readGood      async ()=>{ns,good}   (activeNamespace + goodState)
 * @param o.driver        {get,put}             fuer observed.json
 * @param o.keyFor        (ns)=>Schluessel von observed.json
 * @param o.fetcher       fetch-kompatibel
 * @param o.saveHealth    optional (observation)=>void
 * @param o.sameGenerationOnly  bisherige Option: ohne passende Vorbeobachtung nur aufschieben
 * @param o.attempts/o.delayMs/o.sleep  begrenzte Wiederholung fuer Lesefehler und Generationsabweichung (CDN-Kanten)
 */
export async function observeProduction({readGood,driver,keyFor,fetcher=fetch,saveHealth=null,sameGenerationOnly=false,attempts=3,delayMs=20000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>new Date()}){
 let last=null,good=null;
 for(let i=1;i<=attempts;i++){
  if(i>1)await sleep(delayMs);
  let state,key;
  try{state=await readGood();}catch(e){last={code:'GOOD_UNREADABLE:'+codeOf(e)};continue;}
  good=state?.good||null;key=keyFor(state?.ns);
  const d=await readDelivery(fetcher);
  if(d.error){last={code:d.error};continue;}
  if(!good||d.generation!==good.generation){
   if(sameGenerationOnly)return {status:'DEFERRED',code:'OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA',exitCode:EXIT.PASS,attempts:i};
   last={code:'OBSERVED_PRODUCTION_GENERATION_MISMATCH',served:d.generation,good:good?.generation||null};continue;
  }
  // Produktion belegt. Ab hier ist jeder Fehler reine Buchfuehrung.
  if(sameGenerationOnly){
   let prior;
   try{prior=await driver.get(key);}catch(e){return fail(CLASS.BOOKKEEPING,'OBSERVED_READ_FAILED:'+codeOf(e),{generation:d.generation,attempts:i});}
   let priorGen=null;try{priorGen=prior?JSON.parse(Buffer.from(prior).toString('utf8')).generation:null;}catch{}
   if(priorGen!==good.generation)return {status:'DEFERRED',code:'OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA',exitCode:EXIT.PASS,attempts:i};
  }
  const observation={schema:1,generation:d.generation,lastSuccessfulProductionPublication:now().toISOString()};
  const bytes=Buffer.from(JSON.stringify(observation));
  try{
   await driver.put(key,bytes);
   const back=await driver.get(key);
   if(!back||!Buffer.from(back).equals(bytes))throw Error('OBSERVABILITY_READBACK_FAILED');
  }catch(e){return fail(CLASS.BOOKKEEPING,codeOf(e)==='OBSERVABILITY_READBACK_FAILED'?'OBSERVABILITY_READBACK_FAILED':'OBSERVED_WRITE_FAILED:'+codeOf(e),{generation:d.generation,attempts:i});}
  if(saveHealth){try{saveHealth(observation);}catch(e){return fail(CLASS.BOOKKEEPING,'HEALTH_WRITE_FAILED:'+codeOf(e),{generation:d.generation,attempts:i});}}
  return {status:'PASS',generation:d.generation,exitCode:EXIT.PASS,attempts:i};
 }
 return fail(CLASS.REAL,last?.code||'OBSERVE_UNPROVEN',{attempts,served:last?.served,good:last?.good});
}
