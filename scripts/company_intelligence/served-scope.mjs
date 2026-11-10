/* Live-Nachweis des ausgelieferten Umfangs (Rueckweg des Universe-Release, company-intelligence-universe-release.yml).
 * Nach restore46 + Gate-Oeffnung muss die Seite genau die zurueckgestellte Generation mit 46 Titeln / 45 Emittenten ausliefern
 * (Pruefung Steuerung 09.11.2026 zu #1744, BLOCKER). Nur lesend. Exit 0 = belegt, 1 = nicht belegt. */
import {pathToFileURL} from 'node:url';
export const DELIVERY_URL='https://research.visionuniverse.de/company-intelligence-delivery.json';
/** Rein: Auslieferung gegen Erwartung. */
export function scopeServed(delivery,{generation,stocks,issuers}){
 if(!delivery||typeof delivery!=='object')return {ok:false,reason:'DELIVERY_NOT_JSON'};
 if(delivery.status!=='PASS')return {ok:false,reason:'DELIVERY_STATUS_'+String(delivery.status)};
 if(delivery.generation!==generation)return {ok:false,reason:'GENERATION_MISMATCH'};
 if(delivery.cohortStocks!==stocks||delivery.issuers!==issuers)return {ok:false,reason:'SCOPE_MISMATCH'};
 return {ok:true,reason:null};
}
export async function main(argv=process.argv.slice(2),fetcher=fetch){
 const arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:null;};
 const want={generation:arg('--expected'),stocks:Number(arg('--stocks')),issuers:Number(arg('--issuers'))};
 if(!/^[a-f0-9]{24}$/.test(want.generation||'')||!Number.isInteger(want.stocks)||!Number.isInteger(want.issuers))return {ok:false,reason:'USAGE'};
 let d=null;
 try{const r=await fetcher(DELIVERY_URL+'?scope='+Date.now(),{signal:AbortSignal.timeout(15000)});d=r.ok?await r.json():null;}catch{d=null;}
 return scopeServed(d,want);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=await main();console.log(JSON.stringify(r));process.exitCode=r.ok?0:1;
}
