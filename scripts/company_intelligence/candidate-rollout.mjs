/* Browser-local canary only. Never changes durable or served production gates. */
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {frozenTickers} from './refresh-approval.mjs';
export function candidateRollout(text,generation){
 assert(/^[a-f0-9]{24}$/.test(generation),'INVALID_CANDIDATE_GENERATION');
 const sandbox={URLSearchParams};runInNewContext(text,sandbox,{timeout:1000});
 assert.deepEqual(Array.from(sandbox.VUCompanyIntelligenceRollout?.cohort||[]).sort(),[...frozenTickers].sort(),'CANDIDATE_COHORT_MISMATCH');
 assert(/const config = \{stage:[01],/.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 assert(/expectedGeneration:\s*['"][a-f0-9]{24}['"]/.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 return text.replace(/const config = \{stage:[01],(?:productionOff:true,)?/,'const config = {stage:1,')
  .replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+generation+'$2');
}
