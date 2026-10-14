/* Browser-local canary only. Never changes durable or served production gates. */
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {frozenTickers} from './refresh-approval.mjs';
// The served file is the release-minified build (pages-release.yml, scripts/vu2/minify-release.mjs):
// `const config={stage:0,productionOff:!0,...` rather than the source's `const config = {stage:1, ...`.
// Both spellings are the same gate. The pattern is anchored (no property/identifier/comment-suffix
// decoys) and the evaluated file must prove the same semantics, so any other shape fails closed.
const CONFIG=/(?<![\w$.])const\s+config\s*=\s*\{stage:\s*[01],(?:\s*productionOff:\s*(?:true|!0),)?/;
const evaluate=text=>{const sandbox={URLSearchParams};runInNewContext(text,sandbox,{timeout:1000});return sandbox.VUCompanyIntelligenceRollout;};
export function candidateRollout(text,generation){
 assert(/^[a-f0-9]{24}$/.test(generation),'INVALID_CANDIDATE_GENERATION');
 const served=evaluate(text);
 assert.deepEqual(Array.from(served?.cohort||[]).sort(),[...frozenTickers].sort(),'CANDIDATE_COHORT_MISMATCH');
 assert(CONFIG.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 assert(/expectedGeneration:\s*['"][a-f0-9]{24}['"]/.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 // Semantics of the evaluated original: OFF is stage 0 with productionOff===true; ON is stage 1 without it.
 assert((served.stage===0&&served.productionOff===true)||(served.stage===1&&!served.productionOff),'CANDIDATE_UI_BASELINE_MISMATCH');
 const patched=text.replace(CONFIG,'const config = {stage:1,')
  .replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+generation+'$2');
 const canary=evaluate(patched);
 assert(canary.stage===1&&!canary.productionOff&&canary.expectedGeneration===generation&&canary.enabled('AAPL')===true&&canary.enabled('ZZZZZ')===false,'CANDIDATE_UI_BASELINE_MISMATCH');
 return patched;
}
