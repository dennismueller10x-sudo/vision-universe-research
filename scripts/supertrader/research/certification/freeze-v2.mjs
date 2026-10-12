import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertFreeze} from '../tournament/freeze.mjs';
import {methods,rulebook} from '../tournament/methods.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../../..');
export const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const originalPath='scripts/supertrader/research/tournament/SUPERTRADER-METHOD-FREEZES.json';
const sourceMapPath='scripts/supertrader/research/tournament/SUPERTRADER-LEGENDARY-SOURCE-MAP.json';
const contracts=['ANNUAL-DERIVATION-APPROVALS.json','CERTIFICATION-POLICIES.json','SUPERTRADER-DATA-CONTRACTS.json','SUPERTRADER-EXECUTION-CONTRACTS.json','SUPERTRADER-METHOD-ELIGIBILITY.json','SUPERTRADER-PIT-COVERAGE.json','ANNUAL-FACT-CERTIFICATION-CONTRACT.json','EXECUTION-CERTIFICATION-CONTRACT.json','SUPERTRADER-INDUSTRY-RESIDUAL-CONTRACT-PROOF.json'];
function relevantFiles(){
 const moduleFiles=fs.readdirSync(dir).filter(f=>/\.(mjs|py)$/.test(f)&&f!=='publish-rerun.mjs').map(f=>path.join(dir,f));
 const tests=fs.readdirSync(path.join(root,'scripts/supertrader/tests')).filter(f=>/^certification-.*\.test\.mjs$/.test(f)||f==='test_certification_repack.py').map(f=>path.join(root,'scripts/supertrader/tests',f));
 const reviews=fs.readdirSync(path.join(dir,'reviews')).filter(f=>f.endsWith('.json')).map(f=>path.join(dir,'reviews',f));
 return [...moduleFiles,...tests,...reviews,...contracts.map(f=>path.join(dir,f)),path.join(root,sourceMapPath)].sort().map(f=>path.relative(root,f));
}
export function createFreezeV2({eligibility,inputReceipts,premeasurementReview}){
 const original=JSON.parse(fs.readFileSync(path.join(root,originalPath)));
 assertFreeze(original);
 if(!eligibility?.methods?.length||!Array.isArray(inputReceipts)||!inputReceipts.length)throw new Error('CERTIFICATION_AND_INPUT_RECEIPTS_REQUIRED');
 if(premeasurementReview?.performanceInspected!==false||!['PASS','PASS_WITH_DATA_LIMITS'].includes(premeasurementReview?.status))throw new Error('INDEPENDENT_PREMEASUREMENT_REVIEW_REQUIRED');
 for(const r of inputReceipts)if(!/^[a-f0-9]{64}$/.test(r.sha256||'')||!r.role)throw new Error('SOURCE_RECEIPT_HASH_REQUIRED');
 if(new Set(eligibility.methods.map(m=>m.id)).size!==eligibility.methods.length||methods.some(m=>!eligibility.methods.some(r=>r.id===m.id)))throw new Error('ALL_ENGINE_ELIGIBILITY_ROWS_REQUIRED');
 const participants=eligibility.methods.filter(m=>['ELIGIBLE','PARTIAL'].includes(m.eligibility)).map(m=>m.id);
 if(participants.some(id=>!methods.some(m=>m.id===id)))throw new Error('UNDEFINED_METHOD_CANNOT_MEASURE');
 const protocol=JSON.parse(fs.readFileSync(path.join(dir,'../tournament/protocol.json')));
 const contractBindings={dataContractHash:hash(fs.readFileSync(path.join(dir,'SUPERTRADER-DATA-CONTRACTS.json'))),executionContractHash:hash(fs.readFileSync(path.join(dir,'SUPERTRADER-EXECUTION-CONTRACTS.json'))),costModelHash:hash(JSON.stringify(protocol.execution)),universeContractHash:hash(JSON.stringify({original:protocol.universe,certification:JSON.parse(fs.readFileSync(path.join(dir,'SUPERTRADER-PIT-COVERAGE.json')))})),sourceMapHash:hash(fs.readFileSync(path.join(root,sourceMapPath)))};
 const files=Object.fromEntries(relevantFiles().map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
 return {schema:'supertrader-method-freezes-v2-2.0.0',frozenAt:new Date().toISOString(),codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),frozenBeforeRerunPerformance:true,strategyDefinitionsChanged:false,originalFreeze:{path:originalPath,sha256:hash(fs.readFileSync(path.join(root,originalPath)))},protocolHash:original.protocolHash,sourceMapHashScope:'STANDALONE_LEGENDARY_ARTIFACT_OTHER_SOURCE_REFERENCES_BOUND_BY_ORIGINAL_RULEBOOK_AND_ENGINE_HASHES',files,contractBindings,inputReceipts,premeasurementReview,participants,eligibility,methods:methods.map(m=>({id:m.id,codeHash:hash(JSON.stringify(files)),...contractBindings,definitionVersion:m.version||'1.0.0',rulebook:rulebook(m),rulesHash:hash(JSON.stringify(rulebook(m))),rulebookHash:hash(JSON.stringify(rulebook(m))),originalRulebookHash:original.methods.find(x=>x.id===m.id).rulebookHash,implementationVersion:m.id==='piotroski_value_fscore'?'FY_SOURCE_LINK_BUGFIX_V2':'DATA_EXECUTION_RECEIVER_V2',implementationAdmission:participants.includes(m.id)?'ADMITTED_PARTIAL_PRICE_ENGINE':'BLOCKED_NOT_IN_HISTORICAL_DISPATCH',fundamentalBugfixActivation:m.id==='piotroski_value_fscore'?'REVIEWED_AND_UNIT_TESTED_NOT_ACTIVATED_OR_MEASURED':null,eligibility:eligibility.methods.find(x=>x.id===m.id)?.eligibility||'BLOCKED'}))};
}
export function assertFreezeV2(freeze){
 if(freeze?.frozenBeforeRerunPerformance!==true||freeze?.strategyDefinitionsChanged!==false)throw new Error('RERUN_PRE_PERFORMANCE_FREEZE_REQUIRED');
 if(hash(fs.readFileSync(path.join(root,freeze.originalFreeze.path)))!==freeze.originalFreeze.sha256)throw new Error('ORIGINAL_FREEZE_CHANGED');
 const original=JSON.parse(fs.readFileSync(path.join(root,freeze.originalFreeze.path)));
 assertFreeze(original);
 if(freeze.protocolHash!==original.protocolHash)throw new Error('PROTOCOL_CHANGED');
 if(!Array.isArray(freeze.inputReceipts)||!freeze.inputReceipts.length||freeze.inputReceipts.some(r=>!r.role||!/^[a-f0-9]{64}$/.test(r.sha256||'')))throw new Error('SOURCE_RECEIPT_HASH_REQUIRED');
 if(freeze.premeasurementReview?.performanceInspected!==false||!['PASS','PASS_WITH_DATA_LIMITS'].includes(freeze.premeasurementReview?.status))throw new Error('INDEPENDENT_PREMEASUREMENT_REVIEW_REQUIRED');
 if(!Array.isArray(freeze.eligibility?.methods)||new Set(freeze.eligibility.methods.map(m=>m.id)).size!==freeze.eligibility.methods.length||methods.some(m=>!freeze.eligibility.methods.some(r=>r.id===m.id)))throw new Error('ALL_ENGINE_ELIGIBILITY_ROWS_REQUIRED');
 const admitted=freeze.eligibility.methods.filter(m=>['ELIGIBLE','PARTIAL'].includes(m.eligibility)).map(m=>m.id);
 if(admitted.some(id=>!methods.some(m=>m.id===id))||JSON.stringify(admitted)!==JSON.stringify(freeze.participants))throw new Error('PARTICIPANT_ELIGIBILITY_MISMATCH');
 const required=[sourceMapPath,...contracts.map(f=>'scripts/supertrader/research/certification/'+f),...['freeze-v2.mjs','runner-v2.mjs','fundamental-v2.mjs','execution-audit.mjs','execution-audit-accounting.mjs','annual-facts.mjs','market-equity.mjs','universe-certification.mjs','filing-identity.mjs','fiscal-period-links.mjs','factor-contract.mjs','industry-contract.mjs','run-rerun.mjs','current-rerun.mjs','current-source-receipts.mjs','canonical-input.mjs','data-inventory.mjs','legacy-momentum-execution.mjs'].map(f=>'scripts/supertrader/research/certification/'+f)];
 if(required.some(f=>!/^[a-f0-9]{64}$/.test(freeze.files?.[f]||'')))throw new Error('REQUIRED_FROZEN_COMPONENT_BINDING_MISSING');
 const eligibilityContract=JSON.parse(fs.readFileSync(path.join(dir,'SUPERTRADER-METHOD-ELIGIBILITY.json')));
 if(JSON.stringify(eligibilityContract)!==JSON.stringify(freeze.eligibility))throw new Error('EMBEDDED_ELIGIBILITY_CONTRACT_MISMATCH');
 if(!Array.isArray(freeze.methods)||freeze.methods.length!==methods.length||new Set(freeze.methods.map(m=>m.id)).size!==methods.length)throw new Error('EXACT_METHOD_DEFINITION_SET_REQUIRED');
 for(const [file,want] of Object.entries(freeze.files||{}))if(hash(fs.readFileSync(path.join(root,file)))!==want)throw new Error('CERTIFICATION_FROZEN_COMPONENT_CHANGED');
 const protocol=JSON.parse(fs.readFileSync(path.join(dir,'../tournament/protocol.json')));
 const expectedBindings={dataContractHash:hash(fs.readFileSync(path.join(dir,'SUPERTRADER-DATA-CONTRACTS.json'))),executionContractHash:hash(fs.readFileSync(path.join(dir,'SUPERTRADER-EXECUTION-CONTRACTS.json'))),costModelHash:hash(JSON.stringify(protocol.execution)),universeContractHash:hash(JSON.stringify({original:protocol.universe,certification:JSON.parse(fs.readFileSync(path.join(dir,'SUPERTRADER-PIT-COVERAGE.json')))})),sourceMapHash:hash(fs.readFileSync(path.join(root,sourceMapPath)))};
 if(freeze.methods.some(m=>m.codeHash!==hash(JSON.stringify(freeze.files))))throw new Error('METHOD_CODE_HASH_CHANGED');
 if(Object.entries(expectedBindings).some(([k,v])=>freeze.contractBindings?.[k]!==v||freeze.methods.some(m=>m[k]!==v)))throw new Error('METHOD_CONTRACT_BINDINGS_CHANGED');
 for(const m of methods){const f=freeze.methods.find(x=>x.id===m.id),actual=hash(JSON.stringify(rulebook(m)));if(!f||f.rulebookHash!==actual||f.rulesHash!==actual||hash(JSON.stringify(f.rulebook))!==actual||f.originalRulebookHash!==actual)throw new Error('STRATEGY_DEFINITION_CHANGED');}
 return true;
}
