/* Browser-local canary only. Never changes durable or served production gates. */
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {frozenTickers} from './refresh-approval.mjs';
// The served file is the release-minified build (pages-release.yml, scripts/vu2/minify-release.mjs):
// `const config={stage:0,productionOff:!0,...` rather than the source's `const config = {stage:1, ...`.
// Both spellings are the same gate; any other stage or shape still fails closed.
const CONFIG=/const config\s*=\s*\{stage:\s*[01],(?:\s*productionOff:\s*(?:true|!0),)?/;
export function candidateRollout(text,generation){
 assert(/^[a-f0-9]{24}$/.test(generation),'INVALID_CANDIDATE_GENERATION');
 const sandbox={URLSearchParams};runInNewContext(text,sandbox,{timeout:1000});
 assert.deepEqual(Array.from(sandbox.VUCompanyIntelligenceRollout?.cohort||[]).sort(),[...frozenTickers].sort(),'CANDIDATE_COHORT_MISMATCH');
 assert(CONFIG.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 assert(/expectedGeneration:\s*['"][a-f0-9]{24}['"]/.test(text),'CANDIDATE_UI_BASELINE_MISMATCH');
 return text.replace(CONFIG,'const config = {stage:1,')
  .replace(/(expectedGeneration:\s*['"])[a-f0-9]{24}(['"])/,'$1'+generation+'$2');
}
