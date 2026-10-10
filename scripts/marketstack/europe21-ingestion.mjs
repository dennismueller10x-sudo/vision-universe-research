/** Europe2.1 targeted collection. Distinct fixed one-use allocations; no scheduled refresh. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicKey, verify, constants } from 'node:crypto';
import { ingestEurope, validatePlan, hash } from './europe-ingestion.mjs';
import { createEuropeBudget } from './europe-credits.mjs';

export const EUROPE21_BRANCH = 'marketstack-europe21-ingestion';
export const EUROPE21_TARGET = 10000;
export const EUROPE21_HARD_CAP = 18000;
export const EUROPE21_ALLOCATIONS = Object.freeze({ phase1: 6000, phase2: 8000, phase3: 4000 });
export const EUROPE21_TRIGGER = 'scripts/marketstack/europe21-live-trigger.json';

export function validateEurope21Plan(envelope) {
  if (envelope?.version !== 21 || !Object.hasOwn(EUROPE21_ALLOCATIONS, envelope.phase) ||
      envelope.maxCredits !== EUROPE21_ALLOCATIONS[envelope.phase] || envelope.targetCredits !== EUROPE21_TARGET ||
      envelope.hardCap !== EUROPE21_HARD_CAP || !/^[a-f0-9]{40}$/.test(envelope.baselineMain || '')) throw Error('EUROPE21_INVALID_ALLOCATION');
  if (Object.values(EUROPE21_ALLOCATIONS).reduce((a,b) => a+b,0) !== EUROPE21_HARD_CAP) throw Error('EUROPE21_ALLOCATION_DRIFT');
  // Reuse the reviewed transport, keeping its legacy plan type internal.
  const internal = { version: 1, lease: 'completion', maxCredits: 10000, operations: envelope.operations };
  const estimate = validatePlan(internal);
  if (estimate.estimatedMaximumCredits > envelope.maxCredits) throw Error('EUROPE21_PHASE_BUDGET_EXCEEDED');
  if (envelope.operations.some(op => ['directory','etfs','holdings'].includes(op.kind))) throw Error('EUROPE21_UNIVERSE_OR_ETF_SCRAPE_REFUSED');
  return { ...estimate, internal, phase: envelope.phase, targetCredits: EUROPE21_TARGET, hardCap: EUROPE21_HARD_CAP, maxCredits: envelope.maxCredits };
}

export function europe21SignedPayload(marker) {
  return JSON.stringify({version:21,branch:EUROPE21_BRANCH,phase:marker.phase,sourceSha:marker.sourceSha,
    planHash:marker.planHash,baselineMain:marker.baselineMain,targetCredits:EUROPE21_TARGET,hardCap:EUROPE21_HARD_CAP,
    maxCredits:EUROPE21_ALLOCATIONS[marker.phase]});
}

export function verifyEurope21Marker(marker,{before,parents,changedPaths,envelope,publicKey,runs=[],runId,workflowId,runAttempt,headSha}={}) {
  validateEurope21Plan(envelope);
  if (marker?.version !== 21 || marker.phase !== envelope.phase || marker.baselineMain !== envelope.baselineMain ||
      marker.sourceSha !== before || !/^[a-f0-9]{40}$/.test(before || '') || parents?.length !== 1 || parents[0] !== before ||
      changedPaths?.length !== 1 || changedPaths[0] !== EUROPE21_TRIGGER || marker.planHash !== hash(JSON.stringify(envelope))) throw Error('EUROPE21_SOURCE_MISMATCH');
  if (!verify('sha256',Buffer.from(europe21SignedPayload(marker)),{key:createPublicKey(publicKey),padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(marker.signature || '', 'base64'))) throw Error('EUROPE21_SIGNATURE_INVALID');
  const title = 'Marketstack Europe21 '+marker.phase;
  const validId = x => /^\d+$/.test(String(x)) && Number.isSafeInteger(Number(x)) && Number(x)>0;
  if (String(runAttempt)!=='1' || !validId(runId) || !validId(workflowId) || !/^[a-f0-9]{40}$/.test(headSha||'') || !Array.isArray(runs) || !runs.length ||
      runs.some(r => !validId(r.id) || !validId(r.workflow_id) || String(r.workflow_id)!==String(workflowId) || r.head_branch!==EUROPE21_BRANCH) ||
      new Set(runs.map(r=>String(r.id))).size!==runs.length ||
      !runs.some(r => String(r.id)===String(runId) && r.display_title===title && r.head_sha===headSha && r.event==='push' && r.run_attempt===1)) throw Error('EUROPE21_HISTORY_UNVERIFIED');
  if (runs.some(r => r.display_title === title && Number(r.id) < Number(runId))) throw Error('EUROPE21_PHASE_REPLAY_REFUSED');
  const phases=Object.keys(EUROPE21_ALLOCATIONS),preceding=phases.slice(0,phases.indexOf(marker.phase));
  if (preceding.some(p => !runs.some(r => r.display_title === 'Marketstack Europe21 '+p && r.conclusion === 'success' && Number(r.id)<Number(runId)))) throw Error('EUROPE21_PRECEDING_PHASE_REQUIRED');
  return true;
}

export async function ingestEurope21({envelope,out,apiKey,fetchImpl,budgetFactory,sleep}={}) {
  envelope=structuredClone(envelope);
  const config = validateEurope21Plan(envelope);
  const summary = await ingestEurope({ plan: config.internal, out, apiKey, fetchImpl, sleep,
    budgetFactory: budgetFactory ?? ((file) => createEuropeBudget(file,{maxCredits:config.maxCredits,
      targetCredits:EUROPE21_TARGET,hardCap:EUROPE21_HARD_CAP,runId:'europe21-'+config.phase})) });
  const finalSummary={...summary, version:'marketstack-europe21-ingestion-1',phase:config.phase,runPlanHash:hash(JSON.stringify(envelope)),
    baselineMain:envelope.baselineMain,additionalCreditPolicy:{targetCredits:EUROPE21_TARGET,hardCap:EUROPE21_HARD_CAP,
      maxCredits:config.maxCredits,allocations:EUROPE21_ALLOCATIONS},oldRunCreditsIncluded:false};
  writeFileSync(join(out,'summary.json'),JSON.stringify(finalSummary)+'\n',{mode:0o600});
  return finalSummary;
}
