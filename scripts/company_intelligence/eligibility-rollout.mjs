import {eligibilityByTicker} from './universe-approval.mjs';
import {runInNewContext} from 'node:vm';
export function eligibilityRollout(text,manifest,{canary=false}={}){
 const map=eligibilityByTicker(manifest);
 if(!text.includes('const eligibility = null;'))throw Error('ELIGIBILITY_ROLLOUT_MARKER_MISSING');
 const result=text.replace('const eligibility = null;','const eligibility = '+JSON.stringify(map)+';')
  .replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+manifest.generation+'$2');
 const value=canary?result.replace(/const config = \{stage:[01],(?:productionOff:true,)?/,'const config = {stage:1,'):result;
 const sandbox={URLSearchParams};runInNewContext(value,sandbox,{timeout:2000});
 const gate=sandbox.VUCompanyIntelligenceRollout;
 if(gate.expectedGeneration!==manifest.generation||manifest.tickers.some(t=>!gate.enabled(t))||gate.enabled('ZZZZZ'))throw Error('ELIGIBILITY_RUNTIME_GATE_INVALID');
 return value;
}
