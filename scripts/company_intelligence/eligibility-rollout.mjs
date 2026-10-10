import {eligibilityByTicker} from './universe-approval.mjs';
import {runInNewContext} from 'node:vm';
export function eligibilityRollout(text,manifest,{canary=false}={}){
 const map=eligibilityByTicker(manifest);
 if(!text.includes('const eligibility = null;'))throw Error('ELIGIBILITY_ROLLOUT_MARKER_MISSING');
 const result=text.replace('const eligibility = null;','const eligibility = '+JSON.stringify(map)+';')
  .replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+manifest.generation+'$2');
 const value=canary?result.replace(/const config = \{stage:[01],(?:productionOff:true,)?/,'const config = {stage:1,'):result;
 // Quant embeds the same gate among unrelated scripts. Evaluate this gate only;
 // never execute chart/navigation code in the delivery validation sandbox.
 const marker=value.indexOf('const eligibility = '),begin=value.lastIndexOf('(function(g){',marker),closing=")(typeof globalThis !== 'undefined' ? globalThis : this);";
 const end=value.indexOf(closing,marker);
 if(begin<0||end<0)throw Error('ELIGIBILITY_GATE_BOUNDARY_MISSING');
 const sandbox={URLSearchParams};runInNewContext(value.slice(begin,end+closing.length),sandbox,{timeout:2000});
 const gate=sandbox.VUCompanyIntelligenceRollout;
 if(gate.expectedGeneration!==manifest.generation||manifest.tickers.some(t=>!gate.enabled(t))||gate.enabled('ZZZZZ'))throw Error('ELIGIBILITY_RUNTIME_GATE_INVALID');
 return value;
}
